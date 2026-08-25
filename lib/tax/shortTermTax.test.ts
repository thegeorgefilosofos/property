// Δοκιμές φορολογικής σύνοψης βραχυχρόνιας. Τρέξε: npx tsx lib/tax/shortTermTax.test.ts
import { nightsByMonthForYear, channelBreakdownForYear, shortTermYearSummary, yearsWithStays, guestPriceBreakdown, type TaxStay } from './shortTermTax';
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
// ΣΤΟ ΧΕΡΙ: μεικτά 1.500 → φορολογητέα βάση 1.500 × 0,95 = 1.425· κλιμάκιο 15%
// (≤12.000) → φόρος 1.425 × 0,15 = 213,75. Τέλος παρεπ. 1.500 × 0,005 = 7,50.
//
// ΠΡΟΣΟΧΗ ΣΤΟ ΤΑΚΚ ΕΔΩ: αυτές οι γραμμές είναι ΙΣΤΟΡΙΚΕΣ (ωμό `total`, χωρίς
// ανάλυση). Το ακαθάριστο των 1.500 έχει το τέλος ΜΕΣΑ και δεν υπάρχει
// καταγεγραμμένη είσπραξη (collectedLevy = 0), ενώ οφείλονται 52 €. Άρα το
// ακάλυπτο ΤΑΚΚ είναι 52 και φεύγει από τα καθαρά — μία φορά, όχι δύο.
// Καθαρά = 1.500 − 213,75 − 7,50 − 52 = 1.226,75.
const sumMuni = shortTermYearSummary(stays, 2026, { sqm: 60, propertyCount: 3 });
ok('net αφαιρεί τέλος παρεπ.', near(sumMuni.net, 1226.75));
ok('ακάλυπτο ΤΑΚΚ = 52 (οφείλεται 52, εισπράχθηκε 0)', sumMuni.levyShortfall === 52 && sum.levyShortfall === 52);
ok('φόρος = κλίμακα(95% × 1500), τεκμαρτή έκπτωση 5%', near(sum.incomeTax, rentalIncomeTax(1500 * 0.95)) && near(sum.incomeTax, 213.75));
// Χωρίς τέλος παρεπ. (εξαίρεση): 1.500 − 213,75 − 52 = 1.234,25.
ok('καθαρά = μεικτά − φόρος − ακάλυπτο ΤΑΚΚ', near(sum.net, 1234.25) && near(sum.net, 1500 - sum.incomeTax - 52));
ok('effectiveRate = φόρος/μεικτά', near(sum.effectiveRate, sum.incomeTax / 1500));
// Gate 5%: με μετρητά (όχι τραπεζική είσπραξη) φορολογείται το 100% των μεικτών
ok('μετρητά → φόρος επί 100% μεικτών', near(shortTermYearSummary(stays, 2026, { rentsPaidViaBank: false }).incomeTax, rentalIncomeTax(1500)));
ok('κενό set → μηδενικά', shortTermYearSummary([], 2026).grossRevenue === 0 && shortTermYearSummary([], 2026).effectiveRate === 0);

// ── yearsWithStays ───────────────────────────────────────────────────────────
ok('έτη = [2026, 2025]', JSON.stringify(yearsWithStays(stays)) === JSON.stringify([2026, 2025]));

// ═══ ΑΚΑΘΑΡΙΣΤΑ vs PAYOUT — το δομικό λάθος που διορθώθηκε ═══════════════════
// Πριν: το `total` γραφόταν ως payout και διαβαζόταν ως grossRevenue. Τώρα το
// ακαθάριστο βγαίνει από τη ρητή ανάλυση και το τέλος ανθεκτικότητας ΔΕΝ μπαίνει
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

// ═══ ΤΟ ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ ΑΦΑΙΡΕΙΤΑΙ ΜΙΑ ΦΟΡΑ ΑΠΟ ΤΑ ΚΑΘΑΡΑ ═════════════
// Πριν, τα καθαρά έβγαζαν το ΤΑΚΚ δεύτερη φορά: μία μέσα στο ακαθάριστο
// (declarableGross = τι πλήρωσε ο επισκέπτης − τέλος) και μία ξανά στον τύπο.
//
// ΥΠΟΛΟΓΙΣΜΟΣ ΣΤΟ ΧΕΡΙ — 5 νύχτες Αυγούστου (υψηλή περίοδος), διαμέρισμα ≤80 τ.μ.:
//   1. ο επισκέπτης πλήρωσε                          1.000,00
//   2. ΤΑΚΚ 5 νύχτες × 8 € (υψηλή, small)         −     40,00
//   3. ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ                           =  960,00
//   4. φορολογητέα βάση 960 × 0,95 (τεκμαρτή 5%)    =  912,00
//   5. φόρος 912 × 0,15 (κλιμάκιο ≤12.000)          =  136,80
//   6. τέλος παρεπιδημούντων (φυσ. πρόσωπο, 1 ακίνητο) = 0
//   7. ΚΑΘΑΡΑ = 960 − 136,80 − 0                    =  823,20
// Διασταύρωση από την άλλη μεριά: 1.000 − 40 (ΤΑΚΚ) − 136,80 (φόρος) = 823,20.
// Πριν τη διόρθωση έβγαινε 783,20 — λιγότερα κατά ολόκληρο το ΤΑΚΚ (40 €).
const levyOnce = [
  { check_in: '2026-08-10', check_out: '2026-08-15', nights: 5, channel: 'airbnb', total: 810, amount_basis: 'gross', gross_guest_paid: 1000, climate_levy: 40, platform_fee: 150 },
];
const lo = shortTermYearSummary(levyOnce, 2026);
ok('ακαθάριστο = 1000 − 40 = 960', lo.grossRevenue === 960);
ok('ΤΑΚΚ 5 νύχτες υψηλής = 40', lo.levy === 40 && lo.collectedLevy === 40);
ok('φόρος = 912 × 15% = 136,80', near(lo.incomeTax, 136.80));
ok('καθαρά = 823,20 — το ΤΑΚΚ ΜΙΑ φορά, όχι δύο', near(lo.net, 823.20));
ok('καθαρά = τι πλήρωσε ο επισκέπτης − ΤΑΚΚ − φόρος', near(lo.net, 1000 - 40 - lo.incomeTax));
ok('τα καθαρά ΔΕΝ είναι 783,20 (διπλή αφαίρεση ΤΑΚΚ)', !near(lo.net, 783.20));
ok('τίποτα ακάλυπτο: οφείλονται 40, εισπράχθηκαν 40', lo.levyShortfall === 0);
// Με τέλος παρεπιδημούντων (3 ακίνητα): 960 × 0,005 = 4,80 → 960 − 136,80 − 4,80 = 818,40
const loMuni = shortTermYearSummary(levyOnce, 2026, { sqm: 60, propertyCount: 3 });
ok('τέλος παρεπ. = 4,80 και αφαιρείται μία φορά', loMuni.municipalTax === 4.80 && near(loMuni.net, 818.40));

// ═══ ΚΑΙ Η ΑΝΤΙΘΕΤΗ ΤΡΥΠΑ: ΤΟ ΤΕΛΟΣ ΠΟΥ ΔΕΝ ΧΡΕΩΘΗΚΕ ΠΟΤΕ ══════════════════
// Η πρώτη διόρθωση έσβησε το `− levy` υποθέτοντας ότι το τέλος είναι ΠΑΝΤΑ ήδη
// έξω από τα ακαθάριστα. Δεν είναι: ο οικοδεσπότης που δεν το χρέωσε στους
// επισκέπτες το οφείλει στην ΑΑΔΕ ούτως ή άλλως και το πληρώνει από την τσέπη
// του. Η ίδια διαμονή, με μηδενική είσπραξη τέλους:
//   ο επισκέπτης πλήρωσε 1.000, τέλος που εισπράχθηκε 0 → ακαθάριστο 1.000
//   φόρος 1.000 × 0,95 × 0,15                          = 142,50
//   ΤΑΚΚ 5 νύχτες Αυγούστου × 8 €, ακάλυπτο            =  40,00
//   ΚΑΘΑΡΑ = 1.000 − 142,50 − 40                       = 817,50
const levyUncollected = [
  { check_in: '2026-08-10', check_out: '2026-08-15', nights: 5, channel: 'airbnb', total: 850, amount_basis: 'gross', gross_guest_paid: 1000, climate_levy: 0, platform_fee: 150 },
];
const lu = shortTermYearSummary(levyUncollected, 2026);
ok('ακαθάριστο = 1000 (δεν αφαιρέθηκε τέλος που δεν εισπράχθηκε)', lu.grossRevenue === 1000);
ok('οφείλονται 40, εισπράχθηκαν 0 → ακάλυπτο 40', lu.levy === 40 && lu.collectedLevy === 0 && lu.levyShortfall === 40);
ok('καθαρά = 817,50 — το ακάλυπτο ΤΑΚΚ βαραίνει τον ιδιοκτήτη', near(lu.net, 817.50));
ok('τα καθαρά ΔΕΝ είναι 857,50 (το ΤΑΚΚ αγνοημένο)', !near(lu.net, 857.50));
// Παραείσπραξη δεν γίνεται κέρδος: αποδίδεται στο κράτος, δεν προστίθεται.
const overCollected = [
  { check_in: '2026-08-10', check_out: '2026-08-15', nights: 5, channel: 'airbnb', total: 810, amount_basis: 'gross', gross_guest_paid: 1000, climate_levy: 60, platform_fee: 150 },
];
ok('παραείσπραξη τέλους → ακάλυπτο 0, όχι αρνητικό', shortTermYearSummary(overCollected, 2026).levyShortfall === 0);

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

// ═══ Η ΔΙΑΜΟΝΗ ΠΟΥ ΠΕΡΝΑ ΤΗΝ ΠΡΩΤΟΧΡΟΝΙΑ ══════════════════════════════════
// Το τέλος ανθεκτικότητας χρεωνόταν ΔΥΟ φορές. Οι διανυκτερεύσεις μοιράζονταν
// σωστά στα δύο έτη (άρα και το οφειλόμενο τέλος), αλλά το ΕΙΣΠΡΑΓΜΕΝΟ
// αποδιδόταν ολόκληρο στο έτος του check-in — οπότε το δεύτερο έτος έβλεπε
// οφειλή χωρίς κάλυψη και την περνούσε στους φόρους του ιδιοκτήτη.
{
  // 28/12/2025 → 5/1/2026: οκτώ διανυκτερεύσεις, τέσσερις σε κάθε έτος.
  const nye = [{
    check_in: '2025-12-28', check_out: '2026-01-05', nights: 8,
    gross_guest_paid: 1216, climate_levy: 16, platform_fee: 0,
    amount_basis: 'gross', total: 1216, channel: 'airbnb',
  }] as unknown as TaxStay[]
  const meta = { sqm: 70, isHouse: false, individual: true }
  const a = shortTermYearSummary(nye, 2025, meta)
  const b = shortTermYearSummary(nye, 2026, meta)

  ok('οι διανυκτερεύσεις μοιράζονται στα δύο έτη', a.totalNights === 4 && b.totalNights === 4)
  // Το εισπραγμένο ακολουθεί τις διανυκτερεύσεις: 8 € σε κάθε έτος, όχι 16 και 0.
  ok('το εισπραγμένο τέλος μοιράζεται κι αυτό', Math.abs(a.collectedLevy - 8) < 0.01 && Math.abs(b.collectedLevy - 8) < 0.01)
  ok('το σύνολο του εισπραγμένου παραμένει 16', Math.abs((a.collectedLevy + b.collectedLevy) - 16) < 0.01)
  // ΤΟ ΚΑΘΑΥΤΟ ΣΦΑΛΜΑ: το δεύτερο έτος δεν ξαναχρεώνει.
  ok('κανένα ακάλυπτο τέλος στο πρώτο έτος', a.levyShortfall === 0)
  ok('κανένα ακάλυπτο τέλος στο δεύτερο έτος', b.levyShortfall === 0)
  ok('το καθαρό του δεύτερου έτους δεν είναι αρνητικό από φάντασμα τέλους', b.net >= 0)

  // Έλεγχος ότι δεν σπάσαμε την αντίθετη περίπτωση: αν ΔΕΝ εισπράχθηκε τέλος,
  // εξακολουθεί να οφείλεται — σε κάθε έτος το μερίδιό του.
  const nyeNoLevy = [{ ...(nye[0] as object), climate_levy: 0 }] as unknown as TaxStay[]
  const c = shortTermYearSummary(nyeNoLevy, 2026, meta)
  ok('χωρίς είσπραξη, το τέλος εξακολουθεί να οφείλεται', c.levyShortfall > 0)
}
{
  // Διαμονή εξ ολοκλήρου εκτός έτους δεν συνεισφέρει τίποτα.
  const far = [{
    check_in: '2024-06-01', check_out: '2024-06-05', nights: 4,
    gross_guest_paid: 400, climate_levy: 8, amount_basis: 'gross', total: 400,
  }] as unknown as TaxStay[]
  const s = shortTermYearSummary(far, 2026, { sqm: 70, isHouse: false })
  ok('διαμονή άλλης χρονιάς: μηδέν εισπραγμένο', s.collectedLevy === 0)
  ok('διαμονή άλλης χρονιάς: μηδέν οφειλόμενο', s.levy === 0)
}

// ═══ Η ΔΙΑΜΟΝΗ ΠΟΥ ΠΕΡΝΑ ΤΗΝ ΠΡΩΤΟΧΡΟΝΙΑ, ΜΕ ΕΝΑΝ ΚΑΝΟΝΑ ══════════════════
//
// ΠΡΙΝ: το 2026 έβγαινε με ΤΑΚΚ 8 € πάνω σε τζίρο 0 € και ο φόρος του 2025
// υπολογιζόταν σε οκτώ νύχτες εκ των οποίων οι τέσσερις ανήκουν στο 2026.
{
  const straddle: TaxStay[] = [{
    check_in: '2025-12-28', check_out: '2026-01-05', nights: 8,
    gross_guest_paid: 800, climate_levy: 16, channel: 'airbnb',
    platform_fee: 40, declared_at: '2025-12-20',
  }];

  const a = shortTermYearSummary(straddle, 2025);
  const b = shortTermYearSummary(straddle, 2026);

  ok('τέσσερις νύχτες στο 2025', a.totalNights === 4);
  ok('τέσσερις νύχτες στο 2026', b.totalNights === 4);
  ok('το ακαθάριστο μοιράζεται στα δύο', near(a.grossRevenue, b.grossRevenue, 0.02));
  ok('και αθροίζει στο σύνολο της διαμονής', near(a.grossRevenue + b.grossRevenue, 784, 0.02));
  ok('καμία χρονιά με τέλος και μηδέν έσοδο', !(b.levy > 0 && b.grossRevenue === 0));
  ok('η προμήθεια πλατφόρμας μοιράζεται κι αυτή', near(a.platformFees + b.platformFees, 40, 0.02));

  // Ο πίνακας καναλιών λέει ό,τι και η κάρτα σύνοψης.
  ok('οι νύχτες ανά κανάλι αθροίζουν στο σύνολο',
     a.byChannel.reduce((s, r) => s + r.nights, 0) === a.totalNights);
  ok('και τα έσοδα ανά κανάλι επίσης',
     near(a.byChannel.reduce((s, r) => s + r.revenue, 0), a.grossRevenue, 0.02));
  ok('ίδιο ποσό ανά νύχτα στις δύο οθόνες',
     near(a.grossRevenue / a.totalNights, a.byChannel[0].revenue / a.byChannel[0].nights, 0.02));

  // Τα ΠΛΗΘΗ δεν μοιράζονται: μια διαμονή δηλώνεται μία φορά.
  ok('η διαμονή μετριέται στο έτος της άφιξης', a.stayCount === 1 && b.stayCount === 0);
  ok('και το κανάλι τη μετρά μία φορά',
     a.byChannel[0].stays === 1 && (b.byChannel[0]?.stays ?? 0) === 0);
}

// Διαμονή εξ ολοκλήρου μέσα στο έτος: τίποτα δεν αλλάζει.
{
  const inside: TaxStay[] = [{
    check_in: '2026-06-01', check_out: '2026-06-05', nights: 4,
    gross_guest_paid: 400, climate_levy: 8, channel: 'booking',
  }];
  const r = shortTermYearSummary(inside, 2026);
  ok('ολόκληρο το ακαθάριστο στο έτος του', near(r.grossRevenue, 392, 0.02));
  ok('όλες οι νύχτες στο έτος του', r.totalNights === 4);
}

console.log(`\nshortTermTax — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
