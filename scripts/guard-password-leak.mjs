#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΛΕΓΧΟΣ ΔΙΑΡΡΟΗΣ ΠΡΕΠΕΙ ΝΑ ΦΤΑΝΕΙ ΩΣ ΤΗΝ ΥΠΟΒΟΛΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΕΚΛΕΙΣΕ, ΚΑΙ ΓΙΑΤΙ ΗΤΑΝ ΤΟΣΟ ΔΥΣΚΟΛΟ ΝΑ ΤΟ ΔΕΙΣ. Ο έλεγχος
// διαρρευσάντων κωδικών ήταν γραμμένος πλήρως (`lib/auth/leakedPassword.ts`,
// k-anonymity με Have I Been Pwned), δηλωμένος στην CSP, με δικά του tests, ΚΑΙ
// συνδεδεμένος στο `components/PasswordStrength.tsx`. Το μήνυμα εμφανιζόταν
// σωστά στην οθόνη.
//
// Και μετά ο χρήστης πατούσε «Εγγραφή», και ο κωδικός γινόταν δεκτός.
//
// Το εύρημα ζούσε ΜΟΝΟ μέσα στο component. Οι τρεις οθόνες που ορίζουν κωδικό
// κοιτούσαν αποκλειστικά την πολιτική ισχύος. Δηλαδή: όλα τα κομμάτια υπήρχαν,
// όλα δούλευαν, και η προστασία ήταν μηδενική — το χειρότερο είδος σφάλματος,
// γιατί κάθε επιμέρους έλεγχος έδειχνε πράσινο.
//
// Ο κίνδυνος είναι το credential stuffing: ο επιτιθέμενος δεν μαντεύει,
// δοκιμάζει ζεύγη email/κωδικού που ήδη ξέρει από άλλη διαρροή. Απέναντι σε
// αυτό, προειδοποίηση που προσπερνιέται δεν κάνει τίποτα. Το NIST SP 800-63B
// το λέει ρητά: κωδικός σε γνωστό σύνολο διαρροών ΑΠΟΡΡΙΠΤΕΤΑΙ.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ: κάθε αρχείο που αποδίδει `<PasswordStrength …>` οφείλει
//   1. να περνά `onLeaked`, δηλαδή να ΑΚΟΥΕΙ το εύρημα, και
//   2. να το χρησιμοποιεί κάπου αλλού στο ίδιο αρχείο — αλλιώς το ακούει και
//      το πετά, που είναι ακριβώς η κατάσταση από την οποία ήρθαμε.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

const COMPONENT = 'components/PasswordStrength.tsx'
const findings = []

for (const file of findSources()) {
  if (!file.endsWith('.tsx') || file.includes('.test.') || file.endsWith(COMPONENT)) continue
  const src = readFileSync(file, 'utf8')
  if (!/<PasswordStrength\b/.test(src)) continue

  // Κάθε απόδοση του component, με το άνοιγμα της ετικέτας της.
  for (const m of src.matchAll(/<PasswordStrength\b[^>]*\/?>/g)) {
    const line = src.slice(0, m.index).split('\n').length
    if (!/\bonLeaked=/.test(m[0])) {
      findings.push({ file, line, why: 'δεν περνά `onLeaked`: το εύρημα δεν φτάνει ποτέ στην οθόνη' })
      continue
    }
    // Ποιο state δέχεται το εύρημα;
    const setter = /onLeaked=\{\s*([A-Za-z0-9_$]+)\s*\}/.exec(m[0])?.[1]
    if (!setter) {
      findings.push({ file, line, why: 'το `onLeaked` δεν είναι σταθερή αναφορά (setter του useState)' })
      continue
    }
    // Το state που γεμίζει ο setter, κατά τη σύμβαση `const [x, setX] = useState`.
    const stateName = /^set([A-Z])(.*)$/.exec(setter)
    if (!stateName) {
      findings.push({ file, line, why: `το \`${setter}\` δεν ακολουθεί τη σύμβαση setΌνομα` })
      continue
    }
    const state = stateName[1].toLowerCase() + stateName[2]
    // Χρησιμοποιείται πουθενά ΕΚΤΟΣ από τη δήλωσή του και το πέρασμά του;
    const uses = [...src.matchAll(new RegExp(`\\b${state}\\b`, 'g'))].length
    if (uses < 2) {
      findings.push({ file, line, why: `το \`${state}\` δηλώνεται και δεν το διαβάζει κανείς: η φραγή δεν εφαρμόζεται` })
    }
  }
}

if (findings.length) {
  console.error('✗ Ο έλεγχος διαρροής δεν φτάνει ως την υποβολή:\n')
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.why}`)
  console.error('\n  Το σχήμα, ίδιο και στις τρεις οθόνες που ορίζουν κωδικό:')
  console.error('    const [leakedPw, setLeakedPw] = useState<string | null>(null)')
  console.error('    const leaked = leakedPw !== null && leakedPw === password')
  console.error('    <PasswordStrength password={password} onLeaked={setLeakedPw} />')
  console.error('    …και το `leaked` μπαίνει ΚΑΙ στο disabled ΚΑΙ στον έλεγχο της υποβολής.')
  process.exit(1)
}
console.log('✓ κάθε οθόνη κωδικού ακούει και εφαρμόζει το εύρημα διαρροής')
