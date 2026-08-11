import {
  GREEK_VAT_RATES, PERIOD_LABEL, REMINDER_DAYS_BEFORE,
  countryFromVatNumber, providerCountry, docSupply, vatRateOf,
  billingPeriod, nextRenewal, reminderDate, deductionNotes,
} from './invoiceIntel';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};
const eq = (msg: string, got: unknown, want: unknown) =>
  ok(got === want, `${msg}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

// Έγκυρα ΑΦΜ (περνούν το checksum της ΑΑΔΕ), από δημόσια γνωστές εγγραφές.
const AFM_OK = '094014201';
const AFM_BAD = '123456789';

console.log('Χώρα από αριθμό ΦΠΑ');
eq('ιρλανδικός', countryFromVatNumber('IE6388047V'), 'IE');
eq('ολλανδικός', countryFromVatNumber('NL857927374B01'), 'NL');
eq('ελληνικός με πρόθεμα', countryFromVatNumber('EL094014201'), 'EL');
eq('πεζά και κενά', countryFromVatNumber('  ie6388047v '), 'IE');
eq('σκέτα ψηφία δεν έχουν χώρα', countryFromVatNumber('094014201'), '');
eq('κενό', countryFromVatNumber(''), '');
eq('που λείπει', countryFromVatNumber(null), '');

console.log('\nΧώρα εκδότη');
eq('ρητή χώρα υπερισχύει', providerCountry({ provider_country: 'de', provider_vat: 'IE6388047V' }), 'DE');
eq('αλλιώς το πρόθεμα ΦΠΑ', providerCountry({ provider_vat: 'IE6388047V' }), 'IE');
eq('αλλιώς έγκυρο ελληνικό ΑΦΜ', providerCountry({ provider_afm: AFM_OK }), 'GR');
// ΤΟ CHECKSUM ΔΕΝ ΠΑΡΑΛΕΙΠΕΤΑΙ: εννέα οποιαδήποτε ψηφία δεν είναι ΑΦΜ, και ένας
// αριθμός τιμολογίου θα έστελνε ενδοκοινοτική λήψη στις εγχώριες δαπάνες.
eq('εννέα ψηφία που δεν είναι ΑΦΜ δεν δίνουν Ελλάδα', providerCountry({ provider_afm: AFM_BAD }), '');
eq('τίποτα από τα τρία', providerCountry({}), '');

console.log('\nΤόπος παροχής από παραστατικό');
eq('ελληνικό τιμολόγιο', docSupply({ provider_afm: AFM_OK }), 'domestic');
eq('πρόθεμα EL είναι Ελλάδα', docSupply({ provider_vat: 'EL094014201' }), 'domestic');
eq('ιρλανδικό', docSupply({ provider_vat: 'IE6388047V' }), 'intra_eu');
eq('αμερικανικό', docSupply({ provider_country: 'US' }), 'third_country');
eq('βρετανικό μετά το Brexit', docSupply({ provider_country: 'GB' }), 'third_country');
eq('χωρίς στοιχεία μένει άγνωστο', docSupply({}), null);

console.log('\nΣυντελεστής ΦΠΑ');
eq('οι τέσσερις ελληνικοί', GREEK_VAT_RATES.join(','), '0,6,13,24');
eq('γραμμένος ρητά', vatRateOf({ vat_rate: 24 }), 24);
eq('μηδέν είναι συντελεστής, όχι κενό', vatRateOf({ vat_rate: 0 }), 0);
eq('από καθαρή αξία και φόρο', vatRateOf({ net_amount: 100, vat_amount: 24 }), 24);
eq('από σύνολο και φόρο', vatRateOf({ amount: 124, vat_amount: 24 }), 24);
eq('μειωμένος', vatRateOf({ net_amount: 100, vat_amount: 13 }), 13);
eq('υπερμειωμένος', vatRateOf({ net_amount: 200, vat_amount: 12 }), 6);
ok(vatRateOf({ net_amount: 12.4, vat_amount: 2.98 }) === 24, 'ανοχή στρογγυλοποίησης του εκδότη');
// ΔΕΝ ΚΟΥΜΠΩΝΕΤΑΙ Ο,ΤΙ ΔΕΝ ΠΕΦΤΕΙ ΠΑΝΩ. Ένα «21%» σημαίνει ότι διαβάσαμε λάθος
// κάποιο ποσό, και το σωστό είναι να το πούμε άγνωστο.
eq('ξένος συντελεστής δεν στρογγυλοποιείται', vatRateOf({ net_amount: 100, vat_amount: 21 }), null);
eq('χωρίς ποσά', vatRateOf({}), null);
eq('φόρος χωρίς βάση', vatRateOf({ vat_amount: 24 }), null);
eq('αρνητική βάση', vatRateOf({ net_amount: -100, vat_amount: 24 }), null);

console.log('\nΠερίοδος χρέωσης');
eq('μηνιαία, ελληνικά', billingPeriod('Μηνιαία συνδρομή'), 'monthly');
eq('τριμηνιαία', billingPeriod('τριμηνιαία'), 'quarterly');
eq('ετήσια', billingPeriod('Ετήσια χρέωση'), 'yearly');
eq('αγγλικά', billingPeriod('yearly'), 'yearly');
eq('12 μήνες', billingPeriod('12 μήνες'), 'yearly');
eq('δίμηνο', billingPeriod('λογαριασμός διμήνου'), 'bimonthly');
eq('εξάμηνο', billingPeriod('εξαμηνιαία'), 'semiannual');
eq('εφάπαξ', billingPeriod('εφάπαξ'), 'once');
eq('άγνωστο', billingPeriod('κάτι άλλο'), null);
eq('κενό', billingPeriod(''), null);
eq('όλες οι περίοδοι έχουν ελληνικό όνομα', Object.values(PERIOD_LABEL).filter(Boolean).length, 6);

console.log('\nΠότε ξαναχρεώνεται');
eq('μηνιαία', nextRenewal('2026-08-11', 'monthly'), '2026-09-11');
eq('ετήσια', nextRenewal('2026-08-11', 'yearly'), '2027-08-11');
eq('τριμηνιαία', nextRenewal('2026-11-30', 'quarterly'), '2027-02-28');
// Η 31η Ιανουαρίου με μηνιαία χρέωση ΔΕΝ γίνεται 3 Μαρτίου: η υπενθύμιση θα
// έφτανε αφού ο χρήστης πλήρωσε αυτό που ήθελε να ακυρώσει.
eq('η 31η δεν ξεχειλίζει', nextRenewal('2026-01-31', 'monthly'), '2026-02-28');
eq('δίσεκτο έτος', nextRenewal('2028-01-31', 'monthly'), '2028-02-29');
eq('εφάπαξ δεν ανανεώνεται', nextRenewal('2026-08-11', 'once'), '');
eq('χωρίς περίοδο', nextRenewal('2026-08-11', null), '');
eq('χωρίς ημερομηνία', nextRenewal('', 'monthly'), '');
eq('κακή ημερομηνία', nextRenewal('11/08/2026', 'monthly'), '');

console.log('\nΠότε ειδοποιούμε');
eq('τρεις ημέρες πριν', REMINDER_DAYS_BEFORE, 3);
eq('μέσα στον μήνα', reminderDate('2026-08-11'), '2026-08-08');
eq('περνά σε προηγούμενο μήνα', reminderDate('2026-03-02'), '2026-02-27');
eq('περνά σε προηγούμενο έτος', reminderDate('2027-01-02'), '2026-12-30');
eq('με δικό του περιθώριο', reminderDate('2026-08-11', 10), '2026-08-01');
eq('χωρίς ημερομηνία λήξης', reminderDate(''), '');

console.log('\nΤι λέει ο βοηθός');
const priv = deductionNotes({ business: false, supply: 'intra_eu' });
ok(priv.length === 1 && /ιδιώτης/.test(priv[0]), 'στον ιδιώτη δεν μιλά για εκπτώσεις');
ok(!priv.some(n => /αντίστροφη/.test(n)), 'ούτε για αντίστροφη χρέωση');

const eu = deductionNotes({ business: true, supply: 'intra_eu' });
ok(eu.some(n => /εκπίπτει στο σύνολό της/.test(n)), 'πλήρης δαπάνη επιχείρησης');
ok(eu.some(n => /αντίστροφη χρέωση/.test(n)), 'λέει την αντίστροφη χρέωση');
ok(eu.some(n => /VIES/.test(n)), 'λέει το μητρώο VIES');
// ΔΕΝ ΥΠΟΓΡΑΦΕΙ ΤΗ ΔΗΛΩΣΗ ΤΟΥ ΧΡΗΣΤΗ: η έκπτωση θέλει και σκοπό επιχείρησης και
// νόμιμο παραστατικό, που τα ξέρει μόνο εκείνος.
ok(eu.every(n => !/^Εκπίπτει\.$/.test(n)) && eu.some(n => /εφόσον/.test(n)),
  'βάζει την προϋπόθεση, δεν αποφαίνεται');

const partial = deductionNotes({ business: true, supply: 'domestic', expensePct: 60 });
ok(partial.some(n => /60%/.test(n)), 'λέει το ποσοστό που δηλώθηκε');
ok(partial.some(n => /Εγχώρια/.test(n)), 'και ότι είναι εγχώρια');

const third = deductionNotes({ business: true, supply: 'third_country' });
ok(third.some(n => /τρίτη χώρα/.test(n) && /χωρίς ανακεφαλαιωτικό/.test(n)), 'η τρίτη χώρα δεν θέλει πίνακα');

const unknown = deductionNotes({ business: true, supply: null });
ok(unknown.some(n => /Δεν ξέρω πού είναι η έδρα/.test(n)), 'το άγνωστο το λέει άγνωστο');
ok(unknown.some(n => /γράφεται στο παραστατικό/.test(n)), 'και λέει πού να το βρει');

console.log(`\ninvoiceIntel: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
