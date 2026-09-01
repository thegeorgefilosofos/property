-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΤΡΟΦΟΔΟΣΙΑ ΛΕΕΙ ΜΟΝΗ ΤΗΣ ΟΤΙ ΧΑΛΑΣΕ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΠΡΟΒΛΗΜΑ: ΜΑΘΑΜΕ ΓΙΑ ΣΠΑΣΜΕΝΗ ΕΡΓΑΣΙΑ ΕΠΕΙΔΗ ΕΤΥΧΕ ΝΑ ΚΟΙΤΑΞΟΥΜΕ. Την
-- 01/09/2026 βρέθηκε εργασία που αποτύγχανε ΚΑΘΕ ΜΕΡΑ με ανυποκατάστατο πρότυπο
-- στη διεύθυνση· και δεύτερη που έγραφε παλιά επιτόκια στον ίδιο πίνακα. Καμία
-- από τις δύο δεν ειδοποίησε ποτέ κανέναν: μια αποτυχία pg_cron μένει στο
-- `cron.job_run_details` και μια αποτυχία μέσα στη συνάρτηση στα αρχεία της.
-- Κανένα από τα δύο δεν το διαβάζει άνθρωπος.
--
-- ── ΤΙ ΘΕΩΡΕΙΤΑΙ «ΧΑΛΑΣΜΕΝΗ», ΟΡΙΣΜΕΝΟ ΜΙΑ ΦΟΡΑ ─────────────────────────
-- Δύο ερωτήσεις· και οι δύο απαντιούνται από τον ίδιο τον πίνακα:
--
--   ΤΡΕΧΕΙ;    Η τελευταία γραμμή είναι νεότερη από 36 ώρες; Η εργασία τρέχει
--              κάθε 24· τα 36 αφήνουν περιθώριο για μια αργοπορία χωρίς να
--              κρύβουν μια χαμένη μέρα.
--   ΕΙΝΑΙ ΠΛΗΡΗΣ; Η ταυτότητα έχει και τις οκτώ τιμές; Λιγότερες σημαίνει ότι
--              κάποιες σειρές δεν απάντησαν. Η προηγούμενη τιμή κρατά τη θέση
--              της με την ΠΑΛΙΑ της ημερομηνία, οπότε η οθόνη δεν λέει ψέματα —
--              αλλά αν μένει έτσι, κάτι έχει αλλάξει στην πηγή.
--
-- ── ΓΙΑΤΙ ΕΔΩ ΔΕΝ ΕΛΕΓΧΕΤΑΙ Η ΠΑΛΑΙΟΤΗΤΑ ΑΝΑ ΤΙΜΗ ───────────────────────
-- Θα χρειαζόταν τα όρια ανά είδος (45 ημέρες για το Euribor, 400 για το
-- επιτόκιο πολιτικής, 135 για τα ελληνικά μέσα). Αυτά ζουν ΗΔΗ στο
-- `lib/market/ecb.ts` και τα διαβάζει η οθόνη. Γραμμένα και εδώ, θα ήταν δεύτερο
-- αντίγραφο που αποκλίνει την πρώτη φορά που θα αλλάξει το ένα. Η βάση απαντά
-- «τρέχει και είναι πλήρης;»· η οθόνη απαντά «είναι φρέσκια αυτή η τιμή;».
-- Καμία ερώτηση δεν απαντιέται δύο φορές.
--
-- ── ΤΙ ΚΑΝΕΙ Η ΕΙΔΟΠΟΙΗΣΗ ΣΗΜΕΡΑ ────────────────────────────────────────
-- Γράφει προειδοποίηση στα αρχεία της βάσης, με το ΓΙΑΤΙ. Δεν στέλνει email
-- ούτε ειδοποίηση συσκευής, γιατί κανένα από τα δύο κανάλια δεν είναι ακόμη
-- ενεργό — και μια ειδοποίηση που φεύγει προς το πουθενά είναι χειρότερη από
-- καμία, αφού δίνει την εντύπωση κάλυψης. Η ίδια συνάρτηση θα τροφοδοτήσει το
-- κανάλι τη μέρα που θα ανάψει, χωρίς να ξαναγραφτεί ο ορισμός.
--
-- Η άμεση διαδρομή προς άνθρωπο είναι η οθόνη: ο διαχειριστής βλέπει την
-- κατάσταση της τροφοδοσίας στην καρτέλα Δάνειο, από την ίδια συνάρτηση.
-- ═══════════════════════════════════════════════════════════════════════════

-- Πόσες ώρες σιωπής μέχρι να θεωρηθεί ότι η εργασία δεν τρέχει.
-- Πόσες τιμές περιμένουμε από ένα πλήρες πέρασμα.
create or replace function public.market_feed_health()
returns table (
  ok             boolean,
  reason         text,
  last_run       timestamptz,
  hours_silent   numeric,
  values_present integer,
  values_expected integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with latest as (
    select updated_at, provenance
      from public.market_rates
     order by updated_at desc
     limit 1
  ), m as (
    select
      l.updated_at as last_run,
      round(extract(epoch from (now() - l.updated_at)) / 3600.0, 1) as hours_silent,
      coalesce((select count(*)::int from jsonb_object_keys(l.provenance)), 0) as present
      from latest l
  )
  select
    case when m.last_run is null then false
         when m.hours_silent > 36 then false
         when m.present < 8 then false
         else true end,
    case when m.last_run is null then 'καμία γραμμή στον market_rates'
         when m.hours_silent > 36 then 'η εργασία δεν έτρεξε: ' || m.hours_silent || ' ώρες σιωπής'
         when m.present < 8 then 'ατελές πέρασμα: ' || m.present || ' από 8 τιμές'
         else 'εντάξει' end,
    m.last_run, m.hours_silent, m.present, 8
  from m
  -- Χωρίς γραμμή στον πίνακα, το `m` είναι κενό και η συνάρτηση δεν θα
  -- επέστρεφε ΤΙΠΟΤΑ — δηλαδή «καμία απάντηση» αντί για «χαλασμένη», που είναι
  -- ακριβώς η σιωπή που προσπαθούμε να εξαλείψουμε.
  union all
  select false, 'καμία γραμμή στον market_rates', null::timestamptz, null::numeric, 0, 8
   where not exists (select 1 from public.market_rates);
$$;

comment on function public.market_feed_health() is
  'Τρέχει η τροφοδοσία επιτοκίων και είναι πλήρης; Ενας ορισμός, για τη βάση και για την οθόνη.';

revoke all on function public.market_feed_health() from public, anon;
grant execute on function public.market_feed_health() to authenticated, service_role;

-- ── Ο φύλακας που τη ρωτά κάθε μέρα ────────────────────────────────────────
create or replace function public.watch_market_feed()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  h record;
begin
  select * into h from public.market_feed_health();
  if h.ok then
    raise notice '[market-feed] εντάξει: % τιμές, τελευταία εκτέλεση %', h.values_present, h.last_run;
  else
    -- ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΚΑΙ ΟΧΙ ΕΞΑΙΡΕΣΗ. Μια εξαίρεση θα σημάδευε την εργασία ως
    -- αποτυχημένη, δηλαδή θα έκρυβε το μήνυμα πίσω από ένα δεύτερο σφάλμα.
    raise warning '[market-feed] ΧΑΛΑΣΕ: %', h.reason;
  end if;
end $$;

revoke all on function public.watch_market_feed() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  if exists (select 1 from cron.job where jobname = 'market-feed-watch') then
    perform cron.unschedule('market-feed-watch');
  end if;
  -- Μία ώρα μετά την τροφοδοσία των 08:00, ώστε να κρίνει το ΑΠΟΤΕΛΕΣΜΑ της.
  perform cron.schedule('market-feed-watch', '0 9 * * *', $cron$ select public.watch_market_feed(); $cron$);
end $$;
