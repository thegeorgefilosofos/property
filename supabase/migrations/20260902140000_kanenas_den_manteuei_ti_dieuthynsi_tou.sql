-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΝΕΝΑΣ ΔΕΝ ΜΑΝΤΕΥΕΙ ΤΗ ΔΙΕΥΘΥΝΣΗ ΤΟΥ — ΚΑΙ ΤΟ STAGING ΚΑΛΟΥΣΕ ΤΗΝ ΠΑΡΑΓΩΓΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΜΕΤΡΗΘΗΚΕ (02/09/2026). Κάθε μετανάστευση που προγραμματίζει εργασία
-- γράφει την ίδια γραμμή:
--
--     v_base text := coalesce(
--       (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
--       'https://aromvduuxtcrzmwwvnej.supabase.co');
--
-- Το μυστικό ΔΕΝ ΥΠΗΡΧΕ σε κανένα από τα δύο έργα. Οπότε παντού ίσχυε το
-- εφεδρικό — που είναι το ref της ΠΑΡΑΓΩΓΗΣ. Στην παραγωγή αυτό είναι σωστό
-- κατά τύχη. Στο staging σημαίνει ότι ΕΝΝΙΑ εργασίες καλούσαν τις συναρτήσεις
-- της παραγωγής:
--
--     bank-rates-daily · email-outbox-schedule · ical-sync-3h · market-data-daily
--     purge-orphan-files · send-market-digest-weekly · send-monthly-statements
--     send-newsletter-weekly · send-reminders-daily
--
-- Τίποτα δεν έγινε, και ο λόγος είναι λεπτός: το `x-cron-secret` του staging
-- δεν ταιριάζει με της παραγωγής, οπότε κάθε κλήση γύριζε 401. Στο
-- `net._http_response` του staging υπάρχουν 401 κάθε πέντε λεπτά, επί μήνες.
-- Δηλαδή μας έσωσε ο έλεγχος ταυτότητας, όχι ο σχεδιασμός — και το
-- `purge-orphan-files` σβήνει αρχεία.
--
-- Ο ΚΑΝΟΝΑΣ: μια βάση που δεν ξέρει τη διεύθυνσή της ΔΕΝ μαντεύει. Είτε τη
-- διαβάζει από το vault, είτε δεν προγραμματίζει τίποτα και το λέει δυνατά.
-- Ενα εφεδρικό που δείχνει σε ΑΛΛΟ έργο δεν είναι εφεδρικό, είναι λάθος με
-- προεπιλογή.
--
-- ΤΙ ΚΑΝΕΙ ΕΔΩ:
--   1. `private.functions_base_url()` — η μία πηγή, χωρίς εφεδρικό.
--   2. Ξαναγράφει ΚΑΘΕ υπάρχουσα εργασία που δείχνει σε ξένο έργο, ώστε να
--      δείχνει στο δικό της. Στην παραγωγή είναι no-op: εκεί δείχνουν ήδη σωστά.
--   3. Δεν αγγίζει χρονοδιάγραμμα, ούτε σβήνει εργασία: μόνο τη διεύθυνση.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Η μία πηγή της διεύθυνσης ─────────────────────────────────────────
-- Στο `private`, όπως κάθε βοηθός αυτού του έργου: το `public` είναι το API.
create schema if not exists private;

create or replace function private.functions_base_url()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url' limit 1;
$$;
comment on function private.functions_base_url() is
  'Η βάση διευθύνσεων των edge functions ΑΥΤΟΥ του έργου, από το vault. Επιστρέφει NULL όταν δεν είναι ορισμένη: ο καλών οφείλει να μην προγραμματίσει τίποτα αντί να μαντέψει.';
revoke all on function private.functions_base_url() from public, anon, authenticated;

-- ── 2. Κάθε εργασία δείχνει στο δικό της έργο ────────────────────────────
do $$
declare
  v_base text := private.functions_base_url();
  v_self text;
  j      record;
  v_old  text;
  v_new  text;
  n      integer := 0;
begin
  if v_base is null then
    -- ΔΥΝΑΤΑ, ΓΙΑΤΙ ΕΙΝΑΙ ΤΟ ΜΟΝΟ ΠΡΑΓΜΑ ΠΟΥ ΘΑ ΤΟ ΚΑΝΕΙ ΝΑ ΔΙΟΡΘΩΘΕΙ. Χωρίς
    -- τη διεύθυνση δεν ξέρουμε ποιες εργασίες δείχνουν σωστά και ποιες όχι.
    raise warning '[cron] Το vault δεν έχει functions_base_url: καμία εργασία δεν ελέγχθηκε. Οριστε το με vault.create_secret(''https://<ref>.supabase.co'', ''functions_base_url'').';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron δεν είναι ενεργό: τίποτα να ελεγχθεί';
    return;
  end if;

  v_self := regexp_replace(v_base, '/+$', '');

  for j in select jobname, schedule, command from cron.job loop
    -- Η διεύθυνση μέσα στην εντολή, όποια κι αν είναι.
    v_old := substring(j.command from 'https://[a-z0-9-]+\.supabase\.co');
    continue when v_old is null or v_old = v_self;
    v_new := replace(j.command, v_old, v_self);
    -- Ιδιο όνομα και ίδιο χρονοδιάγραμμα: το `cron.schedule` ενημερώνει την
    -- υπάρχουσα εργασία, δεν φτιάχνει δεύτερη.
    perform cron.schedule(j.jobname, j.schedule, v_new);
    raise notice '[cron] % : % → %', j.jobname, v_old, v_self;
    n := n + 1;
  end loop;

  if n > 0 then
    raise warning '[cron] % εργασίες έδειχναν σε ΑΛΛΟ έργο και διορθώθηκαν', n;
  else
    raise notice '[cron] κάθε εργασία δείχνει στο δικό της έργο';
  end if;
end $$;
