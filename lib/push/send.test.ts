// npx tsx lib/push/send.test.ts
import { vapidKeys, TTL_SECONDS, VAPID_PUBLIC_ENV, VAPID_PRIVATE_ENV, VAPID_SUBJECT_ENV, type PushEnv } from './send';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

const full = {
  [VAPID_PUBLIC_ENV]: 'BLc4xhmTsoFEGSRhL4YRLFCbfIxjkK5',
  [VAPID_PRIVATE_ENV]: 'idiotiko-kleidi',
  [VAPID_SUBJECT_ENV]: 'mailto:kapoios@example.com',
};
const without = (k: string): PushEnv => { const e: PushEnv = { ...full }; delete e[k]; return e; };
const missing = (e: PushEnv) => (vapidKeys(e) as { missing?: string }).missing;

// ── ΜΕ ΤΑ ΤΡΙΑ, ΕΤΟΙΜΟΙ ────────────────────────────────────────────────────
{
  const k = vapidKeys(full);
  ok(!('missing' in k), 'με τα τρία κλειδιά δεν λείπει τίποτα');
  eq((k as { subject: string }).subject, 'mailto:kapoios@example.com', 'το θέμα περνά όπως δόθηκε');
}

// ── ΤΟ ΜΙΣΟ ΡΥΘΜΙΣΜΕΝΟ ΕΙΝΑΙ ΑΡΥΘΜΙΣΤΟ, ΚΑΙ ΛΕΓΕΤΑΙ ΟΝΟΜΑΣΤΙΚΑ ────────────
// Χωρίς το όνομα αυτού που λείπει, το 503 της διαδρομής θα ήταν γρίφος: τρεις
// μεταβλητές, καμία ένδειξη ποια.
eq(missing(without(VAPID_PUBLIC_ENV)), VAPID_PUBLIC_ENV, 'λείπει το δημόσιο και το λέει');
eq(missing(without(VAPID_PRIVATE_ENV)), VAPID_PRIVATE_ENV, 'λείπει το ιδιωτικό και το λέει');
eq(missing(without(VAPID_SUBJECT_ENV)), VAPID_SUBJECT_ENV, 'λείπει το θέμα και το λέει');
eq(missing({}), VAPID_PUBLIC_ENV, 'με άδειο περιβάλλον αναφέρεται το πρώτο που λείπει');
eq(missing({ ...full, [VAPID_PRIVATE_ENV]: '   ' }), VAPID_PRIVATE_ENV, 'κλειδί από κενά είναι κλειδί που λείπει');

// ── ΤΑ ΟΝΟΜΑΤΑ ΕΙΝΑΙ ΣΥΜΒΟΛΑΙΟ ΜΕ ΤΟ VERCEL ──────────────────────────────
// Το δημόσιο ΠΡΕΠΕΙ να ξεκινά με `NEXT_PUBLIC_`: το ίδιο κλειδί το χρειάζεται
// και ο περιηγητής για να φτιάξει συνδρομή. Το ιδιωτικό ΔΕΝ επιτρέπεται.
ok(VAPID_PUBLIC_ENV.startsWith('NEXT_PUBLIC_'), 'το δημόσιο κλειδί φτάνει στον περιηγητή');
ok(!VAPID_PRIVATE_ENV.startsWith('NEXT_PUBLIC_'), 'το ιδιωτικό δεν φεύγει ποτέ από τον διακομιστή');
ok(!VAPID_SUBJECT_ENV.startsWith('NEXT_PUBLIC_'), 'ούτε το θέμα χρειάζεται στη σελίδα');

// ── ΜΙΑ ΗΜΕΡΑ ΖΩΗΣ ─────────────────────────────────────────────────────────
// Πιο πολύ δεν έχει νόημα: την επόμενη μέρα φεύγει νέα ειδοποίηση με τα
// σημερινά δεδομένα και η χθεσινή θα μιλούσε για προθεσμίες που πέρασαν.
eq(TTL_SECONDS, 86_400, 'το μήνυμα ζει μία ημέρα στην υπηρεσία push');

console.log(`\npush/send.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
