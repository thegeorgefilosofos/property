'use client';
// ═══════════════════════════════════════════════════════════════════════════
// «Φάκελος για τον λογιστή» — δύο επίπεδα, το ίδιο υλικό.
//
//   exportAccountantBundle()  → ΕΝΑ .xlsx δύο φύλλων (κατάσταση αποτελεσμάτων
//                               + αναλυτικές κινήσεις). Το «δώσ' μου τα νούμερα».
//   exportAccountantDossier() → ΟΛΟΚΛΗΡΟΣ φάκελος .zip με αριθμημένους
//                               υποφακέλους και ρητό «05_ΤΙ_ΛΕΙΠΕΙ».
//
// ΓΙΑΤΙ ΔΥΟ. Το Excel απαντά «πόσα». Ο φάκελος απαντά «είμαι έτοιμος;» — και
// κυρίως λέει στον λογιστή ΤΙ ΔΕΝ ΒΡΗΚΕ, χωρίς να ψάξει και χωρίς τηλέφωνο.
// Ένας λογιστής που ανοίγει φάκελο και ξέρει αμέσως τι λείπει, δεν χρεώνει την
// ώρα που θα έψαχνε. Αυτό είναι όλη η διαφορά.
//
// Πραγματικά κελιά, ημερομηνίες ως ημερομηνίες, ποσά ως νόμισμα (2 δεκαδικά),
// σωστή στοίχιση/πλαίσια — σαν να το ετοίμασε λογιστής. Ασπρόμαυρο, καθαρό.
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, FMT, S, setCell, money, moneySigned, type Cell } from './xlsxStyle';
import { buildZip, type ZipFile } from '@/lib/accounting/zip';
import { WHO_LABEL, type Requirement } from '@/lib/accounting/dossier';

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

/** Το βιβλίο εργασίας των δύο φύλλων — κοινό για το σκέτο Excel και για τον φάκελο. */
function buildWorkbook(inp: AccountantBundleInput) {
  const { year, propName, ownerAfm, statementLines, provisionMonthly, book } = inp;
  const wb = XLSX.utils.book_new();
  // Ταυτότητα φορολογούμενου/περιόδου — ίδια ακριβώς και στα δύο φύλλα.
  const idLine = `Property OS · ${propName}${ownerAfm ? ` · ΑΦΜ ${ownerAfm}` : ''} · Περίοδος 01/01/${year}–31/12/${year} · Ημερομηνία έκδοσης ${new Date().toLocaleDateString('el-GR')}`;

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
      ['Περιγραφή', 'Ποσό'],
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
      setCell(ws, rr, 1, { v: moneySigned(r.amount ?? 0), t: 's', s: numS }); // κείμενο «€» με κόμμα
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Κατάσταση αποτελεσμάτων');
  }

  // ── Φύλλο 2: Αναλυτικές κινήσεις (Έσοδα / Έξοδα) ────────────────────────────
  {
    const NC = 6, HR = 3;
    const sorted = [...book].sort((a, b) => a.date.localeCompare(b.date));
    const sumIn = sorted.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
    const sumEx = sorted.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
    const header = ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', 'Έσοδα', 'Έξοδα'];
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
      // Έσοδα/Έξοδα ως κείμενο «€» με κόμμα (ίδια εμφάνιση σε κάθε Excel).
      for (const c of [4, 5]) { const cell = ws[enc(r, c)] as Cell | undefined; if (cell && typeof cell.v === 'number') setCell(ws, r, c, { v: money(cell.v), t: 's', s: S.num }); else setCell(ws, r, c, { s: S.num }); }
    }
    // Σύνολα + καθαρό (υπολογισμένα, ως κείμενο «€»).
    setCell(ws, totalR, 0, { s: S.totTxt }); setCell(ws, totalR, 1, { s: S.totTxt }); setCell(ws, totalR, 2, { s: S.totTxt }); setCell(ws, totalR, 3, { s: S.totTxt });
    setCell(ws, totalR, 4, { v: money(sumIn), t: 's', s: S.totNum });
    setCell(ws, totalR, 5, { v: money(sumEx), t: 's', s: S.totNum });
    setCell(ws, netR, 3, { s: S.strongTxt });
    setCell(ws, netR, 4, { v: moneySigned(Math.round((sumIn - sumEx) * 100) / 100), t: 's', s: S.strongNum });
    setCell(ws, netR, 5, { s: S.strongTxt });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, `Κινήσεις ${year}`);
  }

  return wb;
}

const safeName = (s: string) => (s || 'akinito').replace(/\s+/g, '_');

/** Κατεβάζει το λογιστικό Excel του έτους (κατάσταση αποτελεσμάτων + κινήσεις). */
export function exportAccountantBundle(inp: AccountantBundleInput): void {
  XLSX.writeFile(buildWorkbook(inp), `logistiki_${safeName(inp.propName)}_${inp.year}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Ο ΦΑΚΕΛΟΣ
// ═══════════════════════════════════════════════════════════════════════════

export interface DossierExportInput extends AccountantBundleInput {
  /** Ο πλήρης κατάλογος για αυτόν τον χρήστη (από requirementsFor). */
  requirements: readonly Requirement[];
  /** Τι έχει ήδη ο χρήστης — τα υπόλοιπα γράφονται στο 05_ΤΙ_ΛΕΙΠΕΙ. */
  haveIds: readonly string[];
  /** Η φράση ετοιμότητας, ίδια με αυτή που βλέπει ο χρήστης στην οθόνη. */
  readinessMessage: string;
  /** Τα ακίνητα και η κατάστασή τους, στη γλώσσα του λογιστή. */
  properties: readonly { name: string; status: string }[];
  formLabel: string;
  booksLabel: string;
  /** Κενά στα δεδομένα της εφαρμογής (π.χ. «καμία δαπάνη για το 2026»). */
  gaps?: readonly string[];
}

const CRLF = '\r\n';
const BOM = '﻿';                                   // ώστε το ελληνικό Excel να ανοίγει σωστά τα CSV
const csvCell = (v: string | number): string => {
  const s = String(v ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]): string => BOM + rows.map(r => r.map(csvCell).join(';')).join(CRLF) + CRLF;
const txt = (lines: string[]): string => BOM + lines.join(CRLF) + CRLF;
const grDate = (d: string): string => { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };
const grNum = (n: number): string => (n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rule = (ch = '─', n = 74) => ch.repeat(n);

/**
 * Ο φάκελος, ως ένα αρχείο .zip.
 *
 * Η ΑΡΙΘΜΗΣΗ ΕΙΝΑΙ Η ΟΔΗΓΙΑ ΧΡΗΣΗΣ. Ο λογιστής δεν διαβάζει README· διαβάζει
 * ονόματα φακέλων. 01 η σύνοψη, 02 τα έσοδα, 03 τα έξοδα, 04 τα δικαιολογητικά
 * και 05 —μόνο του, έξω από κάθε υποφάκελο, για να μη χαθεί— τι λείπει.
 */
export function exportAccountantDossier(inp: DossierExportInput): void {
  const { year, propName, ownerAfm, requirements, haveIds, readinessMessage, properties, formLabel, booksLabel, gaps = [], book } = inp;
  const have = new Set(haveIds);
  const missing = requirements.filter(r => !have.has(r.id));
  const issued = new Date().toLocaleDateString('el-GR');
  const idLine = `${propName}${ownerAfm ? ` · ΑΦΜ ${ownerAfm}` : ''} · χρήση ${year}`;

  const income = book.filter(e => e.type === 'income').sort((a, b) => a.date.localeCompare(b.date));
  const expense = book.filter(e => e.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));
  const sum = (rows: AccountantMovement[]) => rows.reduce((s, e) => s + (e.amount || 0), 0);

  // ── 00 · Τι κρατάς στα χέρια σου ─────────────────────────────────────────
  const readme = txt([
    'ΦΑΚΕΛΟΣ ΓΙΑ ΤΟΝ ΛΟΓΙΣΤΗ', rule('═'), '',
    idLine,
    `Νομική μορφή: ${formLabel} · Βιβλία: ${booksLabel}`,
    `Ημερομηνία έκδοσης: ${issued}`, '',
    readinessMessage, '', rule(), '',
    'ΠΕΡΙΕΧΟΜΕΝΑ',
    '  01_ΣΥΝΟΨΗ            Κατάσταση αποτελεσμάτων και αναλυτικές κινήσεις (Excel).',
    '  02_ΕΣΟΔΑ             Κάθε είσπραξη του έτους, με ημερομηνία και περιγραφή.',
    '  03_ΕΞΟΔΑ             Κάθε πληρωμή του έτους, ανά κατηγορία.',
    '  04_ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ    Ο κατάλογος των παραστατικών, με το ποιος φέρνει το καθένα.',
    '  05_ΤΙ_ΛΕΙΠΕΙ         Ό,τι ΔΕΝ βρέθηκε. Διαβάστε το πρώτο.', '', rule(), '',
    'Τα ποσά προέρχονται από τις καταχωρήσεις του ιδιοκτήτη στο Property OS και',
    'δεν αποτελούν φορολογική δήλωση ούτε λογιστική συμβουλή.',
  ]);

  // ── 01 · Ταυτότητα και σύνοψη ────────────────────────────────────────────
  const wbBytes = new Uint8Array(XLSX.write(buildWorkbook(inp), { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
  const identity = txt([
    'ΤΑΥΤΟΤΗΤΑ ΦΑΚΕΛΟΥ', rule('═'), '',
    `Χρήση:          01/01/${year} – 31/12/${year}`,
    `Φορολογούμενος: ${propName}${ownerAfm ? ` (ΑΦΜ ${ownerAfm})` : ''}`,
    `Νομική μορφή:   ${formLabel}`,
    `Βιβλία:         ${booksLabel}`, '',
    'ΑΚΙΝΗΤΑ ΚΑΙ ΚΑΤΑΣΤΑΣΗ', rule(),
    ...(properties.length ? properties.map(p => `  · ${p.name} — ${p.status}`) : ['  (δεν έχουν καταχωρηθεί ακίνητα)']), '',
    'ΣΥΝΟΛΑ ΕΤΟΥΣ', rule(),
    `  Έσοδα:  ${grNum(sum(income))} €  (${income.length} κινήσεις)`,
    `  Έξοδα:  ${grNum(sum(expense))} €  (${expense.length} κινήσεις)`,
    `  Καθαρό: ${grNum(sum(income) - sum(expense))} €`,
  ]);

  // ── 02 / 03 · Οι κινήσεις, χωριστά ───────────────────────────────────────
  const movementCsv = (rows: AccountantMovement[], head: string) => csv([
    [head],
    [idLine],
    [],
    ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', 'Ποσό (€)'],
    ...rows.map((e, i) => [i + 1, grDate(e.date), e.category || '', e.description || '', grNum(e.amount)]),
    [],
    ['', '', '', 'ΣΥΝΟΛΟ', grNum(sum(rows))],
  ]);

  // ── 04 · Ο κατάλογος των παραστατικών ────────────────────────────────────
  const checklist = csv([
    [`ΚΑΤΑΛΟΓΟΣ ΔΙΚΑΙΟΛΟΓΗΤΙΚΩΝ ${year}`],
    [idLine],
    [],
    ['Παραστατικό', 'Κατάσταση', 'Ποιος το φέρνει', 'Απαραίτητο', 'Γιατί χρειάζεται', 'Πού βρίσκεται'],
    ...requirements.map(r => [
      r.title, have.has(r.id) ? 'Υπάρχει' : 'Λείπει', WHO_LABEL[r.who],
      r.blocking ? 'ΝΑΙ' : '', r.why, r.source || '',
    ]),
  ]);

  const trapRows = requirements.filter(r => r.trap);
  const trapsFile = txt([
    'ΠΑΓΙΔΕΣ ΠΟΥ ΚΟΣΤΙΖΟΥΝ', rule('═'), '',
    'Σημειώσεις για σημεία που, όταν πάνε στραβά, κοστίζουν χρήματα ή χρόνια.', '',
    ...trapRows.flatMap(r => [`· ${r.title}`, `  ${r.trap}`, '']),
  ]);

  // ── 05 · ΤΙ ΛΕΙΠΕΙ ───────────────────────────────────────────────────────
  const block = (rs: readonly Requirement[]) => rs.flatMap((r, i) => [
    `${String(i + 1).padStart(2, ' ')}. ${r.title}`,
    `    Ποιος το φέρνει: ${WHO_LABEL[r.who]}`,
    `    Γιατί: ${r.why}`,
    ...(r.source ? [`    Πού: ${r.source}`] : []),
    ...(r.trap ? [`    Προσοχή: ${r.trap}`] : []),
    '',
  ]);
  const blocking = missing.filter(r => r.blocking);
  const pending = missing.filter(r => !r.blocking);
  const whatsMissing = txt([
    `ΤΙ ΛΕΙΠΕΙ ΑΠΟ ΑΥΤΟΝ ΤΟΝ ΦΑΚΕΛΟ · ${year}`, rule('═'), '',
    idLine, `Ημερομηνία έκδοσης: ${issued}`, '',
    readinessMessage, '', rule(), '',
    ...(blocking.length
      ? [`Α. ΧΩΡΙΣ ΑΥΤΑ ΔΕΝ ΚΛΕΙΝΕΙ Η ΔΗΛΩΣΗ (${blocking.length})`, rule(), '', ...block(blocking)]
      : ['Α. ΧΩΡΙΣ ΑΥΤΑ ΔΕΝ ΚΛΕΙΝΕΙ Η ΔΗΛΩΣΗ', rule(), '', '    Κανένα. Όλα τα απαραίτητα υπάρχουν.', '']),
    ...(pending.length
      ? [`Β. ΚΑΛΟ ΝΑ ΥΠΑΡΧΟΥΝ, ΔΕΝ ΜΠΛΟΚΑΡΟΥΝ (${pending.length})`, rule(), '', ...block(pending)]
      : []),
    ...(gaps.length
      ? ['Γ. ΚΕΝΑ ΣΤΑ ΔΕΔΟΜΕΝΑ ΤΗΣ ΕΦΑΡΜΟΓΗΣ', rule(), '', ...gaps.map(g => `  · ${g}`), '']
      : []),
    rule(),
    missing.length === 0 && gaps.length === 0
      ? 'Ο φάκελος είναι πλήρης.'
      : 'Τα παραπάνω δεν βρέθηκαν στην εφαρμογή. Δεν σημαίνει ότι δεν υπάρχουν —',
    ...(missing.length === 0 && gaps.length === 0 ? [] : ['σημαίνει ότι δεν συνοδεύουν αυτόν τον φάκελο.']),
  ]);

  const files: ZipFile[] = [
    { path: '00_ΔΙΑΒΑΣΕ_ΜΕ.txt', data: readme },
    { path: '01_ΣΥΝΟΨΗ/Ταυτότητα_φακέλου.txt', data: identity },
    { path: `01_ΣΥΝΟΨΗ/Λογιστική_${year}.xlsx`, data: wbBytes },
    { path: `02_ΕΣΟΔΑ/Έσοδα_${year}.csv`, data: movementCsv(income, `ΕΣΟΔΑ ${year}`) },
    { path: `03_ΕΞΟΔΑ/Έξοδα_${year}.csv`, data: movementCsv(expense, `ΕΞΟΔΑ ${year}`) },
    { path: `04_ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Κατάλογος_δικαιολογητικών_${year}.csv`, data: checklist },
    ...(trapRows.length ? [{ path: '04_ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Παγίδες_που_κοστίζουν.txt', data: trapsFile }] : []),
    { path: '05_ΤΙ_ΛΕΙΠΕΙ.txt', data: whatsMissing },
  ];

  const blob = new Blob([buildZip(files) as unknown as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fakelos_logisti_${safeName(propName)}_${year}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
