#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΣΤΗΛΗ ΠΟΥ ΖΗΤΑΕΙ Ο ΚΩΔΙΚΑΣ ΠΡΕΠΕΙ ΝΑ ΥΠΑΡΧΕΙ ΣΤΗ ΒΑΣΗ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ
//
// Ο πίνακας `tenants` δεν είχε ΠΟΤΕ στήλη `created_at` — μόνο `updated_at`.
// Παρ' όλα αυτά επτά σημεία της εφαρμογής και τρεις συναρτήσεις της βάσης
// ταξινομούσαν τους ενοικιαστές με `created_at` για να βρουν «ποιος μένει
// τώρα»: TabTenant (η κύρια καρτέλα), TabAccounting, LeaseModal,
// RentAdjustmentModal, e2Export, PortalShare, get_portal_data,
// submit_maintenance_request, get_accountant_data.
//
// Το PostgREST ΔΕΝ αγνοεί άγνωστη στήλη: απορρίπτει ΟΛΟΚΛΗΡΟ το ερώτημα με
// 42703. Δηλαδή η καρτέλα Ενοικιαστή δεν φόρτωνε, το Ε2 δεν έβγαινε και ο
// φάκελος του λογιστή γύριζε κενός — σιωπηλά, γιατί ο κώδικας διαβάζει
// `const { data } = await …` και το `data` είναι απλώς null.
//
// Τίποτα δεν το έπιανε: ούτε ο TypeScript (τα ονόματα στηλών είναι strings),
// ούτε το build, ούτε τα τεστ, ούτε το CI. Έβγαινε μόνο μπροστά στον χρήστη.
//
// ΤΙ ΚΑΝΕΙ
//
// Χτίζει τον πραγματικό χάρτη σχήματος από τα migrations (CREATE TABLE του
// baseline + κάθε `add column`) και σαρώνει app/ και lib/ για κλήσεις
// supabase: `.from('X').select(...)`, `.order('col')`, `.eq('col', …)`.
// Κάθε στήλη που ζητείται και δεν υπάρχει είναι σφάλμα.
//
// ΣΥΝΤΗΡΗΤΙΚΟ ΕΞ ΟΡΙΣΜΟΥ: ό,τι δεν μπορεί να διαβάσει με βεβαιότητα το
// προσπερνά. Ψευδώς θετικό εδώ θα σήμαινε ότι κάποιος θα άρχιζε να αγνοεί τον
// φύλακα, και τότε δεν προστατεύει τίποτα.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ── 1. Ο πραγματικός χάρτης σχήματος ─────────────────────────────────────
const MIG = 'supabase/migrations'
const schema = new Map()   // πίνακας → Set(στήλες)

const base = readFileSync(join(MIG, '00000000000000_baseline.sql'), 'utf8')
for (const m of base.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)" \(([\s\S]*?)\n\);/g)) {
  const cols = new Set()
  for (const line of m[2].split('\n')) {
    const c = /^\s*"(\w+)"\s/.exec(line)
    if (c) cols.add(c[1])
  }
  schema.set(m[1], cols)
}
for (const file of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIG, file), 'utf8')
  // ΕΝΑ `alter table` ΜΠΟΡΕΙ ΝΑ ΠΡΟΣΘΕΤΕΙ ΠΟΛΛΕΣ ΣΤΗΛΕΣ ΜΕ ΚΟΜΜΑΤΑ:
  //   alter table client_stays
  //     add column if not exists platform_fee numeric,
  //     add column if not exists climate_levy numeric;
  // Η πρώτη εκδοχή έπιανε μόνο την πρώτη, οπότε ο φύλακας «ανακάλυπτε» ότι
  // λείπουν στήλες που είχαν προστεθεί κανονικά — τέσσερα ψευδώς θετικά μόνο
  // σε αυτόν τον πίνακα.
  for (const stmt of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
    const cols = schema.get(stmt[1])
    if (!cols) continue
    for (const c of stmt[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) cols.add(c[1])
  }
  // Οι όψεις και οι πίνακες που φτιάχνονται εκτός baseline
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
    if (schema.has(m[1])) continue
    const cols = new Set()
    for (const line of m[2].split('\n')) {
      const c = /^\s*"?(\w+)"?\s+\w/.exec(line)
      if (c && !/^(constraint|primary|unique|foreign|check)$/i.test(c[1])) cols.add(c[1])
    }
    schema.set(m[1], cols)
  }
}

// ── 2. Οι κλήσεις της εφαρμογής ──────────────────────────────────────────
const files = []
const walk = d => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p) && !p.endsWith('.test.ts')) files.push(p)
  }
}
for (const root of ['app', 'lib', 'components']) { try { walk(root) } catch {} }

const problems = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // Κάθε `.from('table')` και ό,τι ακολουθεί μέχρι το τέλος της αλυσίδας.
  for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) {
    const table = m[1]
    const cols = schema.get(table)
    if (!cols) continue                       // άγνωστος πίνακας (view/rpc) → σιωπή
    const lineNo = src.slice(0, m.index).split('\n').length
    // Η ΑΛΥΣΙΔΑ ΣΤΑΜΑΤΑ ΣΤΟ ΕΠΟΜΕΝΟ `.from(`.
    //
    // Η πρώτη εκδοχή έπαιρνε σταθερό παράθυρο 900 χαρακτήρων και μέσα σε
    // `Promise.all([...])` διάβαζε τα φίλτρα του ΕΠΟΜΕΝΟΥ ερωτήματος σαν να
    // ανήκουν σε τούτο: κατήγγειλε `user_properties.check_in` επειδή δύο
    // γραμμές πιο κάτω υπήρχε ερώτημα σε `client_stays`. Τριακόσια ψευδώς
    // θετικά, δηλαδή ένας φύλακας που θα τον αγνοούσε ο πρώτος που τον έβλεπε.
    const after = src.slice(m.index + m[0].length)
    const nextFrom = after.search(/\.from\(\s*['"]/)
    const tail = after.slice(0, nextFrom === -1 ? 700 : Math.min(nextFrom, 700))

    const flag = (col, how) => {
      if (!col || cols.has(col)) return
      problems.push({ file, line: lineNo, table, col, how })
    }

    // .select('a, b, c')  — παραλείπονται embedded resources και aliases
    const sel = /\.select\(\s*['"`]([^'"`]*)['"`]/.exec(tail)
    if (sel && !sel[1].includes('(') && !sel[1].includes('*')) {
      for (const raw of sel[1].split(',')) {
        const c = raw.trim()
        if (!c || c.includes(':') || c.includes('!') || c.includes('.')) continue
        flag(c, 'select')
      }
    }
    // .order('col')
    for (const o of tail.matchAll(/\.order\(\s*['"](\w+)['"]/g)) flag(o[1], 'order')
    // .eq('col', …) / .neq / .gte / .lte / .gt / .lt / .in / .is / .like / .ilike
    for (const o of tail.matchAll(/\.(?:eq|neq|gte|lte|gt|lt|in|is|like|ilike)\(\s*['"](\w+)['"]/g)) flag(o[1], 'filter')
  }
}

// ── 3. Αποτέλεσμα ────────────────────────────────────────────────────────
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΤΕΙΧΟΣ.
//
// Τη στιγμή που γράφτηκε ο φύλακας υπήρχαν ήδη 26 τέτοιες αναφορές — 21 από
// αυτές στον πίνακα `loans`, όπου επτά αρχεία ζητούν `amount`/`rate`/`status`
// ενώ οι πραγματικές στήλες λέγονται `loan_amount`/`rate_type`/`fixed_rate`.
// Δεν διορθώνονται με μετονομασία: το `rate` πρέπει να υπολογιστεί από
// rate_type/fixed_rate/euribor/spread, και τα `status`, `loan_type`,
// `property_value` δεν υπάρχουν καθόλου — χρειάζονται απόφαση, όχι sed.
//
// Άρα: το υπάρχον χρέος καταγράφεται και κλειδώνεται, ΝΕΟ δεν επιτρέπεται.
// Ένας φύλακας που απαιτεί να λυθούν όλα σήμερα, αύριο θα έχει παρακαμφθεί.
const baseline = JSON.parse(readFileSync('scripts/schema-drift-baseline.json', 'utf8'))
if (problems.length > baseline.maxRefs) {
  console.error(`✗ ${problems.length} αναφορές σε ανύπαρκτες στήλες > όριο ${baseline.maxRefs}.\n`)
  console.error('  Το PostgREST απορρίπτει ΟΛΟΚΛΗΡΟ το ερώτημα σε άγνωστη στήλη (42703):')
  console.error('  η οθόνη δεν δείχνει σφάλμα, δείχνει κενό.\n')
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}`)
    console.error(`     ${p.table}.${p.col} — δεν υπάρχει (${p.how})`)
  }
  console.error('\n  Είτε πρόσθεσε τη στήλη με migration, είτε διόρθωσε το ερώτημα.')
  process.exit(1)
}

console.log(`✅ Καστάνια σχήματος πέρασε — ${problems.length} αναφορές σε ανύπαρκτες στήλες ≤ όριο ${baseline.maxRefs} (${schema.size} πίνακες, ${files.length} αρχεία).`)
if (problems.length < baseline.maxRefs) {
  console.log(`   ↓ Βελτίωση κατά ${baseline.maxRefs - problems.length}. Κατέβασε το "maxRefs" σε ${problems.length} για να κλειδώσει.`)
}
if (problems.length) {
  console.log('   Υπόλοιπο χρέος:')
  for (const p of problems) console.log(`     ${p.file}:${p.line}  ${p.table}.${p.col} (${p.how})`)
}
