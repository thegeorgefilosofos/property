-- ═══════════════════════════════════════════════════════════════════════════
-- ΒΡΑΧΥΧΡΟΝΙΑ ΜΙΣΘΩΣΗ — ΑΚΑΘΑΡΙΣΤΑ, ΑΜΑ, ΔΗΛΩΣΗ ΔΙΑΜΟΝΗΣ
--
-- ΤΡΙΑ ΔΟΜΙΚΑ ΛΑΘΗ ΠΟΥ ΔΙΟΡΘΩΝΕΙ ΑΥΤΟ ΤΟ MIGRATION
--
-- 1. Το app αποθήκευε ΚΑΘΑΡΑ και τα ονόμαζε ΑΚΑΘΑΡΙΣΤΑ.
--    Ο εισαγωγέας email (TabClients) ζητούσε ρητά «το ποσό που εισπράττει ο
--    οικοδεσπότης (payout)» και το έγραφε στο client_stays.total. Μετά το
--    lib/tax/shortTermTax.ts διάβαζε ΤΟ ΙΔΙΟ ΠΕΔΙΟ με το όνομα grossRevenue και
--    υπολόγιζε πάνω του τον φόρο, ενώ ο φάκελος του λογιστή έλεγε στον χρήστη
--    «δήλωσε τα ΑΚΑΘΑΡΙΣΤΑ, πριν την προμήθεια». Απόκλιση ~15% στη βάση κάθε
--    φορολογικού νούμερου της βραχυχρόνιας.
--    → Τρία ρητά πεδία: gross_guest_paid, platform_fee, climate_levy.
--
-- 2. Ο ΑΜΑ ζούσε ως ελεύθερο κείμενο σε bills_settings (section 'occupancy'),
--    μέσα σε κλειστό accordion άλλης καρτέλας, πίσω από τρίτο ανεξάρτητο
--    διακόπτη — ενώ το lib/property/status.ts ήδη ήξερε ότι το ακίνητο είναι
--    rent_short. 12.145 καταχωρήσεις στάλθηκαν για απενεργοποίηση το 2025
--    επειδή δεν είχαν ΑΜΑ ή είχαν άκυρο.
--    → Ο ΑΜΑ γίνεται πεδίο ΤΟΥ ΑΚΙΝΗΤΟΥ, με ημερομηνία επιβεβαίωσης ότι
--      αναγράφεται στην αγγελία.
--
-- 3. Καμία παρακολούθηση δήλωσης βραχυχρόνιας διαμονής. ~2,47 εκατ. δηλώσεις
--    πανελλαδικά το 2025 — μία ανά κράτηση — και το εργαλείο που έχει όλες τις
--    κρατήσεις δεν παρακολουθούσε καμία.
--    → client_stays.declared_at.
--
-- ΓΙΑΤΙ ΔΕΝ ΜΕΤΑΤΡΕΠΟΥΜΕ ΤΑ ΥΠΑΡΧΟΝΤΑ ΠΟΣΑ
-- Δεν ξέρουμε αν το υπάρχον `total` είναι ακαθάριστο ή payout. Ο εισαγωγέας
-- email ζητούσε payout, η χειροκίνητη φόρμα έλεγε «Σύνολο», το iCal δεν γράφει
-- ποσό καθόλου. Κάθε μετατροπή θα ήταν μαντεψιά πάνω σε φορολογικό δεδομένο,
-- σε βάση χωρίς αντίγραφα ασφαλείας. Άρα: το `total` μένει ΑΚΡΙΒΩΣ όπως είναι,
-- σημειώνεται ως απροσδιόριστο (amount_basis='unknown', η προεπιλογή), και το
-- UI ζητά επιβεβαίωση στην πρώτη επόμενη επεξεργασία της διαμονής.
--
-- ΤΟ ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ ΔΕΝ ΕΙΝΑΙ ΕΣΟΔΟ ΤΟΥ ΙΔΙΟΚΤΗΤΗ. Εισπράττεται από τον
-- επισκέπτη για λογαριασμό του κράτους. Γι' αυτό είναι ΞΕΧΩΡΙΣΤΗ στήλη και
-- αφαιρείται από το ακαθάριστο, όχι μέσα σε αυτό.
--
-- ΜΟΝΟ ΠΡΟΣΘΕΤΙΚΟ: `add column if not exists`, καμία στήλη δεν αλλάζει τύπο,
-- τίποτα δεν διαγράφεται, κανένα υπάρχον δεδομένο δεν μετατρέπεται. Η βάση
-- είναι free tier ΧΩΡΙΣ αντίγραφα ασφαλείας — ό,τι δεν είναι προσθετικό δεν
-- επανορθώνεται.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ανάλυση ποσού ανά διαμονή ──────────────────────────────────────────
alter table public.client_stays
  add column if not exists gross_guest_paid numeric,
  add column if not exists platform_fee     numeric,
  add column if not exists climate_levy     numeric,
  add column if not exists amount_basis     text not null default 'unknown',
  add column if not exists declared_at      timestamptz,
  add column if not exists damage_item_id   uuid;

comment on column public.client_stays.gross_guest_paid is
  'Τι πλήρωσε ΣΥΝΟΛΙΚΑ ο επισκέπτης, περιλαμβανομένου του τέλους ανθεκτικότητας. Δηλωτέο ακαθάριστο = gross_guest_paid - climate_levy. Η προμήθεια της πλατφόρμας ΔΕΝ αφαιρείται από το ακαθάριστο (είναι δαπάνη).';
comment on column public.client_stays.platform_fee is
  'Προμήθεια Airbnb/Booking για τη συγκεκριμένη διαμονή. ΔΑΠΑΝΗ, όχι μείωση εσόδου. Δεν αφαιρείται από το δηλωτέο ακαθάριστο.';
comment on column public.client_stays.climate_levy is
  'Τέλος Ανθεκτικότητας στην Κλιματική Κρίση που εισπράχθηκε από τον επισκέπτη. ΔΕΝ είναι έσοδο του ιδιοκτήτη: κρατείται για λογαριασμό του κράτους και αποδίδεται. Αφαιρείται από το ακαθάριστο.';
comment on column public.client_stays.amount_basis is
  'unknown | gross | payout — τι σημαίνει το `total`. unknown = ιστορική εγγραφή πριν τη διάσπαση του ποσού, δεν ξέρουμε αν είναι ακαθάριστο ή payout· το UI ζητά επιβεβαίωση. gross = το `total` είναι δηλωτέο ακαθάριστο (gross_guest_paid - climate_levy). payout = το `total` είναι το ποσό που εισέπραξε ο οικοδεσπότης.';
comment on column public.client_stays.declared_at is
  'Πότε υποβλήθηκε η Δήλωση Βραχυχρόνιας Διαμονής στο myAADE για ΑΥΤΗ την κράτηση (μία ανά κράτηση). NULL = αδήλωτη.';
comment on column public.client_stays.damage_item_id is
  'Το αντικείμενο της απογραφής (inventory_items.id) που φθάρηκε. Δίνει στον λογιστή δαπάνη με παραστατικό αντί για ελεύθερο κείμενο.';

-- Οι τιμές ελέγχονται και στον κώδικα (lib/clients/stayAmounts.ts). Ο
-- περιορισμός εδώ εμποδίζει μια μελλοντική οθόνη να γράψει σκουπίδια που θα
-- έκαναν ένα payout να περάσει για ακαθάριστο. `not valid` ώστε να μην αποτύχει
-- το migration αν κάποια γραμμή έχει απρόσμενη τιμή· οι νέες ελέγχονται.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_stays_amount_basis_chk') then
    alter table public.client_stays
      add constraint client_stays_amount_basis_chk
      check (amount_basis in ('unknown','gross','payout')) not valid;
  end if;
end $$;

-- Ο σύνδεσμος φθοράς → απογραφή. `on delete set null`: αν σβηστεί το
-- αντικείμενο, η διαμονή και η καταγεγραμμένη φθορά ΔΕΝ χάνονται.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_stays_damage_item_fkey') then
    alter table public.client_stays
      add constraint client_stays_damage_item_fkey
      foreign key (damage_item_id) references public.inventory_items(id) on delete set null;
  end if;
end $$;

-- Ο μετρητής «αδήλωτες διαμονές» είναι KPI που τρέχει σε κάθε φόρτωση της
-- καρτέλας: μερικό index μόνο στις αδήλωτες, γιατί αυτές είναι λίγες και
-- αυτές μας ενδιαφέρουν.
create index if not exists client_stays_undeclared_idx
  on public.client_stays(user_id, check_in)
  where declared_at is null;

-- ── 2. Ο ΑΜΑ ως πεδίο του ακινήτου ────────────────────────────────────────
alter table public.user_properties
  add column if not exists ama                    text,
  add column if not exists ama_listed_confirmed_at timestamptz;

comment on column public.user_properties.ama is
  'Αριθμός Μητρώου Ακινήτου (Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής, ΑΑΔΕ). Ζητείται ΑΥΤΟΜΑΤΑ μόλις η κατάσταση γίνει rent_short (lib/property/status.ts readStatus) — όχι πίσω από διακόπτη, όχι πίσω από paywall. Μόνο ψηφία.';
comment on column public.user_properties.ama_listed_confirmed_at is
  'Πότε ο ιδιοκτήτης επιβεβαίωσε ότι ο ΑΜΑ ΑΝΑΓΡΑΦΕΤΑΙ στην αγγελία (Airbnb/Booking). Η καταχώρηση στο μητρώο δεν αρκεί: το 2025 στάλθηκαν 12.145 καταχωρήσεις για απενεργοποίηση επειδή ο ΑΜΑ έλειπε ή ήταν άκυρος ΣΤΗΝ ΑΓΓΕΛΙΑ. NULL = δηλώθηκε αλλά δεν επιβεβαιώθηκε.';
