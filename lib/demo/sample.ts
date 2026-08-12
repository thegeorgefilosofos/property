// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΑΡΑΔΕΙΓΜΑ ΔΕΝ ΓΡΑΦΕΤΑΙ ΠΟΥΘΕΝΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΥΠΗΡΧΕ ΠΡΙΝ. Το «demo» της υποδοχής δημιουργούσε ΠΡΑΓΜΑΤΙΚΟ ακίνητο στον
// λογαριασμό: μία εγγραφή στα `user_properties`, έναν πελάτη, τέσσερις διαμονές
// και ρυθμίσεις τιμολόγησης. Ο νέος χρήστης, δύο λεπτά μετά την εγγραφή, είχε
// μέσα στα δικά του δεδομένα ένα ακίνητο που δεν του ανήκει — και για να το
// βγάλει έπρεπε να βρει ένα κουμπί «Καθάρισε το demo» που έψαχνε όνομα
// «Demo —» ενώ το ακίνητο γραφόταν «Demo:». Δηλαδή δεν εμφανιζόταν ποτέ.
//
// ΤΙ ΙΣΧΥΕΙ ΤΩΡΑ. Το παράδειγμα είναι ΠΡΟΕΠΙΣΚΟΠΗΣΗ: καθαρά δεδομένα σε αυτό
// εδώ το αρχείο, υπολογισμοί στη μνήμη, καμία εγγραφή σε πίνακα. Δεν υπάρχει
// τίποτα να καθαριστεί, γιατί δεν αποθηκεύτηκε τίποτα.
//
// ΓΙΑΤΙ ΟΙ ΑΡΙΘΜΟΙ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΙΣ ΠΡΑΓΜΑΤΙΚΕΣ ΣΥΝΑΡΤΗΣΕΙΣ. Το παράδειγμα
// περνά από `incomeStatement` και `expenseAccount`, τις ίδιες που βλέπει ο
// πληρωμένος χρήστης. Δεν υπάρχει ούτε ένα ποσό γραμμένο στο χέρι ως
// αποτέλεσμα: αν αλλάξει η κλίμακα φόρου, αλλάζει και η προεπισκόπηση. Έτσι
// δεν μπορεί να δείξει ποτέ κάτι που η εφαρμογή δεν κάνει.
//
// Η ΧΡΟΝΙΑ ΕΙΝΑΙ ΠΑΝΤΑ ΚΛΕΙΣΜΕΝΗ. Το προηγούμενο ημερολογιακό έτος: μόνο εκεί
// υπάρχουν δώδεκα μήνες εσόδων και ολόκληρη φορολογική εικόνα. Με την τρέχουσα
// χρονιά, η προεπισκόπηση θα έδειχνε μισή χρονιά και μισό φόρο.
// ═══════════════════════════════════════════════════════════════════════════

import { incomeStatement, type IncomeStatement } from '@/lib/accounting/statement';
import { expenseAccount } from '@/lib/accounting/journal';
import { categoryLabel, isDeductible } from '@/lib/expenses/taxonomy';
import { rentalBracketsForYear, bracketsLabelForYear } from '@/lib/billing/greekTax';
import { greekPropertyTaxObligations } from '@/lib/tax/greekTaxCalendar';

/** Το ακίνητο του παραδείγματος. Ένα, μακροχρόνια μισθωμένο, με πλήρη στοιχεία. */
export const DEMO_PROPERTY = {
  name: 'Διαμέρισμα, Παγκράτι',
  address: 'Υμηττού 84, Αθήνα',
  postalCode: '11633',
  sqm: 68,
  bedrooms: 2,
  floor: 3,
  yearBuilt: 1998,
  energyClass: 'Δ',
  monthlyRent: 780,
  objValue: 96400,
} as const;

/** Η χρονιά του παραδείγματος: η τελευταία κλεισμένη. */
export function demoYear(today: string): number {
  const y = Number(String(today).slice(0, 4));
  return Number.isFinite(y) ? y - 1 : new Date().getFullYear() - 1;
}

export interface DemoRent { month: number; amount: number; paidDate: string }
export interface DemoExpense { date: string; category: string; description: string; amount: number }

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Δώδεκα εισπράξεις, με την ημερομηνία που μπήκαν στον λογαριασμό.
 *
 * Ο Δεκέμβριος πληρώνεται στις 8 Ιανουαρίου της επόμενης χρονιάς — ΕΠΙΤΗΔΕΣ.
 * Είναι το πιο συχνό πραγματικό περιστατικό και το πιο συχνό λάθος: με ταμειακή
 * βάση εκείνο το ενοίκιο ανήκει στην ΕΠΟΜΕΝΗ χρήση. Η προεπισκόπηση το δείχνει
 * ώστε να φαίνεται ότι η εφαρμογή ξέρει τη διαφορά.
 */
export function demoRents(year: number): DemoRent[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const paidDate = month === 12
      ? `${year + 1}-01-08`
      : `${year}-${pad(month)}-0${month % 2 === 0 ? 5 : 3}`;
    return { month, amount: DEMO_PROPERTY.monthlyRent, paidDate };
  });
}

/**
 * Η ημέρα που πληρώθηκε ο ΕΝΦΙΑ στο παράδειγμα.
 *
 * ΔΕΝ ΓΡΑΦΕΤΑΙ ΣΤΟ ΧΕΡΙ. Πρώτη γραφή είχε «03/07» και «05/10», δηλαδή δύο
 * ημερομηνίες που ΔΕΝ υπάρχουν στο φορολογικό ημερολόγιο — και ο φύλακας
 * υποχρεώσεων το έκοψε αμέσως. Ο χρήστης θα έβλεπε στην ίδια εφαρμογή δύο
 * διαφορετικές ημερομηνίες για τον ίδιο φόρο. Η πηγή είναι μία, και είναι το
 * `greekPropertyTaxObligations`. Αν λείψει (απρόβλεπτο έτος), το παράδειγμα
 * πέφτει στην τελευταία μέρα του Μαρτίου, χωρίς να ισχυριστεί προθεσμία.
 */
function enfiaPayDate(year: number): string {
  const first = greekPropertyTaxObligations(year, 'owner').find(o => o.kind === 'enfia-first');
  return first && first.date.startsWith(String(year)) ? first.date : `${year}-03-31`;
}

/**
 * Οι δαπάνες της χρονιάς.
 *
 * ΧΩΡΙΣ ΑΦΜ ΠΡΟΜΗΘΕΥΤΗ, ΕΠΙΤΗΔΕΣ. Η εφαρμογή όντως διαβάζει ΑΦΜ από το
 * παραστατικό και το στέλνει στον λογιστή. Ένα ΑΦΜ όμως είναι κωδικός
 * υπαρκτού νομικού προσώπου: αν το γράψουμε εδώ χωρίς να το έχουμε
 * επαληθεύσει από επίσημη πηγή, το παράδειγμα λέει ψέματα σε ένα πεδίο που ο
 * λογιστής θα πάρει τοις μετρητοίς. Το παράδειγμα δείχνει κατηγορία και
 * λογαριασμό — όσα παράγει ο ΔΙΚΟΣ μας κώδικας και μπορούμε να εγγυηθούμε.
 */
export function demoExpenses(year: number): DemoExpense[] {
  return [
    { date: `${year}-01-22`, category: 'insurance',  description: 'Ασφάλιση κατοικίας, ετήσιο ασφαλιστήριο', amount: 148.00 },
    { date: `${year}-02-14`, category: 'plumber',    description: 'Υδραυλικός, αντικατάσταση μπαταρίας μπάνιου', amount: 95.00 },
    { date: `${year}-03-09`, category: 'municipal',  description: 'Δημοτικά τέλη, εκκαθάριση', amount: 74.20 },
    { date: `${year}-04-18`, category: 'electricity', description: 'Ρεύμα, κοινόχρηστος μετρητής', amount: 62.40 },
    { date: `${year}-05-06`, category: 'water',      description: 'Ύδρευση, λογαριασμός διμήνου', amount: 48.30 },
    { date: `${year}-06-11`, category: 'repair',     description: 'Βαφή καθιστικού και διαδρόμου', amount: 420.00 },
    { date: enfiaPayDate(year), category: 'enfia',   description: 'ΕΝΦΙΑ, εξόφληση εκκαθαριστικού', amount: 316.00 },
    { date: `${year}-08-27`, category: 'ac_service', description: 'Συντήρηση κλιματιστικών, δύο μονάδες', amount: 110.00 },
    { date: `${year}-09-16`, category: 'electrician', description: 'Ηλεκτρολόγος, πίνακας και ρελέ', amount: 135.00 },
    { date: `${year}-11-13`, category: 'appliance',  description: 'Πλυντήριο ρούχων, αντικατάσταση', amount: 349.00 },
    { date: `${year}-12-04`, category: 'engineer',   description: 'Πιστοποιητικό ενεργειακής απόδοσης', amount: 120.00 },
  ];
}

export interface DemoLedgerRow {
  category: string;
  label: string;
  amount: number;
  account: string;
  accountName: string;
  deductible: boolean;
}

/** Οι δαπάνες αθροισμένες ανά κατηγορία, με τον λογαριασμό ΕΛΠ που τους δίνει
 *  η εφαρμογή. Ταξινόμηση κατά ποσό: η μεγαλύτερη δαπάνη διαβάζεται πρώτη. */
export function demoLedger(year: number): DemoLedgerRow[] {
  const byCat = new Map<string, number>();
  for (const e of demoExpenses(year)) byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount);
  return [...byCat.entries()]
    .map(([category, amount]) => {
      const a = expenseAccount(category);
      return {
        category,
        label: categoryLabel(category),
        amount: Math.round(amount * 100) / 100,
        account: a.code,
        accountName: a.name,
        deductible: isDeductible(category),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface DemoSummary {
  year: number;
  /** Εισπραγμένα μέσα στη χρονιά — ταμειακή βάση. */
  collected: number;
  /** Ενοίκιο που δεδουλεύτηκε μέσα στη χρονιά αλλά εισπράχθηκε την επόμενη. */
  carriedOver: number;
  expenses: number;
  enfia: number;
  otherCash: number;
  statement: IncomeStatement;
  bracketsLabel: string;
}

/**
 * Η φορολογική εικόνα της χρονιάς, από την ίδια συνάρτηση που υπολογίζει τον
 * πραγματικό φόρο του πληρωμένου χρήστη.
 *
 * Καθεστώς: φυσικό πρόσωπο, μακροχρόνια. Δηλαδή τεκμαρτή έκπτωση 5% και ΚΑΜΙΑ
 * αναλυτική έκπτωση δαπανών — ο ΕΝΦΙΑ και οι επισκευές είναι ταμειακή εκροή,
 * όχι μείωση φόρου. Είναι το σημείο που οι περισσότεροι ιδιοκτήτες κάνουν λάθος
 * και είναι ο λόγος που το παράδειγμα δείχνει τη μεσαία γραμμή.
 */
export function demoSummary(today: string): DemoSummary {
  const year = demoYear(today);
  const rents = demoRents(year);
  const collected = rents
    .filter(r => r.paidDate.startsWith(String(year)))
    .reduce((s, r) => s + r.amount, 0);
  const carriedOver = rents
    .filter(r => !r.paidDate.startsWith(String(year)))
    .reduce((s, r) => s + r.amount, 0);

  const rows = demoLedger(year);
  const enfia = rows.filter(r => r.category === 'enfia').reduce((s, r) => s + r.amount, 0);
  const otherCash = rows.filter(r => r.category !== 'enfia').reduce((s, r) => s + r.amount, 0);

  const statement = incomeStatement({
    regime: 'individual_longterm',
    grossIncome: collected,
    enfia,
    otherCashExpenses: otherCash,
    brackets: rentalBracketsForYear(year),
  });

  return {
    year,
    collected: Math.round(collected * 100) / 100,
    carriedOver: Math.round(carriedOver * 100) / 100,
    expenses: Math.round((enfia + otherCash) * 100) / 100,
    enfia: Math.round(enfia * 100) / 100,
    otherCash: Math.round(otherCash * 100) / 100,
    statement,
    bracketsLabel: bracketsLabelForYear(year),
  };
}
