#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΑΝΟΙΓΕΙ ΣΕ ΟΛΑ ΤΑ ΠΡΟΓΡΑΜΜΑΤΑ; ΡΩΤΗΣΕ ΤΑ ΠΡΟΓΡΑΜΜΑΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΔΕΝ ΦΤΑΝΕΙ Η ΔΙΚΗ ΜΑΣ ΒΙΒΛΙΟΘΗΚΗ. Το αρχείο το γράφει η SheetJS και το
// ξαναγράφουμε εμείς στο χέρι για όσα εκείνη δεν γράφει (εικόνα, πάγωμα,
// διάταξη σελίδας). Να το ξαναδιαβάσουμε με την ΙΔΙΑ βιβλιοθήκη δεν αποδεικνύει
// τίποτα: θα συγχωρούσε ακριβώς τα λάθη που κάνει.
//
// Εδώ το ίδιο αρχείο δίνεται σε τρεις ΞΕΝΕΣ υλοποιήσεις, γραμμένες σε τρεις
// γλώσσες από τρεις ομάδες που δεν ξέρουν η μία την άλλη:
//
//   LibreOffice Calc   C++    ο,τι έχει ο κόσμος στον υπολογιστή του
//   openpyxl           Python διαβάζει και τις εικόνες, μία μία
//   calamine           Rust   ο αναγνώστης πίσω από pandas και πολλά εργαλεία
//
// ΚΑΙ ΜΙΑ ΤΕΤΑΡΤΗ ΜΑΤΙΑ: το ίδιο το χαρτί. Το LibreOffice τυπώνει σε PDF και η
// πρώτη σελίδα γίνεται εικόνα, όπου μετριέται αν το σήμα άφησε μελάνι στη θέση
// του και αν ο τίτλος κάθεται δίπλα του ακέραιος.
//
// ΤΙ ΔΕΝ ΕΛΕΓΧΕΤΑΙ ΕΔΩ, ΚΑΙ ΛΕΓΕΤΑΙ ΚΑΘΑΡΑ. Το Microsoft Excel και τα Google
// Sheets δεν τρέχουν σε αυτό το μηχάνημα. Οσα κρίνει το Excel και συγχωρεί το
// LibreOffice —η σειρά των στοιχείων μέσα στο φύλλο, οι σχέσεις, οι τύποι
// περιεχομένου— τα κλειδώνει η σουίτα xlsxReaders.test.ts, που τρέχει στο CI.
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = process.argv[2] || join(mkdtempSync(join(tmpdir(), 'xlsx-')), 'samples')
const keep = process.argv.includes('--keep')

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', NO_PROXY: '*' }, ...opts })

let fails = 0
const bad = (msg) => { fails++; console.log(`  ✗ ${msg}`) }
const good = (msg) => console.log(`  ✓ ${msg}`)

// ── Τα δείγματα ───────────────────────────────────────────────────────────
console.log('Παράγονται τα βιβλία, ένα ανά οικογένεια εξαγωγής…')
const gen = run('npx', ['tsx', 'scripts/xlsx/build-samples.ts', OUT])
if (gen.status !== 0) { console.error(gen.stderr || gen.stdout); process.exit(1) }
const files = readdirSync(OUT).filter(f => f.endsWith('.xlsx')).sort()
console.log(`${files.length} βιβλία στο ${OUT}\n`)

// ── Ζυγισμένα και στοιχισμένα: δεκάδες κάτω από δεκάδες ───────────────────
console.log('── Στοίχιση των πινάκων')
const uni = run('python3', [join('scripts', 'xlsx', 'uniform.py'), OUT])
console.log(uni.stdout.trimEnd())
if (uni.status !== 0) { fails++; if (uni.stderr) console.log(uni.stderr.trimEnd()) }

// ── Ο αναγνώστης της Python και ο αναγνώστης της Rust ─────────────────────
console.log('')
console.log('── openpyxl (Python) και calamine (Rust)')
const py = run('python3', [join('scripts', 'xlsx', 'readers.py'), OUT])
console.log(py.stdout.trimEnd())
if (py.status !== 0) { fails++; if (py.stderr) console.log(py.stderr.trimEnd()) }

// ── Το LibreOffice: ανοίγει, τυπώνει και η σελίδα γίνεται εικόνα ──────────
console.log('\n── LibreOffice Calc')
if (!run('which', ['soffice']).stdout.trim()) {
  console.log('  · δεν είναι εγκατεστημένο σε αυτό το μηχάνημα, παραλείπεται')
} else {
  const pdfDir = join(OUT, 'pdf')
  const conv = run('soffice', ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', pdfDir,
    ...files.map(f => join(OUT, f))], { timeout: 420_000 })
  for (const f of files) {
    const pdf = join(pdfDir, f.replace(/\.xlsx$/, '.pdf'))
    if (!existsSync(pdf)) { bad(`${f}: το LibreOffice δεν το άνοιξε`); continue }
    good(`${f}: ανοίγει και τυπώνεται`)
  }
  if (conv.status !== 0 && conv.stderr) console.log('  ' + conv.stderr.trim().split('\n')[0])
  // Το μελάνι του σήματος, μετρημένο πάνω στη σελίδα.
  const ink = run('python3', [join('scripts', 'xlsx', 'mark-ink.py'), OUT], { timeout: 900_000 })
  console.log(ink.stdout.trimEnd())
  if (ink.status !== 0) { fails++; if (ink.stderr) console.log(ink.stderr.trimEnd()) }
}

if (!keep) rmSync(OUT, { recursive: true, force: true })
console.log(fails ? `\n✗ ${fails} έλεγχοι κόβουν` : '\n✅ Κάθε βιβλίο ανοίγει σε κάθε αναγνώστη που τρέχει εδώ')
process.exit(fails ? 1 : 0)
