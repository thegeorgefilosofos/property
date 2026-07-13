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
  // Στρογγυλοποιούμε ΜΙΑ φορά και βγάζουμε το positiveCarry από τα ΕΜΦΑΝΙΖΟΜΕΝΑ νούμερα,
  // ώστε η ένδειξη «θετική μόχλευση» να συμφωνεί πάντα με τα ποσοστά που βλέπει ο χρήστης.
  const unleveredR = round1(unlevered), effR = round2(effectiveRate)
  return {
    equity: round2(equity), loan: round2(loan), annualRent: round2(annualRent), noi: round2(noi),
    annualDebtService: round2(annualDebtService), annualInterest: round2(annualInterest), cashFlow: round2(cashFlow),
    unleveredYield: unleveredR, cashOnCash: round1(coc), leverageBoost: round1(coc - unlevered),
    positiveCarry: unleveredR > effR, effectiveLoanRate: effR,
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

// ── Προβολή-γραμμή (forward): ανάπτυξη αξίας/κεφαλαίου στον χρόνο ────────────
/** Σειρά {year 0..years, value} με ετήσιο σύνθετο ρυθμό (για γραμμικά γραφήματα). */
export function projectLine(start: number, annualPct: number, years: number): { year: number; value: number }[] {
  const s = Math.max(0, num(start)); const r = num(annualPct) / 100; const n = Math.max(1, Math.floor(num(years)))
  const out: { year: number; value: number }[] = []
  for (let t = 0; t <= n; t++) out.push({ year: t, value: round2(s * Math.pow(1 + r, t)) })
  return out
}

// ── Βαθμός απόδοσης (A–F) — signature σύνοψη ────────────────────────────────
export interface YieldGrade { grade: 'A' | 'B' | 'C' | 'D' | 'F'; score: number; label: string }
/**
 * Βαθμός 0–100 & γράμμα, με βάση την ΚΑΘΑΡΗ απόδοση σε σχέση με τον μέσο όρο της
 * περιοχής (σχετικό 55%) και το απόλυτο επίπεδο (45%). Ρεαλιστική βαθμονόμηση για
 * την ελληνική αγορά (μέση καθαρή ~3–4%). Θετική ταμειακή ροή δίνει μικρό μπόνους.
 */
export function yieldGrade(netYieldPct: number, regionAvgGrossPct: number, positiveCashFlow = true): YieldGrade {
  const net = num(netYieldPct)
  // Βαθμολογία ΣΧΕΤΙΚΑ με την περιοχή (οι ελληνικές αποδόσεις είναι χαμηλές σε απόλυτους
  // όρους): μέσος όρος → C, σαφώς πάνω → B/A, σαφώς κάτω → D/F. Ο μέσος περιοχής είναι
  // ΜΕΙΚΤΟΣ, οπότε η καθαρή αναφορά είναι ~1,5 μονάδες χαμηλότερα.
  const regionNet = Math.max(1, num(regionAvgGrossPct) - 1.5)
  const rel = regionNet > 0 ? net / regionNet : 1                    // 1 = στον μέσο όρο
  let score = 50 + (rel - 1) * 60                                    // rel 1→50 (C), 1,5→80, 0,5→20
  if (net >= 5) score += 5                                           // μικρό απόλυτο μπόνους/ποινή
  if (net < 2) score -= 8
  if (positiveCashFlow) score += 3
  score = Math.max(0, Math.min(100, Math.round(score)))
  const grade: YieldGrade['grade'] = score >= 82 ? 'A' : score >= 66 ? 'B' : score >= 50 ? 'C' : score >= 34 ? 'D' : 'F'
  const label = grade === 'A' ? 'Εξαιρετική απόδοση' : grade === 'B' ? 'Πολύ καλή απόδοση' : grade === 'C' ? 'Μέτρια απόδοση' : grade === 'D' ? 'Χαμηλή απόδοση' : 'Πολύ χαμηλή απόδοση'
  return { grade, score, label }
}

// ── Χρηματοοικονομική ανάλυση επένδυσης: IRR / NPV / DSCR ────────────────────
// Η «γλώσσα» των επενδυτών: εσωτερικός βαθμός απόδοσης (χρονική αξία χρήματος με
// έξοδο), καθαρή παρούσα αξία, δείκτης κάλυψης εξυπηρέτησης χρέους.

/** Καθαρή παρούσα αξία σειράς ταμειακών ροών (cashflows[0] στο t0). */
export function npv(annualRatePct: number, cashflows: number[]): number {
  const r = num(annualRatePct) / 100
  let acc = 0
  for (let t = 0; t < cashflows.length; t++) acc += num(cashflows[t]) / Math.pow(1 + r, t)
  return round2(acc)
}

/** Εσωτερικός βαθμός απόδοσης (%) — διχοτόμηση (robust, χωρίς απόκλιση). NaN αν δεν ορίζεται. */
export function irr(cashflows: number[]): number {
  if (cashflows.length < 2) return NaN
  const f = (rate: number) => { let a = 0; for (let t = 0; t < cashflows.length; t++) a += num(cashflows[t]) / Math.pow(1 + rate, t); return a }
  let lo = -0.9, hi = 10
  let flo = f(lo), fhi = f(hi)
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return NaN
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2, fm = f(mid)
    if (!isFinite(fm)) return NaN
    if (Math.abs(fm) < 1e-6) return round1(mid * 100)
    if (flo * fm < 0) { hi = mid; fhi = fm } else { lo = mid; flo = fm }
  }
  return round1(((lo + hi) / 2) * 100)
}

/** Ανεξόφλητο υπόλοιπο τοκοχρεολυτικού δανείου μετά από `elapsedYears`. */
export function remainingBalance(principal: number, annualRatePct: number, totalYears: number, elapsedYears: number): number {
  const P = pos(principal)
  const n = Math.max(1, Math.floor(pos(totalYears))) * 12
  const t = Math.min(n, Math.max(0, Math.floor(pos(elapsedYears)) * 12))
  const i = num(annualRatePct) / 100 / 12
  if (P <= 0) return 0
  if (i === 0) return round2(P * (1 - t / n))
  const bal = P * (Math.pow(1 + i, n) - Math.pow(1 + i, t)) / (Math.pow(1 + i, n) - 1)
  return round2(Math.max(0, bal))
}

export interface DealInput {
  price: number
  ltvPct: number
  loanRatePct: number
  loanYears: number
  grossYieldPct: number
  opexPctOfRent?: number      // default 20%
  buyCostsPct?: number        // default 4%
  interestFreePct?: number    // Σπίτι μου ΙΙ
  holdYears: number           // ορίζοντας κατοχής
  rentGrowthPct?: number      // ετήσια αύξηση NOI
  appreciationPct?: number    // ετήσια ανατίμηση αξίας
  sellCostsPct?: number       // κόστη πώλησης στην έξοδο (default 3%)
  discountRatePct?: number    // επιτόκιο προεξόφλησης για NPV (default 8%)
}
export interface DealResult {
  equity: number
  loan: number
  noi: number
  annualDebtService: number
  dscr: number               // NOI / ετήσια δόση (>1 = το εισόδημα καλύπτει το χρέος)
  cashflows: number[]        // t0..holdYears (t0 = −ίδια κεφάλαια)
  saleProceeds: number       // καθαρό προϊόν πώλησης στην έξοδο
  loanBalanceAtExit: number
  irrPct: number
  npv: number                // στο discountRatePct
  equityMultiple: number     // σύνολο διανομών / σύνολο επενδυμένων ιδίων
}

/** Πλήρης χρηματοοικονομική ανάλυση αγοράς-κατοχής-πώλησης (buy-hold-sell). */
export function dealAnalysis(input: DealInput): DealResult {
  const price = pos(input.price)
  const ltv = Math.max(0, Math.min(100, num(input.ltvPct)))
  const loan = price * ltv / 100
  const buyCosts = price * Math.max(0, num(input.buyCostsPct ?? 4)) / 100
  const equity = Math.max(0, price - loan + buyCosts)
  const annualRent = price * Math.max(0, num(input.grossYieldPct)) / 100
  const opex = annualRent * Math.max(0, Math.min(100, num(input.opexPctOfRent ?? 20))) / 100
  const noi = annualRent - opex
  const ifree = Math.max(0, Math.min(100, num(input.interestFreePct ?? 0))) / 100
  const effRate = num(input.loanRatePct) * (1 - ifree)
  const loanYears = num(input.loanYears) || 25
  const ads = annuity(loan, effRate, loanYears)
  const hold = Math.max(1, Math.floor(num(input.holdYears) || 10))
  const g = num(input.rentGrowthPct ?? 0) / 100
  const appr = num(input.appreciationPct ?? 0) / 100
  const sellCosts = Math.max(0, num(input.sellCostsPct ?? 3)) / 100
  const salePrice = price * Math.pow(1 + appr, hold)
  const balExit = remainingBalance(loan, effRate, loanYears, hold)
  const saleProceeds = salePrice * (1 - sellCosts) - balExit
  const cashflows: number[] = [round2(-equity)]
  let invested = equity, distributed = 0
  for (let t = 1; t <= hold; t++) {
    const noiT = noi * Math.pow(1 + g, t - 1)
    let cf = noiT - ads
    if (t === hold) cf += saleProceeds
    cashflows.push(round2(cf))
    if (cf >= 0) distributed += cf; else invested += -cf
  }
  return {
    equity: round2(equity), loan: round2(loan), noi: round2(noi), annualDebtService: round2(ads),
    dscr: ads > 0 ? round2(noi / ads) : Infinity, cashflows, saleProceeds: round2(saleProceeds),
    loanBalanceAtExit: balExit, irrPct: irr(cashflows), npv: npv(num(input.discountRatePct ?? 8), cashflows),
    equityMultiple: invested > 0 ? round2(distributed / invested) : 0,
  }
}
