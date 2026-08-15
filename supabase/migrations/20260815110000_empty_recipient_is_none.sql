-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΕΝΗ ΔΙΕΥΘΥΝΣΗ ΔΕΝ ΕΙΝΑΙ ΕΠΙΒΕΒΑΙΩΜΕΝΗ ΔΙΕΥΘΥΝΣΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ. Ο χρήστης ανοίγει «Λογαριασμός, Ειδοποιήσεις», πατά τον διακόπτη
-- «Υπενθυμίσεις με email», η οθόνη αυτοαποθηκεύει και γράφει «Αποθηκεύτηκε».
-- Και δεν λαμβάνει ποτέ τίποτα, χωρίς καμία ένδειξη πουθενά.
--
-- Η αιτία ήταν διπλή, και το δεύτερο σκέλος είναι εδώ. Η οθόνη ξεκινούσε με
-- `reminder_email: ''` και τίποτα δεν προσυμπλήρωνε τη διεύθυνση του
-- λογαριασμού, οπότε η γραμμή γραφόταν με ΚΕΝΗ διεύθυνση. Και η
-- `reminder_recipients()` δεν επέστρεφε `null` γι' αυτήν: το δεύτερο σκέλος
-- του `case` συγκρίνει `trim('')` με `trim(coalesce(null,''))`, βγάζει `true`,
-- και θεωρεί το κενό «επιβεβαιωμένο». Η συνάρτηση γύριζε ΚΕΝΟ STRING.
--
-- Το προϊόν σωζόταν από ένα `if (r.email)` στην TypeScript του
-- `send-reminders/index.ts`. Δηλαδή η βάση έλεγε «να, ο παραλήπτης» και ο
-- πελάτης της την αγνοούσε. Οταν η ορθότητα κρέμεται από έλεγχο falsy σε άλλη
-- γλώσσα, η επόμενη κλήση από άλλο σημείο θα στείλει σε κενή διεύθυνση.
--
-- ΤΙ ΑΛΛΑΖΕΙ. Το κενό, τα κενά διαστήματα και το NULL αντιμετωπίζονται ως
-- απουσία. Η συνάρτηση επιστρέφει `null` και ο έλεγχος `if (!to) continue`
-- κάνει πια τη σωστή δουλειά αντί να καλύπτει σφάλμα από πάνω.
--
-- ΤΙ ΔΕΝ ΚΑΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ, ΚΑΙ ΓΙΑΤΙ. Δεν συμπληρώνει τις υπάρχουσες
-- γραμμές που έχουν `email_enabled = true` και κενή διεύθυνση. Ενα τέτοιο
-- backfill ΑΡΧΙΖΕΙ να στέλνει μηνύματα σε ανθρώπους που μέχρι σήμερα δεν
-- λάμβαναν. Αυτό είναι απόφαση προϊόντος και θέλει ρητή έγκριση, όχι σιωπηλή
-- μετανάστευση. Οι χρήστες αυτοί διορθώνονται μόνοι τους την επόμενη φορά που
-- θα ανοίξουν την οθόνη, επειδή η διεπαφή προσυμπληρώνει πλέον τη διεύθυνση
-- του λογαριασμού όταν το πεδίο είναι κενό.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reminder_recipients()
returns table (user_id uuid, email text)
language sql stable security definer
set search_path = 'public', 'pg_temp'
as $$
  select p.user_id,
         case
           -- Η διεύθυνση του ίδιου του λογαριασμού περνά χωρίς δεύτερη
           -- επιβεβαίωση: είναι ήδη επαληθευμένη από την εγγραφή.
           when nullif(trim(coalesce(p.reminder_email, '')), '') is not null
            and lower(trim(p.reminder_email)) = lower(trim(coalesce(u.email, '')))
             then u.email
           -- Καθε άλλη διεύθυνση θέλει τη δική της επιβεβαίωση.
           when nullif(trim(coalesce(p.reminder_email, '')), '') is not null
            and lower(trim(p.reminder_email)) = lower(trim(coalesce(p.reminder_email_verified, '')))
             then p.reminder_email
           else null
         end as email
    from notification_preferences p
    join auth.users u on u.id = p.user_id
   where coalesce(p.email_enabled, true)
     and u.email_confirmed_at is not null
$$;

revoke all on function public.reminder_recipients() from public;
revoke all on function public.reminder_recipients() from anon;
revoke all on function public.reminder_recipients() from authenticated;
grant execute on function public.reminder_recipients() to service_role;

comment on function public.reminder_recipients() is
  'Παραλήπτες υπενθυμίσεων. Κενή διεύθυνση, κενά διαστήματα και NULL είναι '
  'απουσία και επιστρέφουν null: το κενό string περνούσε ως «επιβεβαιωμένο» '
  'και η αποφυγή της αποστολής κρεμόταν από έλεγχο falsy στην TypeScript.';
