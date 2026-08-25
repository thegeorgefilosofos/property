-- ═══════════════════════════════════════════════════════════════════════════
-- ΣΑΡΑΝΤΑ ΤΡΕΙΣ ΣΥΝΑΡΤΗΣΕΙΣ ΠΟΥ ΜΠΟΡΟΥΣΕ ΝΑ ΚΑΛΕΣΕΙ Ο ΚΑΘΕΝΑΣ
--
-- ΤΙ ΒΡΕΘΗΚΕ. Ο ελεγκτής ασφαλείας του Supabase ανέφερε πενήντα τρεις
-- `SECURITY DEFINER` συναρτήσεις εκτελέσιμες από τον ρόλο `anon`, δηλαδή
-- καλέσιμες χωρίς καμία σύνδεση μέσω `/rest/v1/rpc/<όνομα>`. Το `SECURITY
-- DEFINER` σημαίνει ότι τρέχουν με τα δικαιώματα του κατόχου τους, όχι του
-- καλούντος: ό,τι ελέγχει το RLS δεν τις αφορά.
--
-- Ανάμεσά τους, ονομαστικά:
--   drain_email_outbox(integer)   αδειάζει την ουρά μηνυμάτων
--   enqueue_email(...)            βάζει μήνυμα προς αποστολή
--   delete_my_account()           διαγράφει λογαριασμό
--   export_my_data()              εξάγει τα δεδομένα του χρήστη
--   invite_org_member(...)        προσκαλεί μέλος σε οργανισμό
--   set_org_member_role(...)      αλλάζει ρόλο μέλους
--   set_portal_pin(...)           ορίζει PIN πύλης ενοικιαστή
--
-- Οι περισσότερες αντλούν ταυτότητα από `auth.uid()`, που για τον `anon` είναι
-- NULL, οπότε πιθανότατα δεν κάνουν τίποτα. Το «πιθανότατα» δεν είναι μοντέλο
-- ασφαλείας: το δικαίωμα εκτέλεσης δεν πρέπει να υπάρχει καθόλου.
--
-- ΤΙ ΜΕΝΕΙ ΑΝΟΙΧΤΟ, ΚΑΙ ΓΙΑΤΙ. Δέκα συναρτήσεις ΠΡΕΠΕΙ να καλούνται χωρίς
-- σύνδεση: είναι οι δημόσιες ροές και αυθεντικοποιούνται με το ίδιο τους το
-- όρισμα (κρυπτογραφικό token στον σύνδεσμο). Ο κατάλογος δεν γράφτηκε με το
-- μάτι — βγήκε από τις σελίδες που τρέχουν χωρίς συνεδρία:
--
--   app/portal/[token]      get_portal_data, portal_meta,
--                           submit_maintenance_request, declare_rent_payment
--   app/checkin/[token]     get_checkin_context, submit_checkin
--   app/accountant/[token]  get_accountant_data
--   app/unsubscribe/[token] unsubscribe_email, marketing_prefs_by_token
--   app/verify/[id]         verify_document
--
-- Καμία άλλη κλήση RPC δεν γίνεται από ανώνυμη σελίδα. Οι υπόλοιπες γίνονται
-- είτε από το συνδεδεμένο ταμπλό (ρόλος `authenticated`, ανέπαφος εδώ) είτε
-- από edge functions με τον ρόλο υπηρεσίας, που παρακάμπτει τα grants.
--
-- ΓΙΑΤΙ ΒΡΟΧΟΣ ΚΑΙ ΟΧΙ ΣΑΡΑΝΤΑ ΤΡΕΙΣ ΓΡΑΜΜΕΣ. Το `REVOKE` απαιτεί ΠΛΗΡΗ
-- υπογραφή με τους τύπους των ορισμάτων. Γραμμένες στο χέρι, μία λάθος
-- υπογραφή περνά αθόρυβα (το REVOKE σε ανύπαρκτη συνάρτηση σφάλλει, αλλά σε
-- υπερφορτωμένη με άλλους τύπους αφαιρεί ΑΛΛΗ). Ο κατάλογος διαβάζεται από
-- τον ίδιο τον κατάλογο του Postgres, άρα οι υπογραφές είναι εξ ορισμού σωστές.
--
-- ΤΟ ΛΑΘΟΣ ΠΟΥ ΕΙΧΕ ΑΥΤΟ ΤΟ MIGRATION ΣΤΗΝ ΠΡΩΤΗ ΤΟΥ ΜΟΡΦΗ, ΚΑΙ ΓΙΑΤΙ ΑΞΙΖΕΙ
-- ΝΑ ΓΡΑΦΤΕΙ. Έλεγε μόνο `REVOKE ... FROM anon`, εκτελέστηκε χωρίς σφάλμα και
-- δεν άλλαξε τίποτα για σαράντα τρεις από τις πενήντα τρεις. Ο λόγος: η Postgres
-- δίνει EXECUTE στο ψευδο-ρόλο `PUBLIC` εξ ορισμού σε κάθε νέα συνάρτηση και ο
-- `anon` το κληρονομεί από εκεί. Αφαιρώντας το ΡΗΤΟ δικαίωμα του `anon` δεν
-- αγγίζεις το κληρονομημένο — και το `has_function_privilege('anon', …)` έμενε
-- true. Ένα migration που «πέτυχε» χωρίς να διορθώσει τίποτα είναι χειρότερο από
-- ένα που απέτυχε: κλείνει το εισιτήριο και αφήνει την τρύπα ανοιχτή.
--
-- Άρα αφαιρείται και από τα δύο και ΞΑΝΑΔΙΝΕΤΑΙ ρητά σε `authenticated` και
-- `service_role` — γιατί κι εκείνοι το άντλησαν από το PUBLIC σε μερικές
-- περιπτώσεις και το ταμπλό δεν επιτρέπεται να χάσει ούτε μία λειτουργία.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  fn record;
  n int := 0;
  -- Οι δημόσιες ροές. Ό,τι δεν είναι εδώ, δεν καλείται ποτέ χωρίς σύνδεση.
  public_rpc text[] := array[
    'get_portal_data', 'portal_meta', 'submit_maintenance_request', 'declare_rent_payment',
    'get_checkin_context', 'submit_checkin',
    'get_accountant_data',
    'unsubscribe_email', 'marketing_prefs_by_token',
    'verify_document'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef                                  -- μόνο SECURITY DEFINER
      and not (p.proname = any(public_rpc))
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    -- ΚΑΙ ΑΠΟ ΤΟ PUBLIC: εκεί ζει το εξ ορισμού δικαίωμα και από εκεί το
    -- κληρονομεί ο `anon`. Χωρίς αυτή τη γραμμή το migration δεν κάνει τίποτα.
    execute format('revoke execute on function %s from public, anon', fn.sig);
    -- Και πίσω, ρητά, σε όσους το χρειάζονται: το ταμπλό και οι edge functions.
    execute format('grant execute on function %s to authenticated, service_role', fn.sig);
    n := n + 1;
  end loop;
  raise notice 'Αφαιρέθηκε το δικαίωμα εκτέλεσης από τον anon σε % συναρτήσεις.', n;
end
$$;

-- ── Η ΜΙΑ ΣΥΝΑΡΤΗΣΗ ΜΕ ΜΕΤΑΒΛΗΤΟ search_path ──────────────────────────────
-- Το `20260804090000_pin_function_search_path` κάρφωσε το search_path σε όλες
-- τις υπόλοιπες. Αυτή προστέθηκε αργότερα και το έχασε. Χωρίς καρφωμένο
-- search_path, ο καλών μπορεί να στρέψει την επίλυση ονομάτων σε δικό του
-- schema — η κλασική διαδρομή κλιμάκωσης δικαιωμάτων σε συναρτήσεις Postgres.
alter function public.plan_max_properties(integer) set search_path = public, pg_temp;

-- ── ΤΙ ΔΕΝ ΚΑΝΕΙ ΑΥΤΟ ΤΟ MIGRATION ────────────────────────────────────────
-- Δεν αγγίζει τον ρόλο `authenticated`: κάθε λειτουργία του ταμπλό δουλεύει
-- ακριβώς όπως πριν. Και δεν εμποδίζει μια ΝΕΑ συνάρτηση να γεννηθεί ξανά
-- εκτελέσιμη από τον `anon` — η Postgres δίνει EXECUTE στο PUBLIC εξ ορισμού.
-- Ο έλεγχος ασφαλείας του Supabase το πιάνει και πρέπει να τρέχει μετά από
-- κάθε migration που προσθέτει συνάρτηση.
