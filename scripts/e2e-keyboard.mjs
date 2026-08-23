#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ ΔΟΥΛΕΥΕΙ ΜΕ ΠΛΗΚΤΡΟΛΟΓΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ. Οι πέντε δημόσιοι υπολογιστές ελέγχονται με πραγματικό περιηγητή
// εδώ και καιρό (`npm run e2e:a11y`, 37 ισχυρισμοί). Ο πίνακας ελέγχου όμως
// ζει πίσω από σύνδεση: τα παράθυρα, τα ντοσιέ, ο επιλογέας, το ημερολόγιο,
// οι διακόπτες και τα μενού του δεν είχαν πατηθεί ΠΟΤΕ με πληκτρολόγιο.
//
// ΚΑΙ ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ ΛΟΓΑΡΙΑΣΜΟΣ ΓΙΑ ΝΑ ΕΛΕΓΧΘΟΥΝ. Ο πάγκος αποδίδει τα ΙΔΙΑ
// στοιχεία που τρέχουν στην παραγωγή, με ολόκληρο το globals.css, μέσα σε
// πραγματικό Chromium από αρχείο. Ό,τι ελέγχεται εδώ είναι ο κώδικας που
// φτάνει στον χρήστη, όχι αντίγραφό του.
//
// ΤΙ ΕΛΕΓΧΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ ΤΟ ΚΑΘΕΝΑ:
//   · ΦΤΑΝΕΙ ΜΕ TAB.       Χειριστήριο που δεν φτάνεις, δεν υπάρχει.
//   · ΑΝΟΙΓΕΙ ΜΕ ENTER.    Το `onClick` σε <div> δουλεύει μόνο με ποντίκι.
//   · Η ΕΣΤΙΑΣΗ ΜΠΑΙΝΕΙ.   Παράθυρο που ανοίγει και αφήνει την εστίαση πίσω
//                          του ανακοινώνεται από τον αναγνώστη οθόνης, αλλά
//                          το Tab συνεχίζει στη σελίδα από κάτω.
//   · Η ΕΣΤΙΑΣΗ ΜΕΝΕΙ.     Χωρίς παγίδα, το Tab βγαίνει σε στοιχεία που τα
//                          σκεπάζει το πέπλο: ούτε τα βλέπεις ούτε τα πατάς.
//   · ESCAPE ΚΛΕΙΝΕΙ.      Ο μόνος δρόμος εξόδου χωρίς ποντίκι.
//   · Η ΕΣΤΙΑΣΗ ΓΥΡΝΑ.     Αλλιώς πέφτει στο <body> και το Tab ξαναρχίζει από
//                          την κορυφή της σελίδας.
//   · ΦΑΙΝΕΤΑΙ Η ΕΣΤΙΑΣΗ.  Δείκτης που δεν αλλάζει τίποτα οπτικά είναι το ίδιο
//                          με ανύπαρκτο: ο χρήστης δεν ξέρει πού βρίσκεται.
//
//   npm run e2e:keyboard
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const PAGE = 'file://' + process.cwd() + '/.perf-bench/keyboard.html'
const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const p = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await p.goto(PAGE, { waitUntil: 'networkidle' })
await p.waitForTimeout(400)

/**
 * Περιμένει ώσπου να ισχύσει η συνθήκη, με όριο. Επιστρέφει αν ίσχυσε.
 *
 * ΓΙΑΤΙ ΟΧΙ ΣΤΑΘΕΡΗ ΑΝΑΜΟΝΗ. Το `waitForTimeout(200)` είναι στοίχημα: σε
 * φορτωμένο μηχάνημα η React δεν έχει προλάβει και ο έλεγχος κοκκινίζει για
 * λόγο άσχετο με τον κώδικα· σε άδειο μηχάνημα περιμένει άδικα. Μετρήθηκε:
 * το ίδιο ακριβώς build έδινε 45 πράσινα και 42 πράσινα σε δύο διαδοχικά
 * τρεξίματα. Ένας έλεγχος που τρεμοπαίζει διδάσκει να τον ξαναπατάς.
 */
const until = async (fn, ms = 2000) => {
  const t0 = Date.now()
  for (;;) {
    if (await fn()) return true
    if (Date.now() - t0 > ms) return false
    await p.waitForTimeout(25)
  }
}

/** Ποιο στοιχείο έχει την εστίαση, σε μορφή που διαβάζεται σε μήνυμα. */
const focused = () => p.evaluate(() => {
  const a = document.activeElement
  if (!a || a === document.body) return 'body'
  const k = a.closest('[data-k]')?.dataset.k
  return `${a.tagName.toLowerCase()}${a.getAttribute('data-k') ? '[' + a.getAttribute('data-k') + ']' : ''}${k ? ' σε ' + k : ''}:${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20)}`
})

/** Είναι η εστίαση μέσα στο ανοιχτό παράθυρο; */
const inDialog = () => p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  return !!d && !!document.activeElement && d.contains(document.activeElement)
})

/**
 * Αλλάζει οπτικά το στοιχείο όταν το εστιάζει το ΠΛΗΚΤΡΟΛΟΓΙΟ;
 *
 * ΤΡΕΙΣ ΓΡΑΦΕΣ ΧΡΕΙΑΣΤΗΚΑΝ, ΚΑΙ ΟΙ ΔΥΟ ΠΡΩΤΕΣ ΗΤΑΝ ΛΑΘΟΣ.
 *
 * Η πρώτη καλούσε `el.focus()` από κώδικα. Η ψευδοκλάση `:focus-visible` δεν
 * σημαίνει «έχει εστίαση» αλλά «έχει εστίαση ΚΑΙ ο περιηγητής κρίνει ότι
 * πρέπει να φανεί», και η κρίση εξαρτάται από το ΠΩΣ ήρθε: με εστίαση από
 * κώδικα, χωρίς προηγούμενη χρήση πληκτρολογίου, δεν ανάβει. Ο έλεγχος
 * κατηγορούσε σωστό στυλ.
 *
 * Η δεύτερη πατούσε Tab ώσπου να φτάσει στο στοιχείο. Η αφετηρία όμως της
 * διαδοχικής πλοήγησης ΔΕΝ μηδενίζεται με `blur()`: ο περιηγητής συνεχίζει από
 * εκεί που ήταν, οπότε το πλήθος των Tab που χρειάζονται αλλάζει με την
 * προηγούμενη κατάσταση. Μετρήθηκε: το ίδιο build έδινε 45, 45, 43 και 44
 * πράσινα σε τέσσερα διαδοχικά τρεξίματα, και σε κάθε αποτυχία η εστίαση είχε
 * μείνει σε άλλο στοιχείο, μολύνοντας και τα επόμενα βήματα.
 *
 * Η τρίτη είναι ντετερμινιστική: ΕΝΑ Tab βάζει τον περιηγητή σε λειτουργία
 * πληκτρολογίου, και από εκεί και πέρα η εστίαση από κώδικα ανάβει κανονικά το
 * `:focus-visible`. Ελέγχεται και η ψευδοκλάση ΚΑΙ η πραγματική αλλαγή στυλ:
 * η πρώτη λέει ότι ο περιηγητής θέλει να δείξει κάτι, η δεύτερη ότι το φύλλο
 * στυλ όντως δείχνει.
 */
const focusRingOf = async (selector) => {
  await p.keyboard.press('Tab')                      // λειτουργία πληκτρολογίου
  const r = await p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const snap = (n) => { const cs = getComputedStyle(n); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor].join('|') }
    const before = snap(el)
    const beforeUp = el.parentElement ? snap(el.parentElement) : ''
    el.focus()
    const after = snap(el)
    const afterUp = el.parentElement ? snap(el.parentElement) : ''
    let visible = false
    try { visible = el.matches(':focus-visible') } catch { visible = false }
    return { changed: before !== after || beforeUp !== afterUp, visible, a: before, b: after }
  }, selector)
  return r
}

// ══ 1. ΠΑΡΑΘΥΡΟ ═══════════════════════════════════════════════════════════
console.log('\n── Παράθυρο')
await p.locator('[data-k="modal-open"]').focus()
ok('το κουμπί ανοίγματος φτάνει με εστίαση', (await focused()).includes('modal-open'))
await p.keyboard.press('Enter')
await p.waitForTimeout(250)
ok('το Enter το ανοίγει', await p.locator('[role="dialog"]').count() > 0)
ok('η εστίαση μπαίνει μέσα στο παράθυρο', await inDialog(), await focused())

// Η παγίδα: είκοσι Tab δεν επιτρέπεται να βγάλουν την εστίαση έξω.
let escaped = null
for (let i = 0; i < 20; i++) {
  await p.keyboard.press('Tab')
  if (!(await inDialog())) { escaped = i + 1; break }
}
ok('η εστίαση δεν βγαίνει από το παράθυρο σε 20 Tab', escaped === null, escaped ? `βγήκε στο ${escaped}ο (${await focused()})` : '')

escaped = null
for (let i = 0; i < 20; i++) {
  await p.keyboard.press('Shift+Tab')
  if (!(await inDialog())) { escaped = i + 1; break }
}
ok('ούτε με Shift+Tab προς τα πίσω', escaped === null, escaped ? `βγήκε στο ${escaped}ο` : '')

await p.keyboard.press('Escape')
await p.waitForTimeout(250)
ok('το Escape το κλείνει', await p.locator('[role="dialog"]').count() === 0)
ok('η εστίαση γυρίζει στο κουμπί που το άνοιξε', (await focused()).includes('modal-open'), await focused())

// ══ 2. ΝΤΟΣΙΕ ═════════════════════════════════════════════════════════════
console.log('\n── Ντοσιέ')
await p.locator('[data-k="sheet-open"]').focus()
await p.keyboard.press('Enter')
await p.waitForTimeout(300)
ok('το Enter το ανοίγει', await p.locator('[role="dialog"]').count() > 0)
ok('η εστίαση μπαίνει μέσα', await inDialog(), await focused())
escaped = null
for (let i = 0; i < 15; i++) {
  await p.keyboard.press('Tab')
  if (!(await inDialog())) { escaped = i + 1; break }
}
ok('η εστίαση δεν βγαίνει σε 15 Tab', escaped === null, escaped ? `βγήκε στο ${escaped}ο` : '')
await p.keyboard.press('Escape')
await p.waitForTimeout(250)
ok('το Escape το κλείνει', await p.locator('[role="dialog"]').count() === 0)
ok('η εστίαση γυρίζει', (await focused()).includes('sheet-open'), await focused())

// ══ 3. ΕΠΙΛΟΓΕΑΣ ══════════════════════════════════════════════════════════
// ΚΑΘΕ ΒΗΜΑ ΣΤΗΝΕΙ ΜΟΝΟ ΤΟΥ ΤΙΣ ΠΡΟΫΠΟΘΕΣΕΙΣ ΤΟΥ. Η πρώτη γραφή στηριζόταν στο
// ότι η εστίαση είχε μείνει εκεί που την άφησε το προηγούμενο βήμα — και ο
// έλεγχος της ορατότητας πατά δεκάδες Tab. Ένα βήμα που κληρονομεί κατάσταση
// αποτυγχάνει για λόγο άσχετο με αυτό που ελέγχει, και τότε διδάσκει να το
// ξαναπατάς ώσπου να περάσει.
console.log('\n── Επιλογέας')
const selTrigger = '[data-k="select"] [role="combobox"]'
// Το μενού ζωγραφίζεται σε portal στο <body>, όχι μέσα στο τμήμα.
const listOpen = async () => await p.locator('[role="listbox"]').count() > 0

await p.locator(selTrigger).focus()
ok('ο επιλογέας φτάνει με εστίαση', (await focused()).includes('select'), await focused())

const fvSel = await focusRingOf(selTrigger)
ok('η εστίαση φαίνεται πάνω του', fvSel?.changed === true && fvSel?.visible === true, `αλλαγή ${fvSel?.changed}, focus-visible ${fvSel?.visible}`)

await p.locator(selTrigger).focus()
await until(async () => (await focused()).includes('select'))
await p.keyboard.press('Enter')
ok('το Enter ανοίγει τη λίστα', await until(listOpen))

await p.keyboard.press('ArrowDown')
const moved = await until(async () => !!(await p.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-activedescendant'), selTrigger)))
ok('το κάτω βέλος μετακινεί την ενεργή επιλογή', moved,
   'aria-activedescendant: ' + await p.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-activedescendant'), selTrigger))

const before = await p.evaluate((sel) => document.querySelector(sel).textContent.trim(), selTrigger)
await p.keyboard.press('Enter')
ok('το Enter επιλέγει και κλείνει', await until(async () => !(await listOpen())))
ok('και η επιλογή άλλαξε',
   await until(async () => (await p.evaluate((sel) => document.querySelector(sel).textContent.trim(), selTrigger)) !== before),
   `έμεινε «${before}»`)
ok('η εστίαση μένει στον επιλογέα', (await focused()).includes('select'), await focused())

await p.locator(selTrigger).focus()
await p.keyboard.press('Enter')
await until(listOpen)
await p.keyboard.press('Escape')
ok('το Escape κλείνει χωρίς επιλογή', await until(async () => !(await listOpen())))

// ══ 4. ΗΜΕΡΟΛΟΓΙΟ ═════════════════════════════════════════════════════════
console.log('\n── Ημερολόγιο')
const dateTrigger = '[data-k="date"] [role="button"]'
await p.locator(dateTrigger).first().focus()
ok('φτάνει με εστίαση', (await focused()).includes('date'), await focused())
await p.keyboard.press('Enter')
await p.waitForTimeout(250)
// ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΠΡΕΠΕΙ ΝΑ ΕΧΕΙ ΡΟΛΟ. Ένα γυμνό <div> σε portal δεν
// ανακοινώνεται από κανέναν αναγνώστη οθόνης: ο χρήστης πατά Enter, η οθόνη
// αλλάζει, και δεν ακούει τίποτα.
const calOpen = async () => await p.locator('[role="dialog"][aria-label*="μερολ"], [role="grid"]').count() > 0
ok('το Enter ανοίγει το ημερολόγιο', await calOpen())
await p.keyboard.press('Escape')
await p.waitForTimeout(250)
ok('το Escape το κλείνει', !(await calOpen()))
ok('η εστίαση γυρίζει στο κουμπί', (await focused()).includes('date'), await focused())

// ══ 5. ΔΙΑΚΟΠΤΗΣ ══════════════════════════════════════════════════════════
console.log('\n── Διακόπτης')
const tog = '[data-k="toggle"] [role="switch"], [data-k="toggle"] button'
await p.locator(tog).first().focus()
const state = () => p.evaluate((s) => document.querySelector(s)?.getAttribute('aria-checked'), '[data-k="toggle"] [role="switch"], [data-k="toggle"] button')
const s0 = await state()
await p.keyboard.press('Space')
await p.waitForTimeout(150)
const s1 = await state()
ok('το Space τον αλλάζει', s0 !== s1, `${s0} → ${s1}`)
await p.keyboard.press('Enter')
await p.waitForTimeout(150)
ok('και το Enter τον αλλάζει', (await state()) !== s1, `${s1} → ${await state()}`)
const fvTog = await focusRingOf('[data-k="toggle"] [role="switch"]')
ok('η εστίαση φαίνεται πάνω του', fvTog?.changed === true && fvTog?.visible === true, `αλλαγή ${fvTog?.changed}, focus-visible ${fvTog?.visible}`)

// ══ 6. ΤΜΗΜΑΤΙΚΟΣ ΕΠΙΛΟΓΕΑΣ ══════════════════════════════════════════════
console.log('\n── Τμηματικός επιλογέας')
const segBtns = p.locator('[data-k="segment"] button')
const n = await segBtns.count()
ok(`και τα ${n} τμήματα είναι κουμπιά`, n >= 2)
await segBtns.nth(1).focus()
await p.keyboard.press('Enter')
await p.waitForTimeout(150)
const segSel = await p.evaluate(() => [...document.querySelectorAll('[data-k="segment"] button')].map(b => b.getAttribute('aria-pressed') ?? b.getAttribute('aria-selected')))
ok('το Enter επιλέγει το τμήμα', segSel.some(v => v === 'true'), JSON.stringify(segSel))

// ══ 7. ΜΕΝΟΥ ΕΝΕΡΓΕΙΩΝ ════════════════════════════════════════════════════
console.log('\n── Μενού ενεργειών')
await p.locator('[data-k="menu"] button').first().focus()
await p.keyboard.press('Enter')
await p.waitForTimeout(250)
const menuOpen = async () => await p.locator('[role="menu"]').count() > 0
ok('το Enter το ανοίγει', await menuOpen())
await p.keyboard.press('Escape')
await p.waitForTimeout(250)
ok('το Escape το κλείνει', !(await menuOpen()))
ok('η εστίαση γυρίζει στο κουμπί', (await focused()).includes('menu'), await focused())

// ══ 8. ΕΠΙΒΕΒΑΙΩΣΗ ════════════════════════════════════════════════════════
console.log('\n── Επιβεβαίωση')
await p.locator('[data-k="confirm-open"]').focus()
await p.keyboard.press('Enter')
await p.waitForTimeout(300)
ok('ανοίγει', await p.locator('[role="dialog"], [role="alertdialog"]').count() > 0)
ok('η εστίαση μπαίνει μέσα', await p.evaluate(() => {
  const d = document.querySelector('[role="dialog"], [role="alertdialog"]')
  return !!d && !!document.activeElement && d.contains(document.activeElement)
}), await focused())
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
ok('το Escape ακυρώνει', await p.locator('[role="dialog"], [role="alertdialog"]').count() === 0)
ok('η εστίαση γυρίζει', (await focused()).includes('confirm'), await focused())

// ══ 9. ΤΟ ΠΕΔΙΟ ΠΟΣΟΥ: ΑΚΟΛΟΥΘΕΙ ΤΟΝ ΓΟΝΕΑ, ΚΡΑΤΑ Ο,ΤΙ ΓΡΑΦΕΙΣ ═════════════
// Το πιο πολυχρησιμοποιημένο πεδίο της εφαρμογής, και το μόνο που κρατούσε
// ΑΝΤΙΓΡΑΦΟ της τιμής του γονέα σε δική του κατάσταση. Το αντίγραφο έφυγε και
// η τιμή υπολογίζεται πλέον κατά την απόδοση· εδώ ελέγχεται ότι οι τέσσερις
// συμπεριφορές που το δικαιολογούσαν κρατούν όλες.
console.log('\n── Πεδίο ποσού')
const numInput = '[data-k="num"] input'
const shown = () => p.evaluate((s) => document.querySelector(s).value, numInput)
const parentValue = () => p.evaluate(() => document.querySelector('[data-k="num-value"]').textContent)

await p.locator('[data-k="num-set"]').click()
await p.waitForTimeout(150)
ok('ακολουθεί τον γονέα όταν η τιμή αλλάζει απ έξω', (await shown()) === '250,00', `δείχνει «${await shown()}»`)

await p.locator(numInput).click()
await p.waitForTimeout(120)
ok('με την εστίαση δείχνει τον γυμνό αριθμό', (await shown()) === '250', `δείχνει «${await shown()}»`)

await p.keyboard.press('Control+a')
await p.keyboard.type('12')
await p.waitForTimeout(120)
ok('κρατά ό,τι πληκτρολογείς', (await shown()) === '12', `δείχνει «${await shown()}»`)
ok('και το στέλνει στον γονέα', (await parentValue()) === '12', `ο γονέας έχει «${await parentValue()}»`)

// Ενδιάμεση κατάσταση: το «12,» δεν είναι αριθμός, αλλά πρέπει να γράφεται.
await p.keyboard.type(',')
await p.waitForTimeout(120)
ok('δέχεται ενδιάμεση υποδιαστολή χωρίς να σβήσει', (await shown()) === '12,', `δείχνει «${await shown()}»`)
await p.keyboard.type('5')
await p.waitForTimeout(120)
ok('και το δεκαδικό μετά από αυτήν', (await shown()) === '12,5', `δείχνει «${await shown()}»`)

await p.keyboard.press('Tab')
await p.waitForTimeout(200)
ok('στο φύγε μορφοποιείται ως ποσό', (await shown()) === '12,50', `δείχνει «${await shown()}»`)
ok('και ο γονέας κρατά την αριθμητική τιμή', (await parentValue()) === '12.5', `ο γονέας έχει «${await parentValue()}»`)

// ══ 10. ΚΑΘΕ ΧΕΙΡΙΣΤΗΡΙΟ ΔΕΙΧΝΕΙ ΠΟΥ ΕΙΝΑΙ Η ΕΣΤΙΑΣΗ ═════════════════════
console.log('\n── Ορατότητα εστίασης')
// Πραγματικό Tab σε ΟΛΗ τη σελίδα, με σύγκριση πριν και μετά ανά στοιχείο.
const invisible = []
{
  const snapAll = () => p.evaluate(() => {
    const snap = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|')
    const out = {}
    document.querySelectorAll('button, input, select, textarea, [role="switch"], [role="combobox"], [role="button"], [tabindex="0"]').forEach((el, i) => {
      el.setAttribute('data-kbi', String(i))
      out[i] = {
        css: snap(getComputedStyle(el)),
        up: el.parentElement ? snap(getComputedStyle(el.parentElement)) : '',
        name: `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') || el.id || el.textContent || '').trim().slice(0, 22)}`,
      }
    })
    return out
  })
  // Η ΦΩΤΟΓΡΑΦΙΑ ΤΟΥ «ΧΩΡΙΣ ΕΣΤΙΑΣΗ» ΠΑΙΡΝΕΤΑΙ ΑΦΟΥ ΦΥΓΕΙ Η ΕΣΤΙΑΣΗ. Με το
  // αντίστροφο, όποιο στοιχείο έτυχε να κρατά την εστίαση από τον προηγούμενο
  // έλεγχο φωτογραφιζόταν ΜΕ το δαχτυλίδι του, και μετά συγκρινόταν με τον
  // εαυτό του: ο έλεγχος κατηγορούσε σωστό στυλ.
  await p.evaluate(() => { const a = document.activeElement; if (a && a !== document.body) a.blur() })
  const rest = await snapAll()
  const seen = new Set()
  for (let i = 0; i < 60; i++) {
    await p.keyboard.press('Tab')
    // ΜΙΚΡΗ ΑΝΑΜΟΝΗ, ΓΙΑΤΙ ΤΟ ΔΑΧΤΥΛΙΔΙ ΜΕΡΙΚΩΝ ΠΕΔΙΩΝ ΕΡΧΕΤΑΙ ΑΠΟ REACT.
    // Το πεδίο ποσού ζωγραφίζει τη σκιά εστίασης από κατάσταση (`onFocus` →
    // `setFocused`), δηλαδή σε ΕΠΟΜΕΝΗ απόδοση: διαβάζοντας το στυλ αμέσως
    // μετά το Tab, ο έλεγχος έβλεπε ακόμη το αφώτιστο και κατηγορούσε σωστό
    // στοιχείο. Δύο καρέ αρκούν και δεν κρύβουν πραγματικό εύρημα: ένα πεδίο
    // που δεν ανάβει ΠΟΤΕ, δεν θα ανάψει ούτε σε τριάντα χιλιοστά.
    await p.waitForTimeout(30)
    const r = await p.evaluate(() => {
      const a = document.activeElement
      if (!a || a === document.body || !a.hasAttribute('data-kbi')) return null
      const snap = (cs) => [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|')
      // ΤΟ ΠΕΔΙΟ ΔΕΝ ΕΙΝΑΙ ΠΑΝΤΑ ΑΥΤΟ ΠΟΥ ΑΝΑΒΕΙ. Τα πεδία της εφαρμογής είναι
      // <input> ΧΩΡΙΣ περίγραμμα μέσα σε πλαίσιο που κρατά το ορατό σχήμα: το
      // δαχτυλίδι εστίασης ζωγραφίζεται στο ΠΛΑΙΣΙΟ, όχι στο ίδιο το <input>.
      // Κοιτάζοντας μόνο το εστιασμένο στοιχείο, ο έλεγχος κατηγορούσε σωστό
      // σχέδιο. Μετριέται λοιπόν το στοιχείο ΚΑΙ ο γονέας του — και μόνο αυτοί
      // οι δύο: πιο ψηλά θα συγχωρούσαμε αλλαγή που δεν δείχνει το πεδίο.
      return { id: a.getAttribute('data-kbi'), css: snap(getComputedStyle(a)),
               up: a.parentElement ? snap(getComputedStyle(a.parentElement)) : '' }
    })
    if (!r || seen.has(r.id)) continue
    seen.add(r.id)
    if (rest[r.id] && rest[r.id].css === r.css && rest[r.id].up === r.up) invisible.push(rest[r.id].name)
  }
}
ok(`κάθε χειριστήριο αλλάζει όψη στην εστίαση${invisible.length ? ' — ' + invisible.join(', ') : ''}`, invisible.length === 0)

await browser.close()
console.log(`\nΠληκτρολόγιο στον πίνακα ελέγχου — ${pass} πέρασαν, ${fail} απέτυχαν`)
process.exit(fail ? 1 : 0)
