// Τεστ για τη double-entry μηχανή ημερολογίου (lib/accounting/journal.ts).
import {
  buildJournal, journalTotals, trialBalance, expenseAccount,
  journalCsvGeneric, journalCsvQuickBooks, journalCsvXero, journalToCsv,
  auditJournal, ACCOUNTS,
} from './journal'
import { ELP_ALL, elpAccountFor, eglsOf } from '../tax/elpAccounts'

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

// ── ΤΟ ΣΧΕΔΙΟ ΕΙΝΑΙ ΤΟΥ ΝΟΜΟΥ, ΚΑΙ ΕΙΝΑΙ ΕΝΑ ───────────────────────────────────
// Είσπραξη: Χρέωση 38 (ταμειακά διαθέσιμα) / Πίστωση 71.04 (άλλα λειτουργικά
// έσοδα — εκεί στέλνει το Παράρτημα Ε ολόκληρη την ομάδα 75 του ΕΓΛΣ, τα
// «έσοδα παρεπόμενων ασχολιών», όπου ανήκουν και τα μισθώματα).
const firstBank = lines.find(l => l.date === '2026-01-05' && l.debit > 0)
const firstRev = lines.find(l => l.date === '2026-01-05' && l.credit > 0)
ok('income debits cash 38', firstBank?.code === '38' && firstBank?.debit === 500)
ok('income credits revenue 71.04', firstRev?.code === '71.04' && firstRev?.credit === 500)

// Έξοδο: Χρέωση εξόδου / Πίστωση 38.
const elec = lines.find(l => l.date === '2026-01-10' && l.debit > 0)
ok('electricity → 64.02 Ενέργεια', elec?.code === '64.02' && elec?.account === 'Ενέργεια')
const elecCredit = lines.find(l => l.date === '2026-01-10' && l.credit > 0)
ok('expense credits cash 38', elecCredit?.code === '38')

// Άγνωστη κατηγορία → 64.12 (λοιπά έξοδα).
ok('unknown category → 64.12', expenseAccount('unknown_cat').code === '64.12')
ok('keyword fallback (νερό) → 64.03', expenseAccount('Λογαριασμός νερού').code === '64.03')

// ══ ΚΑΝΕΝΑΣ ΚΩΔΙΚΟΣ ΔΕΝ ΓΡΑΦΕΤΑΙ ΔΥΟ ΦΟΡΕΣ ═════════════════════════════════
// Το ημερολόγιο και το φύλλο του λογιστή έβγαζαν τον λογαριασμό από δύο
// διαφορετικούς πίνακες και διαφωνούσαν σε δεκατέσσερις από τις είκοσι επτά
// κατηγορίες. Πλέον υπάρχει ΕΝΑΣ πίνακας· ο έλεγχος το κλειδώνει.
for (const slug of ['heating', 'notary', 'cleaning', 'renovation', 'furniture', 'enfia']) {
  ok(`${slug}: ημερολόγιο και φάκελος συμφωνούν`, expenseAccount(slug).code === elpAccountFor(slug)?.code)
}
ok('κάθε λογαριασμός του ημερολογίου υπάρχει στο σχέδιο',
  Object.values(ACCOUNTS).every(a => ELP_ALL.some(x => x.code === a.code && x.name === a.name)))
// Η γέφυρα με το ΕΓΛΣ είναι του Παραρτήματος Ε, όχι δική μας: το ρεύμα ΔΕΝ είναι
// 62.03 (που στο ΕΓΛΣ είναι οι τηλεπικοινωνίες) αλλά 62.00 και 62.01.
ok('η ενέργεια γεφυρώνει με 62.00 και 62.01', eglsOf('64.02') === '62.00, 62.01')
ok('οι τηλεπικοινωνίες με 62.03', eglsOf('64.04') === '62.03')
ok('τα ενοίκια ως έξοδο με 62.04', eglsOf('64.05') === '62.04')

// Trial balance ισοσκελίζει (Σ balance = 0).
const tb = trialBalance(lines)
const tbSum = Math.round(tb.reduce((s, r) => s + r.balance, 0) * 100) / 100
ok('trial balance nets to zero', tbSum === 0)

// CSV formatters παράγουν σωστό αριθμό γραμμών + header.
const gen = journalCsvGeneric(lines).split('\r\n')
ok('generic CSV header greek (articles)', gen[0].startsWith('Αρ.Άρθρου;Ημ/νία;Κωδικός ΕΛΠ'))
ok('generic CSV has cost-centre column', gen[0].endsWith(';Κέντρο Κόστους'))
// ΕΝΑ ΣΧΕΔΙΟ ΣΤΟ ΑΡΧΕΙΟ ΕΙΣΑΓΩΓΗΣ. Η δεύτερη στήλη κωδικών έφυγε: παραγόταν από
// την πρώτη με πίνακα γραμμένο από μνήμη, και έδινε άλλον λογαριασμό από αυτόν
// που έγραφε το φύλλο του λογιστή για την ίδια δαπάνη.
ok('generic CSV carries no second chart', !gen[0].includes('ΕΓΛΣ'))
ok('generic CSV code column is ELP', gen.slice(1).every(r => ELP_ALL.some(a => a.code === r.split(';')[2])))
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
ok('QuickBooks account is code:name', qb[1].split(',')[2] === '38:Ταμειακά διαθέσιμα και ισοδύναμα')
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
// 45€ σε 'unknown_cat' → πέφτει στα 64.12 → προειδοποίηση ταξινόμησης.
ok('audit classify warns on 64.12 fallback', byKey('classify').status === 'warn')

// Άγνωστος κωδικός → ο έλεγχος λογαριασμών αποτυγχάνει και audit.ok=false.
const badLines = [...lines, { date: '2026-04-01', code: '99.99', account: 'Άγνωστος', description: 'x', debit: 10, credit: 0 }, { date: '2026-04-01', code: '38', account: 'Ταμειακά διαθέσιμα και ισοδύναμα', description: 'x', debit: 0, credit: 10 }]
const badAudit = auditJournal(badLines, { year: 2026 })
ok('audit fails on unknown account', badAudit.checks.find(c => c.key === 'accounts')!.status === 'fail' && badAudit.ok === false)

// Ημερομηνία εκτός μήνα → ο έλεγχος ημερομηνιών αποτυγχάνει.
const janAudit = auditJournal(lines, { year: 2026, month: 1 })
ok('audit flags out-of-month dates', janAudit.checks.find(c => c.key === 'dates')!.status === 'fail')

// ── Δόσεις δανείου: διαχωρισμός τόκων (65.01) + χρεολυσίου (52) ──────────────
const loanLines = buildJournal({ incomes: [], expenses: [], loanPayments: [{ date: '2026-05-10', amount: 751, interest: 200 }] })
ok('loan payment → 3 lines', loanLines.length === 3)
ok('loan interest on 65.01', loanLines.some(l => l.code === '65.01' && Math.abs(l.debit - 200) < 0.005))
ok('loan principal on 52', loanLines.some(l => l.code === '52' && Math.abs(l.debit - 551) < 0.005))
ok('loan credit on 38', loanLines.some(l => l.code === '38' && Math.abs(l.credit - 751) < 0.005))
ok('loan article balanced', journalTotals(loanLines).balanced)
const loanAudit = auditJournal(loanLines, { year: 2026 })
ok('loan audit ok (all pass)', loanAudit.ok === true && loanAudit.tone === 'positive')
ok('loan → no misc 64.12 warning', !loanAudit.checks.some(c => c.key === 'classify' && c.status === 'warn'))
ok('loan split check passes', loanAudit.checks.find(c => c.key === 'loansplit')!.status === 'pass')
ok('loan tie-out passes (incl. χρεολύσιο)', loanAudit.checks.find(c => c.key === 'tieout')!.status === 'pass')

// Δόση χωρίς τόκους (interest=0) → όλα στο 52, ο έλεγχος διαχωρισμού προειδοποιεί.
const unsplit = buildJournal({ incomes: [], expenses: [], loanPayments: [{ date: '2026-06-10', amount: 400, interest: 0 }] })
ok('unsplit loan → 2 lines (52 + 38)', unsplit.length === 2 && unsplit.some(l => l.code === '52' && l.debit === 400))
ok('unsplit loan warns on split', auditJournal(unsplit, { year: 2026 }).checks.find(c => c.key === 'loansplit')!.status === 'warn')

console.log(`journal.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
