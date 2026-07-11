-- Ζωντανή συνδρομή ημερολογίου (webcal): κάθε χρήστης έχει ένα μυστικό token με το
-- οποίο εξωτερικά ημερολόγια (Google/Apple/Outlook) διαβάζουν ένα .ics feed που
-- ενημερώνεται ΜΟΝΟ του. Το token είναι το μυστικό — γι' αυτό RLS ανά χρήστη· το
-- Edge Function `calendar-feed` το επιλύει με service role.
create table if not exists public.calendar_feed_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text unique not null default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  created_at timestamptz not null default now()
);

alter table public.calendar_feed_tokens enable row level security;

drop policy if exists "own feed token select" on public.calendar_feed_tokens;
create policy "own feed token select" on public.calendar_feed_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "own feed token insert" on public.calendar_feed_tokens;
create policy "own feed token insert" on public.calendar_feed_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "own feed token delete" on public.calendar_feed_tokens;
create policy "own feed token delete" on public.calendar_feed_tokens
  for delete using (auth.uid() = user_id);
