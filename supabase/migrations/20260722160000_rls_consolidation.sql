-- ═══════════════════════════════════════════════════════════════════════════════
--  PROPERTY OS · RLS consolidation
--  Collapses 3–4 generations of overlapping row-level-security policies down to the
--  canonical model (docs/db/rls-conventions.md): one owner policy per table, plus
--  the org_* policies where property-manager sharing is intended.
--
--  SAFETY. Idempotent (drop … if exists). PART A removes ONLY duplicate policies that
--  are fully covered by the surviving `own_<table>` FOR ALL policy, so a legitimate
--  owner's access is unchanged — access can only shrink, never widen. Even so, this
--  is production: take a backup (Database → Backups) and, ideally, run it on a
--  Supabase branch first. PART B (security) is held until you confirm the USING clause.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══ PART A · DEDUPLICATION (safe to run) ══════════════════════════════════════
-- Keeps own_<table> (+ org_* where present); drops the English-named and per-command
-- owner duplicates that declare the same access a second and third time.

-- bills ── keep own_bills + org_{read,edit,del}_bills
drop policy if exists "bills_select" on public.bills;
drop policy if exists "bills_insert" on public.bills;
drop policy if exists "bills_update" on public.bills;
drop policy if exists "bills_delete" on public.bills;
drop policy if exists "Users can view own bills"   on public.bills;
drop policy if exists "Users can insert own bills" on public.bills;
drop policy if exists "Users can update own bills" on public.bills;
drop policy if exists "Users can delete own bills" on public.bills;
drop policy if exists "Users see own bills"        on public.bills;

-- bills_history ── keep own_bills_history
drop policy if exists "bills_history_select" on public.bills_history;
drop policy if exists "bills_history_insert" on public.bills_history;
drop policy if exists "bills_history_update" on public.bills_history;
drop policy if exists "bills_history_delete" on public.bills_history;
drop policy if exists "Users can view own bills_history"   on public.bills_history;
drop policy if exists "Users can insert own bills_history" on public.bills_history;
drop policy if exists "Users can update own bills_history" on public.bills_history;
drop policy if exists "Users can delete own bills_history" on public.bills_history;

-- bills_settings ── keep own_bills_settings
drop policy if exists "bills_settings_select" on public.bills_settings;
drop policy if exists "bills_settings_insert" on public.bills_settings;
drop policy if exists "bills_settings_update" on public.bills_settings;
drop policy if exists "bills_settings_delete" on public.bills_settings;
drop policy if exists "Users can view own bills_settings"   on public.bills_settings;
drop policy if exists "Users can insert own bills_settings" on public.bills_settings;
drop policy if exists "Users can update own bills_settings" on public.bills_settings;
drop policy if exists "Users can delete own bills_settings" on public.bills_settings;

-- expenses ── keep own_expenses + org_{read,edit,del}_expenses
drop policy if exists "Users can view own expenses"   on public.expenses;
drop policy if exists "Users can insert own expenses" on public.expenses;
drop policy if exists "Users can update own expenses" on public.expenses;
drop policy if exists "Users can delete own expenses" on public.expenses;

-- contacts / checklist_items ── keep own_* + org_*
drop policy if exists "Users see own contacts"  on public.contacts;
drop policy if exists "Users see own checklist" on public.checklist_items;

-- calendar_events ── keep own_calendar_events
drop policy if exists "Users see own events"   on public.calendar_events;
drop policy if exists "Users insert own events" on public.calendar_events;
drop policy if exists "Users update own events" on public.calendar_events;
drop policy if exists "Users delete own events" on public.calendar_events;

-- property_settings ── keep own_property_settings + org_*
drop policy if exists "User read property_settings"  on public.property_settings;
drop policy if exists "User write property_settings" on public.property_settings;
drop policy if exists "Users see own settings"       on public.property_settings;

-- notification_preferences ── three identical ALL → keep own_notification_preferences
drop policy if exists "own_notif_prefs"        on public.notification_preferences;
drop policy if exists "Users manage own prefs" on public.notification_preferences;

-- tenant_comm_log ── keep own_tenant_comm_log
drop policy if exists "own_comm_log" on public.tenant_comm_log;

-- tenants / user_properties / property_data ── keep own_* (+ org_* on the first two)
drop policy if exists "Users see own tenants"        on public.tenants;
drop policy if exists "Users own their properties"   on public.user_properties;
drop policy if exists "Users own their data"         on public.property_data;

-- rent_* ── keep own_*
drop policy if exists "Users see own comparables"   on public.rent_comparables;
drop policy if exists "Users see own rent config"   on public.rent_config;
drop policy if exists "Users see own rent payments" on public.rent_payments;

-- loans / maintenance_tasks ── keep own_* + org_*
drop policy if exists "Users see own loans" on public.loans;
drop policy if exists "Users see own tasks" on public.maintenance_tasks;

-- notification_log ── keep own_notif_log
drop policy if exists "Users see own logs" on public.notification_log;

-- inventory_* ── keep own_* (+ org_* on maintenance); drop the User read/write dups
drop policy if exists "User read inventory_maintenance"  on public.inventory_maintenance;
drop policy if exists "User write inventory_maintenance" on public.inventory_maintenance;
drop policy if exists "User read inventory_repairs"      on public.inventory_repairs;
drop policy if exists "User write inventory_repairs"     on public.inventory_repairs;
drop policy if exists "User read inventory_handovers"    on public.inventory_handovers;
drop policy if exists "User write inventory_handovers"   on public.inventory_handovers;


-- ═══ PART B · SECURITY & final dedup (verified — safe to run) ══════════════════
-- Verified against the live policy definitions AND the codebase:
--   • "Public read inventory_handovers" = TO public USING (true) → a REAL hole: any
--     visitor could read every handover row. TabInventory reads this table only
--     authenticated (…select().eq('property_id', …)); no public/portal path depends
--     on it, so we drop it outright.
--   • the three "authenticated full …" are USING (auth.uid() = user_id) — correct
--     owner policies that merely duplicate own_<table> (which guards ownership via
--     property_id / user_id). Dropping them leaves owner access intact.
drop policy if exists "Public read inventory_handovers"          on public.inventory_handovers;
drop policy if exists "authenticated full inventory_handovers"   on public.inventory_handovers;
drop policy if exists "authenticated full inventory_maintenance" on public.inventory_maintenance;
drop policy if exists "authenticated full inventory_repairs"     on public.inventory_repairs;
-- ═══════════════════════════════════════════════════════════════════════════════
