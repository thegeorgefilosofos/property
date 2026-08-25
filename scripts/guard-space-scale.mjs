#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΣΑΡΑΝΤΑ ΕΝΝΕΑ ΑΠΟΣΤΑΣΕΙΣ ΓΙΑ ΜΙΑ ΔΙΕΠΑΦΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ (24/08/2026). 5.068 δηλώσεις padding, margin και gap σε app/
// και components/, σε 49 ΔΙΑΦΟΡΕΤΙΚΕΣ τιμές: 10, 0, 8, 12, 6, 14, 16, 4, 2,
// 3, 9, 7, 5, 11, 1, 18, 20, 24, 13, 22, 26, 28, 40, 48, 32, 30, 34, 15, 17,
// 38, 60, 72, 19, 42, 44, 52, 56, 64, 84 και δέκα αρνητικές. Καμία δεν είναι
// λάθος από μόνη της. Μαζί σημαίνουν ότι δεν υπάρχει κλίμακα: υπάρχουν 5.068
// αποφάσεις της στιγμής.
//
// ΤΙ ΚΟΣΤΙΖΕΙ. Δύο κάρτες δίπλα δίπλα αναπνέουν αλλιώς και ο χρήστης το
// βλέπει χωρίς να μπορεί να πει τι φταίει. Και όταν αποφασιστεί ότι οι κάρτες
// θέλουν λίγο περισσότερο αέρα, η αλλαγή δεν είναι μία γραμμή: είναι πεντακόσιες
// αναζητήσεις με το χέρι και σε τριάντα θα ξεχαστεί.
//
// Ο ΚΑΝΟΝΑΣ. Άρτιοι ώς το 16, τετράδες πάνω από αυτό:
//
//     0 2 4 6 8 10 12 14 16 20 24 28 32 36 40 …
//
// Δεν είναι αυθαίρετος. Βγήκε από το ΙΔΙΟ το αποθετήριο: οι έντεκα τιμές που
// ορίζει καλύπτουν το 80,4% των δηλώσεων. Το 3, το 9, το 7 και το 11, που
// μαζί μετρούν 513 φορές, δεν καλύπτουν τίποτα· απλώς έτυχαν.
//
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΜΑΖΙΚΗ ΕΠΑΝΕΓΓΡΑΦΗ. Μια επανεγγραφή χιλίων αποστάσεων χωρίς
// οπτική επαλήθευση μετακινεί τη διεπαφή σε χίλια σημεία ταυτόχρονα. Ο κανόνας
// είναι «ούτε μία παραπάνω» και το όριο κατεβαίνει σε κάθε πέρασμα.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'

const BASELINE = JSON.parse(readFileSync('scripts/space-baseline.json', 'utf8'))

const PROPS = 'padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingInline|paddingBlock'
  + '|margin|marginTop|marginBottom|marginLeft|marginRight|marginInline|marginBlock'
  + '|gap|rowGap|columnGap'
/** `gap: 10` ή `padding: '10px'` — ωμός αριθμός, ένας, χωρίς σύνθετη τιμή. */
const RAW = new RegExp(`\\b(?:${PROPS}):\\s*'?(-?[0-9]+)(?:px)?'?\\s*[,}\\n]`, 'g')

/** Άρτιοι ώς το 16, τετράδες πάνω από αυτό. Το πρόσημο δεν αλλάζει το πλέγμα. */
const onScale = (n) => {
  const v = Math.abs(n)
  return v <= 16 ? v % 2 === 0 : v % 4 === 0
}

const hits = []
const values = new Map()
for (const file of projectFiles("'app/**/*.tsx' 'app/*.tsx' 'components/**/*.tsx' 'components/*.tsx' 'app/**/*.ts' 'components/*.ts'")) {
  if (file.includes('.test.')) continue
  let count = 0
  for (const m of readFileSync(file, 'utf8').matchAll(RAW)) {
    const n = Number(m[1])
    if (onScale(n)) continue
    count++
    values.set(n, (values.get(n) || 0) + 1)
  }
  if (count) hits.push({ file, count })
}
const total = hits.reduce((n, h) => n + h.count, 0)

if (total > BASELINE.maxOffScale) {
  console.error(`✗ ${total} αποστάσεις εκτός πλέγματος, πάνω από το όριο ${BASELINE.maxOffScale}:\n`)
  hits.sort((a, b) => b.count - a.count).slice(0, 8).forEach(h => console.error(`   ${h.count}× ${h.file}`))
  const worst = [...values].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([v, n]) => `${v}×${n}`).join(' ')
  console.error(`
  Οι πιο συχνές: ${worst}

  Το πλέγμα είναι άρτιοι ώς το 16 και τετράδες πάνω από αυτό:
  0 2 4 6 8 10 12 14 16 20 24 28 32 … Στρογγύλεψε στο πλησιέστερο σκαλί.
`)
  process.exit(1)
}
if (total < BASELINE.maxOffScale)
  console.log(`✓ ${total} αποστάσεις εκτός πλέγματος, κάτω από το όριο ${BASELINE.maxOffScale}. Κατέβασε το όριο.`)
else
  console.log(`✓ ${total} αποστάσεις εκτός πλέγματος, όσες και το όριο`)
