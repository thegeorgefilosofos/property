// npx tsx lib/rent/collect.test.ts
import { collectableLines, allViaBank, type CollectableRent } from './collect';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}\n   πήρα:    ${JSON.stringify(a)}\n   περίμενα: ${JSON.stringify(b)}`);

const TODAY = '2026-09-05';
const NAMES: Record<string, string> = { p1: 'Αλεξάνδρας 12', p2: 'Πατησίων 5' };
const nameOf = (id: string) => NAMES[id] || 'Ακίνητο';
const r = (over: Partial<CollectableRent> = {}): CollectableRent => ({
  id: 'r1', property_id: 'p1', tenant_id: 't1', amount: 450,
  due_date: '2026-09-01', paid: false, period_year: 2026, period_month: 9, ...over,
});

// ── ΤΙ ΜΠΑΙΝΕΙ ΣΤΗ ΛΙΣΤΑ ──────────────────────────────────────────────────
{
  const [l] = collectableLines([r()], nameOf, TODAY);
  eq(l.label, 'Ενοίκιο Σεπτεμβρίου 2026', 'με ΕΝΑ ακίνητο, το όνομά του δεν λέγεται σε κάθε γραμμή');
  eq(l.amount, 450, 'το ποσό της δόσης');
  eq(l.due, '2026-09-01', 'και η προθεσμία της');
  eq(l.daysLeft, -4, 'τέσσερις ημέρες πίσω');
  eq(l.rent?.id, 'r1', 'η γραμμή ξέρει ποια δόση είναι');
  eq(l.rent?.propertyId, 'p1', 'και σε ποιο ακίνητο');
  eq(l.rent?.tenantId, 't1', 'και σε ποια μίσθωση');
}
{
  // ΤΟ ΕΝΟΙΚΙΟ ΠΟΥ ΛΗΓΕΙ ΣΗΜΕΡΑ ΕΙΝΑΙ ΑΚΡΙΒΩΣ Η ΠΕΡΙΠΤΩΣΗ: μόλις μπήκε το
  // έμβασμα. Η κάρτα «Μου χρωστάνε» σωστά δεν το μετρά ως οφειλή· εδώ η
  // ερώτηση είναι άλλη, «τι μπορώ να καταχωρήσω σήμερα».
  const lines = collectableLines([r({ due_date: TODAY })], nameOf, TODAY);
  eq(lines.length, 1, 'η δόση που λήγει σήμερα μπαίνει');
  eq(lines[0].daysLeft, 0, 'και δεν λέει ψέματα ότι άργησε');
}

// ── ΤΙ ΔΕΝ ΜΠΑΙΝΕΙ ────────────────────────────────────────────────────────
eq(collectableLines([r({ paid: true })], nameOf, TODAY).length, 0, 'η εισπραγμένη δεν ξαναεισπράττεται');
eq(collectableLines([r({ due_date: '2026-10-01' })], nameOf, TODAY).length, 0,
  'ΤΙΠΟΤΑ ΤΟΥ ΕΠΟΜΕΝΟΥ ΜΗΝΑ: η προεξόφληση γράφεται εκεί όπου συζητιέται');
eq(collectableLines([r({ due_date: null })], nameOf, TODAY).length, 0, 'χωρίς προθεσμία δεν ξέρουμε αν ήρθε η ώρα της');
eq(collectableLines([r({ due_date: 'χαλασμένη' })], nameOf, TODAY).length, 0, 'ούτε με ημερομηνία που δεν διαβάζεται');
eq(collectableLines([r({ amount: 0 })], nameOf, TODAY).length, 0, 'μηδενική δόση δεν είναι είσπραξη');
eq(collectableLines([r({ amount: null })], nameOf, TODAY).length, 0, 'ούτε δόση χωρίς ποσό');

// ── ΜΕ ΠΟΛΛΑ ΑΚΙΝΗΤΑ, ΤΟ ΟΝΟΜΑ ΞΕΧΩΡΙΖΕΙ ΤΙΣ ΓΡΑΜΜΕΣ ────────────────────
{
  const lines = collectableLines([
    r({ id: 'a', property_id: 'p1' }),
    r({ id: 'b', property_id: 'p2', tenant_id: 't2' }),
  ], nameOf, TODAY);
  eq(lines.length, 2, 'δύο δόσεις, δύο γραμμές');
  ok(lines.every(l => l.label.includes('·')), 'και οι δύο λένε σε ποιο ακίνητο ανήκουν');
  eq(lines[0].label, 'Αλεξάνδρας 12 · Ενοίκιο Σεπτεμβρίου 2026', 'με το όνομα μπροστά');
}

// ── ΑΡΧΑΙΟΤΕΡΗ ΠΡΩΤΗ ──────────────────────────────────────────────────────
// Μια καταχώρηση που κόπηκε στη μέση αφήνει ανοιχτές τις ΝΕΟΤΕΡΕΣ, όχι τις παλιές.
{
  const lines = collectableLines([
    r({ id: 'new', due_date: '2026-09-01' }),
    r({ id: 'old', due_date: '2026-07-01', period_month: 7 }),
    r({ id: 'mid', due_date: '2026-08-01', period_month: 8 }),
  ], nameOf, TODAY);
  eq(lines.map(l => l.rent?.id).join(','), 'old,mid,new', 'η σειρά είναι η σειρά της πίεσης');
}
{
  // Ιση καθυστέρηση: πρώτα το μεγαλύτερο ποσό.
  const lines = collectableLines([
    r({ id: 'small', amount: 100, property_id: 'p1' }),
    r({ id: 'big', amount: 900, property_id: 'p2' }),
  ], nameOf, TODAY);
  eq(lines[0].rent?.id, 'big', 'στην ίδια ημέρα προηγείται το μεγαλύτερο');
}

// ── Ο ΤΡΟΠΟΣ ΕΙΣΠΡΑΞΗΣ ΑΛΛΑΖΕΙ ΤΟΝ ΦΟΡΟ, ΑΡΑ ΘΕΛΕΙ ΟΜΟΦΩΝΙΑ ──────────────
{
  const lines = collectableLines([
    r({ id: 'a', tenant_id: 't1' }), r({ id: 'b', tenant_id: 't2', property_id: 'p2' }),
  ], nameOf, TODAY);
  ok(allViaBank(lines, () => true), 'με όλες τις μισθώσεις σε τράπεζα, προεπιλογή η τράπεζα');
  ok(!allViaBank(lines, id => id === 't1'), 'ΜΙΑ μίσθωση σε μετρητά αρκεί για να μην προεπιλεγεί η τράπεζα');
  ok(!allViaBank(lines, () => false), 'και με καμία, ασφαλώς όχι');
  ok(!allViaBank([], () => true), 'χωρίς γραμμές δεν υπάρχει ομοφωνία να δηλωθεί');
}

console.log(`\nrent/collect.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
