-- ─────────────────────────────────────────────────────────────────────────
-- rent_comparables — συγκριτικά ακίνητα αγοράς (comparables) ανά ακίνητο.
-- Ο ιδιοκτήτης καταχωρεί παρόμοιες αγγελίες (Spitogatos/XE) για να συγκρίνει
-- το ενοίκιό του με τον μέσο όρο της αγοράς (€/τ.μ., απόκλιση %).
-- Χρησιμοποιείται από το RentComparables.tsx (καρτέλα Ενοίκιο/ROI). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_comparables (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  user_id       uuid not null references auth.users(id)       on delete cascade,
  title         text not null,
  area          text        default '',
  sqm           numeric     default 0,
  rent          numeric     default 0,
  rent_per_sqm  numeric     default 0,
  distance      text        default '',
  condition     text        default 'good',   -- new | renovated | good | average | needs_work
  source        text        default 'spitogatos',
  url           text        default '',
  notes         text        default '',
  created_at    timestamptz default now()
);

create index if not exists rent_comparables_property_idx on public.rent_comparables(property_id);

alter table public.rent_comparables enable row level security;

drop policy if exists "own_rent_comparables" on public.rent_comparables;
create policy "own_rent_comparables" on public.rent_comparables for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
