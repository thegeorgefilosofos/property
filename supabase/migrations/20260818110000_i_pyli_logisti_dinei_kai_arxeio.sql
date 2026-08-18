-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΠΥΛΗ ΤΟΥ ΛΟΓΙΣΤΗ ΔΙΝΕΙ ΚΑΙ ΑΡΧΕΙΟ, ΟΧΙ ΜΟΝΟ ΟΘΟΝΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΠΡΟΒΛΗΜΑ. Ο λογιστής άνοιγε τον σύνδεσμο, διάβαζε σωστά νούμερα, και μετά
-- τα ΠΛΗΚΤΡΟΛΟΓΟΥΣΕ ξανά στο πρόγραμμά του. Η πύλη δεν κατέβαζε τίποτα: ήταν
-- σελίδα για ανάγνωση, σε επάγγελμα που δουλεύει με αρχεία. Το προϊόν είχε ήδη
-- γραμμένη ολόκληρη μηχανή εξαγωγής — αλλά μόνο στον πίνακα του ΙΔΙΟΚΤΗΤΗ,
-- δηλαδή στα χέρια του ανθρώπου που δεν συμπληρώνει το έντυπο.
--
-- ΤΙ ΛΕΙΠΕΙ ΓΙΑ ΝΑ ΣΤΑΘΕΙ ΤΟ ΑΡΧΕΙΟ ΔΙΠΛΑ ΣΤΟ Ε2. Δύο στοιχεία του ακινήτου,
-- που τα ζητά η ίδια η αναλυτική κατάσταση μισθωμάτων και που η συνάρτηση δεν
-- επέστρεφε: το ΕΜΒΑΔΟΝ και το ΠΟΣΟΣΤΟ ΣΥΝΙΔΙΟΚΤΗΣΙΑΣ. Χωρίς το ποσοστό, ένα
-- ακίνητο 50% δηλώνεται ολόκληρο· χωρίς το εμβαδόν, η γραμμή δεν συμπληρώνεται
-- καθόλου.
--
-- ΤΙ ΔΕΝ ΠΡΟΣΤΙΘΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ. Ονόματα και ΑΦΜ μισθωτών, ΑΦΜ προμηθευτών,
-- ΑΦΜ ιδιοκτήτη. Ο ιδιοκτήτης, τη στιγμή που βγάζει τον σύνδεσμο, διαβάζει:
-- «Ο λογιστής δεν βλέπει πελατολόγιο ούτε στοιχεία τρίτων». Αυτή είναι η
-- συμφωνία, και το token είναι διαπιστευτήριο κομιστή: όποιος το βρει, βλέπει
-- ό,τι βλέπει ο λογιστής. Το εμβαδόν και το ποσοστό είναι στοιχεία ΤΟΥ ΙΔΙΟΥ
-- ΤΟΥ ΑΚΙΝΗΤΟΥ, μέσα στη συμφωνία. Το ΑΦΜ ενός τρίτου δεν είναι, όσο χρήσιμο
-- κι αν είναι. Η οθόνη λέει ρητά τι λείπει από το αρχείο και ποιος το έχει.
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
  'Η εικόνα της χρήσης για τον λογιστή. Οι διαμονές δίνονται με την ανάλυση '
  'ποσού τους, ώστε η οθόνη να εφαρμόσει τον ΙΔΙΟ κανόνα δηλωτέου ακαθάριστου '
  'με το Ε2 (lib/clients/stayAmounts.ts) και όχι το ωμό total. Εμβαδόν και '
  'ποσοστό συνιδιοκτησίας για τη γραμμή του εντύπου. Καμία ταυτότητα τρίτου: '
  'ούτε μισθωτής, ούτε προμηθευτής, ούτε επισκέπτης.';
