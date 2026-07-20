-- ─────────────────────────────────────────────────────────────────────────
-- Μητρώο δραστηριότητας (audit log): ποιος έκανε τι και πότε. Καταγράφει
-- ευαίσθητα γεγονότα λογαριασμού/ασφάλειας και ενέργειες διαχείρισης ομάδας.
--
-- Μοντέλο:
--   • user_id  = η «σκηνή» στην οποία ανήκει το γεγονός (ατομικά = ο ίδιος).
--   • actor_id = ποιος πραγματικά το έκανε (auth.uid()).
--
-- Ασφάλεια: εγγραφή ΜΟΝΟ μέσω SECURITY DEFINER RPC (log_activity), που κρατά
-- πάντα actor_id = auth.uid() (δεν πλαστογραφείται ο δράστης). Ανάγνωση: ο
-- χρήστης βλέπει όσα τον αφορούν ως σκηνή Ή ως δράστης (RLS). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_activity_user  on public.activity_log(user_id, created_at desc);
create index if not exists idx_activity_actor on public.activity_log(actor_id, created_at desc);

alter table public.activity_log enable row level security;
drop policy if exists "activity_select_own" on public.activity_log;
create policy "activity_select_own" on public.activity_log for select
  using (user_id = auth.uid() or actor_id = auth.uid());
-- (Καμία policy INSERT/UPDATE/DELETE: εγγραφή μόνο μέσω RPC.)

-- ── Καταγραφή γεγονότος. Ο δράστης είναι ΠΑΝΤΑ auth.uid() (server-side),
--    οπότε δεν μπορεί ο client να δηλώσει άλλον δράστη. ─────────────────────
create or replace function public.log_activity(
  p_action text, p_entity text default null, p_entity_id text default null, p_metadata jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null or coalesce(p_action, '') = '' then return; end if;
  select email into v_email from auth.users where id = v_uid;
  insert into activity_log(user_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (v_uid, v_uid, v_email, left(p_action, 60), left(p_entity, 40), left(p_entity_id, 100), coalesce(p_metadata, '{}'));
end; $$;

revoke all on function public.log_activity(text, text, text, jsonb) from public;
grant execute on function public.log_activity(text, text, text, jsonb) to authenticated;

-- ── Πρόσφατη δραστηριότητα του τρέχοντος χρήστη ────────────────────────────
create or replace function public.my_activity(p_limit int default 30)
returns setof public.activity_log language sql stable security definer set search_path = public as $$
  select * from activity_log
   where user_id = auth.uid() or actor_id = auth.uid()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

grant execute on function public.my_activity(int) to authenticated;
