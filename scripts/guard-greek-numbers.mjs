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

for (const file of files) {
  const rel = file.split('\\').join('/')
  if (SELF.some(s => rel.endsWith(s))) continue
  const src = readFileSync(file, 'utf8')
  const ownFormatters = OWN_FORMATTERS.test(src)

  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '')
    if (!line.trim() || line.trim().startsWith('*')) return

    // `${x.toFixed(1)}%` ή `${x.toFixed(2)} €` — δεκαδικά ΜΕΣΑ σε κείμενο.
    // Το toFixed(0) δεν έχει δεκαδικά, άρα δεν έχει υποδιαστολή να λαθέψει.
    for (const m of line.matchAll(/\$\{[^{}]*\.toFixed\(([1-9])\)[^{}]*\}\s*(%|€)/g)) {
      problems.push({ file: rel, line: i + 1, what: `toFixed(${m[1]}) με ${m[2]} — τελεία αντί για κόμμα`, text: raw.trim() })
    }

    // toLocaleString() χωρίς locale: μορφή του περιηγητή, διαφορετική στον server.
    if (!ownFormatters) {
      for (const _ of line.matchAll(/\.toLocaleString\(\s*\)/g)) {
        problems.push({ file: rel, line: i + 1, what: 'toLocaleString() χωρίς locale — μορφή του περιηγητή', text: raw.trim() })
      }
    }
  })
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

console.log('✅ Ελληνικοί αριθμοί: κάθε ποσοστό και ποσό στην οθόνη περνά από κοινό τύπο.')
