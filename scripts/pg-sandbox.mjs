#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟΠΙΚΟ ΣΧΗΜΑ ΑΠΟ ΤΟ BASELINE — ΟΧΙ ΓΡΑΜΜΕΝΟ ΣΤΟ ΧΕΡΙ.
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ
//
// Δοκίμασα ένα migration τοπικά τρεις φορές και πέρασε και τις τρεις. Στο
// staging έσκασε και τις τρεις, με ΔΙΑΦΟΡΕΤΙΚΟ σφάλμα κάθε φορά:
//
//   42P10  invalid reference to FROM-clause entry for table "pl"
//   42883  operator does not exist: uuid = text
//   42703  column t.created_at does not exist
//
// Και τις τρεις φορές η αιτία ήταν η ίδια: είχα γράψει το σχήμα δοκιμής ΣΤΟ
// ΧΕΡΙ, μαντεύοντας τύπους και στήλες. Δοκίμαζα μια βάση που δεν υπάρχει και
// έπαιρνα πράσινο από αυτήν.
//
// Ένα τεστ που περιγράφει τον κόσμο όπως τον φαντάζεσαι δεν είναι τεστ.
//
// ΤΙ ΚΑΝΕΙ
//
// Διαβάζει τα `CREATE TABLE` του baseline και τα `alter table … add column`
// όλων των επόμενων migrations και στήνει τοπική βάση με ΤΟ ΠΡΑΓΜΑΤΙΚΟ σχήμα.
// Καμία στήλη δεν μπαίνει επειδή «λογικά θα υπάρχει».
//
// Αφαιρούνται μόνο όσα δεν έχουν νόημα εκτός Supabase: αναφορές σε auth.users,
// RLS/policies, grants, owners. Οι ΤΥΠΟΙ και τα ΟΝΟΜΑΤΑ των στηλών μένουν ακριβώς.
//
// ΧΡΗΣΗ
//   node scripts/pg-sandbox.mjs [--exclude 20260804200000_foo.sql] > /tmp/schema.sql
//   psql -d test -f /tmp/schema.sql
//
// ΤΟ --exclude ΔΕΝ ΕΙΝΑΙ ΠΡΟΑΙΡΕΤΙΚΟ ΟΤΑΝ ΔΟΚΙΜΑΖΕΙΣ MIGRATION.
// Χωρίς αυτό, το sandbox εφαρμόζει και τις δικές ΤΟΥ `add column`, οπότε η βάση
// έχει ήδη ό,τι προσθέτει το αρχείο που δοκιμάζεις — και το τεστ σου δεν μπορεί
// πια να δει το σφάλμα που ψάχνεις. Έτσι ακριβώς μια δοκιμή έκρυψε το 42703.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const BASELINE = '00000000000000_baseline.sql'
const exArg = process.argv.indexOf('--exclude')
const EXCLUDE = exArg > -1 ? process.argv.slice(exArg + 1).filter(a => !a.startsWith('--')) : []

const out = []
out.push('create extension if not exists pgcrypto;')
out.push('create schema if not exists extensions;')

// ── 1. Οι πίνακες, όπως ακριβώς είναι ────────────────────────────────────
const base = readFileSync(join(DIR, BASELINE), 'utf8')
const tables = []
for (const m of base.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)" \(([\s\S]*?)\n\);/g)) {
  const [, name, body] = m
  const cols = body
    .split('\n')
    .map(l => l.trim().replace(/,$/, ''))
    .filter(Boolean)
    // Τα CHECK με ελληνικά/σύνθετα δεν χρειάζονται για έλεγχο τύπων.
    .filter(l => !/^CONSTRAINT/i.test(l))
    .map(l => l.replace(/"/g, ''))
  tables.push(name)
  out.push(`create table if not exists public.${name} (\n  ${cols.join(',\n  ')}\n);`)
}

// ── 2. Τα πρωτεύοντα κλειδιά (τα χρειάζονται τα foreign keys των migrations) ──
for (const m of base.matchAll(/ADD CONSTRAINT "(\w+)_pkey" PRIMARY KEY \("(\w+)"\)/g)) {
  const table = m[1].replace(/_pkey$/, '')
  if (tables.includes(table)) out.push(`alter table public.${table} add primary key (${m[2]});`)
}
// ── ΟΙ ΜΟΝΑΔΙΚΟΙ ΠΕΡΙΟΡΙΣΜΟΙ ─────────────────────────────────────────────────
// ΤΟ ΟΝΟΜΑ ΔΕΝ ΣΠΑΕΙ ΜΕ ΜΑΝΤΕΨΙΑ. Η προηγούμενη εκδοχή ήταν
//     /ADD CONSTRAINT "(\w+)_(\w+)_key" UNIQUE .../
// και το `\w+` είναι άπληστο: το `property_settings_property_id_key` έσπαγε σε
// «property_settings_property» + «id». Πίνακας με τέτοιο όνομα δεν υπάρχει, ο
// έλεγχος `tables.includes(...)` απέτυχε σιωπηλά και ο περιορισμός ΔΕΝ έμπαινε
// καθόλου στη δοκιμαστική βάση.
//
// Χάνονταν έτσι όλοι οι μοναδικοί περιορισμοί των πινάκων με σύνθετο όνομα —
// δηλαδή σχεδόν όλων. Και ακριβώς πάνω σε αυτούς στηρίζεται το `on conflict`:
// ένα upsert που στην παραγωγή ρίχνει 42P10 περνούσε εδώ καθαρό, επειδή εδώ ο
// περιορισμός δεν υπήρχε ώστε να συγκρουστεί. Το sandbox γράφτηκε για να μη
// δοκιμάζουμε βάση που δεν υπάρχει και σε αυτό το σημείο έκανε ακριβώς αυτό.
//
// Τώρα το όνομα δοκιμάζεται ως πρόθεμα ΓΝΩΣΤΟΥ πίνακα, με τον μακρύτερο να
// κερδίζει (ώστε το `property_settings_*` να μην αποδοθεί σε τυχόν `property_*`).
for (const m of base.matchAll(/ADD CONSTRAINT "(\w+_key)" UNIQUE \("([\w", ]+)"\)/g)) {
  const name = m[1]
  const table = tables
    .filter(t => name.startsWith(t + '_'))
    .sort((a, b) => b.length - a.length)[0]
  if (table) out.push(`alter table public.${table} add unique (${m[2].replace(/"/g, '')});`)
}

// ── 3. Στήλες που πρόσθεσαν τα επόμενα migrations ────────────────────────
// Χωρίς αυτό, το σχήμα θα ήταν παγωμένο στην ημέρα του baseline — δηλαδή πάλι
// λάθος, απλώς με άλλον τρόπο.
for (const file of readdirSync(DIR).filter(f => f.endsWith('.sql') && f !== BASELINE && !EXCLUDE.includes(f)).sort()) {
  const sql = readFileSync(join(DIR, file), 'utf8')
  for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?(\w+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]*?);/gi)) {
    const [, table, rest] = m
    if (!tables.includes(table)) continue
    // Το `references` προς πίνακα που ίσως λείπει το κόβουμε: μας νοιάζει ο τύπος.
    const col = rest.replace(/references[\s\S]*$/i, '').trim()
    if (col) out.push(`alter table public.${table} add column if not exists ${col};`)
  }
}

console.log(out.join('\n\n'))
console.error(`— ${tables.length} πίνακες από το baseline + πρόσθετες στήλες${EXCLUDE.length ? `, ΕΚΤΟΣ: ${EXCLUDE.join(', ')}` : ''}`)
