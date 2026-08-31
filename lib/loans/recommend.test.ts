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
ok('single 25k', spitiMouIncomeLimit('single', 0) === 25000)
ok('married +2 kids 45k', spitiMouIncomeLimit('married', 2) === 45000)
ok('single_parent 3 kids 49k', spitiMouIncomeLimit('single_parent', 3) === 49000)

// ── eligibility ──
// Η μέρα δίνεται, δεν διαβάζεται: αλλιώς τα tests θα άλλαζαν απάντηση στις 31
// Μαΐου 2026 και θα το μάθαινε ο πρώτος χρήστης, όχι το CI.
const OPEN_DAY = '2026-03-01'   // μέσα στον κύκλο αιτήσεων
const AFTER_APPLY = '2026-06-15' // αιτήσεις κλειστές, συμβάσεις ακόμη ανοιχτές
const AFTER_ALL = '2026-09-01'  // ο κύκλος τελείωσε

const baseNeeds: UserLoanNeeds = {
  amount: 150000, propertyValue: 200000, years: 25, purpose: 'first_home',
  age: 32, income: 30000, maritalStatus: 'married', children: 1,
  firstHome: true, propertySqm: 95, propertyYearBuilt: 2004,
}
const e1 = spitiMouEligibility(baseNeeds, OPEN_DAY)
ok('eligible base case', e1.eligible === true)
ok('share 0.5 for all', e1.interestFreeShare === 0.5)
ok('no rate subsidy <3 kids', e1.rateSubsidyShare === 0)
const e2 = spitiMouEligibility({ ...baseNeeds, children: 3 }, OPEN_DAY)
ok('interest-free stays 0.5 for 3+ kids', e2.interestFreeShare === 0.5)
ok('rate subsidy 0.5 for 3+ kids', e2.rateSubsidyShare === 0.5)
const e3 = spitiMouEligibility({ ...baseNeeds, propertyValue: 300000 }, OPEN_DAY)
ok('ineligible when value > 250k', e3.eligible === false)
const e4 = spitiMouEligibility({ ...baseNeeds, age: 60 }, OPEN_DAY)
ok('ineligible when age out of band', e4.eligible === false)
const e5 = spitiMouEligibility({ ...baseNeeds, propertyYearBuilt: 2020 }, OPEN_DAY)
ok('ineligible when built after 2007', e5.eligible === false)
const e6 = spitiMouEligibility({ ...baseNeeds, income: 999999 }, OPEN_DAY)
ok('ineligible when income over limit', e6.eligible === false)

// ── Η ΠΡΟΘΕΣΜΙΑ ΕΙΝΑΙ ΚΡΙΤΗΡΙΟ ΟΠΩΣ ΚΑΘΕ ΑΛΛΟ ──────────────────────────────
// Δέκα εβδομάδες μετά το κλείσιμο των αιτήσεων, η κατάταξη εξακολουθούσε να
// μοιράζει στα δύο το έντοκο κεφάλαιο και να τυπώνει «50% άτοκο» σε δάνειο που
// κανείς δεν μπορεί πια να πάρει: 690,48 € δόση αντί για 853,18 €.
const eLate = spitiMouEligibility(baseNeeds, AFTER_APPLY)
ok('μετά τη λήξη των αιτήσεων, δεν είναι επιλέξιμο', eLate.eligible === false)
ok('...και το λέει με λόγια', eLate.reasons.some(r => /αιτήσεις/i.test(r)))
const eClosed = spitiMouEligibility(baseNeeds, AFTER_ALL)
ok('μετά και τη σύναψη συμβάσεων, ο κύκλος έχει κλείσει', eClosed.eligible === false)
ok('...με διαφορετική εξήγηση', eClosed.reasons.some(r => /κύκλος/i.test(r)))


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
const ranked = rankLoans(baseNeeds, banks, 2.324, OPEN_DAY)
// Και η κατάταξη δεν πουλάει το ανύπαρκτο όφελος μετά τη λήξη.
const lateRanked = rankLoans(baseNeeds, banks, 2.324, AFTER_APPLY)
ok('καμία τράπεζα δεν εμφανίζει «Σπίτι μου» μετά τη λήξη',
  lateRanked.every(r => !r.spitiMouApplied))
ok('ranked returns all banks', ranked.length === 3)
ok('eligible banks come before ineligible', ranked[ranked.length - 1].bankId === 'toosmall')
ok('toosmall is ineligible (amount>max)', ranked.find(r => r.bankId === 'toosmall')!.eligible === false)
ok('cheapest eligible ranked above pricey', ranked.findIndex(r => r.bankId === 'cheap') < ranked.findIndex(r => r.bankId === 'pricey'))
ok('spiti applied for eligible first_home', ranked.find(r => r.bankId === 'cheap')!.spitiMouApplied === true)
ok('totalCost = amount + interest', ranked[0].totalCost === baseNeeds.amount + ranked[0].totalInterest)

// green discount lowers the effective/nominal rate
const greenRanked = rankLoans({ ...baseNeeds, purpose: 'purchase', energyClass: 'A+' }, banks, 2.324, OPEN_DAY)
const noGreen = rankLoans({ ...baseNeeds, purpose: 'purchase' }, banks, 2.324, OPEN_DAY)
ok('green class lowers Cheap nominal rate', greenRanked.find(r => r.bankId === 'cheap')!.nominalRatePct < noGreen.find(r => r.bankId === 'cheap')!.nominalRatePct)

// ══ ΜΙΑ ΔΟΣΗ ΓΙΑ ΤΟ ΙΔΙΟ ΔΑΝΕΙΟ, ΟΠΟΥ ΚΙ ΑΝ ΥΠΟΛΟΓΙΣΤΕΙ ═══════════════════
//
// Η κατάταξη στρογγύλευε τη δόση σε ακέραια ευρώ ενώ ο υπολογιστής της ίδιας
// οθόνης έδειχνε δεκαδικά. Μετρημένο σε 120.000 € / 25 έτη / 2,40%: η ανάγνωση
// του σεναρίου έγραφε «δόση 532,32 €» και η κάρτα σύστασης, δύο κάρτες πιο
// κάτω, «532,00 € τον μήνα». Ιδια τράπεζα, ίδιο επιτόκιο, ίδιο δάνειο.
{
  const amount = 120_000, years = 25, rate = 3
  const flat = [{ id: 'flat', name: 'Flat', fixed_min: rate, fixed_3yr: String(rate), variable_min: rate,
    max_ltv: 90, max_years: 40, max_amount: 500_000, min_amount: 10_000, spiti_mou: false, green_discount: 0 }]
  const one = rankLoans({ ...baseNeeds, amount, years, purpose: 'purchase' }, flat as never, 2.324, OPEN_DAY)[0]
  const direct = annuityMonthly(amount, rate, years)
  ok('η κατάταξη δίνει την ίδια δόση με τον τύπο', Math.abs(one.monthlyPayment - direct) < 0.0001)
  ok('και η δόση κρατά τα λεπτά της', Math.abs(one.monthlyPayment - Math.round(one.monthlyPayment)) > 0.001)
  ok('το συνολικό κόστος βγαίνει από την ίδια δόση',
    Math.abs(one.totalCost - (amount + (direct * years * 12 - amount))) < 0.01)
}

console.log(`\nrecommend.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
