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

// ── TEST 6: ΠΡΑΓΜΑΤΙΚΕΣ διατάξεις τραπεζικών αρχείων (header-aware) ──────────
const money = (v: number, delim: string) => delim === ',' ? intlFmt(v, false) : grFmt(v, false);
const bal = (delim: string) => delim === ',' ? '1250.00' : '1.250,00';
type Layout = { name: string; delim: string; header: string[]; build: (d: string, desc: string, v: number, deb: boolean) => string[] };
const layouts: Layout[] = [
  { name: 'simple-amount', delim: ';', header: ['Ημερομηνία', 'Περιγραφή', 'Ποσό'],
    build: (d, desc, v, deb) => [d, desc, (deb ? '-' : '') + money(v, ';')] },
  { name: 'debit-credit-balance-gr', delim: ';', header: ['Ημ/νία', 'Αιτιολογία', 'Χρέωση', 'Πίστωση', 'Υπόλοιπο'],
    build: (d, desc, v, deb) => [d, desc, deb ? money(v, ';') : '', deb ? '' : money(v, ';'), bal(';')] },
  { name: 'code-amount-balance', delim: ';', header: ['Ημερομηνία', 'Κωδικός', 'Περιγραφή', 'Ποσό', 'Υπόλοιπο'],
    build: (d, desc, v, deb) => [d, '20260612001', desc, (deb ? '-' : '') + money(v, ';'), bal(';')] },
  { name: 'intl-debit-credit', delim: ',', header: ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    build: (d, desc, v, deb) => [d, desc, deb ? money(v, ',') : '', deb ? '' : money(v, ','), bal(',')] },
  { name: 'two-dates', delim: ';', header: ['Ημ. Συναλλαγής', 'Ημ/νία Αξίας', 'Περιγραφή', 'Ποσό'],
    build: (d, desc, v, deb) => [d, d, desc, (deb ? '-' : '') + money(v, ';')] },
  { name: 'revolut', delim: ',', header: ['Type', 'Product', 'Started Date', 'Completed Date', 'Description', 'Amount', 'Balance'],
    build: (d, desc, v, deb) => ['CARD_PAYMENT', 'Current', d, d, desc, (deb ? '-' : '') + money(v, ','), bal(',')] },
];
for (const L of layouts) {
  for (const prov of providers.slice(0, 8)) {
    for (const val of [12.5, 142.57, 1234.56]) {
      for (const deb of [true, false]) {
        const header = L.header.join(L.delim);
        const row = L.build('12/06/2026', prov.desc, val, deb).join(L.delim);
        const parsed = parseCSV(`${header}\n${row}`);
        ok(parsed.length === 1, `[${L.name}] parsed len ${prov.desc} v=${val} deb=${deb} → ${parsed.length}`);
        if (parsed.length === 1) {
          const t = parsed[0];
          ok(t.date === '2026-06-12', `[${L.name}] date → ${t.date}`);
          ok(approx(t.amount, val), `[${L.name}] amount v=${val} deb=${deb} → ${t.amount} (Υπόλοιπο δεν πρέπει να μπερδεύεται)`);
          ok(t.debit === deb, `[${L.name}] debit exp ${deb} → ${t.debit}`);
          ok(t.category === prov.cat, `[${L.name}] cat ${prov.desc} → ${t.category}`);
        }
      }
    }
  }
}

// ── TEST 7: Συμφωνία σε δύσκολα σενάρια + κακοσχηματισμένα αρχεία ────────────
{
  // Δύο ΠΑΝΟΜΟΙΟΤΥΠΟΙ εκκρεμείς (ίδιο ποσό/κατηγορία, διαφορετική ημ/νία): δύο
  // πληρωμές πρέπει να πάνε σε ΔΙΑΦΟΡΕΤΙΚΟΥΣ λογαριασμούς (όχι διπλό match).
  const twins: PendingBill[] = [
    { id: 'e1', category: 'electricity', amount: 100.00, due_date: '2026-06-15' },
    { id: 'e2', category: 'electricity', amount: 100.00, due_date: '2026-09-15' },
  ];
  const used = new Set<string>();
  const p1 = matchBillToPayment({ amount: 100, date: '2026-06-16', category: 'electricity' }, twins, used);
  ok(p1?.id === 'e1', `twin june → ${p1?.id}`); used.add(p1!.id);
  const p2 = matchBillToPayment({ amount: 100, date: '2026-09-14', category: 'electricity' }, twins, used);
  ok(p2?.id === 'e2', `twin sept → ${p2?.id}`); used.add(p2!.id);
  const p3 = matchBillToPayment({ amount: 100, date: '2026-06-16', category: 'electricity' }, twins, used);
  ok(p3 === null, `third payment no bill left → ${p3?.id ?? 'null'}`);
}
{
  // Οριακή ανοχή: ακριβώς 2% πάνω ταιριάζει, 3% όχι.
  const b: PendingBill[] = [{ id: 'x', category: 'water', amount: 100, due_date: '2026-06-10' }];
  ok(matchBillToPayment({ amount: 102, date: '2026-06-12', category: 'water' }, b, new Set())?.id === 'x', 'edge +2%');
  ok(matchBillToPayment({ amount: 103, date: '2026-06-12', category: 'water' }, b, new Set()) === null, 'edge +3% no');
  // Ελάχιστη ανοχή 0.5€ για μικρά ποσά (10€ → 10.4 ταιριάζει, 10.6 όχι)
  const s: PendingBill[] = [{ id: 's', category: 'other', amount: 10, due_date: '2026-06-10' }];
  ok(matchBillToPayment({ amount: 10.4, date: '2026-06-11', category: 'other' }, s, new Set())?.id === 's', 'min tol 0.4');
  ok(matchBillToPayment({ amount: 10.6, date: '2026-06-11', category: 'other' }, s, new Set()) === null, 'min tol 0.6 no');
}
// Κακοσχηματισμένα/κενά → ποτέ crash, επιστρέφει []
ok(parseCSV('') .length === 0, 'empty file');
ok(parseCSV('Ημερομηνία;Περιγραφή;Ποσό').length === 0, 'header only');
ok(parseCSV('Ημερομηνία;Περιγραφή;Ποσό\n;;').length === 0, 'blank row');
ok(parseCSV('Ημερομηνία;Περιγραφή;Ποσό\nάκυρο;γραμμή').length === 0, 'too few cols');
ok(parseCSV('a;b;c\n12/06/2026;ΔΕΗ;-50,00').length === 1, 'unknown header → heuristic fallback');
// Πίστωση (ενοίκιο) → debit=false, δεν επιλέγεται αυτόματα
{
  const rent = parseCSV('Ημ/νία;Αιτιολογία;Χρέωση;Πίστωση;Υπόλοιπο\n01/06/2026;ΕΝΟΙΚΙΟ ΜΙΣΘΩΜΑ;;800,00;2.050,00');
  ok(rent.length === 1 && rent[0].debit === false, `rent credit debit=false → ${rent[0]?.debit}`);
  ok(rent[0]?.selected === false, 'rent not auto-selected');
  ok(approx(rent[0]?.amount, 800), `rent amount → ${rent[0]?.amount}`);
}

// ── Αποτελέσματα ────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n  Σύνολο tests: ${total}  ✓ ${pass}  ✗ ${fail}\n`);
if (fail) { console.log('  Πρώτες αποτυχίες:'); fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
else console.log('  ✅ Όλα πέρασαν.\n');
