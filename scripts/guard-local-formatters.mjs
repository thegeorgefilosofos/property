#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΜΟΡΦΟΠΟΙΗΤΗΣ ΠΟΣΟΥ, ΕΝΑΣ ΠΟΣΟΣΤΟΥ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΒΡΕΘΗΚΕ, ΑΦΟΥ ΤΟ lib/core/format.ts ΕΙΧΕ ΗΔΗ ΓΡΑΦΤΕΙ ΓΙΑ ΝΑ ΤΟ ΛΥΣΕΙ:
//
//   · TabRentROI       δικό του `fp` με ΕΝΑ δεκαδικό, που ΣΚΙΑΖΕ τον κανονικό.
//                      Ολόκληρη η οθόνη απόδοσης έγραφε «4,2%» δίπλα σε «4,20%».
//   · TabAccounting    `eur` και `eur2` — δύο ονόματα, ίδια συνάρτηση· και τρίτο
//                      `pct` με ένα δεκαδικό.
//   · ApprovalPanel    `dec()` που έβγαζε «37,6%» και «75%» στην ίδια σειρά.
//   · TabLoan          `fmtRate2()`, τέταρτη γραφή του ίδιου πράγματος.
//   · BillsBudget      cap rate και cash-on-cash με ένα δεκαδικό.
//   · LeaseModal       «3 %», με κενό πριν το σύμβολο.
//   · assistantPersona `eur` που έκοβε τα δεκαδικά και κολλούσε το ευρώ («11€»).
//   · TabTenant        τα μηνύματα προς τον ενοικιαστή έγραφαν «450 €» ενώ η
//                      καρτέλα από πάνω έγραφε «450,00 €». Φεύγει σε SMS.
//
// Κανένα δεν ήταν πρόθεση· όλα ήταν «γράφω γρήγορα εδώ αυτό που χρειάζομαι».
// Το αποτέλεσμα όμως το βλέπει ο χρήστης ως δύο συστήματα αρίθμησης στην ίδια
// οθόνη — και σε οικονομική εφαρμογή αυτό δεν διαβάζεται ως στιλ.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ: κλήση `toLocaleString` με δεκαδικά ή με νόμισμα, και
// `toFixed(n)` που καταλήγει σε «%» ή «€», έξω από το lib/core/format.ts.
//
// ΤΙ ΕΠΙΤΡΕΠΕΤΑΙ ΡΗΤΑ: οι εξαγωγές (Excel, CSV, λογιστικό ημερολόγιο) — εκεί η
// μορφή πρέπει να διαβαστεί από άλλο πρόγραμμα, όχι από άνθρωπο, και οι
// ημερομηνίες, που έχουν δικό τους σημείο (fd/fdLong).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/** Αρχεία με δικό τους, τεκμηριωμένο λόγο ύπαρξης μορφοποιητή. */
const ALLOWED = [
  'lib/core/format.ts',                              // το ΕΝΑ σημείο
  'app/dashboard/components/xlsxStyle.ts',           // Excel: το διαβάζει πρόγραμμα
  'app/dashboard/components/accountantExport.ts',    // αρχείο για τον λογιστή
  'app/dashboard/components/JournalExport.tsx',      // λογιστικό ημερολόγιο
]

// Ποσό ή ποσοστό — όχι ημερομηνία, όχι σκέτος ακέραιος.
const MONEY_LOCALE = /toLocaleString\([^)]*(?:FractionDigits|currency)/i
const FIXED_UNIT = /toFixed\(\s*\d+\s*\)[^\n]{0,40}(?:%|€|\bευρώ\b)/

const files = findSources().filter(f => !f.includes('.test.') && !ALLOWED.includes(f))
const findings = []
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*')) return
    // Έξοδος προγραμματιστή στα αρχεία καταγραφής: δεν τη διαβάζει χρήστης.
    if (/console\.(log|warn|error|info)/.test(line)) return
    if (MONEY_LOCALE.test(line) || FIXED_UNIT.test(line)) {
      findings.push({ f, n: i + 1, code: t.slice(0, 100) })
    }
  })
}

if (findings.length) {
  console.error(`✗ ${findings.length} τοπικοί μορφοποιητές ποσού ή ποσοστού:\n`)
  for (const x of findings) console.error(`  ${x.f}:${x.n}\n    ${x.code}`)
  console.error('\n  Χρησιμοποίησε fe (ποσό), fp (ποσοστό), feRate (μοναδιαία τιμή),')
  console.error('  feSigned (με πρόσημο) από το lib/core/format.ts. Δύο δεκαδικά, παντού.')
  console.error('  Αν πρόκειται για εξαγωγή αρχείου, πρόσθεσε το αρχείο στη λίστα ALLOWED.')
  process.exit(1)
}
console.log('✓ ένας μορφοποιητής ποσού και ένας ποσοστού σε όλη την εφαρμογή')
