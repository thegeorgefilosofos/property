// ═══════════════════════════════════════════════════════════════════════════
// Η ΙΔΙΑ ΔΑΠΑΝΗ, ΔΥΟ ΦΟΡΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΠΩΣ ΣΥΜΒΑΙΝΕΙ, ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΦΑΙΝΕΤΑΙ. Ο ιδιοκτήτης φωτογραφίζει τον
// λογαριασμό της ΔΕΗ τη Δευτέρα. Την Πέμπτη, καθαρίζοντας τα χαρτιά του, τον
// καταχωρεί και με το χέρι. Ή σαρώνει δύο φορές την ίδια απόδειξη επειδή η
// πρώτη βγήκε θολή. Το καθολικό δείχνει δύο γραμμές και οι ΔΥΟ είναι σωστές
// από μόνες τους: ίδιος πάροχος, ίδιο ποσό, λογικές ημερομηνίες. Κανένα
// άθροισμα δεν φωνάζει. Απλώς ο μήνας βγαίνει 88,50 € ακριβότερος, ο
// Προϋπολογισμός δείχνει υπέρβαση που δεν έγινε και η φορολογική δήλωση
// κουβαλά δαπάνη που δεν υπάρχει.
//
// ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ Η ΑΚΡΙΒΗΣ ΤΑΥΤΙΣΗ. Υπήρχε ήδη έλεγχος «ίδιο ποσό ΚΑΙ ίδια
// ημερομηνία ΚΑΙ ίδια κατηγορία» και δεν τον καλούσε κανείς — σωστά, γιατί δεν
// θα έπιανε τίποτα: η σάρωση γράφει την ημερομηνία έκδοσης, το χέρι γράφει την
// ημέρα που πληρώθηκε και οι δύο διαφέρουν κατά τρεις ημέρες.
//
// Η ΓΡΑΜΜΗ ΠΟΥ ΔΕΝ ΠΕΡΝΙΕΤΑΙ: ΤΟ ΠΟΣΟ. Δύο δαπάνες με διαφορετικό ποσό ΔΕΝ
// είναι η ίδια, όσο κι αν μοιάζουν τα υπόλοιπα. Ο έλεγχος ξεκινά από εκεί και
// μετά ζυγίζει ημερομηνία, πάροχο, περιγραφή και κατηγορία.
//
// ΚΑΙ ΔΕΝ ΣΒΗΝΕΙ ΤΙΠΟΤΑ. Η οθόνη ΡΩΤΑ. Μια αυτόματη διαγραφή «διπλότυπου» που
// έπεσε έξω καταστρέφει πραγματική δαπάνη και ο χρήστης δεν θα το μάθει ποτέ.
// Δύο λογαριασμοί ρεύματος του ίδιου ποσού την ίδια εβδομάδα υπάρχουν: δύο
// ακίνητα, δύο παροχές, μια δόση και μια εξόφληση.
// ═══════════════════════════════════════════════════════════════════════════

import { fe } from '../core/format';

/** Ό,τι χρειάζεται ο έλεγχος. Ταιριάζει και με γραμμή δαπάνης και με σχέδιο. */
export interface ExpenseLike {
  id?: string;
  description?: string | null;
  amount: number;
  category?: string | null;
  date: string;
  /** Ο πάροχος όπως γράφτηκε: «ΔΕΗ», «netflix», «Interamerican». */
  store_vendor?: string | null;
  /** Ο λογαριασμός που εξοφλεί, όταν υπάρχει. */
  bill_id?: string | null;
}

/**
 * Πόσο σίγουροι είμαστε.
 *
 *   certain   Ίδιο ποσό, ίδια ημέρα, ίδιος πάροχος ή ίδια περιγραφή. Ή ο ΙΔΙΟΣ
 *             λογαριασμός: εκεί δεν χωρά συζήτηση.
 *   likely    Ίδιο ποσό, κοντινή ημερομηνία και ταυτίζεται πάροχος ή περιγραφή.
 *   possible  Ίδιο ποσό, κοντινή ημερομηνία, ίδια κατηγορία. Τίποτα άλλο.
 */
export type DuplicateStrength = 'certain' | 'likely' | 'possible';

export interface DuplicateHit {
  row: ExpenseLike;
  strength: DuplicateStrength;
  /** Τι ταίριαξε, γραμμένο για τον χρήστη και όχι για το log. */
  reasons: string[];
}

export interface DuplicateOptions {
  /** Πόσες ημέρες απόσταση θεωρούνται «η ίδια δαπάνη». */
  days?: number;
  /** Ανοχή στο ποσό, σε ευρώ. Δύο λεπτά καλύπτουν τις στρογγυλοποιήσεις. */
  cents?: number;
}

const DEFAULTS: Required<DuplicateOptions> = { days: 5, cents: 0.02 };

/** Χωρίς τόνους, πεζά, χωρίς διπλά κενά: «ΔΕΗ Α.Ε. » και «δεη α.ε.» είναι ένα. */
function bare(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Απόσταση ημερών, χωρίς ζώνες ώρας: οι ημερομηνίες είναι ημέρες, όχι στιγμές. */
function daysApart(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return y && m && d ? Date.UTC(y, m - 1, d) : NaN;
  };
  const x = p(a), y = p(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
  return Math.abs(x - y) / 86400000;
}

/**
 * Ταιριάζουν τα ονόματα; Ένα από τα δύο μέσα στο άλλο μετράει, γιατί η σάρωση
 * γράφει «ΔΕΗ Α.Ε.» και το χέρι «ΔΕΗ». Κάτω από τρεις χαρακτήρες δεν κρίνεται:
 * ένα «ΟΤΕ» μέσα σε ένα «ΠΡΟΤΕΙΝΟΜΕΝΟ» δεν είναι ταύτιση.
 */
function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = bare(a), y = bare(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * ΟΙ ΠΙΘΑΝΕΣ ΔΙΠΛΟΕΓΓΡΑΦΕΣ, ΤΑΞΙΝΟΜΗΜΕΝΕΣ ΑΠΟ ΤΗ ΣΙΓΟΥΡΟΤΕΡΗ.
 *
 * Ο υποψήφιος δεν συγκρίνεται με τον εαυτό του: όταν ελέγχεται υπάρχουσα γραμμή
 * (π.χ. σε διόρθωση), το `id` της την εξαιρεί. Χωρίς αυτό, κάθε δαπάνη θα ήταν
 * διπλότυπο του εαυτού της.
 */
export function findDuplicates(
  candidate: ExpenseLike,
  existing: readonly ExpenseLike[],
  opts: DuplicateOptions = {},
): DuplicateHit[] {
  const { days, cents } = { ...DEFAULTS, ...opts };
  const amount = Number(candidate.amount);
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const hits: DuplicateHit[] = [];

  for (const row of existing) {
    if (candidate.id && row.id === candidate.id) continue;

    // Ο ίδιος λογαριασμός εξοφλείται μία φορά. Αυτό δεν χρειάζεται ζύγισμα.
    if (candidate.bill_id && row.bill_id && candidate.bill_id === row.bill_id) {
      hits.push({ row, strength: 'certain', reasons: ['Ο ίδιος λογαριασμός έχει ήδη εξοφληθεί'] });
      continue;
    }

    // ΤΟ ΠΟΣΟ ΕΙΝΑΙ ΤΟ ΣΚΛΗΡΟ ΦΙΛΤΡΟ. Διαφορετικό ποσό, διαφορετική δαπάνη.
    if (Math.abs(Number(row.amount) - amount) > cents) continue;

    const apart = daysApart(candidate.date, row.date);
    if (apart > days) continue;

    const sameVendor = namesMatch(candidate.store_vendor, row.store_vendor);
    const sameDesc = namesMatch(candidate.description, row.description);
    const sameCat = !!candidate.category && candidate.category === row.category;
    if (!sameVendor && !sameDesc && !sameCat) continue;

    const reasons: string[] = [`ίδιο ποσό ${fe(amount)}`];
    reasons.push(apart === 0 ? 'ίδια ημερομηνία' : `${apart} ${apart === 1 ? 'ημέρα' : 'ημέρες'} διαφορά`);
    if (sameVendor) reasons.push('ίδιος πάροχος');
    else if (sameDesc) reasons.push('ίδια περιγραφή');
    else reasons.push('ίδια κατηγορία');

    const strength: DuplicateStrength =
      apart === 0 && (sameVendor || sameDesc) ? 'certain'
      : (sameVendor || sameDesc) ? 'likely'
      : 'possible';

    hits.push({ row, strength, reasons });
  }

  const rank: Record<DuplicateStrength, number> = { certain: 0, likely: 1, possible: 2 };
  return hits.sort((a, b) => rank[a.strength] - rank[b.strength]
    || daysApart(candidate.date, a.row.date) - daysApart(candidate.date, b.row.date));
}

/** «11/08/2026» από «2026-08-11». Η ημερομηνία σε πρόταση διαβάζεται από άνθρωπο. */
function greekDay(iso: string): string {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

/**
 * Η ΠΡΟΤΑΣΗ ΠΟΥ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ. Κενή όταν δεν υπάρχει τίποτα να πει.
 *
 * ΧΩΡΙΣ ΧΡΩΜΑ ΚΙΝΔΥΝΟΥ ΚΑΙ ΧΩΡΙΣ ΘΑΥΜΑΣΤΙΚΟ. Δεν είναι σφάλμα του χρήστη· είναι
 * πληροφορία που δεν είχε τη στιγμή που καταχωρούσε. Λέει ΤΙ βρέθηκε και ΓΙΑΤΙ
 * μοιάζει και αφήνει την απόφαση σε εκείνον — γιατί μόνο εκείνος ξέρει αν
 * πρόκειται για δύο παροχές ρεύματος ή για την ίδια δύο φορές.
 */
export function duplicateNotice(hits: readonly DuplicateHit[]): string {
  if (!hits.length) return '';
  const h = hits[0];
  const what = h.row.description ? `«${h.row.description}»` : 'δαπάνη';
  const head = h.strength === 'certain'
    ? `Υπάρχει ήδη ${what} στις ${greekDay(h.row.date)}`
    : `Μοιάζει με ${what} που καταχωρήθηκε στις ${greekDay(h.row.date)}`;
  const more = hits.length > 1
    ? ` Υπάρχουν ακόμη ${hits.length - 1} παρόμοιες.`
    : '';
  return `${head}: ${h.reasons.join(', ')}.${more} Αν είναι η ίδια δαπάνη, μην την καταχωρήσεις δεύτερη φορά.`;
}
