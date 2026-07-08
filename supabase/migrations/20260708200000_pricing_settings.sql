-- ═══════════════════════════════════════════════════════════════════════════
-- pricing_settings — ρυθμίσεις δυναμικής τιμολόγησης ανά ακίνητο (βάση, όρια,
-- premium Σαββατοκύριακου, ελάχιστη διαμονή). Ένα row ανά (χρήστη, ακίνητο).
-- Επικοινωνεί με το υπόλοιπο app: το UI τις γράφει, ο AI βοηθός τις διαβάζει.
-- RLS ανά χρήστη + realtime. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.pricing_settings (
  user_id         uuid not null references auth.users(id) on delete cascade,
  property_id     text not null,
  base            numeric,
  min_price       numeric,
  max_price       numeric,
  weekend_premium numeric default 0.18,
  min_stay        integer default 1,
  updated_at      timestamptz not null default now(),
  primary key (user_id, property_id)
);
alter table public.pricing_settings enable row level security;
drop policy if exists own_pricing_settings on public.pricing_settings;
create policy own_pricing_settings on public.pricing_settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.pricing_settings; exception when duplicate_object then null; when others then raise notice 'rt pricing_settings skip: %', sqlerrm; end $$;
