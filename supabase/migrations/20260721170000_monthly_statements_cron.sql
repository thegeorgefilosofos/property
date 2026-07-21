-- ═══════════════════════════════════════════════════════════════════════════
-- pg_cron για την αυτόματη μηνιαία κατάσταση εισπράξεων (send-monthly-statements).
-- Τρέχει την 1η κάθε μήνα 07:30 UTC και στέλνει στον ιδιοκτήτη την κατάσταση του
-- προηγούμενου μήνα. Αυθεντικοποίηση με το κοινό μυστικό του πίνακα
-- public.cron_secrets (βλ. 20260721155000_cron_secrets) — τίποτα χειροκίνητο.
--
-- Απαιτεί: cron_secrets να υπάρχει· τη function send-monthly-statements deployed.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-monthly-statements') then
    perform cron.unschedule('send-monthly-statements');
  end if;
end $$;

select cron.schedule('send-monthly-statements', '30 7 1 * *', $$
  select net.http_post(
    url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-monthly-statements',
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
