// ═══════════════════════════════════════════════════════════════════════════
// Διαμοιρασμός δαπανών — καθαρή, δοκιμασμένη λογική για το «μερίδιό μου».
//
// Μια δαπάνη μπορεί να μοιράζεται με άλλο πρόσωπο (συνιδιοκτήτης, οικογένεια,
// γονείς, ή 50/50). Το πεδίο `paid_by` κρατά την ιδιότητα και το `share_percent`
// το ποσοστό του ιδιοκτήτη. Έντιμη λογιστική: το ΣΥΝΟΛΙΚΟ κόστος του ακινήτου
// παραμένει το πλήρες ποσό· εδώ υπολογίζουμε ΜΟΝΟ το μερίδιο του ιδιοκτήτη.
// ═══════════════════════════════════════════════════════════════════════════

// Επιλογές «Πληρώνει / Διαμοιρασμός» — κοινές για δαπάνες ΚΑΙ λογαριασμούς,
// ώστε το μοντέλο διαμοιρασμού να είναι ΕΝΑ σε όλη την εφαρμογή.
export const PAID_BY_OPTIONS = [
  { value: 'owner',    label: 'Μόνο εγώ'          },
  { value: 'co_owner', label: 'Με συνιδιοκτήτη'   },
  { value: 'tenant',   label: 'Ενοικιαστής'       },
  { value: 'family',   label: 'Με οικογένεια'     },
  { value: 'parents',  label: 'Με γονείς'         },
  { value: 'split',    label: 'Μοιρασμένο 50/50'  },
  { value: 'company',  label: 'Εταιρεία'          },
];

// Τιμές του `paid_by` που σημαίνουν διαμοιρασμό (εμφανίζουν ποσοστό + σημείωση).
export const SHARED_SCOPES = new Set(['co_owner', 'family', 'parents', 'split']);

// Προεπιλεγμένο ποσοστό ιδιοκτήτη όταν δεν έχει οριστεί ρητά.
export const DEFAULT_SHARE_PERCENT = 50;

export interface ShareableExpense {
  amount: number;
  paid_by: string | null;
  share_percent?: number | null;
}

// Το μερίδιο του ιδιοκτήτη σε μια δαπάνη:
//   • ενοικιαστής επιβαρύνεται πλήρως → 0
//   • μοιρασμένη → amount × ποσοστό/100 (προεπιλογή 50%, clamp 0–100)
//   • αλλιώς (μόνο εγώ / εταιρεία / κενό) → όλο το ποσό
export function ownerShareAmount(e: ShareableExpense): number {
  const amount = Number(e.amount) || 0;
  if (e.paid_by === 'tenant') return 0;
  if (SHARED_SCOPES.has(e.paid_by || '')) {
    const raw = e.share_percent != null ? e.share_percent : DEFAULT_SHARE_PERCENT;
    const pct = Math.max(0, Math.min(100, raw));
    return amount * pct / 100;
  }
  return amount;
}

// Είναι η δαπάνη μοιρασμένη;
export function isShared(paidBy: string | null | undefined): boolean {
  return SHARED_SCOPES.has(paidBy || '');
}

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΕΡΙΔΙΟ ΜΟΥ, ΜΕ ΤΟ ΠΟΣΟΣΤΟ ΙΔΙΟΚΤΗΣΙΑΣ ΑΠΟ ΠΑΝΩ
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΤΟ ΓΕΝΝΗΣΕ. Η καρτέλα Λογιστική δεν ζητούσε ΚΑΝ τη στήλη
// `ownership` από τη βάση. Ο συνιδιοκτήτης με 33,33% σε τρία κληρονομημένα
// διαμερίσματα έβλεπε τα ακαθάριστα, τις δαπάνες, τον φόρο και το «βάλε στην
// άκρη» ΟΛΟΚΛΗΡΟΥ του ακινήτου. Μετρημένο σε πραγματικό χαρτοφυλάκιο:
//
//     ακαθάριστα 37.200 € αντί για 21.199 €
//     φόρος       8.803 € αντί για  3.835 €
//     μηνιαία πρόβλεψη 733,58 € αντί για 319,57 €
//
// Πέντε χιλιάδες ευρώ φόρου που δεν οφείλονται και η οθόνη δεν έγραφε
// πουθενά ότι τα ποσά είναι στο 100%. Το Ε2 της ΙΔΙΑΣ εφαρμογής έκοβε σωστά
// στο μερίδιο (lib/billing/e2.ts), οπότε οι δύο οθόνες διαφωνούσαν.
//
// ── ΠΟΙΟΣ ΝΙΚΑΕΙ ΟΤΑΝ ΥΠΑΡΧΟΥΝ ΔΥΟ ΠΟΣΟΣΤΑ ─────────────────────────────
// Η ΡΗΤΗ ΔΗΛΩΣΗ ΤΗΣ ΔΑΠΑΝΗΣ. Οταν ο χρήστης έχει πει «αυτή τη δαπάνη την
// πλήρωσε ο ενοικιαστής» ή «τη μοιράστηκα 50/50 με την αδερφή μου», έχει
// απαντήσει ήδη στην ερώτηση για ΑΥΤΟ το ποσό και το ποσοστό του ακινήτου
// δεν έχει λόγο να μιλήσει δεύτερη φορά. Ο πολλαπλασιασμός των δύο θα
// έκοβε το ίδιο ποσό δύο φορές.
//
// Οταν δεν έχει πει τίποτα, ισχύει το ποσοστό του ακινήτου: μια δαπάνη
// κοινοχρήστων σε διαμέρισμα που κατέχω κατά το ένα τρίτο, με βαρύνει κατά
// το ένα τρίτο.
// ═══════════════════════════════════════════════════════════════════════════
export function ownerShareOf(e: ShareableExpense, ownershipPct: number | null | undefined): number {
  if (e.paid_by === 'tenant') return 0;
  if (SHARED_SCOPES.has(e.paid_by || '')) return ownerShareAmount(e);
  const raw = ownershipPct == null || !Number.isFinite(ownershipPct) ? 100 : ownershipPct;
  const pct = Math.max(0, Math.min(100, raw));
  return (Number(e.amount) || 0) * pct / 100;
}

/** Το μερίδιό μου σε ένα ποσό που ανήκει ΟΛΟΚΛΗΡΟ στο ακίνητο (ενοίκιο, ΕΝΦΙΑ). */
export function ownerShareOfAmount(amount: number, ownershipPct: number | null | undefined): number {
  const raw = ownershipPct == null || !Number.isFinite(ownershipPct) ? 100 : ownershipPct;
  const pct = Math.max(0, Math.min(100, raw));
  return (Number(amount) || 0) * pct / 100;
}
