-- ═══════════════════════════════════════════════════════════════════════════
-- Ο ΔΙΑΚΟΠΤΗΣ ΤΩΝ ΟΙΚΟΝΟΜΙΚΩΝ ΔΕΝ ΕΚΛΕΙΝΕ ΤΙΣ ΔΙΑΜΟΝΕΣ
-- ─────────────────────────────────────────────────────────────────────────
-- ΤΟ ΣΦΑΛΜΑ. Η οθόνη της ομάδας υπόσχεται «Οικονομικά στοιχεία: Κρυφά». Ο
-- κατάλογος των πυλωρημένων πινάκων έγινε εννέα με το 20260815120000, αλλά ο
-- `client_stays` έλειπε — και εκεί ζουν `nightly_rate`, `total`, `damage_cost`
-- και `gross_guest_paid`. Το μέλος τα διάβαζε μέσω της `org_read_client_stays`
-- παρότι ο ιδιοκτήτης του είχε κλείσει ρητά τα οικονομικά.
--
-- Δηλαδή ο διακόπτης έκρυβε το μίσθωμα της μακροχρόνιας και άφηνε ορθάνοιχτο
-- το έσοδο της βραχυχρόνιας. Ο ίδιος ο αυτοέλεγχος του 120000 δεν το έπιασε:
-- επικύρωνε ότι ο κατάλογος εφαρμόστηκε, όχι ότι ο κατάλογος είναι πλήρης.
--
-- ΤΩΡΑ Ο ΚΑΤΑΛΟΓΟΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΑ ΔΕΔΟΜΕΝΑ. Ο έλεγχος στο τέλος ρωτά την ίδια
-- τη βάση ποιοι πίνακες έχουν στήλη χρηματικού ποσού ΚΑΙ `property_id` και
-- σκάει αν κάποιος από αυτούς δεν είναι πυλωρημένος. Ενας κατάλογος γραμμένος
-- με το χέρι ξεχνά· ένα ερώτημα δεν ξεχνά.
-- ═══════════════════════════════════════════════════════════════════════════

-- ΔΥΟ ΠΙΝΑΚΕΣ, ΟΧΙ ΕΝΑΣ. Ο δεύτερος τον βρήκε ο έλεγχος παρακάτω: ο
-- `airbnb_bookings` κρατά `gross_amount`, `net_amount`, `airbnb_fee` και
-- `cleaning_fee` — έσοδο βραχυχρόνιας με άλλο όνομα.
do $$
declare t text;
begin
  foreach t in array array['client_stays', 'airbnb_bookings'] loop
    execute format('drop policy if exists %I on public.%I', 'scope_fin_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for all
         using (property_id is null or private.member_sees_financials(property_id))
         with check (property_id is null or private.member_sees_financials(property_id))',
      'scope_fin_' || t, t);
  end loop;
end $$;

do $$
declare missing text;
begin
  -- Κάθε πίνακας με `property_id` ΚΑΙ τουλάχιστον μία στήλη ποσού πρέπει να
  -- περνά από τον διακόπτη. Οι εξαιρέσεις γράφονται ονομαστικά, με λόγο.
  select string_agg(t.relname, ', ' order by t.relname) into missing
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relkind = 'r'
     and exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attname = 'property_id' and a.attnum > 0 and not a.attisdropped)
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
          and a.atttypid in ('numeric'::regtype, 'double precision'::regtype)
          and a.attname ~ '(amount|total|rent|cost|price|value|fee|levy|paid|deposit|balance)'
     )
     -- Οι πίνακες που ΔΕΝ κρύβονται και γιατί:
     --   user_properties  το ίδιο το ακίνητο· η αξία του δεν είναι «οικονομικό
     --                    στοιχείο μίσθωσης» και το εύρος ακινήτων το καλύπτει ήδη
     --   inventory_items  ο εξοπλισμός· η αξία κτήσης είναι απογραφή, όχι έσοδο
     --   maintenance_*    το κόστος επισκευής το χρειάζεται όποιος τη διαχειρίζεται
     --   inventory        `value`: αξία εξοπλισμού, απογραφή και όχι έσοδο
     --   pricing_settings `min_price`/`max_price`: πολιτική τιμής, όχι εισπραγμένο
     --                    ποσό· το πραγματικό έσοδο ζει στο client_stays που κλείνει
     --   property_settings `kwh_price`: τιμολόγιο ρεύματος, όχι έσοδο μίσθωσης
     --   property_documents ΕΙΝΑΙ ΑΝΟΙΧΤΟ ΕΡΩΤΗΜΑ, ΓΡΑΜΜΕΝΟ ΡΗΤΑ: η στήλη
     --                    `amount` είναι οικονομική, αλλά η γραμμή είναι έγγραφο.
     --                    Κλείνοντας τον πίνακα, το μέλος που διαχειρίζεται
     --                    συντήρηση χάνει ΚΑΘΕ έγγραφο του ακινήτου και αυτό
     --                    είναι απόφαση προϊόντος, όχι μηχανική διόρθωση.
     and t.relname not in ('user_properties', 'inventory_items', 'inventory', 'inventory_maintenance',
                           'maintenance_requests', 'maintenance_tasks', 'tenant_damages',
                           'rent_comparables', 'calendar_events', 'checklist_items',
                           'pricing_settings', 'property_settings', 'property_documents')
     and not exists (
       select 1 from pg_policy pol
        where pol.polrelid = t.oid
          and pol.polname = 'scope_fin_' || t.relname
          and pol.polpermissive = false
     );
  if missing is not null then
    raise exception 'Πίνακες με ποσό και ακίνητο εκτός του διακόπτη οικονομικών: %', missing;
  end if;
end $$;
