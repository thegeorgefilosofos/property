// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΛΙΣΤΑ. ΚΑΘΕ ΕΥΡΩ ΜΙΑ ΦΟΡΑ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ:
// Το ίδιο ευρώ ζούσε σε δύο πίνακες. Όταν πληρωνόταν ένας λογαριασμός, ο κώδικας
// έγραφε ΚΑΙ γραμμή στον `bills` ΚΑΙ γραμμή στον `expenses` με `bill_id` που
// δείχνει πίσω. Σωστό: ο λογαριασμός είναι το πρόγραμμα πληρωμής, η δαπάνη είναι
// το γεγονός. Λάθος ήταν ότι κάθε οθόνη έλυνε μόνη της τη διπλομέτρηση, με
// διαφορετικό τρόπο:
//   • ο Προϋπολογισμός έκρυβε τις συνδεδεμένες δαπάνες με .is('bill_id', null)
//   • οι Δαπάνες δεν έκρυβαν τίποτα ΚΑΙ πρόσθεταν χωριστά το σύνολο λογαριασμών
//   • η Λογιστική μετρούσε αλλιώς
// Αποτέλεσμα: τρεις οθόνες, τρία διαφορετικά σύνολα για το ίδιο ακίνητο.
//
// Η ΛΥΣΗ ΕΙΝΑΙ ΑΝΑΓΝΩΣΗ, ΟΧΙ ΜΕΤΑΝΑΣΤΕΥΣΗ:
// καμία γραμμή δεν μετακινείται, κανένα migration, καμία απώλεια. Οι δύο πίνακες
// μένουν ακριβώς όπως είναι και συγχωνεύονται εδώ, σε ένα σημείο, με κανόνες που
// ελέγχονται με test. Σε βάση χωρίς αντίγραφα ασφαλείας, αυτή είναι η μόνη
// υπεύθυνη επιλογή.
//
// Η ΚΕΝΤΡΙΚΗ ΙΔΕΑ ΤΟΥ ΠΡΟΪΟΝΤΟΣ, ΣΕ ΜΙΑ ΓΡΑΜΜΗ:
// ο λογαριασμός δεν είναι άλλο πράγμα από τη δαπάνη. Είναι δαπάνη που δεν την
// έχεις πληρώσει ακόμη. Γι' αυτό έχει ημερομηνία λήξης· γι' αυτό, μόλις
// πληρωθεί, παύει να ξεχωρίζει.
// ═══════════════════════════════════════════════════════════════════════════

/** Γραμμή λογαριασμού όπως έρχεται από τη βάση. Μόνο ό,τι χρειάζεται η συγχώνευση. */
export interface LedgerBill {
  id: string;
  name?: string | null;
  category?: string | null;
  amount?: number | null;
  due_date?: string | null;
  paid?: boolean | null;
  paid_at?: string | null;
  recurring?: boolean | null;
  created_at?: string | null;
}

/** Γραμμή δαπάνης όπως έρχεται από τη βάση. */
export interface LedgerExpense {
  id: string;
  bill_id?: string | null;
  description?: string | null;
  category?: string | null;
  expense_group?: string | null;
  amount?: number | null;
  date?: string | null;
  paid?: boolean | null;
  store_vendor?: string | null;
  is_recurring?: boolean | null;
}

/** Μία γραμμή της ενιαίας λίστας. */
export interface LedgerEntry {
  /** Σταθερό κλειδί. Προτεραιότητα στη δαπάνη, γιατί αυτή επιβιώνει της πληρωμής. */
  key: string;
  billId: string | null;
  expenseId: string | null;
  /** Η ημερομηνία που ΜΕΤΡΑ για σύνολα και ομαδοποίηση κατά μήνα. */
  date: string;
  /** Πότε λήγει. Μόνο για απλήρωτα· διαφορετικά null. */
  due: string | null;
  title: string;
  amount: number;
  paid: boolean;
  category: string;
  group: string | null;
  recurring: boolean;
  vendor: string | null;
}

export interface LedgerResult {
  /** Η λίστα, νεότερα πρώτα. Κάθε ευρώ ακριβώς μία φορά. */
  entries: LedgerEntry[];
  /**
   * Δαπάνες που δείχνουν στον ΙΔΙΟ λογαριασμό με άλλη που ήδη μετρήθηκε.
   * Δεν πετιούνται και δεν αθροίζονται: επιστρέφονται ξεχωριστά ώστε η οθόνη να
   * μπορεί να τις δείξει ως «θέλουν ματιά». Το να τις σβήσουμε σιωπηλά θα ήταν
   * απώλεια δεδομένων· το να τις μετρήσουμε, διπλομέτρηση.
   */
  duplicates: LedgerEntry[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Κρατά μόνο το YYYY-MM-DD, ακόμη κι από πλήρες timestamp. */
const day = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/**
 * Ποια ημερομηνία μετρά για έναν λογαριασμό.
 *
 * ΟΧΙ το created_at, που είναι πότε το ΚΑΤΑΧΩΡΗΣΕΣ. Ο Προϋπολογισμός φιλτράριζε
 * τους λογαριασμούς με created_at και τις δαπάνες με date, οπότε λογαριασμός
 * Ιανουαρίου που καταχωρήθηκε τον Φεβρουάριο μετρούσε στον Φεβρουάριο και
 * χάλαγε δύο μήνες με μία κίνηση.
 *
 * Πληρωμένος μετρά όταν πληρώθηκε. Απλήρωτος μετρά όταν λήγει, γιατί τότε
 * οφείλεται. Το created_at μένει μόνο ως έσχατο δίχτυ.
 */
const billDate = (b: LedgerBill): string =>
  (b.paid ? day(b.paid_at) : null) || day(b.due_date) || day(b.created_at) || '';

/**
 * Συγχωνεύει λογαριασμούς και δαπάνες σε μία χρονολογική λίστα.
 *
 * ΚΑΝΟΝΕΣ, με τη σειρά που εφαρμόζονται:
 *
 * 1. Δαπάνη με bill_id που ΒΡΙΣΚΕΙ λογαριασμό  ->  ΜΙΑ γραμμή. Το ποσό, η
 *    περιγραφή και η κατηγορία έρχονται από τη ΔΑΠΑΝΗ (είναι το γεγονός, και
 *    ο χρήστης μπορεί να τη διορθώσει), η προθεσμία και το «πάγιο» από τον
 *    ΛΟΓΑΡΙΑΣΜΟ (είναι το πρόγραμμα).
 * 2. Λογαριασμός ΧΩΡΙΣ συνδεδεμένη δαπάνη  ->  γραμμή από τον λογαριασμό.
 *    Αυτό είναι ο απλήρωτος λογαριασμός: υπάρχει, οφείλεται, πρέπει να φαίνεται.
 * 3. Δαπάνη ΧΩΡΙΣ bill_id, ή με bill_id που δεν βρίσκει τίποτα  ->  δική της
 *    γραμμή. Το δεύτερο σκέλος έχει σημασία: αν σβηστεί λογαριασμός, η βάση
 *    μηδενίζει το bill_id (ON DELETE SET NULL) αλλά μια δαπάνη μπορεί να έχει
 *    μείνει με κρέμαστο id σε παλιά δεδομένα. Δεν επιτρέπεται να εξαφανιστεί.
 * 4. Δεύτερη και τρίτη δαπάνη στον ΙΔΙΟ λογαριασμό  ->  στα duplicates.
 *
 * Καμία γραμμή εισόδου δεν χάνεται: entries.length + duplicates.length ισούται
 * πάντα με το πλήθος των διακριτών χρηματικών γεγονότων.
 */
export function mergeLedger(bills: LedgerBill[], expenses: LedgerExpense[]): LedgerResult {
  const byBill = new Map<string, LedgerExpense[]>();
  const loose: LedgerExpense[] = [];
  const billIds = new Set(bills.map(b => b.id));

  for (const e of expenses) {
    const link = e.bill_id;
    if (link && billIds.has(link)) {
      const arr = byBill.get(link);
      if (arr) arr.push(e); else byBill.set(link, [e]);
    } else {
      loose.push(e);
    }
  }

  const entries: LedgerEntry[] = [];
  const duplicates: LedgerEntry[] = [];

  const fromExpense = (e: LedgerExpense, b: LedgerBill | null): LedgerEntry => {
    const paid = e.paid !== false;
    return {
      key: `e:${e.id}`,
      billId: b ? b.id : null,
      expenseId: e.id,
      date: day(e.date) || (b ? billDate(b) : '') || '',
      // Η προθεσμία έχει νόημα μόνο όσο δεν έχει πληρωθεί. Μετά είναι θόρυβος.
      due: paid ? null : (b ? day(b.due_date) : null),
      title: (e.description || (b ? b.name : '') || '').trim() || 'Χωρίς περιγραφή',
      amount: num(e.amount),
      paid,
      category: (e.category || (b ? b.category : '') || '').trim(),
      group: e.expense_group || null,
      recurring: !!(e.is_recurring || (b && b.recurring)),
      vendor: e.store_vendor || null,
    };
  };

  for (const b of bills) {
    const linked = byBill.get(b.id);
    if (linked && linked.length) {
      entries.push(fromExpense(linked[0], b));
      for (let i = 1; i < linked.length; i++) duplicates.push(fromExpense(linked[i], b));
      continue;
    }
    const paid = !!b.paid;
    entries.push({
      key: `b:${b.id}`,
      billId: b.id,
      expenseId: null,
      date: billDate(b),
      due: paid ? null : day(b.due_date),
      title: (b.name || '').trim() || 'Χωρίς περιγραφή',
      amount: num(b.amount),
      paid,
      category: (b.category || '').trim(),
      // Ο λογαριασμός δεν φέρει ομάδα δαπάνης. Μένει null και το τακτοποιεί
      // η ταξινόμηση από την κατηγορία, όχι μια μαντεψιά εδώ.
      group: null,
      recurring: !!b.recurring,
      vendor: null,
    });
  }

  for (const e of loose) entries.push(fromExpense(e, null));

  // Νεότερα πρώτα. Σταθερή σειρά με δεύτερο κριτήριο το key, ώστε δύο γραμμές
  // της ίδιας μέρας να μη χοροπηδούν μεταξύ τους σε κάθε φόρτωση.
  entries.sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : (a.date < b.date ? 1 : -1)));
  duplicates.sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : (a.date < b.date ? 1 : -1)));

  return { entries, duplicates };
}

/** Το σύνολο. Δέχεται ΜΟΝΟ entries, ποτέ duplicates, ώστε να μη διπλομετρήσει. */
export const ledgerTotal = (entries: LedgerEntry[]): number =>
  entries.reduce((s, e) => s + e.amount, 0);

/** Όσα οφείλονται ακόμη. */
export const ledgerUnpaid = (entries: LedgerEntry[]): LedgerEntry[] =>
  entries.filter(e => !e.paid);

/**
 * Ομαδοποίηση κατά μήνα, νεότερος πρώτος.
 *
 * ΓΙΑΤΙ ΚΑΤΑ ΜΗΝΑ ΚΑΙ ΟΧΙ ΚΑΤΑ ΚΑΤΗΓΟΡΙΑ: ο ιδιοκτήτης δεν ρωτά «πόσα έδωσα σε
 * συντήρηση» πριν ρωτήσει «πόσα έδωσα τον Ιούλιο». Ο μήνας είναι ο τρόπος που
 * σκέφτεται τα χρήματά του, γιατί μηνιαία μπαίνει το ενοίκιο και μηνιαία
 * έρχονται οι λογαριασμοί. Η κατηγορία είναι φίλτρο, όχι σκελετός.
 */
export function groupByMonth(entries: LedgerEntry[]): { month: string; total: number; entries: LedgerEntry[] }[] {
  const map = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const m = (e.date || '').slice(0, 7) || 'άγνωστο';
    const arr = map.get(m);
    if (arr) arr.push(e); else map.set(m, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, list]) => ({ month, total: ledgerTotal(list), entries: list }));
}
