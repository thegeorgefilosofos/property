// ═══════════════════════════════════════════════════════════════════════════
// ΜΗΧΑΝΗ ΑΠΟΔΟΣΕΩΝ — καθαρές, δοκιμάσιμες συναρτήσεις (χωρίς I/O/DOM).
// Μία πηγή αλήθειας για: μεικτή/καθαρή απόδοση, απόδοση μετά φόρου, μόχλευση
// (return on equity / cash-on-cash), ανατοκισμό επανεπένδυσης, ιστορική προβολή
// 10/20ετίας και σύγκριση με εναλλακτικές επενδύσεις.
//
// Παρελθούσες αποδόσεις ΔΕΝ εγγυώνται μελλοντικές — κάθε προβολή είναι εκτίμηση.
// ═══════════════════════════════════════════════════════════════════════════

const pos = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)
const num = (n: number): number => (Number.isFinite(n) ? n : 0)
export const round2 = (n: number): number => Math.round(num(n) * 100) / 100
export const round1 = (n: number): number => Math.round(num(n) * 10) / 10

// ── Βασικές αποδόσεις ──────────────────────────────────────────────────────
export interface YieldBreakdown {
  annualRent: number
  grossYield: number      // % ετήσιο ενοίκιο / αξία
  netYield: number        // % (ενοίκιο − λειτουργικά έξοδα) / αξία
  netYieldAfterTax: number// % μετά τον φόρο εισοδήματος
  capRate: number         // ίδιο με netYield (καθαρά έσοδα / αξία) — ορολογία αγοράς
}

/** Μεικτή/καθαρή/μετά-φόρου απόδοση. Ο φόρος δίνεται έτοιμος (από τη φορολογική μηχανή). */
export function yields(monthlyRent: number, propertyValue: number, annualOpex: number, annualIncomeTax = 0): YieldBreakdown {
  const rent = pos(monthlyRent)
  const value = pos(propertyValue)
  const opex = Math.max(0, num(annualOpex))
  const tax = Math.max(0, num(annualIncomeTax))
  const annualRent = rent * 12
  const gross = value > 0 ? (annualRent / value) * 100 : 0
  const net = value > 0 ? ((annualRent - opex) / value) * 100 : 0
  const afterTax = value > 0 ? ((annualRent - opex - tax) / value) * 100 : 0
  return {
    annualRent: round2(annualRent),
    grossYield: round1(gross),
    netYield: round1(net),
    netYieldAfterTax: round1(afterTax),
    capRate: round1(net),
  }
}

// ── Ανατοκισμός επανεπένδυσης (compound) ───────────────────────────────────
export interface CompoundResult {
  futureValue: number       // τελική αξία
  totalContributions: number// σύνολο εισφορών (αρχικό + ετήσιες)
  totalGrowth: number       // κέρδος από τόκο/ανατοκισμό
  perYear: { year: number; value: number; contributed: number }[]
}

/**
 * Μελλοντική αξία κεφαλαίου με ετήσιο ανατοκισμό και (προαιρετικά) ετήσια
 * επανεπένδυση σταθερού ποσού στο ΤΕΛΟΣ κάθε έτους.
 * FV = P·(1+r)^n + C·[((1+r)^n − 1)/r].
 */
export function compound(principal: number, annualRatePct: number, years: number, annualContribution = 0): CompoundResult {
  const P = Math.max(0, num(principal))
  const r = num(annualRatePct) / 100
  const n = Math.max(0, Math.floor(num(years)))
  const C = Math.max(0, num(annualContribution))
  const perYear: CompoundResult['perYear'] = []
  let value = P
  for (let y = 1; y <= n; y++) {
    value = value * (1 + r) + C
    perYear.push({ year: y, value: round2(value), contributed: round2(P + C * y) })
  }
  const totalContributions = round2(P + C * n)
  const futureValue = round2(n === 0 ? P : value)
  return { futureValue, totalContributions, totalGrowth: round2(futureValue - totalContributions), perYear }
}

// ── Μόχλευση (leverage / return on equity) ─────────────────────────────────
export interface LeverageInput {
  price: number            // τιμή αγοράς
  ltvPct: number           // ποσοστό δανείου (0–100)
  loanRatePct: number      // επιτόκιο δανείου
  loanYears: number        // διάρκεια δανείου
  grossYieldPct: number    // μεικτή απόδοση (ετήσιο ενοίκιο / τιμή)
  opexPctOfRent?: number   // λειτουργικά έξοδα ως % του ενοικίου (default 20%)
  interestFreePct?: number // ποσοστό ΤΟΥ δανείου που είναι άτοκο (π.χ. Σπίτι μου ΙΙ 50%)
  buyCostsPct?: number     // κόστη αγοράς ως % τιμής (συμβολαιογράφος/φόρος/μεσίτης, default 4%)
}
export interface LeverageResult {
  equity: number           // ίδια κεφάλαια (προκαταβολή + κόστη)
  loan: number
  annualRent: number
  noi: number              // καθαρά λειτουργικά έσοδα (πριν τόκους)
  annualDebtService: number// ετήσια δόση (κεφάλαιο + τόκος)
  annualInterest: number   // τόκοι 1ου έτους
  cashFlow: number         // NOI − δόση
  unleveredYield: number   // % NOI / συνολικό κεφάλαιο
  cashOnCash: number       // % cashFlow / ίδια κεφάλαια
  leverageBoost: number    // cashOnCash − unleveredYield (θετικό = καλή μόχλευση)
  positiveCarry: boolean   // μεικτή απόδοση > επιτόκιο δανείου
  effectiveLoanRate: number// μέσο επιτόκιο μετά το άτοκο μέρος
}

/** Ετήσια τοκοχρεολυτική δόση (annuity). */
function annuity(principal: number, annualRatePct: number, years: number): number {
  const P = pos(principal); const n = Math.max(1, Math.floor(pos(years)))
  const r = num(annualRatePct) / 100 / 12
  if (P <= 0) return 0
  if (r === 0) return P / n // ετήσια (χωρίς τόκο)
  const m = (P * r) / (1 - Math.pow(1 + r, -n * 12))
  return m * 12
}

export function leverage(input: LeverageInput): LeverageResult {
  const price = pos(input.price)
  const ltv = Math.max(0, Math.min(100, num(input.ltvPct)))
  const loan = price * ltv / 100
  const buyCosts = price * Math.max(0, num(input.buyCostsPct ?? 4)) / 100
  const equity = Math.max(0, price - loan + buyCosts)
  const annualRent = price * Math.max(0, num(input.grossYieldPct)) / 100
  const opex = annualRent * Math.max(0, Math.min(100, num(input.opexPctOfRent ?? 20))) / 100
  const noi = annualRent - opex
  // Άτοκο μέρος (π.χ. Σπίτι μου ΙΙ): μειώνει το μέσο επιτόκιο.
  const ifree = Math.max(0, Math.min(100, num(input.interestFreePct ?? 0))) / 100
  const effectiveRate = num(input.loanRatePct) * (1 - ifree)
  const annualDebtService = annuity(loan, effectiveRate, num(input.loanYears) || 25)
  const annualInterest = loan * effectiveRate / 100
  const cashFlow = noi - annualDebtService
  const totalInvested = price + buyCosts
  const unlevered = totalInvested > 0 ? (noi / totalInvested) * 100 : 0
  const coc = equity > 0 ? (cashFlow / equity) * 100 : 0
  return {
    equity: round2(equity), loan: round2(loan), annualRent: round2(annualRent), noi: round2(noi),
    annualDebtService: round2(annualDebtService), annualInterest: round2(annualInterest), cashFlow: round2(cashFlow),
    unleveredYield: round1(unlevered), cashOnCash: round1(coc), leverageBoost: round1(coc - unlevered),
    // Θετικό carry = ΚΑΘΑΡΗ (unlevered) απόδοση > κόστος δανείου (συνεπές με το NOI/cash-on-cash).
    positiveCarry: unlevered > effectiveRate, effectiveLoanRate: round2(effectiveRate),
  }
}

// ── Ιστορική προβολή (10/20ετία) ───────────────────────────────────────────
export interface ProjectionPoint { year: number; index: number; value: number; changePct: number }

/**
 * Εφαρμόζει σειρά ετήσιων μεταβολών (%) σε αρχική αξία, παράγοντας διαδρομή ανά έτος
 * για το timelapse. `changes`: [{year, pct}] σε χρονολογική σειρά.
 */
export function applySeries(startValue: number, changes: { year: number; pct: number }[]): {
  points: ProjectionPoint[]; endValue: number; totalReturnPct: number; cagrPct: number
} {
  const start = pos(startValue) || 100
  const points: ProjectionPoint[] = []
  let value = start
  let index = 100
  for (const c of changes) {
    const p = num(c.pct)
    value = value * (1 + p / 100)
    index = index * (1 + p / 100)
    points.push({ year: c.year, index: round1(index), value: round2(value), changePct: round1(p) })
  }
  const endValue = round2(value)
  const totalReturn = start > 0 ? ((endValue - start) / start) * 100 : 0
  const yearsN = changes.length
  const cagr = yearsN > 0 && start > 0 ? (Math.pow(endValue / start, 1 / yearsN) - 1) * 100 : 0
  return { points, endValue, totalReturnPct: round1(totalReturn), cagrPct: round1(cagr) }
}

// ── Σύγκριση με εναλλακτικές επενδύσεις ─────────────────────────────────────
export interface InvestmentOption { key: string; label: string; annualReturnPct: number }
export interface ComparisonRow extends InvestmentOption { futureValue: number; totalReturnPct: number }

/** Συγκρίνει ισόποση επένδυση σε διάφορες κατηγορίες, ανατοκισμένη σε `years`. */
export function compareInvestments(amount: number, years: number, options: InvestmentOption[]): ComparisonRow[] {
  const A = pos(amount)
  const n = Math.max(0, Math.floor(num(years)))
  return options.map(o => {
    const fv = A * Math.pow(1 + num(o.annualReturnPct) / 100, n)
    return { ...o, futureValue: round2(fv), totalReturnPct: round1(A > 0 ? ((fv - A) / A) * 100 : 0) }
  }).sort((a, b) => b.futureValue - a.futureValue)
}

/**
 * Συνολική ετήσια απόδοση ακινήτου (total return) = καθαρή απόδοση εισοδήματος
 * + εκτιμώμενη ετήσια ανατίμηση κεφαλαίου. Για σύγκριση με εναλλακτικές.
 */
export function propertyTotalReturn(netYieldPct: number, appreciationPct: number): number {
  return round1(num(netYieldPct) + num(appreciationPct))
}
