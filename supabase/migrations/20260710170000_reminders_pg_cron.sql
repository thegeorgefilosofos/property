-- ─────────────────────────────────────────────────────────────────────────────
-- Αυτόματες υπενθυμίσεις email: pg_cron καλεί καθημερινά το Edge Function
-- `send-reminders`. Μέχρι τώρα το function υπήρχε αλλά ΔΕΝ τρέχει προγραμματισμένα —
-- αυτή η migration το κάνει πραγματικά αυτόματο (backend, χωρίς παρέμβαση χρήστη).
--
-- Πώς δουλεύει: κάθε μέρα στις 06:00 UTC (~08:00–09:00 ώρα Ελλάδας) το pg_cron
-- κάνει HTTP POST (μέσω pg_net) στο endpoint του function. Το function διαβάζει τα
-- calendar_events (source 'checklist' κ.λπ.), εφαρμόζει τα lead-times του χρήστη
-- (7/3/1 ημέρα, σήμερα, εκπρόθεσμα) και το dunning ενοικίου, στέλνει τα emails μέσω
-- Resend και καταγράφει στο notification_log ώστε να μη διπλοστέλνει.
--
-- ΑΣΦΑΛΕΙΑ: το URL του function και το service-role key ΔΕΝ μπαίνουν σε αυτό το
-- αρχείο (θα κατέληγαν στο git). Αποθηκεύονται στο Supabase Vault και διαβάζονται
-- τη στιγμή εκτέλεσης. Τρέξε ΜΙΑ φορά στο SQL Editor (τιμές από Project Settings):
--
--   select vault.create_secret(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--     'reminders_fn_url', 'URL του send-reminders Edge Function');
--   select vault.create_secret(
--     '<SERVICE_ROLE_KEY>',
--     'reminders_service_key', 'service_role key για κλήση του function');
--
-- Αν αργότερα αλλάξουν, ενημέρωσέ τα με vault.update_secret(id, new_value).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ιδανικά ο ρόλος postgres έχει ήδη πρόσβαση· εξασφάλισέ την ρητά για το cron schema.
grant usage on schema cron to postgres;

-- Ξαναστήσιμο idempotently: αν το job υπάρχει ήδη (re-run της migration), ξεπρογραμμάτισέ το
-- πρώτα ώστε να μην υπάρχουν διπλά schedules με το ίδιο όνομα.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminders-daily') then
    perform cron.unschedule('send-reminders-daily');
  end if;
end $$;

-- Καθημερινό sweep στις 06:00 UTC. Το net.http_post επιστρέφει αμέσως (async)·
-- το ίδιο το function κάνει την πραγματική δουλειά και το logging.
select cron.schedule(
  'send-reminders-daily',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_fn_url'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_service_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
