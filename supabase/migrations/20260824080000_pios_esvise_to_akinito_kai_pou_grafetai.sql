-- ═══════════════════════════════════════════════════════════════════════════
--  Η ΔΙΑΓΡΑΦΗ ΑΚΙΝΗΤΟΥ ΓΡΑΦΟΤΑΝ ΣΤΟ ΗΜΕΡΟΛΟΓΙΟ ΛΑΘΟΣ ΑΝΘΡΩΠΟΥ
-- ─────────────────────────────────────────────────────────────────────────
--  ΤΙ ΒΡΕΘΗΚΕ. Ενα μέλος οργανισμού με `can_edit` μπορεί να σβήσει ΑΚΙΝΗΤΟ
--  του ιδιοκτήτη: η πολιτική `org_del_properties` το επιτρέπει ρητά, και η
--  διαγραφή μιας γραμμής του `user_properties` καταρρέει τριάντα ένα πίνακες
--  (ξένα κλειδιά CASCADE και η σκανδάλη `purge_property_children`). Ανάμεσά
--  τους οι δηλώσεις άφιξης επισκεπτών, με στοιχεία ταυτότητας τρίτων.
--
--  Ο πίνακας `activity_log` υπάρχει, και η `log_activity` γράφει σωστά ΠΟΙΟΣ
--  έκανε την ενέργεια (`actor_id`, `actor_email`). Ομως γράφει και
--  `user_id = auth.uid()`, δηλαδή ΤΟΝ ΔΡΑΣΤΗ, και η `my_activity` επιστρέφει
--  γραμμές «where user_id = auth.uid() or actor_id = auth.uid()».
--
--  Αποτέλεσμα: όταν το μέλος σβήνει ακίνητο του ιδιοκτήτη, η γραμμή ελέγχου
--  γράφεται στο ημερολόγιο ΤΟΥ ΜΕΛΟΥΣ. Ο ιδιοκτήτης δεν τη βλέπει ποτέ. Το
--  ίχνος υπήρχε, και πήγαινε στον μόνο άνθρωπο που δεν το χρειάζεται.
--
--  ΤΙ ΑΛΛΑΖΕΙ. Οταν η ενέργεια αφορά ακίνητο, ο κάτοχος του ημερολογίου γίνεται
--  ο ΙΔΙΟΚΤΗΤΗΣ του ακινήτου. Ο δράστης μένει στο `actor_id`/`actor_email`,
--  οπότε η γραμμή λέει και τα δύο και εμφανίζεται ΚΑΙ στους δύο (η
--  `my_activity` κοιτά και τα δύο πεδία).
--
--  ΚΑΙ ΔΕΝ ΓΙΝΕΤΑΙ ΜΑΝΤΕΙΟ. Η αναζήτηση ιδιοκτήτη περιορίζεται σε ακίνητα που
--  ο καλών ΦΤΑΝΕΙ κανονικά (`private.org_owner_ids`): δικά του, ή του
--  οργανισμού όπου είναι ενεργό μέλος. Χωρίς αυτό, μια SECURITY DEFINER
--  συνάρτηση με ελεύθερο uuid θα επέστρεφε στο ημερολόγιο του καλούντος το
--  `user_id` ΞΕΝΟΥ ιδιοκτήτη — δηλαδή θα μετέτρεπε την καταγραφή σε διαρροή.
--  Οταν δεν βρεθεί τίποτα, ισχύει η παλιά συμπεριφορά: κάτοχος ο δράστης.
--
--  ΤΟ ΣΧΗΜΑ ΤΟΥ `entity_id` ΕΙΝΑΙ text ΚΑΙ ΜΕΝΕΙ text. Χωρίς ξένο κλειδί, η
--  γραμμή ελέγχου ΕΠΙΖΕΙ της διαγραφής του ακινήτου — που είναι όλο το νόημα.
--  Ενα FK με CASCADE εδώ θα έσβηνε το ίχνος μαζί με το γεγονός.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.log_activity(
  p_action text,
  p_entity text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_owner uuid;
begin
  if v_uid is null or coalesce(p_action, '') = '' then return; end if;
  select email into v_email from auth.users where id = v_uid;

  -- Ο κάτοχος του ημερολογίου: ο ιδιοκτήτης του ακινήτου, όταν πρόκειται για
  -- ακίνητο που ο καλών φτάνει κανονικά. Αλλιώς ο δράστης, όπως πριν.
  if p_entity = 'property'
     and p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.user_id into v_owner
      from user_properties p
     where p.id = p_entity_id::uuid
       and p.user_id in (select private.org_owner_ids(v_uid));
  end if;

  insert into activity_log(user_id, actor_id, actor_email, action, entity, entity_id, metadata)
  values (coalesce(v_owner, v_uid), v_uid, v_email,
          left(p_action, 60), left(p_entity, 40), left(p_entity_id, 100),
          coalesce(p_metadata, '{}'::jsonb));
end $$;

comment on function public.log_activity(text, text, text, jsonb) is
  'Γραμμή ελέγχου. Για ενέργειες σε ακίνητο, κάτοχος του ημερολογίου είναι ο ΙΔΙΟΚΤΗΤΗΣ του ακινήτου και δράστης ο auth.uid(): αλλιώς η διαγραφή ακινήτου από μέλος γραφόταν μόνο στο ημερολόγιο του μέλους.';
