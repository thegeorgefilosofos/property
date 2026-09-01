-- ═══════════════════════════════════════════════════════════════════════════
-- Platform baseline · Scheduling (companion to 00000000000000_baseline.sql).
--
-- `supabase db dump` does not capture pg_cron jobs (they live in the `cron`
-- schema). This migration reproduces the FINAL state of every scheduled job, so
-- a from-scratch rebuild has them. Each job is env-agnostic:
--   • its shared secret comes from public.cron_secrets ('email_cron'), and
--   • its target URL is built from a per-environment base URL read from
--     vault.decrypted_secrets ('functions_base_url'), falling back to the
--     production host when that secret is absent — so the exact same definition
--     is correct on production (no secret ⇒ prod URL, unchanged) and on staging
--     (set `functions_base_url` in the staging vault ⇒ staging URL).
-- Wrapped in a pg_cron guard and unschedule-then-schedule, so it is idempotent
-- and safe on a project where the extension or secrets are not yet configured
-- (the job simply no-ops at runtime).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_base text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
    'https://aromvduuxtcrzmwwvnej.supabase.co');
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;  -- no scheduler on this project yet; nothing to do
  end if;

  -- send-reminders-daily — 06:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-reminders-daily') then perform cron.unschedule('send-reminders-daily'); end if;
  perform cron.schedule('send-reminders-daily', '0 6 * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-reminders'));

  -- market-data-daily — 08:00 UTC
  -- Η διεύθυνση χτίζεται από το `v_base`, όπως και στις άλλες πέντε εργασίες.
  -- Πριν διαβαζόταν από δικό της μυστικό του vault ΧΩΡΙΣ εφεδρεία: όταν έλειπε,
  -- το `url` γινόταν NULL και η εργασία δεν έστελνε τίποτα, χωρίς σφάλμα και
  -- χωρίς κανένα σημάδι. Η διεύθυνση συνάρτησης άκρου δεν είναι μυστικό.
  if exists (select 1 from cron.job where jobname = 'market-data-daily') then perform cron.unschedule('market-data-daily'); end if;
  perform cron.schedule('market-data-daily', '0 8 * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/market-data-updater'));

  -- bank-rates-monthly — 06:30 UTC on the 1st (ίδια διόρθωση)
  if exists (select 1 from cron.job where jobname = 'bank-rates-monthly') then perform cron.unschedule('bank-rates-monthly'); end if;
  perform cron.schedule('bank-rates-monthly', '30 6 1 * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 180000);
  $cron$, v_base || '/functions/v1/bank-rates-updater'));

  -- send-newsletter-weekly — Tue 08:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-newsletter-weekly') then perform cron.unschedule('send-newsletter-weekly'); end if;
  perform cron.schedule('send-newsletter-weekly', '0 8 * * 2', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-newsletter'));

  -- send-market-digest-weekly — Mon 07:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-market-digest-weekly') then perform cron.unschedule('send-market-digest-weekly'); end if;
  perform cron.schedule('send-market-digest-weekly', '0 7 * * 1', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-market-digest'));

  -- send-monthly-statements — 1st @ 07:30 UTC
  if exists (select 1 from cron.job where jobname = 'send-monthly-statements') then perform cron.unschedule('send-monthly-statements'); end if;
  perform cron.schedule('send-monthly-statements', '30 7 1 * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-monthly-statements'));

  -- email-outbox-schedule / email-outbox-drain — every 5 minutes
  if exists (select 1 from cron.job where jobname = 'email-outbox-schedule') then perform cron.unschedule('email-outbox-schedule'); end if;
  perform cron.schedule('email-outbox-schedule', '*/5 * * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron' limit 1)),
      body    := '{}'::jsonb);
  $cron$, v_base || '/functions/v1/schedule-email-outbox'));
  if exists (select 1 from cron.job where jobname = 'email-outbox-drain') then perform cron.unschedule('email-outbox-drain'); end if;
  perform cron.schedule('email-outbox-drain', '*/5 * * * *', $cron$ select public.drain_email_outbox(100); $cron$);

  -- feedback-draw-monthly — 1st @ 03:00 UTC
  if exists (select 1 from cron.job where jobname = 'feedback-draw-monthly') then perform cron.unschedule('feedback-draw-monthly'); end if;
  perform cron.schedule('feedback-draw-monthly', '0 3 1 * *', $cron$ select public.draw_due_feedback_winners(); $cron$);
end $$;
