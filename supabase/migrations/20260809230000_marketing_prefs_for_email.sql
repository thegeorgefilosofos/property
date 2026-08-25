-- ═══════════════════════════════════════════════════════════════════════════
-- ΟΙ ΠΡΟΤΙΜΗΣΕΙΣ ΑΠΕΓΓΡΑΦΗΣ ΑΠΟ ΤΗ ΔΙΕΥΘΥΝΣΗ ΤΟΥ ΠΑΡΑΛΗΠΤΗ
-- ─────────────────────────────────────────────────────────────────────────
-- Η μηχανή των lifecycle emails δέχεται ΔΙΕΥΘΥΝΣΗ, όχι αναγνωριστικό χρήστη:
-- την καλούν trigger της βάσης, cron και η εφαρμογή και καμία από τις τρεις
-- δεν κουβαλά πάντα το `user_id`. Χωρίς αυτή τη συνάρτηση, η απεγγραφή δεν
-- μπορούσε να ελεγχθεί καθόλου — και δεν ελεγχόταν.
--
-- ΤΙ ΚΑΝΕΙ: από τη διεύθυνση βρίσκει τον χρήστη, εξασφαλίζει ότι υπάρχει γραμμή
-- προτιμήσεων (προεπιλογή: εγγεγραμμένος, όπως και στο newsletter) και γυρίζει
-- την προτίμηση μαζί με το διακριτικό απεγγραφής.
--
-- ΓΙΑΤΙ SECURITY DEFINER ΚΑΙ ΠΟΙΟΣ ΤΗΝ ΚΑΛΕΙ: διαβάζει `auth.users`, που καμία
-- πολιτική δεν εκθέτει σε πελάτη. Εκτελείται ΜΟΝΟ από τον ρόλο υπηρεσίας: το
-- δικαίωμα εκτέλεσης αφαιρείται ρητά από `anon` και `authenticated`, αλλιώς θα
-- ήταν μηχανή απαρίθμησης λογαριασμών («υπάρχει αυτό το email;»).
--
-- Το `search_path` καρφώνεται: χωρίς αυτό, μια συνάρτηση SECURITY DEFINER
-- μπορεί να παρασυρθεί σε ομώνυμο αντικείμενο άλλου σχήματος.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.marketing_prefs_for_email(p_email text)
returns table (product_news boolean, market_news boolean, unsubscribe_token uuid)
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid uuid;
begin
  select id into v_uid
    from auth.users
   where lower(email) = lower(trim(p_email))
     and email_confirmed_at is not null
   limit 1;

  if v_uid is null then
    return;                       -- κανένας χρήστης: ο καλών αποφασίζει
  end if;

  -- Προεπιλογή «εγγεγραμμένος», ίδια με του newsletter: ο χρήστης που δεν
  -- εξέφρασε ποτέ προτίμηση δεν θεωρείται ούτε εγγεγραμμένος ούτε απεγγεγραμμένος
  -- από το πουθενά — η γραμμή δημιουργείται ρητά, με χρόνο.
  insert into public.email_marketing_prefs (user_id)
       values (v_uid)
  on conflict (user_id) do nothing;

  return query
    select p.product_news, p.market_news, p.unsubscribe_token
      from public.email_marketing_prefs p
     where p.user_id = v_uid;
end;
$$;

alter function public.marketing_prefs_for_email(text) owner to postgres;

-- Ο πελάτης ΔΕΝ την καλεί ποτέ: θα ήταν απαρίθμηση λογαριασμών.
revoke all on function public.marketing_prefs_for_email(text) from public, anon, authenticated;
grant execute on function public.marketing_prefs_for_email(text) to service_role;

comment on function public.marketing_prefs_for_email(text) is
  'Προτιμήσεις εμπορικών email από διεύθυνση. Μόνο service_role: για τον πελάτη θα ήταν απαρίθμηση λογαριασμών.';
