// Ο απολογισμός της διαγραφής λογαριασμού: πότε σταματά ο χρήστης και τι διαβάζει.
import { strict as assert } from 'node:assert'
import { shouldStop, queued, leftoverText } from './deletionReport'

const fn = (n: number) => String(n)

// ── ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟ ΑΡΧΕΙΟ ───────────────────────────────────────
// Καθαρή διαγραφή: η διαδρομή έσβησε ό,τι υπήρχε, τίποτα δεν μπήκε στην ουρά.
// Η οθόνη σταματούσε τον χρήστη με «Δεν διαγράφηκαν 0 αρχεία».
assert.equal(shouldStop({ ok: true, files_queued: 0, files_deleted: 4 }), false, 'μηδέν στην ουρά δεν σταματά κανέναν')
assert.equal(shouldStop({ ok: true, files_queued: 0 }), false)
assert.equal(queued({ ok: true, files_queued: 0 }), false)

// Λογαριασμός χωρίς κανένα αρχείο.
assert.equal(shouldStop({ ok: true, files_queued: 0, files_deleted: 0 }), false)

// ── ΟΤΑΝ ΚΑΤΙ ΜΠΗΚΕ ΣΤΗΝ ΟΥΡΑ, ΤΟ ΛΕΕΙ ────────────────────────────────────
assert.equal(shouldStop({ ok: true, files_queued: 1 }), true)
assert.equal(shouldStop({ ok: true, files_queued: 12 }), true)

// ── ΟΤΑΝ Η ΒΑΣΗ ΔΕΝ ΕΙΔΕ ΚΑΝ ΤΑ ΑΡΧΕΙΑ ────────────────────────────────────
// «Δεν ξέρω» δεν είναι «όχι»: εδώ ο άνθρωπος πρέπει να το μάθει.
assert.equal(shouldStop({ ok: false, files_queued: 0 }), true)
assert.equal(shouldStop({ files_queued: null }), true)
assert.equal(shouldStop({}), true, 'απολογισμός χωρίς μέτρηση δεν περνά για καθαρός')

// ── ΤΑ ΛΕΚΤΙΚΑ ─────────────────────────────────────────────────────────────
assert.equal(
  leftoverText({ ok: true, files_queued: 1 }, fn),
  'Ο λογαριασμός και τα δεδομένα σου διαγράφηκαν. 1 αρχείο σβήνονται μέσα στα επόμενα λεπτά.',
)
assert.match(leftoverText({ ok: true, files_queued: 4 }, fn), /4 αρχεία σβήνονται/)
assert.match(leftoverText({ ok: false }, fn), /δεν επιβεβαιώθηκε/)
assert.match(leftoverText({ files_queued: null }, fn), /δεν μετρήθηκε/)

// Καμία διαδρομή δεν επιτρέπεται να ανακοινώσει μηδενικό πλήθος: το «0 αρχεία»
// είναι η ίδια η παρανόηση που διορθώθηκε.
for (const r of [{ ok: true, files_queued: 0 }, { ok: true, files_queued: 0, files_deleted: 9 }])
  assert.equal(shouldStop(r), false, 'κανένα κείμενο με μηδενικό πλήθος δεν φτάνει στην οθόνη')

console.log('✓ ο απολογισμός διαγραφής σταματά τον χρήστη μόνο όταν τον αφορά')
