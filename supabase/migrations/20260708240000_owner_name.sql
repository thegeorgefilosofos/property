-- owner_name: το μικρό/εμφανιζόμενο όνομα του ιδιοκτήτη για την προσφώνηση
-- («Καλησπέρα, Γιώργο»). Ανά χρήστη, ανεξάρτητο από το νομικό full_name της
-- τιμολόγησης, ώστε η επεξεργασία στη σελίδα να μη χαλάει τα στοιχεία χρέωσης.
alter table public.billing_profiles add column if not exists owner_name text;
