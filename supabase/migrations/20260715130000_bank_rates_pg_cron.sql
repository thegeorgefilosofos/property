-- ─────────────────────────────────────────────────────────────────────────────
-- Στεγαστικά επιτόκια τραπεζών: μηνιαία ενημέρωση μέσω pg_cron → Edge Function
-- `bank-rates-updater`, που ερευνά τρέχουσες τιμές με το Anthropic web_search και
-- γράφει έγκυρες γραμμές στο `bank_rates` (αμυντικά — ποτέ δεν χαλάει καλά δεδομένα).
--
-- Γιατί μηνιαία (όχι καθημερινά): τα σταθερά επιτόκια τραπεζών αλλάζουν σπάνια, και
-- δεν υπάρχει επίσημο feed — η έρευνα web είναι best-effort. Το verified_at μένει
-- φρέσκο χωρίς καθημερινό κόπο.
--
-- ── One-time setup ──
--   1) Deploy:  supabase functions deploy bank-rates-updater --no-verify-jwt
--   2) Secret:  supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."
--   3) Vault (SQL Editor):
--        select vault.create_secret(
--          'https://<PROJECT_REF>.functions.supabase.co/bank-rates-updater',
--          'bank_rates_fn_url', 'URL του bank-rates-updater Edge Function');
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

grant usage on schema cron to postgres;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bank-rates-monthly') then
    perform cron.unschedule('bank-rates-monthly');
  end if;
end $$;

-- 1η κάθε μήνα, 06:30 UTC.
select cron.schedule(
  'bank-rates-monthly',
  '30 6 1 * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'bank_rates_fn_url'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 180000
  );
  $cron$
);
