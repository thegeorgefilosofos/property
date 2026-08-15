-- ═══════════════════════════════════════════════════════════════════════════
--  Ο ΔΙΑΚΟΠΤΗΣ ΤΩΝ ΟΙΚΟΝΟΜΙΚΩΝ ΔΕΝ ΕΚΡΥΒΕ ΤΟ ΙΔΙΟ ΤΟ ΜΙΣΘΩΜΑ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΒΡΕΘΗΚΕ. Η οθόνη της ομάδας υπόσχεται «Οικονομικά στοιχεία: Ενοίκια,
--  δαπάνες, λογαριασμοί, δάνεια και λογιστική» και δίνει το κουμπί «Κρυφά».
--  Η βάση όμως εφάρμοζε τον διακόπτη σε ΕΠΤΑ πίνακες:
--
--      bank_transactions · bills · bills_history · book_closings ·
--      expenses · loans · rent_payments
--
--  Ο `tenants` δεν ήταν ανάμεσά τους, και εκεί ζουν το μίσθωμα
--  (monthly_rent), η εγγύηση (deposit, deposit_amount), η ρήτρα πρόωρης
--  αποχώρησης και ΔΥΟ IBAN (iban, rent_iban). Δίπλα τους το ΑΦΜ και ο
--  αριθμός ταυτότητας του μισθωτή. Μέλος με can_view_financials=false τα
--  διάβαζε όλα με ένα `select`.
--
--  ΚΑΙ Ο `rent_config`, ΠΟΥ ΔΕΝ ΔΙΑΡΡΕΕΙ ΣΗΜΕΡΑ. Κρατά target_rent,
--  actual_rent και deposit, δηλαδή το μίσθωμα δεύτερη φορά, και τον διαβάζουν
--  τρεις οθόνες. Επιβεβαιώθηκε στον κατάλογο: έχει ΜΙΑ policy, την
--  `own_rent_config`, οπότε κανένα μέλος δεν τον φτάνει ούτως ή άλλως. Μπαίνει
--  στην ίδια πύλη ώστε η μέρα που θα αποκτήσει `org_read_*` — όπως έχουν οι
--  υπόλοιποι πίνακες με ακίνητο — να μη γεννήσει ξανά το ίδιο κενό.
--
--  ΤΙ ΑΛΛΑΖΕΙ. Ο ίδιος μηχανισμός με τους επτά, χωρίς νέα έννοια: restrictive
--  policy που κάνει AND με τις υπάρχουσες permissive. Δεν δίνει πρόσβαση
--  πουθενά, μόνο αφαιρεί. Η `private.member_sees_financials` επιστρέφει true
--  για τον ιδιοκτήτη και για κάθε μέλος που ΕΧΕΙ το δικαίωμα, οπότε ο
--  ιδιοκτήτης, ο λογιστής και η πύλη του μισθωτή δεν αλλάζουν συμπεριφορά.
--  Οι δύο τελευταίοι περνούν έτσι κι αλλιώς από SECURITY DEFINER, εκτός RLS.
--
--  ΤΟ ΚΟΣΤΟΣ ΤΗΣ ΑΛΛΑΓΗΣ, ΓΡΑΜΜΕΝΟ ΡΗΤΑ. Το μέλος χωρίς δικαίωμα παύει να
--  βλέπει ΟΛΟΚΛΗΡΗ τη γραμμή του μισθωτή, όχι μόνο τα ποσά: η RLS κόβει
--  γραμμές, όχι στήλες. Επιλέχθηκε συνειδητά, γιατί στην ίδια γραμμή
--  κάθονται ΑΦΜ και ταυτότητα, που ο συνεργάτης χωρίς οικονομικά δεν
--  χρειάζεται να διαβάζει. Το ίδιο ισχύει ήδη για τις δαπάνες.
--
--  ΤΟ ΣΧΗΜΑ ΕΙΝΑΙ `private`, ΟΧΙ `public`. Οι εννιά βοηθοί μετακινήθηκαν με
--  το 20260812160000. Οι παλιές πολιτικές ακολούθησαν τη μετακίνηση μέσω
--  OID, αλλά κάθε ΝΕΑ γράφεται με τη σημερινή διεύθυνση, αλλιώς σκάει 42883.
--
--  ΑΠΟΔΕΙΞΗ, ΟΧΙ ΠΕΠΟΙΘΗΣΗ. Το scripts/db/rls-probe.sql στήνει οργανισμό με
--  δύο μέλη, μίσθωμα 750,00 € και IBAN, και απαιτεί τρία πράγματα: το μέλος
--  χωρίς δικαίωμα βλέπει το ακίνητο και ΜΗΔΕΝ μισθωτές, ούτε τους αλλάζει· το
--  μέλος με δικαίωμα διαβάζει 750,00 €· ο ιδιοκτήτης βλέπει και ενημερώνει.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['tenants', 'rent_config'] loop
    execute format('drop policy if exists %I on public.%I', 'scope_fin_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for all
         using (property_id is null or private.member_sees_financials(property_id))
         with check (property_id is null or private.member_sees_financials(property_id))',
      'scope_fin_' || t, t);
  end loop;
end $$;

-- ── Ο ΚΑΤΑΛΟΓΟΣ ΤΩΝ ΠΥΛΩΡΗΜΕΝΩΝ ΠΙΝΑΚΩΝ, ΜΕΤΡΗΜΕΝΟΣ ΕΔΩ ────────────────────
-- Η λίστα ζούσε μόνο μέσα σε `foreach`, σε δύο μεταναστεύσεις. Πίνακας που
-- ξεχνιέται δεν αφήνει ίχνος πουθενά: έτσι ακριβώς έμεινε ο `tenants` έξω
-- για είκοσι μέρες. Εδώ η βάση μετρά τον εαυτό της και σκάει αν λείψει ενας.
do $$
declare missing text;
begin
  select string_agg(t, ', ' order by t) into missing
    from unnest(array[
      'bank_transactions', 'bills', 'bills_history', 'book_closings',
      'expenses', 'loans', 'rent_config', 'rent_payments', 'tenants'
    ]) as t
   where not exists (
     select 1
       from pg_policy pol
       join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t
        and pol.polname = 'scope_fin_' || t
        and pol.polpermissive = false
   );
  if missing is not null then
    raise exception 'Ο διακόπτης των οικονομικών δεν καλύπτει: %', missing;
  end if;
end $$;
