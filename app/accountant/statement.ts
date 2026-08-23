// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΤΑΣΤΑΣΗ ΤΗΣ ΧΡΗΣΗΣ: ΕΝΑΣ ΥΠΟΛΟΓΙΣΜΟΣ, ΔΥΟ ΕΞΟΔΟΙ
// ─────────────────────────────────────────────────────────────────────────
// Η ΠΥΛΗ ΕΔΕΙΧΝΕ ΝΟΥΜΕΡΑ ΚΑΙ ΔΕΝ ΚΑΤΕΒΑΖΕ ΤΙΠΟΤΑ. Ο λογιστής διάβαζε την οθόνη
// και ξαναπληκτρολογούσε — σε επάγγελμα που δουλεύει με αρχεία. Το προϊόν είχε
// ήδη μηχανή εξαγωγής, αλλά μόνο στον πίνακα του ιδιοκτήτη· δηλαδή στα χέρια
// του ανθρώπου που ΔΕΝ συμπληρώνει το έντυπο.
//
// ΓΙΑΤΙ Ο ΥΠΟΛΟΓΙΣΜΟΣ ΕΦΥΓΕ ΑΠΟ ΤΗ ΣΕΛΙΔΑ. Αν το αρχείο υπολόγιζε μόνο του,
// θα υπήρχαν δύο αλήθειες για το ίδιο ποσό: μία στην οθόνη και μία στο .xlsx
// που κατεβαίνει από αυτήν. Θα απέκλιναν στην πρώτη αλλαγή, και ο λογιστής θα
// έβλεπε το ένα και θα υπέβαλλε το άλλο — το ίδιο ακριβώς σφάλμα που είχε ήδη
// διορθωθεί όταν η πύλη έπαψε να αθροίζει το ωμό `total` των διαμονών.
//
// ΕΔΩ ΔΕΝ ΥΠΑΡΧΕΙ REACT. Είναι αριθμητική, άρα δοκιμάζεται χωρίς οθόνη.
// ═══════════════════════════════════════════════════════════════════════════
import { declarableGrossOrTotal, needsAmountReview, amountBasis, AMOUNT_BASIS_LABELS, collectedLevy, platformFee } from '@/lib/clients/stayAmounts';
import type { XlsxSheet } from '@/app/dashboard/components/exportXlsx';

export interface PortalExpense { category: string; amount: number; date: string }

export interface PortalStay {
  check_in: string | null; check_out: string | null; nights: number | null; total: number | null;
  gross_guest_paid?: number | null; climate_levy?: number | null;
  platform_fee?: number | null; amount_basis?: string | null;
}

export interface PortalProperty {
  name: string; atak: string | null; address: string | null; prop_type: string | null;
  /** Εμβαδόν και ποσοστό συνιδιοκτησίας: τα ζητά η γραμμή του Ε2. */
  sqm?: number | null; ownership?: number | null;
  /** Εισπραχθέν ενοίκιο ΤΟΥ ΕΤΟΥΣ, από rent_payments — ίδια πηγή με το Ε2. */
  rent_collected: number | null;
  /** Σε πόσες καταχωρημένες περιόδους βασίζεται. 0 = δεν καταχωρήθηκε τίποτα. */
  rent_months: number | null;
  /** Τι νοικιάζεται ΣΗΜΕΡΑ. Συμφραζόμενο, όχι έσοδο του έτους. */
  rent_monthly: number | null;
  expenses: PortalExpense[]; stays: PortalStay[];
}

export interface PortalData { owner: string | null; year: number; properties: PortalProperty[] }

/** Η γραμμή ενός ακινήτου για τη χρήση, όπως τη διαβάζει ΚΑΙ η οθόνη ΚΑΙ το αρχείο. */
export interface PropertyLine {
  p: PortalProperty;
  rentAnnual: number;
  rentMonths: number;
  shortGross: number;
  /** Πόσες διαμονές μπήκαν με το ωμό ποσό τους, επειδή δεν δηλώνουν βάση. */
  staysUnresolved: number;
  income: number;
  expenses: number;
}

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

/** Το μοναδικό σημείο όπου το ακίνητο γίνεται γραμμή χρήσης. */
export function propertyLines(props: readonly PortalProperty[]): PropertyLine[] {
  return props.map(p => {
    const stays = p.stays || [];
    // ΤΟ ΩΜΟ `total` ΔΕΝ ΑΘΡΟΙΖΕΤΑΙ. Είναι ακαθάριστο Η payout, ανάλογα με το
    // `amount_basis`· το Ε2 περνά από το δηλωτέο ακαθάριστο, δηλαδή τι πλήρωσε
    // ο επισκέπτης μείον το τέλος ανθεκτικότητας, που δεν είναι έσοδο.
    const shortGross = sum(stays.map(declarableGrossOrTotal));
    return {
      p,
      rentAnnual: p.rent_collected || 0,
      rentMonths: p.rent_months || 0,
      shortGross,
      staysUnresolved: stays.filter(needsAmountReview).length,
      income: (p.rent_collected || 0) + shortGross,
      expenses: sum((p.expenses || []).map(e => e.amount || 0)),
    };
  });
}

/** Τα σύνολα της χρήσης. */
export interface StatementTotals {
  income: number; expenses: number;
  /** Καμία καταχώρηση εσόδου ή δαπάνης: δεν υπολογίζεται τίποτα πάνω σε αυτό. */
  hasEntries: boolean;
  staysUnresolved: number;
}

export function statementTotals(lines: readonly PropertyLine[]): StatementTotals {
  const income = sum(lines.map(l => l.income));
  const expenses = sum(lines.map(l => l.expenses));
  return {
    income, expenses,
    hasEntries: income > 0 || expenses > 0,
    staysUnresolved: sum(lines.map(l => l.staysUnresolved)),
  };
}

// ── ΤΙ ΛΕΙΠΕΙ ──────────────────────────────────────────────────────────────
// ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΩΣ ΠΡΟΤΑΣΗ ΠΟΥ ΕΛΕΓΕ ΤΟ ΑΝΤΙΘΕΤΟ ΑΠΟ ΟΣΑ ΕΝΝΟΟΥΣΕ:
// «Κανένα ακίνητο χωρίς καταχωρημένη είσπραξη: Διαμέρισμα Παγκράτι, Στούντιο
// Κουκάκι». Διαβάζεται «κανένα δεν είναι χωρίς», δηλαδή «όλα εντάξει» — και
// από κάτω ακολουθεί η λίστα αυτών που ΔΕΝ είναι εντάξει. Σε επαγγελματία που
// υπογράφει δήλωση, μια πρόταση που μπορεί να διαβαστεί ανάποδα δεν είναι
// θέμα ύφους. Οι προτάσεις παράγονται πλέον εδώ, μία φορά, και δοκιμάζονται.
export interface Gap { key: string; text: string; blocking: boolean }

const listOf = (names: readonly string[]) => names.join(', ');

export function statementGaps(lines: readonly PropertyLine[]): Gap[] {
  const total = lines.length;
  if (total === 0) return [];
  const silent = lines.filter(l => l.income === 0).map(l => l.p.name);
  const noExpenses = lines.filter(l => l.expenses === 0).map(l => l.p.name);
  const noAtak = lines.filter(l => !l.p.atak).map(l => l.p.name);
  // ΤΟ «ΔΕΝ ΤΟ ΣΤΕΛΝΕΙ Η ΒΑΣΗ» ΔΕΝ ΕΙΝΑΙ «ΔΕΝ ΤΟ ΕΧΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ».
  // Το εμβαδόν μπήκε στη `get_accountant_data` με τη μετανάστευση 20260818110000.
  // Οσο εκείνη δεν έχει τρέξει, το πεδίο λείπει από ΟΛΑ τα ακίνητα — και μια
  // οθόνη που γράφει τότε «Χωρίς εμβαδόν: όλα» κατηγορεί τον ιδιοκτήτη για κάτι
  // που έχει καταχωρήσει. Απουσία πεδίου: σιωπή. Πεδίο με μηδέν: εκκρεμότητα.
  const noSqm = lines.filter(l => l.p.sqm !== undefined && !(Number(l.p.sqm) > 0)).map(l => l.p.name);
  const out: Gap[] = [];
  if (silent.length) out.push({
    key: 'income', blocking: true,
    text: silent.length === total
      ? `Κανένα ακίνητο δεν έχει καταχωρημένη είσπραξη: ${listOf(silent)}`
      : `${silent.length} από ${total} ακίνητα χωρίς καταχωρημένη είσπραξη: ${listOf(silent)}`,
  });
  if (noExpenses.length) out.push({
    key: 'expenses', blocking: false,
    text: noExpenses.length === total
      ? `Καμία δαπάνη σε κανένα ακίνητο: ${listOf(noExpenses)}`
      : `Καμία δαπάνη σε: ${listOf(noExpenses)}`,
  });
  if (noAtak.length) out.push({ key: 'atak', blocking: true, text: `Χωρίς ΑΤΑΚ: ${listOf(noAtak)}` });
  if (noSqm.length) out.push({ key: 'sqm', blocking: true, text: `Χωρίς εμβαδόν: ${listOf(noSqm)}` });
  return out;
}

// ── ΤΟ ΑΡΧΕΙΟ ──────────────────────────────────────────────────────────────
// Τέσσερα φύλλα, με τη σειρά που τα ανοίγει ο λογιστής: πρώτα η γραμμή ανά
// ακίνητο (εκεί πάει το Ε2), μετά οι δαπάνες, μετά οι διαμονές, τελευταίο τι
// λείπει. Ο,τι λείπει ταξιδεύει ΜΕΣΑ στο αρχείο: ένα .xlsx που κυκλοφορεί με
// email χωρίς τις επιφυλάξεις του είναι αριθμοί χωρίς συμφραζόμενα.

/** Κενό κελί, όχι παύλα: η παύλα σε στήλη τιμών διαβάζεται ως τιμή. */
const BLANK = '';

/** Πόσα δηλώνονται από αυτή τη γραμμή, με το ποσοστό συνιδιοκτησίας. */
const shareOf = (amount: number, ownership: number | null | undefined) => {
  const pct = Number(ownership);
  return Number.isFinite(pct) && pct > 0 && pct < 100 ? amount * (pct / 100) : amount;
};

export interface StatementFileInput {
  owner: string;
  year: number;
  /** Ημερομηνία έκδοσης σε ISO, δίνεται απ' έξω ώστε η συνάρτηση να μένει καθαρή. */
  issued: string;
  lines: readonly PropertyLine[];
}

export function statementSheets(inp: StatementFileInput): XlsxSheet[] {
  const { owner, year, issued, lines } = inp;
  const subtitle = `${owner} · χρήση 01/01/${year} έως 31/12/${year} · έκδοση ${issued}`;
  const totals = statementTotals(lines);
  const gaps = statementGaps(lines);

  // ΟΙ ΕΠΙΦΥΛΑΞΕΙΣ ΤΑΞΙΔΕΥΟΥΝ ΜΕ ΤΟΥΣ ΑΡΙΘΜΟΥΣ, ΣΕ ΚΑΘΕ ΦΥΛΛΟ ΠΟΥ ΤΙΣ ΑΦΟΡΑ.
  const notes: string[] = [
    'Ποσά όπως τα καταχώρησε ο ιδιοκτήτης. Καμία ταυτότητα μισθωτή, επισκέπτη ή προμηθευτή: ο σύνδεσμος δεν τις μεταφέρει.',
    'Για τη γραμμή του Ε2 λείπει το ΑΦΜ του μισθωτή, που το έχει ο ιδιοκτήτης.',
  ];
  // ΟΤΑΝ ΥΠΑΡΧΕΙ ΣΥΝΙΔΙΟΚΤΗΣΙΑ, ΛΕΓΕΤΑΙ. Δύο στήλες με το ίδιο ακίνητο και
  // διαφορετικό ποσό είναι ερώτηση, όχι πληροφορία, αν δεν εξηγηθεί.
  if (lines.some(l => Number(l.p.ownership) > 0 && Number(l.p.ownership) < 100)) {
    notes.push('Οι στήλες «Αναλογία» δείχνουν το μερίδιο του ιδιοκτήτη, στα έσοδα ΚΑΙ στις δαπάνες, με το ποσοστό συνιδιοκτησίας του ακινήτου. Δαπάνη δηλωμένη ρητά ως μοιρασμένη ή πληρωμένη από τρίτον δεν ξεχωρίζει σε αυτό το φύλλο.');
  }
  if (totals.staysUnresolved > 0) {
    notes.push(totals.staysUnresolved === 1
      ? 'Μία διαμονή δεν δηλώνει αν το ποσό της είναι ακαθάριστο ή καθαρή είσπραξη· μπήκε όπως καταχωρήθηκε.'
      : `${totals.staysUnresolved} διαμονές δεν δηλώνουν αν το ποσό τους είναι ακαθάριστο ή καθαρή είσπραξη· μπήκαν όπως καταχωρήθηκαν.`);
  }

  const perProperty: XlsxSheet = {
    name: 'Ανά ακίνητο',
    title: `Κατάσταση χρήσης ${year}`,
    subtitle,
    columns: [
      { header: 'Ακίνητο', kind: 'text' },
      { header: 'ΑΤΑΚ', kind: 'text' },
      { header: 'Διεύθυνση', kind: 'text' },
      { header: 'Είδος', kind: 'text' },
      { header: 'Εμβαδόν (τ.μ.)', kind: 'num' },
      { header: 'Ποσοστό', kind: 'pct' },
      { header: 'Ενοίκια χρήσης', kind: 'eur' },
      { header: 'Καταχωρημένες περίοδοι', kind: 'int' },
      { header: 'Βραχυχρόνια, δηλωτέο ακαθάριστο', kind: 'eur' },
      { header: 'Σύνολο εσόδων', kind: 'eur' },
      { header: 'Αναλογία εσόδων ιδιοκτήτη', kind: 'eur' },
      { header: 'Δαπάνες χρήσης', kind: 'eur' },
      // ══════════════════════════════════════════════════════════════════════
      // ΤΟ ΠΟΣΟΣΤΟ ΙΣΧΥΕΙ ΚΑΙ ΣΤΙΣ ΔΥΟ ΠΛΕΥΡΕΣ, ΑΛΛΙΩΣ ΔΕΝ ΙΣΧΥΕΙ ΠΟΥΘΕΝΑ.
      //
      // Η στήλη των εσόδων περνούσε από το ποσοστό συνιδιοκτησίας· η στήλη των
      // δαπανών όχι. Δίπλα δίπλα, ο λογιστής διάβαζε έσοδα στο 33,33% και
      // δαπάνες στο 100% για το ίδιο ακίνητο, χωρίς τίποτα να το λέει. Σε
      // ακίνητο τριών αδελφών με 6.000 € έσοδα και 2.400 € δαπάνες, η γραμμή
      // έδειχνε 2.000 € έναντι 2.400 €: ζημιά που δεν υπάρχει.
      { header: 'Αναλογία δαπανών ιδιοκτήτη', kind: 'eur' },
    ],
    rows: lines.map(l => [
      l.p.name,
      l.p.atak || BLANK,
      l.p.address || BLANK,
      l.p.prop_type || BLANK,
      Number(l.p.sqm) > 0 ? Number(l.p.sqm) : null,
      Number(l.p.ownership) > 0 ? Number(l.p.ownership) : null,
      l.rentAnnual,
      l.rentMonths,
      l.shortGross,
      l.income,
      shareOf(l.income, l.p.ownership),
      l.expenses,
      shareOf(l.expenses, l.p.ownership),
    ]),
    totalCols: [6, 8, 9, 10, 11, 12],
    notes,
  };

  const expenseRows = lines.flatMap(l =>
    (l.p.expenses || []).map(e => [l.p.name, e.date ? new Date(e.date) : null, e.category || 'Χωρίς κατηγορία', e.amount || 0]));
  const expenses: XlsxSheet = {
    name: 'Δαπάνες',
    title: `Δαπάνες χρήσης ${year}`,
    subtitle,
    columns: [
      { header: 'Ακίνητο', kind: 'text' },
      { header: 'Ημερομηνία', kind: 'date' },
      { header: 'Κατηγορία', kind: 'text' },
      { header: 'Ποσό', kind: 'eur' },
    ],
    rows: expenseRows,
    totalCols: [3],
    notes: ['Χωρίς ΑΦΜ προμηθευτή και χωρίς παραστατικό: τα κρατά ο ιδιοκτήτης στον φάκελό του.'],
  };

  const stayRows = lines.flatMap(l => (l.p.stays || []).map(s => [
    l.p.name,
    s.check_in ? new Date(s.check_in) : null,
    s.check_out ? new Date(s.check_out) : null,
    s.nights ?? null,
    declarableGrossOrTotal(s),
    collectedLevy(s),
    platformFee(s),
    AMOUNT_BASIS_LABELS[amountBasis(s)],
  ]));
  const stays: XlsxSheet = {
    name: 'Διαμονές',
    title: `Βραχυχρόνιες διαμονές ${year}`,
    subtitle,
    columns: [
      { header: 'Ακίνητο', kind: 'text' },
      { header: 'Άφιξη', kind: 'date' },
      { header: 'Αναχώρηση', kind: 'date' },
      { header: 'Νύχτες', kind: 'int' },
      { header: 'Δηλωτέο ακαθάριστο', kind: 'eur' },
      { header: 'Τέλος ανθεκτικότητας', kind: 'eur' },
      { header: 'Προμήθεια πλατφόρμας', kind: 'eur' },
      { header: 'Βάση ποσού', kind: 'text' },
    ],
    rows: stayRows,
    totalCols: [4, 5, 6],
    notes: ['Το τέλος ανθεκτικότητας το εισπράττει ο ιδιοκτήτης για λογαριασμό του Δημοσίου: δεν είναι έσοδό του και δεν μπαίνει στο δηλωτέο ακαθάριστο.'],
  };

  const missing: XlsxSheet = {
    name: 'Τι λείπει',
    title: `Τι λείπει από τη χρήση ${year}`,
    subtitle,
    columns: [
      { header: 'Εκκρεμότητα', kind: 'text', width: 70 },
      { header: 'Εμποδίζει το κλείσιμο', kind: 'text' },
    ],
    rows: gaps.length
      ? gaps.map(g => [g.text, g.blocking ? 'Ναι' : 'Οχι'])
      : [['Καμία εκκρεμότητα από όσα βλέπει αυτός ο σύνδεσμος.', 'Οχι']],
    notes: ['Σημαίνει ότι δεν καταχωρήθηκε, όχι ότι δεν υπάρχει.'],
  };

  // Φύλλο χωρίς γραμμές δεν μπαίνει: ο παραλήπτης που ανοίγει «Διαμονές» και
  // βρίσκει μόνο επικεφαλίδες δεν ξέρει αν δεν υπήρξαν ή αν χάθηκαν.
  return [perProperty, ...(expenseRows.length ? [expenses] : []), ...(stayRows.length ? [stays] : []), missing];
}
