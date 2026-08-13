// Τεστ για τον υπολογισμό αναπροσαρμογής μισθώματος (rentAdjustment.ts).
import { computeRentAdjustment, adjustmentNoticeText } from './rentAdjustment'

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

// ── Η ΒΑΣΗ ΓΡΑΦΕΤΑΙ ΟΛΟΚΛΗΡΗ: ΜΕΤΡΟ, ΠΕΡΙΟΔΟΣ, ΚΑΙ ΑΝ ΕΙΝΑΙ ΤΟ 75% ─────────
// Ο μισθωτής παίρνει υπογεγραμμένο έγγραφο με ένα ποσοστό. Χωρίς αυτά τα τρία
// δεν έχει κανέναν τρόπο να το επαληθεύσει στην ΕΛΣΤΑΤ — και δύο διαφορετικές
// βάσεις δίνουν δύο διαφορετικά νούμερα από τον ΙΔΙΟ δείκτη.
const PERIOD = 'Ιουλίου 2025 ώς Ιουνίου 2026'
{
  const full = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'cpi', res: c, cpiPeriod: PERIOD })
  ok('η ειδοποίηση ΔΤΚ γράφει το δωδεκάμηνο', full.includes(PERIOD))
  ok('…ονομάζει την ΕΛΣΤΑΤ', full.includes('ΕΛΣΤΑΤ'))
  ok('…και λέει ότι είναι η ΔΩΔΕΚΑΜΗΝΗ μεταβολή', full.includes('δωδεκάμηνης μεταβολής'))
  ok('…και δεν αναφέρει 75% όταν δεν εφαρμόστηκε', !full.includes('75%'))

  const share = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'cpi', res: c, cpiPeriod: PERIOD, cpiShare75: true })
  ok('με τη βάση του 75%, το έγγραφο το γράφει', share.includes('75%'))
  ok('…και κρατά και το δωδεκάμηνο', share.includes(PERIOD))

  // Χωρίς περίοδο δεν επινοείται περίοδος: η φράση απλώς δεν την αναφέρει.
  const noPeriod = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'cpi', res: c })
  ok('χωρίς γνωστή περίοδο δεν γράφεται περίοδος', !noPeriod.includes('ώς'))
  ok('…αλλά το μέτρο παραμένει γραμμένο', noPeriod.includes('δωδεκάμηνης μεταβολής'))

  // Οι άλλες δύο μέθοδοι δεν επικαλούνται ΠΟΤΕ την ΕΛΣΤΑΤ: το ποσοστό είναι
  // συμβατικό ή συμφωνημένο, και η επίκληση κρατικής αρχής θα ήταν ψευδής.
  const pct = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'percent', res: a, cpiPeriod: PERIOD, cpiShare75: true })
  ok('η μέθοδος ποσοστού δεν επικαλείται την ΕΛΣΤΑΤ', !pct.includes('ΕΛΣΤΑΤ'))
  const man = adjustmentNoticeText({ effectiveDate: '01/09/2026', method: 'manual', res: m, cpiPeriod: PERIOD, cpiShare75: true })
  ok('η χειροκίνητη μέθοδος δεν επικαλείται την ΕΛΣΤΑΤ', !man.includes('ΕΛΣΤΑΤ'))
}

console.log(`rentAdjustment.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
