-- ═══════════════════════════════════════════════════════════════════════════
-- Portal PIN brute-force protection (server-side rate limiting)
--
-- The tenant portal is reachable by anyone holding the (122-bit) capability
-- token; owners can additionally set a short numeric PIN. A 4–6 digit PIN is
-- brute-forceable (≤ 1e6 tries) by a token holder, and get_portal_data() had no
-- throttle. This adds a per-token failed-attempt ledger and locks the PIN check
-- after 5 failures in a rolling 15-minute window. Free, no external dependency.
--
-- The ledger is written ONLY by the SECURITY DEFINER function (which owns the
-- rows); it is never exposed to anon/authenticated directly, and it self-prunes
-- so it stays tiny.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.portal_pin_attempts (
  id           bigserial primary key,
  token        text        not null,
  attempted_at timestamptz not null default now(),
  success      boolean     not null default false
);

create index if not exists idx_portal_pin_attempts_token_time
  on public.portal_pin_attempts (token, attempted_at desc);

alter table public.portal_pin_attempts enable row level security;
-- No policies: only the SECURITY DEFINER RPCs touch this table. Lock out direct access.
revoke all on table public.portal_pin_attempts from anon, authenticated;

-- Recreate get_portal_data with rate limiting layered onto the existing logic
-- (token+expiry validation and the bcrypt PIN check are unchanged).
create or replace function public.get_portal_data(p_token text, p_pin text default null)
returns json language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric; v_fails int;
begin
  select * into v_link from portal_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return null; end if;

  if v_link.pin_hash is not null then
    -- keep the ledger bounded: drop this token's stale rows first
    delete from portal_pin_attempts where token = p_token and attempted_at < now() - interval '1 day';

    -- rolling-window throttle: 5 failures / 15 min → locked (no further attempts recorded)
    select count(*) into v_fails
      from portal_pin_attempts
      where token = p_token and success = false and attempted_at > now() - interval '15 minutes';
    if v_fails >= 5 then
      return json_build_object('locked', true, 'rate_limited', true);
    end if;

    if p_pin is null or crypt(p_pin, v_link.pin_hash) <> v_link.pin_hash then
      -- record only real PIN submissions (a null pin is just the lock-screen probe)
      if p_pin is not null then
        insert into portal_pin_attempts(token, success) values (p_token, false);
      end if;
      return json_build_object('locked', true);
    end if;

    -- correct PIN: clear this token's failures
    delete from portal_pin_attempts where token = p_token;
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
