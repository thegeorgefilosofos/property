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
//
// ΟΧΙ ΜΟΝΟ ΤΟ globals.css. Ο φύλακας κοίταζε αποκλειστικά εκεί, και κατήγγειλε
// ως αόριστα τα επτά `--ge-*` της σελίδας σφάλματος ρίζας. Εκείνη τα ορίζει
// ΜΕΣΑ ΤΗΣ, σε ένα <style> — υποχρεωτικά, γιατί αντικαθιστά ΟΛΟΚΛΗΡΟ το δέντρο
// μαζί με το layout που φορτώνει το θέμα: όταν αποδίδεται, το globals.css δεν
// έχει φορτώσει. Ένας φύλακας που κοκκινίζει για το ΜΟΝΟ σημείο όπου ο κανόνας
// δεν μπορεί να ισχύσει, μαθαίνει τον επόμενο να τον αγνοεί.
//
// Ο κανόνας μένει ο ίδιος: κάθε token που ζητείται πρέπει να ορίζεται ΚΑΠΟΥ.
// Απλώς το «κάπου» περιλαμβάνει και τα φύλλα στυλ που γράφει η ίδια η οθόνη.
const css = readFileSync(CSS, 'utf8')
const defined = new Set([...css.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map(m => m[1]))
for (const r of RUNTIME) defined.add(r.name)

// ── Τι ζητείται ───────────────────────────────────────────────────────────
// Κρατάμε και το αν η χρήση είχε εφεδρική τιμή: χωρίς fallback η δήλωση
// πετιέται ολόκληρη, που είναι αυστηρά χειρότερο από λάθος απόχρωση.
const missing = new Map()
const FILES = SCAN.flatMap(d => walk(join(ROOT, d)))
// Πρώτο πέρασμα: ό,τι ορίζεται μέσα σε <style> ή σε συμβολοσειρά CSS αρχείου
// .tsx μετράει ως ορισμένο, όπως ακριβώς και στο globals.css.
for (const file of FILES) {
  if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue
  for (const block of readFileSync(file, 'utf8').matchAll(/:root[^{]*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)) defined.add(d[1])
  }
}
for (const file of FILES) {
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

// ── Δεύτερος έλεγχος: ΕΝΑ κλειδί αποθήκευσης για το θέμα ──────────────────
// Το κουμπί εναλλαγής κρατούσε δικό του κλειδί, 'pos-theme' με παύλα, ενώ το
// script πριν το πρώτο paint και το ThemeProvider διάβαζαν 'pos_mode' με κάτω
// παύλα. Κανείς δεν διάβαζε το κλειδί του κουμπιού. Αποτέλεσμα: όποιος διάλεγε
// φωτεινό το έχανε στην επόμενη ανανέωση, με ορατό τρεμόπαιγμα στον δρόμο —
// και το σκούρο «κολλούσε» από συνθήκη αγώνα, όχι από σχεδιασμό.
//
// Δεν το έπιανε κανένα test: και τα δύο κλειδιά είναι έγκυρα strings.
const THEME_KEYS_OK = new Set(['pos_mode', 'pos_theme'])
const THEME_KEY_OWNERS = ['app/layout.tsx', 'app/ThemeProvider.tsx']
const strayKeys = []
for (const file of SCAN.flatMap(d => walk(join(ROOT, d)))) {
  const rel = relative(ROOT, file)
  const src = readFileSync(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*['"]([^'"]+)['"]/g)) {
      const key = m[1]
      if (!/theme|mode/i.test(key)) continue          // μόνο κλειδιά θέματος
      const known = THEME_KEYS_OK.has(key)
      const owner = THEME_KEY_OWNERS.includes(rel)
      if (!known || !owner) strayKeys.push({ key, where: `${rel}:${i + 1}`, known })
    }
  })
}

// ── Ετυμηγορία ────────────────────────────────────────────────────────────
if (missing.size === 0 && strayKeys.length === 0) {
  console.log(`✅ Φύλακας tokens πέρασε — κάθε var(--x) που ζητείται ορίζεται (${defined.size} tokens), ένα κλειδί θέματος.`)
  process.exit(0)
}

if (strayKeys.length) {
  console.error('❌ Το θέμα αποθηκεύεται από περισσότερα από ένα σημεία:\n')
  for (const s of strayKeys) {
    console.error(`  ${s.where}  →  '${s.key}'${s.known ? '  (σωστό κλειδί, λάθος αρχείο)' : '  ← ΑΓΝΩΣΤΟ κλειδί: κανείς άλλος δεν το διαβάζει'}`)
  }
  console.error(`
  Το θέμα το κρατούν ΜΟΝΟ: ${THEME_KEY_OWNERS.join(', ')}
  με κλειδιά: ${[...THEME_KEYS_OK].join(', ')}

  Κάθε άλλο component διαβάζει και γράφει μέσω του useTheme() — αλλιώς το
  pre-paint script και το React διαφωνούν, και η επιλογή του χρήστη χάνεται.
`)
  if (missing.size === 0) process.exit(1)
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
