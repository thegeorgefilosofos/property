-- Στοιχεία επικοινωνίας πάνω σε ένα γεγονός ημερολογίου: τηλέφωνο (κλήση με ένα
-- άγγιγμα) και email (mailto). Χρήσιμα για ραντεβού με μάστορα/λογιστή/πάροχο.
alter table if exists calendar_events
  add column if not exists contact_phone text,
  add column if not exists contact_email text;
