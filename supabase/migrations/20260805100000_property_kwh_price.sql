-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΤΙΜΗ ΤΟΥ ΡΕΥΜΑΤΟΣ ΔΕΝ ΑΠΟΘΗΚΕΥΟΤΑΝ ΠΟΤΕ
-- ─────────────────────────────────────────────────────────────────────────
-- Στην Απογραφή ο χρήστης γράφει «Τιμή ρεύματος €/kWh». Το πεδίο έγραφε:
--
--   supabase.from('property_settings').upsert(
--     { property_id, user_id, kwh_price, updated_at }, { onConflict: 'property_id,user_id' })
--
-- Τρία ανεξάρτητα λάθη στην ίδια πρόταση:
--   1. Ο `property_settings` ΔΕΝ έχει `kwh_price`.
--   2. Ούτε `updated_at`.
--   3. Το `onConflict: 'property_id,user_id'` δεν αντιστοιχεί σε κανέναν
--      περιορισμό — ο μόνος είναι `property_settings_property_id_key UNIQUE
--      (property_id)`. Χωρίς ταιριαστό arbiter, η Postgres ρίχνει 42P10.
-- Και το `{ error }` δεν διαβαζόταν, οπότε τίποτα από τα τρία δεν φαινόταν.
--
-- Ο χρήστης πληκτρολογούσε 0,19, τα πλακίδια άναβαν από την τοπική κατάσταση
-- («Ρεύμα/Μήνα», «Κόστος/έτος», κόστος ανά συσκευή, οι εξαγωγές) και στην
-- επόμενη φόρτωση όλα γύριζαν στο μηδέν. Καμία ένδειξη, πουθενά.
--
-- ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΟΝ `tenants`
-- Η ανάγνωση είχε ήδη διορθωθεί ώστε να διαβάζει `tenants.kwh_price` — αλλά η
-- τιμή της κιλοβατώρας είναι χαρακτηριστικό του ΑΚΙΝΗΤΟΥ, όχι του μισθωτή. Ένα
-- κενό διαμέρισμα εξακολουθεί να έχει ψυγείο και θερμοσίφωνα και ακριβώς αυτό
-- υπολογίζει η οθόνη. Αν η τιμή ζούσε στον μισθωτή, το χαρακτηριστικό θα ήταν
-- νεκρό για κάθε ακίνητο χωρίς ενεργή μίσθωση.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.property_settings
  add column if not exists kwh_price numeric;

comment on column public.property_settings.kwh_price is
  'Τιμή κιλοβατώρας (€/kWh) για τον υπολογισμό κόστους λειτουργίας του εξοπλισμού. Ανήκει στο ακίνητο, όχι στη μίσθωση.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'property_settings' and column_name = 'kwh_price'
  ) then
    raise exception 'το kwh_price δεν προστέθηκε στον property_settings';
  end if;

  -- Ο περιορισμός πάνω στον οποίο θα γίνεται πλέον το upsert. Αν λείψει, το
  -- `on conflict (property_id)` σκάει με 42P10 και η τιμή πάλι δεν αποθηκεύεται —
  -- δηλαδή το ίδιο σφάλμα με άλλο πρόσωπο.
  --
  -- Ο έλεγχος γίνεται στις ΣΤΗΛΕΣ, όχι στο όνομα. Το `on conflict` δεν κοιτά
  -- ποτέ όνομα περιορισμού· ψάχνει μοναδικό ευρετήριο πάνω στη στήλη. Ένας
  -- έλεγχος με `conname = 'property_settings_property_id_key'` θα έπεφτε σε κάθε
  -- βάση όπου ο ίδιος ακριβώς περιορισμός δημιουργήθηκε ανώνυμα — δηλαδή θα
  -- κατήγγειλε ως λάθος κάτι που δουλεύει μια χαρά.
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.property_settings'::regclass
      and c.contype in ('u', 'p')
      and c.conkey = array[(select attnum from pg_attribute
                            where attrelid = c.conrelid and attname = 'property_id')]
  ) then
    raise exception 'ο property_settings χρειάζεται μοναδικό περιορισμό ΜΟΝΟ στο property_id, αλλιώς το on conflict σκάει με 42P10';
  end if;
end $$;
