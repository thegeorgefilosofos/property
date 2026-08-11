import { findDuplicates, duplicateNotice, type ExpenseLike } from './duplicates';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};
const eq = (msg: string, got: unknown, want: unknown) =>
  ok(got === want, `${msg}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

const e = (o: Partial<ExpenseLike> = {}): ExpenseLike => ({
  id: 'x', description: 'Ρεύμα, ΔΕΗ', amount: 88.5, category: 'electricity',
  date: '2026-08-11', store_vendor: 'ΔΕΗ', ...o,
});

// Η γραμμή που υπάρχει ήδη στο καθολικό.
const existing = [e({ id: 'a' })];

console.log('Η ίδια δαπάνη, δύο φορές');
{
  const hits = findDuplicates(e({ id: undefined }), existing);
  eq('βρίσκεται', hits.length, 1);
  eq('και είναι σίγουρη', hits[0].strength, 'certain');
  ok(hits[0].reasons.some(r => /ίδιο ποσό/.test(r)), 'λέει το ποσό');
  ok(hits[0].reasons.includes('ίδια ημερομηνία'), 'λέει την ημερομηνία');
  ok(hits[0].reasons.includes('ίδιος πάροχος'), 'λέει τον πάροχο');
}

// Η ΠΡΑΓΜΑΤΙΚΗ ΠΕΡΙΠΤΩΣΗ: η σάρωση γράφει την έκδοση, το χέρι την πληρωμή.
console.log('\nΣάρωση τη Δευτέρα, χειροκίνητη την Πέμπτη');
{
  const hits = findDuplicates(e({ id: undefined, date: '2026-08-14' }), existing);
  eq('πιάνεται', hits.length, 1);
  eq('ως πιθανή, όχι σίγουρη', hits[0].strength, 'likely');
  ok(hits[0].reasons.some(r => /3 ημέρες διαφορά/.test(r)), 'λέει πόσες ημέρες διαφέρουν');
}
eq('μία ημέρα, στον ενικό',
  findDuplicates(e({ id: undefined, date: '2026-08-12' }), existing)[0].reasons.filter(r => /1 ημέρα/.test(r)).length, 1);

console.log('\nΟνόματα που γράφτηκαν αλλιώς');
ok(findDuplicates(e({ id: undefined, store_vendor: 'ΔΕΗ Α.Ε.' }), existing).length === 1,
  '«ΔΕΗ Α.Ε.» και «ΔΕΗ» είναι ο ίδιος πάροχος');
ok(findDuplicates(e({ id: undefined, store_vendor: 'δεη' }), existing).length === 1, 'πεζά και τόνοι δεν μετρούν');
// ΤΑ ΠΟΛΥ ΚΟΝΤΑ ΟΝΟΜΑΤΑ ΔΕΝ ΚΡΙΝΟΝΤΑΙ: ένα «ΟΤΕ» μέσα σε ένα «ΠΡΟΤΕΙΝΟΜΕΝΟ»
// δεν είναι ταύτιση παρόχου.
{
  const short = findDuplicates(
    e({ id: undefined, store_vendor: 'ΟΤ', description: 'ΟΤ', category: null }),
    [e({ id: 'a', store_vendor: 'ΠΡΟΤΕΙΝΟΜΕΝΟ', description: 'ΠΡΟΤΕΙΝΟΜΕΝΟ', category: null })]);
  eq('δύο γράμματα δεν ταιριάζουν με τίποτα', short.length, 0);
}

console.log('\nΤο ποσό είναι το σκληρό φίλτρο');
eq('άλλο ποσό, άλλη δαπάνη', findDuplicates(e({ id: undefined, amount: 88.6 }), existing).length, 0);
eq('δύο λεπτά ανοχή για στρογγυλοποίηση', findDuplicates(e({ id: undefined, amount: 88.52 }), existing).length, 1);
eq('μηδενικό ποσό δεν ελέγχεται', findDuplicates(e({ id: undefined, amount: 0 }), existing).length, 0);
eq('αρνητικό ποσό δεν ελέγχεται', findDuplicates(e({ id: undefined, amount: -88.5 }), existing).length, 0);

console.log('\nΠότε ΔΕΝ είναι διπλοεγγραφή');
eq('μακρινή ημερομηνία', findDuplicates(e({ id: undefined, date: '2026-09-11' }), existing).length, 0);
eq('άλλη κατηγορία και άλλος πάροχος',
  findDuplicates(e({ id: undefined, category: 'water', store_vendor: 'ΕΥΔΑΠ', description: 'Νερό' }), existing).length, 0);
// Ο υποψήφιος δεν είναι διπλότυπο του ΕΑΥΤΟΥ του, αλλιώς κάθε διόρθωση υπάρχουσας
// γραμμής θα χτυπούσε προειδοποίηση.
eq('η ίδια γραμμή εξαιρείται', findDuplicates(e({ id: 'a' }), existing).length, 0);

console.log('\nΊδια κατηγορία και τίποτα άλλο');
{
  const hits = findDuplicates(
    e({ id: undefined, store_vendor: 'Ήρων', description: 'Ρεύμα εξοχικού' }),
    [e({ id: 'a', store_vendor: 'ΔΕΗ', description: 'Ρεύμα κατοικίας' })]);
  eq('μένει «πιθανή»', hits[0]?.strength, 'possible');
  ok(hits[0].reasons.includes('ίδια κατηγορία'), 'και λέει γιατί');
}

console.log('\nΟ ίδιος λογαριασμός');
{
  const hits = findDuplicates(
    { amount: 40, date: '2026-01-01', bill_id: 'b1' },
    [{ id: 'a', amount: 999, date: '2020-01-01', bill_id: 'b1' }]);
  eq('εξοφλείται μία φορά, ό,τι κι αν λένε τα υπόλοιπα', hits[0]?.strength, 'certain');
  ok(hits[0].reasons[0].includes('έχει ήδη εξοφληθεί'), 'και το λέει καθαρά');
}

console.log('\nΣειρά και μήνυμα');
{
  const many = findDuplicates(e({ id: undefined }), [
    e({ id: 'far', date: '2026-08-14', store_vendor: 'ΔΕΗ' }),
    e({ id: 'weak', store_vendor: 'Ήρων', description: 'Άλλο' }),
    e({ id: 'exact' }),
  ]);
  eq('πρώτη η σιγουρότερη', many[0].row.id, 'exact');
  eq('μετά η πιθανή', many[1].row.id, 'far');
  eq('τελευταία η αδύναμη', many[2].row.id, 'weak');

  const msg = duplicateNotice(many);
  ok(msg.includes('Υπάρχει ήδη'), 'το σίγουρο το λέει «υπάρχει ήδη»');
  ok(msg.includes('11/08/2026'), 'με ελληνική ημερομηνία');
  ok(msg.includes('ακόμη 2 παρόμοιες'), 'και μετρά τις υπόλοιπες');
  ok(msg.includes('μην την καταχωρήσεις δεύτερη φορά'), 'και λέει τι να κάνει');
  ok(!/!/.test(msg), 'χωρίς θαυμαστικό: δεν είναι σφάλμα του χρήστη');
}
eq('χωρίς ευρήματα, καμία πρόταση', duplicateNotice([]), '');
ok(duplicateNotice(findDuplicates(e({ id: undefined, date: '2026-08-14' }), existing)).startsWith('Μοιάζει με'),
  'η πιθανή δεν παριστάνει τη βεβαιότητα');

console.log(`\nduplicates: ${fails === 0 ? "✓ όλα" : `✗ ${fails}`}`);
if (fails) process.exit(1);
