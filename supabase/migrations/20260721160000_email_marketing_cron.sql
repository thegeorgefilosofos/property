-- ═══════════════════════════════════════════════════════════════════════════
-- pg_cron για τους αυτόματους ενημερωτικούς αυτοματισμούς email:
--   • send-newsletter    — «Νέες δυνατότητες» (όποτε υπάρχουν αδημοσίευτες
--     ανακοινώσεις). Τρέχει κάθε Τρίτη 08:00 UTC.
--   • send-market-digest — εβδομαδιαία μεταβολή επιτοκίων. Κάθε Δευτέρα 07:00 UTC.
--
-- Ίδιο, ασφαλές μοτίβο με το reminders_pg_cron: το URL της function και το
-- x-cron-secret διαβάζονται από το vault, ώστε να μη γράφονται σε plaintext.
--
-- ── One-time setup (τρέξε ΜΙΑ φορά, βάζοντας τα δικά σου URL/secrets) ──────────
--   select vault.create_secret('https://<PROJECT_REF>.functions.supabase.co/send-newsletter',    'newsletter_fn_url');
--   select vault.create_secret('<NEWSLETTER_CRON_SECRET>',                                        'newsletter_cron_secret');
--   select vault.create_secret('https://<PROJECT_REF>.functions.supabase.co/send-market-digest',  'market_digest_fn_url');
--   select vault.create_secret('<MARKET_DIGEST_CRON_SECRET>',                                      'market_digest_cron_secret');
-- (Τα ίδια secrets — NEWSLETTER_CRON_SECRET / MARKET_DIGEST_CRON_SECRET — ορίζονται
--  και ως secrets της κάθε Edge Function ώστε να ταιριάζει το x-cron-secret.)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-newsletter-weekly') then perform cron.unschedule('send-newsletter-weekly'); end if;
  if exists (select 1 from cron.job where jobname = 'send-market-digest-weekly') then perform cron.unschedule('send-market-digest-weekly'); end if;
end $$;

select cron.schedule('send-newsletter-weekly', '0 8 * * 2', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_fn_url'),
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'newsletter_cron_secret')),
    body    := '{}'::jsonb
  );
$$);

select cron.schedule('send-market-digest-weekly', '0 7 * * 1', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'market_digest_fn_url'),
    headers := jsonb_build_object('Content-Type','application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'market_digest_cron_secret')),
    body    := '{}'::jsonb
  );
$$);
