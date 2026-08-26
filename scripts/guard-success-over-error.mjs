#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΡΑΣΙΝΟ ΜΗΝΥΜΑ ΠΑΝΩ ΣΤΟ ΚΟΚΚΙΝΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΒΛΕΠΕ Ο ΧΡΗΣΤΗΣ. Πατούσε «Ανάθεση σε συνεργείο», το γράψιμο αποτύγχανε,
// το `saved()` έβγαζε κόκκινο «Η ανάθεση δεν αποθηκεύτηκε» και ΑΜΕΣΩΣ μετά
// εμφανιζόταν πράσινο «Η ανάθεση αποθηκεύτηκε». Δύο μηνύματα, αντίθετα, στην
// ίδια στιγμή. Ο χρήστης πιστεύει το τελευταίο και φεύγει νομίζοντας ότι έγινε.
//
// Πέντε τέτοια σημεία μετρήθηκαν στην καρτέλα φροντίδας ενοικιαστή. Σε ένα από
// αυτά η φόρμα ΕΚΛΕΙΝΕ κιόλας, δηλαδή το κείμενο που μόλις είχε γράψει ο
// χρήστης χανόταν μαζί με το ψεύτικο «αποθηκεύτηκε».
//
// ΤΙ ΜΕΤΡΑΕΙ. Κάθε `await saved(...)` του οποίου η επιστροφή ΔΕΝ ελέγχεται,
// όταν στο ίδιο σώμα συνάρτησης ακολουθεί `notifyOk(`. Το `saved` επιστρέφει
// `boolean` ακριβώς γι' αυτόν τον λόγο και το ίδιο αρχείο το χρησιμοποιεί σωστά
// αλλού (`if(await saved(...))`), που είναι και η απόδειξη ότι πρόκειται για
// παράλειψη και όχι για σύμβαση.
//
// ΔΕΝ ΚΡΙΝΕΙ όσα δεν ανακοινώνουν επιτυχία: εκεί το κόκκινο του `saved` είναι
// ήδη όλη η αλήθεια που χρειάζεται ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/** Το σώμα από τη θέση `at` ώς το τέλος της συνάρτησης που την περιέχει. */
function untilFunctionEnd(src, at) {
  let depth = 0
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { if (depth === 0) return src.slice(at, i); depth-- }
  }
  return src.slice(at)
}

const findings = []
for (const f of findSources()) {
  if (!/\.tsx?$/.test(f) || f.includes('.test.')) continue
  const src = readFileSync(f, 'utf8')
  if (!src.includes('notifyOk(')) continue
  for (const m of src.matchAll(/\bawait\s+saved\s*\(/g)) {
    // Ελεγμένο: «if (await saved», «const x = await saved», «!await saved»,
    // «return await saved». Ο,τι ΞΕΚΙΝΑ γραμμή με «await saved» και δεν
    // ανατίθεται πουθενά, πετά την απάντηση.
    const before = src.slice(Math.max(0, m.index - 60), m.index)
    if (/[=(!&|?:]\s*$/.test(before) || /\breturn\s+$/.test(before)) continue
    // ΤΟ ΔΕΥΤΕΡΕΥΟΝ ΓΡΑΨΙΜΟ ΔΕΝ ΕΙΝΑΙ ΨΕΜΑ. Μια «if (item.calendar_event_id)
    // await saved('Το ημερολόγιο δεν ενημερώθηκε', …)» μέσα σε ολοκλήρωση
    // εκκρεμότητας γράφει ΑΛΛΟ πράγμα από αυτό που ανακοινώνει το πράσινο: ο
    // χρήστης βλέπει «το ημερολόγιο δεν ενημερώθηκε» ΚΑΙ «η εκκρεμότητα
    // ολοκληρώθηκε», που είναι και τα δύο αληθινά. Το ψέμα είναι μόνο όταν το
    // ΙΔΙΟ γράψιμο που απέτυχε ανακοινώνεται ως πετυχημένο, δηλαδή όταν είναι
    // άνευ όρων και κύριο.
    if (/\bif\s*\([^)]*\)\s*$/.test(before)) continue
    const rest = untilFunctionEnd(src, m.index)
    if (!/\bnotifyOk\s*\(/.test(rest)) continue
    const line = src.slice(0, m.index).split('\n').length
    findings.push(`${f}:${line}`)
  }
}

if (findings.length) {
  console.error(`✗ ${findings.length} γραψίματα ανακοινώνουν επιτυχία χωρίς να τη ρωτήσουν:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error('\n  Το `saved()` επιστρέφει boolean. Κράτησέ το:')
  console.error('    const ok = await saved(…); if (ok) notifyOk(…)')
  console.error('  Αλλιώς ο χρήστης βλέπει κόκκινο και πράσινο μαζί· και πιστεύει το πράσινο.')
  process.exit(1)
}
console.log('✓ κανένα πράσινο μήνυμα δεν εμφανίζεται πάνω σε κόκκινο')
