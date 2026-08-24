# Owner setup guide — free level-ups you flip once

Everything here is **free**, needs **no domain** and **no paid Supabase**. These
are one-time toggles only the account owner can do. Each turns work that is
already *built* into something that is *enforced* — exactly what a technical buyer
checks first.

## 1. Protect `main` so the CI gate is REQUIRED  ⚠️ NOT free on a private repo

Goal: nothing reaches `main` unless the `verify` CI job passes.

**Important limitation:** on a **private repository owned by a personal account
on the Free plan, GitHub does NOT enforce branch rulesets / branch protection**
(the ruleset screen shows: *"Your rulesets won't be enforced on this private
repository until you move to a GitHub Team organization account"*). So creating
the ruleset does nothing until you either:
- upgrade to **GitHub Pro** (~€4/month) — enables branch protection on personal
  private repos; **the only paid item, and it's tiny**; or
- move the repo into a **GitHub Team organization**; or
- make the repo **public** (not recommended — it holds the product).

**Free, practical alternative (what we actually rely on today):** every change
already goes through a **pull request**, and CI (`verify`) **runs and reports on
every PR** — so the quality signal is fully intact; only the hard *merge-block* is
missing. For a solo owner that is a low practical risk. When you're ready to
enforce, buy Pro and then: Settings → Rules → Rulesets → New → target `main`,
Enforcement **Active**, ☑ Require status checks → add **`verify`**, ☑ Block force
pushes.

## 2. Secret scanning + push protection  ⚠️ NOT free on a private repo

GitHub **secret scanning / push protection are free only for PUBLIC repos**; on a
private repo they require **GitHub Advanced Security** (Enterprise-tier, not
included in Free or Pro). So this isn't available here for free.

**Free mitigation (already in place):** secrets live only in the deployment
environment (GitHub Actions / Edge Function secrets), never in the repo;
`.env.local` is gitignored; the one historical leak was rotated + purged from git
history (documented in `acquisition-readiness.md` §9). Keep that discipline — it's
the substance of what push protection would enforce.

## 3. Harden Supabase Auth (no domain needed)

**Supabase Dashboard → Authentication → URL Configuration / Policies:**
- **Redirect URLs**: restrict to your app's URL(s) only (e.g. `https://propertyos.gr/**`
  and your Vercel/preview URL) — remove any wildcard `*`. The confirmation link
  now returns to `/auth/callback`, which the `/**` suffix already covers; if you
  list exact URLs instead, add `https://<your-domain>/auth/callback`.
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
2. Set the Edge Function secret `RESEND_FROM` = `PROPERWISE <no-reply@yourdomain.gr>`.
3. Flip the master switch **once**: `select public.set_emails_live(true);`
Until step 3, only transactional email can send — the whole lifecycle catalog
stays dormant. See `docs/marketing/world-class-scheme.md`.
