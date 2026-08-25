import { AADE_DOC_TYPES, incomeDocTypes, expenseDocTypes } from './aadeDocTypes';
import { ALLOWED_CLASSES, CATEGORY_CODE, INVOICE_TYPE_LABEL, type InvoiceType, type ExpenseClass } from './myData';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};
const eq = (msg: string, got: unknown, want: unknown) =>
  ok(got === want, `${msg}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

console.log('Το μητρώο, όπως το γράφει η ΑΑΔΕ');
const ids = Object.keys(AADE_DOC_TYPES);
eq('σαράντα πέντε τύποι', ids.length, 45);
ok(ids.every(id => /^\d{1,2}\.\d{1,2}$/.test(id)), 'κάθε αναγνωριστικό είναι «οικογένεια.αριθμός»');
ok(ids.every(id => AADE_DOC_TYPES[id].title.trim().length > 3), 'κάθε τύπος έχει τίτλο');
ok(!ids.some(id => /ΤΥΠΟΣ ΠΑΡΑΣΤΑΤΙΚΟΥ/.test(AADE_DOC_TYPES[id].title)), 'ο τίτλος δεν κουβαλά το πρόθεμα του φύλλου');

// ΤΟ ΤΥΠΟΓΡΑΦΙΚΟ ΤΗΣ ΠΗΓΗΣ. Το φύλλο 1.5 γράφει «catΕgory2_3» με ελληνικό «Ε».
// Αντιγραμμένο αυτούσιο, θα ταξίδευε ως άγνωστος κωδικός σε κάθε σύγκριση και
// θα εμφανιζόταν ως «λείπει χαρακτηρισμός» σε τύπο που τον δέχεται.
const allCodes = ids.flatMap(id => [...AADE_DOC_TYPES[id].income, ...AADE_DOC_TYPES[id].expense]);
ok(allCodes.every(c => /^category[12]_\d+$/.test(c)), 'κάθε κωδικός είναι λατινικός και καλοσχηματισμένος');
ok(AADE_DOC_TYPES['1.5'].expense.includes('category2_3'), 'το τυπογραφικό του 1.5 κανονικοποιήθηκε');
// ΚΑΙ ΤΟ ΔΕΥΤΕΡΟ ΤΥΠΟΓΡΑΦΙΚΟ: το φύλλο 14.2 της πηγής επαναλαμβάνει τον τίτλο
// του 14.1. Ο τύπος είναι οι αποκτήσεις τρίτων χωρών — όπως ο 14.4 είναι η λήψη
// υπηρεσιών τρίτων χωρών απέναντι στον ενδοκοινοτικό 14.3.
eq('το 14.2 είναι οι αποκτήσεις τρίτων χωρών', AADE_DOC_TYPES['14.2'].title, 'Τιμολόγιο / Αποκτήσεις Τρίτων Χωρών');
ok(AADE_DOC_TYPES['14.1'].title !== AADE_DOC_TYPES['14.2'].title, 'και δεν λέγεται πια όπως το 14.1');
// ΚΑΝΕΝΑΣ ΤΥΠΟΣ ΔΕΝ ΟΝΟΜΑΖΕΤΑΙ ΔΥΟ ΤΡΟΠΟΥΣ ΜΕΣΑ ΣΤΟ ΙΔΙΟ ΒΙΒΛΙΟ. Το μητρώο και
// τα ελληνικά λεκτικά του myData.ts εμφανίζονται σε διαφορετικά φύλλα του ίδιου
// Excel: μια απόκλιση διαβάζεται ως δύο διαφορετικοί τύποι.
//
// ΓΙΑΤΙ Ο ΕΛΕΓΧΟΣ ΑΛΛΑΞΕ ΣΧΗΜΑ. Παλιά τα δύο λεκτικά ήταν γραμμένα χωριστά με
// το χέρι και ο έλεγχος τα σύγκρινε μεταξύ τους. Πλέον το myData.ts ΠΑΡΑΓΕΙ
// το δικό του από εδώ, οπότε η σύγκριση θα ήταν μια τιμή με τον εαυτό της:
// πάντα πράσινη, δηλαδή κενή. Αυτό που μπορεί ακόμη να σπάσει είναι το κλειδί,
// αν ένας τύπος μετονομαστεί ή φύγει από το μητρώο. Αυτό ελέγχεται.
for (const t of Object.keys(INVOICE_TYPE_LABEL) as InvoiceType[]) {
  ok(!!AADE_DOC_TYPES[t], `ο τύπος ${t} υπάρχει στο μητρώο`);
  ok((INVOICE_TYPE_LABEL[t] ?? '').trim().length > 3, `και το λεκτικό του βγαίνει από εκεί`);
}

console.log('\nΈσοδα και έξοδα');
ok(incomeDocTypes().length > 0 && expenseDocTypes().length > 0, 'υπάρχουν και οι δύο πλευρές');
ok(incomeDocTypes().every(id => AADE_DOC_TYPES[id].income.length > 0), 'η πλευρά των εσόδων δεν περιέχει άδειους');
ok(expenseDocTypes().every(id => AADE_DOC_TYPES[id].expense.length > 0), 'ούτε η πλευρά των εξόδων');
// Οι τύποι που αφορούν άμεσα τον ιδιοκτήτη ακινήτου.
eq('8.1 είναι τα ενοίκια ως έσοδο', AADE_DOC_TYPES['8.1'].title, 'Ενοίκια - Έσοδο');
eq('16.1 είναι τα ενοίκια ως έξοδο', AADE_DOC_TYPES['16.1'].title, 'Ενοίκια - Έξοδο');
eq('13.3 είναι τα κοινόχρηστα', AADE_DOC_TYPES['13.3'].title, 'Κοινόχρηστα');
eq('13.4 είναι οι συνδρομές', AADE_DOC_TYPES['13.4'].title, 'Συνδρομές');
ok(AADE_DOC_TYPES['11.2'].title.includes('Απόδειξη Παροχής Υπηρεσιών'), '11.2 είναι η ΑΠΥ');
// Τα ενοίκια ως ΕΞΟΔΟ δεν δέχονται «Λήψη Υπηρεσιών»: το μίσθωμα δεν είναι
// υπηρεσία στη γλώσσα του myDATA και ένας αφελής κανόνας θα το έστελνε εκεί.
ok(!AADE_DOC_TYPES['16.1'].expense.includes('category2_3'), 'τα ενοίκια ως έξοδο δεν είναι λήψη υπηρεσιών');

// ══ ΔΥΟ ΠΙΝΑΚΕΣ ΑΠΟ ΤΗΝ ΙΔΙΑ ΠΗΓΗ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΑΠΟΚΛΙΝΟΥΝ ════════════
// Το myData.ts κρατά τους επτά τύπους 14.x που παράγει η εφαρμογή, με ελληνικά
// λεκτικά και τυποποιημένη μορφή («2.5»). Το μητρώο εδώ κρατά και τους σαράντα
// πέντε, με τους κωδικούς της ΑΑΔΕ. Γραμμένοι δύο φορές, θα αποκλίνουν — και η
// απόκλιση θα φανεί ως «η ΑΑΔΕ απέρριψε τη διαβίβαση», μήνες μετά.
console.log('\nΣυμφωνία με τους τύπους που παράγει η εφαρμογή');
for (const t of Object.keys(ALLOWED_CLASSES) as InvoiceType[]) {
  const reg = AADE_DOC_TYPES[t];
  ok(!!reg, `ο τύπος ${t} υπάρχει στο μητρώο`);
  if (!reg) continue;
  const mine = ALLOWED_CLASSES[t].map(c => CATEGORY_CODE[c as ExpenseClass]).sort();
  // Το μητρώο έχει και κατηγορίες που δεν έχουμε ονομάσει· η σύγκριση γίνεται
  // στο ΔΙΚΟ μας υποσύνολο και απαιτεί να το περιέχει ολόκληρο.
  const missing = mine.filter(c => !reg.expense.includes(c));
  ok(missing.length === 0, `το ${t} συμφωνεί με το μητρώο${missing.length ? ` — λείπουν ${missing.join(', ')}` : ''}`);
}
// Και το αντίστροφο, εκεί που ξέρουμε όλα τα ονόματα: ό,τι επιτρέπει το μητρώο
// και μπορούμε να ονομάσουμε, πρέπει να το επιτρέπει και το myData.ts.
const NAMED = new Set(Object.values(CATEGORY_CODE));
for (const t of Object.keys(ALLOWED_CLASSES) as InvoiceType[]) {
  const extra = AADE_DOC_TYPES[t].expense.filter(c => NAMED.has(c))
    .filter(c => !ALLOWED_CLASSES[t].map(x => CATEGORY_CODE[x as ExpenseClass]).includes(c));
  ok(extra.length === 0, `το ${t} δεν κρύβει επιτρεπτή κατηγορία${extra.length ? ` — λείπουν ${extra.join(', ')}` : ''}`);
}
ok((Object.keys(INVOICE_TYPE_LABEL) as InvoiceType[]).every(t => !!AADE_DOC_TYPES[t]),
  'κάθε τύπος με ελληνικό λεκτικό υπάρχει και στο μητρώο');

console.log(`\naadeDocTypes: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
