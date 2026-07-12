-- ═══════════════════════════════════════════════════════════════════════════
-- Τραπεζικές κινήσεις που εισάγει ο χρήστης (CSV) για αυτόματη αντιστοίχιση σε
-- ενοίκια/έξοδα. Κρατάμε μόνο ένα dedup_hash ώστε η επανεισαγωγή του ίδιου
-- αρχείου να μη διπλοκαταχωρεί. RLS ανά χρήστη. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.bank_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  property_id uuid,
  txn_date    date,
  description text,
  amount      numeric not null,
  dedup_hash  text not null,
  imported_at timestamptz not null default now()
);

create unique index if not exists uq_bank_txn_dedup on public.bank_transactions(user_id, dedup_hash);
create index if not exists idx_bank_txn_user on public.bank_transactions(user_id);

alter table public.bank_transactions enable row level security;

drop policy if exists "own bank txn select" on public.bank_transactions;
create policy "own bank txn select" on public.bank_transactions
  for select using (auth.uid() = user_id);

drop policy if exists "own bank txn insert" on public.bank_transactions;
create policy "own bank txn insert" on public.bank_transactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "own bank txn delete" on public.bank_transactions;
create policy "own bank txn delete" on public.bank_transactions
  for delete using (auth.uid() = user_id);
