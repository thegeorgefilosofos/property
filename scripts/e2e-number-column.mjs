#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΣΤΗΛΗ ΑΡΙΘΜΩΝ ΕΧΕΙ ΕΝΑ ΔΕΞΙ ΑΚΡΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΟΠΩΣ ΤΟ ΦΩΤΟΓΡΑΦΙΣΕ Ο ΧΡΗΣΤΗΣ. Στον προϋπολογισμό ανά κατηγορία,
// εννιά γραμμές με ποσό η καθεμία — και κανένα ποσό δεν ήταν στην ίδια στήλη με
// το από πάνω του. Η αιτία δεν είναι το ποσό: είναι ό,τι έρχεται ΜΕΤΑ από αυτό
// και υπάρχει μόνο σε μερικές γραμμές. Ποσοστό χρήσης όταν ξεπερνά το όριο
// προσοχής, σήμα υπέρβασης όταν υπάρχει υπέρβαση, βελάκι ανάπτυξης όταν η
// κατηγορία έχει αναλυτικές κινήσεις. Τρία προαιρετικά, άρα τέσσερα διαφορετικά
// δεξιά άκρα στην ίδια λίστα.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΠΙΑΝΕΙ ΚΑΜΙΑ ΑΛΛΗ ΣΑΡΩΣΗ. Η στοίχιση χειριστηρίων ρωτά αν δύο
// κουτιά ΔΙΠΛΑ ΔΙΠΛΑ ξεκινούν στο ίδιο ύψος. Οι ετικέτες ρωτούν αν πιάνουν τις
// ίδιες γραμμές. Καμία δεν ρωτά το κατακόρυφο: αν δέκα ποσά, το ένα κάτω από το
// άλλο, τελειώνουν στο ίδιο σημείο. Τίποτα δεν κόβεται, τίποτα δεν ξεφεύγει,
// τίποτα δεν πέφτει πάνω σε τίποτα — και η λίστα διαβάζεται πρόχειρη.
//
// ΤΙ ΕΛΕΓΧΕΙ. Για κάθε δοχείο με τρία ή περισσότερα αδέλφια στοιβαγμένα
// κατακόρυφα, βρίσκει σε καθένα το ΤΕΛΕΥΤΑΙΟ κείμενο που μοιάζει με ποσό ή
// ποσοστό και συγκρίνει τα δεξιά τους άκρα. Πάνω από τέσσερα εικονοστοιχεία
// διαφορά, η στήλη δεν είναι στήλη.
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-number-column.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { benchUrl } from './lib/paths.mjs'
import { scenesToRun } from './lib/scenes.mjs'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const WIDTHS = [390, 1280]

const PROBE = () => {
  const out = []
  // Ποσό ή ποσοστό: ο,τι διαβάζει το μάτι ως αριθμό σε στήλη.
  const NUM = /^[+\-−]?\s?[\d.]{1,15}(,\d+)?\s?(€|%)$/
  // ΤΟ «ΤΕΛΕΥΤΑΙΟ ΝΟΥΜΕΡΟ ΤΗΣ ΓΡΑΜΜΗΣ» ΔΕΝ ΕΙΝΑΙ ΚΕΛΙ ΣΤΗΛΗΣ, ΚΑΙ ΤΟ ΕΜΑΘΑ ΑΠΟ
  // ΨΕΥΔΗ ΕΥΡΗΜΑΤΑ. Στα Εγγραφα κάθε γραμμή είναι ΟΜΑΔΑ μηνός με φωλιασμένα
  // αρχεία, το καθένα με δικό του ποσό: το τελευταίο νούμερο έβγαινε στα 99, στα
  // 635 και στα 720 μέσα σε γραμμή 1.240 — τρία ποσά που δεν ανήκουν σε καμία
  // στήλη και δεν όφειλαν ποτέ να στοιχιστούν. Τέσσερα ψευδή ευρήματα σε μία
  // οθόνη· ένας ανιχνευτής με ψευδή ευρήματα μαθαίνει τον κόσμο να τον προσπερνά.
  //
  // ΣΤΗΛΗ ΕΙΝΑΙ Ο,ΤΙ ΚΑΘΕΤΑΙ ΣΤΟ ΔΕΞΙ ΤΡΙΤΟ ΤΗΣ ΓΡΑΜΜΗΣ. Εκεί ζει το ποσό που
  // διαβάζεται ως στήλη· ό,τι είναι στη μέση είναι κείμενο με νούμερο μέσα.
  const numberIn = (el, rowRight, rowWidth) => {
    const edge = rowRight - rowWidth / 3
    let last = null
    for (const n of el.querySelectorAll('*')) {
      if (n.children.length) continue
      const t = (n.textContent || '').trim()
      if (!t || !NUM.test(t)) continue
      if (!n.checkVisibility?.()) continue
      if (n.getBoundingClientRect().right < edge) continue
      last = n
    }
    return last
  }
  for (const g of document.querySelectorAll('body *')) {
    const kids = [...g.children].filter(c => {
      const r = c.getBoundingClientRect()
      return r.height > 8 && r.width > 40 && c.checkVisibility?.()
    })
    if (kids.length < 3) continue
    // ΜΟΝΟ ΚΑΤΑΚΟΡΥΦΗ ΣΤΟΙΒΑ. Μια σειρά πλακιδίων δίπλα δίπλα έχει κι αυτή
    // «τελευταίο ποσό» ανά παιδί, αλλά τα ποσά της ΔΕΝ ανήκουν σε στήλη.
    const tops = kids.map(c => Math.round(c.getBoundingClientRect().top))
    if (new Set(tops).size < kids.length) continue
    // Ολα τα παιδιά πρέπει να έχουν το ΙΔΙΟ δεξί άκρο κουτιού: αλλιώς δεν είναι
    // λίστα ίσου πλάτους και η στοίχιση των αριθμών δεν ορίζεται.
    const rights = kids.map(c => Math.round(c.getBoundingClientRect().right))
    if (Math.max(...rights) - Math.min(...rights) > 2) continue
    const rowRight = rights[0]
    const rowWidth = kids[0].getBoundingClientRect().width
    const nums = kids.map(c => numberIn(c, rowRight, rowWidth))
    // Αν έστω μία γραμμή δεν έχει νούμερο στο δεξί τρίτο, η λίστα ΔΕΝ είναι
    // στήλη αριθμών και δεν κρίνεται ως τέτοια.
    if (nums.some(n => !n)) continue
    const edges = nums.map(n => Math.round(n.getBoundingClientRect().right))
    const spread = Math.max(...edges) - Math.min(...edges)
    if (spread <= 4) continue
    const sample = nums.map((n, i) => `${(n.textContent || '').trim()}@${edges[i]}`).slice(0, 4).join(' · ')
    out.push(`${kids.length} γραμμές, δεξιά άκρα σε εύρος ${spread}px — ${sample}`)
  }
  return out
}

const BASE = JSON.parse(readFileSync(new URL('./number-column-baseline.json', import.meta.url), 'utf8'))
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
const findings = []
for (const width of WIDTHS) for (const scene of scenesToRun()) {
  const page = await browser.newPage({ viewport: { width, height: 1200 } })
  try {
    await page.goto(benchUrl(scene), { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(350)
    // ΤΑ ΔΙΠΛΩΜΕΝΑ ΠΑΝΕΛ ΕΙΝΑΙ ΤΟ ΜΙΣΟ ΠΡΟΪΟΝ, ΚΑΙ ΕΚΕΙ ΗΤΑΝ ΤΟ ΣΦΑΛΜΑ. Ο
    // προϋπολογισμός ανά κατηγορία —η λίστα που φωτογράφισε ο χρήστης— ζει πίσω
    // από πτυσσόμενη ενότητα: χωρίς άνοιγμα, η σάρωση έβγαινε καθαρή για οθόνη
    // που δεν είχε δει. Δύο περάσματα, γιατί ενότητα μπορεί να κρύβει ενότητα.
    for (let pass = 0; pass < 2; pass++) {
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('[aria-expanded="false"]')) (b instanceof HTMLElement) && b.click()
      })
      await page.waitForTimeout(400)
    }
    for (const f of await page.evaluate(PROBE)) findings.push(`${scene}@${width}  ${f}`)
  } catch { /* η σκηνή που δεν φορτώνει το λέει η σάρωση διάταξης */ }
  await page.close()
}
await browser.close()

if (findings.length > BASE.max) {
  console.error(`\n✗ ${findings.length} στήλες αριθμών χωρίς κοινό δεξί άκρο (όριο ${BASE.max}):\n`)
  for (const f of findings) console.error('  ' + f)
  console.error(`
  Ο,τι έρχεται ΜΕΤΑ από τον αριθμό και υπάρχει μόνο σε μερικές γραμμές, τον
  σπρώχνει. Κράτησε τη θέση του και όταν λείπει, ή βάλε τον αριθμό σε δική του
  στήλη πλέγματος.`)
  process.exit(1)
}
if (findings.length < BASE.max) {
  console.log(`✓ ${findings.length} στήλες αριθμών εκτός στοίχισης (όριο ${BASE.max}) — κατέβασε το όριο στο scripts/number-column-baseline.json`)
  for (const f of findings) console.log('  ' + f)
} else {
  console.log(`✓ ${findings.length} στήλες αριθμών εκτός στοίχισης, στο όριο — καμία νέα`)
}
