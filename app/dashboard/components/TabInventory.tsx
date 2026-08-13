'use client'

import { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react'
import { qrDataUrl } from '@/lib/qr';
import { createPortal } from 'react-dom'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import * as expenses from '@/lib/data/expenses'
import * as tenantStore from '@/lib/data/tenants'
import * as calendar from '@/lib/data/calendar'
import { CustomSelect, NumberInput, TextInput, DatePicker, Toggle, Textarea } from './UIComponents'
import { T, Modal, PageTitle, KPIGrid, SecHdr, Btn, EmptyState, Skeleton, SkeletonKPIs, fe, feRate, fn, fd, ABSENT, ABSENT_DATE, TT, pressable, formGrid, fieldRow } from '@/components/Theme'
import { PackageOpen, SearchX, ClipboardCheck, Archive } from 'lucide-react'
import { downloadTableXlsx } from './exportCsv'
import { money as csvEur, percent as csvPct } from './xlsxStyle'
import { depreciate, replacementSuggestion, portfolioSummary, NOT_TAX_DEPRECIATION_NOTE } from '@/lib/inventory/depreciation'
import { formFields, INVENTORY_FIELDS, type FieldContext, type FieldDecision } from '@/lib/property/fields'
import { monthlyKwh, monthlyEnergyCost, suggestedEnergyMode, ENERGY_MODE_LABEL, type EnergyMode, type EnergyInput } from '@/lib/property/energy'
import { parseEprelRef, warrantyExpiry, type EprelFill } from '@/lib/property/eprel'
import { readStatus, statusLabel, type StatusRow } from '@/lib/property/status'
import { reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer, openReport, rEur, rPct, rEsc, rDate } from './reportPdf'
import { uploadUserScoped } from '@/lib/storage/scopedUpload';
import { notifyError, notifyOk } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { confirmDialog } from '@/components/confirmBus';
import { ActionMenu } from '@/components/ActionMenu';
import { athensToday, daysUntil as athensDaysUntil } from '@/lib/core/time';
import { addMonths as addCalendarMonths } from '@/lib/loans/progress';
import { navLabel } from '@/lib/nav/labels';
import { INK, INK_FAINT, INK_MUTED, PAPER_ALT, RULE } from '@/lib/print/ink';
import { XLSX, S, ROW, setCell, autoWidths, downloadWorkbook } from './xlsxStyle';
import { csvTable } from '@/lib/core/csv';
import { readSheetAsCsv, SheetError } from '@/lib/core/readSheet';
import { failed, MSG } from '@/lib/core/dbError';
import { uploadPath } from '@/lib/core/uploadPath';
import type { InventoryItemsRow } from '@/lib/supabase/tables';
// Η απογραφή έχει ένα σπίτι: lib/data/inventory.
import * as inventory from '@/lib/data/inventory';
// Οι επαφές έχουν ένα σπίτι: lib/data/contacts.
import * as contactStore from '@/lib/data/contacts';

const supabase = createSupabaseClient()

// ═══════════════════════════════════════════════════════════════════════════
// ΤΕΣΣΕΡΑ ΕΠΙΝΟΗΜΕΝΑ ΝΟΥΜΕΡΑ ΠΟΥ ΕΦΥΓΑΝ ΑΠΟ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ
//
// 1. «Ασφαλιστέα Αξία» = τρέχουσα × 1,1, ως KPI ισότιμο με πραγματικά νούμερα.
//    Η ασφαλιστέα αξία εξοπλισμού είναι κόστος ΑΝΤΙΚΑΤΑΣΤΑΣΗΣ ΜΕ ΚΑΙΝΟΥΡΓΙΟ, όχι
//    αποσβεσμένη αξία +10%. Όποιος ασφαλιζόταν με βάση αυτό ήταν υπασφαλισμένος
//    και θα το μάθαινε ΜΕΤΑ τη ζημιά. → Τώρα αθροίζονται μόνο τα ΔΗΛΩΜΕΝΑ κόστη
//    αντικατάστασης, και λέγεται ρητά για πόσα αντικείμενα λείπει το νούμερο.
//
// 2. «Αναβάθμιση N συσκευών → X €/χρόνο» σε πράσινο πλαίσιο. Τρία επινοημένα
//    μαζί: σταθερά 0,5 (κάθε αντικατάσταση κόβει τη μισή κατανάλωση), η κλάση A
//    μετρημένη στα «κακά», και τιμή ρεύματος 0,22 €/kWh που σωζόταν σιωπηλά ως
//    δεδομένο σε κάθε άκυρη είσοδο — και χωρίς να αφαιρείται το κόστος αγοράς
//    («θα κερδίσεις 180 €/χρόνο» για συσκευή 1.200 €). → Μένει μόνο η ΜΕΤΡΗΣΗ:
//    τι κοστίζει η συσκευή τον μήνα, ΣΤΗΝ ΤΙΜΗ ΠΟΥ ΔΗΛΩΝΕΙ Ο ΛΟΓΑΡΙΑΣΜΟΣ ΣΟΥ.
//    Χωρίς τιμή δεν εμφανίζεται κόστος: εμφανίζονται kWh και ζητείται η τιμή.
//
// 3. «Απόσβεση» ως τίτλος σε επαγγελματία. Ο επαγγελματίας έχει ΝΟΜΙΜΟΥΣ
//    συντελεστές (ΚΦΕ άρθρο 24) που δεν είναι αυτοί. → Παντού «εκτιμώμενη
//    υπολειπόμενη αξία», με ρητή σημείωση, και το μπλοκ «Χαρτοφυλακίου» έφυγε.
//
// 4. «Εξοικονόμηση από εκπτώσεις» σε πράσινο: δεν είναι εξοικονόμηση, είναι η
//    έκπτωση που πήρες κάποτε. Μαζί έφυγαν τα πέντε πεδία που το τροφοδοτούσαν.
//
// ΚΑΙ ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ Ο ΧΡΗΣΤΗΣ: το αποφασίζει το lib/property/fields.ts, όχι
// αυτή η φόρμα. Απογραφή εξοπλισμού υπάρχει ΜΟΝΟ σε επιπλωμένο ακίνητο που
// νοικιάζεται· σε ιδιοχρησία ή κενό δεν υπάρχει εξοπλισμός να παραδοθεί.
// ═══════════════════════════════════════════════════════════════════════════

const DOCS_BUCKET = 'inventory-docs'
// Ανοίγει απόδειξη/εγγύηση με προσωρινό signed URL (1 ώρα). Legacy fallback αν αποθηκεύτηκε public URL.
async function openInventoryDoc(pathOrUrl?: string | null) {
  if (!pathOrUrl) return
  if (/^https?:\/\//.test(pathOrUrl)) { window.open(pathOrUrl, '_blank'); return }
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(pathOrUrl, 3600)
  if (error || !data) { notifyError('Δεν ήταν δυνατό το άνοιγμα του αρχείου.'); return }
  window.open(data.signedUrl, '_blank')
}

interface InventoryItem {
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
interface InventoryRepair {
  id: string; item_id: string; user_id: string
  repair_date: string; cost: number; technician: string; description: string
}
interface InventoryHandover {
  id: string; property_id: string
  handover_type: 'check_in' | 'check_out'
  tenant_name: string; tenant_phone: string; handover_date: string
  notes: string; items_snapshot: HandoverItemSnapshot[]; created_at: string
}
interface HandoverItemSnapshot {
  item_id: string; name: string; category: string
  condition_at_handover: string; condition_notes: string; photo_url: string
  condition_photo?: string; captured_at?: string
}
interface MaintenanceSchedule {
  id: string; property_id: string; user_id: string; item_id: string
  item_name: string; task: string; interval_months: number
  last_done: string; next_due: string; notes: string
  est_cost?: number; calendar_event_id?: string; expense_id?: string
}
export interface HandoverIntent { tenantName?: string; tenantPhone?: string; type?: 'check_in'|'check_out' }
/** Ό,τι διαβάζει η απογραφή από τα ΑΛΛΑ ακίνητα: μόνο πώς να τα ονομάσει. */
interface InventoryPropertyOption { id: string; name?: string | null; address?: string | null; nickname?: string | null }

interface TabInventoryProps { propertyId: string; userId: string; profileType?: 'individual'|'professional' }

// ΜΙΑ ΛΙΣΤΑ ΚΑΤΗΓΟΡΙΩΝ, ΟΧΙ ΔΥΟ. Δίπλα σε αυτή ζούσε δεύτερη, χωρίς τόνους
// («Επιπλα», «Ηλεκτρικες Συσκευες»), που δεν τη διάβαζε κανείς — υπόλειμμα από
// παλαιότερη εκδοχή. Έμοιαζε όμως με την κανονική μορφή αποθήκευσης, οπότε η
// επόμενη προσθήκη θα την έγραφε στη βάση και οι κατηγορίες θα σταματούσαν να
// ταιριάζουν σιωπηλά: οι διάρκειες ζωής (USEFUL_LIFE_YEARS) κλειδώνουν σε ΑΥΤΑ
// τα ονόματα, με τους τόνους τους.
// Ο κατάλογος ήταν γραμμένος ΕΞΙ φορές μέσα στο αρχείο: στη φόρμα, στο φίλτρο,
// στη μαζική εισαγωγή, στην κατανομή αξίας, στην εξαγωγή PDF, και εδώ. Μια νέα
// κατηγορία θα έμπαινε σε πέντε από τις έξι και το φίλτρο θα την έκρυβε αθόρυβα.
export const INVENTORY_CATEGORIES: readonly string[] = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά']
const ROOM_PRESETS = [
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
const STARTER_PACK:{name:string;category:string;room:string}[] = [
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
const CONDITIONS = ['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
const ENERGY_CLASSES = ['A+++','A++','A+','A','B','C','D','E','F','G']
const CONDITION_COLOR: Record<string,string> = {
  'Άριστη':'var(--positive)','Καλή':'var(--info)','Μέτρια':'var(--warning)',
  'Κακή':'var(--negative)','Εκτός Λειτουργίας':'var(--text-tertiary)',
}
// Η ενεργειακή κλάση ΣΗΜΑΙΝΕΙ καλό/προσοχή/κακό — άρα χαρτογραφείται στα σημασιολογικά
// tokens, όχι σε δική της δεκάχρωμη κλίμακα (πράσινα/πορτοκαλί/κόκκινα εκτός παλέτας).
const ENERGY_TONE: Record<string,'positive'|'warning'|'negative'> = {
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
const DEFAULT_MAINTENANCE = [
  {task:'Ετήσιος έλεγχος λέβητα',interval_months:12,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρων κλιματιστικού',interval_months:3,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρου πλυντηρίου',interval_months:3,category:'Ηλεκτρικές Συσκευές'},
  {task:'Αποασβεστοποίηση καφετιέρας',interval_months:2,category:'Ηλεκτρικές Συσκευές'},
  {task:'Έλεγχος μπαταρίας ανιχνευτή καπνού',interval_months:6,category:'Λοιπά'},
  {task:'Έλεγχος αντλίας θερμότητας',interval_months:12,category:'Θέρμανση & Ψύξη'},
]

// Οι υπολογισμοί υπολειπόμενης αξίας διοχετεύονται στην καθαρή μηχανή του lib (μία πηγή αλήθειας).
const calcCurrentValue = (item: InventoryItem) => depreciate(item).bookValue
const calcDepreciationPct = (item: InventoryItem) => depreciate(item).depreciatedPct
const calcYearsLeft = (item: InventoryItem) => depreciate(item).yearsRemaining
const calcAgeDisplay = (d: string) => {
  if (!d) return ''
  const ms = Date.now() - new Date(d).getTime()
  const y = Math.floor(ms/(1000*60*60*24*365))
  const m = Math.floor((ms%(1000*60*60*24*365))/(1000*60*60*24*30))
  if (y===0) return `${m} μήνες`
  if (m===0) return `${y} χρόνια`
  return `${y} χρόνια ${m} μήνες`
}
// Χωρίς «κατανάλωση αναμονής»: κανείς δεν ξέρει τα standby watt του ψυγείου του,
// άρα το πεδίο έμενε κενό και πρόσθετε μόνο άλλη μία σειρά στη φόρμα.
// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΤΑΝΑΛΩΣΗ ΔΕΝ ΥΠΟΛΟΓΙΖΕΤΑΙ ΠΙΑ ΕΔΩ
// ─────────────────────────────────────────────────────────────────────────
// Ήταν `Watt × ώρες × 30`, πάντα, για κάθε συσκευή. Σωστό για κλιματιστικό,
// χωρίς νόημα για πλυντήριο: η ενεργειακή ετικέτα δεν δηλώνει Watt, δηλώνει
// kWh ανά 100 κύκλους — και ο παλιός τύπος έβγαζε δεκαεπταπλάσιο νούμερο.
// Η λογική ζει στο lib/property/energy.ts με τους τρεις τρόπους της, και
// επιστρέφει `null` όταν λείπουν τα στοιχεία: το μηδέν θα σήμαινε «δεν
// καταναλώνει», που είναι άλλο πράγμα από «δεν το ξέρουμε».
const calcMonthlyKwh = (item: InventoryItem) => monthlyKwh(item) ?? 0
const calcMonthlyCost = (item: InventoryItem, price: number) => monthlyEnergyCost(item, price) ?? 0
/** Έχει αρκετά στοιχεία ώστε να ΞΕΡΟΥΜΕ την κατανάλωσή του; */
const hasEnergy = (item: InventoryItem) => monthlyKwh(item) != null
// Ήταν `fmtEur` (μηδέν δεκαδικά) και `fmtEurC` (δύο) — δύο ονόματα για το ίδιο
// πράγμα από τη στιγμή που τα δεκαδικά έπαψαν να είναι επιλογή του κάθε σημείου.
// Δύο ονόματα σημαίνουν δύο πιθανές απαντήσεις στο «πώς γράφεται ένα ποσό εδώ».
const fmtDate = (d: string) => d ? fd(d) : ABSENT_DATE
// ═══ ΟΙ ΜΕΡΕΣ ΜΕΤΡΙΟΥΝΤΑΙ ΣΤΗΝ ΩΡΑ ΑΘΗΝΑΣ ════════════════════════════════
// Ήταν `Math.ceil((new Date(d) - Date.now()) / 86400000)`. Το `new Date('2026-08-10')`
// είναι μεσάνυχτα UTC· το `Date.now()` είναι πραγματική ώρα. Στην Ελλάδα, από τα
// μεσάνυχτα ως τις 03:00 (θερινή ώρα), η ημερομηνία έχει ήδη αλλάξει τοπικά αλλά
// όχι σε UTC: μια εγγύηση που λήγει ΣΗΜΕΡΑ εμφανιζόταν ως «λήγει σε 1 ημέρα», και
// μια που έληξε χθες ως «λήγει σήμερα». Κάθε ξημέρωμα, σε κάθε φίλτρο ≤30/≤90
// ημερών, σε κάθε προτεραιότητα υπενθύμισης.
// Η κοινή `daysUntil` του lib/core/time συγκρίνει ΗΜΕΡΟΛΟΓΙΑΚΕΣ ημέρες Αθήνας.
// Επιστρέφει null για κενή ημερομηνία· εδώ το κενό σημαίνει «ποτέ», δηλαδή άπειρο.
const daysUntil = (d: string) => athensDaysUntil(d) ?? Infinity
const warrantyStatus = (expiry: string) => {
  if (!expiry) return {label:'Χωρίς εγγύηση',color:'var(--text-tertiary)'}
  const d = daysUntil(expiry)
  if (d<0) return {label:'Έληξε',color:'var(--negative)'}
  if (d<=30) return {label:`${d} μέρες`,color:'var(--negative)'}
  if (d<=90) return {label:`${d} μέρες`,color:'var(--warning)'}
  return {label:`έως ${fmtDate(expiry)}`,color:'var(--positive)'}
}
// Το ίδιο πρόβλημα από την άλλη πλευρά: `new Date().toISOString()` μετά τις 21:00
// ώρα Ελλάδας γράφει τη ΧΘΕΣΙΝΗ ημερομηνία. Όποιος πατούσε «Έγινε» το βράδυ
// κατέγραφε τη συντήρηση μια μέρα πριν και όριζε το επόμενο ραντεβού μια μέρα
// νωρίς. Και η `setMonth` έκανε 31 Ιανουαρίου + 1 μήνα = 3 Μαρτίου.
const addMonths = (date: string, months: number) =>
  addCalendarMonths(date || athensToday(), months) ?? athensToday()
const needsAction = (item: InventoryItem) => {
  const d = daysUntil(item.warranty_expiry)
  return item.condition==='Κακή'||item.condition==='Εκτός Λειτουργίας'||calcDepreciationPct(item)>=100||(d>=0&&d<=90)
}

// ── MD3 Design Tokens ──────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background:'var(--bg-surface)',
  border:'1px solid var(--border-subtle)',
  borderRadius:T.radius.card,
  padding:16,
}
const labelStyle: React.CSSProperties = { ...TT.label, display:'block', marginBottom:6 }
const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <SecHdr label={label} right={right}/>
)

// Custom checkbox — Material/Google αισθητική: τετράγωνο με 2dp γωνίες, 2px border, καθαρό check.
function SelectBox({checked,indeterminate,onChange,size=18}:{checked:boolean;indeterminate?:boolean;onChange:()=>void;size?:number}) {
  const on = checked||indeterminate
  return (
    <button onClick={e=>{e.stopPropagation();onChange()}} aria-pressed={checked} title={checked?'Αποεπιλογή':'Επιλογή'}
      onMouseEnter={e=>{if(!on)e.currentTarget.style.background='var(--accent-soft)'}}
      onMouseLeave={e=>{if(!on)e.currentTarget.style.background='transparent'}}
      style={{width:size,height:size,borderRadius:3,border:`2px solid ${on?'var(--accent)':'var(--text-tertiary)'}`,background:on?'var(--accent)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'background 0.12s, border-color 0.12s',padding:0}}>
      {checked&&<svg width={size-4} height={size-4} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
      {!checked&&indeterminate&&<div style={{width:size-8,height:2.5,background:'var(--accent-text)',borderRadius:3}}/>}
    </button>
  )
}

// Μικρό labeled dropdown (portal) για μαζικές ενέργειες — δεν το κόβει κανένα overflow.
function BulkPicker({label,icon,options,onPick,accent}:{label:string;icon:React.ReactNode;options:string[];onPick:(v:string)=>void;accent?:boolean}) {
  const [open,setOpen] = useState(false)
  const [rect,setRect] = useState<{top:number;left:number}|null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const place = useCallback(()=>{const b=btnRef.current?.getBoundingClientRect();if(b)setRect({top:b.bottom+4,left:b.left})},[])
  useEffect(()=>{
    if(!open) return
    place()
    const close=(e:Event)=>{const t=e.target as Node;if(btnRef.current?.contains(t)||menuRef.current?.contains(t))return;setOpen(false)}
    const s=()=>place()
    document.addEventListener('mousedown',close);window.addEventListener('scroll',s,true);window.addEventListener('resize',s)
    return()=>{document.removeEventListener('mousedown',close);window.removeEventListener('scroll',s,true);window.removeEventListener('resize',s)}
  },[open,place])
  return (
    <div style={{display:'inline-block'}}>
      <button ref={btnRef} onClick={()=>setOpen(v=>!v)}
        style={{display:'inline-flex',alignItems:'center',gap:6,height:T.h.sm,padding:'0 12px',borderRadius:T.radius.pill,fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer',border:`1px solid ${accent?'var(--accent-border)':'var(--border-subtle)'}`,background:accent?'var(--accent-soft)':'var(--bg-surface)',color:accent?'var(--accent)':'var(--text-secondary)'}}>
        <span style={{display:'flex'}}>{icon}</span>{label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l3 3 3-3"/></svg>
      </button>
      {open&&rect&&typeof document!=='undefined'&&createPortal(
        <div ref={menuRef} style={{position:'fixed',top:rect.top,left:rect.left,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:5,zIndex:9000,minWidth:180,maxHeight:300,overflowY:'auto',boxShadow:'var(--shadow-xl)'}}>
          {options.length===0
            ?<p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,padding:'8px 12px'}}>Καμία επιλογή</p>
            :options.map(o=>(
              <div key={o} {...pressable(()=>{onPick(o);setOpen(false)})} style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:13,fontFamily:T.font.sans,color:'var(--text-primary)'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{o}</div>
            ))}
        </div>,
        document.body
      )}
    </div>
  )
}

const Badge = ({label,color}:{label:string;color:string}) => (
  <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:T.radius.pill,fontSize:10,fontWeight:500,fontFamily:T.font.sans,color,background:`color-mix(in srgb, ${color} 10%, transparent)`,border:`1px solid color-mix(in srgb, ${color} 26%, transparent)`,whiteSpace:'nowrap'}}>{label}</span>
)

const EnergyBadge = ({cls}:{cls:string}) => { if(!cls) return null; const tone=ENERGY_TONE[cls]
  const fg = tone?`var(--${tone})`:'var(--text-secondary)'
  const bg = tone?`var(--${tone}-soft)`:'var(--bg-elevated)'
  const bd = tone?`var(--${tone}-border)`:'var(--border-subtle)'
  return (
  <span title={`Ενεργειακή κλάση ${cls}`} style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,color:fg,background:bg,border:`1px solid ${bd}`,letterSpacing:'0.5px',fontFamily:T.font.sans}}>{cls}</span>
) }

// Η μπάρα δείχνει ΤΙ ΜΕΝΕΙ, όχι «Απόσβεση»: το ίδιο νούμερο, με το όνομα που δεν
// μπερδεύεται με τη φορολογική απόσβεση του ΚΦΕ. Γεμάτη μπάρα = αξία που κρατάει.
const DepBar = ({pct,left}:{pct:number;left:number}) => {
  const remaining = Math.max(0, 100 - pct)
  // Η υπολειπόμενη αξία δεν είναι βαθμός. Ένα ψυγείο στο 45% δεν είναι
  // «κίτρινο» και στο 70% δεν είναι «πράσινο» — απλώς έχει την ηλικία του.
  // Το μήκος της μπάρας λέει ήδη πόσο μένει· το χρώμα μπαίνει μόνο όταν η
  // αξία έχει σχεδόν εξαντληθεί, δηλαδή όταν πλησιάζει αντικατάσταση.
  const c = remaining>20?'var(--series-in)':'var(--warning)'
  return (
    <div title={NOT_TAX_DEPRECIATION_NOTE}>
      <div style={{height:3,background:'var(--border-subtle)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${remaining}%`,background:c,borderRadius:3,transition:'width 0.4s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums'}}>Εκτιμώμενη υπολειπόμενη αξία {remaining}%</span>
        {left>0
          ?<span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums'}}>περίπου {left} χρόνια</span>
          :<span style={{fontSize:9,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Τέλος ωφέλιμης ζωής</span>
        }
      </div>
    </div>
  )
}

// Ήπια ένδειξη πρότασης αντικατάστασης — calm, όχι «κόκκινος συναγερμός».
function ReplacementHint({item,compact}:{item:InventoryItem;compact?:boolean}) {
  const s = replacementSuggestion(item)
  if (s.severity === 'none') return null
  const due = s.severity === 'due'
  const tip = s.reasons.join(' · ')
  if (due) return (
    <div title={tip} style={{display:'inline-flex',alignItems:'center',gap:6,padding:compact?'2px 8px':'6px 10px',borderRadius:compact?20:8,background:'var(--warning-soft)',border:'1px solid var(--warning-border)',maxWidth:'100%'}}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <span style={{fontSize:compact?9:10,color:'var(--warning)',fontFamily:T.font.sans,fontWeight:600,letterSpacing:compact?'0.02em':0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Προτείνεται αντικατάσταση</span>
    </div>
  )
  // soft: πλησιάζει τέλος ωφέλιμης ζωής
  return (
    <span title={tip} style={{fontSize:compact?9:10,color:'var(--text-tertiary)',fontFamily:T.font.sans,whiteSpace:'nowrap'}}>Πλησιάζει το τέλος ζωής</span>
  )
}

function InlineConditionEdit({item,onUpdate}:{item:InventoryItem;onUpdate:(id:string,c:string)=>void}) {
  const [open,setOpen] = useState(false)
  const [rect,setRect] = useState<{top:number;left:number;width:number;up?:boolean;maxH?:number}|null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Το μενού ζει σε portal (fixed) ώστε να μην το «κόβει» κανένα overflow:hidden γονικό (κάρτα/φωτο).
  // Τοποθέτηση με επίγνωση viewport: διαλέγει πλευρά με χώρο + maxHeight ώστε να μη κόβεται εκτός οθόνης.
  const place = useCallback(()=>{
    const b=btnRef.current?.getBoundingClientRect()
    if(!b) return
    const M=8, GAP=4, needed=CONDITIONS.length*36+12
    const spaceBelow=window.innerHeight-b.bottom-M, spaceAbove=b.top-M
    const up = spaceBelow<needed && spaceAbove>spaceBelow
    const maxH = Math.max(120, Math.min((up?spaceAbove:spaceBelow)-GAP, needed))
    setRect({top: up?b.top-GAP:b.bottom+GAP, left:b.left, width:b.width, up, maxH})
  },[])
  useEffect(()=>{
    if(!open) return
    place()
    const close=(e:Event)=>{
      const t=e.target as Node
      if(btnRef.current?.contains(t)||menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll=()=>place()
    document.addEventListener('mousedown',close)
    window.addEventListener('scroll',onScroll,true)
    window.addEventListener('resize',onScroll)
    return()=>{document.removeEventListener('mousedown',close);window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll)}
  },[open,place])
  return (
    <div style={{display:'inline-block'}}>
      <button ref={btnRef} onClick={e=>{e.stopPropagation();setOpen(v=>!v)}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:T.radius.pill,fontSize:10,fontWeight:500,fontFamily:T.font.sans,color:CONDITION_COLOR[item.condition],background:CONDITION_COLOR[item.condition]+'18',border:`1px solid ${CONDITION_COLOR[item.condition]}40`,cursor:'pointer'}}>
        {item.condition}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.15s'}}><path d="M2 4l3 3 3-3"/></svg>
      </button>
      {open&&rect&&typeof document!=='undefined'&&createPortal(
        <div ref={menuRef} onClick={e=>e.stopPropagation()}
          style={{position:'fixed',top:rect.top,left:rect.left,transform:rect.up?'translateY(-100%)':'none',maxHeight:rect.maxH,overflowY:'auto',overscrollBehavior:'contain',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:6,zIndex:9000,minWidth:Math.max(160,rect.width),boxShadow:'var(--shadow-xl)'}}>
          {CONDITIONS.map(c=>(
            <div key={c} {...pressable(()=>{onUpdate(item.id,c);setOpen(false)})}
              style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:12,fontFamily:T.font.sans,color:CONDITION_COLOR[c],background:item.condition===c?CONDITION_COLOR[c]+'15':'transparent',fontWeight:item.condition===c?600:400,transition:'background 0.1s'}}
              onMouseEnter={e=>(e.currentTarget.style.background=CONDITION_COLOR[c]+'10')}
              onMouseLeave={e=>(e.currentTarget.style.background=item.condition===c?CONDITION_COLOR[c]+'15':'transparent')}
            >{c}</div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// Διακριτικό μενού ενεργειών «···» — μαζεύει όλες τις ενέργειες ανά αντικείμενο.
interface OverflowAction { label:string; onClick:()=>void; icon?:React.ReactNode; danger?:boolean }
function OverflowMenu({actions,align='right',dark}:{actions:OverflowAction[];align?:'left'|'right';dark?:boolean}) {
  const [open,setOpen] = useState(false)
  const [rect,setRect] = useState<{top:number;right:number;left:number;up?:boolean;maxH?:number}|null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const place = useCallback(()=>{
    const b=btnRef.current?.getBoundingClientRect()
    if(!b) return
    const M=8, GAP=6, needed=actions.length*38+12
    const spaceBelow=window.innerHeight-b.bottom-M, spaceAbove=b.top-M
    const up = spaceBelow<needed && spaceAbove>spaceBelow
    const maxH = Math.max(120, Math.min((up?spaceAbove:spaceBelow)-GAP, needed))
    setRect({top: up?b.top-GAP:b.bottom+GAP, right:window.innerWidth-b.right, left:b.left, up, maxH})
  },[actions.length])
  useEffect(()=>{
    if(!open) return
    place()
    const close=(e:Event)=>{
      const t=e.target as Node
      if(btnRef.current?.contains(t)||menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll=()=>place()
    document.addEventListener('mousedown',close)
    window.addEventListener('scroll',onScroll,true)
    window.addEventListener('resize',onScroll)
    return()=>{document.removeEventListener('mousedown',close);window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll)}
  },[open,place])
  return (
    <div style={{display:'inline-block'}} onClick={e=>e.stopPropagation()}>
      <button ref={btnRef} title="Ενέργειες" aria-label="Ενέργειες" onClick={()=>setOpen(v=>!v)}
        style={{width:28,height:28,borderRadius:T.radius.pill,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s',
          border:`1px solid ${dark?'rgba(255,255,255,0.25)':'var(--border-subtle)'}`,
          background:dark?'rgba(0,0,0,0.45)':(open?'var(--bg-hover)':'var(--bg-surface)'),
          color:dark?'#fff':'var(--text-secondary)',backdropFilter:dark?'blur(4px)':undefined}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
      {open&&rect&&typeof document!=='undefined'&&createPortal(
        <div ref={menuRef} onClick={e=>e.stopPropagation()}
          style={{position:'fixed',top:rect.top,...(align==='right'?{right:rect.right}:{left:rect.left}),transform:rect.up?'translateY(-100%)':'none',maxHeight:rect.maxH,overflowY:'auto',overscrollBehavior:'contain',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:5,zIndex:9000,minWidth:180,boxShadow:'var(--shadow-xl)'}}>
          {actions.map((a,i)=>(
            <button key={i} onClick={()=>{a.onClick();setOpen(false)}}
              style={{display:'flex',alignItems:'center',gap:10,width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:8,fontSize:13,fontFamily:T.font.sans,fontWeight:500,color:a.danger?'var(--negative)':'var(--text-primary)',background:'transparent',border:'none',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=a.danger?'var(--negative-dim)':'var(--bg-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{display:'flex',width:15,color:a.danger?'var(--negative)':'var(--text-tertiary)',flexShrink:0}}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
const IconEdit = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
const IconRepair = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 00-5.6 5.6l-6 6L5 20l6-6a4 4 0 005.6-5.6l-2.3 2.3-2-2z"/></svg>
const IconQR = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 20h.01M20 14h.01M14 20h.01"/></svg>
const IconCal = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
const IconTrash = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>

function RoomInput({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  // Ένα καθαρό dropdown αντί για δεκάδες κουμπάκια — «Άλλος χώρος…» για ελεύθερο κείμενο.
  const isCustom = value!=='' && !ROOM_PRESETS.includes(value)
  const [custom,setCustom] = useState(isCustom)
  const [focused,setFocused] = useState(false)
  const options = [
    ...ROOM_PRESETS.map(r=>({value:r,label:r})),
    {value:'__custom__',label:'Άλλος χώρος…'},
  ]
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <CustomSelect value={custom?'__custom__':value} placeholder="Επιλέξτε χώρο"
        onChange={v=>{ if(v==='__custom__'){setCustom(true);onChange('')} else {setCustom(false);onChange(v)} }}
        options={options}/>
      {custom&&(
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder="Πληκτρολογήστε τον χώρο (π.χ. Ξενώνας)" onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{background:'var(--bg-surface)',border:`1px solid ${focused?'var(--accent)':'var(--border-default)'}`,boxShadow:focused?'0 0 0 3px var(--accent-dim)':'none',borderRadius:6,padding:'0 16px',height:T.h.lg,color:'var(--text-primary)',fontSize:14,letterSpacing:0,outline:'none',fontFamily:T.font.sans,width:'100%',boxSizing:'border-box'}}
        />
      )}
    </div>
  )
}

function QRModal({item,onClose}:{item:InventoryItem;onClose:()=>void}) {
  // QR τοπικά: τα στοιχεία της απογραφής δεν φεύγουν σε εξωτερική υπηρεσία.
  const qr = qrDataUrl(JSON.stringify({n:item.name,b:item.brand,m:item.model,sn:item.serial_number,cat:item.category,cond:item.condition,w:item.warranty_expiry}), { size: 200 })
  // ΕΤΙΚΕΤΑ, ΟΧΙ ΑΝΑΦΟΡΑ: ένα αυτοκόλλητο που κολλάει πάνω στο αντικείμενο δεν
  // παίρνει επικεφαλίδα εγγράφου, μετρικές και υποσημείωση. Παίρνει όμως την
  // ίδια τυπογραφία και το ίδιο μελάνι με τα υπόλοιπα, και τυπώνεται ΜΟΝΟ του —
  // πριν περίμενε κλικ σε κουμπί που το ίδιο του το CSS έκρυβε στην εκτύπωση.
  const print = () => openReport(
    `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Ετικέτα ${rEsc(item.name)}</title>`
    + `<style>body{font-family:'Inter',system-ui,Arial,sans-serif;color:${INK};padding:24px;text-align:center}`
    + `h2{font-size:16px;font-weight:700;margin-bottom:4px}</style></head><body>`
    + `<h2>${rEsc(item.name)}</h2>`
    + `<img src="${rEsc(qr)}" width="180" height="180" style="margin:12px auto;display:block;border:1px solid ${RULE};padding:8px;border-radius:8px"/>`
    + `</body></html>`)
  // ΔΕΝ ΕΙΝΑΙ ΣΑΡΩΤΗΣ ΚΑΜΕΡΑΣ ΟΥΤΕ ΠΡΟΒΟΛΗ ΦΩΤΟΓΡΑΦΙΑΣ, παρότι είχε zIndex 1100:
  // είναι τίτλος + ένα παραγόμενο τοπικά QR + μία ενέργεια («Εκτύπωση καρτέλας»),
  // δηλαδή κανονικό κεντραρισμένο παράθυρο. Το 1100 το κρατούσε πάνω από τη φόρμα
  // αντικειμένου (1000)· η σειρά διατηρείται γιατί το <QRModal> αποδίδεται ΜΕΤΑ το
  // <ItemFormModal> στο ίδιο επίπεδο (βλ. τέλος αρχείου), άρα ζωγραφίζεται από πάνω.
  // Το κουμπί «Κλείσιμο» της κεφαλίδας το δίνει πλέον το ίδιο το Modal (× με
  // aria-label «Κλείσιμο»), μαζί με Escape και επιστροφή εστίασης που δεν υπήρχαν.
  return (
    <Modal open onClose={onClose} width={380} ariaLabel="QR Αντικειμένου"
      title={<span title="Κωδικός QR: γρήγορη σάρωση στοιχείων αντικειμένου με κινητό">QR Αντικειμένου</span>}
      footer={<Btn variant="primary" onClick={print}>Εκτύπωση καρτέλας</Btn>}>
      <div style={{background:'var(--qr-paper)',padding:12,borderRadius:T.radius.card,alignSelf:'center'}}><img src={qr} width={200} height={200} alt="QR"/></div>
      <div style={{textAlign:'center'}}>
        <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
        <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{item.brand} {item.model}{item.serial_number?` · Σειριακός ${item.serial_number}`:''}</p>
      </div>
    </Modal>
  )
}

function BulkImportModal({propertyId,userId,onImported,onClose}:{propertyId:string;userId:string;onImported:()=>void;onClose:()=>void}) {
  const [step,setStep] = useState<'upload'|'preview'>('upload')
  const [rows,setRows] = useState<Partial<InventoryItem>[]>([])
  const [errors,setErrors] = useState<string[]>([])
  const [importing,setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Δες DocumentScan: το ref διαβάζεται σε useCallback, όχι στην απόδοση.
  const openFilePicker = useCallback(() => fileRef.current?.click(), [])
  // ══ ΤΟ ΥΠΟΔΕΙΓΜΑ ΕΙΝΑΙ ΒΙΒΛΙΟ ΕΡΓΑΣΙΑΣ, ΟΧΙ CSV ══════════════════════════
  //
  // Ήταν CSV χωρισμένο με ΚΟΜΜΑ. Το Excel όμως χωρίζει στήλες με το
  // διαχωριστικό ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ, και σε ελληνικά Windows αυτό είναι το
  // ερωτηματικό — γιατί το κόμμα είναι το δεκαδικό σημείο. Ο χρήστης άνοιγε το
  // υπόδειγμα και έβλεπε ΟΛΟΚΛΗΡΗ τη γραμμή μέσα στο κελί A1: δεκατέσσερις
  // στήλες στοιβαγμένες σε μία, χωρίς κανένα μήνυμα λάθους.
  //
  // Και ο γυρισμός ήταν χειρότερος: αν τελικά το συμπλήρωνε, το Excel το
  // αποθήκευε ΜΕ ΕΡΩΤΗΜΑΤΙΚΑ, ενώ η ανάγνωση έσπαγε στο κόμμα. Κάθε γραμμή
  // εισαγόταν ως ένα αντικείμενο με ολόκληρη τη γραμμή για όνομα — «επιτυχώς».
  //
  // Ένα .xlsx δεν έχει διαχωριστικό. Ανοίγει το ίδιο σε κάθε υπολογιστή.
  const TEMPLATE_HEAD = ['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Αξία Αγοράς','Ημερομηνία Αγοράς','Λήξη Εγγύησης','Ενεργειακή Κλάση','Ισχύς (W)','Ώρες ανά Ημέρα','Κόστος Αντικατάστασης']
  const TEMPLATE_ROW = ['Πλυντήριο','Ηλεκτρικές Συσκευές','Κουζίνα','Bosch','WAU28','SN123','Καλή','650','2021-03-15','2026-03-15','A+','2100','1','700']
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEAD, TEMPLATE_ROW])
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.head }
    for (let c = 0; c < TEMPLATE_HEAD.length; c++) setCell(ws, 0, c, { s: S.head })
    for (let c = 0; c < TEMPLATE_HEAD.length; c++) setCell(ws, 1, c, { s: S.txt })
    ws['!cols'] = autoWidths(ws, { headRow: 0 }).cols
    XLSX.utils.book_append_sheet(wb, ws, 'Απογραφή')
    downloadWorkbook(wb, 'υπόδειγμα απογραφής')
  }
  const parseCSV = (text:string) => {
    // Ο αναλυτής ζει στο lib/core/csv.ts: ξέρει και το «;» και τα εισαγωγικά.
    // Εδώ έκανε σκέτο `split(',')`, οπότε μια «Πολυθρόνα, δερμάτινη» έγραφε την
    // κατηγορία μέσα στο όνομα και μετακινούσε κάθε επόμενη στήλη κατά μία.
    const table=csvTable(text)
    if(table.length<2){setErrors(['Το αρχείο δεν έχει δεδομένα.']);return}
    const parsed:Partial<InventoryItem>[]=[]; const errs:string[]=[]
    for(let i=1;i<table.length;i++){
      const cols=table[i]
      if(!cols[0])continue
      const cat=cols[1]||'Λοιπά'; const cond=cols[6]||'Καλή'
      if(![...INVENTORY_CATEGORIES].includes(cat))errs.push(`Γραμμή ${i+1}: Άγνωστη κατηγορία "${cat}"`)
      parsed.push({name:cols[0],category:cat,room:cols[2]||'',brand:cols[3]||'',model:cols[4]||'',serial_number:cols[5]||'',condition:CONDITIONS.includes(cond)?cond:'Καλή',purchase_value:parseFloat(cols[7])||0,purchase_date:cols[8]||'',warranty_expiry:cols[9]||'',energy_class:cols[10]||'',power_watts:parseFloat(cols[11])||0,daily_hours_use:parseFloat(cols[12])||0,replacement_cost:parseFloat(cols[13])||0})
    }
    setRows(parsed);setErrors(errs);if(parsed.length>0)setStep('preview')
  }
  // ΤΟ ΑΡΧΕΙΟ ΠΟΥ ΓΥΡΙΖΕΙ ΕΙΝΑΙ ΣΥΝΗΘΩΣ ΑΥΤΟ ΠΟΥ ΕΦΥΓΕ. Αφού το υπόδειγμα είναι
  // βιβλίο εργασίας, ο χρήστης το συμπληρώνει και το ανεβάζει όπως είναι· το
  // «αποθήκευση ως CSV» ήταν βήμα που δεν έπρεπε να ζητηθεί ποτέ. Το CSV
  // εξακολουθεί να γίνεται δεκτό, για όποιον το εξάγει από αλλού.
  const handleFile=async(file:File)=>{
    const isSheet=/\.(xlsx|xlsm|xls)$/i.test(file.name)
    if(isSheet){
      try{ parseCSV(await readSheetAsCsv(file)) }
      catch(e){ setErrors([e instanceof SheetError?e.message:'Το αρχείο δεν διαβάστηκε.']) }
      return
    }
    const r=new FileReader();r.onload=e=>parseCSV(e.target?.result as string);r.readAsText(file,'UTF-8')
  }
  const handleImport=async()=>{
    setImporting(true)
    const {error}=await inventory.add(supabase,propertyId,userId,rows.map(r=>({...r,photos:[]})))
    if(error){notifyError(failed('Η μαζική εισαγωγή δεν ολοκληρώθηκε',error));setImporting(false);return}
    onImported();onClose()
  }
  // Τίτλος + περιεχόμενο δύο βημάτων + ενέργειες, κεντραρισμένο: κανονικό Modal.
  // Οι δύο ενέργειες του βήματος «preview» φεύγουν στο υποσέλιδο, όπου μένουν
  // ορατές ενώ ο πίνακας των 15 πρώτων γραμμών κυλά από πάνω τους.
  //
  // ΤΟ ΠΑΡΑΘΥΡΟ ΔΕΝ ΦΕΥΓΕΙ ΟΣΟ ΓΡΑΦΕΙ. Το Modal προσθέτει δύο εξόδους που το
  // χειρόγραφο δεν είχε — Escape και κλικ στο φόντο — και η εισαγωγή είναι ΕΝΑ
  // insert για ΟΛΕΣ τις γραμμές του αρχείου. Χωρίς τη φρουρά, ένα κατά λάθος
  // Escape στη μέση αφήνει τον χρήστη χωρίς να μάθει αν πέρασαν ή όχι.
  const closeGuarded = () => { if(!importing) onClose() }
  return (
    <Modal open onClose={closeGuarded} width={600} ariaLabel="Μαζική εισαγωγή CSV"
      title={<>Μαζική εισαγωγή <span title="CSV: αρχείο τιμών χωρισμένων με κόμμα· ανοίγει σε Excel/λογιστικά φύλλα">CSV</span></>}
      footer={step==='preview'?(<>
        <Btn onClick={()=>setStep('upload')}>Πίσω</Btn>
        <Btn variant="primary" onClick={handleImport} disabled={importing}>{importing?'Εισαγωγή…':`Εισαγωγή ${rows.length} αντικειμένων`}</Btn>
      </>):undefined}>
      {step==='upload'&&(
        <>
          <button onClick={downloadTemplate} style={{padding:'10px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>Κατέβασμα προτύπου</button>
          {/* Ρητά, όχι με spread: δες DocumentScan — το spread κρύβει τις ιδιότητες
              από τον μεταγλωττιστή και ξυπνά τα σφάλματα των διπλανών χειριστών. */}
          <div role="button" tabIndex={0} onClick={openFilePicker} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFilePicker()}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}} style={{border:'2px dashed var(--border-accent)',borderRadius:T.radius.card,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:'var(--accent-dim)'}}>
            <p style={{fontSize:14,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:8}}>Σύρτε ή κλικ για ανέβασμα αρχείου</p>
            <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Excel ή CSV</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
          {errors.length>0&&<div style={{padding:'10px 14px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>{errors.map((e,i)=><p key={i} style={{fontSize:11,color:'var(--negative)',fontFamily:T.font.sans}}>{e}</p>)}</div>}
        </>
      )}
      {step==='preview'&&(
        <>
          <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Βρέθηκαν <strong style={{color:'var(--text-primary)'}}>{rows.length} αντικείμενα</strong></p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:'var(--bg-elevated)'}}>{['Ονομασία','Κατηγορία','Κατάσταση','Αξία'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--text-secondary)',fontWeight:500,fontSize:10,fontFamily:T.font.sans,textTransform:'uppercase',letterSpacing:'0.5px'}}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(0,15).map((r,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-subtle)'}}><td style={{padding:'7px 10px',color:'var(--text-primary)',fontWeight:500,fontFamily:T.font.sans}}>{r.name}</td><td style={{padding:'7px 10px',color:'var(--text-secondary)',fontFamily:T.font.sans}}>{r.category}</td><td style={{padding:'7px 10px'}}><Badge label={r.condition||ABSENT} color={CONDITION_COLOR[r.condition||'']||'var(--text-tertiary)'}/></td><td style={{padding:'7px 10px',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{r.purchase_value?fe(r.purchase_value):fe(0)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}

// 28 πεδία ανά αντικείμενο έγιναν 13, και το ποιο βλέπει ο χρήστης το κρίνει το
// μητρώο (INVENTORY_FIELDS), όχι αυτό το αντικείμενο. Οι στήλες της βάσης δεν
// αγγίζονται — απλώς δεν ζητάμε πια δεδομένα που δεν κάνουν τίποτα.
const EMPTY_ITEM: Partial<InventoryItem> = {
  name:'',category:'Ηλεκτρικές Συσκευές',room:'',brand:'',model:'',serial_number:'',
  purchase_value:0,purchase_date:'',warranty_expiry:'',condition:'Καλή',notes:'',
  photo_url:'',photos:[],energy_class:'',energy_mode:null,kwh_per_100_cycles:0,cycles_per_month:0,annual_kwh:0,power_watts:0,daily_hours_use:0,
  replacement_cost:0,
}

// Σύστημα αναγνώρισης εξοπλισμού από φωτογραφία (συσκευασία/ετικέτα/booklet/απόδειξη).
const ITEM_SCAN_SYSTEM = `Είσαι σύστημα αναγνώρισης οικιακού εξοπλισμού από φωτογραφία (συσκευασία, ετικέτα ενέργειας, booklet ή απόδειξη αγοράς). Επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON, χωρίς άλλο κείμενο:
{"name":"","brand":"","model":"","serial_number":"","category":"<μία από: Έπιπλα, Ηλεκτρικές Συσκευές, Ηλεκτρονικά, Υδραυλικά, Θέρμανση & Ψύξη, Φωτιστικά, Διακόσμηση, Λοιπά>","price":"αριθμός € ή κενό","warranty_expiry":"YYYY-MM-DD ή κενό","energy_class":"π.χ. A+++ ή κενό","power_watts":"αριθμός W ή κενό","store":"","purchase_date":"YYYY-MM-DD ή κενό"}
Διάβασε ό,τι φαίνεται με ακρίβεια· άφησε κενά όσα δεν διακρίνονται. Το name να είναι περιγραφικό (π.χ. «Πλυντήριο Bosch WAU28»). Χωρίς κείμενο εκτός του JSON.`

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΕΝΟ ΠΕΔΙΟ ΔΕΙΧΝΕΙ ΚΕΝΟ, ΟΧΙ ΜΗΔΕΝ
// ─────────────────────────────────────────────────────────────────────────
// Η φόρμα άνοιγε με «0,00 €» στην αξία αγοράς, «0,00 €» στο κόστος
// αντικατάστασης και «0 W / 0 ώρες» στην ενέργεια. Κανένα από αυτά δεν είχε
// δηλωθεί: ήταν η αρχική τιμή της δομής, τυπωμένη σαν απάντηση.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΣΗΜΑΝΤΙΚΟ ΚΑΙ ΟΧΙ ΑΙΣΘΗΤΙΚΟ. Το μηδέν είναι ΔΗΛΩΣΗ: λέει «αυτό
// το αντικείμενο δεν αξίζει τίποτα». Ο χρήστης που το προσπερνά έχει στο
// μητρώο του δέκα αντικείμενα με μηδενική ασφαλιστέα αξία, και το μαθαίνει την
// ημέρα της ζημιάς. Το κενό πεδίο λέει την αλήθεια: δεν το ξέρουμε ακόμη.
const blankIfZero = (n?: number | null) => (n ? String(n) : '');

// Ετικέτα πεδίου ΜΕ ΤΟ «ΓΙΑΤΙ» ΤΟΥ. Δεν είναι διακόσμηση: όποιος δεν καταλαβαίνει
// γιατί ζητάμε κάτι δεν το συμπληρώνει, και μετά λείπει από τη δήλωση. Το κείμενο
// έρχεται από το μητρώο (lib/property/fields.ts) — μία πηγή, ίδια λόγια παντού.
function Field({d,children}:{d?:FieldDecision;children:React.ReactNode}) {
  if(!d) return null
  return (
    <div>
      <label style={labelStyle}>{d.label}{d.critical?' *':''}</label>
      {children}
      <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45,marginTop:5}}>{d.why}</p>
    </div>
  )
}

function ItemFormModal({item,onSave,onClose,propertyId,ctx,kwhPrice}:{item?:InventoryItem|null;onSave:(d:Partial<InventoryItem>)=>void;onClose:()=>void;propertyId:string;ctx:FieldContext;kwhPrice:number}) {
  const [form,setForm] = useState<Partial<InventoryItem>>(item?{...item,photos:item.photos||[]}:{...EMPTY_ITEM})
  const [saving,setSaving] = useState(false)
  const [scanning,setScanning] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof InventoryItem>(k:K,v:InventoryItem[K]) => setForm(f=>({...f,[k]:v}))
  const isElectric = ['Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Φωτιστικά','Θέρμανση & Ψύξη'].includes(form.category||'')
  // Ποια πεδία βλέπει ΑΥΤΟΣ ο χρήστης, σε ΑΥΤΗ τη φόρμα, τώρα.
  const fields = formFields(INVENTORY_FIELDS, ctx)
  const byId = new Map<string,FieldDecision>([...fields.core, ...fields.more].map(d=>[d.id,d]))
  const f = (id:string) => byId.get(id)
  // Η ετικέτα που βλέπει ο χρήστης τη γράφει το <Field>· ο αναγνώστης οθόνης
  // όμως διαβάζει το πεδίο, όχι το <Field>. Ίδιο κείμενο, μία πηγή.
  const fl = (id:string) => byId.get(id)?.label
  // «Περισσότερα»: ανοιχτό εξ αρχής όταν το αντικείμενο έχει ήδη τέτοια στοιχεία.
  const [showMore,setShowMore] = useState<boolean>(!!(item&&(item.replacement_cost||item.energy_class||item.power_watts||item.serial_number||item.brand||item.notes)))
  // ═══ Η ΦΩΤΟΓΡΑΦΙΑ ΕΙΝΑΙ Ο ΠΡΩΤΟΣ ΔΡΟΜΟΣ, ΟΧΙ ΕΝΑΣ ΑΠΟ ΤΟΥΣ ΔΕΚΑΠΕΝΤΕ ══════
  //
  // ΤΙ ΕΛΕΓΕ ΚΑΙ ΤΙ ΕΚΑΝΕ. Η κάρτα υπόσχεται «φωτογράφισε την ετικέτα και
  // συμπληρώνουμε μάρκα, μοντέλο, αξία, εγγύηση και ενεργειακή κλάση» — και
  // αμέσως από κάτω άνοιγε δεκατέσσερα άδεια πεδία. Ο χρήστης διαβάζει την
  // υπόσχεση, βλέπει τη φόρμα, και συμπεραίνει ότι η φωτογραφία είναι ένα ακόμη
  // προαιρετικό βήμα πριν τη χειρωνακτική δουλειά. Έτσι η δυνατότητα που
  // ξεχωρίζει το προϊόν καταλήγει να μη χρησιμοποιείται.
  //
  // ΤΙ ΜΕΝΕΙ ΟΡΑΤΟ ΠΡΙΝ ΤΗ ΦΩΤΟΓΡΑΦΙΑ. Τα τρία που ΔΕΝ βγαίνουν ποτέ από
  // εικόνα: δωμάτιο, κατάσταση και απόδειξη. Όλα τα υπόλοιπα τα διαβάζει η
  // σάρωση, οπότε το να ζητηθούν πρώτα είναι δουλειά που ίσως δεν χρειαστεί.
  //
  // ΚΑΙ ΠΑΝΤΑ ΥΠΑΡΧΕΙ ΤΟ ΧΕΡΙ. Παλιό έπιπλο χωρίς ετικέτα, συσκευή που δεν
  // φωτογραφίζεται, χρήστης που βιάζεται: ένα πάτημα ανοίγει τα πάντα. Κρύβουμε
  // βήματα, δεν κλειδώνουμε δρόμους.
  //
  // ΣΤΗΝ ΕΠΕΞΕΡΓΑΣΙΑ ΑΝΟΙΓΕΙ ΟΛΟΚΛΗΡΗ. Όποιος πατά «Επεξεργασία» ήρθε για ένα
  // συγκεκριμένο πεδίο· να το ψάξει πίσω από κουμπί θα ήταν εχθρικό.
  const [manual,setManual] = useState<boolean>(!!item)
  const revealed = manual || (form.photos||[]).length>0
  // Ο αποθηκευμένος τρόπος, αλλιώς η πρόταση της κατηγορίας. Η πρόταση ΔΕΝ
  // γράφεται σιωπηλά στη βάση: γράφεται μόνο αν ο χρήστης αποθηκεύσει, οπότε
  // ένα άνοιγμα της φόρμας δεν αλλάζει δεδομένα.
  const energyMode = (form.energy_mode || suggestedEnergyMode(form.category) || 'hours') as EnergyMode
  const liveKwh = monthlyKwh({ ...form, energy_mode: energyMode } as EnergyInput) ?? 0
  const handleSave = async() => {
    if(!form.name?.trim()){notifyError('Το όνομα είναι υποχρεωτικό.');return}
    const primaryUrl = form.photo_url||(form.photos&&form.photos.length>0?form.photos[0]:'')
    setSaving(true)
    await onSave({...form,photo_url:primaryUrl})
    setSaving(false)
  }
  const [docUp,setDocUp] = useState(false)
  // Οι αποδείξεις πάνε σε ΙΔΙΩΤΙΚΟ bucket, με path ανά ακίνητο· αποθηκεύουμε το PATH και ανοίγουμε με signed URL.
  const uploadReceiptDoc = async(file:File) => {
    setDocUp(true)
    const path=uploadPath(file.name,`receipts/${propertyId}`)
    // ΤΟ `upsert:true` ΔΕΝ ΕΙΧΕ ΠΟΛΙΤΙΚΗ ΝΑ ΤΟ ΣΤΗΡΙΞΕΙ. Ο κάδος έχει πολιτικές
    // μόνο για εισαγωγή, ανάγνωση και διαγραφή — καμία για ενημέρωση, οπότε κάθε
    // αντικατάσταση θα έσκαγε με σφάλμα δικαιωμάτων. Ούτως ή άλλως η διαδρομή
    // περιέχει χρόνο και τυχαίο, άρα δεν υπάρχει τίποτα να αντικατασταθεί.
    const {error}=await supabase.storage.from(DOCS_BUCKET).upload(path,file,{upsert:false})
    if(error){notifyError(failed(MSG.upload));setDocUp(false);return}
    const prev=form.receipt_doc_url
    setForm(f=>({...f,receipt_doc_url:path,receipt_doc_name:file.name}))
    // Καθάρισε τυχόν προηγούμενο ΑΝΕΒΑΣΜΑ αυτής της συνεδρίας (όχι το αρχικά αποθηκευμένο).
    if(prev&&prev!==item?.receipt_doc_url&&!/^https?:\/\//.test(prev)) await supabase.storage.from(DOCS_BUCKET).remove([prev])
    setDocUp(false)
  }
  // AI σάρωση φωτογραφίας (συσκευασία/ετικέτα/booklet/απόδειξη) → προσυμπλήρωση πεδίων.
  const runScan = async(file:File) => {
    if(!file.type.startsWith('image/')||file.size>10*1024*1024) return
    setScanning(true)
    try {
      const b64:string|null = await new Promise(res=>{const r=new FileReader();r.onload=()=>res((r.result as string).split(',')[1]||null);r.onerror=()=>res(null);r.readAsDataURL(file)})
      if(!b64){setScanning(false);return}
      const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000)
      const res=await fetch('/api/anthropic',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({
        model:'claude-sonnet-5',max_tokens:600,system:ITEM_SCAN_SYSTEM,
        messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:file.type||'image/jpeg',data:b64}},{type:'text',text:'Διάβασε τα στοιχεία του αντικειμένου/συσκευής από τη φωτογραφία.'}]}],
      })})
      clearTimeout(timer)
      const data=await res.json()
      if(res.ok&&!data?.error){
        const txt=(data.content||[]).find((c:{type:string})=>c.type==='text')?.text||'{}'
        const d=JSON.parse(txt.replace(/```json?|```/g,'').trim()) as Record<string,string>
        const num=(v:string)=>{const n=parseFloat(String(v||'').replace(/[^\d.]/g,''));return isNaN(n)?0:n}
        setForm(f=>({...f,
          name:f.name||d.name||[d.brand,d.model].filter(Boolean).join(' ')||'',
          brand:f.brand||d.brand||'',
          model:f.model||d.model||'',
          serial_number:f.serial_number||d.serial_number||'',
          category:d.category&&[...INVENTORY_CATEGORIES].includes(d.category)?d.category:f.category,
          purchase_value:f.purchase_value||Math.round(num(d.price)),
          warranty_expiry:f.warranty_expiry||d.warranty_expiry||'',
          energy_class:f.energy_class||(ENERGY_CLASSES.includes(d.energy_class)?d.energy_class:''),
          power_watts:f.power_watts||num(d.power_watts),
          purchase_date:f.purchase_date||d.purchase_date||'',
        }))
        if(d.energy_class||d.power_watts||d.price) setShowMore(true)
      }
    } catch { /* σιωπηλή αποτυχία — μη μπλοκάρει τη ροή */ }
    setScanning(false)
  }

  // ═══ Ο ΚΩΔΙΚΟΣ ΤΗΣ ΕΝΕΡΓΕΙΑΚΗΣ ΕΤΙΚΕΤΑΣ ΣΥΜΠΛΗΡΩΝΕΙ ΤΗΝ ΚΑΡΤΕΛΑ ═══════════
  //
  // ΤΙ ΑΛΛΑΖΕΙ. Τα kWh ανά 100 κύκλους δεν τα θυμάται κανείς και δεν γράφονται
  // στο ταμπελάκι του σασί: γράφονται στην ενεργειακή ετικέτα, που συνήθως έχει
  // πεταχτεί μαζί με το κουτί. Το QR της ετικέτας οδηγεί στο ευρωπαϊκό μητρώο,
  // όπου ο ΙΔΙΟΣ ο κατασκευαστής είναι υποχρεωμένος να τα έχει δηλώσει.
  //
  // ΓΙΑΤΙ ΓΡΑΦΕΙ ΠΑΝΩ ΑΠΟ ΟΣΑ ΥΠΑΡΧΟΥΝ. Σε αντίθεση με τη σάρωση φωτογραφίας,
  // που μαντεύει και άρα δεν πειράζει ό,τι έγραψε ο χρήστης, εδώ η πηγή είναι ο
  // κατασκευαστής και ο χρήστης ζήτησε ρητά τη συμπλήρωση. Η εγγύηση είναι η
  // εξαίρεση: το μητρώο δίνει ΜΗΝΕΣ, όχι ημερομηνία, οπότε χρειάζεται
  // ημερομηνία αγοράς — και δεν σβήνει ημερομηνία που έχει βάλει ο χρήστης.
  const [eprelInput,setEprelInput] = useState('')
  const [eprelBusy,setEprelBusy] = useState(false)
  const [eprelSource,setEprelSource] = useState('')
  const fillFromEprel = async() => {
    if(!parseEprelRef(eprelInput)){notifyError('Χρειάζεται ο σύνδεσμος του QR της ετικέτας ή η ομάδα προϊόντος με τον αριθμό μητρώου.');return}
    setEprelBusy(true)
    try {
      const res=await fetch(`/api/eprel?ref=${encodeURIComponent(eprelInput.trim())}`)
      const data=await res.json() as {fill?:EprelFill;source?:string;error?:string}
      if(!res.ok||data.error||!data.fill){notifyError(data.error||failed('Η ανάγνωση του μητρώου'));setEprelBusy(false);return}
      const fill=data.fill
      setForm(f=>({...f,
        name:f.name||[fill.brand,fill.model].filter(Boolean).join(' '),
        brand:fill.brand??f.brand,
        model:fill.model??f.model,
        energy_class:fill.energy_class&&ENERGY_CLASSES.includes(fill.energy_class)?fill.energy_class:f.energy_class,
        energy_mode:fill.energy_mode??f.energy_mode,
        kwh_per_100_cycles:fill.kwh_per_100_cycles??f.kwh_per_100_cycles,
        annual_kwh:fill.annual_kwh??f.annual_kwh,
        warranty_expiry:f.warranty_expiry||warrantyExpiry(f.purchase_date,fill.guarantee_months)||'',
      }))
      setEprelSource(data.source||'')
      setShowMore(true)
    } catch { notifyError(failed('Η ανάγνωση του μητρώου')) }
    setEprelBusy(false)
  }

  // Ενιαίο πεδίο φωτογραφίας: ανεβάζει τη φωτογραφία ΚΑΙ (προαιρετικά) τη διαβάζει
  // με AI — μία ενέργεια, όχι δύο ξεχωριστά «πεδία φωτο».
  const [photoBusy,setPhotoBusy] = useState(false)
  const addPhotoFile = async(file:File) => {
    setPhotoBusy(true)
    const {path,error}=await uploadUserScoped(supabase,'inventory-photos',uploadPath(file.name),file,{upsert:true})
    if(!error){ const {data:u}=supabase.storage.from('inventory-photos').getPublicUrl(path); setForm(f=>{const photos=[...(f.photos||[]),u.publicUrl]; return {...f,photos,photo_url:f.photo_url||u.publicUrl}}) }
    else notifyError(failed(MSG.upload))
    setPhotoBusy(false)
  }
  const removePhoto = (url:string) => { const p=(form.photos||[]).filter(x=>x!==url); set('photos',p); if(form.photo_url===url) set('photo_url',p[0]||'') }
  const pickPhoto = async(file:File) => { await addPhotoFile(file); runScan(file) }

  // ΤΟ ΥΨΟΣ ΗΤΑΝ ΚΛΕΙΔΩΜΕΝΟ ΣΤΟ `calc(100vh - 32px)` ΜΕ maxHeight 820: ένα «Νέο
  // Αντικείμενο» με τρία πεδία άνοιγε παράθυρο ολόκληρης οθόνης με 600px κενό
  // κάτω από την τελευταία γραμμή. Το Modal μεγαλώνει με το περιεχόμενο ως 92dvh.
  //
  // ΚΑΜΙΑ ΕΞΟΔΟΣ ΟΣΟ ΤΡΕΧΕΙ Η ΑΠΟΘΗΚΕΥΣΗ. Το Modal φέρνει Escape και κλικ στο
  // φόντο, που το χειρόγραφο δεν είχε· εδώ όμως έχουν ήδη ανέβει φωτογραφίες και
  // απόδειξη στο storage, οπότε μια έξοδος στη μέση της εγγραφής αφήνει ορφανά
  // αρχεία και αντικείμενο που ο χρήστης νομίζει ότι καταχωρήθηκε.
  const closeGuarded = () => { if(!saving) onClose() }
  return (
    <Modal open onClose={closeGuarded} width={680}
      title={item?'Επεξεργασία Αντικειμένου':'Νέο Αντικείμενο'}
      subtitle={item?item.name:undefined}
      footer={<>
        <Btn onClick={closeGuarded} disabled={saving}>Ακύρωση</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση'}</Btn>
      </>}>
      {/* Ένα πεδίο: φωτογραφία + αυτόματη ανάγνωση με AI (μάρκα, μοντέλο, αξία, εγγύηση, ενέργεια) */}
      <input ref={scanRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)pickPhoto(f);e.currentTarget.value=''}}/>
      <style>{`@keyframes invSpin{to{transform:rotate(360deg)}}`}</style>
      {(form.photos||[]).length===0 ? (
        <button onClick={()=>{if(!scanning&&!photoBusy)scanRef.current?.click()}} disabled={scanning||photoBusy}
          style={{display:'flex',alignItems:'center',gap:14,width:'100%',textAlign:'left',padding:'16px 18px',borderRadius:T.radius.card,border:'1px solid var(--accent-border)',background:'var(--accent-soft)',cursor:(scanning||photoBusy)?'wait':'pointer',fontFamily:T.font.sans}}>
          <div style={{width:44,height:44,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--accent)'}}>
            {(scanning||photoBusy)?<div style={{width:18,height:18,border:'2px solid var(--accent-border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>
              :<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.2"/></svg>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:'var(--accent)'}}>{scanning?'Ανάγνωση φωτογραφίας…':photoBusy?'Μεταφόρτωση…':'Προσθήκη φωτογραφίας'}</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.45,marginTop:2}}>Ανεβάστε φωτογραφία του αντικειμένου, της ετικέτας ή της απόδειξης και συμπληρώνουμε αυτόματα μάρκα, μοντέλο, αξία, εγγύηση και ενεργειακή κλάση.</div>
          </div>
        </button>
      ) : (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(84px,1fr))',gap:8}}>
            {(form.photos||[]).map((url,i)=>(
              <div key={i} {...pressable(()=>set('photo_url',url), url===form.photo_url?'Κύρια φωτογραφία':'Ορισμός ως κύρια φωτογραφία')} title={url===form.photo_url?'Κύρια φωτογραφία':'Ορισμός ως κύρια'} style={{position:'relative',height:84,borderRadius:10,overflow:'hidden',border:`2px solid ${url===form.photo_url?'var(--accent)':'var(--border-subtle)'}`,cursor:'pointer'}}>
                <img src={url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                <button onClick={e=>{e.stopPropagation();removePhoto(url)}} aria-label="Αφαίρεση" style={{position:'absolute',top:5,right:5,width:20,height:20,borderRadius:'50%',background:'rgba(0,0,0,0.55)',border:'none',color:'var(--on-media)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                {url===form.photo_url&&<div style={{position:'absolute',inset:'auto 0 0 0',background:'var(--accent)',fontSize:9,color:'var(--accent-text)',textAlign:'center',fontWeight:700,fontFamily:T.font.sans,padding:'2px',letterSpacing:'0.5px'}}>ΚΥΡΙΑ</div>}
              </div>
            ))}
            <button onClick={()=>{if(!scanning&&!photoBusy)scanRef.current?.click()}} disabled={scanning||photoBusy} title="Προσθήκη φωτογραφίας" style={{height:84,borderRadius:10,border:'1.5px dashed var(--border-accent)',background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',cursor:(scanning||photoBusy)?'wait':'pointer',color:'var(--accent)'}}>
              {(scanning||photoBusy)?<div style={{width:16,height:16,border:'2px solid var(--accent-border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>
                :<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>}
            </button>
          </div>
          <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:7,fontFamily:T.font.sans}}>Κάθε νέα φωτογραφία διαβάζεται αυτόματα με AI. Κλικ σε φωτογραφία για να οριστεί ως κύρια.</p>
        </div>
      )}

      {/* Ταυτότητα αντικειμένου — μόνο όσα ορίζει το μητρώο, με το «γιατί» τους */}
      {revealed && (<>
        <Field d={f('inv.name')}>
          <TextInput ariaLabel={fl('inv.name')} value={form.name||''} onChange={v=>set('name',v)} placeholder="Παράδειγμα: Πλυντήριο Ρούχων Bosch WAU28"/>
        </Field>
        <Field d={f('inv.category')}>
          <CustomSelect value={form.category||'Λοιπά'} onChange={v=>set('category',v)} options={[...INVENTORY_CATEGORIES].map(c=>({value:c,label:c}))}/>
        </Field>
      </>)}
      <div style={{...formGrid(200, 270),gap:12}}>
        <Field d={f('inv.condition')}>
          <CustomSelect value={form.condition||'Καλή'} onChange={v=>set('condition',v)} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
        </Field>
        <Field d={f('inv.room')}><RoomInput value={form.room||''} onChange={v=>set('room',v)}/></Field>
      </div>

      {/* Αγορά */}
      {revealed && (<>
        <SectionLabel label="Αγορά"/>
        <div style={{...formGrid(200, 270),gap:12}}>
          <Field d={f('inv.purchase_date')}><DatePicker value={form.purchase_date||''} onChange={v=>set('purchase_date',v)}/></Field>
          <Field d={f('inv.value')}><NumberInput ariaLabel={fl('inv.value')} value={blankIfZero(form.purchase_value)} onChange={v=>set('purchase_value',parseFloat(v)||0)} suffix="€" min={0}/></Field>
        </div>
      </>)}

      {/* Η ΑΠΟΔΕΙΞΗ ΕΙΝΑΙ CORE, ΟΧΙ «ΠΕΡΙΣΣΟΤΕΡΑ»: χωρίς παραστατικό η δαπάνη
          δεν εκπίπτει, και το χαρτί δεν ξαναβρίσκεται έξι μήνες μετά. */}
      {f('inv.receipt') && (
        <Field d={f('inv.receipt')}>
          {form.receipt_doc_url
            ?<div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.inner}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                <span style={{flex:1,minWidth:0,fontSize:13,color:'var(--text-primary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.receipt_doc_name||'Συνημμένο αρχείο'}</span>
                <button onClick={()=>openInventoryDoc(form.receipt_doc_url)} style={{fontSize:12,color:'var(--accent)',fontFamily:T.font.sans,fontWeight:500,background:'none',border:'none',cursor:'pointer',whiteSpace:'nowrap',padding:0}}>Άνοιγμα</button>
                <button onClick={async()=>{const old=form.receipt_doc_url;setForm(f2=>({...f2,receipt_doc_url:'',receipt_doc_name:''}));/* Διέγραψε αμέσως μόνο αν είναι αρχείο αυτής της συνεδρίας· το αρχικά αποθηκευμένο καθαρίζεται με το save. */ if(old&&old!==item?.receipt_doc_url&&!/^https?:\/\//.test(old))await supabase.storage.from(DOCS_BUCKET).remove([old])}} title="Αφαίρεση" style={{width:26,height:26,borderRadius:'50%',border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:'var(--text-tertiary)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
              </div>
            :<label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,height:44,border:'1.5px dashed var(--border-default)',borderRadius:T.radius.inner,cursor:'pointer',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                {docUp?'Ανέβασμα…':'Φωτογράφισε ή επισύναψε την απόδειξη'}
                <input type="file" accept=".pdf,image/*" style={{display:'none'}} onChange={e=>{const fl=e.target.files?.[0];if(fl)uploadReceiptDoc(fl)}}/>
              </label>}
        </Field>
      )}

      {form.purchase_date&&(form.purchase_value||0)>0&&(
        <div style={{padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',gap:8}}>
            {[
              {label:'Εκτιμώμενη υπολειπόμενη αξία',value:fe(calcCurrentValue({...form,id:'',user_id:''} as InventoryItem))},
              {label:'Ποσοστό που μένει',value:`${Math.max(0,100-calcDepreciationPct({...form,id:'',user_id:''} as InventoryItem))}%`},
              {label:'Εκτιμώμενα χρόνια ζωής',value:`περίπου ${calcYearsLeft({...form,id:'',user_id:''} as InventoryItem)} χρόνια`},
            ].map((k,i)=>(
              <div key={i} style={{textAlign:'center'}}>
                <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{k.value}</p>
                <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
              </div>
            ))}
          </div>
          <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45,marginTop:8}}>{NOT_TAX_DEPRECIATION_NOTE}</p>
        </div>
      )}

      {/* ΤΟ ΧΕΡΙ, ΓΙΑ ΟΣΑ ΔΕΝ ΦΩΤΟΓΡΑΦΙΖΟΝΤΑΙ. Παλιό έπιπλο χωρίς ετικέτα,
          αντικείμενο που δεν έχει πια συσκευασία, χρήστης που βιάζεται. */}
      {!revealed && (
        <button onClick={()=>setManual(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:'11px 14px',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',background:'transparent',cursor:'pointer',fontFamily:T.font.sans,fontSize:13,fontWeight:500,color:'var(--text-secondary)'}}>
          Συμπλήρωση με το χέρι
        </button>
      )}

      {/* Περισσότερα — υπαρκτά αλλά σπάνια, κλειστά εξ αρχής */}
      {revealed && fields.more.length>0 && (
        <button onClick={()=>setShowMore(m=>!m)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',textAlign:'left',padding:'11px 14px',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',cursor:'pointer',fontFamily:T.font.sans}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--text-tertiary)',transform:showMore?'rotate(90deg)':'none',transition:'transform 0.15s'}}><path d="m9 18 6-6-6-6"/></svg>
          <span style={{flex:1,fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>Περισσότερα: εγγύηση, ταυτότητα συσκευής{isElectric?', ενέργεια':''} και κόστος αντικατάστασης</span>
        </button>
      )}
      {revealed&&showMore&&(<>
        {/* ═══ ΤΡΙΑ ΠΕΔΙΑ ΣΕ ΔΥΟ ΣΤΗΛΕΣ, ΚΑΙ ΤΟ ΕΝΑ ΚΟΒΟΤΑΝ ══════════════════════
            Η «Μάρκα και μοντέλο» είναι ΔΥΟ κουτιά μέσα σε ΕΝΑ κελί πλέγματος,
            με τον «Σειριακό» δίπλα στο δεύτερο κελί. Το κελί φτάνει τα 270
            εικονοστοιχεία, οπότε τα δύο κουτιά έμεναν με 130 το καθένα: το
            «WAU28PI0GR» δεν χωρούσε και φαινόταν κομμένο κάτω από τον σειριακό.
            Ο κωδικός μοντέλου είναι ακριβώς αυτό που πάει στον τεχνικό — ένα
            πεδίο που δεν δείχνει την τιμή του δεν έχει λόγο ύπαρξης.

            Η μάρκα και το μοντέλο παίρνουν δική τους σειρά σε όλο το πλάτος, και
            ο σειριακός κατεβαίνει δίπλα στην εγγύηση: δύο κωδικοί που ζητούνται
            σε δύο διαφορετικές στιγμές (ανταλλακτικό, ασφαλιστική) δεν χρειάζεται
            να μοιράζονται σειρά. */}
        <Field d={f('inv.brand_model')}>
          <div style={{...formGrid(160, 300),gap:10}}>
            <TextInput ariaLabel="Μάρκα" value={form.brand||''} onChange={v=>set('brand',v)} placeholder="Bosch"/>
            <TextInput ariaLabel="Μοντέλο" value={form.model||''} onChange={v=>set('model',v)} placeholder="WAU28PI0GR"/>
          </div>
        </Field>
        <div style={{...formGrid(200, 270),gap:12}}>
          <Field d={f('inv.serial')}><TextInput ariaLabel={fl('inv.serial')} value={form.serial_number||''} onChange={v=>set('serial_number',v)} placeholder="SN / IMEI"/></Field>
          <Field d={f('inv.warranty')}><DatePicker value={form.warranty_expiry||''} onChange={v=>set('warranty_expiry',v)}/></Field>
        </div>
        <Field d={f('inv.replacement_cost')}>
          <NumberInput ariaLabel={fl('inv.replacement_cost')} value={blankIfZero(form.replacement_cost)} onChange={v=>set('replacement_cost',parseFloat(v)||0)} suffix="€" min={0}/>
        </Field>
        {isElectric&&(<>
          <SectionLabel label="Ενέργεια"/>
          {/* ═══ Ο ΚΩΔΙΚΟΣ ΤΗΣ ΕΤΙΚΕΤΑΣ ΠΡΩΤΟΣ, ΤΑ ΠΕΔΙΑ ΜΕΤΑ ═══════════════════
              Ό,τι ακολουθεί από κάτω το δηλώνει ήδη ο κατασκευαστής στο
              ευρωπαϊκό μητρώο. Το να ζητηθεί πρώτα το χέρι και μετά να
              προσφερθεί ο εύκολος δρόμος είναι η ίδια αντιστροφή που είχε και η
              φωτογραφία: ο χρήστης προλαβαίνει να πληκτρολογήσει. */}
          <div>
            <label style={labelStyle}>Ενεργειακή ετικέτα (μητρώο EPREL)</label>
            <div style={{...formGrid(200, 150),gap:10}}>
              {/* Μόλις αλλάξει ο κωδικός, η αναφορά στην πηγή σβήνει: θα έδειχνε
                  τη ΓΕΙΤΟΝΙΚΗ καταχώρηση για νούμερα που δεν ήρθαν από εκείνη. */}
              <TextInput ariaLabel="Σύνδεσμος ή κωδικός μητρώου EPREL" value={eprelInput}
                onChange={v=>{setEprelInput(v);setEprelSource('')}}
                placeholder="eprel.ec.europa.eu/screen/product/…"/>
              <Btn onClick={fillFromEprel} disabled={eprelBusy||!eprelInput.trim()}>
                {eprelBusy?'Ανάγνωση…':'Συμπλήρωση'}
              </Btn>
            </div>
            {/* Η ΠΗΓΗ ΜΕΝΕΙ ΟΡΑΤΗ. Νούμερα που μπήκαν μόνα τους χωρίς τρόπο να
                ελεγχθούν είναι χειρότερα από νούμερα που έγραψε ο χρήστης. */}
            <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45,marginTop:5}}>
              {eprelSource
                ? <>Συμπληρώθηκαν από τον κατασκευαστή. <a href={eprelSource} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)'}}>Η καταχώρηση στο μητρώο</a></>
                : 'Σάρωσε το QR της ενεργειακής ετικέτας και επικόλλησε τον σύνδεσμο. Μάρκα, μοντέλο, κλάση και κατανάλωση έρχονται όπως τα δηλώνει ο κατασκευαστής.'}
            </p>
          </div>
          <Field d={f('inv.energy_class')}>
            <CustomSelect value={form.energy_class||''} onChange={v=>set('energy_class',v)} options={[{value:'',label:'Δεν γνωρίζω'},...ENERGY_CLASSES.map(c=>({value:c,label:c}))]}/>
          </Field>
          {/* ═══ ΤΡΕΙΣ ΤΡΟΠΟΙ, ΓΙΑΤΙ Η ΕΤΙΚΕΤΑ ΔΗΛΩΝΕΙ ΔΙΑΦΟΡΕΤΙΚΟ ΜΕΓΕΘΟΣ ══════
              Η φόρμα ρωτούσε ΠΑΝΤΑ Watt και ώρες την ημέρα. Το πλυντήριο όμως
              δεν δουλεύει ώρες την ημέρα, δουλεύει κύκλους — και η ενεργειακή
              του ετικέτα δεν γράφει πουθενά Watt: γράφει kWh ανά 100 κύκλους.
              Το ψυγείο γράφει kWh τον χρόνο. Ζητούσαμε δηλαδή νούμερα που δεν
              υπάρχουν πάνω στη συσκευή, και βγάζαμε κόστος δεκαεπτά φορές πάνω
              από το πραγματικό.

              Ο ΤΡΟΠΟΣ ΠΡΟΤΕΙΝΕΤΑΙ ΑΠΟ ΤΗΝ ΚΑΤΗΓΟΡΙΑ ΚΑΙ ΑΛΛΑΖΕΙ. Η κατηγορία
              «Ηλεκτρικές Συσκευές» χωράει και πλυντήριο και ψυγείο, οπότε η
              πρόταση θα πέφτει έξω τις μισές φορές· γι' αυτό αποθηκεύεται και
              δεν συνάγεται κάθε φορά από το είδος. */}
          <div>
            <label style={labelStyle}>Πώς μετριέται</label>
            <CustomSelect value={energyMode} onChange={v=>set('energy_mode',v as EnergyMode)}
              options={(['cycles','annual','hours'] as const).map(m=>({value:m,label:ENERGY_MODE_LABEL[m]}))}/>
          </div>
          {energyMode==='cycles'&&(
            <Field d={f('inv.power_use')}>
              <div style={{...formGrid(160, 220),gap:12}}>
                <NumberInput ariaLabel="Κιλοβατώρες ανά 100 κύκλους" value={blankIfZero(form.kwh_per_100_cycles)} onChange={v=>set('kwh_per_100_cycles',parseFloat(v)||0)} suffix="kWh/100" min={0}/>
                <NumberInput ariaLabel="Κύκλοι ανά μήνα" value={blankIfZero(form.cycles_per_month)} onChange={v=>set('cycles_per_month',parseFloat(v)||0)} suffix="φορές/μήνα" min={0}/>
              </div>
            </Field>
          )}
          {energyMode==='annual'&&(
            <Field d={f('inv.power_use')}>
              <NumberInput ariaLabel="Κιλοβατώρες ανά έτος" value={blankIfZero(form.annual_kwh)} onChange={v=>set('annual_kwh',parseFloat(v)||0)} suffix="kWh/έτος" min={0}/>
            </Field>
          )}
          {energyMode==='hours'&&(
            <Field d={f('inv.power_use')}>
              <div style={{...formGrid(160, 220),gap:12}}>
                <NumberInput ariaLabel="Ισχύς σε βατ" value={blankIfZero(form.power_watts)} onChange={v=>set('power_watts',parseFloat(v)||0)} suffix="W" min={0}/>
                <NumberInput ariaLabel="Ώρες χρήσης ανά ημέρα" value={blankIfZero(form.daily_hours_use)} onChange={v=>set('daily_hours_use',parseFloat(v)||0)} suffix="ώρες/ημέρα" min={0} max={24}/>
              </div>
            </Field>
          )}
          {/* ΤΟ ΚΟΣΤΟΣ ΕΜΦΑΝΙΖΕΤΑΙ ΜΟΝΟ ΜΕ ΔΗΛΩΜΕΝΗ ΤΙΜΗ ΡΕΥΜΑΤΟΣ. Πριν, εδώ
              πολλαπλασιαζόταν με σταθερά 0,22 €/kWh — νούμερο που κανείς δεν είχε
              δηλώσει και που άλλαζε το συμπέρασμα κάθε συσκευής. */}
          {liveKwh>0&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',gap:8,padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
              {[{label:'kWh/μήνα',value:liveKwh.toFixed(1)},{label:'kWh/έτος',value:(liveKwh*12).toFixed(0)},
                {label:'Κόστος/μήνα',value:kwhPrice>0?fe(liveKwh*kwhPrice):fe(0)},
                {label:'Κόστος/έτος',value:kwhPrice>0?fe(liveKwh*kwhPrice*12):fe(0)}].map((k,i)=>(
                <div key={i} style={{textAlign:'center'}}>
                  <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{k.value}</p>
                  <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
                </div>
              ))}
              <p style={{gridColumn:'1/-1',fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45}}>
                {kwhPrice>0
                  ? `Στην τιμή ${feRate(kwhPrice)} ανά κιλοβατώρα, όπως προκύπτει από τον λογαριασμό ρεύματός σου.`
                  : 'Για να δεις κόστος σε ευρώ, σάρωσε έναν λογαριασμό ρεύματος ή δήλωσε την τιμή €/kWh στην Επισκόπηση. Δεν βάζουμε δική μας τιμή.'}
              </p>
            </div>
          )}
        </>)}
        <Field d={f('inv.notes')}>
          <Textarea value={form.notes||''} onChange={v=>set('notes',v)} placeholder="Παρατηρήσεις, ιστορικό, χαρακτηριστικά…" rows={2}/>
        </Field>
      </>)}
    </Modal>
  )
}
function RepairModal({item,repairs,onAdd,onClose,propertyId,userId}:{item:InventoryItem;repairs:InventoryRepair[];onAdd:(r:Partial<InventoryRepair>)=>void;onClose:()=>void;propertyId:string;userId:string}) {
  const [form,setForm] = useState({repair_date:'',cost:0,technician:'',description:''})
  const costId = useId(); const techId = useId()
  const [pushExpenses,setPushExpenses] = useState(true)
  const [saving,setSaving] = useState(false)
  const [contacts,setContacts] = useState<{id:string;full_name:string}[]>([])
  const [showContactPicker,setShowContactPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{contactStore.ofProperty<{id:string;full_name:string}>(supabase,propertyId,'id,full_name',userId).then(setContacts)},[propertyId,userId])
  useEffect(()=>{const h=(e:MouseEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(e.target as Node))setShowContactPicker(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])
  const itemRepairs = repairs.filter(r=>r.item_id===item.id)
  const totalCost = itemRepairs.reduce((s,r)=>s+(r.cost||0),0)
  const curVal = calcCurrentValue(item)
  const handleAdd = async() => {
    if(!form.description.trim()){notifyError('Η περιγραφή είναι υποχρεωτική.');return}
    setSaving(true)
    await onAdd(form)
    if(pushExpenses&&form.cost>0){
      const {error}=await expenses.insert(supabase,[expenses.row({propertyId,userId},{description:`Επισκευή: ${item.name}${form.technician?` (${form.technician})`:''}${form.description?`, ${form.description}`:''}`,amount:form.cost,category:'Συντήρηση & Επισκευές',date:form.repair_date||athensToday(),paid:true,notes:`Αυτόματη εισαγωγή από ${navLabel('inventory')}, ${item.name}`})])
      // Ο διακόπτης υπόσχεται ρητά ότι η επισκευή περνά στις δαπάνες. Αν δεν
      // περάσει, ο χρήστης πρέπει να το μάθει ΤΩΡΑ, όχι στη φορολογική δήλωση.
      if(error) notifyError(failed('Η επισκευή καταχωρήθηκε, αλλά η δαπάνη δεν πέρασε στα έξοδα',error))
    }
    setForm({repair_date:'',cost:0,technician:'',description:''})
    setSaving(false)
  }
  // Η «Καταχώρηση Επισκευής» ήταν το τελευταίο στοιχείο ΜΕΣΑ στο σώμα που κυλά:
  // με ιστορικό πέντε επισκευών ο χρήστης έπρεπε να κυλήσει ως το τέλος για να τη
  // βρει. Στο υποσέλιδο του Modal μένει καρφωμένη και ορατή σε κάθε θέση κύλισης.
  //
  // Η καταχώρηση γράφει σε ΔΥΟ πίνακες (inventory_repairs και, με τον διακόπτη
  // ανοιχτό, expenses). Escape ή κλικ στο φόντο ανάμεσα στα δύο — έξοδοι που το
  // χειρόγραφο δεν είχε — κρύβει το μήνυμα που λέει ότι η δαπάνη δεν πέρασε.
  const closeGuarded = () => { if(!saving) onClose() }
  return (
    <Modal open onClose={closeGuarded} width={520} title="Επισκευές" subtitle={item.name}
      footer={<Btn variant="primary" onClick={handleAdd} disabled={saving}>{saving?'Αποθήκευση…':'Καταχώρηση Επισκευής'}</Btn>}>
      {/* Το ξεπέρασμα του ορίου είναι προειδοποίηση· το «εντός ορίων» δεν
          είναι βραβείο. Πράσινο πλαίσιο γύρω από ένα κόστος επισκευών λέει
          στον χρήστη «μπράβο που ξόδεψες», που δεν το εννοούσε κανείς. */}
      {totalCost>0&&curVal>0&&(
        <div style={{padding:'10px 14px',background:totalCost>curVal*0.5?'var(--warning-soft)':'var(--bg-elevated)',borderRadius:T.radius.inner,border:`1px solid ${totalCost>curVal*0.5?'var(--warning-border)':'var(--border-subtle)'}`}}>
          <p style={{fontSize:12,color:totalCost>curVal*0.5?'var(--warning)':'var(--text-secondary)',fontWeight:500,fontFamily:T.font.sans}}>{totalCost>curVal*0.5?`Οι επισκευές (${fe(totalCost)}) ξεπερνούν το μισό της τρέχουσας αξίας (${fe(curVal)}). Σκέψου αντικατάσταση.`:`Επισκευές ${fe(totalCost)} σε αξία ${fe(curVal)}.`}</p>
        </div>
      )}
      <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
      {itemRepairs.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <SectionLabel label="Ιστορικό" right={<span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{fe(totalCost)}</span>}/>
          {itemRepairs.map(r=>(
            <div key={r.id} style={{background:'var(--bg-elevated)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--border-subtle)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{r.description}</p>
                <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fe(r.cost)}</p>
              </div>
              <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(r.repair_date)}{r.technician?` · ${r.technician}`:''}</p>
            </div>
          ))}
        </div>
      )}
      <SectionLabel label="Νέα επισκευή"/>
      <div style={{...formGrid(200, 270),gap:12}}>
        <div><label style={labelStyle}>Ημερομηνία</label><DatePicker value={form.repair_date} onChange={v=>setForm(f=>({...f,repair_date:v}))}/></div>
        <div><label htmlFor={costId} style={labelStyle}>Κόστος</label><NumberInput id={costId} value={String(form.cost)} onChange={v=>setForm(f=>({...f,cost:parseFloat(v)||0}))} suffix="€" min={0}/></div>
        <div style={{gridColumn:'1/-1'}}>
          <label htmlFor={techId} style={labelStyle}>Τεχνικός, συνεργείο</label>
          <div style={{display:'flex',gap:8}}>
            <div style={{flex:1}}><TextInput id={techId} value={form.technician} onChange={v=>setForm(f=>({...f,technician:v}))} placeholder="Παράδειγμα: Ηλεκτρολόγος Γεωργίου"/></div>
            {contacts.length>0&&(
              <div ref={pickerRef} style={{position:'relative',flexShrink:0}}>
                <button type="button" onClick={()=>setShowContactPicker(s=>!s)} style={{padding:'0 12px',height:T.h.lg,borderRadius:8,border:'1px solid var(--border-subtle)',background:showContactPicker?'var(--accent-dim)':'var(--bg-elevated)',color:showContactPicker?'var(--accent)':'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer'}}>Επαφές</button>
                {showContactPicker&&(
                  <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:T.radius.card,padding:8,zIndex:700,minWidth:200,maxHeight:200,overflowY:'auto',boxShadow:'var(--shadow-lg)'}}>
                    <div style={{fontSize:10,color:'var(--text-secondary)',padding:'4px 8px 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans,borderBottom:'1px solid var(--border-subtle)',marginBottom:4}}>Επιλογή επαφής</div>
                    {contacts.map(c=>(
                      <div key={c.id} {...pressable(()=>{setForm(f=>({...f,technician:c.full_name}));setShowContactPicker(false)})} style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:13,fontFamily:T.font.sans,color:'var(--text-primary)'}} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-elevated)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>{c.full_name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Περιγραφή *</label><Textarea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="Τι επισκευάστηκε…" rows={2}/></div>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
        <div>
          <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Καταχώρηση στις Δαπάνες</p>
          <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Αυτόματη εισαγωγή στην καρτέλα «Δαπάνες»</p>
        </div>
        <Toggle on={pushExpenses} onChange={setPushExpenses}/>
      </div>
    </Modal>
  )
}

// Χωρίς `profileType`: ο επαγγελματίας δεν βλέπει πια ΔΙΑΦΟΡΕΤΙΚΑ νούμερα αξίας.
// Έβλεπε τέσσερα επιπλέον κελιά κάτω από τον τίτλο «Απόσβεση», που είναι ακριβώς
// ο χρήστης για τον οποίο η λέξη σημαίνει κάτι νομικά διαφορετικό.
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΣΕΛΙΔΑ, ΜΙΑ ΙΕΡΑΡΧΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Ήταν τρεις υποκαρτέλες: «Αντικείμενα», «Εγγυήσεις και Συντήρηση»,
// «Επισκόπηση». Τρία κλικ για να δεις την κατάσταση ενός σπιτιού με δέκα
// αντικείμενα, και η ίδια πληροφορία σε δύο από τις τρεις: η εγγύηση που λήγει
// ήταν και στο «Χρειάζονται προσοχή» της Επισκόπησης και σε δική της ενότητα
// στη Φροντίδα· η κατάσταση του αντικειμένου ήταν και σήμα στην κάρτα του και
// γραμμή στη λίστα προσοχής.
//
// Τώρα η σελίδα διαβάζεται από πάνω προς τα κάτω σαν πρόταση:
//   τι πρέπει να κάνω → τι έχω → τι έχω προγραμματίσει → πού πάει το ρεύμα
//   και η αξία → τι έχω παραδώσει.
// Κάθε πράγμα λέγεται σε ΕΝΑ σημείο, εκείνο όπου μπορείς να το κάνεις.
// ═══════════════════════════════════════════════════════════════════════════
function AttentionCard({items,onEdit,onWarrantyReminder}:{items:InventoryItem[];onEdit:(i:InventoryItem)=>void;onWarrantyReminder:(i:InventoryItem)=>void}) {
  const [pushed,setPushed] = useState<Set<string>>(new Set())
  // ΜΙΑ ΛΙΣΤΑ, ΤΑΞΙΝΟΜΗΜΕΝΗ ΚΑΤΑ ΣΟΒΑΡΟΤΗΤΑ, ΧΩΡΙΣ ΧΡΩΜΑ.
  // Η σοβαρότητα φαίνεται από τη ΣΕΙΡΑ: πρώτα ό,τι χάλασε, μετά ό,τι γερνά,
  // τελευταία η εγγύηση που τρέχει. Μια κόκκινη κουκκίδα δεν προσθέτει τίποτα
  // που δεν λέει ήδη η θέση, και σε όποιον δεν ξεχωρίζει χρώματα δεν λέει τίποτα.
  const attention = (() => {
    const out: {item:InventoryItem;label:string;kind:'cond'|'repl'|'warr'}[] = []
    const seen = new Set<string>()
    const add = (list:InventoryItem[], label:string, kind:'cond'|'repl'|'warr') =>
      list.forEach(i=>{ if(seen.has(i.id))return; out.push({item:i,label,kind}); seen.add(i.id) })
    add(items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας'), 'Κακή κατάσταση', 'cond')
    add(items.filter(i=>replacementSuggestion(i).suggested), 'Προτείνεται αντικατάσταση', 'repl')
    add(items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90}), 'Η εγγύηση λήγει σύντομα', 'warr')
    return out
  })()

  if(attention.length===0) return (
    <div style={{...cardStyle,display:'flex',alignItems:'center',gap:14,padding:'16px 20px'}}>
      <div style={{width:36,height:36,borderRadius:T.radius.pill,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--text-secondary)'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <div style={{minWidth:0}}>
        <p style={{fontSize:14,fontWeight:600,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Τίποτα δεν χρειάζεται προσοχή</p>
        <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Καμία εγγύηση κοντά στη λήξη, καμία κακή κατάσταση, καμία πρόταση αντικατάστασης.</p>
      </div>
    </div>
  )

  return (
    <div style={cardStyle}>
      <SectionLabel label="Χρειάζονται προσοχή" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{attention.length} {attention.length===1?'αντικείμενο':'αντικείμενα'}</span>}/>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {attention.slice(0,6).map(({item,label,kind})=>(
          <div key={item.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
            <div style={{minWidth:0,flex:1}}>
              <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
              <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {label}{item.room?` · ${item.room}`:''}
                {kind==='warr'&&item.warranty_expiry?` · ${fmtDate(item.warranty_expiry)}`:''}
                {kind==='repl'&&item.replacement_cost?` · ${fe(item.replacement_cost)}`:''}
              </p>
            </div>
            {/* ΜΙΑ ΕΝΕΡΓΕΙΑ ΑΝΑ ΓΡΑΜΜΗ, ΕΚΕΙΝΗ ΠΟΥ ΛΥΝΕΙ ΤΟ ΣΥΓΚΕΚΡΙΜΕΝΟ.
                Πριν, η γραμμή έδειχνε ένα σήμα κατάστασης, δηλαδή ξανάλεγε την
                αιτία που μόλις διαβάστηκε δίπλα, και δεν πρόσφερε τίποτα να κάνεις. */}
            {kind==='warr'
              ? <button onClick={()=>{onWarrantyReminder(item);setPushed(p=>new Set(p).add(item.id))}} disabled={pushed.has(item.id)}
                  style={{flexShrink:0,padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:pushed.has(item.id)?'var(--text-tertiary)':'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:pushed.has(item.id)?'default':'pointer',whiteSpace:'nowrap'}}>
                  {pushed.has(item.id)?'Στο ημερολόγιο':'Υπενθύμιση'}
                </button>
              : <button onClick={()=>onEdit(item)}
                  style={{flexShrink:0,padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>
                  Άνοιγμα
                </button>}
          </div>
        ))}
      </div>
      {attention.length>6&&<p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,marginTop:10,textAlign:'center'}}>και {attention.length-6} ακόμη, με το φίλτρο «Προσοχή» παρακάτω</p>}
    </div>
  )
}

// Πού πάει η αξία και πού πάει το ρεύμα. Δύο κάρτες δίπλα δίπλα, και ΜΟΝΟ όταν
// υπάρχει τι να δείξουν: χωρίς μετρημένη κατανάλωση δεν υπάρχει κάρτα ρεύματος.
function AnalysisCards({items,repairs,kwhPrice,kwhControl}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number;kwhControl?:React.ReactNode}) {
  const totalRepairs = repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems = items.filter(hasEnergy)
  const byCategory = [...INVENTORY_CATEGORIES].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
  const maxVal = Math.max(...byCategory.map(x=>x.val),1)
  const topEnergy = [...electricItems].sort((a,b)=>calcMonthlyCost(b,kwhPrice)-calcMonthlyCost(a,kwhPrice)).slice(0,5)

  const categoriesCard = (
    <div style={cardStyle}>
      <SectionLabel label="Κατανομή αξίας ανά κατηγορία"/>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {byCategory.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>(
          <div key={cat}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10,marginBottom:5}}>
              <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat} <span style={{color:'var(--text-tertiary)',fontSize:10}}>({count})</span></span>
              <span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600,flexShrink:0}}>{fe(val)}</span>
            </div>
            <div style={{height:4,background:'var(--border-subtle)',borderRadius:3}}><div style={{height:4,borderRadius:3,background:'var(--accent)',width:`${(val/maxVal)*100}%`,transition:'width 0.5s'}}/></div>
          </div>
        ))}
      </div>
      {totalRepairs>0&&(
        <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:10}}>
          <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Επισκευές έως τώρα</span>
          <span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fe(totalRepairs)}</span>
        </div>
      )}
    </div>
  )

  if(electricItems.length===0) return categoriesCard
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:16,alignItems:'start'}}>
      <div style={cardStyle}>
        <SectionLabel label="Κατανάλωση ρεύματος" right={kwhControl}/>
        {topEnergy.map(item=>{
          const mc=calcMonthlyCost(item,kwhPrice); const maxMc=calcMonthlyCost(topEnergy[0],kwhPrice)
          return (
            <div key={item.id} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                  {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                  <span style={{fontSize:11,color:'var(--text-primary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                </div>
                <span style={{fontSize:11,fontFamily:T.font.num,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,flexShrink:0}}>{kwhPrice>0?`${fe(mc)} τον μήνα`:`${fn(calcMonthlyKwh(item),1)} kWh`}</span>
              </div>
              <div style={{height:3,background:'var(--border-subtle)',borderRadius:3}}><div style={{height:3,borderRadius:3,background:'var(--accent)',width:`${maxMc>0?(mc/maxMc)*100:0}%`}}/></div>
            </div>
          )
        })}
        {kwhPrice<=0&&(
          <p style={{marginTop:12,fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.5}}>
            Δεν έχεις δηλώσει τιμή ανά κιλοβατώρα, οπότε δείχνουμε μόνο κατανάλωση. Γράψε την τιμή του λογαριασμού σου δίπλα.
          </p>
        )}
      </div>
      {categoriesCard}
    </div>
  )
}

// Το ιστορικό παραδόσεων, με το κουμπί που το ανοίγει πάνω του.
function HandoverCard({handovers,onOpenHandover}:{handovers:InventoryHandover[];onOpenHandover:()=>void}) {
  return (
    <div style={cardStyle}>
      <SectionLabel label="Παραδόσεις και παραλαβές" right={<button onClick={onOpenHandover} style={{padding:'0 12px',height:28,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer'}}>{handovers.length>0?'Άνοιγμα':'Νέο πρωτόκολλο'}</button>}/>
      {handovers.length===0
        ?<p style={{fontSize:13,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.6}}>Καταγραφή της κατάστασης του εξοπλισμού στην είσοδο και στην έξοδο του ενοικιαστή: η απόδειξη για την εγγύηση.</p>
        :<div style={{display:'flex',flexDirection:'column',gap:6}}>
          {[...handovers].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,4).map(h=>{
            const snap=h.items_snapshot||[]; const bad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} {...pressable(onOpenHandover)} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 12px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',cursor:'pointer'}}>
                <Badge label={h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} color="var(--text-secondary)"/>
                <div style={{minWidth:0,flex:1}}>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.tenant_name}</p>
                  <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(h.handover_date)} · {snap.length} αντικείμενα</p>
                </div>
                {bad>0&&<span style={{fontSize:11,color:'var(--text-secondary)',fontFamily:T.font.sans,flexShrink:0}}>{bad} με φθορά</span>}
              </div>
            )
          })}
          {handovers.length>4&&<p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,textAlign:'center',marginTop:4}}>και {handovers.length-4} ακόμη</p>}
        </div>
      }
    </div>
  )
}


type SortKey = 'name'|'value'|'energy'|'age'|'depreciation'

function ItemsTab({items,kwhPrice,onAdd,onEdit,onDelete,onRepair,onQR,onUpdateCondition,onWarrantyReminder,onBulkDelete,onBulkRoom}:{
  items:InventoryItem[];kwhPrice:number
  onAdd:()=>void;onEdit:(i:InventoryItem)=>void;onDelete:(id:string)=>void
  onRepair:(i:InventoryItem)=>void;onQR:(i:InventoryItem)=>void
  onUpdateCondition:(id:string,c:string)=>void
  onWarrantyReminder:(i:InventoryItem)=>void
  onBulkDelete:(ids:string[])=>void;onBulkRoom:(ids:string[],room:string)=>void
}) {
  const [selectMode,setSelectMode] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const toggleSel = (id:string) => setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n})
  const exitSelect = () => {setSelectMode(false);setSelected(new Set())}
  const [filterCat,setFilterCat] = useState('Όλες')
  const [filterRoom,setFilterRoom] = useState('Όλα')
  const [search,setSearch] = useState('')
  const [viewMode,setViewMode] = useState<'grid'|'list'>('grid')
  const [sortKey,setSortKey] = useState<SortKey>('name')
  const [sortDir,setSortDir] = useState<'asc'|'desc'>('asc')
  const [showNeedsAction,setShowNeedsAction] = useState(false)
  const allRooms = [...new Set(items.map(i=>i.room).filter(Boolean))]
  const actionCount = items.filter(needsAction).length
  // ΤΟ ΚΛΕΙΔΙ ΤΑΞΙΝΟΜΗΣΗΣ ΥΠΟΛΟΓΙΖΕΤΑΙ ΜΙΑ ΦΟΡΑ ΑΝΑ ΑΝΤΙΚΕΙΜΕΝΟ, ΟΧΙ ΑΝΑ ΣΥΓΚΡΙΣΗ.
  // Πριν, ο συγκριτής καλούσε `calcCurrentValue` / `calcMonthlyCost` μέσα του,
  // δηλαδή O(n log n) φορές — και όλο αυτό ξανά σε κάθε απόδοση, άρα σε κάθε
  // πλήκτρο της αναζήτησης. Τώρα: n υπολογισμοί, μέσα σε useMemo.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const kept = items.filter(item=>{
      if(showNeedsAction&&!needsAction(item)) return false
      if(filterCat!=='Όλες'&&item.category!==filterCat) return false
      if(filterRoom!=='Όλα'&&item.room!==filterRoom) return false
      if(q&&!item.name.toLowerCase().includes(q)&&!(item.brand||'').toLowerCase().includes(q)) return false
      return true
    })
    // Το όνομα συγκρίνεται ως κείμενο, όλα τα άλλα ως αριθμοί. Δύο ξεχωριστές
    // διαδρομές, ώστε ο τύπος να μη χρειάζεται να είναι `any` για να χωρέσουν.
    const dir = sortDir==='asc' ? 1 : -1
    if(sortKey==='name') return [...kept].sort((a,b)=>dir*a.name.localeCompare(b.name))
    const num=(i:InventoryItem):number =>
      sortKey==='value'        ? calcCurrentValue(i)
    : sortKey==='energy'       ? calcMonthlyCost(i,kwhPrice)
    : sortKey==='age'          ? (i.purchase_date?new Date(i.purchase_date).getTime():0)
    :                            calcDepreciationPct(i)
    return kept
      .map(item=>({ item, key: num(item) }))
      .sort((a,b)=>dir*(a.key-b.key))
      .map(d=>d.item)
  }, [items, showNeedsAction, filterCat, filterRoom, search, sortKey, sortDir, kwhPrice])
  const itemActions = (item:InventoryItem):OverflowAction[] => [
    {label:'Επεξεργασία',icon:IconEdit,onClick:()=>onEdit(item)},
    {label:'Επισκευές και ιστορικό',icon:IconRepair,onClick:()=>onRepair(item)},
    {label:'Κωδικός QR',icon:IconQR,onClick:()=>onQR(item)},
    ...(item.warranty_expiry?[{label:'Υπενθύμιση εγγύησης',icon:IconCal,onClick:()=>onWarrantyReminder(item)}]:[]),
    // Ο διάλογος είναι ασύγχρονος και ζει σε global host, όχι μέσα στο μενού: το
    // μενού προλαβαίνει να κλείσει πριν απαντήσει ο χρήστης, αλλά η υπόσχεση δεν
    // εξαρτάται από τον κόμβο του κουμπιού, άρα η διαγραφή εκτελείται κανονικά.
    {label:'Διαγραφή',icon:IconTrash,danger:true,onClick:async()=>{ if(await confirmDialog(`Διαγραφή «${item.name}»;`,{tone:'negative'})) onDelete(item.id) }},
  ]
  const SORT_LABELS:Record<SortKey,string> = {name:'Όνομα',value:'Αξία',energy:'Ρεύμα/μήνα',age:'Ηλικία',depreciation:'Υπολειπόμενη αξία'}
  // Οι μαζικές ενέργειες δρουν ΜΟΝΟ σε ό,τι είναι επιλεγμένο ΚΑΙ ορατό στα τρέχοντα φίλτρα.
  const visIds = filtered.filter(i=>selected.has(i.id)).map(i=>i.id)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:180}}><TextInput ariaLabel="Αναζήτηση αντικειμένου" value={search} onChange={setSearch} placeholder="Αναζήτηση αντικειμένου, μάρκας…"/></div>
        <div style={{width:150}}><CustomSelect value={filterCat} onChange={setFilterCat} options={['Όλες',...[...INVENTORY_CATEGORIES].filter(c=>items.some(i=>i.category===c))].map(c=>({value:c,label:c==='Όλες'?'Όλες οι κατηγορίες':c}))}/></div>
        {allRooms.length>0&&<div style={{width:140}}><CustomSelect value={filterRoom} onChange={setFilterRoom} options={[{value:'Όλα',label:'Όλα τα δωμάτια'},...allRooms.map(r=>({value:r,label:r}))]}/></div>}
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:196}}><CustomSelect value={sortKey} onChange={v=>setSortKey(v as SortKey)} options={(Object.keys(SORT_LABELS) as SortKey[]).map(k=>({value:k,label:`Ταξινόμηση: ${SORT_LABELS[k]}`}))}/></div>
          <button title={sortDir==='asc'?'Αύξουσα':'Φθίνουσα'} aria-label="Κατεύθυνση ταξινόμησης" onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} style={{width:T.h.md,height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',cursor:'pointer',fontFamily:T.font.sans,fontSize:14,flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{sortDir==='asc'?<path d="M12 19V5M5 12l7-7 7 7"/>:<path d="M12 5v14M19 12l-7 7-7-7"/>}</svg></button>
        </div>
        {actionCount>0&&<button onClick={()=>setShowNeedsAction(v=>!v)} title="Προβολή μόνο όσων χρειάζονται προσοχή" style={{padding:'0 12px',height:T.h.md,borderRadius:T.radius.pill,fontSize:12,cursor:'pointer',fontFamily:T.font.sans,fontWeight:500,border:`1px solid ${showNeedsAction?'var(--warning-border)':'var(--border-subtle)'}`,background:showNeedsAction?'var(--warning-soft)':'var(--bg-elevated)',color:showNeedsAction?'var(--warning)':'var(--text-secondary)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
          Προσοχή <span style={{background:showNeedsAction?'var(--warning)':'var(--text-tertiary)',color:'var(--text-inverse)',borderRadius:T.radius.inner,padding:'0 6px',fontSize:10,fontWeight:700}}>{actionCount}</span>
        </button>}
        <button onClick={()=>selectMode?exitSelect():setSelectMode(true)} title="Επιλογή πολλών αντικειμένων" style={{padding:'0 12px',height:T.h.md,borderRadius:T.radius.pill,fontSize:12,cursor:'pointer',fontFamily:T.font.sans,fontWeight:500,border:`1px solid ${selectMode?'var(--accent-border)':'var(--border-subtle)'}`,background:selectMode?'var(--accent-soft)':'var(--bg-elevated)',color:selectMode?'var(--accent)':'var(--text-secondary)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          {selectMode?'Ακύρωση':'Επιλογή'}
        </button>
        <div style={{display:'flex',border:'1px solid var(--border-subtle)',borderRadius:T.radius.pill,overflow:'hidden',padding:2,background:'var(--bg-elevated)'}}>
          {(['grid','list'] as const).map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{padding:'6px 14px',fontSize:12,fontFamily:T.font.sans,cursor:'pointer',border:'none',borderRadius:T.radius.pill,background:viewMode===m?'var(--accent)':'transparent',color:viewMode===m?'var(--accent-text)':'var(--text-secondary)',fontWeight:viewMode===m?500:400,transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s'}}>{m==='grid'?'Κάρτες':'Λίστα'}</button>
          ))}
        </div>
      </div>
      {selectMode?(
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',padding:'10px 14px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.card}}>
          <SelectBox checked={filtered.length>0&&visIds.length===filtered.length} indeterminate={visIds.length>0&&visIds.length<filtered.length} onChange={()=>{const all=visIds.length===filtered.length;setSelected(all?new Set():new Set(filtered.map(i=>i.id)))}}/>
          <span style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{visIds.length} επιλεγμένα</span>
          <div style={{flex:1}}/>
          <BulkPicker label="Δωμάτιο" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M4 21V7l8-4v18M20 21V11l-8-4"/></svg>} options={ROOM_PRESETS} onPick={r=>{if(visIds.length){onBulkRoom(visIds,r);exitSelect()}}}/>
          <button onClick={async()=>{ /* Ρητό στιγμιότυπο ΠΡΙΝ την ερώτηση: ο διάλογος δεν παγώνει πια τη σελίδα, άρα φίλτρο και επιλογή μπορούν να αλλάξουν όσο περιμένουμε απάντηση. Διαγράφονται ακριβώς όσα ανακοίνωσε το μήνυμα. */
            const ids=visIds
            if(ids.length && await confirmDialog(`Διαγραφή ${ids.length} αντικειμένων;`,{tone:'negative'})){ onBulkDelete(ids); exitSelect() } }} disabled={visIds.length===0} style={{display:'inline-flex',alignItems:'center',gap:6,height:T.h.sm,padding:'0 12px',borderRadius:T.radius.pill,fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:visIds.length?'pointer':'not-allowed',border:'1px solid var(--negative-border)',background:visIds.length?'var(--negative-dim)':'var(--bg-elevated)',color:visIds.length?'var(--negative)':'var(--text-tertiary)'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
            Διαγραφή
          </button>
        </div>
      ):(
        <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',borderBottom:'1px solid var(--border-subtle)',paddingBottom:8}}>
          <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{filtered.length} {filtered.length===1?'αντικείμενο':'αντικείμενα'}</span>
        </div>
      )}
      {filtered.length===0?(
        <EmptyState
          icon={items.length===0?<PackageOpen size={20}/>:<SearchX size={20}/>}
          title={items.length===0?'Δεν έχεις καταχωρήσει αντικείμενα':'Δεν βρέθηκαν αποτελέσματα'}
          hint={items.length===0?'Πρόσθεσε το πρώτο αντικείμενο για να ξεκινήσεις.':'Δοκίμασε διαφορετικά φίλτρα ή αναζήτηση.'}
          action={items.length===0?<Btn variant="primary" onClick={onAdd}>Νέο αντικείμενο</Btn>:undefined}
        />
      ):viewMode==='grid'?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14}}>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item); const left=calcYearsLeft(item)
            const mc=calcMonthlyCost(item,kwhPrice)
            const photos=(item.photos||[]).filter(Boolean); const displayPhoto=item.photo_url||(photos[0]||'')
            const ws=item.warranty_expiry?warrantyStatus(item.warranty_expiry):null
            const repl=replacementSuggestion(item)
            const sel=selected.has(item.id)
            return (
              <div key={item.id} {...pressable(()=>selectMode?toggleSel(item.id):onEdit(item))} style={{background:'var(--bg-surface)',border:`1px solid ${sel?'var(--accent)':'var(--border-subtle)'}`,boxShadow:sel?'0 0 0 1px var(--accent)':'none',borderRadius:T.radius.card,overflow:'hidden',display:'flex',flexDirection:'column',transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s',cursor:'pointer'}}
                onMouseEnter={e=>{if(sel)return;(e.currentTarget as HTMLDivElement).style.boxShadow='var(--shadow-md)';(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-default)'}}
                onMouseLeave={e=>{if(sel)return;(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-subtle)'}}
              >
                <div style={{height:118,background:'var(--bg-elevated)',position:'relative',overflow:'hidden',flexShrink:0}}>
                  {displayPhoto
                    ?<img src={displayPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                    :<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',opacity:0.18}}>
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                    </div>
                  }
                  {selectMode
                    ?<div style={{position:'absolute',top:8,left:8,background:'rgba(0,0,0,0.35)',borderRadius:8,padding:3,backdropFilter:'blur(4px)'}} onClick={e=>e.stopPropagation()}><SelectBox checked={sel} onChange={()=>toggleSel(item.id)} size={20}/></div>
                    :<>
                      <div style={{position:'absolute',top:8,left:8}} onClick={e=>e.stopPropagation()}>
                        <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                      </div>
                      <div style={{position:'absolute',top:8,right:8}}>
                        <OverflowMenu dark actions={itemActions(item)}/>
                      </div>
                    </>}
                  {(item.energy_class||photos.length>1)&&<div style={{position:'absolute',bottom:8,left:8,display:'flex',gap:4,alignItems:'center'}}>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                    {photos.length>1&&<span style={{padding:'2px 6px',borderRadius:6,background:'rgba(0,0,0,0.6)',color:'var(--on-media)',fontSize:9,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>+{photos.length-1}</span>}
                  </div>}
                </div>
                <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                    <div style={{minWidth:0}}>
                      <p style={{fontSize:14,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
                      <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category}{item.room?` · ${item.room}`:''}</p>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',lineHeight:1.2}}>{fe(curVal)}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>Τρέχουσα αξία</p>
                    </div>
                  </div>
                  <DepBar pct={depPct} left={left}/>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,minHeight:15}}>
                    <div style={{minWidth:0,overflow:'hidden'}}>
                      {repl.suggested
                        ?<ReplacementHint item={item} compact/>
                        :ws&&<span style={{fontSize:10,color:ws.color,fontFamily:T.font.sans,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Εγγύηση {ws.label}</span>}
                    </div>
                    {mc>0&&<span title="Εκτιμώμενο κόστος ρεύματος ανά μήνα" style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',flexShrink:0}}>{fe(mc)}/μήνα</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ):(
        <div style={{overflowX:'auto',margin:'0 -4px',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',flexDirection:'column',gap:1,background:'var(--bg-surface)',borderRadius:T.radius.card,border:'1px solid var(--border-subtle)',overflow:'hidden',minWidth:560}}>
          <div style={{display:'grid',gridTemplateColumns:`${selectMode?'32px ':''}minmax(0,2fr) 130px 96px 90px 44px`,gap:10,padding:'10px 16px',borderBottom:'2px solid var(--border-subtle)',background:'var(--bg-elevated)'}}>
            {selectMode&&<div/>}
            {['Αντικείμενο','Κατάσταση','Αξία','Ρεύμα/μήνα',''].map(h=><p key={h} style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans}}>{h}</p>)}
          </div>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const mc=calcMonthlyCost(item,kwhPrice); const age=calcAgeDisplay(item.purchase_date)
            const sel=selected.has(item.id)
            return (
              <div key={item.id} {...pressable(()=>selectMode?toggleSel(item.id):onEdit(item))} style={{display:'grid',gridTemplateColumns:`${selectMode?'32px ':''}minmax(0,2fr) 130px 96px 90px 44px`,gap:10,padding:'11px 16px',background:sel?'var(--accent-soft)':'var(--bg-surface)',borderBottom:'1px solid var(--border-subtle)',alignItems:'center',transition:'background 0.15s',cursor:'pointer'}}
                onMouseEnter={e=>{if(!sel)(e.currentTarget as HTMLDivElement).style.background='var(--bg-elevated)'}}
                onMouseLeave={e=>{if(!sel)(e.currentTarget as HTMLDivElement).style.background='var(--bg-surface)'}}
              >
                {selectMode&&<div onClick={e=>e.stopPropagation()}><SelectBox checked={sel} onChange={()=>toggleSel(item.id)}/></div>}
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                  </div>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans,margin:'2px 0 4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category}{item.room?` · ${item.room}`:''}{age?` · ${age}`:''}</p>
                  <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
                  {replacementSuggestion(item).suggested&&<div style={{marginTop:4}}><ReplacementHint item={item} compact/></div>}
                </div>
                <div onClick={e=>e.stopPropagation()}><InlineConditionEdit item={item} onUpdate={onUpdateCondition}/></div>
                <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fe(curVal)}</p>
                <div>{mc>0&&<p style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fe(mc)}</p>}</div>
                <div style={{display:'flex',justifyContent:'flex-end'}}><OverflowMenu actions={itemActions(item)}/></div>
              </div>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}

// ΟΙ ΕΓΓΥΗΣΕΙΣ ΔΕΝ ΕΧΟΥΝ ΔΙΚΗ ΤΟΥΣ ΕΝΟΤΗΤΑ ΠΙΑ.
// Ήταν λίστα με τρία υπο-τμήματα: «λήγουν σε 90 ημέρες», «έχουν λήξει», «σε
// ισχύ». Δηλαδή η ίδια λίστα αντικειμένων, τρεις φορές, φιλτραρισμένη με
// ημερομηνία — δίπλα στη λίστα αντικειμένων που ήδη δείχνει την εγγύηση ως σήμα
// σε κάθε κάρτα. Ό,τι είχε αξία κρατήθηκε και μπήκε εκεί που ανήκει:
//   · «λήγει σύντομα» → μία γραμμή στο «Χρειάζονται προσοχή», με το κουμπί που
//     βάζει την υπενθύμιση στο ημερολόγιο·
//   · η απόδειξη → στο μενού του κάθε αντικειμένου, δίπλα στην επεξεργασία·
//   · «σε ισχύ» → δεν είναι εργασία, είναι κατάσταση, και τη λέει η κάρτα.

// Πλέγμα με περιγράμματα και θέσεις υπογραφής: ένα πρωτόκολλο παράδοσης είναι
// έντυπο που συμπληρώνεται και υπογράφεται, όχι λογιστική κατάσταση.
const HANDOVER_CSS = `
  table.grid{margin-top:18px}
  table.grid th{background:${PAPER_ALT};padding:8px;border:1px solid ${RULE};font-size:9px}
  table.grid td{padding:8px;border:1px solid ${RULE};color:${INK_MUTED};font-size:12px}
  .shot{width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid ${RULE}}
  .shot-at{font-size:9px;color:${INK_FAINT}}
  .sig{margin-top:48px;display:flex;gap:60px;break-inside:avoid}
  .sig-box{flex:1;border-top:2px solid ${INK};padding-top:8px;font-size:11px;color:${INK_MUTED}}
`

// Πλέγμα καρτών με φωτογραφία: η έκθεση προς τον ασφαλιστή είναι φωτογραφική
// τεκμηρίωση, όχι πίνακας. Οι τρεις μετρικές από πάνω χρησιμοποιούν το κοινό
// `.kpis`/`.kpi`, οπότε δεν ξαναγράφονται εδώ.
const INSURANCE_CSS = `
  .kpis{grid-template-columns:repeat(3,1fr)}
  .cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:22px}
  .c{border:1px solid ${RULE};border-radius:10px;overflow:hidden;display:flex;break-inside:avoid}
  .ph{width:120px;flex-shrink:0;background:${PAPER_ALT}}
  .ph img{width:120px;height:100%;min-height:120px;object-fit:cover;display:block}
  .noph{width:120px;height:120px;display:flex;align-items:center;justify-content:center;color:${INK_FAINT};font-size:10px;text-align:center}
  .cb{padding:10px 12px;flex:1;min-width:0}
  .nm{font-size:13px;font-weight:600;color:${INK};margin-bottom:2px}
  .mt{font-size:10px;color:${INK_MUTED};margin-bottom:6px}
  .sn{font-size:9px;color:${INK_MUTED};font-family:'Roboto Mono',monospace;margin-bottom:6px}
  .crow{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-top:1px solid ${RULE};color:${INK_MUTED}}
  .crow span:last-child{font-variant-numeric:tabular-nums;font-weight:600;color:${INK}}
`

function HandoverTab({items,handovers,propertyId,userId,onSaved,seed}:{items:InventoryItem[];handovers:InventoryHandover[];propertyId:string;userId:string;onSaved:()=>void;seed?:(HandoverIntent&{n:number})|null}) {
  const [mode,setMode] = useState<'list'|'new'|'compare'>('list')
  const [type,setType] = useState<'check_in'|'check_out'>('check_in')
  const [tenantName,setTenantName] = useState(''); const [tenantPhone,setTenantPhone] = useState('')
  const [handoverDate,setHandoverDate] = useState(''); const [notes,setNotes] = useState('')
  const nameId = useId(); const phoneId = useId(); const notesId = useId()
  const [itemConds,setItemConds] = useState<Record<string,{condition:string;notes:string;photo?:string}>>({})
  const [saving,setSaving] = useState(false)
  const [uploadingId,setUploadingId] = useState<string|null>(null)
  const [cmpA,setCmpA] = useState(''); const [cmpB,setCmpB] = useState('')
  const [fromTenant,setFromTenant] = useState('')
  const uploadCondPhoto = async(itemId:string,file:File) => {
    setUploadingId(itemId)
    const {path,error}=await uploadUserScoped(supabase,'inventory-photos',uploadPath(file.name,'handover'),file,{upsert:true})
    if(error){notifyError(failed(MSG.upload));setUploadingId(null);return}
    const {data}=supabase.storage.from('inventory-photos').getPublicUrl(path)
    setItemConds(p=>({...p,[itemId]:{...p[itemId],photo:data.publicUrl}}))
    setUploadingId(null)
  }
  // Reset ΜΟΝΟ όταν μπαίνουμε σε νέο πρωτόκολλο (αλλαγή mode), όχι σε κάθε refetch των items.
  useEffect(()=>{
    if(mode==='new'){const init:Record<string,{condition:string;notes:string;photo?:string}>={};items.forEach(i=>{init[i.id]={condition:i.condition,notes:''}});setItemConds(init)}
    if(mode==='list')setFromTenant('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode])
  // Αν αλλάξουν τα items ενώ συμπληρώνουμε, πρόσθεσε μόνο τα νέα — διατήρησε κατάσταση/σημειώσεις/φωτο σε εξέλιξη.
  useEffect(()=>{
    if(mode!=='new') return
    setItemConds(prev=>{const next={...prev};items.forEach(i=>{if(!next[i.id])next[i.id]={condition:i.condition,notes:''}});return next})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[items])
  // Prefill από deep-link (καρτέλα ενοικιαστή): άνοιξε νέο πρωτόκολλο με το όνομα/τηλέφωνο/τύπο έτοιμα.
  useEffect(()=>{
    if(seed){
      setMode('new')
      if(seed.tenantName){setTenantName(seed.tenantName);setFromTenant(seed.tenantName)}
      if(seed.tenantPhone)setTenantPhone(seed.tenantPhone)
      if(seed.type)setType(seed.type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[seed?.n])
  const handleSave = async() => {
    if(!tenantName.trim()){notifyError('Το ονοματεπώνυμο είναι υποχρεωτικό.');return}
    setSaving(true)
    const nowIso=new Date().toISOString()
    const snap = items.map(i=>({item_id:i.id,name:i.name,category:i.category,condition_at_handover:itemConds[i.id]?.condition||i.condition,condition_notes:itemConds[i.id]?.notes||'',photo_url:i.photo_url||'',condition_photo:itemConds[i.id]?.photo||'',captured_at:itemConds[i.id]?.photo?nowIso:''}))
    const {error} = await supabase.from('inventory_handovers').insert({property_id:propertyId,user_id:userId,handover_type:type,tenant_name:tenantName,tenant_phone:tenantPhone,handover_date:handoverDate||athensToday(),notes,items_snapshot:snap})
    if(error){notifyError(failed('Το πρωτόκολλο δεν αποθηκεύτηκε',error));setSaving(false);return}
    setMode('list');onSaved();setSaving(false)
  }
  // ΤΟ ΠΡΩΤΟΚΟΛΛΟ ΕΙΝΑΙ ΕΝΤΥΠΟ ΠΟΥ ΥΠΟΓΡΑΦΕΤΑΙ, άρα κρατά πλέγμα με περιγράμματα
  // αντί για το ύφος λογιστικής κατάστασης — αυτό είναι πραγματική διαφορά
  // εγγράφου. Ό,τι ΔΕΝ ήταν διαφορά έφυγε: η χειρόγραφη επικεφαλίδα, η
  // διακοσμητική έγχρωμη λωρίδα στην κορυφή, ένα ακόμη γκρι (#6b7280), και το
  // κουμπί «Εκτύπωση» μέσα στη σελίδα — τα άλλα οκτώ έγγραφα τυπώνονται μόνα
  // τους, αυτό περίμενε κλικ σε ένα κουμπί που το ίδιο του το CSS έκρυβε στην
  // εκτύπωση.
  const printHandover = (h:InventoryHandover) => {
    const snap=h.items_snapshot||[]
    const html = reportHead('Πρωτόκολλο παράδοσης και παραλαβής', HANDOVER_CSS)
      + `<body><div class="page">`
      + reportHeader(null, `Πρωτόκολλο ${h.handover_type==='check_in'?'παράδοσης':'παραλαβής'}`, {
          rightLabel: 'Ημερομηνία', rightValue: rDate(h.handover_date),
        })
      + `
    <h1>${rEsc(h.tenant_name)}</h1>
    <div class="sub">${[h.tenant_phone, fmtDate(h.handover_date)].filter(Boolean).map(x=>rEsc(String(x))).join(' · ')}</div>
    <table class="grid"><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κατάσταση</th><th>Παρατηρήσεις</th><th>Φωτογραφία κατάστασης</th></tr></thead><tbody>
    ${snap.map(s=>`<tr><td>${rEsc(s.name)}</td><td>${rEsc(s.category)}</td><td>${rEsc(s.condition_at_handover)}</td><td>${rEsc(s.condition_notes||ABSENT)}</td><td>${s.condition_photo?`<img src="${rEsc(s.condition_photo)}" class="shot"/>${s.captured_at?`<br><span class="shot-at">${rEsc(fmtDate(s.captured_at))}</span>`:''}`:rEsc(ABSENT)}</td></tr>`).join('')}
    </tbody></table>
    <div class="sig"><div class="sig-box">Υπογραφή ιδιοκτήτη</div><div class="sig-box">Υπογραφή ενοικιαστή</div><div class="sig-box">Ημερομηνία</div></div>
    ${reportDisclaimer('Πρωτόκολλο παράδοσης και παραλαβής εξοπλισμού. Ισχύει με τις υπογραφές και των δύο μερών.')}
    </div></body></html>`
    openReport(html)
  }
  if(mode==='compare') {
    const hA=handovers.find(h=>h.id===cmpA); const hB=handovers.find(h=>h.id===cmpB)
    const condOrder=['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
    const allNames=[...new Set([...(hA?.items_snapshot||[]).map(s=>s.name),...(hB?.items_snapshot||[]).map(s=>s.name)])]
    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Σύγκριση πρωτοκόλλων</p>
          <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
        </div>
        <div style={{...formGrid(200, 270),gap:12}}>
          {[{v:cmpA,sv:setCmpA},{v:cmpB,sv:setCmpB}].map(({v,sv},i)=>(
            <div key={i}>
              <label style={labelStyle}>Πρωτόκολλο {i===0?'Α':'Β'}</label>
              <CustomSelect value={v} onChange={sv} options={[{value:'',label:'Επιλογή πρωτοκόλλου'},...handovers.filter(h=>i===0||h.id!==cmpA).map(h=>({value:h.id,label:`${h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${h.tenant_name} · ${fmtDate(h.handover_date)}`}))]}/>
            </div>
          ))}
        </div>
        {hA&&hB&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'8px 14px',borderBottom:'2px solid var(--border-subtle)'}}>
              {['Αντικείμενο',`${hA.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${hA.tenant_name}`,`${hB.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${hB.tenant_name}`].map(h=><p key={h} style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans}}>{h}</p>)}
            </div>
            {allNames.map(name=>{
              const sA=hA.items_snapshot?.find(s=>s.name===name); const sB=hB.items_snapshot?.find(s=>s.name===name)
              const cA=sA?.condition_at_handover||null; const cB=sB?.condition_at_handover||null
              const degraded=cA!==cB&&cA!=null&&cB!=null&&condOrder.indexOf(cB)>condOrder.indexOf(cA)
              return (
                <div key={name} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'10px 14px',background:degraded?'var(--negative-dim)':'var(--bg-elevated)',borderRadius:8,marginBottom:4,border:`1px solid ${degraded?'var(--negative-border)':'var(--border-subtle)'}`}}>
                  <p style={{fontSize:12,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{name}{degraded&&<span title="Υποβαθμισμένη κατάσταση" style={{display:'inline-flex',color:'var(--negative)',marginLeft:6,verticalAlign:'middle'}}><svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></span>}</p>
                  <div>{cA!=null?<Badge label={cA} color={CONDITION_COLOR[cA]||'var(--text-tertiary)'}/>:<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Δεν υπήρχε</span>}</div>
                  <div>{cB!=null?<Badge label={cB} color={CONDITION_COLOR[cB]||'var(--text-tertiary)'}/>:<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Δεν υπήρχε</span>}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
  if(mode==='new') return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <style>{`@keyframes invSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Νέο πρωτόκολλο παράδοσης</p>
        <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
      </div>
      {fromTenant&&(
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.inner}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Προσυμπληρώθηκε από την καρτέλα ενοικιαστή για <strong style={{color:'var(--text-primary)'}}>{fromTenant}</strong>. Έλεγξε την κατάσταση κάθε αντικειμένου πριν αποθηκεύσεις.</p>
        </div>
      )}
      <div style={{...formGrid(200, 270),gap:10}}>
        {(['check_in','check_out'] as const).map(t=>(
          <button key={t} onClick={()=>setType(t)} style={{padding:'14px',borderRadius:T.radius.card,cursor:'pointer',fontWeight:500,fontFamily:T.font.sans,fontSize:13,border:`1px solid ${type===t?'var(--accent)':'var(--border-subtle)'}`,background:type===t?'var(--accent)':'var(--bg-elevated)',color:type===t?'var(--accent-text)':'var(--text-secondary)',transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s'}}>
            {t==='check_in'?'Είσοδος ενοικιαστή':'Έξοδος ενοικιαστή'}
          </button>
        ))}
      </div>
      <div style={fieldRow(180, 12)}>
        <div><label htmlFor={nameId} style={labelStyle}>Ονοματεπώνυμο *</label><TextInput id={nameId} value={tenantName} onChange={setTenantName} placeholder="Παράδειγμα: Ιωάννης Παπαδόπουλος"/></div>
        <div><label htmlFor={phoneId} style={labelStyle}>Τηλέφωνο</label><TextInput id={phoneId} value={tenantPhone} onChange={setTenantPhone} placeholder="6912345678"/></div>
        <div><label style={labelStyle}>Ημερομηνία</label><DatePicker value={handoverDate} onChange={setHandoverDate}/></div>
        <div><label htmlFor={notesId} style={labelStyle}>Σημειώσεις</label><TextInput id={notesId} value={notes} onChange={setNotes} placeholder="Γενικές παρατηρήσεις…"/></div>
      </div>
      <div>
        <SectionLabel label="Κατάσταση αντικειμένων" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{items.length} αντικείμενα</span>}/>
        <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,margin:'-4px 0 10px',lineHeight:1.5}}>Πάτησε τη μικρογραφία για να τραβήξεις <strong style={{color:'var(--text-secondary)'}}>φωτογραφία της τρέχουσας κατάστασης</strong>, χρονοσφραγίζεται και μπαίνει στο εκτυπώσιμο πρωτόκολλο ως απόδειξη.</p>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {items.map(item=>(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'44px minmax(0,1.4fr) 150px minmax(0,1.6fr)',gap:14,alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
              {(()=>{const cp=itemConds[item.id]?.photo;const busy=uploadingId===item.id;return (
                <label title={cp?'Φωτογραφία κατάστασης (πάτησε για αλλαγή)':'Τράβα φωτογραφία της τρέχουσας κατάστασης'} style={{position:'relative',width:44,height:44,borderRadius:10,overflow:'hidden',flexShrink:0,cursor:'pointer',display:'block',border:cp?'2px solid var(--accent)':'1px solid var(--border-subtle)'}}>
                  {cp
                    ?<img src={cp} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                    :item.photo_url
                      ?<img src={item.photo_url} style={{width:'100%',height:'100%',objectFit:'cover',opacity:0.5}} alt=""/>
                      :<div style={{width:'100%',height:'100%',background:'var(--accent-soft)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg></div>}
                  <span style={{position:'absolute',right:2,bottom:2,width:16,height:16,borderRadius:6,background:cp?'var(--accent)':'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {busy?<span style={{width:9,height:9,border:`1.5px solid ${cp?'var(--accent-text)':'#fff'}`,borderTopColor:'transparent',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={cp?'var(--accent-text)':'#fff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>}
                  </span>
                  <input type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadCondPhoto(item.id,f)}}/>
                </label>
              )})()}
              <div style={{minWidth:0}}>
                <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
                <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category}{item.room?` · ${item.room}`:''}</p>
              </div>
              <CustomSelect ariaLabel={`Κατάσταση: ${item.name}`} value={itemConds[item.id]?.condition||item.condition} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],condition:v}}))} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
              <TextInput ariaLabel={`Παρατηρήσεις: ${item.name}`} value={itemConds[item.id]?.notes||''} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],notes:v}}))} placeholder="Παράδειγμα: μικρή γρατζουνιά στην πόρτα"/>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
        <button onClick={()=>setMode('list')} style={{padding:'0 20px',height:T.h.lg,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
        <button onClick={handleSave} disabled={saving} style={{padding:'0 24px',height:T.h.lg,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer'}}>
          {saving?'Αποθήκευση…':'Αποθήκευση Πρωτοκόλλου'}
        </button>
      </div>
    </div>
  )
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:16,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Πρωτόκολλα παράδοσης</p>
          <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,marginTop:2,maxWidth:560,lineHeight:1.5}}>Καταγράφει την κατάσταση κάθε αντικειμένου κατά την είσοδο & έξοδο του ενοικιαστή, απόδειξη για την επιστροφή της εγγύησης σε περίπτωση φθορών.</p>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0}}>
          {handovers.length>=2&&<button onClick={()=>setMode('compare')} style={{padding:'0 14px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer'}}>Σύγκριση εισόδου/εξόδου</button>}
          {handovers.length>0&&<button onClick={()=>setMode('new')} style={{padding:'0 18px',height:T.h.md,borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>Νέο πρωτόκολλο</button>}
        </div>
      </div>
      {handovers.length===0
        ?/* ΧΩΡΙΣ ΚΑΡΤΑ ΓΥΡΩ ΑΠΟ ΤΟ ΤΙΠΟΤΑ. Δύο από τις σαράντα πέντε κενές
           καταστάσεις της εφαρμογής τυλίγονταν σε κάρτα, οι σαράντα τρεις όχι:
           ο χρήστης έβλεπε την ίδια κατάσταση με δύο διαφορετικά βάρη ανάλογα
           με την καρτέλα. Ένα περίγραμμα γύρω από την απουσία της δίνει σώμα
           που δεν έχει. */
        <EmptyState icon={<ClipboardCheck size={20}/>} title="Κανένα πρωτόκολλο ακόμη" hint="Στην είσοδο ενός ενοικιαστή κατέγραψε την κατάσταση κάθε αντικειμένου· στην έξοδο συγκρίνεις και τεκμηριώνεις φθορές." action={<Btn variant="primary" onClick={()=>setMode('new')}>Νέο πρωτόκολλο</Btn>} />
        :<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {handovers.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map(h=>{
            const snap=h.items_snapshot||[]; const bad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:bad>0?12:0}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <Badge label={h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} color="var(--text-secondary)"/>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{h.tenant_name}</p>
                    </div>
                    <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(h.handover_date)}{h.tenant_phone?` · ${h.tenant_phone}`:''} · {snap.length} αντικείμενα{(()=>{const ph=snap.filter(s=>s.condition_photo).length;return ph>0?` · ${ph} φωτό`:''})()}</p>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {bad>0&&<Badge label={`${bad} προβλήματα`} color="var(--negative)"/>}
                    <button onClick={()=>printHandover(h)} style={{padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--accent)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer',fontWeight:500}}>Εκτύπωση</button>
                  </div>
                </div>
                {bad>0&&(
                  <div style={{padding:'8px 12px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>
                    {snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').map((s,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)',fontFamily:T.font.sans,padding:'2px 0'}}>
                        <span>{s.name}</span><span style={{color:'var(--negative)'}}>{s.condition_at_handover}{s.condition_notes?`, ${s.condition_notes}`:''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      }
    </div>
  )
}

function MaintenanceTab({items,schedules,propertyId,userId,onSaved}:{items:InventoryItem[];schedules:MaintenanceSchedule[];propertyId:string;userId:string;onSaved:()=>void}) {
  const [adding,setAdding] = useState(false)
  const [form,setForm] = useState({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:'',est_cost:0})
  const intervalId = useId(); const estCostId = useId(); const taskId = useId(); const mNotesId = useId()
  const [saving,setSaving] = useState(false)
  const [doneBusy,setDoneBusy] = useState<string|null>(null)
  // Και εδώ το `embedded` ήταν πάντα αληθές, άρα το πλέγμα των τριών μετρικών
  // που κρεμόταν από το `!embedded` δεν αποδόθηκε ποτέ. Έλεγε ούτως ή άλλως τα
  // ίδια τρία νούμερα με τα σήματα των τριών ενοτήτων ακριβώς από κάτω.
  const today=()=>athensToday()
  const taskTitle=(task:string,item_name:string)=>`Συντήρηση: ${task}${item_name?`, ${item_name}`:''}`
  // Το «κύκλωμα»: μια προγραμματισμένη εργασία → εγγραφή ημερολογίου (υπενθύμιση/εκκρεμότητα)
  // + προγραμματισμένη (εκκρεμής) δαπάνη → τροφοδοτεί προϋπολογισμό «Συντήρηση» & «Εκκρεμείς πληρωμές».
  // Οι δύο δημιουργοί του κυκλώματος επιστρέφουν πλέον ΚΑΙ το σφάλμα τους: ένα
  // ραντεβού συντήρησης που δεν μπήκε στο ημερολόγιο, ή μια προγραμματισμένη
  // δαπάνη που δεν μπήκε στον προϋπολογισμό, είναι ακριβώς η υπόσχεση που δίνει
  // το πλαίσιο πάνω από το κουμπί αποθήκευσης. Σιωπηλή αποτυχία εκεί σημαίνει ότι
  // ο χρήστης βασίζεται σε υπενθύμιση που δεν υπάρχει.
  const makeCalEvent=async(task:string,item_name:string,due:string,est:number):Promise<string|undefined>=>{
    const {data,error}=await calendar.add(supabase,{propertyId,userId},'inventory-maint',{title:taskTitle(task,item_name),category:'maintenance',event_date:due,amount:est||0,notes:est>0?`Αυτόματο από Συντήρηση Απογραφής · εκτιμώμενο κόστος ${fe(est)}`:'Αυτόματο από Συντήρηση Απογραφής'})
    if(error){notifyError(failed('Η υπενθύμιση δεν μπήκε στο ημερολόγιο',error));return undefined}
    return data?.id
  }
  const makePlannedExpense=async(task:string,item_name:string,due:string,est:number):Promise<string|undefined>=>{
    if(!(est>0)) return undefined
    const {data,error}=await expenses.add(supabase,{propertyId,userId},{description:taskTitle(task,item_name),amount:est,category:'Συντήρηση & Επισκευές',date:due,notes:'Προγραμματισμένη δαπάνη συντήρησης (εκκρεμεί)'})
    if(error){notifyError(failed('Η προγραμματισμένη δαπάνη δεν καταχωρήθηκε',error));return undefined}
    return data?.id
  }
  const markDone=async(s:MaintenanceSchedule)=>{
    if(doneBusy) return
    setDoneBusy(s.id)
    const t=today(); const newDue=addMonths(t,s.interval_months); const est=s.est_cost||0
    // Η προγραμματισμένη δαπάνη γίνεται πραγματοποιημένη (πληρωμένη)· αν δεν υπήρχε, καταγράφεται τώρα.
    if(s.expense_id) await expenses.update(supabase,s.expense_id,{paid:true,date:t})
    else if(est>0) await expenses.insert(supabase,[expenses.row({propertyId,userId},{description:taskTitle(s.task,s.item_name),amount:est,category:'Συντήρηση & Επισκευές',date:t,paid:true,notes:'Πραγματοποιημένη συντήρηση'})])
    if(s.calendar_event_id) await calendar.update(supabase,s.calendar_event_id,{status:'paid'})
    // Ρολάρισμα + νέο κύκλωμα για την επόμενη φορά.
    const calId=await makeCalEvent(s.task,s.item_name,newDue,est)
    const expId=await makePlannedExpense(s.task,s.item_name,newDue,est)
    const {error}=await supabase.from('inventory_maintenance').update({last_done:t,next_due:newDue,calendar_event_id:calId||null,expense_id:expId||null}).eq('id',s.id)
    setDoneBusy(null)
    // Αν αυτό αποτύχει, η εργασία μένει στην ίδια ημερομηνία και ο χρήστης βλέπει
    // το κουμπί «Έγινε» να μην κάνει τίποτα. Χωρίς μήνυμα, το ξαναπατάει.
    if(error){notifyError(failed('Η εκτέλεση δεν καταγράφηκε',error));return}
    onSaved()
  }
  const deleteSched=async(s:MaintenanceSchedule)=>{
    if(s.calendar_event_id) await calendar.remove(supabase,s.calendar_event_id)
    if(s.expense_id) await expenses.removeIfUnpaid(supabase,s.expense_id)
    const {error}=await supabase.from('inventory_maintenance').delete().eq('id',s.id)
    if(error){notifyError(failed('Η εργασία δεν διαγράφηκε',error));return}
    onSaved()
  }
  // «Προτεινόμενη εργασία» → ανοίγει την επεξεργάσιμη φόρμα προ-συμπληρωμένη (διάστημα/αντικείμενο/κόστος),
  // ώστε ο χρήστης να την προσαρμόσει και μετά να μπει στο κύκλωμα (ημερολόγιο/εκκρεμότητες/δαπάνες).
  const addSuggested=(s:{task:string;interval_months:number;category:string})=>{
    const match=items.find(i=>i.category===s.category)
    setForm({item_id:match?.id||'',item_name:match?.name||'',task:s.task,interval_months:s.interval_months,last_done:'',notes:'',est_cost:0})
    setAdding(true)
  }
  const handleSave=async()=>{
    if(!form.task.trim()){notifyError('Η εργασία είναι υποχρεωτική.');return}
    setSaving(true)
    const base=form.last_done||today(); const nextDue=addMonths(base,form.interval_months); const est=form.est_cost||0
    const {data:sched,error:schedErr}=await supabase.from('inventory_maintenance').insert({property_id:propertyId,user_id:userId,item_id:form.item_id||'',item_name:form.item_name,task:form.task,interval_months:form.interval_months,last_done:form.last_done,next_due:nextDue,notes:form.notes,est_cost:est}).select('id').single()
    // Αν αποτύχει η εγγραφή (π.χ. δεν έχει τρέξει η migration), μην δημιουργήσεις ορφανές εγγραφές στο κύκλωμα.
    if(schedErr){notifyError(failed('Η συντήρηση δεν προγραμματίστηκε',schedErr));setSaving(false);return}
    // Αν έχει ήδη γίνει (δηλωμένη τελευταία εκτέλεση) κατέγραψε πληρωμένη δαπάνη για το ιστορικό.
    if(form.last_done&&est>0) await saved('Η πραγματοποιημένη συντήρηση δεν καταγράφηκε στις δαπάνες',expenses.insert(supabase,[expenses.row({propertyId,userId},{description:taskTitle(form.task,form.item_name),amount:est,category:'Συντήρηση & Επισκευές',date:form.last_done,paid:true,notes:'Πραγματοποιημένη συντήρηση'})]))
    // Κύκλωμα για την επόμενη προγραμματισμένη εκτέλεση.
    const calId=await makeCalEvent(form.task,form.item_name,nextDue,est)
    const expId=await makePlannedExpense(form.task,form.item_name,nextDue,est)
    const sid=(sched as {id?:string}|null)?.id
    if(sid&&(calId||expId)) await saved(MSG.calendarLink,supabase.from('inventory_maintenance').update({calendar_event_id:calId||null,expense_id:expId||null}).eq('id',sid))
    setAdding(false);setForm({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:'',est_cost:0});setSaving(false);onSaved()
  }
  const SchedRow=({s}:{s:MaintenanceSchedule})=>{
    const days=daysUntil(s.next_due); const c=days<0?'var(--negative)':days<=30?'var(--warning)':'var(--positive)'
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
        <div>
          <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{s.task}</p>
          <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{s.item_name||'Γενική'} · κάθε {s.interval_months} μήνες{(s.est_cost||0)>0?` · περίπου ${fe(s.est_cost||0)}`:''}{s.last_done?` · τελευταία ${fmtDate(s.last_done)}`:''}</p>
        </div>
        <Badge label={days<0?`${Math.abs(days)===1?'1 ημέρα':`${Math.abs(days)} ημέρες`} καθυστέρηση`:days===0?'Σήμερα':days===1?'Αύριο':`σε ${days} ημέρες`} color={c}/>
        <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtDate(s.next_due)}</span>
        <button onClick={()=>markDone(s)} disabled={doneBusy===s.id} title="Καταγράφει την εκτέλεση, ρολάρει στην επόμενη ημερομηνία και ενημερώνει δαπάνες/ημερολόγιο" style={{padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:doneBusy===s.id?'var(--text-tertiary)':'var(--text-secondary)',fontSize:11,fontFamily:T.font.sans,cursor:doneBusy===s.id?'wait':'pointer',fontWeight:500,whiteSpace:'nowrap'}}>{doneBusy===s.id?'…':'Έγινε'}</button>
        <OverflowMenu actions={[
          {label:'Διαγραφή',icon:IconTrash,danger:true,onClick:async()=>{ if(await confirmDialog('Διαγραφή; Θα αφαιρεθεί και η προγραμματισμένη υπενθύμιση/δαπάνη.',{tone:'negative'})) await deleteSched(s) }},
        ]}/>
      </div>
    )
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* ΟΙ ΠΡΟΤΕΙΝΟΜΕΝΕΣ ΕΡΓΑΣΙΕΣ ΕΓΙΝΑΝ ΜΕΝΟΥ.
          Ήταν πλέγμα έξι καρτών με έξι κουμπιά «Προσθήκη», που καταλάμβανε μισή
          οθόνη και εμφανιζόταν ΜΟΝΟ όταν δεν υπήρχε καμία εργασία — δηλαδή
          εξαφανιζόταν ακριβώς τη στιγμή που ο χρήστης μάθαινε ότι υπάρχει. Τώρα
          είναι ένα μενού που ζει πάντα δίπλα στον τίτλο. */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <SectionLabel label="Συντήρηση" right={schedules.length>0?<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{schedules.length} {schedules.length===1?'εργασία':'εργασίες'}</span>:undefined}/>
        {!adding&&<ActionMenu label="Νέα εργασία" items={[
          ...DEFAULT_MAINTENANCE.map((sug,i)=>({
            key:`sug${i}`, label:sug.task,
            description:`κάθε ${sug.interval_months} μήνες · ${sug.category}`,
            onClick:()=>addSuggested(sug),
          })),
          {key:'own', label:'Δική μου εργασία', description:'Ορίζεις εσύ τι, κάθε πότε και με τι κόστος.', onClick:()=>setAdding(true)},
        ]}/>}
      </div>
      {adding&&(
        <div style={{...cardStyle,border:'1px solid var(--border-accent)'}}>
          <SectionLabel label="Νέα εργασία συντήρησης"/>
          <div style={{...formGrid(200, 270),gap:12}}>
            <div style={{gridColumn:'1/-1'}}><label htmlFor={taskId} style={labelStyle}>Εργασία *</label><TextInput id={taskId} value={form.task} onChange={v=>setForm(f=>({...f,task:v}))} placeholder="Παράδειγμα: Ετήσιος έλεγχος λέβητα"/></div>
            <div><label style={labelStyle}>Αντικείμενο</label><CustomSelect value={form.item_id} onChange={v=>{const it=items.find(i=>i.id===v);setForm(f=>({...f,item_id:v,item_name:it?.name||''}))}} options={[{value:'',label:'Γενική εργασία'},...items.map(i=>({value:i.id,label:i.name}))]}/></div>
            <div><label htmlFor={intervalId} style={labelStyle}>Επανάληψη κάθε</label><NumberInput id={intervalId} value={String(form.interval_months)} onChange={v=>setForm(f=>({...f,interval_months:parseInt(v)||1}))} suffix="μήνες" min={1} max={60}/></div>
            <div><label style={labelStyle}>Τελευταία εκτέλεση</label><DatePicker value={form.last_done} onChange={v=>setForm(f=>({...f,last_done:v}))}/></div>
            <div><label htmlFor={estCostId} style={labelStyle}>Εκτιμώμενο κόστος</label><NumberInput id={estCostId} value={String(form.est_cost)} onChange={v=>setForm(f=>({...f,est_cost:parseFloat(v)||0}))} suffix="€" min={0}/></div>
            <div style={{gridColumn:'1/-1'}}><label htmlFor={mNotesId} style={labelStyle}>Σημειώσεις</label><TextInput id={mNotesId} value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Τεχνικός, παρατηρήσεις…"/></div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,padding:'9px 12px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.inner}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans,lineHeight:1.5}}>Με την αποθήκευση μπαίνει αυτόματα στο <strong style={{color:'var(--text-primary)'}}>ημερολόγιο</strong> (με υπενθύμιση email πριν λήξει){form.est_cost>0?<> και ως <strong style={{color:'var(--text-primary)'}}>εκκρεμής δαπάνη</strong> στον προϋπολογισμό «Συντήρηση»</>:''}.</p>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>
            <button onClick={()=>setAdding(false)} style={{padding:'0 16px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
            <button onClick={handleSave} disabled={saving} style={{padding:'0 20px',height:T.h.md,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:12,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση…':'Αποθήκευση'}</button>
          </div>
        </div>
      )}
      {/* ΜΙΑ ΛΙΣΤΑ, ΟΧΙ ΤΡΕΙΣ. Ήταν χωρισμένη σε «σε καθυστέρηση», «επόμενες 30
          ημέρες» και «επερχόμενες», με σήμα-πλήθος σε κάθε επικεφαλίδα. Κάθε
          γραμμή ΗΔΗ γράφει πόσες ημέρες λείπουν ή πόσες καθυστερεί, οπότε οι
          τρεις επικεφαλίδες επαναλάμβαναν ό,τι έλεγε η ίδια η σειρά. Ταξινομημένη
          κατά ημερομηνία, η καθυστέρηση είναι από μόνη της πρώτη. */}
      {schedules.length===0
        ? <EmptyState icon={<ClipboardCheck size={20}/>} title="Καμία προγραμματισμένη συντήρηση" hint="Διάλεξε μια έτοιμη εργασία από το μενού, ή όρισε δική σου. Μπαίνει στο ημερολόγιο με υπενθύμιση." />
        : <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[...schedules].sort((a,b)=>daysUntil(a.next_due)-daysUntil(b.next_due)).map(s=><SchedRow key={s.id} s={s}/>)}
          </div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// «ΦΡΟΝΤΙΔΑ»: ΔΥΟ ΕΝΟΤΗΤΕΣ, ΚΑΝΕΝΑ ΠΛΑΚΙΔΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Είχε τέσσερα πλακίδια στην κορυφή: ληγμένες εγγυήσεις, εγγυήσεις που λήγουν,
// συντήρηση σε καθυστέρηση, συντήρηση που έρχεται. Και τα τέσσερα νούμερα
// ξαναγράφονταν αμέσως από κάτω, ως σήμα δίπλα στον τίτλο της αντίστοιχης
// ενότητας — που έχει και τη λίστα, δηλαδή λέει το ίδιο ΚΑΙ δείχνει τι είναι.
//
// Ένα πλακίδιο που γράφει «2» πάνω από μια λίστα δύο γραμμών δεν πληροφορεί:
// καταλαμβάνει την κορυφή της οθόνης για να επαναλάβει ό,τι θα διαβαστεί ούτως
// ή άλλως δύο εκατοστά πιο κάτω. Έφυγαν και τα τέσσερα.
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΞΑΓΩΓΕΣ ΕΙΝΑΙ ΕΝΕΡΓΕΙΕΣ, ΟΧΙ ΕΝΟΤΗΤΑ ΤΗΣ ΣΕΛΙΔΑΣ
// ─────────────────────────────────────────────────────────────────────────
// Ήταν κάρτα με τρεις γραμμές, μόνιμα στο κάτω μέρος της οθόνης. Μια εξαγωγή
// όμως δεν είναι πληροφορία που κοιτάς: είναι κάτι που κάνεις μία φορά στους
// έξι μήνες. Κατέλαβε το τέλος κάθε επίσκεψης για να προσφέρει κάτι που σχεδόν
// ποτέ δεν ζητήθηκε εκείνη τη στιγμή. Τώρα ζουν στο μενού της κεφαλίδας.
// ═══════════════════════════════════════════════════════════════════════════
function inventoryExports({items,repairs,kwhPrice}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number}) {
  const totalCurrent=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairs=repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems=items.filter(hasEnergy)
  const totalMonthlyCost=electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  // Η ασφαλιστέα αξία είναι ΜΟΝΟ ό,τι έχει δηλωθεί ως κόστος αντικατάστασης.
  // Το «τρέχουσα × 1,1» έφυγε από παντού: έβγαζε νούμερο για κάθε αντικείμενο,
  // ακόμη κι όταν κανείς δεν είχε πει πόσο κοστίζει σήμερα το καινούργιο.
  const declaredRepl=items.filter(i=>(i.replacement_cost||0)>0)
  const totalDeclaredRepl=declaredRepl.reduce((s,i)=>s+(i.replacement_cost||0),0)
  const missingRepl=items.length-declaredRepl.length
  // ΔΥΟ ΛΑΘΗ ΣΕ ΜΙΑ ΕΞΑΓΩΓΗ, ΚΑΙ ΤΑ ΔΥΟ ΑΘΟΡΥΒΑ:
  //
  //   1. Ήταν χειροποίητο .csv, ενώ οι άλλες δεκαεπτά εξαγωγές της εφαρμογής
  //      παράγουν προσεγμένο .xlsx. Ο παραλήπτης έπαιρνε άλλο πράγμα από την
  //      απογραφή και άλλο από όλα τα υπόλοιπα.
  //   2. Η προστασία από ένεση τύπου γινόταν με τη `csvSafe()`, που επέστρεφε
  //      το κείμενο ΑΥΤΟΥΣΙΟ — ένα αντικείμενο ονομασμένο «=1+1» έφευγε ως
  //      ζωντανός τύπος του Excel. Το σχόλιο δίπλα της έλεγε ότι εξουδετερώνει
  //      «=,+,-,@». Δεν εξουδετέρωνε τίποτα, και το όνομα την έκανε να μοιάζει
  //      με άμυνα που υπάρχει.
  //
  // Το .xlsx γράφει συμβολοσειρές ως συμβολοσειρές — δεν υπάρχει ένεση τύπου
  // εξαρχής — και τα ποσά φεύγουν ως αριθμοί, οπότε η απογραφή αθροίζεται.
  const exportCSV=()=>{
    downloadTableXlsx('Απογραφή ακινήτου', {
      title: 'Απογραφή ακινήτου',
      headers:['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Αξία αγοράς (€)','Εκτιμώμενη υπολειπόμενη αξία (€)','Ποσοστό υπολειπόμενης αξίας','Κόστος αντικατάστασης (€)','Ενεργειακή κλάση','Τρόπος μέτρησης','kWh ανά 100 κύκλους','Κύκλοι ανά μήνα','kWh ανά έτος','Watt','Ώρες ανά ημέρα','kWh ανά μήνα','Κόστος ρεύματος ανά μήνα (€)','Ηλικία','Ημερομηνία αγοράς','Λήξη εγγύησης','Σημειώσεις'],
      rows: items.map(i=>[i.name,i.category,i.room,i.brand,i.model,i.serial_number,i.condition,i.purchase_value||'',calcCurrentValue(i),Math.max(0,100-calcDepreciationPct(i)),i.replacement_cost||'',i.energy_class||'',i.energy_mode?ENERGY_MODE_LABEL[i.energy_mode]:'',i.kwh_per_100_cycles||'',i.cycles_per_month||'',i.annual_kwh||'',i.power_watts||'',i.daily_hours_use||'',hasEnergy(i)?calcMonthlyKwh(i):'',kwhPrice>0?calcMonthlyCost(i,kwhPrice):'',calcAgeDisplay(i.purchase_date),i.purchase_date,i.warranty_expiry,i.notes]),
    })
  }
  const exportPDF=()=>{
    const byCat=[...INVENTORY_CATEGORIES].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
    const catRows=byCat.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>reportRow(`${cat} (${count})`,rEur(val))).join('')
    const detailRows=items.map(i=>`<tr><td><strong>${rEsc(i.name)}</strong>${i.brand?`<br><small class="muted">${rEsc(i.brand)} ${rEsc(i.model||'')}</small>`:''}</td><td>${rEsc(i.energy_class||ABSENT)}</td><td>${rEsc(i.condition)}</td><td class="n">${rEsc(rEur(i.purchase_value||0))}</td><td class="n">${rEsc(rEur(calcCurrentValue(i)))}</td><td class="n">${rEsc(rPct(Math.max(0,100-calcDepreciationPct(i))))}</td><td class="n">${rEsc(rEur(i.replacement_cost||0))}</td><td class="n">${rEsc(hasEnergy(i)?calcMonthlyKwh(i)+' kWh':ABSENT)}</td><td>${rEsc(i.warranty_expiry?fmtDate(i.warranty_expiry):ABSENT_DATE)}</td></tr>`).join('')
    const html = reportHead('Κατάσταση εξοπλισμού')
      + `<body><div class="page">`
      + reportHeader(null, 'Κατάσταση εξοπλισμού')
      + `<h1>Κατάσταση εξοπλισμού</h1>`
      + `<div class="sub">${rEsc(String(items.length))} αντικείμενα</div>`
      + reportSection('Σύνοψη')
      + `<div class="kpis">${reportKpi('Εκτιμώμενη υπολειπόμενη αξία', rEur(totalCurrent))}${reportKpi('Δηλωμένο κόστος αντικατάστασης', rEur(totalDeclaredRepl))}${reportKpi('Επισκευές', rEur(totalRepairs))}${electricItems.length>0&&kwhPrice>0?reportKpi('Ρεύμα/Μήνα', rEur(totalMonthlyCost)):''}</div>`
      + reportSection('Ανά κατηγορία')
      + `<table><tbody>${catRows}</tbody></table>`
      + reportSection('Αναλυτικός κατάλογος')
      + `<table><thead><tr><th>Αντικείμενο</th><th>Κλάση</th><th>Κατάσταση</th><th class="n">Αξία αγοράς</th><th class="n">Εκτιμώμενη υπολειπόμενη</th><th class="n">Ποσοστό που μένει</th><th class="n">Κόστος αντικατάστασης</th><th class="n">kWh/μήνα</th><th>Εγγύηση</th></tr></thead><tbody>${detailRows}</tbody></table>`
      + reportDisclaimer(`Η παρούσα κατάσταση έχει ενημερωτικό χαρακτήρα. Οι υπολειπόμενες αξίες προκύπτουν από γραμμική μείωση πάνω σε τυπική διάρκεια ζωής ανά κατηγορία και δεν αποτελούν επίσημη εκτίμηση. ${NOT_TAX_DEPRECIATION_NOTE} Το κόστος αντικατάστασης είναι όσο έχει δηλώσει ο ιδιοκτήτης· όπου λείπει, δεν συμπληρώνεται από εμάς.${missingRepl>0?` Λείπει σε ${missingRepl} από ${items.length} αντικείμενα.`:''}`)
      + `</div></body></html>`
    openReport(html)
  }
  // Εικονογραφημένη έκθεση για ασφαλιστική — μία «κάρτα» ανά αντικείμενο με φωτογραφία
  // και ΤΟ ΔΗΛΩΜΕΝΟ κόστος αντικατάστασης. Όπου λείπει, γράφεται «δεν δηλώθηκε»:
  // ο ασφαλιστής πρέπει να δει το κενό, όχι ένα νούμερο που φτιάξαμε εμείς.
  const insurableOf=(i:InventoryItem)=> (i.replacement_cost||0)>0?i.replacement_cost:0
  const totalInsurable=totalDeclaredRepl
  const exportInsurancePDF=()=>{
    const card=(i:InventoryItem)=>{const ph=i.photo_url||((i.photos||[]).filter(Boolean)[0]||'')
      return `<div class="c">
        <div class="ph">${ph?`<img src="${rEsc(ph)}"/>`:'<div class="noph">Χωρίς φωτογραφία</div>'}</div>
        <div class="cb"><div class="nm">${rEsc(i.name)}</div>
        <div class="mt">${rEsc([i.brand,i.model].filter(Boolean).join(' ')||i.category)}${i.room?` · ${rEsc(i.room)}`:''}</div>
        ${i.serial_number?`<div class="sn">Σειριακός ${rEsc(i.serial_number)}</div>`:''}
        <div class="crow"><span>Κατάσταση</span><span>${rEsc(i.condition)}</span></div>
        <div class="crow"><span>Αξία αγοράς</span><span>${rEsc(rEur(i.purchase_value||0))}</span></div>
        <div class="crow val"><span>Κόστος αντικατάστασης</span><span>${insurableOf(i)>0?rEsc(rEur(insurableOf(i))):'Δεν δηλώθηκε'}</span></div>
        </div></div>`}
    const html = reportHead('Έκθεση ασφάλισης περιεχομένου', INSURANCE_CSS)
      + `<body><div class="page">`
      + reportHeader(null, 'Έκθεση ασφάλισης περιεχομένου', {
          rightNote: `${items.length} ${items.length===1?'αντικείμενο':'αντικείμενα'} με φωτογραφική τεκμηρίωση`,
        })
      + `
    <h1>Ασφαλιστέο περιεχόμενο</h1>
    <div class="kpis" style="margin-top:20px">
      ${reportKpi('Δηλωμένο κόστος αντικατάστασης', rEur(totalInsurable))}
      ${reportKpi('Εκτιμώμενη υπολειπόμενη αξία', rEur(totalCurrent))}
      ${reportKpi(missingRepl>0?`Αντικείμενα, λείπει σε ${missingRepl}`:'Αντικείμενα', String(items.length))}
    </div>
    <div class="cards">${items.map(card).join('')}</div>
    ${reportDisclaimer(`Η ασφαλιστέα αξία εξοπλισμού είναι το κόστος ΑΝΤΙΚΑΤΑΣΤΑΣΗΣ ΜΕ ΚΑΙΝΟΥΡΓΙΟ, όχι η υπολειπόμενη αξία. Εδώ αθροίζονται μόνο τα ποσά που δήλωσε ο ιδιοκτήτης· ${missingRepl>0?`για ${missingRepl} από ${items.length} αντικείμενα δεν έχει δηλωθεί και ΔΕΝ έχουν υπολογιστεί — η κάλυψη πρέπει να συμπληρωθεί πριν την ασφάλιση.`:'έχει δηλωθεί για όλα τα αντικείμενα.'} Οι φωτογραφίες αποτελούν τεκμηρίωση του ιδιοκτήτη κατά την ημερομηνία έκδοσης.`)}
    </div></body></html>`
    openReport(html)
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // ΤΡΕΙΣ ΕΞΑΓΩΓΕΣ, ΟΧΙ ΤΡΕΙΣ ΚΑΡΤΕΣ ΥΨΟΥΣ ΔΙΑΚΟΣΙΩΝ ΕΙΚΟΝΟΣΤΟΙΧΕΙΩΝ
  // ─────────────────────────────────────────────────────────────────────────
  // Ήταν τρεις κάρτες σε πλέγμα. Η καθεμία έγραφε τον τίτλο της ΔΥΟ φορές (μία ως
  // επικεφαλίδα, μία ως ετικέτα του κουμπιού) και επαναλάμβανε το ΙΔΙΟ πλαίσιο
  // «N αντικείμενα · X €· ρεύμα Y €» — δηλαδή το ίδιο ζεύγος αριθμών τυπωνόταν
  // τρεις φορές στην ίδια οθόνη, κάτω από τη σειρά μετρικών που το έλεγε ήδη.
  //
  // Μια εξαγωγή είναι ενέργεια, όχι μετρική. Τρεις ενέργειες είναι τρεις γραμμές:
  // τι παράγει, για ποιον, και ένα κουμπί. Το ύψος έπεσε από τρεις κάρτες συν ένα
  // πλαίσιο σε μία κάρτα τριών γραμμών.
  //
  // Η πρόταση για την υπασφάλιση ζει ΜΟΝΟ εδώ, στην περιγραφή της έκθεσης που
  // αφορά τον ασφαλιστή. Το ίδιο κείμενο υπήρχε και ως χωριστό πλαίσιο από κάτω.
  // ═══════════════════════════════════════════════════════════════════════════
  return [
    {key:'pdf',   label:'Κατάσταση εξοπλισμού σε PDF',           description:'Αξίες, ενεργειακές κλάσεις, ηλικία και εγγυήσεις, έτοιμη για εκτύπωση.', onClick:exportPDF},
    {key:'insur', label:'Έκθεση για τον ασφαλιστή',  description:missingRepl>0
      ? `Φωτογραφία και κόστος αντικατάστασης ανά αντικείμενο. Λείπει από ${missingRepl} στα ${items.length} και γράφεται ρητά: ελλιπές άθροισμα σημαίνει υπασφάλιση που φαίνεται μόνο μετά τη ζημιά.`
      : 'Φωτογραφία και κόστος αντικατάστασης ανά αντικείμενο, για όλα.', onClick:exportInsurancePDF},
    {key:'csv',   label:'Αναλυτικά δεδομένα σε Excel', description:'Όλα τα πεδία σε αρχείο για λογιστικά φύλλα.', onClick:exportCSV},
  ]
}

export default function TabInventory({propertyId,userId,profileType='individual',embedded,handoverIntent,onIntentConsumed,properties=[]}:TabInventoryProps & {embedded?:boolean;handoverIntent?:HandoverIntent|null;onIntentConsumed?:()=>void;properties?:InventoryPropertyOption[]}) {
  // ΔΥΟ ΣΕΛΙΔΕΣ, ΟΧΙ ΤΕΣΣΕΡΙΣ ΥΠΟΚΑΡΤΕΛΕΣ. Η απογραφή είναι μία σελίδα που
  // διαβάζεται από πάνω προς τα κάτω. Το πρωτόκολλο παράδοσης είναι χωριστή
  // εργασία με δικό της βήμα-βήμα, οπότε μένει δική του σελίδα.
  const [page,setPage] = useState<'main'|'handover'>('main')
  const [handoverSeed,setHandoverSeed] = useState<(HandoverIntent&{n:number})|null>(null)
  // Deep-link από την καρτέλα ενοικιαστή: άνοιξε κατευθείαν τη «Παράδοση» σε νέο πρωτόκολλο με προ-συμπληρωμένα στοιχεία.
  useEffect(()=>{
    if(handoverIntent){
      setPage('handover')
      setHandoverSeed({...handoverIntent,n:Date.now()})
      onIntentConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[handoverIntent])
  const [items,setItems] = useState<InventoryItem[]>([])
  const [repairs,setRepairs] = useState<InventoryRepair[]>([])
  const [handovers,setHandovers] = useState<InventoryHandover[]>([])
  const [schedules,setSchedules] = useState<MaintenanceSchedule[]>([])
  // ΚΑΜΙΑ ΠΡΟΕΠΙΛΟΓΗ 0,22 €/kWh. Ήταν σταθερά που (α) πολλαπλασίαζε κάθε συσκευή
  // και (β) ΓΡΑΦΟΤΑΝ ΣΤΗ ΒΑΣΗ ως δήλωση του χρήστη σε κάθε άκυρη είσοδο. Η τιμή
  // έρχεται από τον λογαριασμό ρεύματος που το app ήδη διαβάζει (bills_electricity)
  // ή από ρητή δήλωση. Όσο λείπει, δείχνουμε kWh και όχι ευρώ.
  const [kwhPrice,setKwhPrice] = useState(0)
  const [kwInput,setKwInput] = useState('')
  const [loading,setLoading] = useState(true)
  const [showItemForm,setShowItemForm] = useState(false)
  const [editingItem,setEditingItem] = useState<InventoryItem|null>(null)
  const [repairItem,setRepairItem] = useState<InventoryItem|null>(null)
  const [qrItem,setQrItem] = useState<InventoryItem|null>(null)
  const [showBulkImport,setShowBulkImport] = useState(false)
  // Η επίπλωση δηλώνεται στην καρτέλα του ενοικιαστή (tenants.furnishing). Δεν τη
  // ξαναρωτάμε εδώ — «τίποτα με το χέρι δύο φορές».
  const [furnishing,setFurnishing] = useState<string|null>(null)

  const fetchData = useCallback(async()=>{
    setLoading(true)
    const [iR,rR,hR,sR,bR,psR] = await Promise.all([
      inventory.ofProperty<InventoryItem>(supabase,propertyId,'*',userId),
      supabase.from('inventory_repairs').select('*').eq('user_id',userId).order('repair_date',{ascending:false}),
      supabase.from('inventory_handovers').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_maintenance').select('*').eq('property_id',propertyId).order('next_due'),
      // Ο πίνακας `bills_electricity` ΔΕΝ ΥΠΑΡΧΕΙ (μόνο bills/bills_history/
      // bills_settings). Το ερώτημα απορριπτόταν ολόκληρο, άρα η εναλλακτική
      // πηγή τιμής kWh ήταν πάντα κενή και ο χρήστης έβλεπε άδειο πεδίο ακόμη
      // κι όταν είχε καταχωρήσει τιμή στο μισθωτήριο. Η τιμή ζει στο tenants.
      //
      // ΔΥΟ ΕΡΩΤΗΜΑΤΑ ΕΓΙΝΑΝ ΕΝΑ, και τα δύο έλεγαν `.limit(1)` χωρίς καμία σειρά
      // και χωρίς κανένα φίλτρο κατάστασης: έπαιρναν όποια γραμμή ερχόταν πρώτη,
      // ακόμη κι ενός μισθωτή που έφυγε πέρσι.
      tenantStore.currentAll<{ kwh_price?: number | null; furnishing?: string | null }>(supabase,propertyId,'kwh_price,furnishing',userId),
      // Η ΤΙΜΗ ΤΟΥ ΑΚΙΝΗΤΟΥ, που είναι και η μόνη που μπορεί να γράψει ο χρήστης.
      // Το `property_settings.kwh_price` προστέθηκε με migration· ως τότε η
      // αποθήκευση αποτύγχανε σιωπηλά και εδώ διαβαζόταν δύο φορές η ίδια στήλη
      // του μισθωτηρίου, μόνο για να μη χαλάσει η σειρά του Promise.all.
      supabase.from('property_settings').select('kwh_price').eq('property_id',propertyId).limit(1),
    ])
    setFurnishing(bR[0]?.furnishing ?? null)
    // Καμία εγγραφή κατά την ανάγνωση: οι υπενθυμίσεις ημερολογίου δημιουργούνται
    // ΜΟΝΟ με ρητή ενέργεια του χρήστη (κουμπί «Ημερολόγιο»), όχι αυτόματα σε κάθε load.
    setItems(iR.map(i=>({...i,photos:i.photos||[]})))
    if(rR.data)setRepairs(rR.data)
    if(hR.data)setHandovers(hR.data as InventoryHandover[])
    if(sR.data)setSchedules(sR.data)
    const savedKwh=(psR.data?.[0] as {kwh_price?:number}|undefined)?.kwh_price||bR.find(t=>t.kwh_price!=null)?.kwh_price
    if(savedKwh){setKwhPrice(savedKwh);setKwInput(String(savedKwh))}
    setLoading(false)
  },[propertyId,userId])

  useEffect(()=>{fetchData()},[fetchData])

  const saveKwh=async(price:number)=>{
    // Ο μοναδικός περιορισμός είναι `UNIQUE (property_id)` — ΜΟΝΟ αυτόν δέχεται
    // το on conflict. Το προηγούμενο `'property_id,user_id'` δεν αντιστοιχούσε
    // σε κανέναν, οπότε η Postgres έριχνε 42P10 και η τιμή δεν αποθηκευόταν ποτέ.
    const {error}=await supabase.from('property_settings')
      .upsert({property_id:propertyId,user_id:userId,kwh_price:price},{onConflict:'property_id'})
    // Το σφάλμα ΔΙΑΒΑΖΕΤΑΙ. Ο Supabase δεν πετά ποτέ — επιστρέφει {data,error} —
    // οπότε χωρίς αυτόν τον έλεγχο η αποτυχία ήταν κυριολεκτικά αόρατη.
    if(error){notifyError(failed('Η τιμή ρεύματος δεν αποθηκεύτηκε',error));return}
    notifyOk('Η τιμή ρεύματος αποθηκεύτηκε')
  }
  const handleSaveItem=async(data:Partial<InventoryItem>)=>{
    // Γράφονται ΜΟΝΟ τα πεδία που ζητάει πλέον η φόρμα. Οι στήλες που έμειναν στη
    // βάση (provenance, discount_pct, smart_device, standby_watts…) δεν αγγίζονται:
    // τα παλιά δεδομένα μένουν ακέραια, απλώς δεν παράγονται καινούργια.
    const payload={name:data.name||'',category:data.category||'Λοιπά',room:data.room||'',brand:data.brand||'',model:data.model||'',serial_number:data.serial_number||'',condition:data.condition||'Καλή',notes:data.notes||'',photo_url:data.photo_url||'',photos:data.photos||[],purchase_value:data.purchase_value||0,purchase_date:data.purchase_date||null,warranty_expiry:data.warranty_expiry||null,energy_class:data.energy_class||'',power_watts:data.power_watts||0,daily_hours_use:data.daily_hours_use||0,replacement_cost:data.replacement_cost||0,receipt_doc_url:data.receipt_doc_url||null,receipt_doc_name:data.receipt_doc_name||null}
    if(editingItem){const {error}=await inventory.update(supabase,editingItem.id,payload);if(error)notifyError(failed('Το αντικείμενο δεν αποθηκεύτηκε',error))
      // Καθάρισε την ΠΑΛΙΑ απόδειξη αν αντικαταστάθηκε/αφαιρέθηκε (αποφυγή orphan στο storage).
      else{const oldDoc=editingItem.receipt_doc_url;if(oldDoc&&oldDoc!==payload.receipt_doc_url&&!/^https?:\/\//.test(oldDoc))await supabase.storage.from(DOCS_BUCKET).remove([oldDoc])}}
    else{const {error}=await inventory.add(supabase,propertyId,userId,[payload]);if(error)notifyError(failed('Το αντικείμενο δεν καταχωρήθηκε',error))}
    setShowItemForm(false);setEditingItem(null);fetchData()
  }
  // Καθαρισμός συνημμένων αποδείξεων (private bucket) ώστε να μη μένουν orphan αρχεία.
  const cleanupDocs=async(its:InventoryItem[])=>{const paths=its.map(i=>i.receipt_doc_url).filter((p):p is string=>!!p&&!/^https?:\/\//.test(p));if(paths.length)await supabase.storage.from(DOCS_BUCKET).remove(paths)}
  const handleDelete=async(id:string)=>{const it=items.find(i=>i.id===id);const {error}=await inventory.remove(supabase,id);if(error){notifyError(failed('Το αντικείμενο δεν διαγράφηκε',error));return};if(it)await cleanupDocs([it]);fetchData()}
  // ΤΡΙΑ ΓΡΑΨΙΜΑΤΑ ΠΟΥ ΔΕΝ ΔΙΑΒΑΖΑΝ ΤΟ ΣΦΑΛΜΑ ΤΟΥΣ. Ο Supabase δεν πετά ποτέ
  // εξαίρεση — επιστρέφει {data,error}. Χωρίς έλεγχο, η επισκευή που απορρίφθηκε
  // από RLS, η κατάσταση που δεν αποθηκεύτηκε και το δωμάτιο που δεν άλλαξε
  // φαίνονταν στην οθόνη σαν να έγιναν: η μία επειδή ακολουθούσε επαναφόρτωση που
  // απλώς δεν έφερνε τίποτα νέο, η άλλη επειδή η οθόνη ενημερωνόταν αισιόδοξα.
  const handleAddRepair=async(data:Partial<InventoryRepair>)=>{
    if(!repairItem)return
    const {error}=await supabase.from('inventory_repairs').insert({...data,item_id:repairItem.id,user_id:userId})
    if(error){notifyError(failed('Η επισκευή δεν καταχωρήθηκε',error));return}
    fetchData()
  }
  const handleUpdateCondition=async(id:string,condition:string)=>{
    const prevCondition=items.find(i=>i.id===id)?.condition
    setItems(prev=>prev.map(i=>i.id===id?{...i,condition}:i))
    const {error}=await inventory.update(supabase,id,{condition})
    // Επαναφορά της οθόνης στην πραγματικότητα: αλλιώς ο χρήστης βλέπει «Κακή»,
    // φεύγει, γυρίζει, και το αντικείμενο είναι πάλι «Καλή» χωρίς εξήγηση.
    if(error){setItems(prev=>prev.map(i=>i.id===id&&prevCondition?{...i,condition:prevCondition}:i));notifyError(failed('Η κατάσταση δεν αποθηκεύτηκε',error))}
  }
  const handleBulkDelete=async(ids:string[])=>{if(!ids.length)return;const its=items.filter(i=>ids.includes(i.id));const {error}=await inventory.removeMany(supabase,ids);if(error){notifyError(failed('Τα αντικείμενα δεν διαγράφηκαν',error));return}await cleanupDocs(its);fetchData()}
  const handleBulkRoom=async(ids:string[],room:string)=>{
    if(!ids.length)return
    const {error}=await inventory.updateMany(supabase,ids,{room})
    if(error){notifyError(failed('Το δωμάτιο δεν αποθηκεύτηκε',error));return}
    fetchData()
  }
  const [cloning,setCloning] = useState(false)
  const otherProps = properties.filter(p=>p.id!==propertyId).map(p=>({id:p.id,label:p.address||p.nickname||p.name||'Ακίνητο'}))
  const insertStarterPack = async() => {
    setCloning(true)
    const rows=STARTER_PACK.map(s=>({name:s.name,category:s.category,room:s.room,condition:'Καλή',brand:'',model:'',serial_number:'',notes:'',photo_url:'',photos:[],purchase_value:0}))
    const {error}=await inventory.add(supabase,propertyId,userId,rows)
    setCloning(false)
    if(error){notifyError(failed('Τα αντικείμενα του πακέτου δεν προστέθηκαν',error));return}
    fetchData()
  }
  const cloneFromProperty = async(sourceId:string) => {
    setCloning(true)
    const data=await inventory.ofProperty<InventoryItemsRow>(supabase,sourceId,'*',String(userId))
    if(data.length===0){setCloning(false);notifyError('Το ακίνητο δεν έχει αντικείμενα προς αντιγραφή.');return}
    // Η αντιγραφή κρατά ό,τι δεν ανήκει στο ακίνητο-πηγή: το κλειδί, οι σφραγίδες
    // χρόνου και ο δεσμός ακινήτου ξαναγράφονται από το στρώμα.
    const rows=data.map(({id,created_at,updated_at,property_id,user_id,...rest})=>rest)
    const {error}=await inventory.add(supabase,propertyId,userId,rows)
    setCloning(false)
    if(error){notifyError(failed('Η αντιγραφή από το άλλο ακίνητο δεν ολοκληρώθηκε',error));return}
    fetchData()
  }
  // ═══ ΜΙΑ ΥΠΕΝΘΥΜΙΣΗ ΕΓΓΥΗΣΗΣ, ΕΝΑ ΣΗΜΕΙΟ ═══════════════════════════════════
  // Η ΙΔΙΑ ενέργεια υπήρχε δύο φορές, γραμμένη δύο φορές: εδώ, ως «Υπενθύμιση
  // εγγύησης» στο μενού του αντικειμένου, και μέσα στην ενότητα Εγγυήσεων ως
  // κουμπί «Ημερολόγιο» με δικό της αντίγραφο του ίδιου insert. Ίδια εγγραφή,
  // διαφορετικά μηνύματα, καμία από τις δύο δεν ήξερε τι είχε κάνει η άλλη.
  //
  // Και καμία δεν κοίταζε αν η υπενθύμιση υπάρχει ήδη: δύο πατήματα, δύο εγγραφές
  // ημερολογίου για την ίδια εγγύηση, δύο email την ίδια μέρα. Τώρα η ενέργεια
  // ζει εδώ, μία φορά, και ρωτάει πρώτα.
  const handleWarrantyReminder=async(item:InventoryItem):Promise<boolean>=>{
    if(!item.warranty_expiry){notifyError('Το αντικείμενο δεν έχει ημερομηνία λήξης εγγύησης.');return false}
    const title=`Εγγύηση: ${item.name}`
    if(await calendar.exists(supabase,propertyId,{source:'inventory',title,eventDate:item.warranty_expiry})){notifyOk(`Η υπενθύμιση για «${item.name}» υπάρχει ήδη στο ημερολόγιο.`);return true}
    const {error}=await calendar.insert(supabase,[calendar.row({propertyId,userId},'inventory',{title,notes:`Λήγει ${fmtDate(item.warranty_expiry)}`,event_date:item.warranty_expiry,category:'maintenance',priority:daysUntil(item.warranty_expiry)<=30?'high':'medium'})])
    if(error){notifyError(failed('Δεν μπόρεσα να προσθέσω την υπενθύμιση',error));return false}
    // ΗΤΑΝ notifyError: μήνυμα ΕΠΙΤΥΧΙΑΣ σε κόκκινο toast. Ο χρήστης νόμιζε ότι απέτυχε
    // και το ξαναπατούσε, φτιάχνοντας διπλές εγγραφές ημερολογίου.
    notifyOk(`Προστέθηκε υπενθύμιση εγγύησης στο ημερολόγιο για «${item.name}».`)
    return true
  }
  const exportActions = inventoryExports({items,repairs,kwhPrice})
  // ΔΥΟ ΕΞΑΓΩΓΕΣ CSV ΤΩΝ ΙΔΙΩΝ ΔΕΔΟΜΕΝΩΝ ΔΕΝ ΥΠΑΡΧΟΥΝ ΠΙΑ. Η κεφαλίδα είχε
  // δική της, με εννέα στήλες· το μενού έχει την πλήρη, με είκοσι. Ο χρήστης
  // κατέβαζε «την απογραφή» και έπαιρνε άλλο αρχείο ανάλογα με το πού πάτησε.

  // ═══ ΠΟΙΟΣ ΒΛΕΠΕΙ ΑΠΟΓΡΑΦΗ ΕΞΟΠΛΙΣΜΟΥ ═══════════════════════════════════
  // Ένα κενό διαμέρισμα, μια ιδιοχρησία ή ένα γυμνό ενοίκιο δεν έχουν εξοπλισμό να
  // παραδώσουν. Η βραχυχρόνια είναι εξ ορισμού επιπλωμένη (δεν νοικιάζεται γυμνό
  // διαμέρισμα ανά νύχτα)· στη μακροχρόνια το κρίνει η δήλωση επίπλωσης της
  // καρτέλας ενοικιαστή. ΔΙΧΤΥ ΑΣΦΑΛΕΙΑΣ: αν υπάρχουν ήδη αντικείμενα, η καρτέλα
  // εμφανίζεται ΠΑΝΤΑ — δεν κρύβουμε ποτέ δεδομένα που ο χρήστης έχει καταχωρήσει.
  // ΤΟ CAST ΕΚΡΥΒΕ ΤΟ ΛΑΘΟΣ. Ήταν `(properties as StatusRow[]).find((p:any)=>…)`:
  // το StatusRow ΔΕΝ έχει `id`, οπότε το cast ήταν άκυρο και το `any` το έκρυβε.
  // Ο σωστός τύπος λέει και τα δύο — ό,τι χρειάζεται η κατάσταση, και το κλειδί.
  const propRow = (properties as (StatusRow & { id: string })[]).find(p => p?.id === propertyId) || null
  const status = readStatus(propRow)
  const declaredFurnished = status==='rent_short' || furnishing==='furnished' || furnishing==='turnkey'
  const fieldCtx: FieldContext = {
    status, business: profileType==='professional', doubleEntry: false,
    propertyCount: properties.length||1, furnished: declaredFurnished||items.length>0,
  }
  const inventoryApplies = declaredFurnished || items.length>0

  const overdueCount=schedules.filter(s=>daysUntil(s.next_due)<0).length
  const warnCount=schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30}).length
  // ═══ ΤΑ ΤΕΣΣΕΡΑ ΝΟΥΜΕΡΑ ΤΗΣ ΑΠΟΓΡΑΦΗΣ ════════════════════════════════════
  // Υπολογίζονται ΕΔΩ, μία φορά, και εμφανίζονται ΕΔΩ, μία φορά: η σειρά μετρικών
  // στέκει πάνω από τις υποκαρτέλες και φαίνεται σε όλες τους. Καμία υποκαρτέλα
  // δεν έχει πια δικό της πλέγμα μετρικών.
  const invSummary=portfolioSummary(items)
  const totalValue=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const categoryCount=new Set(items.map(i=>i.category)).size
  const electricItems=items.filter(hasEnergy)
  const monthlyKwh=electricItems.reduce((s,i)=>s+calcMonthlyKwh(i),0)
  const monthlyCost=electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  const declaredRepl=items.filter(i=>(i.replacement_cost||0)>0)
  const declaredReplTotal=declaredRepl.reduce((s,i)=>s+(i.replacement_cost||0),0)

  // Ο έλεγχος τιμής kWh ζει εκεί που έχει νόημα — στην ενότητα κατανάλωσης ρεύματος, όχι στο header.
  const kwhControl=(
    <div title="kWh = κιλοβατώρα· τιμή ρεύματος σε € ανά kWh, για τον υπολογισμό κόστους" style={{display:'inline-flex',alignItems:'center',height:28,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.pill,overflow:'hidden'}}>
      <span style={{padding:'0 8px',fontSize:9,color:'var(--text-tertiary)',borderRight:'1px solid var(--border-subtle)',alignSelf:'stretch',display:'flex',alignItems:'center',whiteSpace:'nowrap',letterSpacing:'0.5px',textTransform:'uppercase',fontFamily:T.font.sans}}>€/kWh</span>
      <input type="text" inputMode="decimal" value={kwInput} placeholder="" aria-label="Τιμή ρεύματος σε ευρώ ανά kWh, από τον λογαριασμό σου"
        onChange={e=>{const raw=e.target.value.replace(',','.');setKwInput(raw);if(/^\d*\.?\d*$/.test(raw)&&raw!=='')setKwhPrice(parseFloat(raw)||0)}}
        onFocus={e=>{e.target.select()}}
        onBlur={()=>{const n=parseFloat(kwInput);if(isNaN(n)||n<=0){setKwInput('');setKwhPrice(0)}else{setKwInput(String(n));setKwhPrice(n);saveKwh(n)}}}
        style={{width:52,background:'transparent',border:'none',outline:'none',padding:'0 8px',fontSize:12,color:'var(--text-primary)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',textAlign:'right'}}
      />
    </div>
  )

  return (
    <div style={{minWidth:0,width:'100%'}}>
      {(showItemForm||editingItem)&&<ItemFormModal item={editingItem} onSave={handleSaveItem} onClose={()=>{setShowItemForm(false);setEditingItem(null)}} propertyId={propertyId} ctx={fieldCtx} kwhPrice={kwhPrice}/>}
      {repairItem&&<RepairModal item={repairItem} repairs={repairs} onAdd={handleAddRepair} onClose={()=>setRepairItem(null)} propertyId={propertyId} userId={userId}/>}
      {qrItem&&<QRModal item={qrItem} onClose={()=>setQrItem(null)}/>}
      {showBulkImport&&<BulkImportModal propertyId={propertyId} userId={userId} onImported={fetchData} onClose={()=>setShowBulkImport(false)}/>}

      {!embedded && <PageTitle
        title="Έπιπλα και εξοπλισμός"
        sub="Διαχείριση εξοπλισμού, αξίας, ρεύματος, εγγυήσεων και παράδοσης"
        /* ΕΝΑ ΚΟΥΜΠΙ, ΚΑΙ ΕΝΑ ΜΕΝΟΥ. Ήταν τρία κουμπιά στην κεφαλίδα και άλλες
           τρεις εξαγωγές σε δική τους κάρτα στο τέλος της σελίδας — έξι ενέργειες
           για μια οθόνη που έχει ΜΙΑ κύρια: πρόσθεσε αντικείμενο. */
        right={<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <ActionMenu label="Περισσότερα" items={[
            {key:'bulk',label:'Μαζική εισαγωγή',description:'Επικόλλησε λίστα ή αρχείο και μπαίνουν όλα μαζί.',onClick:()=>setShowBulkImport(true)},
            {key:'hand',label:'Πρωτόκολλο παράδοσης',description:'Κατάσταση εξοπλισμού στην είσοδο ή στην έξοδο του ενοικιαστή.',onClick:()=>setPage('handover'),disabled:items.length===0},
            // Η αντιγραφή ζούσε ΚΑΙ ως κουμπί στην καθολική μπάρα του ακινήτου
            // (με δικό της modal) ΚΑΙ ως επιλογή στην άδεια κατάσταση εδώ. Δύο
            // δρόμοι για την ίδια πράξη, ο ένας ορατός μόνο όταν δεν έχεις τίποτα.
            ...otherProps.map(op=>({key:`clone${op.id}`,label:`Αντιγραφή από «${op.label}»`,description:'Προσθέτει τα αντικείμενα του άλλου ακινήτου σε αυτό.',onClick:()=>cloneFromProperty(op.id),busy:cloning})),
            ...exportActions.map(a=>({...a,disabled:items.length===0})),
          ]}/>
          {/* Με άδεια απογραφή, το «Νέο αντικείμενο» λέγεται από την κενή κατάσταση.
              Εδώ εμφανιζόταν και στα δύο σημεία, σε απόσταση μιας ματιάς. */}
          {items.length>0&&<Btn variant="primary" onClick={()=>{setEditingItem(null);setShowItemForm(true)}}>Νέο αντικείμενο</Btn>}
        </div>}
      />}

      {/* ═══ ΟΤΑΝ Η ΑΠΟΓΡΑΦΗ ΔΕΝ ΑΦΟΡΑ ΑΥΤΟ ΤΟ ΑΚΙΝΗΤΟ ═════════════════════════
          Δεν δείχνουμε άδεια φόρμα 28 πεδίων σε κάποιον που μένει στο σπίτι του ή
          που το έχει κλειστό. Λέμε ΓΙΑΤΙ δεν την βλέπει και πού δηλώνεται η
          επίπλωση — δεν του ζητάμε να το ξαναδηλώσει εδώ. */}
      {!loading && !inventoryApplies && (
        <EmptyState
          icon={<Archive size={20}/>}
          /* Ο ΤΙΤΛΟΣ ΕΒΑΖΕ ΤΗΝ ΚΑΤΑΣΤΑΣΗ ΣΤΗ ΘΕΣΗ ΤΟΥ ΟΝΟΜΑΤΟΣ: «Δεν υπάρχει
             απογραφή εξοπλισμού σε ακίνητο «Κενό»» — σαν να λέγεται «Κενό» το
             ακίνητο. Το «Κενό» είναι κατάσταση, και λέγεται ως κατάσταση, μέσα
             στην εξήγηση. Επίσης ήταν χειρόγραφη κενή κατάσταση, τυλιγμένη σε
             κάρτα: δύο παρεκκλίσεις από τις σαράντα πέντε άλλες της εφαρμογής,
             σε μία οθόνη. Τώρα είναι το κοινό EmptyState. */
          title={status==='rent_long' ? 'Το ακίνητο δεν έχει δηλωθεί επιπλωμένο' : 'Η απογραφή ξεκινά με τη μίσθωση'}
          hint={status==='rent_long'
            ? 'Η απογραφή υπάρχει για να παραδίδεις και να παραλαμβάνεις εξοπλισμό με απόδειξη, και για να τον ασφαλίζεις. Σε γυμνό διαμέρισμα δεν υπάρχει τίποτα από τα δύο. Αν το νοικιάζεις επιπλωμένο, δήλωσέ το στην καρτέλα «Ενοικιαστής», στην Επίπλωση, και η απογραφή εμφανίζεται εδώ αυτόματα.'
            : `Ο εξοπλισμός καταγράφεται όταν παραδίδεται σε κάποιον άλλον, και το ακίνητο είναι σήμερα σε κατάσταση «${statusLabel(propRow)}». Μόλις μπει σε μίσθωση, η απογραφή εμφανίζεται εδώ με τα δικά της πεδία, χωρίς να ξαναδηλώσεις τίποτα.`}
        />
      )}

      {!loading&&inventoryApplies&&(items.length===0
        ? <div className="card" style={{textAlign:'center',padding:'clamp(40px,7vw,68px) 24px',marginTop:8}}>
            {handoverSeed&&(
              <div style={{display:'flex',alignItems:'center',gap:10,textAlign:'left',maxWidth:520,margin:'0 auto 24px',padding:'12px 16px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.inner}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans,lineHeight:1.5}}>Για το πρωτόκολλο παράδοσης{handoverSeed.tenantName?<> του <strong style={{color:'var(--text-primary)'}}>{handoverSeed.tenantName}</strong></>:''} πρόσθεσε πρώτα τον εξοπλισμό του ακινήτου, μετά θα καταγράφεις την κατάστασή του σε κάθε παράδοση/παραλαβή.</p>
              </div>
            )}
            <div style={{width:64,height:64,borderRadius:18,background:'var(--accent-soft)',border:'1px solid var(--accent-border)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px'}}>
              <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"/><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M10 12h4"/></svg>
            </div>
            <p style={{fontSize:20,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:8}}>{handoverSeed?'Πρόσθεσε εξοπλισμό πρώτα':'Ξεκίνησε την καταγραφή'}</p>
            <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans,maxWidth:440,margin:'0 auto 22px',lineHeight:1.6}}>Κατέγραψε έπιπλα, συσκευές και εξοπλισμό: αξία, εγγυήσεις και κατανάλωση, όλα οργανωμένα και εύκολα.</p>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:14}}>
              {/* Η σάρωση είναι το ΚΥΡΙΟ μονοπάτι: ανοίγει η φόρμα με τη φωτογραφία
                  πρώτη και το AI συμπληρώνει μάρκα, μοντέλο, αξία και εγγύηση. */}
              <Btn variant="primary" onClick={()=>{setEditingItem(null);setShowItemForm(true)}}>Φωτογράφισε αντικείμενο</Btn>
              <Btn variant="ghost" onClick={()=>setShowBulkImport(true)}>Μαζική εισαγωγή</Btn>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',alignItems:'center',marginBottom:28}}>
              <button onClick={insertStarterPack} disabled={cloning} style={{display:'inline-flex',alignItems:'center',gap:7,height:T.h.md,padding:'0 14px',borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,fontWeight:500,cursor:cloning?'wait':'pointer'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                {cloning?'Δημιουργία…':`Πρότυπο επιπλωμένου (${STARTER_PACK.length})`}
              </button>
              {otherProps.length>0&&<BulkPicker label="Αντιγραφή από ακίνητο" icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>} options={otherProps.map(p=>p.label)} onPick={label=>{const p=otherProps.find(x=>x.label===label);if(p)cloneFromProperty(p.id)}}/>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:12,maxWidth:640,margin:'0 auto',textAlign:'left'}}>
              {[
                {icon:<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.2"/></svg>,t:'Φωτογράφισε ή σάρωσε',d:'Το AI διαβάζει μάρκα, μοντέλο, αξία και εγγύηση'},
                {icon:<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>,t:'Παρακολούθησε εγγυήσεις',d:'Υπενθύμιση πριν λήξουν, χωρίς να το ξεχνάς'},
                {icon:<svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>,t:'Υπολόγισε κατανάλωση',d:'Κόστος ρεύματος ανά συσκευή και εξοικονόμηση'},
              ].map((s,i)=>(
                <div key={i} style={{display:'flex',gap:11,padding:'13px 14px',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)'}}>
                  <div style={{color:'var(--accent)',flexShrink:0,marginTop:1}}>{s.icon}</div>
                  <div>
                    <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',fontFamily:T.font.sans,marginBottom:2}}>{s.t}</p>
                    <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45}}>{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        : page==='handover' ? null : (
            // ΚΑΝΕΝΑ ΜΗΔΕΝΙΚΟ ΠΛΑΚΙΔΙΟ. Ρεύμα εμφανίζεται μόνο όταν υπάρχει
            // μετρημένη κατανάλωση, κόστος αντικατάστασης μόνο όταν έχει δηλωθεί
            // έστω μία φορά. Ένα πλακίδιο που γράφει «0,00 €» δεν λέει «δεν
            // υπάρχει μέτρηση», λέει «μετρήσαμε μηδέν» — και είναι ψέμα.
            <KPIGrid items={[
              {label:'Αντικείμενα',value:fn(items.length),sub:`${categoryCount} ${categoryCount===1?'κατηγορία':'κατηγορίες'}`},
              {label:'Εκτιμώμενη υπολειπόμενη αξία',value:fe(totalValue),
                sub:invSummary.totalOriginal>0
                  ? `από ${fe(invSummary.totalOriginal)} αξία αγοράς, μένει το ${Math.max(0,100-invSummary.avgDepreciatedPct)}%`
                  : 'εκτίμηση, όχι φορολογική απόσβεση'},
              ...(electricItems.length>0?[kwhPrice>0
                ? {label:'Ρεύμα ανά μήνα',value:fe(monthlyCost),sub:`${fn(monthlyKwh,1)} κιλοβατώρες, στα ${feRate(kwhPrice)} ανά κιλοβατώρα`}
                : {label:'Ρεύμα ανά μήνα',value:`${fn(monthlyKwh,1)} kWh`,sub:'δήλωσε τιμή ανά κιλοβατώρα για κόστος'}]:[]),
              ...(declaredRepl.length>0?[{label:'Κόστος αντικατάστασης',value:fe(declaredReplTotal),
                sub:declaredRepl.length<items.length
                  ? `δηλωμένο σε ${declaredRepl.length} από ${items.length} αντικείμενα`
                  : 'δηλωμένο σε όλα τα αντικείμενα'}]:[]),
            ]}/>
          )
      )}

      {!loading && items.length>0 && page==='handover' && (
        <div style={{marginTop:8}}>
          <button onClick={()=>setPage('main')} style={{display:'inline-flex',alignItems:'center',gap:6,height:T.h.sm,padding:'0 12px',marginBottom:16,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Πίσω στα έπιπλα και τον εξοπλισμό
          </button>
          <HandoverTab items={items} handovers={handovers} propertyId={propertyId} userId={userId} onSaved={fetchData} seed={handoverSeed}/>
        </div>
      )}

      {/* ═══ ΜΙΑ ΣΕΛΙΔΑ, ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΠΑΝΩ ΠΡΟΣ ΤΑ ΚΑΤΩ ══════════════════
          τι πρέπει να κάνω · τι έχω · τι έχω προγραμματίσει · πού πάει η αξία
          και το ρεύμα · τι έχω παραδώσει. Καμία υποκαρτέλα, κανένα κλικ για να
          δεις την κατάσταση ενός σπιτιού με δέκα αντικείμενα. */}
      {(loading || items.length > 0) && page==='main' && (
        <div style={{display:'flex',flexDirection:'column',gap:28,marginTop:24}}>
          {loading
            ?<><SkeletonKPIs n={4}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14}}>{[0,1,2,3,4,5].map(i=><Skeleton key={i} h={180} r={14}/>)}</div></>
            :<>
              <AttentionCard items={items} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onWarrantyReminder={handleWarrantyReminder}/>
              <ItemsTab items={items} kwhPrice={kwhPrice} onAdd={()=>{setEditingItem(null);setShowItemForm(true)}} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onDelete={handleDelete} onRepair={item=>setRepairItem(item)} onQR={item=>setQrItem(item)} onUpdateCondition={handleUpdateCondition} onWarrantyReminder={handleWarrantyReminder} onBulkDelete={handleBulkDelete} onBulkRoom={handleBulkRoom}/>
              <MaintenanceTab items={items} schedules={schedules} propertyId={propertyId} userId={userId} onSaved={fetchData}/>
              <AnalysisCards items={items} repairs={repairs} kwhPrice={kwhPrice} kwhControl={kwhControl}/>
              <HandoverCard handovers={handovers} onOpenHandover={()=>setPage('handover')}/>
            </>}
        </div>
      )}
    </div>
  )
}