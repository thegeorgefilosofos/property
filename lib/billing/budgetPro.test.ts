// Τεστ για τον προχωρημένο πυρήνα προϋπολογισμού (lib/billing/budgetPro.ts)
import { rolloverNext, strWaterfall, investmentReturns } from './budgetPro'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) <= e

// ── rolloverNext ─────────────────────────────────────────────────────────────
{
  const under = rolloverNext(100, 70) // αδιάθετα 30
  ok('αδιάθετο μεταφέρεται (+30)', under.carryOut === 30 && under.available === 100)
  const over = rolloverNext(100, 130) // υπέρβαση 30
  ok('υπέρβαση → αρνητικό carry (−30)', over.carryOut === -30)
  const withCarry = rolloverNext(100, 90, 20) // 120 διαθέσιμα, ξόδεψα 90
  ok('carryIn προστίθεται', withCarry.available === 120 && withCarry.carryOut === 30)
}

// ── strWaterfall (βραχυχρόνια) ───────────────────────────────────────────────
{
  const w = strWaterfall({ gross: 1000, platformFeePct: 15, nights: 10, climateFeePerNight: 1.5, cleaningFee: 50, managementPct: 10, incomeTaxPct: 15 })
  ok('προμήθεια πλατφόρμας 150', w.platformFee === 150)
  ok('τέλος ανθεκτικότητας 15 (1,5×10)', w.climateFee === 15)
  ok('διαχείριση 100 (10%)', w.management === 100)
  // Η ΒΑΣΗ ΕΙΝΑΙ ΤΟ ΑΚΑΘΑΡΙΣΤΟ ΜΕΙΟΝ ΤΗΝ ΤΕΚΜΑΡΤΗ ΕΚΠΤΩΣΗ 5%, ΟΧΙ ΜΕΙΟΝ ΤΑ ΕΞΟΔΑ.
  // Ο παλιός έλεγχος κατοχύρωνε `1000 − 150 − 100 = 750` και κράτηση 113, δηλαδή
  // φύλαγε τον λάθος τύπο: η προμήθεια της πλατφόρμας είναι δαπάνη και δεν
  // μειώνει το δηλωτέο εισόδημα. Σωστά: 1000 × 0,95 = 950 · 15% = 142,5 → 143.
  ok('κράτηση φόρου 143 (στο 95% του ακαθάριστου)', w.taxReserve === 143)
  // net = 1000 − 150 − 15 − 50 − 100 − 143 = 542
  ok('καθαρό = 542', w.net === 542)
  ok('καθαρό/διανυκτέρευση = 54', w.netPerNight === 54)
  ok('περιθώριο 54%', w.marginPct === 54)
}

// ── investmentReturns ────────────────────────────────────────────────────────
{
  const r = investmentReturns({ annualIncome: 12000, annualOpEx: 3000, annualLoanPayment: 6000, purchasePrice: 180000, equityInvested: 40000 })
  ok('NOI = 9000 (χωρίς δάνειο)', r.noi === 9000)
  ok('ταμειακή ροή προ φόρων = 3000', r.preTaxCashFlow === 3000)
  ok('cap rate = 5% (9000/180000)', near(r.capRatePct, 5))
  ok('cash-on-cash = 7,5% (3000/40000)', near(r.cashOnCashPct, 7.5))
  const noBuy = investmentReturns({ annualIncome: 1, annualOpEx: 0, annualLoanPayment: 0, purchasePrice: 0, equityInvested: 0 })
  ok('χωρίς τιμή/κεφάλαιο → 0% (όχι διαίρεση με 0)', noBuy.capRatePct === 0 && noBuy.cashOnCashPct === 0)
}

// ── Τέλος ανθεκτικότητας ──────────────────────────────────────────────────
// Εδώ υπήρχαν τρεις ισχυρισμοί που ΚΛΕΙΔΩΝΑΝ ΤΗ ΛΑΘΟΣ ΤΙΜΗ ως σωστή
// (1,5 € / 0,5 € ανά διανυκτέρευση), ενώ το greekTax.test.ts κλείδωνε
// ταυτόχρονα τη σωστή (8 € για διαμέρισμα). Η σουίτα βεβαίωνε δύο αντιφατικούς
// συντελεστές για το ΙΔΙΟ νόμιμο τέλος, οπότε καμία διόρθωση δεν μπορούσε να
// «φτιάξει» τον έναν χωρίς να ρίξει τον άλλο — το τεστ υπερασπιζόταν το σφάλμα.
//
// Το strWaterfall δέχεται πλέον τον συντελεστή ως όρισμα από
// lib/billing/greekTax.ts, όπου ελέγχεται μία φορά.

console.log(`\nbudgetPro.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
