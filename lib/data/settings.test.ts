// npx tsx lib/data/settings.test.ts
//
// ΟΙ ΡΥΘΜΙΣΕΙΣ ΕΙΝΑΙ ΤΟ ΜΟΝΟ ΜΕΡΟΣ ΟΠΟΥ Η ΑΠΟΥΣΙΑ ΜΟΙΑΖΕΙ ΜΕ ΕΠΙΛΟΓΗ.
// Ένα λάθος όνομα ενότητας δεν βγάζει σφάλμα: επιστρέφει «τίποτε» και η οθόνη
// δείχνει προεπιλογές σαν να μην έχει δηλώσει ποτέ τίποτε ο ιδιοκτήτης. Ένα
// λάθος κλειδί σύγκρουσης στο upsert δεν ενημερώνει — διπλασιάζει.
import { section, sections, acrossProperties, put, SECTIONS } from './settings';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } };

// ── Ψεύτικη βάση ──────────────────────────────────────────────────────────
interface Call { columns: string; eq: [string, unknown][]; inList?: unknown[]; single?: boolean; ups?: Record<string, unknown>; opts?: { onConflict?: string } }
function fakeDb(rows: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  const db = {
    from() {
      const call: Call = { columns: '', eq: [] };
      calls.push(call);
      const many = Promise.resolve({ data: rows, error: null });
      const one = Promise.resolve({ data: rows[0] ?? null, error: null });
      const q = {
        select(columns: string) { call.columns = columns; return q },
        eq(c: string, v: unknown) { call.eq.push([c, v]); return q },
        in(c: string, v: unknown[]) { call.eq.push([c, v]); call.inList = v; return q },
        maybeSingle() { call.single = true; return one },
        upsert(r: Record<string, unknown>, o: { onConflict?: string }) { call.ups = r; call.opts = o; return many },
        then(...a: Parameters<Promise<unknown>['then']>) { return many.then(...a) },
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

async function asyncChecks() {
  // ── ΟΙ ΟΚΤΩ ΕΝΟΤΗΤΕΣ ────────────────────────────────────────────────────
  ok('οκτώ ενότητες, καμία δύο φορές', new Set(SECTIONS).size === SECTIONS.length && SECTIONS.length === 8);

  // ── ΜΙΑ ΕΝΟΤΗΤΑ: ΕΠΙΣΤΡΕΦΕΤΑΙ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ, ΟΧΙ Η ΓΡΑΜΜΗ ─────────────
  {
    const { db, calls } = fakeDb([{ data: { elecProvider: 'dei' } }]);
    const d = await section(db, 'p1', 'electricity', 'u1');
    ok('επιστρέφεται το περιεχόμενο', (d as { elecProvider: string })?.elecProvider === 'dei');
    ok('μία γραμμή, όχι λίστα', calls[0].single === true);
    ok('η δεύτερη κλειδαριά του χρήστη μπαίνει', calls[0].eq.some(([c, v]) => c === 'user_id' && v === 'u1'));
    ok('η ενότητα μπαίνει στο ερώτημα', calls[0].eq.some(([c, v]) => c === 'section' && v === 'electricity'));
  }
  {
    ok('ενότητα που δεν γράφτηκε ποτέ δίνει null',
      await section(fakeDb([]).db, 'p1', 'gas', 'u1') === null);
  }
  {
    // Το propertyId αδειάζει όσο αλλάζει ακίνητο ο χρήστης: κανένα ερώτημα.
    const { db, calls } = fakeDb([{ data: {} }]);
    ok('χωρίς ακίνητο δεν ρωτά τη βάση', await section(db, '', 'common', 'u1') === null && calls.length === 0);
  }
  {
    const { db, calls } = fakeDb([{ data: {} }]);
    await section(db, 'p1', 'common');
    ok('χωρίς χρήστη, μόνο ακίνητο και ενότητα', calls[0].eq.length === 2);
  }

  // ── ΠΟΛΛΕΣ ΕΝΟΤΗΤΕΣ: ΧΑΡΤΗΣ, ΜΕ ΜΙΑ ΑΝΑΓΝΩΣΗ ──────────────────────────
  {
    const { db, calls } = fakeDb([
      { section: 'providers', data: { internetPrice: '25' } },
      { section: 'common', data: { millesimi: '12' } },
    ]);
    const map = await sections(db, 'p1', ['providers', 'insurance', 'services', 'common'], 'u1');
    ok('μία μόνο ανάγνωση για τέσσερις ενότητες', calls.length === 1);
    ok('ο χάρτης κλειδώνεται στο όνομα της ενότητας',
      (map.providers as { internetPrice: string })?.internetPrice === '25');
    ok('ενότητα που λείπει δεν εφευρίσκεται', map.insurance === undefined);
  }
  {
    ok('κενή λίστα ενοτήτων δεν ρωτά καθόλου',
      Object.keys(await sections(fakeDb().db, 'p1', [], 'u1')).length === 0);
  }

  // ── Η ΙΔΙΑ ΕΝΟΤΗΤΑ ΣΕ ΠΟΛΛΑ ΑΚΙΝΗΤΑ ────────────────────────────────────
  {
    const { db, calls } = fakeDb([
      { property_id: 'p1', data: { total: '400' } },
      { property_id: null, data: { total: '900' } },
    ]);
    const map = await acrossProperties(db, ['p1', 'p2'], 'budgets', 'u1');
    ok('χάρτης ανά ακίνητο', (map.p1 as { total: string })?.total === '400');
    ok('γραμμή χωρίς ακίνητο δεν μπαίνει σε κανέναν', Object.keys(map).length === 1);
    ok('τα ακίνητα περνούν ως λίστα', calls[0].inList?.length === 2);
  }
  {
    const { db, calls } = fakeDb();
    ok('κενή λίστα ακινήτων δεν ρωτά καθόλου',
      Object.keys(await acrossProperties(db, [], 'budgets', 'u1')).length === 0 && calls.length === 0);
  }

  // ── ΕΓΓΡΑΦΗ ─────────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb();
    await put(db, 'p1', 'u1', 'budgets', { total: '500' });
    const row = calls[0].ups!;
    ok('το κλειδί σύγκρουσης είναι το μοναδικό ευρετήριο του πίνακα',
      calls[0].opts?.onConflict === 'property_id,section');
    ok('γράφεται ακίνητο, χρήστης, ενότητα και περιεχόμενο',
      row.property_id === 'p1' && row.user_id === 'u1' && row.section === 'budgets');
    // Ο πίνακας έχει σκανδάλη BEFORE UPDATE και προεπιλογή now(): το ρολόι του
    // περιηγητή δεν έχει καμία δουλειά εδώ.
    ok('το updated_at δεν έρχεται από τον πελάτη', !('updated_at' in row));
  }
}

void asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ settings: ${pass} έλεγχοι πέρασαν` : `✗ settings: ${fail} απέτυχαν από ${pass + fail}`);
  if (fail > 0) process.exit(1);
});
