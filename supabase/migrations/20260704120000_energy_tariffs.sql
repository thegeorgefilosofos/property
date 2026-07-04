-- ─────────────────────────────────────────────────────────────────────────
-- energy_tariffs — ζωντανά τιμολόγια ρεύματος/αερίου (ενημερώνονται από το
-- Edge Function market-data-updater κάθε 1η του μήνα, ώστε να ΜΗΝ «παλιώνουν»
-- τα hardcoded δεδομένα του app).
--
-- Ροή: το Edge Function (service role) κάνει upsert ανά (tariff_id, valid_month).
-- Το app διαβάζει με το anon key (δημόσια δεδομένα) μέσω του useEnergyTariffs.
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.energy_tariffs (
  id               bigint generated always as identity primary key,
  tariff_id        text        not null,
  provider         text        not null,
  provider_label   text        not null,
  name             text        not null,
  badge            text,
  type             text,
  segment          text        default 'residential',   -- residential | business
  kwh_day          numeric,
  kwh_night        numeric,
  kwh_tier2        numeric,
  tier2_threshold  numeric,
  flat_monthly     numeric,
  flat_annual_kwh  numeric,
  flat_overage_rate numeric,
  fixed            numeric,
  fixed_ebill      numeric,
  vat              integer     default 6,
  contract_months  integer     default 0,
  no_fixed         boolean     default false,
  dynamic          boolean     default false,
  valid_month      text        not null,                -- π.χ. '2026-07'
  source           text,
  updated_at       timestamptz default now(),
  unique (tariff_id, valid_month)
);

-- Γρήγορη ανάκτηση των τιμολογίων του τρέχοντος μήνα
create index if not exists idx_energy_tariffs_month    on public.energy_tariffs (valid_month);
create index if not exists idx_energy_tariffs_provider on public.energy_tariffs (provider);

-- RLS: δημόσια ΑΝΑΓΝΩΣΗ (τα τιμολόγια είναι δημόσια), εγγραφή μόνο service role.
alter table public.energy_tariffs enable row level security;

drop policy if exists "energy_tariffs_public_read" on public.energy_tariffs;
create policy "energy_tariffs_public_read" on public.energy_tariffs
  for select using (true);

-- (Το Edge Function γράφει με το service_role key που παρακάμπτει το RLS,
--  οπότε δεν χρειάζεται insert/update policy για anon/authenticated.)
