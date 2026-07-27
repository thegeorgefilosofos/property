'use client';
// ═══════════════════════════════════════════════════════════════════════════
// portfolioXlsx — Συγκριτικό Excel χαρτοφυλακίου. Μία καθαρή, επαγγελματική
// κατάσταση που παραθέτει ΟΛΑ τα ακίνητα δίπλα-δίπλα για την περίοδο: αναμενόμενα
// & εισπραγμένα ενοίκια, ανείσπρακτα, δαπάνες, καθαρό και ποσοστό είσπραξης — με
// ζωντανά σύνολα (SUM), μορφή €/%, φίλτρα και το ενιαίο λογιστικό στυλ (xlsxStyle).
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, FMT, S, setCell, type Cell } from './xlsxStyle';

export interface PortfolioRow {
  name: string;
  expected: number;   // αναμενόμενα ενοίκια (δεδουλευμένα)
  collected: number;  // εισπραχθέντα
  expenses: number;   // δαπάνες περιόδου
}

const A1 = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

export function downloadPortfolioComparison(opts: {
  rows: PortfolioRow[];
  periodLabel: string;
  entityName?: string;
  fileName?: string;
}): void {
  const { rows, periodLabel, entityName } = opts;
  const wb = XLSX.utils.book_new();
  const NC = 7, HR = 3;
  const idLine = `${entityName || 'Property OS'} · Συγκριτική κατάσταση χαρτοφυλακίου · ${periodLabel}`;
  const header = ['Ακίνητο', 'Αναμενόμενα', 'Εισπράχθηκαν', 'Ανείσπρακτα', 'Δαπάνες', 'Καθαρό', 'Είσπραξη %'];

  // Ταξινόμηση κατά καθαρό (φθίνουσα) — τα πιο αποδοτικά πρώτα.
  const sorted = [...rows].sort((a, b) => (b.collected - b.expenses) - (a.collected - a.expenses));

  const aoa: (string | number)[][] = [
    ['ΣΥΓΚΡΙΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΧΑΡΤΟΦΥΛΑΚΙΟΥ'], [idLine], [],
    header,
    ...sorted.map(r => {
      const outstanding = Math.max(0, r.expected - r.collected);
      const net = r.collected - r.expenses;
      const rate = r.expected > 0 ? Math.round((r.collected / r.expected) * 10000) / 100 : 0;
      return [r.name, r.expected || '', r.collected || '', outstanding || '', r.expenses || '', net, rate];
    }),
    ['ΣΥΝΟΛΑ', '', '', '', '', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } }];
  ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 24 };
  setCell(ws, 0, 0, { s: S.title });
  setCell(ws, 1, 0, { s: S.sub });
  for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });

  const lastData = HR + sorted.length, totalR = lastData + 1;
  for (let r = HR + 1; r <= lastData; r++) {
    ws['!rows'][r] = { hpt: 16 };
    setCell(ws, r, 0, { s: S.txt });
    for (const c of [1, 2, 3, 4, 5]) {
      const cell = ws[A1(r, c)] as Cell | undefined;
      if (cell && typeof cell.v === 'number') setCell(ws, r, c, { t: 'n', z: FMT.eur, s: S.num });
      else setCell(ws, r, c, { s: S.num });
    }
    const rc = ws[A1(r, 6)] as Cell | undefined;
    if (rc && typeof rc.v === 'number') setCell(ws, r, 6, { t: 'n', z: FMT.pct, s: S.num });
    else setCell(ws, r, 6, { s: S.num });
  }

  // Σύνολα — ζωντανές φόρμουλες SUM (recalc στο άνοιγμα).
  setCell(ws, totalR, 0, { s: S.totTxt });
  for (const c of [1, 2, 3, 4, 5]) {
    const range = `${A1(HR + 1, c)}:${A1(lastData, c)}`;
    const sum = sorted.reduce((s, r) => {
      const outstanding = Math.max(0, r.expected - r.collected), net = r.collected - r.expenses;
      return s + (c === 1 ? r.expected : c === 2 ? r.collected : c === 3 ? outstanding : c === 4 ? r.expenses : net);
    }, 0);
    setCell(ws, totalR, c, { t: 'n', f: `SUM(${range})`, v: Math.round(sum * 100) / 100, z: FMT.eur, s: S.totNum });
  }
  // Συνολικό ποσοστό είσπραξης = Σ εισπραχθέντα / Σ αναμενόμενα (φόρμουλα, ασφαλής στο /0).
  setCell(ws, totalR, 6, {
    t: 'n', f: `IF(${A1(totalR, 1)}=0,0,${A1(totalR, 2)}/${A1(totalR, 1)}*100)`,
    v: (() => { const e = sorted.reduce((s, r) => s + r.expected, 0), col = sorted.reduce((s, r) => s + r.collected, 0); return e > 0 ? Math.round((col / e) * 10000) / 100 : 0; })(),
    z: FMT.pct, s: S.totNum,
  });

  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: HR + 1, topLeftCell: A1(HR + 1, 0), activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws, 'Σύγκριση');

  const name = (opts.fileName || `Sygkritiko_hartofylakio_${periodLabel}`).replace(/\s+/g, '_').replace(/[^\w\-.]/g, '');
  XLSX.writeFile(wb, `${name}.xlsx`);
}
