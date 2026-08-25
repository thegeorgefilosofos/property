import { fe, fp } from '../core/format';
// ═══════════════════════════════════════════════════════════════════════════
// rentAdjustment — Καθαρός υπολογισμός αναπροσαρμογής μισθώματος (νομικό έγγραφο).
// Μέθοδοι: ποσοστό (συμφωνημένο), ΔΤΚ/πληθωρισμός (ΕΛΣΤΑΤ), ή χειροκίνητο νέο ποσό.
// ═══════════════════════════════════════════════════════════════════════════

export type AdjMethod = 'percent' | 'cpi' | 'manual';

export interface AdjInput {
  currentRent: number;
  method: AdjMethod;
  percent?: number;        // για 'percent'
  cpiPct?: number;         // για 'cpi' (μεταβολή ΔΤΚ)
  newRentManual?: number;  // για 'manual'
}

export interface AdjResult {
  currentRent: number;
  newRent: number;
  increase: number;
  pctApplied: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function computeRentAdjustment(i: AdjInput): AdjResult {
  const cur = r2(i.currentRent);
  let newRent = cur, pct = 0;
  if (i.method === 'manual') {
    newRent = r2(i.newRentManual || 0);
    pct = cur > 0 ? r2((newRent / cur - 1) * 100) : 0;
  } else {
    pct = i.method === 'cpi' ? (Number(i.cpiPct) || 0) : (Number(i.percent) || 0);
    newRent = r2(cur * (1 + pct / 100));
  }
  return { currentRent: cur, newRent, increase: r2(newRent - cur), pctApplied: pct };
}

// Κείμενο νομικής ειδοποίησης (καθαρό, τυποποιημένο).
//
// Ο ΔΕΙΚΤΗΣ ΧΩΡΙΣ ΕΤΟΣ ΔΕΝ ΕΙΝΑΙ ΔΕΙΚΤΗΣ. Το κείμενο έλεγε «βάσει της μεταβολής
// του Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ)» και σταματούσε εκεί: ο μισθωτής έπαιρνε
// υπογεγραμμένο έγγραφο με ένα ποσοστό και καμία ένδειξη ΠΟΙΑΣ περιόδου είναι,
// άρα κανέναν τρόπο να το ελέγξει. Η ΕΛΣΤΑΤ ανακοινώνει μεταβολή κάθε μήνα και
// μέση ετήσια κάθε χρόνο· χωρίς το έτος, το νούμερο δεν επαληθεύεται.
export function adjustmentNoticeText(o: {
  tenantName?: string; address?: string; effectiveDate: string; method: AdjMethod; res: AdjResult;
  /** Το δωδεκάμηνο του δείκτη, π.χ. «Ιουλίου 2025 ώς Ιουνίου 2026». Μόνο για 'cpi'. */
  cpiPeriod?: string;
  /** Η σύμβαση προβλέπει το 75% της μεταβολής (τυπικό σε επαγγελματική μίσθωση). */
  cpiShare75?: boolean;
}): string {
  // Η ΒΑΣΗ ΓΡΑΦΕΤΑΙ ΟΛΟΚΛΗΡΗ: ΜΕΤΡΟ, ΠΕΡΙΟΔΟΣ, ΚΑΙ ΑΝ ΕΦΑΡΜΟΣΤΗΚΕ ΤΟ 75%.
  // Ο μισθωτής παίρνει υπογεγραμμένο έγγραφο με ένα ποσοστό· χωρίς αυτά τα τρία
  // δεν έχει κανέναν τρόπο να το επαληθεύσει στην ΕΛΣΤΑΤ και δύο διαφορετικές
  // βάσεις δίνουν δύο διαφορετικά νούμερα από τον ΙΔΙΟ δείκτη.
  const basis = o.method === 'cpi'
    ? `βάσει ${o.cpiShare75 ? 'του 75% ' : ''}της δωδεκάμηνης μεταβολής του Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ)${o.cpiPeriod ? `, ${o.cpiPeriod}` : ''}`
    : o.method === 'percent' ? 'σύμφωνα με τον όρο αναπροσαρμογής του μισθωτηρίου'
    : 'κατόπιν συμφωνίας των μερών';
  return `Προς τον/την μισθωτή${o.tenantName ? ` κ. ${o.tenantName}` : ''},\n\n`
    + `Σας γνωστοποιώ ότι, ${basis}, το μηνιαίο μίσθωμα του ακινήτου${o.address ? ` επί της οδού ${o.address}` : ''} `
    + `αναπροσαρμόζεται από ${o.effectiveDate}. Το ισχύον μίσθωμα ανέρχεται σε ${fe(o.res.currentRent)} και `
    + `το νέο μηνιαίο μίσθωμα διαμορφώνεται σε ${fe(o.res.newRent)} `
    + `(μεταβολή ${fp(o.res.pctApplied)}).\n\n`
    + `Παρακαλώ όπως καταβάλλετε το νέο μίσθωμα από την ανωτέρω ημερομηνία. Η παρούσα επέχει θέση έγγραφης ειδοποίησης.`;
}
