#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΚΑΤΑΛΟΓΟΣ ΤΩΝ ΜΗΝΥΜΑΤΩΝ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΓΕΡΝΑΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΦΥΛΑΚΑ, ΜΕΤΡΗΜΕΝΟ. Το σχόλιο του emailCopy.ts έλεγε
// «106 emails». Ηταν 116. Δέκα μηνύματα προστέθηκαν και κανείς δεν ενημέρωσε τη
// γραμμή που τα μετρά. Οποιος διάβαζε το αρχείο νόμιζε ότι τα ήξερε όλα.
//
// Το ίδιο θα συμβεί στο `docs/KATALOGOS-MINYMATON.md` την πρώτη φορά που κάποιος
// προσθέσει μήνυμα χωρίς να ξανατρέξει τη γεννήτρια. Ενα ευρετήριο που δεν
// συμφωνεί με τον κώδικα είναι χειρότερο από κανένα: το πρώτο σε ξεγελά.
//
// ΤΙ ΜΕΤΡΑΕΙ. Ξανατρέχει τη γεννήτρια σε προσωρινό αρχείο και συγκρίνει με το
// δεσμευμένο. Καμία διαφορά επιτρέπεται, ούτε σε κενό.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const OUT = 'docs/KATALOGOS-MINYMATON.md'
const BAK = 'docs/.KATALOGOS-MINYMATON.before'

if (!existsSync(OUT)) {
  console.error(`✗ λείπει ο κατάλογος: ${OUT}\n  ΔΙΟΡΘΩΣΗ: npm run katalogos`)
  process.exit(1)
}

const before = readFileSync(OUT, 'utf8')
writeFileSync(BAK, before)
try {
  execFileSync('node', ['scripts/gen-message-catalog.mjs'], { stdio: 'ignore' })
  const after = readFileSync(OUT, 'utf8')
  // Το δεσμευμένο επιστρέφει ΠΑΝΤΑ, ώστε ο φύλακας να μην αλλάζει το δέντρο.
  writeFileSync(OUT, before)
  unlinkSync(BAK)
  if (after !== before) {
    console.error('✗ ο κατάλογος μηνυμάτων δεν συμφωνεί με τον κώδικα.\n')
    const a = before.split('\n'), b = after.split('\n')
    let shown = 0
    for (let i = 0; i < Math.max(a.length, b.length) && shown < 8; i++) {
      if (a[i] !== b[i]) { console.error(`  γραμμή ${i + 1}\n    δεσμευμένο: ${a[i] ?? '(λείπει)'}\n    κώδικας:    ${b[i] ?? '(λείπει)'}`); shown++ }
    }
    console.error('\n  ΔΙΟΡΘΩΣΗ: npm run katalogos και δέσμευσε το αποτέλεσμα.')
    process.exit(1)
  }
} catch (e) {
  if (existsSync(BAK)) { renameSync(BAK, OUT) }
  if (e.status === 1 && e.stderr === undefined) throw e
  if (typeof e.status === 'number' && e.status !== 0 && !e.stdout) {
    console.error('✗ η γεννήτρια του καταλόγου δεν τρέχει: ' + (e.stderr?.toString() || e.message))
    process.exit(1)
  }
  throw e
}
console.log('✓ ο κατάλογος των μηνυμάτων συμφωνεί με τον κώδικα')
