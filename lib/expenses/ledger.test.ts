// npx tsx lib/expenses/ledger.test.ts
import { mergeLedger, ledgerTotal, ledgerUnpaid, groupByMonth, recurringMonthly, monthlyAverage, type LedgerBill, type LedgerExpense } from './ledger';

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
      // Το E1 δεν δηλώνει `paid`: το κληρονομεί από τον πληρωμένο λογαριασμό
      // του. Τα E2/E3 το δηλώνουν, γιατί δεν κρέμονται από λογαριασμό — και
      // άγνωστο δεν σημαίνει πληρωμένο.
      exp({ id: 'E1', bill_id: 'B1', description: 'ΔΕΗ Ιουνίου', category: 'Ρεύμα', amount: 80, date: '2026-07-08', expense_group: 'fixed' }),
      exp({ id: 'E2', description: 'Υδραυλικός', category: 'Υδραυλικός', amount: 143, date: '2026-07-12', expense_group: 'maintenance', paid: true }),
      exp({ id: 'E3', description: 'Κοινόχρηστα', category: 'Κοινόχρηστα', amount: 40, date: '2026-07-05', paid: true }),
    ],
  );
  eq('τέσσερις γραμμές, όχι πέντε', r.entries.length, 4);
  eq('σύνολο 305,50', ledgerTotal(r.entries), 305.5);
  eq('ένα απλήρωτο', ledgerUnpaid(r.entries).length, 1);
  eq('ένας μήνας', groupByMonth(r.entries).length, 1);
  ok('η δαπάνη χωρίς ομάδα δεν χάθηκε', r.entries.some(e => e.title === 'Κοινόχρηστα'));
}


// ═══ Η ΔΙΠΛΗ ΑΦΑΙΡΕΣΗ ΤΗΣ ΣΥΓΚΡΙΣΗΣ ══════════════════════════════════════
// Η οθόνη Σύγκρισης άθροιζε χωριστά «όλες τις δαπάνες» και «όλους τους πάγιους
// λογαριασμούς», και αφαιρούσε ΚΑΙ ΤΑ ΔΥΟ από το ενοίκιο. Ο πληρωμένος πάγιος
// όμως είναι ΕΝΑ γεγονός σε δύο πίνακες. Το τεστ κρατά το συμβόλαιο που το
// εμποδίζει να ξανασυμβεί: το σύνολο του πυρήνα ΔΕΝ αλλάζει όταν ο ίδιος
// πάγιος υπάρχει και ως λογαριασμός και ως δαπάνη.
{
  const bills = Array.from({ length: 12 }, (_, i) => bill({
    id: `R${i}`, name: 'ΔΕΗ', category: 'electricity', amount: 100, recurring: true,
    due_date: `2026-${String(i + 1).padStart(2, '0')}-20`,
    paid: true, paid_at: `2026-${String(i + 1).padStart(2, '0')}-10`,
  }));
  const expenses = bills.map((b, i) => exp({
    id: `RE${i}`, bill_id: b.id, description: 'ΔΕΗ', category: 'Ρεύμα', amount: 100,
    date: `2026-${String(i + 1).padStart(2, '0')}-10`, expense_group: 'fixed', is_recurring: true,
  }));
  const r = mergeLedger(bills, expenses);

  eq('δώδεκα γραμμές, όχι εικοσιτέσσερις', r.entries.length, 12);
  eq('1.200 €, όχι 2.400 €', ledgerTotal(r.entries), 1200);
  eq('κανένα διπλό', r.duplicates.length, 0);

  // Το ΩΜΟ άθροισμα των δύο πινάκων — αυτό που έκανε η οθόνη — δίνει διπλάσιο.
  const naive = bills.reduce((s, b) => s + (b.amount ?? 0), 0)
              + expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  eq('το ωμό άθροισμα όντως διπλασιάζει', naive, 2400);
  ok('ο πυρήνας μετράει το μισό του ωμού', ledgerTotal(r.entries) * 2 === naive);

  // Τα πάγια είναι ΥΠΟΣΥΝΟΛΟ του έτους: δεν αφαιρούνται ξεχωριστά.
  const recurring = ledgerTotal(r.entries.filter(e => e.recurring));
  ok('τα πάγια δεν ξεπερνούν το σύνολο', recurring <= ledgerTotal(r.entries));
  eq('πάγια ανά μήνα = 100 €', recurring / 12, 100);
}


// ═══ ΠΑΓΙΑ ΑΝΑ ΜΗΝΑ — ΜΕΤΡΗΜΕΝΑ, ΟΧΙ ΑΘΡΟΙΣΜΕΝΑ ═════════════════════════════
// Κάθε γραμμή του `bills` είναι μία ΠΕΡΙΟΔΟΣ· το `recurring` είναι χαρακτηρισμός.
// Άρα «άθροισε τους πάγιους» δεν είναι ποτέ μηνιαίο νούμερο.
{
  const mk = (m: number, amount: number, id: string) => exp({
    id, description: 'ΔΕΗ', category: 'Ρεύμα', amount, is_recurring: true,
    date: `2026-${String(m).padStart(2, '0')}-10`, expense_group: 'fixed',
  });

  // Μηνιαίος, δώδεκα περίοδοι: 1.200 € συνολικά, 100 € ο μήνας.
  {
    const r = mergeLedger([], Array.from({ length: 12 }, (_, i) => mk(i + 1, 100, `m${i}`)));
    const a = recurringMonthly(r.entries);
    eq('μηνιαίος: 100 €/μήνα', a.perMonth, 100);
    eq('μηνιαίος: εύρος 12 μήνες', a.months, 12);
    eq('μηνιαίος: σύνολο 1.200 €', a.total, 1200);
  }

  // ΔΙΜΗΝΟΣ (ΕΥΔΑΠ): τρεις καταχωρήσεις των 80 € σε εύρος πέντε μηνών.
  // Με διαίρεση «μήνες που έχουν γραμμή» θα έβγαινε 80 €/μήνα — διπλάσιο.
  {
    const r = mergeLedger([], [mk(1, 80, 'd1'), mk(3, 80, 'd2'), mk(5, 80, 'd3')]);
    const a = recurringMonthly(r.entries);
    eq('δίμηνος: εύρος 5 μήνες, όχι 3', a.months, 5);
    eq('δίμηνος: 48 €/μήνα, όχι 80', a.perMonth, 48);
  }

  // ΜΕΡΙΚΟ ΕΤΟΣ: ξεκίνησε Οκτώβριο. Με σταθερό 12 θα έβλεπε 75 € αντί 300 €.
  {
    const r = mergeLedger([], [mk(10, 300, 'p1'), mk(11, 300, 'p2'), mk(12, 300, 'p3')]);
    const a = recurringMonthly(r.entries);
    eq('μερικό έτος: εύρος 3 μήνες', a.months, 3);
    eq('μερικό έτος: 300 €/μήνα, όχι 225', a.perMonth, 300);
  }

  // ΕΝΑΣ ΜΗΝΑΣ: δεν υπάρχει μέσος όρος, υπάρχει ένας μήνας. Δεν μαντεύουμε.
  {
    const a = recurringMonthly(mergeLedger([], [mk(7, 100, 's1')]).entries);
    eq('ένας μήνας: κανένας μέσος όρος', a.perMonth, null);
    eq('ένας μήνας: το σύνολο υπάρχει', a.total, 100);
  }

  // ΤΑ ΕΦΑΠΑΞ ΔΕΝ ΕΙΝΑΙ ΠΑΓΙΑ: μια επισκευή δεν επιβαρύνει κάθε μήνα.
  {
    const oneOff = exp({ id: 'x', description: 'Υδραυλικός', category: 'Συντήρηση',
      amount: 5000, date: '2026-03-04', expense_group: 'maintenance' });
    const r = mergeLedger([], [mk(1, 100, 'r1'), mk(2, 100, 'r2'), oneOff]);
    const a = recurringMonthly(r.entries);
    eq('η έκτακτη επισκευή δεν μπαίνει στα πάγια', a.total, 200);
    eq('πάγια ανά μήνα 100 €', a.perMonth, 100);
  }

  eq('χωρίς πάγια: τίποτα', recurringMonthly([]).perMonth, null);

  // ═══ Ο ΙΔΙΟΣ ΚΑΝΟΝΑΣ ΓΙΑ ΟΛΕΣ ΤΙΣ ΔΑΠΑΝΕΣ, ΟΧΙ ΜΟΝΟ ΓΙΑ ΤΑ ΠΑΓΙΑ ═══════
  // Η Σύγκριση έγραφε «δαπάνες έτους ÷ 12» για το «Καθαρό ανά μήνα». Τον
  // Μάρτιο αυτό μοιράζει τρεις μήνες σε δώδεκα, και το ακίνητο δείχνει
  // τέσσερις φορές φθηνότερο — στη στήλη που φοράει το στεφάνι «καλύτερο».
  {
    const oneOff = exp({ id: 'y', description: 'Υδραυλικός', category: 'Συντήρηση',
      amount: 600, date: '2026-02-04', expense_group: 'maintenance' });
    const r = mergeLedger([], [mk(1, 100, 'a1'), mk(2, 100, 'a2'), mk(3, 100, 'a3'), oneOff]);
    const a = monthlyAverage(r.entries);
    eq('ο μέσος μήνας μετρά ΚΑΙ τα έκτακτα', a.total, 900);
    eq('τρεις μήνες, όχι δώδεκα', a.months, 3);
    eq('300 €/μήνα, όχι 75', a.perMonth, 300);
    eq('τα πάγια μόνα τους μένουν 100', recurringMonthly(r.entries).perMonth, 100);
  }
  {
    const a = monthlyAverage(mergeLedger([], [mk(7, 100, 'z1')]).entries);
    eq('ένας μήνας δαπανών: κανένας μέσος όρος', a.perMonth, null);
  }
  eq('χωρίς δαπάνες: τίποτα', monthlyAverage([]).perMonth, null);
}


// ═══ ΤΟ ΑΘΡΟΙΣΜΑ ΜΟΝΟ ΑΠΟ ΤΙΣ ΔΑΠΑΝΕΣ ΚΡΥΒΕΙ ΟΤΙ ΧΡΩΣΤΑΣ ═══════════════════
// Ο βοηθός υπολόγιζε τα σύνολά του ΜΟΝΟ από τον πίνακα `expenses`. Ο απλήρωτος
// λογαριασμός όμως δεν έχει δαπάνη πίσω του — γεννιέται στην πληρωμή. Έλεγε
// λοιπόν «εκκρεμείς 0 €» σε ιδιοκτήτη με απλήρωτους λογαριασμούς, και έδινε αισιόδοξη
// καθαρή απόδοση. Οι Δαπάνες και η Σύγκριση τα μετρούσαν: ίδιο ακίνητο, δύο
// απαντήσεις από το ίδιο app.
{
  const paidBills = Array.from({ length: 6 }, (_, i) => bill({
    id: `p${i}`, name: 'ΔΕΗ', category: 'Ρεύμα', amount: 100, recurring: true, paid: true,
    paid_at: `2026-0${i + 1}-10`, due_date: `2026-0${i + 1}-20`,
  }));
  const owedBills = [
    // ΓΙΑΤΙ ΟΧΙ «ΕΝΦΙΑ» ΕΔΩ: ο έλεγχος του obligations.test.ts απαγορεύει όνομα
    // φορολογικής υποχρέωσης δίπλα σε ημερομηνία εκτός του ενός ημερολογίου
    // (lib/tax/greekTaxCalendar.ts) — και έχει δίκιο, ακόμη και σε δεδομένα
    // δοκιμής. Το σενάριο δεν χρειάζεται φόρο: χρειάζεται μεγάλο απλήρωτο ποσό.
    bill({ id: 'u1', name: 'Ασφάλεια κτιρίου', category: 'Ασφάλιση', amount: 620, paid: false, due_date: '2026-07-31' }),
    bill({ id: 'u2', name: 'ΔΕΗ Ιουλίου', category: 'Ρεύμα', amount: 110, paid: false, due_date: '2026-07-20' }),
    bill({ id: 'u3', name: 'Κοινόχρηστα', category: 'Κοινόχρηστα', amount: 70, paid: false, due_date: '2026-07-15' }),
  ];
  const paidExpenses = paidBills.map((b, i) => exp({
    id: `e${i}`, bill_id: b.id, description: 'ΔΕΗ', category: 'Ρεύμα', amount: 100,
    date: `2026-0${i + 1}-10`, paid: true, expense_group: 'fixed', is_recurring: true,
  }));

  const { entries } = mergeLedger([...paidBills, ...owedBills], paidExpenses);

  // Ο παλιός τρόπος: μόνο ο πίνακας δαπανών.
  const onlyExpenses = paidExpenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  eq('μόνο δαπάνες: 600 €', onlyExpenses, 600);

  // Ο πυρήνας: ό,τι πληρώθηκε ΚΑΙ ό,τι οφείλεται.
  eq('πυρήνας: σύνολο 1.400 €', ledgerTotal(entries), 1400);
  eq('πυρήνας: πληρωμένες 600 €', ledgerTotal(entries.filter(e => e.paid)), 600);
  eq('πυρήνας: ΕΚΚΡΕΜΕΙΣ 800 €, όχι 0 €', ledgerTotal(ledgerUnpaid(entries)), 800);
  eq('τρεις απλήρωτες γραμμές', ledgerUnpaid(entries).length, 3);

  // Ο απλήρωτος μετράει στην ημερομηνία που ΛΗΓΕΙ — εκεί οφείλεται.
  const big = entries.find(e => e.title === 'Ασφάλεια κτιρίου');
  eq('ο απλήρωτος μετράει στη λήξη του', big?.date, '2026-07-31');
  eq('και κρατά την προθεσμία του', big?.due, '2026-07-31');

  // Καμία γραμμή δεν χάθηκε: 6 ζεύγη + 3 απλήρωτοι.
  eq('εννέα γραμμές συνολικά', entries.length, 9);
}

// ═══ Η ΔΑΠΑΝΗ ΧΩΡΙΣ `paid` ΔΕΝ ΕΙΝΑΙ ΠΛΗΡΩΜΕΝΗ ════════════════════════════
//
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Εδώ γραφόταν `e.paid !== false`, δηλαδή το NULL
// διαβαζόταν ως «πληρωμένο». Η στήλη είναι `boolean | null`, και υπήρχε
// διαδρομή που έγραφε δαπάνη ΧΩΡΙΣ `paid`: η σάρωση παραστατικού.
//
// Ο χρήστης σάρωνε απλήρωτο λογαριασμό ΔΕΗ 84,50 € και τον έβλεπε
// ΕΞΟΦΛΗΜΕΝΟ. Έχανε την προθεσμία του (η προθεσμία κρύβεται όταν κάτι έχει
// πληρωθεί), έφευγε από τις οφειλές, και μετριόταν στα πληρωμένα του μήνα.
//
// Άγνωστο σημαίνει άγνωστο, και για χρήματα το άγνωστο δεν είναι «έγινε».
{
  const r = mergeLedger(
    [bill({ id: 'b9', name: 'ΔΕΗ Ιουνίου', amount: 84.5, due_date: '2026-07-10', paid: false })],
    [exp({ id: 'e9', bill_id: 'b9', description: 'ΔΕΗ Ιουνίου', amount: 84.5, date: '2026-07-02' })],
  );
  eq('χωρίς paid → απλήρωτη', r.entries[0].paid, false);
  eq('κρατά την προθεσμία της', r.entries[0].due, '2026-07-10');
  eq('φαίνεται στις οφειλές', ledgerUnpaid(r.entries).length, 1);
}

// Το ρητό `true` μένει πληρωμένο — η διόρθωση δεν αντιστρέφει τη σημασία.
{
  const r = mergeLedger(
    [],
    [exp({ id: 'e10', description: 'Ασφάλεια', amount: 148, date: '2026-01-22', paid: true })],
  );
  eq('ρητό true → πληρωμένη', r.entries[0].paid, true);
  eq('και δεν φαίνεται στις οφειλές', ledgerUnpaid(r.entries).length, 0);
}

console.log(fail === 0 ? `✓ ledger: ${pass} έλεγχοι πέρασαν` : `✗ ledger: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
