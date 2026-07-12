// Τεστ για την εκτίμηση ΕΝΦΙΑ (lib/billing/enfia.ts) — τιμές ΦΕΚ Α΄65/2022.
import { estimateENFIA, estimateENFIAFromFacts, zoneKeyFromPricePerSqm, ENFIA_ZONE_TAX } from './enfia'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

// ── Βασικός φόρος (ΣΒΦ ζώνη 1501-2500 = 3,70 · 2ος όροφος 1,01 · 10-20 ετών 1,15)
{
  const r = estimateENFIA({ sqm: 100, zone: '1501_2500', floor: 'second', age: '10_20', ownership: 100 })!
  ok('βασικός = τ.μ.×ΣΒΦ×συντελεστές', near(r.basic, 100 * 3.70 * 1.01 * 1.15))
  ok('χωρίς προσαύξηση (καμία αξία)', r.supplementary === 0)
  ok('χωρίς μείωση όταν άγνωστη αξία', r.reductionPct === 0 && near(r.annual, r.subtotal))
  ok('12 δόσεις', r.installment === Math.ceil(r.annual / 12))
}

// ── Αυτόματη μείωση ανά συνολική αξία (άρθρο 7 §2Α) ─────────────────────────
{
  const w = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 90000 })!   // ≤100k → 30%
  ok('αξία ≤100k → μείωση 30%', w.reductionPct === 30 && near(w.annual, w.subtotal * 0.7))
  const w2 = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 500000 })!  // >400k → 0%, =500k χωρίς προσαύξηση
  ok('αξία >400k → καμία αυτόματη μείωση', w2.reductionPct === 0)
  ok('αξία =500k → καμία προσαύξηση', w2.supplementary === 0)
}

// ── Προσαύξηση κύριου φόρου (>500k) ─────────────────────────────────────────
{
  const s = estimateENFIA({ sqm: 120, zone: '1501_2500', totalValue: 700000 })!
  ok('προσαύξηση = κύριος × 10% (κλιμάκιο ≤800k)', near(s.supplementary, s.basic * 0.10))
  ok('>400k → καμία αυτόματη μείωση', s.reductionPct === 0)
}

// ── Χειροκίνητες εκπτώσεις (απομονωμένες με αξία >400k → wealthPct 0) ────────
{
  const plain = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 450000 })!
  const red = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 450000, reductions: ['low_income'] })!
  ok('χαμηλό εισόδημα −50%', near(red.annual, plain.annual * 0.5))
  const big = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 450000, reductions: ['insurance', 'large_family'] })!
  ok('κρατά τη μεγαλύτερη (100% → μηδέν)', big.reductionPct === 100 && big.annual === 0)
}

// ── Συνδυασμός αυτόματης + χειροκίνητης μείωσης (πολλαπλασιαστικά) ──────────
{
  const c = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 90000, reductions: ['insurance'] })! // 30% & 20%
  ok('30% & 20% → 44% συνολικά', c.reductionPct === 44) // 1-(0.7×0.8)=0.44
}

// ── Ποσοστό ιδιοκτησίας ─────────────────────────────────────────────────────
{
  const full = estimateENFIA({ sqm: 100, zone: '751_1500', ownership: 100 })!
  const half = estimateENFIA({ sqm: 100, zone: '751_1500', ownership: 50 })!
  ok('50% ιδιοκτησία → μισός βασικός', near(half.basic, full.basic / 2))
}

// ── Ασφάλεια εισόδου ────────────────────────────────────────────────────────
{
  ok('χωρίς τ.μ. → null', estimateENFIA({ sqm: 0, zone: '751_1500' }) === null)
  ok('χωρίς ζώνη → null', estimateENFIA({ sqm: 100, zone: '' }) === null)
  ok('άγνωστη ζώνη → null', estimateENFIA({ sqm: 100, zone: 'foo' }) === null)
}

// ── Αντιστοίχιση τιμής ζώνης (9 κλιμάκια ΦΕΚ) ───────────────────────────────
{
  ok('300 €/τ.μ. → 0_750', zoneKeyFromPricePerSqm(300) === '0_750')
  ok('1800 €/τ.μ. → 1501_2500', zoneKeyFromPricePerSqm(1800) === '1501_2500')
  ok('5000 €/τ.μ. → 4501_5000', zoneKeyFromPricePerSqm(5000) === '4501_5000')
  ok('6000 €/τ.μ. → over_5000', zoneKeyFromPricePerSqm(6000) === 'over_5000')
  ok('0 → null', zoneKeyFromPricePerSqm(0) === null)
  ok('όλα τα keys υπάρχουν στον πίνακα', ['0_750', '1501_2500', 'over_5000'].every(k => k in ENFIA_ZONE_TAX))
}

// ── Αυτόματη εκτίμηση από στοιχεία ακινήτου ─────────────────────────────────
{
  // αξία 180.000, 90 τ.μ. → 2.000 €/τ.μ. → ζώνη 1501_2500
  const r = estimateENFIAFromFacts({ value: 180000, sqm: 90 })!
  ok('auto: παράγει αποτέλεσμα', r !== null && r.annual > 0)
  ok('auto: καμία προσαύξηση (≤500k)', r.supplementary === 0)
  ok('auto: αξία 180k → μείωση 20% (≤250k)', r.reductionPct === 20)
  ok('auto: χωρίς δεδομένα → null', estimateENFIAFromFacts({ value: 0, sqm: 90 }) === null)
  const big = estimateENFIAFromFacts({ value: 700000, sqm: 120 })!
  ok('auto: προσαύξηση όταν αξία >500k', big.supplementary > 0)
}

console.log(`enfia.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
