// lib/loans/recommend.ts
// Καθαρή λογική (χωρίς React) για: τοκοχρεολύσιο, επιλεξιμότητα «Σπίτι μου ΙΙ»,
// και σύσταση καλύτερου δανείου με βάση τις καταχωρήσεις και τις ανάγκες του χρήστη.
// ΟΛΑ τα αποτελέσματα είναι ΕΝΔΕΙΚΤΙΚΑ, όχι δεσμευτική προσφορά τράπεζας.

import { fp } from '../core/format'

export type RateType = 'fixed' | 'variable' | 'mixed'
export type LoanPurpose =
  | 'purchase' | 'first_home' | 'renovation' | 'energy'
  | 'investment' | 'auction' | 'construction' | 'commercial' | 'land' | 'refinance'

export interface UserLoanNeeds {
  amount: number            // αιτούμενο ποσό δανείου
  propertyValue: number     // αξία ακινήτου (για LTV)
  years: number             // διάρκεια σε έτη
  purpose: LoanPurpose
  ratePreference?: RateType // προτίμηση επιτοκίου (default: fixed)
  // Στοιχεία επιλεξιμότητας «Σπίτι μου ΙΙ» (προαιρετικά)
  age?: number
  income?: number
  maritalStatus?: 'single' | 'married' | 'single_parent'
  children?: number
  firstHome?: boolean
  propertySqm?: number
  propertyYearBuilt?: number
  energyClass?: string      // π.χ. 'A+','A','B' → έκπτωση πράσινου δανείου
}

// Ελάχιστο σχήμα τράπεζας που χρειάζεται ο recommender (συμβατό με BANKS_NORM).
//
// Τα `bank_id`/`bank_name` έφυγαν: ήταν τα ονόματα πεδίων του πίνακα
// `bank_rates`, και τα δεχόταν κι εδώ ώστε να περνούν οι ζωντανές γραμμές
// ακατέργαστες. Πλέον κάθε γραμμή περνά πρώτα από τον `normBank`, οπότε η
// γέφυρα ζει σε ΕΝΑ σημείο αντί για δύο — και το `?? bank.bank_id` παρακάτω
// ήταν διακλάδωση που δεν εκτελούνταν ποτέ όταν η γέφυρα δούλευε σωστά.
export interface BankInput {
  id: string
  name: string
  fixed_min: number               // χαμηλότερο σταθερό επιτόκιο (%)
  variable_spread_min: number     // ελάχιστο spread πάνω από Euribor (%)
  max_ltv: number                 // μέγιστο LTV (%)
  max_years: number
  max_amount: number
  min_amount: number
  green_discount?: number         // έκπτωση (%) για ενεργειακά αποδοτικό ακίνητο
  spiti_mou?: boolean             // συμμετέχει στο «Σπίτι μου ΙΙ»
}

export interface SpitiMouResult {
  eligible: boolean
  interestFreeShare: number       // 0.5 για ΟΛΟΥΣ (άτοκο σκέλος από το Ταμείο Ανάκαμψης)
  rateSubsidyShare: number        // επιδότηση επιτοκίου στο τραπεζικό σκέλος (0.5 για τρίτεκνους/πολύτεκνους, αλλιώς 0)
  reasons: string[]               // γιατί ΝΑΙ/ΟΧΙ (ελληνικά)
}

export interface LoanRanking {
  bankId: string
  bankName: string
  rateType: RateType
  nominalRatePct: number          // ονομαστικό επιτόκιο τράπεζας (μετά πράσινης έκπτωσης)
  effectiveRatePct: number        // πραγματικό μέσο επιτόκιο (μετά «Σπίτι μου ΙΙ» αν ισχύει)
  monthlyPayment: number
  totalInterest: number
  totalCost: number               // κεφάλαιο + τόκοι
  ltvPct: number
  spitiMouApplied: boolean
  eligible: boolean               // μπορεί η τράπεζα να δώσει αυτό το ποσό/LTV/διάρκεια;
  blockers: string[]              // λόγοι μη επιλεξιμότητας (ελληνικά)
  why: string                     // μία πρόταση εξήγηση της κατάταξης
}

// ── Όρια «Σπίτι μου ΙΙ» (ενδεικτικά, verified 2026-07-08· επιβεβαίωσε στην πύλη) ──
export const SPITI_MOU = {
  ageMin: 25,
  ageMax: 50,
  maxAmount: 190000,
  maxPropertyValue: 250000,
  maxLtv: 90,
  maxSqm: 150,
  maxYearBuilt: 2007,
  minYears: 3,
  maxYears: 30,
  // Εισοδηματικά όρια (ΚΥΑ Νοεμβρίου 2025): άγαμος 25.000· έγγαμοι 35.000 +5.000/τέκνο·
  // μονογονεϊκές 39.000. Ελάχιστο εισόδημα ~10.000 (δυνατότητα εξυπηρέτησης). Ενδεικτικά.
  incomeSingle: 25000,
  incomeMarriedBase: 35000,
  incomePerChild: 5000,
  incomeSingleParentBase: 39000,
  incomeMin: 10000,
  // Προθεσμίες: αίτηση/υπαγωγή έως 31/05/2026 (έχει παρέλθει)· σύναψη σύμβασης έως 31/08/2026.
  applicationDeadline: '2026-05-31',
  contractDeadline: '2026-08-31',
}

// Τοκοχρεολύσιο: σταθερή μηνιαία δόση (annuity).
export function annuityMonthly(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  if (annualRatePct === 0) return principal / (years * 12)
  const r = annualRatePct / 100 / 12
  const n = years * 12
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
}

export function totalInterest(principal: number, annualRatePct: number, years: number): number {
  const m = annuityMonthly(principal, annualRatePct, years)
  return Math.max(0, m * years * 12 - principal)
}

// Τόκοι που πληρώνονται σε ΕΝΑ έτος του δανείου (για την κατάσταση αποτελεσμάτων
// επιχείρησης — οι τόκοι εκπίπτουν, το κεφάλαιο όχι). yearIndex 1 = 1ο έτος.
// Χρησιμοποιεί κανονική τοκοχρεολυτική απόσβεση (declining balance).
export function interestForYear(principal: number, annualRatePct: number, years: number, yearIndex: number): number {
  if (principal <= 0 || years <= 0 || yearIndex < 1 || yearIndex > years) return 0
  const m = annuityMonthly(principal, annualRatePct, years)
  const r = annualRatePct / 100 / 12
  let balance = principal
  let interestSum = 0
  const startMonth = (yearIndex - 1) * 12 + 1
  const endMonth = yearIndex * 12
  for (let month = 1; month <= years * 12 && balance > 0; month++) {
    const interest = r === 0 ? 0 : balance * r
    const principalPaid = Math.min(balance, m - interest)
    if (month >= startMonth && month <= endMonth) interestSum += interest
    balance -= principalPaid
  }
  return Math.round(interestSum * 100) / 100
}

// Το εισοδηματικό όριο «Σπίτι μου ΙΙ» για τη δεδομένη οικογενειακή κατάσταση.
export function spitiMouIncomeLimit(maritalStatus: UserLoanNeeds['maritalStatus'], children = 0): number {
  const c = Math.max(0, children)
  if (maritalStatus === 'married') return SPITI_MOU.incomeMarriedBase + c * SPITI_MOU.incomePerChild
  if (maritalStatus === 'single_parent') return SPITI_MOU.incomeSingleParentBase + Math.max(0, c - 1) * SPITI_MOU.incomePerChild
  return SPITI_MOU.incomeSingle
}

// Επιλεξιμότητα «Σπίτι μου ΙΙ» με βάση τις καταχωρήσεις. Ελέγχει μόνο ό,τι ξέρουμε,
// δεν «κόβει» για στοιχεία που λείπουν (τα σημειώνει ως προς επιβεβαίωση).
export function spitiMouEligibility(n: UserLoanNeeds): SpitiMouResult {
  const reasons: string[] = []
  let eligible = true

  if (n.age != null) {
    if (n.age < SPITI_MOU.ageMin || n.age > SPITI_MOU.ageMax) {
      eligible = false
      reasons.push(`Ηλικία ${n.age} εκτός ορίου ${SPITI_MOU.ageMin}-${SPITI_MOU.ageMax}`)
    } else reasons.push(`Ηλικία ${n.age} εντός ορίου`)
  } else reasons.push('Ηλικία: προς επιβεβαίωση (25-50)')

  if (n.firstHome === false) { eligible = false; reasons.push('Απαιτείται πρώτη & κύρια κατοικία') }

  if (n.propertyValue > SPITI_MOU.maxPropertyValue) {
    eligible = false
    reasons.push(`Αξία ${Math.round(n.propertyValue)}€ > όριο ${SPITI_MOU.maxPropertyValue}€`)
  }
  if (n.amount > SPITI_MOU.maxAmount) {
    eligible = false
    reasons.push(`Ποσό ${Math.round(n.amount)}€ > όριο ${SPITI_MOU.maxAmount}€`)
  }
  if (n.propertySqm != null && n.propertySqm > SPITI_MOU.maxSqm) {
    eligible = false
    reasons.push(`Εμβαδόν ${n.propertySqm}τμ > όριο ${SPITI_MOU.maxSqm}τμ`)
  }
  if (n.propertyYearBuilt != null && n.propertyYearBuilt > SPITI_MOU.maxYearBuilt) {
    eligible = false
    reasons.push(`Έτος κατασκευής ${n.propertyYearBuilt} > ${SPITI_MOU.maxYearBuilt}`)
  }
  if (n.years != null && n.years > SPITI_MOU.maxYears) {
    eligible = false
    reasons.push(`Διάρκεια ${n.years} έτη > όριο ${SPITI_MOU.maxYears} έτη`)
  }
  if (n.income != null) {
    const limit = spitiMouIncomeLimit(n.maritalStatus, n.children)
    if (n.income > limit) { eligible = false; reasons.push(`Εισόδημα ${Math.round(n.income)}€ > ενδεικτικό όριο ${limit}€`) }
    else if (n.income < SPITI_MOU.incomeMin) { eligible = false; reasons.push(`Εισόδημα ${Math.round(n.income)}€ < ελάχιστο ${SPITI_MOU.incomeMin}€`) }
    else reasons.push(`Εισόδημα εντός ορίου (${SPITI_MOU.incomeMin}€–${limit}€)`)
  } else reasons.push('Εισόδημα: προς επιβεβαίωση')

  // Το άτοκο σκέλος είναι 50% για ΟΛΟΥΣ. Οι τρίτεκνοι/πολύτεκνοι λαμβάνουν επιπλέον
  // επιδότηση 50% στο επιτόκιο του τραπεζικού σκέλους (ΟΧΙ μεγαλύτερο άτοκο κεφάλαιο).
  const interestFreeShare = 0.5
  const rateSubsidyShare = (n.children ?? 0) >= 3 ? 0.5 : 0
  return { eligible, interestFreeShare, rateSubsidyShare, reasons }
}

// Πραγματική μηνιαία δόση/τόκοι με «Σπίτι μου ΙΙ»: το άτοκο σκέλος έχει επιτόκιο 0%,
// το έντοκο σκέλος επιτόκιο τράπεζας. Ίδια διάρκεια στα δύο σκέλη.
export function spitiMouPayment(amount: number, bankRatePct: number, years: number, interestFreeShare: number, rateSubsidyShare = 0) {
  const freePart = amount * interestFreeShare
  const bankPart = amount - freePart
  // Τρίτεκνοι/πολύτεκνοι: 50% επιδότηση στο επιτόκιο του τραπεζικού σκέλους.
  const bankRate = bankRatePct * (1 - Math.max(0, Math.min(1, rateSubsidyShare)))
  const monthly = annuityMonthly(freePart, 0, years) + annuityMonthly(bankPart, bankRate, years)
  const interest = totalInterest(bankPart, bankRate, years)
  const blendedRatePct = amount > 0 ? (bankRate * bankPart) / amount : 0
  return { monthly, interest, blendedRatePct }
}

// Κεντρική σύσταση: κατατάσσει τις τράπεζες κατά ΣΥΝΟΛΙΚΟ κόστος (όχι μόνο επιτόκιο).
export function rankLoans(needs: UserLoanNeeds, banks: BankInput[], euribor3m: number): LoanRanking[] {
  const pref = needs.ratePreference ?? 'fixed'
  const ltv = needs.propertyValue > 0 ? (needs.amount / needs.propertyValue) * 100 : 0
  const green = !!needs.energyClass && /^a/i.test(needs.energyClass.trim())
  const spiti = spitiMouEligibility(needs)

  const rows: LoanRanking[] = banks.map(bank => {
    const blockers: string[] = []
    if (needs.amount > bank.max_amount) blockers.push(`Ποσό > όριο τράπεζας ${bank.max_amount}€`)
    if (needs.amount < bank.min_amount) blockers.push(`Ποσό < ελάχιστο ${bank.min_amount}€`)
    if (ltv > bank.max_ltv) blockers.push(`LTV ${fp(ltv)} > μέγιστο ${bank.max_ltv}%`)
    if (needs.years > bank.max_years) blockers.push(`Διάρκεια > ${bank.max_years} έτη`)

    const greenDisc = green ? (bank.green_discount ?? 0) : 0
    const fixed = Math.max(0, bank.fixed_min - greenDisc)
    const variable = Math.max(0, euribor3m + bank.variable_spread_min - greenDisc)
    const nominal = pref === 'variable' ? variable : pref === 'mixed' ? (fixed + variable) / 2 : fixed
    const rateType: RateType = pref

    const useSpiti = !!bank.spiti_mou && spiti.eligible &&
      needs.purpose === 'first_home'

    let monthlyPayment: number, interest: number, effectiveRatePct: number
    if (useSpiti) {
      const s = spitiMouPayment(needs.amount, nominal, needs.years, spiti.interestFreeShare, spiti.rateSubsidyShare)
      monthlyPayment = s.monthly; interest = s.interest; effectiveRatePct = s.blendedRatePct
    } else {
      monthlyPayment = annuityMonthly(needs.amount, nominal, needs.years)
      interest = totalInterest(needs.amount, nominal, needs.years)
      effectiveRatePct = nominal
    }

    const whyBits: string[] = []
    if (useSpiti) whyBits.push(`«Σπίτι μου ΙΙ» 50% άτοκο${spiti.rateSubsidyShare > 0 ? ' + επιδότηση επιτοκίου 50%' : ''}`)
    if (greenDisc > 0) whyBits.push(`πράσινη έκπτωση -${greenDisc}%`)
    whyBits.push(`επιτόκιο ${fp(effectiveRatePct)}`)

    return {
      bankId: bank.id,
      bankName: bank.name,
      rateType,
      nominalRatePct: Number(nominal.toFixed(2)),
      effectiveRatePct: Number(effectiveRatePct.toFixed(2)),
      monthlyPayment: Math.round(monthlyPayment),
      totalInterest: Math.round(interest),
      totalCost: Math.round(needs.amount + interest),
      ltvPct: Number(ltv.toFixed(1)),
      spitiMouApplied: useSpiti,
      eligible: blockers.length === 0,
      blockers,
      why: whyBits.join(' · '),
    }
  })

  // Επιλέξιμες πρώτα, μετά κατά συνολικό κόστος (φθηνότερο πρώτο).
  return rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    return a.totalCost - b.totalCost
  })
}
