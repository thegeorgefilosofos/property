-- ═════════════════════════════════════════════════════════════════════════════
-- ΚΡΙΣΙΜΗ ΑΣΦΑΛΕΙΑ — Row Level Security σε ΟΛΟΥΣ τους βασικούς πίνακες.
--
-- Η εφαρμογή μιλάει στη Supabase από τον browser με το ΔΗΜΟΣΙΟ anon key. Χωρίς
-- RLS, οποιοσδήποτε κάνει εγγραφή μπορεί να διαβάσει/γράψει τα δεδομένα ΟΛΩΝ των
-- άλλων χρηστών (οικονομικά, ΑΦΜ/IBAN ενοικιαστών, έγγραφα). Το migration αυτό
-- ενεργοποιεί RLS και βάζει πολιτική «μόνο ο ιδιοκτήτης» σε κάθε ευαίσθητο πίνακα,
-- καθώς και στα αρχεία (Storage).
--
-- ΑΣΦΑΛΕΣ & ΕΠΑΝΑΛΗΨΙΜΟ (idempotent): κάθε πίνακας είναι σε ξεχωριστό DO block με
-- exception handling — αν κάποιος πίνακας/στήλη δεν υπάρχει, απλώς παραλείπεται
-- χωρίς να σπάσει το υπόλοιπο. Οι συγκρίσεις γίνονται με ::text και στις δύο
-- πλευρές (το user_id/property_id μπορεί να είναι text ενώ το uuid είναι uuid).
--
-- ΤΡΕΞΕ ΤΟ μία φορά στο Supabase → SQL Editor. Μπορείς να το ξανατρέξεις άφοβα.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Πίνακες με ιδιοκτησία μέσω στήλης user_id ────────────────────────────────
do $$
declare
  t text;
  own_tables text[] := array[
    'user_properties','properties','property_data','expenses','bills','bills_history',
    'tenants','rent_payments','rent_config','calendar_events',
    'property_documents','bills_settings','property_settings','notification_preferences',
    'loans','contacts','maintenance_tasks','tenant_comm_log','bills_electricity'
  ];
begin
  foreach t in array own_tables loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'own_'||t, t);
      execute format(
        'create policy %I on public.%I for all '
        || 'using (user_id::text = auth.uid()::text) '
        || 'with check (user_id::text = auth.uid()::text)',
        'own_'||t, t);
    exception when others then
      raise notice 'RLS skip %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ── checklist_items: ιδιοκτησία μέσω property_id → user_properties ────────────
do $$
begin
  alter table public.checklist_items enable row level security;
  drop policy if exists "own_checklist_items" on public.checklist_items;
  create policy "own_checklist_items" on public.checklist_items for all
    using      (exists (select 1 from public.user_properties p where p.id::text = checklist_items.property_id::text and p.user_id = auth.uid()))
    with check (exists (select 1 from public.user_properties p where p.id::text = checklist_items.property_id::text and p.user_id = auth.uid()));
exception when others then
  raise notice 'RLS skip checklist_items: %', sqlerrm;
end $$;

-- ── Αρχεία (Storage): ιδιωτικά buckets + πρόσβαση μόνο στον δικό σου φάκελο ────
-- Τα paths είναι της μορφής  {auth.uid}/{property}/...  οπότε ο 1ος φάκελος = uid.
do $$
begin
  update storage.buckets set public = false where id in ('property-files','lease-documents');
exception when others then raise notice 'bucket privacy skip: %', sqlerrm; end $$;

do $$
begin
  drop policy if exists "own_files_all" on storage.objects;
  create policy "own_files_all" on storage.objects for all
    using      ( bucket_id in ('property-files','lease-documents') and (storage.foldername(name))[1] = auth.uid()::text )
    with check ( bucket_id in ('property-files','lease-documents') and (storage.foldername(name))[1] = auth.uid()::text );
exception when others then
  raise notice 'storage policy skip: %', sqlerrm;
end $$;

-- Επαλήθευση (προαιρετικά): δες ποιοι πίνακες ΔΕΝ έχουν RLS ενεργό:
--   select relname from pg_class where relnamespace = 'public'::regnamespace
--     and relkind = 'r' and relrowsecurity = false;
