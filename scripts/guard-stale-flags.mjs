#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΧΕΙΡΟΓΡΑΦΗ ΣΗΜΑΙΑ ΔΙΠΛΑ ΣΕ ΧΕΙΡΟΓΡΑΦΗ ΗΜΕΡΟΜΗΝΙΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΒΡΕΘΗΚΕ ΣΕ ΤΡΙΑ ΣΗΜΕΙΑ ΤΗΝ ΙΔΙΑ ΜΕΡΑ:
//
//   TabLoanData.tsx    status:'active', deadline_urgent:true, με προθεσμία
//                      αίτησης 31/05/2026 — δέκα εβδομάδες πριν
//   TabLoan.tsx        ταξινομούσε με βάση το `deadline_urgent`, οπότε το
//                      κλειστό πρόγραμμα καθόταν πρώτο στη λίστα
//   SpitiMouPanel.tsx  αντίστροφη μέτρηση ως τη λήξη ΣΥΜΒΟΛΑΙΩΝ, με σήμα
//                      «Πιθανώς επιλέξιμο», σε πρόγραμμα κλειστό για αιτήσεις
//
// Και στα τρία, η ημερομηνία και η σημαία συμφωνούσαν την ημέρα που γράφτηκαν.
// Ο χρόνος περνά μόνος του· η σημαία όχι. Καμία επιμέλεια δεν το λύνει αυτό —
// μόνο το να πάψει η κατάσταση να είναι γραμμένη με το χέρι.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ ΕΔΩ: ότι καμία ΝΕΑ χειρόγραφη σημαία κατάστασης ή επείγοντος δεν
// γράφεται δίπλα σε ημερομηνία μέσα στα ίδια δεδομένα. Η κατάσταση παράγεται
// από το `lib/loans/programStatus.ts`, που συγκρίνει με το σήμερα.
//
// ΤΙ ΔΕΝ ΕΛΕΓΧΕΤΑΙ: ημερομηνίες έναρξης ισχύος νόμων («από 1/1/2025 ισχύουν…»),
// που είναι ιστορικά γεγονότα και δεν λήγουν, ούτε τα `verified_at`, που είναι
// ακριβώς ο έντιμος τρόπος να δηλωθεί η παλαιότητα.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

/** Σημαίες που δηλώνουν «τι ισχύει τώρα» και γράφονται με το χέρι. */
const FLAG = /\b(deadline_urgent|deadlineUrgent|is_urgent|isUrgent|is_active|isActive|status)\s*:\s*(true|false|'(?:active|open|upcoming|expired|closed)')/g

/** Ημερομηνία προθεσμίας στην ίδια εγγραφή. */
const DEADLINE_KEY = /\b(deadline|application_deadline|applicationDeadline|contractDeadline|expires_at|valid_until)\s*:/

/**
 * Τα σημεία όπου η σημαία είναι ΘΕΜΙΤΗ, με τον λόγο.
 *
 * Το `status:'upcoming'` είναι η μόνη πληροφορία που ΔΕΝ βγαίνει από το
 * ημερολόγιο — ότι κάτι δεν έχει ανοίξει ακόμη — και γι' αυτό το διαβάζει
 * ρητά η `programStatus`.
 */
const ALLOWED_FILES = new Set([
  'lib/loans/programStatus.ts',
])

const findings = []
for (const file of findSources()) {
  if (ALLOWED_FILES.has(file) || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
  const src = readFileSync(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    if (!DEADLINE_KEY.test(line)) return
    for (const m of line.matchAll(FLAG)) {
      // Το «upcoming» επιτρέπεται: το ημερολόγιο δεν ξέρει τι δεν άνοιξε ακόμη.
      if (m[2] === "'upcoming'") continue
      findings.push({ file, line: i + 1, flag: m[0] })
    }
  })
}

if (findings.length) {
  console.error('✗ Χειρόγραφη σημαία κατάστασης δίπλα σε προθεσμία:\n')
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.flag}`)
  console.error(`\n${findings.length} ευρήματα. Η κατάσταση προκύπτει από τις ημερομηνίες:`)
  console.error('programStatus() στο lib/loans/programStatus.ts. Μόνο το «upcoming» γράφεται,')
  console.error('γιατί το ημερολόγιο δεν ξέρει τι δεν έχει ανοίξει ακόμη.')
  process.exit(1)
}
console.log('✓ καμία χειρόγραφη σημαία κατάστασης δίπλα σε προθεσμία')
