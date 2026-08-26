#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΣΕΣ ΟΘΟΝΕΣ ΚΥΛΑΕΙ Ο ΧΡΗΣΤΗΣ ΓΙΑ ΝΑ ΔΕΙ ΜΙΑ ΚΑΡΤΕΛΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ, ΓΡΑΜΜΕΝΟ ΑΠΟ ΤΟΝ ΙΔΙΟ. «Ο κάθετος χώρος δεν
// ελέγχεται». Ολοι οι υπόλοιποι έλεγχοι διάταξης ρωτούν πράγματα ΟΡΙΖΟΝΤΙΑ:
// κόβεται το κείμενο, ξεφεύγει ο πίνακας, φτάνει ο στόχος αφής τα 44. Καμία
// μέτρηση δεν ρωτούσε πόσο ΜΑΚΡΙΑ είναι μια οθόνη, που είναι ακριβώς το
// πράγμα που δεν φαίνεται σε στιγμιότυπο και το νιώθει μόνο το δάχτυλο.
//
// ΓΙΑΤΙ ΜΕΤΡΙΕΤΑΙ ΣΕ ΟΘΟΝΕΣ ΚΑΙ ΟΧΙ ΣΕ ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ. Τα 4.800 εικονοστοιχεία
// δεν λένε τίποτα από μόνα τους· «έξι οθόνες στο κινητό» λένε ότι ο χρήστης
// σέρνει έξι φορές για να φτάσει στο τέλος. Είναι η μονάδα της κίνησης, όχι
// της διάταξης.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΚΑΣΤΑΝΙΑ ΚΑΙ ΟΧΙ ΟΡΙΟ. Ενα σταθερό όριο («καμία οθόνη πάνω από
// τέσσερις») θα ήταν αυθαίρετο: η Επισκόπηση ΠΡΕΠΕΙ να είναι μακριά, ο
// επιλογέας ΔΕΝ πρέπει. Αυτό που δεν είναι αυθαίρετο είναι η ΑΥΞΗΣΗ: αν μια
// καρτέλα μακραίνει, κάποιος πρόσθεσε κάτι και δεν αφαίρεσε τίποτα· και αυτό
// θέλει απόφαση. Η βάση είναι μετρημένη, γραμμένη στο δίσκο και ανεβαίνει
// μόνο με ρητή αναθεώρηση.
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-vertical.mjs
//     UPDATE_BASELINE=1 node scripts/e2e-vertical.mjs   (μετά από ρητή απόφαση)
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from '/home/user/property/scripts/lib/chrome.mjs'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/property/node_modules/playwright-core')

// Τρία πλάτη, τρεις συσκευές: τηλέφωνο, ταμπλέτα όρθια, φορητός.
const WIDTHS = [[375, 812], [768, 1024], [1280, 800]]
const SCENES = ['portfolio','cash','inbox','ledger','checklist','compare','loan','pricing','bills','contacts','roi']
const BASELINE = new URL('./vertical-baseline.json', import.meta.url)
// Δέκατο της οθόνης: κάτω από αυτό είναι στρογγυλοποίηση γραμματοσειράς,
// πάνω από αυτό είναι περιεχόμενο που προστέθηκε.
const SLACK = 0.1

const browser = await chromium.launch({ executablePath: chromePath() })
const measured = {}
for (const [w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 1100, hasTouch: w < 1100, locale: 'el-GR' })
  for (const s of SCENES) {
    const p = await ctx.newPage()
    await p.goto(`file:///home/user/property/.perf-bench/mobile.html?c=${s}&n=6`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    // Η ΚΥΛΙΣΗ ΔΕΝ ΕΙΝΑΙ ΠΑΝΤΑ ΣΤΟ ΠΑΡΑΘΥΡΟ. Το κέλυφος βάζει το περιεχόμενο
    // σε «.app-content» με δική του κύλιση· αν μετρηθεί το documentElement,
    // βγαίνει πάντα «μία οθόνη» και ο έλεγχος είναι κενός.
    const screens = await p.evaluate(() => {
      const el = document.querySelector('.app-content') || document.documentElement
      return el.scrollHeight / (el.clientHeight || window.innerHeight)
    })
    measured[`${s}@${w}`] = Math.round(screens * 10) / 10
    await p.close()
  }
  await ctx.close()
}
await browser.close()

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
if (!base || process.env.UPDATE_BASELINE) {
  writeFileSync(BASELINE, JSON.stringify(measured, null, 2) + '\n')
  console.log(`✓ η βάση γράφτηκε: ${Object.keys(measured).length} μετρήσεις`)
  process.exit(0)
}

const grown = [], shrunk = [], fresh = []
for (const [k, v] of Object.entries(measured)) {
  if (base[k] === undefined) { fresh.push(`${k} ${v}`); continue }
  if (v > base[k] + SLACK) grown.push(`${k}  ${base[k]} → ${v}`)
  else if (v < base[k] - SLACK) shrunk.push(`${k}  ${base[k]} → ${v}`)
}
for (const x of shrunk) console.log('  ↓ ' + x)
for (const x of fresh) console.log('  + ' + x + ' (νέα σκηνή, γράψε τη βάση)')
if (grown.length) {
  console.error(`\n✗ ${grown.length} καρτέλες μάκρυναν:\n`)
  for (const x of grown) console.error('  ' + x)
  console.error('\n  Η μονάδα είναι ΟΘΟΝΕΣ κύλισης. Κάτι προστέθηκε και τίποτα δεν αφαιρέθηκε.')
  console.error('  Αν είναι σωστό, γράψε τη βάση ρητά: UPDATE_BASELINE=1 node scripts/e2e-vertical.mjs')
  process.exit(1)
}
const worst = Object.entries(measured).sort((a, b) => b[1] - a[1]).slice(0, 3)
console.log(`\nΚάθετος χώρος — καμία καρτέλα δεν μάκρυνε. Πιο μακριές: ${worst.map(([k, v]) => `${k} ${String(v).replace('.', ',')}`).join(' · ')}`)
