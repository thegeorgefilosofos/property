-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΕΝΑΣ TRIGGER ΠΟΥ ΞΕΧΑΣΤΗΚΕ ΧΩΡΙΣ ΚΛΕΙΔΩΜΕΝΟ SEARCH_PATH
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΒΡΕΘΗΚΕ. Ο έλεγχος ασφαλείας της Supabase πάνω στην ΠΑΡΑΓΩΓΗ βρήκε μία
-- συνάρτηση με μεταβλητό search_path: την `reminder_email_reverify`. Είκοσι
-- επτά αρχεία μεταναστεύσεων γράφουν ρητά `set search_path = 'public',
-- 'pg_temp'`· αυτή γράφτηκε χωρίς, γιατί είναι trigger και έμοιαζε αθώα.
--
-- ΓΙΑΤΙ ΕΧΕΙ ΣΗΜΑΣΙΑ. Χωρίς κλειδωμένο search_path, το ποια `is distinct from`
-- ή ποιος τελεστής θα τρέξει εξαρτάται από το search_path της συνεδρίας που
-- κάνει το UPDATE. Ένας ρόλος που μπορεί να δημιουργήσει schema μπροστά από το
-- `public` αλλάζει τη συμπεριφορά του trigger χωρίς να αγγίξει τον κώδικά του.
-- Εδώ ο trigger σβήνει την επαλήθευση διεύθυνσης όταν αλλάξει το email: αν
-- πάψει να τρέχει σωστά, υπενθυμίσεις φεύγουν σε διεύθυνση που δεν
-- επιβεβαιώθηκε ποτέ.
--
-- Η ΣΥΜΠΕΡΙΦΟΡΑ ΔΕΝ ΑΛΛΑΖΕΙ. Ίδιο σώμα, ίδιος trigger· μόνο το search_path
-- κλειδώνει, όπως στις υπόλοιπες συναρτήσεις του σχήματος.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reminder_email_reverify()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if new.reminder_email is distinct from old.reminder_email then
    new.reminder_email_verified := null;
    new.reminder_email_token := null;
    new.reminder_email_token_at := null;
  end if;
  return new;
end $$;
