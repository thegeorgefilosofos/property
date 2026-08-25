// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟ ΤΗΝ ΑΠΟΘΗΚΗ ΣΤΟΝ ΦΑΚΕΛΟ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ ΑΡΧΕΙΟ. Η `accountantExport` γράφει το zip και δεν ξέρει —
// ούτε πρέπει να μάθει— ότι υπάρχει Supabase, bucket, ή υπογεγραμμένα URL. Εδώ
// ζει το μοναδικό σημείο που κατεβάζει bytes· εκεί ζει το μοναδικό σημείο που
// τα πακετάρει.
//
// ΤΙ ΜΠΑΙΝΕΙ ΚΑΙ ΤΙ ΟΧΙ. Παραστατικά της χρήσης και όσα δεν έχουν ημερομηνία
// καθόλου: ένα μισθωτήριο δεν «ανήκει» σε χρονιά αλλά χρειάζεται σε κάθε μία.
// Οι φωτογραφίες του ακινήτου μένουν έξω — ο λογιστής δεν καταχωρεί μπάνια.
//
// ΤΟ ΟΡΙΟ ΥΠΑΡΧΕΙ, ΚΑΙ ΛΕΓΕΤΑΙ. Ένας φάκελος χτίζεται ΟΛΟΚΛΗΡΟΣ στη μνήμη του
// browser πριν κατέβει: χίλιες σαρώσεις των 8 MB θα κρέμαγαν την καρτέλα του
// χρήστη χωρίς μήνυμα. Ό,τι δεν χωρά μένει έξω ΚΑΙ γράφεται στο «05 Τι λείπει»
// με το όνομά του. Σιωπηλή περικοπή θα σήμαινε ότι ο λογιστής νομίζει πως τα
// έχει όλα, που είναι το χειρότερο δυνατό αποτέλεσμα.
// ═══════════════════════════════════════════════════════════════════════════
import * as documents from '@/lib/data/documents'
import type { Db } from '@/lib/data/documents'
import { fmtBytes } from '@/lib/core/bytes'
import type { DossierAttachment } from './accountantExport'

const BUCKET = 'property-files'

/** Πάνω από αυτό, ένα μόνο αρχείο δεν ταξιδεύει. */
const MAX_FILE = 12 * 1024 * 1024

/** Πάνω από αυτό, ο φάκελος σταματά να δέχεται χαρτιά. */
const MAX_TOTAL = 60 * 1024 * 1024

/** Πόσα κατεβαίνουν ταυτόχρονα. Περισσότερα δεν είναι πιο γρήγορα. */
const BATCH = 4

const COLUMNS = 'file_path,file_name,title,category,doc_date,issue_date,supplier,provider_afm,amount,size_bytes,kind'

interface PaperRow {
  file_path: string
  file_name: string | null
  title: string | null
  category: string | null
  doc_date: string | null
  issue_date: string | null
  supplier: string | null
  provider_afm: string | null
  amount: number | null
  size_bytes: number | null
  kind: string | null
}

/**
 * Ο ΕΚΔΟΤΗΣ, ΟΤΑΝ ΕΙΝΑΙ ΟΝΟΜΑ ΚΑΙ ΟΧΙ ΣΥΝΔΕΣΜΟΣ.
 *
 * Το `supplier` κρατά δύο πράγματα: ένα όνομα παρόχου («ΔΕΗ») ή έναν δεσμό με
 * αντισυμβαλλόμενο («tenant:6f3a…»). Το δεύτερο δεν είναι όνομα και δεν
 * επιτρέπεται να γίνει όνομα αρχείου.
 */
const issuerOf = (s: string | null): string | null =>
  !s || /^[a-z_]+:/.test(s) ? null : s

/** Η ημερομηνία του παραστατικού: η έκδοση προηγείται της καταχώρησης. */
const dateOf = (r: PaperRow): string | null => (r.issue_date || r.doc_date || null)

/**
 * Τα παραστατικά της χρήσης, με τα bytes τους.
 *
 * Επιστρέφει και τις σημειώσεις για όσα έμειναν πίσω, ώστε να γραφτούν στο
 * «05 Τι λείπει» — ο φάκελος δεν αποκρύπτει ποτέ ότι κάτι δεν χώρεσε.
 */
export async function fetchDossierPapers(
  db: Db, propertyId: string, userId: string, year: number,
): Promise<{ files: DossierAttachment[]; notes: string[] }> {
  const notes: string[] = []
  let rows: PaperRow[] = []
  try {
    rows = await documents.ofProperty<PaperRow>(db, propertyId, COLUMNS, userId)
  } catch {
    return { files: [], notes: ['Τα σαρωμένα παραστατικά δεν διαβάστηκαν και δεν συνοδεύουν αυτόν τον φάκελο.'] }
  }

  // Της χρονιάς, ή χωρίς ημερομηνία καθόλου. Οι φωτογραφίες μένουν έξω.
  const wanted = rows
    .filter(r => r.file_path && r.kind !== 'photo')
    .filter(r => { const d = dateOf(r); return !d || d.slice(0, 4) === String(year) })
    // Χρονολογικά, ώστε το όριο —όταν χτυπήσει— να κόψει από το τέλος της
    // χρονιάς και όχι από όπου έτυχε να τα επιστρέψει η βάση.
    .sort((a, b) => (dateOf(a) || '9999-12-31').localeCompare(dateOf(b) || '9999-12-31'))

  if (wanted.length === 0) return { files: [], notes }

  const nameOf = (r: PaperRow): string => r.title || r.file_name || 'παραστατικό'

  // Ό,τι ξέρουμε ήδη ότι είναι πολύ μεγάλο δεν χρειάζεται καν να κατέβει.
  const tooBig = wanted.filter(r => (r.size_bytes || 0) > MAX_FILE)
  for (const r of tooBig) {
    notes.push(`Το παραστατικό «${nameOf(r)}» (${fmtBytes(r.size_bytes || 0)}) δεν χώρεσε στον φάκελο· βρίσκεται στο Αρχείο της εφαρμογής.`)
  }
  const candidates = wanted.filter(r => (r.size_bytes || 0) <= MAX_FILE)

  // Υπογεγραμμένα URL για όλα μαζί, μία κλήση.
  const paths = candidates.map(r => r.file_path)
  const signed: Record<string, string> = {}
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 60 * 10)
  data?.forEach((s, i) => { if (s?.signedUrl) signed[paths[i]] = s.signedUrl })

  const files: DossierAttachment[] = []
  let total = 0
  let dropped = 0

  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH)
    const got = await Promise.all(slice.map(async r => {
      const url = signed[r.file_path]
      if (!url) return null
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        return new Uint8Array(await res.arrayBuffer())
      } catch { return null }
    }))
    got.forEach((bytes, k) => {
      const r = slice[k]
      if (!bytes) { notes.push(`Το παραστατικό «${nameOf(r)}» δεν κατέβηκε και δεν συνοδεύει αυτόν τον φάκελο.`); return }
      // Το πραγματικό μέγεθος μετράει, όχι το δηλωμένο: η `size_bytes` μπορεί
      // να λείπει και τότε το όριο θα ήταν γραμμένο χωρίς να ισχύει.
      if (bytes.length > MAX_FILE) { notes.push(`Το παραστατικό «${nameOf(r)}» (${fmtBytes(bytes.length)}) δεν χώρεσε στον φάκελο· βρίσκεται στο Αρχείο της εφαρμογής.`); return }
      if (total + bytes.length > MAX_TOTAL) { dropped++; return }
      total += bytes.length
      files.push({
        bytes,
        fileName: r.file_name || r.file_path.split('/').pop() || 'παραστατικό',
        title: r.title,
        category: r.category,
        docDate: dateOf(r),
        supplier: issuerOf(r.supplier),
        afm: r.provider_afm,
        amount: r.amount,
      })
    })
  }

  if (dropped > 0) {
    notes.push(dropped === 1
      ? `Ένα ακόμη παραστατικό δεν χώρεσε στον φάκελο, που σταματά στα ${fmtBytes(MAX_TOTAL)}. Βρίσκεται στο Αρχείο της εφαρμογής.`
      : `${dropped} ακόμη παραστατικά δεν χώρεσαν στον φάκελο, που σταματά στα ${fmtBytes(MAX_TOTAL)}. Βρίσκονται στο Αρχείο της εφαρμογής.`)
  }
  return { files, notes }
}
