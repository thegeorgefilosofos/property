#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΦΥΛΑΚΑΣ ΔΟΚΙΜΑΖΕΤΑΙ ΜΕ ΤΟ ΣΦΑΛΜΑ ΤΟΥ ΞΑΝΑΦΕΡΜΕΝΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ ΚΑΙ ΟΧΙ ΥΠΟΘΕΤΙΚΟ. Μέσα σε μία εβδομάδα βρέθηκαν
// ΤΡΕΙΣ φύλακες που τύπωναν πράσινο πάνω από πραγματικά σφάλματα:
//
//   · ο `guard-em-dash` διάβαζε παράθυρο τριών γραμμών, οπότε καμία παράγραφος
//     τεσσάρων δεν εξεταζόταν ποτέ. Επτά μεγάλες παύλες ζούσαν από κάτω του.
//   · ο `guard-contrast` έσβηνε σχόλια μόνο από τους επιλογείς, οπότε έχανε
//     ολόκληρο το φωτεινό θέμα, και η κανονική του έκφραση κατάπινε το «}»
//     ώστε διάβαζε ένα μπλοκ στα δύο.
//   · ο κανόνας των 44 εικονοστοιχείων ήταν σταθερά με σχόλιο «ο κανόνας του
//     έργου» που ΚΑΜΙΑ γραμμή κώδικα δεν διάβαζε.
//
// Ένας φύλακας που δεν κοκκινίζει ποτέ δεν είναι ουδέτερος: είναι χειρότερος
// από ανύπαρκτος, γιατί το πράσινο του διαβάζεται ως «ελέγχθηκε».
//
// ΠΩΣ ΔΟΚΙΜΑΖΕΤΑΙ. Για κάθε φύλακα υπάρχει μια ΜΕΤΑΛΛΑΞΗ: μια μικρή, στοχευμένη
// αλλαγή που εισάγει ακριβώς το σφάλμα για το οποίο γράφτηκε. Ο πάγκος:
//
//   1. τρέχει τον φύλακα ΠΡΙΝ, και απαιτεί πράσινο (αλλιώς η δοκιμή δεν λέει
//      τίποτα: ένας μονίμως κόκκινος φύλακας θα «περνούσε» χωρίς να ελέγχει),
//   2. εφαρμόζει τη μετάλλαξη,
//   3. τρέχει τον φύλακα ΞΑΝΑ και απαιτεί κόκκινο,
//   4. επαναφέρει το αρχείο ΠΑΝΤΑ, ακόμη κι αν κάτι πετάξει.
//
// ΚΑΙ ΤΟ ΔΕΝΤΡΟ ΜΕΝΕΙ ΟΠΩΣ ΤΟ ΒΡΗΚΕ. Στο τέλος συγκρίνεται η κατάσταση του git
// με αυτήν της αρχής. Ένας πάγκος που πειράζει αρχεία οφείλει να το αποδεικνύει,
// όχι να το υπόσχεται.
//
// ΤΟ ΚΑΤΑΛΟΓΟ ΤΟΝ ΚΡΑΤΑ ΚΛΕΙΣΤΟ Ο ΙΔΙΟΣ Ο ΠΑΓΚΟΣ: φύλακας χωρίς μετάλλαξη
// είναι αποτυχία, όχι παράλειψη. Έτσι ο επόμενος φύλακας που θα γραφτεί δεν
// μπορεί να μπει χωρίς την απόδειξη ότι πιάνει κάτι.
//
//   npm run guards:verify              όλοι
//   npm run guards:verify -- em-dash   ένας
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync, execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { MUTATIONS } from './guard-mutations.mjs'

const only = process.argv.slice(2).filter(a => !a.startsWith('-'))
const guards = readdirSync('scripts')
  .filter(f => /^guard-.+\.mjs$/.test(f))
  .map(f => f.replace(/^guard-|\.mjs$/g, ''))
  .filter(n => !only.length || only.includes(n))
  .sort()

const treeBefore = execSync('git status --porcelain', { encoding: 'utf8' })

/** Τρέχει τον φύλακα και επιστρέφει μόνο αν πέρασε. Η έξοδός του δεν μας νοιάζει. */
const run = (name) => {
  try { execFileSync('node', [`scripts/guard-${name}.mjs`], { stdio: 'pipe' }); return true }
  catch { return false }
}

/** Εφαρμόζει μία μετάλλαξη και επιστρέφει τη συνάρτηση επαναφοράς. */
function apply(m) {
  if (m.add) {
    const dir = dirname(m.add)
    const dirExisted = existsSync(dir)
    if (!dirExisted) mkdirSync(dir, { recursive: true })
    if (existsSync(m.add)) throw new Error(`η μετάλλαξη θα σκέπαζε υπαρκτό αρχείο: ${m.add}`)
    writeFileSync(m.add, m.content)
    return () => { if (existsSync(m.add)) unlinkSync(m.add); if (!dirExisted) rmSync(dir, { recursive: true, force: true }) }
  }
  if (m.remove) {
    const before = readFileSync(m.remove, 'utf8')
    unlinkSync(m.remove)
    return () => writeFileSync(m.remove, before)
  }
  const before = readFileSync(m.file, 'utf8')
  if (!before.includes(m.from)) throw new Error(`το «from» δεν βρέθηκε στο ${m.file}`)
  writeFileSync(m.file, before.replace(m.from, m.to))
  return () => writeFileSync(m.file, before)
}

let pass = 0
const problems = []

for (const name of guards) {
  const entry = MUTATIONS[name]
  if (!entry) { problems.push([name, 'ΧΩΡΙΣ ΜΕΤΑΛΛΑΞΗ. Γράψε μία στο scripts/guard-mutations.mjs.']); continue }

  if (!run(name)) { problems.push([name, 'κόκκινος ΠΡΙΝ τη μετάλλαξη. Η δοκιμή δεν λέει τίποτα ώσπου να πρασινίσει.']); continue }

  const list = Array.isArray(entry) ? entry : [entry]
  let caught = false, err = null
  for (const m of list) {
    let undo = null
    try { undo = apply(m); caught = !run(name) }
    catch (e) { err = e.message }
    finally { if (undo) undo() }
    if (caught || err) break
  }

  if (err) problems.push([name, `η μετάλλαξη δεν εφαρμόστηκε: ${err}`])
  else if (!caught) problems.push([name, 'ΕΜΕΙΝΕ ΠΡΑΣΙΝΟΣ με το σφάλμα του μέσα. Δεν ελέγχει αυτό που νομίζει.'])
  else { pass++; process.stdout.write('·') }
}

process.stdout.write('\n')

const treeAfter = execSync('git status --porcelain', { encoding: 'utf8' })
if (treeAfter !== treeBefore) {
  console.error('\n✗ Ο ΠΑΓΚΟΣ ΑΦΗΣΕ ΤΟ ΔΕΝΤΡΟ ΑΛΛΑΓΜΕΝΟ. Καμία μετάλλαξη δεν επιτρέπεται να επιβιώσει.')
  console.error('  πριν:\n' + treeBefore + '  μετά:\n' + treeAfter)
  process.exit(1)
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} από ${guards.length} φύλακες δεν αποδεικνύουν ότι πιάνουν κάτι:\n`)
  for (const [n, why] of problems) console.error(`  ${n.padEnd(24)} ${why}`)
  console.error('\n  Ένας φύλακας που δεν κοκκινίζει ποτέ διαβάζεται ως «ελέγχθηκε» χωρίς να ελέγχει.')
  process.exit(1)
}
console.log(`✅ Και οι ${pass} φύλακες κοκκινίζουν με το σφάλμα τους ξαναφερμένο, και πρασινίζουν χωρίς αυτό.`)
