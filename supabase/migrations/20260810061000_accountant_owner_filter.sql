-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΦΑΚΕΛΟΣ ΤΟΥ ΛΟΓΙΣΤΗ ΔΕΧΕΤΑΙ ΜΟΝΟ ΓΡΑΜΜΕΣ ΤΟΥ ΠΕΛΑΤΗ ΤΟΥ
-- ─────────────────────────────────────────────────────────────────────────
-- Η `get_accountant_data` είναι SECURITY DEFINER: παρακάμπτει το RLS, γιατί ο
-- λογιστής δεν έχει λογαριασμό — μπαίνει με σύνδεσμο. Άρα ΚΑΘΕ φίλτρο πρέπει να
-- είναι γραμμένο ρητά μέσα της. Το ενοίκιο το είχε (`rp.user_id = v_link.user_id`,
-- δύο φορές). Οι δαπάνες και οι διαμονές δεν το είχαν: ενώνονταν μόνο με
-- `property_id`.
--
-- Η ίδια ασυμμετρία με το `20260810060000`, ένα επίπεδο πιο πάνω: γραμμή που
-- γράφτηκε σε ξένο ακίνητο έμπαινε στον φάκελο του λογιστή σαν να ήταν του
-- πελάτη του. Το `parent_property_scope` έκλεισε την πόρτα της εγγραφής· εδώ
-- κλείνει και η πόρτα της ανάγνωσης, ώστε ό,τι έχει ήδη γραφτεί να μη διαβαστεί.
--
-- Δύο κλειδαριές για την ίδια πόρτα δεν είναι επανάληψη: η μία φυλάει το μέλλον,
-- η άλλη το παρελθόν.
--
-- ΤΟ ΤΡΕΧΟΝ ΜΙΣΘΩΜΑ ΤΟ ΙΔΙΟ. Το `rent_monthly` διάβαζε τον τελευταίο μισθωτή του
-- ακινήτου χωρίς κανένα φίλτρο κατόχου: πλαστός ενοικιαστής θα άλλαζε το ποσό
-- που διαβάζει ο επαγγελματίας ως συμφραζόμενο.
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
      'rent_monthly', (
        select t.monthly_rent from tenants t
        where t.property_id = p.id and t.user_id = v_link.user_id
        order by t.created_at desc limit 1
      ),
      'expenses', coalesce((
        select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date))
        from expenses e
        where e.property_id = p.id and e.user_id = v_link.user_id and extract(year from e.date) = p_year
      ), '[]'::json),
      -- client_stays.property_id είναι TEXT, το p.id uuid — το cast μένει.
      'stays', coalesce((
        select json_agg(json_build_object('check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights, 'total', s.total))
        from client_stays s
        where s.property_id = p.id::text and s.user_id = v_link.user_id
          and extract(year from coalesce(s.check_in, s.check_out)) = p_year
      ), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $$;

grant execute on function public.get_accountant_data(text, integer) to anon, authenticated;

-- Η Postgres ΔΕΝ ελέγχει σώμα plpgsql στο create — μόνο στην εκτέλεση.
do $$
declare v json;
begin
  v := public.get_accountant_data('__anyparktos__', 2025);
  if v is not null then
    raise exception 'άκυρος σύνδεσμος επέστρεψε δεδομένα';
  end if;
end $$;
