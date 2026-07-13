// Τεστ για τη μηχανή αποδόσεων (lib/market/returns.ts) + ακεραιότητα δεδομένων αγοράς.
import { yields, compound, leverage, applySeries, compareInvestments, propertyTotalReturn, projectLine, yieldGrade } from './returns'
import { shortTermEstimate, breakEvenOccupancy, adrReference } from './shortTerm'
import {
  REGIONS, BENCHMARKS, HISTORY_INDEX, HISTORY_ANCHORS, SHORT_TERM, YIELD_LEVERS,
  GREECE_AVG_GROSS_YIELD, yieldVerdict, midPricePerSqm,
} from './greekMarket'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

// ── yields ──────────────────────────────────────────────────────────────────
{
  const y = yields(1000, 200000, 2000, 500)
  ok('μεικτή 6,0%', near(y.grossYield, 6.0))
  ok('καθαρή 5,0%', near(y.netYield, 5.0))
  ok('μετά φόρου ~4,8% (στρογγυλοποίηση 1 δεκ.)', near(y.netYieldAfterTax, 4.8, 0.06))
  ok('cap rate = καθαρή', y.capRate === y.netYield)
  ok('χωρίς αξία → 0', yields(1000, 0, 0).grossYield === 0)
}

// ── compound (ανατοκισμός) ────────────────────────────────────────────────
{
  ok('compound 0 έτη → κεφάλαιο', compound(10000, 5, 0).futureValue === 10000)
  // Ράντα: 10.000/έτος στο 5% για 20 έτη = 330.660 €.
  ok('ράντα 20ετίας @5% → 330.660', near(compound(0, 5, 20, 10000).futureValue, 330660, 5))
  // Χωρίς τόκο: γραμμικό.
  ok('r=0 → γραμμικό', compound(10000, 0, 10, 1000).futureValue === 20000)
  // Ανατοκισμός εφάπαξ.
  ok('εφάπαξ 100k @6% 10ετία', near(compound(100000, 6, 10).futureValue, 179084.77, 1))
  ok('perYear μήκος = έτη', compound(1000, 5, 12).perYear.length === 12)
}

// ── leverage (μόχλευση) ─────────────────────────────────────────────────────
{
  const l = leverage({ price: 200000, ltvPct: 70, loanRatePct: 3, loanYears: 25, grossYieldPct: 5, opexPctOfRent: 0 })
  ok('δάνειο 140k', l.loan === 140000)
  ok('ίδια κεφάλαια = τιμή − δάνειο + κόστη', near(l.equity, 200000 - 140000 + 8000)) // 4% κόστη
  ok('NOI = 10.000 (0 opex)', near(l.noi, 10000))
  ok('θετικό carry (5% > 3%)', l.positiveCarry === true)
  // Άτοκο μέρος υποδιπλασιάζει το επιτόκιο.
  const s = leverage({ price: 200000, ltvPct: 90, loanRatePct: 4, loanYears: 30, grossYieldPct: 5, interestFreePct: 50 })
  ok('Σπίτι μου ΙΙ: μέσο επιτόκιο 2%', near(s.effectiveLoanRate, 2.0, 0.01))
  // Αρνητικό carry όταν απόδοση < επιτόκιο.
  ok('αρνητικό carry (3% < 5%)', leverage({ price: 100000, ltvPct: 50, loanRatePct: 5, loanYears: 20, grossYieldPct: 3 }).positiveCarry === false)
}

// ── applySeries (ιστορική διαδρομή) ─────────────────────────────────────────
{
  const r = applySeries(100000, [{ year: 2018, pct: 1.8 }, { year: 2019, pct: 7.2 }])
  ok('τελική = 100k×1,018×1,072', near(r.endValue, 100000 * 1.018 * 1.072, 1))
  ok('2 σημεία', r.points.length === 2)
  ok('CAGR θετικό', r.cagrPct > 0)
  // Ιστορικός δείκτης ΤτΕ: κορυφή 2008 → πυθμένας 2017 ≈ −42%.
  const peak = HISTORY_INDEX.find(p => p.year === 2008)!.price
  const trough = HISTORY_INDEX.find(p => p.year === 2017)!.price
  ok('ΤτΕ κορυφή→πυθμένας ≈ −42%', near((trough - peak) / peak * 100, -42, 1.5))
}

// ── compareInvestments ──────────────────────────────────────────────────────
{
  const c = compareInvestments(10000, 10, [{ key: 'a', label: 'A', annualReturnPct: 5 }, { key: 'b', label: 'B', annualReturnPct: 3 }])
  ok('ταξινόμηση φθίνουσα', c[0].key === 'a')
  ok('FV 10k @5% 10ετία', near(c[0].futureValue, 16288.95, 1))
  ok('propertyTotalReturn = καθαρή + ανατίμηση', propertyTotalReturn(3.5, 6) === 9.5)
}

// ── projectLine (forward προβολή) ───────────────────────────────────────────
{
  const p = projectLine(100000, 5, 10)
  ok('projectLine μήκος = έτη+1', p.length === 11)
  ok('projectLine[0] = start', p[0].value === 100000 && p[0].year === 0)
  ok('projectLine τέλος = start×1,05^10', near(p[10].value, 100000 * Math.pow(1.05, 10), 1))
  ok('projectLine μονότονο (rate>0)', p.every((x, i) => i === 0 || x.value >= p[i - 1].value))
}

// ── yieldGrade (βαθμονόμηση σχετική με περιοχή) ─────────────────────────────
{
  // Περιοχή μεικτή 5% → καθαρή αναφορά 3,5%. Καθαρή = 3,5 → μέσος → C.
  ok('grade: στον μέσο → C', yieldGrade(3.5, 5).grade === 'C')
  ok('grade: σαφώς πάνω → A/B', ['A', 'B'].includes(yieldGrade(5.5, 5).grade))
  ok('grade: εξαιρετική → A', yieldGrade(6.5, 5).grade === 'A')
  ok('grade: χαμηλή → D/F', ['D', 'F'].includes(yieldGrade(2.0, 5).grade))
  ok('grade: score 0–100', [0, 3, 5, 8, 12].every(n => { const s = yieldGrade(n, 5).score; return s >= 0 && s <= 100 }))
  ok('grade: μονότονο στην καθαρή', yieldGrade(6, 5).score >= yieldGrade(3, 5).score)
}

// ── shortTermEstimate (βραχυχρόνια) ────────────────────────────────────────
{
  const s = shortTermEstimate({ occupancyPct: 60, adr: 100, cleaningPerStay: 40, platformFeePct: 15, propertyCount: 1, individual: true })
  ok('ST: νύχτες = round(365×πληρότητα)', s.nights === Math.round(365 * 0.6))
  ok('ST: μεικτά = νύχτες×ADR', near(s.grossRevenue, s.nights * 100, 0.5))
  ok('ST: προμήθεια 15%', near(s.platformFees, s.grossRevenue * 0.15, 0.5))
  ok('ST: καθαρά < μεικτά', s.netRevenue < s.grossRevenue)
  ok('ST: ΤΑΚΚ > 0', s.climateLevy > 0)
  ok('ST: παρεπιδημούντων 0 (ιδιώτης ≤2)', s.municipalTax === 0)
  ok('ST: παρεπιδημούντων >0 (3+ ακίνητα)', shortTermEstimate({ occupancyPct: 60, adr: 100, propertyCount: 3, individual: true }).municipalTax > 0)
  ok('ST: μηδέν πληρότητα → 0', shortTermEstimate({ occupancyPct: 0, adr: 100 }).grossRevenue === 0)
  // Μονοτονία στην πληρότητα.
  ok('ST: μονότονο στην πληρότητα', shortTermEstimate({ occupancyPct: 80, adr: 100 }).netRevenue > shortTermEstimate({ occupancyPct: 40, adr: 100 }).netRevenue)
  // Break-even: η πληρότητα-στόχος αποδίδει ~το target.
  const be = breakEvenOccupancy(5000, { adr: 100, cleaningPerStay: 40, platformFeePct: 15, propertyCount: 1, individual: true })
  ok('breakEven: εύλογο 0–100+', be > 0 && be < 200)
  ok('breakEven: επαληθεύεται', near(shortTermEstimate({ occupancyPct: be, adr: 100, cleaningPerStay: 40, platformFeePct: 15, propertyCount: 1, individual: true }).netRevenue, 5000, 60))
}

// ── adrReference (ρεαλιστική τιμή/νύχτα ανά μέγεθος & τύπο) ─────────────────
{
  const stAth = SHORT_TERM.find(s => s.key === 'ath_center')!
  ok('adr: στα 55 τ.μ. (apartment) = αναφορά', adrReference(stAth.adr, 55, 'apartment') === stAth.adr)
  ok('adr: μονότονο στο μέγεθος', adrReference(100, 30) < adrReference(100, 60) && adrReference(100, 60) < adrReference(100, 120))
  ok('adr: villa > apartment', adrReference(100, 80, 'villa') > adrReference(100, 80, 'apartment'))
  ok('adr: clamp άνω σε ακραίο μέγεθος', adrReference(100, 100000) <= Math.round(100 * 2.2 * 1.35) + 1)
  ok('adr: μηδέν βάση → 0', adrReference(0, 60) === 0)
  ok('adr: υπογραμμικό (2× μέγεθος < 2× τιμή)', adrReference(100, 110) < 2 * adrReference(100, 55))
  // Το ζητούμενο (κατά τον ελεγκτή): η μεικτή βραχυχρόνια απόδοση μένει ρεαλιστική & ~σταθερή
  // ανά μέγεθος για διαμέρισμα στη μέση τιμή/τ.μ. της περιοχής — δεν «εκτοξεύεται».
  const region = REGIONS.find(r => r.key === 'ath_center')!
  const mid = midPricePerSqm(region)
  const gys = [25, 55, 120].map(sqm => {
    const adr = adrReference(stAth.adr, sqm, 'apartment')
    const gross = shortTermEstimate({ occupancyPct: stAth.occupancy, adr }).grossRevenue
    return (gross / (sqm * mid)) * 100
  })
  ok('adr: μεικτή εντός 4–13% ανά μέγεθος', gys.every(g => g >= 4 && g <= 13))
  ok('adr: μεικτή ~σταθερή ως προς το μέγεθος (<1,5×)', Math.max(...gys) / Math.min(...gys) < 1.5)
  // Βαθμονόμηση: στα 55 τ.μ. τα έσοδα αναπαράγουν το πραγματικό ετήσιο έσοδο της ζώνης.
  ok('adr: έσοδα 55τ.μ. ≈ πραγματικό ετήσιο', near(shortTermEstimate({ occupancyPct: stAth.occupancy, adr: adrReference(stAth.adr, 55) }).grossRevenue, stAth.annualRevenue, stAth.annualRevenue * 0.05))
}

// ── Ακεραιότητα δεδομένων αγοράς ────────────────────────────────────────────
{
  ok('υπάρχουν περιοχές', REGIONS.length >= 15)
  ok('όλες: απόδοση 2–10%', REGIONS.every(r => r.grossYield >= 2 && r.grossYield <= 10))
  ok('όλες: τιμές αύξουσες', REGIONS.every(r => r.pricePerSqm[0] < r.pricePerSqm[1]))
  ok('όλες: ενοίκια αύξοντα', REGIONS.every(r => r.rentPerSqm[0] <= r.rentPerSqm[1]))
  ok('όλες: μοναδικά keys', new Set(REGIONS.map(r => r.key)).size === REGIONS.length)
  // Η δηλωμένη απόδοση συνεπής με τιμές/ενοίκια (±2,5pp λόγω ευρών).
  ok('απόδοση συνεπής με €/τ.μ.', REGIONS.every(r => {
    const mid = (r.pricePerSqm[0] + r.pricePerSqm[1]) / 2
    const rent = (r.rentPerSqm[0] + r.rentPerSqm[1]) / 2
    const implied = (rent * 12 / mid) * 100
    return Math.abs(implied - r.grossYield) <= 2.5
  }))
  ok('εθνικός μέσος 4,4%', GREECE_AVG_GROSS_YIELD === 4.4)
  ok('benchmarks πλήρη (10ετία & 20ετία)', BENCHMARKS.length >= 4 && BENCHMARKS.every(b => Number.isFinite(b.ret10) && Number.isFinite(b.ret20)))
  // Ειλικρίνεια: το Χρηματιστήριο Αθηνών έχει σχεδόν μηδενική 20ετία (κρίση).
  ok('ΧΑ 20ετία ~μηδενική', BENCHMARKS.find(b => b.key === 'athex')!.ret20 < 3)
  ok('ιστορικό 2007–2026', HISTORY_INDEX[0].year === 2007 && HISTORY_INDEX[HISTORY_INDEX.length - 1].year === 2026)
  ok('ιστορικό: έτη αύξοντα, τιμές θετικές', HISTORY_INDEX.every((p, i) => p.price > 0 && (i === 0 || p.year > HISTORY_INDEX[i - 1].year)))
  ok('πυθμένας 2017', HISTORY_ANCHORS.troughYear === 2017)
  ok('βραχυχρόνια δεδομένα', SHORT_TERM.length >= 5 && SHORT_TERM.every(s => s.grossYield > 0 && s.longTermYield > 0))
  ok('μοχλοί με ρίσκο & πηγή', YIELD_LEVERS.length >= 5 && YIELD_LEVERS.every(l => l.impact && l.risk))
  // yieldVerdict λογική.
  ok('verdict καλό ≥5,5', yieldVerdict(6).tone === 'good' && yieldVerdict(4).tone === 'ok' && yieldVerdict(3).tone === 'low')
  ok('midPricePerSqm', midPricePerSqm(REGIONS[0]) > 0)
}

console.log(`returns/market — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) process.exit(1)
console.log('όλα πέρασαν')
