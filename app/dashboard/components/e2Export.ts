'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import XLSX from 'xlsx-js-style';
import {
  E2_OFFICIAL_HEADERS, E2_NUM_COLS, buildE2OfficialCells, buildE2Row, buildE1Summary,
  E1_HEADERS, e1LineToCells, E2_INSTRUCTIONS,
  type E2Property, type E2Tenant, type E2Payment,
} from '@/lib/billing/e2';

const NCOLS = E2_OFFICIAL_HEADERS.length; // 19
const EUR = '#,##0.00';   // καθαροί αριθμοί (χωρίς σύμβολο) για copy-paste στο myAADE
const INT = '0';
const PCT = '0.00';
// Πλάτη στηλών του πίνακα I (σε χαρακτήρες) — με αναδίπλωση επικεφαλίδας χωράνε άνετα.
const WIDTHS = [5, 34, 13, 18, 10, 24, 15, 26, 15, 16, 12, 12, 7, 13, 12, 16, 16, 16, 16];

// ── Στυλ (ασπρόμαυρα/γκρι — καθαρό, λογιστικό look) ──────────────────────────
const INK = '111111', SUB = '6B7280', LINE = 'D0D5DD', HEADBG = 'E9ECEF', SECBG = 'F3F4F6';
const bThin = { style: 'thin', color: { rgb: LINE } };
const boxAll = { top: bThin, bottom: bThin, left: bThin, right: bThin };
const S_TITLE = { font: { bold: true, sz: 13, color: { rgb: INK } }, alignment: { vertical: 'center' } };
const S_SUB = { font: { sz: 9, italic: true, color: { rgb: SUB } }, alignment: { vertical: 'center' } };
const S_SECTION = { font: { bold: true, sz: 10, color: { rgb: INK } }, fill: { fgColor: { rgb: SECBG } }, alignment: { vertical: 'center' } };
const S_LABEL = { font: { sz: 10, color: { rgb: '374151' } }, alignment: { vertical: 'center' } };
const S_FIELD = { font: { sz: 10, color: { rgb: INK } }, alignment: { vertical: 'center' }, border: { bottom: bThin } };
const S_HEAD = { font: { bold: true, sz: 9.5, color: { rgb: INK } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { fgColor: { rgb: HEADBG } }, border: boxAll };
const S_TXT = { font: { sz: 10, color: { rgb: INK } }, alignment: { horizontal: 'left', vertical: 'center' }, border: boxAll };
const S_NUM = { font: { sz: 10, color: { rgb: INK } }, alignment: { horizontal: 'right', vertical: 'center' }, border: boxAll };
const S_TOT_TXT = { font: { bold: true, sz: 10, color: { rgb: INK } }, alignment: { horizontal: 'left', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: INK } }, bottom: bThin, left: bThin, right: bThin } };
const S_TOT_NUM = { font: { bold: true, sz: 10, color: { rgb: INK } }, alignment: { horizontal: 'right', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: INK } }, bottom: bThin, left: bThin, right: bThin } };

type Cell = { v: string | number; t?: string; z?: string; s?: object };
const setCell = (ws: XLSX.WorkSheet, r: number, c: number, patch: Partial<Cell>) => {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cur = (ws[addr] as Cell) || { v: '', t: 's' };
  ws[addr] = { ...cur, ...patch, s: { ...(cur.s || {}), ...(patch.s || {}) } };
};

function buildMainSheet(officialRows: (string | number)[][], ownerAfmCommon: string, year: number): XLSX.WorkSheet {
  const headerRow = 9;
  const totalRow: (string | number)[] = Array(NCOLS).fill('');
  totalRow[0] = 'ΣΥΝΟΛΟ';
  const sumCol = (c: number) => officialRows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
  totalRow[E2_NUM_COLS.gross13] = sumCol(E2_NUM_COLS.gross13);
  totalRow[E2_NUM_COLS.gross15] = sumCol(E2_NUM_COLS.gross15);

  const aoa: (string | number)[][] = [
    [`ΑΝΑΛΥΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΜΙΣΘΩΜΑΤΩΝ ΑΚΙΝΗΤΗΣ ΠΕΡΙΟΥΣΙΑΣ — ΦΟΡΟΛΟΓΙΚΟ ΕΤΟΣ ${year}`],
    ['Έντυπο Ε2 · προσυμπληρωμένο από το Property OS — αντιγράψτε τα πεδία στο myAADE (τα εκτιμώμενα ελέγχονται πριν την υποβολή)'],
    [],
    ['ΣΤΟΙΧΕΙΑ ΥΠΟΧΡΕΟΥ'],
    ['ΑΦΜ / Ονοματεπώνυμο', ownerAfmCommon],
    ['Αρ. Υποβολής / Ημερομηνία', ''],
    ['Στοιχεία Λογιστή', ''],
    [],
    [`ΠΙΝΑΚΑΣ I — ΕΚΜΙΣΘΟΥΜΕΝΑ / ΛΟΙΠΑ ΑΚΙΝΗΤΑ (${officialRows.length} ${officialRows.length === 1 ? 'ακίνητο' : 'ακίνητα'})`],
    [...E2_OFFICIAL_HEADERS],
    ...officialRows,
    totalRow,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastDataRow = headerRow + officialRows.length;
  const totalR = lastDataRow + 1;
  const numZ: Record<number, string> = {
    [E2_NUM_COLS.sqm]: INT, [E2_NUM_COLS.months]: INT, [E2_NUM_COLS.monthly]: EUR, [E2_NUM_COLS.pct]: PCT,
    [E2_NUM_COLS.gross13]: EUR, [E2_NUM_COLS.gross14]: EUR, [E2_NUM_COLS.gross15]: EUR, [E2_NUM_COLS.gross16]: EUR,
  };

  ws['!cols'] = WIDTHS.map(w => ({ wch: w }));
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: NCOLS - 1 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: NCOLS - 1 } },
  ];
  ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 22 };
  ws['!rows'][1] = { hpt: 15 };
  ws['!rows'][headerRow] = { hpt: 44 };
  for (let r = headerRow + 1; r <= totalR; r++) ws['!rows'][r] = { hpt: 18 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: lastDataRow, c: NCOLS - 1 } }) };

  // Στυλ ενοτήτων/επικεφαλίδας υπόχρεου
  setCell(ws, 0, 0, { s: S_TITLE });
  setCell(ws, 1, 0, { s: S_SUB });
  setCell(ws, 3, 0, { s: S_SECTION });
  setCell(ws, 8, 0, { s: S_SECTION });
  for (let r = 4; r <= 6; r++) { setCell(ws, r, 0, { s: S_LABEL }); setCell(ws, r, 1, { s: S_FIELD }); }

  // Επικεφαλίδα πίνακα
  for (let c = 0; c < NCOLS; c++) setCell(ws, headerRow, c, { s: S_HEAD });
  // Δεδομένα (και κενά κελιά για πλαίσιο)
  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    for (let c = 0; c < NCOLS; c++) {
      const z = numZ[c];
      const isNum = z !== undefined;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as Cell | undefined;
      const numeric = isNum && cell && typeof cell.v === 'number';
      setCell(ws, r, c, { s: numeric ? S_NUM : S_TXT, ...(numeric ? { t: 'n', z } : {}) });
    }
  }
  // Σύνολο
  for (let c = 0; c < NCOLS; c++) {
    const z = numZ[c];
    const cell = ws[XLSX.utils.encode_cell({ r: totalR, c })] as Cell | undefined;
    const numeric = z !== undefined && cell && typeof cell.v === 'number';
    setCell(ws, totalR, c, { s: numeric ? S_TOT_NUM : S_TOT_TXT, ...(numeric ? { t: 'n', z } : {}) });
  }
  return ws;
}

/** Κατεβάζει προσυμπληρωμένο Ε2 (Excel, δομή επίσημου εντύπου) για το `year`. Επιστρέφει πλήθος ακινήτων. */
export async function runE2Export(supabase: SupabaseClient, userId: string, year: number): Promise<number> {
  const { data: props } = await supabase.from('user_properties')
    .select('id, atak, address, postal_code, ownership, prop_type, status_detail, target_rent, sqm, floor')
    .eq('user_id', userId).order('created_at');
  const properties = (props || []) as E2Property[];
  if (!properties.length) return 0;
  const ids = properties.map(p => p.id);
  const [{ data: tenants }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from('tenants').select('property_id, afm, full_name, monthly_rent, lease_start, lease_end, lease_type, created_at').in('property_id', ids).eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('rent_payments').select('property_id, amount, period_year, period_month').in('property_id', ids).eq('user_id', userId).eq('period_year', year),
    supabase.from('property_settings').select('property_id, owner_afm').in('property_id', ids).eq('user_id', userId),
  ]);
  const tenantByProp = new Map<string, E2Tenant>();
  (tenants || []).forEach((t: E2Tenant) => { if (!tenantByProp.has(t.property_id)) tenantByProp.set(t.property_id, t); });
  const paymentsByProp = new Map<string, E2Payment[]>();
  (payments || []).forEach((p: E2Payment) => { const a = paymentsByProp.get(p.property_id) || []; a.push(p); paymentsByProp.set(p.property_id, a); });
  const afmByProp = new Map<string, string>();
  (settings || []).forEach((s: { property_id: string; owner_afm: string | null }) => { if (s.owner_afm) afmByProp.set(s.property_id, s.owner_afm); });
  const ownerAfmCommon = [...afmByProp.values()].find(Boolean) || '';

  const e2rows = properties.map(p => buildE2Row(p, tenantByProp.get(p.id) || null, paymentsByProp.get(p.id) || [], afmByProp.get(p.id) || '', year));
  const officialRows = properties.map((p, i) => buildE2OfficialCells(p, tenantByProp.get(p.id) || null, paymentsByProp.get(p.id) || [], afmByProp.get(p.id) || '', year, i + 1));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildMainSheet(officialRows, ownerAfmCommon, year), `Ε2 ${year}`);

  // ── Φύλλο 2: Οδηγίες συμπλήρωσης ────────────────────────────────────────────
  const gAoa: (string | number)[][] = [['ΟΔΗΓΙΕΣ ΣΥΜΠΛΗΡΩΣΗΣ ΕΝΤΥΠΟΥ Ε2'], [], ...E2_INSTRUCTIONS.map(t => [t]), [], ['Σημείωση: οι στήλες ακολουθούν το επίσημο έντυπο Ε2. Επιβεβαιώστε τυχόν ετήσιες αλλαγές στο myAADE.']];
  const guide = XLSX.utils.aoa_to_sheet(gAoa);
  guide['!cols'] = [{ wch: 118 }];
  guide['!rows'] = [{ hpt: 22 }];
  setCell(guide, 0, 0, { s: { font: { bold: true, sz: 12, color: { rgb: INK } } } });
  for (let i = 0; i < E2_INSTRUCTIONS.length; i++) {
    const r = 2 + i;
    setCell(guide, r, 0, { s: { font: { sz: 10, color: { rgb: '374151' } }, alignment: { wrapText: true, vertical: 'top' } } });
    (guide['!rows'] as { hpt: number }[])[r] = { hpt: Math.max(28, Math.ceil(E2_INSTRUCTIONS[i].length / 95) * 14 + 14) };
  }
  XLSX.utils.book_append_sheet(wb, guide, 'Οδηγίες συμπλήρωσης');

  // ── Φύλλο 3: Σύνοψη Ε1 (Πίνακας 4Δ1) ───────────────────────────────────────
  const e1 = buildE1Summary(e2rows);
  if (e1.lines.length) {
    const e1aoa: (string | number)[][] = [
      ['ΣΥΝΟΨΗ Ε1 (Πίνακας 4Δ1) — άθροισμα ακαθάριστου εισοδήματος ανά κωδικό'], [],
      [...E1_HEADERS], ...e1.lines.map(e1LineToCells), ['Σύνολο ακαθάριστου', '', '', e1.totalGross], [], [e1.note],
    ];
    const e1ws = XLSX.utils.aoa_to_sheet(e1aoa);
    e1ws['!cols'] = [{ wch: 12 }, { wch: 58 }, { wch: 24 }, { wch: 20 }];
    e1ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    const hr = 2, last = 3 + e1.lines.length; // header row index, total row index
    setCell(e1ws, 0, 0, { s: { font: { bold: true, sz: 11, color: { rgb: INK } } } });
    for (let c = 0; c < 4; c++) setCell(e1ws, hr, c, { s: S_HEAD });
    for (let r = hr + 1; r <= last; r++) {
      for (let c = 0; c < 4; c++) {
        const isTot = r === last;
        const isNum = c === 3;
        const cell = e1ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined;
        const numeric = isNum && cell && typeof cell.v === 'number';
        setCell(e1ws, r, c, { s: isTot ? (isNum ? S_TOT_NUM : S_TOT_TXT) : (isNum ? S_NUM : S_TXT), ...(numeric ? { t: 'n', z: EUR } : {}) });
      }
    }
    XLSX.utils.book_append_sheet(wb, e1ws, 'Σύνοψη Ε1');
  }

  XLSX.writeFile(wb, `E2_${year}_property-os.xlsx`);
  return properties.length;
}
