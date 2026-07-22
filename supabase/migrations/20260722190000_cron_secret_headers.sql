-- ═══════════════════════════════════════════════════════════════════════════
-- Send the shared cron secret with the market-data and bank-rates jobs.
--
-- The `market-data-updater` and `bank-rates-updater` edge functions were changed
-- to require authorization (they write public rate data and spend the Anthropic
-- quota). Their pg_cron jobs previously posted with no secret, so we reschedule
-- them here to include the `x-cron-secret` header — the same zero-config pattern
-- the email jobs already use (`20260721160000_email_marketing_cron.sql`). The URL
-- source is unchanged.
--
-- Idempotent: reschedule is unschedule-then-schedule; the secret is ensured first.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

-- Guarantee the shared cron secret exists (normally seeded by 20260721155000).
insert into public.cron_secrets (name, secret)
select 'email_cron', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.cron_secrets where name = 'email_cron');

-- ── market-data-daily ───────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'market-data-daily') then
    perform cron.unschedule('market-data-daily');
  end if;
end $$;
select cron.schedule(
  'market-data-daily',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'market_data_fn_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

-- ── bank-rates-monthly ──────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bank-rates-monthly') then
    perform cron.unschedule('bank-rates-monthly');
  end if;
end $$;
select cron.schedule(
  'bank-rates-monthly',
  '30 6 1 * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'bank_rates_fn_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $cron$
);
