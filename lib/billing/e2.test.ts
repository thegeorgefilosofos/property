// Αυστηρά τεστ για την Αναλυτική Κατάσταση Ε2 (e2.ts).
// Τρέξε: npx tsx lib/billing/e2.test.ts
import {
  monthsRentedInYear, e2LeaseKind, e2IncomeCategory,
  buildE2Row, e2RowToCells, buildE1Summary, e1LineToCells, type E2Property, type E2Tenant, type E2Payment, type E2Row, type E2Stay,
} from './e2';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };

// ── μήνες εκμίσθωσης (τομή μισθωτηρίου με το έτος) ───────────────────────────
ok('full year rented → 12', monthsRentedInYear('2025-01-01', '2025-12-31', 2025, 'rented').months === 12);
ok('mid-year open lease → 6 (Ιουλ..Δεκ)', monthsRentedInYear('2025-07-01', null, 2025, 'rented').months === 6);
ok('lease entirely before year → 0', monthsRentedInYear('2024-01-01', '2024-06-30', 2025, 'rented').months === 0);
{
  const r = monthsRentedInYear(null, null, 2025, 'rented');
  ok('no lease + rented → 12 estimated', r.months === 12 && r.estimated === true);
}
{
  const r = monthsRentedInYear(null, null, 2025, 'vacant');
  ok('no lease + vacant → 0 estimated', r.months === 0 && r.estimated === true);
}
ok('Μαρ..Σεπ inclusive → 7', monthsRentedInYear('2025-03-15', '2025-09-20', 2025, 'rented').months === 7);
ok('lease after year → 0', monthsRentedInYear('2026-01-01', '2026-12-31', 2025, 'rented').months === 0);
ok('open lease starting before year → 12', monthsRentedInYear('2023-05-01', null, 2025, 'rented').months === 12);
{
  // κατεστραμμένη ημερομηνία αντιμετωπίζεται σαν να λείπει (όχι σιωπηλά 12 μήνες)
  const r = monthsRentedInYear('not-a-date', null, 2025, 'rented');
  ok('invalid date → estimated fallback', r.estimated === true && r.months === 12);
  ok('invalid date + vacant → 0 estimated', monthsRentedInYear('not-a-date', null, 2025, 'vacant').months === 0);
}

// ── είδος μίσθωσης (κωδικοί Ε2) ──────────────────────────────────────────────
ok('rented code = 1', e2LeaseKind('rented').code === '1');
ok('seasonal code = 60', e2LeaseKind('seasonal').code === '60');
ok('own_use code = 17', e2LeaseKind('own_use').code === '17');
ok('vacant code = 39', e2LeaseKind('vacant').code === '39');
ok('for_sale code = "" (χειροκίνητο)', e2LeaseKind('for_sale').code === '');
ok('null code = ""', e2LeaseKind(null).code === '');

// ── κατηγορία εισοδήματος ────────────────────────────────────────────────────
ok('apartment → Κατοικία', e2IncomeCategory('apartment', null) === 'Κατοικία');
ok('office → Επαγγελματική στέγη', e2IncomeCategory('office', null) === 'Επαγγελματική στέγη');
ok('land → Γη / Αγρός', e2IncomeCategory('land', null) === 'Γη / Αγρός');
ok('parking → Βοηθητικός χώρος', e2IncomeCategory('parking', null) === 'Βοηθητικός χώρος');
ok('seasonal overrides type', e2IncomeCategory('apartment', 'seasonal') === 'Βραχυχρόνια μίσθωση');
ok('unknown type → Ακίνητο', e2IncomeCategory('spaceship', null) === 'Ακίνητο');

// ── buildE2Row ───────────────────────────────────────────────────────────────
const P = (o: Partial<E2Property> = {}): E2Property => ({ id: 'p1', atak: '01234567890', address: 'Οδός 1', postal_code: '16232', ownership: 100, prop_type: 'apartment', status_detail: 'rented', target_rent: 800, ...o });
const T = (o: Partial<E2Tenant> = {}): E2Tenant => ({ property_id: 'p1', afm: null, monthly_rent: 800, lease_start: null, lease_end: null, lease_type: null, ...o });

{
  // πλήρες έτος, ενοίκιο 800, 100%, χωρίς πληρωμές → 9600 (εκτίμηση)
  const r = buildE2Row(P(), T(), [], '999999999', 2025);
  ok('gross full-year est = 9600', r.grossIncome === 9600);
  ok('leaseKind = "1 Εκμίσθωση"', r.leaseKind === '1 Εκμίσθωση');
  ok('months = 12', r.months === 12);
  ok('flag gross estimate', r.flags.includes('Ακαθάριστο εισόδημα: εκτίμηση (μηνιαίο × μήνες)'));
}
{
  // ίδιο αλλά 50% συνιδιοκτησία → 4800 + σχετικό flag
  const r = buildE2Row(P({ ownership: '50' }), T(), [], '999999999', 2025);
  ok('gross 50% = 4800', r.grossIncome === 4800);
  ok('flag co-ownership <100', r.flags.includes('Συνιδιοκτησία < 100%: πρόσθεσε ΑΦΜ λοιπών συνιδιοκτητών'));
}
{
  // πληρωμές υπερισχύουν του monthly_rent· η γραμμή 2024 αγνοείται
  const pays: E2Payment[] = [
    { property_id: 'p1', amount: 700, period_year: 2025, period_month: 1 },
    { property_id: 'p1', amount: 700, period_year: 2025, period_month: 2 },
    { property_id: 'p1', amount: 200, period_year: 2024, period_month: 12 },
  ];
  const r = buildE2Row(P(), T(), pays, '999999999', 2025);
  ok('gross from payments = 1400', r.grossIncome === 1400);
  ok('no gross-estimate flag when payments exist', !r.flags.some(f => f.startsWith('Ακαθάριστο εισόδημα: εκτίμηση')));
}
{
  // λείπει ΑΤΑΚ + λείπει ΑΦΜ ιδιοκτήτη
  const r = buildE2Row(P({ atak: null }), T(), [], '', 2025);
  ok('flag missing ΑΤΑΚ', r.flags.includes('Λείπει ΑΤΑΚ'));
  ok('flag missing ΑΦΜ', r.flags.includes('Λείπει ΑΦΜ ιδιοκτήτη'));
}
{
  // ownership null → 100% (grossIncome ίσο με grossFull)
  const r = buildE2Row(P({ ownership: null }), T(), [], '999999999', 2025);
  ok('ownership null defaults 100', r.ownershipPct === 100 && r.grossIncome === 9600);
}

// ── βραχυχρόνια: το ακαθάριστο βγαίνει από τις ΔΙΑΜΟΝΕΣ ─────────────────────
// ΤΑ ΝΟΥΜΕΡΑ ΣΤΟ ΧΕΡΙ. Δηλωτέο ακαθάριστο μιας διαμονής = τι πλήρωσε ο επισκέπτης
// − τέλος ανθεκτικότητας (δεν είναι έσοδο του ιδιοκτήτη). Η προμήθεια της
// πλατφόρμας ΔΕΝ αφαιρείται — είναι δαπάνη, όχι μείωση εσόδου.
//   Ιούλ 2025:  1000 − 32 =  968
//   Αύγ 2025:    700 − 20 =  680
//   Ιούλ 2024:  εκτός του έτους → δεν μετράει
//   σύνολο 2025 = 968 + 680 = 1648 · ποσοστό 100% → 1648
// ΠΡΙΝ ΤΗ ΔΙΟΡΘΩΣΗ: καμία διαμονή δεν διαβαζόταν· χωρίς μισθωτή και χωρίς
// εισπράξεις έβγαινε target_rent 800 × 12 μήνες = 9600, δηλαδή ένας στόχος
// δηλωμένος ως έσοδο.
const SEASONAL = P({ status_detail: 'seasonal', target_rent: 800 });
const STAYS: E2Stay[] = [
  { property_id: 'p1', check_in: '2025-07-01', check_out: '2025-07-08', nights: 7, gross_guest_paid: 1000, climate_levy: 32, platform_fee: 150 },
  { property_id: 'p1', check_in: '2025-08-10', check_out: '2025-08-15', nights: 5, gross_guest_paid: 700, climate_levy: 20, platform_fee: 100 },
  { property_id: 'p1', check_in: '2024-07-01', check_out: '2024-07-05', nights: 4, gross_guest_paid: 500, climate_levy: 10, platform_fee: 70 },
];
{
  const r = buildE2Row(SEASONAL, null, [], '999999999', 2025, STAYS);
  ok('βραχυχρόνια: ακαθάριστο από διαμονές = 1648', r.grossIncome === 1648);
  ok('βραχυχρόνια: ΔΕΝ είναι ο στόχος μισθώματος (9600)', r.grossIncome !== 9600);
  ok('βραχυχρόνια: με διαμονές δεν είναι εκτίμηση', !r.flags.some(f => f.startsWith('Ακαθάριστο')));
  ok('βραχυχρόνια: κωδικός 60', r.leaseKind === '60 Βραχυχρόνια μίσθωση');
}
{
  // ίδιες διαμονές, 50% συνιδιοκτησία → round(1648 × 50 / 100) = 824
  const r = buildE2Row(P({ status_detail: 'seasonal', target_rent: 800, ownership: 50 }), null, [], '999999999', 2025, STAYS);
  ok('βραχυχρόνια: μερίδιο 50% = 824', r.grossIncome === 824);
}
{
  // καμία διαμονή στο έτος → ο στόχος επιτρέπεται, αλλά ΡΗΤΑ σημασμένος
  const r = buildE2Row(SEASONAL, null, [], '999999999', 2025, []);
  ok('βραχυχρόνια χωρίς διαμονές: εκτίμηση 9600', r.grossIncome === 9600);
  ok('βραχυχρόνια χωρίς διαμονές: σημαίνεται ως εκτίμηση', r.flags.some(f => f.includes('εκτίμηση από τον στόχο μισθώματος')));
}
{
  // ιστορική γραμμή: ξέρουμε μόνο το `total` (ακαθάριστο ή payout;) → 500 με προειδοποίηση
  const legacy: E2Stay[] = [{ property_id: 'p1', check_in: '2025-09-01', check_out: '2025-09-04', nights: 3, total: 500 }];
  const r = buildE2Row(SEASONAL, null, [], '999999999', 2025, legacy);
  ok('βραχυχρόνια: ιστορικό ποσό δεν χάνεται (500)', r.grossIncome === 500);
  ok('βραχυχρόνια: σημαίνεται η απροσδιόριστη βάση', r.flags.some(f => f.includes('χωρίς ρητή βάση ποσού')));
}
{
  // μακροχρόνια: οι διαμονές ΔΕΝ αγγίζουν το ακαθάριστο (800 × 12 = 9600)
  const r = buildE2Row(P(), T(), [], '999999999', 2025, STAYS);
  ok('μακροχρόνια: αγνοεί τις διαμονές', r.grossIncome === 9600);
  ok('μακροχρόνια: κρατά το παλιό μήνυμα εκτίμησης', r.flags.includes('Ακαθάριστο εισόδημα: εκτίμηση (μηνιαίο × μήνες)'));
}

// ── e2RowToCells (μορφοποίηση) ───────────────────────────────────────────────
{
  const r = buildE2Row(P({ ownership: 33.33, address: 'Οδός 1', postal_code: '16232' }), T(), [], '999999999', 2025);
  const cells = e2RowToCells(r, 1);
  ok('cell index = 1', cells[0] === 1);
  ok('ownership 33,33', cells[4] === '33,33');
  ok('address joined', cells[2] === 'Οδός 1, 16232');
  ok('gross is string integer', cells[8] === String(Math.round(r.grossIncome)));
}

// ── Σύνοψη Ε1 (κωδικοί) ──────────────────────────────────────────────────────
{
  const rows: E2Row[] = [
    buildE2Row(P({ id: 'a', prop_type: 'apartment' }), T({ property_id: 'a' }), [{ property_id: 'a', amount: 6000, period_year: 2025, period_month: 1 }], '999', 2025),
    buildE2Row(P({ id: 'b', prop_type: 'apartment' }), T({ property_id: 'b' }), [{ property_id: 'b', amount: 4000, period_year: 2025, period_month: 1 }], '999', 2025),
    buildE2Row(P({ id: 'c', prop_type: 'office' }), T({ property_id: 'c' }), [{ property_id: 'c', amount: 5000, period_year: 2025, period_month: 1 }], '999', 2025),
  ];
  const e1 = buildE1Summary(rows);
  ok('Ε1: κατοικίες αθροίζονται σε έναν κωδικό (103)', e1.lines.some(l => l.code === '103' && l.amount === 10000));
  ok('Ε1: επαγγελματική στέγη ξεχωριστός κωδικός (105)', e1.lines.some(l => l.code === '105' && l.amount === 5000));
  ok('Ε1: σύνολο ακαθάριστου = 15000', e1.totalGross === 15000);
  ok('Ε1: ταξινόμηση φθίνουσα', e1.lines[0].amount >= e1.lines[e1.lines.length - 1].amount);
  ok('Ε1: σημείωση για ενδεικτικούς κωδικούς', /ενδεικτικοί/.test(e1.note));
  const cells = e1LineToCells(e1.lines[0]);
  ok('Ε1: κελιά [κωδικός, περιγραφή, κατηγορία, ποσό]', cells.length === 4 && cells[0] === e1.lines[0].code);
  // μηδενικά εισοδήματα δεν μπαίνουν
  const empty = buildE1Summary([buildE2Row(P({ id: 'z', status_detail: 'vacant', target_rent: 0 }), T({ property_id: 'z', monthly_rent: 0 }), [], '999', 2025)]);
  ok('Ε1: κενά ακίνητα εξαιρούνται', empty.lines.length === 0 && empty.totalGross === 0);
}

// ── ΑΝΑΜΕΙΞΗ ΑΚΙΝΗΤΩΝ: το φυσικό λάθος του καλούντος δεν πρέπει να περνά ─────
// Το ερώτημα φέρνει τις διαμονές ΟΛΟΥ του χαρτοφυλακίου μαζί. Αν κάποιος τις
// περάσει ενιαία, κάθε ακίνητο θα δήλωνε τα έσοδα όλων — σε φορολογικό έντυπο.
{
  const foreign: E2Stay[] = [
    ...STAYS,
    { property_id: 'ΑΛΛΟ-ΑΚΙΝΗΤΟ', check_in: '2025-07-20', check_out: '2025-07-27', nights: 7, gross_guest_paid: 5000, climate_levy: 56, platform_fee: 700 },
  ];
  const r = buildE2Row(SEASONAL, null, [], '999999999', 2025, foreign);
  ok('διαμονές άλλου ακινήτου ΔΕΝ προσμετρώνται', r.grossIncome === 1648);
  ok('…δηλαδή δεν φουσκώνει σε 6592', r.grossIncome !== 6592);
}
{
  // Ιστορική γραμμή χωρίς property_id θεωρείται του ακινήτου: ο καλών περνά ήδη
  // φιλτραρισμένο σύνολο, και δεν θέλουμε να χαθεί έσοδο επειδή λείπει η στήλη.
  const legacy: E2Stay[] = [
    { check_in: '2025-07-01', check_out: '2025-07-08', nights: 7, gross_guest_paid: 1000, climate_levy: 32, platform_fee: 150 },
  ];
  const r = buildE2Row(SEASONAL, null, [], '999999999', 2025, legacy);
  ok('διαμονή χωρίς property_id μετράει (ιστορική γραμμή)', r.grossIncome === 968);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ne2.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
