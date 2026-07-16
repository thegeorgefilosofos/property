-- ─────────────────────────────────────────────────────────────────────────────
-- Ζωντανά επιτόκια αγοράς: pg_cron καλεί καθημερινά το Edge Function
-- `market-data-updater`, που τραβάει Euribor (1/3/6/12 μηνών), επιτόκια ΕΚΤ και
-- μέσα επιτόκια στεγαστικών ΤτΕ από το ECB Data Portal και τα γράφει στο
-- `market_rates`. Μέχρι τώρα το function ΥΠΗΡΧΕ αλλά ΔΕΝ τρέχει προγραμματισμένα —
-- γι' αυτό τα επιτόκια έδειχναν στατικά. Αυτή η migration το κάνει πραγματικά
-- ζωντανό (backend, χωρίς παρέμβαση χρήστη).
--
-- Πώς δουλεύει: κάθε μέρα στις 08:00 UTC (μετά τη δημοσίευση Euribor) το pg_cron
-- κάνει HTTP POST (μέσω pg_net) στο endpoint του function. Το function διαβάζει
-- τις σειρές της ΕΚΤ και κάνει insert νέα γραμμή στο market_rates (με ιστορικό).
-- Το app (useMarketRates) διαβάζει πάντα την πιο πρόσφατη γραμμή και σημειώνει
-- ως «παλαιό» ό,τι είναι >48 ώρες.
--
-- Σημείωση για τα επιτόκια τραπεζών: δεν υπάρχει δημόσιο μηχανικά αναγνώσιμο feed
-- στεγαστικών επιτοκίων ελληνικών τραπεζών· ο πίνακας `bank_rates` παραμένει
-- επιμελημένο σύνολο με ημερομηνία επιβεβαίωσης (verified_at). Ζωντανά τραβιούνται
-- τα δείκτες αγοράς (Euribor/ΕΚΤ/ΤτΕ) που καθορίζουν και τα κυμαινόμενα.
--
-- ── One-time setup (τρέξε ΜΙΑ φορά) ──
--   1) Deploy το function (δημόσιο trigger, χωρίς JWT):
--        supabase functions deploy market-data-updater --no-verify-jwt
--   2) Στο SQL Editor αποθήκευσε το URL στο Vault:
--        select vault.create_secret(
--          'https://<PROJECT_REF>.functions.supabase.co/market-data-updater',
--          'market_data_fn_url', 'URL του market-data-updater Edge Function');
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

grant usage on schema cron to postgres;

-- Idempotent: αν το job υπάρχει ήδη (re-run), ξεπρογραμμάτισέ το πρώτα.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'market-data-daily') then
    perform cron.unschedule('market-data-daily');
  end if;
end $$;

-- Καθημερινή ενημέρωση στις 08:00 UTC. Το net.http_post επιστρέφει αμέσως (async)·
-- η πραγματική εργασία (fetch ΕΚΤ + insert) γίνεται μέσα στο function.
select cron.schedule(
  'market-data-daily',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'market_data_fn_url'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
