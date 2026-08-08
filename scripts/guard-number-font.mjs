#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ MONOSPACE ΕΙΝΑΙ ΓΙΑ ΣΤΗΛΕΣ, ΟΧΙ ΓΙΑ ΠΡΟΤΑΣΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// Ο ΚΑΝΟΝΑΣ ΥΠΗΡΧΕ ΗΔΗ, ΓΡΑΜΜΕΝΟΣ ΣΤΟ `components/tokens.ts`:
//
//     num: «Μεγάλοι αριθμοί κεφαλίδας: σφιχτή sans με tabular ψηφία, χωρίς τα
//           πλατιά κενά του monospace γύρω από κόμμα και τελεία. Το mono μένει
//           για πυκνούς πίνακες.»
//
// Και παραβιαζόταν σε δεκατέσσερα σημεία, σε επτά αρχεία: αριθμοί ΜΕΣΑ σε
// τρέχουσα πρόταση γραμμένοι σε monospace. Το αποτέλεσμα δεν είναι απλώς
// «διαφορετικό» — το monospace ανοίγει πλατιά κενά γύρω από κάθε κόμμα και
// τελεία, οπότε ένα «1.234,56 €» μέσα σε φράση σπάει τον ρυθμό της γραμμής και
// τραβά το μάτι σαν να είναι κάτι άλλο από κείμενο.
//
// ΧΕΙΡΟΤΕΡΟ ΗΤΑΝ ΤΟ ΑΛΛΟ ΕΥΡΗΜΑ, ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ: στην κάρτα
// τιμολογίου ρεύματος, σε monospace ήταν και η ΕΤΙΚΕΤΑ — «Χρέωση ημέρας»,
// «Μηνιαίο πάγιο» — με τη στοίχιση να γίνεται με δύο κυριολεκτικά κενά. Η κάρτα
// διαβαζόταν σαν έξοδος τερματικού μέσα σε premium οθόνη.
//
// ΤΙ ΕΠΙΤΡΕΠΕΤΑΙ: monospace σε κελιά πίνακα (`<td>`), όπου οι αριθμοί
// στοιχίζονται σε στήλη και το σταθερό πλάτος ΕΙΝΑΙ ο λόγος ύπαρξής του.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/** Ελληνικό τρέχον κείμενο: τουλάχιστον μία λέξη τεσσάρων γραμμάτων. */
const PROSE = /[Α-Ωα-ωά-ώΆΈΉΊΌΎΏ]{4,}/

const findings = []
for (const file of findSources()) {
  if (!file.endsWith('.tsx') || file.includes('.test.')) continue
  const src = readFileSync(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    if (!/T\.font\.mono/.test(line)) return
    // Κελί πίνακα: εκεί το monospace είναι σωστό.
    if (/<t[dh]\b/.test(line)) return
    // Χωρίς ελληνικό κείμενο έξω από τις ετικέτες, δεν είναι πρόταση.
    const text = line.replace(/<[^>]*>/g, '')
    if (!PROSE.test(text)) return
    findings.push({ file, line: i + 1, code: t.slice(0, 110) })
  })
}

if (findings.length) {
  console.error('✗ Monospace μέσα σε τρέχουσα πρόταση:\n')
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.code}`)
  console.error(`\n${findings.length} ευρήματα. Ο κανόνας ζει στο components/tokens.ts:`)
  console.error('`T.font.num` για αριθμούς μέσα σε κείμενο, `T.font.mono` για στήλες πίνακα.')
  process.exit(1)
}
console.log('✓ κανένα monospace μέσα σε πρόταση')
