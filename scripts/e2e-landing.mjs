#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΡΧΙΚΗ ΔΕΝ ΚΟΒΕΙ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΗΣ, ΚΑΙ ΟΙ ΣΤΗΛΕΣ ΣΤΟΙΧΙΖΟΝΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΕΛΕΓΧΟ. Για να μετριέται μια κίνηση σε
// «cqh», η κάρτα της σάρωσης έγινε δοχείο μεγέθους («container-type: size»).
// Η δήλωση περιορίζει ΚΑΙ ΤΟΥΣ ΔΥΟ άξονες: το ύψος έπαψε να βγαίνει από το
// περιεχόμενο, η κάρτα κατέρρευσε στο γέμισμά της και το «overflow: hidden»
// έκοψε περίοδο, κατανάλωση, ημερομηνία λήξης και πληρωτέο. Έμεινε ορατός
// μόνο ο τίτλος «Ρεύμα».
//
// Κανένας έλεγχος δεν το είδε: η μεταγλώττιση ήταν καθαρή, οι τύποι σωστοί,
// τα κείμενα υπήρχαν ΜΕΣΑ στο έγγραφο. Το μόνο που είχε αλλάξει ήταν πόσο
// ψηλό ήταν ένα κουτί και αυτό το βλέπει μόνο περιηγητής.
//
// ΓΙ' ΑΥΤΟ Ο ΕΛΕΓΧΟΣ ΕΙΝΑΙ ΓΕΝΙΚΟΣ, ΟΧΙ ΓΙΑ ΤΗ ΣΥΓΚΕΚΡΙΜΕΝΗ ΚΑΡΤΑ. Σαρώνει
// ΚΑΘΕ στοιχείο της σελίδας που κρύβει την υπερχείλισή του και ρωτά αν κόβει
// το ίδιο του το περιεχόμενο. Η ίδια δικλείδα πιάνει και κάθε επόμενο
// «container-type», κάθε σταθερό ύψος που δεν άντεξε ένα μακρύτερο κείμενο,
// κάθε πλέγμα με λάθος σειρές.
//
// ΤΡΕΧΕΙ ΜΕ ΖΩΝΤΑΝΟ SERVER:  npm run build && npx next start -p 3100
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pkg
try { pkg = require('playwright-core') }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2) }
const { chromium } = pkg

const BASE = process.env.E2E_BASE || 'http://localhost:3100'
const EXE = process.env.CHROME || chromePath()

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })

// ── Το μάτι του ελέγχου: ποιο κουτί κόβει ΟΡΑΤΟ ΚΕΙΜΕΝΟ ────────────────────
// ΓΙΑΤΙ ΜΕΤΡΑΕΙ ΚΕΙΜΕΝΟ ΚΑΙ ΟΧΙ «scrollHeight». Η πρώτη γραφή σύγκρινε
// scrollHeight με clientHeight και κατήγγειλε πέντε στοιχεία, από τα οποία
// κανένα δεν έκρυβε λέξη: η ατμόσφαιρα του φόντου, η διακοσμητική κορδέλα του
// υπολογιστή, το hero με τη θολούρα του και το `.sr-only` που ΕΙΝΑΙ ένα
// εικονοστοιχείο εξ ορισμού. Όλα τους υπερχειλίζουν με απολύτως τοποθετημένα
// διακοσμητικά, όχι με περιεχόμενο. Ένας φρουρός που φωνάζει πέντε φορές για
// το τίποτα σταματά να διαβάζεται μετά τη δεύτερη.
//
// Η ερώτηση που έχει σημασία είναι στενότερη: υπάρχει ΚΕΙΜΕΝΟ που ο αναγνώστης
// δεν μπορεί να δει; Ο έλεγχος βρίσκει τους κόμβους κειμένου, μετράει πού
// τελειώνει ο καθένας και τον συγκρίνει με το κάτω όριο του κουτιού.
//
// ΤΙ ΕΞΑΙΡΕΙΤΑΙ ΡΗΤΑ, ΚΑΙ ΓΙΑΤΙ: το `-webkit-line-clamp` είναι ΑΠΟΦΑΣΗ, όχι
// ατύχημα — κόβει επίτηδες και βάζει αποσιωπητικά ώστε ο αναγνώστης να ξέρει
// ότι υπάρχει συνέχεια. Το `.sr-only` και το `aria-hidden` δεν απευθύνονται στο
// μάτι. Οτιδήποτε άλλο κόβει κείμενο, το κόβει κατά λάθος.
const CLIP_PROBE = `(() => {
  const bad = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const boxes = new Map()
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (cs.overflowY !== 'hidden' && cs.overflowY !== 'clip') continue
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue
    if (el.closest('[aria-hidden="true"], .sr-only')) continue
    boxes.set(el, el.getBoundingClientRect().bottom)
  }
  if (!boxes.size) return bad
  const r = document.createRange()
  let n
  while ((n = walk.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue
    let host = null
    for (const el of boxes.keys()) if (el.contains(n)) { host = el; break }
    if (!host) continue
    r.selectNodeContents(n)
    const rects = [...r.getClientRects()]
    if (!rects.length) continue
    const low = Math.max(...rects.map(x => x.bottom))
    const over = Math.round(low - boxes.get(host))
    if (over > 2) {
      const id = typeof host.className === 'string' && host.className.trim()
        ? '.' + host.className.trim().split(/\\s+/).join('.') : host.tagName
      bad.push({ sel: id.slice(0, 70), over, h: Math.round(host.getBoundingClientRect().height), txt: n.nodeValue.trim().slice(0, 40) })
    }
  }
  return bad
})()`

for (const [w, h, label] of [[1440, 900, 'υπολογιστής 1440'], [820, 1180, 'ταμπλέτα 820'], [390, 844, 'κινητό 390']]) {
  console.log(`\n── ${label}`)
  const p = await browser.newPage({ viewport: { width: w, height: h } })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.emulateMedia({ reducedMotion: 'reduce' })
  // Το πλαίσιο των cookies σκεπάζει τμήμα της σελίδας και δεν είναι υπό έλεγχο εδώ.
  const accept = p.getByRole('button', { name: 'Το κατάλαβα' })
  if (await accept.count()) { await accept.click(); await p.waitForTimeout(300) }
  // Οι ενότητες αποκαλύπτονται με IntersectionObserver: χωρίς πέρασμα από όλη
  // τη σελίδα, τα μισά πάνελ δεν έχουν αποδοθεί ποτέ και ο έλεγχος θα ήταν κενός.
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
    window.scrollTo(0, 0)
  })
  await p.waitForTimeout(400)

  const clipped = await p.evaluate(CLIP_PROBE)
  ok(`κανένα κουτί δεν κόβει το περιεχόμενό του (${label})`, clipped.length === 0,
     clipped.map(c => `${c.sel} ύψος ${c.h}, κομμένα ${c.over}px («${c.txt}»)`).join(' · '))

  // ── Η κάρτα της σάρωσης δείχνει ΚΑΙ ΤΑ ΤΕΣΣΕΡΑ πεδία της ─────────────────
  // Ρητός έλεγχος πάνω από τον γενικό: η κάρτα ζει μέσα σε πάνελ που εναλλάσσεται,
  // και ένα κρυμμένο πάνελ δεν μετριέται από τη σάρωση υπερχείλισης.
  const scan = await p.evaluate(() => {
    const host = [...document.querySelectorAll('div')].find(d => /Μηνιαίος λογαριασμός/.test(d.textContent || '') && d.className.includes('lp-live'))
    if (!host) return null
    const r = host.getBoundingClientRect()
    const seen = ['Περίοδος', 'Κατανάλωση', 'Ημερομηνία λήξης', 'Πληρωτέο']
      .filter(t => [...host.querySelectorAll('span, div')].some(n => n.textContent === t && n.getBoundingClientRect().bottom <= r.bottom + 1))
    return { h: Math.round(r.height), seen: seen.length }
  })
  ok(`η κάρτα σάρωσης δείχνει τα 4 πεδία της (${label})`, scan !== null && scan.seen === 4 && scan.h > 140,
     scan === null ? 'δεν βρέθηκε η κάρτα' : `ύψος ${scan.h}, ορατά ${scan.seen}/4`)

  // ── Οι τρεις περιγραφές των πράξεων σε ΔΥΟ γραμμές ──────────────────────
  if (w >= 820) {
    const acts = await p.evaluate(() => [...document.querySelectorAll('[data-idx] p')].map(n => {
      const lh = parseFloat(getComputedStyle(n).lineHeight) || 24
      return Math.round(n.getBoundingClientRect().height / lh)
    }))
    ok(`οι περιγραφές των πράξεων μένουν σε 2 γραμμές (${label})`, acts.length > 0 && acts.every(a => a <= 2),
       `γραμμές ${JSON.stringify(acts)}`)
  }

  // ── Οι υπόλοιπες ερωτήσεις: ενιαία λίστα και δρόμος πίσω ────────────────
  const more = p.locator('details.lp-faq-more > summary')
  await more.scrollIntoViewIfNeeded()
  await more.click()
  await p.waitForTimeout(200)
  const faq = await p.evaluate(() => {
    const qs = [...document.querySelectorAll('#faq details.lp-faq:not(.lp-faq-more)')]
      .filter(n => n.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
    const sum = document.querySelector('details.lp-faq-more > summary')
    const sr = sum.getBoundingClientRect()
    return {
      count: qs.length,
      seam: Math.round(qs[5].getBoundingClientRect().top - qs[4].getBoundingClientRect().bottom),
      belowAll: sr.top >= qs[qs.length - 1].getBoundingClientRect().bottom - 1,
      // ΤΟ ΟΡΑΤΟ ΣΗΜΑ, ΟΧΙ ΟΛΟ ΤΟ textContent: το κουμπί κουβαλά και τα δύο
      // λεκτικά και το φύλλο στυλ κρύβει το ένα. Το textContent τα δίνει και τα
      // δύο κολλητά και ο έλεγχος θα κατηγορούσε σωστό κώδικα.
      label: [...sum.querySelectorAll('span')]
        .filter(sp => getComputedStyle(sp).display !== 'none' && !sp.className.includes('lp-plus'))
        .map(sp => sp.textContent.trim()).join(' '),
      visible: sr.height > 0,
    }
  })
  ok(`η λίστα ερωτήσεων μένει ενιαία (${label})`, faq.seam <= 2, `ραφή ${faq.seam}px`)
  ok(`το κουμπί κατεβαίνει κάτω από τις ${faq.count} ερωτήσεις (${label})`, faq.belowAll && faq.visible)
  ok(`και λέει πώς γυρνάς πίσω (${label})`, faq.label === 'Λιγότερες ερωτήσεις', `λέει «${faq.label}»`)

  // ── ΤΟ ΚΛΕΙΣΙΜΟ ΔΕΝ ΑΦΗΝΕΙ ΤΟΝ ΕΠΙΣΚΕΠΤΗ ΝΑ ΑΙΩΡΕΙΤΑΙ ───────────────────
  // Οι έξι κρυμμένες ερωτήσεις πιάνουν πάνω από μία οθόνη. Πριν, το native
  // <details> έκλεινε ΧΩΡΙΣ να κουνήσει το σκρολ: όποιος διάβαζε την
  // τελευταία ερώτηση και πατούσε «Λιγότερες ερωτήσεις» έμενε κρεμασμένος στο
  // κενό που άφησε το κείμενο που μόλις έφυγε, χωρίς σημείο αναφοράς στην
  // οθόνη. Προσομοιώνουμε ακριβώς αυτό: σκρολάρουμε στην τελευταία ερώτηση
  // πριν κλείσουμε.
  await p.locator('#faq details.lp-faq:not(.lp-faq-more)').last().scrollIntoViewIfNeeded()
  const beforeShut = await p.evaluate(() => {
    const r = document.getElementById('faq').getBoundingClientRect()
    return { scrollY: window.scrollY, faqTop: Math.round(r.top) }
  })
  await more.click()
  await p.waitForTimeout(700) // ολοκλήρωση του smooth scroll
  const afterShut = await p.evaluate(() => {
    const r = document.getElementById('faq').getBoundingClientRect()
    return {
      scrollY: window.scrollY, faqTop: Math.round(r.top),
      // Πόσο ΜΠΟΡΕΙ να κυλήσει η σελίδα συνολικά: χωρίς αυτό, ο έλεγχος δεν
      // ξεχωρίζει το «δεν πήγε» από το «δεν γίνεται να πάει άλλο».
      max: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    }
  })
  // ΤΟ ΜΕΤΡΟ ΕΙΝΑΙ Η ΚΟΡΥΦΗ ΤΗΣ ΕΝΟΤΗΤΑΣ, ΟΧΙ Η ΚΑΤΕΥΘΥΝΣΗ ΤΟΥ scrollY. Σε
  // στενότερες οθόνες η τελευταία ερώτηση δεν κάθεται πάντα στον πάτο του
  // παραθύρου όταν είναι ανοιχτή, οπότε το «πάει προς τα πάνω» δεν είναι
  // εγγυημένο — το «καταλήγει ΑΚΡΙΒΩΣ στην κορυφή της ενότητας» είναι.
  // ΟΤΑΝ Η ΣΕΛΙΔΑ ΤΕΛΕΙΩΝΕΙ, Η ΚΥΛΙΣΗ ΣΤΑΜΑΤΑ ΟΠΟΥ ΤΕΛΕΙΩΝΕΙ. Μετρημένο στα
  // 820 × 1180: μόλις κλείσουν οι έξι ερωτήσεις, κάτω από την ενότητα μένουν
  // 1172 εικονοστοιχεία, δηλαδή λιγότερα από ένα παράθυρο. Ο περιηγητής
  // κατεβάζει τη σελίδα ώς τον πάτο της (scrollY 8721 = max 8721) και η κορυφή
  // της ενότητας σταματά στα 8. Δεν είναι αστοχία της κύλισης: είναι το τέλος
  // του εγγράφου και καμία υλοποίηση δεν μπορεί να πάει παρακάτω.
  //
  // Ο παλιός ισχυρισμός ζητούσε |faqTop| <= 4 πάντα, δηλαδή κάτι ανέφικτο σε
  // αυτό το παράθυρο και κοκκίνιζε μόνιμα σε σωστό κώδικα. Τώρα λέει αυτό που
  // πραγματικά εννοεί: η ενότητα ανεβαίνει στην κορυφή — ή, αν η σελίδα έχει
  // τελειώσει, όσο ψηλά την αφήνει το τέλος της και πάντα ορατή.
  const atBottom = afterShut.scrollY >= afterShut.max - 1
  const landed = atBottom
    ? afterShut.faqTop >= 0 && afterShut.faqTop <= 40
    : Math.abs(afterShut.faqTop) <= 4
  ok(`το κλείσιμο ξαναδείχνει την κορυφή της ενότητας (${label})`,
     landed && Math.abs(beforeShut.faqTop) > 40,
     `πριν κορυφή FAQ σε ${beforeShut.faqTop}px (scrollY ${beforeShut.scrollY}), μετά σε ${afterShut.faqTop}px ` +
     `(scrollY ${afterShut.scrollY}${atBottom ? ` = πάτος ${afterShut.max}` : `, από ${afterShut.max}`})`)
  // Επαναφορά, ώστε ο έλεγχος που ακολουθεί να ξεκινά ανοιχτό.
  await more.click()
  await p.waitForTimeout(200)

  // Και κλείνει πραγματικά.
  await more.click()
  await p.waitForTimeout(200)
  // ΓΙΑΤΙ `checkVisibility` ΚΑΙ ΟΧΙ ΜΕΤΡΗΜΑ ΚΟΜΒΩΝ Η ΥΨΟΥΣ. Ένα κλειστό <details>
  // ΔΕΝ βγάζει τα παιδιά του από το έγγραφο: ο Chrome τα κρύβει με
  // «content-visibility» πάνω στο ::details-content, οπότε συνεχίζουν να έχουν
  // κουτί 62 εικονοστοιχείων. Και το querySelectorAll και το getBoundingClientRect
  // απαντούν «έντεκα ορατές» σε λίστα που δείχνει πέντε.
  const shut = await p.evaluate(() => [...document.querySelectorAll('#faq details.lp-faq:not(.lp-faq-more)')]
    .filter(n => n.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })).length)
  ok(`κλείνοντας επιστρέφουν οι 5 ερωτήσεις (${label})`, shut === 5, `έμειναν ${shut}`)

  await p.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΙΚΟΝΑ ΤΟΥ ΠΡΟΪΟΝΤΟΣ ΔΙΑΒΑΖΕΤΑΙ ΣΕ ΚΑΘΕ LAPTOP
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΠΡΙΝ. Το πλαίσιο της ιστορίας μένει ~505px σε ΚΑΘΕ laptop
// (1280, 1366, 1440, 1512, 1680, 1920), αλλά η σειρά των δεικτών από μέσα του
// έχει 273: το πλευρικό μενού τρώει 150 και τα γεμίσματα άλλα 76. Τρία
// πλακίδια των 84 με ετικέτες που θέλουν 60, 84 και 75 σημαίνει ότι κόβονταν
// ΚΑΙ ΤΑ ΤΡΙΑ, στην πρώτη εικόνα του προϊόντος. Και το «92%» έβγαινε 7px έξω.
//
// ΚΑΙ ΓΙΑΤΙ ΜΕΤΡΙΟΥΝΤΑΙ ΓΡΑΜΜΕΣ ΚΑΙ ΟΧΙ ΜΟΝΟ ΚΟΨΙΜΟ. Η πρώτη διόρθωση έβαλε
// «overflow-wrap: anywhere»: τίποτα δεν κοβόταν πια, η μέτρηση έβγαινε πράσινη
// και η ετικέτα αποδιδόταν με ΕΝΑ ΓΡΑΜΜΑ ΑΝΑ ΣΕΙΡΑ. Ενας έλεγχος που ρωτά
// μόνο «κόπηκε;» δεν βλέπει το «διαβάζεται;».
for (const w of [390, 430, 768, 820, 1024, 1280, 1366, 1440, 1512, 1920]) {
  const p = await browser.newPage()
  await p.setViewportSize({ width: w, height: 900 })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const r = await p.evaluate(() => {
    const frame = document.querySelector('.story-frame')
    if (!frame) return null   // κάτω από 900 το πλαίσιο δεν αποδίδεται
    const bad = []
    // ΤΟ ΨΑΛΙΔΙ ΔΕΝ ΕΙΝΑΙ ΠΑΝΤΑ ΤΟ ΠΛΑΙΣΙΟ, ΚΑΙ ΕΤΣΙ ΗΤΑΝ ΓΡΑΜΜΕΝΟΣ ΠΡΩΤΑ Ο
    // ΕΛΕΓΧΟΣ. Συνέκρινε κάθε στοιχείο με το πλαίσιο και με το `scrollWidth`
    // του ίδιου του στοιχείου. Η ετικέτα όμως ΔΕΝ κόβεται μόνη της: κόβεται από
    // το πλακίδιο που την περιέχει, που έχει «overflow: hidden». Το κείμενο
    // έβγαινε 12px έξω από το πλακίδιο, έμενε μέσα στο πλαίσιο· ο έλεγχος
    // έβγαινε πράσινος με το σφάλμα ζωντανό. Τώρα ρωτά τον ΠΛΗΣΙΕΣΤΕΡΟ πρόγονο
    // που όντως κόβει.
    const clipperOf = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n)
        if (/hidden|auto|scroll|clip/.test(cs.overflowX) || /hidden|auto|scroll|clip/.test(cs.overflowY)) return n
        if (n === frame) return frame
      }
      return frame
    }
    for (const el of frame.querySelectorAll('*')) {
      const b = el.getBoundingClientRect()
      if (b.width < 1 || b.height < 1) continue
      const t = (el.textContent || '').trim()
      if (!t || el.children.length > 0) continue
      const box = clipperOf(el).getBoundingClientRect()
      if (b.right > box.right + 1 || b.left < box.left - 1)
        bad.push(`κομμένο «${t.slice(0, 18)}» κατά ${Math.round(Math.max(b.right - box.right, box.left - b.left))}px`)
      // Πόσες σειρές πιάνει το κείμενο. Πάνω από τρεις για μια ετικέτα ή έναν
      // αριθμό σημαίνει ότι η λέξη σπάει, όχι ότι τυλίγεται.
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 16
      const lines = Math.round(b.height / lh)
      if (lines > 3) bad.push(`${lines} σειρές για «${t.slice(0, 18)}»`)
    }
    return { bad: [...new Set(bad)] }
  })
  ok(`η εικόνα του προϊόντος διαβάζεται στα ${w}`, !r || r.bad.length === 0, r ? r.bad.slice(0, 3).join(' · ') : '')
  await p.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΣ ΠΑΚΕΤΟΥ ΖΥΓΙΖΟΥΝ ΣΕ ΚΑΘΕ ΠΛΑΤΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΠΡΙΝ (πραγματικό Chromium, Αύγουστος 2026):
//
//   861 ώς 1020  τρεις στήλες για τέσσερα πακέτα, δηλαδή 3+1. Στα 900: ύψη
//                450/450/450/376, το κουμπί του τέταρτου 388px πιο κάτω από
//                των άλλων και η τιμή του 463px πιο κάτω.
//   ώς 860       το καρουζέλ ήταν «display: flex», που σβήνει το subgrid των
//                καρτών. Ισοϋψείς κάρτες με ΤΙΠΟΤΑ στοιχισμένο μέσα τους: η
//                τιμή ξεκινούσε 28px πιο κάτω σε άλλο πακέτο απ' ό,τι σε άλλο,
//                γιατί η υπότιτλη φράση σπάει σε δύο σειρές μόνο σε μερικά.
//
// Η ΣΥΓΚΡΙΣΗ ΓΙΝΕΤΑΙ ΑΝΑ ΣΕΙΡΑ ΚΑΡΤΩΝ. Σε διάταξη 2+2 οι δύο σειρές έχουν
// φυσιολογικά άλλο ύψος στη σελίδα και τις χωρίζει κενό: ένας έλεγχος που
// συνέκρινε και τις τέσσερις μαζί θα κοκκίνιζε σε σωστή διάταξη.
const PLAN_WIDTHS = [390, 430, 768, 820, 834, 860, 900, 960, 1020, 1024, 1112, 1180, 1280, 1440]
for (const w of PLAN_WIDTHS) {
  const p = await browser.newPage()
  await p.setViewportSize({ width: w, height: 1000 })
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const r = await p.evaluate(() => {
    const g = document.querySelector('.lp-plans')
    if (!g) return null
    const rows = new Map()
    for (const c of g.children) {
      const b = c.getBoundingClientRect()
      const cta = c.querySelector('a[href*="cycle=monthly"]')?.getBoundingClientRect()
      const ann = c.querySelector('a[href*="cycle=annual"]')?.getBoundingClientRect()
      const price = c.querySelector('[style*="tabular-nums"]')?.getBoundingClientRect()
      const key = Math.round(b.top)
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push({ h: b.height, cta: cta?.top ?? 0, ann: ann?.bottom ?? 0, price: price?.top ?? 0 })
    }
    const spread = a => Math.max(...a) - Math.min(...a)
    let worst = 0, what = ''
    for (const [, cs] of rows) {
      for (const [name, get] of [['ύψος', c => c.h], ['τιμή', c => c.price], ['κουμπί', c => c.cta], ['κάτω άκρο', c => c.ann]]) {
        const d = spread(cs.map(get))
        if (d > worst) { worst = d; what = name }
      }
    }
    return { per: [...rows.values()].map(cs => cs.length), rows: rows.size, worst: Math.round(worst), what }
  })
  ok(`τα πακέτα ζυγίζουν στα ${w} (${r?.rows} ${r?.rows === 1 ? 'σειρά' : 'σειρές'})`,
    !!r && r.worst <= 1, r ? `${r.what} ${r.worst}px` : 'δεν βρέθηκαν κάρτες')
  // ΚΑΜΙΑ ΟΡΦΑΝΗ ΚΑΡΤΑ. Τέσσερα πακέτα σε τρεις στήλες αφήνουν ένα μόνο του
  // από κάτω, με μισή σειρά κενή δίπλα του: η σκάλα των τιμών σπάει στη μέση.
  //
  // ΤΟ «ΤΕΛΕΙΑ ΔΙΑΙΡΕΣΗ» ΕΙΝΑΙ ΚΕΝΟΣ ΕΛΕΓΧΟΣ, ΚΑΙ ΕΤΣΙ ΗΤΑΝ ΓΡΑΜΜΕΝΟΣ ΠΡΩΤΑ:
  // τέσσερις κάρτες σε δύο σειρές διαιρούνται τέλεια είτε είναι 2+2 είτε 3+1.
  // Και η στοίχιση ΑΝΑ ΣΕΙΡΑ βγαίνει κι αυτή τέλεια στο 3+1, γιατί η μοναχική
  // κάρτα δεν έχει με ποια να συγκριθεί. Ο έλεγχος πέρασε πράσινος με το
  // σφάλμα ζωντανό· τώρα ζητά ΙΣΕΣ σειρές, που είναι το πραγματικό ζητούμενο.
  ok(`και καμία σειρά δεν μένει μισή στα ${w}`, !!r && new Set(r.per).size === 1,
    r ? `σειρές ${r.per.join('+')}` : '')
  await p.close()
}

await browser.close()
console.log(`\nΑρχική σελίδα — ${pass} πέρασαν, ${fail} απέτυχαν`)
process.exit(fail ? 1 : 0)
