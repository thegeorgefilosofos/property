-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΑΝΑΚΛΗΣΗ ΤΟΥ ΛΟΓΙΣΤΗ ΕΙΝΑΙ ΠΡΑΓΜΑΤΙΚΗ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΚΟΥΜΠΙ ΛΕΓΕΤΑΙ «ΑΝΑΚΛΗΣΗ» ΚΑΙ ΔΕΝ ΑΝΑΚΑΛΟΥΣΕ. Ο ιδιοκτήτης το πατά, ο
-- σύνδεσμος περιστρέφεται, η οθόνη γράφει «ο σύνδεσμος ανακλήθηκε» — και ο
-- λογιστής που είχε ΗΔΗ μπει στον χώρο εργασίας συνέχιζε να βλέπει τα πάντα:
-- ονόματα, ΑΦΜ, ακίνητα, δαπάνες, ενοίκια, διαμονές. Για πάντα.
--
-- ΓΙΑΤΙ. Υπάρχουν δύο δρόμοι προς τα δεδομένα και ανακαλούσε μόνο ο ένας:
--
--   1. `get_accountant_data(p_token, …)` — ψάχνει τον σύνδεσμο ΜΕ ΤΟ TOKEN.
--      Η περιστροφή τον κλείνει αμέσως. Αυτός δούλευε.
--   2. `accountant_clients_overview` / `accountant_request_item` — κοιτούν την
--      ΑΞΙΩΣΗ (accountant_clients.active), που δεν θυμόταν με ποιον σύνδεσμο
--      δόθηκε. Η περιστροφή δεν την άγγιζε καθόλου.
--
-- Η στήλη `claimed_token` προστέθηκε στις 14/08 ακριβώς γι' αυτό και το σχόλιο
-- της μετανάστευσης έγραφε «τώρα το θυμάται, οπότε η περιστροφή του συνδέσμου
-- είναι πραγματική ανάκληση». Γραφόταν, αλλά ΔΕΝ ΤΗ ΔΙΑΒΑΖΕ ΚΑΝΕΙΣ. Μια στήλη
-- που μόνο γράφεται δεν είναι έλεγχος· είναι σημείωση.
--
-- ΤΙ ΑΛΛΑΖΕΙ ΕΔΩ. Η αξίωση ισχύει μόνο όσο το token με το οποίο δόθηκε είναι
-- ακόμη ο ΕΝΕΡΓΟΣ σύνδεσμος του ιδιοκτήτη. Ενας κανόνας, σε μία συνάρτηση, που
-- τον καλούν και οι δύο δρόμοι — ώστε ο επόμενος δρόμος που θα προστεθεί να
-- έχει προφανές πού να ρωτήσει.
--
-- ΤΑ ΠΑΛΙΑ ΚΕΝΑ `claimed_token`. Οι αξιώσεις πριν από τις 14/08 έχουν NULL:
-- δεν ξέρουμε με ποιο link δόθηκαν. Δεν τις κόβουμε στα τυφλά —τους δίνουμε το
-- σημερινό ενεργό token του ιδιοκτήτη— αλλά από την επόμενη περιστροφή και
-- μετά υπόκεινται στον ίδιο κανόνα με όλες. Το NULL δεν επιτρέπεται ξανά.
-- ═══════════════════════════════════════════════════════════════════════════

-- Οι κενές αξιώσεις υιοθετούν τον σημερινό ενεργό σύνδεσμο του ιδιοκτήτη τους.
-- Οσες δεν βρίσκουν ενεργό σύνδεσμο (ο ιδιοκτήτης δεν έχει βγάλει ποτέ) μένουν
-- NULL και ο έλεγχος από κάτω τις κόβει: δεν υπάρχει σύνδεσμος να τις στηρίξει.
update public.accountant_clients ac
   set claimed_token = al.token
  from public.accountant_links al
 where al.user_id = ac.owner_id
   and al.active
   and ac.claimed_token is null;

-- ── Ο ΕΝΑΣ ΚΑΝΟΝΑΣ ────────────────────────────────────────────────────────
create or replace function public.accountant_link_live(p_accountant uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from accountant_clients ac
      join accountant_links al
        on al.user_id = ac.owner_id
       and al.active
       and al.token = ac.claimed_token          -- ΙΔΙΟ link, όχι απλώς «κάποιο»
     where ac.accountant_id = p_accountant
       and ac.owner_id = p_owner
       and ac.active
       and (al.expires_at is null or al.expires_at > now())
  );
$$;

comment on function public.accountant_link_live(uuid, uuid) is
  'Ισχύει ακόμη η πρόσβαση αυτού του λογιστή σε αυτόν τον ιδιοκτήτη; Απαιτεί '
  'ενεργή αξίωση ΚΑΙ ότι ο σύνδεσμος με τον οποίο δόθηκε είναι ακόμη ο ενεργός '
  'σύνδεσμος του ιδιοκτήτη. Η περιστροφή του συνδέσμου είναι ανάκληση.';

revoke all on function public.accountant_link_live(uuid, uuid) from public, anon;
grant execute on function public.accountant_link_live(uuid, uuid) to authenticated;

-- ── ΔΡΟΜΟΣ 1: Η ΛΙΣΤΑ ΠΕΛΑΤΩΝ ─────────────────────────────────────────────
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
    where ac.accountant_id = v_me
      and public.accountant_link_live(v_me, ac.owner_id)
  ) sub;

  return v_rows;
end $$;

revoke all on function public.accountant_clients_overview(integer) from public, anon;
grant execute on function public.accountant_clients_overview(integer) to authenticated;

-- ── ΔΡΟΜΟΣ 2: ΤΟ ΑΙΤΗΜΑ ΠΡΟΣ ΤΟΝ ΙΔΙΟΚΤΗΤΗ ────────────────────────────────
-- Δεν διαβάζει δεδομένα, αλλά ΓΡΑΦΕΙ στον ιδιοκτήτη. Ενας ανακληθείς λογιστής
-- που συνεχίζει να στέλνει «στείλε μου το Ε9» είναι το ίδιο πρόβλημα από την
-- ανάποδη: ο ιδιοκτήτης νομίζει ότι έκοψε τη σχέση και η σχέση συνεχίζεται.
create or replace function public.accountant_request_item(p_owner uuid, p_item text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_item text := left(btrim(coalesce(p_item, '')), 160);
begin
  if v_me is null then return json_build_object('ok', false, 'reason', 'anonymous'); end if;
  if v_item = '' then return json_build_object('ok', false, 'reason', 'empty'); end if;
  if not public.accountant_link_live(v_me, p_owner) then
    return json_build_object('ok', false, 'reason', 'not_linked');
  end if;

  -- Δεύτερο πάτημα στο ίδιο πράγμα δεν φτιάχνει δεύτερη γραμμή: ο ιδιοκτήτης
  -- θα έβλεπε την ίδια υπενθύμιση δύο φορές και θα σταματούσε να τις διαβάζει.
  select id into v_id from accountant_requests
   where accountant_id = v_me and owner_id = p_owner and item = v_item and status = 'open'
   limit 1;
  if v_id is not null then return json_build_object('ok', true, 'id', v_id, 'existing', true); end if;

  insert into accountant_requests (accountant_id, owner_id, item, note)
    values (v_me, p_owner, v_item, left(btrim(coalesce(p_note, '')), 500))
    returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'existing', false);
end $$;

revoke all on function public.accountant_request_item(uuid, text, text) from public, anon;
grant execute on function public.accountant_request_item(uuid, text, text) to authenticated;

-- ── ΤΟ ΚΕΝΟ ΔΕΝ ΞΑΝΑΓΙΝΕΤΑΙ ΔΕΚΤΟ ─────────────────────────────────────────
-- Καμία νέα αξίωση χωρίς το token που τη γέννησε. Χωρίς αυτό, μια μελλοντική
-- διαδρομή που ξεχνά να γράψει το `claimed_token` θα ξανάφτιαχνε αθάνατη
-- πρόσβαση — και πάλι σιωπηλά.
--
-- ΚΑΙ ΤΟ ΙΔΙΟ ΤΟ ΠΕΡΙΟΡΙΣΜΑ ΜΠΑΙΝΕΙ ΙΔΙΟΔΥΝΑΜΑ. Γραφόταν ως σκέτο
-- `alter table … add constraint`, που η PostgreSQL ΔΕΝ δέχεται με
-- `if not exists`: η δεύτερη εφαρμογή σκάει με 42710 «already exists».
-- Ολόκληρος ο αγωγός στηρίζεται στο ότι μια μετανάστευση μπορεί να ξανατρέξει
-- ακίνδυνα — και αυτή η μία γραμμή το έσπαγε. Στις 19/08/2026 σταμάτησε το
-- staging στη δέκατη από δεκαέξι μεταναστεύσεις και οι έξι επόμενες δεν
-- έτρεξαν ποτέ. Το ιδίωμα με το `pg_constraint` το χρησιμοποιούν ήδη δώδεκα
-- άλλα περιορίσματα του repo· αυτό εδώ ήταν η εξαίρεση.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accountant_clients_claimed_token_present') then
    alter table public.accountant_clients
      add constraint accountant_clients_claimed_token_present
      check (not active or claimed_token is not null) not valid;
  end if;
end $$;
