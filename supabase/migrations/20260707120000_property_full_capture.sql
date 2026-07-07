-- ─────────────────────────────────────────────────────────────────────────
-- Πλήρης καταγραφή στοιχείων ακινήτου στο user_properties.
-- Προσθέτει όλες τις στήλες που ΔΙΑΒΑΖΕΙ ήδη το dashboard (ΑΤΑΚ, αντικειμενική
-- αξία, εκτ. ΕΝΦΙΑ, ενεργειακή κλάση ΠΕΑ, θέρμανση, ασφάλιση, ημ. αγοράς) αλλά
-- ποτέ δεν καταχωρούνταν, καθώς και νέα πεδία (θέσεις στάθμευσης, αποθήκη,
-- τρόπος μίσθωσης), ώστε τα KPI (αξία/ενοίκιο/απόδοση) να σταματήσουν να
-- δείχνουν 0 €. Οι βασικές στήλες αξίας/ενοικίου προστίθενται αμυντικά κι αυτές.
-- Ασφαλές & επαναλήψιμο (idempotent): κάθε στήλη με «add column if not exists»,
-- δεν πειράζει τυχόν υπάρχουσες στήλες ή τύπους. Τρέξε το άφοβα όσες φορές θες.
-- ─────────────────────────────────────────────────────────────────────────

-- Βασικά KPI-driving πεδία (αμυντικά, μπορεί να προϋπάρχουν)
alter table public.user_properties add column if not exists value numeric;          -- εμπορική αξία
alter table public.user_properties add column if not exists target_rent numeric;    -- στόχος μηνιαίου ενοικίου
alter table public.user_properties add column if not exists sqm numeric;
alter table public.user_properties add column if not exists ownership numeric;       -- ποσοστό ιδιοκτησίας

-- Μητρώο / ταυτότητα ακινήτου
alter table public.user_properties add column if not exists atak text;              -- ΑΤΑΚ

-- Αξίες & φορολογικά
alter table public.user_properties add column if not exists obj_value numeric;       -- αντικειμενική αξία
alter table public.user_properties add column if not exists enfia numeric;           -- εκτ. ετήσιο ΕΝΦΙΑ
alter table public.user_properties add column if not exists purchase_price numeric;  -- τιμή αγοράς
alter table public.user_properties add column if not exists purchase_date date;      -- ημερομηνία αγοράς

-- Φυσικά χαρακτηριστικά
alter table public.user_properties add column if not exists year_built integer;
alter table public.user_properties add column if not exists floor integer;
alter table public.user_properties add column if not exists pea_class text;           -- ενεργειακή κλάση ΠΕΑ
alter table public.user_properties add column if not exists heating text;             -- τύπος θέρμανσης (slug)
alter table public.user_properties add column if not exists parking_spaces integer;   -- θέσεις στάθμευσης
alter table public.user_properties add column if not exists storage_sqm numeric;      -- αποθήκη (τ.μ.)
alter table public.user_properties add column if not exists bedrooms integer;         -- υπνοδωμάτια (προαιρετικό)

-- Μίσθωση
alter table public.user_properties add column if not exists rental_mode text;         -- 'long_term' | 'short_term'

-- Ασφάλιση (σε επίπεδο ακινήτου, cross-tab με Ρυθμίσεις/Εκκρεμότητες)
alter table public.user_properties add column if not exists insurance_company text;
alter table public.user_properties add column if not exists insurance_amount numeric;
alter table public.user_properties add column if not exists insurance_expiry date;

-- Σημειώσεις
alter table public.user_properties add column if not exists notes text;

-- ── RLS (επαναβεβαίωση, idempotent — ίδιο όνομα πολιτικής με core_rls_hardening) ──
do $$
begin
  alter table public.user_properties enable row level security;
  drop policy if exists own_user_properties on public.user_properties;
  create policy own_user_properties on public.user_properties for all
    using      (user_id::text = auth.uid()::text)
    with check (user_id::text = auth.uid()::text);
exception when others then
  raise notice 'RLS skip user_properties: %', sqlerrm;
end $$;
