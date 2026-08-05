-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΣΥΝΔΕΣΜΟΣ ΤΗΣ ΠΥΛΗΣ ΔΕΝΕΤΑΙ ΣΤΟΝ ΕΝΟΙΚΙΑΣΤΗ, ΟΧΙ ΣΤΟ ΑΚΙΝΗΤΟ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ
-- Το `portal_links` κρατά μόνο `property_id`. Η `get_portal_data` έλυνε τον
-- ενοικιαστή ως «ο πιο πρόσφατος του ακινήτου»:
--
--     select ... into v_ten from tenants
--      where property_id = v_link.property_id
--      order by created_at desc limit 1;
--
-- Δηλαδή ο σύνδεσμος δεν έδειχνε ποτέ σε συγκεκριμένο άνθρωπο — έδειχνε σε μια
-- ΘΕΣΗ. Όταν έφευγε ο ενοικιαστής και έμπαινε καινούργιος, το ΠΑΛΙΟ token
-- συνέχιζε να δουλεύει και άρχιζε να δείχνει τα στοιχεία του ΝΕΟΥ: ονοματεπώνυμο,
-- μίσθωμα, εγγύηση, IBAN είσπραξης και τα απλήρωτα μισθώματά του.
--
-- Ο πρώην ενοικιαστής δεν χρειαζόταν να κάνει τίποτα κακόβουλο: αρκούσε να
-- ξανανοίξει έναν σύνδεσμο που είχε ήδη στο κινητό του. Ο ιδιοκτήτης δεν είχε
-- τρόπο ούτε να το δει ούτε να το σταματήσει — δεν υπήρχε ανάκληση ανά ενοικιαστή.
--
-- Η ΔΙΟΡΘΩΣΗ
-- Ο σύνδεσμος αποκτά `tenant_id`. Η συνάρτηση, όταν αυτό υπάρχει, φέρνει ΕΚΕΙΝΟΝ
-- τον ενοικιαστή και κανέναν άλλο.
--
-- ΣΥΜΒΑΤΟΤΗΤΑ: οι υπάρχοντες σύνδεσμοι γεμίζουν με τον τρέχοντα ενοικιαστή του
-- ακινήτου — ό,τι ακριβώς έδειχναν μέχρι σήμερα — οπότε κανείς δεν χάνει
-- πρόσβαση τη στιγμή του deploy. Από εκεί και πέρα μένουν κλειδωμένοι εκεί.
-- Σύνδεσμος που μένει χωρίς `tenant_id` (ακίνητο που δεν είχε ποτέ ενοικιαστή)
-- κρατά την παλιά συμπεριφορά: δεν υπάρχει κάτι να διαρρεύσει.
--
-- ΤΟ ΣΩΜΑ ΤΗΣ ΣΥΝΑΡΤΗΣΗΣ ΑΝΤΙΓΡΑΦΕΤΑΙ ΑΥΤΟΥΣΙΟ από το
-- 20260724090000_portal_pin_ratelimit.sql. Η postgres δεν επιτρέπει μερική
-- τροποποίηση σώματος, οπότε ξαναγράφεται ολόκληρο· οι ΜΟΝΕΣ διαφορές είναι το
-- select του v_ten και το cast που περιγράφεται αμέσως παρακάτω. Κάθε άλλη
-- λεπτομέρεια —το `return null`, το `rate_limited`, η στήλη `success`, τα
-- κλειδιά `rent_iban` και `total_due`— μένει ίδια, γιατί τα διαβάζει η σελίδα
-- της πύλης.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ΚΑΙ ΚΑΤΙ ΠΟΥ ΒΡΕΘΗΚΕ ΓΡΑΦΟΝΤΑΣ ΤΟ ΠΑΡΑΠΑΝΩ: Η ΠΥΛΗ ΔΕΝ ΔΟΥΛΕΥΕ ΚΑΘΟΛΟΥ.
--
-- Το `tenants.property_id` είναι **uuid** και το `portal_links.property_id`
-- είναι **text**. Δεν υπάρχει τελεστής `uuid = text` στην Postgres, οπότε η
-- γραμμή που έλυνε τον ενοικιαστή —σε ΚΑΘΕ έκδοση της συνάρτησης, από το
-- baseline μέχρι σήμερα— πετούσε 42883 πριν επιστρέψει οτιδήποτε:
--
--     from tenants where property_id = v_link.property_id
--
-- Δηλαδή ο σύνδεσμος της Πύλης δεν διέρρεε απλώς τον λάθος ενοικιαστή: δεν
-- άνοιγε ποτέ. Το ίδιο και η φόρμα βλαβών (δες το τέλος του αρχείου).
--
-- Το λάθος δεν φάνηκε νωρίτερα επειδή η Postgres ΔΕΝ ελέγχει το σώμα μιας
-- plpgsql συνάρτησης στο `create` — μόνο όταν εκτελεστεί. Τα migrations
-- περνούσαν πράσινα για μήνες πάνω από σπασμένο κώδικα. Ήρθε στο φως μόνο
-- επειδή το backfill εδώ κάνει την ίδια σύγκριση σε ΣΚΕΤΗ SQL, που ελέγχεται
-- αμέσως, και έριξε το deploy του staging.
--
-- Και οι δύο συναρτήσεις παίρνουν ρητό `::text`, όπως έκανε ήδη η ίδια
-- συνάρτηση για το user_properties (`id::text = v_link.property_id::text`).
-- Το cast είναι ασφαλές όποιος κι αν είναι ο τύπος της στήλης.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.portal_links
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

comment on column public.portal_links.tenant_id is
  'Ο ενοικιαστής στον οποίο ανήκει ο σύνδεσμος. Χωρίς αυτό, ο σύνδεσμος ακολουθούσε το ΑΚΙΝΗΤΟ και ο πρώην ενοικιαστής έβλεπε τα στοιχεία του επόμενου.';

create index if not exists portal_links_tenant_idx on public.portal_links (tenant_id);

-- ΣΥΣΧΕΤΙΣΜΕΝΟ ΥΠΟΕΡΩΤΗΜΑ, ΟΧΙ `FROM LATERAL` — ΚΑΙ ΜΕ ΡΗΤΟ CAST.
--
-- Δύο σφάλματα διαδοχικά, και τα δύο εδώ:
--
--  1. 42P10 «invalid reference to FROM-clause entry for table "pl"». Η πρώτη
--     γραφή ήταν `update … from lateral (… where property_id = pl.property_id)`.
--     Ο πίνακας-στόχος ενός UPDATE ΔΕΝ βρίσκεται στο FROM, οπότε το lateral δεν
--     τον βλέπει ποτέ. Το υποερώτημα μέσα στο SET τον βλέπει κανονικά.
--
--  2. 42883 «operator does not exist: uuid = text». Οι δύο στήλες ΔΕΝ έχουν τον
--     ίδιο τύπο: `tenants.property_id` είναι uuid, `portal_links.property_id`
--     είναι text (δες το baseline). Η υπάρχουσα get_portal_data γράφει
--     `where property_id = v_link.property_id` χωρίς cast και δουλεύει, επειδή
--     το v_link είναι `record` και η PL/pgSQL περνά το πεδίο ως παράμετρο
--     αγνώστου τύπου που η Postgres επιλύει σε uuid. Σε ΣΚΕΤΗ SQL και οι δύο
--     τύποι είναι γνωστοί, δεν υπάρχει τελεστής uuid = text, και σκάει.
--     Γι' αυτό και η ίδια συνάρτηση γράφει `id::text = v_link.property_id::text`
--     για το user_properties.
--
-- Ακίνητο χωρίς κανέναν ενοικιαστή αφήνει `null` — και το `where tenant_id is
-- null` κάνει το migration επαναλήψιμο χωρίς να ξαναγράφει ό,τι έχει δεθεί.
update public.portal_links pl
   set tenant_id = (
         select t.id from public.tenants t
          where t.property_id::text = pl.property_id
          order by t.created_at desc
          limit 1
       )
 where pl.tenant_id is null;

create or replace function public.get_portal_data(p_token text, p_pin text default null)
returns json language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare v_link record; v_prop record; v_ten record; v_due json; v_total numeric; v_fails int;
begin
  select * into v_link from portal_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return null; end if;

  if v_link.pin_hash is not null then
    -- keep the ledger bounded: drop this token's stale rows first
    delete from portal_pin_attempts where token = p_token and attempted_at < now() - interval '1 day';

    -- rolling-window throttle: 5 failures / 15 min → locked (no further attempts recorded)
    select count(*) into v_fails
      from portal_pin_attempts
      where token = p_token and success = false and attempted_at > now() - interval '15 minutes';
    if v_fails >= 5 then
      return json_build_object('locked', true, 'rate_limited', true);
    end if;

    if p_pin is null or crypt(p_pin, v_link.pin_hash) <> v_link.pin_hash then
      -- record only real PIN submissions (a null pin is just the lock-screen probe)
      if p_pin is not null then
        insert into portal_pin_attempts(token, success) values (p_token, false);
      end if;
      return json_build_object('locked', true);
    end if;

    -- correct PIN: clear this token's failures
    delete from portal_pin_attempts where token = p_token;
  end if;

  select name, address, prop_type into v_prop from user_properties where id::text = v_link.property_id::text;

  -- ΕΔΩ ΚΑΙ ΜΟΝΟ ΕΔΩ ΕΙΝΑΙ Η ΑΛΛΑΓΗ.
  -- Με δεμένο ενοικιαστή φέρνουμε ΕΚΕΙΝΟΝ. Το παλιό «ο πιο πρόσφατος του
  -- ακινήτου» έκανε τον σύνδεσμο να δείχνει πάντα στον τρέχοντα κάτοικο, οπότε
  -- ο προηγούμενος έβλεπε τα στοιχεία του επόμενου.
  if v_link.tenant_id is not null then
    select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
      from tenants where id = v_link.tenant_id;
  else
    -- Το `::text` ΔΕΝ είναι καλλωπισμός: χωρίς αυτό η γραμμή έσκαγε (δες τη
    -- σημείωση «Η ΠΥΛΗ ΔΕΝ ΔΟΥΛΕΥΕ ΚΑΘΟΛΟΥ» στην κορυφή του αρχείου).
    select id, monthly_rent, lease_start, lease_end, deposit_amount, full_name, rent_iban into v_ten
      from tenants where property_id::text = v_link.property_id order by created_at desc limit 1;
  end if;

  select coalesce(json_agg(json_build_object(
           'id', rp.id, 'year', rp.period_year, 'month', rp.period_month,
           'amount', rp.amount, 'due_date', rp.due_date, 'declared', rp.tenant_declared
         ) order by rp.period_year, rp.period_month), '[]'::json),
         coalesce(sum(rp.amount), 0)
    into v_due, v_total
    from rent_payments rp
    where rp.tenant_id = v_ten.id and rp.paid = false;
  return json_build_object(
    'property', json_build_object('name', v_prop.name, 'address', v_prop.address, 'type', v_prop.prop_type),
    'tenant',   json_build_object('name', v_ten.full_name, 'rent', v_ten.monthly_rent,
      'lease_start', v_ten.lease_start, 'lease_end', v_ten.lease_end, 'deposit', v_ten.deposit_amount,
      'rent_iban', v_ten.rent_iban),
    'payment_link', v_link.payment_link,
    'due',      v_due,
    'total_due', v_total
  );
end; $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ ΙΔΙΟ ΣΦΑΛΜΑ ΤΥΠΩΝ ΚΡΑΤΟΥΣΕ ΚΛΕΙΣΤΗ ΚΑΙ ΤΗ ΦΟΡΜΑ ΒΛΑΒΩΝ
-- ─────────────────────────────────────────────────────────────────────────
-- Η `submit_maintenance_request` —το κουμπί «Στείλε αίτημα» του ενοικιαστή—
-- έχει την ίδια γραμμή: `from tenants where property_id = v_link.property_id`.
-- Άρα σκάει με τον ίδιο τρόπο, ΠΡΙΝ φτάσει στο insert: κανένα αίτημα βλάβης δεν
-- καταχωρήθηκε ποτέ. Ο ιδιοκτήτης έβλεπε «Κανένα αίτημα ακόμη» και το θεωρούσε
-- καλό νέο.
--
-- Δοκιμάστηκε τοπικά με τους τύπους του baseline: πριν το cast η κλήση σκάει,
-- μετά επιστρέφει true και γράφει τη γραμμή δεμένη στον σωστό ενοικιαστή.
--
-- Το σώμα αντιγράφεται ΑΥΤΟΥΣΙΟ από το 20260723100000_security_pentest_fixes.sql
-- με δύο αλλαγές: το `::text` στη σύγκριση, και το ότι τιμάει το `tenant_id`
-- του συνδέσμου όταν υπάρχει — αλλιώς το αίτημα του παλιού ενοικιαστή θα
-- χρεωνόταν στον νέο.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.submit_maintenance_request(p_token text, p_title text, p_description text, p_contact text, p_photos jsonb default '[]'::jsonb)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_link record; v_ten_id uuid;
begin
  select * into v_link from portal_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  if v_link.tenant_id is not null then
    v_ten_id := v_link.tenant_id;
  else
    select id into v_ten_id from tenants where property_id::text = v_link.property_id order by created_at desc limit 1;
  end if;
  insert into maintenance_requests(property_id, user_id, token, tenant_id, title, description, contact, photos)
    values (v_link.property_id, v_link.user_id, p_token, v_ten_id, left(p_title, 200), left(p_description, 2000), left(p_contact, 200),
            coalesce(p_photos, '[]'::jsonb));
  return true;
end; $$;
