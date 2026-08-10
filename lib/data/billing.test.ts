// npx tsx lib/data/billing.test.ts
//
// ΤΟ ΠΛΑΝΟ ΔΕΝ ΕΙΝΑΙ ΠΕΔΙΟ ΤΗΣ ΦΟΡΜΑΣ.
// Έξι οθόνες γράφουν στο προφίλ χρέωσης. Η μία ήξερε ότι το `plan` και το
// `billing_cycle` ανήκουν στον πάροχο πληρωμών και τα έσβηνε από το ωφέλιμο
// φορτίο με δύο `delete` και ένα σχόλιο· οι άλλες πέντε δεν το ήξεραν καθόλου.
// Η βάση φυλάει με σκανδάλη το `plan` και τα `comp_*` — αλλά ΟΧΙ το
// `billing_cycle` ούτε τα `stripe_*`.
import { profile, profileOutcome, save, serverOwnedColumns } from './billing';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

interface Call { columns: string; eq: [string, unknown][]; single?: boolean; ups?: Record<string, unknown>; opts?: { onConflict?: string } }
function fakeDb(row: Record<string, unknown> | null = null, error: { message: string } | null = null) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const res = Promise.resolve({ data: error ? null : row, error });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        maybeSingle() { call.single = true; return res },
        upsert(r: Record<string, unknown>, o: { onConflict?: string }) { call.ups = r; call.opts = o; return res },
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
    const { db, calls } = fakeDb({ plan: 'owner' });
    const p = await profile<{ plan: string }>(db, 'u1', 'plan');
    ok('επιστρέφεται η γραμμή, μία ανά χρήστη', p?.plan === 'owner');
    ok('μία γραμμή ζητείται', calls[0].single === true);
    ok('το κλειδί είναι ο χρήστης', calls[0].eq.length === 1 && calls[0].eq[0][0] === 'user_id');
  }
  {
    ok('προφίλ που δεν δημιουργήθηκε ποτέ δίνει null',
      await profile(fakeDb(null).db, 'u1', 'plan') === null);
  }
  {
    const { db, calls } = fakeDb({ plan: 'free' });
    ok('χωρίς χρήστη δεν ρωτά τη βάση',
      await profile(db, '', 'plan') === null && calls.length === 0);
  }

  // ── «ΔΕΝ ΥΠΑΡΧΕΙ» ΔΕΝ ΕΙΝΑΙ «ΑΠΕΤΥΧΕ» ─────────────────────────────────
  // Η συγκατάθεση δεδομένων κρίνεται από τη διαφορά: «ποτέ δεν ρωτήθηκε» →
  // ρώτα τον· «η ανάγνωση απέτυχε» → μη δείξεις διακόπτη που θα παραπλανήσει.
  {
    const absent = await profileOutcome(fakeDb(null).db, 'u1', 'share_market_data');
    ok('απουσία: κανένα σφάλμα, καμία γραμμή', absent.data === null && absent.error === null);
    const broken = await profileOutcome(fakeDb(null, { message: 'δίκτυο' }).db, 'u1', 'share_market_data');
    ok('αποτυχία: το σφάλμα φτάνει στον καλούντα', broken.data === null && !!broken.error);
  }

  // ── ΤΙ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΓΡΑΨΕΙ Ο ΠΕΛΑΤΗΣ ─────────────────────────────────
  {
    const { db, calls } = fakeDb();
    await save(db, 'u1', {
      full_name: 'Γιώργος', profile_type: 'professional',
      plan: 'agency', billing_cycle: 'yearly',
      comp_plan: 'owner', comp_until: '2099-01-01', comp_months_granted: 99, comp_started_at: '2020-01-01',
      stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', subscription_status: 'active',
    });
    const row = calls[0].ups!;
    ok('ό,τι ανήκει στη φόρμα περνά',
      row.full_name === 'Γιώργος' && row.profile_type === 'professional');
    for (const key of serverOwnedColumns) {
      ok(`η στήλη «${key}» δεν γράφεται από τον πελάτη`, !(key in row));
    }
    ok('ο χρήστης μπαίνει από το στρώμα', row.user_id === 'u1');
    ok('το κλειδί σύγκρουσης είναι το πρωτεύον κλειδί', calls[0].opts?.onConflict === 'user_id');
    // Ο πίνακας ΔΕΝ έχει σκανδάλη updated_at: αν δεν το γράψει ο κώδικας, η
    // στήλη μένει στην τιμή της προηγούμενης φοράς.
    ok('η σφραγίδα χρόνου μπαίνει πάντα', typeof row.updated_at === 'string');
  }
  {
    // Η αρχική εγγραφή του `user_id` δεν παρακάμπτεται από ωφέλιμο φορτίο.
    const { db, calls } = fakeDb();
    await save(db, 'u1', { user_id: 'u2', full_name: 'Άλλος' });
    ok('ο χρήστης του ωφέλιμου φορτίου δεν υπερισχύει', calls[0].ups?.user_id === 'u1');
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ billing: ${pass} έλεγχοι πέρασαν` : `✗ billing: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
