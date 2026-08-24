#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η POSTGRES ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΣΒΗΣΕΙ ΑΡΧΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΠΙΑΣΜΕΝΟ ΣΕ ΠΡΑΓΜΑΤΙΚΗ ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ (24/08/2026). Η
// `erase_account` έγραφε `delete from storage.objects`. Η Supabase το εμποδίζει
// με σκανδάλη και το λέει καθαρά:
//
//   42501  Direct deletion from storage tables is not allowed.
//          Use the Storage API instead.
//
// Η εξαίρεση πιανόταν και καταγραφόταν, οπότε η διαγραφή προχωρούσε κανονικά.
// Δηλαδή ο λογαριασμός έφευγε, κάθε γραμμή του έφευγε, και ΚΑΘΕ ΑΡΧΕΙΟ ΕΜΕΝΕ:
// μισθωτήρια, ταυτότητες, παραστατικά, φωτογραφίες βλαβών. Επί εννέα ημέρες, σε
// δύο διαφορετικές διαδρομές, με μήνυμα που έλεγε «διαγράφηκαν».
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΣΕ ΤΟ db-replay. Εκείνο τρέχει γυμνό Postgres. Η σκανδάλη
// ζει στην πλατφόρμα της Supabase και δεν υπάρχει στη σκαλωσιά, οπότε τοπικά το
// `delete` περνούσε καθαρό. Ενα σφάλμα που εμφανίζεται ΜΟΝΟ στην παραγωγή δεν
// έχει άλλον φύλακα από την ανάγνωση του κειμένου.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ. Καμία μετανάστευση δεν γράφει `delete from storage.objects`.
// Ο δρόμος είναι το API αποθήκευσης: είτε από τη διαδρομή με τη συνεδρία του
// χρήστη, είτε από την ουρά `storage_purge_queue` και τη συνάρτηση άκρης
// `purge-orphan-files` με ρόλο υπηρεσίας.
//
// ΤΟ `select` ΕΠΙΤΡΕΠΕΤΑΙ. Το να ΔΙΑΒΑΣΕΙ η βάση ποια αρχεία υπάρχουν είναι
// ακριβώς αυτό που κρατά την ουρά ειλικρινή.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const HIT = /\bdelete\s+from\s+storage\.objects\b/gi

/**
 * ΟΙ ΠΕΝΤΕ ΠΟΥ ΕΓΡΑΨΑΝ ΤΟ ΛΑΘΟΣ ΠΡΙΝ ΓΙΝΕΙ ΓΝΩΣΤΟ. Δεν διορθώνονται: μια
 * μετανάστευση που έχει ήδη τρέξει στην παραγωγή είναι ιστορία, και η
 * επανεγγραφή της αλλάζει αυτό που παράγει μια αναπαραγωγή από το μηδέν. Και
 * οι πέντε αντικαταστάθηκαν από το 20260824110000, που τις ξαναγράφει με ουρά.
 * Ο κατάλογος μόνο μικραίνει: κάθε νέο όνομα εδώ σημαίνει νέο χρέος.
 */
const HISTORY = new Set([
  '00000000000000_baseline.sql',
  '20260805070000_accountant_portal_and_account_deletion.sql',
  '20260815130000_account_deletion_tells_the_truth.sql',
  '20260818100000_i_diagrafi_ftanei_kai_stin_oura.sql',
  '20260823140000_o_logariasmos_choris_syndromi_den_menei_gia_panta.sql',
])

const findings = []
for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  if (HISTORY.has(file)) continue
  const sql = readFileSync(join(DIR, file), 'utf8')
  // Τα σχόλια έξω: αυτό το σφάλμα ΠΕΡΙΓΡΑΦΕΤΑΙ σε σχόλια, και σωστά.
  const lines = sql.split('\n')
  lines.forEach((line, i) => {
    if (line.trim().startsWith('--')) return
    if (HIT.test(line)) findings.push(`${DIR}/${file}:${i + 1}`)
    HIT.lastIndex = 0
  })
}

if (findings.length) {
  console.error(`✗ ${findings.length} σημεία σβήνουν αρχεία μέσα από τη βάση:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error(`
  Η Supabase το απαγορεύει (42501) και η προσπάθεια αφήνει ΟΛΑ τα αρχεία πίσω.
  Γράψε τα ονόματα στην public.storage_purge_queue και άφησε τη συνάρτηση άκρης
  purge-orphan-files να τα σβήσει μέσω του API αποθήκευσης.
`)
  process.exit(1)
}
console.log('✓ καμία μετανάστευση δεν σβήνει αρχεία μέσα από τη βάση')
