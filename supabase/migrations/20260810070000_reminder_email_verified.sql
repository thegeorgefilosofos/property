-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΥΠΕΝΘΥΜΙΣΕΙΣ ΠΑΝΕ ΜΟΝΟ ΣΕ ΔΙΕΥΘΥΝΣΗ ΠΟΥ ΕΙΠΕ «ΝΑΙ»
-- ─────────────────────────────────────────────────────────────────────────
-- Η `notification_preferences.reminder_email` είναι ελεύθερο κείμενο που γράφει
-- ο χρήστης, και η `send-reminders` στέλνει εκεί χωρίς να ρωτήσει κανέναν. Ο
-- παραλήπτης μπορεί να είναι οποιοσδήποτε: γείτονας, πρώην, άγνωστος.
--
-- ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟ ΓΡΑΦΕΙ Ο ΑΠΟΣΤΟΛΕΑΣ. Οι τίτλοι των γεγονότων μπαίνουν μέσα
-- στο μήνυμα· από τις 10/08/2026 ως κείμενο και όχι ως HTML, οπότε δεν χτίζεται
-- πια ψεύτικος σύνδεσμος. Μένει όμως ότι το μήνυμα φεύγει από ΤΟ ΔΙΚΟ ΜΑΣ domain,
-- με το δικό μας λογότυπο, σε άνθρωπο που δεν το ζήτησε ποτέ. Αυτό είναι
-- αναμεταδότης, όσο ευγενικό κι αν είναι το περιεχόμενο.
--
-- Η ΛΥΣΗ ΕΙΝΑΙ Η ΔΙΠΛΗ ΣΥΓΚΑΤΑΘΕΣΗ, ΚΑΙ ΕΧΕΙ ΤΡΙΑ ΚΟΜΜΑΤΙΑ:
--
--   1. Η στήλη κρατά ΠΟΙΑ διεύθυνση επιβεβαιώθηκε, όχι απλώς ένα «ναι». Αν ο
--      χρήστης αλλάξει διεύθυνση, η παλιά επιβεβαίωση δεν ισχύει για τη νέα.
--   2. Ένα διακριτικό με λήξη, που ταξιδεύει στο μήνυμα επιβεβαίωσης.
--   3. Ο κανόνας της αποστολής: η ΔΙΚΗ ΣΟΥ διεύθυνση δεν χρειάζεται επιβεβαίωση
--      (την επαλήθευσε ήδη η εγγραφή)· κάθε άλλη τη χρειάζεται.
--
-- ΤΟ ΤΡΙΤΟ ΖΕΙ ΣΤΗ ΒΑΣΗ, ΟΧΙ ΣΤΗ FUNCTION. Η `reminder_recipients` είναι η μία
-- πηγή που απαντά «σε ποιον επιτρέπεται να στείλω»: αν αύριο γραφτεί δεύτερος
-- αποστολέας, θα ρωτήσει το ίδιο πράγμα και θα πάρει την ίδια απάντηση.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.notification_preferences
  add column if not exists reminder_email_verified   text,
  add column if not exists reminder_email_token      uuid,
  add column if not exists reminder_email_token_at   timestamptz;

comment on column public.notification_preferences.reminder_email_verified is
  'Η διεύθυνση που ΕΠΙΒΕΒΑΙΩΘΗΚΕ. Αλλαγή του reminder_email την ακυρώνει: κρατάμε τη διεύθυνση, όχι ένα ναι.';
comment on column public.notification_preferences.reminder_email_token is
  'Διακριτικό επιβεβαίωσης, ταξιδεύει στο μήνυμα. Λήγει σε 48 ώρες.';

-- ── Η ΑΛΛΑΓΗ ΔΙΕΥΘΥΝΣΗΣ ΑΚΥΡΩΝΕΙ ΤΗΝ ΕΠΙΒΕΒΑΙΩΣΗ ──────────────────────────
-- Χωρίς αυτό, ο χρήστης επιβεβαιώνει τη δική του διεύθυνση, μετά γράφει ξένη,
-- και η στήλη εξακολουθεί να λέει «επιβεβαιωμένο». Ο κανόνας δεν μπορεί να ζει
-- στην εφαρμογή: η γραμμή γράφεται από τρία σημεία.
create or replace function public.reminder_email_reverify()
returns trigger language plpgsql as $$
begin
  if new.reminder_email is distinct from old.reminder_email then
    new.reminder_email_verified := null;
    new.reminder_email_token := null;
    new.reminder_email_token_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_reminder_email_reverify on public.notification_preferences;
create trigger trg_reminder_email_reverify
  before update on public.notification_preferences
  for each row execute function public.reminder_email_reverify();

-- ── ΠΟΥ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΣΤΑΛΕΙ ΥΠΕΝΘΥΜΙΣΗ ──────────────────────────────────
-- Η μία πηγή της απάντησης. Επιστρέφει τη διεύθυνση παραλήπτη ανά χρήστη, ή
-- ΤΙΠΟΤΑ όταν δεν υπάρχει επιτρεπτή: η σιωπή είναι σωστότερη από την αποστολή.
--
-- ΔΥΟ ΠΕΡΙΠΤΩΣΕΙΣ ΠΕΡΝΑΝΕ:
--   • Η διεύθυνση του ΙΔΙΟΥ του λογαριασμού. Την επαλήθευσε η εγγραφή, και μια
--     δεύτερη επιβεβαίωση θα ήταν γραφειοκρατία χωρίς αποδέκτη.
--   • Οποιαδήποτε άλλη, ΑΦΟΥ επιβεβαιωθεί, και μόνο όσο δεν έχει αλλάξει.
create or replace function public.reminder_recipients()
returns table (user_id uuid, email text)
language sql stable security definer
set search_path = 'public', 'pg_temp'
as $$
  select p.user_id,
         case
           when lower(trim(coalesce(p.reminder_email, ''))) = lower(trim(coalesce(u.email, '')))
             then u.email
           when p.reminder_email is not null
            and lower(trim(p.reminder_email)) = lower(trim(coalesce(p.reminder_email_verified, '')))
             then p.reminder_email
           else null
         end as email
    from notification_preferences p
    join auth.users u on u.id = p.user_id
   where coalesce(p.email_enabled, true)
     and u.email_confirmed_at is not null
$$;

revoke all on function public.reminder_recipients() from public, anon, authenticated;
grant execute on function public.reminder_recipients() to service_role;

comment on function public.reminder_recipients() is
  'Σε ποια διεύθυνση επιτρέπεται να σταλεί υπενθύμιση ανά χρήστη. Κενό = σε καμία.';

-- ── ΤΟ ΔΙΑΚΡΙΤΙΚΟ ΕΠΙΒΕΒΑΙΩΣΗΣ ────────────────────────────────────────────
-- Ο χρήστης το ζητά από τις Ρυθμίσεις· ο διακομιστής το εκδίδει και το στέλνει.
-- Επιστρέφει και τη διεύθυνση, ώστε ο αποστολέας να μη χρειάζεται δεύτερο ερώτημα.
create or replace function public.issue_reminder_email_token()
returns table (email text, token uuid)
language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_uid uuid := auth.uid(); v_token uuid := gen_random_uuid(); v_email text;
begin
  if v_uid is null then return; end if;
  select nullif(trim(reminder_email), '') into v_email
    from notification_preferences where notification_preferences.user_id = v_uid;
  if v_email is null then return; end if;

  update notification_preferences
     set reminder_email_token = v_token, reminder_email_token_at = now()
   where notification_preferences.user_id = v_uid;

  return query select v_email, v_token;
end $$;

revoke all on function public.issue_reminder_email_token() from public, anon;
grant execute on function public.issue_reminder_email_token() to authenticated, service_role;

-- ── Η ΕΠΙΒΕΒΑΙΩΣΗ ─────────────────────────────────────────────────────────
-- Δημόσια, γιατί ο παραλήπτης πατά τον σύνδεσμο χωρίς λογαριασμό. Το διακριτικό
-- είναι uuid και λήγει σε 48 ώρες· η επιτυχία το καίει, ώστε ο ίδιος σύνδεσμος
-- να μην ξαναδουλεύει αν διαρρεύσει από τα εισερχόμενα.
create or replace function public.confirm_reminder_email(p_token uuid)
returns boolean
language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_rows integer;
begin
  update notification_preferences
     set reminder_email_verified = reminder_email,
         reminder_email_token = null,
         reminder_email_token_at = null
   where reminder_email_token = p_token
     and reminder_email_token_at > now() - interval '48 hours'
     and reminder_email is not null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

revoke all on function public.confirm_reminder_email(uuid) from public;
grant execute on function public.confirm_reminder_email(uuid) to anon, authenticated, service_role;

comment on function public.confirm_reminder_email(uuid) is
  'Επιβεβαιώνει τη διεύθυνση υπενθυμίσεων από το διακριτικό του μηνύματος. Δημόσια: ο παραλήπτης δεν έχει λογαριασμό.';

-- Η Postgres δεν ελέγχει σώμα plpgsql στο create. Άκυρο διακριτικό ⇒ false.
do $$
begin
  if public.confirm_reminder_email('00000000-0000-0000-0000-000000000000') then
    raise exception 'άκυρο διακριτικό επιβεβαίωσε διεύθυνση';
  end if;
end $$;
