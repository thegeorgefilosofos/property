-- ─────────────────────────────────────────────────────────────────────────
-- Λίστα αναμονής για το Property OS Mobile. Όποιος πατήσει «Ειδοποίησέ με μόλις
-- βγει» καταγράφεται εδώ με το email του, ώστε στην κυκλοφορία της εφαρμογής να
-- του σταλεί πραγματικό ενημερωτικό email (μία φορά).
--
-- Καταγραφή μόνο μέσω RPC (SECURITY DEFINER): κρατάμε auth.uid() + το email από
-- τον πίνακα χρηστών (όχι από τον client, για να μη δηλωθεί ξένο email). Το πεδίο
-- notified_at αποτρέπει τη διπλή αποστολή στο launch. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mobile_waitlist (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);

alter table public.mobile_waitlist enable row level security;
drop policy if exists "mobile_waitlist_select_own" on public.mobile_waitlist;
create policy "mobile_waitlist_select_own" on public.mobile_waitlist for select using (user_id = auth.uid());
-- (Εγγραφή μόνο μέσω RPC· η αποστολή launch email γίνεται από backend/service_role.)

create or replace function public.join_mobile_waitlist()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text;
begin
  if v_uid is null then return; end if;
  select email into v_email from auth.users where id = v_uid;

  insert into mobile_waitlist(user_id, email) values (v_uid, v_email)
  on conflict (user_id) do update set email = excluded.email;

  -- Διατηρούμε και την ένδειξη wants_mobile (τη διαβάζει το UI για το «μπήκες»).
  insert into billing_profiles(user_id, wants_mobile) values (v_uid, true)
  on conflict (user_id) do update set wants_mobile = true;
end; $$;

revoke all on function public.join_mobile_waitlist() from public;
grant execute on function public.join_mobile_waitlist() to authenticated;
