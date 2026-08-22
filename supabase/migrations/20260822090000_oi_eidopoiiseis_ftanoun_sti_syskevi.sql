-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΕΙΔΟΠΟΙΗΣΕΙΣ ΦΤΑΝΟΥΝ ΣΤΗ ΣΥΣΚΕΥΗ, ΟΧΙ ΜΟΝΟ ΣΤΗΝ ΟΘΟΝΗ ΜΑΣ
-- ─────────────────────────────────────────────────────────────────────────
-- Η εφαρμογή είναι ήδη εγκαταστάσιμη (PWA) και έχει service worker. Ο,τι ξέρει
-- όμως το λέει ΜΟΝΟ σε όποιον την ανοίξει. Μια προθεσμία που περνά χωρίς να τη
-- δει κανείς είναι πρόστιμο.
--
-- ── ΤΙ ΚΡΑΤΑΕΙ ΑΥΤΟΣ Ο ΠΙΝΑΚΑΣ, ΚΑΙ ΤΙ ΣΗΜΑΙΝΕΙ ─────────────────────────
-- Μία γραμμή ανά ΣΥΣΚΕΥΗ, όχι ανά χρήστη: ο ίδιος άνθρωπος έχει κινητό,
-- tablet και υπολογιστή, και κάθε ένα δίνει δικό του `endpoint` με δικά του
-- κλειδιά κρυπτογράφησης. Το `endpoint` είναι η διεύθυνση στην υπηρεσία push
-- του κατασκευαστή (Google, Apple, Mozilla) και είναι ΜΟΝΑΔΙΚΟ: αν η ίδια
-- συσκευή ξαναγραφτεί, ενημερώνεται η γραμμή της.
--
-- ── ΤΑ ΚΛΕΙΔΙΑ ΔΕΝ ΕΙΝΑΙ ΔΙΚΑ ΜΑΣ ΜΥΣΤΙΚΑ ───────────────────────────────
-- Το `p256dh` και το `auth` τα παράγει ο ΠΕΡΙΗΓΗΤΗΣ και μ' αυτά κρυπτογραφείται
-- το μήνυμα ΓΙΑ ΕΚΕΙΝΟΝ. Η υπηρεσία push μεταφέρει κλειστό φάκελο: δεν διαβάζει
-- ούτε το ποσό ούτε τον πάροχο. Γι' αυτό επιτρέπεται να λέει η ειδοποίηση
-- πράγματα σαν «ΔΕΗ, 87,45 € αύριο» — κανείς ενδιάμεσος δεν τα βλέπει.
--
-- ── ΓΙΑΤΙ ΜΕΤΡΑΜΕ ΑΠΟΤΥΧΙΕΣ ─────────────────────────────────────────────
-- Μια συνδρομή πεθαίνει σιωπηλά: ο χρήστης σβήνει την εφαρμογή, καθαρίζει τον
-- περιηγητή, αλλάζει τηλέφωνο. Η υπηρεσία απαντά 404 ή 410 και η γραμμή πρέπει
-- να φύγει, αλλιώς στέλνουμε για πάντα σε διεύθυνση που δεν υπάρχει.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id           uuid primary key not null default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  failures     integer not null default 0
);

comment on table public.push_subscriptions is
  'Μία γραμμή ανά συσκευή που δέχεται ειδοποιήσεις. Τα κλειδιά τα παράγει ο περιηγητής: η υπηρεσία push μεταφέρει κλειστό φάκελο.';

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
  for select using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions
  for insert with check ((select auth.uid()) = user_id);

-- Η ΕΝΗΜΕΡΩΣΗ ΕΠΙΤΡΕΠΕΤΑΙ ΓΙΑ ΕΝΑΝ ΛΟΓΟ: η ίδια συσκευή ξαναγράφεται. Ο
-- περιηγητής δίνει νέα κλειδιά όταν ανανεώσει τη συνδρομή της, με το ΙΔΙΟ
-- endpoint, και το `upsert` πρέπει να μπορεί να πατήσει πάνω στη γραμμή της.
drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
create policy push_subscriptions_own_update on public.push_subscriptions
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
  for delete using ((select auth.uid()) = user_id);

-- ── ΤΟ ΙΣΤΟΡΙΚΟ ΑΠΟΣΤΟΛΗΣ ΤΟ ΓΡΑΦΕΙ ΜΟΝΟ Ο ΔΙΑΚΟΜΙΣΤΗΣ ───────────────────
-- Ο χρήστης μπορεί να ενημερώσει τη γραμμή του (παραπάνω), αλλά ΟΧΙ να πει
-- ψέματα για το πότε του στάλθηκε κάτι ή πόσες φορές απέτυχε: αυτά τα δύο
-- κρίνουν πότε σβήνεται μια νεκρή συνδρομή.
create or replace function public.lock_push_delivery()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.last_sent_at := old.last_sent_at;
    new.failures     := old.failures;
    new.user_id      := old.user_id;
    new.created_at   := old.created_at;
  end if;
  return new;
end;
$$;

comment on function public.lock_push_delivery() is
  'Το πότε στάλθηκε και πόσες φορές απέτυχε μια συνδρομή το γράφει ο διακομιστής. Ο χρήστης ανανεώνει μόνο τα κλειδιά της συσκευής του.';

drop trigger if exists trg_lock_push_delivery on public.push_subscriptions;
create trigger trg_lock_push_delivery
  before update on public.push_subscriptions
  for each row execute function public.lock_push_delivery();

-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ ΝΕΚΡΟ ΚΑΝΑΛΙ ΦΕΥΓΕΙ: `push_devices` ΚΑΙ `messaging_prefs.wants_push`
-- ─────────────────────────────────────────────────────────────────────────
-- ΔΥΟ ΠΙΝΑΚΕΣ ΓΙΑ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ ΕΙΝΑΙ ΕΝΑΣ ΠΑΡΑΠΑΝΩ, ΚΑΙ Ο ΠΑΛΙΟΣ ΔΕΝ ΜΠΟΡΕΙ
-- ΝΑ ΔΟΥΛΕΨΕΙ. Ο `push_devices` κρατούσε κουπόνια FCM και τα διάβαζε μία μόνο
-- διαδρομή, η dispatch-message, για να τα στείλει στο
-- `fcm.googleapis.com/fcm/send` — τη ΔΙΕΠΑΦΗ ΠΟΥ Η GOOGLE ΕΚΛΕΙΣΕ ΟΡΙΣΤΙΚΑ
-- ΣΤΙΣ 20 ΙΟΥΝΙΟΥ 2024. Και δεν έγραψε ποτέ κανείς γραμμή μέσα του: καμία
-- οθόνη, κανένα script, καμία συνάρτηση.
--
-- Ο,τι κρατούσε το `wants_push` ήταν η προτίμηση για εκείνο ακριβώς το κανάλι.
-- Χωρίς κανάλι, είναι διακόπτης χωρίς καλώδιο.
--
-- ΤΙ ΤΑ ΑΝΤΙΚΑΘΙΣΤΑ. Ο `push_subscriptions` από πάνω, με το πρότυπο του W3C
-- (RFC 8291) και κλειδιά VAPID: χωρίς λογαριασμό Google, με κρυπτογράφηση από
-- άκρο σε άκρο, και με αποστολέα την ίδια την εφαρμογή.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists public.push_devices;
alter table if exists public.messaging_prefs drop column if exists wants_push;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΠΟΤΕ ΦΕΥΓΟΥΝ ΟΙ ΕΙΔΟΠΟΙΗΣΕΙΣ
-- ─────────────────────────────────────────────────────────────────────────
-- 05:00 UTC, δηλαδή 08:00 το καλοκαίρι και 07:00 τον χειμώνα σε ελληνική ώρα:
-- πριν από τη δουλειά, αφού ξυπνήσει ο κόσμος. Οι υπενθυμίσεις με email
-- φεύγουν στις 06:00 UTC· η μία ώρα διαφορά δεν είναι αισθητική, είναι ώστε τα
-- δύο κανάλια να μη χτυπούν το ίδιο δευτερόλεπτο για το ίδιο θέμα.
--
-- Η ΔΙΕΥΘΥΝΣΗ ΕΙΝΑΙ ΤΗΣ ΕΦΑΡΜΟΓΗΣ, ΟΧΙ ΤΩΝ ΣΥΝΑΡΤΗΣΕΩΝ. Η κρυπτογράφηση web
-- push γίνεται με τη βιβλιοθήκη `web-push` στον διακομιστή του Next, εκεί όπου
-- ζει και το ιδιωτικό κλειδί VAPID. Το `app_base_url` του vault δίνει τη
-- διεύθυνση ανά περιβάλλον, με την παραγωγή ως προεπιλογή — ίδιο μοτίβο με το
-- `functions_base_url` (00000000000002_scheduling.sql).
--
-- ΤΟ ΜΥΣΤΙΚΟ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΟΥ ΧΡΗΣΙΜΟΠΟΙΟΥΝ ΟΛΕΣ ΟΙ ΕΡΓΑΣΙΕΣ. Η εφαρμογή το
-- διαβάζει από τη μεταβλητή περιβάλλοντος `CRON_SECRET` και το συγκρίνει σε
-- σταθερό χρόνο. Οσο δεν έχει οριστεί, η διαδρομή απαντά 401 σε ΟΛΟΥΣ.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_app text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url'),
    'https://property-tan-gamma.vercel.app');
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;  -- δεν υπάρχει χρονοδιάγραμμα σε αυτό το έργο ακόμη
  end if;

  if exists (select 1 from cron.job where jobname = 'send-push-daily') then perform cron.unschedule('send-push-daily'); end if;
  perform cron.schedule('send-push-daily', '0 5 * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_app || '/api/push'));
end $$;
