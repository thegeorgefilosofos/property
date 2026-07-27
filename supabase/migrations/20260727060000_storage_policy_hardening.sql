-- ═══════════════════════════════════════════════════════════════════════════
-- ΚΡΙΣΙΜΗ ΔΙΟΡΘΩΣΗ ΑΣΦΑΛΕΙΑΣ — πολιτικές αποθήκευσης (storage.objects)
--
-- ΤΟ ΠΡΟΒΛΗΜΑ
-- Έξι πολιτικές της οικογένειας «1oj01fe_*» (αυτόματα παραγόμενες από το
-- dashboard) ίσχυαν για ΟΛΑ τα buckets με συνθήκη `true`:
--
--   Public read 1oj01fe_0   SELECT  public         USING true
--   Auth delete 1oj01fe_1   SELECT  authenticated  USING true
--   Auth update 1oj01fe_1   SELECT  authenticated  USING true
--   Auth insert 1oj01fe_0   INSERT  authenticated  WITH CHECK true
--   Auth update 1oj01fe_0   UPDATE  authenticated  USING true
--   Auth delete 1oj01fe_0   DELETE  authenticated  USING true
--
-- Οι πολιτικές RLS συνδυάζονται με OR. Άρα αυτές ΑΚΥΡΩΝΑΝ όλες τις σωστές,
-- περιορισμένες ανά χρήστη πολιτικές που υπάρχουν ήδη. Πρακτικά:
--
--   • Οποιοσδήποτε ΑΝΩΝΥΜΟΣ με το δημόσιο κλειδί μπορούσε να διαβάσει και να
--     απαριθμήσει ΚΑΘΕ αρχείο σε ΚΑΘΕ bucket — συμπεριλαμβανομένων των ιδιωτικών
--     `lease-documents` (μισθωτήρια με ονόματα, ΑΦΜ, διευθύνσεις) και
--     `property-files`. Παραβίαση προσωπικών δεδομένων (GDPR).
--   • Οποιοσδήποτε ΣΥΝΔΕΔΕΜΕΝΟΣ χρήστης μπορούσε να ΔΙΑΓΡΑΨΕΙ ή να
--     ΑΝΤΙΚΑΤΑΣΤΗΣΕΙ κάθε αρχείο κάθε άλλου χρήστη, και να ανεβάσει αρχεία
--     μέσα στον φάκελο άλλου χρήστη.
--
-- Τη στιγμή της διόρθωσης όλα τα buckets ήταν ΚΕΝΑ (0 αντικείμενα), οπότε δεν
-- έχει διαρρεύσει τίποτα. Διορθώνεται πριν μπουν πραγματικά δεδομένα.
--
-- Η ΔΙΟΡΘΩΣΗ
-- Αφαιρούνται οι έξι καθολικές πολιτικές. Παραμένουν οι ήδη υπάρχουσες,
-- σωστά περιορισμένες πολιτικές ανά ιδιοκτήτη:
--   own_files_all, property_files_*_own, «Give users access to own folder …»,
--   inv_docs_*, maint_photos_* (με έλεγχο ενεργού portal token).
-- Προστίθενται πολιτικές περιορισμένες ΑΝΑ BUCKET για τα δύο δημόσια buckets,
-- ώστε να συνεχίσουν να δουλεύουν avatars & φωτογραφίες απογραφής.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Αφαίρεση των καθολικών πολιτικών ────────────────────────────────────
drop policy if exists "Public read 1oj01fe_0" on storage.objects;
drop policy if exists "Auth delete 1oj01fe_1" on storage.objects;
drop policy if exists "Auth update 1oj01fe_1" on storage.objects;
drop policy if exists "Auth insert 1oj01fe_0" on storage.objects;
drop policy if exists "Auth update 1oj01fe_0" on storage.objects;
drop policy if exists "Auth delete 1oj01fe_0" on storage.objects;

-- ── 2) avatars (δημόσιο bucket) ────────────────────────────────────────────
-- Εγγραφή μόνο από συνδεδεμένους και μόνο σε αυτό το bucket.
--
-- ΣΗΜΕΙΩΣΗ: δεν δίνεται πολιτική SELECT. Στα δημόσια buckets η διεύθυνση
-- /storage/v1/object/public/<bucket>/<path> ΔΕΝ περνά από RLS, οπότε οι εικόνες
-- εμφανίζονται κανονικά μέσω getPublicUrl(). Πολιτική SELECT θα χρειαζόταν μόνο
-- για .list() ή signed URLs — που το app δεν χρησιμοποιεί εδώ. Έτσι κόβεται η
-- ΑΠΑΡΙΘΜΗΣΗ ονομάτων αρχείων από τρίτους (information disclosure).
drop policy if exists "avatars_public_read" on storage.objects;

drop policy if exists "avatars_auth_insert" on storage.objects;
create policy "avatars_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

-- upsert:true στον client απαιτεί και UPDATE.
drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars') with check (bucket_id = 'avatars');

drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars');

-- ── 3) inventory-photos (δημόσιο bucket) ───────────────────────────────────
-- Υπάρχουν ήδη «Auth upload inventory photos» (INSERT) και «Auth delete
-- inventory photos» (DELETE), περιορισμένες στο bucket. Λείπει η UPDATE που
-- απαιτεί το upsert:true. Η SELECT αφαιρείται για τον ίδιο λόγο με τα avatars.
drop policy if exists "Public read inventory photos" on storage.objects;

drop policy if exists "inventory_photos_auth_update" on storage.objects;
create policy "inventory_photos_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'inventory-photos') with check (bucket_id = 'inventory-photos');

-- ── ΣΗΜΕΙΩΣΗ ΓΙΑ ΕΠΟΜΕΝΟ ΒΗΜΑ ──────────────────────────────────────────────
-- Τα `avatars` και `inventory-photos` περιορίζονται ανά bucket, όχι ανά χρήστη,
-- επειδή το app αποθηκεύει εκεί με επίπεδα μονοπάτια (π.χ. «contacts/…»,
-- «<timestamp>-<random>.jpg») χωρίς φάκελο χρήστη. Για πλήρη απομόνωση ανά
-- χρήστη χρειάζεται αλλαγή στο app ώστε τα μονοπάτια να ξεκινούν με
-- «<auth.uid()>/…», και μετά αυστηροποίηση αυτών των πολιτικών όπως στα
-- property-files. Τα ΙΔΙΩΤΙΚΑ buckets είναι ήδη πλήρως απομονωμένα ανά χρήστη.
