-- ═══════════════════════════════════════════════════════════════════════════
-- Τιμολόγηση v2 — νέα όρια ακινήτων + δωρεάν δοκιμή 30 ημερών
--
-- ΤΙ ΑΛΛΑΖΕΙ ΚΑΙ ΓΙΑΤΙ
-- Παλιά:  Δωρεάν 1 · Ιδιοκτήτης 6 (5,90 €) · Επαγγελματίας απεριόριστα (18,90 €)
-- Νέα:    Δωρεάν 1 · Ιδιοκτήτης 3 (9,90 €) · Επαγγελματίας 15 (24,90 €)
--
-- Το «Ιδιοκτήτης» κάλυπτε έως 6 ακίνητα στα 5,90 €. Στην πράξη ο ιδιοκτήτης με
-- 2–3 ακίνητα είναι η μεγάλη μάζα, και το όριο των 6 σήμαινε ότι σχεδόν κανείς
-- δεν έφτανε ποτέ στο επόμενο πλάνο. Τα νέα όρια δημιουργούν πραγματικό λόγο
-- αναβάθμισης, και η τιμή αντανακλά ότι το προϊόν χειρίζεται φορολογικά στοιχεία.
--
-- ΔΩΡΕΑΝ ΔΟΚΙΜΗ
-- Κάθε νέος λογαριασμός παίρνει 30 ημέρες στο επίπεδο «Ιδιοκτήτης» (rank 1),
-- μετρώντας από τη δημιουργία του χρήστη. Χωρίς αυτό, ο χρήστης με ένα ακίνητο
-- δεν συναντά ποτέ τα χαρακτηριστικά για τα οποία θα πλήρωνε (Δήλωση Μίσθωσης,
-- Ε2, ημερολόγιο λογιστή). Υλοποιείται στο user_plan_rank ώστε να ισχύει ΚΑΙ
-- στον server (RLS/trigger), όχι μόνο στο UI.
--
-- ΑΣΦΑΛΕΙΑ ΥΠΑΡΧΟΝΤΩΝ ΧΡΗΣΤΩΝ
-- Ο έλεγχος ορίου τρέχει μόνο σε INSERT νέου ακινήτου. Κανένας υπάρχων χρήστης
-- δεν χάνει ακίνητα· απλώς δεν μπορεί να προσθέσει πάνω από το νέο όριο.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Νέα όρια ανά επίπεδο πλάνου ─────────────────────────────────────────────
-- rank 0 = Δωρεάν, 1 = Ιδιοκτήτης, 2 = Επαγγελματίας
create or replace function public.plan_max_properties(p_rank int)
returns int language sql immutable as $$
  select case p_rank when 2 then 15 when 1 then 3 else 1 end;
$$;

-- ── Δωρεάν δοκιμή 30 ημερών από τη δημιουργία του λογαριασμού ───────────────
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

  -- Δωρεάν μήνες (π.χ. από σύσταση φίλου).
  if v_comp_until is not null and v_comp_until > now() then
    if v_comp_plan = 'owner'  then v_rank := greatest(v_rank, 1); end if;
    if v_comp_plan = 'agency' then v_rank := greatest(v_rank, 2); end if;
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
