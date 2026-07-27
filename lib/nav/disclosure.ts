// ═══════════════════════════════════════════════════════════════════════════
// Σταδιακή αποκάλυψη καρτελών (progressive disclosure)
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ
// Η εφαρμογή έχει 17 καρτέλες. Για τον ιδιοκτήτη με ΕΝΑ ακίνητο, οι μισές είναι
// θόρυβος: δεν έχει δάνειο, δεν κάνει βραχυχρόνια, δεν έχει τίποτα να συγκρίνει.
// Ένα μενού που δείχνει τα πάντα από την πρώτη μέρα δεν φαίνεται πλούσιο —
// φαίνεται ακατάστατο, και ο χρήστης δεν ξέρει από πού να πιάσει.
//
// Ο ΚΑΝΟΝΑΣ
// Μια καρτέλα εμφανίζεται όταν ισχύει ΕΝΑ από τα παρακάτω:
//   1. Είναι βασική (κάθε ιδιοκτήτης τη χρειάζεται από την πρώτη μέρα).
//   2. Υπάρχουν ΠΡΑΓΜΑΤΙΚΑ δεδομένα που την κάνουν χρήσιμη (π.χ. καταχωρημένο
//      δάνειο → «Δάνειο», δεύτερο ακίνητο → «Σύγκριση»).
//   3. Ο χρήστης την άνοιξε έστω μία φορά — τότε μένει για πάντα ορατή.
//   4. Ζήτησε ρητά να τις δει όλες.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ
// Δεν κλειδώνει τίποτα και δεν αφαιρεί λειτουργικότητα: κάθε κρυφή καρτέλα
// παραμένει προσβάσιμη (⌘K, βοηθός, πλακίδια Επισκόπησης) και η πρώτη επίσκεψη
// την αποκαλύπτει μόνιμα. Είναι θέμα σειράς εμφάνισης, όχι δικαιωμάτων — τα
// δικαιώματα είναι δουλειά των entitlements.
//
// Καθαρή λογική, χωρίς React/Supabase, ώστε να ελέγχεται με tests.
// ═══════════════════════════════════════════════════════════════════════════

export type ProfileType = 'individual' | 'professional';

/** Καρτέλες που βλέπει ΚΑΘΕ χρήστης, από το πρώτο λεπτό. Έξι, όχι δεκαεπτά. */
export const CORE_TABS: readonly string[] = [
  'overview',    // η αρχική εικόνα του ακινήτου
  'calendar',    // προθεσμίες και υπενθυμίσεις
  'finances',    // δαπάνες — ο λόγος που μπαίνει καθημερινά
  'accounting',  // φόρος και Ε2 — ο λόγος που έψαξε λύση
  'tenant',      // ενοικιαστής και μίσθωμα
  'settings',    // λογαριασμός
];

/** Ο επαγγελματίας ξεκινά ΚΑΙ με τα εργαλεία της δουλειάς του: χωρίς αυτά η
 *  εφαρμογή δεν του μοιάζει επαγγελματική. */
export const PROFESSIONAL_CORE_TABS: readonly string[] = ['portfolio', 'clients'];

/** Σήματα από τα πραγματικά δεδομένα του χρήστη. Όλα προαιρετικά: ό,τι λείπει
 *  θεωρείται «δεν υπάρχει», ποτέ «αποκάλυψέ το για καλό και για κακό». */
export interface DisclosureSignals {
  propertyCount?: number;
  /** Έχει καταχωρήσει έστω ένα δάνειο. */
  hasLoan?: boolean;
  /** Το επιλεγμένο ακίνητο είναι βραχυχρόνιας μίσθωσης. */
  isShortTerm?: boolean;
  hasInventory?: boolean;
  hasDocuments?: boolean;
  hasContacts?: boolean;
  /** Ανοιχτές εκκρεμότητες / ειδοποιήσεις λίστας. */
  openTasks?: number;
  /** Ημέρες από τη δημιουργία του λογαριασμού. */
  daysSinceSignup?: number;
}

/** Πότε «αξίζει» κάθε μη-βασική καρτέλα, με βάση τα δεδομένα του χρήστη.
 *  Μία γραμμή ανά καρτέλα: αν λείπει από εδώ, εμφανίζεται μόνο με επίσκεψη ή
 *  με «Δες τα όλα». */
const SIGNAL_RULES: Record<string, (s: DisclosureSignals) => boolean> = {
  // Δάνειο: μόνο αν υπάρχει δάνειο. Το 60% των Ελλήνων ιδιοκτητών δεν έχει.
  loan:       s => !!s.hasLoan,
  // Τιμολόγηση (δυναμική τιμή ανά διανυκτέρευση): μόνο για βραχυχρόνια.
  pricing:    s => !!s.isShortTerm,
  // Σύγκριση/Αποδόσεις: χρειάζονται δεύτερο ακίνητο για να λένε κάτι.
  comparison: s => (s.propertyCount ?? 0) > 1,
  roi:        s => (s.propertyCount ?? 0) > 1,
  // Εργαλεία: εμφανίζονται μόλις μπει το πρώτο δεδομένο τους.
  inventory:  s => !!s.hasInventory,
  documents:  s => !!s.hasDocuments,
  contacts:   s => !!s.hasContacts,
  checklist:  s => (s.openTasks ?? 0) > 0,
  // Πρόγραμμα Πρόσκλησης: δεν ζητάμε σύσταση από κάποιον που μόλις μπήκε και
  // δεν έχει δει ακόμη αξία. Μετά την πρώτη εβδομάδα.
  referral:   s => (s.daysSinceSignup ?? 0) >= 7,
};

export interface DisclosureInput {
  profileType?: ProfileType;
  /** Καρτέλες που ο χρήστης έχει ήδη ανοίξει (αποθηκευμένες). */
  revealed?: readonly string[];
  signals?: DisclosureSignals;
  /** Ο χρήστης ζήτησε να βλέπει τα πάντα. */
  showAll?: boolean;
}

/** Οι πάντα-ορατές καρτέλες για αυτό το προφίλ. */
export function coreTabs(profileType: ProfileType = 'individual'): string[] {
  return profileType === 'professional'
    ? [...CORE_TABS, ...PROFESSIONAL_CORE_TABS]
    : [...CORE_TABS];
}

/** Είναι ορατή αυτή η καρτέλα τώρα; */
export function isTabVisible(tabId: string, input: DisclosureInput = {}): boolean {
  if (input.showAll) return true;
  if (coreTabs(input.profileType).includes(tabId)) return true;
  if (input.revealed?.includes(tabId)) return true;
  const rule = SIGNAL_RULES[tabId];
  return rule ? rule(input.signals ?? {}) : false;
}

/** Φιλτράρει μια λίστα ids κρατώντας τη σειρά. */
export function visibleTabs(ids: readonly string[], input: DisclosureInput = {}): string[] {
  return ids.filter(id => isTabVisible(id, input));
}

/** Πόσες από αυτές τις καρτέλες είναι προς το παρόν κρυμμένες. */
export function hiddenCount(ids: readonly string[], input: DisclosureInput = {}): number {
  return ids.length - visibleTabs(ids, input).length;
}

/** Προσθέτει μια καρτέλα στις αποκαλυμμένες. Επιστρέφει την ΙΔΙΑ αναφορά όταν
 *  δεν αλλάζει τίποτα, ώστε ο caller να μη γράφει άσκοπα στη βάση. */
export function reveal(revealed: readonly string[], tabId: string): string[] {
  if (revealed.includes(tabId)) return revealed as string[];
  return [...revealed, tabId];
}

/** Καθαρίζει ό,τι διαβάστηκε από τη βάση: μόνο γνωστά, μοναδικά ids. */
export function sanitizeRevealed(raw: unknown, knownIds: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(knownIds);
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && known.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}
