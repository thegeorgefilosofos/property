-- ═══════════════════════════════════════════════════════════════════════════
-- ΤΟ `auth.uid()` ΚΑΛΕΙΤΑΙ ΜΙΑ ΦΟΡΑ ΑΝΑ ΓΡΑΜΜΗ, ΟΧΙ ΜΙΑ ΦΟΡΑ ΑΝΑ ΕΡΩΤΗΜΑ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Ο ελεγκτής επιδόσεων της Supabase βρήκε 118
-- πολιτικές RLS σε 63 πίνακες γραμμένες έτσι:
--
--     using (auth.uid() = user_id)
--
-- Ο σχεδιαστής ερωτημάτων της Postgres δεν μπορεί να ανυψώσει την κλήση έξω από
-- τον βρόχο: η `auth.uid()` είναι STABLE, όχι IMMUTABLE, οπότε αποτιμάται ΓΙΑ
-- ΚΑΘΕ ΓΡΑΜΜΗ που εξετάζεται. Σε σάρωση 50.000 δαπανών γίνονται 50.000 κλήσεις
-- συνάρτησης — και η `auth.uid()` δεν είναι φθηνή: διαβάζει ρύθμιση συνεδρίας
-- και κάνει cast σε uuid.
--
-- Η ΔΙΟΡΘΩΣΗ ΕΙΝΑΙ ΕΝΑ ΥΠΟ-ΕΡΩΤΗΜΑ:
--
--     using ((select auth.uid()) = user_id)
--
-- Το `(select …)` χωρίς εξάρτηση από τη γραμμή γίνεται InitPlan: αποτιμάται
-- ΜΙΑ φορά πριν ξεκινήσει η σάρωση και το αποτέλεσμα επαναχρησιμοποιείται. Η
-- σημασιολογία είναι ΑΚΡΙΒΩΣ η ίδια — η `auth.uid()` επιστρέφει την ίδια τιμή
-- σε όλη τη διάρκεια της δήλωσης εξ ορισμού (STABLE).
--
-- ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΓΡΑΜΜΕΝΟ ΣΤΟ ΧΕΡΙ. Εκατόν δεκαοκτώ πολιτικές σημαίνει
-- εκατόν δεκαοκτώ ευκαιρίες να αντιγραφεί λάθος ένα `USING`. Η μετανάστευση
-- διαβάζει τον ΠΡΑΓΜΑΤΙΚΟ ορισμό κάθε πολιτικής από τον κατάλογο και τον
-- ξαναγράφει με `alter policy` — δηλαδή δεν μαντεύει τι λέει καμία πολιτική.
-- Είναι επίσης ιδιοδύναμη: ό,τι είναι ήδη τυλιγμένο δεν ξανατυλίγεται.
--
-- ΤΙ ΔΕΝ ΚΑΝΕΙ ΑΥΤΗ Η ΜΕΤΑΝΑΣΤΕΥΣΗ, ΚΑΙ ΓΙΑΤΙ
--
-- Ο ίδιος ελεγκτής βρήκε και 246 «πολλαπλές επιτρεπτικές πολιτικές». Η αιτία
-- τους ΔΕΝ είναι διπλές πολιτικές στην ίδια εντολή — τέτοια ομάδα υπάρχει μόνο
-- ΜΙΑ. Είναι δεκαεννέα πολιτικές γραμμένες `FOR ALL` που συνυπάρχουν με
-- πολιτική `FOR SELECT` στον ίδιο πίνακα.
--
-- Δύο από αυτές διορθώνονται εδώ, γιατί η διόρθωση είναι ΑΠΟΔΕΙΞΙΜΑ ουδέτερη:
-- η `bank_rates_admin_write` και η `energy_tariffs_service_write` λέγονται
-- «write», αλλά γράφτηκαν `FOR ALL` — και δίπλα τους υπάρχει πολιτική
-- ανάγνωσης με `using (true)`. Αφού η ανάγνωση επιτρέπεται ήδη σε όλους, το να
-- πάψει η πολιτική εγγραφής να διέπει και το SELECT δεν μπορεί να αφαιρέσει
-- πρόσβαση από κανέναν. Το όνομά τους γίνεται επιτέλους αλήθεια.
--
-- Οι υπόλοιπες δεκαεπτά ΔΕΝ αγγίζονται, και ο λόγος είναι συγκεκριμένος:
--
--     own_bills       FOR ALL    using (ιδιοκτήτης)
--     org_read_bills  FOR SELECT using (μέλος οργανισμού)
--
-- Αν στενέψει η `own_bills` σε «μόνο εγγραφή», ο ΙΔΙΟΚΤΗΤΗΣ χάνει την ανάγνωση
-- των δικών του λογαριασμών εκτός αν είναι και μέλος οργανισμού. Η σωστή
-- διόρθωση είναι να συγχωνευτούν σε μία πολιτική ανάγνωσης
-- `using (ιδιοκτήτης or μέλος)` και τρεις πολιτικές εγγραφής — αλλαγή που
-- αλλάζει τη δομή του πίνακα δικαιωμάτων σε δεκαεπτά πίνακες με προσωπικά
-- δεδομένα ενοικιαστών. Δεν γίνεται χωρίς να τρέξει πρώτα πίνακας ισοδυναμίας
-- πάνω στο πραγματικό σύνολο πολιτικών της παραγωγής. Είναι γραμμένη και
-- τεκμηριωμένη ως επόμενο βήμα, όχι κρυμμένη.
--
-- ΤΟ ΚΕΡΔΟΣ ΕΔΩ ΕΙΝΑΙ ΤΟ ΜΕΓΑΛΟ: το InitPlan αφαιρεί μια κλήση συνάρτησης ανά
-- γραμμή· η δεύτερη επιτρεπτική πολιτική προσθέτει μια αποτίμηση κατηγορήματος
-- ανά γραμμή. Το πρώτο κοστίζει τάξη μεγέθους περισσότερο.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) ΤΟ ΤΥΛΙΓΜΑ ─────────────────────────────────────────────────────────
--
-- ΣΑΡΩΝΕΤΑΙ ΚΑΙ ΤΟ `storage`, ΟΧΙ ΜΟΝΟ ΤΟ `public`. Ο ελεγκτής της Supabase
-- κοιτά μόνο το `public` και αναφέρει 118. Ο φύλακας του έργου βρήκε άλλες 15
-- στο `storage.objects` — τα αρχεία των ακινήτων, τα μισθωτήρια, οι φωτογραφίες
-- απογραφής και οι εικόνες προφίλ. Ένας φάκελος με χίλια αρχεία πληρώνει χίλιες
-- κλήσεις, και κανένας ελεγκτής δεν το λέει.
--
-- Όσες πολιτικές ανήκουν στη Supabase και όχι σε εμάς παραλείπονται ήσυχα: το
-- `alter policy` θέλει ιδιοκτησία, και δεν είναι δουλειά μας να την αποκτήσουμε.
do $$
declare
  r        record;
  v_qual   text;
  v_check  text;
  v_sql    text;
  v_n      int := 0;
  v_skip   int := 0;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.(uid|role|jwt)\(\)'
  loop
    -- Τα ήδη τυλιγμένα προστατεύονται πρώτα, ώστε να μην τυλιχτούν δεύτερη
    -- φορά: η Postgres τα τυπώνει ως «( SELECT auth.uid() AS uid)».
    v_qual  := r.qual;
    v_check := r.with_check;

    v_qual  := regexp_replace(v_qual,  '\(\s*SELECT\s+auth\.(uid|role|jwt)\(\)(\s+AS\s+\w+)?\s*\)', '~~\1~~', 'gi');
    v_qual  := regexp_replace(v_qual,  'auth\.(uid|role|jwt)\(\)',                                   '~~\1~~', 'g');
    v_qual  := regexp_replace(v_qual,  '~~(uid|role|jwt)~~',                          '(select auth.\1())', 'g');

    v_check := regexp_replace(v_check, '\(\s*SELECT\s+auth\.(uid|role|jwt)\(\)(\s+AS\s+\w+)?\s*\)', '~~\1~~', 'gi');
    v_check := regexp_replace(v_check, 'auth\.(uid|role|jwt)\(\)',                                   '~~\1~~', 'g');
    v_check := regexp_replace(v_check, '~~(uid|role|jwt)~~',                          '(select auth.\1())', 'g');

    -- Η INSERT έχει μόνο WITH CHECK· οι SELECT/DELETE μόνο USING. Το ALTER
    -- πρέπει να αναφέρει ΑΚΡΙΒΩΣ τις ρήτρες που έχει η πολιτική.
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_qual  is not null then v_sql := v_sql || format(' using (%s)',      v_qual);  end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;

    begin
      execute v_sql;
      v_n := v_n + 1;
    exception when insufficient_privilege then
      v_skip := v_skip + 1;                      -- πολιτική της Supabase, όχι δική μας
    end;
  end loop;

  raise notice 'RLS: τυλίχθηκαν % πολιτικές (παραλείφθηκαν % ξένης ιδιοκτησίας)', v_n, v_skip;
end $$;

-- ── 2) ΟΙ ΔΥΟ ΠΟΛΙΤΙΚΕΣ ΠΟΥ ΛΕΓΟΝΤΑΙ «WRITE» ΚΑΙ ΔΕΝ ΗΤΑΝ ─────────────────
-- Η προϋπόθεση ελέγχεται πριν από κάθε αλλαγή: πρέπει να υπάρχει επιτρεπτική
-- πολιτική SELECT με `using (true)` στον ίδιο πίνακα. Αν λείπει, η μετανάστευση
-- σταματά αντί να αφαιρέσει πρόσβαση σιωπηλά.
do $$
declare
  t     text;
  pol   text;
  v_q   text;
begin
  foreach t in array array['bank_rates', 'energy_tariffs'] loop
    pol := case t when 'bank_rates' then 'bank_rates_admin_write'
                  else 'energy_tariffs_service_write' end;

    if not exists (select 1 from pg_policies
                    where schemaname='public' and tablename=t and cmd='ALL'
                      and permissive='PERMISSIVE' and policyname=pol) then
      continue;                                   -- έχει ήδη διορθωθεί
    end if;

    if not exists (select 1 from pg_policies
                    where schemaname='public' and tablename=t and cmd='SELECT'
                      and permissive='PERMISSIVE' and btrim(qual) = 'true') then
      raise exception 'ο %s δεν έχει ανοιχτή πολιτική ανάγνωσης — το στένεμα της %s θα αφαιρούσε πρόσβαση', t, pol;
    end if;

    select qual into v_q from pg_policies
     where schemaname='public' and tablename=t and policyname=pol;

    execute format('drop policy %I on public.%I', pol, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', pol || '_insert', t, v_q);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', pol || '_update', t, v_q, v_q);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', pol || '_delete', t, v_q);
  end loop;
end $$;

-- ── 3) Η ΑΠΟΔΕΙΞΗ ─────────────────────────────────────────────────────────
do $$
declare v_bare int; v_all int;
begin
  select count(*) into v_bare from pg_policies
   where schemaname in ('public', 'storage')
     and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'auth\.(uid|role|jwt)\(\)'
     and (coalesce(qual,'') || coalesce(with_check,'')) !~ 'SELECT auth\.(uid|role|jwt)\(\)'
     -- Ό,τι δεν μας ανήκει δεν μετράει ως αποτυχία μας.
     and pg_has_role(current_user, (select relowner from pg_class c
                                     join pg_namespace n on n.oid = c.relnamespace
                                    where n.nspname = schemaname and c.relname = tablename), 'USAGE');
  if v_bare > 0 then
    raise exception 'έμειναν % πολιτικές με γυμνή κλήση auth.<f>() ανά γραμμή', v_bare;
  end if;

  select count(*) into v_all from pg_policies
   where schemaname='public' and cmd='ALL'
     and tablename in ('bank_rates','energy_tariffs');
  if v_all > 0 then
    raise exception 'οι πολιτικές εγγραφής των bank_rates/energy_tariffs διέπουν ακόμη το SELECT';
  end if;
end $$;
