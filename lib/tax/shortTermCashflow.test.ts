// npx tsx lib/tax/shortTermCashflow.test.ts
//
// Αυτή η αλυσίδα είναι η ΜΟΝΗ απάντηση που δίνει η εφαρμογή στο «πόσα μένουν σε
// εμένα». Αν το τελευταίο νούμερο βγει λάθος προς τα πάνω, ο ιδιοκτήτης παίρνει
// αποφάσεις τιμολόγησης πάνω σε ψέμα. Γι' αυτό ελέγχεται ρητά ότι το άθροισμα
// κλείνει, ότι καμία γραμμή δεν χάνεται σιωπηλά και ότι το αρνητικό επιτρέπεται.
import { shortTermCashflow, type ShortTermCashflowInput } from './shortTermCashflow'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n} (${JSON.stringify(got)} = ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want))

const BASE: ShortTermCashflowInput = {
  grossRevenue: 10000, platformFees: 1500, operatingExpenses: 2000,
  municipalTax: 50, levyShortfall: 0, incomeTax: 1500,
}
function inp(o: Partial<ShortTermCashflowInput> = {}): ShortTermCashflowInput {
  return { ...BASE, ...o }
}

// ── Η ΑΛΥΣΙΔΑ ΚΛΕΙΝΕΙ ────────────────────────────────────────────────────
{
  const r = shortTermCashflow(inp())
  eq('το καθαρό είναι η αφαίρεση όλων', r.net, 10000 - 1500 - 2000 - 50 - 1500)
  const outs = r.steps.filter(s => s.kind === 'out').reduce((s, x) => s + x.amount, 0)
  const gross = r.steps.find(s => s.key === 'gross')!.amount
  ok('ακαθάριστα μείον εκροές ισούται με το καθαρό', Math.round((gross - outs) * 100) / 100 === r.net)
  eq('η τελευταία γραμμή είναι το σύνολο', r.steps[r.steps.length - 1].key, 'net')
  eq('η πρώτη είναι τα ακαθάριστα', r.steps[0].key, 'gross')
  eq('ποσοστό που μένει', r.keptPct, 49.5)
}

// ── ΟΙ ΜΗΔΕΝΙΚΕΣ ΓΡΑΜΜΕΣ ΔΕΝ ΕΜΦΑΝΙΖΟΝΤΑΙ ────────────────────────────────
// Μια σειρά «Τέλος παρεπιδημούντων 0,00 €» δεν λέει «δεν χρωστάς», λέει
// «μετρήθηκε και βγήκε μηδέν» — και σε στήλη αφαιρέσεων διαβάζεται σαν παράλειψη.
{
  const r = shortTermCashflow(inp({ municipalTax: 0, levyShortfall: 0, platformFees: 0 }))
  ok('χωρίς παρεπιδημούντων, καμία γραμμή γι’ αυτό', !r.steps.some(s => s.key === 'municipal'))
  ok('χωρίς ακάλυπτο τέλος, καμία γραμμή', !r.steps.some(s => s.key === 'shortfall'))
  ok('χωρίς προμήθεια, καμία γραμμή', !r.steps.some(s => s.key === 'fees'))
  eq('μένουν ακαθάριστα, έξοδα, φόρος και σύνολο', r.steps.map(s => s.key), ['gross', 'opex', 'tax', 'net'])
}
{
  // Ακόμη και με τα πάντα μηδέν, η αλυσίδα έχει αρχή και τέλος: αλλιώς η οθόνη
  // θα έδειχνε κενό κουτί χωρίς να πει τι δεν ξέρει.
  const r = shortTermCashflow(inp({ grossRevenue: 0, platformFees: 0, operatingExpenses: 0, municipalTax: 0, levyShortfall: 0, incomeTax: 0 }))
  eq('πάντα δύο γραμμές τουλάχιστον', r.steps.map(s => s.key), ['gross', 'net'])
  eq('καθαρό μηδέν', r.net, 0)
  eq('χωρίς ακαθάριστα δεν υπάρχει ποσοστό', r.keptPct, null)
}

// ── ΤΟ ΑΡΝΗΤΙΚΟ ΕΠΙΤΡΕΠΕΤΑΙ ──────────────────────────────────────────────
// Μια χρονιά με ανακαίνιση μπορεί κάλλιστα να βγει αρνητική. Αν το στρογγυλεύαμε
// στο μηδέν, θα κρύβαμε ακριβώς την πληροφορία για την οποία υπάρχει η οθόνη.
{
  const r = shortTermCashflow(inp({ grossRevenue: 3000, operatingExpenses: 9000 }))
  ok('το καθαρό βγαίνει αρνητικό', r.net < 0)
  eq('πόσο ακριβώς', r.net, 3000 - 1500 - 9000 - 50 - 1500)
  ok('το μέγεθος της γραμμής μένει θετικό, το πρόσημο το λέει το είδος',
     r.steps[r.steps.length - 1].amount > 0)
  ok('το ποσοστό είναι αρνητικό, όχι μηδέν', (r.keptPct ?? 0) < 0)
  ok('η σημείωση εξηγεί το αρνητικό', /Αρνητικό/.test(r.steps[r.steps.length - 1].note || ''))
}

// ── ΚΑΘΕ ΕΚΡΟΗ ΕΙΝΑΙ ΘΕΤΙΚΟ ΜΕΓΕΘΟΣ ──────────────────────────────────────
// Η κατεύθυνση λέγεται από το είδος της γραμμής, ώστε η στήλη να στοιχίζεται
// στην υποδιαστολή χωρίς πρόσημα που μετακινούν τα ψηφία.
{
  const r = shortTermCashflow(inp({ levyShortfall: 120 }))
  ok('καμία αρνητική τιμή σε γραμμή', r.steps.every(s => s.amount >= 0))
  ok('όλες οι ενδιάμεσες είναι εκροές', r.steps.slice(1, -1).every(s => s.kind === 'out'))
  ok('το ακάλυπτο τέλος εμφανίζεται', r.steps.some(s => s.key === 'shortfall' && s.amount === 120))
}

// ── ΣΚΟΥΠΙΔΙΑ ΔΕΝ ΣΠΑΝΕ ΤΗΝ ΑΛΥΣΙΔΑ ──────────────────────────────────────
{
  const r = shortTermCashflow(inp({ grossRevenue: NaN, platformFees: -500, incomeTax: Infinity }))
  eq('μη πεπερασμένα γίνονται μηδέν', r.steps[0].amount, 0)
  ok('αρνητική είσοδος δεν γίνεται έσοδο', !r.steps.some(s => s.key === 'fees'))
  ok('το αποτέλεσμα παραμένει αριθμός', Number.isFinite(r.net))
}

// ── ΛΕΠΤΑ ────────────────────────────────────────────────────────────────
{
  const r = shortTermCashflow(inp({ grossRevenue: 100.1, platformFees: 0.2, operatingExpenses: 0, municipalTax: 0, levyShortfall: 0, incomeTax: 0 }))
  eq('χωρίς σφάλμα κινητής υποδιαστολής', r.net, 99.9)
}

console.log(fail === 0 ? `✓ shortTermCashflow: ${pass} έλεγχοι πέρασαν` : `✗ shortTermCashflow: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
