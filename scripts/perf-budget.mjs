#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΣΟ ΖΥΓΙΖΕΙ Η ΚΑΘΕ ΟΘΟΝΗ, ΚΑΙ ΠΟΣΟ ΑΡΓΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Μέχρι σήμερα η απόδοση δεν είχε ΚΑΝΕΝΑ νούμερο. Δεν
// ξέραμε αν η αρχική σελίδα κατεβάζει 300 KB ή 3 MB, ούτε αν κάποια αλλαγή
// τη διπλασίασε. Ο πρώτος επαγγελματίας πελάτης θα το ανακάλυπτε στην
// παραγωγή, και θα έφευγε χωρίς να πει γιατί.
//
// ΤΙ ΜΕΤΡΑΕΙ ΚΑΙ ΓΙΑΤΙ ΕΤΣΙ. Οχι μανιφέστα του Next: ΠΡΑΓΜΑΤΙΚΟΣ περιηγητής,
// άδεια μνήμη, και άθροισμα των bytes που κατεβαίνουν στ' αλήθεια. Τα
// εσωτερικά αρχεία του framework αλλάζουν σχήμα με κάθε έκδοση· ό,τι περνά
// από το καλώδιο δεν αλλάζει ορισμό ποτέ.
//
// ΤΟ ΟΡΙΟ ΕΙΝΑΙ ΚΑΣΤΑΝΙΑ, ΟΧΙ ΣΤΟΧΟΣ. Το docs/perf/budget.json κρατά ό,τι
// μετρήθηκε, με περιθώριο. Μια αλλαγή που ρίχνει το βάρος κατεβάζει το όριο·
// μια αλλαγή που το ανεβάζει πάνω από το περιθώριο σταματά. Ετσι το βάρος
// μόνο πέφτει, χωρίς να χρειάζεται κανείς να θυμάται να κοιτάξει.
//
// ΠΡΟΫΠΟΘΕΣΗ: παραγωγικό build σε λειτουργία.
//     npm run build && npx next start -p 3100
//     node scripts/perf-budget.mjs               (έλεγχος)
//     node scripts/perf-budget.mjs --write       (καταγραφή νέου ορίου)
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const BUDGET = new URL('../docs/perf/budget.json', import.meta.url).pathname
const BASE = process.env.PERF_BASE || 'http://localhost:3100'
const WRITE = process.argv.includes('--write')

// ── ΟΙ ΟΘΟΝΕΣ ΠΟΥ ΜΕΤΡΩΝΤΑΙ ───────────────────────────────────────────────
// Ολες δημόσιες, γιατί δεν χρειάζονται λογαριασμό: το μέτρημα τρέχει σε κάθε
// μηχάνημα χωρίς μυστικά. Ο πίνακας ελέγχου θέλει σύνδεση και μετριέται
// χωριστά, με τον πάγκο των components (scripts/perf-bench).
const ROUTES = [
  { path: '/',                            what: 'αρχική, η πρώτη οθόνη κάθε επισκέπτη' },
  { path: '/ypologismos-forou-enoikion',  what: 'φόρος ενοικίων, το βαρύτερο δημόσιο εργαλείο' },
  { path: '/ypologismos-enfia',           what: 'ΕΝΦΙΑ' },
  { path: '/vraxyxronia-i-makroxronia',   what: 'βραχυχρόνια ή μακροχρόνια' },
  { path: '/kathari-apodosi',             what: 'καθαρή απόδοση' },
  { path: '/tameio',                      what: 'ταμείο' },
  { path: '/login',                       what: 'σύνδεση' },
  { path: '/signup',                      what: 'εγγραφή' },
]

/** Ποσοστό ανοχής πάνω από το καταγεγραμμένο, πριν κοκκινίσει. */
const SLACK = 0.08

const kb = n => (n / 1024).toFixed(1).replace('.', ',')

let chromium
try { ({ chromium } = require('playwright-core')) }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }

void (async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })

  const measured = {}
  for (const r of ROUTES) {
    // ΚΑΘΕ ΟΘΟΝΗ ΣΕ ΚΑΘΑΡΟ ΠΕΡΙΒΑΛΛΟΝ. Με κοινή μνήμη, η δεύτερη οθόνη
    // «ζυγίζει» σχεδόν μηδέν επειδή μοιράζεται τα κοινά αρχεία — και το
    // νούμερο που θα κρατούσαμε δεν θα ήταν κανενός επισκέπτη.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'el-GR' })
    const page = await ctx.newPage()
    const bytes = { js: 0, css: 0, font: 0, image: 0, other: 0 }
    page.on('response', async res => {
      const type = res.request().resourceType()
      const len = Number(res.headers()['content-length'] || 0)
      let n = len
      if (!n) { try { n = (await res.body()).length } catch { n = 0 } }
      const k = type === 'script' ? 'js' : type === 'stylesheet' ? 'css'
        : type === 'font' ? 'font' : type === 'image' ? 'image' : 'other'
      bytes[k] += n
    })
    const t0 = Date.now()
    await page.goto(BASE + r.path, { waitUntil: 'networkidle' })
    const wall = Date.now() - t0
    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0]
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]
      return { dcl: Math.round(e?.domContentLoadedEventEnd || 0), fcp: Math.round(fcp?.startTime || 0) }
    })
    await ctx.close()
    measured[r.path] = { js: bytes.js, css: bytes.css, total: Object.values(bytes).reduce((a, b) => a + b, 0), fcp: nav.fcp, dcl: nav.dcl, wall }
  }
  await browser.close()

  let budget = {}
  try { budget = JSON.parse(readFileSync(BUDGET, 'utf8')).routes || {} } catch { /* πρώτη φορά */ }

  const rows = ROUTES.map(r => ({ ...r, m: measured[r.path], b: budget[r.path] }))
  console.log('  ΟΘΟΝΗ                          JS      ΣΥΝΟΛΟ    FCP    ΟΡΙΟ JS')
  for (const row of rows) {
    const cap = row.b ? kb(row.b.js) : '—'
    console.log(`  ${row.path.padEnd(30)} ${kb(row.m.js).padStart(7)} ${kb(row.m.total).padStart(9)} ${String(row.m.fcp).padStart(5)}ms ${cap.padStart(9)}`)
  }

  if (WRITE) {
    mkdirSync(new URL('../docs/perf/', import.meta.url).pathname, { recursive: true })
    const routes = {}
    for (const row of rows) routes[row.path] = { js: row.m.js, total: row.m.total, what: row.what }
    writeFileSync(BUDGET, JSON.stringify({
      note: 'Μετρημένο με scripts/perf-budget.mjs σε παραγωγικό build. Το όριο μόνο κατεβαίνει.',
      slack: SLACK, routes,
    }, null, 2) + '\n')
    console.log(`\n✅ Καταγράφηκαν ${rows.length} οθόνες στο docs/perf/budget.json`)
    return
  }

  const over = rows.filter(r => r.b && r.m.js > r.b.js * (1 + SLACK))
  const missing = rows.filter(r => !r.b)
  if (missing.length) {
    console.error(`\n✗ ${missing.length} οθόνες χωρίς καταγεγραμμένο όριο: ${missing.map(r => r.path).join(', ')}`)
    console.error('  Τρέξε με --write την πρώτη φορά.')
    process.exit(1)
  }
  if (over.length) {
    console.error(`\n✗ ${over.length} ${over.length === 1 ? 'οθόνη ξεπέρασε' : 'οθόνες ξεπέρασαν'} το όριο κατά πάνω από ${Math.round(SLACK * 100)}%:\n`)
    for (const r of over) {
      console.error(`  ${r.path} — ${r.what}`)
      console.error(`    ${kb(r.m.js)} KB JavaScript, όριο ${kb(r.b.js)} KB (+${Math.round((r.m.js / r.b.js - 1) * 100)}%)\n`)
    }
    console.error('  Αν το βάρος ανέβηκε επίτηδες, ξανατρέξε με --write και γράψε τον λόγο')
    console.error('  στο μήνυμα της υποβολής. Αν όχι, κάτι μπήκε στο πακέτο χωρίς να το θέλεις.')
    process.exit(1)
  }

  const lighter = rows.filter(r => r.b && r.m.js < r.b.js * 0.95)
  console.log(`\n✅ ${rows.length} οθόνες μέσα στο όριο${lighter.length ? `, ${lighter.length} ελάφρυναν (τρέξε --write για να κατέβει το όριο)` : ''}.`)
})()
