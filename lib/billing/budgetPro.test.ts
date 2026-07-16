// Τεστ για τον προχωρημένο πυρήνα προϋπολογισμού (lib/billing/budgetPro.ts)
import {
  safeToDistribute, reservePlan, rolloverNext, strWaterfall, investmentReturns,
  recommendedReserves, climateFeePerNight, strTaxRegime, allocate,
} from './budgetPro'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) <= e

// ── safeToDistribute ─────────────────────────────────────────────────────────
{
  ok('έσοδα − δεσμεύσεις − αποθεματικά − δόση', safeToDistribute({ income: 1000, committedBills: 300, reserveContributions: 150, loanPayment: 400 }) === 150)
  ok('μπορεί να είναι αρνητικό (έλλειμμα)', safeToDistribute({ income: 500, committedBills: 400, reserveContributions: 100, loanPayment: 200 }) === -200)
}

// ── reservePlan (κουμπαράς) ──────────────────────────────────────────────────
{
  const p = reservePlan(1200, 300, 9) // στόχος ΕΝΦΙΑ 1200, έχω 300, 9 μήνες
  ok('υπόλοιπο = 900', p.remaining === 900)
  ok('μηνιαία εισφορά = 100 (900/9)', p.requiredMonthly === 100)
  ok('funded 25%', p.fundedPct === 25)
  const done = reservePlan(1000, 1000, 3)
  ok('πλήρως καλυμμένο → 0 μηνιαία, 100%', done.requiredMonthly === 0 && done.fundedPct === 100)
  const noTime = reservePlan(600, 0, 0)
  ok('χωρίς χρόνο → όλο το υπόλοιπο', noTime.requiredMonthly === 600)
  // 99,5% ΔΕΝ πρέπει να στρογγυλοποιείται σε 100% «καλυμμένο» ενώ λείπει €1.
  const almost = reservePlan(200, 199, 1)
  ok('99,5% → 99% (floor), όχι 100%', almost.fundedPct === 99 && almost.remaining === 1)
}

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
  // taxableBase = 1000 − 150 − 100 = 750 · φόρος 15% = 112.5 → 113
  ok('κράτηση φόρου ~113', w.taxReserve === 113)
  // net = 1000 − 150 − 15 − 50 − 100 − 113 = 572
  ok('καθαρό = 572', w.net === 572)
  ok('καθαρό/διανυκτέρευση = 57', w.netPerNight === 57)
  ok('περιθώριο 57%', w.marginPct === 57)
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

// ── recommendedReserves ──────────────────────────────────────────────────────
{
  const young = recommendedReserves(800, 200000, 5)  // νέο → 8%
  ok('CapEx 8% νέου', young.capExPct === 8)
  // max(800×12×0.08=768, 200000×0.01=2000)/12 = 2000/12 ≈ 167
  ok('CapEx μηνιαίο = max(κανόνας ενοικίου, 1% αξίας)/12', young.capExMonthly === 167)
  ok('λειτουργικό αποθεματικό 20% ενοικίου', young.operatingReserve === 160)
  ok('κενές περίοδοι 6%', young.vacancyMonthly === 48)
  ok('παλιό ακίνητο → 15%', recommendedReserves(1000, 100000, 35).capExPct === 15)
  ok('μεσαίο → 10%', recommendedReserves(1000, 100000, 20).capExPct === 10)
}

// ── climateFeePerNight ───────────────────────────────────────────────────────
{
  ok('υψηλή περίοδος standard = 1,5', climateFeePerNight(7) === 1.5)
  ok('χαμηλή περίοδος standard = 0,5', climateFeePerNight(1) === 0.5)
  ok('luxury υψηλή = 10', climateFeePerNight(8, 'luxury') === 10)
}

// ── strTaxRegime ─────────────────────────────────────────────────────────────
{
  ok('2 ακίνητα → ιδιώτης', strTaxRegime(2) === 'individual')
  ok('3 ακίνητα → επιχείρηση', strTaxRegime(3) === 'business')
}

// ── allocate ─────────────────────────────────────────────────────────────────
{
  const a = allocate({ income: 1000, committedBills: 300, reserveContributions: 150, loanPayment: 400 })
  ok('safe = 150', a.safe === 150)
  ok('ανατεθειμένο 85%', a.assignedPct === 85)
  const neg = allocate({ income: 500, committedBills: 400, reserveContributions: 100, loanPayment: 200 })
  ok('safe δεν πέφτει κάτω από 0', neg.safe === 0)
  ok('ανατεθειμένο κόβεται στο 100%', neg.assignedPct === 100)
}

console.log(`\nbudgetPro.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
