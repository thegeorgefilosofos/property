import {
  PROPERTY_TYPES, PROPERTY_TYPE_LABELS, PROPERTY_TYPE_PLURALS,
  propertyTypeLabel, propertyTypePlural,
} from './types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };

// ── Ο ΚΑΤΑΛΟΓΟΣ ΕΙΝΑΙ ΠΛΗΡΗΣ ────────────────────────────────────────────
ok('κάθε κλειδί είναι μοναδικό', new Set(PROPERTY_TYPES).size === PROPERTY_TYPES.length);
ok('κάθε τύπος έχει ενικό', PROPERTY_TYPES.every(t => PROPERTY_TYPE_LABELS[t].trim().length > 2));
ok('κάθε τύπος έχει πληθυντικό', PROPERTY_TYPES.every(t => PROPERTY_TYPE_PLURALS[t].trim().length > 2));
ok('κανένας ενικός δεν λέγεται δύο φορές',
  new Set(PROPERTY_TYPES.map(t => PROPERTY_TYPE_LABELS[t])).size === PROPERTY_TYPES.length);

// ── ΟΛΑ ΣΤΑ ΕΛΛΗΝΙΚΑ ────────────────────────────────────────────────────
// Ο οδηγός προσθήκης έγραφε «Parking» ανάμεσα σε έντεκα ελληνικά ονόματα.
const latin = /[A-Za-z]/;
ok('κανένας ενικός δεν έχει λατινικά', PROPERTY_TYPES.every(t => !latin.test(PROPERTY_TYPE_LABELS[t])));
ok('κανένας πληθυντικός δεν έχει λατινικά', PROPERTY_TYPES.every(t => !latin.test(PROPERTY_TYPE_PLURALS[t])));

// ── ΟΙ ΔΥΟ ΑΠΟΘΗΚΕΣ ΞΕΧΩΡΙΖΟΥΝ ──────────────────────────────────────────
// Πληρώνουν άλλον ΕΝΦΙΑ και γράφονται αλλού στο Ε2, οπότε δεν επιτρέπεται να
// μοιάζουν στην οθόνη της επιλογής.
ok('η επαγγελματική δεν λέγεται όπως της πολυκατοικίας',
  PROPERTY_TYPE_LABELS.warehouse !== PROPERTY_TYPE_LABELS.storage);
ok('καμία από τις δύο δεν λέγεται σκέτο «Αποθήκη»',
  PROPERTY_TYPE_LABELS.warehouse !== 'Αποθήκη' && PROPERTY_TYPE_LABELS.storage !== 'Αποθήκη');

// ── ΤΟ ΑΓΝΩΣΤΟ ΔΕΝ ΓΙΝΕΤΑΙ ΔΙΑΜΕΡΙΣΜΑ ───────────────────────────────────
ok('γνωστό κλειδί δίνει ετικέτα', propertyTypeLabel('parking') === 'Θέση στάθμευσης');
ok('γνωστό κλειδί δίνει πληθυντικό', propertyTypePlural('parking') === 'Θέσεις στάθμευσης');
ok('άγνωστο κλειδί επιστρέφεται όπως ήρθε', propertyTypeLabel('καλύβα') === 'καλύβα');
ok('κενό μένει κενό', propertyTypeLabel('') === '');
ok('null μένει κενό', propertyTypeLabel(null) === '');
ok('undefined μένει κενό', propertyTypePlural(undefined) === '');

console.log(`property/types: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
