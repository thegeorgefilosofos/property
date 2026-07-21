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
export function adjustmentNoticeText(o: {
  tenantName?: string; address?: string; effectiveDate: string; method: AdjMethod; res: AdjResult;
}): string {
  const basis = o.method === 'cpi' ? 'βάσει της μεταβολής του Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ)'
    : o.method === 'percent' ? 'σύμφωνα με τον όρο αναπροσαρμογής του μισθωτηρίου'
    : 'κατόπιν συμφωνίας των μερών';
  return `Προς τον/την μισθωτή${o.tenantName ? ` κ. ${o.tenantName}` : ''},\n\n`
    + `Σας γνωστοποιώ ότι, ${basis}, το μηνιαίο μίσθωμα του ακινήτου${o.address ? ` επί της οδού ${o.address}` : ''} `
    + `αναπροσαρμόζεται από ${o.effectiveDate}. Το ισχύον μίσθωμα ανέρχεται σε ${o.res.currentRent.toLocaleString('el-GR', { minimumFractionDigits: 2 })} € και `
    + `το νέο μηνιαίο μίσθωμα διαμορφώνεται σε ${o.res.newRent.toLocaleString('el-GR', { minimumFractionDigits: 2 })} € `
    + `(μεταβολή ${o.res.pctApplied.toLocaleString('el-GR', { maximumFractionDigits: 2 })}%).\n\n`
    + `Παρακαλώ όπως καταβάλλετε το νέο μίσθωμα από την ανωτέρω ημερομηνία. Η παρούσα επέχει θέση έγγραφης ειδοποίησης.`;
}
