// npx tsx lib/accounting/scenarios.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΟΛΟΚΛΗΡΗ ΧΡΗΣΗ, ΑΠΟ ΑΚΡΗ ΣΕ ΑΚΡΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΔΕΝ ΠΙΑΝΕΙ ΚΑΝΕΝΑ ΑΠΟ ΤΑ ΥΠΟΛΟΙΠΑ ΤΕΣΤ. Κάθε μηχανή ελέγχεται μόνη της με
// δικά της δεδομένα: το ημερολόγιο με τρεις εγγραφές, η κατάσταση
// αποτελεσμάτων με σκέτους αριθμούς, το μητρώο παγίων με ένα διαμέρισμα. Καμία
// δεν ελέγχεται ΜΑΖΙ με τις άλλες πάνω στα ΙΔΙΑ δεδομένα.
//
// Εκεί όμως ζουν τα σφάλματα που κοστίζουν. Έχει ήδη συμβεί σε αυτό το
// αποθετήριο: το φύλλο των λογαριασμών και το ημερολόγιο έβγαζαν ΑΛΛΟΝ
// λογαριασμό για την ίδια δαπάνη, γιατί το ένα διάβαζε την ετικέτα και το άλλο
// το σύμβολο. Κάθε τεστ περνούσε. Το λάθος φάνηκε μόνο όταν κάποιος έβαλε τα
// δύο αρχεία δίπλα δίπλα.
//
// ΤΙ ΕΛΕΓΧΕΙ. Μια ρεαλιστική χρονιά ενός ιδιοκτήτη με ένα εκμισθωμένο
// διαμέρισμα: δώδεκα μισθώματα, δεκαοκτώ δαπάνες σε δέκα κατηγορίες, δόσεις
// δανείου με τόκο, μια ανακαίνιση και ένα πλυντήριο. Τα ίδια δεδομένα περνούν
// από ΟΛΕΣ τις μηχανές και ελέγχεται ότι συμφωνούν μεταξύ τους.
//
// ΟΙ ΑΡΙΘΜΟΙ ΕΙΝΑΙ ΣΤΑΘΕΡΟΙ. Καμία ημερομηνία δεν διαβάζεται από το ρολόι:
// αλλιώς η σουίτα θα άλλαζε αποτέλεσμα κάθε Πρωτοχρονιά.
// ═══════════════════════════════════════════════════════════════════════════
import { buildJournal, journalTotals, trialBalance, auditJournal, expenseAccount, ACCOUNTS } from './journal';
import { incomeStatement } from './statement';
import { buildRegister, chargeForYear, EQUIPMENT_ACCOUNT, RENTED_PROPERTY_ACCOUNT } from './fixedAssets';
import { buildWorkbook } from '@/app/dashboard/components/accountantExport';
import { toMovement } from '@/app/dashboard/components/accountantTypes';
import { XLSX } from '@/app/dashboard/components/xlsxStyle';
import { type Cell } from '@/app/dashboard/components/sheetFormat';
import { ELP_ALL } from '@/lib/tax/elpAccounts';
import { CATEGORIES } from '@/lib/expenses/taxonomy';
import {
  shortTermYearSummary, platformFeeExpenses, staysMissingPlatformFee, PLATFORM_FEE_CATEGORY,
} from '@/lib/tax/shortTermTax';

let pass = 0, fail = 0;
const fails: string[] = [];
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; fails.push(n); } };
const eq = (n: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; fails.push(`${n} — got ${g}, want ${w}`); }
};
/** Τα λεπτά δεν συγκρίνονται με «===»: 0,1 + 0,2 δεν κάνει 0,3 σε δυαδικό. */
const near = (n: string, got: number, want: number, tol = 0.005) =>
  ok(`${n} (${got.toFixed(2)} ≈ ${want.toFixed(2)})`, Math.abs(got - want) < tol);

const YEAR = 2026;
const m = (i: number) => String(i).padStart(2, '0');

// ── Η ΧΡΟΝΙΑ ───────────────────────────────────────────────────────────────
const incomes = Array.from({ length: 12 }, (_, i) => ({
  date: `${YEAR}-${m(i + 1)}-05`, amount: 650, description: `Ενοίκιο ${m(i + 1)}`,
}));

// Δεκαοκτώ δαπάνες, σε δέκα κατηγορίες που καλύπτουν και τους δέκα λογαριασμούς
// εξόδων που κινεί πραγματικά ένα ακίνητο.
const expenses = [
  { date: `${YEAR}-01-20`, amount: 88.5, category: 'Ρεύμα' },
  { date: `${YEAR}-03-20`, amount: 94.2, category: 'Ρεύμα' },
  { date: `${YEAR}-05-20`, amount: 61.0, category: 'Ρεύμα' },
  { date: `${YEAR}-07-20`, amount: 130.4, category: 'Ρεύμα' },
  { date: `${YEAR}-02-10`, amount: 24.6, category: 'Νερό' },
  { date: `${YEAR}-08-10`, amount: 31.2, category: 'Νερό' },
  { date: `${YEAR}-01-15`, amount: 29.9, category: 'Internet και τηλέφωνο' },
  { date: `${YEAR}-07-15`, amount: 29.9, category: 'Internet και τηλέφωνο' },
  { date: `${YEAR}-03-01`, amount: 45.0, category: 'Κοινόχρηστα' },
  { date: `${YEAR}-09-01`, amount: 52.0, category: 'Κοινόχρηστα' },
  { date: `${YEAR}-04-12`, amount: 180.0, category: 'Ασφάλεια' },
  { date: `${YEAR}-05-09`, amount: 120.0, category: 'Υδραυλικός' },
  { date: `${YEAR}-06-18`, amount: 220.0, category: 'Ηλεκτρολόγος' },
  { date: `${YEAR}-10-03`, amount: 90.0, category: 'Καθαρισμός' },
  { date: `${YEAR}-06-01`, amount: 340.0, category: 'ΕΝΦΙΑ' },
  { date: `${YEAR}-11-20`, amount: 75.0, category: 'Δημοτικά τέλη' },
  // Τα δύο που ΔΕΝ είναι έξοδα χρήσης: πάγια που αποσβένονται.
  { date: `${YEAR}-02-01`, amount: 8000.0, category: 'Ανακαίνιση' },
  { date: `${YEAR}-05-10`, amount: 480.0, category: 'Έπιπλα' },
];

// Δόσεις δανείου: το κεφάλαιο δεν είναι έξοδο, ο τόκος είναι.
const loanPayments = Array.from({ length: 12 }, (_, i) => ({
  date: `${YEAR}-${m(i + 1)}-16`, amount: 751, interest: 300 - i * 2,
}));

const SUM_INCOME = incomes.reduce((s, r) => s + r.amount, 0);
const SUM_EXPENSE = expenses.reduce((s, r) => s + r.amount, 0);
const SUM_INTEREST = loanPayments.reduce((s, r) => s + r.interest, 0);
const SUM_PRINCIPAL = loanPayments.reduce((s, r) => s + (r.amount - r.interest), 0);

console.log('Μια ολόκληρη χρήση, από άκρη σε άκρη');
eq('δώδεκα μισθώματα', incomes.length, 12);
near('σύνολο εσόδων', SUM_INCOME, 7800);
near('σύνολο δαπανών', SUM_EXPENSE, 10091.7);

// ══ 1. ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΙΣΟΣΚΕΛΙΖΕΙ ══════════════════════════════════════════
// Αν δεν ισοσκελίζει, δεν είναι ημερολόγιο: είναι λίστα. Ο έλεγχος είναι ο
// πρώτος που κάνει κάθε λογιστής μόλις ανοίξει το αρχείο.
{
  const lines = buildJournal({ incomes, expenses, loanPayments });
  const t = journalTotals(lines);
  ok('χρέωση ίση με πίστωση', t.balanced);
  near('και το ποσό είναι το αναμενόμενο', t.debit, SUM_INCOME + SUM_EXPENSE + SUM_INTEREST + SUM_PRINCIPAL);

  const audit = auditJournal(lines, { year: YEAR });
  ok('ο έλεγχος του ημερολογίου δεν βρίσκει πρόβλημα', audit.ok);

  // ══ ΤΟ ΙΣΟΖΥΓΙΟ ΣΥΜΦΩΝΕΙ ΜΕ ΤΑ ΔΕΔΟΜΕΝΑ, ΛΟΓΑΡΙΑΣΜΟ ΠΡΟΣ ΛΟΓΑΡΙΑΣΜΟ ══════
  const trial = trialBalance(lines);
  const bal = (code: string) => trial.find(r => r.code === code);
  near('τα έσοδα στο 71.04', Math.abs(bal(ACCOUNTS.rentIncome.code)?.credit ?? 0), SUM_INCOME);
  near('οι τόκοι στο 65.01', bal('65.01')?.debit ?? 0, SUM_INTEREST);
  near('το κεφάλαιο στο 52', bal('52')?.debit ?? 0, SUM_PRINCIPAL);
  // Το ταμείο κινείται και στα δύο σκέλη: εισπράξεις μείον πληρωμές.
  const cash = bal('38');
  near('το ταμείο κρατά τη διαφορά',
    (cash?.debit ?? 0) - (cash?.credit ?? 0),
    SUM_INCOME - SUM_EXPENSE - SUM_INTEREST - SUM_PRINCIPAL);

  // ══ ΚΑΘΕ ΛΟΓΑΡΙΑΣΜΟΣ ΤΟΥ ΙΣΟΖΥΓΙΟΥ ΥΠΑΡΧΕΙ ΣΤΟ ΣΧΕΔΙΟ ΤΟΥ ΝΟΜΟΥ ══════════
  // Ένας κωδικός εκτός σχεδίου δεν σκάει πουθενά· απορρίπτεται στην εισαγωγή
  // του λογιστικού προγράμματος, δηλαδή στο γραφείο του λογιστή.
  const known = new Set(ELP_ALL.map(a => a.code));
  eq('κανένας κωδικός εκτός σχεδίου ΕΛΠ',
    trial.filter(r => !known.has(r.code)).map(r => r.code).join(', '), '');
}

// ══ 2. Η ΚΑΤΑΣΤΑΣΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ ΔΙΑΒΑΖΕΙ ΤΑ ΙΔΙΑ ΔΕΔΟΜΕΝΑ ════════════════
{
  const st = incomeStatement({
    regime: 'business', grossIncome: SUM_INCOME, businessForm: 'sole',
    itemizedExpenses: SUM_EXPENSE, loanInterest: SUM_INTEREST,
    loanPrincipal: SUM_PRINCIPAL, enfia: 0,
  });
  near('το μεικτό είναι τα μισθώματα', st.grossIncome, SUM_INCOME);
  ok('ο φόρος δεν είναι αρνητικός', st.incomeTax >= 0);
  // Με δαπάνες μεγαλύτερες από τα έσοδα, το αποτέλεσμα είναι ζημιά και ο φόρος
  // μηδέν. Ένας θετικός φόρος πάνω σε ζημιά θα ήταν σφάλμα που πληρώνει ο χρήστης.
  ok('ζημιά σημαίνει μηδενικός φόρος εισοδήματος', SUM_EXPENSE > SUM_INCOME ? st.incomeTax === 0 : true);
  // Κάθε γραμμή της κατάστασης έχει ποσό που είναι αριθμός. Ένα `undefined` εδώ
  // φτάνει στην οθόνη ως «NaN €».
  ok('κάθε γραμμή έχει αριθμητικό ποσό',
    st.lines.every(l => l.amount === null || Number.isFinite(l.amount)));
}

// ══ 3. ΤΟ ΜΗΤΡΩΟ ΠΑΓΙΩΝ ΚΑΙ Η ΚΑΤΑΣΤΑΣΗ ΛΕΝΕ ΤΟΝ ΙΔΙΟ ΑΡΙΘΜΟ ═════════════
{
  const capitalisable: Record<string, string> = {
    'Ανακαίνιση': RENTED_PROPERTY_ACCOUNT,
    'Έπιπλα': EQUIPMENT_ACCOUNT,
  };
  const assets = buildRegister({
    property: { name: 'Διαμέρισμα', purchasePrice: 150000, purchaseDate: '2019-04-20', rented: true },
    buildingFraction: 0.6, buildingRate: 0.04, equipmentRate: 0.1,
    inventory: [{ name: 'Πλυντήριο', purchase_value: 480, purchase_date: `${YEAR}-05-10` }],
    expenses, capitalisable,
  });

  // Το ακίνητο, η ανακαίνιση, το πλυντήριο της Απογραφής και τα έπιπλα ως δαπάνη.
  eq('τέσσερα πάγια', assets.length, 4);
  // 150.000 × 60% × 4% = 3.600 στο ακίνητο.
  near('η απόσβεση του ακινήτου',
    chargeForYear(assets.find(a => a.source === 'Ακίνητο')!, YEAR), 3600);
  // Ανακαίνιση 8.000 από Φεβρουάριο: δέκα μήνες × 4%.
  near('η ανακαίνιση κατά μήνα',
    chargeForYear(assets.find(a => a.name.startsWith('Ανακαίνιση'))!, YEAR), 8000 * 0.04 * 10 / 12);
  // Πλυντήριο 480 από Μάιο: επτά μήνες × 10%.
  near('ο εξοπλισμός με τον συντελεστή του νόμου',
    chargeForYear(assets.find(a => a.source === 'Απογραφή')!, YEAR), 480 * 0.1 * 7 / 12);

  // ══ ΚΑΝΕΝΑ ΠΑΓΙΟ ΔΕΝ ΑΠΟΣΒΕΝΕΤΑΙ ΠΑΝΩ ΑΠΟ ΤΗΝ ΑΞΙΑ ΤΟΥ ══════════════════
  for (const a of assets) {
    let acc = 0;
    for (let y = 2019; y <= 2060; y++) acc += chargeForYear(a, y);
    ok(`«${a.name}»: η σωρευμένη δεν ξεπερνά την αποσβεστέα βάση`,
      acc <= (a.cost - (a.land ?? 0)) + 0.01);
  }
}

// ══ 4. ΤΟ ΑΡΧΕΙΟ ΤΟΥ ΛΟΓΙΣΤΗ ΛΕΕΙ ΤΑ ΙΔΙΑ ΜΕ ΤΟ ΗΜΕΡΟΛΟΓΙΟ ═══════════════
// Είναι το σημείο όπου έχει ήδη σπάσει: δύο διαδρομές, ο ίδιος λογαριασμός,
// άλλο αποτέλεσμα.
{
  const book = [
    ...incomes.map(r => toMovement({ date: r.date, type: 'income' as const, category: 'Ενοίκια', description: r.description ?? '', amount: r.amount })),
    ...expenses.map(r => toMovement({ date: r.date, type: 'expense' as const, category: r.category, description: '', amount: r.amount })),
  ];
  const wb = buildWorkbook({
    year: YEAR, propName: 'Διαμέρισμα', statementLines: [], provisionMonthly: 0, book,
  });
  const ws = wb.Sheets['Λογαριασμοί ΕΛΠ'];
  const range = XLSX.utils.decode_range(ws['!ref'] as string);
  const cell = (r: number, c: number) => (ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined)?.v;

  // Το φύλλο γράφει κωδικό στη στήλη A και ποσό στην F, ως κείμενο «1.234,56 €».
  const num = (v: unknown) => Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  const perAccount = new Map<string, number>();
  for (let r = range.s.r; r <= range.e.r; r++) {
    const code = String(cell(r, 0) ?? '');
    if (!/^\d{2}(\.\d{2})?$/.test(code)) continue;
    perAccount.set(code, num(cell(r, 5)));
  }

  // ══ ΤΟ ΦΥΛΛΟ ΚΑΙ Η ΜΗΧΑΝΗ ΤΟΥ ΗΜΕΡΟΛΟΓΙΟΥ ΣΥΜΦΩΝΟΥΝ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ ══════
  const expected = new Map<string, number>();
  for (const e of expenses) {
    const code = expenseAccount(e.category).code;
    expected.set(code, (expected.get(code) ?? 0) + e.amount);
  }
  expected.set(ACCOUNTS.rentIncome.code, SUM_INCOME);
  const diffs: string[] = [];
  for (const [code, want] of expected) {
    const got = perAccount.get(code) ?? 0;
    if (Math.abs(got - want) > 0.005) diffs.push(`${code}: φύλλο ${got.toFixed(2)} ≠ μηχανή ${want.toFixed(2)}`);
  }
  eq('κάθε λογαριασμός του φύλλου συμφωνεί με τη μηχανή', diffs.join(' · '), '');

  // Και το άθροισμα του φύλλου είναι το άθροισμα του βιβλίου.
  near('το σύνολο του φύλλου',
    [...perAccount.values()].reduce((s, v) => s + v, 0), SUM_INCOME + SUM_EXPENSE);
}

// ══ 5. ΚΑΜΙΑ ΚΑΤΗΓΟΡΙΑ ΤΗΣ ΤΑΞΙΝΟΜΙΑΣ ΔΕΝ ΜΕΝΕΙ ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ ═════════
// Μια κατηγορία που δεν αντιστοιχεί σε λογαριασμό εξαφανίζεται από το ισοζύγιο:
// το βιβλίο δεν ισοσκελίζει και κανείς δεν ξέρει γιατί. Ελέγχεται με ΟΛΕΣ τις
// κατηγορίες που μπορεί να διαλέξει ο χρήστης, όχι με το δείγμα του σεναρίου.
{
  const orphans = CATEGORIES.filter(c => {
    const a = expenseAccount(c.label);
    return !a || !ELP_ALL.some(x => x.code === a.code);
  });
  eq('καμία κατηγορία χωρίς λογαριασμό', orphans.map(c => c.label).join(', '), '');

  // Και καμία δεν πέφτει σιωπηλά στα «λοιπά»: το 64.12 είναι απάντηση για
  // λίγες, όχι λύση για όσες δεν κοιτάξαμε.
  const misc = CATEGORIES.filter(c => expenseAccount(c.label).code === '64.12');
  ok(`τα «λοιπά έξοδα» δεν είναι σκουπιδοτενεκές (${misc.length} από ${CATEGORIES.length})`,
    misc.length <= CATEGORIES.length / 3);
}

// ══ 6. ΜΙΑ ΣΕΖΟΝ ΒΡΑΧΥΧΡΟΝΙΑΣ, ΜΕ ΤΗΝ ΠΡΟΜΗΘΕΙΑ ΜΕΣΑ ════════════════════════
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΒΡΕΘΗΚΕ ΓΡΑΦΟΝΤΑΣ ΑΥΤΟ ΤΟ ΤΕΣΤ. Η προμήθεια της πλατφόρμας
// καταγραφόταν ανά κράτηση και τη διάβαζαν τέσσερις οθόνες ως «δαπάνη που
// εκπίπτει». Στο ημερολόγιο, στο ισοζύγιο και στον φάκελο του λογιστή δεν
// έφτανε καμία. Ο ίδιος χρήστης έβλεπε «προμήθειες 2.700 €» στην Πληρότητα και
// παρέδιδε βιβλίο χωρίς ούτε ένα ευρώ προμήθειας.
//
// Οι έλεγχοι εδώ κρατούν ταυτόχρονα τα δύο που είναι εύκολο να μπερδευτούν: η
// προμήθεια είναι ΔΑΠΑΝΗ και ΔΕΝ μειώνει το δηλωτέο ακαθάριστο.
{
  // Οκτώ κρατήσεις: έξι από πλατφόρμα με προμήθεια, μία απευθείας χωρίς και
  // μία από πλατφόρμα όπου η προμήθεια δεν καταγράφηκε — το κενό που πρέπει να
  // ονομαστεί αντί να συμπληρωθεί με εκτίμηση.
  const stay = (i: number, month: number, gross: number, fee: number | null, channel: string) => ({
    id: `s${i}`, check_in: `${YEAR}-${m(month)}-10`, check_out: `${YEAR}-${m(month)}-14`,
    nights: 4, channel, gross_guest_paid: gross, climate_levy: 8, platform_fee: fee,
    total: gross - 8, amount_basis: 'gross',
  });
  const stays = [
    stay(1, 5, 508, 60, 'airbnb'),
    stay(2, 6, 608, 75, 'airbnb'),
    stay(3, 7, 808, 100, 'booking'),
    stay(4, 7, 908, 120, 'airbnb'),
    stay(5, 8, 1008, 135, 'booking'),
    stay(6, 8, 908, 110, 'airbnb'),
    stay(7, 9, 408, null, 'direct'),
    stay(8, 9, 508, null, 'airbnb'),
  ];

  const summary = shortTermYearSummary(stays, YEAR, { sqm: 70, isHouse: false, individual: true });
  const fees = platformFeeExpenses(stays, YEAR);
  const feeSum = fees.reduce((s, f) => s + f.amount, 0);

  eq('έξι κρατήσεις με προμήθεια, έξι γραμμές δαπάνης', fees.length, 6);
  near('η σύνοψη και οι γραμμές λένε το ίδιο ποσό', feeSum, summary.platformFees);
  near('το άθροισμα των προμηθειών', feeSum, 600);

  // Η κρίσιμη διάκριση: το ακαθάριστο είναι «τι πλήρωσε ο επισκέπτης − τέλος»,
  // και η προμήθεια ΔΕΝ το αγγίζει. 5664 πληρωμένα − 8×8 τέλος = 5600.
  near('το δηλωτέο ακαθάριστο δεν μειώνεται από την προμήθεια', summary.grossRevenue, 5600);

  // Το ίδιο, αποδεδειγμένα: μηδενίζοντας ΚΑΘΕ προμήθεια, το ακαθάριστο μένει.
  const noFees = stays.map(s => ({ ...s, platform_fee: null }));
  near('χωρίς καμία προμήθεια, ίδιο ακαθάριστο',
    shortTermYearSummary(noFees, YEAR, { sqm: 70, isHouse: false, individual: true }).grossRevenue, 5600);
  eq('και καμία γραμμή δαπάνης', platformFeeExpenses(noFees, YEAR).length, 0);

  // Το κενό ονομάζεται: μία κράτηση Airbnb χωρίς προμήθεια. Η απευθείας δεν
  // λείπει — δεν έχει προμήθεια εξ ορισμού.
  eq('μία κράτηση πλατφόρμας χωρίς καταγεγραμμένη προμήθεια',
    staysMissingPlatformFee(stays, YEAR), 1);

  // ══ ΚΑΙ ΤΩΡΑ ΤΟ ΒΙΒΛΙΟ ══════════════════════════════════════════════════
  const stIncomes = stays.map((s, i) => ({
    date: s.check_in, amount: s.gross_guest_paid - 8, description: `Κράτηση ${i + 1}`,
  }));
  const stLines = buildJournal({ incomes: stIncomes, expenses: fees });
  const stTotals = journalTotals(stLines);
  ok('η σεζόν ισοσκελίζει', stTotals.balanced);

  const stTrial = new Map(trialBalance(stLines).map(r => [r.code, r]));
  near('τα έσοδα της σεζόν στο 71.04',
    stTrial.get(ACCOUNTS.rentIncome.code)?.credit ?? 0, 5600);
  // 64.01 «Αμοιβές για υπηρεσίες»: μεσιτεία κράτησης, όπως και ο μεσίτης.
  near('η προμήθεια στο 64.01', stTrial.get('64.01')?.debit ?? 0, 600);
  eq('κάθε γραμμή προμήθειας πάει στον ίδιο λογαριασμό',
    [...new Set(fees.map(f => expenseAccount(f.category).code))].join(','), '64.01');

  // Η προμήθεια δεν εξαφανίζεται σε «λοιπά»: αν έχανε την κατηγορία της, θα
  // κατέληγε στο 64.12 μαζί με τις συνδρομές και ο λογιστής δεν θα ήξερε.
  ok('η προμήθεια δεν πέφτει στα λοιπά έξοδα',
    expenseAccount(PLATFORM_FEE_CATEGORY).code !== '64.12');
}

console.log(`\nscenarios: ${fail === 0 ? `✓ ${pass} έλεγχοι` : `✗ ${fail} απέτυχαν από ${pass + fail}`}`);
if (fail) { console.log(fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
