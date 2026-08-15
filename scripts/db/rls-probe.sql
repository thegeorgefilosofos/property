-- ═══════════════════════════════════════════════════════════════════════════
--  Η ΑΠΟΜΟΝΩΣΗ ΤΩΝ ΔΕΔΟΜΕΝΩΝ, ΔΟΚΙΜΑΣΜΕΝΗ ΚΑΙ ΟΧΙ ΥΠΟΤΙΘΕΜΕΝΗ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Το db-replay.sh έγραφε στα σχόλιά του, τίμια, «δεν
--  ελέγχει συμπεριφορά RLS». Πέντε φύλακες διαβάζουν τις πολιτικές ως ΚΕΙΜΕΝΟ:
--  ότι υπάρχουν, ότι είναι τυλιγμένες σε select, ότι καλύπτουν κάθε πίνακα.
--  Κανένας δεν ρώτησε ποτέ το ίδιο το Postgres «βλέπει ο Α τα δεδομένα του Β;».
--
--  Για ένα SaaS πολλών πελατών αυτή είναι Η ερώτηση. Αν η απάντηση γίνει ποτέ
--  «ναι», δεν υπάρχει προϊόν: υπάρχει διαρροή προσωπικών και φορολογικών
--  δεδομένων, με ό,τι αυτό σημαίνει για τον ιδιοκτήτη και για εμάς.
--
--  ΠΩΣ ΓΙΝΕΤΑΙ ΑΛΗΘΙΝΟ. Το `auth.uid()` της σκαλωσιάς επιστρέφει null, δηλαδή
--  «κανένας συνδεδεμένος». Εδώ ξαναγράφεται ώστε να διαβάζει μεταβλητή
--  συνεδρίας, ακριβώς όπως το πραγματικό διαβάζει το JWT. Ύστερα το σενάριο
--  ΑΛΛΑΖΕΙ ΡΟΛΟ σε `authenticated` — τον ρόλο που χρησιμοποιεί κάθε αίτημα του
--  browser — και ρωτά τη βάση σαν να ήταν ο χρήστης.
--
--  ΚΑΘΕ ΕΛΕΓΧΟΣ ΣΚΑΕΙ ΤΟ ΣΕΝΑΡΙΟ ΟΤΑΝ ΑΠΟΤΥΧΕΙ. Χωρίς μετρητές που μπορεί να
--  αγνοηθούν: ένα `raise exception` σταματά το ψευδώνυμο psql με ON_ERROR_STOP.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ο συνδεδεμένος χρήστης, όπως τον ξέρει το Supabase ─────────────────────
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('probe.uid', true), '')::uuid $$;

-- Το Supabase δίνει στους ρόλους του API πρόσβαση στους πίνακες· η RLS είναι
-- αυτή που κόβει, όχι η έλλειψη GRANT. Η σκαλωσιά έδινε μόνο στον service_role,
-- οπότε χωρίς αυτό ο έλεγχος θα περνούσε για λάθος λόγο.
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

do $probe$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  pb uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  n int;
begin
  insert into auth.users(id, email) values (a, 'a@probe.test'), (b, 'b@probe.test');
  insert into public.user_properties(id, user_id, name) values (pa, a, 'Του Α'), (pb, b, 'Του Β');
  raise notice 'probe: δύο ιδιοκτήτες, ένα ακίνητο ο καθένας';
end $probe$;

-- ── Ο Α, συνδεδεμένος ──────────────────────────────────────────────────────
set role authenticated;
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare n int; ok boolean;
begin
  select count(*) into n from public.user_properties;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % ακίνητα αντί για 1', n; end if;

  select count(*) into n from public.user_properties where name = 'Του Β';
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει το ακίνητο του Β'; end if;

  -- Γράψιμο σε ξένη γραμμή: η ενημέρωση δεν πρέπει να αγγίζει τίποτα.
  update public.user_properties set name = 'Το πήρα' where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α ενημέρωσε % γραμμές του Β', n; end if;

  delete from public.user_properties where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α έσβησε % γραμμές του Β', n; end if;

  -- Και δεν μπορεί να φυτέψει γραμμή ΓΙΑ τον Β (WITH CHECK).
  begin
    insert into public.user_properties(user_id, name)
      values ('22222222-2222-2222-2222-222222222222', 'Δώρο');
    raise exception 'ΔΙΑΡΡΟΗ: ο Α καταχώρησε ακίνητο στο όνομα του Β';
  exception
    when insufficient_privilege then null;   -- αυτό ακριβώς περιμένουμε
    when others then
      if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
      -- Το όριο ακινήτων του πλάνου χτυπά πριν την RLS σε κάποιες διαδρομές:
      -- και αυτό είναι άρνηση, όχι επιτυχία.
      if sqlerrm not like 'PROPERTY_LIMIT%' then raise; end if;
  end;

  raise notice 'probe: ο Α βλέπει μόνο τα δικά του, και δεν γράφει σε ξένα';
end $probe$;

-- ── Ο ανώνυμος επισκέπτης ──────────────────────────────────────────────────
set role anon;
set session "probe.uid" = '';

do $probe$
declare n int;
begin
  select count(*) into n from public.user_properties;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο ανώνυμος βλέπει % ακίνητα', n; end if;
  raise notice 'probe: ο ανώνυμος δεν βλέπει τίποτα';
end $probe$;

reset role;

-- ── Ο ΧΩΡΟΣ ΤΟΥ ΛΟΓΙΣΤΗ ΔΕΙΧΝΕΙ ΜΟΝΟ ΟΣΟΥΣ ΤΟΝ ΕΞΟΥΣΙΟΔΟΤΗΣΑΝ ────────────
-- Ο λογιστής βλέπει δεδομένα ΞΕΝΟΥ λογαριασμού μέσα από συνάρτηση που
-- παρακάμπτει την RLS. Αν ο έλεγχος σύνδεσης μέσα σε αυτήν λείψει ή σπάσει,
-- ένας λογαριασμός βλέπει ολόκληρη τη βάση. Εδώ δοκιμάζεται σαν επίθεση.
set role authenticated;
set session "probe.uid" = '22222222-2222-2222-2222-222222222222';

do $probe$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  res json;
  n int;
begin
  -- Ο Β, χωρίς καμία σύνδεση, δεν βλέπει κανέναν πελάτη.
  res := public.accountant_clients_overview(2026);
  if json_array_length(res) <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: ασύνδετος λογιστής βλέπει % πελάτες', json_array_length(res);
  end if;

  -- Και δεν μπορεί να ζητήσει τίποτα από τον Α.
  res := public.accountant_request_item(a, 'Εκκαθαριστικό ΕΝΦΙΑ', null);
  if (res->>'ok')::boolean then
    raise exception 'ΔΙΑΡΡΟΗ: ασύνδετος λογιστής υπέβαλε αίτημα σε ξένο ιδιοκτήτη';
  end if;

  -- Ούτε με πλαστό token.
  res := public.accountant_claim('δεν-υπάρχει-τέτοιο-token');
  if (res->>'ok')::boolean then
    raise exception 'ΔΙΑΡΡΟΗ: άκυρο token έγινε δεκτό';
  end if;

  raise notice 'probe: ασύνδετος λογιστής δεν βλέπει και δεν ζητά τίποτα';
end $probe$;

reset role;

-- Τώρα ο Α τον εξουσιοδοτεί, και μόνο τότε ανοίγει η πόρτα.
do $probe$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
begin
  insert into public.accountant_links (user_id, token, active) values (a, 'probe-token-α', true)
  on conflict do nothing;
end $probe$;

set role authenticated;
set session "probe.uid" = '22222222-2222-2222-2222-222222222222';

do $probe$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  res json;
  row json;
begin
  res := public.accountant_claim('probe-token-α');
  if not (res->>'ok')::boolean then
    raise exception 'Η σύνδεση με έγκυρο token απέτυχε: %', res->>'reason';
  end if;

  res := public.accountant_clients_overview(2026);
  if json_array_length(res) <> 1 then
    raise exception 'Ο λογιστής έπρεπε να βλέπει έναν πελάτη, βλέπει %', json_array_length(res);
  end if;
  row := res->0;
  if (row->>'ownerId')::uuid <> a then
    raise exception 'Λάθος ιδιοκτήτης στη λίστα';
  end if;
  if (row->>'properties')::int <> 1 then
    raise exception 'Ο λογιστής βλέπει % ακίνητα αντί για 1', row->>'properties';
  end if;

  -- Το αίτημα περνά τώρα, και το δεύτερο ίδιο δεν διπλογράφεται.
  res := public.accountant_request_item(a, 'Εκκαθαριστικό ΕΝΦΙΑ', 'Για τη δήλωση');
  if not (res->>'ok')::boolean then raise exception 'Το αίτημα απέτυχε: %', res->>'reason'; end if;
  res := public.accountant_request_item(a, 'Εκκαθαριστικό ΕΝΦΙΑ', 'Ξανά');
  if not (res->>'existing')::boolean then
    raise exception 'Το ίδιο αίτημα γράφτηκε δεύτερη φορά';
  end if;

  raise notice 'probe: με εξουσιοδότηση, ο λογιστής βλέπει έναν πελάτη και ζητά μία φορά';
end $probe$;

-- Και ο ΤΡΙΤΟΣ, που δεν τον εξουσιοδότησε κανείς, εξακολουθεί να μη βλέπει.
set session "probe.uid" = '33333333-3333-3333-3333-333333333333';
do $probe$
declare res json;
begin
  res := public.accountant_clients_overview(2026);
  if json_array_length(res) <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: τρίτος λογιστής βλέπει % πελάτες', json_array_length(res);
  end if;
  -- Και δεν διαβάζει τα αιτήματα των άλλων: η RLS του πίνακα το κόβει.
  perform 1 from public.accountant_requests;
  if (select count(*) from public.accountant_requests) <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: τρίτος βλέπει αιτήματα άλλων';
  end if;
  raise notice 'probe: τρίτος λογιστής δεν βλέπει ούτε πελάτες ούτε αιτήματα';
end $probe$;

reset role;

-- ── ΚΑΙ ΟΙ ΒΟΗΘΟΙ ΤΗΣ RLS ΔΕΝ ΕΙΝΑΙ ΠΙΑ ΕΚΤΕΘΕΙΜΕΝΟΙ ──────────────────────
-- Ο έλεγχος ασφαλείας της Supabase βρήκε έντεκα εσωτερικές συναρτήσεις που
-- εκτελούνταν μέσω `/rest/v1/rpc/...`. Δεν τις καλεί ποτέ η εφαρμογή· τις
-- καλούν ΟΙ ΠΟΛΙΤΙΚΕΣ. Μετακινήθηκαν σε ιδιωτικό σχήμα. Ο έλεγχος από πάνω
-- απέδειξε ότι οι πολιτικές συνεχίζουν να δουλεύουν· εδώ επιβεβαιώνεται ότι
-- καμία τους δεν έμεινε πίσω στο `public`.
do $probe$
declare leaked text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into leaked
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('owns_parent_property', 'owns_portal_token', 'is_active_portal_token',
                       'is_active_org_member', 'is_org_owner', 'member_sees_property',
                       'member_sees_financials', 'org_owner_ids', 'org_editor_owner_ids');
  if leaked is not null then
    raise exception 'ΕΚΘΕΣΗ: οι βοηθοί της RLS είναι ακόμη στο public και καλούνται μέσω RPC: %', leaked;
  end if;
  raise notice 'probe: κανένας βοηθός της RLS δεν είναι εκτεθειμένος';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
--  9. Η ΔΙΑΔΡΟΜΗ ΤΟΥ `text`, ΠΟΥ ΔΕΝ ΠΕΡΝΟΥΣΕ ΑΠΟ ΠΟΥΘΕΝΑ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΕΦΤΑΣΕ ΣΤΟΝ ΧΡΗΣΤΗ. Τρεις βοηθοί έχουν δύο υπερφορτώσεις,
--  `uuid` και `text`. Η `text` δεν κάνει τη δουλειά — ελέγχει τη μορφή και
--  καλεί την `uuid`, ΡΗΤΑ σχηματισμένη ως `public.…`. Όταν οι βοηθοί
--  μετακινήθηκαν στο `private`, το σώμα συνέχισε να δείχνει στο άδειο σχήμα:
--  κάθε εγγραφή σε πίνακα με `property_id text` έσκαγε με 42883.
--
--  Ο έλεγχος από πάνω δοκιμάζει `user_properties`, όπου το αναγνωριστικό είναι
--  `uuid`. Η διαδρομή `text` δεν αγγιζόταν. Εδώ αγγίζεται.
do $probe$
declare v boolean;
begin
  perform set_config('probe.uid', '11111111-1111-1111-1111-111111111111', false);
  set local role authenticated;

  -- Και οι τρεις υπερφορτώσεις κειμένου εκτελούνται. Αν κάποια δείχνει σε
  -- διεύθυνση που άδειασε, εδώ σκάει με undefined_function.
  select private.owns_parent_property('22222222-2222-2222-2222-222222222222'::text) into v;
  select private.member_sees_property('22222222-2222-2222-2222-222222222222'::text) into v;
  select private.member_sees_financials('22222222-2222-2222-2222-222222222222'::text) into v;

  -- Και η ανεκτική διαδρομή: ό,τι δεν είναι uuid περνά, γιατί ιστορικά
  -- κάποιοι πίνακες κρατούν εκεί ελεύθερο κείμενο.
  select private.member_sees_property('όχι-uuid') into v;
  if v is not true then
    raise exception 'Η ανεκτική διαδρομή του text έπαψε να επιτρέπει μη-uuid';
  end if;

  reset role;
  raise notice 'probe: και οι τρεις υπερφορτώσεις κειμένου εκτελούνται';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Η ΕΓΓΥΗΣΗ ΤΗΣ ΔΙΑΓΡΑΦΗΣ ΕΠΙΒΙΩΝΕΙ ΤΗΣ ΑΝΑΚΛΗΣΗΣ ΔΙΚΑΙΩΜΑΤΩΝ
-- ─────────────────────────────────────────────────────────────────────────
-- ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ. Η `purge_property_children()` δημιουργήθηκε SECURITY DEFINER
-- και κληρονόμησε το προεπιλεγμένο EXECUTE που η Postgres δίνει στο PUBLIC.
-- Το `20260815080000_purge_trigger_least_privilege.sql` το ανακάλεσε από
-- public, anon και authenticated.
--
-- Η ανάκληση στηρίζεται σε μια συμπεριφορά της Postgres που είναι σωστή αλλά
-- ΔΕΝ ΕΙΝΑΙ ΠΡΟΦΑΝΗΣ: το δικαίωμα EXECUTE σε συνάρτηση σκανδάλης ελέγχεται μία
-- φορά, στο CREATE TRIGGER, και ΟΧΙ σε κάθε πυροδότηση. Αν αυτό άλλαζε ποτέ,
-- ή αν κάποιος έγραφε τη σκανδάλη αλλιώς, η διαγραφή ακινήτου θα σταματούσε να
-- καθαρίζει τους δέκα πίνακες και θα έμεναν πίσω δεδομένα πελάτη σε βάση όπου
-- ο ιδιοκτήτης νομίζει ότι έσβησε το ακίνητό του. Καμία οθόνη δεν θα το έδειχνε.
--
-- Ενα σχόλιο δεν εγγυάται τίποτα. Ο έλεγχος εγγυάται.
do $probe$
declare
  v_uid  uuid := '11111111-1111-1111-1111-111111111111';
  v_prop uuid := '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';
  n_after integer;
begin
  -- Ο ανώνυμος ΔΕΝ πρέπει να μπορεί να την καλέσει.
  if has_function_privilege('anon', 'public.purge_property_children()', 'execute') then
    raise exception 'Ο ανώνυμος έχει EXECUTE στην purge_property_children: SECURITY DEFINER ανοιχτή στο διαδίκτυο';
  end if;
  if has_function_privilege('public', 'public.purge_property_children()', 'execute') then
    raise exception 'Το PUBLIC έχει EXECUTE στην purge_property_children';
  end if;

  -- Και όμως η σκανδάλη πρέπει να κάνει τη δουλειά της.
  insert into auth.users (id, email) values (v_uid, 'purge-probe@example.gr')
    on conflict (id) do nothing;
  insert into public.user_properties (id, user_id, name)
    values (v_prop, v_uid, 'Ακίνητο δοκιμής διαγραφής');
  insert into public.portal_links (property_id, user_id, token)
    values (v_prop::text, v_uid, 'purge-probe-token');
  insert into public.pricing_settings (property_id, user_id)
    values (v_prop::text, v_uid);

  -- ΠΡΩΤΑ ΒΕΒΑΙΩΣΟΥ ΟΤΙ ΥΠΑΡΧΟΥΝ. Χωρίς αυτό ο έλεγχος είναι κενός: αν οι
  -- εισαγωγές αποτύγχαναν σιωπηλά, το πλήθος μετά τη διαγραφή θα ήταν μηδέν
  -- έτσι κι αλλιώς και ο έλεγχος θα περνούσε χωρίς να έχει δοκιμάσει τίποτα.
  select (select count(*) from public.portal_links     where property_id = v_prop::text)
       + (select count(*) from public.pricing_settings where property_id = v_prop::text)
    into n_after;
  if n_after <> 2 then
    raise exception 'Ο έλεγχος είναι κενός: περίμενα δύο γραμμές παιδιών πριν τη διαγραφή, βρήκα %', n_after;
  end if;

  delete from public.user_properties where id = v_prop;

  select (select count(*) from public.portal_links     where property_id = v_prop::text)
       + (select count(*) from public.pricing_settings where property_id = v_prop::text)
    into n_after;

  if n_after <> 0 then
    raise exception 'Η σκανδάλη καθαρισμού δεν έτρεξε: έμειναν % γραμμές παιδιών μετά τη διαγραφή του ακινήτου', n_after;
  end if;

  raise notice 'probe: η διαγραφή ακινήτου καθαρίζει τα παιδιά της, με ανακλημένο EXECUTE';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. ΤΟ ON CONFLICT ΤΗΣ ΕΙΣΑΓΩΓΗΣ ΤΡΑΠΕΖΑΣ ΒΡΙΣΚΕΙ ΤΟ ΕΥΡΕΤΗΡΙΟ ΤΟΥ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΑΡΦΩΝΕΤΑΙ ΕΔΩ. Το `uq_expenses_dedup` ήταν μερικό ευρετήριο
-- και η Postgres δεν συμπεραίνει μερικό ευρετήριο από σκέτο ON CONFLICT: κάθε
-- εισαγωγή δαπάνης από τράπεζα έσκαγε με 42P10, ΑΦΟΥ όμως είχαν ήδη γραφτεί οι
-- εισπράξεις ενοικίων. Ο πληρωμένος πελάτης έβλεπε σφάλμα με τη μισή δουλειά
-- καταχωρημένη.
--
-- Ο έλεγχος εκτελεί ΤΗΝ ΙΔΙΑ εντολή που στέλνει η εφαρμογή, όχι κάτι παρόμοιο.
do $probe$
declare
  v_uid  uuid := '11111111-1111-1111-1111-111111111111';
  v_prop uuid := '4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a4a4a';
  n integer;
begin
  insert into auth.users (id, email) values (v_uid, 'dedup-probe@example.gr')
    on conflict (id) do nothing;
  insert into public.user_properties (id, user_id, name)
    values (v_prop, v_uid, 'Ακίνητο δοκιμής αποτυπώματος')
    on conflict (id) do nothing;

  -- Πρώτη εισαγωγή με αποτύπωμα: πρέπει να μπει.
  insert into public.expenses (user_id, property_id, amount, description, category, date, dedup_hash)
    values (v_uid, v_prop, 87.40, 'ΔΕΗ', 'utilities', current_date, 'probe-hash-1')
    on conflict (user_id, dedup_hash) do nothing;

  -- Η ΙΔΙΑ δεύτερη φορά: πρέπει να παραλειφθεί σιωπηλά, όχι να σκάσει.
  insert into public.expenses (user_id, property_id, amount, description, category, date, dedup_hash)
    values (v_uid, v_prop, 87.40, 'ΔΕΗ', 'utilities', current_date, 'probe-hash-1')
    on conflict (user_id, dedup_hash) do nothing;

  select count(*) into n from public.expenses
    where user_id = v_uid and dedup_hash = 'probe-hash-1';
  if n <> 1 then
    raise exception 'Το αποτύπωμα δαπάνης δεν εμποδίζει τη διπλοεγγραφή: βρέθηκαν % γραμμές', n;
  end if;

  -- Και οι ΧΕΙΡΟΚΙΝΗΤΕΣ δαπάνες, που δεν έχουν αποτύπωμα, πρέπει να μένουν
  -- ελεύθερες: δύο πανομοιότυπες με NULL είναι δύο πραγματικά έξοδα.
  insert into public.expenses (user_id, property_id, amount, description, category, date)
    values (v_uid, v_prop, 12.00, 'Χειροκίνητη', 'other', current_date);
  insert into public.expenses (user_id, property_id, amount, description, category, date)
    values (v_uid, v_prop, 12.00, 'Χειροκίνητη', 'other', current_date);

  select count(*) into n from public.expenses
    where user_id = v_uid and dedup_hash is null and description = 'Χειροκίνητη';
  if n <> 2 then
    raise exception 'Η μοναδικότητα αποτυπώματος μπλοκάρει χειροκίνητες δαπάνες: βρέθηκαν % αντί για 2', n;
  end if;

  delete from public.user_properties where id = v_prop;
  raise notice 'probe: το ON CONFLICT της εισαγωγής τράπεζας βρίσκει το ευρετήριό του';
end $probe$;
