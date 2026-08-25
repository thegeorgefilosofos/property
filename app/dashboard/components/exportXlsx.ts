// ΧΩΡΙΣ 'use client': δεν είναι component, είναι καθαρές συναρτήσεις που
// τρέχουν στον περιηγητή. Η οδηγία σημαδεύει ΣΥΝΟΡΟ πελάτη· βάζοντάς τη σε
// module τιμών, όποιος το εισάγει από μονοπάτι server παίρνει `undefined` αντί
// για τις συναρτήσεις. Μπαίνει ούτως ή άλλως στο πακέτο του πελάτη, αφού μόνο
// client components το εισάγουν.
// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΞΑΓΩΓΗ ΣΕ EXCEL — ΕΝΑ ΑΡΧΕΙΟ, ΟΧΙ ΔΥΟ ΠΑΡΑΛΛΑΓΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Υπήρχαν δύο τρόποι εξαγωγής, με κουμπί που ζητούσε από
// τον χρήστη να διαλέξει:
//
//   «Μορφοποιημένο»          τα ποσά γράφονταν ως ΚΕΙΜΕΝΟ, «1.234,56 €»
//   «Επεξεργάσιμο (δεδομένα)» τα ποσά ως αριθμοί, με γραμμή ΣΥΝΟΛΟ
//
// Το πρώτο παρήγαγε φύλλο που ΔΕΝ αθροίζεται. Ο λογιστής επιλέγει τη στήλη και
// το Excel δείχνει «Άθροισμα: 0» — κάθε κελί είναι συμβολοσειρά, με το πράσινο
// τριγωνάκι «αριθμός αποθηκευμένος ως κείμενο» σε κάθε γραμμή. Ήταν η ΠΡΟΕΠΙΛΟΓΗ,
// άρα ό,τι πάρει ο λογιστής, αν δεν ανοίξει το βοηθητικό μενού, δεν αθροίζεται.
//
// ΚΑΙ ΤΟ ΔΕΥΤΕΡΟ ΔΕΝ ΔΟΥΛΕΥΕ ΠΑΝΤΟΥ. Οι καλούντες που περνούσαν τα ποσά από τον
// βοηθό `csvEur()` έστελναν ήδη ΣΥΜΒΟΛΟΣΕΙΡΑ. Ο έλεγχος εδώ είναι
// `typeof raw === 'number'`, οπότε η αριθμητική διαδρομή δεν εκτελούνταν ποτέ —
// και η γραμμή ΣΥΝΟΛΟ, που αθροίζει μόνο αριθμούς, έβγαζε «0,00 €» κάτω από
// στήλη γεμάτη ποσά. Πίνακας χρεολυσίων, κατάλογος μισθωτών, απογραφή: και τα
// τρία εξήγαν σύνολο μηδέν.
//
// Η ΑΠΟΦΑΣΗ. Ένα αρχείο, με ΑΡΙΘΜΟΥΣ. Η ελληνική εμφάνιση («1.234,56 €») έρχεται
// από τη μορφή κελιού `[$-408]`, όχι από συμβολοσειρά — δηλαδή το κελί ΚΑΙ
// φαίνεται σωστά ΚΑΙ αθροίζεται, ταξινομείται, μπαίνει σε συγκεντρωτικό πίνακα.
// Αυτό κάνει κάθε επαγγελματικό λογιστικό πρόγραμμα. Το κουμπί επιλογής έφυγε:
// δεν είναι επιλογή του χρήστη το αν το αρχείο του είναι σωστό.
//
// Κάθε φύλλο: τίτλος + υπότιτλος, έντονες αναδιπλωμένες επικεφαλίδες σε γκρι
// φόντο, πλαίσια, στοίχιση ανά τύπο, γραμμή ΣΥΝΟΛΟ με ζωντανό SUM, AutoFilter,
// περιθώρια εκτύπωσης και επανάληψη επικεφαλίδων σε κάθε σελίδα.
// ═══════════════════════════════════════════════════════════════════════════
import { XLSX, setCell, downloadWorkbook, printTitles, sheetFinish } from './xlsxStyle';
import { FMT, S, withMark, sheetName, MARGINS, type Cell } from './sheetFormat';

export type XlsxKind = 'text' | 'date' | 'eur' | 'int' | 'year' | 'pct' | 'num';
export type XlsxCol = { header: string; width?: number; kind?: XlsxKind };
export type XlsxCell = string | number | Date | null | undefined;
export type XlsxSheet = {
  name: string;
  columns: XlsxCol[];
  rows: XlsxCell[][];
  title?: string;
  subtitle?: string;
  /** Δείκτες αριθμητικών στηλών που αθροίζονται σε γραμμή ΣΥΝΟΛΟ (π.χ. Ποσό). */
  totalCols?: number[];
  /**
   * Επιφυλάξεις που ταξιδεύουν ΜΑΖΙ με τα νούμερα, κάτω από τον πίνακα.
   *
   * ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΑ ΚΑΙ ΟΧΙ ΩΣ ΓΡΑΜΜΕΣ. Το `TabComparison` έσπρωχνε τις
   * προειδοποιήσεις μέσα στα δεδομένα, σαν γραμμές με ένα κελί. Έμπαιναν στο
   * εύρος του φίλτρου, μετριόνταν ως εγγραφές και ταξινομώντας τη στήλη
   * «Ακίνητο» η προειδοποίηση προσγειωνόταν στη μέση του πίνακα. Εδώ κάθονται
   * κάτω από το σύνολο, ενωμένες σε πλάτος σελίδας, όπου διαβάζονται.
   */
  notes?: string[];
};

const RIGHT = new Set<XlsxKind>(['eur', 'int', 'num', 'pct']);
const CENTER = new Set<XlsxKind>(['date', 'year']);
// Στυλ κειμένου ανά στοίχιση (κρατά πλαίσια/γραμματοσειρά του κοινού στυλ).
const txtLeft = S.txt;
const txtCenter = { ...S.txt, alignment: { horizontal: 'center', vertical: 'center' } };
const totLeft = S.totTxt, totRight = S.totNum;

/** Η μορφή κελιού ανά τύπο στήλης. Ελληνική εμφάνιση, αριθμητική ουσία. */
const FORMAT: Record<XlsxKind, string | undefined> = {
  eur: FMT.eur, num: FMT.dec2, pct: FMT.pct, int: FMT.int,
  date: FMT.date, year: undefined, text: undefined,
};

// ── ΠΛΑΤΟΣ ΣΤΗΛΗΣ ΑΠΟ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ, ΟΧΙ ΜΟΝΟ ΑΠΟ ΤΗΝ ΕΠΙΚΕΦΑΛΙΔΑ ────────
// Πριν, το πλάτος έβγαινε από το μήκος της επικεφαλίδας. Η στήλη «Ακίνητο»
// έπαιρνε δέκα χαρακτήρες και το «Διαμέρισμα Κολωνάκι, 3ος όροφος» κοβόταν στην
// οθόνη — ο παραλήπτης βλέπει «####» ή μισό όνομα και νομίζει ότι λείπουν
// δεδομένα. Το ταβάνι υπάρχει για να μη γίνει μια στήλη σημειώσεων ολόκληρη
// σελίδα.
const WIDTH_MIN = 10, WIDTH_MAX = 46;
function columnWidth(col: XlsxCol, values: XlsxCell[]): number {
  if (col.width) return col.width;
  let widest = col.header.length;
  for (const v of values) {
    if (v == null) continue;
    const len = v instanceof Date ? 10 : typeof v === 'number' ? Math.max(9, String(Math.trunc(v)).length + 6) : String(v).length;
    if (len > widest) widest = len;
  }
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, widest + 3));
}

/**
 * Κατεβάζει ένα προσεγμένο .xlsx με ΖΩΝΤΑΝΑ αριθμητικά κελιά: ο παραλήπτης
 * αθροίζει, ταξινομεί και φτιάχνει συγκεντρωτικούς πίνακες χωρίς μετατροπές.
 */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  for (const sh of sheets) {
    const NC = sh.columns.length;
    const hasHead = !!sh.title;
    const HR = hasHead ? 3 : 0;               // γραμμή επικεφαλίδων
    const header = sh.columns.map(c => c.header);
    const aoa: XlsxCell[][] = [];
    if (hasHead) { aoa.push([sh.title!], [sh.subtitle || ''], []); }
    aoa.push(header, ...sh.rows);

    const totals = (sh.totalCols || []).length > 0 && sh.rows.length > 0;
    const lastData = HR + sh.rows.length;     // τελευταία γραμμή δεδομένων (0-based)
    const totalR = lastData + 1;
    if (totals) {
      const totRow: XlsxCell[] = Array(NC).fill('');
      totRow[0] = 'ΣΥΝΟΛΟ';
      aoa.push(totRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = sh.columns.map((c, i) => ({ wch: columnWidth(c, sh.rows.map(r => r[i])) }));
    ws['!rows'] = [];
    ws['!margins'] = { ...MARGINS };
    const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

    // Τίτλος / υπότιτλος (merged) + ύψη.
    if (hasHead) {
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: NC - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } },
      ];
      // ΤΟ ΣΗΜΑ ΜΕΝΕΙ ΜΕΣΑ ΣΤΗ ΓΡΑΜΜΗ ΤΟΥ ΤΙΤΛΟΥ ΚΑΙ ΜΟΝΟ.
      //
      // Πρώτη γραφή: σήμα ύψους 40 πάνω από ΔΥΟ γραμμές, με εσοχή και στις δύο.
      // Μετρημένο σε τυπωμένη σελίδα: ο υπότιτλος «Ερμού 12, Αθήνα · Εκδοση
      // 25/08/2026 · PROPERWISE» βγήκε «… · PROP». Η ζώνη είναι ενωμένα κελιά
      // και κόβει ό,τι περισσεύει· η εσοχή του έφαγε ακριβώς όσο χρειαζόταν το
      // τέλος του. Σε πίνακα τριών στηλών αυτό συμβαίνει πάντα.
      //
      // Τώρα η πρώτη γραμμή ψηλώνει στα 34 σημεία και χωρά ολόκληρο το σήμα.
      // Ο υπότιτλος μένει σε ΟΛΟ το πλάτος, χωρίς εσοχή: το σήμα δεν φτάνει ώς
      // εκεί, οπότε δεν έχει λόγο να του κάνει τόπο.
      ws['!rows'][0] = { hpt: 34 }; ws['!rows'][1] = { hpt: 15 };
      setCell(ws, 0, 0, { s: withMark(S.title) });
      setCell(ws, 1, 0, { s: S.sub });
      sheetFinish(ws, { brandMark: true });
    }

    // Επικεφαλίδες.
    ws['!rows'][HR] = { hpt: 28 };
    for (let c = 0; c < NC; c++) setCell(ws, HR, c, { s: S.head });

    // Δεδομένα — αριθμοί ως αριθμοί, με ελληνική μορφή κελιού.
    for (let R = HR + 1; R <= lastData; R++) {
      ws['!rows'][R] = { hpt: 16 };
      for (let c = 0; c < NC; c++) {
        const kind = (sh.columns[c]?.kind || 'text') as XlsxKind;
        const cell = ws[enc(R, c)] as Cell | undefined;
        const raw = cell?.v;
        if (kind === 'date' && raw instanceof Date) setCell(ws, R, c, { s: txtCenter, t: 'd', z: FMT.date });
        else if (typeof raw === 'number' && FORMAT[kind] && kind !== 'date') setCell(ws, R, c, { t: 'n', z: FORMAT[kind], s: S.num });
        else if (kind === 'year') setCell(ws, R, c, { v: String(raw ?? ''), t: 's', s: txtCenter });
        else setCell(ws, R, c, { s: RIGHT.has(kind) ? S.num : CENTER.has(kind) ? txtCenter : txtLeft });
      }
    }

    // Γραμμή ΣΥΝΟΛΟ — ζωντανός τύπος SUM, με cached τιμή για προβολείς που δεν
    // επανυπολογίζουν.
    if (totals) {
      const totSet = new Set(sh.totalCols);
      const firstDataRow1 = HR + 2;        // 1-based: πρώτη γραμμή δεδομένων
      const lastDataRow1 = lastData + 1;   // 1-based: τελευταία γραμμή δεδομένων
      for (let c = 0; c < NC; c++) {
        if (totSet.has(c)) {
          const sum = sh.rows.reduce((acc, row) => acc + (typeof row[c] === 'number' ? (row[c] as number) : 0), 0);
          const k = (sh.columns[c]?.kind || 'eur') as XlsxKind;
          const col = XLSX.utils.encode_col(c);
          setCell(ws, totalR, c, {
            t: 'n', v: Math.round(sum * 100) / 100,
            f: `SUM(${col}${firstDataRow1}:${col}${lastDataRow1})`,
            z: FORMAT[k] || FMT.eur, s: totRight,
          });
        } else {
          setCell(ws, totalR, c, { s: totLeft });
        }
      }
      ws['!rows'][totalR] = { hpt: 17 };
    }

    // AutoFilter στον πίνακα (από επικεφαλίδες έως τελευταία γραμμή δεδομένων).
    if (sh.rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: HR, c: 0 }, e: { r: lastData, c: NC - 1 } }) };

    // Επιφυλάξεις, κάτω από τον πίνακα και έξω από το εύρος του.
    const notes = (sh.notes || []).filter(n => n && n.trim());
    if (notes.length) {
      let R = (totals ? totalR : lastData) + 2;
      ws['!merges'] = ws['!merges'] || [];
      for (const note of notes) {
        setCell(ws, R, 0, { v: note, t: 's', s: S.sub });
        ws['!merges'].push({ s: { r: R, c: 0 }, e: { r: R, c: NC - 1 } });
        ws['!rows'][R] = { hpt: 14 };
        R++;
      }
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: R - 1, c: NC - 1 } });
    }

    const name = sheetName(sh.name, used);
    XLSX.utils.book_append_sheet(wb, ws, name);
    // Η γραμμή επικεφαλίδων επαναλαμβάνεται σε κάθε τυπωμένη σελίδα.
    printTitles(wb, wb.SheetNames.length - 1, name, HR + 1);
  }

  downloadWorkbook(wb, filename);
}
