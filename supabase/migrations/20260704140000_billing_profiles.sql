-- ─────────────────────────────────────────────────────────────────────────
-- billing_profiles — στοιχεία χρέωσης/τιμολόγησης ανά χρήστη. Συμπληρώνονται
-- ΠΡΙΝ την ενσωμάτωση Stripe, ώστε όταν προστεθεί η πληρωμή να «κουμπώσει»
-- χωρίς αλλαγή UI. Καμία κάρτα δεν αποθηκεύεται εδώ (αυτό το κάνει ο Stripe).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.billing_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  doc_type      text        default 'receipt',   -- receipt (Απόδειξη) | invoice (Τιμολόγιο)
  full_name     text,
  company_name  text,
  afm           text,                             -- ΑΦΜ
  doy           text,                             -- ΔΟΥ
  profession    text,                             -- Δραστηριότητα/Επάγγελμα
  address       text,
  city          text,
  postal_code   text,
  country       text        default 'GR',
  phone         text,
  plan          text        default 'trial',      -- trial | monthly | annual
  billing_cycle text        default 'monthly',    -- monthly | annual
  -- Πεδία που θα γεμίσει ο Stripe αργότερα (τα κρατάμε έτοιμα, κενά προς το παρόν)
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text default 'trialing', -- trialing | active | past_due | canceled
  updated_at    timestamptz default now()
);

alter table public.billing_profiles enable row level security;

drop policy if exists "own_billing_profile" on public.billing_profiles;
create policy "own_billing_profile" on public.billing_profiles for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
