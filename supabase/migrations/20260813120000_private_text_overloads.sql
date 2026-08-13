-- ═══════════════════════════════════════════════════════════════════════════
--  ΟΙ ΤΡΕΙΣ ΥΠΕΡΦΟΡΤΩΣΕΙΣ ΚΕΙΜΕΝΟΥ ΕΔΕΙΧΝΑΝ ΑΚΟΜΗ ΣΤΟ `public`
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΟ ΣΦΑΛΜΑ, ΟΠΩΣ ΤΟ ΕΙΔΕ Ο ΧΡΗΣΤΗΣ. Πατούσε μια συνδρομή στους λογαριασμούς
--  και έπαιρνε «Οι ρυθμίσεις λογαριασμών δεν αποθηκεύτηκαν (κωδικός 42883)».
--  Ο 42883 της Postgres είναι `undefined_function`: κάποια συνάρτηση που
--  καλείται δεν υπάρχει.
--
--  ΤΙ ΕΦΤΑΙΓΕ. Η μετανάστευση 20260812160000 μετακίνησε εννιά βοηθούς RLS από
--  το `public` στο `private`. Τρεις από αυτούς έχουν ΔΥΟ υπερφορτώσεις: μία με
--  `uuid` και μία με `text`, για τους πίνακες που κρατούν το αναγνωριστικό
--  ακινήτου ως κείμενο. Η έκδοση `text` δεν κάνει τη δουλειά μόνη της —
--  ελέγχει τη μορφή και ΚΑΛΕΙ την `uuid`:
--
--      else public.owns_parent_property(p_property::uuid)
--            ▲
--            └── γραμμένο ρητά «public», και εκεί δεν υπάρχει πια τίποτα
--
--  Μετακινήθηκαν και οι έξι — αλλά το ΣΩΜΑ της `text` συνέχιζε να δείχνει στο
--  παλιό σχήμα. Κάθε εγγραφή σε πίνακα με `property_id text` έσκαγε: ρυθμίσεις
--  λογαριασμών, και ό,τι άλλο χρησιμοποιεί την ίδια πολιτική.
--
--  ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΣΕ ΤΙΠΟΤΑ. Ο έλεγχος απομόνωσης (scripts/db/rls-probe.sql)
--  δοκιμάζει `user_properties`, όπου το `property_id` είναι `uuid` — η
--  διαδρομή `text` δεν περνούσε από πουθενά. Ο έλεγχος επεκτείνεται μαζί με
--  αυτή τη διόρθωση, ώστε να μη γίνει ξανά σιωπηλά.
--
--  ΤΟ ΜΑΘΗΜΑ, ΓΡΑΜΜΕΝΟ ΓΙΑ ΤΟΝ ΕΠΟΜΕΝΟ. Όταν μετακινείς συνάρτηση σε άλλο
--  σχήμα, δεν αρκεί να ψάξεις ποιος την καλεί ΜΕ ΣΚΕΤΟ ΟΝΟΜΑ. Ψάξε και τους
--  ΡΗΤΑ ΣΧΗΜΑΤΙΣΜΕΝΟΥΣ καλούντες — αυτοί δεν σπάνε από το `search_path`, σπάνε
--  επειδή δείχνουν σε διεύθυνση που άδειασε.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ΚΑΙ Η ΕΚΔΟΣΗ `uuid`, ΠΟΥ ΗΤΑΝ ΤΟ ΜΕΓΑΛΥΤΕΡΟ ΚΟΜΜΑΤΙ ──────────────────
-- Δεν έσπασε μόνο η γέφυρα `text → uuid`. Η ίδια η `uuid` καλεί ΑΛΛΟΝ
-- μετακινημένο βοηθό, επίσης ρητά σχηματισμένο:
--
--     and p.user_id in (select public.org_owner_ids(auth.uid()))
--
-- Δηλαδή έσπασε η εγγραφή σε ΚΑΘΕ πίνακα με πολιτική γονικού ακινήτου, όχι
-- μόνο σε όσους κρατούν το αναγνωριστικό ως κείμενο.
create or replace function private.owns_parent_property(p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select p_property is null or exists (
    select 1
      from user_properties p
     where p.id = p_property
       and p.user_id in (select private.org_owner_ids(auth.uid()))
  )
$$;

create or replace function private.owns_parent_property(p_property text)
returns boolean
language sql
stable
set search_path = 'public'
as $$
  select case
    when p_property is null or p_property !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
    else private.owns_parent_property(p_property::uuid)
  end
$$;

create or replace function private.member_sees_property(p_property text)
returns boolean
language sql
stable
set search_path = 'public'
as $$
  select case
    when p_property is null or p_property !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
    else private.member_sees_property(p_property::uuid)
  end
$$;

create or replace function private.member_sees_financials(p_property text)
returns boolean
language sql
stable
set search_path = 'public'
as $$
  select case
    when p_property is null or p_property !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
    else private.member_sees_financials(p_property::uuid)
  end
$$;

-- Το `create or replace` δεν ξαναδίνει δικαιώματα σε νέα συνάρτηση, αλλά εδώ
-- αντικαθιστά υπάρχουσα — τα κρατά. Γράφεται ρητά ώστε η μετανάστευση να
-- στέκει και σε βάση όπου οι τρεις δεν υπήρχαν καθόλου.
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ── ΚΑΝΕΝΑ ΑΛΛΟ ΣΩΜΑ ΔΕΝ ΔΕΙΧΝΕΙ ΣΕ ΑΔΕΙΑ ΔΙΕΥΘΥΝΣΗ ──────────────────────
-- Ο ίδιος έλεγχος που θα έπρεπε να είχε τρέξει πριν τη μετακίνηση. Σκάει τη
-- μετανάστευση αν έμεινε έστω μία αναφορά `public.<μετακινημένη>` σε σώμα
-- συνάρτησης — δηλαδή αν η επόμενη μετακίνηση ξεχάσει το ίδιο πράγμα.
do $$
declare bad text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ')
    into bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosrc ~* ('public\.(owns_parent_property|owns_portal_token|is_active_portal_token'
                   || '|is_active_org_member|is_org_owner|member_sees_property'
                   || '|member_sees_financials|org_owner_ids|org_editor_owner_ids)\s*\(');
  if bad is not null then
    raise exception 'Σώματα συναρτήσεων καλούν ακόμη public.<βοηθό RLS>: %', bad;
  end if;
end $$;
