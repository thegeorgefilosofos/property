#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΦΑΡΜΟΓΗ ΣΕ ΤΗΛΕΦΩΝΟ ΚΑΙ ΣΕ ΤΑΜΠΛΕΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΚΑΙ ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΟΣ Ο ΕΛΕΓΧΟΣ (Αύγουστος 2026):
//
//   • Η αρχική σελίδα έτρεχε στα 11,5 fps σε μεσαίο Android, με 57 από 58 καρέ
//     χαμένα, ΧΩΡΙΣ ο χρήστης να αγγίζει τίποτα. Είκοσι ατέρμονες κινήσεις με
//     θολώματα ώς 130 pixel.
//   • Το LCP της αρχικής ήταν 7,2 δευτερόλεπτα σε Fast 3G, όχι από βάρος αλλά
//     επειδή μια εναλλασσόμενη λέξη κατέγραφε νέο υποψήφιο κάθε 2,8 δευτ.
//   • Στις Δαπάνες, το ΠΟΣΟ έβγαινε 136 pixel εκτός οθόνης στα 375, και κανένας
//     έλεγχος δεν το έβλεπε: ο `.app-content` έχει `overflow-y: auto`, οπότε το
//     `overflow-x` γίνεται σιωπηλά `auto` και καταπίνει τη ροή. Γι' αυτό εδώ η
//     υπερχείλιση ελέγχεται ΑΝΑ ΚΥΛΙΟΜΕΝΟ ΔΟΧΕΙΟ, όχι μόνο στη σελίδα.
//
// ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI: χρειάζεται ζωντανό server και browser.
//     npm run build && npx next start -p 3100
//     node scripts/e2e-mobile.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const B = process.env.E2E_BASE || 'http://localhost:3100'

/** Οι συσκευές που κρίνουν. Το 320 είναι το στενότερο που κυκλοφορεί ακόμη. */
const DEVICES = [
  { name: 'στενό 320',    viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPhone SE',    viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'Android 360',  viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'iPad κάθετο',  viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

const PAGES = ['/', '/login', '/signup', '/ypologismos-forou-enoikion', '/ypologismos-enfia',
  '/vraxyxronia-i-makroxronia', '/kathari-apodosi', '/privacy']

/** Το ελάχιστο ύψος στόχου αφής. Ο κανόνας του έργου, όχι δικός μου. */
const TAP = 44

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n) } }

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

for (const d of DEVICES) {
  const ctx = await browser.newContext({ ...d, locale: 'el-GR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  for (const path of PAGES) {
    const p = await ctx.newPage()
    await p.goto(B + path, { waitUntil: 'networkidle' })

    // ── 1. ΚΑΜΙΑ ΟΡΙΖΟΝΤΙΑ ΥΠΕΡΧΕΙΛΙΣΗ, ΟΥΤΕ ΣΤΗ ΣΕΛΙΔΑ ΟΥΤΕ ΜΕΣΑ ΣΕ ΔΟΧΕΙΟ
    const over = await p.evaluate(() => {
      const out = []
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ sel: 'html', by: document.documentElement.scrollWidth - innerWidth })
      // Κάθε στοιχείο που κυλά κάθετα κρύβει σιωπηλά και οριζόντια ροή.
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowX === 'auto' || cs.overflowX === 'scroll'
        if (!scrolls) continue
        // Οσα κυλούν ΕΠΙΤΗΔΕΣ οριζόντια το δηλώνουν με κλάση.
        if (el.classList.contains('po-scroll-x') || el.classList.contains('lp-plans')
          || el.classList.contains('lp-aud') || el.classList.contains('lp-duo')) continue
        if (el.scrollWidth > el.clientWidth + 1) {
          out.push({ sel: el.className || el.tagName, by: el.scrollWidth - el.clientWidth })
        }
      }
      return out
    })
    ok(`${d.name} ${path}: καμία οριζόντια υπερχείλιση${over.length ? ' — ' + over.map(o => `${o.sel} +${o.by}px`).join(', ') : ''}`, over.length === 0)

    // ── 2. ΤΑ ΠΕΔΙΑ ΔΕΝ ΖΟΥΜΑΡΟΥΝ ΤΟ SAFARI
    // Ο δρομέας (`type=range`) δεν έχει κείμενο και δεν ζουμάρει τίποτα: το
    // μέγεθος γραμματοσειράς του ορίζει το πάχος του, όχι την αναγνωσιμότητα.
    const small = await p.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
      .filter(el => el.type !== 'hidden' && el.type !== 'range' && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map(el => `${el.id || el.name || el.type}:${getComputedStyle(el).fontSize}`))
    ok(`${d.name} ${path}: κανένα πεδίο κάτω από 16px${small.length ? ' — ' + small.slice(0, 3).join(', ') : ''}`, small.length === 0)

    await p.close()
  }
  await ctx.close()
}

// ── 3. ΤΟ ΚΑΡΕ ΤΗΣ ΑΡΧΙΚΗΣ, ΣΕ ΜΕΣΑΙΟ ANDROID ────────────────────────────
{
  const ctx = await browser.newContext({ ...DEVICES[1], locale: 'el-GR' })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await p.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  await p.goto(B + '/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const r = await p.evaluate(() => new Promise(res => {
    let n = 0, j = 0, last = performance.now(); const t0 = last
    const t = () => {
      const now = performance.now(); if (now - last > 20) j++; last = now; n++
      if (now - t0 < 4000) requestAnimationFrame(t)
      else res({ fps: +(n / ((now - t0) / 1000)).toFixed(1), jankPct: Math.round(j / n * 100) })
    }
    requestAnimationFrame(t)
  }))
  // Το όριο είναι 45 fps: κάτω από αυτό η κύλιση γίνεται αισθητά τραβηγμένη.
  ok(`αρχική σε μεσαίο Android: ${r.fps} fps, ${r.jankPct}% χαμένα καρέ`, r.fps >= 45 && r.jankPct <= 25)
  await ctx.close()
}

await browser.close()
console.log(`\nΚινητό και ταμπλέτα — ${pass} πέρασαν, ${fail} απέτυχαν`)
process.exit(fail ? 1 : 0)
