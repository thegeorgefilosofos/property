// ═══════════════════════════════════════════════════════════════════════════
// 100+ σενάρια πραγματικού κόσμου (end-to-end λογική): parse → categorize →
// reconcile → sort → completeness. Τρέξε: npx tsx lib/billing/scenarios.test.ts
// ═══════════════════════════════════════════════════════════════════════════
import {
  parseCSV, categorizeTransaction, matchBillToPayment, sortBills, assessCompleteness,
  type PendingBill, type ParsedTransaction, type BillSort,
} from './parse';

let n = 0, pass = 0, fail = 0; const fails: string[] = [];
function T(name: string, cond: boolean) { n++; if (cond) pass++; else { fail++; fails.push(name); } }
const approx = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Προσομοίωση της συμφωνίας όπως στο component (σειριακά, με used set)
function reconcile(txs: ParsedTransaction[], bills: PendingBill[]) {
  const used = new Set<string>(); const reconciled: string[] = []; const unmatched: ParsedTransaction[] = [];
  for (const t of txs.filter(t => t.debit)) {
    const m = matchBillToPayment(t, bills, used);
    if (m) { used.add(m.id); reconciled.push(m.id); } else unmatched.push(t);
  }
  return { reconciled, unmatched };
}

// ── A. PARSING (πραγματικές μορφές τραπεζών) ────────────────────────────────
const A: [string, string, Partial<ParsedTransaction>][] = [
  ['Alpha απλό', 'Ημερομηνία;Περιγραφή;Ποσό\n12/06/2026;ΔΕΗ ΜΟΝΟΠΡΟΣΩΠΗ;-142,57', { date: '2026-06-12', amount: 142.57, debit: true, category: 'electricity' }],
  ['Eurobank Excel-csv', 'Date,Description,Amount\n2026-06-05,PROTERGIA ENERGY,-88.40', { date: '2026-06-05', amount: 88.40, category: 'electricity' }],
  ['Πειραιώς χρεωση/πιστωση', 'Ημ/νία;Αιτιολογία;Χρέωση;Πίστωση;Υπόλοιπο\n03/06/2026;ΕΥΔΑΠ ΥΔΡΕΥΣΗ;38,00;;1.250,00', { amount: 38, debit: true, category: 'water' }],
  ['NBG με κωδικό', 'Ημερομηνία;Κωδικός;Περιγραφή;Ποσό;Υπόλοιπο\n01/06/2026;20260601;COSMOTE ΣΤΑΘΕΡΑ;-29,90;800,00', { amount: 29.90, category: 'internet' }],
  ['Revolut', 'Type,Product,Started Date,Completed Date,Description,Amount,Balance\nCARD,Current,10/06/2026,10/06/2026,NETFLIX.COM,-15.99,120.00', { amount: 15.99, category: 'streaming' }],
  ['Wise dot-decimal', 'Date,Amount,Description\n2026-06-08,-45.00,EDA ATTIKIS ΑΕΡΙΟ', { amount: 45, category: 'gas' }],
  ['tab-delimited', 'Ημερομηνία\tΠεριγραφή\tΠοσό\n12/06/2026\tΑΑΔΕ ΕΝΦΙΑ\t-200,00', { amount: 200, category: 'taxes' }],
  ['πίστωση=ενοίκιο', 'Ημ/νία;Αιτιολογία;Χρέωση;Πίστωση;Υπόλοιπο\n01/06/2026;ΜΙΣΘΩΜΑ ΕΝΟΙΚΙΟ;;800,00;2.050,00', { amount: 800, debit: false, category: 'rent_income' }],
  ['χιλιάδες GR', 'Ημερομηνία;Περιγραφή;Ποσό\n15/06/2026;ΑΣΦΑΛΙΣΤΗΡΙΟ INTERAMERICAN;-1.234,56', { amount: 1234.56, category: 'insurance' }],
  ['2ψήφιο έτος', 'Ημερομηνία;Περιγραφή;Ποσό\n15/6/26;ΚΗΠΟΥΡΟΣ;-50,00', { date: '2026-06-15', amount: 50, category: 'gardener' }],
];
for (const [name, csv, exp] of A) {
  const r = parseCSV(csv);
  T(`parse: ${name} (1 γραμμή)`, r.length === 1);
  if (r.length === 1) {
    const t = r[0];
    if (exp.date) T(`parse: ${name} ημ/νία`, t.date === exp.date);
    if (exp.amount != null) T(`parse: ${name} ποσό`, approx(t.amount, exp.amount));
    if (exp.debit != null) T(`parse: ${name} debit`, t.debit === exp.debit);
    if (exp.category) T(`parse: ${name} κατηγορία`, t.category === exp.category);
  }
}

// ── B. CATEGORIZATION (πραγματικά ονόματα) ──────────────────────────────────
const B: [string, string][] = [
  ['ΔΕΗ ΑΕ', 'electricity'], ['HERON ENERGY', 'electricity'], ['PROTERGIA', 'electricity'],
  ['VOLTERRA ΕΝΕΡΓΕΙΑ', 'electricity'], ['ELPEDISON', 'electricity'], ['NRG BILLING', 'electricity'],
  ['ΕΥΔΑΠ', 'water'], ['ΕΥΑΘ THESSALONIKI', 'water'], ['ΔΕΥΑ ΛΑΡΙΣΑΣ', 'water'],
  ['EDA ATTIKIS', 'gas'], ['DEPA ΑΕΡΙΟ', 'gas'], ['ZENITH GAS', 'gas'],
  ['COSMOTE', 'internet'], ['VODAFONE ΕΛΛΑΔΟΣ', 'internet'], ['NOVA SA', 'internet'], ['WIND HELLAS', 'internet'],
  ['NETFLIX', 'streaming'], ['SPOTIFY AB', 'streaming'], ['GOOGLE ONE', 'streaming'], ['MICROSOFT 365', 'streaming'],
  ['ΑΑΔΕ ΕΝΦΙΑ', 'taxes'], ['ΕΦΚΑ ΕΙΣΦΟΡΕΣ', 'taxes'],
  ['ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ ΤΕΛΗ', 'municipal'],
  ['INTERAMERICAN', 'insurance'], ['EUROLIFE FFH', 'insurance'], ['ALLIANZ HELLAS', 'insurance'],
  ['KLEEMANN ΑΝΕΛΚΥΣΤΗΡ', 'elevator'], ['OTIS SERVICE', 'elevator'],
  ['ΣΥΝΤΗΡΗΣΗ ΠΙΣΙΝΑΣ', 'pool'], ['ΚΗΠΟΥΡΟΣ', 'gardener'], ['ΣΥΝΕΡΓΕΙΟ ΚΑΘΑΡΙΣΜΟΥ', 'cleaner'],
  ['ΥΔΡΑΥΛΙΚΟΣ ΑΠΟΦΡΑΞΗ', 'plumber'], ['ΗΛΕΚΤΡΟΛΟΓΟΣ', 'electrician'],
  ['ΚΟΙΝΟΧΡΗΣΤΑ ΠΟΛΥΚΑΤΟΙΚΙΑ', 'common'], ['MYBILLYS', 'common'],
  ['ΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ', 'other'], ['SUPERMARKET ΑΒ ΒΑΣΙΛΟΠΟΥΛΟΣ', 'other'], ['ΜΕΤΑΦΟΡΑ IBAN', 'other'],
];
for (const [desc, cat] of B) T(`categorize: "${desc}" → ${cat}`, categorizeTransaction(desc).category === cat);

// ── C. RECONCILIATION (σενάρια συμφωνίας) ───────────────────────────────────
const mk = (id: string, category: string, amount: number, due: string): PendingBill => ({ id, category, amount, due_date: due });
const tx = (desc: string, amount: number, date: string): ParsedTransaction => ({ ...categorizeTransaction(desc), id: desc + amount, date, description: desc, amount, debit: true, selected: true } as ParsedTransaction);
{
  const bills = [mk('e', 'electricity', 142.5, '2026-06-15'), mk('w', 'water', 38, '2026-06-20'), mk('g', 'gas', 60, '2026-06-10')];
  const { reconciled, unmatched } = reconcile([tx('ΔΕΗ', 142.5, '2026-06-16'), tx('ΕΥΔΑΠ', 38, '2026-06-22'), tx('SUPERMARKET', 25, '2026-06-05')], bills);
  T('reconcile: ΔΕΗ+ΕΥΔΑΠ ματσάρουν', reconciled.includes('e') && reconciled.includes('w'));
  T('reconcile: gas μένει εκκρεμές', !reconciled.includes('g'));
  T('reconcile: supermarket αταίριαστο', unmatched.length === 1);
}
{
  // Cross-category: πληρωμή ΔΕΗ ΔΕΝ εξοφλεί νερό ίδιου ποσού
  const bills = [mk('w', 'water', 100, '2026-06-15')];
  const { reconciled } = reconcile([tx('ΔΕΗ', 100, '2026-06-16')], bills);
  T('reconcile: no cross-category (ΔΕΗ vs water)', reconciled.length === 0);
}
{
  // Twins: δύο ίδιοι λογαριασμοί, δύο πληρωμές διαφορετικών ημερομηνιών
  const bills = [mk('a', 'electricity', 90, '2026-06-15'), mk('b', 'electricity', 90, '2026-09-15')];
  const { reconciled } = reconcile([tx('ΔΕΗ', 90, '2026-06-16'), tx('ΔΕΗ', 90, '2026-09-14')], bills);
  T('reconcile: twins → 2 διαφορετικοί', reconciled.length === 2 && new Set(reconciled).size === 2);
}
{
  // Tolerance: 1% ok, 2% no
  const bills = [mk('x', 'water', 100, '2026-06-10')];
  T('reconcile: +1% ok', reconcile([tx('ΕΥΔΑΠ', 101, '2026-06-11')], bills).reconciled.length === 1);
  T('reconcile: +2% no', reconcile([tx('ΕΥΔΑΠ', 102, '2026-06-11')], bills).reconciled.length === 0);
}
{
  // Min €0.20
  const bills = [mk('s', 'other', 10, '2026-06-10')];
  T('reconcile: +0.20€ ok', reconcile([tx('ΑΓΝΩΣΤΟ', 10.2, '2026-06-11')], bills).reconciled.length === 1);
  T('reconcile: +0.30€ no', reconcile([tx('ΑΓΝΩΣΤΟ', 10.3, '2026-06-11')], bills).reconciled.length === 0);
}
{
  // Date window: 25 ημέρες ok, 40 όχι
  const bills = [mk('d', 'gas', 60, '2026-06-01')];
  T('reconcile: 24 ημέρες ok', reconcile([tx('EDA ATTIKIS', 60, '2026-06-24')], bills).reconciled.length === 1);
  T('reconcile: 40 ημέρες no', reconcile([tx('EDA ATTIKIS', 60, '2026-07-11')], bills).reconciled.length === 0);
}
{
  // Credit (ενοίκιο) δεν μπαίνει στη συμφωνία εξόδων (debit φίλτρο)
  const bills = [mk('r', 'rent_income', 800, '2026-06-01')];
  const rentTx: ParsedTransaction = { ...tx('ΕΝΟΙΚΙΟ', 800, '2026-06-02'), debit: false };
  T('reconcile: credit αγνοείται', reconcile([rentTx], bills).reconciled.length === 0);
}

// ── D. SORTING (αρχειοθέτηση) ────────────────────────────────────────────────
const sortSet = [
  { name: 'ΔΕΗ', amount: 142.5, due_date: '2026-06-15', created_at: '2026-06-20' },
  { name: 'ΕΥΔΑΠ', amount: 38.0, due_date: '2026-06-10', created_at: '2026-06-25' },
  { name: 'COSMOTE', amount: 29.9, due_date: '2026-06-20', created_at: '2026-06-18' },
  { name: 'Ασφάλεια', amount: 1234.56, due_date: '2026-05-30', created_at: '2026-06-22' },
];
const first = (k: BillSort) => sortBills(sortSet, k)[0].name;
const last = (k: BillSort) => sortBills(sortSet, k)[sortSet.length - 1].name;
T('sort: αξία φθίνουσα → Ασφάλεια πρώτη', first('amount_desc') === 'Ασφάλεια');
T('sort: αξία αύξουσα → COSMOTE πρώτη', first('amount_asc') === 'COSMOTE');
T('sort: αξία αύξουσα → Ασφάλεια τελευταία', last('amount_asc') === 'Ασφάλεια');
T('sort: ημ. λήψης νεότερα → ΕΥΔΑΠ πρώτη', first('received_desc') === 'ΕΥΔΑΠ');
T('sort: ημ. λήψης παλαιότερα → COSMOTE πρώτη', first('received_asc') === 'COSMOTE');
T('sort: ημ. έκδοσης νεότερα → COSMOTE πρώτη', first('issue_desc') === 'COSMOTE');
T('sort: ημ. έκδοσης παλαιότερα → Ασφάλεια πρώτη', first('issue_asc') === 'Ασφάλεια');
T('sort: πάροχος Α-Ω → Ασφάλεια πρώτη', first('provider') === 'Ασφάλεια');
T('sort: δεν αλλοιώνει πλήθος', sortBills(sortSet, 'amount_desc').length === 4);
T('sort: δεν μεταλλάσσει το αρχικό', (sortBills(sortSet, 'amount_asc'), sortSet[0].name === 'ΔΕΗ'));
T('sort: κενή λίστα', sortBills([], 'amount_desc').length === 0);

// ── E. COMPLETENESS (πληρότητα εξαγωγής) ────────────────────────────────────
T('complete: πλήρες ρεύμα', assessCompleteness({ provider: 'ΔΕΗ', amount: 50, category: 'electricity', kwh: 300 }).blocking.length === 0);
T('complete: χωρίς πάροχο → blocking', assessCompleteness({ amount: 50, provider: '' }).blocking.includes('provider'));
T('complete: χωρίς ποσό → blocking', assessCompleteness({ provider: 'ΔΕΗ', amount: 0 }).blocking.includes('amount'));
T('complete: αρνητικό ποσό → blocking', assessCompleteness({ provider: 'ΔΕΗ', amount: -5 }).blocking.includes('amount'));
T('complete: ρεύμα χωρίς kwh → recommended', assessCompleteness({ provider: 'ΔΕΗ', amount: 50, category: 'electricity' }).recommended.includes('kwh'));
T('complete: νερό χωρίς m³ → recommended', assessCompleteness({ provider: 'ΕΥΔΑΠ', amount: 30, category: 'water' }).recommended.includes('cubic_meters'));
T('complete: αέριο χωρίς m³ → recommended', assessCompleteness({ provider: 'EDA', amount: 40, category: 'gas' }).recommended.includes('cubic_meters'));
T('complete: κοινόχρηστα χωρίς χιλιοστά → recommended', assessCompleteness({ provider: 'Χ', amount: 30, category: 'common' }).recommended.includes('millesimi'));
T('complete: χωρίς ημ. λήξης → recommended', assessCompleteness({ provider: 'ΔΕΗ', amount: 50, category: 'electricity', kwh: 1 }).recommended.includes('due_date'));

// ── Αποτελέσματα ────────────────────────────────────────────────────────────
console.log(`\n  Σενάρια: ${n}  ✓ ${pass}  ✗ ${fail}\n`);
if (fail) { console.log('  Αποτυχίες:'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
else console.log('  ✅ Όλα τα σενάρια πέρασαν.\n');
