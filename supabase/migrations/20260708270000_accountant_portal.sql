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
