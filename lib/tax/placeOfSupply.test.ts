import {
  EU_MEMBER_STATES, VAT_STANDARD, supplyOf, memberStateName, supplyLabel, supplyNote,
  reverseCharge, needsVies, reverseChargeVat,
} from './placeOfSupply';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};
const eq = (msg: string, got: unknown, want: unknown) =>
  ok(got === want, `${msg}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

console.log('Κράτη μέλη');
eq('είκοσι επτά κράτη μέλη', EU_MEMBER_STATES.length, 27);
ok(EU_MEMBER_STATES.some(s => s.code === 'GR'), 'η Ελλάδα είναι μέσα στη λίστα');
ok(new Set(EU_MEMBER_STATES.map(s => s.code)).size === 27, 'κανένας διπλός κωδικός');
ok(EU_MEMBER_STATES.every(s => /^[A-Z]{2}$/.test(s.code)), 'όλοι οι κωδικοί δύο κεφαλαία γράμματα');
ok(!EU_MEMBER_STATES.some(s => s.code === 'GB'), 'το Ηνωμένο Βασίλειο δεν είναι κράτος μέλος');
// Αλφαβητικά στα ελληνικά: έτσι διαβάζεται ο επιλογέας.
const names = EU_MEMBER_STATES.map(s => s.name);
ok(names.join('|') === [...names].sort((a, b) => a.localeCompare(b, 'el')).join('|'),
  'αλφαβητικά στα ελληνικά');

console.log('\nΚατάταξη');
eq('Ελλάδα', supplyOf('GR'), 'domestic');
eq('το πρόθεμα ΦΠΑ «EL» είναι η Ελλάδα', supplyOf('EL'), 'domestic');
eq('πεζά και κενά δεν αλλάζουν τίποτα', supplyOf('  el '), 'domestic');
eq('Ιρλανδία', supplyOf('IE'), 'intra_eu');
eq('Ολλανδία', supplyOf('NL'), 'intra_eu');
eq('Ηνωμένες Πολιτείες', supplyOf('US'), 'third_country');
eq('Ηνωμένο Βασίλειο μετά το Brexit', supplyOf('GB'), 'third_country');
eq('Ελβετία', supplyOf('CH'), 'third_country');
// ΤΟ ΑΓΝΩΣΤΟ ΜΕΝΕΙ ΑΓΝΩΣΤΟ. Αν έπεφτε σε «εγχώρια», κάθε συνδρομή που δεν
// ρωτήθηκε θα περνούσε σιωπηλά χωρίς αντίστροφη χρέωση και χωρίς VIES.
eq('κενή χώρα', supplyOf(''), null);
eq('χώρα που λείπει', supplyOf(null), null);
eq('χώρα undefined', supplyOf(undefined), null);

console.log('\nΟνόματα');
eq('ελληνικό όνομα κράτους μέλους', memberStateName('IE'), 'Ιρλανδία');
eq('τρίτη χώρα δεν έχει όνομα εδώ', memberStateName('US'), '');

console.log('\nΥποχρεώσεις');
ok(!reverseCharge('domestic'), 'εγχώρια: τον φόρο τον χρεώνει ο πάροχος');
ok(reverseCharge('intra_eu') && reverseCharge('third_country'), 'ό,τι έρχεται απέξω: αντίστροφη χρέωση');
ok(needsVies('intra_eu'), 'ενδοκοινοτική: μπαίνει στον ανακεφαλαιωτικό πίνακα');
ok(!needsVies('third_country'), 'τρίτη χώρα: κανένας ανακεφαλαιωτικός πίνακας');
ok(!needsVies('domestic'), 'εγχώρια: κανένας ανακεφαλαιωτικός πίνακας');
ok(supplyLabel('intra_eu') === 'Ενδοκοινοτική λήψη υπηρεσιών', 'ολόκληρο το όνομα, όχι συντομογραφία');
ok(supplyNote('intra_eu').includes('αντίστροφη χρέωση') && supplyNote('intra_eu').includes('ανακεφαλαιωτικό'),
  'η ενδοκοινοτική λέει και τα δύο');
ok(supplyNote('third_country').includes('χωρίς ανακεφαλαιωτικό'), 'η τρίτη χώρα λέει τι ΔΕΝ χρειάζεται');
ok(!supplyNote('domestic').includes('αντίστροφη'), 'η εγχώρια δεν μιλά για αντίστροφη χρέωση');

console.log('\nΦόρος αντίστροφης χρέωσης');
eq('κανονικός συντελεστής', VAT_STANDARD, 24);
eq('εγχώρια: μηδέν, τον χρέωσε ο πάροχος', reverseChargeVat(100, 'domestic').vat, 0);
eq('ενδοκοινοτική στα 100', reverseChargeVat(100, 'intra_eu').vat, 24);
eq('τρίτη χώρα στα 100', reverseChargeVat(100, 'third_country').vat, 24);
eq('η καθαρή αξία μένει η καθαρή αξία', reverseChargeVat(22.32, 'intra_eu').net, 22.32);
eq('αρνητικό ποσό δεν παράγει φόρο', reverseChargeVat(-5, 'intra_eu').vat, 0);
eq('μη αριθμός δεν παράγει φόρο', reverseChargeVat(NaN, 'intra_eu').vat, 0);
eq('μηδενικός συντελεστής πέφτει στον κανονικό', reverseChargeVat(100, 'intra_eu', 0).rate, 24);
eq('μειωμένος συντελεστής, όταν δηλωθεί', reverseChargeVat(100, 'intra_eu', 13).vat, 13);

console.log(`\nplaceOfSupply: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
