import { ELP_ALL, elpAccount, elpAccountFor, type ElpAccount } from '../tax/elpAccounts';
import { fe } from '../core/format';
import { csvCell } from '../core/csv';
// ═══════════════════════════════════════════════════════════════════════════
// journal — Καθαρή double-entry (διπλογραφική) μηχανή για το λογιστικό handoff.
//
// Μετατρέπει τα έσοδα (εισπραγμένα ενοίκια) και τα έξοδα μιας περιόδου σε
// ισοσκελισμένες εγγραφές ημερολογίου (χρέωση = πίστωση). Τροφοδοτεί ΚΑΙ την
// εξαγωγή journal CSV (Soft1/Epsilon/QuickBooks/Xero) ΚΑΙ το ισοζύγιο για
// audit-grade tie-out.
//
// ΤΟ ΣΧΕΔΙΟ ΛΟΓΑΡΙΑΣΜΩΝ ΕΙΝΑΙ ΕΝΑ, ΚΑΙ ΕΙΝΑΙ ΤΟΥ ΝΟΜΟΥ: τα ΕΛΠ του ν. 4308/2014
// (lib/tax/elpAccounts.ts), αντιγραμμένα από το Παράρτημα Γ. Δεν γράφεται εδώ
// ούτε ένας κωδικός: όποιος γράφεται δεύτερη φορά, αποκλίνει.
//
// Σύμβαση: ταμειακή βάση. Είσπραξη ενοικίου → Χρέωση 38 (Ταμειακά διαθέσιμα) /
// Πίστωση 71.04 (Άλλα λειτουργικά έσοδα). Πληρωμή εξόδου → Χρέωση 64.xx /
// Πίστωση 38.
// ═══════════════════════════════════════════════════════════════════════════

export interface JournalLine {
  date: string;         // YYYY-MM-DD
  code: string;         // κωδικός λογαριασμού των ΕΛΠ (π.χ. 64.02)
  account: string;      // όνομα λογαριασμού
  description: string;
  debit: number;        // χρέωση
  credit: number;       // πίστωση
  doc?: string;         // παραστατικό / αναφορά
  party?: string;       // αντισυμβαλλόμενος (όνομα ή ΑΦΜ)
  art?: number;         // αριθμός λογιστικού άρθρου (ομαδοποιεί χρέωση+πίστωση)
  property?: string;    // κέντρο κόστους (ακίνητο) — αναλυτική παρακολούθηση ανά ακίνητο
}

export interface IncomeRec { date: string; amount: number; description?: string; property?: string; party?: string; doc?: string }
export interface ExpenseRec { date: string; amount: number; category?: string; description?: string; property?: string; party?: string; doc?: string }
/** Δόση δανείου: το συνολικό ποσό πληρωμής + το τμήμα τόκων (τα υπόλοιπα = χρεολύσιο). */
export interface LoanPaymentRec { date: string; amount: number; interest: number; description?: string; property?: string; party?: string; doc?: string }

/**
 * Οι λογαριασμοί που κινεί κάθε άρθρο, με τα ονόματα του νόμου.
 *
 * ΤΟ ΕΝΟΙΚΙΟ ΕΙΝΑΙ «ΑΛΛΟ ΛΕΙΤΟΥΡΓΙΚΟ ΕΣΟΔΟ» ΚΑΙ ΟΧΙ ΠΩΛΗΣΗ ΥΠΗΡΕΣΙΩΝ. Το
 * Παράρτημα Ε αντιστοιχεί ρητά το ΕΓΛΣ 75.00 «Έσοδα από ενοίκια» στο ΕΛΠ 71.04.
 * Η αιτιολογία κάθε γραμμής λέει ούτως ή άλλως «Είσπραξη ενοικίου».
 */
const acct = (code: string): ElpAccount => {
  const a = elpAccount(code);
  if (!a) throw new Error(`Άγνωστος λογαριασμός ΕΛΠ: ${code}`);
  return a;
};

export const ACCOUNTS = {
  bank: acct('38'),
  rentIncome: acct('71.04'),
  loanInterest: acct('65.01'),
  loanPrincipal: acct('52'),
} as const;

/**
 * Ο λογαριασμός μιας δαπάνης.
 *
 * Η ΑΝΤΙΣΤΟΙΧΙΣΗ ΖΕΙ ΣΤΟ elpAccounts.ts, ΜΙΑ ΦΟΡΑ. Ήταν γραμμένη δύο φορές —
 * εδώ ανά κωδικό ΕΓΛΣ και εκεί ανά κατηγορία — και διαφωνούσαν σε δεκατέσσερις
 * από τις είκοσι επτά κατηγορίες: η ίδια θέρμανση εμφανιζόταν «Ενέργεια» στο
 * ένα έγγραφο και «Λοιπά έξοδα» στο άλλο, χωρίς κανένα σφάλμα πουθενά.
 *
 * Η αναζήτηση με λέξεις-κλειδιά μένει για ό,τι γράφτηκε ελεύθερα ως κείμενο
 * («Λογαριασμός νερού») πριν υπάρξουν κατηγορίες.
 */
export function expenseAccount(category?: string | null): ElpAccount {
  const key = String(category || '').trim().toLowerCase();
  const direct = elpAccountFor(key);
  if (direct) return direct;
  if (/ρεύμ|ενέργ|αέρι|θέρμ|electric|δεη|gas|heat/.test(key)) return acct('64.02');
  if (/νερ|ύδρ|water/.test(key)) return acct('64.03');
  if (/τηλέφ|internet|τηλεπικοιν/.test(key)) return acct('64.04');
  if (/ασφάλ|insur/.test(key)) return acct('64.06');
  if (/φόρ|ενφια|enfia|tax|τέλ/.test(key)) return acct('64.11');
  if (/τόκ|δάνει|interest|loan/.test(key)) return acct('65.01');
  if (/επισκ|συντήρ|renov|mainten|υδραυλ|ηλεκτρολ/.test(key)) return acct('64.09');
  if (/αμοιβ|καθαρ|κήπ|πισίν|clean|garden|δικηγ|συμβολαιογρ|μηχανικ|μεσιτ/.test(key)) return acct('64.01');
  return acct('64.12');
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const short = (s?: string) => (s || '').replace(/\s+/g, ' ').trim();

/** Χτίζει ισοσκελισμένο ημερολόγιο — ένα άρθρο (voucher) ανά εγγραφή, ταξινομημένο
 * κατά ημερομηνία, με σειριακό αριθμό άρθρου (art) που κρατά μαζί χρέωση+πίστωση. */
export function buildJournal(input: { incomes: IncomeRec[]; expenses: ExpenseRec[]; loanPayments?: LoanPaymentRec[] }): JournalLine[] {
  const vouchers: JournalLine[][] = [];

  for (const inc of input.incomes || []) {
    const amt = round2(inc.amount);
    if (!amt) continue;
    const desc = short(inc.description) || `Είσπραξη ενοικίου${inc.property ? ` · ${inc.property}` : ''}`;
    vouchers.push([
      { date: inc.date, code: ACCOUNTS.bank.code, account: ACCOUNTS.bank.name, description: desc, debit: amt, credit: 0, doc: inc.doc, party: inc.party, property: inc.property },
      { date: inc.date, code: ACCOUNTS.rentIncome.code, account: ACCOUNTS.rentIncome.name, description: desc, debit: 0, credit: amt, doc: inc.doc, party: inc.party, property: inc.property },
    ]);
  }

  for (const ex of input.expenses || []) {
    const amt = round2(ex.amount);
    if (!amt) continue;
    const acc = expenseAccount(ex.category);
    const desc = short(ex.description) || `${acc.name}${ex.property ? ` · ${ex.property}` : ''}`;
    vouchers.push([
      { date: ex.date, code: acc.code, account: acc.name, description: desc, debit: amt, credit: 0, doc: ex.doc, party: ex.party, property: ex.property },
      { date: ex.date, code: ACCOUNTS.bank.code, account: ACCOUNTS.bank.name, description: desc, debit: 0, credit: amt, doc: ex.doc, party: ex.party, property: ex.property },
    ]);
  }

  // Δόσεις δανείου — σωστό διπλογραφικό άρθρο: Χρέωση 65 (τόκοι) + Χρέωση 45
  // (χρεολύσιο = μείωση υποχρέωσης) / Πίστωση 38 (Ταμείο). Ο τόκος είναι έξοδο· το
  // κεφάλαιο ΔΕΝ είναι έξοδο (μειώνει το δάνειο), όπως επιβάλλει το ΕΓΛΣ.
  for (const lp of input.loanPayments || []) {
    const amt = round2(lp.amount);
    if (!amt) continue;
    const interest = Math.max(0, Math.min(amt, round2(lp.interest)));
    const principal = round2(amt - interest);
    const desc = short(lp.description) || `Δόση δανείου${lp.property ? ` · ${lp.property}` : ''}`;
    const v: JournalLine[] = [];
    if (interest > 0) v.push({ date: lp.date, code: ACCOUNTS.loanInterest.code, account: ACCOUNTS.loanInterest.name, description: desc, debit: interest, credit: 0, doc: lp.doc, party: lp.party, property: lp.property });
    if (principal > 0) v.push({ date: lp.date, code: ACCOUNTS.loanPrincipal.code, account: ACCOUNTS.loanPrincipal.name, description: desc, debit: principal, credit: 0, doc: lp.doc, party: lp.party, property: lp.property });
    v.push({ date: lp.date, code: ACCOUNTS.bank.code, account: ACCOUNTS.bank.name, description: desc, debit: 0, credit: amt, doc: lp.doc, party: lp.party, property: lp.property });
    vouchers.push(v);
  }

  // Ταξινόμηση άρθρων κατά ημερομηνία (σταθερή), μετά σειριακή αρίθμηση άρθρων.
  vouchers.sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : 0));
  const lines: JournalLine[] = [];
  vouchers.forEach((v, i) => { for (const l of v) { l.art = i + 1; lines.push(l); } });
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
// Ο έλεγχος ζει στο lib/core/csv: ο ίδιος για κάθε αρχείο που ανοίγει σε φύλλο.
const csvField = (v: unknown, sep: string) => csvCell(v, sep);
const n2 = (n: number) => (Number(n) || 0).toFixed(2);                 // dot decimal
const n2gr = (n: number) => (Number(n) || 0).toFixed(2).replace('.', ','); // comma decimal
const dmy = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); }; // DD/MM/YYYY (EU / Xero / Ελλάδα)
const mdy = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[2]}/${m[3]}/${m[1]}` : (iso || ''); }; // MM/DD/YYYY (QuickBooks US default)

// Τα αρχεία αυτά είναι ΑΡΧΕΙΑ ΕΙΣΑΓΩΓΗΣ, όχι εκτυπώσεις: κάθε γραμμή είναι μία
// κίνηση και τίποτα άλλο. Γι' αυτό ΔΕΝ περιέχουν γραμμές συνόλων ή τίτλους — ένα
// «ΣΥΝΟΛΑ» στο τέλος το διαβάζει ο import wizard ως κίνηση χωρίς λογαριασμό και
// απορρίπτει το άρθρο. Τα σύνολα τα βλέπει ο χρήστης στο Excel και στην οθόνη.

/** Soft1 / Epsilon — ελληνικό ημερολόγιο άρθρων: «;», κόμμα δεκαδικά, DD/MM/YYYY,
 * μία γραμμή ανά κίνηση, ομαδοποιημένες σε αριθμημένα άρθρα (χρέωση=πίστωση/άρθρο).
 * Στήλες που τα import wizards των παρόχων αντιστοιχίζουν κατευθείαν, μαζί με κέντρο
 * κόστους (ακίνητο) για αναλυτική παρακολούθηση ανά ακίνητο. */

// ═══════════════════════════════════════════════════════════════════════════
// ΓΙΑΤΙ ΤΟ ΑΡΧΕΙΟ ΓΡΑΦΕΙ ΕΝΑ ΣΧΕΔΙΟ ΚΑΙ ΟΧΙ ΔΥΟ
// ─────────────────────────────────────────────────────────────────────────
// Εδώ κάθονταν δύο στήλες κωδικών: ΕΓΛΣ στη θέση του λογαριασμού και ΕΛΠ σε
// δική της στήλη στο τέλος. Η δεύτερη παραγόταν από την πρώτη με έναν πίνακα
// γραμμένο από μνήμη, ενώ το φύλλο του λογιστή έβγαζε τον ίδιο λογαριασμό από
// την ΚΑΤΗΓΟΡΙΑ: το ίδιο έξοδο έπαιρνε δύο διαφορετικούς λογαριασμούς ΕΛΠ,
// ανάλογα με το ποιο έγγραφο άνοιγες.
//
// Το σχέδιο είναι πλέον ΕΝΑ, των ΕΛΠ, και ζει στο lib/tax/elpAccounts.ts. Η
// αντιστοιχία με το ΕΓΛΣ δεν χάθηκε: κάθε λογαριασμός την κουβαλά, όπως τη
// γράφει το Παράρτημα Ε του νόμου, και ταξιδεύει στο φύλλο «Λογαριασμοί ΕΛΠ»
// του Excel — εκεί που υπάρχει πλάτος να γραφτεί ολόκληρη και σωστά.
// ═══════════════════════════════════════════════════════════════════════════

export function journalCsvGeneric(lines: JournalLine[]): string {
  const head = ['Αρ.Άρθρου', 'Ημ/νία', 'Κωδικός ΕΛΠ', 'Περιγραφή Λογαριασμού', 'Αιτιολογία', 'Χρέωση', 'Πίστωση', 'Παραστατικό', 'ΑΦΜ/Αντισυμβ.', 'Κέντρο Κόστους'];
  const rows = lines.map(l => [
    String(l.art ?? ''), dmy(l.date), l.code, l.account, l.description,
    // Και οι δύο αριθμητικές στήλες πάντα συμπληρωμένες (0,00 όπου δεν υπάρχει ποσό):
    // τα ελληνικά import wizards περιμένουν αριθμητικό πεδίο, όχι κενό.
    n2gr(l.debit), n2gr(l.credit), l.doc || '', l.party || '', l.property || '',
  ]);
  return [head, ...rows].map(r => r.map(c => csvField(c, ';')).join(';')).join('\r\n');
}

/** QuickBooks — Journal Entry import (SaasAnt / Transaction Pro layout): Journal No
 * ομαδοποιεί το άρθρο, MM/DD/YYYY, Debits/Credits σε ξεχωριστές στήλες, τελεία δεκαδικά.
 * Το Account γράφεται «κωδικός:όνομα» (η ιεραρχία που περιμένει το QuickBooks) και
 * δηλώνεται ρητά Currency, ώστε να μην πέφτει στο προεπιλεγμένο νόμισμα του αρχείου. */
export function journalCsvQuickBooks(lines: JournalLine[]): string {
  const head = ['Journal No', 'Journal Date', 'Account', 'Debits', 'Credits', 'Memo/Description', 'Name', 'Currency', 'Class'];
  const rows = lines.map(l => [
    String(l.art ?? ''), mdy(l.date), `${l.code}:${l.account}`,
    l.debit ? n2(l.debit) : '', l.credit ? n2(l.credit) : '',
    l.description, l.party || '', 'EUR', l.property || '',
  ]);
  return [head, ...rows].map(r => r.map(c => csvField(c, ',')).join(',')).join('\r\n');
}

/** Xero — Manual Journal import template: *Narration ΙΔΙΑ για όλες τις γραμμές ενός
 * άρθρου (έτσι το Xero τις ομαδοποιεί σε ΕΝΑ journal· αν διαφέρει ανά γραμμή, σπάει σε
 * χωριστά journals), *Date DD/MM/YYYY, *AccountCode, *TaxRate, *Amount ΠΡΟΣΗΜΑΣΜΕΝΟ
 * (θετικό=χρέωση, αρνητικό=πίστωση· κάθε άρθρο αθροίζει στο 0). */
export function journalCsvXero(lines: JournalLine[], narration = 'Property OS · Ημερολόγιο'): string {
  const head = ['*Narration', '*Date', 'Description', '*AccountCode', '*TaxRate', '*Amount', 'TrackingName1', 'TrackingOption1'];
  // Η αιτιολογία του ΠΡΩΤΟΥ σκέλους κάθε άρθρου γίνεται η κοινή narration του άρθρου.
  const artNarration = new Map<number, string>();
  for (const l of lines) { if (l.art != null && !artNarration.has(l.art)) artNarration.set(l.art, l.description); }
  const rows = lines.map(l => [
    l.art != null ? `${narration} · Άρθρο ${l.art}: ${artNarration.get(l.art) || ''}`.trim() : narration,
    dmy(l.date), l.description, l.code, 'Tax Exempt (0%)', n2(l.debit ? l.debit : -l.credit),
    l.property ? 'Ακίνητο' : '', l.property || '',
  ]);
  return [head, ...rows].map(r => r.map(c => csvField(c, ',')).join(',')).join('\r\n');
}

export type JournalFormat = 'generic' | 'quickbooks' | 'xero';
export function journalToCsv(lines: JournalLine[], format: JournalFormat, narration?: string): string {
  if (format === 'quickbooks') return journalCsvQuickBooks(lines);
  if (format === 'xero') return journalCsvXero(lines, narration);
  return journalCsvGeneric(lines);
}

// ── Έλεγχος ισοζυγίου (πραγματικός λογιστικός audit, όχι απλή ένδειξη) ─────────
// Οι κανόνες ακολουθούν τα Ελληνικά Λογιστικά Πρότυπα: κάθε άρθρο ισοσκελισμένο
// (Χρέωση = Πίστωση), έγκυροι λογαριασμοί του σχεδίου, ταμειακή συμφωνία
// (Ταμείο = Έσοδα − Έξοδα), μονομερή θετικά ποσά, ημερομηνίες εντός περιόδου.
// Ισχύει ΤΟ ΙΔΙΟ για ολόκληρο έτος, για μεμονωμένο μήνα και για προηγούμενα έτη.
// Αντίγραφο του fe με απλό κενό. Ένα σημείο, το lib/core/format.ts.
const money = fe;
// Έγκυρος είναι ΟΠΟΙΟΣ ΥΠΑΡΧΕΙ ΣΤΟ ΣΧΕΔΙΟ, όχι όποιος τύχει να χρησιμοποιείται
// σήμερα: ο κατάλογος βγαίνει από τον νόμο και δεν συντηρείται χωριστά.
const KNOWN_CODES = new Set<string>(ELP_ALL.map(a => a.code));

export type AuditStatus = 'pass' | 'warn' | 'fail';
export interface AuditCheck { key: string; label: string; status: AuditStatus; detail: string; fix?: string }
export interface JournalAudit { ok: boolean; tone: 'positive' | 'warning' | 'negative'; summary: string; checks: AuditCheck[] }

export function auditJournal(lines: JournalLine[], opts?: { year?: number; month?: number }): JournalAudit {
  const checks: AuditCheck[] = [];

  // 1) Ισοσκέλιση συνόλων.
  const t = journalTotals(lines);
  checks.push({
    key: 'balance', label: 'Ισοσκέλιση (σύνολο χρέωσης = σύνολο πίστωσης)',
    status: t.balanced ? 'pass' : 'fail',
    detail: `Χρέωση ${money(t.debit)} · Πίστωση ${money(t.credit)}${t.balanced ? '' : ` · Διαφορά ${money(round2(t.debit - t.credit))}`}`,
    ...(t.balanced ? {} : { fix: 'Κάθε κίνηση πρέπει να έχει χρέωση και πίστωση ίσου ποσού. Εντόπισε την εγγραφή που λείπει το ένα σκέλος.' }),
  });

  // 2) Ισοσκέλιση ανά άρθρο (κάθε παραστατικό: ημερομηνία + αιτιολογία).
  const vmap = new Map<string, { d: number; c: number }>();
  for (const l of lines) { const k = `${l.date}|${l.description}`; const v = vmap.get(k) || { d: 0, c: 0 }; v.d += l.debit; v.c += l.credit; vmap.set(k, v); }
  const unbalanced = [...vmap.values()].filter(v => Math.abs(round2(v.d - v.c)) >= 0.005).length;
  checks.push({
    key: 'articles', label: 'Ισοσκέλιση ανά άρθρο (διπλογραφική)',
    status: unbalanced ? 'fail' : 'pass',
    detail: unbalanced ? `${unbalanced} μη ισοσκελισμένα άρθρα` : `${vmap.size} άρθρα, όλα ισοσκελισμένα`,
    ...(unbalanced ? { fix: 'Σε κάθε άρθρο το σύνολο της χρέωσης πρέπει να ισούται με το σύνολο της πίστωσης. Διόρθωσε το ποσό στο άρθρο που δεν κλείνει.' } : {}),
  });

  // 3) Έγκυροι λογαριασμοί (ΕΓΛΣ).
  const invalid = [...new Set(lines.filter(l => !KNOWN_CODES.has(l.code)).map(l => l.code))];
  checks.push({
    key: 'accounts', label: 'Έγκυροι λογαριασμοί (Ελληνικό Λογιστικό Σχέδιο)',
    status: invalid.length ? 'fail' : 'pass',
    detail: invalid.length ? `Άγνωστοι κωδικοί: ${invalid.join(', ')}` : 'Όλοι οι λογαριασμοί αναγνωρίζονται',
    ...(invalid.length ? { fix: 'Αντιστοίχισε τους άγνωστους κωδικούς σε λογαριασμούς του δικού σου λογιστικού σχεδίου κατά την εισαγωγή.' } : {}),
  });

  // 4) Ταξινόμηση εξόδων — προειδοποίηση για ό,τι έμεινε στα «64.12 Λοιπά έξοδα».
  const uncat = lines.filter(l => l.code === '64.12' && l.debit > 0);
  const uncatSum = round2(uncat.reduce((s, l) => s + l.debit, 0));
  checks.push({
    key: 'classify', label: 'Ταξινόμηση εξόδων σε λογαριασμούς',
    status: uncat.length ? 'warn' : 'pass',
    detail: uncat.length ? `${uncat.length === 1 ? '1 εγγραφή παρέμεινε' : `${uncat.length} εγγραφές παρέμειναν`} στα «64.12 Λοιπά έξοδα» (${money(uncatSum)})` : 'Όλα τα έξοδα ταξινομημένα',
    ...(uncat.length ? { fix: 'Όρισε κατηγορία στο έξοδο (π.χ. ρεύμα, κοινόχρηστα, συντήρηση) ώστε να μεταφερθεί αυτόματα στον σωστό λογαριασμό εξόδων.' } : {}),
  });

  // 5) Ταμειακή συμφωνία (tie-out): Ταμείο (38) = Έσοδα (7) − Έξοδα (6) − Χρεολύσια (52).
  // Το χρεολύσιο είναι εκροή μετρητών που ΔΕΝ είναι έξοδο: μειώνει υποχρέωση, και
  // στα ΕΛΠ οι υποχρεώσεις είναι η ομάδα 5 (στο ΕΓΛΣ ήταν η 4).
  const tb = trialBalance(lines);
  const cash = round2(tb.filter(r => r.code.startsWith('38')).reduce((s, r) => s + r.balance, 0));
  const income = round2(tb.filter(r => /^7/.test(r.code)).reduce((s, r) => s + (r.credit - r.debit), 0));
  const expense = round2(tb.filter(r => /^6/.test(r.code)).reduce((s, r) => s + (r.debit - r.credit), 0));
  const principal = round2(tb.filter(r => /^5/.test(r.code)).reduce((s, r) => s + (r.debit - r.credit), 0));
  const net = round2(income - expense - principal);
  const tie = Math.abs(round2(cash - net)) < 0.005;
  checks.push({
    key: 'tieout', label: 'Ταμειακή συμφωνία (Ταμείο = Έσοδα − Έξοδα − Χρεολύσια)',
    status: tie ? 'pass' : 'fail',
    detail: `Ταμείο ${money(cash)} · Έσοδα ${money(income)} · Έξοδα ${money(expense)}${principal ? ` · Χρεολύσια ${money(principal)}` : ''}`,
    ...(tie ? {} : { fix: 'Το υπόλοιπο του ταμείου δεν συμφωνεί με έσοδα μείον έξοδα και χρεολύσια. Έλεγξε ότι όλες οι εισπράξεις και πληρωμές της περιόδου έχουν καταχωρηθεί.' }),
  });

  // 5β) Διαχωρισμός δόσεων δανείου: κάθε άρθρο με χρεολύσιο (52) πρέπει να έχει και
  // τόκους (65.01). Αλλιώς η δόση καταχωρήθηκε χωρίς διαχωρισμό (χαμένη έκπτωση τόκων).
  const artMap = new Map<number, Set<string>>();
  for (const l of lines) { if (l.art == null) continue; const s = artMap.get(l.art) || new Set<string>(); s.add(l.code); artMap.set(l.art, s); }
  const unsplitLoans = [...artMap.values()].filter(codes => codes.has(ACCOUNTS.loanPrincipal.code) && !codes.has(ACCOUNTS.loanInterest.code)).length;
  if (unsplitLoans > 0) {
    checks.push({
      key: 'loansplit', label: 'Διαχωρισμός δόσεων δανείου (τόκοι 65.01 · χρεολύσιο 52)',
      status: 'warn',
      detail: `${unsplitLoans} ${unsplitLoans === 1 ? 'δόση καταχωρήθηκε' : 'δόσεις καταχωρήθηκαν'} χωρίς διαχωρισμό τόκων.`,
      fix: 'Σύνδεσε το δάνειο (επιτόκιο και ημερομηνία έναρξης) ώστε να διαχωριστούν οι τόκοι από το χρεολύσιο και να εκπέσουν σωστά.',
    });
  } else if ([...artMap.values()].some(codes => codes.has(ACCOUNTS.loanInterest.code) && codes.has(ACCOUNTS.loanPrincipal.code))) {
    checks.push({
      key: 'loansplit', label: 'Διαχωρισμός δόσεων δανείου (τόκοι 65.01 · χρεολύσιο 52)',
      status: 'pass',
      detail: 'Οι δόσεις δανείου διαχωρίστηκαν σωστά σε τόκους και χρεολύσιο.',
    });
  }

  // 6) Εγκυρότητα ποσών: θετικά και μονομερή (όχι χρέωση & πίστωση μαζί, όχι μηδενικά).
  const bad = lines.filter(l => (l.debit < 0 || l.credit < 0) || (l.debit === 0 && l.credit === 0) || (l.debit > 0 && l.credit > 0)).length;
  checks.push({
    key: 'amounts', label: 'Εγκυρότητα ποσών (θετικά, μονομερή)',
    status: bad ? 'fail' : 'pass',
    detail: bad ? `${bad} εγγραφές με μη έγκυρο ποσό` : 'Όλα τα ποσά θετικά και μονομερή',
    ...(bad ? { fix: 'Κάθε εγγραφή πρέπει να έχει ένα θετικό ποσό, είτε στη χρέωση είτε στην πίστωση, ποτέ και στα δύο ή μηδενικό.' } : {}),
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
    ...(outside ? { fix: 'Μετέφερε ή διόρθωσε τις εγγραφές που βρίσκονται εκτός της επιλεγμένης περιόδου, ή άλλαξε την περίοδο εξαγωγής.' } : {}),
  });

  // Συνολική «λογιστική» ετυμηγορία — αντιδρά σαν λογιστής, όχι σαν απλή σημαία.
  const fails = checks.filter(c => c.status === 'fail');
  const warns = checks.filter(c => c.status === 'warn');
  const ok = fails.length === 0;
  let tone: JournalAudit['tone']; let summary: string;
  if (fails.length) {
    tone = 'negative';
    const bal = checks.find(c => c.key === 'balance');
    const tieP = checks.find(c => c.key === 'tieout');
    const hint = bal?.status === 'fail'
      ? `Το ημερολόγιο δεν ισοσκελίζει: ${bal.detail}. Κάθε κίνηση χρειάζεται χρέωση και πίστωση ίσου ποσού.`
      : tieP?.status === 'fail'
        ? `Το ταμείο δεν συμφωνεί με το αποτέλεσμα: ${tieP.detail}. Έλεγξε τις εισπράξεις και πληρωμές της περιόδου.`
        : `Βρέθηκαν ${fails.length} θέματα που εμποδίζουν την υποβολή. Δες αναλυτικά παρακάτω.`;
    summary = `Χρειάζεται διόρθωση πριν την καταχώρηση. ${hint}`;
  } else if (warns.length) {
    tone = 'warning';
    summary = `Ισοσκελισμένο και έτοιμο για εξαγωγή. ${warns.length === 1 ? 'Ένα σημείο βελτιώνει' : `${warns.length} σημεία βελτιώνουν`} την ακρίβεια της λογιστικής απεικόνισης.`;
  } else {
    tone = 'positive';
    summary = 'Ισοσκελισμένο και πλήρες. Το ημερολόγιο συμφωνεί με τα διπλογραφικά πρότυπα και είναι έτοιμο για καταχώρηση στον λογιστή.';
  }

  return { ok, tone, summary, checks };
}
