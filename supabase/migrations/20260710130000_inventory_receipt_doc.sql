-- Επισύναψη απόδειξης/εγγύησης (PDF ή φωτο) ανά αντικείμενο απογραφής —
-- ώστε η εγγύηση να αποδεικνύεται, όχι απλώς να δηλώνεται.
alter table if exists inventory_items
  add column if not exists receipt_doc_url text,
  add column if not exists receipt_doc_name text;
