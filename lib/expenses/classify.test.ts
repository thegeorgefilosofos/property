// npx tsx lib/expenses/classify.test.ts
//
// Ο βοηθός καταχωρεί δαπάνη από μία φράση ΚΑΙ ανακοινώνει αν εκπίπτει. Άρα κάθε
// έλεγχος εδώ φυλάει φορολογικό ισχυρισμό που ακούει ο χρήστης, όχι μορφή
// δεδομένων.
import { classifyExpense } from './classify';
import { isGroupDeductible } from './groups';
import { CATEGORIES } from './taxonomy';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

// ═══ ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ════════════════════════════════
// Το παλιό λεξικό έλεγε ότι ο ΕΝΦΙΑ εκπίπτει και ο βοηθός το ανακοίνωνε με
// βεβαιότητα. Δεν εκπίπτει από το εισόδημα ενοικίων. Το παλιό τεστ κατοχύρωνε
// το λάθος ως προσδοκία — γι' αυτό επιβίωσε.
{
  const c = classifyExpense('πλήρωσα τον ΕΝΦΙΑ 520 ευρώ');
  eq('ΕΝΦΙΑ → η κατηγορία του', c.category, 'ΕΝΦΙΑ');
  ok('ΕΝΦΙΑ ΔΕΝ εκπίπτει', !c.deductible);
  ok('και η ομάδα του δεν είναι εκπεστέα', !isGroupDeductible(c.group));
}
// Οι συνδρομές είναι η άλλη μη εκπεστέα μέσα σε «οικιακή» οικογένεια.
{
  const c = classifyExpense('συνδρομή Netflix');
  ok('συνδρομές ΔΕΝ εκπίπτουν', !c.deductible);
  ok('ούτε η ομάδα τους', !isGroupDeductible(c.group));
}

// ═══ ΟΜΑΔΑ ΚΑΙ ΕΚΠΕΣΙΜΟΤΗΤΑ ΔΕΝ ΑΠΟΚΛΙΝΟΥΝ ΠΟΤΕ ═════════════════════════
// Δύο πεδία που απαντούν στο ίδιο ερώτημα, ελεγμένα για ΚΑΘΕ κατηγορία — όχι
// για όσες θυμήθηκε να γράψει κάποιος σε δείγμα.
{
  let bad = '';
  for (const cat of CATEGORIES) {
    const c = classifyExpense(cat.label);
    if (isGroupDeductible(c.group) !== c.deductible) bad = `${cat.slug}: ομάδα ${c.group} ≠ deductible ${c.deductible}`;
    else if (c.deductible !== cat.deductible) bad = `${cat.slug}: διαφωνία με την ταξινομία`;
  }
  eq('καμία κατηγορία δεν αποκλίνει από την ταξινομία', bad, '');
}

// ═══ Η ΕΛΛΗΝΙΚΗ ΚΛΙΣΗ ΠΙΑΝΕΤΑΙ ═══════════════════════════════════════════
// Ο χρήστης δεν γράφει λεξικό, γράφει πρόταση.
eq('ρεύμα από τον πάροχο', classifyExpense('Λογαριασμός ρεύματος ΔΕΗ').category, 'Ρεύμα');
eq('νερό', classifyExpense('πλήρωσα το νερό').category, 'Νερό');
eq('υδραυλικός σε αιτιατική', classifyExpense('πλήρωσα τον υδραυλικό για τη διαρροή').category, 'Υδραυλικός');
eq('καθαρισμός → καθαριότητα', classifyExpense('συνεργείο καθαρισμού').category, 'Καθαριότητα');
eq('ψυγείο → Συσκευές', classifyExpense('αγόρασα ψυγείο').category, 'Συσκευές');
eq('βαφές → Ανακαίνιση', classifyExpense('βαφές').category, 'Ανακαίνιση');

// Τα εκπεστέα παραμένουν εκπεστέα: η αυστηρότητα δεν έγινε τυφλή άρνηση.
ok('ρεύμα εκπίπτει', classifyExpense('ΔΕΗ').deductible);
ok('υδραυλικός εκπίπτει', classifyExpense('υδραυλικός').deductible);
ok('δημοτικά τέλη εκπίπτουν', classifyExpense('δημοτικά τέλη').deductible);

// ═══ ΑΓΝΩΣΤΟ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ ══════════════════════════════════════════════
eq('άγνωστο → Άλλο', classifyExpense('κάτι τυχαίο'), { group: 'other', category: 'Άλλο', deductible: false });
eq('κενό → Άλλο', classifyExpense(''), { group: 'other', category: 'Άλλο', deductible: false });
ok('το άγνωστο δεν εκπίπτει', !isGroupDeductible(classifyExpense('ασχετο κειμενο').group));

console.log(fail === 0 ? `✓ classify: ${pass} έλεγχοι πέρασαν` : `✗ classify: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
