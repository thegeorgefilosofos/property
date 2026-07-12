// Αυστηρά τεστ για την Αναλυτική Κατάσταση Ε2 (e2.ts).
// Τρέξε: npx tsx lib/billing/e2.test.ts
import {
  monthsRentedInYear, e2LeaseKind, e2IncomeCategory,
  buildE2Row, e2RowToCells, buildE1Summary, e1LineToCells, type E2Property, type E2Tenant, type E2Payment, type E2Row,
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
ok('own_use code = 4', e2LeaseKind('own_use').code === '4');
ok('vacant code = 5', e2LeaseKind('vacant').code === '5');
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
  ok('Ε1: επαγγελματική στέγη ξεχωριστός κωδικός (107)', e1.lines.some(l => l.code === '107' && l.amount === 5000));
  ok('Ε1: σύνολο ακαθάριστου = 15000', e1.totalGross === 15000);
  ok('Ε1: ταξινόμηση φθίνουσα', e1.lines[0].amount >= e1.lines[e1.lines.length - 1].amount);
  ok('Ε1: σημείωση για ενδεικτικούς κωδικούς', /ενδεικτικοί/.test(e1.note));
  const cells = e1LineToCells(e1.lines[0]);
  ok('Ε1: κελιά [κωδικός, περιγραφή, κατηγορία, ποσό]', cells.length === 4 && cells[0] === e1.lines[0].code);
  // μηδενικά εισοδήματα δεν μπαίνουν
  const empty = buildE1Summary([buildE2Row(P({ id: 'z', status_detail: 'vacant', target_rent: 0 }), T({ property_id: 'z', monthly_rent: 0 }), [], '999', 2025)]);
  ok('Ε1: κενά ακίνητα εξαιρούνται', empty.lines.length === 0 && empty.totalGross === 0);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ne2.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
