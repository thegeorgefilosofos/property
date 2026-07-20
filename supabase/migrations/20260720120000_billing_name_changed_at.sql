-- ─── 20260720120000_billing_name_changed_at.sql ───
-- Χρονοσήμανση τελευταίας αλλαγής ονόματος (full_name) στο billing_profiles.
-- Επιτρέπει τον περιορισμό «αλλαγή ονόματος μία φορά ανά μήνα» από τη σελίδα
-- «Λογαριασμός». Ασφαλές να τρέξει πολλές φορές.
alter table public.billing_profiles
  add column if not exists full_name_changed_at timestamptz;
