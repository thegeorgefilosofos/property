-- ─────────────────────────────────────────────────────────────────────────
-- report_branding — λευκή επωνυμία (white-label) στις εκτυπώσιμες αναφορές,
-- δυνατότητα του πλάνου «Επαγγελματίας». Ένα row ανά χρήστη (user-level), RLS
-- «μόνο ο ιδιοκτήτης». Το λογότυπο αποθηκεύεται ως data-URL (base64) στο logo_url.
-- ΑΣΦΑΛΕΣ & ΕΠΑΝΑΛΗΨΙΜΟ (idempotent) — τρέξε το όσες φορές θέλεις.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.report_branding (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  enabled       boolean     default true,
  company_name  text,
  logo_url      text,                       -- data:image/...;base64,....  (raster μόνο)
  accent_color  text        default '#1a73e8',
  phone         text,
  email         text,
  updated_at    timestamptz default now(),
  constraint report_branding_accent_hex
    check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$')
);

-- Idempotent προσθήκη στηλών/constraint αν ο πίνακας προϋπήρχε σε παλαιότερη μορφή
do $$
begin
  alter table public.report_branding add column if not exists enabled boolean default true;
  alter table public.report_branding add column if not exists company_name text;
  alter table public.report_branding add column if not exists logo_url text;
  alter table public.report_branding add column if not exists accent_color text default '#1a73e8';
  alter table public.report_branding add column if not exists phone text;
  alter table public.report_branding add column if not exists email text;
  alter table public.report_branding add column if not exists updated_at timestamptz default now();
exception when others then
  raise notice 'report_branding column add skip: %', sqlerrm;
end $$;

do $$
begin
  alter table public.report_branding
    add constraint report_branding_accent_hex
    check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$');
exception
  when duplicate_object then null;
  when others then raise notice 'report_branding check skip: %', sqlerrm;
end $$;

alter table public.report_branding enable row level security;

drop policy if exists "own_report_branding" on public.report_branding;
create policy "own_report_branding" on public.report_branding for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
