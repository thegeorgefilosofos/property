-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΚΛΕΙΔΑΡΙΑ ΤΗΣ ΠΥΛΗΣ ΛΟΓΙΣΤΗ ΙΣΧΥΕΙ ΚΑΙ ΣΤΗ ΛΙΣΤΑ ΠΕΛΑΤΩΝ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΕΓΙΝΕ. Στις 19/08 μπήκε η κλειδαριά συνδρομής στη διαδρομή ανάγνωσης της
-- πύλης: η `get_accountant_data` ελέγχει `user_plan_rank(owner) >= 1` σε ΚΑΘΕ
-- άνοιγμα, γιατί το token είναι διαπιστευτήριο κομιστή και δεν ξαναρωτά
-- κανέναν. Το σχόλιο εκείνης της μετανάστευσης το λέει ρητά: «Η ΚΛΕΙΔΑΡΙΑ.
-- Ελέγχεται σε ΚΑΘΕ άνοιγμα, όχι μόνο στην έκδοση».
--
-- Εξι μέρες αργότερα, στις 25/08, γράφτηκε η `accountant_clients_overview` για
-- τον χώρο εργασίας του λογιστή. Φιλτράρει με `accountant_id = auth.uid()` και
-- με ζωντανό σύνδεσμο· τη συνδρομή δεν τη ρωτά. Δηλαδή η κλειδαριά μπήκε στη
-- μία πόρτα και η δεύτερη πόρτα ανοίχτηκε δίπλα της.
--
-- ΤΙ ΕΒΛΕΠΕ Ο ΛΟΓΙΣΤΗΣ. Ιδιοκτήτης που είχε συνδρομή, έδωσε σύνδεσμο και μετά
-- σταμάτησε να πληρώνει: η κάρτα του έμενε ολόκληρη στη λίστα, με ονοματεπώνυμο
-- και ΑΦΜ, πλήθος ακινήτων, πλήθη δαπανών, ενοικίων και διαμονών της χρήσης,
-- πότε κινήθηκε τελευταία φορά ο φάκελος, τα ανοιχτά αιτήματα και το ΕΝΕΡΓΟ
-- token. Το άνοιγμα του φακέλου όντως κοβόταν από την κλειδαριά της 19/08, άρα
-- τα βαθιά δεδομένα ήταν προστατευμένα· η ΚΑΡΤΑ όμως όχι. Το ΑΦΜ είναι
-- προσωπικό δεδομένο και τα πλήθη είναι επιχειρηματική εικόνα του ιδιοκτήτη.
--
-- ΚΑΙ ΗΤΑΝ ΚΑΙ ΑΝΤΙΦΑΤΙΚΟ. Ο λογιστής έβλεπε κάρτα με μετρητές, πατούσε το
-- όνομα και έπαιρνε «δεν βρέθηκε» — χωρίς να μαθαίνει γιατί, αφού το «δεν
-- βρέθηκε» είναι σκόπιμα αδιάφορο προς τον κομιστή token.
--
-- ΤΙ ΑΛΛΑΖΕΙ: μία γραμμή στο `where`, ο ΙΔΙΟΣ έλεγχος με την άλλη πόρτα. Ο
-- ιδιοκτήτης χωρίς ενεργό πακέτο φεύγει από τη λίστα, όπως φεύγει και από τον
-- φάκελο. Καμία δεύτερη λίστα πακέτων εδώ: η `user_plan_rank` ξέρει ήδη πακέτο,
-- δωρεάν μήνες, δοκιμή και ιδιότητα συνεργάτη.
--
-- ΤΟ ΥΠΟΛΟΙΠΟ ΣΩΜΑ ΕΙΝΑΙ ΑΥΤΟΥΣΙΟ από την 20260825150000. Η PostgreSQL δεν έχει
-- «άλλαξε μόνο αυτή τη γραμμή»: το `create or replace` θέλει ολόκληρη τη
-- συνάρτηση.
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
      'token',        (select al.token from accountant_links al
                        where al.user_id = ac.owner_id
                          and coalesce(al.active, true)
                          and (al.expires_at is null or al.expires_at > now())
                        limit 1),
      -- ΠΟΤΕ ΚΙΝΗΘΗΚΕ ΤΕΛΕΥΤΑΙΑ ΦΟΡΑ Ο ΦΑΚΕΛΟΣ. Ολες οι πηγές μαζί, γιατί
      -- «ενημερωμένος» σημαίνει ότι κάτι μπήκε, όχι ότι μπήκε δαπάνη.
      'lastActivity', (
        select max(t) from (
          select max(e.created_at) as t from expenses e where e.user_id = ac.owner_id
          union all
          select max(rp.created_at) from rent_payments rp where rp.user_id = ac.owner_id
          union all
          select max(s.created_at) from client_stays s where s.user_id = ac.owner_id
          union all
          select max(d.created_at) from property_documents d where d.user_id = ac.owner_id
        ) moves
      ),
      -- ΤΑ ΑΙΤΗΜΑΤΑ ΟΛΟΚΛΗΡΑ, ΟΧΙ ΣΕ ΠΛΗΘΟΣ. Ενας αριθμός δεν λέει ούτε τι
      -- ζητήθηκε ούτε πότε, ούτε επιτρέπει να παρθεί πίσω.
      'requests', coalesce((
        select json_agg(json_build_object(
          'id', ar.id, 'item', ar.item, 'note', ar.note, 'createdAt', ar.created_at
        ) order by ar.created_at)
        from accountant_requests ar
        where ar.owner_id = ac.owner_id and ar.accountant_id = v_me and ar.status = 'open'
      ), '[]'::json),
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
    -- Η αξίωση ισχύει μόνο όσο το token με το οποίο δόθηκε είναι ακόμη ο
    -- ενεργός σύνδεσμος του ιδιοκτήτη (20260818090000).
    where ac.accountant_id = v_me
      and public.accountant_link_live(v_me, ac.owner_id)
      -- Η ΙΔΙΑ ΚΛΕΙΔΑΡΙΑ ΜΕ ΤΗ `get_accountant_data` (20260819120000). Βαθμός 1 =
      -- πακέτο «Ενα ακίνητο». Χωρίς αυτήν, ο φάκελος κλείδωνε και η κάρτα με το
      -- ΑΦΜ και τους μετρητές έμενε ορθάνοιχτη.
      and public.user_plan_rank(ac.owner_id) >= 1
  ) sub;

  return v_rows;
end;
$$;

alter function public.accountant_clients_overview(integer) owner to postgres;
revoke all    on function public.accountant_clients_overview(integer) from public, anon;
grant execute on function public.accountant_clients_overview(integer) to authenticated;

comment on function public.accountant_clients_overview(integer) is
  'Οι πελάτες του λογιστή για μια χρήση, μόνο όσοι έχουν ενεργό πακέτο: οι μετρητές που δείχνουν τι λείπει, το τρέχον αναγνωριστικό της κατάστασης, πότε κινήθηκε τελευταία φορά ο φάκελος και τα ανοιχτά αιτήματα ολόκληρα.';
