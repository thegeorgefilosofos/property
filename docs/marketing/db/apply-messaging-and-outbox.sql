-- ═══════════════════════════════════════════════════════════════════════════
-- Property OS · Email outbox + multichannel messaging — PASTE-READY SETUP
--
-- HOW TO USE: open Supabase → SQL Editor → New query → paste PART 1 → Run.
-- Then (only if pg_cron is enabled) paste PART 2 → Run. PART 3 is instructions.
--
-- Everything here is IDEMPOTENT (create ... if not exists / create or replace /
-- add column if not exists) so re-running is safe. NOTHING sends on its own:
-- sending needs the send-lifecycle-email edge function + a verified email domain
-- (RESEND_FROM) and, for phone channels, provider keys. Until then this is inert
-- schema. It mirrors migrations 20260721180000 / 20260722100000 / 20260722140000.
--
-- PREREQUISITES (already present in this project from earlier setup):
--   • a public.cron_secrets table with a row name='email_cron' (the shared secret
--     the crons/edge functions authenticate with);
--   • extensions pg_net (schema `net`) and pg_cron for PART 2.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — SCHEMA (safe to run now; no scheduling, nothing sends)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Outbox: every lifecycle/marketing email is enqueued here; a drain sends it.
create table if not exists public.email_outbox (
  id            bigint generated always as identity primary key,
  copy_id       text        not null,
  to_email      text        not null,
  to_name       text,
  params        jsonb       not null default '{}'::jsonb,
  category      text        not null default 'marketing',   -- marketing | transactional | operational
  priority      int         not null default 4,             -- 1 transactional … 5 soft
  send_window   text,                                       -- morning | midday | evening | late | immediate
  digest_group  text,
  dedup_key     text        unique,                         -- e.g. 'welcome:<user_id>' → never twice
  scheduled_for timestamptz not null default now(),
  status        text        not null default 'pending',     -- pending | sent | failed | skipped | deferred
  attempts      int         not null default 0,
  last_error    text,
  sent_at       timestamptz,
  channel       text,                                       -- which channel a delivery went out on (audit)
  created_at    timestamptz not null default now()
);
create index if not exists email_outbox_due_idx on public.email_outbox (status, scheduled_for);
create index if not exists email_outbox_recipient_idx on public.email_outbox (to_email, category, status);
alter table public.email_outbox enable row level security;   -- service_role only; no client access

-- 1b. Enqueue — idempotent insert (dedup_key makes it fire-once).
create or replace function public.enqueue_email(
  p_copy_id text, p_to_email text, p_to_name text default null,
  p_params jsonb default '{}'::jsonb, p_category text default 'marketing',
  p_dedup_key text default null, p_delay interval default '0'::interval
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

-- 1c. Frequency governance — max one marketing email per recipient / 3 days.
create or replace function public.can_send_marketing(p_to_email text)
returns boolean language sql stable as $$
  select coalesce(
    (select max(sent_at) from public.email_outbox
      where to_email = lower(trim(p_to_email)) and category = 'marketing' and status = 'sent')
      < now() - interval '3 days', true);
$$;

-- 1d. Drain — the cron calls this; fires send-lifecycle-email for each DUE + PLANNED
--     row (state gate: send_window set, or transactional). Safe to create even if
--     pg_net isn't installed yet (the body is only resolved at call time).
create or replace function public.drain_email_outbox(p_limit int default 100)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; v_secret text; v_sent int := 0;
  v_url text := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-lifecycle-email';
begin
  select secret into v_secret from public.cron_secrets where name = 'email_cron' limit 1;
  if v_secret is null then return 0; end if;   -- not configured yet → no-op
  for r in
    select * from public.email_outbox
     where status = 'pending' and scheduled_for <= now()
       and (send_window is not null or category = 'transactional')
     order by scheduled_for limit p_limit for update skip locked
  loop
    if r.category = 'marketing' and not public.can_send_marketing(r.to_email) then
      update public.email_outbox set status = 'skipped', last_error = 'frequency_cap' where id = r.id;
      continue;
    end if;
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body    := jsonb_build_object('copyId', r.copy_id, 'email', r.to_email, 'name', r.to_name, 'params', r.params));
    update public.email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

-- 1e. Per-user channel opt-ins. Email on by default; the rest opt-in, so a user
--     with no row is email-only. Includes wants_imessage (Apple Messages for Business).
create table if not exists public.messaging_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  wants_email    boolean not null default true,
  wants_push     boolean not null default false,
  wants_viber    boolean not null default false,
  wants_whatsapp boolean not null default false,
  wants_imessage boolean not null default false,
  phone_e164     text,                       -- E.164, π.χ. +3069...
  updated_at     timestamptz not null default now()
);
alter table public.messaging_prefs enable row level security;
drop policy if exists messaging_prefs_own on public.messaging_prefs;
create policy messaging_prefs_own on public.messaging_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1f. Push device tokens (web/mobile).
create table if not exists public.push_devices (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text,                           -- web | ios | android
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table public.push_devices enable row level security;
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1g. Single-flight lock so two overlapping scheduler runs never double-plan.
create or replace function public.try_email_schedule_lock() returns boolean
  language sql as $$ select pg_try_advisory_lock(hashtext('email-outbox-schedule')); $$;
create or replace function public.release_email_schedule_lock() returns void
  language sql as $$ select pg_advisory_unlock(hashtext('email-outbox-schedule')); $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — CRON (run ONLY after the edge functions are deployed AND pg_cron is
-- enabled: Database → Extensions → pg_cron. cron.schedule upserts by job name, so
-- re-running just updates the schedule.)
-- ─────────────────────────────────────────────────────────────────────────────

-- Plan first (apply cadence policy, stamp send_window), then drain (send planned
-- + transactional). The state gate makes the order of the two jobs irrelevant.
select cron.schedule('email-outbox-schedule', '*/5 * * * *', $job$
  select net.http_post(
    url     := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/schedule-email-outbox',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron' limit 1)),
    body    := '{}'::jsonb);
$job$);
select cron.schedule('email-outbox-drain', '*/5 * * * *', $job$ select public.drain_email_outbox(100); $job$);


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — WHAT'S LEFT (do outside the SQL editor)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Deploy the edge functions (Supabase CLI, from the repo root):
--      supabase functions deploy send-lifecycle-email  --no-verify-jwt
--      supabase functions deploy schedule-email-outbox --no-verify-jwt
--      supabase functions deploy dispatch-message       --no-verify-jwt
-- 2) Email go-live (unblocks everything): verify a sending domain and set RESEND_FROM
--    (e.g. no-reply@propertyos.gr). Until then the drain calls succeed but no mail
--    leaves — inert by design.
-- 3) Phone channels (optional, additive): set provider env on the project —
--      VIBER_TOKEN · WHATSAPP_TOKEN + WHATSAPP_PHONE_ID (Meta-approved po_<copyId>
--      templates) · IMESSAGE_API_URL + IMESSAGE_TOKEN · FCM_SERVER_KEY —
--    then point the drain at dispatch-message instead of send-lifecycle-email so
--    every delivery passes the one channel seam. Missing key → email fallback.
-- 4) Event triggers (enqueue-only, safe): see the commented templates at the end of
--    migration 20260721180000_email_automation_outbox.sql (on_user_created, receipt,
--    dunning, expiries). Enable after confirming the real table/column names.
-- ═══════════════════════════════════════════════════════════════════════════
