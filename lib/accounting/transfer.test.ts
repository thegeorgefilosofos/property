// Τεστ για το κόστος αγοράς/πώλησης ακινήτου (lib/accounting/transfer.ts).
import { transferCosts, TRANSFER_TAX_RATE, CADASTRE_RATE, CADASTRE_FIXED } from './transfer'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

// ── Αγορά: φόρος μεταβίβασης 3,09% + λοιπά ──────────────────────────────────
{
  const r = transferCosts({ side: 'buy', price: 200000 })
  const tax = r.lines.find(l => l.key === 'transferTax')!
  ok('buy: transfer tax 3,09%', near(tax.amount, 200000 * TRANSFER_TAX_RATE))
  ok('buy: has notary', r.lines.some(l => l.key === 'notary'))
  ok('buy: has cadastre', near(r.lines.find(l => l.key === 'cadastre')!.amount, 200000 * CADASTRE_RATE + CADASTRE_FIXED))
  ok('buy: cashOut = price + costs', near(r.cashOut!, 200000 + r.totalCosts))
  ok('buy: costPct reasonable (4–8%)', r.costPct > 0.04 && r.costPct < 0.08)
  ok('buy: no agent line by default', !r.lines.some(l => l.key === 'agent'))
}

// ── Αγορά: φόρος στη ΜΕΓΑΛΥΤΕΡΗ αξία (αντικειμενική > τίμημα) ────────────────
{
  const r = transferCosts({ side: 'buy', price: 150000, objectiveValue: 180000 })
  ok('buy: tax on higher objective value', near(r.lines.find(l => l.key === 'transferTax')!.amount, 180000 * TRANSFER_TAX_RATE))
}

// ── Αγορά: απαλλαγή πρώτης κατοικίας μειώνει τον φόρο ───────────────────────
{
  const plain = transferCosts({ side: 'buy', price: 220000 })
  const fh = transferCosts({ side: 'buy', price: 220000, firstHome: true, married: true })
  const plainTax = plain.lines.find(l => l.key === 'transferTax')!.amount
  const fhTax = fh.lines.find(l => l.key === 'transferTax')!.amount
  ok('first-home reduces transfer tax', fhTax < plainTax)
  ok('first-home taxes only excess over exemption', near(fhTax, (220000 - 250000 > 0 ? 220000 - 250000 : 0) * TRANSFER_TAX_RATE))
  // πλήρης απαλλαγή όταν αξία < όριο
  const full = transferCosts({ side: 'buy', price: 180000, firstHome: true, married: true })
  ok('first-home full exemption below threshold', full.lines.find(l => l.key === 'transferTax')!.amount === 0)
}

// ── Αγορά: νεόδμητο με ΦΠΑ όταν ΔΕΝ ισχύει η αναστολή ───────────────────────
{
  const suspended = transferCosts({ side: 'buy', price: 200000, newBuild: true, vatSuspended: true })
  ok('new-build with VAT suspended → transfer tax', suspended.lines.some(l => l.key === 'transferTax'))
  const vat = transferCosts({ side: 'buy', price: 200000, newBuild: true, vatSuspended: false })
  ok('new-build without suspension → 24% VAT', near(vat.lines.find(l => l.key === 'vat')!.amount, 200000 * 0.24))
  ok('VAT path has no transfer tax', !vat.lines.some(l => l.key === 'transferTax'))
}

// ── Πώληση: μεσιτικά + ΠΕΑ + υπεραξία σε αναστολή, καθαρό έσοδο ─────────────
{
  const r = transferCosts({ side: 'sell', price: 250000, useAgent: true, acquisitionCost: 200000 })
  ok('sell: agent line present', r.lines.some(l => l.key === 'agent'))
  ok('sell: capital gains suspended = 0', r.lines.find(l => l.key === 'capitalGains')!.amount === 0)
  ok('sell: netProceeds = price − costs', near(r.netProceeds!, 250000 - r.totalCosts))
  ok('sell: has ΠΕΑ', r.lines.some(l => l.key === 'pea'))
}

// ── Πώληση: όταν ο φόρος υπεραξίας είναι ενεργός, 15% επί της υπεραξίας ──────
{
  const r = transferCosts({ side: 'sell', price: 300000, acquisitionCost: 200000, capitalGainsActive: true })
  ok('sell: active capital gains = 15% of gain', near(r.lines.find(l => l.key === 'capitalGains')!.amount, (300000 - 200000) * 0.15))
  // καμία υπεραξία αν πουλάς φθηνότερα από το κόστος κτήσης
  const loss = transferCosts({ side: 'sell', price: 180000, acquisitionCost: 200000, capitalGainsActive: true })
  ok('sell: no gain, no tax', loss.lines.find(l => l.key === 'capitalGains')!.amount === 0)
}

// ── Ασφάλεια εισόδου ────────────────────────────────────────────────────────
{
  const r = transferCosts({ side: 'buy', price: NaN as any })
  ok('NaN price → 0 costs safe', r.price === 0 && r.totalCosts >= 0)
}

console.log(`transfer.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
