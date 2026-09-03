// ═══════════════════════════════════════════════════════════════════════════
// Ανάλυση προσφοράς ESIS (Τυποποιημένο Ευρωπαϊκό Δελτίο Πληροφοριών).
// Διαβάζει τα βασικά μεγέθη μιας τραπεζικής προσφοράς και αποκαλύπτει το
// πραγματικό κόστος: ΣΕΠΠΕ (APRC) έναντι ονομαστικού επιτοκίου, έξοδα, ασφάλειες
// και «κρυφές» χρεώσεις. Χωρίς DOM/React — δοκιμή: npx tsx lib/loans/esis.test.ts
//
// ΣΕΠΠΕ = Συνολικό Ετήσιο Πραγματικό Ποσοστό Επιβάρυνσης (APRC): ενσωματώνει
// τόκους + έξοδα + υποχρεωτικές ασφάλειες, ώστε να συγκρίνονται προσφορές.
// ═══════════════════════════════════════════════════════════════════════════
import { annuityMonthly } from './recommend'
import { fe } from '../core/format'

export interface EsisFee { label: string; amount: number }

export interface EsisInput {
  amount: number                    // ποσό δανείου (€)
  years: number                     // διάρκεια (έτη)
  nominalRatePct?: number           // ονομαστικό επιτόκιο (ΝΕΕ) %
  aprcPct?: number                  // ΣΕΠΠΕ / APRC %
  monthlyPayment?: number           // δόση (€), αν αναγράφεται
  totalPayable?: number             // συνολικό πληρωτέο ποσό (€), αν αναγράφεται
  fees?: EsisFee[]                  // εφάπαξ έξοδα (φάκελος, εκτίμηση, νομικός…)
  insuranceMonthly?: number         // ασφάλιστρα/μήνα (€)
  prepaymentPenalty?: boolean       // ρήτρα πρόωρης εξόφλησης
  rateType?: 'fixed' | 'variable' | 'mixed'
  bank?: string
}

export type EsisVerdict = 'good' | 'fair' | 'expensive'
export type FlagKind = 'info' | 'warn' | 'bad'
export interface EsisFlag { kind: FlagKind; label: string; detail: string }

export interface EsisAnalysis {
  monthly: number
  totalInterest: number
  totalFees: number
  totalInsurance: number
  totalCost: number                 // σύνολο τόκων + εξόδων + ασφαλειών (πέραν κεφαλαίου)
  nominal: number
  aprc: number
  aprcGapPct: number                // ΣΕΠΠΕ − ονομαστικό (κόστος πέραν τόκου)
  vsMarketPct: number | null        // ΣΕΠΠΕ − δείκτης αγοράς
  verdict: EsisVerdict
  score: number                     // 0-100 (καθαρότητα/ανταγωνιστικότητα προσφοράς)
  flags: EsisFlag[]
}

function r0(n: number): number { return Number.isFinite(n) ? Math.round(n) : 0 }

/**
 * Εκτίμηση ΣΕΠΠΕ όταν δεν δίνεται: επιμερίζει τα εφάπαξ έξοδα και τα ασφάλιστρα
 * στη διάρκεια ως προσαύξηση επί του ονομαστικού. Προσεγγιστικό αλλά ρεαλιστικό.
 */
function estimateAprc(amount: number, years: number, nominal: number, totalFees: number, insuranceMonthly: number): number {
  if (amount <= 0 || years <= 0) return nominal
  const feePctPerYear = (totalFees / amount) / years * 100
  const insPctPerYear = (insuranceMonthly * 12 / amount) * 100
  return Math.round((nominal + feePctPerYear + insPctPerYear) * 100) / 100
}

/** Πλήρης ανάλυση προσφοράς ESIS με ετυμηγορία και επισημάνσεις. */
export function analyzeEsis(input: EsisInput, opts?: { benchmarkAprc?: number }): EsisAnalysis {
  const amount = Math.max(0, input.amount)
  const years = Math.max(1, input.years)
  const nominal = Math.max(0, input.nominalRatePct ?? 0)
  const fees = (input.fees ?? []).filter(f => Number.isFinite(f.amount) && f.amount > 0)
  const totalFees = r0(fees.reduce((s, f) => s + f.amount, 0))
  const insMonthly = Math.max(0, input.insuranceMonthly ?? 0)
  const totalInsurance = r0(insMonthly * 12 * years)

  const monthly = r0(input.monthlyPayment && input.monthlyPayment > 0
    ? input.monthlyPayment
    : annuityMonthly(amount, nominal, years))
  // ΣΤΡΟΓΓΥΛΟΠΟΙΗΣΗ ΠΡΙΝ ΤΟΝ ΠΟΛΛΑΠΛΑΣΙΑΣΜΟ, ΕΠΙ ΤΡΙΑΚΟΣΙΑ ΕΞΗΝΤΑ. Η δόση
  // στρογγυλοποιούνταν στο ευρώ και μετά πολλαπλασιαζόταν με τους μήνες: σε
  // 100.000 € με 2,50% για 35 έτη, η πραγματική δόση είναι 357,4952 και οι
  // συνολικοί τόκοι 50.148 € — η οθόνη έγραφε 49.940 €, δηλαδή 208 € λιγότερους.
  // Το `lib/loans/recommend` το κάνει ήδη σωστά· εδώ αντιγράφεται από εκεί.
  const exactMonthly = input.monthlyPayment && input.monthlyPayment > 0
    ? input.monthlyPayment
    : annuityMonthly(amount, nominal, years)
  const totalInterest = input.totalPayable && input.totalPayable > amount
    ? r0(input.totalPayable - amount)
    : r0(exactMonthly * years * 12 - amount)
  const totalCost = totalInterest + totalFees + totalInsurance

  const aprc = input.aprcPct && input.aprcPct > 0
    ? Math.round(input.aprcPct * 100) / 100
    : estimateAprc(amount, years, nominal, totalFees, insMonthly)
  const aprcGapPct = Math.round((aprc - nominal) * 100) / 100

  const benchmark = opts?.benchmarkAprc
  const vsMarketPct = benchmark != null ? Math.round((aprc - benchmark) * 100) / 100 : null

  const flags: EsisFlag[] = []
  let score = 100

  // ΣΕΠΠΕ έναντι ονομαστικού: πόσο προσθέτουν έξοδα και ασφάλειες.
  if (aprcGapPct >= 0.6) {
    score -= 22
    flags.push({ kind: 'bad', label: 'Μεγάλη απόκλιση ΣΕΠΠΕ από το ονομαστικό', detail: `Το ΣΕΠΠΕ (${aprc}%) είναι ${aprcGapPct} μονάδες πάνω από το ονομαστικό (${nominal}%). Τα έξοδα και οι ασφάλειες βαραίνουν σημαντικά το πραγματικό κόστος.` })
  } else if (aprcGapPct >= 0.3) {
    score -= 10
    flags.push({ kind: 'warn', label: 'Έξοδα και ασφάλειες ανεβάζουν το κόστος', detail: `Το ΣΕΠΠΕ (${aprc}%) υπερβαίνει το ονομαστικό (${nominal}%) κατά ${aprcGapPct} μονάδες.` })
  } else if (nominal > 0) {
    flags.push({ kind: 'info', label: 'Διαφανές κόστος', detail: `Το ΣΕΠΠΕ (${aprc}%) είναι κοντά στο ονομαστικό (${nominal}%).` })
  }

  // Δείκτης αγοράς.
  if (vsMarketPct != null) {
    if (vsMarketPct <= 0.2) {
      flags.push({ kind: 'info', label: 'Ανταγωνιστικό επιτόκιο', detail: `Το ΣΕΠΠΕ είναι στα επίπεδα της αγοράς${vsMarketPct <= -0.1 ? ' ή καλύτερο' : ''}.` })
    } else if (vsMarketPct <= 0.6) {
      score -= 12
      flags.push({ kind: 'warn', label: 'Πάνω από την αγορά', detail: `Το ΣΕΠΠΕ είναι ${vsMarketPct} μονάδες πάνω από τον δείκτη αγοράς. Ζήτησε βελτίωση ή σύγκρινε άλλη τράπεζα.` })
    } else {
      score -= 25
      flags.push({ kind: 'bad', label: 'Ακριβότερο της αγοράς', detail: `Το ΣΕΠΠΕ είναι ${vsMarketPct} μονάδες πάνω από τον δείκτη αγοράς.` })
    }
  }

  // Βάρος εφάπαξ εξόδων.
  const feePct = amount > 0 ? (totalFees / amount) * 100 : 0
  if (feePct >= 1) {
    score -= 12
    flags.push({ kind: 'warn', label: 'Υψηλά αρχικά έξοδα', detail: `Έξοδα ${fe(totalFees)} (${Math.round(feePct * 10) / 10}% του δανείου). Πολλά διαπραγματεύονται ή απαλείφονται.` })
  } else if (totalFees > 0) {
    flags.push({ kind: 'info', label: 'Αρχικά έξοδα', detail: `Συνολικά έξοδα ${fe(totalFees)}. Ζήτησε αναλυτική παράθεση και έκπτωση.` })
  }

  // Ασφάλειες.
  if (insMonthly > 0) {
    flags.push({ kind: 'info', label: 'Ασφάλειες', detail: `Ασφάλιστρα ${fe(insMonthly)} τον μήνα (≈ ${fe(totalInsurance)} στη διάρκεια). Η ασφάλεια κατοικίας είναι υποχρεωτική· η ασφάλεια ζωής συχνά προαιρετική.` })
  }

  // Ρήτρα πρόωρης εξόφλησης.
  if (input.prepaymentPenalty) {
    score -= 8
    flags.push({ kind: 'warn', label: 'Ρήτρα πρόωρης εξόφλησης', detail: 'Για σταθερό επιτόκιο ο νόμος περιορίζει τη ρήτρα· επιβεβαίωσε το ποσοστό και τις εξαιρέσεις.' })
  }

  // Τύπος επιτοκίου.
  if (input.rateType === 'variable') {
    flags.push({ kind: 'info', label: 'Κυμαινόμενο επιτόκιο', detail: 'Η δόση μεταβάλλεται με τον Euribor. Έλεγξε το περιθώριο (spread) πάνω από τον δείκτη.' })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  let verdict: EsisVerdict
  if (score >= 80) verdict = 'good'
  else if (score >= 55) verdict = 'fair'
  else verdict = 'expensive'

  return {
    monthly, totalInterest, totalFees, totalInsurance, totalCost,
    nominal, aprc, aprcGapPct, vsMarketPct,
    verdict, score, flags,
  }
}

export function esisVerdictLabel(v: EsisVerdict): string {
  return v === 'good' ? 'Ανταγωνιστική, διαφανής προσφορά'
    : v === 'fair' ? 'Αποδεκτή, με περιθώριο διαπραγμάτευσης'
    : 'Ακριβή, αξίζει σύγκριση και διαπραγμάτευση'
}
