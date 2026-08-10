// npx tsx lib/data/checklist.test.ts
//
// ΔΥΟ ΚΑΝΟΝΕΣ ΠΟΥ ΗΤΑΝ ΓΡΑΜΜΕΝΟΙ ΟΚΤΩ ΦΟΡΕΣ.
// «Τι είναι ανοιχτή εκκρεμότητα» (δύο αρνήσεις στη σειρά) και «τι γράφει το
// κλείσιμο» (τρεις στήλες που πρέπει να συμφωνούν). Μία ξεχασμένη άρνηση δείχνει
// παρατημένες εργασίες ως εκκρεμείς για πάντα· μία ξεχασμένη στήλη δείχνει
// εργασία κλειστή σε μία οθόνη και ανοιχτή στην άλλη.
import {
  isOpen, CLOSED_STATUSES, doneFields, reopenFields, statusFields,
  open, openOfUser, upcoming, all, templateIds, markDone, markDoneMany, setStatus, linkEvent,
} from './checklist';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Ποια είναι ανοιχτή ────────────────────────────────────────────────────
ok('η εκκρεμής είναι ανοιχτή', isOpen({ status: 'pending' }));
ok('η σε εξέλιξη είναι ανοιχτή', isOpen({ status: 'in_progress' }));
ok('η ολοκληρωμένη ΔΕΝ είναι', !isOpen({ status: 'done' }));
// Η δεύτερη άρνηση ξεχνιόταν πιο εύκολα από την πρώτη.
ok('η παραλειφθείσα ΔΕΝ είναι', !isOpen({ status: 'skipped' }));
ok('χωρίς κατάσταση θεωρείται ανοιχτή', isOpen({}));
ok('κενή κατάσταση θεωρείται ανοιχτή', isOpen({ status: '' }));
ok('δύο κλειστές καταστάσεις, όχι μία', CLOSED_STATUSES.length === 2);

// ── Οι τρεις στήλες του κλεισίματος ───────────────────────────────────────
{
  const d = doneFields();
  ok('το κλείσιμο γράφει κατάσταση', d.status === 'done');
  ok('το κλείσιμο γράφει τη σημαία', d.completed === true);
  ok('το κλείσιμο γράφει χρόνο', typeof d.completed_at === 'string' && d.completed_at.length > 10);
  const r = reopenFields();
  ok('το ξανα-άνοιγμα καθαρίζει και τις τρεις',
    r.status === 'pending' && r.completed === false && r.completed_at === null);
  // Η ώρα είναι η ώρα ΤΗΣ ΕΝΕΡΓΕΙΑΣ, όχι της φόρτωσης: γι' αυτό συνάρτηση.
  ok('δύο κλεισίματα δεν μοιράζονται αντικείμενο', doneFields() !== doneFields());
}
{
  ok('«done» μέσω statusFields κλείνει κανονικά', statusFields('done').completed === true);
  ok('«skipped» δεν σημαίνει ολοκληρωμένη',
    statusFields('skipped').completed === false && statusFields('skipped').completed_at === null);
  ok('«pending» καθαρίζει τον χρόνο', statusFields('pending').completed_at === null);
}

// ── Ψεύτικη βάση ──────────────────────────────────────────────────────────
interface Call { columns: string; eq: [string, string][]; neq: [string, string][]; patch?: Record<string, unknown>; ins?: unknown; del?: boolean; inIds?: string[] }
function fakeDb(rows: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [], neq: [] };
      calls.push(call);
      const res = Promise.resolve({ data: rows, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: string) { call.eq.push([c, v]); return q },
        neq(c: string, v: string) { call.neq.push([c, v]); return q },
        in(_c: string, ids: string[]) { call.inIds = ids; return q },
        update(p: Record<string, unknown>) { call.patch = p; return q },
        insert(r: unknown) { call.ins = r; return q },
        delete() { call.del = true; return q },
        order() { return q },
        limit() { return res },
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
    await open(db, 'p1', 'id', 'u1');
    ok('οι ανοιχτές αποκλείουν ΚΑΙ τις δύο κλειστές καταστάσεις',
      calls[0].neq.length === 2 && calls[0].neq.some(([, v]) => v === 'done') && calls[0].neq.some(([, v]) => v === 'skipped'));
    ok('μπήκε η δεύτερη κλειδαριά του χρήστη', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
  }
  {
    const { db, calls } = fakeDb();
    await open(db, 'p1', 'id');
    ok('χωρίς χρήστη δεν μπαίνει ψεύτικο φίλτρο', !calls[0].eq.some(([c]) => c === 'user_id'));
  }
  {
    const { db, calls } = fakeDb();
    await openOfUser(db, 'u1', 'id');
    ok('το χαρτοφυλάκιο φιλτράρει χρήστη και όχι ακίνητο',
      calls[0].eq.length === 1 && calls[0].eq[0][0] === 'user_id' && calls[0].neq.length === 2);
  }
  {
    const { db, calls } = fakeDb();
    await upcoming(db, 'p1', 'id', 'u1');
    ok('η ατζέντα κρατά τον ίδιο κανόνα ανοιχτού', calls[0].neq.length === 2);
  }
  {
    const { db, calls } = fakeDb();
    await all(db, 'p1', '*', 'u1');
    ok('η πλήρης λίστα ΔΕΝ φιλτράρει κατάσταση', calls[0].neq.length === 0);
  }
  {
    const { db } = fakeDb([{ template_id: 'checkin' }, { template_id: null }, { template_id: 'legal' }]);
    const ids = await templateIds(db, 'p1', 'u1');
    ok('τα πρότυπα γυρίζουν χωρίς τα κενά', ids.size === 2 && ids.has('checkin') && ids.has('legal'));
  }
  {
    const { db, calls } = fakeDb();
    markDone(db, 't1', { actual_cost: 42 });
    ok('το κλείσιμο κρατά ό,τι το συνοδεύει', calls[0].patch?.actual_cost === 42);
    // Η ΣΕΙΡΑ ΜΕΤΡΑ: οι τρεις στήλες της κατάστασης γράφονται ΤΕΛΕΥΤΑΙΕΣ, ώστε
    // ένα λανθασμένο `status` του καλούντος να μην μπορεί να τις παρακάμψει.
    ok('η κατάσταση δεν παρακάμπτεται από τον καλούντα',
      calls[0].patch?.status === 'done' && calls[0].patch?.completed === true);
  }
  {
    const { db, calls } = fakeDb();
    markDoneMany(db, ['a', 'b']);
    ok('το μαζικό κλείσιμο είναι ΕΝΑ ερώτημα', calls.length === 1 && calls[0].inIds?.length === 2);
  }
  {
    const { db, calls } = fakeDb();
    setStatus(db, 't1', 'pending');
    ok('η επαναφορά σβήνει τον χρόνο ολοκλήρωσης', calls[0].patch?.completed_at === null);
  }
  {
    const { db, calls } = fakeDb();
    linkEvent(db, 't1', null);
    ok('η αποσύνδεση γεγονότος γράφει null', calls[0].patch?.calendar_event_id === null);
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ checklist: ${pass} έλεγχοι πέρασαν` : `✗ checklist: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
