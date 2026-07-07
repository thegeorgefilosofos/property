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
  distance      text        default '',
  condition     text        default 'good',   -- new | renovated | good | average | needs_work
  source        text        default 'spitogatos',
  url           text        default '',
  notes         text        default '',
  created_at    timestamptz default now()
);

create index if not exists rent_comparables_property_idx on public.rent_comparables(property_id);

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


-- ─── 20260707140000_property_atak.sql ───
-- Αριθμός Ταυτότητας Ακινήτου (ΑΤΑΚ) ανά ακίνητο — απαραίτητος για την
-- Αναλυτική Κατάσταση Ε2. Idempotent· το RLS του user_properties ισχύει ήδη.
alter table public.user_properties add column if not exists atak text;
