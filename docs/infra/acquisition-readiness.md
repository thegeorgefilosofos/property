# Property OS · Infrastructure & data due-diligence readiness

What a technical buyer's due diligence checks, and where we stand. The goal: an
acquirer opens the project and concludes **this was built by professionals** — secure,
versioned, automated, documented, compliant. Status: ✅ done · 🟠 in progress · 🔴 action.

## 1. Database security
- ✅ **RLS enabled on every table**; one canonical policy per table (`own_<table>`),
  org policies only where team sharing applies. Legacy duplicate/over-permissive
  policies removed; the one public-read hole closed (`rls-conventions.md`,
  `20260722160000_rls_consolidation.sql`).
- ✅ **Full adversarial security audit** (four independent passes: RLS/tenant
  isolation, SECURITY DEFINER & anon RPCs, edge functions, app/secrets). No
  cross-tenant read leak found in the canonical schema; every finding verified
  against the SQL/code and fixed — see `docs/db/security-audit-2026-07.md`.
- ✅ **Function-grant hardening** (`20260722180000_security_hardening.sql`): revoked
  the default PUBLIC EXECUTE on server-only functions (`enqueue_email`,
  `drain_email_outbox`, `user_plan_rank`, the email-schedule locks); tightened
  `inventory_repairs` write-check; stopped the org helpers disclosing another user's
  relationships.
- ✅ **Edge-function authorization** (`20260722190000` + function changes): every
  privileged/cron function now enforces auth (service-role bearer or shared cron
  secret); `smart-suggestions` requires the caller's JWT and verifies ownership;
  `ical-sync` SSRF closed (no redirect-follow, IPv4/IPv6 private-range blocklist);
  `send-test-notification` restricted to the caller's own address.
- ✅ Every SECURITY DEFINER function pins `search_path`; token-gated portal/checkin/
  accountant/verify RPCs validate the token before returning any row (audited).
- ✅ **Security Advisor findings closed** (`20260722210000_advisor_hardening.sql`):
  pinned `search_path` on the remaining flagged functions; switched the
  `active_loan_programs` view to `security_invoker`; revoked anon/authenticated
  EXECUTE on backend-/trigger-only functions (token-gated portal/checkin/
  accountant/verify/referral RPCs deliberately kept reachable). Keep running the
  advisor as the ongoing guard.
- ✅ Service-role key server-side only (edge functions); client uses anon key + RLS.

## 2. Backups & disaster recovery — 🔴 top priority
- 🔴 On **Free plan → no backups, no PITR.** For production customer data this is the
  single biggest DD red flag. **Upgrade to Pro** → daily backups + 7-day
  Point-in-Time Recovery. A buyer asks "what's your RPO/RTO?" — right now it is
  "none". After Pro: RPO ≤ 24h (≈0 with PITR), documented restore procedure.

## 3. Change management & reproducibility
- ✅ **Migrations-as-code** — the whole schema rebuilds from `supabase/migrations/`.
- ✅ **CI/CD** — `.github/workflows/supabase-deploy.yml` applies migrations + deploys
  functions on push. No manual dashboard changes; no always-on write credential.
- ✅ Remote migration history is kept consistent with the repo **automatically** — the
  deploy pipeline's *Reconcile migration history* step reverts any orphaned remote-only
  version before each `db push` (bookkeeping only; never touches the schema), so the
  history never drifts and no human runs `migration repair` by hand.

## 4. Environments
- 🟠 Everything is on **`main` = production.** The free path to prod ≠ dev is a
  **second free Supabase project** as staging (Free allows two projects) — no Pro
  needed. Setup is documented step-by-step in
  [`staging-setup.md`](staging-setup.md); it needs the account owner to create the
  project + add two GitHub secrets, then the deploy workflow is parameterised to
  target staging on feature branches and production on `main`.

## 5. Data privacy & compliance (EU / GDPR) — 🔴 for an EU SaaS sale
- ✅ **Data residency**: project region is **EU — Central EU (Frankfurt),
  `eu-central-1`**. Data stays in the EU.
- ✅ **Right to erasure & portability**: one-click **export** (`export_my_data`,
  dynamic per-user JSON of every table) and **delete-account**
  (`delete_my_account`), both surfaced in Settings → Data & Privacy.
- 🔴 **Records of processing + subprocessor list** (Supabase, Resend, messaging
  providers) and **DPAs** in place; a published Privacy Policy + Terms.
- 🟠 PII minimization: no secrets/PII in logs; the lock-screen/no-amount rules in the
  messaging layer already reflect this discipline.

## 6. Auth hardening (Dashboard → Authentication)
- ✅ **MFA (TOTP)** enabled (free); **strong-password policy enforced server-side** —
  min length 8, requires lower/upper/digit/symbol; **anonymous sign-ins off**,
  **email confirmation on**, single provider (email) enabled.
- ✅ **In-app MFA enrollment** — Settings → Security lets a user bind a TOTP
  authenticator (QR + manual secret), verify, and disable, with activity logging,
  so the enabled TOTP factor is actually usable end-to-end.
- ✅ **Client-side strength check on every password entry point** — one shared
  policy (`lib/auth/password.ts`) mirrors the server rules (≥8 + lower/upper/
  digit/symbol) with a live meter and blocks obvious passwords, on signup,
  password reset, and change-password. The free complement to HIBP.
- 🟠 **Leaked-password protection** (HaveIBeenPwned) is **Pro-only** — deferred with
  the other Pro items (managed backups/PITR).
- 🟠 Restrict redirect URLs to your domains; keep OTP lifetimes tight (≤ 900s).

## 7. Performance & schema hygiene
- ✅ **Unindexed foreign keys closed** (`20260722210000_advisor_hardening.sql`):
  a catalog-driven block adds a covering btree index for every FK that lacked
  one — generic, so it stays correct as the schema grows.
- 🟠 **Performance Advisor**: keep running it; consider dropping genuinely unused
  indexes once there's production traffic to judge them by.
- 🟠 Consistent constraints (FKs, `not null`, checks), naming, and `updated_at`
  triggers where relevant.

## 8. Observability & operations
- 🟠 Error tracking (e.g. Sentry) on app + edge functions; uptime monitoring.
- 🟠 Alerting on failed cron/migrations/deploys.
- ✅ Test suite (lib unit tests + verify-policy/messaging/gender for the messaging
  system) runs in the repo.

## 9. Access control & secrets
- 🟠 Least-privilege dashboard access; enable the org **audit log**; MFA on the
  Supabase account itself.
- ✅ Secrets live only in the deployment environment (Supabase Edge Function secrets /
  GitHub Actions secrets), never in the repo. `.env.local` is untracked and
  `.gitignore`d.
- ✅ **Incident handled cleanly**: a `.env.local` with a service-role + Anthropic key
  had been committed historically. Response: both keys **rotated/revoked**, the file
  **purged from all git history** (main + working branch rewritten, verified
  byte-identical trees), and tracking removed. Documented as the reference runbook.
- 🟠 Formalize a periodic **key-rotation policy** (service-role, PAT, provider keys).

## 10. Documentation (a buyer loves this)
- ✅ Root `README.md` (architecture, stack, layout), `supabase/README.md` (schema
  reference **+ ERD**, RLS model, cron, edge-function catalogue), `rls-conventions.md`,
  `security-and-automation.md`, `security-audit-2026-07.md`, `world-class-scheme.md`,
  `runbook.md`, and this readiness doc.

---

### The short path to "top-tier, professional" (do in this order)
1. **Upgrade to Pro** → backups + PITR (removes the biggest red flag).
2. Add the **two GitHub secrets** → the pipeline runs; deploys are automated.
3. Run **Security Advisor** + **Performance Advisor** → paste findings → one hardening
   migration closes them all.
4. Flip **leaked-password + MFA** on in Auth.
5. Build **data-export + delete-account** (GDPR) as edge functions; confirm **EU region**.
6. Add a **staging** environment + basic **error tracking**.
