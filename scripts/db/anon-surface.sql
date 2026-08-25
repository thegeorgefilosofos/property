-- ═══════════════════════════════════════════════════════════════════════════
--  ΤΙ ΜΠΟΡΕΙ ΝΑ ΚΑΛΕΣΕΙ ΚΑΠΟΙΟΣ ΧΩΡΙΣ ΝΑ ΕΧΕΙ ΛΟΓΑΡΙΑΣΜΟ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΑΠΟΤΡΕΠΕΙ. Μια συνάρτηση SECURITY DEFINER τρέχει με
--  δικαιώματα του κατόχου: ΠΑΡΑΚΑΜΠΤΕΙ την RLS εκ κατασκευής. Όταν είναι και
--  εκτελέσιμη από τον ρόλο `anon`, γίνεται δημόσια διαδρομή προς όλα τα
--  δεδομένα, ανοιχτή σε οποιονδήποτε ξέρει τη διεύθυνση του project.
--
--  Δεν είναι υποθετικό: ο έλεγχος της Supabase βρήκε την `owns_parent_property`
--  εκτελέσιμη από ανώνυμο. Δεν την πρόσθεσε κανείς επίτηδες — γεννήθηκε έτσι,
--  γιατί το προεπιλεγμένο δικαίωμα εκτέλεσης στην PostgreSQL είναι «όλοι».
--
--  Ο ΚΑΝΟΝΑΣ. Κάθε συνάρτηση που φτάνει στον ανώνυμο πρέπει να είναι ΓΡΑΜΜΕΝΗ
--  εδώ, με τον λόγο της. Καινούρια που εμφανίζεται χωρίς γραμμή, κοκκινίζει.
--  Γραμμή που περισσεύει, κοκκινίζει επίσης: ο κατάλογος δεν επιτρέπεται να
--  γεμίσει με ονόματα που δεν υπάρχουν πια, γιατί τότε κανείς δεν τον διαβάζει.
--
--  ΤΟ ΚΡΙΤΗΡΙΟ ΓΙΑ ΝΑ ΜΠΕΙ ΚΑΤΙ ΕΔΩ. Πρέπει να είναι πύλη με μυστικό στο χέρι
--  του επισκέπτη: ένα token που στέλνει ο ιδιοκτήτης. Κάθε μία από τις
--  παρακάτω ξεκινά επαληθεύοντας το token σε πίνακα συνδέσμων, με `active` και
--  `expires_at` και ό,τι αγγίζει μετά είναι δεμένο σε ΕΚΕΙΝΟΝ τον σύνδεσμο.
--  Χωρίς έγκυρο token επιστρέφουν κενό, όχι σφάλμα που αποκαλύπτει ύπαρξη.
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table expected_anon (name text primary key, why text);
insert into expected_anon values
  ('confirm_reminder_email',    'Ο παραλήπτης πατά τον σύνδεσμο επιβεβαίωσης από το email του. Το token είναι uuid μιας χρήσης.'),
  ('declare_rent_payment',      'Ο μισθωτής δηλώνει ότι πλήρωσε, από την πύλη του. Ενημερώνει ΜΟΝΟ δόση του ακινήτου του συνδέσμου και μόνο απλήρωτη.'),
  ('get_accountant_data',       'Ο λογιστής ανοίγει τον σύνδεσμο που του έστειλε ο ιδιοκτήτης. Επιστρέφει μόνο τα ακίνητα ΕΚΕΙΝΟΥ του ιδιοκτήτη.'),
  ('get_checkin_context',       'Ο επισκέπτης ανοίγει τη φόρμα άφιξης. Επιστρέφει όνομα και διεύθυνση καταλύματος, τίποτα άλλο.'),
  ('get_portal_data',           'Η πύλη του μισθωτή, με token ΚΑΙ PIN. Οι αποτυχημένες προσπάθειες μετριούνται σε portal_pin_attempts.'),
  ('marketing_prefs_by_token',  'Ο παραλήπτης βλέπει τις προτιμήσεις του από σύνδεσμο email, για να τις αλλάξει.'),
  ('portal_meta',               'Τι είδους πύλη είναι και αν ζητά PIN. Απαντά πριν τη σύνδεση, χωρίς δεδομένα.'),
  ('submit_checkin',            'Ο επισκέπτης υποβάλλει τα στοιχεία άφιξης. Γράφει μόνο στο κατάλυμα του συνδέσμου.'),
  ('submit_maintenance_request','Ο μισθωτής αναφέρει βλάβη από την πύλη του.'),
  ('unsubscribe_email',         'Διαγραφή από λίστα με ένα κλικ, από τον σύνδεσμο του email. Υποχρέωση, όχι επιλογή.'),
  ('verify_document',           'Επαλήθευση γνησιότητας εγγράφου που εκδώσαμε, από το αναγνωριστικό που φέρει τυπωμένο πάνω του.');

do $audit$
declare
  extra text;
  missing text;
  unsafe text;
begin
  -- ── 1. ΚΑΜΙΑ ΚΑΙΝΟΥΡΙΑ ΔΗΜΟΣΙΑ ΔΙΑΔΡΟΜΗ ΧΩΡΙΣ ΓΡΑΨΙΜΟ ────────────────────
  select string_agg(p.proname, ', ' order by p.proname) into extra
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in (select name from expected_anon);
  if extra is not null then
    raise exception E'ΝΕΑ ΔΗΜΟΣΙΑ ΔΙΑΔΡΟΜΗ ΧΩΡΙΣ ΑΙΤΙΟΛΟΓΙΑ: %\n  Μια SECURITY DEFINER εκτελέσιμη από ανώνυμο παρακάμπτει την RLS.\n  Αν είναι σκόπιμο, γράψ'' το στο scripts/db/anon-surface.sql με τον λόγο.\n  Αν όχι: revoke all on function public.%%(...) from anon;', extra;
  end if;

  -- ── 2. ΚΑΙ Ο ΚΑΤΑΛΟΓΟΣ ΔΕΝ ΚΡΑΤΑ ΦΑΝΤΑΣΜΑΤΑ ─────────────────────────────
  select string_agg(e.name, ', ' order by e.name) into missing
    from expected_anon e
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = e.name
        and has_function_privilege('anon', p.oid, 'execute'));
  if missing is not null then
    raise exception 'ΓΡΑΜΜΕΣ ΠΟΥ ΠΕΡΙΣΣΕΥΟΥΝ: %. Δεν υπάρχουν πια ή δεν είναι ανοιχτές στον ανώνυμο. Σβήσε τες, αλλιώς ο κατάλογος γίνεται διακοσμητικός.', missing;
  end if;

  -- ── 3. ΚΑΘΕ SECURITY DEFINER ΚΛΕΙΔΩΝΕΙ ΤΟ SEARCH_PATH ────────────────────
  -- Χωρίς αυτό, ποιος πίνακας θα διαβαστεί εξαρτάται από τη συνεδρία που
  -- καλεί. Είναι ο κλασικός τρόπος να στραφεί μια συνάρτηση εναντίον της βάσης
  -- της. Ένας trigger είχε ξεφύγει· δεν ξαναγίνεται σιωπηλά.
  select string_agg(p.proname, ', ' order by p.proname) into unsafe
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and (p.proconfig is null or not exists (
       select 1 from unnest(p.proconfig) c where c like 'search\_path=%'));
  if unsafe is not null then
    raise exception 'SECURITY DEFINER ΧΩΡΙΣ ΚΛΕΙΔΩΜΕΝΟ SEARCH_PATH: %', unsafe;
  end if;

  raise notice 'probe: 11 δημόσιες διαδρομές, όλες γραμμένες· κάθε SECURITY DEFINER κλειδώνει το search_path';
end $audit$;

drop table expected_anon;
