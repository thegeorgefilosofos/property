// Δοκιμές ποσού διαμονής (ακαθάριστο / προμήθεια / τέλος / payout).
// Τρέξε: npx tsx lib/clients/stayAmounts.test.ts
import {
  amountBasis, hasBreakdown, guestPaid, collectedLevy, platformFee,
  declarableGross, declarableGrossOrTotal, hostPayout, needsAmountReview,
  isDeclared, sumStayAmounts, platformFeeRate, AMOUNT_BASIS_LABELS,
} from './stayAmounts';

let passed = 0, failed = 0; const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; fails.push(name); } };

// Η διαμονή του παραδείγματος: ο επισκέπτης πλήρωσε 1.000 €, από τα οποία 32 €
// τέλος ανθεκτικότητας (4 νύχτες × 8 € υψηλή περίοδος), και η πλατφόρμα κράτησε
// 150 € προμήθεια.
const full = {
  check_in: '2026-07-01', check_out: '2026-07-05', nights: 4,
  gross_guest_paid: 1000, climate_levy: 32, platform_fee: 150,
  total: 818, amount_basis: 'gross',
};

// ── Οι τρεις αριθμοί που δεν είναι ο ίδιος αριθμός ───────────────────────────
ok('έχει ρητή ανάλυση', hasBreakdown(full));
ok('τι πλήρωσε ο επισκέπτης = 1000', guestPaid(full) === 1000);
ok('τέλος ανθεκτικότητας = 32', collectedLevy(full) === 32);
ok('προμήθεια = 150', platformFee(full) === 150);
ok('ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ = 968 (1000 − 32)', declarableGross(full) === 968);
ok('PAYOUT = 818 (968 − 150)', hostPayout(full) === 818);
ok('το τέλος ΔΕΝ είναι μέσα στο ακαθάριστο', declarableGross(full)! < guestPaid(full)!);
ok('η προμήθεια ΔΕΝ μειώνει το ακαθάριστο', declarableGross(full)! > hostPayout(full)!);
ok('τα τρία νούμερα διαφέρουν', new Set([guestPaid(full), declarableGross(full), hostPayout(full)]).size === 3);
ok('με ανάλυση δεν ζητείται επιβεβαίωση', !needsAmountReview(full));

// ── Ιστορικές γραμμές: απροσδιόριστες, ΡΗΤΑ ──────────────────────────────────
// Το `total` γραφόταν ως payout από τον εισαγωγέα email και διαβαζόταν ως
// grossRevenue από τη φορολογική μηχανή. Δεν μαντεύουμε ποιο από τα δύο είναι.
const legacy = { check_in: '2026-07-01', check_out: '2026-07-05', nights: 4, total: 850 };
ok('ιστορικό: βάση απροσδιόριστη', amountBasis(legacy) === 'unknown');
ok('ιστορικό: ακαθάριστο = null (δεν μαντεύουμε)', declarableGross(legacy) === null);
ok('ιστορικό: payout = null (δεν μαντεύουμε)', hostPayout(legacy) === null);
ok('ιστορικό: τι πλήρωσε ο επισκέπτης = null', guestPaid(legacy) === null);
ok('ιστορικό: ζητείται επιβεβαίωση', needsAmountReview(legacy));
ok('ιστορικό: το ποσό ΔΕΝ χάνεται στα συγκεντρωτικά', declarableGrossOrTotal(legacy) === 850);

// Γραμμή που ο χρήστης επιβεβαίωσε ως payout, χωρίς να ξέρει την ανάλυση.
const asPayout = { nights: 2, total: 400, amount_basis: 'payout' };
ok('επιβεβαιωμένο payout → payout 400', hostPayout(asPayout) === 400);
ok('επιβεβαιωμένο payout → ακαθάριστο άγνωστο', declarableGross(asPayout) === null);
ok('επιβεβαιωμένο payout → δεν ξαναρωτάμε', !needsAmountReview(asPayout));
const asGross = { nights: 2, total: 400, amount_basis: 'gross' };
ok('επιβεβαιωμένο ακαθάριστο → 400', declarableGross(asGross) === 400);
ok('επιβεβαιωμένο ακαθάριστο → payout άγνωστο', hostPayout(asGross) === null);

// Άκυρες τιμές basis δεν περνούν για βεβαιότητα.
ok('σκουπίδι στο basis → unknown', amountBasis({ total: 100, amount_basis: 'xyz' }) === 'unknown');
ok('ετικέτες για τις τρεις βάσεις', Object.keys(AMOUNT_BASIS_LABELS).length === 3);

// ── Δήλωση βραχυχρόνιας διαμονής ─────────────────────────────────────────────
ok('χωρίς declared_at → αδήλωτη', !isDeclared({}) && !isDeclared({ declared_at: null }) && !isDeclared({ declared_at: '  ' }));
ok('με declared_at → δηλωμένη', isDeclared({ declared_at: '2026-07-06T09:00:00Z' }));

// ── Συγκεντρωτικά: η αβεβαιότητα μετριέται, δεν κρύβεται ─────────────────────
const t = sumStayAmounts([full, legacy, { nights: 1, total: 0 }]);
ok('σύνολο ακαθαρίστων = 968 + 850', t.declarableGross === 1818);
ok('βέβαιο μέρος = 968', t.confirmedGross === 968);
ok('απροσδιόριστο μέρος = 850', t.unresolvedAmount === 850);
ok('απροσδιόριστες γραμμές = 1 (η μηδενική δεν μετράει)', t.unresolvedCount === 1);
ok('προμήθειες = 150', t.platformFees === 150);
ok('τέλος = 32', t.climateLevy === 32);
ok('πλήθος = 3', t.count === 3);
ok('κενό σύνολο → μηδενικά', (() => { const z = sumStayAmounts([]); return z.declarableGross === 0 && z.unresolvedCount === 0 && z.count === 0; })());

// ── Ποσοστό προμήθειας: από τα δικά του δεδομένα, ή καθόλου ──────────────────
// Το παλιό OccupancyPanel είχε προεπιλογή «15%» χωρίς πηγή. Πλέον: ή μετρημένο,
// ή `null` και η οθόνη λέει ότι δεν την ξέρουμε.
ok('ποσοστό προμήθειας = 150/1000', platformFeeRate([full]) === 0.15);
ok('χωρίς καταγεγραμμένη προμήθεια → null', platformFeeRate([legacy]) === null);
ok('χωρίς διαμονές → null', platformFeeRate([]) === null);
ok('αγνοεί γραμμές χωρίς ανάλυση', platformFeeRate([full, legacy]) === 0.15);

console.log(`\nstayAmounts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
