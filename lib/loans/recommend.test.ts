// Τεστ για lib/loans/recommend.ts — τρέξε με: npx tsx lib/loans/recommend.test.ts
import {
  annuityMonthly, totalInterest, interestForYear, spitiMouIncomeLimit, spitiMouEligibility,
  spitiMouPayment, rankLoans, type UserLoanNeeds, type BankInput,
} from './recommend'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { cond ? passed++ : (failed++, console.error('FAIL:', name)) }
function near(name: string, a: number, b: number, tol = 1) { ok(`${name} (${a.toFixed(2)}≈${b})`, Math.abs(a - b) <= tol) }

// ── annuityMonthly ──
near('100k @3% 30y', annuityMonthly(100000, 3, 30), 421.60, 0.5)
near('0% is straight-line', annuityMonthly(120000, 0, 10), 1000, 0.001)
ok('zero principal → 0', annuityMonthly(0, 3, 20) === 0)
ok('zero years → 0', annuityMonthly(1000, 3, 0) === 0)
ok('totalInterest positive', totalInterest(100000, 3, 30) > 50000)
ok('totalInterest 0% → 0', totalInterest(100000, 0, 30) === 0)

// ── interestForYear (τοκοχρεολυτική απόσβεση ανά έτος) ──
{
  const P = 100000, rate = 3, yrs = 30
  const y1 = interestForYear(P, rate, yrs, 1)
  const y30 = interestForYear(P, rate, yrs, 30)
  ok('interestForYear declines over time', y1 > y30)
  ok('interestForYear y1 ~ balance*rate first year', y1 > 2900 && y1 < 3000) // ≈100k*3% φθίνον
  ok('sum of yearly interest ≈ totalInterest', Math.abs(Array.from({length:yrs},(_,i)=>interestForYear(P,rate,yrs,i+1)).reduce((s,x)=>s+x,0) - totalInterest(P,rate,yrs)) < 5)
  ok('interestForYear 0% → 0', interestForYear(P, 0, yrs, 1) === 0)
  ok('interestForYear out of range → 0', interestForYear(P, rate, yrs, 31) === 0 && interestForYear(P, rate, yrs, 0) === 0)
}

// ── income limits ──
ok('single 20k', spitiMouIncomeLimit('single', 0) === 20000)
ok('married +2 kids 45k', spitiMouIncomeLimit('married', 2) === 45000)
ok('single_parent 3 kids 49k', spitiMouIncomeLimit('single_parent', 3) === 49000)

// ── eligibility ──
const baseNeeds: UserLoanNeeds = {
  amount: 150000, propertyValue: 200000, years: 25, purpose: 'first_home',
  age: 32, income: 30000, maritalStatus: 'married', children: 1,
  firstHome: true, propertySqm: 95, propertyYearBuilt: 2004,
}
const e1 = spitiMouEligibility(baseNeeds)
ok('eligible base case', e1.eligible === true)
ok('share 0.5 for <3 kids', e1.interestFreeShare === 0.5)
const e2 = spitiMouEligibility({ ...baseNeeds, children: 3 })
ok('share 0.75 for 3+ kids', e2.interestFreeShare === 0.75)
const e3 = spitiMouEligibility({ ...baseNeeds, propertyValue: 300000 })
ok('ineligible when value > 250k', e3.eligible === false)
const e4 = spitiMouEligibility({ ...baseNeeds, age: 60 })
ok('ineligible when age out of band', e4.eligible === false)
const e5 = spitiMouEligibility({ ...baseNeeds, propertyYearBuilt: 2020 })
ok('ineligible when built after 2007', e5.eligible === false)
const e6 = spitiMouEligibility({ ...baseNeeds, income: 999999 })
ok('ineligible when income over limit', e6.eligible === false)

// ── spitiMouPayment ──
const sp = spitiMouPayment(100000, 3.5, 20, 0.5)
ok('blended rate = half of bank rate', Math.abs(sp.blendedRatePct - 1.75) < 0.001)
ok('spiti monthly < full-rate monthly', sp.monthly < annuityMonthly(100000, 3.5, 20))
ok('spiti interest only on bank part', Math.abs(sp.interest - totalInterest(50000, 3.5, 20)) < 1)

// ── rankLoans ──
const banks: BankInput[] = [
  { id: 'cheap', name: 'Cheap', fixed_min: 2.6, variable_spread_min: 1.2, max_ltv: 90, max_years: 30, max_amount: 500000, min_amount: 10000, green_discount: 0.2, spiti_mou: true },
  { id: 'pricey', name: 'Pricey', fixed_min: 3.9, variable_spread_min: 2.0, max_ltv: 90, max_years: 30, max_amount: 500000, min_amount: 10000, green_discount: 0, spiti_mou: true },
  { id: 'toosmall', name: 'TooSmall', fixed_min: 2.4, variable_spread_min: 1.0, max_ltv: 90, max_years: 30, max_amount: 100000, min_amount: 10000, green_discount: 0, spiti_mou: false },
]
const ranked = rankLoans(baseNeeds, banks, 2.324)
ok('ranked returns all banks', ranked.length === 3)
ok('eligible banks come before ineligible', ranked[ranked.length - 1].bankId === 'toosmall')
ok('toosmall is ineligible (amount>max)', ranked.find(r => r.bankId === 'toosmall')!.eligible === false)
ok('cheapest eligible ranked above pricey', ranked.findIndex(r => r.bankId === 'cheap') < ranked.findIndex(r => r.bankId === 'pricey'))
ok('spiti applied for eligible first_home', ranked.find(r => r.bankId === 'cheap')!.spitiMouApplied === true)
ok('totalCost = amount + interest', ranked[0].totalCost === baseNeeds.amount + ranked[0].totalInterest)

// green discount lowers the effective/nominal rate
const greenRanked = rankLoans({ ...baseNeeds, purpose: 'purchase', energyClass: 'A+' }, banks, 2.324)
const noGreen = rankLoans({ ...baseNeeds, purpose: 'purchase' }, banks, 2.324)
ok('green class lowers Cheap nominal rate', greenRanked.find(r => r.bankId === 'cheap')!.nominalRatePct < noGreen.find(r => r.bankId === 'cheap')!.nominalRatePct)

console.log(`\nrecommend.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
