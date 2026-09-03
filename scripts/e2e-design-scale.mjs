#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΣΕΣ ΔΙΑΦΟΡΕΤΙΚΕΣ ΑΠΟΦΑΣΕΙΣ ΒΛΕΠΕΙ ΤΟ ΜΑΤΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΑΠΟΘΕΤΗΡΙΟ ΜΕΤΡΑΕΙ ΤΑ ΠΑΝΤΑ ΕΚΤΟΣ ΑΠΟ ΤΟ ΠΙΟ ΟΡΑΤΟ. Υπάρχει σαρωτής για
// κομμένο κείμενο, για επικαλύψεις, για στόχους αφής, για ύψη πλακιδίων, για
// στήλες αριθμών. Κανένας δεν ρωτούσε το απλούστερο που ξεχωρίζει ένα προϊόν
// από μια συλλογή οθονών: ΠΟΣΑ διαφορετικά μεγέθη γραμμάτων υπάρχουν;
//
// Η ΠΡΩΤΗ ΜΕΤΡΗΣΗ, 03/09/2026, σε 38 σκηνές: 18 μεγέθη γραμματοσειράς σε
// υπολογιστή, 38 διαφορετικά κενά, 19 ακτίνες γωνιών, 6 βάρη. Ανάμεσά τους
// 11,5px · 12,5px · 13,5px · 14,5px · 13,3333px · 19px και βάρη 650 και 800.
// Κανείς δεν ΣΧΕΔΙΑΖΕΙ στα 13,3333: αυτά είναι ατυχήματα, όχι αποφάσεις.
//
// ΓΙΑΤΙ ΕΧΕΙ ΣΗΜΑΣΙΑ. Ενα σύστημα με έξι μεγέθη διαβάζεται ως σύστημα· με
// δεκαοκτώ διαβάζεται ως δεκαοκτώ ξεχωριστές στιγμές. Ο χρήστης δεν μετρά
// μεγέθη — αλλά βλέπει τη διαφορά ανάμεσα σε «φτιαγμένο» και «μαζεμένο».
//
// ΚΑΣΤΑΝΙΑ, ΟΧΙ ΟΡΙΟ. Δεν λέει «πρέπει έξι»: λέει «όχι περισσότερα από όσα
// έχεις σήμερα». Η κλίμακα μαζεύεται όποτε κάποιος την πιάσει· εδώ απλώς
// σταματά να μεγαλώνει στα κρυφά.
//
// ΤΙ ΑΓΝΟΕΙΤΑΙ ΕΠΙΤΗΔΕΣ: οι ρευστές τιμές από `clamp()`. Στα 390 μετρήθηκαν
// 29 μεγέθη αντί για 18, επειδή οι επικεφαλίδες υπολογίζονται από το πλάτος
// και δίνουν 17,4109px ή 23,94px. Αυτά ΕΙΝΑΙ το σύστημα, δεν είναι απόκλιση:
// κρατιούνται μόνο οι ακέραιες και οι μισές τιμές, που είναι οι γραμμένες με
// το χέρι.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { chromePath } from './lib/chrome.mjs'
import { SCENES } from './lib/scenes.mjs'
import { sweep } from './lib/sweep.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const PROBE = () => {
  const out = { size: [], weight: [], gap: [], radius: [] }
  for (const el of document.querySelectorAll('.app-content *')) {
    if (!el.checkVisibility?.()) continue
    const cs = getComputedStyle(el)
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
      out.size.push(cs.fontSize)
      out.weight.push(cs.fontWeight)
    }
    if (/flex|grid/.test(cs.display) && cs.gap && cs.gap !== 'normal') out.gap.push(cs.gap)
    if (cs.borderRadius && cs.borderRadius !== '0px') out.radius.push(cs.borderRadius)
  }
  return out
}

// Μια ρευστή τιμή από `clamp()` βγαίνει με ουρά δεκαδικών (17.4109px). Οι
// γραμμένες με το χέρι είναι ακέραιες ή μισές. Κρατιούνται μόνο αυτές.
const handWritten = (v) => /^-?\d+(\.5)?px$/.test(v.trim())
const onlyHand = (v) => v.split(' ').every(handWritten)

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] })
const swept = await sweep(browser, {
  widths: [1280], height: 900, scenes: SCENES, passes: 2,
  visit: (page) => page.evaluate(PROBE),
})
await browser.close()

const seen = { size: new Set(), weight: new Set(), gap: new Set(), radius: new Set() }
for (const { value } of swept) {
  for (const v of value.size) if (handWritten(v)) seen.size.add(v)
  for (const v of value.weight) seen.weight.add(v)
  for (const v of value.gap) if (onlyHand(v)) seen.gap.add(v)
  for (const v of value.radius) if (onlyHand(v) || v.includes('%')) seen.radius.add(v)
}

const BASE = JSON.parse(readFileSync(new URL('./design-scale-baseline.json', import.meta.url), 'utf8'))
const now = { size: seen.size.size, weight: seen.weight.size, gap: seen.gap.size, radius: seen.radius.size }
const LABEL = { size: 'μεγέθη γραμματοσειράς', weight: 'βάρη', gap: 'κενά', radius: 'ακτίνες γωνιών' }

const over = Object.keys(now).filter(k => now[k] > BASE[k])
const sorted = (s) => [...s].sort((a, b) => parseFloat(a) - parseFloat(b)).join(' · ')

console.log(`Κλίμακα σχεδιασμού, σε ${swept.length} σκηνές:`)
for (const k of Object.keys(now)) {
  console.log(`  ${String(now[k]).padStart(3)}/${String(BASE[k]).padEnd(3)} ${LABEL[k].padEnd(24)} ${sorted(seen[k])}`)
}

if (over.length) {
  console.error(`\n✗ ${over.map(k => `${LABEL[k]}: ${now[k]} > ${BASE[k]}`).join(' · ')}`)
  console.error(`
  Μπήκε νέα τιμή στην κλίμακα. Αν είναι απόφαση, γράψε τον λόγο στο
  scripts/design-scale-baseline.json και ανέβασε τον αριθμό. Αν είναι
  ατύχημα —13,5px δίπλα σε 13 και 14— χρησιμοποίησε την υπάρχουσα τιμή.`)
  process.exit(1)
}

const under = Object.keys(now).filter(k => now[k] < BASE[k])
if (under.length) console.log(`\n   ↓ ${under.map(k => `${LABEL[k]} ${BASE[k]}→${now[k]}`).join(' · ')}. Κατέβασε το όριο στο scripts/design-scale-baseline.json.`)
console.log(`\n✅ Η κλίμακα δεν μεγάλωσε.`)
