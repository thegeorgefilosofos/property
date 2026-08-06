#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΥΠΟΔΙΑΣΤΟΛΗ ΣΤΑ ΕΛΛΗΝΙΚΑ ΕΙΝΑΙ ΚΟΜΜΑ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ
//
// Το `toFixed(1)` γράφει ΠΑΝΤΑ τελεία, ανεξάρτητα από γλώσσα. Δεκαοκτώ σημεία
// της εφαρμογής έδειχναν «4.2%» ακριβώς δίπλα σε ποσά «1.234,56 €» — δύο
// συστήματα αρίθμησης στην ίδια γραμμή. Και δεν είναι μόνο αισθητικό: στα
// ελληνικά η τελεία είναι χωριστής ΧΙΛΙΑΔΩΝ, οπότε το «4.200» της σύγκρισης
// διαβαζόταν ως τέσσερις χιλιάδες διακόσια.
//
// Το ίδιο ισχύει για το `toLocaleString()` χωρίς locale: παίρνει τη γλώσσα του
// ΠΕΡΙΗΓΗΤΗ. Ο ίδιος αριθμός έβγαινε αλλιώς σε αγγλόφωνο Chrome — και ο server
// (Node, locale «C») τύπωνε τρίτη μορφή, οπότε το SSR δεν συμφωνούσε με το
// client render.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ
//
// Αριθμός που φτάνει στην οθόνη περνά από τους κοινούς τύπους του
// `components/tokens.ts` (fe, feAuto, fp, fn, feOr, fpOr). Το `toFixed` για
// υπολογισμό ή για κλειδί δεν πειράζεται — μόνο όταν το αποτέλεσμα μπαίνει
// αμέσως σε κείμενο («…%», «… €», σε template που αποδίδεται).
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = []
const walk = d => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    // Τα τεστ τυπώνουν στην κονσόλα, όχι σε χρήστη — δεν τα αφορά η μορφή.
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) files.push(p)
  }
}
for (const root of ['app', 'lib', 'components']) { try { walk(root) } catch {} }

// Οι ίδιοι οι τύποι ορίζονται εδώ — δεν ελέγχουν τον εαυτό τους.
const SELF = ['components/tokens.ts']
// Οι εκτυπώσιμες αναφορές (PDF) έχουν δικούς τους, ρητά ελληνικούς formatters
// στο ίδιο αρχείο· δεν περνούν από τα tokens γιατί είναι αυτόνομο HTML.
const OWN_FORMATTERS = /const (?:eur|pct|money|nf|fmtE?)\s*=\s*\([^)]*\)\s*=>[^\n]*toLocaleString\('el-GR'/

const problems = []
// Καστάνια: μόνο προς τα κάτω.
const decimals = []
const DECIMALS_LIMIT = 23

for (const file of files) {
  const rel = file.split('\\').join('/')
  if (SELF.some(s => rel.endsWith(s))) continue
  const src = readFileSync(file, 'utf8')
  const ownFormatters = OWN_FORMATTERS.test(src)

  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '')
    if (!line.trim() || line.trim().startsWith('*')) return

    // Δεκαδικά ΜΕΣΑ σε κείμενο. Το toFixed(0) δεν έχει δεκαδικά, άρα δεν έχει
    // υποδιαστολή να λαθέψει — δεν ελέγχεται.
    //
    // ΤΟ ΔΟΛΑΡΙ ΕΙΝΑΙ ΠΡΟΑΙΡΕΤΙΚΟ, ΚΑΙ ΑΥΤΟ ΗΤΑΝ Η ΤΡΥΠΑ. Η πρώτη έκδοση ζητούσε
    // `\$\{…\}`, δηλαδή έπιανε μόνο template literals. Το JSX όμως γράφει
    // `{ltv.toFixed(1)}%` ΧΩΡΙΣ δολάριο — και πέντε σημεία στα Δάνεια πέρασαν
    // καθαρά, με τον φύλακα να λέει «✅ κάθε ποσοστό περνά από κοινό τύπο».
    // Ένας έλεγχος που δηλώνει κάλυψη την οποία δεν έχει είναι χειρότερος από
    // κανέναν έλεγχο: σταματάς να κοιτάς.
    for (const m of line.matchAll(/\$?\{[^{}]*\.toFixed\(([1-9])\)[^{}]*\}\s*(%|€)/g)) {
      problems.push({ file: rel, line: i + 1, what: `toFixed(${m[1]}) με ${m[2]} — τελεία αντί για κόμμα`, text: raw.trim() })
    }

    // ── Η ΤΡΙΤΗ ΤΡΥΠΑ: ΣΩΣΤΟ ΚΟΜΜΑ, ΛΑΘΟΣ ΠΛΗΘΟΣ ΔΕΚΑΔΙΚΩΝ ────────────────
    // Το `.toLocaleString('el-GR')` βάζει σωστά κόμμα και τελεία — και ακριβώς
    // γι' αυτό περνούσε καθαρό. Δεν βάζει όμως ΔΕΚΑΔΙΚΑ: γράφει «751 €» εκεί που
    // ο κοινός τύπος γράφει «751,00 €». Στην ίδια οθόνη του Ημερολογίου, το ίδιο
    // ποσό εμφανιζόταν «751,00 €» στη γραμμή σύνοψης (που περνούσε από τύπο
    // νομίσματος) και «751 €» στη ράγα δίπλα (που δεν περνούσε). Και το ευρώ
    // κολλούσε στο ψηφίο, χωρίς το κενό που βάζει ο τύπος.
    //
    // Ο φύλακας υπήρχε για να μην υπάρχουν δύο συστήματα αρίθμησης στην ίδια
    // γραμμή, και δύο υπήρχαν. Έλεγχος που δηλώνει κάλυψη την οποία δεν έχει
    // είναι χειρότερος από κανέναν έλεγχο.
    if (!ownFormatters) {
      for (const m of line.matchAll(/\.toLocaleString\(\s*'el-GR'((?:\s*,[^)]*)?)\)\s*\}?\s*(?:€|%)/g)) {
        // Αν η κλήση ζητά ήδη ρητά δύο δεκαδικά, γράφει ό,τι θα έγραφε ο κοινός
        // τύπος. Είναι διπλοτυπία, όχι ασυνέπεια — και δεν την πιάνει αυτός ο φύλακας.
        if (/minimumFractionDigits:\s*2/.test(m[1])) continue
        decimals.push({ file: rel, line: i + 1, text: raw.trim() })
      }
    }

    // toLocaleString() χωρίς locale: μορφή του περιηγητή, διαφορετική στον server.
    if (!ownFormatters) {
      for (const _ of line.matchAll(/\.toLocaleString\(\s*\)/g)) {
        problems.push({ file: rel, line: i + 1, what: 'toLocaleString() χωρίς locale — μορφή του περιηγητή', text: raw.trim() })
      }
    }
  })
}

// ── Η ΚΑΣΤΑΝΙΑ ΤΩΝ ΔΕΚΑΔΙΚΩΝ ───────────────────────────────────────────────
if (decimals.length > DECIMALS_LIMIT) {
  console.error(`✗ ${decimals.length} ποσά/ποσοστά με toLocaleString('el-GR') χωρίς δύο δεκαδικά — πάνω από το όριο ${DECIMALS_LIMIT}.\n`)
  console.error('  Γράφουν «751 €» εκεί που ο κοινός τύπος γράφει «751,00 €», και κολλούν')
  console.error('  το ευρώ στο ψηφίο. Στην ίδια οθόνη συνυπάρχουν και οι δύο μορφές.\n')
  for (const d of decimals) console.error(`  ${d.file}:${d.line}\n     ${d.text.slice(0, 110)}`)
  console.error('\n  Γράψε: fe(x) για ποσό, fp(x) για ποσοστό.')
  process.exit(1)
}

if (problems.length) {
  console.error('✗ Αριθμοί σε οθόνη χωρίς ελληνική μορφή.\n')
  console.error('  Στα ελληνικά η υποδιαστολή είναι ΚΟΜΜΑ και ο χωριστής χιλιάδων ΤΕΛΕΙΑ.')
  console.error('  Το «4.2%» δίπλα στο «1.234,56 €» δεν είναι μόνο ασυνεπές: η τελεία')
  console.error('  διαβάζεται ως χιλιάδες.\n')
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.what}\n     ${p.text.slice(0, 110)}`)
  console.error('\n  Γράψε: fp(x)         αντί για `${x.toFixed(1)}%`')
  console.error('  ή:     fe(x, 0)      αντί για `${x.toFixed(2)} €`')
  console.error('  ή:     fn(x, 1)      για αριθμό χωρίς μονάδα')
  process.exit(1)
}

console.log(`✅ Ελληνικοί αριθμοί: σωστή υποδιαστολή παντού· ${decimals.length} σημεία χωρίς δύο δεκαδικά ≤ όριο ${DECIMALS_LIMIT}.`)
if (decimals.length < DECIMALS_LIMIT) {
  console.log(`   ↓ Βελτίωση κατά ${DECIMALS_LIMIT - decimals.length}. Κατέβασε το DECIMALS_LIMIT σε ${decimals.length}.`)
}
