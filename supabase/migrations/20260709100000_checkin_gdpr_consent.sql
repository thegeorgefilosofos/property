-- ─────────────────────────────────────────────────────────────────────────
-- GDPR consent στη δημόσια φόρμα pre-check-in.
-- Ο επισκέπτης δίνει ευαίσθητα προσωπικά δεδομένα (αριθμός ταυτότητας/διαβατηρίου,
-- εθνικότητα, ημ. γέννησης). Απαιτείται ΡΗΤΗ συγκατάθεση επεξεργασίας (άρθρο 6§1α
-- GDPR), αποθηκευμένη με χρονοσήμανση ως απόδειξη. Χωρίς συγκατάθεση, καμία
-- αποθήκευση — επιβάλλεται και server-side στο submit_checkin.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.guest_checkins add column if not exists privacy_consent boolean default false;
alter table public.guest_checkins add column if not exists privacy_consent_at timestamptz;

-- Νέα υπογραφή (προστέθηκε p_privacy_consent) — ρίξε την παλιά για να μη μείνει overload.
drop function if exists public.submit_checkin(text,text,text,text,text,text,text,text,integer,boolean);

create or replace function public.submit_checkin(
  p_token text, p_full_name text, p_id_number text, p_nationality text,
  p_birth_date text, p_phone text, p_email text, p_arrival_date text,
  p_guests integer, p_accepts boolean, p_privacy_consent boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_link record;
begin
  select * into v_link from checkin_links where token = p_token and active = true;
  if not found then return false; end if;
  if coalesce(trim(p_full_name), '') = '' then return false; end if;
  -- Χωρίς ρητή συγκατάθεση GDPR δεν αποθηκεύουμε προσωπικά δεδομένα.
  if coalesce(p_privacy_consent, false) = false then return false; end if;
  insert into guest_checkins(token, user_id, client_id, property_id, full_name, id_number, nationality, birth_date, phone, email, arrival_date, guests_count, accepts_rules, privacy_consent, privacy_consent_at)
    values (p_token, v_link.user_id, v_link.client_id, v_link.property_id, left(p_full_name,160), left(p_id_number,60),
            left(p_nationality,60), nullif(p_birth_date,'')::date, left(p_phone,40), left(p_email,160),
            nullif(p_arrival_date,'')::date, p_guests, coalesce(p_accepts,false), true, now());
  return true;
end; $$;
grant execute on function public.submit_checkin(text,text,text,text,text,text,text,text,integer,boolean,boolean) to anon, authenticated;
