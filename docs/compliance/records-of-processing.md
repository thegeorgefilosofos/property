# Records of Processing Activities (RoPA) — Property OS

GDPR Art. 30 record for Property OS as **data controller** for its customers'
account data, and as **data processor** for the tenant/third-party personal data
that customers enter about their properties. Keep current; a technical/legal
buyer's due diligence expects this document to exist.

## Controller / contact
- **Controller**: Property OS (operator of «Property OS»), Greece.
- **Contact for data protection**: _(add the responsible person + email)_.
- **EU establishment**: yes (Greece); primary data residency **EU — Frankfurt**.

## Processing activities

| # | Activity | Data subjects | Data categories | Purpose | Legal basis (Art. 6) | Retention |
|---|---|---|---|---|---|---|
| 1 | **Account & authentication** | Property owners (users) | Email, name, hashed password, MFA factor, session/audit logs | Provide the service, secure the account | Contract 6(1)(b); security = legitimate interest 6(1)(f) | Life of account + 30 days after deletion |
| 2 | **Property & financial records** | Users | Property details, ΑΤΑΚ, obj. value, ΕΝΦΙΑ, rent, loans, bank-import lines, tax figures, documents | Core product function (management, tax, reporting) | Contract 6(1)(b); tax records = legal obligation 6(1)(c) | Life of account; tax-relevant records per Greek statutory periods |
| 3 | **Tenant / guest records** (customer acts as controller; we are processor) | Tenants, short-stay guests, leads | Name, ΑΦΜ, phone, email, ID number, lease terms, stay history | Let the customer manage tenancies | Processor — customer's basis (contract / legitimate interest) | Controlled by the customer; deleted on their instruction or account deletion |
| 4 | **Transactional email/notifications** | Users, tenants | Email/phone, message content | Deliver receipts, reminders, obligations | Contract 6(1)(b) | Outbox rows retained for audit; expired/stale purged |
| 5 | **Lifecycle & marketing email** | Users | Email, engagement, plan/tenure, derived segments | Onboarding, product news, seasonal/value nudges | Consent 6(1)(a) / soft opt-in with easy unsubscribe = legitimate interest 6(1)(f) | Until unsubscribe; suppression list kept |
| 6 | **AI assistant / suggestions** | Users | Prompt context (property data, questions) | In-product assistance | Contract 6(1)(b); processed by Anthropic under SCCs | Not retained for training (confirm in DPA) |
| 7 | **Billing** (when live) | Users | Billing contact, subscription IDs (card at Stripe) | Take payment | Contract 6(1)(b); invoices = legal obligation 6(1)(c) | Statutory accounting period |
| 8 | **Backups & DR** | All of the above | Full logical dump | Disaster recovery | Legitimate interest 6(1)(f) | 30-day rolling; encrypted at rest when configured |

## Data subject rights — how they are served
- **Access & portability**: one-click **export** (`export_my_data`, per-user JSON of every table).
- **Erasure**: **delete account** (`delete_my_account`, cascades to owned data).
- **Rectification**: in-app editing across all records.
- **Objection / opt-out**: per-message unsubscribe; marketing gated behind `email_marketing_prefs`.
- **Restriction**: account can be closed; data export before deletion.

## International transfers
US subprocessors (Resend, Anthropic, GitHub, Stripe) under **SCCs**; system of
record stays in the EU. See `subprocessors.md`.

## Security measures (summary)
RLS tenant isolation on every table; SECURITY DEFINER functions pin `search_path`;
service-role key server-side only; secrets in the deployment environment only;
MFA/TOTP available; encrypted backups (optional passphrase); full adversarial
security audit on file (`docs/db/security-audit-2026-07.md`).
