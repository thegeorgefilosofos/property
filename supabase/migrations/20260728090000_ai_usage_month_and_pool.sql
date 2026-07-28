-- ═══════════════════════════════════════════════════════════════════════════
-- Όρια AI ανά πλάνο + μηνιαίος μετρητής + κοινή δεξαμενή για το δωρεάν επίπεδο.
--
-- ΤΙ ΑΛΛΑΖΕΙ ΚΑΙ ΓΙΑΤΙ
-- Μέχρι τώρα ίσχυε ΕΝΑ όριο για όλους: 400 αιτήματα/ημέρα, δωρεάν και πληρωμένοι
-- το ίδιο. Στη χειρότερη περίπτωση αυτό είναι ~9.900 $/μήνα για 10 χρήστες — 500
-- φορές πάνω από τον προϋπολογισμό. Δεν ήταν γενναιοδωρία· ήταν έλλειψη ορίου.
--
-- Τρία πράγματα προστίθενται:
--   1. ΜΗΝΙΑΙΟΣ μετρητής. Το ημερήσιο εμποδίζει την έκρηξη μιας ημέρας· το
--      μηνιαίο είναι αυτό που ο χρήστης αντιλαμβάνεται ως «πακέτο».
--   2. ΟΡΙΑ ΑΝΑ ΠΛΑΝΟ. Περνούν ως πίνακες [δωρεάν, ιδιοκτήτης, επαγγελματίας]
--      ώστε τα νούμερα να ζουν σε ΕΝΑ σημείο (lib/billing/aiLimits.ts) και η
--      ΑΝΑΓΝΩΡΙΣΗ του πλάνου να γίνεται εδώ, στον server, με το ήδη υπάρχον
--      public.user_plan_rank — που είναι η αυθεντική πηγή και δεν παρακάμπτεται.
--   3. ΚΟΙΝΗ ΔΕΞΑΜΕΝΗ (pool) για όσους ΔΕΝ πληρώνουν. Αυτή είναι η μόνη σκληρή
--      εγγύηση κόστους που υπάρχει: τα ατομικά όρια περιορίζουν έναν χρήστη,
--      αλλά δέκα χρήστες στο μέγιστο εξακολουθούν να αθροίζονται. Η δεξαμενή
--      βάζει ταβάνι στο ΑΘΡΟΙΣΜΑ. Χάρη σε αυτήν μπορούμε να δώσουμε γενναιόδωρο
--      ατομικό όριο χωρίς να ρισκάρουμε τον λογαριασμό.
--
-- ΠΟΙΟΣ ΜΕΤΡΑΕΙ ΣΤΗ ΔΕΞΑΜΕΝΗ: όποιος δεν έχει πληρωμένη συνδρομή — δηλαδή και η
-- δωρεάν δοκιμή, και οι δωρεάν μήνες από συστάσεις, και οι Συνεργάτες. Παίρνουν
-- τα ΑΝΩΤΕΡΑ όρια του πλάνου τους (σωστό: τους το υποσχεθήκαμε), αλλά το κόστος
-- τους βγαίνει από την ίδια τσέπη, οπότε μετράει στο ίδιο ταβάνι.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ai_usage add column if not exists month       date;
alter table public.ai_usage add column if not exists month_count integer not null default 0;

-- Η δεξαμενή: μία γραμμή ανά μήνα, για ΟΛΟΥΣ τους μη-πληρώνοντες μαζί.
create table if not exists public.ai_budget (
  month      date        primary key,
  free_count integer     not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ai_budget enable row level security;
-- Μόνο η SECURITY DEFINER συνάρτηση παρακάτω αγγίζει τον πίνακα.
revoke all on table public.ai_budget from anon, authenticated;

comment on table public.ai_budget is
  'Μηνιαίο άθροισμα αιτημάτων AI από μη-πληρώνοντες χρήστες. Σκληρό ταβάνι κόστους.';

-- ── Ο μετρητής ─────────────────────────────────────────────────────────────
-- Τα p_day / p_month είναι πίνακες τριών θέσεων με σειρά [δωρεάν, ιδιοκτήτης,
-- επαγγελματίας], δηλαδή δείκτης = user_plan_rank + 1. Έτσι τα νούμερα δεν
-- γράφονται δεύτερη φορά σε SQL και δεν μπορούν να αποκλίνουν από τον κώδικα.
--
-- Η παλιά bump_ai_usage(integer, integer) ΔΕΝ διαγράφεται: κατά το deploy η
-- προηγούμενη έκδοση της εφαρμογής τρέχει ακόμη για λίγα δευτερόλεπτα και θα
-- έπαιρνε σφάλμα RPC. Είναι διαφορετική υπογραφή, συνυπάρχουν αθόρυβα.
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
  v_pay := coalesce(v_plan, 'free') in ('owner', 'agency');

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
