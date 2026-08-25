-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΤΡΙΤΗ ΣΥΝΑΡΤΗΣΗ ΤΗΣ ΠΥΛΗΣ ΕΜΕΙΝΕ ΧΩΡΙΣ ΤΟΝ ΕΝΟΙΚΙΑΣΤΗ ΤΗΣ
--
-- ΤΙ ΕΓΙΝΕ. Το `20260804200000_portal_link_tenant_binding` πρόσθεσε στήλη
-- `portal_links.tenant_id` και δίδαξε δύο συναρτήσεις να τη σέβονται:
-- `get_portal_data` (τι βλέπει ο ενοικιαστής) και `submit_maintenance_request`
-- (τι δηλώνει). Η τρίτη, `declare_rent_payment`, έμεινε πίσω: φιλτράρει μόνο
-- ανά ΑΚΙΝΗΤΟ.
--
-- ΤΙ ΣΗΜΑΙΝΕΙ. Σε ακίνητο που άλλαξε ενοικιαστή, ο κάτοχος ενός ενεργού
-- συνδέσμου δεμένου στον Α μπορεί να σημάνει ως «δηλωμένη» απλήρωτη δόση του
-- Β και να γράψει πεντακόσιους χαρακτήρες σημείωσης χρεωμένους σε άλλο
-- πρόσωπο. Δηλαδή αλλοίωση οικονομικού μητρώου τρίτου.
--
-- ΠΟΣΟ ΕΥΚΟΛΑ. Όχι πολύ: το `p_payment_id` είναι uuid και η πύλη επιστρέφει
-- μόνο τις δόσεις του δεμένου ενοικιαστή, άρα ο κάτοχος του συνδέσμου δεν
-- ανακαλύπτει τα ξένα αναγνωριστικά από εκεί. Είναι κενό συνέπειας και άμυνας
-- σε βάθος, όχι ανοιχτή πόρτα. Αυτό δεν το κάνει λιγότερο διορθώσιμο: οι δύο
-- αδελφές συναρτήσεις έχουν ήδη τη γραμμή και η τρίτη πρέπει να τη μοιάζει.
--
-- Ο ΕΛΕΓΧΟΣ ΕΙΝΑΙ ΑΝΕΚΤΙΚΟΣ ΣΤΟ `null`, όπως και εκεί: σύνδεσμος που δεν
-- δέθηκε ποτέ σε ενοικιαστή (ακίνητο που δεν είχε) συνεχίζει να δουλεύει.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.declare_rent_payment(p_token text, p_payment_id uuid, p_note text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_link record; v_ok int;
begin
  select * into v_link from portal_links
   where token = p_token and active = true and (expires_at is null or expires_at > now());
  if not found then return false; end if;

  update rent_payments rp
     set tenant_declared = true,
         tenant_declared_at = now(),
         tenant_note = left(coalesce(p_note,''), 500)
   where rp.id = p_payment_id
     and rp.property_id::text = v_link.property_id::text
     and rp.paid = false
     -- Η γραμμή που έλειπε.
     and (v_link.tenant_id is null or rp.tenant_id = v_link.tenant_id);

  get diagnostics v_ok = row_count;
  return v_ok > 0;
end; $$;

-- Τα δικαιώματα ξαναδηλώνονται: το `create or replace` γεννά τη συνάρτηση με
-- τα εξ ορισμού grants της Postgres, δηλαδή EXECUTE στο PUBLIC. Είναι δημόσια
-- ροή και ΠΡΕΠΕΙ να καλείται από τον `anon` — αλλά ρητά, όπως όλες οι άλλες
-- δέκα και όχι επειδή το ξέχασε κανείς.
revoke execute on function public.declare_rent_payment(text, uuid, text) from public;
grant execute on function public.declare_rent_payment(text, uuid, text) to anon, authenticated, service_role;
