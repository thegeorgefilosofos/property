// npx tsx lib/calendar/deadlines.test.ts
import { deadlineItems, type DeadlineSources } from './deadlines';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

const base: DeadlineSources = {
  properties: [{ id: 'p1', name: 'Αλεξάνδρας 12' }],
  events: [], tasks: [], bills: [], rent: [],
  from: '2026-08-01', to: '2027-08-01',
};
const titles = (s: DeadlineSources) => deadlineItems(s).map(i => i.title);
const uids = (s: DeadlineSources) => deadlineItems(s).map(i => i.uid);

// ── Οι τέσσερις πηγές ──────────────────────────────────────────────────────
const full: DeadlineSources = {
  ...base,
  events: [{ id: 'e1', property_id: 'p1', title: 'Συντήρηση καυστήρα', event_date: '2026-10-10' }],
  tasks: [{ id: 't1', property_id: 'p1', description: 'Αλλαγή κλειδαριάς', due_date: '2026-09-20' }],
  bills: [{ id: 'b1', property_id: 'p1', name: 'ΔΕΗ', amount: 87.45, due_date: '2026-09-05', paid: false }],
  rent: [{ id: 'r1', property_id: 'p1', amount: 450, due_date: '2026-09-01', paid: false }],
};
eq(deadlineItems(full).length, 4, 'και οι τέσσερις πηγές δίνουν γεγονός');
eq(titles(full).join('|'), 'Ενοίκιο|ΔΕΗ|Αλλαγή κλειδαριάς|Συντήρηση καυστήρα', 'με σειρά ημερομηνίας');
eq(uids(full).join('|'), 'rent-r1@properwise|bill-b1@properwise|task-t1@properwise|event-e1@properwise', 'κάθε πηγή έχει δικό της πρόθεμα');
ok(deadlineItems(full)[1].note === '87,45 €', 'το ποσό μπαίνει ως σημείωση, με δύο δεκαδικά');

// ── Ο,τι τελείωσε δεν ταξιδεύει ────────────────────────────────────────────
eq(deadlineItems({ ...full, bills: [{ ...full.bills[0], paid: true }] }).length, 3,
  'Ο ΠΛΗΡΩΜΕΝΟΣ ΛΟΓΑΡΙΑΣΜΟΣ ΔΕΝ ΕΙΝΑΙ ΥΠΕΝΘΥΜΙΣΗ');
eq(deadlineItems({ ...full, rent: [{ ...full.rent[0], paid: true }] }).length, 3,
  'ούτε η εισπραγμένη δόση');
for (const status of ['done', 'completed', 'cancelled', 'DONE']) {
  eq(deadlineItems({ ...full, events: [{ ...full.events[0], status }] }).length, 3,
    `γεγονός σε κατάσταση «${status}» δεν ταξιδεύει`);
}
eq(deadlineItems({ ...full, events: [{ ...full.events[0], status: 'planned' }] }).length, 4,
  'το προγραμματισμένο ταξιδεύει');

// ── Το παράθυρο ────────────────────────────────────────────────────────────
eq(deadlineItems({ ...full, from: '2026-09-10', to: '2027-08-01' }).length, 2, 'ό,τι είναι πριν το παράθυρο μένει έξω');
eq(deadlineItems({ ...full, from: '2026-08-01', to: '2026-09-05' }).length, 2, 'και ό,τι είναι μετά');
eq(deadlineItems({ ...full, from: '2026-09-05', to: '2026-09-05' }).length, 1, 'τα άκρα μετράνε μέσα');

// ── Χωρίς ημερομηνία, χωρίς τίτλο: δεν είναι γεγονός ───────────────────────
eq(deadlineItems({ ...base, tasks: [{ id: 't2', description: 'Χωρίς προθεσμία', due_date: null }] }).length, 0,
  'εκκρεμότητα χωρίς προθεσμία δεν μπαίνει σε ημερολόγιο');
eq(deadlineItems({ ...base, bills: [{ id: 'b2', amount: 10, due_date: '2026-09-05', paid: false }] }).length, 0,
  'ΛΟΓΑΡΙΑΣΜΟΣ ΧΩΡΙΣ ΟΝΟΜΑ ΚΑΙ ΧΩΡΙΣ ΤΥΠΟ ΔΕΝ ΓΙΝΕΤΑΙ «(χωρίς τίτλο)»');
eq(deadlineItems({ ...base, bills: [{ id: 'b3', type: 'electricity', amount: 10, due_date: '2026-09-05', paid: false }] })[0].title,
  'electricity', 'με τύπο και χωρίς όνομα, ο τύπος');
eq(deadlineItems({ ...base, events: [{ id: 'e2', title: '  ', event_date: '2026-09-05' }] }).length, 0,
  'κενός τίτλος δεν είναι τίτλος');
eq(deadlineItems({ ...base, events: [{ id: 'e3', title: 'Κάτι', event_date: 'αύριο' }] }).length, 0,
  'ημερομηνία που δεν είναι ημερομηνία');

// ── Το όνομα του ακινήτου ──────────────────────────────────────────────────
ok(!titles(full)[0].includes('Αλεξάνδρας'), 'ΜΕ ΕΝΑ ΑΚΙΝΗΤΟ ΤΟ ΟΝΟΜΑ ΔΕΝ ΛΕΓΕΤΑΙ: το ξέρει ήδη');
const two: DeadlineSources = {
  ...full,
  properties: [{ id: 'p1', name: 'Αλεξάνδρας 12' }, { id: 'p2', name: 'Πατησίων 4' }],
  bills: [
    { id: 'b1', property_id: 'p1', name: 'ΔΕΗ', amount: 87.45, due_date: '2026-09-05', paid: false },
    { id: 'b2', property_id: 'p2', name: 'ΔΕΗ', amount: 31.10, due_date: '2026-09-06', paid: false },
  ],
  events: [], tasks: [], rent: [],
};
eq(titles(two).join('|'), 'ΔΕΗ · Αλεξάνδρας 12|ΔΕΗ · Πατησίων 4',
  'ΜΕ ΠΟΛΛΑ ΑΚΙΝΗΤΑ ΤΟ ΟΝΟΜΑ ΕΙΝΑΙ ΑΠΑΡΑΙΤΗΤΟ: αλλιώς δύο ίδιες γραμμές');
eq(deadlineItems({ ...two, properties: [{ id: 'p1', name: 'Αλεξάνδρας 12' }, { id: 'p2', name: '' }] })[1].title,
  'ΔΕΗ', 'ακίνητο χωρίς όνομα δεν προσθέτει σκουπίδι');

// ── Το uid δεν κρέμεται από το περιεχόμενο ─────────────────────────────────
const moved: DeadlineSources = { ...full, bills: [{ ...full.bills[0], amount: 99.99, due_date: '2026-09-12' }] };
eq(deadlineItems(moved).find(i => i.uid.startsWith('bill-'))!.uid, 'bill-b1@properwise',
  'ΑΛΛΑΞΕ ΠΟΣΟ ΚΑΙ ΗΜΕΡΟΜΗΝΙΑ, ΤΟ UID ΕΜΕΙΝΕ: το ημερολόγιο μετακινεί, δεν διπλασιάζει');

// ── Η σειρά είναι σταθερή ──────────────────────────────────────────────────
eq(JSON.stringify(deadlineItems(full)), JSON.stringify(deadlineItems(full)),
  'δύο εκτελέσεις δίνουν το ίδιο ακριβώς αποτέλεσμα');
const shuffled: DeadlineSources = { ...full, bills: [...full.bills], rent: [...full.rent] };
eq(JSON.stringify(deadlineItems(shuffled)), JSON.stringify(deadlineItems(full)), 'και η σειρά δεν κρέμεται από τη σειρά εισόδου');

// ── Τίποτα δεν γράφεται πίσω ───────────────────────────────────────────────
const before = JSON.stringify(full);
deadlineItems(full);
eq(JSON.stringify(full), before, 'οι γραμμές που δόθηκαν μένουν άθικτες');

console.log(`\ncalendar/deadlines.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
