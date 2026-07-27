-- ═══════════════════════════════════════════════════════════════════════════
-- Απομόνωση ΑΝΑ ΧΡΗΣΤΗ και στα δύο δημόσια buckets (avatars, inventory-photos)
--
-- Στο 20260727060000 έκλεισε η κρίσιμη τρύπα (καθολικές πολιτικές `true`), αλλά
-- τα δύο δημόσια buckets έμειναν περιορισμένα μόνο ΑΝΑ BUCKET: κάθε συνδεδεμένος
-- χρήστης μπορούσε ακόμη να σβήσει ή να αντικαταστήσει αρχείο άλλου χρήστη μέσα
-- σε αυτά. Ο λόγος ήταν ότι το app έγραφε με επίπεδα μονοπάτια.
--
-- Το app γράφει πλέον σε «<auth.uid()>/…» (lib/storage/scopedUpload.ts), οπότε
-- οι πολιτικές μπορούν να απομονώσουν πλήρως ανά χρήστη, όπως ήδη γίνεται στα
-- ιδιωτικά buckets (property-files, lease-documents).
--
-- ΣΗΜΕΙΩΣΗ: εφαρμόζεται με άδεια buckets (0 αντικείμενα), άρα δεν «ορφανεύει»
-- κανένα υπάρχον αρχείο. Η ανάγνωση παραμένει μέσω δημόσιου URL (δεν περνά από
-- RLS), οπότε οι εικόνες συνεχίζουν να εμφανίζονται κανονικά.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── avatars ────────────────────────────────────────────────────────────────
drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update" on storage.objects
  for update to authenticated
  using       (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check  (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

-- ── inventory-photos ───────────────────────────────────────────────────────
-- Αντικαθιστούν τις παλιές πολιτικές που ήταν μόνο ανά bucket.
drop policy if exists "Auth upload inventory photos" on storage.objects;
drop policy if exists "Auth delete inventory photos" on storage.objects;
drop policy if exists "inventory_photos_auth_update" on storage.objects;

create policy "inventory_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "inventory_photos_update_own" on storage.objects
  for update to authenticated
  using       (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check  (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "inventory_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (auth.uid())::text);
