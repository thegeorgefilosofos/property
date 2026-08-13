#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΦΥΛΑΚΑΣ ΠΟΥ ΔΕΝ ΤΡΕΧΕΙ ΔΕΝ ΦΥΛΑΕΙ — ΔΙΝΕΙ ΤΗΝ ΕΝΤΥΠΩΣΗ ΟΤΙ ΦΥΛΑΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΜΕΤΡΗΜΕΝΟ: τρεις φύλακες ήταν γραμμένοι, δηλωμένοι στο `package.json`, με
// πλήρη τεκμηρίωση του σφάλματος που έπιαναν — και κανένα workflow δεν τους
// καλούσε:
//
//     guard-empty-states.mjs    δύο κενές καταστάσεις, όχι πέντε διατυπώσεις
//     guard-native-fields.mjs   καμία ντόπια λίστα του λειτουργικού
//     guard-dead-exports.mjs    καμία εξαγωγή που δεν την καλεί κανείς
//
// Είναι ακριβώς το ίδιο σφάλμα με τη σουίτα `components/confirmBus.test.ts`,
// που είχε τριάντα ελέγχους και ο εκτελεστής δεν κοίταζε καν τον φάκελό της.
// Και στις δύο περιπτώσεις το κόστος δεν είναι ο χαμένος έλεγχος: είναι ότι
// κανείς δεν ξέρει ότι λείπει. Η λίστα στο `package.json` διαβάζεται ως
// «αυτά ελέγχονται».
//
// Η ΑΣΥΜΜΕΤΡΙΑ ΕΙΝΑΙ ΤΟ ΠΡΟΒΛΗΜΑ. Το να προσθέσεις εντολή στο `package.json`
// είναι μία γραμμή· το να τη συνδέσεις στο CI είναι άλλο αρχείο, άλλη σύνταξη,
// άλλη στιγμή. Η φυσική κίνηση σταματά στην πρώτη. Δεν διορθώνεται με προσοχή.
//
// ΤΙ ΔΕΝ ΕΙΝΑΙ ΦΥΛΑΚΑΣ: γεννήτριες κώδικα, τοπικά sandbox, δοκιμές που θέλουν
// ζωντανό διακομιστή. Απαριθμούνται ρητά, με τον λόγο.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'

const CI = '.github/workflows/'

/** Εντολές που ΔΕΝ είναι φύλακες, άρα δεν οφείλουν να τρέχουν σε κάθε push. */
const NOT_A_GUARD = {
  'db-types':  'γεννήτρια τύπων από τη βάση — τρέχει στο δικό της workflow',
  'pg-schema': 'τοπικό sandbox Postgres — θέλει εγκατεστημένη βάση',
  'e2e':       'δοκιμή άκρο-σε-άκρο — θέλει ζωντανό διακομιστή',
  'e2e:dashboard': 'δοκιμή άκρο-σε-άκρο — θέλει ζωντανό διακομιστή, και για το δεύτερο μέρος λογαριασμό δοκιμών',
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).scripts || {}
const workflows = readdirSync(CI)
  .filter(f => /\.ya?ml$/.test(f))
  .map(f => readFileSync(CI + f, 'utf8'))
  .join('\n')

const orphans = []
for (const [name, cmd] of Object.entries(pkg)) {
  if (name in NOT_A_GUARD) continue
  const m = cmd.match(/scripts\/[\w.-]+/)
  if (!m) continue                                    // dev/build/start — όχι φύλακας
  if (workflows.includes(m[0]) || workflows.includes(`npm run ${name}`)) continue
  orphans.push({ name, file: m[0] })
}

if (orphans.length) {
  console.error(`✗ ${orphans.length} ${orphans.length === 1 ? 'φύλακας γραμμένος' : 'φύλακες γραμμένοι'} και ΜΗ συνδεδεμένοι σε workflow.\n`)
  console.error('  Δεν τρέχουν ποτέ. Η παρουσία τους στο package.json διαβάζεται όμως')
  console.error('  ως «αυτά ελέγχονται» — δηλαδή είναι χειρότεροι από ανύπαρκτοι.\n')
  for (const o of orphans) console.error(`  npm run ${o.name}   →   ${o.file}`)
  console.error(`\n  ΔΙΟΡΘΩΣΗ: πρόσθεσε βήμα στο ${CI}ci.yml. Αν δεν είναι φύλακας`)
  console.error('  (γεννήτρια, sandbox, e2e), δήλωσέ το στο NOT_A_GUARD εδώ, με τον λόγο.')
  process.exit(1)
}

const guarded = Object.keys(pkg).filter(n => !(n in NOT_A_GUARD) && /scripts\//.test(pkg[n])).length
console.log(`✅ Κάλυψη CI: και οι ${guarded} φύλακες τρέχουν σε workflow.`)
