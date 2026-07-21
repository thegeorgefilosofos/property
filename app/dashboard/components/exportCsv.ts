// ═══════════════════════════════════════════════════════════════════════════
// exportCsv — ΜΙΑ κοινή εξαγωγή δεδομένων για ΟΛΑ τα tabs.
//
// Παλαιότερα παρήγαγε .csv· πλέον παράγει προσεγμένο, «λογιστικού επιπέδου» .xlsx
// (μέσω του κοινού exportXlsx/xlsxStyle): πραγματικά κελιά, έντονες γκρι
// επικεφαλίδες με πλαίσια, στοίχιση ανά τύπο, ελληνικοί αριθμοί («751,00 €»,
// «18,00%»), φίλτρα — ίδια εμφάνιση σε κάθε Excel, χωρίς το πρόβλημα «όλα στη
// στήλη A». Η υπογραφή παραμένει ίδια (filename, headers, rows), οπότε όλα τα
// tabs αναβαθμίζονται αυτόματα. Οι βοηθοί csvEur/csvDec/csvDate μένουν για τη
// μορφοποίηση κελιών από τους callers.
// ═══════════════════════════════════════════════════════════════════════════
import { downloadXlsx, type XlsxCol, type XlsxKind, type XlsxMode } from './exportXlsx';
export type { XlsxMode };

/** Ποσό € — δύο δεκαδικά, ελληνικό κόμμα («751,00»). Το σύμβολο «€» το δίνει η στήλη. */
export const csvEur = (n: number | null | undefined): string =>
  n == null ? '' : n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Δεκαδικός με κόμμα (ελληνικό Excel), π.χ. 5.2 → "5,2". */
export const csvDec = (n: number | null | undefined, d = 2): string =>
  n == null ? '' : n.toFixed(d).replace('.', ',');

/** Ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ. */
export const csvDate = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('el-GR');
};

// Διατηρείται για συμβατότητα (τα .xlsx string-κελιά είναι ήδη ασφαλή — όχι τύποι).
export const csvSafe = (s: string): string => s;

// Τύπος στήλης από την επικεφαλίδα (για στοίχιση/μορφή). Συντηρητικό: «€» ή
// επικεφαλίδα που ΞΕΚΙΝΑ με λέξη ποσού → eur· «%»/«ποσοστ» → pct· «ημερομ» → date.
const kindFromHeader = (h: string): XlsxKind => {
  const s = (h || '').trim().toLowerCase();
  if (/%|ποσοστ/.test(s)) return 'pct';
  if (/€/.test(s) || /^(ποσό|αξία|τιμή|κόστος|έσοδα|έξοδα|φόρος|ενοίκιο|οφειλή|εγγύηση|σύνολο|πληρωμή|υπόλοιπο|μίσθωμα|δαπάνη|εισόδημα)\b/.test(s)) return 'eur';
  if (/ημερομην|ημ\/ν|^ημ\./.test(s)) return 'date';
  if (/^έτος$/.test(s)) return 'year';
  return 'text';
};

/**
 * Κατεβάζει προσεγμένο .xlsx (ίδια υπογραφή με την παλιά CSV εξαγωγή).
 * @param filename όνομα αρχείου (με ή χωρίς κατάληξη)
 * @param headers  γραμμή επικεφαλίδων
 * @param rows     πίνακας γραμμών (κάθε γραμμή = πίνακας κελιών)
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][], opts: { mode?: XlsxMode } = {}): void {
  const columns: XlsxCol[] = headers.map(h => ({ header: h, kind: kindFromHeader(h) }));
  const cleanRows = rows.map(r => headers.map((_, i) => { const v = r[i]; return v == null ? '' : v; }));
  // Στη λειτουργία «δεδομένα» προσθέτουμε γραμμή ΣΥΝΟΛΟ (ζωντανό SUM) στις στήλες
  // ποσών, ώστε ο λογιστής να έχει έτοιμο, επεξεργάσιμο άθροισμα.
  const totalCols = opts.mode === 'data'
    ? columns.map((c, i) => (c.kind === 'eur' ? i : -1)).filter(i => i >= 0)
    : undefined;
  const base = filename.replace(/\.(csv|xlsx)$/i, '');
  const name = opts.mode === 'data' ? `${base} (δεδομένα)` : base;
  // Επώνυμη «σφραγίδα»: κάθε εξαγωγή φέρει το Property OS και την ημερομηνία έκδοσης.
  const issued = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  downloadXlsx(name, [{
    name: 'Δεδομένα', title: 'Property OS', subtitle: `Εξαγωγή δεδομένων · Ημερομηνία έκδοσης: ${issued}`,
    columns, rows: cleanRows, totalCols,
  }], { mode: opts.mode });
}
