// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΔΟΚΙΜΕΣ ΤΗΣ ΜΕΤΡΗΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΔΙΑΚΥΒΕΥΕΤΑΙ. Αυτά τα ονόματα γίνονται στήλες σε ερώτημα SQL που θα
// διαβάσει αγοραστής. Ενα όνομα που δεν περνά τον έλεγχο της βάσης πετάει
// εξαίρεση την οποία η `track` καταπίνει σιωπηλά: το γεγονός χάνεται και
// κανείς δεν το μαθαίνει ποτέ. Ο έλεγχος γίνεται λοιπόν ΕΔΩ, όπου φαίνεται.
// ═══════════════════════════════════════════════════════════════════════════
import { PRODUCT_EVENTS, track, type ProductEvent } from './events';

let passed = 0, failed = 0;
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// Ο ΙΔΙΟΣ κανόνας που γράφει η log_event στο scripts/db/product-events.sql.
// Αν αλλάξει εκεί, πρέπει να αλλάξει και εδώ: γι' αυτό είναι γραμμένος δύο
// φορές, ώστε η απόκλιση να φαίνεται ως αποτυχία και όχι ως χαμένο γεγονός.
const NAME_RULE = /^[a-z][a-z0-9_]{2,47}$/;

{
  const names = Object.values(PRODUCT_EVENTS);
  ok('κάθε όνομα περνά τον έλεγχο της βάσης', names.every(n => NAME_RULE.test(n)));
  ok('το κλειδί είναι ίδιο με την τιμή', Object.entries(PRODUCT_EVENTS).every(([k, v]) => k === v));
  ok('κανένα διπλότυπο', new Set(names).size === names.length);
  ok('εννέα σκαλιά', names.length === 9);
}

// ── ΤΟ ΧΩΝΙ ΕΧΕΙ ΣΕΙΡΑ, ΚΑΙ Η ΣΕΙΡΑ ΕΧΕΙ ΝΟΗΜΑ ───────────────────────────
{
  const order = Object.values(PRODUCT_EVENTS);
  const idx = (e: ProductEvent) => order.indexOf(e);
  ok('η εγγραφή είναι πρώτη', idx(PRODUCT_EVENTS.signed_up) === 0);
  ok('η πληρωμή είναι τελευταία', idx(PRODUCT_EVENTS.subscription_started) === order.length - 1);
  ok('το δεύτερο ακίνητο έρχεται μετά το πρώτο',
    idx(PRODUCT_EVENTS.second_property_added) > idx(PRODUCT_EVENTS.property_added));
  ok('η δοκιμή έρχεται πριν από τη συνδρομή',
    idx(PRODUCT_EVENTS.trial_started) < idx(PRODUCT_EVENTS.subscription_started));
}

// ── Η ΜΕΤΡΗΣΗ ΔΕΝ ΣΠΑΕΙ ΠΟΤΕ ΤΗΝ ΠΡΑΞΗ ΠΟΥ ΜΕΤΡΑΕΙ ───────────────────────
// Σε συνάρτηση, γιατί η έξοδος των δοκιμών είναι cjs και δεν δέχεται await
// στο ανώτατο επίπεδο.
async function trackTests() {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const fake = { rpc: (fn: string, args: unknown) => { calls.push({ fn, args }); return Promise.resolve({ error: null }) } };
  await track(fake as never, PRODUCT_EVENTS.property_added, { plan: 'solo', count: 1 });
  ok('καλεί τη log_event', calls.length === 1 && calls[0].fn === 'log_event');
  ok('περνά όνομα και φορτίο',
    JSON.stringify(calls[0].args) === JSON.stringify({ p_event: 'property_added', p_props: { plan: 'solo', count: 1 } }));

  // ΔΕΝ ΠΕΡΝΑ user_id. Αν κάποτε προστεθεί, ο έλεγχος κοκκινίζει: η ταυτότητα
  // ορίζεται ΜΟΝΟ από τη βάση, αλλιώς γράφει ο καθένας στο όνομα του άλλου.
  ok('δεν στέλνει ποτέ ταυτότητα χρήστη',
    !JSON.stringify(calls[0].args).includes('user_id'));

  const boom = { rpc: () => Promise.reject(new Error('η βάση έπεσε')) };
  let threw = false;
  try { await track(boom as never, PRODUCT_EVENTS.signed_up) } catch { threw = true }
  ok('πεσμένη βάση δεν πετάει προς τα έξω', !threw);

  const sync = { rpc: () => { throw new Error('συγχρονο σφάλμα') } };
  let threw2 = false;
  try { await track(sync as never, PRODUCT_EVENTS.signed_up) } catch { threw2 = true }
  ok('ούτε σύγχρονο σφάλμα', !threw2);
}

// ── ΤΙ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΜΠΕΙ ΣΤΟ ΦΟΡΤΙΟ ───────────────────────────────
// Δεν επιβάλλεται από τον τύπο (είναι Record), οπότε επιβάλλεται από κανόνα
// που διαβάζεται: κανένα κλειδί με προσωπικό δεδομένο ανάμεσα στα ονόματα.
{
  const forbidden = ['email', 'name', 'address', 'afm', 'vat', 'phone', 'iban', 'property_id', 'amount'];
  const used = new Set<string>();
  // Τα κλειδιά που ΟΝΤΩΣ χρησιμοποιεί η εφαρμογή, γραμμένα ρητά εδώ ώστε ο
  // κατάλογος να είναι ορατός και ελέγξιμος με μια ματιά.
  ['plan', 'count', 'source', 'kind', 'cycle'].forEach(k => used.add(k));
  ok('κανένα κλειδί φορτίου δεν είναι προσωπικό δεδομένο',
    [...used].every(k => !forbidden.includes(k)));
}

void trackTests().then(() => {
  console.log(`analytics/events.test.ts: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
