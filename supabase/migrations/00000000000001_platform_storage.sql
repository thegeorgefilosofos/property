-- ═══════════════════════════════════════════════════════════════════════════
-- Platform baseline · Storage (companion to 00000000000000_baseline.sql).
--
-- `supabase db dump` captures only the `public` schema, so storage buckets and
-- the RLS policies on `storage.objects` are not in the baseline. This migration
-- reproduces the FINAL state of both, so a from-scratch rebuild (staging) has the
-- app's buckets and their access rules. Idempotent. The helper functions it
-- references (is_active_portal_token / owns_portal_token) live in the baseline.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Buckets ─────────────────────────────────────────────────────────────────
-- Public buckets (inline display in the app, reports, PDFs): avatars, org logos,
-- inventory photos. Private buckets (owner/authorised access only): property
-- files, lease documents, inventory receipts, maintenance photos.
insert into storage.buckets (id, name, public) values
  ('avatars',           'avatars',           true),
  ('organizations',     'organizations',     true),
  ('inventory-photos',  'inventory-photos',  true),
  ('property-files',    'property-files',    false),
  ('lease-documents',   'lease-documents',   false),
  ('inventory-docs',    'inventory-docs',    false),
  ('maintenance-photos','maintenance-photos',false)
on conflict (id) do update set public = excluded.public;

-- ── property-files / lease-documents: owner-only, folder = user id ───────────
drop policy if exists "own_files_all" on storage.objects;
create policy "own_files_all" on storage.objects for all
  using      ( bucket_id in ('property-files','lease-documents') and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id in ('property-files','lease-documents') and (storage.foldername(name))[1] = auth.uid()::text );

-- ── inventory-docs: private, scoped per property (receipts/<property_id>/…) ──
drop policy if exists "inv_docs_insert" on storage.objects;
create policy "inv_docs_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inventory-docs' and exists (
      select 1 from public.user_properties p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = auth.uid()
    )
  );
drop policy if exists "inv_docs_select" on storage.objects;
create policy "inv_docs_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'inventory-docs' and exists (
      select 1 from public.user_properties p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = auth.uid()
    )
  );
drop policy if exists "inv_docs_delete" on storage.objects;
create policy "inv_docs_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'inventory-docs' and exists (
      select 1 from public.user_properties p
      where p.id::text = (storage.foldername(name))[2] and p.user_id = auth.uid()
    )
  );

-- ── maintenance-photos: private; upload via active portal token, read/delete ─
-- by the owner of that token (final state after the private-bucket migration).
drop policy if exists "maint_photos_insert"      on storage.objects;
drop policy if exists "maint_photos_read"        on storage.objects;
drop policy if exists "maint_photos_read_owner"  on storage.objects;
drop policy if exists "maint_photos_delete_owner" on storage.objects;
create policy "maint_photos_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'maintenance-photos' and public.is_active_portal_token((storage.foldername(name))[1]));
create policy "maint_photos_read_owner" on storage.objects for select to authenticated
  using (bucket_id = 'maintenance-photos' and public.owns_portal_token((storage.foldername(name))[1]));
create policy "maint_photos_delete_owner" on storage.objects for delete to authenticated
  using (bucket_id = 'maintenance-photos' and public.owns_portal_token((storage.foldername(name))[1]));

-- ── Public buckets (avatars / organizations / inventory-photos): owner writes,
-- world reads. Read is public (bucket is public); writes scoped to the caller's
-- own folder (folder = user id). ─────────────────────────────────────────────
drop policy if exists "public_assets_write" on storage.objects;
create policy "public_assets_write" on storage.objects for all to authenticated
  using      ( bucket_id in ('avatars','organizations','inventory-photos') and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id in ('avatars','organizations','inventory-photos') and (storage.foldername(name))[1] = auth.uid()::text );
