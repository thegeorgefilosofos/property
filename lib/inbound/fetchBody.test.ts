// npx tsx lib/inbound/fetchBody.test.ts
import { fetchBody, receivingUrl, API_ROOT, KEY_ENV } from './fetchBody';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

const KEY = 're_test_key';
const ID = 'a1b2c3d4-0000-4000-8000-000000000001';

/** Ενας πάροχος που απαντά ό,τι του πούμε και θυμάται πώς τον ρώτησαν. */
function stub(answer: { status?: number; json?: unknown; throws?: boolean; bad?: boolean }) {
  const seen: { url?: string; auth?: string } = {};
  const fetcher = (async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.url = String(url);
    seen.auth = init?.headers?.Authorization;
    if (answer.throws) throw new Error('δίκτυο');
    return {
      ok: (answer.status ?? 200) < 400,
      status: answer.status ?? 200,
      json: async () => { if (answer.bad) throw new Error('όχι JSON'); return answer.json; },
    };
  }) as unknown as typeof fetch;
  return { fetcher, seen };
}

// ΟΛΟΙ ΟΙ ΕΛΕΓΧΟΙ ΜΕΣΑ ΣΕ ΑΣΥΓΧΡΟΝΗ ΣΥΝΑΡΤΗΣΗ. Ο εκτελεστής των δοκιμών τρέχει
// τα αρχεία ως CommonJS, όπου το `await` στο ανώτατο επίπεδο δεν μεταγλωττίζεται.
void (async () => {

// ── Η διεύθυνση και το κλειδί ──────────────────────────────────────────────
ok(API_ROOT === 'https://api.resend.com', 'η ρίζα του παρόχου γράφεται μία φορά');
ok(KEY_ENV === 'RESEND_API_KEY', 'το κλειδί έχει σταθερό όνομα μεταβλητής');
ok(receivingUrl(ID) === `${API_ROOT}/emails/receiving/${ID}`, 'η διαδρομή του μηνύματος');
ok(receivingUrl('a/../b').includes('a%2F..%2Fb'), 'ΤΟ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΚΩΔΙΚΟΠΟΙΕΙΤΑΙ: δεν φτιάχνει άλλη διαδρομή');

// ── Η καλή περίπτωση ───────────────────────────────────────────────────────
const good = stub({ json: { id: ID, text: 'Πληρωτέο ποσό 87,45 €', html: '<p>Πληρωτέο</p>' } });
const r = await fetchBody(ID, KEY, good.fetcher);
ok(r.ok === true, 'το σώμα ήρθε');
ok(r.ok && r.body.text === 'Πληρωτέο ποσό 87,45 €', 'το απλό κείμενο');
ok(r.ok && r.body.html === '<p>Πληρωτέο</p>', 'το HTML');
ok(good.seen.auth === `Bearer ${KEY}`, 'το κλειδί ταξιδεύει ως Bearer');
ok(good.seen.url === receivingUrl(ID), 'ρωτήθηκε η σωστή διεύθυνση');

// ── Κενά και κενά που μοιάζουν με κείμενο ──────────────────────────────────
const empty = await fetchBody(ID, KEY, stub({ json: { text: '   ', html: null } }).fetcher);
ok(empty.ok && empty.body.text === null, 'κείμενο με μόνο κενά δεν είναι κείμενο');
const numeric = await fetchBody(ID, KEY, stub({ json: { text: 42, html: [] } }).fetcher);
ok(numeric.ok && numeric.body.text === null && numeric.body.html === null, 'ό,τι δεν είναι κείμενο γίνεται τίποτα');

// ── Οι αποτυχίες, καθεμία με τον λόγο της ──────────────────────────────────
const noKey = await fetchBody(ID, '', stub({ json: {} }).fetcher);
ok(noKey.ok === false, 'ΧΩΡΙΣ ΚΛΕΙΔΙ ΔΕΝ ΡΩΤΑΜΕ ΚΑΝ');
const noKeyStub = stub({ json: {} });
await fetchBody(ID, undefined, noKeyStub.fetcher);
ok(noKeyStub.seen.url === undefined, 'και δεν φεύγει αίτημα χωρίς κλειδί');
const denied = await fetchBody(ID, KEY, stub({ status: 401 }).fetcher);
ok(denied.ok === false && denied.reason.includes('401'), 'το 401 του παρόχου λέγεται με τον αριθμό του');
const gone = await fetchBody(ID, KEY, stub({ status: 404 }).fetcher);
ok(gone.ok === false && gone.reason.includes('404'), 'το 404 επίσης');
const down = await fetchBody(ID, KEY, stub({ throws: true }).fetcher);
ok(down.ok === false && !down.reason.includes('δίκτυο'), 'ΤΟ ΜΗΝΥΜΑ ΤΟΥ ΣΦΑΛΜΑΤΟΣ ΔΕΝ ΤΑΞΙΔΕΥΕΙ ΠΡΟΣ ΤΑ ΕΞΩ');
const junk = await fetchBody(ID, KEY, stub({ bad: true }).fetcher);
ok(junk.ok === false, 'απάντηση που δεν είναι JSON');
const nothing = await fetchBody(ID, KEY, stub({ json: null }).fetcher);
ok(nothing.ok === true && nothing.body.text === null, 'άδεια απάντηση δίνει άδειο σώμα, όχι σφάλμα');

console.log(`\ninbound/fetchBody.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
})();
