-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΕΥΘΥΝΣΗ ΠΟΥ ΔΕΧΕΤΑΙ ΛΟΓΑΡΙΑΣΜΟΥΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Ο λογαριασμός της ΔΕΗ έρχεται με email. Η δαπάνη
-- καταχωρείται με το χέρι: άνοιγμα εφαρμογής, εύρεση ακινήτου, Δαπάνες, νέα
-- δαπάνη, ποσό, ημερομηνία, κατηγορία, αποθήκευση. Οκτώ κινήσεις για κάτι που
-- ήδη έφτασε γραμμένο. Οποιος τις κάνει δώδεκα φορές τον χρόνο, τις σταματά
-- τον τρίτο μήνα — και τότε τα βιβλία δεν λένε πια την αλήθεια.
--
-- ΤΩΡΑ: κάθε λογαριασμός έχει δική του ιδιωτική διεύθυνση. Ο ιδιοκτήτης
-- προωθεί εκεί το μήνυμα και η πρόταση δαπάνης τον περιμένει μέσα στην
-- εφαρμογή, με ποσό, ημερομηνία και κατηγορία διαβασμένα.
--
-- ── ΔΥΟ ΠΙΝΑΚΕΣ, ΚΑΙ Ο ΛΟΓΟΣ ΤΟΥΣ ────────────────────────────────────────
--
-- `inbound_mailboxes`: ένα κουπόνι ανά λογαριασμό. Γεννιέται ΜΑΖΙ με τον
-- λογαριασμό, όπως η γραμμή ειδοποιήσεων (20260819140000) και η γραμμή
-- χρέωσης (20260820200000). Οποιος τη γεννά τεμπέλικα, τη γεννά και λάθος
-- κάποια στιγμή: εδώ η «λάθος στιγμή» θα ήταν ένα μήνυμα που έφτασε σε
-- διεύθυνση χωρίς ιδιοκτήτη, δηλαδή ένας λογαριασμός που χάθηκε σιωπηλά.
--
-- `inbound_messages`: η ΟΥΡΑ. Οτι φτάνει ΔΕΝ γίνεται δαπάνη μόνο του.
--
-- ── ΓΙΑΤΙ ΟΥΡΑ ΚΑΙ ΟΧΙ ΑΠΕΥΘΕΙΑΣ ΔΑΠΑΝΗ ──────────────────────────────────
-- Το κουπόνι είναι μυστικό, ΟΧΙ απόδειξη ταυτότητας: ταξιδεύει σε κάθε
-- κεφαλίδα κάθε προωθημένου μηνύματος και μπορεί να βρεθεί σε λάθος χέρια. Αν
-- το εισερχόμενο γινόταν αμέσως δαπάνη, ένα κλεμμένο κουπόνι θα έγραφε ό,τι
-- ήθελε στα φορολογικά βιβλία κάποιου. Με την ουρά, το χειρότερο που μπορεί
-- να συμβεί είναι θόρυβος που ο ιδιοκτήτης απορρίπτει με ένα πάτημα.
--
-- Και ο δεύτερος λόγος είναι η ίδια η ανάγνωση: το ποσό ενός λογαριασμού
-- διαβάζεται από κείμενο, και το κείμενο κάποτε δεν λέει καθαρά. Η εφαρμογή
-- δεν μαντεύει ποτέ αριθμό που θα μπει σε φορολογική δήλωση.
--
-- ── ΤΑ ΔΕΔΟΜΕΝΑ ΤΗΣ ΑΝΑΓΝΩΣΗΣ ΔΕΝ ΑΛΛΑΖΟΥΝ ΑΠΟ ΤΟΝ ΠΕΛΑΤΗ ────────────────
-- Ο χρήστης αλλάζει ΜΟΝΟ την κατάσταση («καταχωρήθηκε», «απορρίφθηκε») και
-- δηλώνει ποια δαπάνη γεννήθηκε. Το τι έγραφε το μήνυμα είναι ΙΣΤΟΡΙΚΟ: αν
-- μπορούσε να ξαναγραφτεί από την οθόνη, δεν θα ήταν πια απόδειξη του τι ήρθε.
-- Το επιβάλλει σκανδάλη, όχι η καλή πρόθεση της οθόνης.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Το κουπόνι ─────────────────────────────────────────────────────────────
create table if not exists public.inbound_mailboxes (
  user_id    uuid primary key not null references auth.users(id) on delete cascade,
  token      text not null unique check (token ~ '^[0-9a-f]{16}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

comment on table public.inbound_mailboxes is
  'Η ιδιωτική διεύθυνση κάθε λογαριασμού για εισερχόμενους λογαριασμούς. Το κουπόνι είναι το τοπικό μέρος της διεύθυνσης.';
comment on column public.inbound_mailboxes.token is
  'Δεκαέξι δεκαεξαδικά ψηφία, δηλαδή 64 δυαδικά. Μυστικό, όχι απόδειξη ταυτότητας: γι'' αυτό ό,τι φτάνει πάει σε ουρά.';

alter table public.inbound_mailboxes enable row level security;

drop policy if exists inbound_mailboxes_own on public.inbound_mailboxes;
create policy inbound_mailboxes_own on public.inbound_mailboxes
  for select using ((select auth.uid()) = user_id);

-- ΚΑΜΙΑ ΠΟΛΙΤΙΚΗ ΕΓΓΡΑΦΗΣ, ΕΠΙΤΗΔΕΣ. Το κουπόνι δεν το διαλέγει ο χρήστης:
-- θα μπορούσε να γράψει το κουπόνι ΑΛΛΟΥ και να παραλαμβάνει τα μηνύματά του.
-- Η γέννηση γίνεται με σκανδάλη, η αλλαγή με τη συνάρτηση παρακάτω.

-- ── Η ουρά ─────────────────────────────────────────────────────────────────
create table if not exists public.inbound_messages (
  id           uuid primary key not null default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Το αναγνωριστικό του παρόχου. Κάνει την παραλαβή ιδιοδύναμη: το ίδιο
  -- μήνυμα σταλμένο δύο φορές (επανάληψη webhook) δεν γίνεται δύο προτάσεις.
  provider_id  text not null,
  received_at  timestamptz not null default now(),
  from_address text,
  subject      text,
  vendor       text,
  amount       numeric(10,2),
  due_date     date,
  issue_date   date,
  category     text,
  expense_group text,
  attachments  integer not null default 0,
  -- pending: περιμένει τον άνθρωπο · filed: έγινε δαπάνη · dismissed: απορρίφθηκε
  status       text not null default 'pending'
                 check (status in ('pending', 'filed', 'dismissed')),
  expense_id   uuid references public.expenses(id) on delete set null,
  unique (user_id, provider_id)
);

comment on table public.inbound_messages is
  'Ουρά εισερχομένων: τι έφτασε στην ιδιωτική διεύθυνση και τι διαβάστηκε. Καμία γραμμή δεν γίνεται δαπάνη χωρίς πάτημα ανθρώπου.';

create index if not exists inbound_messages_pending
  on public.inbound_messages (user_id, received_at desc)
  where status = 'pending';

-- ΚΑΘΕ ΞΕΝΟ ΚΛΕΙΔΙ ΘΕΛΕΙ ΕΥΡΕΤΗΡΙΟ. Χωρίς αυτό, το σβήσιμο ενός λογαριασμού ή
-- μιας δαπάνης σαρώνει ολόκληρο τον πίνακα για να βρει τι κρέμεται από πάνω.
create index if not exists inbound_messages_user
  on public.inbound_messages (user_id);
create index if not exists inbound_messages_expense
  on public.inbound_messages (expense_id);

alter table public.inbound_messages enable row level security;

drop policy if exists inbound_messages_own on public.inbound_messages;
create policy inbound_messages_own on public.inbound_messages
  for select using ((select auth.uid()) = user_id);

drop policy if exists inbound_messages_own_upd on public.inbound_messages;
create policy inbound_messages_own_upd on public.inbound_messages
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists inbound_messages_own_del on public.inbound_messages;
create policy inbound_messages_own_del on public.inbound_messages
  for delete using ((select auth.uid()) = user_id);

-- ΚΑΜΙΑ ΠΟΛΙΤΙΚΗ ΕΙΣΑΓΩΓΗΣ. Γράφει μόνο ο διακομιστής, αφού επαληθεύσει την
-- υπογραφή του παρόχου. Χωρίς αυτό, οποιοσδήποτε συνδεδεμένος θα μπορούσε να
-- φυτέψει «εισερχόμενο» στον εαυτό του — δηλαδή να πει ότι ήρθε κάτι που ποτέ
-- δεν ήρθε, και να το κρατήσει ως τεκμήριο.

-- ── Τα δεδομένα της ανάγνωσης είναι ιστορικό ───────────────────────────────
create or replace function public.lock_inbound_facts()
returns trigger
language plpgsql
as $$
begin
  if new.provider_id  is distinct from old.provider_id
  or new.user_id      is distinct from old.user_id
  or new.received_at  is distinct from old.received_at
  or new.from_address is distinct from old.from_address
  or new.subject      is distinct from old.subject
  or new.vendor       is distinct from old.vendor
  or new.amount       is distinct from old.amount
  or new.due_date     is distinct from old.due_date
  or new.issue_date   is distinct from old.issue_date
  or new.attachments  is distinct from old.attachments then
    raise exception 'INBOUND_READONLY: το τι έγραφε το μήνυμα δεν ξαναγράφεται'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.lock_inbound_facts() is
  'Το περιεχόμενο του εισερχομένου είναι απόδειξη του τι ήρθε. Αλλάζει μόνο η κατάσταση και η δαπάνη που γεννήθηκε.';

drop trigger if exists trg_lock_inbound_facts on public.inbound_messages;
create trigger trg_lock_inbound_facts
  before update on public.inbound_messages
  for each row execute function public.lock_inbound_facts();

-- ── Το κουπόνι γεννιέται μαζί με τον λογαριασμό ────────────────────────────
create or replace function public.new_inbound_token()
returns text
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  candidate text;
  tries int := 0;
begin
  loop
    candidate := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    exit when not exists (select 1 from public.inbound_mailboxes where token = candidate);
    tries := tries + 1;
    -- Σε 64 δυαδικά η σύγκρουση είναι θεωρητική. Το όριο υπάρχει ώστε ένα
    -- απρόβλεπτο (π.χ. σπασμένη γεννήτρια τυχαίων) να σκάσει αντί να κρεμάσει.
    if tries > 8 then
      raise exception 'INBOUND_TOKEN: δεν βρέθηκε ελεύθερο κουπόνι σε 8 προσπάθειες';
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.new_inbound_token() from public, anon, authenticated;

create or replace function public.ensure_inbound_mailbox()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  insert into public.inbound_mailboxes (user_id, token)
  values (new.id, public.new_inbound_token())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_inbound_mailbox() from public, anon, authenticated;

drop trigger if exists trg_ensure_inbound_mailbox on auth.users;
create trigger trg_ensure_inbound_mailbox
  after insert on auth.users
  for each row execute function public.ensure_inbound_mailbox();

-- Αναδρομικά, για όσους λογαριασμούς υπάρχουν ήδη. Ιδιοδύναμο.
insert into public.inbound_mailboxes (user_id, token)
select u.id, public.new_inbound_token()
  from auth.users u
 where u.deleted_at is null
   and not exists (select 1 from public.inbound_mailboxes m where m.user_id = u.id)
on conflict (user_id) do nothing;

-- ── Η αλλαγή διεύθυνσης, όταν η παλιά διέρρευσε ────────────────────────────
-- Το κουπόνι μπορεί να βρεθεί σε λάθος χέρια: αρκεί ένα προωθημένο μήνυμα σε
-- λάθος παραλήπτη. Ο ιδιοκτήτης πρέπει να μπορεί να το αλλάξει ΜΟΝΟΣ ΤΟΥ, την
-- ίδια στιγμή, χωρίς να ζητήσει τίποτα από κανέναν. Η παλιά διεύθυνση παύει να
-- υπάρχει αμέσως· τα ήδη εισερχόμενα μένουν.
create or replace function public.rotate_inbound_mailbox()
returns text
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  fresh text;
begin
  if uid is null then
    raise exception 'INBOUND_ANON: χωρίς σύνδεση δεν αλλάζει διεύθυνση'
      using errcode = 'insufficient_privilege';
  end if;
  fresh := public.new_inbound_token();
  insert into public.inbound_mailboxes (user_id, token, rotated_at)
  values (uid, fresh, now())
  on conflict (user_id) do update
    set token = excluded.token, rotated_at = now(), active = true;
  return fresh;
end;
$$;

revoke all on function public.rotate_inbound_mailbox() from public, anon;
grant execute on function public.rotate_inbound_mailbox() to authenticated;

comment on function public.rotate_inbound_mailbox() is
  'Νέα ιδιωτική διεύθυνση για τον συνδεδεμένο χρήστη. Η παλιά παύει να παραλαμβάνει αμέσως.';
