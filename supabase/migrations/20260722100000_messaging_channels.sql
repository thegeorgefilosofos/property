-- ─────────────────────────────────────────────────────────────────────────────
-- Multichannel messaging — per-recipient opt-in, device tokens, and a
-- single-flight lock for the outbox scheduler.
--
-- Channel selection (messaging.ts) is already built; this is the DB surface it
-- needs. Nothing sends until provider keys exist (VIBER_TOKEN / WHATSAPP_* / a
-- push provider). Adding channels never adds volume — the cadence caps in
-- emailPolicy span all channels, and one delivery goes on exactly one channel.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Per-user channel preferences (opt-in). Email is on by default; the rest are
--    strictly opt-in, so with no row a user is email-only.
create table if not exists public.messaging_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  wants_email   boolean not null default true,
  wants_push    boolean not null default false,
  wants_viber   boolean not null default false,
  wants_whatsapp boolean not null default false,
  phone_e164    text,                      -- για Viber/WhatsApp (E.164, π.χ. +3069...)
  updated_at    timestamptz not null default now()
);
alter table public.messaging_prefs enable row level security;
-- Ο χρήστης διαχειρίζεται μόνο τις δικές του προτιμήσεις.
drop policy if exists messaging_prefs_own on public.messaging_prefs;
create policy messaging_prefs_own on public.messaging_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Push device tokens (web/mobile). One token per device.
create table if not exists public.push_devices (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text,                          -- web | ios | android
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table public.push_devices enable row level security;
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Optional audit: which channel a delivery actually went out on.
alter table public.email_outbox add column if not exists channel text;

-- 4. Single-flight lock for the scheduler — so two overlapping cron runs never
--    plan the same rows. schedule-email-outbox takes it at the start and releases
--    it at the end; a run that can't get it exits cleanly.
create or replace function public.try_email_schedule_lock() returns boolean
  language sql as $$ select pg_try_advisory_lock(hashtext('email-outbox-schedule')); $$;
create or replace function public.release_email_schedule_lock() returns void
  language sql as $$ select pg_advisory_unlock(hashtext('email-outbox-schedule')); $$;
