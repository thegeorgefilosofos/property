// npx tsx lib/data/tenants.test.ts
//
// ΤΟ ΕΡΩΤΗΜΑ ΠΟΥ ΕΙΧΕ ΤΕΣΣΕΡΙΣ ΑΠΑΝΤΗΣΕΙΣ.
// «Ποιος μένει τώρα στο ακίνητο;» απαντιόταν με `created_at desc`, με
// `updated_at desc`, με `neq status past`, και με τίποτα — ανάλογα με την οθόνη.
// Η βεβαίωση ενοικίου έβγαινε στο όνομα άλλου ανθρώπου από αυτόν που έδειχνε η
// Επισκόπηση, για το ίδιο ακίνητο, την ίδια στιγμή. Εδώ κλειδώνει η μία απάντηση.
import { hasLeft, sortCurrentFirst, current, currentByProperty, markPast } from './tenants';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Ποιος έχει φύγει ──────────────────────────────────────────────────────
ok('η κατάσταση past σημαίνει έφυγε', hasLeft({ status: 'past' }));
ok('η ημερομηνία αποχώρησης ΜΟΝΗ ΤΗΣ σημαίνει έφυγε',
  hasLeft({ status: 'active', move_out_date: '2026-03-01' }));
ok('ενεργός χωρίς ημερομηνία μένει', !hasLeft({ status: 'active', move_out_date: null }));
ok('άδεια γραμμή δεν θεωρείται φευγάτη', !hasLeft({}));

// ── Η ΣΕΙΡΑ ΕΙΝΑΙ Η ΕΝΑΡΞΗ ΤΗΣ ΜΙΣΘΩΣΗΣ ───────────────────────────────────
// Ο παλιός μισθωτής που διορθώθηκε χθες είναι ο πιο πρόσφατα ΕΝΗΜΕΡΩΜΕΝΟΣ —
// και δεν μένει εδώ. Αυτό ακριβώς έδειχνε η Επισκόπηση.
{
  const rows = [
    { id: 'palios', lease_start: '2023-01-01', created_at: '2023-01-01', status: 'active' },
    { id: 'neos',   lease_start: '2026-02-01', created_at: '2026-01-20', status: 'active' },
  ];
  ok('προηγείται η νεότερη μίσθωση', sortCurrentFirst(rows)[0].id === 'neos');
  ok('προηγείται ανεξάρτητα από τη σειρά εισόδου', sortCurrentFirst([...rows].reverse())[0].id === 'neos');
}
{
  const rows = [
    { id: 'efyge', lease_start: '2026-05-01', created_at: '2026-05-01', status: 'past' },
    { id: 'menei', lease_start: '2024-01-01', created_at: '2024-01-01', status: 'active' },
  ];
  ok('ο φευγάτος δεν προηγείται, ούτε με νεότερη μίσθωση', sortCurrentFirst(rows)[0].id === 'menei');
  ok('ο φευγάτος δεν επιστρέφεται καθόλου', sortCurrentFirst(rows).length === 1);
}
{
  // Χωρίς ημερομηνία έναρξης πέφτουμε στη δημιουργία: ημιτελής καταχώρηση δεν
  // βγαίνει μπροστά από πλήρη με πρόσφατη μίσθωση.
  const rows = [
    { id: 'atelis', lease_start: null, created_at: '2026-07-01', status: 'active' },
    { id: 'pliris', lease_start: '2026-08-01', created_at: '2026-01-01', status: 'active' },
  ];
  ok('η πλήρης καταχώρηση με νεότερη μίσθωση προηγείται', sortCurrentFirst(rows)[0].id === 'pliris');
}
{
  ok('κενό ακίνητο δίνει κενή λίστα', sortCurrentFirst([{ id: 'x', status: 'past' }]).length === 0);
}

// ── Ψεύτικη βάση: τι ζητιέται στην πραγματικότητα ─────────────────────────
interface Call { table: string; columns: string; filters: [string, string][] }
function fakeDb(rows: Record<string, unknown>[]) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, columns: '', filters: [] };
      calls.push(call);
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(col: string, val: string) { call.filters.push([col, val]); return q },
        order() { return Promise.resolve({ data: rows, error: null }) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

async function asyncChecks() {
  {
    const { db, calls } = fakeDb([
      { id: 'palios', full_name: 'Παλιός', status: 'active', move_out_date: '2025-12-31', lease_start: '2023-01-01', created_at: '2023-01-01' },
      { id: 'neos',   full_name: 'Νέος',   status: 'active', move_out_date: null,         lease_start: '2026-01-01', created_at: '2026-01-01' },
    ]);
    const t = await current<{ id: string; full_name: string }>(db, 'p1', 'id,full_name', 'u1');
    ok('ο τρέχων είναι αυτός που δεν έφυγε', t?.id === 'neos');
    ok('ζητήθηκε ο σωστός πίνακας', calls[0].table === 'tenants');
    ok('οι στήλες κατάστασης προστέθηκαν χωρίς να ζητηθούν',
      calls[0].columns.includes('status') && calls[0].columns.includes('move_out_date'));
    ok('η στήλη έναρξης προστέθηκε, γιατί ταξινομεί', calls[0].columns.includes('lease_start'));
    ok('καμία στήλη δύο φορές',
      new Set(calls[0].columns.split(',')).size === calls[0].columns.split(',').length);
    // Η ΔΕΥΤΕΡΗ ΚΛΕΙΔΑΡΙΑ: δέκα από τις τριάντα αναγνώσεις ζητούσαν μισθωτές με
    // σκέτο property_id, στηριγμένες μόνο στην RLS.
    ok('μπήκε και το φίλτρο χρήστη', calls[0].filters.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('μπήκε και το φίλτρο ακινήτου', calls[0].filters.some(([c, v]) => c === 'property_id' && v === 'p1'));
  }

  {
    const { db } = fakeDb([{ id: 'a', status: 'past', move_out_date: null, lease_start: '2026-01-01', created_at: '2026-01-01' }]);
    ok('κενό ακίνητο δίνει null, όχι φευγάτο μισθωτή',
      (await current(db, 'p1', 'id', 'u1')) === null);
  }

  {
    const { db } = fakeDb([
      { property_id: 'p1', id: 'a', full_name: 'Α', status: 'past',   move_out_date: null, lease_start: '2026-05-01', created_at: '2026-05-01' },
      { property_id: 'p1', id: 'b', full_name: 'Β', status: 'active', move_out_date: null, lease_start: '2024-01-01', created_at: '2024-01-01' },
      { property_id: 'p2', id: 'c', full_name: 'Γ', status: 'active', move_out_date: null, lease_start: '2026-01-01', created_at: '2026-01-01' },
    ]);
    const map = await currentByProperty<{ property_id?: string | null; id: string; status?: string | null }>(db, 'u1', 'id,full_name');
    ok('χάρτης: κάθε ακίνητο παίρνει τον δικό του τρέχοντα', map.get('p1')?.id === 'b' && map.get('p2')?.id === 'c');
    ok('χάρτης: μόνο δύο ακίνητα', map.size === 2);
  }
}
// ── Η αποχώρηση γράφει ΚΑΙ τις δύο στήλες ─────────────────────────────────
{
  let written: Record<string, unknown> = {};
  const db = { from: () => ({ update: (p: Record<string, unknown>) => { written = p; return { eq: () => ({}) } } }) } as never;
  markPast(db, 't1', '2026-08-10');
  ok('η αποχώρηση γράφει κατάσταση', written.status === 'past');
  ok('η αποχώρηση γράφει και ημερομηνία', written.move_out_date === '2026-08-10');
}

void asyncChecks().then(() => {
console.log(fail === 0 ? `✓ tenants: ${pass} έλεγχοι πέρασαν` : `✗ tenants: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
});
