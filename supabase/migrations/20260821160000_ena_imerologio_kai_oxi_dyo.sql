-- ═══════════════════════════════════════════════════════════════════════════
-- ΕΝΑ ΗΜΕΡΟΛΟΓΙΟ, ΟΧΙ ΔΥΟ — ΚΑΙ Η ΓΡΑΜΜΗ ΓΕΝΝΙΕΤΑΙ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΕΓΙΝΕ ΛΑΘΟΣ, ΓΡΑΜΜΕΝΟ ΚΑΘΑΡΑ. Η προηγούμενη μετανάστευση
-- (20260821140000) έφτιαξε πίνακα `calendar_feeds` για τη συνδρομή iCal. Ο
-- πίνακας ΥΠΗΡΧΕ ΗΔΗ, με άλλο όνομα: `calendar_feed_tokens`, από το baseline,
-- και τον χρησιμοποιεί ζωντανά η «Ζωντανή συνδρομή» του Ημερολογίου. Δύο
-- πίνακες για το ίδιο μυστικό σημαίνει δύο διευθύνσεις ανά χρήστη, δύο κουμπιά
-- ακύρωσης, και μία από τις δύο να μένει ζωντανή όταν ο χρήστης ακυρώσει την
-- άλλη. Ο νέος φεύγει.
--
-- ΤΙ ΚΡΑΤΙΕΤΑΙ ΑΠΟ ΤΗ ΔΟΥΛΕΙΑ ΕΚΕΙΝΗ, ΚΑΙ ΓΙΑΤΙ:
--
--   Η ΓΡΑΜΜΗ ΓΕΝΝΙΕΤΑΙ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ. Το κουπόνι δημιουργούνταν ΤΕΜΠΕΛΙΚΑ,
--   την πρώτη φορά που κάποιος άνοιγε το παράθυρο συνδρομής στο Ημερολόγιο.
--   Ιδιο ακριβώς σφάλμα με τη γραμμή χρέωσης (20260820200000) και τη γραμμή
--   ειδοποιήσεων (20260819140000): όποιος δεν πέρασε από εκείνη την οθόνη δεν
--   είχε διεύθυνση, και καμία άλλη οθόνη δεν μπορούσε να του τη δείξει.
--
--   Η ΑΛΛΑΓΗ ΔΙΕΥΘΥΝΣΗΣ ΥΠΑΡΧΕΙ. Ο πίνακας έχει πολιτικές select, insert και
--   delete — ΚΑΜΙΑ update. Δηλαδή ο χρήστης δεν μπορούσε να ακυρώσει τον
--   σύνδεσμο που έδωσε: μόνο να τον σβήσει και να φτιάξει νέο, κίνηση που
--   καμία οθόνη δεν πρόσφερε. Ο σύνδεσμος ζούσε για πάντα, σε κάθε συσκευή
--   όπου είχε προστεθεί.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ο διπλός πίνακας φεύγει, με ό,τι κρεμόταν από πάνω του ────────────────
drop trigger if exists trg_ensure_calendar_feed on auth.users;
drop function if exists public.ensure_calendar_feed();
drop function if exists public.rotate_calendar_feed();
drop function if exists public.new_calendar_token();
drop table if exists public.calendar_feeds;

-- ── Η γραμμή γεννιέται μαζί με τον λογαριασμό ─────────────────────────────
-- ΜΟΝΟ το user_id. Το κουπόνι το δίνει η προεπιλογή του πίνακα, ώστε να μην
-- υπάρξει δεύτερος ορισμός του «τι είναι κουπόνι ημερολογίου».
create or replace function public.ensure_calendar_feed_token()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  insert into public.calendar_feed_tokens (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_calendar_feed_token() from public, anon, authenticated;

comment on function public.ensure_calendar_feed_token() is
  'Γεννά τη διεύθυνση ημερολογίου μαζί με τον λογαριασμό. Χωρίς αυτήν, τη γεννούσε μόνο το παράθυρο συνδρομής του Ημερολογίου.';

drop trigger if exists trg_ensure_calendar_feed_token on auth.users;
create trigger trg_ensure_calendar_feed_token
  after insert on auth.users
  for each row execute function public.ensure_calendar_feed_token();

insert into public.calendar_feed_tokens (user_id)
select u.id from auth.users u
 where u.deleted_at is null
   and not exists (select 1 from public.calendar_feed_tokens t where t.user_id = u.id)
on conflict (user_id) do nothing;

-- ── Η ακύρωση της διεύθυνσης ──────────────────────────────────────────────
-- Η συνάρτηση γράφει, ενώ ο χρήστης δεν έχει πολιτική update: αυτό είναι το
-- ζητούμενο. Η αλλαγή γίνεται ΜΟΝΟ με αυτόν τον ελεγχόμενο δρόμο, ώστε κανείς
-- να μη βάλει δικό του κουπόνι στη γραμμή άλλου.
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
  fresh := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.calendar_feed_tokens (user_id, token)
  values (uid, fresh)
  -- ΚΑΙ Η ΛΗΞΗ ΞΑΝΑΜΕΤΡΑΕΙ. Το `expires_at` έχει προεπιλογή δύο χρόνια
  -- (20260723100000). Χωρίς αυτή τη γραμμή, η νέα διεύθυνση θα κληρονομούσε τη
  -- λήξη της παλιάς: κάποιος που αλλάζει κουπόνι επειδή διέρρευσε, θα έπαιρνε
  -- ένα που λήγει σε δύο εβδομάδες. Η τιμή δεν ξαναγράφεται εδώ — έρχεται από
  -- την προεπιλογή του πίνακα μέσω του `excluded`.
  on conflict (user_id) do update
    set token = excluded.token, expires_at = excluded.expires_at;
  return fresh;
end;
$$;

revoke all on function public.rotate_calendar_feed() from public, anon;
grant execute on function public.rotate_calendar_feed() to authenticated;

comment on function public.rotate_calendar_feed() is
  'Νέα διεύθυνση ημερολογίου για τον συνδεδεμένο χρήστη. Η παλιά παύει να απαντά αμέσως, σε κάθε συσκευή όπου είχε προστεθεί.';
