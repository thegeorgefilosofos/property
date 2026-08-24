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
