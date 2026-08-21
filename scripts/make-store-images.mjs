#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΙΚΟΝΕΣ ΤΩΝ ΠΡΟΪΟΝΤΩΝ ΤΟΥ ΚΑΤΑΣΤΗΜΑΤΟΣ
// ─────────────────────────────────────────────────────────────────────────
// Η Lemon Squeezy δείχνει μία εικόνα ανά προϊόν: στο ταμείο, στην απόδειξη
// που φτάνει με email, και σε κάθε κοινοποίηση συνδέσμου. Χωρίς αυτήν, η
// πρώτη οπτική επαφή του πελάτη με το προϊόν είναι ένα γκρι τετράγωνο.
//
// ΓΙΑΤΙ ΠΑΡΑΓΟΝΤΑΙ ΑΠΟ ΚΩΔΙΚΑ ΚΑΙ ΟΧΙ ΑΠΟ ΣΧΕΔΙΑΣΤΙΚΟ ΠΡΟΓΡΑΜΜΑ. Τα ονόματα,
// οι υπότιτλοι και τα όρια ακινήτων ΔΕΝ ξαναγράφονται εδώ: έρχονται από το
// lib/billing/plans.ts, την ίδια πηγή με τον τιμοκατάλογο και τους Ορους. Μια
// εικόνα που λέει «Εως 3 ακίνητα» ενώ το πακέτο άλλαξε είναι ψέμα που ζει σε
// τέσσερα σημεία ταυτόχρονα, και κανένας φύλακας δεν διαβάζει PNG.
//
// Οι γραμματοσειρές είναι οι ΤΟΠΙΚΕΣ του public/fonts — τα ίδια αρχεία που
// σερβίρει η εφαρμογή, ώστε το «Ιδιοκτήτης+» της εικόνας να έχει ακριβώς το
// σχήμα που έχει και μέσα στο προϊόν.
//
// ΧΡΗΣΗ:  node scripts/make-store-images.mjs [φάκελος εξόδου]
// ═══════════════════════════════════════════════════════════════════════════
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const { PLANS, PLAN_ORDER } = await import('../lib/billing/plans.ts')

const OUT = resolve(process.argv[2] || 'store-images')
const ROOT = resolve(import.meta.dirname, '..')
const font = f => `file://${ROOT}/public/fonts/${f}`

/** Πόσα ακίνητα, γραμμένα για άνθρωπο. Το Infinity δεν διαβάζεται. */
const capacity = plan => {
  if (!Number.isFinite(plan.maxProperties)) return 'Απεριόριστα ακίνητα'
  return plan.maxProperties === 1 ? '1 ακίνητο' : `Έως ${plan.maxProperties} ακίνητα`
}

// Το σήμα είναι ΤΟ ΙΔΙΟ path με το app/icon.svg. Αντιγραμμένο σχήμα θα
// απέκλινε στην πρώτη αλλαγή του λογοτύπου, και θα φαινόταν μόνο σε απόδειξη.
const MARK = 'M17 34V14h8.2c4.3 0 7.3 2.6 7.3 6.7 0 4.1-3 6.8-7.3 6.8h-3.6V34H17zm4.6-10.1h3.1c1.9 0 3.1-1 3.1-3.1s-1.2-3-3.1-3h-3.1v6.1z'

const html = plan => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url('${font('inter-greek.woff2')}') format('woff2'); font-weight: 100 900; font-display: block }
@font-face { font-family: InterLat; src: url('${font('inter-latin.woff2')}') format('woff2'); font-weight: 100 900; font-display: block }
* { margin: 0; padding: 0; box-sizing: border-box }
body {
  width: 1600px; height: 1200px; overflow: hidden; position: relative;
  font-family: Inter, InterLat, system-ui, sans-serif;
  color: #eef2f7;
  background: linear-gradient(158deg, #0a1120 0%, #070b12 62%);
}
/* Μία και μόνη πηγή φωτός, ψηλά δεξιά: δίνει βάθος χωρίς να ζωγραφίζει
   τίποτα. Η εναλλακτική —πλέγμα, κύκλοι, «τεχνολογικά» μοτίβα— κάνει την
   εικόνα να μοιάζει με κάθε άλλη εικόνα SaaS. */
body::after {
  content: ''; position: absolute; top: -420px; right: -320px;
  width: 1100px; height: 1100px; border-radius: 50%;
  background: radial-gradient(circle, rgba(138,180,248,.16) 0%, rgba(138,180,248,0) 68%);
}
.wrap { position: relative; z-index: 1; height: 100%; padding: 118px 130px;
        display: flex; flex-direction: column; justify-content: space-between }
.lockup { display: flex; align-items: center; gap: 26px }
.mark { width: 84px; height: 84px; border-radius: 19px; background: #1a73e8; display: block }
.word { font-size: 40px; font-weight: 620; letter-spacing: -.022em; color: #eef2f7 }
.name { font-size: 132px; font-weight: 700; letter-spacing: -.045em; line-height: 1;
        color: #eef2f7; white-space: nowrap }
/* Η μόνη πινελιά χρώματος έξω από το σήμα. Κοντή, κάτω από το όνομα, στο
   πλάτος που της αναλογεί — όχι κατακόρυφη ράγα δίπλα σε στρογγυλή κάρτα. */
.rule { width: 104px; height: 5px; border-radius: 3px; background: #8ab4f8; margin: 40px 0 34px }
.tag { font-size: 46px; font-weight: 400; letter-spacing: -.015em; color: #a7b2c2 }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 30px }
.chip { display: inline-flex; align-items: center; height: 74px; padding: 0 34px;
        border-radius: 999px; border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.035); font-size: 30px; color: #a7b2c2; letter-spacing: -.01em }
.host { font-size: 27px; color: #7c899b; letter-spacing: .01em }
</style>
<div class="wrap">
  <div class="lockup">
    <svg class="mark" viewBox="0 0 48 48" aria-hidden><rect width="48" height="48" rx="11" fill="#1a73e8"/><path d="${MARK}" fill="#fff"/></svg>
    <span class="word">Property OS</span>
  </div>
  <div>
    <div class="name">${plan.name}</div>
    <div class="rule"></div>
    <div class="tag">${plan.tagline}</div>
  </div>
  <div class="foot">
    <span class="chip">${capacity(plan)}</span>
    <span class="host">Ο βοηθός περιλαμβάνεται σε κάθε πακέτο</span>
  </div>
</div>`

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
await mkdir(OUT, { recursive: true })
const page = await b.newPage({ viewport: { width: 1600, height: 1200 } })
for (const id of PLAN_ORDER) {
  if (id === 'free') continue          // δεν πουλιέται, δεν χρειάζεται εικόνα
  const plan = PLANS[id]
  await page.setContent(html(plan), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const file = `${OUT}/property-os-${id}.png`
  await page.screenshot({ path: file })
  console.log(`✓ ${plan.name.padEnd(16)} → ${file}`)
}
await b.close()
