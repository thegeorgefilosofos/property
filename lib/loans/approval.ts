// ═══════════════════════════════════════════════════════════════════════════
// «Θα εγκριθώ;» — καθαρή μηχανή πιθανότητας έγκρισης στεγαστικού δανείου.
// Χωρίς DOM/React — δοκιμάζεται με: npx tsx lib/loans/approval.test.ts
//
// Κριτήρια τραπεζών και ΤτΕ (2025-2026):
//  • Δείκτης δόσης προς εισόδημα (DSTI): 50% για όσους δανείζονται για πρώτη
//    φορά, 40% για τους υπόλοιπους.
//  • Δείκτης δανείου προς αξία (LTV): έως 90% για όσους δανείζονται για πρώτη
//    φορά, έως 80% για τους υπόλοιπους.
//
//  ΤΟ ΚΡΙΤΗΡΙΟ ΕΙΝΑΙ Ο ΠΡΩΤΟΑΓΟΡΑΣΤΗΣ, ΟΧΙ Η ΠΡΩΤΗ ΚΑΤΟΙΚΙΑ, και τα δύο όρια
//  είναι ΚΑΝΟΝΙΣΤΙΚΑ (ΠΕΕ 227/1/08.03.2024, ισχύς από 1.1.2025): ισχύουν σε
//  κάθε στεγαστικό με εξασφάλιση κατοικίας, όχι μόνο σε κρατικό πρόγραμμα.
//  • Ηλικία λήξης δανείου: συνήθως έως 75 ετών.
//  • Πιστοληπτική συμπεριφορά (Τειρεσίας): ενεργές δυσμενείς = απόρριψη.
//  • Σταθερότητα εισοδήματος: μόνιμη σχέση εργασίας ισχυρότερη από προσωρινή.
// Οι εκτιμήσεις είναι ενδεικτικές· η τελική απόφαση ανήκει στην τράπεζα.
// ═══════════════════════════════════════════════════════════════════════════
import { annuityMonthly } from './recommend'
import { maxMonthlyPayment, principalForPayment, DSTI_LIMIT } from './affordability'
import { fe, fp } from '../core/format';

export type EmploymentType =
  | 'employee_permanent'   // μισθωτός αορίστου
  | 'employee_temp'        // μισθωτός ορισμένου/εποχικός
  | 'freelancer'           // ελεύθερος επαγγελματίας
  | 'company'              // εταιρεία / νομικό πρόσωπο
  | 'pensioner'            // συνταξιούχος

export type CreditHistory = 'clean' | 'minor' | 'severe'

export interface ApprovalInput {
  incomeMonthly: number            // καθαρό μηνιαίο εισόδημα (€)
  existingMonthlyDebt?: number     // υφιστάμενες μηνιαίες δόσεις (€)
  amount: number                   // αιτούμενο ποσό δανείου (€)
  years: number                    // διάρκεια (έτη)
  ratePct: number                  // ενδεικτικό επιτόκιο (%)
  propertyValue: number            // αξία/τιμή ακινήτου (€)
  age: number                      // ηλικία δανειολήπτη (έτη)
  firstHome: boolean               // πρώτη κατοικία
  employment: EmploymentType
  yearsEmployed?: number           // έτη στην τρέχουσα εργασία/δραστηριότητα
  credit?: CreditHistory           // εγγραφές Τειρεσία
  hasGuarantor?: boolean           // ύπαρξη εγγυητή/συνοφειλέτη
  maxLtv?: number                  // ανώτατο LTV τράπεζας (π.χ. 80 ή 90)
  maxAgeAtEnd?: number             // ανώτατη ηλικία στη λήξη (προεπιλογή 75)
}

export type FactorKind = 'pass' | 'warn' | 'block'
export interface ApprovalFactor {
  kind: FactorKind
  label: string
  detail: string
}

export type ApprovalVerdict = 'high' | 'medium' | 'low' | 'blocked'

export interface ApprovalResult {
  verdict: ApprovalVerdict
  score: number                    // 0-100
  dstiPct: number                  // δείκτης δόσης (%)
  dstiLimitPct: number             // όριο (%)
  ltvPct: number                   // δείκτης δανείου προς αξία (%)
  maxLtv: number                   // όριο LTV
  ageAtEnd: number                 // ηλικία στη λήξη
  requestedMonthly: number         // δόση αιτούμενου ποσού
  factors: ApprovalFactor[]        // ανά κριτήριο (pass/warn/block)
  suggestions: string[]            // συγκεκριμένες, ποσοτικοποιημένες προτάσεις
}

// Ο ΜΟΡΦΟΠΟΙΗΤΗΣ ΕΥΡΩ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ. Αυτός εδώ στρογγυλοποιούσε στο ακέραιο
// («1.200 €» αντί για «1.200,00 €»), δηλαδή παραβίαζε τον κανόνα των δύο
// δεκαδικών σε κάθε πρόταση που παρήγαγε. Ο κανονικός ζει στο lib/core/format.ts
// και δεν εξαρτάται από React, ακριβώς ώστε να τον βλέπουν και οι βιβλιοθήκες.
// Το ίδιο ισχύει και για τα ποσοστά: ένας μορφοποιητής, δύο δεκαδικά.
const eur = fe;
const pct = fp;

const VERDICT_LABEL: Record<ApprovalVerdict, string> = {
  high: 'Υψηλή πιθανότητα έγκρισης',
  medium: 'Μέτρια πιθανότητα, υπάρχουν σημεία προσοχής',
  low: 'Χαμηλή πιθανότητα με τα τρέχοντα στοιχεία',
  blocked: 'Πολύ χαμηλή, υπάρχει ανασταλτικός παράγοντας',
}

export function verdictLabel(v: ApprovalVerdict): string { return VERDICT_LABEL[v] }

/**
 * Υπολογίζει πιθανότητα έγκρισης, τους παράγοντες που την επηρεάζουν και
 * συγκεκριμένες προτάσεις βελτίωσης (π.χ. πόσο να μειωθεί το ποσό).
 */
export function assessApproval(input: ApprovalInput): ApprovalResult {
  const income = Math.max(0, input.incomeMonthly)
  const existing = Math.max(0, input.existingMonthlyDebt ?? 0)
  const amount = Math.max(0, input.amount)
  const years = Math.max(1, input.years)
  const rate = Math.max(0, input.ratePct)
  const pv = Math.max(0, input.propertyValue)
  const age = Math.max(0, input.age)
  const maxLtv = input.maxLtv ?? (input.firstHome ? 90 : 80)
  const maxAgeAtEnd = input.maxAgeAtEnd ?? 75
  const credit: CreditHistory = input.credit ?? 'clean'
  const employment = input.employment
  const yearsEmployed = input.yearsEmployed ?? 0
  const hasGuarantor = !!input.hasGuarantor

  const limit = input.firstHome ? DSTI_LIMIT.firstHome : DSTI_LIMIT.other
  // Η ΔΟΣΗ ΔΕΝ ΣΤΡΟΓΓΥΛΟΠΟΙΕΙΤΑΙ ΕΔΩ. Ήταν `Math.round(...)`, οπότε η ίδια οθόνη
  // έδειχνε «750,94 €» στον δείκτη και «751,00 €» εδώ, για το ίδιο δάνειο. Η
  // στρογγυλοποίηση είναι απόφαση εμφάνισης, όχι υπολογισμού — και ο δείκτης
  // δόσης μετακινείται λιγότερο από 0,01 μονάδα από τη διαφορά.
  const requestedMonthly = annuityMonthly(amount, rate, years)
  const dsti = income > 0 ? (requestedMonthly + existing) / income : 1
  const ltv = pv > 0 ? (amount / pv) * 100 : 0
  const ageAtEnd = age + years

  const factors: ApprovalFactor[] = []
  const suggestions: string[] = []
  let score = 100
  let hardBlock = false

  // ── Δείκτης δόσης προς εισόδημα (DSTI) ────────────────────────────────────
  const dstiPct = dsti * 100
  const limitPct = limit * 100
  if (income <= 0) {
    factors.push({ kind: 'block', label: 'Εισόδημα', detail: 'Δεν έχει δηλωθεί μηνιαίο εισόδημα.' })
    hardBlock = true
  } else if (dsti <= limit) {
    factors.push({ kind: 'pass', label: 'Δείκτης δόσης', detail: `Η δόση δεσμεύει ${pct(dstiPct)} του εισοδήματος, εντός του ορίου ${pct(limitPct)}.` })
  } else if (dsti <= limit + 0.05) {
    score -= 18
    factors.push({ kind: 'warn', label: 'Δείκτης δόσης οριακός', detail: `${pct(dstiPct)} έναντι ορίου ${pct(limitPct)}. Οριακή υπέρβαση.` })
  } else {
    score -= 40
    if (dsti > limit + 0.15) hardBlock = true
    factors.push({ kind: 'block', label: 'Δείκτης δόσης πάνω από το όριο', detail: `${pct(dstiPct)} έναντι ορίου ${pct(limitPct)}. Η δόση υπερβαίνει τη δανειοληπτική ικανότητα.` })
  }
  // Πρόταση: μείωση ποσού / επιμήκυνση διάρκειας ώστε να πέσει ο δείκτης.
  if (income > 0 && dsti > limit) {
    const maxMonthly = maxMonthlyPayment(income, input.firstHome, existing)
    const targetLoan = principalForPayment(maxMonthly, rate, years)
    if (targetLoan > 0 && targetLoan < amount) {
      suggestions.push(`Μείωσε το ποσό κατά ${eur(amount - targetLoan)} (σε ${eur(targetLoan)}) ώστε ο δείκτης δόσης να πέσει στο ${pct(limitPct)}.`)
    }
    // Ελάχιστη διάρκεια ώστε η δόση να χωρά στο όριο (αν εφικτό).
    if (maxMonthly > 0) {
      let neededYears = 0
      for (let y = years; y <= 40; y++) {
        if (annuityMonthly(amount, rate, y) <= maxMonthly + 0.5) { neededYears = y; break }
      }
      if (neededYears > years && neededYears <= 40 && ageAtEnd < maxAgeAtEnd) {
        suggestions.push(`Επιμήκυνε τη διάρκεια σε ${neededYears} έτη ώστε η δόση να χωρά στο όριο.`)
      }
    }
  }

  // ── Δείκτης δανείου προς αξία (LTV) ───────────────────────────────────────
  if (pv <= 0) {
    factors.push({ kind: 'warn', label: 'Αξία ακινήτου', detail: 'Δεν έχει δηλωθεί αξία ακινήτου, ο δείκτης δανείου προς αξία δεν ελέγχθηκε.' })
    score -= 5
  } else if (ltv <= maxLtv) {
    factors.push({ kind: 'pass', label: 'Δάνειο προς αξία', detail: `${pct(ltv)} της αξίας, εντός του ορίου ${pct(maxLtv)}.` })
  } else if (ltv <= maxLtv + 5) {
    score -= 12
    factors.push({ kind: 'warn', label: 'Δάνειο προς αξία οριακό', detail: `${pct(ltv)} έναντι ορίου ${pct(maxLtv)}. Χρειάζεται μεγαλύτερη προκαταβολή.` })
  } else {
    score -= 25
    if (ltv > maxLtv + 15) hardBlock = true
    factors.push({ kind: 'block', label: 'Δάνειο προς αξία πάνω από το όριο', detail: `${pct(ltv)} έναντι ορίου ${pct(maxLtv)}.` })
  }
  if (pv > 0 && ltv > maxLtv) {
    const maxLoanByLtv = pv * maxLtv / 100
    suggestions.push(`Αύξησε την προκαταβολή κατά ${eur(amount - maxLoanByLtv)} ή μείωσε το ποσό σε ${eur(maxLoanByLtv)} (${pct(maxLtv)} της αξίας).`)
  }

  // ── Ηλικία στη λήξη ───────────────────────────────────────────────────────
  if (age <= 0) {
    factors.push({ kind: 'warn', label: 'Ηλικία', detail: 'Δεν έχει δηλωθεί ηλικία.' })
  } else if (ageAtEnd <= maxAgeAtEnd) {
    factors.push({ kind: 'pass', label: 'Ηλικία στη λήξη', detail: `${ageAtEnd} ετών στη λήξη, εντός του ορίου ${maxAgeAtEnd}.` })
  } else {
    score -= 20
    hardBlock = true
    factors.push({ kind: 'block', label: 'Ηλικία στη λήξη πάνω από το όριο', detail: `${ageAtEnd} ετών στη λήξη, το όριο είναι ${maxAgeAtEnd}.` })
    const maxYears = Math.max(1, maxAgeAtEnd - age)
    suggestions.push(`Μείωσε τη διάρκεια σε έως ${maxYears} έτη ώστε η λήξη να είναι πριν τα ${maxAgeAtEnd}.`)
  }

  // ── Πιστοληπτική συμπεριφορά (Τειρεσίας) ──────────────────────────────────
  if (credit === 'clean') {
    factors.push({ kind: 'pass', label: 'Πιστοληπτικό προφίλ', detail: 'Χωρίς δυσμενή στοιχεία στον Τειρεσία.' })
  } else if (credit === 'minor') {
    score -= 15
    factors.push({ kind: 'warn', label: 'Παλαιότερες εγγραφές', detail: 'Τακτοποιημένες ή ήσσονος σημασίας εγγραφές. Επιβεβαίωσε ότι δεν είναι ενεργές.' })
    suggestions.push('Τακτοποίησε τυχόν οφειλές και επανέλεγξε τον Τειρεσία πριν την αίτηση.')
  } else {
    score -= 45
    hardBlock = true
    factors.push({ kind: 'block', label: 'Ενεργές δυσμενείς εγγραφές', detail: 'Ενεργές εγγραφές στον Τειρεσία οδηγούν συνήθως σε απόρριψη.' })
    suggestions.push('Τακτοποίησε τις ενεργές οφειλές και επανέλεγξε σε 6 μήνες, ή εξέτασε ρύθμιση.')
  }

  // ── Σταθερότητα εισοδήματος / απασχόληση ──────────────────────────────────
  if (employment === 'employee_permanent' || employment === 'pensioner') {
    factors.push({ kind: 'pass', label: 'Σταθερότητα εισοδήματος', detail: employment === 'pensioner' ? 'Σταθερό συνταξιοδοτικό εισόδημα.' : 'Μισθωτός αορίστου χρόνου, σταθερό προφίλ.' })
  } else if (employment === 'company') {
    factors.push({ kind: 'pass', label: 'Εισόδημα επιχείρησης', detail: 'Αξιολόγηση βάσει ισολογισμών και κερδοφορίας.' })
  } else if (employment === 'freelancer') {
    score -= 8
    factors.push({ kind: 'warn', label: 'Ελεύθερος επαγγελματίας', detail: 'Η τράπεζα εξετάζει μέσο όρο εισοδήματος διετίας και συνέπεια δηλώσεων.' })
    if (yearsEmployed > 0 && yearsEmployed < 2) suggestions.push('Ιδανικά χρειάζονται 2 έτη δραστηριότητας με σταθερές δηλώσεις.')
  } else {
    score -= 12
    factors.push({ kind: 'warn', label: 'Προσωρινή απασχόληση', detail: 'Οι συμβάσεις ορισμένου χρόνου βαθμολογούνται δυσμενέστερα.' })
  }

  // ── Ελάχιστο εισόδημα / εγγυητής ──────────────────────────────────────────
  if (income > 0 && income < 700) {
    score -= 10
    factors.push({ kind: 'warn', label: 'Χαμηλό εισόδημα', detail: 'Χαμηλό μηνιαίο εισόδημα περιορίζει το εγκρίσιμο ποσό.' })
  }
  if (hasGuarantor) {
    score = Math.min(100, score + 6)
    factors.push({ kind: 'pass', label: 'Εγγυητής', detail: 'Η ύπαρξη εγγυητή/συνοφειλέτη ενισχύει την αίτηση.' })
  } else if (!hardBlock && (dsti > limit - 0.05 || (income > 0 && income < 900))) {
    suggestions.push('Η προσθήκη εγγυητή ή συνοφειλέτη μπορεί να ενισχύσει σημαντικά την αίτηση.')
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  let verdict: ApprovalVerdict
  if (hardBlock) verdict = 'blocked'
  else if (score >= 80) verdict = 'high'
  else if (score >= 55) verdict = 'medium'
  else verdict = 'low'

  // Θετική επισήμανση όταν δεν υπάρχουν προτάσεις και το προφίλ είναι ισχυρό.
  if (suggestions.length === 0 && verdict === 'high') {
    suggestions.push('Το προφίλ είναι ισχυρό. Ζήτησε γραπτές προσφορές (ESIS) από 2-3 τράπεζες και σύγκρινε το ΣΕΠΠΕ.')
  }

  return {
    verdict, score,
    dstiPct, dstiLimitPct: limitPct,
    ltvPct: ltv, maxLtv,
    ageAtEnd,
    requestedMonthly,
    factors, suggestions,
  }
}
