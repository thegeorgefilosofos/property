// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΑΓΜΑΤΙΚΕΣ ΕΚΚΑΘΑΡΙΣΕΙΣ (ΑΑΔΕ methodology) — 13 πλήρη σενάρια
// ---------------------------------------------------------------------------
// Κάθε σενάριο ακολουθεί τη διαδρομή της εκκαθάρισης: ακαθάριστο → τεκμαρτή έκπτωση
// 5% (αν εισπράττεται μέσω τραπέζης) → φορολογητέο → φόρος κλιμακωτά → δόσεις. Οι
// αριθμοί είναι η ΑΡΙΘΜΗΤΙΚΗ ΤΟΥ ΝΟΜΟΥ (ν.5246/2025 — κλίμακες που επιβεβαιώθηκαν
// από πολλαπλές έγκυρες πηγές) και αγκυρώνονται στο ΔΗΜΟΣΙΕΥΜΕΝΟ παράδειγμα
// «φορολογητέο 20.000 € → φόρος 3.800 €». Δεν προέρχονται από ιδιωτικό εκκαθαριστικό
// (η aade.gov.gr δεν είναι προσβάσιμη εδώ)· αναπαράγουν την ΙΔΙΑ μεθοδολογία.
//
// Πηγές κλίμακας ενοικίων 2026 (διασταυρωμένες): 15% (0–12k) / 25% (12–24k) /
// 35% (24–35k) / 45% (>35k) — nerally.gr, taxrevenue.gr, capital.gr, ΠΟΜΙΔΑ,
// taxheaven.gr, ΝΟΜΙΚΗ ΒΙΒΛΙΟΘΗΚΗ.
// ═══════════════════════════════════════════════════════════════════════════

import { incomeStatement, consolidateIndividual } from './statement'
import { estimateENFIA } from '../billing/enfia'

let passed = 0, failed = 0
const rows: string[] = []
function check(id: string, desc: string, expected: number, actual: number) {
  const okp = Math.abs(expected - actual) <= 0.011
  if (okp) passed++; else failed++
  rows.push(`  ${okp ? '✓' : '✗'} [${id}] ${desc}: αναμ. ${expected.toFixed(2)} € — μηχανή ${actual.toFixed(2)} €`)
}
const R = (n: number) => Math.round(n * 100) / 100

// ── ΕΝΟΙΚΙΑ (φυσικό πρόσωπο, μακροχρόνια, μέσω τραπέζης → τεκμαρτή 5%) ───────
// Φορολογητέο = ακαθάριστο × 0,95· φόρος κλιμακωτά.
{
  const cases = [
    { id: 'A', gross: 6000, taxable: 5700, tax: 5700 * 0.15 },                                   // 855,00
    { id: 'B', gross: 12000, taxable: 11400, tax: 11400 * 0.15 },                                // 1.710,00
    { id: 'C', gross: 18000, taxable: 17100, tax: 12000 * 0.15 + 5100 * 0.25 },                  // 3.075,00
    { id: 'D', gross: 24000, taxable: 22800, tax: 12000 * 0.15 + 10800 * 0.25 },                 // 4.500,00
    { id: 'E', gross: 30000, taxable: 28500, tax: 12000 * 0.15 + 12000 * 0.25 + 4500 * 0.35 },   // 6.375,00
    { id: 'F', gross: 48000, taxable: 45600, tax: 12000 * 0.15 + 12000 * 0.25 + 11000 * 0.35 + 10600 * 0.45 }, // 13.420,00
  ]
  for (const c of cases) {
    const st = incomeStatement({ regime: 'individual_longterm', grossIncome: c.gross, rentsPaidViaBank: true })
    check(c.id, `ενοίκιο ${c.gross}€ (φορολογητέο ${c.taxable})`, R(c.tax), st.incomeTax)
    check(c.id, `  → φορολογητέο ${c.taxable}€`, c.taxable, st.taxableIncome)
  }
}

// ── ΕΝΟΙΚΙΟ ΜΕ ΜΕΤΡΗΤΑ (χωρίς τράπεζα → χάνεται η 5%, φόρος στο 100%) ────────
// Αγκυρώνει στο δημοσιευμένο: φορολογητέο 20.000 → 3.800 €.
{
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: 20000, rentsPaidViaBank: false })
  check('G', 'ενοίκιο 20.000€ ΜΕΤΡΗΤΑ (φορολογητέο 20.000)', 3800, st.incomeTax) // δημοσιευμένο
  check('G', '  → φορολογητέο 20.000€ (χωρίς έκπτωση)', 20000, st.taxableIncome)
}

// ── ΕΠΙΧΕΙΡΗΣΗ: ατομική (άρθρο 15) & νομικό πρόσωπο (22%) ───────────────────
{
  // Ατομική, καθαρό κέρδος 30.000 → 9/20/26: 900+2000+2600 = 5.500· προκαταβολή 55% = 3.025.
  const sole = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: 30000, itemizedExpenses: 0 })
  check('H', 'ατομική επιχ. κέρδος 30.000€', 5500, sole.incomeTax)
  check('H', '  → προκαταβολή 55%', 3025, sole.advanceTax)
  // Νομικό πρόσωπο, κέρδος 50.000 → 22% = 11.000· προκαταβολή 80% = 8.800.
  const co = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 50000, itemizedExpenses: 0 })
  check('I', 'νομικό πρόσωπο κέρδος 50.000€ (22%)', 11000, co.incomeTax)
  check('I', '  → προκαταβολή 80%', 8800, co.advanceTax)
}

// ── ΝΕΟΙ (μειωμένη κλίμακα άρθρου 15, ν.5246/2025) ─────────────────────────
{
  // Νέος ≤25, επιχ. εισόδημα 18.000 → 0% έως 20k → 0 €.
  const y25 = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: 18000, taxpayerAge: 24 })
  check('J', 'νέος ≤25, εισόδημα 18.000€ (0% έως 20k)', 0, y25.incomeTax)
  // Νέος 26–30, εισόδημα 25.000 → 9% έως 20k (1.800) + 26% στα 5k (1.300) = 3.100.
  const y30 = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: 25000, taxpayerAge: 28 })
  check('K', 'νέος 26–30, εισόδημα 25.000€', 3100, y30.incomeTax)
}

// ── ΧΑΡΤΟΦΥΛΑΚΙΟ (Ε1): φόρος στο ΑΘΡΟΙΣΜΑ, όχι ανά ακίνητο ──────────────────
{
  // Δύο ακίνητα 10.000 + 14.000 (μέσω τραπέζης) → φορολογητέα 9.500 + 13.300 = 22.800
  // → φόρος στο σύνολο = 4.500 € (ίδιο με το ενιαίο σενάριο D).
  const con = consolidateIndividual([
    { id: 'p1', input: { regime: 'individual_longterm', grossIncome: 10000, rentsPaidViaBank: true } },
    { id: 'p2', input: { regime: 'individual_longterm', grossIncome: 14000, rentsPaidViaBank: true } },
  ])
  check('L', 'χαρτοφυλάκιο 10.000+14.000 → φόρος στο σύνολο 22.800', 4500, con.incomeTax)
  check('L', '  → συνολικό φορολογητέο 22.800€', 22800, con.taxableIncome)
  // Επιμερισμός: τα μερίδια αθροίζουν στον συνολικό φόρο.
  const shareSum = con.perProperty.reduce((s, p) => s + p.taxShare, 0)
  check('L', '  → άθροισμα μεριδίων = συνολικός φόρος', con.incomeTax, R(shareSum))
}

// ── ΕΝΦΙΑ: διαμέρισμα 100 τ.μ., ζώνη 1.501–2.500, 2ος όροφος, 10–20 ετών ────
{
  const r = estimateENFIA({ sqm: 100, zone: '1501_2500', floor: 'second', age: '10_20', ownership: 100 })!
  // 100 × 3,70 × 1,01 (όροφος) × 1,15 (παλαιότητα) = 429,76 €· 12 δόσεις.
  check('M', 'ΕΝΦΙΑ 100τμ ζώνη 1.501–2.500 2ος 10–20ετ', R(100 * 3.70 * 1.01 * 1.15), r.annual)
  check('M', '  → μηνιαία δόση = ceil(ετήσιο/12)', Math.ceil(r.annual / 12), r.installment)
}

console.log('ΕΚΚΑΘΑΡΙΣΕΙΣ (ΑΑΔΕ methodology):')
for (const r of rows) console.log(r)
console.log(`\ntaxClearances — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) process.exit(1)
console.log('όλες οι εκκαθαρίσεις συμφωνούν με τη μηχανή')
