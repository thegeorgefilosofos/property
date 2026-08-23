#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ΟΙ ΔΕΚΑ ΔΙΑΔΡΟΜΕΣ ΠΟΥ ΚΟΣΤΙΖΟΥΝ ΧΡΗΜΑΤΑ
// ─────────────────────────────────────────────────────────────────────────
//  ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Η λογική ελέγχεται (203 αρχεία τεστ), η βάση
//  ελέγχεται (33 έλεγχοι απομόνωσης). Το ενδιάμεσο δεν ελεγχόταν πουθενά:
//  ΤΙ ΖΗΤΑΕΙ Η ΟΘΟΝΗ ΝΑ ΓΡΑΦΤΕΙ όταν πατηθεί το κουμπί. Μια είσπραξη με λάθος
//  τρόπο πληρωμής, μια δαπάνη με το ποσό της πρότασης αντί για το διορθωμένο,
//  τρεις δόσεις που έγιναν μία: κανένα δεν είναι σφάλμα της βάσης, όλα
//  κοστίζουν χρήματα ή φόρο, και κανένα δεν έβγαζε κόκκινο.
//
//  ΠΩΣ ΤΡΕΧΕΙ ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ. Τα ΠΡΑΓΜΑΤΙΚΑ components μπαίνουν σε ένα
//  πακέτο με ένα μόνο ψεύτικο κομμάτι, τον πελάτη της βάσης, και αποδίδονται
//  σε πραγματικό Chromium. Ο διπλός καταγράφει κάθε ερώτημα με τον πίνακα, την
//  πράξη, το φορτίο και τα φίλτρα του. Καμία σύνδεση, κανένα μυστικό, καμία
//  εξάρτηση από δεδομένα που μπορεί να αλλάξουν.
//
//  ΧΡΗΣΗ:  npm run e2e:money
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pkg;
try { pkg = require('playwright-core'); }
catch { console.error('Λείπει το playwright-core. Τρέξε: npm i -D playwright-core'); process.exit(2); }
const { chromium } = pkg;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
execFileSync(process.execPath, [join(root, 'scripts/e2e-money/build.mjs')], { stdio: 'inherit' });
const PAGE = 'file://' + join(root, '.e2e-money/index.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name + (extra ? `\n      ${extra}` : ''));
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
    `πήρα:    ${JSON.stringify(got)}\n      περίμενα: ${JSON.stringify(want)}`);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

/** Ανοίγει ένα σενάριο και δίνει τα εργαλεία της οθόνης. */
async function open(scenario, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const q = new URLSearchParams({ s: scenario, ...(opts.fail ? { fail: opts.fail } : {}) });
  await page.goto(`${PAGE}?${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
  return {
    page, ctx, errors,
    /** Ο,τι ζητήθηκε να γραφτεί, ανά πίνακα. */
    writes: (table) => page.evaluate(t => window.__calls
      .filter(c => c.table === t && c.op !== 'select')
      .map(c => ({ op: c.op, payload: c.payload, filters: c.filters })), table),
    toasts: () => page.evaluate(() => window.__toasts),
    /** Το κουμπί που γράφει. Ενα σε κάθε οθόνη, και το βρίσκουμε από το κείμενο. */
    primary: () => page.locator('button', { hasText: /^Καταχώρηση/ }).first(),
    close: async () => { await ctx.close(); },
  };
}

/** Περιμένει ώσπου να σταματήσει να αλλάζει ο αριθμός των ερωτημάτων. */
async function settle(page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => window.__calls.length);
    const t = await page.evaluate(() => window.__toasts.length);
    if (n === last && t > 0) return;
    last = n;
    await page.waitForTimeout(60);
  }
}

console.log('\nΔιαδρομές που κοστίζουν χρήματα\n');

// ── 1 ────────────────────────────────────────────────────────────────────
// Η ΣΥΝΗΘΙΣΜΕΝΗ ΕΙΣΠΡΑΞΗ. Ενα ενοίκιο, δύο πατήματα, και ό,τι γράφεται στα
// βιβλία πρέπει να είναι ακριβώς αυτό που είδε ο ιδιοκτήτης στην οθόνη.
{
  const s = await open('rent-one');
  await s.primary().click();
  await settle(s.page);
  const w = await s.writes('rent_payments');
  eq('1. μία δόση γράφεται μία φορά', w.length, 1);
  eq('1. σημαδεύεται εισπραγμένη', w[0]?.payload?.paid, true);
  eq('1. με την ημερομηνία της οθόνης', w[0]?.payload?.paid_date, '2026-09-05');
  eq('1. με τον τρόπο της μίσθωσης', w[0]?.payload?.method, 'Τραπεζική κατάθεση');
  eq('1. στη σωστή γραμμή', w[0]?.filters?.[0], ['eq', 'id', 'r-09']);
  ok('1. καμία εξαίρεση στην οθόνη', s.errors.length === 0, s.errors[0]);
  await s.close();
}

// ── 2 ────────────────────────────────────────────────────────────────────
// Η ΠΙΟ ΑΚΡΙΒΗ ΣΙΩΠΗΛΗ ΒΛΑΒΗ ΘΑ ΗΤΑΝ ΕΔΩ. Με τρεις ανοιχτές δόσεις, ένα
// βιαστικό πάτημα ΔΕΝ επιτρέπεται να γράψει και τις τρεις ως εισπραγμένες: ο
// ιδιοκτήτης θα σταματούσε να ζητά χρήματα που δεν πήρε.
{
  const s = await open('rent-three');
  await s.primary().click();
  await settle(s.page);
  const w = await s.writes('rent_payments');
  eq('2. η προεπιλογή γράφει ΜΟΝΟ την αρχαιότερη', w.length, 1);
  eq('2. και είναι όντως η αρχαιότερη', w[0]?.filters?.[0], ['eq', 'id', 'r-07']);
  await s.close();
}

// ── 3 ────────────────────────────────────────────────────────────────────
// «Ολα ήρθαν όπως κάθε μήνα»: τρεις δόσεις, ένα πάτημα, και το κουμπί λέει το
// άθροισμα ΠΡΙΝ πατηθεί.
{
  const s = await open('rent-three');
  await s.page.getByRole('button', { name: 'Ολες' }).click();
  const label = (await s.primary().innerText()).replace(/[\n\r\t]+/g, ' ').trim();
  eq('3. το κουμπί λέει πλήθος και άθροισμα', label, 'Καταχώρηση 3 δόσεων · 1.350,00\u00A0€');
  await s.primary().click();
  await settle(s.page);
  const w = await s.writes('rent_payments');
  eq('3. γράφονται και οι τρεις', w.length, 3);
  eq('3. με τη σειρά της πίεσης', w.map(x => x.filters[0][2]), ['r-07', 'r-08', 'r-09']);
  ok('3. καμία δεν έμεινε απλήρωτη', w.every(x => x.payload.paid === true));
  const t = await s.toasts();
  ok('3. ο απολογισμός λέει τρεις', t.some(x => x.includes('Καταχωρήθηκαν 3 δόσεις')), JSON.stringify(t));
  await s.close();
}

// ── 4 ────────────────────────────────────────────────────────────────────
// ΤΟ ΜΙΣΟ ΑΠΟΤΕΛΕΣΜΑ ΛΕΓΕΤΑΙ ΜΙΣΟ. Οταν η δεύτερη εγγραφή αποτύχει, ένα
// «καταχωρήθηκε» θα ήταν ψέμα και ένα «απέτυχε» επίσης.
{
  const s = await open('rent-three', { fail: 'rent_payments:2' });
  await s.page.getByRole('button', { name: 'Ολες' }).click();
  await s.primary().click();
  await settle(s.page);
  const t = await s.toasts();
  ok('4. λέει πόσες μπήκαν και πόσες όχι',
    t.some(x => x.includes('Καταχωρήθηκαν 2 από 3 δόσεις')), JSON.stringify(t));
  ok('4. δεν λέει πουθενά ότι μπήκαν όλες',
    !t.some(x => x.includes('Καταχωρήθηκαν 3')), JSON.stringify(t));
  ok('4. η μία αποτυχία δεν σταμάτησε τις υπόλοιπες',
    (await s.writes('rent_payments')).length === 3);
  await s.close();
}

// ── 5 ────────────────────────────────────────────────────────────────────
// Ο ΤΡΟΠΟΣ ΕΙΣΠΡΑΞΗΣ ΑΛΛΑΖΕΙ ΤΟΝ ΦΟΡΟ (ν.5246/2025, τεκμαρτή έκπτωση 5%). Δεν
// επιτρέπεται ούτε να προεπιλεγεί σιωπηλά η κερδοφόρα εκδοχή, ούτε να γραφτεί
// άλλο από αυτό που είδε ο ιδιοκτήτης.
{
  const s = await open('rent-cash');
  const body = await s.page.evaluate(() => document.body.innerText);
  ok('5. με μετρητά, η οθόνη προειδοποιεί για την έκπτωση 5%',
    body.includes('τεκμαρτή έκπτωση 5%') && body.includes('5246'));
  await s.primary().click();
  await settle(s.page);
  const w = await s.writes('rent_payments');
  eq('5. γράφεται ο τρόπος που φαινόταν', w[0]?.payload?.method, 'Μετρητά');
  await s.close();
}

// ── 6 ────────────────────────────────────────────────────────────────────
// ΟΙ ΗΜΕΡΕΣ ΚΑΘΥΣΤΕΡΗΣΗΣ ΜΠΑΙΝΟΥΝ ΣΕ ΒΕΒΑΙΩΣΗ ΚΑΙ ΣΕ ΑΝΑΦΟΡΑ ΠΡΟΣ ΛΟΓΙΣΤΗ.
// Υπολογίζονται από τη λήξη ΤΗΣ ΔΟΣΗΣ και την ημέρα είσπραξης, όχι από σήμερα.
{
  const s = await open('rent-three');
  await s.page.getByRole('button', { name: 'Ολες' }).click();
  await s.primary().click();
  await settle(s.page);
  const w = await s.writes('rent_payments');
  eq('6. κάθε δόση παίρνει τη ΔΙΚΗ της καθυστέρηση',
    w.map(x => x.payload.days_late), [66, 35, 4]);
  await s.close();
}

// ── 7 ────────────────────────────────────────────────────────────────────
// ΧΩΡΙΣ ΕΠΙΛΟΓΗ ΔΕΝ ΓΡΑΦΕΤΑΙ ΤΙΠΟΤΑ. Το κουμπί που δεν έχει τι να γράψει
// κλειδώνει, αντί να γράψει κάτι στην τύχη.
{
  const s = await open('rent-three');
  await s.page.locator('[role="checkbox"][aria-checked="true"]').first().click();
  ok('7. χωρίς καμία επιλεγμένη δόση, το κουμπί κλειδώνει',
    await s.primary().isDisabled());
  eq('7. και δεν γράφτηκε τίποτα', (await s.writes('rent_payments')).length, 0);
  await s.close();
}

// ── 8 ────────────────────────────────────────────────────────────────────
// ΤΟ ΠΟΣΟ ΠΟΥ ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ ΖΗΤΙΕΤΑΙ, ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ. Ενα προσυμπληρωμένο
// μηδέν θα ήταν λάθος αριθμός σε φορολογικά βιβλία, γραμμένος με βεβαιότητα.
{
  const s = await open('inbox-no-amount');
  await s.page.waitForSelector('text=Ηρθαν με email');
  ok('8. χωρίς ποσό, η καταχώρηση είναι κλειστή', await s.primary().isDisabled());
  await s.page.locator('input[inputmode="decimal"], input[type="number"]').first().fill('87,45');
  await s.page.waitForTimeout(120);
  ok('8. με το ποσό γραμμένο, ανοίγει', !(await s.primary().isDisabled()));
  await s.primary().click();
  await settle(s.page);
  const w = await s.writes('expenses');
  eq('8. η δαπάνη γράφεται με το ποσό που πληκτρολογήθηκε', w[0]?.payload?.amount, 87.45);
  eq('8. και στο σωστό ακίνητο', w[0]?.payload?.property_id, 'p1');
  await s.close();
}

// ── 9 ────────────────────────────────────────────────────────────────────
// Η ΔΙΟΡΘΩΜΕΝΗ ΚΑΤΗΓΟΡΙΑ ΓΡΑΦΕΤΑΙ ΚΑΙ ΜΑΘΑΙΝΕΤΑΙ. Η κατηγορία κρίνει την
// εκπεσιμότητα: αν γραφόταν η πρόταση αντί για την επιλογή, η διαφορά θα
// φαινόταν στη φορολογική δήλωση και όχι στην οθόνη.
{
  const s = await open('inbox-amount');
  await s.page.waitForSelector('text=Ηρθαν με email');
  await s.page.locator('[role="combobox"]').first().click();
  await s.page.getByRole('option', { name: 'Κοινόχρηστα' }).click();
  await s.primary().click();
  await settle(s.page);
  const e = await s.writes('expenses');
  eq('9. γράφεται η κατηγορία που διάλεξε ο άνθρωπος', e[0]?.payload?.category, 'Κοινόχρηστα');
  const h = await s.writes('category_hints');
  eq('9. και ο κανόνας κρατιέται για την επόμενη φορά', h.length, 1);
  eq('9. στο όνομα του παρόχου', h[0]?.payload?.vendor_key, 'δεη');
  eq('9. με τη διορθωμένη κατηγορία', h[0]?.payload?.category, 'Κοινόχρηστα');
  await s.close();
}

// ── 10 ───────────────────────────────────────────────────────────────────
// Η ΕΠΙΒΕΒΑΙΩΣΗ ΔΕΝ ΕΙΝΑΙ ΜΑΘΗΜΑ. Οποιος δέχτηκε την πρόταση δεν δίδαξε
// τίποτα, και δεν επιτρέπεται να γραφτεί κανόνας στο όνομά του.
{
  const s = await open('inbox-amount');
  await s.page.waitForSelector('text=Ηρθαν με email');
  await s.primary().click();
  await settle(s.page);
  const e = await s.writes('expenses');
  eq('10. η δαπάνη γράφεται κανονικά', e.length, 1);
  eq('10. με την κατηγορία της πρότασης', e[0]?.payload?.category, 'Ρεύμα');
  eq('10. και κανένας κανόνας δεν γράφτηκε', (await s.writes('category_hints')).length, 0);
  await s.close();
}

// ── 11 ───────────────────────────────────────────────────────────────────
// ΟΙ ΡΥΘΜΙΣΕΙΣ ΕΝΟΣ ΑΚΙΝΗΤΟΥ ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΠΑΝΩ ΣΕ ΑΛΛΟ.
//
// Ο χρονομετρητής αποθήκευσης (800ms) κρατούσε τον ΠΡΟΟΡΙΣΜΟ αλλά διάβαζε τα
// ΔΕΔΟΜΕΝΑ όταν χτυπούσε — και ώς τότε η φόρτωση του νέου ακινήτου τα είχε ήδη
// αντικαταστήσει. Επειδή η `settings.put` κάνει upsert ΟΛΟΚΛΗΡΟΥ του jsonb, το
// πρώτο ακίνητο έχανε πάροχο, τιμολόγιο και καταναλώσεις, σιωπηλά, και η ίδια η
// διόρθωση του χρήστη δεν γραφόταν πουθενά.
//
// Δεν ήταν σπάνιο race: χτυπούσε κάθε φορά που η ανάγνωση του νέου ακινήτου
// τελείωνε πριν λήξει το υπόλοιπο του debounce.
{
  const s = await open('settings-switch');
  await s.page.waitForFunction(() => document.querySelector('[data-prop]')?.getAttribute('data-kwh') === '320', null, { timeout: 5000 });

  // Ο χρήστης διορθώνει το Α, και μέσα στο παράθυρο του debounce αλλάζει ακίνητο.
  await s.page.evaluate(() => window.__edit(400));
  await s.page.waitForTimeout(200);
  await s.page.evaluate(() => window.__switch('p2'));
  await s.page.waitForTimeout(1400);

  const w = await s.writes('bills_settings');
  eq('11. γράφτηκε μία φορά', w.length, 1);
  eq('11. στο ακίνητο που διορθώθηκε', w[0]?.payload?.property_id, 'p1');
  eq('11. με τη διόρθωση του χρήστη', w[0]?.payload?.data?.kwhMonthly, 400);
  eq('11. χωρίς να χαθεί ο πάροχός του', w[0]?.payload?.data?.elecProvider, 'dei');
  ok('11. καμία εξαίρεση στην οθόνη', s.errors.length === 0, s.errors[0]);
  await s.close();
}

// ── 12 ───────────────────────────────────────────────────────────────────
// ΤΟ «ΚΑΘΑΡΟ ΑΝΑ ΜΗΝΑ» ΕΙΝΑΙ Η ΣΤΗΛΗ ΠΟΥ ΦΟΡΑΕΙ ΤΟ ΣΤΕΦΑΝΙ.
//
// Δύο διαμερίσματα με ΙΔΙΟ ενοίκιο, ίδια αξία και ίδιο ΣΥΝΟΛΟ δαπανών μέσα στη
// χρονιά: 900 €. Το πρώτο τα ξόδεψε σε τρεις μήνες (300 €/μήνα), το δεύτερο σε
// δώδεκα (75 €/μήνα). Με «δαπάνες έτους ÷ 12» έβγαιναν και τα δύο 625 €/μήνα —
// ισοπαλία, κανένα στεφάνι, και ο ιδιοκτήτης δεν μάθαινε ποτέ ότι το ένα του
// κοστίζει τετραπλάσιο τον μήνα. Τον Μάρτιο το σφάλμα είναι στη μέγιστη τιμή
// του, γιατί ο αριθμητής έχει τρεις μήνες και ο παρονομαστής δώδεκα.
//
// Και ο φόρος: η ίδια οθόνη τον υπολογίζει ενοποιημένα και τον δείχνει στη
// διπλανή γραμμή, αλλά το «Καθαρό» τον προσπερνούσε.
{
  const s = await open('comparison')
  await settle(s.page)
  await s.page.waitForFunction(() => !!document.querySelector('table td'), null, { timeout: 5000 })

  /** Τα κελιά μιας γραμμής, με το κείμενο και το βάρος γραμματοσειράς. */
  const rowOf = (label) => s.page.evaluate(l => {
    const tr = [...document.querySelectorAll('tbody tr')]
      .find(r => r.querySelector('td')?.textContent?.trim() === l)
    if (!tr) return null
    return [...tr.querySelectorAll('td')].slice(1).map(td => ({
      text: td.textContent.replace(/\u00a0/g, ' ').trim(),
      bold: getComputedStyle(td).fontWeight === '700',
    }))
  }, label)

  const eur = t => parseFloat(String(t).replace(/[^\d,-]/g, '').replace(',', '.'))

  const spent = await rowOf('Δαπάνες έτους')
  eq('12. ίδιο σύνολο δαπανών στα δύο ακίνητα', spent?.map(c => c.text).join(' | '), '900,00 € | 900,00 €')

  const net = await rowOf('Καθαρό ανά μήνα (εκτίμηση)')
  const tax = await rowOf('Μερίδιο φόρου (έτος)')
  ok('12. η γραμμή του καθαρού υπάρχει', !!net && net.length === 2, JSON.stringify(net))

  // Ο ΜΕΣΟΣ ΜΗΝΑΣ, ΟΧΙ ΤΟ ΔΩΔΕΚΑΤΟ. 700 − 300 έναντι 700 − 75: διαφορά 225 €.
  eq('12. τα δύο καθαρά διαφέρουν κατά 225 € τον μήνα',
    Math.round((eur(net[1].text) - eur(net[0].text)) * 100) / 100, 225)

  // Ο ΦΟΡΟΣ ΜΠΑΙΝΕΙ ΜΕΣΑ. Το μερίδιο είναι ετήσιο, άρα διά δώδεκα.
  eq('12. το καθαρό του δεύτερου είναι ενοίκιο μείον δαπάνες μείον φόρος',
    Math.round(eur(net[1].text) * 100) / 100,
    Math.round((700 - 75 - eur(tax[0].text) / 12) * 100) / 100)

  // ΚΑΙ ΤΟ ΣΤΕΦΑΝΙ ΠΑΕΙ ΣΤΟ ΣΩΣΤΟ. Με το παλιό νούμερο ήταν ισοπαλία, δηλαδή
  // κανένα — η οθόνη σιωπούσε ακριβώς εκεί που είχε κάτι να πει.
  ok('12. έντονο το ακίνητο με το πραγματικά υψηλότερο καθαρό',
    net[1].bold === true && net[0].bold === false, JSON.stringify(net))
  ok('12. καμία εξαίρεση στην οθόνη', s.errors.length === 0, s.errors[0])
  await s.close()
}

await browser.close();
console.log(`\nΔιαδρομές χρημάτων — ${pass} πέρασαν, ${fail} απέτυχαν`);
if (fail) process.exit(1);
