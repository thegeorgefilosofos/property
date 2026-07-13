-- ═══════════════════════════════════════════════════════════════════════════
-- OPT-OUT δεδομένων κοινότητας — ρητός έλεγχος συγκατάθεσης ανά χρήστη.
-- Προεπιλογή: συμμετοχή (ανώνυμα/συγκεντρωτικά), αλλά ο χρήστης μπορεί να εξαιρεθεί
-- ανά πάσα στιγμή· τότε τα ακίνητά του αποκλείονται εντελώς από τα aggregates.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.billing_profiles
  add column if not exists share_market_data boolean not null default true;

comment on column public.billing_profiles.share_market_data is
  'Συγκατάθεση συμμετοχής στα ανώνυμα δεδομένα κοινότητας. false = εξαίρεση.';

-- Ενημέρωση της συνάρτησης ώστε να ΑΠΟΚΛΕΙΕΙ τους χρήστες που έχουν εξαιρεθεί.
create or replace function public.community_market_stats()
returns table (
  postal_code           text,
  sample_count          int,
  median_gross_yield    numeric,
  p25_yield             numeric,
  p75_yield             numeric,
  median_rent_per_sqm   numeric,
  median_price_per_sqm  numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      up.postal_code,
      up.value::numeric as value,
      coalesce(rc.actual_rent, rc.target_rent, up.target_rent)::numeric as rent,
      nullif(up.sqm, 0)::numeric as sqm
    from public.user_properties up
    left join public.billing_profiles bp on bp.user_id = up.user_id
    left join lateral (
      select actual_rent, target_rent
      from public.rent_config rc
      where rc.property_id = up.id
      limit 1
    ) rc on true
    where up.postal_code is not null and btrim(up.postal_code) <> ''
      and up.value is not null and up.value > 0
      and coalesce(rc.actual_rent, rc.target_rent, up.target_rent) > 0
      and coalesce(bp.share_market_data, true) = true   -- σέβεται το opt-out
  ),
  filtered as (
    select postal_code, value, rent, sqm, (rent * 12.0 / value) * 100.0 as gy
    from base
    where (rent * 12.0 / value) * 100.0 between 1 and 25
  )
  select
    postal_code,
    count(*)::int,
    round(percentile_cont(0.5)  within group (order by gy)::numeric, 1),
    round(percentile_cont(0.25) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.75) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.5)  within group (order by rent / sqm)  filter (where sqm is not null)::numeric, 2),
    round(percentile_cont(0.5)  within group (order by value / sqm) filter (where sqm is not null)::numeric, 0)
  from filtered
  group by postal_code
  having count(*) >= 5;
$$;

revoke all on function public.community_market_stats() from public;
grant execute on function public.community_market_stats() to authenticated;
