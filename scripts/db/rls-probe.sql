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
-- 10. Η ΕΓΓΥΗΣΗ ΤΗΣ ΔΙΑΓΡΑΦΗΣ ΕΙΝΑΙ ΔΗΛΩΤΙΚΗ, ΟΧΙ ΔΙΑΔΙΚΑΣΤΙΚΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ ΞΑΝΑ ΑΥΤΟΣ Ο ΕΛΕΓΧΟΣ. Ωσπου το `property_id` να
-- γίνει `uuid`, δεν μπορούσαν να μπουν ξένα κλειδιά, οπότε το σβήσιμο ακινήτου
-- κρεμόταν από σκανδάλη που έσβηνε δέκα πίνακες με το χέρι. Μια λίστα δέκα
-- ονομάτων μέσα σε συνάρτηση ξεχνά τον ενδέκατο πίνακα σιωπηλά.
--
-- Τώρα η εγγύηση είναι είκοσι τέσσερα ξένα κλειδιά `on delete cascade` και η
-- σκανδάλη έφυγε. Ο έλεγχος ελέγχει το ΑΠΟΤΕΛΕΣΜΑ, όχι τον μηχανισμό: αν
-- κάποτε αλλάξει ξανά ο τρόπος, ο έλεγχος συνεχίζει να έχει νόημα.
--
-- ΤΟ ΚΟΣΤΟΣ ΤΗΣ ΑΠΟΤΥΧΙΑΣ ΤΟΥ: ο ιδιοκτήτης πατά «Διαγραφή ακινήτου», η οθόνη
-- λέει ότι έγινε, και στη βάση μένουν πίσω σύνδεσμοι πύλης, τιμολόγηση και
-- στοιχεία επισκεπτών. Καμία οθόνη δεν τα δείχνει και κανείς δεν μαθαίνει ποτέ.
do $probe$
declare
  v_uid  uuid := '11111111-1111-1111-1111-111111111111';
  v_prop uuid := '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';
  n_fk integer; n integer;
begin
  -- Τα ξένα κλειδιά υπάρχουν και ΟΛΑ κάνουν cascade. Ενα «no action» ανάμεσά
  -- τους θα εμπόδιζε ολόκληρη τη διαγραφή αντί να καθαρίσει.
  select count(*) into n_fk
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and con.contype = 'f' and con.confdeltype = 'c'
    and c.relname in ('checkin_links','client_stays','guest_checkins','ical_feeds','inventory_handovers',
      'inventory_items','inventory_maintenance','maintenance_requests','portal_links','pricing_settings')
    and con.conkey = array[(select attnum from pg_attribute where attrelid = c.oid and attname = 'property_id')];
  if n_fk <> 10 then
    raise exception 'Περίμενα δέκα ξένα κλειδιά property_id με cascade, βρήκα %', n_fk;
  end if;

  -- Και η σκανδάλη ΔΕΝ πρέπει να έχει επιστρέψει: δύο μηχανισμοί για την ίδια
  -- εγγύηση σημαίνει ότι κανείς δεν ξέρει ποιος από τους δύο δουλεύει.
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'public' and p.proname = 'purge_property_children') then
    raise exception 'Η σκανδάλη purge_property_children ξαναγύρισε δίπλα στα ξένα κλειδιά';
  end if;

  insert into auth.users (id, email) values (v_uid, 'purge-probe@example.gr')
    on conflict (id) do nothing;
  insert into public.user_properties (id, user_id, name)
    values (v_prop, v_uid, 'Ακίνητο δοκιμής διαγραφής');
  insert into public.portal_links (property_id, user_id, token)
    values (v_prop, v_uid, 'purge-probe-token');
  insert into public.pricing_settings (property_id, user_id)
    values (v_prop, v_uid);

  -- ΠΡΩΤΑ ΒΕΒΑΙΩΣΟΥ ΟΤΙ ΥΠΑΡΧΟΥΝ. Χωρίς αυτό ο έλεγχος είναι κενός: αν οι
  -- εισαγωγές αποτύγχαναν σιωπηλά, το πλήθος μετά τη διαγραφή θα ήταν μηδέν
  -- έτσι κι αλλιώς και ο έλεγχος θα περνούσε χωρίς να έχει δοκιμάσει τίποτα.
  select (select count(*) from public.portal_links     where property_id = v_prop)
       + (select count(*) from public.pricing_settings where property_id = v_prop)
    into n;
  if n <> 2 then
    raise exception 'Ο έλεγχος είναι κενός: περίμενα δύο γραμμές παιδιών πριν τη διαγραφή, βρήκα %', n;
  end if;

  delete from public.user_properties where id = v_prop;

  select (select count(*) from public.portal_links     where property_id = v_prop)
       + (select count(*) from public.pricing_settings where property_id = v_prop)
    into n;
  if n <> 0 then
    raise exception 'Η διαγραφή ακινήτου άφησε % γραμμές παιδιών πίσω', n;
  end if;

  raise notice 'probe: η διαγραφή ακινήτου καθαρίζει τα παιδιά της από ξένο κλειδί';
end $probe$;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. ΤΟ ΜΕΛΟΣ ΧΩΡΙΣ ΟΙΚΟΝΟΜΙΚΑ ΔΕΝ ΒΛΕΠΕΙ ΤΟ ΜΙΣΘΩΜΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Ο διακόπτης «Οικονομικά στοιχεία → Κρυφά» πυλωρούσε
-- επτά πίνακες και ΟΧΙ τον `tenants`, όπου ζει το μίσθωμα, η εγγύηση, το
-- IBAN είσπραξης, το ΑΦΜ και η ταυτότητα του μισθωτή. Κανένας έλεγχος δεν
-- ρωτούσε τη βάση «τι βλέπει το μέλος χωρίς δικαίωμα;», οπότε η υπόσχεση της
-- οθόνης και η συμπεριφορά της βάσης απέκλιναν χωρίς να το μάθει κανείς.
--
-- ΓΙΑΤΙ ΕΛΕΓΧΟΝΤΑΙ ΚΑΙ ΟΙ ΔΥΟ ΠΛΕΥΡΕΣ. Ενας έλεγχος που ζητά μόνο μηδενικά
-- περνά και όταν το μέλος δεν βλέπει ΤΙΠΟΤΑ — δηλαδή και όταν η διόρθωση
-- έχει σπάσει την εφαρμογή. Εδώ το ίδιο ερώτημα τρέχει τρεις φορές: για το
-- μέλος χωρίς δικαίωμα, για το μέλος ΜΕ δικαίωμα, και για τον ιδιοκτήτη.
do $probe$
declare
  a     uuid := '11111111-1111-1111-1111-111111111111';
  pa    uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  m_no  uuid := '55555555-5555-5555-5555-555555555555';
  m_yes uuid := '66666666-6666-6666-6666-666666666666';
  org   uuid := '77777777-7777-7777-7777-777777777777';
begin
  insert into auth.users (id, email)
    values (m_no, 'xoris-oikonomika@probe.test'), (m_yes, 'me-oikonomika@probe.test')
    on conflict (id) do nothing;

  insert into public.organizations (id, owner_user_id, name)
    values (org, a, 'Οργανισμός δοκιμής') on conflict (id) do nothing;

  insert into public.organization_members (org_id, user_id, email, role, status, can_view_financials)
    values (org, m_no,  'xoris-oikonomika@probe.test', 'member', 'active', false),
           (org, m_yes, 'me-oikonomika@probe.test',    'member', 'active', true)
    on conflict (org_id, email) do nothing;

  -- Ο μισθωτής, με ό,τι ακριβώς περιγράφει το εύρημα.
  insert into public.tenants (property_id, user_id, full_name, monthly_rent,
                              deposit_amount, rent_iban, afm, id_number)
    values (pa, a, 'Μισθωτής δοκιμής', 750.00, 1500.00,
            'GR1601101250000000012300695', '123456789', 'ΑΒ123456');
  insert into public.rent_config (property_id, user_id, actual_rent, target_rent)
    values (pa, a, 750.00, 800.00);
  insert into public.expenses (user_id, property_id, amount, description, category, date)
    values (a, pa, 42.00, 'Κοινόχρηστα', 'other', current_date);
  -- Η ΕΙΣΠΡΑΞΗ. Ο rent_payments είχε ΜΙΑ επιτρεπτική πολιτική, την own_*, και
  -- καμία org_read_*: το μέλος με δικαίωμα οικονομικών έβλεπε μηδέν εισπράξεις
  -- ενώ η οθόνη της ομάδας υπόσχεται ρητά «Ενοίκια».
  insert into public.rent_payments (user_id, property_id, amount, payment_date, status)
    values (a, pa, 450.00, current_date, 'paid');

  raise notice 'probe: οργανισμός με δύο μέλη, μίσθωμα 750,00 €, IBAN και είσπραξη 450,00 €';
end $probe$;

-- ── Το μέλος ΧΩΡΙΣ δικαίωμα ────────────────────────────────────────────────
set role authenticated;
set session "probe.uid" = '55555555-5555-5555-5555-555555555555';

do $probe$
declare
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  n int;
begin
  -- ΠΡΩΤΑ ΟΤΙ Ο ΕΛΕΓΧΟΣ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ: το μέλος βλέπει κανονικά το ακίνητο.
  select count(*) into n from public.user_properties where id = pa;
  if n <> 1 then
    raise exception 'Ο έλεγχος είναι κενός: το μέλος βλέπει % ακίνητα αντί για 1', n;
  end if;

  -- ΚΑΙ ΜΕΤΑ ΟΤΙ ΤΟ ΜΙΣΘΩΜΑ ΔΕΝ ΦΤΑΝΕΙ ΠΟΤΕ ΣΕ ΑΥΤΟ.
  select count(*) into n from public.tenants where property_id = pa;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος χωρίς οικονομικά βλέπει % μισθωτές', n;
  end if;

  select count(*) into n from public.tenants where monthly_rent is not null;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος χωρίς οικονομικά διαβάζει το μίσθωμα';
  end if;

  select count(*) into n from public.tenants where rent_iban is not null or afm is not null;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος χωρίς οικονομικά διαβάζει IBAN ή ΑΦΜ μισθωτή';
  end if;

  select count(*) into n from public.expenses where property_id = pa;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος χωρίς οικονομικά βλέπει % δαπάνες', n;
  end if;

  select count(*) into n from public.rent_payments where property_id = pa;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος χωρίς οικονομικά βλέπει % εισπράξεις', n;
  end if;

  -- Ούτε γράφει: χωρίς αυτό, το μέλος θα μπορούσε να αλλάξει το IBAN
  -- είσπραξης χωρίς να το βλέπει, που είναι χειρότερο από τη διαρροή.
  update public.tenants set rent_iban = 'GR0000000000000000000000000' where property_id = pa;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος χωρίς οικονομικά άλλαξε % γραμμές μισθωτή', n;
  end if;

  raise notice 'probe: μέλος χωρίς οικονομικά βλέπει το ακίνητο, όχι το μίσθωμα';
end $probe$;

-- ── Το μέλος ΜΕ δικαίωμα, και ο ιδιοκτήτης ────────────────────────────────
set session "probe.uid" = '66666666-6666-6666-6666-666666666666';

do $probe$
declare
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  n int;
  v numeric;
begin
  select count(*) into n from public.tenants where property_id = pa;
  if n <> 1 then
    raise exception 'Η διόρθωση έκρυψε τον μισθωτή και από μέλος ΜΕ δικαίωμα: % γραμμές', n;
  end if;

  select monthly_rent into v from public.tenants where property_id = pa;
  if v is distinct from 750.00 then
    raise exception 'Το μέλος με δικαίωμα διαβάζει μίσθωμα % αντί για 750,00', v;
  end if;

  select count(*) into n from public.expenses where property_id = pa;
  if n <> 1 then
    raise exception 'Η διόρθωση έκρυψε τις δαπάνες από μέλος ΜΕ δικαίωμα';
  end if;

  -- ΚΑΙ ΟΙ ΕΙΣΠΡΑΞΕΙΣ, ΠΟΥ ΕΙΝΑΙ ΤΟ ΠΡΩΤΟ ΠΡΑΓΜΑ ΠΟΥ ΥΠΟΣΧΕΤΑΙ Η ΟΘΟΝΗ.
  select count(*) into n from public.rent_payments where property_id = pa;
  if n <> 1 then
    raise exception 'Το μέλος ΜΕ δικαίωμα βλέπει % εισπράξεις αντί για 1', n;
  end if;

  select amount into v from public.rent_payments where property_id = pa;
  if v is distinct from 450.00 then
    raise exception 'Το μέλος με δικαίωμα διαβάζει είσπραξη % αντί για 450,00', v;
  end if;

  -- ΚΑΙ ΜΟΝΟ ΔΙΑΒΑΖΕΙ: η νέα πολιτική είναι FOR SELECT και τίποτα άλλο.
  update public.rent_payments set amount = 1.00 where property_id = pa;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'ΔΙΑΡΡΟΗ: μέλος άλλαξε % εισπράξεις', n;
  end if;

  raise notice 'probe: μέλος με δικαίωμα διαβάζει μίσθωμα 750,00 €, δαπάνες και είσπραξη 450,00 €';
end $probe$;

set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  n int;
begin
  select count(*) into n from public.tenants where property_id = pa;
  if n <> 1 then
    raise exception 'Ο ΙΔΙΟΚΤΗΤΗΣ έχασε τον μισθωτή του: % γραμμές', n;
  end if;

  -- Ο `rent_config` κρατά το ίδιο ποσό δεύτερη φορά και μπήκε στην ίδια πύλη.
  -- Σήμερα τον διαβάζει ΜΟΝΟ ο ιδιοκτήτης (καμία policy οργανισμού πάνω του),
  -- οπότε το μηδέν ενός μέλους δεν αποδεικνύει τίποτα· η νέα restrictive
  -- policy όμως θα μπορούσε να κόψει τον ίδιο τον ιδιοκτήτη. Αυτό ελέγχεται.
  select count(*) into n from public.rent_config where property_id = pa;
  if n <> 1 then
    raise exception 'Ο ΙΔΙΟΚΤΗΤΗΣ έχασε το ενοίκιο του ακινήτου του';
  end if;

  select count(*) into n from public.rent_payments where property_id = pa;
  if n <> 1 then
    raise exception 'Ο ΙΔΙΟΚΤΗΤΗΣ έχασε την είσπραξή του: % γραμμές', n;
  end if;

  update public.rent_payments set notes = 'σημείωση ιδιοκτήτη' where property_id = pa;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Ο ΙΔΙΟΚΤΗΤΗΣ δεν μπορεί πια να ενημερώσει την είσπραξή του';
  end if;

  update public.tenants set full_name = 'Μισθωτής, μετονομασμένος' where property_id = pa;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Ο ΙΔΙΟΚΤΗΤΗΣ δεν μπορεί πια να ενημερώσει τον μισθωτή του';
  end if;

  raise notice 'probe: ο ιδιοκτήτης βλέπει και ενημερώνει τα πάντα, όπως πριν';
end $probe$;

reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΑΝΑΠΡΟΣΑΡΜΟΓΗ ΠΕΦΤΕΙ ΣΤΗΝ ΗΜΕΡΟΜΗΝΙΑ ΤΗΣ, ΟΥΤΕ ΜΙΑ ΜΕΡΑ ΝΩΡΙΤΕΡΑ
-- ─────────────────────────────────────────────────────────────────────────
-- Το εύρημα ήταν ότι υπογεγραμμένη ειδοποίηση με ισχύ 01/01/2027 ανέβαζε το
-- μίσθωμα ΣΗΜΕΡΑ. Δεν αρκεί να διαβαστεί η νέα συνάρτηση: τρεις ιδιότητες
-- ελέγχονται με εκτέλεση, γιατί και οι τρεις είναι σιωπηλές όταν σπάσουν.
-- ═══════════════════════════════════════════════════════════════════════════
do $probe$
declare
  a  uuid := '11111111-1111-1111-1111-111111111111';
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  t_future uuid; t_due uuid; t_expired uuid;
  n int; v numeric; d date; rest numeric;
begin
  insert into public.tenants (property_id, user_id, full_name, monthly_rent,
                              pending_rent, pending_rent_from)
    values (pa, a, 'Μελλοντική ισχύς', 600.00, 626.40, current_date + 120)
    returning id into t_future;
  insert into public.tenants (property_id, user_id, full_name, monthly_rent,
                              pending_rent, pending_rent_from)
    values (pa, a, 'Ωρίμασε προχθές', 600.00, 626.40, current_date - 2)
    returning id into t_due;
  -- Μίσθωση που έληξε ΠΡΙΝ την ημερομηνία ισχύος: δεν αναπροσαρμόζεται.
  insert into public.tenants (property_id, user_id, full_name, monthly_rent,
                              lease_end, pending_rent, pending_rent_from)
    values (pa, a, 'Ελήξε πριν την ισχύ', 600.00, current_date - 30, 626.40, current_date - 2)
    returning id into t_expired;

  n := public.apply_due_rent_adjustments();
  if n <> 1 then
    raise exception 'Εφαρμόστηκαν % αναπροσαρμογές αντί για 1', n;
  end if;

  select monthly_rent, pending_rent_from into v, d from public.tenants where id = t_future;
  if v is distinct from 600.00 or d is distinct from (current_date + 120) then
    raise exception 'Η ΜΕΛΛΟΝΤΙΚΗ ισχύς εφαρμόστηκε σήμερα: μίσθωμα %, ραντεβού %', v, d;
  end if;

  select monthly_rent, pending_rent into v, rest from public.tenants where id = t_due;
  if v is distinct from 626.40 then
    raise exception 'Η ωριμασμένη αναπροσαρμογή δεν εφαρμόστηκε: μίσθωμα %', v;
  end if;
  if rest is not null then
    raise exception 'Το ραντεβού έμεινε μετά την εφαρμογή του: %', rest;
  end if;

  select monthly_rent, pending_rent into v, rest from public.tenants where id = t_expired;
  if v is distinct from 600.00 then
    raise exception 'Ληγμένη μίσθωση πήρε αναπροσαρμογή: μίσθωμα %', v;
  end if;
  if rest is not null then
    raise exception 'Το ραντεβού ληγμένης μίσθωσης έμεινε να κοιτάζει το κενό: %', rest;
  end if;

  -- ΑΘΩΑ ΣΤΗΝ ΕΠΑΝΑΛΗΨΗ. Ο χρονοδρομολογητής μπορεί να τρέξει δύο φορές.
  n := public.apply_due_rent_adjustments();
  if n <> 0 then
    raise exception 'Δεύτερο τρέξιμο εφάρμοσε % αναπροσαρμογές· η εργασία δεν είναι ιδιοδύναμη', n;
  end if;

  -- Το ραντεβού είναι ΖΕΥΓΟΣ: ποσό χωρίς ημερομηνία δεν γράφεται.
  begin
    insert into public.tenants (property_id, user_id, full_name, pending_rent)
      values (pa, a, 'Μισό ραντεβού', 626.40);
    raise exception 'Γράφτηκε ποσό αναπροσαρμογής ΧΩΡΙΣ ημερομηνία ισχύος';
  exception when check_violation then null;
  end;

  delete from public.tenants where id in (t_future, t_due, t_expired);
  raise notice 'probe: η αναπροσαρμογή πέφτει στην ημερομηνία της, μία φορά';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΑΝΑΚΛΗΣΗ ΤΟΥ ΛΟΓΙΣΤΗ ΕΙΝΑΙ ΠΡΑΓΜΑΤΙΚΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Το κουμπί λεγόταν «Ανάκληση», περιέστρεφε τον σύνδεσμο, η οθόνη έγραφε
-- «ανακλήθηκε» — και ο λογιστής που είχε ήδη μπει στον χώρο εργασίας συνέχιζε
-- να βλέπει τα πάντα. Ο έλεγχος εδώ κάνει ακριβώς τη διαδρομή του χρήστη:
-- σύνδεσμος → αξίωση → βλέπει → περιστροφή → ΔΕΝ βλέπει.
-- ═══════════════════════════════════════════════════════════════════════════
reset role;
set session "probe.uid" = '';

do $probe$
declare
  own uuid := 'cccccccc-0000-0000-0000-000000000001';   -- ο ιδιοκτήτης
  acc uuid := 'dddddddd-0000-0000-0000-000000000001';   -- ο λογιστής
  tok1 text := 'probe-token-protos';
  tok2 text := 'probe-token-deuteros';
  res json;
  live boolean;
begin
  insert into auth.users(id, email) values (own, 'own@probe.test'), (acc, 'acc@probe.test');
  insert into public.user_properties(id, user_id, name)
    values ('cccccccc-0000-0000-0000-0000000000f1', own, 'Το σπίτι του ιδιοκτήτη');

  -- Ο ιδιοκτήτης βγάζει σύνδεσμο.
  insert into public.accountant_links(user_id, token, active) values (own, tok1, true);

  -- Ο λογιστής τον αξιώνει.
  perform set_config('probe.uid', acc::text, true);
  res := public.accountant_claim(tok1);
  if (res->>'ok')::boolean is not true then
    raise exception 'Η αξίωση του συνδέσμου απέτυχε: %', res;
  end if;

  if not public.accountant_link_live(acc, own) then
    raise exception 'Ο λογιστής δεν βλέπει τον πελάτη του αμέσως μετά την αξίωση';
  end if;
  if json_array_length(public.accountant_clients_overview(2026)) <> 1 then
    raise exception 'Ο χώρος εργασίας δεν δείχνει τον πελάτη μετά την αξίωση';
  end if;
  if (public.accountant_request_item(own, 'Ε9') ->> 'ok')::boolean is not true then
    raise exception 'Ο συνδεδεμένος λογιστής δεν μπορεί να ζητήσει έγγραφο';
  end if;

  -- Ο ιδιοκτήτης πατά «Ανάκληση»: ο σύνδεσμος περιστρέφεται.
  perform set_config('probe.uid', own::text, true);
  update public.accountant_links set token = tok2 where user_id = own;

  -- ΤΟ ΚΡΙΣΙΜΟ: η παλιά αξίωση δεν στέκει πια σε τίποτα.
  perform set_config('probe.uid', acc::text, true);
  live := public.accountant_link_live(acc, own);
  if live then
    raise exception 'Η ΑΝΑΚΛΗΣΗ ΔΕΝ ΑΝΑΚΑΛΕΣΕ: ο λογιστής κρατά πρόσβαση μετά την περιστροφή';
  end if;
  if json_array_length(public.accountant_clients_overview(2026)) <> 0 then
    raise exception 'Ο χώρος εργασίας δείχνει ακόμη τον πελάτη μετά την ανάκληση';
  end if;
  res := public.accountant_request_item(own, 'Ε2');
  if (res->>'ok')::boolean is not false or res->>'reason' <> 'not_linked' then
    raise exception 'Ανακληθείς λογιστής εξακολουθεί να στέλνει αιτήματα: %', res;
  end if;

  -- Και ο ΠΑΛΙΟΣ σύνδεσμος δεν ξανανοίγει την πόρτα.
  res := public.accountant_claim(tok1);
  if (res->>'ok')::boolean is not false then
    raise exception 'Ο ανακληθείς σύνδεσμος ξανάδωσε πρόσβαση: %', res;
  end if;

  -- Ενώ ο ΝΕΟΣ σύνδεσμος, αν ο ιδιοκτήτης τον δώσει, δουλεύει κανονικά: η
  -- ανάκληση δεν είναι μπλόκο στον άνθρωπο, είναι τερματισμός της πρόσβασης.
  res := public.accountant_claim(tok2);
  if (res->>'ok')::boolean is not true then
    raise exception 'Ο νέος σύνδεσμος δεν δουλεύει μετά την ανάκληση: %', res;
  end if;
  if not public.accountant_link_live(acc, own) then
    raise exception 'Ο λογιστής δεν ξαναβλέπει τον πελάτη με τον νέο σύνδεσμο';
  end if;

  perform set_config('probe.uid', '', true);
  raise notice 'probe: η περιστροφή του συνδέσμου κόβει τον χώρο εργασίας, ο νέος τον ξανανοίγει';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ΦΤΑΝΕΙ ΚΑΙ ΣΤΟΥΣ ΠΙΝΑΚΕΣ ΧΩΡΙΣ `user_id`
-- ─────────────────────────────────────────────────────────────────────────
-- Η `delete_my_account` σβήνει «κάθε πίνακα με στήλη user_id». Η ουρά των
-- email κλειδώνεται στη ΔΙΕΥΘΥΝΣΗ, όχι στον χρήστη: ο λογαριασμός έφευγε και
-- το `email_outbox` κρατούσε διεύθυνση, όνομα και περιεχόμενο — και ένα
-- προγραμματισμένο μήνυμα μπορούσε ακόμη να σταλεί σε κάποιον που είχε
-- ζητήσει διαγραφή.
-- ═══════════════════════════════════════════════════════════════════════════
reset role;
set session "probe.uid" = '';

do $probe$
declare
  v_uid  uuid := 'eeeeeeee-0000-0000-0000-000000000001';
  v_mail text := 'diagrafi-probe@example.gr';
  res json;
  n int;
begin
  insert into auth.users (id, email) values (v_uid, v_mail);
  insert into public.user_properties (user_id, name) values (v_uid, 'Το σπίτι που φεύγει');
  -- Η ουρά κρατά τη ΔΙΕΥΘΥΝΣΗ. Κεφαλαία και κενά επίτηδες: το ταίριασμα δεν
  -- επιτρέπεται να χάνει τη γραμμή επειδή κάποιος την έγραψε αλλιώς.
  insert into public.email_outbox (copy_id, to_email, to_name, params, category)
    values ('welcome', '  Diagrafi-Probe@Example.GR ', 'Ο χρήστης', '{}'::jsonb, 'lifecycle');
  insert into public.app_admins (email) values (v_mail);

  -- ΠΡΩΤΑ ΒΕΒΑΙΩΣΟΥ ΟΤΙ ΥΠΑΡΧΟΥΝ: αλλιώς το μηδέν στο τέλος δεν αποδεικνύει τίποτα.
  select (select count(*) from public.email_outbox where lower(btrim(to_email)) = v_mail)
       + (select count(*) from public.app_admins   where lower(btrim(email))    = v_mail)
    into n;
  if n <> 2 then
    raise exception 'Ο έλεγχος είναι κενός: περίμενα δύο γραμμές πριν τη διαγραφή, βρήκα %', n;
  end if;

  perform set_config('probe.uid', v_uid::text, true);
  res := public.delete_my_account();
  perform set_config('probe.uid', '', true);

  select (select count(*) from public.email_outbox where lower(btrim(to_email)) = v_mail)
       + (select count(*) from public.app_admins   where lower(btrim(email))    = v_mail)
    into n;
  if n <> 0 then
    raise exception 'Η διαγραφή λογαριασμού άφησε % γραμμές με τη διεύθυνση του χρήστη', n;
  end if;

  -- Και ο ίδιος ο χρήστης έφυγε, μαζί με ό,τι κρέμεται από πάνω του.
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'Ο χρήστης επέζησε της διαγραφής του: %', res;
  end if;
  if exists (select 1 from public.user_properties where user_id = v_uid) then
    raise exception 'Το ακίνητο επέζησε της διαγραφής του λογαριασμού';
  end if;

  raise notice 'probe: η διαγραφή λογαριασμού αδειάζει και την ουρά των email';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΤΡΑΠΕΖΙΚΗ ΣΥΝΔΕΣΗ: ΤΙ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ ΚΑΙ ΤΙ ΔΕΝ ΒΛΕΠΕΙ ΠΟΤΕ
-- ─────────────────────────────────────────────────────────────────────────
-- Τρία πράγματα κρίνονται εδώ, και κανένα δεν φαίνεται από την οθόνη αν
-- σπάσει: η απομόνωση μεταξύ ιδιοκτητών, το ότι το αναγνωριστικό του παρόχου
-- μένει στον διακομιστή, και το ότι η διακοπή της σύνδεσης δεν σβήνει βιβλία.
--
-- ΠΡΟΣΟΧΗ ΣΤΟ ΤΙ ΑΠΟΔΕΙΚΝΥΕΙ ΤΟ ΔΕΥΤΕΡΟ. Η σκαλωσιά παραπάνω έδωσε ΡΗΤΑ
-- δικαιώματα σε όλους τους πίνακες στον `authenticated`, άρα εδώ δοκιμάζεται
-- ο ΔΕΥΤΕΡΟΣ μηχανισμός άρνησης — RLS ενεργό με μηδέν πολιτικές — και όχι η
-- ανάκληση δικαιωμάτων. Ακριβώς αυτό θέλουμε: ότι η άρνηση κρατά ακόμη κι αν
-- κάποιος δώσει κατά λάθος GRANT.
-- ═══════════════════════════════════════════════════════════════════════════
reset role;
set session "probe.uid" = '';

do $probe$
declare
  ca uuid := 'cccccccc-0000-0000-0000-00000000000a';
  cb uuid := 'cccccccc-0000-0000-0000-00000000000b';
begin
  insert into public.bank_connections (id, user_id, provider, institution_id, institution_name, status)
    values (ca, '11111111-1111-1111-1111-111111111111', 'gocardless', 'NBG_ETHNGRAA', 'Εθνική Τράπεζα', 'active'),
           (cb, '22222222-2222-2222-2222-222222222222', 'gocardless', 'PIRAEUS_PIRBGRAA', 'Τράπεζα Πειραιώς', 'active');
  insert into public.bank_connection_refs (connection_id, external_ref)
    values (ca, 'req_tou_a'), (cb, 'req_tou_b');
  insert into public.bank_transactions (user_id, connection_id, txn_date, description, amount, dedup_hash)
    values ('11111111-1111-1111-1111-111111111111', ca, '2026-08-01', 'ΕΝΟΙΚΙΟ', 800, 'ob1|gocardless|' || ca || '|T1');
  raise notice 'probe: δύο τραπεζικές συνδέσεις, μία ανά ιδιοκτήτη';
end $probe$;

set role authenticated;
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare n int;
begin
  select count(*) into n from public.bank_connections;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % τραπεζικές συνδέσεις αντί για 1', n; end if;

  -- ΤΟ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΤΟΥ ΠΑΡΟΧΟΥ ΔΕΝ ΦΤΑΝΕΙ ΟΥΤΕ ΣΤΟΝ ΙΔΙΟ ΤΟΝ ΙΔΙΟΚΤΗΤΗ.
  -- Δεν το χρειάζεται· και μαζί με το κλειδί μας ανοίγει τις κινήσεις.
  select count(*) into n from public.bank_connection_refs;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: το αναγνωριστικό του παρόχου έφτασε στον περιηγητή (% γραμμές)', n; end if;

  -- Ούτε γράφεται από εκεί.
  begin
    insert into public.bank_connection_refs (connection_id, external_ref)
      values ('cccccccc-0000-0000-0000-00000000000a', 'req_plastos');
    raise exception 'ΔΙΑΡΡΟΗ: ο χρήστης έγραψε αναγνωριστικό παρόχου';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  -- ΜΙΑ ΖΩΝΤΑΝΗ ΣΥΝΔΕΣΗ ΑΝΑ ΤΡΑΠΕΖΑ. Χωρίς αυτό, δεύτερη προσπάθεια σύνδεσης
  -- θα άφηνε δεύτερη γραμμή — και το πρόσθετο χρεώνει ανά σύνδεση.
  begin
    insert into public.bank_connections (user_id, provider, institution_id, institution_name, status)
      values ('11111111-1111-1111-1111-111111111111', 'gocardless', 'NBG_ETHNGRAA', 'Εθνική Τράπεζα', 'pending');
    raise exception 'ΔΙΠΛΗ ΧΡΕΩΣΗ: δεύτερη ζωντανή σύνδεση στην ίδια τράπεζα πέρασε';
  exception
    when unique_violation then null;
    when others then if sqlerrm like 'ΔΙΠΛΗ%' then raise; end if;
  end;

  -- Η ΔΙΑΚΟΠΗ ΤΗΣ ΣΥΝΔΕΣΗΣ ΔΕΝ ΣΒΗΝΕΙ ΒΙΒΛΙΑ. Ο χρήστης παύει να πληρώνει το
  -- πρόσθετο· οι κινήσεις που έχουν ήδη συνδεθεί με ενοίκια μένουν.
  delete from public.bank_connections where id = 'cccccccc-0000-0000-0000-00000000000a';
  select count(*) into n from public.bank_transactions
   where user_id = '11111111-1111-1111-1111-111111111111' and dedup_hash like 'ob1|%';
  if n <> 1 then raise exception 'Η διακοπή της σύνδεσης έσβησε τις κινήσεις (% έμειναν)', n; end if;
  select count(*) into n from public.bank_transactions
   where dedup_hash like 'ob1|%' and connection_id is not null;
  if n <> 0 then raise exception 'Η κίνηση δείχνει ακόμη σε σύνδεση που δεν υπάρχει'; end if;

  raise notice 'probe: η τραπεζική σύνδεση μένει στον ιδιοκτήτη της, το αναγνωριστικό του παρόχου στον διακομιστή';
end $probe$;

reset role;
set session "probe.uid" = '';

do $probe$
declare n int;
begin
  -- Και το αναγνωριστικό της σβησμένης σύνδεσης έφυγε μαζί της.
  select count(*) into n from public.bank_connection_refs where external_ref = 'req_tou_a';
  if n <> 0 then raise exception 'Το αναγνωριστικό του παρόχου επέζησε της διαγραφής της σύνδεσης'; end if;
  raise notice 'probe: το αναγνωριστικό του παρόχου φεύγει μαζί με τη σύνδεση';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ «ΠΟΤΕ ΑΛΛΑΞΕ» ΑΛΛΑΖΕΙ ΟΤΑΝ ΑΛΛΑΖΕΙ Η ΓΡΑΜΜΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Είκοσι πίνακες είχαν στήλη `updated_at` και καμία σκανδάλη να τη γράφει: η
-- τιμή έμενε αυτή της εισαγωγής για πάντα, και τρία σημεία του κώδικα τη
-- συμπλήρωναν από το ρολόι του ΠΕΡΙΗΓΗΤΗ — που μπορεί να είναι λάθος ώρες.
--
-- Ο έλεγχος δεν ρωτά «υπάρχει σκανδάλη;»: την ΚΑΛΕΙ. Μια σκανδάλη γραμμένη με
-- λάθος χρόνο (AFTER αντί για BEFORE) υπάρχει και δεν κάνει τίποτα.
-- ═══════════════════════════════════════════════════════════════════════════
reset role;
set session "probe.uid" = '';

do $probe$
declare
  v_uid uuid := '9d9d9d9d-0000-0000-0000-000000000001';
  v_pid uuid;
  t0 timestamptz;
  t1 timestamptz;
  n int;
begin
  insert into auth.users (id, email) values (v_uid, 'updatedat-probe@example.gr');
  insert into public.user_properties (user_id, name) values (v_uid, 'Το σπίτι του χρόνου')
    returning id into v_pid;

  insert into public.tenants (user_id, property_id, full_name)
    values (v_uid, v_pid, 'Πρώτο όνομα');
  select updated_at into t0 from public.tenants where user_id = v_uid;
  if t0 is null then raise exception 'Το updated_at δεν πήρε τιμή στην εισαγωγή'; end if;

  -- ΔΕΝ ΣΥΓΚΡΙΝΟΥΜΕ ΧΡΟΝΟΥΣ, ΚΑΙ ΓΙ' ΑΥΤΟ Ο ΕΛΕΓΧΟΣ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ. Η
  -- συνάρτηση γράφει `now()`, που μέσα στην ίδια συναλλαγή είναι ΣΤΑΘΕΡΟ: δύο
  -- διαδοχικές ενημερώσεις δίνουν την ίδια σφραγίδα και η σύγκριση «άλλαξε;»
  -- αποτυγχάνει ακόμη κι όταν η σκανδάλη δουλεύει.
  --
  -- Ελέγχεται αυτό που μετράει πραγματικά: ότι ο ΠΕΛΑΤΗΣ δεν μπορεί να γράψει
  -- δική του σφραγίδα. Ο κώδικας το έκανε σε τρία σημεία, με το ρολόι του
  -- περιηγητή, που μπορεί να είναι λάθος ώρες ή μέρες.
  update public.tenants
     set full_name = 'Δεύτερο όνομα', updated_at = timestamptz '2000-01-01 00:00:00+00'
   where user_id = v_uid;
  select updated_at into t1 from public.tenants where user_id = v_uid;
  if t1 = timestamptz '2000-01-01 00:00:00+00' then
    raise exception 'Το updated_at του tenants δέχτηκε σφραγίδα πελάτη: η σκανδάλη δεν έτρεξε';
  end if;
  if t1 < t0 then
    raise exception 'Το updated_at του tenants πήγε πίσω: % → %', t0, t1;
  end if;

  -- Και δεν μένει πίνακας με τη στήλη και χωρίς σκανδάλη που να τη γράφει.
  select count(*) into n
    from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'updated_at'
     and not exists (
       select 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
        where tg.tgrelid = (quote_ident(c.table_name))::regclass
          and not tg.tgisinternal and p.proname = 'update_updated_at_column');
  if n > 0 then
    raise exception '% πίνακες έχουν updated_at χωρίς σκανδάλη που να τη γράφει', n;
  end if;

  raise notice 'probe: το updated_at ανανεώνεται από τη βάση, σε κάθε πίνακα που το δηλώνει';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΘΕ ΞΕΝΟ ΚΛΕΙΔΙ ΕΧΕΙ ΕΥΡΕΤΗΡΙΟ, ΚΑΙ ΚΑΘΕ user_id ΔΕΙΧΝΕΙ ΣΕ ΧΡΗΣΤΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Το Postgres ευρετηριάζει το πρωτεύον κλειδί, όχι το ξένο: χωρίς ευρετήριο,
-- η διαγραφή μιας γονικής γραμμής σαρώνει ολόκληρο τον πίνακα-παιδί. Και η RLS
-- φιλτράρει σε κάθε ερώτημα με `user_id = auth.uid()`, οπότε ένα `user_id`
-- χωρίς ευρετήριο κάνει ΚΑΘΕ ανάγνωση σειριακή σάρωση.
-- ═══════════════════════════════════════════════════════════════════════════
do $probe$
declare bad text;
begin
  select string_agg(format('%s.%s', tbl, col), ', ') into bad from (
    select con.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f' and array_length(con.conkey, 1) = 1
       and con.connamespace = 'public'::regnamespace
       and not exists (select 1 from pg_index i
                        where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1])
  ) q;
  if bad is not null then raise exception 'Ξένα κλειδιά χωρίς ευρετήριο: %', bad; end if;

  select string_agg(c.table_name, ', ') into bad
    from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'user_id'
     and not exists (
       select 1 from pg_constraint con
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
       where con.contype = 'f' and con.conrelid = (quote_ident(c.table_name))::regclass
         and a.attname = 'user_id');
  if bad is not null then raise exception 'Στήλες user_id χωρίς ξένο κλειδί: %', bad; end if;

  raise notice 'probe: κάθε ξένο κλειδί έχει ευρετήριο και κάθε user_id δείχνει σε χρήστη';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΣΥΝΔΡΟΜΗ ΔΕΝ ΓΡΑΦΕΤΑΙ ΑΠΟ ΤΗΝ ΚΟΝΣΟΛΑ ΤΟΥ ΠΕΡΙΗΓΗΤΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Οι στήλες του εμπόρου μετονομάστηκαν από `stripe_*` σε `mor_*` και τέσσερις
-- καινούριες μπήκαν δίπλα τους. Μια στήλη που ΔΕΝ μπήκε στη σκανδάλη είναι
-- στήλη που γράφει ο καθένας: με το δημόσιο κλειδί, από την κονσόλα,
--
--     update billing_profiles set plan = 'office', subscription_status = 'active'
--
-- και η συνδρομή είναι δωρεάν.
--
-- Ο ΕΛΕΓΧΟΣ ΑΠΟΔΕΙΚΝΥΕΙ ΠΡΩΤΑ ΟΤΙ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ. Η πρώτη γραφή αυτού του
-- ελέγχου χρησιμοποιούσε `request.jwt.claims`, που η σκαλωσιά εδώ ΔΕΝ διαβάζει:
-- το `auth.uid()` έβγαινε null, η RLS έκοβε την ενημέρωση, καμία γραμμή δεν
-- άλλαζε — και ο έλεγχος «περνούσε» ό,τι κι αν έλεγε η σκανδάλη. Γι` αυτό
-- μετριέται το `row_count` και ελέγχεται ότι μια ΕΠΙΤΡΕΠΤΗ στήλη όντως άλλαξε.
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΤΟΠΙΚΗ ΔΟΚΙΜΗ ΣΤΑΜΑΤΑ ΜΟΛΙΣ Ο ΕΜΠΟΡΟΣ ΔΩΣΕΙ ΤΗ ΔΙΚΗ ΤΟΥ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΕΝΑΡΙΟ ΠΟΥ ΕΔΙΝΕ ΔΩΡΕΑΝ ΠΡΟΪΟΝ. Ο πελάτης αγοράζει, μπαίνει σε δοκιμή
-- στον έμπορο, ακυρώνει τη ΔΕΥΤΕΡΗ ημέρα. Η συνδρομή πεθαίνει, ο webhook
-- γράφει `plan = 'free'` — και η βάση συνέχιζε να του δίνει βαθμό 2
-- («Ιδιοκτήτης+», τρία ακίνητα) για άλλες είκοσι οκτώ ημέρες, επειδή ο
-- λογαριασμός ήταν ακόμη νεότερος των τριάντα.
--
-- Καμία σουίτα TypeScript δεν πιάνει αυτό: ο κανόνας ζει σε συνάρτηση της
-- βάσης, και η βάση είναι που κόβει το «Προσθήκη ακινήτου».
do $probe$
declare v_uid uuid := '3a3a3a3a-0000-4000-8000-00000000d0c1';
declare v_rank int;
begin
  insert into auth.users(id, email) values (v_uid, 'dokimi@probe.test')
    on conflict (id) do nothing;

  -- ΠΡΙΝ: λογαριασμός μιας ημέρας, χωρίς σφραγίδα. Η τοπική δοκιμή ισχύει.
  update public.billing_profiles
     set plan = 'free', trial_used_at = null where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 2 then
    raise exception 'Ο έλεγχος θα ήταν κενός: νέος λογαριασμός χωρίς σφραγίδα έδωσε βαθμό % αντί για 2', v_rank;
  end if;

  -- ΜΕΤΑ: ο έμπορος έδωσε τη δοκιμή του και ο πελάτης ακύρωσε. Η τοπική
  -- δοκιμή ΔΕΝ ισχύει πια, ό,τι ηλικία κι αν έχει ο λογαριασμός.
  update public.billing_profiles
     set trial_used_at = now() - interval '2 days' where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 0 then
    raise exception 'ΔΩΡΕΑΝ ΠΡΟΪΟΝ: με σφραγισμένη δοκιμή ο λογαριασμός κρατά βαθμό % αντί για 0. Αγόρασε, ακύρωσε τη δεύτερη ημέρα, και κρατά τρία ακίνητα.', v_rank;
  end if;

  -- ΚΑΙ Η ΠΛΗΡΩΜΕΝΗ ΣΥΝΔΡΟΜΗ ΔΕΝ ΘΙΓΕΤΑΙ. Ο,τι έγραψε ο webhook στο `plan`
  -- μετράει ακέραιο· η σφραγίδα κόβει μόνο το ΔΩΡΟ, όχι την αγορά.
  update public.billing_profiles set plan = 'agency' where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 3 then
    raise exception 'Η σφραγίδα της δοκιμής έκοψε πληρωμένη συνδρομή: βαθμός % αντί για 3', v_rank;
  end if;
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΓΡΑΜΜΗ ΧΡΕΩΣΗΣ ΓΕΝΝΙΕΤΑΙ ΜΑΖΙ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ
-- ─────────────────────────────────────────────────────────────────────────
-- ΓΙΑΤΙ ΕΛΕΓΧΕΤΑΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΕ ΣΟΥΙΤΑ TypeScript. Ο χειριστής πληρωμών κάνει
-- `update … where user_id = …`. Οταν η γραμμή λείπει, το PostgREST ΔΕΝ βγάζει
-- σφάλμα: ταιριάζουν μηδέν γραμμές, ο χειριστής απαντά 200, και ο έμπορος δεν
-- ξαναστέλνει ποτέ το γεγονός. Πελάτης χρεωμένος, χωρίς πακέτο, χωρίς ίχνος.
-- Κανένας έλεγχος με ψεύτικη βάση δεν πιάνει αυτό — μόνο η ίδια η σκανδάλη.
do $probe$
declare v_uid uuid := '5b5b5b5b-0000-4000-8000-00000000b111';
declare n int;
begin
  insert into auth.users(id, email) values (v_uid, 'neos@probe.test')
    on conflict (id) do nothing;
  select count(*) into n from public.billing_profiles where user_id = v_uid;
  if n <> 1 then
    raise exception 'Ο ΛΟΓΑΡΙΑΣΜΟΣ ΓΕΝΝΗΘΗΚΕ ΧΩΡΙΣ ΓΡΑΜΜΗ ΧΡΕΩΣΗΣ: % αντί για 1. Ο webhook θα ενημερώσει μηδέν γραμμές και θα απαντήσει επιτυχία.', n;
  end if;
  -- ΚΑΙ ΜΕ ΤΙΜΕΣ ΠΟΥ ΥΠΑΡΧΟΥΝ. Η προεπιλογή έλεγε 'trial' — πακέτο που δεν
  -- υπάρχει πουθενά στον κώδικα — και 'trialing', όνομα παρόχου που δεν
  -- επιλέχθηκε ποτέ. Σε ερώτημα SQL διαβάζονταν ως «σε δοκιμή».
  select count(*) into n from public.billing_profiles
   where user_id = v_uid and plan = 'free' and subscription_status is null;
  if n <> 1 then
    raise exception 'Η νέα γραμμή χρέωσης δεν γεννήθηκε ως «χωρίς πακέτο, χωρίς συνδρομή»';
  end if;
end $probe$;

do $probe$
declare v_uid uuid := '7c7c7c7c-0000-4000-8000-00000000c0de';
begin
  insert into auth.users(id, email) values (v_uid, 'emporos@probe.test')
    on conflict (id) do nothing;
  -- Το προφίλ ΥΠΑΡΧΕΙ ΗΔΗ: η σκανδάλη `ensure_billing_profile` το γεννά μαζί
  -- με τον λογαριασμό. Ο έλεγχος το γεμίζει όπως θα το έγραφε ο webhook, με
  -- ρόλο υπηρεσίας — γι' αυτό `on conflict do update` και όχι σκέτο insert:
  -- ένα `insert` εδώ έσκαγε σε παραβίαση πρωτεύοντος κλειδιού, δηλαδή ο
  -- έλεγχος απομόνωσης θα σταματούσε πριν ελέγξει οτιδήποτε.
  insert into public.billing_profiles(user_id, full_name, plan, subscription_status,
      mor_customer_id, mor_subscription_id, mor_variant_id, mor_renews_at, mor_ends_at, mor_event_at,
      trial_used_at, tester_since)
    values (v_uid, 'Πριν', 'solo', 'on_trial', 'cus-1', 'sub-1', 'var-1',
            timestamptz '2026-09-20', null, timestamptz '2026-08-20',
            timestamptz '2026-08-01', null)
    on conflict (user_id) do update set
      full_name = excluded.full_name, plan = excluded.plan,
      subscription_status = excluded.subscription_status,
      mor_customer_id = excluded.mor_customer_id,
      mor_subscription_id = excluded.mor_subscription_id,
      mor_variant_id = excluded.mor_variant_id,
      mor_renews_at = excluded.mor_renews_at, mor_ends_at = excluded.mor_ends_at,
      mor_event_at = excluded.mor_event_at,
      trial_used_at = excluded.trial_used_at, tester_since = excluded.tester_since;
end $probe$;

set role authenticated;
set session "probe.uid" = '7c7c7c7c-0000-4000-8000-00000000c0de';

do $probe$
declare n int;
begin
  update public.billing_profiles
     set full_name = 'Μετά',
         plan = 'office', subscription_status = 'active',
         mor_customer_id = 'δικό-μου', mor_subscription_id = 'δικό-μου',
         mor_variant_id = 'δικό-μου',
         mor_renews_at = timestamptz '2099-01-01', mor_ends_at = timestamptz '2099-01-01',
         mor_event_at = timestamptz '2099-01-01',
         -- ΟΙ ΔΥΟ ΠΟΥ ΔΙΝΟΥΝ ΔΩΡΕΑΝ ΧΡΗΣΗ: σβήσιμο της χρήσης δοκιμής ξεκινά νέα
         -- δοκιμή 30 ημερών, και η ιδιότητα δοκιμαστή δίνει το προϊόν δωρεάν.
         trial_used_at = null, tester_since = timestamptz '2026-01-01',
         -- ΚΑΙ Η ΚΡΑΤΗΣΗ ΥΠΟΒΑΘΜΙΣΗΣ: μια γραμμή εδώ κρατά το ακριβότερο πακέτο
         -- ώς το 2100, χωρίς καμία συνδρομή από πίσω.
         hold_plan = 'office', hold_until = timestamptz '2099-01-01'
   where user_id = '7c7c7c7c-0000-4000-8000-00000000c0de';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Ο έλεγχος θα ήταν κενός: η ενημέρωση άγγιξε % γραμμές αντί για 1', n;
  end if;
end $probe$;

reset role;
set session "probe.uid" = '';

do $probe$
declare r record;
begin
  select * into r from public.billing_profiles
   where user_id = '7c7c7c7c-0000-4000-8000-00000000c0de';

  -- Η απόδειξη ότι η γραμμή ΗΤΑΝ προσιτή: ό,τι επιτρέπεται άλλαξε.
  if r.full_name <> 'Μετά' then
    raise exception 'Ο έλεγχος είναι κενός: ούτε οι επιτρεπτές στήλες δεν γράφτηκαν';
  end if;

  if r.plan <> 'solo' then raise exception 'Ο χρήστης αναβάθμισε μόνος του το πακέτο: %', r.plan; end if;
  -- Η δοκιμή ξεκινά ως «on_trial» και ο χρήστης γράφει «active»: αν περάσει,
  -- η δοκιμαστική περίοδος δεν λήγει ποτέ.
  if r.subscription_status <> 'on_trial' then raise exception 'Ο χρήστης έγραψε την κατάσταση συνδρομής: %', r.subscription_status; end if;
  if r.mor_customer_id <> 'cus-1' then raise exception 'Ο χρήστης έγραψε τον πελάτη του εμπόρου'; end if;
  if r.mor_subscription_id <> 'sub-1' then raise exception 'Ο χρήστης έγραψε τη συνδρομή του εμπόρου'; end if;
  -- ΟΙ ΔΥΟ ΠΟΥ ΔΙΝΟΥΝ ΔΩΡΕΑΝ ΧΡΗΣΗ. Σβησμένη χρήση δοκιμής σημαίνει νέα δοκιμή
  -- 30 ημερών σε κάθε πάτημα· ιδιότητα δοκιμαστή σημαίνει ολόκληρο το προϊόν
  -- δωρεάν, χωρίς συνδρομή. Και τα δύο με μια γραμμή στην κονσόλα του περιηγητή.
  if r.trial_used_at is null then raise exception 'Ο χρήστης έσβησε τη χρήση της δοκιμής: μπορεί να ξαναρχίσει δοκιμή όποτε θέλει'; end if;
  if r.tester_since is not null then raise exception 'Ο χρήστης έγραψε μόνος του ιδιότητα δοκιμαστή: δωρεάν προϊόν'; end if;
  if r.hold_plan is not null or r.hold_until is not null then
    raise exception 'Ο χρήστης έγραψε μόνος του κράτηση υποβάθμισης: θα κρατούσε το ακριβότερο πακέτο ώς το 2099';
  end if;
  if r.mor_variant_id <> 'var-1' then raise exception 'Ο χρήστης έγραψε την παραλλαγή: θα διάλεγε πακέτο μόνος του'; end if;
  if r.mor_renews_at <> timestamptz '2026-09-20' then raise exception 'Ο χρήστης έγραψε την ημερομηνία ανανέωσης'; end if;
  if r.mor_ends_at is not null then raise exception 'Ο χρήστης έγραψε την ημερομηνία λήξης'; end if;
  if r.mor_event_at <> timestamptz '2026-08-20' then raise exception 'Ο χρήστης έγραψε την ώρα γεγονότος: θα έκοβε κάθε επόμενο webhook ως παλιό'; end if;

  -- ΚΑΙ ΚΑΜΙΑ ΣΤΗΛΗ `mor_` ΔΕΝ ΜΕΝΕΙ ΕΞΩ ΑΠΟ ΤΗ ΣΚΑΝΔΑΛΗ. Οι έλεγχοι από πάνω
  -- πιάνουν τις σημερινές· αυτός πιάνει την επόμενη που θα προστεθεί χωρίς να
  -- μπει στη λίστα.
  if exists (
    select 1 from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'billing_profiles'
       and (c.column_name like 'mor\_%' or c.column_name like 'hold\_%')
       and pg_get_functiondef('public.lock_billing_plan'::regproc)
             not like '%old.' || c.column_name || '%'
  ) then
    raise exception 'Στήλη mor_ ή hold_ εκτός της lock_billing_plan: θα την έγραφε ο χρήστης';
  end if;

  raise notice 'probe: οι στήλες του εμπόρου γράφονται μόνο με ρόλο υπηρεσίας';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΥΠΟΒΑΘΜΙΣΗ ΠΕΡΙΜΕΝΕΙ ΤΗΝ ΑΝΑΝΕΩΣΗ, ΚΑΙ ΔΕΝ ΑΝΑΣΤΑΙΝΕΙ ΝΕΚΡΗ ΣΥΝΔΡΟΜΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Ο ΕΜΠΟΡΟΣ ΔΕΝ ΞΕΡΕΙ ΝΑ ΑΝΑΒΑΛΕΙ. Η παραλλαγή αλλάζει τη στιγμή του
-- αιτήματος, άρα ο webhook γράφει αμέσως το χαμηλότερο πακέτο· ο πελάτης όμως
-- έχει πληρώσει ολόκληρη την περίοδο στο ακριβότερο. Η αναβολή είναι δική μας,
-- και ζει σε αυτές τις δύο στήλες.
--
-- ΚΑΙ ΕΧΕΙ ΜΙΑ ΠΛΕΥΡΑ ΠΟΥ ΔΙΝΕΙ ΔΩΡΕΑΝ ΠΡΟΪΟΝ ΑΝ ΞΕΧΑΣΤΕΙ. Χωρίς τον όρο «όσο
-- η συνδρομή ζει», όποιος υποβαθμίστηκε και μετά σταμάτησε να πληρώνει θα
-- κρατούσε το ακριβό πακέτο ώς την ημερομηνία της κράτησης — και η ημερομηνία
-- τη γράφει ο webhook, δηλαδή θα μπορούσε να είναι έναν ολόκληρο χρόνο μακριά.
do $probe$
declare v_uid uuid := '9e9e9e9e-0000-4000-8000-00000000a1d0';
declare v_rank int;
begin
  insert into auth.users(id, email) values (v_uid, 'ypovathmisi@probe.test')
    on conflict (id) do nothing;

  -- ΠΡΙΝ: πληρωμένο «Ιδιοκτήτης», σφραγισμένη δοκιμή, καμία κράτηση.
  update public.billing_profiles
     set plan = 'solo', trial_used_at = now() - interval '40 days',
         hold_plan = null, hold_until = null
   where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 1 then
    raise exception 'Ο έλεγχος θα ήταν κενός: πληρωμένο solo έδωσε βαθμό % αντί για 1', v_rank;
  end if;

  -- ΜΕΤΑ ΤΗΝ ΥΠΟΒΑΘΜΙΣΗ: ο webhook έγραψε ήδη το χαμηλό πακέτο, η κράτηση
  -- κρατά το πληρωμένο ώς την ανανέωση.
  update public.billing_profiles
     set hold_plan = 'agency', hold_until = now() + interval '10 days'
   where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 3 then
    raise exception 'Η ΥΠΟΒΑΘΜΙΣΗ ΕΓΙΝΕ ΑΜΕΣΩΣ: βαθμός % αντί για 3. Ο πελάτης πλήρωσε τον μήνα και έχασε το Πελατολόγιο την ίδια ώρα.', v_rank;
  end if;

  -- ΣΤΗΝ ΑΝΑΝΕΩΣΗ Η ΚΡΑΤΗΣΗ ΛΗΓΕΙ ΜΟΝΗ ΤΗΣ, χωρίς καμία δουλειά από κανέναν.
  update public.billing_profiles
     set hold_until = now() - interval '1 minute' where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 1 then
    raise exception 'Η κράτηση δεν έληξε στην ώρα της: βαθμός % αντί για 1. Ο πελάτης πληρώνει «Ιδιοκτήτη» και παίρνει «Επαγγελματία».', v_rank;
  end if;

  -- ΚΑΙ ΔΕΝ ΑΝΑΣΤΑΙΝΕΙ ΝΕΚΡΗ ΣΥΝΔΡΟΜΗ. Οταν οι πληρωμές σταματήσουν, ο webhook
  -- γράφει `plan = 'free'`· η κράτηση δεν επιτρέπεται να το ακυρώσει.
  update public.billing_profiles
     set plan = 'free', hold_plan = 'office', hold_until = now() + interval '300 days'
   where user_id = v_uid;
  v_rank := public.user_plan_rank(v_uid);
  if v_rank <> 0 then
    raise exception 'ΔΩΡΕΑΝ ΠΡΟΪΟΝ: η κράτηση κράτησε ζωντανό λογαριασμό χωρίς συνδρομή, βαθμός %', v_rank;
  end if;

  raise notice 'probe: η υποβάθμιση περιμένει την ανανέωση, λήγει μόνη της, και δεν ανασταίνει νεκρή συνδρομή';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΜΙΑ ΧΡΕΩΣΗ ΧΩΡΙΣ ΠΡΟΕΙΔΟΠΟΙΗΣΗ, ΚΑΙ ΚΑΜΙΑ ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΓΙΑ ΧΡΕΩΣΗ ΠΟΥ
-- ΔΕΝ ΘΑ ΓΙΝΕΙ
-- ─────────────────────────────────────────────────────────────────────────
-- Οι Οροι δεσμεύονται σε ειδοποίηση πριν από κάθε ανανέωση. Η συνάρτηση που
-- τη στέλνει ζει στη βάση, δεν την πιάνει καμία σουίτα TypeScript, και έχει
-- τέσσερις τρόπους να είναι σιωπηλά λάθος: να μη στείλει, να στείλει δύο
-- φορές, να στείλει λάθος ποσό, ή να στείλει σε ακυρωμένη συνδρομή.
do $probe$
declare v_uid uuid := 'c4c4c4c4-0000-4000-8000-00000000e1f0';
declare n int; v_amount numeric; v_trial text;
begin
  insert into auth.users(id, email, email_confirmed_at)
       values (v_uid, 'chreosi@probe.test', now())
    on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;

  -- Μηνιαία συνδρομή σε δοκιμή, με πρώτη χρέωση σε τρεις ημέρες.
  update public.billing_profiles
     set plan = 'owner', billing_cycle = 'monthly',
         mor_subscription_id = 'sub-probe', mor_ends_at = null,
         mor_renews_at = now() + interval '3 days',
         subscription_status = 'on_trial'
   where user_id = v_uid;

  delete from public.email_outbox where to_email = 'chreosi@probe.test';
  perform public.charge_upcoming_enqueue();

  select count(*) into n from public.email_outbox
   where to_email = 'chreosi@probe.test' and copy_id = 'charge_upcoming';
  if n <> 1 then
    raise exception 'ΧΡΕΩΣΗ ΧΩΡΙΣ ΠΡΟΕΙΔΟΠΟΙΗΣΗ: % μηνύματα αντί για 1. Οι Οροι υπόσχονται ειδοποίηση πριν από κάθε ανανέωση.', n;
  end if;

  select (params->>'amount')::numeric, params->>'trialDaysLeft' into v_amount, v_trial
    from public.email_outbox where to_email = 'chreosi@probe.test' limit 1;
  if v_amount <> 9.90 then
    raise exception 'Λάθος ποσό στην προαναγγελία: % αντί για 9.90', v_amount;
  end if;
  if v_trial is null then
    raise exception 'Η πρώτη χρέωση μετά τη δοκιμή δεν αναγνωρίστηκε ως τέλος δοκιμής';
  end if;

  -- ΔΕΥΤΕΡΗ ΕΚΤΕΛΕΣΗ ΤΗΝ ΕΠΟΜΕΝΗ ΗΜΕΡΑ: ούτε ένα διπλό.
  perform public.charge_upcoming_enqueue();
  select count(*) into n from public.email_outbox
   where to_email = 'chreosi@probe.test' and copy_id = 'charge_upcoming';
  if n <> 1 then
    raise exception 'Διπλή προαναγγελία για την ίδια ανανέωση: % μηνύματα', n;
  end if;

  -- ΑΛΛΗ ΑΝΑΝΕΩΣΗ, ΑΛΛΟ ΜΗΝΥΜΑ. Το κλειδί κρατά την ημερομηνία μέσα του: όταν
  -- η ανανέωση μετακινηθεί (αναβάθμιση που μετέθεσε τον κύκλο) ή όταν έρθει η
  -- επόμενη περίοδος, ο πελάτης ΠΡΕΠΕΙ να ειδοποιηθεί ξανά. Χωρίς την
  -- ημερομηνία στο κλειδί, το πρώτο μήνυμα θα ήταν και το τελευταίο της ζωής
  -- του λογαριασμού: μία ειδοποίηση, και μετά χρόνια σιωπηλών χρεώσεων.
  update public.billing_profiles
     set mor_renews_at = now() + interval '2 days' where user_id = v_uid;
  perform public.charge_upcoming_enqueue();
  select count(*) into n from public.email_outbox
   where to_email = 'chreosi@probe.test' and copy_id = 'charge_upcoming';
  if n <> 2 then
    raise exception 'Η ΕΠΟΜΕΝΗ ΑΝΑΝΕΩΣΗ ΔΕΝ ΠΡΟΑΝΑΓΓΕΛΘΗΚΕ: % μηνύματα αντί για 2. Το κλειδί δεν κρατά την ημερομηνία, άρα κάθε λογαριασμός ειδοποιείται μία μόνο φορά στη ζωή του.', n;
  end if;

  -- ΕΤΗΣΙΑ: τρεις ημέρες πριν είναι ΠΟΛΥ ΑΡΓΑ, το παράθυρό της είναι στις 30.
  delete from public.email_outbox where to_email = 'chreosi@probe.test';
  update public.billing_profiles set billing_cycle = 'annual' where user_id = v_uid;
  perform public.charge_upcoming_enqueue();
  select count(*) into n from public.email_outbox where to_email = 'chreosi@probe.test';
  if n <> 0 then
    raise exception 'Η ετήσια ειδοποιήθηκε τρεις ημέρες πριν, ενώ οι Οροι λένε τριάντα';
  end if;

  update public.billing_profiles
     set mor_renews_at = now() + interval '29 days' where user_id = v_uid;
  perform public.charge_upcoming_enqueue();
  select (params->>'amount')::numeric into v_amount
    from public.email_outbox where to_email = 'chreosi@probe.test' limit 1;
  if v_amount is null or v_amount <> 99.00 then
    raise exception 'Η ετήσια δεν ειδοποιήθηκε στις είκοσι εννέα ημέρες, ή με λάθος ποσό: %', v_amount;
  end if;

  -- ΑΚΥΡΩΜΕΝΗ ΣΥΝΔΡΟΜΗ: δεν πρόκειται να χρεώσει, άρα δεν προαναγγέλλει.
  delete from public.email_outbox where to_email = 'chreosi@probe.test';
  update public.billing_profiles
     set mor_ends_at = now() + interval '29 days' where user_id = v_uid;
  perform public.charge_upcoming_enqueue();
  select count(*) into n from public.email_outbox where to_email = 'chreosi@probe.test';
  if n <> 0 then
    raise exception 'ΤΡΟΜΑΚΤΙΚΟ ΚΑΙ ΨΕΥΔΕΣ: ακυρωμένη συνδρομή πήρε υπενθύμιση ανανέωσης';
  end if;

  delete from public.email_outbox where to_email = 'chreosi@probe.test';
  raise notice 'probe: κάθε χρέωση προαναγγέλλεται μία φορά, με το σωστό ποσό, και καμία ακυρωμένη';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Η ΙΔΙΩΤΙΚΗ ΔΙΕΥΘΥΝΣΗ: ΤΟ ΚΟΥΠΟΝΙ ΔΕΝ ΔΙΑΒΑΖΕΤΑΙ ΚΑΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΑΠΟ ΞΕΝΟ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΘΑ ΣΗΜΑΙΝΕ ΔΙΑΡΡΟΗ ΕΔΩ. Οποιος ξέρει το κουπόνι κάποιου μπορεί να του
--  στέλνει «λογαριασμούς»: να γεμίσει την ουρά του με σκουπίδια, ή να του
--  υποβάλει παραστατικό που δεν υπάρχει. Και όποιος μπορεί να ΓΡΑΨΕΙ κουπόνι
--  μπορεί να βάλει το ΔΙΚΟ ΤΟΥ στη γραμμή ενός άλλου και να παραλαμβάνει την
--  αλληλογραφία του. Γι' αυτό ο πίνακας δεν έχει καμία πολιτική εγγραφής.
-- ═══════════════════════════════════════════════════════════════════════════

reset role;
set session "probe.uid" = '';

do $probe$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  ta text; tb text;
begin
  -- ΤΟ ΚΟΥΠΟΝΙ ΓΕΝΝΗΘΗΚΕ ΜΑΖΙ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ. Κανείς δεν το ζήτησε: οι δύο
  -- χρήστες φτιάχτηκαν στην αρχή αυτού του σεναρίου, πριν υπάρξει η έννοια.
  select token into ta from public.inbound_mailboxes where user_id = a;
  select token into tb from public.inbound_mailboxes where user_id = b;
  if ta is null or tb is null then
    raise exception 'Ο λογαριασμός γεννήθηκε ΧΩΡΙΣ ιδιωτική διεύθυνση: κάθε μήνυμα προς αυτόν θα χανόταν σιωπηλά';
  end if;
  if ta !~ '^[0-9a-f]{16}$' then
    raise exception 'Το κουπόνι δεν έχει τη μορφή που περιμένει η εφαρμογή: %', ta;
  end if;
  if ta = tb then
    raise exception 'ΔΥΟ ΛΟΓΑΡΙΑΣΜΟΙ ΜΕ ΤΟ ΙΔΙΟ ΚΟΥΠΟΝΙ: τα μηνύματα του ενός θα πήγαιναν στον άλλον';
  end if;

  -- Δύο εισερχόμενα, ένα σε καθέναν, γραμμένα με τα δικαιώματα του διακομιστή.
  insert into public.inbound_messages (user_id, provider_id, subject, vendor, amount, due_date, category)
  values (a, 'prov_a_1', 'Λογαριασμός ρεύματος', 'ΔΕΗ', 87.45, date '2026-09-05', 'Ρεύμα'),
         (b, 'prov_b_1', 'Λογαριασμός νερού', 'ΕΥΔΑΠ', 34.20, date '2026-08-20', 'Νερό');
  raise notice 'probe: κάθε λογαριασμός γεννιέται με δική του ιδιωτική διεύθυνση';
end $probe$;

set role authenticated;
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare n int; t text;
begin
  select count(*) into n from public.inbound_mailboxes;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % κουπόνια αντί για το δικό του', n; end if;

  select count(*) into n from public.inbound_messages;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % εισερχόμενα αντί για 1', n; end if;
  select count(*) into n from public.inbound_messages where vendor = 'ΕΥΔΑΠ';
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει τον λογαριασμό του Β'; end if;

  -- ΤΟ ΚΟΥΠΟΝΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΟΥΤΕ ΣΤΟΝ ΕΑΥΤΟ ΣΟΥ. Δεν υπάρχει πολιτική
  -- εγγραφής· ό,τι κι αν στείλει η οθόνη, το Postgres το κόβει.
  begin
    update public.inbound_mailboxes set token = 'ffffffffffffffff'
     where user_id = '11111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο χρήστης άλλαξε μόνος του το κουπόνι του, χωρίς περιστροφή'; end if;
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  begin
    insert into public.inbound_mailboxes (user_id, token)
      values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaaaaaaaaaa');
    raise exception 'ΔΙΑΡΡΟΗ: ο Α έγραψε κουπόνι στο όνομα του Β και θα παρελάμβανε τα μηνύματά του';
  exception
    when insufficient_privilege or unique_violation then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  -- ΚΑΝΕΙΣ ΔΕΝ ΦΥΤΕΥΕΙ ΕΙΣΕΡΧΟΜΕΝΟ. Γράφει μόνο ο διακομιστής, αφού ελέγξει
  -- την υπογραφή του παρόχου· αλλιώς «ήρθε λογαριασμός» θα σήμαινε «το είπα».
  begin
    insert into public.inbound_messages (user_id, provider_id, subject, amount)
      values ('11111111-1111-1111-1111-111111111111', 'plasto_1', 'Δήθεν', 999);
    raise exception 'ΔΙΑΡΡΟΗ: ο χρήστης φύτεψε δικό του «εισερχόμενο»';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  -- Ο ΙΔΙΟΣ ΟΜΩΣ ΑΠΟΦΑΣΙΖΕΙ: η κατάσταση αλλάζει, γιατί αυτή είναι η δουλειά του.
  update public.inbound_messages set status = 'dismissed' where provider_id = 'prov_a_1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Ο ιδιοκτήτης δεν μπόρεσε να απορρίψει το δικό του εισερχόμενο'; end if;

  -- ΤΟ ΤΙ ΕΓΡΑΦΕ ΤΟ ΜΗΝΥΜΑ ΕΙΝΑΙ ΙΣΤΟΡΙΚΟ ΚΑΙ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ.
  begin
    update public.inbound_messages set amount = 1 where provider_id = 'prov_a_1';
    raise exception 'ΔΙΑΡΡΟΗ: το ποσό που έγραφε το μήνυμα ξαναγράφτηκε από την οθόνη';
  exception
    when check_violation then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  update public.inbound_messages set status = 'filed' where provider_id = 'prov_b_1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α άλλαξε % εισερχόμενα του Β', n; end if;

  -- Η ΠΕΡΙΣΤΡΟΦΗ ΕΙΝΑΙ ΔΙΚΑΙΩΜΑ ΤΟΥ ΙΔΙΟΚΤΗΤΗ, και αγγίζει ΜΟΝΟ τον ίδιο.
  select public.rotate_inbound_mailbox() into t;
  if t !~ '^[0-9a-f]{16}$' then raise exception 'Η περιστροφή δεν έδωσε κουπόνι: %', t; end if;
  select count(*) into n from public.inbound_mailboxes where token = t;
  if n <> 1 then raise exception 'Το νέο κουπόνι δεν γράφτηκε'; end if;
  raise notice 'probe: το κουπόνι διαβάζεται μόνο από τον κάτοχο, δεν γράφεται από κανέναν, και αλλάζει με μία κλήση';
end $probe$;

reset role;
set session "probe.uid" = '';

do $probe$
declare tb text; n int;
begin
  select token into tb from public.inbound_mailboxes where user_id = '22222222-2222-2222-2222-222222222222';
  if tb is null then raise exception 'Η περιστροφή του Α έσβησε το κουπόνι του Β'; end if;
  select count(*) into n from public.inbound_messages where user_id = '22222222-2222-2222-2222-222222222222' and status = 'pending';
  if n <> 1 then raise exception 'Το εισερχόμενο του Β άλλαξε κατάσταση από ξένο χέρι'; end if;
  raise notice 'probe: η περιστροφή του ενός δεν αγγίζει τον άλλον';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Η ΣΥΝΔΡΟΜΗ ΗΜΕΡΟΛΟΓΙΟΥ: ΔΙΚΟ ΚΟΥΠΟΝΙ, ΔΙΚΗ ΚΛΕΙΔΑΡΙΑ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΘΑ ΣΗΜΑΙΝΕ ΔΙΑΡΡΟΗ ΕΔΩ. Οποιος διαβάσει το κουπόνι κάποιου βλέπει κάθε
--  προθεσμία, κάθε ποσό και κάθε ημερομηνία πληρωμής του. Και όποιος μπορεί να
--  ΓΡΑΨΕΙ κουπόνι, βάζει το δικό του στη γραμμή ενός άλλου και διαβάζει το
--  ημερολόγιό του για πάντα.
-- ═══════════════════════════════════════════════════════════════════════════

reset role;
set session "probe.uid" = '';

do $probe$
declare
  a uuid := '11111111-1111-1111-1111-111111111111';
  b uuid := '22222222-2222-2222-2222-222222222222';
  ca text; cb text; ia text;
begin
  select token into ca from public.calendar_feed_tokens where user_id = a;
  select token into cb from public.calendar_feed_tokens where user_id = b;
  if ca is null or cb is null then
    raise exception 'Ο λογαριασμός γεννήθηκε ΧΩΡΙΣ συνδρομή ημερολογίου';
  end if;
  if ca !~ '^[0-9a-f]{16,64}$' then
    raise exception 'Το κουπόνι ημερολογίου δεν έχει τη μορφή που περιμένει η διαδρομή: %', ca;
  end if;
  if ca = cb then
    raise exception 'ΔΥΟ ΛΟΓΑΡΙΑΣΜΟΙ ΜΕ ΤΟ ΙΔΙΟ ΚΟΥΠΟΝΙ ΗΜΕΡΟΛΟΓΙΟΥ';
  end if;

  -- ΤΟ ΚΟΥΠΟΝΙ ΤΟΥ ΗΜΕΡΟΛΟΓΙΟΥ ΔΕΝ ΕΙΝΑΙ ΤΟ ΚΟΥΠΟΝΙ ΤΟΥ EMAIL. Αν ήταν, η
  -- διεύθυνση που κάθεται στις ρυθμίσεις κάθε τηλεφώνου θα άνοιγε και την πόρτα
  -- που δέχεται λογαριασμούς.
  select token into ia from public.inbound_mailboxes where user_id = a;
  if ia = ca then
    raise exception 'ΤΟ ΙΔΙΟ ΚΟΥΠΟΝΙ ΓΙΑ ΗΜΕΡΟΛΟΓΙΟ ΚΑΙ ΓΙΑ ΕΙΣΕΡΧΟΜΕΝΑ: δύο ρίσκα σε ένα μυστικό';
  end if;
  raise notice 'probe: κάθε λογαριασμός έχει δική του συνδρομή ημερολογίου, ξένη προς το ταχυδρομείο του';
end $probe$;

-- ΤΟ ΚΟΥΠΟΝΙ ΤΟΥ Α ΓΕΡΝΑΕΙ ΤΕΧΝΗΤΑ, ΜΕ ΤΑ ΔΙΚΑΙΩΜΑΤΑ ΤΟΥ ΔΙΑΚΟΜΙΣΤΗ. Ο ίδιος
-- ο χρήστης ΔΕΝ έχει πολιτική update — γι' αυτό υπάρχει η συνάρτηση
-- περιστροφής — οπότε μια τέτοια γραμμή μέσα στο μπλοκ του χρήστη θα άγγιζε
-- μηδέν γραμμές και ο έλεγχος από κάτω θα ήταν κενός.
update public.calendar_feed_tokens set expires_at = now() - interval '1 day'
 where user_id = '11111111-1111-1111-1111-111111111111';

set role authenticated;
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare n int; t text;
begin
  select count(*) into n from public.calendar_feed_tokens;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % συνδρομές αντί για τη δική του', n; end if;

  begin
    update public.calendar_feed_tokens set token = 'ffffffffffffffff'
     where user_id = '11111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο χρήστης άλλαξε μόνος του το κουπόνι ημερολογίου χωρίς περιστροφή'; end if;
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  -- Ο πίνακας ΕΧΕΙ πολιτική insert (από το baseline), αλλά με `with check` στον
  -- ίδιο τον χρήστη: γραμμή στο όνομα άλλου δεν περνά.
  begin
    insert into public.calendar_feed_tokens (user_id, token)
      values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbbbbbbbbbb');
    raise exception 'ΔΙΑΡΡΟΗ: ο Α έγραψε κουπόνι ημερολογίου στο όνομα του Β';
  exception
    when insufficient_privilege or unique_violation then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  select public.rotate_calendar_feed() into t;
  if t !~ '^[0-9a-f]{16,64}$' then raise exception 'Η περιστροφή ημερολογίου δεν έδωσε κουπόνι: %', t; end if;
  select count(*) into n from public.calendar_feed_tokens where token = t;
  if n <> 1 then raise exception 'Το νέο κουπόνι ημερολογίου δεν γράφτηκε'; end if;
  select count(*) into n from public.calendar_feed_tokens
   where token = t and expires_at > now() + interval '700 days';
  if n <> 1 then raise exception 'Η ΝΕΑ ΔΙΕΥΘΥΝΣΗ ΚΛΗΡΟΝΟΜΗΣΕ ΤΗ ΛΗΞΗ ΤΗΣ ΠΑΛΙΑΣ'; end if;
  raise notice 'probe: η συνδρομή διαβάζεται μόνο από τον κάτοχο και αλλάζει με μία κλήση';
end $probe$;

reset role;
set session "probe.uid" = '';

-- ═══════════════════════════════════════════════════════════════════════════
--  ΟΙ ΣΥΝΔΡΟΜΕΣ ΕΙΔΟΠΟΙΗΣΕΩΝ: ΔΙΚΗ ΣΟΥ ΣΥΣΚΕΥΗ, ΔΙΚΕΣ ΣΟΥ ΕΙΔΟΠΟΙΗΣΕΙΣ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΘΑ ΣΗΜΑΙΝΕ ΔΙΑΡΡΟΗ ΕΔΩ. Οποιος διαβάσει τη γραμμή ενός άλλου παίρνει τη
--  διεύθυνση push της συσκευής του ΚΑΙ τα κλειδιά κρυπτογράφησης — δηλαδή
--  μπορεί να στείλει ό,τι θέλει στο κλειδωμένο κινητό του, με το όνομά μας.
-- ═══════════════════════════════════════════════════════════════════════════

reset role;
set session "probe.uid" = '';

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('11111111-1111-1111-1111-111111111111', 'https://push.example/A', 'kA', 'aA'),
       ('22222222-2222-2222-2222-222222222222', 'https://push.example/B', 'kB', 'aB');
update public.push_subscriptions set failures = 3, last_sent_at = now()
 where endpoint = 'https://push.example/A';

set role authenticated;
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare n int; f int;
begin
  select count(*) into n from public.push_subscriptions;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % συνδρομές συσκευών αντί για τη δική του', n; end if;

  select count(*) into n from public.push_subscriptions where endpoint = 'https://push.example/B';
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει τα κλειδιά της συσκευής του Β'; end if;

  -- Η ΔΙΚΗ ΤΟΥ ΣΥΣΚΕΥΗ ΞΑΝΑΓΡΑΦΕΤΑΙ: ο περιηγητής ανανεώνει κλειδιά.
  update public.push_subscriptions set p256dh = 'kA2' where endpoint = 'https://push.example/A';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Ο χρήστης δεν μπόρεσε να ανανεώσει τα κλειδιά της συσκευής του'; end if;

  -- ΤΟ ΙΣΤΟΡΙΚΟ ΑΠΟΣΤΟΛΗΣ ΟΜΩΣ ΔΕΝ ΕΙΝΑΙ ΔΙΚΟ ΤΟΥ. Κρίνει πότε σβήνεται μια
  -- νεκρή συνδρομή· αν το έγραφε ο πελάτης, δεν θα έσβηνε ποτέ.
  update public.push_subscriptions set failures = 0, last_sent_at = null
   where endpoint = 'https://push.example/A';
  select failures into f from public.push_subscriptions where endpoint = 'https://push.example/A';
  if f <> 3 then raise exception 'ΔΙΑΡΡΟΗ: ο χρήστης μηδένισε μόνος του τις αποτυχίες (%)', f; end if;

  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values ('22222222-2222-2222-2222-222222222222', 'https://push.example/C', 'kC', 'aC');
    raise exception 'ΔΙΑΡΡΟΗ: ο Α έγραψε συνδρομή στο όνομα του Β';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  delete from public.push_subscriptions where endpoint = 'https://push.example/B';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α έσβησε τη συσκευή του Β'; end if;

  raise notice 'probe: κάθε συσκευή ανήκει σε έναν, και το ιστορικό αποστολής το γράφει ο διακομιστής';
end $probe$;

reset role;
set session "probe.uid" = '';

-- ═══════════════════════════════════════════════════════════════════════════
--  ΟΙ ΚΑΝΟΝΕΣ ΚΑΤΗΓΟΡΙΩΝ: Η ΛΟΓΙΣΤΙΚΗ ΕΠΙΛΟΓΗ ΤΟΥ ΕΝΟΣ ΔΕΝ ΠΑΕΙ ΣΤΟΝ ΑΛΛΟΝ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΘΑ ΣΗΜΑΙΝΕ ΔΙΑΡΡΟΗ ΕΔΩ. Η κατηγορία κρίνει την ΕΚΠΕΣΙΜΟΤΗΤΑ, δηλαδή
--  φόρο. Ενας κανόνας που περνά από τα βιβλία του ενός στα βιβλία του άλλου
--  αλλάζει τη φορολογική του δήλωση χωρίς να το ξέρει, και ο κατάλογος των
--  παρόχων του είναι από μόνος του εικόνα της περιουσίας του.
-- ═══════════════════════════════════════════════════════════════════════════

reset role;
set session "probe.uid" = '';

insert into public.category_hints (user_id, vendor_key, category)
values ('11111111-1111-1111-1111-111111111111', 'zacharopoulos', 'Υδραυλικός'),
       ('22222222-2222-2222-2222-222222222222', 'papadopoulos', 'Ηλεκτρολόγος');

set role authenticated;
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare n int; c text;
begin
  select count(*) into n from public.category_hints;
  if n <> 1 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει % κανόνες αντί για τον δικό του', n; end if;

  select count(*) into n from public.category_hints where vendor_key = 'papadopoulos';
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α βλέπει τους παρόχους του Β'; end if;

  -- Ο ΔΙΚΟΣ ΤΟΥ ΚΑΝΟΝΑΣ ΑΛΛΑΖΕΙ: δεύτερη διόρθωση για τον ίδιο πάροχο.
  update public.category_hints set category = 'Επισκευή' where vendor_key = 'zacharopoulos';
  select category into c from public.category_hints where vendor_key = 'zacharopoulos';
  if c <> 'Επισκευή' then raise exception 'Ο χρήστης δεν μπόρεσε να διορθώσει τον κανόνα του (%)', c; end if;

  -- ΚΑΙ ΣΒΗΝΕΤΑΙ: όταν ξαναδιαλέξει ό,τι λέει η ταξινομία, ο κανόνας φεύγει.
  delete from public.category_hints where vendor_key = 'zacharopoulos';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Ο χρήστης δεν μπόρεσε να ακυρώσει τον κανόνα του'; end if;

  begin
    insert into public.category_hints (user_id, vendor_key, category)
      values ('22222222-2222-2222-2222-222222222222', 'nea', 'Κήπος');
    raise exception 'ΔΙΑΡΡΟΗ: ο Α έγραψε κανόνα στα βιβλία του Β';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ΔΙΑΡΡΟΗ%' then raise; end if;
  end;

  delete from public.category_hints where vendor_key = 'papadopoulos';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ΔΙΑΡΡΟΗ: ο Α έσβησε τον κανόνα του Β';
  end if;

  raise notice 'probe: οι κανόνες κατηγοριών μένουν στα βιβλία εκείνου που τους έγραψε';
end $probe$;

reset role;
set session "probe.uid" = '';

-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΛΟΓΑΡΙΑΣΜΟΣ ΧΩΡΙΣ ΣΥΝΔΡΟΜΗ: ΤΑ ΤΡΙΑ ΦΡΕΝΑ, ΔΟΚΙΜΑΣΜΕΝΑ ΕΝΑ ΕΝΑ
-- ─────────────────────────────────────────────────────────────────────────
-- Αυτός ο μηχανισμός ΣΒΗΝΕΙ ΔΕΔΟΜΕΝΑ. Δεν αρκεί «τρέχει η μετανάστευση»: το
-- ερώτημα είναι αν αρνείται να σβήσει σε καθεμία από τις καταστάσεις όπου η
-- διαγραφή θα ήταν λάθος. Επτά καταστάσεις, μία μία, με πραγματικό ρολόι.
-- ═══════════════════════════════════════════════════════════════════════════
reset role;
set session "probe.uid" = '';

do $probe$
declare
  v_uid  uuid := 'eeeeeeee-0000-0000-0000-000000000002';
  v_mail text := 'lapse-probe@example.gr';
  v_when timestamptz;
  res    json;
  n      int;
begin
  insert into auth.users (id, email) values (v_uid, v_mail);
  insert into public.billing_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.billing_profiles set plan = 'free', comp_until = null, trial_used_at = now()
   where user_id = v_uid;
  insert into public.user_properties (user_id, name) values (v_uid, 'Το σπίτι που λήγει');

  -- ΠΡΟΫΠΟΘΕΣΗ: ο λογαριασμός ΟΝΤΩΣ μετριέται μηδέν. Χωρίς αυτό, όσα
  -- ακολουθούν θα περνούσαν επειδή δεν υπάρχει τίποτα να σβηστεί.
  if public.user_plan_rank(v_uid) <> 0 then
    raise exception 'Ο έλεγχος είναι κενός: ο λογαριασμός μετρήθηκε επίπεδο %', public.user_plan_rank(v_uid);
  end if;

  -- ── ΦΡΕΝΟ 1: χωρίς ενεργή χρέωση, το ρολόι δεν ξεκινά καν ──────────────
  perform public.sweep_lapsed_accounts(false);
  select lapsed_at into v_when from public.billing_profiles where user_id = v_uid;
  if v_when is not null then
    raise exception 'ΦΡΕΝΟ 1 ΣΠΑΣΕ: ξεκίνησε ρολόι διαγραφής ενώ η χρέωση δεν είναι ενεργή';
  end if;

  -- ── Με ενεργή χρέωση, το ρολόι ξεκινά ΤΩΡΑ (ΦΡΕΝΟ 3) ──────────────────
  perform public.sweep_lapsed_accounts(true);
  select lapsed_at into v_when from public.billing_profiles where user_id = v_uid;
  if v_when is null then
    raise exception 'Ο σαρωτής δεν ξεκίνησε ρολόι σε λογαριασμό χωρίς συνδρομή';
  end if;
  if v_when < now() - interval '1 minute' then
    raise exception 'ΦΡΕΝΟ 3 ΣΠΑΣΕ: το ρολόι ξεκίνησε αναδρομικά, στις %', v_when;
  end if;

  -- ── Πριν την προθεσμία δεν σβήνει τίποτα ───────────────────────────────
  res := public.purge_lapsed_account(v_uid, true);
  if res->>'skipped' <> 'not_due' then
    raise exception 'Σβήστηκε λογαριασμός πριν τη λήξη της προθεσμίας: %', res;
  end if;

  -- Από εδώ και κάτω η προθεσμία έχει περάσει: το ρολόι πάει πίσω όσο η χάρη.
  update public.billing_profiles
     set lapsed_at = now() - ((public.account_grace_days() + 1) || ' days')::interval
   where user_id = v_uid;

  -- ── ΦΡΕΝΟ 1, ΚΑΙ ΣΤΗΝ ΙΔΙΑ ΤΗ ΔΙΑΓΡΑΦΗ ────────────────────────────────
  res := public.purge_lapsed_account(v_uid, false);
  if res->>'skipped' <> 'billing_not_live' then
    raise exception 'ΦΡΕΝΟ 1 ΣΠΑΣΕ: η διαγραφή προχώρησε με τη χρέωση ανενεργή: %', res;
  end if;

  -- ── ΦΡΕΝΟ 2: πλήρωσε ανάμεσα στη σάρωση και στην πράξη ─────────────────
  update public.billing_profiles set plan = 'solo' where user_id = v_uid;
  res := public.purge_lapsed_account(v_uid, true);
  if res->>'skipped' <> 'has_plan' then
    raise exception 'ΦΡΕΝΟ 2 ΣΠΑΣΕ: σβήστηκε λογαριασμός που είχε αποκτήσει πακέτο: %', res;
  end if;
  -- …και ο σαρωτής μηδενίζει το ρολόι του, αντί να το αφήνει να τρέχει.
  perform public.sweep_lapsed_accounts(true);
  select lapsed_at into v_when from public.billing_profiles where user_id = v_uid;
  if v_when is not null then
    raise exception 'Ο σαρωτής άφησε ρολόι διαγραφής σε συνδρομητή';
  end if;

  -- ── Ο ΔΙΑΧΕΙΡΙΣΤΗΣ ΔΕΝ ΧΡΟΝΟΜΕΤΡΕΙΤΑΙ ΠΟΤΕ ───────────────────────────
  update public.billing_profiles set plan = 'free' where user_id = v_uid;
  insert into public.app_admins (email) values (v_mail);
  perform public.sweep_lapsed_accounts(true);
  select lapsed_at into v_when from public.billing_profiles where user_id = v_uid;
  if v_when is not null then
    raise exception 'Ξεκίνησε ρολόι διαγραφής σε λογαριασμό διαχειριστή';
  end if;

  -- ── ΚΑΙ ΟΤΑΝ ΙΣΧΥΟΥΝ ΟΛΑ, ΣΒΗΝΕΙ ΠΡΑΓΜΑΤΙΚΑ ──────────────────────────
  -- Αλλιώς τα έξι παραπάνω θα αποδείκνυαν απλώς έναν μηχανισμό που δεν κάνει
  -- τίποτα ποτέ, και θα περνούσαν όλα πράσινα.
  delete from public.app_admins where lower(btrim(email)) = v_mail;
  perform public.sweep_lapsed_accounts(true);
  update public.billing_profiles
     set lapsed_at = now() - ((public.account_grace_days() + 1) || ' days')::interval
   where user_id = v_uid;
  res := public.purge_lapsed_account(v_uid, true);
  if res->>'skipped' is not null then
    raise exception 'Ο λογαριασμός δεν σβήστηκε ενώ ίσχυαν όλα: %', res;
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'Ο λογαριασμός χωρίς συνδρομή επέζησε της προθεσμίας του';
  end if;
  select count(*) into n from public.user_properties where user_id = v_uid;
  if n <> 0 then
    raise exception 'Τα ακίνητα επέζησαν της αυτόματης διαγραφής';
  end if;

  raise notice 'probe: ο λογαριασμός χωρίς συνδρομή σβήνει στην ώρα του, και μόνο τότε';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΙ ΤΟ ΗΜΕΡΗΣΙΟ ΠΕΡΑΣΜΑ, ΜΕ ΤΙΣ ΠΡΟΕΠΙΛΟΓΕΣ ΤΟΥ
-- ─────────────────────────────────────────────────────────────────────────
-- Ο προηγούμενος έλεγχος περνούσε το φρένο ΡΗΤΑ ως όρισμα. Το χρονόμετρο
-- όμως δεν περνά τίποτα: καλεί `sweep_and_purge_lapsed()` σκέτο και το φρένο
-- βγαίνει μόνο του από τη `billing_is_live()`. Αν αυτή η προεπιλογή είναι
-- λάθος, όλα τα παραπάνω περνούν πράσινα και το χρονόμετρο σβήνει τους
-- πάντες την πρώτη νύχτα. Εδώ δοκιμάζεται ΑΚΡΙΒΩΣ η διαδρομή του cron.
-- ═══════════════════════════════════════════════════════════════════════════
do $probe$
declare
  v_uid   uuid := 'eeeeeeee-0000-0000-0000-000000000003';
  v_payer uuid := 'eeeeeeee-0000-0000-0000-000000000004';
  out     json;
begin
  insert into auth.users (id, email) values (v_uid, 'krono-probe@example.gr');
  insert into public.billing_profiles (user_id) values (v_uid) on conflict (user_id) do nothing;
  update public.billing_profiles
     set plan = 'free', comp_until = null, trial_used_at = now(),
         lapsed_at = now() - ((public.account_grace_days() + 1) || ' days')::interval
   where user_id = v_uid;

  -- ΚΑΝΕΝΑΣ ΔΕΝ ΠΛΗΡΩΣΕ ΠΟΤΕ. Προηγούμενοι έλεγχοι αυτού του αρχείου
  -- (ο χειριστής του εμπόρου) αφήνουν πίσω τους συνδρομές, οπότε η κατάσταση
  -- «πριν ανοίξει το ταμείο» στήνεται ρητά. Η βάση είναι μιας χρήσης.
  update public.billing_profiles set mor_subscription_id = null
   where mor_subscription_id is not null;
  if public.billing_is_live() then
    raise exception 'Ο έλεγχος είναι κενός: η βάση θεωρεί ήδη ενεργή τη χρέωση';
  end if;
  out := public.sweep_and_purge_lapsed();
  if (out->>'live')::boolean then
    raise exception 'Το ημερήσιο πέρασμα θεώρησε ενεργή τη χρέωση χωρίς καμία συνδρομή: %', out;
  end if;
  if (out->>'erased')::int <> 0 or not exists (select 1 from auth.users where id = v_uid) then
    raise exception 'ΦΡΕΝΟ 1 ΣΠΑΣΕ ΣΤΟ ΧΡΟΝΟΜΕΤΡΟ: σβήστηκε λογαριασμός πριν ανοίξει το ταμείο: %', out;
  end if;

  -- Ανοίγει το ταμείο: ένας συνδρομητής, αληθινός, με αναγνωριστικό εμπόρου.
  insert into auth.users (id, email) values (v_payer, 'syndromitis-probe@example.gr');
  insert into public.billing_profiles (user_id) values (v_payer) on conflict (user_id) do nothing;
  update public.billing_profiles set mor_subscription_id = 'sub_probe_1' where user_id = v_payer;
  if not public.billing_is_live() then
    raise exception 'Η βάση δεν αναγνώρισε ενεργή χρέωση ενώ υπάρχει συνδρομή εμπόρου';
  end if;

  -- Το ρολόι είχε μηδενιστεί από το προηγούμενο πέρασμα· ξαναγυρίζει πίσω.
  update public.billing_profiles
     set lapsed_at = now() - ((public.account_grace_days() + 1) || ' days')::interval
   where user_id = v_uid;
  out := public.sweep_and_purge_lapsed();
  if (out->>'erased')::int <> 1 then
    raise exception 'Το ημερήσιο πέρασμα δεν έσβησε τον ληγμένο λογαριασμό: %', out;
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'Ο ληγμένος λογαριασμός επέζησε του ημερήσιου περάσματος';
  end if;
  -- Και ο συνδρομητής δεν ακουμπήθηκε.
  if not exists (select 1 from auth.users where id = v_payer) then
    raise exception 'ΤΟ ΠΕΡΑΣΜΑ ΕΣΒΗΣΕ ΣΥΝΔΡΟΜΗΤΗ';
  end if;

  raise notice 'probe: το ημερήσιο πέρασμα δεν αγγίζει τίποτα πριν ανοίξει το ταμείο';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
--  ΠΟΙΟΣ ΕΣΒΗΣΕ ΤΟ ΑΚΙΝΗΤΟ, ΚΑΙ ΣΕ ΠΟΙΟΥ ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΓΡΑΦΕΤΑΙ
-- ─────────────────────────────────────────────────────────────────────────
--  Ενα μέλος με `can_edit` σβήνει ακίνητο του ιδιοκτήτη και καταρρέουν τριάντα
--  ένα πίνακες. Η `log_activity` έγραφε `user_id = auth.uid()`, δηλαδή τον
--  ΔΡΑΣΤΗ, και η `my_activity` επιστρέφει «user_id = auth.uid() or actor_id =
--  auth.uid()». Αρα η γραμμή ελέγχου έμπαινε στο ημερολόγιο ΤΟΥ ΜΕΛΟΥΣ και ο
--  ιδιοκτήτης δεν τη έβλεπε ποτέ.
--
--  Ο έλεγχος απαιτεί τρία: η γραμμή να φτάνει στον ΙΔΙΟΚΤΗΤΗ, να ονομάζει τον
--  δράστη, και να ΕΠΙΖΕΙ της διαγραφής του ακινήτου.
-- ═══════════════════════════════════════════════════════════════════════════
set role postgres;
set session "probe.uid" = '';

do $probe$
declare
  a     uuid := '11111111-1111-1111-1111-111111111111';
  pa    uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  m_yes uuid := '66666666-6666-6666-6666-666666666666';
  org   uuid := '77777777-7777-7777-7777-777777777777';
begin
  -- Το μέλος αποκτά και δικαίωμα επεξεργασίας, που είναι αυτό που δίνει DELETE.
  update public.organization_members set can_edit = true
   where org_id = org and user_id = m_yes;
  if not exists (select 1 from public.user_properties where id = pa and user_id = a) then
    raise exception 'Ο έλεγχος είναι κενός: λείπει το ακίνητο του οργανισμού';
  end if;
  raise notice 'probe: το μέλος πήρε can_edit στο ακίνητο του ιδιοκτήτη';
end $probe$;

-- Το ΜΕΛΟΣ σβήνει το ακίνητο του ιδιοκτήτη, αφού πρώτα γράψει τη γραμμή ελέγχου.
set role authenticated;
set session "probe.uid" = '66666666-6666-6666-6666-666666666666';

do $probe$
declare
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  n int;
begin
  perform public.log_activity('property_deleted', 'property', pa::text,
                              jsonb_build_object('name', 'Του Α'));
  delete from public.user_properties where id = pa;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Το μέλος με can_edit ΔΕΝ έσβησε το ακίνητο: % γραμμές', n;
  end if;
  raise notice 'probe: το μέλος έσβησε το ακίνητο, και έγραψε γραμμή ελέγχου';
end $probe$;

-- Ο ΙΔΙΟΚΤΗΤΗΣ ανοίγει το ημερολόγιό του.
set session "probe.uid" = '11111111-1111-1111-1111-111111111111';

do $probe$
declare
  pa uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  r  record;
  n  int;
begin
  select count(*) into n from public.my_activity(100)
   where action = 'property_deleted' and entity_id = pa::text;
  if n <> 1 then
    raise exception 'Ο ΙΔΙΟΚΤΗΤΗΣ ΔΕΝ ΒΛΕΠΕΙ τη διαγραφή του ακινήτου του: % γραμμές', n;
  end if;

  select * into r from public.my_activity(100)
   where action = 'property_deleted' and entity_id = pa::text;
  if r.actor_email is distinct from 'me-oikonomika@probe.test' then
    raise exception 'Η γραμμή δεν ονομάζει τον δράστη: %', r.actor_email;
  end if;
  if r.user_id <> '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'Η γραμμή γράφτηκε σε λάθος ημερολόγιο: %', r.user_id;
  end if;
  if r.metadata->>'name' is distinct from 'Του Α' then
    raise exception 'Χάθηκε το όνομα του ακινήτου που σβήστηκε: %', r.metadata;
  end if;
  -- ΚΑΙ ΤΟ ΑΚΙΝΗΤΟ ΟΝΤΩΣ ΕΦΥΓΕ: η γραμμή ελέγχου επέζησε του γεγονότος.
  if exists (select 1 from public.user_properties where id = pa) then
    raise exception 'Ο έλεγχος είναι κενός: το ακίνητο δεν σβήστηκε';
  end if;

  raise notice 'probe: ο ιδιοκτήτης βλέπει ΠΟΙΟΣ έσβησε το ακίνητό του, και το ίχνος επέζησε';
end $probe$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Η ΔΙΑΓΡΑΦΗ ΜΙΣΘΩΤΗ ΔΕΝ ΑΦΗΝΕΙ ΑΠΟΔΕΙΞΕΙΣ ΠΟΥ ΔΕΙΧΝΟΥΝ ΣΤΟ ΠΟΥΘΕΝΑ
-- ─────────────────────────────────────────────────────────────────────────
--  Πριν το 20260824100000, δεκαπέντε στήλες `uuid` έδειχναν σε δικό μας πίνακα
--  ΧΩΡΙΣ ξένο κλειδί. Σβήνοντας μισθωτή, η απόδειξη είσπραξης κρατούσε
--  `tenant_id` που δεν αντιστοιχούσε σε τίποτα: η οθόνη έδειχνε είσπραξη χωρίς
--  όνομα και το ημερολόγιο επικοινωνίας κρατούσε συνομιλίες με άνθρωπο που δεν
--  υπάρχει.
--
--  Ο έλεγχος απαιτεί ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΕΣ συμπεριφορές, γιατί δεν είναι όλες
--  CASCADE: η είσπραξη ΕΠΙΖΕΙ με κενό μισθωτή (το ποσό μπήκε στο ταμείο), το
--  ημερολόγιο επικοινωνίας ΦΕΥΓΕΙ (δεν έχει νόημα χωρίς τον μισθωτή του).
-- ═══════════════════════════════════════════════════════════════════════════
set role postgres;
set session "probe.uid" = '';

do $probe$
declare
  b   uuid := '22222222-2222-2222-2222-222222222222';
  pb  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  t   uuid := 'cccccccc-0000-0000-0000-000000000009';
  n   int;
  v   numeric;
begin
  insert into public.tenants (id, property_id, user_id, full_name, monthly_rent)
       values (t, pb, b, 'Μισθωτής προς διαγραφή', 500.00);
  insert into public.rent_payments (user_id, property_id, tenant_id, amount, payment_date, status)
       values (b, pb, t, 500.00, current_date, 'paid');
  insert into public.tenant_comm_log (user_id, property_id, tenant_id, type, summary, date)
       values (b, pb, t, 'email', 'Υπενθύμιση ενοικίου', current_date);

  delete from public.tenants where id = t;

  -- Η ΕΙΣΠΡΑΞΗ ΕΠΙΖΕΙ, ΜΕ ΚΕΝΟ ΜΙΣΘΩΤΗ. Το ποσό μπήκε στο ταμείο και στα
  -- βιβλία· δεν σβήνεται επειδή έφυγε ο άνθρωπος.
  select count(*) into n from public.rent_payments where property_id = pb;
  if n <> 1 then
    raise exception 'Η είσπραξη χάθηκε μαζί με τον μισθωτή: % γραμμές', n;
  end if;
  select amount into v from public.rent_payments where property_id = pb;
  if v is distinct from 500.00 then
    raise exception 'Το ποσό της είσπραξης άλλαξε: %', v;
  end if;
  select count(*) into n from public.rent_payments where property_id = pb and tenant_id is not null;
  if n <> 0 then
    raise exception 'ΟΡΦΑΝΗ ΑΝΑΦΟΡΑ: η είσπραξη δείχνει ακόμη σε σβησμένο μισθωτή';
  end if;

  -- ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΕΠΙΚΟΙΝΩΝΙΑΣ ΦΕΥΓΕΙ: είναι επικοινωνία ΜΕ ΑΥΤΟΝ.
  select count(*) into n from public.tenant_comm_log where property_id = pb;
  if n <> 0 then
    raise exception 'Το ημερολόγιο επικοινωνίας επέζησε του μισθωτή: % γραμμές', n;
  end if;

  raise notice 'probe: η είσπραξη επιζεί χωρίς μισθωτή, η επικοινωνία φεύγει μαζί του';
end $probe$;

-- ── ΚΑΙ Η ΔΑΠΑΝΗ ΕΠΙΖΕΙ ΤΗΣ ΔΙΑΓΡΑΦΗΣ ΤΟΥ ΠΡΟΜΗΘΕΥΤΗ ─────────────────────
do $probe$
declare
  b  uuid := '22222222-2222-2222-2222-222222222222';
  pb uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  k  uuid := 'dddddddd-0000-0000-0000-000000000009';
  n  int;
begin
  insert into public.contacts (id, user_id, property_id, role, full_name)
       values (k, b, pb, 'plumber', 'Υδραυλικός');
  insert into public.expenses (user_id, property_id, contact_id, amount, description, category, date)
       values (b, pb, k, 120.00, 'Επισκευή', 'other', current_date);

  delete from public.contacts where id = k;

  select count(*) into n from public.expenses where property_id = pb and amount = 120.00;
  if n <> 1 then
    raise exception 'Η δαπάνη χάθηκε μαζί με τον προμηθευτή: % γραμμές', n;
  end if;
  select count(*) into n from public.expenses where property_id = pb and contact_id is not null;
  if n <> 0 then
    raise exception 'ΟΡΦΑΝΗ ΑΝΑΦΟΡΑ: η δαπάνη δείχνει ακόμη σε σβησμένη επαφή';
  end if;

  raise notice 'probe: η δαπάνη επιζεί του προμηθευτή της, χωρίς ορφανή αναφορά';
end $probe$;

-- ── Ο ΔΟΚΙΜΑΣΤΗΣ ΔΕΝ ΜΠΑΙΝΕΙ ΠΟΤΕ ΣΤΗ ΣΕΙΡΑ ΤΗΣ ΔΙΑΓΡΑΦΗΣ ────────────────
-- Δεν πληρώνει συνδρομή εξ ορισμού, άρα το μηδενικό επίπεδο δεν σημαίνει
-- εγκαταλειμμένος λογαριασμός. Οσο η `account_is_exempt` δεν τον ήξερε, ο
-- σαρωτής του ξεκινούσε ρολόι και στις τριάντα ημέρες τον έσβηνε.
do $probe$
declare
  t uuid := '33333333-3333-3333-3333-333333333331';
begin
  insert into auth.users (id, email) values (t, 'dokimastis@propertyos.gr');
  -- Το `trial_used_at` σφραγίζεται, αλλιώς ισχύει η τοπική δοκιμή των πρώτων
  -- ημερών και ο λογαριασμός θα είχε επίπεδο για λόγο άσχετο με τη δοκιμή εδώ.
  insert into public.billing_profiles (user_id, plan, trial_used_at) values (t, 'free', now())
    on conflict (user_id) do update set plan = 'free', tester_since = null, trial_used_at = now();

  if public.user_plan_rank(t) <> 0 then
    raise exception 'Η δοκιμή στήθηκε λάθος: ο λογαριασμός έχει ήδη επίπεδο';
  end if;
  if public.account_is_exempt(t) then
    raise exception 'Λογαριασμός χωρίς συνδρομή και χωρίς ιδιότητα δοκιμαστή εξαιρείται';
  end if;

  update public.billing_profiles set tester_since = now() where user_id = t;
  if not public.account_is_exempt(t) then
    raise exception 'Ο ΔΟΚΙΜΑΣΤΗΣ ΜΠΑΙΝΕΙ ΣΤΗ ΣΕΙΡΑ ΤΗΣ ΔΙΑΓΡΑΦΗΣ';
  end if;

  -- Και ο σαρωτής δεν του ξεκινά ρολόι.
  perform public.sweep_lapsed_accounts(true);
  if exists (select 1 from public.billing_profiles where user_id = t and lapsed_at is not null) then
    raise exception 'Ο σαρωτής ξεκίνησε ρολόι διαγραφής σε δοκιμαστή';
  end if;

  raise notice 'probe: ο δοκιμαστής δεν χρονομετρείται ποτέ για διαγραφή';
end $probe$;
