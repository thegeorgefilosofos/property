-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΥΟ ΣΥΝΑΡΤΗΣΕΙΣ ΠΟΥ ΔΕΝ ΔΟΥΛΕΨΑΝ ΠΟΤΕ, ΑΠΟ ΤΗΝ ΙΔΙΑ ΑΙΤΙΑ
-- ─────────────────────────────────────────────────────────────────────────
-- Ίδιο μοτίβο με την Πύλη Ενοικιαστή: σύγκριση uuid με text μέσα σε σώμα
-- plpgsql, που η Postgres δεν ελέγχει στο `create` — μόνο όταν εκτελεστεί.
-- Κάθε deploy πράσινο, κάθε κλήση σφάλμα.
--
--   1. get_accountant_data — Ο ΦΑΚΕΛΟΣ ΤΟΥ ΛΟΓΙΣΤΗ ΔΕΝ ΑΝΟΙΞΕ ΠΟΤΕ
--      `from client_stays s where s.property_id = p.id`
--      client_stays.property_id = text · user_properties.id = uuid → 42883.
--      Ο ιδιοκτήτης στέλνει τον σύνδεσμο στον λογιστή του· η σελίδα
--      app/accountant/[token]/page.tsx κάνει `if (error || !d) setState('notfound')`,
--      οπότε ο λογιστής βλέπει «δεν βρέθηκε» και νομίζει ότι ο σύνδεσμος έληξε.
--      Ο ιδιοκτήτης τον ξαναστέλνει. Από τις 23/07 και για κανέναν χρήστη.
--
--   2. delete_my_account — Η ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ΑΠΕΤΥΧΕ ΠΑΝΤΑ
--      `execute format('delete from public.%I where user_id = $1', …) using uid`
--      με `uid uuid`. Τρεις πίνακες έχουν `user_id` ΤΥΠΟΥ TEXT:
--      airbnb_bookings, inventory_items, tenant_comm_log → 42883 στον βρόχο.
--      Η συνάρτηση σκάει, η συναλλαγή κάνει rollback και ΤΙΠΟΤΑ δεν σβήνεται
--      — ούτε καν οι πίνακες που είχαν ήδη περάσει. Ο χρήστης βλέπει την
--      υπόσχεση «Διαγράφει οριστικά τον λογαριασμό και όλα τα δεδομένα σου»
--      και μένουν στη βάση τα ΑΦΜ, τα μισθωτήρια και τα τηλέφωνα ΕΝΟΙΚΙΑΣΤΩΝ
--      — τρίτων προσώπων που δεν έχουν καν λογαριασμό εδώ.
--      Άρθρο 17 ΓΚΠΔ. Δεν είναι τεχνικό χρέος, είναι έκθεση.
--
-- ΤΟ ΙΔΙΟ ΤΟ BASELINE ΞΕΡΕΙ ΤΗ ΛΥΣΗ. Η `export_my_data` δίπλα-δίπλα γράφει
-- ήδη `where user_id::text = uid::text` με το σχόλιο «Cast both sides to text
-- so it works whether user_id is uuid or legacy text». Η ασυμμετρία ανάμεσα
-- στις δύο είναι η απόδειξη ότι πρόκειται για παράλειψη, όχι για επιλογή.
--
-- Τα σώματα αντιγράφονται ΑΥΤΟΥΣΙΑ. Οι μόνες αλλαγές είναι τα casts.
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
      -- tenants.property_id είναι uuid όπως και το p.id: εδώ δεν χρειάζεται cast.
      -- Το created_at προστέθηκε στο 20260804200000 (πριν, 42703).
      'rent', (select t.monthly_rent from tenants t where t.property_id = p.id order by t.created_at desc limit 1),
      -- expenses.property_id είναι uuid: χωρίς cast.
      'expenses', coalesce((select json_agg(json_build_object('category', e.category, 'amount', e.amount, 'date', e.date)) from expenses e where e.property_id = p.id and extract(year from e.date) = p_year), '[]'::json),
      -- ΕΔΩ ΗΤΑΝ ΤΟ 42883: client_stays.property_id είναι TEXT, το p.id uuid.
      'stays', coalesce((select json_agg(json_build_object('check_in', s.check_in, 'check_out', s.check_out, 'nights', s.nights, 'total', s.total)) from client_stays s where s.property_id = p.id::text and extract(year from coalesce(s.check_in, s.check_out)) = p_year), '[]'::json)
    ) as row
    from user_properties p where p.user_id = v_link.user_id order by p.name
  ) sub;
  return json_build_object('owner', v_owner, 'year', p_year, 'properties', coalesce(v_props, '[]'::json));
end; $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  t   record;
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;

  -- 1) Σβήσε όλες τις εγγραφές του χρήστη από κάθε πίνακα public με στήλη user_id
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    -- ΤΟ CAST ΕΙΝΑΙ ΟΛΗ Η ΔΙΟΡΘΩΣΗ. Ο βρόχος περνά ΚΑΘΕ πίνακα με στήλη
    -- user_id — και τρεις από αυτούς την έχουν text, όχι uuid. Χωρίς cast, ο
    -- πρώτος τέτοιος πίνακας ρίχνει ολόκληρη τη συνάρτηση και μαζί της κάθε
    -- διαγραφή που είχε ήδη γίνει. Ίδια γραμμή με την export_my_data.
    execute format('delete from public.%I where user_id::text = $1', t.table_name) using uid::text;
  end loop;

  -- 2) Σβήσε τα ανεβασμένα αρχεία του χρήστη από το storage
  begin
    delete from storage.objects where owner = uid;
  exception when others then
    -- αν δεν υπάρχει πρόσβαση/πίνακας, μη μπλοκάρεις τη διαγραφή
    null;
  end;

  -- 3) Σβήσε τον ίδιο τον χρήστη (auth). Ό,τι έχει FK με on delete cascade φεύγει μαζί.
  delete from auth.users where id = uid;
end;
$$;
