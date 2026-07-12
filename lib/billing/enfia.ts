// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ πηγή αλήθειας για τον υπολογισμό ΕΝΦΙΑ (κύριος + συμπληρωματικός φόρος).
// Καθαρές συναρτήσεις. Οι συντελεστές είναι οι ισχύοντες (ενδεικτικοί)· το ακριβές
// ποσό εκκαθαρίζεται από την ΑΑΔΕ. Χρησιμοποιείται από τη σελίδα Λογαριασμών (χειροκίνητα)
// ΚΑΙ από τη Λογιστική (αυτόματη εκτίμηση από τα στοιχεία του ακινήτου).
// ═══════════════════════════════════════════════════════════════════════════

/** Τιμή ζώνης (€/τ.μ.) → βασικός φόρος ανά τ.μ. */
export const ENFIA_ZONE_TAX: Record<string, number> = {
  'under_500': 2.00, '500_750': 2.80, '750_1000': 3.70, '1000_1250': 4.50,
  '1250_1500': 6.00, '1500_2000': 7.60, '2000_2500': 9.20, '2500_3000': 11.10,
  '3000_3500': 13.00, '3500_4000': 14.50, 'over_4000': 16.00,
}
export const ENFIA_FLOOR_COEF: Record<string, number> = {
  basement: 0.90, ground: 1.00, first: 1.01, second: 1.02, third: 1.03, fourth: 1.04, fifth_plus: 1.05,
}
export const ENFIA_AGE_COEF: Record<string, number> = {
  under_5: 1.05, '5_10': 1.00, '10_20': 0.95, '20_25': 0.90, '25_30': 0.85, over_30: 0.75,
}
export const ENFIA_REDUCTIONS: { key: string; label: string; pct: number; note: string }[] = [
  { key: 'main_residence', label: 'Κύρια κατοικία', pct: 50, note: 'Μόνο αν χαρακτηρισμένη κύρια' },
  { key: 'three_children', label: 'Τρίτεκνοι', pct: 25, note: 'Α.Φ.Μ. τριτέκνου γονέα' },
  { key: 'four_children', label: 'Πολύτεκνοι', pct: 50, note: 'Α.Φ.Μ. πολυτέκνου γονέα' },
  { key: 'disability', label: 'Αναπηρία 80%+', pct: 50, note: 'Βεβαίωση ΚΕΠΑ' },
  { key: 'insurance', label: 'Ασφάλεια φυσικών κινδύνων', pct: 15, note: 'Α.1005/2026, 10-20% έκπτωση' },
]
export const ENFIA_SUPPL_BRACKETS: { limit: number; rate: number }[] = [
  { limit: 100_000, rate: 0 }, { limit: 200_000, rate: 0.001 }, { limit: 300_000, rate: 0.002 },
  { limit: 400_000, rate: 0.005 }, { limit: 500_000, rate: 0.010 }, { limit: 600_000, rate: 0.015 },
  { limit: 700_000, rate: 0.020 }, { limit: 800_000, rate: 0.025 }, { limit: 900_000, rate: 0.030 },
  { limit: 1_000_000, rate: 0.033 }, { limit: Infinity, rate: 0.035 },
]

export interface ENFIAInput {
  sqm: number
  zone: string
  floor?: string
  age?: string
  ownership?: number   // ποσοστό ιδιοκτησίας (0–100)
  totalValue?: number  // συνολική αξία ακίνητης περιουσίας (για συμπληρωματικό)
  reductions?: string[]
}
export interface ENFIAResult {
  basic: number
  supplementary: number
  subtotal: number
  reductionPct: number
  reductionAmount: number
  annual: number
  installment: number  // σε 6 δόσεις (ενδεικτικά)
}

/** Υπολογισμός ΕΝΦΙΑ. Επιστρέφει null αν λείπουν τα βασικά (τ.μ./ζώνη). */
export function estimateENFIA(input: ENFIAInput): ENFIAResult | null {
  const sqm = Number(input.sqm) || 0
  if (sqm <= 0 || !input.zone || !(input.zone in ENFIA_ZONE_TAX)) return null
  const ownership = input.ownership == null ? 100 : Math.max(0, Math.min(100, input.ownership))
  const basic = sqm * ENFIA_ZONE_TAX[input.zone] * (ENFIA_FLOOR_COEF[input.floor ?? 'second'] ?? 1) *
    (ENFIA_AGE_COEF[input.age ?? '10_20'] ?? 1) * (ownership / 100)
  let suppl = 0
  const totalVal = Number(input.totalValue) || 0
  if (totalVal > 100_000) {
    const bracket = ENFIA_SUPPL_BRACKETS.find(b => totalVal <= b.limit)
    if (bracket) suppl = totalVal * bracket.rate
  }
  const subtotal = basic + suppl
  const maxPct = Math.max(0, ...(input.reductions ?? []).map(r => ENFIA_REDUCTIONS.find(rd => rd.key === r)?.pct || 0))
  const reductionAmount = subtotal * (maxPct / 100)
  const annual = Math.max(0, subtotal - reductionAmount)
  return {
    basic: round2(basic), supplementary: round2(suppl), subtotal: round2(subtotal),
    reductionPct: maxPct, reductionAmount: round2(reductionAmount), annual: round2(annual),
    installment: Math.ceil(annual / 6),
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Αντιστοίχιση €/τ.μ. τιμής ζώνης σε κλειδί ζώνης (για αυτόματη εκτίμηση). */
export function zoneKeyFromPricePerSqm(pricePerSqm: number): string | null {
  const p = Number(pricePerSqm) || 0
  if (p <= 0) return null
  if (p < 500) return 'under_500'
  if (p < 750) return '500_750'
  if (p < 1000) return '750_1000'
  if (p < 1250) return '1000_1250'
  if (p < 1500) return '1250_1500'
  if (p < 2000) return '1500_2000'
  if (p < 2500) return '2000_2500'
  if (p < 3000) return '2500_3000'
  if (p < 3500) return '3000_3500'
  if (p < 4000) return '3500_4000'
  return 'over_4000'
}

/**
 * Αυτόματη εκτίμηση ΕΝΦΙΑ από τα βασικά στοιχεία του ακινήτου (αξία + τ.μ.),
 * όταν δεν υπάρχει χειροκίνητος υπολογισμός. Παράγει τιμή ζώνης = αξία/τ.μ.
 * (προσέγγιση αντικειμενικής). Επιστρέφει null αν λείπουν δεδομένα.
 */
export function estimateENFIAFromFacts(facts: { value?: number | null; sqm?: number | null; mainResidence?: boolean }): ENFIAResult | null {
  const sqm = Number(facts.sqm) || 0
  const value = Number(facts.value) || 0
  if (sqm <= 0 || value <= 0) return null
  const zone = zoneKeyFromPricePerSqm(value / sqm)
  if (!zone) return null
  return estimateENFIA({ sqm, zone, totalValue: value, reductions: facts.mainResidence ? ['main_residence'] : [] })
}
