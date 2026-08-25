-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΔΟΚΙΜΑΣΤΗΣ ΕΙΝΑΙ ΔΩΡΕΑΝ ΓΙΑ ΠΑΝΤΑ, Ο ΒΟΗΘΟΣ ΤΟΥ ΟΧΙ ΑΠΕΡΙΟΡΙΣΤΟΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Η ιδιότητα δοκιμαστή γράφει `tester_since` και το
-- /api/billing/plan δίνει ΟΠΟΙΟΔΗΠΟΤΕ πακέτο δωρεάν, εναλλάξ, χωρίς έμπορο
-- και χωρίς κάρτα. Εδώ όμως το «πληρώνει;» κρίνεται από το ΠΑΚΕΤΟ:
--
--     v_pay := coalesce(v_plan, 'free') in ('solo','owner','agency','office');
--
-- Ο δοκιμαστής που διάλεγε «Επαγγελματίας+» περνούσε λοιπόν ως πληρωμένος
-- συνδρομητής. Επαιρνε 483 ερωτήσεις τον μήνα, δηλαδή ώς 16,76 $ τον μήνα,
-- χωρίς να πληρώσει ποτέ τίποτα. Και δεν μετρούσε ούτε στην κοινή δεξαμενή,
-- που είναι η μόνη ΣΚΛΗΡΗ εγγύηση κόστους των μη πληρωνόντων.
--
-- ΤΙ ΑΛΛΑΖΕΙ ΚΑΙ ΤΙ ΔΕΝ ΑΛΛΑΖΕΙ. Οι ΔΥΝΑΤΟΤΗΤΕΣ του δοκιμαστή μένουν ακέραιες:
-- κρατά όποιο πακέτο θέλει, δωρεάν, για πάντα. Μόνο ο βοηθός αποκτά πακέτο,
-- τριάντα ερωτήσεις τον μήνα, δηλαδή 1,04 $ αντί για 16,76 $.
--
-- ΓΙΑΤΙ `least` ΚΑΙ ΟΧΙ ΑΝΤΙΚΑΤΑΣΤΑΣΗ: ο δοκιμαστής δεν επιτρέπεται να πάρει
-- ΠΕΡΙΣΣΟΤΕΡΑ από το πακέτο που κρατά. Αν αύριο το πακέτο του δίνει λιγότερα
-- από τριάντα, ισχύει το μικρότερο. Το ίδιο ιδίωμα με τη δοκιμή από πάνω.
--
-- ΓΙΑΤΙ Ο ΔΟΚΙΜΑΣΤΗΣ ΔΕΝ ΜΠΑΙΝΕΙ ΣΤΗΝ ΚΟΙΝΗ ΔΕΞΑΜΕΝΗ. Η δεξαμενή προστατεύει
-- από τον ΑΓΝΩΣΤΟ όγκο των περαστικών: δοκιμές, δωρεάν μήνες, Συνεργάτες.
-- Ο δοκιμαστής είναι καλεσμένος με όνομα και με δουλειά να κάνει· να βρίσκει
-- τη Νόα κλειστή επειδή πέρασε κόσμος από την αρχική είναι ακριβώς η δουλειά
-- που του ζητήσαμε, χαλασμένη. Το ταβάνι του είναι το δικό του, ανά άτομο.
--
-- ΠΡΟΣΟΧΗ ΓΙΑ ΤΟ ΜΕΛΛΟΝ: ταβάνι στο ΠΛΗΘΟΣ των δοκιμαστών δεν υπάρχει πουθενά.
-- Η διαδρομή εξαργύρωσης μετρά πέντε ΠΡΟΣΠΑΘΕΙΕΣ το εικοσιτετράωρο ανά
-- λογαριασμό, όχι πόσοι πέτυχαν. Το κόστος είναι φραγμένο ΑΝΑ ΑΤΟΜΟ, όχι
-- συνολικά· όποιος θέλει άθροισμα το βάζει εκεί, συνειδητά.
--
-- Νέα υπογραφή με δύο ακόμη παραμέτρους. Η προηγούμενη ΔΕΝ διαγράφεται: κατά
-- το deploy η παλιά έκδοση της εφαρμογής τρέχει ακόμη για λίγα δευτερόλεπτα
-- και θα έπαιρνε σφάλμα RPC.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bump_ai_usage(
  p_max_min      integer,
  p_day          integer[],
  p_month        integer[],
  p_pool         integer,
  p_trial_day    integer,
  p_trial_month  integer,
  p_tester_day   integer,
  p_tester_month integer
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid        := auth.uid();
  v_now    timestamptz := now();
  v_min    timestamptz := date_trunc('minute', v_now);
  v_day    date        := (v_now at time zone 'Europe/Athens')::date;
  v_mon    date        := date_trunc('month', (v_now at time zone 'Europe/Athens'))::date;
  v_plan   text;
  v_tester timestamptz;
  v_pay    boolean;
  v_rank   integer;
  v_lday   integer;
  v_lmon   integer;
  v_minc   integer;
  v_dayc   integer;
  v_monc   integer;
  v_pool   integer := 0;
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;

  v_rank := coalesce(public.user_plan_rank(v_uid), 0);
  v_lday := coalesce(p_day[v_rank + 1],   p_day[1]);
  v_lmon := coalesce(p_month[v_rank + 1], p_month[1]);

  -- «Πληρώνει» σημαίνει ΠΡΑΓΜΑΤΙΚΗ συνδρομή, όχι ανυψωμένο επίπεδο. Δοκιμή,
  -- δωρεάν μήνες και Συνεργάτες κοστίζουν από την ίδια τσέπη με τη δεξαμενή.
  -- Η λίστα διαβάζεται ΑΠΟ ΤΑ ΠΑΚΕΤΑ ΠΟΥ ΧΡΕΩΝΟΝΤΑΙ: αν προστεθεί πακέτο και
  -- ξεχαστεί εδώ, ο συνδρομητής του θα μετράει ως δωρεάν.
  select plan, tester_since into v_plan, v_tester
    from public.billing_profiles where user_id = v_uid;
  v_pay := coalesce(v_plan, 'free') in ('solo', 'owner', 'agency', 'office');

  -- ΤΟ ΠΑΚΕΤΟ ΕΡΩΤΗΣΕΩΝ ΑΚΟΛΟΥΘΕΙ ΤΗΝ ΠΛΗΡΩΜΗ, ΟΧΙ ΤΟ ΕΠΙΠΕΔΟ. Το `least`
  -- σημαίνει ότι ο μη πληρώνων δεν παίρνει ΠΟΤΕ περισσότερα από το δοκιμαστικό
  -- πακέτο, όσο ψηλά κι αν τον ανεβάσει δοκιμή, δώρο ή ιδιότητα.
  if not v_pay and p_trial_day is not null then
    v_lday := least(v_lday, p_trial_day);
    v_lmon := least(v_lmon, p_trial_month);
  end if;

  -- Ο ΔΟΚΙΜΑΣΤΗΣ ΚΟΒΕΤΑΙ ΤΕΛΕΥΤΑΙΟΣ, ΩΣΤΕ ΝΑ ΚΟΒΕΙ ΚΑΙ ΤΟΝ ΠΛΗΡΩΜΕΝΟ. Είναι
  -- η ΜΟΝΗ περίπτωση όπου το ταβάνι πέφτει πάνω σε λογαριασμό που δείχνει
  -- συνδρομητής: το πακέτο του είναι αληθινό, η πληρωμή δεν είναι.
  if v_tester is not null and p_tester_month is not null then
    v_lday := least(v_lday, p_tester_day);
    v_lmon := least(v_lmon, p_tester_month);
  end if;

  insert into public.ai_usage (user_id, minute_bucket, minute_count, day, day_count, month, month_count, updated_at)
    values (v_uid, v_min, 1, v_day, 1, v_mon, 1, v_now)
  on conflict (user_id) do update set
    minute_count  = case when public.ai_usage.minute_bucket = v_min then public.ai_usage.minute_count + 1 else 1 end,
    minute_bucket = v_min,
    day_count     = case when public.ai_usage.day   = v_day then public.ai_usage.day_count   + 1 else 1 end,
    day           = v_day,
    month_count   = case when public.ai_usage.month = v_mon then public.ai_usage.month_count + 1 else 1 end,
    month         = v_mon,
    updated_at    = v_now
  returning minute_count, day_count, month_count into v_minc, v_dayc, v_monc;

  if not v_pay then
    insert into public.ai_budget (month, free_count, updated_at)
      values (v_mon, 1, v_now)
    on conflict (month) do update set
      free_count = public.ai_budget.free_count + 1,
      updated_at = v_now
    returning free_count into v_pool;
  end if;

  -- Σειρά ελέγχων: από το πιο «μόνιμο» προς το πιο πρόσκαιρο, ώστε το μήνυμα
  -- που βλέπει ο χρήστης να λέει την πραγματική αιτία και όχι μια παροδική.
  if not v_pay and p_pool is not null and v_pool > p_pool then
    return json_build_object('allowed', false, 'reason', 'pool', 'rank', v_rank);
  end if;
  if v_monc > v_lmon then
    return json_build_object('allowed', false, 'reason', 'month', 'rank', v_rank);
  end if;
  if v_dayc > v_lday then
    return json_build_object('allowed', false, 'reason', 'day', 'rank', v_rank);
  end if;
  if v_minc > p_max_min then
    return json_build_object('allowed', false, 'reason', 'minute', 'rank', v_rank);
  end if;

  return json_build_object(
    'allowed', true, 'rank', v_rank, 'paying', v_pay,
    'tester', v_tester is not null,
    'minute', v_minc, 'day', v_dayc, 'month', v_monc,
    'day_limit', v_lday, 'month_limit', v_lmon
  );
end; $$;

revoke all on function public.bump_ai_usage(integer, integer[], integer[], integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.bump_ai_usage(integer, integer[], integer[], integer, integer, integer, integer, integer) to authenticated;

-- ΟΙ ΠΑΛΙΕΣ ΥΠΟΓΡΑΦΕΣ ΔΕΙΧΝΟΥΝ ΣΤΗ ΝΕΑ, ΓΙΑ ΟΣΟ ΖΟΥΝ. Οσο τρέχει η προηγούμενη
-- έκδοση της εφαρμογής θα καλεί εκείνες· δεν επιτρέπεται να συνεχίσουν να
-- δίνουν στον δοκιμαστή το πακέτο ενός συνδρομητή που πληρώνει.
--
-- ΤΟ ΤΡΙΑΝΤΑ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ ΕΔΩ. Η παλιά υπογραφή δίνει στον δοκιμαστή το
-- ΔΟΚΙΜΑΣΤΙΚΟ πακέτο, που το έχει ήδη στα χέρια της ως όρισμα: αυστηρότερο από
-- τα τριάντα, χωρίς δεύτερο νούμερο που θα ξεχαστεί όταν αλλάξει το πρώτο. Το
-- παράθυρο ζει δευτερόλεπτα, όσο κρατά το deploy.
create or replace function public.bump_ai_usage(
  p_max_min     integer,
  p_day         integer[],
  p_month       integer[],
  p_pool        integer,
  p_trial_day   integer,
  p_trial_month integer
) returns json language sql security definer set search_path to 'public' as $$
  select public.bump_ai_usage(p_max_min, p_day, p_month, p_pool, p_trial_day, p_trial_month, p_trial_day, p_trial_month);
$$;

create or replace function public.bump_ai_usage(
  p_max_min integer,
  p_day     integer[],
  p_month   integer[],
  p_pool    integer
) returns json language sql security definer set search_path to 'public' as $$
  select public.bump_ai_usage(p_max_min, p_day, p_month, p_pool, null::integer, null::integer, null::integer, null::integer);
$$;
