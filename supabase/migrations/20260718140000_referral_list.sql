-- ─────────────────────────────────────────────────────────────────────────
-- Referral — λίστα προσκεκλημένων ανά στάδιο (privacy-safe).
--
-- Δίνει στον συστήνοντα ορατότητα του «χωνιού» του: πόσες προσκλήσεις εκκρεμούν,
-- πόσες ενεργοποιήθηκαν, πόσες έγιναν συνδρομητές/επαγγελματίες — ΧΩΡΙΣ να
-- αποκαλύπτει στοιχεία ταυτότητας του προσκεκλημένου (ούτε email/όνομα). Έτσι
-- ξέρει ποιον από όσους κάλεσε αξίζει να θυμίσει (double-sided loop).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_referral_list(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_rows json;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_array(); end if;

  select coalesce(json_agg(t order by t.created_at desc), json_build_array())
    into v_rows
    from (
      select r.created_at,
             r.activated_at,
             (coalesce(bp.plan, '') in ('monthly', 'annual'))            as is_subscriber,
             (coalesce(bp.profile_type, 'individual') = 'professional')  as is_professional
        from referrals r
        left join billing_profiles bp on bp.user_id = r.referred_user_id
       where r.referrer_user_id = v_owner
    ) t;

  return v_rows;
end;
$$;
grant execute on function public.get_referral_list(text) to authenticated;
