-- ═══════════════════════════════════════════════════════════════════════════
-- Email marketing (soft opt-in + απεγγραφή) — newsletter «νέες δυνατότητες» &
-- εβδομαδιαίο market digest. GDPR: όλοι εγγεγραμμένοι εξ ορισμού (soft opt-in για
-- υπηρεσιακά/προϊοντικά), με μοναδικό token απεγγραφής σε κάθε email και διακόπτη
-- στις Ρυθμίσεις. Οι edge functions send-newsletter / send-market-digest διαβάζουν
-- εδώ ποιοι θέλουν να λαμβάνουν.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ανακοινώσεις προϊόντος (τις γράφει ο διαχειριστής· ο cron στέλνει τις αδημοσίευτες).
create table if not exists public.product_updates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body_html  text not null default '',
  cta_label  text,
  cta_url    text,
  published  boolean not null default false,
  emailed_at timestamptz,               -- null = δεν έχει σταλεί ακόμη
  created_at timestamptz not null default now()
);
alter table public.product_updates enable row level security;
drop policy if exists read_published_updates on public.product_updates;
create policy read_published_updates on public.product_updates for select using (published = true);

-- Προτιμήσεις marketing ανά χρήστη + token απεγγραφής (soft opt-in: default true).
create table if not exists public.email_marketing_prefs (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  product_news      boolean not null default true,
  market_news       boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists email_marketing_prefs_token_idx on public.email_marketing_prefs(unsubscribe_token);
alter table public.email_marketing_prefs enable row level security;
drop policy if exists own_marketing_prefs on public.email_marketing_prefs;
create policy own_marketing_prefs on public.email_marketing_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Δημόσια απεγγραφή με ένα κλικ (χωρίς login) μέσω του token.
create or replace function public.unsubscribe_email(p_token uuid, p_kind text default 'all')
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.email_marketing_prefs
     set product_news = case when p_kind in ('all','product') then false else product_news end,
         market_news  = case when p_kind in ('all','market')  then false else market_news  end,
         updated_at = now()
   where unsubscribe_token = p_token;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.unsubscribe_email(uuid, text) from public;
grant execute on function public.unsubscribe_email(uuid, text) to anon, authenticated;

-- Ανάγνωση κατάστασης συνδρομής από token (για τη σελίδα απεγγραφής).
create or replace function public.marketing_prefs_by_token(p_token uuid)
returns table(product_news boolean, market_news boolean)
language sql security definer stable set search_path = public as $$
  select product_news, market_news from public.email_marketing_prefs where unsubscribe_token = p_token;
$$;
revoke all on function public.marketing_prefs_by_token(uuid) from public;
grant execute on function public.marketing_prefs_by_token(uuid) to anon, authenticated;
