#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΕΣΣΕΡΑ ΠΛΑΤΗ ΠΑΡΑΘΥΡΟΥ, ΟΧΙ ΔΕΚΑΟΚΤΩ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΠΡΙΝ. Τα `<Modal>` και τα `<SideSheet>` της εφαρμογής άνοιγαν
// σε 340, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560, 600, 620, 640,
// 680, 720, 760, 820, 860 και 980 εικονοστοιχεία. Είκοσι τιμές για τέσσερα
// πράγματα. Καμία δεν ήταν απόφαση: ήταν το πλάτος που χρειάστηκε η κάθε
// οθόνη τη μέρα που γράφτηκε.
//
// ΠΩΣ ΤΟ ΕΙΔΕ Ο ΧΡΗΣΤΗΣ. Ανοιγε «Νέα επαφή» στο tablet και έπαιρνε ένα
// παράθυρο· άνοιγε «Επεξεργασία αντικειμένου» στην ίδια οθόνη και έπαιρνε
// άλλο, αισθητά πλατύτερο. Δύο παράθυρα της ίδιας εφαρμογής, στην ίδια
// συσκευή, με άλλο μέγεθος.
//
// ΤΙ ΜΕΤΡΑΕΙ ΕΔΩ. Κάθε ετικέτα ανοίγματος `<Modal` ή `<SideSheet` σε όλον τον
// κώδικα. Αν φέρει `width={...}`, κόβει: το πλάτος δηλώνεται με `size` πάνω
// στην κλίμακα sm/md/lg/xl του `components/Theme.tsx`.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/**
 * Οι ΔΙΚΕΣ ΤΗΣ ιδιότητες μιας ετικέτας ανοίγματος, από τη θέση `at`.
 * Ο,τι βρίσκεται μέσα σε άγκιστρα ανήκει σε άλλο στοιχείο (π.χ. το
 * `icon={<svg width={20} …>}`) και αφαιρείται, αλλιώς το πλάτος του
 * εικονιδίου θα περνούσε για πλάτος του παραθύρου.
 */
function ownAttrs(src, at) {
  let depth = 0, out = ''
  for (let i = at; i < src.length; i++) {
    const c = src[i]
    if (c === '{') { depth++; continue }
    if (c === '}') { depth--; continue }
    if (depth === 0) {
      if (c === '>') break
      out += c
    }
  }
  return out
}

const findings = []
for (const f of findSources()) {
  if (!/\.tsx$/.test(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/<(Modal|SideSheet)\b/g)) {
    const seg = ownAttrs(src, m.index + m[0].length)
    const w = /\bwidth=(\S*)/.exec(seg.replace(/\s+/g, ' '))
    if (!w) continue
    const line = src.slice(0, m.index).split('\n').length
    findings.push(`${f}:${line}  <${m[1]} … width=${w[1] || '…'}>`)
  }
}

if (findings.length) {
  console.error(`✗ ${findings.length} παράθυρα δηλώνουν πλάτος σε εικονοστοιχεία:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error('\n  Το πλάτος λέει ΤΙ είναι το παράθυρο, όχι πόσα εικονοστοιχεία θέλει:')
  console.error('    size="sm"  440  μια ερώτηση, μια επιβεβαίωση, μια στήλη')
  console.error('    size="md"  620  μια φόρμα')
  console.error('    size="lg"  760  φόρμα με δύο στήλες ή πίνακας')
  console.error('    size="xl"  980  χώρος εργασίας με καρτέλες και πίνακες')
  process.exit(1)
}
console.log('✓ κάθε Modal και SideSheet παίρνει πλάτος από την κλίμακα των τεσσάρων')
