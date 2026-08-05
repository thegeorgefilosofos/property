#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΠΟΥ ΥΠΑΡΧΕΙ ΕΤΟΣ, Η ΚΛΙΜΑΚΑ ΠΡΕΠΕΙ ΝΑ ΤΟ ΑΚΟΛΟΥΘΕΙ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ
//
// Η `rentalIncomeTax` έχει προεπιλογή την κλίμακα του 2026. Οι οθόνες όμως
// ΕΠΙΛΕΓΟΥΝ έτος: η Πύλη Λογιστή ξεκινά στο προηγούμενο, η Λογιστική και το Ε2
// έχουν επιλογέα. Κανένας καλών δεν περνούσε κλίμακα, οπότε μια δήλωση του 2025
// —αυτή που υποβάλλεται σήμερα— υπολογιζόταν με τους συντελεστές του 2026:
//
//   20.000 € ενοίκια, φορολογητέο 19.000 €
//   σωστά 4.250 €   ·   έδειχνε 3.550 €   ·   −700 € (−16%)
//
// Δεν το έπιανε τίποτα: ο τύπος είναι σωστός, η κλίμακα είναι σωστή, απλώς
// είναι η κλίμακα ΑΛΛΗΣ ΧΡΟΝΙΑΣ. Ένα τεστ μονάδας περνά και στις δύο.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ
//
// Σε κάθε αρχείο που έχει μεταβλητή έτους (`year`) ΚΑΙ καλεί `rentalIncomeTax`,
// η κλήση πρέπει να περνά ρητά κλίμακα. Το ίδιο για `incomeStatement` και
// `consolidateIndividual`, που δέχονται `brackets`.
//
// Αρχεία χωρίς έννοια έτους (δημόσιοι υπολογιστές «για φέτος», landing) δεν
// αγγίζονται: εκεί η προεπιλογή είναι η σωστή απάντηση.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = []
const walk = d => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p) && !p.endsWith('.test.ts')) files.push(p)
  }
}
for (const root of ['app', 'lib']) { try { walk(root) } catch {} }

// Το ίδιο το greekTax.ts ορίζει τις κλίμακες — δεν ελέγχει τον εαυτό του.
const SELF = ['lib/billing/greekTax.ts']

// Κάθε κλήση `fn(...)` με τα ορίσματά της ΟΛΟΚΛΗΡΑ, ακόμη κι όταν απλώνονται σε
// πολλές γραμμές — αλλιώς μια κλήση σπασμένη σε τρεις σειρές φαίνεται κενή.
function callSites(src, fn) {
  const out = []
  const open = new RegExp(`\\b${fn}\\(`, 'g')
  let m
  while ((m = open.exec(src))) {
    const start = m.index + m[0].length
    let depth = 1, i = start
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
    }
    const args = src.slice(start, i - 1)
    const before = src.slice(0, m.index)
    const line = before.split('\n').length
    open.lastIndex = i
    // Αναφορά μέσα σε σχόλιο (π.χ. «γράψε rentalIncomeTax(x, …)») δεν είναι κλήση.
    if (before.slice(before.lastIndexOf('\n') + 1).includes('//')) continue
    out.push({ line, args, text: (src.split('\n')[line - 1] || '').trim() })
  }
  return out
}

// Πόσα ορίσματα στο πρώτο επίπεδο; Τα κόμματα μέσα σε κλήσεις, αντικείμενα και
// πίνακες δεν χωρίζουν ορίσματα. Οι γωνιακές αγκύλες ΔΕΝ μετράνε ως βάθος: το
// `i => ({…})` και κάθε σύγκριση `a > b` θα τις χαλούσαν, και τα generics μέσα
// σε λίστα ορισμάτων δεν εμφανίζονται εδώ.
function topLevelArgCount(args) {
  if (!args.trim()) return 0
  let depth = 0, n = 1
  for (const ch of args) {
    if (ch === '(' || ch === '{' || ch === '[') depth++
    else if (ch === ')' || ch === '}' || ch === ']') depth--
    else if (ch === ',' && depth === 0) n++
  }
  return n
}

const problems = []

for (const file of files) {
  if (SELF.some(s => file.endsWith(s))) continue
  const src = readFileSync(file, 'utf8')

  // Έχει το αρχείο την έννοια «επιλεγμένο έτος»; Ψάχνουμε κατάσταση ή παράμετρο,
  // όχι απλή αναφορά σε μεταβλητή που τυχαίνει να λέγεται year.
  const hasYear = /\b(?:const \[year|useState\(athensYear|useState\(nowYear|year:\s*number|,\s*year\s*:|\(stays[^)]*,\s*year\b)/.test(src)
  if (!hasYear) continue

  // rentalIncomeTax(x) χωρίς δεύτερο όρισμα.
  // Δεύτερο όρισμα = κόμμα στο ΠΡΩΤΟ επίπεδο παρενθέσεων (τα κόμματα μέσα σε
  // εμφωλευμένη κλήση ή αντικείμενο δεν μετράνε).
  for (const call of callSites(src, 'rentalIncomeTax')) {
    let depth = 0, hasSecond = false
    for (const ch of call.args) {
      if (ch === '(' || ch === '{' || ch === '[') depth++
      else if (ch === ')' || ch === '}' || ch === ']') depth--
      else if (ch === ',' && depth === 0) { hasSecond = true; break }
    }
    if (!hasSecond) problems.push({ file, line: call.line, what: 'rentalIncomeTax χωρίς κλίμακα', text: call.text })
  }

  // incomeStatement / consolidateIndividual σε αρχείο με έτος, χωρίς brackets.
  //
  // ΑΝΑ ΚΛΗΣΗ, ΟΧΙ ΑΝΑ ΑΡΧΕΙΟ: ένα «περνάει brackets κάπου μέσα στο αρχείο» θα
  // κάλυπτε τη διπλανή κλήση που δεν περνά. Και το `regime: 'business'` ΔΕΝ
  // αγγίζει την κλίμακα ενοικίων — πάει από το άρθρο 15 (ατομική) ή 22%+5%
  // (νομικό πρόσωπο), όπου το `brackets` αγνοείται (lib/accounting/statement.ts).
  // Απαιτώντας το εκεί, ο φύλακας θα ζητούσε νεκρό όρισμα.
  // `incomeStatement({ …, brackets })` — κλειδί μέσα στο αντικείμενο.
  for (const call of callSites(src, 'incomeStatement')) {
    if (/regime:\s*'business'/.test(call.args)) continue
    if (/\bbrackets\b/.test(call.args)) continue
    problems.push({ file, line: call.line, what: 'incomeStatement χωρίς brackets', text: call.text })
  }
  // `consolidateIndividual(items, brackets)` — ΘΕΣΗ, όχι κλειδί. Ζητάμε δεύτερο
  // όρισμα· ένα `/brackets/` στο κείμενο δεν θα το έβλεπε ποτέ, γιατί εκεί
  // γράφεται `rentalBracketsForYear(year)`.
  for (const call of callSites(src, 'consolidateIndividual')) {
    if (topLevelArgCount(call.args) >= 2) continue
    problems.push({ file, line: call.line, what: 'consolidateIndividual χωρίς brackets', text: call.text })
  }
}

if (problems.length) {
  console.error('✗ Φορολογικός υπολογισμός με έτος, αλλά με προεπιλεγμένη κλίμακα.\n')
  console.error('  Οι νέες κλίμακες ισχύουν για εισοδήματα ΑΠΟ 1/1/2026. Δήλωση του 2025')
  console.error('  υπολογισμένη με 2026 υποεκτιμά τον φόρο κατά ~16%.\n')
  for (const p of problems) console.error(`  ${p.file}:${p.line}  ${p.what}\n     ${p.text.slice(0, 110)}`)
  console.error('\n  Γράψε: rentalIncomeTax(x, rentalBracketsForYear(year))')
  console.error('  ή:     incomeStatement({ …, brackets: rentalBracketsForYear(year) })')
  process.exit(1)
}

console.log('✅ Φορολογική χρονιά: κάθε υπολογισμός με έτος περνά ρητή κλίμακα.')
