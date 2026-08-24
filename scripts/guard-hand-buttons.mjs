#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΔΙΑΚΟΣΙΑ ΕΠΤΑ ΚΟΥΜΠΙΑ ΖΩΓΡΑΦΙΣΜΕΝΑ ΞΑΝΑ ΑΠΟ ΤΗΝ ΑΡΧΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΟΥΜΠΙ ΥΠΑΡΧΕΙ. Το `Btn` (components/Theme.tsx) ξέρει τρεις ρόλους, ξέρει
// το ελάχιστο ύψος αφής των 44 εικονοστοιχείων, και αφήνει την ΟΨΗ στο CSS
// ώστε η αιώρηση, το πάτημα και η εστίαση με πληκτρολόγιο να δουλεύουν. Το
// χρησιμοποιούν 191 σημεία.
//
// ΤΙ ΜΕΤΡΗΘΗΚΕ (24/08/2026). Άλλα 207 `<button>` γράφουν το δικό τους style
// ενσωματωμένα. Ενσωματωμένο style κερδίζει κάθε κανόνα κλάσης: όσο το χρώμα
// γράφεται εκεί, κανένα `:hover` και κανένα `:focus-visible` δεν μπορεί να
// ισχύσει. Γι' αυτό δίπλα τους ζουν 310 χειροκίνητοι `onMouseEnter`, που δεν
// ξέρουν τι είναι εστίαση με πληκτρολόγιο και τι είναι οθόνη αφής.
//
// ΚΑΙ ΤΟ ΥΨΟΣ. Το `Btn` ανεβάζει μόνο του στα 44 όταν ο δείκτης είναι δάχτυλο.
// Ένα γραμμένο `padding: '9px 18px'` δίνει ύψος 38 και μένει 38 στο κινητό:
// στόχος κάτω από το ελάχιστο, δηλαδή πάτημα που αστοχεί.
//
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ. Υπάρχουν κουμπιά που δεν είναι κουμπιά του θέματος:
// ένα «×» πάνω σε κάρτα, ένα κελί ημερολογίου, ένα χρωματιστό δείγμα. Ο κανόνας
// είναι «ούτε ένα παραπάνω», και το όριο κατεβαίνει σε κάθε πέρασμα.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'

const BASELINE = JSON.parse(readFileSync('scripts/hand-buttons-baseline.json', 'utf8'))

/**
 * Η ΕΤΙΚΕΤΑ ΔΙΑΒΑΖΕΤΑΙ ΟΛΟΚΛΗΡΗ, ΓΙΑΤΙ ΤΟ `style` ΕΙΝΑΙ ΣΥΧΝΑ ΤΡΕΙΣ ΓΡΑΜΜΕΣ
 * ΠΙΟ ΚΑΤΩ. Ένα regex πάνω στην ίδια γραμμή θα έχανε τα μισά. Το άνοιγμα
 * τελειώνει στο πρώτο `>` που δεν είναι μέσα σε άγκιστρα ή σε συμβολοσειρά.
 */
function openTag(src, at) {
  let depth = 0, quote = null
  for (let i = at; i < src.length; i++) {
    const c = src[i]
    if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return src.slice(at, i + 1)
  }
  return src.slice(at, at + 2000)
}

const hits = []
for (const file of projectFiles("'app/**/*.tsx' 'app/*.tsx' 'components/**/*.tsx' 'components/*.tsx'")) {
  if (file.includes('.test.')) continue
  const src = readFileSync(file, 'utf8')
  let count = 0
  for (const m of src.matchAll(/<button[\s>]/g))
    if (/style=\{/.test(openTag(src, m.index))) count++
  if (count) hits.push({ file, count })
}
const total = hits.reduce((n, h) => n + h.count, 0)

if (total > BASELINE.max) {
  console.error(`✗ ${total} κουμπιά ζωγραφισμένα στο χέρι, πάνω από το όριο ${BASELINE.max}:\n`)
  hits.sort((a, b) => b.count - a.count).slice(0, 8).forEach(h => console.error(`   ${h.count}× ${h.file}`))
  console.error(`
  Το κουμπί ζει στο components/Theme.tsx:

      <Btn variant="primary" onClick={…}>Αποθήκευση</Btn>

  Τρεις ρόλοι: primary, secondary, ghost. Η όψη και οι καταστάσεις τους ζουν
  στο .po-btn[data-variant] του globals.css, όπου το CSS ξέρει τι είναι
  αιώρηση, τι είναι εστίαση με πληκτρολόγιο και τι είναι οθόνη αφής.
`)
  process.exit(1)
}
if (total < BASELINE.max)
  console.log(`✓ ${total} κουμπιά ζωγραφισμένα στο χέρι, κάτω από το όριο ${BASELINE.max}. Κατέβασε το όριο.`)
else
  console.log(`✓ ${total} κουμπιά ζωγραφισμένα στο χέρι, όσα και το όριο`)
