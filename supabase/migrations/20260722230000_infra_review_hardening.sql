-- ═══════════════════════════════════════════════════════════════════════════
-- Infra-review hardening (2026-07 audit follow-through).
--
-- Three fixes, all bookkeeping/logic only — no data touched:
--   1. Env-safe function URLs. The scheduler jobs and drain_email_outbox() had
--      the PRODUCTION project URL baked in as a literal. On a fresh (staging)
--      rebuild that pointed the drain + 5 cron jobs at production. We switch them
--      to derive the base URL from vault (`functions_base_url`), falling back to
--      the current production host when that secret is absent — so production is
--      byte-for-byte unchanged (no secret set ⇒ same URL as before), while a
--      staging project that sets `functions_base_url` in its vault gets its own.
--   2. drain_email_outbox() uses the same env-safe URL.
--   3. Lock down the feedback-draw functions: they are SECURITY DEFINER prize
--      draws with no caller guard, yet pg_dump had granted EXECUTE to anon/
--      authenticated. Revoke both — only the cron (service_role) may draw.
--
-- Idempotent: safe to re-run. The cron block no-ops on a project without pg_cron.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 3) Revoke public reachability of the prize-draw functions ────────────────
revoke execute on function public.draw_due_feedback_winners()   from anon, authenticated;
revoke execute on function public.draw_feedback_winner(text)     from anon, authenticated;

-- ── 2) Env-safe drain: resolve the base URL at runtime, prod-safe fallback ───
create or replace function public.drain_email_outbox(p_limit integer default 100)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare
  r        record;
  v_secret text;
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

-- ── 1) Env-safe (re)scheduling of the jobs that had a hardcoded prod URL ─────
-- Only touches the 5 previously-hardcoded jobs; the two vault-driven jobs
-- (market-data, bank-rates) and the drain/feedback jobs are left as they are.
do $$
declare
  v_base text := coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'functions_base_url'),
    'https://aromvduuxtcrzmwwvnej.supabase.co');
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;  -- no scheduler on this project yet; nothing to do
  end if;

  -- send-reminders-daily — 06:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-reminders-daily') then perform cron.unschedule('send-reminders-daily'); end if;
  perform cron.schedule('send-reminders-daily', '0 6 * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-reminders'));

  -- send-newsletter-weekly — Tue 08:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-newsletter-weekly') then perform cron.unschedule('send-newsletter-weekly'); end if;
  perform cron.schedule('send-newsletter-weekly', '0 8 * * 2', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-newsletter'));

  -- send-market-digest-weekly — Mon 07:00 UTC
  if exists (select 1 from cron.job where jobname = 'send-market-digest-weekly') then perform cron.unschedule('send-market-digest-weekly'); end if;
  perform cron.schedule('send-market-digest-weekly', '0 7 * * 1', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-market-digest'));

  -- send-monthly-statements — 1st @ 07:30 UTC
  if exists (select 1 from cron.job where jobname = 'send-monthly-statements') then perform cron.unschedule('send-monthly-statements'); end if;
  perform cron.schedule('send-monthly-statements', '30 7 1 * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron')),
      body    := '{}'::jsonb, timeout_milliseconds := 120000);
  $cron$, v_base || '/functions/v1/send-monthly-statements'));

  -- email-outbox-schedule — every 5 minutes
  if exists (select 1 from cron.job where jobname = 'email-outbox-schedule') then perform cron.unschedule('email-outbox-schedule'); end if;
  perform cron.schedule('email-outbox-schedule', '*/5 * * * *', format($cron$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object('Content-Type','application/json',
                   'x-cron-secret', (select secret from public.cron_secrets where name = 'email_cron' limit 1)),
      body    := '{}'::jsonb);
  $cron$, v_base || '/functions/v1/schedule-email-outbox'));
end $$;
