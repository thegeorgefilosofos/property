-- ═══════════════════════════════════════════════════════════════════════════
-- ΕΝΑΣ ΤΥΠΟΣ ΓΙΑ ΤΟ ΑΚΙΝΗΤΟ ΚΑΙ ΤΟΝ ΧΡΗΣΤΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Δέκα πίνακες κρατούσαν το `property_id` ως `text` ενώ το `user_properties.id`
-- είναι `uuid`. Τρεις κρατούσαν και το `user_id` ως `text`. Δεκατρείς στήλες
-- συνολικά και πάνω τους πενήντα εννέα πολιτικές ασφαλείας.
--
-- ΤΙ ΚΟΣΤΙΖΕ, ΣΕ ΜΟΝΟΠΑΤΙ ΑΝΩΝΥΜΟΥ ΧΡΗΣΤΗ. Η `get_checkin_context` έγραφε
-- `where id::text = v_link.property_id::text`. Το cast ακυρώνει το πρωτεύον
-- κλειδί: σειριακή σάρωση ΟΛΩΝ των ακινήτων ΟΛΩΝ των πελατών, σε κάθε φόρτωση
-- της σελίδας δήλωσης άφιξης. Το ίδιο στην `declare_rent_payment`, σε UPDATE
-- που τον κάνει ο ενοικιαστής. Μετά την αλλαγή, μετρημένο με EXPLAIN:
-- «Index Scan using user_properties_pkey».
--
-- ΚΑΙ ΤΟ ΔΟΜΙΚΟ. Χωρίς ενιαίο τύπο δεν μπαίνουν ξένα κλειδιά, οπότε το σβήσιμο
-- ακινήτου κρεμόταν από σκανδάλη που έσβηνε δέκα πίνακες με το χέρι. Τώρα η
-- εγγύηση είναι είκοσι τέσσερα ξένα κλειδιά `on delete cascade` και η σκανδάλη
-- φεύγει, όπως προέβλεπε το σχόλιό της.
--
-- ═════════════════════════════════════════════════════════════════════════
-- ΓΙΑΤΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ΕΙΝΑΙ ΚΑΤΑΓΡΑΦΗ ΚΑΙ ΟΧΙ ΕΝΤΟΛΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Η αλλαγή ΕΓΙΝΕ ΗΔΗ, με ανοιχτή σύνδεση, πρώτα στη βάση δοκιμών και μετά στην
-- παραγωγή και επαληθεύτηκε και στις δύο. Ο λόγος που δεν γράφτηκε πρώτα ως
-- αρχείο είναι ότι ΔΕΝ ΜΠΟΡΟΥΣΕ ΝΑ ΓΡΑΦΤΕΙ ΣΩΣΤΑ ΧΩΡΙΣ ΝΑ ΡΩΤΗΘΕΙ Ο ΚΑΤΑΛΟΓΟΣ:
-- τα σώματα των πολιτικών είχαν ξαναγραφτεί επιτόπου από το
-- 20260808010000_rls_initplan.sql, οπότε τα αρχεία τους έδειχναν άλλο κείμενο
-- από αυτό που έτρεχε. Το στιγμιότυπο βγήκε από `pg_get_expr`, όχι από αρχεία.
--
-- ΤΟ ΑΡΧΕΙΟ ΕΙΝΑΙ ΑΥΤΟΤΕΛΕΣ ΚΑΙ ΕΠΑΝΑΛΗΨΙΜΟ: ξαναχτίζει το στιγμιότυπο από τον
-- κατάλογο της βάσης στην οποία τρέχει και εφαρμόζει τις ίδιες μετεγγραφές.
-- Σε βάση που έχει ήδη ενοποιηθεί δεν κάνει τίποτα.
-- ═════════════════════════════════════════════════════════════════════════
--
-- ΤΑ ΤΕΣΣΕΡΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΘΑ ΕΙΧΑΝ ΣΠΑΣΕΙ ΣΙΩΠΗΛΑ, ΚΑΙ ΠΩΣ ΑΠΟΦΕΥΧΘΗΚΑΝ:
--
-- 1. Η ΕΜΒΕΛΕΙΑ ΕΙΝΑΙ ΜΕΓΑΛΥΤΕΡΗ ΑΠΟ ΤΟΥΣ ΔΩΔΕΚΑ ΠΙΝΑΚΕΣ. Η πολιτική
--    `own_inventory_repairs` ζει σε ΑΛΛΟΝ πίνακα και αναφέρεται στο
--    `inventory_items.property_id`. Χωρίς αυτήν, το `alter` σκάει με 0A000
--    («cannot alter type of a column used in a policy definition»). Βρέθηκε από
--    το `pg_depend`, όχι από ανάγνωση. Σύνολο: πενήντα εννέα πολιτικές.
--
-- 2. ΜΟΝΟ ΚΑΙ ΔΙΠΛΟ CAST ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ. Σε ολόκληρη τη βάση
--    υπάρχουν σαράντα μία πολιτικές με `p.id::text`. Οι είκοσι οκτώ γράφουν
--    ΔΙΠΛΟ cast (`p.id::text = t.property_id::text`) πάνω σε στήλες που είναι
--    ΗΔΗ uuid, σε εννέα πίνακες που δεν αγγίζονται εδώ. Οι δεκατρείς γράφουν
--    ΜΟΝΟ cast και αυτές ακριβώς είναι οι δικές μας. Μια μετεγγραφή που δεν
--    ξεχώριζε τα δύο θα χαλούσε τις είκοσι οκτώ.
--
-- 3. ΤΟ ΞΕΤΥΛΙΓΜΑ ΤΟΥ auth.uid() ΕΙΝΑΙ ΤΟΠΙΚΟ, ΟΧΙ ΚΑΘΟΛΙΚΟ. Τρεις πολιτικές
--    γράφουν `((( SELECT auth.uid() AS uid))::text)`. Στις δύο η στήλη απέναντι
--    γίνεται uuid και το cast πρέπει να φύγει. Στην τρίτη
--    (`own_inventory_repairs`) η στήλη είναι ήδη uuid και μένει ως έχει: τυφλή
--    αντικατάσταση θα άφηνε `user_id::text = ( SELECT auth.uid() )`, δηλαδή
--    text έναντι uuid και η πολιτική θα έσκαγε στην πρώτη χρήση.
--
-- 4. ΤΟ 'service_role'::text ΕΙΝΑΙ ΚΥΡΙΟΛΕΚΤΙΚΗ ΤΙΜΗ. Η πολιτική
--    `Service write inventory_handovers` το χρησιμοποιεί. Μια «απλοποιημένη»
--    μετεγγραφή που σβήνει κάθε `::text` του αφαιρεί τον τύπο και ο ρόλος
--    υπηρεσίας χάνει την εγγραφή στα πρωτόκολλα παράδοσης. Οι μετεγγραφές εδώ
--    είναι ονομαστικές και δεν το αγγίζουν.
--
-- ΤΙ ΕΠΑΛΗΘΕΥΤΗΚΕ ΜΕΤΑ, ΚΑΙ ΣΤΙΣ ΔΥΟ ΒΑΣΕΙΣ: πενήντα εννέα πολιτικές πίσω,
-- δεκατρείς στήλες uuid, μηδέν υπολειπόμενα cast, είκοσι τέσσερα ξένα κλειδιά,
-- ο χρήστης Α βλέπει μόνο τα δικά του, οι δύο απόπειρες εγγραφής σε ξένο
-- ακίνητο κόβονται με 42501 και η διαγραφή ακινήτου καθαρίζει τα παιδιά της
-- από cascade αντί από σκανδάλη.
-- ═══════════════════════════════════════════════════════════════════════════

do $mig$
declare
  r record; t text; sql text; n int := 0;
  v_scope text[] := array['checkin_links','client_stays','guest_checkins','ical_feeds','inventory_handovers',
    'inventory_items','inventory_maintenance','maintenance_requests','portal_links','pricing_settings',
    'airbnb_bookings','tenant_comm_log','inventory_repairs'];
begin
  -- Ηδη ενοποιημένη βάση: δεν υπάρχει τίποτα να γίνει.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portal_links' and column_name='property_id' and data_type='text'
  ) then
    raise notice 'Οι στήλες είναι ήδη uuid — καμία ενέργεια.';
    return;
  end if;

  -- ── Στιγμιότυπο από τον ΚΑΤΑΛΟΓΟ. Μόνιμος πίνακας και όχι προσωρινός: αν
  --    κάτι πάει στραβά, το στιγμιότυπο πρέπει να επιβιώνει της συνεδρίας.
  drop table if exists public._pol_backup_20260815;
  create table public._pol_backup_20260815 as
  select c.relname::text as tbl, p.polname::text as polname, p.polcmd, p.polpermissive,
    (select coalesce(array_agg(rolname::text), array['public']) from pg_roles where oid = any(p.polroles)) as roles,
    pg_get_expr(p.polqual, p.polrelid, true) as q,
    pg_get_expr(p.polwithcheck, p.polrelid, true) as w
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = any(v_scope);

  -- ── Η σκανδάλη φεύγει ΠΡΩΤΗ: κάνει `old.id::text` και θα έσκαγε με uuid.
  --    Τα ξένα κλειδιά παρακάτω την αντικαθιστούν και μάλιστα καλύτερα:
  --    η εγγύηση γίνεται δηλωτική αντί για διαδικαστική.
  drop trigger if exists trg_purge_property_children on public.user_properties;
  drop function if exists public.purge_property_children();

  for r in select tbl, polname from public._pol_backup_20260815 loop
    execute format('drop policy if exists %I on public.%I', r.polname, r.tbl);
    n := n + 1;
  end loop;
  raise notice 'έπεσαν % πολιτικές', n;

  foreach t in array array['checkin_links','client_stays','guest_checkins','ical_feeds','inventory_handovers',
    'inventory_items','inventory_maintenance','maintenance_requests','portal_links','pricing_settings'] loop
    execute format('alter table public.%I alter column property_id type uuid using property_id::uuid', t);
  end loop;
  foreach t in array array['inventory_items','airbnb_bookings','tenant_comm_log'] loop
    execute format('alter table public.%I alter column user_id type uuid using user_id::uuid', t);
  end loop;

  n := 0;
  for r in select * from public._pol_backup_20260815 loop
    sql := format('create policy %I on public.%I as %s for %s to %s',
      r.polname, r.tbl,
      case when r.polpermissive then 'permissive' else 'restrictive' end,
      case r.polcmd when 'r' then 'select' when 'a' then 'insert'
                    when 'w' then 'update' when 'd' then 'delete' else 'all' end,
      array_to_string(r.roles, ', '));
    -- Ρήτρα ΜΟΝΟ όπου υπήρχε: οι `parent_upd_*` έχουν WITH CHECK χωρίς USING
    -- επίτηδες, γιατί ένα restrictive USING θα τις έκρυβε από τον ιδιοκτήτη τους.
    if r.q is not null then
      t := replace(r.q, 'p.id::text', 'p.id');
      if r.tbl in ('airbnb_bookings','tenant_comm_log') then
        t := replace(t, '((( SELECT auth.uid() AS uid))::text)', '( SELECT auth.uid() AS uid)');
      end if;
      sql := sql || ' using (' || t || ')';
    end if;
    if r.w is not null then
      t := replace(r.w, 'p.id::text', 'p.id');
      if r.tbl in ('airbnb_bookings','tenant_comm_log') then
        t := replace(t, '((( SELECT auth.uid() AS uid))::text)', '( SELECT auth.uid() AS uid)');
      end if;
      sql := sql || ' with check (' || t || ')';
    end if;
    execute sql;
    n := n + 1;
  end loop;
  raise notice 'ξαναχτίστηκαν % πολιτικές', n;

  -- ── ΦΡΑΧΤΗΣ. Αν έμεινε cast πάνω σε στήλη που μόλις έγινε uuid, σκάμε εδώ
  --    και γυρίζει όλη η συναλλαγή πίσω. Μια πολιτική με λάθος τύπο δεν
  --    κοκκινίζει στη δημιουργία: κοκκινίζει στην πρώτη χρήση, από χρήστη.
  if exists (
    select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relname = any(v_scope)
      and (coalesce(pg_get_expr(p.polqual,p.polrelid,true),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid,true),''))
          ~ '(p\.id::text|property_id::text)'
  ) then
    raise exception 'ΦΡΑΧΤΗΣ: έμεινε cast σε στήλη που έγινε uuid';
  end if;

  drop table public._pol_backup_20260815;
end $mig$;

-- ── Ξένα κλειδιά: η εγγύηση διαγραφής γίνεται δουλειά της βάσης.
do $fk$
declare t text;
begin
  foreach t in array array['checkin_links','client_stays','guest_checkins','ical_feeds','inventory_handovers',
    'inventory_items','inventory_maintenance','maintenance_requests','portal_links','pricing_settings'] loop
    if not exists (select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid
      where c.relname=t and con.contype='f'
        and con.conkey = array[(select attnum from pg_attribute where attrelid=c.oid and attname='property_id')]) then
      execute format('alter table public.%I add constraint %I foreign key (property_id) references public.user_properties(id) on delete cascade', t, t||'_property_id_fkey');
    end if;
  end loop;
  foreach t in array array['inventory_items','airbnb_bookings','tenant_comm_log'] loop
    if not exists (select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid
      where c.relname=t and con.contype='f'
        and con.conkey = array[(select attnum from pg_attribute where attrelid=c.oid and attname='user_id')]) then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade', t, t||'_user_id_fkey');
    end if;
  end loop;
end $fk$;

-- ── Οι πέντε συναρτήσεις που έγραφαν cast. Η `get_accountant_data` θα ΕΣΚΑΓΕ
--    μετά την αλλαγή (`uuid = text`, 42883) στο πρώτο άνοιγμα του φακέλου του
--    λογιστή. Οι υπόλοιπες απλώς ακύρωναν το ευρετήριο.
do $fx$
declare r record; def text; newdef text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname in ('declare_rent_payment','get_accountant_data','get_checkin_context',
                        'get_portal_data','submit_maintenance_request')
  loop
    def := pg_get_functiondef(r.oid);
    newdef := replace(def, 'rp.property_id::text = v_link.property_id::text', 'rp.property_id = v_link.property_id');
    newdef := replace(newdef, 's.property_id = p.id::text', 's.property_id = p.id');
    newdef := replace(newdef, 'where id::text = v_link.property_id::text', 'where id = v_link.property_id');
    newdef := replace(newdef, 'v_link.property_id::uuid', 'v_link.property_id');
    if newdef <> def then execute newdef; raise notice 'διορθώθηκε %', r.proname; end if;
  end loop;
end $fx$;
