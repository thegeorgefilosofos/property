create table if not exists public.email_outbox (
  id bigint generated always as identity primary key,
  copy_id text not null,
  to_email text not null,
  to_name text,
  params jsonb not null default '{}'::jsonb,
  category text not null default 'marketing',
  priority int not null default 4,
  send_window text,
  digest_group text,
  dedup_key text unique,
  scheduled_for timestamptz not null default now(),
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  channel text,
  created_at timestamptz not null default now()
);
alter table public.email_outbox add column if not exists channel text;
alter table public.email_outbox add column if not exists priority int not null default 4;
alter table public.email_outbox add column if not exists send_window text;
alter table public.email_outbox add column if not exists digest_group text;
create index if not exists email_outbox_due_idx on public.email_outbox (status, scheduled_for);
create index if not exists email_outbox_recipient_idx on public.email_outbox (to_email, category, status);
alter table public.email_outbox enable row level security;

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

create or replace function public.can_send_marketing(p_to_email text)
returns boolean language sql stable as $$
  select coalesce(
    (select max(sent_at) from public.email_outbox
      where to_email = lower(trim(p_to_email)) and category = 'marketing' and status = 'sent')
      < now() - interval '3 days', true);
$$;

create or replace function public.drain_email_outbox(p_limit int default 100)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; v_secret text; v_sent int := 0;
  v_url text := 'https://aromvduuxtcrzmwwvnej.supabase.co/functions/v1/send-lifecycle-email';
begin
  select secret into v_secret from public.cron_secrets where name = 'email_cron' limit 1;
  if v_secret is null then return 0; end if;
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
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('copyId', r.copy_id, 'email', r.to_email, 'name', r.to_name, 'params', r.params));
    update public.email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = r.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end $$;

create table if not exists public.messaging_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wants_email boolean not null default true,
  wants_push boolean not null default false,
  wants_viber boolean not null default false,
  wants_whatsapp boolean not null default false,
  wants_imessage boolean not null default false,
  phone_e164 text,
  updated_at timestamptz not null default now()
);
alter table public.messaging_prefs add column if not exists wants_imessage boolean not null default false;
alter table public.messaging_prefs enable row level security;
drop policy if exists messaging_prefs_own on public.messaging_prefs;
create policy messaging_prefs_own on public.messaging_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.push_devices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table public.push_devices enable row level security;
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.try_email_schedule_lock() returns boolean
  language sql as $$ select pg_try_advisory_lock(hashtext('email-outbox-schedule')); $$;
create or replace function public.release_email_schedule_lock() returns void
  language sql as $$ select pg_advisory_unlock(hashtext('email-outbox-schedule')); $$;
