-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΔΥΟ ΔΗΜΟΣΙΕΣ ΥΠΟΒΟΛΕΣ ΔΕΝ ΕΙΧΑΝ ΚΑΝΕΝΑ ΤΑΒΑΝΙ
--
-- ΤΙ ΥΠΗΡΧΕ. Το `portal_pin_attempts` (20260724090000) περιορίζει τις
-- προσπάθειες ΚΩΔΙΚΟΥ σε πέντε ανά δεκαπέντε λεπτά. Ό,τι έρχεται ΜΕΤΑ τον
-- κωδικό όμως — η αναφορά βλάβης και η φόρμα προ-άφιξης — δεν μετρούσε
-- τίποτα: κάθε κάτοχος ενεργού συνδέσμου μπορούσε να γράψει απεριόριστες
-- γραμμές. Ο σύνδεσμος πύλης ζει τριακόσιες εξήντα πέντε ημέρες και ο
-- σύνδεσμος προ-άφιξης ενενήντα· ένας πρώην ενοικιαστής τον κρατά.
--
-- ΤΙ ΚΟΣΤΙΖΕΙ ΑΥΤΟ. Ο ιδιοκτήτης παίρνει ειδοποίηση σε κάθε αναφορά βλάβης.
-- Χωρίς ταβάνι, ο πίνακας φουσκώνει και το εισερχόμενό του γεμίζει — και το
-- μόνο που χρειάζεται είναι ένας σύνδεσμος που κάποτε του έδωσε ο ίδιος.
--
-- ΚΑΙ ΟΙ ΦΩΤΟΓΡΑΦΙΕΣ. Το `p_photos` περνούσε αυτούσιο από τον ανώνυμο
-- καλούντα στη στήλη, χωρίς όριο πλήθους. Πλέον κόβεται στις πέντε: όσες
-- ανεβάζει και η ίδια η φόρμα.
--
-- ΓΙΑΤΙ ΤΟ ΙΔΙΟ ΜΟΤΙΒΟ ΚΑΙ ΟΧΙ ΔΕΥΤΕΡΟ. Ο πίνακας προσπαθειών υπάρχει ήδη,
-- έχει ευρετήριο ανά token και χρόνο, και είναι κλειδωμένος από όλους εκτός
-- των συναρτήσεων. Ένας δεύτερος πίνακας με την ίδια δουλειά θα ήταν δεύτερη
-- πολιτική διατήρησης, δεύτερο ευρετήριο και δεύτερο σημείο να ξεχαστεί.
-- Ξεχωρίζουμε με πρόθεμα στο `token`, ώστε τα παράθυρα να μην αναμειγνύονται.
-- ═══════════════════════════════════════════════════════════════════════════

-- Πόσες υποβολές αυτού του είδους έγιναν από αυτόν τον σύνδεσμο μέσα στο
-- παράθυρο, και καταγραφή της τωρινής. Επιστρέφει true όταν επιτρέπεται.
create or replace function public.allow_public_submit(
  p_kind text, p_token text, p_limit int, p_window interval
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_key text; v_count int;
begin
  v_key := p_kind || ':' || p_token;
  select count(*) into v_count
    from portal_pin_attempts
   where token = v_key and attempted_at > now() - p_window;
  if v_count >= p_limit then return false; end if;
  insert into portal_pin_attempts(token, success) values (v_key, true);
  return true;
end; $$;

-- Δεν καλείται ποτέ απευθείας: μόνο από τις δύο συναρτήσεις υποβολής, που
-- τρέχουν ήδη ως SECURITY DEFINER.
revoke execute on function public.allow_public_submit(text, text, int, interval) from public, anon, authenticated;
grant  execute on function public.allow_public_submit(text, text, int, interval) to service_role;

-- ── Αναφορά βλάβης: πέντε ανά ώρα ─────────────────────────────────────────
-- Το σώμα μένει ό,τι ήταν στο 20260804200000 (δέσιμο στον ενοικιαστή του
-- συνδέσμου), με δύο προσθήκες: το ταβάνι και το όριο φωτογραφιών.
create or replace function public.submit_maintenance_request(p_token text, p_title text, p_description text, p_contact text, p_photos jsonb default '[]'::jsonb)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_link record; v_ten_id uuid; v_photos jsonb;
begin
  select * into v_link from portal_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return false; end if;
  if coalesce(trim(p_title), '') = '' then return false; end if;
  if not allow_public_submit('maint', p_token, 5, interval '1 hour') then return false; end if;

  if v_link.tenant_id is not null then
    v_ten_id := v_link.tenant_id;
  else
    select id into v_ten_id from tenants where property_id::text = v_link.property_id::text order by created_at desc limit 1;
  end if;

  -- Πέντε φωτογραφίες, όσες ανεβάζει και η φόρμα.
  v_photos := coalesce(p_photos, '[]'::jsonb);
  if jsonb_typeof(v_photos) <> 'array' then v_photos := '[]'::jsonb; end if;
  if jsonb_array_length(v_photos) > 5 then
    select jsonb_agg(value) into v_photos
      from (select value from jsonb_array_elements(v_photos) limit 5) t;
  end if;

  insert into maintenance_requests(property_id, user_id, token, tenant_id, title, description, contact, photos)
    values (v_link.property_id, v_link.user_id, p_token, v_ten_id, left(p_title, 200), left(p_description, 2000), left(p_contact, 200), v_photos);
  return true;
end; $$;

-- ── Προ-άφιξη: τρεις ανά ώρα ──────────────────────────────────────────────
-- Πιο σφιχτό, γιατί μία κράτηση συμπληρώνει τη φόρμα μία φορά· τρεις αφήνουν
-- χώρο για διόρθωση χωρίς να κλειδώνουν κανέναν έξω.
create or replace function public.submit_checkin(p_token text, p_full_name text, p_id_number text, p_nationality text, p_birth_date text, p_phone text, p_email text, p_arrival_date text, p_guests integer, p_accepts boolean, p_privacy_consent boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_link record;
begin
  select * into v_link from checkin_links where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return false; end if;
  if coalesce(trim(p_full_name), '') = '' then return false; end if;
  if coalesce(p_privacy_consent, false) = false then return false; end if;
  if not allow_public_submit('checkin', p_token, 3, interval '1 hour') then return false; end if;

  insert into guest_checkins(token, user_id, client_id, property_id, full_name, id_number, nationality, birth_date, phone, email, arrival_date, guests_count, accepts_rules, privacy_consent, privacy_consent_at)
    values (p_token, v_link.user_id, v_link.client_id, v_link.property_id, left(p_full_name,160), left(p_id_number,60),
            left(p_nationality,60), nullif(p_birth_date,'')::date, left(p_phone,40), left(p_email,160),
            nullif(p_arrival_date,'')::date, p_guests, coalesce(p_accepts,false), true, now());
  return true;
end; $$;

-- Και οι δύο είναι δημόσιες ροές: ρητά δικαιώματα, όπως οι υπόλοιπες δέκα.
revoke execute on function public.submit_maintenance_request(text, text, text, text, jsonb) from public;
grant  execute on function public.submit_maintenance_request(text, text, text, text, jsonb) to anon, authenticated, service_role;
revoke execute on function public.submit_checkin(text, text, text, text, text, text, text, text, integer, boolean, boolean) from public;
grant  execute on function public.submit_checkin(text, text, text, text, text, text, text, text, integer, boolean, boolean) to anon, authenticated, service_role;
