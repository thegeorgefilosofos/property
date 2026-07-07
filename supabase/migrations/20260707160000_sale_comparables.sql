-- ─────────────────────────────────────────────────────────────────────────
-- Sale comparables — επέκταση του rent_comparables ώστε να υποστηρίζει και
-- συγκριτικά ΠΩΛΗΣΗΣ (όχι μόνο ενοικίασης), για μεσίτες/ιδιοκτήτες.
-- Νέες στήλες: listing_type (rent|sale), asking_price (ζητούμενη τιμή),
-- price_per_sqm (€/τ.μ. πώλησης = asking_price / sqm), days_on_market
-- (ημέρες στην αγορά), sold_price (τελική τιμή πώλησης, 0 = διαθέσιμο).
-- Τα δεδομένα καταχωρούνται ΧΕΙΡΟΚΙΝΗΤΑ από τον χρήστη — καμία αυτόματη
-- άντληση (scraping) από τις πλατφόρμες.
--
-- ΑΣΦΑΛΕΣ & ΕΠΑΝΑΛΗΨΙΜΟ (idempotent): μόνο "add column if not exists" σε
-- υπάρχοντα πίνακα. Τα υπάρχοντα comparables είναι ενοικίασης και παίρνουν
-- listing_type = 'rent'. Το RLS «own_rent_comparables» (user_id = auth.uid())
-- ισχύει ήδη και καλύπτει αυτόματα τις νέες στήλες — καμία αλλαγή πολιτικής.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.rent_comparables add column if not exists listing_type   text    default 'rent';   -- rent | sale
alter table public.rent_comparables add column if not exists asking_price   numeric default 0;        -- ζητούμενη τιμή πώλησης (€)
alter table public.rent_comparables add column if not exists price_per_sqm  numeric default 0;        -- €/τ.μ. πώλησης
alter table public.rent_comparables add column if not exists days_on_market integer default 0;        -- ημέρες στην αγορά
alter table public.rent_comparables add column if not exists sold_price     numeric default 0;        -- τελική τιμή πώλησης (0 = διαθέσιμο)

-- Γέμισε τυχόν NULL από παλιές εγγραφές (ασφαλές να ξανατρέξει).
update public.rent_comparables set listing_type = 'rent' where listing_type is null;

-- Περιορισμός τιμών listing_type (idempotent — προστίθεται μόνο αν λείπει).
do $$
begin
  alter table public.rent_comparables
    add constraint rent_comparables_listing_type_chk check (listing_type in ('rent','sale'));
exception
  when duplicate_object then null;
  when others then raise notice 'listing_type check skip: %', sqlerrm;
end $$;

-- Δείκτης για φιλτράρισμα ανά ακίνητο + τύπο αγγελίας.
create index if not exists rent_comparables_type_idx on public.rent_comparables(property_id, listing_type);
