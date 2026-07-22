-- ═══════════════════════════════════════════════════════════════════════════
-- Email activation · adversarial-review fixes (pre-activation hardening).
--
-- Four fixes from the review of the two prior activation migrations, applied as
-- a fresh migration so they validate on staging before reaching production:
--
--   HIGH  Stale-expiry keyed off the wrong column. schedule-email-outbox
--         REWRITES scheduled_for when it plans a row, so in the dormant posture
--         (scheduler deployed only at go-live) the whole backlog would be
--         planned with scheduled_for=today on activation day and sent late
--         (a Black-Friday blast in January). Expire on created_at — the true
--         enqueue time — which the scheduler never touches.
--   MED   Onboarding drip was keyed to signup date but the audience is gated on
--         email confirmation. A user who confirms on day 4+ aged out of every
--         window and got no welcome/onboarding ever. Key the windows off
--         days-since-confirmation instead.
--   MED   The September "vacant nudge" targeted status_detail='vacant', which is
--         also the column DEFAULT (so it hit never-configured — incl. occupied —
--         properties), and sent rent_benchmark_alert whose comparison only
--         renders with both amount+marketRent (we passed only marketRent → dead
--         copy). Removed until it has precise targeting + a purpose-built email.
--   LOW   set_emails_live() had no explicit service_role grant, so the future
--         in-app toggle path was privilege-fragile. Grant it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── LOW: let the service role flip the master switch (app/Settings path). ────
grant execute on function public.set_emails_live(boolean) to service_role;

-- ── HIGH: expire on the real enqueue time, not the scheduler-rewritten one. ──
create or replace function public.drain_email_outbox(p_limit integer default 100)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare
  r        record;
  v_secret text;
  v_live   boolean := coalesce(
              (select secret = '1' from public.cron_secrets where name = 'emails_live' limit 1),
              false);
  v_base   text := coalesce(
              (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
              'https://aromvduuxtcrzmwwvnej.supabase.co');
  v_url    text := v_base || '/functions/v1/send-lifecycle-email';
  v_sent   int := 0;
begin
  select secret into v_secret from public.cron_secrets where name = 'email_cron' limit 1;
  if v_secret is null then return 0; end if;

  for r in
    select * from public.email_outbox
     where status = 'pending' and scheduled_for <= now()
       and (send_window is not null or category = 'transactional')
     order by scheduled_for
     limit p_limit
     for update skip locked
  loop
    -- Guard 2 (fixed): stale by ORIGINAL enqueue time (created_at), which the
    -- scheduler never rewrites — so a backlog accumulated while dormant expires
    -- instead of flushing on activation day.
    if r.category <> 'transactional' and r.created_at < now() - interval '2 days' then
      update public.email_outbox set status = 'expired', last_error = 'stale' where id = r.id;
      continue;
    end if;

    -- Guard 1: master switch. Non-transactional holds until emails_live='1'.
    if r.category <> 'transactional' and not v_live then
      continue;
    end if;

    if r.category = 'marketing' and not public.can_send_marketing(r.to_email) then
      update public.email_outbox set status = 'skipped', last_error = 'frequency_cap' where id = r.id;
      continue;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body    := jsonb_build_object('copyId', r.copy_id, 'email', r.to_email, 'name', r.to_name, 'params', r.params)
    );
    update public.email_outbox
       set status = 'sent', sent_at = now(), attempts = attempts + 1
     where id = r.id;
    v_sent := v_sent + 1;
  end loop;

  return v_sent;
end;
$$;

-- ── MED×2: onboarding keyed to confirmation; September segment removed. ──────
create or replace function public.lifecycle_enqueue()
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_before bigint;
  v_after  bigint;
  v_year   text := to_char(now(), 'YYYY');
  v_month  int  := extract(month from now())::int;
  v_day    int  := extract(day   from now())::int;
begin
  select count(*) into v_before from public.email_outbox;

  drop table if exists _aud;
  create temporary table _aud on commit drop as
  select u.id::uuid                                   as uid,
         lower(trim(u.email))                         as email,
         coalesce(nullif(trim(bp.owner_name), ''),
                  nullif(trim(bp.full_name), ''))     as name,
         case when bp.plan in ('individual','professional') then bp.plan else 'free' end as plan,
         u.created_at                                 as signup,
         (current_date - u.created_at::date)          as age_days,
         (current_date - u.email_confirmed_at::date)  as conf_days   -- days since confirmation
    from auth.users u
    left join public.billing_profiles bp on bp.user_id = u.id
   where u.email is not null and trim(u.email) <> ''
     and u.email_confirmed_at is not null
     and u.deleted_at is null;

  -- ── 1) Onboarding drip (keyed to days-since-CONFIRMATION) ─────────────────
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'welcome_'||a.plan, a.email, a.name,
         jsonb_build_object('plan', a.plan, 'name', a.name),
         'marketing', 'welcome:'||a.uid, now()
    from _aud a
   where a.conf_days between 0 and 2
  on conflict (dedup_key) do nothing;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'add_first_property', a.email, a.name,
         jsonb_build_object('name', a.name, 'plan', a.plan),
         'marketing', 'add_first_property:'||a.uid, now()
    from _aud a
    left join public.onboarding_progress op on op.user_id = a.uid
   where a.conf_days between 2 and 6
     and coalesce(op.first_property, false) = false
  on conflict (dedup_key) do nothing;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'first_property_success', a.email, a.name,
         jsonb_build_object('name', a.name, 'propertyName', p.name),
         'marketing', 'first_property_success:'||a.uid, now()
    from _aud a
    join lateral (
      select name, created_at from public.user_properties
       where user_id = a.uid order by created_at asc limit 1
    ) p on true
   where p.created_at >= now() - interval '2 days'
  on conflict (dedup_key) do nothing;

  -- ── 2) Obligations / expiry (operational) ─────────────────────────────────
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'lease_ending', a.email, a.name,
         jsonb_build_object('propertyName', pr.name,
                            'leaseEndDate', to_char(t.lease_end, 'DD/MM/YYYY')),
         'operational', 'lease_ending:'||t.id||':'||to_char(t.lease_end,'YYYYMMDD'), now()
    from public.tenants t
    join _aud a on a.uid = t.user_id
    left join public.user_properties pr on pr.id = t.property_id
   where t.lease_end is not null
     and t.lease_end between current_date and current_date + 30
     and coalesce(t.status, 'active') not in ('ended', 'moved_out')
  on conflict (dedup_key) do nothing;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'insurance_expiring', a.email, a.name,
         jsonb_build_object('propertyName', p.name, 'insurerName', p.insurance_company,
                            'policyEndDate', to_char(p.insurance_expiry, 'DD/MM/YYYY')),
         'operational', 'insurance_expiring:'||p.id||':'||to_char(p.insurance_expiry,'YYYYMMDD'), now()
    from public.user_properties p
    join _aud a on a.uid = p.user_id
   where p.insurance_expiry between current_date and current_date + 30
  on conflict (dedup_key) do nothing;

  -- ── 3) Seasonality (one per user per season; September segment removed) ────
  if v_month = 11 and v_day between 20 and 30 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'black_friday', a.email, a.name, jsonb_build_object('name', a.name, 'plan', a.plan),
           'marketing', 'black_friday:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  if v_month = 12 and v_day between 15 and 26 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'christmas', a.email, a.name, jsonb_build_object('name', a.name),
           'marketing', 'christmas:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  if v_month between 3 and 5 and v_day between 1 and 10 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'tax_season', a.email, a.name, jsonb_build_object('name', a.name, 'plan', a.plan),
           'marketing', 'tax_season:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  if v_month = 5 and v_day between 1 and 10 then
    insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
    select 'summer_str', a.email, a.name, jsonb_build_object('name', a.name),
           'marketing', 'summer_str:'||a.uid||':'||v_year, now()
      from _aud a
    on conflict (dedup_key) do nothing;
  end if;

  -- ── 4) Tenure / growth ────────────────────────────────────────────────────
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'anniversary', a.email, a.name,
         jsonb_build_object('name', a.name, 'anniversaryYears', (a.age_days / 365)),
         'marketing', 'anniversary:'||a.uid||':'||(a.age_days / 365)::text, now()
    from _aud a
   where a.age_days >= 365 and (a.age_days % 365) < 2
  on conflict (dedup_key) do nothing;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'referral_reminder', a.email, a.name,
         jsonb_build_object('name', a.name, 'referralCode', rc.code, 'plan', a.plan),
         'marketing', 'referral_reminder:'||a.uid||':'||to_char(now(),'YYYY-Q'), now()
    from _aud a
    join public.referral_codes rc on rc.user_id = a.uid
   where a.age_days > 30
     and not exists (
       select 1 from public.referrals r
        where r.referrer_user_id = a.uid and r.activated_at is not null
     )
  on conflict (dedup_key) do nothing;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'upsell_to_individual', a.email, a.name,
         jsonb_build_object('name', a.name, 'properties', pc.n, 'toPlan', 'individual'),
         'marketing', 'upsell_individual:'||a.uid||':'||to_char(now(),'YYYY-Q'), now()
    from _aud a
    join lateral (
      select count(*)::int as n from public.user_properties where user_id = a.uid
    ) pc on true
   where a.plan = 'free' and pc.n >= 2
  on conflict (dedup_key) do nothing;

  select count(*) into v_after from public.email_outbox;
  return (v_after - v_before)::int;
end;
$$;

revoke all on function public.lifecycle_enqueue() from public, anon, authenticated;
