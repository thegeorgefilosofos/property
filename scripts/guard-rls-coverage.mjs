#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΠΙΝΑΚΑΣ ΚΛΕΙΔΩΜΕΝΟΣ, ΚΑΙ ΚΑΜΙΑ ΠΟΡΤΑ ΑΝΟΙΧΤΗ ΣΕ ΟΛΟΥΣ
// ─────────────────────────────────────────────────────────────────────────
// Το PostgREST εκθέτει ΟΛΟ το σχήμα `public` στο διαδίκτυο, με το δημόσιο anon
// key που καθένας διαβάζει από τον κώδικα του περιηγητή. Πίνακας χωρίς RLS δεν
// είναι θεωρητικά ανοιχτός· διαβάζεται με ένα `curl`.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ ΜΟΝΟ ΑΥΤΑ ΤΑ ΔΥΟ
//
//   1. Κάθε πίνακας του `public` έχει `ENABLE ROW LEVEL SECURITY`.
//   2. Καμία policy δεν λέει `USING (true)` έξω από τον ρητό κατάλογο των
//      δημόσιων πινάκων αναφοράς.
//
// ΤΙ ΔΕΝ ΕΛΕΓΧΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ. Η πρώτη γραφή αυτού του φύλακα απαιτούσε policy
// για καθεμία από τις τέσσερις εντολές και φώναζε για είκοσι τρεις πίνακες. Και
// οι είκοσι τρεις ήταν ψεύτικοι συναγερμοί, για δύο λόγους που αξίζει να
// μείνουν γραμμένοι:
//
//   · ΠΙΝΑΚΑΣ ΜΕ RLS ΚΑΙ ΧΩΡΙΣ POLICY ΓΙΑ INSERT ΔΕΝ ΕΙΝΑΙ ΑΝΟΙΧΤΟΣ, ΕΙΝΑΙ
//     ΚΛΕΙΣΤΟΣ. Το PostgreSQL απορρίπτει ό,τι δεν επιτρέπεται ρητά. Οι πίνακες
//     αναφοράς (επιτόκια, τιμολόγια ρεύματος) έχουν σκόπιμα μόνο policy
//     ανάγνωσης: το «λείπει» εκεί σημαίνει «απαγορεύεται», που είναι το ζητούμενο.
//
//   · POLICY `FOR ALL` ΜΕ ΜΟΝΟ `USING` ΔΕΝ ΑΦΗΝΕΙ ΤΟ INSERT ΑΦΥΛΑΚΤΟ. Όταν
//     λείπει το `WITH CHECK`, το PostgreSQL χρησιμοποιεί την έκφραση του
//     `USING` ΚΑΙ ως `WITH CHECK`. Δηλαδή το `USING (auth.uid() = user_id)`
//     εμποδίζει ήδη την εγγραφή με ξένο αναγνωριστικό.
//
// Ένας φύλακας που φωνάζει για είκοσι τρία μη-προβλήματα διδάσκει να τον
// αγνοούν, και την ημέρα που θα έχει δίκιο δεν θα τον κοιτάξει κανείς.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'

const DIR = 'supabase/migrations'

/**
 * Πίνακες που ΕΠΙΤΡΕΠΕΤΑΙ να διαβάζονται από οποιονδήποτε.
 *
 * Είναι δημόσια δεδομένα αναφοράς, όχι δεδομένα χρηστών: επιτόκια τραπεζών,
 * τιμολόγια ρεύματος, προγράμματα δανείων, δείκτες αγοράς. Τα διαβάζουν και οι
 * δημόσιοι υπολογιστές, χωρίς λογαριασμό. Καμία γραμμή τους δεν ανήκει σε
 * κανέναν. Κάθε ΑΛΛΟΣ πίνακας με `using (true)` είναι διαρροή.
 */
const PUBLIC_REFERENCE = new Set([
  'bank_rates', 'energy_tariffs', 'loan_programs', 'market_rates',
])

let sql = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(`${DIR}/${f}`, 'utf8')).join('\n')
// Σχόλια και συμβολοσειρές φεύγουν: το `command_tag IN ('CREATE TABLE', …)`
// μέσα σε συνάρτηση ελέγχου δεν είναι δήλωση πίνακα.
sql = sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''")

const name = '(?:"?public"?\\.)?"?([a-z_0-9]+)"?'
const grab = (re) => { const s = new Set(); for (const m of sql.matchAll(re)) s.add(m[1]); return s }

const created = grab(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${name}`, 'gi'))
const dropped = grab(new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?${name}`, 'gi'))
const rls = grab(new RegExp(`alter\\s+table\\s+${name}\\s+enable\\s+row\\s+level\\s+security`, 'gi'))

const tables = [...created].filter(t => !dropped.has(t)).sort()
const problems = []

for (const t of tables) {
  if (!rls.has(t)) problems.push(`${t}: ΧΩΡΙΣ ENABLE ROW LEVEL SECURITY — το PostgREST το σερβίρει σε όποιον έχει το δημόσιο κλειδί`)
}

// Ανοιχτή πόρτα: policy που δεν κοιτάζει ποιος ρωτά.
for (const m of sql.matchAll(new RegExp(`create\\s+policy\\s+"?([^"\\n]+?)"?\\s+on\\s+${name}([\\s\\S]*?);`, 'gi'))) {
  const [, policy, table, body] = m
  if (!/(using|with\s+check)\s*\(\s*true\s*\)/i.test(body)) continue
  if (PUBLIC_REFERENCE.has(table)) continue
  problems.push(`${table}: η policy «${policy}» επιτρέπει σε ΟΠΟΙΟΝΔΗΠΟΤΕ (using true)`)
}

if (problems.length) {
  console.error(`✗ ${problems.length} ανοιχτές πόρτες στη βάση (${tables.length} πίνακες):\n`)
  for (const p of problems) console.error('  ' + p)
  console.error('\n  Κάθε πίνακας χρειάζεται RLS. Κάθε policy χρειάζεται να ρωτά ποιος ρωτά.')
  console.error('  Δημόσιο δεδομένο αναφοράς; Πρόσθεσέ το ρητά στο PUBLIC_REFERENCE, με λόγο.')
  process.exit(1)
}
console.log(`✓ πρόσβαση στη βάση: ${tables.length} πίνακες, RLS σε όλους, ${PUBLIC_REFERENCE.size} δημόσιοι πίνακες αναφοράς`)
