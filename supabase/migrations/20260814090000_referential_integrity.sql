-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ ΣΒΗΣΙΜΟ ΤΟΥ ΑΚΙΝΗΤΟΥ ΓΙΝΕΤΑΙ ΔΟΥΛΕΙΑ ΤΗΣ ΒΑΣΗΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΙΣΧΥΕ. Τριάντα ένας πίνακες κρατούν `property_id`. Οι δεκατέσσερις είχαν
-- ξένο κλειδί με CASCADE. Οι δεκαεπτά δεν είχαν τίποτα και το σβήσιμο του
-- ακινήτου γινόταν με χειρόγραφη λίστα είκοσι πέντε ονομάτων μέσα στην οθόνη
-- (`app/dashboard/page.tsx`). Τρία ανεξάρτητα λάθη γεννιούνται από αυτό:
--
--   • Η ΛΙΣΤΑ ΞΕΧΝΟΥΣΕ. Έλειπαν τα `checkin_links`, `guest_checkins`,
--     `airbnb_bookings`, `bank_transactions`, `book_closings` και
--     `tenant_damages`. Δηλαδή μετά τη διαγραφή του ακινήτου έμενε ΕΝΕΡΓΟΣ
--     σύνδεσμος δήλωσης άφιξης και μαζί του τα στοιχεία ταυτότητας και
--     διαβατηρίου των επισκεπτών — προσωπικά δεδομένα τρίτων, σε ακίνητο που
--     δεν υπάρχει.
--   • Η ΛΙΣΤΑ ΕΛΕΓΕ ΨΕΜΑΤΑ. Περιείχε το `notification_preferences`, που ΔΕΝ
--     έχει στήλη `property_id`. Κάθε διαγραφή ακινήτου έστελνε ένα ερώτημα που
--     γύριζε 42703. Δεν φαινόταν πουθενά, γιατί ο κώδικας χρησιμοποιεί
--     `Promise.allSettled` και δεν κοιτάζει τα αποτελέσματα.
--   • ΔΕΝ ΙΣΧΥΕ ΓΙΑ ΟΛΟΥΣ. Η λίστα τρέχει στον περιηγητή. Ό,τι σβήνει ακίνητο
--     από αλλού — edge function, διαγραφή λογαριασμού, ρόλος υπηρεσίας — δεν
--     περνούσε από εκεί καθόλου.
--
-- ΓΙΑΤΙ ΔΕΝ ΥΠΗΡΧΑΝ ΤΑ ΚΛΕΙΔΙΑ. Δεν ήταν αμέλεια: δέκα από τους δεκαεπτά
-- πίνακες κρατούν το `property_id` ως `text`, ενώ το `user_properties.id` είναι
-- `uuid`. Ξένο κλειδί ανάμεσα σε text και uuid δεν γίνεται. Ο ίδιος λόγος
-- γέννησε και τα `property_id::text = ...::text` που υπάρχουν μέσα σε τρεις
-- συναρτήσεις: συγκρίσεις που δεν μπορούν να χρησιμοποιήσουν ευρετήριο.
--
-- ΕΛΕΓΧΘΗΚΕ ΠΡΙΝ ΓΡΑΦΤΕΙ, ΠΑΝΩ ΣΤΗΝ ΠΑΡΑΓΩΓΗ: και οι δέκα στήλες κειμένου
-- περιέχουν αποκλειστικά κανονικά uuid (μηδέν εξαιρέσεις) και υπάρχει ΜΙΑ
-- ορφανή γραμμή σε όλη τη βάση — ένα `pricing_settings` που δείχνει σε ακίνητο
-- που έχει ήδη σβηστεί. Δηλαδή ακριβώς το υπόλειμμα που περιγράφεται πιο πάνω.
--
-- ΤΙ ΚΑΝΕΙ ΤΟ ΑΡΧΕΙΟ. Βάζει το ξένο κλειδί όπου ο τύπος το επιτρέπει σήμερα,
-- και σκανδάλη όπου δεν το επιτρέπει ακόμη. Η ενοποίηση του τύπου έρχεται
-- χωριστά, γιατί απαιτεί να ξαναγραφούν σαράντα τρεις πολιτικές ασφαλείας.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ΤΟ ΚΛΕΙΔΙ, ΟΠΟΥ Ο ΤΥΠΟΣ ΤΟ ΕΠΙΤΡΕΠΕΙ ─────────────────────────────
-- Επτά από τους δεκαεπτά κρατούν ήδη `uuid`. Παίρνουν κανονικό ξένο κλειδί.
--
-- CASCADE παντού, με ΜΙΑ εξαίρεση. Η κίνηση τράπεζας δεν είναι δεδομένο του
-- ακινήτου· είναι κίνηση του λογαριασμού που ΑΝΤΙΣΤΟΙΧΙΣΤΗΚΕ σε ακίνητο. Όταν
-- το ακίνητο φεύγει, η κίνηση πρέπει να αποσυνδεθεί, όχι να χαθεί: ο χρήστης
-- τη δήλωσε στην ΑΑΔΕ. Και το παράθυρο επιβεβαίωσης της διαγραφής απαριθμεί
-- ρητά τι σβήνεται — οι τραπεζικές κινήσεις δεν είναι εκεί μέσα.
do $$
declare t text; v_action text;
begin
  foreach t in array array[
    'airbnb_bookings','bank_transactions','book_closings','calendar_events',
    'property_documents','tenant_comm_log','tenant_damages']
  loop
    execute format(
      'delete from public.%I x where x.property_id is not null
         and not exists (select 1 from public.user_properties p where p.id = x.property_id)', t);
    v_action := case when t = 'bank_transactions' then 'set null' else 'cascade' end;
    if not exists (select 1 from pg_constraint where conname = t || '_property_id_fkey') then
      execute format(
        'alter table public.%I add constraint %I foreign key (property_id)
           references public.user_properties(id) on delete %s', t, t || '_property_id_fkey', v_action);
    end if;
  end loop;
end $$;

-- ── 2. ΚΑΙ ΜΙΑ ΣΚΑΝΔΑΛΗ, ΟΠΟΥ Ο ΤΥΠΟΣ ΔΕΝ ΤΟ ΕΠΙΤΡΕΠΕΙ ΑΚΟΜΗ ────────────
-- Οι υπόλοιποι δέκα κρατούν το `property_id` ως `text`. Η μετατροπή σε `uuid`
-- ΔΕΝ γίνεται εδώ και ο λόγος είναι συγκεκριμένος: η Postgres αρνείται να
-- αλλάξει τον τύπο στήλης που αναφέρεται μέσα σε πολιτική RLS και πάνω στους
-- δέκα αυτούς πίνακες κάθονται σαράντα τρεις πολιτικές. Η μετατροπή σημαίνει
-- «σβήσε σαράντα τρεις πολιτικές ασφαλείας και ξαναγράψ' τες» — δουλειά που
-- αξίζει δικό της αρχείο, δικό της έλεγχο και σύγκριση καταλόγου πριν και μετά.
-- Μπαίνει σε ξεχωριστή μετανάστευση αντί να κρυφτεί μέσα σε αυτήν.
--
-- Η ΕΓΓΥΗΣΗ ΟΜΩΣ ΔΕΝ ΠΕΡΙΜΕΝΕΙ. Αυτό που χρειάζεται ο χρήστης δεν είναι ένα
-- ξένο κλειδί· είναι να μη μένει τίποτα πίσω, όποιος κι αν σβήσει το ακίνητο.
-- Η σκανδάλη το δίνει σήμερα, από τη βάση, για ΚΑΘΕ καλούντα — και θα φύγει
-- μόνη της την ημέρα που τα κλειδιά θα μπορούν να μπουν.
create or replace function public.purge_property_children() returns trigger
  language plpgsql
  security definer
  set search_path = 'public', 'pg_temp'
as $$
declare t text;
begin
  foreach t in array array[
    'checkin_links','client_stays','guest_checkins','ical_feeds','inventory_handovers',
    'inventory_items','inventory_maintenance','maintenance_requests','portal_links','pricing_settings']
  loop
    execute format('delete from public.%I where property_id = $1', t) using old.id::text;
  end loop;
  return old;
end $$;

drop trigger if exists trg_purge_property_children on public.user_properties;
create trigger trg_purge_property_children
  before delete on public.user_properties
  for each row execute function public.purge_property_children();

comment on function public.purge_property_children() is
  'Σβήνει τα παιδιά του ακινήτου που κρατούν ακόμη το property_id ως κείμενο και δεν μπορούν να έχουν ξένο κλειδί.';

-- Και τα υπολείμματα που έχουν ήδη μείνει από παλιότερες διαγραφές.
do $$
declare t text;
begin
  foreach t in array array[
    'checkin_links','client_stays','guest_checkins','ical_feeds','inventory_handovers',
    'inventory_items','inventory_maintenance','maintenance_requests','portal_links','pricing_settings']
  loop
    execute format(
      'delete from public.%I x where x.property_id is not null
         and not exists (select 1 from public.user_properties p where p.id::text = x.property_id)', t);
  end loop;
end $$;

-- ── 3. ΕΥΡΕΤΗΡΙΑ ΓΙΑ ΤΟ ΣΒΗΣΙΜΟ ──────────────────────────────────────────
-- Ξένο κλειδί ή σκανδάλη και στις δύο περιπτώσεις η διαγραφή του ακινήτου
-- ψάχνει το παιδί με `property_id`. Χωρίς ευρετήριο, σειριακή σάρωση ΟΛΩΝ των
-- πελατών, μία ανά πίνακα.
create index if not exists airbnb_bookings_property_idx     on public.airbnb_bookings (property_id);
create index if not exists bank_transactions_property_idx   on public.bank_transactions (property_id);
create index if not exists book_closings_property_idx       on public.book_closings (property_id);
create index if not exists checkin_links_property_idx       on public.checkin_links (property_id);
create index if not exists client_stays_property_idx        on public.client_stays (property_id);
create index if not exists ical_feeds_property_idx          on public.ical_feeds (property_id);
create index if not exists inventory_handovers_property_idx on public.inventory_handovers (property_id);
create index if not exists portal_links_property_idx        on public.portal_links (property_id);
create index if not exists pricing_settings_property_idx    on public.pricing_settings (property_id);
create index if not exists property_documents_property_idx  on public.property_documents (property_id);
create index if not exists tenant_comm_log_property_idx     on public.tenant_comm_log (property_id);
create index if not exists tenant_damages_property_idx      on public.tenant_damages (property_id);

-- ── 4. Ο ΛΟΓΑΡΙΑΣΜΟΣ ΤΟΥ ΛΟΓΙΣΤΗ ΕΠΙΒΙΩΝΕ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ ────────────────
-- Οι `accountant_clients` και `accountant_requests` δεν είχαν ΚΑΝΕΝΑ ξένο
-- κλειδί. Ο ιδιοκτήτης που διαγράφει τον λογαριασμό του άφηνε πίσω τη σύνδεση
-- με τον λογιστή του και τα αιτήματά του — δηλαδή το «διέγραψα τον λογαριασμό
-- μου» δεν ήταν αλήθεια και ένα αίτημα διαγραφής κατά GDPR δεν εκτελούνταν
-- πλήρως. Και προς τις δύο κατευθύνσεις: και ο λογιστής που φεύγει.
delete from public.accountant_clients c
 where not exists (select 1 from auth.users u where u.id = c.accountant_id)
    or not exists (select 1 from auth.users u where u.id = c.owner_id);
delete from public.accountant_requests r
 where not exists (select 1 from auth.users u where u.id = r.accountant_id)
    or not exists (select 1 from auth.users u where u.id = r.owner_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='accountant_clients_accountant_fkey') then
    alter table public.accountant_clients
      add constraint accountant_clients_accountant_fkey foreign key (accountant_id)
      references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='accountant_clients_owner_fkey') then
    alter table public.accountant_clients
      add constraint accountant_clients_owner_fkey foreign key (owner_id)
      references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='accountant_requests_accountant_fkey') then
    alter table public.accountant_requests
      add constraint accountant_requests_accountant_fkey foreign key (accountant_id)
      references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='accountant_requests_owner_fkey') then
    alter table public.accountant_requests
      add constraint accountant_requests_owner_fkey foreign key (owner_id)
      references auth.users(id) on delete cascade;
  end if;
end $$;

-- ── 5. Ο ΚΑΤΟΧΟΣ ΔΕΝ ΕΙΝΑΙ ΠΡΟΑΙΡΕΤΙΚΟΣ ──────────────────────────────────
-- Είκοσι δύο πίνακες επέτρεπαν `user_id is null` και ΟΛΕΣ οι πολιτικές τους
-- λένε `user_id = auth.uid()`. Μια γραμμή με κενό κάτοχο δεν ταιριάζει σε
-- καμία πολιτική: δεν διαβάζεται, δεν διορθώνεται και δεν διαγράφεται από
-- κανέναν — αλλά υπάρχει, κρατά δεδομένα και μετράει στα όρια.
--
-- ΤΡΕΙΣ ΜΕΝΟΥΝ ΩΣ ΕΧΟΥΝ, ΓΙΑΤΙ ΤΟ ΚΕΝΟ ΕΚΕΙ ΕΧΕΙ ΝΟΗΜΑ:
--   organization_members     πρόσκληση σε email που δεν έχει γραφτεί ακόμη
--   feedback_campaign_winners το ξένο κλειδί είναι SET NULL επίτηδες: η κλήρωση
--                             μένει στο μητρώο και όταν ο νικητής φύγει
--   invoices                  ίδιος λόγος, για λόγους λογιστικής ιχνηλάτησης
--
-- Επαληθεύτηκε στην παραγωγή: καμία υπάρχουσα γραμμή δεν έχει κενό κάτοχο.
do $$
declare t text;
begin
  foreach t in array array[
    'bills','bills_history','bills_settings','checklist_items','contacts','expenses',
    'guest_checkins','inventory','inventory_handovers','inventory_items','inventory_repairs',
    'loans','maintenance_requests','maintenance_tasks','property_settings','rent_comparables',
    'rent_config','rent_payments','tenants']
  loop
    execute format('delete from public.%I where user_id is null', t);
    execute format('alter table public.%I alter column user_id set not null', t);
  end loop;
end $$;

-- ΤΡΕΙΣ ΠΙΝΑΚΕΣ ΚΡΑΤΟΥΝ ΚΑΙ ΤΟ `user_id` ΩΣ ΚΕΙΜΕΝΟ: `inventory_items`,
-- `airbnb_bookings` και `tenant_comm_log`. Γι' αυτό δεν έχουν ξένο κλειδί προς
-- τον λογαριασμό — ίδια αιτία με το `property_id` της ενότητας 2, ίδια λύση,
-- και μπαίνουν στην ίδια μελλοντική μετανάστευση ενοποίησης τύπων. Η διαγραφή
-- λογαριασμού τα φτάνει σήμερα μέσω του ακινήτου τους.

-- ── 6. ΤΡΙΑ ΔΙΚΑΙΩΜΑΤΑ ΠΟΥ ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ ΚΑΜΙΑ ΕΦΑΡΜΟΓΗ ─────────────────
-- Οι ρόλοι `anon` και `authenticated` κρατούσαν TRUNCATE, TRIGGER και
-- REFERENCES σε 65 και 69 πίνακες αντίστοιχα. Το TRUNCATE είναι το σοβαρό: η
-- RLS ΔΕΝ το φιλτράρει. Οι πολιτικές γράφτηκαν για SELECT/INSERT/UPDATE/DELETE
-- και το TRUNCATE τις προσπερνά ολόκληρες — άδειασμα πίνακα για ΟΛΟΥΣ τους
-- χρήστες, όχι μόνο για τον καλούντα.
--
-- Σήμερα δεν φτάνει κανείς εκεί: το PostgREST εκθέτει πίνακες και συναρτήσεις,
-- όχι αυθαίρετο SQL. Το δικαίωμα όμως δεν το χρειάζεται καμία λειτουργία και
-- η μόνη ερώτηση που μετράει είναι «τι γίνεται αν αύριο ανοίξει μια πόρτα που
-- σήμερα είναι κλειστή».
do $$
declare t text; v_tables text[];
begin
  select array_agg(c.relname) into v_tables
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','p');
  foreach t in array coalesce(v_tables, array[]::text[])
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ΚΑΙ ΓΙΑ ΟΣΟΥΣ ΠΙΝΑΚΕΣ ΔΕΝ ΕΧΟΥΝ ΓΡΑΦΤΕΙ ΑΚΟΜΗ. Χωρίς αυτό, το επόμενο
-- `create table` ξαναγεννά και τα τρία δικαιώματα και η διόρθωση θα κρατούσε
-- ακριβώς μέχρι την επόμενη μετανάστευση.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- Η ΕΚΤΕΛΕΣΗ ΚΑΘΕ ΝΕΑΣ ΣΥΝΑΡΤΗΣΗΣ ΔΙΝΟΤΑΝ ΣΤΟΝ ΑΝΩΝΥΜΟ ΑΥΤΟΜΑΤΑ. Γι' αυτό
-- χρειάστηκε ολόκληρη μετανάστευση ελαχίστων δικαιωμάτων τον Αύγουστο και γι'
-- αυτό ξέφυγε η κλήρωση του λαχειοφόρου. Η προεπιλογή αντιστρέφεται: ό,τι
-- πρέπει να καλεί ο ανώνυμος, δίνεται ρητά — και φαίνεται στη μετανάστευση.
alter default privileges in schema public revoke execute on functions from anon;

-- ── 7. «Ο ΤΡΕΧΩΝ ΕΝΟΙΚΙΑΣΤΗΣ» ΔΕΝ ΕΙΝΑΙ «Η ΤΕΛΕΥΤΑΙΑ ΓΡΑΜΜΗ ΠΟΥ ΓΡΑΦΤΗΚΕ»
-- Τρεις συναρτήσεις έψαχναν τον ενοικιαστή ενός ακινήτου με
--
--     order by created_at desc limit 1
--
-- δηλαδή «όποιον καταχώρησε τελευταίο ο ιδιοκτήτης». Ο ιδιοκτήτης που
-- συμπληρώνει το ιστορικό του — γράφει τον περσινό ενοικιαστή ΜΕΤΑ τον
-- σημερινό, πράγμα απολύτως φυσιολογικό — γυρίζει τον διακόπτη: η πύλη δείχνει
-- τα οικονομικά του λάθος ανθρώπου και το αίτημα βλάβης χρεώνεται σε κάποιον
-- που έχει φύγει.
--
-- Ο τρέχων ενοικιαστής ορίζεται από τη ΜΙΣΘΩΣΗ: αυτός που η μίσθωσή του
-- καλύπτει το σήμερα. Με πολλαπλές ενεργές (επικαλυπτόμενες καταχωρήσεις)
-- κερδίζει η πιο πρόσφατη έναρξη. Χωρίς καμία ενεργή, γυρνά ο τελευταίος που
-- έφυγε — ώστε η πύλη να μη μένει κενή στο κενό ανάμεσα σε δύο μισθώσεις.
create or replace function public.current_tenant_of(p_property uuid)
returns uuid
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select t.id from public.tenants t
   where t.property_id = p_property
   order by
     (t.lease_start is not null and t.lease_start <= current_date
        and (t.lease_end is null or t.lease_end >= current_date)) desc,
     t.lease_start desc nulls last,
     t.created_at desc
   limit 1;
$$;

revoke all on function public.current_tenant_of(uuid) from public, anon, authenticated;
grant execute on function public.current_tenant_of(uuid) to service_role;

comment on function public.current_tenant_of(uuid) is
  'Ο ενοικιαστής που η μίσθωσή του καλύπτει το σήμερα. Χωρίς ενεργή μίσθωση, ο τελευταίος που έφυγε.';

-- ── 8. ΟΙ ΤΡΕΙΣ ΣΥΝΑΡΤΗΣΕΙΣ ΡΩΤΟΥΝ ΠΛΕΟΝ ΤΗ ΜΙΣΘΩΣΗ ──────────────────────
-- Τα `::text` και `::uuid` ΜΕΝΟΥΝ και μένουν σχολιασμένα. Δεν είναι
-- καλλωπισμός και δεν είναι αμέλεια: γεφυρώνουν τη διαφορά τύπου της ενότητας
-- 2 και φεύγουν μαζί της. Μια σύγκριση `uuid::text = text` δεν χρησιμοποιεί
-- ευρετήριο — αυτό είναι το πραγματικό κόστος που εξοφλεί η ενοποίηση.

create or replace function public.get_portal_data(p_token text, p_pin text default null)
returns json
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric; v_fails int;
begin
  select * into v_link from portal_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return null; end if;

  if v_link.pin_hash is not null then
    -- ΤΟ ΚΑΘΑΡΙΣΜΑ ΗΤΑΝ ΜΟΝΟ ΓΙΑ ΤΟ ΤΡΕΧΟΝ ΔΙΑΚΡΙΤΙΚΟ, άρα ένα διακριτικό με
    -- τέσσερις αποτυχίες που δεν ξαναχρησιμοποιείται κρατούσε τις γραμμές του
    -- για πάντα. Το φίλτρο βγαίνει: το ίδιο ευρετήριο, ένα όριο για όλους.
    delete from portal_pin_attempts where attempted_at < now() - interval '1 day';

    select count(*) into v_fails
      from portal_pin_attempts
      where token = p_token and success = false and attempted_at > now() - interval '15 minutes';
    if v_fails >= 5 then
      return json_build_object('locked', true, 'rate_limited', true);
    end if;

    if p_pin is null or crypt(p_pin, v_link.pin_hash) <> v_link.pin_hash then
      if p_pin is not null then
        insert into portal_pin_attempts(token, success) values (p_token, false);
      end if;
      return json_build_object('locked', true);
    end if;

    delete from portal_pin_attempts where token = p_token;
  end if;

  -- Το `::uuid` δεν είναι καλλωπισμός: το `portal_links.property_id` είναι
  -- ακόμη κείμενο (βλ. ενότητα 2) και χωρίς τη μετατροπή η γραμμή δεν εκτελείται.
  select name, address, prop_type into v_prop from user_properties where id = v_link.property_id::uuid;

  -- Με δεμένο ενοικιαστή φέρνουμε ΕΚΕΙΝΟΝ: ο σύνδεσμος ανήκει σε πρόσωπο, όχι
  -- σε ακίνητο και ο προηγούμενος κάτοικος δεν επιτρέπεται να δει τον επόμενο.
  if v_link.tenant_id is not null then
    select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
      from tenants where id = v_link.tenant_id;
  else
    select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
      from tenants where id = public.current_tenant_of(v_link.property_id::uuid);
  end if;

  select coalesce(json_agg(json_build_object(
           'id', rp.id, 'year', rp.period_year, 'month', rp.period_month,
           'amount', rp.amount, 'due_date', rp.due_date, 'declared', rp.tenant_declared
         ) order by rp.period_year, rp.period_month), '[]'::json),
         coalesce(sum(rp.amount), 0)
    into v_due, v_total
    from rent_payments rp
    where rp.tenant_id = v_ten.id and rp.paid = false;
  return json_build_object(
    'property', json_build_object('name', v_prop.name, 'address', v_prop.address, 'type', v_prop.prop_type),
    'tenant',   json_build_object('name', v_ten.full_name, 'rent', v_ten.monthly_rent,
      'lease_start', v_ten.lease_start, 'lease_end', v_ten.lease_end, 'deposit', v_ten.deposit_amount,
      'rent_iban', v_ten.rent_iban),
    'payment_link', v_link.payment_link,
    'due',      v_due,
    'total_due', v_total
  );
end; $function$;

create or replace function public.submit_maintenance_request(
  p_token text, p_title text, p_description text, p_contact text, p_photos jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_link record; v_ten_id uuid; v_photos jsonb;
begin
  select * into v_link from portal_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  if not allow_public_submit('maint', p_token, 5, interval '1 hour') then return false; end if;
  if v_link.tenant_id is not null then
    v_ten_id := v_link.tenant_id;
  else
    v_ten_id := public.current_tenant_of(v_link.property_id::uuid);
  end if;
  v_photos := coalesce(p_photos, '[]'::jsonb);
  if jsonb_typeof(v_photos) <> 'array' then v_photos := '[]'::jsonb; end if;
  if jsonb_array_length(v_photos) > 5 then
    select jsonb_agg(value) into v_photos
      from (select value from jsonb_array_elements(v_photos) limit 5) t;
  end if;
  insert into maintenance_requests(property_id, user_id, token, tenant_id, title, description, contact, photos)
    values (v_link.property_id, v_link.user_id, p_token, v_ten_id, left(p_title, 200), left(p_description, 2000), left(p_contact, 200), v_photos);
  return true;
end; $function$;

create or replace function public.get_accountant_data(p_token text, p_year integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_link record; v_props json; v_owner text;
begin
  select * into v_link from accountant_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select coalesce(nullif(trim(owner_name), ''), full_name) into v_owner from billing_profiles where user_id = v_link.user_id;
  select json_agg(sub.row) into v_props from (
    select json_build_object(
      'name', p.name, 'atak', p.atak, 'address', p.address, 'prop_type', p.prop_type,
      -- ΤΟ ΕΙΣΠΡΑΧΘΕΝ ΕΝΟΙΚΙΟ ΤΟΥ ΕΤΟΥΣ. Ίδια πηγή και ίδιο φίλτρο με το Ε2.
      'rent_collected', coalesce((
        select sum(rp.amount) from rent_payments rp
        where rp.property_id = p.id and rp.user_id = v_link.user_id and rp.period_year = p_year
      ), 0),
      -- Σε πόσες καταχωρημένες περιόδους βασίζεται. Χωρίς αυτό, το «0 €» δεν
      -- ξεχωρίζει από το «δεν καταχωρήθηκε τίποτα».
      'rent_months', coalesce((
        select count(*) from rent_payments rp
        where rp.property_id = p.id and rp.user_id = v_link.user_id and rp.period_year = p_year
      ), 0),
      -- Συμφραζόμενο, ΟΧΙ έσοδο: τι νοικιάζεται σήμερα. Ο λογιστής διάβαζε εδώ
      -- το ενοίκιο της τελευταίας ΚΑΤΑΧΩΡΗΣΗΣ, που με συμπληρωμένο ιστορικό
      -- είναι περσινό νούμερο δίπλα σε φετινά έσοδα.
      'rent_monthly', (
        select t.monthly_rent from tenants t where t.id = public.current_tenant_of(p.id)
      ),
      'expenses', coalesce((
        select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date))
        from expenses e
        where e.property_id = p.id and e.user_id = v_link.user_id and extract(year from e.date) = p_year
      ), '[]'::json),
      'stays', coalesce((
        select json_agg(json_build_object('check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights, 'total', s.total))
        from client_stays s
        where s.property_id = p.id::text and s.user_id = v_link.user_id
          and extract(year from coalesce(s.check_in, s.check_out)) = p_year
      ), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $function$;
