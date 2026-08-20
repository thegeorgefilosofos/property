-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΣΤΗΛΕΣ ΕΛΕΓΑΝ «STRIPE» ΚΑΙ ΘΑ ΚΡΑΤΟΥΣΑΝ LEMON SQUEEZY
-- ─────────────────────────────────────────────────────────────────────────
-- Το σχήμα γεννήθηκε με την υπόθεση ότι ο έμπορος θα ήταν η Stripe. Δεν είναι:
-- ο έμπορος τύπου record είναι η Lemon Squeezy, γιατί εκείνη εκδίδει το
-- παραστατικό και αποδίδει τον ΦΠΑ κάθε χώρας — δηλαδή επιτρέπει πωλήσεις πριν
-- υπάρξει εταιρεία.
--
-- ΜΙΑ ΣΤΗΛΗ `stripe_customer_id` ΠΟΥ ΚΡΑΤΑ ΑΝΑΓΝΩΡΙΣΤΙΚΟ LEMON SQUEEZY ΕΙΝΑΙ
-- ΨΕΜΑ ΓΡΑΜΜΕΝΟ ΣΤΟ ΣΧΗΜΑ. Ο επόμενος που θα ανοίξει τη βάση — λογιστής,
-- προγραμματιστής, ελεγκτής — θα ψάξει τον πελάτη σε λάθος πίνακα ελέγχου. Τα
-- ονόματα γίνονται ουδέτερα (`mor_`, merchant of record), ώστε να λένε τι
-- κρατούν και να μην ξαναγραφτούν αν αλλάξει ποτέ ο έμπορος.
--
-- ΤΙ ΠΡΟΣΤΙΘΕΤΑΙ. Η ακύρωση συνδρομής στη Lemon Squeezy ΔΕΝ κόβει αμέσως: η
-- πληρωμένη περίοδος τρέχει ώς το `ends_at`. Χωρίς αυτή τη στήλη, η εφαρμογή
-- θα έκοβε πρόσβαση σε πελάτη που έχει πληρώσει τον μήνα — ή θα την άφηνε
-- ανοιχτή για πάντα. Η `mor_variant_id` κρατά ΠΟΙΑ παραλλαγή αγοράστηκε, ώστε
-- το πακέτο να προκύπτει από την πώληση και όχι από εικασία.
--
-- ΚΑΙ ΟΛΕΣ ΜΕΝΟΥΝ ΚΛΕΙΔΩΜΕΝΕΣ. Γράφονται ΜΟΝΟ με ρόλο υπηρεσίας, από τον
-- webhook. Ο ίδιος ο χρήστης, με το δημόσιο κλειδί από την κονσόλα του
-- περιηγητή, δεν μπορεί να γράψει «active» στον εαυτό του.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.billing_profiles rename column stripe_customer_id to mor_customer_id;
alter table public.billing_profiles rename column stripe_subscription_id to mor_subscription_id;
alter table public.invoices rename column stripe_ref to mor_ref;

alter table public.billing_profiles add column if not exists mor_variant_id text;
alter table public.billing_profiles add column if not exists mor_renews_at timestamptz;
alter table public.billing_profiles add column if not exists mor_ends_at timestamptz;
-- Πότε άλλαξε ΤΕΛΕΥΤΑΙΑ η συνδρομή στον έμπορο, όπως το λέει ο ίδιος. Τα
-- webhook φτάνουν και ανάποδα· χωρίς αυτό, ένα καθυστερημένο «ακυρώθηκε» θα
-- έγραφε πάνω από ένα νεότερο «ανανεώθηκε».
alter table public.billing_profiles add column if not exists mor_event_at timestamptz;

comment on column public.billing_profiles.mor_customer_id is
  'Ο πελάτης στον έμπορο τύπου record (Lemon Squeezy). Γράφεται μόνο από τον webhook.';
comment on column public.billing_profiles.mor_subscription_id is
  'Η συνδρομή στον έμπορο τύπου record. Γράφεται μόνο από τον webhook.';
comment on column public.billing_profiles.mor_variant_id is
  'Η παραλλαγή προϊόντος που αγοράστηκε. Από αυτήν προκύπτει το πακέτο.';
comment on column public.billing_profiles.mor_ends_at is
  'Πότε λήγει η πρόσβαση σε ακυρωμένη συνδρομή. Η πληρωμένη περίοδος τρέχει ώς εδώ.';
comment on column public.billing_profiles.mor_event_at is
  'Η ώρα του τελευταίου γεγονότος που εφαρμόστηκε. Κόβει τα καθυστερημένα webhook.';

-- ── Η ΣΚΑΝΔΑΛΗ ΞΑΝΑΓΡΑΦΕΤΑΙ ΜΕ ΤΑ ΝΕΑ ΟΝΟΜΑΤΑ ────────────────────────────
-- Χωρίς αυτό η συνάρτηση θα έδειχνε σε στήλες που δεν υπάρχουν πια, και ΚΑΘΕ
-- ενημέρωση προφίλ χρέωσης θα έσκαγε. Οι τρεις νέες στήλες μπαίνουν στην ίδια
-- λίστα: μια στήλη που δεν κλειδώνεται είναι στήλη που γράφει ο καθένας.
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
    end if;
  end if;
  return new;
end;
$$;
