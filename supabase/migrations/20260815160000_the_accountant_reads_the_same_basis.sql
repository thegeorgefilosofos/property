-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΠΥΛΗ ΤΟΥ ΛΟΓΙΣΤΗ ΦΟΡΟΛΟΓΟΥΣΕ ΣΕ ΑΛΛΗ ΒΑΣΗ ΑΠΟ ΤΟ ΕΝΤΥΠΟ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ. Η `get_accountant_data` επιστρέφει τις διαμονές με ΜΟΝΟ το ωμό
-- `total` και η οθόνη τις αθροίζει έτσι ως έσοδο βραχυχρόνιας. Το `total`
-- όμως είναι είτε ακαθάριστο είτε payout, ανάλογα με το `amount_basis`
-- (lib/clients/stayAmounts.ts). Ο υπολογισμός του Ε2, στο ΙΔΙΟ προϊόν, περνά
-- από το `declarableGross`: τι πλήρωσε ο επισκέπτης μείον το τέλος
-- ανθεκτικότητας, που δεν είναι έσοδο του ιδιοκτήτη.
--
-- Δηλαδή για την ίδια χρονιά και τον ίδιο πελάτη, ο λογιστής έβλεπε ένα ποσό
-- στην πύλη του και άλλο στο έντυπο που θα υποβάλει. Είναι ακριβώς το σφάλμα
-- της προμήθειας που αφαιρούνταν δύο φορές, μια οθόνη πιο πέρα.
--
-- ΤΙ ΑΛΛΑΖΕΙ. Η συνάρτηση δίνει πλέον την ΑΝΑΛΥΣΗ κάθε διαμονής
-- (`gross_guest_paid`, `climate_levy`, `platform_fee`, `amount_basis`), ώστε η
-- οθόνη να εφαρμόσει τον ίδιο κανόνα με το Ε2 αντί να μαντέψει. Το `total`
-- μένει: είναι η μόνη τιμή που έχουν οι ιστορικές γραμμές.
--
-- ΤΟ ΑΠΡΟΣΔΙΟΡΙΣΤΟ ΔΕΝ ΚΡΥΒΕΤΑΙ. Γραμμή χωρίς ανάλυση και χωρίς δηλωμένη βάση
-- μπαίνει με το `total` της, αλλά η οθόνη μετρά πόσες είναι και το γράφει. Ο
-- λογιστής πρέπει να ξέρει ποιο κομμάτι του αριθμού στηρίζεται σε εικασία —
-- αυτός υπογράφει τη δήλωση.
--
-- ΓΙΑΤΙ ΔΕΝ ΥΠΟΛΟΓΙΖΕΤΑΙ ΕΔΩ, ΜΕΣΑ ΣΤΗ ΒΑΣΗ. Ο κανόνας ζει ήδη γραμμένος και
-- δοκιμασμένος σε ένα αρχείο. Δεύτερη υλοποίησή του σε SQL θα ήταν δεύτερη
-- αλήθεια, που θα απέκλινε στην πρώτη αλλαγή — ακριβώς ό,τι διορθώνεται εδώ.
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
  select coalesce(nullif(trim(owner_name), ''), full_name) into v_owner from billing_profiles where user_id = v_link.user_id;
  select json_agg(sub.row) into v_props from (
    select json_build_object(
      'name', p.name, 'atak', p.atak, 'address', p.address, 'prop_type', p.prop_type,
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
        -- ΧΩΡΙΣ `::text`. Το 20260815100000 ένωσε τους τύπους: το
        -- `client_stays.property_id` είναι πλέον uuid, όπως το `user_properties.id`.
        where s.property_id = p.id and s.user_id = v_link.user_id
          and extract(year from coalesce(s.check_in, s.check_out)) = p_year
      ), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $function$;

comment on function public.get_accountant_data(text, integer) is
  'Η εικόνα της χρήσης για τον λογιστή. Οι διαμονές δίνονται με την ανάλυση '
  'ποσού τους, ώστε η οθόνη να εφαρμόσει τον ΙΔΙΟ κανόνα δηλωτέου ακαθάριστου '
  'με το Ε2 (lib/clients/stayAmounts.ts) και όχι το ωμό total.';
