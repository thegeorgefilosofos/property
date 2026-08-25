// npx tsx lib/push/subscription.test.ts
import { readSubscription, endpointHost } from './subscription';
import { decodeKey } from './client';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

// Πραγματικά μήκη: το `p256dh` είναι δημόσιο κλειδί P-256 (87 χαρακτήρες σε
// base64url), το `auth` δεκαέξι ψηφία (22 χαρακτήρες).
const P256 = 'B'.repeat(87);
const AUTH = 'a'.repeat(22);
const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: P256, auth: AUTH } };

// ── Η ΚΑΛΗ ΣΥΝΔΡΟΜΗ ΠΕΡΝΑ ΑΚΕΡΑΙΗ ──────────────────────────────────────────
{
  const s = readSubscription(good)!;
  eq(s.endpoint, good.endpoint, 'η διεύθυνση δεν πειράζεται');
  eq(s.p256dh, P256, 'ούτε το δημόσιο κλειδί');
  eq(s.auth, AUTH, 'ούτε το μυστικό της συνδρομής');
}
{
  // ΤΙΠΟΤΑ ΔΕΝ ΚΟΒΕΤΑΙ «ΓΙΑ ΑΣΦΑΛΕΙΑ»: μια κομμένη διεύθυνση στέλνει αλλού.
  const long = 'https://updates.push.services.mozilla.com/wpush/v2/' + 'x'.repeat(2000);
  eq(readSubscription({ ...good, endpoint: long })!.endpoint.length, long.length, 'μακριά διεύθυνση μένει ολόκληρη');
}
eq(readSubscription({ endpoint: ` ${good.endpoint} `, keys: good.keys })!.endpoint, good.endpoint, 'τα κενά φεύγουν');

// ── Ο,ΤΙ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΔΕΧΤΕΙ ΜΗΝΥΜΑ, ΔΕΝ ΓΡΑΦΕΤΑΙ ─────────────────────────
// Μια σπασμένη γραμμή δεν αποτυγχάνει θορυβωδώς: αποτυγχάνει ΣΙΩΠΗΛΑ σε κάθε
// αποστολή, για πάντα και ο ιδιοκτήτης νομίζει ότι είναι εγγεγραμμένος.
eq(readSubscription(null), null, 'το τίποτα δεν είναι συνδρομή');
eq(readSubscription(undefined), null, 'ούτε το ακαθόριστο');
eq(readSubscription({}), null, 'ούτε το άδειο αντικείμενο');
eq(readSubscription({ endpoint: 'http://push.example/a', keys: good.keys }), null, 'χωρίς https δεν είναι υπηρεσία push');
eq(readSubscription({ endpoint: 'javascript:alert(1)', keys: good.keys }), null, 'ούτε κάτι που δεν είναι καν διεύθυνση');
eq(readSubscription({ ...good, keys: { p256dh: '', auth: AUTH } }), null, 'κενό δημόσιο κλειδί δεν κρυπτογραφεί τίποτα');
eq(readSubscription({ ...good, keys: { p256dh: P256, auth: '' } }), null, 'ούτε κενό μυστικό');
eq(readSubscription({ ...good, keys: { p256dh: 'B'.repeat(20), auth: AUTH } }), null, 'ούτε κουτσουρεμένο κλειδί');
eq(readSubscription({ ...good, keys: { p256dh: 'B'.repeat(86) + '+', auth: AUTH } }), null, 'το base64 με «+» δεν είναι base64url');
eq(readSubscription({ ...good, keys: null }), null, 'χωρίς κλειδιά, τίποτα');
eq(readSubscription({ endpoint: 12 as unknown as string, keys: good.keys }), null, 'αριθμός στη θέση διεύθυνσης');

// ── ΤΟ ΑΡΧΕΙΟ ΚΑΤΑΓΡΑΦΗΣ ΔΕΝ ΠΑΙΡΝΕΙ ΠΟΤΕ ΟΛΟΚΛΗΡΗ ΤΗ ΔΙΕΥΘΥΝΣΗ ────────────
// Οποιος τη διαβάσει εκεί, μπορεί να στέλνει ο ίδιος σε εκείνο το τηλέφωνο.
eq(endpointHost(good.endpoint), 'fcm.googleapis.com', 'μένει μόνο ο διακομιστής');
ok(!endpointHost(good.endpoint).includes('abc123'), 'το μοναδικό κομμάτι δεν καταγράφεται');
eq(endpointHost('όχι διεύθυνση'), 'άγνωστος', 'και το άκυρο λέγεται με λέξη, όχι με σφάλμα');

// ── ΤΟ ΚΛΕΙΔΙ ΠΟΥ ΔΙΝΕΤΑΙ ΣΤΟΝ ΠΕΡΙΗΓΗΤΗ ───────────────────────────────────
// Το VAPID δημόσιο κλειδί ταξιδεύει σε base64url χωρίς γεμίσματα· η
// `subscribe()` θέλει τα ίδια bytes.
{
  const bytes = decodeKey('BBBB');
  eq(bytes.length, 3, 'τέσσερα ψηφία base64 δίνουν τρία bytes');
  eq(decodeKey('_w').length, 1, 'το «_» της base64url διαβάζεται');
  eq(decodeKey('_w')[0], 255, 'και δίνει το σωστό byte');
  eq(decodeKey('-w')[0], 251, 'όπως και το «-»');
  // Ενα αληθινό κλειδί P-256 είναι 65 bytes και ξεκινά με 0x04 (μη συμπιεσμένο).
  const real = 'BLc4xhmTsoFEGSRhL4YRLFCbfIxjkK5HAHrPP1yFmp0Kq_dJRVfnBhkVfMbXfDTUYFO_LhpNMlV2nnHXlNXBqSA';
  eq(decodeKey(real).length, 65, 'το πραγματικό κλειδί δίνει 65 bytes');
  eq(decodeKey(real)[0], 4, 'και ξεκινά με 0x04');
}

console.log(`\npush/subscription.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
