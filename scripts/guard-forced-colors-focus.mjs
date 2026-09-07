#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΔΑΧΤΥΛΙΔΙ ΕΣΤΙΑΣΗΣ ΠΟΥ ΕΞΑΦΑΝΙΖΕΤΑΙ ΣΤΗΝ ΥΨΗΛΗ ΑΝΤΙΘΕΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΣΥΜΒΑΙΝΕΙ. Στη λειτουργία υψηλής αντίθεσης του λειτουργικού ο περιηγητής
// πετάει ΚΑΘΕ `box-shadow`. Δεν είναι σφάλμα υλοποίησης: το ζητά ρητά το
// πρότυπο CSS Forced Colors, ώστε η παλέτα να ανήκει στον χρήστη.
//
// ΤΙ ΣΗΜΑΙΝΕΙ ΓΙΑ ΕΜΑΣ. Όποιος κανόνας `:focus-visible` σβήνει το `outline`
// για να μη θορυβεί και δηλώνει την εστίαση ΜΟΝΟ με σκιά, αφήνει τον χρήστη
// πληκτρολογίου σε υψηλή αντίθεση χωρίς καμία ένδειξη. Είναι ακριβώς ο
// χρήστης που εξαρτάται περισσότερο από αυτήν.
//
// ΓΙΑΤΙ ΧΡΕΙΑΖΕΤΑΙ ΦΥΛΑΚΑΣ. Καμία σάρωση δεν το πιάνει: οι μετρήσεις τρέχουν
// με κανονικά χρώματα, όπου η σκιά υπάρχει και φαίνεται. Το ελάττωμα είναι
// ορατό μόνο σε μια λειτουργία που κανένα από τα υπάρχοντα εργαλεία δεν
// ενεργοποιεί. Ο φύλακας διαβάζει το φύλλο στυλ αντί να ζωγραφίσει.
//
// Ο ΚΑΝΟΝΑΣ. Κάθε επιλογέας που γράφει `:focus-visible { … outline: none …
// box-shadow … }` πρέπει να εμφανίζεται και μέσα σε `@media (forced-colors:
// active)` με δικό του `outline`.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const CSS = 'app/globals.css'
const src = readFileSync(CSS, 'utf8')

/** Τα μπλοκ `@media (forced-colors: active) { … }` μαζεμένα σε ένα κείμενο. */
function forcedColorsText(css) {
  const out = []
  const re = /@media[^{]*forced-colors\s*:\s*active[^{]*\{/g
  for (const m of css.matchAll(re)) {
    let depth = 1, i = m.index + m[0].length
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    out.push(css.slice(m.index + m[0].length, i - 1))
  }
  return out.join('\n')
}

const forced = forcedColorsText(src)

// Κάθε κανόνας του αρχείου: επιλογέας + σώμα. Αγνοούνται όσοι ζουν ήδη μέσα
// σε forced-colors, γιατί εκεί το `outline: none` είναι συνειδητή επιλογή.
const gaps = []
const rule = /([^{}@\/][^{}]*?):focus-visible([^{}]*?)\{([^{}]*)\}/g
for (const m of src.matchAll(rule)) {
  const body = m[3]
  if (!/outline\s*:\s*none/.test(body)) continue
  if (!/box-shadow\s*:/.test(body)) continue
  const selector = (m[1] + ':focus-visible' + m[2]).trim()
  const head = selector.split(/[\s,>]/).filter(Boolean).pop() || selector
  const bare = head.replace(':focus-visible', '')
  if (forced.includes(bare)) continue
  const line = src.slice(0, m.index).split('\n').length
  gaps.push({ line, selector })
}

if (gaps.length) {
  console.error(`✗ ${gaps.length} κανόνες εστίασης χάνονται στην υψηλή αντίθεση:\n`)
  for (const g of gaps) console.error(`   ${CSS}:${g.line}  ${g.selector}`)
  console.error(`
  Ο κανόνας σβήνει το outline και δηλώνει την εστίαση μόνο με box-shadow. Σε
  \`forced-colors: active\` ο περιηγητής πετάει τη σκιά και δεν μένει τίποτα.

  Πρόσθεσε τον επιλογέα στο μπλοκ υψηλής αντίθεσης του globals.css:

      @media (forced-colors: active) {
        .ο-επιλογέας-σου:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
      }

  Το \`Highlight\` είναι το χρώμα εστίασης που ορίζει ο χρήστης στο σύστημα.
`)
  process.exit(1)
}
console.log('✓ Κάθε δαχτυλίδι εστίασης επιβιώνει στην υψηλή αντίθεση')
