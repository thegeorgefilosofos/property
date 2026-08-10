// npx tsx lib/data/documents.test.ts
//
// Η ΑΜΥΝΑ ΓΙΑ ΣΤΗΛΗ ΠΟΥ ΛΕΙΠΕΙ ΗΤΑΝ ΓΡΑΜΜΕΝΗ ΤΕΣΣΕΡΙΣ ΦΟΡΕΣ, ΚΑΙ ΤΙΣ ΤΕΣΣΕΡΙΣ
// ΑΛΛΙΩΣ. Η χειρότερη εκδοχή —των Εκκρεμοτήτων— πετούσε ΚΑΙ ΤΙΣ ΠΕΝΤΕ νέες
// στήλες με το πρώτο σφάλμα: αν έλειπε μόνο το `issue_date`, το παραστατικό
// αρχειοθετούνταν χωρίς ποσό, χωρίς ΑΦΜ και χωρίς περίοδο — δηλαδή χωρίς τίποτα
// από όσα το κάνουν απόδειξη αντί για εικόνα.
import { ofProperty, ofSupplier, ofSupplierAfm, count, add, update, remove, removeMany, OPTIONAL_COLUMNS } from './documents';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

interface Call { columns: string; eq: [string, unknown][]; order?: string; limit?: number; head?: boolean; ins?: Record<string, unknown>; patch?: Record<string, unknown>; del?: boolean }
/** Ψεύτικη βάση που «δεν έχει» κάποιες στήλες: το insert σκάει με το όνομά τους. */
function fakeDb(opts: { rows?: Record<string, unknown>[]; missing?: string[]; count?: number; readError?: boolean } = {}) {
  const calls: Call[] = [];
  const missing = opts.missing ?? [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const reject = (p: Record<string, unknown>) => missing.find(c => c in p);
      const readRes = Promise.resolve(
        opts.readError ? { data: null, error: { message: 'άγνωστη στήλη' }, count: null }
          : { data: opts.rows ?? [], error: null, count: opts.count ?? 0 });
      let payload: Record<string, unknown> = {};
      const q = {
        select(columns: string, o?: { head?: boolean }) { call.columns = columns; call.head = o?.head; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        in(c: string, v: unknown[]) { call.eq.push([c, v]); return q },
        order(c: string) { call.order = c; return q },
        limit(n: number) { call.limit = n; return readRes },
        single() {
          const bad = reject(payload);
          return Promise.resolve(bad
            ? { data: null, error: { message: `column "${bad}" of relation "property_documents" does not exist` } }
            : { data: { id: 'd1' }, error: null });
        },
        insert(r: Record<string, unknown>) { payload = r; call.ins = r; return q },
        update(p: Record<string, unknown>) {
          payload = p; call.patch = p;
          const bad = reject(p);
          return { in(c: string, v: unknown[]) { call.eq.push([c, v]); return Promise.resolve(bad ? { data: null, error: { message: `column "${bad}" does not exist` } } : { data: null, error: null }) } };
        },
        delete() { call.del = true; return q },
        then(...a: Parameters<Promise<unknown>['then']>) { return readRes.then(...a) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

// Το ωφέλιμο φορτίο ενός σαρωμένου λογαριασμού ΔΕΗ: πέντε νέες στήλες μαζί.
const RICH = {
  kind: 'document', category: 'Λογαριασμός', title: 'ΔΕΗ Ιουνίου', file_path: 'p/1.pdf',
  supplier: 'ΔΕΗ', amount: 84.31, provider_afm: '090000045',
  period_from: '2026-06-01', period_to: '2026-06-30', issue_date: '2026-07-05',
};

async function asyncChecks() {
  ok('έξι προαιρετικές στήλες, καμία δύο φορές',
    new Set(OPTIONAL_COLUMNS).size === OPTIONAL_COLUMNS.length && OPTIONAL_COLUMNS.length === 6);

  // ── ΜΙΑ ΣΤΗΛΗ ΤΗ ΦΟΡΑ, ΟΧΙ ΟΛΕΣ ΜΑΖΙ ───────────────────────────────────
  {
    const { db, calls } = fakeDb({ missing: ['issue_date'] });
    const { id, error } = await add(db, 'p1', 'u1', RICH);
    ok('το παραστατικό καταχωρείται παρά τη στήλη που λείπει', id === 'd1' && !error);
    const written = calls[calls.length - 1].ins!;
    ok('έφυγε μόνο η στήλη που έλειπε', !('issue_date' in written));
    ok('το ποσό ΕΜΕΙΝΕ', written.amount === 84.31);
    ok('το ΑΦΜ εκδότη ΕΜΕΙΝΕ', written.provider_afm === '090000045');
    ok('η περίοδος ΕΜΕΙΝΕ', written.period_from === '2026-06-01' && written.period_to === '2026-06-30');
    ok('χρειάστηκαν δύο προσπάθειες, όχι έξι', calls.length === 2);
  }
  {
    // Βάση χωρίς κανένα από το migration: αφαιρούνται μία-μία, το χαρτί σώζεται.
    const { db, calls } = fakeDb({ missing: ['amount', 'provider_afm', 'period_from', 'period_to', 'issue_date'] });
    const { id, error } = await add(db, 'p1', 'u1', RICH);
    ok('ακόμη και χωρίς καμία νέα στήλη, το αρχείο δεν χάνεται', id === 'd1' && !error);
    ok('ο τίτλος και η διαδρομή του αρχείου έμειναν',
      calls[calls.length - 1].ins!.title === 'ΔΕΗ Ιουνίου' && calls[calls.length - 1].ins!.file_path === 'p/1.pdf');
  }
  {
    // Σφάλμα που ΔΕΝ αφορά προαιρετική στήλη δεν καταπίνεται με επαναλήψεις.
    const { db, calls } = fakeDb({ missing: ['file_path'] });
    const { id, error } = await add(db, 'p1', 'u1', RICH);
    ok('άσχετο σφάλμα επιστρέφεται αμέσως', id === null && !!error && calls.length === 1);
  }
  {
    const { db, calls } = fakeDb();
    await add(db, 'p1', 'u1', { title: 'Χωρίς τίποτα' });
    ok('το ακίνητο και ο χρήστης μπαίνουν από το στρώμα',
      calls[0].ins?.property_id === 'p1' && calls[0].ins?.user_id === 'u1');
  }

  // ── Η ΙΔΙΑ ΑΜΥΝΑ ΚΑΙ ΣΤΗ ΔΙΟΡΘΩΣΗ ──────────────────────────────────────
  {
    const { db, calls } = fakeDb({ missing: ['provider_afm'] });
    const { error } = await update(db, ['d1', 'd2'], { title: 'Νέος τίτλος', provider_afm: '123456789' });
    ok('η διόρθωση περνά χωρίς τη στήλη που λείπει', !error);
    ok('ο τίτλος διορθώθηκε', calls[calls.length - 1].patch?.title === 'Νέος τίτλος');
  }
  {
    const { db, calls } = fakeDb();
    await update(db, [], { title: 'x' });
    ok('κενή λίστα δεν στέλνει αίτημα', calls.length === 0);
  }

  // ── ΑΝΑΓΝΩΣΗ ────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb({ rows: [{ id: 'd1' }] });
    await ofProperty(db, 'p1', '*', 'u1');
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('νεότερο έγγραφο πρώτο', calls[0].order === 'created_at');
  }
  {
    const { db, calls } = fakeDb({ rows: [{ id: 'd1' }] });
    await ofSupplier(db, 'p1', 'tenant:t1', 'id,file_name', 'u1');
    ok('ο αντισυμβαλλόμενος μπαίνει στο ερώτημα',
      calls[0].eq.some(([c, v]) => c === 'supplier' && v === 'tenant:t1'));
  }
  {
    // Χωρίς τη στήλη `provider_afm` το ερώτημα σκάει ολόκληρο: η οθόνη δείχνει
    // «κανένα παραστατικό», όχι σφάλμα.
    ok('βάση χωρίς τη στήλη ΑΦΜ δίνει κενό, όχι σφάλμα',
      (await ofSupplierAfm(fakeDb({ readError: true }).db, 'p1', '090000045', 'id')).length === 0);
  }
  {
    const { db, calls } = fakeDb({ count: 7 });
    ok('το πλήθος μετριέται χωρίς να κατέβει γραμμή',
      await count(db, 'p1', 'u1') === 7 && calls[0].head === true);
  }

  // ── ΔΙΑΓΡΑΦΗ ────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb();
    remove(db, 'd1');
    removeMany(db, ['d1', 'd2']);
    ok('η διαγραφή δείχνει σε μία γραμμή', calls[0].del === true && calls[0].eq[0][0] === 'id');
    ok('η μαζική διαγραφή δείχνει σε λίστα', calls[1].del === true && Array.isArray(calls[1].eq[0][1]));
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ documents: ${pass} έλεγχοι πέρασαν` : `✗ documents: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
