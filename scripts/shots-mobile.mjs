#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΣΤΙΓΜΙΟΤΥΠΑ ΤΟΥ ΚΙΝΗΤΟΥ, ΓΙΑ ΝΑ ΤΑ ΔΕΙ ΑΝΘΡΩΠΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ, ΕΝΩ ΥΠΑΡΧΕΙ ΗΔΗ Ο ΕΛΕΓΧΟΣ ΔΙΑΤΑΞΗΣ. Ο έλεγχος απαντά σε
// ερωτήσεις με ναι ή όχι: κόβεται, ξεφεύγει, πέφτει πάνω, φτάνει τα 44. Δεν
// απαντά στο «φαίνεται χάλια», που είναι η ερώτηση του χρήστη. Πυκνότητα,
// ρυθμός, κενά που περισσεύουν ή λείπουν, ιεραρχία που δεν διαβάζεται: αυτά
// τα βλέπει μόνο μάτι.
//
// ΤΟ ΠΛΑΤΟΣ ΕΙΝΑΙ 360, ΤΟ ΠΛΑΤΟΣ ΤΗΣ ΣΥΣΚΕΥΗΣ ΤΟΥ ΧΡΗΣΤΗ. Ολόκληρη η σελίδα,
// όχι το πρώτο κάδρο: τα σφάλματα πυκνότητας ζουν στη μέση.
//
//     node scripts/shots-mobile.mjs [φάκελος]
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from '/home/user/property/scripts/lib/chrome.mjs'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/property/node_modules/playwright-core')

const OUT = process.argv[2] || '.shots'
mkdirSync(OUT, { recursive: true })

const SCENES = ['portfolio','cash','rent','inbox','ledger','checklist','modal','select','compare','loan','pricing','bills','contacts','wizard','roi','tenant','scan']
const PAGES = ['/', '/login', '/signup', '/ypologismos-forou-enoikion', '/ypologismos-enfia', '/kathari-apodosi', '/imerologio', '/vraxyxronia-i-makroxronia']
const BASE = process.env.E2E_BASE || 'http://localhost:3100'

const browser = await chromium.launch({ executablePath: chromePath() })
const ctx = await browser.newContext({
  viewport: { width: 360, height: 800 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'el-GR',
})
await ctx.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch {} })

let n = 0
for (const s of SCENES) {
  const p = await ctx.newPage()
  await p.goto(`file:///home/user/property/.perf-bench/mobile.html?c=${s}&n=6`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  // Τα πτυσσόμενα ανοιχτά: αλλιώς φωτογραφίζονται επικεφαλίδες.
  for (let i = 0; i < 3; i++) {
    const o = await p.evaluate(() => { const t = [...document.querySelectorAll('.acc-toggle[aria-expanded="false"]')]; t.forEach(b => b.click()); return t.length })
    if (!o) break
    await p.waitForTimeout(300)
  }
  await p.screenshot({ path: `${OUT}/scene-${s}.png`, fullPage: true })
  n++
  await p.close()
}

let live = false
try { live = (await fetch(BASE, { signal: AbortSignal.timeout(3000) })).ok } catch { live = false }
for (const path of (live ? PAGES : [])) {
  const p = await ctx.newPage()
  try { await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 }) } catch { await p.close(); continue }
  await p.waitForTimeout(500)
  await p.screenshot({ path: `${OUT}/page-${path.replace(/\//g, '') || 'arxiki'}.png`, fullPage: true })
  n++
  await p.close()
}
await browser.close()
console.log(`✓ ${n} στιγμιότυπα στα 360×800, στο ${OUT}`)
