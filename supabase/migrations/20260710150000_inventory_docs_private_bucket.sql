-- Ιδιωτικό bucket για αποδείξεις/εγγυήσεις αντικειμένων — προσβάσιμο ΜΟΝΟ με
-- προσωρινό signed URL (η εφαρμογή αποθηκεύει το PATH, όχι public URL).
-- Οι φωτογραφίες (inventory-photos) παραμένουν public για inline εμφάνιση/PDF.
insert into storage.buckets (id, name, public)
values ('inventory-docs', 'inventory-docs', false)
on conflict (id) do update set public = false;

-- Ανέβασμα: κάθε authenticated χρήστης· ο owner ορίζεται αυτόματα = auth.uid().
drop policy if exists "inv_docs_insert" on storage.objects;
create policy "inv_docs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'inventory-docs');

-- Ανάγνωση (απαιτείται για createSignedUrl) & διαγραφή: μόνο ο ιδιοκτήτης του αρχείου.
drop policy if exists "inv_docs_select" on storage.objects;
create policy "inv_docs_select" on storage.objects for select to authenticated
  using (bucket_id = 'inventory-docs' and owner = auth.uid());

drop policy if exists "inv_docs_delete" on storage.objects;
create policy "inv_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'inventory-docs' and owner = auth.uid());
