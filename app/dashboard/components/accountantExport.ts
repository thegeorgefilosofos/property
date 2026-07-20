'use client';
// ═══════════════════════════════════════════════════════════════════════════
// «Φάκελος για τον λογιστή» — προσεγμένο Excel δύο φύλλων:
//   1) Κατάσταση Αποτελεσμάτων Χρήσης (P&L)
//   2) Αναλυτικές κινήσεις (βιβλίο Εσόδων-Εξόδων: ημερομηνία, κατηγορία, ποσά)
// Πραγματικά κελιά, ημερομηνίες ως ημερομηνίες, ποσά ως νόμισμα (2 δεκαδικά),
// σωστή στοίχιση/πλαίσια — σαν να το ετοίμασε λογιστής. Ασπρόμαυρο, καθαρό.
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, FMT, S, setCell, type Cell } from './xlsxStyle';

export interface AccountantStatementLine { label: string; amount: number; kind: string; negative?: boolean }
export interface AccountantMovement { date: string; type: 'income' | 'expense'; category: string; description: string; amount: number }
export interface AccountantBundleInput {
  year: number;
  propName: string;
  ownerAfm?: string;
  statementLines: AccountantStatementLine[];
  provisionMonthly: number;
  book: AccountantMovement[];
}

const STRONG = new Set(['subtotal', 'result']);
const toDate = (d: string): Date | string => { const t = new Date(d + 'T00:00:00'); return isNaN(t.getTime()) ? d : t; };

/** Κατεβάζει τον «φάκελο λογιστή» (.xlsx) για το έτος. */
export function exportAccountantBundle(inp: AccountantBundleInput): void {
  const { year, propName, ownerAfm, statementLines, provisionMonthly, book } = inp;
  const wb = XLSX.utils.book_new();

  // ── Φύλλο 1: Κατάσταση Αποτελεσμάτων ───────────────────────────────────────
  {
    const NC = 2, HR = 4;
    const aoa: (string | number)[][] = [
      [`ΚΑΤΑΣΤΑΣΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ ΧΡΗΣΗΣ ${year}`],
      [`Property OS · ${propName}${ownerAfm ? ` · ΑΦΜ ${ownerAfm}` : ''}`],
      [],
      ['ΑΠΟΤΕΛΕΣΜΑ ΧΡΗΣΗΣ'],
      ['Περιγραφή', 'Ποσό (€)'],
      ...statementLines.map(l => [l.label, l.negative ? -Math.abs(l.amount) : l.amount]),
      ['Πρόβλεψη φόρου / μήνα', Math.round(provisionMonthly * 100) / 100],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 42 }, { wch: 16 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: NC - 1 } },
    ];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 };
    const lastRow = HR + statementLines.length; // + provision row = HR + n + 1
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    setCell(ws, 3, 0, { s: S.section });
    setCell(ws, HR, 0, { s: S.head }); setCell(ws, HR, 1, { s: S.head });
    for (let i = 0; i <= statementLines.length; i++) {
      const r = HR + 1 + i;
      const strong = i < statementLines.length && STRONG.has(statementLines[i].kind);
      setCell(ws, r, 0, { s: strong ? S.strongTxt : S.txt });
      setCell(ws, r, 1, { s: strong ? S.strongNum : S.num, t: 'n', z: FMT.eur });
      ws['!rows'][r] = { hpt: 17 };
    }
    void lastRow;
    XLSX.utils.book_append_sheet(wb, ws, 'Κατάσταση αποτελεσμάτων');
  }

  // ── Φύλλο 2: Αναλυτικές κινήσεις (Έσοδα / Έξοδα) ────────────────────────────
  {
    const NC = 6, HR = 3;
    const sorted = [...book].sort((a, b) => a.date.localeCompare(b.date));
    const sumIn = sorted.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
    const sumEx = sorted.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
    const header = ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', 'Έσοδα (€)', 'Έξοδα (€)'];
    const dataRows: Cell['v'][][] = sorted.map((e, i) => [
      i + 1, toDate(e.date), e.category || '', e.description || '',
      e.type === 'income' ? e.amount : '', e.type === 'expense' ? e.amount : '',
    ]);
    const aoa: (string | number | Date)[][] = [
      [`ΑΝΑΛΥΤΙΚΕΣ ΚΙΝΗΣΕΙΣ ${year}`],
      [`Property OS · ${propName}`],
      [],
      header,
      ...dataRows as (string | number | Date)[][],
      ['', '', '', 'ΣΥΝΟΛΑ', sumIn, sumEx],
      ['', '', '', 'Καθαρό αποτέλεσμα (Έσοδα − Έξοδα)', Math.round((sumIn - sumEx) * 100) / 100, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = [{ wch: 6 }, { wch: 13 }, { wch: 24 }, { wch: 46 }, { wch: 14 }, { wch: 14 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } },
    ];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 26 };
    const lastData = HR + sorted.length;
    const totalR = lastData + 1, netR = lastData + 2;
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    for (let r = HR + 1; r <= lastData; r++) {
      ws['!rows'][r] = { hpt: 16 };
      setCell(ws, r, 0, { s: S.num });                                       // Α/Α
      setCell(ws, r, 1, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } }, t: 'd', z: FMT.date }); // Ημ/νία
      setCell(ws, r, 2, { s: S.txt });                                       // Κατηγορία
      setCell(ws, r, 3, { s: S.txt });                                       // Περιγραφή
      for (const c of [4, 5]) { const cell = ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined; setCell(ws, r, c, { s: S.num, ...(cell && typeof cell.v === 'number' ? { t: 'n', z: FMT.eur } : {}) }); }
    }
    // Σύνολα + καθαρό
    for (let c = 0; c < NC; c++) setCell(ws, totalR, c, { s: c >= 4 ? S.totNum : S.totTxt, ...(c >= 4 ? { t: 'n', z: FMT.eur } : {}) });
    setCell(ws, netR, 3, { s: S.strongTxt });
    setCell(ws, netR, 4, { s: S.strongNum, t: 'n', z: FMT.eur });
    setCell(ws, netR, 5, { s: S.strongTxt });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, `Κινήσεις ${year}`);
  }

  XLSX.writeFile(wb, `logistiki_${(propName || 'akinito').replace(/\s+/g, '_')}_${year}.xlsx`);
}
