#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΛΑΚΙΔΙΑ ΜΙΑΣ ΣΕΙΡΑΣ ΕΙΝΑΙ ΙΣΑ ΚΟΥΤΙΑ, ΜΕ ΤΑ ΝΟΥΜΕΡΑ ΣΤΗΝ ΙΔΙΑ ΓΡΑΜΜΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΟΠΩΣ ΤΟ ΦΩΤΟΓΡΑΦΙΣΕ Ο ΧΡΗΣΤΗΣ ΣΤΗΝ ΑΝΑΧΡΗΜΑΤΟΔΟΤΗΣΗ: τέσσερα
// πλακίδια στη σειρά, τέσσερα διαφορετικά ύψη, τα νούμερα σε τέσσερις
// διαφορετικές γραμμές. Δύο από τα τέσσερα είχαν σημείωση από κάτω· τα άλλα
// δύο όχι και ο βοηθός διάταξης στοίχιζε στο ΚΑΤΩ άκρο.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΝΕ ΤΙΠΟΤΑ. Η στοίχιση χειριστηρίων κοιτά ΠΕΔΙΑ ΦΟΡΜΑΣ. Οι
// ετικέτες κοιτούν πόσες γραμμές πιάνει η ετικέτα. Το βιβλίο πλακιδίων κοιτά
// αν το πλακίδιο γράφτηκε δεύτερη φορά. Κανένα δεν ρωτούσε το απλούστερο που
// βλέπει το μάτι: είναι τα κουτιά ΙΣΑ; Τίποτα δεν κόβεται, τίποτα δεν ξεφεύγει,
// όλοι οι φύλακες πράσινοι — και η σειρά διαβάζεται πρόχειρη.
//
// ΤΙ ΕΛΕΓΧΕΙ, ΓΙΑ ΚΑΘΕ ΟΠΤΙΚΗ ΣΕΙΡΑ ΜΕ ΔΥΟ Η ΠΕΡΙΣΣΟΤΕΡΑ ΠΛΑΚΙΔΙΑ:
//   • έχουν όλα το ίδιο ύψος κουτιού;
//   • ξεκινούν όλα τα νούμερα στην ίδια γραμμή;
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-tile-row.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { benchUrl } from './lib/paths.mjs'
import { scenesToRun } from './lib/scenes.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const WIDTHS = [390, 820, 1280]

const PROBE = () => {
  const out = []
  for (const g of document.querySelectorAll('body *')) {
    const tiles = [...g.children].filter(c => c.classList?.contains('kpi-card') && c.checkVisibility?.())
    if (tiles.length < 2) continue
    // ΟΠΤΙΚΗ ΣΕΙΡΑ, ΟΧΙ ΟΛΟ ΤΟ ΠΛΕΓΜΑ: σε δύο γραμμές των τριών, η δεύτερη
    // γραμμή δεν οφείλει να έχει το ύψος της πρώτης.
    const rows = new Map()
    for (const c of tiles) {
      const r = c.getBoundingClientRect()
      const key = Math.round(r.top)
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push(c)
    }
    for (const [top, row] of rows) {
      if (row.length < 2) continue
      const hs = row.map(c => Math.round(c.getBoundingClientRect().height))
      const labels = row.map(c => ((c.querySelector('.kpi-label') || {}).textContent || '').trim().slice(0, 14))
      if (new Set(hs).size > 1) {
        out.push(`κουτιά σε ${new Set(hs).size} ύψη (${[...new Set(hs)].join('/')}) — ${labels.join(' · ')}`)
        continue
      }
      const vs = row.map(c => { const v = c.querySelector('.kpi-value'); return v ? Math.round(v.getBoundingClientRect().top - c.getBoundingClientRect().top) : null }).filter(x => x != null)
      if (new Set(vs).size > 1) out.push(`αριθμοί σε ${new Set(vs).size} γραμμές (${[...new Set(vs)].join('/')} από την κορυφή) — ${labels.join(' · ')} @${top}`)
    }
  }
  return out
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
const findings = []
let scanned = 0
for (const width of WIDTHS) for (const scene of scenesToRun()) {
  const page = await browser.newPage({ viewport: { width, height: 1200 } })
  try {
    await page.goto(benchUrl(scene), { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(350)
    // Τα διπλωμένα πάνελ κρύβουν τις μισές σειρές πλακιδίων της εφαρμογής.
    for (let pass = 0; pass < 2; pass++) {
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('[aria-expanded="false"]')) (b instanceof HTMLElement) && b.click()
      })
      await page.waitForTimeout(350)
    }
    scanned++
    for (const f of await page.evaluate(PROBE)) findings.push(`${scene}@${width}  ${f}`)
  } catch { /* η σκηνή που δεν φορτώνει το λέει η σάρωση διάταξης */ }
  await page.close()
}
await browser.close()

if (findings.length) {
  console.error(`\n✗ ${findings.length} σειρές πλακιδίων που δεν είναι ζυγισμένες:\n`)
  for (const f of findings) console.error('  ' + f)
  console.error(`
  Το πλακίδιο ΕΙΝΑΙ κουτί: δύο κουτιά δίπλα δίπλα με διαφορετικό ύψος
  διαβάζονται ως πρόχειρη δουλειά. Σειρά πλακιδίων στοιχίζεται με 'stretch'
  (ο κανόνας ζει στο globals.css, .fixed-cols:has(> .kpi-card)) και το
  νούμερο ξεκινά στην ίδια γραμμή σε όλα.`)
  process.exit(1)
}
console.log(`✅ Κάθε σειρά πλακιδίων ζυγισμένη σε ${scanned} σκηνές × ${WIDTHS.length} πλάτη: ίσα κουτιά, νούμερα στην ίδια γραμμή.`)
