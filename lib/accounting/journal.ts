// ═══════════════════════════════════════════════════════════════════════════
// journal — Καθαρή double-entry (διπλογραφική) μηχανή για το λογιστικό handoff.
//
// Μετατρέπει τα έσοδα (εισπραγμένα ενοίκια) και τα έξοδα μιας περιόδου σε
// ισοσκελισμένες εγγραφές ημερολογίου (χρέωση = πίστωση), με ελληνικό λογιστικό
// σχέδιο (ΕΓΛΣ-style). Τροφοδοτεί ΚΑΙ την εξαγωγή journal CSV (Soft1/Epsilon/
// QuickBooks/Xero) ΚΑΙ το ισοζύγιο/ισολογισμό (trial balance) για audit-grade
// tie-out. Καμία εξάρτηση — καθαρό & δοκιμάσιμο.
//
// Σύμβαση: ταμειακή βάση. Είσπραξη ενοικίου → Χρέωση 38 (Ταμείο) / Πίστωση 75
// (Έσοδα). Πληρωμή εξόδου → Χρέωση 6x (Έξοδο) / Πίστωση 38 (Ταμείο).
// ═══════════════════════════════════════════════════════════════════════════

export interface JournalLine {
  date: string;         // YYYY-MM-DD
  code: string;         // κωδικός λογαριασμού (π.χ. 62.03)
  account: string;      // όνομα λογαριασμού
  description: string;
  debit: number;        // χρέωση
  credit: number;       // πίστωση
  doc?: string;         // παραστατικό / αναφορά
  party?: string;       // αντισυμβαλλόμενος (όνομα ή ΑΦΜ)
}

export interface IncomeRec { date: string; amount: number; description?: string; property?: string; party?: string; doc?: string }
export interface ExpenseRec { date: string; amount: number; category?: string; description?: string; property?: string; party?: string; doc?: string }

interface Acct { code: string; name: string }

export const ACCOUNTS = {
  bank:       { code: '38.00', name: 'Ταμείο / Καταθέσεις' },
  rentIncome: { code: '75.00', name: 'Έσοδα από ενοίκια' },
} as const;

// Χαρτογράφηση κατηγορίας εξόδου → λογαριασμός (ΕΓΛΣ-style). Οι κωδικοί είναι
// ενδεικτικοί· ο λογιστής μπορεί να τους αντιστοιχίσει στο δικό του σχέδιο.
const EXPENSE_ACCOUNTS: Record<string, Acct> = {
  electricity: { code: '62.03', name: 'Ηλεκτρικό ρεύμα' },
  water:       { code: '62.02', name: 'Ύδρευση' },
  gas:         { code: '62.04', name: 'Αέριο / Θέρμανση' },
  internet:    { code: '62.01', name: 'Τηλεπικοινωνίες' },
  common:      { code: '62.98', name: 'Κοινόχρηστα' },
  insurance:   { code: '62.05', name: 'Ασφάλιστρα' },
  security:    { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  streaming:   { code: '64.98', name: 'Διάφορα έξοδα' },
  enfia:       { code: '63.00', name: 'Φόροι - Τέλη' },
  taxes:       { code: '63.00', name: 'Φόροι - Τέλη' },
  dimotika:    { code: '63.03', name: 'Δημοτικά τέλη' },
  municipal:   { code: '63.03', name: 'Δημοτικά τέλη' },
  cleaning:    { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  cleaner:     { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  garden:      { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  gardener:    { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  pool:        { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  elevator:    { code: '62.07', name: 'Επισκευές & συντήρηση' },
  ac_service:  { code: '62.07', name: 'Επισκευές & συντήρηση' },
  maintenance: { code: '62.07', name: 'Επισκευές & συντήρηση' },
  renovation:  { code: '62.07', name: 'Επισκευές & συντήρηση' },
  plumber:     { code: '62.07', name: 'Επισκευές & συντήρηση' },
  electrician: { code: '62.07', name: 'Επισκευές & συντήρηση' },
  pest:        { code: '61.00', name: 'Αμοιβές & έξοδα τρίτων' },
  interest:    { code: '65.00', name: 'Τόκοι & έξοδα δανείων' },
  other:       { code: '64.98', name: 'Διάφορα έξοδα' },
};

export function expenseAccount(category?: string | null): Acct {
  const key = String(category || '').trim().toLowerCase();
  if (key && EXPENSE_ACCOUNTS[key]) return EXPENSE_ACCOUNTS[key];
  // Fallback με λέξεις-κλειδιά (ελληνικά/αγγλικά).
  if (/ρεύμ|ενέργ|electric|δεη/.test(key)) return EXPENSE_ACCOUNTS.electricity;
  if (/νερ|ύδρ|water/.test(key)) return EXPENSE_ACCOUNTS.water;
  if (/κοινόχρ|common/.test(key)) return EXPENSE_ACCOUNTS.common;
  if (/ασφάλ|insur/.test(key)) return EXPENSE_ACCOUNTS.insurance;
  if (/φόρ|ενφια|enfia|tax|τέλ/.test(key)) return EXPENSE_ACCOUNTS.taxes;
  if (/τόκ|δάνει|interest|loan/.test(key)) return EXPENSE_ACCOUNTS.interest;
  if (/επισκ|συντήρ|renov|mainten|υδραυλ|ηλεκτρολ/.test(key)) return EXPENSE_ACCOUNTS.maintenance;
  if (/αμοιβ|καθαρ|κήπ|πισίν|clean|garden/.test(key)) return EXPENSE_ACCOUNTS.cleaning;
  return EXPENSE_ACCOUNTS.other;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const short = (s?: string) => (s || '').replace(/\s+/g, ' ').trim();

/** Χτίζει ισοσκελισμένο ημερολόγιο (ταξινομημένο κατά ημερομηνία). */
export function buildJournal(input: { incomes: IncomeRec[]; expenses: ExpenseRec[] }): JournalLine[] {
  const lines: JournalLine[] = [];

  for (const inc of input.incomes || []) {
    const amt = round2(inc.amount);
    if (!amt) continue;
    const desc = short(inc.description) || `Είσπραξη ενοικίου${inc.property ? ` — ${inc.property}` : ''}`;
    lines.push({ date: inc.date, code: ACCOUNTS.bank.code, account: ACCOUNTS.bank.name, description: desc, debit: amt, credit: 0, doc: inc.doc, party: inc.party });
    lines.push({ date: inc.date, code: ACCOUNTS.rentIncome.code, account: ACCOUNTS.rentIncome.name, description: desc, debit: 0, credit: amt, doc: inc.doc, party: inc.party });
  }

  for (const ex of input.expenses || []) {
    const amt = round2(ex.amount);
    if (!amt) continue;
    const acc = expenseAccount(ex.category);
    const desc = short(ex.description) || `${acc.name}${ex.property ? ` — ${ex.property}` : ''}`;
    lines.push({ date: ex.date, code: acc.code, account: acc.name, description: desc, debit: amt, credit: 0, doc: ex.doc, party: ex.party });
    lines.push({ date: ex.date, code: ACCOUNTS.bank.code, account: ACCOUNTS.bank.name, description: desc, debit: 0, credit: amt, doc: ex.doc, party: ex.party });
  }

  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return lines;
}

export function journalTotals(lines: JournalLine[]): { debit: number; credit: number; balanced: boolean } {
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 };
}

// ── Ισοζύγιο ανά λογαριασμό (trial balance) — βάση για ισολογισμό/tie-out ─────
export interface TrialRow { code: string; account: string; debit: number; credit: number; balance: number }
export function trialBalance(lines: JournalLine[]): TrialRow[] {
  const map = new Map<string, TrialRow>();
  for (const l of lines) {
    const r = map.get(l.code) || { code: l.code, account: l.account, debit: 0, credit: 0, balance: 0 };
    r.debit = round2(r.debit + l.debit);
    r.credit = round2(r.credit + l.credit);
    r.balance = round2(r.debit - r.credit);
    map.set(l.code, r);
  }
  return [...map.values()].sort((a, b) => (a.code < b.code ? -1 : 1));
}

// ── CSV formatters ───────────────────────────────────────────────────────────
const csvField = (v: unknown, sep: string) => {
  const s = String(v ?? '');
  return new RegExp(`["${sep === '\t' ? '\\t' : sep}\\n]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const n2 = (n: number) => (Number(n) || 0).toFixed(2);                 // dot decimal
const n2gr = (n: number) => (Number(n) || 0).toFixed(2).replace('.', ','); // comma decimal

/** Γενικό ελληνικό ημερολόγιο (Soft1 / Epsilon / λογιστής): «;» + κόμμα δεκαδικά. */
export function journalCsvGeneric(lines: JournalLine[]): string {
  const head = ['Ημερομηνία', 'Κωδικός', 'Λογαριασμός', 'Αιτιολογία', 'Χρέωση', 'Πίστωση', 'Παραστατικό', 'ΑΦΜ/Αντισυμβ.'];
  const rows = lines.map(l => [l.date, l.code, l.account, l.description, l.debit ? n2gr(l.debit) : '', l.credit ? n2gr(l.credit) : '', l.doc || '', l.party || '']);
  const t = journalTotals(lines);
  rows.push(['', '', 'ΣΥΝΟΛΑ', '', n2gr(t.debit), n2gr(t.credit), '', '']);
  return [head, ...rows].map(r => r.map(c => csvField(c, ';')).join(';')).join('\r\n');
}

/** QuickBooks (Journal import): Date, Account, Debit, Credit, Description. */
export function journalCsvQuickBooks(lines: JournalLine[]): string {
  const head = ['Date', 'Account', 'Debit', 'Credit', 'Description'];
  const rows = lines.map(l => [l.date, `${l.code} ${l.account}`, l.debit ? n2(l.debit) : '', l.credit ? n2(l.credit) : '', l.description]);
  return [head, ...rows].map(r => r.map(c => csvField(c, ',')).join(',')).join('\r\n');
}

/** Xero (Manual Journal template): *Narration,*Date,Description,*AccountCode,*TaxRate,*Amount (signed). */
export function journalCsvXero(lines: JournalLine[], narration = 'Property OS — Ημερολόγιο'): string {
  const head = ['*Narration', '*Date', 'Description', '*AccountCode', '*TaxRate', '*Amount'];
  const rows = lines.map(l => [narration, l.date, l.description, l.code, 'Tax Exempt (0%)', n2(l.debit ? l.debit : -l.credit)]);
  return [head, ...rows].map(r => r.map(c => csvField(c, ',')).join(',')).join('\r\n');
}

export type JournalFormat = 'generic' | 'quickbooks' | 'xero';
export function journalToCsv(lines: JournalLine[], format: JournalFormat, narration?: string): string {
  if (format === 'quickbooks') return journalCsvQuickBooks(lines);
  if (format === 'xero') return journalCsvXero(lines, narration);
  return journalCsvGeneric(lines);
}

// ── Έλεγχος ισοζυγίου (πραγματικός λογιστικός audit, όχι απλή ένδειξη) ─────────
// Οι κανόνες ακολουθούν το Ελληνικό Γενικό Λογιστικό Σχέδιο (ΕΓΛΣ): κάθε άρθρο
// ισοσκελισμένο (Χρέωση = Πίστωση), έγκυροι λογαριασμοί ομάδων, ταμειακή συμφωνία
// (Ταμείο = Έσοδα − Έξοδα), μονομερή θετικά ποσά, ημερομηνίες εντός περιόδου.
// Ισχύει ΤΟ ΙΔΙΟ για ολόκληρο έτος, για μεμονωμένο μήνα και για προηγούμενα έτη.
const money = (n: number) => `${(Number(n) || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const KNOWN_CODES = new Set<string>([ACCOUNTS.bank.code, ACCOUNTS.rentIncome.code, ...Object.values(EXPENSE_ACCOUNTS).map(a => a.code)]);

export type AuditStatus = 'pass' | 'warn' | 'fail';
export interface AuditCheck { key: string; label: string; status: AuditStatus; detail: string }
export interface JournalAudit { ok: boolean; checks: AuditCheck[] }

export function auditJournal(lines: JournalLine[], opts?: { year?: number; month?: number }): JournalAudit {
  const checks: AuditCheck[] = [];

  // 1) Ισοσκέλιση συνόλων.
  const t = journalTotals(lines);
  checks.push({
    key: 'balance', label: 'Ισοσκέλιση (Σύνολο Χρέωσης = Σύνολο Πίστωσης)',
    status: t.balanced ? 'pass' : 'fail',
    detail: `Χρέωση ${money(t.debit)} · Πίστωση ${money(t.credit)}${t.balanced ? '' : ` · Διαφορά ${money(round2(t.debit - t.credit))}`}`,
  });

  // 2) Ισοσκέλιση ανά άρθρο (κάθε παραστατικό: ημερομηνία + αιτιολογία).
  const vmap = new Map<string, { d: number; c: number }>();
  for (const l of lines) { const k = `${l.date}|${l.description}`; const v = vmap.get(k) || { d: 0, c: 0 }; v.d += l.debit; v.c += l.credit; vmap.set(k, v); }
  const unbalanced = [...vmap.values()].filter(v => Math.abs(round2(v.d - v.c)) >= 0.005).length;
  checks.push({
    key: 'articles', label: 'Ισοσκέλιση ανά άρθρο (διπλογραφική)',
    status: unbalanced ? 'fail' : 'pass',
    detail: unbalanced ? `${unbalanced} μη ισοσκελισμένα άρθρα` : `${vmap.size} άρθρα, όλα ισοσκελισμένα`,
  });

  // 3) Έγκυροι λογαριασμοί (ΕΓΛΣ).
  const invalid = [...new Set(lines.filter(l => !KNOWN_CODES.has(l.code)).map(l => l.code))];
  checks.push({
    key: 'accounts', label: 'Έγκυροι λογαριασμοί (Ελληνικό Λογιστικό Σχέδιο)',
    status: invalid.length ? 'fail' : 'pass',
    detail: invalid.length ? `Άγνωστοι κωδικοί: ${invalid.join(', ')}` : 'Όλοι οι λογαριασμοί αναγνωρίζονται',
  });

  // 4) Ταξινόμηση εξόδων — προειδοποίηση για ό,τι έμεινε στο «64.98 Διάφορα έξοδα».
  const uncat = lines.filter(l => l.code === '64.98' && l.debit > 0);
  const uncatSum = round2(uncat.reduce((s, l) => s + l.debit, 0));
  checks.push({
    key: 'classify', label: 'Ταξινόμηση εξόδων σε λογαριασμούς',
    status: uncat.length ? 'warn' : 'pass',
    detail: uncat.length ? `${uncat.length} εγγραφές σε «64.98 Διάφορα έξοδα» (${money(uncatSum)}) — δώσε κατηγορία για ακριβέστερη απεικόνιση` : 'Όλα τα έξοδα ταξινομημένα',
  });

  // 5) Ταμειακή συμφωνία (tie-out): Ταμείο (ομ. 38) = Έσοδα (ομ. 7) − Έξοδα (ομ. 6).
  const tb = trialBalance(lines);
  const cash = round2(tb.filter(r => r.code.startsWith('38')).reduce((s, r) => s + r.balance, 0));
  const income = round2(tb.filter(r => /^7/.test(r.code)).reduce((s, r) => s + (r.credit - r.debit), 0));
  const expense = round2(tb.filter(r => /^6/.test(r.code)).reduce((s, r) => s + (r.debit - r.credit), 0));
  const net = round2(income - expense);
  const tie = Math.abs(round2(cash - net)) < 0.005;
  checks.push({
    key: 'tieout', label: 'Ταμειακή συμφωνία (Ταμείο = Έσοδα − Έξοδα)',
    status: tie ? 'pass' : 'fail',
    detail: `Ταμείο ${money(cash)} = Έσοδα ${money(income)} − Έξοδα ${money(expense)} (${money(net)})`,
  });

  // 6) Εγκυρότητα ποσών: θετικά και μονομερή (όχι χρέωση & πίστωση μαζί, όχι μηδενικά).
  const bad = lines.filter(l => (l.debit < 0 || l.credit < 0) || (l.debit === 0 && l.credit === 0) || (l.debit > 0 && l.credit > 0)).length;
  checks.push({
    key: 'amounts', label: 'Εγκυρότητα ποσών (θετικά, μονομερή)',
    status: bad ? 'fail' : 'pass',
    detail: bad ? `${bad} εγγραφές με μη έγκυρο ποσό` : 'Όλα τα ποσά θετικά και μονομερή',
  });

  // 7) Ημερομηνίες εντός επιλεγμένης περιόδου (έτος + προαιρετικά μήνας).
  let outside = 0;
  if (opts?.year) {
    for (const l of lines) {
      const m = /^(\d{4})-(\d{2})/.exec(l.date);
      const okY = !!m && Number(m[1]) === opts.year;
      const okM = !opts.month || Number(m?.[2]) === opts.month;
      if (!(okY && okM)) outside++;
    }
  }
  checks.push({
    key: 'dates', label: 'Ημερομηνίες εντός περιόδου',
    status: outside ? 'fail' : 'pass',
    detail: outside ? `${outside} εγγραφές εκτός περιόδου` : 'Όλες οι εγγραφές εντός περιόδου',
  });

  return { ok: checks.every(c => c.status !== 'fail'), checks };
}
