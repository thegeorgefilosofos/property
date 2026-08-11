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
import { XLSX, FMT, S, setCell, downloadWorkbook, money, moneySigned, type Cell } from './xlsxStyle';
import { supplyLabel, type Supply } from '@/lib/tax/placeOfSupply';
import { myDataHint, myDataCell, pendingGroups, type VatDeduction } from '@/lib/tax/myData';
import { csvCell } from '@/lib/core/csv';
import { buildZip, type ZipFile } from '@/lib/accounting/zip';
import { WHO_LABEL, type Requirement } from '@/lib/accounting/dossier';
import { downloadFile } from '@/lib/core/download';

export interface AccountantStatementLine { label: string; amount: number; kind: string; negative?: boolean }
export interface AccountantMovement {
  date: string; type: 'income' | 'expense'; category: string; description: string; amount: number;
  /** Χώρα εκδότη (ISO alpha-2) και τόπος παροχής. Κενά στα έσοδα και σε ό,τι δεν ρωτήθηκε. */
  supplier_country?: string | null;
  supply?: string | null;
}
/**
 * ΜΙΑ ΜΕΤΑΤΡΟΠΗ ΚΑΘΟΛΙΚΟΥ ΣΕ ΚΙΝΗΣΗ, ΓΙΑ ΟΛΑ ΤΑ ΚΟΥΜΠΙΑ.
 *
 * Η εφαρμογή χτίζει το ίδιο βιβλίο σε ΔΥΟ σημεία: στον φάκελο του λογιστή και
 * στο κουμπί «Excel» της Λογιστικής. Ήταν γραμμένα δύο φορές, πεδίο προς πεδίο,
 * και όταν προστέθηκαν η χώρα και ο τόπος παροχής μπήκαν μόνο στο ένα: το ένα
 * αρχείο έβγαινε σωστό και το άλλο με κενές στήλες, χωρίς κανένα σφάλμα και
 * χωρίς καμία ένδειξη. Μία συνάρτηση, και το επόμενο πεδίο μπαίνει μία φορά.
 */
export function toMovement(e: {
  date: string; type: 'income' | 'expense'; category: string; description: string; amount: number;
  supplier_country?: string | null; supply?: string | null;
}): AccountantMovement {
  return {
    date: e.date, type: e.type, category: e.category, description: e.description, amount: e.amount,
    supplier_country: e.supplier_country ?? null, supply: e.supply ?? null,
  };
}

export interface AccountantBundleInput {
  year: number;
  propName: string;
  ownerAfm?: string;
  statementLines: AccountantStatementLine[];
  provisionMonthly: number;
  book: AccountantMovement[];
  /**
   * Η ΣΤΗΛΗ myDATA ΥΠΑΡΧΕΙ ΜΟΝΟ ΓΙΑ ΟΠΟΙΟΝ ΚΑΝΕΙ myDATA.
   *
   * Ο ιδιοκτήτης που εκμισθώνει κατοικία ως φυσικό πρόσωπο δεν χαρακτηρίζει
   * έξοδα: δεν τηρεί βιβλία και δεν διαβιβάζει τίποτα. Μια στήλη «2.4 / 2.5»
   * στο αρχείο του δεν είναι απλώς άχρηστη, είναι παραπλανητική — δείχνει
   * υποχρέωση που δεν έχει. Όταν λείπει το πεδίο, το φύλλο μένει ακριβώς όπως
   * ήταν, οκτώ στήλες.
   */
  myData?: { vat: VatDeduction };
}

/**
 * Ο τόπος παροχής όπως τον διαβάζει λογιστής. Κενό όταν δεν ξέρουμε — ΠΟΤΕ
 * «Εγχώρια» από παράλειψη: το κενό λέει «ρώτησέ με», το «Εγχώρια» λέει ψέματα.
 * Η ονομασία έρχεται από το lib/tax/placeOfSupply.ts, μία φορά για όλη την
 * εφαρμογή — οθόνη και αρχείο δεν επιτρέπεται να τον λένε αλλιώς.
 */
const supplyCell = (s: string | null | undefined): string =>
  s === 'domestic' || s === 'intra_eu' || s === 'third_country' ? supplyLabel(s) : '';

const toDate = (d: string): Date | string => { const t = new Date(d + 'T00:00:00'); return isNaN(t.getTime()) ? d : t; };
// Ιταλική γκρι σημείωση για «memo» γραμμές (π.χ. πρόβλεψη φόρου) — διακριτή από το αποτέλεσμα.
const MEMO_TXT = { font: { name: 'Calibri', color: { rgb: '6B7280' }, sz: 10, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
const MEMO_NUM = { font: { name: 'Calibri', color: { rgb: '6B7280' }, sz: 10, italic: true }, alignment: { horizontal: 'right', vertical: 'center' } };

/**
 * Το βιβλίο εργασίας των δύο φύλλων — κοινό για το σκέτο Excel και για τον φάκελο.
 *
 * ΕΞΑΓΕΤΑΙ ΓΙΑ ΝΑ ΔΟΚΙΜΑΖΕΤΑΙ. Το αρχείο που φεύγει στον λογιστή δεν μπορεί να
 * επαληθεύεται με το μάτι: μια στήλη που μετακινήθηκε κατά ένα δίνει σύνολο
 * κάτω από λάθος επικεφαλίδα, και το Excel ανοίγει κανονικά.
 */
export function buildWorkbook(inp: AccountantBundleInput) {
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
    // ΟΚΤΩ ΣΤΗΛΕΣ, ΚΑΙ ΤΟ `NC` ΕΙΝΑΙ Ο ΜΟΝΟΣ ΤΟΠΟΣ ΠΟΥ ΤΟ ΞΕΡΕΙ. Οι δείκτες των
    // συνόλων παράγονται από αυτό (`NC - 2`, `NC - 1`) αντί να είναι γραμμένοι
    // σταθεροί: ήταν 4 και 5, και μια τρίτη στήλη θα τους άφηνε πίσω σιωπηλά —
    // το σύνολο των εξόδων θα καθόταν κάτω από την επικεφαλίδα της χώρας.
    // ΤΟ ΠΛΗΘΟΣ ΤΩΝ ΣΤΗΛΩΝ ΕΙΝΑΙ ΜΕΤΑΒΛΗΤΟ, ΚΑΙ ΟΛΑ ΤΑ ΥΠΟΛΟΙΠΑ ΤΟ ΑΚΟΛΟΥΘΟΥΝ.
    // Η στήλη του χαρακτηρισμού μπαίνει ΠΡΙΝ τα ποσά, δίπλα στον τόπο παροχής
    // με τον οποίο συνδέεται: «τι, από πού, πώς χαρακτηρίζεται, πόσο».
    const myData = inp.myData;
    const NC = myData ? 9 : 8, HR = 3;
    /** Η στήλη του χαρακτηρισμού, ή −1 όταν δεν υπάρχει. */
    const C_MYDATA = myData ? 6 : -1;
    // ΤΑ ΠΟΣΑ ΚΛΕΙΝΟΥΝ ΤΗ ΓΡΑΜΜΗ, ΟΠΟΤΕ ΠΑΡΑΓΟΝΤΑΙ ΑΠΟ ΤΟ ΠΛΗΘΟΣ ΣΤΗΛΩΝ: μια
    // ένατη στήλη αύριο τα παίρνει μαζί της, χωρίς να το θυμηθεί κανείς.
    const C_IN = NC - 2, C_EX = NC - 1;
    // Η ΕΤΙΚΕΤΑ ΤΩΝ ΣΥΝΟΛΩΝ ΟΜΩΣ ΕΙΝΑΙ ΘΕΣΗ, ΟΧΙ ΑΠΟΣΤΑΣΗ. Παραγόταν κι αυτή
    // από το `NC` και προσγειώθηκε κάτω από τον «Τόπο παροχής»: ένα «ΣΥΝΟΛΑ»
    // κάτω από στήλη που λέει «Ενδοκοινοτική λήψη υπηρεσιών» διαβάζεται ως
    // σύνολο ΕΚΕΙΝΗΣ της στήλης. Η θέση της είναι η Περιγραφή, εκεί που ήταν
    // πάντα και εκεί που τη διαβάζει λογιστής.
    const C_LABEL = 3;
    /** Γραμμή συνόλων: ετικέτα στην Περιγραφή, ποσά κάτω από τα ποσά. */
    const totalsRow = (label: string, income: number | string, expense: number | string) => {
      const r: (string | number)[] = Array(NC).fill('');
      r[C_LABEL] = label; r[C_IN] = income; r[C_EX] = expense;
      return r;
    };
    const sorted = [...book].sort((a, b) => a.date.localeCompare(b.date));
    const sumIn = sorted.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
    const sumEx = sorted.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
    // Η ΧΩΡΑ ΚΑΙ Ο ΤΟΠΟΣ ΠΑΡΟΧΗΣ ΜΠΑΙΝΟΥΝ ΠΡΙΝ ΤΑ ΠΟΣΑ, όχι στο τέλος: ο
    // λογιστής διαβάζει «τι, από πού, πόσο». Τα ποσά κλείνουν τη γραμμή, όπως σε
    // κάθε παραστατικό, και τα σύνολα κάθονται από κάτω τους.
    const header = ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', 'Χώρα', 'Τόπος παροχής',
      ...(myData ? ['Χαρακτηρισμός myDATA'] : []), 'Έσοδα', 'Έξοδα'];
    // Ο ΧΑΡΑΚΤΗΡΙΣΜΟΣ ΑΦΟΡΑ ΜΟΝΟ ΤΑ ΕΞΟΔΑ. Στη γραμμή εσόδου το κελί μένει
    // κενό: τα έσοδα έχουν δικό τους παραστατικό, που το εκδίδει ο ίδιος ο
    // ιδιοκτήτης, και δεν «χαρακτηρίζονται» ως έξοδα με κανέναν κωδικό.
    const myDataOf = (e: AccountantMovement): string =>
      !myData || e.type !== 'expense' ? ''
        : myDataCell(myDataHint({ category: e.category, supply: e.supply as Supply | null, vat: myData.vat }));
    const dataRows: Cell['v'][][] = sorted.map((e, i) => [
      i + 1, toDate(e.date), e.category || '', e.description || '',
      // Κενό, όχι «—» και όχι «Ελλάδα»: το έσοδο δεν έχει πάροχο, και η δαπάνη
      // που δεν ρωτήθηκε δεν έχει απάντηση. Ένα συμπληρωμένο κενό σε στήλη
      // ΦΠΑ είναι εικασία γραμμένη ως δεδομένο.
      e.supplier_country || '',
      supplyCell(e.supply),
      ...(myData ? [myDataOf(e)] : []),
      e.type === 'income' ? e.amount : '', e.type === 'expense' ? e.amount : '',
    ]);
    const aoa: (string | number | Date)[][] = [
      [`ΑΝΑΛΥΤΙΚΕΣ ΚΙΝΗΣΕΙΣ ${year}`],
      [idLine],
      [],
      header,
      // ΧΩΡΙΣ ΚΙΝΗΣΕΙΣ, ΤΟ ΦΥΛΛΟ ΤΟ ΛΕΕΙ. Ένα αρχείο με επικεφαλίδες και μηδενικά
      // δεν ξεχωρίζει από αρχείο που χάλασε: ο λογιστής δεν ξέρει αν η χρονιά
      // ήταν άδεια ή αν η εξαγωγή απέτυχε, και θα ρωτήσει.
      ...(sorted.length ? [] : [[...Array(C_LABEL).fill(''), `Καμία καταγεγραμμένη κίνηση για το ${year}`]]),
      ...dataRows as (string | number | Date)[][],
      totalsRow('ΣΥΝΟΛΑ', sumIn, sumEx),
      totalsRow('Καθαρό αποτέλεσμα (Έσοδα − Έξοδα)', Math.round((sumIn - sumEx) * 100) / 100, ''),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    // ΤΟ ΠΛΑΤΟΣ ΚΑΘΕ ΣΤΗΛΗΣ ΕΙΝΑΙ ΤΟ ΜΑΚΡΥΤΕΡΟ ΚΕΙΜΕΝΟ ΤΗΣ, ΜΕΤΡΗΜΕΝΟ. Το Excel
    // κόβει ό,τι δεν χωρά όταν το διπλανό κελί έχει τιμή, και ένας λογιστής που
    // βλέπει «Ενδοκοινοτική λή…» δεν ξέρει αν είναι λήψη ή παράδοση. Ο τόπος
    // παροχής χρειάζεται 19 («Λήψη από τρίτη χώρα») και ο χαρακτηρισμός 45
    // («14.3 · 2.5 Γενικά Έξοδα χωρίς δικαίωμα έκπτωσης Φ.Π.Α.»).
    ws['!cols'] = [{ wch: 6 }, { wch: 13 }, { wch: 24 }, { wch: 40 }, { wch: 8 }, { wch: 22 },
      ...(myData ? [{ wch: 47 }] : []), { wch: 14 }, { wch: 14 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } },
    ];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 22 }; ws['!rows'][1] = { hpt: 15 }; ws['!rows'][HR] = { hpt: 26 };
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    const emptyNote = sorted.length ? 0 : 1;
    const lastData = HR + sorted.length + emptyNote;
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
      setCell(ws, r, 4, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } }); // Χώρα
      setCell(ws, r, 5, { s: S.txt });                                       // Τόπος παροχής
      if (C_MYDATA >= 0) setCell(ws, r, C_MYDATA, { s: S.txt });             // Χαρακτηρισμός myDATA
      // Έσοδα/Έξοδα ως κείμενο «€» με κόμμα (ίδια εμφάνιση σε κάθε Excel).
      for (const c of [C_IN, C_EX]) { const cell = ws[enc(r, c)] as Cell | undefined; if (cell && typeof cell.v === 'number') setCell(ws, r, c, { v: money(cell.v), t: 's', s: S.num }); else setCell(ws, r, c, { s: S.num }); }
    }
    // Σύνολα + καθαρό (υπολογισμένα, ως κείμενο «€»).
    for (let c = 0; c <= C_LABEL; c++) setCell(ws, totalR, c, { s: S.totTxt });
    setCell(ws, totalR, C_IN, { v: money(sumIn), t: 's', s: S.totNum });
    setCell(ws, totalR, C_EX, { v: money(sumEx), t: 's', s: S.totNum });
    setCell(ws, netR, C_LABEL, { s: S.strongTxt });
    setCell(ws, netR, C_IN, { v: moneySigned(Math.round((sumIn - sumEx) * 100) / 100), t: 's', s: S.strongNum });
    setCell(ws, netR, C_EX, { s: S.strongTxt });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, `Κινήσεις ${year}`);
  }

  return wb;
}

/** Κατεβάζει το λογιστικό Excel του έτους (κατάσταση αποτελεσμάτων + κινήσεις). */
export function exportAccountantBundle(inp: AccountantBundleInput): void {
  downloadWorkbook(buildWorkbook(inp), `Λογιστική κατάσταση ${inp.propName || 'ακίνητο'} ${inp.year}`);
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

const csv = (rows: (string | number)[][]): string => BOM + rows.map(r => r.map(v => csvCell(v, ';')).join(';')).join(CRLF) + CRLF;
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
    '  01 ΣΥΝΟΨΗ            Κατάσταση αποτελεσμάτων και αναλυτικές κινήσεις (Excel).',
    '  02 ΕΣΟΔΑ             Κάθε είσπραξη του έτους, με ημερομηνία και περιγραφή.',
    '  03 ΕΞΟΔΑ             Κάθε πληρωμή του έτους, ανά κατηγορία.',
    '  04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ    Ο κατάλογος των παραστατικών, με το ποιος φέρνει το καθένα.',
    '  05 Τι λείπει         Ό,τι ΔΕΝ βρέθηκε. Διαβάστε το πρώτο.', '', rule(), '',
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
  // Ο ΧΑΡΑΚΤΗΡΙΣΜΟΣ ΛΕΙΠΕΙ ΑΚΡΙΒΩΣ ΑΠΟ ΤΟ ΑΡΧΕΙΟ ΠΟΥ ΛΕΓΕΤΑΙ «ΕΞΟΔΑ». Ο λογιστής
  // που θέλει να χαρακτηρίσει τις δαπάνες ανοίγει τον φάκελο 03 και βρίσκει
  // πέντε στήλες χωρίς αυτόν, ενώ το Excel της σύνοψης τον έχει. Μπαίνει και εδώ,
  // με τον ίδιο κανόνα: μόνο όπου υπάρχει υποχρέωση myDATA, και μόνο στα έξοδα.
  const mdCsv = (e: AccountantMovement): string =>
    !inp.myData || e.type !== 'expense' ? ''
      : myDataCell(myDataHint({ category: e.category, supply: e.supply as Supply | null, vat: inp.myData.vat }));
  const movementCsv = (rows: AccountantMovement[], head: string) => {
    const md = !!inp.myData && rows.some(r => r.type === 'expense');
    return csv([
      [head],
      [idLine],
      [],
      ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', ...(md ? ['Χαρακτηρισμός myDATA'] : []), 'Ποσό (€)'],
      ...rows.map((e, i) => [i + 1, grDate(e.date), e.category || '', e.description || '', ...(md ? [mdCsv(e)] : []), grNum(e.amount)]),
      [],
      ['', '', '', 'ΣΥΝΟΛΟ', ...(md ? [''] : []), grNum(sum(rows))],
    ]);
  };

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

  // ── ΟΙ ΔΑΠΑΝΕΣ ΠΟΥ ΔΕΝ ΑΠΟΦΑΣΙΖΟΝΤΑΙ ΜΟΝΕΣ ΤΟΥΣ ────────────────────────────
  // Το «05 Τι λείπει» απαντούσε μόνο «ποιο χαρτί δεν βρέθηκε». Ο χαρακτηρισμός
  // myDATA όμως έχει ΚΑΙ γραμμές που λείπει η ΑΠΟΦΑΣΗ, όχι το χαρτί: ένα γενικό
  // έξοδο χωρίς δηλωμένο δικαίωμα έκπτωσης, μια δαπάνη στο «Άλλο», ένα πάγιο.
  // Στο φύλλο του Excel φαίνονται ως δύο λέξεις μέσα σε κελί· εδώ γράφονται
  // ολόκληρες, με τον λόγο τους, μία φορά ανά περίπτωση και όχι ανά γραμμή —
  // τριάντα δαπάνες ρεύματος έχουν το ίδιο ακριβώς ερώτημα.
  const mdPending = inp.myData
    ? pendingGroups(expense.map(e => ({ category: e.category, supply: e.supply as Supply | null, description: e.description })), inp.myData.vat)
    : [];
  const mdBlock = mdPending.flatMap((m, i) => [
    `${String(i + 1).padStart(2, ' ')}. ${m.label} · ${m.count === 1 ? 'μία δαπάνη' : `${m.count} δαπάνες`}`,
    `    Γιατί: ${m.note}`,
    `    Παράδειγμα: ${m.sample}`,
    '',
  ]);
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
    ...(mdBlock.length
      ? [`Δ. ΔΑΠΑΝΕΣ ΠΟΥ ΖΗΤΟΥΝ ΑΠΟΦΑΣΗ ΓΙΑ ΤΟΝ ΧΑΡΑΚΤΗΡΙΣΜΟ myDATA (${mdPending.length})`, rule(), '', ...mdBlock]
      : []),
    rule(),
    missing.length === 0 && gaps.length === 0 && mdBlock.length === 0
      ? 'Ο φάκελος είναι πλήρης.'
      : 'Τα παραπάνω δεν βρέθηκαν στην εφαρμογή. Δεν σημαίνει ότι δεν υπάρχουν:',
    ...(missing.length === 0 && gaps.length === 0 && mdBlock.length === 0 ? [] : ['σημαίνει ότι δεν συνοδεύουν αυτόν τον φάκελο.']),
  ]);

  // ΤΑ ΟΝΟΜΑΤΑ ΔΙΑΒΑΖΟΝΤΑΙ, ΔΕΝ ΑΠΟΚΩΔΙΚΟΠΟΙΟΥΝΤΑΙ. Οι κάτω παύλες ήταν
  // συνήθεια από ονόματα χωρίς ελληνικά· τα σύγχρονα συστήματα αρχείων δέχονται
  // κενά, και ο λογιστής που ανοίγει τον φάκελο διαβάζει προτάσεις αντί για
  // κώδικα. Το «ΔΙΑΒΑΣΕ_ΜΕ» ήταν και άτονο. Τα αριθμητικά προθέματα μένουν:
  // κρατούν τη σειρά με την οποία διαβάζεται ο φάκελος.
  const files: ZipFile[] = [
    { path: '00 Διάβασέ με.txt', data: readme },
    { path: '01 ΣΥΝΟΨΗ/Ταυτότητα φακέλου.txt', data: identity },
    { path: `01 ΣΥΝΟΨΗ/Λογιστική ${year}.xlsx`, data: wbBytes },
    { path: `02 ΕΣΟΔΑ/Έσοδα ${year}.csv`, data: movementCsv(income, `ΕΣΟΔΑ ${year}`) },
    { path: `03 ΕΞΟΔΑ/Έξοδα ${year}.csv`, data: movementCsv(expense, `ΕΞΟΔΑ ${year}`) },
    { path: `04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Κατάλογος δικαιολογητικών ${year}.csv`, data: checklist },
    ...(trapRows.length ? [{ path: '04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Παγίδες που κοστίζουν.txt', data: trapsFile }] : []),
    { path: '05 Τι λείπει.txt', data: whatsMissing },
  ];

  downloadFile(new Blob([buildZip(files)], { type: 'application/zip' }),
    `Φάκελος λογιστή ${propName || 'ακίνητο'} ${year}.zip`);
}
