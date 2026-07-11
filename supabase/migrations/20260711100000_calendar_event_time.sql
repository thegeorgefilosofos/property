-- Ώρα ραντεβού για γεγονότα ημερολογίου. Προαιρετική («HH:MM», 24ωρο)· όταν είναι
-- NULL το γεγονός είναι ολοήμερο. Κρατιέται ως text για απλότητα (ζώνη ώρας: τοπική
-- του χρήστη) — το χρησιμοποιεί η προβολή Ημέρας, οι εξωτερικοί σύνδεσμοι ημερολογίου
-- (Google/Outlook/Apple/Yahoo) και το .ics. Προαιρετική διάρκεια σε λεπτά.
alter table if exists calendar_events
  add column if not exists event_time text,
  add column if not exists duration_minutes integer;
