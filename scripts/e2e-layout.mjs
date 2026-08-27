#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΙΠΟΤΑ ΚΟΜΜΕΝΟ, ΤΙΠΟΤΑ ΠΑΝΩ ΣΤΟ ΑΛΛΟ, ΤΙΠΟΤΑ ΕΞΩ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Η εφαρμογή είχε ελέγχους για οριζόντια κύλιση σελίδας,
// για στόχους αφής και για ύψη πλακιδίων. Κανένας δεν ρωτούσε το απλούστερο
// πράγμα που βλέπει ο άνθρωπος: ΔΙΑΒΑΖΕΤΑΙ ΤΟ ΚΕΙΜΕΝΟ; Και τα δύο σφάλματα
// που ανέφερε ο χρήστης ήταν ακριβώς αυτό: ετικέτες κομμένες στη μέση στην
// εικόνα του προϊόντος, πίνακας που πήγαινε πέρα δώθε.
//
// ΤΕΣΣΕΡΑ ΕΡΩΤΗΜΑΤΑ, ΣΕ 9 ΟΘΟΝΕΣ ΠΙΝΑΚΑ ΕΛΕΓΧΟΥ ΚΑΙ 9 ΔΗΜΟΣΙΕΣ, ΣΕ 6 ΠΛΑΤΗ:
//   • κόβεται κείμενο από το κουτί που το κρύβει;
//   • ξεφεύγει από τον πλησιέστερο πρόγονο που ΟΝΤΩΣ κόβει;
//   • σπάει η λέξη σε περισσότερες σειρές απ' όσες λέξεις έχει;
//   • πέφτει κείμενο ΠΑΝΩ σε άλλο, μέσα στην ίδια γραμμή διάταξης;
//   • υπάρχει στόχος αφής κάτω από 44 σε συσκευή αφής;
//
// ── ΠΕΝΤΕ ΦΟΡΕΣ ΕΒΓΑΛΕ ΨΕΥΔΗ ΕΥΡΗΜΑΤΑ, ΚΑΙ ΚΑΘΕ ΦΟΡΑ ΤΟ ΨΕΥΔΕΣ ΗΤΑΝ ΔΙΚΟ ΜΟΥ
// Γράφονται εδώ, γιατί ο επόμενος που θα γράψει τέτοιον έλεγχο θα πέσει στα ίδια:
//
//   506 → ένωνα τους δύο άξονες `overflow`, οπότε ένα καρουζέλ με
//         «overflow-x: auto, overflow-y: hidden» φαινόταν ψαλίδι.
//   180 → μετρούσα γραμμές με ύψος κουτιού δια ύψος γραμμής: κάθε κελί πίνακα
//         σε ψηλή σειρά έβγαινε «τέσσερις σειρές». Το Range δίνει τα αληθινά.
//   156 → έκρινα στόχους αφής και σε ποντίκι, όπου ο κανόνας δεν ισχύει.
//    13 → μετρούσα `scrollWidth > clientWidth` σε στοιχεία που ΔΕΝ κρύβουν την
//         υπερχείλισή τους: το κείμενο φαινόταν ολόκληρο.
//   146 → μετρούσα ως σύγκρουση κάθε επικάλυψη, μαζί με sticky κεφαλίδες και
//         στοίβες εναλλασσόμενης λέξης, που ΠΡΕΠΕΙ να περνούν από πάνω.
//
// Ενας ανιχνευτής με ψευδή ευρήματα δεν είναι αυστηρός· είναι άχρηστος, γιατί
// μαθαίνει τον κόσμο να τον προσπερνά.
//
//     node scripts/perf-bench/build-mobile.mjs && node scripts/e2e-layout.mjs
//     (οι δημόσιες σελίδες ελέγχονται μόνο αν απαντά το E2E_BASE)
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs'
import { abortIfStyleless } from './lib/served-css.mjs'
import { benchUrl } from './lib/paths.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const PROBE = () => {
  const out = []
  const seen = new Set()
  const add = (why, txt, n) => { const k = why + txt; if (!seen.has(k)) { seen.add(k); out.push(`${why} «${txt.slice(0,26)}»${n != null ? ' ' + n : ''}`) } }
  // Ο ΟΡΙΖΟΝΤΙΟΣ ΑΞΟΝΑΣ ΚΡΙΝΕΤΑΙ ΜΕ ΤΟΝ ΟΡΙΖΟΝΤΙΟ ΑΞΟΝΑ. Ενωνα τα δύο
  // `overflow` σε μία συμβολοσειρά, οπότε ένα καρουζέλ με «overflow-x: auto,
  // overflow-y: hidden» φαινόταν ψαλίδι: 150 ψευδή ευρήματα σε μία σελίδα,
  // για περιεχόμενο που ο χρήστης φτάνει σέρνοντας.
  const clipperOf = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX
      if (/hidden|clip/.test(ox)) return n
      if (/auto|scroll/.test(ox)) return null
    }
    return null
  }
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    if (!el.checkVisibility?.({ contentVisibilityAuto: true, visibilityProperty: true })) continue
    const cs = getComputedStyle(el)
    // ── ΟΣΑ ΥΠΑΡΧΟΥΝ ΜΟΝΟ ΓΙΑ ΤΟΝ ΑΝΑΓΝΩΣΤΗ ΟΘΟΝΗΣ ΔΕΝ ΚΡΙΝΟΝΤΑΙ ΟΠΤΙΚΑ ──
    // Το κείμενο ζωντανής περιοχής και ο σύνδεσμος παράκαμψης είναι επίτηδες
    // έξω από την οθόνη ή σε κουτί ενός εικονοστοιχείου. Ενας ανιχνευτής που
    // τα μετρά ως «κομμένα» βγάζει εκατοντάδες ευρήματα που δεν είναι.
    if (b.left < -500 || b.top < -500) continue
    if (cs.clipPath && cs.clipPath !== 'none') continue
    if (b.width <= 2 || b.height <= 2) continue
    if (el.closest('[aria-live], .sr-only, [class*="skip"]')) continue
    const txt = (el.textContent || '').trim()
    // ── κείμενο ──
    if (txt && el.children.length === 0) {
      // ΤΟ «ΞΕΠΕΡΝΑ ΤΟ ΚΟΥΤΙ ΤΟΥ» ΔΕΝ ΕΙΝΑΙ «ΚΟΒΕΤΑΙ». Ενα <p> με nowrap μέσα
      // σε γονιό 738 εικονοστοιχείων ξεχειλίζει 2px από το δικό του κουτί των
      // 250 και φαίνεται ΟΛΟΚΛΗΡΟ: κανείς δεν το κόβει. Κόβεται μόνο όταν το
      // ίδιο το στοιχείο δηλώνει ότι κρύβει την υπερχείλισή του.
      const ell = cs.textOverflow === 'ellipsis'
      const hides = /hidden|clip|auto|scroll/.test(cs.overflowX)
      if (!ell && hides && el.scrollWidth > el.clientWidth + 1) add('κομμένο', txt, el.scrollWidth - el.clientWidth + 'px')
      const clip = clipperOf(el)
      if (clip) {
        const cb = clip.getBoundingClientRect()
        if (b.right > cb.right + 1 || b.left < cb.left - 1) add('ξεφεύγει', txt, Math.round(Math.max(b.right-cb.right, cb.left-b.left)) + 'px')
      }
      // ΟΙ ΓΡΑΜΜΕΣ ΜΕΤΡΙΟΥΝΤΑΙ ΣΤΟ ΙΔΙΟ ΤΟ ΚΕΙΜΕΝΟ, ΟΧΙ ΣΤΟ ΚΟΥΤΙ ΤΟΥ. Ενα
      // κελί πίνακα τεντώνεται στο ύψος της σειράς: με διαίρεση ύψους δια
      // ύψους γραμμής, ΚΑΘΕ ποσό σε ψηλή σειρά έβγαινε «τέσσερις σειρές».
      // Δέκα ψευδή ευρήματα στο χαρτοφυλάκιο, από ένα και μόνο κελί που
      // τύλιγε αλλού. Το Range δίνει τα πραγματικά ορθογώνια του κειμένου.
      const rg = document.createRange(); rg.selectNodeContents(el)
      const lines = rg.getClientRects().length
      const words = txt.split(/\s+/).length
      if (lines > 3 && lines > words) add('σπασμένη λέξη', txt, lines + ' σειρές')
      // ═══ ΤΟ ΜΕΓΕΘΟΣ ΜΕΣΑ ΣΕ SVG ΔΕΝ ΕΙΝΑΙ ΤΟ ΜΕΓΕΘΟΣ ΣΤΗΝ ΟΘΟΝΗ ══════════
      // Ενα διάγραμμα με `viewBox="0 0 640 196"` και `width="100%"` ΚΛΙΜΑΚΩΝΕΤΑΙ.
      // Το `getComputedStyle` επιστρέφει τη μονάδα του viewBox, δηλαδή «10px»
      // ό,τι κι αν βλέπει ο άνθρωπος: στα 375 η κάρτα δίνει 311 εικονοστοιχεία
      // στα 640 του viewBox, άρα το «2016» ζωγραφίζεται στα 4,9 και ο έλεγχος
      // ανέφερε 10. Το `getScreenCTM` δίνει τον πραγματικό συντελεστή.
      let fs = parseFloat(cs.fontSize)
      if (el.ownerSVGElement && el.getScreenCTM) {
        const m = el.getScreenCTM()
        if (m) fs *= Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1
      }
      // Στρογγυλοποίηση ΠΡΙΝ τη σύγκριση: ο πολλαπλασιασμός με τον πίνακα
      // μετασχηματισμού δίνει 10,999999 εκεί που το svg γράφει καθαρό 11 και
      // ο έλεγχος κατήγγειλλε «11px» ως μικρότερο από 11.
      fs = Math.round(fs * 10) / 10
      if (fs && fs < 11) add('γράμματα κάτω από 11', txt, fs + 'px')
    }
    // ── στόχοι αφής ──
    // ΜΟΝΟ ΣΕ ΣΥΣΚΕΥΗ ΑΦΗΣ, ΟΠΩΣ ΚΑΙ Ο ΚΑΝΟΝΑΣ. Σε ποντίκι ένα κουμπί 26
    // εικονοστοιχείων σημαδεύεται χωρίς κόπο· ο κανόνας του έργου το λέει ρητά.
    // ΚΑΙ ΟΧΙ ΓΙΑ ΣΥΝΔΕΣΜΟ ΜΕΣΑ ΣΕ ΠΡΟΤΑΣΗ: εκεί το ύψος είναι το ύψος της
    // γραμμής και η περιοχή αφής δίνεται με το ιδίωμα `po-tap-inline`.
    if (matchMedia('(pointer: coarse)').matches
      && /^(BUTTON|A|SELECT)$/.test(el.tagName) && txt
      && cs.display !== 'inline') {
      const ac = getComputedStyle(el, '::after')
      const inset = ac.content !== 'none' ? Math.abs(parseFloat(ac.top) || 0) : 0
      const h = b.height + inset * 2
      if (h < 44) add('στόχος αφής', txt, Math.round(h) + 'px')
    }
  }
  // ═══ ΔΟΧΕΙΟ ΠΟΥ ΞΕΡΝΑΕΙ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ ═══════════════════════════════
  // ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΑΝΕΝΑΣ ΑΠΟ ΤΟΥΣ ΠΡΟΗΓΟΥΜΕΝΟΥΣ ΕΛΕΓΧΟΥΣ ΔΕΝ ΕΠΙΑΝΕ. Η μπάρα
  // του πίνακα ελέγχου είχε ΚΑΡΦΩΜΕΝΟ ύψος 64 και δεύτερη γραμμή κειμένου που
  // ζητούσε 86. Τα 22 που περίσσευαν δεν κόπηκαν (άρα ο έλεγχος «κομμένο
  // κείμενο» σιωπούσε) και δεν έπεσαν πάνω σε αδελφό στην ίδια σειρά (άρα και ο
  // έλεγχος σύγκρουσης σιωπούσε): ξεχείλισαν ΚΑΤΩ από το όριο του δοχείου, πάνω
  // στο περιεχόμενο που κυλά από κάτω. Ο χρήστης το φωτογράφισε σε τέσσερις από
  // τέσσερις οθόνες ταμπλέτας.
  //
  // Ο ΚΑΝΟΝΑΣ: δοχείο με ΣΤΑΘΕΡΟ ύψος, που δεν κυλά και δεν κόβει, με
  // περιεχόμενο ψηλότερο από το κουτί του. Δεν κρίνονται όσα κόβουν (`hidden`,
  // `clip`) ούτε όσα κυλούν: εκείνα κρίνονται αλλού.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (!/visible/.test(cs.overflowY)) continue
    if (!el.checkVisibility?.()) continue
    const spill = el.scrollHeight - el.clientHeight
    // Τέσσερα εικονοστοιχεία είναι στρογγυλοποίηση· δώδεκα είναι γραμμή κειμένου.
    if (spill < 12) continue
    // ΤΟ ΞΕΧΕΙΛΙΣΜΑ ΜΕΤΡΑΕΙ ΟΤΑΝ ΑΠΟ ΚΑΤΩ ΥΠΑΡΧΕΙ ΑΔΕΛΦΟΣ ΝΑ ΤΟ ΠΛΗΡΩΣΕΙ.
    // Πρώτη γραφή ρωτούσε «είναι καρφωμένο το ύψος;» με `cs.height !== 'auto'`.
    // ΔΕΝ δουλεύει: η `getComputedStyle` επιστρέφει ΠΑΝΤΑ λυμένα εικονοστοιχεία,
    // ποτέ «auto», οπότε η συνθήκη ήταν πάντα αληθής και ο έλεγχος κατήγγειλε
    // κάθε στοιχείο με απόλυτα τοποθετημένο απόγονο (μετρημένο: επτά ψευδή στη
    // δημόσια αρχική).
    //
    // Η σωστή ερώτηση δεν είναι «γιατί ξεχειλίζει» αλλά «πάνω σε τι». Στήλη
    // flex με τον επόμενο αδελφό ακριβώς από κάτω: εκεί το ξεχείλισμα ΠΕΦΤΕΙ
    // πάνω του, όπως η μπάρα πάνω στο περιεχόμενο που κυλά.
    const par = el.parentElement
    if (!par) continue
    const pcs = getComputedStyle(par)
    if (pcs.display !== 'flex' || !/column/.test(pcs.flexDirection)) continue
    const next = el.nextElementSibling
    if (!next) continue
    const nb = next.getBoundingClientRect()
    const eb = el.getBoundingClientRect()
    if (nb.top > eb.bottom + 2) continue
    if (eb.width < 40 || eb.height < 20) continue
    add('ΞΕΧΕΙΛΙΖΕΙ ΠΑΝΩ ΣΤΟΝ ΕΠΟΜΕΝΟ', (el.className || el.tagName).toString().slice(0, 24), `${Math.round(spill)}px`)
  }

  // ΑΠΟΔΕΙΞΗ ΟΤΙ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ: με το ύψος της μπάρας ξανακαρφωμένο στα 64
  // και όνομα ακινήτου που τυλίγεται, ο έλεγχος κοκκίνισε σε ΟΛΕΣ τις σκηνές
  // στα 768 και στα 820 («ΞΕΧΕΙΛΙΖΕΙ ΠΑΝΩ ΣΤΟΝ ΕΠΟΜΕΝΟ app-topbar 27px»). Με
  // `min-height` πράσινος.

  // ═══ ΤΟ ΠΑΡΑΔΕΙΓΜΑ ΜΕΣΑ ΣΤΟ ΠΕΔΙΟ ══════════════════════════════════════
  // ΤΟ placeholder ΚΟΒΕΤΑΙ ΧΩΡΙΣ ΝΑ ΤΟ ΠΕΙ ΚΑΝΕΙΣ. Δεν τυλίγεται, δεν βγάζει
  // αποσιωπητικά που να μετρώνται και δεν ξεχειλίζει: ο περιηγητής απλώς
  // σταματά να το ζωγραφίζει στο περιθώριο του κουτιού. Ενα «Παράδειγμα:
  // Γιώργος Παπαδόπο» δεν είναι κομμένο κείμενο, είναι ΛΑΘΟΣ παράδειγμα.
  //
  // Μετριέται με canvas και την πραγματική γραμματοσειρά του πεδίου, όχι με
  // εκτίμηση χαρακτήρων: τα ελληνικά και τα ψηφία δεν έχουν το ίδιο πλάτος.
  //
  // ΑΠΟΔΕΙΞΗ ΟΤΙ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ: το παράδειγμα της αναζήτησης δαπανών έγινε
  // προσωρινά «Περιγραφή, κατηγορία, πάροχος, ημερομηνία ή ποσό της δαπάνης»
  // και ο έλεγχος κοκκίνισε και στα έξι πλάτη («533 σε 290»). Με το κανονικό
  // κείμενο πράσινος.
  const cv = document.createElement('canvas').getContext('2d')
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    const ph = el.getAttribute('placeholder')
    if (!ph || !el.checkVisibility?.()) continue
    const cs = getComputedStyle(el)
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = cv.measureText(ph).width
    // Ενα εικονοστοιχείο είναι στρογγυλοποίηση· τέσσερα είναι χαμένο γράμμα.
    if (need > room + 4) add('ΚΟΜΜΕΝΟ ΠΑΡΑΔΕΙΓΜΑ', ph, `${Math.round(need)} σε ${Math.round(room)}`)
  }

  // ═══ Η ΤΙΜΗ ΜΕΣΑ ΣΤΟ ΠΕΔΙΟ ═════════════════════════════════════════════
  // ΤΟ ΠΑΡΑΔΕΙΓΜΑ ΗΤΑΝ ΤΟ ΜΙΣΟ ΠΡΟΒΛΗΜΑ. Ο,τι κόβει το `placeholder` κόβει και
  // την ΤΙΜΗ· και η τιμή είναι χειρότερη: το παράδειγμα το βλέπει ο χρήστης μία
  // φορά, την τιμή τη διαβάζει για να αποφασίσει. Στο tablet, το πεδίο «Ετήσια
  // ανατίμηση ακινήτου» με πλάτος 90 και επίθεμα «%» έδειχνε κομμένο το «6,8».
  //
  // Δεν αρκεί το `scrollWidth > clientWidth`: το πεδίο κειμένου κυλά μόνο του
  // και όταν η εστίαση είναι αλλού ο περιηγητής επιστρέφει ίσα νούμερα. Ετσι
  // μετριέται το ΙΔΙΟ πράγμα με το παράδειγμα, με canvas και την πραγματική
  // γραμματοσειρά, ώστε μια αλλαγή σε καθεμιά από τις δύο να μη χαλά την άλλη.
  for (const el of document.querySelectorAll('input, textarea')) {
    if (/^(checkbox|radio|file|range|color|hidden|submit|button|image)$/.test(el.type || '')) continue
    const v = el.value
    if (!v || !el.checkVisibility?.()) continue
    const cs = getComputedStyle(el)
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const need = cv.measureText(v).width
    if (need > room + 4) add('ΚΟΜΜΕΝΗ ΤΙΜΗ ΠΕΔΙΟΥ', v, `${Math.round(need)} σε ${Math.round(room)}`)
  }

  // ═══ Ο ΠΙΝΑΚΑΣ ΠΟΥ ΚΥΛΑ ΚΑΙ ΧΑΝΕΙ ΤΟ ΟΝΟΜΑ ΤΗΣ ΓΡΑΜΜΗΣ ═════════════════
  // ΤΙ ΣΥΜΒΑΙΝΕΙ ΣΕ ΤΑΜΠΛΕΤΑ. Ενας πίνακας δέκα στηλών δεν χωράει, οπότε κυλά
  // οριζόντια. Ο χρήστης σέρνει δεξιά για να δει το ποσό της τελευταίας στήλης
  // και η ΠΡΩΤΗ στήλη, αυτή που λέει ΠΟΙΑΝΟΥ είναι το ποσό, φεύγει εκτός
  // οθόνης. Μένει μια σειρά νούμερα χωρίς ιδιοκτήτη.
  //
  // Ο ΕΛΕΓΧΟΣ ΚΡΙΝΕΙ ΜΟΝΟ ΟΣΟΥΣ ΚΥΛΟΥΝ ΠΡΑΓΜΑΤΙΚΑ. Ενας πίνακας που χωράει δεν
  // έχει πρόβλημα να λύσει· μια καρφωμένη στήλη εκεί θα ήταν περιττή
  // πολυπλοκότητα. Η ερώτηση είναι «κυλά ΤΩΡΑ, σε αυτό το πλάτος;».
  //
  // ΚΑΙ ΜΟΝΟ ΟΣΟΥΣ ΕΧΟΥΝ ΟΝΟΜΑ ΣΤΗΝ ΠΡΩΤΗ ΣΤΗΛΗ. Οταν το πρώτο κελί είναι
  // αριθμός, εικονίδιο ή κουτάκι επιλογής, δεν κουβαλά ταυτότητα και δεν
  // χρειάζεται να μείνει ορατό.
  for (const t of document.querySelectorAll('table')) {
    if (!t.checkVisibility?.()) continue
    let sc = t.parentElement
    while (sc && sc !== document.body && !/auto|scroll/.test(getComputedStyle(sc).overflowX)) sc = sc.parentElement
    if (!sc || sc === document.body) continue
    if (sc.scrollWidth <= sc.clientWidth + 4) continue
    const firstCell = t.querySelector('tbody tr > :first-child')
    if (!firstCell) continue
    const label = (firstCell.textContent || '').trim()
    if (label.length < 3 || /^[\d.,€%\s]+$/.test(label)) continue
    if (getComputedStyle(firstCell).position === 'sticky') continue
    add('ΧΑΝΕΤΑΙ Η ΤΑΥΤΟΤΗΤΑ ΤΗΣ ΓΡΑΜΜΗΣ', label.slice(0, 22), `${sc.scrollWidth - sc.clientWidth}px κύλιση`)
  }

  // ═══ ΔΥΟ ΠΕΔΙΑ ΔΙΠΛΑ ΔΙΠΛΑ, ΣΕ ΑΛΛΟ ΥΨΟΣ ════════════════════════════════
  // ΤΟ ΕΙΔΕ Ο ΧΡΗΣΤΗΣ ΣΕ ΤΑΜΠΛΕΤΑ, ΣΤΑ ΠΑΡΑΘΥΡΑ ΤΩΝ ΦΟΡΜΩΝ: η μία στήλη είχε
  // υπόδειξη τριών σειρών κάτω από το πεδίο και η διπλανή καμία, οπότε με
  // στοίχιση στη ΒΑΣΗ τα δύο κουτιά γραφής κάθονταν σε διαφορετικό ύψος. Δύο
  // πεδία της ίδιας γραμμής, στην ίδια φόρμα, το ένα πιο ψηλά από το άλλο.
  //
  // ΤΙ ΜΕΤΡΑΕΙ. Για κάθε `.field-row`, τα ΚΟΥΤΙΑ ΓΡΑΦΗΣ που ανήκουν στην ίδια
  // οπτική σειρά (ίδιο ύψος αρχής μέσα σε ανοχή γραμμής) πρέπει να ξεκινούν
  // στο ίδιο σημείο. Η σύγκριση γίνεται στο ΠΕΔΙΟ, όχι στο περίβλημά του:
  // εκείνο έχει και ετικέτα και υπόδειξη, που δικαιολογημένα διαφέρουν.
  for (const row of document.querySelectorAll('.field-row')) {
    const fields = [...row.querySelectorAll('input, select, textarea, [role="combobox"]')]
      .filter(f => f.checkVisibility?.() && f.getBoundingClientRect().height > 8)
    // Ομαδοποίηση ανά οπτική σειρά: το `flex-wrap` σπάει τη γραμμή σε πολλές.
    const byLine = new Map()
    for (const f of fields) {
      const b = f.getBoundingClientRect()
      // Κλειδί η ΜΕΣΗ του πεδίου στρογγυλεμένη ανά 60: όσα μοιράζονται σειρά
      // πέφτουν στον ίδιο κάδο ακόμη κι αν διαφέρουν κατά λίγο.
      const key = Math.round(b.top / 60)
      if (!byLine.has(key)) byLine.set(key, [])
      byLine.get(key).push(b)
    }
    for (const boxes of byLine.values()) {
      if (boxes.length < 2) continue
      const tops = boxes.map(b => b.top)
      const spread = Math.max(...tops) - Math.min(...tops)
      if (spread > 4) add('ΑΣΤΟΙΧΙΣΤΑ ΠΕΔΙΑ', (row.textContent || '').trim().slice(0, 24), Math.round(spread) + 'px')
    }
  }

  // ═══ ΔΥΟ ΚΕΙΜΕΝΑ ΤΟ ΕΝΑ ΠΑΝΩ ΣΤΟ ΑΛΛΟ ══════════════════════════════════
  // ΤΟ ΧΕΙΡΟΤΕΡΟ ΟΠΤΙΚΟ ΣΦΑΛΜΑ ΠΟΥ ΥΠΑΡΧΕΙ, ΚΑΙ ΚΑΝΕΙΣ ΔΕΝ ΤΟ ΜΕΤΡΟΥΣΕ. Οταν
  // ένα κείμενο ξεχειλίζει από τη στήλη του και η στήλη δεν κόβει, το κείμενο
  // δεν χάνεται: πέφτει ΠΑΝΩ στο διπλανό. Ενας έλεγχος που ρωτά μόνο «κόβεται;»
  // βγαίνει πράσινος ακριβώς εκεί που η οθόνη είναι αδιάβαστη.
  const leaves = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !(el.textContent || '').trim()) continue
    if (!el.checkVisibility?.({ contentVisibilityAuto: true, visibilityProperty: true })) continue
    // ΚΑΘΕ ΠΡΟΓΟΝΟΣ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΣΤΗ ΚΑΝΟΝΙΚΗ ΡΟΗ. Οτι είναι τοποθετημένο
    // (sticky κεφαλίδα, πλωτό υποσέλιδο, στοίβα εναλλασσόμενης λέξης) ΠΡΕΠΕΙ να
    // περνά από πάνω: αυτός είναι ο λόγος που υπάρχει. Χωρίς αυτόν τον όρο ο
    // ανιχνευτής έβγαζε 146 «συγκρούσεις» που ήταν όλες σωστός σχεδιασμός.
    const cs = getComputedStyle(el)
    // ═══ ΤΟ «relative» ΧΩΡΙΣ ΜΕΤΑΤΟΠΙΣΗ ΔΕΝ ΒΓΑΖΕΙ ΤΙΠΟΤΑ ΑΠΟ ΤΗ ΡΟΗ ═══════
    // ΨΕΥΔΩΣ ΑΘΩΩΘΗΚΕ ΜΙΑ ΠΡΑΓΜΑΤΙΚΗ ΣΥΓΚΡΟΥΣΗ. Ο όρος ήταν «position !==
    // static» για ΚΑΘΕ πρόγονο, δηλαδή αρκούσε ένα `position: relative` κάπου
    // πιο πάνω —που μπαίνει παντού απλώς ως άγκυρα για μενού— και το στοιχείο
    // έβγαινε εκτός ελέγχου. Ετσι το chip κατάστασης της μπάρας ζωγραφιζόταν
    // δεκαεπτά εικονοστοιχεία ΠΑΝΩ στο κουμπί αναζήτησης, σε κάθε τηλέφωνο, ενώ
    // ο έλεγχος σιωπούσε: η θήκη του chip είναι `relative`.
    //
    // Αυτό που ΟΝΤΩΣ βγάζει από τη ροή είναι το `absolute`, το `fixed`, το
    // `sticky` (που ΠΡΕΠΕΙ να περνά από πάνω) και το `relative` ΜΕ μετατόπιση.
    let flow = true
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const pcs = getComputedStyle(n)
      const moved = pcs.position === 'relative'
        && ['top', 'left', 'right', 'bottom'].some(k => pcs[k] !== 'auto' && parseFloat(pcs[k]) !== 0)
      if (/absolute|fixed|sticky/.test(pcs.position) || moved
          || pcs.transform !== 'none' || parseFloat(pcs.opacity) < 1) { flow = false; break }
    }
    if (!flow) continue
    const b = el.getBoundingClientRect()
    if (b.width < 4 || b.height < 4 || b.left < -500) continue
    // Το κείμενο μετριέται με τα ΟΡΘΟΓΩΝΙΑ ΤΟΥ, όχι με το κουτί του: ένα κελί
    // πίνακα τεντώνεται στο ύψος της σειράς και θα «ακουμπούσε» τα πάντα.
    // ΟΤΙ ΤΟ ΚΟΒΕΙ ΗΔΗ ΕΝΑΣ ΚΥΛΙΟΜΕΝΟΣ ΠΡΟΓΟΝΟΣ ΔΕΝ ΦΑΙΝΕΤΑΙ, ΑΡΑ ΔΕΝ ΠΕΦΤΕΙ
    // ΠΑΝΩ ΣΕ ΤΙΠΟΤΑ. Το ευρετήριο των νομικών σελίδων κυλά μέσα του με όριο
    // ύψους 46vh, επίτηδες: τα ορθογώνια των τελευταίων συνδέσμων συνεχίζουν
    // κάτω από το κουτί, ο περιηγητής τα κόβει και ο ανιχνευτής τα μετρούσε ως
    // σύγκρουση με το κείμενο από κάτω. Εβδομήντα τρία ψευδή ευρήματα.
    let vis = true
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n)
      if (!/auto|scroll|hidden|clip/.test(c.overflowY + c.overflowX)) continue
      const nb = n.getBoundingClientRect()
      const eb = el.getBoundingClientRect()
      if (eb.top > nb.bottom - 2 || eb.bottom < nb.top + 2 || eb.left > nb.right - 2 || eb.right < nb.left + 2) { vis = false; break }
    }
    if (!vis) continue
    // ═══ ΤΟ ΟΡΘΟΓΩΝΙΟ ΤΟΥ ΚΕΙΜΕΝΟΥ ΔΕΝ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΦΑΙΝΕΤΑΙ ═════════════
    // 761 ΑΠΟ ΤΑ 785 ΕΥΡΗΜΑΤΑ ΜΙΑΣ ΣΑΡΩΣΗΣ ΗΤΑΝ ΤΟ ΙΔΙΟ ΦΑΝΤΑΣΜΑ. Το `Range`
    // δίνει το ορθογώνιο ΟΛΟΚΛΗΡΟΥ του κειμένου, ακόμη κι όταν το ίδιο το
    // στοιχείο το κόβει με `overflow: hidden`. Ο τίτλος ακινήτου στην μπάρα
    // γράφεται σε μία σειρά με αποσιωπητικά: φαίνεται 311 εικονοστοιχεία και το
    // `Range` επέστρεφε 520. Τα 209 που «περίσσευαν» έπεφταν πάνω στο σήμα
    // κατάστασης δίπλα του και ο έλεγχος ανακοίνωνε σύγκρουση 33 σε κάθε σκηνή
    // και σε κάθε ταμπλέτα, δηλαδή 761 φορές. Καμία δεν ήταν ορατή.
    //
    // Ο βρόχος από πάνω κοιτάζει ΠΡΟΓΟΝΟΥΣ και ρωτά «φαίνεται καθόλου;». Εδώ
    // κόβεται το ορθογώνιο στο κουτί κάθε κόφτη, ΞΕΚΙΝΩΝΤΑΣ ΑΠΟ ΤΟ ΙΔΙΟ ΤΟ
    // ΣΤΟΙΧΕΙΟ: ό,τι μένει είναι ακριβώς ό,τι βλέπει το μάτι.
    const clip = (r) => {
      let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const c = getComputedStyle(n)
        if (!/auto|scroll|hidden|clip/.test(c.overflowY + c.overflowX)) continue
        const nb = n.getBoundingClientRect()
        if (/auto|scroll|hidden|clip/.test(c.overflowX)) { x1 = Math.max(x1, nb.left); x2 = Math.min(x2, nb.right) }
        if (/auto|scroll|hidden|clip/.test(c.overflowY)) { y1 = Math.max(y1, nb.top); y2 = Math.min(y2, nb.bottom) }
      }
      return { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 }
    }
    const rg = document.createRange(); rg.selectNodeContents(el)
    for (const raw of rg.getClientRects()) {
      const r = clip(raw)
      if (r.width > 4 && r.height > 4) leaves.push({ el, r, t: el.textContent.trim() })
    }
  }
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], c = leaves[j]
      if (a.el.contains(c.el) || c.el.contains(a.el)) continue
      // Μόνο μέσα στην ΙΔΙΑ γραμμή διάταξης: ο κοινός πρόγονος οφείλει να είναι
      // πλέγμα ή flex. Δύο κείμενα σε άσχετα μέρη της σελίδας δεν συγκρίνονται.
      let anc = a.el
      while (anc && !anc.contains(c.el)) anc = anc.parentElement
      if (!anc) continue
      const ad = getComputedStyle(anc).display
      if (!/grid|flex/.test(ad)) continue
      const ox = Math.min(a.r.right, c.r.right) - Math.max(a.r.left, c.r.left)
      const oy = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top)
      // Δύο εικονοστοιχεία επικάλυψης είναι στρογγυλοποίηση· τέσσερα είναι σύγκρουση.
      if (ox > 4 && oy > 4) add('ΠΑΝΩ ΣΤΟ ΑΛΛΟ', `${a.t.slice(0,14)}» / «${c.t.slice(0,14)}`, Math.round(ox) + 'px')
    }
  }

  // ═══ Η ΜΙΣΗ ΤΕΛΕΥΤΑΙΑ ΣΕΙΡΑ ═══════════════════════════════════════════
  // Η ΠΙΟ ΣΥΧΝΗ ΠΑΡΑΦΩΝΙΑ ΤΗΣ ΕΦΑΡΜΟΓΗΣ, ΚΑΙ Η ΠΙΟ ΕΥΚΟΛΗ ΝΑ ΜΗ ΦΑΝΕΙ ΣΕ
  // ΟΘΟΝΗ ΥΠΟΛΟΓΙΣΤΗ. Τέσσερα πλακίδια σε τρεις στήλες αφήνουν ένα μόνο του
  // με τρύπα δεξιά. Στον υπολογιστή οι στήλες βγαίνουν τέσσερις και δεν
  // φαίνεται· σε ταμπλέτα γίνονται τρεις και φαίνεται σε κάθε οθόνη.
  //
  // ΤΙ ΜΕΤΡΑΕΙ ΚΑΙ ΤΙ ΟΧΙ. Μόνο δοχεία με ΙΣΟΜΕΓΕΘΗ αδέλφια, δηλαδή πλακίδια
  // που διαβάζονται ως σύνολο. Μια λίστα κειμένων με άνισα ύψη δεν είναι
  // πλακίδια και δεν κρίνεται εδώ.
  for (const g of document.querySelectorAll('*')) {
    const cs = getComputedStyle(g)
    if (!/grid|flex/.test(cs.display)) continue
    // ΕΚΤΟΣ ΡΟΗΣ ΣΗΜΑΙΝΕΙ «absolute» Η «fixed», ΟΧΙ «relative». Ο ορος ηταν
    // `position === 'static'` και πετούσε έξω κάθε πλακίδιο που είναι απλώς
    // άγκυρα για κάτι δικό του — ο επιλογέας «Περιοχή» είναι `relative` για να
    // κρεμάσει τη λίστα του. Ετσι το πλέγμα των τεσσάρων της Αποδοσης μετριόταν
    // ως τριών και καταγγελλόταν «2+1» σε τρία πλάτη, ενώ στην οθόνη ήταν 2+2.
    const kids = [...g.children].filter(k => {
      const b = k.getBoundingClientRect()
      return b.width > 8 && b.height > 8 && !/absolute|fixed/.test(getComputedStyle(k).position)
    })
    if (kids.length < 3) continue
    // ═══ Η ΣΕΙΡΑ ΒΓΑΙΝΕΙ ΑΠΟ ΕΠΙΚΑΛΥΨΗ, ΟΧΙ ΑΠΟ ΙΔΙΟ «top» ═══════════════════
    // ΨΕΥΔΕΣ ΕΥΡΗΜΑ, ΔΙΚΟ ΜΟΥ. Το κλειδί ήταν το `top` στρογγυλεμένο, που
    // υποθέτει ότι τα αδέλφια της ίδιας σειράς ξεκινούν στο ίδιο ύψος. Με
    // `align-items: end` ευθυγραμμίζεται η ΒΑΣΗ: σε σειρά με τρία πεδία και ένα
    // κουμπί, το κουμπί είναι κοντύτερο, άρα ξεκινά πιο χαμηλά και μετριόταν ως
    // ΔΙΚΗ ΤΟΥ σειρά. Δέκα «3+1» και «5+1» σε πλάτη όπου η σειρά ήταν μία.
    // Δύο στοιχεία είναι στην ίδια σειρά όταν τα κατακόρυφα διαστήματά τους
    // τέμνονται· αυτό ισχύει σε κάθε στοίχιση.
    const boxes = kids.map(k => k.getBoundingClientRect()).sort((a, b) => a.top - b.top)
    const rows = new Map()
    let sameW = true, w0 = null, line = 0, lineBottom = -Infinity
    for (const b of boxes) {
      if (w0 === null) w0 = b.width
      else if (Math.abs(b.width - w0) > 2) sameW = false
      if (b.top >= lineBottom - 1) { line++; lineBottom = b.bottom }
      else lineBottom = Math.max(lineBottom, b.bottom)
      rows.set(line, (rows.get(line) || 0) + 1)
    }
    if (!sameW || rows.size < 2) continue
    // ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΔΕΝ ΕΧΕΙ ΟΡΦΑΝΑ, ΕΧΕΙ ΜΗΝΑ. Επτά στήλες με τις συντομογραφίες
    // των ημερών στην πρώτη σειρά είναι ημερολόγιο: η τελευταία εβδομάδα του
    // Φεβρουαρίου ΠΡΕΠΕΙ να είναι μισή. Ενας έλεγχος που το καταγγέλλει μαθαίνει
    // τον επόμενο αναγνώστη να αγνοεί τα ευρήματα.
    const head = kids.slice(0, 7).map(k => (k.textContent || '').trim())
    if (head.length === 7 && head.every(t => /^(Δε|Τρ|Τε|Πε|Πα|Σα|Σά|Κυ)$/.test(t))) continue
    const counts = [...rows.values()]
    if (new Set(counts).size === 1) continue
    // ΤΟ ΚΕΝΤΡΑΡΙΣΜΕΝΟ ΥΠΟΛΟΙΠΟ ΔΕΝ ΕΙΝΑΙ ΟΡΦΑΝΟ. Ενα πλακίδιο μόνο του
    // ενοχλεί επειδή κάθεται αριστερά και αφήνει τρύπα δεξιά. Οταν το δοχείο
    // κεντράρει (`justify-content: center`), η τελευταία σειρά κάθεται στη μέση
    // και είναι συμμετρική ως προς το κουτί: αυτό είναι η ΛΥΣΗ του προβλήματος,
    // όχι το πρόβλημα. Ετσι είναι γραμμένο το `.tile-grid` των συνδρομών.
    if (/center/.test(cs.justifyContent)) continue
    // Η τελευταία σειρά με ΕΝΑ πλακίδιο δίπλα σε σειρές των τριών ή τεσσάρων
    // είναι το ορφανό· δύο από τρία είναι ανεκτό και δεν αναφέρεται.
    const full = Math.max(...counts), last = counts[counts.length - 1]
    if (last > 1 && last >= full - 1) continue
    // Το πρώτο πλακίδιο ονομάζει το μπλοκ: μια κλάση «DIV» δεν βρίσκεται.
    const first = (kids[0].textContent || '').trim().slice(0, 20)
    add('ΟΡΦΑΝΟ ΠΛΑΚΙΔΙΟ', `${(g.className || g.tagName).toString().slice(0, 16)} → ${first}`, counts.join('+'))
  }

  // ── οριζόντια υπερχείλιση σε κάθε κυλιόμενο δοχείο ──
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`ΣΕΛΙΔΑ ΚΥΛΑ ΟΡΙΖΟΝΤΙΑ ${document.documentElement.scrollWidth - innerWidth}px`)
  return out
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromePath(), args: ['--no-sandbox'] })
// Η ΤΑΜΠΛΕΤΑ ΣΕ ΟΡΙΖΟΝΤΙΑ ΘΕΣΗ ΔΕΝ ΜΕΤΡΙΟΤΑΝ ΩΣ ΤΑΜΠΛΕΤΑ. Το `hasTouch` ήταν
// `w < 1100`, οπότε στα 1.024 και πάνω ο έλεγχος έτρεχε ΩΣ ΠΟΝΤΙΚΙ — και ο
// κανόνας των 44 εικονοστοιχείων ισχύει μόνο σε χοντρό δείκτη, άρα δεν ίσχυε
// πουθενά εκεί. Ενα Xiaomi Pad 6 σε οριζόντια θέση είναι 1.280 CSS και το
// χειρίζεται δάχτυλο: κάθε στόχος κάτω από 44 σε εκείνο το πλάτος περνούσε
// αθόρυβα. Τα 1.280 τρέχουν πλέον ΜΕ αφή.
//
// ΑΠΟΔΕΙΞΗ ΟΤΙ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟ: το `--h-sm` γύρισε προσωρινά στα 40 και το
// μενού «Περισσότερα» των Επαφών κοκκίνισε ΚΑΙ στα 1.280, εκεί που πριν
// σιωπούσε. Με τα 44 πράσινο.
// ΤΑ 900 ΜΠΗΚΑΝ ΕΠΕΙΔΗ ΕΚΕΙ ΚΡΥΒΟΤΑΝ ΤΟ ΣΦΑΛΜΑ. Ο κανόνας των διαιρετών για
// τους δείκτες έπιανε ώς τα 820 και ξανάπιανε από τα 1.024· ανάμεσά τους,
// τέσσερα πλακίδια έβγαιναν 3+1. Δηλαδή η ζώνη που ΔΕΝ μετριόταν ήταν ακριβώς
// η ταμπλέτα σε οριζόντια θέση.
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΛΑΤΗ ΕΙΝΑΙ ΣΥΣΚΕΥΕΣ, ΚΑΙ ΤΟ ΣΤΕΝΟΤΕΡΟ ΔΕΝ ΗΤΑΝ ΤΟ ΣΤΕΝΟΤΕΡΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ, ΟΠΩΣ ΤΟ ΑΝΕΦΕΡΕ Ο ΧΡΗΣΤΗΣ. «Εχω ένα Samsung A κάτι και όλα φαίνονται
// χάλια». Η σειρά Galaxy A αναφέρει ΤΡΙΑΚΟΣΙΑ ΕΞΗΝΤΑ εικονοστοιχεία CSS: A12,
// A13, A14, A15, A25, A54, A55, όλα 360. Το στενότερο πλάτος αυτού του ελέγχου
// ήταν 375, δηλαδή ΔΕΚΑΠΕΝΤΕ ΠΑΡΑΠΑΝΩ από τη συσκευή του μισού ελληνικού
// κοινού. Δεκαπέντε εικονοστοιχεία είναι η διαφορά ανάμεσα σε «χωράει» και
// «ξεχειλίζει» σε κάθε σειρά που μετρήθηκε οριακά σωστή.
//
// ΚΑΙ ΤΟ 320 ΔΕΝ ΕΙΝΑΙ ΘΕΩΡΗΤΙΚΟ. Το One UI της Samsung έχει ρύθμιση «Μέγεθος
// οθόνης»: στη μεγαλύτερη βαθμίδα το ίδιο τηλέφωνο αναφέρει γύρω στα 320. Ο
// χρήστης δεν το θεωρεί προσβασιμότητα, το θεωρεί προτίμηση.
//
// ΤΟ ΥΨΟΣ ΕΙΝΑΙ ΚΙ ΑΥΤΟ ΣΥΣΚΕΥΗ. Το 640 του Galaxy A5 και του A6 δεν είναι
// «μικρή οθόνη»· είναι δεκατέσσερις σειρές λιγότερες από το 800, με την ίδια
// μπάρα από πάνω και την ίδια πλοήγηση από κάτω.
//
// Ο ΕΛΕΓΧΟΣ ΚΙΝΗΤΟΥ (`npm run e2e:mobile`) ΕΙΧΕ 320 ΚΑΙ 360 — ΣΕ ΜΙΑ ΟΘΟΝΗ.
// Τρέχει μόνο το Χαρτοφυλάκιο. Ολοι οι ανιχνευτές αυτού εδώ (κομμένο κείμενο,
// ξεχείλισμα, ορφανά, στόχοι αφής, συγκρούσεις, γράμματα διαγράμματος, τιμές
// πεδίων, ταυτότητα γραμμής) δεν είχαν δει ποτέ 360.
// ═══════════════════════════════════════════════════════════════════════════
const DEVICES = [
  { w: 320, h: 640,  name: 'Samsung μεγάλη γραμματοσειρά' },
  { w: 360, h: 640,  name: 'Galaxy A5, A6' },
  { w: 360, h: 800,  name: 'Galaxy A12 ώς A55' },
  { w: 375, h: 812,  name: 'iPhone SE, 13 mini' },
  { w: 412, h: 915,  name: 'Galaxy A71, Pixel' },
  { w: 430, h: 932,  name: 'iPhone Pro Max' },
  { w: 768, h: 1024, name: 'ταμπλέτα κάθετη' },
  { w: 820, h: 1180, name: 'iPad Air' },
  { w: 900, h: 1200, name: 'ταμπλέτα οριζόντια' },
  { w: 1024, h: 1366, name: 'iPad Pro' },
  { w: 1280, h: 800, name: 'φορητός με αφή' },
  { w: 1440, h: 900, name: 'φορητός' },
]
// ═══ ΜΟΝΟ ΤΑ ΠΛΑΤΗ ΠΟΥ ΔΟΥΛΕΥΕΙΣ ═══════════════════════════════════════════
// Οι βαριές σκηνές έχουν δεκάδες διακόπτες η καθεμιά και ο έλεγχος ανοίγει
// κάθε έναν: δώδεκα συσκευές επί οκτώ τέτοιες σκηνές δεν τελειώνουν σε μια
// συνεδρία. Οταν η δουλειά είναι το τηλέφωνο, τα πλάτη της ταμπλέτας και του
// φορητού είναι αναμονή χωρίς απάντηση.
//     E2E_WIDTHS=320,360,375,412 node scripts/e2e-layout.mjs
const PICK_W = process.env.E2E_WIDTHS ? process.env.E2E_WIDTHS.split(',').map(Number) : null
const RUN_DEVICES = PICK_W ? DEVICES.filter(d => PICK_W.includes(d.w)) : DEVICES

const WIDTHS = DEVICES.map(d => d.w)
const TOUCH = (w) => w < 1100 || w === 1280
const SCENES = ['portfolio','cash','rent','inbox','ledger','checklist','modal','select','compare','loan','pricing','bills','contacts','wizard','roi','tenant','scan']
// ═══ ΤΑ ΠΑΡΑΘΥΡΑ ΠΟΥ ΑΝΟΙΓΟΥΝ ΜΕ ΚΟΥΜΠΙ ═════════════════════════════════════
// ΜΙΑ ΦΟΡΜΑ ΜΕΣΑ ΣΕ ΠΑΡΑΘΥΡΟ ΔΕΝ ΑΠΟΔΙΔΕΤΑΙ ΑΝ ΔΕΝ ΤΗΝ ΑΝΟΙΞΕΙ ΚΑΠΟΙΟΣ. Η φόρμα
// ενοικιαστή ζει πίσω από το «Νέος ενοικιαστής» και καμία μέτρηση δεν την είχε
// δει ποτέ. Το `aria-pressed` δεν βοηθά εδώ: το κουμπί δεν είναι διακόπτης, δεν
// έχει κατάσταση, απλώς ανοίγει παράθυρο. Γράφεται ρητά ποιο κουμπί πατιέται σε
// ποια σκηνή, ώστε ο κατάλογος των μετρημένων παραθύρων να είναι ΟΡΑΤΟΣ.
const OPENERS = { tenant: ['Νέος ενοικιαστής'] }
const PAGES = ['/', '/login', '/signup', '/ypologismos-forou-enoikion', '/ypologismos-enfia', '/vraxyxronia-i-makroxronia', '/kathari-apodosi', '/imerologio', '/privacy']
const BASE = process.env.E2E_BASE || 'http://localhost:3100'
// Για να δουλεύεται μία σκηνή χωρίς να τρέχουν και οι 120: E2E_ONLY=roi
const ONLY = process.env.E2E_ONLY ? process.env.E2E_ONLY.split(',') : null
// ΟΙ ΔΗΜΟΣΙΕΣ ΘΕΛΟΥΝ ΖΩΝΤΑΝΟ ΔΙΑΚΟΜΙΣΤΗ, Ο ΠΑΓΚΟΣ ΟΧΙ. Ετσι ο έλεγχος τρέχει
// στο CI για τον πίνακα ελέγχου και τοπικά για όλα.
let live = false
try { live = (await fetch(BASE, { signal: AbortSignal.timeout(3000) })).ok } catch { live = false }
if (!live) console.log(`(οι δημόσιες σελίδες παραλείπονται: δεν απαντά το ${BASE})`)

// Ο ανιχνευτής μπαγιάτικου διακομιστή ζει στο scripts/lib/served-css.mjs, ώστε
// να τον έχουν και οι δύο σαρωτές δημόσιων σελίδων και όχι μόνο αυτός.
if (live) await abortIfStyleless(browser, BASE)

// ═══ ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΣΥΣΚΕΥΗ, ΟΣΟ ΤΡΕΧΕΙ ═══════════════════════════════════════
// Η σάρωση κρατά πάνω από είκοσι λεπτά και δεν τύπωνε τίποτα ώς το τέλος. Ενας
// έλεγχος που μοιάζει κολλημένος τον ξαναπατάς: έτρεξαν δύο αντίγραφα μαζί στο
// ίδιο μηχάνημα, μοιράστηκαν τους πυρήνες και άργησαν και τα δύο. Η γραμμή ανά
// συσκευή λέει πού βρίσκεται και πόσα έχει βρει ώς εκεί.
const rows = []
let done = 0
for (const dev of RUN_DEVICES) {
  const w = dev.w
  const ctx = await browser.newContext({ viewport:{width:w,height:dev.h}, deviceScaleFactor:2, isMobile:w<1100, hasTouch:TOUCH(w), locale:'el-GR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({v:'2026-08',ts:'x'})) } catch {} })
  for (const s of (ONLY ? SCENES.filter(x => ONLY.includes(x)) : SCENES)) {
    const p = await ctx.newPage()
    await p.goto(benchUrl(s, 6), { waitUntil:'networkidle' })
    await p.waitForTimeout(500)
    // ═══ ΤΑ ΚΛΕΙΣΤΑ ΠΤΥΣΣΟΜΕΝΑ ΔΕΝ ΕΛΕΓΧΟΝΤΑΝ ΠΟΤΕ ══════════════════════════
    // Η Αποδοση έχει επτά ενότητες που ανοίγουν με πάτημα και ΟΛΕΣ ξεκινούν
    // κλειστές. Ο έλεγχος μετρούσε επτά επικεφαλίδες και τίποτε άλλο: το
    // διάγραμμα δεκαετίας, ο πίνακας εναλλακτικών, τα πεδία παραμέτρων — όσα
    // δηλαδή φωτογράφησε ο χρήστης — δεν μπήκαν ποτέ σε καμία μέτρηση.
    // Ανοίγουν όλα, σε τρία περάσματα για τα φωλιασμένα.
    for (let pass = 0; pass < 3; pass++) {
      const opened = await p.evaluate(() => {
        const t = [...document.querySelectorAll('.acc-toggle[aria-expanded="false"]')]
        t.forEach(b => b.click())
        return t.length
      })
      if (!opened) break
      await p.waitForTimeout(300)
    }
    // ═══ Η ΚΕΝΗ ΣΚΗΝΗ ΠΕΡΝΑΕΙ ΚΑΘΕ ΕΛΕΓΧΟ ══════════════════════════════════
    // ΤΟ ΧΕΙΡΟΤΕΡΟ ΕΙΔΟΣ ΠΡΑΣΙΝΟΥ. Οταν μπήκε η καρτέλα ενοικιαστή, ο πάγκος
    // τράβηξε module που διαβάζει `process.env.NEXT_PUBLIC_SITE_URL`. Στον
    // περιηγητή το `process` δεν υπάρχει: η απόδοση έσκαγε πριν γράψει τίποτα
    // και η σκηνή έβγαινε ΚΕΝΗ. Σε κενή σελίδα δεν υπάρχει τίποτα κομμένο,
    // τίποτα πάνω στο άλλο, κανένας μικρός στόχος αφής. Πράσινο, χωρίς οθόνη.
    const size = await p.evaluate(() => (document.querySelector('.app-content')?.innerText || '').trim().length)
    if (size < 120) rows.push({ where: `πάγκος ${s} @${w}×${dev.h}`, r: [`Η ΣΚΗΝΗ ΕΙΝΑΙ ΚΕΝΗ (${size} χαρακτήρες)`] })
    const r = await p.evaluate(PROBE)
    if (r.length) rows.push({ where: `πάγκος ${s} @${w}×${dev.h}`, r })
    // ═══ ΚΑΙ ΤΑ ΠΑΝΕΛ ΠΟΥ ΖΟΥΝ ΠΙΣΩ ΑΠΟ ΔΙΑΚΟΠΤΗ ═══════════════════════════
    // ΤΟ ΔΑΝΕΙΟ ΕΧΕΙ ΠΕΝΤΕ ΦΑΚΟΥΣ (απόσβεση, επιτόκιο, ικανότητα, φόρος και
    // αντοχή, πίνακας) και ΜΟΝΟ ΕΝΑΣ αποδίδεται κάθε φορά. Ο έλεγχος έβλεπε
    // τον πρώτο και κανέναν άλλο: τέσσερις οθόνες που ο χρήστης ανοίγει με ένα
    // πάτημα δεν είχαν μετρηθεί ποτέ. Το ίδιο ισχύει για κάθε ομάδα διακοπτών
    // της εφαρμογής, που γράφεται παντού με `aria-pressed`.
    for (const label of (OPENERS[s] || [])) {
      const hit = await p.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === t)
        if (!b) return false
        b.click(); return true
      }, label)
      if (!hit) { rows.push({ where: `πάγκος ${s} @${w}×${dev.h}`, r: [`ΤΟ ΚΟΥΜΠΙ «${label}» ΔΕΝ ΒΡΕΘΗΚΕ`] }); continue }
      await p.waitForTimeout(400)
      const rr = await p.evaluate(PROBE)
      if (rr.length) rows.push({ where: `πάγκος ${s}·${label.slice(0, 14)} @${w}×${dev.h}`, r: rr })
    }
    // ═══ ΕΝΑ ΚΕΛΙ ΔΕΔΟΜΕΝΩΝ ΔΕΝ ΕΙΝΑΙ ΠΑΝΕΛ ══════════════════════════════════
    // Ο βρόχος από κάτω υπάρχει για τα πανέλα που αποδίδονται ένα κάθε φορά.
    // Η Τιμολόγηση όμως έχει ημερολόγιο τιμών: μετρημένα 153 κουμπιά με
    // `aria-pressed`, ένα ανά ημέρα («1195», «2155», …) και όχι 153 οθόνες.
    // Με 550 χιλιοστά αναμονής και δύο σαρώσεις όλου του DOM το καθένα, η
    // σκηνή δεν τελείωνε ΟΥΤΕ ΜΙΑ συσκευή σε μισή ώρα, οπότε ολόκληρη η
    // σάρωση έμοιαζε κολλημένη και ξαναπατιόταν από την αρχή.
    //
    // ΤΟ ΟΡΙΟ ΛΕΓΕΤΑΙ ΔΥΝΑΤΑ. Ενα σιωπηλό κόψιμο διαβάζεται ως «τα κάλυψα
    // όλα». Οι υπόλοιπες σκηνές έχουν 8, 6 και 4 τέτοια κουμπιά, δηλαδή το
    // δώδεκα δεν αγγίζει καμία τους.
    const PRESS_CAP = 12
    const pressAll = await p.evaluate(() =>
      [...new Set([...document.querySelectorAll('button[aria-pressed="false"]')].map(b => (b.textContent || '').trim()).filter(Boolean))])
    const pressLabels = pressAll.slice(0, PRESS_CAP)
    if (pressAll.length > PRESS_CAP) {
      console.log(`     ${s} @${w}: ${pressAll.length} διακόπτες, ανοίγουν οι πρώτοι ${PRESS_CAP}`)
    }
    for (const label of pressLabels) {
      const hit = await p.evaluate((t) => {
        const b = [...document.querySelectorAll('button[aria-pressed="false"]')].find(x => (x.textContent || '').trim() === t)
        if (!b) return false
        b.click(); return true
      }, label)
      if (!hit) continue
      await p.waitForTimeout(300)
      await p.evaluate(() => { document.querySelectorAll('.acc-toggle[aria-expanded="false"]').forEach(b => b.click()) })
      await p.waitForTimeout(250)
      const rr = await p.evaluate(PROBE)
      if (rr.length) rows.push({ where: `πάγκος ${s}·${label.slice(0, 14)} @${w}×${dev.h}`, r: rr })
    }
    await p.close()
  }
  for (const path of (live && !ONLY ? PAGES : [])) {
    const p = await ctx.newPage()
    try { await p.goto(BASE + path, { waitUntil:'networkidle', timeout: 30000 }) } catch { await p.close(); continue }
    await p.waitForTimeout(300)
    const r = await p.evaluate(PROBE)
    if (r.length) rows.push({ where: `${path} @${w}×${dev.h}`, r })
    await p.close()
  }
  await ctx.close()
  done++
  console.log(`  ${String(done).padStart(2)}/${RUN_DEVICES.length} ${String(w).padStart(4)}×${dev.h} · ${rows.length} οθόνες με εύρημα ώς εδώ`)
}
await browser.close()
for (const row of rows) console.log('  ✗ ' + row.where.padEnd(32), (process.env.E2E_ALL ? row.r.join('\n      ') : row.r.slice(0,4).join(' · ') + (row.r.length>4 ? ` (+${row.r.length-4})` : '')))
const total = rows.reduce((a, b) => a + b.r.length, 0)
console.log(`\nΔιάταξη — ${rows.length ? `${rows.length} οθόνες με ${total} ευρήματα` : 'τίποτα κομμένο, τίποτα πάνω στο άλλο, τίποτα έξω'}`)
process.exit(rows.length ? 1 : 0)
