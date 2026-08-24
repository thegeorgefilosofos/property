# Key & secret rotation policy — PROPERWISE

Formalises the periodic rotation the readiness doc flagged (§9). All free — no
tooling beyond the dashboards you already have.

## Secrets in scope

| Secret | Where it lives | Rotate every | On suspicion |
|---|---|---|---|
| Supabase **service-role key** | Supabase Edge Function secrets only (server-side) | 12 months | Immediately — regenerate in dashboard, redeploy functions |
| Supabase **anon key** | Client (public by design) | On project rotation | Rotate project keys |
| **Personal Access Token** (`sbp_…`) | GitHub Actions secret | 6 months | Revoke in Supabase account, mint new, update secret |
| Database **passwords** (prod + staging) | GitHub Actions secrets | 12 months | Reset in dashboard, update secrets |
| `RESEND_API_KEY` | Edge Function secret | 12 months | Revoke in Resend, replace |
| `ANTHROPIC_API_KEY` | Edge Function secret | 12 months | Revoke in console, replace |
| Cron secrets (`email_cron`, …) | `cron_secrets` table (RLS deny-all) | 12 months | `update` the row |
| `BACKUP_PASSPHRASE` | GitHub Actions secret | 12 months | Rotate; note old backups need the old passphrase |

## Procedure (no downtime)
1. Mint the **new** secret in the provider dashboard.
2. Update the corresponding **GitHub Actions secret** / **Edge Function secret** /
   `cron_secrets` row.
3. Trigger a deploy (or wait for the next push) so functions pick up the new value.
4. **Revoke the old** secret once the new one is confirmed working.
5. Record the rotation date in an internal log.

## Standing hardening
- No always-on write credential anywhere — the CI/CD pipeline authenticates from
  short-lived GitHub Actions secrets only.
- Enable **MFA on the Supabase account and the GitHub account** themselves.
- Enable the Supabase org **audit log** and least-privilege dashboard access.
- Turn on GitHub **secret scanning + push protection** so a secret can't be
  committed in the first place (see `docs/ops/owner-setup-guide.md`).
