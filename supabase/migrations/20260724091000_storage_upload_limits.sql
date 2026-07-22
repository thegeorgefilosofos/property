-- ═══════════════════════════════════════════════════════════════════════════
-- Storage upload limits — cap size and restrict MIME types per bucket.
--
-- The buckets were created without a file_size_limit or allowed_mime_types, so a
-- caller could upload an arbitrarily large file of any type. This matters most
-- for `maintenance-photos`, which is written by UNTRUSTED tenants through an
-- active portal token — an attacker could burn the (free-tier) storage quota or
-- upload non-image payloads. Supabase Storage enforces both limits server-side.
--
-- Photo buckets: images only, 10 MB. Document buckets: images + PDF, 20 MB.
-- ═══════════════════════════════════════════════════════════════════════════

update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
 where id in ('maintenance-photos','inventory-photos','avatars','organizations');

update storage.buckets
   set file_size_limit = 20971520,  -- 20 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id in ('property-files','lease-documents','inventory-docs');
