// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ πηγή αλήθειας για την «Κατάσταση Αποτελεσμάτων» ακινήτου/χαρτοφυλακίου.
// Καθαρές συναρτήσεις (χωρίς I/O, χωρίς DOM). Ποσά σε EUR (αριθμοί), στρογγυλά
// σε λεπτά. Επαναχρησιμοποιεί ΤΗ φορολογική πηγή αλήθειας (lib/billing/greekTax)
// ώστε ο φόρος/καθαρό να ΜΗ διαφέρει από καρτέλα σε καρτέλα (καταργεί το «flat
// 15%» και τους πολλαπλούς ορισμούς του «καθαρού» στο app).
//
// Φορολογική μεταχείριση (φυσικά πρόσωπα, ν.4172/2013 άρθρο 39 & 40):
//   • ΜΑΚΡΟΧΡΟΝΙΑ κατοικίας: φορολογείται το μεικτό ενοίκιο, με ΤΕΚΜΑΡΤΗ έκπτωση
//     5% για δαπάνες επισκευής/συντήρησης (χωρίς παραστατικά). Οι λοιπές δαπάνες
//     ΔΕΝ εκπίπτουν για ιδιώτη. Τόκοι δανείου & ΕΝΦΙΑ ΔΕΝ εκπίπτουν.
//   • ΒΡΑΧΥΧΡΟΝΙΑ (φυσικό πρόσωπο, χωρίς παροχή υπηρεσιών): εισόδημα ακινήτων,
//     ίδια κλίμακα· επιπλέον ΤΑΚΚ (ανά διανυκτέρευση) & τέλος παρεπιδημούντων.
//   • ΕΠΑΓΓΕΛΜΑΤΙΑΣ/ΕΠΙΧΕΙΡΗΣΗ (ΕΛΠ): εκπίπτουν αναλυτικά έξοδα, ΑΠΟΣΒΕΣΕΙΣ και
//     ΤΟΚΟΙ δανείου· φόρος επί του καθαρού κέρδους (συντ. παραμετρικός).
// Οι κανόνες αλλάζουν· τα ποσά επιβεβαιώνονται στην ΑΑΔΕ/λογιστή (το UI το λέει).
// ═══════════════════════════════════════════════════════════════════════════

import {
  rentalIncomeTax, art15BracketsForAge, advanceTaxRate, CORPORATE_TAX_RATE_2026,
  DIVIDEND_WITHHOLDING_RATE, type TaxBracket,
} from '@/lib/billing/greekTax'

const cents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
const pos = (n: number): number => Math.max(0, cents(n))

export type TaxRegime = 'individual_longterm' | 'individual_shortterm' | 'business'

/** Τεκμαρτή έκπτωση φυσικού προσώπου για επισκευές/συντήρηση (5%). */
export const PRESUMPTIVE_DEDUCTION_RATE = 0.05

export interface StatementInput {
  regime: TaxRegime
  /** Μεικτά έσοδα περιόδου (εισπραγμένο ενοίκιο ή μεικτά βραχυχρόνιας). */
  grossIncome: number
  /** Εκπιπτόμενα λειτουργικά έξοδα — ΜΟΝΟ για επαγγελματία (ΕΛΠ). */
  itemizedExpenses?: number
  /** Ετήσιες αποσβέσεις — ΜΟΝΟ για επαγγελματία. */
  depreciation?: number
  /** Εκπιπτόμενοι τόκοι δανείου — ΜΟΝΟ για επαγγελματία. */
  loanInterest?: number
  /** Ετήσια απόσβεση κτιρίου (4%) — ΜΟΝΟ για επιχείρηση· η γη δεν αποσβένεται. */
  buildingDepreciation?: number
  /** Ασφαλιστικές εισφορές ΕΦΚΑ — εκπίπτουν & είναι ταμειακή εκροή (ατομική). */
  ekfaContributions?: number
  /** Νομική μορφή επιχείρησης: 'sole' = ατομική (προοδευτική κλίμακα 9–44%),
   *  'company' = νομικό πρόσωπο (σταθερό 22%). Default 'sole'. */
  businessForm?: 'sole' | 'company'
  /** Πρώτη τριετία νέας δραστηριότητας: μειωμένο 1ο κλιμάκιο (4,5%) & μειωμένη
   *  προκαταβολή (−50%) — άρθρα 29/69. */
  firstThreeYears?: boolean
  /** Ποσοστό διανομής κερδών νομικού προσώπου (0–1) — προσθέτει 5% φόρο μερισμάτων. */
  companyDistribution?: number
  /** Τεκμαρτό ελάχιστο καθαρό εισόδημα ελεύθερου επαγγελματία (ν.5073/2023):
   *  αν το πραγματικό καθαρό είναι χαμηλότερο, φορολογείται το ελάχιστο (ατομική). */
  presumptiveMinIncome?: number
  /** Ηλικία φορολογουμένου — ενεργοποιεί τη μειωμένη κλίμακα νέων (ν.5246/2025)
   *  ΜΟΝΟ για ατομική επιχείρηση (άρθρο 15). Δεν αφορά παθητικά ενοίκια. */
  taxpayerAge?: number
  /** Χειροκίνητος συντελεστής νομικού προσώπου (default 22%). */
  businessTaxRate?: number
  /** Προαιρετική προσαρμογή κλίμακας (δοκιμές/μελλοντικά έτη). */
  brackets?: TaxBracket[]
  /** Ποσοστό τεκμαρτής έκπτωσης (default 5% για φυσικά πρόσωπα, 0 για επιχείρηση). */
  presumptiveRate?: number
  /** Εισπράχθηκαν τα ενοίκια με τραπεζικό/ηλεκτρονικό μέσο; Από 1/1/2026 (ν.5246/2025)
   *  αν ΟΧΙ (μετρητά), χάνεται η τεκμαρτή έκπτωση 5% → φορολογείται το 100%. Default true. */
  rentsPaidViaBank?: boolean

  // ── Ταμειακές εκροές που ΔΕΝ επηρεάζουν τη φορολογική βάση φυσικού προσώπου ──
  /** ΕΝΦΙΑ (φόρος ακίνητης περιουσίας) — εκροή, όχι έκπτωση για ιδιώτη. */
  enfia?: number
  /** ΤΑΚΚ (τέλος ανθεκτικότητας) — βραχυχρόνια. */
  climateLevy?: number
  /** Τέλος παρεπιδημούντων — βραχυχρόνια. */
  municipalTax?: number
  /** Λοιπές πραγματικές ταμειακές δαπάνες (καθαρισμοί, προμήθειες, μη εκπιπτόμενα). */
  otherCashExpenses?: number
  /** Δόσεις δανείου (κεφάλαιο) — χρηματοοικονομική εκροή. */
  loanPrincipal?: number
  /** Ανείσπρακτα έσοδα: φορολογούνται (δεδουλευμένο) αλλά ΔΕΝ μπήκαν στο ταμείο. */
  uncollectedIncome?: number
  /** Τα ανείσπρακτα διεκδικήθηκαν νομικά πριν την προθεσμία δήλωσης (άρθρο 39 §4):
   *  τότε ΔΕΝ φορολογούνται μέχρι να εισπραχθούν (κωδ. 125–126 Ε1). */
  legallyClaimedUncollected?: boolean
  /** Ρητός φόρος εισοδήματος (π.χ. μερίδιο του προοδευτικού φόρου χαρτοφυλακίου,
   *  Ε1). Αν δοθεί, υπερισχύει του εσωτερικού υπολογισμού. */
  overrideIncomeTax?: number
}

export type LineKind = 'income' | 'deduction' | 'subtotal' | 'tax' | 'result' | 'memo'

export interface StatementLine {
  key: string
  label: string
  amount: number
  kind: LineKind
  /** true = αφαιρετικό στην εμφάνιση (δείχνεται με −). */
  negative?: boolean
}

export interface IncomeStatement {
  regime: TaxRegime
  grossIncome: number
  presumptiveDeduction: number
  deductibleExpenses: number
  depreciation: number
  interest: number
  taxableIncome: number
  incomeTax: number
  /** Προκαταβολή φόρου έναντι επόμενου έτους (επιχείρηση· πιστώνεται του χρόνου). */
  advanceTax: number
  /** Φόρος μερισμάτων 5% στη διανομή κερδών νομικού προσώπου. */
  dividendTax: number
  /** Πραγματικός (μέσος) συντελεστής φόρου εισοδήματος. */
  effectiveRate: number
  /** Λοιποί φόροι/τέλη ακινήτου (ΕΝΦΙΑ + ΤΑΚΚ + παρεπιδημούντων) — εκτός φόρου εισ. */
  propertyTaxes: number
  /** Λογιστικό καθαρό αποτέλεσμα μετά φόρου εισοδήματος (πριν φόρους ακινήτου/δάνειο). */
  netProfit: number
  /** Πραγματικό ταμειακό υπόλοιπο μετά από ΟΛΑ (φόροι, τέλη, δάνειο, δαπάνες). */
  netCash: number
  lines: StatementLine[]
}

// ── Κατάσταση Αποτελεσμάτων ────────────────────────────────────────────────
export function incomeStatement(input: StatementInput): IncomeStatement {
  const regime = input.regime
  const gross = pos(input.grossIncome)
  const business = regime === 'business'
  // Τεκμαρτή έκπτωση 5% για φυσικό πρόσωπο (άρθρο 39 §4 ΚΦΕ): ισχύει στη μακροχρόνια
  // ΚΑΙ στη βραχυχρόνια χωρίς υπηρεσίες (εισόδημα ακίνητης περιουσίας) — ίδια βάση με
  // το lib/tax/shortTermTax. Δεν ισχύει για επιχείρηση (ΕΛΠ).
  // Από 1/1/2026 προϋποθέτει είσπραξη μέσω τραπέζης· με μετρητά χάνεται (φόρος στο 100%).
  const rentsPaidViaBank = input.rentsPaidViaBank !== false
  const baseRate = input.presumptiveRate ?? (business ? 0 : PRESUMPTIVE_DEDUCTION_RATE)
  const presumptiveRate = rentsPaidViaBank ? baseRate : 0

  const itemized = business ? pos(input.itemizedExpenses ?? 0) : 0
  const inventoryDepr = business ? pos(input.depreciation ?? 0) : 0
  const buildingDepr = business ? pos(input.buildingDepreciation ?? 0) : 0
  const depreciation = cents(inventoryDepr + buildingDepr)
  const interest = business ? pos(input.loanInterest ?? 0) : 0
  const company = business && input.businessForm === 'company'
  // ΕΦΚΑ: εκπίπτει από το εισόδημα ΑΤΟΜΙΚΗΣ επιχείρησης (όχι νομικού προσώπου).
  const ekfa = business && !company ? pos(input.ekfaContributions ?? 0) : 0
  const uncollectedPre = pos(input.uncollectedIncome ?? 0)
  // Νομικά διεκδικημένα ανείσπρακτα: εξαιρούνται από το φορολογητέο εισόδημα (άρθρο 39 §4).
  const uncollectedReliefBase = input.legallyClaimedUncollected ? uncollectedPre : 0
  // Το εισόδημα που φορολογείται (φυσικό πρόσωπο) είναι τα μεικτά μείον τα διεκδικημένα
  // ανείσπρακτα· η τεκμαρτή 5% έκπτωση υπολογίζεται πάνω σε αυτό.
  const taxableGross = business ? gross : pos(gross - uncollectedReliefBase)
  const presumptive = business ? 0 : cents(taxableGross * presumptiveRate)

  // Πραγματική επιχειρηματική βάση (καθαρό κέρδος): μεικτά μείον όλες τις εκπτώσεις.
  // Χρησιμοποιείται για το ΛΟΓΙΣΤΙΚΟ καθαρό αποτέλεσμα, ώστε να ΜΗΝ επηρεάζεται από
  // το τεκμαρτό ελάχιστο (που είναι φορολογική παραδοχή, όχι πραγματικό κέρδος).
  const businessBase = business ? pos(gross - itemized - depreciation - interest - ekfa) : 0

  // Φορολογική βάση
  let taxable: number
  if (business) {
    taxable = businessBase
    // Τεκμαρτό ελάχιστο καθαρό εισόδημα ελεύθερου επαγγελματία (ατομική).
    if (!company && input.presumptiveMinIncome != null) taxable = Math.max(taxable, pos(input.presumptiveMinIncome))
  } else {
    taxable = pos(taxableGross - presumptive)
  }

  // Φόρος εισοδήματος. Αν δοθεί ρητός φόρος (π.χ. μερίδιο προοδευτικού φόρου
  // χαρτοφυλακίου/Ε1), υπερισχύει. Ο μέσος συντελεστής ΠΑΝΤΑ επί των μεικτών,
  // ώστε να είναι συγκρίσιμος μεταξύ καθεστώτων.
  let incomeTax: number
  if (input.overrideIncomeTax != null) incomeTax = pos(input.overrideIncomeTax)
  else if (business) {
    // Ατομική επιχείρηση → κλίμακα άρθρου 15 (μειωμένη για νέους έως 30 & νέους
    // επαγγελματίες πρώτης τριετίας)· νομικό πρόσωπο → σταθερό 22%.
    incomeTax = company
      ? cents(taxable * Math.max(0, input.businessTaxRate ?? CORPORATE_TAX_RATE_2026))
      : cents(rentalIncomeTax(taxable, art15BracketsForAge(input.taxpayerAge, input.firstThreeYears)))
  }
  else incomeTax = cents(rentalIncomeTax(taxable, input.brackets))
  const effRate = gross > 0 ? incomeTax / gross : 0

  // Προκαταβολή φόρου (επιχείρηση) — έναντι επόμενου έτους, πιστώνεται του χρόνου.
  const advanceTax = business && input.overrideIncomeTax == null
    ? cents(incomeTax * advanceTaxRate(company ? 'company' : 'sole', input.firstThreeYears))
    : 0
  // Φόρος μερισμάτων 5% στη διανομή κερδών νομικού προσώπου.
  const distribution = company ? Math.min(1, Math.max(0, input.companyDistribution ?? 0)) : 0
  const dividendTax = company ? cents(Math.max(0, taxable - incomeTax) * distribution * DIVIDEND_WITHHOLDING_RATE) : 0

  const enfia = pos(input.enfia ?? 0)
  const climateLevy = pos(input.climateLevy ?? 0)
  const municipalTax = pos(input.municipalTax ?? 0)
  const propertyTaxes = cents(enfia + climateLevy + municipalTax)
  const otherCash = pos(input.otherCashExpenses ?? 0)
  const loanPrincipal = pos(input.loanPrincipal ?? 0)
  const uncollected = uncollectedPre

  // Καθαρό αποτέλεσμα: για επιχείρηση = φορολογητέο − φόρος (− φόρος μερισμάτων στη
  // διανομή)· για φυσικό πρόσωπο = μεικτά − φόρος (η τεκμαρτή έκπτωση είναι
  // φορολογική παραδοχή, ΟΧΙ πραγματική δαπάνη).
  const netProfit = business ? cents(businessBase - incomeTax - dividendTax) : cents(gross - incomeTax)

  // Ταμείο: αφαιρούμε ΕΦΚΑ, φόρο μερισμάτων και τα ανείσπρακτα (φορολογούνται/
  // διανέμονται αλλά δεν μπήκαν στο ταμείο). Οι αποσβέσεις ΔΕΝ είναι ταμειακή εκροή.
  const netCash = cents(
    gross - incomeTax - dividendTax - propertyTaxes - otherCash - loanPrincipal - interest - itemized - ekfa - uncollected,
  )

  // Γραμμές εμφάνισης (τυπική δομή κατάστασης αποτελεσμάτων)
  const lines: StatementLine[] = [
    { key: 'gross', label: 'Μεικτά έσοδα', amount: gross, kind: 'income' },
  ]
  if (business) {
    if (itemized > 0) lines.push({ key: 'expenses', label: 'Εκπιπτόμενα έξοδα', amount: itemized, kind: 'deduction', negative: true })
    if (ekfa > 0) lines.push({ key: 'ekfa', label: 'Εισφορές ΕΦΚΑ', amount: ekfa, kind: 'deduction', negative: true })
    if (inventoryDepr > 0) lines.push({ key: 'depreciation', label: 'Αποσβέσεις εξοπλισμού', amount: inventoryDepr, kind: 'deduction', negative: true })
    if (buildingDepr > 0) lines.push({ key: 'buildingDepreciation', label: 'Αποσβέσεις κτιρίου (4%)', amount: buildingDepr, kind: 'deduction', negative: true })
    if (interest > 0) lines.push({ key: 'interest', label: 'Τόκοι δανείου', amount: interest, kind: 'deduction', negative: true })
  } else if (presumptive > 0) {
    lines.push({ key: 'presumptive', label: `Τεκμαρτή έκπτωση ${Math.round(presumptiveRate * 100)}%`, amount: presumptive, kind: 'deduction', negative: true })
  }
  lines.push({ key: 'taxable', label: 'Φορολογητέο εισόδημα', amount: taxable, kind: 'subtotal' })
  lines.push({ key: 'incomeTax', label: 'Φόρος εισοδήματος', amount: incomeTax, kind: 'tax', negative: true })
  if (dividendTax > 0) lines.push({ key: 'dividendTax', label: 'Φόρος μερισμάτων (5% στη διανομή)', amount: dividendTax, kind: 'tax', negative: true })
  lines.push({ key: 'netProfit', label: 'Καθαρό αποτέλεσμα (μετά φόρου)', amount: netProfit, kind: 'result' })
  if (propertyTaxes > 0) {
    if (enfia > 0) lines.push({ key: 'enfia', label: 'ΕΝΦΙΑ', amount: enfia, kind: 'tax', negative: true })
    if (climateLevy > 0) lines.push({ key: 'climate', label: 'Τέλος ανθεκτικότητας (ΤΑΚΚ)', amount: climateLevy, kind: 'tax', negative: true })
    if (municipalTax > 0) lines.push({ key: 'municipal', label: 'Τέλος παρεπιδημούντων', amount: municipalTax, kind: 'tax', negative: true })
  }
  if (loanPrincipal > 0) lines.push({ key: 'principal', label: business ? 'Χρεολύσιο δανείου (κεφάλαιο)' : 'Δόσεις δανείου', amount: loanPrincipal, kind: 'deduction', negative: true })
  if (otherCash > 0) lines.push({ key: 'otherCash', label: 'Λοιπές ταμειακές δαπάνες', amount: otherCash, kind: 'deduction', negative: true })
  if (uncollected > 0) lines.push({ key: 'uncollected', label: input.legallyClaimedUncollected ? 'Ανείσπρακτα ενοίκια (διεκδικημένα — αφορολόγητα)' : 'Ανείσπρακτα ενοίκια', amount: uncollected, kind: 'deduction', negative: true })
  lines.push({ key: 'netCash', label: 'Ταμειακό υπόλοιπο', amount: netCash, kind: 'result' })

  return {
    regime, grossIncome: gross, presumptiveDeduction: presumptive, deductibleExpenses: itemized,
    depreciation, interest, taxableIncome: taxable, incomeTax, advanceTax, dividendTax, effectiveRate: effRate,
    propertyTaxes, netProfit, netCash, lines,
  }
}

// ── Πρόβλεψη φόρου (πόσα να βάλεις στην άκρη) ───────────────────────────────
export interface TaxProvision {
  annualTaxTotal: number   // φόρος εισοδήματος + φόρος μερισμάτων + φόροι/τέλη ακινήτου
  monthly: number          // ισόποσα στους 12 μήνες
  perRemainingMonth: number// στο υπόλοιπο του έτους (ώστε να προλάβεις)
  incomeTax: number
  propertyTaxes: number
  advanceTax: number       // προκαταβολή έναντι επόμενου έτους (χωριστά· πιστώνεται)
  firstYearTotal: number   // annualTaxTotal + προκαταβολή = ταμειακή ανάγκη 1ου έτους
}

/** monthIndex1: 1=Ιανουάριος (τρέχων μήνας). */
export function taxProvision(st: IncomeStatement, monthIndex1: number = 1): TaxProvision {
  const annual = cents(st.incomeTax + st.dividendTax + st.propertyTaxes)
  const remaining = Math.max(1, 12 - Math.min(12, Math.max(1, monthIndex1)) + 1)
  return {
    annualTaxTotal: annual,
    monthly: cents(annual / 12),
    perRemainingMonth: cents(annual / remaining),
    incomeTax: st.incomeTax,
    propertyTaxes: st.propertyTaxes,
    advanceTax: st.advanceTax,
    firstYearTotal: cents(annual + st.advanceTax),
  }
}

// ── Ενοποίηση χαρτοφυλακίου (φόρος στο ΑΘΡΟΙΣΜΑ, όπως στο Ε1) ────────────────
// Ο φόρος εισοδήματος φυσικού προσώπου είναι προοδευτικός στο ΣΥΝΟΛΟ των ενοικίων,
// όχι ανά ακίνητο. Γι' αυτό η ενοποίηση αθροίζει πρώτα τις βάσεις και ΜΕΤΑ φορολογεί.
export interface PortfolioStatement {
  grossIncome: number
  taxableIncome: number
  incomeTax: number
  effectiveRate: number
  propertyTaxes: number
  netProfit: number
  netCash: number
  perProperty: { id: string; statement: IncomeStatement; taxShare: number }[]
}

export function consolidateIndividual(
  items: { id: string; input: StatementInput }[],
  brackets?: TaxBracket[],
): PortfolioStatement {
  // Χωριστές καταστάσεις (για ανάλυση), αλλά φόρος στο συνολικό φορολογητέο.
  const statements = items.map(it => ({ id: it.id, statement: incomeStatement({ ...it.input, brackets }) }))
  const totalGross = cents(statements.reduce((s, x) => s + x.statement.grossIncome, 0))
  const totalTaxable = cents(statements.reduce((s, x) => s + x.statement.taxableIncome, 0))
  const totalIncomeTax = cents(rentalIncomeTax(totalTaxable, brackets))
  const totalPropertyTaxes = cents(statements.reduce((s, x) => s + x.statement.propertyTaxes, 0))
  // Μέσος συντελεστής επί των ΜΕΙΚΤΩΝ (ίδιος ορισμός με το incomeStatement).
  const effRate = totalGross > 0 ? totalIncomeTax / totalGross : 0

  // Επιμερισμός του συνολικού φόρου ανά ακίνητο κατ' αναλογία φορολογητέου.
  const perProperty = statements.map(x => ({
    id: x.id,
    statement: x.statement,
    taxShare: totalTaxable > 0 ? cents(totalIncomeTax * (x.statement.taxableIncome / totalTaxable)) : 0,
  }))

  const netProfit = cents(totalTaxable - totalIncomeTax)
  const netCash = cents(
    statements.reduce((s, x) => s + (x.statement.netCash + x.statement.incomeTax), 0) - totalIncomeTax,
  )

  return {
    grossIncome: totalGross, taxableIncome: totalTaxable, incomeTax: totalIncomeTax,
    effectiveRate: effRate, propertyTaxes: totalPropertyTaxes, netProfit, netCash, perProperty,
  }
}
