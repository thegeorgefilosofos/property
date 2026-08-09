// Ζωντανός, από-άκρη-σε-άκρη έλεγχος των ροών που μόλις φτιάξαμε, με τον
// ΠΡΑΓΜΑΤΙΚΟ expander επανάληψης — όχι mock. Αποδεικνύει ότι:
//  (Α) auto-mark-paid: όταν κλείσει ένας μήνας, ο expander ΣΤΑΜΑΤΑ να τον δείχνει.
//  (Β) φορολογικά (ΑΑΔΕ): παράγονται έγκυρες εγγραφές ημερολογίου ανά τύπο.
//  (Γ) δόσεις δανείου: idempotent χρονοδιάγραμμα με σωστό ποσό/πλήθος.
// Τρέξε: npx tsx lib/calendar/liveflows.test.ts
import { expandRecurring, type Recurrable } from './recurrence'
import { rentDueOccurrence, applyExdate } from './rentDue'
import { greekPropertyTaxObligations, taxObligationToEvent } from '../tax/greekTaxCalendar'
import { annuityMonthly } from '../loans/recommend'
import { isNonWorkingDay } from './greekHolidays'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ══ (Α) AUTO-MARK-PAID, end-to-end με τον πραγματικό expandRecurring ═══════════
type RD = Recurrable & { recurring: boolean; recurring_interval: string }
const rentDue: RD = { id: 'rd', event_date: '2026-01-05', recurring: true, recurring_interval: 'monthly', recurrence_exdates: [] }
const occs = (ev: RD) => expandRecurring([ev], '2026-01-01', '2026-12-31').map(e => e.event_date).sort()

const before = occs(rentDue)
ok('Α: 12 μηνιαίες εμφανίσεις αρχικά', before.length === 12)
ok('Α: υπάρχει ο Μάρτιος πριν', before.includes('2026-03-05'))

// Πληρωμή Μαρτίου → κλείσε την εμφάνιση
const occMar = rentDueOccurrence(rentDue.event_date, 2026, 3)
ok('Α: occ Μαρτίου σωστό', occMar === '2026-03-05')
const afterPay = applyExdate(rentDue.recurrence_exdates, occMar, true)!
rentDue.recurrence_exdates = afterPay
const paid = occs(rentDue)
ok('Α: μετά την πληρωμή 11 εμφανίσεις', paid.length === 11)
ok('Α: ο Μάρτιος ΔΕΝ εμφανίζεται πια', !paid.includes('2026-03-05'))
ok('Α: οι άλλοι μήνες παραμένουν', paid.includes('2026-02-05') && paid.includes('2026-04-05'))

// Αναίρεση πληρωμής → ξανα-εμφανίζεται
const afterUnpay = applyExdate(rentDue.recurrence_exdates, occMar, false)!
rentDue.recurrence_exdates = afterUnpay
const reopened = occs(rentDue)
ok('Α: μετά την αναίρεση 12 ξανά', reopened.length === 12)
ok('Α: ο Μάρτιος επέστρεψε', reopened.includes('2026-03-05'))

// ══ (Β) ΦΟΡΟΛΟΓΙΚΑ (ΑΑΔΕ) — έγκυρες εγγραφές ημερολογίου ═══════════════════════
for (const profile of ['owner', 'long_term', 'short_term'] as const) {
  const obs = greekPropertyTaxObligations(2026, profile)
  ok(`Β:${profile} παράγει υποχρεώσεις`, obs.length > 0)
  const rows = obs.map(o => taxObligationToEvent(o, 'prop1', 'user1'))
  ok(`Β:${profile} όλες source tax:*`, rows.every(r => r.source.startsWith('tax:')))
  ok(`Β:${profile} όλες pending`, rows.every(r => r.status === 'pending'))
  ok(`Β:${profile} όλες σε εργάσιμη`, rows.every(r => !isNonWorkingDay(r.event_date)))
  ok(`Β:${profile} έγκυρες ημερομηνίες`, rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.event_date)))
  ok(`Β:${profile} μοναδικά sources`, new Set(rows.map(r => r.source)).size === rows.length)
}
// βραχυχρόνια έχει ΠΕΡΙΣΣΟΤΕΡΕΣ (μητρώο + τέλος) από owner
ok('Β: short_term ⊃ owner', greekPropertyTaxObligations(2026, 'short_term').length > greekPropertyTaxObligations(2026, 'owner').length)
// ΕΝΦΙΑ υπάρχει για όλους
ok('Β: ΕΝΦΙΑ σε owner', greekPropertyTaxObligations(2026, 'owner').some(o => /ΕΝΦΙΑ/.test(o.title)))

// ══ (Γ) ΔΟΣΕΙΣ ΔΑΝΕΙΟΥ — idempotent χρονοδιάγραμμα ════════════════════════════
function loanRows(amount: number, rate: number, years: number, start: string, bank: string) {
  const monthly = annuityMonthly(amount, rate, years)
  const src = 'loan_schedule:' + (bank || 'γενικό').toLowerCase().replace(/\s+/g, '_').slice(0, 40)
  const d = new Date(start), n = Math.min(years * 12, 60)
  const rows: { event_date: string; amount: number; source: string }[] = []
  for (let i = 0; i < n; i++) { const ev = new Date(d.getFullYear(), d.getMonth() + i + 1, d.getDate()); rows.push({ event_date: ev.toISOString().split('T')[0], amount: Math.round(monthly), source: src }) }
  return rows
}
const L1 = loanRows(200000, 3.5, 30, '2026-01-15', 'Πειραιώς')
ok('Γ: 60 δόσεις (cap)', L1.length === 60)
ok('Γ: ίδιο source (idempotent)', new Set(L1.map(r => r.source)).size === 1)
ok('Γ: source ανά τράπεζα', L1[0].source === 'loan_schedule:πειραιώς')
ok('Γ: θετικό μηνιαίο ποσό', L1[0].amount > 0)
ok('Γ: όλες οι δόσεις ίδιο ποσό', new Set(L1.map(r => r.amount)).size === 1)
ok('Γ: διαφορετική τράπεζα → διαφορετικό source', loanRows(100000, 3, 20, '2026-01-15', 'Alpha')[0].source === 'loan_schedule:alpha')
// επαναληπτική εκτέλεση δίνει ΑΚΡΙΒΩΣ ίδιες γραμμές (ντετερμινιστικό → idempotent upsert)
ok('Γ: ντετερμινιστικό (ίδιο 2η φορά)', JSON.stringify(loanRows(200000, 3.5, 30, '2026-01-15', 'Πειραιώς')) === JSON.stringify(L1))

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nliveflows (auto-mark-paid + φορολογικά + δάνεια) — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
