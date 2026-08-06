// ═══════════════════════════════════════════════════════════════════════════
// ΕΚΑΤΟΝ ΔΕΚΑΕΝΝΕΑ ΦΟΡΕΣ Η ΙΔΙΑ ΓΡΑΜΜΗ
// ─────────────────────────────────────────────────────────────────────────
// Ένα δάνειο εικοσαετίας γράφει στο ημερολόγιο μία εγγραφή ανά δόση. Στην
// «Ατζέντα» αυτό γίνεται εκατόν δεκαεννέα διαδοχικές γραμμές που λένε ΤΟ ΙΔΙΟ
// ΠΡΑΓΜΑ: «Δόση δανείου · 751,00 €». Η κάθε μία σωστή, όλες μαζί άχρηστες.
// Ό,τι άλλο έχει το ημερολόγιο —μια λήξη συμβολαίου, ένας έλεγχος λέβητα, μια
// δήλωση— θάβεται κάτω από αυτές, και η οθόνη κυλά χωρίς τέλος.
//
// Δεν είναι πρόβλημα δεδομένων: οι δόσεις ΠΡΕΠΕΙ να υπάρχουν μία-μία, γιατί
// καθεμιά πληρώνεται, σημειώνεται και μετακινείται χωριστά. Είναι πρόβλημα
// παρουσίασης, και λύνεται εκεί: η σειρά εμφανίζεται ΜΙΑ φορά, με την επόμενη
// εμφάνισή της, τον ρυθμό της και το πόσες ακόμη ακολουθούν. Όποιος τις θέλει
// αναλυτικά τις ανοίγει.
//
// Ο κανόνας του τι είναι «σειρά» είναι συντηρητικός επίτηδες:
//   · Με ρητή πηγή (source), τρεις ή περισσότερες εγγραφές ΕΙΝΑΙ σειρά. Την
//     πηγή τη γράφει ο συγχρονισμός· δηλώνει ότι τις έφτιαξε το ίδιο χέρι.
//   · Χωρίς πηγή, χρειάζεται ΚΑΙ ίδιος τίτλος ΚΑΙ ίδιο ποσό ΚΑΙ αναγνωρίσιμος
//     ρυθμός. Δύο άσχετα ραντεβού με το ίδιο όνομα δεν είναι σειρά, και δεν
//     επιτρέπεται να εξαφανιστεί το ένα πίσω από το άλλο.
// ═══════════════════════════════════════════════════════════════════════════

export interface SeriesLike {
  id: string;
  title: string;
  /** «YYYY-MM-DD». */
  event_date: string;
  amount?: number | null;
  source?: string | null;
}

export interface SeriesGroup<E> {
  kind: 'series';
  key: string;
  /** Η εμφάνιση που βλέπει ο χρήστης: η πρώτη της σειράς στη σειρά που δόθηκε. */
  lead: E;
  /** Οι υπόλοιπες, κρυμμένες ώσπου να ζητηθούν. */
  rest: E[];
  /** Πλήθος ΟΛΩΝ, μαζί με την πρώτη. */
  count: number;
  /** «κάθε μήνα», «κάθε τρίμηνο», … ή null όταν ο ρυθμός δεν είναι κανονικός. */
  cadence: string | null;
  /** Η τελευταία ημερομηνία της σειράς. */
  lastDate: string;
  /** Άθροισμα ποσών, ή null αν καμία εγγραφή δεν έχει ποσό. */
  totalAmount: number | null;
}

export type SeriesRow<E> = { kind: 'single'; event: E } | SeriesGroup<E>;

/** Ο ελάχιστος αριθμός εγγραφών για να θεωρηθεί κάτι σειρά. Δύο δεν είναι μοτίβο. */
export const MIN_SERIES = 3;

interface Ymd { y: number; m: number; d: number }

function parse(iso: string | null | undefined): Ymd | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  if (!m || m > 12 || !d || d > 31) return null;
  return { y, m, d };
}

/** Απόσταση σε ημέρες, ημερολογιακά (χωρίς ώρες, χωρίς ζώνες). */
function daysApart(a: Ymd, b: Ymd): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Απόσταση σε ημερολογιακούς μήνες. */
function monthsApart(a: Ymd, b: Ymd): number {
  return (b.y * 12 + b.m) - (a.y * 12 + a.m);
}

const CADENCE_BY_MONTHS: Record<number, string> = {
  1: 'κάθε μήνα', 2: 'κάθε δίμηνο', 3: 'κάθε τρίμηνο',
  4: 'κάθε τετράμηνο', 6: 'κάθε εξάμηνο', 12: 'κάθε χρόνο',
};
const CADENCE_BY_DAYS: Record<number, string> = { 1: 'κάθε ημέρα', 7: 'κάθε εβδομάδα', 14: 'κάθε δεύτερη εβδομάδα' };

/**
 * Ο ρυθμός μιας σειράς ημερομηνιών, ή null όταν δεν είναι κανονικός.
 *
 * Η μηνιαία σύγκριση γίνεται σε ΜΗΝΕΣ και όχι σε ημέρες: από 31 Ιανουαρίου σε
 * 28 Φεβρουαρίου είναι 28 ημέρες, από 28 Φεβρουαρίου σε 31 Μαρτίου είναι 31.
 * Μετρημένο σε ημέρες, ένα απολύτως κανονικό μηνιαίο πρόγραμμα δεν φαίνεται ποτέ
 * κανονικό — και η σειρά δεν θα μαζευόταν ποτέ.
 */
export function detectCadence(dates: string[]): string | null {
  const parsed = dates.map(parse).filter((p): p is Ymd => p !== null);
  if (parsed.length < 2) return null;
  parsed.sort((a, b) => Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d));

  const monthGaps: number[] = [], dayGaps: number[] = [];
  for (let i = 1; i < parsed.length; i++) {
    monthGaps.push(monthsApart(parsed[i - 1], parsed[i]));
    dayGaps.push(daysApart(parsed[i - 1], parsed[i]));
  }

  const first = monthGaps[0];
  // Η ίδια ημέρα του μήνα, ή η τελευταία ημέρα όταν ο μήνας είναι κοντύτερος:
  // 31 Ιανουαρίου → 28 Φεβρουαρίου είναι κανονική μηνιαία δόση, όχι εξαίρεση.
  const sameDayOfMonth = parsed.every(p => p.d === parsed[0].d || p.d === lastDayOf(p.y, p.m));
  if (first > 0 && CADENCE_BY_MONTHS[first] && monthGaps.every(g => g === first) && sameDayOfMonth) {
    return CADENCE_BY_MONTHS[first];
  }

  const firstDay = dayGaps[0];
  if (firstDay > 0 && CADENCE_BY_DAYS[firstDay] && dayGaps.every(g => g === firstDay)) {
    return CADENCE_BY_DAYS[firstDay];
  }
  return null;
}

function lastDayOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Μαζεύει τις σειρές μιας λίστας γεγονότων, ΔΙΑΤΗΡΩΝΤΑΣ τη σειρά που δόθηκε:
 * κάθε ομάδα εμφανίζεται στη θέση της πρώτης της εγγραφής.
 *
 * Ό,τι δεν είναι σειρά περνά αυτούσιο. Καμία εγγραφή δεν χάνεται και καμία δεν
 * διπλογράφεται: το άθροισμα `count` όλων των γραμμών ισούται πάντα με το
 * πλήθος της εισόδου.
 */
export function groupSeries<E extends SeriesLike>(events: E[], minSize: number = MIN_SERIES): SeriesRow<E>[] {
  const byKey = new Map<string, E[]>();
  const keyOf = (e: E): string => {
    const src = (e.source || '').trim();
    if (src) return `source:${src}`;
    // Χωρίς πηγή, ο τίτλος ΚΑΙ το ποσό πρέπει να ταυτίζονται.
    return `title:${e.title}|${e.amount ?? ''}`;
  };

  for (const e of events) {
    const k = keyOf(e);
    const list = byKey.get(k);
    if (list) list.push(e); else byKey.set(k, [e]);
  }

  const collapsed = new Set<string>();
  const groups = new Map<string, SeriesGroup<E>>();
  for (const [k, list] of byKey) {
    if (list.length < minSize) continue;
    const cadence = detectCadence(list.map(e => e.event_date));
    // Χωρίς ρητή πηγή, ο ρυθμός είναι ΠΡΟΫΠΟΘΕΣΗ: αλλιώς δύο άσχετα γεγονότα με
    // ίδιο όνομα και ίδιο ποσό θα έκρυβαν το ένα το άλλο.
    if (!k.startsWith('source:') && !cadence) continue;
    const dates = list.map(e => e.event_date).filter(Boolean).sort();
    const amounts = list.map(e => e.amount).filter((a): a is number => typeof a === 'number' && Number.isFinite(a));
    collapsed.add(k);
    groups.set(k, {
      kind: 'series', key: k,
      lead: list[0], rest: list.slice(1), count: list.length,
      cadence,
      lastDate: dates[dates.length - 1] || list[0].event_date,
      totalAmount: amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100 : null,
    });
  }

  const out: SeriesRow<E>[] = [];
  const emitted = new Set<string>();
  for (const e of events) {
    const k = keyOf(e);
    if (!collapsed.has(k)) { out.push({ kind: 'single', event: e }); continue; }
    if (emitted.has(k)) continue;
    emitted.add(k);
    out.push(groups.get(k)!);
  }
  return out;
}

/** Πόσες εγγραφές εκπροσωπεί μια γραμμή. Χρήσιμο για μετρητές που πρέπει να κουμπώνουν. */
export function rowCount<E>(row: SeriesRow<E>): number {
  return row.kind === 'series' ? row.count : 1;
}
