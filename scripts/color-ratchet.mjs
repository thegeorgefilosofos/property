#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΣΤΑΝΙΑ ΧΡΩΜΑΤΟΣ — το ωμό hex μόνο να μειώνεται, ποτέ να μεγαλώνει.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ (Ιούλιος 2026): 232 μοναδικά hex χρώματα σε app/ και
// components/. Σε σηματοδότηση: 57 διαφορετικά μπλε, 23 κόκκινα, 23 πράσινα,
// 19 πορτοκαλί, 14 τιρκουάζ, 7 μωβ. Τρεις ξένες παλέτες μπλεγμένες — Google
// Material, Tailwind, και αυθαίρετα (#111, #eee, #fafafa).
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΠΡΑΓΜΑΤΙΚΟ ΣΦΑΛΜΑ, ΟΧΙ ΑΙΣΘΗΤΙΚΗ ΓΚΡΙΝΙΑ:
//   1. Το app έχει σκοτεινό θέμα. Ένα καρφωμένο #fff ή #111 δουλεύει σε ένα
//      από τα δύο θέματα και σπάει ΣΙΩΠΗΛΑ στο άλλο — καμία δοκιμή δεν το πιάνει.
//   2. Όταν το ίδιο «πράσινο» γράφεται με 23 τρόπους, το χρώμα παύει να είναι
//      σήμα. Ο χρήστης δεν μαθαίνει ποτέ ότι «πράσινο = πληρώθηκε».
//   3. Η προσβασιμότητα ελέγχεται μία φορά στα tokens. Το ωμό hex την παρακάμπτει.
//
// ΓΙΑΤΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΑΠΑΓΟΡΕΥΣΗ: μια μαζική διόρθωση 232 χρωμάτων με το
// χέρι είναι ακριβώς το είδος της αλλαγής που σπάει οθόνες χωρίς να το δει
// κανείς. Έτσι, το υπάρχον χρέος επιτρέπεται, το ΝΕΟ όχι.
//
// ΟΤΑΝ ΚΑΘΑΡΙΖΕΙΣ: κατέβασε το maxHex στο scripts/color-baseline.json για να
// κλειδώσει το κέρδος.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN = ['app', 'components']
const EXT = /\.(tsx|ts)$/

// Αρχεία που ΕΠΙΤΡΕΠΕΤΑΙ να έχουν ωμό hex, με τον λόγο. Δεν είναι χρέος —
// είναι σημεία όπου τα CSS variables δεν υπάρχουν καν κατά την εκτέλεση.
const ALLOW = [
  // Παραγωγή PDF/HTML για εκτύπωση και email: ο παραλήπτης δεν έχει το
  // stylesheet μας, άρα το var(--x) θα έφτανε ως κενό και θα έβγαινε άχρωμο.
  { re: /reportPdf\.ts$/,        why: 'HTML εκτύπωσης — χωρίς stylesheet του app' },
  { re: /accountingReport\.ts$/, why: 'HTML εκτύπωσης — χωρίς stylesheet του app' },
  { re: /rentCertificate\.ts$/,  why: 'HTML εκτύπωσης — χωρίς stylesheet του app' },
  { re: /statement\.ts$/,        why: 'HTML εκτύπωσης — χωρίς stylesheet του app' },
  { re: /xlsxStyle\.ts$/,        why: 'χρώματα Excel — η μορφή θέλει ARGB, όχι CSS' },
  { re: /portfolioXlsx\.ts$/,    why: 'χρώματα Excel — η μορφή θέλει ARGB, όχι CSS' },
  { re: /journalXlsx\.ts$/,      why: 'χρώματα Excel — η μορφή θέλει ARGB, όχι CSS' },
  { re: /exportXlsx\.ts$/,       why: 'χρώματα Excel — η μορφή θέλει ARGB, όχι CSS' },
  { re: /BillsPDFExport\.tsx$/,  why: 'HTML εκτύπωσης — χωρίς stylesheet του app' },
]

const HEX = /#[0-9a-fA-F]{3,8}\b/g

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, acc)
    } else if (EXT.test(name)) acc.push(p)
  }
  return acc
}

const baselinePath = new URL('./color-baseline.json', import.meta.url)
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const cap = baseline.maxHex

const offenders = []
let total = 0

for (const dir of SCAN) {
  let files = []
  try { files = walk(join(ROOT, dir)) } catch { continue }
  for (const f of files) {
    const rel = relative(ROOT, f)
    const allowed = ALLOW.find(a => a.re.test(rel))
    if (allowed) continue
    const src = readFileSync(f, 'utf8')
    const hits = src.match(HEX)
    if (!hits) continue
    total += hits.length
    offenders.push({ file: rel, count: hits.length })
  }
}

offenders.sort((a, b) => b.count - a.count)

// ── ΑΠΟΛΥΤΟΣ ΚΑΝΟΝΑΣ, ΟΧΙ ΚΑΣΤΑΝΙΑ: ΤΟ ΓΑΛΑΖΙΟ ΓΡΑΜΜΕΝΟ ΣΕ RGBA ────────────
// Το `rgba(26,115,232,…)` ΔΕΝ είναι το --accent: είναι το γαλάζιο του ΦΩΤΕΙΝΟΥ
// θέματος, καρφωμένο. Στο σκούρο —που είναι η βάση— το --accent είναι άλλο
// (#8ab4f8), οπότε σαράντα πλακίδια κρατούσαν το χρώμα του λάθους θέματος και
// έμοιαζαν ξένα δίπλα σε αυτά που άλλαζαν σωστά. Το ωμό hex μετριέται με
// καστάνια γιατί μειώνεται σταδιακά· αυτό εδώ μηδενίστηκε, άρα δεν επιστρέφει.
const RAW_ACCENT = /rgba\(\s*26\s*,\s*115\s*,\s*232/g
const rawAccent = []
for (const dir of SCAN) {
  let files = []
  try { files = walk(join(ROOT, dir)) } catch { continue }
  for (const f of files) {
    const rel = relative(ROOT, f)
    const src = readFileSync(f, 'utf8')
    // Τα σχόλια που ΕΞΗΓΟΥΝ το σφάλμα δεν είναι το σφάλμα.
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    const hits = code.match(RAW_ACCENT)
    if (hits) rawAccent.push({ file: rel, count: hits.length })
  }
}
if (rawAccent.length) {
  const n = rawAccent.reduce((s, r) => s + r.count, 0)
  console.error(`🔴 Το γαλάζιο γραμμένο ως rgba(26,115,232,…) — ${n === 1 ? 'μία φορά' : `${n} φορές`}.`)
  console.error('   Αυτό είναι το --accent του ΦΩΤΕΙΝΟΥ θέματος, καρφωμένο: στο σκούρο')
  console.error('   μένει ίδιο ενώ όλα γύρω του αλλάζουν, και ξεχωρίζει ως ξένο.')
  console.error('   ΑΝΤΙΚΑΤΑΣΤΑΣΗ:  α ≤ 0,11 → var(--accent-soft)')
  console.error('                    α ≤ 0,30 → var(--accent-border)')
  console.error('                    μεγαλύτερο → color-mix(in srgb, var(--accent) Ν%, transparent)')
  for (const o of rawAccent) console.error(`     ${String(o.count).padStart(4)}  ${o.file}`)
  process.exit(1)
}

if (total > cap) {
  console.error(`🔴 Καστάνια χρώματος ΑΠΕΤΥΧΕ — ${total} ωμά hex > όριο ${cap} (+${total - cap}).`)
  console.error('   Προστέθηκε νέο καρφωμένο χρώμα. Χρησιμοποίησε σημασιολογικό token:')
  console.error('     κείμενο   → --text-primary / --text-secondary / --text-tertiary')
  console.error('     φόντο     → --bg-base / --bg-surface / --bg-elevated')
  console.error('     περίγραμμα→ --border-subtle / --border-default / --border-strong')
  console.error('     σήμα      → --positive / --negative / --warning / --info / --accent')
  console.error('   Αν το χρώμα δεν ΣΗΜΑΙΝΕΙ κάτι, κάν’ το ουδέτερο αντί να διαλέξεις απόχρωση.')
  console.error('   Χειρότερα αρχεία τώρα:')
  for (const o of offenders.slice(0, 10)) console.error(`     ${String(o.count).padStart(4)}  ${o.file}`)
  process.exit(1)
}

console.log(`✅ Καστάνια χρώματος πέρασε — ${total} ωμά hex ≤ όριο ${cap}.`)
if (total < cap) {
  console.log(`   ↓ Βελτίωση κατά ${cap - total}. Κατέβασε το "maxHex" στο scripts/color-baseline.json στο ${total} για να κλειδώσει.`)
}
