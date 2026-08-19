-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΠΥΛΗ ΤΟΥ ΛΟΓΙΣΤΗ ΕΔΙΝΕ ΔΩΡΕΑΝ ΑΚΡΙΒΩΣ ΑΥΤΟ ΠΟΥ ΠΟΥΛΑΜΕ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΕΥΡΗΜΑ. Το «Ε2 έτοιμο για τον λογιστή» είναι το πρώτο χαρακτηριστικό του
-- πακέτου «Ενα ακίνητο» και φυλάσσεται ρητά: `e2_export: 'solo'`
-- (lib/billing/entitlements.ts). Ομως ο σύνδεσμος της πύλης δινόταν χωρίς
-- ΚΑΝΕΝΑΝ έλεγχο πακέτου, και η `get_accountant_data` δεν ρωτούσε ποτέ αν ο
-- ιδιοκτήτης πληρώνει: διάβαζε το `billing_profiles` μόνο για να πάρει το
-- ΟΝΟΜΑ του. Η πύλη παράγει τη γραμμή του Ε2 και το βιβλίο εργασίας
-- (app/accountant/statement.ts) — δηλαδή το πωλούμενο παραδοτέο, ολόκληρο,
-- σε λογαριασμό χωρίς συνδρομή, για πάντα, μέσω τρίτου.
--
-- Σε ένα προϊόν που επιβάλλει το πακέτο ακόμη και μέσα σε πολιτικές RLS
-- (20260814070000), αυτή ήταν η μία πόρτα που έμεινε ανοιχτή — και ήταν η
-- πόρτα του προϊόντος.
--
-- ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΗΝ ΟΘΟΝΗ. Ελεγχος στο κουμπί «Μοιράσου με τον λογιστή»
-- εμποδίζει μόνο τη ΔΗΜΙΟΥΡΓΙΑ. Ενας σύνδεσμος που εκδόθηκε όσο η συνδρομή
-- ήταν ενεργή θα δούλευε για πάντα μετά τη λήξη της, γιατί το token είναι
-- διαπιστευτήριο κομιστή και δεν ξαναρωτά κανέναν. Η κλειδαριά ανήκει στη
-- διαδρομή ΑΝΑΓΝΩΣΗΣ, που εκτελείται σε κάθε άνοιγμα.
--
-- Ο ΚΑΝΟΝΑΣ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ. Ο βαθμός πακέτου είναι η `user_plan_rank`, που
-- ξέρει ήδη πακέτο, δωρεάν μήνες, δοκιμή και ιδιότητα συνεργάτη. Βαθμός 1 =
-- «Ενα ακίνητο», δηλαδή ακριβώς το κατώφλι του `e2_export`. Καμία δεύτερη
-- λίστα πακέτων εδώ: αν αλλάξει η τιμολόγηση, αλλάζει σε ΕΝΑ σημείο.
--
-- ΤΙ ΒΛΕΠΕΙ Ο ΛΟΓΙΣΤΗΣ ΟΤΑΝ Η ΣΥΝΔΡΟΜΗ ΛΗΞΕΙ. Το ίδιο με ανακληθέντα ή
-- ληγμένο σύνδεσμο: «δεν βρέθηκε». ΣΚΟΠΙΜΑ. Ο κομιστής ενός token δεν
-- δικαιούται να μάθει την κατάσταση χρέωσης του ιδιοκτήτη — είναι στοιχείο
-- τρίτου. Οποιος ΠΡΕΠΕΙ να το μάθει είναι ο ιδιοκτήτης, και το μαθαίνει στη
-- δική του οθόνη, με το κουμπί κλειδωμένο και τον λόγο γραμμένο.
--
-- ΤΑ ΔΕΔΟΜΕΝΑ ΤΟΥ ΧΡΗΣΤΗ ΔΕΝ ΚΡΑΤΙΟΥΝΤΑΙ ΟΜΗΡΟΙ. Ο ίδιος βλέπει τα πάντα στη
-- Λογιστική του, όπως πάντα. Κλειδώνει η ΔΙΑΝΟΜΗ σε τρίτον, που είναι η
-- πληρωμένη λειτουργία — ίδια αρχή με το 20260814070000: «ό,τι έχεις γραμμένο
-- μένει δικό σου· ό,τι κάνει η πληρωμένη λειτουργία, θέλει το πακέτο».
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_accountant_data(p_token text, p_year integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_link record; v_props json; v_owner text;
begin
  select * into v_link from accountant_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return null; end if;

  -- Η ΚΛΕΙΔΑΡΙΑ. Βαθμός 1 = πακέτο «Ενα ακίνητο», δηλαδή ακριβώς το κατώφλι
  -- του `e2_export`. Ελέγχεται σε ΚΑΘΕ άνοιγμα, όχι μόνο στην έκδοση.
  if public.user_plan_rank(v_link.user_id) < 1 then return null; end if;
  select coalesce(nullif(trim(owner_name), ''), full_name) into v_owner from billing_profiles where user_id = v_link.user_id;
  select json_agg(sub.row) into v_props from (
    select json_build_object(
      'name', p.name, 'atak', p.atak, 'address', p.address, 'prop_type', p.prop_type,
      -- ΤΑ ΔΥΟ ΠΟΥ ΖΗΤΑ ΤΟ ΕΝΤΥΠΟ. Στοιχεία του ακινήτου, όχι τρίτων.
      'sqm', p.sqm,
      'ownership', p.ownership,
      -- ΤΟ ΕΝΟΙΚΙΟ ΤΟΥ ΕΤΟΥΣ. Ιδια πηγή και ίδιο φίλτρο με το Ε2: όλες οι
      -- περίοδοι της χρήσης, ανεξάρτητα από την είσπραξη (δεδουλευμένα).
      'rent_collected', coalesce((
        select sum(rp.amount) from rent_payments rp
        where rp.property_id = p.id and rp.user_id = v_link.user_id and rp.period_year = p_year
      ), 0),
      -- Σε πόσες καταχωρημένες περιόδους βασίζεται. Χωρίς αυτό, το «0 €» δεν
      -- ξεχωρίζει από το «δεν καταχωρήθηκε τίποτα».
      'rent_months', coalesce((
        select count(*) from rent_payments rp
        where rp.property_id = p.id and rp.user_id = v_link.user_id and rp.period_year = p_year
      ), 0),
      -- Συμφραζόμενο, ΟΧΙ έσοδο: τι νοικιάζεται σήμερα.
      'rent_monthly', (
        select t.monthly_rent from tenants t where t.id = public.current_tenant_of(p.id)
      ),
      'expenses', coalesce((
        select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date))
        from expenses e
        where e.property_id = p.id and e.user_id = v_link.user_id and extract(year from e.date) = p_year
      ), '[]'::json),
      -- Η ΑΝΑΛΥΣΗ, ΟΧΙ ΜΟΝΟ ΤΟ ΣΥΝΟΛΟ. Χωρίς αυτά τα τέσσερα πεδία η οθόνη δεν
      -- μπορεί να ξεχωρίσει ακαθάριστο από payout, ούτε να βγάλει έξω το τέλος
      -- ανθεκτικότητας — δηλαδή δεν μπορεί να συμφωνήσει με το έντυπο.
      'stays', coalesce((
        select json_agg(json_build_object(
          'check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights,
          'total', s.total,
          'gross_guest_paid', s.gross_guest_paid,
          'climate_levy', s.climate_levy,
          'platform_fee', s.platform_fee,
          'amount_basis', s.amount_basis))
        from client_stays s
        where s.property_id = p.id and s.user_id = v_link.user_id
          and extract(year from coalesce(s.check_in, s.check_out)) = p_year
      ), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $function$;

comment on function public.get_accountant_data(text, integer) is
  'Η εικόνα της χρήσης για τον λογιστή. Επιστρέφει null αν ο σύνδεσμος δεν '
  'είναι ενεργός Η αν ο ιδιοκτήτης δεν έχει πακέτο βαθμού 1 και πάνω. Οι '
  'διαμονές δίνονται με την ανάλυση ποσού τους, ώστε η οθόνη να εφαρμόσει τον '
  'ΙΔΙΟ κανόνα δηλωτέου ακαθάριστου με το Ε2 (lib/clients/stayAmounts.ts) και '
  'όχι το ωμό total. Εμβαδόν και ποσοστό συνιδιοκτησίας για τη γραμμή του '
  'εντύπου. Καμία ταυτότητα τρίτου: ούτε μισθωτής, ούτε προμηθευτής, ούτε '
  'επισκέπτης.';
