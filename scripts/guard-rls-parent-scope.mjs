#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΠΙΝΑΚΑΣ ΜΕ ΑΚΙΝΗΤΟ ΔΕΝΕΤΑΙ ΚΑΙ ΜΕ ΤΟΝ ΓΟΝΕΑ ΤΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Η ΑΣΥΜΜΕΤΡΙΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΦΥΛΑΚΑ: οι πολιτικές εγγραφής έδεναν το
// `user_id` («η γραμμή είναι δική μου»), οι πολιτικές ανάγνωσης `org_read_*`
// ταιριάζουν ανά `property_id` («το ακίνητο είναι δικό μου»). Δύο κλειδιά για
// την ίδια πόρτα σημαίνει ότι κάποιος μπαίνει: γράφεις γραμμή με ΤΟ ΔΙΚΟ σου
// `user_id` και ΞΕΝΟ `property_id` και το θύμα τη βλέπει μέσα στα σύνολά του.
//
// Αποδείχθηκε σε πραγματική Postgres, όχι στα χαρτιά: πριν το
// `20260810060000_parent_property_scope` το θύμα έβλεπε 4.000,00 € δαπάνες που
// δεν καταχώρησε ποτέ. Μετά, η εγγραφή κόβεται και ο συνεργάτης γράφει κανονικά.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ: κάθε πίνακας με στήλη `property_id` οφείλει να βρίσκεται στη
// λίστα του migration που βάζει τις restrictive πολιτικές. Νέος πίνακας με
// ακίνητο που ξεχνιέται από τη λίστα είναι η ίδια τρύπα, ξαναγεννημένη.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'

const DIR = 'supabase/migrations'
const SCOPE_FILE = '20260810060000_parent_property_scope.sql'

const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
const sql = files.map(f => readFileSync(`${DIR}/${f}`, 'utf8')).join('\n')
// Σχόλια έξω: το `property_id` μέσα σε εξήγηση δεν είναι στήλη.
const code = sql.replace(/--[^\n]*/g, '')

// ── Ποιοι πίνακες κουβαλούν ακίνητο ────────────────────────────────────────
const withProperty = new Set()

// pg_dump: CREATE TABLE "public"."x" ( "property_id" uuid, … );
for (const m of code.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_0-9]+)"?\s*\(([\s\S]*?)\n\);/gi)) {
  if (/"?property_id"?\s/i.test(m[2])) withProperty.add(m[1])
}
// Μεταγενέστερη προσθήκη στήλης.
for (const m of code.matchAll(/alter\s+table\s+(?:only\s+)?(?:"?public"?\.)?"?([a-z_0-9]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?property_id"?/gi)) {
  withProperty.add(m[1])
}
// Ό,τι διαγράφηκε δεν μετράει.
for (const m of code.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:"?public"?\.)?"?([a-z_0-9]+)"?/gi)) {
  withProperty.delete(m[1])
}

// ── Ποιοι πίνακες προστατεύονται ───────────────────────────────────────────
const scopeSrc = readFileSync(`${DIR}/${SCOPE_FILE}`, 'utf8')
const array = scopeSrc.match(/array\s*\[([\s\S]*?)\]/i)
if (!array) {
  console.error(`✗ δεν βρέθηκε η λίστα πινάκων στο ${SCOPE_FILE}`)
  process.exit(1)
}
const guarded = new Set([...array[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]))

const missing = [...withProperty].filter(t => !guarded.has(t)).sort()
const ghosts = [...guarded].filter(t => !withProperty.has(t)).sort()

if (missing.length || ghosts.length) {
  console.error(`✗ η λίστα γονικού ακινήτου δεν συμφωνεί με το σχήμα:\n`)
  for (const t of missing) console.error(`  ${t}: έχει property_id αλλά ΛΕΙΠΕΙ από το ${SCOPE_FILE}`)
  for (const t of ghosts) console.error(`  ${t}: είναι στη λίστα αλλά ΔΕΝ έχει property_id`)
  console.error(`\n  Κάθε πίνακας με ακίνητο χρειάζεται restrictive πολιτική εγγραφής που ελέγχει`)
  console.error('  τον γονέα. Αλλιώς γράφεται γραμμή σε ξένο ακίνητο και τη βλέπει ο ξένος.')
  process.exit(1)
}
console.log(`✓ γονικό ακίνητο: ${guarded.size} πίνακες με property_id, όλοι με restrictive πολιτική εγγραφής`)
