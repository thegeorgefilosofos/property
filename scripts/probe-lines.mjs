// ═══════════════════════════════════════════════════════════════════════════
// ΔΟΚΙΜΗ ΥΠΟΨΗΦΙΩΝ ΚΕΙΜΕΝΩΝ ΧΩΡΙΣ ΞΑΝΑΧΤΙΣΙΜΟ
// ─────────────────────────────────────────────────────────────────────────
// Αδελφό του measure-lines: αντί να μετρήσει ό,τι υπάρχει, γράφει διαδοχικά
// υποψήφια κείμενα ΜΕΣΑ στο πραγματικό στοιχείο και μετράει το καθένα. Έτσι
// δέκα παραλλαγές δοκιμάζονται σε δευτερόλεπτα αντί για δέκα builds.
//
// ΧΡΗΣΗ: node scripts/probe-lines.mjs <πλάτος> <selector> <αρχείο> [nth]
// Το αρχείο έχει μία υποψήφια πρόταση ανά γραμμή. Το `nth` διαλέγει ποιο
// στοιχείο του selector θα φιλοξενήσει τη δοκιμή (μηδενική βάση).
// ═══════════════════════════════════════════════════════════════════════════
// Δοκιμάζει υποψήφια κείμενα ΜΕΣΑ στο πραγματικό στοιχείο, χωρίς ξαναχτίσιμο.
// node probe.mjs <πλάτος> <selector> <αρχείο-με-μία-πρόταση-ανά-γραμμή>
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const w = Number(process.argv[2]) || 1160;
const sel = process.argv[3];
const cands = readFileSync(process.argv[4], 'utf8').split('\n').filter(Boolean);
const nth = Number(process.argv[5]) || 0;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: w, height: 1000 } });
await p.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
await p.evaluate(() => { document.querySelectorAll('.lp-reveal').forEach(e => { e.style.opacity='1'; e.style.transform='none'; }); document.querySelectorAll('details').forEach(d => d.open = true); });
const out = await p.evaluate(({ sel, cands, nth }) => {
  const el = document.querySelectorAll(sel)[nth];
  const box = el.getBoundingClientRect().width;
  const res = [];
  for (const c of cands) {
    el.textContent = c;
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rects = []; let n;
    while ((n = walker.nextNode())) { r.selectNodeContents(n); rects.push(...Array.from(r.getClientRects())); }
    const byTop = new Map();
    for (const rc of rects) { const k = Math.round(rc.top); byTop.set(k, (byTop.get(k)||0) + rc.width); }
    res.push({ c, box: Math.round(box), lines: [...byTop.entries()].sort((a,b)=>a[0]-b[0]).map(([,v]) => Math.round(v/box*100)) });
  }
  return res;
}, { sel, cands, nth });
for (const r of out) console.log(`[${r.lines.join(' ')}]`.padEnd(18) + r.c);
await b.close();
