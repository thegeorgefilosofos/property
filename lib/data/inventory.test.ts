// npx tsx lib/data/inventory.test.ts
//
// Η ΑΠΟΓΡΑΦΗ ΕΙΝΑΙ Ο ΜΟΝΟΣ ΠΙΝΑΚΑΣ ΟΠΟΥ ΤΟ `updated_at` ΤΟ ΒΑΖΕΙ Ο ΚΩΔΙΚΑΣ.
// Δεν έχει σκανδάλη `update_updated_at_column`, σε αντίθεση με είκοσι άλλους.
// Ο καλών την έβαζε όποτε θυμόταν — δύο στις τέσσερις διαδρομές — και η στήλη
// που απαντά «πότε άλλαξε αυτό» έλεγε ψέματα στις άλλες δύο.
import { ofProperty, ofUser, add, update, updateMany, remove, removeMany } from './inventory';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

interface Call { columns: string; eq: [string, unknown][]; order?: string; ins?: unknown[]; patch?: Record<string, unknown>; del?: boolean }
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
        order(c: string) { call.order = c; return res },
        insert(r: unknown[]) { call.ins = r; return res },
        update(p: Record<string, unknown>) { call.patch = p; return q },
        delete() { call.del = true; return q },
        then(...a: Parameters<Promise<unknown>['then']>) { return res.then(...a) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

async function asyncChecks() {
  // ── ΑΝΑΓΝΩΣΗ ────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb([{ name: 'Ψυγείο' }]);
    await ofProperty(db, 'p1', '*', 'u1');
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('νεότερο αντικείμενο πρώτο', calls[0].order === 'created_at');
    // Οι στήλες `property_id`/`user_id` είναι ΚΕΙΜΕΝΟ σε αυτόν τον πίνακα: μια
    // σύγκριση uuid με κείμενο δεν σκάει, γυρίζει άδειο.
    ok('το ακίνητο περνά ως κείμενο', typeof calls[0].eq[0][1] === 'string');
    ok('ο χρήστης περνά ως κείμενο', typeof calls[0].eq[1][1] === 'string');
  }
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', '*');
    ok('χωρίς χρήστη, μόνο το ακίνητο', calls[0].eq.length === 1);
  }
  {
    const { db, calls } = fakeDb();
    await ofUser(db, 'u1', 'id,name');
    ok('το χαρτοφυλάκιο φιλτράρει μόνο τον χρήστη', calls[0].eq.length === 1 && calls[0].eq[0][0] === 'user_id');
    ok('αλφαβητικά, για τις χρεώσεις φθοράς', calls[0].order === 'name');
  }

  // ── ΕΓΓΡΑΦΗ ΣΕ ΠΑΡΤΙΔΕΣ ─────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb();
    const rows = Array.from({ length: 120 }, (_, i) => ({ name: `Αντικείμενο ${i}` }));
    const { error } = await add(db, 'p1', 'u1', rows);
    ok('εκατόν είκοσι γραμμές σε τρεις παρτίδες', calls.length === 3 && !error);
    ok('η πρώτη παρτίδα έχει πενήντα', (calls[0].ins as unknown[]).length === 50);
    ok('η τελευταία έχει τις υπόλοιπες είκοσι', (calls[2].ins as unknown[]).length === 20);
    const first = (calls[0].ins as Record<string, unknown>[])[0];
    ok('το ακίνητο και ο χρήστης μπαίνουν από το στρώμα',
      first.property_id === 'p1' && first.user_id === 'u1');
  }
  {
    const { db, calls } = fakeDb([], 1);
    const { error } = await add(db, 'p1', 'u1', Array.from({ length: 120 }, () => ({ name: 'x' })));
    ok('η αποτυχία παρτίδας επιστρέφεται', !!error);
    ok('και σταματά εκεί', calls.length === 2);
  }
  {
    ok('κενή λίστα δεν στέλνει κανένα αίτημα',
      (await add(fakeDb().db, 'p1', 'u1', [])).error === null);
  }

  // ── Η ΣΦΡΑΓΙΔΑ ΧΡΟΝΟΥ ΑΝΗΚΕΙ ΣΤΗ ΒΑΣΗ ──────────────────────────────────
  // Την έγραφε εδώ, με `new Date()`: το ρολόι του περιηγητή, που μπορεί να
  // είναι λάθος ώρες ή μέρες. Τη γράφει πλέον η σκανδάλη
  // `inventory_items_updated_at` (μετανάστευση 20260819170000).
  {
    const { db, calls } = fakeDb();
    update(db, 'i1', { condition: 'Κακή' });
    updateMany(db, ['i1', 'i2'], { room: 'Κουζίνα' });
    ok('η μονή ενημέρωση δεν στέλνει σφραγίδα', !('updated_at' in (calls[0].patch ?? {})));
    ok('ούτε η μαζική', !('updated_at' in (calls[1].patch ?? {})));
    ok('η ενημέρωση δείχνει σε μία γραμμή', calls[0].eq[0][0] === 'id');
    ok('η μαζική δείχνει σε λίστα γραμμών', Array.isArray(calls[1].eq[0][1]));
  }
  {
    const { db, calls } = fakeDb();
    remove(db, 'i1');
    removeMany(db, ['i1', 'i2']);
    ok('η διαγραφή δείχνει σε μία γραμμή', calls[0].del === true && calls[0].eq[0][0] === 'id');
    ok('η μαζική διαγραφή δείχνει σε λίστα', calls[1].del === true && Array.isArray(calls[1].eq[0][1]));
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ inventory: ${pass} έλεγχοι πέρασαν` : `✗ inventory: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
