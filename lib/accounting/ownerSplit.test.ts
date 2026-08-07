// Τεστ για την κατανομή συνιδιοκτητών + διαχειριστική αμοιβή (ownerSplit.ts).
import { computeSplit } from './ownerSplit'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// 2 ιδιοκτήτες 60/40, αμοιβή διαχειριστή 10% επί 1000 εισπραγμένων, έξοδα 200.
const r = computeSplit({ grossIncome: 1000, expenses: 200, managementFeePct: 10, managerName: 'ΑΕ Διαχείρισης', owners: [{ name: 'Α', pct: 60 }, { name: 'Β', pct: 40 }] })
ok('management fee = 100', r.managementFee === 100)
ok('distributable = 700', r.distributable === 700)          // 1000 - 200 - 100
ok('valid (100%)', r.valid)
ok('owner A net = 420', r.owners[0].net === 420)            // 700 * 0.6
ok('owner B net = 280', r.owners[1].net === 280)            // 700 * 0.4
ok('nets sum to distributable', r2(r.owners.reduce((s, o) => s + o.net, 0)) === 700)
ok('A income share = 600', r.owners[0].incomeShare === 600)
ok('A fee share = 60', r.owners[0].feeShare === 60)

// Στρογγυλοποίηση: 3 ιδιοκτήτες 1/3 έκαστος σε 100 → πρέπει να «κλείνει» στο 100.
const t = computeSplit({ grossIncome: 100, expenses: 0, owners: [{ name: 'Α', pct: 33.34 }, { name: 'Β', pct: 33.33 }, { name: 'Γ', pct: 33.33 }] })
ok('thirds distributable = 100', t.distributable === 100)
ok('thirds nets sum exactly to 100', r2(t.owners.reduce((s, o) => s + o.net, 0)) === 100)

// Άκυρα ποσοστά → valid=false + warning.
const bad = computeSplit({ grossIncome: 500, expenses: 0, owners: [{ name: 'Α', pct: 50 }, { name: 'Β', pct: 30 }] })
ok('invalid pct → not valid', !bad.valid)
ok('invalid pct → warning present', !!bad.warning && bad.warning.includes('80'))

// ΤΟ ΑΚΡΙΒΕΣ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ: με τυπογραφικό στα ποσοστά (50 + 30 αντί
// 50 + 50), η «διόρθωση στρογγυλοποίησης» δεν μετέφερε λεπτά αλλά ΟΛΟ το
// αδιάθετο 20%. Ο Α έπαιρνε 700,00 € αντί 500,00 € — και το άθροισμα έβγαινε
// ακριβώς 1.000,00 €, οπότε κανένας έλεγχος «κλείνει;» δεν το έπιανε.
const typo = computeSplit({ grossIncome: 1000, expenses: 0, owners: [{ name: 'Α', pct: 50 }, { name: 'Β', pct: 30 }] })
ok('άκυρα ποσοστά → κανένα φούσκωμα του μεγαλύτερου', typo.owners[0].net === 500 && typo.owners[1].net === 300)
ok('άκυρα ποσοστά → το αδιάθετο ΔΕΝ κρύβεται στο άθροισμα', r2(typo.owners.reduce((s, o) => s + o.net, 0)) === 800)
// Και προς την άλλη κατεύθυνση: υπέρβαση 100% δεν αφαιρείται από τον μεγαλύτερο.
const over = computeSplit({ grossIncome: 1000, expenses: 0, owners: [{ name: 'Α', pct: 70 }, { name: 'Β', pct: 50 }] })
ok('υπέρβαση ποσοστών → κάθε μερίδιο μένει αναλογικό', over.owners[0].net === 700 && over.owners[1].net === 500)

// Χωρίς ιδιοκτήτες → warning.
const none = computeSplit({ grossIncome: 500, expenses: 100, owners: [] })
ok('no owners → not valid', !none.valid && !!none.warning)

// Χωρίς αμοιβή διαχειριστή → fee 0, distributable = gross - expenses.
const noFee = computeSplit({ grossIncome: 800, expenses: 300, owners: [{ name: 'Α', pct: 100 }] })
ok('no fee → distributable 500', noFee.managementFee === 0 && noFee.distributable === 500)
ok('single owner gets all', noFee.owners[0].net === 500)

function r2(n: number) { return Math.round(n * 100) / 100 }

console.log(`ownerSplit.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
