-- ═══════════════════════════════════════════════════════════════════════════
-- Τελικό bundle για την Απογραφή: κύκλωμα συντήρησης + επισύναψη αποδείξεων +
-- δημόσιο bucket φωτογραφιών. Όλα idempotent — τρέξ' το με ασφάλεια όσες φορές.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Κύκλωμα συντήρησης: κόστος + σύνδεσμοι με ημερολόγιο & δαπάνη.
alter table if exists inventory_maintenance
  add column if not exists est_cost numeric default 0,
  add column if not exists calendar_event_id uuid,
  add column if not exists expense_id uuid;

-- 2) Επισύναψη απόδειξης/εγγύησης ανά αντικείμενο.
alter table if exists inventory_items
  add column if not exists receipt_doc_url text,
  add column if not exists receipt_doc_name text;

-- 3) Το bucket φωτογραφιών να είναι δημόσιο (ώστε να φαίνονται σε PDF/εκτυπώσεις).
insert into storage.buckets (id, name, public)
values ('inventory-photos', 'inventory-photos', true)
on conflict (id) do update set public = true;
