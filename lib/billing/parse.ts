// ═══════════════════════════════════════════════════════════════════════════
// lib/billing/parse.ts — καθαρή (pure), δοκιμάσιμη λογική ανάλυσης λογαριασμών &
// τραπεζικών κινήσεων. Χρησιμοποιείται από BillsBankImport / BillsAIScan ώστε τα
// tests να καλύπτουν τον ΠΡΑΓΜΑΤΙΚΟ κώδικα, όχι αντίγραφο.
// ═══════════════════════════════════════════════════════════════════════════

// Ο έλεγχος ΑΦΜ και η ανάγνωση ελληνικών ποσών/ημερομηνιών υπάρχουν ΜΙΑ φορά
// στο app, στο lib/core/greek.ts. Τα εισάγουμε — δεν τα αντιγράφουμε.
import {
  isValidAfm,
  parseAmount as coreParseAmount,
  parseDate as coreParseDate,
} from '../core/greek';

export type Category =
  | 'electricity' | 'water' | 'gas' | 'internet' | 'streaming' | 'insurance'
  | 'taxes' | 'municipal' | 'security' | 'common' | 'maintenance'
  | 'elevator' | 'pool' | 'gardener' | 'cleaner' | 'plumber' | 'electrician'
  | 'rent_income' | 'other';

export type Confidence = 'high' | 'medium' | 'low';

export interface ParsedTransaction {
  id: string; date: string; description: string; amount: number;
  debit: boolean; category: string; confidence: Confidence;
  selected: boolean; matched: string; note?: string;
}

// ── Αναγνώριση παρόχου/εμπόρου από την περιγραφή κίνησης ────────────────────
export const MATCHERS: { keywords: string[]; category: Category; label: string; confidence: Confidence }[] = [
  { keywords: ['ΔΕΗ','DEH','ΔΗΜΟΣΙΑ ΕΠΙΧΕΙΡΗΣΗ ΗΛΕΚΤΡΙΣΜΟΥ','ΗΡΩΝ ΗΛΕΚΤΡΙΣΜΟΣ','HERON ENERGY','PROTERGIA','VOLTERRA','NRG BILLING','ZENITH ENERGY','ELIN ENERGY','WATT+VOLT','SKY ENERGY','ELPEDISON','ENERWAVE','FYSIKO AERIO ELLADOS','NRG','ΦΥΣΙΚΟ ΑΕΡΙΟ ΕΛΛΑΔΟΣ'], category: 'electricity', label: 'Ρεύμα', confidence: 'high' },
  { keywords: ['ΕΥΔΑΠ','EYDAP','ΕΥΑΘ','EYATH','ΔΕΥΑ','ΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΗΣ','ΥΔΡΕΥΣΗ'], category: 'water', label: 'Νερό', confidence: 'high' },
  { keywords: ['COSMOTE','OTE AE','NOVA BROADBAND','NOVA SA','FORTHNET','VODAFONE ΕΛΛΑΔΟΣ','WIND HELLAS','HOL SA','CYTA HELLAS','INALAN','WIND MOBILE'], category: 'internet', label: 'Internet & Τηλεφωνία', confidence: 'high' },
  { keywords: ['NETFLIX','DISNEY PLUS','SPOTIFY AB','AMAZON PRIME','AMAZON DIGITAL','MAX HBO','YOUTUBE PREMIUM','GOOGLE YOUTUBE','ANT1 PLUS','COSMOTE TV','APPLE TV+','APPLE.COM/BILL'], category: 'streaming', label: 'Streaming & Συνδρομές', confidence: 'high' },
  { keywords: ['ICLOUD','APPLE ICLOUD','GOOGLE ONE','GOOGLE STORAGE','MICROSOFT 365','MICROSOFT ONLINE','DROPBOX','ADOBE SYSTEMS','CANVA'], category: 'streaming', label: 'Cloud & Λογισμικό', confidence: 'high' },
  { keywords: ['ΑΑΔΕ','AADE','ENFIA','ΕΝΦΙΑ','ΕΦΟΡΙΑ ΑΘΗΝΩΝ','ΔΗΜΟΣΙΑ ΕΣΟΔΑ','ΕΦΚΑ','ΙΚΑ','ΤΕΒΕ'], category: 'taxes', label: 'ΕΝΦΙΑ & Φόροι', confidence: 'high' },
  { keywords: ['ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ','ΔΗΜΟΤΙΚΑ ΤΕΛΗ','ΔΗΜΟΤΙΚΗ','ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ','ΔΗΜΟΤΙΚΗ ΑΡΧΗ','ΔΗΜΟΣ'], category: 'municipal', label: 'Δημοτικά Τέλη', confidence: 'medium' },
  { keywords: ['EDA ATTIKIS','ΕΔΑ ΑΤΤΙΚΗΣ','EDA THESS','DEPA','ΦΥΣΙΚΟ ΑΕΡΙΟ','GAS DISTRIBUTION','HERON GAS','PROTERGIA GAS','ZENITH GAS','ΑΕΡΙΟ ΑΤΤΙΚΗΣ'], category: 'gas', label: 'Φυσικό Αέριο', confidence: 'high' },
  { keywords: ['HELLAS DIRECT','INTERAMERICAN','EUROLIFE FFH','EUROLIFE','GENERALI HELLAS','AXA ASFALISTIKI','ΕΘΝΙΚΗ ΑΣΦΑΛΙΣΤΙΚΗ','ALLIANZ HELLAS','ERGO ΑΣΦΑΛΙΣΤΙΚΗ','GROUPAMA','ΑΣΦΑΛΕΙΑ','ΑΣΦΑΛΙΣΤΗΡΙΟ'], category: 'insurance', label: 'Ασφάλεια', confidence: 'high' },
  { keywords: ['ELTRAK SECURITY','G4S HELLAS','VANINFO','DSP SECURITY','SECURITAS','ΕΤΑΙΡΕΙΑ ΑΣΦΑΛΕΙΑΣ','ALARM','ΣΥΝΑΓΕΡΜ'], category: 'security', label: 'Ασφάλεια & Security', confidence: 'medium' },
  { keywords: ['ΚΟΙΝΟΧΡΗΣΤΑ','ΔΙΑΧΕΙΡΙΣΗΣ','MYBILLYS','BILLYS','MY CONDO','COMFY','ΠΟΛΥΚΑΤΟΙΚΙΑ'], category: 'common', label: 'Κοινόχρηστα', confidence: 'medium' },
  { keywords: ['ΑΝΕΛΚΥΣΤΗΡ','ΑΣΑΝΣΕΡ','KLEEMANN','OTIS','KONE','SCHINDLER','ELEVATOR','THYSSENKRUPP'], category: 'elevator', label: 'Συντήρηση Ασανσέρ', confidence: 'medium' },
  { keywords: ['ΠΙΣΙΝΑ','POOL','ΣΥΝΤΗΡΗΣΗ ΠΙΣΙΝΑΣ','ΧΛΩΡΙΟ'], category: 'pool', label: 'Καθαρισμός Πισίνας', confidence: 'medium' },
  { keywords: ['ΚΗΠΟΥΡ','ΚΗΠΟΣ','GARDEN','ΠΡΑΣΙΝΟ','LANDSCAP','ΦΥΤΑ'], category: 'gardener', label: 'Κηπουρός', confidence: 'medium' },
  { keywords: ['ΚΑΘΑΡΙΟΤΗΤ','ΚΑΘΑΡΙΣΜ','CLEANING','ΣΥΝΕΡΓΕΙΟ ΚΑΘΑΡΙΣΜΟΥ'], category: 'cleaner', label: 'Καθαριότητα', confidence: 'medium' },
  { keywords: ['ΥΔΡΑΥΛΙΚ','PLUMBER','ΑΠΟΦΡΑΞ'], category: 'plumber', label: 'Υδραυλικός', confidence: 'medium' },
  { keywords: ['ΗΛΕΚΤΡΟΛΟΓ','ELECTRICIAN'], category: 'electrician', label: 'Ηλεκτρολόγος', confidence: 'medium' },
  { keywords: ['ΣΥΝΤΗΡΗΣΗ','ΤΕΧΝΙΚΟΣ','SERVICE','ΕΠΙΣΚΕΥ','MAINTENANCE'], category: 'maintenance', label: 'Συντήρηση', confidence: 'low' },
  { keywords: ['ΜΙΣΘΩΜΑ','ΕΝΟΙΚΙΟ','RENT','ENARC','ΜΙΣΘΩΣΗ'], category: 'rent_income', label: 'Ενοίκιο', confidence: 'medium' },
];

export function categorizeTransaction(desc: string): { category: string; label: string; confidence: Confidence; matched: string } {
  const upper = (desc || '').toUpperCase();
  for (const m of MATCHERS) {
    const hit = m.keywords.find(k => upper.includes(k));
    if (hit) return { category: m.category, label: m.label, confidence: m.confidence, matched: hit };
  }
  return { category: 'other', label: 'Άλλο', confidence: 'low', matched: '' };
}

// ── Κατηγορία → ομάδα/κατηγορία Δαπανών ────────────────────────────────────
export const EXPENSE_MAP: Record<string, { group: string; cat: string }> = {
  electricity: { group: 'fixed',       cat: 'Ρεύμα' },
  water:       { group: 'fixed',       cat: 'Νερό' },
  gas:         { group: 'fixed',       cat: 'Φυσικό Αέριο' },
  internet:    { group: 'fixed',       cat: 'Internet' },
  streaming:   { group: 'fixed',       cat: 'Άλλη Πάγια' },
  insurance:   { group: 'fixed',       cat: 'Ασφάλεια Κτιρίου' },
  taxes:       { group: 'fixed',       cat: 'ΕΝΦΙΑ' },
  municipal:   { group: 'fixed',       cat: 'Δημοτικά Τέλη' },
  security:    { group: 'fixed',       cat: 'Σύστημα Συναγερμού' },
  common:      { group: 'fixed',       cat: 'Κοινόχρηστα' },
  maintenance: { group: 'maintenance', cat: 'Γενική Συντήρηση' },
  elevator:    { group: 'maintenance', cat: 'Συντήρηση Ασανσέρ' },
  pool:        { group: 'maintenance', cat: 'Καθαρισμός Πισίνας' },
  gardener:    { group: 'maintenance', cat: 'Κηπουρός' },
  cleaner:     { group: 'maintenance', cat: 'Καθαριότητα' },
  plumber:     { group: 'maintenance', cat: 'Υδραυλικός' },
  electrician: { group: 'maintenance', cat: 'Ηλεκτρολόγος' },
  other:       { group: 'other',       cat: 'Άλλο' },
};

// ── Ανάλυση CSV/κειμένου τραπεζικού αντιγράφου ─────────────────────────────
// Η ΑΝΑΓΝΩΣΗ ποσού και ημερομηνίας ΔΕΝ γίνεται εδώ: γίνεται μία φορά, στο
// lib/core/greek.ts. Εδώ μένει μόνο ό,τι είναι ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ — η μορφή που
// περιμένουν οι οθόνες ('' αντί για null) και το επιχειρησιακό φίλτρο ποσού.
// Μετατροπή στήλης ημερομηνίας → ISO (YYYY-MM-DD). Επιστρέφει '' αν δεν είναι
// ημερομηνία, γιατί οι καλούντες εδώ συγκρίνουν με κενό κείμενο, όχι με null.
export function parseDate(col: string): string {
  return coreParseDate(col) ?? '';
}

/**
 * Ποσό στήλης, με το ΕΠΙΧΕΙΡΗΣΙΑΚΟ φίλτρο ταιριάσματος λογαριασμών.
 *
 * Το φίλτρο (κάτω από 1 λεπτό, πάνω από ένα εκατομμύριο) ΔΕΝ είναι μέρος της
 * ανάγνωσης — είναι κανόνας του ταιριάσματος: τέτοια νούμερα σε στήλη
 * λογαριασμού είναι κωδικοί ή υπόλοιπα, όχι ποσά χρέωσης. Γι' αυτό μένει εδώ
 * και όχι στο core, όπου θα έκοβε σιωπηλά κάθε μεγάλη τραπεζική μεταφορά.
 */
export function parseAmount(col: string): number | null {
  const n = coreParseAmount(col);
  if (n === null || Math.abs(n) <= 0.01 || Math.abs(n) >= 1000000) return null;
  return n;
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const findCol = (headers: string[], keys: string[]): number =>
  headers.findIndex(h => keys.some(k => h.includes(k)));

export function parseCSV(text: string): ParsedTransaction[] {
  const lines = (text || '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  // Ανίχνευση διαχωριστή ΜΙΑ φορά από την κεφαλίδα: tab > semicolon > comma.
  const header = lines[0];
  const delim = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ',';
  const splitLine = (l: string): string[] =>
    delim === ',' ? l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/) : l.split(delim);

  // ── Header-aware λειτουργία: εντόπισε ονομασμένες στήλες (τα περισσότερα bank
  // exports έχουν κεφαλίδα). Έτσι Υπόλοιπο/κωδικοί ΔΕΝ μπερδεύονται με το ποσό,
  // και ξεχωριστές στήλες Χρέωση/Πίστωση διαβάζονται σωστά.
  const H = splitLine(header).map(c => stripAccents(c.replace(/^"|"$/g, '')));
  const iDate = findCol(H, ['ημερομηνια', 'ημ/νια', 'ημ. συν', 'date', 'ημερομ']);
  const iAmount = findCol(H, ['ποσο', 'amount']);
  const iDebit = findCol(H, ['χρεωση', 'debit', 'αναληψη', 'εξοδα', 'χρεωσεις']);
  const iCredit = findCol(H, ['πιστωση', 'credit', 'καταθεση', 'εσοδα', 'πιστωσεις']);
  // Η περιγραφή εντοπίζεται ΤΕΛΕΥΤΑΙΑ, αποκλείοντας στήλες που ήδη διεκδικήθηκαν
  // (π.χ. «Ημ. Συναλλαγής» περιέχει «συναλλαγη» αλλά είναι ημερομηνία, όχι περιγραφή).
  const claimed = new Set([iDate, iAmount, iDebit, iCredit].filter(x => x >= 0));
  const descKeys = ['περιγραφη', 'αιτιολογια', 'description', 'κινηση', 'συναλλαγη', 'λεπτομερ', 'narrative', 'reference', 'δικαιουχος'];
  const iDesc = H.findIndex((h, idx) => !claimed.has(idx) && descKeys.some(k => h.includes(k)));
  const headerMode = iDate >= 0 && iDesc >= 0 && (iAmount >= 0 || iDebit >= 0 || iCredit >= 0);

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;
    let date = '', desc = '', amount = 0, debit = true;

    if (headerMode) {
      date = parseDate(cols[iDate] || '');
      desc = (cols[iDesc] || '').trim();
      if (iAmount >= 0) {
        const n = parseAmount(cols[iAmount] || '');
        if (n != null) { amount = Math.abs(n); debit = n < 0 || (cols[iAmount] || '').trim().startsWith('-'); }
      } else {
        const d = iDebit >= 0 ? parseAmount(cols[iDebit] || '') : null;
        const c = iCredit >= 0 ? parseAmount(cols[iCredit] || '') : null;
        if (d != null && Math.abs(d) > 0.01) { amount = Math.abs(d); debit = true; }
        else if (c != null && Math.abs(c) > 0.01) { amount = Math.abs(c); debit = false; }
      }
    } else {
      // Fallback ευρετική (αρχεία χωρίς κεφαλίδα): πρώτη ημ/νία, πρώτο ποσό, μεγαλύτερο κείμενο.
      for (const col of cols) {
        if (!date) { const dt = parseDate(col); if (dt) { date = dt; continue; } }
        if (!amount) { const n = parseAmount(col); if (n != null) { amount = Math.abs(n); debit = n < 0 || col.trim().startsWith('-'); continue; } }
        if (col.length >= 3 && !/^[-+]?[\d.,\s€]+$/.test(col) && !/^\d{1,2}[\/\-.]\d{1,2}/.test(col) && !/^\d{4}-\d{2}-\d{2}/.test(col)) {
          if (!desc || col.length > desc.length) desc = col;
        }
      }
    }

    if (!date || !amount || !desc) continue;
    const cat = categorizeTransaction(desc);
    results.push({ id: `tx_${i}`, date, description: desc, amount, debit, ...cat, selected: debit && cat.category !== 'other' });
  }
  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ── Συμφωνία: ταίριασμα πληρωμής ↔ εκκρεμούς λογαριασμού ────────────────────
export function withinDays(a?: string | null, b?: string | null, days = 25): boolean {
  if (!a || !b) return false;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  return diff <= days;
}

export interface PendingBill { id: string; category: string; amount: number; due_date?: string | null; created_at?: string | null; }

// Ανοχή συμφωνίας ποσού: έως 1% ΚΑΙ το πολύ έως 0,20 € για μικρά ποσά.
// (Σφιχτή, ώστε να αποφεύγονται λανθασμένα ματσαρίσματα.)
export function amountTolerance(amount: number): number {
  return Math.max(0.20, amount * 0.01);
}

// ═══════════════════════════════════════════════════════════════════════════
// ΤΑΙΡΙΑΣΜΑ ΜΕ ΠΕΝΤΕ ΠΕΔΙΑ — πάροχος, ΑΦΜ, ποσό, ημερομηνία, περίοδος από–έως
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Το παλιό ταίριασμα κοίταζε ποσό ± ανοχή + ημερομηνία
// ±25 ημέρες + κατηγορία. Δύο λογαριασμοί ΔΕΗ ίδιου ποσού σε ΔΙΑΔΟΧΙΚΟΥΣ μήνες
// πέφτουν και οι δύο μέσα στο παράθυρο των 25 ημερών — άρα μια απόδειξη
// εξοφλούσε σιωπηλά τον λάθος λογαριασμό, και ο χρήστης δεν το μάθαινε ποτέ.
//
// Η ΛΟΓΙΚΗ ΕΙΝΑΙ ΔΥΟ ΒΗΜΑΤΑ, ΟΧΙ ΕΝΑ ΣΚΟΡ.
//   1) ΣΥΓΚΡΟΥΣΕΙΣ (hard reject): αν δύο πεδία που ΓΝΩΡΙΖΟΥΜΕ και τα δύο
//      διαφωνούν, ο υποψήφιος πέφτει — όσο καλά κι αν ταιριάζουν τα υπόλοιπα.
//      Διαφορετικό ΑΦΜ, διαφορετικός (αναγνωρισμένος) πάροχος, διαφορετική
//      κατηγορία, ή περίοδοι που ΔΕΝ επικαλύπτονται.
//   2) ΒΕΒΑΙΟΤΗΤΑ (score + λόγοι) στους υποψηφίους που έμειναν. Επιστρέφουμε
//      βαθμό ΚΑΙ τους λόγους, και όταν δύο υποψήφιοι είναι εξίσου πιθανοί ο
//      χρήστης ΡΩΤΙΕΤΑΙ ('ask') αντί να γίνει σιωπηλή εξόφληση.
//
// «Δεν ξέρω» ΔΕΝ είναι «διαφωνώ». Αν το ένα από τα δύο μέρη δεν έχει ΑΦΜ, αυτό
// δεν είναι σύγκρουση — είναι απουσία στοιχείου: δεν δίνει μονάδες, δεν κόβει.
// ═══════════════════════════════════════════════════════════════════════════

/** Ελληνικό ΑΦΜ (mod-11 της ΑΑΔΕ). ΔΕΝ ξαναγράφεται εδώ: επαναχρησιμοποιείται η
 *  μοναδική υλοποίηση του checksum στο app (lib/core/greek.ts), με τα δικά της
 *  tests. Επανεξάγεται ώστε οι οθόνες του Αρχείου να μην ψάχνουν αλλού. */
export { isValidAfm };

/**
 * Μόνο τα ψηφία, πετώντας ΚΑΘΕ άλλο χαρακτήρα.
 *
 * ΔΕΝ είναι το `afmDigits` του core, και γι' αυτό δεν λέγεται έτσι: εκείνο
 * καθαρίζει μόνο κενά/τελείες/παύλες για να ΕΛΕΓΞΕΙ ένα ΑΦΜ, ενώ αυτό ΒΓΑΖΕΙ
 * τα ψηφία από σκαναρισμένο κείμενο, όπου το ΑΦΜ έρχεται ως «ΑΦΜ: 094014201».
 * Ίδιο όνομα για διαφορετική συμπεριφορά ήταν παγίδα — τώρα κάθε ένα λέει τι κάνει.
 */
export const digitsOnly = (v?: string | null): string => String(v ?? '').replace(/\D/g, '');

export interface PeriodRange { from: string; to: string }

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (s?: string | null): boolean => !!s && ISO_RE.test(s);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthRange = (y: number, m: number): PeriodRange => ({
  from: `${y}-${String(m).padStart(2, '0')}-01`,
  to: `${y}-${String(m).padStart(2, '0')}-${String(lastDay(y, m)).padStart(2, '0')}`,
});

// Ελληνικοί μήνες (μετά από αφαίρεση τόνων/πεζά). Δεν είναι «λίστα παρόχων»:
// είναι το αλφάβητο των ημερομηνιών στα ελληνικά παραστατικά.
const GR_MONTH_FULL = ['ιανουαριος', 'φεβρουαριος', 'μαρτιος', 'απριλιος', 'μαιος', 'ιουνιος', 'ιουλιος', 'αυγουστος', 'σεπτεμβριος', 'οκτωβριος', 'νοεμβριος', 'δεκεμβριος'];
// Τριγράμματες συντομογραφίες. Ιούνιος/Ιούλιος ΛΕΙΠΟΥΝ επίτηδες: «Ιου» είναι
// διφορούμενο, και προτιμούμε να μην αναγνωρίσουμε παρά να μαντέψουμε μήνα.
const GR_MONTH_ABBR3 = ['ιαν', 'φεβ', 'μαρ', 'απρ', 'μαι', '', '', 'αυγ', 'σεπ', 'οκτ', 'νοε', 'δεκ'];

/**
 * Μήνας (1-12) από μία λέξη, ή 0. Η σύγκριση γίνεται στα ΤΕΣΣΕΡΑ πρώτα γράμματα
 * ώστε να πιάνει και τις κλίσεις («Ιουνίου», «Μαΐου») χωρίς να μπερδεύει λέξεις
 * που απλώς αρχίζουν ίδια: «Μαρούσι» δεν είναι Μάρτιος.
 */
function monthOfWord(w: string): number {
  if (w.length === 3) { const i = GR_MONTH_ABBR3.indexOf(w); return i >= 0 ? i + 1 : 0; }
  if (w.length >= 4) { const k = w.slice(0, 4); const i = GR_MONTH_FULL.findIndex(f => f.slice(0, 4) === k); return i + 1; }
  return 0;
}

/**
 * Δομημένη περίοδος από ΕΛΕΥΘΕΡΟ κείμενο («Ιούνιος 2026», «01/06/2026-30/06/2026»,
 * «06/2026», «Ιούν–Ιούλ 2026»). ΔΕΝ επινοεί: επιστρέφει null όταν το κείμενο δεν
 * λέει μήνα/εύρος. Χρειάζεται επειδή οι υπάρχοντες λογαριασμοί (`bills.period`)
 * κρατούν περίοδο ως κείμενο και χωρίς μετάφραση δεν συγκρίνεται με τίποτα.
 */
export function derivePeriod(text?: string | null): PeriodRange | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const s = stripAccents(raw);

  // 1) Δύο πλήρεις ημερομηνίες → ρητό εύρος.
  const dates = (s.match(/\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g) || [])
    .map(parseDate).filter(isIso);
  if (dates.length >= 2) {
    const sorted = [...dates].sort();
    return { from: sorted[0], to: sorted[sorted.length - 1] };
  }
  const isos = s.match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (isos.length >= 2) { const sorted = [...isos].sort(); return { from: sorted[0], to: sorted[sorted.length - 1] }; }

  // 2) Ονόματα μηνών + έτος («Ιούνιος 2026», «Ιούν – Ιούλ 2026»).
  const year = s.match(/(20\d{2})/)?.[1];
  if (year) {
    const found: number[] = [];
    // Σάρωση με σειρά εμφάνισης στο κείμενο, ώστε «Ιούν–Ιούλ» να δώσει 6→7.
    for (const w of s.split(/[^α-ωa-z]+/)) {
      const m = monthOfWord(w);
      if (m && !found.includes(m)) found.push(m);
    }
    if (found.length >= 2) {
      const a = monthRange(Number(year), Math.min(...found));
      const b = monthRange(Number(year), Math.max(...found));
      return { from: a.from, to: b.to };
    }
    if (found.length === 1) return monthRange(Number(year), found[0]);
    // 3) Αριθμητικός μήνας: «06/2026» ή «2026-06».
    const my = s.match(/\b(0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/);
    if (my) return monthRange(Number(my[2]), Number(my[1]));
    const ym = s.match(/\b(20\d{2})[\/\-.](0?[1-9]|1[0-2])\b/);
    if (ym) return monthRange(Number(ym[1]), Number(ym[2]));
  }
  return null;
}

/** Η περίοδος ενός παραστατικού: δομημένη αν υπάρχει, αλλιώς από το κείμενο. */
export function periodOf(x: { period_from?: string | null; period_to?: string | null; period?: string | null }): PeriodRange | null {
  const f = isIso(x.period_from) ? x.period_from! : '';
  const t = isIso(x.period_to) ? x.period_to! : '';
  if (f && t) return f <= t ? { from: f, to: t } : { from: t, to: f };
  if (f) return { from: f, to: f };
  if (t) return { from: t, to: t };
  return derivePeriod(x.period);
}

/** Επικάλυψη περιόδων (ISO strings → λεξικογραφική σύγκριση = χρονολογική). */
export function periodsOverlap(a: PeriodRange, b: PeriodRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

// ── Ταυτότητα παρόχου ───────────────────────────────────────────────────────
// Δεν συγκρίνουμε ωμά strings: «ΔΕΗ Α.Ε.» και «ΔΕΗ — Ιούν 2026» είναι ο ίδιος
// πάροχος. Ούτε χρησιμοποιούμε καινούργια λίστα εταιρειών: τα ονόματα
// αναγνωρίζονται με τους ΥΠΑΡΧΟΝΤΕΣ MATCHERS (ο ίδιος κατάλογος που κατηγοριοποιεί
// τραπεζικές κινήσεις). Έτσι «ΔΕΗ» ≠ «PROTERGIA» παρότι και τα δύο είναι ρεύμα.
const LEGAL_SUFFIX = /\b(α\.?ε\.?|αβεε|αεβε|επε|ικε|ο\.?ε\.?|ε\.?ε\.?|sa|ltd|plc|inc)\b/g;
const providerTokens = (name?: string | null): string[] =>
  stripAccents(String(name ?? '')).replace(LEGAL_SUFFIX, ' ')
    .split(/[^α-ωa-z0-9]+/).filter(w => w.length >= 3);

export type FieldVerdict = 'same' | 'different' | 'unknown';

export function compareProviders(a?: string | null, b?: string | null): FieldVerdict {
  const ta = providerTokens(a), tb = providerTokens(b);
  if (!ta.length || !tb.length) return 'unknown';
  if (ta.some(x => tb.includes(x))) return 'same';
  // Χωρίς κοινή λέξη: σύγκρουση ΜΟΝΟ αν αναγνωρίζουμε και τους δύο ως γνωστούς
  // (διαφορετικούς) παρόχους. Αν ο ένας είναι απλώς «Λογαριασμός ρεύματος», δεν
  // ξέρουμε — και το «δεν ξέρω» δεν μπλοκάρει.
  const ka = categorizeTransaction(String(a ?? '')).matched;
  const kb = categorizeTransaction(String(b ?? '')).matched;
  if (ka && kb) return ka === kb ? 'same' : 'different';
  return 'unknown';
}

/** Το `bills.name` γράφεται ως «Πάροχος — Περίοδος» (planDocSave). Πάρε τον πάροχο. */
export function providerFromBillName(name?: string | null): string {
  return String(name ?? '').split('—')[0].trim();
}

// ── Το σχήμα των δύο πλευρών ────────────────────────────────────────────────
/** Εκκρεμής λογαριασμός με ό,τι ξέρουμε γι' αυτόν (όλα τα νέα πεδία προαιρετικά). */
export interface MatchCandidate {
  id: string;
  amount: number;
  category?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  provider?: string | null;
  provider_afm?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  period?: string | null;
}

/** Η απόδειξη πληρωμής: τι διαβάσαμε από το χαρτί. */
export interface PaymentEvidence {
  amount: number;
  date: string;
  category?: string | null;
  provider?: string | null;
  provider_afm?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  period?: string | null;
}

export type MatchField = 'afm' | 'provider' | 'period' | 'amount' | 'date' | 'category';
export interface MatchReason { field: MatchField; ok: boolean; detail: string }
export interface BillMatch<T extends MatchCandidate = MatchCandidate> {
  bill: T; score: number; reasons: MatchReason[];
}
export type MatchVerdict = 'confident' | 'ask' | 'none';
export interface MatchResult<T extends MatchCandidate = MatchCandidate> {
  verdict: MatchVerdict;
  best?: BillMatch<T>;
  candidates: BillMatch<T>[];
  /** Τι ρωτάμε τον χρήστη όταν verdict==='ask' (ελληνικά, έτοιμο για οθόνη). */
  question?: string;
}

// Βάρη: το ΑΦΜ είναι το ισχυρότερο (ένα νούμερο, μηδέν διφορούμενο), μετά ο
// πάροχος και η επικάλυψη περιόδου, και τελευταία το ποσό/ημερομηνία που από
// μόνα τους έχουν αποδειχθεί ότι μπερδεύουν διαδοχικούς μήνες.
const W = {
  afm: 40, provider: 22, periodExact: 24, periodOverlap: 18,
  amountExact: 28, amountTol: 20, dateClose: 16, dateNear: 10, category: 8,
} as const;
// Κάτω από αυτό δεν υπάρχει αρκετή απόδειξη ώστε να εξοφληθεί κάτι χωρίς ερώτηση.
// Το κατώφλι είναι επιλεγμένο ώστε «ποσό εντός ανοχής + ημερομηνία εντός 25 ημερών»
// (20+10=30) να ΜΗΝ αρκεί από μόνο του: θέλουμε τουλάχιστον ένα ακόμη στοιχείο —
// ακριβές ποσό, ίδια κατηγορία, ίδιος πάροχος, ΑΦΜ ή επικάλυψη περιόδου.
const MIN_CONFIDENT = 34;
/** Πόσο πιο ψηλά πρέπει να είναι ο πρώτος από τον δεύτερο ώστε να μη ρωτήσουμε. */
const MIN_MARGIN = 12;

const fmtEur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Ταιριάζει μια απόδειξη πληρωμής με τους εκκρεμείς λογαριασμούς και επιστρέφει
 * ΒΕΒΑΙΟΤΗΤΑ + ΛΟΓΟΥΣ, όχι boolean.
 *   'confident' → μπορεί να γίνει εξόφληση χωρίς ερώτηση
 *   'ask'       → υπάρχουν υποψήφιοι αλλά η βεβαιότητα δεν φτάνει: ΡΩΤΑ
 *   'none'      → κανένας υποψήφιος (δημιουργείται νέα εγγραφή)
 */
export function matchPaymentToBills<T extends MatchCandidate>(
  p: PaymentEvidence,
  bills: T[],
  used: Set<string> = new Set(),
): MatchResult<T> {
  const tol = amountTolerance(p.amount);
  const pAfm = digitsOnly(p.provider_afm);
  const pPeriod = periodOf(p);
  const scored: BillMatch<T>[] = [];

  for (const b of bills) {
    if (used.has(b.id)) continue;
    const reasons: MatchReason[] = [];
    let score = 0;

    // ── Ποσό: σκληρό φίλτρο (χωρίς ίδιο ποσό δεν συζητάμε).
    const diff = Math.abs((b.amount || 0) - p.amount);
    if (diff > tol) continue;
    if (diff < 0.005) { score += W.amountExact; reasons.push({ field: 'amount', ok: true, detail: `Ίδιο ποσό ${fmtEur(p.amount)}` }); }
    else { score += W.amountTol; reasons.push({ field: 'amount', ok: true, detail: `Ποσό ${fmtEur(b.amount)} έναντι ${fmtEur(p.amount)} (εντός ανοχής)` }); }

    // ── ΑΦΜ: το ισχυρότερο. Άκυρο checksum = «δεν ξέρω», όχι σύγκρουση.
    const bAfm = digitsOnly(b.provider_afm);
    if (pAfm && bAfm && isValidAfm(pAfm) && isValidAfm(bAfm)) {
      if (pAfm !== bAfm) continue;                       // ΣΥΓΚΡΟΥΣΗ
      score += W.afm;
      reasons.push({ field: 'afm', ok: true, detail: `Ίδιο ΑΦΜ παρόχου ${pAfm}` });
    }

    // ── Πάροχος.
    const prov = compareProviders(p.provider, b.provider || undefined);
    if (prov === 'different') continue;                  // ΣΥΓΚΡΟΥΣΗ
    if (prov === 'same') { score += W.provider; reasons.push({ field: 'provider', ok: true, detail: `Ίδιος πάροχος: ${b.provider || p.provider}` }); }

    // ── Κατηγορία (η υπάρχουσα αυστηρότητα: ΔΕΗ δεν εξοφλεί νερό).
    const pc = p.category && p.category !== 'other' ? p.category : '';
    const bc = b.category && b.category !== 'other' ? b.category : '';
    if (pc && bc) {
      if (pc !== bc) continue;                           // ΣΥΓΚΡΟΥΣΗ
      score += W.category;
      reasons.push({ field: 'category', ok: true, detail: 'Ίδια κατηγορία' });
    }

    // ── Περίοδος δαπάνης: ο έλεγχος που έλειπε.
    const bPeriod = periodOf(b);
    if (pPeriod && bPeriod) {
      if (!periodsOverlap(pPeriod, bPeriod)) continue;    // ΣΥΓΚΡΟΥΣΗ
      const exact = pPeriod.from === bPeriod.from && pPeriod.to === bPeriod.to;
      score += exact ? W.periodExact : W.periodOverlap;
      reasons.push({ field: 'period', ok: true, detail: exact ? `Ίδια περίοδος ${bPeriod.from} → ${bPeriod.to}` : `Επικάλυψη περιόδου ${bPeriod.from} → ${bPeriod.to}` });
    }

    // ── Ημερομηνία. Όταν η περίοδος συμφωνεί, δεν απαιτούμε χρονική εγγύτητα
    // (ένας λογαριασμός Ιουνίου πληρώνεται και τον Αύγουστο). Όταν ΔΕΝ ξέρουμε
    // περίοδο, η ημερομηνία είναι το μόνο που έχουμε — άρα γίνεται σκληρό φίλτρο.
    const bDate = b.due_date || b.created_at;
    const close = withinDays(bDate, p.date, 5);
    const near = withinDays(bDate, p.date, 25);
    if (close) { score += W.dateClose; reasons.push({ field: 'date', ok: true, detail: 'Ημερομηνία σε 5 ημέρες' }); }
    else if (near) { score += W.dateNear; reasons.push({ field: 'date', ok: true, detail: 'Ημερομηνία σε 25 ημέρες' }); }
    else if (!(pPeriod && bPeriod)) continue;             // ούτε περίοδος ούτε ημερομηνία
    else reasons.push({ field: 'date', ok: false, detail: 'Η ημερομηνία απέχει, αλλά η περίοδος συμφωνεί' });

    scored.push({ bill: b, score: Math.min(100, score), reasons });
  }

  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { verdict: 'none', candidates: [] };

  const best = scored[0];
  const margin = scored.length > 1 ? best.score - scored[1].score : Infinity;
  if (best.score >= MIN_CONFIDENT && margin >= MIN_MARGIN) {
    return { verdict: 'confident', best, candidates: scored };
  }
  return {
    verdict: 'ask',
    best,
    candidates: scored,
    question: scored.length > 1
      ? `Βρήκα ${scored.length} εκκρεμείς λογαριασμούς ${fmtEur(p.amount)} που ταιριάζουν εξίσου. Ποιον εξοφλεί αυτή η απόδειξη;`
      : `Ο λογαριασμός που βρήκα ταιριάζει μόνο στο ποσό. Να τον σημειώσω εξοφλημένο;`,
  };
}

/**
 * Παλιά υπογραφή (boolean-ish): επιστρέφει λογαριασμό ΜΟΝΟ όταν η βεβαιότητα
 * είναι πλήρης. Διατηρείται για τα σημεία που δεν μπορούν να ρωτήσουν τον χρήστη
 * (μαζική εισαγωγή τραπεζικού αντιγράφου): εκεί «δεν ξέρω» σημαίνει «μην αγγίξεις».
 */
export function matchBillToPayment<T extends MatchCandidate>(
  t: PaymentEvidence,
  pendingBills: T[],
  used: Set<string> = new Set(),
): T | null {
  const r = matchPaymentToBills(t, pendingBills, used);
  return r.verdict === 'confident' && r.best ? r.best.bill : null;
}

// ── Έλεγχος πληρότητας εξαγωγής (για να μη σώζουμε παραπλανητικά δεδομένα) ──
export interface ExtractedLike {
  provider?: string; category?: string; amount?: number; due_date?: string;
  kwh?: number | null; cubic_meters?: number | null; millesimi?: number | null;
}
export function assessCompleteness(e: ExtractedLike): { blocking: string[]; recommended: string[] } {
  const blocking: string[] = [];
  if (!e.provider || !String(e.provider).trim()) blocking.push('provider');
  if (!e.amount || e.amount <= 0) blocking.push('amount');
  const recommended: string[] = [];
  if (!e.due_date) recommended.push('due_date');
  if (e.category === 'electricity' && !e.kwh) recommended.push('kwh');
  if ((e.category === 'water' || e.category === 'gas') && !e.cubic_meters) recommended.push('cubic_meters');
  if (e.category === 'common' && !e.millesimi) recommended.push('millesimi');
  return { blocking, recommended };
}
