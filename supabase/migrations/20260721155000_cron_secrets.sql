-- ═══════════════════════════════════════════════════════════════════════════
-- cron_secrets — κοινό μυστικό cron αποθηκευμένο στη ΒΔ. Το διαβάζουν και οι δύο
-- πλευρές ΜΕΣΑ στην Postgres: το pg_cron για να στείλει το x-cron-secret header,
-- και οι Edge Functions (send-newsletter / send-market-digest / send-reminders)
-- μέσω του service-role client τους για να το επαληθεύσουν.
--
-- Γιατί: έτσι δεν χρειάζεται ΚΑΝΕΝΑ χειροκίνητο μυστικό στο dashboard, ούτε
-- εξάρτηση από το (πιθανώς rotated) service-role key του vault. Μηδενική ρύθμιση.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.cron_secrets (
  name       text primary key,
  secret     text not null,
  created_at timestamptz not null default now()
);

-- RLS ενεργό ΧΩΡΙΣ policies → μόνο ο service_role (bypass RLS) και ο postgres
-- (pg_cron) διαβάζουν. anon/authenticated δεν έχουν καμία πρόσβαση.
alter table public.cron_secrets enable row level security;
revoke all on public.cron_secrets from anon, authenticated;

-- Δημιούργησε το μυστικό μία φορά (64 hex chars ~ 256-bit entropy). Το
-- gen_random_uuid() είναι πάντα διαθέσιμο — δεν εξαρτόμαστε από pgcrypto.
insert into public.cron_secrets (name, secret)
values ('email_cron', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;
