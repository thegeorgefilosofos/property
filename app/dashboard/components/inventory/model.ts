// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΟΝΤΕΛΟ ΤΗΣ ΑΠΟΓΡΑΦΗΣ: ΤΥΠΟΙ ΚΑΙ ΚΑΤΑΛΟΓΟΙ, ΧΩΡΙΣ ΣΥΜΠΕΡΙΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ ΑΡΧΕΙΟ. Η απογραφή έχει έξι οθόνες (κατάλογος, φόρμα,
// επισκευές, παράδοση, συντήρηση, εξαγωγές) και ΟΛΕΣ μιλούν για το ίδιο
// αντικείμενο. Όσο ο τύπος και οι κατάλογοι ζούσαν μέσα στην πρώτη οθόνη, καμία
// άλλη δεν μπορούσε να φύγει από εκείνο το αρχείο χωρίς να τα κουβαλήσει μαζί.
//
// ΤΙ ΔΕΝ ΜΠΑΙΝΕΙ ΕΔΩ. Τίποτα που εκτελείται. Ούτε υπολογισμός, ούτε κλήση στη
// βάση, ούτε στοιχείο οθόνης: αυτό το αρχείο περιγράφει ΤΙ είναι ένα αντικείμενο
// απογραφής, όχι τι του συμβαίνει.
// ═══════════════════════════════════════════════════════════════════════════
import type { EnergyMode } from '@/lib/property/energy'

export interface InventoryItem {
  id: string; property_id: string; user_id: string
  name: string; category: string; room: string; brand: string; model: string
  serial_number: string; purchase_value: number; current_value: number
  purchase_date: string; warranty_expiry: string; condition: string
  notes: string; photo_url: string; photos: string[]
  energy_class: string; power_watts: number; daily_hours_use: number
  // Τρεις τρόποι μέτρησης κατανάλωσης — δες lib/property/energy.ts.
  energy_mode: EnergyMode | null; kwh_per_100_cycles: number; cycles_per_month: number; annual_kwh: number
  replacement_cost: number
  // ΠΑΛΙΕΣ ΣΤΗΛΕΣ, ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΠΙΑ. Μένουν στον τύπο επειδή μένουν στη βάση και
  // το select('*') τις επιστρέφει: τα δεδομένα όσων τις συμπλήρωσαν δεν χάνονται.
  // Καμία οθόνη δεν τις ζητά και καμία εξαγωγή δεν τις δείχνει.
  standby_watts?: number
  smart_device?: boolean; smart_notes?: string; tags?: string[]
  provenance?: string; original_price?: number; discount_pct?: number
  store_vendor?: string; receipt_number?: string
  receipt_doc_url?: string; receipt_doc_name?: string
  created_at: string; updated_at: string
}
export interface InventoryRepair {
  id: string; item_id: string; user_id: string
  repair_date: string; cost: number; technician: string; description: string
}
export interface InventoryHandover {
  id: string; property_id: string
  handover_type: 'check_in' | 'check_out'
  tenant_name: string; tenant_phone: string; handover_date: string
  notes: string; items_snapshot: HandoverItemSnapshot[]; created_at: string
}
export interface HandoverItemSnapshot {
  item_id: string; name: string; category: string
  condition_at_handover: string; condition_notes: string; photo_url: string
  condition_photo?: string; captured_at?: string
}
export interface MaintenanceSchedule {
  id: string; property_id: string; user_id: string; item_id: string
  item_name: string; task: string; interval_months: number
  last_done: string; next_due: string; notes: string
  est_cost?: number; calendar_event_id?: string; expense_id?: string
}
export interface HandoverIntent { tenantName?: string; tenantPhone?: string; type?: 'check_in'|'check_out' }
/** Ό,τι διαβάζει η απογραφή από τα ΑΛΛΑ ακίνητα: μόνο πώς να τα ονομάσει. */
export interface InventoryPropertyOption { id: string; name?: string | null; address?: string | null; nickname?: string | null }

export interface TabInventoryProps { propertyId: string; userId: string; profileType?: 'individual'|'professional' }

// ΜΙΑ ΛΙΣΤΑ ΚΑΤΗΓΟΡΙΩΝ, ΟΧΙ ΔΥΟ. Δίπλα σε αυτή ζούσε δεύτερη, χωρίς τόνους
// («Επιπλα», «Ηλεκτρικες Συσκευες»), που δεν τη διάβαζε κανείς — υπόλειμμα από
// παλαιότερη εκδοχή. Έμοιαζε όμως με την κανονική μορφή αποθήκευσης, οπότε η
// επόμενη προσθήκη θα την έγραφε στη βάση και οι κατηγορίες θα σταματούσαν να
// ταιριάζουν σιωπηλά: οι διάρκειες ζωής (USEFUL_LIFE_YEARS) κλειδώνουν σε ΑΥΤΑ
// τα ονόματα, με τους τόνους τους.
// Ο κατάλογος ήταν γραμμένος ΕΞΙ φορές μέσα στο αρχείο: στη φόρμα, στο φίλτρο,
// στη μαζική εισαγωγή, στην κατανομή αξίας, στην εξαγωγή PDF και εδώ. Μια νέα
// κατηγορία θα έμπαινε σε πέντε από τις έξι και το φίλτρο θα την έκρυβε αθόρυβα.
export const INVENTORY_CATEGORIES: readonly string[] = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά']
export const ROOM_PRESETS = [
  // Κατοικία — χώροι ημέρας
  'Σαλόνι','Καθιστικό','Κουζίνα','Τραπεζαρία',
  // Υπνοδωμάτια & γραφείο
  'Κύριο Υπνοδωμάτιο','Υπνοδωμάτιο 2','Υπνοδωμάτιο 3','Υπνοδωμάτιο 4','Παιδικό Δωμάτιο','Γραφείο',
  // Υγρά σημεία
  'Μπάνιο','Μπάνιο 2','WC',
  // Κυκλοφορία & εξωτερικά
  'Χολ / Διάδρομος','Μπαλκόνι','Βεράντα','Κήπος',
  // Βοηθητικοί
  'Αποθήκη','Πλυσταριό','Γκαράζ','Υπόγειο','Σοφίτα',
  // Επαγγελματικός / άλλος χώρος
  'Υποδοχή','Αίθουσα Συσκέψεων','Χώρος Εργασίας','Κατάστημα / Showroom','Κοινόχρηστος Χώρος',
]
// Πρότυπο επιπλωμένου διαμερίσματος — γρήγορο ξεκίνημα, μετά προσαρμόζεις.
export const STARTER_PACK:{name:string;category:string;room:string}[] = [
  {name:'Κρεβάτι διπλό',category:'Έπιπλα',room:'Κύριο Υπνοδωμάτιο'},
  {name:'Στρώμα',category:'Έπιπλα',room:'Κύριο Υπνοδωμάτιο'},
  {name:'Ντουλάπα',category:'Έπιπλα',room:'Κύριο Υπνοδωμάτιο'},
  {name:'Καναπές',category:'Έπιπλα',room:'Σαλόνι'},
  {name:'Τραπέζι τραπεζαρίας',category:'Έπιπλα',room:'Σαλόνι'},
  {name:'Καρέκλες (σετ)',category:'Έπιπλα',room:'Σαλόνι'},
  {name:'Τηλεόραση',category:'Ηλεκτρονικά',room:'Σαλόνι'},
  {name:'Ψυγείο',category:'Ηλεκτρικές Συσκευές',room:'Κουζίνα'},
  {name:'Κουζίνα (εστίες & φούρνος)',category:'Ηλεκτρικές Συσκευές',room:'Κουζίνα'},
  {name:'Απορροφητήρας',category:'Ηλεκτρικές Συσκευές',room:'Κουζίνα'},
  {name:'Πλυντήριο ρούχων',category:'Ηλεκτρικές Συσκευές',room:'Μπάνιο'},
  {name:'Κλιματιστικό',category:'Θέρμανση & Ψύξη',room:'Σαλόνι'},
  {name:'Θερμοσίφωνας',category:'Θέρμανση & Ψύξη',room:'Μπάνιο'},
]
export const CONDITIONS = ['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
export const ENERGY_CLASSES = ['A+++','A++','A+','A','B','C','D','E','F','G']
export const CONDITION_COLOR: Record<string,string> = {
  'Άριστη':'var(--positive)','Καλή':'var(--info)','Μέτρια':'var(--warning)',
  'Κακή':'var(--negative)','Εκτός Λειτουργίας':'var(--text-tertiary)',
}
// Η ενεργειακή κλάση ΣΗΜΑΙΝΕΙ καλό/προσοχή/κακό — άρα χαρτογραφείται στα σημασιολογικά
// tokens, όχι σε δική της δεκάχρωμη κλίμακα (πράσινα/πορτοκαλί/κόκκινα εκτός παλέτας).
export const ENERGY_TONE: Record<string,'positive'|'warning'|'negative'> = {
  'A+++':'positive','A++':'positive','A+':'positive','A':'positive',
  'B':'warning','C':'warning','D':'warning',
  'E':'negative','F':'negative','G':'negative',
}
// Το CATEGORY_ICONS έφυγε: ήταν χάρτης οκτώ κατηγοριών σε οκτώ ΚΕΝΕΣ
// συμβολοσειρές. Δεν αποδιδόταν πουθενά, αλλά διαβαζόταν από τον επόμενο σαν
// να σήμαινε κάτι.
// Τυπική διάρκεια ζωής ανά κατηγορία: ζει ΜΟΝΟ στο lib/inventory/depreciation.ts
// (USEFUL_LIFE_YEARS), μαζί με τα τεστ της και τη σημείωση ότι δεν είναι ΚΦΕ.
// Το REPLACEMENT_RANGES έφυγε: «Ηλεκτρονικά: 150–2000 €» παρουσιαζόταν ως «στοιχείο
// αγοράς» κάτω από το πεδίο κόστους αντικατάστασης. Ένα εύρος 1:13 δεν είναι
// εκτίμηση, είναι υπόδειξη να γράψει ο χρήστης ό,τι να 'ναι.
// Τα AVAILABLE_TAGS έφυγαν: οι οκτώ έτοιμες ετικέτες («Νέο», «Εγγύηση Ενεργή»,
// «Ενεργοβόρο», «Αντικ. Σύντομα») επικαλύπτονταν με πεδία που το app υπολογίζει
// ΜΟΝΟ ΤΟΥ από την ημερομηνία αγοράς, την εγγύηση και την ενεργειακή κλάση —
// δηλαδή ζητούσαν από τον χρήστη να συντηρεί με το χέρι ό,τι ήξερε ήδη η μηχανή.
export const DEFAULT_MAINTENANCE = [
  {task:'Ετήσιος έλεγχος λέβητα',interval_months:12,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρων κλιματιστικού',interval_months:3,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρου πλυντηρίου',interval_months:3,category:'Ηλεκτρικές Συσκευές'},
  {task:'Αποασβεστοποίηση καφετιέρας',interval_months:2,category:'Ηλεκτρικές Συσκευές'},
  {task:'Έλεγχος μπαταρίας ανιχνευτή καπνού',interval_months:6,category:'Λοιπά'},
  {task:'Έλεγχος αντλίας θερμότητας',interval_months:12,category:'Θέρμανση & Ψύξη'},
]
