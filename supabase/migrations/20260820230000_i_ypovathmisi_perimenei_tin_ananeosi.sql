-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΥΠΟΒΑΘΜΙΣΗ ΠΕΡΙΜΕΝΕΙ ΤΗΝ ΑΝΑΝΕΩΣΗ, ΚΑΙ ΤΗΝ ΠΕΡΙΜΕΝΕΙ ΕΔΩ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΖΗΤΗΘΗΚΕ, ΜΕ ΤΑ ΙΔΙΑ ΛΟΓΙΑ: «στην υποβάθμιση δεν παιρνει χρηματα πισω
-- αλλα υποβαθμιζεται μετά το τελος των 30 ημερων».
--
-- ΤΟ ΜΙΣΟ ΤΟ ΚΑΝΕΙ Ο ΕΜΠΟΡΟΣ. Με `disable_prorations` δεν εκδίδεται κανένα
-- πιστωτικό και η επόμενη ανανέωση χρεώνεται στη ΝΕΑ, χαμηλότερη τιμή.
--
-- ΤΟ ΑΛΛΟ ΜΙΣΟ ΔΕΝ ΤΟ ΥΠΟΣΤΗΡΙΖΕΙ. Η παραλλαγή της συνδρομής αλλάζει τη στιγμή
-- του αιτήματος, άρα το γεγονός που φτάνει στον webhook γράφει ΑΜΕΣΩΣ το
-- χαμηλότερο πακέτο: ο πελάτης που πλήρωσε ολόκληρο μήνα «Επαγγελματία» θα
-- έχανε το Πελατολόγιο την ίδια ώρα που ζήτησε την αλλαγή. Δηλαδή θα τον
-- τιμωρούσαμε επειδή μας το είπε νωρίς.
--
-- ── ΟΙ ΔΥΟ ΣΤΗΛΕΣ ────────────────────────────────────────────────────────
-- `hold_plan`  το πακέτο που ΕΧΕΙ ΠΛΗΡΩΘΕΙ και κρατιέται.
-- `hold_until` ώς πότε. Ειναι η ημερομηνία ανανέωσης τη στιγμή της αλλαγής.
--
-- ΚΑΙ ΔΕΝ ΑΝΑΣΤΑΙΝΟΥΝ ΤΙΠΟΤΑ. Η κράτηση ΑΝΕΒΑΖΕΙ μόνο λογαριασμό που έχει
-- ζωντανή συνδρομή. Χωρίς αυτόν τον όρο, μια συνδρομή που έληξε ή δεν
-- πληρώθηκε θα κρατούσε το ακριβό πακέτο ώς την ημερομηνία της κράτησης —
-- δωρεάν προϊόν σε όποιον απλώς σταμάτησε να πληρώνει.
--
-- ── ΓΙΑΤΙ ΜΠΑΙΝΕΙ ΚΑΙ Η `plan_rank` ──────────────────────────────────────
-- Η αντιστοιχία πακέτου προς επίπεδο ήταν γραμμένη ΔΥΟ φορές μέσα στην ίδια
-- συνάρτηση, με τέσσερα `if` η καθεμία· η κράτηση θα την έκανε τρεις. Τρία
-- αντίγραφα ενός πίνακα τεσσάρων γραμμών είναι τρεις ευκαιρίες να ξεχαστεί ένα
-- πακέτο σε ένα από αυτά και κανένα σφάλμα δεν θα το έλεγε. Η αντιστοιχία
-- γράφεται μία φορά και το db-replay την αντιπαραβάλλει με το PLAN_ORDER.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.billing_profiles add column if not exists hold_plan text;
alter table public.billing_profiles add column if not exists hold_until timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'billing_profiles_hold_plan_known'
  ) then
    alter table public.billing_profiles
      add constraint billing_profiles_hold_plan_known
      check (hold_plan is null or hold_plan in ('free', 'solo', 'owner', 'agency', 'office'));
  end if;
end $$;

comment on column public.billing_profiles.hold_plan is
  'Το πακέτο που κρατιέται ώς την ανανέωση, όταν ο πελάτης ζήτησε υποβάθμιση μέσα σε περίοδο που έχει ήδη πληρώσει. Γράφεται μόνο από τον διακομιστή.';
comment on column public.billing_profiles.hold_until is
  'Ώς πότε ισχύει η κράτηση: η ημερομηνία ανανέωσης τη στιγμή της υποβάθμισης. Μετά από αυτήν, η πρόσβαση βγαίνει σκέτη από τη συνδρομή.';

-- ── Η ΑΝΤΙΣΤΟΙΧΙΑ ΠΑΚΕΤΟΥ ΚΑΙ ΕΠΙΠΕΔΟΥ, ΜΙΑ ΦΟΡΑ ────────────────────────
-- ΑΓΝΩΣΤΟ ΟΝΟΜΑ ΔΙΝΕΙ 0, ΟΧΙ ΣΦΑΛΜΑ. Η συνάρτηση καλείται μέσα σε πολιτικές
-- RLS και σε σκανδάλες ορίων: μια εξαίρεση εκεί δεν «κλείνει την πόρτα με
-- ασφάλεια», σπάει την εγγραφή ακινήτου με μήνυμα που δεν καταλαβαίνει κανείς.
create or replace function public.plan_rank(p_plan text)
returns int language sql immutable
set search_path = public
as $$
  select case p_plan
    when 'solo'   then 1
    when 'owner'  then 2
    when 'agency' then 3
    when 'office' then 4
    else 0
  end
$$;

comment on function public.plan_rank(text) is
  'Το επίπεδο ενός πακέτου, με τη σειρά του PLAN_ORDER (lib/billing/plans.ts). Ο,τι δεν αναγνωρίζεται είναι 0.';

-- ── ΤΟ ΕΠΙΠΕΔΟ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ ──────────────────────────────────────────
create or replace function public.user_plan_rank(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text; v_comp_plan text; v_comp_until timestamptz;
  v_hold_plan text; v_hold_until timestamptz;
  v_trial_used timestamptz; v_created timestamptz; v_rank int := 0;
begin
  select plan, comp_plan, comp_until, trial_used_at, hold_plan, hold_until
    into v_plan, v_comp_plan, v_comp_until, v_trial_used, v_hold_plan, v_hold_until
    from billing_profiles where user_id = p_uid;

  v_rank := greatest(v_rank, public.plan_rank(v_plan));

  -- Δωρεάν μήνες (π.χ. από σύσταση φίλου).
  if v_comp_until is not null and v_comp_until > now() then
    v_rank := greatest(v_rank, public.plan_rank(v_comp_plan));
  end if;

  -- ΥΠΟΒΑΘΜΙΣΗ ΠΟΥ ΠΕΡΙΜΕΝΕΙ ΤΗΝ ΑΝΑΝΕΩΣΗ. Ο πελάτης πλήρωσε την περίοδο στο
  -- ακριβότερο πακέτο και τη δικαιούται ολόκληρη. Μόνο όσο η συνδρομή ζει:
  -- `plan` γίνεται 'free' μόλις πάψει να ισχύει και τότε δεν κρατιέται τίποτα.
  if coalesce(v_plan, 'free') <> 'free'
     and v_hold_until is not null and v_hold_until > now() then
    v_rank := greatest(v_rank, public.plan_rank(v_hold_plan));
  end if;

  -- ΤΟΠΙΚΗ ΔΟΚΙΜΗ, ΜΟΝΟ ΓΙΑ ΟΠΟΙΟΝ ΔΕΝ ΠΗΡΕ ΠΟΤΕ ΔΟΚΙΜΗ ΑΠΟ ΤΟΝ ΕΜΠΟΡΟ.
  -- Το `v_trial_used is null` είναι ολόκληρη η διαφορά: χωρίς αυτό, όποιος
  -- αγόρασε και ακύρωσε τη δεύτερη ημέρα κρατούσε τρία ακίνητα για άλλες
  -- είκοσι οκτώ, επειδή ο λογαριασμός του ήταν ακόμη νέος.
  if v_trial_used is null then
    select created_at into v_created from auth.users where id = p_uid;
    if v_created is not null and v_created > now() - (public.trial_days() || ' days')::interval then
      v_rank := greatest(v_rank, public.plan_rank('owner'));
    end if;
  end if;

  -- Συνεργάτης → πάντα «Επαγγελματίας».
  if exists (select 1 from referral_partners rp where rp.user_id = p_uid) then
    v_rank := greatest(v_rank, public.plan_rank('agency'));
  end if;

  return v_rank;
end;
$$;

comment on function public.user_plan_rank(uuid) is
  'Το επίπεδο πρόσβασης ενός λογαριασμού. Η τοπική δοκιμή ισχύει ΜΟΝΟ όσο δεν έχει σφραγιστεί το trial_used_at. Η κράτηση υποβάθμισης (hold_plan/hold_until) ανεβάζει μόνο λογαριασμό με ζωντανή συνδρομή.';

-- ── Η ΣΚΑΝΔΑΛΗ ΞΑΝΑΓΡΑΦΕΤΑΙ ΜΕ ΤΙΣ ΔΥΟ ΝΕΕΣ ΣΤΗΛΕΣ ──────────────────────
-- Ολόκληρη, γιατί η `create or replace` δεν δέχεται προσθήκη γραμμής. Χωρίς
-- αυτό, ο καθένας θα έγραφε `hold_plan = 'office'` με το δημόσιο κλειδί από την
-- κονσόλα του περιηγητή και θα κρατούσε το ακριβότερο πακέτο ώς το 2100.
create or replace function public.lock_billing_plan() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.comp_plan := null;
      new.comp_until := null;
      new.comp_months_granted := 0;
      new.comp_started_at := null;
      new.extra_properties := 0;
      new.bonus_properties := 0;
      new.bonus_properties_until := null;
      new.subscription_status := null;
      new.mor_customer_id := null;
      new.mor_subscription_id := null;
      new.mor_variant_id := null;
      new.mor_renews_at := null;
      new.mor_ends_at := null;
      new.mor_event_at := null;
      new.trial_used_at := null;
      new.tester_since := null;
      new.hold_plan := null;
      new.hold_until := null;
    else
      if new.plan is distinct from old.plan then new.plan := old.plan; end if;
      new.comp_plan          := old.comp_plan;
      new.comp_until         := old.comp_until;
      new.comp_months_granted := old.comp_months_granted;
      new.comp_started_at    := old.comp_started_at;
      new.extra_properties   := old.extra_properties;
      new.bonus_properties   := old.bonus_properties;
      new.bonus_properties_until := old.bonus_properties_until;
      new.subscription_status := old.subscription_status;
      new.mor_customer_id    := old.mor_customer_id;
      new.mor_subscription_id := old.mor_subscription_id;
      new.mor_variant_id     := old.mor_variant_id;
      new.mor_renews_at      := old.mor_renews_at;
      new.mor_ends_at        := old.mor_ends_at;
      new.mor_event_at       := old.mor_event_at;
      new.trial_used_at      := old.trial_used_at;
      new.tester_since       := old.tester_since;
      new.hold_plan          := old.hold_plan;
      new.hold_until         := old.hold_until;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.lock_billing_plan() is
  'Κρατά στον διακομιστή κάθε στήλη που δίνει πρόσβαση ή δωρεάν χρήση. Ο χρήστης με το δημόσιο κλειδί δεν μπορεί να γράψει πακέτο, δωρεάν μήνες, κατάσταση συνδρομής, χρήση δοκιμής, ιδιότητα δοκιμαστή, ούτε κράτηση υποβάθμισης.';
