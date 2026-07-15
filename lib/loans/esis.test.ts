// Τεστ για lib/loans/esis.ts — τρέξε με: npx tsx lib/loans/esis.test.ts
import { analyzeEsis, esisVerdictLabel, type EsisInput } from './esis'
import { annuityMonthly } from './recommend'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { cond ? passed++ : (failed++, console.error('FAIL:', name)) }

const base: EsisInput = {
  amount: 200000, years: 25, nominalRatePct: 3.4, aprcPct: 3.6,
  fees: [{ label: 'Φάκελος', amount: 300 }, { label: 'Εκτίμηση', amount: 250 }],
  insuranceMonthly: 20, rateType: 'fixed', bank: 'Δείγμα',
}

// ── Βασικοί υπολογισμοί ──
{
  const a = analyzeEsis(base)
  ok('monthly ~ annuity', Math.abs(a.monthly - Math.round(annuityMonthly(200000, 3.4, 25))) <= 1)
  ok('totalFees summed', a.totalFees === 550)
  ok('totalInsurance = 20*12*25', a.totalInsurance === 20 * 12 * 25)
  ok('aprc uses provided', a.aprc === 3.6)
  ok('aprcGap = aprc - nominal', a.aprcGapPct === 0.2)
  ok('totalCost = interest+fees+insurance', a.totalCost === a.totalInterest + a.totalFees + a.totalInsurance)
  ok('score bounded', a.score >= 0 && a.score <= 100)
}

// ── Εκτίμηση ΣΕΠΠΕ όταν λείπει ──
{
  const a = analyzeEsis({ ...base, aprcPct: undefined })
  ok('aprc estimated > nominal', a.aprc > a.nominal)
}

// ── Μεγάλη απόκλιση ΣΕΠΠΕ → κακή επισήμανση ──
{
  const a = analyzeEsis({ ...base, aprcPct: 4.3, nominalRatePct: 3.4 })
  ok('large gap → bad flag', a.flags.some(f => f.kind === 'bad' && f.label.includes('απόκλιση')))
  ok('gap 0.9', a.aprcGapPct === 0.9)
}

// ── Σύγκριση με αγορά ──
{
  const good = analyzeEsis(base, { benchmarkAprc: 3.6 })
  ok('at market → info competitive', good.flags.some(f => f.label.includes('Ανταγωνιστικό')))
  ok('vsMarket computed', good.vsMarketPct === 0)

  const bad = analyzeEsis({ ...base, aprcPct: 4.5 }, { benchmarkAprc: 3.6 })
  ok('well above market → bad', bad.flags.some(f => f.label.includes('Ακριβότερο')))
  ok('expensive verdict', bad.verdict === 'expensive')
}

// ── Υψηλά έξοδα ──
{
  const a = analyzeEsis({ ...base, fees: [{ label: 'Έξοδα', amount: 3000 }] })
  ok('high fees warn', a.flags.some(f => f.label.includes('Υψηλά αρχικά')))
}

// ── Ρήτρα πρόωρης εξόφλησης + κυμαινόμενο ──
{
  const a = analyzeEsis({ ...base, prepaymentPenalty: true, rateType: 'variable' })
  ok('prepayment flag', a.flags.some(f => f.label.includes('πρόωρης')))
  ok('variable flag', a.flags.some(f => f.label.includes('Κυμαινόμενο')))
}

// ── totalPayable υπερισχύει για τόκους ──
{
  const a = analyzeEsis({ ...base, totalPayable: 300000 })
  ok('interest from totalPayable', a.totalInterest === 100000)
}

// ── verdict labels ──
ok('verdict label good', esisVerdictLabel('good').length > 0)
ok('verdict label expensive', esisVerdictLabel('expensive').length > 0)

console.log(`\nesis.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
