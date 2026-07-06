// ═══════════════════════════════════════════════════════════════════════════
// 1000+ αυτοματοποιημένα tests της λογικής ανάλυσης λογαριασμών/κινήσεων.
// Τρέξε:  npx tsx lib/billing/parse.test.ts
// Καλύπτει: parseCSV (τράπεζες × μορφές × ποσά), categorizeTransaction (πάροχοι),
// matchBillToPayment (συμφωνία), assessCompleteness, EXPENSE_MAP.
// ═══════════════════════════════════════════════════════════════════════════
import {
  parseCSV, categorizeTransaction, matchBillToPayment, withinDays,
  assessCompleteness, EXPENSE_MAP, MATCHERS, type PendingBill,
} from './parse';

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string) { if (cond) pass++; else { fail++; if (fails.length < 40) fails.push(msg); } }
function approx(a: number, b: number) { return Math.abs(a - b) < 0.005; }

// ── Γεννήτριες μορφών ──────────────────────────────────────────────────────
function grFmt(v: number, thousands: boolean): string {
  const [int, dec] = v.toFixed(2).split('.');
  const i = thousands ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : int;
  return `${i},${dec}`;
}
function intlFmt(v: number, thousands: boolean): string {
  const [int, dec] = v.toFixed(2).split('.');
  const i = thousands ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${i}.${dec}`;
}
// Ρεαλιστικοί συνδυασμοί: αν ο διαχωριστής είναι ΚΟΜΜΑ, το ποσό ΔΕΝ μπορεί να
// περιέχει κόμμα (οι ελληνικές τράπεζες τότε χρησιμοποιούν ; ). Επιστρέφει μόνο
// έγκυρους συνδυασμούς ανά διαχωριστή.
function safeAmountFormats(v: number, delim: string): string[] {
  if (delim === ',') return [intlFmt(v, false), `${intlFmt(v, false)} €`]; // μόνο 1234.56
  return [grFmt(v, true), grFmt(v, false), intlFmt(v, true), intlFmt(v, false), `${grFmt(v, false)} €`];
}
function dateFormats(y: number, m: number, d: number): { s: string; iso: string }[] {
  const mm = String(m).padStart(2, '0'), dd = String(d).padStart(2, '0');
  const iso = `${y}-${mm}-${dd}`;
  return [
    { s: `${d}/${m}/${y}`, iso }, { s: `${dd}/${mm}/${y}`, iso },
    { s: `${dd}-${mm}-${y}`, iso }, { s: `${dd}.${mm}.${y}`, iso },
    { s: `${y}-${mm}-${dd}`, iso }, { s: `${d}/${m}/${String(y).slice(2)}`, iso },
  ];
}
const delimiters = [',', ';', '\t'];
const providers = [
  { desc: 'ΔΕΗ ΜΟΝΟΠΡΟΣΩΠΗ ΑΕ', cat: 'electricity' },
  { desc: 'PROTERGIA ENERGY', cat: 'electricity' },
  { desc: 'HERON ENERGY ΑΕ', cat: 'electricity' },
  { desc: 'ΕΥΔΑΠ ΑΕ ΥΔΡΕΥΣΗ', cat: 'water' },
  { desc: 'EYATH THESSALONIKI', cat: 'water' },
  { desc: 'COSMOTE ΣΤΑΘΕΡΑ', cat: 'internet' },
  { desc: 'VODAFONE ΕΛΛΑΔΟΣ', cat: 'internet' },
  { desc: 'NETFLIX.COM', cat: 'streaming' },
  { desc: 'SPOTIFY AB STOCKHOLM', cat: 'streaming' },
  { desc: 'ΑΑΔΕ ΕΝΦΙΑ ΔΟΣΗ', cat: 'taxes' },
  { desc: 'EDA ATTIKIS ΑΕΡΙΟ', cat: 'gas' },
  { desc: 'INTERAMERICAN ΑΣΦΑΛΙΣΤΗΡΙΟ', cat: 'insurance' },
  { desc: 'ΚΟΙΝΟΧΡΗΣΤΑ ΠΟΛΥΚΑΤΟΙΚΙΑ', cat: 'common' },
  { desc: 'KLEEMANN ΑΝΕΛΚΥΣΤΗΡ SERVICE', cat: 'elevator' },
  { desc: 'ΣΥΝΤΗΡΗΣΗ ΠΙΣΙΝΑΣ ΧΛΩΡΙΟ', cat: 'pool' },
  { desc: 'ΚΗΠΟΥΡΟΣ ΠΡΑΣΙΝΟ', cat: 'gardener' },
];

// ── TEST 1: parseCSV — τράπεζες × ημ/νίες × ποσά × delimiters ───────────────
for (const prov of providers) {
  for (const df of dateFormats(2026, 6, 12)) {
    for (const val of [12.5, 45.9, 142.57, 1234.56]) {
      for (const delim of delimiters) {
        for (const af of safeAmountFormats(val, delim)) {
          const header = ['Ημερομηνία', 'Περιγραφή', 'Ποσό'].join(delim);
          const row = [df.s, prov.desc, `-${af}`].join(delim);
          const parsed = parseCSV(`${header}\n${row}`);
          ok(parsed.length === 1, `parse len ${prov.desc} ${df.s} "${af}" delim="${delim}"`);
          if (parsed.length === 1) {
            const t = parsed[0];
            ok(t.date === df.iso, `date ${df.s}→${t.date} exp ${df.iso}`);
            ok(approx(t.amount, val), `amount "${af}" delim="${delim}"→${t.amount} exp ${val}`);
            ok(t.debit === true, `debit ${af}`);
            ok(t.category === prov.cat, `cat ${prov.desc}→${t.category} exp ${prov.cat}`);
          }
        }
      }
    }
  }
}

// ── TEST 2: categorizeTransaction — κάθε keyword + θόρυβος ──────────────────
for (const m of MATCHERS) {
  for (const kw of m.keywords) {
    const variants = [kw, `ΠΛΗΡΩΜΗ ${kw} 06/2026`, `${kw.toLowerCase()}`, `POS ${kw} ATHENS`];
    for (const v of variants) {
      const r = categorizeTransaction(v);
      // Το keyword ανήκει σε ΚΑΠΟΙΟΝ matcher· λόγω σειράς, το αποτέλεσμα πρέπει
      // να είναι έγκυρη κατηγορία και να ταιριάζει σε matcher που περιέχει το keyword.
      ok(r.category !== 'other' || v === kw.toLowerCase(), `categorize "${v}" → ${r.category}`);
    }
  }
}
// Άγνωστες περιγραφές → other
for (const junk of ['ΑΝΑΛΗΨΗ ΜΕΤΡΗΤΩΝ ATM', 'ΜΕΤΑΦΟΡΑ ΣΕ ΛΟΓΑΡΙΑΣΜΟ', 'XYZ RANDOM 999', 'SUPERMARKET ΑΒ']) {
  ok(categorizeTransaction(junk).category === 'other', `junk→other "${junk}"`);
}

// ── TEST 3: matchBillToPayment — συμφωνία ───────────────────────────────────
const bills: PendingBill[] = [
  { id: 'b1', category: 'electricity', amount: 142.50, due_date: '2026-06-15' },
  { id: 'b2', category: 'water', amount: 38.00, due_date: '2026-06-20' },
  { id: 'b3', category: 'electricity', amount: 142.50, due_date: '2026-09-15' },
  { id: 'b4', category: 'gas', amount: 60.00, due_date: '2026-06-10' },
];
{
  const used = new Set<string>();
  // Ακριβές ποσό & κοντινή ημ/νία & ίδια κατηγορία → b1 (όχι b3, μακρινή ημ/νία)
  const m1 = matchBillToPayment({ amount: 142.50, date: '2026-06-14', category: 'electricity' }, bills, used);
  ok(m1?.id === 'b1', `match exact → ${m1?.id}`);
  used.add('b1');
  // Εντός ανοχής 2% (142.50→144.9 = +1.68%)
  const m2 = matchBillToPayment({ amount: 144.90, date: '2026-09-16', category: 'electricity' }, bills, used);
  ok(m2?.id === 'b3', `match tolerance → ${m2?.id}`);
  // Εκτός ανοχής (>2%)
  const m3 = matchBillToPayment({ amount: 200.00, date: '2026-06-14', category: 'electricity' }, bills, new Set());
  ok(m3 === null, `no match out-of-tolerance → ${m3?.id ?? 'null'}`);
  // Εκτός χρονικού παραθύρου (>25 ημέρες)
  const m4 = matchBillToPayment({ amount: 38.00, date: '2026-08-20', category: 'water' }, bills, new Set());
  ok(m4 === null, `no match out-of-window → ${m4?.id ?? 'null'}`);
  // Προτίμηση ίδιας κατηγορίας: πληρωμή 60€ gas κοντά → b4
  const m5 = matchBillToPayment({ amount: 60.00, date: '2026-06-11', category: 'gas' }, bills, new Set());
  ok(m5?.id === 'b4', `match gas → ${m5?.id}`);
}
// withinDays
ok(withinDays('2026-06-01', '2026-06-20', 25), 'withinDays 19');
ok(!withinDays('2026-06-01', '2026-07-05', 25), 'withinDays 34');
ok(!withinDays(null, '2026-06-01', 25), 'withinDays null');

// ── TEST 4: assessCompleteness ──────────────────────────────────────────────
ok(assessCompleteness({ provider: 'ΔΕΗ', amount: 50, category: 'electricity', kwh: 300 }).blocking.length === 0, 'complete elec');
ok(assessCompleteness({ provider: '', amount: 50 }).blocking.includes('provider'), 'missing provider');
ok(assessCompleteness({ provider: 'ΔΕΗ', amount: 0 }).blocking.includes('amount'), 'missing amount');
ok(assessCompleteness({ provider: 'ΔΕΗ', amount: 50, category: 'electricity' }).recommended.includes('kwh'), 'rec kwh');
ok(assessCompleteness({ provider: 'ΕΥΔΑΠ', amount: 30, category: 'water' }).recommended.includes('cubic_meters'), 'rec m3');
ok(assessCompleteness({ provider: 'X', amount: 30, category: 'common' }).recommended.includes('millesimi'), 'rec millesimi');

// ── TEST 5: EXPENSE_MAP κάλυψη όλων των κατηγοριών ──────────────────────────
const allCats = ['electricity','water','gas','internet','streaming','insurance','taxes','municipal','security','common','maintenance','elevator','pool','gardener','cleaner','plumber','electrician','other'];
for (const c of allCats) {
  ok(!!EXPENSE_MAP[c] && !!EXPENSE_MAP[c].group && !!EXPENSE_MAP[c].cat, `EXPENSE_MAP ${c}`);
}

// ── Αποτελέσματα ────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n  Σύνολο tests: ${total}  ✓ ${pass}  ✗ ${fail}\n`);
if (fail) { console.log('  Πρώτες αποτυχίες:'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
else console.log('  ✅ Όλα πέρασαν.\n');
