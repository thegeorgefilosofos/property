#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΔΗΜΟΣΙΑ ΕΡΓΑΛΕΙΑ ΧΩΡΙΣ ΠΟΝΤΙΚΙ ΚΑΙ ΧΩΡΙΣ ΜΑΤΙΑ
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΑΣΤΟΧΙΕΣ ΠΟΥ ΒΡΕΘΗΚΑΝ ΜΕ ΜΕΤΡΗΣΗ, ΤΟΝ ΑΥΓΟΥΣΤΟ 2026:
//
//   1. ΚΑΝΕΝΑ αποτέλεσμα δεν ανακοινωνόταν. Με MutationObserver μετρήθηκαν 18
//      ώς 61 αλλαγές κειμένου ανά σελίδα καθώς πληκτρολογεί ο χρήστης, και
//      ΜΗΔΕΝ μέσα σε ζωντανή περιοχή. Ο τυφλός χρήστης έγραφε το ενοίκιό του
//      και δεν μάθαινε ποτέ τον φόρο — δηλαδή η σελίδα δεν έκανε τίποτα γι'
//      αυτόν, ενώ ΟΛΟΚΛΗΡΗ η σελίδα είναι το αποτέλεσμα.
//
//   2. Δεκαεπτά πεδία σε τέσσερις σελίδες είχαν inline `outline: 'none'`, που
//      νικά το :focus-visible του globals.css. Μετρημένο με το πεδίο
//      εστιασμένο: outlineWidth 0px, boxShadow none, εικόνα ΤΑΥΤΟΣΗΜΗ με την
//      ανεστίαστη. Ο χρήστης πληκτρολογίου δεν έβλεπε πού βρίσκεται.
//
// ΓΙΑΤΙ ΤΟ ΤΕΣΤ ΣΥΓΚΡΙΝΕΙ ΟΘΟΝΗ ΜΕ ΑΝΑΚΟΙΝΩΣΗ. Μια ζωντανή περιοχή που λέει
// ΚΑΤΙ δεν αρκεί: αν πει άλλο νούμερο από αυτό που δείχνει η οθόνη, είναι
// χειρότερη από το να σωπαίνει. Ελέγχεται ότι το ποσό που ακούγεται είναι
// ΤΟ ΙΔΙΟ με αυτό που διαβάζεται.
//
// ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI: χρειάζεται ζωντανό server και browser.
//     npm run build && npx next start -p 3100
//     node scripts/e2e-a11y.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const B = process.env.E2E_BASE || 'http://localhost:3100'

/** Κάθε σελίδα, με το χειριστήριο που οδηγείται και το ποσό που πρέπει να ακουστεί. */
const PAGES = [
  { path: '/',                           what: 'ο υπολογιστής της αρχικής' },
  { path: '/ypologismos-forou-enoikion', what: 'φόρος ενοικίων' },
  { path: '/ypologismos-enfia',          what: 'ΕΝΦΙΑ' },
  { path: '/vraxyxronia-i-makroxronia',  what: 'βραχυχρόνια ή μακροχρόνια' },
  { path: '/kathari-apodosi',            what: 'καθαρή απόδοση' },
]

/** Ολα τα ποσά και ποσοστά ενός κειμένου, ώστε να συγκριθούν οθόνη και φωνή. */
const figures = t => [...String(t).matchAll(/[\d.]+,\d{2}\s*(?:€|%)/g)].map(m => m[0].replace(/\s+/g, ' '))

let pass = 0, fail = 0
const bad = n => { fail++; console.log('  ✗ ' + n) }
const ok = (n, c) => c ? pass++ : bad(n)

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})

for (const pg of PAGES) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'el-GR' })
  const p = await ctx.newPage()
  await p.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  await p.goto(B + pg.path, { waitUntil: 'networkidle' })

  // ΟΤΑΝ Η ΠΕΡΙΟΧΗ ΛΕΙΠΕΙ, ΤΟ ΤΕΣΤ ΤΟ ΛΕΕΙ — ΔΕΝ ΣΚΑΕΙ. Η πρώτη εκδοχή
  // περίμενε το στοιχείο και πέθαινε με TimeoutError, κρύβοντας ποιο ακριβώς
  // πράγμα λείπει και σταματώντας τον έλεγχο των υπόλοιπων σελίδων.
  // ══════════════════════════════════════════════════════════════════════
  // Η ΓΛΩΣΣΑ ΤΟΥ ΕΓΓΡΑΦΟΥ ΚΡΙΝΕΙ ΤΟΝ ΤΟΝΟ ΣΤΑ ΚΕΦΑΛΑΙΑ
  //
  // Δεκάδες ετικέτες γράφονται πεζές και τις κεφαλαιοποιεί το CSS. Οτι ο
  // περιηγητής αφαιρεί τον ελληνικό τόνο στα κεφαλαία ΔΕΝ είναι ιδιότητα του
  // κειμένου: είναι κανόνας που εφαρμόζεται ΜΟΝΟ όταν το έγγραφο δηλώνει
  // ελληνικά. Ενα `lang` που θα έφευγε από το app/layout.tsx θα γέμιζε
  // ολόκληρη την εφαρμογή με «ΌΡΟΦΟΣ» και «ΈΤΟΣ ΚΑΤΑΣΚΕΥΉΣ», σιωπηλά, χωρίς
  // να αλλάξει ούτε ένας χαρακτήρας σε κανένα αρχείο κειμένου. Ο φύλακας
  // guard-uppercase-tonos ελέγχει τις ΓΡΑΜΜΕΝΕΣ συμβολοσειρές και δεν μπορεί
  // να δει αυτό.
  //
  // ΚΑΙ ΕΙΝΑΙ ΚΑΙ ΠΡΟΣΒΑΣΙΜΟΤΗΤΑ: χωρίς γλώσσα, ο αναγνώστης οθόνης διαβάζει
  // ελληνικά με αγγλική προφορά (WCAG 3.1.1).
  ok(`${pg.what}: το έγγραφο δηλώνει ελληνικά`,
    (await p.evaluate(() => document.documentElement.lang)) === 'el')

  const live = p.locator('[aria-live="polite"].sr-only').first()
  const hasLive = await live.count() > 0
  ok(`${pg.what}: υπάρχει ζωντανή περιοχή`, hasLive)

  // Η αρχική οδηγείται με ολισθητές, οι υπολογιστές με πεδία: το σενάριο
  // προσαρμόζεται στο χειριστήριο που υπάρχει, αντί να υποθέτει.
  const inp = p.locator('input:not([type=hidden]):not([type=checkbox])').first()
  const kind = await inp.getAttribute('type')
  if (kind === 'range') { await inp.focus(); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight') }
  else { await inp.fill(''); await inp.pressSequentially('1234', { delay: 30 }) }
  await p.waitForTimeout(1100)

  const said = hasLive ? ((await live.textContent()) || '').trim() : ''
  ok(`${pg.what}: το αποτέλεσμα ανακοινώνεται`, said.length > 0)

  // ΟΘΟΝΗ ΚΑΙ ΦΩΝΗ ΛΕΝΕ ΤΟ ΙΔΙΟ. Καθε ποσό της ανακοίνωσης πρέπει να υπάρχει
  // αυτούσιο στην οθόνη· αλλιώς ο ένας χρήστης ακούει άλλα νούμερα από όσα
  // βλέπει ο άλλος.
  const screen = await p.locator('body').innerText()
  const heard = figures(said)
  const onScreen = new Set(figures(screen))
  ok(`${pg.what}: η ανακοίνωση περιέχει ποσά`, heard.length > 0)
  const drift = heard.filter(f => !onScreen.has(f))
  ok(`${pg.what}: κάθε ποσό που ακούγεται φαίνεται και στην οθόνη${drift.length ? ' — λείπει ' + drift.join(', ') : ''}`, drift.length === 0)

  // Η ΕΣΤΙΑΣΗ ΦΑΙΝΕΤΑΙ, ΣΕ ΚΑΘΕ ΠΕΔΙΟ ΤΗΣ ΣΕΛΙΔΑΣ.
  const fields = p.locator('input:not([type=hidden]):not([type=checkbox]):not([type=range])')
  const n = await fields.count()
  let blind = 0
  for (let i = 0; i < n; i++) {
    const f = fields.nth(i)
    await f.focus()
    const seen = await f.evaluate(el => {
      const c = getComputedStyle(el)
      return (parseFloat(c.outlineWidth) > 0 && c.outlineStyle !== 'none') || (c.boxShadow && c.boxShadow !== 'none')
    })
    if (!seen) blind++
  }
  ok(`${pg.what}: και τα ${n} πεδία δείχνουν την εστίαση${blind ? ` — ${blind} χωρίς σημάδι` : ''}`, blind === 0)
  await ctx.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΣΕΛΙΔΕΣ ΣΥΝΔΕΣΗΣ ΚΑΙ ΕΓΓΡΑΦΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Μετρημένες αστοχίες, Αύγουστος 2026: καμία περιοχή <main>, κανένας σύνδεσμος
// παράκαμψης, και —η χειρότερη— το κουμπί «Ξεκίνα τη δοκιμή» ήταν `disabled`,
// δηλαδή ΕΞΩ από τη σειρά Tab. Ο χρήστης πληκτρολογίου διέσχιζε όλη τη φόρμα
// και έβγαινε χωρίς να το συναντήσει· πατώντας Enter δεν γινόταν τίποτα και
// δεν λεγόταν τίποτα. Η εγγραφή έμοιαζε χαλασμένη.
// ═══════════════════════════════════════════════════════════════════════════
for (const path of ['/login', '/signup']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1200 }, locale: 'el-GR' })
  const p = await ctx.newPage()
  await p.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  await p.goto(B + path, { waitUntil: 'networkidle' })
  const land = await p.evaluate(() => ({
    mains: document.querySelectorAll('main').length,
    skips: document.querySelectorAll('a[href^="#"]').length,
  }))
  ok(`${path}: μία περιοχή <main>`, land.mains === 1)
  ok(`${path}: σύνδεσμος παράκαμψης`, land.skips >= 1)
  await ctx.close()
}

{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1200 }, locale: 'el-GR' })
  const p = await ctx.newPage()
  await p.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  await p.goto(B + '/signup', { waitUntil: 'networkidle' })
  const cta = p.locator('button.auth-cta')

  // ΤΟ ΚΟΥΜΠΙ ΕΙΝΑΙ ΚΑΝΟΝΙΚΟ. Ούτε `disabled` (βγαίνει από το Tab) ούτε
  // `aria-disabled` (ο αναγνώστης το λέει «μη διαθέσιμο» και δεν το πατά).
  ok('εγγραφή: το κουμπί δεν είναι ανενεργό', await cta.getAttribute('disabled') === null && await cta.getAttribute('aria-disabled') === null)

  await p.locator('body').click({ position: { x: 5, y: 5 } })
  let reached = false
  for (let i = 0; i < 40 && !reached; i++) {
    await p.keyboard.press('Tab')
    reached = await p.evaluate(() => document.activeElement?.classList.contains('auth-cta') === true)
  }
  ok('εγγραφή: το Tab φτάνει στο κουμπί', reached)

  const why = ((await p.locator('#su-cta-why').textContent()) || '').trim()
  ok('εγγραφή: ο λόγος λέγεται πριν το πάτημα', why.length > 0)
  ok('εγγραφή: το κουμπί δείχνει στον λόγο', await cta.getAttribute('aria-describedby') === 'su-cta-why')

  // ΤΟ ΠΕΔΙΟ ΚΩΔΙΚΟΥ ΔΕΝ ΔΕΙΧΝΕΙ ΣΕ ΑΝΥΠΑΡΚΤΟ ΣΤΟΧΟ. Η σπασμένη αναφορά δεν
  // αγνοείται: καταπίνει και το placeholder, οπότε πριν την πληκτρολόγηση δεν
  // ακουγόταν ΚΑΝΕΝΑΣ κανόνας κωδικού.
  // ΣΕ ΚΑΘΑΡΗ ΣΕΛΙΔΑ. Η πλοήγηση με Tab παραπάνω περνά ΜΕΣΑ από το πεδίο
  // κωδικού, οπότε το `pwTouched` έχει ήδη ανάψει: ο έλεγχος «πριν αγγίξει
  // κανείς το πεδίο» πρέπει να γίνει σε σελίδα που δεν την άγγιξε κανείς.
  {
    const fresh = await ctx.newPage()
    await fresh.goto(B + '/signup', { waitUntil: 'networkidle' })
    ok('εγγραφή: καμία περιγραφή πριν υπάρξει ο στόχος',
      await fresh.locator('#su-password').getAttribute('aria-describedby') === null)
    await fresh.close()
  }

  const pwField = p.locator('#su-password')
  await pwField.fill('Ab1!')
  await p.waitForTimeout(300)
  ok('εγγραφή: η περιγραφή δείχνει σε υπαρκτό στόχο',
    await pwField.getAttribute('aria-describedby') === 'su-pw-req' && await p.locator('#su-pw-req').count() === 1)

  // ΥΠΟΒΟΛΗ ΧΩΡΙΣ ΣΥΓΚΑΤΑΘΕΣΗ: ΕΞΗΓΕΙΤΑΙ, ΜΙΑ ΦΟΡΑ, ΣΤΑ ΕΛΛΗΝΙΚΑ.
  await p.locator('#su-email').fill('dokimi@example.com')
  await pwField.fill('Dokimastiko2026!x')
  await p.waitForTimeout(400)
  await cta.click()
  await p.waitForTimeout(700)
  const said = (await p.locator('[role="alert"]').allInnerTexts()).map(t => t.trim()).filter(Boolean)
  ok('εγγραφή: η υποβολή χωρίς όρους εξηγείται', said.some(t => /αποδεχθείς|αποδοχή/i.test(t)))
  ok(`εγγραφή: εξηγείται ΜΙΑ φορά${said.length > 1 ? ' — ειπώθηκε ' + said.length : ''}`, said.length === 1)
  await ctx.close()
}

await b.close()
console.log(`\nΠροσβασιμότητα δημόσιων σελίδων — ${pass} πέρασαν, ${fail} απέτυχαν`)
process.exit(fail ? 1 : 0)
