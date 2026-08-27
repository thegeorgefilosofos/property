-- ═══════════════════════════════════════════════════════════════════════════
--  ΞΕΚΛΕΙΔΩΜΑ ΛΟΓΑΡΙΑΣΜΟΥ ΔΟΚΙΜΑΣΤΗ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΚΑΝΕΙ. Δίνει σε έναν υπάρχοντα λογαριασμό ιδιότητα δοκιμαστή και πακέτο
--  «Επαγγελματίας». Δεν σβήνει ΤΙΠΟΤΑ: ακίνητα, δαπάνες, εξοπλισμός και ό,τι
--  άλλο έχεις μέσα μένουν όπως είναι.
--
--  ΓΙΑΤΙ ΧΡΕΙΑΣΤΗΚΕ. Το staging-demo.sql έγραφε `plan = 'pro'`, πακέτο που δεν
--  υπάρχει. Τα πέντε ονόματα είναι free, solo, owner, agency, office και η
--  `normalizePlan` (lib/billing/plans.ts) γυρίζει σιωπηλά κάθε άγνωστο σε
--  «free». Ο δοκιμαστής έπαιρνε δηλαδή όριο ενός ακινήτου και κλειδωμένα όλα
--  όσα υποτίθεται ότι ελέγχει.
--
--  ΟΙ ΔΥΟ ΣΤΗΛΕΣ ΚΑΝΟΥΝ ΔΙΑΦΟΡΕΤΙΚΗ ΔΟΥΛΕΙΑ:
--    · `plan = 'agency'` δίνει ΤΩΡΑ ό,τι ζητά το FEATURE_MIN_PLAN, δηλαδή τα
--      πάντα: ημερολόγιο άρθρων, επενδυτική ανάλυση, χαρτοφυλάκιο, πελάτες,
--      εισαγωγή κινήσεων, επωνυμία αναφορών, όριο 15 ακινήτων.
--    · `tester_since` λέει «αυτός δεν πληρώνει ποτέ»: όσο είναι γεμάτο, ο
--      λογαριασμός αλλάζει ελεύθερα πακέτο μέσα από την εφαρμογή, χωρίς κάρτα
--      και χωρίς συνδρομή στον έμπορο (app/api/billing/plan/route.ts).
--
--  ΠΟΥ ΤΡΕΧΕΙ. Supabase → SQL Editor, στο έργο που δείχνει η εφαρμογή που
--  χρησιμοποιείς. Ο επεξεργαστής τρέχει ως `postgres`, οπότε η σκανδάλη
--  `lock_billing_plan` δεν μπλοκάρει τη γραφή (φράζει μόνο τους ρόλους
--  `authenticated` και `anon`, δηλαδή τον περιηγητή).
--
--  ΑΛΛΑΞΕ ΤΟ EMAIL αν ο λογαριασμός σου είναι άλλος.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ΤΙ ΙΣΧΥΕΙ ΤΩΡΑ. Τρέξ' το πρώτο, για να δεις τι θα αλλάξεις. ────────
select u.email, bp.plan, bp.subscription_status, bp.tester_since, bp.profile_type
from auth.users u
left join public.billing_profiles bp on bp.user_id = u.id
where u.email = 'demo@properwise.gr';

-- ── 2. ΤΟ ΞΕΚΛΕΙΔΩΜΑ ─────────────────────────────────────────────────────
do $unlock$
declare uid uuid;
begin
  select id into uid from auth.users where email = 'demo@properwise.gr';
  if uid is null then
    raise exception 'Δεν βρέθηκε λογαριασμός με αυτό το email. Δες τη λίστα στο Authentication → Users.';
  end if;

  insert into public.billing_profiles (user_id, plan, subscription_status, tester_since, full_name)
    values (uid, 'agency', 'active', now(), 'Λογαριασμός δοκιμών')
  on conflict (user_id) do update
    set plan = 'agency',
        subscription_status = 'active',
        -- Η ημερομηνία δεν ξαναγράφεται αν υπάρχει ήδη: η ιδιότητα δοκιμαστή
        -- έχει αφετηρία και η αφετηρία δεν αλλάζει επειδή έτρεξε ξανά το αρχείο.
        tester_since = coalesce(public.billing_profiles.tester_since, now());

  raise notice 'Εγινε. Ο λογαριασμός έχει πακέτο «Επαγγελματίας» και ιδιότητα δοκιμαστή.';
end
$unlock$;

-- ── 3. ΕΠΙΒΕΒΑΙΩΣΗ ───────────────────────────────────────────────────────
select u.email, bp.plan, bp.subscription_status, bp.tester_since
from auth.users u
join public.billing_profiles bp on bp.user_id = u.id
where u.email = 'demo@properwise.gr';
