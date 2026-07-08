-- ═══════════════════════════════════════════════════════════════════════════
-- Loan market reference data: market_rates, bank_rates, loan_programs + view.
-- These are NON-user reference tables (same για όλους). Ο πελάτης τα διαβάζει
-- (RLS: public read), τα edge functions (euribor-updater / market-data-updater)
-- τα γράφουν με service role (παρακάμπτει RLS). Οι τιμές είναι ΕΝΔΕΙΚΤΙΚΕΣ, με
-- ημερομηνία επιβεβαίωσης, ώστε να μην είμαστε παραπλανητικοί.
-- Idempotent: create-if-not-exists + upsert.
-- ═══════════════════════════════════════════════════════════════════════════

-- Reference/seed δεδομένα (χωρίς δεδομένα χρήστη): τα ξαναφτιάχνουμε καθαρά ώστε το
-- σχήμα να είναι ντετερμινιστικό ακόμη κι αν προϋπήρχε διαφορετική έκδοση των πινάκων.
drop view  if exists public.active_loan_programs;
drop table if exists public.loan_programs cascade;
drop table if exists public.bank_rates    cascade;
drop table if exists public.market_rates  cascade;

-- ── market_rates: Euribor / ΕΚΤ / ΤτΕ (τροφοδοτείται καθημερινά από edge function) ──
create table if not exists public.market_rates (
  id                bigint generated always as identity primary key,
  euribor_1m        numeric,
  euribor_3m        numeric,
  euribor_6m        numeric,
  euribor_12m       numeric,
  ecb_rate          numeric,
  ecb_dfl           numeric,
  bog_housing_new   numeric,
  bog_housing_stock numeric,
  source_euribor    text,
  source_bog        text,
  rate_changed      boolean default false,
  updated_at        timestamptz not null default now()
);

-- ── bank_rates: επιτόκια τραπεζών (ενδεικτικά, με verified_at + source_url) ──
create table if not exists public.bank_rates (
  bank_id             text primary key,
  bank_name           text not null,
  color               text,
  fixed_3yr           text,
  fixed_5yr           text,
  fixed_10yr          text,
  fixed_15yr          text,
  fixed_20yr          text,
  variable_spread_min numeric,
  variable_spread_max numeric,
  fixed_min           numeric,
  max_ltv             integer,
  max_years           integer,
  max_amount          integer,
  min_amount          integer,
  green_discount      numeric,
  spiti_mou           boolean default false,
  features            text[] default '{}',
  programs            text[] default '{}',
  fees                text,
  note                text,
  url                 text,
  source_url          text,
  verified_at         date,
  is_active           boolean default true
);

-- ── loan_programs: κρατικά προγράμματα (deadline = ημερομηνία για φιλτράρισμα) ──
create table if not exists public.loan_programs (
  program_id          text primary key,
  name                text not null,
  icon                text,
  color               text,
  status              text default 'active',
  type_label          text,
  description         text,
  how_it_works        text,
  extra_info          text,
  savings_example     text,
  max_amount          integer,
  max_prop_value      integer,
  max_ltv             integer,
  max_sqm             integer,
  age_min             integer,
  age_max             integer,
  duration_label      text,
  deadline            date,
  deadline_label      text,
  deadline_urgent     boolean default false,
  total_budget        text,
  criteria            text[] default '{}',
  participating_banks text[] default '{}',
  source_url          text,
  verified_at         date
);

-- Το view που διαβάζει ο πελάτης: κρύβει ό,τι έχει λήξει (deadline < σήμερα) ή είναι 'ended'.
create or replace view public.active_loan_programs as
  select lp.*, lp.program_id as id
  from public.loan_programs lp
  where coalesce(lp.status, 'active') <> 'ended'
    and (lp.deadline is null or lp.deadline >= current_date);

-- ── RLS: όλοι διαβάζουν (reference data)· εγγραφή μόνο service role (edge functions) ──
alter table public.market_rates  enable row level security;
alter table public.bank_rates    enable row level security;
alter table public.loan_programs enable row level security;

drop policy if exists market_rates_read  on public.market_rates;
drop policy if exists bank_rates_read     on public.bank_rates;
drop policy if exists loan_programs_read  on public.loan_programs;
create policy market_rates_read  on public.market_rates  for select using (true);
create policy bank_rates_read     on public.bank_rates    for select using (true);
create policy loan_programs_read  on public.loan_programs for select using (true);

grant select on public.market_rates, public.bank_rates, public.loan_programs, public.active_loan_programs to anon, authenticated;

-- ── Seed: market_rates (Euribor 3μ 2,324% @ 30/06/2026· ενδεικτικά, ανανεώνονται live) ──
insert into public.market_rates
  (euribor_1m, euribor_3m, euribor_6m, euribor_12m, ecb_rate, ecb_dfl, bog_housing_new, bog_housing_stock, source_euribor, source_bog, rate_changed, updated_at)
select 2.28, 2.324, 2.34, 2.40, 2.15, 2.00, 3.10, 3.50, 'euribor-rates.eu', 'Τράπεζα Ελλάδος', false, timestamptz '2026-06-30 00:00:00+00'
where not exists (select 1 from public.market_rates);

-- ── Seed: bank_rates (7 τράπεζες, verified 2026-07-08, ενδεικτικά) ──
insert into public.bank_rates (bank_id, bank_name, color, fixed_3yr, fixed_5yr, fixed_10yr, fixed_15yr, fixed_20yr, variable_spread_min, variable_spread_max, fixed_min, max_ltv, max_years, max_amount, min_amount, green_discount, spiti_mou, features, programs, fees, note, url, source_url, verified_at, is_active) values
 ('eurobank','Eurobank','#1a73e8','2.50-2.90','3.40-3.50','3.80-3.90','4.10-4.20','4.10-4.20',0.60,2.45,2.50,90,35,500000,20000,0.20,true,
   array['Spread από 0,60%','Χωρίς έξοδα έγκρισης','Νομικός και τεχνικός έλεγχος','Προέγκριση σε 48 ώρες','Υπογραφή μέσω gov.gr'],
   array['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],'Χωρίς έξοδα εξέτασης','Από τα χαμηλότερα spread αγοράς','https://www.eurobank.gr/el/retail/proionta-upiresies/proionta/daneia/stegastika','https://vresdaneio.gr',date '2026-07-08',true),
 ('ethniki','Εθνική Τράπεζα','#1a73e8','2.90-3.20','3.50','3.70','4.20','4.20',1.60,2.85,2.80,90,35,500000,30000,0.25,true,
   array['Έως 90% της αξίας','Σταθερό 3 έως 30 έτη','Χωρίς έξοδα αίτησης','Ενεργειακή έκπτωση -0,25%','Τρίτεκνοι: +50% επιδότηση'],
   array['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],'Χωρίς έξοδα εξέτασης','Υψηλό ποσοστό χρηματοδότησης','https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia','https://vresdaneio.gr',date '2026-07-08',true),
 ('alpha','Alpha Bank','#1a73e8','2.80','3.40','3.80','4.10','4.20',1.80,2.20,2.50,90,35,300000,25000,0.10,true,
   array['2,50% για νέους (3ετία)','Έως 90% της αξίας','Δυνατότητα περιόδου χάριτος','Χωρίς έξοδα','Πρόγραμμα ανακαίνισης'],
   array['Σπίτι μου ΙΙ','Alpha Πρώτη Κατοικία','Ανακαίνιση'],'Χωρίς έξοδα εξέτασης','Ειδικό πρόγραμμα για νέους','https://www.alpha.gr/el/idiotika/daneia/stegastika-daneia','https://vresdaneio.gr',date '2026-07-08',true),
 ('piraeus','Τράπεζα Πειραιώς','#1a73e8','2.40-4.70','2.40-4.70','2.40-4.70','2.40-4.70','2.40-4.70',1.40,2.45,2.40,90,35,500000,20000,0.15,true,
   array['Πράσινα spread από 1,25%','Ψηφιακή διαδικασία','Online εκτίμηση','Ταχεία εξυπηρέτηση'],
   array['Σπίτι μου ΙΙ','Αναβαθμίζω','Εξοικονομώ'],'Έξοδα φακέλου από 300€','Καλύτερο για πράσινα δάνεια','https://www.piraeusbank.gr/el/idiwtes/proionta-upiresies/stegastika-daneia','https://vresdaneio.gr',date '2026-07-08',true),
 ('optima','Optima Bank','#1a73e8','3.90','3.50-4.00','3.40-3.90','4.30-4.80','4.30-4.80',2.00,3.00,2.90,75,30,300000,20000,0.10,false,
   array['Γρήγορη έγκριση','Premium εξυπηρέτηση','Σταθερό και κυμαινόμενο','Αναχρηματοδότηση'],
   array['Ανακαίνιση','Εξοικονομώ'],'Τιμολόγιο κατά περίπτωση','Premium εξυπηρέτηση','https://www.optimabank.gr/individuals/daneia/stegastiko-daneio/','https://vresdaneio.gr',date '2026-07-08',true),
 ('credia','CrediaBank','#1a73e8','3.00-3.30','3.60-3.90','4.00-4.20','4.30-4.60','4.50-4.70',1.60,2.70,2.60,80,30,250000,15000,0.10,true,
   array['Ευέλικτοι όροι','Μικρά ποσά','Γρήγορη εξέταση','Σπίτι μου ΙΙ'],
   array['Σπίτι μου ΙΙ','Εξοικονομώ'],'Κατά περίπτωση','Ευελιξία και μικρά ποσά','https://www.crediabank.gr','https://vresdaneio.gr',date '2026-07-08',true),
 ('attica','Attica Bank','#1a73e8','3.20-3.60','3.70-4.00','4.00-4.30','4.40-4.70','4.50-4.80',1.80,2.90,3.00,75,30,200000,15000,0.10,false,
   array['Ευέλικτοι όροι','Γρήγορη εξέταση'],
   array['Εξοικονομώ'],'Κατά περίπτωση','Ευέλικτοι όροι','https://www.atticabank.gr','https://vresdaneio.gr',date '2026-07-08',true)
on conflict (bank_id) do update set
  bank_name=excluded.bank_name, color=excluded.color,
  fixed_3yr=excluded.fixed_3yr, fixed_5yr=excluded.fixed_5yr, fixed_10yr=excluded.fixed_10yr,
  fixed_15yr=excluded.fixed_15yr, fixed_20yr=excluded.fixed_20yr,
  variable_spread_min=excluded.variable_spread_min, variable_spread_max=excluded.variable_spread_max,
  fixed_min=excluded.fixed_min, max_ltv=excluded.max_ltv, max_years=excluded.max_years,
  max_amount=excluded.max_amount, min_amount=excluded.min_amount, green_discount=excluded.green_discount,
  spiti_mou=excluded.spiti_mou, features=excluded.features, programs=excluded.programs,
  fees=excluded.fees, note=excluded.note, url=excluded.url, source_url=excluded.source_url,
  verified_at=excluded.verified_at, is_active=excluded.is_active;

-- ── Seed: loan_programs (κρατικά· deadline = ημερομηνία λήξης για το view) ──
insert into public.loan_programs (program_id, name, icon, color, status, type_label, description, how_it_works, extra_info, savings_example, max_amount, max_prop_value, max_ltv, max_sqm, age_min, age_max, duration_label, deadline, deadline_label, deadline_urgent, total_budget, criteria, participating_banks, source_url, verified_at) values
 ('spiti_mou_2','Σπίτι μου ΙΙ','home','#1a73e8','active','Κρατικό, άτοκο 50% (75% για τρίτεκνους)',
   'Χρηματοδότηση έως 190.000€ για πρώτη και κύρια κατοικία. Το 50% του δανείου είναι άτοκο (Ταμείο Ανάκαμψης), το υπόλοιπο 50% με επιτόκιο τράπεζας.',
   '50% του δανείου άτοκο (Ταμείο Ανάκαμψης), 50% έντοκο (τράπεζα). Τρίτεκνοι/πολύτεκνοι: 75% άτοκο / 25% έντοκο.',
   'Προθεσμία αίτησης 31/05/2026, σύναψη σύμβασης έως 31/08/2026. Τρίτεκνοι: το άτοκο σκέλος στο 75%.',
   'Δάνειο 150.000€ × 25 έτη με 50% άτοκο: εξοικονόμηση δεκάδων χιλιάδων € σε τόκους.',
   190000,250000,90,150,25,50,'3 έως 30 έτη (χωρίς περίοδο χάριτος)',
   date '2026-08-31','Έως 31/08/2026 (αίτηση έως 31/05/2026)',true,'2 δισ. ευρώ (50% Ταμείο Ανάκαμψης + 50% τράπεζες)',
   array['Ηλικία 25-50 ετών','Πρώτη και κύρια κατοικία','Εισόδημα ενδεικτικά: έγγαμοι 35.000€ +5.000€/παιδί, μονογονεϊκές 39.000€ (επιβεβαίωσε στην πύλη)','Αξία συμβολαίου ≤ 250.000€','Έως 150 τετραγωνικά','Έτος κατασκευής έως και 2007'],
   array['Εθνική','Alpha','Eurobank','Πειραιώς','Optima','CrediaBank'],'https://stegasi.gov.gr/programs/spiti-mou-ii/',date '2026-07-08'),
 ('anavathmizo','Αναβαθμίζω το Σπίτι μου','bolt','#1a73e8','active','Κρατικό, δάνειο ενεργειακής αναβάθμισης',
   'Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο από το Ταμείο Ανάκαμψης για ενεργειακές παρεμβάσεις.',
   'Δάνειο για ενεργειακές παρεμβάσεις με επιδοτούμενο επιτόκιο.',
   'Αυξημένη επιδότηση για ΑμεΑ, τρίτεκνους, πολύτεκνους.','Εξοικονόμηση ενέργειας συν χαμηλό επιτόκιο.',
   25000,null,null,null,18,null,'3 έως 15 έτη',
   date '2026-08-31','Έως 31/08/2026',true,'80 εκ. ευρώ',
   array['ΠΕΑ πριν και μετά','Αναβάθμιση ≥ 3 ενεργειακές κατηγορίες','Εξοικονόμηση > 30%'],
   array['Εθνική','Alpha','Eurobank','Πειραιώς','CrediaBank'],'https://greece20.gov.gr/home-loans/',date '2026-07-08'),
 ('exoikonomo_2025','Εξοικονομώ 2025','leaf','#1a73e8','ended','Επιδότηση ενεργειακής αναβάθμισης',
   'Η αρχική προθεσμία (30/06/2026) παρήλθε, εκκρεμεί ανακοίνωση παράτασης.',
   'Επιδότηση κουφωμάτων, μόνωσης, θέρμανσης, φωτοβολταϊκών.','Επιβεβαίωσε στο exoikonomo2025.gov.gr.','Μείωση λογαριασμών συν επιδότηση.',
   null,null,null,null,18,null,'Εφάπαξ',
   date '2026-06-30','Έληξε 30/06/2026, εκκρεμεί παράταση',false,'Ταμείο Ανάκαμψης',
   array['Εξοικονόμηση > 30%','Αναβάθμιση ≥ 3 κατηγορίες','ΠΕΑ πριν και μετά'],
   array['Εθνική','Alpha','Eurobank','Πειραιώς'],'https://exoikonomo2025.gov.gr/',date '2026-07-08'),
 ('anakainizo_noikazo','Ανακαινίζω και Νοικιάζω','key','#1a73e8','active','Επιδότηση ανακαίνισης και εγγυημένο ενοίκιο',
   '40% επιδότηση ανακαίνισης συν εγγυημένο ενοίκιο για 5 έτη μέσω ΟΠΕΚΑ.',
   '40% επιδότηση ανακαίνισης και ενοίκιο αγοράς από ΟΠΕΚΑ για 5 έτη.',
   'Εγγυημένο εισόδημα, ιδανικό για επενδυτές.','Κενό ακίνητο: ανακαίνιση συν εγγυημένο εισόδημα.',
   15000,null,null,null,18,null,'5 έτη',
   null,'Τρέχον, έλεγξε στον φορέα',false,'Τρέχον',
   array['Κενό ακίνητο ≥ 3 έτη','Δαπάνη 5.000-40.000€','Μίσθωση μέσω ΟΠΕΚΑ','Δέσμευση 5ετίας'],
   array['Εθνική','Πειραιώς','Eurobank'],'https://www.opeka.gr',date '2026-07-08')
on conflict (program_id) do update set
  name=excluded.name, color=excluded.color, status=excluded.status, type_label=excluded.type_label,
  description=excluded.description, how_it_works=excluded.how_it_works, extra_info=excluded.extra_info,
  savings_example=excluded.savings_example, max_amount=excluded.max_amount, max_prop_value=excluded.max_prop_value,
  max_ltv=excluded.max_ltv, max_sqm=excluded.max_sqm, age_min=excluded.age_min, age_max=excluded.age_max,
  duration_label=excluded.duration_label, deadline=excluded.deadline, deadline_label=excluded.deadline_label,
  deadline_urgent=excluded.deadline_urgent, total_budget=excluded.total_budget, criteria=excluded.criteria,
  participating_banks=excluded.participating_banks, source_url=excluded.source_url, verified_at=excluded.verified_at;
