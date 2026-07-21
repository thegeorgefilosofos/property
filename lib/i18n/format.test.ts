// Τεστ για locale/currency μορφοποίηση (i18n/format.ts).
import { convertFromEur, formatMoney, formatNumber, t, bcp47, DEFAULT_INTL } from './format'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// Μετατροπή EUR → νόμισμα εμφάνισης με ισοτιμία.
ok('convert EUR→USD @1.1', convertFromEur(100, { locale: 'en', currency: 'USD', fxRate: 1.1 }) === 110)
ok('convert default (EUR, no rate) = identity', convertFromEur(250, DEFAULT_INTL) === 250)
ok('invalid rate → identity', convertFromEur(250, { locale: 'el', currency: 'EUR', fxRate: 0 }) === 250)

// formatMoney: περιέχει το σωστό μετατραμμένο ακέραιο μέρος.
const usd = formatMoney(1000, { locale: 'en', currency: 'USD', fxRate: 1.1 }); // 1100
ok('USD money has 1,100', /1[.,]?100/.test(usd) && /\$|USD/.test(usd))
const eur = formatMoney(1234.56, DEFAULT_INTL);
ok('EUR el has 1.234,56 and €', eur.includes('1.234,56') && /€|EUR/.test(eur))
const gbp = formatMoney(200, { locale: 'en', currency: 'GBP', fxRate: 0.85 }); // 170
ok('GBP money has 170', /170/.test(gbp) && /£|GBP/.test(gbp))

// Άγνωστο νόμισμα → fallback χωρίς exception.
const weird = formatMoney(100, { locale: 'en', currency: 'ZZZ', fxRate: 1 });
ok('unknown currency fallback contains code', weird.includes('ZZZ') && /100/.test(weird))

// formatNumber locale-aware.
ok('el number grouping', formatNumber(1234567, { locale: 'el', currency: 'EUR' }) === '1.234.567')
ok('en number grouping', formatNumber(1234567, { locale: 'en', currency: 'EUR' }) === '1,234,567')

// bcp47 mapping.
ok('bcp el', bcp47('el') === 'el-GR')
ok('bcp en', bcp47('en') === 'en-US')

// t() dictionary.
ok('t el', t('income', 'el') === 'Έσοδα')
ok('t en', t('income', 'en') === 'Income')
ok('t missing key → key', t('nonexistent_key', 'en') === 'nonexistent_key')

console.log(`format.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
