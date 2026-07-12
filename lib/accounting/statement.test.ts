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

// ── Gate 5%: ενοίκια με μετρητά (όχι τραπεζική πληρωμή) → χάνεται η έκπτωση ────
{
  const bank = incomeStatement({ regime: 'individual_longterm', grossIncome: 10000, rentsPaidViaBank: true })
  const cash = incomeStatement({ regime: 'individual_longterm', grossIncome: 10000, rentsPaidViaBank: false })
  ok('μετρητά → καμία τεκμαρτή έκπτωση', cash.presumptiveDeduction === 0)
  ok('μετρητά → φορολογητέο = 100% (10000)', near(cash.taxableIncome, 10000))
  ok('μετρητά → φόρος = κλίμακα(10000) (1500)', near(cash.incomeTax, 1500))
  ok('μετρητά > τραπεζικά σε φόρο', cash.incomeTax > bank.incomeTax)
  const def = incomeStatement({ regime: 'individual_longterm', grossIncome: 10000 })
  ok('default (χωρίς flag) = τραπεζικά', near(def.incomeTax, bank.incomeTax))
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
  // Ατομική επιχείρηση (default) → κλίμακα άρθρου 15 (ν.5246/2025): 9/20/26/34/39/44
  const sole = incomeStatement({ ...base })
  const soleTax = 10000*0.09 + 10000*0.20 + 7000*0.26 // 27000 → 900+2000+1820 = 4720
  ok('sole prop tax = article-15 scale 2026', near(sole.incomeTax, soleTax))
  ok('sole differs from company (not the same anymore)', Math.abs(sole.incomeTax - co.incomeTax) > 1)
  ok('sole low income cheaper than company', incomeStatement({ regime:'business', grossIncome:8000 }).incomeTax < incomeStatement({ regime:'business', grossIncome:8000, businessForm:'company' }).incomeTax)
}

// ── Νέοι επαγγελματίες: μειωμένη κλίμακα άρθρου 15 (ν.5246/2025) ─────────────
{
  // Ατομική επιχείρηση, καθαρό κέρδος 18.000.
  const base = { regime: 'business' as const, grossIncome: 18000 }
  const adult = incomeStatement({ ...base })                       // 10000*.09 + 8000*.20 = 900+1600 = 2500
  const y25   = incomeStatement({ ...base, taxpayerAge: 24 })      // 0% έως 20.000 → 0
  const y28   = incomeStatement({ ...base, taxpayerAge: 28 })      // 9% έως 20.000 → 18000*.09 = 1620
  ok('adult sole 18k = 2500', near(adult.incomeTax, 2500))
  ok('age ≤25 pays 0 up to 20k', y25.incomeTax === 0)
  ok('age 26–30 pays 9% up to 20k', near(y28.incomeTax, 1620))
  ok('youth cheaper than adult', y25.incomeTax < adult.incomeTax && y28.incomeTax < adult.incomeTax)
  // Πάνω από 20.000 η μειωμένη ζώνη σταματά — το επιπλέον φορολογείται κανονικά.
  const y25big = incomeStatement({ regime:'business', grossIncome:30000, taxpayerAge:24 }) // 0 έως 20k + 10000*.26 = 2600
  ok('age ≤25 above 20k taxed normally', near(y25big.incomeTax, 2600))
  // Η ηλικία ΔΕΝ επηρεάζει τα παθητικά ενοίκια (άρθρο 40) — μόνο την επιχ. δραστηριότητα.
  const rentYoung = incomeStatement({ regime:'individual_longterm', grossIncome:18000, taxpayerAge:24 })
  const rentAdult = incomeStatement({ regime:'individual_longterm', grossIncome:18000 })
  ok('youth relief does NOT apply to passive rent', near(rentYoung.incomeTax, rentAdult.incomeTax) && rentYoung.incomeTax > 0)
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

// ── ΕΦΚΑ ατομικής: εκπίπτει από τη βάση ΚΑΙ μειώνει το ταμείο ────────────────
{
  const a = incomeStatement({ regime: 'business', grossIncome: 30000, itemizedExpenses: 5000 })
  const b = incomeStatement({ regime: 'business', grossIncome: 30000, itemizedExpenses: 5000, ekfaContributions: 4000 })
  ok('ΕΦΚΑ reduces taxable', near(b.taxableIncome, a.taxableIncome - 4000))
  ok('ΕΦΚΑ reduces tax', b.incomeTax < a.incomeTax)
  ok('ΕΦΚΑ reduces cash', near(b.netCash, a.netCash + (a.incomeTax - b.incomeTax) - 4000))
  ok('ΕΦΚΑ shows as line', b.lines.some(l => l.key === 'ekfa'))
  // Νομικό πρόσωπο: το ΕΦΚΑ input δεν αφαιρείται (μισθοδοσία, όχι εισφορές φορέα).
  const co = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 30000, itemizedExpenses: 5000, ekfaContributions: 4000 })
  const coNo = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 30000, itemizedExpenses: 5000 })
  ok('company ignores ΕΦΚΑ input in base', near(co.taxableIncome, coNo.taxableIncome))
}

// ── Προκαταβολή φόρου: 55% ατομική, 80% νομικό, 50% μείωση πρώτης τριετίας ────
{
  const sole = incomeStatement({ regime: 'business', grossIncome: 30000 })
  ok('sole advance = 55% of tax', near(sole.advanceTax, sole.incomeTax * 0.55))
  const co = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 30000 })
  ok('company advance = 80% of tax', near(co.advanceTax, co.incomeTax * 0.80))
  const soleNew = incomeStatement({ regime: 'business', grossIncome: 30000, firstThreeYears: true })
  ok('first-3-years advance halved (27.5%)', near(soleNew.advanceTax, soleNew.incomeTax * 0.275))
  const ind = incomeStatement({ regime: 'individual_longterm', grossIncome: 30000 })
  ok('individual has no advance tax', ind.advanceTax === 0)
  const prov = taxProvision(sole, 1)
  ok('provision exposes advance tax', near(prov.advanceTax, sole.advanceTax))
  ok('firstYearTotal = annual + advance', near(prov.firstYearTotal, prov.annualTaxTotal + prov.advanceTax))
}

// ── Απόσβεση κτιρίου (4%) εκπίπτει για επιχείρηση ────────────────────────────
{
  const a = incomeStatement({ regime: 'business', grossIncome: 20000 })
  const b = incomeStatement({ regime: 'business', grossIncome: 20000, buildingDepreciation: 4800 })
  ok('building depreciation reduces taxable', near(b.taxableIncome, a.taxableIncome - 4800))
  ok('building depreciation is a line', b.lines.some(l => l.key === 'buildingDepreciation'))
  ok('depreciation NOT a cash outflow', near(b.netCash, a.netCash + (a.incomeTax - b.incomeTax)))
}

// ── Τεκμαρτό ελάχιστο καθαρό εισόδημα (ατομική) ──────────────────────────────
{
  // Πραγματικό καθαρό 5.000 < ελάχιστο 10.920 → φορολογείται το ελάχιστο.
  const low = incomeStatement({ regime: 'business', grossIncome: 12000, itemizedExpenses: 7000, presumptiveMinIncome: 10920 })
  ok('taxed on presumptive minimum when net is lower', near(low.taxableIncome, 10920))
  // Πραγματικό καθαρό 20.000 > ελάχιστο → φορολογείται το πραγματικό.
  const high = incomeStatement({ regime: 'business', grossIncome: 25000, itemizedExpenses: 5000, presumptiveMinIncome: 10920 })
  ok('taxed on actual when above minimum', near(high.taxableIncome, 20000))
  // Δεν αφορά νομικό πρόσωπο.
  const co = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 12000, itemizedExpenses: 7000, presumptiveMinIncome: 10920 })
  ok('minimum presumptive not applied to company', near(co.taxableIncome, 5000))
  // Το ΛΟΓΙΣΤΙΚΟ καθαρό βασίζεται στο ΠΡΑΓΜΑΤΙΚΟ κέρδος, όχι στο τεκμαρτό όριο.
  ok('netProfit uses real base (5000 - tax), not the 10920 floor', near(low.netProfit, 5000 - low.incomeTax))
}

// ── Φόρος μερισμάτων 5% στη διανομή νομικού προσώπου ─────────────────────────
{
  const retained = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 40000, itemizedExpenses: 10000 })
  const distributed = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: 40000, itemizedExpenses: 10000, companyDistribution: 1 })
  const afterCorp = distributed.taxableIncome - distributed.incomeTax
  ok('dividend tax = 5% of distributed profit', near(distributed.dividendTax, afterCorp * 0.05))
  ok('retained profit has no dividend tax', retained.dividendTax === 0)
  ok('dividend reduces netProfit', distributed.netProfit < retained.netProfit)
  ok('dividend shows as line', distributed.lines.some(l => l.key === 'dividendTax'))
}

// ── Νέος επαγγελματίας (πρώτη τριετία): 1ο κλιμάκιο 4,5% ─────────────────────
{
  // Ηλικία >30 ώστε να μην υπερισχύσει η ελάφρυνση νέων.
  const normal = incomeStatement({ regime: 'business', grossIncome: 8000, taxpayerAge: 40 })
  const newPro = incomeStatement({ regime: 'business', grossIncome: 8000, taxpayerAge: 40, firstThreeYears: true })
  ok('new professional first bracket 4.5%', near(newPro.incomeTax, 8000 * 0.045))
  ok('new professional cheaper than normal', newPro.incomeTax < normal.incomeTax)
  // Νέος έως 25: η ηλικιακή ελάφρυνση (0%) υπερισχύει της τριετίας.
  const young = incomeStatement({ regime: 'business', grossIncome: 8000, taxpayerAge: 24, firstThreeYears: true })
  ok('youth relief wins over new-professional', young.incomeTax === 0)
}

// ── Νομικά διεκδικημένα ανείσπρακτα: δεν φορολογούνται (άρθρο 39 §4) ──────────
{
  const taxed = incomeStatement({ regime: 'individual_longterm', grossIncome: 12000, uncollectedIncome: 4000 })
  const relieved = incomeStatement({ regime: 'individual_longterm', grossIncome: 12000, uncollectedIncome: 4000, legallyClaimedUncollected: true })
  ok('legally-claimed uncollected removed from taxable', relieved.taxableIncome < taxed.taxableIncome)
  ok('relieved taxable = (gross - uncollected) less presumptive', near(relieved.taxableIncome, (12000 - 4000) * 0.95))
  ok('relieved pays less tax', relieved.incomeTax < taxed.incomeTax)
  ok('relief reflected in line label', relieved.lines.some(l => l.key === 'uncollected' && /αφορολόγητα/.test(l.label)))
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
