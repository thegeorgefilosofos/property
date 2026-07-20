-- ─────────────────────────────────────────────────────────────────────────
-- Έξοδος από τη λίστα αναμονής του Property OS Mobile. Αν ο χρήστης μετάνιωσε,
-- μπορεί να αφαιρεθεί· και να ξαναμπεί όποτε θέλει (join_mobile_waitlist).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.leave_mobile_waitlist()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  delete from mobile_waitlist where user_id = v_uid;
  update billing_profiles set wants_mobile = false where user_id = v_uid;
end; $$;

revoke all on function public.leave_mobile_waitlist() from public;
grant execute on function public.leave_mobile_waitlist() to authenticated;
