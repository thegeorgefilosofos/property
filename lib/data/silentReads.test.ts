// npx tsx lib/data/silentReads.test.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΗΔΕΝ ΠΟΥ ΔΕΝ ΕΙΝΑΙ ΜΗΔΕΝ
// ─────────────────────────────────────────────────────────────────────────
// Το PostgREST απαντά πάντα `{ data, error }`. Οταν το ερώτημα αποτύχει, το
// `data` είναι `null` — και το στρώμα το μετέτρεπε σε `[]`, ακριβώς όπως όταν
// δεν υπάρχουν γραμμές. Οι δύο περιπτώσεις γίνονταν μία.
//
// Στις περισσότερες οθόνες αυτό είναι ανεκτό: μια άδεια λίστα δαπανών είναι
// άδεια λίστα δαπανών. Στη Λογιστική δεν είναι: εκεί το ίδιο κενό γίνεται
// «μηδέν έσοδα, μηδέν δαπάνες», δηλαδή λάθος φορολογητέο εισόδημα και λάθος
// φόρος — σε οθόνη που παράγει Ε2, βεβαίωση ενοικίου και φάκελο λογιστή, με
// αριθμό εγγράφου και κωδικό επαλήθευσης.
//
// Οι τρεις αναγνώσεις που χτίζουν εκείνη την εικόνα έχουν πλέον εκδοχή που
// επιστρέφει το σφάλμα. Εδώ ελέγχεται ότι το ΕΠΙΣΤΡΕΦΟΥΝ ΠΡΑΓΜΑΤΙΚΑ, γιατί
// μια συνάρτηση που λέγεται `WithError` και γυρίζει πάντα `null` είναι
// χειρότερη από καμία: δίνει την εντύπωση ότι κάποιος ελέγχει.
// ═══════════════════════════════════════════════════════════════════════════
import { ledgerWithError } from './expenses';
import { ofPropertyWithError as rentWithError } from './rent';
import { ofPropertyWithError as staysWithError } from './stays';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

/** Ψεύτικη αλυσίδα PostgREST: κάθε φίλτρο επιστρέφει τον εαυτό της. */
function fakeDb(answer: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'or', 'order', 'limit', 'in', 'is']) {
    chain[m] = () => chain;
  }
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chain } as any;
}

const FAIL = { data: null, error: { message: 'Η σύνδεση χάθηκε', code: 'PGRST301' } };
const EMPTY = { data: [], error: null };
const ROWS = { data: [{ amount: 100 }], error: null };

async function run() {

// ── ΟΙ ΔΑΠΑΝΕΣ ────────────────────────────────────────────────────────────
{
  const bad = await ledgerWithError(fakeDb(FAIL), 'p1');
  ok('η αποτυχία των δαπανών επιστρέφεται', bad.error?.code === 'PGRST301');
  ok('και οι γραμμές μένουν άδειες, χωρίς εξαίρεση', bad.rows.length === 0);

  const empty = await ledgerWithError(fakeDb(EMPTY), 'p1');
  ok('το άδειο δεν είναι σφάλμα', empty.error === null && empty.rows.length === 0);
  // ΑΥΤΟ ΕΙΝΑΙ ΤΟ ΟΛΟ ΝΟΗΜΑ: οι δύο περιπτώσεις ξεχωρίζουν.
  ok('το άδειο ξεχωρίζει από την αποτυχία', (bad.error === null) !== (empty.error === null));

  const full = await ledgerWithError(fakeDb(ROWS), 'p1');
  ok('οι γραμμές περνούν ανέπαφες', full.rows.length === 1 && full.error === null);
}

// ── ΤΑ ΕΝΟΙΚΙΑ ────────────────────────────────────────────────────────────
{
  const bad = await rentWithError(fakeDb(FAIL), 'p1', 'amount', 'u1');
  ok('η αποτυχία των ενοικίων επιστρέφεται', bad.error?.code === 'PGRST301');
  const empty = await rentWithError(fakeDb(EMPTY), 'p1', 'amount', 'u1');
  ok('το άδειο ενοίκιο δεν είναι σφάλμα', empty.error === null);
}

// ── ΟΙ ΔΙΑΜΟΝΕΣ ───────────────────────────────────────────────────────────
{
  const bad = await staysWithError(fakeDb(FAIL), 'p1', 'id', 'u1');
  ok('η αποτυχία των διαμονών επιστρέφεται', bad.error?.code === 'PGRST301');
  const empty = await staysWithError(fakeDb(EMPTY), 'p1', 'id', 'u1');
  ok('η άδεια διαμονή δεν είναι σφάλμα', empty.error === null);
}

}

run().then(() => {
  console.log(fail ? `✗ silentReads: ${fail} απέτυχαν από ${pass + fail}` : `✓ silentReads: ${pass} έλεγχοι πέρασαν`);
  if (fail) process.exit(1);
});

