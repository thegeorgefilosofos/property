-- ═══════════════════════════════════════════════════════════════════════════
-- Δεδομένα κοινότητας: από σιωπηλό opt-out σε ρητό, καταγεγραμμένο opt-in
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΙ ΙΣΧΥΕ: `share_market_data boolean DEFAULT true`. Κάθε νέος λογαριασμός
-- συνεισέφερε τα ακίνητά του στα συγκεντρωτικά στοιχεία αγοράς χωρίς να το
-- επιλέξει και, στην πράξη, χωρίς να το δει — ο διακόπτης ζει βαθιά μέσα στις
-- Ρυθμίσεις. Νομικά στεκόταν ως έννομο συμφέρον. Για προϊόν όμως που ζητά από
-- τον Έλληνα ιδιοκτήτη το ΑΦΜ του και τα μισθωτήριά του, η σιωπηλή συμμετοχή
-- είναι λάθος θέση: η εμπιστοσύνη δεν χτίζεται με προεπιλογές που ευνοούν εμάς.
--
-- ΧΕΙΡΟΤΕΡΟ ΑΠΟ ΤΟ DEFAULT: η `community_market_stats` έγραφε
-- `coalesce(bp.share_market_data, true) = true`. Το LEFT JOIN δίνει NULL για
-- κάθε χρήστη ΧΩΡΙΣ γραμμή στο billing_profiles — δηλαδή για όποιον δεν άνοιξε
-- ποτέ τις Ρυθμίσεις. Αυτοί συμμετείχαν κι ας μην υπήρχε καν εγγραφή τους.
-- Η αλλαγή του default από μόνη της ΔΕΝ θα το είχε διορθώσει.
--
-- ΤΙ ΑΛΛΑΖΕΙ
--   1. default false — καμία νέα σιωπηλή συμμετοχή.
--   2. `share_market_data_decided_at`: το GDPR (άρθρο 7§1) απαιτεί να μπορούμε
--      να ΑΠΟΔΕΙΞΟΥΜΕ τη συγκατάθεση. Ένα boolean με προεπιλογή δεν αποδεικνύει
--      τίποτα, γιατί δεν ξεχωρίζει το «είπε ναι» από το «δεν ρωτήθηκε ποτέ».
--      NULL = δεν έχει αποφασίσει· χρονοσήμανση = αποφάσισε, και πότε.
--   3. Υπάρχουσες γραμμές με true μηδενίζονται. Δεν μπορούμε να ξεχωρίσουμε
--      ποιος επέλεξε συνειδητά το true από ποιον το βρήκε έτσι — και όταν δεν
--      ξέρεις αν υπήρξε συγκατάθεση, η απάντηση είναι όχι. Οι λίγοι που όντως
--      το ήθελαν το ξαναανοίγουν με ένα άγγιγμα· το αντίστροφο δεν επανορθώνεται.
--   4. `coalesce(..., false)`: χωρίς προφίλ ⇒ εκτός.
--
-- ΑΝΤΙΚΤΥΠΟ: τα στοιχεία αγοράς θα δείχνουν λιγότερες περιοχές μέχρι να μαζευτούν
-- πέντε ΕΘΕΛΟΝΤΙΚΑ ακίνητα ανά ΤΚ (το κατώφλι δείγματος μένει ως έχει). Αυτό
-- είναι το τίμημα και το αποδεχόμαστε: καλύτερα λιγότερα δεδομένα που μας έχουν
-- δοθεί, παρά περισσότερα που τα πήραμε στη σιωπή.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Νέα προεπιλογή ─────────────────────────────────────────────────────
alter table public.billing_profiles
  alter column share_market_data set default false;

-- ── 2. Καταγραφή της απόφασης (αποδείξιμη συγκατάθεση) ────────────────────
alter table public.billing_profiles
  add column if not exists share_market_data_decided_at timestamptz;

comment on column public.billing_profiles.share_market_data is
  'Ρητή συγκατάθεση συμμετοχής στα ανώνυμα δεδομένα κοινότητας. Προεπιλογή false (opt-in).';
comment on column public.billing_profiles.share_market_data_decided_at is
  'Πότε ο χρήστης αποφάσισε ο ίδιος. NULL = δεν έχει ρωτηθεί/αποφασίσει ποτέ — άρθρο 7§1 GDPR.';

-- ── 3. Ανάκληση της τεκμαρτής συμμετοχής ──────────────────────────────────
-- Μόνο όσες γραμμές δεν έχουν καταγεγραμμένη απόφαση. Ιδεμποτεντικό: σε
-- επανεκτέλεση δεν αγγίζει κανέναν που έχει ήδη αποφασίσει.
update public.billing_profiles
   set share_market_data = false
 where share_market_data_decided_at is null
   and share_market_data is distinct from false;

-- ── 4. Η ίδια η άθροιση σέβεται πλέον την απουσία συγκατάθεσης ────────────
-- Μοναδική διαφορά από την προηγούμενη έκδοση: `true` → `false` στο coalesce.
-- Ό,τι άλλο μένει ακριβώς ίδιο, ώστε το diff να είναι αναγνώσιμο.
CREATE OR REPLACE FUNCTION "public"."community_market_stats"() RETURNS TABLE("postal_code" "text", "sample_count" integer, "median_gross_yield" numeric, "p25_yield" numeric, "p75_yield" numeric, "median_rent_per_sqm" numeric, "median_price_per_sqm" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with base as (
    select
      up.postal_code,
      up.value::numeric as value,
      coalesce(rc.actual_rent, rc.target_rent, up.target_rent)::numeric as rent,
      nullif(up.sqm, 0)::numeric as sqm
    from public.user_properties up
    left join public.billing_profiles bp on bp.user_id = up.user_id
    left join lateral (
      select actual_rent, target_rent
      from public.rent_config rc
      where rc.property_id = up.id
      limit 1
    ) rc on true
    where up.postal_code is not null and btrim(up.postal_code) <> ''
      and up.value is not null and up.value > 0
      and coalesce(rc.actual_rent, rc.target_rent, up.target_rent) > 0
      -- ΧΩΡΙΣ προφίλ ⇒ ΕΚΤΟΣ. Το `true` εδώ ήταν το πραγματικό σφάλμα: έμπαζε
      -- κάθε χρήστη που δεν είχε ανοίξει ποτέ τις Ρυθμίσεις.
      and coalesce(bp.share_market_data, false) = true
  ),
  filtered as (
    select postal_code, value, rent, sqm, (rent * 12.0 / value) * 100.0 as gy
    from base
    where (rent * 12.0 / value) * 100.0 between 1 and 25
  )
  select
    postal_code,
    count(*)::int,
    round(percentile_cont(0.5)  within group (order by gy)::numeric, 1),
    round(percentile_cont(0.25) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.75) within group (order by gy)::numeric, 1),
    round(percentile_cont(0.5)  within group (order by rent / sqm)  filter (where sqm is not null)::numeric, 2),
    round(percentile_cont(0.5)  within group (order by value / sqm) filter (where sqm is not null)::numeric, 0)
  from filtered
  group by postal_code
  having count(*) >= 5;
$$;
