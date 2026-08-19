import { BOOK_CURRENCY, apiDedupKey, normalizeTxns, rejectionNote } from './normalize';
import type { ProviderTxn } from './types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };

const txn = (over: Partial<ProviderTxn> = {}): ProviderTxn => ({
  providerTxnId: 'T1',
  date: '2026-08-10',
  amount: -42.5,
  currency: BOOK_CURRENCY,
  description: 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ',
  ...over,
});

// ── ΤΟ ΑΠΟΤΥΠΩΜΑ ──────────────────────────────────────────────────────────
const k = apiDedupKey('gocardless', 'c1', 'T1');
ok('το αποτύπωμα είναι σταθερό', k === apiDedupKey('gocardless', 'c1', 'T1'));
ok('άλλη σύνδεση, άλλο αποτύπωμα', k !== apiDedupKey('gocardless', 'c2', 'T1'));
ok('άλλη κίνηση, άλλο αποτύπωμα', k !== apiDedupKey('gocardless', 'c1', 'T2'));
// Το σχήμα του CSV χτίζει κλειδί από ημερομηνία+ποσό+κείμενο+σειρά. Αν τα δύο
// σχήματα μοιράζονταν χώρο ονομάτων, η ίδια κίνηση από τα δύο κανάλια θα
// περνούσε δύο φορές. Το πρόθεμα το απαγορεύει.
ok('το σχήμα δηλώνεται στο αποτύπωμα', k.startsWith('ob1|'));
ok('ο πάροχος είναι μέσα στο αποτύπωμα', k.includes('gocardless'));

// ── Ο ΔΕΥΤΕΡΟΣ ΣΥΓΧΡΟΝΙΣΜΟΣ ΔΕΝ ΞΑΝΑΓΡΑΦΕΙ ────────────────────────────────
const first = normalizeTxns([txn({ providerTxnId: 'A' }), txn({ providerTxnId: 'B' })], 'gocardless', 'c1');
const second = normalizeTxns([txn({ providerTxnId: 'A' }), txn({ providerTxnId: 'B' }), txn({ providerTxnId: 'C' })], 'gocardless', 'c1');
ok('τα κοινά αποτυπώματα ταυτίζονται μεταξύ συγχρονισμών',
  first.rows.map(r => r.dedupHash).every(h => second.rows.some(s => s.dedupHash === h)));
ok('ο δεύτερος συγχρονισμός φέρνει μία νέα', second.rows.length === 3);

// Επικαλυπτόμενες σελίδες στην ΙΔΙΑ απάντηση: η διπλή κόβεται εδώ, δεν
// στηριζόμαστε μόνο στο μοναδικό ευρετήριο της βάσης.
const dupes = normalizeTxns([txn({ providerTxnId: 'A' }), txn({ providerTxnId: 'A' })], 'gocardless', 'c1');
ok('η διπλή κίνηση της ίδιας απάντησης κόβεται', dupes.rows.length === 1);
ok('η διπλή δεν μετριέται ως απόρριψη', dupes.rejected.length === 0);

// ── ΤΙ ΑΠΟΡΡΙΠΤΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ ΤΟ ΛΕΜΕ ────────────────────────────────────
const foreign = normalizeTxns([txn({ currency: 'GBP' })], 'gocardless', 'c1');
ok('ξένο νόμισμα δεν περνά', foreign.rows.length === 0);
ok('ξένο νόμισμα δεν μετατρέπεται σιωπηλά', foreign.rejected[0].reason === 'currency' && foreign.rejected[0].count === 1);
ok('το πεζό «eur» είναι ευρώ', normalizeTxns([txn({ currency: 'eur' })], 'gocardless', 'c1').rows.length === 1);

ok('κακή ημερομηνία δεν περνά', normalizeTxns([txn({ date: '10/08/2026' })], 'gocardless', 'c1').rows.length === 0);
ok('κενή ημερομηνία δεν περνά', normalizeTxns([txn({ date: '' })], 'gocardless', 'c1').rows.length === 0);
ok('μηδενικό ποσό δεν περνά', normalizeTxns([txn({ amount: 0 })], 'gocardless', 'c1').rows.length === 0);
ok('NaN ποσό δεν περνά', normalizeTxns([txn({ amount: Number.NaN })], 'gocardless', 'c1').rows.length === 0);
ok('χωρίς αναγνωριστικό δεν περνά', normalizeTxns([txn({ providerTxnId: '  ' })], 'gocardless', 'c1').rows.length === 0);

// ── ΤΟ ΠΟΣΟ ΚΑΙ ΤΟ ΚΕΙΜΕΝΟ ────────────────────────────────────────────────
const kept = normalizeTxns([txn({ amount: -42.5 }), txn({ providerTxnId: 'T2', amount: 800 })], 'gocardless', 'c1');
ok('η χρέωση μένει αρνητική', kept.rows[0].amount === -42.5);
ok('η πίστωση μένει θετική', kept.rows[1].amount === 800);

const withParty = normalizeTxns([txn({ description: 'ΜΕΤΑΦΟΡΑ', counterparty: 'ΓΕΩΡΓΙΟΥ ΑΝΝΑ' })], 'gocardless', 'c1');
ok('ο αντισυμβαλλόμενος προστίθεται', withParty.rows[0].description === 'ΜΕΤΑΦΟΡΑ · ΓΕΩΡΓΙΟΥ ΑΝΝΑ');
const repeated = normalizeTxns([txn({ description: 'ΜΕΤΑΦΟΡΑ ΓΕΩΡΓΙΟΥ ΑΝΝΑ', counterparty: 'ΓΕΩΡΓΙΟΥ ΑΝΝΑ' })], 'gocardless', 'c1');
ok('δεν λέγεται δύο φορές το ίδιο', repeated.rows[0].description === 'ΜΕΤΑΦΟΡΑ ΓΕΩΡΓΙΟΥ ΑΝΝΑ');
const noText = normalizeTxns([txn({ description: '', counterparty: null })], 'gocardless', 'c1');
ok('χωρίς κείμενο δεν μένει κενό', noText.rows[0].description === 'Κίνηση χωρίς περιγραφή');

// ── Η ΑΝΑΦΟΡΑ ─────────────────────────────────────────────────────────────
ok('όταν περνούν όλες δεν λέγεται τίποτα', rejectionNote(kept) === '');
const mixed = normalizeTxns([txn({ currency: 'USD' }), txn({ providerTxnId: 'X', date: 'χθες' }), txn({ providerTxnId: 'Y' })], 'gocardless', 'c1');
ok('περνά μόνο η καλή', mixed.rows.length === 1);
const note = rejectionNote(mixed);
ok('η αναφορά μετρά και τις δύο', note.includes('1 σε άλλο νόμισμα') && note.includes('1 χωρίς αναγνωρίσιμη ημερομηνία'));
ok('η αναφορά εξηγεί το νόμισμα', note.includes('δεν μετατρέπονται'));

console.log(`banking/normalize: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
