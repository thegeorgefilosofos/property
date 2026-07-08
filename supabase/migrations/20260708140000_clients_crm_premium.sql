-- ═══════════════════════════════════════════════════════════════════════════
-- Πελατολόγιο premium: εμπλουτισμός clients + ιστορικό διαμονών (client_stays)
-- + χρονολόγιο σχολίων/επικοινωνιών (client_notes). Ιδανικό για ιδιοκτήτες
-- βραχυχρόνιας/μακροχρόνιας μίσθωσης (ιστορικό επισκεπτών, φθορές, έσοδα) και
-- για μεσίτες (ανάγκες/προϋπολογισμός πελάτη). Ιδιοκτησία ανά χρήστη (RLS).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Εμπλουτισμός του clients ──
alter table public.clients add column if not exists rating       integer;            -- 0-5 συνολική βαθμολογία
alter table public.clients add column if not exists tags         text[] default '{}';
alter table public.clients add column if not exists do_not_rent  boolean default false; -- «μαύρη λίστα» / προσοχή
alter table public.clients add column if not exists address      text;
alter table public.clients add column if not exists id_number    text;               -- ταυτότητα/διαβατήριο
alter table public.clients add column if not exists nationality  text;
alter table public.clients add column if not exists budget       numeric;            -- μεσίτης: προϋπολογισμός πελάτη
alter table public.clients add column if not exists needs        text;               -- μεσίτης: ανάγκες/επιθυμίες
alter table public.clients add column if not exists source       text;               -- πηγή (Airbnb/Booking/σύσταση…)

-- ── client_stays: ιστορικό διαμονών/επισκέψεων ──
create table if not exists public.client_stays (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  property_id  text,                          -- προαιρετική σύνδεση ακινήτου (user_properties.id ως text)
  check_in     date,
  check_out    date,
  nights       integer,
  guests       integer,
  nightly_rate numeric,
  total        numeric,
  channel      text,                          -- Airbnb | Booking | direct | other
  rating       integer,                       -- 0-5 για τη συγκεκριμένη διαμονή
  damages      boolean default false,
  damage_cost  numeric,
  damage_note  text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists client_stays_user_idx   on public.client_stays(user_id);
create index if not exists client_stays_client_idx on public.client_stays(client_id);

alter table public.client_stays enable row level security;
drop policy if exists own_client_stays on public.client_stays;
create policy own_client_stays on public.client_stays for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── client_notes: χρονολόγιο σχολίων/επικοινωνιών ──
create table if not exists public.client_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  kind       text default 'note',             -- note | call | email | visit | damage | other
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists client_notes_client_idx on public.client_notes(client_id);

alter table public.client_notes enable row level security;
drop policy if exists own_client_notes on public.client_notes;
create policy own_client_notes on public.client_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime (ζωντανές αλλαγές), exception-safe
do $$
begin
  alter publication supabase_realtime add table public.client_stays;
exception when duplicate_object then null; when others then raise notice 'rt client_stays skip: %', sqlerrm;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.client_notes;
exception when duplicate_object then null; when others then raise notice 'rt client_notes skip: %', sqlerrm;
end $$;
