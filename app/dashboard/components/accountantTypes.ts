// ΧΩΡΙΣ ΤΗ ΒΙΒΛΙΟΘΗΚΗ ΤΟΥ EXCEL, ΚΑΙ ΓΙ' ΑΥΤΟ ΥΠΑΡΧΕΙ.
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΤΥΠΟΙ ΤΟΥ ΦΑΚΕΛΟΥ ΤΟΥ ΛΟΓΙΣΤΗ, ΚΑΙ Ο ΕΝΑΣ ΜΕΤΑΤΡΟΠΕΑΣ ΤΟΥΣ
// ─────────────────────────────────────────────────────────────────────────
// Οι τύποι σβήνονται στη μεταγλώττιση και δεν κοστίζουν τίποτα. Η `toMovement`
// όμως είναι πραγματική συνάρτηση: η καρτέλα Λογιστική τη χρησιμοποιεί για να
// μεταφράσει κάθε κίνηση του βιβλίου, σε κάθε απόδοση της οθόνης, χωρίς να
// εξάγει τίποτα. Οσο ζούσε μέσα στο `accountantExport.ts`, η μία αυτή γραμμή
// έφερνε μαζί της τα 2,5 MB της βιβλιοθήκης που γράφει αρχεία Excel.
// ═══════════════════════════════════════════════════════════════════════════

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
