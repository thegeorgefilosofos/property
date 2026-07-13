// ═══════════════════════════════════════════════════════════════════════════
// ΜΑΖΙΚΗ ΕΠΑΛΗΘΕΥΣΗ ΜΗΧΑΝΗΣ ΑΠΟΔΟΣΕΩΝ — δεκάδες χιλιάδες τυχαίες περιπτώσεις.
// Αναλλοίωτες (invariants) + κλειστοί τύποι, ώστε τα αποτελέσματα να είναι
// απόλυτα αξιόπιστα (όχι 1–2 δοκιμές). Ντετερμινιστική γεννήτρια (αναπαραγώγιμο).
// ═══════════════════════════════════════════════════════════════════════════
import { yields, compound, leverage, applySeries, compareInvestments, propertyTotalReturn } from './returns'

let passed = 0, failed = 0
const fails: string[] = []
function ok(name: string, cond: boolean) { if (cond) passed++; else { failed++; if (fails.length < 40) fails.push(name) } }
const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps
function rng(seed: number) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// ── yields: αναλλοίωτες ─────────────────────────────────────────────────────
{
  const r = rng(101)
  for (let i = 0; i < 15000; i++) {
    const rent = Math.round(r() * 5000), value = Math.round(r() * 900000), opex = Math.round(r() * 12000), tax = Math.round(r() * 15000)
    const y = yields(rent, value, opex, tax)
    if (value <= 0) { ok(`μηδέν αξία → 0 @${i}`, y.grossYield === 0 && y.netYield === 0); continue }
    ok(`καθαρή ≤ μεικτή @${i}`, y.netYield <= y.grossYield + 1e-9)
    ok(`μετά-φόρου ≤ καθαρή @${i}`, y.netYieldAfterTax <= y.netYield + 1e-9)
    ok(`cap = καθαρή @${i}`, y.capRate === y.netYield)
    ok(`μεικτή = ετ.ενοίκιο/αξία @${i}`, near(y.grossYield, (rent * 12 / value) * 100, 0.06))
  }
}

// ── compound: κλειστός τύπος + μονοτονία ────────────────────────────────────
{
  const r = rng(202)
  for (let i = 0; i < 12000; i++) {
    const P = Math.round(r() * 300000), rate = r() * 12, n = 1 + Math.floor(r() * 30), C = Math.round(r() * 20000)
    const res = compound(P, rate, n, C)
    const rr = rate / 100
    const expected = rr === 0 ? P + C * n : P * Math.pow(1 + rr, n) + C * ((Math.pow(1 + rr, n) - 1) / rr)
    ok(`compound κλειστός τύπος @${i}`, near(res.futureValue, Math.round(expected * 100) / 100, Math.max(0.05, expected * 1e-6)))
    ok(`FV ≥ εισφορές (rate≥0) @${i}`, res.futureValue >= res.totalContributions - 0.05)
    ok(`totalGrowth = FV − εισφορές @${i}`, near(res.totalGrowth, res.futureValue - res.totalContributions, 0.05))
    ok(`perYear μήκος @${i}`, res.perYear.length === n)
  }
  // Μονοτονία στο επιτόκιο.
  for (let i = 0; i < 3000; i++) {
    const P = 100000, n = 20, C = 5000, a = r() * 8, b = a + r() * 4
    ok(`compound μονότονο στο rate @${i}`, compound(P, b, n, C).futureValue >= compound(P, a, n, C).futureValue - 0.05)
  }
}

// ── leverage: δομικές ταυτότητες ────────────────────────────────────────────
{
  const r = rng(303)
  for (let i = 0; i < 15000; i++) {
    const price = 50000 + Math.round(r() * 950000), ltv = r() * 100, rate = r() * 8, gy = r() * 10, ifree = r() * 100, buyC = r() * 8
    const l = leverage({ price, ltvPct: ltv, loanRatePct: rate, loanYears: 25, grossYieldPct: gy, opexPctOfRent: 20, interestFreePct: ifree, buyCostsPct: buyC })
    ok(`δάνειο = τιμή×ltv @${i}`, near(l.loan, price * ltv / 100, 0.02))
    ok(`ίδια = τιμή−δάνειο+κόστη @${i}`, near(l.equity, price - price * ltv / 100 + price * buyC / 100, 0.03))
    ok(`effRate = rate×(1−ifree) @${i}`, near(l.effectiveLoanRate, rate * (1 - ifree / 100), 0.02))
    ok(`positiveCarry ⟺ unlevered>effRate @${i}`, l.positiveCarry === (l.unleveredYield > l.effectiveLoanRate))
    ok(`cashFlow = NOI − δόση @${i}`, near(l.cashFlow, l.noi - l.annualDebtService, 0.05))
    ok(`NOI = ενοίκιο×0.8 (20% opex) @${i}`, near(l.noi, l.annualRent * 0.8, 0.05))
  }
}

// ── applySeries: γινόμενο + CAGR ────────────────────────────────────────────
{
  const r = rng(404)
  for (let i = 0; i < 8000; i++) {
    const start = 50000 + Math.round(r() * 500000), n = 2 + Math.floor(r() * 20)
    const changes = Array.from({ length: n }, (_, k) => ({ year: 2000 + k, pct: (r() - 0.4) * 20 }))
    const res = applySeries(start, changes)
    let prod = start; for (const c of changes) prod *= (1 + c.pct / 100)
    ok(`endValue = γινόμενο @${i}`, near(res.endValue, Math.round(prod * 100) / 100, Math.max(0.1, prod * 1e-6)))
    ok(`points μήκος @${i}`, res.points.length === n)
    // CAGR = round1 του πραγματικού (από το εμφανιζόμενο endValue).
    if (res.endValue > 0) { const trueCagr = (Math.pow(res.endValue / start, 1 / n) - 1) * 100; ok(`CAGR = round1(πραγματικού) @${i}`, near(res.cagrPct, Math.round(trueCagr * 10) / 10, 0.001)) }
  }
}

// ── compareInvestments: ταξινόμηση + κλειστός τύπος ─────────────────────────
{
  const r = rng(505)
  for (let i = 0; i < 6000; i++) {
    const A = 10000 + Math.round(r() * 490000), n = 1 + Math.floor(r() * 25)
    const opts = Array.from({ length: 3 + Math.floor(r() * 4) }, (_, k) => ({ key: 'k' + k, label: 'L' + k, annualReturnPct: r() * 14 }))
    const res = compareInvestments(A, n, opts)
    ok(`ταξινόμηση φθίνουσα @${i}`, res.every((x, k) => k === 0 || res[k - 1].futureValue >= x.futureValue))
    ok(`FV = A(1+r)^n @${i}`, res.every(x => near(x.futureValue, Math.round(A * Math.pow(1 + x.annualReturnPct / 100, n) * 100) / 100, Math.max(0.1, A * 1e-6))))
    ok(`propertyTotalReturn αθροιστικό @${i}`, propertyTotalReturn(r() * 6, r() * 6) >= 0)
  }
}

console.log(`returns.verify — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { console.log('Πρώτες αποτυχίες:'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1) }
console.log('όλα πέρασαν — η μηχανή αποδόσεων επαληθεύτηκε σε ' + passed.toLocaleString('el-GR') + ' ελέγχους')
