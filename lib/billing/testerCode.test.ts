// npx tsx lib/billing/testerCode.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΠΟΙΟΣ ΠΑΙΡΝΕΙ ΤΟ ΠΡΟΪΟΝ ΔΩΡΕΑΝ.
// Ο κωδικός των δοκιμαστών δίνει ολόκληρη την εφαρμογή χωρίς κάρτα και χωρίς
// συνδρομή. Μια χαλαρή σύγκριση εδώ δεν είναι κομψότητα — είναι δωρεάν προϊόν
// σε όποιον μαντέψει.
import { normalizeCode, testerCodeMatches, testerCodeIsSet, TESTER_CODE_ENV } from './testerCode'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const ENV = { TESTER_CODE: 'PROPERTYTESTER' }

ok('το όνομα της μεταβλητής γράφεται μία φορά', TESTER_CODE_ENV === 'TESTER_CODE')

// ── Η ΚΑΝΟΝΙΚΟΠΟΙΗΣΗ ──────────────────────────────────────────────────────
ok('τα πεζά ανεβαίνουν', normalizeCode('propertytester') === 'PROPERTYTESTER')
ok('τα κενά φεύγουν', normalizeCode('  PROPERTY TESTER ') === 'PROPERTYTESTER')
// ΤΟ ΕΛΛΗΝΙΚΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΔΕΝ ΕΙΝΑΙ ΛΑΘΟΣ ΤΟΥ ΧΡΗΣΤΗ. Ο δοκιμαστής γράφει
// ελληνικά όλη μέρα· με ανοιχτή τη διάταξη, το «PROPERTYTESTER» βγαίνει έτσι.
ok('η ελληνική διάταξη μεταφράζεται', normalizeCode('ΠΡΟΠΕΡΤΥΤΕΣΤΕΡ') === 'PROPERTYTESTER')
ok('και με πεζά ελληνικά', normalizeCode('προπερτυτεστερ') === 'PROPERTYTESTER')
ok('οι τόνοι δεν είναι απόφαση του χρήστη', normalizeCode('ΠΡΌΠΕΡΤΥΤΕΣΤΕΡ') === 'PROPERTYTESTER')
// Το τελικό «ς» κάθεται σε ΑΛΛΟ πλήκτρο από το «σ» (W και S), και μετά τα
// κεφαλαία γίνονται και τα δύο «Σ»: η πληροφορία χάνεται αν δεν διαβαστεί πρώτη.
ok('το τελικό σίγμα είναι W', normalizeCode('ς') === 'W')
ok('το κανονικό σίγμα είναι S', normalizeCode('σ') === 'S' && normalizeCode('Σ') === 'S')
ok('όλα τα γράμματα της διάταξης γυρίζουν',
  normalizeCode('ΑΒΨΔΕΦΓΗΙΞΚΛΜΝΟΠΡΣΤΘΩΧΥΖ') === 'ABCDEFGHIJKLMNOPRSTUVXYZ')
ok('το κενό μένει κενό', normalizeCode('') === '' && normalizeCode('   ') === '')
ok('ό,τι δεν είναι κείμενο δεν γίνεται κωδικός',
  normalizeCode(null) === '' && normalizeCode(42) === '' && normalizeCode(undefined) === '')

// ── Η ΣΥΓΚΡΙΣΗ ────────────────────────────────────────────────────────────
ok('ο σωστός κωδικός περνά', testerCodeMatches('PROPERTYTESTER', ENV))
ok('με πεζά περνά', testerCodeMatches('propertytester', ENV))
ok('με ελληνική διάταξη περνά', testerCodeMatches('ΠΡΟΠΕΡΤΥΤΕΣΤΕΡ', ENV))
ok('με κενά περνά', testerCodeMatches(' property tester ', ENV))
ok('λάθος κωδικός δεν περνά', !testerCodeMatches('PROPERTY', ENV))
ok('πρόθεμα δεν περνά', !testerCodeMatches('PROPERTYTESTE', ENV))
ok('επίθεμα δεν περνά', !testerCodeMatches('PROPERTYTESTERR', ENV))
ok('κενό δεν περνά', !testerCodeMatches('', ENV) && !testerCodeMatches(null, ENV))

// ΚΕΝΗ ΜΕΤΑΒΛΗΤΗ ΔΕΝ ΤΑΙΡΙΑΖΕΙ ΜΕ ΤΙΠΟΤΑ. Αλλιώς ένα ξεχασμένο `TESTER_CODE`
// θα έκανε το ΚΕΝΟ ΠΕΔΙΟ κλειδί για ολόκληρο το προϊόν — και θα το έβρισκε ο
// πρώτος που θα πάταγε «Εξαργύρωση» χωρίς να γράψει τίποτα.
ok('χωρίς ορισμένο κωδικό, τίποτα δεν περνά',
  !testerCodeMatches('', {}) && !testerCodeMatches('PROPERTYTESTER', {}) && !testerCodeMatches('οτιδήποτε', {}))
ok('και με κενή τιμή το ίδιο',
  !testerCodeMatches('', { TESTER_CODE: '   ' }) && !testerCodeMatches('   ', { TESTER_CODE: '   ' }))
ok('η ύπαρξη του κωδικού λέγεται ξεχωριστά',
  testerCodeIsSet(ENV) && !testerCodeIsSet({}) && !testerCodeIsSet({ TESTER_CODE: '  ' }))

console.log(fail === 0 ? `✓ testerCode: ${pass} έλεγχοι πέρασαν` : `✗ testerCode: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
