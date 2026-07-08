-- ═══════════════════════════════════════════════════════════════════════════
-- ical_feeds — αποθηκευμένοι σύνδεσμοι ημερολογίου (Airbnb/Booking) ανά ακίνητο,
-- για ΑΥΤΟΜΑΤΟ συγχρονισμό κρατήσεων μέσω της edge function ical-sync. RLS ανά
-- χρήστη. Το last_synced_at/last_status ενημερώνονται από τη function. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.ical_feeds (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  property_id     text not null,
  channel         text not null default 'airbnb',   -- airbnb | booking | other
  url             text not null,
  include_blocked boolean default false,            -- να εισάγονται και τα μπλοκαρίσματα
  active          boolean default true,
  last_synced_at  timestamptz,
  last_status     text,
  created_at      timestamptz not null default now(),
  unique (user_id, property_id, url)
);
create index if not exists ical_feeds_user_idx on public.ical_feeds(user_id);
alter table public.ical_feeds enable row level security;
drop policy if exists own_ical_feeds on public.ical_feeds;
create policy own_ical_feeds on public.ical_feeds for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.ical_feeds; exception when duplicate_object then null; when others then raise notice 'rt ical_feeds skip: %', sqlerrm; end $$;
