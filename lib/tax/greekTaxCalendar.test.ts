// Αυστηρά τεστ για το φορολογικό ημερολόγιο ακινήτων (greekTaxCalendar.ts).
// Τρέξε: npx tsx lib/tax/greekTaxCalendar.test.ts
import {
  greekPropertyTaxObligations, taxObligationToEvent, nextWorkingDay, lastWorkingDayOfMonth,
  type TaxObligation,
} from './greekTaxCalendar'
import { isNonWorkingDay } from '../calendar/greekHolidays'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── nextWorkingDay / lastWorkingDayOfMonth ───────────────────────────────────
// 2026-03-31 είναι Τρίτη (εργάσιμη) → μένει.
ok('εργάσιμη μένει', nextWorkingDay('2026-03-31') === '2026-03-31')
// 2026-08-15 (Δεκαπενταύγουστος, Σάββατο) → μεταθετέα στην επόμενη εργάσιμη.
ok('αργία μετατίθεται', (() => { const d = nextWorkingDay('2026-08-15'); return d > '2026-08-15' && !isNonWorkingDay(d) })())
// nextWorkingDay πάντα επιστρέφει εργάσιμη
for (const s of ['2026-01-01', '2026-05-01', '2026-12-25', '2026-06-28']) ok(`working(${s})`, !isNonWorkingDay(nextWorkingDay(s)))
// τελευταία εργάσιμη Φεβρουαρίου 2027 (28/2/2027 = Κυριακή) → 26/2 Παρασκευή
ok('last working Feb 2027', (() => { const d = lastWorkingDayOfMonth(2027, 1); return !isNonWorkingDay(d) && d.startsWith('2027-02') })())
ok('last working ≤ τέλος μήνα', lastWorkingDayOfMonth(2026, 4) <= '2026-05-31')

// ── owner profile ────────────────────────────────────────────────────────────
const owner = greekPropertyTaxObligations(2026, 'owner')
const ids = owner.map(o => o.id)
ok('owner έχει ΕΝΦΙΑ έκδοση', ids.some(i => i.startsWith('enfia-issue')))
ok('owner έχει ΕΝΦΙΑ 1η δόση', ids.some(i => i.startsWith('enfia-first')))
ok('owner έχει ΕΝΦΙΑ τελευταία', ids.some(i => i.startsWith('enfia-last')))
ok('owner έχει Ε9', ids.some(i => i.startsWith('e9-')))
ok('owner έχει δήλωση εισοδήματος', ids.some(i => i.startsWith('income-decl')))
ok('owner ΔΕΝ έχει βραχυχρόνια', !ids.some(i => i.startsWith('str-')))
ok('owner ταξινομημένα κατά ημερομηνία', owner.every((o, i) => i === 0 || owner[i - 1].date <= o.date))
ok('όλες οι ημερομηνίες εργάσιμες', owner.every(o => !isNonWorkingDay(o.date)))
ok('όλα category tax', owner.every(o => o.category === 'tax'))
ok('όλα έχουν official_url', owner.every(o => /aade\.gr/.test(o.official_url)))
ok('notes παραπέμπουν σε επιβεβαίωση', owner.every(o => /myAADE|taxheaven/i.test(o.notes)))

// ΕΝΦΙΑ τελευταία δόση → Φεβρουάριος ΕΠΟΜΕΝΟΥ έτους
const last = owner.find(o => o.id.startsWith('enfia-last'))!
ok('ΕΝΦΙΑ τελευταία = Φεβ 2027', last.date.startsWith('2027-02'))
// Ε9 → Μάρτιος 2026
ok('Ε9 Μάρτιος', owner.find(o => o.id.startsWith('e9-'))!.date.startsWith('2026-03'))
// Εισόδημα → Ιούνιος/Ιούλιος 2026 (30/6 ή επόμενη εργάσιμη)
ok('εισόδημα ~Ιούνιος', owner.find(o => o.id.startsWith('income-decl'))!.date >= '2026-06-28')

// confidence: Ε9/εισόδημα statutory, ΕΝΦΙΑ announced
ok('Ε9 statutory', owner.find(o => o.id.startsWith('e9-'))!.confidence === 'statutory')
ok('ΕΝΦΙΑ announced', owner.find(o => o.id.startsWith('enfia-first'))!.confidence === 'announced')

// ── long_term ────────────────────────────────────────────────────────────────
const lt = greekPropertyTaxObligations(2026, 'long_term')
ok('long_term έχει owner-υποχρεώσεις', lt.some(o => o.id.startsWith('enfia-first')) && lt.some(o => o.id.startsWith('income-decl')))
ok('long_term ΔΕΝ έχει βραχυχρόνια', !lt.some(o => o.id.startsWith('str-')))

// ── short_term ───────────────────────────────────────────────────────────────
const st = greekPropertyTaxObligations(2026, 'short_term')
ok('short_term έχει owner-υποχρεώσεις', st.some(o => o.id.startsWith('enfia-first')))
ok('short_term έχει μητρώο ΑΑΔΕ ×12', st.filter(o => o.id.startsWith('str-registry')).length === 12)
ok('short_term έχει τέλος ×12', st.filter(o => o.id.startsWith('str-climate-fee')).length === 12)
ok('short_term ταξινομημένα', st.every((o, i) => i === 0 || st[i - 1].date <= o.date))
ok('short_term ημερομηνίες εργάσιμες', st.every(o => !isNonWorkingDay(o.date)))
// μητρώο ~20ή κάθε μήνα (ή επόμενη εργάσιμη)
ok('μητρώο κοντά στην 20ή', st.filter(o => o.id.startsWith('str-registry')).every(o => +o.date.slice(8, 10) >= 20 && +o.date.slice(8, 10) <= 24))

// ── μοναδικότητα id ──────────────────────────────────────────────────────────
ok('μοναδικά ids (short_term)', new Set(st.map(o => o.id)).size === st.length)

// ── taxObligationToEvent ─────────────────────────────────────────────────────
const ev = taxObligationToEvent(owner[0], 'prop1', 'user1')
ok('event property/user', ev.property_id === 'prop1' && ev.user_id === 'user1')
ok('event source tax:*', ev.source.startsWith('tax:'))
ok('event pending', ev.status === 'pending')
ok('event date = obligation date', ev.event_date === owner[0].date)
ok('event notes = obligation notes', ev.notes === owner[0].notes)

// ── διαφορετικό έτος μετακινεί σωστά ─────────────────────────────────────────
const y2027 = greekPropertyTaxObligations(2027, 'owner')
ok('2027 Ε9 στο 2027', y2027.find(o => o.id.startsWith('e9-'))!.date.startsWith('2027-03'))
ok('2027 ΕΝΦΙΑ τελευταία στο 2028', y2027.find(o => o.id.startsWith('enfia-last'))!.date.startsWith('2028-02'))

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ngreekTaxCalendar.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
