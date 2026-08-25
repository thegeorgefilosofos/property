-- ═══════════════════════════════════════════════════════════════════════════
-- ΝΟΜΙΚΗ ΜΟΡΦΗ ΚΑΙ ΚΑΤΗΓΟΡΙΑ ΒΙΒΛΙΩΝ — δηλώνονται, δεν μαντεύονται
--
-- ΤΙ ΛΥΝΕΙ. Η μηχανή ορατότητας (lib/property/visibility.ts) και ο φάκελος του
-- λογιστή (lib/accounting/dossier.ts) ρωτούν «είναι φυσικό ή νομικό πρόσωπο και
-- τι βιβλία κρατά», γιατί από αυτό κρίνεται αν ο χρήστης θα δει ΕΦΚΑ, απόσβεση
-- κτιρίου, Ε3 και τη λέξη «ισολογισμός». Μέχρι τώρα η στήλη δεν υπήρχε καν και
-- η ανάγνωση έπεφτε πάντα στο ασφαλές 'individual' — δηλαδή μια ΙΚΕ δεν έβλεπε
-- ποτέ τις υποχρεωτικές της καταστάσεις.
--
-- ΓΙΑΤΙ ΔΕΝ ΤΟ ΣΥΜΠΕΡΑΙΝΟΥΜΕ ΑΠΟ ΤΟ profile_type. Το profile_type ξεχωρίζει
-- «ιδιώτη» από «επαγγελματία διαχειριστή» — άλλο πράγμα. Ένας επαγγελματίας
-- διαχειριστής δεν είναι απαραίτητα νομικό πρόσωπο και μια λάθος μαντεψιά
-- τρομάζει έναν ιδιώτη με ένα διαμέρισμα δείχνοντάς του ΕΦΚΑ.
--
-- ΓΙΑΤΙ ΔΥΟ ΞΕΧΩΡΙΣΤΕΣ ΣΤΗΛΕΣ. Η νομική μορφή δεν ορίζει μόνη της τα βιβλία:
-- μια Ο.Ε. μπορεί να είναι απλογραφικά, μια ΙΚΕ είναι διπλογραφικά. Ο
-- ισολογισμός κρέμεται από τα ΒΙΒΛΙΑ, όχι από τη μορφή — γι' αυτό χωριστά.
-- Το lib/accounting/dossier.ts προτείνει προεπιλογή μέσω defaultBookkeeping(),
-- αλλά ο χρήστης έχει τον τελευταίο λόγο.
--
-- ΜΟΝΟ ΠΡΟΣΘΕΤΙΚΟ: add column if not exists, με προεπιλογές που κρατούν την
-- υπάρχουσα συμπεριφορά για κάθε υπάρχουσα γραμμή. Καμία στήλη δεν αλλάζει
-- τύπο, τίποτα δεν διαγράφεται. Η βάση είναι σε free tier χωρίς αντίγραφα
-- ασφαλείας — ό,τι δεν είναι προσθετικό δεν επανορθώνεται.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.billing_profiles
  add column if not exists legal_form  text not null default 'individual',
  add column if not exists bookkeeping text not null default 'none';

comment on column public.billing_profiles.legal_form is
  'individual | sole_trader | partnership | company — δηλώνεται από τον χρήστη. Καθορίζει αν εμφανίζονται επιχειρηματικές υποχρεώσεις (ΕΦΚΑ, Ε3, απόσβεση κτιρίου).';
comment on column public.billing_profiles.bookkeeping is
  'none | single_entry | double_entry — ο ισολογισμός εμφανίζεται ΜΟΝΟ στα διπλογραφικά, ποτέ σε φυσικό πρόσωπο.';

-- Οι τιμές ελέγχονται και στον κώδικα (lib/accounting/dossier.ts), αλλά ένας
-- περιορισμός εδώ εμποδίζει μια μελλοντική οθόνη να γράψει σκουπίδια που θα
-- έκρυβαν σιωπηλά υποχρεώσεις. `not valid` ώστε να μην αποτύχει το migration
-- αν κάποια παλιά γραμμή έχει απρόσμενη τιμή· οι νέες εγγραφές ελέγχονται.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billing_profiles_legal_form_chk') then
    alter table public.billing_profiles
      add constraint billing_profiles_legal_form_chk
      check (legal_form in ('individual','sole_trader','partnership','company')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'billing_profiles_bookkeeping_chk') then
    alter table public.billing_profiles
      add constraint billing_profiles_bookkeeping_chk
      check (bookkeeping in ('none','single_entry','double_entry')) not valid;
  end if;
end $$;
