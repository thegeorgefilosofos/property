-- ═══════════════════════════════════════════════════════════════════════════
-- Schema reconciliation & hygiene (safe subset)
--
-- The deep audit found the squashed baseline had drifted from the real production
-- schema. This migration fixes the confirmed issues that can be applied with ZERO
-- risk to production data:
--   • every statement is idempotent (IF [NOT] EXISTS) → a no-op where the object
--     already exists (production), and a real fix on a from-scratch rebuild (staging);
--   • foreign keys are added NOT VALID → they never fail on pre-existing rows and
--     are enforced for all future writes.
--
-- The RISKIER normalizations the audit also found — converting text user_id/
-- property_id columns to uuid, adding validating FKs, SET NOT NULL, and per-table
-- updated_at triggers — are deliberately DEFERRED to a backup-gated migration
-- (see docs/infra/acquisition-readiness.md), because on the current free tier there
-- is no PITR/backup to recover from a bad data-dependent conversion.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── HIGH · rent_payments column drift ────────────────────────────────────────
-- get_portal_data() and the whole rent-tracking UI reference these columns; the
-- baseline's CREATE TABLE omits them, so a from-scratch rebuild breaks the portal
-- (column does not exist at runtime). Add them if missing; on production they
-- already exist so this is a no-op.
alter table public.rent_payments add column if not exists tenant_id    uuid;
alter table public.rent_payments add column if not exists period_year  integer;
alter table public.rent_payments add column if not exists period_month integer;
alter table public.rent_payments add column if not exists paid         boolean;
alter table public.rent_payments add column if not exists paid_date    date;
alter table public.rent_payments add column if not exists days_late    integer;

-- Derive `paid` from the legacy `status` ONLY where it is still NULL. On production
-- the column already holds real values (never NULL) → matches nothing → no-op. On a
-- fresh rebuild it seeds a consistent value so the portal's `paid = false` filter works.
update public.rent_payments set paid = (lower(coalesce(status, '')) = 'paid') where paid is null;

-- Covering index for the tenant lookup get_portal_data performs.
create index if not exists idx_rent_payments_tenant on public.rent_payments(tenant_id);

-- ── MED · drop the duplicate FK on checkin_links.client_id ────────────────────
alter table public.checkin_links drop constraint if exists checkin_links_client_fk; -- keep ..._client_id_fkey

-- ── MED · drop redundant / duplicate indexes (leading-prefix + unique-dupes) ──
drop index if exists public.bills_history_prop_idx;
drop index if exists public.bills_history_year_idx;
drop index if exists public.bills_settings_prop_idx;
drop index if exists public.bills_settings_property_section_idx; -- covered by the UNIQUE(property_id,section)
drop index if exists public.rent_comparables_property_idx;
drop index if exists public.idx_notif_log_dedup;                 -- duplicates UNIQUE(event_id,reminder_type)

-- ── LOW · add the missing indexes RLS / FK filters actually use ───────────────
create index if not exists idx_airbnb_bookings_user     on public.airbnb_bookings(user_id);
create index if not exists idx_airbnb_bookings_property on public.airbnb_bookings(property_id);
create index if not exists idx_tenant_comm_log_user     on public.tenant_comm_log(user_id);
create index if not exists idx_tenant_comm_log_tenant   on public.tenant_comm_log(tenant_id);
create index if not exists idx_tenant_damages_user      on public.tenant_damages(user_id);

-- ── HIGH · cascade-clean owner rows on account deletion (GDPR erase) ──────────
-- Add FK user_id → auth.users(id) ON DELETE CASCADE for owner tables that lack it
-- AND whose user_id is already uuid. NOT VALID: never fails on pre-existing rows,
-- enforced for every future write. The three text-typed tables (airbnb_bookings,
-- inventory_items, tenant_comm_log) are handled in the deferred backup-gated pass.
do $$
declare t text; tbls text[] := array['guest_checkins','inventory_maintenance','maintenance_requests','notification_log','tenant_damages'];
begin
  foreach t in array tbls loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id' and data_type = 'uuid'
    ) and not exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = t and c.contype = 'f' and c.conname = t || '_user_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade not valid',
        t, t || '_user_id_fkey'
      );
    end if;
  end loop;
end $$;
