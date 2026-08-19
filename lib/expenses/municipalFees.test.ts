import { TYPICAL_SHARE, averageMonthly, feeOriginNote, feeShare, monthlyFees, type FeeSourceRow } from './municipalFees';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };
const near = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.005;

// ── ΤΟ ΠΟΣΟΣΤΟ ────────────────────────────────────────────────────────────
ok('εκατό ευρώ με πέντε τέλη δίνει 5%', feeShare(100, 5).pct === 5);
ok('το 5% είναι τυπικό', feeShare(100, 5).typical);
ok('το 1% δεν είναι τυπικό', !feeShare(100, 1).typical);
ok('το 6% είναι ακόμη τυπικό', feeShare(100, 6).typical);
// Τα δύο πεδία ανάποδα: τα τέλη δεν ξεπερνούν τον λογαριασμό.
ok('ανάποδα ποσά δεν δίνουν ποσοστό', feeShare(5, 100).pct === null);
ok('μηδενικός λογαριασμός δεν δίνει ποσοστό', feeShare(0, 5).pct === null);
ok('κενά πεδία δεν δίνουν ποσοστό', feeShare(Number.NaN, Number.NaN).pct === null);
// Λάθος πεδίο: 40% δεν είναι δημοτικά τέλη, είναι ρεύμα.
ok('το 40% κρίνεται απίθανο', feeShare(100, 40).implausible);
ok('το 6% δεν είναι απίθανο', !feeShare(100, 6).implausible);
ok('τα τυπικά όρια είναι 3 έως 6', TYPICAL_SHARE.min === 3 && TYPICAL_SHARE.max === 6);

// ── ΟΙ ΜΗΝΕΣ ──────────────────────────────────────────────────────────────
const rows: FeeSourceRow[] = [
  { date: '2026-01-15', amount: 120, category: 'electricity' },
  { date: '2026-02-15', amount: 100, category: 'electricity' },
  { date: '2026-02-27', amount: 40,  category: 'electricity' },   // δεύτερος λογαριασμός τον ίδιο μήνα
  { date: '2026-03-10', amount: 500, category: 'rent' },          // άλλη κατηγορία
  { date: '2025-04-10', amount: 200, category: 'electricity' },   // άλλη χρονιά
];
const share5 = feeShare(100, 5);
const m = monthlyFees(rows, 2026, share5);

ok('ο Ιανουάριος βγαίνει από τον λογαριασμό', near(m[0].amount, 6));
ok('ο Ιανουάριος δηλώνεται παράγωγος', m[0].origin === 'derived');
ok('οι δύο λογαριασμοί του Φεβρουαρίου αθροίζονται', near(m[1].amount, 7));
// Ο Μάρτιος έχει ΜΟΝΟ ενοίκιο: δεν είναι μηδέν, είναι άγνωστος.
ok('μήνας χωρίς ρεύμα δεν γράφεται μηδέν', m[2].amount === null && m[2].origin === 'unknown');
ok('άλλη χρονιά δεν μετρά', m[3].amount === null);
ok('δώδεκα μήνες πάντα', m.length === 12);

// Ο,τι έγραψε ο χρήστης νικά την εκτίμηση: είναι πραγματικός λογαριασμός.
const over = monthlyFees(rows, 2026, share5, ['', '9,50']);
ok('το χειρόγραφο υπερισχύει', near(over[1].amount, 9.5) && over[1].origin === 'measured');
ok('το χειρόγραφο δέχεται ελληνικό κόμμα', near(over[1].amount, 9.5));
ok('ο Ιανουάριος μένει παράγωγος', over[0].origin === 'derived');
// Χειρόγραφο σε μήνα χωρίς λογαριασμό ρεύματος: μετρά κανονικά.
const only = monthlyFees([], 2026, feeShare(0, 0), ['', '', '11']);
ok('χειρόγραφο χωρίς ρεύμα μετρά', near(only[2].amount, 11) && only[2].origin === 'measured');

// Χωρίς μετρημένο ποσοστό δεν υπολογίζεται τίποτα.
const noShare = monthlyFees(rows, 2026, feeShare(0, 0));
ok('χωρίς ποσοστό, κανένας μήνας', noShare.every(x => x.amount === null));
// Απίθανο ποσοστό: δεν πολλαπλασιάζουμε σιωπηλά επί 40%.
const bad = monthlyFees(rows, 2026, feeShare(100, 40));
ok('απίθανο ποσοστό δεν πολλαπλασιάζεται', bad.every(x => x.amount === null));

// ── Ο ΜΕΣΟΣ ΟΡΟΣ ──────────────────────────────────────────────────────────
// ΠΑΝΩ ΣΤΟΥΣ ΓΝΩΣΤΟΥΣ, ΟΧΙ ΣΤΟΥΣ ΔΩΔΕΚΑ. Με μηδενικά στους άγνωστους, ο μέσος
// όρος θα ήταν (6+7)/12 = 1,08 αντί για 6,50: λάθος προς τα κάτω, και κατεβαίνει
// στον προϋπολογισμό.
ok('ο μέσος όρος αγνοεί τους άγνωστους', near(averageMonthly(m), 6.5));
ok('χωρίς γνωστούς, κανένας μέσος όρος', averageMonthly(noShare) === null);

// ── Η ΠΡΟΕΛΕΥΣΗ ΛΕΓΕΤΑΙ ───────────────────────────────────────────────────
ok('η προέλευση αναφέρει τους υπολογισμένους', feeOriginNote(m).includes('2 μήνες υπολογισμένοι'));
ok('η προέλευση αναφέρει και τους χειρόγραφους', feeOriginNote(over).includes('γραμμέν'));
ok('χωρίς δεδομένα δεν λέγεται τίποτα', feeOriginNote(noShare) === '');
ok('ενικός για έναν μήνα', feeOriginNote(only).includes('1 γραμμένος'));

console.log(`expenses/municipalFees: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
