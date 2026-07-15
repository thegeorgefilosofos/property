// Τεστ για lib/loans/approval.ts — τρέξε με: npx tsx lib/loans/approval.test.ts
import { assessApproval, verdictLabel, type ApprovalInput } from './approval'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { cond ? passed++ : (failed++, console.error('FAIL:', name)) }

const base: ApprovalInput = {
  incomeMonthly: 2500, existingMonthlyDebt: 0, amount: 150000, years: 25, ratePct: 3.5,
  propertyValue: 200000, age: 35, firstHome: true, employment: 'employee_permanent', credit: 'clean',
}

// ── Ισχυρό προφίλ → υψηλή πιθανότητα ──
{
  const r = assessApproval(base)
  ok('strong profile → high', r.verdict === 'high')
  ok('strong profile score >= 80', r.score >= 80)
  ok('dsti under limit is pass', r.factors.some(f => f.label === 'Δείκτης δόσης' && f.kind === 'pass'))
  ok('ltv under limit is pass', r.factors.some(f => f.label === 'Δάνειο προς αξία' && f.kind === 'pass'))
  ok('no hard block factors', !r.factors.some(f => f.kind === 'block'))
  ok('verdictLabel returns greek', verdictLabel(r.verdict).length > 0)
}

// ── Υπερβολική δόση για το εισόδημα → πρόταση μείωσης ποσού ──
{
  const r = assessApproval({ ...base, incomeMonthly: 1200, amount: 200000, years: 20, firstHome: false })
  ok('low income high amount → not high', r.verdict !== 'high')
  ok('dsti over limit flagged', r.dstiPct > r.dstiLimitPct)
  ok('suggests amount reduction', r.suggestions.some(s => s.includes('Μείωσε το ποσό')))
}

// ── Ενεργές δυσμενείς εγγραφές → μπλοκάρισμα ──
{
  const r = assessApproval({ ...base, credit: 'severe' })
  ok('severe credit → blocked', r.verdict === 'blocked')
  ok('severe credit block factor', r.factors.some(f => f.label.includes('δυσμενείς') && f.kind === 'block'))
}

// ── Ηλικία στη λήξη πάνω από όριο → μπλοκάρισμα + πρόταση μικρότερης διάρκειας ──
{
  const r = assessApproval({ ...base, age: 60, years: 30, maxAgeAtEnd: 75 })
  ok('age at end over → blocked', r.verdict === 'blocked')
  ok('ageAtEnd computed', r.ageAtEnd === 90)
  ok('suggests shorter duration', r.suggestions.some(s => s.includes('Μείωσε τη διάρκεια')))
}

// ── LTV πάνω από όριο → πρόταση προκαταβολής ──
{
  const r = assessApproval({ ...base, amount: 190000, propertyValue: 200000, firstHome: false, maxLtv: 80 })
  ok('ltv over limit computed', r.ltvPct > r.maxLtv)
  ok('suggests down payment', r.suggestions.some(s => s.includes('προκαταβολή') || s.includes('μείωσε το ποσό')))
}

// ── Εγγυητής ενισχύει ──
{
  const noG = assessApproval({ ...base, incomeMonthly: 1500, amount: 160000 })
  const withG = assessApproval({ ...base, incomeMonthly: 1500, amount: 160000, hasGuarantor: true })
  ok('guarantor does not lower score', withG.score >= noG.score)
  ok('guarantor is a pass factor', withG.factors.some(f => f.label === 'Εγγυητής' && f.kind === 'pass'))
}

// ── Ελεύθερος επαγγελματίας → σημείο προσοχής ──
{
  const r = assessApproval({ ...base, employment: 'freelancer', yearsEmployed: 1 })
  ok('freelancer warn factor', r.factors.some(f => f.label.includes('Ελεύθερος') && f.kind === 'warn'))
}

// ── Score πάντα 0-100, verdict έγκυρο ──
{
  const r = assessApproval({ ...base, incomeMonthly: 0, amount: 300000, propertyValue: 0, age: 70, years: 30, credit: 'severe' })
  ok('score bounded 0-100', r.score >= 0 && r.score <= 100)
  ok('worst case blocked', r.verdict === 'blocked')
}

console.log(`\napproval.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
