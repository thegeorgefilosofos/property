#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// GUARD: μία λειτουργία, ένα σημείο.
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΓΙΝΕ ΚΑΙ ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΟΣ Ο ΕΛΕΓΧΟΣ
// Το `parseAmount` υπήρχε σε ΤΡΙΑ αρχεία και το `parseDate` σε άλλα τρία. Δεν
// ήταν αντίγραφα — ήταν διαφορετικές υλοποιήσεις που ΔΙΑΦΩΝΟΥΣΑΝ. Μετρημένα,
// πριν την ενοποίηση:
//
//   parseAmount('1.234')      → 1.234 | 1.234 | 1234   ← χιλιαπλάσια διαφορά
//   parseDate('2026-03-15')   → ok    | ok    | null   ← ISO σιωπηλά αγνοείται
//   parseDate('3/15/2026')    → '2026-15-03' (μήνας 15!)
//   isValidAfm('094 014 201') → false | true           ← έγκυρο ΑΦΜ με κενά
//
// Δηλαδή το ίδιο χαρτί έδινε άλλο ποσό ανάλογα με την οθόνη που το εισήγαγε.
// Κανένα test δεν έπεφτε: κάθε υλοποίηση περνούσε τα ΔΙΚΑ ΤΗΣ tests.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ
// Κάθε όνομα του πίνακα ORIGIN έχει ΜΙΑ υλοποίηση, στο αρχείο που του ανήκει.
// Τα υπόλοιπα αρχεία μπορούν:
//   • να το ΕΠΑΝΕΞΑΓΟΥΝ (`export { x }`) — ο κώδικας παραμένει ένας·
//   • να το ΤΥΛΙΞΟΥΝ, ΑΡΚΕΙ να το εισάγουν από την πηγή και να το καλούν.
//
// Το τύλιγμα είναι υπαρκτή ανάγκη, όχι παραθυράκι: το lib/billing/parse.ts
// κόβει ποσά εκτός ορίων (κανόνας ταιριάσματος, όχι ανάγνωσης), το
// lib/expenses/bulk.ts συμπεραίνει τη χρονιά όταν λείπει, το
// lib/calendar/greekHolidays.ts επιστρέφει Date αντί για κείμενο. Καθένα
// προσθέτει ΤΟ ΔΙΚΟ ΤΟΥ πάνω στην ίδια, μοναδική υλοποίηση.
//
// Αυτό που ΔΕΝ περνά είναι ο ορισμός χωρίς εισαγωγή από την πηγή: εκεί ακριβώς
// γεννιέται η δεύτερη υλοποίηση που θα διαφωνήσει.
//
// ΤΙ ΔΕΝ ΕΠΙΒΑΛΛΕΙ
// Δεν κυνηγά ΚΑΘΕ διπλό όνομα στο repo. Δύο `format()` σε δύο άσχετα αρχεία
// είναι φυσιολογικά. Πιάνει ονομαστικά αυτά που ΜΕΤΡΗΘΗΚΕ ότι διαφώνησαν, και
// αυτά που θα κοστίσουν χρήματα ή δήλωση αν ξαναδιαφωνήσουν.
//
// Τρέξε: node scripts/guard-single-source.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

// Όνομα → το ΜΟΝΑΔΙΚΟ αρχείο που επιτρέπεται να το ορίζει, και γιατί εκεί.
const ORIGIN = {
  parseAmount:    ['lib/core/greek.ts', 'ανάγνωση ελληνικού ποσού — κάτω από κάθε οθόνη'],
  parseDate:      ['lib/core/greek.ts', 'ανάγνωση ημερομηνίας με επαλήθευση ότι υπάρχει'],
  isValidAfm:     ['lib/core/greek.ts', 'άθροισμα ελέγχου ΑΦΜ της ΑΑΔΕ'],
  afmDigits:      ['lib/core/greek.ts', 'καθάρισμα χωριστικών ΑΦΜ πριν τον έλεγχο'],
  normalizePhone: ['lib/core/greek.ts', 'ίδιο τηλέφωνο = ίδιος άνθρωπος'],
  nightsBetween:  ['lib/core/greek.ts', 'νύχτες διαμονής — βάση για έσοδα και τέλη'],
  orthodoxEaster: ['lib/core/greek.ts', 'το Πάσχα μετακινεί ολόκληρη τη σεζόν'],

  declarationDeadline: ['lib/tax/leaseDeclaration.ts', 'προθεσμία δήλωσης μίσθωσης — αλλάζει με τον νόμο, σε ΕΝΑ σημείο'],
  canAddProperty:      ['lib/billing/entitlements.ts', 'πρέπει να συμφωνεί με το enforce_property_limit της βάσης'],
}

// Ονόματα που ΑΠΑΓΟΡΕΥΕΤΑΙ να ξαναγεννηθούν: καταργήθηκαν επειδή σήμαιναν
// διαφορετικό πράγμα σε δύο αρχεία. Η νέα ονομασία λέει τι ακριβώς μετράει.
const RENAMED = {
  hiddenCount: 'χρησιμοποίησε hiddenTabCount (καρτέλες, lib/nav/disclosure.ts) ή hiddenFieldCount (πεδία, lib/property/fields.ts)',
}

const SCAN_DIRS = ['lib', 'app', 'components']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build'])
const EXT = /\.(ts|tsx)$/

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXT.test(name)) out.push(full)
  }
  return out
}

/**
 * Ορισμοί (ΟΧΙ επανεξαγωγές) ενός ονόματος στο αρχείο.
 *
 * Πιάνει `function x`, `const x = …`, `class x` — με ή χωρίς `export`. ΔΕΝ
 * πιάνει το `export { x }` ούτε το `export { x } from '…'`: αυτά δείχνουν σε
 * έναν και μόνο ορισμό, δεν φτιάχνουν δεύτερο.
 */
function definesName(src, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    String.raw`^\s*(?:export\s+)?(?:default\s+)?` +
    String.raw`(?:(?:async\s+)?function\s+${n}\b` +
    String.raw`|(?:const|let|var)\s+${n}\s*[:=]` +
    String.raw`|class\s+${n}\b)`,
    'm',
  )
  return re.test(src)
}

/** Το `from '…'` ενός import, σε διαδρομή σχετική με τη ρίζα του repo. */
function resolveSpec(spec, fileRel) {
  let p
  if (spec.startsWith('@/')) p = spec.slice(2)
  else if (spec.startsWith('.')) p = join(fileRel, '..', spec).split('\\').join('/')
  else return null                              // πακέτο του node_modules
  return p.replace(/\.(ts|tsx|js)$/, '') + '.ts'
}

/**
 * Εισάγει το αρχείο το `name` από το `origin`, με ή χωρίς μετονομασία;
 *
 * Αυτό ξεχωρίζει το ΤΥΛΙΓΜΑ (που καλεί τη μία υλοποίηση) από τη ΔΕΥΤΕΡΗ
 * υλοποίηση (που θα διαφωνήσει με την πρώτη).
 */
function importsFromOrigin(src, fileRel, name, origin) {
  const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  for (const m of src.matchAll(IMPORT)) {
    if (resolveSpec(m[2], fileRel) !== origin) continue
    for (const part of m[1].split(',')) {
      if (part.trim().split(/\s+as\s+/)[0].trim() === name) return true
    }
  }
  return false
}

const problems = []
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split('\\').join('/')
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue
    const src = readFileSync(file, 'utf8')

    for (const [name, [origin, why]] of Object.entries(ORIGIN)) {
      if (rel === origin) continue
      if (definesName(src, name) && !importsFromOrigin(src, rel, name, origin)) {
        problems.push(`${rel}: ορίζει «${name}» χωρίς να το εισάγει από την πηγή του.\n    Ζει στο ${origin} — ${why}.\n    Αν χρειάζεσαι διαφορετική συμπεριφορά, τύλιξέ το: import { ${name} } from '…' και κάλεσέ το.`)
      }
    }
    for (const [name, advice] of Object.entries(RENAMED)) {
      if (definesName(src, name)) {
        problems.push(`${rel}: ορίζει «${name}», που καταργήθηκε ως διφορούμενο.\n    ${advice}.`)
      }
    }
  }
}

// Ο πίνακας ORIGIN πρέπει να λέει την αλήθεια: αν ένα αρχείο-πηγή μετακινηθεί
// και κανείς δεν ενημερώσει εδώ, ο έλεγχος θα περνούσε σιωπηλά χωρίς να
// φυλάει τίποτα.
for (const [name, [origin]] of Object.entries(ORIGIN)) {
  let src
  try { src = readFileSync(join(ROOT, origin), 'utf8') } catch {
    problems.push(`Ο πίνακας ORIGIN δείχνει στο ${origin} για το «${name}», αλλά το αρχείο δεν υπάρχει.`)
    continue
  }
  if (!definesName(src, name)) {
    problems.push(`Ο πίνακας ORIGIN λέει ότι το «${name}» ζει στο ${origin}, αλλά δεν ορίζεται εκεί.`)
  }
}

if (problems.length) {
  console.error('\n✗ Διπλότυπη υλοποίηση — η ίδια λειτουργία σε πάνω από ένα σημείο:\n')
  for (const p of problems) console.error('  • ' + p + '\n')
  console.error(`${problems.length} ${problems.length === 1 ? 'εύρημα' : 'ευρήματα'}. Μία λειτουργία, ένα σημείο.\n`)
  process.exit(1)
}

const counted = Object.keys(ORIGIN).length + Object.keys(RENAMED).length
console.log(`✓ μία πηγή: ${counted} ονόματα ορίζονται από ένα και μόνο σημείο`)
