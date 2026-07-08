-- ═══════════════════════════════════════════════════════════════════════════
-- Έγγραφα ανά πελάτη (ταυτότητα, συμβόλαιο, αποδείξεις). Τα ΑΡΧΕΙΑ αποθηκεύονται
-- στο υπάρχον bucket 'property-files' κάτω από τον φάκελο του χρήστη
-- (${user_id}/clients/${client_id}/...), άρα καλύπτονται από τα υπάρχοντα storage
-- policies. Εδώ κρατάμε μόνο τα metadata, με RLS ανά χρήστη. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.client_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null,
  file_path  text not null,               -- διαδρομή στο bucket property-files
  mime       text,
  size       bigint,
  kind       text default 'other',        -- id | contract | receipt | other
  created_at timestamptz not null default now()
);
create index if not exists client_documents_client_idx on public.client_documents(client_id);

alter table public.client_documents enable row level security;
drop policy if exists own_client_documents on public.client_documents;
create policy own_client_documents on public.client_documents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
