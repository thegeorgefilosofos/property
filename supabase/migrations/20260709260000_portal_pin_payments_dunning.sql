-- ═══════════════════════════════════════════════════════════════════════════
-- Πύλη ενοικιαστή: PIN προστασία, σύνδεσμος πληρωμής ιδιοκτήτη, φωτογραφίες +
-- ανάθεση σε συνεργείο στα αιτήματα βλάβης, και ρυθμίσεις dunning ανά ιδιοκτήτη.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- portal_links: PIN (κρυπτογραφημένο) + σύνδεσμος πληρωμής ιδιοκτήτη.
alter table public.portal_links add column if not exists pin_hash     text;
alter table public.portal_links add column if not exists payment_link text;

-- maintenance_requests: φωτογραφίες + ανάθεση σε συνεργείο.
alter table public.maintenance_requests add column if not exists photos           jsonb default '[]'::jsonb;
alter table public.maintenance_requests add column if not exists assignee_name    text;
alter table public.maintenance_requests add column if not exists assignee_contact text;

-- notification_preferences: ρυθμίσεις dunning (create-if-not-exists αμυντικά).
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

-- Storage bucket για φωτογραφίες βλαβών (public read· ανέβασμα από την πύλη με anon).
insert into storage.buckets (id, name, public) values ('maintenance-photos', 'maintenance-photos', true)
  on conflict (id) do nothing;
drop policy if exists "maint_photos_insert" on storage.objects;
create policy "maint_photos_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'maintenance-photos');
drop policy if exists "maint_photos_read" on storage.objects;
create policy "maint_photos_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'maintenance-photos');

-- ── RPC: metadata πύλης — ώστε η πύλη να γνωρίζει αν απαιτείται PIN, χωρίς
--    διαρροή δεδομένων προτού δοθεί ο κωδικός. ──────────────────────────────────
create or replace function public.portal_meta(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_link record;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return json_build_object('found', false, 'pin_required', false); end if;
  return json_build_object('found', true, 'pin_required', v_link.pin_hash is not null);
end; $$;
grant execute on function public.portal_meta(text) to anon, authenticated;

-- ── RPC: ο ιδιοκτήτης ορίζει/καθαρίζει PIN πύλης (authenticated, κατοχή link). ──
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

-- ── RPC: δεδομένα πύλης v3 — προαιρετικό PIN + σύνδεσμος πληρωμής. ──────────────
drop function if exists public.get_portal_data(text);
create or replace function public.get_portal_data(p_token text, p_pin text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric;
begin
  select * into v_link from portal_links where token = p_token and active = true;
  if not found then return null; end if;
  -- Αν έχει οριστεί PIN, απαιτείται σωστός κωδικός· αλλιώς επιστρέφει «κλειδωμένο».
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

-- ── RPC: αίτημα βλάβης με φωτογραφίες (ίδια λογική, +παράμετρος p_photos). ──────
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
