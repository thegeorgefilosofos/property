// Τεστ για τη double-entry μηχανή ημερολογίου (lib/accounting/journal.ts).
import {
  buildJournal, journalTotals, trialBalance, expenseAccount,
  journalCsvGeneric, journalCsvQuickBooks, journalCsvXero, journalToCsv,
} from './journal'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const incomes = [
  { date: '2026-01-05', amount: 500, property: 'Διαμ. Α', party: 'Παπαδόπουλος' },
  { date: '2026-02-05', amount: 500.5, property: 'Διαμ. Α' },
]
const expenses = [
  { date: '2026-01-10', amount: 80, category: 'electricity', property: 'Διαμ. Α' },
  { date: '2026-01-15', amount: 120.25, category: 'maintenance', description: 'Επισκευή θέρμανσης' },
  { date: '2026-03-01', amount: 45, category: 'unknown_cat' },
]

const lines = buildJournal({ incomes, expenses })

// Κάθε εγγραφή παράγει 2 γραμμές (χρέωση+πίστωση).
ok('line count = 2×records', lines.length === (incomes.length + expenses.length) * 2)

// Ισοσκελισμό: Σ χρεώσεων = Σ πιστώσεων.
const t = journalTotals(lines)
ok('balanced debit=credit', t.balanced)
ok('total debit correct', Math.abs(t.debit - (500 + 500.5 + 80 + 120.25 + 45)) < 0.005)

// Ταξινόμηση κατά ημερομηνία (πρώτη = 2026-01-05).
ok('sorted by date', lines[0].date === '2026-01-05' && lines[lines.length - 1].date === '2026-03-01')

// Είσπραξη: Χρέωση 38 (ταμείο) / Πίστωση 75 (έσοδα).
const firstBank = lines.find(l => l.date === '2026-01-05' && l.debit > 0)
const firstRev = lines.find(l => l.date === '2026-01-05' && l.credit > 0)
ok('income debits bank 38.00', firstBank?.code === '38.00' && firstBank?.debit === 500)
ok('income credits revenue 75.00', firstRev?.code === '75.00' && firstRev?.credit === 500)

// Έξοδο: Χρέωση εξόδου / Πίστωση 38.
const elec = lines.find(l => l.date === '2026-01-10' && l.debit > 0)
ok('electricity → 62.03', elec?.code === '62.03')
const elecCredit = lines.find(l => l.date === '2026-01-10' && l.credit > 0)
ok('expense credits bank 38.00', elecCredit?.code === '38.00')

// Άγνωστη κατηγορία → 64.98 (διάφορα).
ok('unknown category → 64.98', expenseAccount('unknown_cat').code === '64.98')
ok('keyword fallback (νερό) → 62.02', expenseAccount('Λογαριασμός νερού').code === '62.02')

// Trial balance ισοσκελίζει (Σ balance = 0).
const tb = trialBalance(lines)
const tbSum = Math.round(tb.reduce((s, r) => s + r.balance, 0) * 100) / 100
ok('trial balance nets to zero', tbSum === 0)

// CSV formatters παράγουν σωστό αριθμό γραμμών + header.
const gen = journalCsvGeneric(lines).split('\r\n')
ok('generic CSV header greek', gen[0].startsWith('Ημερομηνία;Κωδικός'))
ok('generic CSV has totals row', gen[gen.length - 1].includes('ΣΥΝΟΛΑ'))
ok('generic CSV comma decimals in amount col', gen[1].split(';')[4] === '500,00')

const qb = journalCsvQuickBooks(lines).split('\r\n')
ok('QuickBooks header', qb[0] === 'Date,Account,Debit,Credit,Description')
ok('QuickBooks dot decimals', qb[1].includes('500.00') || qb.some(r => r.includes('.00')))

const xero = journalCsvXero(lines).split('\r\n')
ok('Xero header', xero[0].startsWith('*Narration,*Date'))
ok('Xero signed amounts (credit negative)', xero.some(r => /,-\d/.test(r)))

ok('journalToCsv dispatch', journalToCsv(lines, 'quickbooks') === journalCsvQuickBooks(lines))

console.log(`journal.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
