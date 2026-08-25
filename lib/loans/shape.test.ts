// npx tsx lib/loans/shape.test.ts
//
// Κάθε έλεγχος εδώ προστατεύει ένα νούμερο που ο ιδιοκτήτης δίνει στον λογιστή
// του. Το σφάλμα που τον γέννησε: οκτώ αρχεία ζητούσαν στήλες `amount`/`rate`
// που ΔΕΝ υπάρχουν, το PostgREST απέρριπτε ολόκληρο το ερώτημα και οι
// εκπιπτόμενοι τόκοι δανείου εμφανίζονταν 0 € στη Λογιστική.
import { effectiveRate, loanAmount, isActiveLoan, toLoanView, toLoanViews, toLoanRow, LOAN_COLUMNS } from './shape'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

// ── Το επιτόκιο δεν είναι αποθηκευμένος αριθμός ────────────────────────────
ok('σταθερό → fixed_rate', near(effectiveRate({ rate_type: 'fixed', fixed_rate: 3.4, euribor: 2.3, spread: 1.5 }), 3.4))
ok('κυμαινόμενο → euribor + spread', near(effectiveRate({ rate_type: 'variable', fixed_rate: 3.4, euribor: 2.3, spread: 1.5 }), 3.8))
ok('μεικτό → σταθερό όσο υπάρχει', near(effectiveRate({ rate_type: 'mixed', fixed_rate: 2.9, euribor: 2.3, spread: 1.5 }), 2.9))
ok('μεικτό χωρίς σταθερό → κυμαινόμενο', near(effectiveRate({ rate_type: 'mixed', euribor: 2.3, spread: 1.5 }), 3.8))
ok('χωρίς τίποτα → 0, όχι NaN', effectiveRate({}) === 0)
ok('null τιμές → 0, όχι NaN', effectiveRate({ fixed_rate: null, euribor: null, spread: null }) === 0)

// ΤΟ ΚΥΜΑΙΝΟΜΕΝΟ ΔΕΝ ΠΑΓΩΝΕΙ. Αν αποθηκεύαμε το επιτόκιο ως αριθμό, η επόμενη
// αναπροσαρμογή του Euribor θα το διέψευδε σιωπηλά. Εδώ ακολουθεί την αγορά.
{
  const loan = { rate_type: 'variable', euribor: 2.30, spread: 1.50 }
  ok('Euribor 2,30 + spread 1,50 = 3,80', near(effectiveRate(loan), 3.80))
  ok('Euribor ανεβαίνει στο 3,10 → 4,60', near(effectiveRate({ ...loan, euribor: 3.10 }), 4.60))
}

// ── Το ποσό λέγεται loan_amount ────────────────────────────────────────────
ok('loan_amount → amount', loanAmount({ loan_amount: 180000 }) === 180000)
ok('κενό → 0', loanAmount({}) === 0)

// ── Κατάσταση: η απουσία σημαίνει ενεργό ───────────────────────────────────
// Πριν το migration η στήλη δεν υπήρχε καθόλου· κάθε υπάρχον δάνειο είναι
// ενεργό, γιατί ποτέ δεν υπήρξε τρόπος να σημανθεί εξοφλημένο.
ok('χωρίς status → ενεργό', isActiveLoan({}))
ok('active → ενεργό', isActiveLoan({ status: 'active' }))
ok('paid_off → ΟΧΙ ενεργό', !isActiveLoan({ status: 'paid_off' }))

// ── Η πλήρης μετάφραση ─────────────────────────────────────────────────────
{
  const row = { id: 'l1', bank: 'Eurobank', loan_amount: 180000, rate_type: 'variable', euribor: 2.3, spread: 1.5, years: 25, property_value: 240000, status: 'active' }
  const v = toLoanView(row)
  ok('amount υπολογίζεται', v.amount === 180000)
  ok('rate υπολογίζεται', near(v.rate, 3.8))
  ok('τα υπόλοιπα πεδία μένουν', v.bank === 'Eurobank' && v.years === 25)
  // Δείκτης δανείου προς αξία — το νούμερο που έδειχνε ΠΑΝΤΑ 0 στο ROI.
  ok('LTV = 75%', near((v.amount / (v.property_value || 1)) * 100, 75))
}
ok('null λίστα → κενή, όχι σφάλμα', toLoanViews(null).length === 0)
ok('λίστα μεταφράζεται όλη', toLoanViews([{ loan_amount: 1 }, { loan_amount: 2 }]).map(l => l.amount).join() === '1,2')

// ── Η αντίστροφη πορεία: αποθήκευση ────────────────────────────────────────
{
  const r = toLoanRow({ amount: 150000, rate: 3.5, rate_type: 'fixed', bank: 'Alpha' })
  ok('amount → loan_amount', r.loan_amount === 150000)
  ok('σταθερό rate → fixed_rate', r.fixed_rate === 3.5)
  ok('δεν γράφεται στήλη amount', !('amount' in r))
  ok('δεν γράφεται στήλη rate', !('rate' in r))
}
{
  // Κυμαινόμενο: ο χρήστης δίνει συνολικό επιτόκιο· η τράπεζα ορίζει το spread,
  // ο Euribor είναι αγοραίος. Άρα το spread είναι η διαφορά.
  const r = toLoanRow({ amount: 100000, rate: 3.8, rate_type: 'variable', euribor: 2.3 })
  ok('κυμαινόμενο → spread = rate − euribor', near(r.spread ?? -1, 1.5))
  ok('δεν πειράζει το fixed_rate', r.fixed_rate === undefined)
}
ok('αρνητικό spread δεν γράφεται', (toLoanRow({ rate: 1, rate_type: 'variable', euribor: 3 }).spread ?? -1) === 0)

// ── Η λίστα στηλών δεν περιέχει ανύπαρκτες ─────────────────────────────────
// Αυτό ακριβώς ήταν το σφάλμα: `select('amount,rate,years')`.
ok('η LOAN_COLUMNS δεν ζητά amount', !/\bamount\b/.test(LOAN_COLUMNS.replace('loan_amount', '')))
ok('η LOAN_COLUMNS δεν ζητά σκέτο rate', !/(^|,)rate(,|$)/.test(LOAN_COLUMNS))
ok('η LOAN_COLUMNS ζητά loan_amount', LOAN_COLUMNS.includes('loan_amount'))

console.log(fail === 0 ? `✓ loans/shape: ${pass} έλεγχοι πέρασαν` : `✗ loans/shape: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
