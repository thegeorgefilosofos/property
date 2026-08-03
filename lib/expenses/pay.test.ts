// npx tsx lib/expenses/pay.test.ts
//
// Κάθε έλεγχος εδώ προστατεύει ΦΟΡΟΛΟΓΙΚΗ συνέπεια, όχι μορφή δεδομένων. Το
// σφάλμα που τον γέννησε: ο ίδιος λογαριασμός εξέπιπτε ή όχι ανάλογα με το
// ποιο κουμπί «Πληρώθηκε» πάτησε ο χρήστης.
import { planBillPayment, billCategory } from './pay';
import { isGroupDeductible } from './groups';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

const CTX = { propertyId: 'p1', userId: 'u1', nowIso: '2026-08-03T09:00:00.000Z', hasLinkedExpense: false };
const DEH = { id: 'b1', name: 'ΔΕΗ Ιουλίου', amount: 84.5, category: 'electricity' };

// ═══ Η ΟΜΑΔΑ ΓΡΑΦΕΤΑΙ ΠΑΝΤΑ — ΕΚΕΙ ΗΤΑΝ ΤΟ ΛΑΘΟΣ ══════════════════════════
{
  const plan = planBillPayment(DEH, CTX);
  ok('δημιουργείται δαπάνη', plan.newExpense !== null);
  eq('η ομάδα γράφεται', plan.newExpense?.expense_group, 'fixed');
  eq('η κατηγορία από τη μία πηγή', plan.newExpense?.category, 'Ρεύμα');
  ok('και άρα ΕΚΠΙΠΤΕΙ', isGroupDeductible(plan.newExpense?.expense_group));
  eq('το ποσό δεν αλλοιώνεται', plan.newExpense?.amount, 84.5);
  eq('η ημερομηνία είναι η ημέρα πληρωμής', plan.newExpense?.date, '2026-08-03');
  eq('ο λογαριασμός σημειώνεται πληρωμένος', plan.bill, { paid: true, paid_at: CTX.nowIso });
}

// Η ΠΑΛΙΑ ΔΙΑΔΡΟΜΗ ΤΩΝ ΔΑΠΑΝΩΝ δεν έγραφε expense_group. Αυτός ο έλεγχος
// αποτυπώνει γιατί ήταν σφάλμα και όχι παράλειψη μορφής.
{
  ok('κενή ομάδα ΔΕΝ εκπίπτει — η ρίζα του προβλήματος', !isGroupDeductible(undefined));
  ok('κενό κείμενο ούτε', !isGroupDeductible(''));
}

// ═══ ΤΟ «ΑΛΛΟ» ΔΕΝ ΓΙΝΕΤΑΙ ΣΙΩΠΗΛΑ ΕΚΠΕΣΤΕΟ ═══════════════════════════════
// Το BILL_GROUP δεν είχε κλειδί `other` και έπεφτε σε { group: 'fixed' } —
// δηλαδή κάθε λογαριασμός «Άλλο» γινόταν εκπεστέος χωρίς να το πει κανείς.
{
  const plan = planBillPayment({ id: 'b2', name: 'Κάτι άλλο', amount: 30, category: 'other' }, CTX);
  eq('other → ομάδα other', plan.newExpense?.expense_group, 'other');
  ok('και ΔΕΝ εκπίπτει', !isGroupDeductible(plan.newExpense?.expense_group));
}
{
  const plan = planBillPayment({ id: 'b3', name: 'Άγνωστο', amount: 12, category: 'κατι_ανυπαρκτο' }, CTX);
  eq('άγνωστη κατηγορία → other, όχι fixed', plan.newExpense?.expense_group, 'other');
  ok('άγνωστη κατηγορία δεν εκπίπτει', !isGroupDeductible(plan.newExpense?.expense_group));
}
{
  const plan = planBillPayment({ id: 'b4', amount: 12 }, CTX);
  eq('χωρίς κατηγορία → other', plan.newExpense?.expense_group, 'other');
  eq('χωρίς όνομα → η ετικέτα της κατηγορίας', plan.newExpense?.description, 'Άλλο');
}

// ═══ ΚΑΜΙΑ ΔΕΥΤΕΡΗ ΓΡΑΜΜΗ ΟΤΑΝ ΥΠΑΡΧΕΙ ΗΔΗ ════════════════════════════════
{
  const plan = planBillPayment(DEH, { ...CTX, hasLinkedExpense: true });
  eq('μόνο σήμανση', plan.linkedExpenseUpdate, { paid: true });
  eq('καμία νέα δαπάνη', plan.newExpense, null);
  eq('ο λογαριασμός σημειώνεται κανονικά', plan.bill.paid, true);
}

// ═══ ΤΑ ΣΤΟΙΧΕΙΑ ΕΠΙΜΕΡΙΣΜΟΥ ΔΕΝ ΧΑΝΟΝΤΑΙ ═════════════════════════════════
// Η διαδρομή των Δαπανών τα έχανε εντελώς: ποιος πλήρωσε και με τι ποσοστό.
{
  const plan = planBillPayment(
    { ...DEH, paid_by: 'tenant', share_percent: 40, share_note: 'κοινόχρηστο μέρος' }, CTX);
  eq('ποιος πλήρωσε', plan.newExpense?.paid_by, 'tenant');
  eq('ποσοστό επιμερισμού', plan.newExpense?.share_percent, 40);
  eq('σημείωση επιμερισμού', plan.newExpense?.share_note, 'κοινόχρηστο μέρος');
}
{
  const plan = planBillPayment(DEH, CTX);
  eq('χωρίς επιμερισμό → owner', plan.newExpense?.paid_by, 'owner');
  eq('χωρίς ποσοστό → null, όχι 0', plan.newExpense?.share_percent, null);
}

// ═══ ΚΑΘΕ ΚΑΤΗΓΟΡΙΑ ΛΟΓΑΡΙΑΣΜΟΥ ΔΙΝΕΙ ΥΠΑΡΚΤΗ ΟΜΑΔΑ ═══════════════════════
// Χωρίς αυτό, μια νέα κατηγορία λογαριασμού θα έμπαινε με κενή ομάδα και θα
// έπεφτε σιωπηλά έξω από τις εκπτώσεις.
{
  const CATEGORIES = ['electricity','water','gas','internet','streaming','insurance','taxes',
    'municipal','security','common','maintenance','elevator','pool','gardener','cleaner',
    'plumber','electrician','other'];
  let bad = '';
  for (const c of CATEGORIES) {
    const { group, cat } = billCategory(c);
    if (!group || !cat) bad = c;
  }
  eq('καμία κατηγορία χωρίς ομάδα και ετικέτα', bad, '');
}

console.log(fail === 0 ? `✓ pay: ${pass} έλεγχοι πέρασαν` : `✗ pay: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
