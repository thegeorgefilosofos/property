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
