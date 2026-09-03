-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΑ ΕΠΙΤΟΚΙΑ ΕΛΕΓΧΟΝΤΑΙ ΚΑΘΕ ΜΕΡΑ, ΚΑΙ Η ΤΡΟΦΟΔΟΣΙΑ ΑΦΗΝΕΙ ΙΧΝΟΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΜΕΤΡΗΘΗΚΕ ΣΤΗΝ ΠΑΡΑΓΩΓΗ (02/09/2026). Ο πίνακας `bank_rates` έγραφε
-- «επιβεβαιωμένο 08/07/2026» και στις επτά τράπεζες· η οθόνη μετρούσε 56
-- ημέρες. Η εργασία `bank-rates-monthly` υπήρχε, ενεργή, με χρονοδιάγραμμα
-- «30 6 1 * *» — και ΔΕΝ ΕΙΧΕ ΤΡΕΞΕΙ ΠΟΤΕ: προγραμματίστηκε την 1η Σεπτεμβρίου
-- μετά τις 06:30, δηλαδή λίγες ώρες μετά τη μοναδική θέση της για τον μήνα.
-- Επόμενη ευκαιρία 1η Οκτωβρίου. Στο `cron.job_run_details` δεν υπάρχει γραμμή.
--
-- ΚΑΙ ΟΤΑΝ ΘΑ ΕΤΡΕΧΕ, ΔΕΝ ΘΑ ΕΛΕΓΕ ΤΙΠΟΤΑ. Η συνάρτηση επέστρεφε `ok:false`
-- σε αποτυχία και κρατούσε τα παλιά δεδομένα — σωστά — αλλά πουθενά δεν
-- γραφόταν ότι δοκίμασε. Το μόνο σημάδι ζωής ήταν το `verified_at`, που
-- αλλάζει μόνο σε επιτυχία: αποτυχία και σιωπή ήταν το ίδιο πράγμα.
--
-- ΤΙ ΑΛΛΑΖΕΙ.
--   1. Καθημερινή εκτέλεση (05:30 UTC, 08:30 Αθήνα), όχι μηνιαία. Δεν υπάρχει
--      δημόσιο feed επιτοκίων: ο μόνος τρόπος να μάθει η εφαρμογή ότι άλλαξε
--      κάτι είναι να ρωτήσει. Μία ερώτηση τη μέρα είναι το «πραγματικό χρόνο»
--      που επιτρέπει η πηγή.
--   2. Ημερολόγιο εκτελέσεων (`bank_rate_checks`): κάθε πέρασμα γράφει γραμμή,
--      πέτυχε ή όχι. Το «ελέγχθηκε σήμερα, αμετάβλητα» γίνεται δυνατό.
--   3. Ημερολόγιο αλλαγών (`bank_rate_changes`): ποιο πεδίο, από τι σε τι,
--      εφαρμόστηκε ή κρατήθηκε. Οι μεγάλες μεταβολές κρατιούνται ώσπου ένα
--      δεύτερο, ανεξάρτητο πέρασμα να επιστρέψει την ίδια τιμή (lib/loans/rateFeed.ts).
--   4. `bank_feed_health()`: ένας ορισμός του «χαλάει» για τη βάση και την
--      οθόνη, όπως η `market_feed_health()`. Και νυχτερινός φύλακας.
--   5. Το πρώτο πέρασμα γίνεται ΤΩΡΑ, όχι αύριο το πρωί.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Τα δύο ημερολόγια ─────────────────────────────────────────────────
create table if not exists public.bank_rate_checks (
  id             bigserial primary key,
  ran_at         timestamptz not null default now(),
  ok             boolean not null,
  reason         text not null,
  banks_found    integer not null default 0,
  banks_applied  integer not null default 0,
  banks_held     integer not null default 0,
  details        jsonb not null default '{}'::jsonb
);
comment on table public.bank_rate_checks is
  'Κάθε πέρασμα της τροφοδοσίας επιτοκίων, πέτυχε ή όχι. Γράφεται μόνο από την edge function.';

create table if not exists public.bank_rate_changes (
  id         bigserial primary key,
  ran_at     timestamptz not null default now(),
  bank_id    text not null,
  field      text not null,
  old_value  numeric,
  new_value  numeric not null,
  applied    boolean not null default false,
  reason     text not null
);
comment on table public.bank_rate_changes is
  'Τι πρότεινε η αναζήτηση ανά τράπεζα και πεδίο και αν εφαρμόστηκε ή κρατήθηκε για δεύτερη επιβεβαίωση.';
create index if not exists bank_rate_changes_lookup
  on public.bank_rate_changes (bank_id, field, new_value, applied, ran_at desc);

-- Πίνακες μόνο για την υπηρεσία: RLS ενεργό, καμία πολιτική και ρητή ανάκληση
-- ώστε η άρνηση να μη στηρίζεται σε έναν μηχανισμό (βλ. guard-service-only-tables).
alter table public.bank_rate_checks  enable row level security;
alter table public.bank_rate_changes enable row level security;
revoke all on table public.bank_rate_checks  from anon, authenticated;
revoke all on table public.bank_rate_changes from anon, authenticated;
revoke all on sequence public.bank_rate_checks_id_seq  from anon, authenticated;
revoke all on sequence public.bank_rate_changes_id_seq from anon, authenticated;

-- ── 2. Η υγεία, με έναν ορισμό ───────────────────────────────────────────
-- Η οθόνη τη διαβάζει για να πει «ελέγχθηκαν σήμερα» αντί «56 ημέρες» και ο
-- νυχτερινός φύλακας για να φωνάξει. Security definer: οι πίνακες από κάτω
-- είναι κλειστοί στον πελάτη, η σύνοψή τους όχι — είναι επιτόκια, όχι δεδομένα
-- χρήστη.
create or replace function public.bank_feed_health()
returns table (
  ok            boolean,
  reason        text,
  last_check    timestamptz,
  last_ok       timestamptz,
  hours_silent  numeric,
  verified_at   date,
  held_changes  integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with latest as (
    select ran_at, ok, reason from public.bank_rate_checks order by ran_at desc limit 1
  ), last_good as (
    select ran_at from public.bank_rate_checks where ok order by ran_at desc limit 1
  ), m as (
    select
      l.ran_at as last_check,
      l.ok     as last_ok_flag,
      l.reason as last_reason,
      g.ran_at as last_ok,
      round(extract(epoch from (now() - l.ran_at)) / 3600.0, 1) as hours_silent,
      (select min(verified_at) from public.bank_rates where is_active) as verified_at,
      (select count(*)::int from public.bank_rate_changes c
        where not c.applied and c.ran_at > now() - interval '7 days') as held
    from latest l left join last_good g on true
  )
  select
    case when m.last_check is null then false
         when m.hours_silent > 48 then false
         when not m.last_ok_flag then false
         else true end,
    case when m.last_check is null then 'καμία εκτέλεση της τροφοδοσίας επιτοκίων'
         when m.hours_silent > 48 then 'η εργασία δεν έτρεξε: ' || m.hours_silent || ' ώρες σιωπής'
         when not m.last_ok_flag then 'το τελευταίο πέρασμα απέτυχε: ' || m.last_reason
         else 'εντάξει' end,
    m.last_check, m.last_ok, m.hours_silent, m.verified_at, m.held
  from m
  union all
  select false, 'καμία εκτέλεση της τροφοδοσίας επιτοκίων', null::timestamptz, null::timestamptz, null::numeric,
         (select min(verified_at) from public.bank_rates where is_active), 0
   where not exists (select 1 from public.bank_rate_checks);
$$;
comment on function public.bank_feed_health() is
  'Τρέχει η τροφοδοσία επιτοκίων τραπεζών και πότε επιβεβαίωσε τελευταία; Ενας ορισμός, για τη βάση και για την οθόνη.';
revoke all on function public.bank_feed_health() from public, anon;
grant execute on function public.bank_feed_health() to authenticated, service_role;

-- Οι κρατημένες αλλαγές, για τον διαχειριστή: τι είδε η αναζήτηση και δεν
-- εφάρμοσε. Μόνο οι ανοιχτές της τελευταίας εβδομάδας.
create or replace function public.bank_feed_held()
returns table (
  ran_at     timestamptz,
  bank_id    text,
  field      text,
  old_value  numeric,
  new_value  numeric,
  reason     text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ran_at, bank_id, field, old_value, new_value, reason
    from public.bank_rate_changes
   where not applied and ran_at > now() - interval '7 days'
   order by ran_at desc, bank_id, field;
$$;
revoke all on function public.bank_feed_held() from public, anon;
grant execute on function public.bank_feed_held() to authenticated, service_role;

-- ── 3. Ο φύλακας: προειδοποίηση, όχι εξαίρεση ─────────────────────────────
create or replace function public.watch_bank_feed()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  h record;
begin
  select * into h from public.bank_feed_health();
  if h.ok then
    raise notice '[bank-feed] εντάξει: τελευταίο πέρασμα %, επιβεβαιωμένα %, % κρατημένες', h.last_check, h.verified_at, h.held_changes;
  else
    raise warning '[bank-feed] ΧΑΛΑΣΕ: %', h.reason;
  end if;
end $$;
revoke all on function public.watch_bank_feed() from public, anon, authenticated;

-- ── 4. Καθημερινά, όχι μηνιαία ──────────────────────────────────────────
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

  -- Η μηνιαία φεύγει: δεν έτρεξε ποτέ και δεν θα ξανασχεδιαστεί.
  if exists (select 1 from cron.job where jobname = 'bank-rates-monthly') then
    perform cron.unschedule('bank-rates-monthly');
  end if;

  -- bank-rates-daily — 05:30 UTC κάθε μέρα (08:30 Αθήνα), πριν ανοίξει η μέρα
  -- και μετά τα νυχτερινά τιμολόγια των τραπεζών.
  if exists (select 1 from cron.job where jobname = 'bank-rates-daily') then
    perform cron.unschedule('bank-rates-daily');
  end if;
  perform cron.schedule('bank-rates-daily', '30 5 * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 180000);
  $cron$, v_base || '/functions/v1/bank-rates-updater'));

  -- bank-feed-watch — 09:30 UTC: τέσσερις ώρες μετά την εκτέλεση, αρκετές για
  -- να έχει γραφτεί η γραμμή της, λίγες για να προλάβει άνθρωπος την ίδια μέρα.
  if exists (select 1 from cron.job where jobname = 'bank-feed-watch') then
    perform cron.unschedule('bank-feed-watch');
  end if;
  perform cron.schedule('bank-feed-watch', '30 9 * * *', 'select public.watch_bank_feed()');
end $$;

-- ── 5. Το πρώτο πέρασμα γίνεται τώρα ───────────────────────────────────
-- Ασύγχρονο: το `net.http_post` επιστρέφει αναγνωριστικό, δεν περιμένει, οπότε
-- ούτε καθυστερεί ούτε ρίχνει τη μετανάστευση.
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
    url     := v_base || '/functions/v1/bank-rates-updater',
    headers := jsonb_build_object('Content-Type','application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb, timeout_milliseconds := 180000);
end $$;
