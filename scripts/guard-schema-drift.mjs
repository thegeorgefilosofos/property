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
// φύλακα και τότε δεν προστατεύει τίποτα.
// ═══════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readColumnNames } from './lib/pg-schema.mjs'

// ── 1. Ο πραγματικός χάρτης σχήματος ─────────────────────────────────────
// Διαβάζεται από τα migrations, μία φορά, σε κοινό σημείο: τον ίδιο χάρτη
// χρειάζεται και η γεννήτρια των τύπων (scripts/gen-db-types.mjs). Γραμμένος
// δύο φορές, θα απέκλιναν στο πρώτο migration με σύνταξη που είχε μάθει μόνο
// ο ένας — και η απόκλιση θα ήταν αόρατη, γιατί και οι δύο θα «περνούσαν».
const schema = readColumnNames()   // πίνακας → Set(στήλες)

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
// ΚΑΙ ΟΙ EDGE FUNCTIONS. Έλειπαν από τη σάρωση και εκεί κρύφτηκε το χειρότερο
// σφάλμα αυτής της οικογένειας: η `market-data-updater` φιλτράριζε προγράμματα
// δανείων με `is_active`, στήλη που δεν υπήρξε ποτέ. Το ερώτημα απορριπτόταν
// ολόκληρο, το cron επέστρεφε καθαρή άδεια λίστα κάθε πρωί και καμία
// υπενθύμιση προθεσμίας δεν στάλθηκε ποτέ σε κανέναν.
for (const root of ['app', 'lib', 'components', 'supabase/functions']) { try { walk(root) } catch {} }

// Ονόματα που ΔΕΝ είναι πίνακες αλλά είναι υπαρκτά (views, ξένα σχήματα).
// Κάθε εγγραφή εδώ είναι υπόσχεση ότι ελέγχθηκε με το μάτι — όχι παραθυράκι.
const KNOWN_VIEWS = new Set([
  // baseline.sql:1540 — CREATE OR REPLACE VIEW … WITH (security_invoker)
  'active_loan_programs',
])

const problems = []

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  // Κάθε `.from('table')` και ό,τι ακολουθεί μέχρι το τέλος της αλυσίδας.
  for (const m of src.matchAll(/(\w+)?\.from\(\s*['"](\w+)['"]\s*\)/g)) {
    // `supabase.storage.from('avatars')` ΔΕΝ είναι πίνακας — είναι bucket.
    if (m[1] === 'storage') continue
    const table = m[2]
    const cols = schema.get(table)
    const lineNo = src.slice(0, m.index).split('\n').length
    if (!cols) {
      // ΑΓΝΩΣΤΟΣ ΠΙΝΑΚΑΣ ΔΕΝ ΣΗΜΑΙΝΕΙ ΑΘΩΟΣ.
      //
      // Η πρώτη εκδοχή έκανε `continue` εδώ, θεωρώντας ότι κάθε άγνωστο όνομα
      // είναι view ή RPC. Έτσι όμως ο φύλακας ΔΕΝ είδε καθόλου τις τέσσερις
      // κλήσεις σε `from('properties')` — πίνακα που δεν υπήρξε ποτέ (λέγεται
      // `user_properties`). Δηλαδή προσπερνούσε ακριβώς το χειρότερο σφάλμα
      // της κατηγορίας: όχι λάθος στήλη, ολόκληρος λάθος πίνακας.
      //
      // Τα πραγματικά views μπαίνουν στο KNOWN_VIEWS με σχόλιο· ό,τι δεν είναι
      // εκεί και δεν είναι πίνακας, είναι σφάλμα.
      if (!KNOWN_VIEWS.has(table)) problems.push({ file, line: lineNo, table, col: '(ο πίνακας)', how: 'άγνωστος πίνακας' })
      continue
    }
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
    // Το `${cols}` ενός template literal ΔΕΝ είναι όνομα στήλης: το περιεχόμενό
    // του αποφασίζεται στην εκτέλεση. Χωρίς αυτό, ο φύλακας κατήγγειλε στήλη με
    // όνομα «${cols}» — ψευδώς θετικό που μόνο θόρυβο προσθέτει.
    if (sel && !sel[1].includes('(') && !sel[1].includes('*') && !sel[1].includes('${')) {
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

    // ── ΤΑ ΚΛΕΙΔΙΑ ΤΟΥ ΦΟΡΤΙΟΥ ΓΡΑΨΙΜΑΤΟΣ ───────────────────────────────────
    // Ο φύλακας κοίταζε ΜΟΝΟ διαβάσματα και γι' αυτό δεν είδε τέσσερα
    // `insert` που έγραφαν `description` στον `calendar_events` — πίνακα που
    // έχει `notes`, όχι `description`.
    //
    // Στο γράψιμο η αποτυχία είναι ΧΕΙΡΟΤΕΡΗ από το διάβασμα: δύο από τα
    // τέσσερα σημεία δεν κοίταζαν καν το `error`, οπότε το PostgREST απέρριπτε
    // την εγγραφή και ο χρήστης έβλεπε «Προστέθηκε, μπήκε και στο ημερολόγιο».
    // Τίποτα δεν είχε μπει και τίποτα δεν το έλεγε.
    //
    // Διαβάζονται τα κλειδιά ΠΡΩΤΟΥ επιπέδου του αντικειμένου. Ό,τι είναι
    // ένθετο ή υπολογισμένο (`...spread`, `[key]`) προσπερνιέται: δεν μπορεί να
    // κριθεί στατικά και μια εικασία εδώ θα γεννούσε ψευδώς θετικά.
    for (const w of tail.matchAll(/\.(?:insert|update|upsert)\(\s*(\{[^{}]*\})/g)) {
      for (const k of w[1].matchAll(/(?:^|[{,])\s*(\w+)\s*:/g)) flag(k[1], 'γράψιμο')
    }
  }
}

// ── 3. Αποτέλεσμα ────────────────────────────────────────────────────────
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΤΕΙΧΟΣ.
//
// Τη στιγμή που γράφτηκε ο φύλακας υπήρχαν ήδη 26 τέτοιες αναφορές — 21 από
// αυτές στον πίνακα `loans`, όπου επτά αρχεία ζητούν `amount`/`rate`/`status`
// ενώ οι πραγματικές στήλες λέγονται `loan_amount`/`rate_type`/`fixed_rate`.
// Δεν διορθώνονται με μετονομασία: το `rate` πρέπει να υπολογιστεί από
// rate_type/fixed_rate/euribor/spread και τα `status`, `loan_type`,
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
