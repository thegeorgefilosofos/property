-- ═══════════════════════════════════════════════════════════════════════════
--  ΟΙ ΒΟΗΘΟΙ ΤΗΣ RLS ΦΕΥΓΟΥΝ ΑΠΟ ΤΟ ΔΗΜΟΣΙΟ ΣΧΗΜΑ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΒΡΕΘΗΚΕ. Ο έλεγχος ασφαλείας της Supabase πάνω στην παραγωγή έδειξε
--  εξήντα οκτώ συναρτήσεις εκτελέσιμες μέσω `/rest/v1/rpc/...`. Οι
--  περισσότερες υπάρχουν ακριβώς γι' αυτό: τις καλεί η εφαρμογή. Εννιά όμως
--  δεν τις καλεί κανείς από τον κώδικα — τις καλούν ΟΙ ΙΔΙΕΣ ΟΙ ΠΟΛΙΤΙΚΕΣ:
--
--    owns_parent_property   is_active_org_member    org_owner_ids
--    owns_portal_token      is_org_owner            org_editor_owner_ids
--    is_active_portal_token member_sees_property    member_sees_financials
--
--  Είναι SECURITY DEFINER, δηλαδή τρέχουν με δικαιώματα του κατόχου και
--  ΠΑΡΑΚΑΜΠΤΟΥΝ την RLS εκ κατασκευής. Εκτεθειμένες σε HTTP γίνονται μαντείο:
--  η `owns_parent_property` ήταν εκτελέσιμη ΚΑΙ ΑΠΟ ΑΝΩΝΥΜΟ, οπότε οποιοσδήποτε
--  με ένα uuid μάθαινε αν αντιστοιχεί σε υπαρκτό ακίνητο. Η `org_owner_ids`
--  επέστρεφε σε κάθε συνδεδεμένο τους ιδιοκτήτες ΞΕΝΟΥ οργανισμού.
--
--  ΓΙΑΤΙ ΟΧΙ ΣΚΕΤΟ REVOKE. Οι πολιτικές αξιολογούνται με τα δικαιώματα του
--  ρόλου που κάνει το ερώτημα. Αν ο `authenticated` χάσει το EXECUTE, κάθε
--  SELECT σε πίνακα με τέτοια πολιτική σκάει «permission denied for function».
--  Δηλαδή η προφανής διόρθωση ρίχνει ολόκληρη την εφαρμογή, σιωπηλά στο CI και
--  θορυβωδώς στην παραγωγή.
--
--  Η ΣΩΣΤΗ ΚΙΝΗΣΗ. Το PostgREST δρομολογεί ΜΟΝΟ ό,τι ζει στα εκτεθειμένα
--  σχήματα. Μετακινώντας τις συναρτήσεις σε ιδιωτικό σχήμα, η διαδρομή HTTP
--  παύει να υπάρχει, ενώ οι πολιτικές συνεχίζουν να τις βρίσκουν: η εξάρτηση
--  καταγράφεται με OID και όχι με όνομα, οπότε η μετακίνηση δεν τις αγγίζει.
--
--  ΤΟ SEARCH_PATH ΤΩΝ ΙΔΙΩΝ ΤΩΝ ΣΥΝΑΡΤΗΣΕΩΝ ΜΕΝΕΙ 'public'. Διαβάζουν πίνακες
--  του `public` με σκέτο όνομα· αν άλλαζε, θα έσπαγαν από μέσα.
--
--  ΑΠΟΔΕΙΞΗ, ΟΧΙ ΠΕΠΟΙΘΗΣΗ. Το scripts/db/rls-probe.sql τρέχει μετά από αυτή τη
--  μετανάστευση σε πραγματικό Postgres: αλλάζει ρόλο σε `authenticated`, ρωτά
--  τη βάση σαν χρήστης, και απαιτεί να βλέπει μόνο τα δικά του. Αν η
--  μετακίνηση χαλούσε έστω μία πολιτική, εκείνο το σενάριο κοκκινίζει.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists private;

-- Κανείς δεν περιηγείται στο ιδιωτικό σχήμα. Το USAGE δίνεται ρητά στους
-- ρόλους του API γιατί ΧΩΡΙΣ αυτό οι πολιτικές δεν μπορούν να καλέσουν τις
-- συναρτήσεις — και η πρόσβαση σε σχήμα δεν είναι πρόσβαση σε διαδρομή HTTP.
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

do $$
declare
  fn text;
  sig text;
begin
  foreach fn in array array[
    'owns_parent_property', 'owns_portal_token', 'is_active_portal_token',
    'is_active_org_member', 'is_org_owner', 'member_sees_property',
    'member_sees_financials', 'org_owner_ids', 'org_editor_owner_ids'
  ] loop
    -- Υπερφορτώσεις: κάθε μία μετακινείται με την υπογραφή της.
    for sig in
      select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = fn
    loop
      execute format('alter function %s set schema private', sig);
      raise notice 'Μετακινήθηκε: %', sig;
    end loop;
  end loop;
end $$;

-- ── ΚΑΙ ΕΝΑ ΣΦΑΛΜΑ ΠΟΥ ΤΟ ΕΔΕΙΞΕ Ο ΕΛΕΓΧΟΣ ΑΠΟΜΟΝΩΣΗΣ ────────────────────
-- Οι πολιτικές του οργανισμού γράφτηκαν χωρίς `TO`, δηλαδή ισχύουν για ΚΑΘΕ
-- ρόλο — και για τον ανώνυμο. Ο ανώνυμος όμως δεν είχε ποτέ EXECUTE στην
-- `org_owner_ids`, οπότε ένα ανώνυμο SELECT στα ακίνητα ΔΕΝ γύριζε κενό:
-- έσκαγε με «permission denied for function». Καμία διαρροή, αλλά σφάλμα 500
-- εκεί που η σωστή απάντηση είναι «τίποτα». Δεν φαινόταν πουθενά, γιατί καμία
-- δημόσια σελίδα δεν ρωτά αυτόν τον πίνακα· την πρώτη φορά που θα ρωτούσε, θα
-- έσπαγε χωρίς προφανή αιτία.
--
-- Το δικαίωμα δίνεται ενιαία, τώρα που οι συναρτήσεις είναι σε ιδιωτικό σχήμα
-- και καμία διαδρομή HTTP δεν οδηγεί σε αυτές. Ο ανώνυμος τις «καλεί» μόνο
-- μέσα από πολιτική, και το αποτέλεσμα είναι πάντα κενό σύνολο.
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── ΚΑΙ ΟΙ ΔΥΟ ΠΟΥ ΔΕΝ ΕΙΝΑΙ ΒΟΗΘΟΙ ΠΟΛΙΤΙΚΗΣ ────────────────────────────
-- Η `enforce_property_limit` είναι trigger και η `rls_auto_enable` εργαλείο
-- συντήρησης. Καμία δεν καλείται από την εφαρμογή, και για τα trigger το
-- δικαίωμα EXECUTE ελέγχεται όταν ΦΤΙΑΧΝΕΤΑΙ ο trigger, όχι σε κάθε εγγραφή:
-- η ανάκληση δεν τα σταματά. Εδώ αρκεί το σκέτο REVOKE.
do $$
declare sig text;
begin
  for sig in
    select format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('enforce_property_limit', 'rls_auto_enable')
  loop
    execute format('revoke all on function %s from anon, authenticated', sig);
  end loop;
end $$;

-- ── pg_net ΕΞΩ ΑΠΟ ΤΟ ΔΗΜΟΣΙΟ ΣΧΗΜΑ ──────────────────────────────────────
-- Η επέκταση κάνει εξερχόμενα αιτήματα HTTP από μέσα από τη βάση. Στο `public`
-- οι συναρτήσεις της (`http_post`, `http_get`) βρίσκονται με σκέτο όνομα από
-- οτιδήποτε τρέχει εκεί. Στο δικό της σχήμα, πρέπει να την ονομάσεις για να τη
-- χρησιμοποιήσεις. Το `extensions` είναι το σχήμα που χρησιμοποιεί ήδη το
-- Supabase για τον ίδιο σκοπό.
--
-- Τρέχει μόνο όπου υπάρχει η επέκταση: στο τοπικό αντίγραφο του db-replay
-- είναι σχολιασμένη, και ένα `alter extension` σε ανύπαρκτη σκάει.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'alter extension pg_net set schema extensions';
    raise notice 'pg_net: μετακινήθηκε στο extensions';
  end if;
end $$;
