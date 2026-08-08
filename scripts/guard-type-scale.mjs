#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΣΤΑΝΙΑ ΤΥΠΟΓΡΑΦΙΑΣ — το μέγεθος εκτός κλίμακας μόνο να μειώνεται
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ (Αύγουστος 2026): 2.715 δηλώσεις `fontSize` γραμμένες
// απευθείας σε app/ και components/, με **23 διαφορετικά μεγέθη** — τη στιγμή
// που η τυπογραφική κλίμακα του έργου (`TT` στο components/tokens.ts) ορίζει
// οκτώ, και τα ορίζει με λόγο.
//
// ΕΙΝΑΙ ΑΚΡΙΒΩΣ Η ΙΔΙΑ ΔΙΑΓΝΩΣΗ ΜΕ ΤΟ ΧΡΩΜΑ, και το STRATEGY.md την έχει ήδη
// γράψει για εκείνο: «το σχεδιαστικό σύστημα υπήρχε ήδη και ήταν σωστό. Απλώς
// δεν επιβαλλόταν». Ένα μέγεθος που δεν ανήκει στην κλίμακα δεν σπάει τίποτα —
// απλώς η επόμενη οθόνη διαβάζεται λίγο αλλιώς από την προηγούμενη, και ο
// χρήστης δεν μαθαίνει ποτέ την ιεραρχία.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΠΡΑΓΜΑΤΙΚΟ ΚΑΙ ΟΧΙ ΓΟΥΣΤΟ:
//   • Πέντε σημεία έγραφαν `fontSize: 7`. Επτά εικονοστοιχεία δεν διαβάζονται
//     από κανέναν πάνω από σαράντα — και ο «50χρονος που τον αγχώνει ο
//     λογιστής» είναι ΡΗΤΑ ένα από τα τρία πρόσωπα της στρατηγικής.
//   • Τέσσερα μεγέθη (32, 34, 40, 46) χρησιμοποιούνται μία ως τέσσερις φορές
//     το καθένα. Δεν είναι κλίμακα· είναι απόφαση της στιγμής.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ: μια μαζική αλλαγή 2.715 μεγεθών είναι
// ακριβώς το είδος της αλλαγής που σπάει οθόνες χωρίς να το δει κανείς. Το
// υπάρχον χρέος επιτρέπεται, το ΝΕΟ όχι.
//
// ΟΤΑΝ ΚΑΘΑΡΙΖΕΙΣ: κατέβασε το `maxOffScale` στο scripts/type-scale-baseline.json.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SCAN = ['app', 'components']

/**
 * Η κλίμακα, όπως την ορίζει το `TT` και το `T.sp`.
 *
 * Το 14, το 15 και το 9 δεν είναι στο `TT` αλλά χρησιμοποιούνται εκατοντάδες
 * φορές σε πυκνούς πίνακες και μικροετικέτες: μπαίνουν ρητά ώστε η καστάνια να
 * μετρά ΑΠΟΚΛΙΣΗ, όχι θόρυβο. Ο σκοπός δεν είναι να βγει το νούμερο μικρό —
 * είναι να μη μεγαλώσει.
 */
const SCALE = new Set([9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28])

/** Κάτω από αυτό δεν διαβάζει άνθρωπος. Απόλυτος κανόνας, όχι καστάνια. */
const FLOOR = 9

const BASELINE = 'scripts/type-scale-baseline.json'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(e)) out.push(p)
  }
  return out
}

const offScale = []
const tooSmall = []
for (const dir of SCAN) {
  for (const f of walk(dir)) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => {
      if (/^\s*(\/\/|\*)/.test(l)) return                    // σχόλιο, όχι κώδικας
      for (const m of l.matchAll(/fontSize:\s*(\d+)\b/g)) {
        const n = Number(m[1])
        if (n < FLOOR) tooSmall.push({ file: f, line: i + 1, size: n })
        else if (!SCALE.has(n)) offScale.push({ file: f, line: i + 1, size: n })
      }
    })
  }
}

// ── ΤΟ ΔΑΠΕΔΟ ΕΙΝΑΙ ΑΠΟΛΥΤΟ ────────────────────────────────────────────────
if (tooSmall.length) {
  console.error(`🔴 ${tooSmall.length} κείμενα κάτω από ${FLOOR} εικονοστοιχεία.\n`)
  console.error('   Δεν διαβάζονται. Ο «50χρονος που τον αγχώνει ο λογιστής» είναι ρητά')
  console.error('   ένα από τα τρία πρόσωπα της στρατηγικής — και δεν βλέπει επτά pixel.\n')
  for (const t of tooSmall) console.error(`     ${t.file}:${t.line}  fontSize: ${t.size}`)
  process.exit(1)
}

const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { maxOffScale: offScale.length }
const cap = baseline.maxOffScale

if (offScale.length > cap) {
  const bySize = {}
  for (const o of offScale) (bySize[o.size] ||= []).push(o)
  console.error(`🔴 Καστάνια τυπογραφίας ΑΠΕΤΥΧΕ — ${offScale.length} μεγέθη εκτός κλίμακας > όριο ${cap}.\n`)
  console.error('   Η κλίμακα ζει στο `TT` (components/tokens.ts) και έχει λόγο. Ένα μέγεθος')
  console.error('   που δεν ανήκει σε αυτήν δεν σπάει τίποτα — απλώς η επόμενη οθόνη')
  console.error('   διαβάζεται αλλιώς από την προηγούμενη, και η ιεραρχία δεν μαθαίνεται ποτέ.\n')
  console.error(`   Επιτρεπτά: ${[...SCALE].sort((a, b) => a - b).join(', ')}\n`)
  for (const size of Object.keys(bySize).sort((a, b) => bySize[b].length - bySize[a].length).slice(0, 6)) {
    console.error(`     fontSize ${size} — ${bySize[size].length}×, π.χ. ${bySize[size][0].file}:${bySize[size][0].line}`)
  }
  process.exit(1)
}

console.log(`✅ Καστάνια τυπογραφίας πέρασε — ${offScale.length} εκτός κλίμακας ≤ όριο ${cap}, κανένα κάτω από ${FLOOR}px.`)
if (offScale.length < cap) {
  console.log(`   ↓ Βελτίωση κατά ${cap - offScale.length}. Κατέβασε το "maxOffScale" στο ${BASELINE} στο ${offScale.length}.`)
}
