// npx tsx lib/billing/merchant/lemon.test.ts
//
// ΕΝΑ ΤΥΠΟΓΡΑΦΙΚΟ ΣΕ ΜΙΑ ΓΡΑΜΜΗ ΕΡΙΧΝΕ ΟΛΟΚΛΗΡΟ ΤΟΝ WEBHOOK
// ─────────────────────────────────────────────────────────────────────────
// Ο χάρτης παραλλαγών είναι μια συμβολοσειρά σε μεταβλητή περιβάλλοντος:
// «811223:solo:monthly,811224:solo:annual,…». Γράφεται με το χέρι, μία φορά,
// από άνθρωπο που αντιγράφει αναγνωριστικά από τον πίνακα του εμπόρου.
//
// Το `readEvent` έβγαινε με «σπασμένη ρύθμιση» σε ΟΠΟΙΟΔΗΠΟΤΕ σφάλμα του
// χάρτη. Ενα «anual» αντί για «annual» σε μία γραμμή σήμαινε λοιπόν 500 σε
// ΚΑΘΕ γεγονός: καμία αγορά, ανανέωση ή ακύρωση δεν καταγραφόταν.
//
// ΚΑΙ ΤΟ ΤΑΜΕΙΟ ΕΜΕΝΕ ΑΝΟΙΧΤΟ. Η `checkoutIsLive` διαβάζει την ανεκτική
// εκδοχή του ίδιου χάρτη, που αγνοεί τη χαλασμένη γραμμή. Ο πελάτης αγόραζε
// με παραλλαγή που διαβάστηκε μια χαρά, χρεωνόταν, και το γεγονός της ΙΔΙΑΣ
// παραλλαγής πετιόταν. Ο ιδιοκτήτης δεν είχε πουθενά να το δει.
import { lemonPort } from './lemon';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };

const KEY = { LEMON_SQUEEZY_API_KEY: 'k', LEMON_STORE_ID: '1' };

/** Ενα αληθινό γεγονός συνδρομής, με την παραλλαγή που δίνει ο καλών. */
const event = (variantId: string) => ({
  meta: { event_name: 'subscription_created', custom_data: { user_id: 'u1' } },
  data: {
    id: 'sub_1',
    attributes: {
      status: 'active', variant_id: Number(variantId), customer_id: 7,
      renews_at: '2026-09-01T00:00:00Z', ends_at: null, updated_at: '2026-08-01T00:00:00Z',
    },
  },
});

// ── ΜΙΑ ΧΑΛΑΣΜΕΝΗ ΓΡΑΜΜΗ ΔΕΝ ΡΙΧΝΕΙ ΤΙΣ ΥΠΟΛΟΙΠΕΣ ────────────────────────
{
  const env = { ...KEY, LEMON_VARIANTS: '811223:solo:monthly,811224:solo:anual,811225:owner:monthly' };
  const read = lemonPort.readEvent(event('811223'), env);
  ok('γεγονός με έγκυρη παραλλαγή διαβάζεται', read.ok);
  ok('ΚΑΙ ΒΓΑΖΕΙ ΤΟ ΣΩΣΤΟ ΠΑΚΕΤΟ', read.ok && read.event.plan?.plan === 'solo');
  ok('με τον κύκλο του', read.ok && read.event.plan?.cycle === 'monthly');

  // Η δεύτερη έγκυρη γραμμή δουλεύει κι αυτή: το σφάλμα ήταν στη μεσαία.
  const other = lemonPort.readEvent(event('811225'), env);
  ok('και η γραμμή μετά τη χαλασμένη', other.ok && other.event.plan?.plan === 'owner');
}

// ── Η ΑΓΝΩΣΤΗ ΠΑΡΑΛΛΑΓΗ ΔΕΝ ΕΙΝΑΙ ΣΠΑΣΜΕΝΗ ΡΥΘΜΙΣΗ ──────────────────────
// Πέφτει στο 422 της διαδρομής, δηλαδή ο έμπορος ξαναστέλνει το γεγονός όταν
// διορθωθεί ο χάρτης. Με `config: true` θα έπαιρνε 500 και θα χανόταν.
{
  const env = { ...KEY, LEMON_VARIANTS: '811223:solo:monthly' };
  const read = lemonPort.readEvent(event('999999'), env);
  ok('το γεγονός διαβάζεται κανονικά', read.ok);
  ok('και το πακέτο μένει άγνωστο, χωρίς να σκάσει', read.ok && read.event.plan === null);
}

// ── ΑΔΕΙΟΣ ΧΑΡΤΗΣ ΕΙΝΑΙ ΟΝΤΩΣ ΔΙΚΗ ΜΑΣ ΒΛΑΒΗ ────────────────────────────
// Αλλιώς τα παραπάνω θα σήμαιναν «τίποτα δεν κόβει ποτέ», που είναι το
// αντίθετο σφάλμα με το ίδιο πράσινο.
{
  const read = lemonPort.readEvent(event('811223'), { ...KEY, LEMON_VARIANTS: '' });
  ok('κενός χάρτης κόβει', !read.ok);
  ok('και λέει ότι φταίει η ρύθμισή μας', !read.ok && read.config === true);
  ok('χαρακτηρίζοντάς το δικό μας γεγονός', !read.ok && read.ours === true);
}

// Και ο χάρτης που είναι ΟΛΟΣ χαλασμένος: κανένα ζεύγος δεν διαβάστηκε.
{
  const read = lemonPort.readEvent(event('811223'), { ...KEY, LEMON_VARIANTS: 'σκουπίδια' });
  ok('χάρτης χωρίς καμία έγκυρη γραμμή κόβει', !read.ok && read.config === true);
  ok('με λόγο που λέει τι φταίει', !read.ok && read.reason.length > 0);
}

// ΚΑΙ ΤΟ ΣΚΕΤΟ ΚΟΜΜΑ, ΠΟΥ ΔΙΝΕΙ ΑΔΕΙΟ ΧΑΡΤΗ ΧΩΡΙΣ ΚΑΜΙΑ ΚΑΤΑΓΓΕΛΙΑ. Τα κενά
// κομμάτια πέφτουν πριν από τον έλεγχο, οπότε ο λόγος θα ήταν κενή γραμμή.
{
  const read = lemonPort.readEvent(event('811223'), { ...KEY, LEMON_VARIANTS: ',' });
  ok('το σκέτο κόμμα κόβει', !read.ok && read.config === true);
  ok('ΚΑΙ Ο ΛΟΓΟΣ ΔΕΝ ΕΙΝΑΙ ΚΕΝΟΣ', !read.ok && read.reason.trim().length > 0);
}

// ── ΟΤΙ ΔΕΝ ΕΙΝΑΙ ΔΙΚΟ ΜΑΣ ΓΕΓΟΝΟΣ, ΔΕΝ ΤΟ ΔΙΕΚΔΙΚΟΥΜΕ ─────────────────
{
  const env = { ...KEY, LEMON_VARIANTS: '811223:solo:monthly' };
  const read = lemonPort.readEvent({ meta: { event_name: 'order_created' }, data: {} }, env);
  ok('άσχετο γεγονός δεν διαβάζεται', !read.ok);
  ok('και δεν χρεώνεται στη ρύθμισή μας', !read.ok && read.config !== true);
}

console.log(`merchant/lemon — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('✓ όλα πέρασαν');
