// npx tsx lib/expenses/groups.test.ts
import { isGroupDeductible, groupForCategory, DEDUCTIBLE_EXPENSE_GROUPS } from './groups'
import { CATEGORIES } from './taxonomy'

let pass = 0, fail = 0
const ok = (name: string, c: boolean) => { if (c) { pass++ } else { fail++; console.error('✗ ' + name) } }

// ═══ Ο ΕΝΑΣ ΑΞΟΝΑΣ: η ομάδα ΔΕΝ επιτρέπεται να διαφωνεί με την κατηγορία ═══
// Αν κάποιος προσθέσει κατηγορία ή αλλάξει το deductible της χωρίς να δει τον
// χάρτη οικογενειών, πέφτει ΕΔΩ — όχι σιωπηλά στη φορολογική δήλωση του χρήστη.
{
  const bad: string[] = []
  for (const c of CATEGORIES) {
    if (isGroupDeductible(groupForCategory(c)) !== c.deductible) {
      bad.push(`${c.slug} (deductible=${c.deductible} → ομάδα ${groupForCategory(c)})`)
    }
  }
  ok(`και οι ${CATEGORIES.length} κατηγορίες συμφωνούν με την ομάδα τους${bad.length ? ': ' + bad.join(', ') : ''}`, bad.length === 0)
}

// ═══ ΟΙ ΔΥΟ ΜΙΚΤΕΣ ΟΙΚΟΓΕΝΕΙΕΣ, ΟΝΟΜΑΣΤΙΚΑ ═════════════════════════════════
// Ήταν ο λόγος που η παραγωγή από την οικογένεια ΔΕΝ δουλεύει.
{
  const bySlug = Object.fromEntries(CATEGORIES.map(c => [c.slug, c]))
  ok('συνδρομές: οικογένεια «home» αλλά ΔΕΝ εκπίπτουν', !isGroupDeductible(groupForCategory(bySlug.subscription)))
  ok('ΕΝΦΙΑ: οικογένεια «official» αλλά ΔΕΝ εκπίπτει', !isGroupDeductible(groupForCategory(bySlug.enfia)))
  ok('ρεύμα: πάγιο και εκπίπτει', groupForCategory(bySlug.electricity) === 'fixed')
  ok('υδραυλικός: συντήρηση και εκπίπτει', isGroupDeductible(groupForCategory(bySlug.plumber)))
}

// ═══ ΑΝΘΕΚΤΙΚΟΤΗΤΑ ═════════════════════════════════════════════════════════
{
  ok('άγνωστη κατηγορία → other, όχι κενό', groupForCategory(null) === 'other')
  ok('άγνωστη οικογένεια → other', groupForCategory({ family: 'ανύπαρκτη', deductible: true }) === 'other')
  ok('κάθε παραγόμενη ομάδα είναι γνωστή',
     CATEGORIES.every(c => groupForCategory(c) === 'other' || DEDUCTIBLE_EXPENSE_GROUPS.has(groupForCategory(c))))
}

console.log(fail === 0 ? `✓ groups: ${pass} έλεγχοι πέρασαν` : `✗ groups: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
