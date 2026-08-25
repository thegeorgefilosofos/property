-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΠΥΛΗ ΛΟΓΙΣΤΗ ΚΛΕΙΝΕΙ ΤΟΝ ΚΥΚΛΟ ΜΕΣΑ ΣΤΟ ΠΡΟΪΟΝ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΡΙΑ ΠΟΥ ΕΛΕΙΠΑΝ ΑΠΟ ΤΗ ΛΙΣΤΑ ΤΩΝ ΠΕΛΑΤΩΝ, ΚΑΙ ΤΑ ΤΡΙΑ ΤΟΝ ΕΣΤΕΛΝΑΝ ΑΛΛΟΥ:
--
-- 1. ΠΟΤΕ ΕΝΗΜΕΡΩΘΗΚΕ Ο ΦΑΚΕΛΟΣ. Ο λογιστής έβλεπε «τι λείπει» χωρίς να ξέρει
--    αν κοιτάζει χθεσινή εικόνα ή τρίμηνη. Δύο πελάτες με τα ίδια κενά είναι
--    εντελώς διαφορετική δουλειά όταν ο ένας καταχώρησε χθες και ο άλλος τον
--    Μάρτιο. Η τελευταία κίνηση είναι η νεότερη καταχώρηση σε δαπάνες,
--    εισπράξεις, διαμονές ή έγγραφα.
--
-- 2. ΤΙ ΑΚΡΙΒΩΣ ΕΧΕΙ ΖΗΤΗΣΕΙ. Η κάρτα έλεγε «2 αιτήματα σε εκκρεμότητα»,
--    δηλαδή έναν αριθμό χωρίς περιεχόμενο: ούτε ποια, ούτε πότε στάλθηκαν,
--    ούτε τρόπο να πάρει πίσω λάθος αίτημα. Τα αιτήματα έρχονται πλέον με τη
--    λίστα, ολόκληρα.
--
-- 3. ΟΤΑΝ Ο ΙΔΙΟΚΤΗΤΗΣ ΑΠΑΝΤΗΣΕΙ, ΚΑΝΕΙΣ ΔΕΝ ΤΟ ΜΑΘΑΙΝΕ. Ο ιδιοκτήτης πατούσε
--    «το έστειλα» στον πίνακά του και το αίτημα γινόταν `done` σιωπηλά. Ο
--    λογιστής ξαναέμπαινε στην πύλη για να δει αν ήρθε: δηλαδή η δουλειά μας
--    τελείωνε ακριβώς εκεί που άρχιζε η αναμονή. Ενα μήνυμα κλείνει τον κύκλο.
--
-- ΤΟ ΜΗΝΥΜΑ ΕΙΝΑΙ ΣΥΝΑΛΛΑΚΤΙΚΟ ΚΑΙ ΟΧΙ ΕΝΗΜΕΡΩΤΙΚΟ. Δεν πουλά τίποτα:
-- απαντά σε αίτημα που έκανε ο ίδιος ο παραλήπτης, λίγες ώρες πριν. Ως
-- ενημερωτικό θα κρατιόταν πίσω από τον κεντρικό διακόπτη και θα έφτανε
-- ημέρες αργότερα, ή καθόλου.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 ΚΑΙ 2: Η ΛΙΣΤΑ ΜΑΘΑΙΝΕΙ ΔΥΟ ΠΡΑΓΜΑΤΑ ΑΚΟΜΗ ────────────────────────
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
  ) sub;

  return v_rows;
end;
$$;

alter function public.accountant_clients_overview(integer) owner to postgres;
revoke all    on function public.accountant_clients_overview(integer) from public, anon;
grant execute on function public.accountant_clients_overview(integer) to authenticated;

comment on function public.accountant_clients_overview(integer) is
  'Οι πελάτες του λογιστή για μια χρήση: οι μετρητές που δείχνουν τι λείπει, το τρέχον αναγνωριστικό της κατάστασης, πότε κινήθηκε τελευταία φορά ο φάκελος και τα ανοιχτά αιτήματα ολόκληρα.';

-- ── 3: Ο ΛΟΓΙΣΤΗΣ ΜΑΘΑΙΝΕΙ ΟΤΙ ΗΡΘΕ ΑΥΤΟ ΠΟΥ ΖΗΤΗΣΕ ────────────────────
-- ΓΙΑΤΙ TRIGGER ΚΑΙ ΟΧΙ ΚΛΗΣΗ ΑΠΟ ΤΗΝ ΟΘΟΝΗ. Ο ιδιοκτήτης απαντά με απλό
-- `update` πάνω στον πίνακα, μέσα από την RLS του: δεν υπάρχει διαδρομή
-- διακομιστή να κρεμάσουμε το μήνυμα. Και μια δεύτερη οθόνη που θα έκανε το
-- ίδιο (π.χ. μαζική απάντηση) θα το ξεχνούσε.
--
-- ΜΟΝΟ ΣΤΗ ΜΕΤΑΒΑΣΗ ΠΡΟΣ «ΕΓΙΝΕ». Το `dismissed` σημαίνει «δεν ισχύει» και
-- δεν είναι είδηση που δικαιολογεί μήνυμα· και μια δεύτερη εγγραφή πάνω σε
-- ήδη κλειστό αίτημα δεν ξαναστέλνει τίποτα.
create or replace function public.notify_accountant_request_done()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_email text;
  v_name  text;
  v_owner text;
begin
  if new.status <> 'done' or coalesce(old.status, '') = 'done' then
    return new;
  end if;

  select lower(btrim(u.email)),
         nullif(btrim(coalesce(bp.owner_name, bp.full_name, '')), '')
    into v_email, v_name
    from auth.users u
    left join billing_profiles bp on bp.user_id = u.id
   where u.id = new.accountant_id;

  if v_email is null or v_email = '' then return new; end if;

  select nullif(btrim(coalesce(bp.owner_name, bp.full_name, '')), '')
    into v_owner from billing_profiles bp where bp.user_id = new.owner_id;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  values ('accountant_request_answered', v_email, v_name,
          jsonb_build_object(
            'name', v_name,
            'owner', coalesce(v_owner, 'Ο πελάτης σου'),
            'item', new.item),
          'transactional',
          -- ΕΝΑ ΜΗΝΥΜΑ ΑΝΑ ΑΙΤΗΜΑ, ΟΣΕΣ ΦΟΡΕΣ ΚΙ ΑΝ ΓΡΑΦΤΕΙ Η ΓΡΑΜΜΗ.
          'accountant_answered:' || new.id::text,
          now())
  on conflict (dedup_key) do nothing;

  return new;
end;
$$;

alter function public.notify_accountant_request_done() owner to postgres;
-- ΚΑΜΙΑ ΑΔΕΙΑ ΣΕ ΚΑΝΕΝΑΝ. Μια SECURITY DEFINER είναι εξ ορισμού εκτελέσιμη από
-- τον ανώνυμο και θα παρέκαμπτε την RLS. Ο trigger τρέχει με τον ιδιοκτήτη του
-- πίνακα και δεν χρειάζεται να τον καλεί κανείς ονομαστικά.
revoke all on function public.notify_accountant_request_done() from public, anon, authenticated;

drop trigger if exists accountant_request_answered on public.accountant_requests;
create trigger accountant_request_answered
  after update of status on public.accountant_requests
  for each row execute function public.notify_accountant_request_done();

comment on function public.notify_accountant_request_done() is
  'Οταν ο ιδιοκτήτης απαντήσει «το έστειλα», ο λογιστής παίρνει μήνυμα. Χωρίς αυτό ο κύκλος έκλεινε σιωπηλά και ο λογιστής ξαναέμπαινε στην πύλη για να δει αν ήρθε.';
