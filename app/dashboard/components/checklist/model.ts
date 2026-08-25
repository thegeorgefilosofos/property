// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΟΝΤΕΛΟ ΤΩΝ ΕΚΚΡΕΜΟΤΗΤΩΝ: ΤΥΠΟΙ, ΚΑΤΑΛΟΓΟΙ, ΠΡΟΤΥΠΑ
// ─────────────────────────────────────────────────────────────────────────
// Τι είναι μια εκκρεμότητα, ποιες κατηγορίες υπάρχουν, ποιες προτεραιότητες,
// και τι περιέχει κάθε έτοιμο πρότυπο. Τίποτα εδώ δεν εκτελείται και τίποτα
// δεν ξέρει από οθόνη: τα διαβάζουν και οι πέντε οθόνες των εκκρεμοτήτων.
// ═══════════════════════════════════════════════════════════════════════════
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/checklist/taxonomy'
import type { FieldContext } from '@/lib/property/fields'
import type { Who } from '@/lib/accounting/dossier'

export type Priority = 'critical' | 'high' | 'normal' | 'low'
export type Status   = 'pending' | 'in_progress' | 'done' | 'skipped'
export type Recurring = 'none' | 'monthly' | 'quarterly' | 'yearly'
export type ViewMode  = 'list' | 'timeline'
export type FilterStatus = 'all' | 'pending' | 'in_progress' | 'done' | 'overdue'

export interface SubTask  { id: string; text: string; done: boolean }
export interface Comment  { id: string; text: string; ts: string }
/** Το παραστατικό που δικαιολογεί το `actual_cost`. Ζει στο JSON της σημείωσης,
 *  χωρίς αλλαγή σχήματος: το ποσό δεν υπάρχει ποτέ χωρίς αυτό. */
export interface ItemReceipt {
  path: string; name: string; docId?: string | null
  amount: number; date: string; provider?: string | null; scanned_at: string
}
export interface ChecklistItem {
  id: string; property_id: string; user_id: string; category: string
  description: string; note: string | null; completed: boolean
  completed_at: string | null; created_at: string; priority: Priority
  due_date: string | null; start_date?: string | null; recurring: Recurring
  assigned_contact_id: string | null; assigned_contact_name: string | null
  estimated_cost: number; actual_cost: number; status: Status
  template_id: string | null; sort_order: number
  depends_on?: string | null; calendar_event_id?: string | null; expense_id?: string | null
  _subtasks?: SubTask[]; _comments?: Comment[]; _tags?: string[]
  /** Ταυτότητα παραγόμενης υποχρέωσης (`tax:` / `law:`). Κενό στις δικές του. */
  _ref?: string | null
  /** Επίσημη πηγή, ώστε ο χρήστης να μπορεί να επιβεβαιώσει μόνος του. */
  _src?: string | null
  /** Ποιος την κάνει, στο λεξιλόγιο του φακέλου του λογιστή. */
  _who?: Who | null
  _receipt?: ItemReceipt | null
}
export interface Contact { id: string; full_name: string; role: string; phone?: string | null; property_id?: string | null }
export interface SmartSuggestion { title: string; reason: string; templateKey: string }
export type ProfileType = 'individual' | 'professional'
export interface TabChecklistProps { propertyId: string; userId: string }
// ═══ ΕΝΝΕΑ ΚΑΤΗΓΟΡΙΕΣ, ΠΕΝΤΕ ΧΡΩΜΑΤΑ, ΚΑΝΕΝΑ ΝΟΗΜΑ ════════════════════════
// Η «Παράδοση Ακινήτου» ήταν πράσινη και η «Αποχώρηση Ενοικιαστή» κόκκινη. Μια
// αποχώρηση δεν είναι αποτυχία και μια παράδοση δεν είναι επιτυχία· είναι δύο
// στιγμές της ίδιας μίσθωσης. Το «Airbnb» ήταν επίσης κόκκινο, η «Συντήρηση»
// πορτοκαλί, τα «Νομικά» μπλε. Πέντε σημασιολογικά χρώματα σε μια οθόνη που
// απλώς ταξινομεί και το μάτι ψάχνει νόημα που δεν υπάρχει.
//
// Την κατηγορία τη λέει το ΟΝΟΜΑ της. Η τελεία μένει για να δένει οπτικά τη
// σειρά με την επικεφαλίδα της, σε έναν ουδέτερο τόνο. Χρώμα κρατά μόνο ό,τι
// σημαίνει «κάτι πρέπει να γίνει»: η εκπρόθεσμη ημερομηνία.
export const CATEGORY_DOT = 'var(--text-tertiary)'
// ΟΙ ΕΤΙΚΕΤΕΣ ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΕΔΩ. Έρχονται από το lib/checklist/taxonomy.ts, τη
// ΜΙΑ πηγή που μοιράζονται Εκκρεμότητες και Χαρτοφυλάκιο. Γραμμένες σε δύο
// αρχεία, είχαν ήδη αποκλίνει: «Παράδοση Ακινήτου» εδώ, «Παράδοση ακινήτου»
// εκεί και «Short-term / Airbnb» στα αγγλικά. Δικό μας μένει ΜΟΝΟ το χρώμα.
export const CATEGORIES = TASK_CATEGORIES.map(c => ({ ...c, color: CATEGORY_DOT }))
// ΤΕΣΣΕΡΑ ΧΡΩΜΑΤΑ ΓΙΑ ΤΕΣΣΕΡΙΣ ΠΡΟΤΕΡΑΙΟΤΗΤΕΣ, ΤΕΣΣΕΡΑ ΓΙΑ ΤΕΣΣΕΡΙΣ
// ΚΑΤΑΣΤΑΣΕΙΣ: οκτώ αποχρώσεις σε μια οθόνη που ήδη έχει κατηγορίες,
// ημερομηνίες και σήματα. Και τα φόντα ήταν καρφωμένα rgba του iOS, που δεν
// άλλαζαν ποτέ με το θέμα — γαλάζιο-σε-γαλάζιο στο σκούρο.
//
// Ό,τι απαιτεί ενέργεια κρατά χρώμα: το «Κρίσιμο» και το «Υψηλή». Το
// «Κανονική», το «Χαμηλή», το «Εκκρεμεί» και το «Παραλείφθηκε» δεν έχουν τίποτα
// να πουν με απόχρωση. Η ολοκλήρωση παίρνει το χρώμα των ενεργειών, όχι του
// επιτεύγματος: δεκαοκτώ πράσινα κουμπάκια σε μια λίστα γίνονται το πιο δυνατό
// χρώμα της οθόνης και το σήμα της εφαρμογής μένει για τα δευτερεύοντα.
// Ίδια αρχή: η σειρά και τα ονόματα από την κοινή πηγή, το χρώμα από εδώ.
export const PRI_TONE: Record<string, { color: string; bg: string }> = {
  critical: { color: 'var(--negative)',       bg: 'var(--negative-soft)' },
  high:     { color: 'var(--warning)',        bg: 'var(--warning-soft)'  },
  normal:   { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)'   },
  low:      { color: 'var(--text-tertiary)',  bg: 'var(--bg-elevated)'   },
}
export const STATUS_TONE: Record<string, { color: string; bg: string }> = {
  pending:     { color: 'var(--text-tertiary)',  bg: 'var(--bg-elevated)' },
  in_progress: { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
  done:        { color: 'var(--accent)',         bg: 'var(--accent-soft)' },
  skipped:     { color: 'var(--text-tertiary)',  bg: 'var(--bg-elevated)' },
}
export const NEUTRAL_TONE = { color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)' }
export const PRIORITIES = TASK_PRIORITIES.map(p => ({ ...p, ...(PRI_TONE[p.value] ?? NEUTRAL_TONE) }))
export const STATUSES   = TASK_STATUSES.map(s => ({ ...s, ...(STATUS_TONE[s.value] ?? NEUTRAL_TONE) }))
export const RECURRING_OPTIONS = [
  { value: 'none',      label: 'Χωρίς επανάληψη' },
  { value: 'monthly',   label: 'Μηνιαία' },
  { value: 'quarterly', label: 'Τριμηνιαία' },
  { value: 'yearly',    label: 'Ετήσια' },
]
// Μόνο χρήσιμες, λειτουργικές ετικέτες — όχι διπλότυπα της προτεραιότητας/κατάστασης.
export const ITEM_TAGS = ['Εγγύηση', 'Ασφάλεια', 'Εξωτερικός συνεργάτης', 'DIY']

// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΡΟΤΥΠΑ ΔΕΝ ΞΕΡΟΥΝ ΠΟΣΟ ΚΟΣΤΙΖΕΙ ΤΙΠΟΤΑ.
//
// Εδώ υπήρχαν 24 σταθερά κόστη («80 € service λέβητα», «500 € νομικός έλεγχος»,
// «600 € συμβολαιογράφος») χωρίς πηγή, έτος ή περιοχή. Αθροίζονταν και
// εμφανίζονταν ως «~1.850 €» πάνω στο πρότυπο, ως «Εκτιμώμενο κόστος» στα KPI,
// στο Excel και στο PDF — και το χειρότερο, γράφονταν ως ΕΚΚΡΕΜΕΙΣ ΔΑΠΑΝΕΣ στον
// πίνακα expenses. Δηλαδή νούμερα που κανείς δεν μέτρησε έμπαιναν στον
// προϋπολογισμό και στο σύνολο δαπανών που πάει στο Ε2.
//
// Ένα service λέβητα στην Κοζάνη και ένα στο Κολωνάκι δεν κοστίζουν το ίδιο και
// ένας συμβολαιογράφος αμείβεται με ποσοστό επί της αξίας. Το πρότυπο ξέρει ΤΙ
// πρέπει να γίνει· το ΠΟΣΟ το λέει μόνο το τιμολόγιο.
//
// Το `when` υπάρχει για τον ίδιο λόγο που υπάρχει το lib/property/fields.ts:
// «ανάλογα με το τι θα επιλέξεις βλέπεις και τα αντίστοιχα πεδία, όχι παντού τα
// πάντα». Ο ιδιοκτήτης κενού ακινήτου δεν χρειάζεται λίστα αποχώρησης ενοικιαστή.
// ═══════════════════════════════════════════════════════════════════════════
export interface TemplateItem { description: string; category: string; priority: Priority; recurring?: Recurring; depends_on_idx?: number }
export interface Template { label: string; items: TemplateItem[]; when?: (c: FieldContext) => boolean; why?: string }

export const TEMPLATES: Record<string, Template> = {
  checkin: { label: 'Νέος Ενοικιαστής', when: c => c.status === 'rent_long' || c.status === 'vacant', why: 'Μακροχρόνια μίσθωση', items: [
    { description: 'Φωτογράφηση κάθε δωματίου (before)', category: 'checkin', priority: 'critical' },
    { description: 'Παράδοση κλειδιών, καταγραφή αριθμού σετ', category: 'checkin', priority: 'critical' },
    { description: 'Καταγραφή μετρητή ΔΕΗ', category: 'checkin', priority: 'critical' },
    { description: 'Καταγραφή μετρητή ΕΥΔΑΠ', category: 'checkin', priority: 'critical' },
    { description: 'Υπογραφή πρωτοκόλλου παράδοσης', category: 'checkin', priority: 'critical' },
    { description: 'Δήλωση μισθωτηρίου στην ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Ενημέρωση ΔΟΥ', category: 'legal', priority: 'high' },
    { description: 'Εξήγηση λειτουργίας θέρμανσης / boiler', category: 'checkin', priority: 'high' },
    { description: 'Εξήγηση λειτουργίας alarm', category: 'checkin', priority: 'high' },
    { description: 'Ενεργοποίηση ασφαλιστηρίου', category: 'checkin', priority: 'high' },
    { description: 'Αλλαγή κωδικών WiFi', category: 'checkin', priority: 'normal' },
    { description: 'Μεταβίβαση λογαριασμών ΔΕΗ / ΕΥΔΑΠ', category: 'checkin', priority: 'normal' },
  ]},
  checkout: { label: 'Αποχώρηση Ενοικιαστή', when: c => c.status === 'rent_long', why: 'Υπάρχει ενοικιαστής', items: [
    { description: 'Επιστροφή κλειδιών, έλεγχος αριθμού', category: 'checkout', priority: 'critical' },
    { description: 'Τελική ανάγνωση μετρητή ΔΕΗ', category: 'checkout', priority: 'critical' },
    { description: 'Τελική ανάγνωση μετρητή ΕΥΔΑΠ', category: 'checkout', priority: 'critical' },
    { description: 'Φωτογράφηση κατάστασης vs check-in', category: 'checkout', priority: 'critical' },
    { description: 'Λήξη μισθωτηρίου ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Διακανονισμός εγγύησης', category: 'checkout', priority: 'critical' },
    { description: 'Τελικός καθαρισμός ακινήτου', category: 'checkout', priority: 'high' },
    { description: 'Έλεγχος ζημιών, αξιολόγηση κόστους', category: 'checkout', priority: 'high' },
    { description: 'Ακύρωση / μεταβίβαση ΔΕΗ / ΕΥΔΑΠ', category: 'checkout', priority: 'high' },
    { description: 'Αλλαγή κλειδαριάς', category: 'checkout', priority: 'normal' },
    { description: 'Ενημέρωση ΔΟΥ για λήξη μίσθωσης', category: 'legal', priority: 'normal' },
  ]},
  maintenance: { label: 'Ετήσια Συντήρηση', items: [
    { description: 'Service καλοριφέρ / λέβητα', category: 'maintenance', priority: 'critical', recurring: 'yearly' },
    { description: 'Έλεγχος πυροσβεστήρων', category: 'maintenance', priority: 'critical', recurring: 'yearly' },
    { description: 'Τσεκ ηλεκτρολογικού πίνακα', category: 'maintenance', priority: 'high', recurring: 'yearly' },
    { description: 'Καθαρισμός υδρορροών', category: 'maintenance', priority: 'high', recurring: 'yearly' },
    { description: 'Έλεγχος στέγης / ταράτσας', category: 'maintenance', priority: 'high', recurring: 'yearly' },
    { description: 'Service κλιματιστικών', category: 'maintenance', priority: 'high', recurring: 'yearly' },
    { description: 'Απολύμανση / pest control', category: 'maintenance', priority: 'normal', recurring: 'yearly' },
    { description: 'Έλεγχος μόνωσης παραθύρων', category: 'maintenance', priority: 'normal', recurring: 'yearly' },
    { description: 'Βαφή / ανανέωση κοινόχρηστων', category: 'maintenance', priority: 'low', recurring: 'yearly' },
    { description: 'Service ανελκυστήρα', category: 'maintenance', priority: 'high', recurring: 'quarterly' },
  ]},
  // ΤΟ Ε2, Ο ΕΝΦΙΑ ΚΑΙ ΤΟ Ε9 ΕΦΥΓΑΝ ΑΠΟ ΕΔΩ. Είχαν την ίδια υποχρέωση χωρίς
  // ημερομηνία, δίπλα σε ένα ημερολόγιο που την έχει με ημερομηνία, πηγή και
  // «ποιος το κάνει». Δύο γραμμές για το ίδιο πράγμα σημαίνει ότι ο χρήστης
  // τσεκάρει τη μία και νομίζει ότι τελείωσε. Έρχονται πλέον από τις
  // «Υποχρεώσεις & νομοθεσία» (lib/tax/greekTaxCalendar.ts).
  legal: { label: 'Έγγραφα ακινήτου', items: [
    { description: 'Ανανέωση ασφαλιστηρίου ακινήτου', category: 'legal', priority: 'critical', recurring: 'yearly' },
    { description: 'Έλεγχος ΠΕΑ (Πιστοποιητικό Ενεργειακής Απόδοσης)', category: 'legal', priority: 'high' },
    { description: 'Έλεγχος βεβαίωσης μηχανικού', category: 'legal', priority: 'high' },
    { description: 'Πληρωμή δημοτικών τελών', category: 'financial', priority: 'normal', recurring: 'yearly' },
  ]},
  renovation: { label: 'Ανακαίνιση', when: c => c.status === 'renovation' || c.propertyCount >= 3, why: 'Ακίνητο σε εργασίες', items: [
    { description: 'Αίτηση άδειας εργασιών', category: 'renovation', priority: 'critical' },
    { description: 'Επιλογή και ανάθεση εργολάβου', category: 'renovation', priority: 'critical', depends_on_idx: 0 },
    { description: 'Σύνταξη σύμβασης εργολάβου', category: 'renovation', priority: 'critical', depends_on_idx: 1 },
    { description: 'Φωτογράφηση πριν την έναρξη', category: 'renovation', priority: 'critical' },
    { description: 'Έλεγχος ηλεκτρολογικής εγκατάστασης', category: 'renovation', priority: 'high' },
    { description: 'Φάση 1, Κατεδάφιση', category: 'renovation', priority: 'normal', depends_on_idx: 2 },
    { description: 'Φάση 2, Κατασκευή', category: 'renovation', priority: 'normal', depends_on_idx: 5 },
    { description: 'Φάση 3, Φινίρισμα', category: 'renovation', priority: 'normal', depends_on_idx: 6 },
    { description: 'Τελική επιθεώρηση και παραλαβή', category: 'renovation', priority: 'critical', depends_on_idx: 7 },
  ]},
  airbnb: { label: 'Short-term / Airbnb', when: c => c.status === 'rent_short', why: 'Βραχυχρόνια μίσθωση', items: [
    { description: 'Ρύθμιση smart lock / κωδικός check-in', category: 'airbnb', priority: 'critical' },
    { description: 'Δημιουργία οδηγού φιλοξενίας', category: 'airbnb', priority: 'critical' },
    { description: 'Καταχώρηση σε Airbnb / Booking.com', category: 'airbnb', priority: 'critical' },
    { description: 'Φωτογράφηση από επαγγελματία', category: 'airbnb', priority: 'high' },
    { description: 'Εγγραφή στο Μητρώο Βραχυχρόνιας Μίσθωσης ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Ρύθμιση καναλιού καθαριότητας', category: 'airbnb', priority: 'high' },
    { description: 'Ανεφοδιασμός (σαπούνια, χαρτί και άλλα)', category: 'airbnb', priority: 'normal', recurring: 'monthly' },
    { description: 'Τσεκ κλιματισμού πριν κάθε σεζόν', category: 'airbnb', priority: 'high', recurring: 'quarterly' },
  ]},
  purchase: { label: 'Αγορά Ακινήτου', when: c => c.propertyCount >= 3 || c.status === 'for_sale', why: 'Χαρτοφυλάκιο σε κίνηση', items: [
    { description: 'Νομικός έλεγχος τίτλων ιδιοκτησίας', category: 'purchase', priority: 'critical' },
    { description: 'Τεχνικός έλεγχος ακινήτου από μηχανικό', category: 'purchase', priority: 'critical' },
    { description: 'Έλεγχος βαρών / υποθηκών κτηματολόγιο', category: 'purchase', priority: 'critical' },
    { description: 'Πιστοποιητικό ενεργειακής απόδοσης ΠΕΑ', category: 'purchase', priority: 'critical' },
    { description: 'Συμβολαιογράφος, προσύμφωνο', category: 'purchase', priority: 'critical', depends_on_idx: 0 },
    { description: 'Έγκριση δανείου από τράπεζα', category: 'purchase', priority: 'critical' },
    { description: 'Ασφάλεια ακινήτου', category: 'purchase', priority: 'high' },
    { description: 'Τελικό συμβόλαιο αγοράς', category: 'purchase', priority: 'critical', depends_on_idx: 4 },
    { description: 'Μεταγραφή στο κτηματολόγιο', category: 'purchase', priority: 'critical', depends_on_idx: 7 },
    { description: 'Εγγραφή στο ΑΑΔΕ ως ιδιοκτήτης', category: 'legal', priority: 'high' },
  ]},
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// ΔΕΥΤΕΡΗ ΜΟΡΦΗ ΗΜΕΡΟΜΗΝΙΑΣ, ΜΟΝΟ ΓΙ' ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ. Έγραφε «26/02/2027» ενώ
// ολόκληρη η εφαρμογή γράφει «26 Φεβ 2027» μέσω του κοινού `fd` — τριάντα πέντε
// σημεία με τη μία μορφή, δεκατρία εδώ με την άλλη. Ο ιδιοκτήτης που βλέπει την
// ίδια προθεσμία σε δύο καρτέλες τη διαβάζει δύο φορές διαφορετικά και η
// αριθμητική μορφή είναι και η πιο αμφίσημη: «26/02» ή «02/26»;
// Το τύλιγμα μένει ΜΟΝΟ για το κενό: το `fd` δέχεται ημερομηνία, όχι `null`.