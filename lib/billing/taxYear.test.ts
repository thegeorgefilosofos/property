// npx tsx lib/billing/taxYear.test.ts
//
// ΤΟ ΕΤΟΣ ΤΗΣ ΚΛΙΜΑΚΑΣ ΔΕΝ ΕΙΝΑΙ ΛΕΠΤΟΜΕΡΕΙΑ.
//
// Οι νέες κλίμακες (ν.5246/2025) ισχύουν για εισοδήματα ΑΠΟ 1/1/2026. Οι
// δηλώσεις που υποβάλλονται σήμερα αφορούν το 2025 και πάνε με την παλιά.
// Το app εφάρμοζε πάντα τη νέα, ενώ οι οθόνες επέλεγαν έτος — υποεκτίμηση 16%
// ακριβώς στη δήλωση που υποβάλλεται τώρα.
import {
  rentalIncomeTax, rentalBracketsForYear, bracketsLabelForYear,
  RENTAL_TAX_BRACKETS_2025, RENTAL_TAX_BRACKETS_2026, FIRST_YEAR_NEW_BRACKETS,
} from './greekTax'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

// ── Ποια κλίμακα για ποιο έτος ─────────────────────────────────────────────
ok('2026 → νέα', rentalBracketsForYear(2026) === RENTAL_TAX_BRACKETS_2026)
ok('2027 → νέα', rentalBracketsForYear(2027) === RENTAL_TAX_BRACKETS_2026)
ok('2025 → παλιά', rentalBracketsForYear(2025) === RENTAL_TAX_BRACKETS_2025)
ok('2024 → παλιά', rentalBracketsForYear(2024) === RENTAL_TAX_BRACKETS_2025)
ok('χωρίς έτος → νέα (μιλάμε για τώρα)', rentalBracketsForYear(undefined) === RENTAL_TAX_BRACKETS_2026)
ok('null → νέα', rentalBracketsForYear(null) === RENTAL_TAX_BRACKETS_2026)
ok('NaN → νέα, όχι σφάλμα', rentalBracketsForYear(NaN) === RENTAL_TAX_BRACKETS_2026)
ok('το όριο είναι το 2026', FIRST_YEAR_NEW_BRACKETS === 2026)

// ── Η ΠΡΑΓΜΑΤΙΚΗ ΔΙΑΦΟΡΑ, ΣΤΟ ΧΕΡΙ ───────────────────────────────────────
// 20.000 € ενοίκια, τεκμαρτή έκπτωση 5% → φορολογητέο 19.000 €.
//
//   2025:  12.000 × 15% = 1.800
//        +  7.000 × 35% = 2.450   → 4.250 €
//   2026:  12.000 × 15% = 1.800
//        +  7.000 × 25% = 1.750   → 3.550 €
{
  const taxable = 20000 * 0.95
  const t25 = rentalIncomeTax(taxable, rentalBracketsForYear(2025))
  const t26 = rentalIncomeTax(taxable, rentalBracketsForYear(2026))
  ok('2025: 4.250 €', near(t25, 4250))
  ok('2026: 3.550 €', near(t26, 3550))
  ok('η υποεκτίμηση ήταν 700 €', near(t25 - t26, 700))
  ok('δηλαδή 16% του σωστού φόρου', Math.round((t25 - t26) / t25 * 100) === 16)
}

// Κάτω από 12.000 οι δύο κλίμακες ΤΑΥΤΙΖΟΝΤΑΙ — εκεί δεν υπήρξε ποτέ σφάλμα.
for (const g of [0, 1000, 6000, 11999, 12000]) {
  ok(`στα ${g} € οι δύο κλίμακες συμφωνούν`,
     near(rentalIncomeTax(g, RENTAL_TAX_BRACKETS_2025), rentalIncomeTax(g, RENTAL_TAX_BRACKETS_2026)))
}
// Πάνω από 35.000 η διαφορά παγώνει: και οι δύο έχουν 45% στην κορυφή, και το
// άνοιγμα προέρχεται μόνο από τη ζώνη 12–24k (35% vs 25% σε 12.000 € = 1.200 €).
for (const g of [35000, 50000, 120000]) {
  ok(`στα ${g} € η διαφορά μένει 1.200 €`,
     near(rentalIncomeTax(g, RENTAL_TAX_BRACKETS_2025) - rentalIncomeTax(g, RENTAL_TAX_BRACKETS_2026), 1200))
}

// ── Η παλιά κλίμακα είναι ΠΑΝΤΑ βαρύτερη ή ίση, ποτέ ελαφρύτερη ───────────
// Αν κάποια στιγμή αντιστραφεί, κάποιος πείραξε τα κλιμάκια.
{
  let bad = -1
  for (let g = 0; g <= 60000; g += 250) {
    if (rentalIncomeTax(g, RENTAL_TAX_BRACKETS_2025) < rentalIncomeTax(g, RENTAL_TAX_BRACKETS_2026) - 0.01) { bad = g; break }
  }
  ok('η παλιά κλίμακα δεν βγαίνει ποτέ ελαφρύτερη', bad === -1)
}

// ── Οι ετικέτες λένε ποια εφαρμόστηκε ────────────────────────────────────
ok('ετικέτα 2025', bracketsLabelForYear(2025).includes('έως 2025'))
ok('ετικέτα 2026', bracketsLabelForYear(2026).includes('2026'))
ok('η ετικέτα αναφέρει τους συντελεστές', /15\/35\/45/.test(bracketsLabelForYear(2025)) && /15\/25\/35\/45/.test(bracketsLabelForYear(2026)))

// ── Δομική ακεραιότητα και των δύο κλιμάκων ──────────────────────────────
for (const [name, br] of [['2025', RENTAL_TAX_BRACKETS_2025], ['2026', RENTAL_TAX_BRACKETS_2026]] as const) {
  ok(`${name}: ξεκινά από το μηδέν`, br[0].from === 0)
  ok(`${name}: τελειώνει στο άπειρο`, br[br.length - 1].to === Infinity)
  let contiguous = true, rising = true
  for (let i = 1; i < br.length; i++) {
    if (br[i].from !== br[i - 1].to) contiguous = false
    if (br[i].rate <= br[i - 1].rate) rising = false
  }
  ok(`${name}: χωρίς κενά ανάμεσα στα κλιμάκια`, contiguous)
  ok(`${name}: οι συντελεστές ανεβαίνουν`, rising)
}

console.log(fail === 0 ? `✓ taxYear: ${pass} έλεγχοι πέρασαν` : `✗ taxYear: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
