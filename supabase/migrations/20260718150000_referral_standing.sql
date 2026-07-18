-- ─────────────────────────────────────────────────────────────────────────
-- Referral — διακριτική κατάταξη (standing), ΟΧΙ πίνακας κατάταξης.
--
-- Επιστρέφει ΜΟΝΟ έναν αριθμό: σε ποιο κορυφαίο ποσοστό βρίσκεται ο χρήστης με
-- βάση τις ενεργοποιήσεις του τρέχοντος μήνα. Χωρίς ονόματα, χωρίς λίστα — καθαρή,
-- θετική κοινωνική απόδειξη. Εμφανίζεται μόνο όταν αξίζει:
--   • ο χρήστης έχει ≥1 ενεργοποίηση τον μήνα,
--   • υπάρχουν ≥5 συμμετέχοντες (αλλιώς δεν έχει νόημα),
--   • και βρίσκεται στο κορυφαίο 50% (αλλιώς επιστρέφει 0 = μην το δείξεις).
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.get_referral_standing()
returns int language plpgsql security definer set search_path = public stable as $$
declare v_me int; v_total int; v_below int; v_top int;
begin
  select count(*) into v_me from referrals
   where referrer_user_id = auth.uid() and activated_at is not null
     and date_trunc('month', activated_at) = date_trunc('month', now());
  if v_me < 1 then return 0; end if;

  select count(*) into v_total from (
    select referrer_user_id from referrals
     where activated_at is not null
       and date_trunc('month', activated_at) = date_trunc('month', now())
     group by referrer_user_id) t;
  if v_total < 5 then return 0; end if;

  select count(*) into v_below from (
    select referrer_user_id from referrals
     where activated_at is not null
       and date_trunc('month', activated_at) = date_trunc('month', now())
     group by referrer_user_id
    having count(*) < v_me) t;

  v_top := greatest(1, round(100.0 * (v_total - v_below) / v_total)::int);
  if v_top > 50 then return 0; end if;
  return v_top;
end;
$$;
grant execute on function public.get_referral_standing() to authenticated;
