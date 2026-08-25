#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΣΕΡΝΕΤΑΙ Η ΝΟΑ ΜΕ ΤΟ ΔΑΧΤΥΛΟ;
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ: το πλωτό κουμπί του βοηθού σέρνεται με pointer
// events. Με ποντίκι δουλεύει. Με δάχτυλο ο περιηγητής κρίνει μόνος του,
// στην πρώτη κίνηση, αν η χειρονομία ανήκει στη σελίδα (κύλιση) ή στο
// στοιχείο. Οταν την πάρει η σελίδα, στέλνει `pointercancel` και ΣΤΑΜΑΤΑ να
// στέλνει `pointermove`: το κουμπί μένει κολλημένο εκεί που ήταν.
//
// ΓΙΑΤΙ CDP ΚΑΙ ΟΧΙ ΣΥΝΘΕΤΙΚΑ ΣΥΜΒΑΝΤΑ: ένα `new PointerEvent('pointerdown')`
// από JavaScript παρακάμπτει ολόκληρη τη μηχανή χειρονομιών του περιηγητή.
// Θα περνούσε πράσινο ακόμη και με το σφάλμα ζωντανό. Τα `Input.dispatchTouchEvent`
// είναι πραγματικά αγγίγματα: περνούν από τους κανόνες `touch-action`.
//
// ΟΤΙ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ, ΑΠΟΔΕΙΓΜΕΝΟ ΜΕ ΤΡΕΙΣ ΜΕΤΑΛΛΑΞΕΙΣ. Καθεμιά επαναφέρει
// ένα κομμάτι του σφάλματος και ο έλεγχος κοκκινίζει:
//
//   φεύγει το touch-action:none                  6 από 16 κόβουν
//   φεύγει το μηδένισμα του δείκτη στο pointerdown 4 από 16 κόβουν
//   φεύγει ο ακροατής του pointercancel           2 από 16 κόβουν
//
//     npm run e2e:touch
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const URL_BENCH = pathToFileURL(join(process.cwd(), '.perf-bench/touch.html')).href

/** Οι συσκευές αφής που κρίνουν: τηλέφωνο και ταμπλέτα, κάθετα. */
const DEVICES = [
  { name: 'iPhone SE 375', viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPad 820', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n) } }

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromePath(),
  args: ['--no-sandbox'],
})

/**
 * Ενα ΑΛΗΘΙΝΟ σύρσιμο με το δάχτυλο, βήμα βήμα, όπως το κάνει ο άνθρωπος.
 *
 * Τα ενδιάμεσα βήματα δεν είναι διακοσμητικά: ο περιηγητής αποφασίζει ΠΟΙΟΣ
 * παίρνει τη χειρονομία στην πρώτη ή δεύτερη κίνηση. Ενα μοναδικό άλμα από την
 * αρχή στο τέλος δεν του δίνει ποτέ την ευκαιρία να τη διεκδικήσει, δηλαδή
 * κρύβει ακριβώς το σφάλμα που ψάχνουμε.
 */
async function fingerDrag(cdp, from, to, steps = 12) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) })
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * ΤΟ `window.scrollY` ΔΕΝ ΚΙΝΕΙΤΑΙ ΕΔΩ ΚΑΙ ΘΑ ΗΤΑΝ ΚΕΝΟΣ ΕΛΕΓΧΟΣ. Το κέλυφος
 * κυλά μέσα στο `.app-content`, όχι στο παράθυρο: ένας έλεγχος που κοιτούσε
 * μόνο το παράθυρο θα περνούσε πράσινος ενώ η σελίδα από κάτω κυλούσε κανονικά.
 * Το άθροισμα ΚΑΘΕ κύλισης της σελίδας είναι το μόνο μέγεθος που λέει αλήθεια.
 */
const SCROLLED = () => {
  window.scrolled = () => {
    let t = window.scrollY
    for (const el of document.querySelectorAll('*')) t += el.scrollTop
    return t
  }
}

const box = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
}, sel)

for (const d of DEVICES) {
  console.log(`\n${d.name}`)
  const ctx = await browser.newContext({ ...d, locale: 'el-GR' })
  await ctx.addInitScript(SCROLLED)
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await p.goto(URL_BENCH, { waitUntil: 'load' })
  await p.waitForSelector('.pa-fab', { timeout: 8000 })

  // ── 1. ΤΟ `touch-action` ΤΟΥ ΚΟΥΜΠΙΟΥ ΔΕΝ ΑΦΗΝΕΙ ΤΗ ΣΕΛΙΔΑ ΝΑ ΤΟ ΠΑΡΕΙ ──
  const ta = await p.evaluate(() => getComputedStyle(document.querySelector('.pa-fab')).touchAction)
  ok(`το κουμπί δηλώνει touch-action:none (είναι «${ta}»)`, ta === 'none')

  // ── 2. ΤΟ ΚΑΘΕΤΟ ΣΥΡΣΙΜΟ ΤΟ ΜΕΤΑΚΙΝΕΙ, ΔΕΝ ΚΥΛΑ ΤΗ ΣΕΛΙΔΑ ──────────────
  // Το κάθετο είναι το χειρότερο: ακριβώς η κατεύθυνση που διεκδικεί η σελίδα.
  const before = await box(p, '.pa-fab')
  const scrollBefore = await p.evaluate(() => scrolled())
  await fingerDrag(cdp, { x: before.cx, y: before.cy }, { x: before.cx, y: before.cy - 220 })
  await p.waitForTimeout(120)
  const after = await box(p, '.pa-fab')
  const scrollAfter = await p.evaluate(() => scrolled())
  const moved = before.y - after.y
  ok(`το κάθετο σύρσιμο μετακινεί το κουμπί (μετακινήθηκε ${Math.round(moved)}px από 220)`, moved > 180)
  ok(`και ΔΕΝ κυλά τη σελίδα (κύλησε ${Math.round(scrollAfter - scrollBefore)}px)`, Math.abs(scrollAfter - scrollBefore) < 4)

  // ── 3. ΤΟ ΣΥΡΣΙΜΟ ΔΕΝ ΑΝΟΙΓΕΙ ΤΟΝ ΒΟΗΘΟ ────────────────────────────────
  ok('το σύρσιμο δεν άνοιξε το παράθυρο', !(await p.$('.pa-panel')))

  // ── 4. ΚΑΙ ΜΕΤΑ ΤΟ ΣΥΡΣΙΜΟ, ΤΟ ΑΠΛΟ ΑΓΓΙΓΜΑ ΑΝΟΙΓΕΙ ────────────────────
  // Η ΠΑΥΣΗ ΔΕΝ ΕΙΝΑΙ ΓΙΑ ΤΟΝ ΚΩΔΙΚΑ ΜΑΣ. Ο ίδιος ο περιηγητής καταπίνει το
  // πάτημα που έρχεται αμέσως μετά από χειρονομία (μισό δευτερόλεπτο περίπου),
  // ώστε ένα δεύτερο άγγιγμα να μη μετρήσει ως διπλό. Ο άνθρωπος που σέρνει και
  // μετά πατά κάνει πολύ μεγαλύτερη παύση από αυτήν.
  await p.waitForTimeout(600)
  const at = await box(p, '.pa-fab')
  await p.touchscreen.tap(Math.round(at.cx), Math.round(at.cy))
  await p.waitForTimeout(200)
  ok('το άγγιγμα μετά το σύρσιμο ανοίγει τον βοηθό', !!(await p.$('.pa-panel')))

  // ── 5. ΤΟ ΚΟΥΜΠΙ ΚΛΕΙΣΙΜΑΤΟΣ ΣΕΡΝΕΤΑΙ ΚΙ ΑΥΤΟ ──────────────────────────
  const cb = await box(p, '.pa-fab-close')
  if (cb) {
    await fingerDrag(cdp, { x: cb.cx, y: cb.cy }, { x: cb.cx - 140, y: cb.cy })
    await p.waitForTimeout(120)
    const cb2 = await box(p, '.pa-fab-close')
    ok(`και το κλείσιμο σέρνεται (${Math.round(cb.x - cb2.x)}px από 140)`, cb.x - cb2.x > 110)
  } else { ok('το κουμπί κλεισίματος υπάρχει', false); await ctx.close(); continue }

  // ── 6. ΤΟ ΣΥΡΣΙΜΟ ΔΕΝ ΑΦΗΝΕΙ ΤΟ ΚΟΥΜΠΙ ΚΟΛΛΗΜΕΝΟ ΣΕ ΚΑΤΑΣΤΑΣΗ ─────────
  // Χειρονομία που ο περιηγητής ακυρώνει (δεύτερο δάχτυλο, εισερχόμενη κλήση)
  // στέλνει `pointercancel`. Χωρίς ακροατή, το κουμπί έμενε «σε σύρσιμο» για
  // πάντα: κάθε επόμενη κίνηση του δαχτύλου κάπου αλλού το τραβούσε μαζί.
  const c0 = await box(p, '.pa-fab-close')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(c0.cx), y: Math.round(c0.cy), radiusX: 12, radiusY: 12, force: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(c0.cx) + 30, y: Math.round(c0.cy), radiusX: 12, radiusY: 12, force: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await p.waitForTimeout(80)
  const c1 = await box(p, '.pa-fab-close')
  // Δεύτερο άγγιγμα ΜΑΚΡΙΑ από το κουμπί: αν είχε μείνει κολλημένο, θα το ακολουθούσε.
  await fingerDrag(cdp, { x: 40, y: 300 }, { x: 40, y: 120 }, 6)
  await p.waitForTimeout(120)
  const c2 = await box(p, '.pa-fab-close')
  ok(`η ακυρωμένη χειρονομία δεν αφήνει το κουμπί κολλημένο (μετακινήθηκε ${Math.round(Math.hypot(c2.x - c1.x, c2.y - c1.y))}px χωρίς να το αγγίξει κανείς)`,
    Math.hypot(c2.x - c1.x, c2.y - c1.y) < 4)

  // ── 7. Η ΘΕΣΗ ΜΕΤΑ ΑΠΟ ΑΚΥΡΩΜΕΝΗ ΧΕΙΡΟΝΟΜΙΑ ΦΥΛΑΣΣΕΤΑΙ ─────────────────
  // Ο δείκτης «σέρνεται» κρατά τη γραφή στη μνήμη του περιηγητή, ώστε να μη
  // γράφεται σε κάθε καρέ. Αν δεν κλείσει ποτέ, η νέα θέση δεν αποθηκεύεται:
  // ο χρήστης έσυρε το κουμπί, τον διέκοψε μια κλήση και στην επόμενη επίσκεψη
  // το βρίσκει πάλι στη γωνία.
  await p.evaluate(() => localStorage.removeItem('pa_fab_pos'))
  const s0 = await box(p, '.pa-fab-close')
  const finger = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 12, radiusY: 12, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: finger(s0.cx, s0.cy) })
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: finger(s0.cx, s0.cy - 90 * i / 8) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await p.waitForTimeout(150)
  const saved = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('pa_fab_pos') || 'null') } catch { return null } })
  const s1 = await box(p, '.pa-fab-close')
  ok('η ακυρωμένη χειρονομία αποθηκεύει τη θέση που άφησε', !!saved && Math.abs(saved.y - s1.y) < 2 && Math.abs(saved.x - s1.x) < 2)

  await ctx.close()
}

await browser.close()
console.log(`\nαφή — ${pass} πέρασαν, ${fail} απέτυχαν`)
if (fail) process.exit(1)
console.log('✓ η Νόα σέρνεται με το δάχτυλο')
