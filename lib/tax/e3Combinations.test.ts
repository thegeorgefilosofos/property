import {
  e3CodesFor, e3NoteFor, e3Triples, e3PairCount, expenseClassSign,
  INCOME_CLASS_LABEL, EXPENSE_CLASS_LABEL_ALL, E3_LABEL,
} from './e3Combinations';
import { EXPENSE_CLASS_LABEL, type ExpenseClass } from './myData';

import { AADE_DOC_TYPES } from './aadeDocTypes';
import { ALLOWED_CLASSES, CATEGORY_CODE, type InvoiceType } from './myData';

let fails = 0;
const ok = (c: boolean, m: string) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fails++; } };
const eq = (m: string, got: unknown, want: unknown) =>
  ok(got === want, `${m}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

console.log('Ο πίνακας, όπως τον γράφει η ΑΑΔΕ');
eq('τριακόσια είκοσι ζεύγη τύπου και χαρακτηρισμού', e3PairCount(), 320);
const triples = e3Triples();
eq('χίλιοι τριακόσιοι επτά επιτρεπτοί κωδικοί', triples.filter(t => t.code).length, 1307);
ok(triples.every(t => t.code === '' || /^E3_[0-9_]+$/.test(t.code)), 'κάθε κωδικός είναι καλοσχηματισμένος');
ok(triples.every(t => /^category[123](_\d+)?$/.test(t.category)), 'κάθε χαρακτηρισμός επίσης');
// ΤΟ ΚΕΝΟ ΔΕΝ ΜΕΝΕΙ ΑΝΕΞΗΓΗΤΟ. Όπου η ΑΑΔΕ δεν δίνει κωδικό, δίνει πρόταση: μια
// κενή γραμμή χωρίς αυτήν θα διαβαζόταν ως «δεν βρήκα», και είναι «δεν υπάρχει».
ok(triples.filter(t => !t.code).every(t => t.note.length > 0), 'κάθε ζεύγος χωρίς κωδικό κουβαλά τη σημείωσή του');

console.log('\nΟι συνδυασμοί που αφορούν ακίνητο');
// Τα ενοίκια ως ΕΣΟΔΟ: υπηρεσία → E3_561_001, λοιπά έσοδα → E3_562.
eq('8.1 με παροχή υπηρεσιών', e3CodesFor('8.1', 'category1_3').join(', '), 'E3_561_001');
eq('8.1 με λοιπά έσοδα', e3CodesFor('8.1', 'category1_5').join(', '), 'E3_562');
// Τα ενοίκια ως ΕΞΟΔΟ δέχονται μόνο δύο κωδικούς, και οι δύο του 585.
eq('16.1 χωρίς δικαίωμα έκπτωσης', e3CodesFor('16.1', 'category2_5').join(', '), 'E3_585_014, E3_585_016');
// Η ενδοκοινοτική λήψη υπηρεσιών, ο τύπος που παράγει η ίδια η εφαρμογή.
ok(e3CodesFor('14.3', 'category2_3').includes('E3_585_001'), '14.3 με λήψη υπηρεσιών δέχεται το E3_585_001');
ok(e3CodesFor('14.3', 'category2_3').length > 5, 'και δεν είναι ένας: η επιλογή είναι του λογιστή');
eq('συνδυασμός που δεν υπάρχει', e3CodesFor('14.3', 'category2_1').length, 0);
eq('άγνωστος τύπος', e3CodesFor('ξψζ', 'category2_1').length, 0);
ok(e3NoteFor('8.1', 'category1_9').includes('επόμενη χρήση'), 'η σημείωση για τα έσοδα επομένων χρήσεων');
eq('όπου υπάρχει κωδικός, δεν χρειάζεται σημείωση', e3NoteFor('8.1', 'category1_3'), '');

// ══ ΔΥΟ ΑΝΑΓΝΩΣΕΙΣ ΤΗΣ ΙΔΙΑΣ ΠΗΓΗΣ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΑΠΟΚΛΙΝΟΥΝ ═══════════
// Το aadeDocTypes.ts διάβασε την ΠΡΩΤΗ στήλη κάθε φύλλου (ποιοι χαρακτηρισμοί),
// αυτό εδώ τη ΔΕΥΤΕΡΗ (ποιοι κωδικοί Ε3 ανά χαρακτηρισμό). Αν το ένα ξέρει
// συνδυασμό που το άλλο αγνοεί, κάποια από τις δύο αναγνώσεις έχει χάσει γραμμές.
console.log('\nΣυμφωνία με το μητρώο των τύπων');
const missing: string[] = [];
for (const t of Object.keys(AADE_DOC_TYPES)) {
  for (const c of [...AADE_DOC_TYPES[t].income, ...AADE_DOC_TYPES[t].expense]) {
    if (!e3CodesFor(t, c).length && !e3NoteFor(t, c)) missing.push(`${t}|${c}`);
  }
}
eq('κάθε χαρακτηρισμός του μητρώου υπάρχει και εδώ', missing.join(', '), '');
// Και το αντίστροφο: ό,τι ξέρει αυτός ο πίνακας πρέπει να το ξέρει το μητρώο.
const orphan = triples.filter(t => {
  const reg = AADE_DOC_TYPES[t.type];
  return !reg || (!reg.income.includes(t.category) && !reg.expense.includes(t.category));
});
eq('κανένα ορφανό ζεύγος', [...new Set(orphan.map(o => `${o.type}|${o.category}`))].join(', '), '');
// Και οι επτά τύποι που παράγει η εφαρμογή έχουν κωδικούς Ε3 για κάθε
// χαρακτηρισμό που υποδεικνύει: αλλιώς η υπόδειξη σταματά στη μέση.
for (const t of Object.keys(ALLOWED_CLASSES) as InvoiceType[]) {
  const gaps = ALLOWED_CLASSES[t].map(c => CATEGORY_CODE[c as ExpenseClass])
    .filter(c => !e3CodesFor(t, c).length && !e3NoteFor(t, c));
  ok(gaps.length === 0, `ο τύπος ${t} έχει κωδικούς Ε3 για κάθε χαρακτηρισμό${gaps.length ? ` — λείπουν ${gaps.join(', ')}` : ''}`);
}

console.log('\nΤα λεκτικά');
eq('δώδεκα κατηγορίες εσόδων', Object.keys(INCOME_CLASS_LABEL).length, 12);
eq('η παροχή υπηρεσιών', INCOME_CLASS_LABEL.category1_3, 'Έσοδα από Παροχή Υπηρεσιών');
// Κάθε κατηγορία εσόδων του μητρώου πρέπει να έχει όνομα: μια στήλη «1.7» χωρίς
// λεκτικό είναι ακριβώς το πρόβλημα που λύνει αυτός ο πίνακας.
const incomeCats = new Set(Object.values(AADE_DOC_TYPES).flatMap(d => d.income).filter(c => c.startsWith('category1_')));
eq('καμία κατηγορία εσόδων χωρίς όνομα', [...incomeCats].filter(c => !INCOME_CLASS_LABEL[c]).join(', '), '');
eq('τα λοιπά συνήθη έσοδα', E3_LABEL.E3_562, 'Λοιπά συνήθη έσοδα');
eq('τα ενοίκια ως έξοδο στο Ε3', E3_LABEL.E3_585_014, 'Ενοίκια');
ok(Object.keys(E3_LABEL).every(k => /^E3_/.test(k)), 'κάθε κλειδί είναι κωδικός Ε3');

// ══ ΚΑΝΕΝΑΣ ΚΩΔΙΚΟΣ ΚΑΙ ΚΑΜΙΑ ΚΑΤΗΓΟΡΙΑ ΔΕΝ ΜΕΝΕΙ ΑΝΩΝΥΜΗ ═══════════════════
// Ένας κωδικός χωρίς όνομα σε έγγραφο λογιστή είναι γρίφος: ξέρει ότι πρέπει να
// γράψει «E3_585_010» κάπου, δεν ξέρει αν είναι το σωστό.
{
  const codes = [...new Set(e3Triples().filter(t => t.code).map(t => t.code))];
  eq('κάθε κωδικός Ε3 του πίνακα έχει ονομασία', codes.filter(c => !E3_LABEL[c]).join(', '), '');
  const cats = [...new Set(e3Triples().map(t => t.category))];
  eq('κάθε κατηγορία επίσης',
    cats.filter(c => !EXPENSE_CLASS_LABEL_ALL[c] && !INCOME_CLASS_LABEL[c]).join(', '), '');
}
eq('δεκαπέντε κατηγορίες εξόδων', Object.keys(EXPENSE_CLASS_LABEL_ALL).length, 15);
// ΔΥΟ ΠΙΝΑΚΕΣ ΓΙΑ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΑΠΟΚΛΙΝΟΥΝ. Το myData.ts
// ονομάζει τους εννέα που παράγει η εφαρμογή· εδώ είναι και οι δεκαπέντε.
for (const c of Object.keys(EXPENSE_CLASS_LABEL) as ExpenseClass[]) {
  eq(`το ${c} λέγεται το ίδιο και στα δύο`, EXPENSE_CLASS_LABEL_ALL[`category${c.replace('.', '_')}`], EXPENSE_CLASS_LABEL[c]);
}
// Το πρόσημο: δύο κατηγορίες δέχονται ένα μόνο, οι υπόλοιπες και τα δύο.
eq('τα αποθέματα έναρξης πάντα αφαιρούνται', expenseClassSign('category2_13'), '−');
eq('τα αποθέματα λήξης πάντα προστίθενται', expenseClassSign('category2_14'), '+');
eq('η λήψη υπηρεσιών δέχεται και πιστωτικό', expenseClassSign('category2_3'), '+ ή −');

console.log(`\ne3Combinations: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
