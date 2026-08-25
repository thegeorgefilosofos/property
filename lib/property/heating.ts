// ═══════════════════════════════════════════════════════════════════════════
// Ο ΤΥΠΟΣ ΘΕΡΜΑΝΣΗΣ: ΕΝΑ ΛΕΞΙΛΟΓΙΟ, ΜΙΑ ΑΠΑΝΤΗΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΙΣΧΥΕ, ΚΑΙ ΓΙΑΤΙ ΗΤΑΝ ΣΦΑΛΜΑ ΚΑΙ ΟΧΙ ΑΠΛΩΣ ΕΠΑΝΑΛΗΨΗ. Τρεις οθόνες
// ρωτούσαν «τι θέρμανση έχει το ακίνητο», με ΤΡΙΑ διαφορετικά σύνολα τιμών και
// τις έγραφαν σε ΤΡΙΑ διαφορετικά σημεία:
//
//   · ο οδηγός νέου ακινήτου  → `user_properties.heating`, 9 τιμές
//     (central_gas, autonomous_gas, oil, heat_pump, electric, pellet, ac_only…)
//   · η καρτέλα «Πάροχοι»      → ρυθμίσεις ενότητας «providers», ΑΛΛΕΣ 9 τιμές
//     (autonomous_oil, autonomous_heat_pump, autonomous_ac, central_oil…)
//   · η καρτέλα «Αέριο»        → ρυθμίσεις ενότητας «gas», 3 τιμές
//     (autonomous_gas, central_gas, combi)
//
// Ο χρήστης έβλεπε δύο μενού «Τύπος θέρμανσης» στην ΙΔΙΑ οθόνη να λένε άλλα:
// «Αυτόνομη θέρμανση αερίου» πάνω, «Αυτόνομη Φυσικού Αερίου» πενήντα
// εικονοστοιχεία πιο κάτω. Αλλάζοντας το ένα, το άλλο δεν κουνιόταν.
//
// ΚΑΙ ΕΝΑ ΤΡΙΤΟ, ΑΟΡΑΤΟ. Η καρτέλα «Αέριο» αντέγραφε τη ΔΙΚΗ ΤΗΣ τιμή στο
// `user_properties.heating`. Ο χρήστης που διάλεγε «Συνδυαστικό» έγραφε `combi`
// σε στήλη που κανένας κατάλογος ετικετών δεν γνωρίζει: η καρτέλα του ακινήτου
// τύπωνε «Θέρμανση: combi».
//
// ── ΠΟΥ ΖΕΙ ΤΩΡΑ ────────────────────────────────────────────────────────
// Στο ίδιο το ακίνητο (`user_properties.heating`), γιατί εκεί ανήκει: είναι
// ιδιότητα του κτιρίου, όχι ρύθμιση μιας καρτέλας. Ρωτιέται μία φορά στον οδηγό
// και διορθώνεται σε ένα σημείο.
//
// ── ΤΑ ΠΑΛΙΑ ΚΛΕΙΔΙΑ ΔΕΝ ΠΕΤΙΟΥΝΤΑΙ ────────────────────────────────────
// Οποιος απάντησε ήδη, απάντησε. Το `normalizeHeating` μεταφράζει ό,τι έγραψαν
// οι τρεις παλιές οθόνες στο κανονικό κλειδί, ώστε καμία απάντηση να μη χαθεί
// και καμία οθόνη να μη δείξει ωμό κλειδί.
// ═══════════════════════════════════════════════════════════════════════════

export interface HeatingOption { value: string; label: string }

/**
 * Ο ΚΑΤΑΛΟΓΟΣ. Η σειρά είναι η συχνότητα στην ελληνική πολυκατοικία, όχι
 * αλφαβητική: ο χρήστης βρίσκει τη δική του στις τρεις πρώτες γραμμές.
 *
 * Οι ετικέτες γράφονται «Αυτόνομη, φυσικό αέριο» και όχι «Αυτόνομη Φυσικού
 * Αερίου»: κεφαλαία στη μέση της φράσης δεν είναι ελληνική ορθογραφία.
 */
export const HEATING_TYPES: readonly HeatingOption[] = [
  { value: 'autonomous_gas', label: 'Αυτόνομη, φυσικό αέριο' },
  { value: 'central_gas',    label: 'Κεντρική, φυσικό αέριο' },
  { value: 'autonomous_oil', label: 'Αυτόνομη, πετρέλαιο' },
  { value: 'central_oil',    label: 'Κεντρική, πετρέλαιο' },
  { value: 'heat_pump',      label: 'Αντλία θερμότητας' },
  { value: 'ac_only',        label: 'Κλιματιστικά' },
  { value: 'electric',       label: 'Ηλεκτρική' },
  { value: 'pellet',         label: 'Pellet ή ξύλα' },
  { value: 'district',       label: 'Τηλεθέρμανση' },
  { value: 'none',           label: 'Χωρίς θέρμανση' },
];

const BY_VALUE = new Map(HEATING_TYPES.map(h => [h.value, h.label]));

/**
 * Τα κλειδιά που έγραψαν οι παλιές οθόνες, στο κανονικό.
 *
 * Το `combi` («αέριο και άλλη πηγή») γίνεται `autonomous_gas`: το ακίνητο έχει
 * αυτόνομο αέριο και η δεύτερη πηγή δεν ήταν ποτέ γραμμένη πουθενά ώστε να
 * σωθεί. Το `other` δεν αντιστοιχίζεται σε τίποτα, γιατί δεν σημαίνει τίποτα.
 */
const LEGACY: Record<string, string> = {
  oil: 'autonomous_oil',
  autonomous_heat_pump: 'heat_pump',
  autonomous_ac: 'ac_only',
  autonomous_pellet: 'pellet',
  autonomous_wood: 'pellet',
  combi: 'autonomous_gas',
};

/** Κανονικό κλειδί, ή κενό όταν δεν έχει απαντηθεί. Ποτέ ωμό άγνωστο κλειδί. */
export function normalizeHeating(v: string | null | undefined): string {
  const raw = (v || '').trim();
  if (!raw) return '';
  if (BY_VALUE.has(raw)) return raw;
  return LEGACY[raw] ?? '';
}

/** Η ετικέτα που βλέπει ο χρήστης. Κενή όταν δεν ξέρουμε: δεν μαντεύουμε. */
export function heatingLabel(v: string | null | undefined): string {
  return BY_VALUE.get(normalizeHeating(v)) ?? '';
}

/** Καίει φυσικό αέριο; Το ρωτά η καρτέλα του αερίου για να δώσει συμβουλή. */
export const usesGas = (v: string | null | undefined): boolean => {
  const k = normalizeHeating(v);
  return k === 'autonomous_gas' || k === 'central_gas';
};

/** Κοινόχρηστη εγκατάσταση, δηλαδή με μερίδιο συνιδιοκτησίας. */
export const isCentralHeating = (v: string | null | undefined): boolean => {
  const k = normalizeHeating(v);
  return k === 'central_gas' || k === 'central_oil' || k === 'district';
};
