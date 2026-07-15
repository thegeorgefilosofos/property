-- ═══════════════════════════════════════════════════════════════════════
-- Property OS — Πλήρες SQL setup (idempotent — τρέξε το όσες φορές θέλεις)
-- Αντιγραψε ΟΛΟ αυτό το αρχείο στο Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 20260703120000_property_documents_supplier.sql ───
-- Προσθήκη διάστασης «Προμηθευτής/Πάροχος» στο αρχείο εγγράφων & φωτογραφιών.
-- Επιτρέπει κατηγοριοποίηση ανά πάροχο (ΔΕΗ, ΕΥΔΑΠ, COSMOTE, ασφαλιστική κ.λπ.)
-- επιπλέον της κατηγορίας. Ασφαλές να τρέξει πολλές φορές.
alter table public.property_documents
  add column if not exists supplier text;

create index if not exists property_documents_supplier_idx
  on public.property_documents (property_id, supplier);


-- ─── 20260703130000_enable_inventory_rls.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- ΑΣΦΑΛΕΙΑ: Ενεργοποίηση Row Level Security στους πίνακες Απογραφής.
-- Ήταν εκτεθειμένοι με το anon key (οποιοσδήποτε μπορούσε να διαβάσει/γράψει).
--
-- Μοντέλο ιδιοκτησίας ανά πίνακα (όπως προκύπτει από τον κώδικα):
--   inventory_items       → property_id  (δείχνει στο user_properties.id)
--   inventory_maintenance → property_id
--   inventory_handovers   → property_id
--   inventory_repairs     → item_id + user_id  (ΔΕΝ έχει property_id)
--
-- Οι συγκρίσεις γίνονται με ::text σε ΚΑΙ ΤΙΣ ΔΥΟ πλευρές γιατί το property_id
-- είναι αποθηκευμένο ως text ενώ το user_properties.id είναι uuid
-- (αλλιώς: ERROR 42883 operator does not exist: uuid = text).
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.inventory_items       enable row level security;
alter table public.inventory_repairs     enable row level security;
alter table public.inventory_handovers   enable row level security;
alter table public.inventory_maintenance enable row level security;

-- inventory_items: ιδιοκτησία μέσω property_id → user_properties
drop policy if exists "own_inventory_items" on public.inventory_items;
create policy "own_inventory_items" on public.inventory_items for all
  using      (exists (select 1 from public.user_properties p where p.id::text = inventory_items.property_id::text       and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id::text = inventory_items.property_id::text       and p.user_id = auth.uid()));

-- inventory_maintenance: ιδιοκτησία μέσω property_id → user_properties
drop policy if exists "own_inventory_maintenance" on public.inventory_maintenance;
create policy "own_inventory_maintenance" on public.inventory_maintenance for all
  using      (exists (select 1 from public.user_properties p where p.id::text = inventory_maintenance.property_id::text and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id::text = inventory_maintenance.property_id::text and p.user_id = auth.uid()));

-- inventory_handovers: ιδιοκτησία μέσω property_id → user_properties
drop policy if exists "own_inventory_handovers" on public.inventory_handovers;
create policy "own_inventory_handovers" on public.inventory_handovers for all
  using      (exists (select 1 from public.user_properties p where p.id::text = inventory_handovers.property_id::text   and p.user_id = auth.uid()))
  with check (exists (select 1 from public.user_properties p where p.id::text = inventory_handovers.property_id::text   and p.user_id = auth.uid()));

-- inventory_repairs: ΔΕΝ έχει property_id. Ιδιοκτησία μέσω του γονέα item_id
-- (→ inventory_items → property → user). Παράλληλα δεχόμαστε και το user_id
-- της ίδιας της γραμμής, ώστε να δουλεύει ακόμη κι αν λείπει το item_id.
drop policy if exists "own_inventory_repairs" on public.inventory_repairs;
create policy "own_inventory_repairs" on public.inventory_repairs for all
  using (
    inventory_repairs.user_id::text = auth.uid()::text
    or exists (
      select 1 from public.inventory_items i
      join public.user_properties p on p.id::text = i.property_id::text
      where i.id::text = inventory_repairs.item_id::text and p.user_id = auth.uid()
    )
  )
  with check (
    inventory_repairs.user_id::text = auth.uid()::text
    or exists (
      select 1 from public.inventory_items i
      join public.user_properties p on p.id::text = i.property_id::text
      where i.id::text = inventory_repairs.item_id::text and p.user_id = auth.uid()
    )
  );


-- ─── 20260704120000_energy_tariffs.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- energy_tariffs — ζωντανά τιμολόγια ρεύματος/αερίου (ενημερώνονται από το
-- Edge Function market-data-updater κάθε 1η του μήνα, ώστε να ΜΗΝ «παλιώνουν»
-- τα hardcoded δεδομένα του app).
--
-- Ροή: το Edge Function (service role) κάνει upsert ανά (tariff_id, valid_month).
-- Το app διαβάζει με το anon key (δημόσια δεδομένα) μέσω του useEnergyTariffs.
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.energy_tariffs (
  id               bigint generated always as identity primary key,
  tariff_id        text        not null,
  provider         text        not null,
  provider_label   text        not null,
  name             text        not null,
  badge            text,
  type             text,
  segment          text        default 'residential',   -- residential | business
  kwh_day          numeric,
  kwh_night        numeric,
  kwh_tier2        numeric,
  tier2_threshold  numeric,
  flat_monthly     numeric,
  flat_annual_kwh  numeric,
  flat_overage_rate numeric,
  fixed            numeric,
  fixed_ebill      numeric,
  vat              integer     default 6,
  contract_months  integer     default 0,
  no_fixed         boolean     default false,
  dynamic          boolean     default false,
  valid_month      text        not null,                -- π.χ. '2026-07'
  source           text,
  updated_at       timestamptz default now(),
  unique (tariff_id, valid_month)
);

-- Γρήγορη ανάκτηση των τιμολογίων του τρέχοντος μήνα
create index if not exists idx_energy_tariffs_month    on public.energy_tariffs (valid_month);
create index if not exists idx_energy_tariffs_provider on public.energy_tariffs (provider);

-- RLS: δημόσια ΑΝΑΓΝΩΣΗ (τα τιμολόγια είναι δημόσια), εγγραφή μόνο service role.
alter table public.energy_tariffs enable row level security;

drop policy if exists "energy_tariffs_public_read" on public.energy_tariffs;
create policy "energy_tariffs_public_read" on public.energy_tariffs
  for select using (true);

-- (Το Edge Function γράφει με το service_role key που παρακάμπτει το RLS,
--  οπότε δεν χρειάζεται insert/update policy για anon/authenticated.)


-- ─── 20260704140000_billing_profiles.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- billing_profiles — στοιχεία χρέωσης/τιμολόγησης ανά χρήστη. Συμπληρώνονται
-- ΠΡΙΝ την ενσωμάτωση Stripe, ώστε όταν προστεθεί η πληρωμή να «κουμπώσει»
-- χωρίς αλλαγή UI. Καμία κάρτα δεν αποθηκεύεται εδώ (αυτό το κάνει ο Stripe).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.billing_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  doc_type      text        default 'receipt',   -- receipt (Απόδειξη) | invoice (Τιμολόγιο)
  full_name     text,
  owner_name    text,                             -- μικρό/εμφανιζόμενο όνομα ιδιοκτήτη (προσφώνηση)
  company_name  text,
  afm           text,                             -- ΑΦΜ
  doy           text,                             -- ΔΟΥ
  profession    text,                             -- Δραστηριότητα/Επάγγελμα
  address       text,
  city          text,
  postal_code   text,
  country       text        default 'GR',
  phone         text,
  plan          text        default 'trial',      -- trial | monthly | annual
  billing_cycle text        default 'monthly',    -- monthly | annual
  -- Πεδία που θα γεμίσει ο Stripe αργότερα (τα κρατάμε έτοιμα, κενά προς το παρόν)
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text default 'trialing', -- trialing | active | past_due | canceled
  updated_at    timestamptz default now()
);

alter table public.billing_profiles enable row level security;
-- Ιδιοκτήτης: εμφανιζόμενο όνομα προσφώνησης (idempotent για υπάρχουσες βάσεις)
alter table public.billing_profiles add column if not exists owner_name text;
-- Τύπος προφίλ: 'individual' (ιδιώτης) | 'professional' (επαγγελματίας διαχειριστής).
-- Οδηγεί το interface (τι βλέπει/μπορεί ο καθένας), ώστε να μη μπερδεύεται.
alter table public.billing_profiles add column if not exists profile_type text default 'individual';

drop policy if exists "own_billing_profile" on public.billing_profiles;
create policy "own_billing_profile" on public.billing_profiles for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─── 20260705120000_tenant_portal.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- Tenant Portal — δημόσια πύλη ενοικιαστή μέσω μοναδικού token (χωρίς login).
-- Ο ενοικιαστής βλέπει ενοίκιο/σύμβαση και στέλνει αίτημα βλάβης. Η πρόσβαση
-- γίνεται ΜΟΝΟ μέσω SECURITY DEFINER συναρτήσεων (RPC) — καμία απευθείας
-- ανάγνωση πινάκων από ανώνυμο χρήστη, μηδενική διαρροή δεδομένων ιδιοκτήτη.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- Σύνδεσμος πύλης ανά ακίνητο (ο ιδιοκτήτης τον δημιουργεί/κοινοποιεί)
create table if not exists public.portal_links (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null default replace(gen_random_uuid()::text, '-', ''),
  property_id text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  active      boolean default true,
  created_at  timestamptz default now(),
  unique (property_id, user_id)
);
alter table public.portal_links enable row level security;
drop policy if exists "own_portal_links" on public.portal_links;
create policy "own_portal_links" on public.portal_links for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Αιτήματα βλάβης/επικοινωνίας από την πύλη
create table if not exists public.maintenance_requests (
  id          uuid primary key default gen_random_uuid(),
  property_id text not null,
  user_id     uuid,
  token       text,
  title       text not null,
  description text,
  contact     text,
  status      text default 'new',   -- new | in_progress | done
  created_at  timestamptz default now()
);
alter table public.maintenance_requests enable row level security;
drop policy if exists "own_maint_req" on public.maintenance_requests;
create policy "own_maint_req" on public.maintenance_requests for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── RPC: ασφαλής ανάγνωση δεδομένων πύλης με το token ──────────────────────
create or replace function public.get_portal_data(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_link record; v_prop record; v_ten record;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return null; end if;
  select name, address, prop_type into v_prop from user_properties where id::text = v_link.property_id::text;
  select monthly_rent, lease_start, lease_end, deposit_amount, full_name into v_ten
    from tenants where property_id = v_link.property_id order by created_at desc limit 1;
  return json_build_object(
    'property', json_build_object('name', v_prop.name, 'address', v_prop.address, 'type', v_prop.prop_type),
    'tenant',   json_build_object('name', v_ten.full_name, 'rent', v_ten.monthly_rent,
      'lease_start', v_ten.lease_start, 'lease_end', v_ten.lease_end, 'deposit', v_ten.deposit_amount)
  );
end; $$;
grant execute on function public.get_portal_data(text) to anon, authenticated;

-- ── RPC: ασφαλής υποβολή αιτήματος βλάβης με το token ──────────────────────
create or replace function public.submit_maintenance_request(p_token text, p_title text, p_description text, p_contact text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  insert into maintenance_requests(property_id, user_id, token, title, description, contact)
    values (v_link.property_id, v_link.user_id, p_token, left(p_title, 200), left(p_description, 2000), left(p_contact, 200));
  return true;
end; $$;
grant execute on function public.submit_maintenance_request(text, text, text, text) to anon, authenticated;

-- ─── 20260708260000_guest_precheckin.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- Guest pre-check-in — δημόσια φόρμα (χωρίς login) όπου ο επισκέπτης συμπληρώνει
-- στοιχεία διαμονής (ταυτότητα, εθνικότητα, άφιξη) πριν φτάσει. Ίδιο μοντέλο
-- ασφαλείας με την πύλη: πρόσβαση ΜΟΝΟ μέσω SECURITY DEFINER RPC με token.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.checkin_links (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null default replace(gen_random_uuid()::text, '-', ''),
  property_id text,
  client_id   uuid references public.clients(id) on delete set null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  active      boolean default true,
  created_at  timestamptz default now(),
  unique (user_id, client_id)
);
alter table public.checkin_links enable row level security;
drop policy if exists own_checkin_links on public.checkin_links;
create policy own_checkin_links on public.checkin_links for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.guest_checkins (
  id           uuid primary key default gen_random_uuid(),
  token        text,
  user_id      uuid,
  client_id    uuid,
  property_id  text,
  full_name    text not null,
  id_number    text,
  nationality  text,
  birth_date   date,
  phone        text,
  email        text,
  arrival_date date,
  guests_count integer,
  accepts_rules boolean default false,
  privacy_consent boolean default false,
  privacy_consent_at timestamptz,
  created_at   timestamptz default now()
);
-- GDPR consent (idempotent για υπάρχουσες εγκαταστάσεις):
alter table public.guest_checkins add column if not exists privacy_consent boolean default false;
alter table public.guest_checkins add column if not exists privacy_consent_at timestamptz;
alter table public.guest_checkins enable row level security;
drop policy if exists own_guest_checkins on public.guest_checkins;
create policy own_guest_checkins on public.guest_checkins for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_checkin_context(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_link record; v_prop record;
begin
  select * into v_link from checkin_links where token = p_token and active = true;
  if not found then return null; end if;
  select name, address into v_prop from user_properties where id::text = v_link.property_id::text;
  return json_build_object('property', json_build_object('name', coalesce(v_prop.name, 'το κατάλυμα'), 'address', v_prop.address));
end; $$;
grant execute on function public.get_checkin_context(text) to anon, authenticated;

drop function if exists public.submit_checkin(text,text,text,text,text,text,text,text,integer,boolean);
create or replace function public.submit_checkin(
  p_token text, p_full_name text, p_id_number text, p_nationality text,
  p_birth_date text, p_phone text, p_email text, p_arrival_date text,
  p_guests integer, p_accepts boolean, p_privacy_consent boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record;
begin
  select * into v_link from checkin_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_full_name), '') = '' then return false; end if;
  -- Χωρίς ρητή συγκατάθεση GDPR δεν αποθηκεύουμε προσωπικά δεδομένα.
  if coalesce(p_privacy_consent, false) = false then return false; end if;
  insert into guest_checkins(token, user_id, client_id, property_id, full_name, id_number, nationality, birth_date, phone, email, arrival_date, guests_count, accepts_rules, privacy_consent, privacy_consent_at)
    values (p_token, v_link.user_id, v_link.client_id, v_link.property_id, left(p_full_name,160), left(p_id_number,60),
            left(p_nationality,60), nullif(p_birth_date,'')::date, left(p_phone,40), left(p_email,160),
            nullif(p_arrival_date,'')::date, p_guests, coalesce(p_accepts,false), true, now());
  return true;
end; $$;
grant execute on function public.submit_checkin(text,text,text,text,text,text,text,text,integer,boolean,boolean) to anon, authenticated;

-- ─── 20260708270000_accountant_portal.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- Accountant portal — read-only πύλη για τον λογιστή του ιδιοκτήτη (χωρίς login).
-- Δίνει εικόνα εσόδων/δαπανών ανά ακίνητο για μια χρονιά, μέσω ασφαλούς RPC με
-- token. Ο λογιστής ΔΕΝ βλέπει πελατολόγιο ή ευαίσθητα στοιχεία τρίτων.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.accountant_links (
  id         uuid primary key default gen_random_uuid(),
  token      text unique not null default replace(gen_random_uuid()::text, '-', ''),
  user_id    uuid not null references auth.users(id) on delete cascade,
  active     boolean default true,
  created_at timestamptz default now(),
  unique (user_id)
);
alter table public.accountant_links enable row level security;
drop policy if exists own_accountant_links on public.accountant_links;
create policy own_accountant_links on public.accountant_links for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_accountant_data(p_token text, p_year integer)
returns json language plpgsql security definer set search_path = public as $$
declare v_link record; v_props json; v_owner text;
begin
  select * into v_link from accountant_links where token = p_token and active = true;
  if not found then return null; end if;
  select coalesce(nullif(trim(owner_name), ''), full_name) into v_owner from billing_profiles where user_id = v_link.user_id;
  select json_agg(sub.row) into v_props from (
    select json_build_object(
      'name', p.name, 'atak', p.atak, 'address', p.address, 'prop_type', p.prop_type,
      'rent', (select t.monthly_rent from tenants t where t.property_id = p.id order by t.created_at desc limit 1),
      'expenses', coalesce((select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date)) from expenses e where e.property_id = p.id and extract(year from e.date) = p_year), '[]'::json),
      'stays', coalesce((select json_agg(json_build_object('check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights, 'total', s.total)) from client_stays s where s.property_id = p.id and extract(year from coalesce(s.check_in, s.check_out)) = p_year), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $$;
grant execute on function public.get_accountant_data(text, integer) to anon, authenticated;


-- ─── 20260705140000_referrals.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- Referral system — κωδικοί πρόσκλησης (growth). Κάθε χρήστης έχει μοναδικό
-- κωδικό· όταν κάποιος εγγράφεται με τον σύνδεσμο, καταγράφεται η παραπομπή.
-- Η ανταμοιβή (π.χ. δωρεάν μήνας) θα εφαρμοστεί με την ενεργοποίηση Stripe.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists "own_referral_code" on public.referral_codes;
create policy "own_referral_code" on public.referral_codes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz default now(),
  unique (referred_user_id)
);
alter table public.referrals enable row level security;
-- Ο νέος χρήστης καταχωρεί ΜΟΝΟ τη δική του παραπομπή.
drop policy if exists "insert_own_referral" on public.referrals;
create policy "insert_own_referral" on public.referrals for insert
  with check (referred_user_id = auth.uid());

-- RPC: πλήθος παραπομπών — μόνο ο κάτοχος του κωδικού το βλέπει.
create or replace function public.get_referral_stats(p_code text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return 0; end if;
  return (select count(*)::int from referrals where code = p_code);
end; $$;
grant execute on function public.get_referral_stats(text) to authenticated;


-- ─── 20260705160000_rent_comparables.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- rent_comparables — συγκριτικά ακίνητα αγοράς (comparables) ανά ακίνητο.
-- Ο ιδιοκτήτης καταχωρεί παρόμοιες αγγελίες (Spitogatos/XE) για να συγκρίνει
-- το ενοίκιό του με τον μέσο όρο της αγοράς (€/τ.μ., απόκλιση %).
-- Χρησιμοποιείται από το RentComparables.tsx (καρτέλα Ενοίκιο/ROI). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_comparables (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  user_id       uuid not null references auth.users(id)       on delete cascade,
  title         text not null,
  area          text        default '',
  sqm           numeric     default 0,
  rent          numeric     default 0,
  rent_per_sqm  numeric     default 0,
  listing_type  text        default 'rent',    -- rent | sale
  asking_price  numeric     default 0,         -- ζητούμενη τιμή πώλησης (€)
  price_per_sqm numeric     default 0,         -- €/τ.μ. πώλησης
  days_on_market integer    default 0,         -- ημέρες στην αγορά
  sold_price    numeric     default 0,         -- τελική τιμή πώλησης (0 = διαθέσιμο)
  distance      text        default '',
  condition     text        default 'good',   -- new | renovated | good | average | needs_work
  source        text        default 'spitogatos',
  url           text        default '',
  notes         text        default '',
  created_at    timestamptz default now()
);

-- Στήλες πώλησης (sale comparables) — ΚΑΙ ως ALTER, ώστε να προστεθούν και σε
-- ΥΠΑΡΧΟΝΤΑ rent_comparables (το create table if not exists από πάνω τις βάζει
-- μόνο σε ΝΕΑ βάση· σε παλιά προσπερνιέται, οπότε ο δείκτης παρακάτω θα έσκαγε).
alter table public.rent_comparables add column if not exists listing_type   text    default 'rent';
alter table public.rent_comparables add column if not exists asking_price   numeric default 0;
alter table public.rent_comparables add column if not exists price_per_sqm  numeric default 0;
alter table public.rent_comparables add column if not exists days_on_market integer default 0;
alter table public.rent_comparables add column if not exists sold_price     numeric default 0;
update public.rent_comparables set listing_type = 'rent' where listing_type is null;

do $$
begin
  alter table public.rent_comparables
    add constraint rent_comparables_listing_type_chk check (listing_type in ('rent','sale'));
exception
  when duplicate_object then null;
  when others then raise notice 'listing_type check skip: %', sqlerrm;
end $$;

create index if not exists rent_comparables_property_idx on public.rent_comparables(property_id);
create index if not exists rent_comparables_type_idx on public.rent_comparables(property_id, listing_type);

alter table public.rent_comparables enable row level security;

drop policy if exists "own_rent_comparables" on public.rent_comparables;
create policy "own_rent_comparables" on public.rent_comparables for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─── 20260705190000_reconciliation_links.sql ───
-- ─────────────────────────────────────────────────────────────────────────
-- Σύνδεσμος συμφωνίας (reconciliation) + realtime.
-- Συνδέει έξοδα & γεγονότα ημερολογίου με τον λογαριασμό-πηγή (bill_id), ώστε
-- η εξόφληση/αναίρεση να είναι ΑΚΡΙΒΗΣ (όχι με ταίριασμα ποσού) και να μπορεί
-- να γίνει undo με ένα κλικ. Ενεργοποιεί επίσης realtime για ζωντανές αλλαγές.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.expenses        add column if not exists bill_id uuid references public.bills(id) on delete set null;
alter table public.calendar_events add column if not exists bill_id uuid references public.bills(id) on delete set null;

-- Σύνδεση δαπάνης με επαφή (επαγγελματία/προμηθευτή) για ακριβές ιστορικό πληρωμών.
alter table public.expenses        add column if not exists contact_id uuid;
create index if not exists idx_expenses_contact on public.expenses(contact_id);

-- Διαμοιρασμός δαπανών & λογαριασμών: ποσοστό ιδιοκτήτη + σημείωση προσώπου
-- (βλ. migration 20260709120000). Ίδιο μοντέλο σε expenses και bills.
alter table public.expenses        add column if not exists share_percent numeric;
alter table public.expenses        add column if not exists share_note    text;
alter table public.bills           add column if not exists paid_by       text default 'owner';
alter table public.bills           add column if not exists share_percent numeric;
alter table public.bills           add column if not exists share_note    text;

create index if not exists expenses_bill_id_idx        on public.expenses(bill_id);
create index if not exists calendar_events_bill_id_idx on public.calendar_events(bill_id);

-- Realtime: κάνε τα βασικά tables μέλη της δημοσίευσης realtime της Supabase,
-- ώστε οι αλλαγές «Πληρωμένο/Εκκρεμές» να φτάνουν ζωντανά στις ανοιχτές καρτέλες.
-- Τυλιγμένο σε exception handlers ώστε να είναι idempotent (αγνοεί διπλότυπα).
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.bills';           exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.expenses';        exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.calendar_events'; exception when others then null; end;
end $$;



-- ─── 20260706120000_core_rls_hardening.sql ───
-- ═════════════════════════════════════════════════════════════════════════════
-- ΚΡΙΣΙΜΗ ΑΣΦΑΛΕΙΑ — Row Level Security σε ΟΛΟΥΣ τους βασικούς πίνακες.
-- Η εφαρμογή μιλάει στη Supabase από τον browser με το ΔΗΜΟΣΙΟ anon key· χωρίς RLS
-- οποιοσδήποτε εγγεγραμμένος διαβάζει/γράφει τα δεδομένα ΟΛΩΝ (οικονομικά, ΑΦΜ/IBAN
-- ενοικιαστών, έγγραφα). Ενεργοποιεί RLS + πολιτική «μόνο ο ιδιοκτήτης» παντού, και
-- κλειδώνει τα αρχεία (Storage) στον φάκελο του κάθε χρήστη. Idempotent & ασφαλές.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  own_tables text[] := array[
    'user_properties','properties','property_data','expenses','bills','bills_history',
    'tenants','rent_payments','rent_config','calendar_events',
    'property_documents','bills_settings','property_settings','notification_preferences',
    'loans','contacts','maintenance_tasks','tenant_comm_log','bills_electricity'
  ];
begin
  foreach t in array own_tables loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'own_'||t, t);
      execute format(
        'create policy %I on public.%I for all '
        || 'using (user_id::text = auth.uid()::text) '
        || 'with check (user_id::text = auth.uid()::text)',
        'own_'||t, t);
    exception when others then
      raise notice 'RLS skip %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- checklist_items: ιδιοκτησία μέσω property_id → user_properties
do $$
begin
  alter table public.checklist_items enable row level security;
  drop policy if exists "own_checklist_items" on public.checklist_items;
  create policy "own_checklist_items" on public.checklist_items for all
    using      (exists (select 1 from public.user_properties p where p.id::text = checklist_items.property_id::text and p.user_id = auth.uid()))
    with check (exists (select 1 from public.user_properties p where p.id::text = checklist_items.property_id::text and p.user_id = auth.uid()));
exception when others then
  raise notice 'RLS skip checklist_items: %', sqlerrm;
end $$;

-- Αρχεία (Storage): ιδιωτικά buckets + πρόσβαση μόνο στον δικό σου φάκελο ({uid}/...)
do $$
begin
  update storage.buckets set public = false where id in ('property-files','lease-documents');
exception when others then raise notice 'bucket privacy skip: %', sqlerrm; end $$;

do $$
begin
  drop policy if exists "own_files_all" on storage.objects;
  create policy "own_files_all" on storage.objects for all
    using      ( bucket_id in ('property-files','lease-documents') and (storage.foldername(name))[1] = auth.uid()::text )
    with check ( bucket_id in ('property-files','lease-documents') and (storage.foldername(name))[1] = auth.uid()::text );
exception when others then
  raise notice 'storage policy skip: %', sqlerrm;
end $$;


-- ─── 20260707100000_property_postal_code.sql ───
-- Ταχυδρομικός Κώδικας (ΤΚ) ανά ακίνητο (εμφανίζεται στη διεύθυνση). Idempotent.
alter table public.user_properties add column if not exists postal_code text;


-- ─── 20260707120000_property_full_capture.sql ───
-- Πλήρης καταγραφή στοιχείων ακινήτου (περιλαμβάνει το ΑΤΑΚ που χρειάζεται το Ε2).
-- Προσθέτει όλες τις στήλες που διαβάζει το dashboard ώστε τα KPI να μη δείχνουν 0 €.
-- Idempotent· το RLS του user_properties ισχύει ήδη.
alter table public.user_properties add column if not exists value numeric;
alter table public.user_properties add column if not exists target_rent numeric;
alter table public.user_properties add column if not exists sqm numeric;
alter table public.user_properties add column if not exists ownership numeric;
alter table public.user_properties add column if not exists atak text;
alter table public.user_properties add column if not exists obj_value numeric;
alter table public.user_properties add column if not exists enfia numeric;
alter table public.user_properties add column if not exists purchase_price numeric;
alter table public.user_properties add column if not exists purchase_date date;
alter table public.user_properties add column if not exists year_built integer;
alter table public.user_properties add column if not exists floor text;
-- Αν το floor προϋπήρχε ως integer (παλιότερη έκδοση), μετέτρεψέ το σε text
-- ώστε να δέχεται ονομασίες ορόφων (Ισόγειο, Υπόγειο, Δώμα κ.λπ.). Idempotent.
do $$ begin alter table public.user_properties alter column floor type text using floor::text; exception when others then null; end $$;
alter table public.user_properties add column if not exists pea_class text;
alter table public.user_properties add column if not exists heating text;
alter table public.user_properties add column if not exists parking_spaces integer;
alter table public.user_properties add column if not exists storage_sqm numeric;
alter table public.user_properties add column if not exists bedrooms integer;
alter table public.user_properties add column if not exists rental_mode text;
alter table public.user_properties add column if not exists insurance_company text;
alter table public.user_properties add column if not exists insurance_amount numeric;
alter table public.user_properties add column if not exists insurance_expiry date;
alter table public.user_properties add column if not exists notes text;


-- ─── 20260707180000_report_branding.sql ───
-- Λευκή επωνυμία (white-label) στις εκτυπώσιμες αναφορές — πλάνο «Επαγγελματίας».
-- Ένα row ανά χρήστη, RLS «μόνο ο ιδιοκτήτης». Idempotent.
create table if not exists public.report_branding (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  enabled       boolean     default true,
  company_name  text,
  logo_url      text,
  accent_color  text        default '#1a73e8',
  phone         text,
  email         text,
  updated_at    timestamptz default now(),
  constraint report_branding_accent_hex
    check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$')
);

alter table public.report_branding enable row level security;

drop policy if exists "own_report_branding" on public.report_branding;
create policy "own_report_branding" on public.report_branding for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─── 20260707200000_clients_crm.sql ───
-- Πελατολόγιο (CRM): ιδιοκτήτες/υποψήφιοι/πελάτες + pipeline ευκαιριών, σύνδεση
-- ακινήτου → πελάτη (user_properties.client_id). RLS «μόνο ο ιδιοκτήτης». Idempotent.
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null default 'owner',   -- owner | lead | client
  full_name    text not null,
  afm          text,
  phone        text,
  email        text,
  notes        text,
  stage        text not null default 'lead',    -- lead | viewing | offer | closed
  deal_value   numeric,
  next_action  text,
  next_date    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists clients_user_idx on public.clients(user_id);

do $$
begin
  alter table public.clients add constraint clients_type_chk
    check (type in ('owner','lead','client'));
exception when duplicate_object then null;
when others then raise notice 'clients_type_chk skip: %', sqlerrm;
end $$;

do $$
begin
  alter table public.clients add constraint clients_stage_chk
    check (stage in ('lead','viewing','offer','closed'));
exception when duplicate_object then null;
when others then raise notice 'clients_stage_chk skip: %', sqlerrm;
end $$;

alter table public.clients enable row level security;
drop policy if exists "own_clients" on public.clients;
create policy "own_clients" on public.clients for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
begin
  alter table public.user_properties
    add column if not exists client_id uuid references public.clients(id) on delete set null;
exception when others then raise notice 'user_properties.client_id skip: %', sqlerrm;
end $$;

create index if not exists user_properties_client_idx on public.user_properties(client_id);

do $$
begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null;
when others then raise notice 'realtime clients skip: %', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Loan market reference data (market_rates / bank_rates / loan_programs + view).
-- Reference tables (ίδια για όλους): public read (RLS), εγγραφή μόνο service role.
-- Ενδεικτικές τιμές με ημερομηνία επιβεβαίωσης. Idempotent.
-- Μόνο reference/seed δεδομένα (χωρίς δεδομένα χρήστη) — τα ξαναφτιάχνουμε καθαρά
-- ώστε το σχήμα να είναι ντετερμινιστικό ακόμη κι αν προϋπήρχε διαφορετική έκδοση.
-- ═══════════════════════════════════════════════════════════════════════════
drop view  if exists public.active_loan_programs;
drop table if exists public.loan_programs cascade;
drop table if exists public.bank_rates    cascade;
drop table if exists public.market_rates  cascade;
create table if not exists public.market_rates (
  id bigint generated always as identity primary key,
  euribor_1m numeric, euribor_3m numeric, euribor_6m numeric, euribor_12m numeric,
  ecb_rate numeric, ecb_dfl numeric, bog_housing_new numeric, bog_housing_stock numeric,
  source_euribor text, source_bog text, rate_changed boolean default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.bank_rates (
  bank_id text primary key, bank_name text not null, color text,
  fixed_3yr text, fixed_5yr text, fixed_10yr text, fixed_15yr text, fixed_20yr text,
  variable_spread_min numeric, variable_spread_max numeric, fixed_min numeric,
  max_ltv integer, max_years integer, max_amount integer, min_amount integer,
  green_discount numeric, spiti_mou boolean default false,
  features text[] default '{}', programs text[] default '{}',
  fees text, note text, url text, source_url text, verified_at date, is_active boolean default true
);
create table if not exists public.loan_programs (
  program_id text primary key, name text not null, icon text, color text, status text default 'active',
  type_label text, description text, how_it_works text, extra_info text, savings_example text,
  max_amount integer, max_prop_value integer, max_ltv integer, max_sqm integer,
  age_min integer, age_max integer, duration_label text, deadline date, deadline_label text,
  deadline_urgent boolean default false, total_budget text, criteria text[] default '{}',
  participating_banks text[] default '{}', source_url text, verified_at date
);
create or replace view public.active_loan_programs as
  select lp.*, lp.program_id as id from public.loan_programs lp
  where coalesce(lp.status,'active') <> 'ended'
    and (lp.deadline is null or lp.deadline >= current_date);
alter table public.market_rates  enable row level security;
alter table public.bank_rates    enable row level security;
alter table public.loan_programs enable row level security;
drop policy if exists market_rates_read on public.market_rates;
drop policy if exists bank_rates_read on public.bank_rates;
drop policy if exists loan_programs_read on public.loan_programs;
create policy market_rates_read on public.market_rates for select using (true);
create policy bank_rates_read on public.bank_rates for select using (true);
create policy loan_programs_read on public.loan_programs for select using (true);
grant select on public.market_rates, public.bank_rates, public.loan_programs, public.active_loan_programs to anon, authenticated;

-- Διαχειριστές εφαρμογής + δικαίωμα εγγραφής στο bank_rates (γρήγορη διόρθωση από την εφαρμογή).
create table if not exists public.app_admins (email text primary key, created_at timestamptz default now());
alter table public.app_admins enable row level security;
drop policy if exists app_admins_self on public.app_admins;
create policy app_admins_self on public.app_admins for select to authenticated using (email = (auth.jwt() ->> 'email'));
grant select on public.app_admins to authenticated;
drop policy if exists bank_rates_admin_write on public.bank_rates;
create policy bank_rates_admin_write on public.bank_rates for all to authenticated
  using (exists (select 1 from public.app_admins a where a.email = (auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.app_admins a where a.email = (auth.jwt() ->> 'email')));
grant insert, update, delete on public.bank_rates to authenticated;

insert into public.market_rates
  (euribor_1m, euribor_3m, euribor_6m, euribor_12m, ecb_rate, ecb_dfl, bog_housing_new, bog_housing_stock, source_euribor, source_bog, rate_changed, updated_at)
select 2.28, 2.324, 2.34, 2.40, 2.15, 2.00, 3.10, 3.50, 'euribor-rates.eu', 'Τράπεζα Ελλάδος', false, timestamptz '2026-06-30 00:00:00+00'
where not exists (select 1 from public.market_rates);
insert into public.bank_rates (bank_id, bank_name, color, fixed_3yr, fixed_5yr, fixed_10yr, fixed_15yr, fixed_20yr, variable_spread_min, variable_spread_max, fixed_min, max_ltv, max_years, max_amount, min_amount, green_discount, spiti_mou, features, programs, fees, note, url, source_url, verified_at, is_active) values
 ('eurobank','Eurobank','#1a73e8','2.50-2.90','3.40-3.50','3.80-3.90','4.10-4.20','4.10-4.20',0.60,2.45,2.50,90,35,500000,20000,0.20,true,array['Spread από 0,60%','Χωρίς έξοδα έγκρισης','Νομικός και τεχνικός έλεγχος','Προέγκριση σε 48 ώρες','Υπογραφή μέσω gov.gr'],array['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],'Χωρίς έξοδα εξέτασης','Από τα χαμηλότερα spread αγοράς','https://www.eurobank.gr/el/retail/proionta-upiresies/proionta/daneia/stegastika','https://vresdaneio.gr',date '2026-07-08',true),
 ('ethniki','Εθνική Τράπεζα','#1a73e8','2.90-3.20','3.50','3.70','4.20','4.20',1.60,2.85,2.80,90,35,500000,30000,0.25,true,array['Έως 90% της αξίας','Σταθερό 3 έως 30 έτη','Χωρίς έξοδα αίτησης','Ενεργειακή έκπτωση -0,25%','Τρίτεκνοι: +50% επιδότηση'],array['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],'Χωρίς έξοδα εξέτασης','Υψηλό ποσοστό χρηματοδότησης','https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia','https://vresdaneio.gr',date '2026-07-08',true),
 ('alpha','Alpha Bank','#1a73e8','2.80','3.40','3.80','4.10','4.20',1.80,2.20,2.50,90,35,300000,25000,0.10,true,array['2,50% για νέους (3ετία)','Έως 90% της αξίας','Δυνατότητα περιόδου χάριτος','Χωρίς έξοδα','Πρόγραμμα ανακαίνισης'],array['Σπίτι μου ΙΙ','Alpha Πρώτη Κατοικία','Ανακαίνιση'],'Χωρίς έξοδα εξέτασης','Ειδικό πρόγραμμα για νέους','https://www.alpha.gr/el/idiotika/daneia/stegastika-daneia','https://vresdaneio.gr',date '2026-07-08',true),
 ('piraeus','Τράπεζα Πειραιώς','#1a73e8','2.40-4.70','2.40-4.70','2.40-4.70','2.40-4.70','2.40-4.70',1.40,2.45,2.40,90,35,500000,20000,0.15,true,array['Πράσινα spread από 1,25%','Ψηφιακή διαδικασία','Online εκτίμηση','Ταχεία εξυπηρέτηση'],array['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],'Έξοδα φακέλου από 300€','Καλύτερο για πράσινα δάνεια','https://www.piraeusbank.gr/el/idiwtes/proionta-upiresies/stegastika-daneia','https://vresdaneio.gr',date '2026-07-08',true),
 ('optima','Optima Bank','#1a73e8','3.90','3.50-4.00','3.40-3.90','4.30-4.80','4.30-4.80',2.00,3.00,2.90,75,30,300000,20000,0.10,false,array['Γρήγορη έγκριση','Premium εξυπηρέτηση','Σταθερό και κυμαινόμενο','Αναχρηματοδότηση'],array['Ανακαίνιση','Εξοικονομώ'],'Τιμολόγιο κατά περίπτωση','Premium εξυπηρέτηση','https://www.optimabank.gr/individuals/daneia/stegastiko-daneio/','https://vresdaneio.gr',date '2026-07-08',true),
 ('credia','CrediaBank','#1a73e8','3.00-3.30','3.60-3.90','4.00-4.20','4.30-4.60','4.50-4.70',1.60,2.70,2.60,80,30,250000,15000,0.10,true,array['Ευέλικτοι όροι','Μικρά ποσά','Γρήγορη εξέταση','Σπίτι μου ΙΙ'],array['Σπίτι μου ΙΙ','Εξοικονομώ'],'Κατά περίπτωση','Ευελιξία και μικρά ποσά','https://www.crediabank.gr','https://vresdaneio.gr',date '2026-07-08',true),
 ('attica','Attica Bank','#1a73e8','3.20-3.60','3.70-4.00','4.00-4.30','4.40-4.70','4.50-4.80',1.80,2.90,3.00,75,30,200000,15000,0.10,false,array['Ευέλικτοι όροι','Γρήγορη εξέταση'],array['Εξοικονομώ'],'Κατά περίπτωση','Ευέλικτοι όροι','https://www.atticabank.gr','https://vresdaneio.gr',date '2026-07-08',true)
on conflict (bank_id) do update set bank_name=excluded.bank_name, color=excluded.color, fixed_3yr=excluded.fixed_3yr, fixed_5yr=excluded.fixed_5yr, fixed_10yr=excluded.fixed_10yr, fixed_15yr=excluded.fixed_15yr, fixed_20yr=excluded.fixed_20yr, variable_spread_min=excluded.variable_spread_min, variable_spread_max=excluded.variable_spread_max, fixed_min=excluded.fixed_min, max_ltv=excluded.max_ltv, max_years=excluded.max_years, max_amount=excluded.max_amount, min_amount=excluded.min_amount, green_discount=excluded.green_discount, spiti_mou=excluded.spiti_mou, features=excluded.features, programs=excluded.programs, fees=excluded.fees, note=excluded.note, url=excluded.url, source_url=excluded.source_url, verified_at=excluded.verified_at, is_active=excluded.is_active;
insert into public.loan_programs (program_id, name, icon, color, status, type_label, description, how_it_works, extra_info, savings_example, max_amount, max_prop_value, max_ltv, max_sqm, age_min, age_max, duration_label, deadline, deadline_label, deadline_urgent, total_budget, criteria, participating_banks, source_url, verified_at) values
 ('spiti_mou_2','Σπίτι μου ΙΙ','home','#1a73e8','active','Κρατικό, άτοκο 50% (+ επιδότηση επιτοκίου για πολύτεκνους)','Χρηματοδότηση έως 190.000€ για πρώτη και κύρια κατοικία. Το 50% του δανείου είναι άτοκο (Ταμείο Ανάκαμψης), το υπόλοιπο 50% με επιτόκιο τράπεζας.','50% του δανείου άτοκο (Ταμείο Ανάκαμψης), 50% έντοκο (τράπεζα) — για ΟΛΟΥΣ. Τρίτεκνοι/πολύτεκνοι: επιπλέον επιδότηση 50% του επιτοκίου στο τραπεζικό μισό (το άτοκο κεφάλαιο παραμένει 50%).','Προθεσμία αίτησης 31/05/2026, σύναψη σύμβασης έως 31/08/2026. Τρίτεκνοι/πολύτεκνοι: επιδότηση 50% του επιτοκίου στο τραπεζικό μισό — δεν γίνεται άτοκο το 75% του κεφαλαίου.','Δάνειο 150.000€ × 25 έτη με 50% άτοκο: εξοικονόμηση δεκάδων χιλιάδων € σε τόκους.',190000,250000,90,150,25,50,'3 έως 30 έτη (χωρίς περίοδο χάριτος)',date '2026-08-31','Έως 31/08/2026 (αίτηση έως 31/05/2026)',true,'2 δισ. ευρώ (50% Ταμείο Ανάκαμψης + 50% τράπεζες)',array['Ηλικία 25-50 ετών','Πρώτη και κύρια κατοικία','Εισόδημα ενδεικτικά: έγγαμοι 35.000€ +5.000€/παιδί, μονογονεϊκές 39.000€ (επιβεβαίωσε στην πύλη)','Αξία συμβολαίου ≤ 250.000€','Έως 150 τετραγωνικά','Έτος κατασκευής έως και 2007 (για ΑμεΑ ≥67% έως και 31/12/2020)'],array['Εθνική','Alpha','Eurobank','Πειραιώς','Optima','CrediaBank'],'https://stegasi.gov.gr/programs/spiti-mou-ii/',date '2026-07-08'),
 ('anavathmizo','Αναβαθμίζω το Σπίτι μου','bolt','#1a73e8','active','Κρατικό, δάνειο ενεργειακής αναβάθμισης','Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο από το Ταμείο Ανάκαμψης για ενεργειακές παρεμβάσεις.','Δάνειο για ενεργειακές παρεμβάσεις με επιδοτούμενο επιτόκιο.','Αυξημένη επιδότηση για ΑμεΑ, τρίτεκνους, πολύτεκνους.','Εξοικονόμηση ενέργειας συν χαμηλό επιτόκιο.',25000,null,null,null,18,null,'3 έως 15 έτη',date '2026-08-31','Έως 31/08/2026',true,'80 εκ. ευρώ',array['ΠΕΑ πριν και μετά','Αναβάθμιση ≥ 3 ενεργειακές κατηγορίες','Εξοικονόμηση > 30%'],array['Εθνική','Alpha','Eurobank','Πειραιώς','CrediaBank'],'https://greece20.gov.gr/home-loans/',date '2026-07-08'),
 ('exoikonomo_2025','Εξοικονομώ 2025','leaf','#1a73e8','ended','Επιδότηση ενεργειακής αναβάθμισης','Η αρχική προθεσμία (30/06/2026) παρήλθε, εκκρεμεί ανακοίνωση παράτασης.','Επιδότηση κουφωμάτων, μόνωσης, θέρμανσης, φωτοβολταϊκών.','Επιβεβαίωσε στο exoikonomo2025.gov.gr.','Μείωση λογαριασμών συν επιδότηση.',null,null,null,null,18,null,'Εφάπαξ',date '2026-06-30','Έληξε 30/06/2026, εκκρεμεί παράταση',false,'Ταμείο Ανάκαμψης',array['Εξοικονόμηση > 30%','Αναβάθμιση ≥ 3 κατηγορίες','ΠΕΑ πριν και μετά'],array['Εθνική','Alpha','Eurobank','Πειραιώς'],'https://exoikonomo2025.gov.gr/',date '2026-07-08'),
 ('anakainizo_noikazo','Ανακαινίζω και Νοικιάζω','key','#1a73e8','active','Επιδότηση ανακαίνισης και εγγυημένο ενοίκιο','40% επιδότηση ανακαίνισης συν εγγυημένο ενοίκιο για 5 έτη μέσω ΟΠΕΚΑ.','40% επιδότηση ανακαίνισης και ενοίκιο αγοράς από ΟΠΕΚΑ για 5 έτη.','Εγγυημένο εισόδημα, ιδανικό για επενδυτές.','Κενό ακίνητο: ανακαίνιση συν εγγυημένο εισόδημα.',15000,null,null,null,18,null,'5 έτη',null,'Τρέχον, έλεγξε στον φορέα',false,'Τρέχον',array['Κενό ακίνητο ≥ 3 έτη','Δαπάνη 5.000-40.000€','Μίσθωση μέσω ΟΠΕΚΑ','Δέσμευση 5ετίας'],array['Εθνική','Πειραιώς','Eurobank'],'https://www.opeka.gr',date '2026-07-08')
on conflict (program_id) do update set name=excluded.name, color=excluded.color, status=excluded.status, type_label=excluded.type_label, description=excluded.description, how_it_works=excluded.how_it_works, extra_info=excluded.extra_info, savings_example=excluded.savings_example, max_amount=excluded.max_amount, max_prop_value=excluded.max_prop_value, max_ltv=excluded.max_ltv, max_sqm=excluded.max_sqm, age_min=excluded.age_min, age_max=excluded.age_max, duration_label=excluded.duration_label, deadline=excluded.deadline, deadline_label=excluded.deadline_label, deadline_urgent=excluded.deadline_urgent, total_budget=excluded.total_budget, criteria=excluded.criteria, participating_banks=excluded.participating_banks, source_url=excluded.source_url, verified_at=excluded.verified_at;

-- ═══════════════════════════════════════════════════════════════════════════
-- Πελατολόγιο premium: clients extra columns + client_stays + client_notes.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.clients add column if not exists rating integer;
alter table public.clients add column if not exists tags text[] default '{}';
alter table public.clients add column if not exists do_not_rent boolean default false;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists id_number text;
alter table public.clients add column if not exists nationality text;
alter table public.clients add column if not exists budget numeric;
alter table public.clients add column if not exists needs text;
alter table public.clients add column if not exists source text;
alter table public.clients add column if not exists vip boolean default false;
create table if not exists public.client_stays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  property_id text, check_in date, check_out date, nights integer, guests integer,
  nightly_rate numeric, total numeric, channel text, rating integer,
  damages boolean default false, damage_cost numeric, damage_note text, notes text,
  created_at timestamptz not null default now()
);
create index if not exists client_stays_user_idx on public.client_stays(user_id);
create index if not exists client_stays_client_idx on public.client_stays(client_id);
alter table public.client_stays enable row level security;
drop policy if exists own_client_stays on public.client_stays;
create policy own_client_stays on public.client_stays for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text default 'note', body text not null, created_at timestamptz not null default now()
);
create index if not exists client_notes_client_idx on public.client_notes(client_id);
alter table public.client_notes enable row level security;
drop policy if exists own_client_notes on public.client_notes;
create policy own_client_notes on public.client_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.client_stays; exception when duplicate_object then null; when others then raise notice 'rt client_stays skip: %', sqlerrm; end $$;
do $$ begin alter publication supabase_realtime add table public.client_notes; exception when duplicate_object then null; when others then raise notice 'rt client_notes skip: %', sqlerrm; end $$;

-- ── Έγγραφα ανά πελάτη (metadata· αρχεία στο υπάρχον bucket property-files) ──
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, file_path text not null, mime text, size bigint,
  kind text default 'other', created_at timestamptz not null default now()
);
create index if not exists client_documents_client_idx on public.client_documents(client_id);
alter table public.client_documents enable row level security;
drop policy if exists own_client_documents on public.client_documents;
create policy own_client_documents on public.client_documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.client_documents; exception when duplicate_object then null; when others then raise notice 'rt client_documents skip: %', sqlerrm; end $$;

-- ── Αυτόματος συγχρονισμός iCal (Airbnb/Booking) — αποθηκευμένοι σύνδεσμοι ──
create table if not exists public.ical_feeds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  property_id     text not null,
  channel         text not null default 'airbnb',   -- airbnb | booking | other
  url             text not null,
  include_blocked boolean default false,
  active          boolean default true,
  last_synced_at  timestamptz,
  last_status     text,
  created_at      timestamptz not null default now(),
  unique (user_id, property_id, url)
);
create index if not exists ical_feeds_user_idx on public.ical_feeds(user_id);
alter table public.ical_feeds enable row level security;
drop policy if exists own_ical_feeds on public.ical_feeds;
create policy own_ical_feeds on public.ical_feeds for all using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.ical_feeds; exception when duplicate_object then null; when others then raise notice 'rt ical_feeds skip: %', sqlerrm; end $$;

-- ── Ρυθμίσεις δυναμικής τιμολόγησης ανά ακίνητο (βάση, όρια, ΣΚ, min stay) ──
create table if not exists public.pricing_settings (
  user_id         uuid not null references auth.users(id) on delete cascade,
  property_id     text not null,
  base            numeric,
  min_price       numeric,
  max_price       numeric,
  weekend_premium numeric default 0.18,
  min_stay        integer default 1,
  updated_at      timestamptz not null default now(),
  primary key (user_id, property_id)
);
alter table public.pricing_settings enable row level security;
drop policy if exists own_pricing_settings on public.pricing_settings;
create policy own_pricing_settings on public.pricing_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.pricing_settings; exception when duplicate_object then null; when others then raise notice 'rt pricing_settings skip: %', sqlerrm; end $$;

-- ── Πρόοδος πρώτης χρήσης (onboarding) ανά χρήστη ──────────────────────────
create table if not exists public.onboarding_progress (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  welcomed       boolean default false,
  first_property boolean default false,
  demo_seen      boolean default false,
  completed      boolean default false,
  updated_at     timestamptz not null default now()
);
alter table public.onboarding_progress enable row level security;
drop policy if exists own_onboarding_progress on public.onboarding_progress;
create policy own_onboarding_progress on public.onboarding_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Οριστική διαγραφή λογαριασμού (self-service) ──────────────────────────
-- Βλ. migration 20260709140000_delete_my_account.sql
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t   record;
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id = $1', t.table_name) using uid;
  end loop;
  begin
    delete from storage.objects where owner = uid;
  exception when others then null;
  end;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ── Ενοικιαστές: rent ledger + αντιστοίχιση αποδείξεων (βλ. 20260709160000) ──
alter table public.rent_payments add column if not exists method         text;
alter table public.rent_payments add column if not exists receipt_url    text;
alter table public.rent_payments add column if not exists receipt_doc_id uuid;
alter table public.rent_payments add column if not exists due_date       date;
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='rent_payments_tenant_period_uidx') then
    create unique index rent_payments_tenant_period_uidx on public.rent_payments (tenant_id, period_year, period_month);
  end if;
exception when others then null;
end $$;

-- ── Ενοικιαστές: τύπος μίσθωσης κατοικία/επαγγελματική (βλ. 20260709180000) ──
alter table public.tenants add column if not exists lease_category text;  -- 'residential' | 'commercial'

-- ── Ενοικιαστές: μητρώο/ιστορικό + φθορές ανά ενοικιαστή (βλ. 20260709200000) ──
alter table public.tenants add column if not exists status         text default 'active';
alter table public.tenants add column if not exists rent_due_day   integer;
alter table public.tenants add column if not exists deposit_method  text;
alter table public.tenants add column if not exists deposit_paid_on date;
alter table public.tenants add column if not exists move_out_date   date;
create table if not exists public.tenant_damages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  property_id uuid, user_id uuid not null,
  occurred_on date, description text not null, cost numeric,
  charged_to_tenant boolean default false, repaired boolean default false,
  repaired_on date, notes text, created_at timestamptz not null default now()
);
create index if not exists tenant_damages_tenant_idx   on public.tenant_damages (tenant_id);
create index if not exists tenant_damages_property_idx on public.tenant_damages (property_id);
alter table public.tenant_damages enable row level security;
drop policy if exists own_tenant_damages on public.tenant_damages;
create policy own_tenant_damages on public.tenant_damages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Ενοικιαστές: ποσοστό επιβάρυνσης ιδιοκτήτη ανά συντήρηση (βλ. 20260709220000) ──
alter table public.tenants add column if not exists ac_service_owner_pct           numeric;
alter table public.tenants add column if not exists solar_service_owner_pct        numeric;
alter table public.tenants add column if not exists heat_pump_service_owner_pct    numeric;
alter table public.tenants add column if not exists solar_panels_service_owner_pct numeric;
alter table public.tenants add column if not exists pest_control_owner_pct         numeric;

-- ── Ενοικιαστές: υπηρεσίες→καθολικό, επίπλωση, πύλη πληρωμής/βλάβης (20260709240000) ──
alter table public.tenants add column if not exists furnishing text;      -- 'empty' | 'furnished' | 'turnkey'
-- IBAN όπου πληρώνεται το ενοίκιο (για αίτημα πληρωμής / QR).
alter table public.tenants add column if not exists rent_iban  text;

-- Ανάλυση δόσης: βασικό ενοίκιο + χρέωση υπηρεσιών (= amount).
alter table public.rent_payments add column if not exists base_rent          numeric;
alter table public.rent_payments add column if not exists services_charge    numeric;
-- Δήλωση πληρωμής από τον ενοικιαστή μέσω πύλης (ο ιδιοκτήτης επιβεβαιώνει).
alter table public.rent_payments add column if not exists tenant_declared    boolean default false;
alter table public.rent_payments add column if not exists tenant_declared_at timestamptz;
alter table public.rent_payments add column if not exists tenant_note        text;

-- Αιτήματα βλάβης: σύνδεση με ενοικιαστή, κατηγορία, επίλυση.
alter table public.maintenance_requests add column if not exists tenant_id   uuid;
alter table public.maintenance_requests add column if not exists category    text;
alter table public.maintenance_requests add column if not exists resolved_at timestamptz;

-- Αρχείο ειδοποιήσεων (χρησιμοποιείται από τις edge functions send-reminders &
-- market-data-updater — πολυμορφικό, όλες οι στήλες nullable). Idempotent.
create table if not exists public.notification_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  event_id      uuid,           -- id γεγονότος ημερολογίου ή δόσης ενοικίου (rent_overdue)
  reminder_type text,           -- 7days | 3days | 1day | today | overdue | rent_overdue
  type          text,           -- για ειδοποιήσεις αγοράς (market-data-updater)
  title         text,
  body          text,
  data          jsonb,
  created_at    timestamptz default now()
);
alter table public.notification_log add column if not exists user_id       uuid;
alter table public.notification_log add column if not exists event_id      uuid;
alter table public.notification_log add column if not exists reminder_type text;
alter table public.notification_log add column if not exists created_at    timestamptz default now();
create index if not exists idx_notif_log_dedup on public.notification_log(reminder_type, event_id);
alter table public.notification_log enable row level security;
drop policy if exists "own_notif_log" on public.notification_log;
create policy "own_notif_log" on public.notification_log for select
  using (user_id = auth.uid());

-- ── RPC: δεδομένα πύλης (v2) — προσθέτει οφειλή ενοικίου + IBAN πληρωμής ──────
create or replace function public.get_portal_data(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return null; end if;
  select name, address, prop_type into v_prop from user_properties where id::text = v_link.property_id::text;
  select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
    from tenants where property_id = v_link.property_id order by created_at desc limit 1;

  select coalesce(json_agg(json_build_object(
           'id', rp.id, 'year', rp.period_year, 'month', rp.period_month,
           'amount', rp.amount, 'due_date', rp.due_date, 'declared', rp.tenant_declared
         ) order by rp.period_year, rp.period_month), '[]'::json),
         coalesce(sum(rp.amount), 0)
    into v_due, v_total
    from rent_payments rp
    where rp.tenant_id = v_ten.id and rp.paid = false;

  return json_build_object(
    'property', json_build_object('name', v_prop.name, 'address', v_prop.address, 'type', v_prop.prop_type),
    'tenant',   json_build_object('name', v_ten.full_name, 'rent', v_ten.monthly_rent,
      'lease_start', v_ten.lease_start, 'lease_end', v_ten.lease_end, 'deposit', v_ten.deposit_amount,
      'rent_iban', v_ten.rent_iban),
    'due',      v_due,
    'total_due', v_total
  );
end; $$;
grant execute on function public.get_portal_data(text) to anon, authenticated;

-- ── RPC: δήλωση πληρωμής δόσης από τον ενοικιαστή (ο ιδιοκτήτης επιβεβαιώνει) ──
create or replace function public.declare_rent_payment(p_token text, p_payment_id uuid, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record; v_ok int;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return false; end if;
  -- Μόνο δόσεις που ανήκουν στο ακίνητο της πύλης, και ΔΕΝ σημειώνεται «πληρωμένο»
  -- (αυτό το κάνει ο ιδιοκτήτης) — μόνο «δηλώθηκε από τον ενοικιαστή».
  update rent_payments
    set tenant_declared = true, tenant_declared_at = now(), tenant_note = left(coalesce(p_note,''), 500)
    where id = p_payment_id and property_id::text = v_link.property_id::text and paid = false;
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end; $$;
grant execute on function public.declare_rent_payment(text, uuid, text) to anon, authenticated;

-- ── RPC: αίτημα βλάβης — ίδια υπογραφή (4 ορίσματα), εμπλουτισμένο σώμα ώστε
--    να συνδέει αυτόματα το αίτημα με τον τρέχοντα ενοικιαστή (tenant_id). ──────
create or replace function public.submit_maintenance_request(p_token text, p_title text, p_description text, p_contact text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record; v_ten_id uuid;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  select id into v_ten_id from tenants where property_id = v_link.property_id order by created_at desc limit 1;
  insert into maintenance_requests(property_id, user_id, token, tenant_id, title, description, contact)
    values (v_link.property_id, v_link.user_id, p_token, v_ten_id, left(p_title, 200), left(p_description, 2000), left(p_contact, 200));
  return true;
end; $$;
grant execute on function public.submit_maintenance_request(text, text, text, text) to anon, authenticated;

-- ═══ Πύλη: PIN, σύνδεσμος πληρωμής, φωτογραφίες/ανάθεση βλαβών, dunning ρυθμίσεις ══
create extension if not exists pgcrypto;

alter table public.portal_links add column if not exists pin_hash     text;
alter table public.portal_links add column if not exists payment_link text;

alter table public.maintenance_requests add column if not exists photos           jsonb default '[]'::jsonb;
alter table public.maintenance_requests add column if not exists assignee_name    text;
alter table public.maintenance_requests add column if not exists assignee_contact text;

create table if not exists public.notification_preferences (
  user_id          uuid primary key,
  email_enabled    boolean default false,
  reminder_7days   boolean default true,
  reminder_3days   boolean default true,
  reminder_1day    boolean default true,
  reminder_today   boolean default true,
  reminder_overdue boolean default true,
  reminder_email   text,
  updated_at       timestamptz default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists "own_notif_prefs" on public.notification_preferences;
create policy "own_notif_prefs" on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.notification_preferences add column if not exists dunning_enabled    boolean default true;
alter table public.notification_preferences add column if not exists dunning_every_days integer default 7;
alter table public.notification_preferences add column if not exists dunning_max        integer default 3;

insert into storage.buckets (id, name, public) values ('maintenance-photos', 'maintenance-photos', true)
  on conflict (id) do nothing;
drop policy if exists "maint_photos_insert" on storage.objects;
create policy "maint_photos_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'maintenance-photos');
drop policy if exists "maint_photos_read" on storage.objects;
create policy "maint_photos_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'maintenance-photos');

create or replace function public.portal_meta(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_link record;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return json_build_object('found', false, 'pin_required', false); end if;
  return json_build_object('found', true, 'pin_required', v_link.pin_hash is not null);
end; $$;
grant execute on function public.portal_meta(text) to anon, authenticated;

create or replace function public.set_portal_pin(p_token text, p_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_ok int;
begin
  update portal_links
    set pin_hash = case when coalesce(trim(p_pin), '') = '' then null else crypt(p_pin, gen_salt('bf')) end
    where token = p_token and user_id = auth.uid();
  get diagnostics v_ok = row_count;
  return v_ok > 0;
end; $$;
grant execute on function public.set_portal_pin(text, text) to authenticated;

drop function if exists public.get_portal_data(text);
create or replace function public.get_portal_data(p_token text, p_pin text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return null; end if;
  if v_link.pin_hash is not null then
    if p_pin is null or crypt(p_pin, v_link.pin_hash) <> v_link.pin_hash then
      return json_build_object('locked', true);
    end if;
  end if;
  select name, address, prop_type into v_prop from user_properties where id::text = v_link.property_id::text;
  select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
    from tenants where property_id = v_link.property_id order by created_at desc limit 1;
  select coalesce(json_agg(json_build_object(
           'id', rp.id, 'year', rp.period_year, 'month', rp.period_month,
           'amount', rp.amount, 'due_date', rp.due_date, 'declared', rp.tenant_declared
         ) order by rp.period_year, rp.period_month), '[]'::json),
         coalesce(sum(rp.amount), 0)
    into v_due, v_total
    from rent_payments rp
    where rp.tenant_id = v_ten.id and rp.paid = false;
  return json_build_object(
    'property', json_build_object('name', v_prop.name, 'address', v_prop.address, 'type', v_prop.prop_type),
    'tenant',   json_build_object('name', v_ten.full_name, 'rent', v_ten.monthly_rent,
      'lease_start', v_ten.lease_start, 'lease_end', v_ten.lease_end, 'deposit', v_ten.deposit_amount,
      'rent_iban', v_ten.rent_iban),
    'payment_link', v_link.payment_link,
    'due',      v_due,
    'total_due', v_total
  );
end; $$;
grant execute on function public.get_portal_data(text, text) to anon, authenticated;

drop function if exists public.submit_maintenance_request(text, text, text, text);
create or replace function public.submit_maintenance_request(p_token text, p_title text, p_description text, p_contact text, p_photos jsonb default '[]'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record; v_ten_id uuid;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  select id into v_ten_id from tenants where property_id = v_link.property_id order by created_at desc limit 1;
  insert into maintenance_requests(property_id, user_id, token, tenant_id, title, description, contact, photos)
    values (v_link.property_id, v_link.user_id, p_token, v_ten_id, left(p_title, 200), left(p_description, 2000), left(p_contact, 200),
            coalesce(p_photos, '[]'::jsonb));
  return true;
end; $$;
grant execute on function public.submit_maintenance_request(text, text, text, text, jsonb) to anon, authenticated;

-- ── Τραπεζικές κινήσεις (import CSV → αντιστοίχιση, με dedup) ────────────────
create table if not exists public.bank_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  property_id uuid,
  txn_date    date,
  description text,
  amount      numeric not null,
  dedup_hash  text not null,
  imported_at timestamptz not null default now()
);
create unique index if not exists uq_bank_txn_dedup on public.bank_transactions(user_id, dedup_hash);
create index if not exists idx_bank_txn_user on public.bank_transactions(user_id);
alter table public.bank_transactions enable row level security;
drop policy if exists "own bank txn select" on public.bank_transactions;
create policy "own bank txn select" on public.bank_transactions for select using (auth.uid() = user_id);
drop policy if exists "own bank txn insert" on public.bank_transactions;
create policy "own bank txn insert" on public.bank_transactions for insert with check (auth.uid() = user_id);
drop policy if exists "own bank txn delete" on public.bank_transactions;
create policy "own bank txn delete" on public.bank_transactions for delete using (auth.uid() = user_id);

-- ── Κλείσιμο χρήσης (period lock, immutable snapshot ανά έτος/ακίνητο) ───────
create table if not exists public.book_closings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null,
  year        int  not null,
  snapshot    jsonb not null,
  locked_at   timestamptz not null default now()
);
create unique index if not exists uq_book_closing on public.book_closings(user_id, property_id, year);
alter table public.book_closings enable row level security;
drop policy if exists "own closing select" on public.book_closings;
create policy "own closing select" on public.book_closings for select using (auth.uid() = user_id);
drop policy if exists "own closing insert" on public.book_closings;
create policy "own closing insert" on public.book_closings for insert with check (auth.uid() = user_id);
-- Το κλείδωμα γίνεται με upsert (onConflict) → UPDATE όταν υπάρχει ήδη εγγραφή· χωρίς
-- πολιτική UPDATE το RLS μπλοκάρει σιωπηλά το επανα-κλείδωμα/«Ενημέρωση» απόκλισης.
drop policy if exists "own closing update" on public.book_closings;
create policy "own closing update" on public.book_closings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own closing delete" on public.book_closings;
create policy "own closing delete" on public.book_closings for delete using (auth.uid() = user_id);

-- ── Δεδομένα κοινότητας (ανώνυμα aggregates ανά ΤΚ, k-anonymity ≥5, με opt-out) ──
alter table if exists public.billing_profiles
  add column if not exists share_market_data boolean not null default true;
create or replace function public.community_market_stats()
returns table (
  postal_code text, sample_count int, median_gross_yield numeric,
  p25_yield numeric, p75_yield numeric, median_rent_per_sqm numeric, median_price_per_sqm numeric
)
language sql security definer set search_path = public stable as $$
  with base as (
    select up.postal_code, up.value::numeric as value,
      coalesce(rc.actual_rent, rc.target_rent, up.target_rent)::numeric as rent,
      nullif(up.sqm, 0)::numeric as sqm
    from public.user_properties up
    left join public.billing_profiles bp on bp.user_id = up.user_id
    left join lateral (select actual_rent, target_rent from public.rent_config rc where rc.property_id = up.id limit 1) rc on true
    where up.postal_code is not null and btrim(up.postal_code) <> '' and up.value > 0
      and coalesce(rc.actual_rent, rc.target_rent, up.target_rent) > 0
      and coalesce(bp.share_market_data, true) = true
  ), filtered as (
    select postal_code, value, rent, sqm, (rent * 12.0 / value) * 100.0 as gy
    from base where (rent * 12.0 / value) * 100.0 between 1 and 25
  )
  select postal_code, count(*)::int,
    round(percentile_cont(0.5)  within group (order by gy)::numeric, 1),
    round(percentile_cont(0.25) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.75) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.5)  within group (order by rent / sqm)  filter (where sqm is not null)::numeric, 2),
    round(percentile_cont(0.5)  within group (order by value / sqm) filter (where sqm is not null)::numeric, 0)
  from filtered group by postal_code having count(*) >= 5;
$$;
revoke all on function public.community_market_stats() from public;
grant execute on function public.community_market_stats() to authenticated;
