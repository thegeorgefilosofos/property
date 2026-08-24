// ═══════════════════════════════════════════════════════════════════════════
// PROPERWISE — ο δίαυλος του toast (ΧΩΡΙΣ React)
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΤΟ TOAST: μετρήθηκαν επτά ξεχωριστές υλοποιήσεις μέσα στην ίδια
// εφαρμογή — 4 θέσεις στην οθόνη, 3 ακτίνες, 7 paddings, 4 φόντα, 6 διαφορετικά
// z-index (από 60 έως 9998) και 3 διάρκειες. Το toast με z-index 60 περνούσε
// ΚΑΤΩ από κάθε παράθυρο· αυτό με 9998 πάνω από τα πάντα. Ο χρήστης δεν βλέπει
// «επτά υλοποιήσεις»· βλέπει ότι η εφαρμογή απαντά αλλιώς σε κάθε καρτέλα.
//
// ΚΑΙ ΤΟ ΣΟΒΑΡΟΤΕΡΟ: 41 κλήσεις `alert()` του περιηγητή, οι 22 σε μία μόνο
// καρτέλα. Ένα native alert είναι γκρι πλαίσιο του λειτουργικού, με το domain
// από πάνω και κουμπί «OK» στα αγγλικά, που παγώνει τη σελίδα. Όποιος το δει
// βλέπει κυριολεκτικά άλλη εφαρμογή — και το βλέπει τη χειρότερη στιγμή, όταν
// κάτι μόλις απέτυχε.
//
// ── ΓΙΑΤΙ ΠΡΟΣΤΑΚΤΙΚΟ API ΚΑΙ ΟΧΙ HOOK ───────────────────────────────────
// Το `notify()` καλείται και από κώδικα που ΔΕΝ είναι component: γεννήτριες
// PDF, βοηθητικές συναρτήσεις, catch blocks. Ακριβώς εκεί ζούσαν τα μισά
// `alert()`. Ένα hook θα απαιτούσε να ξαναγραφτούν σε components· το
// προστακτικό API αντικαθιστά το `alert(x)` με `notify(x)` γραμμή προς γραμμή.
//
// ── ΓΙΑΤΙ ΧΩΡΙΣΤΑ ΑΠΟ ΤΟ Toast.tsx ───────────────────────────────────────
// Για τον ίδιο λόγο που τα tokens είναι χωριστά από το Theme.tsx: αν ο δίαυλος
// ζούσε σε module `'use client'`, κάθε αρχείο που τον εισάγει θα κληρονομούσε
// το σύνορο πελάτη. Καθαρή JavaScript εδώ· React μόνο στον host.
// ═══════════════════════════════════════════════════════════════════════════

import type { Tone } from './tokens';

export interface ToastOptions {
  /** Ο τόνος καθορίζει μόνο την τελεία· το πλαίσιο μένει ουδέτερο παντού. */
  tone?: Tone;
  /** Χιλιοστά του δευτερολέπτου. Μηδέν/αρνητικό = μένει ώσπου να το κλείσει ο χρήστης. */
  duration?: number;
  /** Προαιρετική αναστροφή (π.χ. «Αναίρεση» μετά από διαγραφή). */
  action?: { label: string; onClick: () => void };
}

export interface ToastItem extends ToastOptions { id: number; text: string }

type Listener = (t: ToastItem) => void;
let listener: Listener | null = null;
let seq = 0;
// Ό,τι σταλεί πριν προσαρτηθεί ο host δεν χάνεται — μπαίνει σε ουρά. Χωρίς
// αυτό, ένα σφάλμα στην πρώτη φόρτωση θα εξαφανιζόταν σιωπηλά.
const pending: ToastItem[] = [];

/** Η προεπιλεγμένη διάρκεια. Αρκετή για να διαβαστεί, όχι τόσο ώστε να ενοχλεί. */
export const TOAST_MS = 3200;

/**
 * Δείχνει μια επιβεβαίωση. Αντικαθιστά 1:1 το `alert()`.
 *
 * Τα σφάλματα μένουν περισσότερο από τις επιβεβαιώσεις: μια επιτυχία απλώς
 * καθησυχάζει, ενώ ένα σφάλμα πρέπει να προλάβει να διαβαστεί ολόκληρο.
 */
export function notify(text: string, opts: ToastOptions = {}) {
  const clean = String(text ?? '').trim();
  if (!clean) return;
  const tone = opts.tone ?? 'neutral';
  const item: ToastItem = {
    id: ++seq,
    text: clean,
    tone,
    duration: opts.duration ?? (tone === 'negative' ? 5000 : TOAST_MS),
    action: opts.action,
  };
  if (listener) listener(item); else pending.push(item);
}

/** Συντομογραφίες, ώστε ο τόνος να μη γράφεται λάθος στα σημεία κλήσης. */
export const notifyOk    = (text: string, opts?: ToastOptions) => notify(text, { ...opts, tone: 'positive' });
export const notifyError = (text: string, opts?: ToastOptions) => notify(text, { ...opts, tone: 'negative' });

/** Συνδέει τον host. Επιστρέφει συνάρτηση αποσύνδεσης. Μόνο για το Toast.tsx. */
export function subscribeToasts(fn: Listener): () => void {
  listener = fn;
  while (pending.length) fn(pending.shift()!);
  return () => { if (listener === fn) listener = null; };
}
