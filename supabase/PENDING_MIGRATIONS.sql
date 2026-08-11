-- ═══════════════════════════════════════════════════════════════════════════
--  ΕΚΚΡΕΜΕΙΣ ΜΕΤΑΝΑΣΤΕΥΣΕΙΣ — ΜΙΑ ΕΠΙΚΟΛΛΗΣΗ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΕΙΝΑΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ. Οι τέσσερις μεταναστεύσεις που έχουν γραφτεί αλλά
--  δεν έχουν εφαρμοστεί στη βάση, στη ΣΩΣΤΗ ΣΕΙΡΑ, σε ένα σώμα. Μέχρι να
--  τρέξουν, η βάση και η εφαρμογή λένε διαφορετικά πράγματα — και το πιο
--  σοβαρό είναι το Πρόγραμμα Πρόσκλησης: η οθόνη υπόσχεται μία ανταμοιβή και
--  η βάση αποδίδει άλλη.
--
--  ΠΩΣ ΤΡΕΧΕΙ
--    Α΄ τρόπος (συνιστάται): supabase db push
--    Β΄ τρόπος: άνοιξε τον SQL editor του project, επικόλλησε ΟΛΟ αυτό το
--       αρχείο και πάτησε Run. Τρέχει σε μία συναλλαγή: ή περνούν και τα
--       τέσσερα, ή δεν αλλάζει τίποτα.
--
--  ΓΙΑΤΙ ΕΙΝΑΙ ΑΣΦΑΛΕΣ ΝΑ ΞΑΝΑΤΡΕΞΕΙ. Κάθε μετανάστευση είναι γραμμένη με
--  `create or replace`, `if not exists` και `drop ... if exists`. Αν κάποια
--  έχει ήδη εφαρμοστεί, η επανάληψη δεν κάνει ζημιά.
--
--  ΠΡΟΣΟΧΗ: αν χρησιμοποιείς `supabase db push`, ΜΗΝ τρέξεις και αυτό το
--  αρχείο. Ο πίνακας ιστορικού του CLI δεν ξέρει ότι το έτρεξες με το χέρι.
--  Διάλεξε έναν από τους δύο τρόπους.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 20260809230000_marketing_prefs_for_email.sql
-- ───────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΠΡΟΤΙΜΗΣΕΙΣ ΑΠΕΓΓΡΑΦΗΣ ΑΠΟ ΤΗ ΔΙΕΥΘΥΝΣΗ ΤΟΥ ΠΑΡΑΛΗΠΤΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Η μηχανή των lifecycle emails δέχεται ΔΙΕΥΘΥΝΣΗ, όχι αναγνωριστικό χρήστη:
-- την καλούν trigger της βάσης, cron και η εφαρμογή, και καμία από τις τρεις
-- δεν κουβαλά πάντα το `user_id`. Χωρίς αυτή τη συνάρτηση, η απεγγραφή δεν
-- μπορούσε να ελεγχθεί καθόλου — και δεν ελεγχόταν.
--
-- ΤΙ ΚΑΝΕΙ: από τη διεύθυνση βρίσκει τον χρήστη, εξασφαλίζει ότι υπάρχει γραμμή
-- προτιμήσεων (προεπιλογή: εγγεγραμμένος, όπως και στο newsletter) και γυρίζει
-- την προτίμηση μαζί με το διακριτικό απεγγραφής.
--
-- ΓΙΑΤΙ SECURITY DEFINER ΚΑΙ ΠΟΙΟΣ ΤΗΝ ΚΑΛΕΙ: διαβάζει `auth.users`, που καμία
-- πολιτική δεν εκθέτει σε πελάτη. Εκτελείται ΜΟΝΟ από τον ρόλο υπηρεσίας: το
-- δικαίωμα εκτέλεσης αφαιρείται ρητά από `anon` και `authenticated`, αλλιώς θα
-- ήταν μηχανή απαρίθμησης λογαριασμών («υπάρχει αυτό το email;»).
--
-- Το `search_path` καρφώνεται: χωρίς αυτό, μια συνάρτηση SECURITY DEFINER
-- μπορεί να παρασυρθεί σε ομώνυμο αντικείμενο άλλου σχήματος.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.marketing_prefs_for_email(p_email text)
returns table (product_news boolean, market_news boolean, unsubscribe_token uuid)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid;
begin
  select id into v_uid
    from auth.users
   where lower(email) = lower(trim(p_email))
     and email_confirmed_at is not null
   limit 1;

  if v_uid is null then
    return;                       -- κανένας χρήστης: ο καλών αποφασίζει
  end if;

  -- Προεπιλογή «εγγεγραμμένος», ίδια με του newsletter: ο χρήστης που δεν
  -- εξέφρασε ποτέ προτίμηση δεν θεωρείται ούτε εγγεγραμμένος ούτε απεγγεγραμμένος
  -- από το πουθενά — η γραμμή δημιουργείται ρητά, με χρόνο.
  insert into public.email_marketing_prefs (user_id)
       values (v_uid)
  on conflict (user_id) do nothing;

  return query
    select p.product_news, p.market_news, p.unsubscribe_token
      from public.email_marketing_prefs p
     where p.user_id = v_uid;
end;
$$;

alter function public.marketing_prefs_for_email(text) owner to postgres;

-- Ο πελάτης ΔΕΝ την καλεί ποτέ: θα ήταν απαρίθμηση λογαριασμών.
revoke all on function public.marketing_prefs_for_email(text) from public, anon, authenticated;
grant execute on function public.marketing_prefs_for_email(text) to service_role;

comment on function public.marketing_prefs_for_email(text) is
  'Προτιμήσεις εμπορικών email από διεύθυνση. Μόνο service_role: για τον πελάτη θα ήταν απαρίθμηση λογαριασμών.';

-- ───────────────────────────────────────────────────────────────────────────
-- 20260810070000_reminder_email_verified.sql
-- ───────────────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────────────
-- 20260810120000_ai_trial_cap_and_paying_plans.sql
-- ───────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΥΟ ΤΡΥΠΕΣ ΣΤΟΝ ΜΕΤΡΗΤΗ ΤΟΥ ΒΟΗΘΟΥ, ΚΑΙ ΟΙ ΔΥΟ ΣΙΩΠΗΛΕΣ
-- ─────────────────────────────────────────────────────────────────────────
-- 1) ΔΥΟ ΠΛΗΡΩΜΕΝΑ ΠΑΚΕΤΑ ΜΕΤΡΙΟΥΝΤΑΝ ΩΣ ΔΩΡΕΑΝ.
--    Ο έλεγχος «πληρώνει;» ήταν γραμμένος ως `v_plan in ('owner','agency')`,
--    δηλαδή έμεινε στα δύο πακέτα που υπήρχαν τότε. Στο μεταξύ μπήκαν το
--    `solo` (το ΦΘΗΝΟΤΕΡΟ, άρα και το πολυπληθέστερο) και το `office` (το
--    ΑΚΡΙΒΟΤΕΡΟ). Και τα δύο μετρούσαν στην κοινή δεξαμενή των μη-πληρωνόντων:
--    ένας συνδρομητής που πληρώνει 79,90 € τον μήνα μπορούσε να αποκλειστεί
--    από τον βοηθό επειδή οι δοκιμαστές είχαν εξαντλήσει τη δεξαμενή του μήνα.
--    Και το μήνυμα που θα έβλεπε θα του έλεγε ότι «ο δωρεάν βοηθός εξαντλήθηκε».
--
-- 2) Η ΔΟΚΙΜΗ ΕΠΑΙΡΝΕ ΤΟ ΠΑΚΕΤΟ ΕΡΩΤΗΣΕΩΝ ΤΟΥ «ΙΔΙΟΚΤΗΤΗΣ+».
--    Η δοκιμή ανεβάζει το επίπεδο σε rank 2 ώστε ο νέος χρήστης να δει τις
--    δυνατότητες — και μαζί έπαιρνε και τις ερωτήσεις του πακέτου, δυόμισι
--    φορές περισσότερες από όσες δικαιούται ο συνδρομητής που ΠΛΗΡΩΝΕΙ το
--    φθηνότερο. Το ίδιο ίσχυε για κάθε ανυψωμένο αλλά μη πληρωμένο επίπεδο:
--    δωρεάν μήνες από συστάσεις, ιδιότητα Συνεργάτη.
--
--    Οι ΔΥΝΑΤΟΤΗΤΕΣ της δοκιμής δεν αγγίζονται — τρία ακίνητα, σύγκριση, τα
--    πάντα. Μόνο το πακέτο ερωτήσεων γίνεται δοκιμαστικό, όπως και η δοκιμή.
--
-- Νέα υπογραφή με δύο ακόμη παραμέτρους. Η προηγούμενη ΔΕΝ διαγράφεται: κατά
-- το deploy η παλιά έκδοση της εφαρμογής τρέχει ακόμη για λίγα δευτερόλεπτα
-- και θα έπαιρνε σφάλμα RPC.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bump_ai_usage(
  p_max_min    integer,
  p_day        integer[],
  p_month      integer[],
  p_pool       integer,
  p_trial_day  integer,
  p_trial_month integer
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid        := auth.uid();
  v_now   timestamptz := now();
  v_min   timestamptz := date_trunc('minute', v_now);
  v_day   date        := (v_now at time zone 'Europe/Athens')::date;
  v_mon   date        := date_trunc('month', (v_now at time zone 'Europe/Athens'))::date;
  v_plan  text;
  v_pay   boolean;
  v_rank  integer;
  v_lday  integer;
  v_lmon  integer;
  v_minc  integer;
  v_dayc  integer;
  v_monc  integer;
  v_pool  integer := 0;
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;

  v_rank := coalesce(public.user_plan_rank(v_uid), 0);
  v_lday := coalesce(p_day[v_rank + 1],   p_day[1]);
  v_lmon := coalesce(p_month[v_rank + 1], p_month[1]);

  -- «Πληρώνει» σημαίνει ΠΡΑΓΜΑΤΙΚΗ συνδρομή, όχι ανυψωμένο επίπεδο. Δοκιμή,
  -- δωρεάν μήνες και Συνεργάτες κοστίζουν από την ίδια τσέπη με τη δεξαμενή.
  -- Η λίστα διαβάζεται ΑΠΟ ΤΑ ΠΑΚΕΤΑ ΠΟΥ ΧΡΕΩΝΟΝΤΑΙ: αν προστεθεί πακέτο και
  -- ξεχαστεί εδώ, ο συνδρομητής του θα μετράει ως δωρεάν.
  select plan into v_plan from public.billing_profiles where user_id = v_uid;
  v_pay := coalesce(v_plan, 'free') in ('solo', 'owner', 'agency', 'office');

  -- ΤΟ ΠΑΚΕΤΟ ΕΡΩΤΗΣΕΩΝ ΑΚΟΛΟΥΘΕΙ ΤΗΝ ΠΛΗΡΩΜΗ, ΟΧΙ ΤΟ ΕΠΙΠΕΔΟ. Το `least`
  -- σημαίνει ότι ο μη πληρώνων δεν παίρνει ΠΟΤΕ περισσότερα από το δοκιμαστικό
  -- πακέτο, όσο ψηλά κι αν τον ανεβάσει δοκιμή, δώρο ή ιδιότητα.
  if not v_pay and p_trial_day is not null then
    v_lday := least(v_lday, p_trial_day);
    v_lmon := least(v_lmon, p_trial_month);
  end if;

  insert into public.ai_usage (user_id, minute_bucket, minute_count, day, day_count, month, month_count, updated_at)
    values (v_uid, v_min, 1, v_day, 1, v_mon, 1, v_now)
  on conflict (user_id) do update set
    minute_count  = case when public.ai_usage.minute_bucket = v_min then public.ai_usage.minute_count + 1 else 1 end,
    minute_bucket = v_min,
    day_count     = case when public.ai_usage.day   = v_day then public.ai_usage.day_count   + 1 else 1 end,
    day           = v_day,
    month_count   = case when public.ai_usage.month = v_mon then public.ai_usage.month_count + 1 else 1 end,
    month         = v_mon,
    updated_at    = v_now
  returning minute_count, day_count, month_count into v_minc, v_dayc, v_monc;

  if not v_pay then
    insert into public.ai_budget (month, free_count, updated_at)
      values (v_mon, 1, v_now)
    on conflict (month) do update set
      free_count = public.ai_budget.free_count + 1,
      updated_at = v_now
    returning free_count into v_pool;
  end if;

  -- Σειρά ελέγχων: από το πιο «μόνιμο» προς το πιο πρόσκαιρο, ώστε το μήνυμα
  -- που βλέπει ο χρήστης να λέει την πραγματική αιτία και όχι μια παροδική.
  if not v_pay and p_pool is not null and v_pool > p_pool then
    return json_build_object('allowed', false, 'reason', 'pool', 'rank', v_rank);
  end if;
  if v_monc > v_lmon then
    return json_build_object('allowed', false, 'reason', 'month', 'rank', v_rank);
  end if;
  if v_dayc > v_lday then
    return json_build_object('allowed', false, 'reason', 'day', 'rank', v_rank);
  end if;
  if v_minc > p_max_min then
    return json_build_object('allowed', false, 'reason', 'minute', 'rank', v_rank);
  end if;

  return json_build_object(
    'allowed', true, 'rank', v_rank, 'paying', v_pay,
    'minute', v_minc, 'day', v_dayc, 'month', v_monc,
    'day_limit', v_lday, 'month_limit', v_lmon
  );
end; $$;

revoke all on function public.bump_ai_usage(integer, integer[], integer[], integer, integer, integer) from public, anon;
grant execute on function public.bump_ai_usage(integer, integer[], integer[], integer, integer, integer) to authenticated;

-- Η ΠΑΛΙΑ ΥΠΟΓΡΑΦΗ ΔΙΟΡΘΩΝΕΤΑΙ ΚΙ ΑΥΤΗ, ΓΙΑ ΟΣΟ ΖΕΙ. Όσο τρέχει η προηγούμενη
-- έκδοση της εφαρμογής, θα καλεί εκείνη· δεν επιτρέπεται να συνεχίσει να
-- χρεώνει τον συνδρομητή «Ιδιοκτήτης» στη δεξαμενή των δωρεάν.
create or replace function public.bump_ai_usage(
  p_max_min integer,
  p_day     integer[],
  p_month   integer[],
  p_pool    integer
) returns json language sql security definer set search_path to 'public' as $$
  select public.bump_ai_usage(p_max_min, p_day, p_month, p_pool, null::integer, null::integer);
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 20260811090000_referral_rules_match_the_app.sql
-- ───────────────────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΚΑΝΟΝΕΣ ΤΩΝ ΣΥΣΤΑΣΕΩΝ ΕΛΕΓΑΝ ΑΛΛΑ ΣΤΗΝ ΟΘΟΝΗ ΚΑΙ ΑΛΛΑ ΣΤΗ ΒΑΣΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Το lib/referral/referral.ts είναι η δηλωμένη πηγή αλήθειας του προγράμματος
-- και ξαναγράφτηκε. Οι συναρτήσεις της βάσης έμειναν στην προηγούμενη γενιά.
-- Τέσσερις αποκλίσεις, και οι τέσσερις ορατές στον χρήστη ως υπόσχεση:
--
-- 1) Ο ΣΤΟΧΟΣ ΤΟΥ ΙΔΙΩΤΗ ΗΤΑΝ 3 ΣΤΗΝ ΟΘΟΝΗ ΚΑΙ 5 ΣΤΗ ΒΑΣΗ.
--    Η μπάρα γέμιζε στους τρεις, ο χρήστης πατούσε «διεκδίκησε» και η
--    `claim_referral_bonus` απαντούσε `not_reached`. Δηλαδή του δείχναμε
--    πετυχημένο στόχο και του αρνιόμασταν την ανταμοιβή.
--
-- 2) Ο ΣΤΟΧΟΣ ΤΟΥ ΕΠΑΓΓΕΛΜΑΤΙΑ ΗΤΑΝ ΑΠΡΟΣΙΤΟΣ ΕΞ ΟΡΙΣΜΟΥ.
--    Μετρούσε τη στήλη `plan` του προφίλ ως προς δύο τιμές κύκλου χρέωσης,
--    τη μηνιαία και την ετήσια. Η στήλη όμως κρατά
--    ΟΝΟΜΑ ΠΑΚΕΤΟΥ ('solo','owner','agency','office') — το ξέρει και η
--    `user_plan_rank`, που διαβάζει την ίδια στήλη. Καμία γραμμή δεν έγραψε
--    ποτέ 'monthly' ή 'annual', άρα ο μετρητής ήταν μόνιμα μηδέν και η
--    ιδιότητα Συνεργάτη ανέφικτη. Το κάτοπτρό του, το `pro_free`, μετρούσε
--    «όσους ΔΕΝ πληρώνουν» — δηλαδή ΟΛΟΥΣ.
--
-- 3) Η ΒΑΣΗ ΕΔΙΝΕ ΔΥΟ ΜΗΝΕΣ ΕΚΕΙ ΠΟΥ Η ΟΘΟΝΗ ΥΠΟΣΧΟΤΑΝ ΕΝΑΝ.
--    `pro_paid` → 2 μήνες, `per_referral_pro` → 2 μήνες. Το πρόγραμμα δίνει
--    έναν, παντού και χωρίς εξαίρεση.
--
-- 4) ΤΟ «+1 ΑΚΙΝΗΤΟ ΓΙΑ ΕΝΑΝ ΜΗΝΑ» ΔΕΝ ΕΔΙΝΕ ΠΟΤΕ ΑΚΙΝΗΤΟ.
--    Γραφόταν ως `referral_rewards.kind = 'slot'`, εμφανιζόταν στη λίστα
--    ανταμοιβών, και ΚΑΝΕΝΑΣ δεν το διάβαζε: η `sync_comp_from_referrals`
--    αθροίζει μόνο `kind = 'months'`, και ο έλεγχος ορίου ακινήτων κοιτά μόνο
--    το `extra_properties`, δηλαδή τα ΑΓΟΡΑΣΜΕΝΑ. Η πιο συχνή ανταμοιβή του
--    προγράμματος ήταν διακοσμητική.
--
-- ΓΙΑΤΙ ΝΕΑ ΣΤΗΛΗ ΚΑΙ ΟΧΙ ΑΥΞΗΣΗ ΤΟΥ `extra_properties`: τα αγορασμένα ακίνητα
-- είναι ΜΟΝΙΜΑ και τα κερδισμένα ΛΗΓΟΥΝ. Γραμμένα στην ίδια στήλη, ένα δώρο
-- ενός μήνα θα γινόταν μόνιμο δικαίωμα και δεν θα μπορούσε να αφαιρεθεί χωρίς
-- να πειραχθεί ό,τι πλήρωσε ο χρήστης. Δύο έννοιες, δύο στήλες.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Οι κερδισμένες θέσεις ακινήτου, με ημερομηνία λήξης ─────────────────
alter table public.billing_profiles
  add column if not exists bonus_properties integer not null default 0,
  add column if not exists bonus_properties_until timestamptz;

alter table public.billing_profiles
  drop constraint if exists billing_profiles_bonus_properties_nonneg;
alter table public.billing_profiles
  add constraint billing_profiles_bonus_properties_nonneg
  check (bonus_properties >= 0 and bonus_properties <= 500);

comment on column public.billing_profiles.bonus_properties is
  'Θέσεις ακινήτου κερδισμένες από συστάσεις. ΛΗΓΟΥΝ (bonus_properties_until). Τα ΑΓΟΡΑΣΜΕΝΑ ζουν στο extra_properties και δεν λήγουν.';

-- ── 2. Ο έλεγχος ορίου μετράει και τις κερδισμένες, όσο είναι ενεργές ──────
create or replace function public.enforce_property_limit() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_count int;
  v_limit int;
  v_extra int;
  v_bonus int;
begin
  select count(*) into v_count from user_properties where user_id = NEW.user_id;
  v_limit := plan_max_properties(user_plan_rank(NEW.user_id));

  -- Τα επιπλέον προστίθενται ΜΟΝΟ σε πεπερασμένο όριο. Χωρίς αυτόν τον έλεγχο,
  -- το «απεριόριστο» (2147483647) συν οποιοδήποτε extra θα ξεχείλιζε τον integer
  -- και θα γινόταν αρνητικό — δηλαδή το ΑΝΩΤΕΡΟ πλάνο θα σταματούσε στο πρώτο
  -- ακίνητο. Σιωπηλό, καταστροφικό, και ακριβώς ο τύπος σφάλματος που δεν
  -- εμφανίζεται σε δοκιμή με μικρά νούμερα.
  if v_limit < 2147483647 then
    select coalesce(extra_properties, 0),
           case when bonus_properties_until is not null and bonus_properties_until > now()
                then coalesce(bonus_properties, 0) else 0 end
      into v_extra, v_bonus
      from billing_profiles where user_id = NEW.user_id;
    v_limit := v_limit + coalesce(v_extra, 0) + coalesce(v_bonus, 0);
  end if;

  if v_count >= v_limit then
    raise exception 'PROPERTY_LIMIT: Το πλάνο σου καλύπτει % ακίνητα. Πρόσθεσε ακίνητο ή αναβάθμισε.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

-- ── 3. Τα «πληρωμένα» πακέτα, ονομαστικά ──────────────────────────────────
-- ΜΙΑ λίστα, ώστε η προσθήκη πακέτου να μη χρειάζεται να θυμηθεί δύο σημεία.
-- Ταυτίζεται με το PLAN_ORDER του lib/billing/plans.ts, χωρίς το 'free'.
create or replace function public.is_paying_plan(p_plan text)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(p_plan, '') in ('solo', 'owner', 'agency', 'office');
$$;

-- ── 4. Οι στόχοι και οι ανταμοιβές, όπως τα λέει η οθόνη ──────────────────
create or replace function public.claim_referral_bonus(p_code text, p_kind text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid; v_count int; v_target int; v_months int; v_tier text; v_exists int;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_object('ok', false, 'reason', 'not_owner'); end if;

  -- ΤΑ ΝΟΥΜΕΡΑ ΕΙΝΑΙ ΤΟΥ lib/referral/referral.ts:
  --   INDIV_VOLUME_TARGET = 3, INDIV_VOLUME_BONUS_MONTHS = 1
  --   PRO_PAID_TARGET     = 5, PRO_PAID_BONUS_MONTHS     = 1
  -- Το 'pro_free' ΚΑΤΑΡΓΗΘΗΚΕ: αντάμειβε εγγραφές που δεν φέρνουν έσοδο, σε
  -- προϊόν που δεν έχει πια δωρεάν πακέτο. Απαντά 'bad_kind', ώστε παλιός
  -- πελάτης που το καλεί να παίρνει σαφή άρνηση αντί για σιωπηλή ανταμοιβή.
  if    p_kind = 'indiv_volume' then v_target := 3; v_months := 1; v_tier := 'owner';
  elsif p_kind = 'pro_paid'     then v_target := 5; v_months := 1; v_tier := 'agency';
  else return json_build_object('ok', false, 'reason', 'bad_kind'); end if;

  -- Σειριοποίησε ταυτόχρονες διεκδικήσεις ανά χρήστη/είδος (anti double-claim).
  perform pg_advisory_xact_lock(hashtext('referral_bonus:' || p_kind || ':' || v_owner::text));

  select
    case p_kind
      -- Ο Ιδιώτης μετράει ΙΔΙΩΤΕΣ που έφερε.
      when 'indiv_volume' then count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional')
      -- Ο Επαγγελματίας μετράει ΣΥΝΔΡΟΜΗΤΕΣ, σε οποιοδήποτε πακέτο.
      when 'pro_paid'     then count(*) filter (where is_paying_plan(bp.plan))
    end::int
  into v_count
  from referrals r
  left join billing_profiles bp on bp.user_id = r.referred_user_id
  where r.referrer_user_id = v_owner and r.activated_at is not null
    and date_trunc('month', r.activated_at) = date_trunc('month', now());

  if v_count < v_target then return json_build_object('ok', false, 'reason', 'not_reached', 'count', v_count, 'target', v_target); end if;

  select count(*)::int into v_exists from referral_rewards
   where user_id = v_owner and reason = p_kind
     and date_trunc('month', created_at) = date_trunc('month', now());
  if v_exists > 0 then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;

  insert into referral_rewards (user_id, kind, months, tier, reason, status)
       values (v_owner, 'months', v_months, v_tier, p_kind, 'pending');
  return json_build_object('ok', true, 'status', 'pending', 'months', v_months, 'tier', v_tier);
end; $$;

-- ── 5. Ένας κανόνας ανά σύσταση, ίδιος για όλους ──────────────────────────
create or replace function public.reconcile_referral_rewards(p_code text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid;
  v_ptype text;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return; end if;

  select coalesce(profile_type, 'individual') into v_ptype
    from billing_profiles where user_id = v_owner;
  v_ptype := coalesce(v_ptype, 'individual');

  -- Μόνο ο Ιδιώτης έχει ανά-σύσταση αξία· ο Επαγγελματίας αμείβεται στον στόχο.
  if v_ptype = 'professional' then return; end if;

  -- 1) ΕΝΑΣ ΚΑΝΟΝΑΣ ΓΙΑ ΟΛΟΥΣ: +1 ακίνητο για έναν μήνα. Ήταν «μήνας αν
  --    πληρώνεις, θέση αν είσαι δωρεάν» — δύο κανόνες για την ίδια πράξη, που
  --    το referral.ts ενοποίησε ρητά. Και ο έλεγχος «πληρώνεις;» κοίταζε
  --    το πακέτο ως προς δύο τιμές κύκλου χρέωσης που δεν γράφονται ποτέ, οπότε
  --    στην πράξη ΚΑΝΕΙΣ δεν έπαιρνε μήνα.
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'slot', 1, 'owner', 'per_referral', 'pending'
    from referrals r
   where r.referrer_user_id = v_owner and r.activated_at is not null
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;

  -- 2) Η μόνη εξαίρεση: ο συστημένος έγινε Επαγγελματίας → ΕΝΑΣ μήνας (όχι δύο).
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'months', 1, 'owner', 'per_referral_pro', 'pending'
    from referrals r
    join billing_profiles bp on bp.user_id = r.referred_user_id
   where r.referrer_user_id = v_owner and r.activated_at is not null
     and coalesce(bp.profile_type, 'individual') = 'professional'
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;
end;
$$;

-- ── 6. Οι κερδισμένες θέσεις εφαρμόζονται πραγματικά ──────────────────────
create or replace function public.sync_comp_from_referrals() returns void
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid := auth.uid();
  v_months int;
  v_slots  int;
  v_ptype  text;
  v_target text;
  v_cap    int := 12;
begin
  if v_uid is null then return; end if;

  select coalesce(sum(months) filter (where kind = 'months'), 0),
         coalesce(sum(months) filter (where kind = 'slot'), 0)
    into v_months, v_slots
    from referral_rewards
   where user_id = v_uid;

  select coalesce(profile_type, 'individual') into v_ptype
    from billing_profiles where user_id = v_uid;
  v_target := case when v_ptype = 'professional' then 'agency' else 'owner' end;

  -- Δωρεάν μήνες πακέτου. Αύξηση μόνο (idempotent).
  v_months := least(v_months, v_cap);
  if v_months > 0 then
    update billing_profiles
       set comp_months_granted = greatest(coalesce(comp_months_granted, 0), v_months),
           comp_started_at     = coalesce(comp_started_at, now()),
           comp_plan           = v_target,
           comp_until          = coalesce(comp_started_at, now())
                                 + (greatest(coalesce(comp_months_granted, 0), v_months) || ' months')::interval
     where user_id = v_uid
       and v_months > coalesce(comp_months_granted, 0);
  end if;

  -- ΚΕΡΔΙΣΜΕΝΕΣ ΘΕΣΕΙΣ ΑΚΙΝΗΤΟΥ. Κάθε γραμμή 'slot' είναι μία θέση για έναν
  -- μήνα. Το πλήθος είναι το άθροισμα, και η λήξη μετράει από την πρώτη: δέκα
  -- συστάσεις σημαίνουν δέκα θέσεις για έναν μήνα, όχι μία θέση για δέκα.
  v_slots := least(v_slots, 500);
  if v_slots > 0 then
    update billing_profiles
       set bonus_properties       = greatest(coalesce(bonus_properties, 0), v_slots),
           bonus_properties_until = greatest(coalesce(bonus_properties_until, now()), now() + interval '1 month')
     where user_id = v_uid
       and v_slots > coalesce(bonus_properties, 0);
  end if;
end;
$$;

-- ── Ο έλεγχος ότι όντως συμφωνούν ─────────────────────────────────────────
-- Η Postgres ΔΕΝ επαληθεύει σώμα plpgsql στο `create`. Τα σταθερά κομμάτια
-- εκτελούνται εδώ, ώστε ένα λάθος να σκάσει ΤΩΡΑ και όχι στον πρώτο χρήστη.
do $$
begin
  if not public.is_paying_plan('solo')   then raise exception 'το solo πρέπει να μετράει ως συνδρομητής'; end if;
  if not public.is_paying_plan('office') then raise exception 'το office πρέπει να μετράει ως συνδρομητής'; end if;
  if public.is_paying_plan('free')       then raise exception 'το free ΔΕΝ είναι συνδρομητής'; end if;
  if public.is_paying_plan(null)         then raise exception 'το κενό πλάνο ΔΕΝ είναι συνδρομητής'; end if;
  if public.is_paying_plan('monthly')    then raise exception 'το «monthly» δεν είναι πακέτο, είναι κύκλος χρέωσης'; end if;
end $$;

commit;
