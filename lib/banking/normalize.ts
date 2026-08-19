// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟ ΚΙΝΗΣΗ ΠΑΡΟΧΟΥ ΣΕ ΓΡΑΜΜΗ ΠΟΥ ΞΕΡΕΙ ΗΔΗ Η ΕΦΑΡΜΟΓΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο,τι κάνει την τραπεζική κίνηση χρήσιμη — ταίριασμα με αναμενόμενο ενοίκιο,
// πρόταση δαπάνης, απο-διπλασιασμός — υπάρχει ήδη και δουλεύει για το CSV
// (lib/accounting/bankImport.ts). Το open banking ΔΕΝ φέρνει νέα λογιστική:
// φέρνει τις ίδιες γραμμές χωρίς να τις κατεβάσει ο χρήστης με το χέρι.
//
// Γι' αυτό εδώ δεν γράφεται δεύτερη μηχανή. Γράφεται μία μετάφραση.
//
// ΤΟ ΑΠΟΤΥΠΩΜΑ ΕΙΝΑΙ ΑΛΛΟ, ΚΑΙ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ. Το CSV χτίζει κλειδί από
// ημερομηνία + ποσό + κείμενο + ΣΕΙΡΑ μέσα στο αρχείο, γιατί δύο πανομοιότυπες
// γραμμές δεν ξεχωρίζουν αλλιώς. Το API δίνει σταθερό αναγνωριστικό ανά
// κίνηση. Αν χρησιμοποιούσαμε το σχήμα του CSV:
//
//   • ο δεύτερος συγχρονισμός θα ξανάγραφε ΚΑΘΕ κίνηση (η «σειρά» αλλάζει),
//   • και μια κίνηση που ήρθε ΚΑΙ από CSV ΚΑΙ από API θα μετρούσε δύο φορές.
//
// Τα δύο σχήματα έχουν ρητά διαφορετικό πρόθεμα ώστε να μη συγκρούονται ποτέ,
// και το πρόθεμα του API περιέχει τον πάροχο: αλλαγή παρόχου δίνει άλλα
// αναγνωριστικά, και δεν επιτρέπεται να περάσουν ως οι ίδιες κινήσεις.
//
// ΤΟ ΝΟΜΙΣΜΑ ΕΛΕΓΧΕΤΑΙ, ΔΕΝ ΥΠΟΤΙΘΕΤΑΙ. Ενας λογαριασμός σε ξένο νόμισμα θα
// έγραφε ποσά που το βιβλίο θα διάβαζε ως ευρώ. Δεν μετατρέπουμε — απορρίπτουμε
// και το λέμε, γιατί η ισοτιμία της ημέρας δεν είναι λογιστικό δεδομένο που
// μπορούμε να εφεύρουμε.
// ═══════════════════════════════════════════════════════════════════════════

import type { AisProviderId, ProviderTxn } from './types';

/** Το βιβλίο τηρείται σε ευρώ. */
export const BOOK_CURRENCY = 'EUR';

/** Εκδοση σχήματος αποτυπώματος API. Αλλάζει ΜΟΝΟ αν αλλάξει ο κανόνας. */
const API_KEY_VERSION = 'ob1';

/** Το αποτύπωμα μιας κίνησης που ήρθε από API. Σταθερό ανά κίνηση, για πάντα. */
export function apiDedupKey(provider: AisProviderId, connectionId: string, providerTxnId: string): string {
  return `${API_KEY_VERSION}|${provider}|${connectionId}|${providerTxnId}`;
}

export interface NormalizedTxn {
  date: string;
  description: string;
  amount: number;
  dedupHash: string;
}

export interface NormalizeResult {
  rows: NormalizedTxn[];
  /** Οσες απορρίφθηκαν, ανά λόγο. Καμία δεν πέφτει σιωπηλά. */
  rejected: { reason: 'currency' | 'date' | 'amount' | 'id'; count: number }[];
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Το κείμενο που βλέπει ο χρήστης: περιγραφή, και ο αντισυμβαλλόμενος αν λείπει. */
function lineText(t: ProviderTxn): string {
  const d = (t.description || '').trim();
  const c = (t.counterparty || '').trim();
  if (d && c && !d.includes(c)) return `${d} · ${c}`;
  return d || c || 'Κίνηση χωρίς περιγραφή';
}

export function normalizeTxns(
  txns: readonly ProviderTxn[],
  provider: AisProviderId,
  connectionId: string,
): NormalizeResult {
  const rows: NormalizedTxn[] = [];
  const counts: Record<string, number> = {};
  const reject = (r: string) => { counts[r] = (counts[r] || 0) + 1; };
  // Ο ΙΔΙΟΣ ΠΑΡΟΧΟΣ ΜΠΟΡΕΙ ΝΑ ΣΤΕΙΛΕΙ ΤΗΝ ΙΔΙΑ ΚΙΝΗΣΗ ΔΥΟ ΦΟΡΕΣ ΣΕ ΜΙΑ
  // ΑΠΑΝΤΗΣΗ (επικαλυπτόμενες σελίδες). Το κρατάμε εδώ, ώστε να μη στηριζόμαστε
  // μόνο στο μοναδικό ευρετήριο της βάσης για κάτι που ξέρουμε ήδη.
  const seen = new Set<string>();

  for (const t of txns) {
    const id = (t.providerTxnId || '').trim();
    if (!id) { reject('id'); continue; }
    if ((t.currency || '').toUpperCase() !== BOOK_CURRENCY) { reject('currency'); continue; }
    if (!ISO_DAY.test(t.date || '')) { reject('date'); continue; }
    const amount = typeof t.amount === 'number' ? t.amount : NaN;
    if (!Number.isFinite(amount) || amount === 0) { reject('amount'); continue; }

    const dedupHash = apiDedupKey(provider, connectionId, id);
    if (seen.has(dedupHash)) continue;
    seen.add(dedupHash);
    rows.push({ date: t.date, description: lineText(t), amount, dedupHash });
  }

  const order: NormalizeResult['rejected'][number]['reason'][] = ['currency', 'date', 'amount', 'id'];
  return {
    rows,
    rejected: order.filter(r => counts[r] > 0).map(r => ({ reason: r, count: counts[r] })),
  };
}

/** Η μία διατύπωση για ό,τι δεν πέρασε. Κενή όταν πέρασαν όλες. */
export function rejectionNote(res: NormalizeResult): string {
  if (!res.rejected.length) return '';
  const label: Record<string, string> = {
    currency: 'σε άλλο νόμισμα',
    date: 'χωρίς αναγνωρίσιμη ημερομηνία',
    amount: 'χωρίς ποσό',
    id: 'χωρίς αναγνωριστικό',
  };
  const parts = res.rejected.map(r => `${r.count} ${label[r.reason]}`);
  return `Δεν εισήχθησαν: ${parts.join(', ')}. Οι κινήσεις σε ξένο νόμισμα δεν μετατρέπονται: η ισοτιμία της ημέρας δεν είναι δικό μας δεδομένο.`;
}
