-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΠΡΟΘΕΣΜΙΕΣ ΦΕΥΓΟΥΝ ΣΤΟ ΗΜΕΡΟΛΟΓΙΟ ΠΟΥ ΗΔΗ ΚΟΙΤΑΖΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ
-- ─────────────────────────────────────────────────────────────────────────
-- Η εφαρμογή ξέρει πότε λήγει ο λογαριασμός, πότε μπαίνει το ενοίκιο, πότε
-- λήγει η ασφάλεια. Και τα λέει ΜΟΝΟ σε όποιον την ανοίξει. Ο άνθρωπος όμως
-- ζει στο ημερολόγιο του κινητού του.
--
-- Ο μηχανισμός υπήρχε ήδη ΑΝΤΙΣΤΡΟΦΑ: η εφαρμογή διαβάζει iCal από Airbnb και
-- Booking για τις διαμονές. Το ίδιο πρωτόκολλο, προς την άλλη κατεύθυνση.
--
-- ── ΤΟ ΚΟΥΠΟΝΙ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΟ ΑΠΟ ΤΟ ΚΟΥΠΟΝΙ ΤΟΥ EMAIL ─────────────────
-- Θα ήταν βολικό να μοιραστούν ένα. Θα σήμαινε όμως ότι όποιος πάρει τη
-- διεύθυνση του ημερολογίου —και αυτή ταξιδεύει σε ρυθμίσεις τηλεφώνου, σε
-- Google, σε αντίγραφα ασφαλείας— αποκτά και τη διεύθυνση που δέχεται
-- λογαριασμούς. Δύο ρίσκα, δύο κουπόνια, δύο κουμπιά αλλαγής.
--
-- ── Η ΓΕΝΝΗΤΡΙΑ ΚΟΥΠΟΝΙΩΝ ΓΙΝΕΤΑΙ ΜΙΑ ─────────────────────────────────────
-- Η `new_inbound_token()` έγραφε ήδη τον ίδιο βρόχο. Δεύτερο αντίγραφο για το
-- ημερολόγιο θα ήταν δύο ορισμοί του «τι είναι κουπόνι», με δύο μήκη κάποια
-- στιγμή. Η `random_hex_token()` δίνει τα ψηφία· κάθε πίνακας κρατά τον δικό
-- του βρόχο μοναδικότητας, γιατί μόνο αυτός ξέρει πού να κοιτάξει.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Τα ψηφία, μία φορά ─────────────────────────────────────────────────────
create or replace function public.random_hex_token()
returns text
language sql
volatile
security definer
set search_path = 'public', 'pg_temp'
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
$$;

revoke all on function public.random_hex_token() from public, anon, authenticated;

comment on function public.random_hex_token() is
  'Δεκαέξι δεκαεξαδικά ψηφία, δηλαδή 64 δυαδικά. Η μοναδικότητα ελέγχεται από τον πίνακα που το χρησιμοποιεί.';

-- Η γεννήτρια των εισερχομένων στηρίζεται πλέον στην κοινή, χωρίς να αλλάξει
-- ούτε ένα κουπόνι που υπάρχει ήδη.
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
    candidate := public.random_hex_token();
    exit when not exists (select 1 from public.inbound_mailboxes where token = candidate);
    tries := tries + 1;
    if tries > 8 then
      raise exception 'INBOUND_TOKEN: δεν βρέθηκε ελεύθερο κουπόνι σε 8 προσπάθειες';
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.new_inbound_token() from public, anon, authenticated;

-- ── Η συνδρομή ─────────────────────────────────────────────────────────────
create table if not exists public.calendar_feeds (
  user_id    uuid primary key not null references auth.users(id) on delete cascade,
  token      text not null unique check (token ~ '^[0-9a-f]{16}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

comment on table public.calendar_feeds is
  'Η ιδιωτική διεύθυνση iCal κάθε λογαριασμού. Οποιος την έχει, ΔΙΑΒΑΖΕΙ τις προθεσμίες — δεν γράφει τίποτα.';

alter table public.calendar_feeds enable row level security;

drop policy if exists calendar_feeds_own on public.calendar_feeds;
create policy calendar_feeds_own on public.calendar_feeds
  for select using ((select auth.uid()) = user_id);

-- ΚΑΜΙΑ ΠΟΛΙΤΙΚΗ ΕΓΓΡΑΦΗΣ, ΓΙΑ ΤΟΝ ΙΔΙΟ ΛΟΓΟ ΜΕ ΤΑ ΕΙΣΕΡΧΟΜΕΝΑ: όποιος
-- μπορεί να γράψει κουπόνι, μπορεί να βάλει το ΔΙΚΟ ΤΟΥ στη γραμμή ενός άλλου
-- και να διαβάζει τις προθεσμίες του.

create or replace function public.new_calendar_token()
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
    candidate := public.random_hex_token();
    exit when not exists (select 1 from public.calendar_feeds where token = candidate);
    tries := tries + 1;
    if tries > 8 then
      raise exception 'CALENDAR_TOKEN: δεν βρέθηκε ελεύθερο κουπόνι σε 8 προσπάθειες';
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.new_calendar_token() from public, anon, authenticated;

create or replace function public.ensure_calendar_feed()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  insert into public.calendar_feeds (user_id, token)
  values (new.id, public.new_calendar_token())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_calendar_feed() from public, anon, authenticated;

drop trigger if exists trg_ensure_calendar_feed on auth.users;
create trigger trg_ensure_calendar_feed
  after insert on auth.users
  for each row execute function public.ensure_calendar_feed();

-- Αναδρομικά, για όσους λογαριασμούς υπάρχουν ήδη. Ιδιοδύναμο.
insert into public.calendar_feeds (user_id, token)
select u.id, public.new_calendar_token()
  from auth.users u
 where u.deleted_at is null
   and not exists (select 1 from public.calendar_feeds c where c.user_id = u.id)
on conflict (user_id) do nothing;

-- ── Η αλλαγή διεύθυνσης ────────────────────────────────────────────────────
-- Η διεύθυνση του ημερολογίου κάθεται στις ρυθμίσεις κάθε συσκευής όπου
-- προστέθηκε. Οταν μια συσκευή χαθεί ή ένας συνεργάτης φύγει, ο ιδιοκτήτης
-- πρέπει να μπορεί να την ακυρώσει ΜΟΝΟΣ ΤΟΥ, την ίδια στιγμή.
create or replace function public.rotate_calendar_feed()
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
    raise exception 'CALENDAR_ANON: χωρίς σύνδεση δεν αλλάζει διεύθυνση'
      using errcode = 'insufficient_privilege';
  end if;
  fresh := public.new_calendar_token();
  insert into public.calendar_feeds (user_id, token, rotated_at)
  values (uid, fresh, now())
  on conflict (user_id) do update
    set token = excluded.token, rotated_at = now(), active = true;
  return fresh;
end;
$$;

revoke all on function public.rotate_calendar_feed() from public, anon;
grant execute on function public.rotate_calendar_feed() to authenticated;

comment on function public.rotate_calendar_feed() is
  'Νέα διεύθυνση iCal για τον συνδεδεμένο χρήστη. Η παλιά παύει να απαντά αμέσως.';
