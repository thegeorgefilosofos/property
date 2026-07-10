-- ═══════════════════════════════════════════════════════════════════════════
-- Σύνδεση δαπάνης με επαφή (επαγγελματία/προμηθευτή), για ακριβές ιστορικό
-- πληρωμών ανά επαφή στο ντοσιέ. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.expenses add column if not exists contact_id uuid;
create index if not exists idx_expenses_contact on public.expenses(contact_id);
