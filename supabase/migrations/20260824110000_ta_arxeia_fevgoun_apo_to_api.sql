-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ΔΕΝ ΕΣΒΗΝΕ ΠΟΤΕ ΚΑΝΕΝΑ ΑΡΧΕΙΟ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ, ΠΙΑΣΜΕΝΟ ΣΕ ΠΡΑΓΜΑΤΙΚΗ ΔΙΑΓΡΑΦΗ (24/08/2026). Η `erase_account`
-- έγραφε `delete from storage.objects`. Η Supabase το απαγορεύει με σκανδάλη,
-- και το `account_deletion_incidents` κράτησε την απόδειξη:
--
--   42501  Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- Η εξαίρεση πιανόταν και καταγραφόταν, οπότε η διαγραφή προχωρούσε. Δηλαδή:
-- ο λογαριασμός έφευγε, κάθε γραμμή του έφευγε, και ΚΑΘΕ ΑΡΧΕΙΟ ΕΜΕΝΕ. Τα
-- μισθωτήρια, οι ταυτότητες, τα παραστατικά, οι φωτογραφίες βλαβών. Ο
-- λογαριασμός που το αποκάλυψε δεν είχε αρχεία, οπότε δεν έχασε τίποτα· ο
-- επόμενος θα έχανε τα πάντα, με μήνυμα που θα έλεγε «διαγράφηκαν».
--
-- ΤΟ ΙΔΙΟ ΙΣΧΥΕ ΚΑΙ ΓΙΑ ΤΟΝ ΑΥΤΟΜΑΤΟ ΚΑΘΑΡΙΣΜΟ, που περνά από την ίδια
-- `erase_account`: ένας λογαριασμός που σβήνεται μετά τις ημέρες χάριτος
-- άφηνε πίσω του ολόκληρο τον φάκελό του, χωρίς κανέναν να τον διεκδικεί.
--
-- ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΔΕΙΞΕ ΚΑΝΕΙΣ ΕΛΕΓΧΟΣ. Το scripts/db-replay.sh τρέχει γυμνό
-- Postgres· η σκανδάλη που απαγορεύει τη διαγραφή ζει στην πλατφόρμα της
-- Supabase και δεν υπάρχει στη σκαλωσιά. Τοπικά το `delete` περνούσε καθαρό.
--
-- ── ΔΥΟ ΔΡΟΜΟΙ, ΓΙΑΤΙ ΟΙ ΔΥΟ ΚΛΗΣΕΙΣ ΕΧΟΥΝ ΑΛΛΑ ΔΙΚΑΙΩΜΑΤΑ ───────────────
-- ΑΥΤΟΔΙΑΓΡΑΦΗ. Η /api/account/delete σβήνει τα αρχεία ΠΡΙΝ καλέσει τη βάση,
-- με τη ΣΥΝΕΔΡΙΑ του χρήστη. Η σειρά είναι υποχρεωτική: οι πολιτικές των κάδων
-- `inventory-docs` και `maintenance-photos` ρωτούν τα `user_properties` και τα
-- `portal_links`, που η διαγραφή αδειάζει. Μετά από αυτήν, ο ίδιος ο άνθρωπος
-- δεν έχει πια δικαίωμα στα δικά του αρχεία.
--
-- ΑΥΤΟΜΑΤΟΣ ΚΑΘΑΡΙΣΜΟΣ. Τρέχει ολόκληρος μέσα στο pg_cron, και η Postgres δεν
-- μιλά στο API αποθήκευσης. Οσα βρει η `erase_account` μπαίνουν σε ΟΥΡΑ, και
-- τη στραγγίζει συνάρτηση άκρης με ρόλο υπηρεσίας, όπως ακριβώς γίνεται ήδη με
-- την ουρά των email. Ενα αρχείο στην ουρά είναι αρχείο που θα φύγει· ένα
-- αρχείο που κανείς δεν κατέγραψε είναι αρχείο που μένει για πάντα.
--
-- ΚΑΙ Η ΟΥΡΑ ΠΙΑΝΕΙ ΚΑΙ ΤΗΝ ΑΥΤΟΔΙΑΓΡΑΦΗ ΠΟΥ ΑΠΕΤΥΧΕ ΣΤΗ ΜΕΣΗ. Αν το πέρασμα
-- της διαδρομής αφήσει έστω ένα αρχείο, η βάση το βρίσκει και το βάζει στην
-- ουρά: δεν υπάρχει δρόμος όπου το αρχείο απλώς ξεχνιέται.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ΤΙ ΕΙΝΑΙ ΔΙΚΟ ΜΟΥ, ΓΡΑΜΜΕΝΟ ΜΙΑ ΦΟΡΑ ────────────────────────────────────
-- `starts_with` και όχι `like`: το διακριτικό και το όνομα αρχείου δεν τα
-- ελέγχουμε εμείς, και ένα `_` μέσα σε `like` ταιριάζει με οποιονδήποτε
-- χαρακτήρα, δηλαδή θα μπορούσε να πιάσει αρχείο ΑΛΛΟΥ χρήστη.
create or replace function private.storage_prefixes(p_uid uuid) returns text[]
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare prefixes text[];
begin
  prefixes := array[p_uid::text || '/'];
  select prefixes || coalesce(array_agg('receipts/' || p.id::text || '/'), '{}'::text[])
    into prefixes from public.user_properties p where p.user_id::text = p_uid::text;
  select prefixes || coalesce(array_agg(l.token || '/'), '{}'::text[])
    into prefixes from public.portal_links l where l.user_id::text = p_uid::text;
  return prefixes;
end $$;

alter function private.storage_prefixes(uuid) owner to postgres;
revoke all on function private.storage_prefixes(uuid) from public, anon, authenticated;

comment on function private.storage_prefixes(uuid) is
  'Τα προθέματα ονομάτων αρχείων που ανήκουν σε έναν χρήστη. Μία πηγή για τον καθαριστή, για την ουρά και για τον μετρητή.';

-- ── ΠΟΙΑ ΑΡΧΕΙΑ ΕΙΝΑΙ ΔΙΚΑ ΜΟΥ ─────────────────────────────────────────────
-- Επιστρέφει κάδο και όνομα, ώστε η διαδρομή να τα δώσει στο API αποθήκευσης.
-- SECURITY DEFINER γιατί το `storage.objects` δεν διαβάζεται ελεύθερα, αλλά το
-- `auth.uid()` κρίνει: κανείς δεν βλέπει τα αρχεία κανενός άλλου.
create or replace function public.my_storage_objects()
    returns table(bucket_id text, name text)
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  uid      uuid := auth.uid();
  prefixes text[];
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;
  prefixes := private.storage_prefixes(uid);
  return query
    select o.bucket_id, o.name
      from storage.objects o
     where o.owner = uid
        or exists (select 1 from unnest(prefixes) pfx where starts_with(o.name, pfx));
end $$;

alter function public.my_storage_objects() owner to postgres;
revoke all     on function public.my_storage_objects() from public, anon;
grant  execute on function public.my_storage_objects() to authenticated, service_role;

comment on function public.my_storage_objects() is
  'Τα αρχεία του συνδεδεμένου χρήστη, κάδος και όνομα. Τα σβήνει η /api/account/delete μέσω του API αποθήκευσης, πριν φύγει ο λογαριασμός.';

-- ── Η ΟΥΡΑ ΤΩΝ ΟΡΦΑΝΩΝ ΑΡΧΕΙΩΝ ─────────────────────────────────────────────
-- Δύο κλειδαριές, όπως στα `account_deletion_incidents`: RLS χωρίς πολιτικές
-- αρνείται τα πάντα, και τα δικαιώματα των ρόλων πελάτη δεν υπάρχουν καθόλου.
-- Τη γράφει μόνο η SECURITY DEFINER, τη διαβάζει μόνο ο `service_role`.
create table if not exists public.storage_purge_queue (
  id         bigint generated always as identity primary key,
  bucket_id  text        not null,
  name       text        not null,
  -- Ο λογαριασμός έχει ΗΔΗ σβηστεί όταν γράφεται η γραμμή, οπότε δεν υπάρχει
  -- ξένο κλειδί να δείξει πουθενά. Κρατιέται μόνο για τα αρχεία καταγραφής.
  subject_id uuid        not null,
  queued_at  timestamptz not null default now(),
  attempts   int         not null default 0,
  last_error text,
  unique (bucket_id, name)
);

comment on table public.storage_purge_queue is
  'Αρχεία σβησμένου λογαριασμού που περιμένουν διαγραφή από το API αποθήκευσης. Η Postgres δεν επιτρέπεται να τα σβήσει μόνη της.';

create index if not exists storage_purge_queue_pending
  on public.storage_purge_queue (attempts, queued_at);

alter table public.storage_purge_queue enable row level security;
revoke all on table public.storage_purge_queue from anon, authenticated;
grant  all on table public.storage_purge_queue to service_role;

-- ── Η ΔΙΑΓΡΑΦΗ ΣΤΑΜΑΤΑ ΝΑ ΠΡΟΣΠΑΘΕΙ ΤΟ ΑΠΑΓΟΡΕΥΜΕΝΟ ────────────────────────
-- Το `files_deleted` έφυγε από τον απολογισμό: η βάση δεν σβήνει πια αρχεία,
-- και ένα πεδίο που έλεγε πάντα μηδέν είναι χειρότερο από πεδίο που λείπει.
-- Στη θέση του μπαίνει το `files_queued`, που λέει κάτι αληθινό: τόσα αρχεία
-- παραδόθηκαν στην ουρά και θα φύγουν με το επόμενο πέρασμα.
create or replace function public.erase_account(p_uid uuid) returns json
    language plpgsql security definer
    set search_path to 'public'
    as $_$
declare
  uid       uuid := p_uid;
  v_email   text;
  t         record;
  prefixes  text[];
  v_queued  int := 0;
  v_state   text;
  v_msg     text;
  v_buckets text[] := '{}';
begin
  if uid is null then
    raise exception 'Δεν δόθηκε λογαριασμός προς διαγραφή';
  end if;

  -- Η διεύθυνση, ΠΡΙΝ φύγει η γραμμή του χρήστη: είναι το μόνο κλειδί που
  -- έχουν οι πίνακες χωρίς `user_id`.
  select lower(btrim(email)) into v_email from auth.users where id = uid;

  -- 0) Τα προθέματα, ΠΡΙΝ αδειάσουν οι πίνακες που τα ξέρουν.
  prefixes := private.storage_prefixes(uid);

  -- 1) ΤΑ ΑΡΧΕΙΑ ΠΑΝΕ ΣΤΗΝ ΟΥΡΑ, ΚΑΙ ΠΑΛΙ ΠΡΙΝ ΑΔΕΙΑΣΟΥΝ ΟΙ ΠΙΝΑΚΕΣ.
  --    Ξεχωριστό μπλοκ: μια αποτυχία εδώ δεν επιτρέπεται να μπλοκάρει το
  --    δικαίωμα διαγραφής (άρθρο 17 GDPR). Καταγράφεται και προχωράμε.
  begin
    with mine as (
      select o.bucket_id, o.name
        from storage.objects o
       where o.owner = uid
          or exists (select 1 from unnest(prefixes) pfx where starts_with(o.name, pfx))
    ), put as (
      insert into public.storage_purge_queue (bucket_id, name, subject_id)
      select m.bucket_id, m.name, uid from mine m
      on conflict (bucket_id, name) do nothing
      returning 1
    )
    select (select count(*) from put), (select coalesce(array_agg(distinct m.bucket_id), '{}'::text[]) from mine m)
      into v_queued, v_buckets;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    v_queued := 0;
  end;

  -- 2) Κάθε πίνακας του public με στήλη user_id. Το cast μπήκε στο
  --    20260805070000: τρεις πίνακες την έχουν text, όχι uuid.
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
      and c.table_name <> 'storage_purge_queue'
  loop
    execute format('delete from public.%I where user_id::text = $1', t.table_name) using uid::text;
  end loop;

  -- 2β) ΚΑΙ ΟΣΟΙ ΚΡΑΤΟΥΝ ΤΗ ΔΙΕΥΘΥΝΣΗ ΑΝΤΙ ΓΙΑ ΤΟΝ ΧΡΗΣΤΗ.
  if v_email is not null and v_email <> '' then
    delete from public.email_outbox where lower(btrim(to_email)) = v_email;
    delete from public.app_admins   where lower(btrim(email))    = v_email;
  end if;

  -- 3) Το ίχνος. Γράφεται ΜΟΝΟ όταν υπάρχει κάτι να λογοδοτήσει, και αυτό
  --    πλέον σημαίνει ένα και μόνο πράγμα: δεν καταφέραμε ούτε να ΔΟΥΜΕ ποια
  --    είναι τα αρχεία. Οσα είδαμε είναι στην ουρά, δηλαδή δεν χάθηκαν.
  if v_state is not null then
    insert into public.account_deletion_incidents
      (subject_id, sqlstate, message, objects_gone, objects_left, buckets)
    values (uid, v_state, left(coalesce(v_msg, ''), 500), 0, null, v_buckets);
  end if;

  -- 4) Ο ίδιος ο χρήστης. Ο,τι έχει FK με on delete cascade φεύγει μαζί.
  delete from auth.users where id = uid;

  return json_build_object(
    'ok',           v_state is null,
    'files_queued', v_queued,
    'error_code',   v_state
  );
end;
$_$;

alter function public.erase_account(uuid) owner to postgres;
revoke all     on function public.erase_account(uuid) from public, anon, authenticated;
grant  execute on function public.erase_account(uuid) to service_role;

-- ── ΤΟ ΣΤΡΑΓΓΙΣΜΑ ΤΗΣ ΟΥΡΑΣ, ΑΠΟ ΤΗ ΜΕΡΙΑ ΤΗΣ ΒΑΣΗΣ ───────────────────────
-- Η συνάρτηση άκρης παίρνει παρτίδα, τη δίνει στο API αποθήκευσης, και λέει
-- μετά τι πέρασε. Το `attempts` ανεβαίνει σε κάθε αποτυχία, ώστε ένα αρχείο
-- που αρνείται για πάντα να μη μονοπωλεί κάθε πέρασμα.
create or replace function public.storage_purge_batch(p_limit int default 200)
    returns table(id bigint, bucket_id text, name text)
    language sql security definer
    set search_path to 'public'
    as $$
  select q.id, q.bucket_id, q.name
    from public.storage_purge_queue q
   where q.attempts < 5
   order by q.attempts, q.queued_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;

alter function public.storage_purge_batch(int) owner to postgres;
revoke all     on function public.storage_purge_batch(int) from public, anon, authenticated;
grant  execute on function public.storage_purge_batch(int) to service_role;

create or replace function public.storage_purge_done(p_ids bigint[], p_error text default null)
    returns int
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare n int := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  if p_error is null or btrim(p_error) = '' then
    delete from public.storage_purge_queue where id = any(p_ids);
    get diagnostics n = row_count;
  else
    update public.storage_purge_queue
       set attempts = attempts + 1, last_error = left(p_error, 500)
     where id = any(p_ids);
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

alter function public.storage_purge_done(bigint[], text) owner to postgres;
revoke all     on function public.storage_purge_done(bigint[], text) from public, anon, authenticated;
grant  execute on function public.storage_purge_done(bigint[], text) to service_role;

comment on function public.storage_purge_batch(int) is
  'Η επόμενη παρτίδα ορφανών αρχείων προς διαγραφή. Την τραβά η συνάρτηση άκρης purge-orphan-files.';
comment on function public.storage_purge_done(bigint[], text) is
  'Σβήνει από την ουρά όσα έφυγαν, ή σημειώνει την αποτυχία τους. Πέντε αποτυχίες και το αρχείο βγαίνει από τη σειρά.';

-- ── ΚΑΙ ΤΟ ΧΡΟΝΟΜΕΤΡΟ ΠΟΥ ΤΗ ΣΤΡΑΓΓΙΖΕΙ ────────────────────────────────────
-- Κάθε δεκαπέντε λεπτά. Οχι μία φορά την ημέρα: μια ουρά που περιμένει ώρες
-- σημαίνει προσωπικά αρχεία που ζουν ώρες μετά τη διαγραφή που τα κατάργησε.
-- Οχι κάθε λεπτό: τις περισσότερες φορές δεν υπάρχει τίποτα να στραγγιστεί.
do $$
declare
  v_base text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
    'https://aromvduuxtcrzmwwvnej.supabase.co');
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'purge-orphan-files') then
    perform cron.unschedule('purge-orphan-files');
  end if;
  perform cron.schedule('purge-orphan-files', '*/15 * * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron' limit 1)),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/purge-orphan-files'));
end $$;
