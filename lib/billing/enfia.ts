// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ πηγή αλήθειας για την ΕΚΤΙΜΗΣΗ του ΕΝΦΙΑ (κύριος φόρος + προσαύξηση αξίας).
// Καθαρές συναρτήσεις. ΠΡΟΣΟΧΗ: είναι ΕΚΤΙΜΗΣΗ — το ακριβές ποσό εκκαθαρίζεται από
// την ΑΑΔΕ. Νομική βάση: άρθρο 4 ν.4223/2013 όπως ισχύει μετά τον ν.4916/2022.
// Ο ΠΛΗΡΗΣ πίνακας Συντελεστή Βασικού Φόρου (ΣΒΦ) ανά Τιμή Ζώνης είναι
// ΠΡΟΣΕΓΓΙΣΤΙΚΟΣ (τα επιβεβαιωμένα άκρα είναι 2,00 €/τ.μ. και 16,20 €/τ.μ. για
// ζώνη >5.000 €/τ.μ.· τα ενδιάμεσα κατώφλια ορίζονται στο ΦΕΚ Α΄65/2022).
// Χρησιμοποιείται από τη σελίδα Λογαριασμών (χειροκίνητα) ΚΑΙ από τη Λογιστική.
// ═══════════════════════════════════════════════════════════════════════════

/** Τιμή ζώνης (€/τ.μ.) → βασικός φόρος ανά τ.μ. (ΣΒΦ). Προσεγγιστικός πίνακας:
 *  επιβεβαιωμένα άκρα 2,00 (χαμηλές ζώνες) και 16,20 (>5.000 €/τ.μ.). */
export const ENFIA_ZONE_TAX: Record<string, number> = {
  'under_500': 2.00, '500_750': 2.00, '750_1000': 2.80, '1000_1250': 2.80,
  '1250_1500': 2.80, '1500_2000': 3.70, '2000_2500': 3.70, '2500_3000': 4.50,
  '3000_3500': 6.00, '3500_4000': 7.60, 'over_4000': 16.20,
}
// Συντελεστής ορόφου (άρθρο 4): υπόγειο 0,98· ισόγειο & 1ος 1,00· 2ος-3ος 1,01·
// 4ος-5ος 1,02· 6ος και άνω 1,03. (Για μονοκατοικία ισχύει ξεχωριστός συντελεστής.)
export const ENFIA_FLOOR_COEF: Record<string, number> = {
  basement: 0.98, ground: 1.00, first: 1.00, second: 1.01, third: 1.01, fourth: 1.02, fifth_plus: 1.03,
}
// Συντελεστής παλαιότητας κτίσματος (άρθρο 4): τα νεότερα κτίσματα επιβαρύνονται
// περισσότερο. ≤4 έτη 1,25· 5-9 1,20· 10-14 1,15· 15-19 1,10· 20-25 1,05· 26+ 1,00.
export const ENFIA_AGE_COEF: Record<string, number> = {
  under_5: 1.25, '5_10': 1.20, '10_20': 1.15, '20_25': 1.05, '25_30': 1.00, over_30: 1.00,
}
// Εκπτώσεις/απαλλαγές κύριου φόρου (άρθρο 7 ν.4223/2013 & ΕΝΦΙΑ 2026). Ο χρήστης
// επιλέγει όσες πληροί· ισχύουν εισοδηματικά/περιουσιακά κριτήρια (βλ. note).
export const ENFIA_REDUCTIONS: { key: string; label: string; pct: number; note: string }[] = [
  { key: 'low_income', label: 'Χαμηλό εισόδημα (κύρια κατοικία)', pct: 50, note: 'Μείωση 50% με κριτήρια: εισόδημα ≤9.000€ (+1.000€/μέλος) και κτίσματα ≤150 τ.μ.' },
  { key: 'small_settlement_2026', label: 'Κύρια κατοικία μικρού οικισμού (2026)', pct: 50, note: 'Αυτόματη μείωση 50% ΕΝΦΙΑ 2026 για οικισμούς ≤1.500 κατ., αξία κατοικίας ≤400.000€' },
  { key: 'large_family', label: 'Τρίτεκνοι / Πολύτεκνοι', pct: 100, note: '100% απαλλαγή με κριτήρια: εισόδημα ≤12.000€ (+1.000€/μέλος), κτίσματα ≤150 τ.μ.' },
  { key: 'disability', label: 'Αναπηρία ≥80%', pct: 100, note: '100% απαλλαγή με τα ίδια εισοδηματικά/περιουσιακά κριτήρια' },
  { key: 'insurance', label: 'Ασφαλισμένη κατοικία', pct: 20, note: '20% (αξία ≤500.000€) ή 10% (>500.000€), κάλυψη σεισμού+πυρκαγιάς+πλημμύρας ≥3 μήνες' },
]
// Προσαύξηση ΚΥΡΙΟΥ φόρου φυσικών προσώπων όταν η ΣΥΝΟΛΙΚΗ αξία της ακίνητης
// περιουσίας υπερβαίνει τις 500.000€ (αντικατέστησε τον καταργηθέντα συλλογικό
// συμπληρωματικό φόρο φυσικών προσώπων). Ποσοστό ΕΠΙ ΤΟΥ ΚΥΡΙΟΥ ΦΟΡΟΥ.
export const ENFIA_SURCHARGE_THRESHOLD = 500_000
export const ENFIA_SURCHARGE_BRACKETS: { limit: number; pct: number }[] = [
  { limit: 650_000, pct: 5 }, { limit: 800_000, pct: 10 }, { limit: 1_000_000, pct: 15 }, { limit: Infinity, pct: 20 },
]

export interface ENFIAInput {
  sqm: number
  zone: string
  floor?: string
  age?: string
  ownership?: number   // ποσοστό ιδιοκτησίας (0–100)
  totalValue?: number  // συνολική αξία ακίνητης περιουσίας (για την προσαύξηση >500k)
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
  const maxPct = Math.max(0, ...(input.reductions ?? []).map(r => ENFIA_REDUCTIONS.find(rd => rd.key === r)?.pct || 0))
  const reductionAmount = subtotal * (maxPct / 100)
  const annual = Math.max(0, subtotal - reductionAmount)
  return {
    basic: round2(basic), supplementary: round2(suppl), subtotal: round2(subtotal),
    reductionPct: maxPct, reductionAmount: round2(reductionAmount), annual: round2(annual),
    installment: Math.ceil(annual / 12),
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
 * (προσέγγιση αντικειμενικής). ΔΕΝ εφαρμόζει αυτόματα έκπτωση κύριας κατοικίας
 * (απαιτεί εισοδηματικά/περιουσιακά κριτήρια). Επιστρέφει null αν λείπουν δεδομένα.
 */
export function estimateENFIAFromFacts(facts: { value?: number | null; sqm?: number | null }): ENFIAResult | null {
  const sqm = Number(facts.sqm) || 0
  const value = Number(facts.value) || 0
  if (sqm <= 0 || value <= 0) return null
  const zone = zoneKeyFromPricePerSqm(value / sqm)
  if (!zone) return null
  return estimateENFIA({ sqm, zone, totalValue: value, reductions: [] })
}
