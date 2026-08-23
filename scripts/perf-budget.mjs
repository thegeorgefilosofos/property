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
// Ολες ΠΡΑΓΜΑΤΙΚΑ δημόσιες, γιατί δεν χρειάζονται λογαριασμό: το μέτρημα
// τρέχει σε κάθε μηχάνημα χωρίς μυστικά. Ο πίνακας ελέγχου θέλει σύνδεση και
// μετριέται χωριστά, με τον πάγκο των components (scripts/perf-bench).
//
// ΤΟ /tameio ΕΛΕΙΨΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΗΤΑΝ ΛΑΘΟΣ ΜΟΥ. Δεν είναι στον κατάλογο
// PUBLIC του proxy.ts: απαντά 307 προς /login. Το μετρούσα και κατέγραφα το
// βάρος του /login δεύτερη φορά. Το σημάδι ήταν μπροστά μου — οι δύο γραμμές
// έβγαιναν byte για byte ίδιες. Ο έλεγχος ανακατεύθυνσης παρακάτω το κάνει
// πλέον αδύνατο να ξανασυμβεί σιωπηλά.
const ROUTES = [
  { path: '/',                            what: 'αρχική, η πρώτη οθόνη κάθε επισκέπτη' },
  { path: '/ypologismos-forou-enoikion',  what: 'φόρος ενοικίων, το βαρύτερο δημόσιο εργαλείο' },
  { path: '/ypologismos-enfia',           what: 'ΕΝΦΙΑ' },
  { path: '/vraxyxronia-i-makroxronia',   what: 'βραχυχρόνια ή μακροχρόνια' },
  { path: '/kathari-apodosi',             what: 'καθαρή απόδοση' },
  { path: '/login',                       what: 'σύνδεση' },
  { path: '/signup',                      what: 'εγγραφή' },
  { path: '/privacy',                     what: 'πολιτική απορρήτου' },
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
    // ΜΕΤΡΙΟΥΝΤΑΙ ΤΑ BYTES ΤΟΥ ΚΑΛΩΔΙΟΥ, ΟΧΙ ΤΑ ΑΠΟΣΥΜΠΙΕΣΜΕΝΑ.
    //
    // Η πρώτη εκδοχή διάβαζε `res.body()`, που επιστρέφει ΑΠΟΣΥΜΠΙΕΣΜΕΝΟ
    // περιεχόμενο, και κατέγραφε 755 KB για τη σελίδα σύνδεσης. Ο διακομιστής
    // στέλνει gzip: στο καλώδιο περνούν 221 KB. Το τριπλάσιο νούμερο δεν ήταν
    // απλώς λάθος — έδειχνε προς λάθος συμπέρασμα για το πού είναι το βάρος.
    // Ο χρήστης πληρώνει τα bytes που κατεβαίνουν, όχι όσα γίνονται μετά την
    // αποσυμπίεση.
    const bytes = { js: 0, css: 0, font: 0, image: 0, other: 0 }
    const pending = []
    page.on('response', res => {
      const type = res.request().resourceType()
      const k = type === 'script' ? 'js' : type === 'stylesheet' ? 'css'
        : type === 'font' ? 'font' : type === 'image' ? 'image' : 'other'
      pending.push((async () => {
        let wire = 0
        try { wire = (await res.request().sizes()).responseBodySize || 0 } catch { wire = 0 }
        if (!wire) { try { wire = (await res.body()).length } catch { wire = 0 } }
        bytes[k] += wire
      })())
    })
    const t0 = Date.now()
    const resp = await page.goto(BASE + r.path, { waitUntil: 'networkidle' })
    const wall = Date.now() - t0
    // ΜΙΑ ΑΝΑΚΑΤΕΥΘΥΝΣΗ ΣΗΜΑΙΝΕΙ ΟΤΙ ΜΕΤΡΑΜΕ ΑΛΛΗ ΣΕΛΙΔΑ. Χωρίς αυτόν τον
    // έλεγχο, μια διαδρομή πίσω από σύνδεση καταγράφεται ως δημόσια.
    const landed = new URL(page.url()).pathname
    if (landed !== r.path) {
      console.error(`✗ Το ${r.path} κατέληξε στο ${landed} (HTTP ${resp?.status()}).`)
      console.error('  Δεν είναι δημόσια διαδρομή, άρα το νούμερο θα ήταν άλλης σελίδας.')
      process.exit(1)
    }
    await Promise.all(pending)
    // ── ΤΟ ΚΡΙΣΙΜΟ ΜΟΝΟΠΑΤΙ, ΞΕΧΩΡΙΣΤΑ ΑΠΟ ΤΟ ΣΥΝΟΛΟ ────────────────────────
    // ΤΟ ΣΥΝΟΛΟ ΩΣ ΤΗΝ ΗΡΕΜΙΑ ΔΙΚΤΥΟΥ ΚΡΥΒΕΙ ΑΚΡΙΒΩΣ ΤΗ ΒΕΛΤΙΩΣΗ ΠΟΥ ΜΕΤΡΑΕΙ.
    // Οταν ένα κομμάτι 57 KB φεύγει από το αρχικό HTML και φορτώνεται μετά την
    // ενυδάτωση, το σύνολο μένει ΤΟ ΙΔΙΟ — αλλά ο χρήστης βλέπει τη σελίδα
    // νωρίτερα. Το μέτρησα και είδα «καμία διαφορά», ενώ η διαφορά ήταν όλη η
    // ουσία της αλλαγής.
    //
    // Ο ΔΙΑΧΩΡΙΣΜΟΣ ΓΙΝΕΤΑΙ ΜΕ ΤΑ ΟΝΟΜΑΤΑ ΠΟΥ ΓΡΑΦΕΙ ΤΟ ΙΔΙΟ ΤΟ HTML. Οσα
    // κομμάτια αναφέρει ο διακομιστής κατεβαίνουν πριν από οτιδήποτε άλλο· όσα
    // ζητά ο κώδικας μετά την ενυδάτωση δεν καθυστερούν κανένα σχεδίασμα. Τα
    // bytes έρχονται από το `encodedBodySize` του περιηγητή, δηλαδή ό,τι πέρασε
    // πράγματι από το καλώδιο — το `fetch` του Node αποσυμπιέζει και θα έδινε
    // τετραπλάσιο νούμερο.
    const html = await (await fetch(BASE + r.path)).text()
    const refs = [...new Set([...html.matchAll(/static\/chunks\/[\w.-]+\.js/g)].map(m => m[0]))]
    const initial = await page.evaluate(names => performance.getEntriesByType('resource')
      .filter(e => names.some(n => e.name.includes(n)))
      .reduce((a, e) => a + (e.encodedBodySize || 0), 0), refs)

    const nav = await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0]
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]
      return { dcl: Math.round(e?.domContentLoadedEventEnd || 0), fcp: Math.round(fcp?.startTime || 0) }
    })
    await ctx.close()
    measured[r.path] = { initial, js: bytes.js, css: bytes.css, total: Object.values(bytes).reduce((a, b) => a + b, 0), fcp: nav.fcp, dcl: nav.dcl, wall }
  }
  await browser.close()

  let budget = {}
  try { budget = JSON.parse(readFileSync(BUDGET, 'utf8')).routes || {} } catch { /* πρώτη φορά */ }

  const rows = ROUTES.map(r => ({ ...r, m: measured[r.path], b: budget[r.path] }))
  console.log('  ΟΘΟΝΗ                        ΑΡΧΙΚΟ  JS gzip   ΣΥΝΟΛΟ    FCP')
  for (const row of rows) {
    console.log(`  ${row.path.padEnd(30)} ${kb(row.m.initial).padStart(6)} ${kb(row.m.js).padStart(8)} ${kb(row.m.total).padStart(8)} ${String(row.m.fcp).padStart(6)}ms`)
  }

  if (WRITE) {
    mkdirSync(new URL('../docs/perf/', import.meta.url).pathname, { recursive: true })
    const routes = {}
    for (const row of rows) routes[row.path] = { initial: row.m.initial, js: row.m.js, total: row.m.total, what: row.what }
    writeFileSync(BUDGET, JSON.stringify({
      note: 'Bytes ΚΑΛΩΔΙΟΥ (gzip), scripts/perf-budget.mjs σε παραγωγικό build. Το όριο μόνο κατεβαίνει.',
      slack: SLACK, routes,
    }, null, 2) + '\n')
    console.log(`\n✅ Καταγράφηκαν ${rows.length} οθόνες στο docs/perf/budget.json`)
    return
  }

  const over = rows.filter(r => r.b && r.b.initial && r.m.initial > r.b.initial * (1 + SLACK))
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
      console.error(`    ${kb(r.m.initial)} KB στο κρίσιμο μονοπάτι, όριο ${kb(r.b.initial)} KB (+${Math.round((r.m.initial / r.b.initial - 1) * 100)}%)\n`)
    }
    console.error('  Αν το βάρος ανέβηκε επίτηδες, ξανατρέξε με --write και γράψε τον λόγο')
    console.error('  στο μήνυμα της υποβολής. Αν όχι, κάτι μπήκε στο πακέτο χωρίς να το θέλεις.')
    process.exit(1)
  }

  const lighter = rows.filter(r => r.b?.initial && r.m.initial < r.b.initial * 0.95)
  console.log(`\n✅ ${rows.length} οθόνες μέσα στο όριο${lighter.length ? `, ${lighter.length} ελάφρυναν (τρέξε --write για να κατέβει το όριο)` : ''}.`)
})()
