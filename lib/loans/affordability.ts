// ═══════════════════════════════════════════════════════════════════════════
// Καθαρή μηχανή δανειοληπτικής ικανότητας, ενοικίασης-vs-αγοράς και «insight».
// Χωρίς DOM/React — δοκιμάζεται με: npx tsx lib/loans/affordability.test.ts
// Πηγές ορίων: Τράπεζα Ελλάδος (δείκτης δόσης προς εισόδημα, από 1/1/2025):
//   50% για όσους δανείζονται για ΠΡΩΤΗ ΦΟΡΑ, 40% για τους υπόλοιπους. Το
//   κριτήριο είναι ο πρωτοαγοραστής, όχι η πρώτη κατοικία: όποιος έχει ήδη
//   ακίνητο ή προηγούμενο στεγαστικό μετρά στο 40% (ΠΕΕ 227/1/08.03.2024).
// ═══════════════════════════════════════════════════════════════════════════
import { annuityMonthly } from './recommend'
import { fe, fp } from '../core/format'

/**
 * ΤΟ ΟΝΟΜΑ ΗΤΑΝ ΤΟ ΣΦΑΛΜΑ. Λεγόταν `firstHome`, δηλαδή «πρώτη κατοικία» και
 * το μενού της οθόνης έλεγε το ίδιο. Ο κανόνας όμως της ΠΕΕ 227/1/08.03.2024
 * δεν μιλά για πρώτη κατοικία: μιλά για όσους δανείζονται για ΠΡΩΤΗ ΦΟΡΑ.
 *
 * Η διαφορά αλλάζει το αποτέλεσμα, δεν είναι διατύπωση: όποιος αγοράζει την
 * κύρια κατοικία του έχοντας ήδη ένα εξοχικό, ή έχοντας ξεπληρώσει παλιό
 * στεγαστικό, δικαιούται 40% και 80% — και η εφαρμογή του υποσχόταν 50% και
 * 90%. Δηλαδή έλεγε «περνάς» σε κάποιον που δεν περνά.
 */
export const DSTI_LIMIT = { firstTimeBuyer: 0.5, other: 0.4 } as const

/** Στρογγυλοποίηση σε ακέραιο, με φύλαξη για μη πεπερασμένα. */
function r0(n: number): number { return Number.isFinite(n) ? Math.round(n) : 0 }

/**
 * Μέγιστη μηνιαία δόση βάσει καθαρού μηνιαίου εισοδήματος και ορίου ΤτΕ.
 * incomeMonthly: καθαρό μηνιαίο εισόδημα (€). existingMonthlyDebt: υφιστάμενες
 * μηνιαίες δόσεις που μετρούν στον δείκτη.
 */
export function maxMonthlyPayment(
  incomeMonthly: number, firstTimeBuyer: boolean, existingMonthlyDebt = 0
): number {
  const limit = firstTimeBuyer ? DSTI_LIMIT.firstTimeBuyer : DSTI_LIMIT.other
  return Math.max(0, incomeMonthly * limit - Math.max(0, existingMonthlyDebt))
}

/**
 * Αντιστροφή της τοκοχρεολυτικής φόρμουλας: το μέγιστο κεφάλαιο δανείου που
 * αντιστοιχεί σε μια μηνιαία δόση, για δεδομένο επιτόκιο και διάρκεια.
 */
export function principalForPayment(monthlyPayment: number, annualRatePct: number, years: number): number {
  const n = Math.round(years * 12)
  if (monthlyPayment <= 0 || n <= 0) return 0
  const i = annualRatePct / 100 / 12
  if (i === 0) return r0(monthlyPayment * n)
  return r0(monthlyPayment * (1 - Math.pow(1 + i, -n)) / i)
}

export interface AffordabilityResult {
  maxMonthly: number          // μέγιστη δόση/μήνα βάσει ορίου
  maxLoan: number             // μέγιστο κεφάλαιο δανείου
  dstiUsedPct: number         // ποσοστό εισοδήματος που δεσμεύει η επιθυμητή δόση
  requestedMonthly: number    // δόση για το επιθυμητό ποσό
  affordable: boolean         // αν χωράει στο όριο
  gapMonthly: number          // πόσο ξεπερνά (θετικό = υπέρβαση)
  limitPct: number            // 0.5 ή 0.4
}

/** Ολοκληρωμένη ανάλυση δανειοληπτικής ικανότητας για ένα επιθυμητό ποσό. */
export function affordability(opts: {
  incomeMonthly: number
  firstTimeBuyer: boolean
  desiredAmount: number
  ratePct: number
  years: number
  existingMonthlyDebt?: number
}): AffordabilityResult {
  const { incomeMonthly, firstTimeBuyer, desiredAmount, ratePct, years } = opts
  const existing = Math.max(0, opts.existingMonthlyDebt ?? 0)
  const limitPct = firstTimeBuyer ? DSTI_LIMIT.firstTimeBuyer : DSTI_LIMIT.other
  const maxMonthly = maxMonthlyPayment(incomeMonthly, firstTimeBuyer, existing)
  const maxLoan = principalForPayment(maxMonthly, ratePct, years)
  const requestedMonthly = r0(annuityMonthly(Math.max(0, desiredAmount), ratePct, years))
  const dstiUsedPct = incomeMonthly > 0 ? ((requestedMonthly + existing) / incomeMonthly) * 100 : 0
  return {
    maxMonthly, maxLoan,
    dstiUsedPct: Math.round(dstiUsedPct * 10) / 10,
    requestedMonthly,
    affordable: requestedMonthly <= maxMonthly + 0.5,
    gapMonthly: r0(requestedMonthly - maxMonthly),
    limitPct,
  }
}

export interface RentVsBuyResult {
  buyNetCostByYear: number[]   // σωρευτικό καθαρό κόστος αγοράς ανά έτος (0..horizon)
  rentCostByYear: number[]     // σωρευτικό κόστος ενοικίασης ανά έτος
  breakEvenYear: number | null // πρώτο έτος όπου η αγορά βγαίνει φθηνότερη (ή null)
  buyNetAtHorizon: number
  rentAtHorizon: number
  advantageAtHorizon: number   // θετικό = η αγορά συμφέρει στον ορίζοντα
}

/**
 * Ενοικίαση vs αγορά (Total Cost of Ownership) σε βάθος «horizon» ετών.
 * Καθαρό κόστος αγοράς = προκαταβολή + έξοδα + τόκοι + συντήρηση/ΕΝΦΙΑ
 *   − συσσωρευμένο κεφάλαιο (equity) − ανατίμηση. Η ενοικίαση αυξάνεται με rentGrowth.
 * Όλα ονομαστικά (χωρίς προεξόφληση) — απλό, έντιμο, διαφανές.
 */
export function rentVsBuy(opts: {
  price: number
  downPayment: number
  ratePct: number
  years: number
  monthlyRent: number
  rentGrowthPct?: number       // ετήσια αύξηση ενοικίου
  appreciationPct?: number     // ετήσια ανατίμηση ακινήτου
  purchaseCosts?: number       // ΦΜΑ + συμβολαιογράφος + λοιπά (εφάπαξ)
  annualOwnerCostsPct?: number // συντήρηση + ΕΝΦΙΑ + ασφάλεια, % της αξίας/έτος
  horizonYears?: number
}): RentVsBuyResult {
  const price = Math.max(0, opts.price)
  const down = Math.min(Math.max(0, opts.downPayment), price)
  const loan = Math.max(0, price - down)
  const years = Math.max(1, Math.round(opts.years))
  const horizon = Math.max(1, Math.round(opts.horizonYears ?? Math.min(years, 15)))
  const i = opts.ratePct / 100 / 12
  const rentGrowth = (opts.rentGrowthPct ?? 2) / 100
  const appr = (opts.appreciationPct ?? 2) / 100
  const purchaseCosts = opts.purchaseCosts ?? Math.round(price * 0.04)
  const ownerCostsPct = (opts.annualOwnerCostsPct ?? 1.5) / 100
  const monthly = annuityMonthly(loan, opts.ratePct, years)

  // Έτος 0: η προκαταβολή μετατρέπεται άμεσα σε περιουσία (equity = down), οπότε
  // το καθαρό κόστος αγοράς είναι μόνο τα έξοδα συναλλαγής — συνεπές με τον βρόχο
  // παρακάτω (cashOut − equity). Αν το χρεώναμε ως down+costs θα διπλομετρούσαμε.
  const buyNetCostByYear: number[] = [r0(purchaseCosts)]
  const rentCostByYear: number[] = [0]

  let balance = loan
  let cumInterest = 0
  let cumPayments = 0
  let cumOwnerCosts = 0
  let cumRent = 0
  let rentThisYear = opts.monthlyRent * 12

  for (let y = 1; y <= horizon; y++) {
    // 12 μηνιαίες δόσεις: διαχωρισμός τόκου/κεφαλαίου
    for (let m = 0; m < 12 && balance > 0; m++) {
      const interest = balance * i
      const principal = Math.min(balance, monthly - interest)
      balance -= principal
      cumInterest += interest
      cumPayments += (interest + principal)
    }
    cumOwnerCosts += price * ownerCostsPct
    const propValue = price * Math.pow(1 + appr, y)
    const equity = propValue - balance          // αξία − υπόλοιπο δανείου
    // Καθαρό κόστος αγοράς = μετρητά που «κάηκαν» − καθαρή θέση περιουσίας
    const cashOut = down + purchaseCosts + cumPayments + cumOwnerCosts
    buyNetCostByYear.push(r0(cashOut - equity))

    cumRent += rentThisYear
    rentCostByYear.push(r0(cumRent))
    rentThisYear *= (1 + rentGrowth)
  }

  let breakEvenYear: number | null = null
  for (let y = 1; y <= horizon; y++) {
    if (buyNetCostByYear[y] <= rentCostByYear[y]) { breakEvenYear = y; break }
  }

  return {
    buyNetCostByYear, rentCostByYear, breakEvenYear,
    buyNetAtHorizon: buyNetCostByYear[horizon],
    rentAtHorizon: rentCostByYear[horizon],
    advantageAtHorizon: r0(rentCostByYear[horizon] - buyNetCostByYear[horizon]),
  }
}

/**
 * «Insight της ημέρας»: σύντομη, χρήσιμη επισήμανση βάσει τρέχοντος Euribor και
 * του δανείου του χρήστη. Καθαρή συνάρτηση — δέχεται τα δεδομένα, επιστρέφει κείμενο.
 * Επιστρέφει null όταν δεν υπάρχει κάτι ουσιώδες να πει (δεν κουράζουμε).
 */
export function euriborInsight(opts: {
  euribor3m: number
  euriborPrev?: number         // προηγούμενη τιμή για σύγκριση
  loanAmount?: number
  ratePct?: number
  years?: number
  rateType?: RateLike
}): string | null {
  const { euribor3m } = opts
  const prev = opts.euriborPrev
  const amount = opts.loanAmount ?? 0
  const years = opts.years ?? 25
  if (prev !== undefined && Number.isFinite(prev)) {
    const delta = euribor3m - prev
    if (Math.abs(delta) >= 0.05 && amount > 0 && opts.ratePct) {
      const base = opts.ratePct
      const other = base + delta
      const save = (annuityMonthly(amount, base, years) - annuityMonthly(amount, other, years)) * years * 12
      if (delta < 0 && save > 0) {
        return `Το Euribor 3 μηνών υποχώρησε κατά ${fp(Math.abs(delta))}. Σε κυμαινόμενο δάνειο ${fe(amount)}, αυτό αντιστοιχεί σε εξοικονόμηση περίπου ${fe(save)} στη διάρκεια.`
      }
      if (delta > 0) {
        return `Το Euribor 3 μηνών ανέβηκε κατά ${fp(delta)}. Αν το δάνειό σου είναι κυμαινόμενο, η δόση επιβαρύνεται· αξίζει να εξετάσεις σταθερό επιτόκιο.`
      }
    }
  }
  if (euribor3m <= 2.2) {
    return `Το Euribor 3 μηνών είναι στο ${fp(euribor3m)}, από τα χαμηλότερα των τελευταίων ετών. Καλή στιγμή για σύγκριση σταθερών προσφορών και για αναχρηματοδότηση παλαιών κυμαινόμενων δανείων.`
  }
  if (euribor3m >= 3.5) {
    return `Το Euribor 3 μηνών είναι υψηλό (${fp(euribor3m)}). Το σταθερό επιτόκιο προσφέρει προβλεψιμότητα έναντι περαιτέρω αυξήσεων.`
  }
  return null
}

type RateLike = 'fixed' | 'variable' | 'mixed'
