#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ `total` ΜΙΑΣ ΔΙΑΜΟΝΗΣ ΔΕΝ ΕΙΝΑΙ ΕΣΟΔΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΡΕΙΣ ΑΡΙΘΜΟΙ ΠΟΥ ΔΕΝ ΕΙΝΑΙ Ο ΙΔΙΟΣ ΑΡΙΘΜΟΣ, όπως τους ορίζει το
// lib/clients/stayAmounts.ts:
//
//   τι πλήρωσε ο επισκέπτης      gross_guest_paid
//   − τέλος ανθεκτικότητας       climate_levy      δεν είναι έσοδό σου
//   ─────────────────────────────────────────────
//   = ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ         αυτό πάει στο Ε2 και στην κλίμακα
//   − προμήθεια πλατφόρμας       platform_fee      ΔΑΠΑΝΗ, όχι μείωση εσόδου
//   ─────────────────────────────────────────────
//   = PAYOUT                     αυτό μπαίνει στον λογαριασμό σου
//
// Το `client_stays.total` είναι το ένα Η το άλλο και ποιο από τα δύο το λέει
// η στήλη `amount_basis`. Οποιος το διαβάσει ωμά ως έσοδο δηλώνει λιγότερα.
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΦΥΛΑΚΑ. Το TabAccounting έγραφε `amount: s.total`
// ως έσοδο βραχυχρόνιας, ΚΑΙ τρεις γραμμές πιο κάτω πρόσθετε την ίδια
// προμήθεια ως δαπάνη. Οταν το `amount_basis` ήταν «payout», η προμήθεια
// αφαιρούνταν ΔΥΟ ΦΟΡΕΣ, ακριβώς στις κρατήσεις που έχουν ανάλυση, δηλαδή
// στις εισαγόμενες από πλατφόρμα.
//
// Το λάθος έφτανε στις «Κινήσεις», στο ταμειακό γράφημα και μέσω του βιβλίου
// στο ΠΡΩΤΟ ΦΥΛΛΟ του φακέλου του λογιστή, όπου διαφωνούσε με την «Κατάσταση
// αποτελεσμάτων» του διπλανού φύλλου κατά ολόκληρη την προμήθεια. Ενα βιβλίο
// που αντιφάσκει με τον εαυτό του στο εξώφυλλο δεν διορθώνεται· απορρίπτεται.
//
// Η ΣΩΣΤΗ ΓΡΑΦΗ ΥΠΗΡΧΕ ΗΔΗ, στο JournalExport: `declarableGrossOrTotal(s)`.
// Δεν έλειπε γνώση, έλειπε καλώδιο.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

const FILES = [
  ...globSync('app/**/*.{ts,tsx}'),
  ...globSync('lib/**/*.ts'),
  ...globSync('components/**/*.{ts,tsx}'),
].filter(f => !/\.test\.ts$/.test(f) && !/lib\/clients\/(clients|stayAmounts)\.ts$/.test(f))

// Ονομα μεταβλητής που φαίνεται να είναι διαμονή, με `.total` πάνω του, μέσα σε
// έκφραση που μιλά για έσοδο ή ποσό.
//
// Το σκέτο `b` ΔΕΝ είναι εδώ επίτηδες: πιάνει συσσωρευτές τύπου
// `b.total += amount` (lib/expenses/compare.ts) που δεν έχουν καμία σχέση με
// διαμονές. Ενας φύλακας που κράζει άδικα μαθαίνει τον κόσμο να τον παρακάμπτει.
const RE = /\b(s|st|stay|booking)\.total\b/g

/**
 * Οσα σημεία διαβάζουν το `total` ΓΙΑ ΑΛΛΟ ΛΟΓΟ και όχι ως έσοδο.
 * Καθένα με τον λόγο του, ώστε ο κατάλογος να μη γίνει σκουπιδότοπος.
 */
const ALLOWED = {
  'lib/clients/stayAmounts.ts': 'εδώ ορίζεται η διάκριση',
  'lib/data/stays.ts': 'επίπεδο δεδομένων: γράφει και διαβάζει τη στήλη αυτούσια',
  'lib/calendar/stayBars.ts': 'εμφάνιση ποσού σε μπάρα ημερολογίου, όχι λογιστική',
}

const hits = []
for (const file of FILES) {
  if (file in ALLOWED) continue
  const src = readFileSync(file, 'utf8')
  if (!src.includes('.total')) continue
  const lines = src.split('\n')
  let block = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (block) { if (line.includes('*/')) block = false; continue }
    if (/^\s*(\/\/|\*)/.test(line)) continue
    if (/^\s*\/\*/.test(line)) { if (!line.includes('*/')) block = true; continue }
    if (!RE.test(line)) { RE.lastIndex = 0; continue }
    RE.lastIndex = 0
    // Μας ενδιαφέρει μόνο όταν γίνεται ΕΣΟΔΟ ή μπαίνει σε άθροισμα ποσών.
    if (!/\b(amount|income|incomes|revenue|έσοδ|gross)\b/i.test(line)) continue
    hits.push({ file, line: i + 1, text: line.trim().slice(0, 120) })
  }
}

if (hits.length) {
  console.error(`✗ ${hits.length} ${hits.length === 1 ? 'σημείο διαβάζει' : 'σημεία διαβάζουν'} το ωμό total διαμονής ως έσοδο.\n`)
  console.error('  Οταν το amount_basis είναι «payout», το total είναι ΗΔΗ καθαρό από την')
  console.error('  προμήθεια. Αν η προμήθεια μπαίνει και ως δαπάνη, αφαιρείται δύο φορές,')
  console.error('  και το βιβλίο του λογιστή αντιφάσκει με τον εαυτό του.\n')
  for (const h of hits) console.error(`  ${h.file}:${h.line}\n    ${h.text}`)
  console.error('\n  ΔΙΟΡΘΩΣΗ: declarableGrossOrTotal(s) από το lib/clients/stayAmounts.ts.')
  console.error('  Αν το σημείο ΔΕΝ αφορά έσοδο, δήλωσέ το στο ALLOWED εδώ, με τον λόγο.')
  process.exit(1)
}

console.log(`✓ κανένα ωμό total διαμονής δεν γίνεται έσοδο σε ${FILES.length} αρχεία`)
