// npx tsx components/dbWrite.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΙΣΙΟΔΟΞΙΑ ΕΧΕΙ ΝΟΗΜΑ ΜΟΝΟ ΑΝ Η ΕΠΑΝΑΦΟΡΑ ΕΙΝΑΙ ΒΕΒΑΙΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο φόβος με τις αισιόδοξες ενημερώσεις είναι ΕΝΑΣ: το κουτάκι μένει
// τσεκαρισμένο ενώ ο διακομιστής είπε όχι. Ο χρήστης φεύγει, γυρίζει και το
// βρίσκει άδειο — και από εκεί και πέρα δεν εμπιστεύεται τίποτα στην οθόνη.
// Καθε δοκιμή εδώ υπάρχει γι' αυτό ακριβώς.
// ═══════════════════════════════════════════════════════════════════════════
import { optimistic } from './dbWrite';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } };

const errors: string[] = [];
// Το `notifyError` γράφει σε παράθυρο· εδώ δεν υπάρχει DOM, οπότε το μήνυμα
// πιάνεται από το ίδιο το κανάλι που θα το έδειχνε.
type G = typeof globalThis & { __poToast?: (m: string) => void };
(globalThis as G).__poToast = (m: string) => errors.push(m);

const run = async () => {
  // ── Επιτυχία: εφαρμόζεται μία φορά, δεν επανέρχεται ποτέ ────────────────
  {
    const box = { value: false }; let applied = 0, reverted = 0;
    const okRes = await optimistic('Δεν αποθηκεύτηκε',
      () => { box.value = true; applied++ },
      () => { box.value = false; reverted++ },
      Promise.resolve({ error: null }));
    ok('επιτυχία: επιστρέφει true', okRes === true);
    ok('επιτυχία: η τιμή έμεινε αλλαγμένη', box.value === true);
    ok('επιτυχία: εφαρμόστηκε ακριβώς μία φορά', applied === 1);
    ok('επιτυχία: ΔΕΝ έγινε επαναφορά', reverted === 0);
  }

  // ── Αποτυχία του διακομιστή: η οθόνη γυρίζει πίσω ───────────────────────
  {
    const box = { value: false };
    const res = await optimistic('Δεν αποθηκεύτηκε',
      () => { box.value = true },
      () => { box.value = false },
      Promise.resolve({ error: { message: 'permission denied' } }));
    ok('αποτυχία: επιστρέφει false', res === false);
    ok('αποτυχία: Η ΟΘΟΝΗ ΕΠΑΝΗΛΘΕ', box.value === false);
  }

  // ── Δίκτυο που έπεσε: ο πελάτης ΠΕΤΑ, δεν επιστρέφει σφάλμα ─────────────
  {
    const box = { value: false };
    const res = await optimistic('Δεν αποθηκεύτηκε',
      () => { box.value = true },
      () => { box.value = false },
      Promise.reject(new Error('Failed to fetch')) as PromiseLike<{ error: null }>);
    ok('δίκτυο: επιστρέφει false', res === false);
    ok('δίκτυο: Η ΟΘΟΝΗ ΕΠΑΝΗΛΘΕ ΚΑΙ ΕΔΩ', box.value === false);
  }

  // ── Η σειρά: εφαρμόζεται ΠΡΙΝ φύγει το αίτημα, όχι μετά ─────────────────
  {
    const order: string[] = [];
    await optimistic('Δεν αποθηκεύτηκε',
      () => order.push('apply'),
      () => order.push('revert'),
      { then: (r) => { order.push('query'); return Promise.resolve({ error: null }).then(r) } } as PromiseLike<{ error: null }>);
    ok('η οθόνη κουνιέται ΠΡΙΝ το δίκτυο', order[0] === 'apply');
  }

  console.log(fail === 0 ? `dbWrite: ✓ ${pass}` : `dbWrite: ✓ ${pass} · ✗ ${fail}`);
  if (fail > 0) process.exit(1);
};
void run();
