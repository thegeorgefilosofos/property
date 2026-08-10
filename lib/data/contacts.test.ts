// npx tsx lib/data/contacts.test.ts
//
// Ο ΦΑΚΕΛΟΣ ΤΩΝ ΣΗΜΕΙΩΣΕΩΝ ΗΤΑΝ ΓΡΑΜΜΕΝΟΣ ΔΥΟ ΦΟΡΕΣ.
// Η επαφή έχει τριάντα πεδία και ο πίνακας εννέα στήλες: ΑΦΜ, IBAN, ετικέτες,
// ραντεβού και εμβέλεια ζουν μέσα στη στήλη `notes`, σε φάκελο `{__v,extra,
// notes}`. Η καρτέλα Επαφές τον παρήγαγε με συνάρτηση, η σάρωση εγγράφου με
// `JSON.stringify` στο χέρι. Την ημέρα που ο φάκελος γίνει `__v: 3`, η σάρωση
// θα γράφει ακόμη `__v: 2` και οι επαφές της θα ανοίγουν άδειες.
import { decodeNotes, encodeNotes, ofUser, ofProperty, withRole, add, addReturningId, update, remove, removeMany } from './contacts';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

interface Call { columns: string; eq: [string, unknown][]; order?: string; limit?: number; ins?: Record<string, unknown>; patch?: unknown; del?: boolean; single?: boolean }
function fakeDb(rows: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const res = Promise.resolve({ data: rows, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        in(c: string, v: unknown[]) { call.eq.push([c, v]); return q },
        order(c: string, o?: { ascending?: boolean }) { call.order = `${c}:${o?.ascending !== false ? 'asc' : 'desc'}`; return q },
        limit(n: number) { call.limit = n; return res },
        single() { call.single = true; return res },
        insert(r: Record<string, unknown>) { call.ins = r; return q },
        update(p: unknown) { call.patch = p; return q },
        delete() { call.del = true; return q },
        then(...a: Parameters<Promise<unknown>['then']>) { return res.then(...a) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

// ── Ο ΦΑΚΕΛΟΣ: ΠΗΓΑΙΝΕ ΚΑΙ ΕΛΑ ──────────────────────────────────────────────
{
  const raw = encodeNotes({ afm: '123456789', tags: ['στεγανώσεις'] }, 'Δουλεύει Σαββατοκύριακα');
  const back = decodeNotes(raw);
  ok('το ΑΦΜ επιβιώνει της διαδρομής', back.extra.afm === '123456789');
  ok('οι ετικέτες επιβιώνουν', Array.isArray(back.extra.tags));
  ok('το ελεύθερο κείμενο επιβιώνει', back.notes === 'Δουλεύει Σαββατοκύριακα');
  ok('η έκδοση γράφεται μέσα στον φάκελο', JSON.parse(raw).__v === 2);
}
{
  // ΠΑΛΙΑ ΕΠΑΦΗ: σκέτο κείμενο, πριν υπάρξει φάκελος. Δεν είναι σφάλμα.
  const back = decodeNotes('Τον σύστησε ο διαχειριστής');
  ok('παλιό σκέτο κείμενο μένει σημείωση', back.notes === 'Τον σύστησε ο διαχειριστής');
  ok('και δεν εφευρίσκει πεδία', Object.keys(back.extra).length === 0);
}
{
  ok('κενή στήλη δεν σκάει', decodeNotes(null).notes === '' && decodeNotes(undefined).notes === '');
  // Άκυρο JSON σημαίνει «σημείωση που έτυχε να μοιάζει με κώδικα», όχι κατάρρευση.
  ok('άκυρο JSON μένει κείμενο', decodeNotes('{ολόκληρο').notes === '{ολόκληρο');
  // Άλλη έκδοση φακέλου: δεν διαβάζεται με τους κανόνες της δικής μας.
  ok('φάκελος άλλης έκδοσης δεν αποδομείται',
    Object.keys(decodeNotes(JSON.stringify({ __v: 99, extra: { afm: 'x' } })).extra).length === 0);
}

async function asyncChecks() {
  // ── ΑΝΑΓΝΩΣΗ ────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb([{ full_name: 'Γιώργος' }]);
    await ofUser(db, 'u1', 'id,full_name');
    ok('το χαρτοφυλάκιο φιλτράρει μόνο τον χρήστη', calls[0].eq.length === 1 && calls[0].eq[0][0] === 'user_id');
    ok('αλφαβητικά, εξ ορισμού', calls[0].order === 'full_name:asc');
  }
  {
    const { db, calls } = fakeDb();
    await ofUser(db, 'u1', '*', { orderBy: 'created_at', ascending: false, limit: 100 });
    ok('η σειρά και το όριο περνούν', calls[0].order === 'created_at:desc' && calls[0].limit === 100);
  }
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', 'id,full_name', 'u1');
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
  }
  {
    const { db, calls } = fakeDb();
    await ofProperty(db, 'p1', 'id,full_name');
    ok('χωρίς χρήστη, μόνο το ακίνητο', calls[0].eq.length === 1);
  }

  // ── ΕΝΑΣ ΡΟΛΟΣ, ΜΙΑ ΚΛΗΣΗ ───────────────────────────────────────────────
  {
    const { db, calls } = fakeDb([{ full_name: 'Ενοικιαστής', phone: '69' }]);
    const t = await withRole<{ full_name: string }>(db, 'p1', 'tenant', 'full_name,phone,email', 'u1');
    ok('επιστρέφεται η γραμμή, όχι λίστα', t?.full_name === 'Ενοικιαστής');
    ok('ο ρόλος μπαίνει στο ερώτημα', calls[0].eq.some(([c, v]) => c === 'role' && v === 'tenant'));
    ok('μία γραμμή ζητείται από τη βάση', calls[0].limit === 1);
  }
  {
    ok('ρόλος που δεν υπάρχει δίνει null',
      await withRole(fakeDb([]).db, 'p1', 'tenant', 'full_name', 'u1') === null);
  }

  // ── ΕΓΓΡΑΦΗ ─────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb();
    await add(db, 'p1', 'u1', { full_name: 'Υδραυλικός', role: 'plumber' });
    ok('το ακίνητο και ο χρήστης μπαίνουν από το στρώμα',
      calls[0].ins?.property_id === 'p1' && calls[0].ins?.user_id === 'u1');
  }
  {
    const { db, calls } = fakeDb([{ id: 'c9' }]);
    await addReturningId(db, 'p1', 'u1', { full_name: 'Ηλεκτρολόγος' });
    ok('το κλειδί επιστρέφεται όταν ζητηθεί', calls[0].single === true && calls[0].columns === 'id');
  }
  {
    const { db, calls } = fakeDb();
    update(db, 'c1', { phone: '2101234567' });
    remove(db, 'c1');
    removeMany(db, ['c1', 'c2']);
    ok('η ενημέρωση δείχνει σε μία γραμμή', calls[0].eq[0][0] === 'id');
    ok('η διαγραφή δείχνει σε μία γραμμή', calls[1].del === true && calls[1].eq[0][0] === 'id');
    ok('η μαζική διαγραφή δείχνει σε λίστα', calls[2].del === true && Array.isArray(calls[2].eq[0][1]));
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ contacts: ${pass} έλεγχοι πέρασαν` : `✗ contacts: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
