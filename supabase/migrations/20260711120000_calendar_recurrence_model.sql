-- Πλήρες μοντέλο επανάληψης για γεγονότα ημερολογίου (όπως κάθε σοβαρό calendar):
--  • recurrence_until   — ημερομηνία λήξης της σειράς (προαιρετική)
--  • recurrence_count   — μέγιστο πλήθος εμφανίσεων, εναλλακτικά της λήξης (προαιρετικό)
--  • recurrence_exdates — ημερομηνίες εξαίρεσης (YYYY-MM-DD) για «παράλειψη/επεξεργασία
--                         μόνο αυτής της εμφάνισης» (η εμφάνιση αποσπάται ή διαγράφεται)
-- Το «αυτό και τα επόμενα» υλοποιείται κόβοντας τη σειρά (recurrence_until) και
-- δημιουργώντας νέα σειρά από την επιλεγμένη ημερομηνία.
alter table if exists calendar_events
  add column if not exists recurrence_until   date,
  add column if not exists recurrence_count    integer,
  add column if not exists recurrence_exdates  jsonb not null default '[]'::jsonb;
