-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΚΑΝΟΝΕΣ ΤΩΝ ΣΥΣΤΑΣΕΩΝ ΕΛΕΓΑΝ ΑΛΛΑ ΣΤΗΝ ΟΘΟΝΗ ΚΑΙ ΑΛΛΑ ΣΤΗ ΒΑΣΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Το lib/referral/referral.ts είναι η δηλωμένη πηγή αλήθειας του προγράμματος
-- και ξαναγράφτηκε. Οι συναρτήσεις της βάσης έμειναν στην προηγούμενη γενιά.
-- Τέσσερις αποκλίσεις, και οι τέσσερις ορατές στον χρήστη ως υπόσχεση:
--
-- 1) Ο ΣΤΟΧΟΣ ΤΟΥ ΙΔΙΩΤΗ ΗΤΑΝ 3 ΣΤΗΝ ΟΘΟΝΗ ΚΑΙ 5 ΣΤΗ ΒΑΣΗ.
--    Η μπάρα γέμιζε στους τρεις, ο χρήστης πατούσε «διεκδίκησε» και η
--    `claim_referral_bonus` απαντούσε `not_reached`. Δηλαδή του δείχναμε
--    πετυχημένο στόχο και του αρνιόμασταν την ανταμοιβή.
--
-- 2) Ο ΣΤΟΧΟΣ ΤΟΥ ΕΠΑΓΓΕΛΜΑΤΙΑ ΗΤΑΝ ΑΠΡΟΣΙΤΟΣ ΕΞ ΟΡΙΣΜΟΥ.
--    Μετρούσε τη στήλη `plan` του προφίλ ως προς δύο τιμές κύκλου χρέωσης,
--    τη μηνιαία και την ετήσια. Η στήλη όμως κρατά
--    ΟΝΟΜΑ ΠΑΚΕΤΟΥ ('solo','owner','agency','office') — το ξέρει και η
--    `user_plan_rank`, που διαβάζει την ίδια στήλη. Καμία γραμμή δεν έγραψε
--    ποτέ 'monthly' ή 'annual', άρα ο μετρητής ήταν μόνιμα μηδέν και η
--    ιδιότητα Συνεργάτη ανέφικτη. Το κάτοπτρό του, το `pro_free`, μετρούσε
--    «όσους ΔΕΝ πληρώνουν» — δηλαδή ΟΛΟΥΣ.
--
-- 3) Η ΒΑΣΗ ΕΔΙΝΕ ΔΥΟ ΜΗΝΕΣ ΕΚΕΙ ΠΟΥ Η ΟΘΟΝΗ ΥΠΟΣΧΟΤΑΝ ΕΝΑΝ.
--    `pro_paid` → 2 μήνες, `per_referral_pro` → 2 μήνες. Το πρόγραμμα δίνει
--    έναν, παντού και χωρίς εξαίρεση.
--
-- 4) ΤΟ «+1 ΑΚΙΝΗΤΟ ΓΙΑ ΕΝΑΝ ΜΗΝΑ» ΔΕΝ ΕΔΙΝΕ ΠΟΤΕ ΑΚΙΝΗΤΟ.
--    Γραφόταν ως `referral_rewards.kind = 'slot'`, εμφανιζόταν στη λίστα
--    ανταμοιβών, και ΚΑΝΕΝΑΣ δεν το διάβαζε: η `sync_comp_from_referrals`
--    αθροίζει μόνο `kind = 'months'`, και ο έλεγχος ορίου ακινήτων κοιτά μόνο
--    το `extra_properties`, δηλαδή τα ΑΓΟΡΑΣΜΕΝΑ. Η πιο συχνή ανταμοιβή του
--    προγράμματος ήταν διακοσμητική.
--
-- ΓΙΑΤΙ ΝΕΑ ΣΤΗΛΗ ΚΑΙ ΟΧΙ ΑΥΞΗΣΗ ΤΟΥ `extra_properties`: τα αγορασμένα ακίνητα
-- είναι ΜΟΝΙΜΑ και τα κερδισμένα ΛΗΓΟΥΝ. Γραμμένα στην ίδια στήλη, ένα δώρο
-- ενός μήνα θα γινόταν μόνιμο δικαίωμα και δεν θα μπορούσε να αφαιρεθεί χωρίς
-- να πειραχθεί ό,τι πλήρωσε ο χρήστης. Δύο έννοιες, δύο στήλες.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Οι κερδισμένες θέσεις ακινήτου, με ημερομηνία λήξης ─────────────────
alter table public.billing_profiles
  add column if not exists bonus_properties integer not null default 0,
  add column if not exists bonus_properties_until timestamptz;

alter table public.billing_profiles
  drop constraint if exists billing_profiles_bonus_properties_nonneg;
alter table public.billing_profiles
  add constraint billing_profiles_bonus_properties_nonneg
  check (bonus_properties >= 0 and bonus_properties <= 500);

comment on column public.billing_profiles.bonus_properties is
  'Θέσεις ακινήτου κερδισμένες από συστάσεις. ΛΗΓΟΥΝ (bonus_properties_until). Τα ΑΓΟΡΑΣΜΕΝΑ ζουν στο extra_properties και δεν λήγουν.';

-- ── 2. Ο έλεγχος ορίου μετράει και τις κερδισμένες, όσο είναι ενεργές ──────
create or replace function public.enforce_property_limit() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_count int;
  v_limit int;
  v_extra int;
  v_bonus int;
begin
  select count(*) into v_count from user_properties where user_id = NEW.user_id;
  v_limit := plan_max_properties(user_plan_rank(NEW.user_id));

  -- Τα επιπλέον προστίθενται ΜΟΝΟ σε πεπερασμένο όριο. Χωρίς αυτόν τον έλεγχο,
  -- το «απεριόριστο» (2147483647) συν οποιοδήποτε extra θα ξεχείλιζε τον integer
  -- και θα γινόταν αρνητικό — δηλαδή το ΑΝΩΤΕΡΟ πλάνο θα σταματούσε στο πρώτο
  -- ακίνητο. Σιωπηλό, καταστροφικό, και ακριβώς ο τύπος σφάλματος που δεν
  -- εμφανίζεται σε δοκιμή με μικρά νούμερα.
  if v_limit < 2147483647 then
    select coalesce(extra_properties, 0),
           case when bonus_properties_until is not null and bonus_properties_until > now()
                then coalesce(bonus_properties, 0) else 0 end
      into v_extra, v_bonus
      from billing_profiles where user_id = NEW.user_id;
    v_limit := v_limit + coalesce(v_extra, 0) + coalesce(v_bonus, 0);
  end if;

  if v_count >= v_limit then
    raise exception 'PROPERTY_LIMIT: Το πλάνο σου καλύπτει % ακίνητα. Πρόσθεσε ακίνητο ή αναβάθμισε.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

-- ── 3. Τα «πληρωμένα» πακέτα, ονομαστικά ──────────────────────────────────
-- ΜΙΑ λίστα, ώστε η προσθήκη πακέτου να μη χρειάζεται να θυμηθεί δύο σημεία.
-- Ταυτίζεται με το PLAN_ORDER του lib/billing/plans.ts, χωρίς το 'free'.
create or replace function public.is_paying_plan(p_plan text)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(p_plan, '') in ('solo', 'owner', 'agency', 'office');
$$;

-- ── 4. Οι στόχοι και οι ανταμοιβές, όπως τα λέει η οθόνη ──────────────────
create or replace function public.claim_referral_bonus(p_code text, p_kind text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid; v_count int; v_target int; v_months int; v_tier text; v_exists int;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return json_build_object('ok', false, 'reason', 'not_owner'); end if;

  -- ΤΑ ΝΟΥΜΕΡΑ ΕΙΝΑΙ ΤΟΥ lib/referral/referral.ts:
  --   INDIV_VOLUME_TARGET = 3, INDIV_VOLUME_BONUS_MONTHS = 1
  --   PRO_PAID_TARGET     = 5, PRO_PAID_BONUS_MONTHS     = 1
  -- Το 'pro_free' ΚΑΤΑΡΓΗΘΗΚΕ: αντάμειβε εγγραφές που δεν φέρνουν έσοδο, σε
  -- προϊόν που δεν έχει πια δωρεάν πακέτο. Απαντά 'bad_kind', ώστε παλιός
  -- πελάτης που το καλεί να παίρνει σαφή άρνηση αντί για σιωπηλή ανταμοιβή.
  if    p_kind = 'indiv_volume' then v_target := 3; v_months := 1; v_tier := 'owner';
  elsif p_kind = 'pro_paid'     then v_target := 5; v_months := 1; v_tier := 'agency';
  else return json_build_object('ok', false, 'reason', 'bad_kind'); end if;

  -- Σειριοποίησε ταυτόχρονες διεκδικήσεις ανά χρήστη/είδος (anti double-claim).
  perform pg_advisory_xact_lock(hashtext('referral_bonus:' || p_kind || ':' || v_owner::text));

  select
    case p_kind
      -- Ο Ιδιώτης μετράει ΙΔΙΩΤΕΣ που έφερε.
      when 'indiv_volume' then count(*) filter (where coalesce(bp.profile_type,'individual') <> 'professional')
      -- Ο Επαγγελματίας μετράει ΣΥΝΔΡΟΜΗΤΕΣ, σε οποιοδήποτε πακέτο.
      when 'pro_paid'     then count(*) filter (where is_paying_plan(bp.plan))
    end::int
  into v_count
  from referrals r
  left join billing_profiles bp on bp.user_id = r.referred_user_id
  where r.referrer_user_id = v_owner and r.activated_at is not null
    and date_trunc('month', r.activated_at) = date_trunc('month', now());

  if v_count < v_target then return json_build_object('ok', false, 'reason', 'not_reached', 'count', v_count, 'target', v_target); end if;

  select count(*)::int into v_exists from referral_rewards
   where user_id = v_owner and reason = p_kind
     and date_trunc('month', created_at) = date_trunc('month', now());
  if v_exists > 0 then return json_build_object('ok', false, 'reason', 'already_claimed'); end if;

  insert into referral_rewards (user_id, kind, months, tier, reason, status)
       values (v_owner, 'months', v_months, v_tier, p_kind, 'pending');
  return json_build_object('ok', true, 'status', 'pending', 'months', v_months, 'tier', v_tier);
end; $$;

-- ── 5. Ένας κανόνας ανά σύσταση, ίδιος για όλους ──────────────────────────
create or replace function public.reconcile_referral_rewards(p_code text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_owner uuid;
  v_ptype text;
begin
  select user_id into v_owner from referral_codes where code = p_code;
  if v_owner is null or v_owner <> auth.uid() then return; end if;

  select coalesce(profile_type, 'individual') into v_ptype
    from billing_profiles where user_id = v_owner;
  v_ptype := coalesce(v_ptype, 'individual');

  -- Μόνο ο Ιδιώτης έχει ανά-σύσταση αξία· ο Επαγγελματίας αμείβεται στον στόχο.
  if v_ptype = 'professional' then return; end if;

  -- 1) ΕΝΑΣ ΚΑΝΟΝΑΣ ΓΙΑ ΟΛΟΥΣ: +1 ακίνητο για έναν μήνα. Ήταν «μήνας αν
  --    πληρώνεις, θέση αν είσαι δωρεάν» — δύο κανόνες για την ίδια πράξη, που
  --    το referral.ts ενοποίησε ρητά. Και ο έλεγχος «πληρώνεις;» κοίταζε
  --    το πακέτο ως προς δύο τιμές κύκλου χρέωσης που δεν γράφονται ποτέ, οπότε
  --    στην πράξη ΚΑΝΕΙΣ δεν έπαιρνε μήνα.
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'slot', 1, 'owner', 'per_referral', 'pending'
    from referrals r
   where r.referrer_user_id = v_owner and r.activated_at is not null
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;

  -- 2) Η μόνη εξαίρεση: ο συστημένος έγινε Επαγγελματίας → ΕΝΑΣ μήνας (όχι δύο).
  insert into referral_rewards (user_id, referral_id, kind, months, tier, reason, status)
  select v_owner, r.id, 'months', 1, 'owner', 'per_referral_pro', 'pending'
    from referrals r
    join billing_profiles bp on bp.user_id = r.referred_user_id
   where r.referrer_user_id = v_owner and r.activated_at is not null
     and coalesce(bp.profile_type, 'individual') = 'professional'
  on conflict (user_id, referral_id, reason) where referral_id is not null do nothing;
end;
$$;

-- ── 6. Οι κερδισμένες θέσεις εφαρμόζονται πραγματικά ──────────────────────
create or replace function public.sync_comp_from_referrals() returns void
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid := auth.uid();
  v_months int;
  v_slots  int;
  v_ptype  text;
  v_target text;
  v_cap    int := 12;
begin
  if v_uid is null then return; end if;

  select coalesce(sum(months) filter (where kind = 'months'), 0),
         coalesce(sum(months) filter (where kind = 'slot'), 0)
    into v_months, v_slots
    from referral_rewards
   where user_id = v_uid;

  select coalesce(profile_type, 'individual') into v_ptype
    from billing_profiles where user_id = v_uid;
  v_target := case when v_ptype = 'professional' then 'agency' else 'owner' end;

  -- Δωρεάν μήνες πακέτου. Αύξηση μόνο (idempotent).
  v_months := least(v_months, v_cap);
  if v_months > 0 then
    update billing_profiles
       set comp_months_granted = greatest(coalesce(comp_months_granted, 0), v_months),
           comp_started_at     = coalesce(comp_started_at, now()),
           comp_plan           = v_target,
           comp_until          = coalesce(comp_started_at, now())
                                 + (greatest(coalesce(comp_months_granted, 0), v_months) || ' months')::interval
     where user_id = v_uid
       and v_months > coalesce(comp_months_granted, 0);
  end if;

  -- ΚΕΡΔΙΣΜΕΝΕΣ ΘΕΣΕΙΣ ΑΚΙΝΗΤΟΥ. Κάθε γραμμή 'slot' είναι μία θέση για έναν
  -- μήνα. Το πλήθος είναι το άθροισμα, και η λήξη μετράει από την πρώτη: δέκα
  -- συστάσεις σημαίνουν δέκα θέσεις για έναν μήνα, όχι μία θέση για δέκα.
  v_slots := least(v_slots, 500);
  if v_slots > 0 then
    update billing_profiles
       set bonus_properties       = greatest(coalesce(bonus_properties, 0), v_slots),
           bonus_properties_until = greatest(coalesce(bonus_properties_until, now()), now() + interval '1 month')
     where user_id = v_uid
       and v_slots > coalesce(bonus_properties, 0);
  end if;
end;
$$;

-- ── Ο έλεγχος ότι όντως συμφωνούν ─────────────────────────────────────────
-- Η Postgres ΔΕΝ επαληθεύει σώμα plpgsql στο `create`. Τα σταθερά κομμάτια
-- εκτελούνται εδώ, ώστε ένα λάθος να σκάσει ΤΩΡΑ και όχι στον πρώτο χρήστη.
do $$
begin
  if not public.is_paying_plan('solo')   then raise exception 'το solo πρέπει να μετράει ως συνδρομητής'; end if;
  if not public.is_paying_plan('office') then raise exception 'το office πρέπει να μετράει ως συνδρομητής'; end if;
  if public.is_paying_plan('free')       then raise exception 'το free ΔΕΝ είναι συνδρομητής'; end if;
  if public.is_paying_plan(null)         then raise exception 'το κενό πλάνο ΔΕΝ είναι συνδρομητής'; end if;
  if public.is_paying_plan('monthly')    then raise exception 'το «monthly» δεν είναι πακέτο, είναι κύκλος χρέωσης'; end if;
end $$;
