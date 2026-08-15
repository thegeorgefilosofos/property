#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΔΥΟ ΑΝΤΙΓΡΑΦΑ ΤΟΥ ΙΔΙΟΥ ΑΝΑΛΥΤΗ, ΚΑΙ ΚΑΝΕΝΑ ΔΕΝ ΞΕΡΕΙ ΓΙΑ ΤΟ ΑΛΛΟ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΟΥΝ ΔΥΟ. Ο αναλυτής iCal ζει στο `lib/clients/ical.ts` για την
// εφαρμογή και ΞΑΝΑ, αυτούσιος, μέσα στο `supabase/functions/ical-sync`, γιατί
// το Deno δεν φορτώνει τα modules της εφαρμογής. Η διπλή γραφή είναι ανάγκη
// της πλατφόρμας, όχι επιλογή.
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΦΥΛΑΚΑ. Προστέθηκε η ανάγνωση του `STATUS:CANCELLED`
// στο `lib/clients/ical.ts`, με τεστ που πέρασαν — και το αντίγραφο του edge
// function έμεινε ως είχε. Δηλαδή ο ΜΟΝΟΣ κώδικας που τρέχει στον
// συγχρονισμό δεν είχε τη διόρθωση, ενώ ολόκληρη η σουίτα ήταν πράσινη. Ενα
// αντίγραφο που αποκλίνει σιωπηλά είναι χειρότερο από δύο διαφορετικές
// υλοποιήσεις: μοιάζει ενημερωμένο.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ. Οι πέντε συναρτήσεις που μοιράζονται, με το κείμενό τους
// κανονικοποιημένο (σχόλια, κενά και τα προαιρετικά ερωτηματικά του
// TypeScript δεν μετρούν). Ο,τι αφορά αποκλειστικά τη μία πλευρά —τύποι,
// exports, δίκτυο— μένει έξω.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'

const APP  = 'lib/clients/ical.ts'
const EDGE = 'supabase/functions/ical-sync/index.ts'

/** Οι συναρτήσεις που ΠΡΕΠΕΙ να λένε το ίδιο και στις δύο πλευρές. */
const SHARED = ['unfold', 'toIsoDate', 'parseICal', 'isBlocked']

/**
 * Κόβει το σώμα μιας `function <name>(` μετρώντας άγκιστρα.
 *
 * Το ζύγισμα δεν είναι πολυτέλεια: το `parseICal` έχει εμφωλευμένα μπλοκ, και
 * ένα «ώς το πρώτο `\n}`» θα σταματούσε στο πρώτο εσωτερικό κλείσιμο.
 */
function body(src, name) {
  const at = src.indexOf(`function ${name}(`)
  if (at < 0) return null
  const open = src.indexOf('{', at)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  return null
}

/** Ιδια σημασία, άλλη γραφή: σχόλια, κενά και ερωτηματικά δεν μετρούν. */
const norm = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/;/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const app = readFileSync(APP, 'utf8')
const edge = readFileSync(EDGE, 'utf8')

const problems = []
for (const name of SHARED) {
  const a = body(app, name)
  const b = body(edge, name)
  if (!a) { problems.push([name, `δεν βρέθηκε στο ${APP}`]); continue }
  if (!b) { problems.push([name, `δεν βρέθηκε στο ${EDGE}`]); continue }
  if (norm(a) !== norm(b)) problems.push([name, 'τα δύο αντίγραφα λένε διαφορετικά πράγματα'])
}

if (problems.length) {
  console.error(`✗ ${problems.length} ${problems.length === 1 ? 'συνάρτηση απέκλινε' : 'συναρτήσεις απέκλιναν'} ανάμεσα στα δύο αντίγραφα του αναλυτή iCal.\n`)
  for (const [name, why] of problems) console.error(`  ${name}: ${why}`)
  console.error(`\n  ${APP}`)
  console.error(`  ${EDGE}`)
  console.error('\n  Ο συγχρονισμός τρέχει ΜΟΝΟ το δεύτερο. Μια διόρθωση που έμεινε στο')
  console.error('  πρώτο περνά όλα τα τεστ και δεν φτάνει ποτέ σε πραγματική κράτηση.')
  process.exit(1)
}

console.log(`✓ και τα δύο αντίγραφα του αναλυτή iCal συμφωνούν σε ${SHARED.length} συναρτήσεις`)
