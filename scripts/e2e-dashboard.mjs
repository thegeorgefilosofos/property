#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// E2E ΣΕΝΑΡΙΑ ΓΙΑ ΤΟΝ ΠΙΝΑΚΑ ΕΛΕΓΧΟΥ
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΜΕΡΗ, ΚΑΙ ΤΟ ΠΡΩΤΟ ΤΡΕΧΕΙ ΠΑΝΤΑ.
//
//   Α. Η ΠΕΡΙΜΕΤΡΟΣ. Κάθε ιδιωτική διαδρομή πρέπει να στέλνει τον ανώνυμο
//      επισκέπτη στη σύνδεση, και κάθε δημόσια πρέπει να ανοίγει χωρίς αυτήν.
//      Δεν χρειάζεται λογαριασμό: χρειάζεται μόνο τον server.
//
//   Β. ΟΙ ΔΙΑΔΡΟΜΕΣ ΤΟΥ ΧΡΗΣΤΗ. Σύνδεση, φόρτωση του πίνακα, αλλαγή καρτέλας,
//      αναζήτηση. Χρειάζονται λογαριασμό δοκιμών, οπότε τρέχουν ΜΟΝΟ όταν
//      δοθούν διαπιστευτήρια σε μεταβλητές περιβάλλοντος. Χωρίς αυτές, το
//      σενάριο το λέει καθαρά και δεν προσποιείται ότι έλεγξε κάτι.
//
// ── ΓΙΑΤΙ Η ΠΕΡΙΜΕΤΡΟΣ ΕΙΝΑΙ ΤΟ ΠΡΩΤΟ ΠΟΥ ΕΛΕΓΧΕΤΑΙ ──────────────────────
// Ο κατάλογος των δημόσιων διαδρομών είναι ΧΕΙΡΟΓΡΑΦΟΣ, μέσα στο proxy.ts. Μια
// καινούργια σελίδα κάτω από το /dashboard δεν χρειάζεται καμία ενέργεια για να
// προστατευτεί — αλλά μια καινούργια σελίδα ΕΚΤΟΣ αυτού, που ξεχάστηκε από τον
// κατάλογο, ή ένα τυπογραφικό μέσα στον κατάλογο, δεν βγάζει κανένα σφάλμα:
// βγάζει είτε διαρροή δεδομένων είτε δωρεάν εργαλείο που ζητά σύνδεση. Και τα
// δύο έχουν ήδη συμβεί σε αυτό το έργο, και κανένα δεν το έπιασε το build.
//
// ΧΡΗΣΗ:
//     npm run dev                            (σε άλλο τερματικό)
//     node scripts/e2e-dashboard.mjs
//     E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e-dashboard.mjs   (και το Β)
//
// ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI: χρειάζεται ζωντανό server και browser.
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const B = process.env.E2E_BASE || 'http://localhost:3000'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n) } }

/**
 * Ο κωδικός απάντησης ΧΩΡΙΣ να ακολουθηθεί η ανακατεύθυνση.
 *
 * Το «ακολούθησε και δες πού κατέληξες» θα έδειχνε 200 και για τη σελίδα που
 * ανακατευθύνει και για εκείνη που όντως άνοιξε.
 */
async function head(path) {
  const res = await fetch(B + path, { redirect: 'manual' })
  return { status: res.status, location: res.headers.get('location') || '' }
}

// ── Α. Η ΠΕΡΙΜΕΤΡΟΣ ────────────────────────────────────────────────────────
// Ο κατάλογος είναι γραμμένος ΕΔΩ με το χέρι, ΣΚΟΠΙΜΑ. Αν διαβαζόταν από το
// proxy.ts, θα επιβεβαίωνε ότι ο κώδικας συμφωνεί με τον εαυτό του — που είναι
// πάντα αληθές και ποτέ χρήσιμο. Εδώ γράφεται η ΠΡΟΘΕΣΗ: ποιες σελίδες θέλουμε
// ανοιχτές και ποιες κλειστές. Όταν οι δύο κατάλογοι διαφωνήσουν, ένας από τους
// δύο έχει λάθος, και αυτό είναι ακριβώς το ζητούμενο.
const PRIVATE = ['/dashboard']
const PUBLIC = [
  '/', '/login', '/signup', '/privacy', '/terms', '/trust',
  '/ypologismos-forou-enoikion', '/ypologismos-enfia', '/vraxyxronia-i-makroxronia',
  '/kathari-apodosi',
]
// Ο ΧΩΡΟΣ ΤΟΥ ΛΟΓΙΣΤΗ ΦΥΛΑΕΙ ΤΟΝ ΕΑΥΤΟ ΤΟΥ, ΚΑΙ ΓΙ' ΑΥΤΟ ΣΕΡΒΙΡΕΤΑΙ. Δεν
// ανακατευθύνεται από τον διαμεσολαβητή επειδή, όταν λείπει η σύνδεση, δείχνει
// ο ίδιος πρόσκληση σύνδεσης ΜΕ ΕΠΙΣΤΡΟΦΗ σε αυτόν — κάτι που η ανακατεύθυνση
// θα έχανε, στέλνοντας τον λογιστή στον πίνακα του ιδιοκτήτη. Το επικίνδυνο δεν
// είναι που σερβίρεται· είναι αν σερβίρει ΔΕΔΟΜΕΝΑ. Αυτό ελέγχεται.

console.log('Α. Η περίμετρος')
for (const path of PRIVATE) {
  const r = await head(path)
  ok(`${path} στέλνει τον ανώνυμο στη σύνδεση`, r.status === 307 && r.location.endsWith('/login'))
}
for (const path of PUBLIC) {
  const r = await head(path)
  ok(`${path} ανοίγει χωρίς σύνδεση`, r.status === 200)
}

{
  const p = await (await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })).newPage()
  await p.goto(B + '/accountant/workspace', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  const t = await p.locator('body').innerText()
  ok('ο χώρος του λογιστή ζητά σύνδεση όταν λείπει', /Σύνδεση/.test(t))
  ok('…με επιστροφή σε αυτόν', await p.locator('a[href="/login?next=/accountant/workspace"]').count() > 0)
  ok('…και δεν δείχνει κανέναν πελάτη', !/ΑΦΜ|Ετοιμότητα/.test(t))
  await p.context().browser().close()
}

// Το service worker και το manifest ζητούνται και σε ανώνυμη επίσκεψη: μια
// ανακατεύθυνσή τους στη σύνδεση ακυρώνει σιωπηλά την εγκατάσταση της εφαρμογής.
for (const path of ['/sw.js', '/manifest.webmanifest']) {
  const r = await head(path)
  ok(`${path} σερβίρεται χωρίς έλεγχο σύνδεσης`, r.status === 200)
}

// ── Β. ΟΙ ΔΙΑΔΡΟΜΕΣ ΤΟΥ ΧΡΗΣΤΗ ─────────────────────────────────────────────
if (!EMAIL || !PASSWORD) {
  console.log('\nΒ. Οι διαδρομές του χρήστη: ΔΕΝ ΕΛΕΓΧΘΗΚΑΝ')
  console.log('   Χρειάζονται λογαριασμό δοκιμών. Τρέξε ξανά με:')
  console.log('   E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e-dashboard.mjs')
} else {
  console.log('\nΒ. Οι διαδρομές του χρήστη')
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'el-GR' })
  const p = await ctx.newPage()

  const errors = []
  p.on('pageerror', e => errors.push(String(e)))

  await p.goto(B + '/login', { waitUntil: 'networkidle' })
  await p.locator('input[type="email"]').fill(EMAIL)
  await p.locator('input[type="password"]').fill(PASSWORD)
  await p.getByRole('button', { name: /σύνδεση/i }).first().click()
  await p.waitForURL(/\/dashboard/, { timeout: 20000 }).catch(() => {})
  ok('η σύνδεση οδηγεί στον πίνακα', /\/dashboard/.test(p.url()))

  await p.waitForTimeout(2500)
  const body = await p.locator('body').innerText()
  // Τα τρία που φαίνονται ΜΟΝΟ σε ζωντανή σελίδα και ποτέ σε unit τεστ.
  ok('καμία λέξη NaN στην οθόνη', !body.includes('NaN'))
  ok('κανένα undefined στην οθόνη', !body.includes('undefined'))
  ok('καμία ανεπεξέργαστη ημερομηνία ISO', !/\d{4}-\d{2}-\d{2}T\d{2}:/.test(body))

  // Οριζόντια κύλιση σε κινητό: το κείμενο βγαίνει έξω από την οθόνη και ο
  // χρήστης το ανακαλύπτει σέρνοντας. Δεν φαίνεται σε καμία άλλη δοκιμή.
  const m = await ctx.newPage()
  await m.setViewportSize({ width: 390, height: 844 })
  await m.goto(B + '/dashboard', { waitUntil: 'networkidle' })
  await m.waitForTimeout(2000)
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok('χωρίς οριζόντια υπερχείλιση στα 390 εικονοστοιχεία', overflow <= 1)

  // ── ΚΑΘΕ ΚΑΡΤΕΛΑ ΑΝΟΙΓΕΙ ΚΑΙ ΑΠΟΔΙΔΕΤΑΙ ──────────────────────────────────
  // ΓΙΑΤΙ ΠΡΟΣΤΕΘΗΚΕ. Οι δεκαεπτά καρτέλες και τα τρία παράθυρα κατεβαίνουν
  // πλέον με δυναμική εισαγωγή (`components/lazyTabs.tsx`), ώστε το πρώτο
  // φόρτωμα να μη σέρνει 2,3 MB κώδικα που κανείς δεν άνοιξε. Το κέρδος είναι
  // μετρημένο· ο κίνδυνος όμως είναι καινούριος και δεν τον πιάνει ΚΑΝΕΝΑ άλλο
  // τεστ: ένα κομμάτι που δεν κατεβαίνει δεν σπάει τη μεταγλώττιση, δεν
  // σπάει τον τυποελεγκτή, και φαίνεται ΜΟΝΟ ως καρτέλα που δεν ανοίγει.
  //
  // Τρία πράγματα ελέγχονται ανά καρτέλα, και τα τρία χρειάζονται:
  //   · ότι το σχήμα αναμονής έφυγε — δηλαδή το κομμάτι έφτασε και αποδόθηκε
  //   · ότι δεν πέταξε εξαίρεση στο άνοιγμα
  //   · ότι κανένα αίτημα .js δεν απέτυχε (το ίδιο το κομμάτι που λείπει)
  const failedChunks = []
  p.on('requestfailed', r => { if (/\.js(\?|$)/.test(r.url())) failedChunks.push(r.url()) })

  const tabs = await p.locator('[data-nav]').evaluateAll(
    els => els.filter(e => !e.disabled).map(e => e.dataset.nav))
  ok(`το μενού δίνει καρτέλες να ανοιχτούν (${tabs.length})`, tabs.length >= 8)

  for (const id of tabs) {
    const before = errors.length
    await p.locator(`[data-nav="${id}"]`).click()
    // Το σχήμα αναμονής φέρει `aria-busy`: όσο υπάρχει, το κομμάτι δεν έχει
    // φτάσει. Η αναμονή είναι για ΤΗΝ ΕΞΑΦΑΝΙΣΗ του, όχι σταθερός χρόνος.
    await p.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    await p.waitForTimeout(400)
    const text = (await p.locator('main').innerText().catch(() => '')) || await p.locator('body').innerText()
    ok(`η καρτέλα «${id}» αποδίδεται`, text.trim().length > 40)
    ok(`…χωρίς εξαίρεση`, errors.length === before)
    ok(`…χωρίς NaN ή undefined`, !/NaN|undefined/.test(text))
  }
  ok('κανένα κομμάτι κώδικα δεν έλειψε', failedChunks.length === 0)
  if (failedChunks.length) for (const u of failedChunks.slice(0, 3)) console.log('    ' + u)

  // ── ΤΟ ΤΑΜΕΙΟ ΧΩΡΙΣ ΠΑΚΕΤΟ ΡΩΤΑΕΙ, ΔΕΝ ΠΡΟΣΠΕΡΝΑ ────────────────────────
  // Το κουμπί «Ξεκίνα τη δοκιμή» της αρχικής πάει στο /signup ΧΩΡΙΣ πακέτο.
  // Μέχρι τη διόρθωση, όλοι αυτοί έφταναν στο ταμείο με άδεια διεύθυνση και
  // ανακατευθύνονταν σιωπηλά στον πίνακα: κανείς δεν τους ρωτούσε ποτέ τι
  // πακέτο θέλουν. Ο έλεγχος κρατά τη ρώτηση ζωντανή.
  {
    await p.goto(B + '/tameio', { waitUntil: 'networkidle' })
    await p.waitForTimeout(1200)
    const t = await p.locator('body').innerText()
    const asks = /Διάλεξε πακέτο/.test(t)
    const onDashboard = /\/dashboard/.test(p.url())
    ok('το ταμείο χωρίς πακέτο ρωτάει αντί να προσπερνά', asks || !onDashboard)
    if (asks) {
      ok('…και δείχνει και τα τέσσερα πακέτα',
         ['Ιδιοκτήτης', 'Ιδιοκτήτης+', 'Επαγγελματίας', 'Επαγγελματίας+'].every(n => t.includes(n)))
      ok('…με τον κύκλο χρέωσης να αλλάζει', /Μηνιαία/.test(t) && /Ετήσια/.test(t))
    }
  }

  ok('καμία εξαίρεση στην κονσόλα', errors.length === 0)
  if (errors.length) for (const e of errors.slice(0, 3)) console.log('    ' + e.slice(0, 160))

  await b.close()
}

// ── Γ. Η ΑΝΑΦΟΡΑ ΣΦΑΛΜΑΤΟΣ ΦΤΑΝΕΙ ΟΝΤΩΣ ΣΤΟ ΔΙΚΤΥΟ ────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Η αλυσίδα «σφάλμα → ακροατής → φίλτρο → φάκελος → δίκτυο» ήταν
// το μόνο κομμάτι που κανένα τεστ δεν έπιανε ολόκληρο: τα μονάδας ελέγχουν τον
// φάκελο, αλλά κανένα δεν επιβεβαιώνει ότι ο ακροατής ακούει.
//
// ΚΑΙ ΤΟ ΠΙΟ ΧΡΗΣΙΜΟ ΠΟΥ ΑΠΕΔΕΙΞΕ: ένα σκέτο `throw` γραμμένο στην κονσόλα του
// περιηγητή ΔΕΝ φτάνει ποτέ. Τα εργαλεία προγραμματιστή πιάνουν την εξαίρεση
// στα δικά τους όρια και δεν την αφήνουν να γίνει σφάλμα της σελίδας. Όποιος
// δοκίμαζε έτσι, θα συμπέραινε λανθασμένα ότι η αναφορά δεν δουλεύει.
//
// ΧΡΗΣΗ: ο διακομιστής πρέπει να έχει ξεκινήσει ΜΕ DSN.
//     NEXT_PUBLIC_SENTRY_DSN=https://k@o1.ingest.sentry.io/1 npm run dev
//     E2E_SENTRY=1 node scripts/e2e-dashboard.mjs
if (process.env.E2E_SENTRY === '1') {
  console.log('\nΓ. Η αναφορά σφάλματος')
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  })
  const p = await b.newPage()
  const sent = []
  await p.route('**/*ingest.sentry.io/**', r => { sent.push(r.request().postData() || ''); r.fulfill({ status: 200, body: '' }) })
  await p.goto(B + '/', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)

  const fires = async (fn) => {
    const before = sent.length
    await p.evaluate(fn).catch(() => {})
    await p.waitForTimeout(900)
    return sent.length > before
  }

  ok('σφάλμα σε χρονοδιακόπτη αναφέρεται',
     await fires(() => { setTimeout(() => { throw new Error('δοκιμή χρονοδιακόπτη') }, 5) }))
  ok('απορριφθέν promise αναφέρεται',
     await fires(() => { Promise.reject(new Error('δοκιμή promise')) }))
  // Ο θόρυβος των επεκτάσεων μένει έξω, αλλιώς η λίστα δεν διαβάζεται.
  ok('σφάλμα άλλης προέλευσης ΔΕΝ αναφέρεται',
     !(await fires(() => { setTimeout(() => { throw new Error('Script error.') }, 5) })))

  if (sent.length) {
    const ev = JSON.parse(sent[sent.length - 1].split('\n')[2])
    ok('ο φάκελος φέρει το μήνυμα του σφάλματος', /δοκιμή/.test(ev.exception.values[0].value))
    ok('…και την έκδοση του build', typeof ev.release === 'string' && ev.release.length > 0)
  }
  await b.close()
}

console.log(`\ne2e-dashboard: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
