// ΧΩΡΙΣ 'use client' ΚΑΙ ΧΩΡΙΣ ΤΗ ΒΙΒΛΙΟΘΗΚΗ ΤΟΥ EXCEL.
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΟΙΝΟ ΛΟΓΙΣΤΙΚΟ ΣΤΥΛ, ΞΕΧΩΡΙΣΤΑ ΑΠΟ ΤΟΝ ΜΗΧΑΝΙΣΜΟ ΠΟΥ ΓΡΑΦΕΙ ΤΟ ΑΡΧΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ, ΚΑΙ ΓΙΑΤΙ ΧΩΡΙΣΤΗΚΕ. Το `xlsxStyle.ts` εισάγει ΣΤΑΤΙΚΑ τη
// βιβλιοθήκη `xlsx-js-style`: 2,5 MB μεταγλωττισμένου JavaScript. Τρεις οθόνες
// του πίνακα —Σύγκριση, Αρχείο, Υπολογιστής δανείου— το εισήγαγαν ολόκληρο για
// να πάρουν τη `money()`, μια συνάρτηση που μετατρέπει αριθμό σε «1.234,56 €»
// και δεν αγγίζει τίποτα άλλο.
//
// Η αρχική φόρτωση του πίνακα ήταν 4,21 MB, από τα οποία 3,0 MB ήταν αυτό το
// ένα κομμάτι. Σε ελληνικό 4G αυτό είναι δευτερόλεπτα λευκής οθόνης, σε κάθε
// επίσκεψη, για κάθε χρήστη — και οι περισσότεροι δεν εξάγουν ποτέ τίποτα.
//
// ΕΔΩ ΖΕΙ Ο,ΤΙ ΕΙΝΑΙ ΚΑΘΑΡΗ ΜΟΡΦΟΠΟΙΗΣΗ: μορφές αριθμών, στυλ κελιών, ύψη
// γραμμών, περιθώρια εκτύπωσης, ονόματα φύλλων. Καμία γραμμή δεν καλεί τη
// βιβλιοθήκη. Ο,τι ΤΗΝ καλεί έμεινε στο `xlsxStyle.ts`, που πλέον φορτώνεται
// μόνο όταν κάποιος πατήσει «Εξαγωγή».
// ═══════════════════════════════════════════════════════════════════════════
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
// 28 τις χωρά και είναι το ίδιο παντού.
// Το «titleMark» είναι η γραμμή τίτλου όταν κουβαλά και το σήμα: 34 σημεία
// είναι 45 εικονοστοιχεία και το σήμα πιάνει 40 με 3 από πάνω.
export const ROW = { title: 22, titleMark: 34, sub: 15, head: 28, data: 16 } as const;

/**
 * Η εσοχή που αφήνει τόπο στο σήμα, στη ζώνη τίτλου.
 *
 * ΓΙΑΤΙ ΕΣΟΧΗ ΚΑΙ ΟΧΙ ΑΓΚΥΡΩΣΗ ΔΕΞΙΑ. Η εικόνα σε φύλλο Excel αιωρείται πάνω
 * από τα κελιά: δεν σπρώχνει τίποτα. Αγκυρωμένη πάνω αριστερά θα καθόταν πάνω
 * στα γράμματα του τίτλου. Αγκυρωμένη δεξιά θα εξαρτιόταν από το πλάτος της
 * τελευταίας στήλης, που αλλάζει με το περιεχόμενο. Η εσοχή μετριέται σε
 * χαρακτήρες της κανονικής γραμματοσειράς και είναι η μόνη ντετερμινιστική
 * απάντηση: επτά χαρακτήρες αφήνουν περίπου 49 εικονοστοιχεία, το σήμα πιάνει
 * 43 μαζί με το περιθώριό του.
 */
export const MARK_INDENT = 7;

/** Το ίδιο στυλ, με τόπο για το σήμα στα αριστερά του. */
export const withMark = <T extends { alignment?: Record<string, unknown> }>(style: T): T => ({
  ...style,
  alignment: { ...(style.alignment || {}), horizontal: 'left', indent: MARK_INDENT },
});

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
