// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΙΚΟΝΕΣ ΤΟΥ ΚΑΤΑΣΤΗΜΑΤΟΣ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΑ ΙΔΙΑ ΤΑ ΠΑΚΕΤΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΠΑΡΑΓΟΝΤΑΙ ΚΑΙ ΔΕΝ ΣΧΕΔΙΑΖΟΝΤΑΙ ΜΙΑ ΦΟΡΑ. Το κατάστημα δείχνει τιμή,
// όριο ακινήτων, χαρακτηριστικά και πακέτο ερωτήσεων. Και τα τέσσερα ζουν ήδη
// στον κώδικα (lib/billing/plans.ts, aiLimits.ts) και αλλάζουν. Μια εικόνα
// φτιαγμένη με το χέρι θα έλεγε την παλιά τιμή την επομένη μιας αλλαγής, σε
// σελίδα όπου ο επισκέπτης βγάζει κάρτα. Ενα λάθος νούμερο εκεί δεν είναι
// αισθητικό θέμα.
//
// ΤΡΕΙΣ ΕΙΚΟΝΕΣ ΑΝΑ ΠΑΚΕΤΟ, ΤΡΕΙΣ ΔΙΑΦΟΡΕΤΙΚΕΣ ΕΡΩΤΗΣΕΙΣ:
//   1. «Τι είναι» — τετράγωνη, για τη μικρογραφία του προϊόντος.
//   2. «Τι περιλαμβάνει» — πλατιά, η λίστα καθαρή.
//   3. «Τι κοστίζει» — πλατιά, μήνας και χρόνος δίπλα δίπλα.
//
// ΤΟ ΣΥΣΤΗΜΑ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ ΤΙΣ ΑΝΑΡΤΗΣΕΙΣ: ίδιο έδαφος, ίδιο μελάνι, ίδια
// γραμματοσειρά, ίδια υπογραφή κάτω αριστερά. Η σύνθεση αλλάζει ανά ερώτηση.
//
// ΧΡΗΣΗ:  npx tsx scripts/brand/store.ts
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { PLANS, PLAN_ORDER, TRIAL_DAYS, type PlanId } from '../../lib/billing/plans';
import { aiLimitsFor } from '../../lib/billing/aiLimits';
import { fe } from '../../lib/core/format';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { chromePath } = require('../lib/chrome.mjs');
const CHROME: string = chromePath();

const ROOT = process.cwd();
const OUT = join(ROOT, 'docs/marketing/store');
mkdirSync(OUT, { recursive: true });

// ── Το σήμα διαβάζεται από το ΙΔΙΟ αρχείο που το ζωγραφίζει η εφαρμογή ──────
const markSrc = readFileSync(join(ROOT, 'components/BrandMark.tsx'), 'utf8');
const shapeBlock = markSrc.slice(markSrc.indexOf('const SHAPE = ['), markSrc.indexOf('];', markSrc.indexOf('const SHAPE = [')));
const SHAPE = [...shapeBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
const VIEWBOX = (markSrc.match(/BRAND_VIEWBOX = '([^']+)'/) || [])[1];
if (SHAPE.length !== 11 || !VIEWBOX) throw new Error('Το σήμα δεν διαβάστηκε από το BrandMark.tsx');
const mark = (px: number, color: string) =>
  `<svg width="${px}" height="${px}" viewBox="${VIEWBOX}" fill="${color}" fill-rule="nonzero">`
  + SHAPE.map(d => `<path d="${d}"/>`).join('') + '</svg>';

const FONT_DIR = 'file://' + join(ROOT, 'public/fonts');
const FACES = `
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-greek.woff2") format("woff2");font-weight:100 900;font-display:block}
  @font-face{font-family:Inter;src:url("${FONT_DIR}/inter-latin.woff2") format("woff2");font-weight:100 900;font-display:block}`;

// Τα χρώματα του σκοτεινού θέματος, όπως τα γράφει το app/globals.css.
const GROUND = '#202124', INK = '#e8eaed', MUTED = '#a8aeb3', ACCENT = '#8ab4f8', RULE = '#3c4043';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ΤΟ «lang» ΔΕΝ ΕΙΝΑΙ ΤΥΠΙΚΟΤΗΤΑ ΕΔΩ, ΕΙΝΑΙ ΟΡΘΟΓΡΑΦΙΑ. Χωρίς αυτό ο Chromium
// δεν εφαρμόζει τους ελληνικούς κανόνες κεφαλαιοποίησης και το
// «Συνδρομή» βγαίνει «ΣΥΝΔΡΟΜΉ», με τόνο πάνω σε κεφαλαίο.
const shell = (w: number, h: number, pad: number, body: string) => `<!doctype html><html lang="el"><meta charset="utf-8"><style>
  ${FACES}
  *{box-sizing:border-box;margin:0}
  body{width:${w}px;height:${h}px;background:${GROUND};color:${INK};padding:${pad}px;
       font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;
       display:flex;flex-direction:column}
  .sig{margin-top:auto;display:flex;align-items:center;gap:14px;color:${MUTED};font-size:22px;letter-spacing:0.02em}
  .sig b{color:${INK};font-weight:800;letter-spacing:0.04em}
  .eyebrow{color:${ACCENT};font-size:22px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase}
  .num{font-variant-numeric:tabular-nums}
  .rule{height:1px;background:${RULE}}
</style>${body}`;

const signature = (px = 34) =>
  `<div class="sig">${mark(px, INK)}<span><b>PROPERWISE</b> · properwise.gr</span></div>`;

/** Η τιμή γράφεται μία φορά, από τη μία πηγή, με ελληνικό κόμμα. */
const price = (n: number) => fe(n);

type Shot = { file: string; w: number; h: number; html: string };
const shots: Shot[] = [];

for (const id of PLAN_ORDER.filter(p => p !== 'free') as PlanId[]) {
  const p = PLANS[id];
  const ai = aiLimitsFor(id).perMonth;
  const cap = p.maxProperties === Infinity ? 'Ακίνητα χωρίς όριο'
    : `${p.maxProperties} ${p.maxProperties === 1 ? 'ακίνητο' : 'ακίνητα'}`;
  // Πόσους μήνες χαρίζει η ετήσια: δώδεκα μείον όσους πληρώνεις. Ιδιος
  // υπολογισμός με την κάρτα της αρχικής σελίδας, όχι δεύτερος αριθμός.
  const freeMonths = 12 - Math.round(p.priceAnnual / p.priceMonthly);

  // ── 1. ΤΙ ΕΙΝΑΙ. Τετράγωνη, ένα σημείο έντασης: το όνομα. ────────────────
  shots.push({
    file: `${id}-1-tetragono.png`, w: 1200, h: 1200,
    html: shell(1200, 1200, 84, `
      <div class="eyebrow">Συνδρομή</div>
      <div style="margin-top:auto">
        <div style="font-size:112px;font-weight:800;letter-spacing:-0.035em;line-height:1.02">${esc(p.name)}</div>
        <div style="margin-top:18px;font-size:38px;color:${MUTED};line-height:1.35">${esc(p.tagline)}</div>
        <div class="rule" style="margin:44px 0 34px"></div>
        <div style="display:flex;align-items:baseline;gap:16px">
          <span class="num" style="font-size:84px;font-weight:800;letter-spacing:-0.03em">${price(p.priceMonthly)}</span>
          <span style="font-size:34px;color:${MUTED}">τον μήνα</span>
        </div>
        <div style="margin-top:14px;font-size:30px;color:${ACCENT};font-weight:700">${TRIAL_DAYS} ημέρες δωρεάν δοκιμή</div>
      </div>
      ${signature(40)}`),
  });

  // ── 2. ΤΙ ΠΕΡΙΛΑΜΒΑΝΕΙ. Πλατιά, η λίστα σε δύο στήλες αν χρειαστεί. ──────
  const items = [cap, ...p.features.filter(f => !/^Έως \d|^Ακίνητα χωρίς όριο/.test(f)), `${ai} ερωτήσεις στον βοηθό τον μήνα`];
  shots.push({
    file: `${id}-2-perilamvanei.png`, w: 1600, h: 900,
    html: shell(1600, 900, 76, `
      <div class="eyebrow">${esc(p.name)}</div>
      <div style="margin-top:22px;font-size:54px;font-weight:800;letter-spacing:-0.03em">Τι περιλαμβάνει</div>
      <div style="margin-top:38px;display:grid;grid-template-columns:repeat(2,1fr);gap:22px 46px">
        ${items.map(t => `<div style="display:flex;align-items:flex-start;gap:16px;font-size:30px;line-height:1.35">
             <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;margin-top:6px"><path d="M20 6 9 17l-5-5"/></svg>
             <span>${esc(t)}</span></div>`).join('')}
      </div>
      ${signature(34)}`),
  });

  // ── 3. ΤΙ ΚΟΣΤΙΖΕΙ. Μήνας και χρόνος δίπλα δίπλα, χωρίς αριθμητική. ──────
  shots.push({
    file: `${id}-3-timi.png`, w: 1600, h: 900,
    html: shell(1600, 900, 76, `
      <div class="eyebrow">${esc(p.name)}</div>
      <div style="margin-top:auto;display:flex;gap:70px;align-items:flex-end">
        <div>
          <div style="font-size:26px;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase">Μηνιαία</div>
          <div class="num" style="margin-top:12px;font-size:96px;font-weight:800;letter-spacing:-0.035em">${price(p.priceMonthly)}</div>
        </div>
        <div style="width:1px;align-self:stretch;background:${RULE}"></div>
        <div>
          <div style="font-size:26px;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase">Ετήσια</div>
          <div class="num" style="margin-top:12px;font-size:96px;font-weight:800;letter-spacing:-0.035em">${price(p.priceAnnual)}</div>
          <div style="margin-top:10px;font-size:28px;color:${ACCENT};font-weight:700">${freeMonths} ${freeMonths === 1 ? 'μήνας' : 'μήνες'} δωρεάν</div>
        </div>
      </div>
      <div class="rule" style="margin:40px 0 26px"></div>
      <div style="font-size:26px;color:${MUTED};line-height:1.5">
        ${TRIAL_DAYS} ημέρες δωρεάν δοκιμή. Χωρίς δέσμευση, χωρίς κρυφές χρεώσεις.
        Οι τιμές αφορούν καταναλωτές στην Ελλάδα και περιλαμβάνουν ΦΠΑ.
      </div>
      ${signature(34)}`),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΙ ΤΑ ΛΕΚΤΙΚΑ, ΑΠΟ ΤΗΝ ΙΔΙΑ ΠΗΓΗ
// ─────────────────────────────────────────────────────────────────────────
// Η περιγραφή του καταστήματος λέει τιμή, όριο ακινήτων και τι περιλαμβάνεται.
// Γραμμένη με το χέρι, θα έλεγε την παλιά τιμή την επομένη μιας αλλαγής. Εδώ
// η πρόταση είναι σταθερή και τα νούμερα μπαίνουν από τα PLANS.
//
// ΤΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΠΟΥΘΕΝΑ: «δωρεάν για πάντα», «απεριόριστο» εκεί που υπάρχει
// όριο, ούτε δυνατότητα που δεν έχει κυκλοφορήσει. Το κατάστημα είναι το
// σημείο όπου ο επισκέπτης βγάζει κάρτα: ό,τι υπόσχεται πρέπει να το βρει.
// ═══════════════════════════════════════════════════════════════════════════
const PITCH: Record<string, string> = {
  solo: 'Για τον ιδιοκτήτη με ένα ακίνητο. Ολα όσα ζητά η εφορία για ένα σπίτι, χωρίς λογιστικό φύλλο και χωρίς να ψάχνεις τι λήγει πότε.',
  owner: 'Για τον ιδιοκτήτη με δύο ή τρία ακίνητα. Από το δεύτερο ακίνητο αρχίζει η ερώτηση «ποιο μου αποδίδει και ποιο με τρώει»: εδώ απαντιέται με νούμερα.',
  agency: 'Για τον επαγγελματία που διαχειρίζεται ξένα ακίνητα. Πελατολόγιο, ομάδα με ρόλους, αναφορές με τη δική σου επωνυμία και επενδυτική ανάλυση.',
  office: 'Για το γραφείο που δεν θέλει να μετράει. Ακίνητα χωρίς όριο και χωρίς επιπλέον χρέωση, πρώτη θέση στη σειρά διάθεσης και άμεση επικοινωνία μαζί μας.',
};

function copyMarkdown(): string {
  const out: string[] = [
    '# Τα πακέτα στο κατάστημα',
    '',
    'Παράγεται από το `scripts/brand/store.ts`. Μην το γράψεις με το χέρι: τα',
    'νούμερα βγαίνουν από το `lib/billing/plans.ts` και το `aiLimits.ts`, οπότε',
    'μια αλλαγή τιμής ενημερώνει και το κείμενο. Ξανατρέξε το βήμα και',
    'αντίγραψε από εδώ.',
    '',
  ];
  for (const id of PLAN_ORDER.filter(x => x !== 'free')) {
    const p = PLANS[id];
    const ai = aiLimitsFor(id).perMonth;
    const cap = p.maxProperties === Infinity ? 'χωρίς όριο ακινήτων'
      : `έως ${p.maxProperties} ${p.maxProperties === 1 ? 'ακίνητο' : 'ακίνητα'}`;
    const freeMonths = 12 - Math.round(p.priceAnnual / p.priceMonthly);
    out.push(
      `## ${p.name}`, '',
      `**Ονομα προϊόντος:** PROPERWISE ${p.name}`, '',
      `**Μία γραμμή:** ${p.tagline}. ${price(p.priceMonthly)} τον μήνα, ${cap}.`, '',
      '**Περιγραφή:**', '',
      PITCH[id], '',
      `Περιλαμβάνει ${cap}, ${ai} ερωτήσεις στον βοηθό κάθε μήνα και:`, '',
      ...p.features.map(f => `- ${f}`), '',
      `Δοκιμή ${TRIAL_DAYS} ημερών χωρίς δέσμευση. Μηνιαία ${price(p.priceMonthly)} ή ετήσια `
      + `${price(p.priceAnnual)}, δηλαδή ${freeMonths} ${freeMonths === 1 ? 'μήνας' : 'μήνες'} δωρεάν. `
      + 'Ακυρώνεις όποτε θέλεις. Οι τιμές αφορούν καταναλωτές στην Ελλάδα και περιλαμβάνουν ΦΠΑ.', '',
      '**Εικόνες:**', '',
      `- \`${id}-1-tetragono.png\` (1200×1200) για τη μικρογραφία του προϊόντος`,
      `- \`${id}-2-perilamvanei.png\` (1600×900) για το τι περιλαμβάνει`,
      `- \`${id}-3-timi.png\` (1600×900) για την τιμή`, '',
    );
  }
  return out.join('\n');
}

// Το tsx μεταγλωττίζει σε cjs, όπου το await στο ανώτατο επίπεδο δεν υπάρχει.
async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    await pg.setContent(s.html, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: join(OUT, s.file) });
    await ctx.close();
    console.log(`  ✓ ${s.file}  ${s.w}×${s.h}`);
  }
  await browser.close();
  writeFileSync(join(OUT, 'README.md'), copyMarkdown());
  console.log(`✓ ${shots.length} εικόνες και τα λεκτικά στο docs/marketing/store/`);
}

void main();
