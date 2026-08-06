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
eq('κενό θέμα δεν αφήνει το μήνυμα να ξεκινά με άνω τελεία',
   writeErrorMessage('   ', { message: 'boom' }), 'Η αποθήκευση απέτυχε: boom')

// ── ΟΙ ΓΝΩΣΤΟΙ ΚΩΔΙΚΟΙ ΓΙΝΟΝΤΑΙ ΕΛΛΗΝΙΚΑ ─────────────────────────────────
// Το «duplicate key value violates unique constraint "…_pkey"» δεν λέει τίποτα
// σε ιδιοκτήτη ακινήτου. Το «υπάρχει ήδη εγγραφή» λέει.
eq('διπλότυπο', writeErrorMessage(WHAT, { code: '23505', message: 'duplicate key value' }),
   `${WHAT}: Υπάρχει ήδη εγγραφή με τα ίδια στοιχεία.`)
eq('πολιτική RLS', writeErrorMessage(WHAT, { code: '42501', message: 'new row violates row-level security' }),
   `${WHAT}: Δεν έχεις δικαίωμα σε αυτή την ενέργεια.`)
// Ο 42703 είναι ο κωδικός που εξαφάνιζε ολόκληρες οθόνες: ένα ερώτημα με στήλη
// που δεν υπάρχει απορρίπτεται ΟΛΟΚΛΗΡΟ, και η οθόνη δείχνει κενό αντί σφάλματος.
eq('ανύπαρκτη στήλη', writeErrorMessage(WHAT, { code: '42703', message: 'column x does not exist' }),
   `${WHAT}: Η εφαρμογή ζήτησε πεδίο που δεν υπάρχει στη βάση. Χρειάζεται ενημέρωση.`)

// ── Ο ΑΓΝΩΣΤΟΣ ΚΩΔΙΚΟΣ ΔΕΝ ΠΕΤΙΕΤΑΙ ──────────────────────────────────────
// Είναι το μόνο που κάνει το σφάλμα εντοπίσιμο όταν το αναφέρει ο χρήστης.
eq('άγνωστος κωδικός κρατιέται σε παρένθεση',
   writeErrorMessage(WHAT, { code: 'XX999', message: 'internal error' }),
   `${WHAT}: internal error (XX999)`)
eq('κωδικός χωρίς μήνυμα', writeErrorMessage(WHAT, { code: 'XX999' }), `${WHAT} (XX999)`)
eq('μήνυμα χωρίς κωδικό', writeErrorMessage(WHAT, { message: 'network down' }), `${WHAT}: network down`)
eq('ούτε το ένα ούτε το άλλο', writeErrorMessage(WHAT, {}), WHAT)
eq('κενές συμβολοσειρές δεν παράγουν σκουπίδια',
   writeErrorMessage(WHAT, { code: '', message: '' }), WHAT)
eq('null πεδία', writeErrorMessage(WHAT, { code: null, message: null }), WHAT)
eq('κενά γύρω από τον κωδικό δεν τον κρύβουν',
   writeErrorMessage(WHAT, { code: ' 23505 ', message: 'x' }),
   `${WHAT}: Υπάρχει ήδη εγγραφή με τα ίδια στοιχεία.`)

// ── ΤΟ ΜΗΝΥΜΑ ΤΕΛΕΙΩΝΕΙ ΠΑΝΤΑ ΚΑΠΟΥ ──────────────────────────────────────
ok('ποτέ κενό', [null, {}, { code: 'X' }, { message: 'y' }]
  .every(e => writeErrorMessage(WHAT, e as never).trim().length > 0))
ok('πάντα ξεκινά με το τι δεν έγινε', [null, {}, { code: '23505' }, { message: 'y' }]
  .every(e => writeErrorMessage(WHAT, e as never).startsWith(WHAT)))

console.log(fail === 0 ? `✓ writeResult: ${pass} έλεγχοι πέρασαν` : `✗ writeResult: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
