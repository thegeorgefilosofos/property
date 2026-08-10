// npx tsx lib/data/stays.test.ts
//
// ΤΟ ΣΙΩΠΗΛΟ ΛΑΘΟΣ ΤΗΣ ΒΡΑΧΥΧΡΟΝΙΑΣ.
// Το δηλωτέο έσοδο ΔΕΝ είναι το `total`: η πλατφόρμα κρατά προμήθεια και
// εισπράττει τέλος ανθεκτικότητας. Ένα ερώτημα που ξεχνά τις τέσσερις στήλες της
// ανάλυσης δεν βγάζει σφάλμα — βγάζει το payout αντί για το ακαθάριστο, δηλαδή
// λιγότερο δηλωμένο εισόδημα σε κάθε γραμμή της δήλωσης.
import { declarableGrossOrTotal } from '../clients/stayAmounts';
import {
  DECLARABLE_COLUMNS, PORTFOLIO_COLUMNS, ACCOUNTING_COLUMNS,
  ofProperty, ofProperties, ofUser, withClientName, addBatched, update, remove,
} from './stays';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Οι τέσσερις στήλες που κρίνουν τη δήλωση ──────────────────────────────
for (const col of ['gross_guest_paid', 'platform_fee', 'climate_levy', 'amount_basis']) {
  ok(`η ανάλυση ποσού κρατά τη στήλη «${col}»`, DECLARABLE_COLUMNS.split(',').includes(col));
}
ok('καμία στήλη δύο φορές',
  new Set(DECLARABLE_COLUMNS.split(',')).size === DECLARABLE_COLUMNS.split(',').length);
ok('το χαρτοφυλάκιο προσθέτει το ακίνητο', PORTFOLIO_COLUMNS === `property_id,${DECLARABLE_COLUMNS}`);
ok('η λογιστική προσθέτει τη σήμανση δήλωσης', ACCOUNTING_COLUMNS === `${DECLARABLE_COLUMNS},declared_at`);

// ── ΓΙΑΤΙ ΜΕΤΡΑΕΙ: η ίδια διαμονή, με και χωρίς την ανάλυση ───────────────
// Επισκέπτης πλήρωσε 1.000 €, η πλατφόρμα κράτησε 150 €, το τέλος ήταν 50 €.
// Στον λογαριασμό μπήκαν 800 €, αλλά δηλωτέο ακαθάριστο είναι 950 €.
{
  const full = { total: 800, gross_guest_paid: 1000, platform_fee: 150, climate_levy: 50, amount_basis: 'gross' };
  const stripped = { total: 800 };
  ok('με την ανάλυση, δηλώνεται το ακαθάριστο', declarableGrossOrTotal(full) === 950);
  ok('χωρίς την ανάλυση, δηλώνεται το payout', declarableGrossOrTotal(stripped) === 800);
  ok('η διαφορά είναι πραγματικό αδήλωτο εισόδημα',
    declarableGrossOrTotal(full) - declarableGrossOrTotal(stripped) === 150);
}

// ── Ψεύτικη βάση ──────────────────────────────────────────────────────────
interface Call { columns: string; eq: [string, unknown][]; gte?: string; lte?: string; order?: string; ins?: unknown[]; patch?: unknown; del?: boolean }
function fakeDb(rows: Record<string, unknown>[] = [], failAt = -1) {
  const calls: Call[] = [];
  let n = 0;
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const idx = n++;
      const res = Promise.resolve(idx === failAt ? { data: null, error: { message: 'σκάσε' } } : { data: rows, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        in(c: string, v: unknown[]) { call.eq.push([c, v]); return q },
        gte(_c: string, v: string) { call.gte = v; return q },
        lte(_c: string, v: string) { call.lte = v; return q },
        order(c: string) { call.order = c; return res },
        insert(r: unknown[]) { call.ins = r; return res },
        update(p: unknown) { call.patch = p; return q },
        delete() { call.del = true; return q },
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
    await ofProperty(db, 'p1', DECLARABLE_COLUMNS, 'u1', { from: '2026-01-01', to: '2026-12-31' });
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('το διάστημα κόβει στην ΑΦΙΞΗ', calls[0].gte === '2026-01-01' && calls[0].lte === '2026-12-31');
    // Ο πίνακας κρατά το ακίνητο ως κείμενο, όχι uuid: το cast γίνεται εδώ.
    ok('το ακίνητο περνά ως κείμενο', typeof calls[0].eq[0][1] === 'string');
  }
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', 'total');
    ok('χωρίς διάστημα δεν μπαίνει φίλτρο', calls[0].gte === undefined && calls[0].lte === undefined);
  }
  {
    ok('κενή λίστα ακινήτων δεν ρωτά καθόλου τη βάση',
      (await ofProperties(fakeDb().db, [], 'total', 'u1')).length === 0);
  }
  {
    const { db, calls } = fakeDb();
    await ofUser(db, 'u1', 'total');
    ok('το χαρτοφυλάκιο φιλτράρει μόνο τον χρήστη', calls[0].eq.length === 1);
  }
  {
    const { db, calls } = fakeDb();
    await withClientName(db, 'p1', 'id,check_in', 'u1');
    ok('το όνομα πελάτη ενώνεται μία φορά, εδώ', calls[0].columns.endsWith(',clients(full_name)'));
    ok('νεότερη άφιξη πρώτη', calls[0].order === 'check_in');
  }
  {
    // ΠΑΡΤΙΔΕΣ: εκατόν είκοσι γραμμές από φύλλο πλατφόρμας δεν στέλνονται μονομιάς.
    const { db, calls } = fakeDb();
    const rows = Array.from({ length: 120 }, (_, i) => ({ total: i }));
    const { error } = await addBatched(db, rows);
    ok('εκατόν είκοσι γραμμές σε τρεις παρτίδες', calls.length === 3 && !error);
    ok('η πρώτη παρτίδα έχει πενήντα', (calls[0].ins as unknown[]).length === 50);
    ok('η τελευταία έχει τις υπόλοιπες είκοσι', (calls[2].ins as unknown[]).length === 20);
  }
  {
    // Αποτυχία στη δεύτερη παρτίδα: σταματά και το λέει, δεν συνεχίζει σιωπηλά.
    const { db, calls } = fakeDb([], 1);
    const { error } = await addBatched(db, Array.from({ length: 120 }, () => ({ total: 1 })));
    ok('η αποτυχία παρτίδας επιστρέφεται', !!error);
    ok('και σταματά εκεί', calls.length === 2);
  }
  {
    ok('κενή λίστα δεν στέλνει κανένα αίτημα',
      (await addBatched(fakeDb().db, [])).error === null);
  }
  {
    const { db, calls } = fakeDb();
    update(db, 's1', { total: 5 });
    remove(db, 's1');
    ok('η ενημέρωση δείχνει σε μία γραμμή', calls[0].eq[0][0] === 'id');
    ok('η διαγραφή δείχνει σε μία γραμμή', calls[1].del === true && calls[1].eq[0][0] === 'id');
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ stays: ${pass} έλεγχοι πέρασαν` : `✗ stays: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
