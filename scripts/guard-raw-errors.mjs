#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΝΕΝΑ ΜΗΝΥΜΑ ΤΗΣ ΒΑΣΗΣ ΔΕΝ ΦΤΑΝΕΙ ΣΤΗΝ ΟΘΟΝΗ
// ─────────────────────────────────────────────────────────────────────────
// Πενήντα έξι σημεία περνούσαν το `error.message` του Supabase κατευθείαν σε
// `notifyError` / `setError`. Δηλαδή ο Έλληνας ιδιοκτήτης που πάτησε
// «Αποθήκευση» διάβαζε «new row violates row-level security policy for table
// "expenses"» — αγγλικά, ορολογία βάσης και καμία ένδειξη τι να κάνει.
//
// Το σημείο που πονάει περισσότερο: «Failed to fetch» σημαίνει απλώς ότι κόπηκε
// το ίντερνετ. Είναι η ΜΟΝΗ κατηγορία σφάλματος που ο χρήστης μπορεί να
// διορθώσει μόνος του — και ήταν γραμμένη έτσι ώστε να μην το καταλάβει.
//
// Ο ΚΑΝΟΝΑΣ: το «τι απέτυχε» το ξέρει η οθόνη, το «γιατί» το μεταφράζει το
// lib/core/dbError.ts. Γράφεται `failed('Το αντικείμενο δεν αποθηκεύτηκε', error)`.
// Άγνωστο σφάλμα δεν τυπώνεται ποτέ στα αγγλικά: μένει το «τι» και η προτροπή.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

// Οι συναρτήσεις που γράφουν στην οθόνη. Το `saved()` δέχεται ΜΟΝΟ το «τι» και
// κάνει τη μετάφραση μόνο του, οπότε δεν χρειάζεται έλεγχο εδώ.
const SINK = /(notifyError|setErr|setError|set\w*Err)\s*\(/

// Οι σελίδες σφάλματος του Next δείχνουν το `error.digest` σε τεχνικό πλαίσιο,
// για να το αναφέρει ο χρήστης — δεν είναι μήνυμα ροής εργασίας.
const ALLOWED = ['app/error.tsx', 'app/global-error.tsx', 'app/dashboard/components/TabBoundary.tsx']

// ── ΔΙΚΑ ΜΑΣ ΣΦΑΛΜΑΤΑ, ΜΕ ΜΗΝΥΜΑ ΓΡΑΜΜΕΝΟ ΓΙΑ ΤΗΝ ΟΘΟΝΗ ────────────────────
// Ο κανόνας είναι «κανένα μήνυμα ΤΗΣ ΒΑΣΗΣ», όχι «κανένα .message ποτέ». Η
// `SheetError` του lib/core/readSheet.ts πετιέται από εμάς, με ελληνικό κείμενο
// που λέει στον χρήστη τι να κάνει («Το αρχείο είναι πολύ μεγάλο, όριο 5 MB»):
// το να το αντικαταστήσουμε με γενικό μήνυμα ΑΦΑΙΡΕΙ πληροφορία.
//
// Η εξαίρεση δένεται στον ΤΥΠΟ, όχι στο αρχείο: ισχύει μόνο όταν η ίδια γραμμή
// ελέγχει ρητά `instanceof` πάνω σε τέτοια κλάση. Άγνωστο σφάλμα στο ίδιο
// σημείο εξακολουθεί να πιάνεται.
const USER_FACING_ERRORS = ['SheetError']
const OURS = new RegExp(`instanceof\\s+(?:${USER_FACING_ERRORS.join('|')})\\b`)

const findings = []
for (const f of findSources().filter(x => x.endsWith('.tsx') && !x.includes('.test.') && !ALLOWED.includes(x))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*')) return
    if (!SINK.test(line)) return
    // `x.message` μέσα στην ίδια γραμμή με τον καταναλωτή του μηνύματος.
    if (OURS.test(line)) return
    if (/\b\w+(\?)?\.message\b/.test(line)) findings.push(`${f}:${i + 1}  ${t.slice(0, 96)}`)
  })
}

if (findings.length) {
  console.error(`✗ ${findings.length} σημεία δείχνουν στον χρήστη το μήνυμα της βάσης:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error("\n  Γράψε: failed('Τι δεν έγινε', error) — από το lib/core/dbError.ts.")
  console.error('  Το «τι» το ξέρει η οθόνη, το «γιατί» μεταφράζεται στα ελληνικά,')
  console.error('  και το άγνωστο δεν τυπώνεται ποτέ στα αγγλικά.')
  process.exit(1)
}
console.log('✓ κανένα μήνυμα βάσης δεν φτάνει στην οθόνη')
