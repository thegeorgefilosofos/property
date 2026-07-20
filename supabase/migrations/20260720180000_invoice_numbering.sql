-- ─────────────────────────────────────────────────────────────────────────
-- Αρίθμηση παραστατικών (OSS-ready) + σκελετός πίνακα εκδοθέντων παραστατικών.
--
-- Νόμιμη απαίτηση (ΑΑΔΕ/myDATA): μοναδικός, σειριακός, ΧΩΡΙΣ ΚΕΝΑ αριθμός ανά
-- σειρά και έτος. Η next_invoice_number αυξάνει ατομικά έναν μετρητή και
-- επιστρέφει τον επόμενο αριθμό — καλείται ΜΟΝΟ από το backend (service_role)
-- όταν το Stripe εκδίδει παραστατικό, ώστε να μη δημιουργούνται κενά.
--
-- Ο πίνακας invoices κρατά την ανάλυση ΦΠΑ ανά χώρα/καθεστώς (domestic / OSS /
-- reverse charge / εκτός ΕΕ), έτοιμος για δηλώσεις OSS. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- Μετρητής ανά σειρά/έτος (η εταιρεία μας είναι ο εκδότης → global, όχι ανά χρήστη).
create table if not exists public.invoice_counters (
  series  text   not null,
  year    int    not null,
  last_no bigint not null default 0,
  primary key (series, year)
);
alter table public.invoice_counters enable row level security;
-- (Χωρίς policies: πρόσβαση μόνο από backend/service_role.)

create or replace function public.next_invoice_number(p_series text, p_year int)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into invoice_counters(series, year, last_no)
  values (p_series, p_year, 1)
  on conflict (series, year)
    do update set last_no = invoice_counters.last_no + 1
  returning last_no into v;
  return v;
end; $$;

revoke all on function public.next_invoice_number(text, int) from public;
-- (Δεν δίνεται σε authenticated: την καλεί μόνο ο εκδότης-backend.)

-- Εκδοθέντα παραστατικά (γεμίζει από το Stripe webhook· τώρα μένει σκελετός).
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null,          -- π.χ. ΤΠΥ-2026-000123
  series        text not null,
  year          int  not null,
  user_id       uuid references auth.users(id) on delete set null,
  country       text,
  vat_treatment text,                           -- domestic | oss_b2c | reverse_charge | outside_eu
  currency      text default 'EUR',
  net           numeric(12,2),
  vat_pct       numeric(5,2),
  vat_amount    numeric(12,2),
  gross         numeric(12,2),
  stripe_ref    text,
  issued_at     timestamptz not null default now()
);
create index if not exists idx_invoices_user on public.invoices(user_id, issued_at desc);

alter table public.invoices enable row level security;
drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own" on public.invoices for select using (user_id = auth.uid());
-- (Εγγραφή μόνο από backend/service_role· ο χρήστης βλέπει μόνο τα δικά του.)
