import { rentCollectionMode, collectionModeReason } from './rentCollectionMode';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };
const p = (year: number, method: string | null, paid = true) => ({ paid, period_year: year, method });

// ── Η ΑΠΟΔΕΙΞΗ ΝΙΚΑ ─────────────────────────────────────────────────────────
{
  const m = rentCollectionMode([p(2026, 'Τραπεζική κατάθεση'), p(2026, 'Ηλεκτρονική πληρωμή')], 2026, false);
  ok('όλες τραπεζικές → ναι, παρά τη μίσθωση', m.viaBank && m.basis === 'payments');
}
{
  // ΜΙΑ ΕΙΣΠΡΑΞΗ ΣΕ ΜΕΤΡΗΤΑ ΑΡΚΕΙ. Ο νόμος δεν δίνει την έκπτωση κατ' αναλογία.
  const m = rentCollectionMode([p(2026, 'Τραπεζική κατάθεση'), p(2026, 'Μετρητά')], 2026, true);
  ok('μία σε μετρητά → όχι, παρά τη μίσθωση', !m.viaBank && m.cash === 1 && m.withMethod === 2);
}

// ── ΤΟ ΕΤΟΣ ΜΕΤΡΑΕΙ ─────────────────────────────────────────────────────────
{
  const m = rentCollectionMode([p(2025, 'Μετρητά'), p(2026, 'Τραπεζική κατάθεση')], 2026, null);
  ok('τα μετρητά άλλης χρήσης δεν μολύνουν', m.viaBank && m.withMethod === 1);
}

// ── ΑΠΛΗΡΩΤΕΣ ΓΡΑΜΜΕΣ ΔΕΝ ΕΙΝΑΙ ΑΠΟΔΕΙΞΗ ───────────────────────────────────
{
  const m = rentCollectionMode([{ paid: false, period_year: 2026, method: 'Μετρητά' }], 2026, true);
  ok('ανείσπρακτη γραμμή αγνοείται', m.basis === 'lease' && m.viaBank);
}

// ── ΧΩΡΙΣ ΑΠΟΔΕΙΞΗ, ΜΙΛΑΕΙ Η ΜΙΣΘΩΣΗ ───────────────────────────────────────
{
  const m = rentCollectionMode([p(2026, null), p(2026, '  ')], 2026, true);
  ok('κενός τρόπος → πέφτει στη μίσθωση', m.basis === 'lease' && m.viaBank && m.withMethod === 0);
}
{
  const m = rentCollectionMode([], 2026, false);
  ok('μίσθωση χωρίς τράπεζα → όχι', !m.viaBank && m.basis === 'lease');
}

// ── ΧΩΡΙΣ ΤΙΠΟΤΑ, Η ΠΡΟΕΠΙΛΟΓΗ ΔΕΝ ΕΙΝΑΙ Η ΚΕΡΔΟΦΟΡΑ ──────────────────────
// Αυτό είναι ΤΟ σφάλμα που διορθώνει το αρχείο: το `useState(true)` έδινε την
// έκπτωση 5% χωρίς καμία τεκμηρίωση, δηλαδή μικρότερο φόρο από τον οφειλόμενο.
{
  const m = rentCollectionMode([], 2026, null);
  ok('καμία πληροφορία → ΟΧΙ έκπτωση', !m.viaBank && m.basis === 'unknown');
}

// ── Η ΑΙΤΙΟΛΟΓΗΣΗ ΛΕΕΙ ΤΗΝ ΠΗΓΗ ────────────────────────────────────────────
ok('αιτιολόγηση μετρητών ονομάζει το πλήθος',
  collectionModeReason(rentCollectionMode([p(2026, 'Μετρητά'), p(2026, 'Κάρτα')], 2026, null)).includes('1 από 2'));
ok('αιτιολόγηση μίσθωσης το λέει',
  collectionModeReason(rentCollectionMode([], 2026, true)).startsWith('Από τη μίσθωση'));
ok('αιτιολόγηση άγνοιας δεν υπόσχεται έκπτωση',
  collectionModeReason(rentCollectionMode([], 2026, null)).includes('δεν εφαρμόζεται'));

console.log(`rentCollectionMode: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
