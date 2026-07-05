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
