-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΥΟ ΤΡΥΠΕΣ ΣΤΟΝ ΜΕΤΡΗΤΗ ΤΟΥ ΒΟΗΘΟΥ, ΚΑΙ ΟΙ ΔΥΟ ΣΙΩΠΗΛΕΣ
-- ─────────────────────────────────────────────────────────────────────────
-- 1) ΔΥΟ ΠΛΗΡΩΜΕΝΑ ΠΑΚΕΤΑ ΜΕΤΡΙΟΥΝΤΑΝ ΩΣ ΔΩΡΕΑΝ.
--    Ο έλεγχος «πληρώνει;» ήταν γραμμένος ως `v_plan in ('owner','agency')`,
--    δηλαδή έμεινε στα δύο πακέτα που υπήρχαν τότε. Στο μεταξύ μπήκαν το
--    `solo` (το ΦΘΗΝΟΤΕΡΟ, άρα και το πολυπληθέστερο) και το `office` (το
--    ΑΚΡΙΒΟΤΕΡΟ). Και τα δύο μετρούσαν στην κοινή δεξαμενή των μη-πληρωνόντων:
--    ένας συνδρομητής που πληρώνει 79,90 € τον μήνα μπορούσε να αποκλειστεί
--    από τον βοηθό επειδή οι δοκιμαστές είχαν εξαντλήσει τη δεξαμενή του μήνα.
--    Και το μήνυμα που θα έβλεπε θα του έλεγε ότι «ο δωρεάν βοηθός εξαντλήθηκε».
--
-- 2) Η ΔΟΚΙΜΗ ΕΠΑΙΡΝΕ ΤΟ ΠΑΚΕΤΟ ΕΡΩΤΗΣΕΩΝ ΤΟΥ «ΙΔΙΟΚΤΗΤΗΣ+».
--    Η δοκιμή ανεβάζει το επίπεδο σε rank 2 ώστε ο νέος χρήστης να δει τις
--    δυνατότητες — και μαζί έπαιρνε και τις ερωτήσεις του πακέτου, δυόμισι
--    φορές περισσότερες από όσες δικαιούται ο συνδρομητής που ΠΛΗΡΩΝΕΙ το
--    φθηνότερο. Το ίδιο ίσχυε για κάθε ανυψωμένο αλλά μη πληρωμένο επίπεδο:
--    δωρεάν μήνες από συστάσεις, ιδιότητα Συνεργάτη.
--
--    Οι ΔΥΝΑΤΟΤΗΤΕΣ της δοκιμής δεν αγγίζονται — τρία ακίνητα, σύγκριση, τα
--    πάντα. Μόνο το πακέτο ερωτήσεων γίνεται δοκιμαστικό, όπως και η δοκιμή.
--
-- Νέα υπογραφή με δύο ακόμη παραμέτρους. Η προηγούμενη ΔΕΝ διαγράφεται: κατά
-- το deploy η παλιά έκδοση της εφαρμογής τρέχει ακόμη για λίγα δευτερόλεπτα
-- και θα έπαιρνε σφάλμα RPC.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bump_ai_usage(
  p_max_min    integer,
  p_day        integer[],
  p_month      integer[],
  p_pool       integer,
  p_trial_day  integer,
  p_trial_month integer
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid        := auth.uid();
  v_now   timestamptz := now();
  v_min   timestamptz := date_trunc('minute', v_now);
  v_day   date        := (v_now at time zone 'Europe/Athens')::date;
  v_mon   date        := date_trunc('month', (v_now at time zone 'Europe/Athens'))::date;
  v_plan  text;
  v_pay   boolean;
  v_rank  integer;
  v_lday  integer;
  v_lmon  integer;
  v_minc  integer;
  v_dayc  integer;
  v_monc  integer;
  v_pool  integer := 0;
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
  select plan into v_plan from public.billing_profiles where user_id = v_uid;
  v_pay := coalesce(v_plan, 'free') in ('solo', 'owner', 'agency', 'office');

  -- ΤΟ ΠΑΚΕΤΟ ΕΡΩΤΗΣΕΩΝ ΑΚΟΛΟΥΘΕΙ ΤΗΝ ΠΛΗΡΩΜΗ, ΟΧΙ ΤΟ ΕΠΙΠΕΔΟ. Το `least`
  -- σημαίνει ότι ο μη πληρώνων δεν παίρνει ΠΟΤΕ περισσότερα από το δοκιμαστικό
  -- πακέτο, όσο ψηλά κι αν τον ανεβάσει δοκιμή, δώρο ή ιδιότητα.
  if not v_pay and p_trial_day is not null then
    v_lday := least(v_lday, p_trial_day);
    v_lmon := least(v_lmon, p_trial_month);
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
    'minute', v_minc, 'day', v_dayc, 'month', v_monc,
    'day_limit', v_lday, 'month_limit', v_lmon
  );
end; $$;

revoke all on function public.bump_ai_usage(integer, integer[], integer[], integer, integer, integer) from public, anon;
grant execute on function public.bump_ai_usage(integer, integer[], integer[], integer, integer, integer) to authenticated;

-- Η ΠΑΛΙΑ ΥΠΟΓΡΑΦΗ ΔΙΟΡΘΩΝΕΤΑΙ ΚΙ ΑΥΤΗ, ΓΙΑ ΟΣΟ ΖΕΙ. Όσο τρέχει η προηγούμενη
-- έκδοση της εφαρμογής, θα καλεί εκείνη· δεν επιτρέπεται να συνεχίσει να
-- χρεώνει τον συνδρομητή «Ιδιοκτήτης» στη δεξαμενή των δωρεάν.
create or replace function public.bump_ai_usage(
  p_max_min integer,
  p_day     integer[],
  p_month   integer[],
  p_pool    integer
) returns json language sql security definer set search_path to 'public' as $$
  select public.bump_ai_usage(p_max_min, p_day, p_month, p_pool, null::integer, null::integer);
$$;
