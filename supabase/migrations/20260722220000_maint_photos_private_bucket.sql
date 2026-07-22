-- ═══════════════════════════════════════════════════════════════════════════
-- maintenance-photos → ιδιωτικό bucket + signed URLs (security audit finding 9).
--
-- Μέχρι τώρα το bucket ήταν «public»: η ανάγνωση βασιζόταν σε μη-μαντεύσιμο
-- capability URL, αλλά το public CDN path ΠΑΡΑΚΑΜΠΤΕΙ το RLS — όποιος μάθει ένα
-- URL (π.χ. από κοινοποίηση σε συνεργείο) το κατεβάζει χωρίς έλεγχο, για πάντα.
--
-- Λύση: το bucket γίνεται ΙΔΙΩΤΙΚΟ. Ο ιδιοκτήτης βλέπει τις φωτογραφίες μόνο με
-- προσωρινό signed URL, που το εκδίδει το authenticated API περνώντας από την
-- SELECT policy (owns_portal_token). Η εφαρμογή αποθηκεύει πλέον το PATH της
-- φωτογραφίας (όχι public URL) και το υπογράφει κατ' απαίτηση.
--
-- Οι policies insert/select υπάρχουν ήδη (20260718110000) και δουλεύουν αυτούσιες
-- με ιδιωτικό bucket· εδώ απλώς γυρίζουμε το bucket σε private και προσθέτουμε
-- policy διαγραφής για τον ιδιοκτήτη (καθάρισμα). Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

update storage.buckets set public = false where id = 'maintenance-photos';

-- Ο ιδιοκτήτης μπορεί να διαγράψει φωτογραφίες αιτημάτων του ακινήτου του
-- (ίδιο scoping με την ανάγνωση: κάτοχος του token του φακέλου).
drop policy if exists "maint_photos_delete_owner" on storage.objects;
create policy "maint_photos_delete_owner" on storage.objects for delete to authenticated
  using (bucket_id = 'maintenance-photos' and public.owns_portal_token((storage.foldername(name))[1]));
