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
import { chromePath } from '/home/user/property/scripts/lib/chrome.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/property/node_modules/playwright-core')

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
    let flow = true
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const pcs = getComputedStyle(n)
      if (pcs.position !== 'static' || pcs.transform !== 'none' || parseFloat(pcs.opacity) < 1) { flow = false; break }
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
    const rg = document.createRange(); rg.selectNodeContents(el)
    for (const r of rg.getClientRects()) if (r.width > 4 && r.height > 4) leaves.push({ el, r, t: el.textContent.trim() })
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
    const rows = new Map()
    let sameW = true, w0 = null
    for (const k of kids) {
      const b = k.getBoundingClientRect()
      if (w0 === null) w0 = b.width
      else if (Math.abs(b.width - w0) > 2) sameW = false
      const key = Math.round(b.top)
      rows.set(key, (rows.get(key) || 0) + 1)
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
const WIDTHS = [375, 430, 768, 820, 900, 1024, 1280, 1440]
const TOUCH = (w) => w < 1100 || w === 1280
const SCENES = ['portfolio','cash','rent','inbox','ledger','checklist','modal','select','compare','loan','pricing','bills','contacts','wizard','roi']
const PAGES = ['/', '/login', '/signup', '/ypologismos-forou-enoikion', '/ypologismos-enfia', '/vraxyxronia-i-makroxronia', '/kathari-apodosi', '/imerologio', '/privacy']
const BASE = process.env.E2E_BASE || 'http://localhost:3100'
// Για να δουλεύεται μία σκηνή χωρίς να τρέχουν και οι 120: E2E_ONLY=roi
const ONLY = process.env.E2E_ONLY ? process.env.E2E_ONLY.split(',') : null
// ΟΙ ΔΗΜΟΣΙΕΣ ΘΕΛΟΥΝ ΖΩΝΤΑΝΟ ΔΙΑΚΟΜΙΣΤΗ, Ο ΠΑΓΚΟΣ ΟΧΙ. Ετσι ο έλεγχος τρέχει
// στο CI για τον πίνακα ελέγχου και τοπικά για όλα.
let live = false
try { live = (await fetch(BASE, { signal: AbortSignal.timeout(3000) })).ok } catch { live = false }
if (!live) console.log(`(οι δημόσιες σελίδες παραλείπονται: δεν απαντά το ${BASE})`)
const rows = []
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport:{width:w,height:w<800?812:1000}, deviceScaleFactor:2, isMobile:w<1100, hasTouch:TOUCH(w), locale:'el-GR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('pos-cookie-consent', JSON.stringify({v:'2026-08',ts:'x'})) } catch {} })
  for (const s of (ONLY ? SCENES.filter(x => ONLY.includes(x)) : SCENES)) {
    const p = await ctx.newPage()
    await p.goto(`file:///home/user/property/.perf-bench/mobile.html?c=${s}&n=6`, { waitUntil:'networkidle' })
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
    const r = await p.evaluate(PROBE)
    if (r.length) rows.push({ where: `πάγκος ${s} @${w}`, r })
    // ═══ ΚΑΙ ΤΑ ΠΑΝΕΛ ΠΟΥ ΖΟΥΝ ΠΙΣΩ ΑΠΟ ΔΙΑΚΟΠΤΗ ═══════════════════════════
    // ΤΟ ΔΑΝΕΙΟ ΕΧΕΙ ΠΕΝΤΕ ΦΑΚΟΥΣ (απόσβεση, επιτόκιο, ικανότητα, φόρος και
    // αντοχή, πίνακας) και ΜΟΝΟ ΕΝΑΣ αποδίδεται κάθε φορά. Ο έλεγχος έβλεπε
    // τον πρώτο και κανέναν άλλο: τέσσερις οθόνες που ο χρήστης ανοίγει με ένα
    // πάτημα δεν είχαν μετρηθεί ποτέ. Το ίδιο ισχύει για κάθε ομάδα διακοπτών
    // της εφαρμογής, που γράφεται παντού με `aria-pressed`.
    const pressLabels = await p.evaluate(() =>
      [...document.querySelectorAll('button[aria-pressed="false"]')].map(b => (b.textContent || '').trim()).filter(Boolean))
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
      if (rr.length) rows.push({ where: `πάγκος ${s}·${label.slice(0, 14)} @${w}`, r: rr })
    }
    await p.close()
  }
  for (const path of (live && !ONLY ? PAGES : [])) {
    const p = await ctx.newPage()
    try { await p.goto(BASE + path, { waitUntil:'networkidle', timeout: 30000 }) } catch { await p.close(); continue }
    await p.waitForTimeout(300)
    const r = await p.evaluate(PROBE)
    if (r.length) rows.push({ where: `${path} @${w}`, r })
    await p.close()
  }
  await ctx.close()
}
await browser.close()
for (const row of rows) console.log('  ✗ ' + row.where.padEnd(32), (process.env.E2E_ALL ? row.r.join('\n      ') : row.r.slice(0,4).join(' · ') + (row.r.length>4 ? ` (+${row.r.length-4})` : '')))
const total = rows.reduce((a, b) => a + b.r.length, 0)
console.log(`\nΔιάταξη — ${rows.length ? `${rows.length} οθόνες με ${total} ευρήματα` : 'τίποτα κομμένο, τίποτα πάνω στο άλλο, τίποτα έξω'}`)
process.exit(rows.length ? 1 : 0)
