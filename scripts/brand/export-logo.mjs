#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΗΜΑ ΣΕ ΑΡΧΕΙΑ, ΓΙΑ ΟΠΟΥ ΔΕΝ ΦΤΑΝΕΙ Ο ΚΩΔΙΚΑΣ
// ─────────────────────────────────────────────────────────────────────────
// Μέσα στην εφαρμογή το σήμα ζει μία φορά, στο components/BrandMark.tsx. Εξω
// από αυτήν —αυτοκόλλητο, μπλουζάκι, κάρτα, παρουσίαση, κατάστημα— χρειάζεται
// αρχείο. Αυτό το βήμα το βγάζει από την ΙΔΙΑ γεωμετρία, ώστε να μην υπάρξει
// ποτέ δεύτερη εκδοχή που αποκλίνει.
//
// ΤΙ ΠΑΡΑΓΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ ΤΟΣΑ:
//
//   · ΣΥΜΒΟΛΟ και ΛΟΓΟΤΥΠΟ. Το σύμβολο μόνο του για τετράγωνες θέσεις
//     (εικονίδιο, αυτοκόλλητο, καρφίτσα). Το λογότυπο με τη λέξη για όπου
//     πρέπει να διαβαστεί το όνομα.
//   · ΣΚΟΤΕΙΝΟ και ΛΕΥΚΟ. Το σήμα δεν έχει δικό του χρώμα: παίρνει το μελάνι
//     του περιβάλλοντος. Το σκούρο μελάνι πάει σε ανοιχτό φόντο, το λευκό σε
//     σκούρο. Δύο αρχεία, καμία έκπληξη.
//   · SVG, PNG και JPG. Το SVG είναι το πρωτότυπο: διανυσματικό, μεγαλώνει
//     όσο θέλει χωρίς να χάσει τίποτα. Το PNG κρατά ΔΙΑΦΑΝΕΙΑ, οπότε κάθεται
//     πάνω σε οποιοδήποτε φόντο.
//
// ΤΟ JPG ΔΕΝ ΕΧΕΙ ΔΙΑΦΑΝΕΙΑ, ΚΑΙ ΑΥΤΟ ΔΕΝ ΕΙΝΑΙ ΠΑΡΑΛΕΙΨΗ ΔΙΚΗ ΜΑΣ. Η μορφή
// JPEG δεν υποστηρίζει κανάλι άλφα, από τον σχεδιασμό της. Οποιος υπόσχεται
// «JPG χωρίς φόντο» λέει ψέματα ή δίνει PNG με άλλη κατάληξη. Εδώ το JPG
// βγαίνει με ΣΥΜΠΑΓΕΣ φόντο, δηλωμένο: λευκό για το σκούρο μελάνι, το σκούρο
// της εφαρμογής για το λευκό. Οπου χρειάζεται διαφάνεια, το αρχείο είναι PNG.
//
// Η ΓΡΑΜΜΑΤΟΣΕΙΡΑ ΤΑΞΙΔΕΥΕΙ ΜΕΣΑ ΣΤΟ SVG. Ενα SVG με «PROPERWISE» ως κείμενο
// θα αποδιδόταν με ό,τι γραμματοσειρά τύχει να έχει ο υπολογιστής του τυπογράφου
// — δηλαδή δεν θα ήταν το λογότυπό μας. Το inter-latin.woff2 ενσωματώνεται σε
// base64 μέσα στο αρχείο, οπότε το σχήμα των γραμμάτων είναι πάντα το ίδιο.
//
// ΧΡΗΣΗ:  node scripts/brand/export-logo.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromePath, CHROME_ARGS } from '../lib/chrome.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const out = join(root, 'public/brand');
mkdirSync(out, { recursive: true });

// ── Η ΓΕΩΜΕΤΡΙΑ ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΤΟ ΙΔΙΟ ΤΟ BrandMark.tsx ────────────────────
// Οχι αντιγραφή: αν αύριο αλλάξει το σχήμα, αλλάζει και εδώ χωρίς να το θυμηθεί
// κανείς. Το αρχείο είναι TSX, οπότε διαβάζεται ως κείμενο και βγαίνουν τα
// μονοπάτια από τον πίνακα SHAPE.
const src = readFileSync(join(root, 'components/BrandMark.tsx'), 'utf8');
const block = src.slice(src.indexOf('const SHAPE = ['), src.indexOf('];', src.indexOf('const SHAPE = [')));
const SHAPE = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
if (SHAPE.length !== 11) { console.error(`Περίμενα 11 μονοπάτια, βρήκα ${SHAPE.length}`); process.exit(1); }
const VIEWBOX = (src.match(/BRAND_VIEWBOX = '([^']+)'/) || [])[1];
const INK = (src.match(/BRAND_MARK_INK = '([^']+)'/) || [])[1];
const ON_DARK = (src.match(/BRAND_MARK_ON_DARK = '([^']+)'/) || [])[1];
if (!VIEWBOX || !INK || !ON_DARK) { console.error('Δεν βρέθηκαν το πλαίσιο ή τα μελάνια στο BrandMark.tsx'); process.exit(1); }

// Το σκούρο φόντο των JPG είναι το ίδιο με της εγκατεστημένης εφαρμογής:
// διαβάζεται από το app/manifest.ts, δεν ξαναγράφεται εδώ.
const manifestSrc = readFileSync(join(root, 'app/manifest.ts'), 'utf8');
const DARK_BG = (manifestSrc.match(/background_color: '(#[0-9a-fA-F]{3,8})'/) || [])[1];
if (!DARK_BG) { console.error('Δεν βρέθηκε το background_color στο app/manifest.ts'); process.exit(1); }

const fontB64 = readFileSync(join(root, 'public/fonts/inter-latin.woff2')).toString('base64');
const FONT_CSS = `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;`
  + `src:url(data:font/woff2;base64,${fontB64}) format('woff2')}`;

const paths = (fill) => SHAPE.map(d => `<path fill="${fill}" d="${d}"/>`).join('');

/** Το σύμβολο ως αυτοτελές SVG. Καθαρά μονοπάτια: καμία εξάρτηση. */
const symbolSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" fill-rule="nonzero" role="img" aria-label="PROPERWISE">`
  + paths(fill) + '</svg>';

// ── Η ΣΧΕΣΗ ΣΥΜΒΟΛΟΥ ΚΑΙ ΛΕΞΗΣ ΕΙΝΑΙ ΑΥΤΗ ΤΟΥ BrandLogo ────────────────────
// Στο συστατικό: κενό 0,38 του ύψους, μέγεθος λέξης 0,72, βάρος 800, αραίωμα
// 0,02em. Εδώ τα ίδια, σε μονάδες του πλαισίου 90, ώστε το αρχείο να μοιάζει
// με ό,τι βλέπει ο χρήστης στην οθόνη.
const GAP = 90 * 0.38, FS = 90 * 0.72;
const WORD_X = 90 + GAP;

/** Το πλήρες λογότυπο ως SVG, με τη γραμματοσειρά ενσωματωμένη. */
const logoSvg = (fill, width) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 90" fill-rule="nonzero" role="img" aria-label="PROPERWISE">`
  + `<style>${FONT_CSS}</style>`
  + paths(fill)
  + `<text x="${WORD_X.toFixed(2)}" y="45" dominant-baseline="central" fill="${fill}"`
  + ` font-family="Inter, Arial, Helvetica, sans-serif" font-size="${FS.toFixed(2)}"`
  + ` font-weight="800" letter-spacing="${(FS * 0.02).toFixed(3)}">PROPERWISE</text></svg>`;

const b = await chromium.launch({ executablePath: chromePath(), args: CHROME_ARGS });
const page = await b.newPage({ viewport: { width: 2400, height: 800 }, deviceScaleFactor: 1 });

// Το πλάτος της λέξης μετριέται σε πραγματικό Chromium, δεν εκτιμάται.
await page.setContent(`<!doctype html><meta charset="utf-8"><style>${FONT_CSS}
  body{margin:0}
  #w{position:absolute;left:-9999px;font-family:Inter,sans-serif;font-size:${FS}px;
     font-weight:800;letter-spacing:0.02em;white-space:nowrap}
</style><span id="w">PROPERWISE</span>`);
await page.evaluate(() => document.fonts.ready);
const wordW = await page.evaluate(() => document.getElementById('w').getBoundingClientRect().width);
const LOGO_W = Math.ceil(WORD_X + wordW);

const FILES = [
  { name: 'properwise-simvolo-skouro',   svg: symbolSvg(INK),           w: 90,      bg: '#ffffff' },
  { name: 'properwise-simvolo-lefko',    svg: symbolSvg(ON_DARK),       w: 90,      bg: DARK_BG },
  { name: 'properwise-logotypo-skouro',  svg: logoSvg(INK, LOGO_W),     w: LOGO_W,  bg: '#ffffff' },
  { name: 'properwise-logotypo-lefko',   svg: logoSvg(ON_DARK, LOGO_W), w: LOGO_W,  bg: DARK_BG },
];

// Το μακρύτερο αρχείο βγαίνει 2400 εικονοστοιχεία πλάτος: αρκετό για εκτύπωση
// σε μπλουζάκι στα 300 dpi (20 εκατοστά) χωρίς να γίνει βαρύ.
const TARGET_W = 2400;

for (const f of FILES) {
  writeFileSync(join(out, `${f.name}.svg`), f.svg);
  const scale = TARGET_W / f.w;
  const h = Math.round(90 * scale);
  const shot = await b.newPage({ viewport: { width: TARGET_W, height: h }, deviceScaleFactor: 1 });
  const html = (bg) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${bg}}
    svg{display:block;width:${TARGET_W}px;height:${h}px}</style>${f.svg}`;

  await shot.setContent(html('transparent'));
  await shot.evaluate(() => document.fonts.ready);
  writeFileSync(join(out, `${f.name}.png`),
    await shot.screenshot({ type: 'png', omitBackground: true }));

  await shot.setContent(html(f.bg));
  await shot.evaluate(() => document.fonts.ready);
  writeFileSync(join(out, `${f.name}.jpg`),
    await shot.screenshot({ type: 'jpeg', quality: 94 }));
  await shot.close();
  console.log(`  ✓ ${f.name}  ${TARGET_W}×${h}  svg · png με διαφάνεια · jpg σε ${f.bg}`);
}

await page.close();
await b.close();
console.log(`✓ ${FILES.length * 3} αρχεία σήματος στο public/brand/`);
