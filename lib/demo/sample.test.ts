// npx tsx lib/demo/sample.test.ts
//
// ΤΟ ΠΑΡΑΔΕΙΓΜΑ ΕΙΝΑΙ ΥΠΟΣΧΕΣΗ ΠΡΟΣ ΝΕΟ ΧΡΗΣΤΗ. Αν δείξει αριθμό που η εφαρμογή
// δεν βγάζει, ο πρώτος πραγματικός λογαριασμός θα τον διαψεύσει. Εδώ κλειδώνει
// ότι κάθε ποσό της προεπισκόπησης βγαίνει από τις ΙΔΙΕΣ συναρτήσεις με του
// πληρωμένου χρήστη και ότι τίποτα δεν αποθηκεύεται.
import {
  DEMO_PROPERTY, demoYear, demoRents, demoExpenses, demoLedger, demoSummary,
} from './sample';
import { resolveCategory } from '@/lib/expenses/taxonomy';
import { incomeStatement } from '@/lib/accounting/statement';
import { rentalBracketsForYear } from '@/lib/billing/greekTax';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };
const TODAY = '2026-08-12';
const Y = demoYear(TODAY);

// ── Η ΧΡΟΝΙΑ ──────────────────────────────────────────────────────────────
ok('η χρονιά είναι η τελευταία κλεισμένη', Y === 2025);
ok('άλλη μέρα, ίδια λογική', demoYear('2027-01-01') === 2026);

// ── ΟΙ ΕΙΣΠΡΑΞΕΙΣ ─────────────────────────────────────────────────────────
const rents = demoRents(Y);
ok('δώδεκα μήνες', rents.length === 12);
ok('όλοι οι μήνες μία φορά', new Set(rents.map(r => r.month)).size === 12);
ok('το ίδιο ενοίκιο κάθε μήνα', rents.every(r => r.amount === DEMO_PROPERTY.monthlyRent));
ok('έντεκα εισπράξεις μέσα στη χρονιά',
   rents.filter(r => r.paidDate.startsWith(String(Y))).length === 11);
ok('ο Δεκέμβριος εισπράττεται τον Ιανουάριο της επόμενης',
   rents.find(r => r.month === 12)?.paidDate === `${Y + 1}-01-08`);
ok('κάθε ημερομηνία είναι έγκυρη', rents.every(r => !Number.isNaN(Date.parse(r.paidDate))));

// ── ΟΙ ΔΑΠΑΝΕΣ ────────────────────────────────────────────────────────────
const exps = demoExpenses(Y);
ok('καμία δαπάνη εκτός χρονιάς', exps.every(e => e.date.startsWith(String(Y))));
ok('κάθε ημερομηνία είναι έγκυρη', exps.every(e => !Number.isNaN(Date.parse(e.date))));
ok('κάθε κατηγορία υπάρχει στην ταξινομία',
   exps.every(e => resolveCategory(e.category) === e.category));
ok('κανένα ποσό μηδέν ή αρνητικό', exps.every(e => e.amount > 0));
ok('κάθε ποσό σε ακέραια λεπτά',
   exps.every(e => Math.abs(e.amount * 100 - Math.round(e.amount * 100)) < 1e-9));
ok('καμία περιγραφή κενή', exps.every(e => e.description.trim().length > 8));

// ── ΤΟ ΙΣΟΖΥΓΙΟ ───────────────────────────────────────────────────────────
const ledger = demoLedger(Y);
ok('κάθε κατηγορία μία γραμμή', new Set(ledger.map(r => r.category)).size === ledger.length);
ok('το άθροισμα του ισοζυγίου ισούται με το άθροισμα των δαπανών',
   Math.round(ledger.reduce((s, r) => s + r.amount, 0) * 100)
   === Math.round(exps.reduce((s, e) => s + e.amount, 0) * 100));
ok('φθίνουσα σειρά ποσού', ledger.every((r, i) => i === 0 || ledger[i - 1].amount >= r.amount));
ok('κάθε γραμμή έχει λογαριασμό ΕΛΠ', ledger.every(r => /^\d{2}(\.\d{2})?$/.test(r.account)));
ok('ο ΕΝΦΙΑ πάει στους φόρους και τέλη',
   ledger.find(r => r.category === 'enfia')?.account === '64.11');
ok('το ρεύμα πάει στην ενέργεια',
   ledger.find(r => r.category === 'electricity')?.account === '64.02');
ok('ο ΕΝΦΙΑ δεν εκπίπτει', ledger.find(r => r.category === 'enfia')?.deductible === false);

// ── Η ΦΟΡΟΛΟΓΙΚΗ ΕΙΚΟΝΑ ───────────────────────────────────────────────────
const sum = demoSummary(TODAY);
ok('εισπράχθηκαν έντεκα ενοίκια', sum.collected === 11 * DEMO_PROPERTY.monthlyRent);
ok('ένα ενοίκιο μεταφέρεται στην επόμενη χρήση', sum.carriedOver === DEMO_PROPERTY.monthlyRent);
ok('έσοδα και μεταφορά κάνουν δώδεκα μήνες',
   sum.collected + sum.carriedOver === 12 * DEMO_PROPERTY.monthlyRent);
ok('ΕΝΦΙΑ και λοιπές δαπάνες κάνουν το σύνολο',
   Math.round((sum.enfia + sum.otherCash) * 100) === Math.round(sum.expenses * 100));

// Ο ΦΟΡΟΣ ΔΕΝ ΓΡΑΦΤΗΚΕ ΣΤΟ ΧΕΡΙ: ξαναϋπολογίζεται εδώ, ανεξάρτητα.
const expected = incomeStatement({
  regime: 'individual_longterm',
  grossIncome: sum.collected,
  enfia: sum.enfia,
  otherCashExpenses: sum.otherCash,
  brackets: rentalBracketsForYear(Y),
});
ok('ο φόρος είναι αυτός της πραγματικής συνάρτησης',
   sum.statement.incomeTax === expected.incomeTax);
ok('η τεκμαρτή έκπτωση είναι 5% των εισπραγμένων',
   Math.round(sum.statement.presumptiveDeduction * 100) === Math.round(sum.collected * 5));
ok('οι δαπάνες ΔΕΝ εκπίπτουν σε φυσικό πρόσωπο', sum.statement.deductibleExpenses === 0);
ok('ο φόρος είναι θετικός', sum.statement.incomeTax > 0);
ok('το ταμείο είναι μικρότερο από τα έσοδα', sum.statement.netCash < sum.collected);
ok('η κλίμακα του έτους αναγράφεται', sum.bracketsLabel.length > 0);

// ── ΚΑΜΙΑ ΕΓΓΡΑΦΗ ─────────────────────────────────────────────────────────
// Ο μόνος τρόπος να γράψει το παράδειγμα στη βάση είναι να δει Supabase. Δεν
// τη βλέπει και αυτός ο έλεγχος το κρατά έτσι όσο κι αν μεγαλώσει το αρχείο.
{
  const src = readFileSync(new URL('./sample.ts', import.meta.url), 'utf8');
  ok('το παράδειγμα δεν εισάγει Supabase', !/supabase/i.test(src));
  ok('το παράδειγμα δεν κάνει insert/upsert/delete', !/\.(insert|upsert|delete)\(/.test(src));
}

console.log(`${pass} πέρασαν, ${fail} απέτυχαν`);
if (fail) process.exit(1);
