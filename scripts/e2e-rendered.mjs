#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο,ΤΙ ΚΡΙΝΕΤΑΙ ΜΟΝΟ ΑΦΟΥ ΖΩΓΡΑΦΙΣΤΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΡΕΙΣ ΚΑΤΗΓΟΡΙΕΣ ΠΟΥ ΚΑΝΕΝΑΣ ΕΛΕΓΧΟΣ ΠΗΓΑΙΟΥ ΔΕΝ ΠΙΑΝΕΙ:
//
//   ΔΙΑΤΑΞΗ    Τι ξεφεύγει, τι κόβεται, τι δεν πιάνεται με δάχτυλο, τι
//              διαβάζεται κάτω από 11 εικονοστοιχεία, τι πέφτει πάνω σε τι.
//              Το πλάτος ενός στοιχείου δεν υπάρχει πριν το υπολογίσει ο
//              περιηγητής.
//   ΑΝΤΙΘΕΣΗ   Ο φύλακας πηγαίου λύνει τα var() αλλά όχι τα color-mix(). Και
//              κανένα φύλλο στυλ δεν ξέρει ποιο χρώμα κατέληξε από πίσω.
//   ΕΣΤΙΑΣΗ    Αν φαίνεται πού βρίσκεται το πληκτρολόγιο. Κρίνεται σε
//              εικονοστοιχεία, γιατί ο έλεγχος ιδιοτήτων έβγαλε οκτώ ψεύτικα.
//
// ΓΙΑΤΙ ΜΠΗΚΕ ΣΤΟ ΑΠΟΘΕΤΗΡΙΟ. Οι μετρητές ζούσαν σε πρόχειρο φάκελο μιας
// συνεδρίας: κάθε εύρημα που έβγαλαν κόστισε ώρες και θα χάνονταν με το
// container. Ο,τι βρήκε πραγματικό ελάττωμα ανήκει στη σουίτα.
//
// ΤΡΕΧΕΙ ΜΕ ΔΙΑΚΟΜΙΣΤΗ:
//     npm run build && npm run start &
//     npm run e2e:rendered
//
// ΜΗΔΕΝ ΔΕΝ ΣΗΜΑΙΝΕΙ ΤΙΠΟΤΑ ΑΝ Ο ΕΛΕΓΧΟΣ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΚΟΚΚΙΝΙΣΕΙ:
//     npm run e2e:rendered -- --prove
// βάζει το ελάττωμα κάθε κατηγορίας πίσω και απαιτεί να το βρει.
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { chromePath } from './lib/chrome.mjs';
import { PUBLIC, BENCH, benchUrl, SIZES, BASE, dismissConsent } from './rendered/targets.mjs';
import { AUDIT, LAYOUT_BUG } from './rendered/layout.mjs';
import { MEASURE, CONTRAST_BUG } from './rendered/contrast.mjs';
import { NO_CARET, FOCUSABLE, measureFocus } from './rendered/focus.mjs';

import { readFileSync } from 'node:fs';
const PROVE = process.argv.includes('--prove');
const BENCH_FILE = `${process.cwd()}/.perf-bench/mobile.html`;
if (!existsSync(BENCH_FILE)) {
  console.error(`✗ λείπει ο πάγκος: ${BENCH_FILE}\n  Τρέξε: node scripts/perf-bench/build-mobile.mjs`);
  process.exit(2);
}
try {
  const r = await fetch(BASE + '/', { redirect: 'manual' });
  if (!r.status) throw new Error('χωρίς απάντηση');
} catch (e) {
  console.error(`✗ ο διακομιστής δεν απαντά στο ${BASE} (${e.message})\n  Τρέξε: npm run build && npm run start`);
  process.exit(2);
}

let findings = 0;
const report = (title, rows) => {
  if (!rows.length) return;
  findings += rows.length;
  console.log(`\n  ── ${title}  (${rows.length})`);
  for (const x of rows.slice(0, 6)) console.log(`       · ${x}`);
  if (rows.length > 6) console.log(`       … και ${rows.length - 6}`);
};

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });

// ═══ 1. ΔΙΑΤΑΞΗ, ΣΕ ΚΑΘΕ ΠΑΡΑΘΥΡΟ ══════════════════════════════════════════
console.log('\n╔═══ ΔΙΑΤΑΞΗ ═══════════════════════════════════════════════');
for (const [sname, w, h] of SIZES) {
  const touch = w < 1024;
  for (const path of PUBLIC) {
    // Το .lp-reveal οδηγείται από την κύλιση· με σβηστή κίνηση η διάταξη είναι
    // ακίνητη και μετρήσιμη. Είναι πραγματική διαδρομή χρήστη, όχι παράκαμψη.
    const p = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: w < 700, reducedMotion: 'reduce' });
    try {
      await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      await dismissConsent(p);
      await p.waitForTimeout(250);
      if (PROVE) { await p.addStyleTag({ content: LAYOUT_BUG }); await p.waitForTimeout(120); }
      const r = await p.evaluate(AUDIT, { vw: w, touch });
      const rows = [
        ...r.bleed.map(x => `ξεφεύγει: ${x}`), ...r.small.map(x => `στόχος < 44: ${x}`),
        ...r.tiny.map(x => `κείμενο < 11px: ${x}`), ...r.clipped.map(x => `κόβεται: ${x}`),
        ...r.overlap.map(x => `επικάλυψη: ${x}`),
      ];
      report(`${sname} ${w}×${h} · ${path}`, rows);
    } catch (e) { console.log(`  ! ${path} @${w}: ${e.message.slice(0, 70)}`); }
    await p.close();
  }
}
for (const [sname, w, h] of SIZES.filter(s => s[1] <= 1280)) {
  const touch = w < 1024;
  for (const c of BENCH) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: w < 700, reducedMotion: 'reduce' });
    try {
      await p.goto(benchUrl(c, 30), { waitUntil: 'load', timeout: 30000 });
      await p.waitForTimeout(1500);
      if (PROVE) { await p.addStyleTag({ content: LAYOUT_BUG }); await p.waitForTimeout(120); }
      const r = await p.evaluate(AUDIT, { vw: w, touch });
      const rows = [
        ...r.bleed.map(x => `ξεφεύγει: ${x}`), ...r.small.map(x => `στόχος < 44: ${x}`),
        ...r.tiny.map(x => `κείμενο < 11px: ${x}`), ...r.clipped.map(x => `κόβεται: ${x}`),
        ...r.overlap.map(x => `επικάλυψη: ${x}`),
      ];
      report(`${sname} ${w}×${h} · πάγκος ${c}`, rows);
    } catch (e) { console.log(`  ! πάγκος ${c} @${w}: ${e.message.slice(0, 70)}`); }
    await p.close();
  }
}

// ═══ 2. ΑΝΤΙΘΕΣΗ, ΣΤΑ ΔΥΟ ΘΕΜΑΤΑ ═══════════════════════════════════════════
console.log('\n╔═══ ΑΝΤΙΘΕΣΗ ═════════════════════════════════════════════');
let onGradient = 0;
for (const [mode, label] of [['dark', 'σκούρο'], ['light', 'φωτεινό']]) {
  for (const path of PUBLIC) {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    await p.addInitScript(m => { try { localStorage.setItem('pos_mode', m); } catch { /* κλειστή αποθήκη */ } }, mode);
    try {
      await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
      await dismissConsent(p);
      if (PROVE) await p.addStyleTag({ content: CONTRAST_BUG });
      await p.waitForTimeout(300);
      const { rows, skipped } = await p.evaluate(MEASURE);
      onGradient += skipped;
      report(`${label} · ${path}`, rows.map(x => `${x.ratio}:1 (θέλει ${x.need}) ${x.size}px ${x.fg} σε ${x.bg} «${x.t}»`));
    } catch (e) { console.log(`  ! ${path} [${label}]: ${e.message.slice(0, 70)}`); }
    await p.close();
  }
  for (const c of BENCH) {
    const p = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    try {
      await p.goto(benchUrl(c), { waitUntil: 'load', timeout: 30000 });
      if (mode === 'light') await p.evaluate(() => document.documentElement.setAttribute('data-mode', 'light'));
      if (PROVE) await p.addStyleTag({ content: CONTRAST_BUG });
      await p.waitForTimeout(1200);
      const { rows, skipped } = await p.evaluate(MEASURE);
      onGradient += skipped;
      report(`${label} · πάγκος ${c}`, rows.map(x => `${x.ratio}:1 (θέλει ${x.need}) ${x.size}px «${x.t}»`));
    } catch (e) { console.log(`  ! πάγκος ${c} [${label}]: ${e.message.slice(0, 70)}`); }
    await p.close();
  }
}

// ═══ 3. ΕΣΤΙΑΣΗ, ΣΕ ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ═════════════════════════════════════════
console.log('\n╔═══ ΕΣΤΙΑΣΗ ══════════════════════════════════════════════');
let checked = 0;
for (const [url, name] of [...PUBLIC.map(x => [BASE + x, x]), ...BENCH.map(c => [benchUrl(c, 8), 'πάγκος ' + c])]) {
  const file = url.startsWith('file:');
  const p = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce' });
  const bad = [];
  try {
    await p.goto(url, { waitUntil: file ? 'load' : 'networkidle', timeout: 30000 });
    await p.addStyleTag({ content: NO_CARET });
    if (file) await p.waitForTimeout(1500);
    else { await dismissConsent(p); await p.waitForTimeout(300); }
    for (const h of (await p.$$(FOCUSABLE)).slice(0, 30)) {
      const r = await measureFocus(p, h, { focus: !PROVE });
      checked++;
      if (r) bad.push(r);
    }
  } catch (e) { console.log(`  ! ${name}: ${e.message.slice(0, 70)}`); }
  report(name, bad);
  await p.close();
}

await browser.close();
const head = `${findings} ευρήματα · ${onGradient} κείμενα πάνω σε εικόνα, αμέτρητα · ${checked} στοιχεία ελέγχθηκαν για εστίαση`;
if (PROVE) {
  console.log(`\n═══ ΑΠΟΔΕΙΞΗ: ${head}`);
  console.log(findings > 0
    ? '✅ ΜΗ ΚΕΝΟΣ: με τα ελαττώματα μέσα, ο έλεγχος τα βρήκε.'
    : '❌ ΚΕΝΟΣ: τα ελαττώματα μπήκαν και ο έλεγχος δεν είδε τίποτα.');
  process.exit(findings > 0 ? 0 : 1);
}
// ═══ ΚΑΣΤΑΝΙΑ, ΓΙΑΤΙ ΤΟ ΣΙΩΠΗΡΟ ΜΗΔΕΝ ΔΕΝ ΗΤΑΝ ΠΟΤΕ ΑΛΗΘΕΙΑ ══════════════════
// Ο έλεγχος έκοβε σε ΟΠΟΙΟΔΗΠΟΤΕ εύρημα, δηλαδή το όριό του ήταν μηδέν. Πάνω
// σε 256 πραγματικά ευρήματα αυτό δεν είναι αυστηρότητα: είναι έλεγχος που
// κοκκινίζει πάντα, άρα δεν λέει τίποτα όταν κάτι ΝΕΟ σπάσει. Και δεν το είχε
// δει κανείς, επειδή ήταν το τριακοστό έκτο βήμα ενός job που ακυρωνόταν στο
// δέκατο ένατο.
//
// Το όριο ζει τώρα στο scripts/rendered-baseline.json με γραμμένο τον λόγο
// κάθε κίνησής του και πάει ΜΟΝΟ προς τα κάτω, όπως κάθε άλλη καστάνια εδώ.
const LIMIT = JSON.parse(readFileSync(new URL('./rendered-baseline.json', import.meta.url), 'utf8'));
console.log(`\n═══ ${head}`);
if (findings > LIMIT.max) {
  console.error(`\n✗ ${findings} ευρήματα, πάνω από το όριο ${LIMIT.max}. Κάτι ΝΕΟ έσπασε.`);
  process.exit(1);
}
if (findings < LIMIT.max) {
  console.log(`   ↓ ${findings} < όριο ${LIMIT.max}. Κατέβασε το "max" στο scripts/rendered-baseline.json.`);
}
console.log(`✅ Ο,τι κρίνεται αφού ζωγραφιστεί: ${findings} ευρήματα, στο όριο ${LIMIT.max} ή κάτω.`);
process.exit(0);
