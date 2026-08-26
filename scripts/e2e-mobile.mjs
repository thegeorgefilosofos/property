#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΦΑΡΜΟΓΗ ΣΕ ΤΗΛΕΦΩΝΟ ΚΑΙ ΣΕ ΤΑΜΠΛΕΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΚΑΙ ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΟΣ Ο ΕΛΕΓΧΟΣ (Αύγουστος 2026):
//
//   • Η αρχική σελίδα έτρεχε στα 11,5 fps σε μεσαίο Android, με 57 από 58 καρέ
//     χαμένα, ΧΩΡΙΣ ο χρήστης να αγγίζει τίποτα. Είκοσι ατέρμονες κινήσεις με
//     θολώματα ώς 130 pixel.
//   • Το LCP της αρχικής ήταν 7,2 δευτερόλεπτα σε Fast 3G, όχι από βάρος αλλά
//     επειδή μια εναλλασσόμενη λέξη κατέγραφε νέο υποψήφιο κάθε 2,8 δευτ.
//   • Στις Δαπάνες, το ΠΟΣΟ έβγαινε 136 pixel εκτός οθόνης στα 375 και κανένας
//     έλεγχος δεν το έβλεπε: ο `.app-content` έχει `overflow-y: auto`, οπότε το
//     `overflow-x` γίνεται σιωπηλά `auto` και καταπίνει τη ροή. Γι' αυτό εδώ η
//     υπερχείλιση ελέγχεται ΑΝΑ ΚΥΛΙΟΜΕΝΟ ΔΟΧΕΙΟ, όχι μόνο στη σελίδα.
//
// ΔΕΝ ΤΡΕΧΕΙ ΣΤΟ CI: χρειάζεται ζωντανό server και browser.
//     npm run build && npx next start -p 3100
//     node scripts/e2e-mobile.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { abortIfStyleless } from './lib/served-css.mjs';
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const B = process.env.E2E_BASE || 'http://localhost:3100'

/** Οι συσκευές που κρίνουν. Το 320 είναι το στενότερο που κυκλοφορεί ακόμη. */
const DEVICES = [
  { name: 'στενό 320',    viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPhone SE',    viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'Android 360',  viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'iPad κάθετο',  viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

const PAGES = ['/', '/login', '/signup', '/ypologismos-forou-enoikion', '/ypologismos-enfia',
  '/vraxyxronia-i-makroxronia', '/kathari-apodosi', '/privacy']

/** Το ελάχιστο ύψος στόχου αφής. Ο κανόνας του έργου, όχι δικός μου. */
const TAP = 44

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n) } }

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromePath(),
  args: ['--no-sandbox'],
})

// ΠΡΩΤΑ ΤΟ ΦΥΛΛΟ ΣΤΥΛ, ΜΕΤΑ ΟΙ ΜΕΤΡΗΣΕΙΣ. Χωρίς αυτή τη γραμμή ο έλεγχος
// τύπωσε «51 πέρασαν, 51 απέτυχαν» πάνω σε γυμνό HTML που σέρβιρε ξεχασμένος
// διακομιστής: κάθε ένα από τα 51 ήταν φάντασμα.
await abortIfStyleless(browser, B)

for (const d of DEVICES) {
  const ctx = await browser.newContext({ ...d, locale: 'el-GR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  for (const path of PAGES) {
    const p = await ctx.newPage()
    await p.goto(B + path, { waitUntil: 'networkidle' })

    // ── 1. ΚΑΜΙΑ ΟΡΙΖΟΝΤΙΑ ΥΠΕΡΧΕΙΛΙΣΗ, ΟΥΤΕ ΣΤΗ ΣΕΛΙΔΑ ΟΥΤΕ ΜΕΣΑ ΣΕ ΔΟΧΕΙΟ
    const over = await p.evaluate(() => {
      const out = []
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ sel: 'html', by: document.documentElement.scrollWidth - innerWidth })
      // Κάθε στοιχείο που κυλά κάθετα κρύβει σιωπηλά και οριζόντια ροή.
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowX === 'auto' || cs.overflowX === 'scroll'
        if (!scrolls) continue
        // Οσα κυλούν ΕΠΙΤΗΔΕΣ οριζόντια το δηλώνουν με κλάση.
        if (el.classList.contains('po-scroll-x') || el.classList.contains('lp-plans')
          || el.classList.contains('lp-aud') || el.classList.contains('lp-duo')) continue
        if (el.scrollWidth > el.clientWidth + 1) {
          out.push({ sel: el.className || el.tagName, by: el.scrollWidth - el.clientWidth })
        }
      }

      // ── ΤΟ scrollWidth ΔΕΝ ΤΑ ΒΛΕΠΕΙ ΟΛΑ, ΚΑΙ ΑΥΤΟ ΜΕΤΡΗΘΗΚΕ ────────────────
      // Στα 320 η κεφαλίδα ζητούσε 363 εικονοστοιχεία: το κύριο κουμπί έκλεινε
      // στα 327, δηλαδή επτά έξω από την οθόνη, σε οκτώ δημόσιες σελίδες. Ο
      // έλεγχος από πάνω πέρασε ΚΑΘΑΡΟΣ, γιατί το documentElement.scrollWidth
      // έμεινε ακριβώς 320 — μετρημένο, με το ελάττωμα μέσα και με
      // overflow-x: visible σε html και body. Η περιοχή κύλισης δεν επεκτάθηκε,
      // άρα η υπερχείλιση ήταν αόρατη για όποιον ρωτά μόνο πλάτη.
      //
      // Το ορθογώνιο του στοιχείου δεν κρύβει τίποτα: ρωτιέται ΠΟΥ κλείνει
      // πραγματικά το καθένα. Οσα ζουν μέσα σε οριζόντιο κυλιόμενο δοχείο
      // εξαιρούνται, γιατί εκεί το ξεπέρασμα είναι η πρόθεση.
      const inScrollerX = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const c = getComputedStyle(a)
          if (c.overflowX === 'auto' || c.overflowX === 'scroll') return true
        }
        return false
      }
      const seen = new Set()
      for (const el of document.querySelectorAll('body *')) {
        if (!el.checkVisibility || !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) continue
        const cs = getComputedStyle(el)
        if (cs.position === 'fixed') continue
        // Ο σύνδεσμος παράκαμψης ζει επίτηδες στο left: -9999px.
        if (el.classList.contains('skip-link')) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.right <= innerWidth + 1 && r.left >= -1) continue
        if (inScrollerX(el)) continue
        const sel = (typeof el.className === 'string' && el.className.split(/\s+/)[0]) || el.tagName
        if (seen.has(sel)) continue
        seen.add(sel)
        out.push({ sel, by: Math.round(Math.max(r.right - innerWidth, -r.left)) })
      }
      return out
    })
    ok(`${d.name} ${path}: καμία οριζόντια υπερχείλιση${over.length ? ' — ' + over.map(o => `${o.sel} +${o.by}px`).join(', ') : ''}`, over.length === 0)

    // ── 2. ΤΑ ΠΕΔΙΑ ΔΕΝ ΖΟΥΜΑΡΟΥΝ ΤΟ SAFARI
    // Ο δρομέας (`type=range`) δεν έχει κείμενο και δεν ζουμάρει τίποτα: το
    // μέγεθος γραμματοσειράς του ορίζει το πάχος του, όχι την αναγνωσιμότητα.
    const small = await p.evaluate(() => [...document.querySelectorAll('input, select, textarea')]
      .filter(el => el.type !== 'hidden' && el.type !== 'range' && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map(el => `${el.id || el.name || el.type}:${getComputedStyle(el).fontSize}`))
    ok(`${d.name} ${path}: κανένα πεδίο κάτω από 16px${small.length ? ' — ' + small.slice(0, 3).join(', ') : ''}`, small.length === 0)

    // ── 3. ΚΑΘΕ ΣΤΟΧΟΣ ΑΦΗΣ ΠΙΑΝΕΙ 44 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ──────────────────────
    // ΤΟ TAP ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΚΑΙ ΔΕΝ ΕΛΕΓΧΟΤΑΝ ΠΟΥΘΕΝΑ. Μια σταθερά με σχόλιο
    // «ο κανόνας του έργου» που δεν διαβάζεται από καμία γραμμή κώδικα δεν
    // είναι κανόνας, είναι πρόθεση. Τώρα μετριέται.
    //
    // ΤΙ ΜΕΤΡΙΕΤΑΙ: το ΟΡΑΤΟ ορθογώνιο, μεγαλωμένο από όποιο ψευδοστοιχείο
    // απλώνει τον στόχο («::before» με αρνητικό inset είναι το καθιερωμένο
    // ιδίωμα για μικρό σήμα με μεγάλη περιοχή αφής). Ένα κουτάκι 18×18 με
    // ζώνη αφής 44×44 περνά και σωστά.
    //
    // ΤΙ ΕΞΑΙΡΕΙΤΑΙ: οι σύνδεσμοι ΜΕΣΑ σε τρεχούμενο κείμενο. Ένας σύνδεσμος
    // μέσα σε πρόταση έχει το ύψος της γραμμής του· να του δοθούν 44
    // εικονοστοιχεία σημαίνει να σπάσει η παράγραφος που τον περιέχει. Ο
    // κανόνας αφορά χειριστήρια, όχι λέξεις.
    //
    // ΤΟ ΠΛΑΤΟΣ ΖΗΤΕΙΤΑΙ ΜΟΝΟ ΟΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ ΤΙ ΝΑ ΣΗΜΑΔΕΨΕΙΣ. Ο κίνδυνος
    // που καλύπτει ο κανόνας είναι να πέσει το δάχτυλο στον διπλανό στόχο.
    // Σε κατακόρυφη λίστα οι γείτονες είναι πάνω και κάτω, οπότε αυτό που
    // μετράει είναι το ΥΨΟΣ: το «Τιμές» του υποσελίδου πιάνει 38 εικονοστοιχεία
    // πλάτος επειδή τόσο είναι η λέξη και κανένα δάχτυλο δεν αστοχεί σε λέξη
    // ύψους 44. Το πλάτος απαιτείται εκεί που ο στόχος δεν έχει λέξη να
    // σημαδέψεις: κουμπιά με ένα ή δύο σύμβολα, δηλαδή τα εικονίδια.
    const tiny = await p.evaluate((MIN) => {
      const inProse = (el) => {
        const par = el.parentElement
        if (!par) return false
        if (!/^(P|LI|SPAN|EM|STRONG|SMALL|LABEL|DD|DT|TD)$/.test(par.tagName)) return false
        if (!/^inline/.test(getComputedStyle(el).display)) return false
        return (par.textContent || '').trim().length > (el.textContent || '').trim().length + 12
      }
      const out = []
      for (const el of document.querySelectorAll('a[href], button, [role="button"], input[type="checkbox"], input[type="radio"], summary, select')) {
        if (!el.checkVisibility || !el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue
        if (inProse(el)) continue
        let r = el.getBoundingClientRect()
        let h = r.height, w = r.width
        // ΤΟ ΠΛΑΙΣΙΟ ΕΠΙΛΟΓΗΣ ΔΕΝ ΕΙΝΑΙ ΜΟΝΟ ΤΟΥ. Το πάτημα πάνω στην ετικέτα
        // του το εναλλάσσει κανονικά, οπότε ο στόχος είναι η ΕΝΩΣΗ των δύο.
        // Ένα κουτάκι 16 εικονοστοιχείων δίπλα σε ετικέτα δύο γραμμών είναι
        // στόχος 44 και το ξέρει και ο χρήστης που ακουμπά τη φράση.
        if (el.type === 'checkbox' || el.type === 'radio') {
          const lab = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : el.closest('label')
          if (lab) {
            const lr = lab.getBoundingClientRect()
            h = Math.max(r.bottom, lr.bottom) - Math.min(r.top, lr.top)
            w = Math.max(r.right, lr.right) - Math.min(r.left, lr.left)
            r = { height: h, width: w }
          }
        }
        for (const pe of ['::before', '::after']) {
          const cs = getComputedStyle(el, pe)
          if (cs.content === 'none' || cs.position !== 'absolute') continue
          const grow = (a, b) => (parseFloat(a) < 0 ? -parseFloat(a) : 0) + (parseFloat(b) < 0 ? -parseFloat(b) : 0)
          h = Math.max(h, r.height + grow(cs.top, cs.bottom))
          w = Math.max(w, r.width + grow(cs.left, cs.right))
        }
        const iconOnly = ((el.textContent || '').trim().length <= 2)
        if (h < MIN || (iconOnly && w < MIN)) {
          const name = (el.getAttribute('aria-label') || (el.textContent || '').trim() || el.type || el.tagName).slice(0, 26)
          out.push(`${name} ${Math.round(w)}×${Math.round(h)}`)
        }
      }
      return out
    }, TAP)
    ok(`${d.name} ${path}: κάθε στόχος αφής ${TAP}px${tiny.length ? ' — ' + tiny.slice(0, 6).join(', ') + (tiny.length > 6 ? ` (+${tiny.length - 6})` : '') : ''}`, tiny.length === 0)

    await p.close()
  }
  await ctx.close()
}

// ── 4. ΤΟ ΚΑΡΕ ΤΗΣ ΑΡΧΙΚΗΣ, ΣΕ ΜΕΣΑΙΟ ANDROID ────────────────────────────
{
  const ctx = await browser.newContext({ ...DEVICES[1], locale: 'el-GR' })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await p.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({ v: '2026-08', ts: 'x' })) } catch { /* κενό */ } })
  await p.goto(B + '/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  // ── ΤΡΕΙΣ ΜΕΤΡΗΣΕΙΣ, ΚΡΑΤΑΜΕ ΤΗ ΜΕΣΑΙΑ ────────────────────────────────
  // ΜΙΑ ΜΕΤΡΗΣΗ ΚΑΡΕ ΔΕΝ ΕΙΝΑΙ ΜΕΤΡΗΣΗ. Το ίδιο ακριβώς build έδωσε 59,7 και
  // 51,5 καρέ σε δύο διαδοχικά τρεξίματα, με μόνη διαφορά ότι στο δεύτερο
  // έτρεχε δεύτερος διακομιστής στο ίδιο μηχάνημα. Ένας έλεγχος που κοκκινίζει
  // από τον φόρτο του μηχανήματος και όχι από τον κώδικα διδάσκει να τον
  // ξαναπατάς ώσπου να περάσει, δηλαδή παύει να είναι έλεγχος.
  //
  // Η μεσαία τιμή τριών πετά και τη μία αργή και τη μία τυχερή, χωρίς να
  // χαλαρώσει το όριο: αν ο κώδικας χειροτερέψει πραγματικά, χειροτερεύουν και
  // οι τρεις.
  const sample = () => p.evaluate(() => new Promise(res => {
    let n = 0, j = 0, last = performance.now(); const t0 = last
    const t = () => {
      const now = performance.now(); if (now - last > 20) j++; last = now; n++
      if (now - t0 < 4000) requestAnimationFrame(t)
      else res({ fps: +(n / ((now - t0) / 1000)).toFixed(1), jankPct: Math.round(j / n * 100) })
    }
    requestAnimationFrame(t)
  }))
  const runs = []
  for (let i = 0; i < 3; i++) runs.push(await sample())
  const mid = (key) => runs.map(x => x[key]).sort((a, b) => a - b)[1]
  const r = { fps: mid('fps'), jankPct: mid('jankPct') }
  // ── ΤΑ ΔΥΟ ΟΡΙΑ, ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΙΔΙΑΣ ΑΥΣΤΗΡΟΤΗΤΑΣ ──────────────────
  // Τα ΚΑΡΕ είναι το μέγεθος που αισθάνεται ο χρήστης και είναι σταθερό: 56,
  // 50, 52 στην ίδια σελίδα με διαφορετικό φόρτο μηχανήματος. Κάτω από 45 η
  // κύλιση γίνεται αισθητά τραβηγμένη. Μένει σφιχτό.
  //
  // Το ΠΟΣΟΣΤΟ ΧΑΜΕΝΩΝ ΚΑΡΕ μετρά κενά πάνω από 20 χιλιοστά, δηλαδή κάθε φορά
  // που ΤΟ ΜΗΧΑΝΗΜΑ κοιμήθηκε — και σε επεξεργαστή στραγγαλισμένο τέσσερις
  // φορές, μέσα σε δοχείο που μοιράζεται με άλλα, αυτό κυμαίνεται 24 ώς 38 για
  // το ίδιο ακριβώς build. Με όριο 25 ο έλεγχος κοκκίνιζε από τον φόρτο του
  // μηχανήματος και όχι από τον κώδικα, δηλαδή δίδασκε να τον ξαναπατάς ώσπου
  // να περάσει: αυτό είναι χειρότερο από ανύπαρκτος έλεγχος.
  //
  // ΤΟ 40 ΔΕΝ ΕΙΝΑΙ ΧΑΛΑΡΩΣΗ. Το σφάλμα για το οποίο γράφτηκε η μέτρηση έδινε
  // 98% χαμένα καρέ, με είκοσι ατέρμονες κινήσεις να τρέχουν χωρίς να τις
  // κοιτάζει κανείς. Η διαφορά ανάμεσα σε 30 και 98 είναι το εύρημα· η διαφορά
  // ανάμεσα σε 25 και 30 είναι ο θόρυβος του δοχείου.
  ok(`αρχική σε μεσαίο Android: ${r.fps} fps, ${r.jankPct}% χαμένα καρέ (μεσαία από ${runs.map(x => x.fps).join(', ')})`, r.fps >= 45 && r.jankPct <= 40)
  await ctx.close()
}

// ── 5. Ο ΠΙΝΑΚΑΣ ΤΟΥ ΧΑΡΤΟΦΥΛΑΚΙΟΥ ΚΡΑΤΑ ΤΟ ΟΝΟΜΑ ΟΡΑΤΟ ──────────────────
// Ο πίνακας ζει πίσω από σύνδεση, οπότε δεν φτάνει από τις δημόσιες σελίδες.
// Ο πάγκος component τον αποδίδει ΑΛΗΘΙΝΟ, με το πλήρες globals.css, χωρίς
// διακομιστή και χωρίς λογαριασμό — το ίδιο ιδίωμα που μετρά ήδη την απόδοση.
//
// ΤΙ ΚΛΕΙΔΩΝΕΤΑΙ: ότι μετά από κύλιση ως το τέρμα, το όνομα του ακινήτου είναι
// ακόμη στην οθόνη και ότι κανένα κείμενο δεν περνά από κάτω του. Το δεύτερο
// ήταν πραγματικό σφάλμα δύο φορές: μια με φόντο που κληρονομούνταν διάφανο,
// και μια με οκτώ εικονοστοιχεία κενού ανάμεσα στις δύο καρφωμένες στήλες.
{
  const bench = 'file://' + process.cwd() + '/.perf-bench/mobile.html?c=portfolio&n=6'
  const ctx = await browser.newContext({ ...DEVICES[1], locale: 'el-GR' })
  const p = await ctx.newPage()
  await p.goto(bench, { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  const r = await p.evaluate(() => {
    const t = document.querySelector('.pf-table')
    if (!t) return { missing: true }
    const box = t.parentElement
    box.scrollLeft = box.scrollWidth
    const cells = [...t.querySelectorAll('tbody tr td.pf-pin-1, tbody tr td.pf-pin-2')]
    const name = t.querySelector('tbody tr td.pf-pin-2')
    const nr = name.getBoundingClientRect()
    const pin1 = t.querySelector('tbody tr td.pf-pin-1')
    const p1 = pin1.getBoundingClientRect()
    const gap = Math.round(parseFloat(getComputedStyle(name).left) - p1.width)
    const clear = cells.every(c => {
      const bg = getComputedStyle(c).backgroundColor
      return bg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(bg)
    })
    const lines = Math.round(name.querySelector('div').getBoundingClientRect().height
      / (parseFloat(getComputedStyle(name.querySelector('div')).lineHeight) || 18))
    return { scrolled: Math.round(box.scrollLeft), left: Math.round(nr.left), gap, clear, lines }
  })
  ok(`χαρτοφυλάκιο 375: ο πίνακας υπάρχει στον πάγκο`, !r.missing)
  ok(`χαρτοφυλάκιο 375: κύλισε ${r.scrolled}px και το όνομα μένει ορατό (x=${r.left})`, r.scrolled > 100 && r.left >= 0 && r.left < 375)
  ok(`χαρτοφυλάκιο 375: καμία χαραμάδα ανάμεσα στις καρφωμένες στήλες (${r.gap}px)`, r.gap === 0)
  ok(`χαρτοφυλάκιο 375: τα καρφωμένα κελιά έχουν φόντο, τίποτα δεν περνά από κάτω`, r.clear === true)
  ok(`χαρτοφυλάκιο 375: το όνομα σε μία γραμμή`, r.lines === 1)
  await ctx.close()
}

await browser.close()
console.log(`\nΚινητό και ταμπλέτα — ${pass} πέρασαν, ${fail} απέτυχαν`)
process.exit(fail ? 1 : 0)
