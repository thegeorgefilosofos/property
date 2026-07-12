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
  reductions?: string[]
}
export interface ENFIAResult {
  basic: number
  supplementary: number  // προσαύξηση κύριου φόρου (αξία >500.000€)
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
  // Προσαύξηση κύριου φόρου για συνολική αξία >500.000€ (φυσικά πρόσωπα).
  let suppl = 0
  const totalVal = Number(input.totalValue) || 0
  if (totalVal > ENFIA_SURCHARGE_THRESHOLD) {
    const bracket = ENFIA_SURCHARGE_BRACKETS.find(b => totalVal <= b.limit)
    if (bracket) suppl = basic * (bracket.pct / 100)
  }
  const subtotal = basic + suppl
  // Μειώσεις: αυτόματη ανά συνολική αξία (§2Α) ΚΑΙ η μεγαλύτερη χειροκίνητη, πολλαπλασιαστικά.
  const wealthPct = wealthReductionPct(totalVal)
  const manualPct = Math.max(0, ...(input.reductions ?? []).map(r => ENFIA_REDUCTIONS.find(rd => rd.key === r)?.pct || 0))
  const combinedFrac = 1 - (1 - wealthPct / 100) * (1 - manualPct / 100)
  const reductionAmount = subtotal * combinedFrac
  const annual = Math.max(0, subtotal - reductionAmount)
  return {
    basic: round2(basic), supplementary: round2(suppl), subtotal: round2(subtotal),
    reductionPct: Math.round(combinedFrac * 100), reductionAmount: round2(reductionAmount), annual: round2(annual),
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
  return estimateENFIA({ sqm, zone, totalValue: value, reductions: [] })
}
