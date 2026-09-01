-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΤΡΟΦΟΔΟΣΙΑ ΔΕΝ ΠΕΡΙΜΕΝΕΙ ΑΝΘΡΩΠΟ ΝΑ ΘΥΜΗΘΕΙ ΔΥΟ ΡΥΘΜΙΣΕΙΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΒΡΕΘΗΚΕ. Η νέα τροφοδοσία επιτοκίων ήταν σωστή, ανεβασμένη και
-- δοκιμασμένη — και δεν θα έτρεχε ΠΟΤΕ, για δύο λόγους που κανένα μήνυμα δεν
-- τους έλεγε. Και οι δύο σιωπηλοί: η εργασία δεν αποτυγχάνει, απλώς δεν κάνει
-- τίποτα· και ο πίνακας μένει άδειος χωρίς κανένα σφάλμα πουθενά.
--
-- (α) Η ΔΙΕΥΘΥΝΣΗ ΕΡΧΟΤΑΝ ΜΟΝΟ ΑΠΟ ΤΟ vault, ΧΩΡΙΣ ΕΝΑΛΛΑΚΤΙΚΗ. Πέντε από τις
--     επτά προγραμματισμένες εργασίες χτίζουν τη διεύθυνσή τους ως
--     `v_base || '/functions/v1/<όνομα>'`, όπου το `v_base` πέφτει στη
--     διεύθυνση της παραγωγής όταν λείπει το μυστικό του vault. ΔΥΟ όχι: η
--     `market-data-daily` και η `bank-rates-monthly` διάβαζαν ένα δικό τους
--     μυστικό (`market_data_fn_url`, `bank_rates_fn_url`) και τίποτε άλλο. Οταν
--     λείπει, το `url` γίνεται NULL και η `net.http_post` δεν στέλνει τίποτα.
--
--     Η διεύθυνση μιας συνάρτησης άκρου ΔΕΝ είναι μυστικό: είναι δημόσια και
--     παράγεται από το αναγνωριστικό του έργου, που ήδη υπάρχει γραμμένο σε
--     αυτό το αρχείο ως εφεδρεία των άλλων πέντε. Το ότι ζούσε σε θησαυροφυλάκιο
--     δεν πρόσθετε ασφάλεια· πρόσθετε ένα βήμα που, όταν ξεχαστεί, σβήνει
--     αθόρυβα μια ολόκληρη λειτουργία.
--
-- (β) ΤΟ ΚΟΙΝΟ ΜΥΣΤΙΚΟ ΔΕΝ ΕΙΧΕ ΠΟΤΕ ΓΕΝΝΗΘΕΙ. Κάθε εργασία στέλνει το
--     `public.cron_secrets` με όνομα `email_cron` ως κεφαλίδα `x-cron-secret`
--     και κάθε συνάρτηση άκρου το διαβάζει από τον ΙΔΙΟ πίνακα για να το
--     συγκρίνει (`_shared/auth.ts`, τρίτη διαδρομή). Καμία μετανάστευση δεν το
--     δημιουργούσε: υπήρχε συνάρτηση που γράφει το `emails_live`, όχι το
--     `email_cron`. Χωρίς γραμμή, η κεφαλίδα φεύγει κενή, η συνάρτηση απαντά
--     401 και η `drain_email_outbox` κάνει `return 0` χωρίς να παραπονεθεί.
--
-- ΓΙΑΤΙ ΜΠΟΡΕΙ ΝΑ ΠΑΡΑΧΘΕΙ ΕΔΩ ΚΑΙ ΓΙΑΤΙ ΕΙΝΑΙ ΠΙΟ ΑΣΦΑΛΕΣ ΑΠΟ ΤΟ ΧΕΡΙ.
-- Το μυστικό είναι ΚΟΙΝΟ ΑΝΑΜΕΣΑ ΣΤΗ ΒΑΣΗ ΚΑΙ ΣΤΟΝ ΕΑΥΤΟ ΤΗΣ: ο αποστολέας
-- (pg_cron) και ο παραλήπτης (η συνάρτηση, με κλειδί υπηρεσίας) διαβάζουν ΤΗΝ
-- ΙΔΙΑ γραμμή. Δεν χρειάζεται να το δει άνθρωπος, να το αντιγράψει σε πίνακα
-- ρυθμίσεων ή να το στείλει σε συνομιλία. Παράγεται εδώ από 256 τυχαία bits,
-- δεν τυπώνεται πουθενά και ο πίνακας είναι ήδη κλειδωμένος σε ρόλο υπηρεσίας
-- (20260808120000). Ενα μυστικό που κανείς δεν είδε είναι μυστικό που κανείς
-- δεν διαρρέει.
--
-- ΤΟ `on conflict do nothing` ΕΙΝΑΙ ΟΥΣΙΩΔΕΣ: αν υπάρχει ήδη μυστικό, ΔΕΝ
-- αντικαθίσταται. Μια αντικατάσταση θα άλλαζε το κλειδί κάτω από εργασίες που
-- τρέχουν ήδη σωστά.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (β) Το κοινό μυστικό, μία φορά, χωρίς ανθρώπινο χέρι ────────────────────
-- Δύο UUID χωρίς παύλες: 64 δεκαεξαδικά ψηφία, 256 bits, από τη γεννήτρια του
-- πυρήνα της PostgreSQL. Καμία επέκταση δεν απαιτείται, άρα δεν μπορεί να
-- αποτύχει επειδή λείπει το pgcrypto.
insert into public.cron_secrets (name, secret)
values ('email_cron',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- ── (α) Οι δύο εργασίες αποκτούν την ίδια εφεδρεία με τις άλλες πέντε ───────
do $$
declare
  v_base text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
    'https://aromvduuxtcrzmwwvnej.supabase.co');
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron δεν είναι ενεργό: οι εργασίες δεν προγραμματίζονται';
    return;
  end if;

  -- market-data-daily — 08:00 UTC. Επιτόκια ΕΚΤ, Euribor και τα ελληνικά μέσα
  -- στεγαστικά, με ημερομηνία και πηγή ΑΝΑ ΤΙΜΗ (lib/market/ecb.ts).
  if exists (select 1 from cron.job where jobname = 'market-data-daily') then
    perform cron.unschedule('market-data-daily');
  end if;
  perform cron.schedule('market-data-daily', '0 8 * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/market-data-updater'));

  -- bank-rates-monthly — 06:30 UTC την 1η του μήνα.
  if exists (select 1 from cron.job where jobname = 'bank-rates-monthly') then
    perform cron.unschedule('bank-rates-monthly');
  end if;
  perform cron.schedule('bank-rates-monthly', '30 6 1 * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 180000);
  $cron$, v_base || '/functions/v1/bank-rates-updater'));
end $$;

-- ── ΤΟ ΠΡΩΤΟ ΠΕΡΑΣΜΑ ΓΙΝΕΤΑΙ ΤΩΡΑ, ΟΧΙ ΑΥΡΙΟ ΣΤΙΣ 08:00 ────────────────────
-- Χωρίς αυτό, η πρώτη πραγματική τιμή θα ερχόταν στην επόμενη εκτέλεση του
-- χρονοδιαγράμματος και ώς τότε η οθόνη θα έδειχνε τιμές χωρίς ημερομηνία. Η
-- κλήση είναι ασύγχρονη (`net.http_post` επιστρέφει αναγνωριστικό, δεν
-- περιμένει), οπότε δεν μπορεί να καθυστερήσει ή να ρίξει τη μετανάστευση.
do $$
declare
  v_base text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
    'https://aromvduuxtcrzmwwvnej.supabase.co');
  v_secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net δεν είναι ενεργό: το πρώτο πέρασμα παραλείπεται';
    return;
  end if;
  select secret into v_secret from public.cron_secrets where name = 'email_cron' limit 1;
  if v_secret is null then return; end if;

  perform net.http_post(
    url     := v_base || '/functions/v1/market-data-updater',
    headers := jsonb_build_object('Content-Type','application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb, timeout_milliseconds := 120000);
end $$;
