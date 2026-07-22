# Staging environment — setup

Goal: a **staging** Supabase project separate from production, so schema and
function changes are validated against a throwaday copy before they touch real
customer data. On the Free plan this is achieved with a **second free Supabase
project** (Free allows two projects per organization) — no paid plan required.

Target topology:

| Git branch | Deploys to | Purpose |
|---|---|---|
| working branch (`claude/*`) | **staging** project | validate migrations + functions |
| `main` | **production** project (`aromvduuxtcrzmwwvnej`) | live customer data |

Right now both run against production. This doc is the one-time setup to split
them.

## Part A — what the account owner does (once)

1. **Create the project.** Supabase Dashboard → *New project*.
   - Name: `propertyos-staging`.
   - **Region: EU (Central EU / Frankfurt)** — same as production, keeps data in
     the EU.
   - Set a database password (save it in your password manager).
2. **Collect three values** from the new project:
   - Project **ref** — Project Settings → General → *Reference ID*
     (looks like `abcdefgh...`).
   - Database **password** — the one you just set.
   - You can reuse the **same Personal Access Token** (`sbp_…`) as production; a
     PAT is account-scoped and manages both projects.
3. **Add GitHub secrets** — repo → Settings → Secrets and variables → Actions →
   *New repository secret*. Add:
   - `STAGING_SUPABASE_PROJECT_REF` = the staging ref
   - `STAGING_SUPABASE_DB_PASSWORD` = the staging DB password
   - (`SUPABASE_ACCESS_TOKEN` already exists and is reused.)

   > Never paste these values into chat or commit them. They live only in GitHub
   > Actions secrets.

4. Tell the developer the secrets are set (the ref itself is not sensitive, so it
   can be shared; the password must not).

## Part B — what gets wired in code (after Part A)

Once the staging secrets exist, the deploy workflow
(`.github/workflows/supabase-deploy.yml`) is parameterised to pick its target by
branch:

- on `main` → link + `db push` + deploy functions against the **production** ref
  and password;
- on any other branch → against the **staging** ref and password.

The self-healing *Reconcile migration history* step and the function deploy stay
identical; only the `--project-ref` / `SUPABASE_DB_PASSWORD` change per branch.
This is a small, contained change and is applied only after the staging project
exists, so the working pipeline is never left pointing at a ref that has no
secret.

## Part C — what staging unlocks

- **Migration baseline** (audit finding 16): with a throwaway project we can run a
  from-scratch `supabase db reset` and prove the schema rebuilds from
  `supabase/migrations/` alone, then fold the `SETUP_ALL.sql` base tables into a
  baseline migration. Today that can't be validated safely because the only
  project holds real data.
- **Safe rehearsal** of destructive or ambiguous migrations before prod.
- A place to trial the **PKCE + `/auth/callback`** auth flow so the proxy can do a
  hard server-side redirect without risking the production login flow.
