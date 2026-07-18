-- ─────────────────────────────────────────────────────────────────────────
-- Referral v2 — ενεργοποίηση, πρόοδος & προμήθεια Συνεργάτη.
--
-- Χτίζει πάνω στο υπάρχον σύστημα (referral_codes, referrals). Προσθέτει:
--  • referrals.referrer_user_id  → ποιος έφερε ποιον (χωρίς join στον κωδικό)
--  • referrals.activated_at       → πότε ο νέος χρήστης ενεργοποιήθηκε
--    (πρόσθεσε ≥1 ακίνητο & σάρωσε ≥1 έγγραφο) — μόνο τότε μετράει η σύσταση.
--  • referral_rewards             → καθολικό (ledger) ανταμοιβών, ό,τι κερδίζει
--    ο συστήνων (μήνες/μετρητά/θέσεις), για διαφάνεια και μελλοντική εκκαθάριση.
--  • RPC redeem_referral(code)    → κλείνει τον κύκλο: αναλύει τον κωδικό στον
--    κάτοχο, μπλοκάρει αυτο-παραπομπή, γράφει τη σύσταση με referrer_user_id.
--  • RPC mark_referral_activated()→ σημειώνει ενεργοποίηση (idempotent).
--  • RPC get_referral_overview(code) → πραγματικοί αριθμοί για την καρτέλα:
--    προσκλήσεις, ενεργοποιήσεις, τρέχων μήνας, μηνιαία ιστορία (για το σερί).
--
-- Idempotent. Ασφάλεια: security definer με έλεγχο auth.uid() σε κάθε RPC.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Επεκτάσεις στον πίνακα referrals ────────────────────────────────────
alter table public.referrals add column if not exists referrer_user_id uuid references auth.users(id) on delete set null;
alter table public.referrals add column if not exists activated_at timestamptz;

-- Backfill: γέμισε τον referrer από τον κωδικό, όπου λείπει.
update public.referrals r
   set referrer_user_id = c.user_id
  from public.referral_codes c
 where r.referrer_user_id is null
   and r.code = c.code;

create index if not exists referrals_referrer_idx on public.referrals(referrer_user_id);
create index if not exists referrals_activated_idx on public.referrals(referrer_user_id, activated_at);

-- 2) Καθολικό ανταμοιβών (ledger) ────────────────────────────────────────
create table if not exists public.referral_rewards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,  -- ο συστήνων που κερδίζει
  referral_id  uuid references public.referrals(id) on delete set null,
  kind         text not null,                 -- 'free_month' | 'slot' | 'cash' | 'commission'
  months       integer   default 0,
  amount_eur   numeric   default 0,
  reason       text      default '',          -- π.χ. 'referral' | 'milestone' | 'partner'
  status       text      default 'pending',   -- 'pending' | 'granted' | 'paid'
  created_at   timestamptz default now()
);
alter table public.referral_rewards enable row level security;
drop policy if exists "own_referral_rewards" on public.referral_rewards;
create policy "own_referral_rewards" on public.referral_rewards for select
  using (user_id = auth.uid());

-- 3) RPC: εξαργύρωση κωδικού (καλείται από τον ΝΕΟ χρήστη στην 1η σύνδεση) ─
create or replace function public.redeem_referral(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then return; end if;
  select user_id into v_owner from referral_codes where code = p_code;
  -- Άγνωστος κωδικός ή αυτο-παραπομπή → αγνόησε σιωπηλά.
  if v_owner is null or v_owner = auth.uid() then return; end if;
  insert into referrals (code, referred_user_id, referrer_user_id)
       values (p_code, auth.uid(), v_owner)
  on conflict (referred_user_id) do nothing;
end; $$;
grant execute on function public.redeem_referral(text) to authenticated;

-- 4) RPC: σήμανση ενεργοποίησης (καλείται από τον ΝΕΟ χρήστη όταν ξεκινά) ──
create or replace function public.mark_referral_activated()
returns void language plpgsql security definer set search_path = public as $$
begin
  update referrals
     set activated_at = now()
   where referred_user_id = auth.uid()
     and activated_at is null;
end; $$;
grant execute on function public.mark_referral_activated() to authenticated;

-- 5) RPC: επισκόπηση για την καρτέλα (καλείται από τον ΣΥΣΤΗΝΟΝΤΑ) ─────────
-- Επιστρέφει json: { invites, activated, this_month, monthly_counts[] }
-- monthly_counts = ενεργοποιήσεις ανά μήνα για τους τελευταίους 6 μήνες,
-- παλιό→νέο, ώστε το frontend να υπολογίζει σερί «5 του μήνα».
create or replace function public.get_referral_overview(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_invites int;
  v_activated int;
  v_this_month int;
  v_monthly json;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then
    return json_build_object('invites', 0, 'activated', 0, 'this_month', 0, 'monthly_counts', json_build_array());
  end if;

  select count(*)::int into v_invites
    from referrals where referrer_user_id = v_owner;

  select count(*)::int into v_activated
    from referrals where referrer_user_id = v_owner and activated_at is not null;

  select count(*)::int into v_this_month
    from referrals
   where referrer_user_id = v_owner
     and activated_at is not null
     and date_trunc('month', activated_at) = date_trunc('month', now());

  -- Μηνιαία ιστορία τελευταίων 6 μηνών (0 όπου δεν υπάρχει ενεργοποίηση).
  select json_agg(cnt order by m) into v_monthly
    from (
      select gs.m as m,
             coalesce((
               select count(*)::int from referrals r
                where r.referrer_user_id = v_owner
                  and r.activated_at is not null
                  and date_trunc('month', r.activated_at) = gs.m
             ), 0) as cnt
        from generate_series(
               date_trunc('month', now()) - interval '5 months',
               date_trunc('month', now()),
               interval '1 month'
             ) as gs(m)
    ) months;

  return json_build_object(
    'invites', v_invites,
    'activated', v_activated,
    'this_month', v_this_month,
    'monthly_counts', coalesce(v_monthly, json_build_array())
  );
end; $$;
grant execute on function public.get_referral_overview(text) to authenticated;
