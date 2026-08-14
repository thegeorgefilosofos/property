// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΦΙΑ — υπολογισμός κύριου φόρου κτισμάτων + προσαύξησης + εκπτώσεων.
// Καθαρές συναρτήσεις. Οι πίνακες είναι ΤΟΥ ΝΟΜΟΥ (άρθρο 4 ν.4223/2013, όπως
// αντικαταστάθηκε από τα άρθρα 43-46 ν.4916/2022, ΦΕΚ Α΄65/28.3.2022). Παραμένει
// ΕΚΤΙΜΗΣΗ (η ζώνη επιλέγεται σε κλιμάκιο, όχι ακριβής αντικειμενική)· το ακριβές
// ποσό εκκαθαρίζεται από την ΑΑΔΕ.
// ═══════════════════════════════════════════════════════════════════════════
import { athensToday } from '@/lib/core/time'
import { cents } from '@/lib/core/money'

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
// ═══ ΠΑΛΑΙΟΤΗΤΑ ΚΤΙΣΜΑΤΟΣ ══════════════════════════════════════════════════
// Ο νόμος ορίζει ΕΞΙ κλιμάκια· ο πίνακας υλοποιούσε ΠΕΝΤΕ. Το «15-19 έτη»
// (συντελεστής 1,10) έλειπε, και το «10_20» τα κατάπινε και τα δύο στο 1,15.
//
// Διαμέρισμα 100 τ.μ. του 2009 (17 ετών), ζώνη 1501-2500, 2ος όροφος:
//   πριν   100 × 3,70 × 1,00 × 1,15 = 425,50 €
//   νόμος  100 × 3,70 × 1,00 × 1,10 = 407,00 €
// Υπερεκτίμηση 18,50 € τον χρόνο (+4,5%) — και δεν έμενε στον υπολογιστή ΕΝΦΙΑ:
// περνούσε στη λογιστική εικόνα, στο καθαρό ταμείο και στην πρόβλεψη φόρου
// («πόσα να βάλεις στην άκρη»).
//
// ΤΑ ΚΛΙΜΑΚΙΑ ΟΡΙΖΟΝΤΑΙ ΕΔΩ, ΜΕ ΤΙΣ ΕΤΙΚΕΤΕΣ ΤΟΥΣ. Οι δύο οθόνες που τα
// εμφάνιζαν είχαν ΔΙΑΦΟΡΕΤΙΚΕΣ ετικέτες για το ίδιο κλειδί — το «10_20» ήταν
// «10 – 19 έτη» στη μία και «10 – 20 χρόνια» στην άλλη, και το «25_30» ήταν
// «26 έτη και πάνω» εδώ, «25 – 30 χρόνια» εκεί. Ο χρήστης διάλεγε άλλο πράγμα
// ανάλογα με την πόρτα από την οποία μπήκε.
// Το `maxYears` είναι το ΑΝΩ ΟΡΙΟ ετών του κλιμακίου και ζει ΕΔΩ, δίπλα στην
// ετικέτα. Χωρίς αυτό, όποιος ήθελε να βγάλει κλιμάκιο από έτος κατασκευής
// έπρεπε να ξαναγράψει τα όρια — δεύτερο αντίγραφο του ίδιου πίνακα, που θα
// ξέμενε πίσω την επόμενη φορά που ο νόμος αλλάξει κλιμάκιο.
export interface EnfiaAgeBand { key: string; label: string; coef: number; maxYears: number }

export const ENFIA_AGE_BANDS: readonly EnfiaAgeBand[] = [
  { key: 'y0_4',     label: 'Έως 4 έτη',      coef: 1.25, maxYears: 4 },
  { key: 'y5_9',     label: '5 – 9 έτη',      coef: 1.20, maxYears: 9 },
  { key: 'y10_14',   label: '10 – 14 έτη',    coef: 1.15, maxYears: 14 },
  { key: 'y15_19',   label: '15 – 19 έτη',    coef: 1.10, maxYears: 19 },
  { key: 'y20_25',   label: '20 – 25 έτη',    coef: 1.05, maxYears: 25 },
  { key: 'y26_plus', label: '26 έτη και άνω', coef: 1.00, maxYears: Infinity },
] as const

// Τα παλιά κλειδιά είναι ΗΔΗ αποθηκευμένα σε ρυθμίσεις χρηστών. Αν έπαυαν να
// αναγνωρίζονται, ο συντελεστής θα γινόταν `undefined` και ο ΕΝΦΙΑ `NaN` — μια
// διόρθωση ακρίβειας που θα έσπαγε την οθόνη είναι χειρότερη από το σφάλμα.
const LEGACY_AGE_KEY: Record<string, string> = {
  under_5: 'y0_4', '5_10': 'y5_9', '10_20': 'y10_14',
  '20_25': 'y20_25', '25_30': 'y26_plus', over_30: 'y26_plus',
}

/**
 * Το κλειδί παλαιότητας σε ΚΑΝΟΝΙΚΗ μορφή, από νέο ή παλιό όνομα.
 *
 * Υπάρχει ως εξαγόμενο γιατί η παλαιότητα δεν διαβάζεται μόνο εδώ: την
 * χρησιμοποιεί και η ασφάλιση για τον κίνδυνο του κτιρίου. Εκεί η σύγκριση
 * γινόταν με τα ΠΑΛΙΑ ονόματα ενώ η αποθηκευμένη τιμή είχε γίνει το νέο, οπότε
 * καμία συνθήκη δεν ταίριαζε ποτέ και ο συντελεστής έβγαινε πάντα 1,00: μια
 * μονοκατοικία του 1975 έπαιρνε την ίδια εκτίμηση με νεόδμητη. Ένα σημείο
 * μετάφρασης, ώστε να μη χρειάζεται κανείς άλλος να ξέρει τα παλιά ονόματα.
 */
export function normalizeEnfiaAgeKey(key: string | null | undefined): string {
  const k = (key || '').trim()
  return LEGACY_AGE_KEY[k] || k
}

/** Ο συντελεστής παλαιότητας για κλειδί — νέο ή παλιό. Άγνωστο → 1,00 (καμία προσαύξηση). */
export function enfiaAgeCoef(key: string | null | undefined): number {
  const k = normalizeEnfiaAgeKey(key)
  return ENFIA_AGE_BANDS.find(b => b.key === k)?.coef ?? 1.00
}

/** Ο παλιός χάρτης, για όσα σημεία τον διαβάζουν ως λεξικό. Περιέχει ΚΑΙ τα παλιά κλειδιά. */
export const ENFIA_AGE_COEF: Record<string, number> = {
  ...Object.fromEntries(ENFIA_AGE_BANDS.map(b => [b.key, b.coef])),
  ...Object.fromEntries(Object.entries(LEGACY_AGE_KEY).map(([old, k]) => [old, enfiaAgeCoef(k)])),
}

/**
 * Ο συντελεστής ορόφου για κλειδί. Άγνωστο ή κενό → 1,00 (καμία προσαύξηση).
 *
 * Ο έλεγχος είναι `typeof === 'number'` και όχι `?? 1`: ο πίνακας είναι απλό
 * αντικείμενο, οπότε κλειδί «constructor» ή «toString» θα επέστρεφε ΣΥΝΑΡΤΗΣΗ —
 * που δεν είναι nullish, περνούσε το `??` και έβγαζε ΕΝΦΙΑ «NaN €».
 */
export function enfiaFloorCoef(key: string | null | undefined): number {
  const c = ENFIA_FLOOR_COEF[(key || '').trim()]
  return typeof c === 'number' ? c : 1.00
}

// ═══ ΑΠΟ ΤΑ ΣΤΟΙΧΕΙΑ ΤΟΥ ΑΚΙΝΗΤΟΥ ΣΤΑ ΚΛΕΙΔΙΑ ΤΩΝ ΠΙΝΑΚΩΝ ══════════════════
// Η καρτέλα του ακινήτου κρατά έτος κατασκευής (αριθμό) και όροφο (ελληνική
// ετικέτα: «Ισόγειο», «2ος», «7ος και άνω»). Οι πίνακες του νόμου θέλουν κλειδιά.
// Χωρίς αυτή τη μετάφραση, η αυτόματη εκτίμηση αγνοούσε δύο πεδία που ήταν ΗΔΗ
// αποθηκευμένα και μάντευε — προς τα πάνω. Βλ. estimateENFIAFromFacts.

/** Το τρέχον έτος στην Ελλάδα — το έτος για το οποίο βεβαιώνεται ο ΕΝΦΙΑ. */
const currentEnfiaYear = (): number => Number(athensToday().slice(0, 4))

/** Κλιμάκιο παλαιότητας από ΕΤΗ. Τα όρια έρχονται από τα ίδια τα ENFIA_AGE_BANDS. */
export function enfiaAgeKeyFromYears(years: number): string | null {
  const y = Math.floor(Number(years) || 0)
  // ΑΡΝΗΤΙΚΑ ΕΤΗ → ΟΥΔΕΤΕΡΟ, ΟΧΙ «ΝΕΟΔΜΗΤΟ».
  // Χωρίς αυτόν τον έλεγχο, το -3 περνούσε το `y <= 4` και έπαιρνε το κλιμάκιο
  // «Έως 4 έτη» — τον ΑΚΡΙΒΟΤΕΡΟ συντελεστή του πίνακα (1,25). Δηλαδή ένα
  // ακίνητο με μελλοντικό έτος κατασκευής θα χρεωνόταν σαν ολοκαίνουργιο.
  // Ο σημερινός καλών φράζει ήδη το μελλοντικό έτος, αλλά η αρχή ισχύει για
  // κάθε επόμενο: άγνωστο ή αδύνατο σημαίνει ΟΥΔΕΤΕΡΟ, ποτέ ακριβότερο.
  if (y < 0) return null
  const band = ENFIA_AGE_BANDS.find(b => y <= b.maxYears)
  return (band ?? ENFIA_AGE_BANDS[ENFIA_AGE_BANDS.length - 1]).key
}

/**
 * Κλιμάκιο παλαιότητας από ΕΤΟΣ ΚΑΤΑΣΚΕΥΗΣ. Επιστρέφει null όταν το έτος λείπει
 * ή είναι απίθανο (πριν το 1800, ή μετά το έτος υπολογισμού).
 *
 * Το μελλοντικό έτος ΔΕΝ στρογγυλοποιείται σε «νεόδμητο»: το κλιμάκιο «έως 4 έτη»
 * έχει τον ΥΨΗΛΟΤΕΡΟ συντελεστή (1,25) και μια πληκτρολόγηση («2062» αντί «2006»)
 * θα φούσκωνε τον φόρο κατά 25%. Άγνωστο → ουδέτερο, ποτέ ακριβότερο.
 */
export function enfiaAgeKeyFromYearBuilt(
  yearBuilt: number | string | null | undefined,
  calcYear?: number | null,
): string | null {
  const y = Math.floor(Number(yearBuilt) || 0)
  const cy = Math.floor(Number(calcYear) || 0) || currentEnfiaYear()
  if (y < 1800 || y > cy) return null
  return enfiaAgeKeyFromYears(cy - y)
}

/**
 * Πεζά, χωρίς τόνους, χωρίς τελικό σίγμα — για να ταιριάζει το «Ισόγειο» της
 * καρτέλας με το «ισογειο» της σύγκρισης. Τα σημάδια τόνου που βγάζει η NFD
 * είναι το εύρος U+0300–U+036F.
 */
const flat = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ').trim()

/**
 * Κλειδί ορόφου από ό,τι κρατά η καρτέλα: αριθμό (2), ελληνική ετικέτα («2ος»,
 * «Ημιυπόγειο», «7ος και άνω») ή ήδη κανονικό κλειδί («second»).
 * Άγνωστο ή ασαφές («Δώμα / Ρετιρέ» — δεν ξέρουμε ποιος όροφος είναι) → null.
 *
 * ΠΡΟΣΟΧΗ ΣΤΟ 5: ο νόμος δίνει 1,02 στον 4ο ΚΑΙ στον 5ο και 1,03 από τον 6ο και
 * πάνω. Το κλειδί `fifth_plus` του πίνακα κρατά το 1,03, άρα ο 5ος όροφος
 * αντιστοιχίζεται στο `fourth` (1,02): το όνομα του κλειδιού είναι του πίνακα,
 * ο συντελεστής είναι του νόμου. Η εύκολη αντιστοίχιση 5 → `fifth_plus` θα
 * χρέωνε 1% παραπάνω ακριβώς στον όροφο που ο νόμος βάζει στο 1,02.
 */
export function enfiaFloorKeyFromValue(floor: string | number | null | undefined): string | null {
  if (floor == null) return null
  const raw = String(floor).trim()
  if (!raw) return null
  if (typeof ENFIA_FLOOR_COEF[raw] === 'number') return raw
  const t = flat(raw)
  // Το «ημιυπόγειο» πιάνεται από το «υπογει», το «υπερυψωμένο ισόγειο» από το «ισογει».
  if (t.includes('υπογει')) return 'basement'
  if (t.includes('ισογει')) return 'ground'
  if (t.includes('ημιωροφ')) return 'ground'   // ημιώροφος: ισόγειο και 1ος έχουν ούτως ή άλλως 1,00
  const digits = t.match(/-?\d+/)
  if (!digits) return null
  const n = parseInt(digits[0], 10)
  if (!Number.isFinite(n)) return null
  if (n < 0) return 'basement'
  if (n === 0) return 'ground'
  if (n === 1) return 'first'
  if (n === 2) return 'second'
  if (n === 3) return 'third'
  if (n <= 5) return 'fourth'
  return 'fifth_plus'
}
// Εκπτώσεις/απαλλαγές κύριου φόρου (άρθρο 7 ν.4223/2013), ΕΠΙΠΛΕΟΝ της αυτόματης
// μείωσης ανά συνολική αξία. Ο χρήστης επιλέγει όσες πληροί (με κριτήρια, βλ. note).
export const ENFIA_REDUCTIONS: { key: string; label: string; pct: number; note: string }[] = [
  { key: 'low_income', label: 'Χαμηλό εισόδημα (κύρια κατοικία)', pct: 50, note: 'Μείωση 50% με κριτήρια: εισόδημα ≤9.000 € (+1.000 €/μέλος), κτίσματα ≤150 τ.μ., περιουσία ≤85.000 € (άγαμος) / 200.000 € (έγγαμος με 2 τέκνα)' },
  { key: 'small_settlement_2026', label: 'Κύρια κατοικία μικρού οικισμού (2026)', pct: 50, note: 'Αυτόματη μείωση 50% ΕΝΦΙΑ 2026 για οικισμούς ≤1.500 κατ., αξία κατοικίας ≤400.000 €' },
  { key: 'large_family', label: 'Τρίτεκνοι / Πολύτεκνοι', pct: 100, note: '100% απαλλαγή με κριτήρια: εισόδημα ≤12.000 € (+1.000 €/μέλος), κτίσματα ≤150 τ.μ.' },
  { key: 'disability', label: 'Αναπηρία ≥80%', pct: 100, note: '100% απαλλαγή με τα ίδια εισοδηματικά/περιουσιακά κριτήρια' },
  { key: 'insurance', label: 'Ασφαλισμένη κατοικία', pct: 20, note: '20% (αξία ≤500.000 €) ή 10% (>500.000 €), κάλυψη σεισμού+πυρκαγιάς+πλημμύρας ≥3 μήνες' },
]
// Αυτόματη μείωση κύριου φόρου ανά συνολική αξία ακίνητης περιουσίας (άρθρο 7 §2Α,
// άρθρο 46 ν.4916/2022) — ισχύει για ΟΛΑ τα φυσικά πρόσωπα.
export const ENFIA_WEALTH_REDUCTION: { limit: number; pct: number }[] = [
  { limit: 100_000, pct: 30 }, { limit: 150_000, pct: 25 }, { limit: 250_000, pct: 20 },
  { limit: 300_000, pct: 15 }, { limit: 400_000, pct: 10 }, { limit: Infinity, pct: 0 },
]
// Προσαύξηση κύριου φόρου φυσικών προσώπων για συνολική αξία >500.000 €
// (άρθρο 4, Ενότητα Ε΄, άρθρο 43 ν.4916/2022). Ποσοστό ΕΠΙ ΤΟΥ ΚΥΡΙΟΥ ΦΟΡΟΥ.
export const ENFIA_SURCHARGE_THRESHOLD = 500_000
export const ENFIA_SURCHARGE_BRACKETS: { limit: number; pct: number }[] = [
  { limit: 650_000, pct: 5 }, { limit: 800_000, pct: 10 }, { limit: 1_000_000, pct: 15 }, { limit: Infinity, pct: 20 },
]
// Ενότητα Γ΄ (άρθρο 43 ν.4916/2022): πρόσθετος φόρος ΑΝΑ ακίνητο αξίας >400.000 €,
// κλιμακωτά επί της αξίας, εφόσον η ΣΥΝΟΛΙΚΗ αξία περιουσίας υπερβαίνει τις 300.000 €.
export const ENFIA_EXTRA_TAX_FREE = 400_000
export const ENFIA_EXTRA_WEALTH_THRESHOLD = 300_000
export const ENFIA_EXTRA_BRACKETS: { upto: number; rate: number }[] = [
  { upto: 500_000, rate: 0.0020 }, { upto: 600_000, rate: 0.0030 }, { upto: 700_000, rate: 0.0040 },
  { upto: 800_000, rate: 0.0050 }, { upto: 900_000, rate: 0.0060 }, { upto: 1_000_000, rate: 0.0070 },
  { upto: 2_000_000, rate: 0.0090 }, { upto: Infinity, rate: 0.0100 },
]

/** Πρόσθετος φόρος Ενότητας Γ΄ επί της αξίας ενός ακινήτου (κλιμακωτά, αφορολόγητο 400.000 €),
 *  απομειωμένος με το ποσοστό ιδιοκτησίας. Ο έλεγχος συνολικής αξίας >300.000 € γίνεται από τον καλούντα. */
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
  return cents(tax * (Math.max(0, Math.min(100, ownership)) / 100))
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
  propertyValue?: number // αντικειμενική αξία ΤΟΥ ακινήτου (για Ενότητα Γ, >400.000 €)
  reductions?: string[]
}
export interface ENFIAResult {
  basic: number
  extra: number          // πρόσθετος φόρος Ενότητας Γ (αξία ακινήτου >400.000 €)
  supplementary: number  // προσαύξηση κύριου φόρου (συνολική αξία >500.000 €)
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
  // ΟΤΑΝ ΛΕΙΠΕΙ ΟΡΟΦΟΣ Ή ΠΑΛΑΙΟΤΗΤΑ, Ο ΣΥΝΤΕΛΕΣΤΗΣ ΕΙΝΑΙ 1,00 — ΟΧΙ ΜΑΝΤΕΨΙΑ.
  //
  // Εδώ έγραφε `input.floor ?? 'second'` και `input.age ?? '10_20'`, δηλαδή
  // 1,01 × 1,15 = 1,1615: κάθε εκτίμηση χωρίς στοιχεία έβγαινε 16,15% ΠΑΝΩ από
  // την ουδέτερη βάση, ποτέ κάτω. Δεν ήταν άγνοια, ήταν κατεύθυνση.
  //
  // Ο ιδιοκτήτης προϋπολογίζει με βάση αυτό το νούμερο. Μια εκτίμηση που
  // μαντεύει πρέπει να μαντεύει ΟΥΔΕΤΕΡΑ· αν η μαντεψιά έχει φορά, ο χρήστης
  // βάζει στην άκρη λάθος ποσό και δεν έχει τρόπο να το δει.
  const basic = sqm * ENFIA_ZONE_TAX[input.zone] *
    enfiaFloorCoef(input.floor) * enfiaAgeCoef(input.age) * (ownership / 100)
  const totalVal = Number(input.totalValue) || 0
  // Ενότητα Γ: πρόσθετος φόρος ακινήτου >400.000 €, εφόσον συνολική περιουσία >300.000 €.
  const propVal = Number(input.propertyValue) || 0
  const extra = totalVal > ENFIA_EXTRA_WEALTH_THRESHOLD ? enfiaExtraPropertyTax(propVal, ownership) : 0
  // Κύριος φόρος (Ενότητα Δ) = κτίσματα (Α) + πρόσθετος (Γ).
  const kyrios = basic + extra
  // Προσαύξηση κύριου φόρου για συνολική αξία >500.000 € (Ενότητα Ε).
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
  const annual = cents(Math.max(0, subtotal - reductionAmount))
  return {
    basic: cents(basic), extra: cents(extra), supplementary: cents(suppl), subtotal: cents(subtotal),
    reductionPct: Math.round(combinedFrac * 100), reductionAmount: cents(reductionAmount), annual,
    installment: Math.ceil(annual / 12),
  }
}



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
 *
 * ΤΟ ΕΤΟΣ ΚΑΤΑΣΚΕΥΗΣ ΚΑΙ Ο ΟΡΟΦΟΣ ΗΤΑΝ ΗΔΗ ΣΤΗ ΒΑΣΗ ΚΑΙ ΔΕΝ ΔΙΑΒΑΖΟΝΤΑΝ.
 * Η συνάρτηση δεχόταν μόνο αξία και τ.μ., οπότε ο υπολογισμός έπεφτε στις
 * προεπιλογές «2ος όροφος» και «10-20 ετών» — 1,01 × 1,15. Και τα δύο πεδία
 * τα συμπληρώνει ο χρήστης στον οδηγό προσθήκης ακινήτου.
 *
 * Διαμέρισμα 90 τ.μ., αξία 180.000 € (ζώνη 1501-2500, ΣΒΦ 3,70):
 *   πριν   90 × 3,70 × 1,01 × 1,15 = 386,78 €· μετά τη μείωση 20% → 309,42 €
 *   τώρα (χωρίς στοιχεία, ουδέτερο)  90 × 3,70 = 333,00 €       → 266,40 €
 * Διαφορά 43,02 € τον χρόνο, 26 € αντί 23 € τη δόση — και ΠΑΝΤΑ προς τα πάνω.
 * Με στοιχεία (π.χ. κατασκευή 2006, 1ος όροφος) βγαίνει ο πραγματικός
 * συντελεστής, που μπορεί να είναι και μεγαλύτερος και μικρότερος.
 *
 * @param yearBuilt έτος κατασκευής από την καρτέλα· λείπει → ουδέτερο 1,00
 * @param floor     όροφος ως τον κρατά η καρτέλα («Ισόγειο», «2ος», αριθμός)
 * @param taxYear   έτος υπολογισμού· λείπει → το τρέχον έτος Ελλάδας
 */
export function estimateENFIAFromFacts(facts: {
  value?: number | null
  sqm?: number | null
  yearBuilt?: number | string | null
  floor?: string | number | null
  taxYear?: number | null
}): ENFIAResult | null {
  const sqm = Number(facts.sqm) || 0
  const value = Number(facts.value) || 0
  if (sqm <= 0 || value <= 0) return null
  const zone = zoneKeyFromPricePerSqm(value / sqm)
  if (!zone) return null
  // Άγνωστο πεδίο → `undefined`, που η estimateENFIA το διαβάζει ως 1,00.
  const age = enfiaAgeKeyFromYearBuilt(facts.yearBuilt, facts.taxYear) ?? undefined
  const floor = enfiaFloorKeyFromValue(facts.floor) ?? undefined
  // Το ίδιο ακίνητο είναι εδώ και η συνολική περιουσία (μονο-ακίνητη εκτίμηση):
  // propertyValue = totalValue = value, ώστε να εφαρμοστεί σωστά η Ενότητα Γ.
  return estimateENFIA({ sqm, zone, floor, age, totalValue: value, propertyValue: value, reductions: [] })
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
/**
 * ΑΠΟ ΠΟΥ ΞΕΡΟΥΜΕ ΤΟΝ ΕΝΦΙΑ, ΚΑΤΑ ΣΕΙΡΑ ΑΞΙΟΠΙΣΤΙΑΣ.
 *
 *   declared  Το φετινό εκκαθαριστικό. Δεν είναι εκτίμηση· είναι το ποσό.
 *   lastYear  Το περσινό εκκαθαριστικό, ή οι περσινές δόσεις. Ο ΕΝΦΙΑ ενός
 *             ακινήτου δεν αλλάζει από χρονιά σε χρονιά παρά μόνο αν αλλάξει
 *             το ίδιο το ακίνητο ή ο νόμος. Άρα το περσινό ποσό είναι
 *             ασύγκριτα ακριβέστερο από οποιαδήποτε μοντελοποίηση — και το
 *             ξέρει ήδη ο ιδιοκτήτης, γιατί το πλήρωσε.
 *   estimate  Ο υπολογισμός από ζώνη, εμβαδόν, όροφο και παλαιότητα. Έσχατη
 *             λύση, και λέγεται πάντα «εκτίμηση».
 *   none      Δεν ξέρουμε. Δεν γράφεται μηδέν.
 */
export type EnfiaSource = 'declared' | 'lastYear' | 'estimate' | 'none'

/**
 * Το περσινό ετήσιο ποσό, από όποιο από τα δύο έχει ο χρήστης μπροστά του.
 *
 * Το εκκαθαριστικό δεν το κρατούν όλοι. Τις δόσεις όμως τις βλέπει ο καθένας
 * στην τράπεζα ή στο myAADE, και είναι το ΙΔΙΟ νούμερο: δόση επί πλήθος δόσεων.
 * Χωρίς αυτή τη δεύτερη πόρτα, το ακριβέστερο στοιχείο της οθόνης θα ζητούσε
 * ένα χαρτί που ο μισός κόσμος έχει πετάξει.
 */
export function enfiaLastYearAnnual(input: {
  annual?: unknown; instalment?: unknown; instalments?: unknown;
}): number {
  const direct = numOr0(input.annual)
  if (direct > 0) return cents(direct)
  const per = numOr0(input.instalment)
  const n = numOr0(input.instalments)
  if (per > 0 && n > 0) return cents(per * n)
  return 0
}

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
  lastYearAnnual?: number | null,
): EnfiaInUse {
  const annual = numOr0(declaredAnnual) || numOr0(declaredMonthly) * 12
  if (annual > 0) return { annual: cents(annual), monthly: cents(annual / 12), source: 'declared' }
  // Το περσινό προηγείται της εκτίμησης: είναι μετρημένο ποσό, όχι μοντέλο.
  const last = numOr0(lastYearAnnual)
  if (last > 0) return { annual: cents(last), monthly: cents(last / 12), source: 'lastYear' }
  const est = numOr0(estimateAnnual)
  if (est > 0) return { annual: cents(est), monthly: cents(est / 12), source: 'estimate' }
  return { annual: 0, monthly: 0, source: 'none' }
}
