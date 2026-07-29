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
  /** Καρτέλες που έχουν νόημα ΜΟΝΟ σε αυτή την κατάσταση. */
  tabs: readonly string[];
}

/**
 * Η σειρά είναι η σειρά του μενού: πρώτα οι δύο μισθώσεις, γιατί εκεί είναι το
 * 90% των ακινήτων και εκεί ζει όλη η λειτουργικότητα της εφαρμογής.
 */
export const STATUSES: readonly StatusDef[] = [
  { key: 'rent_long',  label: 'Μακροχρόνια μίσθωση', hint: 'Ενοικιαστής με συμβόλαιο και μηνιαίο ενοίκιο', tabs: ['tenant'] },
  { key: 'rent_short', label: 'Βραχυχρόνια μίσθωση', hint: 'Airbnb, Booking, διαμονές ανά ημέρα',          tabs: ['clients', 'pricing'] },
  { key: 'vacant',     label: 'Κενό',                hint: 'Δεν αποδίδει αυτή τη στιγμή',                  tabs: [] },
  { key: 'own_use',    label: 'Ιδιοχρησία',          hint: 'Το χρησιμοποιείς εσύ ή οικείο πρόσωπο',        tabs: [] },
  { key: 'renovation', label: 'Ανακαίνιση',          hint: 'Σε εργασίες, εκτός εκμετάλλευσης',             tabs: [] },
  { key: 'for_sale',   label: 'Προς πώληση',         hint: 'Σε διαδικασία πώλησης',                        tabs: [] },
  { key: 'disputed',   label: 'Αμφισβητούμενο',      hint: 'Νομική εκκρεμότητα ή διαφορά',                 tabs: [] },
] as const;

export const BY_KEY: Record<PropertyStatus, StatusDef> =
  STATUSES.reduce((a, s) => { a[s.key] = s; return a; }, {} as Record<PropertyStatus, StatusDef>);

/** Όλες οι καρτέλες που εξαρτώνται από κατάσταση, σε οποιαδήποτε κατάσταση. */
export const STATUS_DEPENDENT_TABS: ReadonlySet<string> =
  new Set(STATUSES.flatMap(s => s.tabs));

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

/**
 * Έχει νόημα αυτή η καρτέλα για ΑΥΤΟ το ακίνητο;
 *
 * Καρτέλα που δεν εξαρτάται από κατάσταση επιτρέπεται πάντα. Καρτέλα που
 * εξαρτάται, μόνο στην κατάσταση όπου ανήκει: ο Ενοικιαστής στη μακροχρόνια,
 * ο Πελάτης και η Τιμολόγηση στη βραχυχρόνια. Ο ιδιοκτήτης με ένα Airbnb δεν
 * έχει «ενοικιαστή», έχει επισκέπτες· ο ιδιοκτήτης με τριετές μισθωτήριο δεν
 * τιμολογεί ανά διανυκτέρευση.
 */
export function tabFitsStatus(tabId: string, row: StatusRow | null | undefined): boolean {
  if (!STATUS_DEPENDENT_TABS.has(tabId)) return true;
  return BY_KEY[readStatus(row)].tabs.includes(tabId);
}

export const statusLabel = (row: StatusRow | null | undefined): string => BY_KEY[readStatus(row)].label;
