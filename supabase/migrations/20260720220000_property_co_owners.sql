-- Συνιδιοκτήτες ακινήτου: λίστα ονομάτων όταν το ποσοστό ιδιοκτησίας < 100%.
-- Αποθηκεύεται ως jsonb array of text (π.χ. ["Μαρία Παπαδοπούλου", "Γιώργος Ν."]).
alter table public.user_properties
  add column if not exists co_owners jsonb;

comment on column public.user_properties.co_owners is
  'Ονόματα συνιδιοκτητών (jsonb array of text) όταν το ownership είναι < 100%.';
