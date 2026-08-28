-- ═══════════════════════════════════════════════════════════════════════════
--  ΜΕΤΡΗΣΗ ΠΡΟΪΟΝΤΟΣ: ΠΟΣΟΙ ΦΤΑΝΟΥΝ ΣΤΗΝ ΑΞΙΑ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΛΥΝΕΙ. Η εφαρμογή στέλνει τα σφάλματά της στο Sentry και τη συμπεριφορά
--  πουθενά. Κανείς δεν ξέρει πόσοι από τους δοκιμαστές προσθέτουν δεύτερο
--  ακίνητο, πόσοι βγάζουν την πρώτη τους αναφορά ή πού σταματούν. Σε δεκαοκτώ
--  μήνες αυτό δεν είναι απλώς άγνωστο· είναι το νούμερο που ζητά ο αγοραστής.
--
--  ΓΙΑΤΙ ΔΙΚΟΣ ΜΑΣ ΠΙΝΑΚΑΣ ΚΑΙ ΟΧΙ ΕΡΓΑΛΕΙΟ ΤΗΣ ΑΓΟΡΑΣ. Τα cookieless εργαλεία
--  (Plausible, Umami, Vercel Analytics) ΠΕΤΑΝΕ ΕΠΙΤΗΔΕΣ την ταυτότητα από μέρα
--  σε μέρα: ξαναχτίζουν τον επισκέπτη κάθε 24 ώρες με νέο αλάτι. Αυτό ακριβώς
--  τα κάνει νόμιμα χωρίς συγκατάθεση και αυτό ακριβώς τα κάνει άχρηστα εδώ. Η
--  ερώτηση «ο ΙΔΙΟΣ άνθρωπος που γράφτηκε τη Δευτέρα, πρόσθεσε ακίνητο την
--  Τρίτη και πλήρωσε τον Απρίλιο;» απαιτεί ταυτότητα διαχρονικά. Τα εργαλεία
--  που τη δίνουν (PostHog) βάζουν cookies, άρα θέλουν συγκατάθεση, άρα χάνουν
--  όσους αρνούνται και υποχρεώνουν σε ξαναγράψιμο του CookieConsent.
--
--  ΚΑΙ Ο ΝΟΜΟΣ ΕΙΝΑΙ ΕΥΚΟΛΟΤΕΡΟΣ ΕΤΣΙ, ΟΧΙ ΔΥΣΚΟΛΟΤΕΡΟΣ. Το άρθρο 5 παρ. 3 της
--  ePrivacy (άρθρο 4 παρ. 5 ν. 3471/2006) ζητά συγκατάθεση για ΑΠΟΘΗΚΕΥΣΗ Η
--  ΠΡΟΣΒΑΣΗ σε πληροφορία μέσα στη συσκευή. Μια RPC που γράφει μια γραμμή στη
--  δική μας βάση δεν ακουμπά τη συσκευή: ούτε cookie, ούτε localStorage, ούτε
--  αποτύπωμα. Το άρθρο δεν ενεργοποιείται καν. Το κείμενο του CookieConsent
--  («Μόνο απαραίτητα cookies. Καμία παρακολούθηση, καμία διαφήμιση.») μένει
--  αληθινό χωρίς να αλλάξει λέξη.
--
--  ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟΣ ΠΙΝΑΚΑΣ ΚΑΙ ΟΧΙ ΤΟ `activity_log`. Το `activity_log` είναι
--  ΟΡΑΤΟ ΣΤΟΝ ΧΡΗΣΤΗ, μέσω της `my_activity` και του ActivityLog.tsx. Αν τα
--  προϊοντικά γεγονότα έμπαιναν εκεί, ο ιδιοκτήτης θα διάβαζε στο ημερολόγιό
--  του «report_generated» δίπλα στο «Άλλαξες τον κωδικό πρόσβασης». Το ένα
--  είναι λογιστικό βιβλίο ασφαλείας για τον χρήστη, το άλλο μέτρηση για εμάς.
--
--  ΠΟΥ ΤΡΕΧΕΙ. Supabase → SQL Editor. Είναι idempotent: ξανατρέχει χωρίς ζημιά.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ο ΠΙΝΑΚΑΣ ────────────────────────────────────────────────────────────
-- ΤΙ ΔΕΝ ΕΧΕΙ, ΚΑΙ ΕΙΝΑΙ ΣΚΟΠΙΜΟ: καμία διεύθυνση IP, κανένα user agent,
-- κανένα αναγνωριστικό συσκευής. Δεν τα χρειάζεται η ερώτηση που απαντά και
-- ό,τι δεν αποθηκεύεται δεν διαρρέει, δεν εξάγεται και δεν ζητείται πίσω.
create table if not exists public.product_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  event       text not null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Τα δύο ερωτήματα που θα γίνουν χίλιες φορές: «τι έκανε αυτός ο χρήστης, με
-- τη σειρά» και «πόσοι έκαναν αυτό το γεγονός σε αυτό το διάστημα».
create index if not exists product_events_user_time_idx
  on public.product_events (user_id, created_at desc);
create index if not exists product_events_event_time_idx
  on public.product_events (event, created_at desc);

-- ── ΤΟ «ΓΡΑΦΤΗΚΕ» ΓΙΝΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΚΑΙ ΤΟ ΕΓΓΥΑΤΑΙ Η ΒΑΣΗ ────────────────
-- Η στιγμή της εγγραφής δεν έχει συνεδρία: το email θέλει επιβεβαίωση, οπότε
-- ένα γεγονός γραμμένο εκεί δεν θα είχε χρήστη και θα χανόταν. Η πρώτη στιγμή
-- με ταυτότητα είναι η ΠΡΩΤΗ ΣΥΝΔΕΣΗ, δηλαδή το πάτημα του συνδέσμου.
--
-- Το ίδιο σημείο όμως περνά ΚΑΘΕ σύνδεση. Αντί να θυμάται ο κώδικας αν το
-- έγραψε ήδη (κάτι που ο περιηγητής δεν μπορεί να θυμάται αξιόπιστα), το
-- εγγυάται η βάση με μοναδικό ευρετήριο: η δεύτερη προσπάθεια απλώς δεν
-- γράφει. Ετσι ο παρονομαστής του χωνιού είναι «άνθρωποι» και όχι «συνδέσεις».
create unique index if not exists product_events_signup_once_idx
  on public.product_events (user_id)
  where event = 'signed_up';

-- ── Η ΠΡΟΣΒΑΣΗ ───────────────────────────────────────────────────────────
-- RLS ΕΝΕΡΓΟ ΜΕ ΜΗΔΕΝ ΠΟΛΙΤΙΚΕΣ. Στην Postgres αυτό σημαίνει «κανείς δεν
-- διαβάζει και κανείς δεν γράφει», για κάθε ρόλο εκτός από τον ιδιοκτήτη του
-- πίνακα. Ο περιηγητής δεν μπορεί ούτε να δει ότι υπάρχει.
alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;

-- ── Η ΜΟΝΗ ΠΟΡΤΑ ─────────────────────────────────────────────────────────
-- Ο ΧΡΗΣΤΗΣ ΔΕΝ ΔΙΝΕΙ ΤΟ user_id ΤΟΥ, ΤΟ ΔΙΝΕΙ Ο ΔΙΑΚΟΜΙΣΤΗΣ. Αν το δεχόταν
-- ως παράμετρο, οποιοσδήποτε θα μπορούσε να γράψει γεγονότα στο όνομα άλλου
-- και η καμπύλη ενεργοποίησης θα ήταν φαντασία. Το `auth.uid()` δεν
-- πλαστογραφείται από τον περιηγητή.
--
-- ΤΟ `search_path` ΚΑΡΦΩΝΕΤΑΙ. Σε `security definer` συνάρτηση, ένα
-- μεταβλητό search_path είναι ο κλασικός δρόμος ανύψωσης δικαιωμάτων: ο
-- καλών φτιάχνει δικό του σχήμα με ομώνυμη συνάρτηση και την εκτελεί με τα
-- δικαιώματα του ιδιοκτήτη.
create or replace function public.log_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  -- Ανώνυμος καλών δεν καταγράφεται. Δεν είναι σφάλμα: η δημόσια επιφάνεια
  -- δεν μετριέται από εδώ και μια σιωπηλή επιστροφή δεν σπάει τίποτα.
  if v_user is null then
    return;
  end if;

  -- ΤΟ ΟΝΟΜΑ ΕΛΕΓΧΕΤΑΙ, ΓΙΑΤΙ ΑΛΛΙΩΣ Ο ΠΙΝΑΚΑΣ ΓΕΜΙΖΕΙ ΣΚΟΥΠΙΔΙΑ. Ενα
  -- τυπογραφικό λάθος σε κλήση («proprty_added») θα δημιουργούσε σιωπηλά νέο
  -- γεγονός και η μέτρηση θα έλεγε ψέματα προς τα κάτω για μήνες, χωρίς
  -- κανένα σφάλμα πουθενά. Πεζά, αριθμοί και κάτω παύλα, ώς 48 χαρακτήρες.
  if p_event !~ '^[a-z][a-z0-9_]{2,47}$' then
    raise exception 'άκυρο όνομα γεγονότος: %', p_event;
  end if;

  -- Το φορτίο μένει μικρό επίτηδες. Δεν είναι χώρος για δεδομένα του χρήστη:
  -- είναι για μετρήσιμα χαρακτηριστικά (πακέτο, πλήθος, πηγή).
  if pg_column_size(p_props) > 2048 then
    raise exception 'πολύ μεγάλο φορτίο γεγονότος';
  end if;

  insert into public.product_events (user_id, event, props)
  values (v_user, p_event, coalesce(p_props, '{}'::jsonb))
  on conflict do nothing;
end;
$$;

revoke all on function public.log_event(text, jsonb) from public, anon;
grant execute on function public.log_event(text, jsonb) to authenticated;

-- ── ΤΙ ΒΛΕΠΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ ΤΟΥ ΠΡΟΪΟΝΤΟΣ ────────────────────────────────
-- Δύο όψεις, γιατί δύο είναι οι ερωτήσεις. Καμία από τις δύο δεν εκτίθεται
-- σε ρόλο του περιηγητή: διαβάζονται από τον SQL Editor ή από service role.
--
-- Η ΠΡΩΤΗ ΕΙΝΑΙ Η ΕΝΕΡΓΟΠΟΙΗΣΗ: πόσοι έφτασαν σε κάθε σκαλί, ανά εβδομάδα
-- εγγραφής. Αυτό είναι το χωνί, το μόνο νούμερο που πείθει αγοραστή.
create or replace view public.product_activation as
with first_seen as (
  select user_id, min(created_at) as joined_at
  from public.product_events
  group by user_id
)
select
  date_trunc('week', f.joined_at)::date                                     as εβδομάδα,
  count(distinct f.user_id)                                                 as χρήστες,
  count(distinct f.user_id) filter (where e.event = 'property_added')        as με_ακίνητο,
  count(distinct f.user_id) filter (where e.event = 'second_property_added') as με_δεύτερο,
  count(distinct f.user_id) filter (where e.event = 'expense_added')         as με_δαπάνη,
  count(distinct f.user_id) filter (where e.event = 'report_generated')      as με_αναφορά,
  count(distinct f.user_id) filter (where e.event = 'trial_started')         as σε_δοκιμή,
  count(distinct f.user_id) filter (where e.event = 'subscription_started')  as πλήρωσαν
from first_seen f
left join public.product_events e on e.user_id = f.user_id
group by 1
order by 1 desc;

-- Η ΔΕΥΤΕΡΗ ΕΙΝΑΙ Η ΔΙΑΤΗΡΗΣΗ: πόσοι γύρισαν και πότε σταμάτησαν.
create or replace view public.product_retention as
select
  user_id                                                   as χρήστης,
  min(created_at)::date                                     as πρώτη_μέρα,
  max(created_at)::date                                     as τελευταία_μέρα,
  count(distinct created_at::date)                          as ενεργές_μέρες,
  (max(created_at)::date - min(created_at)::date)           as διάρκεια_ημέρες,
  count(*)                                                  as γεγονότα
from public.product_events
group by user_id
order by τελευταία_μέρα desc;

revoke all on public.product_activation from anon, authenticated;
revoke all on public.product_retention from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
--  Η ΔΕΥΤΕΡΗ ΠΟΡΤΑ: ΓΕΓΟΝΟΤΑ ΠΟΥ ΤΑ ΞΕΡΕΙ ΜΟΝΟ Ο ΔΙΑΚΟΜΙΣΤΗΣ
-- ─────────────────────────────────────────────────────────────────────────
--  ΓΙΑΤΙ ΧΡΕΙΑΣΤΗΚΕ. Η έναρξη δοκιμής και η πληρωμή ΔΕΝ επιβεβαιώνονται από
--  τον περιηγητή. Ο χρήστης πατά «πληρωμή» και μπορεί να εγκαταλείψει στο
--  ταμείο του εμπόρου· αν το γεγονός γραφόταν στην ανακατεύθυνση, το χωνί θα
--  έλεγε ότι πλήρωσαν άνθρωποι που δεν πλήρωσαν ποτέ. Η μόνη πηγή αλήθειας
--  είναι το webhook του εμπόρου, που τρέχει χωρίς συνεδρία χρήστη.
--
--  ΓΙΑΤΙ ΔΕΥΤΕΡΗ RPC ΚΑΙ ΟΧΙ ΑΠΕΥΘΕΙΑΣ ΓΡΑΨΙΜΟ ΣΤΟΝ ΠΙΝΑΚΑ. Ο φύλακας
--  guard-service-only-tables απαγορεύει το `.from('product_events')` σε κάθε
--  αρχείο της εφαρμογής. Σωστά: η αξία του κανόνα είναι ότι δεν έχει
--  εξαιρέσεις. Μια δεύτερη πόρτα με ρητά δικαιώματα κρατά τον κανόνα άθικτο.
--
--  Η ΔΙΑΦΟΡΑ ΑΠΟ ΤΗΝ ΠΡΩΤΗ ΠΟΡΤΑ ΕΙΝΑΙ ΜΙΑ: εδώ ο χρήστης ΔΙΝΕΤΑΙ. Γι' αυτό
--  ακριβώς δεν την αγγίζει ποτέ ο περιηγητής: με δικαίωμα εκτέλεσης, ο
--  καθένας θα έγραφε γεγονότα στο όνομα οποιουδήποτε.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.log_event_for(p_user uuid, p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null then
    return;
  end if;
  if p_event !~ '^[a-z][a-z0-9_]{2,47}$' then
    raise exception 'άκυρο όνομα γεγονότος: %', p_event;
  end if;
  if pg_column_size(p_props) > 2048 then
    raise exception 'πολύ μεγάλο φορτίο γεγονότος';
  end if;
  insert into public.product_events (user_id, event, props)
  values (p_user, p_event, coalesce(p_props, '{}'::jsonb))
  on conflict do nothing;
end;
$$;

revoke all on function public.log_event_for(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_event_for(uuid, text, jsonb) to service_role;
