-- ═══════════════════════════════════════════════════════════════════════════
-- Ενοικιαστές — ποσοστό επιβάρυνσης ιδιοκτήτη (0–100) ανά ετήσια συντήρηση.
-- Αντικαθιστά την «Ιδιοκτήτης/Ενοικιαστής/50-50» με ελεύθερο ποσοστό (π.χ. 75/25).
-- 100 = όλο ο ιδιοκτήτης, 0 = όλο ο ενοικιαστής, ενδιάμεσο = μοιρασμένο.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tenants add column if not exists ac_service_owner_pct           numeric;
alter table public.tenants add column if not exists solar_service_owner_pct        numeric;
alter table public.tenants add column if not exists heat_pump_service_owner_pct    numeric;
alter table public.tenants add column if not exists solar_panels_service_owner_pct numeric;
alter table public.tenants add column if not exists pest_control_owner_pct         numeric;
