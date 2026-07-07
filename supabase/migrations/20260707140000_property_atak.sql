-- supabase/migrations/20260707140000_property_atak.sql
-- Αριθμός Ταυτότητας Ακινήτου (ΑΤΑΚ) ανά ακίνητο — απαραίτητος για την
-- Αναλυτική Κατάσταση Ε2. Σήμερα το `atak` υπάρχει μόνο στο TS interface και
-- στον DocumentScan (αρχειοθετείται σε σημείωση), ΟΧΙ ως στήλη — γι' αυτό η
-- στήλη ΑΤΑΚ θα ήταν πάντα κενή χωρίς αυτό. Ασφαλές να τρέξει πολλές φορές.
-- Το public.user_properties έχει ήδη RLS (own_user_properties από το
-- 20260706120000_core_rls_hardening), οπότε ΔΕΝ χρειάζεται νέα πολιτική.
alter table public.user_properties add column if not exists atak text;
