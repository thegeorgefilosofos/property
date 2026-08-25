#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΓΓΡΑΦΗ, ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΠΕΡΙΗΓΗΤΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΠΑΓΚΟ (24/08/2026, από πραγματική εγγραφή). Το
// `loading` γινόταν ψευδές ΜΟΝΟ στο σφάλμα. Στην επιτυχία έμενε αναμμένο, και
// η οθόνη «Ανοιξε το email σου» το κουβαλούσε από κάτω της. Οποιος πατούσε
// «Γράψε άλλη» γύριζε στη φόρμα και έβρισκε το κουμπί κλειδωμένο στο
// «Δημιουργία…», για πάντα. Καμία διέξοδος εκτός από ανανέωση της σελίδας.
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΝΕ ΤΙΠΟΤΑ. Καμία δοκιμή μονάδας δεν πατά κουμπιά, και η
// κατάσταση είναι σωστή σε κάθε ΜΕΜΟΝΩΜΕΝΟ βήμα: το λάθος υπάρχει μόνο στη
// ΣΕΙΡΑ «υποβολή, πίσω, ξανά». Αυτό φαίνεται μόνο πατώντας.
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const CHROME = chromePath();
const PAGE = resolve('.e2e-signup/index.html');
if (!existsSync(PAGE)) {
  console.error('✗ Λείπει ο πάγκος. Τρέξε πρώτα: node scripts/e2e-signup/build.mjs');
  process.exit(1);
}

let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  if (ok) { pass++; return; }
  fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(pathToFileURL(PAGE).href);
await page.waitForSelector('#su-consent');

// ΤΟ ΚΟΥΜΠΙ ΔΕΝ ΕΙΝΑΙ ΠΟΤΕ `disabled`, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΣΚΟΠΙΜΟ: μένει
// πατήσιμο ώστε ο handler να πει τον λόγο αντί να σωπάσει. Αρα το σφάλμα
// φαίνεται στο ΛΕΚΤΙΚΟ και στη ΣΥΜΠΕΡΙΦΟΡΑ, όχι σε μια ιδιότητα.
const submit = () => page.locator('form button[type="submit"]');

// ── Η ΦΟΡΜΑ ΣΥΜΠΛΗΡΩΝΕΤΑΙ ─────────────────────────────────────────────────
await page.locator('#su-email').fill('dokimastis@properwise.gr');
await page.locator('input[type="password"]').first().fill('Dokimastis2026!');
await page.locator('#su-consent').check();

check('το κουμπί καλεί σε ενέργεια πριν την υποβολή',
  (await submit().textContent())?.includes('Ξεκίνα') === true);

// ── ΥΠΟΒΟΛΗ ───────────────────────────────────────────────────────────────
await submit().click();
await page.waitForSelector('text=Άνοιξε το email σου');
check('μετά την υποβολή εμφανίζεται η οθόνη επιβεβαίωσης', true);

// ── ΚΑΙ ΠΙΣΩ, ΜΕ ΤΟ «ΓΡΑΨΕ ΑΛΛΗ» ──────────────────────────────────────────
await page.getByRole('button', { name: 'Γράψε άλλη' }).click();
await page.waitForSelector('#su-consent');

// ΕΔΩ ΕΙΝΑΙ ΟΛΟ ΤΟ ΝΟΗΜΑ ΤΟΥ ΑΡΧΕΙΟΥ.
const label = (await submit().textContent())?.trim() ?? '';
const dimmed = await submit().evaluate(el => getComputedStyle(el).opacity);
check('το κουμπί δεν μένει στο «Δημιουργία…» μετά το «Γράψε άλλη»',
  !label.includes('…'), `γράφει «${label}»`);
check('και δεν μένει σβησμένο', Number(dimmed) > 0.9, `opacity=${dimmed}`);

// Και είναι πράγματι ξαναχρησιμοποιήσιμο: δεύτερη υποβολή περνά.
await page.locator('#su-email').fill('allos@properwise.gr');
await submit().click();
const back = await page.waitForSelector('text=Άνοιξε το email σου', { timeout: 4000 }).then(() => true).catch(() => false);
check('η δεύτερη υποβολή προχωρά κανονικά', back);

await browser.close();

if (fails.length) {
  console.error(`✗ ${fails.length} από ${pass + fails.length} έλεγχοι εγγραφής απέτυχαν:\n`);
  for (const f of fails) console.error('  ' + f);
  process.exit(1);
}
console.log(`✅ ${pass} έλεγχοι εγγραφής σε πραγματικό Chromium`);
