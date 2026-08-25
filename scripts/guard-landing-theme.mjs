#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΔΥΟ ΘΕΜΑΤΑ ΜΕ ΤΑ ΙΔΙΑ ΟΝΟΜΑΤΑ — Η ΑΠΟΚΛΙΣΗ ΠΟΥ ΚΑΝΕΝΑΣ ΦΥΛΑΚΑΣ ΔΕΝ ΕΒΛΕΠΕ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΒΡΕΘΗΚΕ. Η landing (`app/page.tsx`) ξανάοριζε μέσα σε `<style>` τα ίδια
// design tokens με ΑΛΛΕΣ τιμές:
//
//     --bg-base:      #070b12   ενώ η εφαρμογή  #202124
//     --bg-elevated:  #16202f   ενώ η εφαρμογή  #35363a
//     --text-primary: #eef2f7   ενώ η εφαρμογή  #e8eaed
//     --text-secondary: #a7b2c2 ενώ η εφαρμογή  #9aa0a6
//
// Δηλαδή δύο χρωματικά συστήματα φορώντας την ίδια ταμπέλα. Ο επισκέπτης
// περνούσε από ψυχρό ναυτικό μπλε σε ουδέτερο ανθρακί τη στιγμή της εγγραφής —
// και κανένας από τους υπάρχοντες φύλακες δεν μπορούσε να το πιάσει, επειδή όλοι
// ελέγχουν ΟΝΟΜΑΤΑ (χρησιμοποιείς token αντί για ωμό χρώμα;) και εδώ τα ονόματα
// ήταν σωστά. Η απόκλιση ζούσε στην ΤΙΜΗ.
//
// Η ΑΠΟΦΑΣΗ ΤΟΥ ΕΡΓΟΥ: η βιτρίνα κρατά το βάθος της — είναι σκόπιμο και σωστό
// για σελίδα πώλησης. Παύει όμως να μιλά με δανεικά ονόματα. Η παλέτα της
// λέγεται `--mkt-*`, δηλώνεται ΜΙΑ φορά στο `app/globals.css` δίπλα στα θέματα
// του προϊόντος (εκεί όπου η απόκλιση φαίνεται με το μάτι) και το `.lp-root`
// κάνει μόνο αντιστοίχιση.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ ΑΥΤΟΣ Ο ΦΥΛΑΚΑΣ
//   1. Μέσα στο `.lp-root`, καμία δήλωση μεταβλητής δεν παίρνει ωμό χρώμα.
//      Κάθε τιμή προέρχεται από `var(--mkt-*)` ή από `color-mix` πάνω σε τέτοιο.
//   2. Κάθε `--mkt-*` που χρησιμοποιείται είναι δηλωμένο στο globals.css.
//   3. Κάθε `--mkt-*` που δηλώνεται, χρησιμοποιείται. Νεκρό token σε παλέτα
//      είναι χειρότερο από απόν: διαβάζεται ως κανόνας που δεν ισχύει.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const PAGE = 'app/page.tsx'
const GLOBALS = 'app/globals.css'

const page = readFileSync(PAGE, 'utf8')
const globals = readFileSync(GLOBALS, 'utf8')

const findings = []

// ── 1. Το μπλοκ αντιστοίχισης δεν κρύβει χρώματα ──────────────────────────
const block = page.match(/\.lp-root\s*\{([\s\S]*?)\n\s*\}/)
if (!block) {
  findings.push('Δεν βρέθηκε το μπλοκ `.lp-root` στο ' + PAGE + '. Αν μετονομάστηκε, ενημέρωσε τον φύλακα.')
} else {
  const body = block[1]
  const lineNo = page.slice(0, block.index).split('\n').length
  body.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (!t.startsWith('--')) return
    const decl = t.split(':')[0].trim()
    // Τα ίδια τα `--mkt-*` δηλώνονται στο globals.css, όχι εδώ.
    if (decl.startsWith('--mkt-')) {
      findings.push(`${PAGE}:${lineNo + i} — το \`${decl}\` δηλώνεται εδώ· η παλέτα της βιτρίνας ζει στο ${GLOBALS}`)
      return
    }
    const value = t.slice(t.indexOf(':') + 1)
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)) {
      findings.push(`${PAGE}:${lineNo + i} — ωμό χρώμα στην αντιστοίχιση: \`${t.slice(0, 80)}\``)
    }
  })
}

// ── 2+3. Η παλέτα: ό,τι χρησιμοποιείται δηλώνεται, ό,τι δηλώνεται χρησιμοποιείται ──
const declared = new Set([...globals.matchAll(/^\s*(--mkt-[a-z0-9-]+)\s*:/gm)].map(m => m[1]))
const used = new Set([...page.matchAll(/var\((--mkt-[a-z0-9-]+)\)/g)].map(m => m[1]))

for (const u of used) {
  if (!declared.has(u)) findings.push(`${PAGE} — χρησιμοποιεί \`${u}\` που δεν δηλώνεται στο ${GLOBALS}`)
}
for (const d of declared) {
  if (!used.has(d)) findings.push(`${GLOBALS} — το \`${d}\` δηλώνεται και δεν το χρησιμοποιεί κανείς`)
}

if (findings.length) {
  console.error('✗ Το θέμα της βιτρίνας δεν είναι δηλωμένο σωστά:\n')
  for (const f of findings) console.error('  ' + f)
  console.error('\n  Η παλέτα της landing λέγεται `--mkt-*` και ζει στο app/globals.css.')
  console.error('  Το `.lp-root` κάνει ΜΟΝΟ αντιστοίχιση: --token: var(--mkt-…).')
  process.exit(1)
}
console.log(`✓ θέμα βιτρίνας: ${declared.size} δηλωμένα tokens, καμία ωμή τιμή στην αντιστοίχιση`)
