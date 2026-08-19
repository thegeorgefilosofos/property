// Αυστηρά τεστ για την κλίμακα φόρου ενοικίων 2026 (greekTax.ts).
// Τρέξε: npx tsx lib/billing/greekTax.test.ts
import { fp } from '@/lib/core/format';
import {
  rentalIncomeTax, marginalRate, effectiveRentalRate,
  RENTAL_TAX_BRACKETS_2026, RENTAL_TAX_ROWS_2026, taxRateLabel,
  climateLevyForNights, isHighSeasonMonth, shortTermNet, CLIMATE_LEVY_PER_NIGHT_2025,
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
ok('rows include 25% band', RENTAL_TAX_ROWS_2026.some(r => r.rate === '25,00%' && r.from === 12000 && r.to === 24000));
// Η ΕΤΙΚΕΤΑ ΒΓΑΙΝΕΙ ΑΠΟ ΤΟΝ ΑΡΙΘΜΟ ΠΟΥ ΧΡΕΩΝΕΙ. Οι ετικέτες ήταν χειρόγραφες
// («rate: '15%'») δίπλα στα κλιμάκια που κάνουν τον υπολογισμό: ένα ορθογραφικό
// θα έδειχνε άλλο ποσοστό απο αυτό που εφαρμόζεται, και ο παλιός έλεγχος
// επιβεβαίωνε μόνο τα ΟΡΙΑ, όχι τους συντελεστές.
ok('κάθε ετικέτα συμφωνεί με τον συντελεστή της',
  RENTAL_TAX_ROWS_2026.every((r, i) => r.rate === taxRateLabel(RENTAL_TAX_BRACKETS_2026[i].rate)));
ok('η ετικέτα περνά από τον έναν μορφοποιητή', taxRateLabel(0.15) === fp(15));
ok('δεκαδικό ποσοστό παίρνει κόμμα', taxRateLabel(0.155) === '15,50%');

// ── Τέλος ανθεκτικότητας (ΤΑΚΚ) βραχυχρόνιας ─────────────────────────────────
ok('high season Απρ–Οκτ', [3,4,5,6,7,8,9].every(isHighSeasonMonth) && ![0,1,2,10,11].some(isHighSeasonMonth));
// 10 νύχτες Ιανουάριο (χαμηλή) = 20 €· 10 νύχτες Ιούλιο (υψηλή) = 80 €
ok('levy low month', climateLevyForNights([10,0,0,0,0,0,0,0,0,0,0,0]) === 20);
ok('levy high month', climateLevyForNights([0,0,0,0,0,0,10,0,0,0,0,0]) === 80);
ok('levy empty', climateLevyForNights(Array(12).fill(0)) === 0);
ok('levy rates', CLIMATE_LEVY_PER_NIGHT_2025.high === 8 && CLIMATE_LEVY_PER_NIGHT_2025.low === 2);
// καθαρά έσοδα: 100 νύχτες Ιούλιο × 100 € = 10.000 μεικτά· 15% προμήθεια=1.500·
// διαμονές=100/4=25 × 50 καθαρισμός=1.250· ΤΑΚΚ=100×8=800· καθαρά=10.000-1.500-1.250-800=6.450
{
  const nights = [0,0,0,0,0,0,100,0,0,0,0,0];
  const r = shortTermNet({ nightsByMonth: nights, nightlyRate: 100, platformFeePct: 15, cleaningPerStay: 50, avgNightsPerStay: 4 });
  ok('st gross', r.grossRevenue === 10000);
  ok('st platform', r.platformFees === 1500);
  ok('st cleaning', r.cleaningTotal === 1250);
  ok('st levy', r.levy === 800);
  ok('st net', r.net === 6450);
  ok('st stays', r.stays === 25);
}
// αντοχή σε μηδενικά/άκυρα
{
  const r = shortTermNet({ nightsByMonth: Array(12).fill(0), nightlyRate: 0, platformFeePct: 0, cleaningPerStay: 0, avgNightsPerStay: 0 });
  ok('st zero net', r.net === 0 && r.stays === 0 && r.levy === 0);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ngreekTax.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
