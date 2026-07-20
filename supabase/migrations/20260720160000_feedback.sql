-- ─────────────────────────────────────────────────────────────────────────
-- Επώνυμο feedback χρηστών (μία φορά ανά μήνα) + κληρωτίδα δωρεάν συνδρομής.
--
-- Στόχος: πελατοκεντρική βελτίωση. Ο χρήστης γράφει τι θα ήθελε καλύτερο στα
-- εργαλεία, στον βοηθό ή οπουδήποτε αλλού. Για να είναι ουσιαστικό:
--   • ελάχιστο όριο πραγματικών λέξεων (όχι μόνο αριθμοί/σύμβολα),
--   • μία υποβολή ανά ημερολογιακό μήνα,
--   • επώνυμο (κρατάμε το email του χρήστη).
--
-- Κίνητρο (καμπάνια): το εποικοδομητικό feedback μπαίνει σε κληρωτίδα για μία
-- δωρεάν ετήσια συνδρομή «Επαγγελματίας». Η καμπάνια τρέχει σε κύκλο 3 μηνών
-- ΕΝΕΡΓΗ + 1 μήνα ΠΑΥΣΗ (= 3 κληρώσεις/έτος). Ο κύκλος και η κλήρωση είναι
-- πλήρως αυτόματα (backend/pg_cron)· ο χρήστης δεν χρειάζεται να τα ξέρει.
--
-- Ασφάλεια: καμία απευθείας εγγραφή από client· μόνο μέσω submit_feedback
-- (SECURITY DEFINER, με έλεγχο ορίου λέξεων + μία/μήνα server-side). Η κλήρωση
-- και το δώρο εκτελούνται μόνο από backend/cron (όχι από authenticated).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.user_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text,
  body        text not null,
  word_count  int  not null default 0,
  target      text not null default 'general',   -- 'general' | 'assistant' | 'app'
  campaign_id text,                               -- ενεργή καμπάνια ή null (παύση)
  in_pool     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_user_feedback_user     on public.user_feedback(user_id, created_at desc);
create index if not exists idx_user_feedback_campaign on public.user_feedback(campaign_id) where in_pool;

alter table public.user_feedback enable row level security;
drop policy if exists "feedback_select_own" on public.user_feedback;
create policy "feedback_select_own" on public.user_feedback for select using (user_id = auth.uid());
-- (Καμία policy INSERT/UPDATE/DELETE: η καταχώρηση γίνεται μόνο μέσω RPC.)

-- ── Καμπάνια: κύκλος 4 μηνών (3 ενεργοί + 1 παύση), αγκυρωμένος στον 1/2026 ──
create or replace function public.feedback_campaign(p_ts timestamptz default now())
returns table(campaign_id text, active boolean)
language sql immutable as $$
  with e as (
    select ((extract(year from p_ts)::int - 2026) * 12 + (extract(month from p_ts)::int - 1)) as m
  )
  select 'C' || floor(m::numeric / 4)::text,
         (m - floor(m::numeric / 4)::int * 4) < 3
  from e;
$$;

-- ── Μέτρημα «πραγματικών» λέξεων: tokens που περιέχουν τουλάχιστον ένα γράμμα
--    (ελληνικό ή λατινικό). Αποκλείει καθαρά αριθμούς/σύμβολα. ────────────────
create or replace function public.count_real_words(p text)
returns int language sql immutable as $$
  select coalesce(array_length(
    array(
      select w from unnest(regexp_split_to_array(coalesce(trim(p), ''), '\s+')) as w
      where w ~ '[A-Za-zΑ-Ωα-ωΆΈΉΊΌΎΏϊϋΐΰ]'
    ), 1), 0);
$$;

-- ── Κατάσταση feedback του τρέχοντος χρήστη (για το UI, χωρίς εγγραφή) ───────
create or replace function public.my_feedback_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_has boolean; v_active boolean; v_camp text;
begin
  if v_uid is null then return jsonb_build_object('status', 'error'); end if;
  select exists(
    select 1 from user_feedback
     where user_id = v_uid and date_trunc('month', created_at) = date_trunc('month', now())
  ) into v_has;
  select campaign_id, active into v_camp, v_active from public.feedback_campaign(now());
  return jsonb_build_object('submitted_this_month', v_has, 'campaign_active', v_active, 'campaign', v_camp);
end; $$;

-- ── Υποβολή feedback (μία/μήνα, ελάχιστες λέξεις, pool αν είναι ενεργή καμπάνια) ─
create or replace function public.submit_feedback(p_body text, p_target text default 'general')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_words int;
  v_camp  text;
  v_active boolean;
  v_email text;
  v_min   int := 12;
begin
  if v_uid is null then return jsonb_build_object('status', 'error'); end if;

  v_words := public.count_real_words(p_body);
  if v_words < v_min then
    return jsonb_build_object('status', 'too_short', 'min', v_min, 'words', v_words);
  end if;

  if exists (
    select 1 from user_feedback
     where user_id = v_uid and date_trunc('month', created_at) = date_trunc('month', now())
  ) then
    return jsonb_build_object('status', 'already');
  end if;

  select campaign_id, active into v_camp, v_active from public.feedback_campaign(now());
  select email into v_email from auth.users where id = v_uid;

  insert into user_feedback(user_id, email, body, word_count, target, campaign_id, in_pool)
  values (v_uid, v_email, left(p_body, 4000), v_words,
          coalesce(nullif(p_target, ''), 'general'),
          case when v_active then v_camp else null end,
          v_active);

  return jsonb_build_object('status', 'ok', 'in_pool', v_active,
                            'campaign', case when v_active then v_camp else null end);
end; $$;

revoke all on function public.submit_feedback(text, text) from public;
grant execute on function public.submit_feedback(text, text) to authenticated;
grant execute on function public.my_feedback_status()        to authenticated;

-- ── Κληρωτίδα: ένας νικητής ανά καμπάνια, δώρο 12 μήνες «Επαγγελματίας» (comp) ─
create table if not exists public.feedback_campaign_winners (
  campaign_id text primary key,
  user_id     uuid references auth.users(id) on delete set null,
  drawn_at    timestamptz not null default now()
);
alter table public.feedback_campaign_winners enable row level security;
-- (Χωρίς policies: πρόσβαση μόνο από backend/service_role.)

create or replace function public.draw_feedback_winner(p_campaign text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_winner uuid;
begin
  if p_campaign is null then return null; end if;
  if exists (select 1 from feedback_campaign_winners where campaign_id = p_campaign) then
    return null;   -- η κλήρωση έχει ήδη γίνει (idempotent)
  end if;

  -- Ένας νικητής ανά χρήστη (group by), τυχαία επιλογή από το pool.
  select user_id into v_winner
    from user_feedback
   where campaign_id = p_campaign and in_pool
   group by user_id
   order by random()
   limit 1;
  if v_winner is null then return null; end if;

  insert into feedback_campaign_winners(campaign_id, user_id) values (p_campaign, v_winner);

  -- Δώρο μέσω των υπαρχόντων comp πεδίων (bypass του lock_billing_plan: εδώ
  -- τρέχουμε ως definer/owner, όχι ως authenticated).
  insert into billing_profiles(user_id, comp_plan, comp_until, comp_started_at, comp_months_granted)
  values (v_winner, 'agency', now() + interval '12 months', now(), 12)
  on conflict (user_id) do update set
    comp_plan           = 'agency',
    comp_until          = greatest(coalesce(billing_profiles.comp_until, now()), now() + interval '12 months'),
    comp_started_at     = coalesce(billing_profiles.comp_started_at, now()),
    comp_months_granted = coalesce(billing_profiles.comp_months_granted, 0) + 12;

  return v_winner;
end; $$;

revoke all on function public.draw_feedback_winner(text) from public;
-- (Δεν δίνεται σε authenticated: μόνο backend/cron.)

-- ── Αυτόματη κλήρωση όταν κλείνει μια καμπάνια (ο περασμένος μήνας ήταν ο 3ος
--    ενεργός μήνας). Καλείται μηνιαία από pg_cron. ────────────────────────────
create or replace function public.draw_due_feedback_winners()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_last  timestamptz := date_trunc('month', now()) - interval '15 days';
  v_camp  text;
  v_phase int;
begin
  select campaign_id into v_camp from public.feedback_campaign(v_last);
  v_phase := ((extract(year from v_last)::int - 2026) * 12 + (extract(month from v_last)::int - 1))
             - floor(((extract(year from v_last)::int - 2026) * 12 + (extract(month from v_last)::int - 1))::numeric / 4)::int * 4;
  if v_phase = 2 then           -- τελευταίος ενεργός μήνας → η καμπάνια έκλεισε
    perform public.draw_feedback_winner(v_camp);
  end if;
end; $$;

revoke all on function public.draw_due_feedback_winners() from public;

-- ── Χρονοπρογραμματισμός κλήρωσης (μηνιαία, 1η ημέρα 03:00 UTC), αν υπάρχει pg_cron ─
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'feedback-draw-monthly') then
      perform cron.unschedule('feedback-draw-monthly');
    end if;
    perform cron.schedule('feedback-draw-monthly', '0 3 1 * *',
      $cron$ select public.draw_due_feedback_winners(); $cron$);
  end if;
end $$;
