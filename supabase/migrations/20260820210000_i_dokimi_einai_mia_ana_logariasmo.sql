-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΟΚΙΜΗ ΕΙΝΑΙ ΜΙΑ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ, ΟΧΙ ΜΙΑ ΑΝΑ ΣΥΝΔΡΟΜΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΕΡΧΟΤΑΝ ΜΕ ΤΟ ΝΕΟ ΜΟΝΤΕΛΟ. Οταν η δωρεάν δοκιμή γίνεται
-- ρύθμιση της ΠΑΡΑΛΛΑΓΗΣ στο κατάστημα, γεννιέται καθαρή σε κάθε νέα συνδρομή.
-- Η διαδρομή υπήρχε ήδη ολόκληρη: ακύρωση τη δεύτερη ημέρα, η κατάσταση γίνεται
-- `cancelled`, το κουμπί «Πληρωμή με κάρτα» ξαναεμφανίζεται, και το επόμενο
-- πάτημα δίνει ΝΕΑ δοκιμή 30 ημερών — ίδιος λογαριασμός, ίδιο email, ίδια
-- κάρτα, επ' άπειρον. Απεριόριστο δωρεάν προϊόν, χωρίς κανένα σφάλμα πουθενά.
--
-- Η στήλη κρατά ΠΟΤΕ δόθηκε η δοκιμή. Το ταμείο τη διαβάζει και ζητά από τον
-- έμπορο `skip_trial` για κάθε επόμενη αγορά. Δεν χρειάζονται διπλάσιες
-- παραλλαγές στο κατάστημα: η δοκιμή γίνεται απόφαση δική μας, ανά λογαριασμό.
--
-- ── ΚΑΙ Η ΙΔΙΟΤΗΤΑ ΤΟΥ ΔΟΚΙΜΑΣΤΗ ─────────────────────────────────────────
-- Οι δοκιμαστές της Beta δεν περνούν ΠΟΤΕ από ταμείο. Ο έμπορος ζητά στοιχεία
-- κάρτας ακόμη και στα 0,00 € (τεκμηριωμένο, ανοιχτό αίτημα χρηστών), οπότε
-- ένας εκπτωτικός κωδικός 100% δεν θα γλίτωνε τη φόρμα — θα την εμφάνιζε. Ο
-- κωδικός των δοκιμαστών ζει στη ΔΙΚΗ μας πλευρά, σε μεταβλητή περιβάλλοντος,
-- και όποιος τον εξαργυρώσει παίρνει πρόσβαση επιτόπου.
--
-- ── ΚΑΙ ΟΙ ΔΥΟ ΕΙΝΑΙ ΤΟΥ ΔΙΑΚΟΜΙΣΤΗ ──────────────────────────────────────
-- Μια στήλη που δεν κλειδώνεται είναι στήλη που γράφει ο καθένας με το δημόσιο
-- κλειδί από την κονσόλα του περιηγητή. Το `trial_used_at` θα σβηνόταν για νέα
-- δοκιμή· το `tester_since` θα γραφόταν για δωρεάν προϊόν.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.billing_profiles add column if not exists trial_used_at timestamptz;
alter table public.billing_profiles add column if not exists tester_since timestamptz;

comment on column public.billing_profiles.trial_used_at is
  'Πότε δόθηκε η δωρεάν δοκιμή. Γεμάτο σημαίνει ότι κάθε επόμενο ταμείο ζητά skip_trial από τον έμπορο. Γράφεται μόνο από τον διακομιστή.';
comment on column public.billing_profiles.tester_since is
  'Πότε εξαργυρώθηκε ο κωδικός δοκιμαστή. Οσο είναι γεμάτο, ο λογαριασμός διαλέγει ελεύθερα πακέτο χωρίς καμία χρέωση και χωρίς συνδρομή στον έμπορο. Γράφεται μόνο από τον διακομιστή.';

-- ── Η ΣΚΑΝΔΑΛΗ ΞΑΝΑΓΡΑΦΕΤΑΙ ΜΕ ΤΙΣ ΔΥΟ ΝΕΕΣ ΣΤΗΛΕΣ ──────────────────────
-- Ολόκληρη, γιατί η `create or replace` δεν δέχεται προσθήκη γραμμής.
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
    end if;
  end if;
  return new;
end;
$$;

comment on function public.lock_billing_plan() is
  'Κρατά στον διακομιστή κάθε στήλη που δίνει πρόσβαση ή δωρεάν χρήση. Ο χρήστης με το δημόσιο κλειδί δεν μπορεί να γράψει πακέτο, δωρεάν μήνες, κατάσταση συνδρομής, χρήση δοκιμής, ούτε ιδιότητα δοκιμαστή.';
