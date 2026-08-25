#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΕΙΔΟΣ ΑΠΟΣΤΟΛΗΣ ΕΧΕΙ ΟΡΙΟ ΓΡΑΜΜΕΝΟ ΣΤΗ ΒΑΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Το ταβάνι και το παράθυρο του μετρητή αποστολών τα όριζε ο
// καλών, δηλαδή κάθε συνδεδεμένος χρήστης μπορούσε να μηδενίσει τον δικό του
// μετρητή καλώντας την RPC με μικρότερο παράθυρο. Πλέον τα ορίζει η
// `send_quota_rule` μέσα στη βάση και το άγνωστο είδος ΚΛΕΙΝΕΙ την πόρτα.
//
// Το κλείσιμο όμως γίνεται σε ΛΕΙΤΟΥΡΓΙΑ: ένας νέος καλών που ξεχνά να
// δηλώσει το είδος του θα μεταγλωττιζόταν καθαρά και θα έπαιρνε
// «unknown_kind» την πρώτη φορά που κάποιος πάτησε το κουμπί. Εδώ το μαθαίνει
// πριν φύγει η αλλαγή.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { projectFiles } from './lib/git-files.mjs'

const RULE = /\('([a-z_]+)',\s*\d+,\s*interval/g
const CALL = /p_kind:\s*'([a-z_]+)'/g

const sql = projectFiles()
  .filter(f => f.startsWith('supabase/migrations/') && f.endsWith('.sql'))
  .sort()

// Η ΤΕΛΕΥΤΑΙΑ ΜΕΤΑΝΑΣΤΕΥΣΗ ΠΟΥ ΟΡΙΖΕΙ ΤΟΝ ΚΑΝΟΝΑ ΕΙΝΑΙ Η ΙΣΧΥΟΥΣΑ. Η βάση
// κρατά ό,τι έτρεξε τελευταίο, όχι την ένωση όλων των εκδόσεων.
let declared = null
for (const f of sql) {
  const text = readFileSync(f, 'utf8')
  if (!/create or replace function public\.send_quota_rule/.test(text)) continue
  const body = text.slice(text.indexOf('send_quota_rule'))
  declared = new Set(Array.from(body.matchAll(RULE), m => m[1]))
}
if (!declared) {
  console.log('✗ καμία μετανάστευση δεν ορίζει την send_quota_rule')
  process.exit(1)
}

const missing = []
for (const f of projectFiles()) {
  if (!/\.(ts|tsx)$/.test(f) || f.includes('.test.')) continue
  const text = readFileSync(f, 'utf8')
  if (!text.includes('bump_send_quota')) continue
  for (const m of text.matchAll(CALL)) {
    if (!declared.has(m[1])) missing.push(`${f}: «${m[1]}»`)
  }
}

if (missing.length) {
  console.log(`✗ ${missing.length} είδη αποστολής χωρίς όριο στη βάση:\n`)
  for (const m of missing) console.log('  ' + m)
  console.log('\n  ΔΙΟΡΘΩΣΗ: πρόσθεσε το είδος με το ταβάνι και το παράθυρό του')
  console.log('  στην public.send_quota_rule, σε νέα μετανάστευση.')
  process.exit(1)
}
console.log(`✓ και τα ${declared.size} είδη αποστολής έχουν όριο γραμμένο στη βάση`)
