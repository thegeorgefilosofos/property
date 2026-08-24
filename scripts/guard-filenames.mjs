#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΟΝΟΜΑ ΤΟΥ ΑΡΧΕΙΟΥ ΕΙΝΑΙ ΤΟ ΠΡΩΤΟ ΠΡΑΓΜΑ ΠΟΥ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Δεκαοκτώ εξαγωγές, ονόματα σε ΤΡΕΙΣ γλώσσες:
//
//     greeklish   enoikio_ · atzenta_ · xartofylakio_ · katastasi_ ·
//                 sygkrisi_akiniton_ · rythmiseis_akinitou_ · diamones_ ·
//                 logistiki_ · dynamiki-timologisi_ · toxoxreolysio_ ·
//                 fakelos_logisti_ · archeio.csv
//     αγγλικά     checklist_ · E2_…_property-os · propertyos-referral-
//     ελληνικά    Αποθηκευμένα_δάνεια_ · Ημερολόγιο_ · απογραφή.csv
//
// Ο φάκελος λήψεων ενός Έλληνα ιδιοκτήτη γέμιζε λέξεις που δεν είναι ούτε
// ελληνικά ούτε αγγλικά. Δύο από τα «ελληνικά» ήταν και άτονα.
//
// ΚΑΙ ΔΥΟ ΦΟΡΕΣ ΤΟ ΙΔΙΟ ΣΦΑΛΜΑ ΣΤΟΝ ΚΑΘΑΡΙΣΜΟ. Το `portfolioXlsx.ts` και το
// `journalXlsx.ts` περνούσαν το όνομα από `.replace(/[^\w\-.]/g, '')` — το `\w`
// είναι ASCII, άρα ΚΑΘΕ ελληνικός χαρακτήρας διαγραφόταν. Ένα όνομα
// «Συγκριτικό Ιανουάριος 2026» κατέβαινε ως «__2026.xlsx».
//
// Ο ΚΑΝΟΝΑΣ: το όνομα που φτάνει στον δίσκο γράφεται στα ελληνικά, με τόνους,
// και ο καθαρισμός γίνεται μόνο από τη `safeFilename` του `lib/core/download.ts`,
// που κρατά τα ελληνικά και βγάζει μόνο ό,τι απαγορεύουν τα συστήματα αρχείων.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/** Οι συναρτήσεις των οποίων το ΠΡΩΤΟ όρισμα είναι όνομα αρχείου. */
const CALL_NAMES = 'downloadXlsx|downloadTableXlsx|downloadWorkbook|downloadFile|downloadCsv'
const CALLS = new RegExp(`\\b(${CALL_NAMES})\\s*\\(\\s*(\`[^\`]*\`|'[^']*'|"[^"]*")`, 'g')
// ΞΕΧΩΡΙΣΤΟ ΑΝΤΙΓΡΑΦΟ ΧΩΡΙΣ `g`: η `test()` σε καθολικό regex κρατά θέση
// (`lastIndex`) ανάμεσα στις κλήσεις και αρχίζει να χάνει ταιριάσματα σιωπηλά.
const HAS_CALL = new RegExp(`\\b(${CALL_NAMES})\\s*\\(`)

/** Καθαρισμός ονόματος με ASCII κλάση — σβήνει σιωπηλά τα ελληνικά. */
const ASCII_STRIP = /replace\(\s*\/\[\^\\w[^/]*\/[gimsuy]*\s*,/

/** Λατινική λέξη τριών γραμμάτων και πάνω μέσα σε όνομα αρχείου. */
const LATIN_WORD = /[A-Za-z]{3,}/

/**
 * Λατινικά που ΔΕΝ είναι greeklish: ονόματα προϊόντων και τεχνικοί όροι που
 * γράφονται έτσι και στα ελληνικά κείμενα της εφαρμογής.
 */
const ALLOWED = /^(PROPERWISE|xlsx|csv|pdf|ics|vcf|zip|json|kWh|myAADE|Excel|IBAN|QR)$/i

const findings = []
for (const file of findSources()) {
  if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return

    // Ο ίδιος καθαρισμός χρησιμοποιείται ΚΑΙ για κλειδιά αποθήκευσης στο
    // Supabase Storage, όπου είναι σωστός: το κλειδί είναι εσωτερικό, γίνεται
    // μοναδικό με χρονοσφραγίδα, και το ΠΡΑΓΜΑΤΙΚΟ όνομα φυλάσσεται δίπλα του
    // στη στήλη `file_name`. Ελέγχεται μόνο όταν το αποτέλεσμα κατεβαίνει.
    if (ASCII_STRIP.test(line) && lines.slice(i, i + 4).some(l => HAS_CALL.test(l) || /XLSX\.writeFile/.test(l))) {
      findings.push({ file, line: i + 1, what: 'καθαρισμός ονόματος λήψης με ASCII κλάση — σβήνει τα ελληνικά', code: t.slice(0, 100) })
    }

    for (const m of line.matchAll(CALLS)) {
      // Το περιεχόμενο του λεκτικού, χωρίς τα εισαγωγικά και χωρίς τις
      // παρεμβολές `${…}`, που είναι μεταβλητές και όχι γραμμένο κείμενο.
      const raw = m[2].slice(1, -1).replace(/\$\{[^}]*\}/g, ' ')
      for (const w of raw.match(new RegExp(LATIN_WORD, 'g')) || []) {
        if (ALLOWED.test(w)) continue
        findings.push({ file, line: i + 1, what: `λατινικά στο όνομα αρχείου: «${w}»`, code: m[2] })
      }
    }
  })
}

if (findings.length) {
  console.error('✗ Ονόματα αρχείων εκτός του ελληνικού κανόνα:\n')
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.what}\n    ${f.code}`)
  console.error(`\n${findings.length} ευρήματα. Το όνομα γράφεται στα ελληνικά, με τόνους·`)
  console.error('ο καθαρισμός γίνεται από τη safeFilename() του lib/core/download.ts.')
  process.exit(1)
}
console.log('✓ κάθε όνομα αρχείου είναι ελληνικό, και κανένας καθαρισμός δεν σβήνει ελληνικά')
