// Τεστ για την εκτίμηση ΕΝΦΙΑ (lib/billing/enfia.ts).
import { estimateENFIA, estimateENFIAFromFacts, zoneKeyFromPricePerSqm, ENFIA_ZONE_TAX } from './enfia'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

// ── Βασικός φόρος ───────────────────────────────────────────────────────────
{
  // 100 τ.μ., ζώνη 1500-2000 (3,70 €/τ.μ.), 2ος όροφος (1,01), 10-20 ετών (1,15), 100%
  const r = estimateENFIA({ sqm: 100, zone: '1500_2000', floor: 'second', age: '10_20', ownership: 100 })!
  ok('βασικός = τ.μ.×ζώνη×συντελεστές', near(r.basic, 100 * 3.70 * 1.01 * 1.15))
  ok('χωρίς προσαύξηση κάτω των 500k', r.supplementary === 0)
  ok('ετήσιο = υποσύνολο (χωρίς μειώσεις)', near(r.annual, r.subtotal))
  ok('12 δόσεις', r.installment === Math.ceil(r.annual / 12))
}

// ── Προσαύξηση κύριου φόρου (συνολική αξία > 500k) ──────────────────────────
{
  const under = estimateENFIA({ sqm: 120, zone: '2000_2500', totalValue: 250000 })!
  ok('καμία προσαύξηση όταν αξία ≤ 500k', under.supplementary === 0)
  const over = estimateENFIA({ sqm: 120, zone: '2000_2500', totalValue: 700000 })!
  ok('προσαύξηση > 0 όταν αξία > 500k', over.supplementary > 0)
  // 700k → κλιμάκιο ≤800k → 10% επί του κύριου φόρου
  ok('προσαύξηση = κύριος × 10% (κλιμάκιο ≤800k)', near(over.supplementary, over.basic * 0.10))
}

// ── Μειώσεις: κρατά τη μεγαλύτερη ───────────────────────────────────────────
{
  const plain = estimateENFIA({ sqm: 100, zone: '1000_1250' })!
  const reduced = estimateENFIA({ sqm: 100, zone: '1000_1250', reductions: ['low_income'] })!
  ok('χαμηλό εισόδημα −50%', near(reduced.annual, plain.annual * 0.5))
  const multi = estimateENFIA({ sqm: 100, zone: '1000_1250', reductions: ['insurance', 'large_family'] })!
  ok('κρατά τη μεγαλύτερη μείωση (100% όχι 20%)', multi.reductionPct === 100 && multi.annual === 0)
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
  ok('auto: καμία προσαύξηση γιατί αξία ≤ 500k', r.supplementary === 0)
  ok('auto: χωρίς δεδομένα → null', estimateENFIAFromFacts({ value: 0, sqm: 90 }) === null)
  // αξία > 500k → προσαύξηση κύριου φόρου
  const big = estimateENFIAFromFacts({ value: 700000, sqm: 120 })!
  ok('auto: προσαύξηση όταν αξία > 500k', big.supplementary > 0)
  // ΔΕΝ εφαρμόζεται πλέον αυτόματη έκπτωση κύριας κατοικίας
  ok('auto: καμία αυτόματη έκπτωση (απαιτεί κριτήρια)', r.reductionPct === 0)
}

console.log(`enfia.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
