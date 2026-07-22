# Property OS · Database security & automation

This database holds customer data. The posture below is how an experienced team runs
a production Supabase project: **every change is versioned code, applied automatically
by CI, with least-privilege access and defence-in-depth.** You never touch the
dashboard; Claude writes migrations/functions and pushes; the pipeline deploys them.

## Automation (never touch Supabase by hand)
- **Writes = migrations-as-code.** All schema/policy/function changes live in
  `supabase/migrations/` and `supabase/functions/`, versioned and reviewable.
- **CI applies them** — `.github/workflows/supabase-deploy.yml` runs `supabase db push`
  + `functions deploy` on every push. No always-on write token exists anywhere; the
  CLI authenticates from short-lived GitHub Actions secrets.
- **One-time setup** (GitHub → Settings → Secrets and variables → Actions):
  `SUPABASE_ACCESS_TOKEN` (a Personal Access Token) and `SUPABASE_DB_PASSWORD`.
- First run: `db push` may report already-applied idempotent migrations (safe). If it
  errors on migration history, run `supabase migration list` then
  `supabase migration repair --status applied <version>` once, then it is automatic.

## Why not give the AI a live write token?
Because a customer-data production DB should never have an always-on credential that
can mutate everything. The migration + CI path gives full automation **and** keeps
every change versioned, reviewed and reversible. (Optional: a **read-only** Supabase
MCP token lets Claude inspect the live schema for audits — read-only, zero write risk.)

## Security posture (defence-in-depth)

### Row-Level Security — done
- RLS enabled on **every** table (verified). One canonical policy per table
  (`own_<table>`), org policies only where team sharing applies. See
  `rls-conventions.md`; consolidation migration `20260722160000_rls_consolidation.sql`
  removes the duplicate/over-permissive legacy policies and closed the one real hole
  (`Public read inventory_handovers`).

### Backups & recovery — ACTION REQUIRED
- The project is on the **Free plan → no scheduled backups and no Point-in-Time
  Recovery.** For production customer data this is the first thing to fix: **upgrade to
  Pro** (daily backups + 7-day PITR). Until then, the only safety net is
  `Restore to new project` / a manual `pg_dump`.

### Auth hardening (Dashboard → Authentication → Providers/Policies)
- Enable **leaked-password protection** (checks HaveIBeenPwned).
- Enable **MFA** (TOTP) for accounts.
- Keep OTP/session lifetimes sane; restrict allowed redirect URLs to your domains.

### Database linter (Dashboard → Advisors → Security) — run and fix all
Typical findings to close via a hardening migration:
- **Functions with a mutable `search_path`** → `alter function … set search_path = ''`
  (or `public`). Our functions already set it; the linter finds any that don't.
- **SECURITY DEFINER views** → recreate with `security_invoker = true` (Postgres 15+)
  so a view runs with the *caller's* RLS, not the owner's.
- **Extensions in `public`** → move to an `extensions` schema.
- **Tables without RLS** → none (verified), but the linter is the ongoing guard.

### Keys & exposure
- The **service-role key** lives only in edge-function env — never shipped to the
  client. The client uses the anon key, gated by RLS.
- `pg_net`/cron make outbound calls only to our own functions (no user-controlled URLs).
- Storage buckets: keep private with per-user path policies; signed URLs for sharing.

## The loop, going forward
Claude writes a migration/function → push → CI applies it → you never touch Supabase.
Security findings from the Advisor become one more hardening migration in the same
pipeline. Everything stays versioned, automated, and safe.
