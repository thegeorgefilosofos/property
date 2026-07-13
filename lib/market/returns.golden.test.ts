// ═══════════════════════════════════════════════════════════════════════════
// GOLDEN CASES — κάθε αναμενόμενη τιμή υπολογισμένη ΑΝΕΞΑΡΤΗΤΑ στο χέρι (όχι
// αναλλοίωτες, αλλά συγκεκριμένα νούμερα). Αποδεικνύει πραγματική ορθότητα.
// Τρέξε: npx tsx lib/market/returns.golden.test.ts
// ═══════════════════════════════════════════════════════════════════════════
import { yields, compound, leverage, applySeries, compareInvestments, propertyTotalReturn, projectLine, yieldGrade, npv, irr, remainingBalance, dealAnalysis } from './returns'
import { shortTermEstimate, breakEvenOccupancy, adrReference } from './shortTerm'
import { BENCHMARKS } from './greekMarket'
import { portfolioReturns } from './portfolio'
import { communityStats, percentile, COMMUNITY_MIN_SAMPLE } from './community'

let passed = 0, failed = 0
function ok(name: string, cond: boolean, got?: unknown, want?: unknown) {
  if (cond) passed++
  else { failed++; console.log('  ✗ ' + name + (got !== undefined ? `  (got ${got}, want ${want})` : '')) }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

// ── yields: value 200.000, ενοίκιο 1.000/μήνα, έξοδα 2.000, φόρος 3.000 ──────
{
  const y = yields(1000, 200000, 2000, 3000)
  // ετ.ενοίκιο 12.000. μεικτή=12000/200000=6,0%. καθαρή=(12000-2000)/200000=5,0%.
  // μετά-φόρου=(12000-2000-3000)/200000=3,5%.
  ok('yields μεικτή = 6,0', y.grossYield === 6.0, y.grossYield, 6.0)
  ok('yields καθαρή = 5,0', y.netYield === 5.0, y.netYield, 5.0)
  ok('yields μετά-φόρου = 3,5', y.netYieldAfterTax === 3.5, y.netYieldAfterTax, 3.5)
  ok('yields cap = 5,0', y.capRate === 5.0, y.capRate, 5.0)
  ok('yields annualRent = 12.000', y.annualRent === 12000, y.annualRent, 12000)
}

// ── compound: κλειστός τύπος ─────────────────────────────────────────────────
{
  // 100.000 @6% 10ετία εφάπαξ = 100000·1,06^10 = 179.084,77
  ok('compound εφάπαξ 179.084,77', near(compound(100000, 6, 10).futureValue, 179084.77, 0.01))
  // Ράντα 10.000/έτος @5% 20ετία = 10000·(1,05^20−1)/0,05 = 330.659,54
  ok('compound ράντα 330.659,54', near(compound(0, 5, 20, 10000).futureValue, 330659.54, 0.5))
  // r=0 γραμμικό: 10.000 + 1.000·10 = 20.000
  ok('compound r=0 → 20.000', compound(10000, 0, 10, 1000).futureValue === 20000)
}

// ── leverage: δομικές ταυτότητες (τιμή 200k, 70% δάνειο, 3%, 25ετία, 5% απόδοση) ──
{
  const l = leverage({ price: 200000, ltvPct: 70, loanRatePct: 3, loanYears: 25, grossYieldPct: 5, opexPctOfRent: 20 })
  ok('leverage δάνειο = 140.000', l.loan === 140000, l.loan, 140000)
  ok('leverage ίδια = 68.000 (4% κόστη)', l.equity === 68000, l.equity, 68000) // 200k-140k+8k
  ok('leverage NOI = 8.000', l.noi === 8000, l.noi, 8000) // 10.000 ενοίκιο - 20%
  ok('leverage annualRent = 10.000', l.annualRent === 10000, l.annualRent, 10000)
  ok('leverage effRate = 3,0', l.effectiveLoanRate === 3.0, l.effectiveLoanRate, 3.0)
  // Τοκοχρεολυτική δόση: 140000·(0,0025)/(1−1,0025^−300)·12 ≈ 7.966,9/έτος
  ok('leverage δόση ≈ 7.966,9', near(l.annualDebtService, 7966.87, 1), l.annualDebtService, 7966.87)
  ok('leverage cashFlow = NOI − δόση', near(l.cashFlow, l.noi - l.annualDebtService, 0.01))
  ok('leverage θετικό carry (3,8>3,0)', l.positiveCarry === true)
  // Σπίτι μου ΙΙ: 50% άτοκο → μέσο επιτόκιο 4%·0,5 = 2,0%
  const s = leverage({ price: 300000, ltvPct: 90, loanRatePct: 4, loanYears: 30, grossYieldPct: 5, interestFreePct: 50 })
  ok('leverage Σπίτι μου ΙΙ effRate = 2,0', s.effectiveLoanRate === 2.0, s.effectiveLoanRate, 2.0)
}

// ── applySeries: γινόμενο μεταβολών ──────────────────────────────────────────
{
  const r = applySeries(100000, [{ year: 2018, pct: 1.8 }, { year: 2019, pct: 7.2 }])
  // 100000·1,018·1,072 = 109.129,60
  ok('applySeries end = 109.129,60', near(r.endValue, 109129.60, 0.01), r.endValue, 109129.60)
  ok('applySeries totalReturn = 9,1', r.totalReturnPct === 9.1, r.totalReturnPct, 9.1)
}

// ── compareInvestments + projectLine: κλειστός τύπος ─────────────────────────
{
  const c = compareInvestments(10000, 10, [{ key: 'a', label: 'A', annualReturnPct: 5 }, { key: 'b', label: 'B', annualReturnPct: 3 }])
  ok('compare[0] = A (φθίνουσα)', c[0].key === 'a')
  ok('compare A FV = 16.288,95', near(c[0].futureValue, 16288.95, 0.01), c[0].futureValue, 16288.95)
  ok('compare B FV = 13.439,16', near(c[1].futureValue, 13439.16, 0.01), c[1].futureValue, 13439.16)
  // projectLine 100.000 @5% 10ετία τέλος = 162.889,46
  ok('projectLine[10] = 162.889,46', near(projectLine(100000, 5, 10)[10].value, 162889.46, 0.01))
  ok('propertyTotalReturn 3,5+6 = 9,5', propertyTotalReturn(3.5, 6) === 9.5)
}

// ── yieldGrade: σχετικό με περιοχή ───────────────────────────────────────────
{
  ok('grade στον μέσο (3,5 vs 5) = C', yieldGrade(3.5, 5).grade === 'C')
  ok('grade εξαιρετική (6,5 vs 5) = A', yieldGrade(6.5, 5).grade === 'A')
  ok('grade χαμηλή (2,0 vs 5) = D/F', ['D', 'F'].includes(yieldGrade(2.0, 5).grade))
}

// ── adrReference: υπογραμμική κλιμάκωση (hand-computed) ──────────────────────
{
  ok('adr 55τ.μ. apartment = 76 (ταυτότητα)', adrReference(76, 55, 'apartment') === 76, adrReference(76, 55, 'apartment'), 76)
  // (22/55)^0,9 = 0,438 → clamp κάτω 0,5 → 76·0,5 = 38
  ok('adr 22τ.μ. = 38 (clamp 0,5×)', adrReference(76, 22, 'apartment') === 38, adrReference(76, 22, 'apartment'), 38)
  // (110/55)^0,9 = 2^0,9 = 1,866 → 76·1,866 = 141,8 → 142
  ok('adr 110τ.μ. = 142', adrReference(76, 110, 'apartment') === 142, adrReference(76, 110, 'apartment'), 142)
  // villa 80τ.μ.: (80/55)^0,9·1,35·100 = 1,401·1,35·100 = 189,1 → 189
  ok('adr 80τ.μ. villa = 189', adrReference(100, 80, 'villa') === 189, adrReference(100, 80, 'villa'), 189)
}

// ── shortTermEstimate: hand-computed έσοδα/κόστη ─────────────────────────────
{
  const s = shortTermEstimate({ occupancyPct: 60, adr: 100, cleaningPerStay: 40, platformFeePct: 15, avgNightsPerStay: 4, propertyCount: 1, individual: true })
  // νύχτες = round(365·0,6) = 219. μεικτά = 219·100 = 21.900. προμήθεια 15% = 3.285.
  // διαμονές = 219/4 = 54,75. καθαρισμός = 54,75·40 = 2.190.
  ok('ST νύχτες = 219', s.nights === 219, s.nights, 219)
  ok('ST μεικτά = 21.900', s.grossRevenue === 21900, s.grossRevenue, 21900)
  ok('ST προμήθεια = 3.285', s.platformFees === 3285, s.platformFees, 3285)
  ok('ST καθαρισμός = 2.190', s.cleaning === 2190, s.cleaning, 2190)
  ok('ST ΤΑΚΚ > 0', s.climateLevy > 0)
  ok('ST παρεπιδημούντων = 0 (ιδιώτης ≤2)', s.municipalTax === 0)
  ok('ST καθαρά = μεικτά − όλα τα κόστη', near(s.netRevenue, 21900 - 3285 - 2190 - s.climateLevy - s.municipalTax, 0.01))
  // Break-even: πληρότητα-στόχος αναπαράγει τον στόχο
  const be = breakEvenOccupancy(5000, { adr: 100, cleaningPerStay: 40, platformFeePct: 15, propertyCount: 1, individual: true })
  ok('breakEven αναπαράγει στόχο', near(shortTermEstimate({ occupancyPct: be, adr: 100, cleaningPerStay: 40, platformFeePct: 15, propertyCount: 1, individual: true }).netRevenue, 5000, 60))
}

// ── honest benchmarks: πραγματικές αποδόσεις (sanity) ───────────────────────
{
  const by = (k: string) => BENCHMARKS.find(b => b.key === k)!
  ok('sp500 10ετία ∈ [10,16]', by('sp500').ret10 >= 10 && by('sp500').ret10 <= 16)
  ok('sp500 20ετία ∈ [8,13]', by('sp500').ret20 >= 8 && by('sp500').ret20 <= 13)
  ok('ΧΑ 20ετία ~μηδέν (<3, κρίση)', by('athex').ret20 < 3)
  ok('ομόλογο 20ετία ~μηδέν (<3, PSI)', by('bond').ret20 < 3)
  ok('κατάθεση 10ετία < πληθωρισμό', by('deposit').ret10 < by('inflation').ret10)
  ok('sp500 accumulating = αφορολόγητο', by('sp500').taxFree === true)
  // Σύγκριση 100.000 στο S&P500 (11% 20ετία) = 100000·1,11^20 = 806.231,15
  const c = compareInvestments(100000, 20, [{ key: 'sp500', label: 'x', annualReturnPct: by('sp500').ret20 }])
  ok('compare S&P500 20ετία = 806.231', near(c[0].futureValue, 806231.15, 1), c[0].futureValue, 806231.15)
}

// ── IRR / NPV / DSCR (hand-computed) ────────────────────────────────────────
{
  // NPV(10%, [-100, 110]) = -100 + 110/1,1 = 0
  ok('npv(10%, [-100,110]) = 0', npv(10, [-100, 110]) === 0, npv(10, [-100, 110]), 0)
  // NPV(0%, [-100, 50, 60]) = 10
  ok('npv(0%, [-100,50,60]) = 10', npv(0, [-100, 50, 60]) === 10, npv(0, [-100, 50, 60]), 10)
  // IRR([-100, 110]) = 10%
  ok('irr([-100,110]) = 10,0', near(irr([-100, 110]), 10.0, 0.05), irr([-100, 110]), 10.0)
  // IRR([-1000,0,0,0,0, 1610.51]) = 10% (1000·1,1^5 = 1610,51)
  ok('irr 5ετία @10% = 10,0', near(irr([-1000, 0, 0, 0, 0, 1610.51]), 10.0, 0.05), irr([-1000, 0, 0, 0, 0, 1610.51]), 10.0)
  // IRR χωρίς λύση → NaN
  ok('irr όλα θετικά → NaN', Number.isNaN(irr([100, 110])))
  // Υπόλοιπο δανείου
  ok('υπόλοιπο 25/25 = 0', remainingBalance(140000, 3, 25, 25) === 0)
  ok('υπόλοιπο 0/25 = αρχικό', remainingBalance(140000, 3, 25, 0) === 140000)
  ok('υπόλοιπο 5/10 άτοκο = μισό', remainingBalance(140000, 0, 10, 5) === 70000)
  // dealAnalysis: όλα μετρητά, 100k, 5% απόδοση, 0 opex, 1 έτος, χωρίς ανατίμηση/κόστη πώλησης
  // ίδια = 100.000, NOI = 5.000, πώληση = 100.000 → ροές [-100000, 105000] → IRR = 5%
  const d = dealAnalysis({ price: 100000, ltvPct: 0, loanRatePct: 0, loanYears: 25, grossYieldPct: 5, opexPctOfRent: 0, buyCostsPct: 0, holdYears: 1, appreciationPct: 0, sellCostsPct: 0 })
  ok('deal ίδια = 100.000', d.equity === 100000, d.equity, 100000)
  ok('deal NOI = 5.000', d.noi === 5000, d.noi, 5000)
  ok('deal IRR = 5,0 (all-cash 1ετία)', near(d.irrPct, 5.0, 0.05), d.irrPct, 5.0)
  ok('deal equityMultiple = 1,05', d.equityMultiple === 1.05, d.equityMultiple, 1.05)
  // DSCR με δάνειο: NOI 8.000 / δόση ≈ 7.966,9 ≈ 1,0
  const dl = dealAnalysis({ price: 200000, ltvPct: 70, loanRatePct: 3, loanYears: 25, grossYieldPct: 5, opexPctOfRent: 20, holdYears: 10 })
  ok('deal DSCR ≈ 1,00', near(dl.dscr, 1.0, 0.02), dl.dscr, 1.0)
  ok('deal cashflows μήκος = hold+1', dl.cashflows.length === 11)
}

// ── portfolioReturns (συγκεντρωτική, σταθμισμένη) ───────────────────────────
{
  const p = portfolioReturns([
    { value: 100000, annualRevenue: 6000, annualExpenses: 1000 },
    { value: 200000, annualRevenue: 10000, annualExpenses: 2000 },
  ])
  ok('portfolio totalValue = 300.000', p.totalValue === 300000, p.totalValue, 300000)
  ok('portfolio totalNet = 13.000', p.totalNet === 13000, p.totalNet, 13000)
  // σταθμισμένη μεικτή = 16000/300000 = 5,33 → 5,3· καθαρή = 13000/300000 = 4,33 → 4,3
  ok('portfolio grossYield = 5,3', p.grossYield === 5.3, p.grossYield, 5.3)
  ok('portfolio netYield = 4,3', p.netYield === 4.3, p.netYield, 4.3)
  ok('portfolio valuedCount = 2', p.valuedCount === 2)
  // Ακίνητο χωρίς αξία δεν μπαίνει στις αποδόσεις, μπαίνει όμως στα σύνολα εσόδων
  const p2 = portfolioReturns([{ value: 0, annualRevenue: 5000, annualExpenses: 500 }, { value: 100000, annualRevenue: 5000, annualExpenses: 500 }])
  ok('portfolio αγνοεί αξία 0 στη %', p2.valuedCount === 1 && p2.netYield === 4.5, p2.netYield, 4.5)
  ok('portfolio συνολικά έσοδα μετρούν όλα', p2.totalRevenue === 10000)
  ok('portfolio κενό → μηδενικά', portfolioReturns([]).totalValue === 0 && portfolioReturns([]).grossYield === 0)
}

// ── communityStats (ανώνυμα δεδομένα κοινότητας — σωστά & δίκαια) ────────────
{
  // percentile (γραμμική παρεμβολή)
  ok('percentile p50 [4,5,6,7,8] = 6', percentile([4, 5, 6, 7, 8], 0.5) === 6)
  ok('percentile p25 = 5', percentile([4, 5, 6, 7, 8], 0.25) === 5)
  ok('percentile p75 = 7', percentile([4, 5, 6, 7, 8], 0.75) === 7)
  ok('percentile παρεμβολή [10,20] p0.5 = 15', percentile([10, 20], 0.5) === 15)
  // 5 ακίνητα «A»: αξία 120.000, ενοίκια 400..800, 50 τ.μ. → αποδόσεις 4..8%
  const rentsA = [400, 500, 600, 700, 800]
  const samples = rentsA.map(r => ({ region: 'A', value: 120000, monthlyRent: r, sqm: 50 }))
  // 4 ακίνητα «B» → ΚΑΤΩ από το ελάχιστο δείγμα, δεν εμφανίζονται (k-anonymity)
  for (let i = 0; i < 4; i++) samples.push({ region: 'B', value: 100000, monthlyRent: 500, sqm: 60 })
  // 1 ακραίο (απόδοση 40% — λάθος καταχώρηση) στο «A» → κόβεται
  samples.push({ region: 'A', value: 120000, monthlyRent: 4000, sqm: 50 })
  const st = communityStats(samples)
  ok('community: μόνο η «A» (k-anonymity)', st.length === 1 && st[0].region === 'A', st.length, 1)
  ok('community: count = 5 (ακραίο κομμένο)', st[0].count === 5, st[0].count, 5)
  ok('community: median απόδοση = 6,0', st[0].medianGrossYield === 6.0, st[0].medianGrossYield, 6.0)
  ok('community: p25 = 5,0', st[0].p25Yield === 5.0)
  ok('community: p75 = 7,0', st[0].p75Yield === 7.0)
  ok('community: median ενοίκιο/τ.μ. = 12', st[0].medianRentPerSqm === 12, st[0].medianRentPerSqm, 12)
  ok('community: median τιμή/τ.μ. = 2.400', st[0].medianPricePerSqm === 2400, st[0].medianPricePerSqm, 2400)
  ok('community: min sample = 5', COMMUNITY_MIN_SAMPLE === 5)
  ok('community: κενό → []', communityStats([]).length === 0)
  // Δίκαιο: αγνοεί άκυρα (αξία 0, ενοίκιο 0)
  ok('community: αγνοεί άκυρα', communityStats([{ region: 'X', value: 0, monthlyRent: 500 }, { region: 'X', value: 100000, monthlyRent: 0 }]).length === 0)
}

console.log(`returns.golden — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) process.exit(1)
console.log('όλα τα golden πέρασαν — κάθε νούμερο επαληθεύτηκε ανεξάρτητα στο χέρι')
