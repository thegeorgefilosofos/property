import { HEATING_TYPES, heatingLabel, isCentralHeating, normalizeHeating, usesGas } from './heating';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };

// ── Ο ΚΑΤΑΛΟΓΟΣ ──────────────────────────────────────────────────────────
ok('κάθε τιμή είναι μοναδική', new Set(HEATING_TYPES.map(h => h.value)).size === HEATING_TYPES.length);
ok('κάθε ετικέτα είναι μοναδική', new Set(HEATING_TYPES.map(h => h.label)).size === HEATING_TYPES.length);
ok('καμία ετικέτα δεν είναι κενή', HEATING_TYPES.every(h => h.label.trim().length > 3));
// Κεφαλαία στη μέση της φράσης δεν είναι ελληνική ορθογραφία («Φυσικού Αερίου»).
ok('καμία ετικέτα δεν έχει κεφαλαία στη μέση',
  HEATING_TYPES.every(h => !/\s[Α-ΩΆΈΉΊΌΎΏ][α-ωά-ώ]/.test(h.label)));

// ── ΚΑΜΙΑ ΠΑΛΙΑ ΑΠΑΝΤΗΣΗ ΔΕΝ ΧΑΝΕΤΑΙ ────────────────────────────────────
// Τρεις οθόνες έγραψαν τρία λεξιλόγια. Οποιος απάντησε, απάντησε.
ok('ο οδηγός: πετρέλαιο', normalizeHeating('oil') === 'autonomous_oil');
ok('οι πάροχοι: αντλία', normalizeHeating('autonomous_heat_pump') === 'heat_pump');
ok('οι πάροχοι: κλιματιστικό', normalizeHeating('autonomous_ac') === 'ac_only');
ok('οι πάροχοι: pellet', normalizeHeating('autonomous_pellet') === 'pellet');
ok('οι πάροχοι: ξύλα', normalizeHeating('autonomous_wood') === 'pellet');
// Το «combi» έγραφε κλειδί που κανένας κατάλογος ετικετών δεν γνώριζε: η κάρτα
// του ακινήτου τύπωνε «Θέρμανση: combi».
ok('το αέριο: συνδυαστικό', normalizeHeating('combi') === 'autonomous_gas');
ok('τα κοινά κλειδιά μένουν ίδια', normalizeHeating('central_gas') === 'central_gas');

// ── ΤΟ ΑΓΝΩΣΤΟ ΔΕΝ ΓΙΝΕΤΑΙ ΕΤΙΚΕΤΑ ──────────────────────────────────────
ok('κενό μένει κενό', normalizeHeating('') === '');
ok('null μένει κενό', normalizeHeating(null) === '');
ok('το «άλλο» δεν σημαίνει τίποτα', normalizeHeating('other') === '');
ok('άγνωστο κλειδί δεν περνά', normalizeHeating('ξυλόσομπα-του-παππού') === '');
ok('άγνωστο κλειδί δεν τυπώνεται ωμό', heatingLabel('combi123') === '');
ok('κάθε κανονικό κλειδί έχει ετικέτα', HEATING_TYPES.every(h => heatingLabel(h.value) === h.label));

// ── ΟΙ ΔΥΟ ΕΡΩΤΗΣΕΙΣ ΠΟΥ ΚΑΝΟΥΝ ΟΙ ΟΘΟΝΕΣ ───────────────────────────────
ok('αυτόνομο αέριο καίει αέριο', usesGas('autonomous_gas'));
ok('κεντρικό αέριο καίει αέριο', usesGas('central_gas'));
ok('το παλιό «combi» καίει αέριο', usesGas('combi'));
ok('η αντλία δεν καίει αέριο', !usesGas('heat_pump'));
ok('το άγνωστο δεν καίει αέριο', !usesGas(''));

ok('κεντρική πετρελαίου είναι κοινόχρηστη', isCentralHeating('central_oil'));
ok('τηλεθέρμανση είναι κοινόχρηστη', isCentralHeating('district'));
ok('αυτόνομη δεν είναι κοινόχρηστη', !isCentralHeating('autonomous_gas'));

console.log(`property/heating: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
