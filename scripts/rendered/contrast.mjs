// ═══════════════════════════════════════════════════════════════════════════
// ΑΝΤΙΘΕΣΗ ΟΠΩΣ ΤΗ ΒΛΕΠΕΙ ΤΟ ΜΑΤΙ, ΟΧΙ ΟΠΩΣ ΤΗ ΔΗΛΩΝΕΙ ΤΟ TOKEN
// ─────────────────────────────────────────────────────────────────────────
// Ο φύλακας πηγαίου λύνει τα var() αλλά όχι τα color-mix(). Ο περιηγητής λύνει
// και τα δύο και δίνει το χρώμα που ΠΡΑΓΜΑΤΙΚΑ ζωγραφίστηκε.
//
// ΔΥΟ ΛΑΘΗ ΠΟΥ ΕΚΑΝΕ Ο ΙΔΙΟΣ Ο ΜΕΤΡΗΤΗΣ, ΚΑΙ ΓΡΑΦΟΝΤΑΙ ΓΙΑ ΝΑ ΜΗΝ ΞΑΝΑΓΙΝΟΥΝ:
//
//   1. ΣΤΑΜΑΤΟΥΣΕ ΣΤΗΝ ΠΡΩΤΗ ΔΙΑΒΑΘΜΙΣΗ και συνέθετε τις στάσεις της πάνω σε
//      υποτιθέμενο ΛΕΥΚΟ. Η αρχική βάφει το .lp-root με ημιδιαφανείς κηλίδες
//      πάνω από σκούρο body: συντεθειμένες σε λευκό έβγαιναν σχεδόν λευκές,
//      και ο μετρητής ανέφερε 96 «λευκά σε λευκό» — ανάμεσά τους ο τίτλος της
//      αρχικής. Ελεγμένο με στιγμιότυπο: λευκό σε σκούρο μπλε, μια χαρά.
//   2. ΔΙΑΒΑΖΕ ΤΙΣ ΣΤΡΩΣΕΙΣ ΣΑΝ ΜΙΑ ΛΙΣΤΑ. Η CSS ζωγραφίζει την ΤΕΛΕΥΤΑΙΑ
//      δηλωμένη στρώση από κάτω. Το .lp-root δηλώνει τέσσερις: τρεις διαφανείς
//      κηλίδες και, τελευταία, το αδιαφανές σκούρο που ΕΙΝΑΙ το φόντο.
//
// Σήμερα το φόντο βρίσκεται με τη σειρά που ζωγραφίζει ο περιηγητής: από το
// στοιχείο προς τα έξω, σταμάτημα στο πρώτο αδιαφανές και οι στρώσεις κάθε
// στοιχείου από κάτω προς τα πάνω.
// ═══════════════════════════════════════════════════════════════════════════

export const MEASURE = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const stopsOf = (img) => {
    const out = [];
    for (const m of img.matchAll(/rgba?\([^)]+\)/g)) { const c = parse(m[0]); if (c) out.push(c); }
    return out;
  };
  /** Οι στρώσεις του background-image. Το κόμμα μέσα σε rgb() ή color-mix() ΔΕΝ χωρίζει. */
  const layersOf = (img) => {
    const out = []; let depth = 0, cur = '';
    for (const ch of img) {
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  };
  const paintOf = (a) => {
    const cs = getComputedStyle(a);
    const base = parse(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
    if (!cs.backgroundImage || cs.backgroundImage === 'none') return [base];
    if (!stopsOf(cs.backgroundImage).length) return 'image';   // εικόνα: αμέτρητη
    let cands = [base];
    for (const layer of layersOf(cs.backgroundImage).reverse()) {
      const stops = stopsOf(layer);
      if (!stops.length) continue;
      const next = [];
      for (const b of cands) for (const st of stops) next.push(st.a >= 0.999 || b.a === 0 ? st : over(st, b));
      cands = next.slice(0, 24);
    }
    return cands;
  };
  const bgOf = (el) => {
    let acc = null;
    for (let a = el; a; a = a.parentElement) {
      const p = paintOf(a);
      if (p === 'image') return 'image';
      const layer = p.filter(c => c.a > 0);
      if (!layer.length) continue;
      acc = acc === null ? layer
        : acc.flatMap(top => layer.map(b => (top.a >= 0.999 ? top : over(top, b)))).slice(0, 24);
      if (acc.every(c => c.a >= 0.999)) return acc;
    }
    const b = parse(getComputedStyle(document.body).backgroundColor);
    return acc && acc.length ? acc : [b && b.a > 0 ? b : { r: 255, g: 255, b: 255, a: 1 }];
  };

  const out = []; let skipped = 0;
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility || !el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true })) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    const cs = getComputedStyle(el);
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const bgs = bgOf(el);
    if (bgs === 'image') { skipped++; continue; }
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    // Η ΧΕΙΡΟΤΕΡΗ ΣΤΑΣΗ ΚΡΙΝΕΙ: αν το κείμενο περνά ακόμη και πάνω από το πιο
    // δυσμενές σημείο της διαβάθμισης, περνά σε ολόκληρη.
    let r = Infinity, bg = bgs[0];
    for (const b of bgs) {
      const x = ratio(fg0.a < 1 ? over(fg0, b) : fg0, b);
      if (x < r) { r = x; bg = b; }
    }
    if (r >= need - 0.02) continue;
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34);
    const k = `${cs.color}|${t}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ t, ratio: +r.toFixed(2), need, size: Math.round(size), fg: cs.color,
      bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
  }
  return { rows: out.sort((a, b) => a.ratio - b.ratio), skipped };
};

/** Το κύριο κείμενο ένα βήμα από το φόντο του: όλα οφείλουν να κοκκινίσουν. */
export const CONTRAST_BUG =
  ':root, .lp-root { --text-primary: #7c7c7c !important; --mkt-text-primary: #7c7c7c !important; }';
