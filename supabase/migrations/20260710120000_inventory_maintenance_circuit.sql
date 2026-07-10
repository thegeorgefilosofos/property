-- Συντήρηση ως «κύκλωμα»: κάθε προγραμματισμένη εργασία συνδέεται με μια εγγραφή
-- ημερολογίου (υπενθυμίσεις/εκκρεμότητες) και μια προγραμματισμένη δαπάνη (προϋπολογισμός).
-- Κρατάμε τα ids ώστε η ολοκλήρωση/διαγραφή να ενημερώνει/καθαρίζει χωρίς διπλοεγγραφές.
alter table if exists inventory_maintenance
  add column if not exists est_cost numeric default 0,
  add column if not exists calendar_event_id uuid,
  add column if not exists expense_id uuid;
