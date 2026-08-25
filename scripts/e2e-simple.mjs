#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΠΛΟΤΗΤΑ ΜΕΤΡΙΕΤΑΙ, ΔΕΝ ΔΗΛΩΝΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// Η βαθμολογία της απλότητας ήταν τρία χρόνια ένας αριθμός γραμμένος με το
// μάτι. Ο,τι δεν μετριέται δεν πέφτει ποτέ, γιατί κανείς δεν ξέρει πότε
// έπεσε — και ο επόμενος που θα προσθέσει πεδίο δεν θα βρει τίποτα κόκκινο.
//
// Εδώ ανοίγει ο ΑΛΗΘΙΝΟΣ οδηγός ακινήτου σε πραγματικό Chromium και μετρώνται
// τα ΟΡΑΤΑ χειριστήρια: όχι όσα υπάρχουν στο DOM, όσα βλέπει ο άνθρωπος πριν
// πατήσει «Περισσότερα». Το όριο είναι καστάνια: μόνο προς τα κάτω.
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { chromium } from 'playwright-core'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
execSync('node scripts/e2e-simple/build.mjs', { cwd: root, stdio: 'inherit' })

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ` (${detail})` : ''}`) }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` (${detail})` : ''}`) }
}

// ΤΟ ΤΑΒΑΝΙ ΑΝΑ ΒΗΜΑ ΚΑΙ ΑΝΑ ΠΕΡΙΠΤΩΣΗ, ΜΕΤΡΗΜΕΝΟ ΣΗΜΕΡΑ.
// Πριν το μητρώο πεδίων: 26 στα «Βασικά», 18 στα «Οικονομικά», 26 στις
// «Ρυθμίσεις». Οποιος τα ανεβάσει θα βρει κόκκινο πριν φτάσει στον χρήστη.
// ΚΟΛΛΗΜΕΝΟ ΣΤΟ ΜΕΤΡΗΜΕΝΟ, ΧΩΡΙΣ ΤΖΟΓΟ. Ενα όριο με περιθώριο δύο πεδίων
// αφήνει δύο πεδία να μπουν χωρίς να το πάρει κανείς είδηση — και η επόμενη
// φορά ξεκινά από εκεί. Τρεις καστάνιες αυτού του αποθετηρίου είχαν ακριβώς
// αυτό το πρόβλημα και δεν θα έπιαναν την επόμενη οπισθοδρόμηση.
const CAP = {
  vacant: { 1: 4, 2: 2, 3: 0 },
  long:   { 1: 5, 2: 2, 3: 0 },
  short:  { 1: 6, 2: 2, 3: 0 },
  own:    { 1: 4, 2: 1, 3: 0 },
  land:   { 1: 4, 2: 2, 3: 0 },
  // ΤΟ ΜΟΝΑΔΙΚΟ ΟΡΙΟ ΠΟΥ ΑΝΕΒΗΚΕ, ΚΑΙ Ο ΛΟΓΟΣ ΓΡΑΦΕΤΑΙ.
  // Στη συνιδιοκτησία τα ΟΝΟΜΑΤΑ των συνιδιοκτητών εμφανίζονταν επειδή το
  // ποσοστό είναι κάτω από 100 — και το ίδιο το ποσοστό καθόταν πίσω από το
  // «Περισσότερα». Ο χρήστης έβλεπε το αποτέλεσμα χωρίς την αιτία και δεν
  // είχε πού να τη διορθώσει. Το πεδίο έγινε βασικό ΜΟΝΟ σε ακίνητο που είναι
  // ήδη μοιρασμένο: 4 σε 5 κουτιά, σε μία από τις έξι περιπτώσεις.
  shared: { 1: 5, 2: 5, 3: 0 },
}
const LABEL = {
  vacant: 'κενό διαμέρισμα', long: 'μακροχρόνια', short: 'βραχυχρόνια',
  own: 'ιδιοχρησία', land: 'οικόπεδο', shared: 'συνιδιοκτησία',
}

const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
await page.goto('file://' + join(root, '.perf-bench/simple.html'))
await page.waitForSelector('[data-s-open]')

console.log('\nΤα κουτιά που βλέπει ο χρήστης στον οδηγό ακινήτου\n')

/** Τα ΟΡΑΤΑ χειριστήρια μέσα στο παράθυρο, χωρίς τα κρυμμένα σε «Περισσότερα». */
const visibleControls = () => page.evaluate(() => {
  const modal = document.querySelector('[role="dialog"]')
  if (!modal) return -1
  // ΚΑΙ ΤΑ ΣΥΝΘΕΤΑ ΜΕΤΡΑΝΕ. Το «Ενεργειακή κλάση» είναι CustomSelect με
  // role="combobox" και η «Ημερομηνία αγοράς» είναι κουμπί που ανοίγει
  // ημερολόγιο: ένα σκέτο «input, select» θα τα προσπερνούσε, δηλαδή η φόρμα
  // θα μετρούσε λιγότερα κουτιά από όσα βλέπει ο άνθρωπος.
  const sel = 'input, textarea, select, [role="combobox"], [role="switch"], button[aria-haspopup="dialog"]'
  return [...modal.querySelectorAll(sel)].filter(el => {
    if (el.type === 'hidden') return false
    // checkVisibility πιάνει και το display:none του γονέα και το
    // content-visibility, που ένα σκέτο offsetParent δεν το βλέπει.
    return el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })
  }).length
})

for (const [k, caps] of Object.entries(CAP)) {
  await page.click(`[data-s-open="${k}"]`)
  await page.waitForSelector('[role="dialog"]')
  for (const step of [1, 2, 3]) {
    // Το πρώτο βήμα είναι ο τύπος· προχωράμε ώς εκεί που μετράμε.
    await page.click('text=Συνέχεια')
    await page.waitForTimeout(60)
    const n = await visibleControls()
    ok(`${LABEL[k]}, βήμα ${step + 1}: ${n} χειριστήρια`, n >= 0 && n <= caps[step],
      `όριο ${caps[step]}`)
    // ΚΑΙ ΤΑ ΥΠΟΛΟΙΠΑ ΥΠΑΡΧΟΥΝ: το «Περισσότερα» δεν είναι διαγραφή και
    // ελέγχεται ΣΕ ΚΑΘΕ βήμα. Μετρημένο μία φορά στο τέλος, ο έλεγχος θα
    // έλεγε μόνο ότι το τελευταίο βήμα ανοίγει.
    // ΛΑΒΗ, ΟΧΙ ΕΙΚΑΣΙΑ. Το `[aria-expanded="false"]` το έχει και ο επιλογέας
    // της ενεργειακής κλάσης: όπου φαινόταν εκείνος, ο έλεγχος πατούσε αυτόν
    // και μετρούσε «5 → 5», δηλαδή κοκκίνιζε για τον λάθος λόγο.
    const more = await page.$('[role="dialog"] [data-more]')
    if (more) {
      await more.click()
      await page.waitForTimeout(60)
      const after = await visibleControls()
      ok(`${LABEL[k]}, βήμα ${step + 1}: το «Περισσότερα» φέρνει πίσω τα κρυμμένα`, after > n, `${n} → ${after}`)
      await more.click()
      await page.waitForTimeout(40)
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(80)
}

// ── ΚΑΝΕΝΑ ΚΟΥΤΙ ΧΩΡΙΣ ΟΝΟΜΑ ────────────────────────────────────────────
// Η συμπύκνωση της φόρμας μετακίνησε τα χειριστήρια μέσα σε λίστες και
// fragments και το <Field> ονόμαζε μόνο όταν το παιδί ήταν ΕΝΑ και σκέτο:
// τρία πεδία έμειναν σιωπηλά για τον αναγνώστη οθόνης. Το μετράμε αντί να το
// υποθέτουμε, σε κάθε βήμα και με ανοιχτά τα «Περισσότερα».
{
  const bad = []
  for (const k of Object.keys(CAP)) {
    await page.click(`[data-s-open="${k}"]`)
    await page.waitForSelector('[role="dialog"]')
    for (const step of [1, 2, 3]) {
      await page.click('text=Συνέχεια')
      await page.waitForTimeout(60)
      const more = await page.$('[role="dialog"] [data-more]')
      if (more) { await more.click(); await page.waitForTimeout(60) }
      bad.push(...await page.evaluate((label) => {
        const modal = document.querySelector('[role="dialog"]')
        const out = []
        for (const el of modal.querySelectorAll('input, textarea, [role="combobox"]')) {
          if (el.type === 'hidden') continue
          if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue
          const byId = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
          const named = !!byId || !!el.getAttribute('aria-label') || !!el.getAttribute('aria-labelledby') || !!el.closest('label')
          if (!named) out.push(label + ': ' + (el.tagName.toLowerCase() + (el.name ? `[${el.name}]` : '')) + ' « ' + (el.outerHTML || '').slice(0, 70) + ' »')
        }
        return out
      }, `${LABEL[k]} βήμα ${step + 1}`))
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
  }
  ok('κάθε ορατό χειριστήριο έχει προσβάσιμο όνομα', bad.length === 0, bad.slice(0, 4).join(' | '))
}

// ── Η ΒΡΑΧΥΧΡΟΝΙΑ ΔΕΝ ΜΑΝΤΕΥΕΙ ΠΛΗΡΟΤΗΤΑ ────────────────────────────────
// Εδώ ζούσε `const OCCUPANCY = 0.6`: ο οδηγός ζητούσε τιμή ανά διανυκτέρευση
// και αποθήκευε τιμή × 365 × 0,6 / 12 στο `target_rent`. Το εξήντα τοις εκατό
// δεν ήταν μέτρηση ούτε επιλογή του ιδιοκτήτη και το `target_rent` ταξιδεύει
// ώς τη Σύγκριση, τις Αποδόσεις, τη δανειακή ικανότητα και το Ε2. Για 70 € τη
// νύχτα δήλωνε 15.330 € τον χρόνο σε άνθρωπο που είχε εισπράξει 6.300 €.
//
// Ο έλεγχος γράφει έναν αριθμό στο ΑΛΗΘΙΝΟ κουτί και διαβάζει την προεπισκόπηση:
// τα ετήσια είναι το δωδεκαπλάσιο αυτού που γράφτηκε, ούτε ένα ευρώ παραπάνω.
{
  await page.click('[data-s-open="short"]')
  await page.waitForSelector('[role="dialog"]')
  await page.click('text=Συνέχεια'); await page.waitForTimeout(60)
  await page.click('text=Συνέχεια'); await page.waitForTimeout(60)
  const more = await page.$('[role="dialog"] [data-more]')
  if (more) { await more.click(); await page.waitForTimeout(60) }
  await page.getByLabel('Μέσο μηνιαίο έσοδο (€)').fill('1400')
  await page.getByLabel('Εμπορική αξία (€)').fill('200000')
  await page.waitForTimeout(120)
  // Το ευρώ γράφεται με αδιάσπαστο κενό (U+00A0). Χωρίς την ισοπέδωση, ο
  // ισχυρισμός θα κοκκίνιζε για τον χαρακτήρα του κενού και όχι για το ποσό.
  const txt = (await page.evaluate(() => document.querySelector('[role="dialog"]').innerText)).replace(/\u00a0/g, ' ')
  ok('βραχυχρόνια: τα ετήσια έσοδα είναι ακριβώς το δωδεκαπλάσιο του μηνιαίου',
    txt.includes('16.800,00 €'), '1.400 × 12')
  ok('βραχυχρόνια: η μεικτή απόδοση βγαίνει από τον ίδιο αριθμό',
    txt.includes('8,40%'), '16.800 / 200.000')
  ok('βραχυχρόνια: καμία πληρότητα δεν μαντεύεται', !/πληρότητ/i.test(txt))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(80)
}

// ── Η ΕΞΟΔΟΣ ΑΠΟ ΤΟ ΔΕΥΤΕΡΟ ΒΗΜΑ ────────────────────────────────────────
// Το μόνο υποχρεωτικό πεδίο είναι το όνομα. Αν η αποθήκευση δεν στέκει εκεί,
// ο χρήστης πληρώνει τρεις οθόνες για ένα κουτί.
await page.click('[data-s-open="vacant"]')
await page.waitForSelector('[role="dialog"]')
await page.click('text=Συνέχεια')
await page.waitForTimeout(60)
const saveNow = await page.$('text=Αποθήκευση')
ok('η αποθήκευση στέκει ήδη στο δεύτερο βήμα', !!saveNow)

console.log(`\nΑπλότητα στον οδηγό ακινήτου — ${pass} πέρασαν, ${fail} απέτυχαν`)
await browser.close()
process.exit(fail ? 1 : 0)
