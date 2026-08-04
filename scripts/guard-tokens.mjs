#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ var(--x) ΠΟΥ ΖΗΤΑΜΕ ΠΡΕΠΕΙ ΝΑ ΥΠΑΡΧΕΙ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ (Αύγουστος 2026): επτά ονόματα token ζητούνταν από
// τον κώδικα χωρίς να έχουν οριστεί ποτέ στο globals.css. Τα δύο έκαναν
// πραγματική ζημιά:
//
//   --text-hero   Ζητιόταν ΧΩΡΙΣ εφεδρική τιμή στον κύριο υπότιτλο της
//                 αρχικής σελίδας. Όταν ένα var() δεν λύνεται και δεν έχει
//                 fallback, η δήλωση είναι άκυρη και ο browser την πετάει.
//                 Το κείμενο έβγαινε στο χρώμα που κληρονομούσε — δηλαδή σε
//                 λάθος χρώμα, στην πρώτη οθόνη που βλέπει ο επισκέπτης.
//
//   --text-muted  Ζητιόταν στη σελίδα σφάλματος με fallback #5f6368. Επειδή
//                 το token δεν υπήρχε, το fallback ίσχυε ΠΑΝΤΑ — και στο
//                 σκούρο θέμα δίνει αντίθεση 2.66:1 πάνω στο #202124, κάτω
//                 από το όριο 4.5:1. Η σελίδα που εξηγεί τι πήγε στραβά ήταν
//                 η ίδια δυσανάγνωστη.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΝΕ ΤΙΠΟΤΑ: δεν κρασάρει τίποτα, δεν βγάζει προειδοποίηση
// ο TypeScript, δεν το βλέπει ο linter. Το CSS αγνοεί σιωπηλά ό,τι δεν
// καταλαβαίνει — ακριβώς το είδος του σφάλματος που φτάνει στην παραγωγή.
//
// ΓΙΑΤΙ ΑΠΑΓΟΡΕΥΣΗ ΚΑΙ ΟΧΙ ΚΑΣΤΑΝΙΑ: εδώ δεν υπάρχει «υπαρκτό χρέος» να
// ανεχθούμε. Ένα token είτε ορίζεται είτε είναι τυπογραφικό λάθος. Το χρέος
// ήταν επτά ονόματα, καθαρίστηκαν όλα, και το όριο είναι μηδέν από την αρχή.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const CSS = join(ROOT, 'app/globals.css')
const SCAN = ['app', 'components', 'lib']
const EXT = /\.(tsx|ts|css)$/

// Ονόματα που ορίζονται κατά την ΕΚΤΕΛΕΣΗ από JavaScript, όχι στο stylesheet.
// Δεν είναι χρέος: είναι δυναμικές τιμές ανά καρέ ή ανά στοιχείο, και κάθε
// χρήση τους έχει εφεδρική τιμή για την πρώτη απόδοση.
const RUNTIME = [
  { name: '--sx', why: 'θέση δείκτη, την γράφει το app/Spotlight.tsx ανά καρέ' },
  { name: '--sy', why: 'θέση δείκτη, την γράφει το app/Spotlight.tsx ανά καρέ' },
]

function walk(dir, acc = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return acc }
  for (const name of entries) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, acc)
    } else if (EXT.test(name)) acc.push(p)
  }
  return acc
}

// ── Τι ορίζεται ───────────────────────────────────────────────────────────
const css = readFileSync(CSS, 'utf8')
const defined = new Set([...css.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map(m => m[1]))
for (const r of RUNTIME) defined.add(r.name)

// ── Τι ζητείται ───────────────────────────────────────────────────────────
// Κρατάμε και το αν η χρήση είχε εφεδρική τιμή: χωρίς fallback η δήλωση
// πετιέται ολόκληρη, που είναι αυστηρά χειρότερο από λάθος απόχρωση.
const missing = new Map()
for (const file of SCAN.flatMap(d => walk(join(ROOT, d)))) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)\s*(,)?/g)) {
      const [, name, comma] = m
      if (defined.has(name)) continue
      if (!missing.has(name)) missing.set(name, [])
      missing.get(name).push({
        where: `${relative(ROOT, file)}:${i + 1}`,
        hasFallback: Boolean(comma),
      })
    }
  })
}

// ── Ετυμηγορία ────────────────────────────────────────────────────────────
if (missing.size === 0) {
  console.log(`✅ Φύλακας tokens πέρασε — κάθε var(--x) που ζητείται ορίζεται (${defined.size} tokens).`)
  process.exit(0)
}

console.error('❌ Tokens που ζητούνται αλλά δεν ορίζονται πουθενά:\n')
let fatal = 0
for (const [name, uses] of [...missing].sort()) {
  const noFallback = uses.filter(u => !u.hasFallback)
  fatal += noFallback.length
  console.error(`  ${name}  (${uses.length} χρήσεις)`)
  for (const u of uses) {
    console.error(`      ${u.where}${u.hasFallback ? '' : '   ← ΧΩΡΙΣ εφεδρική: η δήλωση πετιέται ολόκληρη'}`)
  }
}
console.error(`
  Διόρθωσε με έναν από τους δύο τρόπους:
    • δείξε σε υπαρκτό token (προτιμότερο — λιγότερα tokens, πιο ομοιόμορφο)
    • ή όρισέ το στο app/globals.css ΚΑΙ στα δύο θέματα, light και dark

  Αν η τιμή γράφεται από JavaScript κατά την εκτέλεση, πρόσθεσέ το στη λίστα
  RUNTIME αυτού του αρχείου, με τον λόγο.
${fatal ? `\n  ${fatal} από αυτές δεν έχουν καν εφεδρική τιμή.` : ''}`)
process.exit(1)
