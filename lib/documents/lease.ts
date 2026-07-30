// ═══════════════════════════════════════════════════════════════════════════
// lease — Ιδιωτικό συμφωνητικό μίσθωσης κατοικίας (μισθωτήριο). Καθαρή λογική,
// χωρίς I/O: υπολογισμός διάρκειας/λήξης, έλεγχος ελάχιστης νόμιμης διάρκειας,
// προθεσμία δήλωσης στην ΑΑΔΕ και παραγωγή των τυποποιημένων όρων.
//
// Νομικό πλαίσιο (αστική μίσθωση κατοικίας): η ελάχιστη διάρκεια είναι τριετής
// κατά νόμο (ν.1703/1987 όπως ισχύει) ακόμη κι αν συμφωνηθεί μικρότερη, ενώ η
// «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης» υποβάλλεται ηλεκτρονικά στο myAADE
// έως το τέλος του επόμενου μήνα από την έναρξη (ή την τροποποίηση/λύση).
// Τα κείμενα είναι τυποποιημένα υποδείγματα, όχι υποκατάστατο νομικού ελέγχου.
// ═══════════════════════════════════════════════════════════════════════════

import { declarationDeadline as taxDeclarationDeadline } from '../tax/leaseDeclaration';

export type LeaseUse = 'residence' | 'professional';

export interface LeaseInput {
  monthlyRent: number;
  deposit?: number;              // εγγύηση (συνήθως 1-2 μισθώματα)
  start: string;                 // YYYY-MM-DD
  years?: number;                // συμφωνημένη διάρκεια σε έτη
  end?: string;                  // ή ρητή ημερομηνία λήξης (υπερισχύει των ετών)
  use?: LeaseUse;
  adjustmentPct?: number;        // ετήσια αναπροσαρμογή (%)
  paymentDay?: number;           // ημέρα καταβολής μισθώματος (1-28)
}

export interface LeaseResult {
  monthlyRent: number;
  deposit: number;
  start: string;
  end: string;
  months: number;                // συνολικοί μήνες μίσθωσης
  years: number;
  belowLegalMinimum: boolean;    // < 3ετία σε κατοικία
  declarationDeadline: string;   // προθεσμία δήλωσης στο myAADE (YYYY-MM-DD)
  firstYearTotal: number;        // μισθώματα 1ου έτους (ενδεικτικά)
  adjustmentPct: number;
  paymentDay: number;
}

export const LEGAL_MIN_YEARS_RESIDENCE = 3;

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseIso = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
};

/** Λήξη μίσθωσης: η προηγούμενη ημέρα από την επέτειο έναρξης μετά από N έτη. */
export function leaseEndDate(start: string, years: number): string {
  const s = parseIso(start);
  if (!s || !(years > 0)) return '';
  const e = new Date(s.getFullYear() + Math.floor(years), s.getMonth(), s.getDate());
  e.setDate(e.getDate() - 1);
  return isoOf(e);
}

/**
 * Προθεσμία δήλωσης μίσθωσης: τέλος του επόμενου μήνα από την έναρξη.
 *
 * Ο ΚΑΝΟΝΑΣ δεν ζει εδώ: ζει στο lib/tax/leaseDeclaration.ts, μαζί με την
 * υπόλοιπη γνώση για τη Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης. Δύο αντίγραφα
 * σήμαιναν ότι μια αλλαγή του νόμου θα διορθωνόταν στο ένα και θα έμενε λάθος
 * στο άλλο — και το συμβόλαιο θα τύπωνε άλλη ημερομηνία από την ειδοποίηση.
 *
 * Εδώ μένει μόνο η ανοχή στα άκυρα: το συμβόλαιο τυπώνεται και μισοσυμπληρωμένο,
 * οπότε χωρίς έγκυρη έναρξη επιστρέφεται κενό αντί για σφάλμα.
 */
export function declarationDeadline(start: string): string {
  return parseIso(start) ? taxDeclarationDeadline(start.slice(0, 10)) : '';
}

export function computeLease(i: LeaseInput): LeaseResult {
  const rent = r2(i.monthlyRent);
  const use: LeaseUse = i.use || 'residence';
  const start = parseIso(i.start) ? i.start : '';
  const years = i.years && i.years > 0 ? i.years : 3;
  const end = i.end && parseIso(i.end) ? i.end : leaseEndDate(start, years);
  const s = parseIso(start), e = parseIso(end);
  const months = (s && e && e >= s)
    ? (e.getFullYear() * 12 + e.getMonth()) - (s.getFullYear() * 12 + s.getMonth()) + 1
    : 0;
  const effYears = months / 12;
  // Ημέρα καταβολής: αν δεν δοθεί, προεπιλογή η 5η. Αν δοθεί, περιορίζεται στο 1..28
  // (ώστε να υπάρχει σε κάθε μήνα, και τον Φεβρουάριο).
  const day = i.paymentDay == null || !Number.isFinite(i.paymentDay)
    ? 5
    : Math.min(28, Math.max(1, Math.round(i.paymentDay)));
  return {
    monthlyRent: rent,
    deposit: r2(i.deposit ?? 0),
    start, end, months,
    years: Math.round(effYears * 100) / 100,
    belowLegalMinimum: use === 'residence' && effYears > 0 && effYears < LEGAL_MIN_YEARS_RESIDENCE - 0.02,
    declarationDeadline: declarationDeadline(start),
    firstYearTotal: r2(rent * Math.min(12, months || 12)),
    adjustmentPct: Number(i.adjustmentPct) || 0,
    paymentDay: day,
  };
}

const grDate = (iso: string) => { const d = parseIso(iso); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : iso; };
const eur = (n: number) => `${(Number(n) || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface LeaseParties {
  landlordName?: string; landlordAfm?: string; landlordAddress?: string;
  tenantName?: string; tenantAfm?: string;
  propertyAddress?: string; sqm?: number; atak?: string; floor?: string;
}

/** Εισαγωγικό κείμενο συμφωνητικού (συμβαλλόμενοι, μίσθιο, σκοπός). */
export function leasePreamble(p: LeaseParties, r: LeaseResult, use: LeaseUse = 'residence'): string {
  const L = [p.landlordName || '—', p.landlordAfm ? `ΑΦΜ ${p.landlordAfm}` : ''].filter(Boolean).join(', ');
  const T = [p.tenantName || '—', p.tenantAfm ? `ΑΦΜ ${p.tenantAfm}` : ''].filter(Boolean).join(', ');
  const where = [p.propertyAddress, p.floor ? `όροφος ${p.floor}` : '', p.sqm ? `${p.sqm} τ.μ.` : '', p.atak ? `ΑΤΑΚ ${p.atak}` : ''].filter(Boolean).join(', ');
  const purpose = use === 'residence' ? 'ως κύρια κατοικία του μισθωτή' : 'για επαγγελματική χρήση';
  return `Σήμερα, ${grDate(isoOf(new Date()))}, οι κάτωθι συμβαλλόμενοι, αφενός ο εκμισθωτής ${L} και αφετέρου ο μισθωτής ${T}, `
    + `συμφώνησαν και έκαναν αμοιβαία αποδεκτά τα ακόλουθα: ο εκμισθωτής εκμισθώνει στον μισθωτή το ακίνητο ${where || '—'}, `
    + `${purpose}, με τους παρακάτω όρους.`;
}

export interface LeaseTerm { title: string; text: string }

/** Οι τυποποιημένοι όροι του συμφωνητικού, αριθμημένοι. */
export function leaseTerms(r: LeaseResult, use: LeaseUse = 'residence'): LeaseTerm[] {
  const terms: LeaseTerm[] = [
    { title: 'Διάρκεια', text: `Η μίσθωση αρχίζει την ${grDate(r.start)} και λήγει την ${grDate(r.end)}. `
      + (use === 'residence'
        ? `Για τις μισθώσεις κατοικίας ισχύει η κατά νόμο ελάχιστη τριετής διάρκεια, ακόμη και αν συμφωνηθεί μικρότερη.`
        : `Μετά τη λήξη, η μίσθωση δύναται να ανανεωθεί εγγράφως με νεότερη συμφωνία των μερών.`) },
    { title: 'Μίσθωμα', text: `Το μηνιαίο μίσθωμα ορίζεται σε ${eur(r.monthlyRent)} και προκαταβάλλεται έως την ${r.paymentDay}η ημέρα κάθε μήνα. `
      + `Η καταβολή γίνεται αποκλειστικά με τραπεζικό ή ηλεκτρονικό μέσο πληρωμής, σε λογαριασμό που υποδεικνύει ο εκμισθωτής.` },
  ];
  if (r.adjustmentPct > 0) {
    terms.push({ title: 'Αναπροσαρμογή', text: `Το μίσθωμα αναπροσαρμόζεται ετησίως κατά ${r.adjustmentPct.toLocaleString('el-GR', { maximumFractionDigits: 2 })} %, `
      + `με ισχύ από την αντίστοιχη επέτειο έναρξης της μίσθωσης.` });
  }
  if (r.deposit > 0) {
    terms.push({ title: 'Εγγύηση', text: `Ο μισθωτής καταβάλλει εγγύηση ${eur(r.deposit)}, η οποία δεν συμψηφίζεται με μισθώματα και επιστρέφεται ατόκως `
      + `κατά την απόδοση του μισθίου, εφόσον δεν υφίστανται φθορές πέραν της συνήθους χρήσης ή εκκρεμείς οφειλές.` });
  }
  terms.push(
    { title: 'Λογαριασμοί και κοινόχρηστα', text: `Οι δαπάνες ρεύματος, ύδρευσης, φυσικού αερίου, τηλεπικοινωνιών και τα κοινόχρηστα βαρύνουν τον μισθωτή. `
      + `Ο ΕΝΦΙΑ και οι δαπάνες που κατά νόμο βαρύνουν τον ιδιοκτήτη παραμένουν στον εκμισθωτή.` },
    { title: 'Χρήση του μισθίου', text: `Ο μισθωτής υποχρεούται να χρησιμοποιεί το μίσθιο με επιμέλεια και σύμφωνα με τον συμφωνημένο σκοπό, `
      + `να τηρεί τον κανονισμό της πολυκατοικίας και να μην προβαίνει σε μεταβολές χωρίς έγγραφη συναίνεση του εκμισθωτή.` },
    { title: 'Υπεκμίσθωση', text: `Απαγορεύεται η υπεκμίσθωση ή η με οποιονδήποτε τρόπο παραχώρηση της χρήσης σε τρίτο, χωρίς προηγούμενη έγγραφη συναίνεση του εκμισθωτή.` },
    { title: 'Επισκευές', text: `Οι αναγκαίες επισκευές και η αποκατάσταση βλαβών που δεν οφείλονται σε υπαιτιότητα του μισθωτή βαρύνουν τον εκμισθωτή. `
      + `Ο μισθωτής ενημερώνει εγκαίρως τον εκμισθωτή για κάθε βλάβη.` },
    { title: 'Δήλωση στην ΑΑΔΕ', text: `Ο εκμισθωτής υποβάλλει ηλεκτρονικά τη «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης» στο myAADE, `
      + `με προθεσμία έως ${grDate(r.declarationDeadline)}.` },
    { title: 'Λύση της μίσθωσης', text: `Καθυστέρηση καταβολής μισθώματος ή παράβαση οποιουδήποτε όρου παρέχει στον εκμισθωτή δικαίωμα καταγγελίας κατά τον νόμο. `
      + `Το παρόν υπογράφεται σε δύο όμοια αντίτυπα, ένα για κάθε συμβαλλόμενο.` },
  );
  return terms.map((t, i) => ({ title: `${i + 1}. ${t.title}`, text: t.text }));
}
