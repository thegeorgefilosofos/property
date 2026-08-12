// Τεστ για τη double-entry μηχανή ημερολογίου (lib/accounting/journal.ts).
import {
  buildJournal, journalTotals, trialBalance, expenseAccount,
  journalCsvGeneric, elpFor, journalCsvQuickBooks, journalCsvXero, journalToCsv,
  auditJournal,
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
ok('generic CSV header greek (articles)', gen[0].startsWith('Αρ.Άρθρου;Ημ/νία;Κωδικός'))
ok('generic CSV has cost-centre column', gen[0].includes(';Κέντρο Κόστους'))
// ── ΤΟ ΙΔΙΟ ΕΞΟΔΟ ΚΑΙ ΣΤΟ ΣΧΕΔΙΟ ΠΟΥ ΤΡΟΦΟΔΟΤΕΙ ΤΟ Ε3 ─────────────────────────
// Η στήλη μπαίνει ΤΕΛΕΥΤΑΙΑ επίτηδες: οι αποθηκευμένες αντιστοιχίσεις των
// ελληνικών import wizards μετρούν θέσεις, και μια στήλη στη μέση θα μετακινούσε
// σιωπηλά τη χρέωση με την πίστωση σε βιβλία πελατών.
ok('generic CSV ends with the ELP column', gen[0].endsWith(';Λογαριασμός ΕΛΠ'))
{
  const idx = gen[0].split(';').indexOf('Λογαριασμός ΕΛΠ')
  const row = gen.slice(1).find(r => r.split(';')[2] === '62.03')
  ok('ρεύμα ΕΓΛΣ 62.03 → ΕΛΠ 64.02 Ενέργεια', !!row && row.split(';')[idx] === '64.02 Ενέργεια')
  ok('ελπ κωδικός για κάθε έξοδο 6x', gen.slice(1)
    .filter(r => /^6[1-5]/.test(r.split(';')[2]))
    .every(r => r.split(';')[idx].length > 0))
  // Το ταμείο και τα έσοδα δεν έχουν σωσμένη αντιστοιχία: κενό, όχι εικασία.
  ok('το ταμείο μένει κενό', gen.slice(1)
    .filter(r => r.split(';')[2] === '38.00')
    .every(r => r.split(';')[idx] === ''))
}
ok('elpFor άγνωστου κωδικού είναι κενό', elpFor('99.99') === '')
ok('elpFor δίνει κωδικό ΚΑΙ όνομα', elpFor('62.02') === '64.03 Ύδρευση')
// Αρχείο ΕΙΣΑΓΩΓΗΣ: καμία γραμμή συνόλων — θα την διάβαζε ο wizard ως κίνηση.
ok('generic CSV has NO totals row', !journalCsvGeneric(lines).includes('ΣΥΝΟΛΑ'))
ok('generic CSV row count = lines + header', gen.length === lines.length + 1)
ok('generic CSV article number in col 0', gen[1].split(';')[0] === '1')
ok('generic CSV DD/MM/YYYY date', gen[1].split(';')[1] === '05/01/2026')
ok('generic CSV comma decimals in debit col', gen[1].split(';')[5] === '500,00')
// Και οι δύο αριθμητικές στήλες πάντα συμπληρωμένες (0,00 όπου δεν υπάρχει ποσό).
ok('generic CSV zero-fills credit col', gen[1].split(';')[6] === '0,00')
ok('generic CSV carries property as cost centre', gen[1].split(';')[9] === 'Διαμ. Α')

const qb = journalCsvQuickBooks(lines).split('\r\n')
ok('QuickBooks header (Journal No + Debits/Credits)', qb[0] === 'Journal No,Journal Date,Account,Debits,Credits,Memo/Description,Name,Currency,Class')
ok('QuickBooks MM/DD/YYYY date', qb[1].split(',')[1] === '01/05/2026')
ok('QuickBooks dot decimals', qb.some(r => r.includes('.00')))
ok('QuickBooks account is code:name', qb[1].split(',')[2] === '38.00:Ταμείο / Καταθέσεις')
ok('QuickBooks states EUR currency', qb[1].split(',')[7] === 'EUR')

const xero = journalCsvXero(lines).split('\r\n')
ok('Xero header', xero[0].startsWith('*Narration,*Date'))
ok('Xero signed amounts (credit negative)', xero.some(r => /,-\d/.test(r)))
// Κρίσιμο για το Xero: ΙΔΙΑ narration σε όλα τα σκέλη ενός άρθρου → ένα journal.
const xeroArt1 = xero.slice(1).filter(r => /Άρθρο 1:/.test(r))
ok('Xero groups an article under one narration', xeroArt1.length === 2 && xeroArt1[0].split(',')[0] === xeroArt1[1].split(',')[0])
ok('Xero article amounts net to zero', Math.abs(xeroArt1.reduce((s, r) => s + Number(r.split(',')[5]), 0)) < 0.005)

ok('journalToCsv dispatch', journalToCsv(lines, 'quickbooks') === journalCsvQuickBooks(lines))

// ── Audit (πραγματικός έλεγχος ισοζυγίου) ────────────────────────────────────
const audit = auditJournal(lines, { year: 2026 })
const byKey = (k: string) => audit.checks.find(c => c.key === k)!
ok('audit ok (warn does not fail)', audit.ok === true)
ok('audit tone warning when only warns', audit.tone === 'warning')
ok('audit summary mentions readiness', /έτοιμο/i.test(audit.summary))
ok('audit balance passes', byKey('balance').status === 'pass')
ok('audit articles pass', byKey('articles').status === 'pass')
ok('audit accounts pass', byKey('accounts').status === 'pass')
ok('audit tie-out passes', byKey('tieout').status === 'pass')
ok('audit amounts pass', byKey('amounts').status === 'pass')
ok('audit dates in-period pass', byKey('dates').status === 'pass')
// 45€ σε 'unknown_cat' → πέφτει στο 64.98 → προειδοποίηση ταξινόμησης.
ok('audit classify warns on 64.98 fallback', byKey('classify').status === 'warn')

// Άγνωστος κωδικός → ο έλεγχος λογαριασμών αποτυγχάνει και audit.ok=false.
const badLines = [...lines, { date: '2026-04-01', code: '99.99', account: 'Άγνωστος', description: 'x', debit: 10, credit: 0 }, { date: '2026-04-01', code: '38.00', account: 'Ταμείο', description: 'x', debit: 0, credit: 10 }]
const badAudit = auditJournal(badLines, { year: 2026 })
ok('audit fails on unknown account', badAudit.checks.find(c => c.key === 'accounts')!.status === 'fail' && badAudit.ok === false)

// Ημερομηνία εκτός μήνα → ο έλεγχος ημερομηνιών αποτυγχάνει.
const janAudit = auditJournal(lines, { year: 2026, month: 1 })
ok('audit flags out-of-month dates', janAudit.checks.find(c => c.key === 'dates')!.status === 'fail')

// ── Δόσεις δανείου: διαχωρισμός τόκων (65) + χρεολυσίου (45) ─────────────────
const loanLines = buildJournal({ incomes: [], expenses: [], loanPayments: [{ date: '2026-05-10', amount: 751, interest: 200 }] })
ok('loan payment → 3 lines', loanLines.length === 3)
ok('loan interest on 65.00', loanLines.some(l => l.code === '65.00' && Math.abs(l.debit - 200) < 0.005))
ok('loan principal on 45.00', loanLines.some(l => l.code === '45.00' && Math.abs(l.debit - 551) < 0.005))
ok('loan credit on 38.00', loanLines.some(l => l.code === '38.00' && Math.abs(l.credit - 751) < 0.005))
ok('loan article balanced', journalTotals(loanLines).balanced)
const loanAudit = auditJournal(loanLines, { year: 2026 })
ok('loan audit ok (all pass)', loanAudit.ok === true && loanAudit.tone === 'positive')
ok('loan → no misc 64.98 warning', !loanAudit.checks.some(c => c.key === 'classify' && c.status === 'warn'))
ok('loan split check passes', loanAudit.checks.find(c => c.key === 'loansplit')!.status === 'pass')
ok('loan tie-out passes (incl. χρεολύσιο)', loanAudit.checks.find(c => c.key === 'tieout')!.status === 'pass')

// Δόση χωρίς τόκους (interest=0) → όλα στο 45, ο έλεγχος διαχωρισμού προειδοποιεί.
const unsplit = buildJournal({ incomes: [], expenses: [], loanPayments: [{ date: '2026-06-10', amount: 400, interest: 0 }] })
ok('unsplit loan → 2 lines (45 + 38)', unsplit.length === 2 && unsplit.some(l => l.code === '45.00' && l.debit === 400))
ok('unsplit loan warns on split', auditJournal(unsplit, { year: 2026 }).checks.find(c => c.key === 'loansplit')!.status === 'warn')

console.log(`journal.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
