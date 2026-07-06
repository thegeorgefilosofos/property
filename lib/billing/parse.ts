// ═══════════════════════════════════════════════════════════════════════════
// lib/billing/parse.ts — καθαρή (pure), δοκιμάσιμη λογική ανάλυσης λογαριασμών &
// τραπεζικών κινήσεων. Χρησιμοποιείται από BillsBankImport / BillsAIScan ώστε τα
// tests να καλύπτουν τον ΠΡΑΓΜΑΤΙΚΟ κώδικα, όχι αντίγραφο.
// ═══════════════════════════════════════════════════════════════════════════

export type Category =
  | 'electricity' | 'water' | 'gas' | 'internet' | 'streaming' | 'insurance'
  | 'taxes' | 'municipal' | 'security' | 'common' | 'maintenance'
  | 'elevator' | 'pool' | 'gardener' | 'cleaner' | 'plumber' | 'electrician'
  | 'rent_income' | 'other';

export type Confidence = 'high' | 'medium' | 'low';

export interface ParsedTransaction {
  id: string; date: string; description: string; amount: number;
  debit: boolean; category: string; confidence: Confidence;
  selected: boolean; matched: string;
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
// Ανθεκτικό σε: κόμμα/semicolon/tab διαχωριστές, ελληνικά (1.234,56) & διεθνή
// (1,234.56) δεκαδικά, ημερομηνίες d/m/y & y-m-d, πρόσημα +/- και στήλες χρέωσης.
// Μετατροπή στήλης ημερομηνίας → ISO (YYYY-MM-DD). Δέχεται d/m/y, d-m-y, d.m.y,
// y-m-d, με 2ψήφιο ή 4ψήφιο έτος. Επιστρέφει '' αν δεν είναι ημερομηνία.
export function parseDate(col: string): string {
  const c = (col || '').trim();
  if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(c)) {
    const parts = c.split(/[\/\-.]/);
    const [d, m, y] = parts[0].length === 4 ? [parts[2], parts[1], parts[0]] : parts;
    return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(c)) {
    const [y, m, d] = c.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

// Μετατροπή στήλης ποσού → αριθμός ΜΕ πρόσημο (ελληνικά/διεθνή δεκαδικά, €).
// Επιστρέφει null αν δεν είναι έγκυρο χρηματικό ποσό.
export function parseAmount(col: string): number | null {
  const raw = (col || '').replace(/[€\s]/g, '');
  if (!/^[-+]?[\d.,]+$/.test(raw) || !/\d/.test(raw)) return null;
  const clean = (/,\d{1,2}$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(clean);
  if (isNaN(n) || Math.abs(n) <= 0.01 || Math.abs(n) >= 1000000) return null;
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

export function matchBillToPayment(
  t: { amount: number; date: string; category: string },
  pendingBills: PendingBill[],
  used: Set<string>,
): PendingBill | null {
  const cands = pendingBills.filter(b => !used.has(b.id)
    && Math.abs((b.amount || 0) - t.amount) <= Math.max(0.5, t.amount * 0.02)
    && withinDays(b.due_date || b.created_at, t.date, 25));
  return cands.find(b => b.category === t.category) || cands[0] || null;
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
