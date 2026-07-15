-- ─────────────────────────────────────────────────────────────────────────────
-- Διαχείριση επιτοκίων τραπεζών: λίστα διαχειριστών (app_admins) + πολιτική RLS
-- ώστε ο διαχειριστής να διορθώνει γρήγορα το `bank_rates` απευθείας από την
-- εφαρμογή (χωρίς SQL, χωρίς edge function). Μία και μόνη πηγή αλήθειας: UI και
-- βάση ελέγχουν την ίδια λίστα, οπότε δεν υπάρχει email σκαρφαλωμένο στον κώδικα.
--
-- ── One-time setup ──
--   Πρόσθεσε τον εαυτό σου ως διαχειριστή (SQL Editor), με το email σύνδεσης:
--     insert into public.app_admins (email) values ('you@example.com')
--       on conflict do nothing;
-- ─────────────────────────────────────────────────────────────────────────────

-- Λίστα διαχειριστών εφαρμογής (email = το email σύνδεσης στο Supabase Auth).
create table if not exists public.app_admins (
  email       text primary key,
  created_at  timestamptz default now()
);

alter table public.app_admins enable row level security;

-- Ο κάθε συνδεδεμένος χρήστης βλέπει ΜΟΝΟ τη δική του γραμμή — αρκεί για να
-- ελέγξει το UI αν είναι διαχειριστής, χωρίς να εκθέτει όλη τη λίστα.
drop policy if exists app_admins_self on public.app_admins;
create policy app_admins_self on public.app_admins
  for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

grant select on public.app_admins to authenticated;

-- bank_rates: εγγραφή (insert/update/delete) μόνο από διαχειριστές. Η ανάγνωση
-- (select using true) παραμένει από την αρχική migration — reference data.
drop policy if exists bank_rates_admin_write on public.bank_rates;
create policy bank_rates_admin_write on public.bank_rates
  for all to authenticated
  using (exists (
    select 1 from public.app_admins a where a.email = (auth.jwt() ->> 'email')
  ))
  with check (exists (
    select 1 from public.app_admins a where a.email = (auth.jwt() ->> 'email')
  ));

grant insert, update, delete on public.bank_rates to authenticated;
