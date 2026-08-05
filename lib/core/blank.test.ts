// npx tsx lib/core/blank.test.ts
//
// ΤΟ ΜΗΔΕΝ ΠΟΥ ΔΕΝ ΜΕΤΡΗΣΕ ΤΙΠΟΤΑ.
// Το `isBlankMetric` κρίνει αν μια σειρά πλακιδίων θα εμφανιστεί καθόλου. Αν
// γυρίσει `true` κατά λάθος, μια πραγματική μέτρηση εξαφανίζεται από την οθόνη —
// σφάλμα χειρότερο από το μηδενικό που ήρθε να διορθώσει. Γι' αυτό ελέγχονται
// ρητά και οι δύο κατευθύνσεις: τι κρύβεται ΚΑΙ τι δεν επιτρέπεται να κρυφτεί.
import { isBlankMetric, fe, fp, fn, feOr, fpOr, DASH } from './format'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

// ── Κενό: απουσία μέτρησης ────────────────────────────────────────────────
ok('παύλα', isBlankMetric(DASH))
ok('ενωτικό', isBlankMetric('-'))
ok('μεσαία παύλα', isBlankMetric('–'))
ok('κενή συμβολοσειρά', isBlankMetric(''))
ok('μόνο κενά', isBlankMetric('   '))
ok('παύλα με κενά', isBlankMetric(` ${DASH} `))

// ── Κενό: μετρήσαμε, δεν υπάρχει τίποτα ───────────────────────────────────
ok('σκέτο μηδέν', isBlankMetric('0'))
ok('ευρώ μηδέν', isBlankMetric(fe(0)))
ok('ευρώ μηδέν χωρίς δεκαδικά', isBlankMetric(fe(0, 0)))
ok('ποσοστό μηδέν', isBlankMetric(fp(0)))
ok('αριθμός μηδέν', isBlankMetric(fn(0)))
ok('σύνθετο μηδέν', isBlankMetric(`0 · ${fe(0, 0)}`))
ok('κλάσμα μηδέν', isBlankMetric('0/0'))
ok('μηδέν με μονάδα', isBlankMetric('0 τ.μ.'))

// ── ΟΧΙ κενό: υπάρχει μέτρηση ─────────────────────────────────────────────
ok('λεπτά μόνο', !isBlankMetric(fe(0.5)))
ok('μικρό ποσοστό', !isBlankMetric(fp(0.1)))
ok('ένα', !isBlankMetric('1'))
ok('χιλιάδες', !isBlankMetric(fe(1234.5)))
ok('έτος', !isBlankMetric('2025'))
ok('κλάσμα με πρόοδο', !isBlankMetric('0/3'))
ok('μηδέν από τρία', !isBlankMetric('0 από 3'))

// ── ΟΧΙ κενό: κείμενο είναι απάντηση, όχι απουσία ─────────────────────────
// Χωρίς αυτόν τον κανόνα, μια σειρά με καταστάσεις («Ενεργό», «Ελεύθερο»)
// —που δεν έχει κανένα ψηφίο— θα εξαφανιζόταν ολόκληρη.
ok('κατάσταση', !isBlankMetric('Ενεργό'))
ok('ελεύθερο', !isBlankMetric('Ελεύθερο'))
ok('όχι', !isBlankMetric('Όχι'))
ok('παύλα μέσα σε λέξη', !isBlankMetric('Μη-ενεργό'))

// ── Ανθεκτικότητα ─────────────────────────────────────────────────────────
ok('null χωρίς κατάρρευση', isBlankMetric(null as unknown as string))
ok('undefined χωρίς κατάρρευση', isBlankMetric(undefined as unknown as string))

// ── Συμφωνία με τους τύπους που παράγουν τις τιμές ────────────────────────
// Ό,τι γράφει το `feOr`/`fpOr` για άγνωστη τιμή πρέπει να το αναγνωρίζει ο
// έλεγχος — αλλιώς οι δύο πλευρές του ίδιου κανόνα θα αποκλίνουν σιωπηλά.
ok('feOr(null) είναι κενό', isBlankMetric(feOr(null)))
ok('fpOr(null) είναι κενό', isBlankMetric(fpOr(null)))
ok('feOr(0) είναι κενό', isBlankMetric(feOr(0)))
ok('feOr(12) δεν είναι κενό', !isBlankMetric(feOr(12)))

// ── Ο κανόνας της σειράς: κρύβεται μόνο όταν ΟΛΑ είναι κενά ───────────────
const rowBlank = (vals: string[]) => vals.length > 0 && vals.every(isBlankMetric)
ok('άδειο Αρχείο κρύβεται', rowBlank(['0', '0', '0', DASH]))
ok('ένα νούμερο κρατά τη σειρά', !rowBlank(['0', '0', '0', fe(80)]))
ok('μηδέν εκκρεμότητες δίπλα σε έσοδα μένουν', !rowBlank([fe(1200), '0']))

console.log(fail === 0 ? `✓ blank: ${pass} έλεγχοι πέρασαν` : `✗ blank: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
