#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ useLoad ΔΕΝ ΕΙΝΑΙ ΚΡΥΨΩΝΑΣ ΓΙΑ ΣΥΓΧΡΟΝΗ ΓΡΑΦΗ ΚΑΤΑΣΤΑΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΟΦΕΛΟΣ ΚΑΙ Ο ΚΙΝΔΥΝΟΣ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ. Μέσα στο `app/hooks/useLoad.ts`
// η φόρτωση είναι ΠΑΡΑΜΕΤΡΟΣ, οπότε ο κανόνας `react-hooks/set-state-in-effect`
// δεν έχει σώμα να ακολουθήσει και σωπαίνει. Αυτό είναι σωστό για δεκαεννέα
// ασύγχρονες φορτώσεις όπου η γραφή γίνεται ΜΕΤΑ το `await`.
//
// Θα ήταν λάθος για μία `load` που ξεκινά με `setLoading(true)`: εκείνη είναι
// σύγχρονη γραφή μέσα σε effect, με αλυσιδωτή απόδοση· θα περνούσε αθόρυβα.
// Ακριβώς έτσι ήταν γραμμένη η Σύγκριση πριν διορθωθεί.
//
// ΤΙ ΜΕΤΡΑΕΙ. Για κάθε `useLoad(x)`, βρίσκει τη δήλωση της `x` στο ΙΔΙΟ αρχείο
// και κοιτάζει το σώμα της ΩΣ ΤΟ ΠΡΩΤΟ `await`. Αν εκεί μέσα υπάρχει κλήση που
// μοιάζει με γραφή κατάστασης (`setΚάτι(`), κόβει.
//
// Δεν κρίνει ό,τι έρχεται μετά το `await`: εκείνο είναι απάντηση δικτύου και
// είναι ο λόγος ύπαρξης του hook.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

const SET_STATE = /\bset[A-Z_][A-Za-z0-9_]*\s*\(/

/** Το σώμα μιας συνάρτησης από τη θέση της αγκύλης, μετρώντας αγκύλες. */
function bodyFrom(src, at) {
  const open = src.indexOf('{', at)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open + 1, i) }
  }
  return src.slice(open + 1)
}

const findings = []
for (const f of findSources()) {
  if (!/\.(ts|tsx)$/.test(f) || f.includes('.test.')) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\buseLoad\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    const name = m[1]
    // Η δήλωση: `const name = useCallback(async () => {` ή `const name = async () => {`
    const decl = new RegExp(`\\bconst\\s+${name}\\s*=\\s*(?:useCallback\\s*\\(\\s*)?(?:async\\s*)?\\(`).exec(src)
    if (!decl) continue
    const body = bodyFrom(src, decl.index)
    const head = body.split(/\bawait\b/)[0]
    if (SET_STATE.test(head)) {
      const line = src.slice(0, m.index).split('\n').length
      const bad = head.match(SET_STATE)[0]
      findings.push(`${f}:${line}  useLoad(${name}) → «${bad.trim()}…» πριν από το πρώτο await`)
    }
  }
}

if (findings.length) {
  console.error(`✗ ${findings.length} φορτώσεις γράφουν κατάσταση ΠΡΙΝ από το πρώτο await:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error('\n  Εκεί το `useLoad` κρύβει σύγχρονη γραφή μέσα σε effect, που είναι')
  console.error('  ακριβώς αυτό που δεν επιτρέπεται. Βγάλε τη γραφή έξω από τη φόρτωση:')
  console.error('  ο δείκτης «φορτώνει» βγαίνει από το ΑΝ υπάρχουν δεδομένα, όχι από δεύτερη κατάσταση.')
  process.exit(1)
}
console.log('✓ καμία φόρτωση του useLoad δεν γράφει κατάσταση πριν από το await')
