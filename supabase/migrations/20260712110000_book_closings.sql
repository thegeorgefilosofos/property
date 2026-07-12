-- ═══════════════════════════════════════════════════════════════════════════
-- Κλείσιμο χρήσης (period lock): αμετάβλητο στιγμιότυπο των αριθμών ενός έτους
-- ανά ακίνητο, ώστε «κλεισμένα βιβλία» να μη μεταβάλλονται σιωπηλά. Αν αλλάξουν
-- μετά τα δεδομένα, το UI δείχνει απόκλιση. RLS ανά χρήστη. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.book_closings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null,
  year        int  not null,
  snapshot    jsonb not null,
  locked_at   timestamptz not null default now()
);

create unique index if not exists uq_book_closing on public.book_closings(user_id, property_id, year);

alter table public.book_closings enable row level security;

drop policy if exists "own closing select" on public.book_closings;
create policy "own closing select" on public.book_closings
  for select using (auth.uid() = user_id);

drop policy if exists "own closing insert" on public.book_closings;
create policy "own closing insert" on public.book_closings
  for insert with check (auth.uid() = user_id);

-- ΚΡΙΣΙΜΟ: το κλείδωμα γίνεται με upsert (onConflict) — όταν υπάρχει ήδη εγγραφή για
-- (χρήστης, ακίνητο, έτος), το upsert κάνει UPDATE. Χωρίς πολιτική UPDATE, το RLS το
-- μπλοκάρει σιωπηλά (π.χ. επανα-κλείδωμα ή «Ενημέρωση» μετά από απόκλιση δεν αποθηκεύεται).
drop policy if exists "own closing update" on public.book_closings;
create policy "own closing update" on public.book_closings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own closing delete" on public.book_closings;
create policy "own closing delete" on public.book_closings
  for delete using (auth.uid() = user_id);
