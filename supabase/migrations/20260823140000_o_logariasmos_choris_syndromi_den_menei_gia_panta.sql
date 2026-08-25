-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΛΟΓΑΡΙΑΣΜΟΣ ΧΩΡΙΣ ΣΥΝΔΡΟΜΗ ΔΕΝ ΜΕΝΕΙ ΓΙΑ ΠΑΝΤΑ
-- ─────────────────────────────────────────────────────────────────────────
-- Η ΠΟΛΙΤΙΚΗ: όταν λήξει η δοκιμή, η κάρτα χρεώνεται εκτός αν ο χρήστης έχει
-- ακυρώσει νωρίτερα. Αν δεν υπάρχει συνδρομή, ο λογαριασμός και τα δεδομένα
-- του διαγράφονται μέσα σε τριάντα ημέρες.
--
-- Ως τώρα το δεύτερο σκέλος ΔΕΝ υπήρχε πουθενά: ούτε χρονομέτρηση, ούτε
-- προειδοποίηση, ούτε σβήσιμο. Ο λογαριασμός έμενε «σε αναμονή» επ' άπειρον,
-- κρατώντας ονόματα ενοικιαστών, ΑΦΜ, μισθωτήρια και λογαριασμούς ρεύματος
-- ανθρώπων που δεν είχαν καμία σχέση μαζί μας πια. Το άρθρο 5 παρ. 1 στ. ε΄
-- του GDPR το λέει «περιορισμός της περιόδου αποθήκευσης» και δεν είναι
-- προαιρετικό: δεδομένα κρατιούνται όσο χρειάζεται ο σκοπός τους.
--
-- ═══ ΤΡΙΑ ΦΡΕΝΑ, ΓΙΑΤΙ Η ΠΡΑΞΗ ΕΙΝΑΙ ΑΜΕΤΑΚΛΗΤΗ ═══════════════════════════
--
-- ΦΡΕΝΟ 1 — ΟΣΟ Η ΧΡΕΩΣΗ ΔΕΝ ΕΙΝΑΙ ΕΝΕΡΓΗ, ΤΟ ΡΟΛΟΪ ΔΕΝ ΞΕΚΙΝΑ ΚΑΝ.
-- Σήμερα ΚΑΝΕΝΑΣ λογαριασμός δεν έχει συνδρομή, γιατί το ταμείο δεν έχει
-- ανοίξει. Ενας σαρωτής που μετρά «χωρίς συνδρομή» χωρίς αυτό το φρένο θα
-- προγραμμάτιζε για διαγραφή ΚΑΘΕ λογαριασμό που υπάρχει: τους πενήντα
-- δοκιμαστές και τον λογαριασμό του ίδιου του ιδιοκτήτη. Το «δεν πλήρωσες»
-- όταν δεν υπάρχει τρόπος να πληρώσεις είναι δικό ΜΑΣ κενό, όχι δικό τους.
--
-- ΚΑΙ ΤΟ ΦΡΕΝΟ ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΠΤΗΣ ΠΟΥ ΓΥΡΙΖΕΙ ΚΑΠΟΙΟΣ. Η πρώτη γραφή το
-- ζητούσε από μεταβλητές περιβάλλοντος, μέσω συνάρτησης άκρης — δηλαδή
-- δεύτερο αντίγραφο της αλήθειας, σε άλλη γλώσσα, που κάποιος θα ξεχνούσε να
-- γυρίσει. Η βάση ξέρει ήδη την απάντηση και τη λέει χωρίς να τη ρωτήσει
-- κανείς: αν υπάρχει έστω ΕΝΑ `mor_subscription_id`, τότε το ταμείο έχει
-- ανοίξει και κάποιος πέρασε από μέσα. Πριν από αυτό, δεν υπάρχει τρόπος να
-- πληρώσει κανείς, άρα δεν υπάρχει και λόγος να μετράει ρολόι.
--
-- ΦΡΕΝΟ 2 — Η ΔΙΑΓΡΑΦΗ ΔΕΝ ΕΜΠΙΣΤΕΥΕΤΑΙ ΠΟΤΕ ΤΗ ΛΙΣΤΑ ΤΟΥ ΚΑΛΟΥΝΤΟΣ.
-- Ο σαρωτής τρέχει, φτιάχνει λίστα, στέλνει email και ΜΕΤΑ καλεί τη
-- διαγραφή. Ανάμεσα στα δύο μπορεί να έχουν περάσει δευτερόλεπτα ή λεπτά —
-- και μέσα σε αυτά ο άνθρωπος μπορεί να πλήρωσε. Η `purge_lapsed_account`
-- ξαναρωτά η ίδια, τη στιγμή της πράξης και τα πέντε: χρέωση ενεργή,
-- επίπεδο ακόμη μηδέν, ρολόι ξεκινημένο, προθεσμία περασμένη, όχι
-- διαχειριστής. Οποιοδήποτε από αυτά αλλάξει, η γραμμή γλιτώνει.
--
-- ΦΡΕΝΟ 3 — ΤΟ ΡΟΛΟΪ ΞΕΚΙΝΑ ΜΟΝΟ ΑΠΟ ΤΟΝ ΣΑΡΩΤΗ, ΠΟΤΕ ΑΝΑΔΡΟΜΙΚΑ.
-- Το `lapsed_at` γράφεται `now()`, όχι «πότε έληξε η δοκιμή σου». Ακόμη κι αν
-- αύριο ανοίξει το ταμείο και υπάρχουν λογαριασμοί δύο ετών χωρίς συνδρομή,
-- κανένας δεν σβήνεται πριν περάσουν τριάντα ημέρες ΑΠΟ ΤΗΝ ΠΡΩΤΗ ΣΑΡΩΣΗ.
-- Κανείς δεν χάνει δεδομένα επειδή ενεργοποιήσαμε εμείς έναν μηχανισμό.
--
-- ═══ ΚΑΙ ΜΙΑ ΔΙΑΓΡΑΦΗ, ΟΧΙ ΔΥΟ ═══════════════════════════════════════════
-- Η `delete_my_account` έχει εκατόν πενήντα γραμμές προσεκτικής δουλειάς: τα
-- προθέματα των αρχείων πριν αδειάσουν οι πίνακες, οι πίνακες που κρατούν
-- διεύθυνση αντί για χρήστη, το ίχνος όταν κάτι μείνει πίσω. Μια δεύτερη
-- υλοποίηση για τον σαρωτή θα ξεχνούσε τα μισά — και θα το ξεχνούσε σιωπηλά.
-- Το σώμα μετακομίζει ΑΥΤΟΥΣΙΟ στην `erase_account(uuid)` και η
-- `delete_my_account` γίνεται τρεις γραμμές: ποιος είμαι, σβήσε με.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ΟΙ ΗΜΕΡΕΣ ΧΑΡΙΤΟΣ, ΓΡΑΜΜΕΝΕΣ ΜΙΑ ΦΟΡΑ ───────────────────────────────
-- Οπως και οι ημέρες της δοκιμής: το db-replay τις συγκρίνει με το
-- ACCOUNT_GRACE_DAYS της εφαρμογής σε κάθε εκτέλεση, ώστε η σελίδα να μη
-- λέει «τριάντα» ενώ η βάση μετρά άλλα.
create or replace function public.account_grace_days()
returns int language sql immutable as $$ select 30 $$;

comment on function public.account_grace_days() is
  'Οι ημέρες που μένει ζωντανός ένας λογαριασμός χωρίς συνδρομή. Το db-replay επιβεβαιώνει ότι συμφωνούν με το ACCOUNT_GRACE_DAYS του lib/billing/plans.ts.';

-- ── ΤΟ ΡΟΛΟΪ ───────────────────────────────────────────────────────────
alter table public.billing_profiles
  add column if not exists lapsed_at timestamptz;

comment on column public.billing_profiles.lapsed_at is
  'Πότε ο λογαριασμός μετρήθηκε πρώτη φορά χωρίς συνδρομή, δοκιμή ή δωρεάν μήνες. Μηδενίζεται μόλις ξαναποκτήσει επίπεδο. Η προθεσμία διαγραφής είναι lapsed_at + account_grace_days().';

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΑΓΡΑΦΗ, ΜΕ ΟΡΙΣΜΑ ΑΝΤΙ ΓΙΑ auth.uid()
-- Το σώμα είναι αυτούσιο εκείνο της delete_my_account του 20260818100000. Η
-- μόνη αλλαγή είναι η προέλευση του `uid`. Δεν δίνεται σε `authenticated`:
-- ένας συνδεδεμένος χρήστης που μπορούσε να περάσει ΞΕΝΟ uuid θα έσβηνε
-- λογαριασμό τρίτου με μία κλήση από την κονσόλα του περιηγητή.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.erase_account(p_uid uuid) returns json
    language plpgsql security definer
    set search_path to 'public'
    as $_$
declare
  uid       uuid := p_uid;
  v_email   text;
  t         record;
  prefixes  text[];
  v_gone    int := 0;
  v_left    int;          -- κενό = δεν μετρήθηκε
  v_state   text;
  v_msg     text;
  v_buckets text[] := '{}';
begin
  if uid is null then
    raise exception 'Δεν δόθηκε λογαριασμός προς διαγραφή';
  end if;

  select lower(btrim(email)) into v_email from auth.users where id = uid;

  prefixes := array[uid::text || '/'];
  select prefixes || coalesce(array_agg('receipts/' || p.id::text || '/'), '{}'::text[])
    into prefixes from public.user_properties p where p.user_id::text = uid::text;
  select prefixes || coalesce(array_agg(l.token || '/'), '{}'::text[])
    into prefixes from public.portal_links l where l.user_id::text = uid::text;

  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('delete from public.%I where user_id::text = $1', t.table_name) using uid::text;
  end loop;

  if v_email is not null and v_email <> '' then
    delete from public.email_outbox where lower(btrim(to_email)) = v_email;
    delete from public.app_admins   where lower(btrim(email))    = v_email;
  end if;

  begin
    delete from storage.objects o
     where o.owner = uid
        or exists (select 1 from unnest(prefixes) pfx where starts_with(o.name, pfx));
    get diagnostics v_gone = row_count;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;

  begin
    select count(*), coalesce(array_agg(distinct o.bucket_id), '{}'::text[])
      into v_left, v_buckets
      from storage.objects o
     where o.owner = uid
        or exists (select 1 from unnest(prefixes) pfx where starts_with(o.name, pfx));
  exception when others then
    v_left := null;
  end;

  if v_state is not null or v_left is null or v_left > 0 then
    insert into public.account_deletion_incidents
      (subject_id, sqlstate, message, objects_gone, objects_left, buckets)
    values (uid, v_state, left(coalesce(v_msg, ''), 500), v_gone, v_left, v_buckets);
  end if;

  delete from auth.users where id = uid;

  return json_build_object(
    'ok',            coalesce(v_state is null and v_left = 0, false),
    'files_deleted', v_gone,
    'files_left',    v_left,
    'error_code',    v_state
  );
end;
$_$;

alter function public.erase_account(uuid) owner to postgres;
revoke all     on function public.erase_account(uuid) from public, anon, authenticated;
grant  execute on function public.erase_account(uuid) to service_role;

comment on function public.erase_account(uuid) is
  'Σβήνει έναν λογαριασμό ολόκληρο: κάθε πίνακα με user_id, τους πίνακες που κρατούν τη ΔΙΕΥΘΥΝΣΗ (email_outbox, app_admins), τα αρχεία του και τη γραμμή στο auth.users με τα cascade της. ΔΕΝ ελέγχει δικαιώματα: το κάνει ο καλών.';

-- ── ΚΑΙ Η ΑΥΤΟΔΙΑΓΡΑΦΗ ΓΙΝΕΤΑΙ ΤΡΕΙΣ ΓΡΑΜΜΕΣ ────────────────────────────
create or replace function public.delete_my_account() returns json
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Δεν υπάρχει συνδεδεμένος χρήστης';
  end if;
  return public.erase_account(uid);
end;
$$;

alter function public.delete_my_account() owner to postgres;
revoke all     on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated, service_role;

comment on function public.delete_my_account() is
  'Διαγράφει τον ΣΥΝΔΕΔΕΜΕΝΟ χρήστη, καλώντας την erase_account με το auth.uid(). Ολη η δουλειά ζει εκεί, ώστε ο αυτόματος καθαρισμός και η αυτοδιαγραφή να μη μπορούν να αποκλίνουν.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ΠΟΙΟΣ ΕΞΑΙΡΕΙΤΑΙ, ΚΑΙ ΓΙΑΤΙ ΜΟΝΟ ΑΥΤΟΣ
-- Ο διαχειριστής της εφαρμογής δεν έχει συνδρομή και δεν πρόκειται να
-- αποκτήσει: ο λογαριασμός του είναι εργαλείο, όχι πελάτης. Χωρίς αυτή τη
-- γραμμή, ο πρώτος σαρωτής μετά την ενεργοποίηση της χρέωσης θα προγραμμάτιζε
-- για διαγραφή τον λογαριασμό που τρέχει την εταιρεία.
--
-- Ο ΣΥΝΕΡΓΑΤΗΣ ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ ΓΡΑΜΜΗ ΕΔΩ. Η `user_plan_rank` του δίνει ήδη
-- επίπεδο «Επαγγελματίας», άρα δεν μετριέται ποτέ μηδέν. Το ίδιο και οι
-- δωρεάν μήνες των συστάσεων και η κράτηση υποβάθμισης. Μία πηγή για το
-- «έχει πρόσβαση;» και οι εξαιρέσεις μπαίνουν μόνο για ό,τι δεν καλύπτει.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.account_is_exempt(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_admins a
     join auth.users u on lower(btrim(u.email)) = lower(btrim(a.email))
    where u.id = p_uid
  )
$$;

alter function public.account_is_exempt(uuid) owner to postgres;
revoke all     on function public.account_is_exempt(uuid) from public, anon, authenticated;
grant  execute on function public.account_is_exempt(uuid) to service_role;

comment on function public.account_is_exempt(uuid) is
  'Λογαριασμοί που δεν χρονομετρούνται ποτέ για διαγραφή. Σήμερα μόνο οι διαχειριστές: κάθε άλλη περίπτωση (συνεργάτης, δωρεάν μήνες, κράτηση) έχει ήδη επίπεδο στην user_plan_rank.';

-- ── ΤΟ ΦΡΕΝΟ, ΩΣ ΓΕΓΟΝΟΣ ΚΑΙ ΟΧΙ ΩΣ ΡΥΘΜΙΣΗ ────────────────────────────
-- Το ίδιο σήμα που χρησιμοποιεί ήδη η `charge_upcoming_enqueue` για να ξέρει
-- ποιον να προειδοποιήσει: το αναγνωριστικό συνδρομής του εμπόρου. Οσο δεν
-- υπάρχει ούτε ένα, το ταμείο δεν έχει λειτουργήσει ποτέ.
create or replace function public.billing_is_live()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.billing_profiles
     where mor_subscription_id is not null and btrim(mor_subscription_id) <> ''
  )
$$;

alter function public.billing_is_live() owner to postgres;
revoke all     on function public.billing_is_live() from public, anon, authenticated;
grant  execute on function public.billing_is_live() to service_role;

comment on function public.billing_is_live() is
  'Εχει λειτουργήσει ποτέ το ταμείο; Αληθές μόλις υπάρξει έστω μία συνδρομή εμπόρου. Είναι το φρένο του αυτόματου καθαρισμού: πριν από αυτό, κανένας δεν μπορούσε να πληρώσει.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΣΑΡΩΤΗΣ: ΞΕΚΙΝΑ, ΜΗΔΕΝΙΖΕΙ, ΚΑΙ ΑΝΑΦΕΡΕΙ
-- Δεν σβήνει τίποτα. Κρατά μόνο το ρολόι σωστό και επιστρέφει ποιοι τρέχουν,
-- ώστε ο καλών να στείλει τις προειδοποιήσεις. Η διαγραφή είναι ξεχωριστή
-- κλήση, με δικούς της ελέγχους: ένας σαρωτής που σβήνει κιόλας θα έσβηνε
-- στο ίδιο πέρασμα που ανακαλύπτει, χωρίς κανένα ενδιάμεσο βήμα να τον
-- σταματήσει αν κάτι πήγε στραβά στη μέτρηση.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.sweep_lapsed_accounts(p_billing_live boolean default public.billing_is_live())
returns table (subject uuid, email text, display_name text, due_at timestamptz, days_left int)
language plpgsql security definer set search_path = public as $$
declare
  v_grace interval := (public.account_grace_days() || ' days')::interval;
begin
  -- ΦΡΕΝΟ 1. Και ΜΗΔΕΝΙΖΕΙ ό,τι είχε ξεκινήσει: αν η χρέωση απενεργοποιηθεί
  -- ξανά (λάθος μεταβλητή, αλλαγή παρόχου), κανένα ρολόι δεν συνεχίζει να
  -- τρέχει στο σκοτάδι για να χτυπήσει την ημέρα που θα ξαναανάψει.
  if not coalesce(p_billing_live, false) then
    update public.billing_profiles set lapsed_at = null where lapsed_at is not null;
    return;
  end if;

  -- Ξαναπέκτησε επίπεδο; Το ρολόι μηδενίζεται, χωρίς ερωτήσεις.
  update public.billing_profiles bp
     set lapsed_at = null
   where bp.lapsed_at is not null
     and (public.user_plan_rank(bp.user_id) > 0 or public.account_is_exempt(bp.user_id));

  -- Εμεινε χωρίς; Το ρολόι ξεκινά ΤΩΡΑ, ποτέ αναδρομικά (ΦΡΕΝΟ 3).
  update public.billing_profiles bp
     set lapsed_at = now()
   where bp.lapsed_at is null
     and public.user_plan_rank(bp.user_id) = 0
     and not public.account_is_exempt(bp.user_id);

  return query
    select bp.user_id,
           lower(btrim(u.email)),
           nullif(btrim(coalesce(bp.full_name, bp.owner_name, '')), ''),
           bp.lapsed_at + v_grace,
           greatest(0, ceil(extract(epoch from (bp.lapsed_at + v_grace - now())) / 86400))::int
      from public.billing_profiles bp
      join auth.users u on u.id = bp.user_id
     where bp.lapsed_at is not null
     order by bp.lapsed_at;
end;
$$;

alter function public.sweep_lapsed_accounts(boolean) owner to postgres;
revoke all     on function public.sweep_lapsed_accounts(boolean) from public, anon, authenticated;
grant  execute on function public.sweep_lapsed_accounts(boolean) to service_role;

comment on function public.sweep_lapsed_accounts(boolean) is
  'Κρατά το ρολόι των λογαριασμών χωρίς συνδρομή και επιστρέφει ποιοι τρέχουν, με την προθεσμία τους. Δεν σβήνει τίποτα. Με p_billing_live = false δεν ξεκινά κανένα ρολόι και μηδενίζει όσα τρέχουν.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Η ΔΙΑΓΡΑΦΗ: ΞΑΝΑΡΩΤΑ Η ΙΔΙΑ, ΤΗ ΣΤΙΓΜΗ ΤΗΣ ΠΡΑΞΗΣ (ΦΡΕΝΟ 2)
-- Δεν παίρνει «σβήσε αυτούς» και υπακούει. Παίρνει έναν λογαριασμό και
-- ελέγχει μόνη της και τα πέντε. Ο λόγος δεν είναι θεωρητικός: ανάμεσα στη
-- σάρωση και στην κλήση μεσολαβούν τα email, δηλαδή δευτερόλεπτα ή λεπτά —
-- αρκετά για να πληρώσει κάποιος που μόλις διάβασε την προειδοποίηση. Αυτός
-- ακριβώς ο άνθρωπος είναι ο χειρότερος που θα μπορούσαμε να σβήσουμε.
--
-- ΚΑΙ ΕΠΙΣΤΡΕΦΕΙ ΤΟΝ ΛΟΓΟ ΠΟΥ ΔΕΝ ΕΣΒΗΣΕ. Ενα σκέτο «false» θα έκανε τη
-- διαφορά ανάμεσα σε «γλίτωσε γιατί πλήρωσε» και «δεν έτρεξε γιατί ξεχάσαμε
-- τη μεταβλητή» αόρατη στα αρχεία καταγραφής.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.purge_lapsed_account(p_uid uuid, p_billing_live boolean default public.billing_is_live())
returns json language plpgsql security definer set search_path = public as $$
declare
  v_lapsed timestamptz;
  v_grace  interval := (public.account_grace_days() || ' days')::interval;
begin
  if not coalesce(p_billing_live, false) then
    return json_build_object('ok', false, 'skipped', 'billing_not_live');
  end if;
  if p_uid is null then
    return json_build_object('ok', false, 'skipped', 'no_subject');
  end if;

  select lapsed_at into v_lapsed from public.billing_profiles where user_id = p_uid;
  if v_lapsed is null                 then return json_build_object('ok', false, 'skipped', 'no_clock'); end if;
  if v_lapsed + v_grace > now()       then return json_build_object('ok', false, 'skipped', 'not_due');  end if;
  if public.user_plan_rank(p_uid) > 0 then return json_build_object('ok', false, 'skipped', 'has_plan'); end if;
  if public.account_is_exempt(p_uid)  then return json_build_object('ok', false, 'skipped', 'exempt');   end if;

  return public.erase_account(p_uid);
end;
$$;

alter function public.purge_lapsed_account(uuid, boolean) owner to postgres;
revoke all     on function public.purge_lapsed_account(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.purge_lapsed_account(uuid, boolean) to service_role;

comment on function public.purge_lapsed_account(uuid, boolean) is
  'Σβήνει έναν λογαριασμό ΜΟΝΟ αν, τη στιγμή της κλήσης, ισχύουν και τα πέντε: χρέωση ενεργή, ρολόι ξεκινημένο, προθεσμία περασμένη, επίπεδο μηδέν, όχι διαχειριστής. Αλλιώς επιστρέφει τον λόγο.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ΔΥΟ ΠΡΟΕΙΔΟΠΟΙΗΣΕΙΣ, ΚΑΙ ΓΙΑΤΙ ΔΥΟ
-- Μία μόνο, στην αρχή, χάνεται μέσα σε τριάντα ημέρες αλληλογραφίας. Μία
-- μόνο, στο τέλος, φτάνει σε κάποιον που λείπει διακοπές. Επτά ημέρες πριν
-- υπάρχει χρόνος να ενεργοποιήσει συνδρομή ή να κατεβάσει τα δεδομένα του·
-- μία ημέρα πριν είναι η τελευταία ευκαιρία και το ξέρει.
--
-- ΤΟ ΠΑΡΑΘΥΡΟ ΕΧΕΙ ΠΛΑΤΟΣ, ΤΟ ΜΗΝΥΜΑ ΟΧΙ. Το εύρος «7 ώς 9» και «1 ώς 2»
-- υπάρχει για τη χαμένη εκτέλεση του cron: μια ημέρα που δεν έτρεξε δεν
-- σημαίνει άνθρωπος που έχασε την ειδοποίηση της διαγραφής του. Το
-- `dedup_key` κρατά ένα μήνυμα ανά στάδιο, όσες φορές κι αν ξανατρέξει.
--
-- ΚΑΙ ΕΙΝΑΙ ΣΥΝΑΛΛΑΚΤΙΚΟ, ΟΧΙ ΕΜΠΟΡΙΚΟ. Δεν πουλά τίποτα: ανακοινώνει ότι σε
-- τόσες ημέρες σβήνουν τα δεδομένα σου. Ενας σύνδεσμος απεγγραφής εδώ θα
-- επέτρεπε σε κάποιον να απεγγραφεί από την ειδοποίηση της ίδιας του της
-- διαγραφής.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.lapse_warnings_enqueue()
returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare v_before int; v_after int; v_grace interval := (public.account_grace_days() || ' days')::interval;
begin
  select count(*) into v_before from public.email_outbox;

  insert into public.email_outbox (copy_id, to_email, to_name, params, category, dedup_key, scheduled_for)
  select 'account_lapse_warning',
         lower(btrim(u.email)),
         nullif(btrim(coalesce(bp.owner_name, bp.full_name, '')), ''),
         jsonb_build_object(
           'name',      nullif(btrim(coalesce(bp.owner_name, bp.full_name, '')), ''),
           'daysLeft',  d.days_left,
           'deadlineDate', to_char((bp.lapsed_at + v_grace) at time zone 'Europe/Athens', 'DD/MM/YYYY')
         ),
         'transactional',
         'account_lapse:' || u.id || ':' || d.stage,
         now()
    from public.billing_profiles bp
    join auth.users u on u.id = bp.user_id
   cross join lateral (
     select case
              when (bp.lapsed_at + v_grace)::date - current_date between 7 and 9 then 'week'
              when (bp.lapsed_at + v_grace)::date - current_date between 1 and 2 then 'last'
            end as stage,
            greatest(1, (bp.lapsed_at + v_grace)::date - current_date) as days_left
   ) d
   where bp.lapsed_at is not null
     and d.stage is not null
     and u.email is not null and btrim(u.email) <> ''
     and u.deleted_at is null
  on conflict (dedup_key) do nothing;

  select count(*) into v_after from public.email_outbox;
  return (v_after - v_before)::int;
end;
$$;

revoke all     on function public.lapse_warnings_enqueue() from public, anon, authenticated;
grant  execute on function public.lapse_warnings_enqueue() to service_role;

comment on function public.lapse_warnings_enqueue() is
  'Βάζει στην ουρά τις δύο προειδοποιήσεις διαγραφής, επτά ημέρες και μία ημέρα πριν την προθεσμία, μία φορά ανά στάδιο και ανά λογαριασμό.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ΜΙΑ ΚΛΗΣΗ ΤΗΝ ΗΜΕΡΑ, ΜΕ ΤΗ ΣΩΣΤΗ ΣΕΙΡΑ
-- Σαρώνει, προειδοποιεί και μετά σβήνει. Η σειρά δεν είναι θέμα γούστου: αν
-- η διαγραφή προηγούνταν, ένας λογαριασμός που έφτασε στην προθεσμία θα
-- έσβηνε την ίδια ημέρα που θα έπαιρνε την τελευταία του προειδοποίηση.
--
-- ΚΑΙ ΕΠΙΣΤΡΕΦΕΙ ΤΙ ΕΓΙΝΕ. Ενα χρονόμετρο που σβήνει λογαριασμούς και δεν
-- λέει πόσους είναι χρονόμετρο που κανείς δεν μπορεί να ελέγξει εκ των
-- υστέρων.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.sweep_and_purge_lapsed()
returns json language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  v_live    boolean := public.billing_is_live();
  v_running int := 0;
  v_warned  int := 0;
  v_erased  int := 0;
  v_grace   interval := (public.account_grace_days() || ' days')::interval;
  r         record;
  res       json;
begin
  select count(*) into v_running from public.sweep_lapsed_accounts(v_live);
  if not v_live then
    return json_build_object('live', false, 'running', 0, 'warned', 0, 'erased', 0);
  end if;

  v_warned := public.lapse_warnings_enqueue();

  for r in
    select bp.user_id
      from public.billing_profiles bp
     where bp.lapsed_at is not null
       and bp.lapsed_at + v_grace <= now()
  loop
    res := public.purge_lapsed_account(r.user_id, v_live);
    if res->>'skipped' is null then v_erased := v_erased + 1; end if;
  end loop;

  return json_build_object('live', true, 'running', v_running, 'warned', v_warned, 'erased', v_erased);
end;
$$;

revoke all     on function public.sweep_and_purge_lapsed() from public, anon, authenticated;
grant  execute on function public.sweep_and_purge_lapsed() to service_role;

comment on function public.sweep_and_purge_lapsed() is
  'Το ημερήσιο πέρασμα: κρατά το ρολόι, βάζει τις προειδοποιήσεις στην ουρά και σβήνει όσους πέρασαν την προθεσμία. Χωρίς ενεργή χρέωση δεν κάνει τίποτα.';

-- ── Η ΩΡΑ ΤΗΣ ΕΚΤΕΛΕΣΗΣ ─────────────────────────────────────────────────
-- 04:40 UTC: πριν από κάθε άλλο χρονόμετρο της ημέρας, ώστε ένας λογαριασμός
-- που σβήνεται σήμερα να μην προλάβει να πάρει υπενθύμιση ενοικίου δύο ώρες
-- νωρίτερα. Καθαρό SQL, όπως τα άλλα χρονόμετρα της ουράς email: το φρένο
-- ζει πια μέσα στη βάση, οπότε δεν χρειάζεται συνάρτηση άκρης για να
-- διαβάσει μεταβλητές περιβάλλοντος.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'sweep-lapsed-daily') then
    perform cron.unschedule('sweep-lapsed-daily');
  end if;
  perform cron.schedule('sweep-lapsed-daily', '40 4 * * *',
    $cron$ select public.sweep_and_purge_lapsed(); $cron$);
end $$;
