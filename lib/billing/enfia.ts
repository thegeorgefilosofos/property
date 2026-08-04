// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΦΙΑ — υπολογισμός κύριου φόρου κτισμάτων + προσαύξησης + εκπτώσεων.
// Καθαρές συναρτήσεις. Οι πίνακες είναι ΤΟΥ ΝΟΜΟΥ (άρθρο 4 ν.4223/2013, όπως
// αντικαταστάθηκε από τα άρθρα 43-46 ν.4916/2022, ΦΕΚ Α΄65/28.3.2022). Παραμένει
// ΕΚΤΙΜΗΣΗ (η ζώνη επιλέγεται σε κλιμάκιο, όχι ακριβής αντικειμενική)· το ακριβές
// ποσό εκκαθαρίζεται από την ΑΑΔΕ.
// ═══════════════════════════════════════════════════════════════════════════

// Πίνακας Συντελεστή Βασικού Φόρου (ΣΒΦ) κτισμάτων ανά Τιμή Ζώνης (€/τ.μ.).
// Άρθρο 43 ν.4916/2022 (Ενότητα Α΄, παρ. 2, περ. α΄).
export const ENFIA_ZONE_TAX: Record<string, number> = {
  '0_750': 2.00, '751_1500': 2.80, '1501_2500': 3.70, '2501_3000': 4.50,
  '3001_3500': 7.60, '3501_4000': 9.20, '4001_4500': 11.10, '4501_5000': 13.40, 'over_5000': 16.20,
}
// Συντελεστής ορόφου (άρθρο 4, δεν τροποποιήθηκε από τον ν.4916/2022):
// υπόγειο 0,98· ισόγειο & 1ος 1,00· 2ος-3ος 1,01· 4ος-5ος 1,02· 6ος+ 1,03.
export const ENFIA_FLOOR_COEF: Record<string, number> = {
  basement: 0.98, ground: 1.00, first: 1.00, second: 1.01, third: 1.01, fourth: 1.02, fifth_plus: 1.03,
}
// Συντελεστής παλαιότητας κτίσματος (τα νεότερα επιβαρύνονται περισσότερο):
// ≤4 έτη 1,25· 5-9 1,20· 10-14 1,15· 15-19 1,10· 20-25 1,05· 26+ 1,00.
export const ENFIA_AGE_COEF: Record<string, number> = {
  under_5: 1.25, '5_10': 1.20, '10_20': 1.15, '20_25': 1.05, '25_30': 1.00, over_30: 1.00,
}
// Εκπτώσεις/απαλλαγές κύριου φόρου (άρθρο 7 ν.4223/2013), ΕΠΙΠΛΕΟΝ της αυτόματης
// μείωσης ανά συνολική αξία. Ο χρήστης επιλέγει όσες πληροί (με κριτήρια, βλ. note).
export const ENFIA_REDUCTIONS: { key: string; label: string; pct: number; note: string }[] = [
  { key: 'low_income', label: 'Χαμηλό εισόδημα (κύρια κατοικία)', pct: 50, note: 'Μείωση 50% με κριτήρια: εισόδημα ≤9.000€ (+1.000€/μέλος), κτίσματα ≤150 τ.μ., περιουσία ≤85.000€ (άγαμος) / 200.000€ (έγγαμος με 2 τέκνα)' },
  { key: 'small_settlement_2026', label: 'Κύρια κατοικία μικρού οικισμού (2026)', pct: 50, note: 'Αυτόματη μείωση 50% ΕΝΦΙΑ 2026 για οικισμούς ≤1.500 κατ., αξία κατοικίας ≤400.000€' },
  { key: 'large_family', label: 'Τρίτεκνοι / Πολύτεκνοι', pct: 100, note: '100% απαλλαγή με κριτήρια: εισόδημα ≤12.000€ (+1.000€/μέλος), κτίσματα ≤150 τ.μ.' },
  { key: 'disability', label: 'Αναπηρία ≥80%', pct: 100, note: '100% απαλλαγή με τα ίδια εισοδηματικά/περιουσιακά κριτήρια' },
  { key: 'insurance', label: 'Ασφαλισμένη κατοικία', pct: 20, note: '20% (αξία ≤500.000€) ή 10% (>500.000€), κάλυψη σεισμού+πυρκαγιάς+πλημμύρας ≥3 μήνες' },
]
// Αυτόματη μείωση κύριου φόρου ανά συνολική αξία ακίνητης περιουσίας (άρθρο 7 §2Α,
// άρθρο 46 ν.4916/2022) — ισχύει για ΟΛΑ τα φυσικά πρόσωπα.
export const ENFIA_WEALTH_REDUCTION: { limit: number; pct: number }[] = [
  { limit: 100_000, pct: 30 }, { limit: 150_000, pct: 25 }, { limit: 250_000, pct: 20 },
  { limit: 300_000, pct: 15 }, { limit: 400_000, pct: 10 }, { limit: Infinity, pct: 0 },
]
// Προσαύξηση κύριου φόρου φυσικών προσώπων για συνολική αξία >500.000€
// (άρθρο 4, Ενότητα Ε΄, άρθρο 43 ν.4916/2022). Ποσοστό ΕΠΙ ΤΟΥ ΚΥΡΙΟΥ ΦΟΡΟΥ.
export const ENFIA_SURCHARGE_THRESHOLD = 500_000
export const ENFIA_SURCHARGE_BRACKETS: { limit: number; pct: number }[] = [
  { limit: 650_000, pct: 5 }, { limit: 800_000, pct: 10 }, { limit: 1_000_000, pct: 15 }, { limit: Infinity, pct: 20 },
]
// Ενότητα Γ΄ (άρθρο 43 ν.4916/2022): πρόσθετος φόρος ΑΝΑ ακίνητο αξίας >400.000€,
// κλιμακωτά επί της αξίας, εφόσον η ΣΥΝΟΛΙΚΗ αξία περιουσίας υπερβαίνει τις 300.000€.
export const ENFIA_EXTRA_TAX_FREE = 400_000
export const ENFIA_EXTRA_WEALTH_THRESHOLD = 300_000
export const ENFIA_EXTRA_BRACKETS: { upto: number; rate: number }[] = [
  { upto: 500_000, rate: 0.0020 }, { upto: 600_000, rate: 0.0030 }, { upto: 700_000, rate: 0.0040 },
  { upto: 800_000, rate: 0.0050 }, { upto: 900_000, rate: 0.0060 }, { upto: 1_000_000, rate: 0.0070 },
  { upto: 2_000_000, rate: 0.0090 }, { upto: Infinity, rate: 0.0100 },
]

/** Πρόσθετος φόρος Ενότητας Γ΄ επί της αξίας ενός ακινήτου (κλιμακωτά, αφορολόγητο 400.000€),
 *  απομειωμένος με το ποσοστό ιδιοκτησίας. Ο έλεγχος συνολικής αξίας >300.000€ γίνεται από τον καλούντα. */
export function enfiaExtraPropertyTax(propertyValue: number, ownership = 100): number {
  const v = Number(propertyValue) || 0
  if (v <= ENFIA_EXTRA_TAX_FREE) return 0
  let tax = 0, prev = ENFIA_EXTRA_TAX_FREE
  for (const b of ENFIA_EXTRA_BRACKETS) {
    if (v <= prev) break
    const slice = Math.min(v, b.upto) - prev
    if (slice > 0) tax += slice * b.rate
    prev = b.upto
  }
  return round2(tax * (Math.max(0, Math.min(100, ownership)) / 100))
}

/** Αυτόματη μείωση % ανά συνολική αξία περιουσίας (0 αν άγνωστη). */
export function wealthReductionPct(totalValue: number): number {
  if (!(totalValue > 0)) return 0
  const b = ENFIA_WEALTH_REDUCTION.find(x => totalValue <= x.limit)
  return b ? b.pct : 0
}

export interface ENFIAInput {
  sqm: number
  zone: string
  floor?: string
  age?: string
  ownership?: number   // ποσοστό ιδιοκτησίας (0–100)
  totalValue?: number  // συνολική αξία ακίνητης περιουσίας (για μείωση & προσαύξηση)
  propertyValue?: number // αντικειμενική αξία ΤΟΥ ακινήτου (για Ενότητα Γ, >400.000€)
  reductions?: string[]
}
export interface ENFIAResult {
  basic: number
  extra: number          // πρόσθετος φόρος Ενότητας Γ (αξία ακινήτου >400.000€)
  supplementary: number  // προσαύξηση κύριου φόρου (συνολική αξία >500.000€)
  subtotal: number
  reductionPct: number
  reductionAmount: number
  annual: number
  installment: number  // σε 12 μηνιαίες δόσεις (ενδεικτικά)
}

/** Εκτίμηση ΕΝΦΙΑ. Επιστρέφει null αν λείπουν τα βασικά (τ.μ./ζώνη). */
export function estimateENFIA(input: ENFIAInput): ENFIAResult | null {
  const sqm = Number(input.sqm) || 0
  if (sqm <= 0 || !input.zone || !(input.zone in ENFIA_ZONE_TAX)) return null
  const ownership = input.ownership == null ? 100 : Math.max(0, Math.min(100, input.ownership))
  const basic = sqm * ENFIA_ZONE_TAX[input.zone] * (ENFIA_FLOOR_COEF[input.floor ?? 'second'] ?? 1) *
    (ENFIA_AGE_COEF[input.age ?? '10_20'] ?? 1) * (ownership / 100)
  const totalVal = Number(input.totalValue) || 0
  // Ενότητα Γ: πρόσθετος φόρος ακινήτου >400.000€, εφόσον συνολική περιουσία >300.000€.
  const propVal = Number(input.propertyValue) || 0
  const extra = totalVal > ENFIA_EXTRA_WEALTH_THRESHOLD ? enfiaExtraPropertyTax(propVal, ownership) : 0
  // Κύριος φόρος (Ενότητα Δ) = κτίσματα (Α) + πρόσθετος (Γ).
  const kyrios = basic + extra
  // Προσαύξηση κύριου φόρου για συνολική αξία >500.000€ (Ενότητα Ε).
  let suppl = 0
  if (totalVal > ENFIA_SURCHARGE_THRESHOLD) {
    const bracket = ENFIA_SURCHARGE_BRACKETS.find(b => totalVal <= b.limit)
    if (bracket) suppl = kyrios * (bracket.pct / 100)
  }
  const subtotal = kyrios + suppl
  // Μειώσεις: αυτόματη ανά συνολική αξία (§2Α) ΚΑΙ η μεγαλύτερη χειροκίνητη, πολλαπλασιαστικά.
  const wealthPct = wealthReductionPct(totalVal)
  const manualPct = Math.max(0, ...(input.reductions ?? []).map(r => ENFIA_REDUCTIONS.find(rd => rd.key === r)?.pct || 0))
  const combinedFrac = 1 - (1 - wealthPct / 100) * (1 - manualPct / 100)
  const reductionAmount = subtotal * combinedFrac
  // Στρογγυλοποιούμε ΜΙΑ φορά και βγάζουμε τη δόση από το ΕΜΦΑΝΙΖΟΜΕΝΟ ετήσιο ποσό,
  // ώστε δόση = ceil(ετήσιο/12) να είναι πάντα συνεπής με το ετήσιο που δείχνουμε.
  const annual = round2(Math.max(0, subtotal - reductionAmount))
  return {
    basic: round2(basic), extra: round2(extra), supplementary: round2(suppl), subtotal: round2(subtotal),
    reductionPct: Math.round(combinedFrac * 100), reductionAmount: round2(reductionAmount), annual,
    installment: Math.ceil(annual / 12),
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Αντιστοίχιση €/τ.μ. τιμής ζώνης σε κλειδί ζώνης (άρθρο 43, 9 κλιμάκια). */
export function zoneKeyFromPricePerSqm(pricePerSqm: number): string | null {
  const p = Number(pricePerSqm) || 0
  if (p <= 0) return null
  if (p <= 750) return '0_750'
  if (p <= 1500) return '751_1500'
  if (p <= 2500) return '1501_2500'
  if (p <= 3000) return '2501_3000'
  if (p <= 3500) return '3001_3500'
  if (p <= 4000) return '3501_4000'
  if (p <= 4500) return '4001_4500'
  if (p <= 5000) return '4501_5000'
  return 'over_5000'
}

/**
 * Αυτόματη εκτίμηση ΕΝΦΙΑ από τα βασικά στοιχεία του ακινήτου (αξία + τ.μ.),
 * όταν δεν υπάρχει χειροκίνητος υπολογισμός. Παράγει τιμή ζώνης = αξία/τ.μ.
 * (προσέγγιση αντικειμενικής) και εφαρμόζει την αυτόματη μείωση ανά συνολική αξία.
 * ΔΕΝ εφαρμόζει τις εξαρτώμενες από κριτήρια εκπτώσεις (κύρια κατοικία κ.λπ.).
 * Επιστρέφει null αν λείπουν δεδομένα.
 */
export function estimateENFIAFromFacts(facts: { value?: number | null; sqm?: number | null }): ENFIAResult | null {
  const sqm = Number(facts.sqm) || 0
  const value = Number(facts.value) || 0
  if (sqm <= 0 || value <= 0) return null
  const zone = zoneKeyFromPricePerSqm(value / sqm)
  if (!zone) return null
  // Το ίδιο ακίνητο είναι εδώ και η συνολική περιουσία (μονο-ακίνητη εκτίμηση):
  // propertyValue = totalValue = value, ώστε να εφαρμοστεί σωστά η Ενότητα Γ.
  return estimateENFIA({ sqm, zone, totalValue: value, propertyValue: value, reductions: [] })
}

// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΙΟ ΝΟΥΜΕΡΟ ΕΙΝΑΙ Ο ΕΝΦΙΑ — ΜΙΑ ΑΠΟΦΑΣΗ ΓΙΑ ΟΛΕΣ ΤΙΣ ΟΘΟΝΕΣ.
//
// Η ΔΙΑΦΩΝΙΑ, ΜΕΤΡΗΜΕΝΗ
// Δύο οθόνες διάβαζαν τον ίδιο φόρο και έβγαζαν διαφορετικό ποσό:
//
//   Υπηρεσίες  →  enfiaResult ? εκτίμηση : χειροκίνητο   (η ΕΚΤΙΜΗΣΗ νικούσε)
//   Προϋπολογισμός → μόνο το χειροκίνητο                 (η εκτίμηση αγνοούνταν)
//
// Δύο συνέπειες, καμία ορατή:
//   • Όποιος έγραψε το πραγματικό ποσό από το εκκαθαριστικό και μετά συμπλήρωσε
//     ζώνη για να δει τις εκπτώσεις, έβλεπε το πραγματικό του νούμερο να
//     ΑΝΤΙΚΑΘΙΣΤΑΤΑΙ από εκτίμηση — και το πεδίο να εξαφανίζεται από την οθόνη.
//   • Όποιος χρησιμοποίησε μόνο τον υπολογιστή, έβλεπε στις Υπηρεσίες π.χ. 43 €
//     τον μήνα και στον Προϋπολογισμό 0 €, για το ίδιο ακίνητο, την ίδια στιγμή.
//
// Ο ΚΑΝΟΝΑΣ: ΤΟ ΔΗΛΩΜΕΝΟ ΝΙΚΑ ΤΗΝ ΕΚΤΙΜΗΣΗ, ΠΑΝΤΑ.
// Το ποσό που αντέγραψε ο ιδιοκτήτης από το εκκαθαριστικό της ΑΑΔΕ είναι γεγονός.
// Ο υπολογιστής είναι μοντέλο — χρήσιμο για «τι θα γινόταν αν», ποτέ αντικαταστάτης
// του γεγονότος. Και η οθόνη ΠΡΕΠΕΙ να λέει ποιο από τα δύο δείχνει: ένα ποσό
// φόρου χωρίς σήμανση διαβάζεται ως βεβαιότητα.
// ═══════════════════════════════════════════════════════════════════════════

/** Από πού προήλθε το ποσό που δείχνουμε. Το `none` σημαίνει «δεν ξέρουμε ακόμη». */
export type EnfiaSource = 'declared' | 'estimate' | 'none'

export interface EnfiaInUse {
  annual: number
  monthly: number
  source: EnfiaSource
}

const numOr0 = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Το ποσό ΕΝΦΙΑ που ισχύει, με την πηγή του.
 *
 * @param declaredAnnual   τι έγραψε ο χρήστης ως ετήσιο (από το εκκαθαριστικό)
 * @param declaredMonthly  τι έγραψε ως μηνιαίο — χρησιμοποιείται μόνο αν λείπει το ετήσιο
 * @param estimateAnnual   το ετήσιο ποσό του υπολογιστή, ή null/0 αν δεν υπολογίστηκε
 *
 * Το τρίτο όρισμα είναι ΑΡΙΘΜΟΣ, όχι ENFIAResult: οι οθόνες κρατούν το αποτέλεσμα
 * σε δικά τους σχήματα (άλλη λέει `final`, άλλη `annual`) και μια τυπωμένη
 * υπογραφή θα ζητούσε μετατροπές στο σημείο κλήσης — δηλαδή ακριβώς τη χειροκίνητη
 * προσαρμογή που γεννά αποκλίσεις.
 */
export function enfiaInUse(
  declaredAnnual: unknown,
  declaredMonthly: unknown,
  estimateAnnual: number | null | undefined,
): EnfiaInUse {
  const annual = numOr0(declaredAnnual) || numOr0(declaredMonthly) * 12
  if (annual > 0) return { annual: round2(annual), monthly: round2(annual / 12), source: 'declared' }
  const est = numOr0(estimateAnnual)
  if (est > 0) return { annual: round2(est), monthly: round2(est / 12), source: 'estimate' }
  return { annual: 0, monthly: 0, source: 'none' }
}
