// npx tsx lib/expenses/pay.test.ts
//
// Κάθε έλεγχος εδώ προστατεύει ΦΟΡΟΛΟΓΙΚΗ συνέπεια, όχι μορφή δεδομένων. Το
// σφάλμα που τον γέννησε: ο ίδιος λογαριασμός εξέπιπτε ή όχι ανάλογα με το
// ποιο κουμπί «Πληρώθηκε» πάτησε ο χρήστης.
import { planBillPayment, billCategory } from './pay';
import { isGroupDeductible } from './groups';
import { isDeductible, BY_SLUG, resolveCategory } from './taxonomy';
import { EXPENSE_MAP } from '../billing/parse';

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

// ═══ Ο ΕΝΦΙΑ ΚΑΙ ΟΙ ΣΥΝΔΡΟΜΕΣ ΔΕΝ ΓΙΝΟΝΤΑΙ ΕΚΠΕΣΤΕΟΙ ══════════════════════
// Τα κλειδιά των λογαριασμών ΔΕΝ είναι slug της ταξινομίας. Το `taxes`
// αστοχούσε στο BY_SLUG και κληρονομούσε την ομάδα του ΧΑΡΤΗ, που είναι
// 'fixed' — δηλαδή εκπεστέα. Τα βήματα, με το χέρι:
//   EXPENSE_MAP['taxes']         → { group: 'fixed', cat: 'ΕΝΦΙΑ' }
//   BY_SLUG['taxes']             → undefined            (το slug είναι 'enfia')
//   resolveCategory('ΕΝΦΙΑ')     → 'enfia'              (συνώνυμο 'ενφια')
//   BY_SLUG['enfia'].deductible  → false
//   groupForCategory(...)        → 'other'              (deductible:false ⇒ other)
// Πριν τη διόρθωση έβγαινε 'fixed' και ο ΕΝΦΙΑ μετρούσε στις εκπτώσεις.
{
  const enfia = planBillPayment({ id: 'b5', name: 'ΕΝΦΙΑ 2026', amount: 340, category: 'taxes' }, CTX);
  eq('ΕΝΦΙΑ → ομάδα other', enfia.newExpense?.expense_group, 'other');
  eq('η ετικέτα μένει «ΕΝΦΙΑ»', enfia.newExpense?.category, 'ΕΝΦΙΑ');
  ok('ΕΝΦΙΑ ΔΕΝ εκπίπτει', !isGroupDeductible(enfia.newExpense?.expense_group));

  // Ίδια διαδρομή: 'streaming' → ετικέτα «Άλλη Πάγια» → slug 'subscription',
  // deductible:false ⇒ 'other'. Πριν: 'fixed', δηλαδή το Netflix εξέπιπτε.
  const netflix = planBillPayment({ id: 'b6', name: 'Netflix', amount: 9.99, category: 'streaming' }, CTX);
  eq('συνδρομή → ομάδα other', netflix.newExpense?.expense_group, 'other');
  ok('συνδρομή ΔΕΝ εκπίπτει', !isGroupDeductible(netflix.newExpense?.expense_group));
}

// Και τα υπόλοιπα αναντίστοιχα κλειδιά ΔΕΝ έχασαν την έκπτωσή τους:
//   cleaner→cleaning, gardener→garden, maintenance→repair — όλα family 'upkeep'
//   με deductible:true ⇒ FAMILY_GROUP['upkeep'] = 'maintenance'.
//   municipal→municipal (official, deductible:true) ⇒ 'fixed'.
{
  const WANT: ReadonlyArray<readonly [string, string]> = [
    ['cleaner', 'maintenance'], ['gardener', 'maintenance'], ['maintenance', 'maintenance'],
    ['municipal', 'fixed'], ['electricity', 'fixed'],
  ];
  for (const [key, want] of WANT) {
    const { group } = billCategory(key);
    eq(`${key} → ${want}`, group, want);
    ok(`${key} εξακολουθεί να εκπίπτει`, isGroupDeductible(group));
  }
}

// ═══ Ο ΧΑΡΤΗΣ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΔΙΑΦΩΝΕΙ ΜΕ ΤΗΝ ΤΑΞΙΝΟΜΙΑ ════════════════
// Το EXPENSE_MAP κρατά δική του στήλη `group` — δεύτερος άξονας που μπορεί να
// πει «εκπίπτει» εκεί που η ταξινομία λέει όχι. Εδώ ελέγχεται ΚΑΘΕ κλειδί, όχι
// μόνο όσα θυμηθήκαμε: αν κάποιο ξαναδιαφωνήσει, πέφτει αυτό το τεστ.
{
  let bad = '';
  for (const [key, m] of Object.entries(EXPENSE_MAP)) {
    const { group } = billCategory(key);
    if (isGroupDeductible(group) !== isDeductible(m.cat)) bad = key;
  }
  eq('καμία κατηγορία λογαριασμού δεν διαφωνεί με την ταξινομία', bad, '');
}

// ═══ Η ΤΑΞΙΝΟΜΙΑ ΑΠΑΝΤΑ ΓΙΑ ΚΑΘΕ ΚΛΕΙΔΙ — Η ΥΠΟΧΩΡΗΣΗ ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ ══════
// Το προηγούμενο τεστ ελέγχει ότι χάρτης και ταξινομία ΣΥΜΦΩΝΟΥΝ. Συμφωνούν
// όμως και όταν η ταξινομία δεν έχει γνώμη: η υποχώρηση δίνει την ομάδα του
// χάρτη, κι αν τύχει να ταιριάζει, το τεστ περνά χωρίς η ταξινομία να έχει
// αποφανθεί ποτέ. Έτσι ακριβώς κρύφτηκε το αρχικό λάθος. Εδώ ελέγχεται ότι η
// απάντηση ΠΡΑΓΜΑΤΙΚΑ βγαίνει από τη μία πηγή για ΟΛΑ τα κλειδιά — αν κάποιος
// προσθέσει αύριο κατηγορία που η ταξινομία δεν αναγνωρίζει, φαίνεται αμέσως.
{
  const unresolved: string[] = [];
  for (const [key, m] of Object.entries(EXPENSE_MAP)) {
    const slug = BY_SLUG[key] ? key : resolveCategory(m.cat);
    if (!slug || !BY_SLUG[slug]) unresolved.push(key);
  }
  eq('κάθε κατηγορία λογαριασμού βρίσκει κατηγορία στην ταξινομία', unresolved.join(','), '');
}

// Οι δύο που ΔΕΝ εκπίπτουν, ονομαστικά: ήταν η ζημιά που έκανε η υποχώρηση.
eq('ΕΝΦΙΑ (taxes) δεν εκπίπτει', isGroupDeductible(billCategory('taxes').group), false);
eq('συνδρομές (streaming) δεν εκπίπτουν', isGroupDeductible(billCategory('streaming').group), false);

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

// ═══ Η ΩΡΑ ΤΗΣ ΑΘΗΝΑΣ ΟΡΙΖΕΙ ΤΟΝ ΦΟΡΟΛΟΓΙΚΟ ΜΗΝΑ, ΟΧΙ Η UTC ══════════════
// Το `nowIso.slice(0, 10)` έκοβε τη στιγμή σε UTC. Τα ξημερώματα της 1ης
// Ιουλίου, με θερινή ώρα (UTC+3), η δαπάνη έμπαινε στις 30 Ιουνίου —
// σε άλλο φορολογικό μήνα. Την πρωτοχρονιά, σε άλλο φορολογικό ΕΤΟΣ.
{
  // 01:30 Αθήνας, 1 Ιουλίου 2026 = 22:30 UTC, 30 Ιουνίου 2026.
  const plan = planBillPayment(DEH, { ...CTX, nowIso: '2026-06-30T22:30:00.000Z' });
  eq('01:30 της 1ης Ιουλίου → Ιούλιος, όχι Ιούνιος', plan.newExpense?.date, '2026-07-01');

  // 02:00 Αθήνας, 1 Ιανουαρίου 2027 = 00:00 UTC — εδώ η UTC συμφωνεί.
  const ny = planBillPayment(DEH, { ...CTX, nowIso: '2027-01-01T00:00:00.000Z' });
  eq('πρωτοχρονιά 02:00 → 2027', ny.newExpense?.date, '2027-01-01');

  // 01:00 Αθήνας, 1 Ιανουαρίου 2027 = 23:00 UTC, 31 Δεκεμβρίου 2026.
  // Χωρίς τη διόρθωση η δαπάνη έπεφτε σε ΠΡΟΗΓΟΥΜΕΝΗ φορολογική χρήση.
  const eve = planBillPayment(DEH, { ...CTX, nowIso: '2026-12-31T23:00:00.000Z' });
  eq('01:00 της πρωτοχρονιάς → 2027, όχι 2026', eve.newExpense?.date, '2027-01-01');

  // Και το `paid_at` μένει η ακριβής στιγμή σε UTC: χρονοσήμανση, όχι ημέρα.
  eq('το paid_at παραμένει η στιγμή σε UTC', eve.bill.paid_at, '2026-12-31T23:00:00.000Z');
}

console.log(fail === 0 ? `✓ pay: ${pass} έλεγχοι πέρασαν` : `✗ pay: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
