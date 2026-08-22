// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟ ΠΡΟΩΘΗΜΕΝΟ ΛΟΓΑΡΙΑΣΜΟ ΣΕ ΠΡΟΤΑΣΗ ΔΑΠΑΝΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Ο ιδιοκτήτης προωθεί τον λογαριασμό της ΔΕΗ και θέλει να τελειώσει. Εδώ
// βγαίνει ό,τι μπορεί να βγει με σιγουριά: ποσό, ημερομηνία λήξης, ημερομηνία
// έκδοσης, πάροχος, κατηγορία.
//
// ── Ο ΚΑΝΟΝΑΣ ΠΟΥ ΔΙΑΠΕΡΝΑ ΟΛΟ ΤΟ ΑΡΧΕΙΟ ─────────────────────────────────
// ΟΤΙ ΔΕΝ ΒΓΑΙΝΕΙ ΜΕ ΣΙΓΟΥΡΙΑ ΓΥΡΙΖΕΙ `null`, ΚΑΙ ΤΟ ΛΕΜΕ. Ενα ποσό που το
// μαντέψαμε λάθος δεν είναι «σχεδόν σωστό»: είναι λάθος νούμερο στα βιβλία
// ενός ανθρώπου, γραμμένο με βεβαιότητα. Οταν το κείμενο έχει πέντε
// διαφορετικά ευρώ και καμία ετικέτα, η απάντηση είναι «δεν ξέρω» — και η
// οθόνη ζητά το ποσό από τον άνθρωπο.
//
// ── ΤΟ ΠΡΟΩΘΗΜΕΝΟ ΜΗΝΥΜΑ ΕΙΝΑΙ Ο ΚΑΝΟΝΑΣ, ΟΧΙ Η ΕΞΑΙΡΕΣΗ ─────────────────
// Οταν κάποιος προωθεί, ο αποστολέας του μηνύματος ΕΙΝΑΙ Ο ΙΔΙΟΣ. Το «από
// ποιον ήρθε ο λογαριασμός» ζει μέσα στο σώμα, στο μπλοκ που προσθέτει ο
// πελάτης αλληλογραφίας («Από:», «From:»). Χωρίς αυτή την ανάγνωση, κάθε
// προωθημένος λογαριασμός θα καταγραφόταν με πάροχο τον ίδιο τον ιδιοκτήτη.
//
// ── ΓΙΑΤΙ Η ΚΑΤΗΓΟΡΙΑ ΒΓΑΙΝΕΙ ΑΠΟ ΘΕΜΑ ΚΑΙ ΠΑΡΟΧΟ, ΟΧΙ ΑΠΟ ΤΟ ΣΩΜΑ ───────
// Το σώμα ενός λογαριασμού ρεύματος αναφέρει νερό, αέριο, ασφάλιση και
// συντήρηση μέσα στους όρους του. Η ταξινομία ταιριάζει ανά λέξη· ρίχνοντάς
// της ολόκληρο το κείμενο, η πρώτη λέξη που θα πετύχει ορίζει την κατηγορία —
// και θα είναι λάθος πιο συχνά από ό,τι σωστή. Το θέμα και το όνομα του
// παρόχου είναι τα δύο σημεία που γράφτηκαν για να ΠΟΥΝ τι είναι το μήνυμα.
// ═══════════════════════════════════════════════════════════════════════════

import { parseAmount, parseDate } from '@/lib/core/greek';
import { classifyExpense } from '@/lib/expenses/classify';

/** Το μήνυμα όπως το δίνει ο πάροχος, αφού ζητήσουμε και το σώμα του. */
export interface InboundSource {
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
}

/** Τι λείπει για να γίνει δαπάνη με ένα πάτημα. */
export type Missing = 'amount' | 'date';

export interface Parsed {
  /** Το όνομα που θα δει ο άνθρωπος ως πάροχο, ή `null` όταν δεν υπάρχει. */
  vendor: string | null;
  amount: number | null;
  dueDate: string | null;
  issueDate: string | null;
  category: string;
  group: string;
  deductible: boolean;
  missing: Missing[];
}

// ── Κείμενο ────────────────────────────────────────────────────────────────

/**
 * Το κείμενο ενός μηνύματος HTML.
 *
 * ΤΑ `script` ΚΑΙ `style` ΦΕΥΓΟΥΝ ΜΕ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥΣ. Ενα φύλλο στυλ
 * γεμάτο «12px» και «0,5em» θα έδινε στην αναζήτηση ποσού δεκάδες ψεύτικους
 * αριθμούς, ακριβώς εκεί όπου η σιωπή αξίζει περισσότερο από τη μαντεψιά.
 */
export function textFromHtml(html: string | null | undefined): string {
  return String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&euro;/gi, '€')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t ]+/g, ' ')
    // Τα κενά γύρω από την αλλαγή γραμμής φεύγουν: το `</p><p>` αφήνει και
    // γραμμή και κενό, και κάθε παράγραφος θα ξεκινούσε με κενό.
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Οσο κείμενο διαβάζεται. Ενας λογαριασμός δεν ξεπερνά τα λίγα χιλιάδες
 * γράμματα· ό,τι πάει παραπάνω είναι υπογραφές, όροι και ιστορικό αλληλογραφίας.
 *
 * ΤΟ ΟΡΙΟ ΕΙΝΑΙ ΚΑΙ ΑΣΦΑΛΕΙΑ. Το σώμα το στέλνει ΑΓΝΩΣΤΟΣ: χωρίς όριο, ένα
 * μήνυμα δεκάδων megabyte θα περνούσε ολόκληρο από πέντε κανονικές εκφράσεις
 * σε κάθε παραλαβή. Το ποσό και η λήξη ενός λογαριασμού είναι πάντα στην αρχή.
 */
export const MAX_BODY_CHARS = 200_000;

/** Το σώμα, από όπου υπάρχει. Το απλό κείμενο προηγείται· είναι ήδη κείμενο. */
export function bodyOf(src: InboundSource): string {
  const plain = (src.text || '').trim();
  const body = plain || textFromHtml((src.html || '').slice(0, MAX_BODY_CHARS * 4));
  return body.slice(0, MAX_BODY_CHARS);
}

/**
 * Πεζά, χωρίς τόνους, με τα κενά μαζεμένα.
 *
 * Οι ετικέτες των λογαριασμών γράφονται πότε «Πληρωτέο ποσό», πότε «ΠΛΗΡΩΤΕΟ
 * ΠΟΣΟ» και πότε χωρίς τόνο. Η αναζήτηση γίνεται ΟΛΗ πάνω στην κανονική μορφή,
 * ώστε να μη χρειάζεται δεύτερη γραφή κάθε ετικέτας.
 */
export function flatten(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Ο αποστολέας ───────────────────────────────────────────────────────────

/** Το ορατό όνομα ενός αποστολέα, ή το μέρος πριν το παπάκι. */
export function senderName(from: string | null | undefined): string | null {
  const raw = (from || '').trim();
  if (!raw) return null;
  const named = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(raw);
  const name = (named ? named[1] : '').trim();
  if (name && !name.includes('@')) return name;
  const addr = (/<([^<>]+)>/.exec(raw)?.[1] || raw).trim();
  const local = addr.split('@')[0].trim();
  return local || null;
}

/**
 * Ο αρχικός αποστολέας και το αρχικό θέμα ενός προωθημένου μηνύματος.
 *
 * Ψάχνει το μπλοκ κεφαλίδων που γράφει ο πελάτης αλληλογραφίας. Οι γραμμές
 * είναι πάντα στην αρχή γραμμής και ακολουθούνται από άνω και κάτω τελεία —
 * το «from:» μέσα σε πρόταση δεν είναι κεφαλίδα.
 */
export function forwardedFrom(body: string): { from: string | null; subject: string | null } {
  const line = (labels: string[]): string | null => {
    for (const l of labels) {
      const m = new RegExp(`^\\s*${l}\\s*:\\s*(.+)$`, 'im').exec(body);
      const v = m?.[1]?.trim();
      if (v) return v;
    }
    return null;
  };
  return {
    from: line(['from', 'από', 'απο', 'αποστολέας', 'αποστολεας']),
    subject: line(['subject', 'θέμα', 'θεμα']),
  };
}

// ── Το ποσό ────────────────────────────────────────────────────────────────

/**
 * Οι ετικέτες που προηγούνται του ποσού, από την πιο συγκεκριμένη στην πιο
 * γενική. Το «σύνολο» μπαίνει τελευταίο επειδή εμφανίζεται και σε ενδιάμεσα
 * αθροίσματα· όταν υπάρχει «πληρωτέο», εκείνο είναι το ποσό που ζητά ο πάροχος.
 */
export const AMOUNT_LABELS = [
  'πληρωτεο ποσο', 'συνολικο πληρωτεο', 'ποσο πληρωμης', 'συνολο πληρωμης',
  'τελικο ποσο', 'συνολικο ποσο', 'ποσο οφειλης', 'συνολικη οφειλη',
  'οφειλη', 'πληρωτεο', 'συνολο', 'total amount', 'amount due', 'total',
];

/** Πόσους χαρακτήρες μετά την ετικέτα ψάχνουμε αριθμό. */
const REACH = 60;

/**
 * Πού αρχίζει η ετικέτα ΩΣ ΛΕΞΗ, από τη θέση `from` και μετά. `-1` όταν πουθενά.
 *
 * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΑΠΟΤΡΕΠΕΙ: το «ληξη» υπάρχει μέσα στην «κατάληξη». Χωρίς έλεγχο
 * αρχής λέξης, η πρόταση «η κατάληξη της συνεργασίας ήταν 12/05/2026» θα έδινε
 * ημερομηνία λήξης λογαριασμού. Η ΑΡΧΗ ελέγχεται, το ΤΕΛΟΣ όχι: τα ελληνικά
 * κλίνουν («λήξης», «ποσού»), και ένα κλειστό τέλος θα έχανε τις μισές ετικέτες.
 */
function labelAt(flat: string, label: string, from: number): number {
  let at = flat.indexOf(label, from);
  while (at > 0 && /[\p{L}\p{N}]/u.test(flat[at - 1])) at = flat.indexOf(label, at + 1);
  return at;
}

/** Ενα ποσό λογαριασμού: θετικό και κάτω από ένα εκατομμύριο. */
const plausible = (n: number | null): n is number => n !== null && n > 0 && n < 1_000_000;

/** Ο πρώτος αριθμός μέσα σε ένα κομμάτι κειμένου, με ή χωρίς σύμβολο. */
function firstAmount(chunk: string): number | null {
  for (const m of chunk.matchAll(/\d[\d.,]*/g)) {
    const n = parseAmount(m[0]);
    if (plausible(n)) return n;
  }
  return null;
}

/**
 * Το ποσό του λογαριασμού, ή `null`.
 *
 * ΔΥΟ ΔΡΟΜΟΙ, ΜΕ ΤΗ ΣΕΙΡΑ. Πρώτα η ετικέτα: ό,τι γράφτηκε δίπλα στη λέξη
 * «πληρωτέο» είναι το ποσό που ζητά ο πάροχος. Αν καμία ετικέτα δεν υπάρχει,
 * μετράνε μόνο τα ποσά που φέρουν σύμβολο ευρώ — και ΜΟΝΟ αν συμφωνούν όλα
 * μεταξύ τους. Δύο διαφορετικά ευρώ χωρίς ετικέτα σημαίνει ότι το κείμενο δεν
 * μας λέει ποιο είναι το ποσό, και η σωστή απάντηση είναι η σιωπή.
 */
export function amountIn(flat: string): number | null {
  for (const label of AMOUNT_LABELS) {
    let at = labelAt(flat, label, 0);
    while (at >= 0) {
      const n = firstAmount(flat.slice(at + label.length, at + label.length + REACH));
      if (n !== null) return n;
      at = labelAt(flat, label, at + label.length);
    }
  }
  const withSymbol = new Set<number>();
  // ΤΟ ΟΡΙΟ ΛΕΞΗΣ ΓΡΑΦΕΤΑΙ ΡΗΤΑ. Το `\b` της JavaScript είναι ASCII: δίπλα στο
  // «ευρω» δεν ταιριάζει ποτέ, και ο έλεγχος θα περνούσε χωρίς να ελέγχει.
  for (const m of flat.matchAll(/(?:€\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:€|eur|ευρω)(?![\p{L}\p{N}]))/gu)) {
    const n = parseAmount(m[1] || m[2]);
    if (plausible(n)) withSymbol.add(n);
  }
  return withSymbol.size === 1 ? [...withSymbol][0] : null;
}

// ── Οι ημερομηνίες ─────────────────────────────────────────────────────────

export const DUE_LABELS = [
  'ημερομηνια ληξης', 'καταληκτικη ημερομηνια', 'προθεσμια πληρωμης',
  'πληρωμη εως', 'εξοφληση εως', 'εξοφλητεο εως', 'ληξη προθεσμιας',
  'πληρωτεο εως', 'due date', 'ληξη',
];

export const ISSUE_LABELS = [
  'ημερομηνια εκδοσης', 'ημ. εκδοσης', 'ημ εκδοσης', 'εκδοθηκε', 'issue date',
];

/** Η πρώτη ημερομηνία μετά από μία από τις ετικέτες, ή `null`. */
export function dateIn(flat: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    let at = labelAt(flat, label, 0);
    while (at >= 0) {
      const chunk = flat.slice(at + label.length, at + label.length + REACH);
      for (const m of chunk.matchAll(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}/g)) {
        const d = parseDate(m[0]);
        if (d) return d;
      }
      at = labelAt(flat, label, at + label.length);
    }
  }
  return null;
}

// ── Ολα μαζί ───────────────────────────────────────────────────────────────

/**
 * Πώς θα λέγεται η δαπάνη μέσα στο καθολικό.
 *
 * ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΤΟ ΘΕΜΑ. Το καθολικό δείχνει περιγραφή και κατηγορία, ΟΧΙ
 * πάροχο. Ενα «Ο λογαριασμός σας» σε λίστα με τριάντα γραμμές δεν λέει τίποτα:
 * το όνομα του παρόχου είναι το μόνο που ξεχωρίζει τη μία γραμμή από την άλλη.
 *
 * ΚΑΙ ΓΙΑΤΙ ΟΧΙ ΠΑΝΤΑ ΚΑΙ ΤΑ ΔΥΟ. Οταν το θέμα λέει ήδη τον πάροχο
 * («ΕΥΔΑΠ: λογαριασμός Ιουλίου»), το μπροστινό όνομα θα το έλεγε δεύτερη φορά.
 */
export function expenseTitle(vendor: string | null, subject: string, category: string): string {
  const s = subject.trim();
  const v = (vendor || '').trim();
  if (!v) return (s || category).slice(0, 120);
  if (!s) return v.slice(0, 120);
  return (flatten(s).includes(flatten(v)) ? s : `${v} ${s}`).slice(0, 120);
}

/**
 * Η πρόταση δαπάνης που θα δει ο άνθρωπος.
 *
 * Δεν γράφει τίποτα και δεν αποφασίζει τίποτα: γυρίζει ό,τι διάβασε και ό,τι
 * ΔΕΝ διάβασε. Την απόφαση την παίρνει ο ιδιοκτήτης με ένα πάτημα.
 */
export function parseInbound(src: InboundSource): Parsed {
  const body = bodyOf(src);
  const fwd = forwardedFrom(body);
  const vendor = senderName(fwd.from) ?? senderName(src.from);
  const subject = (fwd.subject || src.subject || '').trim();

  const flat = flatten(`${subject}\n${body}`);
  const amount = amountIn(flat);
  const dueDate = dateIn(flat, DUE_LABELS);
  const issueDate = dateIn(flat, ISSUE_LABELS);

  const cls = classifyExpense(`${subject} ${vendor || ''}`);

  const missing: Missing[] = [];
  if (amount === null) missing.push('amount');
  if (!dueDate && !issueDate) missing.push('date');

  return {
    vendor,
    amount,
    dueDate,
    issueDate,
    category: cls.category,
    group: cls.group,
    deductible: cls.deductible,
    missing,
  };
}
