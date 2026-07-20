'use client';
// ═══════════════════════════════════════════════════════════════════════════
// exportXlsx — κοινή, «λογιστικού επιπέδου» εξαγωγή .xlsx (στημένη πάνω στο
// κοινό στυλ xlsxStyle, ίδιο με φάκελο λογιστή/Ε2/τιμολόγηση).
//
// Κάθε φύλλο: τίτλος + υπότιτλος, έντονες αναδιπλωμένες επικεφαλίδες σε γκρι
// φόντο, πλαίσια, στοίχιση ανά τύπο (ημερομηνίες κεντραρισμένες, ποσά δεξιά),
// ελληνική μορφή νομίσματος/αριθμών («1.234,56 €»), προαιρετική γραμμή ΣΥΝΟΛΟ
// με ζωντανό SUM, και AutoFilter. Πραγματικά κελιά — ποτέ «όλα στη στήλη A».
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, FMT, S, setCell, boxAll, money, percent, intGr, type Cell } from './xlsxStyle';

export type XlsxKind = 'text' | 'date' | 'eur' | 'int' | 'year' | 'pct' | 'num';
export type XlsxCol = { header: string; width?: number; kind?: XlsxKind };
export type XlsxCell = string | number | Date | null | undefined;
export type XlsxSheet = {
  name: string;
  columns: XlsxCol[];
  rows: XlsxCell[][];
  title?: string;
  subtitle?: string;
  /** Δείκτες αριθμητικών στηλών που αθροίζονται σε γραμμή ΣΥΝΟΛΟ (π.χ. Ποσό). */
  totalCols?: number[];
};

const RIGHT = new Set<XlsxKind>(['eur', 'int', 'num', 'pct']);
const CENTER = new Set<XlsxKind>(['date', 'year']);
// Στυλ κειμένου ανά στοίχιση (κρατά πλαίσια/γραμματοσειρά του κοινού στυλ).
const txtLeft = S.txt;
const txtCenter = { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } };
const totLeft = S.totTxt, totRight = S.totNum;

/** Κατεβάζει ένα προσεγμένο .xlsx με ένα ή περισσότερα στιλιζαρισμένα φύλλα. */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  for (const sh of sheets) {
    const NC = sh.columns.length;
    const hasHead = !!sh.title;
    const HR = hasHead ? 3 : 0;               // γραμμή επικεφαλίδων
    const header = sh.columns.map(c => c.header);
    const aoa: XlsxCell[][] = [];
    if (hasHead) { aoa.push([sh.title!], [sh.subtitle || ''], []); }
    aoa.push(header, ...sh.rows);

    const totals = (sh.totalCols || []).length > 0;
    const lastData = HR + sh.rows.length;     // τελευταία γραμμή δεδομένων (0-based)
    const totalR = lastData + 1;
    if (totals) {
      const totRow: XlsxCell[] = Array(NC).fill('');
      totRow[0] = 'ΣΥΝΟΛΟ';
      aoa.push(totRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = sh.columns.map(c => ({ wch: c.width ?? Math.max(10, c.header.length + 3) }));
    ws['!rows'] = [];
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

    // Τίτλος / υπότιτλος (merged) + ύψη.
    if (hasHead) {
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } },
      ];
      ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 };
      setCell(ws, 0, 0, { s: S.title });
      setCell(ws, 1, 0, { s: S.sub });
    }

    // Επικεφαλίδες.
    ws['!rows'][HR] = { hpt: 28 };
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });

    // Δεδομένα — στυλ + μορφή ανά τύπο. Τα ποσά/ποσοστά γράφονται ως ΚΕΙΜΕΝΟ με
    // ελληνικό κόμμα («751,00 €», «18,00%»), ώστε να φαίνονται ίδια σε κάθε Excel.
    for (let R = HR + 1; R <= lastData; R++) {
      ws['!rows'][R] = { hpt: 16 };
      for (let c = 0; c < NC; c++) {
        const kind = (sh.columns[c]?.kind || 'text') as XlsxKind;
        const cell = ws[enc(R, c)] as Cell | undefined;
        const raw = cell?.v;
        if (kind === 'date' && raw instanceof Date) setCell(ws, R, c, { s: txtCenter, t: 'd', z: FMT.date });
        else if ((kind === 'eur' || kind === 'num') && typeof raw === 'number') setCell(ws, R, c, { v: money(raw), t: 's', s: S.num });
        else if (kind === 'pct' && typeof raw === 'number') setCell(ws, R, c, { v: percent(raw), t: 's', s: S.num });
        else if (kind === 'int' && typeof raw === 'number') setCell(ws, R, c, { v: intGr(raw), t: 's', s: S.num });
        else if (kind === 'year') setCell(ws, R, c, { v: String(raw ?? ''), t: 's', s: txtCenter });
        else setCell(ws, R, c, { s: RIGHT.has(kind) ? S.num : CENTER.has(kind) ? txtCenter : txtLeft });
      }
    }

    // Γραμμή ΣΥΝΟΛΟ — άθροισμα (κείμενο «€» με κόμμα, ίδιο σε κάθε Excel).
    if (totals) {
      const totSet = new Set(sh.totalCols);
      for (let c = 0; c < NC; c++) {
        if (totSet.has(c) && sh.rows.length) {
          const sum = sh.rows.reduce((acc, row) => acc + (typeof row[c] === 'number' ? (row[c] as number) : 0), 0);
          setCell(ws, totalR, c, { v: money(sum), t: 's', s: totRight });
        } else {
          setCell(ws, totalR, c, { s: totLeft });
        }
      }
      ws['!rows'][totalR] = { hpt: 17 };
    }

    // AutoFilter στον πίνακα (από επικεφαλίδες έως τελευταία γραμμή δεδομένων).
    if (sh.rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    void boxAll;

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
