-- ─────────────────────────────────────────────────────────────────────────
-- Referral — καταγραφή της ανά-σύσταση υπόσχεσης στο ledger.
--
-- Πρόβλημα: η κεντρική υπόσχεση του Ιδιώτη («+1 ακίνητο ή +1 μήνας ανά φίλο»
-- και «+2 μήνες όταν ο φίλος γίνει Επαγγελματίας») φαινόταν στην οθόνη αλλά ΔΕΝ
-- γραφόταν πουθενά — μόνο τα 3 μηνιαία milestones κατέληγαν στο referral_rewards.
-- Έτσι το «Τα δώρα σου» δεν έλεγε την αλήθεια.
--
-- Λύση: RPC reconcile_referral_rewards που, εντελώς idempotent, μεταφράζει κάθε
-- ΕΝΕΡΓΟΠΟΙΗΜΕΝΗ σύσταση σε μία εγγραφή pending στο ledger:
--   • per_referral      → base (slot αν ο συστήνων είναι δωρεάν, μήνας αν πληρώνει)
--   • per_referral_pro  → +2 μήνες Ιδιώτη όταν ο συστημένος γίνει Επαγγελματίας
-- Ισχύει ΜΟΝΟ για συστήνοντες-ιδιώτες (ο Επαγγελματίας αμείβεται με milestones +
-- προμήθεια). Όλα «pending» — η πίστωση γίνεται με το Stripe. Δεν είναι read-path.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

-- Μία ανταμοιβή ανά σύσταση ανά είδος (κλειδί μοναδικότητας).
create unique index if not exists referral_rewards_referral_reason_uidx
  on public.referral_rewards (user_id, referral_id, reason)
  where referral_id is not null;

create or replace function public.reconcile_referral_rewards(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner  uuid;
  v_ptype  text;
  v_paying boolean;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return; end if;

  select coalesce(profile_type, 'individual'),
         coalesce(plan, '') in ('monthly', 'annual')
    into v_ptype, v_paying
    from billing_profiles where user_id = v_owner;
  v_ptype  := coalesce(v_ptype, 'individual');
  v_paying := coalesce(v_paying, false);

  -- Μόνο ο Ιδιώτης έχει ανά-σύσταση αξία· ο Επαγγελματίας αμείβεται αλλιώς.
  if v_ptype = 'professional' then return; end if;

  -- 1) Base ανά ενεργοποιημένη σύσταση: δωρεάν ακίνητο (δωρεάν συστήνων) ή μήνας.
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id,
         case when v_paying then 'months' else 'slot' end,
         1, 'owner', 'per_referral', 'pending'
    from referrals r
   where r.referrer_user_id = v_owner and r.activated_at is not null
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;

  -- 2) Μπόνους +2 μήνες Ιδιώτη όταν ο συστημένος γίνει Επαγγελματίας.
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'months', 2, 'owner', 'per_referral_pro', 'pending'
    from referrals r
    join billing_profiles bp on bp.user_id = r.referred_user_id
   where r.referrer_user_id = v_owner and r.activated_at is not null
     and coalesce(bp.profile_type, 'individual') = 'professional'
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;
end;
$$;
grant execute on function public.reconcile_referral_rewards(text) to authenticated;
