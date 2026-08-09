// npx tsx lib/supabase/writeResult.test.ts
//
// Το μήνυμα αποτυχίας είναι το ΜΟΝΟ πράγμα που θα δει ο χρήστης όταν χαθεί μια
// αποθήκευση. Αν βγει κενό ή ακατανόητο, το σφάλμα παραμένει αόρατο — δηλαδή
// δεν έχει διορθωθεί τίποτα, απλώς μετακινήθηκε.
import { writeErrorMessage } from './writeResult'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n} (${JSON.stringify(got)} = ${JSON.stringify(want)})`, got === want)

const WHAT = 'Η εκκρεμότητα δεν αποθηκεύτηκε'

// ── ΤΟ «ΤΙ» ΛΕΓΕΤΑΙ ΠΑΝΤΑ ────────────────────────────────────────────────
eq('χωρίς σφάλμα, μόνο το θέμα', writeErrorMessage(WHAT, null), WHAT)
eq('χωρίς σφάλμα και χωρίς θέμα, εφεδρική πρόταση',
   writeErrorMessage('', null), 'Η αποθήκευση απέτυχε')
eq('κενό θέμα δεν αφήνει το μήνυμα να ξεκινά με τελεία',
   writeErrorMessage('   ', { message: 'boom' }), 'Η αποθήκευση απέτυχε. Δοκίμασε ξανά.')

// ── ΟΙ ΓΝΩΣΤΟΙ ΚΩΔΙΚΟΙ ΓΙΝΟΝΤΑΙ ΕΛΛΗΝΙΚΑ ─────────────────────────────────
// Το «duplicate key value violates unique constraint "…_pkey"» δεν λέει τίποτα
// σε ιδιοκτήτη ακινήτου. Το «υπάρχει ήδη εγγραφή» λέει.
eq('διπλότυπο', writeErrorMessage(WHAT, { code: '23505', message: 'duplicate key value' }),
   `${WHAT}. Υπάρχει ήδη καταχώρηση με αυτά τα στοιχεία.`)
eq('πολιτική RLS', writeErrorMessage(WHAT, { code: '42501', message: 'new row violates row-level security' }),
   `${WHAT}. Δεν έχεις δικαίωμα σε αυτή την εγγραφή.`)
// Ο 42703 είναι ο κωδικός που εξαφάνιζε ολόκληρες οθόνες: ένα ερώτημα με στήλη
// που δεν υπάρχει απορρίπτεται ΟΛΟΚΛΗΡΟ, και η οθόνη δείχνει κενό αντί σφάλματος.
eq('ανύπαρκτη στήλη', writeErrorMessage(WHAT, { code: '42703', message: 'column x does not exist' }),
   `${WHAT}. Η εφαρμογή ζήτησε πεδίο που δεν υπάρχει στη βάση. Χρειάζεται ενημέρωση.`)

// ── Ο ΑΓΝΩΣΤΟΣ ΚΩΔΙΚΟΣ ΚΡΑΤΙΕΤΑΙ, ΤΟ ΑΓΓΛΙΚΟ ΚΕΙΜΕΝΟ ΟΧΙ ────────────────
// Ο κωδικός είναι το μόνο που κάνει το σφάλμα εντοπίσιμο όταν το αναφέρει ο
// χρήστης. Το αγγλικό κείμενο δεν του λέει τίποτα — και το είχε δει, γιατί
// αυτή η συνάρτηση καλύπτει 163 γραψίματα.
eq('άγνωστος κωδικός κρατιέται, χωρίς το αγγλικό κείμενο',
   writeErrorMessage(WHAT, { code: 'XX999', message: 'internal error' }),
   `${WHAT}. Δοκίμασε ξανά. (κωδικός XX999)`)
eq('κωδικός χωρίς μήνυμα', writeErrorMessage(WHAT, { code: 'XX999' }), `${WHAT}. Δοκίμασε ξανά. (κωδικός XX999)`)
eq('άγνωστο μήνυμα χωρίς κωδικό', writeErrorMessage(WHAT, { message: 'boom' }), `${WHAT}. Δοκίμασε ξανά.`)
// Το χαμένο δίκτυο ΑΝΑΓΝΩΡΙΖΕΤΑΙ πλέον: είναι η μόνη κατηγορία σφάλματος που
// ο χρήστης μπορεί να διορθώσει μόνος του, και γραφόταν στα αγγλικά.
eq('χαμένο δίκτυο, στα ελληνικά', writeErrorMessage(WHAT, { message: 'Failed to fetch' }),
   `${WHAT}. Δεν υπάρχει σύνδεση στο διαδίκτυο. Έλεγξε το δίκτυο και δοκίμασε ξανά.`)
eq('ούτε το ένα ούτε το άλλο', writeErrorMessage(WHAT, {}), `${WHAT}. Δοκίμασε ξανά.`)
eq('κενές συμβολοσειρές δεν παράγουν σκουπίδια',
   writeErrorMessage(WHAT, { code: '', message: '' }), `${WHAT}. Δοκίμασε ξανά.`)
eq('null πεδία', writeErrorMessage(WHAT, { code: null, message: null }), `${WHAT}. Δοκίμασε ξανά.`)
eq('κενά γύρω από τον κωδικό δεν τον κρύβουν',
   writeErrorMessage(WHAT, { code: ' 23505 ', message: 'x' }),
   `${WHAT}. Υπάρχει ήδη καταχώρηση με αυτά τα στοιχεία.`)

// ── ΤΟ ΜΗΝΥΜΑ ΤΕΛΕΙΩΝΕΙ ΠΑΝΤΑ ΚΑΠΟΥ ──────────────────────────────────────
ok('ποτέ κενό', [null, {}, { code: 'X' }, { message: 'y' }]
  .every(e => writeErrorMessage(WHAT, e as never).trim().length > 0))
ok('πάντα ξεκινά με το τι δεν έγινε', [null, {}, { code: '23505' }, { message: 'y' }]
  .every(e => writeErrorMessage(WHAT, e as never).startsWith(WHAT)))

// ── ΚΑΙ ΕΔΩ: ΚΑΜΙΑ ΑΓΓΛΙΚΗ ΛΕΞΗ ─────────────────────────────────────────
ok('κανένα αγγλικό κείμενο σφάλματος δεν διαφεύγει',
  [{ code: '23505', message: 'duplicate key value violates unique constraint' },
   { message: 'network down' }, { message: 'JWT expired' },
   { code: 'XX999', message: 'internal error' }, {}, null]
  .every(e => !/[A-Za-z]{4,}/.test(writeErrorMessage(WHAT, e as never))))

console.log(fail === 0 ? `✓ writeResult: ${pass} έλεγχοι πέρασαν` : `✗ writeResult: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
