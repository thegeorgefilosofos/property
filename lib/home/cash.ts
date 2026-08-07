// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΜΟΥ ΧΡΩΣΤΑΝΕ, ΤΙ ΧΡΩΣΤΑΩ.
// ─────────────────────────────────────────────────────────────────────────
// Η αρχική οθόνη άνοιγε με «Μηνιαίο ενοίκιο · Μεικτή απόδοση · Καθαρή απόδοση».
// Τρεις αριθμοί που δεν αλλάζουν από μήνα σε μήνα και δεν ζητούν καμία ενέργεια:
// ο ιδιοκτήτης τους ξέρει απ' έξω. Αυτό που ΔΕΝ ξέρει, και είναι ο λόγος που
// ανοίγει την εφαρμογή, είναι αν μπήκε το ενοίκιο και τι πρέπει να πληρώσει.
//
// Δύο αριθμοί, όχι κρίση. Το άθροισμα των δύο δεν λέει τίποτα (δεν
// συμψηφίζονται: το ενοίκιο του Ιουλίου δεν πληρώνει τον ΕΝΦΙΑ) και δεν
// εμφανίζεται πουθενά. Καμία χρωματική ετυμηγορία: το «χρωστάω 400 €» δεν είναι
// κακό, είναι ο ΕΝΦΙΑ. Η προτεραιότητα λέγεται με μέγεθος και σειρά.
//
// ΚΑΘΑΡΑ ΔΕΔΟΜΕΝΑ, ΚΑΜΙΑ ΕΙΚΑΣΙΑ: μετράει μόνο ό,τι υπάρχει καταχωρημένο —
// περίοδοι ενοικίου, λογαριασμοί και δαπάνες που ΔΕΝ έχουν σημανθεί πληρωμένες.
// Δεν προβλέπει, δεν ετησιοποιεί, δεν συμπληρώνει ενοίκια που δεν έχουν
// προγραμματιστεί. Ό,τι λέει, μπορεί ο χρήστης να το δείξει με τον δάχτυλο.
// ═══════════════════════════════════════════════════════════════════════════

import { MONTHS_NOM } from '../core/months';

/** Περίοδος ενοικίου από το `rent_payments`. Το `paid` είναι η πηγή αλήθειας. */
export interface RentPeriod {
  amount: number | null;
  due_date: string | null;
  paid: boolean | null;
  period_year: number | null;
  period_month: number | null;
}

/** Λογαριασμός ή δαπάνη — ό,τι φεύγει από την τσέπη του ιδιοκτήτη. */
export interface Payable {
  amount: number | null;
  /** Λογαριασμοί έχουν `due_date`· οι δαπάνες έχουν μόνο `date`. */
  due: string | null;
  paid: boolean | null;
  label: string;
}

export interface CashLine {
  label: string;
  amount: number;
  /** ISO ημερομηνία λήξης, ή null όταν δεν υπάρχει προθεσμία. */
  due: string | null;
  /** Αρνητικό = ληξιπρόθεσμο κατά τόσες ημέρες. */
  daysLeft: number | null;
}

export interface CashSide {
  total: number;
  count: number;
  /** Πόσο από το σύνολο έχει ήδη ξεπεράσει την προθεσμία του. */
  overdue: number;
  overdueCount: number;
  /** Η πιο πιεστική γραμμή: η αρχαιότερη ληξιπρόθεσμη, αλλιώς η επόμενη. */
  lines: CashLine[];
}

export interface CashPosition {
  owedToMe: CashSide;
  owedByMe: CashSide;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};


/** Ημέρες από σήμερα (ISO «YYYY-MM-DD»). Αρνητικό = πέρασε. */
export function daysFromToday(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

// Οι γραμμές μπαίνουν σε σειρά ΠΙΕΣΗΣ: πρώτα το πιο βαθιά ληξιπρόθεσμο, μετά η
// πιο κοντινή προθεσμία, τελευταία όσα δεν έχουν ημερομηνία. Σταθερή σειρά με
// τελικό κριτήριο το ποσό, ώστε δύο φορτώσεις να μη δίνουν άλλη διάταξη.
function sortByPressure(lines: CashLine[]): CashLine[] {
  return [...lines].sort((a, b) => {
    const ad = a.daysLeft, bd = b.daysLeft;
    if (ad == null && bd == null) return b.amount - a.amount;
    if (ad == null) return 1;
    if (bd == null) return -1;
    if (ad !== bd) return ad - bd;
    return b.amount - a.amount;
  });
}

function side(lines: CashLine[]): CashSide {
  const sorted = sortByPressure(lines);
  const overdueLines = sorted.filter(l => l.daysLeft != null && l.daysLeft < 0);
  return {
    total: sorted.reduce((s, l) => s + l.amount, 0),
    count: sorted.length,
    overdue: overdueLines.reduce((s, l) => s + l.amount, 0),
    overdueCount: overdueLines.length,
    lines: sorted,
  };
}

/**
 * Η ταμειακή θέση του ακινήτου σήμερα.
 *
 * @param today ISO «YYYY-MM-DD» σε ΕΛΛΗΝΙΚΗ ώρα (athensToday()). Με UTC, μια
 *   δόση που λήγει σήμερα εμφανίζεται ληξιπρόθεσμη για δύο ώρες κάθε νύχτα.
 */
export function cashPosition(input: {
  rent: RentPeriod[];
  bills: Payable[];
  expenses: Payable[];
  today: string;
}): CashPosition {
  const { today } = input;

  // ── ΜΟΥ ΧΡΩΣΤΑΝΕ ─────────────────────────────────────────────────────────
  // ΜΟΝΟ περίοδοι που έχουν ΗΔΗ λήξει. Το ενοίκιο του επόμενου μήνα δεν είναι
  // οφειλή — αν μετρούσε, ο μετρητής θα έδειχνε μόνιμα ένα ενοίκιο παραπάνω και
  // κανείς δεν θα τον πίστευε μετά την πρώτη φορά.
  const rentLines: CashLine[] = [];
  for (const r of input.rent) {
    if (r.paid) continue;
    const amount = num(r.amount);
    if (amount <= 0) continue;
    const daysLeft = daysFromToday(r.due_date, today);
    if (daysLeft == null || daysLeft >= 0) continue;
    const my = r.period_month;
    const label = my && my >= 1 && my <= 12
      ? `Ενοίκιο ${MONTHS_NOM[my - 1]}${r.period_year ? ` ${r.period_year}` : ''}`
      : 'Ενοίκιο';
    rentLines.push({ label, amount, due: r.due_date, daysLeft });
  }

  // ── ΧΡΩΣΤΑΩ ──────────────────────────────────────────────────────────────
  // Εδώ μετράει ΚΑΘΕ απλήρωτο, ληξιπρόθεσμο ή όχι: ο ιδιοκτήτης θέλει να ξέρει
  // τι τον περιμένει, όχι μόνο τι άργησε. Η διάκριση σώζεται στο `overdue`.
  const payLines: CashLine[] = [];
  for (const p of [...input.bills, ...input.expenses]) {
    if (p.paid !== false) continue;           // null/undefined = δεν το ξέρουμε, δεν το χρεώνουμε
    const amount = num(p.amount);
    if (amount <= 0) continue;
    payLines.push({ label: p.label, amount, due: p.due, daysLeft: daysFromToday(p.due, today) });
  }

  return { owedToMe: side(rentLines), owedByMe: side(payLines) };
}

/**
 * Μια φράση για το τι σημαίνει το ποσό — μπαίνει κάτω από τον αριθμό, στη θέση
 * όπου αλλού θα έμπαινε χρώμα. Λέει ΠΟΣΑ και ΑΠΟ ΠΟΤΕ, όχι «προσοχή».
 */
export function cashSideNote(s: CashSide, kind: 'in' | 'out'): string {
  if (s.count === 0) return kind === 'in' ? 'Τίποτα σε καθυστέρηση' : 'Τίποτα σε εκκρεμότητα';
  const first = s.lines[0];
  const d = first?.daysLeft;
  const items = `${s.count} ${s.count === 1 ? 'εκκρεμότητα' : 'εκκρεμότητες'}`;
  if (d != null && d < 0) {
    const late = Math.abs(d);
    return `${items} · η παλαιότερη ${late} ${late === 1 ? 'ημέρα' : 'ημέρες'} πίσω`;
  }
  if (d != null) {
    if (d === 0) return `${items} · η πρώτη λήγει σήμερα`;
    return `${items} · η πρώτη σε ${d} ${d === 1 ? 'ημέρα' : 'ημέρες'}`;
  }
  return items;
}
