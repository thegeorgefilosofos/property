-- ─────────────────────────────────────────────────────────────────────────
-- Referral — λίστα προσκεκλημένων ανά στάδιο (privacy-safe).
--
-- Δίνει στον συστήνοντα ορατότητα του «χωνιού» του: ποιες προσκλήσεις εκκρεμούν
-- και ποιες ενεργοποιήθηκαν, ώστε να ξέρει ποιον αξίζει να θυμίσει (double-sided
-- loop). ΧΩΡΙΣ στοιχεία ταυτότητας (email/όνομα).
--
-- GDPR (ελαχιστοποίηση, Άρθ. 5§1γ / 25): ΔΕΝ αποκαλύπτεται πλέον ανά προσκεκλημένο
-- αν έγινε πληρωμένος συνδρομητής ή επαγγελματίας. Αυτό είναι κατάσταση λογαριασμού
-- ταυτοποιήσιμου προσώπου και η γνωστοποίησή της σε τρίτο (τον συστήνοντα, που ξέρει
-- ποιον κάλεσε) υπερέβαινε τον σκοπό. Οι συγκεντρωτικοί μετρητές paid/pro μένουν μόνο
-- στο get_referral_overview (όχι δεμένοι σε συγκεκριμένο άτομο).
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
      select r.created_at, r.activated_at
        from referrals r
       where r.referrer_user_id = v_owner
    ) t;

  return v_rows;
end;
$$;
grant execute on function public.get_referral_list(text) to authenticated;
