// npx tsx lib/data/bills.test.ts
//
// Ο ΛΟΓΑΡΙΑΣΜΟΣ ΕΙΝΑΙ ΤΟ ΠΡΟΓΡΑΜΜΑ, Η ΔΑΠΑΝΗ ΤΟ ΓΕΓΟΝΟΣ.
// Οι ίδιες εννέα στήλες ζητιόνταν από πέντε οθόνες με πέντε διαφορετικές σειρές,
// και δύο τις έδιναν κατευθείαν στον κοινό πυρήνα του ημερολογίου. Μια ξεχασμένη
// στήλη εκεί δεν βγάζει σφάλμα: βγάζει «undefined», που γίνεται μηδέν, που
// γίνεται «φθηνό ακίνητο».
import {
  LEDGER_COLUMNS, PORTFOLIO_COLUMNS, paidFields,
  ofProperty, ofProperties, ofUser, one, kwhHistory, add, markPaid,
} from './bills';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Οι στήλες που διαβάζει ο κοινός πυρήνας ───────────────────────────────
// Αν λείψει μία από αυτές, το ημερολόγιο δαπανών βγάζει λάθος σύνολο σε τρεις
// οθόνες ταυτόχρονα, χωρίς κανένα σφάλμα.
for (const col of ['id', 'name', 'category', 'amount', 'paid', 'paid_at', 'due_date', 'recurring', 'created_at']) {
  ok(`το ημερολόγιο παίρνει τη στήλη «${col}»`, LEDGER_COLUMNS.split(',').includes(col));
}
ok('καμία στήλη δύο φορές',
  new Set(LEDGER_COLUMNS.split(',')).size === LEDGER_COLUMNS.split(',').length);
ok('το χαρτοφυλάκιο προσθέτει το ακίνητο',
  PORTFOLIO_COLUMNS === `${LEDGER_COLUMNS},property_id`);

// ── Το «πληρώθηκε» ────────────────────────────────────────────────────────
{
  const f = paidFields();
  ok('η πληρωμή σηκώνει τη σημαία', f.paid === true);
  ok('η πληρωμή γράφει χρόνο', typeof f.paid_at === 'string' && f.paid_at.length > 10);
  ok('δύο πληρωμές δεν μοιράζονται αντικείμενο', paidFields() !== paidFields());
}

// ── Ψεύτικη βάση ──────────────────────────────────────────────────────────
interface Call { columns: string; eq: [string, unknown][]; gte?: string; not?: boolean; order?: string; limit?: number; patch?: Record<string, unknown>; ins?: Record<string, unknown> }
function fakeDb(rows: Record<string, unknown>[] = [], single: Record<string, unknown> | null = null) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const res = Promise.resolve({ data: rows, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        in() { return q },
        gte(_c: string, v: string) { call.gte = v; return q },
        not() { call.not = true; return q },
        order(c: string) { call.order = c; return q },
        limit(n: number) { call.limit = n; return res },
        update(p: Record<string, unknown>) { call.patch = p; return q },
        insert(p: Record<string, unknown>) { call.ins = p; return q },
        maybeSingle() { return Promise.resolve({ data: single, error: null }) },
        single() { return res },
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
    await ofProperty(db, 'p1', LEDGER_COLUMNS, 'u1', { paid: false, category: 'electricity', since: '2026-01-01' });
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('το απλήρωτο φιλτράρεται στη βάση', calls[0].eq.some(([c, v]) => c === 'paid' && v === false));
    ok('η κατηγορία φιλτράρεται στη βάση', calls[0].eq.some(([c, v]) => c === 'category' && v === 'electricity'));
    ok('η ημερομηνία έναρξης φιλτράρεται στη βάση', calls[0].gte === '2026-01-01');
  }
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', 'id');
    ok('χωρίς επιλογές, μόνο το ακίνητο', calls[0].eq.length === 1 && calls[0].eq[0][0] === 'property_id');
    // ΤΟ «ΠΛΗΡΩΜΕΝΟ ΨΕΥΔΕΣ» ΔΕΝ ΕΙΝΑΙ «ΧΩΡΙΣ ΦΙΛΤΡΟ»: αν το undefined γινόταν
    // false, κάθε οθόνη θα έδειχνε μόνο τους απλήρωτους.
    ok('το «χωρίς φίλτρο πληρωμής» δεν γίνεται «απλήρωτοι»', !calls[0].eq.some(([c]) => c === 'paid'));
  }
  {
    ok('κενή λίστα ακινήτων δεν ρωτά καθόλου τη βάση',
      (await ofProperties(fakeDb().db, [], 'id', 'u1')).length === 0);
  }
  {
    const { db, calls } = fakeDb();
    await ofUser(db, 'u1', 'id');
    ok('το χαρτοφυλάκιο φιλτράρει μόνο τον χρήστη',
      calls[0].eq.length === 1 && calls[0].eq[0][0] === 'user_id');
  }
  {
    ok('λογαριασμός που δεν υπάρχει δίνει null',
      (await one(fakeDb([], null).db, 'b1', 'id')) === null);
  }
  {
    const { db, calls } = fakeDb();
    await kwhHistory(db, 'p1', 'kwh,created_at', 'u1');
    // ΧΩΡΙΣ ΣΕΙΡΑ, «οι τελευταίες δώδεκα μετρήσεις» ήταν δώδεκα τυχαίες — και από
    // αυτές έβγαινε η σύγκριση κατανάλωσης.
    ok('οι μετρήσεις έρχονται με σειρά', calls[0].order === 'created_at');
    ok('μόνο οι γραμμές με μέτρηση', calls[0].not === true);
    ok('μόνο το ρεύμα', calls[0].eq.some(([c, v]) => c === 'category' && v === 'electricity'));
    ok('δώδεκα, όχι όλες', calls[0].limit === 12);
  }
  {
    const { db, calls } = fakeDb();
    add(db, 'p1', 'u1', { name: 'ΔΕΗ', property_id: 'ΞΕΝΟ' });
    // Το ακίνητο και ο χρήστης μπαίνουν ΤΕΛΕΥΤΑΙΟΙ: ο καλών δεν μπορεί να
    // γράψει γραμμή σε ξένο ακίνητο ούτε κατά λάθος.
    ok('το ακίνητο έρχεται από το στρώμα', calls[0].ins?.property_id === 'p1');
    ok('ο χρήστης έρχεται από το στρώμα', calls[0].ins?.user_id === 'u1');
  }
  {
    const { db, calls } = fakeDb();
    markPaid(db, 'b1');
    ok('η πληρωμή γράφει και τις δύο στήλες', Object.keys(calls[0].patch || {}).length === 2);
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ bills: ${pass} έλεγχοι πέρασαν` : `✗ bills: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
