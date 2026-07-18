-- ─────────────────────────────────────────────────────────────────────────
-- Referral v2 — δύο προγράμματα ανά προφίλ (Ιδιώτης / Επαγγελματίας).
--
-- Χτίζει πάνω στο υπάρχον σύστημα (referral_codes, referrals). Προσθέτει:
--  • referrals.referrer_user_id  → ποιος έφερε ποιον
--  • referrals.activated_at       → πότε ο νέος ενεργοποιήθηκε (server-verified)
--  • referral_rewards             → καθολικό (ledger) ανταμοιβών (αξία προϊόντος)
--  • referral_partners            → ΜΟΝΙΜΗ καταγραφή ιδιότητας Συνεργάτη
--  • RPC redeem_referral(code)    → μόνο ΝΕΟΙ λογαριασμοί (anti-farming)
--  • RPC mark_referral_activated()→ ενεργοποίηση από πραγματικά δεδομένα
--  • RPC get_referral_overview(code) → αριθμοί ανά ιδιότητα του νέου (ιδιώτης/
--    επαγγελματίας, συνδρομητής/δωρεάν) + σερί συνδρομητών + partner flag
--  • RPC claim_referral_bonus(code, kind) → διεκδίκηση μηνιαίου μπόνους
--
-- ΑΞΙΟΛΟΓΗΣΗ ΝΕΟΥ ΧΡΗΣΤΗ (μέσω billing_profiles):
--   • «συνδρομητής» (paid) = plan ∈ (monthly, annual)
--   • «επαγγελματίας»       = profile_type = professional
-- Idempotent. Κάθε RPC ελέγχει auth.uid().
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Επεκτάσεις στον πίνακα referrals ────────────────────────────────────
alter table public.referrals add column if not exists referrer_user_id uuid references auth.users(id) on delete set null;
alter table public.referrals add column if not exists activated_at timestamptz;

update public.referrals r
   set referrer_user_id = c.user_id
  from public.referral_codes c
 where r.referrer_user_id is null
   and r.code = c.code;

create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
create index if not exists referrals_activated_idx on public.referrals(referrer_user_id, activated_at);

-- 2) Καθολικό ανταμοιβών (ledger) — αξία προϊόντος, ποτέ αυτόματη πληρωμή ──
create table if not exists public.referral_rewards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  referral_id  uuid references public.referrals(id) on delete set null,
  kind         text not null,                 -- 'months' | 'commission'
  months       integer   default 0,
  amount_eur   numeric   default 0,
  tier         text      default '',          -- 'owner' | 'agency' (ποιο πλάνο αφορούν οι μήνες)
  reason       text      default '',          -- 'per_referral' | 'indiv_volume' | 'pro_paid' | 'pro_free' | 'partner'
  status       text      default 'pending',   -- 'pending' | 'granted'
  created_at   timestamptz default now()
);
alter table public.referral_rewards enable row level security;
drop policy if exists "own_referral_rewards" on public.referral_rewards;
create policy "own_referral_rewards" on public.referral_rewards for select
  using (user_id = auth.uid());
-- Παλαιά εγκατάσταση χωρίς tier: πρόσθεσέ το idempotent.
alter table public.referral_rewards add column if not exists tier text default '';

-- 2b) Μόνιμη καταγραφή ιδιότητας Συνεργάτη (δεν «σβήνει» στην αλλαγή μήνα) ─
create table if not exists public.referral_partners (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  earned_at  timestamptz default now()
);
alter table public.referral_partners enable row level security;
drop policy if exists "own_referral_partner" on public.referral_partners;
create policy "own_referral_partner" on public.referral_partners for select
  using (user_id = auth.uid());

-- 3) RPC: εξαργύρωση κωδικού — ΜΟΝΟ νέοι λογαριασμοί (anti-farming) ────────
create or replace function public.redeem_referral(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_created timestamptz;
begin
  if p_code is null or length(trim(p_code)) = 0 then return; end if;
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner = auth.uid() then return; end if;
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created is null or v_created < now() - interval '14 days' then return; end if;
  insert into referrals (code, referred_user_id, referrer_user_id)
       values (p_code, auth.uid(), v_owner)
  on conflict (referred_user_id) do nothing;
end; $$;
grant execute on function public.redeem_referral(text) to authenticated;

-- 4) RPC: σήμανση ενεργοποίησης — ΕΠΑΛΗΘΕΥΜΕΝΗ από πραγματικά δεδομένα ──────
create or replace function public.mark_referral_activated()
returns void language plpgsql security definer set search_path = public as $$
declare v_props int; v_docs int;
begin
  select count(*)::int into v_props from user_properties where user_id = auth.uid();
  select count(*)::int into v_docs  from property_documents where user_id = auth.uid();
  if v_props >= 1 and v_docs >= 1 then
    update referrals set activated_at = now()
     where referred_user_id = auth.uid() and activated_at is null;
  end if;
end; $$;
grant execute on function public.mark_referral_activated() to authenticated;

-- 5) RPC: επισκόπηση για την καρτέλα (καλείται από τον ΣΥΣΤΗΝΟΝΤΑ) ─────────
-- json: { invites, activated, m_pro, m_indiv, m_paid, m_free, streak, partner,
--         paid_monthly_counts[] }
--   • m_pro/m_indiv  = ενεργοποιήσεις μήνα με νέο επαγγελματία / ιδιώτη
--   • m_paid/m_free  = ενεργοποιήσεις μήνα με συνδρομητή / δωρεάν
--   • streak         = συνεχόμενοι ΟΛΟΚΛΗΡΩΜΕΝΟΙ μήνες με ≥5 συνδρομητές
--   • partner        = μόνιμη ιδιότητα (persisted)
create or replace function public.get_referral_overview(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_invites int; v_activated int;
  v_m_pro int; v_m_indiv int; v_m_paid int; v_m_free int;
  v_streak int := 0; v_partner boolean; v_monthly json;
  r record;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then
    return json_build_object('invites',0,'activated',0,'m_pro',0,'m_indiv',0,
      'm_paid',0,'m_free',0,'streak',0,'partner',false,'paid_monthly_counts',json_build_array());
  end if;

  select count(*)::int into v_invites   from referrals where referrer_user_id = v_owner;
  select count(*)::int into v_activated from referrals where referrer_user_id = v_owner and activated_at is not null;

  -- Ενεργοποιήσεις τρέχοντος μήνα, ανά ιδιότητα του νέου χρήστη.
  select
    (count(*) filter (where coalesce(bp.profile_type,'individual') = 'professional'))::int,
    (count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional'))::int,
    (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int,
    (count(*) filter (where coalesce(bp.plan,'') not in ('monthly','annual')))::int
  into v_m_pro, v_m_indiv, v_m_paid, v_m_free
  from referrals r2
  left join billing_profiles bp on bp.user_id = r2.referred_user_id
  where r2.referrer_user_id = v_owner and r2.activated_at is not null
    and date_trunc('month', r2.activated_at) = date_trunc('month', now());

  -- Σερί συνδρομητών: πιο πρόσφατος ΟΛΟΚΛΗΡΩΜΕΝΟΣ μήνας και πίσω, όσο ≥5 paid.
  for r in
    select (
      select (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int
        from referrals rr
        left join billing_profiles bp on bp.user_id = rr.referred_user_id
       where rr.referrer_user_id = v_owner and rr.activated_at is not null
         and date_trunc('month', rr.activated_at) = gs.m) as paid
      from generate_series(
             date_trunc('month', now()) - interval '1 month',
             date_trunc('month', now()) - interval '12 months',
             interval '-1 month') as gs(m)
      order by gs.m desc
  loop
    if r.paid >= 5 then v_streak := v_streak + 1; else exit; end if;
  end loop;

  if v_streak >= 3 then
    insert into referral_partners (user_id) values (v_owner) on conflict (user_id) do nothing;
  end if;
  select exists(select 1 from referral_partners where user_id = v_owner) into v_partner;

  -- Ιστορικό 6 ολοκληρωμένων μηνών (παλιό→νέο): συνδρομητές/μήνα (γράφημα).
  select json_agg(paid order by m) into v_monthly from (
      select gs.m as m, (
             select (count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual')))::int
               from referrals rr
               left join billing_profiles bp on bp.user_id = rr.referred_user_id
              where rr.referrer_user_id = v_owner and rr.activated_at is not null
                and date_trunc('month', rr.activated_at) = gs.m) as paid
        from generate_series(
               date_trunc('month', now()) - interval '6 months',
               date_trunc('month', now()) - interval '1 month',
               interval '1 month') as gs(m)
    ) months;

  return json_build_object(
    'invites', v_invites, 'activated', v_activated,
    'm_pro', v_m_pro, 'm_indiv', v_m_indiv, 'm_paid', v_m_paid, 'm_free', v_m_free,
    'streak', v_streak, 'partner', v_partner,
    'paid_monthly_counts', coalesce(v_monthly, json_build_array())
  );
end; $$;
grant execute on function public.get_referral_overview(text) to authenticated;

-- 6) RPC: διεκδίκηση μηνιαίου μπόνους ─────────────────────────────────────
-- Αξία προϊόντος (μήνες), ΟΧΙ μετρητά. Γράφει pending εγγραφή στο ledger.
-- p_kind: 'indiv_volume' (5 ιδιώτες → 1 μήνας Ιδιώτης)
--         'pro_paid'     (5 συνδρομητές → 2 μήνες Επαγγελματία)
--         'pro_free'     (10 δωρεάν → 1 μήνας Επαγγελματία)
-- Έλεγχοι: κατοχή κωδικού, στόχος επιτευγμένος τον μήνα, μία διεκδίκηση/είδος/μήνα.
create or replace function public.claim_referral_bonus(p_code text, p_kind text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_count int; v_target int; v_months int; v_tier text; v_exists int;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_object('ok', false, 'reason', 'not_owner'); end if;

  if    p_kind = 'indiv_volume' then v_target := 5;  v_months := 1; v_tier := 'owner';
  elsif p_kind = 'pro_paid'     then v_target := 5;  v_months := 2; v_tier := 'agency';
  elsif p_kind = 'pro_free'     then v_target := 10; v_months := 1; v_tier := 'agency';
  else return json_build_object('ok', false, 'reason', 'bad_kind'); end if;

  -- Σειριοποίησε ταυτόχρονες διεκδικήσεις ανά χρήστη/είδος (anti double-claim).
  perform pg_advisory_xact_lock(hashtext('referral_bonus:' || p_kind || ':' || v_owner::text));

  select
    case p_kind
      when 'indiv_volume' then count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional')
      when 'pro_paid'     then count(*) filter (where coalesce(bp.plan,'') in ('monthly','annual'))
      when 'pro_free'     then count(*) filter (where coalesce(bp.plan,'') not in ('monthly','annual'))
    end::int
  into v_count
  from referrals r
  left join billing_profiles bp on bp.user_id = r.referred_user_id
  where r.referrer_user_id = v_owner and r.activated_at is not null
    and date_trunc('month', r.activated_at) = date_trunc('month', now());

  if v_count < v_target then return json_build_object('ok', false, 'reason', 'not_reached', 'count', v_count, 'target', v_target); end if;

  select count(*)::int into v_exists from referral_rewards
   where user_id = v_owner and reason = p_kind
     and date_trunc('month', created_at) = date_trunc('month', now());
  if v_exists > 0 then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;

  insert into referral_rewards (user_id, kind, months, tier, reason, status)
       values (v_owner, 'months', v_months, v_tier, p_kind, 'pending');
  return json_build_object('ok', true, 'status', 'pending', 'months', v_months, 'tier', v_tier);
end; $$;
grant execute on function public.claim_referral_bonus(text, text) to authenticated;
