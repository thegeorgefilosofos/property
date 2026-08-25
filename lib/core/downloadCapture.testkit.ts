// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΛΑΣΤΟ ΕΓΓΡΑΦΟ ΤΩΝ ΣΟΥΙΤΩΝ ΕΞΑΓΩΓΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΠΙΑΣΜΕΝΟ ΣΤΟΝ ΔΡΟΜΕΑ ΚΑΙ ΟΧΙ ΕΔΩ. Δύο σουίτες έγραφαν
//
//     globalThis.URL = { createObjectURL, revokeObjectURL }
//
// δηλαδή ΑΝΤΙΚΑΘΙΣΤΟΥΣΑΝ τον κατασκευαστή URL με ένα απλό αντικείμενο. Ο κώδικας
// του κατεβάσματος δεν καλεί «new URL», οπότε τοπικά όλα έδειχναν καθαρά.
//
// Το κατέβασμα όμως φορτώνει τη βιβλιοθήκη του Excel με ΔΥΝΑΜΙΚΗ εισαγωγή και
// ο μεταγλωττιστής tsx λύνει κάθε εισαγωγή με «new URL». Στον Node 22.23 οι
// άγκιστρα φόρτωσης τρέχουν στο ΙΔΙΟ πεδίο με τη δοκιμή, οπότε έβλεπαν το
// πλαστό αντικείμενο:
//
//     TypeError: URL is not a constructor
//         at getFormatFromFileUrlSync (node_modules/tsx/dist/register-…)
//
// Στον Node 22.22, που έτρεχε τοπικά, τα ίδια άγκιστρα ζούσαν σε νήμα εργασίας
// και δεν άγγιζαν ποτέ το πλαστό. Ιδιος κώδικας, δύο εκδόσεις, μία πράσινη.
//
// Η ΛΥΣΗ. Ο αληθινός URL μένει στη θέση του και του κρεμάμε μόνο τις δύο
// μεθόδους που λείπουν από τον διακομιστή. Το «new URL» δουλεύει όπως πάντα.
//
// ΚΑΙ ΓΙΑΤΙ ΕΔΩ. Το ίδιο πλαστό έγγραφο ήταν γραμμένο δύο φορές, λέξη προς
// λέξη, σε δύο σουίτες. Η διόρθωση σε ένα σημείο σημαίνει ότι δεν μένει
// αντίγραφο με το σφάλμα μέσα.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Βάζει τις δύο μεθόδους διεύθυνσης blob πάνω στον ΑΛΗΘΙΝΟ κατασκευαστή URL.
 *
 * @returns συνάρτηση επαναφοράς, για σουίτα που συνεχίζει μετά το πλαστό.
 */
export function stubObjectUrl(create: (blob: never) => string, revoke: () => void): () => void {
  const u = globalThis.URL as unknown as Record<string, unknown>
  const before = { create: u.createObjectURL, revoke: u.revokeObjectURL }
  u.createObjectURL = create
  u.revokeObjectURL = revoke
  return () => { u.createObjectURL = before.create; u.revokeObjectURL = before.revoke }
}

/** Ενα αρχείο που «κατέβηκε»: το όνομά του και τα byte του. */
export type CaughtFile = { name: string; bytes: Uint8Array }

/**
 * Στήνει έγγραφο, Blob και διευθύνσεις blob ώστε το κατέβασμα να καταλήγει στη
 * μνήμη αντί στον δίσκο.
 *
 * @returns ο πίνακας με ό,τι κατέβηκε, σε σειρά. Γεμίζει καθώς τρέχει η σουίτα.
 */
export function captureDownloads(): CaughtFile[] {
  const caught: CaughtFile[] = []
  let pending: Uint8Array | null = null
  const g = globalThis as unknown as Record<string, unknown>

  stubObjectUrl((b: never) => { pending = (b as { __bytes: Uint8Array }).__bytes; return 'blob:test' }, () => {})

  g.Blob = class { __bytes: Uint8Array; constructor(parts: ArrayBuffer[]) { this.__bytes = new Uint8Array(parts[0]) } }

  const el = {
    href: '', download: '', style: {} as Record<string, string>,
    click() { caught.push({ name: this.download, bytes: pending as unknown as Uint8Array }) },
    remove() {},
  }
  g.document = { createElement: () => el, body: { appendChild: () => {} } }

  // Ο χρονοδιακόπτης της ανάκλησης δεν πρέπει να κρατά ζωντανή τη διεργασία.
  const realTimeout = globalThis.setTimeout
  g.setTimeout = ((fn: () => void, ms: number) => realTimeout(fn, ms).unref?.() ?? realTimeout(fn, ms)) as typeof setTimeout

  return caught
}
