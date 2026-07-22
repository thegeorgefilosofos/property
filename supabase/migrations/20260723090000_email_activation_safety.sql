-- ═══════════════════════════════════════════════════════════════════════════
-- Email activation · safety switch (enables the lifecycle-enqueue engine safely).
--
-- The lifecycle catalog is now wired to real events/seasonality (see the
-- `lifecycle-enqueue` edge function). Before any of that can reach a real
-- customer we add two guards to the drain so activation is inert until the
-- owner deliberately turns it on AFTER verifying the sending domain:
--
--   1. MASTER SWITCH `emails_live`. Until cron_secrets has emails_live='1',
--      ONLY category='transactional' rows are sent. Marketing/operational rows
--      wait as 'pending'. Flip it on (one row) once RESEND_FROM points at a
--      verified domain — the queue then flows, metered by the existing caps.
--   2. STALE EXPIRY. A row whose scheduled_for is older than 2 days is marked
--      'expired' instead of sent, so a backlog built up while the switch was
--      off can never flood recipients late with irrelevant messages.
--
-- Idempotent CREATE OR REPLACE; keeps the env-safe URL from the prior migration.
-- ═══════════════════════════════════════════════════════════════════════════

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
  if v_secret is null then return 0; end if;   -- not configured yet → no-op

  for r in
    select * from public.email_outbox
     where status = 'pending' and scheduled_for <= now()
       and (send_window is not null or category = 'transactional')
     order by scheduled_for
     limit p_limit
     for update skip locked
  loop
    -- Guard 2: never send a stale row (queued long ago, now irrelevant).
    if r.category <> 'transactional' and r.scheduled_for < now() - interval '2 days' then
      update public.email_outbox set status = 'expired', last_error = 'stale' where id = r.id;
      continue;
    end if;

    -- Guard 1: master switch. Non-transactional email holds until emails_live='1'.
    if r.category <> 'transactional' and not v_live then
      continue;  -- stays 'pending'; flows once the owner turns activation on
    end if;

    -- Existing per-recipient marketing frequency cap.
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

-- Helper the owner (or a future Settings toggle) calls to flip activation on/off.
-- SECURITY DEFINER + service_role-only; writes the single control row.
create or replace function public.set_emails_live(p_on boolean)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  insert into public.cron_secrets (name, secret)
  values ('emails_live', case when p_on then '1' else '0' end)
  on conflict (name) do update set secret = excluded.secret;
end;
$$;

revoke all on function public.set_emails_live(boolean) from public, anon, authenticated;
