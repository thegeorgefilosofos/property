// Τεστ για lib/inventory/depreciation.ts — τρέξε με: npx tsx lib/inventory/depreciation.test.ts
import {
  usefulLifeYears, depreciate, replacementSuggestion, portfolioSummary,
  yearsSince, daysUntil, DEFAULT_USEFUL_LIFE, type DepreciableItem,
} from './depreciation'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { cond ? passed++ : (failed++, console.error('FAIL:', name)) }
function near(name: string, a: number, b: number, tol = 1) { ok(`${name} (${a}≈${b})`, Math.abs(a - b) <= tol) }

// Σταθερό «τώρα» για ντετερμινιστικά τεστ: 2026-07-08
const NOW = new Date('2026-07-08T00:00:00Z').getTime()
const yearsAgo = (y: number) => new Date(NOW - y * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// ── useful life map ──
ok('electronics 5y', usefulLifeYears('Ηλεκτρονικά') === 5)
ok('appliances 9y', usefulLifeYears('Ηλεκτρικές Συσκευές') === 9)
ok('furniture 12y', usefulLifeYears('Έπιπλα') === 12)
ok('hvac 14y', usefulLifeYears('Θέρμανση & Ψύξη') === 14)
ok('unknown → default', usefulLifeYears('ΆγνωστηΚατ') === DEFAULT_USEFUL_LIFE)
ok('undefined → default', usefulLifeYears(undefined) === DEFAULT_USEFUL_LIFE)

// ── helpers ──
ok('yearsSince null on empty', yearsSince('', NOW) === null)
ok('yearsSince ~2y', Math.round(yearsSince(yearsAgo(2), NOW)!) === 2)
ok('daysUntil future positive', daysUntil(new Date(NOW + 10 * 864e5).toISOString(), NOW)! > 0)
ok('daysUntil past negative', daysUntil(new Date(NOW - 10 * 864e5).toISOString(), NOW)! < 0)

// ── depreciate: no date → graceful, no depreciation ──
const noDate = depreciate({ category: 'Ηλεκτρονικά', purchase_value: 1000 }, NOW)
ok('no date hasData=false', noDate.hasData === false)
ok('no date bookValue = purchase', noDate.bookValue === 1000)
ok('no date depreciatedPct 0', noDate.depreciatedPct === 0)

// ── depreciate: half-life electronics (2.5y of 5y) → ~50% ──
const half = depreciate({ category: 'Ηλεκτρονικά', purchase_value: 1000, purchase_date: yearsAgo(2.5) }, NOW)
ok('half hasData', half.hasData === true)
near('half book ~500', half.bookValue, 500, 5)
near('half pct ~50', half.depreciatedPct, 50, 1)
near('half years left ~3', half.yearsRemaining, 3, 1)

// ── fully depreciated (10y electronics, life 5y) → clamped ──
const old = depreciate({ category: 'Ηλεκτρονικά', purchase_value: 800, purchase_date: yearsAgo(10) }, NOW)
ok('old bookValue 0', old.bookValue === 0)
ok('old pct clamped 100', old.depreciatedPct === 100)
ok('old yearsRemaining 0', old.yearsRemaining === 0)

// ── replacement suggestion ──
const rNew = replacementSuggestion({ category: 'Έπιπλα', purchase_value: 500, purchase_date: yearsAgo(1), condition: 'Καλή' }, NOW)
ok('new item not suggested', rNew.suggested === false && rNew.severity === 'none')

const rDep = replacementSuggestion({ category: 'Ηλεκτρονικά', purchase_value: 500, purchase_date: yearsAgo(10), condition: 'Καλή' }, NOW)
ok('fully depreciated → due', rDep.suggested === true && rDep.severity === 'due')
ok('fully depreciated reason', rDep.reasons.some(r => r.includes('απόσβεση')))

const rBad = replacementSuggestion({ category: 'Έπιπλα', purchase_value: 500, purchase_date: yearsAgo(1), condition: 'Εκτός Λειτουργίας' }, NOW)
ok('broken condition → due even if new', rBad.suggested === true)

const rSoft = replacementSuggestion({ category: 'Ηλεκτρονικά', purchase_value: 500, purchase_date: yearsAgo(4), condition: 'Καλή' }, NOW)
ok('80% depreciated → soft watch', rSoft.suggested === false && rSoft.severity === 'soft')

const rWarranty = replacementSuggestion({ category: 'Ηλεκτρικές Συσκευές', purchase_value: 500, purchase_date: yearsAgo(7), warranty_expiry: yearsAgo(3), condition: 'Καλή' }, NOW)
ok('long-expired warranty + aged → due', rWarranty.suggested === true)

// ── portfolio summary ──
const items: (DepreciableItem & { replacement_cost?: number })[] = [
  { category: 'Ηλεκτρονικά', purchase_value: 1000, purchase_date: yearsAgo(10), condition: 'Καλή', replacement_cost: 900 }, // due
  { category: 'Έπιπλα', purchase_value: 2000, purchase_date: yearsAgo(6), condition: 'Καλή' },  // 50%
  { category: 'Ηλεκτρικές Συσκευές', purchase_value: 600, purchase_date: yearsAgo(1), condition: 'Άριστη' }, // fresh
]
const sum = portfolioSummary(items, NOW)
ok('count 3', sum.count === 3)
ok('totalOriginal 3600', sum.totalOriginal === 3600)
ok('needAttention 1', sum.needAttentionCount === 1)
ok('replacementBudget uses replacement_cost', sum.replacementBudget === 900)
ok('book < original', sum.totalBookValue < sum.totalOriginal)
ok('depreciation = original - book', sum.totalDepreciation === sum.totalOriginal - sum.totalBookValue)
ok('avg pct in range', sum.avgDepreciatedPct > 0 && sum.avgDepreciatedPct < 100)

console.log(`\ndepreciation.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
