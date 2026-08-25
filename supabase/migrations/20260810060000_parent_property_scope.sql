-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΑΜΙΑ ΓΡΑΜΜΗ ΔΕΝ ΜΠΑΙΝΕΙ ΣΕ ΞΕΝΟ ΑΚΙΝΗΤΟ
-- ─────────────────────────────────────────────────────────────────────────
-- Η ΑΣΥΜΜΕΤΡΙΑ: οι πολιτικές ΕΓΓΡΑΦΗΣ των περισσότερων πινάκων έδεναν μόνο το
-- `user_id` («η γραμμή είναι δική μου»), ενώ οι πολιτικές ΑΝΑΓΝΩΣΗΣ `org_read_*`
-- ταιριάζουν ανά `property_id` («το ακίνητο είναι δικό μου»), ανεξάρτητα από το
-- `user_id` της γραμμής.
--
-- Δύο διαφορετικά κλειδιά για την ίδια πόρτα. Η επίθεση γράφεται σε μία γραμμή:
--
--     insert into expenses (user_id, property_id, amount, ...)
--     values (auth.uid(), '<ακίνητο ΤΟΥ ΘΥΜΑΤΟΣ>', 4000, ...)
--
-- Το `WITH CHECK` περνά, γιατί το `user_id` είναι όντως του επιτιθέμενου. Και
-- μετά η `org_read_expenses` του θύματος τη ΒΛΕΠΕΙ, γιατί κοιτάζει το ακίνητο.
-- Ο ιδιοκτήτης ανοίγει τον πίνακά του και βρίσκει μέσα πλαστό ενοικιαστή, πλαστή
-- δαπάνη, πλαστό δάνειο — γραμμές που δεν έγραψε ποτέ, μέσα στα δικά του σύνολα,
-- μέσα στον φάκελο που δίνει στον λογιστή του.
--
-- ΤΟ ΣΩΣΤΟ ΜΟΤΙΒΟ ΥΠΗΡΧΕ ΗΔΗ, ΑΠΛΩΣ ΔΕΝ ΕΦΑΡΜΟΣΤΗΚΕ ΠΑΝΤΟΥ. Οι
-- `own_checklist_items` και `own_inventory_items` ελέγχουν ΚΑΙ τον γονέα. Οι
-- `own_expenses`, `own_tenants`, `own_loans`, `own_bills`, `own_contacts`,
-- `own_rent_payments`, `own_property_documents`, `own_client_stays` και άλλες
-- δεκαπέντε δεν τον ελέγχουν.
--
-- ΓΙΑΤΙ RESTRICTIVE ΚΑΙ ΟΧΙ ΔΙΟΡΘΩΣΗ ΤΗΣ ΚΑΘΕ ΠΟΛΙΤΙΚΗΣ: μια restrictive policy
-- κάνει AND με ό,τι υπάρχει. Δεν δίνει πρόσβαση πουθενά, δεν ξαναγράφει καμία
-- υπάρχουσα πολιτική και ισχύει ΚΑΙ για κάθε μελλοντική permissive policy που
-- θα γραφτεί στους ίδιους πίνακες. Ο κανόνας ζει σε ένα σημείο, όχι σε τριάντα.
--
-- ΓΙΑΤΙ ΜΟΝΟ ΣΤΗΝ ΕΓΓΡΑΦΗ: το `USING` παραλείπεται επίτηδες. Αν ένα ακίνητο
-- διαγραφεί και μείνουν ορφανές γραμμές, ένα restrictive `USING` θα τις έκρυβε
-- από τον ίδιο τον ιδιοκτήτη τους — θα διορθώναμε μια επίθεση χάνοντας δεδομένα.
-- Η τρύπα είναι στην είσοδο· εκεί κλείνει.
--
-- Η ΔΙΑΓΡΑΦΗ ΜΕΝΕΙ ΕΛΕΥΘΕΡΗ, ώστε ό,τι έχει ήδη γραφτεί να μπορεί να καθαριστεί.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ανήκει το ακίνητο σε εμένα (ή στον ιδιοκτήτη του οργανισμού μου); ───────
-- Ίδια πηγή αλήθειας με τις `org_read_*`: η `org_owner_ids` επιστρέφει τον ίδιο
-- τον χρήστη και, αν είναι ενεργό μέλος, τους ιδιοκτήτες των οργανισμών του.
-- Έτσι ο συνεργάτης εξακολουθεί να γράφει στα ακίνητα που του ανατέθηκαν.
--
-- Το `null` περνά: ορισμένοι πίνακες κρατούν γραμμές χωρίς ακίνητο (ρυθμίσεις
-- χρήστη) και εκεί αποφασίζει η υπάρχουσα πολιτική του `user_id`.
create or replace function public.owns_parent_property(p_property uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select p_property is null or exists (
    select 1
      from user_properties p
     where p.id = p_property
       and p.user_id in (select public.org_owner_ids(auth.uid()))
  )
$$;
alter function public.owns_parent_property(uuid) owner to postgres;

-- Πίνακες που κρατούν το `property_id` ως text. Ό,τι δεν είναι έγκυρο uuid δεν
-- μπορεί να δείχνει σε ακίνητο, άρα δεν το κρίνει αυτός ο κανόνας — ίδια
-- σύμβαση με τη `member_sees_property(text)`.
create or replace function public.owns_parent_property(p_property text)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select case
    when p_property is null or p_property !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then true
    else public.owns_parent_property(p_property::uuid)
  end
$$;

grant execute on function public.owns_parent_property(uuid) to authenticated;
grant execute on function public.owns_parent_property(text) to authenticated;

comment on function public.owns_parent_property(uuid) is
  'Ανήκει το ακίνητο στον καλούντα ή στον ιδιοκτήτη του οργανισμού του; Φράζει την εγγραφή γραμμής σε ξένο ακίνητο.';

-- ── Ο κανόνας, σε κάθε πίνακα με ακίνητο ───────────────────────────────────
-- Ίδια λίστα με το `scope_property_*` του 20260726080000: κάθε πίνακας που
-- κουβαλά `property_id`. Δύο πολιτικές ανά πίνακα, μία για κάθε δρόμο εισόδου.
do $$
declare t text;
begin
  foreach t in array array[
    'airbnb_bookings','bank_transactions','bills','bills_history','bills_settings',
    'book_closings','calendar_events','checkin_links','checklist_items','client_stays',
    'contacts','expenses','guest_checkins','ical_feeds','inventory','inventory_handovers',
    'inventory_items','inventory_maintenance','loans','maintenance_requests','maintenance_tasks',
    'portal_links','pricing_settings','property_documents','property_settings','rent_comparables',
    'rent_config','rent_payments','tenant_comm_log','tenant_damages','tenants'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'parent_ins_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for insert
         with check (public.owns_parent_property(property_id))',
      'parent_ins_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'parent_upd_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for update
         with check (public.owns_parent_property(property_id))',
      'parent_upd_' || t, t);
  end loop;
end $$;

-- ── Απόδειξη ότι ο κανόνας μπήκε παντού ────────────────────────────────────
-- Η Postgres δέχεται `execute format` χωρίς να το εκτελέσει ποτέ αν το μπλοκ δεν
-- τρέξει· εδώ τρέχει και το επιβεβαιώνουμε με μέτρημα αντί για ελπίδα.
do $$
declare v_count integer;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and (policyname like 'parent_ins_%' or policyname like 'parent_upd_%');
  if v_count <> 62 then
    raise exception 'περίμενα 62 πολιτικές γονικού ακινήτου, βρήκα %', v_count;
  end if;
end $$;
