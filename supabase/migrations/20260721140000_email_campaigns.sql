-- ═══════════════════════════════════════════════════════════════════════════
-- email_campaigns / email_recipients — μαζική & αυτοματοποιημένη επικοινωνία με
-- πελάτες μέσω Resend. Κάθε αποστολή (καμπάνια) κρατά τι στάλθηκε, σε ποιους,
-- και το αποτέλεσμα ανά παραλήπτη (sent/failed + Resend id) για ιχνηλασιμότητα.
-- RLS: αυστηρά ανά χρήστη (ο καθένας βλέπει μόνο τις δικές του καμπάνιες).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.email_campaigns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  subject         text not null,
  body_html       text not null default '',
  kind            text not null default 'broadcast',  -- broadcast | statement | reminder | custom
  recipient_count int  not null default 0,
  sent_count      int  not null default 0,
  failed_count    int  not null default 0,
  status          text not null default 'draft',       -- draft | sending | sent | partial | failed
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create table if not exists public.email_recipients (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.email_campaigns(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_id    uuid,
  email        text not null,
  name         text,
  status       text not null default 'pending',        -- pending | sent | failed
  error        text,
  resend_id    text,
  sent_at      timestamptz
);

create index if not exists email_campaigns_user_idx  on public.email_campaigns(user_id, created_at desc);
create index if not exists email_recipients_camp_idx on public.email_recipients(campaign_id);

alter table public.email_campaigns  enable row level security;
alter table public.email_recipients enable row level security;

drop policy if exists own_email_campaigns on public.email_campaigns;
create policy own_email_campaigns on public.email_campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own_email_recipients on public.email_recipients;
create policy own_email_recipients on public.email_recipients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
