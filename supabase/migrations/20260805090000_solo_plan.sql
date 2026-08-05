-- ═══════════════════════════════════════════════════════════════════════════
-- ΠΛΑΝΟ «ΕΝΑ ΑΚΙΝΗΤΟ» (solo, 3,90 €) — ΚΑΙ Η ΚΑΤΑΤΑΞΗ ΠΟΥ ΜΕΤΑΚΙΝΕΙΤΑΙ ΜΑΖΙ ΤΟΥ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΕΠΙΚΙΝΔΥΝΟ ΣΗΜΕΙΟ, ΓΡΑΜΜΕΝΟ ΡΗΤΑ
--
-- Η κατάταξη πλάνων υπάρχει σε ΔΥΟ σημεία που πρέπει να συμφωνούν:
--   · πελάτης: `rank()` = `PLAN_ORDER.indexOf(plan)` (lib/billing/entitlements.ts)
--   · βάση:    `public.user_plan_rank()` + `public.plan_max_properties()`
--
-- Το `solo` μπαίνει ΑΝΑΜΕΣΑ στο free και στο owner, οπότε κάθε επόμενο επίπεδο
-- ανεβαίνει κατά ένα. Αν αλλάξει μόνο ο πελάτης, ο συνδρομητής «Ιδιοκτήτης»
-- (rank 2 στον πελάτη) θα διαβαζόταν από τη βάση ως rank 1, δηλαδή «Ένα
-- ακίνητο»: θα έχανε δύο από τα τρία ακίνητά του σιωπηλά, χωρίς κανένα σφάλμα
-- πουθενά. Γι' αυτό οι δύο συναρτήσεις ξαναγράφονται ΕΔΩ, στο ίδιο commit.
--
-- ΝΕΑ ΑΝΤΙΣΤΟΙΧΙΑ
--   0 = free    → 1 ακίνητο, χωρίς φορολογικά
--   1 = solo    → 1 ακίνητο, με όλα τα φορολογικά
--   2 = owner   → 3 ακίνητα
--   3 = agency  → 15 ακίνητα
--   4 = office  → απεριόριστα
--
-- Η ΔΟΚΙΜΗ ΔΕΝ ΥΠΟΒΑΘΜΙΖΕΤΑΙ: έδινε επίπεδο 1 (τότε «Ιδιοκτήτης»). Αν έμενε 1,
-- κάθε νέος λογαριασμός θα έπεφτε από 3 ακίνητα σε 1 μέσα στη δοκιμή του. Πάει
-- σε 2, ώστε να συνεχίσει να σημαίνει ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ — «Ιδιοκτήτης».
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.plan_max_properties(p_rank int)
returns int language sql immutable as $$
  select case p_rank
           when 4 then 2147483647   -- Γραφείο: απεριόριστα
           when 3 then 15           -- Επαγγελματίας
           when 2 then 3            -- Ιδιοκτήτης
           when 1 then 1            -- Ένα ακίνητο (solo)
           else 1                   -- Δωρεάν
         end;
$$;

create or replace function public.user_plan_rank(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text; v_comp_plan text; v_comp_until timestamptz;
  v_created timestamptz; v_rank int := 0;
begin
  select plan, comp_plan, comp_until into v_plan, v_comp_plan, v_comp_until
    from billing_profiles where user_id = p_uid;

  if v_plan = 'solo'   then v_rank := greatest(v_rank, 1); end if;
  if v_plan = 'owner'  then v_rank := greatest(v_rank, 2); end if;
  if v_plan = 'agency' then v_rank := greatest(v_rank, 3); end if;
  if v_plan = 'office' then v_rank := greatest(v_rank, 4); end if;

  -- Δωρεάν μήνες (π.χ. από σύσταση φίλου).
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'solo'   then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 2); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 3); end if;
    if v_comp_plan = 'office' then v_rank := greatest(v_rank, 4); end if;
  end if;

  -- Δωρεάν δοκιμή: 30 ημέρες από τη δημιουργία του λογαριασμού.
  -- Επίπεδο 2 («Ιδιοκτήτης»), που ΠΡΙΝ ήταν το επίπεδο 1: ίδιο πλάνο, νέος
  -- αριθμός. Χωρίς αυτή τη μετακίνηση, κάθε λογαριασμός σε δοκιμή θα έχανε δύο
  -- από τα τρία ακίνητά του τη στιγμή που εφαρμοζόταν αυτό το migration.
  select created_at into v_created from auth.users where id = p_uid;
  if v_created is not null and v_created > now() - interval '30 days' then
    v_rank := greatest(v_rank, 2);
  end if;

  -- Συνεργάτης → πάντα «Επαγγελματίας».
  if exists (select 1 from referral_partners rp where rp.user_id = p_uid) then
    v_rank := greatest(v_rank, 3);
  end if;

  return v_rank;
end;
$$;

-- ── Ο έλεγχος ότι όντως συμφωνούν ─────────────────────────────────────────
-- Η Postgres ΔΕΝ επαληθεύει σώμα plpgsql στο `create`. Οι δύο συναρτήσεις
-- εκτελούνται εδώ με γνωστές εισόδους, ώστε ένα λάθος να σκάσει ΤΩΡΑ και όχι
-- την πρώτη φορά που κάποιος προσπαθεί να προσθέσει ακίνητο.
do $$
begin
  if plan_max_properties(0) <> 1          then raise exception 'rank 0 (free) πρέπει να δίνει 1 ακίνητο'; end if;
  if plan_max_properties(1) <> 1          then raise exception 'rank 1 (solo) πρέπει να δίνει 1 ακίνητο'; end if;
  if plan_max_properties(2) <> 3          then raise exception 'rank 2 (owner) πρέπει να δίνει 3 ακίνητα'; end if;
  if plan_max_properties(3) <> 15         then raise exception 'rank 3 (agency) πρέπει να δίνει 15 ακίνητα'; end if;
  if plan_max_properties(4) <> 2147483647 then raise exception 'rank 4 (office) πρέπει να είναι απεριόριστο'; end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ «ΠΛΗΡΩΝΕΙ» ΤΗΣ bump_ai_usage ΞΕΧΝΟΥΣΕ ΤΟ ΓΡΑΦΕΙΟ
-- ─────────────────────────────────────────────────────────────────────────
-- Ο έλεγχος ήταν `v_plan in ('owner','agency')`. Το πλάνο «Γραφείο» (79,90 €)
-- ΔΕΝ ήταν μέσα — γράφτηκε πριν υπάρξει και δεν ενημερώθηκε ποτέ. Αποτέλεσμα:
-- ο ακριβότερος συνδρομητής μετρούσε ως ΜΗ πληρώνων, έγραφε στον μετρητή του
-- δωρεάν (`ai_budget.free_count`) και μπορούσε να αποκλειστεί από το AI επειδή
-- τη δεξαμενή την ξόδεψαν οι δωρεάν χρήστες. Κανένα σφάλμα πουθενά· απλώς ένα
-- «δεν επιτρέπεται» σε πελάτη που πληρώνει τα περισσότερα.
--
-- Προστίθεται και το νέο `solo`, που είναι επίσης πραγματική συνδρομή.
--
-- ΤΟ ΣΩΜΑ ΕΙΝΑΙ ΑΥΤΟΥΣΙΟ ΑΠΟ ΤΟ 20260728090000. Άλλαξε ΜΟΝΟ η γραμμή `v_pay`.
-- Ξαναγράφεται ολόκληρο γιατί η Postgres δεν έχει «τροποποίηση γραμμής» σε
-- συνάρτηση — και αντιγράφεται αντί να ξαναγραφεί από μνήμη, ώστε να μη χαθεί
-- σιωπηλά λογική (μετρητής δεξαμενής, σειρά ελέγχων, σχήμα απάντησης).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.bump_ai_usage(
  p_max_min integer,
  p_day     integer[],
  p_month   integer[],
  p_pool    integer
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid        := auth.uid();
  v_now   timestamptz := now();
  v_min   timestamptz := date_trunc('minute', v_now);
  v_day   date        := (v_now at time zone 'utc')::date;
  v_mon   date        := date_trunc('month', (v_now at time zone 'utc'))::date;
  v_rank  integer;
  v_plan  text;
  v_pay   boolean;
  v_minc  integer; v_dayc integer; v_monc integer;
  v_pool  integer := 0;
  v_lday  integer; v_lmon integer;
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;

  -- Το ενεργό επίπεδο (0=δωρεάν, 1=ιδιοκτήτης, 2=επαγγελματίας). Αυθεντική πηγή:
  -- λαμβάνει υπόψη δοκιμή, δωρεάν μήνες και ιδιότητα Συνεργάτη.
  v_rank := coalesce(public.user_plan_rank(v_uid), 0);
  v_lday := coalesce(p_day[v_rank + 1],   p_day[1]);
  v_lmon := coalesce(p_month[v_rank + 1], p_month[1]);

  -- «Πληρώνει» σημαίνει ΠΡΑΓΜΑΤΙΚΗ συνδρομή, όχι ανυψωμένο επίπεδο. Δοκιμή,
  -- δωρεάν μήνες και Συνεργάτες κοστίζουν από την ίδια τσέπη με το δωρεάν.
  select plan into v_plan from public.billing_profiles where user_id = v_uid;
  v_pay := coalesce(v_plan, 'free') in ('solo', 'owner', 'agency', 'office');

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

revoke all on function public.bump_ai_usage(integer, integer[], integer[], integer) from public, anon;
grant execute on function public.bump_ai_usage(integer, integer[], integer[], integer) to authenticated;
