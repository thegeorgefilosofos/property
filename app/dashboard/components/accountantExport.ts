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

const toDate = (d: string): Date | string => { const t = new Date(d + 'T00:00:00'); return isNaN(t.getTime()) ? d : t; };
// Ιταλική γκρι σημείωση για «memo» γραμμές (π.χ. πρόβλεψη φόρου) — διακριτή από το αποτέλεσμα.
const MEMO_TXT = { font: { name: 'Calibri', color: { rgb: '6B7280' }, sz: 10, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
const MEMO_NUM = { font: { name: 'Calibri', color: { rgb: '6B7280' }, sz: 10, italic: true }, alignment: { horizontal: 'right', vertical: 'center' } };

/** Κατεβάζει τον «φάκελο λογιστή» (.xlsx) για το έτος. */
export function exportAccountantBundle(inp: AccountantBundleInput): void {
  const { year, propName, ownerAfm, statementLines, provisionMonthly, book } = inp;
  const wb = XLSX.utils.book_new();
  // Ταυτότητα φορολογούμενου/περιόδου — ίδια ακριβώς και στα δύο φύλλα.
  const idLine = `Property OS · ${propName}${ownerAfm ? ` · ΑΦΜ ${ownerAfm}` : ''} · Περίοδος 01/01/${year}–31/12/${year} · Ημ. έκδοσης ${new Date().toLocaleDateString('el-GR')}`;

  // ── Φύλλο 1: Κατάσταση Αποτελεσμάτων ───────────────────────────────────────
  {
    const NC = 2, HR = 4;
    // Μοντέλο γραμμών: κανονική / υποσύνολο / αποτέλεσμα (λογιστική γραμμή) / κενό / memo.
    type Kind = 'line' | 'subtotal' | 'result' | 'spacer' | 'memo';
    const plRows: { label: string; amount: number | null; kind: Kind }[] = [
      ...statementLines.map(l => ({
        label: l.label,
        amount: l.negative ? -Math.abs(l.amount) : l.amount,
        kind: (l.kind === 'result' ? 'result' : l.kind === 'subtotal' ? 'subtotal' : 'line') as Kind,
      })),
      { label: '', amount: null, kind: 'spacer' },
      { label: 'Πρόβλεψη φόρου / μήνα (εκτίμηση)', amount: Math.round(provisionMonthly * 100) / 100, kind: 'memo' },
    ];
    const aoa: (string | number)[][] = [
      [`ΚΑΤΑΣΤΑΣΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ ΧΡΗΣΗΣ ${year}`],
      [idLine],
      [],
      ['ΑΠΟΤΕΛΕΣΜΑ ΧΡΗΣΗΣ'],
      ['Περιγραφή', 'Ποσό (€)'],
      ...plRows.map(r => [r.label, r.amount ?? '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 46 }, { wch: 16 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: NC - 1 } },
    ];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 };
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    setCell(ws, 3, 0, { s: S.section });
    setCell(ws, HR, 0, { s: S.head }); setCell(ws, HR, 1, { s: S.head });
    plRows.forEach((r, i) => {
      const rr = HR + 1 + i;
      if (r.kind === 'spacer') { ws['!rows']![rr] = { hpt: 6 }; return; }
      ws['!rows']![rr] = { hpt: 17 };
      // 'result' = τελική λογιστική γραμμή (μεσαία άνω γραμμή)· 'subtotal' = έντονο· memo = ιταλικό γκρι.
      const txtS = r.kind === 'result' ? S.totTxt : r.kind === 'subtotal' ? S.strongTxt : r.kind === 'memo' ? MEMO_TXT : S.txt;
      const numS = r.kind === 'result' ? S.totNum : r.kind === 'subtotal' ? S.strongNum : r.kind === 'memo' ? MEMO_NUM : S.num;
      setCell(ws, rr, 0, { s: txtS });
      setCell(ws, rr, 1, { s: numS, t: 'n', z: FMT.eur });
    });
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
      [idLine],
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
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    const lastData = HR + sorted.length;
    const totalR = lastData + 1, netR = lastData + 2;
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    for (let r = HR + 1; r <= lastData; r++) {
      ws['!rows'][r] = { hpt: 16 };
      setCell(ws, r, 0, { s: S.num });                                       // Α/Α
      const dcell = ws[enc(r, 1)] as Cell | undefined;                       // Ημ/νία — t:'d' μόνο αν όντως Date
      const isDate = !!dcell && dcell.v instanceof Date;
      setCell(ws, r, 1, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } }, ...(isDate ? { t: 'd', z: FMT.date } : {}) });
      setCell(ws, r, 2, { s: S.txt });                                       // Κατηγορία
      setCell(ws, r, 3, { s: S.txt });                                       // Περιγραφή
      for (const c of [4, 5]) { const cell = ws[enc(r, c)] as Cell | undefined; setCell(ws, r, c, { s: S.num, ...(cell && typeof cell.v === 'number' ? { t: 'n', z: FMT.eur } : {}) }); }
    }
    // Σύνολα + καθαρό — ΖΩΝΤΑΝΑ SUM (recompute αν ο λογιστής προσθέσει/σβήσει γραμμή).
    const hasRows = sorted.length > 0;
    setCell(ws, totalR, 0, { s: S.totTxt }); setCell(ws, totalR, 1, { s: S.totTxt }); setCell(ws, totalR, 2, { s: S.totTxt }); setCell(ws, totalR, 3, { s: S.totTxt });
    setCell(ws, totalR, 4, { s: S.totNum, t: 'n', z: FMT.eur, ...(hasRows ? { f: `SUM(${enc(HR + 1, 4)}:${enc(lastData, 4)})` } : {}) });
    setCell(ws, totalR, 5, { s: S.totNum, t: 'n', z: FMT.eur, ...(hasRows ? { f: `SUM(${enc(HR + 1, 5)}:${enc(lastData, 5)})` } : {}) });
    setCell(ws, netR, 3, { s: S.strongTxt });
    setCell(ws, netR, 4, { s: S.strongNum, t: 'n', z: FMT.eur, f: `${enc(totalR, 4)}-${enc(totalR, 5)}` });
    setCell(ws, netR, 5, { s: S.strongTxt });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, `Κινήσεις ${year}`);
  }

  XLSX.writeFile(wb, `logistiki_${(propName || 'akinito').replace(/\s+/g, '_')}_${year}.xlsx`);
}
