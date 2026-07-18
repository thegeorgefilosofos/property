-- ─────────────────────────────────────────────────────────────────────────
-- Referral v2 — ενεργοποίηση, πρόοδος & ιδιότητα Συνεργάτη.
--
-- Χτίζει πάνω στο υπάρχον σύστημα (referral_codes, referrals). Προσθέτει:
--  • referrals.referrer_user_id  → ποιος έφερε ποιον (χωρίς join στον κωδικό)
--  • referrals.activated_at       → πότε ο νέος χρήστης ενεργοποιήθηκε
--  • referral_rewards             → καθολικό (ledger) ανταμοιβών (αξία προϊόντος)
--  • referral_partners            → ΜΟΝΙΜΗ καταγραφή ιδιότητας Συνεργάτη
--  • RPC redeem_referral(code)    → κλείνει τον κύκλο (μόνο ΝΕΟΙ λογαριασμοί)
--  • RPC mark_referral_activated()→ ΕΠΑΛΗΘΕΥΜΕΝΗ ενεργοποίηση (server-side)
--  • RPC get_referral_overview(code) → πραγματικοί αριθμοί + σερί + partner flag
--  • RPC claim_monthly_bonus(code)→ διεκδίκηση μηνιαίου μπόνους (αξία προϊόντος)
--
-- ΑΣΦΑΛΕΙΑ (hard audit): η ενεργοποίηση ΔΕΝ δηλώνεται από τον χρήστη — μετριέται
-- server-side από τα πραγματικά ακίνητα & έγγραφά του. Το μπόνους είναι μήνες
-- προϊόντος (ΟΧΙ μετρητά — μηδενικό οριακό κόστος, καμία ταμειακή έκθεση). Το
-- σερί μετριέται σε ΟΛΟΚΛΗΡΩΜΕΝΟΥΣ μήνες. Η ιδιότητα Συνεργάτη είναι μόνιμη.
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
  kind         text not null,                 -- 'free_month' | 'slot' | 'months' | 'commission'
  months       integer   default 0,
  amount_eur   numeric   default 0,
  reason       text      default '',          -- 'referral' | 'milestone' | 'partner'
  status       text      default 'pending',   -- 'pending' | 'granted'
  created_at   timestamptz default now()
);
alter table public.referral_rewards enable row level security;
drop policy if exists "own_referral_rewards" on public.referral_rewards;
create policy "own_referral_rewards" on public.referral_rewards for select
  using (user_id = auth.uid());

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
  -- Άγνωστος κωδικός ή αυτο-παραπομπή → αγνόησε σιωπηλά.
  if v_owner is null or v_owner = auth.uid() then return; end if;
  -- Μόνο πρόσφατα δημιουργημένος λογαριασμός μπορεί να εξαργυρώσει πρόσκληση,
  -- ώστε να μη «φαρμάρεται» υπάρχων χρήστης ως δήθεν νέα σύσταση.
  select created_at into v_created from auth.users where id = auth.uid();
  if v_created is null or v_created < now() - interval '14 days' then return; end if;
  insert into referrals (code, referred_user_id, referrer_user_id)
       values (p_code, auth.uid(), v_owner)
  on conflict (referred_user_id) do nothing;
end; $$;
grant execute on function public.redeem_referral(text) to authenticated;

-- 4) RPC: σήμανση ενεργοποίησης — ΕΠΑΛΗΘΕΥΜΕΝΗ από πραγματικά δεδομένα ──────
-- Ο χρήστης ΔΕΝ δηλώνει μόνος την ενεργοποίηση: μετριέται από τα ακίνητα και
-- τα σαρωμένα έγγραφά του. Έτσι μια σύσταση «κλειδώνει» μόνο με πραγματική χρήση.
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
-- Επιστρέφει json: { invites, activated, this_month, streak, partner, monthly_counts[] }
--  • this_month    = ενεργοποιήσεις τρέχοντος μήνα (για το milestone «X/5»)
--  • monthly_counts= 6 ΟΛΟΚΛΗΡΩΜΕΝΟΙ μήνες (παλιό→νέο), για το γράφημα
--  • streak        = συνεχόμενοι ΟΛΟΚΛΗΡΩΜΕΝΟΙ μήνες με ≥5 (ο in-progress μήνας
--    ΔΕΝ μετρά — αποφεύγει πρόωρη ή ασταθή ιδιότητα Συνεργάτη)
--  • partner       = μόνιμη ιδιότητα (persisted): true αν έχει κερδηθεί ποτέ.
create or replace function public.get_referral_overview(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_invites int;
  v_activated int;
  v_this_month int;
  v_monthly json;
  v_streak int := 0;
  v_partner boolean;
  r record;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then
    return json_build_object('invites', 0, 'activated', 0, 'this_month', 0,
      'streak', 0, 'partner', false, 'monthly_counts', json_build_array());
  end if;

  select count(*)::int into v_invites   from referrals where referrer_user_id = v_owner;
  select count(*)::int into v_activated from referrals where referrer_user_id = v_owner and activated_at is not null;

  select count(*)::int into v_this_month
    from referrals
   where referrer_user_id = v_owner and activated_at is not null
     and date_trunc('month', activated_at) = date_trunc('month', now());

  -- Σερί: μέτρα από τον πιο πρόσφατο ΟΛΟΚΛΗΡΩΜΕΝΟ μήνα και πίσω, όσο ≥5.
  for r in
    select coalesce((
             select count(*)::int from referrals rr
              where rr.referrer_user_id = v_owner and rr.activated_at is not null
                and date_trunc('month', rr.activated_at) = gs.m), 0) as cnt
      from generate_series(
             date_trunc('month', now()) - interval '1 month',
             date_trunc('month', now()) - interval '12 months',
             interval '-1 month') as gs(m)
      order by gs.m desc
  loop
    if r.cnt >= 5 then v_streak := v_streak + 1; else exit; end if;
  end loop;

  -- Μόλις πιάσει 3 ολοκληρωμένους μήνες, καταγράφει μόνιμα την ιδιότητα.
  if v_streak >= 3 then
    insert into referral_partners (user_id) values (v_owner)
    on conflict (user_id) do nothing;
  end if;
  select exists(select 1 from referral_partners where user_id = v_owner) into v_partner;

  -- Ιστορικό 6 ολοκληρωμένων μηνών (παλιό→νέο) για το γράφημα.
  select json_agg(cnt order by m) into v_monthly
    from (
      select gs.m as m,
             coalesce((
               select count(*)::int from referrals r2
                where r2.referrer_user_id = v_owner and r2.activated_at is not null
                  and date_trunc('month', r2.activated_at) = gs.m), 0) as cnt
        from generate_series(
               date_trunc('month', now()) - interval '6 months',
               date_trunc('month', now()) - interval '1 month',
               interval '1 month') as gs(m)
    ) months;

  return json_build_object(
    'invites', v_invites,
    'activated', v_activated,
    'this_month', v_this_month,
    'streak', v_streak,
    'partner', v_partner,
    'monthly_counts', coalesce(v_monthly, json_build_array())
  );
end; $$;
grant execute on function public.get_referral_overview(text) to authenticated;

-- 6) RPC: διεκδίκηση μηνιαίου μπόνους «Οι 5 του μήνα» ─────────────────────
-- Αξία προϊόντος (μήνες Επαγγελματία), ΟΧΙ μετρητά. ΔΕΝ πιστώνει αυτόματα:
-- γράφει εγγραφή στο ledger με status 'pending' για ελεγχόμενη εφαρμογή.
-- Ελέγχει: (α) κατοχή κωδικού, (β) ≥5 ΕΠΑΛΗΘΕΥΜΕΝΕΣ ενεργοποιήσεις τον μήνα,
-- (γ) καμία προηγούμενη διεκδίκηση τον ίδιο μήνα.
create or replace function public.claim_monthly_bonus(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_count int; v_exists int;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then
    return json_build_object('ok', false, 'reason', 'not_owner');
  end if;
  select count(*)::int into v_count from referrals
   where referrer_user_id = v_owner and activated_at is not null
     and date_trunc('month', activated_at) = date_trunc('month', now());
  if v_count < 5 then
    return json_build_object('ok', false, 'reason', 'not_reached', 'count', v_count);
  end if;
  select count(*)::int into v_exists from referral_rewards
   where user_id = v_owner and reason = 'milestone'
     and date_trunc('month', created_at) = date_trunc('month', now());
  if v_exists > 0 then
    return json_build_object('ok', false, 'reason', 'already_claimed');
  end if;
  insert into referral_rewards (user_id, kind, months, reason, status)
       values (v_owner, 'months', 6, 'milestone', 'pending');
  return json_build_object('ok', true, 'status', 'pending', 'months', 6);
end; $$;
grant execute on function public.claim_monthly_bonus(text) to authenticated;
