-- ─────────────────────────────────────────────────────────────────────────
-- Δικαιώματα συνδρομής (entitlements) — αυστηρή, μη παρακάμψιμη επιβολή.
--
-- 1) Δωρεάν πρόσβαση (comp): επίπεδο & λήξη + βάση/μήνες που χαρίστηκαν, ώστε ο
--    συγχρονισμός από κερδισμένους μήνες referral να είναι idempotent.
-- 2) wants_mobile: λίστα αναμονής για το Property OS Mobile.
-- 3) user_plan_rank(): το «ενεργό» επίπεδο πλάνου (0 free, 1 owner, 2 agency),
--    ανυψωμένο από ενεργό comp ή ιδιότητα Συνεργάτη. Server-side πηγή αλήθειας.
-- 4) enforce_property_limit: trigger που ΔΕΝ επιτρέπει προσθήκη ακινήτου πάνω
--    από το όριο του ενεργού πλάνου (free 1, owner 6, agency απεριόριστα). Ακόμη
--    κι αν κάποιος παρακάμψει το UI, ο server το μπλοκάρει.
-- 5) sync_comp_from_referrals(): μετατρέπει τους server-verified κερδισμένους
--    μήνες (referral_rewards) σε ενεργή δωρεάν πρόσβαση, με ανώτατο όριο, χωρίς
--    να είναι gameable από τον client.
-- Ασφαλές να τρέξει πολλές φορές (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Στήλες δωρεάν πρόσβασης + λίστα αναμονής mobile.
alter table public.billing_profiles
  add column if not exists comp_plan           text,          -- 'owner' | 'agency'
  add column if not exists comp_until           timestamptz,   -- λήξη δωρεάν πρόσβασης
  add column if not exists comp_months_granted  int  default 0, -- μήνες που έχουν χαριστεί (idempotency)
  add column if not exists comp_started_at       timestamptz,   -- έναρξη μέτρησης δωρεάν πρόσβασης
  add column if not exists wants_mobile          boolean default false;

-- 1b) Κλείδωμα των πεδίων δωρεάν πρόσβασης από τον client: όπως το plan, έτσι και
--     τα comp_* τα ορίζει ΜΟΝΟ ο server (SECURITY DEFINER). Ο χρήστης δεν μπορεί
--     να αυτοχαριστεί δωρεάν Επαγγελματία. Το wants_mobile μένει ελεύθερο (opt-in).
create or replace function public.lock_billing_plan()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.comp_plan := null;
      new.comp_until := null;
      new.comp_months_granted := 0;
      new.comp_started_at := null;
    else
      if new.plan is distinct from old.plan then new.plan := old.plan; end if;
      new.comp_plan          := old.comp_plan;
      new.comp_until         := old.comp_until;
      new.comp_months_granted := old.comp_months_granted;
      new.comp_started_at    := old.comp_started_at;
    end if;
  end if;
  return new;
end;
$$;

-- 2) Όριο ακινήτων ανά επίπεδο πλάνου.
create or replace function public.plan_max_properties(p_rank int)
returns int language sql immutable as $$
  select case p_rank when 2 then 2147483647 when 1 then 6 else 1 end;
$$;

-- 3) Ενεργό επίπεδο πλάνου του χρήστη (0/1/2). SECURITY DEFINER ώστε ο trigger
--    να διαβάζει αξιόπιστα, ανεξάρτητα από RLS.
create or replace function public.user_plan_rank(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan       text;
  v_comp_plan  text;
  v_comp_until timestamptz;
  v_rank       int := 0;
begin
  select plan, comp_plan, comp_until
    into v_plan, v_comp_plan, v_comp_until
    from billing_profiles where user_id = p_uid;

  -- Βασικό πλάνο (ό,τι δεν είναι owner/agency θεωρείται free).
  if v_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
  if v_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;

  -- Ενεργή δωρεάν πρόσβαση.
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
  end if;

  -- Ιδιότητα Συνεργάτη → Επαγγελματίας.
  if exists (select 1 from referral_partners where user_id = p_uid) then
    v_rank := greatest(v_rank, 2);
  end if;

  return v_rank;
end;
$$;

-- 4) Επιβολή ορίου ακινήτων κατά την εισαγωγή.
create or replace function public.enforce_property_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_limit int;
begin
  select count(*) into v_count from user_properties where user_id = NEW.user_id;
  v_limit := plan_max_properties(user_plan_rank(NEW.user_id));
  if v_count >= v_limit then
    raise exception 'PROPERTY_LIMIT: Το πλάνο σου καλύπτει % ακίνητα. Αναβάθμισε για περισσότερα.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_property_limit on public.user_properties;
create trigger trg_enforce_property_limit
  before insert on public.user_properties
  for each row execute function public.enforce_property_limit();

-- 5) Συγχρονισμός κερδισμένων μηνών referral → ενεργή δωρεάν πρόσβαση.
--    Μόνο server-verified μήνες (referral_rewards.kind='months', που γράφονται
--    μόνο για ΕΝΕΡΓΟΠΟΙΗΜΕΝΕΣ συστάσεις). Ανώτατο όριο 12 μήνες. Idempotent:
--    το comp_until μεγαλώνει μόνο όταν κερδίζονται περισσότεροι μήνες, ποτέ σε
--    κάθε κλήση. Στόχος πλάνου: το πληρωμένο πλάνο του προφίλ (ιδιώτης→owner,
--    επαγγελματίας→agency).
create or replace function public.sync_comp_from_referrals()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_months int;
  v_ptype  text;
  v_target text;
  v_cap    int := 12;
begin
  if v_uid is null then return; end if;

  select coalesce(sum(months), 0) into v_months
    from referral_rewards
   where user_id = v_uid and kind = 'months';
  v_months := least(v_months, v_cap);
  if v_months <= 0 then return; end if;

  select coalesce(profile_type, 'individual') into v_ptype
    from billing_profiles where user_id = v_uid;
  v_target := case when v_ptype = 'professional' then 'agency' else 'owner' end;

  -- Αύξηση μόνο (idempotent): ενημερώνουμε όταν κερδήθηκαν περισσότεροι μήνες.
  update billing_profiles
     set comp_months_granted = greatest(coalesce(comp_months_granted, 0), v_months),
         comp_started_at     = coalesce(comp_started_at, now()),
         comp_plan           = v_target,
         comp_until          = coalesce(comp_started_at, now())
                               + (greatest(coalesce(comp_months_granted, 0), v_months) || ' months')::interval
   where user_id = v_uid
     and v_months > coalesce(comp_months_granted, 0);
end;
$$;

grant execute on function public.sync_comp_from_referrals() to authenticated;
