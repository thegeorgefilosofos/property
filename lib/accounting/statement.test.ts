// Τεστ για την κανονική «Κατάσταση Αποτελεσμάτων» (lib/accounting/statement.ts).
import {
  incomeStatement, taxProvision, consolidateIndividual, PRESUMPTIVE_DEDUCTION_RATE,
} from './statement'
import { rentalIncomeTax } from '@/lib/billing/greekTax'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps

// ── Μακροχρόνια φυσικού προσώπου: 5% τεκμαρτή, φόρος σε κλίμακα ──────────────
{
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: 10000 })
  const taxable = 10000 * (1 - PRESUMPTIVE_DEDUCTION_RATE) // 9500
  ok('longterm presumptive 5%', near(st.presumptiveDeduction, 500))
  ok('longterm taxable = 95%', near(st.taxableIncome, taxable))
  ok('longterm tax = brackets(9500)', near(st.incomeTax, rentalIncomeTax(taxable)))
  ok('longterm tax = 1425 (15%)', near(st.incomeTax, 1425))
  ok('longterm netProfit = gross - tax (no presumptive fiction)', near(st.netProfit, 10000 - 1425))
  ok('longterm effRate = tax/gross', near(st.effectiveRate, st.incomeTax / 10000))
  ok('longterm has taxable line', st.lines.some(l => l.key === 'taxable'))
}

// ── Μακροχρόνια πάνω από κλιμάκιο: προοδευτικό ──────────────────────────────
{
  const gross = 30000
  const taxable = gross * 0.95 // 28500
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: gross })
  // 12000*.15 + 12000*.25 + 4500*.35 = 1800+3000+1575 = 6375
  ok('longterm progressive 28500 → 6375', near(st.incomeTax, 6375))
  ok('longterm marginal reflected (eff between 15% and 35%)', st.effectiveRate > 0.15 && st.effectiveRate < 0.35)
}

// ── ΕΝΦΙΑ & δάνειο ΔΕΝ μειώνουν τη φορολογική βάση ιδιώτη, μειώνουν το ταμείο ──
{
  const a = incomeStatement({ regime: 'individual_longterm', grossIncome: 12000 })
  const b = incomeStatement({ regime: 'individual_longterm', grossIncome: 12000, enfia: 400, loanPrincipal: 2000, loanInterest: 1500, otherCashExpenses: 300 })
  ok('enfia/loan do not change tax', near(a.incomeTax, b.incomeTax))
  ok('enfia/loan do not change taxable', near(a.taxableIncome, b.taxableIncome))
  ok('propertyTaxes = enfia', near(b.propertyTaxes, 400))
  ok('netCash reduced by enfia+principal+other (interest ignored for individual)', near(b.netCash, 12000 - b.incomeTax - 400 - 2000 - 300))
  ok('individual interest not double-counted', b.netCash === a.netCash - 400 - 2000 - 300)
}

// ── Βραχυχρόνια: γκρος βάση (χωρίς τεκμαρτή) + ΤΑΚΚ + παρεπιδημούντων ────────
{
  const st = incomeStatement({ regime: 'individual_shortterm', grossIncome: 8000, climateLevy: 240, municipalTax: 0, otherCashExpenses: 900 })
  ok('shortterm no presumptive (taxed on gross, matches shortTermYearSummary)', st.presumptiveDeduction === 0)
  ok('shortterm taxable = gross', near(st.taxableIncome, 8000))
  ok('shortterm tax = brackets(8000)', near(st.incomeTax, rentalIncomeTax(8000)))
  ok('shortterm property taxes = levy', near(st.propertyTaxes, 240))
  ok('shortterm netCash includes levy+other', near(st.netCash, 8000 - st.incomeTax - 240 - 900))
}

// ── Επαγγελματίας: αναλυτικά έξοδα + αποσβέσεις + τόκοι εκπίπτουν ────────────
{
  const base = { regime: 'business' as const, grossIncome: 40000, itemizedExpenses: 8000, depreciation: 3000, loanInterest: 2000 }
  const taxable = 40000 - 8000 - 3000 - 2000 // 27000
  // Νομικό πρόσωπο → σταθερό 22%
  const co = incomeStatement({ ...base, businessForm: 'company' })
  ok('business taxable = gross - all deductions', near(co.taxableIncome, taxable))
  ok('company tax = 22% flat', near(co.incomeTax, taxable * 0.22))
  ok('business no presumptive', co.presumptiveDeduction === 0)
  ok('company netProfit = taxable - tax', near(co.netProfit, taxable - taxable * 0.22))
  ok('business lines include depreciation', co.lines.some(l => l.key === 'depreciation'))
  ok('business lines include interest', co.lines.some(l => l.key === 'interest'))
  // Ατομική επιχείρηση (default) → προοδευτική κλίμακα 9–44%
  const sole = incomeStatement({ ...base })
  const soleTax = 10000*0.09 + 10000*0.22 + 7000*0.28 // 27000 → 900+2200+1960 = 5060
  ok('sole prop tax = progressive scale', near(sole.incomeTax, soleTax))
  ok('sole differs from company (not the same anymore)', Math.abs(sole.incomeTax - co.incomeTax) > 1)
  ok('sole low income cheaper than company', incomeStatement({ regime:'business', grossIncome:8000 }).incomeTax < incomeStatement({ regime:'business', grossIncome:8000, businessForm:'company' }).incomeTax)
}

// ── Καμία αρνητική φορολογική βάση ──────────────────────────────────────────
{
  const st = incomeStatement({ regime: 'business', grossIncome: 5000, itemizedExpenses: 9000 })
  ok('taxable never negative', st.taxableIncome === 0)
  ok('tax never negative', st.incomeTax === 0)
}

// ── Πρόβλεψη φόρου ──────────────────────────────────────────────────────────
{
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: 24000, enfia: 600 })
  const p = taxProvision(st, 1)
  ok('provision annual = tax + property taxes', near(p.annualTaxTotal, st.incomeTax + 600))
  ok('provision monthly = annual/12', near(p.monthly, p.annualTaxTotal / 12))
  const p7 = taxProvision(st, 7)
  ok('provision per remaining month higher mid-year', p7.perRemainingMonth > p.perRemainingMonth)
  ok('provision remaining months from July = 6', near(p7.perRemainingMonth, p7.annualTaxTotal / 6))
}

// ── Ενοποίηση: φόρος στο ΑΘΡΟΙΣΜΑ, όχι ανά ακίνητο ──────────────────────────
{
  // Δύο ακίνητα από 8.000 → μαζί 16.000 → βάση 15.200 → φόρος προοδευτικός.
  const items = [
    { id: 'A', input: { regime: 'individual_longterm' as const, grossIncome: 8000 } },
    { id: 'B', input: { regime: 'individual_longterm' as const, grossIncome: 8000 } },
  ]
  const port = consolidateIndividual(items)
  const totalTaxable = 16000 * 0.95 // 15200
  const combinedTax = rentalIncomeTax(totalTaxable) // 12000*.15 + 3200*.25 = 1800+800 = 2600
  ok('consolidated taxable = sum', near(port.taxableIncome, totalTaxable))
  ok('consolidated tax on total (2600)', near(port.incomeTax, combinedTax))
  // Αν φορολογούσαμε ανά ακίνητο (7600 έκαστο) → 2×1140 = 2280 < 2600. Η ενοποίηση είναι σωστότερη.
  const perPropertyIfSeparate = 2 * rentalIncomeTax(7600)
  ok('consolidated ≥ per-property (progressive)', port.incomeTax >= perPropertyIfSeparate - 0.01)
  ok('tax shares sum to total', near(port.perProperty.reduce((s, p) => s + p.taxShare, 0), port.incomeTax))
  ok('two properties in breakdown', port.perProperty.length === 2)
}

// ── overrideIncomeTax (μερίδιο προοδευτικού φόρου χαρτοφυλακίου) ─────────────
{
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: 8000, overrideIncomeTax: 900 })
  ok('override tax used verbatim', near(st.incomeTax, 900))
  ok('override netProfit = gross - overrideTax', near(st.netProfit, 8000 - 900))
  ok('override effRate = 900/8000', near(st.effectiveRate, 900 / 8000))
  const neg = incomeStatement({ regime: 'individual_longterm', grossIncome: 8000, overrideIncomeTax: -5 })
  ok('override negative clamped to 0', neg.incomeTax === 0)
}

// ── uncollectedIncome: φορολογείται αλλά μειώνει το ταμείο ───────────────────
{
  const a = incomeStatement({ regime: 'individual_longterm', grossIncome: 12000 })
  const b = incomeStatement({ regime: 'individual_longterm', grossIncome: 12000, uncollectedIncome: 3000 })
  ok('uncollected does not change tax', near(a.incomeTax, b.incomeTax))
  ok('uncollected reduces netCash by exactly its amount', near(b.netCash, a.netCash - 3000))
  ok('uncollected shows as a line', b.lines.some(l => l.key === 'uncollected'))
}

// ── Στρογγυλοποίηση/ασφάλεια εισόδου ────────────────────────────────────────
{
  const st = incomeStatement({ regime: 'individual_longterm', grossIncome: NaN as any })
  ok('NaN gross → 0', st.grossIncome === 0 && st.incomeTax === 0)
  const st2 = incomeStatement({ regime: 'individual_longterm', grossIncome: -500 })
  ok('negative gross → 0', st2.grossIncome === 0)
}

console.log(`statement.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
