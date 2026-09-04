-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΕΛΕΓΧΟΣ ΥΓΕΙΑΣ ΦΕΥΓΕΙ ΑΠΟ ΤΟΥΣ RUNNERS, ΚΑΙ ΓΙΝΕΤΑΙ ΠΥΚΝΟΤΕΡΟΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΜΕΤΡΗΘΗΚΕ (04/09/2026). Το workflow `health` έτρεχε ωριαία και έκαιγε 730
-- από τα 840 προγραμματισμένα λεπτά Actions του μήνα: το 87% όλου του
-- προγράμματος, το 37% ολόκληρου του δωρεάν ορίου των 2.000. Την ίδια μέρα
-- μετρήθηκε ότι το CI κοστίζει 64 λεπτά ανά εκτέλεση και όχι 45 όπως νόμιζε ο
-- φύλακας — δηλαδή 16 εκτελέσεις τον μήνα, ΗΔΗ κάτω από το δάπεδο των 20.
-- Ο έλεγχος που φυλάει την παραγωγή έτρωγε τον αγωγό που τη χτίζει.
--
-- ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΣΥΜΒΙΒΑΣΜΟΣ. Το παράθυρο άγνοιας πέφτει από μία ώρα σε ένα
-- τέταρτο — τέσσερις φορές πυκνότερα, με κόστος μηδέν, γιατί το pg_cron και το
-- pg_net υπάρχουν στο δωρεάν επίπεδο. Το ίδιο το health.yml είχε γράψει αυτή
-- ακριβώς τη λύση τον Αύγουστο, όταν το `*/15` άδειασε το όριο σε 14 μέρες.
--
-- ΚΑΙ ΓΙΑ ΠΡΩΤΗ ΦΟΡΑ ΥΠΑΡΧΕΙ ΙΣΤΟΡΙΚΟ. Το GitHub Actions κρατούσε logs 90
-- ημερών που κανείς δεν διάβαζε, χωρίς να μπορεί να απαντήσει «πόσο συχνά
-- πέφτει» ή «πόσο κράτησε». Ο πίνακας `health_checks` απαντά και τα δύο.
--
-- ΤΙ ΕΜΕΙΝΕ ΣΤΟ GITHUB: ο έλεγχος ΜΕΤΑ ΑΠΟ DEPLOY στο main. Είναι η στιγμή με
-- τη μεγαλύτερη αξία — εκεί γεννιούνται οι διακοπές — και είναι ΓΕΓΟΝΟΣ, όχι
-- πρόγραμμα: κοστίζει όσα τα pushes στο main, δηλαδή ελάχιστα.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Το ημερολόγιο ─────────────────────────────────────────────────────
create table if not exists public.health_checks (
  id            bigserial primary key,
  ran_at        timestamptz not null default now(),
  ok            boolean not null,
  kind          text not null,
  base          text not null,
  routes_count  integer not null default 0,
  failed_count  integer not null default 0,
  details       jsonb not null default '[]'::jsonb
);
comment on table public.health_checks is
  'Κάθε πέρασμα του ελέγχου υγείας της παραγωγής. Γράφεται μόνο από την edge function health-check.';
-- Η μόνη ερώτηση που γίνεται συνέχεια είναι «ποιο ήταν το τελευταίο».
create index if not exists health_checks_recent on public.health_checks (ran_at desc);

-- Πίνακας μόνο για την υπηρεσία: RLS ενεργό, καμία πολιτική και ρητή ανάκληση
-- ώστε η άρνηση να μη στηρίζεται σε έναν μηχανισμό (βλ. guard-service-only-tables).
alter table public.health_checks enable row level security;
revoke all on table public.health_checks from anon, authenticated;
revoke all on sequence public.health_checks_id_seq from anon, authenticated;

-- ── 2. Ενας ορισμός του «χαλάει» ─────────────────────────────────────────
-- Οπως η market_feed_health() και η bank_feed_health(): η βάση, η οθόνη και ο
-- νυχτερινός φύλακας ρωτούν το ΙΔΙΟ πράγμα και παίρνουν την ίδια απάντηση.
--
-- ΤΟ «ΔΕΝ ΕΤΡΕΞΕ ΠΟΤΕ» ΕΙΝΑΙ ΚΑΙ ΑΥΤΟ ΒΛΑΒΗ. Η εργασία bank-rates-monthly
-- υπήρχε, ήταν ενεργή και δεν είχε τρέξει ΠΟΤΕ· κανείς δεν το ήξερε επί 56
-- ημέρες γιατί η σιωπή δεν είχε ορισμό. Εδώ έχει: πάνω από μία ώρα χωρίς
-- γραμμή σημαίνει ότι κάτι σταμάτησε, ακόμη κι αν η τελευταία ήταν πράσινη.
create or replace function public.health_status()
returns table (ok boolean, reason text, last_check timestamptz, failed_count integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    coalesce(h.ok, false) and h.ran_at > now() - interval '1 hour',
    case
      when h.id is null then 'δεν έχει τρέξει ποτέ έλεγχος υγείας'
      when h.ran_at <= now() - interval '1 hour'
        then 'ο έλεγχος σταμάτησε: τελευταία γραμμή ' || to_char(h.ran_at, 'DD/MM HH24:MI')
      when not h.ok then h.failed_count || ' από ' || h.routes_count || ' διαδρομές δεν απαντούν (' || h.kind || ')'
      else 'εντάξει'
    end,
    h.ran_at,
    coalesce(h.failed_count, 0)
  from (select * from public.health_checks order by ran_at desc limit 1) h
  right join (select 1) dummy on true;
$$;
revoke all on function public.health_status() from public, anon, authenticated;

-- ── 3. Ο νυχτερινός φύλακας ──────────────────────────────────────────────
create or replace function public.watch_health()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  h record;
begin
  select * into h from public.health_status();
  if h.ok then
    raise notice '[health] εντάξει: τελευταίος έλεγχος %', h.last_check;
  else
    raise warning '[health] ΧΑΛΑΣΕ: %', h.reason;
  end if;
end $$;
revoke all on function public.watch_health() from public, anon, authenticated;

-- ── 4. Κάθε τέταρτο, δωρεάν ──────────────────────────────────────────────
do $$
declare
  -- ΚΑΜΙΑ ΕΦΕΔΡΙΚΗ ΔΙΕΥΘΥΝΣΗ. Ενα καρφωμένο ref έστειλε κάποτε τις εργασίες του
  -- staging στην παραγωγή (βλ. 20260902140000). Οταν το vault δεν έχει τη
  -- διεύθυνση, δεν προγραμματίζεται τίποτα και το λέει.
  v_base text := private.functions_base_url();
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron δεν είναι ενεργό: οι εργασίες δεν προγραμματίζονται';
    return;
  end if;
  if v_base is null or v_base = '' then
    raise warning 'functions_base_url λείπει από το vault: ο έλεγχος υγείας ΔΕΝ προγραμματίστηκε';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'health-every-15') then
    perform cron.unschedule('health-every-15');
  end if;
  -- Ασύγχρονο: το net.http_post επιστρέφει αναγνωριστικό και δεν περιμένει, οπότε
  -- ο έλεγχος των επτά διαδρομών δεν κρατά ανοιχτή τη θέση του pg_cron.
  perform cron.schedule('health-every-15', '*/15 * * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 180000);
  $cron$, v_base || '/functions/v1/health-check'));

  -- 09:30 UTC: αρκετά αργά για να έχουν γραφτεί οι νυχτερινές γραμμές, αρκετά
  -- νωρίς για να προλάβει άνθρωπος την ίδια μέρα.
  if exists (select 1 from cron.job where jobname = 'health-watch') then
    perform cron.unschedule('health-watch');
  end if;
  perform cron.schedule('health-watch', '30 9 * * *', 'select public.watch_health()');
end $$;
