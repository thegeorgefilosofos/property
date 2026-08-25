#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  Η ΕΙΔΟΠΟΙΗΣΗ ΦΤΑΝΕΙ ΣΤΗΝ ΟΘΟΝΗ, ΣΕ ΠΡΑΓΜΑΤΙΚΟ CHROMIUM
// ─────────────────────────────────────────────────────────────────────────
//  ΤΙ ΠΡΟΣΘΕΤΕΙ ΠΑΝΩ ΑΠΟ ΤΙΣ ΜΟΝΑΔΙΑΙΕΣ ΔΟΚΙΜΕΣ. Εκείνες ελέγχουν ΤΙ ΓΡΑΦΕΙ η
//  ειδοποίηση (lib/push/message.ts) και ΟΤΙ ΦΕΥΓΕΙ κρυπτογραφημένη
//  (lib/push/send.ts). Κανένα από τα δύο δεν αποδεικνύει ότι ο service worker
//  την ΕΜΦΑΝΙΖΕΙ: ο κώδικας του `public/sw.js` τρέχει σε άλλο νήμα, δεν τον
//  φορτώνει κανένα τεστ, και ένα λάθος εκεί είναι απόλυτα σιωπηλό — το μήνυμα
//  φτάνει στη συσκευή και δεν το βλέπει ποτέ κανείς.
//
//  ΠΩΣ ΣΤΕΛΝΕΤΑΙ ΧΩΡΙΣ ΥΠΗΡΕΣΙΑ PUSH. Το πρωτόκολλο του Chrome DevTools έχει
//  `ServiceWorker.deliverPushMessage`: παραδίδει το μήνυμα ΣΑΝ να ήρθε από τη
//  Google, στον ίδιο ακριβώς handler. Και η οθόνη διαβάζεται πίσω με
//  `registration.getNotifications()`, που επιστρέφει ό,τι πραγματικά φαίνεται.
//
//  ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI: χρειάζεται ζωντανό server και browser. Τρέξε τοπικά:
//     npm run build && npm start        (σε άλλο τερματικό)
//     node scripts/e2e-push.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const B = process.env.E2E_BASE || 'http://localhost:3000'
const TAG = 'pos-daily'

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n) } }
const wait = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromePath(),
  args: ['--no-sandbox'],
})
const ctx = await browser.newContext()
await ctx.grantPermissions(['notifications'], { origin: B })
const page = await ctx.newPage()
await page.goto(B + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => navigator.serviceWorker.ready)

const cdp = await ctx.newCDPSession(page)
const found = []
cdp.on('ServiceWorker.workerRegistrationUpdated', e => found.push(...e.registrations))
await cdp.send('ServiceWorker.enable')
await wait(1500)
const reg = found.find(r => r.scopeURL.startsWith(B))
ok('ο service worker είναι εγγεγραμμένος', !!reg)
if (!reg) { await browser.close(); console.log('\nΕιδοποιήσεις — 0 πέρασαν, 1 απέτυχε'); process.exit(1) }

/** Παραδίδει μήνυμα σαν να ήρθε από την υπηρεσία push. */
const deliver = async data => {
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: B, registrationId: reg.registrationId, data })
  await wait(1200)
}
/** Ο,τι φαίνεται αυτή τη στιγμή στην οθόνη. */
const onScreen = () => page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready
  return (await r.getNotifications()).map(n => ({ title: n.title, body: n.body, tag: n.tag, data: n.data }))
})

// ── ΤΟ ΜΗΝΥΜΑ ΓΙΝΕΤΑΙ ΕΙΔΟΠΟΙΗΣΗ ──────────────────────────────────────────
{
  await deliver(JSON.stringify({ title: 'ΔΕΗ', body: 'Λήγει σήμερα, 87,45 €', url: '/dashboard' }))
  const [n, ...rest] = await onScreen()
  ok('η ειδοποίηση εμφανίστηκε', !!n)
  ok('και είναι μία, όχι δύο', rest.length === 0)
  ok('ο τίτλος λέει ΤΙ', n?.title === 'ΔΕΗ')
  ok('το σώμα λέει ΠΟΤΕ και ΠΟΣΟ, με ελληνικό κόμμα', n?.body === 'Λήγει σήμερα, 87,45 €')
  ok('το πάτημα ξέρει πού πάει', n?.data?.url === '/dashboard')
}

// ── Η ΝΕΑ ΑΝΤΙΚΑΘΙΣΤΑ ΤΗΝ ΠΑΛΙΑ ───────────────────────────────────────────
// Τηλέφωνο που έμεινε τρεις ημέρες κλειστό δεν πρέπει να δείξει τρεις σωρούς:
// η χθεσινή μιλούσε για προθεσμίες που ίσως πέρασαν.
{
  await deliver(JSON.stringify({ title: '2 προθεσμίες', body: 'ΔΕΗ σήμερα · Ενοίκιο αύριο', url: '/dashboard' }))
  const shown = await onScreen()
  ok('η δεύτερη ειδοποίηση δεν σωρεύεται', shown.length === 1)
  ok('και είναι η καινούργια', shown[0]?.title === '2 προθεσμίες')
  ok('με το ίδιο σημάδι αντικατάστασης', shown[0]?.tag === TAG)
}

// ── ΤΙΠΟΤΑ ΝΑ ΠΕΙΣ, ΤΙΠΟΤΑ ΔΕΝ ΔΕΙΧΝΕΙΣ ───────────────────────────────────
// Μια ειδοποίηση «PROPERWISE» χωρίς να λέει τι, ξοδεύει την προσοχή που θα
// χρειαστεί η επόμενη.
{
  const before = (await onScreen())[0]?.title
  await deliver('δεν είναι καν JSON')
  await deliver(JSON.stringify({ title: 'Μόνο τίτλος' }))
  await deliver(JSON.stringify({ body: 'Μόνο σώμα' }))
  const shown = await onScreen()
  ok('χαλασμένο ή μισό μήνυμα δεν εμφανίζει τίποτα', shown.length === 1 && shown[0]?.title === before)
}

// ── ΤΟ URL ΤΑΞΙΔΕΥΕΙ ΑΥΤΟΥΣΙΟ ΜΕΧΡΙ ΤΟ ΠΑΤΗΜΑ ─────────────────────────────
// ΤΙ ΔΕΝ ΑΠΟΔΕΙΚΝΥΕΙ ΑΥΤΟ ΤΟ ΣΕΝΑΡΙΟ, ΚΑΙ ΤΟ ΛΕΜΕ: ο έλεγχος προέλευσης ζει
// στον `notificationclick` του `public/sw.js`, και το πρωτόκολλο του Chrome δεν
// δίνει τρόπο να πατηθεί ειδοποίηση από κώδικα. Εδώ αποδεικνύεται μόνο ότι η
// διεύθυνση φυλάγεται ΩΣ ΕΧΕΙ — δηλαδή ότι ο έλεγχος έχει πάνω σε τι να κριθεί
// και ότι κανείς δεν την «καθαρίζει» σιωπηλά στον δρόμο.
{
  await deliver(JSON.stringify({ title: 'Ξένη', body: 'δοκιμή', url: 'https://example.com/evil' }))
  const n = (await onScreen())[0]
  ok('η ξένη διεύθυνση φτάνει αυτούσια στο πάτημα, για να κριθεί εκεί', n?.data?.url === 'https://example.com/evil')
  ok('και δεν σιγοδιορθώνεται σε δική μας', !String(n?.data?.url || '').startsWith(B))
}

await browser.close()
console.log(`\nΕιδοποιήσεις στη συσκευή — ${pass} πέρασαν, ${fail} απέτυχαν`)
if (fail) process.exit(1)
