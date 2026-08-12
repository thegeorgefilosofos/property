// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΛΕΞΗ ΑΝΑ ΠΡΑΓΜΑ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ: το ίδιο ρεύμα λεγόταν με τέσσερις τρόπους, σε τέσσερα αρχεία,
// και και τα τέσσερα έγραφαν στην ΙΔΙΑ στήλη της βάσης.
//   • οι Λογαριασμοί έγραφαν  'electricity'
//   • οι Δαπάνες έγραφαν      'Ρεύμα'
//   • ο Προϋπολογισμός περίμενε 'electricity'
//   • η εισαγωγή αρχείου έγραφε 'electricity'
// Ο Προϋπολογισμός λοιπόν έψαχνε αγγλικά και έβρισκε ελληνικά, δεν ταίριαζε
// τίποτα, και ΚΑΘΕ χειροκίνητη δαπάνη προσγειωνόταν στις «Λοιπές». Ο πίνακας
// κατηγοριών ήταν λάθος για κάθε δαπάνη που είχε γράψει ο ίδιος ο χρήστης.
//
// Η ΛΥΣΗ: μία λίστα εδώ, με όλα τα συνώνυμα δίπλα σε κάθε κατηγορία. Ό,τι κι αν
// έχει γραφτεί στη βάση μέχρι σήμερα, το `resolveCategory` το βρίσκει. Καμία
// γραμμή δεν χρειάζεται να αλλάξει.
//
// ΤΟ ΛΕΚΤΙΚΟ ΕΙΝΑΙ ΓΙΑ ΙΔΙΟΚΤΗΤΗ, ΟΧΙ ΓΙΑ ΛΟΓΙΣΤΗ:
// «Ρεύμα», όχι «Ηλεκτρική ενέργεια». «Υδραυλικός», όχι «Δαπάνες υδραυλικών
// εγκαταστάσεων». Καμία λέξη που δεν θα έλεγε κάποιος στο τηλέφωνο.
// ═══════════════════════════════════════════════════════════════════════════

/** Οι πέντε οικογένειες. Περισσότερες δεν χωρούν σε ένα κεφάλι. */
export type Family = 'home' | 'upkeep' | 'official' | 'setup' | 'other';


export interface Category {
  slug: string;
  label: string;
  family: Family;
  /** Εκπίπτει από το εισόδημα ενοικίων. Κρύβεται πίσω από ⓘ, δεν διαφημίζεται. */
  deductible: boolean;
  /** Ό,τι έχει γραφτεί ποτέ στη βάση για αυτό το πράγμα, σε οποιοδήποτε αρχείο. */
  aliases: string[];
}

// Η σειρά μετρά: εμφανίζεται έτσι στη λίστα επιλογής, και τα συχνά είναι πάνω.
export const CATEGORIES: Category[] = [
  // ── Πάγια του σπιτιού ────────────────────────────────────────────────────
  { slug: 'electricity', label: 'Ρεύμα',          family: 'home', deductible: true,  aliases: ['electricity', 'ρευμα', 'δεη', 'ηρων', 'protergia', 'nrg', 'zenith', 'elin', 'volton', 'watt+volt', 'ηλεκτρικο ρευμα'] },
  { slug: 'water',       label: 'Νερό',           family: 'home', deductible: true,  aliases: ['water', 'νερο', 'ευδαπ', 'εγαθ', 'δευα'] },
  { slug: 'gas',         label: 'Φυσικό αέριο',   family: 'home', deductible: true,  aliases: ['gas', 'φυσικο αεριο', 'αεριο', 'εδα', 'φυσικο αεριο ελλαδος'] },
  { slug: 'heating',     label: 'Θέρμανση',       family: 'home', deductible: true,  aliases: ['heating', 'θερμανση', 'πετρελαιο', 'πετρελαιο θερμανσης', 'pellet', 'ξυλα'] },
  { slug: 'internet',    label: 'Internet και τηλέφωνο', family: 'home', deductible: true, aliases: ['internet', 'τηλεφωνο', 'cosmote', 'nova', 'vodafone', 'inalan', 'hol', 'wind', 'ιντερνετ'] },
  { slug: 'common',      label: 'Κοινόχρηστα',    family: 'home', deductible: true,  aliases: ['common', 'κοινοχρηστα', 'κοινοχρηστα κτιριου', 'διαχειριση κτιριου'] },
  { slug: 'insurance',   label: 'Ασφάλεια',       family: 'home', deductible: true,  aliases: ['insurance', 'ασφαλεια', 'ασφαλεια κτιριου', 'ασφαλιστηριο', 'ασφαλιστρα'] },
  { slug: 'security',    label: 'Συναγερμός',     family: 'home', deductible: true,  aliases: ['security', 'συναγερμος', 'συστημα συναγερμου', 'φυλαξη', 'φυλαξη/security'] },
  { slug: 'subscription', label: 'Συνδρομές',     family: 'home', deductible: false, aliases: ['streaming', 'συνδρομες', 'netflix', 'spotify', 'cloud', 'αλλη παγια'] },

  // ── Συντήρηση και επισκευές ─────────────────────────────────────────────
  { slug: 'plumber',     label: 'Υδραυλικός',     family: 'upkeep', deductible: true, aliases: ['plumber', 'υδραυλικος', 'υδραυλικα'] },
  { slug: 'electrician', label: 'Ηλεκτρολόγος',   family: 'upkeep', deductible: true, aliases: ['electrician', 'ηλεκτρολογος', 'ηλεκτρολογικα'] },
  { slug: 'cleaning',    label: 'Καθαριότητα',    family: 'upkeep', deductible: true, aliases: ['cleaning', 'cleaner', 'καθαριοτητα', 'καθαρισμος', 'καθαρισμος (εφαπαξ)', 'συνεργειο καθαρισμου'] },
  { slug: 'garden',      label: 'Κήπος',          family: 'upkeep', deductible: true, aliases: ['garden', 'gardener', 'κηπος', 'κηπουρος'] },
  { slug: 'elevator',    label: 'Ασανσέρ',        family: 'upkeep', deductible: true, aliases: ['elevator', 'ασανσερ', 'συντηρηση ασανσερ', 'ανελκυστηρας'] },
  { slug: 'ac_service',  label: 'Κλιματιστικά',   family: 'upkeep', deductible: true, aliases: ['ac_service', 'κλιματιστικο', 'καθαρισμος κλιματιστικου', 'συντηρηση κλιματιστικου'] },
  { slug: 'pool',        label: 'Πισίνα',         family: 'upkeep', deductible: true, aliases: ['pool', 'πισινα', 'καθαρισμος πισινας'] },
  { slug: 'pest',        label: 'Απεντόμωση',     family: 'upkeep', deductible: true, aliases: ['pest', 'απεντομωση', 'μυοκτονια'] },
  { slug: 'repair',      label: 'Επισκευή',       family: 'upkeep', deductible: true, aliases: ['maintenance', 'repair', 'επισκευη', 'συντηρηση', 'γενικη συντηρηση', 'μερεμετια'] },

  // ── Φόροι και επίσημα ───────────────────────────────────────────────────
  { slug: 'enfia',       label: 'ΕΝΦΙΑ',          family: 'official', deductible: false, aliases: ['enfia', 'ενφια', 'φορολογικο / ενφια', 'φορος ακινητης περιουσιας'] },
  { slug: 'municipal',   label: 'Δημοτικά τέλη',  family: 'official', deductible: true,  aliases: ['dimotika', 'municipal', 'δημοτικα τελη', 'δημοτικα', 'τελη καθαριοτητας'] },
  { slug: 'notary',      label: 'Συμβολαιογράφος και δικηγόρος', family: 'official', deductible: true, aliases: ['legal', 'notary', 'συμβολαιογραφος', 'δικηγορος', 'νομικα'] },
  { slug: 'engineer',    label: 'Μηχανικός',      family: 'official', deductible: true,  aliases: ['engineer', 'μηχανικος', 'μηχανικος/τοπογραφος', 'τοπογραφος', 'πιστοποιητικο ενεργειακης αποδοσης', 'πεα'] },
  { slug: 'broker_fee',  label: 'Μεσιτικά',       family: 'official', deductible: true,  aliases: ['broker', 'μεσιτεια', 'μεσιτεια ενοικιασης', 'μεσιτεια πωλησης', 'μεσιτικα'] },
  // Η ΠΡΟΜΗΘΕΙΑ ΤΗΣ ΠΛΑΤΦΟΡΜΑΣ ΕΧΕΙ ΔΙΚΗ ΤΗΣ ΓΡΑΜΜΗ.
  // Είναι η μεγαλύτερη μεμονωμένη δαπάνη της βραχυχρόνιας — 15% του τζίρου σε
  // κάθε κράτηση — και χωρίς κατηγορία προσγειωνόταν στο «Άλλο», δηλαδή στον
  // λογαριασμό 64.12 «Λοιπά έξοδα», μαζί με τις συνδρομές. Ο κανόνας του
  // lib/clients/stayAmounts.ts λέει ότι είναι ΔΑΠΑΝΗ και δεν μειώνει το
  // δηλωτέο έσοδο· για να ισχύει αυτό, πρέπει να υπάρχει κάπου ως δαπάνη.
  { slug: 'platform_fee', label: 'Προμήθεια πλατφόρμας', family: 'official', deductible: true, aliases: ['platform_fee', 'προμηθεια πλατφορμας', 'προμηθεια airbnb', 'προμηθεια booking', 'προμηθεια καναλιου', 'host service fee'] },

  // ── Εξοπλισμός και ανακαίνιση ───────────────────────────────────────────
  { slug: 'renovation',  label: 'Ανακαίνιση',     family: 'setup', deductible: false, aliases: ['renovation', 'ανακαινιση', 'βαφες & χρωματα', 'βαφες και χρωματα', 'βαφες', 'πλακακια', 'ξυλουργικα'] },
  { slug: 'appliance',   label: 'Συσκευές',       family: 'setup', deductible: false, aliases: ['appliances', 'συσκευες', 'ψυγειο', 'πλυντηριο ρουχων', 'στεγνωτηριο', 'κουζινα', 'κλιματιστικο (αγορα)'] },
  { slug: 'furniture',   label: 'Έπιπλα',         family: 'setup', deductible: false, aliases: ['furniture', 'επιπλα', 'κρεβατι', 'καναπες', 'τραπεζι'] },

  // ── Άλλα ────────────────────────────────────────────────────────────────
  { slug: 'other',       label: 'Άλλο',           family: 'other', deductible: false, aliases: ['other', 'αλλο', 'αλλες δαπανες', 'αλλο εγγραφο', 'γενικα', 'general', 'bills', 'τραπεζικη κινηση'] },
];

export const BY_SLUG: Record<string, Category> =
  CATEGORIES.reduce((a, c) => { a[c.slug] = c; return a; }, {} as Record<string, Category>);

/**
 * Κανονικοποίηση για σύγκριση: πεζά, χωρίς τόνους, χωρίς διπλά κενά.
 * Χρειάζεται γιατί στη βάση υπάρχουν «Ρεύμα», «ρευμα» και «ΡΕΥΜΑ», και τα τρία
 * γραμμένα από διαφορετική οθόνη σε διαφορετική εποχή.
 */
export const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of CATEGORIES) {
    m.set(norm(c.slug), c.slug);
    m.set(norm(c.label), c.slug);
    for (const a of c.aliases) m.set(norm(a), c.slug);
  }
  return m;
})();

/**
 * Βρίσκει την κατηγορία από ΟΤΙΔΗΠΟΤΕ έχει γραφτεί στη βάση.
 *
 * Τρία περάσματα, με φθίνουσα βεβαιότητα:
 *   1. ακριβές ταίριασμα με slug, ετικέτα ή συνώνυμο
 *   2. η αποθηκευμένη τιμή περιέχει συνώνυμο («Λογαριασμός ΔΕΗ Ιουνίου» -> ρεύμα)
 *   3. τίποτα -> null, και ο καλών αποφασίζει. ΔΕΝ μαντεύουμε «άλλο»: το «άλλο»
 *      πρέπει να είναι επιλογή του χρήστη ή ρητή απόφαση της οθόνης, όχι σιωπηλή
 *      παραίτηση της βιβλιοθήκης.
 */
export function resolveCategory(raw: unknown): string | null {
  const n = norm(raw);
  if (!n) return null;
  const exact = LOOKUP.get(n);
  if (exact) return exact;

  // ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΤΟ includes: ο χρήστης δεν γράφει λεξικό, γράφει πρόταση,
  // και τα ελληνικά κλίνονται. «Πλήρωσα τον υδραυλικό» δεν περιέχει πουθενά τη
  // λέξη «υδραυλικός». Και το «ΔΕΗ» είναι τρία γράμματα, οπότε κάθε όριο μήκους
  // που προστατεύει από θόρυβο το πετούσε κι αυτό.
  //
  // Δύο περάσματα σε επίπεδο ΛΕΞΗΣ:
  //   α) ολόκληρη λέξη ίση με συνώνυμο  ->  «ΔΕΗ», «ΕΥΔΑΠ», «ΕΝΦΙΑ»
  //   β) κοινό πρόθεμα τουλάχιστον πέντε γραμμάτων  ->  υδραυλικό/υδραυλικός,
  //      ασφάλεια/ασφαλιστήριο, καθαρισμός/καθαριότητα
  // Τα πέντε γράμματα είναι το σημείο όπου δύο ελληνικές λέξεις που μοιράζονται
  // πρόθεμα εννοούν σχεδόν πάντα το ίδιο πράγμα. Στα τρία, το «συντήρηση» θα
  // κόλλαγε με το «συναγερμός».
  const words = n.split(" ").filter(Boolean);
  let best: { slug: string; len: number } | null = null;
  const consider = (slug: string, len: number) => {
    if (!best || len > best.len) best = { slug, len };
  };
  for (const [alias, slug] of LOOKUP) {
    const aw = alias.split(" ").filter(Boolean);
    // Πολυλεκτικό συνώνυμο («φυσικο αεριο»): πρέπει να υπάρχει αυτούσιο.
    if (aw.length > 1) { if (n.includes(alias)) consider(slug, alias.length); continue; }
    for (const w of words) {
      if (w === alias) { consider(slug, alias.length + 100); break; }
      const min = Math.min(w.length, alias.length);
      if (min < 5) continue;
      let i = 0;
      while (i < min && w[i] === alias[i]) i++;
      if (i >= 5) consider(slug, i);
    }
  }
  return best ? (best as { slug: string }).slug : null;
}

/** Η ετικέτα που βλέπει ο χρήστης. Άγνωστη τιμή επιστρέφεται όπως γράφτηκε. */
export function categoryLabel(raw: unknown): string {
  const slug = resolveCategory(raw);
  if (slug) return BY_SLUG[slug].label;
  const s = String(raw ?? '').trim();
  return s || 'Άλλο';
}

/** Η οικογένεια, για ομαδοποίηση και φίλτρα. */
export function categoryFamily(raw: unknown): Family {
  const slug = resolveCategory(raw);
  return slug ? BY_SLUG[slug].family : 'other';
}

/**
 * Εκπίπτει από το εισόδημα ενοικίων.
 *
 * Δεν είναι φορολογική συμβουλή και δεν παρουσιάζεται ως τέτοια στην οθόνη:
 * είναι ένδειξη που βοηθά τον ιδιοκτήτη να μαζέψει τα σωστά χαρτιά πριν πάει
 * στον λογιστή. Άγνωστη κατηγορία θεωρείται ΜΗ εκπιπτόμενη, γιατί το λάθος
 * προς τα πάνω κοστίζει στον χρήστη πρόστιμο, ενώ προς τα κάτω μόνο έναν έλεγχο.
 */
export function isDeductible(raw: unknown): boolean {
  const slug = resolveCategory(raw);
  return slug ? BY_SLUG[slug].deductible : false;
}

/** Οι κατηγορίες μιας οικογένειας, με τη σειρά εμφάνισης. */
export const categoriesOf = (f: Family): Category[] => CATEGORIES.filter(c => c.family === f);

/**
 * Αναζήτηση για το πεδίο κατηγορίας: ένα πεδίο, όχι δύο.
 * Η παλιά φόρμα ζητούσε πρώτα Ομάδα και μετά Κατηγορία, δηλαδή δύο αποφάσεις
 * για ένα πράγμα. Εδώ γράφεις «υδρ» και βρίσκεις τον Υδραυλικό· η οικογένεια
 * προκύπτει μόνη της.
 */
export function searchCategories(q: string, limit = 8): Category[] {
  const n = norm(q);
  if (!n) return CATEGORIES.slice(0, limit);
  const starts: Category[] = [];
  const contains: Category[] = [];
  for (const c of CATEGORIES) {
    const hay = [c.label, ...c.aliases].map(norm);
    if (hay.some(h => h.startsWith(n))) starts.push(c);
    else if (hay.some(h => h.includes(n))) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// ΓΕΦΥΡΑ ΠΡΟΣ ΤΟΝ ΠΡΟΫΠΟΛΟΓΙΣΜΟ
//
// Ο Προϋπολογισμός δεν χωρά 26 γραμμές· ο χρήστης βάζει στόχο σε εννιά πράγματα,
// όχι σε είκοσι έξι. Κρατά λοιπόν εννιά κουβάδες, και εδώ ορίζεται ΜΙΑ φορά ποια
// κατηγορία πέφτει σε ποιον.
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ: ο Προϋπολογισμός είχε δικό του λεξικό, με μόνο αγγλικά
// κλειδιά. Ο χρήστης όμως καταχωρούσε «Υδραυλικός» και «Ρεύμα» στα ελληνικά.
// Καμία ελληνική λέξη δεν ταίριαζε, άρα ΚΑΘΕ χειροκίνητη δαπάνη προσγειωνόταν
// στις «Λοιπές δαπάνες» — και ο ιδιοκτήτης έβλεπε έναν προϋπολογισμό όπου η
// συντήρηση ήταν πάντα μηδέν και οι «λοιπές» πάντα τεράστιες.
// ─────────────────────────────────────────────────────────────────────────────

/** Οι εννιά κουβάδες του Προϋπολογισμού. */
export type BudgetBucket =
  | 'electricity' | 'water' | 'internet' | 'heating'
  | 'insurance' | 'subscriptions' | 'services' | 'common' | 'maintenance' | 'other';

/**
 * Τα πάγια του σπιτιού έχουν δικό τους κουβά το καθένα, γιατί εκεί ο χρήστης
 * βάζει στόχο και εκεί συγκρίνει τιμές παρόχων. Τα υπόλοιπα ακολουθούν την
 * οικογένεια: συντήρηση μαζί, επίσημα μαζί.
 */
const HOME_BUCKET: Record<string, BudgetBucket> = {
  electricity: 'electricity',
  water: 'water',
  internet: 'internet',
  gas: 'heating',          // το αέριο είναι θέρμανση για τον ιδιοκτήτη, όχι ξεχωριστό κεφάλαιο
  heating: 'heating',
  common: 'common',
  insurance: 'insurance',
  security: 'insurance',   // πάγιο μηνιαίο προστασίας, δίπλα στην ασφάλεια
  // ΟΙ ΣΥΝΔΡΟΜΕΣ ΕΦΥΓΑΝ ΑΠΟ ΤΗΝ ΑΣΦΑΛΕΙΑ. Ήταν στον ίδιο κουβά, δηλαδή ένας
  // στόχος για δύο πράγματα που δεν έχουν σχέση: το ασφάλιστρο κατοικίας είναι
  // ένα ποσό τον χρόνο που ο ιδιοκτήτης διαπραγματεύεται μία φορά, οι συνδρομές
  // είναι δεκαπέντε μικρές χρεώσεις που πληθαίνουν μόνες τους. Μαζί, η υπέρβαση
  // της μιας κρυβόταν πίσω από το περιθώριο της άλλης.
  subscription: 'subscriptions',
};

const FAMILY_BUCKET: Record<Family, BudgetBucket> = {
  home: 'other',           // δεν χρησιμοποιείται: κάθε πάγιο έχει ρητό κουβά παραπάνω
  upkeep: 'maintenance',
  official: 'services',
  // Ανακαίνιση, έπιπλα και συσκευές ΔΕΝ είναι συντήρηση. Είναι κεφάλαιο που
  // μπαίνει μία φορά. Αν έμπαιναν στη «Συντήρηση», μια ανακαίνιση 8.000 ευρώ θα
  // εμφάνιζε τον χρήστη 400% εκτός στόχου για έναν μήνα και θα κατέστρεφε
  // ταυτόχρονα τον μέσο όρο ολόκληρης της χρονιάς.
  setup: 'other',
  other: 'other',
};

/**
 * Από οτιδήποτε έχει γραφτεί στη βάση, στον κουβά του Προϋπολογισμού.
 * Άγνωστο πάει στις «Λοιπές δαπάνες», γιατί εδώ ο καλών ΕΧΕΙ ήδη αποφασίσει ότι
 * κάθε ευρώ πρέπει να προσγειωθεί κάπου: το σύνολο οφείλει να βγαίνει.
 */
export function budgetBucket(raw: unknown): BudgetBucket {
  const slug = resolveCategory(raw);
  if (!slug) return 'other';
  return HOME_BUCKET[slug] ?? FAMILY_BUCKET[BY_SLUG[slug].family];
}
