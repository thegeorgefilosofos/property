// ═══════════════════════════════════════════════════════════════════════════
// exportCsv — ΜΙΑ κοινή συνάρτηση εξαγωγής CSV για ΟΛΑ τα tabs, ώστε κάθε
// εξαγωγή να έχει την ίδια, κορυφαία, «λογιστική» ποιότητα (επίπεδο tab Bills).
//
// Μορφή Ελληνικού Excel:
//   • διαχωριστικό «;» (ώστε τα κόμματα δεκαδικών να μη σπάνε τις στήλες)
//   • UTF-8 BOM (για σωστά ελληνικά)
//   • σωστό escaping εισαγωγικών/νέων γραμμών
// ═══════════════════════════════════════════════════════════════════════════

/** Μορφοποίηση ακέραιου ποσού € χωρίς διαχωριστικά χιλιάδων (καθαρό για Excel). */
export const csvEur = (n: number | null | undefined): string => (n == null ? '' : String(Math.round(n)));

/** Δεκαδικός με κόμμα (ελληνικό Excel), π.χ. 5.2 → "5,2". */
export const csvDec = (n: number | null | undefined, d = 2): string =>
  n == null ? '' : n.toFixed(d).replace('.', ',');

/** Ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ. */
export const csvDate = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('el-GR');
};

// Εξουδετέρωση CSV formula-injection: κελί που ξεκινά με = + - @ (ή tab/CR)
// εκτελείται ως τύπος από Excel/LibreOffice/Sheets όταν ανοίξει το αρχείο. Αφού τα
// πεδία (περιγραφές, ονόματα, σημειώσεις) ελέγχονται από τον χρήστη —ακόμη και από
// ανώνυμο μέσω tenant-portal— τα προθέτουμε με ' ώστε να μείνουν κείμενο. Εξαιρούνται
// οι καθαροί αριθμοί (π.χ. αρνητικά ποσά «-50», δεκαδικά «-5,2») για να μη χαλάσουν.
const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;
export const csvSafe = (s: string): string =>
  /^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s) ? `'${s}` : s;

const esc = (v: unknown): string => {
  const s = csvSafe(v == null ? '' : String(v));
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Κατεβάζει ένα CSV.
 * @param filename όνομα αρχείου (χωρίς ή με .csv)
 * @param headers  γραμμή επικεφαλίδων
 * @param rows     πίνακας γραμμών (κάθε γραμμή = πίνακας κελιών)
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const all = [headers, ...rows];
  const body = all.map(r => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
