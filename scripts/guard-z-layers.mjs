#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΕΙΚΟΣΙ ΜΙΑ ΣΤΑΘΜΕΣ ΓΙΑ ΟΚΤΩ ΕΠΙΠΕΔΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ (24/08/2026). 57 δηλώσεις `zIndex` σε app/ και components/, με
// 21 διαφορετικές τιμές: 1, 2, 3, 20, 40, 50, 60, 99, 100, 200, 700, 900,
// 1000, 1400, 2000, 2100, 3000, 9000, 9997, 9999, 10000.
//
// ΤΙ ΣΗΜΑΙΝΕΙ. Μια εφαρμογή έχει λίγα επίπεδα, και είναι απαριθμήσιμα: τοπική
// στοίβαξη μέσα σε κάρτα, κολλημένη κεφαλίδα, μενού, πλωτή μπάρα, σκηνικό
// παραθύρου, ό,τι ανοίγει μέσα στο παράθυρο, υπόδειξη, μήνυμα συστήματος. Οι
// αριθμοί όμως δεν λένε επίπεδο: λένε «ψηλότερα από αυτό που είχε πρόβλημα
// χθες». Το 9997, το 9999 και το 10000 είναι τρεις τέτοιες απαντήσεις, η μία
// πάνω από την άλλη.
//
// ΤΟ ΚΟΣΤΟΣ ΕΙΝΑΙ ΗΔΗ ΓΡΑΜΜΕΝΟ ΜΕΣΑ ΣΤΟΝ ΚΩΔΙΚΑ. Στο TabTenant.tsx στέκει
// σχόλιο για μενού που κρυβόταν κάτω από τη φόρμα του, με 900 απέναντι σε 950.
// Και σήμερα το ίδιο πρόβλημα υπάρχει αλλού: η ειδοποίηση (Toast, 2000) και το
// παράθυρο (UIComponents, 2000) δηλώνουν την ΙΔΙΑ στάθμη, οπότε ποιο φαίνεται
// πάνω το κρίνει η σειρά στο DOM.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΚΛΙΜΑΚΑ ΤΩΡΑ. Το να δοθεί σε καθεμιά από τις 57 η
// σωστή στάθμη ΑΛΛΑΖΕΙ τη σειρά στοίβαξης, και η σειρά στοίβαξης δεν
// αποδεικνύεται με ανάγνωση: αποδεικνύεται βλέποντας κάθε παράθυρο ανοιχτό.
// Ώσπου να γίνει αυτό, ο αριθμός δεν επιτρέπεται να μεγαλώσει.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'

const BASELINE = JSON.parse(readFileSync('scripts/z-layers-baseline.json', 'utf8'))

/** `zIndex: 9999` — ωμός αριθμός. Το `zIndex: 'var(--float-z)'` δεν πιάνεται. */
const RAW = /\bzIndex:\s*'?(-?[0-9]+)'?/g

const hits = []
const values = new Map()
for (const file of projectFiles("'app/**/*.tsx' 'app/*.tsx' 'components/**/*.tsx' 'components/*.tsx'")) {
  if (file.includes('.test.')) continue
  let count = 0
  for (const m of readFileSync(file, 'utf8').matchAll(RAW)) {
    count++
    const n = Number(m[1])
    values.set(n, (values.get(n) || 0) + 1)
  }
  if (count) hits.push({ file, count })
}
const total = hits.reduce((n, h) => n + h.count, 0)
const distinct = values.size

const over = []
if (total > BASELINE.max) over.push(`${total} ωμές στάθμες, πάνω από το όριο ${BASELINE.max}`)
if (distinct > BASELINE.maxDistinct) over.push(`${distinct} διαφορετικές τιμές, πάνω από το όριο ${BASELINE.maxDistinct}`)

if (over.length) {
  console.error(`✗ ${over.join(' · ')}:\n`)
  hits.sort((a, b) => b.count - a.count).slice(0, 8).forEach(h => console.error(`   ${h.count}× ${h.file}`))
  const ladder = [...values].sort((a, b) => b[0] - a[0]).map(([v, n]) => `${v}×${n}`).join(' ')
  console.error(`
  Η σκάλα σήμερα: ${ladder}

  Τα επίπεδα είναι οκτώ, όχι είκοσι ένα: τοπική στοίβαξη, κολλημένη κεφαλίδα,
  μενού, πλωτή μπάρα, σκηνικό παραθύρου, ό,τι ανοίγει μέσα στο παράθυρο,
  υπόδειξη, μήνυμα συστήματος. Χρησιμοποίησε στάθμη που υπάρχει ήδη.
`)
  process.exit(1)
}
console.log(`✓ ${total} ωμές στάθμες σε ${distinct} τιμές, όσες και τα όρια (${BASELINE.max}, ${BASELINE.maxDistinct})`)
