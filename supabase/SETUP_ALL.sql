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
-- 20260720120000: χρονοσήμανση τελευταίας αλλαγής ονόματος (κλείδωμα 1 φορά/μήνα)
alter table public.billing_profiles add column if not exists full_name_changed_at timestamptz;
-- Τύπος προφίλ: 'individual' (ιδιώτης) | 'professional' (επαγγελματίας διαχειριστής).
-- Οδηγεί το interface (τι βλέπει/μπορεί ο καθένας), ώστε να μη μπερδεύεται.
alter table public.billing_profiles add column if not exists profile_type text default 'individual';
-- 20260720130000: δωρεάν πρόσβαση (comp) + λίστα αναμονής mobile.
alter table public.billing_profiles add column if not exists comp_plan           text;
alter table public.billing_profiles add column if not exists comp_until           timestamptz;
alter table public.billing_profiles add column if not exists comp_months_granted  int default 0;
alter table public.billing_profiles add column if not exists comp_started_at       timestamptz;
alter table public.billing_profiles add column if not exists wants_mobile          boolean default false;

drop policy if exists "own_billing_profile" on public.billing_profiles;
create policy "own_billing_profile" on public.billing_profiles for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Κλείδωμα του plan: μόνο το billing (service_role) το ορίζει — ο χρήστης δεν
-- μπορεί να αυτοανακηρυχθεί «συνδρομητής» (plan='monthly') και να φουσκώσει τα
-- referral milestones/streak/προμήθεια. Το profile_type μένει επιλογή του χρήστη.
create or replace function public.lock_billing_plan()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.comp_plan := null;
      new.comp_until := null;
      new.comp_months_granted := 0;
      new.comp_started_at := null;
    else
      if new.plan is distinct from old.plan then new.plan := old.plan; end if;
      -- Τα comp_* (δωρεάν πρόσβαση) τα ορίζει μόνο ο server, όχι ο client.
      new.comp_plan          := old.comp_plan;
      new.comp_until         := old.comp_until;
      new.comp_months_granted := old.comp_months_granted;
      new.comp_started_at    := old.comp_started_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists lock_billing_plan_trg on public.billing_profiles;
create trigger lock_billing_plan_trg
  before insert or update on public.billing_profiles
  for each row execute function public.lock_billing_plan();

-- ─── 20260720130000_plan_entitlements.sql ───
-- Ενεργό επίπεδο πλάνου + αυστηρή επιβολή ορίου ακινήτων + συγχρονισμός δωρεάν μηνών.
create or replace function public.plan_max_properties(p_rank int)
returns int language sql immutable as $$
  select case p_rank when 2 then 2147483647 when 1 then 6 else 1 end;
$$;

create or replace function public.user_plan_rank(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text; v_comp_plan text; v_comp_until timestamptz; v_rank int := 0;
begin
  select plan, comp_plan, comp_until into v_plan, v_comp_plan, v_comp_until
    from billing_profiles where user_id = p_uid;
  if v_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
  if v_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
  end if;
  if exists (select 1 from referral_partners where user_id = p_uid) then
    v_rank := greatest(v_rank, 2);
  end if;
  return v_rank;
end;
$$;

create or replace function public.enforce_property_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int; v_limit int;
begin
  select count(*) into v_count from user_properties where user_id = NEW.user_id;
  v_limit := plan_max_properties(user_plan_rank(NEW.user_id));
  if v_count >= v_limit then
    raise exception 'PROPERTY_LIMIT: Το πλάνο σου καλύπτει % ακίνητα. Αναβάθμισε για περισσότερα.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_enforce_property_limit on public.user_properties;
create trigger trg_enforce_property_limit
  before insert on public.user_properties
  for each row execute function public.enforce_property_limit();

create or replace function public.sync_comp_from_referrals()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_months int; v_ptype text; v_target text; v_cap int := 12;
begin
  if v_uid is null then return; end if;
  select coalesce(sum(months), 0) into v_months
    from referral_rewards where user_id = v_uid and kind = 'months';
  v_months := least(v_months, v_cap);
  if v_months <= 0 then return; end if;
  select coalesce(profile_type, 'individual') into v_ptype from billing_profiles where user_id = v_uid;
  v_target := case when v_ptype = 'professional' then 'agency' else 'owner' end;
  update billing_profiles
     set comp_months_granted = greatest(coalesce(comp_months_granted, 0), v_months),
         comp_started_at     = coalesce(comp_started_at, now()),
         comp_plan           = v_target,
         comp_until          = coalesce(comp_started_at, now())
                               + (greatest(coalesce(comp_months_granted, 0), v_months) || ' months')::interval
   where user_id = v_uid and v_months > coalesce(comp_months_granted, 0);
end;
$$;
grant execute on function public.sync_comp_from_referrals() to authenticated;


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
  client_id   uuid,  -- FK προς public.clients προστίθεται πιο κάτω (η clients ορίζεται αργότερα)
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
-- ΑΣΦΑΛΕΙΑ: καμία απευθείας εγγραφή παραπομπής από τον client. Η παλιά policy
-- INSERT επέτρεπε «σφυρηλάτηση» ενεργοποιημένης παραπομπής (αυθαίρετο
-- referrer_user_id/activated_at) παρακάμπτοντας τα guards. Πλέον οι παραπομπές
-- γράφονται ΜΟΝΟ μέσω των SECURITY DEFINER RPC (redeem_referral / mark_referral_activated).
drop policy if exists "insert_own_referral" on public.referrals;

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


-- ─── 20260718100000_referral_v2.sql ───
-- Referral v2 — δύο προγράμματα ανά προφίλ (Ιδιώτης/Επαγγελματίας). ΑΣΦΑΛΕΙΑ:
-- ενεργοποίηση επαληθευμένη server-side, αξία προϊόντος (όχι μετρητά), τα paid
-- milestones μετρούν συνδρομητές (plan monthly/annual), σερί σε ολοκληρωμένους
-- μήνες, μόνιμη ιδιότητα Συνεργάτη. Idempotent.
alter table public.referrals add column if not exists referrer_user_id uuid references auth.users(id) on delete set null;
alter table public.referrals add column if not exists activated_at timestamptz;
update public.referrals r set referrer_user_id = c.user_id
  from public.referral_codes c where r.referrer_user_id is null and r.code = c.code;
create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
create index if not exists referrals_activated_idx on public.referrals(referrer_user_id, activated_at);

create table if not exists public.referral_rewards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  referral_id  uuid references public.referrals(id) on delete set null,
  kind         text not null,
  months       integer   default 0,
  amount_eur   numeric   default 0,
  tier         text      default '',
  reason       text      default '',
  status       text      default 'pending',
  created_at   timestamptz default now()
);
alter table public.referral_rewards enable row level security;
drop policy if exists "own_referral_rewards" on public.referral_rewards;
create policy "own_referral_rewards" on public.referral_rewards for select using (user_id = auth.uid());
alter table public.referral_rewards add column if not exists tier text default '';

create table if not exists public.referral_partners (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  earned_at  timestamptz default now()
);
alter table public.referral_partners enable row level security;
drop policy if exists "own_referral_partner" on public.referral_partners;
create policy "own_referral_partner" on public.referral_partners for select using (user_id = auth.uid());

create or replace function public.redeem_referral(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_created timestamptz;
begin
  if p_code is null or length(trim(p_code)) = 0 then return; end if;
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner = auth.uid() then return; end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created is null or v_created < now() - interval '14 days' then return; end if;
  insert into referrals (code, referred_user_id, referrer_user_id)
       values (p_code, auth.uid(), v_owner)
  on conflict (referred_user_id) do nothing;
end; $$;
grant execute on function public.redeem_referral(text) to authenticated;

create or replace function public.mark_referral_activated()
returns void language plpgsql security definer set search_path = public as $$
declare v_props int; v_docs int;
begin
  select count(*)::int into v_props from user_properties where user_id = auth.uid();
  select count(*)::int into v_docs  from property_documents where user_id = auth.uid();
  if v_props >= 1 and v_docs >= 1 then
    update referrals set activated_at = now()
     where referred_user_id = auth.uid() and activated_at is null;
  end if;
end; $$;
grant execute on function public.mark_referral_activated() to authenticated;

create or replace function public.get_referral_overview(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_invites int; v_activated int;
        v_m_pro int; v_m_indiv int; v_m_paid int; v_m_free int;
        v_streak int := 0; v_partner boolean; v_monthly json; r record;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then
    return json_build_object('invites',0,'activated',0,'m_pro',0,'m_indiv',0,
      'm_paid',0,'m_free',0,'streak',0,'partner',false,'paid_monthly_counts',json_build_array());
  end if;
  select count(*)::int into v_invites   from referrals where referrer_user_id = v_owner;
  select count(*)::int into v_activated from referrals where referrer_user_id = v_owner and activated_at is not null;
  select
    (count(*) filter (where coalesce(bp.profile_type,'individual') = 'professional'))::int,
    (count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional'))::int,
    (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int,
    (count(*) filter (where coalesce(bp.plan,'') not in ('monthly','annual')))::int
  into v_m_pro, v_m_indiv, v_m_paid, v_m_free
  from referrals r2
  left join billing_profiles bp on bp.user_id = r2.referred_user_id
  where r2.referrer_user_id = v_owner and r2.activated_at is not null
    and date_trunc('month', r2.activated_at) = date_trunc('month', now());
  for r in
    select (select (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int
              from referrals rr left join billing_profiles bp on bp.user_id = rr.referred_user_id
             where rr.referrer_user_id = v_owner and rr.activated_at is not null
               and date_trunc('month', rr.activated_at) = gs.m) as paid
      from generate_series(date_trunc('month', now()) - interval '1 month',
             date_trunc('month', now()) - interval '12 months', interval '-1 month') as gs(m)
      order by gs.m desc
  loop
    if r.paid >= 5 then v_streak := v_streak + 1; else exit; end if;
  end loop;
  if v_streak >= 3 then
    insert into referral_partners (user_id) values (v_owner) on conflict (user_id) do nothing;
  end if;
  select exists(select 1 from referral_partners where user_id = v_owner) into v_partner;
  select json_agg(paid order by m) into v_monthly from (
      select gs.m as m, (select (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int
               from referrals rr left join billing_profiles bp on bp.user_id = rr.referred_user_id
              where rr.referrer_user_id = v_owner and rr.activated_at is not null
                and date_trunc('month', rr.activated_at) = gs.m) as paid
        from generate_series(date_trunc('month', now()) - interval '6 months',
               date_trunc('month', now()) - interval '1 month', interval '1 month') as gs(m)
    ) months;
  return json_build_object('invites',v_invites,'activated',v_activated,
    'm_pro',v_m_pro,'m_indiv',v_m_indiv,'m_paid',v_m_paid,'m_free',v_m_free,
    'streak',v_streak,'partner',v_partner,'paid_monthly_counts',coalesce(v_monthly,json_build_array()));
end; $$;
grant execute on function public.get_referral_overview(text) to authenticated;

create or replace function public.claim_referral_bonus(p_code text, p_kind text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_count int; v_target int; v_months int; v_tier text; v_exists int;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_object('ok', false, 'reason', 'not_owner'); end if;
  if    p_kind = 'indiv_volume' then v_target := 5;  v_months := 1; v_tier := 'owner';
  elsif p_kind = 'pro_paid'     then v_target := 5;  v_months := 2; v_tier := 'agency';
  elsif p_kind = 'pro_free'     then v_target := 10; v_months := 1; v_tier := 'agency';
  else return json_build_object('ok', false, 'reason', 'bad_kind'); end if;
  perform pg_advisory_xact_lock(hashtext('referral_bonus:' || p_kind || ':' || v_owner::text));
  select
    case p_kind
      when 'indiv_volume' then count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional')
      when 'pro_paid'     then count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual'))
      when 'pro_free'     then count(*) filter (where coalesce(bp.plan,'') not in ('monthly','annual'))
    end::int
  into v_count
  from referrals r left join billing_profiles bp on bp.user_id = r.referred_user_id
  where r.referrer_user_id = v_owner and r.activated_at is not null
    and date_trunc('month', r.activated_at) = date_trunc('month', now());
  if v_count < v_target then return json_build_object('ok', false, 'reason', 'not_reached', 'count', v_count, 'target', v_target); end if;
  select count(*)::int into v_exists from referral_rewards
   where user_id = v_owner and reason = p_kind
     and date_trunc('month', created_at) = date_trunc('month', now());
  if v_exists > 0 then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;
  insert into referral_rewards (user_id, kind, months, tier, reason, status)
       values (v_owner, 'months', v_months, v_tier, p_kind, 'pending');
  return json_build_object('ok', true, 'status', 'pending', 'months', v_months, 'tier', v_tier);
end; $$;
grant execute on function public.claim_referral_bonus(text, text) to authenticated;

create or replace function public.get_referral_social_proof()
returns int language sql security definer set search_path = public as $$
  select count(distinct referrer_user_id)::int from referrals
   where referrer_user_id is not null
     and date_trunc('month', created_at) = date_trunc('month', now());
$$;
grant execute on function public.get_referral_social_proof() to authenticated;

-- ─── 20260718130000_referral_reward_ledger.sql ───
-- Καταγράφει την ανά-σύσταση υπόσχεση του Ιδιώτη στο ledger (pending), ώστε το
-- «Τα δώρα σου» να λέει την αλήθεια. Idempotent, όχι read-path.
create unique index if not exists referral_rewards_referral_reason_uidx
  on public.referral_rewards (user_id, referral_id, reason)
  where referral_id is not null;

create or replace function public.reconcile_referral_rewards(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_ptype  text;
  v_paying boolean;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return; end if;

  select coalesce(profile_type, 'individual'),
         coalesce(plan, '') in ('monthly', 'annual')
    into v_ptype, v_paying
    from billing_profiles where user_id = v_owner;
  v_ptype  := coalesce(v_ptype, 'individual');
  v_paying := coalesce(v_paying, false);

  if v_ptype = 'professional' then return; end if;

  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id,
         case when v_paying then 'months' else 'slot' end,
         1, 'owner', 'per_referral', 'pending'
    from referrals r
   where r.referrer_user_id = v_owner and r.activated_at is not null
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;

  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'months', 2, 'owner', 'per_referral_pro', 'pending'
    from referrals r
    join billing_profiles bp on bp.user_id = r.referred_user_id
   where r.referrer_user_id = v_owner and r.activated_at is not null
     and coalesce(bp.profile_type, 'individual') = 'professional'
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;
end;
$$;
grant execute on function public.reconcile_referral_rewards(text) to authenticated;

-- ─── 20260718140000_referral_list.sql ───
-- Λίστα προσκεκλημένων ανά στάδιο (privacy-safe). GDPR ελαχιστοποίηση (Άρθ. 5§1γ/25):
-- ΜΟΝΟ εκκρεμεί/ενεργοποιήθηκε — καμία αποκάλυψη ανά άτομο για συνδρομητή/επαγγελματία.
create or replace function public.get_referral_list(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_rows json;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_array(); end if;

  select coalesce(json_agg(t order by t.created_at desc), json_build_array())
    into v_rows
    from (
      select r.created_at, r.activated_at
        from referrals r
       where r.referrer_user_id = v_owner
    ) t;

  return v_rows;
end;
$$;
grant execute on function public.get_referral_list(text) to authenticated;

-- ─── 20260718150000_referral_standing.sql ───
-- Διακριτική κατάταξη (κορυφαίο X%), όχι πίνακας. Θετική-μόνο κοινωνική απόδειξη.
create or replace function public.get_referral_standing()
returns int language plpgsql security definer set search_path = public stable as $$
declare v_me int; v_total int; v_below int; v_top int;
begin
  select count(*) into v_me from referrals
   where referrer_user_id = auth.uid() and activated_at is not null
     and date_trunc('month', activated_at) = date_trunc('month', now());
  if v_me < 1 then return 0; end if;

  select count(*) into v_total from (
    select referrer_user_id from referrals
     where activated_at is not null
       and date_trunc('month', activated_at) = date_trunc('month', now())
     group by referrer_user_id) t;
  if v_total < 5 then return 0; end if;

  select count(*) into v_below from (
    select referrer_user_id from referrals
     where activated_at is not null
       and date_trunc('month', activated_at) = date_trunc('month', now())
     group by referrer_user_id
    having count(*) < v_me) t;

  v_top := greatest(1, round(100.0 * (v_total - v_below) / v_total)::int);
  if v_top > 50 then return 0; end if;
  return v_top;
end;
$$;
grant execute on function public.get_referral_standing() to authenticated;


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

-- ── Ενοικιαστές: ΠΛΗΡΕΣ σχήμα (βλ. 20260720230000_tenants_schema_complete) ─────
-- Δημιουργεί τον πίνακα αν λείπει ΚΑΙ εγγυάται κάθε στήλη που γράφει η φόρμα
-- ενοικιαστή· χωρίς αυτό, μια εγκατάσταση με ελλιπές σχήμα απέτυχε σε κάθε INSERT
-- («Could not find the 'X' column») με το σφάλμα κρυμμένο πίσω από τη φόρμα.
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  user_id     uuid not null default auth.uid(),
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);
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
alter table public.tenants add column if not exists lease_type       text;
alter table public.tenants add column if not exists lease_start      date;
alter table public.tenants add column if not exists lease_end        date;
alter table public.tenants add column if not exists custom_lease_days integer;
alter table public.tenants add column if not exists monthly_rent     numeric;
alter table public.tenants add column if not exists payment_frequency text;
alter table public.tenants add column if not exists rent_iban        text;
alter table public.tenants add column if not exists deposit_amount      numeric;
alter table public.tenants add column if not exists deposit_invested    boolean default false;
alter table public.tenants add column if not exists deposit_returned    boolean default false;
alter table public.tenants add column if not exists deposit_return_date date;
alter table public.tenants add column if not exists deposit_invest_rate numeric;
alter table public.tenants add column if not exists deposit_invest_type text;
alter table public.tenants add column if not exists deposit_invest_term text;
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
alter table public.tenants add column if not exists e_payment               boolean default true;
alter table public.tenants add column if not exists streaming               jsonb;
alter table public.tenants add column if not exists cleaning                jsonb;
alter table public.tenants add column if not exists extra_perks             text;
alter table public.tenants add column if not exists welcome_basket          boolean default false;
alter table public.tenants add column if not exists welcome_basket_amount   numeric;
alter table public.tenants add column if not exists welcome_basket_contents text;
alter table public.tenants add column if not exists parking_included        boolean default false;
alter table public.tenants add column if not exists parking_extra           boolean default false;
alter table public.tenants add column if not exists parking_extra_price     numeric;
alter table public.tenants add column if not exists parking_type            text;
alter table public.tenants add column if not exists parking_has_electricity boolean default false;
alter table public.tenants add column if not exists parking_notes           text;
alter table public.tenants add column if not exists ac_service_by                   text;
alter table public.tenants add column if not exists ac_service_frequency            text;
alter table public.tenants add column if not exists solar_service_by                text;
alter table public.tenants add column if not exists solar_service_frequency         text;
alter table public.tenants add column if not exists heat_pump_service_by            text;
alter table public.tenants add column if not exists heat_pump_service_frequency     text;
alter table public.tenants add column if not exists solar_panels_service_by         text;
alter table public.tenants add column if not exists solar_panels_service_frequency  text;
alter table public.tenants add column if not exists pest_control_by                 text;
alter table public.tenants add column if not exists pest_control_frequency          text;
alter table public.tenants add column if not exists annual_services_notes           text;
alter table public.tenants add column if not exists prepay_option       boolean default false;
alter table public.tenants add column if not exists prepay_months       integer;
alter table public.tenants add column if not exists prepay_discount_pct numeric;
alter table public.tenants add column if not exists prepay_invested     boolean default false;
alter table public.tenants add column if not exists prepay_invest_rate  numeric;
alter table public.tenants add column if not exists prepay_invest_type  text;
alter table public.tenants add column if not exists prepay_invest_term  text;
alter table public.tenants add column if not exists lease_doc_url          text;
alter table public.tenants add column if not exists lease_doc_name         text;
alter table public.tenants add column if not exists lease_doc_external_url text;
create index if not exists tenants_property_idx on public.tenants (property_id);
create index if not exists tenants_user_idx     on public.tenants (user_id);
-- Κατάργηση λανθασμένου UNIQUE(property_id) — ένα ακίνητο δέχεται πολλούς
-- ενοικιαστές (τρέχων + ιστορικό). Αλλιώς: «duplicate key tenants_property_id_key».
do $$
declare r record;
begin
  for r in select conname from pg_constraint
    where conrelid='public.tenants'::regclass and contype='u'
      and pg_get_constraintdef(oid) ilike '%(property_id)%'
  loop execute format('alter table public.tenants drop constraint %I', r.conname); end loop;
exception when undefined_table then null;
end $$;
alter table public.tenants enable row level security;
drop policy if exists own_tenants on public.tenants;
create policy own_tenants on public.tenants for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

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

-- ── maintenance-photos: ασφάλεια πρόσβασης ────────────────────────────────
-- Οι φωτογραφίες βλάβης ανεβαίνουν από την πύλη (ανώνυμος με token) σε φάκελο
-- ίσο με το token. Το bucket παραμένει «δημόσιο» ώστε ο ιδιοκτήτης να τις βλέπει
-- με μη-μαντεύσιμο capability URL (ίδιο μοντέλο ασφαλείας με τα tokens της πύλης),
-- ΑΛΛΑ κλείνουμε δύο τρύπες: (α) κανένας ανώνυμος δεν μπορεί πλέον να απαριθμήσει
-- ή να κατεβάσει μαζικά τις φωτογραφίες άλλων (καταργείται η ανώνυμη ανάγνωση API),
-- (β) το ανέβασμα επιτρέπεται ΜΟΝΟ σε φάκελο ενεργού token πύλης (τέλος στο dumping).

-- Helpers (security definer): ελέγχουν το token χωρίς ο ανώνυμος να «βλέπει» τον πίνακα.
create or replace function public.is_active_portal_token(p_token text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from portal_links where token = p_token and active);
$$;
grant execute on function public.is_active_portal_token(text) to anon, authenticated;

create or replace function public.owns_portal_token(p_token text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from portal_links where token = p_token and user_id = auth.uid());
$$;
grant execute on function public.owns_portal_token(text) to authenticated;

insert into storage.buckets (id, name, public) values ('maintenance-photos', 'maintenance-photos', true)
  on conflict (id) do nothing;

-- Ανέβασμα: μόνο κάτω από φάκελο = token ΕΝΕΡΓΗΣ πύλης.
drop policy if exists "maint_photos_insert" on storage.objects;
create policy "maint_photos_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'maintenance-photos' and public.is_active_portal_token((storage.foldername(name))[1]));

-- Ανάγνωση μέσω API: ΜΟΝΟ ο ιδιοκτήτης του token. Η ανώνυμη ανάγνωση/απαρίθμηση καταργείται.
drop policy if exists "maint_photos_read" on storage.objects;
drop policy if exists "maint_photos_read_owner" on storage.objects;
create policy "maint_photos_read_owner" on storage.objects for select to authenticated
  using (bucket_id = 'maintenance-photos' and public.owns_portal_token((storage.foldername(name))[1]));

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


-- ─── checkin_links → clients FK (deferred, ώστε να μη σπάει σε fresh DB) ───
-- Η public.clients ορίζεται πιο κάτω από την checkin_links στη συνένωση, οπότε το
-- FK προστίθεται εδώ (idempotent) αφού πλέον υπάρχουν και οι δύο πίνακες.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checkin_links_client_fk') then
    alter table public.checkin_links
      add constraint checkin_links_client_fk foreign key (client_id)
      references public.clients(id) on delete set null;
  end if;
end $$;


-- ─── 20260720140000_organizations.sql ───
-- Οργανισμός & Ομάδα (Επαγγελματίας): μέλη, ρόλοι, προσκλήσεις + προσθετική
-- πρόσβαση ανάγνωσης στο χαρτοφυλάκιο. Η επέκταση RLS είναι μόνο SELECT (ποτέ
-- δεν αφαιρεί πρόσβαση). Idempotent.
create table if not exists public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null references auth.users(id) on delete cascade,
  name                 text not null default '',
  upgrade_requested_at timestamptz,
  created_at           timestamptz default now()
);
create unique index if not exists organizations_owner_uidx on public.organizations(owner_user_id);
alter table public.organizations enable row level security;

create table if not exists public.organization_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'member',
  status     text not null default 'invited',
  invited_at timestamptz default now(),
  joined_at  timestamptz,
  unique (org_id, email)
);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
alter table public.organization_members enable row level security;

create or replace function public.org_owner_ids(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p_uid
  union
  select o.owner_user_id from organization_members m join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active'
$$;

create or replace function public.is_org_owner(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organizations where id = p_org and owner_user_id = p_uid)
$$;
create or replace function public.is_active_org_member(p_org uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where org_id = p_org and user_id = p_uid and status = 'active')
$$;
grant execute on function public.is_org_owner(uuid, uuid)        to authenticated;
grant execute on function public.is_active_org_member(uuid, uuid) to authenticated;

drop policy if exists "org_owner_all" on public.organizations;
create policy "org_owner_all" on public.organizations for all
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists "org_member_read" on public.organizations;
create policy "org_member_read" on public.organizations for select
  using (public.is_active_org_member(id, auth.uid()));

drop policy if exists "org_members_owner" on public.organization_members;
create policy "org_members_owner" on public.organization_members for all
  using (public.is_org_owner(org_id, auth.uid()))
  with check (public.is_org_owner(org_id, auth.uid()));
drop policy if exists "org_members_self_read" on public.organization_members;
create policy "org_members_self_read" on public.organization_members for select using (user_id = auth.uid());

drop policy if exists "org_read_properties" on public.user_properties;
create policy "org_read_properties" on public.user_properties for select
  using (user_id in (select public.org_owner_ids(auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['expenses','bills','tenants','maintenance_tasks','loans','client_stays','checklist_items','inventory_items','inventory_maintenance','property_documents','contacts','property_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_read_' || t, t);
      execute format('create policy %I on public.%I for select using (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_owner_ids(auth.uid()))))', 'org_read_' || t, t, t);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_read_' || t, t);
      execute format('create policy %I on public.%I for select using (user_id in (select public.org_owner_ids(auth.uid())))', 'org_read_' || t, t);
    end if;
  end loop;
end $$;

create or replace function public.ensure_organization()
returns public.organizations language plpgsql security definer set search_path = public as $$
declare v_org public.organizations;
begin
  select * into v_org from organizations where owner_user_id = auth.uid();
  if v_org.id is null then
    insert into organizations(owner_user_id, name) values (auth.uid(), '') returning * into v_org;
    insert into organization_members(org_id, user_id, email, role, status, joined_at)
      values (v_org.id, auth.uid(), coalesce(auth.email(), ''), 'owner', 'active', now())
    on conflict (org_id, email) do nothing;
  end if;
  return v_org;
end; $$;

create or replace function public.rename_organization(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update organizations set name = coalesce(nullif(trim(p_name), ''), name) where owner_user_id = auth.uid();
end; $$;

create or replace function public.invite_org_member(p_email text, p_role text default 'member')
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null or p_email is null or position('@' in p_email) = 0 then return; end if;
  insert into organization_members(org_id, email, role, status)
    values (v_org, lower(trim(p_email)), case when p_role in ('admin','member') then p_role else 'member' end, 'invited')
  on conflict (org_id, email) do update set role = excluded.role, status = case when organization_members.status = 'revoked' then 'invited' else organization_members.status end;
end; $$;

create or replace function public.set_org_member_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  update organization_members set role = case when p_role in ('admin','member') then p_role else role end
   where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;

create or replace function public.revoke_org_member(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  delete from organization_members where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;

create or replace function public.accept_org_invites_for_me()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organization_members set user_id = auth.uid(), status = 'active', joined_at = coalesce(joined_at, now())
   where lower(email) = lower(coalesce(auth.email(), '')) and status = 'invited';
end; $$;

create or replace function public.request_org_upgrade()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organizations set upgrade_requested_at = now()
   where id in (select org_id from organization_members where user_id = auth.uid() and status = 'active');
end; $$;

grant execute on function public.org_owner_ids(uuid)            to authenticated;
grant execute on function public.ensure_organization()           to authenticated;
grant execute on function public.rename_organization(text)       to authenticated;
grant execute on function public.invite_org_member(text, text)   to authenticated;
grant execute on function public.set_org_member_role(text, text) to authenticated;
grant execute on function public.revoke_org_member(text)         to authenticated;
grant execute on function public.accept_org_invites_for_me()     to authenticated;
grant execute on function public.request_org_upgrade()           to authenticated;


-- ─── 20260720150000_org_permissions.sql ───
-- Δικαιώματα μελών: έγκριση επεξεργασίας από τον owner + αιτήματα. Οι write
-- policies είναι προσθετικές (UPDATE/DELETE μόνο, μόνο για can_edit=true).
alter table public.organization_members
  add column if not exists can_edit          boolean default false,
  add column if not exists edit_requested_at timestamptz;

create or replace function public.org_editor_owner_ids(p_uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select o.owner_user_id from organization_members m join organizations o on o.id = m.org_id
   where m.user_id = p_uid and m.status = 'active' and m.can_edit = true
$$;
grant execute on function public.org_editor_owner_ids(uuid) to authenticated;

drop policy if exists "org_edit_properties" on public.user_properties;
create policy "org_edit_properties" on public.user_properties for update
  using (user_id in (select public.org_editor_owner_ids(auth.uid())))
  with check (user_id in (select public.org_editor_owner_ids(auth.uid())));
drop policy if exists "org_del_properties" on public.user_properties;
create policy "org_del_properties" on public.user_properties for delete
  using (user_id in (select public.org_editor_owner_ids(auth.uid())));

do $$
declare t text;
begin
  foreach t in array array['expenses','bills','tenants','maintenance_tasks','loans','client_stays','checklist_items','inventory_items','inventory_maintenance','property_documents','contacts','property_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_edit_' || t, t);
      execute format('create policy %I on public.%I for update using (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_editor_owner_ids(auth.uid())))) with check (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_editor_owner_ids(auth.uid()))))', 'org_edit_' || t, t, t, t);
      execute format('drop policy if exists %I on public.%I', 'org_del_' || t, t);
      execute format('create policy %I on public.%I for delete using (exists (select 1 from public.user_properties p where p.id::text = %I.property_id::text and p.user_id in (select public.org_editor_owner_ids(auth.uid()))))', 'org_del_' || t, t, t);
    end if;
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'org_edit_' || t, t);
      execute format('create policy %I on public.%I for update using (user_id in (select public.org_editor_owner_ids(auth.uid()))) with check (user_id in (select public.org_editor_owner_ids(auth.uid())))', 'org_edit_' || t, t);
      execute format('drop policy if exists %I on public.%I', 'org_del_' || t, t);
      execute format('create policy %I on public.%I for delete using (user_id in (select public.org_editor_owner_ids(auth.uid())))', 'org_del_' || t, t);
    end if;
  end loop;
end $$;

create or replace function public.request_member_edit()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organization_members set edit_requested_at = now()
   where user_id = auth.uid() and status = 'active' and role <> 'owner' and coalesce(can_edit, false) = false;
end; $$;

create or replace function public.set_member_edit(p_email text, p_can boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where owner_user_id = auth.uid();
  if v_org is null then return; end if;
  update organization_members set can_edit = coalesce(p_can, false), edit_requested_at = null
   where org_id = v_org and lower(email) = lower(p_email) and role <> 'owner';
end; $$;

create or replace function public.clear_org_upgrade_request()
returns void language plpgsql security definer set search_path = public as $$
begin
  update organizations set upgrade_requested_at = null where owner_user_id = auth.uid();
end; $$;

grant execute on function public.request_member_edit()          to authenticated;
grant execute on function public.set_member_edit(text, boolean)  to authenticated;
grant execute on function public.clear_org_upgrade_request()     to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- Επώνυμο feedback χρηστών (μία φορά ανά μήνα) + κληρωτίδα δωρεάν συνδρομής.
--
-- Στόχος: πελατοκεντρική βελτίωση. Ο χρήστης γράφει τι θα ήθελε καλύτερο στα
-- εργαλεία, στον βοηθό ή οπουδήποτε αλλού. Για να είναι ουσιαστικό:
--   • ελάχιστο όριο πραγματικών λέξεων (όχι μόνο αριθμοί/σύμβολα),
--   • μία υποβολή ανά ημερολογιακό μήνα,
--   • επώνυμο (κρατάμε το email του χρήστη).
--
-- Κίνητρο (καμπάνια): το εποικοδομητικό feedback μπαίνει σε κληρωτίδα για μία
-- δωρεάν ετήσια συνδρομή «Επαγγελματίας». Η καμπάνια τρέχει σε κύκλο 3 μηνών
-- ΕΝΕΡΓΗ + 1 μήνα ΠΑΥΣΗ (= 3 κληρώσεις/έτος). Ο κύκλος και η κλήρωση είναι
-- πλήρως αυτόματα (backend/pg_cron)· ο χρήστης δεν χρειάζεται να τα ξέρει.
--
-- Ασφάλεια: καμία απευθείας εγγραφή από client· μόνο μέσω submit_feedback
-- (SECURITY DEFINER, με έλεγχο ορίου λέξεων + μία/μήνα server-side). Η κλήρωση
-- και το δώρο εκτελούνται μόνο από backend/cron (όχι από authenticated).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.user_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text,
  body        text not null,
  word_count  int  not null default 0,
  target      text not null default 'general',   -- 'general' | 'assistant' | 'app'
  campaign_id text,                               -- ενεργή καμπάνια ή null (παύση)
  in_pool     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_user_feedback_user     on public.user_feedback(user_id, created_at desc);
create index if not exists idx_user_feedback_campaign on public.user_feedback(campaign_id) where in_pool;

alter table public.user_feedback enable row level security;
drop policy if exists "feedback_select_own" on public.user_feedback;
create policy "feedback_select_own" on public.user_feedback for select using (user_id = auth.uid());
-- (Καμία policy INSERT/UPDATE/DELETE: η καταχώρηση γίνεται μόνο μέσω RPC.)

-- ── Καμπάνια: κύκλος 4 μηνών (3 ενεργοί + 1 παύση), αγκυρωμένος στον 1/2026 ──
create or replace function public.feedback_campaign(p_ts timestamptz default now())
returns table(campaign_id text, active boolean)
language sql immutable as $$
  with e as (
    select ((extract(year from p_ts)::int - 2026) * 12 + (extract(month from p_ts)::int - 1)) as m
  )
  select 'C' || floor(m::numeric / 4)::text,
         (m - floor(m::numeric / 4)::int * 4) < 3
  from e;
$$;

-- ── Μέτρημα «πραγματικών» λέξεων: tokens που περιέχουν τουλάχιστον ένα γράμμα
--    (ελληνικό ή λατινικό). Αποκλείει καθαρά αριθμούς/σύμβολα. ────────────────
create or replace function public.count_real_words(p text)
returns int language sql immutable as $$
  select coalesce(array_length(
    array(
      select w from unnest(regexp_split_to_array(coalesce(trim(p), ''), '\s+')) as w
      where w ~ '[A-Za-zΑ-Ωα-ωΆΈΉΊΌΎΏϊϋΐΰ]'
    ), 1), 0);
$$;

-- ── Κατάσταση feedback του τρέχοντος χρήστη (για το UI, χωρίς εγγραφή) ───────
create or replace function public.my_feedback_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_has boolean; v_active boolean; v_camp text;
begin
  if v_uid is null then return jsonb_build_object('status', 'error'); end if;
  select exists(
    select 1 from user_feedback
     where user_id = v_uid and date_trunc('month', created_at) = date_trunc('month', now())
  ) into v_has;
  select campaign_id, active into v_camp, v_active from public.feedback_campaign(now());
  return jsonb_build_object('submitted_this_month', v_has, 'campaign_active', v_active, 'campaign', v_camp);
end; $$;

-- ── Υποβολή feedback (μία/μήνα, ελάχιστες λέξεις, pool αν είναι ενεργή καμπάνια) ─
create or replace function public.submit_feedback(p_body text, p_target text default 'general')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_words int;
  v_camp  text;
  v_active boolean;
  v_email text;
  v_min   int := 12;
begin
  if v_uid is null then return jsonb_build_object('status', 'error'); end if;

  v_words := public.count_real_words(p_body);
  if v_words < v_min then
    return jsonb_build_object('status', 'too_short', 'min', v_min, 'words', v_words);
  end if;

  if exists (
    select 1 from user_feedback
     where user_id = v_uid and date_trunc('month', created_at) = date_trunc('month', now())
  ) then
    return jsonb_build_object('status', 'already');
  end if;

  select campaign_id, active into v_camp, v_active from public.feedback_campaign(now());
  select email into v_email from auth.users where id = v_uid;

  insert into user_feedback(user_id, email, body, word_count, target, campaign_id, in_pool)
  values (v_uid, v_email, left(p_body, 4000), v_words,
          coalesce(nullif(p_target, ''), 'general'),
          case when v_active then v_camp else null end,
          v_active);

  return jsonb_build_object('status', 'ok', 'in_pool', v_active,
                            'campaign', case when v_active then v_camp else null end);
end; $$;

revoke all on function public.submit_feedback(text, text) from public;
grant execute on function public.submit_feedback(text, text) to authenticated;
grant execute on function public.my_feedback_status()        to authenticated;

-- ── Κληρωτίδα: ένας νικητής ανά καμπάνια, δώρο 12 μήνες «Επαγγελματίας» (comp) ─
create table if not exists public.feedback_campaign_winners (
  campaign_id text primary key,
  user_id     uuid references auth.users(id) on delete set null,
  drawn_at    timestamptz not null default now()
);
alter table public.feedback_campaign_winners enable row level security;
-- (Χωρίς policies: πρόσβαση μόνο από backend/service_role.)

create or replace function public.draw_feedback_winner(p_campaign text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_winner uuid;
begin
  if p_campaign is null then return null; end if;
  if exists (select 1 from feedback_campaign_winners where campaign_id = p_campaign) then
    return null;   -- η κλήρωση έχει ήδη γίνει (idempotent)
  end if;

  -- Ένας νικητής ανά χρήστη (group by), τυχαία επιλογή από το pool.
  select user_id into v_winner
    from user_feedback
   where campaign_id = p_campaign and in_pool
   group by user_id
   order by random()
   limit 1;
  if v_winner is null then return null; end if;

  insert into feedback_campaign_winners(campaign_id, user_id) values (p_campaign, v_winner);

  -- Δώρο μέσω των υπαρχόντων comp πεδίων (bypass του lock_billing_plan: εδώ
  -- τρέχουμε ως definer/owner, όχι ως authenticated).
  insert into billing_profiles(user_id, comp_plan, comp_until, comp_started_at, comp_months_granted)
  values (v_winner, 'agency', now() + interval '12 months', now(), 12)
  on conflict (user_id) do update set
    comp_plan           = 'agency',
    comp_until          = greatest(coalesce(billing_profiles.comp_until, now()), now() + interval '12 months'),
    comp_started_at     = coalesce(billing_profiles.comp_started_at, now()),
    comp_months_granted = coalesce(billing_profiles.comp_months_granted, 0) + 12;

  return v_winner;
end; $$;

revoke all on function public.draw_feedback_winner(text) from public;
-- (Δεν δίνεται σε authenticated: μόνο backend/cron.)

-- ── Αυτόματη κλήρωση όταν κλείνει μια καμπάνια (ο περασμένος μήνας ήταν ο 3ος
--    ενεργός μήνας). Καλείται μηνιαία από pg_cron. ────────────────────────────
create or replace function public.draw_due_feedback_winners()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_last  timestamptz := date_trunc('month', now()) - interval '15 days';
  v_camp  text;
  v_phase int;
begin
  select campaign_id into v_camp from public.feedback_campaign(v_last);
  v_phase := ((extract(year from v_last)::int - 2026) * 12 + (extract(month from v_last)::int - 1))
             - floor(((extract(year from v_last)::int - 2026) * 12 + (extract(month from v_last)::int - 1))::numeric / 4)::int * 4;
  if v_phase = 2 then           -- τελευταίος ενεργός μήνας → η καμπάνια έκλεισε
    perform public.draw_feedback_winner(v_camp);
  end if;
end; $$;

revoke all on function public.draw_due_feedback_winners() from public;

-- ── Χρονοπρογραμματισμός κλήρωσης (μηνιαία, 1η ημέρα 03:00 UTC), αν υπάρχει pg_cron ─
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'feedback-draw-monthly') then
      perform cron.unschedule('feedback-draw-monthly');
    end if;
    perform cron.schedule('feedback-draw-monthly', '0 3 1 * *',
      $cron$ select public.draw_due_feedback_winners(); $cron$);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- Στοιχεία τιμολόγησης: προσθήκη VAT (VIES) για ενδοκοινοτικές συναλλαγές.
--
-- Για σωστό τιμολόγιο παροχής (διαδικτυακών) υπηρεσιών κατά το ελληνικό/ΕΕ
-- δίκαιο χρειάζεται, πέρα από ΑΦΜ/ΔΟΥ (πελάτης ΕΛ), ο κοινοτικός αριθμός VAT
-- (VIES) όταν ο πελάτης είναι επιχείρηση άλλης χώρας ΕΕ (αντιστροφή υποχρέωσης).
-- Η χώρα υπάρχει ήδη (billing_profiles.country, default 'GR'). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.billing_profiles
  add column if not exists vat_number text;   -- κοινοτικός VAT (VIES), για μη-ΕΛ επιχειρήσεις ΕΕ


-- ─────────────────────────────────────────────────────────────────────────
-- Αρίθμηση παραστατικών (OSS-ready) + σκελετός πίνακα εκδοθέντων παραστατικών.
--
-- Νόμιμη απαίτηση (ΑΑΔΕ/myDATA): μοναδικός, σειριακός, ΧΩΡΙΣ ΚΕΝΑ αριθμός ανά
-- σειρά και έτος. Η next_invoice_number αυξάνει ατομικά έναν μετρητή και
-- επιστρέφει τον επόμενο αριθμό — καλείται ΜΟΝΟ από το backend (service_role)
-- όταν το Stripe εκδίδει παραστατικό, ώστε να μη δημιουργούνται κενά.
--
-- Ο πίνακας invoices κρατά την ανάλυση ΦΠΑ ανά χώρα/καθεστώς (domestic / OSS /
-- reverse charge / εκτός ΕΕ), έτοιμος για δηλώσεις OSS. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- Μετρητής ανά σειρά/έτος (η εταιρεία μας είναι ο εκδότης → global, όχι ανά χρήστη).
create table if not exists public.invoice_counters (
  series  text   not null,
  year    int    not null,
  last_no bigint not null default 0,
  primary key (series, year)
);
alter table public.invoice_counters enable row level security;
-- (Χωρίς policies: πρόσβαση μόνο από backend/service_role.)

create or replace function public.next_invoice_number(p_series text, p_year int)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into invoice_counters(series, year, last_no)
  values (p_series, p_year, 1)
  on conflict (series, year)
    do update set last_no = invoice_counters.last_no + 1
  returning last_no into v;
  return v;
end; $$;

revoke all on function public.next_invoice_number(text, int) from public;
-- (Δεν δίνεται σε authenticated: την καλεί μόνο ο εκδότης-backend.)

-- Εκδοθέντα παραστατικά (γεμίζει από το Stripe webhook· τώρα μένει σκελετός).
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null,          -- π.χ. ΤΠΥ-2026-000123
  series        text not null,
  year          int  not null,
  user_id       uuid references auth.users(id) on delete set null,
  country       text,
  vat_treatment text,                           -- domestic | oss_b2c | reverse_charge | outside_eu
  currency      text default 'EUR',
  net           numeric(12,2),
  vat_pct       numeric(5,2),
  vat_amount    numeric(12,2),
  gross         numeric(12,2),
  stripe_ref    text,
  issued_at     timestamptz not null default now()
);
create index if not exists idx_invoices_user on public.invoices(user_id, issued_at desc);

alter table public.invoices enable row level security;
drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own" on public.invoices for select using (user_id = auth.uid());
-- (Εγγραφή μόνο από backend/service_role· ο χρήστης βλέπει μόνο τα δικά του.)


-- ─────────────────────────────────────────────────────────────────────────
-- Λίστα αναμονής για το Property OS Mobile. Όποιος πατήσει «Ειδοποίησέ με μόλις
-- βγει» καταγράφεται εδώ με το email του, ώστε στην κυκλοφορία της εφαρμογής να
-- του σταλεί πραγματικό ενημερωτικό email (μία φορά).
--
-- Καταγραφή μόνο μέσω RPC (SECURITY DEFINER): κρατάμε auth.uid() + το email από
-- τον πίνακα χρηστών (όχι από τον client, για να μη δηλωθεί ξένο email). Το πεδίο
-- notified_at αποτρέπει τη διπλή αποστολή στο launch. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mobile_waitlist (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);

alter table public.mobile_waitlist enable row level security;
drop policy if exists "mobile_waitlist_select_own" on public.mobile_waitlist;
create policy "mobile_waitlist_select_own" on public.mobile_waitlist for select using (user_id = auth.uid());
-- (Εγγραφή μόνο μέσω RPC· η αποστολή launch email γίνεται από backend/service_role.)

create or replace function public.join_mobile_waitlist()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then return; end if;
  select email into v_email from auth.users where id = v_uid;

  insert into mobile_waitlist(user_id, email) values (v_uid, v_email)
  on conflict (user_id) do update set email = excluded.email;

  -- Διατηρούμε και την ένδειξη wants_mobile (τη διαβάζει το UI για το «μπήκες»).
  insert into billing_profiles(user_id, wants_mobile) values (v_uid, true)
  on conflict (user_id) do update set wants_mobile = true;
end; $$;

revoke all on function public.join_mobile_waitlist() from public;
grant execute on function public.join_mobile_waitlist() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────
-- Έξοδος από τη λίστα αναμονής του Property OS Mobile. Αν ο χρήστης μετάνιωσε,
-- μπορεί να αφαιρεθεί· και να ξαναμπεί όποτε θέλει (join_mobile_waitlist).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.leave_mobile_waitlist()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  delete from mobile_waitlist where user_id = v_uid;
  update billing_profiles set wants_mobile = false where user_id = v_uid;
end; $$;

revoke all on function public.leave_mobile_waitlist() from public;
grant execute on function public.leave_mobile_waitlist() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ─── 20260720210000_activity_log.sql ───
-- Μητρώο δραστηριότητας (audit log): ποιος έκανε τι και πότε. Καταγράφει
-- ευαίσθητα γεγονότα λογαριασμού/ασφάλειας και ενέργειες διαχείρισης ομάδας.
--   • user_id  = η «σκηνή» στην οποία ανήκει το γεγονός (ατομικά = ο ίδιος).
--   • actor_id = ποιος πραγματικά το έκανε (auth.uid()).
-- Εγγραφή ΜΟΝΟ μέσω SECURITY DEFINER RPC (log_activity), με actor_id = auth.uid()
-- πάντα (δεν πλαστογραφείται ο δράστης). Ανάγνωση με RLS. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_user  on public.activity_log(user_id, created_at desc);
create index if not exists idx_activity_actor on public.activity_log(actor_id, created_at desc);

alter table public.activity_log enable row level security;
drop policy if exists "activity_select_own" on public.activity_log;
create policy "activity_select_own" on public.activity_log for select
  using (user_id = auth.uid() or actor_id = auth.uid());
-- (Καμία policy INSERT/UPDATE/DELETE: εγγραφή μόνο μέσω RPC.)

create or replace function public.log_activity(
  p_action text, p_entity text default null, p_entity_id text default null, p_metadata jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null or coalesce(p_action, '') = '' then return; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into activity_log(user_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (v_uid, v_uid, v_email, left(p_action, 60), left(p_entity, 40), left(p_entity_id, 100), coalesce(p_metadata, '{}'));
end; $$;

revoke all on function public.log_activity(text, text, text, jsonb) from public;
grant execute on function public.log_activity(text, text, text, jsonb) to authenticated;

create or replace function public.my_activity(p_limit int default 30)
returns setof public.activity_log language sql stable security definer set search_path = public as $$
  select * from activity_log
   where user_id = auth.uid() or actor_id = auth.uid()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

grant execute on function public.my_activity(int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- issued_documents — μητρώο επίσημων εγγράφων (true PDF) + δημόσια επαλήθευση.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.issued_documents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null,
  subject text not null default '',
  period text not null default '',
  issued_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  checksum text not null default ''
);
create index if not exists issued_documents_user_idx on public.issued_documents(user_id, issued_at desc);
alter table public.issued_documents enable row level security;
drop policy if exists own_issued_documents on public.issued_documents;
create policy own_issued_documents on public.issued_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.verify_document(p_id text)
returns table(id text, doc_type text, subject text, period text, issued_at timestamptz, issuer text)
language sql security definer stable set search_path = public as $$
  select d.id, d.doc_type, d.subject, d.period, d.issued_at,
         coalesce(nullif(btrim(b.company_name), ''), 'Property OS') as issuer
  from public.issued_documents d
  left join public.report_branding b on b.user_id = d.user_id and b.enabled = true
  where d.id = p_id;
$$;
revoke all on function public.verify_document(text) from public;
grant execute on function public.verify_document(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- email_campaigns / email_recipients — μαζική & αυτοματοποιημένη επικοινωνία με
-- πελάτες μέσω Resend (edge function: send-client-email).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  body_html text not null default '',
  kind text not null default 'broadcast',
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create table if not exists public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid,
  email text not null,
  name text,
  status text not null default 'pending',
  error text,
  resend_id text,
  sent_at timestamptz
);
create index if not exists email_campaigns_user_idx on public.email_campaigns(user_id, created_at desc);
create index if not exists email_recipients_camp_idx on public.email_recipients(campaign_id);
alter table public.email_campaigns enable row level security;
alter table public.email_recipients enable row level security;
drop policy if exists own_email_campaigns on public.email_campaigns;
create policy own_email_campaigns on public.email_campaigns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists own_email_recipients on public.email_recipients;
create policy own_email_recipients on public.email_recipients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Email marketing (newsletter «νέες δυνατότητες» + market digest, soft opt-in).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null, body_html text not null default '',
  cta_label text, cta_url text,
  published boolean not null default false, emailed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.product_updates enable row level security;
drop policy if exists read_published_updates on public.product_updates;
create policy read_published_updates on public.product_updates for select using (published = true);

create table if not exists public.email_marketing_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  product_news boolean not null default true, market_news boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid(), updated_at timestamptz not null default now()
);
create unique index if not exists email_marketing_prefs_token_idx on public.email_marketing_prefs(unsubscribe_token);
alter table public.email_marketing_prefs enable row level security;
drop policy if exists own_marketing_prefs on public.email_marketing_prefs;
create policy own_marketing_prefs on public.email_marketing_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.unsubscribe_email(p_token uuid, p_kind text default 'all')
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.email_marketing_prefs
     set product_news = case when p_kind in ('all','product') then false else product_news end,
         market_news  = case when p_kind in ('all','market')  then false else market_news  end,
         updated_at = now()
   where unsubscribe_token = p_token;
  get diagnostics n = row_count; return n > 0;
end $$;
revoke all on function public.unsubscribe_email(uuid, text) from public;
grant execute on function public.unsubscribe_email(uuid, text) to anon, authenticated;

create or replace function public.marketing_prefs_by_token(p_token uuid)
returns table(product_news boolean, market_news boolean)
language sql security definer stable set search_path = public as $$
  select product_news, market_news from public.email_marketing_prefs where unsubscribe_token = p_token;
$$;
revoke all on function public.marketing_prefs_by_token(uuid) from public;
grant execute on function public.marketing_prefs_by_token(uuid) to anon, authenticated;
