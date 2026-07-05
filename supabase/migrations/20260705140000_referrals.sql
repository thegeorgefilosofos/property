-- ─────────────────────────────────────────────────────────────────────────
-- Referral system — κωδικοί πρόσκλησης (growth). Κάθε χρήστης έχει μοναδικό
-- κωδικό· όταν κάποιος εγγράφεται με τον σύνδεσμο, καταγράφεται η παραπομπή.
-- Η ανταμοιβή (π.χ. δωρεάν μήνας) θα εφαρμοστεί με την ενεργοποίηση Stripe.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists "own_referral_code" on public.referral_codes;
create policy "own_referral_code" on public.referral_codes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz default now(),
  unique (referred_user_id)
);
alter table public.referrals enable row level security;
-- Ο νέος χρήστης καταχωρεί ΜΟΝΟ τη δική του παραπομπή.
drop policy if exists "insert_own_referral" on public.referrals;
create policy "insert_own_referral" on public.referrals for insert
  with check (referred_user_id = auth.uid());

-- RPC: πλήθος παραπομπών — μόνο ο κάτοχος του κωδικού το βλέπει.
create or replace function public.get_referral_stats(p_code text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return 0; end if;
  return (select count(*)::int from referrals where code = p_code);
end; $$;
grant execute on function public.get_referral_stats(text) to authenticated;
