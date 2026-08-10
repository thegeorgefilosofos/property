// npx tsx lib/data/loans.test.ts
//
// ΤΟ ΣΙΩΠΗΛΟ ΛΑΘΟΣ ΤΩΝ ΔΑΝΕΙΩΝ.
// Ο πίνακας ΔΕΝ έχει στήλες `amount` και `rate`. Μια γραμμή που φτάνει ωμή στην
// οθόνη δίνει `undefined` και για τα δύο, το `Number(undefined)||0` τα κάνει
// μηδέν, και το δάνειο εξαφανίζεται: καμία δόση στο ημερολόγιο, κανένας τόκος
// στη Λογιστική, και ΚΑΝΕΝΑ σφάλμα πουθενά. Γι' αυτό η μετατροπή δεν είναι
// επιλογή του καλούντα — γίνεται μέσα στο στρώμα, πριν βγει η γραμμή.
import { ofProperty, ofUser, hasActive, add, update, remove, LOAN_COLUMNS } from './loans';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Ψεύτικη βάση ──────────────────────────────────────────────────────────
interface Call { columns: string; eq: [string, unknown][]; order?: string; ins?: unknown; patch?: unknown; del?: boolean }
function fakeDb(rows: Record<string, unknown>[] = [], failing = false) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const res = Promise.resolve(failing ? { data: null, error: { code: '42P01', message: 'σκάσε' } } : { data: rows, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        order(c: string) { call.order = c; return res },
        insert(r: unknown) { call.ins = r; return res },
        update(p: unknown) { call.patch = p; return q },
        delete() { call.del = true; return q },
        then(...a: Parameters<Promise<unknown>['then']>) { return res.then(...a) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

// Ένα σταθερό, ένα κυμαινόμενο και ένα κλειστό δάνειο — όπως ΠΡΑΓΜΑΤΙΚΑ
// αποθηκεύονται: `loan_amount`, `fixed_rate`, `euribor` + `spread`.
const ROWS = [
  { id: 'l1', loan_amount: 100000, rate_type: 'fixed', fixed_rate: 3.4, years: 20, status: 'active' },
  { id: 'l2', loan_amount: 50000, rate_type: 'variable', euribor: 2.5, spread: 1.2, years: 15, status: null },
  { id: 'l3', loan_amount: 80000, rate_type: 'fixed', fixed_rate: 4.1, years: 10, status: 'closed' },
];

async function asyncChecks() {
  // ── Η ΜΕΤΑΤΡΟΠΗ ΔΕΝ ΠΑΡΑΛΕΙΠΕΤΑΙ ────────────────────────────────────────
  {
    const { db, calls } = fakeDb(ROWS);
    const views = await ofProperty(db, 'p1', 'u1');
    ok('ζητούνται οι στήλες που υπάρχουν στον πίνακα', calls[0].columns === LOAN_COLUMNS);
    ok('καμία στήλη «amount» ή «rate» στο ερώτημα',
      !/\bamount\b/.test(calls[0].columns) && !/\brate\b/.test(calls[0].columns));
    ok('το ποσό βγαίνει από το loan_amount', views[0].amount === 100000);
    ok('το σταθερό επιτόκιο περνά αυτούσιο', views[0].rate === 3.4);
    ok('το κυμαινόμενο είναι Euribor συν περιθώριο', views[1].rate === 3.7);
    ok('νεότερο δάνειο πρώτο', calls[0].order === 'created_at');
  }

  // ── ΤΟ ΦΙΛΤΡΟ ΤΟΥ ΧΡΗΣΤΗ ────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb(ROWS);
    await ofProperty(db, 'p1', 'u1');
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
  }
  {
    const { db, calls } = fakeDb(ROWS);
    await ofProperty(db, 'p1');
    ok('χωρίς χρήστη, μόνο το ακίνητο', calls[0].eq.length === 1 && calls[0].eq[0][0] === 'property_id');
  }
  {
    const { db, calls } = fakeDb(ROWS);
    await ofUser(db, 'u1');
    ok('το χαρτοφυλάκιο φιλτράρει μόνο τον χρήστη',
      calls[0].eq.length === 1 && calls[0].eq[0][0] === 'user_id');
  }

  // ── ΠΟΙΟ ΔΑΝΕΙΟ ΕΙΝΑΙ ΕΝΕΡΓΟ: ΕΝΑΣ ΚΑΝΟΝΑΣ, ΟΧΙ ΤΕΣΣΕΡΙΣ ────────────────
  // Τέσσερις οθόνες έγραφαν μόνες τους `status!=='closed' && status!=='inactive'`.
  // Ο κανόνας ζει στο lib/loans/shape.ts: ενεργό είναι ό,τι δεν σημάνθηκε αλλιώς.
  {
    const { db } = fakeDb(ROWS);
    const active = await ofProperty(db, 'p1', 'u1', { activeOnly: true });
    ok('το κλειστό δάνειο μένει έξω', active.length === 2 && !active.some(l => l.id === 'l3'));
    ok('το δάνειο χωρίς κατάσταση μετράει ως ενεργό', active.some(l => l.id === 'l2'));
  }
  {
    ok('υπάρχει ενεργό δάνειο', await hasActive(fakeDb(ROWS).db, 'p1', 'u1') === true);
    ok('μόνο κλειστά σημαίνει κανένα ενεργό',
      await hasActive(fakeDb([ROWS[2]]).db, 'p1', 'u1') === false);
    ok('κανένα δάνειο σημαίνει κανένα ενεργό', await hasActive(fakeDb([]).db, 'p1') === false);
  }

  // ── Η ΑΠΟΤΥΧΙΑ: ΣΙΩΠΗ ΓΙΑ ΤΙΣ ΟΘΟΝΕΣ, ΕΞΑΙΡΕΣΗ ΓΙΑ ΤΟΝ ΣΥΓΧΡΟΝΙΣΜΟ ─────
  // Ο συγχρονισμός του ημερολογίου ανακοινώνει «Ν δόσεις». Αν η ανάγνωση
  // αποτύχει σιωπηλά, ανακοινώνει «μηδέν» — δηλαδή λέει ψέματα.
  {
    ok('η οθόνη δείχνει άδειο σε αποτυχία',
      (await ofProperty(fakeDb([], true).db, 'p1', 'u1')).length === 0);
    let threw = false;
    try { await ofProperty(fakeDb([], true).db, 'p1', 'u1', { strict: true }) } catch { threw = true }
    ok('ο συγχρονισμός μαθαίνει την αποτυχία', threw);
  }

  // ── ΕΓΓΡΑΦΗ ─────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb();
    add(db, 'p1', 'u1', { loan_amount: 120000 });
    const ins = calls[0].ins as Record<string, unknown>;
    ok('το ακίνητο και ο χρήστης μπαίνουν από το στρώμα',
      ins.property_id === 'p1' && ins.user_id === 'u1' && ins.loan_amount === 120000);
  }
  {
    const { db, calls } = fakeDb();
    update(db, 'l1', { status: 'closed' });
    remove(db, 'l1');
    ok('η ενημέρωση δείχνει σε μία γραμμή', calls[0].eq.length === 1 && calls[0].eq[0][0] === 'id');
    ok('η διαγραφή δείχνει σε μία γραμμή', calls[1].del === true && calls[1].eq[0][0] === 'id');
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ loans: ${pass} έλεγχοι πέρασαν` : `✗ loans: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
