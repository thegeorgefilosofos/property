// npx tsx lib/data/plan.test.ts
//
// ΤΟ ΣΧΗΜΑ ΤΟΥ `jsonb` ΔΕΝ ΤΟ ΕΓΓΥΑΤΑΙ Η ΒΑΣΗ.
// Τρεις στήλες του σχεδίου είναι `jsonb`: η βάση δέχεται ό,τι της δώσεις και
// επιστρέφει ό,τι βρήκε. Μια γραμμή από παλιότερη έκδοση, ή γραμμένη με το χέρι,
// φτάνει στην οθόνη ως `undefined.map` και σπάει ΟΛΟΚΛΗΡΗ την καρτέλα. Οι
// έλεγχοι εδώ κρατούν το σύνορο: ό,τι βγαίνει από το `shape` έχει το σχήμα που
// υπόσχεται ο τύπος του.
import { shape, readDone, readCosts, save, read, EMPTY_PLAN, COLUMNS } from './plan';
import type { SupabaseClient } from '@supabase/supabase-js';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Ο χάρτης των βημάτων ──────────────────────────────────────────────────
ok('κενή γραμμή δίνει άδειο σχέδιο', shape(null).done && Object.keys(shape(null).done).length === 0);
ok('η άδεια γραμμή λέει «με μεσίτη»', shape(null).useAgent === true);
ok('ο χάρτης κρατά τα βήματα ανά κατάσταση',
  readDone({ vacant: ['a', 'b'], renovating: ['c'] }).vacant.length === 2);
ok('δύο καταστάσεις μένουν δύο', Object.keys(readDone({ vacant: ['a'], renovating: ['c'] })).length === 2);
// Το `null` μέσα στον πίνακα δεν σκάει, αλλά μετριέται ως ολοκληρωμένο βήμα.
ok('τα μη κείμενα φεύγουν από τον πίνακα',
  readDone({ vacant: ['a', null, 3, '', 'b'] }).vacant.join(',') === 'a,b');
ok('κατάσταση χωρίς έγκυρα βήματα δεν κρατιέται',
  readDone({ vacant: [null, 2] }).vacant === undefined);
ok('πίνακας αντί για χάρτη δίνει άδειο', Object.keys(readDone(['a', 'b'])).length === 0);
ok('συμβολοσειρά αντί για χάρτη δίνει άδειο', Object.keys(readDone('vacant')).length === 0);
ok('το null δίνει άδειο χάρτη', Object.keys(readDone(null)).length === 0);
ok('τιμή που δεν είναι πίνακας αγνοείται',
  Object.keys(readDone({ vacant: 'a', renovating: ['c'] })).join(',') === 'renovating');

// ── Τα πάγια του κενού μήνα ───────────────────────────────────────────────
ok('τα ποσά περνούν', readCosts({ enfiaYear: 210, commonMonthly: 45 }).enfiaYear === 210);
ok('το μηδέν είναι ποσό', readCosts({ enfiaYear: 0 }).enfiaYear === 0);
// «NaN €» μέσα σε άθροισμα δεν διορθώνεται από πουθενά.
ok('το NaN δεν είναι ποσό', readCosts({ enfiaYear: NaN }).enfiaYear === undefined);
ok('το άπειρο δεν είναι ποσό', readCosts({ enfiaYear: Infinity }).enfiaYear === undefined);
ok('η συμβολοσειρά δεν είναι ποσό', readCosts({ enfiaYear: '210' }).enfiaYear === undefined);
ok('το null δίνει άδεια πάγια', Object.keys(readCosts(null)).length === 0);

// ── Η γραμμή ολόκληρη ─────────────────────────────────────────────────────
{
  const s = shape({
    done_steps: { vacant: ['title_clear'] },
    dispute_kind: 'rent_arrears',
    vacancy_costs: { enfiaYear: 210 },
    use_agent: false,
  });
  ok('το είδος εκκρεμότητας περνά', s.disputeKind === 'rent_arrears');
  ok('η επιλογή «μόνος σου» περνά', s.useAgent === false);
  ok('τα βήματα περνούν', s.done.vacant?.[0] === 'title_clear');
  ok('τα πάγια περνούν', s.vacancyCosts.enfiaYear === 210);
}
// ΤΟ `use_agent` ΕΧΕΙ ΠΡΟΕΠΙΛΟΓΗ «ΝΑΙ». Το `Boolean(undefined)` θα άλλαζε το
// καθαρό ποσό της οθόνης σε γραμμή που απλώς δεν το έχει γράψει ακόμη.
ok('χωρίς τιμή, «με μεσίτη»', shape({ done_steps: {} }).useAgent === true);
ok('μη λογική τιμή δεν γίνεται ψευδής', shape({ use_agent: 'no' } as never).useAgent === true);
ok('το είδος που δεν είναι κείμενο γίνεται null', shape({ dispute_kind: 7 } as never).disputeKind === null);
ok('το άδειο σχέδιο λέει «με μεσίτη»', EMPTY_PLAN.useAgent === true);

// ── Τα ερωτήματα ──────────────────────────────────────────────────────────
type Call = { columns?: string; eq?: [string, string][]; up?: Record<string, unknown>; onConflict?: string };
function fakeDb(row: Record<string, unknown> | null = null, error: { message: string } | null = null) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { eq: [] };
      calls.push(call);
      const res = Promise.resolve({ data: row, error });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: string) { call.eq!.push([c, v]); return q },
        upsert(u: Record<string, unknown>, o?: { onConflict?: string }) { call.up = u; call.onConflict = o?.onConflict; return q },
        maybeSingle() { return res },
        then(...a: Parameters<Promise<unknown>['then']>) { return res.then(...a) },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

async function asyncChecks() {
  {
    const { db, calls } = fakeDb();
    const r = await read(db, 'p1');
    ok('η ανάγνωση φιλτράρει στο ακίνητο', calls[0].eq?.[0]?.[0] === 'property_id');
    ok('η ανάγνωση ζητά τις τέσσερις στήλες', calls[0].columns === COLUMNS);
    ok('γραμμή που δεν υπάρχει δίνει άδειο σχέδιο', Object.keys(r.plan.done).length === 0);
    ok('γραμμή που δεν υπάρχει ΔΕΝ είναι σφάλμα', r.error === null);
  }
  {
    // ΤΟ «ΔΕΝ ΞΕΡΩ» ΔΕΝ ΕΙΝΑΙ «ΔΕΝ ΥΠΑΡΧΕΙ». Χωρίς αυτό, η οθόνη θα έγραφε το
    // άδειο πάνω σε υπαρκτό σχέδιο και ο χρήστης θα έχανε ό,τι είχε τσεκάρει.
    const { db } = fakeDb(null, { message: 'δίκτυο' });
    const r = await read(db, 'p1');
    ok('η αποτυχημένη ανάγνωση το λέει', r.error === 'δίκτυο');
    ok('η αποτυχημένη ανάγνωση δεν προσποιείται σχέδιο', Object.keys(r.plan.done).length === 0);
  }
  {
    const { db, calls } = fakeDb();
    save(db, 'p1', 'u1', { done: { vacant: ['a'] }, disputeKind: null, vacancyCosts: {}, useAgent: false });
    // Χωρίς `onConflict` η δεύτερη αποθήκευση θα έσκαγε σε διπλό κλειδί.
    ok('η εγγραφή συγκρούεται στο ακίνητο', calls[0].onConflict === 'property_id');
    ok('η εγγραφή γράφει ποιος την έκανε', calls[0].up?.user_id === 'u1');
    ok('η εγγραφή στέλνει ΟΛΟ τον χάρτη', JSON.stringify(calls[0].up?.done_steps) === '{"vacant":["a"]}');
    ok('η εγγραφή στέλνει την επιλογή μεσίτη', calls[0].up?.use_agent === false);
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ data/plan: ${pass} έλεγχοι πέρασαν` : `✗ data/plan: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
