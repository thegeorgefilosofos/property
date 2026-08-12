// ΧΩΡΙΣ 'use client': καθαρές συναρτήσεις μορφοποίησης κελιών, κανένα React.
// ═══════════════════════════════════════════════════════════════════════════
// Κοινό «λογιστικό» στυλ για ΟΛΕΣ τις εξαγωγές Excel — ώστε κάθε αρχείο (Ε2,
// φάκελος λογιστή κ.λπ.) να έχει την ίδια, καθαρή, επαγγελματική εμφάνιση:
// έντονες αναδιπλωμένες επικεφαλίδες σε γκρι φόντο, πλαίσια, στοίχιση, δύο
// δεκαδικά, ημερομηνίες. Ασπρόμαυρο (γκρι/μαύρο) — χωρίς χρώμα/θόρυβο.
// ═══════════════════════════════════════════════════════════════════════════
import XLSX from 'xlsx-js-style';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { downloadFile, safeFilename } from '@/lib/core/download';
export { XLSX };

// Το πρόθεμα [$-408] (ελληνική τοπική ρύθμιση) ΕΠΙΒΑΛΛΕΙ ελληνική μορφή σε κάθε
// Excel, ανεξάρτητα από τη γλώσσα του υπολογιστή: κόμμα για δεκαδικά, τελεία για
// χιλιάδες → «1.234,56 €», «18,00%». Το «%» είναι κυριολεκτικό (δεν πολλαπλασιάζει
// επί 100· οι τιμές αποθηκεύονται ήδη ως ακέραιο ποσοστό, π.χ. 18).
export const FMT = {
  eur: '[$-408]#,##0.00" €";[$-408]-#,##0.00" €"',  // «1.234,56 €», αρνητικά με πρόσημο
  int: '[$-408]#,##0',
  dec2: '[$-408]#,##0.##',      // αριθμός με δεκαδικά μόνο όταν υπάρχουν (π.χ. τ.μ. 85,5)
  pct: '[$-408]0.00" %"',       // «18,00 %» — δύο δεκαδικά, κενό πριν το σύμβολο, ελληνικό κόμμα
  date: 'dd/mm/yyyy',
} as const;

const INK = '111111', SUB = '6B7280', LINE = 'D0D5DD', HEADBG = 'E9ECEF', SECBG = 'F3F4F6';
const bThin = { style: 'thin', color: { rgb: LINE } };
export const boxAll = { top: bThin, bottom: bThin, left: bThin, right: bThin };
// Μία γραμματοσειρά παντού (τυποποίηση): Calibri — καθαρή, τυπική για λογιστικά,
// αποδίδει σωστά ελληνικά. font(): βοηθός για ενιαία εφαρμογή του ονόματος.
const FONT = 'Calibri';
const font = (o: { bold?: boolean; italic?: boolean; sz: number; color?: { rgb: string } }) => ({ name: FONT, color: { rgb: INK }, ...o });

export const S = {
  title: { font: font({ bold: true, sz: 13 }), alignment: { vertical: 'center' } },
  sub: { font: font({ italic: true, sz: 9, color: { rgb: SUB } }), alignment: { vertical: 'center' } },
  section: { font: font({ bold: true, sz: 10 }), fill: { fgColor: { rgb: SECBG } }, alignment: { vertical: 'center' } },
  label: { font: font({ sz: 10, color: { rgb: '374151' } }), alignment: { vertical: 'center' } },
  field: { font: font({ sz: 10 }), alignment: { vertical: 'center' }, border: { bottom: bThin } },
  head: { font: font({ bold: true, sz: 9.5 }), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { fgColor: { rgb: HEADBG } }, border: boxAll },
  txt: { font: font({ sz: 10 }), alignment: { horizontal: 'left', vertical: 'center' }, border: boxAll },
  txtWrap: { font: font({ sz: 10 }), alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: boxAll },
  num: { font: font({ sz: 10 }), alignment: { horizontal: 'right', vertical: 'center' }, border: boxAll },
  strongTxt: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'left', vertical: 'center' }, border: boxAll },
  strongNum: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'right', vertical: 'center' }, border: boxAll },
  totTxt: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'left', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: INK } }, bottom: bThin, left: bThin, right: bThin } },
  totNum: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'right', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: INK } }, bottom: bThin, left: bThin, right: bThin } },
} as const;

// v προαιρετικό + f (τύπος/formula) ώστε τα σύνολα να είναι ΖΩΝΤΑΝΑ SUM (όπως σε
// πραγματικό λογιστικό πρόγραμμα)· το v κρατά cached τιμή για viewers χωρίς recalc.
export type Cell = { v?: string | number | Date; t?: string; z?: string; s?: object; f?: string };

// ── Κείμενο με ΕΓΓΥΗΜΕΝΟ ελληνικό κόμμα ─────────────────────────────────────
// Τα αριθμητικά κελιά του Excel δείχνουν «.» ή «,» ανάλογα με τη ΓΛΩΣΣΑ του
// υπολογιστή (το πρόθεμα [$-408] δεν το επιβάλλει αξιόπιστα). Για να φαίνεται
// ΠΑΝΤΑ ελληνικά («60,00 €», «18,00%»), γράφουμε τα ποσά/ποσοστά ως κείμενο
// προ-μορφοποιημένο με toLocaleString('el-GR') — ίδια εμφάνιση σε κάθε Excel.
export const money = (n?: number | null) => `${(n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const moneySigned = (n?: number | null) => ((n ?? 0) < 0 ? `-${money(Math.abs(n ?? 0))}` : money(n ?? 0));
export const percent = (n?: number | null) => `${(n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
export const intGr = (n?: number | null) => (n ?? 0).toLocaleString('el-GR');
// τ.μ. / πλήθη με έως 2 δεκαδικά, χωρίς σύμβολο (π.χ. εμβαδόν 85,5)
export const dec2 = (n?: number | null) => (n ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Ασφαλής εφαρμογή στυλ/τύπου/μορφής σε κελί (δημιουργεί το κελί αν λείπει). */
export function setCell(ws: XLSX.WorkSheet, r: number, c: number, patch: Partial<Cell>): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cur = (ws[addr] as Cell) || { v: '', t: 's' };
  ws[addr] = { ...cur, ...patch, s: { ...((cur.s as object) || {}), ...(patch.s || {}) } };
}

// ═══ ΤΟ ΦΥΛΛΟ ΠΟΥ ΤΥΠΩΝΕΤΑΙ ══════════════════════════════════════════════
// Ο λογιστής ΤΥΠΩΝΕΙ. Χωρίς περιθώρια και χωρίς επανάληψη επικεφαλίδων, η
// δεύτερη σελίδα είναι στήλες αριθμών χωρίς ονόματα — άχρηστη.
//
// ΤΟ «ΠΑΓΩΜΑ» ΤΩΝ ΕΠΙΚΕΦΑΛΙΔΩΝ ΔΕΝ ΓΡΑΦΕΤΑΙ ΜΕ ΤΗΝ ΙΔΙΟΤΗΤΑ `ws['!freeze']`:
// η κοινοτική έκδοση της βιβλιοθήκης τη δέχεται και δεν τη γράφει ποτέ. Ήταν
// γραμμένη στο `portfolioXlsx.ts` και δεν έκανε τίποτα — νεκρός κώδικας που
// έμοιαζε με λειτουργία. Γράφεται πλέον κατευθείαν στο XML, μαζί με τη διάταξη
// σελίδας και τους αναπτυσσόμενους καταλόγους (`sheetFinish`, πιο κάτω).
export const MARGINS = { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.3, footer: 0.3 } as const;

// ΤΑ ΥΨΗ ΕΙΝΑΙ ΤΥΠΟΠΟΙΗΣΗ, ΟΧΙ ΓΟΥΣΤΟ. Η γραμμή των επικεφαλίδων είχε τρία
// διαφορετικά ύψη στα έξι φύλλα του ίδιου βιβλίου (22, 26, 30) και σε δύο δεν
// είχε καθόλου. Οι επικεφαλίδες αναδιπλώνονται σε δύο σειρές των 9,5 στιγμών:
// 28 τις χωρά, και είναι το ίδιο παντού.
export const ROW = { title: 22, sub: 15, head: 28, data: 16 } as const;

/** Οι γραμμές που επαναλαμβάνονται σε κάθε τυπωμένη σελίδα, ανά φύλλο. */
export function printTitles(wb: XLSX.WorkBook, sheetIndex: number, sheetName: string, row1: number) {
  const names = (wb.Workbook ||= {}).Names ||= [];
  names.push({ Name: '_xlnm.Print_Titles', Sheet: sheetIndex, Ref: `'${sheetName.replace(/'/g, "''")}'!$${row1}:$${row1}` });
}

/**
 * ΤΟ ΦΥΛΛΟ ΠΟΥ ΔΙΑΒΑΖΕΤΑΙ ΠΡΩΤΟ ΓΡΑΦΕΤΑΙ ΤΕΛΕΥΤΑΙΟ.
 *
 * Η σύνοψη λέει τι περιέχει το βιβλίο, άρα δεν μπορεί να φτιαχτεί πριν από τα
 * φύλλα του. Η μετακίνηση δεν είναι όμως αλλαγή ενός πίνακα ονομάτων: οι
 * επαναλαμβανόμενες γραμμές εκτύπωσης δείχνουν το φύλλο τους με ΔΕΙΚΤΗ, και
 * μια σιωπηλή μετατόπιση θα τις κόλλαγε σε λάθος φύλλο — το Excel θα άνοιγε
 * κανονικά και θα τύπωνε επικεφαλίδα εκεί που δεν υπάρχει πίνακας. Οι δείκτες
 * ξαναβγαίνουν από το ΟΝΟΜΑ που κουβαλά η ίδια η αναφορά.
 */
export function moveSheetFirst(wb: XLSX.WorkBook, name: string): void {
  const at = wb.SheetNames.indexOf(name);
  if (at <= 0) return;
  wb.SheetNames = [name, ...wb.SheetNames.filter(n => n !== name)];
  for (const nm of wb.Workbook?.Names ?? []) {
    const ref = String(nm.Ref || '');
    const quoted = /^'((?:[^']|'')*)'!/.exec(ref);
    const plain = /^([^'!]+)!/.exec(ref);
    const sheet = quoted ? quoted[1].replace(/''/g, "'") : plain ? plain[1] : '';
    const idx = wb.SheetNames.indexOf(sheet);
    if (idx >= 0) nm.Sheet = idx;
  }
}

/**
 * Έγκυρο, μοναδικό όνομα φύλλου. Το Excel απορρίπτει το αρχείο ολόκληρο αν το
 * όνομα ξεπερνά τους 31 χαρακτήρες ή περιέχει \ / ? * [ ] :
 */
export function sheetName(raw: string, used: Set<string>): string {
  let name = (raw || 'Φύλλο').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').slice(0, 31).trim() || 'Φύλλο';
  const base = name;
  for (let i = 2; used.has(name); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name);
  return name;
}

// ═══ ΤΑ ΠΛΑΤΗ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ════════════════════════════════
// Ήταν γραμμένα στο χέρι, ένας αριθμός ανά στήλη, και μάντευαν: «ο τόπος
// παροχής χρειάζεται 19, ο χαρακτηρισμός 45». Δούλευε ώσπου το κείμενο μεγάλωσε
// κατά επτά χαρακτήρες — και τότε δεν έσκασε τίποτα, απλώς ο λογιστής είδε
// «Ενδοκοινοτική λή…» και δεν ήξερε αν είναι λήψη ή παράδοση. Μετρημένα σε ένα
// πραγματικό βιβλίο, δεκατρείς στήλες σε τέσσερα φύλλα έκοβαν.
//
// ΤΙ ΔΕΝ ΜΕΤΡΑΕΙ, ΚΑΙ ΓΙΑΤΙ:
//   · Οι γραμμές-πανό (τίτλος, ενότητα, σημείωση) έχουν περιεχόμενο ΜΟΝΟ στην
//     πρώτη στήλη και απλώνονται. Μετρημένες, θα έκαναν την πρώτη στήλη 190
//     χαρακτήρες πλατιά.
//   · Η γραμμή των επικεφαλίδων αναδιπλώνεται (wrapText), οπότε μετράει μισή:
//     το «ΦΠΑ αντίστροφης χρέωσης 24%» χωρά σε δύο σειρές των δεκατεσσάρων.
//
// ΚΑΙ ΤΟ ΑΝΩΤΑΤΟ ΟΡΙΟ ΔΕΝ ΕΙΝΑΙ ΓΟΥΣΤΟ. Στήλη 246 χαρακτήρων (οι είκοσι ένας
// επιτρεπτοί κωδικοί Ε3 μιας γραμμής) δεν είναι στήλη, είναι οριζόντια κύλιση.
// Πέρα από το όριο η στήλη ΑΝΑΔΙΠΛΩΝΕΤΑΙ, και το ύψος της γραμμής το αφήνουμε
// στο Excel — γι' αυτό ο καλών μαθαίνει ποιες στήλες αναδιπλώθηκαν.

export interface AutoWidths {
  cols: { wch: number }[];
  /** Οι στήλες που δεν χώρεσαν στο όριο και θέλουν αναδίπλωση. */
  wrap: Set<number>;
}

/**
 * Τα πλάτη ΤΟΥ ΕΤΟΙΜΟΥ ΦΥΛΛΟΥ, και όχι των ωμών δεδομένων.
 *
 * ΓΙΑΤΙ ΤΟΥ ΕΤΟΙΜΟΥ. Τα ποσά μπαίνουν στον πίνακα ως αριθμοί (12.5) και γίνονται
 * κείμενο αργότερα («12,50 €»): μετρημένα πριν, βγάζουν στήλη τεσσάρων
 * χαρακτήρων για περιεχόμενο επτά. Οι ημερομηνίες το ίδιο. Μετά το τελευταίο
 * `setCell`, το φύλλο λέει την αλήθεια.
 */
export function autoWidths(ws: XLSX.WorkSheet, opts: { headRow?: number; min?: number; max?: number } = {}): AutoWidths {
  const { headRow = -1, min = 6, max = 46 } = opts;
  const ref = ws['!ref'] as string | undefined;
  if (!ref) return { cols: [], wrap: new Set() };
  const range = XLSX.utils.decode_range(ref);
  const text = (r: number, c: number): string => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined;
    if (!cell || cell.v == null) return '';
    return cell.v instanceof Date ? 'dd/mm/yyyy' : String(cell.v);
  };
  const width: number[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    // ΟΙ ΓΡΑΜΜΕΣ-ΠΑΝΟ ΔΕΝ ΜΕΤΡΑΝΕ. Ο τίτλος, η επικεφαλίδα ενότητας και η
    // σημείωση έχουν περιεχόμενο μόνο στην πρώτη στήλη και απλώνονται σε όλο το
    // πλάτος. Μετρημένες, θα έκαναν την πρώτη στήλη 190 χαρακτήρες πλατιά.
    let filled = 0;
    for (let c = range.s.c; c <= range.e.c; c++) if (text(r, c) !== '') filled++;
    if (filled === 1 && text(r, range.s.c) !== '') continue;
    for (let c = range.s.c; c <= range.e.c; c++) {
      // Η επικεφαλίδα αναδιπλώνεται (wrapText) σε δύο σειρές· μετράει η μισή.
      const len = text(r, c).length;
      const need = r === headRow ? Math.ceil(len / 2) : len;
      width[c] = Math.max(width[c] ?? 0, need);
    }
  }
  const wrap = new Set<number>();
  const cols: { wch: number }[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const w = width[c] ?? 0;
    if (w > max) wrap.add(c);
    // Δύο χαρακτήρες αέρας: το Excel μετράει σε πλάτος του «0», και τα ελληνικά
    // κεφαλαία είναι φαρδύτερα. Χωρίς αυτό, το τελευταίο γράμμα ξύνει το πλαίσιο.
    cols[c] = { wch: Math.min(max, Math.max(min, w + 2)) };
  }
  return { cols, wrap };
}

/**
 * Αναδιπλώνει τις στήλες που δεν χώρεσαν, και ΞΕΚΛΕΙΔΩΝΕΙ το ύψος των γραμμών.
 *
 * Η αναδίπλωση χωρίς αυτό δεν φαίνεται: με κλειδωμένο ύψος δεκαέξι στιγμών, οι
 * είκοσι ένας κωδικοί Ε3 μιας γραμμής δείχνουν τους πρώτους οκτώ σαν να ήταν
 * όλοι. Το ύψος το βρίσκει το Excel, που ξέρει τη γραμματοσειρά του αναγνώστη.
 */
export function wrapColumns(ws: XLSX.WorkSheet, wrap: Set<number>, firstRow: number, lastRow?: number): void {
  if (!wrap.size) return;
  // Ώς το ΤΕΛΟΣ του φύλλου όταν δεν δοθεί όριο: μια στήλη που αναδιπλώνεται στον
  // κύριο πίνακα και όχι στον πίνακα από κάτω, κόβει εκεί — και εκεί ακριβώς
  // κόβονταν τα «ΣΥΝΟΛΑ ΑΝΑ ΧΑΡΑΚΤΗΡΙΣΜΟ».
  const end = lastRow ?? XLSX.utils.decode_range(String(ws['!ref'] ?? 'A1')).e.r;
  const rows = (ws['!rows'] ||= []) as ({ hpt: number } | undefined)[];
  for (let r = firstRow; r <= end; r++) {
    rows[r] = undefined;
    for (const c of wrap) setCell(ws, r, c, { s: S.txtWrap });
  }
}

// ═══ Η ΓΡΑΜΜΗ ΠΟΥ ΑΠΛΩΝΕΤΑΙ ══════════════════════════════════════════════
// Ο τίτλος, η επικεφαλίδα ενότητας και η σημείωση πιάνουν όλο το πλάτος. Δύο
// πράγματα πρέπει να γίνουν μαζί, και γίνονταν χωριστά: η ΕΝΩΣΗ των κελιών και
// το ΣΤΥΛ σε καθένα τους. Στο OOXML κάθε κελί κρατά το δικό του γέμισμα, οπότε
// μια ενωμένη γραμμή με στυλ μόνο στο πρώτο κελί βάφει γκρι το ένα πέμπτο και
// αφήνει λευκό το υπόλοιπο — με το κείμενο να τρέχει από πάνω. Εννέα
// επικεφαλίδες ενοτήτων σε τέσσερα φύλλα ήταν έτσι.

/** Ενώνει τη γραμμή σε όλο το πλάτος ΚΑΙ στυλίζει κάθε κελί της. */
export function bannerRow(ws: XLSX.WorkSheet, r: number, cols: number, style: object): void {
  const merges = (ws['!merges'] ||= []);
  merges.push({ s: { r, c: 0 }, e: { r, c: cols - 1 } });
  for (let c = 0; c < cols; c++) setCell(ws, r, c, { s: style });
}

// ═══ ΜΙΑ ΔΙΑΤΑΞΗ ΓΙΑ ΚΑΘΕ ΦΥΛΛΟ ΠΟΥ ΕΙΝΑΙ ΕΝΟΤΗΤΕΣ ══════════════════════════
// Τρία φύλλα του φακέλου —η σύνοψη, τα δικαιολογητικά και το τι λείπει— έχουν
// την ίδια δομή: τίτλος, ταυτότητα, και από κάτω ενότητες με πίνακα η καθεμία.
// Γραμμένα χωριστά, το ένα θα είχε επικεφαλίδες στη γραμμή 4 και το άλλο στη 5,
// άλλο ύψος γραμμής και άλλη απόσταση ανάμεσα στις ενότητες. Ο λογιστής δεν
// θα το έλεγε «ασυνέπεια»· θα το έλεγε «πρόχειρο», και θα είχε δίκιο.
//
// Η ΓΡΑΜΜΗ ΤΗΣ ΕΝΟΤΗΤΑΣ ΑΠΛΩΝΕΤΑΙ ΠΕΡΑ ΠΕΡΑ, και το πλάτος του φύλλου είναι ο
// ΠΛΑΤΥΤΕΡΟΣ πίνακάς του: μια ενότητα δύο στηλών μέσα σε φύλλο οκτώ στηλών
// έδειχνε το πανό της να σταματά στη μέση.

export interface SheetBlock {
  /** Ο τίτλος της ενότητας. Κενός για ενότητα χωρίς επικεφαλίδα. */
  title?: string;
  /** Μία πρόταση με βάρος, κάτω από τον τίτλο: η επικεφαλίδα της ενότητας. */
  lead?: string;
  head?: readonly string[];
  rows?: readonly (string | number)[][];
  /** Ποιες στήλες είναι ποσά ή πλήθη — στοιχίζονται δεξιά. */
  numeric?: readonly number[];
  /** Τι γράφεται όταν δεν υπάρχει ούτε μία γραμμή. Ποτέ άδειος πίνακας. */
  empty?: string;
  /** Προτάσεις κάτω από τον πίνακα, απλωμένες σε όλο το πλάτος. */
  notes?: readonly string[];
  /** Γραμμές του μπλοκ που είναι σύνολα (δείκτες μέσα στο `rows`). */
  totals?: readonly number[];
}

/**
 * Ένα φύλλο από ενότητες, με την ίδια διάταξη κάθε φορά.
 *
 * Επιστρέφει και τη γραμμή της πρώτης επικεφαλίδας, για το πάγωμα και για την
 * επανάληψη στην εκτύπωση.
 */
export function sectionSheet(o: {
  title: string;
  sub: string;
  blocks: readonly SheetBlock[];
  landscape?: boolean;
  /** Ανώτατο πλάτος στήλης πριν αναδιπλωθεί το κείμενο. */
  maxWidth?: number;
}): { ws: XLSX.WorkSheet; headRow: number } {
  const width = Math.max(2, ...o.blocks.map(b => Math.max(
    b.head?.length ?? 0,
    ...(b.rows ?? []).map(r => r.length),
  )));

  const aoa: (string | number)[][] = [[o.title], [o.sub], []];
  type Mark = { r: number; kind: 'section' | 'lead' | 'head' | 'row' | 'note' | 'total'; block: SheetBlock };
  const marks: Mark[] = [];
  let firstHead = -1;
  for (const b of o.blocks) {
    if (b.title) { marks.push({ r: aoa.length, kind: 'section', block: b }); aoa.push([b.title]); }
    if (b.lead) { marks.push({ r: aoa.length, kind: 'lead', block: b }); aoa.push([b.lead]); }
    if (b.head) {
      if (firstHead < 0) firstHead = aoa.length;
      marks.push({ r: aoa.length, kind: 'head', block: b });
      aoa.push([...b.head]);
    }
    const rows = b.rows ?? [];
    if (rows.length) {
      rows.forEach((row, i) => {
        marks.push({ r: aoa.length, kind: b.totals?.includes(i) ? 'total' : 'row', block: b });
        aoa.push([...row]);
      });
    } else if (b.empty) {
      // ΑΔΕΙΟΣ ΠΙΝΑΚΑΣ ΔΕΝ ΕΙΝΑΙ ΑΠΑΝΤΗΣΗ. Επικεφαλίδες πάνω από το τίποτα δεν
      // ξεχωρίζουν από εξαγωγή που χάλασε: ο λόγος γράφεται μέσα στον πίνακα.
      marks.push({ r: aoa.length, kind: 'note', block: b });
      aoa.push([b.empty]);
    }
    for (const n of b.notes ?? []) { marks.push({ r: aoa.length, kind: 'note', block: b }); aoa.push([n]); }
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!rows'] = [];
  ws['!rows'][0] = { hpt: ROW.title };
  ws['!rows'][1] = { hpt: ROW.sub };
  bannerRow(ws, 0, width, S.title);
  bannerRow(ws, 1, width, S.sub);
  for (const m of marks) {
    if (m.kind === 'section') { bannerRow(ws, m.r, width, S.section); ws['!rows'][m.r] = { hpt: ROW.head - 8 }; continue; }
    if (m.kind === 'lead') { bannerRow(ws, m.r, width, S.strongTxt); ws['!rows'][m.r] = { hpt: ROW.head }; continue; }
    if (m.kind === 'note') { bannerRow(ws, m.r, width, S.sub); continue; }
    if (m.kind === 'head') {
      ws['!rows'][m.r] = { hpt: ROW.head };
      for (let c = 0; c < (m.block.head?.length ?? 0); c++) setCell(ws, m.r, c, { s: S.head });
      continue;
    }
    const cols = m.block.head?.length ?? width;
    const total = m.kind === 'total';
    ws['!rows'][m.r] = { hpt: ROW.data };
    for (let c = 0; c < cols; c++) {
      const numeric = m.block.numeric?.includes(c);
      setCell(ws, m.r, c, { s: total ? (numeric ? S.totNum : S.totTxt) : (numeric ? S.num : S.txt) });
    }
  }
  const headRow = firstHead < 0 ? 3 : firstHead;
  const { cols, wrap } = autoWidths(ws, { headRow, max: o.maxWidth ?? 46 });
  ws['!cols'] = cols;
  wrapColumns(ws, wrap, headRow + 1);
  ws['!margins'] = { ...MARGINS };
  sheetFinish(ws, { landscape: o.landscape ?? true, freezeRows: 3 });
  return { ws, headRow };
}

// ═══ ΟΣΑ ΤΟ EXCEL ΞΕΡΕΙ ΚΑΙ Η ΒΙΒΛΙΟΘΗΚΗ ΔΕΝ ΓΡΑΦΕΙ ═══════════════════════
// Η κοινοτική έκδοση δεν γράφει ΟΥΤΕ επικύρωση δεδομένων (αναπτυσσόμενους
// καταλόγους) ΟΥΤΕ διάταξη σελίδας: δέχεται τις ιδιότητες και τις πετά. Το
// .xlsx όμως είναι zip με XML μέσα, και τα δύο είναι λίγες γραμμές XML στη
// σωστή θέση — το αρχείο ξαναδιαβάζεται κανονικά μετά.
//
// Η ΣΕΙΡΑ ΤΩΝ ΣΤΟΙΧΕΙΩΝ ΔΕΝ ΕΙΝΑΙ ΓΟΥΣΤΟ. Το Excel απορρίπτει ολόκληρο το
// αρχείο αν τα παιδιά του <worksheet> δεν είναι στη σειρά του προτύπου:
// sheetPr … sheetData … autoFilter … mergeCells … dataValidations …
// pageMargins … pageSetup. Γι' αυτό οι εισαγωγές γίνονται ΔΙΠΛΑ σε γνωστά
// στοιχεία και όχι στο τέλος.

/** Τι θέλει ένα φύλλο πέρα από όσα γράφει η βιβλιοθήκη. */
export interface SheetFinish {
  /**
   * Αναπτυσσόμενοι κατάλογοι. `values` για σύντομες λίστες (το Excel δέχεται
   * έως 255 χαρακτήρες συνολικά), `source` για αναφορά σε στήλη άλλου φύλλου
   * όταν τα λεκτικά είναι μεγάλα.
   */
  lists?: { ref: string; values?: readonly string[]; source?: string }[];
  /** Οριζόντια σελίδα, προσαρμοσμένη σε ένα πλάτος. Για τους φαρδιούς πίνακες. */
  landscape?: boolean;
  /**
   * Πάγωμα των πρώτων γραμμών (1-based: 4 = μένουν ορατές οι τέσσερις πρώτες).
   * Σε πίνακα χιλίων γραμμών, χωρίς αυτό η εκατοστή γραμμή είναι αριθμοί χωρίς
   * επικεφαλίδα. Η ιδιότητα `!freeze` της βιβλιοθήκης δεν γράφεται ποτέ.
   */
  freezeRows?: number;
}

/** Κρατά την προδιαγραφή πάνω στο φύλλο, εκεί που χτίζεται. */
export function sheetFinish(ws: XLSX.WorkSheet, finish: SheetFinish): void {
  (ws as Record<string, unknown>)['!finish'] = finish;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function validationsXml(lists: NonNullable<SheetFinish['lists']>): string {
  const items = lists.map(l => {
    // Το κόμμα χωρίζει τιμές μέσα σε λίστα: μια τιμή που το περιέχει θα έσπαγε
    // σε δύο επιλογές. Όπου συμβαίνει, η λίστα δίνεται ως αναφορά σε στήλη.
    const f = l.source ?? `"${(l.values ?? []).join(',')}"`;
    return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" `
      + `errorTitle="Μη επιτρεπτή τιμή" error="Διάλεξε μία από τις τιμές του καταλόγου." `
      + `sqref="${esc(l.ref)}"><formula1>${esc(f)}</formula1></dataValidation>`;
  });
  return `<dataValidations count="${items.length}">${items.join('')}</dataValidations>`;
}

function applyFinish(xml: string, f: SheetFinish): string {
  let out = xml;
  if (f.freezeRows) {
    const pane = `<pane ySplit="${f.freezeRows}" topLeftCell="A${f.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
      + '<selection pane="bottomLeft"/>';
    out = out.replace(/<sheetView([^>]*)\/>/, `<sheetView$1>${pane}</sheetView>`);
  }
  // ΤΟ ΣΗΜΕΙΟ ΕΙΣΑΓΩΓΗΣ ΔΕΝ ΕΙΝΑΙ «ΣΤΟ ΤΕΛΟΣ». Το `ignoredErrors` έρχεται ΜΕΤΑ
  // το pageSetup στο πρότυπο, και η βιβλιοθήκη το γράφει πάντα. Χωρίς περιθώρια
  // στο φύλλο, το «πριν το </worksheet>» τα προσγείωνε μετά από αυτό — και το
  // Excel αρνείται να ανοίξει ΟΛΟ το αρχείο, χωρίς να πει γιατί.
  const before = (xml: string, block: string): string =>
    xml.includes('<pageMargins') ? xml.replace('<pageMargins', block + '<pageMargins')
      : xml.includes('<ignoredErrors') ? xml.replace('<ignoredErrors', block + '<ignoredErrors')
        : xml.replace('</worksheet>', block + '</worksheet>');
  if (f.lists?.length) out = before(out, validationsXml(f.lists));
  if (f.landscape) {
    // Το «σε μία σελίδα πλάτος» ισχύει μόνο αν το φύλλο το δηλώσει στο sheetPr,
    // που πρέπει να είναι το ΠΡΩΤΟ παιδί του worksheet.
    out = out.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    const ps = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>';
    out = /<pageMargins[^>]*\/>/.test(out) ? out.replace(/(<pageMargins[^>]*\/>)/, '$1' + ps)
      : out.includes('<ignoredErrors') ? out.replace('<ignoredErrors', ps + '<ignoredErrors')
        : out.replace('</worksheet>', ps + '</worksheet>');
  }
  return out;
}

/** Τα bytes του βιβλίου, με όσα προσθέτει το `sheetFinish` γραμμένα μέσα. */
export function workbookBytes(wb: XLSX.WorkBook): Uint8Array {
  const raw = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
  const finishes = wb.SheetNames.map(n => (wb.Sheets[n] as Record<string, unknown>)['!finish'] as SheetFinish | undefined);
  if (!finishes.some(Boolean)) return raw;
  const zip = unzipSync(raw);
  // Το όνομα του φύλλου δεν λέει σε ποιο αρχείο γράφτηκε. Η διαδρομή είναι
  // workbook.xml (όνομα → rId) και rels (rId → αρχείο) — διαβασμένη και όχι
  // υποτεθειμένη, γιατί η σειρά των sheetN.xml δεν είναι εγγυημένη.
  const wbXml = strFromU8(zip['xl/workbook.xml']);
  const relsXml = strFromU8(zip['xl/_rels/workbook.xml.rels']);
  const target = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) target.set(m[1], m[2]);
  const fileOf = new Map<string, string>();
  for (const m of wbXml.matchAll(/<sheet name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const t = target.get(m[2]);
    if (t) fileOf.set(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'), `xl/${t.replace(/^\//, '')}`);
  }
  let touched = false;
  wb.SheetNames.forEach((name, i) => {
    const f = finishes[i], path = fileOf.get(name);
    if (!f || !path || !zip[path]) return;
    zip[path] = strToU8(applyFinish(strFromU8(zip[path]), f));
    touched = true;
  });
  return touched ? zipSync(zip) : raw;
}

// ═══ ΤΟ ΚΑΤΕΒΑΣΜΑ ΠΕΡΝΑ ΑΠΟ ΤΟ ΕΝΑ ΣΗΜΕΙΟ ════════════════════════════════
// Η `XLSX.writeFile` έχει δικό της μονοπάτι λήψης και ΔΕΝ καθαρίζει το όνομα.
// Ένα ακίνητο ονομασμένο «Αθήνα / Κολωνάκι» παρήγαγε όνομα με κάθετο μέσα του.
// Εδώ το αρχείο γράφεται σε μνήμη και κατεβαίνει από το `lib/core/download.ts`,
// που είναι η ΜΙΑ υλοποίηση λήψης της εφαρμογής.
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string): boolean {
  const bytes = workbookBytes(wb);
  const name = filename.replace(/\.xlsx$/i, '');
  return downloadFile(new Blob([bytes.slice().buffer], { type: XLSX_MIME }), `${safeFilename(name)}.xlsx`, XLSX_MIME);
}
