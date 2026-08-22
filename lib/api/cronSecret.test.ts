// npx tsx lib/api/cronSecret.test.ts
import { cronSecretOk, CRON_HEADER, CRON_SECRET_ENV } from './cronSecret';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

const SECRET = 'mystiko-chronodiagrammatos-2026';
const h = (value?: string) => new Headers(value === undefined ? {} : { [CRON_HEADER]: value });

// ── ΤΟ ΣΩΣΤΟ ΠΕΡΝΑ ─────────────────────────────────────────────────────────
ok(cronSecretOk(h(SECRET), SECRET), 'το ίδιο μυστικό περνά');
ok(cronSecretOk(h(` ${SECRET} `), SECRET), 'τα κενά της κεφαλίδας δεν χαλούν τη σύγκριση');
ok(cronSecretOk(new Headers({ 'X-Cron-Secret': SECRET }), SECRET), 'η κεφαλίδα δεν έχει πεζά και κεφαλαία');

// ── ΤΟ ΛΑΘΟΣ ΔΕΝ ΠΕΡΝΑ ─────────────────────────────────────────────────────
ok(!cronSecretOk(h('alo'), SECRET), 'άλλο μυστικό δεν περνά');
ok(!cronSecretOk(h(SECRET + 'x'), SECRET), 'ούτε το σωστό με έναν χαρακτήρα παραπάνω');
ok(!cronSecretOk(h(SECRET.slice(0, -1)), SECRET), 'ούτε το σωστό με έναν λιγότερο');
ok(!cronSecretOk(h(), SECRET), 'χωρίς κεφαλίδα, τίποτα');
ok(!cronSecretOk(h(''), SECRET), 'ούτε με κενή κεφαλίδα');

// ── ΧΩΡΙΣ ΜΥΣΤΙΚΟ ΣΤΟ ΠΕΡΙΒΑΛΛΟΝ, ΚΛΕΙΣΤΑ ΓΙΑ ΟΛΟΥΣ ────────────────────────
// Η αντίθετη επιλογή —«δεν ορίστηκε, άρα άσε τους να περάσουν»— ανοίγει την
// πόρτα ακριβώς όταν ξεχάσει κανείς μια ρύθμιση στην παραγωγή.
ok(!cronSecretOk(h(SECRET), undefined), 'χωρίς ορισμένο μυστικό δεν περνά ούτε το σωστό');
ok(!cronSecretOk(h(SECRET), ''), 'ούτε με κενό μυστικό');
ok(!cronSecretOk(h(''), ''), 'κενό με κενό δεν είναι ταύτιση');
ok(!cronSecretOk(h('   '), '   '), 'ούτε τα σκέτα κενά μετρούν ως μυστικό');

// ── ΤΟ ΟΝΟΜΑ ΤΗΣ ΜΕΤΑΒΛΗΤΗΣ ΕΙΝΑΙ ΣΥΜΒΟΛΑΙΟ ────────────────────────────────
// Το ίδιο όνομα γράφεται στο Vercel και διαβάζεται στη διαδρομή· μια αλλαγή
// εδώ χωρίς αλλαγή εκεί δίνει 401 σε κάθε πρωινή εκτέλεση, σιωπηλά.
ok(CRON_SECRET_ENV === 'CRON_SECRET', 'η μεταβλητή λέγεται CRON_SECRET');
ok(CRON_HEADER === 'x-cron-secret', 'η κεφαλίδα είναι αυτή που στέλνει το pg_cron');

console.log(`\napi/cronSecret.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
