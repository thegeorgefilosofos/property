-- Ιδιωτικό bucket για αποδείξεις/εγγυήσεις αντικειμένων — προσβάσιμο ΜΟΝΟ με
-- προσωρινό signed URL (η εφαρμογή αποθηκεύει το PATH, όχι public URL).
-- Οι φωτογραφίες (inventory-photos) παραμένουν public για inline εμφάνιση/PDF.
-- Scoping ΑΝΑ ΑΚΙΝΗΤΟ: το path είναι receipts/<property_id>/<αρχείο>, και η πρόσβαση
-- δίνεται σε όποιον έχει το ακίνητο (μελλοντικά και σε συνιδιοκτήτες, μέσω user_properties).
insert into storage.buckets (id, name, public)
values ('inventory-docs', 'inventory-docs', false)
on conflict (id) do update set public = false;

-- Ανέβασμα: μόνο σε φάκελο ακινήτου που ανήκει στον χρήστη.
drop policy if exists "inv_docs_insert" on storage.objects;
create policy "inv_docs_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inventory-docs' and exists (
      select 1 from user_properties p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = auth.uid()
    )
  );

-- Ανάγνωση (για createSignedUrl) & διαγραφή: ίδιο scoping ανά ακίνητο.
drop policy if exists "inv_docs_select" on storage.objects;
create policy "inv_docs_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'inventory-docs' and exists (
      select 1 from user_properties p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = auth.uid()
    )
  );

drop policy if exists "inv_docs_delete" on storage.objects;
create policy "inv_docs_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'inventory-docs' and exists (
      select 1 from user_properties p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = auth.uid()
    )
  );
