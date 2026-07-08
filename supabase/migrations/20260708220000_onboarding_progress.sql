-- ═══════════════════════════════════════════════════════════════════════════
-- onboarding_progress — πρόοδος πρώτης χρήσης ανά χρήστη (στη βάση, όχι μόνο
-- localStorage, ώστε να συνεχίζει σε άλλη συσκευή). RLS ανά χρήστη. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.onboarding_progress (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  welcomed       boolean default false,
  first_property boolean default false,
  demo_seen      boolean default false,
  completed      boolean default false,
  updated_at     timestamptz not null default now()
);
alter table public.onboarding_progress enable row level security;
drop policy if exists own_onboarding_progress on public.onboarding_progress;
create policy own_onboarding_progress on public.onboarding_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
