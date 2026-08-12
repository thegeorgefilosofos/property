'use client';
// ═══════════════════════════════════════════════════════════════════════════
// «Φάκελος για τον λογιστή» — δύο επίπεδα, το ίδιο υλικό.
//
//   exportAccountantBundle()  → ΕΝΑ .xlsx: κατάσταση αποτελεσμάτων, αναλυτικές
//                               κινήσεις, λογαριασμοί ΕΛΠ, και άλλα τρία φύλλα
//                               όπου υπάρχει υποχρέωση myDATA. Τα «νούμερα».
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
import {
  XLSX, FMT, S, ROW, setCell, autoWidths, wrapColumns, bannerRow, downloadWorkbook, printTitles,
  MARGINS, sheetFinish, workbookBytes, money, moneySigned, type Cell,
} from './xlsxStyle';
import { supplyLabel, reverseChargeVat, reverseCharge, VAT_STANDARD, type Supply } from '@/lib/tax/placeOfSupply';
import {
  myDataHint, myDataCell, pendingGroups, EXPENSE_CLASS_LABEL, INVOICE_TYPE_LABEL,
  CATEGORY_CODE, type VatDeduction, type ExpenseClass,
} from '@/lib/tax/myData';
import { AADE_DOC_TYPES, incomeDocTypes, expenseDocTypes } from '@/lib/tax/aadeDocTypes';
import {
  e3CodesFor, e3NoteFor, e3Triples, expenseClassSign,
  INCOME_CLASS_LABEL, EXPENSE_CLASS_LABEL_ALL, E3_LABEL,
} from '@/lib/tax/e3Combinations';
import { ELP_ALL, eglsOf, CAPITALISABLE, CAPITALISATION_NOTE } from '@/lib/tax/elpAccounts';
import { ACCOUNTS, expenseAccount } from '@/lib/accounting/journal';
import { CATEGORIES } from '@/lib/expenses/taxonomy';
import { resolveCategory } from '@/lib/expenses/taxonomy';
import { csvCell } from '@/lib/core/csv';
import { isValidAfm } from '@/lib/core/greek';
import { buildZip, type ZipFile } from '@/lib/accounting/zip';
import {
  WHO_LABEL, missingAfmGroups, filePapers,
  type Requirement, type FiledPaper, type DossierPaper,
} from '@/lib/accounting/dossier';
import { downloadFile } from '@/lib/core/download';

export interface AccountantStatementLine { label: string; amount: number; kind: string; negative?: boolean }
export interface AccountantMovement {
  date: string; type: 'income' | 'expense'; category: string; description: string; amount: number;
  /** Χώρα εκδότη (ISO alpha-2) και τόπος παροχής. Κενά στα έσοδα και σε ό,τι δεν ρωτήθηκε. */
  supplier_country?: string | null;
  supply?: string | null;
  /**
   * ΑΦΜ εκδότη, εννέα ψηφία. Ο λογιστής δεν καταχωρεί δαπάνη χωρίς
   * αντισυμβαλλόμενο: κενό εδώ σημαίνει ένα τηλεφώνημα στον ιδιοκτήτη.
   */
  supplier_afm?: string | null;
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
  supplier_country?: string | null; supply?: string | null; supplier_afm?: string | null;
}): AccountantMovement {
  return {
    date: e.date, type: e.type, category: e.category, description: e.description, amount: e.amount,
    supplier_country: e.supplier_country ?? null, supply: e.supply ?? null,
    supplier_afm: e.supplier_afm ?? null,
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
/** Το φύλλο αναφοράς, ονομασμένο ΜΙΑ φορά: το φύλλο και η παραπομπή σε αυτό. */
const COMBO_SHEET = 'Επιτρεπτοί συνδυασμοί ΑΑΔΕ';
/**
 * Οι κωδικοί Ε3 που δέχεται ένας συνδυασμός, ή η σημείωση της ΑΑΔΕ όπου δεν
 * δίνει κανέναν. Ποτέ κενό χωρίς εξήγηση: το κενό θα διαβαζόταν ως «δεν βρήκα».
 */
const e3Cell = (type: string, category: string): string => {
  const codes = e3CodesFor(type, category);
  return codes.length ? codes.join(', ') : e3NoteFor(type, category);
};
/**
 * Το ΑΦΜ του εκδότη, μόνο όταν είναι ΑΦΜ.
 *
 * ΕΛΕΓΧΕΤΑΙ ΞΑΝΑ ΕΔΩ, ΚΑΙ ΟΧΙ ΑΠΟ ΚΑΧΥΠΟΨΙΑ. Η στήλη γεμίζει και με το χέρι, και
 * από παλιές εγγραφές που γράφτηκαν πριν υπάρξει ο περιορισμός της βάσης. Ένα
 * οκταψήφιο σε στήλη ΑΦΜ δεν είναι «σχεδόν σωστό»: ταξιδεύει ώς τη διαβίβαση
 * και γυρίζει ως απόρριψη, μήνες μετά, χωρίς να ξέρει κανείς από πού ήρθε.
 * Τα έσοδα δεν έχουν προμηθευτή: εκεί το κελί μένει κενό, όπως και η χώρα.
 */
const afmCell = (e: AccountantMovement): string =>
  e.type === 'expense' && isValidAfm(e.supplier_afm) ? String(e.supplier_afm) : '';

/** Οι τιμές του αναπτυσσόμενου καταλόγου στον τόπο παροχής, από τη μία πηγή. */
const SUPPLY_VALUES: readonly string[] = (['domestic', 'intra_eu', 'third_country'] as const).map(supplyLabel);
// Ιταλική γκρι σημείωση για «memo» γραμμές (π.χ. πρόβλεψη φόρου) — διακριτή από το αποτέλεσμα.
const MEMO_TXT = { font: { name: 'Calibri', color: { rgb: '6B7280' }, sz: 10, italic: true }, alignment: { horizontal: 'left', vertical: 'center' } };
const MEMO_NUM = { font: { name: 'Calibri', color: { rgb: '6B7280' }, sz: 10, italic: true }, alignment: { horizontal: 'right', vertical: 'center' } };
// ΚΩΔΙΚΟΣ, ΟΧΙ ΠΟΣΟ. Το ΑΦΜ, η χώρα και ο αριθμός του παραστατικού είναι
// αναγνωριστικά που δεν αθροίζονται: κεντραρισμένα, ώστε η στήλη να μη
// διαβάζεται ως στήλη ποσών επειδή είναι στοιχισμένη δεξιά.
const CODE_TXT = { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } as const;

/**
 * Ο ΠΙΝΑΚΑΣ ΤΩΝ ΕΠΙΤΡΕΠΤΩΝ ΣΥΝΔΥΑΣΜΩΝ, ΥΠΟΛΟΓΙΣΜΕΝΟΣ ΜΙΑ ΦΟΡΑ.
 *
 * Είναι σταθερός: βγαίνει από το μητρώο της ΑΑΔΕ και δεν εξαρτάται από τα
 * δεδομένα του χρήστη. Ζει εδώ, έξω από τη `buildWorkbook`, γιατί ΔΥΟ φύλλα
 * τον χρειάζονται — το φύλλο των συνδυασμών για να τον γράψει, και το φύλλο
 * των χαρακτηρισμών για να δείξει τον αναπτυσσόμενο κατάλογό του σε στήλη που
 * γράφεται ΠΡΙΝ από αυτόν. Χωρίς αυτό, η διεύθυνση του καταλόγου («$B$63»)
 * θα ήταν γραμμένη με το χέρι σε δύο σημεία.
 */
const comboSheet = (() => {
  // Οι στήλες βγαίνουν ΑΠΟ ΤΟ ΜΗΤΡΩΟ, όχι από λίστα γραμμένη με το χέρι: αν
  // η ΑΑΔΕ προσθέσει κατηγορία, ο πίνακας την αποκτά μόνος του.
  const famCols = (fam: 'income' | 'expense', prefix: string) => {
    const set = new Set<string>();
    for (const t of Object.values(AADE_DOC_TYPES)) for (const c of t[fam]) if (c.startsWith(prefix)) set.add(c);
    return [...set].sort((a, b) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)));
  };
  const expCols = famCols('expense', 'category2_'), incCols = famCols('income', 'category1_');
  const shortOf = (code: string) => code.replace(/^category(\d)_/, '$1.');
  // ΜΙΑ ΙΔΙΑΙΤΕΡΟΤΗΤΑ ΤΗΣ ΠΗΓΗΣ, ΠΟΥ ΔΕΝ «ΔΙΟΡΘΩΝΕΤΑΙ» ΣΙΩΠΗΛΑ. Το φύλλο 17.6
  // γράφει κωδικούς ΕΞΟΔΩΝ στη στήλη των εσόδων. Ο πίνακας των εσόδων κρατά
  // μόνο κωδικούς `category1_`, οπότε ο τύπος απλώς δεν εμφανίζεται εκεί —
  // αντί να εμφανιστεί με στήλες που δεν του ανήκουν.
  const matrix = (fam: 'income' | 'expense', cols: string[], ids: string[]) => ids
    .filter(t => AADE_DOC_TYPES[t][fam].some(c => cols.includes(c)))
    .map(t => [t, AADE_DOC_TYPES[t].title, ...cols.map(c => (AADE_DOC_TYPES[t][fam].includes(c) ? '✓' : ''))]);
  const expRows = matrix('expense', expCols, expenseDocTypes());
  const incRows = matrix('income', incCols, incomeDocTypes());
  // Τα ελληνικά ονόματα υπάρχουν για όσους χαρακτηρισμούς εξόδων παράγει η
  // εφαρμογή. Των υπολοίπων δεν γράφονται: ο πίνακας της ΑΑΔΕ δίνει κωδικούς,
  // και ένα όνομα από τη μνήμη μας θα ήταν εικασία σε έγγραφο λογιστή.
  // Η στήλη Β γράφει τον χαρακτηρισμό ΑΚΡΙΒΩΣ όπως τον γράφει το φύλλο των
  // κινήσεων, γιατί είναι η ΠΗΓΗ του αναπτυσσόμενου καταλόγου εκεί: μια
  // διαφορετική μορφή («2.5» εδώ, «2.5 Γενικά Έξοδα…» εκεί) θα έκανε το Excel
  // να θεωρεί άκυρη κάθε τιμή που έχει ήδη γράψει η εφαρμογή.
  // ΟΛΟΙ οι χαρακτηρισμοί που έχει ο πίνακας, όχι μόνο οι εννέα που παράγει η
  // εφαρμογή: ο πίνακας από πάνω έχει δεκαπέντε στήλες, και έξι από αυτές θα
  // έμεναν σκέτοι αριθμοί. Το πρόσημο λέει ποιος δέχεται πιστωτικό.
  const namedRows = expCols.map(c => [c, `${shortOf(c)} ${EXPENSE_CLASS_LABEL_ALL[c] ?? ''}`.trim(), expenseClassSign(c)]);
  // ΚΑΙ Η ΠΛΕΥΡΑ ΤΩΝ ΕΣΟΔΩΝ ΑΠΟΚΤΑ ΟΝΟΜΑΤΑ. Ήταν σκέτοι αριθμοί («1.7»), γιατί
  // ο πίνακας συνδυασμών δίνει μόνο κωδικούς· τα λεκτικά έρχονται από τον πίνακα
  // «Κωδικός Κατηγορίας Χαρακτηρισμού Εσόδων» της τεκμηρίωσης myDATA.
  const incomeNamedRows = incCols.map(c => [c, `${shortOf(c)} ${INCOME_CLASS_LABEL[c] ?? ''}`.trim()]);
  const HR = 4;
  const incSec = HR + 1 + expRows.length + 1, incHead = incSec + 1;
  const namSec = incHead + 1 + incRows.length + 1, namHead = namSec + 1;
  // Η διεύθυνση του καταλόγου, σε μορφή που καταλαβαίνει το Excel (1-based, με
  // το όνομα του φύλλου σε εισαγωγικά γιατί έχει κενά).
  const classList = `'${COMBO_SHEET}'!$B$${namHead + 2}:$B$${namHead + 1 + namedRows.length}`;
  // Η ΔΙΠΛΑΝΗ ΣΤΗΛΗ ΤΟΥ ΙΔΙΟΥ ΚΑΤΑΛΟΓΟΥ: ο μηχανικός κωδικός. Χρειάζεται ώστε ο
  // «Κωδικός» της κίνησης να ΑΚΟΛΟΥΘΕΙ τον χαρακτηρισμό όταν ο λογιστής τον
  // αλλάξει από τον αναπτυσσόμενο κατάλογο, αντί να μείνει ο παλιός.
  const codeList = `'${COMBO_SHEET}'!$A$${namHead + 2}:$A$${namHead + 1 + namedRows.length}`;
  const incNamSec = namHead + 1 + namedRows.length + 1, incNamHead = incNamSec + 1;
  return { expCols, incCols, shortOf, expRows, incRows, namedRows, incomeNamedRows, incSec, incHead, namSec, namHead,
    incNamSec, incNamHead, classList, codeList, NC: 2 + Math.max(expCols.length, incCols.length), HR };
})();

/**
 * Το βιβλίο εργασίας — κοινό για το σκέτο Excel και για τον φάκελο.
 *
 * ΕΞΑΓΕΤΑΙ ΓΙΑ ΝΑ ΔΟΚΙΜΑΖΕΤΑΙ. Το αρχείο που φεύγει στον λογιστή δεν μπορεί να
 * επαληθεύεται με το μάτι: μια στήλη που μετακινήθηκε κατά ένα δίνει σύνολο
 * κάτω από λάθος επικεφαλίδα, και το Excel ανοίγει κανονικά.
 */
/**
 * Το βιβλίο του έτους ως βιβλίο εργασίας.
 *
 * ΤΑ ΧΑΡΤΙΑ ΕΡΧΟΝΤΑΙ ΩΣ ΔΕΥΤΕΡΟ ΟΡΙΣΜΑ, ΚΑΙ ΜΟΝΟ ΑΠΟ ΤΟΝ ΦΑΚΕΛΟ. Το κουμπί
 * «Excel» κατεβάζει ένα αρχείο που ταξιδεύει μόνο του: μια στήλη «Παραστατικό»
 * εκεί θα έδειχνε αριθμούς αρχείων που ο παραλήπτης δεν έχει. Μέσα στον φάκελο
 * τα αρχεία ΕΙΝΑΙ δίπλα, οπότε η στήλη δείχνει σε κάτι υπαρκτό.
 */
export function buildWorkbook(inp: AccountantBundleInput, papers: readonly FiledPaper[] = []) {
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
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.title }; ws['!rows'][1] = { hpt: ROW.sub }; ws['!rows'][HR] = { hpt: ROW.head };
    bannerRow(ws, 0, NC, S.title);
    bannerRow(ws, 1, NC, S.sub);
    bannerRow(ws, 3, NC, S.section);
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
    ws['!cols'] = autoWidths(ws, { headRow: HR }).cols;
    ws['!margins'] = { ...MARGINS };
    XLSX.utils.book_append_sheet(wb, ws, 'Κατάσταση αποτελεσμάτων');
  }

  // ── Φύλλο 2: Αναλυτικές κινήσεις (Έσοδα / Έξοδα) ────────────────────────────
  {
    // ΟΙ ΘΕΣΕΙΣ ΤΩΝ ΣΤΗΛΩΝ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΗΝ ΙΔΙΑ ΤΗΝ ΕΠΙΚΕΦΑΛΙΔΑ.
    //
    // Ήταν γραμμένες ως αριθμοί και ως αποστάσεις: `NC = myData ? 10 : 9`,
    // `C_MYDATA = 7`, `C_IN = NC - 2`. Κάθε νέα στήλη σήμαινε τέσσερις σωστές
    // αλλαγές σε τέσσερα σημεία, και μία ξεχασμένη έβαζε το σύνολο των εξόδων
    // κάτω από την επικεφαλίδα της χώρας — χωρίς σφάλμα και χωρίς ένδειξη.
    // Ο πίνακας των ονομάτων είναι ήδη η αλήθεια· τα υπόλοιπα τη ρωτούν.
    //
    // Η ΣΕΙΡΑ ΕΙΝΑΙ Η ΣΕΙΡΑ ΠΟΥ ΔΙΑΒΑΖΕΙ ΛΟΓΙΣΤΗΣ: τι, με ποιο χαρτί, από ποιον,
    // από πού, πώς χαρακτηρίζεται, πόσο. Τα ποσά κλείνουν πάντα τη γραμμή.
    const myData = inp.myData;
    // ΠΟΙΑ ΓΡΑΜΜΗ ΕΧΕΙ ΧΑΡΤΙ, ΚΑΙ ΠΟΙΟ. Ο αριθμός εδώ είναι ο ίδιος αριθμός που
    // έχει μπροστά του το αρχείο μέσα στον φάκελο: ο λογιστής διαβάζει «07» και
    // ξέρει ποιο αρχείο να ανοίξει, χωρίς να ψάξει σε ευρετήριο. Δύο χαρτιά για
    // την ίδια κίνηση (τιμολόγιο και απόδειξη) γράφονται και τα δύο.
    const byRow = new Map<number, string>();
    for (const p of papers) {
      if (p.row == null) continue;
      const cur = byRow.get(p.row);
      byRow.set(p.row, cur ? `${cur} · ${p.label}` : p.label);
    }
    const hasPapers = byRow.size > 0;
    const header = ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή',
      ...(hasPapers ? ['Παραστατικό'] : []),
      'ΑΦΜ προμηθευτή', 'Χώρα', 'Τόπος παροχής',
      ...(myData ? ['Χαρακτηρισμός myDATA'] : []), 'Έσοδα', 'Έξοδα'];
    const NC = header.length, HR = 3;
    /** Η θέση μιας στήλης από το όνομά της, ή −1 όταν δεν υπάρχει φέτος. */
    const col = (name: string) => header.indexOf(name);
    const C_PAPER = col('Παραστατικό'), C_AFM = col('ΑΦΜ προμηθευτή');
    const C_COUNTRY = col('Χώρα'), C_SUPPLY = col('Τόπος παροχής');
    const C_MYDATA = col('Χαρακτηρισμός myDATA');
    const C_IN = col('Έσοδα'), C_EX = col('Έξοδα');
    // Η ΕΤΙΚΕΤΑ ΤΩΝ ΣΥΝΟΛΩΝ ΕΙΝΑΙ ΘΕΣΗ, ΟΧΙ ΑΠΟΣΤΑΣΗ. Παραγόταν από το πλήθος
    // των στηλών και προσγειώθηκε κάτω από τον «Τόπο παροχής»: ένα «ΣΥΝΟΛΑ»
    // κάτω από στήλη που λέει «Ενδοκοινοτική λήψη υπηρεσιών» διαβάζεται ως
    // σύνολο ΕΚΕΙΝΗΣ της στήλης. Η θέση της είναι η Περιγραφή, εκεί που ήταν
    // πάντα και εκεί που τη διαβάζει λογιστής.
    const C_LABEL = col('Περιγραφή');
    /** Γραμμή συνόλων: ετικέτα στην Περιγραφή, ποσά κάτω από τα ποσά. */
    const totalsRow = (label: string, income: number | string, expense: number | string) => {
      const r: (string | number)[] = Array(NC).fill('');
      r[C_LABEL] = label; r[C_IN] = income; r[C_EX] = expense;
      return r;
    };
    const sorted = [...book].sort((a, b) => a.date.localeCompare(b.date));
    const sumIn = sorted.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
    const sumEx = sorted.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
    // Ο ΧΑΡΑΚΤΗΡΙΣΜΟΣ ΑΦΟΡΑ ΜΟΝΟ ΤΑ ΕΞΟΔΑ. Στη γραμμή εσόδου το κελί μένει
    // κενό: τα έσοδα έχουν δικό τους παραστατικό, που το εκδίδει ο ίδιος ο
    // ιδιοκτήτης, και δεν «χαρακτηρίζονται» ως έξοδα με κανέναν κωδικό.
    const myDataOf = (e: AccountantMovement): string =>
      !myData || e.type !== 'expense' ? ''
        : myDataCell(myDataHint({ category: e.category, supply: e.supply as Supply | null, vat: myData.vat }));
    const dataRows: Cell['v'][][] = sorted.map((e, i) => [
      i + 1, toDate(e.date), e.category || '', e.description || '',
      ...(hasPapers ? [byRow.get(i + 1) || ''] : []),
      // Κενό, όχι «—» και όχι «Ελλάδα»: το έσοδο δεν έχει πάροχο, και η δαπάνη
      // που δεν ρωτήθηκε δεν έχει απάντηση. Ένα συμπληρωμένο κενό σε στήλη
      // ΦΠΑ είναι εικασία γραμμένη ως δεδομένο.
      afmCell(e),
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
    // Το όριο είναι 56 και όχι το προεπιλεγμένο: ο μακρύτερος χαρακτηρισμός
    // («14.3 · 2.5 Γενικά Έξοδα χωρίς δικαίωμα έκπτωσης Φ.Π.Α.») πιάνει 54, και
    // μια αναδίπλωση θα έκανε κάθε ξένη δαπάνη διγράμμη χωρίς λόγο.
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.title }; ws['!rows'][1] = { hpt: ROW.sub }; ws['!rows'][HR] = { hpt: ROW.head };
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    const emptyNote = sorted.length ? 0 : 1;
    const lastData = HR + sorted.length + emptyNote;
    const totalR = lastData + 1, netR = lastData + 2;
    bannerRow(ws, 0, NC, S.title);
    bannerRow(ws, 1, NC, S.sub);
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    for (let r = HR + 1; r <= lastData; r++) {
      ws['!rows'][r] = { hpt: ROW.data };
      setCell(ws, r, 0, { s: S.num });                                       // Α/Α
      const dcell = ws[enc(r, 1)] as Cell | undefined;                       // Ημ/νία — t:'d' μόνο αν όντως Date
      const isDate = !!dcell && dcell.v instanceof Date;
      setCell(ws, r, 1, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } }, ...(isDate ? { t: 'd', z: FMT.date } : {}) });
      setCell(ws, r, 2, { s: S.txt });                                       // Κατηγορία
      setCell(ws, r, C_LABEL, { s: S.txt });                                 // Περιγραφή
      // Ο αριθμός του παραστατικού είναι κωδικός, όπως το ΑΦΜ: κεντραρισμένος.
      if (C_PAPER >= 0) setCell(ws, r, C_PAPER, { s: CODE_TXT });
      // Το ΑΦΜ είναι αριθμός που ΔΕΝ αθροίζεται: κεντραρισμένο σαν κωδικός, όχι
      // δεξιά σαν ποσό. Και ως κείμενο, ώστε να μη χαθεί αρχικό μηδενικό.
      setCell(ws, r, C_AFM, { s: CODE_TXT });
      setCell(ws, r, C_COUNTRY, { s: CODE_TXT });
      setCell(ws, r, C_SUPPLY, { s: S.txt });
      if (C_MYDATA >= 0) setCell(ws, r, C_MYDATA, { s: S.txt });             // Χαρακτηρισμός myDATA
      // Έσοδα/Έξοδα ως κείμενο «€» με κόμμα (ίδια εμφάνιση σε κάθε Excel).
      for (const c of [C_IN, C_EX]) { const cell = ws[enc(r, c)] as Cell | undefined; if (cell && typeof cell.v === 'number') setCell(ws, r, c, { v: money(cell.v), t: 's', s: S.num }); else setCell(ws, r, c, { s: S.num }); }
    }
    // ΣΥΝΟΛΑ ΚΑΙ ΚΑΘΑΡΟ, ΜΕ ΤΗ ΓΡΑΜΜΗ ΝΑ ΤΡΕΧΕΙ ΠΕΡΑ ΠΕΡΑ. Στυλίζονταν μόνο οι
    // στήλες που είχαν κείμενο ή ποσό, οπότε η μεσαία γραμμή του συνόλου έσπαγε
    // πάνω από τη «Χώρα» και τον «Τόπο παροχής» και ξανάρχιζε στα ποσά: ένα
    // σύνολο με τρύπες δεν διαβάζεται ως σύνολο.
    // Η ΕΝΤΟΝΗ ΓΡΑΜΜΗ ΣΗΜΑΙΝΕΙ ΠΑΝΤΟΥ ΤΟ ΙΔΙΟ: ΤΕΛΙΚΟ ΑΠΟΤΕΛΕΣΜΑ. Τα σύνολα
    // εσόδων και εξόδων είναι υποσύνολα και κλείνουν τη λίστα· το καθαρό είναι
    // το αποτέλεσμα. Ήταν αντίστροφα εδώ και σωστά στην κατάσταση
    // αποτελεσμάτων: το ίδιο πάχος γραμμής έλεγε άλλο πράγμα σε κάθε φύλλο.
    for (let c = 0; c < NC; c++) setCell(ws, totalR, c, { s: c === C_IN || c === C_EX ? S.strongNum : S.strongTxt });
    setCell(ws, totalR, C_IN, { v: money(sumIn), t: 's' });
    setCell(ws, totalR, C_EX, { v: money(sumEx), t: 's' });
    // ΤΟ ΚΑΘΑΡΟ ΔΕΝ ΕΙΝΑΙ ΕΣΟΔΟ. Καθόταν κάτω από την επικεφαλίδα «Έσοδα» και
    // διαβαζόταν ως έσοδο· απλώνεται στις δύο στήλες των ποσών, γιατί είναι η
    // διαφορά τους και δεν ανήκει σε καμία.
    for (let c = 0; c < NC; c++) setCell(ws, netR, c, { s: c === C_IN || c === C_EX ? S.totNum : S.totTxt });
    setCell(ws, netR, C_IN, { v: moneySigned(Math.round((sumIn - sumEx) * 100) / 100), t: 's' });
    (ws['!merges'] ||= []).push({ s: { r: netR, c: C_IN }, e: { r: netR, c: C_EX } });
    {
      const { cols, wrap } = autoWidths(ws, { headRow: HR, max: 56 });
      ws['!cols'] = cols; wrapColumns(ws, wrap, HR + 1, netR);
    }
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };
    ws['!margins'] = { ...MARGINS };
    // ΟΡΙΖΟΝΤΙΑ ΣΕΛΙΔΑ ΚΑΙ ΚΑΤΑΛΟΓΟΣ ΣΤΟΝ ΤΟΠΟ ΠΑΡΟΧΗΣ. Εννέα στήλες σε όρθια
    // σελίδα κόβονται στη μέση. Και ο τόπος παροχής είναι το πεδίο που ο
    // λογιστής διορθώνει συχνότερα: με κατάλογο, η διόρθωση δεν μπορεί να
    // γραφτεί με λέξεις που δεν καταλαβαίνει μετά κανείς.
    // Ο κατάλογος μπαίνει ΜΟΝΟ όπου υπάρχουν κινήσεις: σε άδεια χρονιά θα έπεφτε
    // πάνω στη γραμμή που λέει «Καμία καταγεγραμμένη κίνηση» και θα της πρότεινε
    // τόπο παροχής.
    // Η στήλη του καταλόγου γράφεται από τη θέση της και όχι ως «F»: μια στήλη
    // παραπάνω και το «F» θα πρότεινε τόπο παροχής μέσα στη στήλη της χώρας.
    const supplyCol = XLSX.utils.encode_col(C_SUPPLY);
    sheetFinish(ws, {
      landscape: true, freezeRows: HR + 1,
      ...(sorted.length ? { lists: [{ ref: `${supplyCol}${HR + 2}:${supplyCol}${lastData + 1}`, values: SUPPLY_VALUES }] } : {}),
    });
    // Ο ΛΟΓΙΣΤΗΣ ΤΥΠΩΝΕΙ, ΚΑΙ Η ΔΕΥΤΕΡΗ ΣΕΛΙΔΑ ΧΡΕΙΑΖΕΤΑΙ ΟΝΟΜΑΤΑ. Χωρίς
    // επανάληψη της επικεφαλίδας, από τη σελίδα 2 και μετά ο πίνακας είναι
    // στήλες αριθμών χωρίς τίτλο — και το «Έσοδα / Έξοδα» δεν μαντεύεται.
    // Μπαίνει στις «Κινήσεις» μόνο: είναι το φύλλο που απλώνεται σε σελίδες.
    const sheetTitle = `Κινήσεις ${year}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    printTitles(wb, wb.SheetNames.length - 1, sheetTitle, HR + 1);
  }

  // ══ ΦΥΛΛΟ 3: ΤΟ ΣΧΕΔΙΟ ΛΟΓΑΡΙΑΣΜΩΝ, ΜΕ ΤΑ ΠΟΣΑ ΤΗΣ ΧΡΟΝΙΑΣ ΠΑΝΩ ΤΟΥ ══════
  // ΤΙ ΑΠΑΝΤΑ ΠΟΥ ΔΕΝ ΑΠΑΝΤΟΥΣΕ ΤΙΠΟΤΑ. Ο λογιστής που παίρνει τις «Κινήσεις»
  // βλέπει κατηγορίες της εφαρμογής («Υδραυλικός», «Κοινόχρηστα»), όχι
  // λογαριασμούς. Η μετάφραση γινόταν στο κεφάλι του, μία φορά ανά γραμμή. Εδώ
  // είναι γραμμένη: κάθε λογαριασμός του νόμου, ποιες κατηγορίες κάθονται πάνω
  // του, και πόσα. ΔΕΝ είναι ισοζύγιο: το βιβλίο αυτού του αρχείου έχει έσοδα
  // και έξοδα, όχι τα σκέλη του ταμείου· και μια δόση δανείου καταχωρημένη ως
  // δαπάνη θα φανεί εδώ ολόκληρη στους τόκους, γιατί έτσι ακριβώς την έγραψε ο
  // χρήστης. Είναι ο χάρτης από τη γλώσσα του ιδιοκτήτη σε αυτή του Ε3.
  //
  // ΚΑΙ Η ΓΕΦΥΡΑ ΜΕ ΤΟ ΕΓΛΣ, ΓΙΑΤΙ ΠΟΛΛΑ ΛΟΓΙΣΤΗΡΙΑ ΤΟ ΚΡΑΤΟΥΝ. Αντιγραμμένη
  // από το Παράρτημα Ε του ν. 4308/2014, με όλους τους κωδικούς που δίνει ο
  // νόμος: η αντιστοιχία ΕΙΝΑΙ ένα προς πολλά, και μια «επιλογή του ενός» θα
  // ήταν δική μας απόφαση περασμένη για διάταξη νόμου.
  {
    const NC = 6, HR = 4;
    const sorted = [...book].sort((a, b) => a.date.localeCompare(b.date));
    // Τι κάθεται σε κάθε λογαριασμό: τα ονόματα των κατηγοριών όπως τα βλέπει ο
    // χρήστης, ώστε να αναγνωρίζει τη δαπάνη του, και τα δικά μας σύνολα.
    const per = new Map<string, { cats: Set<string>; n: number; v: number }>();
    const put = (code: string, cat: string, amount: number) => {
      const cur = per.get(code) ?? { cats: new Set<string>(), n: 0, v: 0 };
      if (cat) cur.cats.add(cat);
      cur.n += 1; cur.v += amount;
      per.set(code, cur);
    };
    for (const e of sorted) {
      if (e.type === 'income') put(ACCOUNTS.rentIncome.code, e.category || '', e.amount || 0);
      else put(expenseAccount(resolveCategory(e.category) || e.category).code, e.category || '', e.amount || 0);
    }
    // Οι κατηγορίες που ίσως κεφαλαιοποιηθούν, με τα ονόματα που βλέπει ο
    // χρήστης — και μόνο όσες εμφανίστηκαν όντως φέτος.
    const capitalised = CAPITALISABLE
      .map(slug => CATEGORIES.find(c => c.slug === slug)?.label || slug)
      .filter(label => sorted.some(e => e.category === label));

    const aoa: (string | number)[][] = [
      [`ΛΟΓΑΡΙΑΣΜΟΙ ΕΛΠ ${year}`],
      [idLine],
      [],
      ['ΤΟ ΣΧΕΔΙΟ ΛΟΓΑΡΙΑΣΜΩΝ ΤΟΥ ν. 4308/2014, ΚΑΙ ΟΙ ΚΙΝΗΣΕΙΣ ΤΗΣ ΧΡΟΝΙΑΣ'],
      ['Κωδικός', 'Ονομασία κατά τον νόμο', 'Αντιστοιχία ΕΓΛΣ', 'Κατηγορίες της χρονιάς', 'Κινήσεις', 'Ποσό'],
      ...ELP_ALL.map(a => {
        const u = per.get(a.code);
        return [a.code, a.name, eglsOf(a.code), u ? [...u.cats].join(', ') : '', u ? u.n : '', u ? money(u.v) : ''];
      }),
      [],
      ...(capitalised.length ? [[`${capitalised.join(', ')}: ${CAPITALISATION_NOTE}`]] : []),
      ['Ταμειακή βάση: τα ποσά είναι εισπράξεις και πληρωμές της χρονιάς. Πηγή ονομασιών και αντιστοιχίας: ν. 4308/2014, Παραρτήματα Γ και Ε.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Η αντιστοιχία ΕΓΛΣ του 71.04 είναι δεκαέξι κωδικοί, 110 χαρακτήρες: δεν
    // γίνεται στήλη, γίνεται αναδίπλωση — και το ύψος το βρίσκει το Excel.

    // Οι γραμμές σημειώσεων: η κεφαλαιοποίηση μόνο όταν υπάρχει τέτοια δαπάνη,
    // και από κάτω πάντα η πηγή. Απλωμένες σε όλο το πλάτος για να διαβάζονται.
    const noteR = HR + 1 + ELP_ALL.length + 1;
    const notes = capitalised.length ? [noteR, noteR + 1] : [noteR];
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.title }; ws['!rows'][1] = { hpt: ROW.sub }; ws['!rows'][HR] = { hpt: ROW.head };
    bannerRow(ws, 0, NC, S.title);
    bannerRow(ws, 1, NC, S.sub);
    bannerRow(ws, HR - 1, NC, S.section);
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    for (let i = 0; i < ELP_ALL.length; i++) {
      const r = HR + 1 + i;
      for (const c of [0, 1, 2, 3]) setCell(ws, r, c, { s: S.txt });
      for (const c of [4, 5]) setCell(ws, r, c, { s: S.num });
    }
    for (const r of notes) bannerRow(ws, r, NC, S.sub);
    {
      const { cols, wrap } = autoWidths(ws, { headRow: HR });
      ws['!cols'] = cols; wrapColumns(ws, wrap, HR + 1, HR + ELP_ALL.length);
    }
    ws['!margins'] = { ...MARGINS };
    sheetFinish(ws, { landscape: true, freezeRows: HR + 1 });
    XLSX.utils.book_append_sheet(wb, ws, 'Λογαριασμοί ΕΛΠ');
  }


  // ══ ΦΥΛΛΟ 3: ΧΑΡΑΚΤΗΡΙΣΜΟΙ myDATA ════════════════════════════════════════
  // ΓΙΑΤΙ ΔΙΚΟ ΤΟΥ ΦΥΛΛΟ. Στις «Κινήσεις» ο χαρακτηρισμός είναι ΜΙΑ στήλη δίπλα
  // σε έσοδα και έξοδα, γιατί εκεί το ερώτημα είναι «τι κινήθηκε». Εδώ το
  // ερώτημα είναι άλλο: «τι θα δηλωθεί, με ποιον κωδικό, και πόσος φόρος
  // αποδίδεται από τον λήπτη». Είναι η δουλειά που κάνει ο λογιστής γραμμή
  // γραμμή, οπότε παίρνει τη μορφή που τη διευκολύνει: μηχανικοί κωδικοί δίπλα
  // στα λεκτικά, και σύνολα ανά χαρακτηρισμό. Ο επίσημος πίνακας των επιτρεπτών
  // συνδυασμών, που δεν αφορά το έτος αλλά το πλαίσιο, έχει δικό του φύλλο —
  // όπως και οι λογαριασμοί των ΕΛΠ, που αφορούν κάθε δαπάνη και όχι μόνο όσες
  // χαρακτηρίζονται.
  if (inp.myData) {
    const vat = inp.myData.vat;
    // ΔΕΚΑΤΡΕΙΣ ΣΤΗΛΕΣ: Ο ΧΑΡΑΚΤΗΡΙΣΜΟΣ ΔΕΝ ΑΡΚΕΙ. Μια διαβίβαση θέλει ΚΑΙ τον
    // κωδικό του εντύπου Ε3 στον οποίο προσγειώνεται το ποσό, και η ΑΑΔΕ
    // απορρίπτει τον συνδυασμό που δεν υπάρχει στον επίσημο πίνακα. Η στήλη
    // δίνει ΟΛΟΥΣ τους επιτρεπτούς για τη γραμμή, γιατί η επιλογή εξαρτάται από
    // τη φύση της δαπάνης και είναι δουλειά λογιστή.
    const NC = 14, HR = 3;
    const head = ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', 'ΑΦΜ προμηθευτή', 'Χώρα', 'Τόπος παροχής',
      'Τύπος παραστατικού', 'Κωδικός', 'Χαρακτηρισμός', 'Επιτρεπτοί κωδικοί Ε3', 'Αξία παραστατικού',
      `ΦΠΑ αντίστροφης χρέωσης ${VAT_STANDARD}%`, 'Εκκρεμότητα'];
    const rows = book.filter(e => e.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));
    const hints = rows.map(e => ({ e, h: myDataHint({ category: e.category, supply: e.supply as Supply | null, vat }) }));
    // Ο ΦΟΡΟΣ ΜΠΑΙΝΕΙ ΜΟΝΟ ΟΠΟΥ ΟΦΕΙΛΕΤΑΙ. Στην εγχώρια δαπάνη τον έχει ήδη
    // χρεώσει ο πάροχος μέσα στο ποσό: μια στήλη με 24% παντού θα ζητούσε από
    // τον λογιστή να αποδώσει φόρο δεύτερη φορά.
    const rcOf = (e: AccountantMovement) => {
      const sup = e.supply as Supply | null;
      return sup && reverseCharge(sup) ? reverseChargeVat(e.amount || 0, sup).vat : 0;
    };
    const sumVal = rows.reduce((t, e) => t + (e.amount || 0), 0);
    const sumRc = rows.reduce((t, e) => t + rcOf(e), 0);
    const totals = (label: string) => {
      const r: (string | number)[] = Array(NC).fill('');
      r[3] = label; r[11] = money(sumVal); r[12] = money(sumRc);
      return r;
    };
    // Σύνολα ανά χαρακτηρισμό: η γραμμή που ζητά ο λογιστής όταν συμφωνεί τα
    // βιβλία με τη δήλωση. Οι ακατάτακτες μετριούνται χωριστά και ονομαστικά.
    const byClass = new Map<string, { n: number; v: number }>();
    for (const { e, h } of hints) {
      const key = h.expenseClass ?? '';
      const prev = byClass.get(key) ?? { n: 0, v: 0 };
      byClass.set(key, { n: prev.n + 1, v: prev.v + (e.amount || 0) });
    }
    const classRows = [...byClass.entries()]
      .sort((a, b) => (a[0] || 'ω').localeCompare(b[0] || 'ω'))
      .map(([k, v]) => [
        k ? CATEGORY_CODE[k as ExpenseClass] : '', k ? `${k} ${EXPENSE_CLASS_LABEL[k as ExpenseClass]}` : 'Χωρίς χαρακτηρισμό',
        v.n, money(v.v),
      ]);
    const aoa: (string | number | Date)[][] = [
      [`ΧΑΡΑΚΤΗΡΙΣΜΟΙ myDATA ${year}`],
      [idLine],
      [],
      head,
      ...(rows.length ? [] : [[...Array(3).fill(''), `Καμία καταγεγραμμένη δαπάνη για το ${year}`]]),
      ...hints.map(({ e, h }, i) => [
        i + 1, toDate(e.date), e.category || '', e.description || '',
        afmCell(e), e.supplier_country || '', supplyCell(e.supply),
        h.invoiceType ? `${h.invoiceType} ${INVOICE_TYPE_LABEL[h.invoiceType]}` : '',
        h.expenseClass ? CATEGORY_CODE[h.expenseClass] : '',
        h.expenseClass ? `${h.expenseClass} ${EXPENSE_CLASS_LABEL[h.expenseClass]}` : '',
        h.invoiceType && h.expenseClass ? e3Cell(h.invoiceType, CATEGORY_CODE[h.expenseClass]) : '',
        e.amount, rcOf(e) || '', h.pending,
      ]),
      totals('ΣΥΝΟΛΑ'),
      [],
      ['ΣΥΝΟΛΑ ΑΝΑ ΧΑΡΑΚΤΗΡΙΣΜΟ'],
      ['Κωδικός', 'Χαρακτηρισμός', 'Πλήθος', 'Αξία'],
      ...classRows,
      [],
      [`Υπόδειξη προς τον λογιστή, όχι διαβίβαση: τίποτα δεν αποστέλλεται στην ΑΑΔΕ από την εφαρμογή. Ποιοι χαρακτηρισμοί επιτρέπονται σε κάθε τύπο παραστατικού, στο φύλλο «${COMBO_SHEET}».`],
      ['Οι κωδικοί Ε3 δίνονται όπου υπάρχει τύπος παραστατικού, δηλαδή στις λήψεις από το εξωτερικό που διαβιβάζει ο ίδιος ο λήπτης. Στην εγχώρια δαπάνη τον τύπο τον δηλώνει ο προμηθευτής, και ο κωδικός Ε3 εξαρτάται από εκείνον.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    // Τα πλάτη μετρώνται σε ΟΛΟΝ τον πίνακα, μαζί με τα «ΣΥΝΟΛΑ ΑΝΑ
    // ΧΑΡΑΚΤΗΡΙΣΜΟ» από κάτω: δανείζονταν τα πλάτη του μεγάλου πίνακα και
    // έβγαιναν κομμένα, γιατί οι στήλες του ενός δεν είναι οι στήλες του άλλου.
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.title }; ws['!rows'][1] = { hpt: ROW.sub }; ws['!rows'][HR] = { hpt: ROW.head };
    bannerRow(ws, 0, NC, S.title);
    bannerRow(ws, 1, NC, S.sub);
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    const emptyNote = rows.length ? 0 : 1;
    const last = HR + rows.length + emptyNote;
    const encM = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
    for (let r = HR + 1; r <= last; r++) {
      ws['!rows'][r] = { hpt: ROW.data };
      setCell(ws, r, 0, { s: S.num });
      const dcell = ws[encM(r, 1)] as Cell | undefined;
      const isDate = !!dcell && dcell.v instanceof Date;
      setCell(ws, r, 1, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } }, ...(isDate ? { t: 'd', z: FMT.date } : {}) });
      for (const c of [2, 3, 6, 7, 8, 9, 10, 13]) setCell(ws, r, c, { s: S.txt });
      // Ο ΚΩΔΙΚΟΣ ΔΕΝ ΕΙΝΑΙ ΔΕΥΤΕΡΗ ΚΑΤΑΧΩΡΗΣΗ, ΕΙΝΑΙ ΜΕΤΑΦΡΑΣΗ. Γραμμένος ως
      // σταθερή τιμή, έμενε ο παλιός μόλις ο λογιστής άλλαζε τον χαρακτηρισμό
      // από τον κατάλογο, και το αρχείο έλεγε δύο διαφορετικά πράγματα στην
      // ίδια γραμμή. Ως τύπος, ακολουθεί. Η αποθηκευμένη τιμή μένει για όποιον
      // ανοίξει το αρχείο χωρίς επανυπολογισμό.
      if (String((ws[encM(r, 9)] as Cell | undefined)?.v ?? '')) {
        setCell(ws, r, 8, { f: `IFERROR(INDEX(${comboSheet.codeList},MATCH(${encM(r, 9)},${comboSheet.classList},0)),"")` });
      }
      // ΑΦΜ και χώρα: κωδικοί, κεντραρισμένοι, όχι ποσά.
      for (const c of [4, 5]) setCell(ws, r, c, { s: { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } } });
      for (const c of [11, 12]) {
        const cell = ws[encM(r, c)] as Cell | undefined;
        if (cell && typeof cell.v === 'number') setCell(ws, r, c, { v: money(cell.v), t: 's', s: S.num });
        else setCell(ws, r, c, { s: S.num });
      }
    }
    const totR = last + 1;
    for (let c = 0; c <= 10; c++) setCell(ws, totR, c, { s: S.strongTxt });
    for (const c of [11, 12, 13]) setCell(ws, totR, c, { s: c === 13 ? S.strongTxt : S.strongNum });
    // Οι πίνακες του έτους: επικεφαλίδα ενότητας, γραμμή στηλών, δεδομένα.
    const secA = totR + 2, headA = secA + 1;
    bannerRow(ws, secA, NC, S.section);
    for (let c = 0; c < 4; c++) setCell(ws, headA, c, { s: S.head });
    for (let i = 0; i < classRows.length; i++) {
      const r = headA + 1 + i;
      setCell(ws, r, 0, { s: S.txt }); setCell(ws, r, 1, { s: S.txt });
      setCell(ws, r, 2, { s: S.num }); setCell(ws, r, 3, { s: S.num });
    }
    for (const r of [headA + 1 + classRows.length + 1, headA + 2 + classRows.length + 1]) bannerRow(ws, r, NC, S.sub);
    {
      const { cols, wrap } = autoWidths(ws, { headRow: HR });
      ws['!cols'] = cols; wrapColumns(ws, wrap, HR + 1);
    }
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: last, c: NC - 1 } }) };
    ws['!margins'] = { ...MARGINS };
    // ΟΙ ΔΥΟ ΣΤΗΛΕΣ ΠΟΥ ΑΛΛΑΖΕΙ Ο ΛΟΓΙΣΤΗΣ, ΜΕ ΚΑΤΑΛΟΓΟ. Ο χαρακτηρισμός είναι
    // υπόδειξη: όποιος τη διορθώνει πρέπει να διαλέγει από τους εννέα του
    // myDATA και όχι να γράφει «2,5» ή «γενικά έξοδα». Ο κατάλογος δείχνει στη
    // στήλη του φύλλου των συνδυασμών, γιατί τα λεκτικά ξεπερνούν κατά πολύ
    // τους 255 χαρακτήρες που δέχεται μια λίστα γραμμένη μέσα στο κελί.
    sheetFinish(ws, {
      landscape: true, freezeRows: HR + 1,
      ...(rows.length ? { lists: [
        { ref: `G${HR + 2}:G${last + 1}`, values: SUPPLY_VALUES },
        { ref: `J${HR + 2}:J${last + 1}`, source: comboSheet.classList },
      ] } : {}),
    });
    XLSX.utils.book_append_sheet(wb, ws, `Χαρακτηρισμοί myDATA`);
  }

  // ══ ΦΥΛΛΟ 4: ΟΙ ΕΠΙΤΡΕΠΤΟΙ ΣΥΝΔΥΑΣΜΟΙ, ΩΣ ΠΙΝΑΚΑΣ ═══════════════════════
  // ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΤΑΙ ΕΔΩ. Οι επιτρεπτοί χαρακτηρισμοί ήταν γραμμένοι ως
  // κείμενο σε ένα κελί — «category2_1, category2_2, category2_4, …» — δηλαδή
  // αδιάβαστοι: για να απαντήσει «δέχεται το 13.3 τον 2.4;» ο λογιστής έπρεπε
  // να διαβάσει μια σειρά από κόμματα και να προσέξει ότι το «2.1» δεν είναι
  // πρόθεμα του «2.10». Εδώ γίνεται πίνακας: μία γραμμή ανά τύπο, μία στήλη ανά
  // χαρακτηρισμό, «✓» στη διασταύρωση. Η απάντηση είναι ΘΕΣΗ, όχι ανάγνωση.
  //
  // ΚΑΙ ΤΟ ΦΙΛΤΡΟ ΚΑΝΕΙ ΤΗ ΔΟΥΛΕΙΑ ΤΟΥ ΑΝΑΠΤΥΣΣΟΜΕΝΟΥ ΚΑΤΑΛΟΓΟΥ. Το αυτόματο
  // φίλτρο μπαίνει σε ΟΛΟΝ τον πίνακα: ο λογιστής πατά το βελάκι της στήλης
  // «2.5», διαλέγει «✓», και βλέπει μόνο τους τύπους που τον δέχονται — και
  // αντίστροφα, φιλτράροντας τη στήλη «Τύπος» βλέπει τι δέχεται ένας τύπος.
  // (Ο πίνακας απαντά και το αντίστροφο: φιλτράροντας τη στήλη ενός
  // χαρακτηρισμού, βλέπεις μόνο τους τύπους που τον δέχονται.)
  //
  // ΤΟ ΦΥΛΛΟ ΕΙΝΑΙ ΧΩΡΙΣΤΟ ΓΙΑ ΕΝΑΝ ΠΡΑΚΤΙΚΟ ΛΟΓΟ. Οι στήλες ενός φύλλου έχουν
  // ΕΝΑ πλάτος. Κάτω από τις «Κινήσεις», η στήλη «Περιγραφή» των 46 χαρακτήρων
  // θα έκανε τον πίνακα των «✓» να απλώνεται σε τρεις οθόνες.
  if (inp.myData) {
    const { expCols, incCols, shortOf, expRows, incRows, namedRows, incomeNamedRows, NC, HR } = comboSheet;

    const aoa: (string | number)[][] = [
      ['ΕΠΙΤΡΕΠΤΟΙ ΣΥΝΔΥΑΣΜΟΙ ΧΑΡΑΚΤΗΡΙΣΜΩΝ ΑΝΑ ΤΥΠΟ ΠΑΡΑΣΤΑΤΙΚΟΥ'],
      ['Πηγή: ΑΑΔΕ, Συνδυασμοί Χαρακτηρισμών v1.0.4 · «✓» όπου ο τύπος δέχεται τον χαρακτηρισμό · στον πίνακα των εξόδων, φίλτρο σε στήλη χαρακτηρισμού δείχνει μόνο τους τύπους που τον δέχονται'],
      [],
      ['ΧΑΡΑΚΤΗΡΙΣΜΟΙ ΕΞΟΔΩΝ'],
      ['Τύπος', 'Περιγραφή', ...expCols.map(shortOf)],
      ...expRows,
      [],
      ['ΧΑΡΑΚΤΗΡΙΣΜΟΙ ΕΣΟΔΩΝ'],
      ['Τύπος', 'Περιγραφή', ...incCols.map(shortOf)],
      ...incRows,
      [],
      ['ΟΙ ΧΑΡΑΚΤΗΡΙΣΜΟΙ ΕΞΟΔΩΝ ΜΕ ΤΟ ΟΝΟΜΑ ΤΟΥΣ'],
      ['Κωδικός ΑΑΔΕ', 'Χαρακτηρισμός', 'Πρόσημο'],
      ...namedRows,
      [],
      ['ΟΙ ΧΑΡΑΚΤΗΡΙΣΜΟΙ ΕΣΟΔΩΝ ΜΕ ΤΟ ΟΝΟΜΑ ΤΟΥΣ'],
      ['Κωδικός ΑΑΔΕ', 'Χαρακτηρισμός'],
      ...incomeNamedRows,
      [],
      ['Ο ιδιοκτήτης εκδίδει κι εκείνος παραστατικά· ποιο εκδίδει εξαρτάται από τη δραστηριότητα και το κρίνει ο λογιστής. Η εφαρμογή υποδεικνύει μόνο τύπους 14.x, όπου υπόχρεος διαβίβασης είναι ο λήπτης.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Το όριο είναι 62: ο μακρύτερος τίτλος παραστατικού («Παραστατικά Οντότητας
    // ως Αναγράφονται από την ίδια (Δυναμικό)») πιάνει 61, και μια αναδίπλωση θα
    // έκανε διγράμμες τις μισές από τις σαράντα πέντε γραμμές.
    const { incSec, incHead, namSec, namHead, incNamSec, incNamHead } = comboSheet;
    const noteR = incNamHead + 1 + incomeNamedRows.length + 1;
    const hgt: { hpt: number }[] = []; ws['!rows'] = hgt;
    hgt[0] = { hpt: ROW.title }; hgt[1] = { hpt: ROW.sub }; hgt[HR] = { hpt: ROW.head };
    bannerRow(ws, 0, NC, S.title);
    bannerRow(ws, 1, NC, S.sub);
    bannerRow(ws, noteR, NC, S.sub);
    const CTR = { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } };
    // Η επικεφαλίδα σταματά όπου σταματούν οι στήλες του ΣΥΓΚΕΚΡΙΜΕΝΟΥ πίνακα:
    // οι χαρακτηρισμοί εσόδων είναι λιγότεροι, και γκρι κελιά που συνεχίζουν
    // πέρα από την τελευταία στήλη μοιάζουν με στήλες που έμειναν κενές.
    const grid = (head: number, n: number, cols: number) => {
      for (let c = 0; c < 2 + cols; c++) setCell(ws, head, c, { s: S.head });
      for (let i = 0; i < n; i++) {
        const r = head + 1 + i;
        hgt[r] = { hpt: ROW.data };
        setCell(ws, r, 0, { s: CTR }); setCell(ws, r, 1, { s: S.txt });
        for (let c = 2; c < 2 + cols; c++) setCell(ws, r, c, { s: CTR });
      }
    };
    for (const r of [HR - 1, incSec, namSec, incNamSec]) bannerRow(ws, r, NC, S.section);
    grid(HR, expRows.length, expCols.length);
    grid(incHead, incRows.length, incCols.length);
    // Ο κατάλογος των εξόδων έχει τρεις στήλες (με το πρόσημο), των εσόδων δύο:
    // το πρόσημο δεν έχει διαβαστεί από πηγή για την πλευρά των εσόδων και δεν
    // επινοείται. Το πλήθος βγαίνει από την ίδια τη γραμμή.
    for (const [head, rows] of [[namHead, namedRows], [incNamHead, incomeNamedRows]] as const) {
      const cols = rows[0]?.length ?? 2;
      for (let c = 0; c < cols; c++) setCell(ws, head, c, { s: S.head });
      for (let i = 0; i < rows.length; i++) {
        setCell(ws, head + 1 + i, 0, { s: S.txt }); setCell(ws, head + 1 + i, 1, { s: S.txt });
        if (cols > 2) setCell(ws, head + 1 + i, 2, { s: CTR });
      }
    }
    ws['!cols'] = autoWidths(ws, { headRow: HR, max: 62 }).cols;
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: HR + expRows.length, c: NC - 1 } }) };
    ws['!margins'] = { ...MARGINS };
    // ΠΑΓΩΝΟΥΝ ΜΟΝΟ Ο ΤΙΤΛΟΣ ΚΑΙ Η ΠΗΓΗ. Παγωμένη στη γραμμή των στηλών, η
    // επικεφαλίδα των ΕΞΟΔΩΝ έμενε στην οθόνη πάνω από τον πίνακα των ΕΣΟΔΩΝ,
    // όπου η ίδια στήλη «2.4» σημαίνει «1.4»: χειρότερο από καθόλου πάγωμα.
    sheetFinish(ws, { landscape: true, freezeRows: 2 });
    XLSX.utils.book_append_sheet(wb, ws, COMBO_SHEET);
  }

  // ══ ΦΥΛΛΟ 6: ΚΑΙ Ο ΚΩΔΙΚΟΣ ΤΟΥ Ε3, ΓΙΑ ΚΑΘΕ ΣΥΝΔΥΑΣΜΟ ═══════════════════
  // ΤΟ ΤΡΙΤΟ ΕΠΙΠΕΔΟ ΤΟΥ ΕΛΕΓΧΟΥ ΤΗΣ ΑΑΔΕ. Ο τύπος παραστατικού και ο
  // χαρακτηρισμός δεν αρκούν: η διαβίβαση απορρίπτεται και όταν ο κωδικός Ε3
  // δεν ανήκει στον συνδυασμό. Ο πίνακας ζει σε σαράντα πέντε φύλλα ενός .xls
  // της ΑΑΔΕ· εδώ γράφεται ολόκληρος, μία γραμμή ανά επιτρεπτή τριάδα, με
  // αυτόματο φίλτρο ώστε να απαντά «τι δέχεται το 14.3;» με δύο κλικ.
  //
  // ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΚΩΔΙΚΟ, ΚΑΙ ΟΧΙ ΛΙΣΤΑ ΜΕ ΚΟΜΜΑΤΑ: έτσι το φίλτρο δουλεύει
  // και στη στήλη του κωδικού («ποιοι συνδυασμοί οδηγούν στο E3_585_016;»).
  if (inp.myData) {
    const NC = 6, HR = 4;
    const catLabel = (c: string): string => {
      const short = c.replace(/^category(\d)_/, '$1.');
      const name = EXPENSE_CLASS_LABEL_ALL[c] ?? INCOME_CLASS_LABEL[c];
      return name ? `${short} ${name}` : short;
    };
    const rows = e3Triples().map(t => [
      t.type, AADE_DOC_TYPES[t.type]?.title ?? '', catLabel(t.category),
      t.code, t.code ? E3_LABEL[t.code] ?? '' : '', t.note,
    ]);
    const aoa: (string | number)[][] = [
      ['ΚΩΔΙΚΟΙ Ε3 ΑΝΑ ΤΥΠΟ ΠΑΡΑΣΤΑΤΙΚΟΥ ΚΑΙ ΧΑΡΑΚΤΗΡΙΣΜΟ'],
      ['Πηγή: ΑΑΔΕ, Συνδυασμοί Χαρακτηρισμών v1.0.4 · μία γραμμή ανά επιτρεπτό συνδυασμό · η επιλογή ανάμεσα σε πολλούς επιτρεπτούς κωδικούς εξαρτάται από τη φύση της συναλλαγής'],
      [],
      ['ΟΛΟΙ ΟΙ ΕΠΙΤΡΕΠΤΟΙ ΣΥΝΔΥΑΣΜΟΙ'],
      ['Τύπος', 'Παραστατικό', 'Χαρακτηρισμός', 'Κωδικός Ε3', 'Ονομασία κωδικού Ε3', 'Σημείωση ΑΑΔΕ'],
      ...rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5]]),
      [],
      ['Κάθε κωδικός γράφεται όπως ακριβώς τον ζητά το σύστημα διαβίβασης, με την ονομασία του δίπλα.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Χωρίς όριο πλάτους σε αυτό το φύλλο: με 1.442 γραμμές, μια αναδίπλωση θα
    // διπλασίαζε το ύψος του πίνακα για να κερδίσει λίγη οριζόντια κύλιση.
    const noteR = HR + 1 + rows.length + 1;
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.title }; ws['!rows'][1] = { hpt: ROW.sub }; ws['!rows'][HR] = { hpt: ROW.head };
    bannerRow(ws, 0, NC, S.title);
    bannerRow(ws, 1, NC, S.sub);
    bannerRow(ws, HR - 1, NC, S.section);
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });
    for (let i = 0; i < rows.length; i++) {
      const r = HR + 1 + i;
      ws['!rows'][r] = { hpt: ROW.data };
      for (let c = 0; c < NC; c++) setCell(ws, r, c, { s: S.txt });
    }
    bannerRow(ws, noteR, NC, S.sub);
    ws['!cols'] = autoWidths(ws, { headRow: HR, max: 110 }).cols;
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: HR + rows.length, c: NC - 1 } }) };
    ws['!margins'] = { ...MARGINS };
    sheetFinish(ws, { landscape: true, freezeRows: HR + 1 });
    // Χίλιες τετρακόσιες γραμμές σε έναν πίνακα: από τη δεύτερη τυπωμένη σελίδα
    // και μετά, χωρίς επανάληψη της επικεφαλίδας, είναι κωδικοί χωρίς στήλες.
    const e3Sheet = 'Κωδικοί Ε3 ανά συνδυασμό';
    XLSX.utils.book_append_sheet(wb, ws, e3Sheet);
    printTitles(wb, wb.SheetNames.length - 1, e3Sheet, HR + 1);
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

/**
 * ΕΝΑ ΠΑΡΑΣΤΑΤΙΚΟ ΠΟΥ ΤΑΞΙΔΕΥΕΙ ΜΕΣΑ ΣΤΟΝ ΦΑΚΕΛΟ.
 *
 * Ο φάκελος έλεγε ώς τώρα ΤΙ ΛΕΙΠΕΙ, αλλά δεν κουβαλούσε ό,τι ΥΠΑΡΧΕΙ: ο
 * λογιστής έπαιρνε αριθμούς και μετά ζητούσε τα χαρτιά με δεύτερο μήνυμα. Τα
 * bytes έρχονται από τον καλούντα, γιατί αυτός ξέρει από πού κατεβαίνουν — αυτό
 * το αρχείο δεν έχει και δεν πρέπει να αποκτήσει γνώση της αποθήκευσης.
 */
export interface DossierAttachment extends DossierPaper {
  bytes: Uint8Array;
}

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
  /** Τα ίδια τα χαρτιά, με τα bytes τους. Κενό όταν δεν υπάρχουν ή δεν ζητήθηκαν. */
  attachments?: readonly DossierAttachment[];
}

const CRLF = '\r\n';
const BOM = '﻿';                                   // ώστε το ελληνικό Excel να ανοίγει σωστά τα CSV

const csv = (rows: (string | number)[][]): string => BOM + rows.map(r => r.map(v => csvCell(v, ';')).join(';')).join(CRLF) + CRLF;
const txt = (lines: string[]): string => BOM + lines.join(CRLF) + CRLF;
const grDate = (d: string): string => { const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; };
const grNum = (n: number): string => (n || 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rule = (ch = '─', n = 74) => ch.repeat(n);

/**
 * Τα περιεχόμενα του φακέλου, πριν γίνουν zip.
 *
 * Η ΑΡΙΘΜΗΣΗ ΕΙΝΑΙ Η ΟΔΗΓΙΑ ΧΡΗΣΗΣ. Ο λογιστής δεν διαβάζει README· διαβάζει
 * ονόματα φακέλων. 01 η σύνοψη, 02 τα έσοδα, 03 τα έξοδα, 04 τα δικαιολογητικά
 * και 05 —μόνο του, έξω από κάθε υποφάκελο, για να μη χαθεί— τι λείπει.
 *
 * ΞΕΧΩΡΙΣΤΑ ΑΠΟ ΤΟ ΚΑΤΕΒΑΣΜΑ, ΓΙΑΤΙ ΑΛΛΙΩΣ ΔΕΝ ΕΛΕΓΧΕΤΑΙ. Όσο ο φάκελος
 * γεννιόταν μέσα στην ίδια συνάρτηση που καλεί τον browser, τίποτα από όσα
 * γράφει —ούτε τα ονόματα, ούτε το ευρετήριο— δεν μπορούσε να δοκιμαστεί χωρίς
 * DOM. Και ένας φάκελος που δεν δοκιμάζεται είναι ένας φάκελος που θα βγει
 * λάθος στον λογιστή του πελάτη.
 */
export function dossierFiles(inp: DossierExportInput): ZipFile[] {
  const { year, propName, ownerAfm, requirements, haveIds, readinessMessage, properties, formLabel, booksLabel, gaps = [], book } = inp;
  const have = new Set(haveIds);
  const missing = requirements.filter(r => !have.has(r.id));
  const issued = new Date().toLocaleDateString('el-GR');
  const idLine = `${propName}${ownerAfm ? ` · ΑΦΜ ${ownerAfm}` : ''} · χρήση ${year}`;

  const income = book.filter(e => e.type === 'income').sort((a, b) => a.date.localeCompare(b.date));
  const expense = book.filter(e => e.type === 'expense').sort((a, b) => a.date.localeCompare(b.date));
  const sum = (rows: AccountantMovement[]) => rows.reduce((s, e) => s + (e.amount || 0), 0);

  // ── ΤΑ ΧΑΡΤΙΑ, ΑΡΙΘΜΗΜΕΝΑ ────────────────────────────────────────────────
  // Υπολογίζονται ΜΙΑ φορά και μοιράζονται σε τέσσερα σημεία: τη στήλη του
  // Excel, τα δύο αρχεία των κινήσεων, το ευρετήριο και τα ίδια τα ονόματα των
  // αρχείων. Δεύτερη κλήση θα έδινε τα ίδια αποτελέσματα (η `filePapers` είναι
  // καθαρή), αλλά μία μόνο κλήση το κάνει αδύνατο να αποκλίνουν ποτέ.
  const attachments = inp.attachments ?? [];
  const papers = filePapers(attachments, book.map(e => ({
    date: e.date, amount: e.amount, afm: afmCell(e) || null,
  })));
  // Από την κίνηση στον αριθμό του χαρτιού της: η ταυτότητα του αντικειμένου
  // είναι το κλειδί, γιατί οι δύο ταξινομήσεις κρατούν τις ΙΔΙΕΣ γραμμές.
  const sortedBook = [...book].sort((a, b) => a.date.localeCompare(b.date));
  const paperOf = new Map<AccountantMovement, string>();
  for (const p of papers) {
    if (p.row == null) continue;
    const e = sortedBook[p.row - 1];
    const cur = paperOf.get(e);
    paperOf.set(e, cur ? `${cur} · ${p.label}` : p.label);
  }
  const anyPaper = papers.length > 0;

  // ── 00 · Τι κρατάς στα χέρια σου ─────────────────────────────────────────
  const readme = txt([
    'ΦΑΚΕΛΟΣ ΓΙΑ ΤΟΝ ΛΟΓΙΣΤΗ', rule('═'), '',
    idLine,
    `Νομική μορφή: ${formLabel} · Βιβλία: ${booksLabel}`,
    `Ημερομηνία έκδοσης: ${issued}`, '',
    readinessMessage, '', rule(), '',
    'ΠΕΡΙΕΧΟΜΕΝΑ',
    // Ο ΠΙΝΑΚΑΣ ΠΕΡΙΕΧΟΜΕΝΩΝ ΛΕΕΙ ΤΙ ΥΠΑΡΧΕΙ ΟΝΤΩΣ ΜΕΣΑ. Το Excel αποκτά δύο
    // φύλλα ακόμη όταν υπάρχει υποχρέωση myDATA· μια σταθερή πρόταση θα έλεγε
    // «αποτελέσματα και κινήσεις» σε αρχείο που έχει και τους χαρακτηρισμούς.
    `  01 ΣΥΝΟΨΗ            ${inp.myData
      ? 'Αποτελέσματα, κινήσεις, λογαριασμοί ΕΛΠ και χαρακτηρισμοί myDATA (Excel).'
      : 'Αποτελέσματα, κινήσεις και λογαριασμοί ΕΛΠ (Excel).'}`,
    '  02 ΕΣΟΔΑ             Κάθε είσπραξη του έτους, με ημερομηνία και περιγραφή.',
    '  03 ΕΞΟΔΑ             Κάθε πληρωμή του έτους, ανά κατηγορία.',
    '  04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ    Ο κατάλογος των παραστατικών, με το ποιος φέρνει το καθένα.',
    ...(anyPaper ? [`                       Και τα ίδια τα χαρτιά: ${papers.length === 1 ? 'ένα αρχείο' : `${papers.length} αρχεία`}, αριθμημένα.`] : []),
    '  05 Τι λείπει         Ό,τι ΔΕΝ βρέθηκε. Διαβάστε το πρώτο.', '', rule(), '',
    // Ο ΑΡΙΘΜΟΣ ΤΟΥ ΑΡΧΕΙΟΥ ΕΙΝΑΙ Ο ΑΡΙΘΜΟΣ ΣΤΗ ΣΤΗΛΗ. Λέγεται εδώ μία φορά,
    // και δεν επαναλαμβάνεται σε κανένα από τα υπόλοιπα αρχεία.
    ...(anyPaper ? [
      'ΠΩΣ ΔΕΝΟΥΝ ΤΑ ΧΑΡΤΙΑ ΜΕ ΤΟΥΣ ΑΡΙΘΜΟΥΣ',
      'Κάθε παραστατικό έχει αριθμό μπροστά από το όνομά του. Ο ίδιος αριθμός',
      'γράφεται στη στήλη «Παραστατικό», δίπλα στην κίνηση που τεκμηριώνει. Όπου',
      'η στήλη είναι κενή, το χαρτί δεν ταυτίστηκε με βεβαιότητα σε μία κίνηση:',
      'το ευρετήριο του 04 δείχνει τι ξέρουμε γι\' αυτό.', '', rule(), '',
    ] : []),
    'Τα ποσά προέρχονται από τις καταχωρήσεις του ιδιοκτήτη στο Property OS και',
    'δεν αποτελούν φορολογική δήλωση ούτε λογιστική συμβουλή.',
  ]);

  // ── 01 · Ταυτότητα και σύνοψη ────────────────────────────────────────────
  // ΤΟ ΙΔΙΟ ΑΡΧΕΙΟ ΜΕ ΤΟ ΚΟΥΜΠΙ «EXCEL», ΚΑΙ ΜΕ ΤΟΝ ΙΔΙΟ ΤΡΟΠΟ ΓΡΑΨΙΜΑΤΟΣ:
  // η `workbookBytes` προσθέτει τους αναπτυσσόμενους καταλόγους και τη διάταξη
  // σελίδας. Γραμμένο με σκέτο `XLSX.write`, ο φάκελος θα κουβαλούσε ΑΛΛΟ αρχείο
  // από το κουμπί, χωρίς να το δει κανείς.
  const wbBytes = workbookBytes(buildWorkbook(inp, papers));
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
    // Η στήλη υπάρχει μόνο όπου έχει περιεχόμενο: μια κενή στήλη «ΑΦΜ» σε αρχείο
    // εσόδων είναι ερώτηση χωρίς νόημα, και σε αρχείο εξόδων χωρίς κανένα ΑΦΜ
    // είναι υπόσχεση που δεν κρατήθηκε. Το ίδιο ισχύει για το παραστατικό: σε
    // αρχείο εσόδων χωρίς κανένα χαρτί η στήλη δεν μπαίνει καθόλου.
    const afm = rows.some(r => afmCell(r));
    const pap = rows.some(r => paperOf.has(r));
    return csv([
      [head],
      [idLine],
      [],
      // ΤΟ ΑΦΜ ΜΠΑΙΝΕΙ ΚΑΙ ΣΤΑ ΞΕΧΩΡΙΣΤΑ ΑΡΧΕΙΑ. Ο λογιστής που ανοίγει το
      // «03 ΕΞΟΔΑ» έβρισκε πέντε στήλες χωρίς αντισυμβαλλόμενο, ενώ το Excel
      // της σύνοψης τον έχει: το ίδιο βιβλίο, δύο διαφορετικές απαντήσεις.
      ['Α/Α', 'Ημερομηνία', 'Κατηγορία', 'Περιγραφή', ...(pap ? ['Παραστατικό'] : []),
        ...(afm ? ['ΑΦΜ προμηθευτή'] : []), ...(md ? ['Χαρακτηρισμός myDATA'] : []), 'Ποσό (€)'],
      ...rows.map((e, i) => [i + 1, grDate(e.date), e.category || '', e.description || '',
        ...(pap ? [paperOf.get(e) || ''] : []),
        ...(afm ? [afmCell(e)] : []), ...(md ? [mdCsv(e)] : []), grNum(e.amount)]),
      [],
      ['', '', '', 'ΣΥΝΟΛΟ', ...(pap ? [''] : []), ...(afm ? [''] : []), ...(md ? [''] : []), grNum(sum(rows))],
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

  // ── 04 · ΤΟ ΕΥΡΕΤΗΡΙΟ ΤΩΝ ΧΑΡΤΙΩΝ ────────────────────────────────────────
  // Ο ΚΑΤΑΛΟΓΟΣ ΑΠΟ ΠΑΝΩ ΛΕΕΙ ΤΙ ΠΡΕΠΕΙ ΝΑ ΥΠΑΡΧΕΙ· ΑΥΤΟ ΛΕΕΙ ΤΙ ΥΠΑΡΧΕΙ ΕΔΩ.
  // Δύο διαφορετικές ερωτήσεις, δύο αρχεία — και το δεύτερο υπάρχει μόνο όταν
  // ταξιδεύουν όντως χαρτιά. Η τελευταία στήλη είναι όλη η δουλειά του: από το
  // χαρτί στη γραμμή. Κενή σημαίνει «δεν ξέρουμε», ποτέ «καμία».
  const paperIndex = csv([
    [`ΕΥΡΕΤΗΡΙΟ ΠΑΡΑΣΤΑΤΙΚΩΝ ${year}`],
    [idLine],
    [],
    ['Α/Α', 'Αρχείο', 'Ημερομηνία', 'Εκδότης', 'ΑΦΜ', 'Κατηγορία', 'Ποσό (€)', 'Γραμμή στις «Κινήσεις»'],
    ...papers.map(p => [
      p.label, p.file, p.paper.docDate ? grDate(p.paper.docDate) : '',
      p.paper.supplier || p.paper.title || '', p.paper.afm || '', p.paper.category || '',
      // Ποσό μόνο όταν το ξέρουμε: ένα «0,00» σε τιμολόγιο που δεν διαβάστηκε
      // είναι ψέμα, και ο λογιστής θα το αθροίσει.
      Number.isFinite(Number(p.paper.amount)) && Number(p.paper.amount) !== 0 ? grNum(Number(p.paper.amount)) : '',
      p.row ?? '',
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
  // ── ΟΙ ΔΑΠΑΝΕΣ ΧΩΡΙΣ ΑΝΤΙΣΥΜΒΑΛΛΟΜΕΝΟ ──────────────────────────────────────
  // Το κενό ΑΦΜ φαινόταν μόνο ως άδειο κελί σε μια στήλη. Εδώ γίνεται ΕΡΩΤΗΣΗ
  // προς τον ιδιοκτήτη, ομαδοποιημένη ανά προμηθευτή: «ποιανού είναι αυτά τα
  // τιμολόγια» ρωτιέται μία φορά, όχι είκοσι. Η ομαδοποίηση ζει στο
  // lib/accounting/dossier.ts, όπου δοκιμάζεται χωρίς να κατέβει αρχείο.
  const afmGroups = missingAfmGroups(expense.map(e => ({
    category: e.category, description: e.description, amount: e.amount, afm: afmCell(e),
  })));
  const afmBlock = afmGroups.flatMap((m, i) => [
    `${String(i + 1).padStart(2, ' ')}. ${m.category} · ${m.count === 1 ? 'μία δαπάνη' : `${m.count} δαπάνες`} · ${grNum(m.amount)} €`,
    ...(m.sample ? [`    Παράδειγμα: ${m.sample}`] : []),
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
    ...(afmBlock.length
      ? [`Ε. ΔΑΠΑΝΕΣ ΧΩΡΙΣ ΑΦΜ ΠΡΟΜΗΘΕΥΤΗ (${afmGroups.length})`, rule(), '',
        'Ο λογιστής δεν καταχωρεί δαπάνη χωρίς αντισυμβαλλόμενο. Το ΑΦΜ διαβάζεται',
        'μόνο του από τα παραστατικά που σαρώνονται στην εφαρμογή· για τις παρακάτω',
        'χρειάζεται το χαρτί ή το ΑΦΜ του εκδότη.', '', ...afmBlock]
      : []),
    rule(),
    missing.length === 0 && gaps.length === 0 && mdBlock.length === 0 && afmBlock.length === 0
      ? 'Ο φάκελος είναι πλήρης.'
      : 'Τα παραπάνω δεν βρέθηκαν στην εφαρμογή. Δεν σημαίνει ότι δεν υπάρχουν:',
    ...(missing.length === 0 && gaps.length === 0 && mdBlock.length === 0 && afmBlock.length === 0 ? [] : ['σημαίνει ότι δεν συνοδεύουν αυτόν τον φάκελο.']),
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
    // ΤΑ ΧΑΡΤΙΑ ΣΕ ΔΙΚΟ ΤΟΥΣ ΥΠΟΦΑΚΕΛΟ, ΚΑΙ ΤΟ ΕΥΡΕΤΗΡΙΟ ΕΞΩ ΑΠΟ ΑΥΤΟΝ. Είκοσι
    // αρχεία δίπλα σε δύο καταλόγους θα έθαβαν τους καταλόγους· ο λογιστής
    // ανοίγει το 04, βλέπει τρία ονόματα, και μπαίνει στα «Παραστατικά» όταν
    // θέλει το ίδιο το χαρτί.
    ...(anyPaper ? [{ path: `04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Ευρετήριο παραστατικών ${year}.csv`, data: paperIndex }] : []),
    ...papers.map(p => ({ path: `04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Παραστατικά/${p.file}`, data: p.paper.bytes })),
    ...(trapRows.length ? [{ path: '04 ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ/Παγίδες που κοστίζουν.txt', data: trapsFile }] : []),
    { path: '05 Τι λείπει.txt', data: whatsMissing },
  ];

  return files;
}

/** Ο φάκελος, ως ένα αρχείο .zip στον υπολογιστή του χρήστη. */
export function exportAccountantDossier(inp: DossierExportInput): void {
  downloadFile(new Blob([buildZip(dossierFiles(inp))], { type: 'application/zip' }),
    `Φάκελος λογιστή ${inp.propName || 'ακίνητο'} ${inp.year}.zip`);
}
