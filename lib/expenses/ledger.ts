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
  /**
   * ΑΦΜ εκδότη, εννέα ψηφία. Δεν περνά στο `LedgerEntry`: η συγχώνευση δεν το
   * χρειάζεται και ο λογαριασμός δεν έχει τέτοια στήλη, οπότε μια γραμμή
   * `LedgerEntry` θα το κουβαλούσε πάντα κενό. Η οθόνη επεξεργασίας το παίρνει
   * από την ίδια τη γραμμή δαπάνης.
   */
  supplier_afm?: string | null;
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
 *    περιγραφή και η κατηγορία έρχονται από τη ΔΑΠΑΝΗ (είναι το γεγονός και
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
    // ΑΓΝΩΣΤΟ ΔΕΝ ΣΗΜΑΙΝΕΙ ΠΛΗΡΩΜΕΝΟ.
    //
    // Εδώ γραφόταν `e.paid !== false`, δηλαδή το NULL περνούσε ως «ναι». Η
    // στήλη είναι `boolean | null` και υπήρχε διαδρομή που έγραφε δαπάνη χωρίς
    // `paid` (η σάρωση παραστατικού, που παρέκαμπτε το `expenses.row()`). Ένας
    // απλήρωτος λογαριασμός ΔΕΗ 84,50 € φαινόταν εξοφλημένος, έχανε την
    // προθεσμία του, έφευγε από τις οφειλές και μετριόταν στα πληρωμένα.
    //
    // Το λάθος πέφτει τώρα προς την πλευρά που ο χρήστης μπορεί να διορθώσει:
    // μια πληρωμένη δαπάνη που δείχνει ανοιχτή τη σημειώνει σε δύο κλικ· μια
    // απλήρωτη που δείχνει κλειστή δεν την ξαναβλέπει ποτέ.
    // Ο ΣΥΝΔΕΔΕΜΕΝΟΣ ΛΟΓΑΡΙΑΣΜΟΣ ΞΕΡΕΙ. Όταν η δαπάνη κρέμεται από λογαριασμό
    // που έχει σημειωθεί πληρωμένος, αυτό ΔΕΝ είναι μαντεψιά — είναι δεδομένο
    // που ο χρήστης καταχώρησε αλλού. Χωρίς αυτό, το ζεύγος «λογαριασμός
    // πληρωμένος + δαπάνη χωρίς paid» θα εμφανιζόταν ανοιχτό.
    const paid = e.paid === true || (b ? !!b.paid : false);
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

export interface RecurringMonthly {
  /** Ο μέσος μήνας σε πάγια. `null` όταν το ιστορικό δεν φτάνει για μέσο όρο. */
  perMonth: number | null;
  /** Πόσους μήνες ΚΑΛΥΠΤΕΙ το ιστορικό — η βάση της διαίρεσης. */
  months: number;
  /** Σύνολο παγίων στο διάστημα. */
  total: number;
}

/**
 * Πόσο κοστίζει ο μήνας σε ΠΑΓΙΑ, μετρημένο από το ιστορικό.
 *
 * ΓΙΑΤΙ ΔΕΝ ΑΘΡΟΙΖΟΥΜΕ ΑΠΛΩΣ ΤΟΥΣ ΠΑΓΙΟΥΣ ΛΟΓΑΡΙΑΣΜΟΥΣ
 * Στον πίνακα `bills` κάθε γραμμή είναι ΜΙΑ ΠΕΡΙΟΔΟΣ: ο χρήστης διαλέγει
 * «Ιούλιος 2026» και καταχωρεί τον λογαριασμό εκείνου του μήνα. Το `recurring`
 * είναι ΧΑΡΑΚΤΗΡΙΣΜΟΣ («Πάγιο» απέναντι σε «Εφάπαξ»), όχι πρόγραμμα — καμία
 * αυτόματη ανανέωση δεν υπάρχει. Άρα το άθροισμα των παγίων γραμμών είναι το
 * σύνολο ΟΛΩΝ των περιόδων που έχει καταχωρήσει, ποτέ ένας μήνας. Δώδεκα
 * λογαριασμοί ΔΕΗ των 100 € έδιναν «1.200 € / μήνα».
 *
 * ΓΙΑΤΙ ΔΙΑΙΡΟΥΜΕ ΜΕ ΤΟ ΕΥΡΟΣ ΚΑΙ ΟΧΙ ΜΕ ΤΟ 12 Ή ΜΕ ΤΟΥΣ ΜΗΝΕΣ ΠΟΥ ΕΧΟΥΝ ΓΡΑΜΜΗ
 * Με σταθερό 12, όποιος ξεκίνησε τον Οκτώβριο βλέπει τα πάγιά του τέσσερις
 * φορές μικρότερα. Με «μήνες που έχουν γραμμή», ο δίμηνος λογαριασμός (ΕΥΔΑΠ,
 * συχνά και η ΔΕΗ) βγαίνει διπλάσιος: τρεις καταχωρήσεις των 80 € μέσα σε πέντε
 * μήνες είναι 48 €/μήνα, όχι 80. Το εύρος από την πρώτη ως την τελευταία
 * περίοδο είναι το μόνο που δίνει σωστό νούμερο και στις δύο συχνότητες.
 *
 * ΓΙΑΤΙ ΕΠΙΣΤΡΕΦΕΙ `null` ΜΕ ΛΙΓΟ ΙΣΤΟΡΙΚΟ
 * Με έναν μήνα δεδομένων δεν υπάρχει μέσος όρος — υπάρχει ένας μήνας. Το να
 * τον παρουσιάζαμε ως «ανά μήνα» θα ήταν εικασία με ευρώ δίπλα της. Ο καλών
 * δείχνει τότε το σκέτο σύνολο, με την ετικέτα που του αντιστοιχεί.
 */
export function recurringMonthly(entries: LedgerEntry[], minMonths = 2): RecurringMonthly {
  return monthlyAverage(entries.filter(e => e.recurring), minMonths);
}

/**
 * Ο ΜΕΣΟΣ ΜΗΝΑΣ ΜΙΑΣ ΛΙΣΤΑΣ, ΜΕ ΤΟΝ ΙΔΙΟ ΚΑΝΟΝΑ ΓΙΑ ΟΛΟΥΣ.
 *
 * Ο κανόνας από πάνω γράφτηκε για τα πάγια, αλλά δεν έχει τίποτα δικό τους: ο
 * παρονομαστής είναι το εύρος του ιστορικού και όχι το δώδεκα, σε ΚΑΘΕ λίστα
 * δαπανών. Η Σύγκριση όμως έγραφε «δαπάνες έτους ÷ 12» για το «Καθαρό ανά
 * μήνα», δηλαδή ακριβώς το σφάλμα που αυτό το αρχείο περιγράφει δύο
 * παραγράφους πιο πάνω: τον Μάρτιο, τρεις μήνες δαπανών μοιράζονταν σε δώδεκα
 * και το ακίνητο έδειχνε τέσσερις φορές φθηνότερο απ' ό,τι είναι. Και ήταν η
 * στήλη με το στεφάνι «καλύτερο», δηλαδή η στήλη που κρίνει τι κρατάς.
 */
export function monthlyAverage(entries: LedgerEntry[], minMonths = 2): RecurringMonthly {
  const dated = entries.filter(e => e.date);
  const total = ledgerTotal(dated);
  if (!dated.length) return { perMonth: null, months: 0, total: 0 };

  const months = dated.map(e => e.date.slice(0, 7)).sort();
  const first = months[0], last = months[months.length - 1];
  const span = (+last.slice(0, 4) - +first.slice(0, 4)) * 12
             + (+last.slice(5, 7) - +first.slice(5, 7)) + 1;

  if (span < minMonths) return { perMonth: null, months: span, total };
  return { perMonth: Math.round((total / span) * 100) / 100, months: span, total };
}
