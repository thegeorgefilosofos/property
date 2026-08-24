// Ο απολογισμός της διαγραφής λογαριασμού: πότε σταματά ο χρήστης και τι διαβάζει.
import { strict as assert } from 'node:assert'
import { shouldStop, somethingLeft, leftoverText } from './deletionReport'

const fn = (n: number) => String(n)

// ── ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟ ΑΡΧΕΙΟ ───────────────────────────────────────
// Λογαριασμός χωρίς κανένα αρχείο. Η διαγραφή του αποθηκευτικού χώρου σήκωσε
// εξαίρεση, άρα `ok:false`, αλλά πίσω δεν έμεινε τίποτα. Η οθόνη σταματούσε
// τον χρήστη με «Δεν διαγράφηκαν 0 αρχεία».
assert.equal(shouldStop({ ok: false, files_left: 0 }), false, 'μηδέν αρχεία δεν σταματούν κανέναν')
assert.equal(somethingLeft({ ok: false, files_left: 0 }), false)

// Εμεινε πραγματικά κάτι πίσω: εκεί ΠΡΕΠΕΙ να σταματήσει.
assert.equal(shouldStop({ ok: false, files_left: 1 }), true)
assert.equal(shouldStop({ ok: false, files_left: 12 }), true)

// Δεν μετρήθηκε καν. «Δεν ξέρω» δεν είναι «όχι».
assert.equal(shouldStop({ ok: false, files_left: null }), true)
assert.equal(shouldStop({ ok: false }), true)

// Καθαρή διαγραφή: καμία στάση, ό,τι κι αν λέει η μέτρηση.
assert.equal(shouldStop({ ok: true, files_left: 0 }), false)
assert.equal(shouldStop({ ok: true }), false)

// ── ΤΑ ΛΕΚΤΙΚΑ ─────────────────────────────────────────────────────────────
assert.equal(
  leftoverText(1, fn),
  'Ο λογαριασμός και τα δεδομένα σου διαγράφηκαν. Δεν διαγράφηκαν 1 αρχείο από τον αποθηκευτικό χώρο. Το περιστατικό καταγράφηκε.',
)
assert.match(leftoverText(4, fn), /Δεν διαγράφηκαν 4 αρχεία/)
assert.match(leftoverText(null, fn), /δεν επιβεβαιώθηκε/)

// Καμία διαδρομή δεν επιτρέπεται να ανακοινώσει μηδενικό πλήθος: το «0 αρχεία»
// είναι η ίδια η παρανόηση που διορθώθηκε.
for (const r of [{ ok: false, files_left: 0 }, { ok: true, files_left: 0 }])
  assert.equal(shouldStop(r), false, 'κανένα κείμενο με μηδενικό πλήθος δεν φτάνει στην οθόνη')

console.log('✓ ο απολογισμός διαγραφής σταματά τον χρήστη μόνο όταν τον αφορά')
