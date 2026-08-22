// npx tsx lib/data/calendarFeed.test.ts
//
// ΔΥΟ ΚΑΝΟΝΕΣ ΠΟΥ ΔΕΝ ΕΧΟΥΝ ΒΑΣΗ ΑΠΟ ΠΙΣΩ, ΚΑΙ ΓΙ' ΑΥΤΟ ΕΛΕΓΧΟΝΤΑΙ ΕΔΩ: πότε
// ένα κουπόνι έχει λήξει, και πώς γράφεται η διεύθυνση που θα δώσει ο χρήστης
// στο ημερολόγιό του.
import { feedExpired, feedUrl, feedSubscribeUrl, type FeedOwner } from './calendarFeed';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

const NOW = Date.parse('2026-08-21T10:00:00Z');
const owner = (expires_at: string | null): FeedOwner => ({ user_id: 'u1', expires_at });

// ── Η λήξη ─────────────────────────────────────────────────────────────────
eq(feedExpired(owner('2026-08-20T10:00:00Z'), NOW), true, 'χθεσινή λήξη σημαίνει ληγμένο');
eq(feedExpired(owner('2026-08-22T10:00:00Z'), NOW), false, 'αυριανή λήξη σημαίνει ζωντανό');
eq(feedExpired(owner('2026-08-21T10:00:00Z'), NOW), true, 'ΤΗΝ ΑΚΡΙΒΩΣ ΩΡΑ ΤΗΣ ΛΗΞΗΣ ΤΟ ΚΟΥΠΟΝΙ ΕΧΕΙ ΛΗΞΕΙ');
eq(feedExpired(owner(null), NOW), false, 'οι παλιές γραμμές χωρίς λήξη δεν λήγουν, όπως το όρισε η μετανάστευση');
eq(feedExpired(null, NOW), false, 'χωρίς γραμμή δεν υπάρχει λήξη να κριθεί — το «δεν βρέθηκε» το λέει ο καλών');
eq(feedExpired(owner('όχι ημερομηνία'), NOW), false, 'σκουπίδι στη στήλη δεν ΣΒΗΝΕΙ συνδρομή που δουλεύει');

// ── Η διεύθυνση ────────────────────────────────────────────────────────────
const T = 'a3f19c7d0b2e4681a3f19c7d0b2e4681';
ok(feedUrl(T).endsWith(`/imerologio/${T}.ics`), 'η διεύθυνση τελειώνει σε .ics ώστε να μοιάζει με αρχείο');
ok(feedUrl(T).startsWith('https://'), 'και ξεκινά από την κανονική διεύθυνση του ιστότοπου');
eq(feedUrl(null), '', 'χωρίς κουπόνι δεν υπάρχει διεύθυνση');
eq(feedUrl(''), '', 'ούτε με κενό');
ok(feedSubscribeUrl(T).startsWith('webcal://'), 'ΤΟ webcal ΓΡΑΦΕΙ ΣΥΝΔΡΟΜΗ, το https κατεβάζει ένα αρχείο που παγώνει');
eq(feedSubscribeUrl(T).slice('webcal://'.length), feedUrl(T).replace(/^https:\/\//, ''),
  'και είναι η ΙΔΙΑ διεύθυνση, μόνο με άλλο πρωτόκολλο');
eq(feedSubscribeUrl(null), '', 'χωρίς κουπόνι, τίποτα');

console.log(`\ndata/calendarFeed.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
