# Operations runbook

How PROPERWISE is operated day to day. The guiding principle: **every change is
versioned code applied by CI; no one touches the production database or its secrets by
hand.**

## Shipping a change

1. Write the change on a branch — a migration under `supabase/migrations/`, an edge
   function under `supabase/functions/`, or app code.
2. Push. The `Supabase deploy` workflow (`.github/workflows/supabase-deploy.yml`)
   runs automatically when `supabase/**` or the workflow changes:
   - **Reconcile migration history** — reverts any orphaned remote-only version so
     the push never aborts (self-healing; bookkeeping only, never touches schema).
   - **Apply database migrations** — `supabase db push` (migrations are idempotent).
   - **Deploy Edge Functions** — `supabase functions deploy` ships *all* functions;
     each function's `verify_jwt` is declared in `supabase/config.toml`.
3. There is no manual deploy step and no always-on write credential — the CLI
   authenticates from short-lived GitHub Actions secrets.

## Adding a database migration

- Create `supabase/migrations/<UTC-timestamp>_<name>.sql`. One migration owns one
  logical change. Make it **idempotent** (`create ... if not exists`,
  `drop policy if exists`, guarded `do $$ ... $$`) so a re-apply is a safe no-op.
- Follow the RLS conventions in `docs/db/rls-conventions.md` (one `own_<table>`
  policy; org policies via `is_org_member`; reference tables read-only + service
  write; service-managed tables have no client policy).
- Push; CI applies it. Verify green in the Actions tab.

## Where secrets live (and who reads them)

| Secret | Home | Read by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | app env / `.env.local` | the browser (RLS-gated) |
| `ANTHROPIC_API_KEY` (app) | app host env / `.env.local` | `app/api/anthropic` (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | injected by Supabase | edge functions only |
| `RESEND_API_KEY`, cron secrets, messaging tokens, `ANTHROPIC_API_KEY` (fns) | Supabase → Edge Functions → Secrets | edge functions only |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | GitHub → Actions secrets | CI only |

Rule: a secret never lives in the repo. `.env.local` is gitignored. Rotate a secret
in its home; edge functions pick up the service-role key automatically.

## Backups & restore

- `Database backup` workflow (`.github/workflows/db-backup.yml`) runs daily at 02:00
  UTC and on demand: a logical dump (roles + schema + data) uploaded as a private,
  90-day GitHub artifact — an off-site net on the current plan.
- **Restore**: download the artifact, then `psql "<connection>" -f schema.sql` then
  `-f data.sql` (roles first if restoring to a fresh project).
- ⚠ The artifact contains real customer data — keep the repo private. Move to Supabase
  **Pro** (daily managed backups + 7-day PITR) before onboarding real customers.

## Incident response — leaked secret

The reference procedure (executed once for a `.env.local` that had been committed):

1. **Rotate/revoke the key immediately** in its provider — rotation is the real fix;
   scrubbing history alone is not enough once a key is exposed.
2. **Untrack & purge** — `git rm --cached <file>`, then rewrite history to remove it
   from every commit (`git filter-branch --index-filter 'git rm --cached
   --ignore-unmatch <file>' --prune-empty -- <refs>`), verify the working tree is
   byte-identical, and force-push.
3. **Confirm** the old credential no longer appears in any provider list.

## What to watch

- **Actions tab** — the deploy workflow must be green; it self-heals migration
  history but a real migration error will show here.
- **Supabase → Advisors** — run Security + Performance advisors periodically; close
  findings as a hardening migration.
- **Cron** — `select * from cron.job_run_details order by end_time desc` shows recent
  scheduled-job outcomes (rate updates, reminders, outbox drain).

## Related docs

`security-and-automation.md` · `rls-conventions.md` · `security-audit-2026-07.md` ·
`acquisition-readiness.md` · `../../supabase/README.md`

## Η τροφοδοσία επιτοκίων: πώς ελέγχεται ότι ζει

Η `market-data-daily` τρέχει κάθε πρωί στις 08:00 UTC, καλεί τη
`market-data-updater` και γράφει στον `public.market_rates` οκτώ επιτόκια, το
καθένα με τη δική του ημερομηνία παρατήρησης και πηγή (στήλη `provenance`).

**Δεν χρειάζεται καμία χειροκίνητη ρύθμιση.** Το κοινό μυστικό παράγεται από τη
μετανάστευση `20260901120000` και η διεύθυνση της συνάρτησης χτίζεται από το
`functions_base_url` του vault, με εφεδρεία τη διεύθυνση της παραγωγής. Και τα
δύο ήταν, ώς τότε, σιωπηλά σημεία αποτυχίας: η εργασία δεν έβγαζε σφάλμα,
απλώς δεν έστελνε τίποτα.

### Μία ερώτηση που λέει αν όλα στέκουν

```sql
select
  (select count(*) from pg_extension where extname = 'pg_cron')                  as pg_cron,
  (select count(*) from pg_extension where extname = 'pg_net')                   as pg_net,
  (select count(*) from public.cron_secrets where name = 'email_cron')           as koino_mystiko,
  (select count(*) from cron.job where jobname = 'market-data-daily')            as ergasia,
  (select max(updated_at) from public.market_rates)                              as teleftaia_grammi,
  (select jsonb_object_keys_count(provenance) from (
     select provenance from public.market_rates
      where provenance is not null order by updated_at desc limit 1) x)          as times_me_taftotita;
```

Οι τέσσερις πρώτες στήλες πρέπει να είναι `1`. Η τελευταία πρέπει να είναι `8`:
τόσα επιτόκια φέρνει ένα πλήρες πέρασμα. Λιγότερα σημαίνει ότι κάποιες σειρές
δεν απάντησαν — δεν είναι σφάλμα από μόνο του, γιατί η προηγούμενη τιμή κρατά τη
θέση της με την ΠΑΛΙΑ της ημερομηνία, αλλά αν μένει έτσι για μέρες αξίζει έλεγχος.

(Αν η `jsonb_object_keys_count` δεν υπάρχει, γράψε
`(select count(*) from jsonb_object_keys(provenance))` σε υποερώτημα.)

### Πρώτο πέρασμα κατά παραγγελία

```sql
select net.http_post(
  url     := coalesce(
               (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
               'https://aromvduuxtcrzmwwvnej.supabase.co') || '/functions/v1/market-data-updater',
  headers := jsonb_build_object('Content-Type','application/json',
               'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
  body    := '{}'::jsonb, timeout_milliseconds := 120000);
```

Μετά από λίγα δευτερόλεπτα:

```sql
select updated_at, euribor_3m, jsonb_pretty(provenance)
  from public.market_rates order by updated_at desc limit 1;
```

### Τι δείχνει η οθόνη όταν κάτι λείπει

Καμία τιμή δεν εμφανίζεται ως «σημερινή» χωρίς παρατήρηση. Οταν η `provenance`
είναι κενή, η λωρίδα επιτοκίων της καρτέλας Δάνειο δείχνει τιμή ΧΩΡΙΣ
ημερομηνία: η απουσία λέγεται με απουσία, όχι με παύλα και όχι με «σήμερα».
Οταν μια τιμή έχει παλιώσει πέρα από το όριο του είδους της (πέντε ημέρες για
Euribor, τετρακόσιες για επιτόκιο πολιτικής που αλλάζει σπάνια, εβδομήντα πέντε
για τα ελληνικά μέσα), η ημερομηνία της υπογραμμίζεται διακεκομμένα.
