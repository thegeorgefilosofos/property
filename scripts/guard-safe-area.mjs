#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο,ΤΙ ΑΚΟΥΜΠΑΕΙ ΑΚΡΗ ΟΘΟΝΗΣ ΣΕΒΕΤΑΙ ΤΗΝ ΕΓΚΟΠΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΕΙΝΑΙ ΥΠΟΧΡΕΩΤΙΚΟ ΕΔΩ ΚΑΙ ΟΧΙ ΠΡΟΑΙΡΕΤΙΚΟ. Δύο δηλώσεις το κάνουν
// υποχρέωση:
//
//   app/manifest.ts   → display: 'standalone'
//   app/layout.tsx    → viewportFit: 'cover'
//
// Μαζί σημαίνουν ότι, όταν κάποιος προσθέσει την εφαρμογή στην αρχική οθόνη
// του iPhone, ΔΕΝ υπάρχει μπάρα διευθύνσεων: η σελίδα ζωγραφίζει από το
// απόλυτο άκρο της οθόνης — κάτω από την εγκοπή, πάνω από τη μπάρα αφής.
// Ο,τι κάθεται σε άκρη χωρίς `env(safe-area-inset-*)` κρύβεται.
//
// ΤΙ ΒΡΕΘΗΚΕ ΤΗΝ ΗΜΕΡΑ ΠΟΥ ΓΡΑΦΤΗΚΕ, 03/09/2026:
//   · Η `.app-topbar` είχε «padding: 0 24px» — μηδέν επάνω. Το όνομα του
//     ακινήτου και το σήμα κατάστασης κάθονταν κάτω από το Dynamic Island σε
//     κάθε iPhone από το X και μετά.
//   · Το κάτω περιθώριο υπολογιζόταν «82px», το ύψος της πλοήγησης ΧΩΡΙΣ τη
//     μπάρα αφής. Η ίδια η πλοήγηση το κρατούσε σωστά, άρα ήταν ψηλότερη κατά
//     ~34 εικονοστοιχεία: η τελευταία κάρτα κάθε λίστας κρυβόταν από πίσω της
//     και το μήνυμα επιβεβαίωσης εμφανιζόταν κάτω από αυτήν.
//
// ΚΑΝΕΝΑΣ ΣΑΡΩΤΗΣ ΠΛΑΤΟΥΣ ΔΕΝ ΤΑ ΠΙΑΝΕΙ. Το `env()` είναι μηδέν σε κάθε
// περιηγητή γραφείου, οπότε δεκαοκτώ πλάτη σε Chromium δείχνουν τέλεια οθόνη
// ενώ το τηλέφωνο του ιδιοκτήτη δείχνει κομμένη. Ο έλεγχος είναι του ΠΗΓΑΙΟΥ,
// γιατί εκεί είναι η μόνη θέση όπου φαίνεται η πρόθεση.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── ΟΝΟΜΑΣΤΙΚΕΣ ΕΞΑΙΡΕΣΕΙΣ, ΚΑΘΕ ΜΙΑ ΜΕ ΤΟΝ ΛΟΓΟ ΤΗΣ ─────────────────────────
const ALLOWED = new Map([
  // Το σκοτεινό φόντο ενός παραθύρου ΠΡΕΠΕΙ να καλύπτει και την εγκοπή: αν
  // κρατούσε περιθώριο, θα φαινόταν λωρίδα της από κάτω εφαρμογής στην κορυφή.
  ['modal-backdrop', 'φόντο παραθύρου: καλύπτει επίτηδες ώς τα άκρα'],
  ['pa-backdrop', 'φόντο του βοηθού: το ίδιο'],
])

const EDGE = /(^|[;{\s])(top|bottom|left|right)\s*:\s*0(px)?\s*(;|})/
const FIXED = /position\s*:\s*fixed/

/** Οι κανόνες ενός φύλλου, χοντρικά: επιλογέας + σώμα. */
function* rules(css) {
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(css))) yield { sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }
}

const files = []
const walk = (dir) => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(css|tsx)$/.test(p) && !p.includes('.test.')) files.push(p)
  }
}
walk('app'); walk('components')

const bad = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const { sel, body } of rules(src)) {
    if (!FIXED.test(body)) continue
    // Μας νοιάζουν μόνο η ΚΟΡΥΦΗ και ο ΠΑΤΟΣ: εκεί ζουν η εγκοπή και η μπάρα
    // αφής. Οι πλαϊνές μετράνε μόνο σε πλάγια θέση και τις κρατά η .app-topbar.
    const touchesTop = /(^|[;{\s])top\s*:\s*0(px)?\s*(;|}|$)/.test(body)
    const touchesBottom = /(^|[;{\s])bottom\s*:\s*0(px)?\s*(;|}|$)/.test(body)
    if (!touchesTop && !touchesBottom) continue
    if (body.includes('safe-area-inset')) continue
    const name = (sel.match(/\.([a-z0-9-]+)/i) || [])[1] || sel
    if (ALLOWED.has(name)) continue
    bad.push({ f, sel: sel.slice(0, 60), edge: touchesTop ? 'κορυφή' : 'πάτος' })
  }
}

if (bad.length) {
  console.error(`\n✗ ${bad.length} στοιχεία κάθονται σε άκρη οθόνης χωρίς όριο ασφαλείας:\n`)
  for (const b of bad) console.error(`  ${b.f}\n     «${b.sel}» → ${b.edge}`)
  console.error(`
  Το manifest λέει «standalone» και το viewport «cover»: στο iPhone η σελίδα
  ζωγραφίζει ΚΑΤΩ από την εγκοπή και ΠΑΝΩ από τη μπάρα αφής. Πρόσθεσε το
  αντίστοιχο περιθώριο, με εφεδρική τιμή για όσους δεν το ξέρουν:

      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));

  Αν το στοιχείο ΠΡΕΠΕΙ να καλύπτει ώς την άκρη —φόντο παραθύρου, για
  παράδειγμα— γράψ' το ονομαστικά στο ALLOWED αυτού του αρχείου, με τον λόγο.`)
  process.exit(1)
}
console.log(`✓ κάθε πλωτό στοιχείο σε άκρη οθόνης κρατά όριο ασφαλείας (${files.length} αρχεία, ${ALLOWED.size} ονομαστικές εξαιρέσεις)`)
