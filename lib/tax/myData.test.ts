import {
  EXPENSE_CLASS_LABEL, INVOICE_TYPE_LABEL, CATEGORY_NATURE,
  natureOf, selfTransmittedInvoiceType, myDataHint, myDataCell, unmappedCategories,
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
eq('το πάγιο δεν είναι έξοδο χρήσης', fridge.expenseClass, null);
eq('αλλά η ενδοκοινοτική απόκτηση διαβιβάζεται', fridge.invoiceType, '14.1');
eq('και ζητά τον λογιστή', fridge.needsInput, true);
eq('ο ΕΝΦΙΑ δεν χαρακτηρίζεται', myDataHint({ category: 'ΕΝΦΙΑ' }).expenseClass, null);
eq('ούτε διαβιβάζεται', myDataHint({ category: 'ΕΝΦΙΑ', supply: 'domestic' }).invoiceType, null);
eq('άγνωστη κατηγορία, καθαρά κενό', myDataCell(myDataHint({ category: 'ξψζ' })), '');

console.log('\nΤο κελί του Excel');
eq('εγχώρια υπηρεσία', myDataCell(myDataHint({ category: 'plumber', supply: 'domestic' })), '2.3 Λήψη Υπηρεσιών');
eq('ενδοκοινοτική συνδρομή χωρίς έκπτωση',
  myDataCell(myDataHint({ category: 'subscription', supply: 'intra_eu', vat: 'none' })),
  '14.3 · 2.5 Γενικά Έξοδα χωρίς δικαίωμα έκπτωσης Φ.Π.Α.');
eq('όταν λείπει ο χαρακτηρισμός, μένει ο τύπος',
  myDataCell(myDataHint({ category: 'subscription', supply: 'third_country' })), '14.4');

console.log('\nΛεκτικά');
eq('πέντε κατηγορίες', Object.keys(EXPENSE_CLASS_LABEL).length, 5);
eq('το 2.5 λέει χωρίς δικαίωμα', EXPENSE_CLASS_LABEL['2.5'], 'Γενικά Έξοδα χωρίς δικαίωμα έκπτωσης Φ.Π.Α.');
ok(Object.values(INVOICE_TYPE_LABEL).every(l => l.length > 0), 'κάθε τύπος παραστατικού έχει λεκτικό');
// Η αντίστροφη χρέωση γράφεται ΜΟΝΟ όπου υπάρχει: μια εγχώρια γραμμή που τη
// λέει θα έστελνε τον λογιστή να ψάξει φόρο που δεν οφείλεται.
ok(!myDataHint({ category: 'plumber', supply: 'domestic' }).note.includes('αντίστροφη'),
  'η εγχώρια δεν μιλά για αντίστροφη χρέωση');
ok(myDataHint({ category: 'subscription', supply: 'third_country' }).note.includes('αντίστροφη χρέωση'),
  'η τρίτη χώρα τη λέει');

console.log(`\nmyData: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
