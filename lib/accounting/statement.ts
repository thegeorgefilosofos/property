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

import { rentalIncomeTax, effectiveRentalRate, type TaxBracket } from '@/lib/billing/greekTax'

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
  /** Συντελεστής φόρου επιχείρησης (π.χ. 0,22 νομικό πρόσωπο). Default 0,22. */
  businessTaxRate?: number
  /** Προαιρετική προσαρμογή κλίμακας (δοκιμές/μελλοντικά έτη). */
  brackets?: TaxBracket[]
  /** Ποσοστό τεκμαρτής έκπτωσης (default 5% για φυσικά πρόσωπα, 0 για επιχείρηση). */
  presumptiveRate?: number

  // ── Ταμειακές εκροές που ΔΕΝ επηρεάζουν τη φορολογική βάση φυσικού προσώπου ──
  /** ΕΝΦΙΑ (φόρος ακίνητης περιουσίας) — εκροή, όχι έκπτωση για ιδιώτη. */
  enfia?: number
  /** ΤΑΚΚ (τέλος ανθεκτικότητας) — βραχυχρόνια. */
  climateLevy?: number
  /** Τέλος παρεπιδημούντων — βραχυχρόνια. */
  municipalTax?: number
  /** Λοιπές πραγματικές ταμειακές δαπάνες (καθαρισμοί, προμήθειες, μη εκπιπτόμενα). */
  otherCashExpenses?: number
  /** Χρεολύσιο δανείου (κεφάλαιο) — χρηματοοικονομική εκροή. */
  loanPrincipal?: number
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
  // Τεκμαρτή έκπτωση 5% ΜΟΝΟ στη μακροχρόνια κατοικίας φυσικού προσώπου. Η
  // βραχυχρόνια φορολογείται στα μεικτά (όπως ήδη στο lib/tax/shortTermTax),
  // ώστε να ΜΗ διαφέρει ο φόρος από την υπάρχουσα σύνοψη βραχυχρόνιας.
  const presumptiveRate = input.presumptiveRate ?? (regime === 'individual_longterm' ? PRESUMPTIVE_DEDUCTION_RATE : 0)

  const itemized = business ? pos(input.itemizedExpenses ?? 0) : 0
  const depreciation = business ? pos(input.depreciation ?? 0) : 0
  const interest = business ? pos(input.loanInterest ?? 0) : 0
  const presumptive = business ? 0 : cents(gross * presumptiveRate)

  // Φορολογική βάση
  let taxable: number
  if (business) taxable = pos(gross - itemized - depreciation - interest)
  else taxable = pos(gross - presumptive)

  // Φόρος εισοδήματος
  let incomeTax: number
  let effRate: number
  if (business) {
    const rate = input.businessTaxRate ?? 0.22
    incomeTax = cents(taxable * Math.max(0, rate))
    effRate = gross > 0 ? incomeTax / gross : 0
  } else {
    incomeTax = cents(rentalIncomeTax(taxable, input.brackets))
    effRate = effectiveRentalRate(taxable)
  }

  const enfia = pos(input.enfia ?? 0)
  const climateLevy = pos(input.climateLevy ?? 0)
  const municipalTax = pos(input.municipalTax ?? 0)
  const propertyTaxes = cents(enfia + climateLevy + municipalTax)
  const otherCash = pos(input.otherCashExpenses ?? 0)
  const loanPrincipal = pos(input.loanPrincipal ?? 0)

  const netProfit = business
    ? cents(taxable - incomeTax)
    : cents(gross - presumptive - incomeTax)

  const netCash = cents(
    gross - incomeTax - propertyTaxes - otherCash - loanPrincipal - interest - itemized,
  )

  // Γραμμές εμφάνισης (τυπική δομή κατάστασης αποτελεσμάτων)
  const lines: StatementLine[] = [
    { key: 'gross', label: 'Μεικτά έσοδα', amount: gross, kind: 'income' },
  ]
  if (business) {
    if (itemized > 0) lines.push({ key: 'expenses', label: 'Εκπιπτόμενα έξοδα', amount: itemized, kind: 'deduction', negative: true })
    if (depreciation > 0) lines.push({ key: 'depreciation', label: 'Αποσβέσεις', amount: depreciation, kind: 'deduction', negative: true })
    if (interest > 0) lines.push({ key: 'interest', label: 'Τόκοι δανείου', amount: interest, kind: 'deduction', negative: true })
  } else if (presumptive > 0) {
    lines.push({ key: 'presumptive', label: `Τεκμαρτή έκπτωση ${Math.round(presumptiveRate * 100)}%`, amount: presumptive, kind: 'deduction', negative: true })
  }
  lines.push({ key: 'taxable', label: 'Φορολογητέο εισόδημα', amount: taxable, kind: 'subtotal' })
  lines.push({ key: 'incomeTax', label: 'Φόρος εισοδήματος', amount: incomeTax, kind: 'tax', negative: true })
  lines.push({ key: 'netProfit', label: 'Καθαρό αποτέλεσμα (μετά φόρου)', amount: netProfit, kind: 'result' })
  if (propertyTaxes > 0) {
    if (enfia > 0) lines.push({ key: 'enfia', label: 'ΕΝΦΙΑ', amount: enfia, kind: 'tax', negative: true })
    if (climateLevy > 0) lines.push({ key: 'climate', label: 'Τέλος ανθεκτικότητας (ΤΑΚΚ)', amount: climateLevy, kind: 'tax', negative: true })
    if (municipalTax > 0) lines.push({ key: 'municipal', label: 'Τέλος παρεπιδημούντων', amount: municipalTax, kind: 'tax', negative: true })
  }
  if (loanPrincipal > 0) lines.push({ key: 'principal', label: 'Χρεολύσιο δανείου', amount: loanPrincipal, kind: 'deduction', negative: true })
  if (otherCash > 0) lines.push({ key: 'otherCash', label: 'Λοιπές ταμειακές δαπάνες', amount: otherCash, kind: 'deduction', negative: true })
  lines.push({ key: 'netCash', label: 'Ταμειακό υπόλοιπο', amount: netCash, kind: 'result' })

  return {
    regime, grossIncome: gross, presumptiveDeduction: presumptive, deductibleExpenses: itemized,
    depreciation, interest, taxableIncome: taxable, incomeTax, effectiveRate: effRate,
    propertyTaxes, netProfit, netCash, lines,
  }
}

// ── Πρόβλεψη φόρου (πόσα να βάλεις στην άκρη) ───────────────────────────────
export interface TaxProvision {
  annualTaxTotal: number   // φόρος εισοδήματος + φόροι/τέλη ακινήτου
  monthly: number          // ισόποσα στους 12 μήνες
  perRemainingMonth: number// στο υπόλοιπο του έτους (ώστε να προλάβεις)
  incomeTax: number
  propertyTaxes: number
}

/** monthIndex1: 1=Ιανουάριος (τρέχων μήνας). */
export function taxProvision(st: IncomeStatement, monthIndex1: number = 1): TaxProvision {
  const annual = cents(st.incomeTax + st.propertyTaxes)
  const remaining = Math.max(1, 12 - Math.min(12, Math.max(1, monthIndex1)) + 1)
  return {
    annualTaxTotal: annual,
    monthly: cents(annual / 12),
    perRemainingMonth: cents(annual / remaining),
    incomeTax: st.incomeTax,
    propertyTaxes: st.propertyTaxes,
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
  const effRate = totalTaxable > 0 ? totalIncomeTax / totalTaxable : 0

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
