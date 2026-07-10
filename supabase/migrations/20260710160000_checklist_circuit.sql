-- Εκκρεμότητες ως «κύκλωμα»: κάθε εργασία με προθεσμία/κόστος συνδέεται με μια
-- εγγραφή ημερολογίου (υπενθυμίσεις email) και μια προγραμματισμένη δαπάνη
-- (προϋπολογισμός/δαπάνες). Κρατάμε τα ids για ενημέρωση/καθαρισμό χωρίς διπλότυπα.
alter table if exists checklist_items
  add column if not exists calendar_event_id uuid,
  add column if not exists expense_id uuid;
