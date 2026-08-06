// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΟΣΟ ΜΙΑΣ ΔΙΑΜΟΝΗΣ — ΜΙΑ ΦΟΡΑ, ΜΕ ΟΝΟΜΑ ΠΟΥ ΛΕΕΙ ΤΗΝ ΑΛΗΘΕΙΑ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Το `client_stays.total` γραφόταν ως **payout** (ο
// εισαγωγέας email ζητούσε ρητά «το ποσό που εισπράττει ο οικοδεσπότης») και
// διαβαζόταν ως **grossRevenue** (lib/tax/shortTermTax.ts), πάνω στο οποίο
// υπολογιζόταν ο φόρος — ενώ ο φάκελος του λογιστή έλεγε στον χρήστη «δήλωσε τα
// ΑΚΑΘΑΡΙΣΤΑ». Το ίδιο πεδίο, δύο ονόματα, ~15% απόκλιση στη βάση κάθε
// φορολογικού νούμερου της βραχυχρόνιας.
//
// ΟΙ ΤΡΕΙΣ ΑΡΙΘΜΟΙ ΠΟΥ ΔΕΝ ΕΙΝΑΙ Ο ΙΔΙΟΣ ΑΡΙΘΜΟΣ:
//
//   τι πλήρωσε ο επισκέπτης      gross_guest_paid
//   − τέλος ανθεκτικότητας       climate_levy      ΔΕΝ είναι έσοδό σου
//   ─────────────────────────────────────────────
//   = ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ         αυτό πάει στο Ε2 και στη φορολογική κλίμακα
//   − προμήθεια πλατφόρμας       platform_fee      ΔΑΠΑΝΗ, όχι μείωση εσόδου
//   ─────────────────────────────────────────────
//   = PAYOUT                     αυτό μπαίνει στον λογαριασμό σου
//
// Η προμήθεια αφαιρείται ΜΕΤΑ το ακαθάριστο επίτηδες: εκπίπτει ως δαπάνη, δεν
// μειώνει το δηλωτέο έσοδο. Όποιος δηλώσει payout ως έσοδο δηλώνει λιγότερα.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ `unknown`. Τα υπάρχοντα `total` δεν ξέρουμε αν είναι ακαθάριστα
// ή payout, και δεν μαντεύουμε πάνω σε φορολογικό δεδομένο. Άρα κάθε ιστορική
// γραμμή είναι ΡΗΤΑ απροσδιόριστη, μετριέται χωριστά, και το UI ζητά
// επιβεβαίωση στην πρώτη επόμενη επεξεργασία. Καμία σιωπηλή παραδοχή.
// ═══════════════════════════════════════════════════════════════════════════
import { stayTotal, type StayLike } from './clients';

/** Τι σημαίνει το `total` μιας γραμμής. Δες το migration 20260730091000. */
export type AmountBasis = 'unknown' | 'gross' | 'payout';
export const AMOUNT_BASES: AmountBasis[] = ['unknown', 'gross', 'payout'];
export const AMOUNT_BASIS_LABELS: Record<AmountBasis, string> = {
  unknown: 'Απροσδιόριστο',
  gross: 'Ακαθάριστο (τι πλήρωσε ο επισκέπτης)',
  payout: 'Καθαρή είσπραξη (τι εισέπραξες)',
};

export interface StayAmountLike extends StayLike {
  gross_guest_paid?: number | null;
  platform_fee?: number | null;
  climate_levy?: number | null;
  amount_basis?: string | null;
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const pos = (v: number | null | undefined): number | null =>
  typeof v === 'number' && isFinite(v) && v > 0 ? v : null;

/** Έχει η διαμονή ρητή ανάλυση ποσού (νέο μοντέλο) ή είναι ιστορικό `total`; */
export function hasBreakdown(s: StayAmountLike): boolean {
  return pos(s.gross_guest_paid) != null;
}

export function amountBasis(s: StayAmountLike): AmountBasis {
  if (hasBreakdown(s)) return 'gross';
  const b = (s.amount_basis || '').trim();
  return b === 'gross' || b === 'payout' ? b : 'unknown';
}

/** Τι πλήρωσε συνολικά ο επισκέπτης (με το τέλος ανθεκτικότητας μέσα). */
export function guestPaid(s: StayAmountLike): number | null {
  if (hasBreakdown(s)) return n(s.gross_guest_paid);
  // Χωρίς ανάλυση δεν μπορούμε να ανασυνθέσουμε τι πλήρωσε ο επισκέπτης: το
  // τέλος και η προμήθεια είναι άγνωστα. Καμία αναγωγή.
  return null;
}

/** Τέλος ανθεκτικότητας που εισπράχθηκε. ΔΕΝ είναι έσοδο του ιδιοκτήτη. */
export const collectedLevy = (s: StayAmountLike): number => Math.max(0, n(s.climate_levy));

/** Προμήθεια πλατφόρμας. ΔΑΠΑΝΗ — δεν μειώνει το δηλωτέο έσοδο. */
export const platformFee = (s: StayAmountLike): number => Math.max(0, n(s.platform_fee));

/**
 * ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ: τι πλήρωσε ο επισκέπτης μείον το τέλος ανθεκτικότητας.
 * `null` όταν το ποσό είναι απροσδιόριστο — ο καλών πρέπει να το αντιμετωπίσει
 * ρητά, δεν του δίνουμε έναν αριθμό που μοιάζει βέβαιος.
 */
export function declarableGross(s: StayAmountLike): number | null {
  if (hasBreakdown(s)) return Math.max(0, n(s.gross_guest_paid) - collectedLevy(s));
  if (amountBasis(s) === 'gross') return stayTotal(s);
  return null;
}

/**
 * Το ίδιο, με ρητή υποχώρηση στο ιστορικό `total` όταν η βάση είναι άγνωστη.
 * Χρησιμοποιείται ΜΟΝΟ σε συγκεντρωτικά που δείχνουν παράλληλα πόσες γραμμές
 * είναι απροσδιόριστες (δες `sumStayAmounts`). Ποτέ μόνο του σε φορολογικό
 * νούμερο χωρίς την προειδοποίηση.
 */
export const declarableGrossOrTotal = (s: StayAmountLike): number => declarableGross(s) ?? stayTotal(s);

/** PAYOUT: τι μπαίνει στον λογαριασμό σου. */
export function hostPayout(s: StayAmountLike): number | null {
  if (hasBreakdown(s)) return Math.max(0, n(s.gross_guest_paid) - collectedLevy(s) - platformFee(s));
  if (amountBasis(s) === 'payout') return stayTotal(s);
  return null;
}

/** Χρειάζεται η διαμονή επιβεβαίωση ποσού (ιστορική, απροσδιόριστη βάση)? */
export function needsAmountReview(s: StayAmountLike): boolean {
  return amountBasis(s) === 'unknown' && stayTotal(s) > 0;
}

/** Δηλώθηκε η διαμονή στο myAADE; */
export const isDeclared = (s: { declared_at?: string | null }): boolean => !!(s.declared_at || '').trim();

export interface StayAmountTotals {
  /** Δηλωτέο ακαθάριστο (χωρίς το τέλος ανθεκτικότητας). */
  declarableGross: number;
  /** Πόσο από το παραπάνω προέρχεται από γραμμές με ΡΗΤΗ ανάλυση. */
  confirmedGross: number;
  /** Πόσο προέρχεται από ιστορικές γραμμές απροσδιόριστης βάσης. */
  unresolvedAmount: number;
  unresolvedCount: number;
  platformFees: number;
  climateLevy: number;
  count: number;
}

/** Συγκεντρωτικά ποσά ενός συνόλου διαμονών, με τη ρητή αβεβαιότητα ξεχωριστά. */
export function sumStayAmounts(stays: StayAmountLike[]): StayAmountTotals {
  const out: StayAmountTotals = {
    declarableGross: 0, confirmedGross: 0, unresolvedAmount: 0, unresolvedCount: 0,
    platformFees: 0, climateLevy: 0, count: stays.length,
  };
  for (const s of stays) {
    const g = declarableGross(s);
    if (g != null) { out.declarableGross += g; out.confirmedGross += g; }
    else {
      const t = stayTotal(s);
      out.declarableGross += t;
      out.unresolvedAmount += t;
      if (t > 0) out.unresolvedCount++;
    }
    out.platformFees += platformFee(s);
    out.climateLevy += collectedLevy(s);
  }
  return out;
}

/**
 * Μέσο ποσοστό προμήθειας ΑΠΟ ΤΑ ΔΙΚΑ ΤΟΥ ΔΕΔΟΜΕΝΑ (Σ προμήθειες / Σ ακαθάριστα).
 * `null` όταν δεν υπάρχει καμία καταγεγραμμένη προμήθεια — τότε η οθόνη λέει
 * «δεν την ξέρουμε» αντί να βάλει το επινοημένο 15% που υπήρχε ως προεπιλογή.
 */
export function platformFeeRate(stays: StayAmountLike[]): number | null {
  let fee = 0, gross = 0;
  for (const s of stays) {
    if (!hasBreakdown(s)) continue;
    const f = platformFee(s);
    if (f <= 0) continue;
    fee += f; gross += n(s.gross_guest_paid);
  }
  return gross > 0 ? fee / gross : null;
}
