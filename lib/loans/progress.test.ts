// npx tsx lib/loans/progress.test.ts
//
// ΤΟ ΥΠΟΛΟΙΠΟ ΕΙΝΑΙ Ο ΕΝΑΣ ΑΡΙΘΜΟΣ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΣΩΣΤΟΣ.
// Αν το υπόλοιπο πέσει έξω, ο ιδιοκτήτης παίρνει απόφαση αναχρηματοδότησης πάνω
// σε λάθος νούμερο. Οι έλεγχοι εδώ σταυρώνουν τον υπολογισμό με ανεξάρτητο
// τρόπο (τύπος παρούσας αξίας), αντί να επαναλαμβάνουν τον ίδιο βρόχο.
import { loanProgress, monthlyPayment, monthsBetween, addMonths } from './progress'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const near = (n: string, a: number, b: number, tol = 0.01) => {
  const c = Math.abs(a - b) <= tol
  if (!c) console.error(`✗ ${n}\n    περίμενα ${b}, πήρα ${a} (διαφορά ${Math.abs(a - b)})`)
  if (c) pass++; else fail++
}
const eq = (n: string, a: unknown, b: unknown) => {
  const c = JSON.stringify(a) === JSON.stringify(b)
  if (!c) console.error(`✗ ${n}\n    περίμενα ${JSON.stringify(b)}, πήρα ${JSON.stringify(a)}`)
  if (c) pass++; else fail++
}

// ── Ημερολογιακοί μήνες ───────────────────────────────────────────────────
eq('ίδια μέρα, μηδέν μήνες', monthsBetween('2026-08-05', '2026-08-05'), 0)
eq('ένας μήνας ακριβώς', monthsBetween('2026-07-05', '2026-08-05'), 1)
eq('μία μέρα πριν δεν μετράει', monthsBetween('2026-07-05', '2026-08-04'), 0)
eq('ένας χρόνος', monthsBetween('2025-08-05', '2026-08-05'), 12)
eq('πέρασμα έτους', monthsBetween('2025-12-20', '2026-01-20'), 1)
eq('μελλοντική έναρξη μετράει αρνητικά', monthsBetween('2027-01-01', '2026-08-05'), -5)
eq('χωρίς ημερομηνία', monthsBetween(null, '2026-08-05'), null)
eq('σκουπίδια', monthsBetween('χθες', '2026-08-05'), null)
eq('άκυρος μήνας', monthsBetween('2026-13-01', '2026-08-05'), null)

// ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΝΕΤΑΙ: η οθόνη μετρούσε ημέρες/30,44.
{
  const days = (new Date('2046-08-05').getTime() - new Date('2026-08-05').getTime()) / 86400000
  const approx = Math.floor(days / 30.44)
  const exact = monthsBetween('2026-08-05', '2046-08-05')!
  eq('η ημερολογιακή μέτρηση δίνει ακριβώς 240', exact, 240)
  ok('η προσέγγιση 30,44 έπεφτε έξω σε 20 χρόνια', approx !== exact)
}

// ── Η δόση ────────────────────────────────────────────────────────────────
// Σταυρωτός έλεγχος: η παρούσα αξία των δόσεων πρέπει να ισούται με το κεφάλαιο.
{
  const amount = 200_000, rate = 4.2, years = 25
  const m = monthlyPayment(amount, rate, years)
  const r = rate / 100 / 12, n = years * 12
  const pv = m * (1 - Math.pow(1 + r, -n)) / r
  near('η παρούσα αξία των δόσεων ισούται με το κεφάλαιο', pv, amount, 0.01)
}
near('μηδενικό επιτόκιο: κεφάλαιο διά μήνες', monthlyPayment(120_000, 0, 10), 1000, 0.001)
eq('μηδενικό ποσό', monthlyPayment(0, 4, 20), 0)
eq('μηδενικά έτη', monthlyPayment(100_000, 4, 0), 0)
eq('NaN δεν διαρρέει', monthlyPayment(NaN as number, 4, 20), 0)

// ── Η θέση σήμερα ─────────────────────────────────────────────────────────
const L = { amount: 200_000, annualRatePct: 4.2, years: 25 }

{
  // Την πρώτη μέρα δεν έχει πληρωθεί καμία δόση: το υπόλοιπο είναι το κεφάλαιο.
  const p = loanProgress({ ...L, startDate: '2026-08-05', today: '2026-08-05' })!
  eq('καμία δόση', p.paidMonths, 0)
  near('υπόλοιπο = κεφάλαιο', p.balance, 200_000)
  near('τίποτα εξοφλημένο', p.percentRepaid, 0)
  near('κανένας τόκος', p.interestPaid, 0)
  eq('300 δόσεις συνολικά', p.totalMonths, 300)
}
{
  // Στο τέλος: το υπόλοιπο μηδενίζεται και ΔΕΝ γίνεται αρνητικό.
  const p = loanProgress({ ...L, startDate: '2026-08-05', today: '2051-08-05' })!
  eq('όλες οι δόσεις', p.paidMonths, 300)
  eq('καμία δόση δεν απομένει', p.remainingMonths, 0)
  near('υπόλοιπο μηδέν', p.balance, 0, 0.5)
  ok('ΠΟΤΕ αρνητικό υπόλοιπο', p.balance >= 0)
  near('εξοφλημένο 100%', p.percentRepaid, 100, 0.01)
  near('κανένας τόκος δεν απομένει', p.interestRemaining, 0, 0.5)
}
{
  // Και πολύ μετά το τέλος — δεν συνεχίζει να «πληρώνει».
  const p = loanProgress({ ...L, startDate: '2026-08-05', today: '2099-01-01' })!
  eq('δεν ξεπερνά τις συνολικές δόσεις', p.paidMonths, 300)
  ok('υπόλοιπο μηδέν, όχι αρνητικό', p.balance >= 0 && p.balance < 0.5)
}
{
  // Δάνειο που υπογράφτηκε αλλά δεν ξεκίνησε.
  const p = loanProgress({ ...L, startDate: '2027-01-01', today: '2026-08-05' })!
  eq('μελλοντική έναρξη: καμία δόση', p.paidMonths, 0)
  near('υπόλοιπο = κεφάλαιο', p.balance, 200_000)
}
{
  // ΤΟ ΚΥΡΙΟ ΣΕΝΑΡΙΟ: οκτώ χρόνια μέσα σε εικοσιπενταετές δάνειο.
  const p = loanProgress({ ...L, startDate: '2018-08-05', today: '2026-08-05' })!
  eq('96 δόσεις', p.paidMonths, 96)
  eq('204 απομένουν', p.remainingMonths, 204)
  ok('χρωστάει ακόμη λιγότερα από το αρχικό', p.balance < 200_000)
  ok('αλλά ΠΟΛΥ περισσότερα από το μισό', p.balance > 140_000)
  // Ο πραγματικός λόγος που υπάρχει αυτή η οθόνη: στα πρώτα χρόνια πληρώνεις
  // κυρίως τόκους. Μετά από 8 από τα 25 χρόνια (32% του χρόνου) έχει εξοφληθεί
  // πολύ λιγότερο από το 32% του κεφαλαίου.
  ok('η πρόοδος υπολείπεται του χρόνου', p.percentRepaid < (96 / 300) * 100)
  ok('οι τόκοι που πληρώθηκαν ξεπερνούν το κεφάλαιο που εξοφλήθηκε',
     p.interestPaid > p.principalPaid)
  near('κεφάλαιο + υπόλοιπο = αρχικό', p.principalPaid + p.balance, 200_000, 0.01)
}
{
  // Μηδενικό επιτόκιο: ευθεία γραμμή, κανένας τόκος πουθενά.
  const p = loanProgress({ amount: 120_000, annualRatePct: 0, years: 10, startDate: '2021-08-05', today: '2026-08-05' })!
  eq('60 δόσεις', p.paidMonths, 60)
  near('ακριβώς το μισό', p.balance, 60_000, 0.01)
  near('κανένας τόκος', p.interestPaid, 0, 0.001)
  near('κανένας τόκος μπροστά', p.interestRemaining, 0, 0.01)
}

// ── Πότε ΔΕΝ απαντά ───────────────────────────────────────────────────────
// Κενό αντί για ψεύτικο μηδέν: «0 € υπόλοιπο» θα διαβαζόταν ως εξοφλημένο.
eq('χωρίς ημερομηνία έναρξης', loanProgress({ ...L, startDate: null, today: '2026-08-05' }), null)
eq('χωρίς ποσό', loanProgress({ ...L, amount: 0, startDate: '2020-01-01', today: '2026-08-05' }), null)
eq('χωρίς διάρκεια', loanProgress({ ...L, years: 0, startDate: '2020-01-01', today: '2026-08-05' }), null)
eq('άκυρη ημερομηνία', loanProgress({ ...L, startDate: 'πέρσι', today: '2026-08-05' }), null)

// ── Η λήξη ────────────────────────────────────────────────────────────────
eq('25 χρόνια μπροστά', addMonths('2026-08-05', 300), '2051-08-05')
eq('ένας μήνας', addMonths('2026-08-05', 1), '2026-09-05')
eq('πέρασμα έτους', addMonths('2026-12-15', 1), '2027-01-15')
// 31 Ιανουαρίου + 1 μήνας δεν είναι 31 Φεβρουαρίου.
eq('η ημέρα δεν ξεφεύγει από τον μήνα', addMonths('2026-01-31', 1), '2026-02-28')
eq('δίσεκτο έτος', addMonths('2028-01-31', 1), '2028-02-29')
eq('χωρίς ημερομηνία', addMonths(null, 12), null)

{
  const p = loanProgress({ ...L, startDate: '2018-08-05', today: '2026-08-05' })!
  eq('η λήξη είναι 25 χρόνια μετά την έναρξη', p.endDate, '2043-08-05')
  ok('δηλώνει ότι είναι εκτίμηση', p.estimated === true)
}

console.log(fail === 0 ? `✓ progress: ${pass} έλεγχοι πέρασαν` : `✗ progress: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
