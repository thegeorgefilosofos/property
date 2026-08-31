#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΜΙΑ ΠΑΥΛΑ ΣΤΗ ΘΕΣΗ ΤΙΜΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Η παύλα δεν είναι λέξη ούτε αριθμός: δεν διαβάζεται, δεν στοιχίζεται και σε
// στήλη ποσών τρυπάει τη γραμμή. Δέκα σειρές «1.234,50 €» και μία «—» δεν
// διαβάζονται ως πίνακας.
//
// Χειρότερα, σε τρία σημεία η ίδια παύλα χρησίμευε ΚΑΙ ως σημάδι λογικής
// (`cA !== '—'`). Ένα σύμβολο οθόνης που κρίνει διακλαδώσεις σπάει σιωπηλά τη
// στιγμή που κάποιος αλλάξει το κείμενο — και έτσι ακριβώς έσπασε, μέσα σε
// αυτή τη δουλειά, ώσπου το έπιασε ο έλεγχος τύπων.
//
// ΤΙ ΜΠΑΙΝΕΙ ΣΤΗ ΘΕΣΗ ΤΗΣ
//   · ποσό     → fe(0)        «0,00 €»
//   · ποσοστό  → fp(0)        «0,00%»
//   · κείμενο  → ABSENT       «Δεν έχει οριστεί»
//   · ημερομηνία → ABSENT_DATE «Χωρίς ημερομηνία»
//   · άγνωστο στοιχείο τρίτου (π.χ. επιτόκιο τράπεζας που δεν έχουμε) → δική
//     του φράση· εκεί το μηδέν θα ΕΛΕΓΕ ψέματα («δανείζει με 0%»).
//
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΤΕΙΧΟΣ. Ό,τι απομένει είναι καταγεγραμμένο και δεν επιτρέπεται
// να μεγαλώσει. Ένας φύλακας που απαιτεί να λυθούν όλα σήμερα παρακάμπτεται αύριο.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Τα email των cron γράφουν δικό τους HTML και έμεναν έξω: εκεί η παύλα καθόταν
// στη στήλη μεταβολής κάθε εβδομαδιαίας ενημέρωσης επιτοκίων.
const ROOTS = ['app', 'components', 'supabase/functions']
const BASELINE = 'scripts/dashes-baseline.json'

function walk(dir, out) {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) out.push(full)
  }
}

const files = []
for (const r of ROOTS) walk(r, files)

const hits = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  src.split('\n').forEach((line, i) => {
    // Η παύλα ΩΣ ΤΙΜΗ: σε εισαγωγικά μόνη της, ή ως κείμενο κόμβου.
    // Η παύλα μέσα σε πρόταση («Ιανουάριος — Μάρτιος») είναι τυπογραφία, όχι τιμή.
    for (const m of line.matchAll(/'—'|"—"|>—</g)) {
      hits.push({ file: f, line: i + 1, col: m.index + 1 })
    }
  })
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { max: hits.length }
if (hits.length > base.max) {
  console.error(`✗ ${hits.length} παύλες σε θέση τιμής > όριο ${base.max}.\n`)
  console.error('  Η παύλα δεν είναι ούτε λέξη ούτε αριθμός: σπάει τη στοίχηση της στήλης.')
  console.error('  Ποσό → fe(0) · ποσοστό → fp(0) · κείμενο → ABSENT · ημερομηνία → ABSENT_DATE\n')
  for (const h of hits.slice(0, 20)) console.error(`  ${h.file}:${h.line}`)
  process.exit(1)
}
console.log(`✅ Παύλες: ${hits.length} σε θέση τιμής ≤ όριο ${base.max}.`)
