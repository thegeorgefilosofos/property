// ═══════════════════════════════════════════════════════════════════════════
// Ε2 — Αναλυτική Κατάσταση Μισθωμάτων Ακίνητης Περιουσίας (Πίνακας I).
// Καθαρή λογική (χωρίς I/O): ΜΙΑ γραμμή ανά ακίνητο. Καλείται από e2Export.ts.
// Σημασιολογία Ε2: το έντυπο υποβάλλεται ανά φορολογούμενο· κάθε συνιδιοκτήτης
// δηλώνει ΜΟΝΟ το ποσοστό του → «Ακαθάριστο Εισόδημα» = συνολικό μίσθωμα ×
// (ποσοστό/100). «Μήνες εκμίσθωσης» = τομή μισθωτηρίου με το φορολογικό έτος.
// Το ακαθάριστο είναι δεδουλευμένο (ανεξαρτήτως είσπραξης).
// ═══════════════════════════════════════════════════════════════════════════
export interface E2Property { id: string; atak: string | null; address: string | null; postal_code: string | null; ownership: string | number | null; prop_type: string | null; status_detail: string | null; target_rent: number | null; sqm?: number | null; floor?: string | number | null; }
export interface E2Tenant { property_id: string; afm: string | null; monthly_rent: number | null; lease_start: string | null; lease_end: string | null; lease_type: string | null; full_name?: string | null; }
export interface E2Payment { property_id: string; amount: number | null; period_year: number; period_month: number; }

// Είδος μίσθωσης (κωδικοί Ε2). Επιβεβαίωσε με το έντυπο του τρέχοντος έτους.
export const E2_LEASE_KIND: Record<string, { code: string; label: string }> = {
  rented: { code: '1', label: 'Εκμίσθωση' },
  seasonal: { code: '60', label: 'Βραχυχρόνια μίσθωση' },  // στήλη 17 Ε2: επιβεβαιωμένος
  own_use: { code: '17', label: 'Ιδιοχρησιμοποίηση' },
  vacant: { code: '39', label: 'Κενό (μη μισθωμένο)' },   // στήλη 17 Ε2: επιβεβαιωμένος
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

// ── Σύνοψη Ε1 (Πίνακας 4Δ1) — άθροισμα ακαθάριστου εισοδήματος ανά κωδικό ─────
// Το Ε2 τροφοδοτεί το Ε1: τα ακαθάριστα ανά κατηγορία μεταφέρονται σε συγκεκριμένους
// κωδικούς. Οι ΑΡΙΘΜΗΤΙΚΟΙ κωδικοί είναι ΕΝΔΕΙΚΤΙΚΟΙ (αλλάζουν ανά έτος) — επιβεβαίωσε
// στο έντυπο του τρέχοντος έτους στο myAADE.
// Ισχύον Ε1 (Πίνακας 4Δ2): 103/104 κατοικίες, 105/106 επαγγελματική στέγη,
// 109/110 γαίες/γήπεδα. Η βραχυχρόνια δηλώνεται στο Ε2 (κωδ. 60) και μεταφέρεται
// στους κωδικούς εισοδήματος ακινήτων ανά τύπο (κατοικία → 103).
export const E1_CODE_MAP: Record<string, { code: string; label: string }> = {
  'Κατοικία': { code: '103', label: 'Ακαθάριστο εισόδημα από εκμίσθωση κατοικιών' },
  'Βραχυχρόνια μίσθωση': { code: '103', label: 'Εισόδημα βραχυχρόνιας μίσθωσης (μεταφορά από Ε2, ανά τύπο ακινήτου)' },
  'Επαγγελματική στέγη': { code: '105', label: 'Ακαθάριστο εισόδημα από εκμίσθωση επαγγελματικής στέγης' },
  'Γη / Αγρός': { code: '109', label: 'Ακαθάριστο εισόδημα από εκμίσθωση γαιών / γηπέδων' },
  'Βοηθητικός χώρος': { code: '103', label: 'Ακαθάριστο εισόδημα από εκμίσθωση κατοικιών (βοηθητικοί χώροι)' },
  'Ακίνητο': { code: '103', label: 'Ακαθάριστο εισόδημα από ακίνητα (επιβεβαίωσε τον κωδικό ανά τύπο)' },
}

export interface E1CodeLine { code: string; label: string; category: string; amount: number }
export interface E1Summary { lines: E1CodeLine[]; totalGross: number; note: string }

/** Ομαδοποιεί τα Ε2 ακαθάριστα εισοδήματα στους κωδικούς του Ε1 (Πίνακας 4Δ1). */
export function buildE1Summary(rows: E2Row[]): E1Summary {
  const byCode = new Map<string, E1CodeLine>()
  for (const r of rows) {
    if (!(r.grossIncome > 0)) continue
    const map = E1_CODE_MAP[r.incomeCategory] || E1_CODE_MAP['Ακίνητο']
    const key = map.code + '|' + r.incomeCategory
    const existing = byCode.get(key)
    if (existing) existing.amount += r.grossIncome
    else byCode.set(key, { code: map.code, label: map.label, category: r.incomeCategory, amount: r.grossIncome })
  }
  const lines = [...byCode.values()].map(l => ({ ...l, amount: Math.round(l.amount) })).sort((a, b) => b.amount - a.amount)
  const totalGross = lines.reduce((s, l) => s + l.amount, 0)
  return { lines, totalGross, note: 'Οι κωδικοί Ε1 είναι ενδεικτικοί — επιβεβαίωσε στο έντυπο του τρέχοντος έτους (myAADE).' }
}

export const E1_HEADERS = ['Κωδικός Ε1', 'Περιγραφή', 'Κατηγορία', 'Ακαθάριστο Εισόδημα']
export function e1LineToCells(l: E1CodeLine): (string | number)[] {
  return [l.code, l.label, l.category, String(Math.round(l.amount))]
}

// ═══════════════════════════════════════════════════════════════════════════
// Ε2 — πλήρης δομή επίσημου εντύπου (Πίνακας I), για προσυμπληρωμένο Excel που
// αντιγράφεται στο myAADE. Οι στήλες ακολουθούν την επίσημη αρίθμηση της ΑΑΔΕ.
// ═══════════════════════════════════════════════════════════════════════════
const E2_CATEGORY: Record<string, string> = {
  apartment: 'Διαμέρισμα', studio: 'Διαμέρισμα (studio)', house: 'Μονοκατοικία', villa: 'Μονοκατοικία',
  maisonette: 'Μεζονέτα', office: 'Γραφείο', shop: 'Κατάστημα', warehouse: 'Αποθήκη',
  land: 'Γη / Αγρός', parking: 'Χώρος στάθμευσης', storage: 'Αποθήκη', other: '',
};
export function e2CategoryLabel(propType: string | null): string { return E2_CATEGORY[propType || ''] || ''; }

/** Διάστημα μίσθωσης εντός του έτους (στήλες 8/9), ως «ΗΗ/ΜΜ/ΕΕΕΕ». */
export function leaseWindowInYear(leaseStart: string | null, leaseEnd: string | null, year: number, status: string | null): { from: string; to: string } {
  const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const yStart = new Date(Date.UTC(year, 0, 1)), yEnd = new Date(Date.UTC(year, 11, 31));
  const full = (status === 'rented' || status === 'seasonal');
  if (!leaseStart) return full ? { from: fmt(yStart), to: fmt(yEnd) } : { from: '', to: '' };
  const ls = new Date(leaseStart + 'T00:00:00Z');
  if (isNaN(ls.getTime())) return full ? { from: fmt(yStart), to: fmt(yEnd) } : { from: '', to: '' };
  const le = leaseEnd ? new Date(leaseEnd + 'T00:00:00Z') : yEnd;
  const start = ls > yStart ? ls : yStart, end = le < yEnd ? le : yEnd;
  if (isNaN(end.getTime()) || end < start) return { from: '', to: '' };
  return { from: fmt(start), to: fmt(end) };
}

// Επικεφαλίδες πίνακα I με την επίσημη αρίθμηση στηλών (για αντιστοίχιση στο myAADE).
export const E2_OFFICIAL_HEADERS = [
  'α/α',
  'Τοποθεσία — Οδός/Αριθ./Πόλη/Τ.Κ. (στ. 2)',
  'Θέση — όροφος (στ. 3)',
  'Κατηγορία ακινήτου (στ. 4)',
  'Επιφάνεια τ.μ. (στ. 5)',
  'Είδος μίσθωσης / χρήση (στ. 17)',
  'Αρ. παροχής ρεύματος (στ. 18)',
  'Ενοικιαστής — Ονοματεπώνυμο/Επωνυμία (στ. 6)',
  'ΑΦΜ ενοικιαστή (στ. 7)',
  'Αρ. δήλωσης μίσθωσης (στ. 19)',
  'Έναρξη μίσθωσης (στ. 8)',
  'Λήξη μίσθωσης (στ. 9)',
  'Μήνες (στ. 10)',
  'Μηνιαίο μίσθωμα € (στ. 11)',
  'Ποσοστό συνιδ/σίας % (στ. 12)',
  'Ακαθάριστο: Εκμίσθωση € (στ. 13)',
  'Ακαθάριστο: Δωρεάν παραχώρηση € (στ. 14)',
  'Ακαθάριστο: Ιδιοχρησιμοποίηση € (στ. 15)',
  'Ακαθάριστο: Ανείσπρακτα € (στ. 16)',
];
// Ποιες στήλες (0-based) είναι αριθμητικές, για μορφοποίηση/άθροισμα.
export const E2_NUM_COLS = { sqm: 4, months: 12, monthly: 13, pct: 14, gross13: 15, gross14: 16, gross15: 17, gross16: 18 };

/** Μία γραμμή πίνακα I με τις επίσημες στήλες, από τα δεδομένα του χρήστη. */
export function buildE2OfficialCells(p: E2Property, tenant: E2Tenant | null, payments: E2Payment[], ownerAfm: string, year: number, index: number): (string | number)[] {
  const base = buildE2Row(p, tenant, payments, ownerAfm, year); // επαναχρησιμοποίηση: μήνες, ποσοστό, ακαθάριστο μεριδίου
  const win = leaseWindowInYear(tenant?.lease_start ?? null, tenant?.lease_end ?? null, year, p.status_detail);
  const kind = e2LeaseKind(p.status_detail);
  const monthly = tenant?.monthly_rent ?? p.target_rent ?? 0;
  const rentLike = p.status_detail === 'rented' || p.status_detail === 'seasonal';
  const ownUse = p.status_detail === 'own_use';
  const g = base.grossIncome;
  const loc = [p.address, p.postal_code].filter(Boolean).join(', ');
  return [
    index,
    loc,
    p.floor != null && p.floor !== '' ? String(p.floor) : '',
    e2CategoryLabel(p.prop_type),
    p.sqm != null ? p.sqm : '',
    kind.code ? `${kind.code} · ${kind.label}` : '',
    '',                                   // στ.18 αρ. παροχής ρεύματος — δεν αντλείται
    tenant?.full_name || '',
    tenant?.afm || '',
    '',                                   // στ.19 αρ. δήλωσης μίσθωσης — δεν αντλείται
    win.from,
    win.to,
    base.months || '',
    monthly ? Number(monthly) : '',
    base.ownershipPct,
    rentLike && g > 0 ? g : '',           // στ.13 εκμίσθωση
    '',                                   // στ.14 δωρεάν παραχώρηση
    ownUse && g > 0 ? g : '',             // στ.15 ιδιοχρησιμοποίηση
    '',                                   // στ.16 ανείσπρακτα
  ];
}

// Οδηγίες συμπλήρωσης εντύπου Ε2 (σύμφωνα με την επίσημη περίληψη της ΑΑΔΕ).
export const E2_INSTRUCTIONS = [
  '1. Υπόχρεος για τα εισοδήματα από ακίνητη περιουσία είναι ο ιδιοκτήτης, ο νομέας, ο επικαρπωτής ή εκείνος που έχει δικαίωμα οίκησης με οριστικό συμβόλαιο, δικαστική απόφαση ή χρησικτησία, καθώς και όποιος αποκτά εισόδημα από εκμίσθωση, υπεκμίσθωση, δωρεάν παραχώρηση ή ιδιοχρησιμοποίηση.',
  '2. Καταχωρούνται όλα τα οικοδομημένα ακίνητα κάθε υπόχρεου (ακόμη και όσα δεν απέφεραν εισόδημα) και τα μη οικοδομημένα που απέφεραν εισόδημα. Ακίνητο που παρέμεινε κενό όλο το έτος δηλώνεται με την ένδειξη «ΚΕΝΟ».',
  '3. Υποβάλλεται χωριστό Ε2 για κάθε σύζυγο/μέρος συμφώνου συμβίωσης, ακόμη και αν το ακίνητο είναι κοινό. Το εισόδημα ανήλικων τέκνων δηλώνεται στο Ε2 του γονέα που έχει τη γονική μέριμνα.',
  '4. Τα νομικά πρόσωπα και οι νομικές οντότητες συνυποβάλλουν το Ε2 μαζί με τη δήλωση φορολογίας εισοδήματός τους.',
  '5. Σε συνιδιοκτησία, στη στήλη «Ακαθάριστο Εισόδημα» γράφεται μόνο το ποσό που αναλογεί στον υπόχρεο βάσει του ποσοστού συνιδιοκτησίας (στήλη 12).',
  '6. Η στήλη 1 (α/α) αριθμεί με αύξουσα σειρά τις εγγραφές. Στη στήλη 4 συμπληρώνεται η κατηγορία του ακινήτου βάσει περιουσιολογίου (Κατοικία, Μονοκατοικία, Διαμέρισμα, Επαγγελματική στέγη, Γη κ.λπ.).',
  '7. Στη στήλη 17 συμπληρώνεται υποχρεωτικά το είδος της μίσθωσης και η χρήση του μισθίου (π.χ. εκμίσθωση κατοικίας, βραχυχρόνια μίσθωση, δωρεάν παραχώρηση, ιδιοχρησιμοποίηση).',
  '8. Στη στήλη 18 συμπληρώνεται ο αριθμός παροχής ρεύματος (ΔΕΗ) του ακινήτου· για μη ηλεκτροδοτούμενο ακίνητο σημειώνεται η αντίστοιχη ένδειξη.',
  '9. Στη στήλη 19 συμπληρώνεται ο αριθμός της «Δήλωσης Πληροφοριακών Στοιχείων Μίσθωσης Ακίνητης Περιουσίας».',
  '10. Στις στήλες 13, 14 και 15 αναγράφεται το ακαθάριστο εισόδημα ανάλογα με το είδος μίσθωσης/χρήσης (εκμίσθωση, δωρεάν παραχώρηση, ιδιοχρησιμοποίηση). Στη στήλη 16 αναγράφονται τυχόν ανείσπρακτα εισοδήματα.',
  '11. Τα «Συμπληρωματικά Στοιχεία Ακίνητης Περιουσίας» (συνιδιοκτήτες, υπεκμισθώσεις, μεταβιβάσεις) συμπληρώνονται όταν συντρέχει τέτοια περίπτωση, με τα αντίστοιχα στοιχεία και ΑΦΜ ανά συνιδιοκτήτη.',
  '12. Αν δεν επαρκεί μία αναλυτική κατάσταση για όλα τα ακίνητα, χρησιμοποιούνται περισσότερα έντυπα Ε2.',
];
