# Security audit — July 2026

A full, adversarial security review of the PropertyOS backend ahead of onboarding
paying customers. Four independent passes, each on a distinct attack surface. Every
finding was verified against the actual SQL/code before any change; only verified,
exploitable issues are listed. Fixes shipped as migrations and edge-function changes
through the normal CI pipeline.

**Method** — four parallel reviews: (1) RLS / tenant isolation, (2) SECURITY DEFINER
& anon RPCs, (3) edge functions, (4) app authorization & secret hygiene.

**Headline** — no cross-tenant read leak exists in the canonical schema. The issues
were: a set of server-only functions left executable by the public role, a handful of
edge functions missing authorization, an SSRF in the calendar-import function, and a
service-role key that had been committed to git history. All resolved.

## Findings & resolutions

| # | Severity | Area | Finding | Status |
|---|---|---|---|---|
| 1 | Critical | Secrets | Service-role + Anthropic keys committed in `.env.local` history | ✅ Keys rotated/revoked; file purged from all history; untracked |
| 2 | Critical | Edge fn | `smart-suggestions` public (`verify_jwt=false`) + service-role + trusted body `user_id` → unauth data access & Anthropic cost-DoS | ✅ Requires caller JWT; derives identity from token; verifies property ownership |
| 3 | High | Edge fn | `market-data-updater` had no authorization → public write of market rates | ✅ Cron-secret / service-role gate; cron sends `x-cron-secret` |
| 4 | High | Edge fn | `bank-rates-updater` had no authorization → public write + Anthropic cost-DoS | ✅ Same gate + cron header |
| 5 | High | Edge fn | `ical-sync` SSRF — followed redirects after validating only the first URL; weak host filter | ✅ No redirect-follow; each hop re-validated; IPv4/IPv6 private-range blocklist |
| 6 | High | DB fn | `enqueue_email` executable by `anon`/`authenticated` (default PUBLIC grant) → send mail from our domain | ✅ Revoked from PUBLIC |
| 7 | High | DB fn | `drain_email_outbox` executable by PUBLIC → flush outbox on demand using cron secret | ✅ Revoked from PUBLIC |
| 8 | Medium | Edge fn | `send-test-notification` sent to a body-supplied address (open relay off our domain) | ✅ Restricted to the caller's own account email |
| 9 | Medium | Storage | `maintenance-photos` is a public bucket → owner-only RLS bypassed on the public URL path | ✅ Private bucket; owner reads via short-lived signed URLs; app stores the path, not a public URL (`20260722220000`) |
| 10 | Med/Low | DB fn | `user_plan_rank(uuid)` PUBLIC → cross-tenant billing-tier probe | ✅ Revoked from PUBLIC |
| 11 | Low | DB fn | `try/release_email_schedule_lock` PUBLIC → scheduler-lock DoS | ✅ Revoked from PUBLIC |
| 12 | Low | RLS | `inventory_repairs` WITH CHECK OR-branch allowed write-injection onto another owner's item | ✅ Write target must be an item the caller owns |
| 13 | Low | DB fn | `org_owner_ids` / `org_editor_owner_ids` answered for an arbitrary uid (relationship disclosure) | ✅ Guarded to the calling user |
| 14 | Low | App | No `middleware.ts`; dashboard auth is client-side only (data still RLS-gated) | 🟠 Planned: session middleware for defence-in-depth |
| 15 | Low | DB fn | Accountant/check-in tokens are static bearer capabilities (no PIN/expiry) | 🟠 Design note: consider PIN/expiry like the tenant portal |
| 16 | Info | Repro | Base tables live in `SETUP_ALL.sql`, not in `migrations/` → a from-scratch `db reset` isn't self-sufficient | 🟠 Unify into a migration baseline once staging exists |

## Verified clean (no action needed)

- **RLS is enabled on every table.** No table uses `USING (true)` / `TO public` on
  user data; the only public-read policies are on reference tables (rates/tariffs/
  loan programs/published product updates).
- **No cross-tenant read leak.** The soft `property_id`-text child tables all scope to
  the owner; org sharing is gated by active membership and cannot be self-granted.
- **Service-role key never reaches the client** — the browser uses the anon key only;
  the single API route authenticates the session and rate-limits.
- **XSS**: every PDF/print/HTML generator escapes user text; branding inputs are
  strictly validated.
- **Capability tokens** (portal/check-in/accountant/verify) are high-entropy, validated
  before any row is returned, and scoped to one owner.
- **Plan/entitlement integrity**: the billing plan-lock trigger blocks client
  self-upgrade; rewards/entitlements are written only by definer RPCs on genuinely
  activated referrals — no forgery path.
- **No SQL injection**: the only dynamic SQL uses `format(%I)` with non-user
  identifiers.

## Follow-ups (tracked)

1. ✅ `maintenance-photos` → private bucket + signed URLs (finding 9) — done
   (`20260722220000_maint_photos_private_bucket.sql`).
2. Session `middleware.ts` for defence-in-depth (finding 14).
3. PIN/expiry option for accountant/check-in tokens (finding 15).
4. Constant-time comparison for cron-secret checks (hardening).
5. Migration baseline so the schema rebuilds from `migrations/` alone (finding 16),
   after a staging project exists to validate a from-scratch `db reset`.
6. Run Supabase Security & Performance Advisors as the ongoing automated guard.
