// npx tsx lib/inbound/signature.test.ts
import { createHmac } from 'node:crypto';
import {
  verifySignature, sign, SECRET_ENV, TOLERANCE_SECONDS,
  ID_HEADERS, TIMESTAMP_HEADERS, SIGNATURE_HEADERS,
} from './signature';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

// Μυστικό δοκιμής, φτιαγμένο εδώ και πουθενά αλλού: 32 ψηφία σε base64.
const KEY = Buffer.alloc(32, 7);
const SECRET = 'whsec_' + KEY.toString('base64');
const NOW = Date.parse('2026-08-21T10:00:00Z');
const TS = String(Math.floor(NOW / 1000));
const ID = 'msg_2abc';
const BODY = '{"type":"email.received","data":{"subject":"ΔΕΗ"}}';

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});
const good = (over: Record<string, string> = {}) => headers({
  'webhook-id': ID, 'webhook-timestamp': TS,
  'webhook-signature': `v1,${sign(KEY, ID, TS, BODY)}`, ...over,
});

// ── Τα ονόματα των κεφαλίδων ───────────────────────────────────────────────
ok(SECRET_ENV === 'RESEND_WEBHOOK_SECRET', 'το μυστικό έχει σταθερό όνομα');
ok(TOLERANCE_SECONDS === 300, 'ανοχή πέντε λεπτά, όση και του αποστολέα');
ok(ID_HEADERS.includes('svix-id') && TIMESTAMP_HEADERS.includes('svix-timestamp')
  && SIGNATURE_HEADERS.includes('svix-signature'), 'δέχεται και τα δύο ονόματα κάθε κεφαλίδας');

// ── Το γνήσιο περνά ────────────────────────────────────────────────────────
ok(verifySignature(BODY, good(), SECRET, NOW) === true, 'γνήσιο μήνυμα περνά');
ok(verifySignature(BODY, headers({
  'svix-id': ID, 'svix-timestamp': TS, 'svix-signature': `v1,${sign(KEY, ID, TS, BODY)}`,
}), SECRET, NOW) === true, 'περνά και με τα παλιά ονόματα κεφαλίδων');
ok(verifySignature(BODY, good(), KEY.toString('base64'), NOW) === true, 'μυστικό χωρίς το πρόθεμα whsec_');
ok(verifySignature(BODY, good({
  'webhook-signature': `v1,${sign(Buffer.alloc(32, 9), ID, TS, BODY)} v1,${sign(KEY, ID, TS, BODY)}`,
}), SECRET, NOW) === true, 'στην περιστροφή μυστικού αρκεί μία από τις δύο');

// ── Το πλαστό δεν περνά ────────────────────────────────────────────────────
ok(verifySignature(BODY + ' ', good(), SECRET, NOW) === false, 'ΕΝΑ ΚΕΝΟ ΠΑΡΑΠΑΝΩ ΣΤΟ ΣΩΜΑ ΑΚΥΡΩΝΕΙ');
ok(verifySignature(BODY, good({ 'webhook-id': 'msg_allo' }), SECRET, NOW) === false, 'άλλο αναγνωριστικό δεν ταιριάζει');
ok(verifySignature(BODY, good(), 'whsec_' + Buffer.alloc(32, 9).toString('base64'), NOW) === false, 'άλλο μυστικό δεν ταιριάζει');
ok(verifySignature(BODY, good({ 'webhook-signature': `v1,${sign(KEY, ID, TS, BODY)}x` }), SECRET, NOW) === false, 'υπογραφή με έναν χαρακτήρα παραπάνω');
ok(verifySignature(BODY, good({ 'webhook-signature': `v2,${sign(KEY, ID, TS, BODY)}` }), SECRET, NOW) === false, 'άγνωστη έκδοση υπογραφής δεν μετράει');
ok(verifySignature(BODY, good({ 'webhook-signature': sign(KEY, ID, TS, BODY) }), SECRET, NOW) === false, 'υπογραφή χωρίς έκδοση δεν μετράει');

// ── Χωρίς μυστικό δεν περνά ΤΙΠΟΤΑ ─────────────────────────────────────────
ok(verifySignature(BODY, good(), undefined, NOW) === false, 'ΧΩΡΙΣ ΡΥΘΜΙΣΗ, ΚΛΕΙΣΤΗ ΠΟΡΤΑ — όχι ανοιχτή');
ok(verifySignature(BODY, good(), '', NOW) === false, 'κενό μυστικό δεν δέχεται κανέναν');
// ΤΟ ΚΟΝΤΟ ΜΥΣΤΙΚΟ ΑΠΟΡΡΙΠΤΕΤΑΙ ΑΚΟΜΗ ΚΑΙ ΟΤΑΝ Η ΥΠΟΓΡΑΦΗ ΤΑΙΡΙΑΖΕΙ. Αλλιώς
// ο έλεγχος θα έλεγε «όχι» μόνο επειδή υπογράψαμε με άλλο κλειδί και το όριο
// των 128 δυαδικών δεν θα κρινόταν ποτέ.
const SHORT = Buffer.alloc(8, 1);
ok(verifySignature(BODY, headers({
  'webhook-id': ID, 'webhook-timestamp': TS, 'webhook-signature': `v1,${sign(SHORT, ID, TS, BODY)}`,
}), 'whsec_' + SHORT.toString('base64'), NOW) === false, 'μυστικό 64 δυαδικών είναι πολύ μικρό, όση σωστή κι αν είναι η υπογραφή');
ok(verifySignature(BODY, headers({
  'webhook-id': ID, 'webhook-timestamp': TS,
  'webhook-signature': `v1,${createHmac('sha256', Buffer.alloc(0)).update(`${ID}.${TS}.${BODY}`).digest('base64')}`,
}), 'whsec_', NOW) === false, 'κενό κλειδί ΔΕΝ παράγει έλεγχο που περνούν όλοι');

// ── Οι κεφαλίδες που λείπουν ───────────────────────────────────────────────
ok(verifySignature(BODY, headers({}), SECRET, NOW) === false, 'χωρίς καμία κεφαλίδα');
ok(verifySignature(BODY, good({ 'webhook-id': '' }), SECRET, NOW) === false, 'χωρίς αναγνωριστικό');
ok(verifySignature(BODY, good({ 'webhook-timestamp': '' }), SECRET, NOW) === false, 'χωρίς χρονοσήμανση');
ok(verifySignature(BODY, good({ 'webhook-signature': '' }), SECRET, NOW) === false, 'χωρίς υπογραφή');

// ── Η χρονοσήμανση ─────────────────────────────────────────────────────────
const at = (secondsOff: number) => {
  const ts = String(Math.floor(NOW / 1000) + secondsOff);
  return verifySignature(BODY, headers({
    'webhook-id': ID, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sign(KEY, ID, ts, BODY)}`,
  }), SECRET, NOW);
};
ok(at(-299) === true, 'τέσσερα λεπτά και πενήντα εννέα πριν: μέσα');
ok(at(299) === true, 'τέσσερα λεπτά και πενήντα εννέα μετά: μέσα');
ok(at(-301) === false, 'ΠΕΝΤΕ ΛΕΠΤΑ ΚΑΙ ΕΝΑ ΠΡΙΝ: ΕΞΩ, αλλιώς η υπογραφή ζει για πάντα');
ok(at(301) === false, 'πέντε λεπτά και ένα μετά: έξω');
ok(verifySignature(BODY, good({ 'webhook-timestamp': 'χθες' }), SECRET, NOW) === false, 'χρονοσήμανση που δεν είναι αριθμός');
ok(verifySignature(BODY, good({ 'webhook-timestamp': '-1755770400' }), SECRET, NOW) === false, 'αρνητική χρονοσήμανση');

console.log(`\ninbound/signature.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
