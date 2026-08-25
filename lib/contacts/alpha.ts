// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΑΛΦΑΒΗΤΙΚΟ ΕΥΡΕΤΗΡΙΟ, ΣΕ ΔΥΟ ΑΛΦΑΒΗΤΑ.
// ─────────────────────────────────────────────────────────────────────────
// Ένας Έλληνας ιδιοκτήτης έχει «Παπαδόπουλος» δίπλα σε «Booking.com» και
// «AirCondition Service». Ένα ευρετήριο Α–Ω αγνοεί τα μισά· ένα A–Z αγνοεί τα
// άλλα μισά. Εδώ υπάρχουν και τα δύο, ως ΔΥΟ μπλοκ — ελληνικό πρώτα, λατινικό
// μετά — γιατί αυτό κάνει και το τηλέφωνο: κανείς δεν ψάχνει το «Booking» κάτω
// από το «Β».
//
// ΓΙΑΤΙ ΔΕΝ ΦΤΑΝΕΙ ΤΟ localeCompare
//
// Το `'Ά'.localeCompare('Α', 'el')` δίνει σωστή σειρά, αλλά ΔΕΝ λέει σε ποιο
// γράμμα ανήκει το όνομα. Το ευρετήριο χρειάζεται κάδο, όχι σύγκριση — και ο
// κάδος πρέπει να είναι ο ίδιος για «Άννα», «Ἄννα» και «ΑΝΝΑ». Γι' αυτό τα
// σημάδια αφαιρούνται με NFD πριν κριθεί το γράμμα.
//
// ΤΟ ΤΕΛΙΚΟ ΣΙΓΜΑ ΔΕΝ ΕΙΝΑΙ ΣΗΜΑΔΙ. Το «ς» δεν είναι «σ» με τόνο — είναι άλλος
// χαρακτήρας και το NFD δεν το αγγίζει. Χωρίς ρητό χειρισμό, ένα όνομα που
// αρχίζει από ς (σπάνιο, αλλά υπάρχει σε μεταγραφές) θα έπεφτε στο «#».
// ═══════════════════════════════════════════════════════════════════════════

/** Τα 24 γράμματα, στη σειρά που τα μαθαίνει κανείς. */
export const GREEK_LETTERS = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'.split('');
export const LATIN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/** Ο κάδος για ό,τι δεν αρχίζει από γράμμα: αριθμοί, σύμβολα, κενό όνομα. */
export const OTHER_BUCKET = '#';

export type AlphaScript = 'el' | 'en' | 'other';

/** Η σειρά των μπλοκ. Το ελληνικό πρώτο — είναι η γλώσσα του χρήστη. */
const SCRIPT_RANK: Record<AlphaScript, number> = { el: 0, en: 1, other: 2 };

/**
 * Αφαιρεί τόνους και διαλυτικά, κρατώντας το γράμμα. Το `ς` γίνεται `Σ` ρητά
 * (βλ. σχόλιο κεφαλίδας) και το τελικό `toUpperCase` γίνεται ΜΕΤΑ την αφαίρεση:
 * το `'ά'.toUpperCase()` δίνει `'Ά'` σε ορισμένες μηχανές και `'Α'` σε άλλες —
 * δεν στηριζόμαστε σε αυτό.
 */
function foldLetter(ch: string): string {
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (base === 'ς' ? 'σ' : base).toUpperCase();
}

/**
 * Το πρώτο ΓΡΑΜΜΑ ενός ονόματος — δηλαδή ο κάδος του στο ευρετήριο.
 *
 * ΤΟ ΨΗΦΙΟ ΕΙΝΑΙ ΜΕΡΟΣ ΤΟΥ ΟΝΟΜΑΤΟΣ· Η ΣΤΙΞΗ ΟΧΙ.
 * Η διάκριση δεν είναι λεπτολογία, κρίνει σε ποιο γράμμα θα ψάξει ο χρήστης:
 *   · «3G Telecom» ΛΕΓΕΤΑΙ έτσι· ανήκει στο «#», όχι στο «G». Κανείς δεν
 *     ψάχνει το 3G στο γάμμα.
 *   · «(πρώην) ΔΕΗ» και «"Ο Γιώργος"» ΔΕΝ λέγονται έτσι — η παρένθεση και τα
 *     εισαγωγικά είναι τυπογραφία. Ανήκουν στο Δ και στο Γ.
 * Άρα η στίξη προσπερνιέται, το ψηφίο σταματά την αναζήτηση.
 */
export function alphaBucket(name: string | null | undefined): string {
  const s = (name || '').trim();
  for (const ch of s) {
    const f = foldLetter(ch);
    if (GREEK_LETTERS.includes(f)) return f;
    if (LATIN_LETTERS.includes(f)) return f;
    if (/\d/.test(ch)) return OTHER_BUCKET;
    // Οτιδήποτε άλλο (στίξη, κενό, εισαγωγικά, σύμβολα) το προσπερνάμε.
  }
  return OTHER_BUCKET;
}

/** Σε ποιο αλφάβητο ανήκει ένας κάδος. */
export function bucketScript(bucket: string): AlphaScript {
  if (GREEK_LETTERS.includes(bucket)) return 'el';
  if (LATIN_LETTERS.includes(bucket)) return 'en';
  return 'other';
}

/**
 * Σύγκριση ονομάτων για αλφαβητική ταξινόμηση: πρώτα το μπλοκ (ελληνικά →
 * λατινικά → λοιπά), μετά η φυσική σειρά μέσα στο μπλοκ.
 *
 * Η σύγκριση γίνεται στο ΔΙΠΛΩΜΕΝΟ κείμενο ώστε «Άννα» και «Αννα» να κάθονται
 * μαζί· αν βγουν ίσα, κρίνει το αρχικό κείμενο, ώστε η σειρά να είναι σταθερή
 * και να μη «χοροπηδούν» δύο σχεδόν ίδια ονόματα σε κάθε ανανέωση.
 */
export function compareNames(a: string, b: string): number {
  const ra = SCRIPT_RANK[bucketScript(alphaBucket(a))];
  const rb = SCRIPT_RANK[bucketScript(alphaBucket(b))];
  if (ra !== rb) return ra - rb;
  const fa = foldName(a), fb = foldName(b);
  const c = fa.localeCompare(fb, 'el');
  return c !== 0 ? c : a.localeCompare(b, 'el');
}

/** Όλο το όνομα χωρίς τόνους, κεφαλαία — για σύγκριση και αναζήτηση. */
export function foldName(name: string | null | undefined): string {
  return [...((name || '').trim())].map(foldLetter).join('');
}

export interface AlphaEntry {
  /** Το γράμμα όπως εμφανίζεται στη ράγα. */
  letter: string;
  script: AlphaScript;
  /** Πόσες επαφές κάθονται σε αυτό το γράμμα. */
  count: number;
}

/**
 * Το ευρετήριο για μια συγκεκριμένη λίστα ονομάτων.
 *
 * ΕΠΙΣΤΡΕΦΕΙ ΜΟΝΟ ΤΑ ΓΡΑΜΜΑΤΑ ΠΟΥ ΥΠΑΡΧΟΥΝ. Μια ράγα με 24 + 26 + 1 γράμματα,
 * από τα οποία τα 47 είναι νεκρά, δεν είναι ευρετήριο — είναι διακόσμηση που
 * κοστίζει δύο γραμμές οθόνης. Όποιος έχει τρεις επαφές βλέπει τρία γράμματα.
 */
export function buildAlphaIndex(names: Array<string | null | undefined>): AlphaEntry[] {
  const counts = new Map<string, number>();
  for (const n of names) {
    const b = alphaBucket(n);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const order = [...GREEK_LETTERS, ...LATIN_LETTERS, OTHER_BUCKET];
  return order
    .filter(l => counts.has(l))
    .map(letter => ({ letter, script: bucketScript(letter), count: counts.get(letter)! }));
}

/**
 * Τα αρχικά για το πλακίδιο του avatar. Ζούσε γραμμένο στο χέρι σε τρία σημεία
 * του ίδιου αρχείου, με τρεις μικρές διαφορές — και το ένα από τα τρία έσκαγε
 * σε όνομα με διπλό κενό, γιατί το `split(' ')` δίνει κενή λέξη και το `w[0]`
 * γίνεται `undefined`.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(w => foldLetter(w[0])).join('');
}
