-- ═══════════════════════════════════════════════════════════════════════════
-- Ενοικιαστές — μοντέλο μητρώου (roster) & ιστορικού ανά ακίνητο.
-- Ένα ακίνητο μπορεί να έχει ΠΟΛΛΟΥΣ ενοικιαστές στο χρόνο (τρέχων + ιστορικοί).
-- Προσθέτουμε κατάσταση, ημέρα πληρωμής ενοικίου, και στοιχεία εγγύησης/κύκλου.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tenants add column if not exists status         text default 'active';  -- 'active' | 'past'
alter table public.tenants add column if not exists rent_due_day   integer;                 -- ημέρα του μήνα που περιμένεις το ενοίκιο (1-28)
alter table public.tenants add column if not exists deposit_method  text;                    -- πώς πληρώθηκε η εγγύηση (μετρητά/κατάθεση/…)
alter table public.tenants add column if not exists deposit_paid_on date;                    -- πότε καταβλήθηκε η εγγύηση
alter table public.tenants add column if not exists move_out_date   date;                    -- πραγματική αποχώρηση (για ιστορικό)

-- Φθορές & επισκευές ανά ενοικιαστή / χρόνο μίσθωσης.
create table if not exists public.tenant_damages (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references public.tenants(id) on delete cascade,
  property_id       uuid,
  user_id           uuid not null,
  occurred_on       date,
  description       text not null,
  cost              numeric,
  charged_to_tenant boolean default false,
  repaired          boolean default false,
  repaired_on       date,
  notes             text,
  created_at        timestamptz not null default now()
);

create index if not exists tenant_damages_tenant_idx   on public.tenant_damages (tenant_id);
create index if not exists tenant_damages_property_idx on public.tenant_damages (property_id);

alter table public.tenant_damages enable row level security;
drop policy if exists own_tenant_damages on public.tenant_damages;
create policy own_tenant_damages on public.tenant_damages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
