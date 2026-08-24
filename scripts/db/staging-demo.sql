-- ═══════════════════════════════════════════════════════════════════════════
--  ΛΟΓΑΡΙΑΣΜΟΣ ΔΟΚΙΜΩΝ ΜΕ ΠΡΑΓΜΑΤΙΚΑ ΔΕΔΟΜΕΝΑ, ΓΙΑ ΤΟ STAGING
-- ─────────────────────────────────────────────────────────────────────────
--  ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Οι οθόνες ελέγχονται σήμερα ως απόδοση σε Node, χωρίς βάση.
--  Ό,τι αφορά αισθητική με ΓΕΜΑΤΕΣ οθόνες — στοίχιση αριθμών, πλάτη στηλών,
--  τι γίνεται με δώδεκα κατηγορίες δαπανών αντί για δύο — δεν επαληθεύεται
--  χωρίς δεδομένα. Αυτό το αρχείο φτιάχνει μια χρονιά που μοιάζει με αληθινή.
--
--  ΠΟΥ ΤΡΕΧΕΙ. ΜΟΝΟ στο staging (properwise-staging), από τον SQL Editor.
--  Σταματά μόνο του αν βρει παραγωγικά δεδομένα, ώστε ένα λάθος αντιγραφή
--  επικόλληση σε λάθος καρτέλα να μη γράψει ποτέ σε πραγματικό λογαριασμό.
--
--  ΠΩΣ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ.
--    1. Φτιάξε τον χρήστη ΑΠΟ ΤΟ PANEL: Authentication → Add user →
--       demo@properwise.gr, με κωδικό της επιλογής σου, «Auto Confirm User».
--       Ο χρήστης ΔΕΝ φτιάχνεται εδώ: το auth.users θέλει κρυπτογράφηση
--       κωδικού που ανήκει στην πλατφόρμα, και μισοφτιαγμένος χρήστης δεν
--       συνδέεται ποτέ.
--    2. Τρέξε αυτό το αρχείο.
--    3. Σύνδεση με τον ίδιο κωδικό. Ο κωδικός δεν γράφεται πουθενά εδώ.
--
--  ΤΙ ΦΤΙΑΧΝΕΙ. Ένα διαμέρισμα με μακροχρόνια μίσθωση και ένα με βραχυχρόνια,
--  δώδεκα μισθώματα, δεκαοκτώ δαπάνες σε δέκα κατηγορίες, οκτώ κρατήσεις με
--  ανάλυση ποσού, και ένα δάνειο. Ίδια δεδομένα με το σενάριο του
--  lib/accounting/scenarios.test.ts, ώστε ό,τι βλέπεις στην οθόνη να μπορεί να
--  συγκριθεί με νούμερα που ήδη ελέγχονται.
-- ═══════════════════════════════════════════════════════════════════════════

do $seed$
declare
  uid uuid;
  p_long uuid;
  p_short uuid;
  users_total int;
  i int;
begin
  -- ── ΑΣΦΑΛΕΙΑ: ΠΟΤΕ ΣΕ ΒΑΣΗ ΜΕ ΚΟΣΜΟ ΜΕΣΑ ────────────────────────────────
  select count(*) into users_total from auth.users;
  if users_total > 20 then
    raise exception 'ΑΚΥΡΟ: η βάση έχει % χρήστες. Αυτό το αρχείο τρέχει μόνο στο staging.', users_total;
  end if;

  select id into uid from auth.users where email = 'demo@properwise.gr';
  if uid is null then
    raise exception 'Δεν βρέθηκε ο demo@properwise.gr. Φτιάξ'' τον πρώτα από Authentication → Add user, με Auto Confirm.';
  end if;

  -- Ξαναγράψιμο από την αρχή: το σενάριο πρέπει να δίνει το ΙΔΙΟ αποτέλεσμα
  -- κάθε φορά, αλλιώς δεν συγκρίνεται με τίποτα.
  delete from public.client_stays where user_id = uid;
  delete from public.clients where user_id = uid;
  delete from public.user_properties where user_id = uid;

  -- Το πλάνο, ώστε να μη χτυπήσει το όριο ακινήτων στο δεύτερο διαμέρισμα.
  insert into public.billing_profiles(user_id, plan, subscription_status, full_name)
    values (uid, 'pro', 'active', 'Λογαριασμός δοκιμών')
  on conflict (user_id) do update set plan = 'pro', subscription_status = 'active';

  -- ── ΤΑ ΔΥΟ ΑΚΙΝΗΤΑ ──────────────────────────────────────────────────────
  insert into public.user_properties(user_id, name, prop_type, address, sqm, value, year_built, status_detail, rental_mode, enfia)
    values (uid, 'Διαμέρισμα Παγκράτι', 'Κατοικία', 'Υμηττού 100, Αθήνα', 78, 150000, 1998, 'rented', 'long_term', 340)
    returning id into p_long;

  insert into public.user_properties(user_id, name, prop_type, address, sqm, value, year_built, status_detail, rental_mode, enfia)
    values (uid, 'Στούντιο Κουκάκι', 'Κατοικία', 'Δράκου 12, Αθήνα', 42, 120000, 2005, 'rent_short', 'short_term', 210)
    returning id into p_short;

  -- ── ΔΩΔΕΚΑ ΜΙΣΘΩΜΑΤΑ, ΕΙΣΠΡΑΓΜΕΝΑ ───────────────────────────────────────
  -- Ο Δεκέμβριος πληρώνεται τον Ιανουάριο του επόμενου έτους: είναι η
  -- περίπτωση που έσπαγε το ισοζύγιο, και πρέπει να φαίνεται στην οθόνη.
  for i in 1..12 loop
    insert into public.rent_payments(user_id, property_id, period_year, period_month, amount, paid, due_date, paid_date)
      values (uid, p_long, 2026, i, 650,
              true,
              format('2026-%s-05', lpad(i::text, 2, '0'))::date,
              case when i = 12 then '2027-01-08'::date
                   else format('2026-%s-05', lpad(i::text, 2, '0'))::date end);
  end loop;

  -- ── ΔΕΚΑΟΚΤΩ ΔΑΠΑΝΕΣ ΣΕ ΔΕΚΑ ΚΑΤΗΓΟΡΙΕΣ ────────────────────────────────
  insert into public.expenses(user_id, property_id, date, amount, category, description) values
    (uid, p_long, '2026-01-20',   88.50, 'Ρεύμα',                  'ΔΕΗ Δεκεμβρίου'),
    (uid, p_long, '2026-03-20',   94.20, 'Ρεύμα',                  'ΔΕΗ Φεβρουαρίου'),
    (uid, p_long, '2026-05-20',   61.00, 'Ρεύμα',                  'ΔΕΗ Απριλίου'),
    (uid, p_long, '2026-07-20',  130.40, 'Ρεύμα',                  'ΔΕΗ Ιουνίου'),
    (uid, p_long, '2026-02-10',   24.60, 'Νερό',                   'ΕΥΔΑΠ'),
    (uid, p_long, '2026-08-10',   31.20, 'Νερό',                   'ΕΥΔΑΠ'),
    (uid, p_long, '2026-01-15',   29.90, 'Internet και τηλέφωνο',  'Σύνδεση ακινήτου'),
    (uid, p_long, '2026-06-15',   29.90, 'Internet και τηλέφωνο',  'Σύνδεση ακινήτου'),
    (uid, p_long, '2026-04-01',  180.00, 'Ασφάλεια',               'Ασφαλιστήριο κατοικίας'),
    (uid, p_long, '2026-06-01',  340.00, 'ΕΝΦΙΑ',                  'Α΄ δόση'),
    (uid, p_long, '2026-03-05',   45.00, 'Δημοτικά τέλη',          'Τέλη καθαριότητας'),
    (uid, p_long, '2026-02-18', 8000.00, 'Ανακαίνιση',             'Μπάνιο και κουζίνα'),
    (uid, p_long, '2026-05-06',  480.00, 'Έπιπλα',                 'Πλυντήριο'),
    (uid, p_long, '2026-09-12',  120.00, 'Υδραυλικός',             'Διαρροή καλοριφέρ'),
    (uid, p_long, '2026-10-03',   90.00, 'Καθαριότητα',            'Γενικός καθαρισμός'),
    (uid, p_long, '2026-11-20',   65.00, 'Απεντόμωση',             'Ετήσια'),
    (uid, p_long, '2026-04-22',  150.00, 'Κοινόχρηστα',            'Εκκαθάριση Α΄ εξαμήνου'),
    (uid, p_long, '2026-12-01',  200.00, 'Μεσιτικά',               'Ανανέωση μίσθωσης');

  -- ── ΟΚΤΩ ΚΡΑΤΗΣΕΙΣ, ΜΕ ΑΝΑΛΥΣΗ ΠΟΣΟΥ ───────────────────────────────────
  -- Η έβδομη είναι απευθείας, χωρίς προμήθεια. Η όγδοη είναι Airbnb ΧΩΡΙΣ
  -- καταγεγραμμένη προμήθεια: το κενό που ο φάκελος του λογιστή ονομάζει
  -- ρητά, αντί να το γεμίσει με εκτίμηση.
  -- Ο επισκέπτης είναι πελάτης και η διαμονή κρέμεται από αυτόν. Το
  -- `property_id` ήταν κείμενο ώς το 20260815100000 και χρειαζόταν ρητό cast
  -- εδώ· τώρα είναι `uuid` όπως παντού, οπότε το cast έφυγε.
  insert into public.clients(id, user_id, type, full_name, email)
  select gen_random_uuid(), uid, 'client', g.name, g.mail
    from (values
      ('Marco R.', 'marco@demo.test'), ('Anna S.', 'anna@demo.test'),
      ('Lukas B.', 'lukas@demo.test'), ('Sophie D.', 'sophie@demo.test'),
      ('Hiroshi T.', 'hiroshi@demo.test'), ('Elena P.', 'elena@demo.test'),
      ('Γιώργος Κ.', 'giorgos@demo.test'), ('Nina V.', 'nina@demo.test')
    ) as g(name, mail);

  insert into public.client_stays(user_id, client_id, property_id, check_in, check_out, nights, channel,
                                  gross_guest_paid, climate_levy, platform_fee, total, amount_basis)
  select uid, c.id, p_short, s.cin::date, s.cout::date, 4, s.ch,
         s.gross, 8, s.fee, s.gross - 8 - s.fee, 'gross'
    from (values
      ('Marco R.',   '2026-05-10', '2026-05-14', 'airbnb',   508,  60),
      ('Anna S.',    '2026-06-10', '2026-06-14', 'airbnb',   608,  75),
      ('Lukas B.',   '2026-07-10', '2026-07-14', 'booking',  808, 100),
      ('Sophie D.',  '2026-07-20', '2026-07-24', 'airbnb',   908, 120),
      ('Hiroshi T.', '2026-08-05', '2026-08-09', 'booking', 1008, 135),
      ('Elena P.',   '2026-08-18', '2026-08-22', 'airbnb',   908, 110),
      ('Γιώργος Κ.', '2026-09-05', '2026-09-09', 'direct',   408,   0),
      ('Nina V.',    '2026-09-20', '2026-09-24', 'airbnb',   508,   0)
    ) as s(guest, cin, cout, ch, gross, fee)
    join public.clients c on c.user_id = uid and c.full_name = s.guest;

  -- ── ΕΝΑ ΔΑΝΕΙΟ ──────────────────────────────────────────────────────────
  insert into public.loans(user_id, property_id, bank, loan_amount, rate_type, fixed_rate, years, start_date)
    values (uid, p_long, 'Τράπεζα δοκιμών', 90000, 'fixed', 4.2, 20, '2022-03-01');

  raise notice 'Έτοιμο. Δύο ακίνητα, 12 μισθώματα, 18 δαπάνες, 8 κρατήσεις, 1 δάνειο, χρήση 2026.';
end $seed$;
