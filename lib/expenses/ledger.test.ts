// npx tsx lib/expenses/ledger.test.ts
import { mergeLedger, ledgerTotal, ledgerUnpaid, groupByMonth, type LedgerBill, type LedgerExpense } from './ledger';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

const bill = (o: Partial<LedgerBill> & { id: string }): LedgerBill => o;
const exp = (o: Partial<LedgerExpense> & { id: string }): LedgerExpense => o;

// ── Η ΚΑΡΔΙΑ: ΚΑΘΕ ΕΥΡΩ ΜΙΑ ΦΟΡΑ ────────────────────────────────────────────
// Πληρωμένος λογαριασμός 80 € που γέννησε δαπάνη 80 €. Αν μετρηθεί δύο φορές,
// ο χρήστης βλέπει 160 € και σταματά να εμπιστεύεται το προϊόν.
{
  const r = mergeLedger(
    [bill({ id: 'b1', name: 'ΔΕΗ Ιουνίου', amount: 80, due_date: '2026-07-10', paid: true, paid_at: '2026-07-08' })],
    [exp({ id: 'e1', bill_id: 'b1', description: 'ΔΕΗ Ιουνίου', amount: 80, date: '2026-07-08', paid: true })],
  );
  eq('συνδεδεμένο ζεύγος → μία γραμμή', r.entries.length, 1);
  eq('συνδεδεμένο ζεύγος → σύνολο 80', ledgerTotal(r.entries), 80);
  eq('κρατά και τα δύο id', [r.entries[0].billId, r.entries[0].expenseId], ['b1', 'e1']);
  eq('πληρωμένο → καμία προθεσμία', r.entries[0].due, null);
}

// ── Ο ΑΠΛΗΡΩΤΟΣ ΛΟΓΑΡΙΑΣΜΟΣ ΕΙΝΑΙ ΔΑΠΑΝΗ ΠΟΥ ΔΕΝ ΠΛΗΡΩΣΕΣ ─────────────────
// Δεν έχει δαπάνη πίσω του, γιατί η δαπάνη γεννιέται στην πληρωμή. Πρέπει να
// φαίνεται στη λίστα, αλλιώς ο χρήστης δεν ξέρει τι χρωστά.
{
  const r = mergeLedger(
    [bill({ id: 'b2', name: 'ΕΥΔΑΠ', amount: 42.5, due_date: '2026-08-20', paid: false })],
    [],
  );
  eq('απλήρωτος → φαίνεται', r.entries.length, 1);
  eq('απλήρωτος → κρατά προθεσμία', r.entries[0].due, '2026-08-20');
  eq('απλήρωτος → μετρά στην ημερομηνία λήξης', r.entries[0].date, '2026-08-20');
  eq('απλήρωτος → paid false', r.entries[0].paid, false);
  eq('ledgerUnpaid τον βρίσκει', ledgerUnpaid(r.entries).length, 1);
}

// ── ΔΑΠΑΝΗ ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ ────────────────────────────────────────────────
{
  const r = mergeLedger([], [exp({ id: 'e2', description: 'Υδραυλικός', amount: 120, date: '2026-07-03' })]);
  eq('σκέτη δαπάνη → μία γραμμή', r.entries.length, 1);
  eq('σκέτη δαπάνη → χωρίς λογαριασμό', r.entries[0].billId, null);
}

// ── ΚΡΕΜΑΣΤΟ bill_id ───────────────────────────────────────────────────────
// Αν σβηστεί λογαριασμός, η βάση μηδενίζει το bill_id. Σε παλιά δεδομένα όμως
// μπορεί να έχει μείνει id που δεν δείχνει πουθενά. Η δαπάνη ΔΕΝ επιτρέπεται
// να εξαφανιστεί: είναι χρήματα που όντως έφυγαν.
{
  const r = mergeLedger([], [exp({ id: 'e3', bill_id: 'σβησμένος', description: 'Ορφανή', amount: 55, date: '2026-06-01' })]);
  eq('κρεμαστό bill_id → δεν χάνεται', r.entries.length, 1);
  eq('κρεμαστό bill_id → σύνολο σωστό', ledgerTotal(r.entries), 55);
}

// ── ΔΥΟ ΔΑΠΑΝΕΣ ΣΤΟΝ ΙΔΙΟ ΛΟΓΑΡΙΑΣΜΟ ───────────────────────────────────────
// Συμβαίνει όταν το «Πληρώθηκε» πατηθεί δύο φορές ή όταν η σάρωση φτιάξει
// δεύτερη. Ούτε σβήνουμε ούτε αθροίζουμε: ξεχωρίζουμε.
{
  const r = mergeLedger(
    [bill({ id: 'b3', name: 'ΔΕΗ', amount: 90, due_date: '2026-07-10', paid: true, paid_at: '2026-07-09' })],
    [
      exp({ id: 'e4', bill_id: 'b3', description: 'ΔΕΗ', amount: 90, date: '2026-07-09' }),
      exp({ id: 'e5', bill_id: 'b3', description: 'ΔΕΗ (ξανά)', amount: 90, date: '2026-07-09' }),
    ],
  );
  eq('διπλή → μία στη λίστα', r.entries.length, 1);
  eq('διπλή → μία στα duplicates', r.duplicates.length, 1);
  eq('διπλή → σύνολο 90 όχι 180', ledgerTotal(r.entries), 90);
  eq('καμία γραμμή δεν χάθηκε', r.entries.length + r.duplicates.length, 2);
}

// ── ΤΟ ΚΕΙΜΕΝΟ ΤΗΣ ΔΑΠΑΝΗΣ ΝΙΚΑ, Η ΠΡΟΘΕΣΜΙΑ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ ΝΙΚΑ ─────────
// Η δαπάνη είναι το γεγονός και ο χρήστης μπορεί να τη διορθώσει. Ο λογαριασμός
// είναι το πρόγραμμα και ξέρει πότε λήγει.
{
  const r = mergeLedger(
    [bill({ id: 'b4', name: 'Παλιό όνομα', category: 'electricity', amount: 70, due_date: '2026-07-10', recurring: true, paid: false })],
    [exp({ id: 'e6', bill_id: 'b4', description: 'Διορθωμένο όνομα', category: 'Ρεύμα', amount: 70, date: '2026-07-05', paid: false })],
  );
  eq('τίτλος από τη δαπάνη', r.entries[0].title, 'Διορθωμένο όνομα');
  eq('κατηγορία από τη δαπάνη', r.entries[0].category, 'Ρεύμα');
  eq('προθεσμία από τον λογαριασμό', r.entries[0].due, '2026-07-10');
  eq('πάγιο από τον λογαριασμό', r.entries[0].recurring, true);
}

// ── Η ΗΜΕΡΟΜΗΝΙΑ ΠΟΥ ΜΕΤΡΑ ─────────────────────────────────────────────────
// Ο Προϋπολογισμός φιλτράριζε τους λογαριασμούς με created_at, δηλαδή με το
// πότε τους πληκτρολόγησες. Λογαριασμός Ιανουαρίου καταχωρημένος τον Φεβρουάριο
// χάλαγε δύο μήνες με μία κίνηση.
{
  const r = mergeLedger(
    [bill({ id: 'b5', name: 'Ιανουαρίου', amount: 60, due_date: '2026-01-31', created_at: '2026-02-14T10:00:00Z', paid: false })],
    [],
  );
  eq('μετρά στη λήξη, όχι στην καταχώρηση', r.entries[0].date, '2026-01-31');
}
{
  const r = mergeLedger(
    [bill({ id: 'b6', name: 'Πληρωμένος', amount: 60, due_date: '2026-03-31', paid_at: '2026-03-20T08:00:00Z', paid: true })],
    [],
  );
  eq('πληρωμένος μετρά στην πληρωμή', r.entries[0].date, '2026-03-20');
}

// ── ΣΕΙΡΑ ΚΑΙ ΟΜΑΔΟΠΟΙΗΣΗ ──────────────────────────────────────────────────
{
  const r = mergeLedger([], [
    exp({ id: 'x1', description: 'Παλιό', amount: 10, date: '2026-05-02' }),
    exp({ id: 'x2', description: 'Νέο', amount: 20, date: '2026-07-15' }),
    exp({ id: 'x3', description: 'Μεσαίο', amount: 30, date: '2026-07-01' }),
  ]);
  eq('νεότερα πρώτα', r.entries.map(e => e.title), ['Νέο', 'Μεσαίο', 'Παλιό']);
  const g = groupByMonth(r.entries);
  eq('δύο μήνες', g.length, 2);
  eq('νεότερος μήνας πρώτος', g[0].month, '2026-07');
  eq('σύνολο Ιουλίου', g[0].total, 50);
  eq('σύνολο Μαΐου', g[1].total, 10);
}

// ── ΑΝΘΕΚΤΙΚΟΤΗΤΑ ΣΕ ΒΡΟΜΙΚΑ ΔΕΔΟΜΕΝΑ ──────────────────────────────────────
{
  const r = mergeLedger(
    [bill({ id: 'b7', amount: null, due_date: null, paid: false })],
    [exp({ id: 'e7', description: '  ', amount: undefined, date: null })],
  );
  eq('null ποσά → μηδέν, όχι NaN', ledgerTotal(r.entries), 0);
  ok('κενός τίτλος → φιλικό κείμενο', r.entries.every(e => e.title === 'Χωρίς περιγραφή'));
  ok('καμία γραμμή δεν χάθηκε', r.entries.length === 2);
}

// ── ΣΤΑΘΕΡΗ ΣΕΙΡΑ ΣΤΗΝ ΙΔΙΑ ΜΕΡΑ ───────────────────────────────────────────
// Χωρίς δεύτερο κριτήριο, δύο γραμμές της ίδιας μέρας άλλαζαν θέση σε κάθε
// φόρτωση και η λίστα «τρεμόπαιζε».
{
  const a = mergeLedger([], [exp({ id: 'z2', amount: 1, date: '2026-07-01' }), exp({ id: 'z1', amount: 2, date: '2026-07-01' })]);
  const b = mergeLedger([], [exp({ id: 'z1', amount: 2, date: '2026-07-01' }), exp({ id: 'z2', amount: 1, date: '2026-07-01' })]);
  eq('ίδια σειρά ανεξάρτητα από την είσοδο', a.entries.map(e => e.key), b.entries.map(e => e.key));
}

// ── ΤΟ ΣΕΝΑΡΙΟ ΤΟΥ ΠΡΑΓΜΑΤΙΚΟΥ ΧΡΗΣΤΗ ──────────────────────────────────────
// Ένα ακίνητο, ένας μήνας: ρεύμα πληρωμένο, νερό απλήρωτο, υδραυλικός,
// κοινόχρηστα από άλλη οθόνη χωρίς ομάδα. Σύνολο 305,50 και όχι 385,50.
{
  const r = mergeLedger(
    [
      bill({ id: 'B1', name: 'ΔΕΗ Ιουνίου', category: 'electricity', amount: 80, due_date: '2026-07-10', paid: true, paid_at: '2026-07-08' }),
      bill({ id: 'B2', name: 'ΕΥΔΑΠ', category: 'water', amount: 42.5, due_date: '2026-07-25', paid: false }),
    ],
    [
      exp({ id: 'E1', bill_id: 'B1', description: 'ΔΕΗ Ιουνίου', category: 'Ρεύμα', amount: 80, date: '2026-07-08', expense_group: 'fixed' }),
      exp({ id: 'E2', description: 'Υδραυλικός', category: 'Υδραυλικός', amount: 143, date: '2026-07-12', expense_group: 'maintenance' }),
      exp({ id: 'E3', description: 'Κοινόχρηστα', category: 'Κοινόχρηστα', amount: 40, date: '2026-07-05' }),
    ],
  );
  eq('τέσσερις γραμμές, όχι πέντε', r.entries.length, 4);
  eq('σύνολο 305,50', ledgerTotal(r.entries), 305.5);
  eq('ένα απλήρωτο', ledgerUnpaid(r.entries).length, 1);
  eq('ένας μήνας', groupByMonth(r.entries).length, 1);
  ok('η δαπάνη χωρίς ομάδα δεν χάθηκε', r.entries.some(e => e.title === 'Κοινόχρηστα'));
}

console.log(fail === 0 ? `✓ ledger: ${pass} έλεγχοι πέρασαν` : `✗ ledger: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
