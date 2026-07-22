# Subprocessor register — Property OS

The third parties that may process personal data on behalf of Property OS, why,
and where. Maintained under GDPR Art. 28 (3)(d). Publish a summary of this list
on the website and notify customers before adding a new subprocessor.

> Status of this document: **factual inventory of what the stack uses today.**
> DPA column records whether a signed Data Processing Agreement is in place —
> execute the ones marked ☐ before onboarding real customer data at scale.

| Subprocessor | Purpose | Data categories | Region / residency | DPA |
|---|---|---|---|---|
| **Supabase** (Supabase Inc.) | Managed Postgres, Auth, Storage, Edge Functions — the primary platform | All application data: owner + tenant PII, property/financial data, documents, auth credentials (hashed) | **EU — Frankfurt, `eu-central-1`** | ☐ execute (Supabase offers a standard DPA) |
| **Resend** (Resend, Inc.) | Transactional + lifecycle email delivery | Recipient email, name, message content | US (SCCs required) | ☐ execute |
| **Anthropic** (Anthropic, PBC) | AI assistant / smart suggestions, market-data summarisation | Prompt content (property context, user questions) — no special-category data sent | US (SCCs required) | ☐ execute; confirm no-training terms |
| **GitHub** (GitHub, Inc. / Microsoft) | Source control, CI/CD, encrypted DB-backup artifacts | Source code; backup artifacts contain customer data (encrypted when `BACKUP_PASSPHRASE` set) | US (SCCs required) | ☐ execute (GitHub DPA) |
| **Stripe** (Stripe, Inc.) *(if/when billing goes live)* | Subscription billing & payments | Billing contact, card handled by Stripe (PCI scope stays with Stripe), subscription IDs | US/EU (SCCs) | ☐ execute (Stripe DPA) |
| Messaging providers — **Viber / WhatsApp (Meta) / Apple / FCM (Google)** *(planned, not live)* | Multichannel notification delivery | Phone number / device token, short message content (no amounts/PII on lock screen by policy) | Various (SCCs) | ☐ execute per provider before go-live |

## Notes
- **Data residency**: the system of record (Supabase) is EU-hosted. Email/AI/repo
  subprocessors are US-based and require **Standard Contractual Clauses** (SCCs)
  plus a transfer-risk assessment.
- **Minimisation on egress**: the messaging layer's lock-screen rule (no amounts,
  no private names) and the AI prompts (no special-category data) keep what leaves
  the EU boundary to the minimum needed.
- **Adding a subprocessor**: update this table, execute the DPA/SCCs, and give
  customers advance notice with a right to object, per the DPA.
