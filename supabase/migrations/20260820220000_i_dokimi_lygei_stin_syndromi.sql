-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΥΟ ΧΡΟΝΟΜΕΤΡΑ ΓΙΑ ΤΗΝ ΙΔΙΑ ΔΟΚΙΜΗ, ΚΑΙ ΚΑΝΕΝΑ ΔΕΝ ΞΕΡΕΙ ΓΙΑ ΤΗ ΣΥΝΔΡΟΜΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ, ΟΠΩΣ ΘΑ ΕΒΓΑΙΝΕ. Η δωρεάν δοκιμή μετριόταν ΔΥΟ φορές: στο
-- `lib/billing/entitlements.ts` (TRIAL_DAYS) και εδώ, με ένα `interval '30
-- days'` γραμμένο με το χέρι. Και οι δύο κοιτούσαν μόνο πόσο παλιός είναι ο
-- λογαριασμός — τίποτα άλλο.
--
-- Με τη χρέωση ζωντανή αυτό γίνεται δωρεάν προϊόν:
--
--   Ο πελάτης αγοράζει, μπαίνει σε δοκιμή στον έμπορο, ακυρώνει τη δεύτερη
--   ημέρα. Η συνδρομή του πεθαίνει, το `plan` γίνεται 'free' — και η βάση
--   συνεχίζει να του δίνει βαθμό 2 («Ιδιοκτήτης+», τρία ακίνητα) για άλλες
--   είκοσι οκτώ ημέρες, επειδή ο λογαριασμός είναι νεότερος των τριάντα.
--
-- Η ΔΟΚΙΜΗ ΕΙΝΑΙ ΜΙΑ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ, ΚΑΙ ΤΟ ΞΕΡΕΙ ΜΙΑ ΣΤΗΛΗ. Μόλις ο webhook
-- σφραγίσει το `trial_used_at`, η τοπική δοκιμή παύει να ισχύει: από εκεί και
-- πέρα η πρόσβαση βγαίνει ΑΠΟΚΛΕΙΣΤΙΚΑ από τη συνδρομή, δηλαδή από το `plan`
-- που γράφει ο webhook αφού κρίνει την κατάστασή της.
--
-- Η τοπική δοκιμή μένει για όποιον ΔΕΝ πέρασε ποτέ από ταμείο: παλιοί
-- λογαριασμοί, και όποιος εγκατέλειψε τη διαδικασία στη μέση. Δεν τους κλείνει
-- την πόρτα μια αλλαγή που έγινε μετά την εγγραφή τους.
--
-- ── ΚΑΙ ΤΟ ΝΟΥΜΕΡΟ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ ΣΤΗ ΒΑΣΗ ────────────────────────────
-- Το `interval '30 days'` ήταν χειρόγραφο μέσα στο σώμα της συνάρτησης, όπου
-- δεν το βλέπει κανείς. Γίνεται συνάρτηση με όνομα, και το `db-replay` το
-- συγκρίνει με το `TRIAL_DAYS` της εφαρμογής σε κάθε εκτέλεση — όπως ήδη κάνει
-- με τους στόχους του Προγράμματος Πρόσκλησης, που είχαν ήδη αποκλίνει μια
-- φορά και η οθόνη υποσχόταν άλλα από όσα έδινε η βάση.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trial_days()
returns int language sql immutable as $$ select 30 $$;

comment on function public.trial_days() is
  'Οι ημέρες της δωρεάν δοκιμής, όπως τις ξέρει η βάση. Το db-replay επιβεβαιώνει ότι συμφωνούν με το TRIAL_DAYS του lib/billing/plans.ts.';

create or replace function public.user_plan_rank(p_uid uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_plan text; v_comp_plan text; v_comp_until timestamptz;
  v_trial_used timestamptz; v_created timestamptz; v_rank int := 0;
begin
  select plan, comp_plan, comp_until, trial_used_at
    into v_plan, v_comp_plan, v_comp_until, v_trial_used
    from billing_profiles where user_id = p_uid;

  if v_plan = 'solo'   then v_rank := greatest(v_rank, 1); end if;
  if v_plan = 'owner'  then v_rank := greatest(v_rank, 2); end if;
  if v_plan = 'agency' then v_rank := greatest(v_rank, 3); end if;
  if v_plan = 'office' then v_rank := greatest(v_rank, 4); end if;

  -- Δωρεάν μήνες (π.χ. από σύσταση φίλου).
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'solo'   then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 2); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 3); end if;
    if v_comp_plan = 'office' then v_rank := greatest(v_rank, 4); end if;
  end if;

  -- ΤΟΠΙΚΗ ΔΟΚΙΜΗ, ΜΟΝΟ ΓΙΑ ΟΠΟΙΟΝ ΔΕΝ ΠΗΡΕ ΠΟΤΕ ΔΟΚΙΜΗ ΑΠΟ ΤΟΝ ΕΜΠΟΡΟ.
  -- Το `v_trial_used is null` είναι ολόκληρη η διαφορά: χωρίς αυτό, όποιος
  -- αγόρασε και ακύρωσε τη δεύτερη ημέρα κρατούσε τρία ακίνητα για άλλες
  -- είκοσι οκτώ, επειδή ο λογαριασμός του ήταν ακόμη νέος.
  if v_trial_used is null then
    select created_at into v_created from auth.users where id = p_uid;
    if v_created is not null and v_created > now() - (public.trial_days() || ' days')::interval then
      v_rank := greatest(v_rank, 2);
    end if;
  end if;

  -- Συνεργάτης → πάντα «Επαγγελματίας».
  if exists (select 1 from referral_partners rp where rp.user_id = p_uid) then
    v_rank := greatest(v_rank, 3);
  end if;

  return v_rank;
end;
$$;

comment on function public.user_plan_rank(uuid) is
  'Το επίπεδο πρόσβασης ενός λογαριασμού. Η τοπική δοκιμή ισχύει ΜΟΝΟ όσο δεν έχει σφραγιστεί το trial_used_at: μετά, η πρόσβαση βγαίνει αποκλειστικά από τη συνδρομή.';
