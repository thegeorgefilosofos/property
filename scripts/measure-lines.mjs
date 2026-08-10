// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΣΟ ΓΕΜΙΖΕΙ ΚΑΘΕ ΓΡΑΜΜΗ ΚΕΙΜΕΝΟΥ ΤΟ ΠΛΑΤΟΣ ΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Ένα κείμενο «πάει μέχρι πέρα» όταν κάθε γραμμή του πιάνει σχεδόν όλο το
// πλάτος του κουτιού. Με το μάτι δεν κρίνεται: μια γραμμή στο 74% μοιάζει
// γεμάτη δίπλα σε μια στο 97%. Το εργαλείο μετράει τα ΠΡΑΓΜΑΤΙΚΑ ορθογώνια
// κάθε γραμμής (Range.getClientRects, ομαδοποιημένα ανά κορυφή) και τυπώνει
// το ποσοστό πλήρωσης ανά γραμμή.
//
// ΧΡΗΣΗ (χρειάζεται τρέχοντα server στο 3111):
//   npm run build && PORT=3111 npx next start &
//   node scripts/measure-lines.mjs 1160 "section p"
//
// ΚΑΝΟΝΑΣ: κάθε γραμμή πάνω από μία να είναι ≥ 88%. Εξαίρεση μόνο όταν δεν
// επαρκούν οι λέξεις, δηλαδή σε στοιχεία μίας γραμμής.
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright-core';
const w = Number(process.argv[2]) || 1160;
const sel = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: w, height: 1000 } });
await p.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
await p.evaluate(() => { document.querySelectorAll('.lp-reveal').forEach(e => { e.style.opacity='1'; e.style.transform='none'; }); document.querySelectorAll('details').forEach(d => d.open = true); });
await p.waitForTimeout(600);
const rows = await p.evaluate(sel => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const box = el.getBoundingClientRect().width;
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const rects = []; let n;
    while ((n = walker.nextNode())) { r.selectNodeContents(n); rects.push(...Array.from(r.getClientRects())); }
    const byTop = new Map();
    for (const rc of rects) { const k = Math.round(rc.top); byTop.set(k, (byTop.get(k)||0) + rc.width); }
    const lines = [...byTop.entries()].sort((a,b)=>a[0]-b[0]).map(([,v]) => Math.round(v/box*100));
    if (!lines.length) continue;
    out.push({ t: (el.textContent||'').trim().slice(0,30), box: Math.round(box), lines });
  }
  return out;
}, sel);
for (const r of rows) console.log(`box ${r.box}  [${r.lines.join(' ')}]  ${r.t}`);
await b.close();
