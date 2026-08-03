// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΤΑΣΤΑΣΗ ΤΟΥ ΑΚΙΝΗΤΟΥ, ΜΙΑ ΦΟΡΑ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ
// Το ίδιο πράγμα περιγραφόταν από ΔΥΟ στήλες που μπορούσαν να διαφωνήσουν:
//   • status_detail: 'rented' | 'seasonal' | 'vacant' | ...
//   • rental_mode:   'long_term' | 'short_term' | null
// Τίποτα δεν εγγυόταν ότι συμφωνούν. Ακίνητο μπορούσε να είναι 'rented' με
// rental_mode 'short_term', ή 'seasonal' χωρίς mode. Κάθε οθόνη έλυνε μόνη της
// τη διαφωνία, με άλλον κανόνα: κάπου γραφόταν
// `rental_mode==='short_term' || status_detail==='seasonal'`, αλλού μόνο το ένα.
//
// Ο χρήστης δεν βλέπει στήλες. Βλέπει «τι κάνω με αυτό το σπίτι». Η απάντηση
// είναι ΜΙΑ, και ζει εδώ.
//
// ΓΙΑΤΙ ΔΕΝ ΑΛΛΑΖΕΙ Η ΒΑΣΗ
// Οι δύο στήλες μένουν όπως είναι και γράφονται ΠΑΝΤΑ μαζί, από ένα σημείο.
// Καμία μετάπτωση, καμία απώλεια, και τα παλιά δεδομένα διαβάζονται σωστά με
// κανόνες συμβατότητας. Σε βάση χωρίς αντίγραφα ασφαλείας, αυτή είναι η μόνη
// υπεύθυνη επιλογή: η ασάφεια λύνεται στον κώδικα, όχι με DDL πάνω σε
// πραγματικά δεδομένα.
// ═══════════════════════════════════════════════════════════════════════════

export type PropertyStatus =
  | 'rent_long'    // μακροχρόνια μίσθωση
  | 'rent_short'   // βραχυχρόνια μίσθωση
  | 'vacant'
  | 'own_use'
  | 'renovation'
  | 'for_sale'
  | 'disputed';

export interface StatusDef {
  key: PropertyStatus;
  label: string;
  /** Τι σημαίνει, σε μία φράση. Εμφανίζεται στο μενού επιλογής. */
  hint: string;
}

/**
 * Η σειρά είναι η σειρά του μενού: πρώτα οι δύο μισθώσεις, γιατί εκεί είναι το
 * 90% των ακινήτων και εκεί ζει όλη η λειτουργικότητα της εφαρμογής.
 */
export const STATUSES: readonly StatusDef[] = [
  { key: 'rent_long',  label: 'Μακροχρόνια μίσθωση', hint: 'Ενοικιαστής με συμβόλαιο και μηνιαίο ενοίκιο' },
  { key: 'rent_short', label: 'Βραχυχρόνια μίσθωση', hint: 'Airbnb, Booking, διαμονές ανά ημέρα' },
  { key: 'vacant',     label: 'Κενό',                hint: 'Δεν αποδίδει αυτή τη στιγμή' },
  { key: 'own_use',    label: 'Ιδιοχρησία',          hint: 'Το χρησιμοποιείς εσύ ή οικείο πρόσωπο' },
  { key: 'renovation', label: 'Ανακαίνιση',          hint: 'Σε εργασίες, εκτός εκμετάλλευσης' },
  { key: 'for_sale',   label: 'Προς πώληση',         hint: 'Σε διαδικασία πώλησης' },
  { key: 'disputed',   label: 'Αμφισβητούμενο',      hint: 'Νομική εκκρεμότητα ή διαφορά' },
] as const;

export const BY_KEY: Record<PropertyStatus, StatusDef> =
  STATUSES.reduce((a, s) => { a[s.key] = s; return a; }, {} as Record<PropertyStatus, StatusDef>);

// ΤΟ «ΠΟΙΑ ΚΑΡΤΕΛΑ ΣΕ ΠΟΙΑ ΚΑΤΑΣΤΑΣΗ» ΔΕΝ ΖΕΙ ΕΔΩ — ΚΑΙ ΝΑ ΓΙΑΤΙ.
//
// Υπήρχε: ένα πεδίο `tabs` ανά κατάσταση, ένα `STATUS_DEPENDENT_TABS` και ένα
// `tabFitsStatus`. Ο πίνακας όμως κάλυπτε ΜΟΝΟ τρεις καρτέλες (Ενοικιαστής,
// Πελάτες, Τιμολόγηση) και ό,τι έλειπε το θεωρούσε «επιτρέπεται πάντα». Όταν
// προστέθηκαν Αποδόσεις, Απογραφή και Σχέδιο, κανείς δεν τον ενημέρωσε.
//
// Μετρημένο, τρέχοντας τους δύο πίνακες δίπλα-δίπλα σε όλες τις καταστάσεις:
// 13 διαφωνίες στις 42 απαντήσεις. Το `tabFitsStatus` έλεγε «ναι, δείξε τις
// Αποδόσεις» για ακίνητο σε ΙΔΙΟΧΡΗΣΙΑ και για ΚΕΝΟ — δηλαδή απόδοση χωρίς
// έσοδο, ακριβώς το επινοημένο νούμερο που καθαρίστηκε από όλο το app.
//
// Σώθηκε από το ότι καμία οθόνη δεν το καλούσε· το καλούσε μόνο το test του.
// Αυτό δεν είναι ασφάλεια, είναι τύχη: μια εξαγόμενη συνάρτηση με το σωστό
// όνομα και λάθος απαντήσεις περιμένει τον επόμενο που θα τη χρειαστεί.
//
// Η ΜΙΑ πηγή είναι το lib/property/visibility.ts (`tabDecision`), που ξέρει και
// τις τρεις διαστάσεις: κατάσταση, πλήθος ακινήτων, νομική μορφή — και
// επιστρέφει και τον ΛΟΓΟ, ώστε η οθόνη να εξηγεί αντί να εξαφανίζει.

export interface StatusRow {
  status_detail?: string | null;
  rental_mode?: string | null;
}

/**
 * Η κατάσταση, από ό,τι υπάρχει στη βάση.
 *
 * ΣΕΙΡΑ ΠΡΟΤΕΡΑΙΟΤΗΤΑΣ, και ο λόγος της:
 *   1. rental_mode. Είναι ρητή δήλωση τρόπου εκμετάλλευσης και δεν μπαίνει
 *      κατά λάθος. Όπου υπάρχει, αυτό ισχύει.
 *   2. status_detail 'seasonal' -> βραχυχρόνια. Έτσι λεγόταν πριν υπάρξει
 *      ξεχωριστή επιλογή, και σημαίνει ακριβώς αυτό.
 *   3. status_detail 'rented' χωρίς mode -> μακροχρόνια. Είναι η συνηθισμένη
 *      περίπτωση στην Ελλάδα, και η μακροχρόνια εμφανίζει ΛΙΓΟΤΕΡΑ εργαλεία
 *      (μόνο τον Ενοικιαστή). Η μαντεψιά γέρνει προς τα κάτω επίτηδες: καλύτερα
 *      να λείπει μια καρτέλα που ο χρήστης θα ζητήσει, παρά να εμφανίζονται δύο
 *      άσχετες που τον μπερδεύουν.
 *   4. Οτιδήποτε άλλο περνά αυτούσιο. Άγνωστο ή κενό σημαίνει «Κενό».
 */
export function readStatus(row: StatusRow | null | undefined): PropertyStatus {
  const mode = (row?.rental_mode ?? '').trim();
  if (mode === 'short_term') return 'rent_short';
  if (mode === 'long_term') return 'rent_long';

  const s = (row?.status_detail ?? '').trim();
  if (s === 'seasonal') return 'rent_short';
  if (s === 'rented') return 'rent_long';
  if (s === 'vacant' || s === 'own_use' || s === 'renovation' || s === 'for_sale' || s === 'disputed') return s;
  return 'vacant';
}

/**
 * Τι γράφεται στη βάση για μια κατάσταση.
 *
 * ΠΑΝΤΑ ΚΑΙ ΟΙ ΔΥΟ ΣΤΗΛΕΣ ΜΑΖΙ. Εκεί γεννιόταν η ασυνέπεια: η μία οθόνη
 * ενημέρωνε το status_detail και άφηνε το rental_mode σε ό,τι είχε μείνει από
 * παλιά. Το ρητό `null` στις μη μισθώσεις είναι σημαντικό: σβήνει τον
 * προηγούμενο τρόπο εκμετάλλευσης αντί να τον αφήνει να στοιχειώνει.
 */
export function writeStatus(key: PropertyStatus): { status_detail: string; rental_mode: string | null } {
  if (key === 'rent_long') return { status_detail: 'rented', rental_mode: 'long_term' };
  if (key === 'rent_short') return { status_detail: 'seasonal', rental_mode: 'short_term' };
  return { status_detail: key, rental_mode: null };
}

/** Εκμισθώνεται, με οποιονδήποτε τρόπο; */
export const isLet = (row: StatusRow | null | undefined): boolean => {
  const s = readStatus(row);
  return s === 'rent_long' || s === 'rent_short';
};

export const isShortTerm = (row: StatusRow | null | undefined): boolean => readStatus(row) === 'rent_short';

export const statusLabel = (row: StatusRow | null | undefined): string => BY_KEY[readStatus(row)].label;
