# Owner setup guide — free level-ups you flip once

Everything here is **free**, needs **no domain** and **no paid Supabase**. These
are one-time toggles only the account owner can do. Each turns work that is
already *built* into something that is *enforced* — exactly what a technical buyer
checks first.

## 1. Protect `main` so the CI gate is REQUIRED (highest leverage)

Right now CI runs on every PR, but nothing stops a merge if it's red. Make it a
hard gate:

**GitHub → repo → Settings → Branches → Add branch ruleset** (or "Add rule"):
- Branch name pattern: `main`
- ☑ **Require a pull request before merging** (1 approval optional for a solo owner)
- ☑ **Require status checks to pass before merging** → search and select **`verify`** (the CI job)
- ☑ **Require branches to be up to date before merging**
- ☑ **Do not allow bypassing the above settings** (or allow only yourself)
- Save.

Result: nothing reaches `main` unless typecheck + the full test-suite + the
production build pass. This is the single most visible "professional operations"
signal.

## 2. Turn on secret scanning + push protection

Stops an API key/token from ever being committed (we had one historical leak —
this prevents a repeat).

**GitHub → repo → Settings → Code security and analysis:**
- **Secret scanning** → Enable
- **Push protection** → Enable  (blocks a push that contains a detected secret)

## 3. Harden Supabase Auth (no domain needed)

**Supabase Dashboard → Authentication → URL Configuration / Policies:**
- **Redirect URLs**: restrict to your app's URL(s) only (e.g. `https://propertyos.gr/**`
  and your Vercel/preview URL) — remove any wildcard `*`.
- **OTP / email link expiry**: set to **≤ 900 seconds** (15 min).
- **Session timeout / refresh**: keep defaults or tighten; enable "reuse detection".
- **Anonymous sign-ins**: off. **Email confirmation**: on. (Already set — verify.)

**Supabase Dashboard → Authentication → Providers / MFA:** confirm **TOTP MFA** is
enabled (it is), and that **your own Supabase account** has MFA on.

## 4. Enable the Supabase org audit log + least privilege
**Supabase → Organization → Settings**: enable the **audit log**; make sure only
people who need dashboard access have it.

---

## What stays until you spend money / verify a domain
- **Managed backups + PITR** → needs Supabase **Pro** (we run a free encrypted
  daily backup in the meantime).
- **Leaked-password protection (HIBP)** → Pro-only (we mirror it client-side for free).
- **Sending emails to customers** → needs a **verified sending domain**; then set
  `RESEND_FROM` and run `select public.set_emails_live(true);` (see below).

## Activating the email engine (later, after a verified domain)
1. Verify a domain in **Resend** (add the SPF/DKIM/DMARC DNS records it gives you).
2. Set the Edge Function secret `RESEND_FROM` = `Property OS <no-reply@yourdomain.gr>`.
3. Flip the master switch **once**: `select public.set_emails_live(true);`
Until step 3, only transactional email can send — the whole lifecycle catalog
stays dormant. See `docs/marketing/world-class-scheme.md`.
