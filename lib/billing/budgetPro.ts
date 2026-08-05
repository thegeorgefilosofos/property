// lib/billing/budgetPro.ts
// Ο «εγκέφαλος» του προϋπολογισμού επιπέδου fintech — καθαρές, ελεγχόμενες
// συναρτήσεις για: ασφαλές διαθέσιμο (owner draw), κουμπαράδες/αποθεματικά
// (sinking funds), rollover, ανάλυση εσόδων βραχυχρόνιας (waterfall), αποδόσεις
// επένδυσης (NOI/cash-flow/cap rate), συστάσεις αποθεματικών, τέλος ανθεκτικότητας
// και όριο επαγγελματία. Χωρίς I/O — η UI τροφοδοτεί πραγματικά ποσά.

const r0 = (n: number) => Math.round(n)
const r2 = (n: number) => Math.round(n * 100) / 100

// ── A5 · Ασφαλές διαθέσιμο (Monzo «Left to Spend» / owner draw) ───────────────
// Έσοδα − δεσμευμένοι λογαριασμοί − εισφορές αποθεματικών − δόση δανείου.
export interface SafeToDistributeInput {
  income: number
  committedBills: number
  reserveContributions: number
  loanPayment: number
}
export function safeToDistribute(i: SafeToDistributeInput): number {
  return r0((i.income || 0) - (i.committedBills || 0) - (i.reserveContributions || 0) - (i.loanPayment || 0))
}

// ── A6 · Κουμπαράς / αποθεματικό με στόχο-ως-ημερομηνία (Revolut Vault × YNAB) ─
export interface ReservePlan { remaining: number; requiredMonthly: number; fundedPct: number }
export function reservePlan(target: number, current: number, monthsToTarget: number): ReservePlan {
  const remaining = Math.max(0, (target || 0) - (current || 0))
  const requiredMonthly = monthsToTarget > 0 ? Math.ceil(remaining / monthsToTarget) : remaining
  // Math.floor (όχι round): 99,5% δεν πρέπει να εμφανίζεται ως 100% «καλυμμένο» ενώ
  // λείπουν χρήματα — 100% μόνο όταν πράγματι καλύφθηκε ο στόχος.
  const fundedPct = target > 0 ? Math.min(100, Math.floor(((current || 0) / target) * 100)) : 0
  return { remaining: r0(remaining), requiredMonthly: r0(requiredMonthly), fundedPct }
}

// ── A6b · Πρόγραμμα αποταμίευσης: βάζω Χ κάθε μήνα (ημέρα Υ) — πότε πιάνω τον στόχο ──
// Η αντίστροφη λογική του reservePlan: αντί για «πόσο τον μήνα μέχρι μια ημερομηνία»,
// εδώ ο χρήστης ορίζει το ποσό ανά προσθήκη και μαθαίνει ΠΟΤΕ θα καλυφθεί ο στόχος και
// πότε είναι η επόμενη προσθήκη. Καθαρή (pure): το «σήμερα» δίνεται από τη UI.
export interface SavingsSchedule {
  reached: boolean
  contributionsToGoal: number   // πόσες προσθήκες ακόμη
  nextDate: string              // ISO επόμενης προσθήκης
  daysToNext: number
  goalDate: string              // ISO ημερομηνία επίτευξης στόχου
}
const isoOf = (dt: Date): string =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

export function savingsSchedule(
  target: number, current: number, perContribution: number, dayOfMonth: number,
  from: { y: number; m: number; d: number },
): SavingsSchedule | null {
  const fromDate = new Date(from.y, (from.m || 1) - 1, from.d || 1)
  const remaining = Math.max(0, (target || 0) - (current || 0))
  if (remaining <= 0) return { reached: true, contributionsToGoal: 0, nextDate: isoOf(fromDate), daysToNext: 0, goalDate: isoOf(fromDate) }
  if (!(perContribution > 0)) return null
  const day = Math.min(31, Math.max(1, Math.round(dayOfMonth || 1)))
  // Επόμενη προσθήκη: αν σήμερα ≤ ημέρα → αυτόν τον μήνα, αλλιώς τον επόμενο.
  const nextDate = from.d <= day
    ? new Date(from.y, (from.m || 1) - 1, day)
    : new Date(from.y, (from.m || 1), day)
  const contributionsToGoal = Math.ceil(remaining / perContribution)
  // Ο στόχος καλύπτεται στην τελευταία προσθήκη = επόμενη + (πλήθος − 1) μήνες.
  const goalDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + (contributionsToGoal - 1), day)
  const daysToNext = Math.max(0, Math.round((nextDate.getTime() - fromDate.getTime()) / 86400000))
  return { reached: false, contributionsToGoal, nextDate: isoOf(nextDate), daysToNext, goalDate: isoOf(goalDate) }
}

// ── B4 · Rollover: αδιάθετο μεταφέρεται μπροστά· υπέρβαση μειώνει την επόμενη ──
export interface Rollover { available: number; carryOut: number }
export function rolloverNext(budget: number, actual: number, carryIn = 0): Rollover {
  const available = (budget || 0) + (carryIn || 0)
  return { available: r0(available), carryOut: r0(available - (actual || 0)) }
}

// ── B1 · Waterfall εσόδου βραχυχρόνιας μίσθωσης (μεικτό → καθαρό) ─────────────
export interface StrWaterfallInput {
  gross: number
  platformFeePct: number      // προμήθεια πλατφόρμας (~15%)
  nights: number
  climateFeePerNight: number   // τέλος ανθεκτικότητας ανά διανυκτέρευση
  cleaningFee: number
  managementPct: number        // αμοιβή co-host/διαχείρισης επί μεικτού
  incomeTaxPct: number         // οριακός συντελεστής για κράτηση φόρου
}
export interface StrWaterfall {
  gross: number; platformFee: number; climateFee: number; cleaning: number
  management: number; taxReserve: number; net: number; netPerNight: number; marginPct: number
}
export function strWaterfall(i: StrWaterfallInput): StrWaterfall {
  const gross = Math.max(0, i.gross || 0)
  const platformFee = r0(gross * (i.platformFeePct || 0) / 100)
  const climateFee = r0((i.climateFeePerNight || 0) * (i.nights || 0))
  const management = r0(gross * (i.managementPct || 0) / 100)
  const cleaning = r0(Math.max(0, i.cleaningFee || 0))
  // Φορολογητέα βάση: μεικτό μείον προμήθειες/αμοιβές (απλοποίηση για κράτηση).
  const taxableBase = Math.max(0, gross - platformFee - management)
  const taxReserve = r0(taxableBase * (i.incomeTaxPct || 0) / 100)
  const net = r0(gross - platformFee - climateFee - cleaning - management - taxReserve)
  const netPerNight = (i.nights || 0) > 0 ? r0(net / i.nights) : net
  const marginPct = gross > 0 ? Math.round((net / gross) * 100) : 0
  return { gross, platformFee, climateFee, cleaning, management, taxReserve, net, netPerNight, marginPct }
}

// ── B7 · NOI / ταμειακή ροή / αποδόσεις (ο πίνακας του επενδυτή) ──────────────
// Το κεφάλαιο του δανείου ΔΕΝ είναι δαπάνη (μεταφορά ισολογισμού) — μόνο ο τόκος.
export interface InvestmentInput {
  annualIncome: number
  annualOpEx: number            // λειτουργικά (χωρίς δόση δανείου)
  annualLoanPayment: number     // συνολική δόση (κεφάλαιο + τόκος)
  purchasePrice: number
  equityInvested: number        // ίδια κεφάλαια (προκαταβολή + έξοδα)
}
export interface InvestmentReturns { noi: number; preTaxCashFlow: number; capRatePct: number; cashOnCashPct: number }
export function investmentReturns(i: InvestmentInput): InvestmentReturns {
  const noi = r0((i.annualIncome || 0) - (i.annualOpEx || 0))
  const preTaxCashFlow = r0(noi - (i.annualLoanPayment || 0))
  const capRatePct = (i.purchasePrice || 0) > 0 ? r2((noi / i.purchasePrice) * 100) : 0
  const cashOnCashPct = (i.equityInvested || 0) > 0 ? r2((preTaxCashFlow / i.equityInvested) * 100) : 0
  return { noi, preTaxCashFlow, capRatePct, cashOnCashPct }
}

// ── B3 · Συστάσεις αποθεματικών (κανόνες βέλτιστης πρακτικής) ─────────────────
// CapEx 8% νέο / 10% 15+ ετών / 15% 30+ ετών του ετήσιου ενοικίου (ή 1% της αξίας).
export interface ReserveRecommendation { capExMonthly: number; operatingReserve: number; vacancyMonthly: number; capExPct: number }
export function recommendedReserves(monthlyRent: number, propertyValue: number, propertyAgeYears: number): ReserveRecommendation {
  const rent = Math.max(0, monthlyRent || 0)
  const annualRent = rent * 12
  const capExPct = propertyAgeYears >= 30 ? 15 : propertyAgeYears >= 15 ? 10 : 8
  const capExAnnual = Math.max(annualRent * (capExPct / 100), (propertyValue || 0) * 0.01)
  return {
    capExMonthly: r0(capExAnnual / 12),
    operatingReserve: r0(rent * 0.2),   // ~20% ενός μηνιαίου ενοικίου ως ρευστό μαξιλάρι
    vacancyMonthly: r0(rent * 0.06),    // ~6% για κενές περιόδους
    capExPct,
  }
}

// ── ΑΦΑΙΡΕΘΗΚΕ: climateFeePerNight ─────────────────────────────────────────
// Επέστρεφε 1,50 €/νύχτα στην υψηλή περίοδο και 0,50 € στη χαμηλή. Η πηγή
// αλήθειας του τέλους ανθεκτικότητας είναι το lib/billing/greekTax.ts
// (CLIMATE_LEVY_STR_2025 / climateLevyRates): 8 € και 2 € για διαμέρισμα,
// 15 € και 4 € για μονοκατοικία άνω των 80 τ.μ.
//
// Δηλαδή αυτή η συνάρτηση υπολόγιζε το ΙΔΙΟ νόμιμο τέλος πέντε ως δέκα φορές
// μικρότερο. Το BillsBudget την καλούσε και τύπωνε «Τέλος ανθεκτικότητας» δίπλα
// στη Λογιστική που τύπωνε «Τέλος ανθεκτικότητας (ΤΑΚΚ)» από τη σωστή πηγή:
// 20 διανυκτερεύσεις τον Ιούλιο έδιναν 30 € στη μία οθόνη και 160 € στην άλλη.
//
// Δεν αντικαταστάθηκε με wrapper: το strWaterfall δέχεται ήδη τον συντελεστή ως
// όρισμα, οπότε ο καλών περνά climateLevyRates(sqm, isHouse) και δεν υπάρχει
// δεύτερο σημείο να ξαναδιαφωνήσει.

// ── B6 · Όριο επαγγελματία: 3+ ακίνητα βραχυχρόνιας → επιχειρηματική δραστηριότητα ─
export function strTaxRegime(propertyCount: number): 'individual' | 'business' {
  return (propertyCount || 0) >= 3 ? 'business' : 'individual'
}

// ── Κατανομή εσόδου σε δεσμεύσεις/αποθεματικά/διαθέσιμο (για γράφημα «assign») ─
export interface AllocationInput { income: number; committedBills: number; reserveContributions: number; loanPayment: number }
export interface Allocation { committedBills: number; reserves: number; loan: number; safe: number; assignedPct: number }
export function allocate(i: AllocationInput): Allocation {
  const income = Math.max(0, i.income || 0)
  const committedBills = Math.max(0, i.committedBills || 0)
  const reserves = Math.max(0, i.reserveContributions || 0)
  const loan = Math.max(0, i.loanPayment || 0)
  const safe = Math.max(0, income - committedBills - reserves - loan)
  const assigned = committedBills + reserves + loan
  const assignedPct = income > 0 ? Math.min(100, Math.round((assigned / income) * 100)) : 0
  return { committedBills: r0(committedBills), reserves: r0(reserves), loan: r0(loan), safe: r0(safe), assignedPct }
}
