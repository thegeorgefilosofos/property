// Τεστ για τον υπολογισμό αναπροσαρμογής μισθώματος (rentAdjustment.ts).
import { computeRentAdjustment, adjustmentNoticeText } from './rentAdjustment'
import { cpiFor, cpiConfirmedDate, cpiConfirmedLabel, CPI_LATEST_YEAR } from '../market/cpi'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// Ποσοστό: 500 + 3% = 515.
const a = computeRentAdjustment({ currentRent: 500, method: 'percent', percent: 3 })
ok('percent newRent 515', a.newRent === 515)
ok('percent increase 15', a.increase === 15)
ok('percent pct 3', a.pctApplied === 3)

// ΔΤΚ: 800 + 2.5% = 820.
const c = computeRentAdjustment({ currentRent: 800, method: 'cpi', cpiPct: 2.5 })
ok('cpi newRent 820', c.newRent === 820)

// Χειροκίνητο: 500 → 560, pct = 12.
const m = computeRentAdjustment({ currentRent: 500, method: 'manual', newRentManual: 560 })
ok('manual newRent 560', m.newRent === 560)
ok('manual pct 12', m.pctApplied === 12)

// Στρογγυλοποίηση: 333.33 + 3% = 343.33.
const r = computeRentAdjustment({ currentRent: 333.33, method: 'percent', percent: 3 })
ok('rounding to 2dp', r.newRent === 343.33)

// Μηδενικό τρέχον → pct 0 (χωρίς διαίρεση με μηδέν).
const z = computeRentAdjustment({ currentRent: 0, method: 'manual', newRentManual: 400 })
ok('zero current → pct 0', z.pctApplied === 0 && z.newRent === 400)

// Το κείμενο περιέχει τα βασικά στοιχεία.
const txt = adjustmentNoticeText({ tenantName: 'Παπαδόπουλος', address: 'Ερμού 1', effectiveDate: '01/09/2026', method: 'percent', res: a })
ok('notice mentions tenant', txt.includes('Παπαδόπουλος'))
ok('notice mentions new rent', txt.includes('515'))
ok('notice mentions effective date', txt.includes('01/09/2026'))

// ── Ο ΔΕΙΚΤΗΣ ΟΝΟΜΑΖΕΙ ΤΗΝ ΠΕΡΙΟΔΟ ΤΟΥ ─────────────────────────────────────
// Ο μισθωτής παίρνει υπογεγραμμένο έγγραφο με ένα ποσοστό. Χωρίς το έτος του
// δείκτη δεν έχει κανέναν τρόπο να το επαληθεύσει στην ΕΛΣΤΑΤ.
{
  const withYear = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'cpi', res: c, cpiYear: 2025 })
  ok('η ειδοποίηση ΔΤΚ γράφει το έτος του δείκτη', withYear.includes('έτους 2025'))
  ok('…και ονομάζει την ΕΛΣΤΑΤ', withYear.includes('ΕΛΣΤΑΤ'))
  ok('…και λέει ότι είναι η ΜΕΣΗ ΕΤΗΣΙΑ μεταβολή', withYear.includes('μέσης ετήσιας μεταβολής'))

  // Χωρίς έτος δεν επινοείται έτος: η φράση απλώς δεν το αναφέρει.
  const noYear = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'cpi', res: c })
  ok('χωρίς γνωστό έτος δεν γράφεται έτος', !/έτους \d/.test(noYear))

  // Οι άλλες δύο μέθοδοι δεν επικαλούνται ΠΟΤΕ την ΕΛΣΤΑΤ: το ποσοστό είναι
  // συμβατικό ή συμφωνημένο, και η επίκληση κρατικής αρχής θα ήταν ψευδής.
  const pct = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'percent', res: a, cpiYear: 2025 })
  ok('η μέθοδος ποσοστού δεν επικαλείται την ΕΛΣΤΑΤ', !pct.includes('ΕΛΣΤΑΤ'))
  const man = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'manual', res: m, cpiYear: 2025 })
  ok('η χειροκίνητη μέθοδος δεν επικαλείται την ΕΛΣΤΑΤ', !man.includes('ΕΛΣΤΑΤ'))
}

// ── Ο ΠΙΝΑΚΑΣ ΔΤΚ ΔΕΝ ΜΑΝΤΕΥΕΙ ─────────────────────────────────────────────
// Το πεδίο της οθόνης γεμίζει από εδώ. Ένα σιωπηλό fallback θα έβαζε περυσινό
// νούμερο σε φετινό έγγραφο, χωρίς να το δει κανείς.
{
  ok('γνωστό έτος δίνει τιμή', cpiFor(2025) === 2.5)
  ok('άγνωστο μελλοντικό έτος δίνει null', cpiFor(2099) === null)
  ok('άγνωστο παλιό έτος δίνει null', cpiFor(1990) === null)
  ok('το τελευταίο έτος έχει πάντα τιμή', cpiFor(CPI_LATEST_YEAR) !== null)
  ok('η αρνητική μεταβολή του 2020 δεν χάθηκε', cpiFor(2020) === -1.3)
  // Το μηδέν ΔΕΝ είναι «δεν ξέρουμε»: το 2015 και το 2016 ήταν πραγματικά 0,0%.
  ok('το μηδέν είναι τιμή, όχι κενό', cpiFor(2016) === 0)
  ok('η ημερομηνία επιβεβαίωσης διαβάζεται ελληνικά', /^\d{2}\/\d{2}\/\d{4}$/.test(cpiConfirmedDate()))
  ok('η ετικέτα πηγής ονομάζει την ΕΛΣΤΑΤ και την ημερομηνία',
     cpiConfirmedLabel().includes('ΕΛΣΤΑΤ') && cpiConfirmedLabel().includes(cpiConfirmedDate()))
}

console.log(`rentAdjustment.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
