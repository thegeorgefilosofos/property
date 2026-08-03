// Δοκιμές φορολογικής σύνοψης βραχυχρόνιας. Τρέξε: npx tsx lib/tax/shortTermTax.test.ts
import {
  nightsByMonthForYear, channelBreakdownForYear, shortTermYearSummary, yearsWithStays,
  guestPriceBreakdown,
} from './shortTermTax';
import { climateLevyForNights, rentalIncomeTax, CLIMATE_LEVY_STR_2025 } from '../billing/greekTax';

let passed = 0, failed = 0; const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; fails.push(name); } };
const near = (a: number, b: number, e = 0.01) => Math.abs(a - b) < e;

const stays = [
  { check_in: '2026-07-01', check_out: '2026-07-05', nights: 4, total: 800, channel: 'airbnb' },  // 4 νύχτες Ιουλ (υψηλή)
  { check_in: '2026-08-10', check_out: '2026-08-12', nights: 2, total: 500, channel: 'booking' }, // 2 νύχτες Αυγ (υψηλή)
  { check_in: '2026-01-20', check_out: '2026-01-22', nights: 2, total: 200, channel: 'airbnb' },  // 2 νύχτες Ιαν (χαμηλή)
  { check_in: '2025-07-01', check_out: '2025-07-03', nights: 2, total: 300, channel: 'airbnb' },  // άλλο έτος
];

// ── nightsByMonthForYear ─────────────────────────────────────────────────────
const nbm = nightsByMonthForYear(stays, 2026);
ok('Ιαν 2 νύχτες', nbm[0] === 2);
ok('Ιουλ 4 νύχτες', nbm[6] === 4);
ok('Αυγ 2 νύχτες', nbm[7] === 2);
ok('σύνολο 8 νύχτες (2026)', nbm.reduce((a, b) => a + b, 0) === 8);
ok('αγνοεί 2025', nightsByMonthForYear(stays, 2026).reduce((a, b) => a + b, 0) === 8);
// διάστημα που διασχίζει μήνα
const cross = nightsByMonthForYear([{ check_in: '2026-06-29', check_out: '2026-07-02' }], 2026);
ok('διασταύρωση μήνα: Ιουν 2 + Ιουλ 1', cross[5] === 2 && cross[6] === 1);

// ── channelBreakdownForYear ──────────────────────────────────────────────────
const cb = channelBreakdownForYear(stays, 2026);
ok('2 κανάλια το 2026', cb.length === 2);
ok('airbnb πρώτο (μεγαλύτερα έσοδα)', cb[0].channel === 'airbnb' && cb[0].revenue === 1000);
ok('booking έσοδα 500', cb.find(r => r.channel === 'booking')?.revenue === 500);

// ── shortTermYearSummary ─────────────────────────────────────────────────────
const sum = shortTermYearSummary(stays, 2026);
ok('μεικτά 1500', sum.grossRevenue === 1500);
ok('σύνολο νυχτών 8', sum.totalNights === 8);
ok('πλήθος διαμονών 3', sum.stayCount === 3);
// ΤΑΚΚ (≤80 τ.μ.): 6 νύχτες υψηλή × 8 + 2 νύχτες χαμηλή × 2 = 48 + 4 = 52
ok('ΤΑΚΚ ≤80τμ = 52', sum.levy === 52 && sum.levy === climateLevyForNights(nbm));
// ΤΑΚΚ υψηλό κλιμάκιο ΜΟΝΟ για μονοκατοικία >80 τ.μ.: 6 × 15 + 2 × 4 = 98
const sumLarge = shortTermYearSummary(stays, 2026, { sqm: 120, isHouse: true });
ok('ΤΑΚΚ μονοκατοικία >80τμ = 98', sumLarge.levy === 98 && sumLarge.levy === climateLevyForNights(nbm, 120, true));
// Διαμέρισμα >80 τ.μ. ΔΕΝ ανεβαίνει κλιμάκιο → παραμένει 52
ok('ΤΑΚΚ διαμέρισμα >80τμ = 52', shortTermYearSummary(stays, 2026, { sqm: 120 }).levy === 52);
ok('εμβαδόν 80 = μικρή κλίμακα', shortTermYearSummary(stays, 2026, { sqm: 80 }).levy === 52);

// ── Τέλος παρεπιδημούντων (0,5% / εξαίρεση) ──────────────────────────────────
ok('χωρίς meta → τέλος παρεπ. 0 (τυπική εξαίρεση)', sum.municipalTax === 0 && sum.municipalExempt);
ok('≤80τμ → εξαίρεση (0)', shortTermYearSummary(stays, 2026, { sqm: 60 }).municipalTax === 0);
ok('μονοκατοικία >80τμ → εξαίρεση (0)', shortTermYearSummary(stays, 2026, { sqm: 200, isHouse: true }).municipalTax === 0);
// διαμέρισμα >80τμ, φυσικό πρόσωπο έως 2 ακίνητα → ΕΞΑΙΡΕΣΗ (το κριτήριο είναι
// η ιδιότητα/αριθμός ακινήτων, όχι τα τ.μ.)
ok('διαμέρισμα >80τμ φυσ. πρόσωπο → εξαίρεση (0)', shortTermYearSummary(stays, 2026, { sqm: 120 }).municipalTax === 0);
// άνω των 2 ακινήτων → όχι εξαίρεση (0,5% × 1500 = 7,5), ανεξαρτήτως τ.μ.
ok('>2 ακίνητα → 0,5% = 7,5', shortTermYearSummary(stays, 2026, { sqm: 60, propertyCount: 3 }).municipalTax === 7.5);
ok('net αφαιρεί τέλος παρεπ.', Math.abs(shortTermYearSummary(stays, 2026, { sqm: 60, propertyCount: 3 }).net - (1500 - rentalIncomeTax(1500 * 0.95) - 52 - 7.5)) < 0.01);
ok('φόρος = κλίμακα(95% × 1500), τεκμαρτή έκπτωση 5%', near(sum.incomeTax, rentalIncomeTax(1500 * 0.95)));
ok('καθαρά = μεικτά - φόρος - ΤΑΚΚ', near(sum.net, 1500 - sum.incomeTax - 52));
ok('effectiveRate = φόρος/μεικτά', near(sum.effectiveRate, sum.incomeTax / 1500));
// Gate 5%: με μετρητά (όχι τραπεζική είσπραξη) φορολογείται το 100% των μεικτών
ok('μετρητά → φόρος επί 100% μεικτών', near(shortTermYearSummary(stays, 2026, { rentsPaidViaBank: false }).incomeTax, rentalIncomeTax(1500)));
ok('κενό set → μηδενικά', shortTermYearSummary([], 2026).grossRevenue === 0 && shortTermYearSummary([], 2026).effectiveRate === 0);

// ── yearsWithStays ───────────────────────────────────────────────────────────
ok('έτη = [2026, 2025]', JSON.stringify(yearsWithStays(stays)) === JSON.stringify([2026, 2025]));

// ═══ ΑΚΑΘΑΡΙΣΤΑ vs PAYOUT — το δομικό λάθος που διορθώθηκε ═══════════════════
// Πριν: το `total` γραφόταν ως payout και διαβαζόταν ως grossRevenue. Τώρα το
// ακαθάριστο βγαίνει από τη ρητή ανάλυση, και το τέλος ανθεκτικότητας ΔΕΝ μπαίνει
// μέσα του — είναι χρήμα του κράτους που περνά από τα χέρια του οικοδεσπότη.
const broken = [
  // 4 νύχτες Ιουλ: ο επισκέπτης πλήρωσε 1.000, τέλος 32 (4×8), προμήθεια 150.
  { check_in: '2026-07-01', check_out: '2026-07-05', nights: 4, channel: 'airbnb', total: 818, amount_basis: 'gross', gross_guest_paid: 1000, climate_levy: 32, platform_fee: 150 },
];
const bs = shortTermYearSummary(broken, 2026);
ok('ΑΚΑΘΑΡΙΣΤΟ = τι πλήρωσε ο επισκέπτης − τέλος', bs.grossRevenue === 968);
ok('το τέλος ανθεκτικότητας ΔΕΝ είναι μέσα στα ακαθάριστα', bs.grossRevenue === 1000 - 32 && bs.grossRevenue < 1000);
ok('η προμήθεια ΔΕΝ αφαιρείται από τα ακαθάριστα', bs.grossRevenue === 968 && bs.platformFees === 150);
ok('η προμήθεια αναφέρεται χωριστά ως δαπάνη', bs.platformFees === 150);
ok('εισπραχθέν τέλος καταγράφεται χωριστά από το οφειλόμενο', bs.collectedLevy === 32 && bs.levy === 32);
ok('ρητή ανάλυση → μηδέν απροσδιόριστα', bs.unresolvedCount === 0 && bs.unresolvedAmount === 0);
ok('φόρος πάνω στο ΑΚΑΘΑΡΙΣΤΟ (95%), όχι στο payout', near(bs.incomeTax, rentalIncomeTax(968 * 0.95)));

// Ιστορικές γραμμές: απροσδιόριστη βάση, μετριούνται ΧΩΡΙΣΤΑ και δεν κρύβονται.
ok('ιστορικό total → απροσδιόριστο, 3 γραμμές', sum.unresolvedCount === 3 && sum.unresolvedAmount === 1500);
ok('ιστορικό total → μηδέν προμήθειες/εισπραχθέν τέλος γνωστά', sum.platformFees === 0 && sum.collectedLevy === 0);

// Δήλωση βραχυχρόνιας διαμονής ανά κράτηση.
ok('χωρίς declared_at → όλες αδήλωτες', sum.undeclaredCount === 3);
ok('με declared_at → μετριέται ως δηλωμένη', shortTermYearSummary(
  [{ check_in: '2026-07-01', check_out: '2026-07-03', nights: 2, total: 200, declared_at: '2026-07-05T10:00:00Z' },
   { check_in: '2026-08-01', check_out: '2026-08-03', nights: 2, total: 200 }], 2026).undeclaredCount === 1);

// ── guestPriceBreakdown: η γραμμή κάτω από κάθε προτεινόμενη τιμή ─────────────
const bdHigh = guestPriceBreakdown('2026-08-15', 100);
ok('υψηλή περίοδος (Αύγουστος)', bdHigh.highSeason && bdHigh.climateLevy === CLIMATE_LEVY_STR_2025.small.high);
ok('δηλωτέο ακαθάριστο = τιμή − τέλος', bdHigh.declarableGross === 100 - CLIMATE_LEVY_STR_2025.small.high);
ok('χωρίς ιστορικό προμήθειας → δεν την επινοούμε', bdHigh.platformFeeRate === null && bdHigh.platformFee === null && bdHigh.payout === null);
const bdLow = guestPriceBreakdown('2026-01-15', 100);
ok('χαμηλή περίοδος (Ιανουάριος)', !bdLow.highSeason && bdLow.climateLevy === CLIMATE_LEVY_STR_2025.small.low);
ok('χαμηλό τέλος → μεγαλύτερο ακαθάριστο', bdLow.declarableGross > bdHigh.declarableGross);
const bdHouse = guestPriceBreakdown('2026-08-15', 100, { sqm: 120, isHouse: true });
ok('μονοκατοικία >80τμ → υψηλό κλιμάκιο τέλους', bdHouse.climateLevy === CLIMATE_LEVY_STR_2025.large.high);
const bdFee = guestPriceBreakdown('2026-08-15', 100, { platformFeeRate: 0.15 });
ok('με ιστορικό προμήθειας → payout = ακαθάριστο − προμήθεια', bdFee.platformFee === 15 && bdFee.payout === 100 - 8 - 15);
ok('η προμήθεια δεν αγγίζει το δηλωτέο ακαθάριστο', bdFee.declarableGross === bdHigh.declarableGross);

console.log(`\nshortTermTax — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
