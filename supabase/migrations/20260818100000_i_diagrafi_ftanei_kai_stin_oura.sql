-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ΦΤΑΝΕΙ ΚΑΙ ΣΤΗΝ ΟΥΡΑ ΤΩΝ EMAIL
-- ─────────────────────────────────────────────────────────────────────────
-- Η `delete_my_account` σβήνει «κάθε πίνακα του public με στήλη `user_id`».
-- Είναι έξυπνος κανόνας —δεν γερνά όταν προστίθεται πίνακας— αλλά ΔΕΝ είναι
-- ολόκληρος ο κανόνας: υπάρχουν πίνακες που κρατούν προσωπικά δεδομένα και
-- ΔΕΝ έχουν `user_id`.
--
-- ΤΙ ΕΠΙΖΟΥΣΕ ΤΗΣ ΔΙΑΓΡΑΦΗΣ:
--
--   `email_outbox`  — `to_email`, `to_name` και `params` (json με ονόματα,
--                     ποσά, ονόματα ακινήτων). Κλειδώνεται στη διεύθυνση, όχι
--                     στον χρήστη. Ο λογαριασμός έφευγε, η ουρά κρατούσε το
--                     email και το περιεχόμενο — και, χειρότερα, ένα
--                     προγραμματισμένο μήνυμα μπορούσε να ΣΤΑΛΕΙ σε κάποιον
--                     που είχε ζητήσει διαγραφή.
--   `app_admins`    — τη διεύθυνση του διαχειριστή, χωρίς κανένα FK.
--
-- Το άρθρο 17 δεν ξεχωρίζει πίνακες με ωραίο σχήμα από πίνακες χωρίς.
--
-- ΤΙ ΔΕΝ ΑΛΛΑΖΕΙ. Το `account_deletion_incidents.subject_id` ΜΕΝΕΙ: είναι το
-- ίχνος ότι η ίδια η διαγραφή δεν ολοκληρώθηκε καθαρά, δηλαδή η λογοδοσία της.
-- Το να σβήνει μαζί θα έσβηνε την απόδειξη του προβλήματος.
--
-- Ολα τα υπόλοιπα («organizations», «referrals», «accountant_clients»,
-- «accountant_requests») κρεμιούνται από `auth.users` με ON DELETE CASCADE και
-- φεύγουν στο βήμα 4. Επαληθεύτηκε ένα προς ένα, δεν υποτέθηκε.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account() returns json
    language plpgsql security definer
    set search_path to 'public'
    as $_$
declare
  uid       uuid := auth.uid();
  v_email   text;
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

  -- Η διεύθυνση, ΠΡΙΝ φύγει η γραμμή του χρήστη: είναι το μόνο κλειδί που
  -- έχουν οι πίνακες χωρίς `user_id`.
  select lower(btrim(email)) into v_email from auth.users where id = uid;

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

  -- 1β) ΚΑΙ ΟΣΟΙ ΚΡΑΤΟΥΝ ΤΗ ΔΙΕΥΘΥΝΣΗ ΑΝΤΙ ΓΙΑ ΤΟΝ ΧΡΗΣΤΗ.
  --     Ο έλεγχος πληρότητας στο τέλος αυτού του αρχείου δεν αφήνει να
  --     προστεθεί τρίτος τέτοιος πίνακας χωρίς να περάσει από εδώ.
  if v_email is not null and v_email <> '' then
    delete from public.email_outbox where lower(btrim(to_email)) = v_email;
    delete from public.app_admins   where lower(btrim(email))    = v_email;
  end if;

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

comment on function public.delete_my_account() is
  'Διαγράφει τον συνδεδεμένο χρήστη: κάθε πίνακα με user_id, τους πίνακες που '
  'κρατούν τη ΔΙΕΥΘΥΝΣΗ αντί για τον χρήστη (email_outbox, app_admins), τα '
  'αρχεία του και τέλος τη γραμμή στο auth.users με τα cascade της.';

-- ── Ο ΕΛΕΓΧΟΣ ΠΟΥ ΔΕΝ ΑΦΗΝΕΙ ΤΟ ΚΕΝΟ ΝΑ ΞΑΝΑΝΟΙΞΕΙ ────────────────────────
-- Η λίστα από πάνω είναι γραμμένη με το χέρι, άρα θα ξεχάσει. Αντί να την
-- εμπιστευτούμε, τη ΡΩΤΑΜΕ τον κατάλογο: ποιος πίνακας κρατά διεύθυνση email
-- χωρίς να κρεμιέται από χρήστη; Οποιος βρεθεί και δεν είναι ονομαστική
-- εξαίρεση, σταματά τη μετανάστευση — τη στιγμή που γράφεται, όχι τον μήνα
-- που θα ζητήσει κάποιος διαγραφή.
do $check$
declare
  v_orphans text;
begin
  select string_agg(distinct c.table_name || '.' || c.column_name, ', ')
    into v_orphans
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
   where c.table_schema = 'public'
     and tb.table_type = 'BASE TABLE'
     and c.data_type in ('text', 'character varying')
     and (c.column_name = 'email' or c.column_name like '%\_email')
     -- κρέμεται από χρήστη με άλλο όνομα στήλης; τότε φεύγει με τα cascade
     and not exists (
       select 1 from information_schema.columns u
        where u.table_schema = 'public' and u.table_name = c.table_name
          and u.column_name in ('user_id', 'owner_id', 'owner_user_id',
                                'accountant_id', 'subject_id', 'property_id')
     )
     -- …ή το χειρίζεται ήδη το βήμα 1β
     and c.table_name not in ('email_outbox', 'app_admins');

  if v_orphans is not null then
    raise exception using
      message = 'Πίνακες με διεύθυνση email που ΔΕΝ φεύγουν στη διαγραφή λογαριασμού: ' || v_orphans,
      hint    = 'Πρόσθεσέ τους στο βήμα 1β της delete_my_account ή δώσ'' τους στήλη χρήστη με FK on delete cascade.';
  end if;
end $check$;
