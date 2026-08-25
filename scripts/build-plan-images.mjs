#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΕΣΣΕΡΙΣ ΕΙΚΟΝΕΣ ΠΡΟΪΟΝΤΟΣ ΤΟΥ ΕΜΠΟΡΟΥ
// ─────────────────────────────────────────────────────────────────────────
// ΠΟΥ ΠΑΝΕ. Lemon Squeezy → κάθε προϊόν → Media. Είναι η εικόνα που βλέπει ο
// πελάτης στο ταμείο, τη στιγμή που βγάζει την κάρτα του, και ήταν η τελευταία
// επιφάνεια με το παλιό σήμα: ζει έξω από το αποθετήριο, οπότε καμία
// μετονομασία δεν την αγγίζει μόνη της.
//
// ΤΑ ΟΝΟΜΑΤΑ ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΕΔΩ. Διαβάζονται από το lib/billing/plans.ts, που
// είναι η ίδια πηγή με την οθόνη τιμών και με τη βάση. Ενα όνομα πακέτου
// γραμμένο δεύτερη φορά θα απέκλινε, και η απόκλιση θα φαινόταν στο ταμείο.
//
// ── ΓΙΑΤΙ ΔΕΝ ΜΠΑΙΝΕΙ ΤΙΜΗ ΠΑΝΩ ΣΤΗΝ ΕΙΚΟΝΑ ─────────────────────────────
// Η εικόνα ανεβαίνει με το χέρι και ζει στον έμπορο. Μια αύξηση τιμής δεν την
// ενημερώνει, και θα έμενε να ανακοινώνει παλιό ποσό δίπλα στο νέο. Το ταμείο
// γράφει ήδη την τιμή, σωστά, από μόνο του.
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { assertFontApplied } from './lib/font-ready.mjs';

const CHROME = chromePath();
const OUT = 'docs/marketing/plan-images';
const NAVY = '#0B192C';
const WHITE = '#ffffff';
const MUTED = '#9fb0c4';
const PX = 1024;

// ── Το σχήμα, από την ίδια πηγή με κάθε άλλο σημείο ──────────────────────
const brand = readFileSync('components/BrandMark.tsx', 'utf8');
const shapeBlock = /const SHAPE = \[([\s\S]*?)\n\];/.exec(brand);
if (!shapeBlock) throw new Error('Δεν βρέθηκε ο κατάλογος SHAPE στο BrandMark.tsx');
const SHAPE = [...shapeBlock[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
const VIEWBOX = /const BRAND_VIEWBOX = '([^']+)'/.exec(brand)[1];

// ── Τα πακέτα, από την ίδια πηγή με την οθόνη τιμών ──────────────────────
const plans = readFileSync('lib/billing/plans.ts', 'utf8');
const PAID = ['solo', 'owner', 'agency', 'office'];
const read = (id) => {
  const re = new RegExp(`id: '${id}', name: '([^']+)'[\\s\\S]{0,400}?tagline: '([^']+)'`);
  const m = re.exec(plans);
  if (!m) throw new Error(`Δεν βρέθηκε το πακέτο «${id}» στο lib/billing/plans.ts`);
  return { id, name: m[1], tagline: m[2] };
};

// Η ΙΔΙΑ ΓΡΑΜΜΑΤΟΣΕΙΡΑ ΜΕ ΤΗΝ ΕΦΑΡΜΟΓΗ, ΑΠΟ ΤΟΝ ΔΙΣΚΟ
// ─────────────────────────────────────────────────────────────────────────
// Εδώ υπήρχε ένα `preconnect` προς το Google Fonts που ΔΕΝ φόρτωνε ποτέ φύλλο
// στυλ: οι εικόνες των προϊόντων βγήκαν στην εφεδρική γραμματοσειρά του
// συστήματος, δηλαδή σε άλλη γραμματοσειρά από την εφαρμογή που διαφημίζουν.
// Τα ίδια αρχεία woff2 που σερβίρει η εφαρμογή μπαίνουν τώρα ενσωματωμένα:
// ίδια όψη, καμία εξωτερική κλήση, και η κατασκευή δουλεύει χωρίς δίκτυο.
const FONT_FACES = ['inter-latin', 'inter-latin-ext', 'inter-greek'].map(f =>
  `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${
    readFileSync(new URL(`../public/fonts/${f}.woff2`, import.meta.url)).toString('base64')})format('woff2')}`
).join('');

const page = ({ name, tagline }) => `<!doctype html><meta charset="utf-8">
<style>${FONT_FACES}</style>
<body style="margin:0">
<div style="width:${PX}px;height:${PX}px;background:${NAVY};display:flex;flex-direction:column;
            justify-content:center;align-items:center;gap:0;
            font-family:'Inter',-apple-system,'Helvetica Neue',Arial,sans-serif;text-align:center;padding:0 86px;box-sizing:border-box">
  <svg width="150" height="150" viewBox="${VIEWBOX}" fill="${WHITE}" fill-rule="nonzero">
    ${SHAPE.map(d => `<path d="${d}"/>`).join('')}
  </svg>
  <div style="color:${WHITE};font-size:44px;font-weight:800;letter-spacing:0.09em;margin-top:38px">PROPERWISE</div>
  <div style="width:64px;height:3px;background:${MUTED};opacity:.5;margin:44px 0"></div>
  <div style="color:${WHITE};font-size:82px;font-weight:800;letter-spacing:-0.02em;line-height:1.06">${name}</div>
  <div style="color:${MUTED};font-size:38px;font-weight:400;line-height:1.4;margin-top:26px">${tagline}</div>
</div></body>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const made = [];
for (const id of PAID) {
  const plan = read(id);
  const p = await browser.newPage({ viewport: { width: PX, height: PX } });
  await p.setContent(page(plan));
  // Η σιωπηλή εφεδρική γραμματοσειρά είναι ακριβώς το σφάλμα που έβγαλε αυτές
  // τις τέσσερις εικόνες εκτός ταυτότητας. Σκάει, δεν ζωγραφίζει.
  await assertFontApplied(p, { family: 'Inter', weight: '800', where: `εικόνα «${id}»` });
  const file = `${OUT}/${id}.png`;
  await p.locator('div').first().screenshot({ path: file });
  await p.close();
  made.push(`${file}  ${plan.name} — ${plan.tagline}`);
}
await browser.close();

writeFileSync(`${OUT}/ODIGIES.txt`,
  'Οι εικόνες προϊόντος για το Lemon Squeezy.\n'
  + 'Παράγονται από το scripts/build-plan-images.mjs. Μην τις φτιάξεις με το χέρι:\n'
  + 'το σχήμα έρχεται από το components/BrandMark.tsx και τα ονόματα από το\n'
  + 'lib/billing/plans.ts, ώστε να μην μπορούν να αποκλίνουν από την εφαρμογή.\n\n'
  + 'Ανέβασμα: Lemon Squeezy -> Products -> κάθε προϊόν -> Media -> αντικατάσταση.\n\n'
  + made.join('\n') + '\n');

console.log(`✓ ${made.length} εικόνες προϊόντος στο ${OUT}`);
for (const m of made) console.log('  ' + m);
