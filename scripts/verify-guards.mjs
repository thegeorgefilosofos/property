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
//     ολόκληρο το φωτεινό θέμα και η κανονική του έκφραση κατάπινε το «}»
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
//   1. τρέχει τον φύλακα ΠΡΙΝ και απαιτεί πράσινο (αλλιώς η δοκιμή δεν λέει
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
import { MUTATIONS } from './lib/mutations.mjs'

const only = process.argv.slice(2).filter(a => !a.startsWith('-'))
const guards = readdirSync('scripts')
  .filter(f => /^guard-.+\.mjs$/.test(f))
  .map(f => f.replace(/^guard-|\.mjs$/g, ''))
  .filter(n => !only.length || only.includes(n))
  .sort()

const treeBefore = execSync('git status --porcelain', { encoding: 'utf8' })

// ═══════════════════════════════════════════════════════════════════════════
// ΔΙΠΛΟ ΚΛΕΙΔΙ ΣΒΗΝΕΙ ΜΙΑ ΑΠΟΔΕΙΞΗ ΧΩΡΙΣ ΝΑ ΤΟ ΠΕΙ ΚΑΝΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΠΙΑΣΜΕΝΟ. Ο χάρτης είχε δύο φορές το κλειδί «security-txt». Στη
// JavaScript η δεύτερη εγγραφή σκεπάζει σιωπηλά την πρώτη: καμία προειδοποίηση
// από τη γλώσσα, καμία από το ESLint (μετρήθηκε, δεν το πιάνει σε .mjs). Η
// εγγραφή που επιβίωσε χάλαγε πεδίο που ο φύλακας δεν κοίταζε, οπότε ο πάγκος
// τον έβγαζε «αποδεδειγμένο» ενώ έμενε πράσινος με το σφάλμα μέσα του.
//
// Ο ΕΛΕΓΧΟΣ ΓΙΝΕΤΑΙ ΣΤΟ ΚΕΙΜΕΝΟ, ΟΧΙ ΣΤΟ ΑΝΤΙΚΕΙΜΕΝΟ. Οταν φτάσει εδώ ως
// αντικείμενο, το διπλό κλειδί έχει ήδη χαθεί. Η μόνη στιγμή που φαίνεται
// είναι όσο ο χάρτης είναι ακόμη πηγαίο κείμενο.
// ═══════════════════════════════════════════════════════════════════════════
{
  const src = readFileSync('scripts/lib/mutations.mjs', 'utf8')
  const keys = [...src.matchAll(/^ {2}'([^']+)':/gm)].map(m => m[1])

  // ΚΑΙ ΤΟ ΑΝΑΠΟΔΟ: ΜΕΤΑΛΛΑΞΗ ΠΟΥ ΔΕΝ ΔΕΙΧΝΕΙ ΣΕ ΦΥΛΑΚΑ. Το κλειδί
  // «brand-mark-edge» καθόταν εδώ χωρίς αντίστοιχο guard-brand-mark-edge.mjs,
  // δηλαδή έγραφε ένα σφάλμα που δεν το δοκίμαζε ποτέ κανείς. Διαβάζεται ως
  // κάλυψη, δεν είναι.
  const known = readdirSync('scripts').filter(f => /^guard-.+\.mjs$/.test(f))
    .map(f => f.replace(/^guard-|\.mjs$/g, ''))
  const orphanKeys = keys.filter(k => !known.includes(k))
  if (orphanKeys.length) {
    console.error(`✗ ${orphanKeys.length} μεταλλάξεις χωρίς φύλακα:\n`)
    for (const k of orphanKeys) console.error(`  «${k}» δεν έχει scripts/guard-${k}.mjs`)
    console.error('\n  Είτε λείπει ο φύλακας, είτε η μετάλλαξη ανήκει σε άλλο κλειδί.\n')
    process.exit(1)
  }

  const dupes = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))]
  if (dupes.length) {
    console.error(`✗ ${dupes.length} διπλά κλειδιά στο scripts/lib/mutations.mjs:\n`)
    for (const d of dupes) console.error(`  «${d}» γράφεται δύο φορές· η δεύτερη σβήνει την πρώτη σιωπηλά`)
    console.error('\n  Κράτα ένα κλειδί ανά φύλακα. Ενας φύλακας με σβησμένη μετάλλαξη\n  δοκιμάζεται με ΑΛΛΟ σφάλμα από αυτό που νομίζεις.\n')
    process.exit(1)
  }
}

/** Τρέχει τον φύλακα και επιστρέφει μόνο αν πέρασε. Η έξοδός του δεν μας νοιάζει. */
const run = (name) => {
  try { execFileSync('node', [`scripts/guard-${name}.mjs`], { stdio: 'pipe' }); return true }
  catch { return false }
}

/** Εφαρμόζει μία μετάλλαξη και επιστρέφει τη συνάρτηση επαναφοράς. */
function apply(m) {
  // ΜΕΡΙΚΑ ΣΦΑΛΜΑΤΑ ΘΕΛΟΥΝ ΔΥΟ ΚΙΝΗΣΕΙΣ ΓΙΑ ΝΑ ΥΠΑΡΞΟΥΝ. Μια μεταβλητή θέματος
  // που λείπει από το σκοτεινό δεν είναι σφάλμα ώσπου κάποιος να τη ΖΗΤΗΣΕΙ:
  // χρειάζεται και η δήλωση στο φωτεινό και η χρήση σε στοιχείο. Το `steps`
  // τις εφαρμόζει μαζί και τις ξηλώνει με την αντίστροφη σειρά.
  if (m.steps) {
    const undos = []
    try { for (const step of m.steps) undos.push(apply(step)) }
    catch (e) { for (const u of undos.reverse()) u(); throw e }
    return () => { for (const u of undos.reverse()) u() }
  }
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
  if (!entry) { problems.push([name, 'ΧΩΡΙΣ ΜΕΤΑΛΛΑΞΗ. Γράψε μία στο scripts/lib/mutations.mjs.']); continue }

  if (!run(name)) { problems.push([name, 'κόκκινος ΠΡΙΝ τη μετάλλαξη. Η δοκιμή δεν λέει τίποτα ώσπου να πρασινίσει.']); continue }

  // ΔΥΟ ΣΗΜΑΣΙΕΣ, ΚΑΙ ΔΙΑΦΕΡΟΥΝ. Ενας ΠΙΝΑΚΑΣ είναι εφεδρική αλυσίδα: αρκεί μία
  // μετάλλαξη να πιαστεί, γιατί οι υπόλοιπες μπορεί να μην εφαρμόζονται σε αυτό
  // το αποθετήριο. Το `every` είναι το αντίθετο: ο φύλακας έχει ΠΟΛΛΟΥΣ κανόνες
  // και κάθε κανόνας θέλει τη δική του απόδειξη. Χωρίς αυτό, ένας φύλακας με
  // τρεις κανόνες περνούσε τον πάγκο αποδεικνύοντας μόνο τον πρώτο.
  const all = !Array.isArray(entry) && Array.isArray(entry.every)
  const list = all ? entry.every : Array.isArray(entry) ? entry : [entry]
  let caught = all, err = null
  for (const m of list) {
    let undo = null, hit = false
    try { undo = apply(m); hit = !run(name) }
    catch (e) { err = e.message }
    finally { if (undo) undo() }
    if (err) break
    if (all) { if (!hit) { caught = false; err = null; problems.push([name, `ΕΜΕΙΝΕ ΠΡΑΣΙΝΟΣ σε έναν από τους ${list.length} κανόνες του: ${m.add || m.file}`]); break } }
    else if (hit) { caught = true; break }
  }
  if (all && !caught) continue

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
console.log(`✅ Και οι ${pass} φύλακες κοκκινίζουν με το σφάλμα τους ξαναφερμένο και πρασινίζουν χωρίς αυτό.`)
