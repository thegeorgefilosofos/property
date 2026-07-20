'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { XLSX, FMT, S, setCell, type Cell } from './xlsxStyle';
import {
  E2_OFFICIAL_HEADERS, E2_NUM_COLS, buildE2OfficialCells, buildE2Row, buildE1Summary,
  E1_HEADERS, e1LineToCells, E2_INSTRUCTIONS,
  type E2Property, type E2Tenant, type E2Payment,
} from '@/lib/billing/e2';

const NCOLS = E2_OFFICIAL_HEADERS.length; // 19
// Πλάτη στηλών (χαρακτήρες) — με αναδιπλωμένες επικεφαλίδες χωράνε άνετα δεδομένα+τίτλοι.
const WIDTHS = [5, 34, 13, 18, 10, 24, 15, 26, 15, 16, 12, 12, 8, 14, 13, 16, 17, 17, 15];
const numZ: Record<number, string> = {
  [E2_NUM_COLS.sqm]: FMT.dec2, [E2_NUM_COLS.months]: FMT.int, [E2_NUM_COLS.monthly]: FMT.eur, [E2_NUM_COLS.pct]: FMT.pct,
  [E2_NUM_COLS.gross13]: FMT.eur, [E2_NUM_COLS.gross14]: FMT.eur, [E2_NUM_COLS.gross15]: FMT.eur, [E2_NUM_COLS.gross16]: FMT.eur,
};
// Οι τέσσερις στήλες «ακαθάριστο εισόδημα» (στ.13–16) — αθροίζονται όλες στο ΣΥΝΟΛΟ.
const GROSS_COLS = [E2_NUM_COLS.gross13, E2_NUM_COLS.gross14, E2_NUM_COLS.gross15, E2_NUM_COLS.gross16];

function buildMainSheet(officialRows: (string | number)[][], ownerAfmCommon: string, year: number): XLSX.WorkSheet {
  const headerRow = 9;
  const totalRow: (string | number)[] = Array(NCOLS).fill('');
  totalRow[0] = 'ΣΥΝΟΛΟ';
  const sumCol = (c: number) => officialRows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
  // Άθροισε ΚΑΙ τις τέσσερις στήλες ακαθαρίστου (13–16) — αλλιώς δωρεάν παραχώρηση/ανείσπρακτα χάνονταν.
  for (const c of GROSS_COLS) totalRow[c] = sumCol(c);

  const aoa: (string | number)[][] = [
    [`ΑΝΑΛΥΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΜΙΣΘΩΜΑΤΩΝ ΑΚΙΝΗΤΗΣ ΠΕΡΙΟΥΣΙΑΣ — ΦΟΡΟΛΟΓΙΚΟ ΕΤΟΣ ${year}`],
    ['Έντυπο Ε2 · προσυμπληρωμένο από το Property OS · συμπληρώστε τα πεδία στο myAADE (τα εκτιμώμενα ελέγχονται πριν την υποβολή)'],
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

  ws['!cols'] = WIDTHS.map(w => ({ wch: w }));
  ws['!merges'] = [0, 1, 3, 8].map(r => ({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } }));
  ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 24 };
  ws['!rows'][1] = { hpt: 16 };
  ws['!rows'][3] = { hpt: 18 };
  ws['!rows'][8] = { hpt: 18 };
  ws['!rows'][headerRow] = { hpt: 58 }; // ψηλή επικεφαλίδα → πλήρως ορατοί αναδιπλωμένοι τίτλοι
  for (let r = headerRow + 1; r <= totalR; r++) ws['!rows'][r] = { hpt: 18 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: lastDataRow, c: NCOLS - 1 } }) };

  setCell(ws, 0, 0, { s: S.title });
  setCell(ws, 1, 0, { s: S.sub });
  setCell(ws, 3, 0, { s: S.section });
  setCell(ws, 8, 0, { s: S.section });
  for (let r = 4; r <= 6; r++) { setCell(ws, r, 0, { s: S.label }); setCell(ws, r, 1, { s: S.field }); }
  for (let c = 0; c < NCOLS; c++) setCell(ws, headerRow, c, { s: S.head });
  for (let r = headerRow + 1; r <= lastDataRow; r++) {
    for (let c = 0; c < NCOLS; c++) {
      const z = numZ[c];
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined;
      const numeric = z !== undefined && cell && typeof cell.v === 'number';
      setCell(ws, r, c, { s: numeric ? S.num : S.txt, ...(numeric ? { t: 'n', z } : {}) });
    }
  }
  for (let c = 0; c < NCOLS; c++) {
    const z = numZ[c];
    const cell = ws[XLSX.utils.encode_cell({ r: totalR, c })] as Cell | undefined;
    const numeric = z !== undefined && cell && typeof cell.v === 'number';
    // Τα σύνολα ακαθαρίστου = ΖΩΝΤΑΝΑ SUM ώστε να μένουν σωστά μετά από χειροκίνητες αλλαγές.
    const isGross = GROSS_COLS.includes(c);
    const formula = isGross && officialRows.length
      ? `SUM(${XLSX.utils.encode_cell({ r: headerRow + 1, c })}:${XLSX.utils.encode_cell({ r: lastDataRow, c })})`
      : undefined;
    setCell(ws, totalR, c, { s: numeric ? S.totNum : S.totTxt, ...(numeric ? { t: 'n', z } : {}), ...(formula ? { f: formula } : {}) });
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

  // ── Φύλλο: Επισημάνσεις πριν την υποβολή ────────────────────────────────────
  // Οι έλεγχοι (buildE2Row.flags) υπολογίζονταν αλλά πετιόνταν· τους δείχνουμε ώστε
  // ο χρήστης να δει «Λείπει ΑΤΑΚ», «εκτίμηση», «συνιδιοκτησία < 100%» κ.λπ.
  const flagged = properties
    .map((p, i) => ({ n: i + 1, loc: p.address || p.atak || `Ακίνητο ${i + 1}`, flags: e2rows[i].flags }))
    .filter(x => x.flags.length > 0);
  if (flagged.length) {
    const fAoa: (string | number)[][] = [
      ['ΕΠΙΣΗΜΑΝΣΕΙΣ ΠΡΙΝ ΤΗΝ ΥΠΟΒΟΛΗ'],
      ['Έλεγξε και συμπλήρωσε τα παρακάτω πριν τα συμπληρώσεις στο myAADE.'],
      [],
      ['Α/Α', 'Ακίνητο', 'Επισημάνσεις'],
      ...flagged.map(x => [x.n, x.loc, x.flags.join(' · ')]),
    ];
    const fws = XLSX.utils.aoa_to_sheet(fAoa);
    fws['!cols'] = [{ wch: 6 }, { wch: 34 }, { wch: 82 }];
    fws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }];
    fws['!rows'] = []; fws['!rows'][0] = { hpt: 22 }; fws['!rows'][1] = { hpt: 15 };
    setCell(fws, 0, 0, { s: S.title });
    setCell(fws, 1, 0, { s: S.sub });
    for (let c = 0; c < 3; c++) setCell(fws, 3, c, { s: S.head });
    flagged.forEach((x, i) => {
      const r = 4 + i;
      setCell(fws, r, 0, { s: S.num });
      setCell(fws, r, 1, { s: S.txt });
      setCell(fws, r, 2, { s: S.txtWrap });
      fws['!rows']![r] = { hpt: Math.max(18, Math.ceil(x.flags.join(' · ').length / 72) * 15 + 6) };
    });
    XLSX.utils.book_append_sheet(wb, fws, 'Επισημάνσεις');
  }

  // ── Φύλλο 2: Οδηγίες συμπλήρωσης ────────────────────────────────────────────
  const gAoa: (string | number)[][] = [['ΟΔΗΓΙΕΣ ΣΥΜΠΛΗΡΩΣΗΣ ΕΝΤΥΠΟΥ Ε2'], [], ...E2_INSTRUCTIONS.map(t => [t]), [], ['Σημείωση: οι στήλες ακολουθούν το επίσημο έντυπο Ε2. Επιβεβαιώστε τυχόν ετήσιες αλλαγές στο myAADE.']];
  const guide = XLSX.utils.aoa_to_sheet(gAoa);
  guide['!cols'] = [{ wch: 118 }];
  guide['!rows'] = [{ hpt: 24 }];
  setCell(guide, 0, 0, { s: S.title });
  for (let i = 0; i < E2_INSTRUCTIONS.length; i++) {
    const r = 2 + i;
    setCell(guide, r, 0, { s: S.txtWrap });
    (guide['!rows'] as { hpt: number }[])[r] = { hpt: Math.max(28, Math.ceil(E2_INSTRUCTIONS[i].length / 95) * 15 + 12) };
  }
  XLSX.utils.book_append_sheet(wb, guide, 'Οδηγίες συμπλήρωσης');

  // ── Φύλλο 3: Σύνοψη Ε1 (Πίνακας 4Δ1) ───────────────────────────────────────
  const e1 = buildE1Summary(e2rows);
  if (e1.lines.length) {
    const e1aoa: (string | number)[][] = [
      ['ΣΥΝΟΨΗ Ε1 (Πίνακας 4Δ1) — άθροισμα ακαθάριστου εισοδήματος ανά κωδικό'], [],
      // Αριθμητικά ποσά (όχι κείμενο) → ομοιόμορφη μορφή ευρώ, ίδια με το σύνολο.
      [...E1_HEADERS], ...e1.lines.map(l => [l.code, l.label, l.category, l.amount]), ['Σύνολο ακαθάριστου', '', '', e1.totalGross], [], [e1.note],
    ];
    const e1ws = XLSX.utils.aoa_to_sheet(e1aoa);
    e1ws['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 24 }, { wch: 20 }];
    e1ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    e1ws['!rows'] = []; e1ws['!rows'][0] = { hpt: 22 }; e1ws['!rows'][2] = { hpt: 30 };
    const hr = 2, last = 3 + e1.lines.length;
    setCell(e1ws, 0, 0, { s: S.title });
    for (let c = 0; c < 4; c++) setCell(e1ws, hr, c, { s: S.head });
    for (let r = hr + 1; r <= last; r++) {
      for (let c = 0; c < 4; c++) {
        const isTot = r === last, isNum = c === 3;
        const cell = e1ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined;
        const numeric = isNum && cell && typeof cell.v === 'number';
        // Το σύνολο ακαθαρίστου = ΖΩΝΤΑΝΟ SUM της στήλης ποσού.
        const formula = isTot && isNum && e1.lines.length
          ? `SUM(${XLSX.utils.encode_cell({ r: hr + 1, c: 3 })}:${XLSX.utils.encode_cell({ r: last - 1, c: 3 })})`
          : undefined;
        setCell(e1ws, r, c, { s: isTot ? (isNum ? S.totNum : S.totTxt) : (isNum ? S.num : S.txt), ...(numeric ? { t: 'n', z: FMT.eur } : {}), ...(formula ? { f: formula } : {}) });
      }
    }
    XLSX.utils.book_append_sheet(wb, e1ws, 'Σύνοψη Ε1');
  }

  XLSX.writeFile(wb, `E2_${year}_property-os.xlsx`);
  return properties.length;
}
