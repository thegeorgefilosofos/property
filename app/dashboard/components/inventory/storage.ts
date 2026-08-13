// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΑΡΑΣΤΑΤΙΚΑ ΤΗΣ ΑΠΟΓΡΑΦΗΣ ΖΟΥΝ ΣΕ ΙΔΙΩΤΙΚΟ ΚΑΔΟ
// ─────────────────────────────────────────────────────────────────────────
// Η απόδειξη αγοράς και το πιστοποιητικό εγγύησης δεν είναι δημόσια αρχεία:
// φέρουν ονόματα, ποσά και σειριακούς. Αποθηκεύεται η ΔΙΑΔΡΟΜΗ, και το άνοιγμα
// γίνεται με προσωρινό υπογεγραμμένο σύνδεσμο μιας ώρας.
//
// Η εναλλακτική διαδρομή είναι για όσα ανέβηκαν πριν αλλάξει αυτό: ήταν
// αποθηκευμένα ως πλήρεις διευθύνσεις και εξακολουθούν να ανοίγουν.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from '@/lib/supabase/client'
import { notifyError } from '@/components/Toast'

export const DOCS_BUCKET = 'inventory-docs'

export async function openInventoryDoc(pathOrUrl?: string | null) {
  if (!pathOrUrl) return
  if (/^https?:\/\//.test(pathOrUrl)) { window.open(pathOrUrl, '_blank'); return }
  const { data, error } = await createClient().storage.from(DOCS_BUCKET).createSignedUrl(pathOrUrl, 3600)
  if (error || !data) { notifyError('Δεν ήταν δυνατό το άνοιγμα του αρχείου.'); return }
  window.open(data.signedUrl, '_blank')
}
