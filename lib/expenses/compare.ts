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
//    είναι μαθηματικά σωστό και εντελώς ψεύτικο.
//
//    ΔΕΝ ΑΡΚΕΙ ΝΑ ΤΟ ΣΗΜΕΙΩΣΕΙΣ. Εδώ γραφόταν ένας ΛΑΘΟΣ αριθμός και από κάτω
//    του μια επιφύλαξη που ζητούσε από τον αναγνώστη να τον διορθώσει στο μυαλό
//    του: «−76%» και μετά «ο Αύγουστος δεν έχει τελειώσει». Κανείς δεν το κάνει
//    αυτό. Διαβάζει το νούμερο, όπως θα διάβαζε κάθε νούμερο· έπειτα φεύγει.
//
//    Οταν ο μήνας τρέχει, συγκρίνονται ΙΣΑ ΔΙΑΣΤΗΜΑΤΑ: οι πρώτες N ημέρες του
//    τρέχοντα με τις πρώτες N του μήνα βάσης, όπου N η σημερινή ημερομηνία. Και
//    το πρόσημο μπορεί να ΑΝΤΙΣΤΡΑΦΕΙ: 273 € στις 28 μέρες του Αυγούστου απέναντι
//    στις 321 € ΟΛΟΚΛΗΡΟΥ του Ιουλίου δίνει «λιγότερα», ενώ απέναντι στις 240 €
//    των πρώτων 28 ημερών του Ιουλίου δίνει «περισσότερα». Το δεύτερο είναι η
//    αλήθεια· το πρώτο είναι το ημερολόγιο μεταμφιεσμένο σε συμπεριφορά.
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
import { monthAcc, monthGen, monthNom } from '../core/months';

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
  /**
   * Κατηγορία που δεν έχει εμφανιστεί ΠΟΤΕ πριν από τον τρέχοντα μήνα.
   *
   * ΚΟΙΤΑΖΕ ΕΝΑΝ ΜΗΝΑ ΠΙΣΩ ΚΑΙ ΕΛΕΓΕ «ΝΕΟ». Η ΕΥΔΑΠ είναι δίμηνη: 31,20 € τον
   * Ιούνιο, τίποτα τον Ιούλιο, 31,20 € τον Αύγουστο. Με βάση τον Ιούλιο, το
   * νερό βγαινε «νέο» — και το γράφημα δώδεκα μηνών της ίδιας κάρτας έδειχνε
   * τη στήλη του Ιουνίου λίγα εκατοστά πιο κάτω. Ο ιδιοκτήτης έψαχνε χρέωση
   * που δεν αναγνωρίζει, ενώ την είχε ήδη πληρώσει δύο φορές φέτος.
   */
  isNew: boolean;
  /**
   * Υπήρχε στη βάση και δεν υπάρχει πια. ΠΟΤΕ αληθές όσο ο μήνας τρέχει.
   *
   * Στις 28 του μήνα, ο λογαριασμός ρεύματος που έρχεται στις 30 δεν έχει
   * «σταματήσει»: δεν έχει έρθει. Η ίδια οθόνη το έλεγε κιόλας, με τη γραμμή
   * «ένα πάγιο δεν έχει καταχωρηθεί ακόμη» λίγο πιο κάτω, οπότε δύο σημεία
   * έδιναν αντίθετη απάντηση για την ίδια χρέωση.
   */
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
  /**
   * Η διαφορά είναι μέσα στον θόρυβο: υπάρχει σύγκριση, δεν υπάρχει αλλαγή.
   *
   * Η οθόνη το χρειάζεται για να ξέρει ΤΙ να γράψει κάτω από τον αριθμό. Χωρίς
   * αυτό, έπρεπε να μαντέψει από το `drivers.length === 0`, που σημαίνει δύο
   * εντελώς διαφορετικά πράγματα: «δεν άλλαξε τίποτα» και «άλλαξαν πολλά, από
   * λίγο το καθένα». Το κατώφλι ζει στη μηχανή, όπου ελέγχεται.
   */
  flat: boolean;
  /** Η σύγκριση σε μία φράση, στα ελληνικά. Ποτέ κενή. */
  sentence: string;
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
 * «του Ιουλίου», γενική — όταν ο μήνας ΠΡΟΣΔΙΟΡΙΖΕΙ κάτι άλλο, εδώ τις ημέρες
 * του. Τα ελληνικά κλίνουν και η λάθος πτώση είναι από τα πρώτα πράγματα που
 * βλέπει ο αναγνώστης: «οι πρώτες 28 ημέρες του Αύγουστος» δεν είναι πρόταση.
 * Ο κατάλογος των μηνών σε τρεις πτώσεις ζει ήδη στο lib/core/months.
 */
function monthGenitive(key: string): string {
  return monthGen(Number(key.slice(5, 7)) - 1) || key;
}

/** Πόσες μέρες έχει ο μήνας. */
const daysInMonth = (key: string): number =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();

// ── ΣΥΝΟΛΑ ΑΝΑ ΜΗΝΑ ────────────────────────────────────────────────────────

interface Bucket { total: number; byCat: Map<string, number>; oneOffs: Spend[] }

/**
 * Τα ποσά ενός μήνα, προαιρετικά ΜΕΧΡΙ ΚΑΙ μια ημέρα του.
 *
 * Το `upto` είναι όλη η σύγκριση ίσων διαστημάτων: με την ίδια τιμή και στους
 * δύο κάδους, ο τρέχων μήνας κόβεται στο σήμερα και ο μήνας βάσης στην ίδια
 * ημέρα. Χωρίς αυτό, ο ένας κάδος μετρά είκοσι οκτώ ημέρες και ο άλλος τριάντα
 * μία· η διαφορά τους τότε λέγεται «συμπεριφορά».
 */
function bucketOf(spends: readonly Spend[], key: string, upto?: number): Bucket {
  const b: Bucket = { total: 0, byCat: new Map(), oneOffs: [] };
  for (const s of spends) {
    if (s.date.slice(0, 7) !== key) continue;
    if (upto !== undefined && Number(s.date.slice(8, 10)) > upto) continue;
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

  // ── ΗΜΙΤΕΛΗΣ ΜΗΝΑΣ: ΙΣΑ ΔΙΑΣΤΗΜΑΤΑ, ΟΧΙ ΕΠΙΦΥΛΑΞΗ ───────────────────────
  // Οσο ο μήνας τρέχει, κόβονται ΚΑΙ ΟΙ ΔΥΟ στη σημερινή ημέρα. Η επιφύλαξη
  // λέει πλέον ΤΙ συγκρίθηκε, δεν ζητά συγγνώμη για ό,τι συγκρίθηκε λάθος.
  const nowKey = monthKey(opts.today);
  const day = opts.today.getDate();
  const partial = currentKey === nowKey && day < daysInMonth(currentKey);
  const upto = partial ? day : undefined;

  const cur = bucketOf(spends, currentKey, upto);
  const bas = bucketOf(spends, baseKey, upto);
  const diff = cur.total - bas.total;
  const caveats: string[] = [];
  if (partial) {
    caveats.push(`Ίσα διαστήματα: οι πρώτες ${day} ημέρες του ${monthGenitive(currentKey)} με τις πρώτες ${day} του ${monthGenitive(baseKey)}.`);
  }

  // ── ΛΕΙΠΕΙ Η ΒΑΣΗ ────────────────────────────────────────────────────────
  // Το μήνυμα λέει ΠΟΙΟ διάστημα βρέθηκε άδειο. Με ίσα διαστήματα, «δεν
  // υπάρχουν δαπάνες τον Ιούλιο» θα ήταν ψέμα όταν ο Ιούλιος έχει δαπάνες μετά
  // την ημέρα που κόβει η σύγκριση: άδειες είναι οι πρώτες N ημέρες του, όχι ο
  // μήνας.
  if (bas.total === 0) {
    const yearRef = Number(currentKey.slice(0, 4));
    const where = upto === undefined
      ? `τον ${monthPhrase(baseKey, yearRef)}`
      : `στις πρώτες ${upto} ημέρες του ${monthGenitive(baseKey)}`;
    const none = cur.total === 0
      ? 'Δεν υπάρχουν καταχωρημένες δαπάνες για σύγκριση.'
      : `Δεν υπάρχουν δαπάνες ${where} για να γίνει σύγκριση.`;
    return {
      basis, currentKey, baseKey, current: cur.total, base: 0, diff: cur.total, pct: null,
      drivers: [], caveats,
      meaningful: false, flat: false,
      sentence: none,
    };
  }

  // ── ΟΙ ΚΑΤΗΓΟΡΙΕΣ ΠΟΥ ΕΞΗΓΟΥΝ ΤΗ ΔΙΑΦΟΡΑ ────────────────────────────────
  // «Νέο» σημαίνει ποτέ πριν, όχι «όχι τον προηγούμενο μήνα». Το σύνολο
  // χτίζεται από ΟΛΟ το ιστορικό που δόθηκε, μία φορά, όχι ανά κατηγορία.
  const everBefore = new Set<string>();
  for (const sp of spends) {
    if (sp.date.slice(0, 7) >= currentKey) continue;
    const a = Math.abs(Number(sp.amount));
    if (!Number.isFinite(a) || a === 0) continue;
    everBefore.add(resolveCategory(sp.category) ?? 'other');
  }

  const slugs = new Set([...cur.byCat.keys(), ...bas.byCat.keys()]);
  const drivers: Driver[] = [...slugs]
    .map(slug => {
      const c = cur.byCat.get(slug) ?? 0;
      const b = bas.byCat.get(slug) ?? 0;
      return {
        slug, label: categoryLabel(slug) || 'Άλλο',
        diff: c - b, current: c, base: b,
        isNew: c > 0 && !everBefore.has(slug),
        vanished: !partial && c === 0 && b > 0,
      };
    })
    .filter(d => Math.abs(d.diff) >= NOISE)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // ── ΤΟ ΕΤΗΣΙΟ ΠΟΥ ΕΤΥΧΕ, ΚΑΙ ΠΡΟΣ ΤΙΣ ΔΥΟ ΚΑΤΕΥΘΥΝΣΕΙΣ ──────────────────────
  // Η ασφάλεια των 340 € πληρώνεται μία φορά τον χρόνο. Τον μήνα που πέφτει, οι
  // δαπάνες εκτοξεύονται. Δεν είναι υπέρβαση, είναι ο ετήσιος λογαριασμός.
  //
  // Η ΑΜΥΝΑ ΚΟΙΤΑΖΕ ΜΟΝΟ ΤΟΝ ΤΡΕΧΟΝΤΑ ΜΗΝΑ. Δηλαδή έπιανε τον μήνα ΠΟΥ ΠΕΦΤΕΙ
  // το ετήσιο και άφηνε ακάλυπτο τον ΕΠΟΜΕΝΟ, όπου το ίδιο ακριβώς ασφάλιστρο
  // γεννά «μείωση 340 €». Ο ιδιοκτήτης διάβαζε ότι έκοψε δαπάνες κατά ένα ποσό
  // που δεν έκοψε ποτέ: απλώς πέρασε ο μήνας του ετήσιου λογαριασμού. Είναι το
  // ίδιο ψέμα με το αντίθετο πρόσημο· το αρχείο το κατονομάζει στην
  // επικεφαλίδα του ως δεύτερο από τους τρεις τρόπους να πεις ψέματα.
  //
  // ΚΑΙ ΠΡΕΠΕΙ ΟΝΤΩΣ ΝΑ ΕΞΗΓΕΙ ΤΗ ΜΕΤΑΚΙΝΗΣΗ. Το κατώφλι μετρούσε την έκτακτη
  // δαπάνη απέναντι στο ΣΥΝΟΛΟ του μήνα της, όχι απέναντι στη διαφορά που
  // υποτίθεται ότι εξηγεί: ασφάλιστρο 340 € με διαφορά 50 € έβγαζε «η αύξηση
  // οφείλεται σε μεγάλο βαθμό», ενώ τα υπόλοιπα είχαν πέσει κατά 290 €. Ζητά
  // πλέον να καλύπτει τουλάχιστον τη μισή μετακίνηση.
  const bigOneOff = (b: Bucket): Spend | undefined => b.oneOffs
    .filter(x => Math.abs(Number(x.amount)) >= Math.max(NOISE * 10, b.total * 0.3))
    .filter(x => Math.abs(Number(x.amount)) >= Math.abs(diff) * 0.5)
    .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))[0];
  const nameOf = (x: Spend): string =>
    x.title?.trim() || categoryLabel(x.category) || 'μια δαπάνη';

  if (diff > 0) {
    const big = bigOneOff(cur);
    if (big) caveats.push(`Η αύξηση οφείλεται σε μεγάλο βαθμό σε έκτακτη δαπάνη: ${nameOf(big)}.`);
  } else if (diff < 0) {
    const big = bigOneOff(bas);
    if (big) caveats.push(`Η μείωση οφείλεται σε μεγάλο βαθμό σε έκτακτη δαπάνη του ${monthGenitive(baseKey)}: ${nameOf(big)}.`);
  }

  const pct = bas.total > 0 ? (diff / bas.total) * 100 : null;
  const yearRef = Number(currentKey.slice(0, 4));

  return {
    basis, currentKey, baseKey, current: cur.total, base: bas.total, diff, pct,
    drivers: drivers.slice(0, MAX_DRIVERS),
    caveats,
    meaningful: true,
    flat: Math.abs(diff) < NOISE,
    sentence: buildSentence(diff, drivers, baseKey, yearRef, basis),
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
// ═══ ΤΟ «Ο ΜΗΝΑΣ ΔΕΝ ΕΧΕΙ ΤΕΛΕΙΩΣΕΙ» ΓΡΑΦΟΤΑΝ ΔΥΟ ΦΟΡΕΣ, ΠΑΝΤΟΥ ═══════════════
// Η φράση τελείωνε με «Ο μήνας δεν έχει τελειώσει.» και η ΠΡΩΤΗ επιφύλαξη έλεγε
// «Ο Αύγουστος δεν έχει τελειώσει: μετράνε 28 από 31 ημέρες.» Στην κάρτα οι δύο
// προτάσεις κάθονταν σε απόσταση είκοσι εικονοστοιχείων, η μία πάνω από την
// άλλη· στη μηνιαία ειδοποίηση, που ενώνει φράση και επιφυλάξεις με κενό
// (`monthlyDigest`), κόλλαγαν στην ΙΔΙΑ γραμμή.
//
// Η δεύτερη λέει ό,τι η πρώτη ΚΑΙ τον μήνα ΚΑΙ τις ημέρες. Μένει αυτή. Το
// `partial` δεν χρειάζεται πια εδώ: η επιφύλαξη μπαίνει στη λίστα ούτως ή άλλως,
// στο ίδιο σημείο, από την ίδια συνθήκη.
function buildSentence(
  diff: number, drivers: Driver[], baseKey: string, yearRef: number,
  basis: Basis,
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
  if (same.length === 0) return `${head}.`;

  // «Κυρίως Άλλο 751 €» ΔΕΝ ΕΙΝΑΙ ΕΛΛΗΝΙΚΑ. Το όνομα της κατηγορίας μπαίνει σε
  // εισαγωγικά και προηγείται πρόθεση, ώστε η πρόταση να στέκει με ΟΠΟΙΟ όνομα
  // κι αν έχει η κατηγορία — και το «Άλλο» είναι υπαρκτή κατηγορία.
  const parts = same.map(d => {
    if (d.isNew) return `«${d.label}» ${eur(d.current)}, που δεν υπήρχε`;
    return `«${d.label}» ${eur(d.diff)}`;
  });
  const tail = parts.length === 1 ? parts[0] : `${parts[0]} και ${parts[1]}`;
  return `${head}. Κυρίως από ${tail}.`;
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
