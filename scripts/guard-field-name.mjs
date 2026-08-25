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
//
// ─────────────────────────────────────────────────────────────────────────
// ΚΑΙ ΤΑ ΝΤΟΠΙΑ <input>, ΠΟΥ ΠΕΡΝΟΥΣΑΝ ΑΠΟ ΜΠΡΟΣΤΑ ΤΟΥ ΑΟΡΑΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΙΣΧΥΕ. Ο βρόχος κοιτούσε ΜΟΝΟ `NumberInput` και `TextInput`. Ο οδηγός
// ακινήτου (`AddPropertyWizard.tsx`) γράφει ωμά `<input style={inputStyle}>`,
// οπότε τα 31 πεδία του και τα 8 της δημόσιας φόρμας άφιξης δεν μετρήθηκαν
// ποτέ: 39 πεδία χωρίς όνομα και ο φύλακας τύπωνε «κάθε πεδίο έχει όνομα».
// Φύλακας που δίνει ψευδή βεβαιότητα κοστίζει περισσότερο από ανύπαρκτο, γιατί
// σταματά και το ψάξιμο.
//
// ΤΙ ΜΕΤΡΑΕΙ ΤΩΡΑ. Καθε ωμό <input> και <textarea> σε .tsx. Ονομάζεται όταν
// έχει `id`, `aria-label` ή `aria-labelledby`, όταν το τυλίγει <label>, ή όταν
// του έρχονται άγνωστα props με `{...}`. Δεν μετρούν τα type hidden, submit,
// button, reset και image: δεν δέχονται κείμενο και δεν ονομάζονται από
// ετικέτα. Το `placeholder` ΔΕΝ ονομάζει: σβήνεται μόλις γραφτεί ο πρώτος
// χαρακτήρας και ο χρήστης που πάει πίσω να ελέγξει βρίσκει πάλι ανώνυμο πεδίο.
//
// ΓΡΑΜΜΗ ΑΝΑΦΟΡΑΣ ΑΝΑ ΑΡΧΕΙΟ, ΟΧΙ ΕΝΑ ΣΥΝΟΛΟ. Απο τα 115 ανώνυμα ντόπια πεδία
// του αποθετηρίου διορθώθηκαν εδώ τα 39· μένουν 76 σε 37 άλλα αρχεία, που δεν
// είναι αυτής της δουλειάς. Ενα ενιαίο άθροισμα θα επέτρεπε να μπει νέο
// ανώνυμο πεδίο στον οδηγό και να «πληρωθεί» με μια διόρθωση στο LeaseModal,
// δηλαδή να ξανανοίξει η τρύπα που κλείνει εδώ. Το όριο είναι ανά αρχείο:
// αρχείο εκτός καταλόγου έχει όριο μηδέν και κάθε νέα φόρμα ξεκινά καθαρή.
// Κατέβασμα ορίου: `node scripts/guard-field-name.mjs --write`.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

const BASELINE = 'scripts/field-name-baseline.json'

// ΤΑ ΣΧΟΛΙΑ ΔΕΝ ΕΙΝΑΙ ΚΩΔΙΚΑΣ, ΚΑΙ ΤΟ ΠΛΗΡΩΣΕ Ο ΙΔΙΟΣ Ο ΦΥΛΑΚΑΣ.
// Το `AddPropertyWizard.tsx` εξηγεί σε πεζό κείμενο ότι «η <label> ήταν
// αδελφός του πεδίου». Χωρίς καθάρισμα, εκείνο το ένα <label> μετρήθηκε ως
// ανοιχτή ετικέτα και ΟΛΑ τα 31 πεδία από κάτω φάνηκαν τυλιγμένα σε ετικέτα,
// δηλαδή ονομασμένα. Ο,τι σβήνεται γίνεται κενά, ώστε οι θέσεις και οι αριθμοί
// γραμμών να μείνουν ίδιοι.
const strip = src => src
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .split('\n')
  .map(l => /^\s*(\/\/|\*)/.test(l) ? ' '.repeat(l.length) : l)
  .join('\n')

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
    out.push({ tag: src.slice(m.index, i), line: src.slice(0, m.index).split('\n').length, at: m.index })
  }
  return out
}

const named = tag =>
  /\bariaLabel=/.test(tag) ||
  /\bid=/.test(tag) ||
  /\blabel=\{/.test(tag) ||
  /\blabel="[^"]*\S[^"]*"/.test(tag)

// ── Ντόπια πεδία ────────────────────────────────────────────────────────────
const NATIVE = ['input', 'textarea']
const NO_NAME_NEEDED = /type=["'](hidden|submit|button|reset|image)["']/
const NATIVE_NAMED = tag =>
  /\b(id|aria-label|aria-labelledby)=/.test(tag) ||
  /\{\.\.\./.test(tag)                      // props από τον γονιό, άγνωστα εδώ

/** Ανοιχτό <ταμπέλα> στο σημείο `at`; Τότε η ετικέτα τυλίγει το πεδίο. */
function wrappedBy(src, at, tag) {
  const before = src.slice(0, at)
  const opens = (before.match(new RegExp(`<${tag}\\b`, 'g')) || []).length
  const closes = (before.match(new RegExp(`</${tag}>`, 'g')) || []).length
  return opens > closes
}

// ΜΙΑ ΤΕΚΜΗΡΙΩΜΕΝΗ ΕΞΑΙΡΕΣΗ: ΤΥΛΙΓΜΑ ΠΟΥ ΟΝΟΜΑΖΕΙ ΤΟ ΠΑΙΔΙ ΤΟΥ.
//
// Ο οδηγός ακινήτου δίνει το id από το `useId` του <Field>, με cloneElement:
// στο κείμενο του <input> δεν φαίνεται τίποτα, στην οθόνη υπάρχει και id και
// htmlFor. Η εξαίρεση ισχύει ΟΣΟ αποδεικνύεται· αν το <Field> ξαναγίνει το
// παλιό «ετικέτα δίπλα στο πεδίο», λείπουν τα σημάδια και τα 31 πεδία
// ξαναμετρώνται από την επόμενη εκτέλεση.
//
// ── ΚΑΙ ΤΟ ΤΥΛΙΓΜΑ ΔΕΝ ΕΙΝΑΙ ΠΑΝΤΑ ΕΤΙΚΕΤΑ JSX ──────────────────────────
// Ο οδηγός πέρασε στο μητρώο πεδίων: τα χειριστήρια δεν γράφονται πια μέσα σε
// «<Field>» αλλά δίνονται ως όρισμα στη `row(...)` και το <Field> μπαίνει μία
// φορά, μέσα στο <StepBody>. Ο έλεγχος «υπάρχει ανοιχτό <Field πριν;»
// κοκκίνισε για ΤΡΙΑΝΤΑ ΕΝΑ πεδία που στην οθόνη έχουν κανονικότατο όνομα.
//
// Το τύλιγμα αναγνωρίζεται πλέον και ως ΚΛΗΣΗ με ανοιχτή παρένθεση και η
// απόδειξη μεγάλωσε ανάλογα: το <StepBody> πρέπει να τυλίγει κάθε γραμμή σε
// «<Field label=». Αν κάποιος το βγάλει από εκεί, η εξαίρεση πέφτει ολόκληρη.
const WRAPPERS = { 'app/dashboard/components/AddPropertyWizard.tsx': ['Field', 'row'] }
const PROOF = [/cloneElement/, /htmlFor=/, /<Field label=\{r\.label/]

/**
 * Είναι το σημείο `at` ΜΕΣΑ στην παρένθεση μιας κλήσης `name(`;
 *
 * Ισορροπία παρενθέσεων από την τελευταία κλήση πριν από το σημείο: αν η
 * παρένθεση δεν έχει κλείσει ώς εκεί, το χειριστήριο είναι όρισμά της.
 */
function insideCall(src, at, name) {
  const open = src.lastIndexOf(name + '(', at)
  if (open < 0) return false
  let depth = 0
  for (let i = open + name.length; i < at; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') { depth--; if (depth === 0) return false }
  }
  return depth > 0
}

const findings = []
const native = {}
for (const f of findSources()) {
  if (f.includes('.test.')) continue
  const src = strip(readFileSync(f, 'utf8'))
  for (const name of ['NumberInput', 'TextInput']) {
    if (!src.includes(`<${name}`)) continue
    for (const { tag, line } of tagsOf(src, name)) {
      if (!named(tag)) findings.push(`${f}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 92)}`)
    }
  }
  if (!f.endsWith('.tsx')) continue
  const wrapper = PROOF.every(p => p.test(src)) ? WRAPPERS[f] : undefined
  for (const el of NATIVE) {
    for (const { tag, line, at } of tagsOf(src, el)) {
      if (NO_NAME_NEEDED.test(tag) || NATIVE_NAMED(tag)) continue
      if (wrappedBy(src, at, 'label')) continue
      if (wrapper && wrapper.some(w => wrappedBy(src, at, w) || insideCall(src, at, w))) continue
      ;(native[f] ??= []).push(`${f}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 92)}`)
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

const counts = Object.fromEntries(Object.entries(native).map(([f, xs]) => [f, xs.length]))
const total = Object.values(counts).reduce((s, n) => s + n, 0)

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, JSON.stringify({
    σημείωση: 'Ωμά <input>/<textarea> χωρίς όνομα, ανά αρχείο. Μόνο προς τα κάτω '
      + 'και αρχείο εκτός καταλόγου έχει όριο μηδέν. Δώσε id μαζί με htmlFor στη '
      + 'δική σου ετικέτα, ή aria-label, ή τύλιξε το πεδίο σε <label>.',
    αρχεία: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2) + '\n')
  console.log(`γράφτηκε γραμμή αναφοράς: ${total} πεδία σε ${Object.keys(counts).length} αρχεία`)
  process.exit(0)
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).αρχεία : counts
const over = Object.entries(counts).filter(([f, n]) => n > (base[f] ?? 0))

if (over.length) {
  const extra = over.reduce((s, [f, n]) => s + n - (base[f] ?? 0), 0)
  console.error(`✗ ${extra} ντόπια πεδία χωρίς όνομα, πάνω από το όριο του αρχείου τους:\n`)
  for (const [f, n] of over) {
    console.error(`  ${f}: ${n} > ${base[f] ?? 0}`)
    for (const x of native[f]) console.error('    ' + x)
  }
  console.error('\n  Δώσε `id` μαζί με `htmlFor` στη δική σου ετικέτα, ή `aria-label`, ή')
  console.error('  τύλιξε το πεδίο μέσα στη <label>. Το `placeholder` δεν ονομάζει:')
  console.error('  σβήνεται με τον πρώτο χαρακτήρα και το πεδίο ξαναμένει ανώνυμο.')
  process.exit(1)
}

const under = Object.entries(base).filter(([f, n]) => (counts[f] ?? 0) < n)
console.log(`✓ κάθε πεδίο έχει όνομα· ντόπια σε ανοχή: ${total} σε ${Object.keys(counts).length} αρχεία`)
if (under.length) {
  console.log(`  ${under.length} αρχεία έπεσαν κάτω από το όριό τους. Κλείδωσε το κέρδος:`)
  console.log('  node scripts/guard-field-name.mjs --write')
}
