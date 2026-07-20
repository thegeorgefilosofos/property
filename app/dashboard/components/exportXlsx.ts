// ═══════════════════════════════════════════════════════════════════════════
// exportXlsx — ΜΙΑ κοινή, «λογιστικού επιπέδου» εξαγωγή .xlsx για όλο το app.
//
// Γιατί .xlsx κι όχι .csv: τα πραγματικά κελιά δεν «σπάνε» ποτέ από locale/
// διαχωριστικό (το πρόβλημα «όλα στη στήλη A»), κρατούν τους αριθμούς ως αριθμούς
// (σωστή ταξινόμηση/άθροιση), δίνουν φίλτρα (AutoFilter) και μορφή δύο δεκαδικών.
// Χωρίς χρώματα/θόρυβο: καθαρός, επαγγελματικός πίνακας — σαν επίσημο έγγραφο.
//
// Ασφάλεια: σε .xlsx τα string κελιά είναι κείμενο (t:'s'), όχι τύποι — δεν υπάρχει
// formula-injection όπως στο CSV.
// ═══════════════════════════════════════════════════════════════════════════
import * as XLSX from 'xlsx';

export type XlsxKind = 'text' | 'date' | 'eur' | 'int' | 'pct' | 'num';
export type XlsxCol = { header: string; width?: number; kind?: XlsxKind };
export type XlsxCell = string | number | Date | null | undefined;
export type XlsxSheet = { name: string; columns: XlsxCol[]; rows: XlsxCell[][] };

// Μορφές αριθμών (το Excel αποδίδει «.»/«,» κατά locale· εδώ ορίζουμε μόνο τη δομή).
const FMT: Record<string, string> = {
  eur: '#,##0.00;-#,##0.00',
  num: '#,##0.00',
  int: '#,##0',
  pct: '0.0%',
  date: 'dd/mm/yyyy',
};

/** Κατεβάζει ένα .xlsx με ένα ή περισσότερα φύλλα, με φίλτρα, πλάτη στηλών και
 *  σωστές μορφές αριθμών/ημερομηνιών. */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  for (const sh of sheets) {
    const header = sh.columns.map(c => c.header);
    const aoa: XlsxCell[][] = [header, ...sh.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

    // Πλάτη στηλών: ελάχιστο βάσει επικεφαλίδας, ή ρητό.
    ws['!cols'] = sh.columns.map(c => ({ wch: c.width ?? Math.max(10, c.header.length + 3) }));

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = 0; C <= range.e.c; C++) {
      const kind = sh.columns[C]?.kind;
      if (!kind || kind === 'text') continue;
      const z = FMT[kind];
      for (let R = 1; R <= range.e.r; R++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (!cell || cell.v == null || cell.v === '') continue;
        if (kind === 'date') { cell.t = 'd'; cell.z = z; }
        else if (typeof cell.v === 'number') { cell.t = 'n'; cell.z = z; }
      }
    }

    // AutoFilter σε όλο τον πίνακα → φίλτρα ανά στήλη (ημ/νία, κατηγορία, κατάσταση…).
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };

    // Μοναδικό, έγκυρο όνομα φύλλου (≤31 χαρ., όχι διπλότυπα).
    let name = (sh.name || 'Φύλλο').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Φύλλο';
    let i = 2; const base = name;
    while (used.has(name)) name = `${base.slice(0, 28)} ${i++}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const out = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}
