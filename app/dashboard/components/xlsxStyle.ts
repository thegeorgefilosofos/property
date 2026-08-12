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
// ΤΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ. Το «πάγωμα» της γραμμής επικεφαλίδων
// (`ws['!freeze']`) ΔΕΝ υποστηρίζεται από την κοινοτική έκδοση της βιβλιοθήκης:
// η ιδιότητα δέχεται τιμή, δεν γράφεται όμως ποτέ στο αρχείο. Ήταν γραμμένη στο
// `portfolioXlsx.ts` και δεν έκανε τίποτα — νεκρός κώδικας που έμοιαζε με
// λειτουργία. Η επανάληψη επικεφαλίδων στην εκτύπωση, από κάτω, ΔΟΥΛΕΥΕΙ και
// λύνει το ίδιο πρόβλημα εκεί που πονάει. Η διάταξη της σελίδας γράφεται
// κατευθείαν στο XML του φύλλου, πιο κάτω (`sheetFinish`).
export const MARGINS = { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.3, footer: 0.3 } as const;

/** Οι γραμμές που επαναλαμβάνονται σε κάθε τυπωμένη σελίδα, ανά φύλλο. */
export function printTitles(wb: XLSX.WorkBook, sheetIndex: number, sheetName: string, row1: number) {
  const names = (wb.Workbook ||= {}).Names ||= [];
  names.push({ Name: '_xlnm.Print_Titles', Sheet: sheetIndex, Ref: `'${sheetName.replace(/'/g, "''")}'!$${row1}:$${row1}` });
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
  if (f.lists?.length) {
    const dv = validationsXml(f.lists);
    out = out.includes('<pageMargins') ? out.replace('<pageMargins', dv + '<pageMargins') : out.replace('</worksheet>', dv + '</worksheet>');
  }
  if (f.landscape) {
    // Το «σε μία σελίδα πλάτος» ισχύει μόνο αν το φύλλο το δηλώσει στο sheetPr,
    // που πρέπει να είναι το ΠΡΩΤΟ παιδί του worksheet.
    out = out.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    const ps = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>';
    out = /<pageMargins[^>]*\/>/.test(out) ? out.replace(/(<pageMargins[^>]*\/>)/, '$1' + ps) : out.replace('</worksheet>', ps + '</worksheet>');
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
