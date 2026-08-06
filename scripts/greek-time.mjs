#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΣΤΑΝΙΑ ΕΛΛΗΝΙΚΗΣ ΩΡΑΣ — το «σήμερα» δεν βγαίνει ποτέ από UTC.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ ΚΑΙ ΑΠΟΔΕΙΓΜΕΝΟ (Αύγουστος 2026)
// Ο server τρέχει σε UTC· η Ελλάδα είναι UTC+2 τον χειμώνα, UTC+3 το καλοκαίρι.
// Το `new Date().toISOString()` γυρίζει ΠΑΝΤΑ UTC, οπότε κάθε ημερολογιακή
// ημερομηνία που βγαίνει από αυτό είναι λάθος τις πρώτες ώρες κάθε νύχτας:
//
//   01:30 ξημερώματα 6ης Αυγούστου στην Αθήνα
//     new Date().toISOString().slice(0, 10)  →  «2026-08-05»   ← ΧΘΕΣ
//
// Δύο ως τρεις ώρες κάθε νύχτα, η εφαρμογή νόμιζε ότι είναι χθες. Τι κόστιζε:
//   • Δαπάνη στη 1 π.μ. της 1ης Ιουλίου καταγραφόταν ως 30ή Ιουνίου —
//     ΛΑΘΟΣ ΦΟΡΟΛΟΓΙΚΟΣ ΜΗΝΑΣ.
//   • Προθεσμία που λήγει σήμερα εμφανιζόταν ληγμένη.
//   • Η προθεσμία δήλωσης μισθωτηρίου, που έχει νομικές συνέπειες.
//
// ΤΙ ΕΙΝΑΙ ΣΦΑΛΜΑ ΚΑΙ ΤΙ ΟΧΙ
//   ΣΦΑΛΜΑ:  new Date().toISOString().slice(0, 10)   → ημερολογιακή ημερομηνία
//            new Date().toISOString().split('T')[0]  → το ίδιο
//            new Date().toISOString().slice(0, 7)    → ημερολογιακός μήνας
//   ΣΩΣΤΟ:   new Date().toISOString()  σκέτο          → χρονική ΣΤΙΓΜΗ (updated_at,
//            paid_at, created_at). Το UTC είναι η σωστή αποθήκευση για στιγμή.
//   ΣΩΣΤΟ:   κάποιαΗμερομηνία.toISOString().slice(0,10) → μορφοποίηση ΔΟΘΕΙΣΑΣ
//            ημερομηνίας, όχι παραγωγή του «σήμερα».
//
// Η ΛΥΣΗ: lib/core/time.ts — athensToday(), athensMonth(), daysUntil(), κ.λπ.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ: τα σημεία ήταν δεκάδες και η μαζική
// διόρθωση με το χέρι είναι ακριβώς το είδος της αλλαγής που σπάει οθόνες χωρίς
// να το δει κανείς. Τα κρίσιμα (φόρος, προθεσμίες, δαπάνες) διορθώθηκαν πρώτα·
// το υπόλοιπο χρέος επιτρέπεται, το ΝΕΟ όχι.
//
// ΟΤΑΝ ΚΑΘΑΡΙΖΕΙΣ: κατέβασε το maxOffenders στο scripts/greek-time-baseline.json.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN = ['app', 'lib', 'components']
const EXT = /\.(tsx|ts)$/

// Αρχεία που ΕΠΙΤΡΕΠΕΤΑΙ να παράγουν ημερομηνία από UTC, με τον λόγο.
const ALLOW = [
  { re: /lib\/core\/time\.ts$/,      why: 'η ίδια η υλοποίηση της ελληνικής ώρας' },
  { re: /lib\/core\/time\.test\.ts$/, why: 'τα τεστ συγκρίνουν ρητά UTC με ελληνική ώρα' },
  { re: /\.test\.ts$/,               why: 'τεστ με καρφωμένο χρόνο, ντετερμινιστικά' },
]

// ═══ Η ΔΕΥΤΕΡΗ ΜΟΡΦΗ ΤΟΥ ΙΔΙΟΥ ΣΦΑΛΜΑΤΟΣ: Η ΔΙΑΦΟΡΑ ΗΜΕΡΩΝ ════════════════
// Ο φύλακας έπιανε μόνο την παραγωγή του «σήμερα» από UTC. Είκοσι σημεία
// έκαναν κάτι ισοδύναμα λάθος με το ΧΕΡΙ:
//
//     Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
//
// Το `new Date('2026-08-10')` είναι μεσάνυχτα UTC· το `Date.now()` πραγματική
// ώρα. Στις 01:30 της 10ης Αυγούστου στην Αθήνα η διαφορά είναι +1,5 ώρα, και
// το `Math.ceil` τη στρογγυλοποιεί σε 1: μια προθεσμία που λήγει ΣΗΜΕΡΑ
// εμφανίζεται ως «σε 1 ημέρα». Δύο έως τρεις ώρες κάθε νύχτα, σε κάθε σήμα
// λήξης, κάθε φίλτρο «≤7 ημέρες», κάθε προτεραιότητα υπενθύμισης.
//
// Χειρότερα: άλλα σημεία χρησιμοποιούσαν `Math.round` και άλλα `Math.ceil`,
// δηλαδή η ΙΔΙΑ ημερομηνία έβγαζε διαφορετικό αριθμό ημερών σε δύο οθόνες.
//
// Η `daysUntil` του lib/core/time συγκρίνει ΗΜΕΡΟΛΟΓΙΑΚΕΣ ημέρες Αθήνας, όχι
// χιλιοστά του δευτερολέπτου. Δεν υπάρχει λόγος να ξαναγραφτεί με το χέρι.
const HANDROLLED_DAYDIFF =
  /Math\.(?:ceil|round|floor|trunc)\s*\(\s*\(?\s*new Date\([^)]*\)\s*\.getTime\(\)\s*-\s*(?:Date\.now\(\)|new Date\(\)\.getTime\(\)|now\.getTime\(\)|today\.getTime\(\))[\s\S]{0,20}?86_?400_?000/g

// Μόνο η παραγωγή ΗΜΕΡΟΛΟΓΙΑΚΗΣ ημερομηνίας από το τώρα. Το σκέτο toISOString()
// για χρονική στιγμή δεν πιάνεται — και σωστά.
const OFFENDING = [
  /new Date\(\)\s*\.\s*toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*(?:10|7)\s*\)/g,
  /new Date\(\)\s*\.\s*toISOString\(\)\s*\.\s*split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/g,
  // Πολυγραμμικό: `new Date()\n  .toISOString()\n  .slice(0, 10)`
  /new Date\(\)\s*\n?\s*\.toISOString\(\)\s*\n?\s*\.(?:slice\(\s*0\s*,\s*(?:10|7)\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/g,
]

function walk(dir, acc = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return acc }
  for (const name of entries) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, acc)
    } else if (EXT.test(name)) acc.push(p)
  }
  return acc
}

const offenders = []
const dayDiffs = []
for (const file of SCAN.flatMap(d => walk(join(ROOT, d)))) {
  const rel = relative(ROOT, file).split('\\').join('/')
  if (ALLOW.some(a => a.re.test(rel))) continue
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    for (const re of OFFENDING) {
      re.lastIndex = 0
      if (re.test(line)) { offenders.push(`${rel}:${i + 1}`); break }
    }
    HANDROLLED_DAYDIFF.lastIndex = 0
    if (HANDROLLED_DAYDIFF.test(line)) dayDiffs.push(`${rel}:${i + 1}`)
  })
  // Πολυγραμμικά, σε ολόκληρο το αρχείο
  for (const re of OFFENDING.slice(2)) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src)) !== null) {
      const lineNo = src.slice(0, m.index).split('\n').length
      const tag = `${rel}:${lineNo}`
      if (!offenders.includes(tag)) offenders.push(tag)
    }
  }
}

const baselinePath = join(ROOT, 'scripts/greek-time-baseline.json')
let max = 0
try { max = JSON.parse(readFileSync(baselinePath, 'utf8')).maxOffenders ?? 0 } catch {}

const n = offenders.length
if (n > max) {
  console.error(`❌ Ημερολογιακή ημερομηνία από UTC: ${n} σημεία > όριο ${max}.\n`)
  console.error('   Νέα σημεία (ή αύξηση):')
  for (const o of offenders.slice(0, 40)) console.error(`     ${o}`)
  console.error(`
   Το «σήμερα» πρέπει να βγαίνει από την ΕΛΛΗΝΙΚΗ ώρα:

     import { athensToday, athensMonth } from '@/lib/core/time'
     const today = athensToday()          // αντί για new Date().toISOString().slice(0,10)
     const month = athensMonth()          // αντί για .slice(0,7)

   Το σκέτο new Date().toISOString() για updated_at/paid_at ΕΙΝΑΙ σωστό και δεν
   πιάνεται από αυτόν τον έλεγχο — μια χρονική στιγμή αποθηκεύεται σε UTC.
`)
  process.exit(1)
}

// ── Η διαφορά ημερών γραμμένη στο χέρι: ΜΗΔΕΝΙΚΗ ΑΝΟΧΗ ────────────────────
// Δεν είναι καστάνια όπως το «σήμερα από UTC»: εκεί το χρέος ήταν δεκάδες
// σημεία και η μαζική διόρθωση επικίνδυνη. Εδώ διορθώθηκαν και τα είκοσι μαζί,
// η αντικατάσταση είναι μηχανική, και η σωστή συνάρτηση υπάρχει ήδη.
if (dayDiffs.length > 0) {
  console.error(`❌ Διαφορά ημερών γραμμένη στο χέρι σε ${dayDiffs.length} σημεία.\n`)
  for (const o of dayDiffs) console.error(`     ${o}`)
  console.error(`
   Το \`new Date('2026-08-10')\` είναι μεσάνυχτα UTC, το \`Date.now()\` πραγματική
   ώρα: τις πρώτες ώρες κάθε νύχτας μια προθεσμία που λήγει ΣΗΜΕΡΑ βγαίνει
   «σε 1 ημέρα». Και το ceil με το round δίνουν ΔΙΑΦΟΡΕΤΙΚΗ απάντηση για την
   ίδια ημερομηνία, οπότε δύο οθόνες διαφωνούν.

     import { daysUntil } from '@/lib/core/time'
     const d = daysUntil(isoDate)   // ημερολογιακές ημέρες Αθήνας, ή null
`)
  process.exit(1)
}

if (n < max) {
  console.log(`✅ Ελληνική ώρα: ${n} σημεία ≤ όριο ${max}, καμία χειρόγραφη διαφορά ημερών.`)
  console.log(`   ↓ Βελτίωση κατά ${max - n}. Κατέβασε το "maxOffenders" στο scripts/greek-time-baseline.json στο ${n}.`)
} else {
  console.log(`✅ Ελληνική ώρα: ${n} σημεία ≤ όριο ${max}, καμία χειρόγραφη διαφορά ημερών.`)
}
