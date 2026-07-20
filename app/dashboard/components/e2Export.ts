'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import {
  E2_OFFICIAL_HEADERS, E2_NUM_COLS, buildE2OfficialCells, buildE2Row, buildE1Summary,
  E1_HEADERS, e1LineToCells, E2_INSTRUCTIONS,
  type E2Property, type E2Tenant, type E2Payment,
} from '@/lib/billing/e2';

const NCOLS = E2_OFFICIAL_HEADERS.length; // 19
const EUR = '#,##0.00';   // καθαροί αριθμοί (χωρίς σύμβολο) για copy-paste στο myAADE
const INT = '0';
const PCT = '0.00';
// Πλάτη στηλών του πίνακα I (σε χαρακτήρες).
const WIDTHS = [5, 30, 12, 18, 11, 26, 16, 30, 15, 16, 13, 13, 8, 15, 14, 18, 20, 20, 18];

function styleE2Sheet(ws: XLSX.WorkSheet, headerRow: number, dataRows: number): void {
  ws['!cols'] = WIDTHS.map(w => ({ wch: w }));
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const numCol: Record<number, string> = {
    [E2_NUM_COLS.sqm]: INT, [E2_NUM_COLS.months]: INT, [E2_NUM_COLS.monthly]: EUR, [E2_NUM_COLS.pct]: PCT,
    [E2_NUM_COLS.gross13]: EUR, [E2_NUM_COLS.gross14]: EUR, [E2_NUM_COLS.gross15]: EUR, [E2_NUM_COLS.gross16]: EUR,
  };
  for (let R = headerRow + 1; R <= headerRow + dataRows + 1; R++) {
    for (let C = 0; C < NCOLS; C++) {
      const z = numCol[C];
      if (!z) continue;
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = z; }
    }
  }
  // AutoFilter μόνο στον πίνακα (επικεφαλίδα → τελευταία γραμμή δεδομένων).
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + dataRows, c: NCOLS - 1 } }) };
  // Συγχωνεύσεις τίτλων/ενοτήτων (γραμμές 0,1,3,8 σε όλο το πλάτος).
  const full = (r: number) => ({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
  ws['!merges'] = [full(0), full(1), full(3), full(headerRow - 1)];
  void range;
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

  // Σύνολα ακαθάριστου ανά στήλη (13–16).
  const sumCol = (c: number) => officialRows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
  const totalRow: (string | number)[] = Array(NCOLS).fill('');
  totalRow[0] = 'ΣΥΝΟΛΟ';
  totalRow[E2_NUM_COLS.gross13] = sumCol(E2_NUM_COLS.gross13);
  totalRow[E2_NUM_COLS.gross15] = sumCol(E2_NUM_COLS.gross15);

  // ── Φύλλο 1: Ε2 Πίνακας I ──────────────────────────────────────────────────
  const aoa: (string | number)[][] = [
    [`ΑΝΑΛΥΤΙΚΗ ΚΑΤΑΣΤΑΣΗ ΜΙΣΘΩΜΑΤΩΝ ΑΚΙΝΗΤΗΣ ΠΕΡΙΟΥΣΙΑΣ — ΦΟΡΟΛΟΓΙΚΟ ΕΤΟΣ ${year}`],
    ['Έντυπο Ε2 · προσυμπληρωμένο από το Property OS — αντιγράψτε τα πεδία στο myAADE (τα εκτιμώμενα ελέγχονται πριν την υποβολή)'],
    [],
    ['ΣΤΟΙΧΕΙΑ ΥΠΟΧΡΕΟΥ'],
    ['ΑΦΜ / Ονοματεπώνυμο', ownerAfmCommon],
    ['Αρ. Υποβολής / Ημερομηνία', ''],
    ['Στοιχεία Λογιστή', ''],
    [],
    [`ΠΙΝΑΚΑΣ I — ΕΚΜΙΣΘΟΥΜΕΝΑ / ΛΟΙΠΑ ΑΚΙΝΗΤΑ (${properties.length} ${properties.length === 1 ? 'ακίνητο' : 'ακίνητα'})`],
    [...E2_OFFICIAL_HEADERS],
    ...officialRows,
    totalRow,
  ];
  const headerRow = 9;
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  styleE2Sheet(ws, headerRow, officialRows.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Ε2 ${year}`);

  // ── Φύλλο 2: Οδηγίες συμπλήρωσης ────────────────────────────────────────────
  const guide = XLSX.utils.aoa_to_sheet([
    ['ΟΔΗΓΙΕΣ ΣΥΜΠΛΗΡΩΣΗΣ ΕΝΤΥΠΟΥ Ε2'],
    [],
    ...E2_INSTRUCTIONS.map(t => [t]),
    [],
    ['Σημείωση: οι κωδικοί/στήλες ακολουθούν το επίσημο έντυπο Ε2. Επιβεβαιώστε τυχόν ετήσιες αλλαγές στο myAADE.'],
  ]);
  guide['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, guide, 'Οδηγίες συμπλήρωσης');

  // ── Φύλλο 3: Σύνοψη Ε1 (Πίνακας 4Δ1) ───────────────────────────────────────
  const e1 = buildE1Summary(e2rows);
  if (e1.lines.length) {
    const e1aoa: (string | number)[][] = [
      ['ΣΥΝΟΨΗ Ε1 (Πίνακας 4Δ1) — άθροισμα ακαθάριστου εισοδήματος ανά κωδικό'],
      [],
      [...E1_HEADERS],
      ...e1.lines.map(e1LineToCells),
      ['Σύνολο ακαθάριστου', '', '', e1.totalGross],
      [],
      [e1.note],
    ];
    const e1ws = XLSX.utils.aoa_to_sheet(e1aoa);
    e1ws['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 24 }, { wch: 20 }];
    // 2 δεκαδικά στη στήλη ποσού (D), γραμμές δεδομένων + σύνολο.
    const er = XLSX.utils.decode_range(e1ws['!ref'] || 'A1');
    for (let R = 3; R <= er.e.r; R++) {
      const cell = e1ws[XLSX.utils.encode_cell({ r: R, c: 3 })];
      if (cell && typeof cell.v === 'number') { cell.t = 'n'; cell.z = EUR; }
    }
    e1ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, e1ws, 'Σύνοψη Ε1');
  }

  XLSX.writeFile(wb, `E2_${year}_property-os.xlsx`);
  return properties.length;
}
