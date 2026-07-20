-- ════════════════════════════════════════════════════════════════════════════
-- Ενοικιαστές (tenants): πλήρες, ιδεοτυπικό (idempotent) σχήμα.
--
-- Ιστορικό: ο βασικός πίνακας `tenants` δημιουργήθηκε σε πολύ πρώιμη φάση εκτός
-- ελέγχου εκδόσεων· το repo περιείχε μόνο μεταγενέστερα `add column`. Αν μια
-- εγκατάσταση Supabase δεν είχε ΟΛΕΣ τις στήλες που γράφει η φόρμα ενοικιαστή,
-- κάθε INSERT αποτύγχανε («Could not find the 'X' column»). Το αρχείο αυτό
-- εγγυάται ότι ο πίνακας υπάρχει με ΚΑΘΕ πεδίο που χρησιμοποιεί η εφαρμογή.
--
-- Είναι ασφαλές να εκτελεστεί ξανά: `create table if not exists`,
-- `add column if not exists`, `drop policy if exists` + `create policy`.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Βασικός πίνακας (no-op αν υπάρχει ήδη) ────────────────────────────────────
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  user_id     uuid not null default auth.uid(),
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);

-- 2) Όλες οι στήλες που γράφει η εφαρμογή (add column if not exists) ────────────
-- Ταυτότητα & επικοινωνία
alter table public.tenants add column if not exists email        text;
alter table public.tenants add column if not exists phone        text;
alter table public.tenants add column if not exists phone_work   text;
alter table public.tenants add column if not exists nationality  text;
alter table public.tenants add column if not exists profession   text;
alter table public.tenants add column if not exists employer     text;
alter table public.tenants add column if not exists afm          text;
alter table public.tenants add column if not exists id_doc_type   text;
alter table public.tenants add column if not exists id_doc_number text;
alter table public.tenants add column if not exists iban         text;
alter table public.tenants add column if not exists notes        text;

-- Μίσθωση
alter table public.tenants add column if not exists lease_type       text;
alter table public.tenants add column if not exists lease_category   text;   -- 'residential' | 'commercial'
alter table public.tenants add column if not exists lease_start      date;
alter table public.tenants add column if not exists lease_end        date;
alter table public.tenants add column if not exists custom_lease_days integer;
alter table public.tenants add column if not exists monthly_rent     numeric;
alter table public.tenants add column if not exists payment_frequency text;
alter table public.tenants add column if not exists rent_due_day     integer;
alter table public.tenants add column if not exists rent_iban        text;
alter table public.tenants add column if not exists furnishing       text;   -- 'empty' | 'furnished' | 'turnkey'
alter table public.tenants add column if not exists status           text default 'active';
alter table public.tenants add column if not exists move_out_date    date;

-- Εγγύηση
alter table public.tenants add column if not exists deposit_amount      numeric;
alter table public.tenants add column if not exists deposit_method      text;
alter table public.tenants add column if not exists deposit_paid_on     date;
alter table public.tenants add column if not exists deposit_invested    boolean default false;
alter table public.tenants add column if not exists deposit_returned    boolean default false;
alter table public.tenants add column if not exists deposit_return_date date;
alter table public.tenants add column if not exists deposit_invest_rate numeric;
alter table public.tenants add column if not exists deposit_invest_type text;
alter table public.tenants add column if not exists deposit_invest_term text;

-- Ρεύμα / νερό / internet
alter table public.tenants add column if not exists all_inclusive           boolean default false;
alter table public.tenants add column if not exists kwh_limit               numeric;
alter table public.tenants add column if not exists kwh_price               numeric;
alter table public.tenants add column if not exists electricity_provider    text;
alter table public.tenants add column if not exists electricity_tariff      text;
alter table public.tenants add column if not exists electricity_monthly_limit numeric;
alter table public.tenants add column if not exists water_monthly_limit     numeric;
alter table public.tenants add column if not exists internet_provider       text;
alter table public.tenants add column if not exists internet_plan           text;
alter table public.tenants add column if not exists internet_cost           numeric;

-- Παροχές / streaming / καθαρισμός / extra
alter table public.tenants add column if not exists e_payment               boolean default true;
alter table public.tenants add column if not exists streaming               jsonb;
alter table public.tenants add column if not exists cleaning                jsonb;
alter table public.tenants add column if not exists extra_perks             text;
alter table public.tenants add column if not exists welcome_basket          boolean default false;
alter table public.tenants add column if not exists welcome_basket_amount   numeric;
alter table public.tenants add column if not exists welcome_basket_contents text;

-- Στάθμευση
alter table public.tenants add column if not exists parking_included        boolean default false;
alter table public.tenants add column if not exists parking_extra           boolean default false;
alter table public.tenants add column if not exists parking_extra_price     numeric;
alter table public.tenants add column if not exists parking_type            text;
alter table public.tenants add column if not exists parking_has_electricity boolean default false;
alter table public.tenants add column if not exists parking_notes           text;

-- Ετήσιες συντηρήσεις (enum επιβάρυνσης + ποσοστό ιδιοκτήτη + συχνότητα)
alter table public.tenants add column if not exists ac_service_by                   text;
alter table public.tenants add column if not exists ac_service_frequency            text;
alter table public.tenants add column if not exists ac_service_owner_pct            numeric;
alter table public.tenants add column if not exists solar_service_by                text;
alter table public.tenants add column if not exists solar_service_frequency         text;
alter table public.tenants add column if not exists solar_service_owner_pct         numeric;
alter table public.tenants add column if not exists heat_pump_service_by            text;
alter table public.tenants add column if not exists heat_pump_service_frequency     text;
alter table public.tenants add column if not exists heat_pump_service_owner_pct     numeric;
alter table public.tenants add column if not exists solar_panels_service_by         text;
alter table public.tenants add column if not exists solar_panels_service_frequency  text;
alter table public.tenants add column if not exists solar_panels_service_owner_pct  numeric;
alter table public.tenants add column if not exists pest_control_by                 text;
alter table public.tenants add column if not exists pest_control_frequency          text;
alter table public.tenants add column if not exists pest_control_owner_pct          numeric;
alter table public.tenants add column if not exists annual_services_notes           text;

-- Προπληρωμή
alter table public.tenants add column if not exists prepay_option       boolean default false;
alter table public.tenants add column if not exists prepay_months       integer;
alter table public.tenants add column if not exists prepay_discount_pct numeric;
alter table public.tenants add column if not exists prepay_invested     boolean default false;
alter table public.tenants add column if not exists prepay_invest_rate  numeric;
alter table public.tenants add column if not exists prepay_invest_type  text;
alter table public.tenants add column if not exists prepay_invest_term  text;

-- Έγγραφα μισθωτηρίου
alter table public.tenants add column if not exists lease_doc_url          text;
alter table public.tenants add column if not exists lease_doc_name         text;
alter table public.tenants add column if not exists lease_doc_external_url text;

-- 3) Ευρετήρια ────────────────────────────────────────────────────────────────
create index if not exists tenants_property_idx on public.tenants (property_id);
create index if not exists tenants_user_idx     on public.tenants (user_id);

-- 4) RLS: ο χρήστης βλέπει/γράφει μόνο τους δικούς του ενοικιαστές ─────────────
alter table public.tenants enable row level security;
drop policy if exists own_tenants on public.tenants;
create policy own_tenants on public.tenants for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
