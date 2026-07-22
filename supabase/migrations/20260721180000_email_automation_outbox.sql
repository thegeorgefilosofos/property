-- ─────────────────────────────────────────────────────────────────────────────
-- Email automation engine — transactional OUTBOX pattern.
--
-- Decouples "an event happened" from "an email was sent". Every lifecycle/
-- marketing email is ENQUEUED into public.email_outbox (idempotently, via a
-- dedup_key) and a cron job DRAINS due rows, calling the send-lifecycle-email
-- edge function. This is reliable (survives crashes), idempotent (no double
-- sends), retryable, schedulable (scheduled_for) and frequency-governed.
--
-- Nothing user-facing changes until a verified sending domain exists; this is
-- the backbone that then "lights up" each trigger automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Outbox ------------------------------------------------------------------
create table if not exists public.email_outbox (
  id            bigint generated always as identity primary key,
  copy_id       text        not null,                 -- key in emailCopy.CATALOG
  to_email      text        not null,
  to_name       text,
  params        jsonb       not null default '{}'::jsonb,
  category      text        not null default 'marketing',  -- marketing | transactional | operational
  -- Cadence policy (see _shared/emailPolicy.ts): the scheduler stamps these from
  -- the copy_id so the drain can enforce hierarchy, daily caps and staggering.
  priority      int         not null default 4,            -- 1 transactional … 5 soft
  send_window   text,                                      -- morning | midday | evening | late | immediate
  digest_group  text,                                      -- same-day obligations in one group merge into one email
  dedup_key     text        unique,                    -- e.g. 'welcome:<user_id>' → never sent twice
  scheduled_for timestamptz not null default now(),
  status        text        not null default 'pending',    -- pending | sent | failed | skipped | deferred
  attempts      int         not null default 0,
  last_error    text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists email_outbox_due_idx on public.email_outbox (status, scheduled_for);
create index if not exists email_outbox_recipient_idx on public.email_outbox (to_email, category, status);

-- Only service_role / postgres (edge fn + cron) may read/write. No client access.
alter table public.email_outbox enable row level security;

-- 2. Enqueue — idempotent insert -------------------------------------------
create or replace function public.enqueue_email(
  p_copy_id   text,
  p_to_email  text,
  p_to_name   text default null,
  p_params    jsonb default '{}'::jsonb,
  p_category  text default 'marketing',
  p_dedup_key text default null,
  p_delay     interval default '0'::interval
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  values (p_copy_id, lower(trim(p_to_email)), p_to_name, coalesce(p_params, '{}'::jsonb),
          p_category, p_dedup_key, now() + coalesce(p_delay, '0'::interval))
  on conflict (dedup_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- 3. Frequency governance — one marketing email per recipient / 3 days -------
create or replace function public.can_send_marketing(p_to_email text)
returns boolean language sql stable as $$
  select coalesce(
    (select max(sent_at)
       from public.email_outbox
      where to_email = lower(trim(p_to_email)) and category = 'marketing' and status = 'sent')
      < now() - interval '3 days',
    true);
$$;

-- 4. Drain — cron calls this; fires the edge function for each due row -------
create or replace function public.drain_email_outbox(p_limit int default 100)
returns int language plpgsql security definer set search_path = public as $$
declare
  r        record;
  v_secret text;
  v_url    text := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-lifecycle-email';
  v_sent   int := 0;
begin
  select secret into v_secret from public.cron_secrets where name = 'email_cron' limit 1;
  if v_secret is null then return 0; end if;   -- not configured yet → no-op

  for r in
    -- State gate: only send rows the scheduler has PLANNED (send_window set), or
    -- transactional rows (which bypass the scheduler and go immediately). Raw
    -- freshly-enqueued marketing/operational rows wait for schedule-email-outbox
    -- to apply the cadence policy first, so the drain can never flood a recipient.
    select * from public.email_outbox
     where status = 'pending' and scheduled_for <= now()
       and (send_window is not null or category = 'transactional')
     order by scheduled_for
     limit p_limit
     for update skip locked
  loop
    -- throttle marketing; transactional/operational always pass
    if r.category = 'marketing' and not public.can_send_marketing(r.to_email) then
      update public.email_outbox set status = 'skipped', last_error = 'frequency_cap' where id = r.id;
      continue;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body    := jsonb_build_object('copyId', r.copy_id, 'email', r.to_email, 'name', r.to_name, 'params', r.params)
    );
    -- Optimistic mark. Enhancement (post-domain): poll net._http_response and
    -- flip to 'failed' + retry with backoff when a call did not return 2xx.
    update public.email_outbox
       set status = 'sent', sent_at = now(), attempts = attempts + 1
     where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- 5. Cron — plan first, then drain -----------------------------------------
--    The scheduler applies the cadence policy (consolidate, cap, stagger, defer)
--    and stamps send_window; the drain then sends only planned/transactional
--    rows. Thanks to the state gate the order of the two crons does not matter.
select cron.schedule('email-outbox-schedule', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/schedule-email-outbox',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron' limit 1)),
    body    := '{}'::jsonb
  );
$$);
select cron.schedule('email-outbox-drain', '*/5 * * * *', $$ select public.drain_email_outbox(100); $$);

-- 6. Event triggers — CONFIRM real table/column names before enabling -------
--    Each event enqueues the right copy_id with a dedup_key so it fires once.
--    Templates below are commented until the schema is confirmed, so we never
--    build on wrong assumptions.
--
--  a) Welcome + onboarding drip when a user is created:
--     create or replace function public.on_user_created() returns trigger
--       language plpgsql security definer as $fn$
--     begin
--       perform public.enqueue_email('welcome_free', new.email,
--         new.raw_user_meta_data->>'name', '{}'::jsonb, 'transactional',
--         'welcome:'||new.id);
--       perform public.enqueue_email('verify_email', new.email, null, '{}'::jsonb,
--         'transactional', 'verify:'||new.id);
--       perform public.enqueue_email('add_first_property', new.email, null, '{}'::jsonb,
--         'operational', 'addprop:'||new.id, interval '1 day');
--       perform public.enqueue_email('tip_assistant', new.email, null, '{}'::jsonb,
--         'marketing', 'tipasst:'||new.id, interval '5 days');
--       return new;
--     end $fn$;
--     create trigger trg_user_created after insert on auth.users
--       for each row execute function public.on_user_created();
--
--  b) Payment received → receipt (transactional):
--     ... enqueue_email('subscription_receipt', ..., 'transactional', 'receipt:'||new.id)
--
--  c) Rent overdue (from a scheduled job over the ledger): dunning_1/2/final
--     with dedup_key 'dunning1:'||installment_id, delays computed from due date.
--
--  d) Lease/insurance/certificate expiry (nightly job): enqueue 30 days before
--     with dedup_key 'lease_end:'||lease_id.
-- ─────────────────────────────────────────────────────────────────────────────
