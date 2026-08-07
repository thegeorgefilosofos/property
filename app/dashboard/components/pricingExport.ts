'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Εξαγωγή «Δυναμικής τιμολόγησης» σε επαγγελματικό .xlsx (τρία φύλλα):
//   1) Σύνοψη        — ρυθμίσεις + αποτελέσματα (μέση/αιχμή, πληρότητα, έσοδα,
//                      κέρδος έναντι σταθερής τιμής).
//   2) Ημερήσιες τιμές — μία γραμμή/ημέρα: ημερομηνία, εποχή, Σαββ/κο, αργία,
//                      προτεινόμενη τιμή, κατάσταση (με φίλτρα).
//   3) Ανά μήνα      — μέση/ελάχ./μέγ. τιμή & πλήθος ημερών ανά μήνα, με σύνολα.
// Ίδιο «λογιστικό» στυλ με τις άλλες εξαγωγές (xlsxStyle): ασπρόμαυρο, στοιχισμένο,
// δύο δεκαδικά, ημερομηνίες ως ημερομηνίες, ζωντανά σύνολα όπου έχει νόημα.
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, FMT, S, setCell, money, percent, intGr, type Cell } from './xlsxStyle';
import { SEASON_LABELS, type Season } from '@/lib/pricing/dynamicPricing';
import { MONTHS_NOM } from '@/lib/core/months';

// Κείμενο βάσει μορφής: ποσό «€», ποσοστό «%», ακέραιος — πάντα με ελληνικό κόμμα.
const fmtZ = (v: number, z?: string): string => (z === FMT.pct ? percent(v) : z === FMT.int ? intGr(v) : money(v));

const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
const toDate = (d: string): Date | string => { const t = new Date(d + 'T00:00:00'); return isNaN(t.getTime()) ? d : t; };
// dow: 0=Κυρ … 6=Σαβ (όπως το engine) → ελληνική συντομογραφία Δε…Κυ.
const wd = (dow: number) => WEEKDAYS[(dow + 6) % 7] || '';

export interface PricingExportRow { date: string; dow: number; season: Season; isWeekend: boolean; holidayName?: string; price: number; booked: boolean }
export interface PricingExportInput {
  propName: string;
  year: number;
  settings: { base: number; min: number; max: number; weekendPremiumPct: number; minStay: number };
  summary: { avg: number; min: number; max: number; peakCount: number; bookedCount: number };
  /** ΜΕΤΡΗΜΕΝΗ πληρότητα από το ιστορικό, ή null όταν δεν υπάρχει αρκετό.
   *  Πριν, εδώ έμπαινε μια «προβολή εσόδων» και ένα «επιπλέον κέρδος έναντι
   *  σταθερής τιμής» που ήταν ταυτολογία — και έφτανε σε Excel που ο χρήστης
   *  στέλνει στον λογιστή του. Δες lib/pricing/dynamicPricing.ts. */
  occupancy: { pct: number; nights: number } | null;
  realizedAdr: number;
  rows: PricingExportRow[];
}

/** Κατεβάζει το .xlsx δυναμικής τιμολόγησης για το έτος. */
export function exportPricingWorkbook(inp: PricingExportInput): void {
  const { propName, year, settings, summary, occupancy, realizedAdr, rows } = inp;
  const wb = XLSX.utils.book_new();
  const idLine = `Property OS · ${propName} · Έτος ${year} · Ημερομηνία έκδοσης ${new Date().toLocaleDateString('el-GR')}`;

  // ── Φύλλο 1: Σύνοψη ─────────────────────────────────────────────────────────
  {
    type Line = { label: string; value: number | string; z?: string; kind?: 'result' };
    const settingLines: Line[] = [
      { label: 'Βασική τιμή / νύχτα', value: settings.base, z: FMT.eur },
      { label: 'Κατώτατο όριο', value: settings.min || settings.base, z: FMT.eur },
      { label: 'Ανώτατο όριο', value: settings.max || settings.base, z: FMT.eur },
      { label: 'Premium Σαββατοκύριακου', value: settings.weekendPremiumPct, z: FMT.pct },
      { label: 'Ελάχιστη διαμονή (νύχτες)', value: settings.minStay, z: FMT.int },
    ];
    const resultLines: Line[] = [
      { label: 'Μέση τιμή / νύχτα (προτεινόμενη)', value: summary.avg, z: FMT.eur },
      { label: 'Αιχμή (μέγιστη πρόταση)', value: summary.max, z: FMT.eur },
      { label: 'Κατώτατη πρόταση', value: summary.min, z: FMT.eur },
      { label: 'Ημέρες αιχμής στο διάστημα', value: summary.peakCount, z: FMT.int },
      { label: 'Ημέρες ήδη κλεισμένες', value: summary.bookedCount, z: FMT.int },
    ];
    // Πληρότητα ΜΟΝΟ αν είναι μετρημένη. Αλλιώς γράφεται ρητά ότι δεν υπάρχει
    // αρκετό ιστορικό — ένα κενό κελί θα διαβαζόταν ως «μηδέν».
    resultLines.push(occupancy
      ? { label: 'Πληρότητα από το ιστορικό (μετρημένη)', value: occupancy.pct, z: FMT.pct }
      : { label: 'Πληρότητα από το ιστορικό', value: 'δεν υπάρχει αρκετό ιστορικό' });
    if (occupancy) resultLines.push({ label: 'Πραγματικές νύχτες στη μέτρηση', value: occupancy.nights, z: FMT.int });
    if (realizedAdr > 0) resultLines.push({ label: 'Πραγματοποιημένη μέση τιμή (ιστορικό)', value: Math.round(realizedAdr), z: FMT.eur, kind: 'result' });

    const aoa: (string | number)[][] = [
      [`ΔΥΝΑΜΙΚΗ ΤΙΜΟΛΟΓΗΣΗ — ΣΥΝΟΨΗ ${year}`],
      [idLine],
      [],
      ['ΡΥΘΜΙΣΕΙΣ'],
      ['Παράμετρος', 'Τιμή'],
      ...settingLines.map(l => [l.label, l.value]),
      [],
      ['ΑΠΟΤΕΛΕΣΜΑΤΑ (μελλοντικές ημέρες)'],
      ['Δείκτης', 'Τιμή'],
      ...resultLines.map(l => [l.label, l.value]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 40 }, { wch: 18 }];
    const NC = 2;
    ws['!merges'] = [0, 1, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: NC - 1 } }));
    const secRow2 = 6 + settingLines.length; // «ΑΠΟΤΕΛΕΣΜΑΤΑ» section
    ws['!merges'].push({ s: { r: secRow2, c: 0 }, e: { r: secRow2, c: NC - 1 } });
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 };
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    setCell(ws, 3, 0, { s: S.section });
    setCell(ws, 4, 0, { s: S.head }); setCell(ws, 4, 1, { s: S.head });
    settingLines.forEach((l, i) => { const r = 5 + i; setCell(ws, r, 0, { s: S.txt }); setCell(ws, r, 1, { v: fmtZ(l.value as number, l.z), t: 's', s: S.num }); });
    setCell(ws, secRow2, 0, { s: S.section });
    setCell(ws, secRow2 + 1, 0, { s: S.head }); setCell(ws, secRow2 + 1, 1, { s: S.head });
    resultLines.forEach((l, i) => {
      const r = secRow2 + 2 + i;
      setCell(ws, r, 0, { s: l.kind === 'result' ? S.totTxt : S.txt });
      // Οι λεκτικές τιμές («δεν υπάρχει αρκετό ιστορικό») περνούν αυτούσιες: ένα
      // κενό ή ένα μηδέν εκεί θα διαβαζόταν από τον λογιστή ως μέτρηση.
      const shown = typeof l.value === 'string' ? l.value : fmtZ(l.value, l.z);
      setCell(ws, r, 1, { v: shown, t: 's', s: l.kind === 'result' ? S.totNum : S.num });
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Σύνοψη');
  }

  // ── Φύλλο 2: Ημερήσιες τιμές ────────────────────────────────────────────────
  {
    const NC = 7, HR = 3;
    const header = ['Ημερομηνία', 'Ημέρα', 'Εποχή', 'Σαββατοκύριακο', 'Αργία', 'Τιμή/νύχτα', 'Κατάσταση'];
    const data: (string | number | Date)[][] = rows.map(r => [
      toDate(r.date), wd(r.dow), SEASON_LABELS[r.season] || '', r.isWeekend ? 'Ναι' : '—',
      r.holidayName || '', r.price, r.booked ? 'Κλεισμένο' : 'Διαθέσιμο',
    ]);
    const aoa: (string | number | Date)[][] = [
      [`ΗΜΕΡΗΣΙΕΣ ΠΡΟΤΕΙΝΟΜΕΝΕΣ ΤΙΜΕΣ ${year}`],
      [idLine],
      [],
      header,
      ...data,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = [{ wch: 13 }, { wch: 8 }, { wch: 10 }, { wch: 15 }, { wch: 26 }, { wch: 15 }, { wch: 13 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } }];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 26 };
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    const lastData = HR + rows.length;
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    for (let r = HR + 1; r <= lastData; r++) {
      ws['!rows'][r] = { hpt: 15 };
      const dcell = ws[enc(r, 0)] as Cell | undefined;
      const isDate = !!dcell && dcell.v instanceof Date;
      setCell(ws, r, 0, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } }, ...(isDate ? { t: 'd', z: FMT.date } : {}) });
      setCell(ws, r, 1, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });
      setCell(ws, r, 2, { s: S.txt });
      setCell(ws, r, 3, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });
      setCell(ws, r, 4, { s: S.txt });
      setCell(ws, r, 5, { v: money(rows[r - HR - 1].price), t: 's', s: S.num }); // κείμενο «€» με κόμμα
      setCell(ws, r, 6, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });
    }
    if (rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'Ημερήσιες τιμές');
  }

  // ── Φύλλο 3: Ανά μήνα ───────────────────────────────────────────────────────
  {
    const NC = 7, HR = 3;
    const byMonth = new Map<number, PricingExportRow[]>();
    for (const r of rows) { const m = new Date(r.date + 'T00:00:00').getMonth(); const a = byMonth.get(m) || []; a.push(r); byMonth.set(m, a); }
    const monthRows = [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([m, rs]) => {
      const avail = rs.filter(r => !r.booked);
      const prices = avail.map(r => r.price);
      const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
      return {
        name: MONTHS_NOM[m], days: rs.length, available: avail.length, booked: rs.length - avail.length,
        avg, min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0,
      };
    });
    const header = ['Μήνας', 'Ημέρες', 'Διαθέσιμες', 'Κλεισμένες', 'Μέση τιμή', 'Ελάχιστη', 'Μέγιστη'];
    const aoa: (string | number)[][] = [
      [`ΑΝΑΛΥΣΗ ΑΝΑ ΜΗΝΑ ${year}`],
      [idLine],
      [],
      header,
      ...monthRows.map(m => [m.name, m.days, m.available, m.booked, m.avg, m.min, m.max]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 14 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 13 }, { wch: 13 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } }];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 18 };
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    monthRows.forEach((m, i) => {
      const r = HR + 1 + i;
      ws['!rows']![r] = { hpt: 16 };
      setCell(ws, r, 0, { s: S.txt });
      setCell(ws, r, 1, { v: intGr(m.days), t: 's', s: S.num });
      setCell(ws, r, 2, { v: intGr(m.available), t: 's', s: S.num });
      setCell(ws, r, 3, { v: intGr(m.booked), t: 's', s: S.num });
      setCell(ws, r, 4, { v: money(m.avg), t: 's', s: S.num });
      setCell(ws, r, 5, { v: money(m.min), t: 's', s: S.num });
      setCell(ws, r, 6, { v: money(m.max), t: 's', s: S.num });
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Ανά μήνα');
  }

  XLSX.writeFile(wb, `dynamiki-timologisi_${(propName || 'akinito').replace(/\s+/g, '_')}_${year}.xlsx`);
}
