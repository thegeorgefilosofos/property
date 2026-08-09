// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΚΟΙΝΗ ΕΞΑΓΩΓΗ ΠΙΝΑΚΑ ΣΕ EXCEL, ΓΙΑ ΟΛΕΣ ΤΙΣ ΚΑΡΤΕΛΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΟΝΟΜΑ ΗΤΑΝ ΨΕΜΑ, ΚΑΙ ΤΟ ΨΕΜΑ ΕΙΧΕ ΔΙΠΛΟΤΥΠΟ. Η συνάρτηση λεγόταν
// `downloadCsv` και παρήγαγε .xlsx. Την ίδια στιγμή υπήρχε ΚΑΙ αληθινή
// `downloadCsv` στο `lib/core/download.ts`, που παράγει πραγματικό .csv. Οι δύο
// χρησιμοποιούνταν παράλληλα:
//
//     TabComparison.tsx   import { downloadCsv } from './exportCsv'        → .xlsx
//     TabInventory.tsx    import { downloadCsv } from '@/lib/core/download' → .csv
//
// Ίδια κλήση, ίδιο όνομα, άλλο αρχείο — και μόνο η γραμμή εισαγωγής το έλεγε.
// Εδώ λέγεται πια `downloadTableXlsx`: ό,τι κάνει.
//
// ΚΑΙ Η ΤΑΥΤΟΤΗΤΑ ΤΟΥ ΑΡΧΕΙΟΥ. Κάθε εξαγωγή είχε τίτλο «Property OS» και φύλλο
// «Δεδομένα» — και οι δεκαοκτώ. Ο λογιστής άνοιγε το αρχείο και διάβαζε το όνομα
// του ΠΡΟΜΗΘΕΥΤΗ, όχι τι κρατά στα χέρια του. Τώρα ο τίτλος λέει τι ΕΙΝΑΙ, ο
// υπότιτλος για ποιο ακίνητο και ποια περίοδο, και η σφραγίδα του εργαλείου
// μπαίνει στο τέλος του υπότιτλου, όπου ανήκει.
// ═══════════════════════════════════════════════════════════════════════════
import { downloadXlsx, type XlsxCol, type XlsxKind } from './exportXlsx';

/** Ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ. */
export const csvDate = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('el-GR');
};

// Τύπος στήλης από την επικεφαλίδα (για στοίχιση/μορφή). Συντηρητικό: «€» ή
// επικεφαλίδα που ΞΕΚΙΝΑ με λέξη ποσού → eur· «%»/«ποσοστ» → pct· «ημερομ» → date.
const kindFromHeader = (h: string): XlsxKind => {
  const s = (h || '').trim().toLowerCase();
  if (/%|ποσοστ/.test(s)) return 'pct';
  // ΤΟ «\b» ΣΤΟ ΤΕΛΟΣ ΑΚΥΡΩΝΕ ΟΛΟΚΛΗΡΟ ΤΟΝ ΚΑΝΟΝΑ. Είναι ASCII-only, οπότε
  // μετά από ελληνικό γράμμα δεν ταιριάζει ποτέ: η επικεφαλίδα «Ποσό» ή
  // «Ενοίκιο» δεν αναγνωριζόταν ως ευρώ και η στήλη έβγαινε ΚΕΙΜΕΝΟ. Στο Excel
  // αυτό σημαίνει ότι ο λογιστής δεν μπορεί να την αθροίσει — σε αρχείο που
  // υπάρχει ακριβώς για να πάει στον λογιστή. Δούλευε μόνο όταν η επικεφαλίδα
  // περιείχε το ίδιο το σύμβολο «€».
  if (/€/.test(s) || /^(?:ποσό|αξία|τιμή|κόστος|έσοδα|έξοδα|φόρος|ενοίκιο|οφειλή|εγγύηση|σύνολο|πληρωμή|υπόλοιπο|μίσθωμα|δαπάνη|εισόδημα)(?![\p{L}\p{N}])/u.test(s)) return 'eur';
  if (/ημερομην|ημ\/ν|^ημ\./.test(s)) return 'date';
  if (/^έτος$/.test(s)) return 'year';
  return 'text';
};

export interface TableExport {
  /** Τι είναι το αρχείο, στη γλώσσα του χρήστη: «Εισπράξεις ενοικίου». */
  title: string;
  /** Ακίνητο και περίοδος, ό,τι προσδιορίζει ΑΥΤΗ την εξαγωγή. Προαιρετικό. */
  subject?: string;
  headers: string[];
  rows: (string | number | Date | null | undefined)[][];
  /** Επιφυλάξεις που πρέπει να φτάσουν στον παραλήπτη μαζί με τα νούμερα. */
  notes?: string[];
}

/** Η σφραγίδα: ημερομηνία έκδοσης και το εργαλείο, διακριτικά, στο τέλος. */
function stamp(subject?: string): string {
  const issued = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return [subject, `Έκδοση ${issued}`, 'Property OS'].filter(Boolean).join(' · ');
}

/**
 * Κατεβάζει προσεγμένο .xlsx με ζωντανά αριθμητικά κελιά και γραμμή ΣΥΝΟΛΟ στις
 * στήλες ποσών. Το `filename` δίνεται ΧΩΡΙΣ κατάληξη.
 */
export function downloadTableXlsx(filename: string, t: TableExport): void {
  const columns: XlsxCol[] = t.headers.map(h => ({ header: h, kind: kindFromHeader(h) }));
  const rows = t.rows.map(r => t.headers.map((_, i) => { const v = r[i]; return v == null ? '' : v; }));
  // Άθροισμα μόνο εκεί που η στήλη ΕΧΕΙ αριθμούς: μια στήλη ποσών γεμάτη κείμενο
  // θα έβγαζε «0,00 €» κάτω από ορατά νούμερα, που είναι χειρότερο από κανένα σύνολο.
  const totalCols = columns
    .map((c, i) => (c.kind === 'eur' && rows.some(r => typeof r[i] === 'number') ? i : -1))
    .filter(i => i >= 0);

  downloadXlsx(filename.replace(/\.(csv|xlsx)$/i, ''), [{
    name: t.title, title: t.title, subtitle: stamp(t.subject),
    columns, rows, totalCols, notes: t.notes,
  }]);
}
