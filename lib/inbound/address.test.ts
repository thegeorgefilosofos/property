// npx tsx lib/inbound/address.test.ts
import {
  TOKEN_LENGTH, DOMAIN_ENV,
  normalizeToken, inboundDomain, inboundAddress, tokenFromRecipient, tokenFromRecipients,
} from './address';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

const TOKEN = 'a3f19c7d0b2e4681';
const D = 'propertyos.gr';

// ── Το κουπόνι ─────────────────────────────────────────────────────────────
ok(TOKEN_LENGTH === 16, 'δεκαέξι ψηφία, δηλαδή 64 δυαδικά');
ok(DOMAIN_ENV === 'NEXT_PUBLIC_INBOUND_DOMAIN', 'το όνομα της μεταβλητής είναι σταθερό');
ok(normalizeToken(TOKEN) === TOKEN, 'το σωστό κουπόνι περνά αυτούσιο');
ok(normalizeToken(TOKEN.toUpperCase()) === TOKEN, 'τα κεφαλαία πέφτουν σε πεζά');
ok(normalizeToken('a3f1-9c7d-0b2e-4681') === TOKEN, 'οι παύλες ομαδοποίησης αγνοούνται');
ok(normalizeToken(' a3f1 9c7d 0b2e 4681 ') === TOKEN, 'τα κενά αγνοούνται');
ok(normalizeToken(TOKEN.slice(0, 15)) === null, 'κομμένο κουπόνι δεν ταιριάζει «όσο μπορεί»');
ok(normalizeToken(TOKEN + '0') === null, 'κουπόνι με ένα ψηφίο παραπάνω δεν περνά');
ok(normalizeToken('g3f19c7d0b2e4681') === null, 'ψηφίο εκτός δεκαεξαδικού δεν περνά');
ok(normalizeToken('') === null, 'κενό δεν είναι κουπόνι');
ok(normalizeToken(null) === null, 'απόν δεν είναι κουπόνι');

// ── Ο τομέας ───────────────────────────────────────────────────────────────
ok(inboundDomain('propertyos.gr') === D, 'ο τομέας περνά');
ok(inboundDomain(' PropertyOS.GR ') === D, 'κενά και κεφαλαία καθαρίζονται');
ok(inboundDomain('@propertyos.gr') === D, 'το παπάκι μπροστά αφαιρείται');
ok(inboundDomain('in.propertyos.gr') === 'in.propertyos.gr', 'υποτομέας επιτρέπεται');
ok(inboundDomain('') === '', 'χωρίς ρύθμιση, κανένας τομέας');
ok(inboundDomain(undefined) === '', 'απούσα ρύθμιση, κανένας τομέας');
ok(inboundDomain('propertyos') === '', 'όνομα χωρίς κατάληξη δεν είναι τομέας');
ok(inboundDomain('https://propertyos.gr') === '', 'διεύθυνση ιστού δεν είναι τομέας');
ok(inboundDomain('propertyos.gr/inbox') === '', 'διαδρομή δεν είναι τομέας');
ok(inboundDomain('-propertyos.gr') === '', 'τομέας δεν αρχίζει με παύλα');

// ── Η διεύθυνση ────────────────────────────────────────────────────────────
ok(inboundAddress(TOKEN, D) === `${TOKEN}@${D}`, 'κουπόνι και τομέας δίνουν διεύθυνση');
ok(inboundAddress(TOKEN, '') === '', 'ΧΩΡΙΣ ΤΟΜΕΑ ΔΕΝ ΥΠΑΡΧΕΙ ΔΙΕΥΘΥΝΣΗ — ούτε μισή');
ok(inboundAddress('', D) === '', 'χωρίς κουπόνι δεν υπάρχει διεύθυνση');
ok(inboundAddress('όχι κουπόνι', D) === '', 'άκυρο κουπόνι δεν γίνεται διεύθυνση');

// ── Ο παραλήπτης, όπως τον γράφει το ταχυδρομείο ───────────────────────────
ok(tokenFromRecipient(`${TOKEN}@${D}`, D) === TOKEN, 'σκέτη διεύθυνση');
ok(tokenFromRecipient(`Property OS <${TOKEN}@${D}>`, D) === TOKEN, 'με όνομα σε γωνιακές αγκύλες');
ok(tokenFromRecipient(`${TOKEN.toUpperCase()}@${D.toUpperCase()}`, D) === TOKEN, 'κεφαλαία και στα δύο μέρη');
ok(tokenFromRecipient(`${TOKEN}+dei@${D}`, D) === TOKEN, 'η επέκταση με συν αγνοείται');
ok(tokenFromRecipient(`${TOKEN}@allo.gr`, D) === null, 'άλλος τομέας δεν είναι δικός μας');
ok(tokenFromRecipient(`${TOKEN}@sub.${D}`, D) === null, 'υποτομέας ΔΕΝ είναι ο τομέας μας');
ok(tokenFromRecipient(`${TOKEN}@${D}.evil.com`, D) === null, 'ο τομέας μας ως πρόθεμα ξένου δεν περνά');
ok(tokenFromRecipient(`info@${D}`, D) === null, 'ανθρώπινη διεύθυνση του ίδιου τομέα δεν είναι κουπόνι');
ok(tokenFromRecipient(`@${D}`, D) === null, 'κενό τοπικό μέρος δεν είναι κουπόνι');
ok(tokenFromRecipient(`${TOKEN}@${D}`, '') === null, 'χωρίς ρυθμισμένο τομέα δεν αναγνωρίζεται κανείς');

// ── Πολλοί παραλήπτες ──────────────────────────────────────────────────────
const OTHER = 'ffffffff00000001';
ok(tokenFromRecipients([`x@allo.gr`, `${TOKEN}@${D}`], D) === TOKEN, 'ένα δικό μας ανάμεσα σε ξένα');
ok(tokenFromRecipients([`${TOKEN}@${D}`, `${TOKEN}@${D}`], D) === TOKEN, 'το ίδιο κουπόνι δύο φορές είναι ένας παραλήπτης');
ok(tokenFromRecipients([`${TOKEN}+a@${D}`, `${TOKEN}@${D}`], D) === TOKEN, 'ίδιο κουπόνι με και χωρίς επέκταση');
ok(tokenFromRecipients([`${TOKEN}@${D}`, `${OTHER}@${D}`], D) === null, 'ΔΥΟ ΛΟΓΑΡΙΑΣΜΟΙ ΣΤΟ ΙΔΙΟ ΜΗΝΥΜΑ: κανένας');
ok(tokenFromRecipients([], D) === null, 'χωρίς παραλήπτες, κανείς');
ok(tokenFromRecipients([`info@${D}`], D) === null, 'μόνο ανθρώπινη διεύθυνση, κανείς');

console.log(`\ninbound/address.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
