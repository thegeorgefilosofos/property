// ─────────────────────────────────────────────────────────────────────────────
// Καθολική αναγνώριση & δρομολόγηση εγγράφων (universal document routing)
//
// Ο χρήστης φωτογραφίζει ΟΤΙΔΗΠΟΤΕ: λογαριασμό, απόδειξη πληρωμής, μισθωτήριο,
// τίτλο ιδιοκτησίας/συμβόλαιο, ασφαλιστήριο, ΕΝΦΙΑ/φορολογικό, κρατικό έγγραφο.
// Το AI εξάγει πεδία· ΕΔΩ (καθαρή, δοκιμασμένη λογική) αποφασίζουμε:
//   1) τι είδος εγγράφου είναι  → classifyDocType()
//   2) αν λείπουν βασικά πεδία   → validateDoc()
//   3) πού γράφεται στη βάση     → planDocSave()  (ποιοι πίνακες/tabs ενημερώνονται)
//
// Η μονάδα ΔΕΝ αγγίζει Supabase: επιστρέφει «σχέδιο» (SavePlan) με payloads χωρίς
// ids· το component το εκτελεί προσθέτοντας property_id/user_id/bill_id. Έτσι όλη
// η επικίνδυνη λογική (κατηγοριοποίηση/δρομολόγηση) είναι 100% δοκιμάσιμη.
// ─────────────────────────────────────────────────────────────────────────────

import { EXPENSE_MAP, categorizeTransaction, derivePeriod, digitsOnly, isValidAfm } from './parse';
import { navLabel } from '../nav/labels';
import { fe } from '../core/format';
import type { EventDraft } from '../data/calendar';
import { billingPeriod, nextRenewal, reminderDate, PERIOD_LABEL, REMINDER_DAYS_BEFORE } from './invoiceIntel';

/** «2026-08-08» → «08/08/2026». Η ημερομηνία σε σημείωση διαβάζεται από άνθρωπο. */
const greekDay = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

// Ο προορισμός γράφεται ΜΙΑ φορά, από το μητρώο ονομάτων. Ήταν έξι φορές η
// σταθερά «Αρχείο», και όταν η καρτέλα μετονομάστηκε σε «Φάκελος ακινήτου» η
// οθόνη επιβεβαίωσης θα έστελνε τον χρήστη σε όνομα που δεν υπάρχει στο μενού.
const FOLDER = navLabel('documents');

export type DocType =
  | 'bill'        // λογαριασμός κοινής ωφέλειας/υπηρεσίας → Λογαριασμοί + Δαπάνες + Ημερολόγιο
  | 'payment'     // απόδειξη/βεβαίωση πληρωμής            → Δαπάνες (πληρωμένο) + συμφωνία λογαριασμού
  | 'lease'       // μισθωτήριο                            → Ενοικιαστής (ενοίκιο, διάρκεια, εγγύηση)
  | 'deed'        // τίτλος ιδιοκτησίας / συμβόλαιο αγοράς  → Στοιχεία ακινήτου + Αρχείο
  | 'insurance'   // ασφαλιστήριο ακινήτου                 → Ασφάλεια ακινήτου + Ημερολόγιο (λήξη)
  | 'tax'         // ΕΝΦΙΑ / Ε9 / φορολογικό               → ΕΝΦΙΑ + Δαπάνες + Ημερολόγιο
  | 'government'  // κρατικό/δημόσιο έγγραφο (ΑΜΑ, πολεοδομία, βεβαιώσεις) → Αρχείο
  | 'other';      // οτιδήποτε άλλο                        → Αρχείο

export interface DocTypeMeta {
  id: DocType;
  label: string;       // ελληνική ονομασία
  hint: string;        // σύντομη περιγραφή για τον χρήστη
  targets: string[];   // ποια tabs/καρτέλες ενημερώνει (για την οθόνη επιβεβαίωσης)
}

export const DOC_TYPES: DocTypeMeta[] = [
  { id: 'bill',       label: 'Λογαριασμός',          hint: 'Ρεύμα, νερό, αέριο, internet, κοινόχρηστα, υπηρεσίες', targets: ['Λογαριασμοί', 'Δαπάνες', 'Ημερολόγιο'] },
  { id: 'payment',    label: 'Απόδειξη πληρωμής',     hint: 'Βεβαίωση/απόδειξη ότι πληρώθηκε κάτι',                 targets: ['Δαπάνες', 'Λογαριασμοί'] },
  { id: 'lease',      label: 'Μισθωτήριο',            hint: 'Συμφωνητικό ενοικίασης · ενοίκιο, διάρκεια, εγγύηση', targets: ['Ενοικιαστής', FOLDER] },
  { id: 'deed',       label: 'Τίτλος / Συμβόλαιο',    hint: 'Τίτλος ιδιοκτησίας ή συμβόλαιο αγοράς',                targets: ['Στοιχεία ακινήτου', FOLDER] },
  { id: 'insurance',  label: 'Ασφαλιστήριο',          hint: 'Ασφάλεια ακινήτου · ασφάλιστρο, κάλυψη, λήξη',        targets: ['Ασφάλεια', 'Ημερολόγιο', FOLDER] },
  { id: 'tax',        label: 'Φορολογικό / ΕΝΦΙΑ',     hint: 'ΕΝΦΙΑ, Ε9, δηλώσεις, φόροι ακινήτου',                 targets: ['Στοιχεία ακινήτου', 'Δαπάνες', 'Ημερολόγιο'] },
  { id: 'government', label: 'Κρατικό έγγραφο',        hint: 'ΑΜΑ, πολεοδομία, βεβαιώσεις, δημόσια έγγραφα',        targets: [FOLDER] },
  { id: 'other',      label: 'Άλλο έγγραφο',          hint: 'Οτιδήποτε άλλο · αρχειοθετείται με ασφάλεια',         targets: [FOLDER] },
];

export const DOC_TYPE_LABELS: Record<DocType, string> =
  DOC_TYPES.reduce((a, t) => { a[t.id] = t.label; return a; }, {} as Record<DocType, string>);

// ── Η ταξινομία του Αρχείου — ΕΝΑ σημείο αλήθειας ────────────────────────────
// Οι κατηγορίες-φάκελοι του property_documents. Ζουν ΕΔΩ (και όχι στην οθόνη)
// επειδή τις γράφουν τρεις διαφορετικές διαδρομές (σάρωση, μαζικό ανέβασμα,
// διόρθωση) και μέχρι σήμερα η κάθε μία είχε δική της εκδοχή.
export const ARCHIVE_CATEGORIES = [
  'Μισθωτήριο / Συμβόλαιο', 'Ασφαλιστήριο Συμβόλαιο',
  'ΕΝΦΙΑ / Φορολογικά', 'Τεχνική Έκθεση',
  'Λογαριασμός Ρεύματος', 'Λογαριασμός Φυσικού Αερίου', 'Λογαριασμός Νερού',
  'Τηλέφωνο / Internet', 'Κοινόχρηστα',
  'Απεντόμωση / Μυοκτονία', 'Τιμολόγιο Καθαρισμού', 'Συντήρηση Πισίνας',
  'Συντήρηση Ανελκυστήρα', 'Εταιρεία Ασφαλείας', 'Άλλο Έγγραφο',
] as const;

// Κατηγορία στο Αρχείο ανά τύπο εγγράφου. Για λογαριασμούς/αποδείξεις είναι
// ΑΦΕΤΗΡΙΑ μόνο: το τελικό ράφι το δίνει το archiveCategoryFor() παρακάτω, που
// ξέρει και την κατηγορία του λογαριασμού (ρεύμα, νερό, αέριο…).
export const DOC_ARCHIVE_CATEGORY: Record<DocType, string> = {
  bill:       'Άλλο Έγγραφο',
  payment:    'Άλλο Έγγραφο',
  lease:      'Μισθωτήριο / Συμβόλαιο',
  deed:       'Μισθωτήριο / Συμβόλαιο',
  insurance:  'Ασφαλιστήριο Συμβόλαιο',
  tax:        'ΕΝΦΙΑ / Φορολογικά',
  government: 'Άλλο Έγγραφο',
  other:      'Άλλο Έγγραφο',
};

// Κατηγορία λογαριασμού (electricity, water…) → ράφι του Αρχείου.
const BILL_ARCHIVE_CATEGORY: Record<string, string> = {
  electricity: 'Λογαριασμός Ρεύματος',
  water:       'Λογαριασμός Νερού',
  gas:         'Λογαριασμός Φυσικού Αερίου',
  internet:    'Τηλέφωνο / Internet',
  common:      'Κοινόχρηστα',
  insurance:   'Ασφαλιστήριο Συμβόλαιο',
  taxes:       'ΕΝΦΙΑ / Φορολογικά',
  municipal:   'ΕΝΦΙΑ / Φορολογικά',
  security:    'Εταιρεία Ασφαλείας',
  elevator:    'Συντήρηση Ανελκυστήρα',
  pool:        'Συντήρηση Πισίνας',
  cleaner:     'Τιμολόγιο Καθαρισμού',
};

/**
 * Η κατηγορία λογαριασμού, οριστικοποιημένη. Αν η OCR δεν έδωσε έγκυρη κατηγορία,
 * την αναγνωρίζουμε από το ΟΝΟΜΑ ΤΟΥ ΠΑΡΟΧΟΥ με τους ΥΠΑΡΧΟΝΤΕΣ MATCHERS του
 * parse.ts (ο ίδιος κατάλογος που κατηγοριοποιεί τραπεζικές κινήσεις) — αντί για
 * δεύτερη, χειρόγραφη λίστα regex μέσα στην οθόνη.
 */
export function resolveBillCategory(doc: Pick<ScannedDoc, 'category' | 'provider' | 'title'>): string {
  const c = doc.category;
  if (c && c !== 'other' && EXPENSE_MAP[c]) return c;
  const guess = categorizeTransaction(`${doc.provider || ''} ${doc.title || ''}`).category;
  return EXPENSE_MAP[guess] ? guess : 'other';
}

/**
 * ΤΟ μοναδικό σημείο που αποφασίζει σε ποιον φάκελο του Αρχείου μπαίνει ένα
 * σαρωμένο έγγραφο. Πριν, το documents.ts έστελνε κάθε λογαριασμό στο «Άλλο
 * Έγγραφο» και το TabDocuments το ξαναδιόρθωνε — ενώ το DocumentScan δεν το
 * διόρθωνε καθόλου. Ο ίδιος λογαριασμός ΔΕΗ κατέληγε σε διαφορετικό φάκελο
 * ανάλογα με την οθόνη από την οποία μπήκε.
 */
export function archiveCategoryFor(doc: Pick<ScannedDoc, 'doc_type' | 'category' | 'provider' | 'title'>): string {
  const t = doc.doc_type;
  if (t !== 'bill' && t !== 'payment') return DOC_ARCHIVE_CATEGORY[t];
  return BILL_ARCHIVE_CATEGORY[resolveBillCategory(doc)] || DOC_ARCHIVE_CATEGORY[t];
}

// ── Ενιαίο σχήμα εξαγόμενων πεδίων (superset για όλους τους τύπους) ───────────
export interface ScannedDoc {
  doc_type:   DocType;
  title?:     string;    // σύντομος τίτλος (π.χ. «Μισθωτήριο — Παπαδόπουλος»)
  provider?:  string;    // πάροχος / αντισυμβαλλόμενος / φορέας / ασφαλιστική
  category?:  string;    // κατηγορία λογαριασμού (electricity…) όταν doc_type='bill'|'payment'
  amount?:    number;    // ποσό (λογαριασμός/πληρωμή/φόρος/ασφάλιστρο)
  due_date?:  string;    // λήξη πληρωμής (YYYY-MM-DD)
  issue_date?: string;   // ημερομηνία έκδοσης (YYYY-MM-DD)

  // ── Τα πέντε πεδία ταιριάσματος «ο λογαριασμός πληρώθηκε» ──────────────────
  // πάροχος (provider) · ΑΦΜ παρόχου · ποσό · ημερομηνία έκδοσης · περίοδος από–έως
  // Η περίοδος είναι ΔΟΜΗΜΕΝΗ (δύο ημερομηνίες) και όχι ελεύθερο κείμενο, γιατί
  // μόνο έτσι απαντιέται το «επικαλύπτονται;» — ο έλεγχος που εμποδίζει δύο
  // λογαριασμούς ΔΕΗ ίδιου ποσού διαφορετικού μήνα να εξοφλήσουν ο ένας τον άλλο.
  provider_afm?: string; // ΑΦΜ εκδότη (9 ψηφία· ελέγχεται με το checksum της ΑΑΔΕ)
  // Στοιχεία επικοινωνίας του εκδότη, όπως τυπώνονται στο χαρτί.
  // ΓΙΑΤΙ: η σάρωση δημιουργούσε επαφή με phone:null και email:null — δηλαδή
  // επαφή που δεν μπορείς να καλέσεις. Το τιμολόγιο του υδραυλικού έχει το
  // τηλέφωνό του τυπωμένο· δεν υπάρχει λόγος να το ξαναγράψει ο χρήστης.
  provider_phone?: string;
  provider_email?: string;
  period_from?: string;  // αρχή περιόδου δαπάνης (YYYY-MM-DD)
  period_to?:   string;  // τέλος περιόδου δαπάνης (YYYY-MM-DD)
  period?:    string;    // η περίοδος όπως γράφεται στο χαρτί (για την οθόνη)

  // μισθωτήριο
  tenant_name?: string;
  landlord_name?: string;  // εκμισθωτής (ιδιοκτήτης)
  monthly_rent?: number;
  lease_start?: string;
  lease_end?:   string;
  deposit?:     number;
  afm?:         string;

  // τίτλος / συμβόλαιο / ακίνητο
  // Συνιδιοκτήτες με ποσοστά (από τίτλο/συμβόλαιο) — για την «Κατανομή σε ιδιοκτήτες».
  owners?: { name?: string; afm?: string; pct?: number }[];
  purchase_price?: number;
  purchase_date?:  string;
  obj_value?:      number;  // αντικειμενική αξία
  atak?:           string;
  year_built?:     number;
  sqm?:            number;

  // ασφαλιστήριο
  policy_number?: string;
  premium?:       number;   // ασφάλιστρο (€)
  coverage?:      number;   // κάλυψη (€)
  expiry_date?:   string;   // λήξη ασφάλισης (YYYY-MM-DD)

  // φορολογικό
  tax_year?: number;

  // λογαριασμός — extras (συμβατά με ExtractedBill)
  kwh?: number; ert?: number; etmear?: number; dimotika?: number;
  cubic_meters?: number; meter_prev?: number; meter_current?: number;
  energy_charge?: number; network_charge?: number; millesimi?: number;
  vat_rate?: number; account_num?: string;

  // ── ΤΑ ΣΤΟΙΧΕΙΑ ΠΟΥ ΚΡΙΝΟΥΝ ΤΟΝ ΦΠΑ ────────────────────────────────────
  // Ο ιδιοκτήτης δεν θα συμπληρώσει φόρμα: θα φωτογραφίσει το τιμολόγιο. Ό,τι
  // είναι τυπωμένο πάνω του δεν ξαναρωτιέται — και αυτά τα πέντε είναι που
  // κρίνουν αν η δαπάνη είναι εγχώρια, ενδοκοινοτική λήψη ή λήψη από τρίτη
  // χώρα, δηλαδή αν τον φόρο τον αποδίδει ο ίδιος με αντίστροφη χρέωση.
  // Η συναγωγή ζει στο lib/billing/invoiceIntel.ts, όχι εδώ: εδώ είναι μόνο
  // ό,τι ΔΙΑΒΑΣΤΗΚΕ.
  /** Αριθμός ΦΠΑ εκδότη με πρόθεμα κράτους μέλους («IE6388047V»). */
  provider_vat?: string;
  /** Χώρα έδρας του εκδότη, ISO 3166-1 alpha-2. */
  provider_country?: string;
  /** ΑΦΜ του λήπτη, δηλαδή του ίδιου του χρήστη. */
  customer_afm?: string;
  /** Καθαρή αξία προ φόρου και ποσό φόρου, όταν γράφονται χωριστά. */
  net_amount?: number;
  vat_amount?: number;
  /** Κάθε πότε επαναλαμβάνεται η χρέωση· από εδώ βγαίνει η λήξη και η υπενθύμιση. */
  billing_period?: string;
  /** Το όνομα του πακέτου («Premium 4K», «Full Fiber 300»). */
  plan_name?: string;

  notes?: string;
  confidence: number;
  // Επιπλέον πεδία που πρόσθεσε χειροκίνητα ο χρήστης (ελεύθερα).
  custom?: { label: string; value: string }[];
}

// ── 1) Κατηγοριοποίηση/επιδιόρθωση τύπου ─────────────────────────────────────
// Το AI προτείνει doc_type· εδώ το επικυρώνουμε/διορθώνουμε με ντετερμινιστικά
// κλειδιά (λέξεις-κλειδιά σε τίτλο/πάροχο/σημειώσεις). Αν το AI είναι σίγουρο και
// έγκυρο, το σεβόμαστε· αλλιώς μαντεύουμε από το περιεχόμενο. Ποτέ δεν σκάει.
const norm = (s?: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const TYPE_KEYWORDS: { type: DocType; keys: string[] }[] = [
  { type: 'lease',      keys: ['μισθωτηρ', 'μισθωση', 'συμφωνητικο μισθ', 'εκμισθωτ', 'μισθωτ', 'ενοικιαστ', 'lease', 'tenancy'] },
  { type: 'insurance',  keys: ['ασφαλιστηριο', 'ασφαλεια', 'ασφαλιστρ', 'ασφαλιση', 'καλυψη', 'insurance', 'policy', 'interamerican', 'ethniki asfalis', 'εθνικη ασφαλ', 'generali', 'allianz', 'ergo', 'υδρογειος'] },
  { type: 'tax',        keys: ['ενφια', 'e9', 'ε9', 'φορολογ', 'φορος ακινητ', 'δηλωση στοιχειων', 'ααδε', 'εκκαθαρ', 'τελος ακινητ', 'tax'] },
  { type: 'deed',       keys: ['τιτλος ιδιοκτησ', 'συμβολαιο αγορ', 'αγοραπωλησ', 'συμβολαιογραφ', 'μεταγραφη', 'κτηματολογ', 'deed', 'title', 'αντικειμενικη αξ'] },
  { type: 'government', keys: ['αμα', 'πολεοδομ', 'βεβαιωση', 'δημος', 'υπηρεσια δομησ', 'αυθαιρετ', 'ταυτοτητα κτιρι', 'μηχανικ', 'εγγραφο', 'πιστοποιητικ'] },
  { type: 'payment',    keys: ['αποδειξη πληρωμ', 'βεβαιωση πληρωμ', 'εξοφληθηκε', 'εξοφληση', 'πληρωθηκε', 'receipt', 'paid', 'payment confirmation', 'αποδεικτικο πληρωμ'] },
];

const VALID_TYPES = new Set<DocType>(DOC_TYPES.map(t => t.id));

export function classifyDocType(doc: Partial<ScannedDoc>): DocType {
  const hay = norm([doc.title, doc.provider, doc.notes, doc.period].filter(Boolean).join(' '));

  // Ισχυρές ενδείξεις από ειδικά πεδία (αν το AI γέμισε π.χ. monthly_rent → μισθωτήριο).
  if (doc.monthly_rent || doc.lease_start || doc.lease_end) return 'lease';
  if (doc.policy_number || doc.premium || doc.expiry_date) return 'insurance';
  if (doc.purchase_price || doc.obj_value || doc.atak) return 'deed';

  // Λέξεις-κλειδιά περιεχομένου (προτεραιότητα: ειδικά → γενικά).
  for (const { type, keys } of TYPE_KEYWORDS) {
    if (keys.some(k => hay.includes(k))) return type;
  }

  // Σεβασμός στην πρόταση του AI αν είναι έγκυρη ΚΑΙ συγκεκριμένη (όχι «other»,
  // που σημαίνει «δεν ξέρω» — τότε συνεχίζουμε στις ευρετικές παρακάτω).
  if (doc.doc_type && doc.doc_type !== 'other' && VALID_TYPES.has(doc.doc_type)) return doc.doc_type;

  // Αν μοιάζει με λογαριασμό (έχει κατηγορία παρόχου + ποσό), θεώρησέ το λογαριασμό.
  if (doc.category && doc.category !== 'other' && doc.amount) return 'bill';

  return 'other';
}

// ── 2) Επικύρωση: τι λείπει ανά τύπο ─────────────────────────────────────────
export const DOC_FIELD_LABELS: Record<string, string> = {
  provider: 'Πάροχος / Αντισυμβαλλόμενος', amount: 'Ποσό', due_date: 'Ημ. λήξης',
  provider_afm: 'ΑΦΜ παρόχου', period_from: 'Περίοδος από', period_to: 'Περίοδος έως',
  issue_date: 'Ημ. έκδοσης',
  tenant_name: 'Ονοματεπώνυμο ενοικιαστή', monthly_rent: 'Μηνιαίο ενοίκιο',
  lease_start: 'Έναρξη μίσθωσης', lease_end: 'Λήξη μίσθωσης', deposit: 'Εγγύηση',
  premium: 'Ασφάλιστρο', expiry_date: 'Λήξη ασφάλισης', policy_number: 'Αριθμός συμβολαίου',
  purchase_price: 'Τίμημα αγοράς', obj_value: 'Αντικειμενική αξία', title: 'Τίτλος',
  tax_year: 'Έτος', category: 'Κατηγορία',
};

const has = (v: unknown) => v != null && v !== '' && !(typeof v === 'number' && v === 0);

export interface DocValidation {
  /** Χωρίς αυτά δεν αποθηκεύουμε — θα γραφτεί σκουπίδι στη βάση. */
  blocking: string[];
  /** Καλό να υπάρχουν· ο χρήστης μπορεί να προχωρήσει. */
  recommended: string[];
  /** Υπάρχουν ΑΛΛΑ είναι προφανώς λάθος (π.χ. ΑΦΜ που δεν περνά το checksum). */
  invalid: string[];
}

/**
 * Τι λείπει και τι είναι λάθος. Η διάκριση blocking/recommended μένει όπως ήταν:
 * ΔΕΝ μπλοκάρουμε τον χρήστη επειδή το χαρτί ήταν θολό. Το ΑΦΜ και η περίοδος
 * είναι *recommended* για λογαριασμό — τα ζητάμε, δεν τα απαιτούμε.
 * Το `invalid` είναι νέο και ξεχωριστό: «το διάβασα, αλλά δεν βγάζει νόημα».
 */
export function validateDoc(doc: ScannedDoc): DocValidation {
  const t = doc.doc_type;
  const blocking: string[] = [];
  const recommended: string[] = [];
  const invalid: string[] = [];

  // Το ΑΦΜ ελέγχεται όπου κι αν εμφανίζεται: αν είναι γραμμένο και δεν περνά το
  // checksum της ΑΑΔΕ, το λέμε — δεν το σώζουμε σιωπηλά ως σωστό.
  if (has(doc.provider_afm) && !isValidAfm(doc.provider_afm)) invalid.push('provider_afm');
  if (has(doc.afm) && !isValidAfm(doc.afm)) invalid.push('afm');
  // Ανάποδη περίοδος: το «από» μετά το «έως» δεν είναι ελλιπές, είναι λάθος.
  if (has(doc.period_from) && has(doc.period_to) && doc.period_from! > doc.period_to!) invalid.push('period_from');

  switch (t) {
    case 'bill':
    case 'payment':
      if (!has(doc.amount)) blocking.push('amount');
      if (!has(doc.provider)) recommended.push('provider');
      if (t === 'bill' && !has(doc.due_date)) recommended.push('due_date');
      // Τα δύο πεδία που έλειπαν τελείως από τη ροή. Χωρίς ΑΦΜ ο πάροχος είναι
      // ένα όνομα με δέκα ορθογραφίες· χωρίς περίοδο, δύο ίδιοι λογαριασμοί
      // διαφορετικού μήνα είναι ξεχώριστοι μόνο κατά τύχη.
      if (!has(doc.provider_afm)) recommended.push('provider_afm');
      if (!has(doc.period_from) || !has(doc.period_to)) recommended.push('period_from');
      break;
    case 'lease':
      if (!has(doc.tenant_name)) blocking.push('tenant_name');
      if (!has(doc.monthly_rent)) blocking.push('monthly_rent');
      if (!has(doc.lease_start)) recommended.push('lease_start');
      if (!has(doc.lease_end)) recommended.push('lease_end');
      if (!has(doc.deposit)) recommended.push('deposit');
      break;
    case 'insurance':
      if (!has(doc.provider)) blocking.push('provider');
      if (!has(doc.premium)) recommended.push('premium');
      if (!has(doc.expiry_date)) recommended.push('expiry_date');
      break;
    case 'deed':
      if (!has(doc.purchase_price) && !has(doc.obj_value)) recommended.push('purchase_price');
      break;
    case 'tax':
      if (!has(doc.amount)) recommended.push('amount');
      break;
    case 'government':
    case 'other':
      if (!has(doc.title) && !has(doc.provider)) recommended.push('title');
      break;
  }
  return { blocking, recommended, invalid };
}

// ── 2β) Κανονικοποίηση μετά την OCR ─────────────────────────────────────────
/**
 * Ντετερμινιστική εξομάλυνση ενός σαρωμένου εγγράφου, ΠΡΙΝ φανεί στον χρήστη.
 * Δεν μαντεύει τιμές: μόνο (α) καθαρίζει το ΑΦΜ σε ψηφία, (β) μεταφράζει την
 * περίοδο που το AI έδωσε ως κείμενο («Ιούνιος 2026») σε δύο ημερομηνίες, όταν
 * το κείμενο το λέει ρητά. Αν δεν το λέει, μένει κενή και η οθόνη τη ζητά.
 * Καλείται από ΟΛΕΣ τις διαδρομές σάρωσης ώστε να μην αποκλίνουν.
 */
export function normalizeScannedDoc(doc: ScannedDoc): ScannedDoc {
  const out: ScannedDoc = { ...doc };
  const afm = digitsOnly(out.provider_afm);
  out.provider_afm = afm || undefined;
  if (out.afm) out.afm = digitsOnly(out.afm) || undefined;
  if (out.customer_afm) out.customer_afm = digitsOnly(out.customer_afm) || undefined;
  // Ο ΑΡΙΘΜΟΣ ΦΠΑ ΔΕΝ ΕΙΝΑΙ ΨΗΦΙΑ. Κρατά το πρόθεμα κράτους μέλους και συχνά
  // γράμματα στο σώμα του («NL857927374B01»): ένα `digitsOnly` εδώ θα έσβηνε
  // ακριβώς την πληροφορία για την οποία τον ζητάμε.
  if (out.provider_vat) out.provider_vat = String(out.provider_vat).replace(/[\s.-]/g, '').toUpperCase() || undefined;
  // Δύο κεφαλαία γράμματα ή τίποτα: το «Ιρλανδία» και το «Ireland» δεν είναι
  // κωδικοί, και μια μισή τιμή σε πεδίο χώρας ταξιδεύει ώς τη δήλωση ΦΠΑ.
  if (out.provider_country) {
    const c = String(out.provider_country).trim().toUpperCase();
    out.provider_country = /^[A-Z]{2}$/.test(c) ? c : undefined;
  }
  if (!out.period_from || !out.period_to) {
    const p = derivePeriod(out.period);
    if (p) { out.period_from = out.period_from || p.from; out.period_to = out.period_to || p.to; }
  }
  return out;
}

// ── 3) Σχέδιο αποθήκευσης: πού γράφεται ──────────────────────────────────────
/**
 * Το παραστατικό όπως γράφεται στο Αρχείο (property_documents).
 * ΓΙΑΤΙ ΚΡΑΤΑ ΝΟΥΜΕΡΑ: μέχρι σήμερα κρατούσε μόνο κατηγορία/ημερομηνία/πάροχο,
 * και το ποσό ζούσε αποκλειστικά στα κάτοπτρα (bills/expenses). Δηλαδή η οθόνη
 * που η στρατηγική ονομάζει «η ανεξάρτητη απόδειξη» δεν μπορούσε να απαντήσει
 * «πόσα πλήρωσα σύμφωνα με τα δικά μου χαρτιά».
 */
export interface ArchivePlan {
  category: string;
  note?: string;
  date?: string;          // → doc_date (ημερομηνία ταξινόμησης)
  supplier?: string;
  amount?: number;        // → amount        (undefined = δεν διαβάστηκε, ΠΟΤΕ 0)
  provider_afm?: string;  // → provider_afm  (μόνο αν περνά το checksum)
  period_from?: string;   // → period_from
  period_to?: string;     // → period_to
  issue_date?: string;    // → issue_date    (έκδοση, διακριτή από το doc_date)
}

export interface SavePlan {
  targets: string[];                        // ετικέτες για την οθόνη «Αποθηκεύτηκε»
  bill?:     Record<string, unknown>;        // → bills (το component βάζει property_id/user_id)
  expense?:  Record<string, unknown>;        // → expenses (link bill_id αν υπάρχει)
  calendar?: EventDraft[];                   // → calendar_events (link bill_id αν υπάρχει)
  tenant?:   Record<string, unknown>;        // → tenants (upsert ανά property)
  property?: Record<string, unknown>;        // → user_properties (ΜΟΝΟ ασφαλείς στήλες)
  settings?: Record<string, unknown>;        // → property_settings (π.χ. ασφάλεια — καρτέλα Ρυθμίσεις)
  archive?:  ArchivePlan;                    // → property_documents (το αρχείο πρωτότυπο)
  reconcile?: boolean;                       // payment: προσπάθησε συμφωνία με εκκρεμή λογαριασμό
  commonMonthAmount?: number;                // κοινόχρηστα: ποσό μήνα για ιστορικό
  commonMillesimi?:   number;                // κοινόχρηστα: χιλιοστά
}

const iso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');

// Ο κανόνας «συμπληρώνουμε κενά, δεν διορθώνουμε γεμάτα» ζει στο lib/core/prefill.ts,
// γιατί τον χρειάζεται και ο οδηγός προσθήκης ακινήτου — όχι μόνο η σάρωση.

// Δομημένη σημείωση κατανάλωσης (ίδια λογική με BillsAIScan) για λογαριασμούς.
function consumptionNote(d: ScannedDoc): string {
  return [
    d.kwh ? `${d.kwh} kWh` : '',
    d.cubic_meters ? `${d.cubic_meters} m³` : '',
    (d.meter_prev != null && d.meter_current != null) ? `Ένδειξη από ${d.meter_prev} σε ${d.meter_current}` : '',
    d.millesimi ? `${d.millesimi}‰` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * Καθαρή δρομολόγηση: από ScannedDoc → SavePlan. Δεν αγγίζει βάση.
 * @param doc   τα (επεξεργασμένα από τον χρήστη) πεδία
 * @param today ISO ημερομηνία σήμερα (περνιέται για ντετερμινιστικά τεστ)
 */
export function planDocSave(doc: ScannedDoc, today: string): SavePlan {
  const t = doc.doc_type;
  const provider = (doc.provider || '').trim();
  const customNote = (doc.custom || []).filter(c => c.label && c.value)
    .map(c => `${c.label}: ${c.value}`).join(' · ');
  const baseNote = [doc.notes || '', customNote].filter(Boolean).join(' · ');
  // Ημερομηνία εγγράφου για το Αρχείο — η πιο σχετική ανά τύπο.
  const archiveDate = iso(doc.issue_date) || iso(doc.due_date) || iso(doc.purchase_date)
    || iso(doc.lease_start) || iso(doc.expiry_date) || '';
  // Κάθε σαρωμένο έγγραφο αρχειοθετείται πάντα (το πρωτότυπο) στο σωστό ράφι.
  // Πάροχος/αντισυμβαλλόμενος → ώστε το Αρχείο να ομαδοποιεί το σαρωμένο έγγραφο «ανά πάροχο».
  // ΤΑ ΝΟΥΜΕΡΑ ΜΠΑΙΝΟΥΝ ΣΤΟ ΠΑΡΑΣΤΑΤΙΚΟ, όχι μόνο στο κάτοπτρο: ποσό, ΑΦΜ
  // παρόχου (μόνο αν περνά το checksum — άκυρο ΑΦΜ δεν αποθηκεύεται ως σωστό),
  // περίοδος από–έως και ημερομηνία έκδοσης. Ό,τι δεν διαβάστηκε μένει undefined
  // (→ NULL στη βάση) ώστε να διακρίνεται από το «διάβασα μηδέν».
  const docAmount = doc.amount ?? (t === 'insurance' ? doc.premium : undefined);
  const afm = digitsOnly(doc.provider_afm);
  const archive: ArchivePlan = {
    category: archiveCategoryFor(doc),
    date: archiveDate || undefined,
    supplier: provider || undefined,
    amount: typeof docAmount === 'number' && docAmount > 0 ? docAmount : undefined,
    provider_afm: afm && isValidAfm(afm) ? afm : undefined,
    period_from: iso(doc.period_from) || undefined,
    period_to: iso(doc.period_to) || undefined,
    issue_date: iso(doc.issue_date) || undefined,
  };

  if (t === 'bill' || t === 'payment') {
    const cat = resolveBillCategory(doc);
    const map = EXPENSE_MAP[cat];
    const paid = t === 'payment';
    const cons = consumptionNote(doc);
    const notes = [`AI σάρωση`, cons, baseNote, doc.account_num ? `Παροχή: ${doc.account_num}` : '']
      .filter(Boolean).join(' · ');
    const expDate = iso(doc.due_date) || iso(doc.issue_date) || today;
    // Η περίοδος γράφεται και στον λογαριασμό (`bills.period`, στήλη που υπήρχε και
    // έμενε κενή). Χωρίς αυτό, η επόμενη απόδειξη δεν έχει με τι να συγκρίνει την
    // περίοδό της και δύο μήνες ίδιου ποσού ξαναγίνονται διφορούμενοι.
    const periodText = (doc.period || '').trim()
      || (iso(doc.period_from) && iso(doc.period_to) ? `${iso(doc.period_from)} έως ${iso(doc.period_to)}` : '');

    const plan: SavePlan = {
      targets: paid ? ['Δαπάνες', 'Λογαριασμοί'] : ['Λογαριασμοί', 'Δαπάνες'],
      bill: {
        category: cat,
        name: `${provider || map.cat}${periodText ? ` — ${periodText}` : ''}`,
        period: periodText || null,
        amount: doc.amount || 0, paid, due_date: iso(doc.due_date) || null,
        kwh: doc.kwh || null, ert: doc.ert || null, etmear: doc.etmear || null,
        dimotika: doc.dimotika || null, vat_rate: String(doc.vat_rate || 6),
        notes, recurring: false,
      },
      expense: {
        description: `${map.cat} — ${provider}${doc.period ? ` (${doc.period})` : ''}`,
        amount: doc.amount || 0, category: map.cat, expense_group: map.group,
        date: expDate, paid_by: 'owner', paid,
        notes: `Από σάρωση${cons ? ` · ${cons}` : ''}${baseNote ? ` · ${baseNote}` : ''}`,
      },
      archive,
      reconcile: paid,
    };
    // Υπενθύμιση πληρωμής μόνο για απλήρωτους λογαριασμούς με ημ. λήξης.
    if (!paid && iso(doc.due_date)) {
      plan.calendar = [{
        title: `Πληρωμή: ${provider || map.cat}`, category: 'bills',
        event_date: iso(doc.due_date), amount: doc.amount || 0,
        notes: `Από σάρωση${cons ? ` · ${cons}` : ''}`,
      }];
      plan.targets.push('Ημερολόγιο');
    }

    // ── Η ΕΠΟΜΕΝΗ ΧΡΕΩΣΗ, ΟΤΑΝ ΤΟ ΧΑΡΤΙ ΛΕΕΙ ΚΑΘΕ ΠΟΤΕ ────────────────────
    // Ο χρήστης σαρώνει μια απόδειξη συνδρομής και δεν κάνει τίποτε άλλο. Αν το
    // παραστατικό γράφει «ετήσια», ξέρουμε πότε ξαναχρεώνεται: το app βάζει
    // μόνο του την ημερομηνία στο ημερολόγιο, ώστε να προλάβει να ακυρώσει ή να
    // αλλάξει πακέτο ΠΡΙΝ φύγουν τα χρήματα, όχι αφού.
    //
    // Η ΑΦΕΤΗΡΙΑ ΕΙΝΑΙ Η ΕΚΔΟΣΗ, ΟΧΙ Η ΛΗΞΗ ΠΛΗΡΩΜΗΣ. Η ημερομηνία λήξης
    // πληρωμής είναι πότε πρέπει να πληρώσεις ΑΥΤΟ το παραστατικό· η επόμενη
    // περίοδος μετρά από τότε που εκδόθηκε.
    const period = billingPeriod(doc.billing_period);
    const renewal = nextRenewal(iso(doc.issue_date) || expDate, period);
    if (renewal) {
      (plan.calendar ||= []).push({
        title: `Ανανέωση: ${provider || map.cat}`,
        category: 'contract',
        event_date: renewal,
        amount: doc.amount || null,
        priority: 'high',
        notes: [
          `${PERIOD_LABEL[period!]} χρέωση`,
          `Ειδοποίηση ${REMINDER_DAYS_BEFORE} ημέρες πριν, στις ${greekDay(reminderDate(renewal))}`,
          'Πρόλαβε να ακυρώσεις ή να αλλάξεις πακέτο πριν τη χρέωση',
        ].join(' · '),
      });
      if (!plan.targets.includes('Ημερολόγιο')) plan.targets.push('Ημερολόγιο');
    }
    if (cat === 'common') {
      if (doc.amount) plan.commonMonthAmount = doc.amount;
      if (doc.millesimi) plan.commonMillesimi = doc.millesimi;
      plan.targets.push('Κοινόχρηστα');
    }
    return plan;
  }

  if (t === 'lease') {
    return {
      targets: ['Ενοικιαστής', FOLDER],
      tenant: {
        full_name: (doc.tenant_name || '').trim(),
        monthly_rent: doc.monthly_rent || null,
        lease_start: iso(doc.lease_start) || null,
        lease_end: iso(doc.lease_end) || null,
        deposit_amount: doc.deposit || null,
        afm: (doc.afm || '').trim() || null,
        notes: baseNote || null,
      },
      archive,
    };
  }

  if (t === 'insurance') {
    // Η ασφάλεια αποθηκεύεται στο property_settings (καρτέλα Ρυθμίσεις — εκεί που
    // ο χρήστης βλέπει τα στοιχεία ασφάλισης). Δεν υπάρχει στήλη ποσού εκεί, γι'
    // αυτό το ασφάλιστρο καταγράφεται ως έξοδο (Ασφάλεια Κτιρίου).
    const coverageNote = doc.coverage ? `Κάλυψη: ${fe(doc.coverage)}` : '';
    const insNote = [coverageNote, baseNote].filter(Boolean).join(' · ');
    const plan: SavePlan = {
      targets: ['Ασφάλεια', 'Αρχείο'],
      settings: {
        insurance_company: provider || null,
        insurance_policy: (doc.policy_number || '').trim() || null,
        insurance_expiry: iso(doc.expiry_date) || null,
      },
      archive: { ...archive, note: insNote || undefined },
    };
    if (doc.premium) {
      const map = EXPENSE_MAP.insurance;
      plan.expense = {
        description: `${map.cat}${provider ? ` — ${provider}` : ''}${doc.policy_number ? ` (Αρ. ${doc.policy_number})` : ''}`,
        amount: doc.premium, category: map.cat, expense_group: map.group,
        date: iso(doc.issue_date) || today, paid_by: 'owner', paid: false,
        notes: [`Από σάρωση ασφαλιστηρίου`, insNote].filter(Boolean).join(' · '),
      };
      plan.targets.push('Δαπάνες');
    }
    // Υπενθύμιση ανανέωσης πριν τη λήξη.
    if (iso(doc.expiry_date)) {
      // Η ΚΑΤΗΓΟΡΙΑ ΗΤΑΝ 'insurance', ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ. Δεν είναι μία από τις
      // επτά του ημερολογίου ούτε στον πίνακα ψευδωνύμων, οπότε η υπενθύμιση
      // λήξης ασφαλιστηρίου κατέληγε «Υπενθύμιση» αντί για «Συμβόλαιο» — και
      // κανένα φίλτρο συμβολαίων δεν την έβρισκε. Ο τύπος το πιάνει πλέον.
      plan.calendar = [{
        title: `Λήξη ασφάλισης: ${provider || 'ακίνητο'}`, category: 'contract',
        event_date: iso(doc.expiry_date), amount: doc.premium || null,
        priority: 'high',
        notes: [`Ανανέωση ασφαλιστηρίου`, doc.policy_number ? `Αρ. ${doc.policy_number}` : '', baseNote].filter(Boolean).join(' · '),
      }];
      plan.targets.push('Ημερολόγιο');
    }
    return plan;
  }

  if (t === 'deed') {
    // Ο ΑΤΑΚ ΠΑΕΙ ΣΤΗ ΣΤΗΛΗ ΤΟΥ, ΟΧΙ ΣΕ ΣΗΜΕΙΩΣΗ.
    //
    // Εδώ υπήρχε ένας φόβος γραμμένος σε σχόλιο: ότι οι στήλες ΑΤΑΚ, αντικειμενική
    // και ημερομηνία αγοράς ίσως δεν υπάρχουν, άρα ας κρατηθούν σε ελεύθερο κείμενο
    // «για να μη χαθούν». Ρώτησα τη βάση: `user_properties.atak` (text),
    // `obj_value` (numeric), `purchase_date` (date) — υπάρχουν και οι τρεις, και ο
    // οδηγός προσθήκης ακινήτου ήδη γράφει στην πρώτη.
    //
    // Το κόστος του φόβου ήταν ορατό στον χρήστη: σαρώνει το συμβόλαιο, η εφαρμογή
    // ΔΙΑΒΑΖΕΙ τον ΑΤΑΚ, τον θάβει σε σημείωση — και μετά η καρτέλα συμφωνίας Ε2
    // του λέει «Λείπει ο ΑΤΑΚ. Συμπλήρωσέ τον για να γίνει η σύγκριση». Η ίδια
    // εφαρμογή, στην ίδια οθόνη, ζητά αυτό που μόλις πέταξε.
    //
    // Στη σημείωση μένει μόνο ό,τι ΔΕΝ έχει στήλη (ο συμβολαιογράφος). Ό,τι έχει
    // στήλη γράφεται μία φορά, στη στήλη του — όχι και στα δύο.
    const property: Record<string, unknown> = {};
    if (doc.purchase_price) property.purchase_price = doc.purchase_price;
    if (doc.year_built) property.year_built = doc.year_built;
    if (doc.sqm) property.sqm = doc.sqm;
    if ((doc.atak || '').trim()) property.atak = (doc.atak || '').trim();
    if (doc.obj_value) property.obj_value = doc.obj_value;
    if (iso(doc.purchase_date)) property.purchase_date = iso(doc.purchase_date);
    const extras = [
      provider ? `Συμβολαιογράφος/Πηγή: ${provider}` : '',
      baseNote,
    ].filter(Boolean).join(' · ');
    const plan: SavePlan = { targets: [FOLDER], archive: { ...archive, note: extras || undefined } };
    if (Object.keys(property).length) { plan.property = property; plan.targets.unshift('Στοιχεία ακινήτου'); }
    return plan;
  }

  if (t === 'tax') {
    // Δεν υπάρχει στήλη ΕΝΦΙΑ στο ακίνητο: το ποσό γίνεται έξοδο + υπενθύμιση.
    const plan: SavePlan = { targets: [FOLDER], archive: { ...archive, note: baseNote || undefined } };
    if (doc.amount) {
      const map = EXPENSE_MAP.taxes;
      plan.expense = {
        description: `${map.cat}${doc.tax_year ? ` ${doc.tax_year}` : ''}${provider ? ` — ${provider}` : ''}`,
        amount: doc.amount, category: map.cat, expense_group: map.group,
        date: iso(doc.due_date) || iso(doc.issue_date) || today, paid_by: 'owner', paid: false,
        notes: [`Από σάρωση φορολογικού`, baseNote].filter(Boolean).join(' · '),
      };
      plan.targets.unshift('Δαπάνες');
      if (iso(doc.due_date)) {
        plan.calendar = [{
          title: `Πληρωμή ${map.cat}${doc.tax_year ? ` ${doc.tax_year}` : ''}`, category: 'tax',
          event_date: iso(doc.due_date), amount: doc.amount,
          priority: 'high',
          notes: `Από σάρωση φορολογικού εγγράφου`,
        }];
        plan.targets.push('Ημερολόγιο');
      }
    }
    return plan;
  }

  // government / other → μόνο αρχειοθέτηση (με ό,τι σημείωσε το AI/ο χρήστης).
  return { targets: [FOLDER], archive: { ...archive, note: baseNote || undefined } };
}

// Σύντομη περίληψη για την οθόνη επιβεβαίωσης.
export function docSummaryLine(doc: ScannedDoc): string {
  const parts: string[] = [];
  if (doc.provider) parts.push(doc.provider);
  else if (doc.tenant_name) parts.push(doc.tenant_name);
  else if (doc.title) parts.push(doc.title);
  if (doc.amount) parts.push(fe(doc.amount));
  else if (doc.monthly_rent) parts.push(`${fe(doc.monthly_rent)}/μήνα`);
  else if (doc.premium) parts.push(fe(doc.premium));
  return parts.join(' — ') || DOC_TYPE_LABELS[doc.doc_type];
}
