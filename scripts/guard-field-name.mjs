#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΠΕΔΙΟ ΠΡΕΠΕΙ ΝΑ ΛΕΓΕΤΑΙ ΚΑΠΩΣ
// ─────────────────────────────────────────────────────────────────────────
// Το <NumberInput> και το <TextInput> γράφουν την ετικέτα τους ΜΟΝΟ όταν τους
// δοθεί `label`. Χωρίς αυτήν αποδίδουν ένα γυμνό <input>: ο βλέπων χρήστης
// καταλαβαίνει από το διπλανό κείμενο που έγραψε ο γονιός, ο αναγνώστης οθόνης
// όμως ακούει σκέτο «πλαίσιο κειμένου». Το πεδίο υπάρχει, δεν λέγεται τίποτα.
//
// Βρέθηκαν είκοσι δύο τέτοια — οκτώ αριθμητικά (αξία και κόστος αντικατάστασης
// στην απογραφή, βατ και ώρες κατανάλωσης, κόστος επισκευής, επανάληψη και
// εκτιμώμενο κόστος συντήρησης, ετήσια ανατίμηση στην Απόδοση) και δεκατέσσερα
// κειμένου, ανάμεσά τους η γραμμή παρατηρήσεων του πρωτοκόλλου παράδοσης, που
// επαναλαμβάνεται μία φορά ΑΝΑ ΑΝΤΙΚΕΙΜΕΝΟ.
//
// Ο <DatePicker> και ο <CustomSelect> ΔΕΝ ελέγχονται: ονομάζονται μόνοι τους
// από την τιμή που δείχνουν. Αδύναμο όνομα, αλλά υπαρκτό — και όπου δεν φτάνει
// (είκοσι επιλογείς που λένε όλοι «Καλή») δέχονται πλέον `ariaLabel`.
//
// ΤΡΕΙΣ ΤΡΟΠΟΙ ΝΑ ΟΝΟΜΑΣΤΕΙ ΕΝΑ ΠΕΔΙΟ, ΚΑΤΑ ΣΕΙΡΑ ΠΡΟΤΙΜΗΣΗΣ:
//
//   label="…"        Η ετικέτα μπαίνει μέσα στο component. Προεπιλογή.
//   id + htmlFor     Την ετικέτα τη γράφει ο γονιός (πλέγμα, ετικέτα στο
//                    πλάι). Συνδέεται κανονικά — και το κλικ πάνω της
//                    εστιάζει στο πεδίο, όπως παντού αλλού.
//   ariaLabel="…"    Όταν δεν υπάρχει καθόλου ορατή ετικέτα, ή όταν το
//                    <Field> γράφει μία ετικέτα για δύο πεδία.
//
// Ο φύλακας ζητά ΕΝΑ από τα τρία. Δεν κρίνει ποιο.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

// Διαβάζει την ετικέτα ολόκληρη, μετρώντας αγκύλες: μια ετικέτα μπορεί να
// απλώνεται σε πολλές γραμμές και να περιέχει «>» μέσα σε συμβολοσειρά.
function tagsOf(src, name) {
  const out = []
  const open = new RegExp(`<${name}\\b`, 'g')
  for (const m of src.matchAll(open)) {
    let i = m.index + m[0].length, depth = 0, quote = ''
    while (i < src.length) {
      const c = src[i]
      if (quote) { if (c === quote) quote = '' }
      else if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
      i++
    }
    out.push({ tag: src.slice(m.index, i), line: src.slice(0, m.index).split('\n').length })
  }
  return out
}

const named = tag =>
  /\bariaLabel=/.test(tag) ||
  /\bid=/.test(tag) ||
  /\blabel=\{/.test(tag) ||
  /\blabel="[^"]*\S[^"]*"/.test(tag)

const findings = []
for (const f of findSources()) {
  if (f.includes('.test.')) continue
  const src = readFileSync(f, 'utf8')
  for (const name of ['NumberInput', 'TextInput']) {
    if (!src.includes(`<${name}`)) continue
    for (const { tag, line } of tagsOf(src, name)) {
      if (!named(tag)) findings.push(`${f}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 92)}`)
    }
  }
}

if (findings.length) {
  console.error(`✗ ${findings.length} πεδία χωρίς όνομα:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error('\n  Δώσε `label`, ή `id` μαζί με `htmlFor` στη δική σου ετικέτα, ή `ariaLabel`.')
  console.error('  Χωρίς κανένα από τα τρία, ο αναγνώστης οθόνης λέει «πλαίσιο κειμένου».')
  process.exit(1)
}
console.log('✓ κάθε πεδίο έχει όνομα')
