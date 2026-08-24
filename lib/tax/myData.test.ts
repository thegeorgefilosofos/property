import {
  EXPENSE_CLASS_LABEL, INVOICE_TYPE_LABEL, CATEGORY_NATURE, CATEGORY_CODE, ALLOWED_CLASSES,
  natureOf, selfTransmittedInvoiceType, myDataHint, myDataCell, unmappedCategories, isAllowedCombination, pendingGroups,
  type ExpenseClass, type InvoiceType,
} from './myData';
import { CATEGORIES } from '../expenses/taxonomy';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};
const eq = (msg: string, got: unknown, want: unknown) =>
  ok(got === want, `${msg}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

console.log('Κάλυψη της ταξινομίας');
// ΚΑΘΕ ΚΑΤΗΓΟΡΙΑ ΠΡΕΠΕΙ ΝΑ ΕΧΕΙ ΦΥΣΗ. Μια καινούρια κατηγορία δαπάνης χωρίς
// γραμμή εδώ θα έβγαινε σιωπηλά κενή στο Excel του λογιστή — δηλαδή θα έμοιαζε
// με «δεν χαρακτηρίζεται», ενώ η αλήθεια θα ήταν «δεν τη σκέφτηκε κανείς».
eq('καμία κατηγορία χωρίς φύση', unmappedCategories().join(', '), '');
eq('καμία περισσευούμενη γραμμή',
  Object.keys(CATEGORY_NATURE).filter(s => !CATEGORIES.some(c => c.slug === s)).join(', '), '');

console.log('\nΑναγνώριση κατηγορίας');
eq('από slug', natureOf('plumber'), 'service');
eq('από ελληνικό λεκτικό', natureOf('Ρεύμα'), 'general');
eq('από συνώνυμο', natureOf('ΔΕΗ'), 'general');
eq('από πρόταση', natureOf('Πλήρωσα τον υδραυλικό'), 'service');
eq('ο ΕΝΦΙΑ είναι τέλος', natureOf('ΕΝΦΙΑ'), 'levy');
eq('τα έπιπλα είναι πάγιο', natureOf('έπιπλα'), 'asset');
eq('άγνωστο δεν συμπεραίνει', natureOf('κουρδιστό πορτοκάλι'), null);
eq('κενό δεν συμπεραίνει', natureOf(''), null);

console.log('\nΤύπος παραστατικού του λήπτη');
eq('εγχώρια: το διαβιβάζει ο προμηθευτής', selfTransmittedInvoiceType('domestic', 'service'), null);
eq('χωρίς τόπο παροχής, τίποτα', selfTransmittedInvoiceType(null, 'service'), null);
eq('ενδοκοινοτική υπηρεσία', selfTransmittedInvoiceType('intra_eu', 'service'), '14.3');
eq('υπηρεσία τρίτης χώρας', selfTransmittedInvoiceType('third_country', 'service'), '14.4');
eq('ενδοκοινοτικό αγαθό', selfTransmittedInvoiceType('intra_eu', 'asset'), '14.1');
eq('αγαθό τρίτης χώρας', selfTransmittedInvoiceType('third_country', 'asset'), '14.2');
eq('γενικό έξοδο απέξω είναι υπηρεσία', selfTransmittedInvoiceType('intra_eu', 'general'), '14.3');

console.log('\nΧαρακτηρισμός εξόδου');
eq('υπηρεσία τεχνικού', myDataHint({ category: 'plumber', supply: 'domestic' }).expenseClass, '2.3');
eq('και δεν ζητά τίποτα άλλο', myDataHint({ category: 'plumber', supply: 'domestic' }).needsInput, false);
eq('δικηγόρος, επίσης υπηρεσία', myDataHint({ category: 'δικηγόρος' }).expenseClass, '2.3');

// ΤΟ 2.4 ΚΑΙ ΤΟ 2.5 ΤΑ ΧΩΡΙΖΕΙ Ο ΛΗΠΤΗΣ, ΟΧΙ Η ΔΑΠΑΝΗ. Το ίδιο ρεύμα.
const power = (vat: 'full' | 'none' | 'unknown') => myDataHint({ category: 'electricity', supply: 'domestic', vat });
eq('με δικαίωμα έκπτωσης', power('full').expenseClass, '2.4');
eq('χωρίς δικαίωμα έκπτωσης', power('none').expenseClass, '2.5');
// ΧΩΡΙΣ ΤΗΝ ΑΠΑΝΤΗΣΗ, ΚΕΝΟ. Προεπιλογή στο 2.5 θα χάριζε τον ΦΠΑ εισροών κάθε
// επιχείρησης που έχει δικαίωμα έκπτωσης, σιωπηλά, σε κάθε γραμμή του αρχείου.
eq('χωρίς την απάντηση, κανένα συμπέρασμα', power('unknown').expenseClass, null);
eq('και το λέει', power('unknown').needsInput, true);
ok(power('unknown').note.includes('ΦΠΑ των εισροών'), 'η σημείωση λέει τι λείπει');
eq('η προεπιλογή είναι το άγνωστο', myDataHint({ category: 'electricity' }).expenseClass, null);

console.log('\nΠάγια και τέλη');
const fridge = myDataHint({ category: 'ψυγείο', supply: 'intra_eu' });
// ΤΟ ΠΑΓΙΟ ΕΧΕΙ ΔΙΚΗ ΤΟΥ ΚΑΤΗΓΟΡΙΑ. Έβγαινε κενό όσο το όνομα του `category2_7`
// δεν είχε διαβαστεί από επίσημη πηγή· ο κωδικός δεν αλλάζει τη λογιστική του.
eq('το πάγιο παίρνει 2.7', fridge.expenseClass, '2.7');
eq('αλλά η ενδοκοινοτική απόκτηση διαβιβάζεται', fridge.invoiceType, '14.1');
eq('και δεν ζητά τίποτα άλλο', fridge.needsInput, false);
ok(fridge.note.includes('αποσβένεται'), 'και θυμίζει ότι δεν είναι έξοδο χρήσης');
eq('ο ΕΝΦΙΑ δεν χαρακτηρίζεται', myDataHint({ category: 'ΕΝΦΙΑ' }).expenseClass, null);
eq('ούτε διαβιβάζεται', myDataHint({ category: 'ΕΝΦΙΑ', supply: 'domestic' }).invoiceType, null);
eq('άγνωστη κατηγορία, καθαρά κενό', myDataCell(myDataHint({ category: 'ξψζ' })), '');

// ΤΟ «ΑΛΛΟ» ΕΙΝΑΙ ΥΠΑΡΚΤΗ ΕΠΙΛΟΓΗ ΠΟΥ ΔΕΝ ΛΕΕΙ ΤΙΠΟΤΑ. Έβγαινε στο Excel με
// σίγουρο «2.5», δηλαδή χαρακτηρισμός βγαλμένος από κατηγορία που σημαίνει «δεν
// είπα τι είναι» — και για ξένο πάροχο θα διάλεγε στα τυφλά ανάμεσα σε 14.1
// (αγαθό) και 14.3 (υπηρεσία), που είναι δύο διαφορετικές δηλώσεις.
eq('το «Άλλο» δεν παράγει χαρακτηρισμό', myDataHint({ category: 'Άλλο', vat: 'none' }).expenseClass, null);
eq('ούτε με δικαίωμα έκπτωσης', myDataHint({ category: 'Άλλο', vat: 'full' }).expenseClass, null);
eq('ούτε τύπο παραστατικού από το εξωτερικό', myDataHint({ category: 'Άλλο', supply: 'intra_eu' }).invoiceType, null);
eq('και το λέει', myDataHint({ category: 'Άλλο' }).needsInput, true);
eq('και το κελί ζητά κατηγορία', myDataCell(myDataHint({ category: 'Άλλο', supply: 'third_country', vat: 'none' })), 'Ζητά κατηγορία');
// Το τέλος δεν έχει τιμολόγιο προμηθευτή ούτε όταν έρθει από το εξωτερικό.
eq('τέλος από κράτος μέλος, κανένας τύπος', myDataHint({ category: 'ΕΝΦΙΑ', supply: 'intra_eu' }).invoiceType, null);

console.log('\nΤο κελί του Excel');
eq('εγχώρια υπηρεσία', myDataCell(myDataHint({ category: 'plumber', supply: 'domestic' })), '2.3 Λήψη Υπηρεσιών');
eq('ενδοκοινοτική συνδρομή χωρίς έκπτωση',
  myDataCell(myDataHint({ category: 'subscription', supply: 'intra_eu', vat: 'none' })),
  '14.3 · 2.5 Γενικά Έξοδα χωρίς δικαίωμα έκπτωσης Φ.Π.Α.');
// ΤΟ ΚΕΝΟ ΚΕΛΙ ΕΙΝΑΙ ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ ΠΡΑΓΜΑΤΑ ΚΑΙ ΦΑΙΝΕΤΑΙ ΙΔΙΟ. Ο λογιστής που
// ανοίγει στήλη με κενά δεν ξεχωρίζει το «δεν χαρακτηρίζεται» από το «δεν
// μπόρεσα να αποφασίσω»: το πρώτο κλείνει τη γραμμή, το δεύτερο ζητά απάντηση.
eq('ο τύπος μένει και δίπλα του η εκκρεμότητα',
  myDataCell(myDataHint({ category: 'subscription', supply: 'third_country' })), '14.4 · Ζητά δικαίωμα έκπτωσης ΦΠΑ');
eq('ο ΕΝΦΙΑ λέει ότι δεν χαρακτηρίζεται', myDataCell(myDataHint({ category: 'ΕΝΦΙΑ' })), 'Δεν χαρακτηρίζεται');
eq('το πάγιο με τον κωδικό του', myDataCell(myDataHint({ category: 'ψυγείο', supply: 'intra_eu' })), '14.1 · 2.7 Αγορές Παγίων');
eq('ο πλήρης χαρακτηρισμός δεν κουβαλά εκκρεμότητα',
  myDataCell(myDataHint({ category: 'plumber', supply: 'domestic' })), '2.3 Λήψη Υπηρεσιών');

console.log('\nΛεκτικά');
eq('εννέα κατηγορίες με όνομα', Object.keys(EXPENSE_CLASS_LABEL).length, 9);
eq('το 2.7 είναι τα πάγια', EXPENSE_CLASS_LABEL['2.7'], 'Αγορές Παγίων');
eq('και ο κωδικός του', CATEGORY_CODE['2.95'], 'category2_95');
// Ο πίνακας δέχεται το 2.7 στις αποκτήσεις αγαθών, όχι στη λήψη υπηρεσιών ως
// εμπόρευμα: ο έλεγχος του συνδυασμού παραμένει ο ίδιος.
eq('η απόκτηση αγαθών δέχεται πάγια', isAllowedCombination('14.1', '2.7'), true);
eq('ο ΕΦΚΑ δεν δέχεται πάγια', isAllowedCombination('14.5', '2.7'), false);
eq('το 2.5 λέει χωρίς δικαίωμα', EXPENSE_CLASS_LABEL['2.5'], 'Γενικά Έξοδα χωρίς δικαίωμα έκπτωσης Φ.Π.Α.');
ok(Object.values(INVOICE_TYPE_LABEL).every(l => l.length > 0), 'κάθε τύπος παραστατικού έχει λεκτικό');
// Η αντίστροφη χρέωση γράφεται ΜΟΝΟ όπου υπάρχει: μια εγχώρια γραμμή που τη
// λέει θα έστελνε τον λογιστή να ψάξει φόρο που δεν οφείλεται.
ok(!myDataHint({ category: 'plumber', supply: 'domestic' }).note.includes('αντίστροφη'),
  'η εγχώρια δεν μιλά για αντίστροφη χρέωση');
ok(myDataHint({ category: 'subscription', supply: 'third_country' }).note.includes('αντίστροφη χρέωση'),
  'η τρίτη χώρα τη λέει');

console.log('\nΤι ζητά απόφαση, μαζεμένο');
{
  const rows = [
    { category: 'Ρεύμα',      description: 'ΔΕΗ Ιανουαρίου' },
    { category: 'Ρεύμα',      description: 'ΔΕΗ Φεβρουαρίου' },
    { category: 'Νερό',       description: 'ΕΥΔΑΠ' },
    { category: 'Υδραυλικός', description: 'Επισκευή' },
    { category: 'ΕΝΦΙΑ',      description: 'Δόση' },
    { category: 'Άλλο',       description: 'Ανεξήγητο' },
  ];
  const g = pendingGroups(rows, 'unknown');
  // Τρεις περιπτώσεις, όχι πέντε γραμμές: το ίδιο ερώτημα γράφεται μία φορά.
  eq('τρεις περιπτώσεις', g.length, 3);
  eq('τα τρία γενικά έξοδα μετρήθηκαν μαζί', g.find(x => x.label.includes('δικαίωμα'))!.count, 3);
  eq('ο υδραυλικός δεν ζητά τίποτα', g.some(x => x.sample.includes('Υδραυλικός')), false);
  eq('ο ΕΝΦΙΑ λέει ότι δεν χαρακτηρίζεται', g.some(x => x.label === 'Δεν χαρακτηρίζεται'), true);
  eq('το δείγμα δείχνει κατηγορία και περιγραφή', g.find(x => x.label === 'Ζητά κατηγορία')!.sample, 'Άλλο, Ανεξήγητο');
  // Με δηλωμένο δικαίωμα έκπτωσης, τα γενικά έξοδα παύουν να ρωτούν.
  const g2 = pendingGroups(rows, 'none');
  eq('μένουν μόνο ο ΕΝΦΙΑ και το «Άλλο»', g2.length, 2);
  eq('χωρίς δαπάνες, καμία ερώτηση', pendingGroups([], 'unknown').length, 0);
}

console.log('\nΟ πίνακας συνδυασμών της ΑΑΔΕ');
// ΟΙ ΜΗ ΕΠΙΤΡΕΠΤΟΙ ΣΥΝΔΥΑΣΜΟΙ ΑΠΟΡΡΙΠΤΟΝΤΑΙ ΣΤΗ ΔΙΑΒΙΒΑΣΗ. Αν φύγουν ως
// υπόδειξη, ο λογιστής τους πληκτρολογεί και τρώει το σφάλμα στο δικό του
// πρόγραμμα, χωρίς να ξέρει από πού ήρθαν.
eq('η λήψη υπηρεσιών δεν δέχεται αγορές εμπορευμάτων', isAllowedCombination('14.3', '2.1'), false);
eq('ούτε η τρίτη χώρα', isAllowedCombination('14.4', '2.2'), false);
eq('η απόκτηση αγαθών δεν δέχεται λήψη υπηρεσιών', isAllowedCombination('14.1', '2.3'), false);
eq('δέχεται όμως γενικά έξοδα', isAllowedCombination('14.1', '2.4'), true);
eq('ο ΕΦΚΑ δέχεται μόνο το 2.5', isAllowedCombination('14.5', '2.4'), false);
eq('χωρίς τύπο, καμία απαγόρευση', isAllowedCombination(null, '2.3'), true);
eq('χωρίς χαρακτηρισμό, καμία απαγόρευση', isAllowedCombination('14.3', null), true);

// Ό,τι βγάζει η βιβλιοθήκη πρέπει να περνά τον πίνακα. Κάθε κατηγορία της
// ταξινομίας, κάθε τόπος παροχής, κάθε δικαίωμα έκπτωσης: ούτε ένας συνδυασμός
// εκτός πίνακα.
{
  let bad = 0;
  for (const slug of Object.keys(CATEGORY_NATURE)) {
    for (const supply of ['domestic', 'intra_eu', 'third_country', null] as const) {
      for (const vat of ['full', 'none', 'unknown'] as const) {
        const h = myDataHint({ category: slug, supply, vat });
        if (!isAllowedCombination(h.invoiceType, h.expenseClass)) bad++;
      }
    }
  }
  eq('καμία υπόδειξη εκτός πίνακα', bad, 0);
}

eq('κάθε κατηγορία έχει μηχανικό όνομα', Object.keys(CATEGORY_CODE).length, Object.keys(EXPENSE_CLASS_LABEL).length);
eq('και είναι το όνομα της ΑΑΔΕ', CATEGORY_CODE['2.5'], 'category2_5');
ok((Object.keys(ALLOWED_CLASSES) as InvoiceType[]).every(t => (Object.keys(INVOICE_TYPE_LABEL) as InvoiceType[]).includes(t)),
  'κάθε τύπος του πίνακα έχει και λεκτικό');
ok((Object.keys(ALLOWED_CLASSES) as InvoiceType[]).every(t => ALLOWED_CLASSES[t].every(c => (c as ExpenseClass) in EXPENSE_CLASS_LABEL)),
  'καμία κατηγορία χωρίς λεκτικό, γιατί δεν γράφουμε όσες δεν ξέρουμε');

console.log(`\nmyData: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
