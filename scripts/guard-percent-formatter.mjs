#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΟΣΟΣΤΟ ΠΟΥ ΞΕΦΥΓΕ ΑΠΟ ΤΟΝ ΜΟΡΦΟΠΟΙΗΤΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο φύλακας των ελληνικών αριθμών πιάνει το `toFixed` και το `toLocaleString`
// χωρίς locale. Δεν πιάνει τη ΣΙΩΠΗΛΗ εκδοχή: έναν αριθμό που στρογγυλοποιήθηκε
// αλλού και μπαίνει ωμός σε κείμενο, με ένα `%` κολλητά δίπλα.
//
//     {`${occ.pct}%`}        →  «87.5%»
//     {fp(occ.pct)}          →  «87,50%»
//
// Η πρώτη γραμμή έζησε στην καρτέλα Πελατών, δίπλα σε ποσά «1.234,56 €» της
// ΙΔΙΑΣ κάρτας. Δύο συστήματα αρίθμησης σε ένα πλαίσιο — και στα ελληνικά η
// τελεία χωρίζει ΧΙΛΙΑΔΕΣ, οπότε το «87.5» επιδέχεται δεύτερη ανάγνωση.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ. Η πρώτη μέτρηση βρήκε 79 σημεία, τα
// περισσότερα ακέραια ποσοστά («24%», «80%») που διαβάζονται το ίδιο και με
// τους δύο τρόπους. Μια μαζική διόρθωση εβδομήντα εννέα σημείων — τα μισά σε
// πρότυπα email που δεν βλέπει καμία δοκιμή — είναι ακριβώς η αλλαγή που
// σπάει οθόνες σιωπηλά. Το υπάρχον χρέος επιτρέπεται, το ΝΕΟ όχι.
//
// ΟΤΑΝ ΚΑΘΑΡΙΖΕΙΣ: κατέβασε το `max` στο scripts/percent-baseline.json.
//
// ΤΙ ΔΕΝ ΕΙΝΑΙ ΠΟΣΟΣΤΟ. Το `%` του SQL LIKE (`\`${prefix}%\``), το `%` ως
// μονάδα μήκους σε CSS (`width`, `color-mix`) και οι ίδιοι οι μορφοποιητές.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

const BASELINE = JSON.parse(readFileSync('scripts/percent-baseline.json', 'utf8'))

// Ενα interpolation με `%` αμέσως μετά, μέσα σε template literal.
const PCT = /\$\{([^{}]{1,120})\}%/g
// Οι εγκεκριμένοι μορφοποιητές ποσοστού της εφαρμογής και των edge functions.
const OK_FN = /\b(?:fp|fpOr|feRate|fmtPct|fmtPct1|pct|percent)\s*\(/
// Το `%` ως μονάδα μήκους ή ως στάθμη ανάμειξης χρώματος: CSS, όχι κείμενο.
const CSS_LINE = /\b(?:color-mix|width|height|left|right|top|bottom|inset|translate|flexBasis|gridTemplate|background|stroke|offset|clip|mask|transform|padding|margin)\b/i
// Το `%` ως μπαλαντέρ του SQL LIKE/ILIKE.
const SQL_LINE = /\.i?like\s*\(|\.i?match\s*\(/i
// Οι μορφοποιητές δεν ελέγχουν τον εαυτό τους.
const SELF = ['lib/core/format.ts', 'components/tokens.ts', 'supabase/functions/_shared/format.ts']

const findings = []
for (const f of findSources()) {
  if (f.includes('.test.')) continue
  if (f.startsWith('scripts/')) continue            // εργαλεία κονσόλας, όχι οθόνη
  if (SELF.some(x => f.endsWith(x))) continue
  const lines = readFileSync(f, 'utf8').split('\n')
  let inBlockComment = false
  lines.forEach((line, i) => {
    const t = line.trim()
    // Σχόλια — και τα σχόλια JSX (`{/* … */}`), όπου ζει συχνά το ΠΑΡΑΔΕΙΓΜΑ
    // του λάθους που μόλις διορθώθηκε· θα το ανέφερε ως λάθος.
    if (inBlockComment) { if (t.includes('*/')) inBlockComment = false; return }
    if (t.startsWith('/*') || t.startsWith('{/*')) { if (!t.includes('*/')) inBlockComment = true; return }
    if (t.startsWith('//') || t.startsWith('*')) return
    if (CSS_LINE.test(line) || SQL_LINE.test(line)) return
    for (const m of line.matchAll(PCT)) {
      if (OK_FN.test(m[1])) continue
      findings.push(`${f}:${i + 1}  \${${m[1].trim().slice(0, 70)}}%`)
    }
  })
}

if (findings.length > BASELINE.max) {
  console.error(`✗ ${findings.length} ποσοστά χωρίς μορφοποιητή, πάνω από το όριο ${BASELINE.max}:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error('\n  Στα ελληνικά το ποσοστό είναι «87,50%». Πέρασέ το από fp().')
  process.exit(1)
}
if (findings.length < BASELINE.max) {
  console.log(`✓ ${findings.length} ποσοστά χωρίς μορφοποιητή (όριο ${BASELINE.max}) — κατέβασε το όριο στο scripts/percent-baseline.json`)
} else {
  console.log(`✓ ${findings.length} ποσοστά χωρίς μορφοποιητή, στο όριο — κανένα νέο`)
}
