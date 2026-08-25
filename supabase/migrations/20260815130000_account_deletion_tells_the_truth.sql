-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ΕΠΑΨΕ ΝΑ ΚΑΤΑΠΙΝΕΙ ΤΙΣ ΑΠΟΤΥΧΙΕΣ ΤΗΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΥΠΗΡΧΕ, ΜΕΤΡΗΜΕΝΟ. Τέσσερις γραμμές μέσα στην `delete_my_account`:
--
--     begin
--       delete from storage.objects where owner = uid;
--     exception when others then
--       null;                        ← εδώ πέθαινε κάθε ένδειξη
--     end;
--
-- Γραμμένες στο baseline (γραμμή 258) και αντιγραμμένες αυτούσιες στο
-- 20260805070000 (γραμμή 86), όπου η συνάρτηση ξαναγράφτηκε για το cast.
--
-- ΤΙ ΚΟΣΤΙΖΑΝ. Μετά το `null` η συνάρτηση συνέχιζε στο `delete from
-- auth.users`, ο πελάτης έπαιρνε επιτυχία και η οθόνη υποσχόταν «ακίνητα,
-- ενοικιαστές, πελάτες, δαπάνες, λογαριασμούς, έγγραφα και ΑΡΧΕΙΑ». Τα
-- αρχεία όμως ζουν σε επτά κάδους, οι τέσσερις ιδιωτικοί: property-files,
-- lease-documents (μισθωτήρια, ταυτότητες), inventory-docs (αποδείξεις),
-- maintenance-photos. Μια αποτυχία εκεί άφηνε όλα αυτά στη θέση τους, χωρίς
-- ούτε ένα ίχνος πουθενά: ούτε ο χρήστης το μάθαινε, ούτε ο υπεύθυνος
-- επεξεργασίας μπορούσε να το αποδείξει ή να το διορθώσει.
--
-- ΔΕΥΤΕΡΗ, ΠΙΟ ΗΣΥΧΗ ΑΠΩΛΕΙΑ ΣΤΟ ΙΔΙΟ ΣΗΜΕΙΟ. Το `where owner = uid` δεν
-- πιάνει όλα τα αρχεία του χρήστη και όταν δεν τα πιάνει δεν σκάει καν:
-- σβήνει λιγότερα και επιστρέφει καθαρό.
--
--   · maintenance-photos: τα ανεβάζει ο μισθωτής από την πύλη, ως `anon`
--     (app/portal/[token]/page.tsx:153), σε «<token>/…». Ο `owner` είναι
--     κενός, ο ιδιοκτήτης όμως είναι ο χρήστης του portal_links.
--   · inventory-docs: η διαδρομή είναι «receipts/<property_id>/…»
--     (inventory/ItemFormModal.tsx:99), δεν ξεκινά από το uid.
--   · Οι άλλοι τέσσερις κάδοι γράφονται με uploadUserScoped, σε «<uid>/…».
--
-- Γι' αυτό τα προθέματα μαζεύονται ΠΡΙΝ τη σάρωση των πινάκων: μετά, τα
-- portal_links και τα user_properties δεν υπάρχουν πια και ο φάκελος δεν
-- βρίσκεται ποτέ.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΕΠΙΛΟΓΗ: ΟΧΙ ΝΑ ΣΚΑΕΙ. ΝΑ ΚΑΤΑΓΡΑΦΕΤΑΙ ΚΑΙ ΝΑ ΛΕΓΕΤΑΙ.
-- ─────────────────────────────────────────────────────────────────────────
-- Και οι δύο δρόμοι δοκιμάστηκαν στο χαρτί πριν γραφτεί η πρώτη γραμμή.
--
-- ΓΙΑΤΙ ΟΧΙ «ΝΑ ΣΚΑΕΙ». Ολη η συνάρτηση είναι ΜΙΑ συναλλαγή. Αν αφήσουμε την
-- εξαίρεση να ανέβει, κάνει rollback και το βήμα 1 (κάθε πίνακας του public
-- με στήλη user_id) και το βήμα 3 (auth.users). Το `storage.objects` ανήκει
-- στον `supabase_storage_admin`, όχι στον `postgres` που είναι ιδιοκτήτης
-- αυτής της SECURITY DEFINER: αν λείψει κάποτε το δικαίωμα DELETE, η εξαίρεση
-- δεν είναι περιστατικό, είναι μόνιμη κατάσταση. Τότε ΚΑΝΕΝΑΣ δεν μπορεί πια
-- να διαγράψει λογαριασμό και μένουν στη βάση ΠΕΡΙΣΣΟΤΕΡΑ προσωπικά δεδομένα
-- από όσα άφηνε το `null`: τα ΑΦΜ, τα τηλέφωνα και τα μισθωτήρια τρίτων
-- προσώπων που δεν έχουν καν λογαριασμό εδώ. Το άρθρο 17 δίνει δικαίωμα
-- διαγραφής· μια μερική αποτυχία δεν επιτρέπεται να το μετατρέπει σε ολική
-- άρνηση. Ο αρχικός συγγραφέας το είχε δει σωστά: το λάθος ήταν η σιωπή, όχι
-- η απόφαση να μην μπλοκάρει.
--
-- ΤΙ ΓΙΝΕΤΑΙ ΑΝΤΙ ΓΙ' ΑΥΤΟ, ΚΑΙ ΓΙΑΤΙ ΑΡΚΕΙ. Η αποτυχία πιάνεται, αλλά αφήνει
-- τρία ίχνη αντί για κανένα:
--
--   1. ΜΕΤΡΗΜΕΝΟ. Πόσα αντικείμενα σβήστηκαν, πόσα έμειναν, σε ποιους κάδους.
--   2. ΜΟΝΙΜΟ. Γραμμή στον `account_deletion_incidents`, με SQLSTATE και
--      μήνυμα, που επιβιώνει της διαγραφής την οποία περιγράφει.
--   3. ΟΡΑΤΟ. Η συνάρτηση δεν επιστρέφει πια `void` αλλά json και η οθόνη
--      λέει τι ακριβώς έμεινε αντί για σκέτη επιβεβαίωση.
--
-- Αυτό είναι η αρχή της λογοδοσίας (άρθρο 5 παρ. 2): όχι «να μη συμβεί ποτέ»,
-- αλλά «να μπορεί να αποδειχθεί τι συνέβη».
--
-- ΤΙ ΔΕΝ ΛΥΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ, ΓΡΑΜΜΕΝΟ ΓΙΑ ΝΑ ΜΗΝ ΥΠΟΣΧΕΘΕΙ ΠΕΡΙΣΣΟΤΕΡΑ.
-- Το `delete from storage.objects` σβήνει τη ΓΡΑΜΜΗ του καταλόγου. Τα ίδια τα
-- bytes στον αποθηκευτικό χώρο τα σβήνει το Storage API, όχι η βάση. Ο
-- πίνακας περιστατικών κρατά uid και κάδο ακριβώς γι' αυτό: είναι ό,τι
-- χρειάζεται κάποιος για να ολοκληρώσει τη δουλειά με το χέρι.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ο πίνακας που θυμάται τι ΔΕΝ σβήστηκε ───────────────────────────────
-- Η στήλη λέγεται `subject_id` και ΟΧΙ `user_id`, σκόπιμα. Το βήμα 1 της
-- `delete_my_account` σαρώνει κάθε πίνακα του `public` με στήλη `user_id` και
-- τον αδειάζει. Με εκείνο το όνομα, μια δεύτερη προσπάθεια διαγραφής θα
-- έσβηνε το ίχνος της πρώτης: το αρχείο της αποτυχίας θα ήταν το πρώτο θύμα
-- της. Για τον ίδιο λόγο δεν υπάρχει FK προς `auth.users`: ένα
-- `on delete cascade` θα το έσβηνε δευτερόλεπτα μετά, στο βήμα 4.
create table if not exists public.account_deletion_incidents (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid        not null,
  occurred_at   timestamptz not null default now(),
  -- Κενό = η διαγραφή δεν πέταξε εξαίρεση, απλώς έμειναν αρχεία πίσω.
  sqlstate      text,
  message       text,
  objects_gone  integer     not null default 0,
  -- Κενό = δεν μετρήθηκε καν (ούτε το `select` πέρασε). Διαφορετικό από 0.
  objects_left  integer,
  buckets       text[]      not null default '{}'
);

comment on table public.account_deletion_incidents is
  'Αρχεία που δεν σβήστηκαν σε διαγραφή λογαριασμού. Κρατά uid, κάδο, πλήθος και σφάλμα. Ποτέ ονόματα αρχείων.';

-- Δύο κλειδαριές, όπως στο 20260808120000: RLS χωρίς πολιτικές αρνείται τα
-- πάντα και τα δικαιώματα των ρόλων πελάτη δεν υπάρχουν καθόλου. Τον γράφει
-- μόνο η SECURITY DEFINER, τον διαβάζει μόνο ο `service_role`.
alter table public.account_deletion_incidents enable row level security;
revoke all on table public.account_deletion_incidents from anon, authenticated;
grant select on table public.account_deletion_incidents to service_role;

create index if not exists account_deletion_incidents_occurred_idx
  on public.account_deletion_incidents (occurred_at desc);


-- ── 2. Η συνάρτηση ─────────────────────────────────────────────────────────
-- Η επιστροφή αλλάζει από `void` σε `json`, άρα χρειάζεται drop: το
-- `create or replace` δεν αλλάζει τύπο επιστροφής. Τα grants φεύγουν μαζί με
-- τη συνάρτηση και ξαναγράφονται παρακάτω, με τον περιορισμό του
-- 20260806120000 (ο `anon` δεν την έχει πια).
drop function if exists public.delete_my_account();

create function public.delete_my_account() returns json
    language plpgsql security definer
    set search_path to 'public'
    as $_$
declare
  uid       uuid := auth.uid();
  t         record;
  prefixes  text[];
  v_gone    int := 0;
  v_left    int;          -- κενό = δεν μετρήθηκε
  v_state   text;
  v_msg     text;
  v_buckets text[] := '{}';
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;

  -- 0) Τα προθέματα των αρχείων, ΠΡΙΝ αδειάσουν οι πίνακες που τα ξέρουν.
  --    `starts_with` και όχι `like`: το token και το όνομα αρχείου δεν τα
  --    ελέγχουμε εμείς και ένα `_` μέσα σε `like` ταιριάζει με οποιονδήποτε
  --    χαρακτήρα, δηλαδή θα μπορούσε να πιάσει αρχείο ΑΛΛΟΥ χρήστη.
  prefixes := array[uid::text || '/'];
  select prefixes || coalesce(array_agg('receipts/' || p.id::text || '/'), '{}'::text[])
    into prefixes from public.user_properties p where p.user_id::text = uid::text;
  select prefixes || coalesce(array_agg(l.token || '/'), '{}'::text[])
    into prefixes from public.portal_links l where l.user_id::text = uid::text;

  -- 1) Κάθε πίνακας του public με στήλη user_id. Το cast μπήκε στο
  --    20260805070000: τρεις πίνακες την έχουν text, όχι uuid.
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id::text = $1', t.table_name) using uid::text;
  end loop;

  -- 2) Τα αρχεία. Η εξαίρεση ΔΕΝ μπλοκάρει τη διαγραφή, αλλά ούτε χάνεται:
  --    το SQLSTATE και το μήνυμα κρατιούνται και γράφονται παρακάτω.
  begin
    delete from storage.objects o
     where o.owner = uid
        or exists (select 1 from unnest(prefixes) pfx where starts_with(o.name, pfx));
    get diagnostics v_gone = row_count;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;

  -- Τι απέμεινε. Ξεχωριστό μπλοκ: το δικαίωμα SELECT μπορεί να υπάρχει και
  -- όταν λείπει το DELETE, οπότε η μέτρηση είναι συχνά η μόνη πληροφορία που
  -- σώζεται από μια αποτυχία.
  begin
    select count(*), coalesce(array_agg(distinct o.bucket_id), '{}'::text[])
      into v_left, v_buckets
      from storage.objects o
     where o.owner = uid
        or exists (select 1 from unnest(prefixes) pfx where starts_with(o.name, pfx));
  exception when others then
    v_left := null;
  end;

  -- 3) Το ίχνος. Γράφεται ΜΟΝΟ όταν υπάρχει κάτι να λογοδοτήσει: μια καθαρή
  --    διαγραφή δεν αφήνει καινούρια προσωπικά δεδομένα πίσω της.
  if v_state is not null or v_left is null or v_left > 0 then
    insert into public.account_deletion_incidents
      (subject_id, sqlstate, message, objects_gone, objects_left, buckets)
    values (uid, v_state, left(coalesce(v_msg, ''), 500), v_gone, v_left, v_buckets);
  end if;

  -- 4) Ο ίδιος ο χρήστης. Ο,τι έχει FK με on delete cascade φεύγει μαζί.
  delete from auth.users where id = uid;

  -- Το `ok` είναι ψευδές και όταν δεν μετρήθηκε: «δεν ξέρω» δεν είναι «ναι».
  return json_build_object(
    -- Το `coalesce` δεν είναι διακοσμητικό: με `v_left` κενό, η σύγκριση
    -- βγάζει null και το json θα έλεγε «ok: null» αντί για ρητό ψευδές.
    'ok',            coalesce(v_state is null and v_left = 0, false),
    'files_deleted', v_gone,
    'files_left',    v_left,
    'error_code',    v_state
  );
end;
$_$;

alter function public.delete_my_account() owner to postgres;
revoke all     on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated, service_role;
