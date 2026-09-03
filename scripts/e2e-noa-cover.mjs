#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΣΚΕΠΑΖΕΙ ΤΟ ΠΛΩΤΟ ΚΟΥΜΠΙ ΤΗΣ ΝΟΑΣ
// ─────────────────────────────────────────────────────────────────────────
// Ο χρήστης το είδε σε δύο στιγμιότυπα: το κουμπί καθόταν πάνω σε τιμές. Το
// `.app-content` κρατά κάτω περιθώριο για το κουμπί, οπότε στο ΤΕΛΟΣ της κύλισης
// δεν σκεπάζει τίποτα — αλλά «στο τέλος της κύλισης» δεν είναι όλη η οθόνη και
// κανένας πάγκος δεν απέδιδε τη Νόα πάνω σε πραγματική σκηνή.
//
// ΤΙ ΜΕΤΡΑ. Για κάθε σκηνή, σε τρία πλάτη, στην κορυφή ΚΑΙ στο τέλος της
// κύλισης: το ορθογώνιο του κουμπιού και κάθε ορατό φύλλο κειμένου. Οπου
// τέμνονται πάνω από λίγα εικονοστοιχεία, το κείμενο είναι κρυμμένο. Στο τέλος
// της κύλισης ΔΕΝ επιτρέπεται καμία τομή: εκεί υπάρχει το περιθώριο ακριβώς γι'
// αυτό. Στην κορυφή αναφέρεται ό,τι σκεπάζεται, γιατί είναι το πρώτο κάδρο.
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-noa-cover.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { sweep } from './lib/sweep.mjs'
import { scenesToRun } from './lib/scenes.mjs'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const WIDTHS = [360, 820, 1280]

const PROBE = (where) => {
  const fab = document.querySelector('.pa-fab')
  // Ο ΒΟΗΘΟΣ ΑΠΟΣΥΡΕΤΑΙ ΜΠΡΟΣΤΑ ΣΕ ΠΑΡΑΘΥΡΟ, ΕΠΙΤΗΔΕΣ. Οσο υπάρχει ανοιχτό
  // `aria-modal`, το κουμπί δεν αποδίδεται (PropertyAssistant, overlayOpen):
  // αλλιώς θα καθόταν πάνω στο «Αποθήκευση» κάθε φόρμας. Οι σκηνές παραθύρου
  // (modal, select, wizard, scan) δεν είναι αποτυχία του πάγκου· είναι η
  // συμπεριφορά που ελέγχεται αλλού.
  if (!fab && document.querySelector('[aria-modal="true"]')) return { withdrawn: true }
  if (!fab) return { missing: true }
  const f = fab.getBoundingClientRect()
  const out = []
  for (const el of document.querySelectorAll('.app-content *')) {
    if (el.children.length || el.closest('.pa-fab, .pa-fab-wrap, .pa-panel')) continue
    const t = (el.textContent || '').trim(); if (!t) continue
    if (!el.checkVisibility?.()) continue
    const r = el.getBoundingClientRect()
    const w = Math.min(r.right, f.right) - Math.max(r.left, f.left)
    const h = Math.min(r.bottom, f.bottom) - Math.max(r.top, f.top)
    // Τρία εικονοστοιχεία είναι στρογγυλοποίηση· δέκα είναι γράμματα.
    if (w > 3 && h > 3) out.push(`${where}: «${t.slice(0, 26)}» ${Math.round(w)}×${Math.round(h)}`)
  }
  return { hits: out }
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
// ΔΥΟ ΜΕΤΡΗΣΕΙΣ ΑΝΑ ΣΚΗΝΗ: στην κορυφή και στο τέλος της κύλισης. Ο βρόχος
// πλάτους × σκηνής, με τις παράλληλες θέσεις του, ζει στο scripts/lib/sweep.mjs.
const swept = await sweep(browser, {
  widths: WIDTHS, height: (w) => (w < 700 ? 800 : 1000), scenes: scenesToRun(),
  suffix: '&noa=1', settle: 400,
  visit: async (page) => {
    // ═══ ΠΕΡΙΜΕΝΕ ΤΟ ΚΟΥΜΠΙ, ΟΧΙ ΤΟΝ ΧΡΟΝΟ ══════════════════════════════════
    // Με σταθερή αναμονή 400ms ο έλεγχος περνούσε τοπικά και έπεφτε στο CI:
    // «σε 2 σκηνές δεν αποδόθηκε το κουμπί». Οι σκηνές ήταν μια χαρά — ο
    // δρομέας απλώς είναι πιο αργός και τρέχει τέσσερις σελίδες μαζί, οπότε
    // 400ms άλλοτε φτάνουν κι άλλοτε όχι. Αναμονή σε χιλιοστά είναι στοίχημα
    // στην ταχύτητα του μηχανήματος· αναμονή στο ΣΤΟΙΧΕΙΟ είναι ερώτηση με
    // απάντηση. Το «δεν αποδόθηκε» παραμένει σφάλμα — αλλά τώρα σημαίνει
    // πραγματικά «δεν ήρθε ποτέ» και όχι «δεν πρόλαβε».
    //
    // Η σκηνή με ανοιχτό παράθυρο ΔΕΝ έχει κουμπί επίτηδες (αποσύρεται), οπότε
    // η αναμονή δεν επιτρέπεται να σκάσει εκεί: το `catch` την προσπερνά και
    // ο ανιχνευτής από κάτω ξεχωρίζει «αποσύρθηκε» από «λείπει».
    await page.waitForSelector('.pa-fab', { timeout: 5000 }).catch(() => {})
    const top = await page.evaluate(PROBE, 'κορυφή')
    // ΟΤΑΝ ΤΟ ΚΟΥΜΠΙ ΑΠΟΣΥΡΘΗΚΕ Ή ΔΕΝ ΑΠΟΔΟΘΗΚΕ, ΔΕΝ ΜΕΤΡΑΕΙ ΤΙΠΟΤΑ. Ο ανιχνευτής
    // γυρίζει και τότε ό,τι πρόλαβε να δει· αν αυτά τα σημεία μπουν στο άθροισμα,
    // χρεώνονται στη Νόα τομές σε σκηνές όπου η Νόα δεν είναι καν εκεί.
    if (top.withdrawn) return { withdrawn: true }
    if (top.missing) return { missing: true }
    await page.evaluate(() => { const c = document.querySelector('.app-content'); if (c) c.scrollTop = c.scrollHeight })
    await page.waitForTimeout(150)
    const end = await page.evaluate(PROBE, 'τέλος')
    return { hits: [...(top.hits || []), ...(end.hits || [])] }
  },
  onError: (e) => ({ broke: String(e.message).slice(0, 60) }),
})
await browser.close()

const scenes = swept.length
const withdrawn = swept.filter(r => r.value.withdrawn).length
const missing = swept.filter(r => r.value.missing).length
const findings = swept.flatMap(({ scene, width, value }) =>
  value.broke ? [`${scene}@${width}  δεν φόρτωσε: ${value.broke}`]
              : (value.hits || []).map(h => `${scene}@${width}  ${h}`))

if (missing) { console.error(`✗ σε ${missing} σκηνές δεν αποδόθηκε το κουμπί της Νόας: ο πάγκος δεν τη φόρτωσε`); process.exit(1) }
// ΔΥΟ ΚΑΝΟΝΕΣ, ΓΙΑΤΙ ΕΙΝΑΙ ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ ΠΡΑΓΜΑΤΑ. Στο τέλος της κύλισης
// υπάρχει περιθώριο ακριβώς για το κουμπί: εκεί η τομή είναι σφάλμα και
// μπλοκάρει. Στο πρώτο κάδρο ένα πλωτό κουμπί σε γωνία κάθεται εξ ορισμού
// πάνω σε ό,τι φτάνει στη γωνία· εκεί μετριέται και ΔΕΝ επιτρέπεται να
// χειροτερέψει (καστάνια, scripts/noa-cover-baseline.json). Πρώτη μέτρηση 83366 px²
// σε 64 σημεία με την πρόσκληση ανοιχτή παντού· η αποστολή είναι να κατεβαίνει.
const BASE = JSON.parse(readFileSync(new URL('./noa-cover-baseline.json', import.meta.url), 'utf8'))
const atEnd = findings.filter(f => f.includes('τέλος:'))
const atTop = findings.filter(f => f.includes('κορυφή:'))
const broken = findings.filter(f => f.includes('δεν φόρτωσε'))
// ΕΜΒΑΔΟΝ, ΟΧΙ ΠΛΗΘΟΣ. Οταν η πρόσκληση μαζεύτηκε στο σήμα, τα σημεία έμειναν
// 64 → 62 ενώ το κρυμμένο κείμενο έπεσε κατά τρία τέταρτα: ένα κουμπί σε γωνία
// ακουμπά ΚΑΤΙ σχεδόν πάντα, αλλά το αν κρύβει λέξη ή ξύνει ένα γράμμα το λέει
// το εμβαδόν. Ο χρήστης βλέπει εικονοστοιχεία, όχι σημεία.
const topArea = atTop.reduce((n, f) => { const m = f.match(/(\d+)×(\d+)$/); return n + (m ? Number(m[1]) * Number(m[2]) : 0) }, 0)
if (atEnd.length || broken.length || topArea > BASE.maxTopArea) {
  console.error(`\n✗ Το κουμπί της Νόας: ${atEnd.length} τομές στο τέλος της κύλισης (όριο 0), ${topArea} px² κρυμμένα στο πρώτο κάδρο σε ${atTop.length} σημεία (όριο ${BASE.maxTopArea} px²), ${broken.length} σκηνές δεν φόρτωσαν:\n`)
  for (const f of findings) console.error('  ' + f)
  console.error(`
  Στο τέλος της κύλισης δεν επιτρέπεται τομή: το .app-content κρατά περιθώριο
  ακριβώς γι' αυτό (--fab-h + --fab-gap). Στο πρώτο κάδρο ο αριθμός μόνο
  κατεβαίνει: αν ανέβηκε, κάτι μεγάλωσε το κουμπί ή έφερε κείμενο στη γωνία.`)
  process.exit(1)
}
if (topArea < BASE.maxTopArea) console.log(`   ↓ Πρώτο κάδρο: ${topArea} px² < όριο ${BASE.maxTopArea}. Κατέβασε το "maxTopArea" στο scripts/noa-cover-baseline.json.`)
console.log(`✅ Το κουμπί της Νόας δεν σκεπάζει κείμενο σε ${scenes - withdrawn} σκηνές × κορυφή και τέλος (${withdrawn} με ανοιχτό παράθυρο, όπου αποσύρεται επίτηδες).`)
