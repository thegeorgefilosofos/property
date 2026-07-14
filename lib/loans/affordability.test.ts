// Τεστ για lib/loans/affordability.ts — τρέξε με: npx tsx lib/loans/affordability.test.ts
import {
  maxMonthlyPayment, principalForPayment, affordability, rentVsBuy, euriborInsight, DSTI_LIMIT,
} from './affordability'
import { annuityMonthly } from './recommend'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { cond ? passed++ : (failed++, console.error('FAIL:', name)) }
function near(name: string, a: number, b: number, tol = 1) { ok(`${name} (${a.toFixed(2)}≈${b})`, Math.abs(a - b) <= tol) }

// ── maxMonthlyPayment ──
near('50% first home', maxMonthlyPayment(2000, true), 1000, 0.001)
near('40% other', maxMonthlyPayment(2000, false), 800, 0.001)
near('existing debt reduces', maxMonthlyPayment(2000, true, 300), 700, 0.001)
ok('never negative', maxMonthlyPayment(1000, false, 900) === 0)
ok('limits exported', DSTI_LIMIT.firstHome === 0.5 && DSTI_LIMIT.other === 0.4)

// ── principalForPayment is inverse of annuityMonthly ──
{
  const P = 200000, rate = 3.5, yrs = 25
  const m = annuityMonthly(P, rate, yrs)
  near('inverse recovers principal', principalForPayment(m, rate, yrs), P, 2)
  ok('zero payment → 0', principalForPayment(0, 3, 20) === 0)
  near('0% straight-line', principalForPayment(1000, 0, 10), 120000, 1)
}

// ── affordability ──
{
  const a = affordability({ incomeMonthly: 2000, firstHome: true, desiredAmount: 150000, ratePct: 3.5, years: 25 })
  ok('maxMonthly 1000', Math.abs(a.maxMonthly - 1000) < 0.5)
  ok('requested < max → affordable', a.affordable === true)
  ok('maxLoan positive & >= desired here', a.maxLoan >= 150000)
  ok('dsti used computed', a.dstiUsedPct > 0 && a.dstiUsedPct < 50)

  const b = affordability({ incomeMonthly: 1200, firstHome: false, desiredAmount: 200000, ratePct: 4, years: 20 })
  ok('over-limit not affordable', b.affordable === false)
  ok('gap positive when over', b.gapMonthly > 0)
  ok('limitPct reflects non-first-home', b.limitPct === 0.4)
}

// ── rentVsBuy ──
{
  const r = rentVsBuy({ price: 200000, downPayment: 40000, ratePct: 3.5, years: 25, monthlyRent: 700, horizonYears: 15 })
  ok('arrays length horizon+1', r.buyNetCostByYear.length === 16 && r.rentCostByYear.length === 16)
  ok('year0 buy = transaction costs only (down offset by equity)', r.buyNetCostByYear[0] === Math.round(200000 * 0.04))
  ok('year0 rent = 0', r.rentCostByYear[0] === 0)
  ok('rent grows monotonically', r.rentCostByYear[15] > r.rentCostByYear[1])
  ok('advantage = rent - buy', r.advantageAtHorizon === r.rentAtHorizon - r.buyNetAtHorizon)
  // Με λογική ανατίμηση, η αγορά συνήθως βγαίνει φθηνότερη κάποια στιγμή
  ok('breakEven is null or within horizon', r.breakEvenYear === null || (r.breakEvenYear >= 1 && r.breakEvenYear <= 15))
}
{
  // Ακραία υψηλό ενοίκιο → η αγορά συμφέρει γρήγορα
  const r = rentVsBuy({ price: 200000, downPayment: 40000, ratePct: 3.5, years: 25, monthlyRent: 2500, horizonYears: 10, appreciationPct: 3 })
  ok('high rent → buy wins at horizon', r.advantageAtHorizon > 0)
  ok('high rent → early breakeven', r.breakEvenYear !== null && r.breakEvenYear <= 5)
}

// ── euriborInsight ──
ok('low euribor → insight', (euriborInsight({ euribor3m: 2.0 }) || '').includes('χαμηλ'))
ok('high euribor → insight', (euriborInsight({ euribor3m: 3.8 }) || '').includes('υψηλ'))
ok('mid euribor no prev → null', euriborInsight({ euribor3m: 2.9 }) === null)
{
  const drop = euriborInsight({ euribor3m: 2.4, euriborPrev: 2.6, loanAmount: 150000, ratePct: 4, years: 25 })
  ok('euribor drop → savings insight', (drop || '').includes('εξοικονόμηση'))
  const rise = euriborInsight({ euribor3m: 2.9, euriborPrev: 2.6, loanAmount: 150000, ratePct: 4, years: 25 })
  ok('euribor rise → warning insight', (rise || '').includes('ανέβηκε'))
}

console.log(`\naffordability.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
