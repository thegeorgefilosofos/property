// npx tsx lib/data/rent.test.ts
//
// Ο ΠΙΝΑΚΑΣ ΠΟΥ ΤΡΟΦΟΔΟΤΕΙ ΤΗ ΔΗΛΩΣΗ.
// Από τις δόσεις ενοικίου βγαίνουν το Ε2, η βεβαίωση ενοικίου και το «μου
// χρωστάνε». Μια ασυνέπεια εδώ δεν είναι οπτική: είναι λάθος νούμερο σε έντυπο
// που υπογράφει ο ιδιοκτήτης.
import {
  daysLate, dueDateOf, paidFields, unpaidFields, PERIOD_KEY,
  ofProperty, chronological, ofProperties, ofUser, latestAmount,
  markPaid, markUnpaid, upsertPeriod, removeOfTenant,
} from './rent';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Ημέρες καθυστέρησης ───────────────────────────────────────────────────
ok('πληρωμή την ημέρα της προθεσμίας δεν είναι καθυστέρηση', daysLate('2026-08-05', '2026-08-05') === 0);
ok('πληρωμή νωρίτερα δεν είναι καθυστέρηση', daysLate('2026-08-05', '2026-08-01') === 0);
ok('μία ημέρα μετά είναι μία ημέρα', daysLate('2026-08-05', '2026-08-06') === 1);
ok('δέκα ημέρες μετά είναι δέκα', daysLate('2026-08-05', '2026-08-15') === 10);
// ΤΟ «ΔΕΝ ΞΕΡΩ» ΔΕΝ ΕΙΝΑΙ ΚΑΘΥΣΤΕΡΗΣΗ: δόση χωρίς προθεσμία δεν μπορεί να άργησε.
ok('χωρίς προθεσμία, μηδέν', daysLate(null, '2026-08-15') === 0);
ok('χωρίς ημερομηνία πληρωμής, μηδέν', daysLate('2026-08-05', null) === 0);
ok('χωρίς τίποτα, μηδέν', daysLate(null, null) === 0);
// Αλλαγή θερινής ώρας: 29/3/2026 η Ελλάδα πάει UTC+3.
ok('πέρασμα θερινής ώρας δεν χάνει ημέρα', daysLate('2026-03-28', '2026-03-30') === 2);

// ── Η προθεσμία της περιόδου ──────────────────────────────────────────────
ok('πέμπτη του μήνα', dueDateOf(2026, 8, 5) === '2026-08-05');
ok('ο μήνας γεμίζει με μηδενικό', dueDateOf(2026, 3, 1) === '2026-03-01');
// Η ΗΜΕΡΑ ΚΛΕΙΝΕΤΑΙ ΣΤΟ 28: ο Φεβρουάριος υπάρχει, και το «31» θα ήταν άκυρη
// ημερομηνία που η Postgres θα απέρριπτε ολόκληρη την καταχώρηση.
ok('η 31η γίνεται 28η', dueDateOf(2026, 2, 31) === '2026-02-28');
ok('η μηδενική γίνεται 1η', dueDateOf(2026, 5, 0) === '2026-05-01');

// ── Οι τέσσερις στήλες της είσπραξης ──────────────────────────────────────
{
  const f = paidFields('2026-08-05', '2026-08-12', 'Τραπεζική κατάθεση');
  ok('η είσπραξη σηκώνει τη σημαία', f.paid === true);
  ok('η είσπραξη κρατά την ημερομηνία', f.paid_date === '2026-08-12');
  ok('η είσπραξη κρατά τη μέθοδο', f.method === 'Τραπεζική κατάθεση');
  // ΤΟ ΣΗΜΑΝΤΙΚΟ: οι ημέρες βγαίνουν ΑΠΟ ΤΙΣ ΙΔΙΕΣ ΗΜΕΡΟΜΗΝΙΕΣ, όχι από τον
  // καλούντα. Δύο οθόνες υπολόγιζαν τον ίδιο τύπο η καθεμία μόνη της.
  ok('οι ημέρες καθυστέρησης βγαίνουν μόνες τους', f.days_late === 7);
}
{
  const u = unpaidFields();
  ok('η ακύρωση κατεβάζει τη σημαία', u.paid === false);
  ok('η ακύρωση σβήνει την ημερομηνία', u.paid_date === null);
  // ΑΥΤΟ ΞΕΧΝΙΟΤΑΝ: η μέθοδος επιβίωνε της ακύρωσης, οπότε η δόση έλεγε
  // «απλήρωτη, με τραπεζική κατάθεση».
  ok('η ακύρωση σβήνει και τη μέθοδο', u.method === null);
  ok('η ακύρωση σβήνει τις ημέρες', u.days_late === null);
}

ok('το κλειδί περιόδου είναι μισθωτής και μήνας', PERIOD_KEY === 'tenant_id,period_year,period_month');

// ── Ψεύτικη βάση ──────────────────────────────────────────────────────────
interface Call { columns: string; eq: [string, unknown][]; order: [string, boolean][]; patch?: Record<string, unknown>; conflict?: string; del?: boolean; inIds?: unknown[] }
function fakeDb(rows: Record<string, unknown>[] = [], single: Record<string, unknown> | null = null) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [], order: [] };
      calls.push(call);
      const res = Promise.resolve({ data: rows, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        in(_c: string, v: unknown[]) { call.inIds = v; return q },
        order(c: string, o?: { ascending?: boolean }) { call.order.push([c, o?.ascending !== false]); return q },
        update(p: Record<string, unknown>) { call.patch = p; return q },
        upsert(p: Record<string, unknown>, o?: { onConflict?: string }) { call.patch = p; call.conflict = o?.onConflict; return q },
        delete() { call.del = true; return q },
        limit() { return q },
        maybeSingle() { return Promise.resolve({ data: single, error: null }) },
        then(...a: Parameters<Promise<unknown>['then']>) { return res.then(...a) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

async function asyncChecks() {
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', 'amount', 'u1', { year: 2026, paid: false });
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('το έτος φιλτράρεται στη βάση', calls[0].eq.some(([c, v]) => c === 'period_year' && v === 2026));
    ok('το απλήρωτο φιλτράρεται στη βάση', calls[0].eq.some(([c, v]) => c === 'paid' && v === false));
    ok('νεότερη περίοδος πρώτη, με τη σωστή σειρά στηλών',
      calls[0].order.length === 2 && calls[0].order[0][0] === 'period_year' && calls[0].order[0][1] === false);
  }
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', 'amount');
    ok('χωρίς χρήστη δεν μπαίνει ψεύτικο φίλτρο', !calls[0].eq.some(([c]) => c === 'user_id'));
    ok('χωρίς έτος δεν μπαίνει φίλτρο έτους', !calls[0].eq.some(([c]) => c === 'period_year'));
  }
  {
    const { db, calls } = fakeDb();
    await chronological(db, 'p1', 'amount', 'u1');
    ok('η χρονοσειρά πάει από την παλαιότερη περίοδο',
      calls[0].order[0][0] === 'period_year' && calls[0].order[0][1] === true);
  }
  {
    ok('κενή λίστα ακινήτων δεν ρωτά καθόλου τη βάση',
      (await ofProperties(fakeDb().db, [], 'amount', 'u1')).length === 0);
  }
  {
    const { db, calls } = fakeDb();
    await ofProperties(db, ['p1'], 'amount', 'u1', { year: 2026, month: 0 });
    ok('μήνας μηδέν σημαίνει «όλο το έτος», όχι μήνας μηδέν',
      !calls[0].eq.some(([c]) => c === 'period_month'));
  }
  {
    const { db, calls } = fakeDb();
    await ofUser(db, 'u1', 'amount', { year: 2025 });
    ok('το χαρτοφυλάκιο φιλτράρει χρήστη και έτος', calls[0].eq.length === 2);
  }
  {
    ok('χωρίς δόσεις, το τελευταίο ποσό είναι null',
      (await latestAmount(fakeDb([], null).db, 'p1', 'u1')) === null);
    ok('το τελευταίο ποσό γίνεται αριθμός',
      (await latestAmount(fakeDb([], { amount: '850.50' }).db, 'p1', 'u1')) === 850.5);
  }
  {
    const { db, calls } = fakeDb();
    markPaid(db, 'r1', '2026-08-05', '2026-08-20', 'Μετρητά', { receipt_url: 'x' });
    ok('η είσπραξη κρατά ό,τι τη συνοδεύει', calls[0].patch?.receipt_url === 'x');
    ok('ο καλών δεν μπορεί να παρακάμψει τη σημαία', calls[0].patch?.paid === true);
    ok('οι ημέρες υπολογίζονται και εδώ', calls[0].patch?.days_late === 15);
  }
  {
    const { db, calls } = fakeDb();
    markUnpaid(db, 'r1');
    ok('η ακύρωση καθαρίζει και τις τέσσερις', Object.keys(calls[0].patch || {}).length === 4);
  }
  {
    const { db, calls } = fakeDb();
    upsertPeriod(db, { amount: 700 });
    ok('το κλειδί σύγκρουσης έρχεται από το στρώμα', calls[0].conflict === PERIOD_KEY);
  }
  {
    const { db, calls } = fakeDb();
    removeOfTenant(db, 't1');
    ok('η διαγραφή μισθωτή σβήνει τις δόσεις ΤΟΥ', calls[0].del === true && calls[0].eq[0][0] === 'tenant_id');
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ rent: ${pass} έλεγχοι πέρασαν` : `✗ rent: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
