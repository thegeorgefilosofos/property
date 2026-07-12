// Τεστ για τη συμβουλευτική ακινήτων (lib/accounting/advisory.ts).
import { buildAdvisory, referLabel, type AdvisoryInput } from './advisory'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const base: AdvisoryInput = {
  regime: 'individual_longterm', grossIncome: 9000, taxableIncome: 8550,
  rentalMode: 'long_term', propertyCount: 1, hasLoan: false,
}

// ── Επιλεγμένος αριθμός, όχι θόρυβος ────────────────────────────────────────
{
  const items = buildAdvisory(base)
  ok('επιστρέφει το πολύ 6 προτάσεις', items.length <= 6)
  ok('έχει τουλάχιστον μία πρόταση', items.length >= 1)
  ok('όλες έχουν id/title/body', items.every(i => i.id && i.title && i.body))
  ok('μοναδικά ids', new Set(items.map(i => i.id)).size === items.length)
}

// ── Νέος επαγγελματίας: μειωμένη κλίμακα εμφανίζεται ────────────────────────
{
  const y = buildAdvisory({ ...base, regime: 'business', businessForm: 'sole', age: 24, taxableIncome: 15000 })
  ok('νέος επιχειρηματίας βλέπει την ελάφρυνση', y.some(i => i.id === 'youth-business'))
  ok('η ελάφρυνση είναι ευκαιρία', y.find(i => i.id === 'youth-business')?.tone === 'opportunity')
}

// ── Νέος ΙΔΙΩΤΗΣ με ενοίκια: του λέμε ότι ΔΕΝ ισχύει για ενοίκια ────────────
{
  const y = buildAdvisory({ ...base, age: 23 })
  ok('νέος ιδιώτης ενημερώνεται ότι δεν ισχύει στα ενοίκια', y.some(i => i.id === 'youth-not-rent'))
  ok('δεν του δίνουμε λάθος ελάφρυνση επιχείρησης', !y.some(i => i.id === 'youth-business'))
}

// ── Μεγάλη ηλικία: καμία ηλικιακή πρόταση ───────────────────────────────────
{
  const a = buildAdvisory({ ...base, age: 45, regime: 'business', businessForm: 'sole', taxableIncome: 15000 })
  ok('χωρίς ελάφρυνση νέων εκτός ορίου ηλικίας', !a.some(i => i.id === 'youth-business' || i.id === 'youth-not-rent'))
}

// ── Βραχυχρόνια → πρόταση απαλλαγής 3ετίας ──────────────────────────────────
{
  const s = buildAdvisory({ ...base, regime: 'individual_shortterm', rentalMode: 'short_term' })
  ok('βραχυχρόνια βλέπει την απαλλαγή μετατροπής σε μακροχρόνια', s.some(i => i.id === 'longterm-exemption'))
}

// ── Δομή δραστηριότητας για μεγάλο χαρτοφυλάκιο ─────────────────────────────
{
  const big = buildAdvisory({ ...base, propertyCount: 5, grossIncome: 45000, taxableIncome: 42750 }, 12)
  ok('μεγάλο χαρτοφυλάκιο βλέπει σύγκριση δομής', big.some(i => i.id === 'structure'))
  ok('υψηλό οριακό κλιμάκιο → κατανομή εισοδήματος', big.some(i => i.id === 'income-split'))
}

// ── Ατομική με υψηλά κέρδη → σύγκριση με νομικό πρόσωπο ─────────────────────
{
  const hi = buildAdvisory({ ...base, regime: 'business', businessForm: 'sole', grossIncome: 55000, taxableIncome: 48000 }, 12)
  ok('υψηλά κέρδη ατομικής → πρόταση εταιρείας', hi.some(i => i.id === 'structure-company'))
}

// ── Τόκοι δανείου ιδιώτη: caution ότι δεν εκπίπτουν ─────────────────────────
{
  const l = buildAdvisory({ ...base, hasLoan: true, loanInterestYear: 1200 }, 12)
  ok('ιδιώτης με τόκους: προειδοποίηση μη έκπτωσης', l.some(i => i.id === 'loan-interest-nondeduct'))
  ok('χωρίς δάνειο: πρόταση χρηματοδότησης', buildAdvisory(base, 12).some(i => i.id === 'loan-idea'))
}

// ── Κάθε φορολογική πρόταση παραπέμπει σε επαγγελματία ──────────────────────
{
  const items = buildAdvisory({ ...base, propertyCount: 5, grossIncome: 45000, taxableIncome: 42750 }, 12)
  const taxIds = ['youth-business', 'youth-not-rent', 'longterm-exemption', 'renovation-credit', 'structure', 'structure-company', 'income-split', 'loan-interest-nondeduct']
  const taxItems = items.filter(i => taxIds.includes(i.id))
  ok('οι φορολογικές/δομικές προτάσεις παραπέμπουν σε επαγγελματία', taxItems.every(i => !!i.refer))
  ok('το referLabel δίνει ελληνική ετικέτα', referLabel('accountant')?.includes('λογιστή') === true)
  ok('referLabel(undefined) = undefined', referLabel(undefined) === undefined)
}

console.log(`advisory.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
