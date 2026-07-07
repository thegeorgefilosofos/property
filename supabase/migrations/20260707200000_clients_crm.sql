-- ─────────────────────────────────────────────────────────────────────────
-- clients — Πελατολόγιο (ιδιοκτήτες / υποψήφιοι / πελάτες) + ελαφρύ pipeline
-- ευκαιριών (στάδιο, αξία, επόμενη ενέργεια) για μεσίτες & λογιστικά γραφεία.
-- Κάθε ακίνητο (user_properties) συνδέεται προαιρετικά με έναν πελάτη μέσω της
-- νέας στήλης client_id. Ιδιοκτησία ανά χρήστη (user_id = auth.uid()).
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null default 'owner',   -- owner | lead | client
  full_name    text not null,
  afm          text,
  phone        text,
  email        text,
  notes        text,
  stage        text not null default 'lead',    -- lead | viewing | offer | closed
  deal_value   numeric,
  next_action  text,
  next_date    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists clients_user_idx on public.clients(user_id);

-- CHECK περιορισμοί τύπου/σταδίου (exception-safe: δεν σπάει σε επανεκτέλεση)
do $$
begin
  alter table public.clients add constraint clients_type_chk
    check (type in ('owner','lead','client'));
exception when duplicate_object then null;
when others then raise notice 'clients_type_chk skip: %', sqlerrm;
end $$;

do $$
begin
  alter table public.clients add constraint clients_stage_chk
    check (stage in ('lead','viewing','offer','closed'));
exception when duplicate_object then null;
when others then raise notice 'clients_stage_chk skip: %', sqlerrm;
end $$;

-- RLS: μόνο ο ιδιοκτήτης βλέπει/γράφει τις δικές του καταχωρήσεις
alter table public.clients enable row level security;
drop policy if exists "own_clients" on public.clients;
create policy "own_clients" on public.clients for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Σύνδεση ακινήτου → πελάτη (προαιρετική). ON DELETE SET NULL: η διαγραφή
-- πελάτη ΔΕΝ διαγράφει το ακίνητο, απλώς λύνει τη σύνδεση.
do $$
begin
  alter table public.user_properties
    add column if not exists client_id uuid references public.clients(id) on delete set null;
exception when others then raise notice 'user_properties.client_id skip: %', sqlerrm;
end $$;

create index if not exists user_properties_client_idx on public.user_properties(client_id);

-- Realtime (ζωντανές αλλαγές πελατολογίου), exception-safe
do $$
begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null;
when others then raise notice 'realtime clients skip: %', sqlerrm;
end $$;
