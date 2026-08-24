'use client';
// ═══════════════════════════════════════════════════════════════════════════
// journalXlsx — Επαγγελματικό λογιστικό ημερολόγιο σε Excel (.xlsx).
//
// Ό,τι δεν χωρά ένα CSV (μορφοποίηση €, φίλτρα, ζωντανές φόρμουλες SUM, πλάτη
// στηλών, πλαίσια, ισοζύγιο, έλεγχος) το δίνει αυτό, με το ΕΝΙΑΙΟ λογιστικό στυλ
// του app (xlsxStyle). Τρία φύλλα: Ημερολόγιο (διπλογραφικό, με σύνολα & έλεγχο
// ισοζυγίου ως φόρμουλα), Ισοζύγιο, Έλεγχος (audit). Το σχέδιο λογαριασμών
// είναι των ΕΛΠ (ν. 4308/2014), όπως και σε κάθε άλλο έγγραφο της εφαρμογής.
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, setCell, sheetFinish, downloadWorkbook } from './xlsxStyle';
import { FMT, S, type Cell } from './sheetFormat';
import {
  trialBalance, journalTotals, auditJournal,
  type JournalLine,
} from '@/lib/accounting/journal';

const A1 = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
const toDate = (s: string): Date | string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : (s || ''); };

export function downloadJournalWorkbook(opts: {
  lines: JournalLine[];
  periodLabel: string;
  entityName?: string;
  year?: number;
  month?: number;
  fileName?: string;
}): void {
  const { lines, periodLabel, entityName } = opts;
  const wb = XLSX.utils.book_new();
  // ΤΟ ΣΧΕΔΙΟ ΓΡΑΦΕΤΑΙ ΟΠΩΣ ΕΙΝΑΙ. Έλεγε «Ελληνικό Γενικό Λογιστικό Σχέδιο» ενώ
  // οι κωδικοί μέσα στο ίδιο αρχείο είναι πλέον των ΕΛΠ: ο λογιστής διάβαζε
  // υπογραφή ΕΓΛΣ και έβλεπε 64.02.
  const idLine = `${entityName || 'PROPERWISE'} · Διπλογραφική μέθοδος · Ελληνικά Λογιστικά Πρότυπα, ν. 4308/2014`;

  // ── Φύλλο 1: Ημερολόγιο ────────────────────────────────────────────────────
  {
    const NC = 9, HR = 3;
    // Στήλες Χρέωσης/Πίστωσης (0-indexed) — μία πηγή αλήθειας, ώστε η προσθήκη
    // στήλης να μη «σπάει» φόρμουλες/στυλ παρακάτω.
    const CD = 6, CC = 7;
    const header = ['Άρθρο', 'Ημερομηνία', 'Κωδικός', 'Λογαριασμός', 'Αιτιολογία', 'Ακίνητο', 'Χρέωση', 'Πίστωση', 'Παραστατικό'];
    const data: Cell['v'][][] = lines.map((l, i) => [
      l.art ?? (i + 1), toDate(l.date), l.code, l.account, l.description, l.property || '',
      l.debit || '', l.credit || '', l.doc || '',
    ]);
    const aoa: (string | number | Date)[][] = [
      [`ΛΟΓΙΣΤΙΚΟ ΗΜΕΡΟΛΟΓΙΟ · ${periodLabel}`], [idLine], [],
      header, ...data as (string | number | Date)[][],
      ['', '', '', '', '', 'ΣΥΝΟΛΑ', '', '', ''],
      ['', '', '', '', '', 'Έλεγχος ισοζυγίου', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 11 }, { wch: 32 }, { wch: 42 }, { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 16 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } }];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 24 };

    const lastData = HR + lines.length;         // 0-indexed row of last data line
    const totalR = lastData + 1, checkR = lastData + 2;
    setCell(ws, 0, 0, { s: S.title });
    setCell(ws, 1, 0, { s: S.sub });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });

    for (let r = HR + 1; r <= lastData; r++) {
      ws['!rows'][r] = { hpt: 16 };
      setCell(ws, r, 0, { s: S.num });                                                    // Α/Α
      const dcell = ws[A1(r, 1)] as Cell | undefined;
      const isDate = !!dcell && dcell.v instanceof Date;
      setCell(ws, r, 1, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } }, ...(isDate ? { t: 'd', z: FMT.date } : {}) });
      setCell(ws, r, 2, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });  // Κωδικός
      setCell(ws, r, 3, { s: S.txt });                                                    // Λογαριασμός
      setCell(ws, r, 4, { s: S.txtWrap });                                                // Αιτιολογία
      setCell(ws, r, 5, { s: S.txt });                                                    // Ακίνητο (κέντρο κόστους)
      for (const c of [CD, CC]) {                                                         // Χρέωση/Πίστωση — αριθμοί € με φόρμουλα-ready
        const cell = ws[A1(r, c)] as Cell | undefined;
        if (cell && typeof cell.v === 'number') setCell(ws, r, c, { t: 'n', z: FMT.eur, s: S.num });
        else setCell(ws, r, c, { s: S.num });
      }
      setCell(ws, r, 8, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });  // Παραστατικό
    }

    // Σύνολα ως ΖΩΝΤΑΝΕΣ φόρμουλες SUM (recalc στο άνοιγμα· cached v για viewers).
    const t = journalTotals(lines);
    for (let c = 0; c < CD; c++) setCell(ws, totalR, c, { s: S.totTxt });
    const dRange = `${A1(HR + 1, CD)}:${A1(lastData, CD)}`;
    const cRange = `${A1(HR + 1, CC)}:${A1(lastData, CC)}`;
    setCell(ws, totalR, CD, { t: 'n', f: `SUM(${dRange})`, v: t.debit, z: FMT.eur, s: S.totNum });
    setCell(ws, totalR, CC, { t: 'n', f: `SUM(${cRange})`, v: t.credit, z: FMT.eur, s: S.totNum });
    setCell(ws, totalR, 8, { s: S.totTxt });

    // Έλεγχος ισοζυγίου ως φόρμουλα IF (πράσινο/κόκκινο ανάλογα με το αποτέλεσμα).
    for (let c = 0; c < CD; c++) setCell(ws, checkR, c, { s: S.strongTxt });
    const balOk = t.balanced;
    setCell(ws, checkR, CD, {
      t: 's',
      // ΧΩΡΙΣ ΠΡΑΣΙΝΟ ΚΑΙ ΚΟΚΚΙΝΟ. Το ίδιο αρχείο απαγόρευε το σημασιολογικό
      // χρώμα εξήντα γραμμές πιο κάτω και το χρησιμοποιούσε εδώ. Η διαφορά
      // φαίνεται από τη λέξη, που είναι και η μόνη που διαβάζεται τυπωμένη
      // ασπρόμαυρη ή από δαλτωνικό.
      f: `IF(ROUND(${A1(totalR, CD)}-${A1(totalR, CC)},2)=0,"✓ ΙΣΟΣΚΕΛΙΣΜΕΝΟ","ΑΣΥΜΦΩΝΙΑ")`,
      v: balOk ? '✓ ΙΣΟΣΚΕΛΙΣΜΕΝΟ' : 'ΑΣΥΜΦΩΝΙΑ',
      s: { ...S.strongTxt, alignment: { horizontal: 'left', vertical: 'center' } },
    });
    if (ws['!merges']) ws['!merges'].push({ s: { r: checkR, c: CD }, e: { r: checkR, c: 8 } });

    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    // Το `ws['!freeze']` καθόταν εδώ και ΔΕΝ έκανε τίποτα: η βιβλιοθήκη το
    // δέχεται και δεν το γράφει ποτέ. Το `sheetFinish` το γράφει στο XML.
    sheetFinish(ws, { freezeRows: HR + 1 });
    XLSX.utils.book_append_sheet(wb, ws, 'Ημερολόγιο');
  }

  // ── Φύλλο 2: Ισοζύγιο (trial balance) ──────────────────────────────────────
  {
    const NC = 6, HR = 3;
    const tb = trialBalance(lines);
    const header = ['Κωδικός', 'Λογαριασμός', 'Σύνολο Χρέωσης', 'Σύνολο Πίστωσης', 'Χρεωστικό υπόλοιπο', 'Πιστωτικό υπόλοιπο'];
    const data: (string | number)[][] = tb.map(r => [
      r.code, r.account, r.debit || '', r.credit || '',
      r.balance > 0 ? r.balance : '', r.balance < 0 ? -r.balance : '',
    ]);
    const aoa: (string | number)[][] = [
      [`ΙΣΟΖΥΓΙΟ ΛΟΓΑΡΙΑΣΜΩΝ · ${periodLabel}`], [idLine], [],
      header, ...data, ['', 'ΣΥΝΟΛΑ', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 10 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 17 }, { wch: 17 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } }];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 24 };
    setCell(ws, 0, 0, { s: S.title }); setCell(ws, 1, 0, { s: S.sub });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    const lastData = HR + tb.length, totalR = lastData + 1;
    for (let r = HR + 1; r <= lastData; r++) {
      ws['!rows'][r] = { hpt: 16 };
      setCell(ws, r, 0, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });
      setCell(ws, r, 1, { s: S.txt });
      for (const c of [2, 3, 4, 5]) { const cell = ws[A1(r, c)] as Cell | undefined; if (cell && typeof cell.v === 'number') setCell(ws, r, c, { t: 'n', z: FMT.eur, s: S.num }); else setCell(ws, r, c, { s: S.num }); }
    }
    for (let c = 0; c < 2; c++) setCell(ws, totalR, c, { s: S.totTxt });
    for (const c of [2, 3, 4, 5]) {
      const range = `${A1(HR + 1, c)}:${A1(lastData, c)}`;
      const sum = tb.reduce((s, r) => s + (c === 2 ? r.debit : c === 3 ? r.credit : c === 4 ? (r.balance > 0 ? r.balance : 0) : (r.balance < 0 ? -r.balance : 0)), 0);
      setCell(ws, totalR, c, { t: 'n', f: `SUM(${range})`, v: Math.round(sum * 100) / 100, z: FMT.eur, s: S.totNum });
    }
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, 'Ισοζύγιο');
  }

  // ── Φύλλο 3: Έλεγχος (audit) ────────────────────────────────────────────────
  {
    const NC = 3, HR = 3;
    const audit = auditJournal(lines, { year: opts.year, month: opts.month });
    const mark = (s: string) => (s === 'pass' ? '✓' : s === 'warn' ? '·' : '✗');
    const header = ['Έλεγχος', 'Κατάσταση', 'Λεπτομέρεια και πρόταση'];
    const aoa: (string | number)[][] = [
      [`ΕΛΕΓΧΟΣ ΙΣΟΖΥΓΙΟΥ · ${periodLabel}`],
      [`Αποτέλεσμα: ${audit.summary}`],
      [],
      header, ...audit.checks.map(c => [`${mark(c.status)}  ${c.label}`, c.status === 'pass' ? 'ΟΚ' : c.status === 'warn' ? 'ΠΡΟΣΟΧΗ' : 'ΣΦΑΛΜΑ', c.fix ? `${c.detail}\nΠρόταση: ${c.fix}` : c.detail]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 48 }, { wch: 14 }, { wch: 62 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } }];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 24 };
    setCell(ws, 0, 0, { s: S.title });
    // Η σύνοψη του ελέγχου ξεχωρίζει με ΒΑΡΟΣ, όχι με χρώμα: η ίδια πρόταση
    // διαβάζεται τυπωμένη ασπρόμαυρη και από όποιον δεν ξεχωρίζει το κόκκινο.
    setCell(ws, 1, 0, { s: { ...S.sub, font: { name: 'Calibri', bold: true, sz: 10 } } });
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    audit.checks.forEach((c, i) => {
      const r = HR + 1 + i; ws['!rows']![r] = { hpt: c.fix ? 30 : 18 };
      setCell(ws, r, 0, { s: S.txt });
      // ΚΑΜΙΑ ΣΗΜΑΣΙΑ ΣΕ ΠΡΑΣΙΝΟ ΚΑΙ ΚΟΚΚΙΝΟ, ΟΥΤΕ ΣΤΟ EXCEL. Το φύλλο ελέγχου
      // έβαφε «πέρασε» πράσινο και «απέτυχε» κόκκινο — τα δύο χρώματα που ο
      // έγχρωμα τυφλός αναγνώστης δεν ξεχωρίζει, πάνω σε πληροφορία που κρίνει
      // αν η δήλωση είναι σωστή. Η ιεραρχία βγαίνει από το ΒΑΡΟΣ: ό,τι χρειάζεται
      // προσοχή είναι έντονο και σκούρο, ό,τι πέρασε είναι απαλό.
      setCell(ws, r, 1, { s: { ...S.strongTxt, alignment: { horizontal: 'center', vertical: 'center' }, font: { name: 'Calibri', bold: c.status !== 'pass', sz: 10, color: { rgb: c.status === 'pass' ? '6B7280' : '111111' } } } });
      setCell(ws, r, 2, { s: S.txtWrap });
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Έλεγχος');
  }

  // Το `[^\\w\\-.]` ήταν ASCII και έσβηνε ΚΑΘΕ ελληνικό χαρακτήρα του ονόματος.
  // Ο καθαρισμός γίνεται πια στο `lib/core/download.ts`, που κρατά τα ελληνικά.
  downloadWorkbook(wb, opts.fileName || `Λογιστικό ημερολόγιο ${periodLabel}`);
}
