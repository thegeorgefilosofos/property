#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑ ΠΛΑΚΙΔΙΟ, ΟΧΙ ΕΠΤΑ — ΚΡΙΜΕΝΟ ΣΤΗΝ ΟΘΟΝΗ ΚΑΙ ΟΧΙ ΣΤΟΝ ΚΩΔΙΚΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΤΗΝ ΠΡΩΤΗ ΦΟΡΑ: 36 νούμερα σε δέκα οθόνες, γραμμένα έξω από το
// βιβλίο, με ΕΞΙ διαφορετικά μεγέθη — 15, 16, 20, 24, 28 και 40. Επτά γραφές
// του ίδιου σχήματος: το `KPIGrid`, το `KPI` του Δανείου, δεύτερο `KPI` στην
// Αξιοποίηση, το `MetricTile` δίπλα του, το `statTile` των Πελατών, οι τρεις
// γραμμές της Λογιστικής και της Απόδοσης· και η γραμμή του ESIS.
//
// ΓΙΑΤΙ ΣΑΡΩΣΗ ΚΑΙ ΟΧΙ ΦΥΛΑΚΑΣ ΚΕΙΜΕΝΟΥ. Δοκιμάστηκε ευρετικό πάνω στον πηγαίο
// κώδικα: 35 ευρήματα, τα περισσότερα επικεφαλίδες ενότητας πάνω από πίνακα.
// Η διαφορά ανάμεσα σε «ετικέτα πλακιδίου» και «επικεφαλίδα ενότητας» φαίνεται
// μόνο στην ΑΠΟΔΟΣΗ: μέγεθος, βάρος, τι κάθεται από κάτω, πόσο φαρδύ είναι το
// κουτί. Εδώ ανοίγει ο περιηγητής και ρωτά την ίδια την οθόνη.
//
// ΤΙ ΨΑΧΝΕΙ: κείμενο που ΜΟΙΑΖΕΙ αριθμός (ποσό, ποσοστό, πολλαπλασιαστής), σε
// μέγεθος 15 και πάνω με βάρος 600 και πάνω, με ετικέτα κεφαλαίων από πάνω του,
// ΕΞΩ από `.kpi-card` και `.kpi-plain`.
//
// ΟΙ ΕΞΑΙΡΕΣΕΙΣ ΕΙΝΑΙ ΟΝΟΜΑΣΤΙΚΕΣ ΚΑΙ ΕΧΟΥΝ ΛΟΓΟ. Δεν είναι «δεν πρόλαβα»:
// είναι σχήματα που ΔΕΝ είναι το πλακίδιο του βιβλίου. Οποιος προσθέσει
// εξαίρεση χωρίς λόγο, το κάνει φανερά.
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-tile-book.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { benchUrl } from './lib/paths.mjs'
import { SCENES } from './lib/scenes.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

/** Νούμερα που ΔΕΝ είναι πλακίδιο, με τον λόγο τους. Κλειδί: η ετικέτα τους. */
const ALLOWED = new Map([
  ['Μου χρωστάνε', 'ο ήρωας του Ταμείου: ένα ποσό στα 40, με δικό του δοχείο (.cash-hero)'],
  ['Χρωστάω', 'ο ήρωας του Ταμείου, η δεύτερη πλευρά του ίδιου ζυγού'],
  ['Πρόβλεψη φόρου', 'ήρωας πλήρους πλάτους, με το ιδίωμα TT.display'],
  ['ΕΝΦΙΑ τον χρόνο', 'ήρωας πλήρους πλάτους, με το ιδίωμα TT.display'],
  ['Επαγγελματίας', 'τιμή πακέτου συνδρομής, όχι δείκτης ακινήτου'],
  ['Ρεύμα', 'κεφαλίδα κάρτας παρόχου: τίτλος και ποσό στην ίδια γραμμή, όχι ετικέτα από πάνω'],
  ['Νερό', 'κεφαλίδα κάρτας παρόχου'],
  ['Ασφάλεια κατοικίας', 'κεφαλίδα κάρτας παρόχου'],
  ['Υπόλοιπο σήμερα', 'ο ένας αριθμός της κάρτας δανείου, σκόπιμα μεγαλύτερος από τα υπόλοιπα'],
  ['Δόση τον μήνα', 'ο δεύτερος του ίδιου ζεύγους, σκόπιμα μικρότερος'],
])

const PROBE = () => {
  const NUM = /^[+\-−]?[\d.]{1,15}(,\d+)?\s?(€|%|×)?$/
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue
    const t = (el.textContent || '').trim()
    if (!t || t.length > 20 || !NUM.test(t)) continue
    const cs = getComputedStyle(el)
    if (parseFloat(cs.fontSize) < 15 || Number(cs.fontWeight) < 600) continue
    if (!el.checkVisibility?.()) continue
    if (el.closest('table')) continue
    if (el.closest('.kpi-card, .kpi-plain')) continue
    const prev = el.previousElementSibling || (el.parentElement && el.parentElement.previousElementSibling)
    if (!prev) continue
    const pcs = getComputedStyle(prev)
    if (pcs.textTransform !== 'uppercase' || parseFloat(pcs.fontSize) > 13) continue
    out.push({ label: (prev.textContent || '').trim(), value: t, fs: Math.round(parseFloat(cs.fontSize) * 10) / 10 })
  }
  return out
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1, locale: 'el-GR' })
const rows = []
for (const scene of SCENES) {
  const p = await ctx.newPage()
  try {
    await p.goto(benchUrl(scene, 6), { waitUntil: 'networkidle' })
    await p.waitForTimeout(400)
    for (let i = 0; i < 3; i++) {
      const n = await p.evaluate(() => { const t = [...document.querySelectorAll('.acc-toggle[aria-expanded="false"]')]; t.forEach(x => x.click()); return t.length })
      if (!n) break
      await p.waitForTimeout(250)
    }
    for (const r of await p.evaluate(PROBE)) {
      if (ALLOWED.has(r.label)) continue
      rows.push(`  ✗ ${scene}: «${r.label}» → «${r.value}» στα ${r.fs}px`)
    }
  } catch (e) {
    rows.push(`  ✗ ${scene}: Η ΣΚΗΝΗ ΔΕΝ ΑΠΟΔΟΘΗΚΕ (${String(e).slice(0, 60)})`)
  }
  await p.close()
}
await browser.close()

if (rows.length) {
  console.error(`✗ ${rows.length} νούμερα σε πλακίδιο γραμμένο έξω από το βιβλίο:\n`)
  for (const r of rows) console.error(r)
  console.error('\n  Το πλακίδιο ζει ως <Tile> και η γραμμή στοιχείων ως <Stat>, στο')
  console.error('  components/Theme.tsx: ένα μέγεθος ανά σειρά από το μακρύτερο νούμερο,')
  console.error('  ετικέτα που κρατά δύο γραμμές όταν στενεύει, ανύψωση από το φύλλο')
  console.error('  στυλ. Αν το σχήμα σου ΔΕΝ είναι αυτό, γράψε το στον κατάλογο')
  console.error('  εξαιρέσεων αυτού του αρχείου, με τον λόγο του.\n')
  process.exit(1)
}
console.log(`✓ το πλακίδιο γράφεται μία φορά, σε ${SCENES.length} σκηνές`)
