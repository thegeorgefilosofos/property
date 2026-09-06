// ═══════════════════════════════════════════════════════════════════════════
// ΔΙΑΤΑΞΗ: ΤΙ ΞΕΦΕΥΓΕΙ, ΤΙ ΚΟΒΕΤΑΙ, ΤΙ ΔΕΝ ΠΙΑΝΕΤΑΙ, ΤΙ ΔΕΝ ΔΙΑΒΑΖΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΡΙΑ ΤΕΧΝΟΥΡΓΗΜΑΤΑ ΠΟΥ ΚΟΣΤΙΣΑΝ ΩΡΕΣ ΠΡΙΝ ΑΝΑΓΝΩΡΙΣΤΟΥΝ, ΚΑΙ ΓΡΑΦΟΝΤΑΙ ΕΔΩ
// ΩΣΤΕ ΝΑ ΜΗΝ ΞΑΝΑΨΑΧΤΟΥΝ:
//
//   1. ΤΑ ΠΑΙΔΙΑ ΚΛΕΙΣΤΟΥ <details>. Ο περιηγητής τα κρύβει με
//      content-visibility, όχι με display: το τρίπτυχο display/visibility/
//      opacity τα έβλεπε ορατά και ανέφερε δεκάδες ψεύτικα. Το checkVisibility
//      με contentVisibilityAuto τα λέει σωστά.
//   2. Η ΚΟΛΛΗΜΕΝΗ ΚΕΦΑΛΙΔΑ. Περνά πάνω από τη σελίδα καθώς κυλά και αυτό
//      ΕΙΝΑΙ η σχεδίαση. Κρατιούνται μόνο τα ζεύγη που μοιράζονται στρώση.
//   3. ΟΙ ΕΝΟΤΗΤΕΣ .lp-reveal. Η κίνησή τους οδηγείται από την κύλιση
//      (animation-timeline: view()), άρα ό,τι είναι κάτω από το πτυχωτό στέκει
//      μόνιμα στα translateY(24px) της αρχής και δείχνει μετατοπισμένο. Η ίδια
//      η σελίδα σβήνει την κίνηση στο prefers-reduced-motion, οπότε μετράμε
//      από εκεί: όχι παράκαμψη, αλλά πραγματική διαδρομή χρήστη με τη διάταξη
//      ακίνητη.
//
//   4. ΤΟ ΚΥΛΗΜΕΝΟ ΕΚΤΟΣ ΔΟΧΕΙΟΥ. Το getBoundingClientRect δίνει θέση ΚΑΙ σε
//      στοιχείο που έχει κυλήσει έξω από το ορατό της λίστας του: το στοιχείο
//      είναι κομμένο και αόρατο, αλλά το ορθογώνιό του «συγκρούεται» με ό,τι
//      ζωγραφίζεται από κάτω. Μετρημένο στην οθόνη ενοικίων στα 390: ένα πεδίο
//      ημερομηνίας στα 771…815 μέσα σε λίστα που φαίνεται 104…688 έβγαζε δύο
//      ψεύτικες επικαλύψεις με τα κουμπιά του υποσέλιδου, σε τρία πλάτη.
//
// ΚΑΙ ΕΝΑ ΠΕΜΠΤΟ ΣΤΟ ΟΡΙΟ ΑΦΗΣ: το όριο των 44 είναι για ΔΑΧΤΥΛΟ. Στον
// φορητό με ποντίκι το ίδιο κουμπί των 36 δεν είναι ελάττωμα και το να
// αναφέρεται ως τέτοιο θάβει τα πραγματικά ευρήματα του κινητού.
// ═══════════════════════════════════════════════════════════════════════════

export const AUDIT = ({ vw, touch }) => {
  const out = { bleed: [], small: [], tiny: [], clipped: [], overlap: [] };
  const seen = new Set();
  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const c = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ` «${t}»` : ''}`;
  };
  const shown = (el) => el.checkVisibility &&
    el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true, opacityProperty: true });
  const inScrollerX = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.overflowX === 'auto' || c.overflowX === 'scroll') return true;
    }
    return false;
  };
  /**
   * Εχει κυλήσει έξω από το ορατό της λίστας του;
   *
   * Τότε είναι κομμένο και αόρατο, όσο κι αν το ορθογώνιό του λέει άλλα.
   */
  const scrolledOut = (el, r) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.overflowY !== 'auto' && c.overflowY !== 'scroll'
        && c.overflowX !== 'auto' && c.overflowX !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      return r.top >= pr.bottom - 0.5 || r.bottom <= pr.top + 0.5
        || r.left >= pr.right - 0.5 || r.right <= pr.left + 0.5;
    }
    return false;
  };

  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (scrolledOut(el, r)) continue;

    // ── 1. Ξεφεύγει οριζόντια ──
    if (cs.position !== 'fixed' && !el.classList.contains('skip-link')
      && (r.right > vw + 1 || r.left < -1) && !inScrollerX(el)) {
      const k = 'b' + label(el);
      if (!seen.has(k)) { seen.add(k); out.bleed.push(`${label(el)} [${Math.round(r.left)}…${Math.round(r.right)}]`); }
    }

    // ── 2. Στόχος αφής κάτω από 44 ──
    const tappable = /^(a|button|summary)$/.test(el.tagName.toLowerCase())
      || (el.tagName === 'INPUT' && !/hidden|range/.test(el.type))
      || el.tagName === 'SELECT' || el.getAttribute('role') === 'button';
    if (touch && tappable && !el.closest('[aria-hidden="true"]')) {
      const inProse = el.tagName === 'A' && el.parentElement
        && /^(p|li|span|small|td)$/.test(el.parentElement.tagName.toLowerCase())
        && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length + 8;
      const lab = el.closest('label');
      const labOk = lab && lab.getBoundingClientRect().height >= 43.5 && lab.getBoundingClientRect().width >= 43.5;
      // Οι κλάσεις δηλώνουν ρητά ότι η περιοχή αφής είναι ψευδοστοιχείο
      // μεγαλύτερο από το πλαίσιο· ο μετρητής βλέπει πλαίσια.
      const pseudoTap = el.classList.contains('po-box') || el.classList.contains('po-tap-inline')
        || el.classList.contains('po-field-inner');
      if (!inProse && !labOk && !pseudoTap && (r.height < 43.5 || r.width < 43.5)) {
        const k = 's' + label(el);
        if (!seen.has(k)) { seen.add(k); out.small.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`); }
      }
    }

    // ── 3. Κείμενο κάτω από 11px ──
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own && parseFloat(cs.fontSize) < 10.9) {
      const k = 't' + label(el);
      if (!seen.has(k)) { seen.add(k); out.tiny.push(`${label(el)} ${cs.fontSize}`); }
    }

    // ── 4. Κόβεται από πρόγονο που κρύβει το ξεχείλισμα ──
    // ═══ ΤΟ ΨΑΛΙΔΙ ΚΟΒΕΙ ΜΟΝΟ ΟΣΑ ΚΡΕΜΟΝΤΑΙ ΑΠΟ ΑΥΤΟ ═══════════════════════
    // Ο έλεγχος περπατούσε το δέντρο και έβγαζε συμπέρασμα από τη ΣΥΓΓΕΝΕΙΑ.
    // Ομως το `overflow: hidden` ενός προγόνου δεν αγγίζει απόγονο που έχει
    // βγει από το περιέχον μπλοκ του:
    //
    //   `position: fixed`  → το περιέχον μπλοκ είναι το ΠΑΡΑΘΥΡΟ. Κανένα
    //     ψαλίδι από πάνω δεν ισχύει, εκτός αν κάποιος πρόγονος φτιάχνει
    //     περιέχον μπλοκ με transform/filter/perspective/contain.
    //   `position: absolute` → το περιέχον μπλοκ είναι ο πλησιέστερος
    //     ΤΟΠΟΘΕΤΗΜΕΝΟΣ πρόγονος. Ενας `static` πρόγονος με overflow hidden
    //     δεν είναι στη διαδρομή του, άρα δεν το κόβει.
    //
    // ΤΙ ΚΟΣΤΙΣΕ Η ΠΑΡΑΛΕΙΨΗ: τα παράθυρα ολόκληρης οθόνης — Σάρωση εγγράφου,
    // Νέο ακίνητο, Καταστάσεις ιδιοκτήτη, Είσπραξη ενοικίων — και ΚΑΘΕ παιδί
    // τους αναφέρονταν «κομμένα» από το `.app-content`, που έχει overflow
    // hidden και ξεκινά στα 151. ΜΕΤΡΗΜΕΝΟ: το παράθυρο είναι top 0, ύψος 844,
    // όσο ακριβώς το παράθυρο του περιηγητή. Δεν κόβεται ούτε ένα
    // εικονοστοιχείο. Ηταν 28 από τα 90 ευρήματα, σε επτά πλάτη.
    let escaped = cs.position === 'fixed';
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (escaped) {
        // Μόνο πρόγονος που φτιάχνει περιέχον μπλοκ ξαναπιάνει ένα `fixed`.
        if (pc.transform !== 'none' || pc.filter !== 'none' || pc.perspective !== 'none'
          || /paint|layout/.test(pc.contain || '')
          || /transform|filter|perspective/.test(pc.willChange || '')) escaped = false;
        else continue;
      }
      if (pc.position === 'fixed') { escaped = true; continue; }
      if (pc.overflowY === 'visible') continue;
      if (cs.position === 'absolute' && pc.position === 'static') continue;
      const pr = p.getBoundingClientRect();
      const top = pr.top + parseFloat(pc.borderTopWidth || 0);
      if (r.top < top - 0.5 && r.bottom > top) {
        const k = 'c' + label(el);
        if (!seen.has(k)) { seen.add(k); out.clipped.push(`${label(el)} κόβεται ${Math.round(top - r.top)}px από ${label(p)}`); }
      }
      break;
    }
  }

  // ── 5. Δύο στόχοι αφής που επικαλύπτονται, στην ΙΔΙΑ στρώση ──
  const layer = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const pos = getComputedStyle(a).position;
      if (pos === 'sticky' || pos === 'fixed') return a;
    }
    return null;
  };
  // ═══ ΤΟ ΟΡΘΟΓΩΝΙΟ ΠΟΥ ΦΑΙΝΕΤΑΙ, ΟΧΙ ΤΟ ΟΡΘΟΓΩΝΙΟ ΠΟΥ ΔΗΛΩΝΕΤΑΙ ═══════════
  // Το `getBoundingClientRect` επιστρέφει τη ΓΕΩΜΕΤΡΙΑ, όχι ό,τι βλέπει το
  // μάτι: ένα κουμπί μέσα σε περιοχή κύλισης κρατά ολόκληρο το ύψος του ακόμη
  // κι όταν το δοχείο το κόβει στη μέση. Μετρημένο στον οδηγό ακινήτου, σε
  // 1024×768: η επιλογή «Ιδιοχρησία» δηλώνει 656→745, ο κύλινδρός της
  // τελειώνει στο 663 και το υποσέλιδο ξεκινά στο 678. Το ορατό κομμάτι της
  // επιλογής είναι εφτά εικονοστοιχεία και ΔΕΝ αγγίζει το υποσέλιδο — ο
  // έλεγχος όμως σύγκρινε τα 745 και ανέφερε σύγκρουση με «Ακύρωση» και
  // «Συνέχεια». Τρία ευρήματα που περιέγραφαν κύλιση, όχι ελάττωμα.
  //
  // Ενα ψευδές εύρημα κοστίζει διπλά: τρώει προσοχή και ανεβάζει το όριο του
  // καστάνιου, δηλαδή κρύβει τρία ΑΛΗΘΙΝΑ που θα χωρούσαν από κάτω του.
  const clipped = (el) => {
    let r = el.getBoundingClientRect();
    let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      const clipsY = c.overflowY === 'auto' || c.overflowY === 'scroll' || c.overflowY === 'hidden';
      const clipsX = c.overflowX === 'auto' || c.overflowX === 'scroll' || c.overflowX === 'hidden';
      if (!clipsY && !clipsX) continue;
      const pr = p.getBoundingClientRect();
      if (clipsY) { box.top = Math.max(box.top, pr.top); box.bottom = Math.min(box.bottom, pr.bottom); }
      if (clipsX) { box.left = Math.max(box.left, pr.left); box.right = Math.min(box.right, pr.right); }
    }
    return box;
  };

  const taps = [...document.querySelectorAll('a,button,summary,[role="button"]')].filter(e => {
    if (!shown(e)) return false;
    const r = e.getBoundingClientRect();
    if (scrolledOut(e, r)) return false;
    return r.width > 4 && r.height > 4 && r.top > -50 && r.top < 20000;
  });
  for (let i = 0; i < taps.length; i++) for (let j = i + 1; j < taps.length; j++) {
    if (taps[i].contains(taps[j]) || taps[j].contains(taps[i])) continue;
    if (layer(taps[i]) !== layer(taps[j])) continue;
    if (taps[i].getClientRects().length > 1 || taps[j].getClientRects().length > 1) continue;
    const a = clipped(taps[i]), b = clipped(taps[j]);
    // ═══ ΣΥΓΚΡΟΥΣΗ ΕΙΝΑΙ Η ΜΕΡΙΚΗ ΕΠΙΚΑΛΥΨΗ, ΟΧΙ Η ΠΛΗΡΗΣ ══════════════════
    // Το κουμπί ενεργειών «···» κάθεται ΕΠΙΤΗΔΕΣ πάνω στην κάρτα του, σε
    // απόλυτη θέση· είναι πατήσιμη κι η ίδια η κάρτα. Το `contains` δεν το
    // πιάνει όταν τα δύο δεν είναι γονιός-παιδί στο DOM, οπότε ο έλεγχος
    // ανέφερε δεκαέξι φορές μια στρώση που ΕΙΝΑΙ ο σχεδιασμός: το μικρό κουμπί
    // είναι από πάνω, το παίρνει το πάτημα, η κάρτα παίρνει τα υπόλοιπα.
    // ΠΛΗΡΗΣ ΕΓΚΛΕΙΣΜΟΣ = ηθελημένη στρώση. ΜΕΡΙΚΗ = δύο στόχοι που τσακώνονται
    // για τα ίδια εικονοστοιχεία, δηλαδή το πραγματικό ελάττωμα.
    const inside = (x, y) => x.left >= y.left - 1 && x.right <= y.right + 1
                          && x.top >= y.top - 1 && x.bottom <= y.bottom + 1;
    if (inside(a, b) || inside(b, a)) continue;
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) {
      const k = 'o' + label(taps[i]) + label(taps[j]);
      if (!seen.has(k)) { seen.add(k); out.overlap.push(`${label(taps[i])} ↔ ${label(taps[j])}`); }
    }
  }
  return out;
};

/** Το ελάττωμα που ξαναμπαίνει στη λειτουργία απόδειξης. */
export const LAYOUT_BUG = `
  .lp-cta, .po-btn { min-height: 12px !important; height: 12px !important; padding: 0 !important; }
  footer p, .po-tool-lede { font-size: 7px !important; }
  main > section:first-of-type, .po-tool-page > main { width: 3000px !important; max-width: none !important; }
`;
