#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΕΔΙΟ ΠΟΣΟΥ ΔΕΝ ΤΕΝΤΩΝΕΤΑΙ ΣΕ 750 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Το `repeat(auto-fit, minmax(…, 1fr))` ΤΕΝΤΩΝΕΙ τις στήλες για να γεμίσει το
// διαθέσιμο πλάτος. Σε πλέγμα ΠΛΑΚΙΔΙΩΝ αυτό είναι σωστό: η κάρτα θέλει τον
// χώρο της. Σε πλέγμα ΠΕΔΙΩΝ είναι το αντίθετο από σωστό: δύο πεδία ποσού σε
// οθόνη 1.500 εικονοστοιχείων γίνονται δύο κουτιά των 750, το καθένα για να
// δεχτεί τέσσερα ψηφία.
//
// Δεν είναι μόνο άσχημο. Το μέγεθος ενός πεδίου είναι υπόσχεση για το
// περιεχόμενό του: ένα κουτί μισής οθόνης λέει «γράψε πολλά εδώ», και δίπλα
// στην ετικέτα του η φόρμα διαβάζεται ασύμμετρη και πρόχειρη.
//
// Η ΛΥΣΗ ΖΕΙ ΣΤΑ TOKENS. Το `formGrid(min, max)` βάζει ΑΝΩ όριο στη στήλη, με
// `auto-fill` αντί για `auto-fit`: τα πεδία στοιχίζονται από αριστερά, κρατούν
// σταθερό μέγεθος, και ο επιπλέον χώρος μένει χώρος.
//
// ΗΤΑΝ ΚΑΣΤΑΝΙΑ, ΕΓΙΝΕ ΤΕΙΧΟΣ. Το μοτίβο υπήρχε σε πενήντα εφτά σημεία
// γραμμένο με το χέρι, και ένας φύλακας που θα απαιτούσε να διορθωθούν όλα την
// πρώτη μέρα θα παρακαμπτόταν τη δεύτερη. Ο αριθμός κατέβαινε· τώρα είναι
// μηδέν, οπότε η γραμμή αναφοράς δεν είναι πια ανοχή αλλά κανόνας.
//
// ΤΙ ΜΕΤΡΑΕΙ. Πλέγμα `auto-fit` που περιέχει πεδίο φόρμας μέσα στις επόμενες
// γραμμές — δηλαδή <NumberInput>, <TextInput>, <DatePicker>, <CustomSelect> ή
// <input>. Ένα πλέγμα με κάρτες, πλακίδια ή κείμενο δεν το αφορά.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

const BASELINE = 'scripts/form-grid-baseline.json'
const FIELD = /<(NumberInput|TextInput|DatePicker|CustomSelect|input)\b/
const STRETCH = /repeat\(auto-fit,\s*minmax\([^)]*\)\s*,?\s*1fr\)\)|repeat\(auto-fit,\s*minmax\((?:min\([^)]*\)|[^,]*),\s*1fr\)\)/

const findings = []
for (const f of findSources()) {
  if (f.includes('.test.') || !f.endsWith('.tsx')) continue
  const lines = readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    if (!STRETCH.test(line)) return
    // Πεδίο μέσα στις επόμενες οκτώ γραμμές; Τότε είναι πλέγμα φόρμας.
    const window = lines.slice(i + 1, i + 9).join('\n')
    if (FIELD.test(window)) findings.push(`${f}:${i + 1}`)
  })
}

const count = findings.length
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).max : count

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, JSON.stringify({
    _comment: 'Πλέγματα ΠΕΔΙΩΝ που τεντώνονται με auto-fit. Μόνο προς τα κάτω. Η λύση είναι το formGrid() των tokens.',
    max: count,
  }, null, 2) + '\n')
  console.log(`γράφτηκε γραμμή αναφοράς: ${count}`)
  process.exit(0)
}

if (count > base) {
  console.error(`✗ ${count} πλέγματα πεδίων που τεντώνονται > όριο ${base} (+${count - base}):\n`)
  for (const x of findings.slice(0, 20)) console.error('  ' + x)
  console.error('\n  Χρησιμοποίησε `formGrid(min, max)` από τα tokens αντί για')
  console.error('  `repeat(auto-fit, minmax(…, 1fr))`. Το πεδίο ποσού έχει φυσικό πλάτος.')
  process.exit(1)
}
console.log(`✓ πλέγματα πεδίων που τεντώνονται: ${count} ≤ όριο ${base}`)
