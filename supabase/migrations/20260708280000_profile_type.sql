-- profile_type: 'individual' (ιδιώτης) | 'professional' (επαγγελματίας διαχειριστής).
-- Οδηγεί το interface ώστε ο καθένας να βλέπει μόνο ό,τι χρειάζεται.
alter table public.billing_profiles add column if not exists profile_type text default 'individual';
