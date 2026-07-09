-- ═══════════════════════════════════════════════════════════════════════════
-- Ενοικιαστές — σύνδεση υπηρεσιών με το καθολικό, τύπος επίπλωσης, αίτημα
-- πληρωμής, δήλωση πληρωμής από ενοικιαστή, και αιτήματα βλάβης δεμένα με τον
-- ενοικιαστή. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- Τύπος επίπλωσης: καθορίζει ποιες ενότητες υπηρεσιών εμφανίζονται.
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
