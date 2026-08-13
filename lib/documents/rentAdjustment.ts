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
  /** Το έτος του δείκτη. Μπαίνει στο κείμενο μόνο για τη μέθοδο 'cpi'. */
  cpiYear?: number;
}): string {
  const basis = o.method === 'cpi'
    ? `βάσει της μέσης ετήσιας μεταβολής του Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ)${o.cpiYear ? ` έτους ${o.cpiYear}` : ''}`
    : o.method === 'percent' ? 'σύμφωνα με τον όρο αναπροσαρμογής του μισθωτηρίου'
    : 'κατόπιν συμφωνίας των μερών';
  return `Προς τον/την μισθωτή${o.tenantName ? ` κ. ${o.tenantName}` : ''},\n\n`
    + `Σας γνωστοποιώ ότι, ${basis}, το μηνιαίο μίσθωμα του ακινήτου${o.address ? ` επί της οδού ${o.address}` : ''} `
    + `αναπροσαρμόζεται από ${o.effectiveDate}. Το ισχύον μίσθωμα ανέρχεται σε ${fe(o.res.currentRent)} και `
    + `το νέο μηνιαίο μίσθωμα διαμορφώνεται σε ${fe(o.res.newRent)} `
    + `(μεταβολή ${fp(o.res.pctApplied)}).\n\n`
    + `Παρακαλώ όπως καταβάλλετε το νέο μίσθωμα από την ανωτέρω ημερομηνία. Η παρούσα επέχει θέση έγγραφης ειδοποίησης.`;
}
