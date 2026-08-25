-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΧΩΡΟΣ ΤΟΥ ΛΟΓΙΣΤΗ ΔΕΙΧΝΕΙ ΠΕΛΑΤΕΣ ΠΟΥ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΑΝΟΙΞΕΙ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΑΔΙΕΞΟΔΟ. Η λίστα των πελατών λέει ποιος δεν κλείνει και τι του λείπει.
-- Το επόμενο πράγμα που θέλει ο λογιστής είναι να ΔΕΙ αυτόν τον πελάτη: τα
-- ποσά ανά ακίνητο, τη σύνοψη της χρήσης, το αρχείο. Δεν υπήρχε τρόπος. Η
-- κάρτα δεν ήταν σύνδεσμος και ο μόνος δρόμος προς την κατάσταση ήταν ο
-- σύνδεσμος που είχε λάβει με μήνυμα, κρατημένος σε σελιδοδείκτη. Δηλαδή
-- ακριβώς οι ογδόντα σελιδοδείκτες που αυτή η οθόνη ήρθε να καταργήσει.
--
-- ΤΟ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΤΗΣ ΚΑΤΑΣΤΑΣΗΣ ΜΠΑΙΝΕΙ ΣΤΗ ΛΙΣΤΑ. Είναι το ΤΡΕΧΟΝ token
-- του ιδιοκτήτη, οπότε είναι και πάντα ενημερωμένο: αν ο ιδιοκτήτης αλλάξει
-- λογιστή και περιστρέψει τον σύνδεσμο, η επόμενη φόρτωση της λίστας φέρνει το
-- νέο. Ενας σελιδοδείκτης δεν το κάνει αυτό.
--
-- ΚΑΙ ΔΕΝ ΔΙΝΕΙ ΤΙΠΟΤΑ ΠΑΡΑΠΑΝΩ. Ο λογιστής βλέπει τη γραμμή μόνο όσο υπάρχει
-- ενεργή σύνδεση στο `accountant_clients` — την ίδια που ο ιδιοκτήτης μπορεί να
-- κόψει οποτεδήποτε. Και η ίδια η `get_accountant_data` ελέγχει χωριστά ότι ο
-- σύνδεσμος είναι ενεργός και μη ληγμένος: ένα ανακλημένο token δεν ανοίγει
-- τίποτα, όσο κι αν το κρατά κάποιος.
--
-- ΚΕΝΟ ΟΤΑΝ ΔΕΝ ΥΠΑΡΧΕΙ. Ο ιδιοκτήτης μπορεί να έχει ανακαλέσει τον σύνδεσμο
-- και να μένει η σύνδεση: τότε η κάρτα δεν ανοίγει και το λέει, αντί να
-- οδηγεί σε σελίδα «ο σύνδεσμος δεν είναι έγκυρος».
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.accountant_clients_overview(p_year integer)
returns json
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_me uuid := auth.uid();
  v_rows json;
begin
  if v_me is null then return '[]'::json; end if;

  select coalesce(json_agg(r order by r->>'name'), '[]'::json) into v_rows from (
    select json_build_object(
      'ownerId',      ac.owner_id,
      'name',         coalesce(nullif(trim(bp.owner_name), ''), nullif(trim(bp.full_name), ''), 'Ιδιοκτήτης'),
      'afm',          bp.afm,
      'linkedAt',     ac.linked_at,
      -- Το τρέχον, ζωντανό αναγνωριστικό της κατάστασης. Κενό όταν ο ιδιοκτήτης
      -- έχει ανακαλέσει ή έχει λήξει: η οθόνη το λέει, δεν οδηγεί σε άδεια πόρτα.
      'token',        (select al.token from accountant_links al
                        where al.user_id = ac.owner_id
                          and coalesce(al.active, true)
                          and (al.expires_at is null or al.expires_at > now())
                        limit 1),
      'properties',   (select count(*) from user_properties up where up.user_id = ac.owner_id),
      'expenses',     (select count(*) from expenses e
                        where e.user_id = ac.owner_id and extract(year from e.date) = p_year),
      'uncategorised',(select count(*) from expenses e
                        where e.user_id = ac.owner_id and extract(year from e.date) = p_year
                          and coalesce(nullif(trim(e.category), ''), '') = ''),
      'noSupplierAfm',(select count(*) from expenses e
                        where e.user_id = ac.owner_id and extract(year from e.date) = p_year
                          and coalesce(nullif(trim(e.supplier_afm), ''), '') = ''),
      'rentsUnpaid',  (select count(*) from rent_payments rp
                        where rp.user_id = ac.owner_id and rp.period_year = p_year and rp.paid is not true),
      'stays',        (select count(*) from client_stays s
                        where s.user_id = ac.owner_id
                          and extract(year from coalesce(s.check_in, s.check_out)) = p_year),
      'staysNoFee',   (select count(*) from client_stays s
                        where s.user_id = ac.owner_id
                          and extract(year from coalesce(s.check_in, s.check_out)) = p_year
                          and s.channel in ('airbnb', 'booking')
                          and coalesce(s.platform_fee, 0) <= 0),
      'openRequests', (select count(*) from accountant_requests ar
                        where ar.owner_id = ac.owner_id and ar.accountant_id = v_me and ar.status = 'open')
    ) as r
    from accountant_clients ac
    left join billing_profiles bp on bp.user_id = ac.owner_id
    -- Ο ΕΛΕΓΧΟΣ ΤΗΣ ΑΝΑΚΛΗΣΗΣ ΜΕΝΕΙ ΑΚΡΙΒΩΣ ΟΠΩΣ ΗΤΑΝ. Η αξίωση ισχύει μόνο
    -- όσο το token με το οποίο δόθηκε είναι ακόμη ο ενεργός σύνδεσμος του
    -- ιδιοκτήτη: η περιστροφή είναι πραγματική ανάκληση (20260818090000).
    where ac.accountant_id = v_me
      and public.accountant_link_live(v_me, ac.owner_id)
  ) sub;

  return v_rows;
end;
$$;

alter function public.accountant_clients_overview(integer) owner to postgres;
revoke all    on function public.accountant_clients_overview(integer) from public, anon;
grant execute on function public.accountant_clients_overview(integer) to authenticated;

comment on function public.accountant_clients_overview(integer) is
  'Οι πελάτες του λογιστή για μια χρήση, με τους μετρητές που δείχνουν τι λείπει και με το ΤΡΕΧΟΝ αναγνωριστικό της κατάστασης ώστε η κάρτα να ανοίγει. Κενό αναγνωριστικό σημαίνει ανακλημένος ή ληγμένος σύνδεσμος.';
