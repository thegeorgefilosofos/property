// ═══════════════════════════════════════════════════════════════════════════
// Ο ΑΜΑ — Ο ΕΛΕΓΧΟΣ ΠΟΥ ΤΟ APP ΔΕΝ ΕΚΑΝΕ ΠΟΤΕ
//
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Το 2025 στάλθηκαν **12.145 καταχωρήσεις για
// απενεργοποίηση** επειδή δεν είχαν ΑΜΑ ή είχαν άκυρο (πρωτόκολλο
// ΑΑΔΕ–πλατφορμών). Δεν είναι στατιστικό: είναι 12.145 άνθρωποι που έχασαν
// εισόδημα από ένα διοικητικό λάθος που ένα εργαλείο θα τους το είχε δείξει
// πριν συμβεί.
//
// ΤΙ ΕΚΑΝΕ ΤΟ APP. Ο ΑΜΑ ζούσε ως **ελεύθερο κείμενο** στο `bills_settings`
// (section 'occupancy'), μέσα σε κλειστό accordion **άλλης καρτέλας**, πίσω από
// **τρίτο ανεξάρτητο διακόπτη** «Βραχυχρόνια μίσθωση» — ενώ το `readStatus` ήδη
// ήξερε ότι το ακίνητο είναι `rent_short`. Κανένας έλεγχος μορφής, κανένα
// «φαίνεται στην αγγελία;», καμία ημερομηνία επιβεβαίωσης.
//
// ΟΙ ΔΥΟ ΚΑΝΟΝΕΣ ΠΟΥ ΕΠΙΒΑΛΛΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ
//
// 1. Η ΑΝΑΓΚΗ ΠΡΟΚΥΠΤΕΙ ΑΠΟ ΤΗΝ ΚΑΤΑΣΤΑΣΗ, ΟΧΙ ΑΠΟ ΔΙΑΚΟΠΤΗ. Η `amaState()`
//    ρωτά το `readStatus()` — την ίδια, μοναδική πηγή αλήθειας που κρίνει ποιες
//    καρτέλες βλέπει ο χρήστης. Δεν υπάρχει τρόπος να έχεις βραχυχρόνια χωρίς
//    να σου ζητηθεί ο ΑΜΑ, ούτε να σου ζητηθεί χωρίς να έχεις βραχυχρόνια.
//
// 2. Η ΕΓΓΡΑΦΗ ΣΤΟ ΜΗΤΡΩΟ ΔΕΝ ΑΡΚΕΙ. Ο ΑΜΑ πρέπει να **ΑΝΑΓΡΑΦΕΤΑΙ ΣΤΗΝ
//    ΑΓΓΕΛΙΑ**. Εκεί χάθηκαν οι 12.145. Γι' αυτό υπάρχει τρίτη κατάσταση —
//    «δηλώθηκε αλλά δεν επιβεβαιώθηκε» — και ημερομηνία επιβεβαίωσης, όχι απλό
//    checkbox: η επιβεβαίωση παλιώνει όταν αλλάζεις αγγελία.
//
// ΚΑΙ ΠΟΤΕ ΠΙΣΩ ΑΠΟ PAYWALL. «Ποτέ δεν χρεώνουμε για να δει κάποιος ότι έχει
// πρόβλημα» (docs/STRATEGY.md §3). Ο έλεγχος είναι καθαρή λογική χωρίς καμία
// εξάρτηση από πλάνο ή entitlement, ώστε καμία οθόνη να μη μπορεί να τον κρύψει.
// ═══════════════════════════════════════════════════════════════════════════
import { readStatus, type StatusRow } from './status';

export type AmaState =
  | 'not_required'  // δεν είναι βραχυχρόνια — καμία υποχρέωση, καμία ενόχληση
  | 'missing'       // βραχυχρόνια χωρίς ΑΜΑ (ή με άκυρη μορφή)
  | 'unconfirmed'   // δηλώθηκε, αλλά δεν επιβεβαιώθηκε ότι αναγράφεται στην αγγελία
  | 'ok';           // δηλώθηκε και επιβεβαιώθηκε — η γραμμή σβήνει

export interface AmaRow extends StatusRow {
  ama?: string | null;
  ama_listed_confirmed_at?: string | null;
}

/**
 * Μορφή ΑΜΑ: ΜΟΝΟ ψηφία. Αυτό είναι ο κανόνας που ξέρουμε και μπορούμε να
 * επιβάλουμε. Δεν επιβάλλουμε ακριβές μήκος επειδή δεν το έχουμε από επίσημη
 * πηγή — μια αυστηρή, λάθος υπόθεση θα απέρριπτε έγκυρους αριθμούς, που είναι
 * χειρότερο από το να μην ελέγξεις.
 */
export function isValidAmaFormat(ama?: string | null): boolean {
  const v = (ama || '').trim();
  return v.length > 0 && /^\d+$/.test(v);
}

/** Καθαρισμός εισόδου: κρατάμε μόνο ψηφία (ο χρήστης συχνά επικολλά κενά/παύλες). */
export const cleanAma = (v: string): string => (v || '').replace(/\D/g, '');

/**
 * Ασυνήθιστο μήκος. ΠΡΟΕΙΔΟΠΟΙΗΣΗ, όχι απόρριψη: οι ΑΜΑ που συναντάμε είναι
 * διψήφια-ψηφία νούμερα του μητρώου· κάτι με 3 ψηφία είναι σχεδόν σίγουρα
 * μισοπληκτρολογημένο και αξίζει μια ερώτηση, όχι ένα μπλόκο.
 */
export function amaLengthLooksUnusual(ama?: string | null): boolean {
  const v = (ama || '').trim();
  if (!isValidAmaFormat(v)) return false;
  return v.length < 8 || v.length > 14;
}

/** Η κατάσταση συμμόρφωσης ΑΜΑ ενός ακινήτου. Οδηγείται από το `readStatus`. */
export function amaState(row: AmaRow | null | undefined): AmaState {
  if (readStatus(row) !== 'rent_short') return 'not_required';
  if (!isValidAmaFormat(row?.ama)) return 'missing';
  return (row?.ama_listed_confirmed_at || '').trim() ? 'ok' : 'unconfirmed';
}

/** Χρειάζεται αυτό το ακίνητο ΑΜΑ; (ισοδύναμο με «είναι βραχυχρόνια») */
export const amaRequired = (row: AmaRow | null | undefined): boolean => amaState(row) !== 'not_required';

/** Έχει το ακίνητο πρόβλημα που ο χρήστης πρέπει να δει τώρα; */
export const amaNeedsAttention = (row: AmaRow | null | undefined): boolean => {
  const s = amaState(row);
  return s === 'missing' || s === 'unconfirmed';
};

export interface AmaSummary<T> {
  missing: T[];
  unconfirmed: T[];
  ok: T[];
  /** Ακίνητα βραχυχρόνιας συνολικά (missing + unconfirmed + ok). */
  shortTermCount: number;
  /** Η χειρότερη κατάσταση του χαρτοφυλακίου — ορίζει τον τόνο της γραμμής. */
  worst: AmaState;
}

/** Ομαδοποίηση χαρτοφυλακίου κατά κατάσταση ΑΜΑ (για τη μόνιμη γραμμή). */
export function amaSummary<T extends AmaRow>(rows: T[]): AmaSummary<T> {
  const missing: T[] = [], unconfirmed: T[] = [], ok: T[] = [];
  for (const r of rows) {
    const s = amaState(r);
    if (s === 'missing') missing.push(r);
    else if (s === 'unconfirmed') unconfirmed.push(r);
    else if (s === 'ok') ok.push(r);
  }
  const worst: AmaState = missing.length ? 'missing' : unconfirmed.length ? 'unconfirmed'
    : ok.length ? 'ok' : 'not_required';
  return { missing, unconfirmed, ok, shortTermCount: missing.length + unconfirmed.length + ok.length, worst };
}

/** Το κείμενο της γραμμής, ίδιο σε «Πελάτες» και «Τιμολόγηση». */
export const AMA_COPY: Record<Exclude<AmaState, 'not_required'>, { title: string; body: string; tone: 'negative' | 'warning' | 'positive' }> = {
  missing: {
    title: 'Λείπει ο ΑΜΑ',
    tone: 'negative',
    body: 'Το ακίνητο είναι σε βραχυχρόνια μίσθωση, άρα χρειάζεται Αριθμό Μητρώου Ακινήτου από το Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής (myAADE). Το 2025 στάλθηκαν 12.145 καταχωρήσεις για απενεργοποίηση επειδή ο ΑΜΑ έλειπε ή ήταν άκυρος.',
  },
  unconfirmed: {
    title: 'Ο ΑΜΑ δηλώθηκε· αναγράφεται στην αγγελία;',
    tone: 'warning',
    body: 'Η εγγραφή στο μητρώο δεν αρκεί: ο ΑΜΑ πρέπει να φαίνεται σε ΚΑΘΕ καταχώρηση (Airbnb, Booking). Άνοιξε την αγγελία σου, δες ότι είναι εκεί, και επιβεβαίωσέ το.',
  },
  ok: {
    title: 'ΑΜΑ δηλωμένος και επιβεβαιωμένος στην αγγελία',
    tone: 'positive',
    body: 'Επιβεβαίωσέ το ξανά αν αλλάξεις ή δημιουργήσεις καταχώρηση.',
  },
};
