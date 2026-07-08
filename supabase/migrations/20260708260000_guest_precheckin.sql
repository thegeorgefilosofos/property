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
  created_at   timestamptz default now()
);
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

create or replace function public.submit_checkin(
  p_token text, p_full_name text, p_id_number text, p_nationality text,
  p_birth_date text, p_phone text, p_email text, p_arrival_date text,
  p_guests integer, p_accepts boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record;
begin
  select * into v_link from checkin_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_full_name), '') = '' then return false; end if;
  insert into guest_checkins(token, user_id, client_id, property_id, full_name, id_number, nationality, birth_date, phone, email, arrival_date, guests_count, accepts_rules)
    values (p_token, v_link.user_id, v_link.client_id, v_link.property_id, left(p_full_name,160), left(p_id_number,60),
            left(p_nationality,60), nullif(p_birth_date,'')::date, left(p_phone,40), left(p_email,160),
            nullif(p_arrival_date,'')::date, p_guests, coalesce(p_accepts,false));
  return true;
end; $$;
grant execute on function public.submit_checkin(text,text,text,text,text,text,text,text,integer,boolean) to anon, authenticated;
