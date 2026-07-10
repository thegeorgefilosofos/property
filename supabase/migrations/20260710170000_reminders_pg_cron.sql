-- ─────────────────────────────────────────────────────────────────────────────
-- Αυτόματες υπενθυμίσεις email: pg_cron καλεί καθημερινά το Edge Function
-- `send-reminders`. Μέχρι τώρα το function υπήρχε αλλά ΔΕΝ τρέχει προγραμματισμένα —
-- αυτή η migration το κάνει πραγματικά αυτόματο (backend, χωρίς παρέμβαση χρήστη).
--
-- Πώς δουλεύει: κάθε μέρα στις 06:00 UTC (~08:00–09:00 ώρα Ελλάδας) το pg_cron
-- κάνει HTTP POST (μέσω pg_net) στο endpoint του function, με το x-cron-secret.
-- Το function ελέγχει το μυστικό, διαβάζει τα calendar_events, εφαρμόζει τα
-- lead-times του χρήστη (7/3/1 ημέρα, σήμερα, εκπρόθεσμα) + το dunning ενοικίου,
-- στέλνει τα emails μέσω Resend και καταγράφει στο notification_log (μη διπλοστολή).
--
-- ΑΣΦΑΛΕΙΑ (least privilege): η κλήση χρησιμοποιεί ΕΝΑ αποκλειστικό cron secret —
-- ΟΧΙ το service-role key. Το ίδιο μοτίβο με το ical-sync. Τα δύο μυστικά (URL του
-- function + cron secret) ζουν στο Supabase Vault, ΟΧΙ σε αυτό το αρχείο.
--
-- ── One-time setup (τρέξε ΜΙΑ φορά· βλ. supabase/functions/send-reminders/README.md) ──
--   1) Θέσε το ίδιο μυστικό στο function:
--        supabase secrets set REMINDERS_CRON_SECRET="<τυχαίο-μακρύ-μυστικό>"
--   2) Στο SQL Editor, αποθήκευσε URL + μυστικό στο Vault:
--        select vault.create_secret(
--          'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
--          'reminders_fn_url', 'URL του send-reminders Edge Function');
--        select vault.create_secret(
--          '<το-ίδιο-μυστικό>',
--          'reminders_cron_secret', 'x-cron-secret για το send-reminders');
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

grant usage on schema cron to postgres;

-- Idempotent: αν το job υπάρχει ήδη (re-run), ξεπρογραμμάτισέ το πρώτα.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminders-daily') then
    perform cron.unschedule('send-reminders-daily');
  end if;
end $$;

-- Καθημερινό sweep στις 06:00 UTC. Το net.http_post επιστρέφει αμέσως (async)·
-- η πραγματική δουλειά + το logging γίνονται μέσα στο function.
select cron.schedule(
  'send-reminders-daily',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_fn_url'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
