-- ═══════════════════════════════════════════════════════════════════════════
-- Durable, cross-instance rate limiting for the Anthropic AI proxy.
--
-- app/api/anthropic/route.tsx caps requests/minute and /day, but the counters
-- were in-memory Maps — on Vercel serverless each instance has its own memory, so
-- the cap was trivially bypassable by spreading requests across instances, letting
-- a logged-in user run up the shared ANTHROPIC_API_KEY bill. This moves the counter
-- into Postgres via one atomic upsert RPC (free, no Redis).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_usage (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  minute_bucket timestamptz not null,
  minute_count  integer     not null default 0,
  day           date        not null,
  day_count     integer     not null default 0,
  updated_at    timestamptz not null default now()
);

alter table public.ai_usage enable row level security;
-- Only the SECURITY DEFINER RPC below touches this table.
revoke all on table public.ai_usage from anon, authenticated;

-- Atomically bump the caller's minute+day counters and report whether the request
-- is within the caps. One statement, so it is race-free across concurrent instances.
create or replace function public.bump_ai_usage(p_max_min integer, p_max_day integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_min timestamptz := date_trunc('minute', v_now);
  v_day date := (v_now at time zone 'utc')::date;
  v_minc integer; v_dayc integer;
begin
  if v_uid is null then
    return json_build_object('allowed', false, 'reason', 'auth');
  end if;

  insert into public.ai_usage (user_id, minute_bucket, minute_count, day, day_count, updated_at)
    values (v_uid, v_min, 1, v_day, 1, v_now)
  on conflict (user_id) do update set
    minute_count  = case when public.ai_usage.minute_bucket = v_min then public.ai_usage.minute_count + 1 else 1 end,
    minute_bucket = v_min,
    day_count     = case when public.ai_usage.day = v_day then public.ai_usage.day_count + 1 else 1 end,
    day           = v_day,
    updated_at    = v_now
  returning minute_count, day_count into v_minc, v_dayc;

  if v_dayc > p_max_day then
    return json_build_object('allowed', false, 'reason', 'day');
  end if;
  if v_minc > p_max_min then
    return json_build_object('allowed', false, 'reason', 'minute');
  end if;
  return json_build_object('allowed', true, 'minute', v_minc, 'day', v_dayc);
end; $$;

revoke all on function public.bump_ai_usage(integer, integer) from public, anon;
grant execute on function public.bump_ai_usage(integer, integer) to authenticated;
