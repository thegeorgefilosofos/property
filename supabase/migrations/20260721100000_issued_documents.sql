-- ═══════════════════════════════════════════════════════════════════════════
-- issued_documents — μητρώο επίσημων εγγράφων (true PDF) για επαλήθευση.
-- Κάθε επίσημο PDF παίρνει μοναδικό, μη-απαριθμήσιμο αρ. εγγράφου + QR που
-- δείχνει στο δημόσιο /verify/<id>. Η επαλήθευση γίνεται μέσω SECURITY DEFINER
-- RPC που επιστρέφει ΜΟΝΟ ασφαλή, μη-ευαίσθητα πεδία (τύπος, αντικείμενο,
-- περίοδος, ημ. έκδοσης, εκδότης) — ποτέ το summary ή τα ποσά.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.issued_documents (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_type   text not null,
  subject    text not null default '',
  period     text not null default '',
  issued_at  timestamptz not null default now(),
  summary    jsonb not null default '{}'::jsonb,
  checksum   text not null default ''
);

create index if not exists issued_documents_user_idx on public.issued_documents(user_id, issued_at desc);

alter table public.issued_documents enable row level security;

drop policy if exists own_issued_documents on public.issued_documents;
create policy own_issued_documents on public.issued_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Δημόσια επαλήθευση: μόνο ασφαλή πεδία, με εκδότη από το (ενεργό) branding.
create or replace function public.verify_document(p_id text)
returns table(id text, doc_type text, subject text, period text, issued_at timestamptz, issuer text)
language sql security definer stable set search_path = public as $$
  select d.id, d.doc_type, d.subject, d.period, d.issued_at,
         coalesce(nullif(btrim(b.company_name), ''), 'Property OS') as issuer
  from public.issued_documents d
  left join public.report_branding b on b.user_id = d.user_id and b.enabled = true
  where d.id = p_id;
$$;

revoke all on function public.verify_document(text) from public;
grant execute on function public.verify_document(text) to anon, authenticated;
