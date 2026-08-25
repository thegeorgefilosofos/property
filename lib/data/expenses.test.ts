// npx tsx lib/data/expenses.test.ts
//
// ΤΟ ΑΦΜ ΤΟΥ ΠΡΟΜΗΘΕΥΤΗ ΓΡΑΦΟΤΑΝ ΚΑΙ ΔΕΝ ΞΑΝΑΔΙΑΒΑΖΟΤΑΝ.
// Η στήλη `supplier_afm` υπάρχει, ο φάκελος του λογιστή μετρά τις δαπάνες που
// δεν την έχουν, η εξαγωγή έχει στήλη γι' αυτήν — αλλά έλειπε από τη λίστα
// στηλών του ημερολογίου, οπότε καμία οθόνη δεν μπορούσε να τη δείξει ούτε να
// τη διορθώσει. Χωρίς ΑΦΜ, το ταίριασμα παραστατικών γίνεται με το όνομα και
// τρεις «Συντήρηση Παπαδόπουλος» είναι τρία διαφορετικά τιμολόγια.
//
// Ο δεύτερος έλεγχος εδώ φυλάει τον κανόνα που κρίνει ευρώ: η ΟΜΑΔΑ παράγεται
// από την ΚΑΤΗΓΟΡΙΑ. Η οθόνη επεξεργασίας αλλάζει κατηγορία και αν η ομάδα
// δεν ξαναπαραχθεί μαζί, μια γραμμή ΕΝΦΙΑ μένει με εκπεστέα ομάδα.
import { LEDGER_COLUMNS, REPORT_COLUMNS, groupOf, row } from './expenses';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

const cols = LEDGER_COLUMNS.split(',');

// ── Οι στήλες που διαβάζει το ημερολόγιο ──────────────────────────────────
for (const col of ['id', 'bill_id', 'amount', 'date', 'description', 'category',
  'paid', 'expense_group', 'is_recurring', 'store_vendor', 'supplier_afm']) {
  ok(`το ημερολόγιο παίρνει τη στήλη «${col}»`, cols.includes(col));
}
ok('καμία στήλη δύο φορές', new Set(cols).size === cols.length);
ok('καμία στήλη με κενό γύρω της', cols.every(c => c === c.trim() && c.length > 0));
ok('οι αναφορές κρατούν το ακίνητο', REPORT_COLUMNS.split(',').includes('property_id'));

// ── Η ομάδα παράγεται από την κατηγορία ───────────────────────────────────
// Ο ΕΝΦΙΑ ΔΕΝ ΕΚΠΙΠΤΕΙ, το ρεύμα ναι. Αν οι δύο πέσουν στην ίδια ομάδα, η
// αλλαγή κατηγορίας από την οθόνη επεξεργασίας δεν αλλάζει τίποτα ουσιαστικό.
ok('η ελληνική ετικέτα βρίσκει ομάδα', groupOf('Ρεύμα') !== 'other');
ok('ο ΕΝΦΙΑ μένει εκτός εκπεστέας ομάδας', groupOf('ΕΝΦΙΑ') === 'other');
ok('άγνωστη κατηγορία δεν εκπίπτει', groupOf('κάτι που δεν υπάρχει') === 'other');
ok('η αλλαγή κατηγορίας αλλάζει και την ομάδα', groupOf('Ρεύμα') !== groupOf('ΕΝΦΙΑ'));

// ── Η γραμμή που φτάνει στη βάση ──────────────────────────────────────────
{
  const scope = { propertyId: 'p1', userId: 'u1' };
  const r = row(scope, { description: 'ΔΕΗ', amount: 84.5, category: 'Ρεύμα', date: '2026-08-01' });
  ok('η ομάδα συμπληρώνεται μόνη της', r.expense_group === groupOf('Ρεύμα'));
  ok('χωρίς ΑΦΜ γράφεται κενό, όχι undefined', r.supplier_afm === null);

  const withAfm = row(scope, {
    description: 'Υδραυλικός', amount: 120, category: 'Υδραυλικός',
    date: '2026-08-01', supplier_afm: '094014201',
  });
  ok('το ΑΦΜ φτάνει στη γραμμή', withAfm.supplier_afm === '094014201');

  const explicit = row(scope, {
    description: 'Δόση', amount: 300, category: 'Άλλο', date: '2026-08-01', expense_group: 'loan',
  });
  ok('η ρητή ομάδα του καλούντος υπερισχύει', explicit.expense_group === 'loan');
}

console.log(fail === 0 ? `✓ expenses: ${pass} έλεγχοι πέρασαν` : `✗ expenses: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
