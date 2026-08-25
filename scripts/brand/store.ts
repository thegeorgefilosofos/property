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
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΛΑΙΣΙΟ ΕΙΝΑΙ ΕΝΑ, ΚΑΙ ΚΑΝΕΝΑ ΚΑΡΤΕΛΑΚΙ ΔΕΝ ΤΟ ΠΑΡΑΚΑΜΠΤΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΦΤΑΙΓΕ ΣΤΗΝ ΠΡΩΤΗ ΕΚΔΟΧΗ. Κάθε εικόνα στοίβαζε το περιεχόμενό της με
// «margin-top:auto», δηλαδή το κόλλαγε στο κάτω μέρος. Οσο άλλαζε το πλήθος
// των χαρακτηριστικών ανά πακέτο —πέντε στον Ιδιοκτήτη, δύο στον Ιδιοκτήτη+,
// έξι στον Επαγγελματία— άλλαζε και το κενό στη μέση. Δώδεκα εικόνες που
// κάθονται δίπλα δίπλα στο κατάστημα και καμία δεν ευθυγραμμιζόταν με την
// άλλη. Και οι δύο στήλες της λίστας γέμιζαν κατά ΓΡΑΜΜΗ, οπότε η αριστερή
// έβγαινε τέσσερα και η δεξιά τρία.
//
// Ο ΚΑΝΟΝΑΣ. Τρεις ζώνες με σταθερό ύψος και μία που τεντώνει:
//
//     ΚΕΦΑΛΙΔΑ   σταθερό ύψος 34   κατηγορία αριστερά, πακέτο δεξιά
//     ΠΕΡΙΕΧΟΜΕΝΟ  τεντώνει        πάντα οπτικά κεντραρισμένο
//     ΓΡΑΜΜΗ       1               στο ίδιο ύψος σε κάθε εικόνα
//     ΥΠΟΓΡΑΦΗ     σταθερό ύψος 40 σήμα και τομέας
//
// Ετσι η κεφαλίδα, η γραμμή και η υπογραφή πέφτουν στο ΙΔΙΟ εικονοστοιχείο σε
// κάθε εικόνα του ίδιου μεγέθους, ό,τι κι αν γράφει από πάνω τους. Το
// περιεχόμενο κεντράρεται, οπότε δύο γραμμές ή οκτώ δίνουν το ίδιο βάρος.
// Μετριέται στο τέλος: αν κάποια ζώνη μετακινηθεί, το βήμα κοκκινίζει.
// ═══════════════════════════════════════════════════════════════════════════

/** Το περιθώριο, το ίδιο και στα δύο μεγέθη: η ταυτότητα δεν αλλάζει με τον καμβά. */
const PAD = 80;
const HEAD_H = 34;
const SIG_H = 40;

/** Η κλίμακα τύπου. Πέντε μεγέθη, κανένα ενδιάμεσο αυθαίρετο. */
const TS = { eyebrow: 22, micro: 24, body: 30, sub: 36, h2: 56, kpi: 92, hero: 104 };

const shell = (w: number, h: number, body: string) => `<!doctype html><html lang="el"><meta charset="utf-8"><style>
  ${FACES}
  *{box-sizing:border-box;margin:0}
  /* ΤΟ ΒΑΘΟΣ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ ΤΗΣ ΕΦΑΡΜΟΓΗΣ: μια πολύ ήπια ακτινική κλίση από
     πάνω δίνει στην επιφάνεια κατεύθυνση φωτός, όπως στις κάρτες του πίνακα
     ελέγχου. Ιδια σε κάθε εικόνα, οπότε δεν χαλά την ομοιομορφία. */
  body{width:${w}px;height:${h}px;color:${INK};padding:${PAD}px;
       background:radial-gradient(120% 90% at 50% -12%, rgba(138,180,248,0.07) 0%, rgba(138,180,248,0) 62%), ${GROUND};
       font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;
       display:flex;flex-direction:column}
  .head{height:${HEAD_H}px;display:flex;align-items:center;justify-content:space-between;flex:0 0 auto}
  .eyebrow{color:${ACCENT};font-size:${TS.eyebrow}px;font-weight:800;letter-spacing:0.16em;line-height:1}
  .tag{color:${MUTED};font-size:${TS.eyebrow}px;font-weight:800;letter-spacing:0.16em;line-height:1}
  .zone{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;min-height:0}
  .zone.spread{justify-content:space-between;padding:34px 0}
  .rule{height:1px;background:${RULE};flex:0 0 auto}
  .sig{height:${SIG_H}px;display:flex;align-items:center;gap:14px;color:${MUTED};
       font-size:${TS.micro}px;letter-spacing:0.02em;flex:0 0 auto}
  .sig b{color:${INK};font-weight:800;letter-spacing:0.05em}
  .num{font-variant-numeric:tabular-nums;letter-spacing:-0.035em;font-weight:800}
</style>${body}`;

/**
 * Η μόνη πόρτα προς τον καμβά. Οποιος γράψει αύριο τέταρτη μορφή, θα πάρει
 * αναγκαστικά την ίδια κεφαλίδα, την ίδια γραμμή και την ίδια υπογραφή.
 */
const card = (w: number, h: number, left: string, right: string, zone: string, spread = false) =>
  shell(w, h, `
    <div class="head"><span class="eyebrow">${left}</span><span class="tag">${right}</span></div>
    <div class="zone${spread ? ' spread' : ''}">${zone}</div>
    <div class="rule foot" style="margin-bottom:26px"></div>
    <div class="sig">${mark(30, INK)}<span><b>PROPERWISE</b> · properwise.gr</span></div>`);

/** Η τιμή γράφεται μία φορά, από τη μία πηγή, με ελληνικό κόμμα. */
const price = (n: number) => fe(n);

/** Το τσεκάκι, ίδιο σε κάθε γραμμή κάθε λίστας. */
const tick = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="3"
  stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;margin-top:5px"><path d="M20 6 9 17l-5-5"/></svg>`;

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
  const NAME = p.name.toUpperCase();

  // ── 1. ΤΙ ΕΙΝΑΙ. Ενα κεντραρισμένο μπλοκ, ίδιο σε κάθε πακέτο. ───────────
  shots.push({
    file: `${id}-1-tetragono.png`, w: 1200, h: 1200,
    html: card(1200, 1200, 'ΣΥΝΔΡΟΜΗ', cap.toUpperCase(), `
      <div>
        <div data-k="bar" style="width:120px;height:4px;background:${ACCENT};margin-bottom:40px"></div>
        <div data-k="onoma" style="font-size:${TS.hero}px;font-weight:800;letter-spacing:-0.035em;line-height:1.02">${esc(p.name)}</div>
        <div data-k="ypotitlos" style="margin-top:20px;font-size:${TS.sub}px;color:${MUTED};line-height:1.35">${esc(p.tagline)}</div>
      </div>
      <div class="rule"></div>
      <div>
        <div data-k="timi" style="display:flex;align-items:baseline;gap:16px">
          <span class="num" style="font-size:${TS.kpi}px">${price(p.priceMonthly)}</span>
          <span style="font-size:${TS.sub}px;color:${MUTED}">τον μήνα</span>
        </div>
        <div data-k="dokimi" style="margin-top:18px;font-size:${TS.body}px;color:${ACCENT};font-weight:700">${TRIAL_DAYS} ημέρες δωρεάν δοκιμή</div>
      </div>`, true),
  });

  // ── 2. ΤΙ ΠΕΡΙΛΑΜΒΑΝΕΙ. Δύο στήλες που γεμίζουν ΚΑΤΑ ΣΤΗΛΗ, ζυγισμένες. ──
  const items = [cap, ...p.features.filter(f => !/^Έως \d|^Ακίνητα χωρίς όριο/.test(f)), `${ai} ερωτήσεις στον βοηθό τον μήνα`];
  const half = Math.ceil(items.length / 2);
  // ΤΟ ΣΗΜΑΔΙ ΜΠΑΙΝΕΙ ΣΤΗΝ ΠΡΩΤΗ ΓΡΑΜΜΗ, ΟΧΙ ΣΤΗ ΣΤΗΛΗ. Δοκιμάστηκε με
  // «padding-top» στη στήλη και ο έλεγχος πέρασε πράσινος: το γέμισμα είναι
  // ΜΕΣΑ στο κουτί, οπότε το πάνω όριο της στήλης δεν κουνιέται ενώ το
  // περιεχόμενο κατεβαίνει. Αυτό που πρέπει να ευθυγραμμίζεται είναι το πρώτο
  // τσεκάκι της κάθε στήλης, άρα αυτό μετριέται.
  const col = (list: string[], k: string) => `<div style="display:flex;flex-direction:column;gap:24px">`
    + list.map((t, i) => `<div${i === 0 ? ` data-k="${k}"` : ''} style="display:flex;align-items:flex-start;gap:16px;font-size:${TS.body}px;line-height:1.35">`
      + `${tick}<span>${esc(t)}</span></div>`).join('') + '</div>';
  shots.push({
    file: `${id}-2-perilamvanei.png`, w: 1600, h: 900,
    html: card(1600, 900, 'ΤΙ ΠΕΡΙΛΑΜΒΑΝΕΙ', NAME, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 56px;align-items:start">
        ${col(items.slice(0, half), 'stili-a')}${col(items.slice(half), 'stili-b')}
      </div>`),
  });

  // ── 3. ΤΙ ΚΟΣΤΙΖΕΙ. Δύο ΙΣΑ μισά, με τη γραμμή ακριβώς στη μέση. ─────────
  const money = (label: string, value: number, k: string, note?: string) => `
    <div data-k="${k}" style="display:flex;flex-direction:column;align-items:flex-start">
      <div style="font-size:${TS.micro}px;color:${MUTED};letter-spacing:0.14em;font-weight:700">${label}</div>
      <div class="num" style="margin-top:14px;font-size:${TS.kpi}px;line-height:1">${price(value)}</div>
      <div style="margin-top:14px;font-size:${TS.body}px;color:${note ? ACCENT : 'transparent'};font-weight:700">${note || 'κενό'}</div>
    </div>`;
  shots.push({
    file: `${id}-3-timi.png`, w: 1600, h: 900,
    html: card(1600, 900, 'ΤΙΜΗ', NAME, `
      <div style="display:grid;grid-template-columns:1fr 1px 1fr;align-items:center;gap:0 64px">
        ${money('ΜΗΝΙΑΙΑ', p.priceMonthly, 'miniaia')}
        <div style="width:1px;height:200px;background:${RULE}"></div>
        ${money('ΕΤΗΣΙΑ', p.priceAnnual, 'etisia', `${freeMonths} ${freeMonths === 1 ? 'μήνας' : 'μήνες'} δωρεάν`)}
      </div>
      <div data-k="psila" style="margin-top:52px;font-size:${TS.micro}px;color:${MUTED};line-height:1.6;max-width:1100px">
        ${TRIAL_DAYS} ημέρες δωρεάν δοκιμή. Χωρίς δέσμευση, χωρίς κρυφές χρεώσεις.
        Οι τιμές αφορούν καταναλωτές στην Ελλάδα και περιλαμβάνουν ΦΠΑ.
      </div>`),
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
// ═══════════════════════════════════════════════════════════════════════════
// Η ΟΜΟΙΟΜΟΡΦΙΑ ΜΕΤΡΙΕΤΑΙ, ΔΕΝ ΔΗΛΩΝΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// «Ιδιο πλαίσιο παντού» είναι ισχυρισμός. Ενα μονό `margin` σε μια μορφή αρκεί
// για να τον ακυρώσει και κανείς δεν θα το δει στη μεμονωμένη εικόνα: φαίνεται
// μόνο όταν οι δώδεκα μπουν δίπλα δίπλα στο κατάστημα, δηλαδή μπροστά στον
// πελάτη. Εδώ οι θέσεις των τεσσάρων ζωνών διαβάζονται από τον περιηγητή, ανά
// μέγεθος καμβά, και πρέπει να ταυτίζονται στο εικονοστοιχείο.
// ═══════════════════════════════════════════════════════════════════════════
type Frame = { head: number; ruleY: number; sig: number; left: number } & Record<string, number>;
const frames = new Map<string, { file: string; f: Frame }[]>();

// ΤΙ ΣΥΓΚΡΙΝΕΤΑΙ ΜΕ ΤΙ, ΚΑΙ ΓΙΑΤΙ ΟΧΙ ΤΑ ΠΑΝΤΑ ΜΕ ΟΛΑ.
// Οι τρεις μορφές έχουν διαφορετική σύνθεση: το τετράγωνο δεν οφείλει να
// στοιχίζεται με την πλατιά. Η σύγκριση γίνεται ΑΝΑ ΜΟΡΦΗ, ανάμεσα στα
// τέσσερα πακέτα: εκεί το περιεχόμενο είναι ίδιου είδους και κάθε απόκλιση
// είναι σφάλμα.
//
// ΚΑΙ ΔΕΝ ΑΡΚΕΙ ΤΟ ΠΛΑΙΣΙΟ. Πρώτη εκδοχή μετρούσε μόνο κεφαλίδα, γραμμή,
// υπογραφή και τα όρια της ζώνης. Δοκιμάστηκε με ένα μονό περιθώριο 62 αντί
// για 40 σε ΕΝΑ πακέτο και πέρασε πράσινη: η ζώνη έχει σταθερό ύψος, οπότε τα
// όριά της δεν κουνιούνται όταν μετακινηθεί κάτι ΜΕΣΑ της. Ελεγχος που δεν
// κοκκινίζει με το σφάλμα μπροστά του δεν είναι έλεγχος.
//
// Τώρα κάθε στοιχείο που οφείλει να πέφτει στο ίδιο ύψος φέρει «data-k» και
// μετριέται ονομαστικά.
//
// ΜΙΑ ΕΞΑΙΡΕΣΗ, ΚΑΙ ΕΙΝΑΙ ΣΩΣΤΗ. Η λίστα έχει άλλο πλήθος γραμμών ανά πακέτο
// (τέσσερις στον Ιδιοκτήτη+, οκτώ στον Επαγγελματία) και κεντράρεται, οπότε το
// ύψος εκκίνησής της ΟΦΕΙΛΕΙ να διαφέρει. Εκεί συγκρίνεται μόνο το πλαίσιο
// και ελέγχεται χωριστά αυτό που πρέπει να ισχύει μέσα στην ΙΔΙΑ εικόνα: οι
// δύο στήλες ξεκινούν στο ίδιο ύψος.
const FRAME_ONLY = /^2-perilamvanei\.png$/;

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    await pg.setContent(s.html, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    // ΧΩΡΙΣ ΕΣΩΤΕΡΙΚΗ ΣΥΝΑΡΤΗΣΗ ΜΕΣΑ ΣΤΟ evaluate. Το esbuild κρατά τα ονόματα
    // με μια βοηθητική «__name», που δεν υπάρχει στον περιηγητή: το αποτέλεσμα
    // είναι «ReferenceError: __name is not defined» τη στιγμή της μέτρησης.
    const f: Frame = await pg.evaluate(`(function () {
      var q = document.querySelector.bind(document);
      var out = {
        head: Math.round(q('.head').getBoundingClientRect().top),
        ruleY: Math.round(q('.rule.foot').getBoundingClientRect().top),
        sig: Math.round(q('.sig').getBoundingClientRect().top),
        left: Math.round(q('.eyebrow').getBoundingClientRect().left)
      };
      var marked = document.querySelectorAll('[data-k]');
      for (var i = 0; i < marked.length; i++) {
        var b = marked[i].getBoundingClientRect();
        out['πάνω:' + marked[i].getAttribute('data-k')] = Math.round(b.top);
        out['αριστερά:' + marked[i].getAttribute('data-k')] = Math.round(b.left);
      }
      return out;
    })()`);
    const key = s.file.replace(/^[a-z]+-/, '');
    if (!frames.has(key)) frames.set(key, []);
    frames.get(key)!.push({ file: s.file, f });
    await pg.screenshot({ path: join(OUT, s.file) });
    await ctx.close();
    console.log(`  ✓ ${s.file}  ${key}`);
  }
  await browser.close();
  writeFileSync(join(OUT, 'README.md'), copyMarkdown());

  let drift = 0;
  for (const [key, rows] of frames) {
    const base = rows[0];
    const keys = FRAME_ONLY.test(key)
      ? ['head', 'ruleY', 'sig', 'left']
      : Object.keys(base.f);
    for (const row of rows.slice(1)) {
      for (const k of keys) {
        if (row.f[k] !== base.f[k]) {
          console.error(`✗ ${row.file}: ${k} στο ${row.f[k]} ενώ το ${base.file} στο ${base.f[k]}`);
          drift++;
        }
      }
    }
    console.log(`  ${key}: ${keys.length} θέσεις ίδιες σε ${rows.length} πακέτα `
      + `(κεφαλίδα ${base.f.head}, γραμμή ${base.f.ruleY}, υπογραφή ${base.f.sig})`);
  }
  // Οι δύο στήλες της λίστας, μέσα στην ίδια εικόνα.
  for (const rows of frames.values())
    for (const row of rows) {
      const a = row.f['πάνω:stili-a'], b = row.f['πάνω:stili-b'];
      if (a !== undefined && a !== b) {
        console.error(`✗ ${row.file}: οι δύο στήλες ξεκινούν σε ${a} και ${b}`);
        drift++;
      }
    }
  if (drift) { console.error(`\n✗ ${drift} αποκλίσεις πλαισίου.`); process.exit(1); }
  console.log(`✓ ${shots.length} εικόνες και τα λεκτικά στο docs/marketing/store/`);
}

void main();
