-- ═══════════════════════════════════════════════════════════════════════════
-- pg_cron για τους αυτόματους ενημερωτικούς αυτοματισμούς email:
--   • send-newsletter    — «Νέες δυνατότητες» (όποτε υπάρχουν αδημοσίευτες
--     ανακοινώσεις). Τρέχει κάθε Τρίτη 08:00 UTC.
--   • send-market-digest — εβδομαδιαία μεταβολή επιτοκίων. Κάθε Δευτέρα 07:00 UTC.
--
-- ΑΥΘΕΝΤΙΚΟΠΟΙΗΣΗ (zero-config): κάθε job στέλνει το x-cron-secret διαβάζοντας το
-- κοινό μυστικό από τον πίνακα public.cron_secrets (βλ. 20260721155000_cron_secrets).
-- Η αντίστοιχη Edge Function το επαληθεύει με τον service-role client της. Δεν
-- χρειάζεται κανένα μυστικό στο dashboard — τίποτα χειροκίνητο.
--
-- Απαιτεί: extensions pg_cron + pg_net ενεργά (υπάρχουν ήδη — τα χρησιμοποιεί το
-- send-reminders-daily).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── send-newsletter: κάθε Τρίτη 08:00 UTC ────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-newsletter-weekly') then
    perform cron.unschedule('send-newsletter-weekly');
  end if;
end $$;

select cron.schedule('send-newsletter-weekly', '0 8 * * 2', $$
  select net.http_post(
    url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-newsletter',
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

-- ── send-market-digest: κάθε Δευτέρα 07:00 UTC ───────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-market-digest-weekly') then
    perform cron.unschedule('send-market-digest-weekly');
  end if;
end $$;

select cron.schedule('send-market-digest-weekly', '0 7 * * 1', $$
  select net.http_post(
    url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-market-digest',
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

-- ── Επιδιόρθωση send-reminders-daily: στείλε το x-cron-secret από τον πίνακα ──
-- ώστε να αυθεντικοποιείται μέσω της DB-secret οδού (το env REMINDERS_CRON_SECRET
-- στο dashboard είναι λανθασμένα ίδιο με το RESEND_API_KEY). Διατηρεί το ίδιο
-- πρόγραμμα — αλλάζει μόνο την εντολή.
do $$
declare jid int;
begin
  select jobid into jid from cron.job where jobname = 'send-reminders-daily';
  if jid is not null then
    perform cron.alter_job(job_id := jid, command := $cmd$
  select net.http_post(
    url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
    body    := '{}'::jsonb, timeout_milliseconds := 120000);
$cmd$);
  end if;
end $$;
