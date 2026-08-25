#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΣΟ ΑΡΓΕΙ ΤΟ ΧΑΡΤΟΦΥΛΑΚΙΟ ΜΕ ΔΙΑΚΟΣΙΑ ΑΚΙΝΗΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Ο επαγγελματίας πελάτης είναι αυτός που φέρνει
// διακόσια ακίνητα και αυτός που πληρώνει το ακριβό πακέτο — και κανείς δεν
// είχε ανοίξει ποτέ την οθόνη του. Δεν ξέραμε αν αργεί δύο δευτερόλεπτα ή
// είκοσι.
//
// ΤΙ ΔΕΝ ΜΕΤΡΑΕΙ. Δίκτυο και βάση: η ψεύτικη βάση απαντά ακαριαία. Ο,τι
// μετριέται είναι ΜΟΝΟ ο δικός μας κώδικας — και είναι το μόνο κομμάτι που
// δεν το φτιάχνει καλύτερο σερβερ.
//
// Τρέξε:  npm run perf:bench            (έλεγχος στα όρια)
//         npm run perf:bench -- --write (καταγραφή νέου ορίου)
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const ROOT = new URL('..', import.meta.url).pathname
const BUDGET = join(ROOT, 'docs/perf/bench.json')
const WRITE = process.argv.includes('--write')

/** Τα μεγέθη χαρτοφυλακίου που μετρώνται. Το 3 είναι το σημερινό πακέτο. */
const SIZES = [3, 50, 200]

/** Πόσες φορές τρέχει κάθε μέγεθος. Κρατιέται ο ΔΙΑΜΕΣΟΣ, όχι ο μέσος όρος. */
const RUNS = 3

/** Ανοχή πάνω από το καταγεγραμμένο, πριν κοκκινίσει. */
const SLACK = 0.35

let chromium
try { ({ chromium } = require('playwright-core')) }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }

const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const gr = n => String(Math.round(n))

void (async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || chromePath(),
    args: ['--no-sandbox'],
  })
  const file = 'file://' + join(ROOT, '.perf-bench/index.html')
  const measured = {}

  for (const n of SIZES) {
    const ready = [], sort = []
    for (let run = 0; run < RUNS; run++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(String(e)))
      await page.goto(`${file}?n=${n}`)

      // ΕΤΟΙΜΟ = ΟΙ ΓΡΑΜΜΕΣ ΕΙΝΑΙ ΣΤΗΝ ΟΘΟΝΗ. Οχι «τελείωσε το fetch»: ο
      // χρήστης δεν βλέπει αιτήματα, βλέπει γραμμές.
      await page.waitForFunction(rows => window.__rows() >= rows, n, { timeout: 60_000 })
        .catch(() => { throw new Error(`Με ${n} ακίνητα οι γραμμές δεν εμφανίστηκαν σε 60 δευτερόλεπτα.${errors.length ? '\n  Σφάλμα: ' + errors[0] : ''}`) })
      const t = await page.evaluate(() => ({ ...window.__t, now: performance.now() }))
      ready.push(t.now - t.start)

      // Η ΤΑΞΙΝΟΜΗΣΗ ΕΙΝΑΙ Η ΧΕΙΡΟΤΕΡΗ ΑΛΛΗΛΕΠΙΔΡΑΣΗ: ξαναχτίζει κάθε γραμμή.
      // Αν κάτι κολλάει, κολλάει εδώ.
      const header = page.locator('th, [role="columnheader"], [data-sort]').filter({ hasText: /καθαρ|έσοδ|εσοδ/i }).first()
      if (await header.count()) {
        const t0 = await page.evaluate(() => performance.now())
        await header.click()
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
        const t1 = await page.evaluate(() => performance.now())
        sort.push(t1 - t0)
      }
      if (errors.length) throw new Error(`Σφάλμα στη σελίδα με ${n} ακίνητα: ${errors[0]}`)
      await ctx.close()
    }
    measured[n] = { ready: median(ready), sort: sort.length ? median(sort) : null }
  }
  await browser.close()

  let budget = {}
  try { budget = JSON.parse(readFileSync(BUDGET, 'utf8')).sizes || {} } catch { /* πρώτη φορά */ }

  console.log('  ΑΚΙΝΗΤΑ   ΕΤΟΙΜΟ   ΤΑΞΙΝΟΜΗΣΗ    ΟΡΙΟ')
  for (const n of SIZES) {
    const m = measured[n], b = budget[n]
    console.log(`  ${String(n).padStart(7)} ${(gr(m.ready) + 'ms').padStart(8)} ${(m.sort === null ? '—' : gr(m.sort) + 'ms').padStart(11)} ${(b ? gr(b.ready) + 'ms' : '—').padStart(8)}`)
  }

  if (WRITE) {
    mkdirSync(join(ROOT, 'docs/perf'), { recursive: true })
    const sizes = {}
    for (const n of SIZES) sizes[n] = { ready: Math.round(measured[n].ready), sort: measured[n].sort === null ? null : Math.round(measured[n].sort) }
    writeFileSync(BUDGET, JSON.stringify({
      note: 'Διάμεσος από 3 εκτελέσεις, scripts/perf-bench.mjs, χωρίς δίκτυο και χωρίς βάση.',
      slack: SLACK, runs: RUNS, sizes,
    }, null, 2) + '\n')
    console.log(`\n✅ Καταγράφηκαν ${SIZES.length} μεγέθη στο docs/perf/bench.json`)
    return
  }

  const missing = SIZES.filter(n => !budget[n])
  if (missing.length) {
    console.error(`\n✗ Χωρίς καταγεγραμμένο όριο για: ${missing.join(', ')}. Τρέξε με --write.`)
    process.exit(1)
  }
  const over = SIZES.filter(n => measured[n].ready > budget[n].ready * (1 + SLACK))
  if (over.length) {
    console.error(`\n✗ ${over.length} ${over.length === 1 ? 'μέγεθος ξεπέρασε' : 'μεγέθη ξεπέρασαν'} το όριο κατά πάνω από ${Math.round(SLACK * 100)}%:\n`)
    for (const n of over) console.error(`  ${n} ακίνητα: ${gr(measured[n].ready)}ms, όριο ${gr(budget[n].ready)}ms`)
    process.exit(1)
  }
  console.log(`\n✅ ${SIZES.length} μεγέθη χαρτοφυλακίου μέσα στα όριά τους.`)
})()
