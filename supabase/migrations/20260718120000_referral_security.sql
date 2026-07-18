-- ─────────────────────────────────────────────────────────────────────────
-- Referral — σκλήρυνση ασφάλειας (κλείσιμο δύο πραγματικών κενών).
--
-- 1) ΠΑΡΑΚΑΜΨΗ ΕΝΕΡΓΟΠΟΙΗΣΗΣ: υπήρχε απευθείας policy INSERT στον πίνακα
--    referrals (with check referred_user_id = auth.uid()). Επέτρεπε σε
--    οποιονδήποτε συνδεδεμένο χρήστη να «σφυρηλατήσει» εγγραφή παραπομπής με
--    αυθαίρετο referrer_user_id ΚΑΙ activated_at = now(), παρακάμπτοντας
--    ολόκληρο το redeem_referral (14ήμερο guard + self-referral guard) και το
--    mark_referral_activated (επαλήθευση από πραγματικά δεδομένα). Έτσι γκρεμιζόταν
--    το anti-farming στο οποίο στηρίζεται όλο το self-funding μοντέλο.
--    Λύση: καταργείται η policy. Οι παραπομπές γράφονται ΜΟΝΟ μέσω των
--    SECURITY DEFINER RPC (redeem_referral / mark_referral_activated).
--
-- 2) ΑΥΤΟΑΝΑΚΗΡΥΞΗ ΣΥΝΔΡΟΜΗΤΗ: το billing_profiles είχε policy «for all» στον
--    κάτοχο, οπότε ο χρήστης μπορούσε να θέσει μόνος του plan = 'monthly' και να
--    μετρήσει ως «συνδρομητής» στα milestones/streak/προμήθεια, χωρίς πληρωμή.
--    Λύση: trigger που κλειδώνει τη στήλη plan — μόνο ο ρόλος billing
--    (service_role, δηλ. το Stripe webhook) την αλλάζει. Το profile_type
--    (ιδιώτης/επαγγελματίας) παραμένει επιλογή του χρήστη.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Τέλος στην απευθείας εγγραφή παραπομπών από τον client.
drop policy if exists "insert_own_referral" on public.referrals;

-- 2) Κλείδωμα του plan: μόνο το billing (service_role) το ορίζει.
create or replace function public.lock_billing_plan()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
    elsif new.plan is distinct from old.plan then
      new.plan := old.plan;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_billing_plan_trg on public.billing_profiles;
create trigger lock_billing_plan_trg
  before insert or update on public.billing_profiles
  for each row execute function public.lock_billing_plan();
