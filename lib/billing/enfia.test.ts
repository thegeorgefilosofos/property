// Τεστ για τον υπολογισμό ΕΝΦΙΑ (lib/billing/enfia.ts).
import { estimateENFIA, estimateENFIAFromFacts, zoneKeyFromPricePerSqm, ENFIA_ZONE_TAX } from './enfia'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

// ── Βασικός φόρος ───────────────────────────────────────────────────────────
{
  // 100 τ.μ., ζώνη 1500-2000 (7,60 €/τ.μ.), 2ος όροφος (1.02), 10-20 ετών (0.95), 100%
  const r = estimateENFIA({ sqm: 100, zone: '1500_2000', floor: 'second', age: '10_20', ownership: 100 })!
  ok('βασικός = τ.μ.×ζώνη×συντελεστές', near(r.basic, 100 * 7.60 * 1.02 * 0.95))
  ok('χωρίς συμπληρωματικό κάτω των 100k', r.supplementary === 0)
  ok('ετήσιο = υποσύνολο (χωρίς μειώσεις)', near(r.annual, r.subtotal))
  ok('6 δόσεις', r.installment === Math.ceil(r.annual / 6))
}

// ── Συμπληρωματικός φόρος πάνω από 100k ─────────────────────────────────────
{
  const r = estimateENFIA({ sqm: 120, zone: '2000_2500', totalValue: 250000 })!
  ok('συμπληρωματικός > 0 όταν αξία > 100k', r.supplementary > 0)
  ok('συμπληρωματικός = αξία × συντελεστή κλιμακίου', near(r.supplementary, 250000 * 0.002))
}

// ── Μειώσεις: κρατά τη μεγαλύτερη ───────────────────────────────────────────
{
  const plain = estimateENFIA({ sqm: 100, zone: '1000_1250' })!
  const reduced = estimateENFIA({ sqm: 100, zone: '1000_1250', reductions: ['main_residence'] })!
  ok('κύρια κατοικία −50%', near(reduced.annual, plain.annual * 0.5))
  const multi = estimateENFIA({ sqm: 100, zone: '1000_1250', reductions: ['three_children', 'four_children'] })!
  ok('κρατά τη μεγαλύτερη μείωση (50% όχι 25%)', multi.reductionPct === 50)
}

// ── Ποσοστό ιδιοκτησίας ─────────────────────────────────────────────────────
{
  const full = estimateENFIA({ sqm: 100, zone: '1000_1250', ownership: 100 })!
  const half = estimateENFIA({ sqm: 100, zone: '1000_1250', ownership: 50 })!
  ok('50% ιδιοκτησία → μισός βασικός', near(half.basic, full.basic / 2))
}

// ── Ασφάλεια εισόδου ────────────────────────────────────────────────────────
{
  ok('χωρίς τ.μ. → null', estimateENFIA({ sqm: 0, zone: '1000_1250' }) === null)
  ok('χωρίς ζώνη → null', estimateENFIA({ sqm: 100, zone: '' }) === null)
  ok('άγνωστη ζώνη → null', estimateENFIA({ sqm: 100, zone: 'foo' }) === null)
}

// ── Αντιστοίχιση τιμής ζώνης ────────────────────────────────────────────────
{
  ok('300 €/τ.μ. → under_500', zoneKeyFromPricePerSqm(300) === 'under_500')
  ok('1800 €/τ.μ. → 1500_2000', zoneKeyFromPricePerSqm(1800) === '1500_2000')
  ok('5000 €/τ.μ. → over_4000', zoneKeyFromPricePerSqm(5000) === 'over_4000')
  ok('0 → null', zoneKeyFromPricePerSqm(0) === null)
  ok('όλα τα keys υπάρχουν στον πίνακα', ['under_500', '1500_2000', 'over_4000'].every(k => k in ENFIA_ZONE_TAX))
}

// ── Αυτόματη εκτίμηση από στοιχεία ακινήτου ─────────────────────────────────
{
  // αξία 180.000, 90 τ.μ. → 2.000 €/τ.μ. → ζώνη 2000_2500
  const r = estimateENFIAFromFacts({ value: 180000, sqm: 90 })!
  ok('auto: παράγει αποτέλεσμα από αξία+τ.μ.', r !== null && r.annual > 0)
  ok('auto: συμπληρωματικός γιατί αξία > 100k', r.supplementary > 0)
  ok('auto: χωρίς δεδομένα → null', estimateENFIAFromFacts({ value: 0, sqm: 90 }) === null)
  const mr = estimateENFIAFromFacts({ value: 120000, sqm: 100, mainResidence: true })!
  const nomr = estimateENFIAFromFacts({ value: 120000, sqm: 100 })!
  ok('auto: κύρια κατοικία μειώνει', mr.annual < nomr.annual)
}

console.log(`enfia.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
