-- ═══════════════════════════════════════════════════════════════════════════
--  Ο ΛΟΓΙΣΤΗΣ ΑΠΟΚΤΑ ΔΙΚΟ ΤΟΥ ΧΩΡΟ, ΜΕ ΟΛΟΥΣ ΤΟΥΣ ΠΕΛΑΤΕΣ ΤΟΥ ΜΑΖΙ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΥΠΗΡΧΕ. Ένας σύνδεσμος ανά ιδιοκτήτη: `/accountant/<token>`, μόνο για
--  ανάγνωση, ένας πελάτης τη φορά. Ο λογιστής όμως δεν έχει έναν πελάτη, έχει
--  ογδόντα. Με το παλιό σχήμα θα λάμβανε ογδόντα συνδέσμους σε ογδόντα email
--  και θα τους κρατούσε σε σελιδοδείκτες.
--
--  ΤΙ ΑΛΛΑΖΕΙ. Ο λογιστής φτιάχνει ΔΙΚΟ ΤΟΥ λογαριασμό και «διεκδικεί» κάθε
--  σύνδεσμο που του στέλνουν. Από εκεί και πέρα βλέπει μία λίστα με όλους τους
--  ιδιοκτήτες που τον εξουσιοδότησαν, και τι λείπει από τον καθένα.
--
--  ΚΑΙ Η ΑΝΤΙΣΤΡΟΦΗ ΚΑΤΕΥΘΥΝΣΗ, ΠΟΥ ΕΙΝΑΙ ΤΟ ΟΥΣΙΩΔΕΣ. Μέχρι τώρα η
--  πληροφορία πήγαινε μόνο προς τον λογιστή. Τώρα ο λογιστής ΖΗΤΑ: πατά δίπλα
--  σε ό,τι λείπει, και ο ιδιοκτήτης το βλέπει στον πίνακά του. Δηλαδή το
--  τηλεφώνημα «στείλε μου το εκκαθαριστικό» γίνεται γραμμή που κλείνει.
--
--  ΓΙΑΤΙ ΟΛΑ ΠΕΡΝΟΥΝ ΑΠΟ SECURITY DEFINER. Ο λογιστής ΔΕΝ αποκτά δικαίωμα
--  ανάγνωσης στους πίνακες του ιδιοκτήτη. Η RLS μένει ανέπαφη και ο λογιστής
--  βλέπει μόνο ό,τι του δίνει ρητά μία συνάρτηση, με σχήμα που ορίζουμε εμείς.
--  Αν αύριο θελήσουμε να μη βλέπει, π.χ., ονόματα ενοίκων, το κόβουμε σε ένα
--  σημείο. Με σκέτο GRANT δεν θα υπήρχε τέτοιο σημείο.
--
--  ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν στέλνει email. Ο κατάλογος κειμένων ζει σε edge function
--  και ένα `copy_id` που δεν υπάρχει εκεί θα ήταν σιωπηλά νεκρή ουρά. Η
--  ειδοποίηση είναι εντός εφαρμογής, που ούτως ή άλλως είναι το μέρος όπου ο
--  ιδιοκτήτης θα κάνει τη δουλειά.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ΠΟΙΟΣ ΛΟΓΙΣΤΗΣ ΒΛΕΠΕΙ ΠΟΙΟΝ ΙΔΙΟΚΤΗΤΗ ─────────────────────────────────
create table if not exists public.accountant_clients (
  accountant_id uuid not null,
  owner_id      uuid not null,
  linked_at     timestamptz not null default now(),
  active        boolean not null default true,
  primary key (accountant_id, owner_id)
);

create index if not exists accountant_clients_owner_idx on public.accountant_clients (owner_id);

alter table public.accountant_clients enable row level security;

-- Ο λογιστής βλέπει τις δικές του συνδέσεις. Ο ιδιοκτήτης βλέπει ποιος τον
-- βλέπει, και μπορεί να κόψει: το δικαίωμα ανάκλησης είναι δικό του, πάντα.
drop policy if exists accountant_clients_read on public.accountant_clients;
create policy accountant_clients_read on public.accountant_clients for select
  using (accountant_id = (select auth.uid()) or owner_id = (select auth.uid()));

drop policy if exists accountant_clients_owner_revoke on public.accountant_clients;
create policy accountant_clients_owner_revoke on public.accountant_clients for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists accountant_clients_owner_delete on public.accountant_clients;
create policy accountant_clients_owner_delete on public.accountant_clients for delete
  using (owner_id = (select auth.uid()) or accountant_id = (select auth.uid()));

-- ── ΤΙ ΖΗΤΗΣΕ Ο ΛΟΓΙΣΤΗΣ, ΚΑΙ ΑΝ ΗΡΘΕ ────────────────────────────────────
create table if not exists public.accountant_requests (
  id            uuid primary key default gen_random_uuid(),
  accountant_id uuid not null,
  owner_id      uuid not null,
  item          text not null,
  note          text,
  status        text not null default 'open',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  constraint accountant_requests_status_chk check (status in ('open', 'done', 'dismissed'))
);

create index if not exists accountant_requests_owner_idx on public.accountant_requests (owner_id, status);
create index if not exists accountant_requests_accountant_idx on public.accountant_requests (accountant_id, status);

alter table public.accountant_requests enable row level security;

drop policy if exists accountant_requests_read on public.accountant_requests;
create policy accountant_requests_read on public.accountant_requests for select
  using (accountant_id = (select auth.uid()) or owner_id = (select auth.uid()));

-- Ο ιδιοκτήτης απαντά: «το έστειλα» ή «δεν ισχύει». Το κείμενο του αιτήματος
-- δεν του ανήκει, οπότε δεν το αλλάζει.
drop policy if exists accountant_requests_owner_answer on public.accountant_requests;
create policy accountant_requests_owner_answer on public.accountant_requests for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Ο λογιστής παίρνει πίσω ό,τι ζήτησε κατά λάθος.
drop policy if exists accountant_requests_withdraw on public.accountant_requests;
create policy accountant_requests_withdraw on public.accountant_requests for delete
  using (accountant_id = (select auth.uid()));

-- ── Η ΣΥΝΔΕΣΗ: Ο ΛΟΓΙΣΤΗΣ ΔΙΕΚΔΙΚΕΙ ΤΟΝ ΣΥΝΔΕΣΜΟ ────────────────────────
-- Επιστρέφει το όνομα του ιδιοκτήτη ώστε η οθόνη να πει ΠΟΙΟΝ πρόσθεσε, και
-- όχι ένα άχρωμο «έγινε».
create or replace function public.accountant_claim(p_token text)
returns json
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_link record;
  v_me uuid := auth.uid();
  v_name text;
begin
  if v_me is null then return json_build_object('ok', false, 'reason', 'anonymous'); end if;

  select * into v_link from accountant_links
   where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return json_build_object('ok', false, 'reason', 'invalid'); end if;

  -- Κανείς δεν είναι λογιστής του εαυτού του: θα έβλεπε τα δικά του δεδομένα
  -- μέσα από διαδρομή που παρακάμπτει την RLS, χωρίς λόγο.
  if v_link.user_id = v_me then return json_build_object('ok', false, 'reason', 'self'); end if;

  insert into accountant_clients (accountant_id, owner_id)
    values (v_me, v_link.user_id)
  on conflict (accountant_id, owner_id) do update set active = true, linked_at = now();

  select coalesce(nullif(trim(owner_name), ''), nullif(trim(full_name), ''), 'Ιδιοκτήτης')
    into v_name from billing_profiles where user_id = v_link.user_id;

  return json_build_object('ok', true, 'owner', coalesce(v_name, 'Ιδιοκτήτης'));
end $$;

revoke all on function public.accountant_claim(text) from public, anon;
grant execute on function public.accountant_claim(text) to authenticated;

-- ── Η ΛΙΣΤΑ ΤΩΝ ΠΕΛΑΤΩΝ, ΜΕ ΟΣΑ ΧΡΕΙΑΖΕΤΑΙ Η ΣΤΗΛΗ «ΤΙ ΛΕΙΠΕΙ» ─────────
-- ΓΙΑΤΙ ΩΜΟΙ ΑΡΙΘΜΟΙ ΚΑΙ ΟΧΙ ΕΤΟΙΜΗ ΚΡΙΣΗ. Ο κανόνας για το τι λείπει ζει στο
-- lib/accounting/dossier.ts, μαζί με τη διατύπωση και το ποιος το φέρνει.
-- Γραμμένος και εδώ, θα απέκλινε την πρώτη φορά που άλλαζε ένας από τους δύο.
-- Η βάση μετρά, η εφαρμογή κρίνει.
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
    where ac.accountant_id = v_me and ac.active
  ) sub;

  return v_rows;
end $$;

revoke all on function public.accountant_clients_overview(integer) from public, anon;
grant execute on function public.accountant_clients_overview(integer) to authenticated;

-- ── «ΖΗΤΗΣΕ ΤΟ» ──────────────────────────────────────────────────────────
-- Η σύνδεση επαληθεύεται ΜΕΣΑ στη συνάρτηση: το ότι η οθόνη έδειξε τον
-- ιδιοκτήτη δεν αποδεικνύει τίποτα για το επόμενο αίτημα.
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
  if not exists (select 1 from accountant_clients
                  where accountant_id = v_me and owner_id = p_owner and active) then
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

-- ── ΤΟ ΟΝΟΜΑ ΤΟΥ ΛΟΓΙΣΤΗ, ΓΙΑ ΤΗΝ ΠΛΕΥΡΑ ΤΟΥ ΙΔΙΟΚΤΗΤΗ ─────────────────
-- Ο ιδιοκτήτης βλέπει τα αιτήματα μέσω RLS, αλλά το `accountant_id` είναι ένα
-- uuid. Χωρίς όνομα, η ειδοποίηση λέει «κάποιος σου ζήτησε κάτι».
create or replace function public.my_accountants()
returns json
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return '[]'::json; end if;
  return coalesce((
    select json_agg(json_build_object(
      'accountantId', ac.accountant_id,
      'name', coalesce(nullif(trim(bp.owner_name), ''), nullif(trim(bp.full_name), ''), 'Ο λογιστής σου'),
      'linkedAt', ac.linked_at
    ) order by ac.linked_at)
    from accountant_clients ac
    left join billing_profiles bp on bp.user_id = ac.accountant_id
    where ac.owner_id = v_me and ac.active
  ), '[]'::json);
end $$;

revoke all on function public.my_accountants() from public, anon;
grant execute on function public.my_accountants() to authenticated;

grant select, insert, update, delete on public.accountant_clients to authenticated;
grant select, update, delete on public.accountant_requests to authenticated;
