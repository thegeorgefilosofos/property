// ═══════════════════════════════════════════════════════════════════════════
// Ε2 — Αναλυτική Κατάσταση Μισθωμάτων Ακίνητης Περιουσίας (Πίνακας I).
// Καθαρή λογική (χωρίς I/O): ΜΙΑ γραμμή ανά ακίνητο. Καλείται από e2Export.ts.
// Σημασιολογία Ε2: το έντυπο υποβάλλεται ανά φορολογούμενο· κάθε συνιδιοκτήτης
// δηλώνει ΜΟΝΟ το ποσοστό του → «Ακαθάριστο Εισόδημα» = συνολικό μίσθωμα ×
// (ποσοστό/100). «Μήνες εκμίσθωσης» = τομή μισθωτηρίου με το φορολογικό έτος.
// Το ακαθάριστο είναι δεδουλευμένο (ανεξαρτήτως είσπραξης).
// ═══════════════════════════════════════════════════════════════════════════
export interface E2Property { id: string; atak: string | null; address: string | null; postal_code: string | null; ownership: string | number | null; prop_type: string | null; status_detail: string | null; target_rent: number | null; }
export interface E2Tenant { property_id: string; afm: string | null; monthly_rent: number | null; lease_start: string | null; lease_end: string | null; lease_type: string | null; }
export interface E2Payment { property_id: string; amount: number | null; period_year: number; period_month: number; }

// Είδος μίσθωσης (κωδικοί Ε2). Επιβεβαίωσε με το έντυπο του τρέχοντος έτους.
export const E2_LEASE_KIND: Record<string, { code: string; label: string }> = {
  rented: { code: '1', label: 'Εκμίσθωση' },
  seasonal: { code: '60', label: 'Βραχυχρόνια μίσθωση' },
  own_use: { code: '4', label: 'Ιδιοχρησιμοποίηση' },
  vacant: { code: '5', label: 'Κενό' },
};
export function e2LeaseKind(status: string | null): { code: string; label: string } {
  return E2_LEASE_KIND[status || ''] || { code: '', label: '' }; // renovation/for_sale/disputed → χειροκίνητο
}

// Κατηγορία ακαθάριστου εισοδήματος (Ε2 → Ε1). Auto-ταξινόμηση, ΕΚΤΙΜΩΜΕΝΟ.
// Label-forward επίτηδες: οι αριθμητικοί κωδικοί Ε2/Ε1 αλλάζουν ανά έτος.
export function e2IncomeCategory(propType: string | null, status: string | null): string {
  if (status === 'seasonal') return 'Βραχυχρόνια μίσθωση';
  switch (propType) {
    case 'apartment': case 'studio': case 'house': case 'villa': case 'maisonette': return 'Κατοικία';
    case 'office': case 'shop': case 'warehouse': return 'Επαγγελματική στέγη';
    case 'land': return 'Γη / Αγρός';
    case 'parking': case 'storage': return 'Βοηθητικός χώρος';
    default: return 'Ακίνητο';
  }
}

/** Μήνες του έτους που το ακίνητο ήταν μισθωμένο (τομή μισθωτηρίου με το έτος). */
export function monthsRentedInYear(leaseStart: string | null, leaseEnd: string | null, year: number, status: string | null): { months: number; estimated: boolean } {
  const missing = { months: (status === 'rented' || status === 'seasonal') ? 12 : 0, estimated: true };
  if (!leaseStart) return missing;
  const yStart = new Date(Date.UTC(year, 0, 1)); const yEnd = new Date(Date.UTC(year, 11, 31));
  const ls = new Date(leaseStart + 'T00:00:00Z');
  if (isNaN(ls.getTime())) return missing; // κατεστραμμένη ημερομηνία → αντιμετώπιση σαν να λείπει
  const le = leaseEnd ? new Date(leaseEnd + 'T00:00:00Z') : yEnd;
  const start = ls > yStart ? ls : yStart; const end = le < yEnd ? le : yEnd;
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return { months: 0, estimated: false };
  const m = (end.getUTCFullYear() * 12 + end.getUTCMonth()) - (start.getUTCFullYear() * 12 + start.getUTCMonth()) + 1;
  return { months: Math.max(0, Math.min(12, m)), estimated: false };
}

export interface E2Row { atak: string; address: string; ownerAfm: string; ownershipPct: number; leaseKind: string; months: number; incomeCategory: string; grossIncome: number; flags: string[]; }
export const E2_HEADERS = ['Α/Α', 'ΑΤΑΚ', 'Διεύθυνση Ακινήτου', 'ΑΦΜ Συνιδιοκτήτη', 'Ποσοστό Συνιδιοκτησίας (%)', 'Είδος Μίσθωσης', 'Μήνες Εκμίσθωσης', 'Κατηγορία Εισοδήματος', 'Ακαθάριστο Εισόδημα (€)'];

export function buildE2Row(p: E2Property, tenant: E2Tenant | null, payments: E2Payment[], ownerAfm: string, year: number): E2Row {
  const flags: string[] = [];
  const on = typeof p.ownership === 'string' ? parseFloat(p.ownership) : p.ownership;
  const ownershipPct = (on == null || isNaN(on as number)) ? 100 : (on as number);
  const kind = e2LeaseKind(p.status_detail);
  if (!kind.code) flags.push('Χρειάζεται χειροκίνητος καθορισμός είδους μίσθωσης');
  const mm = monthsRentedInYear(tenant?.lease_start ?? null, tenant?.lease_end ?? null, year, p.status_detail);
  if (mm.estimated && mm.months > 0) flags.push('Μήνες εκμίσθωσης: εκτίμηση');
  const yearRows = payments.filter(x => x.period_year === year);
  let grossFull: number; let grossEstimated = false;
  if (yearRows.length) { grossFull = yearRows.reduce((s, x) => s + (x.amount || 0), 0); }
  else { grossFull = (tenant?.monthly_rent ?? p.target_rent ?? 0) * mm.months; grossEstimated = true; }
  if (grossEstimated && grossFull > 0) flags.push('Ακαθάριστο εισόδημα: εκτίμηση (μηνιαίο × μήνες)');
  const grossIncome = Math.round(grossFull * ownershipPct / 100); // μερίδιο συνιδιοκτήτη
  const address = [p.address, p.postal_code].filter(Boolean).join(', ');
  if (!p.atak) flags.push('Λείπει ΑΤΑΚ');
  if (!ownerAfm) flags.push('Λείπει ΑΦΜ ιδιοκτήτη');
  if (ownershipPct < 100) flags.push('Συνιδιοκτησία < 100%: πρόσθεσε ΑΦΜ λοιπών συνιδιοκτητών');
  return { atak: p.atak || '', address, ownerAfm: ownerAfm || '', ownershipPct, leaseKind: kind.code ? `${kind.code} ${kind.label}` : '', months: mm.months, incomeCategory: e2IncomeCategory(p.prop_type, p.status_detail), grossIncome, flags };
}

export function e2RowToCells(r: E2Row, index: number): (string | number)[] {
  const dec = (n: number) => n.toFixed(2).replace('.', ',');
  return [index, r.atak, r.address, r.ownerAfm, dec(r.ownershipPct), r.leaseKind, r.months, r.incomeCategory, String(Math.round(r.grossIncome))];
}
