// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΑΛΛΑΞΕ ΑΠΟ ΤΟΝ ΠΡΟΗΓΟΥΜΕΝΟ ΜΗΝΑ, ΚΑΙ ΠΟΥ ΠΗΓΕ.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ
// Ο ιδιοκτήτης δεν θέλει έναν πίνακα με δώδεκα νούμερα. Θέλει μία πρόταση:
// «τον Ιούλιο ξόδεψες 25 € περισσότερα από τον Ιούνιο και τα 20 ήταν ρεύμα».
// Αυτή η πρόταση είναι όλη η αξία της παρακολούθησης δαπανών. Χωρίς αυτήν,
// έχεις αρχείο· με αυτήν, έχεις εργαλείο.
//
// ΤΡΕΙΣ ΤΡΟΠΟΙ ΝΑ ΠΕΙΣ ΨΕΜΑΤΑ ΜΕ ΜΙΑ ΣΥΓΚΡΙΣΗ, ΚΑΙ ΠΩΣ ΑΠΟΦΕΥΓΟΝΤΑΙ ΕΔΩ
//
// 1. ΜΙΣΟΣ ΜΗΝΑΣ ΕΝΑΝΤΙΑ ΣΕ ΟΛΟΚΛΗΡΟ. Στις 12 του μήνα, ο τρέχων μήνας έχει
//    δώδεκα μέρες δαπανών και ο προηγούμενος τριάντα. Το «ξοδεύεις λιγότερα»
//    είναι μαθηματικά σωστό και εντελώς ψεύτικο. Ο τρέχων μήνας σημειώνεται
//    ρητά ως ημιτελής και η σύγκριση το λέει.
//
// 2. ΤΟ ΕΤΗΣΙΟ ΠΟΥ ΕΤΥΧΕ. Η ασφάλεια των 340 € πληρώνεται μία φορά τον χρόνο.
//    Τον μήνα που πέφτει, οι δαπάνες «εκτοξεύονται». Δεν είναι υπέρβαση, είναι
//    ο ετήσιος λογαριασμός και λέγεται έτσι.
//
// 3. ΤΟ ΠΟΣΟΣΤΟ ΠΑΝΩ ΣΤΟ ΜΗΔΕΝ. Αν τον προηγούμενο μήνα δεν υπήρχε δαπάνη,
//    κάθε ποσό είναι «άπειρο τοις εκατό». Το ποσοστό γίνεται `null` και η
//    πρόταση λέει το ποσό, όχι το ποσοστό.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ
// Δεν κρίνει. Δεν λέει «ξόδεψες πολλά». Λέει πόσο και πού και αφήνει τον
// ιδιοκτήτη να αποφασίσει αν είναι πολλά — εκείνος ξέρει αν άλλαξε ο θερμοσίφωνας.
// ═══════════════════════════════════════════════════════════════════════════

import { categoryLabel, resolveCategory } from './taxonomy';
import { fe } from '../core/format';
import { monthAcc, monthNom } from '../core/months';

/** Το ελάχιστο που χρειάζεται η σύγκριση από μια κίνηση. */
export interface Spend {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  category: string;
  title?: string;
  /** Πάγιο που επαναλαμβάνεται. Χρησιμοποιείται για να ξεχωρίσει το έκτακτο. */
  recurring?: boolean;
}

export type Basis = 'previous_month' | 'same_month_last_year';

export interface Driver {
  slug: string;
  label: string;
  /** Θετικό σημαίνει αύξηση. */
  diff: number;
  current: number;
  base: number;
  /** Καινούρια κατηγορία που δεν υπήρχε στη βάση σύγκρισης. */
  isNew: boolean;
  /** Υπήρχε στη βάση και εξαφανίστηκε. */
  vanished: boolean;
}

export interface Comparison {
  basis: Basis;
  /** YYYY-MM */
  currentKey: string;
  baseKey: string;
  current: number;
  base: number;
  /** Θετικό σημαίνει «ξόδεψες περισσότερα». */
  diff: number;
  /** `null` όταν η βάση είναι μηδέν ή λείπει: το ποσοστό δεν ορίζεται. */
  pct: number | null;
  /** Οι κατηγορίες που εξηγούν τη διαφορά, από τη μεγαλύτερη. */
  drivers: Driver[];
  /** Ό,τι πρέπει να ξέρει ο αναγνώστης για να μην παρερμηνεύσει. */
  caveats: string[];
  /** Η σύγκριση σε μία φράση, στα ελληνικά. Ποτέ κενή. */
  sentence: string;
  /**
   * Η ΙΔΙΑ φράση ΧΩΡΙΣ την απαρίθμηση των κατηγοριών.
   *
   * Η κάρτα δείχνει τις κατηγορίες από κάτω, με ράβδους και ποσά: γράφοντάς τες
   * και μέσα στην πρόταση, ο ίδιος αριθμός εμφανιζόταν δύο φορές σε δύο γραμμές
   * απόσταση, τη μία στρογγυλεμένος και την άλλη με λεπτά. Η ειδοποίηση όμως
   * ΔΕΝ έχει ράβδους, γι' αυτό κρατά την πλήρη `sentence`.
   */
  headline: string;
  /** Υπάρχουν αρκετά δεδομένα για να ειπωθεί κάτι; */
  meaningful: boolean;
}

// ── ΒΟΗΘΗΤΙΚΑ ΗΜΕΡΟΛΟΓΙΟΥ ──────────────────────────────────────────────────

const p2 = (n: number): string => String(n).padStart(2, '0');
export const monthKey = (d: Date): string => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;

/** Ο προηγούμενος μήνας ενός κλειδιού. Το πέρασμα χρονιάς είναι ο συνηθέστερος
 *  τόπος σφάλματος: «2026-01» μείον έναν μήνα είναι «2025-12», όχι «2026-00». */
export function prevMonth(key: string): string {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${p2(m - 1)}`;
}

export const sameMonthLastYear = (key: string): string =>
  `${Number(key.slice(0, 4)) - 1}-${key.slice(5, 7)}`;


/** «τον Ιούλιο» ή «τον Ιούλιο 2025», όταν η χρονιά διαφέρει από την τρέχουσα. */
export function monthPhrase(key: string, refYear?: number): string {
  const y = Number(key.slice(0, 4)), i = Number(key.slice(5, 7)) - 1;
  const name = monthAcc(i) || key;
  return refYear !== undefined && y !== refYear ? `${name} ${y}` : name;
}

/**
 * «Ο Ιούλιος», ονομαστική — όταν ο μήνας είναι ΥΠΟΚΕΙΜΕΝΟ και όχι αντικείμενο.
 * Χωρίς αυτό, η πρόταση για τον μισοτελειωμένο μήνα έβγαινε «Ο Ιούλιο δεν έχει
 * τελειώσει»: η αιτιατική του `monthPhrase` σε θέση υποκειμένου.
 */
function monthSubject(key: string): string {
  return monthNom(Number(key.slice(5, 7)) - 1) || key;
}

/** Πόσες μέρες έχει ο μήνας. */
const daysInMonth = (key: string): number =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();

// ── ΣΥΝΟΛΑ ΑΝΑ ΜΗΝΑ ────────────────────────────────────────────────────────

interface Bucket { total: number; byCat: Map<string, number>; oneOffs: Spend[] }

function bucketOf(spends: readonly Spend[], key: string): Bucket {
  const b: Bucket = { total: 0, byCat: new Map(), oneOffs: [] };
  for (const s of spends) {
    if (s.date.slice(0, 7) !== key) continue;
    const amount = Math.abs(Number(s.amount));
    if (!Number.isFinite(amount) || amount === 0) continue;
    b.total += amount;
    const slug = resolveCategory(s.category) ?? 'other';
    b.byCat.set(slug, (b.byCat.get(slug) ?? 0) + amount);
    if (!s.recurring) b.oneOffs.push(s);
  }
  return b;
}

// ── Η ΣΥΓΚΡΙΣΗ ─────────────────────────────────────────────────────────────

/** Πόσο μεγάλη πρέπει να είναι μια διαφορά για να αξίζει αναφορά. Κάτω από
 *  αυτό είναι θόρυβος: κανείς δεν αλλάζει συμπεριφορά για τρία ευρώ. */
const NOISE = 5;

/** Πόσες κατηγορίες αναφέρονται. Πάνω από τρεις, η πρόταση παύει να διαβάζεται. */
const MAX_DRIVERS = 3;

export interface CompareOptions {
  /** Το «σήμερα», για να ξέρουμε αν ο τρέχων μήνας είναι ημιτελής. */
  today: Date;
  basis?: Basis;
}

/**
 * Σύγκριση ενός μήνα με τη βάση του.
 *
 * Η `today` περνιέται ως όρισμα και δεν διαβάζεται από το ρολόι: αλλιώς η
 * ίδια σύγκριση θα έλεγε άλλα πράγματα ανάλογα με το πότε τρέχει το τεστ.
 */
export function compareMonth(
  spends: readonly Spend[], currentKey: string, opts: CompareOptions,
): Comparison {
  const basis: Basis = opts.basis ?? 'previous_month';
  const baseKey = basis === 'previous_month' ? prevMonth(currentKey) : sameMonthLastYear(currentKey);

  const cur = bucketOf(spends, currentKey);
  const bas = bucketOf(spends, baseKey);
  const diff = cur.total - bas.total;
  const caveats: string[] = [];

  // ── ΗΜΙΤΕΛΗΣ ΜΗΝΑΣ ───────────────────────────────────────────────────────
  // Στις 12 του μήνα, ο τρέχων έχει δώδεκα μέρες και ο προηγούμενος τριάντα.
  // Το «ξοδεύεις λιγότερα» είναι μαθηματικά σωστό και εντελώς ψεύτικο.
  const nowKey = monthKey(opts.today);
  const partial = currentKey === nowKey && opts.today.getDate() < daysInMonth(currentKey);
  if (partial) {
    caveats.push(`Ο ${monthSubject(currentKey)} δεν έχει τελειώσει: μετράνε ${opts.today.getDate()} από ${daysInMonth(currentKey)} ημέρες.`);
  }

  // ── ΛΕΙΠΕΙ Η ΒΑΣΗ ────────────────────────────────────────────────────────
  if (bas.total === 0) {
    const yearRef = Number(currentKey.slice(0, 4));
    const none = cur.total === 0
      ? 'Δεν υπάρχουν καταχωρημένες δαπάνες για σύγκριση.'
      : `Δεν υπάρχουν δαπάνες τον ${monthPhrase(baseKey, yearRef)} για να γίνει σύγκριση.`;
    return {
      basis, currentKey, baseKey, current: cur.total, base: 0, diff: cur.total, pct: null,
      drivers: [], caveats,
      meaningful: false,
      sentence: none,
      headline: none,
    };
  }

  // ── ΟΙ ΚΑΤΗΓΟΡΙΕΣ ΠΟΥ ΕΞΗΓΟΥΝ ΤΗ ΔΙΑΦΟΡΑ ────────────────────────────────
  const slugs = new Set([...cur.byCat.keys(), ...bas.byCat.keys()]);
  const drivers: Driver[] = [...slugs]
    .map(slug => {
      const c = cur.byCat.get(slug) ?? 0;
      const b = bas.byCat.get(slug) ?? 0;
      return {
        slug, label: categoryLabel(slug) || 'Άλλο',
        diff: c - b, current: c, base: b,
        isNew: b === 0 && c > 0,
        vanished: c === 0 && b > 0,
      };
    })
    .filter(d => Math.abs(d.diff) >= NOISE)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // ── ΤΟ ΕΤΗΣΙΟ ΠΟΥ ΕΤΥΧΕ ──────────────────────────────────────────────────
  // Η ασφάλεια των 340 € πληρώνεται μία φορά τον χρόνο. Τον μήνα που πέφτει,
  // οι δαπάνες εκτοξεύονται. Δεν είναι υπέρβαση, είναι ο ετήσιος λογαριασμός.
  const bigOneOff = cur.oneOffs
    .filter(s => Math.abs(Number(s.amount)) >= Math.max(NOISE * 10, cur.total * 0.3))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  if (bigOneOff && diff > 0) {
    const label = bigOneOff.title?.trim() || categoryLabel(bigOneOff.category) || 'μια δαπάνη';
    caveats.push(`Η αύξηση οφείλεται σε μεγάλο βαθμό σε έκτακτη δαπάνη: ${label}.`);
  }

  const pct = bas.total > 0 ? (diff / bas.total) * 100 : null;
  const yearRef = Number(currentKey.slice(0, 4));

  return {
    basis, currentKey, baseKey, current: cur.total, base: bas.total, diff, pct,
    drivers: drivers.slice(0, MAX_DRIVERS),
    caveats,
    meaningful: true,
    sentence: buildSentence(diff, drivers, baseKey, yearRef, basis, partial),
    headline: buildSentence(diff, [], baseKey, yearRef, basis, partial),
  };
}

/**
 * ΤΟ ΠΟΣΟ ΤΗΣ ΦΡΑΣΗΣ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΟΣΟ ΜΕ ΤΟΥ ΤΙΤΛΟΥ.
 *
 * Εδώ ζούσε δικός του μορφοποιητής που στρογγύλευε στο ακέραιο ευρώ: η κάρτα
 * έγραφε «−751,00 €» με νούμερα ύψους 28 και δύο γραμμές πιο κάτω «751 €
 * λιγότερα». Δύο μορφές του ίδιου ποσού στο ίδιο πλαίσιο — και ο αναγνώστης δεν
 * ξέρει ποια από τις δύο να πιστέψει.
 */
const eur = (n: number): string => fe(Math.abs(n));

/**
 * Η σύγκριση σε μία φράση.
 *
 * ΔΕΝ ΚΡΙΝΕΙ. Δεν λέει «ξόδεψες πολλά» ούτε «προσοχή». Λέει πόσο και πού και
 * αφήνει τον ιδιοκτήτη να αποφασίσει — εκείνος ξέρει αν άλλαξε ο θερμοσίφωνας.
 *
 * Η φράση αναφέρει το πολύ ΔΥΟ κατηγορίες. Με τρεις παύει να είναι πρόταση και
 * γίνεται λίστα και η λίστα δεν διαβάζεται όταν εμφανίζεται σε ειδοποίηση.
 */
function buildSentence(
  diff: number, drivers: Driver[], baseKey: string, yearRef: number,
  basis: Basis, partial: boolean,
): string {
  const when = basis === 'previous_month'
    ? `από τον ${monthPhrase(baseKey, yearRef)}`
    : `από τον ${monthPhrase(baseKey)} ${baseKey.slice(0, 4)}`;

  if (Math.abs(diff) < NOISE) {
    return `Οι δαπάνες είναι ουσιαστικά ίδιες ${when}.`;
  }

  const dir = diff > 0 ? 'περισσότερα' : 'λιγότερα';
  const head = `Ξόδεψες ${eur(diff)} ${dir} ${when}`;

  // Οι αιτίες που δείχνουν προς ΤΗΝ ΙΔΙΑ κατεύθυνση με τη συνολική διαφορά.
  // Μια κατηγορία που έπεσε ενώ το σύνολο ανέβηκε δεν «εξηγεί» την αύξηση.
  const same = drivers.filter(d => (diff > 0 ? d.diff > 0 : d.diff < 0)).slice(0, 2);
  if (same.length === 0) return `${head}.${partial ? ' Ο μήνας δεν έχει τελειώσει.' : ''}`;

  // «Κυρίως Άλλο 751 €» ΔΕΝ ΕΙΝΑΙ ΕΛΛΗΝΙΚΑ. Το όνομα της κατηγορίας μπαίνει σε
  // εισαγωγικά και προηγείται πρόθεση, ώστε η πρόταση να στέκει με ΟΠΟΙΟ όνομα
  // κι αν έχει η κατηγορία — και το «Άλλο» είναι υπαρκτή κατηγορία.
  const parts = same.map(d => {
    if (d.isNew) return `«${d.label}» ${eur(d.current)}, που δεν υπήρχε`;
    return `«${d.label}» ${eur(d.diff)}`;
  });
  const tail = parts.length === 1 ? parts[0] : `${parts[0]} και ${parts[1]}`;
  return `${head}. Κυρίως από ${tail}.${partial ? ' Ο μήνας δεν έχει τελειώσει.' : ''}`;
}

// ── ΤΟ ΙΣΤΟΡΙΚΟ ────────────────────────────────────────────────────────────

export interface MonthPoint {
  key: string;
  label: string;
  total: number;
  /** Η διαφορά από τον ίδιο μήνα πέρυσι, ή null αν δεν υπάρχει. */
  yoy: number | null;
}

/**
 * Οι τελευταίοι `months` μήνες, με τη σύγκριση κάθε ενός με πέρυσι.
 *
 * Ο άξονας φτιάχνεται από το ΗΜΕΡΟΛΟΓΙΟ, όχι από τα δεδομένα: αλλιώς οι μήνες
 * χωρίς κίνηση εξαφανίζονται και τέσσερις σκόρπιοι μήνες δείχνουν σαν τέσσερις
 * συνεχόμενοι.
 */
export function history(spends: readonly Spend[], today: Date, months = 12): MonthPoint[] {
  const totals = new Map<string, number>();
  for (const s of spends) {
    const k = s.date.slice(0, 7);
    const a = Math.abs(Number(s.amount));
    if (!Number.isFinite(a)) continue;
    totals.set(k, (totals.get(k) ?? 0) + a);
  }

  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = monthKey(d);
    const total = totals.get(key) ?? 0;
    const last = totals.get(sameMonthLastYear(key));
    out.push({
      key,
      // Ονομαστική: η ετικέτα στέκεται ΜΟΝΗ της (τίτλος επιλεγμένης στήλης,
      // tooltip «Ιούλιος 2026: 142,50 €»), δεν ακολουθεί πρόθεση. Με την
      // αιτιατική έγραφε «Ιούλιο 2026», που δεν είναι πρόταση.
      label: `${monthNom(d.getMonth())} ${d.getFullYear()}`,
      total,
      // `null` όταν δεν υπάρχει περσινή μέτρηση. Το μηδέν θα ήταν ψέμα: δεν
      // ξέρουμε ότι πέρυσι ξόδεψε μηδέν, ξέρουμε ότι δεν έχουμε στοιχεία.
      yoy: last === undefined ? null : total - last,
    });
  }
  return out;
}

/**
 * Η μηνιαία ενημέρωση, έτοιμη για ειδοποίηση.
 *
 * Στέλνεται στο ΤΕΛΟΣ του μήνα, όχι στην αρχή του επόμενου: τότε ο μήνας είναι
 * φρέσκος στο μυαλό και οι αποδείξεις ακόμη στο συρτάρι.
 *
 * Επιστρέφει `null` όταν δεν υπάρχει τίποτα να ειπωθεί. Μια ειδοποίηση που
 * λέει «δεν άλλαξε τίποτα» εκπαιδεύει τον χρήστη να τις αγνοεί.
 */
export function monthlyDigest(spends: readonly Spend[], today: Date): string | null {
  const key = monthKey(today);
  const c = compareMonth(spends, key, { today });
  if (!c.meaningful) return null;
  if (Math.abs(c.diff) < NOISE) return null;
  return [c.sentence, ...c.caveats].join(' ');
}
