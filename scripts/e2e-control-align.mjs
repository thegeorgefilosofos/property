#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΧΕΙΡΙΣΤΗΡΙΑ ΠΟΥ ΚΑΘΟΝΤΑΙ ΣΕ ΣΕΙΡΑ ΕΧΟΥΝ ΤΟ ΙΔΙΟ ΥΨΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Καμία μέτρηση δεν ρωτούσε αν δύο χειριστήρια δίπλα δίπλα
// είναι ίδιου ύψους. Δεν κόβεται τίποτα, δεν ξεφεύγει τίποτα, περνούν όλοι οι
// φύλακες — και η γραμμή φαίνεται πρόχειρη. Είναι το είδος του σφάλματος που ο
// χρήστης δεν ονομάζει: λέει «δεν είναι επαγγελματικά».
//
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΠΡΙΝ. Εξι γραμμές εργαλείων, καθεμία με δύο ώς τέσσερα ύψη:
//
//     Δαπάνες        ομάδα καρτελών 44  ·  κουμπί 36
//     Εκκρεμότητες   πεδίο 38 · φίλτρο 35 · φίλτρο 35 · ομάδα 34
//     Απογραφή       τρεις επιλογείς 40  ·  κουμπί 36
//     Ημερολόγιο     ομάδα 38 · πεδίο 36 · κουμπί 36 · «Σήμερα» 32
//     Αρχείο         πεδίο 36  ·  ομάδα όψης 38
//     Ταυτότητα      κουμπί 36  ·  δείγμα χρώματος 44 δίπλα σε πεδίο 40
//
// Η αιτία ήταν πάντα η ίδια: το ύψος έβγαινε από κατακόρυφο `padding` αντί να
// δηλώνεται. Με padding, κάθε αλλαγή μεγέθους γραμμάτων μετακινεί σιωπηλά το
// κουτί και κανείς δεν το ξαναμετρά.
//
// ΤΙ ΕΛΕΓΧΕΙ. Για κάθε δοχείο flex ή grid που κρατά δύο ή περισσότερα ορατά
// χειριστήρια στην ΙΔΙΑ γραμμή, οι κορυφές τους πρέπει να συμπίπτουν. Το
// κριτήριο είναι η κορυφή και όχι το ύψος επίτηδες: δύο κουτιά διαφορετικού
// ύψους που ξεκινούν μαζί (π.χ. ένα πεδίο δίπλα σε περιοχή κειμένου) είναι
// αποδεκτά· δύο που ξεκινούν σε διαφορετικό σημείο δεν είναι.
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-control-align.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { SCENES } from './lib/scenes.mjs'
import { benchUrl } from './lib/paths.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')


// Ενα εικονοστοιχείο δεν είναι αστοχία σχεδίασης, είναι στρογγυλοποίηση του
// περιηγητή σε κλίμακα οθόνης. Από τα δύο και πάνω, κάποιος έγραψε άλλο ύψος.
const TOLERANCE = 1

const probe = () => {
  const isControl = e => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect()
    // Ορατό κουτί χειριστηρίου: έχει περίγραμμα, ύψος στην κλίμακα και πλάτος
    // που δεν είναι εικονίδιο. Ο αόρατος στόχος αφής (44 γύρω από ελατήριο 20)
    // δεν μετράει, γιατί δεν τον βλέπει κανείς.
    return parseFloat(cs.borderTopWidth) > 0 && r.height >= 30 && r.height <= 48 && r.width > 70
  }
  const found = []
  for (const box of document.querySelectorAll('div')) {
    const cs = getComputedStyle(box)
    if (cs.display !== 'grid' && cs.display !== 'flex') continue
    if (cs.flexDirection === 'column') continue
    const kids = [...box.children]
      .map(k => (isControl(k) ? k : [...k.querySelectorAll('*')].find(isControl)))
      .filter(Boolean)
    if (kids.length < 2) continue
    const rects = kids.map(k => k.getBoundingClientRect())
    // ΙΔΙΑ ΓΡΑΜΜΗ ΣΗΜΑΙΝΕΙ ΟΤΙ ΕΠΙΚΑΛΥΠΤΟΝΤΑΙ ΚΑΤΑΚΟΡΥΦΑ, ΟΧΙ ΟΤΙ ΕΙΝΑΙ ΚΟΝΤΑ.
    // Με κριτήριο «οι κορυφές απέχουν λιγότερο από τριάντα», δύο σειρές που
    // τυλίχτηκαν σε flex-wrap μετριούνταν ως μία και έβγαζαν ψεύτικο εύρημα:
    // μετρημένο στο Αρχείο, δύο ετικέτες 31 σε αποστάσεις 22 εικονοστοιχείων.
    const mid = r => (r.top + r.bottom) / 2
    const c0 = mid(rects[0])
    if (!rects.every(r => Math.abs(mid(r) - c0) < Math.min(r.height, rects[0].height) / 2)) continue
    const tops = rects.map(r => Math.round(r.top))
    if (Math.max(...tops) - Math.min(...tops) <= 1) continue
    found.push({
      πού: (box.className || 'χωρίς κλάση').toString().slice(0, 40),
      κείμενο: (box.innerText || '').split('\n')[0].slice(0, 30),
      ύψη: [...new Set(rects.map(r => Math.round(r.height)))],
      κορυφές: [...new Set(tops)],
    })
  }
  return found
}

// Τρία πλάτη: φορητός, ταμπλέτα όρθια, τηλέφωνο. Η αστοίχιστη σειρά εμφανίζεται
// συχνά ΜΟΝΟ σε ένα από τα τρία, γιατί το `flex-wrap` αλλάζει ποιος κάθεται
// δίπλα σε ποιον.
const WIDTHS = [1280, 768, 430]

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
const findings = []
for (const width of WIDTHS) {
  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.goto(benchUrl(scene), { waitUntil: 'networkidle', timeout: 25000 })
      await page.waitForTimeout(400)
      for (const f of await page.evaluate(probe)) findings.push({ scene: `${scene}@${width}`, ...f })
    } catch (err) {
      findings.push({ scene: `${scene}@${width}`, πού: 'δεν φόρτωσε', κείμενο: String(err).slice(0, 60), ύψη: [], κορυφές: [] })
    }
    await page.close()
  }
}
await browser.close()

if (findings.length) {
  console.error(`✗ ${findings.length} σειρές με χειριστήρια σε διαφορετικό ύψος:\n`)
  for (const f of findings)
    console.error(`  ${f.scene.padEnd(12)} ${f.πού.padEnd(26)} ύψη ${f.ύψη.join('/')} κορυφές ${f.κορυφές.join('/')}  «${f.κείμενο}»`)
  console.error(`\n  Το ύψος δηλώνεται (T.h.sm/md/lg), δεν βγαίνει από κατακόρυφο padding.`)
  console.error(`  Οσα κάθονται σε σειρά με πεδίο παίρνουν το ύψος του πεδίου (T.h.lg).`)
  process.exit(1)
}
console.log(`✓ κάθε σειρά χειριστηρίων στοιχίζεται, σε ${SCENES.length} σκηνές × ${WIDTHS.length} πλάτη (ανοχή ${TOLERANCE}px)`)
