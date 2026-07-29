// ═══════════════════════════════════════════════════════════════════════════
// ΜΑΖΙΚΗ ΚΑΤΑΧΩΡΗΣΗ — μία γραμμή, μία δαπάνη.
//
// ΤΟ ΠΡΟΒΛΗΜΑ: ο ιδιοκτήτης μαζεύει αποδείξεις και τις περνά μια φορά τον μήνα.
// Δεκαπέντε δαπάνες σήμαιναν δεκαπέντε φορές άνοιγμα φόρμας, πέντε πεδία,
// αποθήκευση, κλείσιμο. Η φόρμα είναι φτιαγμένη για τη μία δαπάνη τη στιγμή που
// συμβαίνει, και είναι σωστή για αυτό. Δεν είναι σωστή για τον απολογισμό.
//
// Η ΛΥΣΗ: γράφεις ή επικολλάς όπως θα το έγραφες σε χαρτί.
//
//     ΔΕΗ Ιουνίου 84,50 12/06
//     Υδραυλικός 60
//     Κοινόχρηστα 45,00 1/6
//
// Και τα τρία στοιχεία βρίσκονται μόνα τους: το ποσό, η ημερομηνία, η κατηγορία
// από το κοινό λεξιλόγιο. Ό,τι δεν καταλαβαίνει, το λέει· δεν το μαντεύει.
//
// ΓΙΑΤΙ ΚΑΘΑΡΗ ΣΥΝΑΡΤΗΣΗ: η ανάλυση κειμένου είναι το σημείο όπου γεννιούνται τα
// σιωπηλά λάθη — ένα κόμμα που διαβάζεται ως χιλιάδες κάνει τα 1.250 ευρώ
// 1,25. Εδώ ελέγχεται με tests και όχι με το μάτι πάνω στην οθόνη.
// ═══════════════════════════════════════════════════════════════════════════

import { resolveCategory, categoryLabel } from './taxonomy';

export interface ParsedRow {
  /** Η γραμμή όπως τη δακτυλογράφησε ο χρήστης. Επιστρέφεται πάντα. */
  raw: string;
  /** Τι ήταν η δαπάνη. */
  description: string;
  /** Σε ευρώ. 0 όταν δεν βρέθηκε ποσό — τότε η γραμμή δεν είναι έγκυρη. */
  amount: number;
  /** YYYY-MM-DD. Χωρίς ημερομηνία στη γραμμή, μπαίνει η σημερινή. */
  date: string;
  /** Slug του κοινού λεξιλογίου, ή null όταν δεν αναγνωρίζεται. */
  category: string | null;
  /** Ετικέτα για τον άνθρωπο. */
  categoryLabel: string;
  /** Γιατί δεν μπορεί να καταχωρηθεί. Κενό όταν η γραμμή είναι έγκυρη. */
  problem: string;
}

export interface BulkResult {
  rows: ParsedRow[];
  /** Πόσες γραμμές μπορούν να μπουν. */
  ready: number;
  /** Το άθροισμα των έγκυρων γραμμών. */
  total: number;
  /** Γραμμές που κόπηκαν επειδή ξεπερνούσαν το όριο του πλάνου. */
  overLimit: number;
}

const DATE_RE = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/;

/** Καθαρίζει τα σύμβολα που γράφει ο κόσμος γύρω από το ποσό. */
const stripMoney = (t: string): string => t.replace(/[€$\s]/g, '').replace(/^[+]/, '');

/**
 * Ελληνικό ποσό σε αριθμό.
 *
 * «1.250,50» -> 1250.5, «84,50» -> 84.5, «84.50» -> 84.5, «1.250» -> 1250.
 * Ο κανόνας: ο ΤΕΛΕΥΤΑΙΟΣ διαχωριστής είναι δεκαδικός μόνο αν ακολουθούν ένα ή
 * δύο ψηφία. Τρία ψηφία σημαίνει χιλιάδες, όπως το γράφει κάθε ελληνικός
 * λογαριασμός. Η λάθος απόφαση εδώ αλλάζει το ποσό κατά χίλιες φορές.
 */
export function parseAmount(text: string): number | null {
  const t = stripMoney(text);
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  const cut = Math.max(lastComma, lastDot);
  let intPart = t, decPart = '';
  if (cut >= 0) {
    const after = t.slice(cut + 1);
    if (after.length >= 1 && after.length <= 2) { intPart = t.slice(0, cut); decPart = after; }
  }
  const n = parseFloat(`${intPart.replace(/[.,]/g, '')}.${decPart || '0'}`);
  return Number.isFinite(n) ? n : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Ημερομηνία από «12/06», «12/6/26» ή «12-06-2026».
 *
 * Χωρίς χρονιά, εννοείται η φετινή — εκτός αν αυτό βγάζει ημερομηνία πάνω από
 * έναν μήνα στο μέλλον, οπότε εννοείται η περσινή. Τον Ιανουάριο ο κόσμος
 * περνά τις δαπάνες του Δεκεμβρίου, και το «28/12» δεν είναι του χρόνου.
 */
export function parseDate(text: string, today: Date): string | null {
  const m = DATE_RE.exec(text.trim());
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  let y: number;
  if (m[3]) {
    const raw = parseInt(m[3], 10);
    y = m[3].length <= 2 ? 2000 + raw : raw;
  } else {
    y = today.getFullYear();
    const guess = new Date(y, mo - 1, d);
    if (guess.getTime() - today.getTime() > 31 * 86400000) y -= 1;
  }
  const dt = new Date(y, mo - 1, d);
  // Απορρίπτει το «31/02», που η JavaScript θα μετέτρεπε σιωπηλά σε 3 Μαρτίου.
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return iso(dt);
}

/** Μια γραμμή κειμένου σε δαπάνη. */
export function parseLine(raw: string, today: Date): ParsedRow {
  const text = raw.trim();
  const empty: ParsedRow = {
    raw, description: '', amount: 0, date: iso(today),
    category: null, categoryLabel: 'Άλλο', problem: 'Κενή γραμμή',
  };
  if (!text) return empty;

  // Ο διαχωρισμός με στηλοθέτη ή ερωτηματικό καλύπτει την επικόλληση από φύλλο
  // εργασίας· τα κενά καλύπτουν το γράψιμο με το χέρι.
  const tokens = text.split(/[\t;]+|\s+/).filter(Boolean);

  let dateIdx = -1, date: string | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const d = parseDate(tokens[i], today);
    if (d) { date = d; dateIdx = i; break; }
  }

  // Το ποσό είναι το ΤΕΛΕΥΤΑΙΟ αριθμητικό που δεν είναι η ημερομηνία: «ΔΕΗ
  // Ιουνίου 2026 84,50» έχει δύο αριθμούς και μόνο ο δεύτερος είναι χρήματα.
  let amtIdx = -1, amount: number | null = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (i === dateIdx) continue;
    const a = parseAmount(tokens[i]);
    if (a !== null && a > 0) { amount = a; amtIdx = i; break; }
  }

  const description = tokens.filter((_, i) => i !== dateIdx && i !== amtIdx).join(' ').trim();
  const slug = resolveCategory(description);

  return {
    raw,
    description: description || (slug ? categoryLabel(slug) : ''),
    amount: amount ?? 0,
    date: date ?? iso(today),
    category: slug,
    categoryLabel: slug ? categoryLabel(slug) : 'Άλλο',
    problem: amount === null ? 'Δεν βρέθηκε ποσό'
      : !description ? 'Δεν βρέθηκε περιγραφή'
      : '',
  };
}

/**
 * Όλο το κείμενο σε γραμμές προς έλεγχο.
 *
 * ΤΟ ΟΡΙΟ ΚΟΒΕΙ, ΔΕΝ ΠΕΤΑΕΙ ΣΙΩΠΗΛΑ: οι γραμμές πάνω από το όριο του πλάνου
 * επιστρέφονται μετρημένες στο overLimit, ώστε η οθόνη να πει «οι 12 από τις 40
 * θα μπουν» αντί να καταχωρήσει 12 και να αφήσει τον χρήστη να νομίζει ότι
 * μπήκαν 40.
 */
export function parseBulk(text: string, limit: number, today: Date = new Date()): BulkResult {
  const all = String(text ?? '').split(/\r?\n/).filter(l => l.trim().length > 0)
    .map(l => parseLine(l, today));

  const valid: ParsedRow[] = [];
  const rows: ParsedRow[] = [];
  let overLimit = 0;

  for (const r of all) {
    if (r.problem) { rows.push(r); continue; }
    if (valid.length >= limit) {
      overLimit++;
      rows.push({ ...r, problem: 'Πάνω από το όριο του πλάνου' });
      continue;
    }
    valid.push(r);
    rows.push(r);
  }

  return {
    rows,
    ready: valid.length,
    total: Math.round(valid.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    overLimit,
  };
}

/**
 * Πόσες γραμμές δέχεται ένα πλάνο σε μία καταχώρηση.
 *
 * Το δωρεάν δεν είναι άχρηστο και δεν είναι δωρεάν επαγγελματικό εργαλείο: πέντε
 * γραμμές φτάνουν για να δει κανείς ότι δουλεύει, δεν φτάνουν για να περάσει τον
 * μήνα ενός χαρτοφυλακίου.
 */
export const BULK_LIMIT: Record<string, number> = {
  free: 5,
  owner: 50,
  agency: 250,
};

export const bulkLimit = (plan: string): number => BULK_LIMIT[plan] ?? BULK_LIMIT.free;
