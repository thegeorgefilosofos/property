// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΗΤΡΩΟ ΤΥΠΩΝ ΠΑΡΑΣΤΑΤΙΚΩΝ ΤΗΣ ΑΑΔΕ, ΑΝΤΙΓΡΑΜΜΕΝΟ ΚΑΙ ΟΧΙ ΘΥΜΗΜΕΝΟ
// ─────────────────────────────────────────────────────────────────────────
// ΠΗΓΗ: «Συνδυασμοί Χαρακτηρισμών v1.0.4» της ΑΑΔΕ, ένα φύλλο ανά τύπο. Οι
// τίτλοι είναι αυτούσιοι από την πρώτη γραμμή κάθε φύλλου, με τα πεζοκεφαλαία
// που έχει το ίδιο το αρχείο — δεν «διορθώθηκαν», γιατί έτσι τους αναζητά
// όποιος ανοίξει τον επίσημο πίνακα δίπλα.
//
// ΤΙ ΕΙΝΑΙ ΑΥΤΟ, ΚΑΙ ΤΙ ΔΕΝ ΕΙΝΑΙ. Είναι ΑΝΑΦΟΡΑ: ποιοι τύποι υπάρχουν και
// ποιους χαρακτηρισμούς δέχεται ο καθένας. Δεν αποφασίζει τι εκδίδει ο χρήστης
// — αυτό εξαρτάται από τη δραστηριότητα και το κρίνει ο λογιστής. Η εφαρμογή
// παράγει υποδείξεις μόνο για τους τύπους 14.x (λήψεις από το εξωτερικό), όπου
// υπόχρεος διαβίβασης είναι ο ΛΗΠΤΗΣ και ο κανόνας βγαίνει από τα δεδομένα.
//
// ΟΙ ΚΩΔΙΚΟΙ ΜΕΝΟΥΝ ΚΩΔΙΚΟΙ. Τα ονόματα των κατηγοριών ΕΣΟΔΩΝ (category1_x) δεν
// υπάρχουν σε αυτό το αρχείο και δεν έχουν διαβαστεί αλλού: γράφονται όπως τα
// γράφει η ΑΑΔΕ, χωρίς ελληνική απόδοση που θα ήταν δική μας εικασία.
//
// ΕΝΑ ΤΥΠΟΓΡΑΦΙΚΟ ΤΗΣ ΠΗΓΗΣ, ΔΙΟΡΘΩΜΕΝΟ ΡΗΤΑ: το φύλλο 1.5 γράφει «catΕgory2_3»
// με ελληνικό «Ε». Αντιγραμμένο αυτούσιο, θα ταξίδευε ως άγνωστος κωδικός σε
// κάθε σύγκριση. Κανονικοποιείται σε λατινικό, και το τεστ το επιβάλλει.
// ═══════════════════════════════════════════════════════════════════════════

export interface AadeDocType {
  /** Ο τίτλος όπως τον γράφει η ΑΑΔΕ. */
  title: string;
  /** Χαρακτηρισμοί εσόδων που δέχεται ο τύπος (κωδικοί ΑΑΔΕ). */
  income: readonly string[];
  /** Χαρακτηρισμοί εξόδων που δέχεται ο τύπος (κωδικοί ΑΑΔΕ). */
  expense: readonly string[];
}

export const AADE_DOC_TYPES: Record<string, AadeDocType> = {
  '1.1': { title: 'ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '1.2': { title: 'Τιμολόγιο Πώλησης / Ενδοκοινοτικές Παραδόσεις', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '1.3': { title: 'Τιμολόγιο Πώλησης / Παραδόσεις Τρίτων Χωρών', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '1.4': { title: 'Τιμολόγιο Πώλησης / Πώληση για Λογαριασμό Τρίτων', income: ['category1_7', 'category1_95'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '1.5': { title: 'Τιμολόγιο Εκκαθάρισης', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_8', 'category1_9'], expense: ['category2_3', 'category2_4', 'category2_5', 'category2_9', 'category2_10', 'category2_11'] },
  '1.6': { title: 'Τιμολόγιο Πώλησης / Συμπληρωματικό Παραστατικό', income: [], expense: [] },
  '2.1': { title: 'Τιμολόγιο Παροχής', income: ['category1_3', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '2.2': { title: 'Τιμολόγιο Παροχής / Ενδοκοινοτική Παροχή Υπηρεσιών', income: ['category1_3', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '2.3': { title: 'Τιμολόγιο Παροχής / Παροχή Υπηρεσιών Τρίτων Χωρών', income: ['category1_3', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '2.4': { title: 'Τιμολόγιο Παροχής / Συμπληρωματικό Παραστατικό', income: [], expense: [] },
  '3.1': { title: 'Τίτλος Κτήσης (μη υπόχρεος Εκδότης)', income: ['category1_3'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '3.2': { title: 'Τίτλος Κτήσης (άρνηση έκδοσης από υπόχρεο Εκδότη)', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '5.1': { title: 'Πιστωτικό Τιμολόγιο / Συσχετιζόμενο', income: [], expense: [] },
  '5.2': { title: 'Πιστωτικό Τιμολόγιο / Μη Συσχετιζόμενο', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_9', 'category2_10', 'category2_11', 'category2_95'] },
  '6.1': { title: 'Στοιχείο Αυτοπαράδοσης', income: ['category1_6', 'category1_95'], expense: [] },
  '6.2': { title: 'Στοιχείο Ιδιοχρησιμοποίησης', income: ['category1_6', 'category1_95'], expense: [] },
  '7.1': { title: 'Συμβόλαιο - Έσοδο', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '8.1': { title: 'Ενοίκια - Έσοδο', income: ['category1_3', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: ['category2_4', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '8.2': { title: 'Ειδικό Στοιχείο – Απόδειξης Είσπραξης Φόρου Διαμονής', income: ['category1_7', 'category1_95'], expense: ['category2_4', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '11.1': { title: 'ΑΛΠ (Απόδειξη Λιανικής Πώλησης)', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '11.2': { title: 'ΑΠΥ (Απόδειξη Παροχής Υπηρεσιών)', income: ['category1_3', 'category1_5', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '11.3': { title: 'Απλοποιημένο Τιμολόγιο', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '11.4': { title: 'Πιστωτικό Στοιχείο Λιανικής', income: ['category1_1', 'category1_2', 'category1_3', 'category1_4', 'category1_5', 'category1_7', 'category1_8', 'category1_9', 'category1_95'], expense: [] },
  '11.5': { title: 'ΑΛΠ / Πώληση για Λογαριασμό Τρίτων', income: ['category1_7', 'category1_95'], expense: [] },
  '13.1': { title: 'Έξοδα - Αγορές Λιανικών Συναλλαγών ημεδαπής / αλλοδαπής', income: [], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '13.2': { title: 'Παροχή Λιανικών Συναλλαγών ημεδαπής / αλλοδαπής', income: [], expense: ['category2_3', 'category2_4', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '13.3': { title: 'Κοινόχρηστα', income: [], expense: ['category2_3', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '13.4': { title: 'Συνδρομές', income: [], expense: ['category2_3', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '13.30': { title: 'Παραστατικά Οντότητας ως Αναγράφονται από την ίδια (Δυναμικό)', income: [], expense: ['category2_3', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '13.31': { title: 'Πιστωτικό Στοιχείο Λιανικής ημεδαπής / αλλοδαπής', income: [], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '14.1': { title: 'Τιμολόγιο / Ενδοκοινοτικές Αποκτήσεις', income: [], expense: ['category2_1', 'category2_2', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '14.2': { title: 'Τιμολόγιο / Ενδοκοινοτικές Αποκτήσεις', income: [], expense: ['category2_1', 'category2_2', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '14.3': { title: 'Τιμολόγιο / Ενδοκοινοτική Λήψη Υπηρεσιών', income: [], expense: ['category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '14.4': { title: 'Τιμολόγιο / Λήψη Υπηρεσιών Τρίτων Χωρών', income: [], expense: ['category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '14.5': { title: 'ΕΦΚΑ και λοιποί Ασφαλιστικοί Οργανισμοί', income: [], expense: ['category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '14.30': { title: 'Παραστατικά Οντότητας ως Αναγράφονται από την ίδια (Δυναμικό)', income: [], expense: ['category2_3', 'category2_4', 'category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '14.31': { title: 'Πιστωτικό ημεδαπής / αλλοδαπής', income: [], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_4', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '15.1': { title: 'Συμβόλαιο - Έξοδο', income: [], expense: ['category2_1', 'category2_2', 'category2_3', 'category2_5', 'category2_7', 'category2_10', 'category2_11', 'category2_95'] },
  '16.1': { title: 'Ενοίκια - Έξοδο', income: [], expense: ['category2_5', 'category2_10', 'category2_11', 'category2_95'] },
  '17.1': { title: 'Μισθοδοσία', income: [], expense: ['category2_6', 'category2_95'] },
  '17.2': { title: 'Αποσβέσεις', income: [], expense: ['category2_8', 'category2_95'] },
  '17.3': { title: 'Λοιπές Εγγραφές Τακτοποίησης Εσόδων - Λογιστική Βάση', income: ['category1_8', 'category1_9', 'category1_10', 'category1_95'], expense: ['category2_95'] },
  '17.4': { title: 'Λοιπές Εγγραφές Τακτοποίησης Εσόδων - Φορολογική Βάση', income: ['category1_10', 'category1_95'], expense: [] },
  '17.5': { title: 'Λοιπές Εγγραφές Τακτοποίησης Εξόδων - Λογιστική Βάση', income: [], expense: ['category2_10', 'category2_11', 'category2_12', 'category2_13', 'category2_14', 'category2_95'] },
  '17.6': { title: 'Λοιπές Εγγραφές Τακτοποίησης Εξόδων - Φορολογική Βάση', income: ['category2_12', 'category2_95'], expense: ['category2_12', 'category2_95'] },
};

/** Οι τύποι που δέχονται χαρακτηρισμό ΕΣΟΔΩΝ, στη σειρά του πίνακα. */
export function incomeDocTypes(): string[] {
  return Object.keys(AADE_DOC_TYPES).filter(id => AADE_DOC_TYPES[id].income.length > 0);
}

/** Οι τύποι που δέχονται χαρακτηρισμό ΕΞΟΔΩΝ, στη σειρά του πίνακα. */
export function expenseDocTypes(): string[] {
  return Object.keys(AADE_DOC_TYPES).filter(id => AADE_DOC_TYPES[id].expense.length > 0);
}
