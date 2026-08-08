// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΑΡΩΜΕΝΟ ΑΣΦΑΛΙΣΤΗΡΙΟ ΦΤΑΝΕΙ ΣΤΗΝ ΟΘΟΝΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ, ΜΕΤΡΗΜΕΝΟ. Η σάρωση εγγράφου εξάγει ήδη `policy_number`, `premium`,
// `coverage` και `expiry_date` από τη φωτογραφία του ασφαλιστηρίου, και τα
// γράφει στο ακίνητο (`insurance_company`, `insurance_policy`,
// `insurance_expiry`) μαζί με δαπάνη και υπενθύμιση ανανέωσης στο ημερολόγιο.
//
// Η οθόνη της Ασφάλειας όμως διαβάζει ΑΛΛΟ αποθετήριο: το `bills_settings`
// section «insurance». Τα δύο δεν συναντιούνται πουθενά. Ο ιδιοκτήτης
// φωτογράφιζε το συμβόλαιό του, η εφαρμογή το διάβαζε σωστά, και μετά του
// ζητούσε να ξαναγράψει τα ίδια στοιχεία με το χέρι.
//
// ΚΑΙ ΜΙΑ ΠΡΟΕΠΙΛΟΓΗ ΠΟΥ ΕΛΕΓΕ ΨΕΜΑΤΑ. Το section ξεκινά με
// `insProvider: 'hellas_direct'`. Δηλαδή ένας ιδιοκτήτης που δεν έχει ασφαλίσει
// ποτέ το ακίνητό του έβλεπε συγκεκριμένη ασφαλιστική ήδη επιλεγμένη ως «τρέχον
// πρόγραμμα», με μηνιαίο κόστος να μετράει στα σύνολα. Το άγνωστο εμφανιζόταν
// ως γεγονός — η ίδια αρχή που τηρείται παντού αλλού: το άγνωστο δεν γράφεται
// μηδέν, και δεν γράφεται ούτε «Hellas Direct».
//
// Ο ΚΑΝΟΝΑΣ: ΤΟ ΧΑΡΤΙ ΝΙΚΑΕΙ ΤΗΝ ΑΝΕΓΓΙΧΤΗ ΠΡΟΕΠΙΛΟΓΗ, ΟΧΙ ΤΗΝ ΕΠΙΛΟΓΗ ΤΟΥ
// ΧΡΗΣΤΗ. Ό,τι έχει πειράξει ο ιδιοκτήτης μένει ανέπαφο — αυτός ξέρει. Ό,τι
// είναι ακόμη στην προεπιλογή ή κενό συμπληρώνεται από το συμβόλαιό του.
// ═══════════════════════════════════════════════════════════════════════════

/** Ό,τι ξέρει το ακίνητο για την ασφάλιση, από τη σάρωση ή τη χειροκίνητη καταχώριση. */
export interface PropertyInsurance {
  insurance_company?: string | null;
  insurance_policy?: string | null;
  insurance_expiry?: string | null;
  /** Το ασφάλιστρο, όπου έχει καταγραφεί. */
  insurance_amount?: number | null;
}

/** Τα πεδία της οθόνης που μπορούν να συμπληρωθούν από το συμβόλαιο. */
export interface InsuranceSettings {
  insProvider?: string;
  insCustomPlanName?: string;
  insCustomPrice?: string;
  insRenewalDate?: string;
}

/** Οι προεπιλογές του section, ώστε να ξεχωρίζει το «ανέγγιχτο» από το «επιλεγμένο». */
export interface InsuranceDefaults {
  insProvider: string;
}

const clean = (v?: string | null): string => (v || '').trim();

/**
 * Κανονικοποίηση ονόματος ασφαλιστικής για αντιστοίχιση με τον κατάλογο.
 *
 * Το χαρτί γράφει «INTERAMERICAN Ε.Α.Ε.Ζ.», ο κατάλογος έχει «interamerican».
 * Χωρίς κανονικοποίηση καμία σάρωση δεν θα ταίριαζε ποτέ, και το χαρακτηριστικό
 * θα φαινόταν σπασμένο ενώ θα ήταν απλώς αυστηρό.
 */
export const normalizeInsurer = (s?: string | null): string =>
  clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-zα-ω0-9]+/gi, ' ').trim();

/**
 * Ποια πεδία της οθόνης πρέπει να συμπληρωθούν από το ασφαλιστήριο.
 *
 * Επιστρέφει ΜΟΝΟ ό,τι αλλάζει· κενό αντικείμενο σημαίνει «μην γράψεις τίποτα».
 * Ο καλών δεν χρειάζεται να ξέρει τους κανόνες, και μια περιττή εγγραφή στη
 * βάση σε κάθε φόρτωση οθόνης δεν είναι αθώα: γεννά συμβάν realtime που
 * ξαναφορτώνει την ίδια οθόνη.
 *
 * @param known  τα αναγνωριστικά του καταλόγου, για αντιστοίχιση του ονόματος
 */
export function seedInsurance(
  settings: InsuranceSettings,
  property: PropertyInsurance,
  defaults: InsuranceDefaults,
  known: readonly { value: string; label: string }[] = [],
): Partial<InsuranceSettings> {
  const patch: Partial<InsuranceSettings> = {};

  // ── Ασφαλιστική ─────────────────────────────────────────────────────────
  const scanned = clean(property.insurance_company);
  const chosen = clean(settings.insProvider);
  // «Ανέγγιχτο» = κενό ή ακόμη στην προεπιλογή. Ό,τι διάλεξε ο χρήστης μένει.
  const untouched = !chosen || chosen === defaults.insProvider;
  if (scanned && untouched) {
    const n = normalizeInsurer(scanned);
    const match = known.find(k => normalizeInsurer(k.label) === n)
      // Το χαρτί γράφει «INTERAMERICAN Ε.Α.Ε.Ζ.»· ο κατάλογος «Interamerican».
      || known.find(k => n.startsWith(normalizeInsurer(k.label)) || normalizeInsurer(k.label).startsWith(n));
    if (match) {
      if (match.value !== chosen) patch.insProvider = match.value;
    } else if (clean(settings.insCustomPlanName) !== scanned) {
      // Ασφαλιστική εκτός καταλόγου: κρατιέται το όνομα από το χαρτί αντί να
      // χαθεί. Ο κατάλογος δεν είναι πλήρης και δεν προσποιείται ότι είναι.
      patch.insCustomPlanName = scanned;
    }
  }

  // ── Ασφάλιστρο ──────────────────────────────────────────────────────────
  // Γράφεται μόνο σε κενό πεδίο: ένα ποσό που ο ιδιοκτήτης διόρθωσε είναι πιο
  // σωστό από ένα ποσό που διάβασε μηχανή από φωτογραφία.
  if (property.insurance_amount != null && property.insurance_amount > 0 && !clean(settings.insCustomPrice)) {
    patch.insCustomPrice = String(property.insurance_amount);
  }

  // ── Ημερομηνία ανανέωσης ────────────────────────────────────────────────
  const expiry = clean(property.insurance_expiry).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry) && !clean(settings.insRenewalDate)) {
    patch.insRenewalDate = expiry;
  }

  return patch;
}
