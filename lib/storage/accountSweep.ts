// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΑΡΧΕΙΑ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ ΦΕΥΓΟΥΝ ΑΠΟ ΤΟ API ΑΠΟΘΗΚΕΥΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ. Η `delete_my_account` έγραφε `delete from storage.objects`. Η
// Supabase το απαγορεύει με σκανδάλη, και το κατέγραψε ως 42501 «Direct
// deletion from storage tables is not allowed. Use the Storage API instead.»
// Η εξαίρεση πιανόταν, η διαγραφή προχωρούσε, και ΚΑΘΕ αρχείο έμενε πίσω:
// μισθωτήρια, ταυτότητες, παραστατικά, φωτογραφίες βλαβών.
//
// Η ΣΕΙΡΑ ΕΙΝΑΙ ΥΠΟΧΡΕΩΤΙΚΗ. Ο σαρωτής τρέχει ΠΡΙΝ την `delete_my_account`:
// οι πολιτικές των κάδων `inventory-docs` και `maintenance-photos` ρωτούν τα
// `user_properties` και τα `portal_links`, που η διαγραφή αδειάζει. Μετά από
// αυτήν, ο ίδιος ο χρήστης δεν έχει πια δικαίωμα στα δικά του αρχεία.
//
// ΜΕ ΤΗ ΣΥΝΕΔΡΙΑ ΤΟΥ ΧΡΗΣΤΗ, ΟΧΙ ΜΕ ΡΟΛΟ ΥΠΗΡΕΣΙΑΣ. Κάθε κάδος έχει πολιτική
// διαγραφής που ο ίδιος ο ιδιοκτήτης ικανοποιεί. Ενα κλειδί που παρακάμπτει
// την RLS δεν χρειάζεται εδώ, και μια διαδρομή που το κρατά είναι διαδρομή που
// με λάθος αναγνωριστικό σβήνει τα αρχεία οποιουδήποτε.
//
// ΜΙΑ ΑΠΟΤΥΧΙΑ ΔΕΝ ΣΤΑΜΑΤΑ ΤΗ ΔΙΑΓΡΑΦΗ. Απέναντι στέκει το δικαίωμα διαγραφής
// (άρθρο 17 GDPR): ο λογαριασμός φεύγει ούτως ή άλλως. Οσα έμειναν τα μετρά
// μετά η ίδια η βάση, τα γράφει στα `account_deletion_incidents`, και η οθόνη
// τα λέει στον άνθρωπο αντί να τον ανακατευθύνει σιωπηλά.
// ═══════════════════════════════════════════════════════════════════════════

/** Οσο χρειάζεται από τον πελάτη Supabase, ώστε η δοκιμή να μη στήνει διακομιστή. */
export type SweepClient = {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>
    }
  }
}

export type SweepResult = { deleted: number; failed: number; error: string }

/**
 * ΠΟΣΑ ΟΝΟΜΑΤΑ ΑΝΑ ΚΛΗΣΗ. Το API αποθήκευσης δέχεται πίνακα, αλλά ένα αίτημα
 * με χίλια ονόματα είναι ένα αίτημα που, αν λήξει, χάνει και τα χίλια. Με
 * εκατό, μια αποτυχία κοστίζει εκατό και τα υπόλοιπα προχωρούν.
 */
const CHUNK = 100

/** Ομαδοποίηση ανά κάδο: το API αποθήκευσης δουλεύει με έναν κάδο τη φορά. */
function byBucket(rows: readonly { bucket_id: string; name: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const r of rows) {
    if (!r || typeof r.bucket_id !== 'string' || typeof r.name !== 'string') continue
    const list = map.get(r.bucket_id)
    if (list) list.push(r.name)
    else map.set(r.bucket_id, [r.name])
  }
  return map
}

/**
 * Σβήνει κάθε αρχείο του συνδεδεμένου χρήστη. Το `error` κρατά την ΠΡΩΤΗ
 * αποτυχία: οι επόμενες είναι συνήθως η ίδια αιτία, και ένα μήνυμα που
 * απαριθμεί δέκα φορές το ίδιο δεν λέει περισσότερα.
 */
export async function sweepOwnFiles(supabase: SweepClient): Promise<SweepResult> {
  const { data, error } = await supabase.rpc('my_storage_objects')
  if (error) return { deleted: 0, failed: 0, error: error.message }

  let deleted = 0
  let failed = 0
  let first = ''
  for (const [bucket, names] of byBucket(Array.isArray(data) ? data : [])) {
    for (let i = 0; i < names.length; i += CHUNK) {
      const slice = names.slice(i, i + CHUNK)
      const out = await supabase.storage.from(bucket).remove(slice)
      if (out.error) {
        failed += slice.length
        if (!first) first = out.error.message
        continue
      }
      deleted += slice.length
    }
  }
  return { deleted, failed, error: first }
}
