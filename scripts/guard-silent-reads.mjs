#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΝΑΓΝΩΣΗ ΠΟΥ ΑΠΕΤΥΧΕ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΜΟΙΑΖΕΙ ΜΕ «ΔΕΝ ΥΠΑΡΧΕΙ ΤΙΠΟΤΑ»
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΧΗΜΑ ΤΟΥ ΣΦΑΛΜΑΤΟΣ. Το PostgREST απαντά πάντα `{ data, error }`. Οταν το
// ερώτημα αποτύχει —δίκτυο, δικαίωμα, ορθογραφικό σε όνομα στήλης— το `data`
// είναι `null`. Ο κώδικας που γράφει
//
//     const { data } = await db.from('expenses').select(...)
//     return (data || []) as T[]
//
// μετατρέπει την αποτυχία σε άδεια λίστα, δηλαδή στην ΙΔΙΑ απάντηση με το «δεν
// έχεις καταχωρήσει τίποτα». Καμία εξαίρεση, κανένα μήνυμα, καμία ένδειξη.
//
// ΠΟΥ ΚΟΣΤΙΖΕΙ ΠΡΑΓΜΑΤΙΚΑ. Οπου η άδεια λίστα γίνεται ΠΟΣΟ: στη Λογιστική μια
// αποτυχημένη ανάγνωση δαπανών δίνει «μηδέν δαπάνες», δηλαδή μεγαλύτερο
// φορολογητέο εισόδημα και μεγαλύτερο φόρο, σε οθόνη που παράγει Ε2, βεβαίωση
// ενοικίου και φάκελο λογιστή. Γι' αυτό οι τρεις αναγνώσεις εκείνης της οθόνης
// έχουν εκδοχή `…WithError` και η οθόνη αρνείται να δείξει εικόνα που δεν
// διάβασε.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ. Τα υπόλοιπα σημεία δεν είναι όλα σφάλμα:
// σε πολλά η άδεια λίστα ΕΙΝΑΙ η σωστή απάντηση και το σφάλμα δεν αλλάζει τι
// βλέπει ο χρήστης. Μια ολική απαγόρευση θα ζητούσε ξαναγράψιμο σαράντα
// συναρτήσεων σε μια κίνηση, δηλαδή ακριβώς τη βιασύνη που παράγει σφάλματα.
// Ο κανόνας είναι «ούτε μία παραπάνω»: κάθε νέα σιωπηλή ανάγνωση κοκκινίζει,
// και το όριο κατεβαίνει όποτε μια παλιά μετατρέπεται.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'
import { execSync } from 'node:child_process'

const BASELINE = JSON.parse(readFileSync('scripts/silent-reads-baseline.json', 'utf8'))

const files = projectFiles("'app/**/*.ts' 'app/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx'").filter(f => !f.includes('.test.'))

/** `const { data } = await …` — η απάντηση διαβάζεται χωρίς το σφάλμα της. */
const SILENT = /const\s*\{\s*data(?:\s*:\s*\w+)?\s*\}\s*=\s*await\b/

const hits = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*')) return
    if (SILENT.test(line)) hits.push({ file, line: i + 1, code: t.slice(0, 90) })
  })
}

if (hits.length > BASELINE.max) {
  console.error(`✗ ${hits.length} σιωπηλές αναγνώσεις, πάνω από το όριο ${BASELINE.max}:\n`)
  for (const h of hits.slice(-12)) console.error(`   ${h.file}:${h.line}  ${h.code}`)
  console.error(`
  Μια ανάγνωση που αγνοεί το \`error\` γυρίζει άδειο και όταν αποτύχει.
  Οπου το άδειο γίνεται ΠΟΣΟ, γράψε εκδοχή που επιστρέφει το σφάλμα
  (δες \`ledgerWithError\`, \`ofPropertyWithError\`) και δείξ' το στην οθόνη.`)
  process.exit(1)
}

const better = BASELINE.max - hits.length
console.log(`✓ ${hits.length} σιωπηλές αναγνώσεις ≤ όριο ${BASELINE.max}`
  + (better > 0 ? `\n   ↓ Βελτίωση κατά ${better}. Κατέβασε το "max" στο scripts/silent-reads-baseline.json στο ${hits.length}.` : ''))
