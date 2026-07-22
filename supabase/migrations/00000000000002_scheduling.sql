-- ═══════════════════════════════════════════════════════════════════════════
-- Platform baseline · Scheduling (companion to 00000000000000_baseline.sql).
--
-- `supabase db dump` does not capture pg_cron jobs (they live in the `cron`
-- schema). This migration reproduces the FINAL state of every scheduled job, so
-- a from-scratch rebuild has them. Each job is env-agnostic: it reads its shared
-- secret from public.cron_secrets and (where used) its target URL from
-- vault.decrypted_secrets — both set per-environment, so the same definition is
-- correct on production and staging. Wrapped in a pg_cron guard and
-- unschedule-then-schedule, so it is idempotent and safe on a project where the
-- extension or secrets are not yet configured (the job simply no-ops at runtime).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;  -- no scheduler on this project yet; nothing to do
  end if;

  -- helper: (re)schedule by name
  perform 1;

  -- send-reminders-daily — 06:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-reminders-daily') then perform cron.unschedule('send-reminders-daily'); end if;
  perform cron.schedule('send-reminders-daily', '0 6 * * *', $cron$
    select net.http_post(
      url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);

  -- market-data-daily — 08:00 UTC
  if exists (select 1 from cron.job where jobname = 'market-data-daily') then perform cron.unschedule('market-data-daily'); end if;
  perform cron.schedule('market-data-daily', '0 8 * * *', $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'market_data_fn_url'),
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);

  -- bank-rates-monthly — 06:30 UTC on the 1st
  if exists (select 1 from cron.job where jobname = 'bank-rates-monthly') then perform cron.unschedule('bank-rates-monthly'); end if;
  perform cron.schedule('bank-rates-monthly', '30 6 1 * *', $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'bank_rates_fn_url'),
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 180000);
  $cron$);

  -- send-newsletter-weekly — Tue 08:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-newsletter-weekly') then perform cron.unschedule('send-newsletter-weekly'); end if;
  perform cron.schedule('send-newsletter-weekly', '0 8 * * 2', $cron$
    select net.http_post(
      url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-newsletter',
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);

  -- send-market-digest-weekly — Mon 07:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-market-digest-weekly') then perform cron.unschedule('send-market-digest-weekly'); end if;
  perform cron.schedule('send-market-digest-weekly', '0 7 * * 1', $cron$
    select net.http_post(
      url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-market-digest',
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);

  -- send-monthly-statements — 1st @ 07:30 UTC
  if exists (select 1 from cron.job where jobname = 'send-monthly-statements') then perform cron.unschedule('send-monthly-statements'); end if;
  perform cron.schedule('send-monthly-statements', '30 7 1 * *', $cron$
    select net.http_post(
      url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-monthly-statements',
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$);

  -- email-outbox-schedule / email-outbox-drain — every 5 minutes
  if exists (select 1 from cron.job where jobname = 'email-outbox-schedule') then perform cron.unschedule('email-outbox-schedule'); end if;
  perform cron.schedule('email-outbox-schedule', '*/5 * * * *', $cron$
    select net.http_post(
      url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/schedule-email-outbox',
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron' limit 1)),
      body    := '{}'::jsonb);
  $cron$);
  if exists (select 1 from cron.job where jobname = 'email-outbox-drain') then perform cron.unschedule('email-outbox-drain'); end if;
  perform cron.schedule('email-outbox-drain', '*/5 * * * *', $cron$ select public.drain_email_outbox(100); $cron$);

  -- feedback-draw-monthly — 1st @ 03:00 UTC
  if exists (select 1 from cron.job where jobname = 'feedback-draw-monthly') then perform cron.unschedule('feedback-draw-monthly'); end if;
  perform cron.schedule('feedback-draw-monthly', '0 3 1 * *', $cron$ select public.draw_due_feedback_winners(); $cron$);
end $$;
