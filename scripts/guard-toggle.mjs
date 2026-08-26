#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΔΙΑΚΟΠΤΗΣ ΤΟΝ ΖΩΓΡΑΦΙΖΕΙ ΕΝΑ ΑΡΧΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΠΙΑΣΜΕΝΟ ΑΠΟ ΤΟΝ ΙΔΙΟ ΤΟΝ ΧΡΗΣΤΗ ΣΕ ΤΑΜΠΛΕΤΑ. Στο παράθυρο «Νέα
// επαφή» οι διακόπτες αποδίδονταν ως γκρίζα πλακάκια με σκούρο κύκλο μέσα,
// δηλαδή σαν χαλασμένο στοιχείο. Δύο οθόνες πιο κάτω, στις συνδρομές, ο ΙΔΙΟΣ
// διακόπτης αποδιδόταν σωστά: κάψουλα με περίγραμμα και καθαρό δείκτη.
//
// Ο λόγος ήταν ότι δεν ήταν ο ίδιος. Υπήρχαν ΤΡΙΑ χειρόγραφα αντίγραφα:
//
//   TabContacts.tsx        46×26, φόντο --border-default όταν είναι κλειστός,
//                          δείκτης --bg-surface. Σε σκούρο θέμα: γκρι σε γκρι.
//                          Χωρίς role="switch", χωρίς aria-checked, στόχος 26.
//   PropertyAssistant.tsx  42×26, ίδιο φόντο, δείκτης ωμό #fff.
//   BillsBudget.tsx        36×20, με σχόλιο που ΠΑΡΑΔΕΧΟΤΑΝ ότι ζωγραφίζει
//                          «οπτικά τον ΙΔΙΟ διακόπτη» με τα ίδια νούμερα.
//
// ΤΟ ΚΟΙΝΟ `Toggle` ΤΑ ΕΧΕΙ ΟΛΑ: κάψουλα με περίγραμμα που φαίνεται και στα δύο
// θέματα, στόχο αφής 44 με αρνητικό περιθώριο ώστε η διάταξη να μην κουνηθεί,
// role="switch", aria-checked, πληκτρολόγιο.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'

const OWNER = 'app/dashboard/components/UIComponents.tsx'

/** Ενα χειρόγραφο ελατήριο: κουμπί με role="switch" που φτιάχνει μόνο του σχήμα. */
const HANDMADE = /role=["']switch["']/
/** Το αποτύπωμα του ελατηρίου: στρογγυλό κουτί με απόλυτα τοποθετημένο δείκτη. */
const DRAWS_TRACK = /borderRadius:\s*\d+[,\s}]/

const strays = []
for (const file of projectFiles()) {
  if (!/\.tsx$/.test(file) || file === OWNER) continue
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (!HANDMADE.test(line)) return
    // Το χειρόγραφο φαίνεται από το ότι φτιάχνει σχήμα ΤΟ ΙΔΙΟ, μέσα στις
    // επόμενες γραμμές του: πλάτος, ύψος και ακτίνα.
    const block = lines.slice(i, i + 4).join('\n')
    if (DRAWS_TRACK.test(block) && /width:\s*\d+/.test(block) && /height:\s*\d+/.test(block)) {
      strays.push(`${file}:${i + 1}`)
    }
  })
}

const owner = readFileSync(OWNER, 'utf8')
const ownerHas = /export function Toggle\b/.test(owner) && /export function ToggleTrack\b/.test(owner)

if (strays.length || !ownerHas) {
  console.error('✗ ο διακόπτης δεν είναι ένας:\n')
  for (const f of strays) console.error(`  ${f}  ζωγραφίζει δικό του ελατήριο`)
  if (!ownerHas) console.error(`  ${OWNER}  δεν εξάγει Toggle και ToggleTrack`)
  console.error(`
  Ο διακόπτης ζει στο ${OWNER}:

    <Toggle on={…} onChange={…} ariaLabel="…" size="sm" />   με στόχο αφής 44
    <ToggleTrack on={…} size="sm" />                          μόνο η όψη, μέσα
                                                              σε δικό σου κουμπί

  Ενα χειρόγραφο αντίγραφο δεν σπάει τίποτα σήμερα. Την επόμενη φορά που θα
  αλλάξει η όψη, θα μείνει πίσω και ο χρήστης θα δει δύο διαφορετικούς
  διακόπτες στην ίδια εφαρμογή. Ακριβώς αυτό συνέβη.
`)
  process.exit(1)
}
console.log('✓ ένας διακόπτης, στο ' + OWNER)
