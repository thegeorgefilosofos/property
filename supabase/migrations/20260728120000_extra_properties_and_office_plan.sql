-- ═══════════════════════════════════════════════════════════════════════════
-- Επιπλέον ακίνητα + πλάνο «Γραφείο»
--
-- ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ
-- Το άλμα από 3 σε 4 ακίνητα κόστιζε 9,90 € → 24,90 €: **+152% για ένα ακίνητο**.
-- Ο χρήστης με 4 ακίνητα δεν αναβάθμιζε, έφευγε — διεθνώς RentRedi/Stessa/
-- TenantCloud δίνουν απεριόριστα ακίνητα στα ~12 $. Με το επιπλέον ακίνητο στα
-- 2 €, το ίδιο βήμα κοστίζει +2 € και ο γκρεμός εξαφανίζεται εντελώς.
--
-- Τα σημεία ισοδυναμίας βγαίνουν στρογγυλά και είναι σχεδιαστική απόφαση, όχι
-- σύμπτωση (κατοχυρωμένα με τεστ στο lib/billing/plans.test.ts):
--   • στα 11 ακίνητα ο Επαγγελματίας γίνεται φθηνότερος από Ιδιοκτήτη + επιπλέον
--   • στα 43 ακίνητα το Γραφείο γίνεται φθηνότερο από Επαγγελματία + επιπλέον
--
-- ΓΙΑΤΙ ΤΟ ΟΡΙΟ ΠΡΕΠΕΙ ΝΑ ΞΕΡΕΙ ΤΑ ΕΠΙΠΛΕΟΝ
-- Ο έλεγχος ορίου ζει σε trigger της βάσης (enforce_property_limit), ώστε να μην
-- παρακάμπτεται από το UI. Αν τα αγορασμένα ακίνητα ζούσαν μόνο στον κώδικα, ο
-- χρήστης θα πλήρωνε για το 4ο ακίνητο και η βάση θα του το απέρριπτε. Άρα η
-- πληροφορία πρέπει να είναι ΕΔΩ.
--
-- ΑΣΦΑΛΕΙΑ: το extra_properties είναι 0 για όλους τους υπάρχοντες χρήστες, οπότε
-- κανένα υπάρχον όριο δεν αλλάζει. Ο έλεγχος τρέχει μόνο σε INSERT — κανείς δεν
-- χάνει ακίνητο που ήδη έχει.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Πόσα επιπλέον ακίνητα έχει αγοράσει ο χρήστης ──────────────────────────
alter table public.billing_profiles
  add column if not exists extra_properties integer not null default 0;

-- Δεν επιτρέπεται αρνητικό: θα ΜΕΙΩΝΕ σιωπηλά το όριο κάτω από αυτό που
-- υπόσχεται το πλάνο, και ο χρήστης θα έβλεπε «όριο» ενώ έχει πληρώσει.
alter table public.billing_profiles
  drop constraint if exists billing_profiles_extra_properties_nonneg;
alter table public.billing_profiles
  add constraint billing_profiles_extra_properties_nonneg
  check (extra_properties >= 0 and extra_properties <= 500);

comment on column public.billing_profiles.extra_properties is
  'Επιπλέον ακίνητα πέρα από όσα περιλαμβάνει το πλάνο, στα 2 € το καθένα τον μήνα.';

-- ── Επίπεδα πλάνου: προστίθεται το «Γραφείο» ως rank 3 ─────────────────────
-- rank 0 = Δωρεάν, 1 = Ιδιοκτήτης, 2 = Επαγγελματίας, 3 = Γραφείο
create or replace function public.plan_max_properties(p_rank int)
returns int language sql immutable as $$
  select case p_rank
           when 3 then 2147483647   -- Γραφείο: απεριόριστα
           when 2 then 15
           when 1 then 3
           else 1
         end;
$$;

create or replace function public.user_plan_rank(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text; v_comp_plan text; v_comp_until timestamptz;
  v_created timestamptz; v_rank int := 0;
begin
  select plan, comp_plan, comp_until into v_plan, v_comp_plan, v_comp_until
    from billing_profiles where user_id = p_uid;

  if v_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
  if v_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
  if v_plan = 'office' then v_rank := greatest(v_rank, 3); end if;

  -- Δωρεάν μήνες (π.χ. από σύσταση φίλου).
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
    if v_comp_plan = 'office' then v_rank := greatest(v_rank, 3); end if;
  end if;

  -- Δωρεάν δοκιμή: 30 ημέρες από τη δημιουργία του λογαριασμού, επίπεδο 1.
  select created_at into v_created from auth.users where id = p_uid;
  if v_created is not null and v_created > now() - interval '30 days' then
    v_rank := greatest(v_rank, 1);
  end if;

  -- Συνεργάτης → πάντα επίπεδο 2.
  if exists (select 1 from referral_partners rp where rp.user_id = p_uid) then
    v_rank := greatest(v_rank, 2);
  end if;

  return v_rank;
end;
$$;

-- ── Το όριο ακινήτων μετρά πλέον και τα αγορασμένα ─────────────────────────
create or replace function public.enforce_property_limit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_count int;
  v_limit int;
  v_extra int := 0;
begin
  select count(*) into v_count from user_properties where user_id = NEW.user_id;
  v_limit := plan_max_properties(user_plan_rank(NEW.user_id));

  -- Τα αγορασμένα προστίθενται ΜΟΝΟ σε πεπερασμένο όριο. Χωρίς αυτόν τον έλεγχο,
  -- το «απεριόριστο» (2147483647) συν οποιοδήποτε extra θα ξεχείλιζε τον integer
  -- και θα γινόταν αρνητικό — δηλαδή το ΑΝΩΤΕΡΟ πλάνο θα σταματούσε στο πρώτο
  -- ακίνητο. Σιωπηλό, καταστροφικό, και ακριβώς ο τύπος σφάλματος που δεν
  -- εμφανίζεται σε δοκιμή με μικρά νούμερα.
  if v_limit < 2147483647 then
    select coalesce(extra_properties, 0) into v_extra
      from billing_profiles where user_id = NEW.user_id;
    v_limit := v_limit + coalesce(v_extra, 0);
  end if;

  if v_count >= v_limit then
    raise exception 'PROPERTY_LIMIT: Το πλάνο σου καλύπτει % ακίνητα. Πρόσθεσε ακίνητο ή αναβάθμισε.', v_limit
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;
