# Property OS · Row-Level Security — audit & conventions

The RLS on `public` had accumulated **3–4 generations of overlapping policies** from
different migrations/sessions. RLS policies are permissive (OR-combined), so stacking
them is redundant at best and a **security hole** at worst. This is the standard we
build to from now on, plus the audit that produced the consolidation migration
`*_rls_consolidation.sql`.

## The canonical model (one way, everywhere)

Every table falls into exactly one of four shapes. Name policies **only** as below —
no English-sentence names, no per-command duplicates unless the conditions genuinely
differ per command.

| Shape | Tables | Policies |
|---|---|---|
| **Owner-only** | personal data keyed by `user_id` | `own_<table>` · `FOR ALL TO authenticated USING (user_id = auth.uid())` (WITH CHECK defaults to USING) |
| **Owner + org-shared** | data a property-manager team shares | `own_<table>` **plus** `org_read_<table>` / `org_edit_<table>` / `org_del_<table>` via `is_org_member(org_id)` |
| **Reference / public read** | `bank_rates`, `market_rates`, `loan_programs`, `energy_tariffs`, `product_updates` | `<table>_read` (SELECT USING true) + `<table>_service_write` (ALL TO service_role) |
| **Service-managed** | outbox, cron-written | RLS on, no client policy (service_role bypasses RLS) |

Rules:
1. **RLS is always enabled** on every table in `public`.
2. A `FOR ALL` owner policy covers select/insert/update/delete — do **not** also add
   per-command owner policies. Omitting `WITH CHECK` on a `FOR ALL` policy makes it
   default to the `USING` expression, so inserts/updates are still guarded.
3. Org sharing goes through **one** `SECURITY DEFINER` helper, `public.is_org_member(uuid)`,
   never an inline subquery copy-pasted per policy.
4. Never a `TO public` / `TO authenticated` policy with `USING (true)` on user data —
   that grants **every** visitor/logged-in user access to **every** row.
5. One migration owns a table's RLS. Changes edit that block; they never bolt on a
   new ad-hoc policy.

## Audit findings (from the policy dump)

### 🔴 Security — verified against the live definitions + the code
- **`Public read inventory_handovers`** = `TO public USING (true)` → a **real hole**:
  any visitor could read every handover row. `TabInventory` reads this table only
  authenticated, so nothing depends on it → **dropped**.
- The three **`authenticated full …`** (inventory_handovers / _maintenance / _repairs)
  are `USING (auth.uid() = user_id)` — **correct owner policies**, merely duplicating
  `own_*`. Dropped as dedup; owner access unchanged.
- **RLS is enabled on every table** in `public` (verified: zero tables with
  `relrowsecurity = false`).

### 🟠 Redundancy — duplicate policy stacks (safe to collapse to `own_*` + `org_*`)
Same access declared 2–4 times over. Worst offenders:

- `bills` — **13** policies → 4 (`own_bills` + 3 `org_*`)
- `bills_settings` — 10 → 1 · `bills_history` — 9 → 1
- `expenses` — 8 → 4 · `property_settings` — 7 → 4 · `calendar_events` — 5 → 1
- `tenants` / `user_properties` / `loans` / `maintenance_tasks` / `checklist_items` /
  `contacts` — 4–5 → 2 (`own` + `org`)
- `notification_preferences` — 3 identical `ALL` → 1 · `tenant_comm_log` 2 → 1
- `property_data` / `rent_config` / `rent_comparables` / `rent_payments` /
  `notification_log` — 2 → 1

Kept untouched (already canonical): `own_*`-only tables (accountant_links, calendar_feed_tokens,
book_closings, messaging_prefs, push_subscriptions, referral_*, …), the reference tables,
and the `organizations` / `organization_members` multi-tenant core.

## Net result
~50 redundant/dangerous policies removed; every table left with **one owner policy
(+ org policies where sharing is intended)**. Access for a legitimate owner is
unchanged (the `own_*` `FOR ALL` policy already covers every command); what goes away
is the duplication and the every-user holes.
