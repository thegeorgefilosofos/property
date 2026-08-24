# Subprocessor register — PROPERWISE

The third parties that may process personal data on behalf of PROPERWISE, why,
and where. Maintained under GDPR Art. 28 (3)(d). Publish a summary of this list
on the website and notify customers before adding a new subprocessor.

> Status of this document: **factual inventory of what the stack uses today.**
> DPA column records whether a signed Data Processing Agreement is in place —
> execute the ones marked ☐ before onboarding real customer data at scale.

| Subprocessor | Purpose | Data categories | Region / residency | DPA |
|---|---|---|---|---|
| **Supabase** (Supabase Inc.) | Managed Postgres, Auth, Storage, Edge Functions — the primary platform | All application data: owner + tenant PII, property/financial data, documents, auth credentials (hashed) | **EU — Frankfurt, `eu-central-1`** | ☐ execute (Supabase offers a standard DPA) |
| **Resend** (Resend, Inc.) | Transactional + lifecycle email delivery | Recipient email, name, message content | US (SCCs required) | ☐ execute |
| **Anthropic** (Anthropic, PBC) | AI assistant, document scanning, market-data summarisation | Prompt content — user questions **plus** a standing context built once per session and attached to every message: property/financial data, tenant full name, and up to 50 clients with full name, phone, ΑΦΜ, rating, blacklist flag and free-text stay notes (`PropertyAssistant.tsx:165-380`). **Whole documents and photos** are uploaded for scanning: leases, tenant ID documents, bills, loan papers (`app/api/anthropic/route.tsx:131`). This is third-party personal data leaving the EU — the assistant is not a low-egress surface. | US (SCCs required) | ☐ execute; confirm no-training terms |
| **GitHub** (GitHub, Inc. / Microsoft) | Source control, CI/CD, encrypted DB-backup artifacts | Source code; backup artifacts contain customer data (encrypted when `BACKUP_PASSPHRASE` set) | US (SCCs required) | ☐ execute (GitHub DPA) |
| **Lemon Squeezy** (Lemon Squeezy, LLC) | Subscription billing & payments, merchant of record | Billing contact, card handled by Lemon Squeezy (PCI scope stays with them), subscription IDs | US/EU (SCCs) | ☐ execute (Lemon Squeezy DPA) |
| **Vercel** (Vercel Inc.) | Application hosting and delivery — every request transits it en route to the database | Request metadata, IP; application traffic in transit | US — global edge network | ☐ execute (Vercel DPA) |
| **Google** (Google LLC) | Three distinct live paths: Google OAuth sign-in (`app/login/page.tsx:56`, `app/signup/page.tsx:55`); embedded Maps iframe in the contact dossier (`proxy.ts:21`); ~~Google Fonts in printable reports~~ — **removed 2026-07-27**: fonts are now self-hosted and emitted by `lib/print/fonts.ts`; `scripts/security-check.mjs` fails the build if the host reappears | OAuth: email + Google account identity. Maps: **user IP address and referrer** when a contact dossier with an address is opened. The printable-report font path that leaked IP on *every* PDF is closed | US (SCCs required) | ☐ execute (Google Cloud/Workspace DPA) |
| **OpenStreetMap Foundation** (Nominatim) | Address autocomplete as the user types a contact (`TabContacts.tsx:259`, allowed in `proxy.ts:18`) | The partial address string the user types, plus IP | EU (UK/DE infrastructure) | ☐ confirm acceptable-use policy compliance |
| **Sentry** *(env-gated, not live)* | Application error reporting — only active when `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` is set (`lib/observability/report.ts:79`) | Error message, stack trace, request URL — may incidentally contain identifiers | US/EU depending on org region | ☐ execute before enabling |
| Browser push services — **Google / Apple / Mozilla** *(live once VAPID keys are set)* | Web push delivery: the browser picks the service, the user opts in per device (`lib/push/*`, table `push_subscriptions`) | The device's push endpoint and the **ciphertext** of the notification. Content is encrypted end-to-end with keys the user's browser generates (RFC 8291) — the service relays a sealed envelope and cannot read amounts or vendors | US and EU (SCCs where US) | ☐ execute before enabling |
| Messaging providers — **Viber / WhatsApp (Meta) / Apple** *(planned, not live)* | Multichannel notification delivery | Phone number, short message content (no amounts/PII on lock screen by policy) | Various (SCCs) | ☐ execute per provider before go-live |

## Notes
- **Data residency**: the system of record (Supabase) is EU-hosted. Email/AI/repo
  subprocessors are US-based and require **Standard Contractual Clauses** (SCCs)
  plus a transfer-risk assessment.
- **Minimisation on egress**: the messaging layer's lock-screen rule (no amounts,
  no private names) holds. The AI path does **not** — see the Anthropic row. Do
  not describe the assistant as minimised anywhere public; `/trust` and
  `/privacy` now state plainly what goes.
- **Silent paths are the dangerous ones.** Google Fonts and Maps were live for
  months without appearing here, because nobody chose them as a "subprocessor" —
  they arrived as a `<link>` tag. Before publishing a claim like "here is
  everyone", grep the CSP allowlist in `proxy.ts` and every external hostname in
  `app/` and `lib/`; the CSP is the honest inventory of who the browser talks to.
- **Adding a subprocessor**: update this table, execute the DPA/SCCs, and give
  customers advance notice with a right to object, per the DPA. The public
  summary lives in `app/trust/page.tsx` (`SUBPROCESSORS`) and
  `app/privacy/page.tsx` — all three must change together.
