// Αυστηρά τεστ για την κλίμακα φόρου ενοικίων 2026 (greekTax.ts).
// Τρέξε: npx tsx lib/billing/greekTax.test.ts
import {
  rentalIncomeTax, marginalRate, effectiveRentalRate,
  RENTAL_TAX_BRACKETS_2026, RENTAL_TAX_ROWS_2026,
} from './greekTax';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── Γνωστές, χειροκίνητα υπολογισμένες τιμές ─────────────────────────────────
const KNOWN: [number, number][] = [
  [0, 0],
  [-100, 0],
  [1000, 150],
  [12000, 1800],                       // 12000*.15
  [14000, 1800 + 2000 * 0.25],         // 2300
  [20000, 1800 + 8000 * 0.25],         // 3800
  [24000, 1800 + 12000 * 0.25],        // 4800
  [30000, 4800 + 6000 * 0.35],         // 6900
  [35000, 4800 + 11000 * 0.35],        // 8650
  [50000, 8650 + 15000 * 0.45],        // 15400
  [100000, 8650 + 65000 * 0.45],       // 37900
];
for (const [inc, exp] of KNOWN) ok(`tax(${inc})=${exp}`, near(rentalIncomeTax(inc), exp));

// ── Όρια κλιμακίων: ο μέσος συντελεστής μένει μέσα στα λογικά όρια ────────────
ok('tax(12000) avg = 15%', near(effectiveRentalRate(12000), 0.15));
ok('tax(24000) avg = 20%', near(effectiveRentalRate(24000), 4800 / 24000));
ok('effective always in [0.15,0.45] for >0', (() => {
  for (let x = 1; x <= 200000; x += 137) { const e = effectiveRentalRate(x); if (e < 0.15 - 1e-9 || e > 0.45 + 1e-9) return false; }
  return true;
})());

// ── Οριακός συντελεστής στα σημεία-κλειδιά ───────────────────────────────────
ok('marginal(5000)=15%', marginalRate(5000) === 0.15);
ok('marginal(12000)=15%', marginalRate(12000) === 0.15);      // στο ακριβές όριο ακόμη 15%
ok('marginal(12001)=25%', marginalRate(12001) === 0.25);
ok('marginal(24001)=35%', marginalRate(24001) === 0.35);
ok('marginal(35001)=45%', marginalRate(35001) === 0.45);
ok('marginal(999999)=45%', marginalRate(999999) === 0.45);

// ── Ιδιότητες: μονοτονία, μη-αρνητικότητα, φράγματα (χιλιάδες assertions) ─────
let prev = -1;
for (let x = 0; x <= 300000; x++) {
  const t = rentalIncomeTax(x);
  ok(`nonneg ${x}`, t >= 0);
  ok(`monotone ${x}`, t >= prev - 1e-9);
  ok(`upper ${x}`, t <= x * 0.45 + 1e-6);
  ok(`lower ${x}`, x === 0 || t >= x * 0.15 - 1e-6);
  prev = t;
}

// ── Προσθετικότητα κατά κλιμάκιο (το άθροισμα των slices ισούται με τον φόρο) ─
for (let x = 0; x <= 60000; x += 1000) {
  let manual = 0;
  for (const b of RENTAL_TAX_BRACKETS_2026) { if (x <= b.from) break; manual += (Math.min(x, b.to) - b.from) * b.rate; }
  ok(`manual==fn ${x}`, near(manual, rentalIncomeTax(x)));
}

// ── Οι γραμμές UI είναι συνεπείς με τα κλιμάκια ──────────────────────────────
ok('rows count == brackets', RENTAL_TAX_ROWS_2026.length === RENTAL_TAX_BRACKETS_2026.length);
ok('rows boundaries match', RENTAL_TAX_ROWS_2026.every((r, i) => r.from === RENTAL_TAX_BRACKETS_2026[i].from && r.to === RENTAL_TAX_BRACKETS_2026[i].to));
ok('rows include 25% band', RENTAL_TAX_ROWS_2026.some(r => r.rate === '25%' && r.from === 12000 && r.to === 24000));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ngreekTax.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
