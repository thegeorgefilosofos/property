// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΕΡΧΕΤΑΙ ΚΑΘΕ ΜΗΝΑ, ΚΑΙ ΤΙ ΔΕΝ ΗΡΘΕ ΑΚΟΜΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ, ΓΡΑΜΜΕΝΟ ΑΠΟ ΤΟΝ ΙΔΙΟ ΤΟΝ ΠΥΡΗΝΑ. Το `ledger.ts` το λέει ρητά:
//
//     «Το `recurring` είναι ΧΑΡΑΚΤΗΡΙΣΜΟΣ ("Πάγιο" απέναντι σε "Εφάπαξ"), όχι
//      πρόγραμμα — καμία αυτόματη ανανέωση δεν υπάρχει.»
//
// Δηλαδή ο ιδιοκτήτης δηλώνει ότι η ΔΕΗ είναι πάγιο, και μετά την ξαναγράφει
// μόνος του κάθε μήνα. Η εφαρμογή ΞΕΡΕΙ ότι έρχεται και δεν του το λέει.
//
// ΤΙ ΚΑΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ, ΚΑΙ ΤΙ ΔΕΝ ΚΑΝΕΙ ΕΠΙΤΗΔΕΣ
//
// ΔΕΝ γράφει τίποτα. Δεν δημιουργεί δαπάνες, δεν προ-συμπληρώνει ποσά στη βάση,
// δεν «ανανεώνει» λογαριασμούς. Μια εφαρμογή που φτιάχνει μόνη της εγγραφές με
// ποσά που μάντεψε, μολύνει τα ίδια τα νούμερα που ο χρήστης δίνει στον λογιστή
// του. Το φάντασμα των 78 € που δεν ήρθε ποτέ είναι χειρότερο από την απουσία.
//
// ΔΙΑΒΑΖΕΙ το ιστορικό και απαντά σε μία ερώτηση: «τι συνήθως έχει έρθει μέχρι
// σήμερα και λείπει;». Η απάντηση είναι υπενθύμιση, όχι εγγραφή.
//
// ΤΡΕΙΣ ΑΠΟΦΑΣΕΙΣ ΠΟΥ ΚΡΑΤΟΥΝ ΤΗΝ ΥΠΕΝΘΥΜΙΣΗ ΕΝΤΙΜΗ
//
//  1. ΔΙΑΜΕΣΟΣ, ΟΧΙ ΜΕΣΟΣ ΟΡΟΣ, για το τυπικό ποσό. Ένας λογαριασμός ρεύματος
//     με εκκαθάριση 300 € ανάμεσα σε έντεκα των 70 € ανεβάζει τον μέσο όρο στα
//     89 € — νούμερο που δεν εμφανίστηκε ποτέ. Ο διάμεσος μένει 70.
//
//  2. ΠΕΡΙΜΕΝΟΥΜΕ ΝΑ ΠΕΡΑΣΕΙ Η ΣΥΝΗΘΙΣΜΕΝΗ ΜΕΡΑ, ΚΑΙ ΛΙΓΟ ΑΚΟΜΗ. Την 1η του
//     μήνα δεν λείπει τίποτα· απλώς δεν ήρθε ακόμη. Ειδοποίηση που χτυπά πριν
//     την ώρα της εκπαιδεύει τον χρήστη να την αγνοεί.
//
//  3. ΤΟ ΔΙΜΗΝΟ ΔΕΝ ΕΙΝΑΙ ΜΗΝΙΑΙΟ. Η ΕΥΔΑΠ, και συχνά η ΔΕΗ, έρχονται κάθε δύο
//     μήνες. Μια σειρά με διμηνιαίο ρυθμό ΔΕΝ λείπει τον ενδιάμεσο μήνα — και
//     αν την ειδοποιούσαμε, ο χρήστης θα έβλεπε ψεύτικο κενό έξι φορές τον χρόνο.
// ═══════════════════════════════════════════════════════════════════════════

import type { LedgerEntry } from './ledger';
import { daysUntil } from '@/lib/core/time';

/**
 * Πόσοι διαφορετικοί μήνες χρειάζονται για να πούμε ότι κάτι «επαναλαμβάνεται».
 *
 * ΔΥΟ ΓΙΑ ΤΟΥΣ ΑΡΓΟΥΣ ΚΥΚΛΟΥΣ, ΚΑΙ ΕΙΝΑΙ ΑΠΑΙΤΗΣΗ ΤΗΣ ΠΡΑΓΜΑΤΙΚΟΤΗΤΑΣ. Το
 * ασφάλιστρο έρχεται μία φορά τον χρόνο: με όριο τρία, η εφαρμογή θα σιωπούσε
 * για ΤΡΙΑ ΧΡΟΝΙΑ πριν πει την πρώτη κουβέντα. Δύο πληρωμές δώδεκα μήνες
 * απόσταση, ίδια κατηγορία και ίδιος πάροχος, είναι συμβόλαιο, όχι σύμπτωση.
 * Στα μηνιαία η ίδια χαλάρωση θα έβγαζε συμπέρασμα από δύο τυχαία έξοδα.
 */
const MIN_OCCURRENCES = 3;
const MIN_OCCURRENCES_SLOW = 2;

/**
 * Πόσο πίσω κοιτάμε.
 *
 * ΤΡΙΑ ΧΡΟΝΙΑ ΚΑΙ ΚΑΤΙ, ΓΙΑ ΝΑ ΧΩΡΕΣΕΙ Ο ΕΤΗΣΙΟΣ ΚΥΚΛΟΣ. Με δεκατέσσερις
 * μήνες, δύο ετήσια ασφάλιστρα δεν χωρούσαν ποτέ στο ίδιο παράθυρο: ο κύκλος
 * ήταν αόρατος εξ ορισμού. Το τυπικό ποσό ΔΕΝ υπολογίζεται σε όλο αυτό το
 * διάστημα — μόνο στις τελευταίες εμφανίσεις, αλλιώς η τιμή του 2023 θα
 * βάραινε τη σημερινή πρόβλεψη.
 */
const LOOKBACK_MONTHS = 38;

/** Χάρη μετά τη συνηθισμένη μέρα, πριν πούμε ότι λείπει. */
const GRACE_DAYS = 4;

/** Πάνω από αυτό το διάστημα χωρίς εμφάνιση, η σειρά θεωρείται σταματημένη. */
const STALE_MONTHS = 4;

/** Πόσες τελευταίες εμφανίσεις ορίζουν το τυπικό ποσό και τη τυπική μέρα. */
const RECENT_WINDOW = 6;

/**
 * Οι κύκλοι που υπάρχουν στην πράξη: μήνας, δίμηνο, τρίμηνο, εξάμηνο, χρόνος.
 *
 * ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ: ο κώδικας απέρριπτε ό,τι ξεπερνούσε το δίμηνο ως
 * «εποχικό». Δηλαδή το ασφάλιστρο κατοικίας — τριμηνιαίο, εξαμηνιαίο ή ετήσιο
 * ανάλογα το συμβόλαιο — ΔΕΝ έλειπε ποτέ, όσο κι αν αργούσε.
 */
const CADENCES = [1, 2, 3, 6, 12] as const;

/**
 * Ο κύκλος που ταιριάζει σε αυτή τη μέση απόσταση, ή `null`.
 *
 * ΟΙ ΜΙΚΡΟΙ ΚΥΚΛΟΙ ΘΕΛΟΥΝ ΑΚΡΙΒΕΙΑ, ΟΙ ΜΕΓΑΛΟΙ ΑΝΟΧΗ. Ενα μηνιαίο που «περίπου»
 * είναι διμηνιαίο δεν υπάρχει. Ενα ετήσιο ασφάλιστρο όμως πληρώνεται τον
 * Ιανουάριο τη μια χρονιά και τον Φεβρουάριο την άλλη, και παραμένει ετήσιο.
 * Ο,τι δεν ταιριάζει σε κανέναν κύκλο ΔΕΝ στρογγυλοποιείται σε κάποιον: μένει
 * ακανόνιστο και δεν παράγει υπενθύμιση.
 */
export function snapCadence(medianGap: number): number | null {
  for (const c of CADENCES) {
    const slack = c >= 6 ? 1 : 0;
    if (Math.abs(medianGap - c) <= slack) return c;
  }
  return null;
}

/** Πώς λέγεται ο κύκλος σε πρόταση. */
export function cadenceLabel(everyMonths: number): string {
  return everyMonths === 1 ? 'κάθε μήνα'
    : everyMonths === 2 ? 'κάθε δίμηνο'
    : everyMonths === 3 ? 'κάθε τρίμηνο'
    : everyMonths === 6 ? 'κάθε εξάμηνο'
    : everyMonths === 12 ? 'κάθε χρόνο'
    : `κάθε ${everyMonths} μήνες`;
}

export interface ExpectedSeries {
  /** Σταθερό κλειδί της σειράς: κατηγορία και πάροχος μαζί. */
  key: string;
  /** Πώς λέγεται στην οθόνη. Το όνομα της τελευταίας εμφάνισης. */
  title: string;
  category: string;
  vendor: string | null;
  /** Κάθε πόσους μήνες εμφανίζεται: 1 μηνιαίο, 2 διμηνιαίο. */
  everyMonths: number;
  /** Το τυπικό ποσό, διάμεσος. */
  typicalAmount: number;
  /** Η τυπική μέρα του μήνα, διάμεσος. */
  typicalDay: number;
  /** Ο τελευταίος μήνας που εμφανίστηκε, «2026-07». */
  lastMonth: string;
  /** Πόσες φορές μετρήθηκε. Ο χρήστης δικαιούται να ξέρει πόσο στηρίζεται. */
  occurrences: number;
}

export interface MissingExpense extends ExpectedSeries {
  /** Πότε θα την περίμενε κανείς, με βάση τον κύκλο και την τυπική μέρα. */
  expectedDate: string;
  /** Πόσες μέρες έχει περάσει εκείνη η μέρα. */
  daysOverdue: number;
}

const median = (nums: number[]): number => {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const monthOf = (iso: string): string => iso.slice(0, 7);

/**
 * Πότε περιμένουμε την επόμενη, από τον τελευταίο μήνα και τον κύκλο.
 *
 * Η ΜΕΡΑ ΕΙΝΑΙ ΗΔΗ ΚΟΜΜΕΝΗ ΣΤΙΣ 28. Καμία τυπική μέρα δεν πέφτει σε 29, 30 ή
 * 31, ώστε ο Φεβρουάριος να μη γεννά ανύπαρκτη ημερομηνία.
 */
const nextDate = (lastMonth: string, everyMonths: number, day: number): string => {
  const total = monthIndex(lastMonth) + everyMonths - 1;
  const year = Math.floor(total / 12);
  const month = total % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const monthIndex = (m: string): number => +m.slice(0, 4) * 12 + +m.slice(5, 7);
const dayOf = (iso: string): number => +iso.slice(8, 10);

/**
 * Το κλειδί της σειράς.
 *
 * Ο ΠΑΡΟΧΟΣ ΜΠΑΙΝΕΙ ΜΕΣΑ, ΚΑΙ ΕΙΝΑΙ ΤΟ ΚΡΙΣΙΜΟ. Δύο λογαριασμοί ρεύματος —
 * ένας για το διαμέρισμα και ένας για το γκαράζ — έχουν την ίδια κατηγορία και
 * είναι ΔΥΟ σειρές. Με κλειδί μόνο την κατηγορία θα γίνονταν μία, με διπλάσιο
 * τυπικό ποσό, και η απουσία του ενός δεν θα φαινόταν ποτέ.
 */
const seriesKey = (e: LedgerEntry): string =>
  `${e.category}|${(e.vendor || '').trim().toLowerCase()}`;

/**
 * Οι σειρές που επαναλαμβάνονται, από το ιστορικό.
 *
 * ΔΕΝ ΣΤΗΡΙΖΕΤΑΙ ΣΤΗ ΣΗΜΑΙΑ `recurring`. Η σημαία μπαίνει με το χέρι και οι
 * περισσότεροι δεν τη βάζουν ποτέ: η ΔΕΗ που γράφεται δώδεκα μήνες στη σειρά
 * είναι πάγιο, το δήλωσε κανείς ή όχι. Η συμπεριφορά είναι πιο αξιόπιστη
 * μαρτυρία από τη δήλωση.
 */
export function expectedSeries(entries: readonly LedgerEntry[], today: Date): ExpectedSeries[] {
  const nowMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const from = monthIndex(nowMonth) - LOOKBACK_MONTHS;

  const groups = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    if (!e.date || e.amount <= 0) continue;
    const m = monthOf(e.date);
    if (monthIndex(m) < from || monthIndex(m) > monthIndex(nowMonth)) continue;
    const k = seriesKey(e);
    const list = groups.get(k);
    if (list) list.push(e); else groups.set(k, [e]);
  }

  const out: ExpectedSeries[] = [];
  for (const [key, list] of groups) {
    // Μία εμφάνιση ανά μήνα: δύο λογαριασμοί ρεύματος τον ίδιο μήνα (π.χ.
    // διόρθωση) δεν κάνουν τη σειρά «δεκαπενθήμερη».
    const byMonth = new Map<string, LedgerEntry[]>();
    for (const e of list) {
      const m = monthOf(e.date);
      const l = byMonth.get(m);
      if (l) l.push(e); else byMonth.set(m, [e]);
    }
    const months = [...byMonth.keys()].sort();
    // Χωρίς δύο εμφανίσεις δεν υπάρχει ούτε μία απόσταση, άρα ούτε κύκλος.
    if (months.length < MIN_OCCURRENCES_SLOW) continue;

    // Ο ΡΥΘΜΟΣ ΑΠΟ ΤΑ ΚΕΝΑ, ΟΧΙ ΑΠΟ ΤΟ ΠΛΗΘΟΣ. Τέσσερις εμφανίσεις σε οκτώ
    // μήνες μπορεί να είναι διμηνιαίες ή τέσσερις συνεχόμενες και μετά παύση.
    // Ο διάμεσος των αποστάσεων ξεχωρίζει τα δύο.
    const gaps: number[] = [];
    for (let i = 1; i < months.length; i++) gaps.push(monthIndex(months[i]) - monthIndex(months[i - 1]));
    const everyMonths = snapCadence(median(gaps));
    // Ακανόνιστη σειρά δεν είναι πάγιο, και δεν στρογγυλοποιείται σε πάγιο.
    if (everyMonths === null) continue;
    if (months.length < (everyMonths <= 2 ? MIN_OCCURRENCES : MIN_OCCURRENCES_SLOW)) continue;

    const lastMonth = months[months.length - 1];
    // ΣΕΙΡΑ ΠΟΥ ΣΤΑΜΑΤΗΣΕ ΔΕΝ ΛΕΙΠΕΙ, ΚΑΙ Η ΣΙΩΠΗ ΜΕΤΡΙΕΤΑΙ ΣΕ ΚΥΚΛΟΥΣ. Τέσσερις
    // μήνες σιωπής σκοτώνουν μια μηνιαία σειρά· στο ετήσιο ασφάλιστρο είναι το
    // φυσιολογικό διάστημα ανάμεσα σε δύο πληρωμές.
    // ΕΝΑΣ ΚΥΚΛΟΣ ΚΑΙ ΜΙΣΟΣ, ΟΧΙ ΔΥΟ. Με διπλάσιο κύκλο, ένα ετήσιο ασφάλιστρο
    // που σταμάτησε πριν από είκοσι μήνες θα εμφανιζόταν «να λείπει» για άλλους
    // οκτώ — δηλαδή η υπενθύμιση θα επέμενε για κάτι που τελείωσε. Στα μηνιαία
    // το όριο μένει τέσσερις μήνες, όπως ήταν.
    const staleAfter = Math.max(STALE_MONTHS, Math.round(everyMonths * 1.5));
    if (monthIndex(nowMonth) - monthIndex(lastMonth) > staleAfter) continue;

    // ΤΟ ΤΥΠΙΚΟ ΠΟΣΟ ΒΓΑΙΝΕΙ ΑΠΟ ΤΙΣ ΤΕΛΕΥΤΑΙΕΣ ΕΜΦΑΝΙΣΕΙΣ. Με παράθυρο τριών
    // ετών, ο διάμεσος όλων θα κουβαλούσε τιμές που δεν ισχύουν πια.
    const recent = months.slice(-RECENT_WINDOW);
    const amounts = recent.map(m => byMonth.get(m)!.reduce((s, e) => s + e.amount, 0));
    const days = recent.flatMap(m => byMonth.get(m)!.map(e => dayOf(e.date))).filter(d => d >= 1 && d <= 31);
    const last = byMonth.get(lastMonth)![0];

    out.push({
      key, title: last.title, category: last.category, vendor: last.vendor,
      everyMonths,
      typicalAmount: Math.round(median(amounts) * 100) / 100,
      typicalDay: Math.min(28, Math.max(1, Math.round(median(days)))),
      lastMonth, occurrences: months.length,
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

/**
 * Ποιες από τις σειρές συνήθως θα είχαν έρθει μέχρι σήμερα και λείπουν.
 *
 * Επιστρέφει ΚΕΝΟ όσο δεν έχει περάσει η συνηθισμένη μέρα συν τη χάρη: το να
 * λέει «λείπει η ΔΕΗ» στις 2 του μήνα, όταν έρχεται στις 12, είναι θόρυβος που
 * μαθαίνει τον χρήστη να μη διαβάζει την ειδοποίηση.
 */
export function missingThisMonth(
  entries: readonly LedgerEntry[], today: Date,
): MissingExpense[] {
  const out: MissingExpense[] = [];
  for (const s of expectedSeries(entries, today)) {
    const due = nextDate(s.lastMonth, s.everyMonths, s.typicalDay);
    const daysOverdue = -(daysUntil(due, today) ?? 0);
    if (daysOverdue < GRACE_DAYS) continue;
    out.push({ ...s, expectedDate: due, daysOverdue });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
