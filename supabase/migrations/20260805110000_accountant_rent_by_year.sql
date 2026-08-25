-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΠΥΛΗ ΤΟΥ ΛΟΓΙΣΤΗ ΔΗΛΩΝΕ ΕΝΟΙΚΙΑ ΠΟΥ ΔΕΝ ΕΙΣΠΡΑΧΘΗΚΑΝ ΠΟΤΕ
-- ─────────────────────────────────────────────────────────────────────────
-- Η `get_accountant_data` επέστρεφε:
--
--   'rent', (select t.monthly_rent from tenants t
--            where t.property_id = p.id order by t.created_at desc limit 1)
--
-- δηλαδή το μίσθωμα του ΤΕΛΕΥΤΑΙΟΥ μισθωτή, χωρίς κανένα φίλτρο έτους και χωρίς
-- καμία σχέση με τις ημερομηνίες της μίσθωσης. Και η σελίδα το πολλαπλασίαζε
-- επί δώδεκα: `rentAnnual = (p.rent || 0) * 12`.
--
-- Η ασυμμετρία μέσα στην ΙΔΙΑ συνάρτηση το αποδεικνύει: τα `expenses` φιλτράρονται
-- με `extract(year from e.date) = p_year` και τα `stays` με `extract(year from
-- coalesce(s.check_in, s.check_out)) = p_year`. Μόνο το ενοίκιο δεν φιλτραριζόταν.
--
-- ΤΙ ΣΗΜΑΙΝΕ ΣΤΗΝ ΠΡΑΞΗ
--
-- Ο πίνακας ανοίγει προεπιλεγμένος στην ΠΡΟΗΓΟΥΜΕΝΗ χρονιά, γιατί εκεί δουλεύει
-- ο λογιστής. Μισθωτής που μπήκε 1/3/2026 με 900 €: ο λογιστής βλέπει για το
-- 2025 «Συνολικά έσοδα 10.800,00 €» και φόρο πάνω σε αυτά, για χρονιά που το
-- ακίνητο απέδωσε μηδέν. Πιο συχνά και πιο ύπουλα: μισθωτής από 1/7/2025 με
-- 800 € → το 2025 δηλώνεται 9.600 € αντί 4.800 €. Ακριβώς διπλάσιο.
--
-- Είναι η ΜΟΝΗ οθόνη που βλέπει επαγγελματίας και το ποσό στέκεται δίπλα σε
-- ρητή περιγραφή φορολογικής κλίμακας — άρα διαβάζεται ως τεκμηριωμένο.
--
-- Η ΔΙΟΡΘΩΣΗ: ΙΔΙΑ ΠΗΓΗ ΜΕ ΤΟ Ε2
--
-- Το `rent_payments`, φιλτραρισμένο με `period_year` — ό,τι ακριβώς αθροίζει το
-- `buildE2Row` για το επίσημο έντυπο. Δύο οθόνες που μιλούν για το ίδιο έτος δεν
-- επιτρέπεται να το υπολογίζουν αλλιώς.
--
-- Επιστρέφεται ΚΑΙ το πλήθος των καταχωρημένων περιόδων (`rent_months`), ώστε η
-- σελίδα να λέει σε τι βασίζεται. Μηδέν εισπράξεις είναι πληροφορία που ο
-- λογιστής ΠΡΕΠΕΙ να δει — όχι κενό που θα περάσει για μηδενικό έσοδο.
-- Το τρέχον μίσθωμα μένει ως `rent_monthly`, ρητά ξεχωριστό: είναι συμφραζόμενο
-- («σήμερα νοικιάζεται 900 €»), όχι έσοδο του έτους.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_accountant_data(p_token text, p_year integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_link record; v_props json; v_owner text;
begin
  select * into v_link from accountant_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select coalesce(nullif(trim(owner_name), ''), full_name) into v_owner from billing_profiles where user_id = v_link.user_id;
  select json_agg(sub.row) into v_props from (
    select json_build_object(
      'name', p.name, 'atak', p.atak, 'address', p.address, 'prop_type', p.prop_type,
      -- ΤΟ ΕΙΣΠΡΑΧΘΕΝ ΕΝΟΙΚΙΟ ΤΟΥ ΕΤΟΥΣ. Ίδια πηγή και ίδιο φίλτρο με το Ε2.
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
      'rent_monthly', (select t.monthly_rent from tenants t where t.property_id = p.id order by t.created_at desc limit 1),
      'expenses', coalesce((select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date)) from expenses e where e.property_id = p.id and extract(year from e.date) = p_year), '[]'::json),
      -- client_stays.property_id είναι TEXT, το p.id uuid — το cast μένει.
      'stays', coalesce((select json_agg(json_build_object('check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights, 'total', s.total)) from client_stays s where s.property_id = p.id::text and extract(year from coalesce(s.check_in, s.check_out)) = p_year), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $$;

grant execute on function public.get_accountant_data(text, integer) to anon, authenticated;

-- Η Postgres ΔΕΝ ελέγχει σώμα plpgsql στο create — μόνο στην εκτέλεση. Χωρίς
-- αυτό το μπλοκ, ένα λάθος όνομα στήλης θα περνούσε το deploy καθαρό και θα
-- έσκαγε την πρώτη φορά που θα άνοιγε τον σύνδεσμο ένας λογιστής.
do $$
declare v json;
begin
  v := public.get_accountant_data('__anyparktos__', 2025);
  if v is not null then
    raise exception 'άκυρος σύνδεσμος επέστρεψε δεδομένα';
  end if;
end $$;
