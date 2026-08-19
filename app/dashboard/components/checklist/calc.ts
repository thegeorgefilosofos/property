// ═══════════════════════════════════════════════════════════════════════════
// ΟΣΑ ΠΡΟΚΥΠΤΟΥΝ ΑΠΟ ΜΙΑ ΕΚΚΡΕΜΟΤΗΤΑ
// ─────────────────────────────────────────────────────────────────────────
// Πότε είναι εκπρόθεσμη, πώς γράφεται η ημερομηνία, ποια είναι η επόμενη
// επανάληψη, και πώς μεταφράζεται μια γραμμή της βάσης σε αντικείμενο της
// οθόνης. Καθαρές συναρτήσεις, καμία κλήση στη βάση.
//
// Η ΜΕΤΑΦΡΑΣΗ ΠΡΟΣ ΚΑΙ ΑΠΟ ΤΗ ΒΑΣΗ ΖΕΙ ΕΔΩ, ΟΧΙ ΣΤΗΝ ΟΘΟΝΗ. Οι υποεργασίες, τα
// σχόλια και η απόδειξη αποθηκεύονται μέσα στο πεδίο σημειώσεων ως δομημένο
// κείμενο· αν το γράψιμο και το διάβασμα ζούσαν σε δύο σημεία, η πρώτη αλλαγή
// σχήματος θα έσπαγε το ένα από τα δύο σιωπηλά.
// ═══════════════════════════════════════════════════════════════════════════
import { fd } from '@/components/tokens'
import { daysUntil as athensDaysUntil } from '@/lib/core/time'
import { addMonths as addCalendarMonths } from '@/lib/loans/progress'
import type { ChecklistItemsRow } from '@/lib/supabase/tables'
import {
  CATEGORIES, PRIORITIES, STATUSES,
  type ChecklistItem, type Comment, type ItemReceipt, type Priority, type Recurring, type Status, type SubTask,
} from './model'
import type { Who } from '@/lib/accounting/dossier'

export const fmtDate = (d: string | null) => (d ? fd(d) : '')
export function isOverdue(due: string | null, status: string) {
  if (!due || status === 'done' || status === 'skipped') return false
  return new Date(due) < new Date()
}
export function daysUntil(d: string | null) { if (!d) return null; return athensDaysUntil(d) ?? 0 }
// ΟΙ ΠΡΟΕΠΙΛΟΓΕΣ ΜΕ ΤΟ ΟΝΟΜΑ ΤΟΥΣ, ΟΧΙ ΜΕ ΤΗ ΘΕΣΗ ΤΟΥΣ.
// Ήταν `PRIORITIES[2]` και `STATUSES[0]`. Τώρα που η σειρά έρχεται από κοινό
// αρχείο, μια αναδιάταξη εκεί θα άλλαζε σιωπηλά την προεπιλογή εδώ — άγνωστη
// προτεραιότητα θα γινόταν «Κρίσιμο» αντί για «Κανονική», σε κάθε εγγραφή που
// ήρθε από παλιά δεδομένα. Το όνομα δεν μετακινείται.
export const byValue = <T extends { value: string }>(list: readonly T[], v: string, fallback: string): T =>
  list.find(x => x.value === v) ?? list.find(x => x.value === fallback) ?? list[0]

export function getCat(id: string) { return CATEGORIES.find(c => c.id === id) ?? CATEGORIES.find(c => c.id === 'other') ?? CATEGORIES[0] }
export function getPri(v: string) { return byValue(PRIORITIES, v, 'normal') }
export function getStatusMeta(v: string) { return byValue(STATUSES, v, 'pending') }
// ── Ήρεμες οπτικές ενδείξεις (χαμηλός κορεσμός, όχι «σουπερμάρκετ») ──────────
// Μόνο η κρίσιμη/υψηλή προτεραιότητα παίρνει χρώμα· οι υπόλοιπες μένουν ουδέτερες.
// ΤΟ ΒΑΡΟΣ, ΟΧΙ Η ΑΠΟΧΡΩΣΗ. Ήταν κόκκινη τελεία για «κρίσιμο», πορτοκαλί για
// «υψηλό» και γκρι για όλα τα υπόλοιπα — δηλαδή ΚΑΘΕ σειρά είχε μια χρωματιστή
// κουκκίδα, και οι δώδεκα σειρές χωρίς προθεσμία έμοιαζαν εξίσου επείγουσες με
// τις δύο που έληγαν. Τώρα η κουκκίδα εμφανίζεται μόνο όπου η προτεραιότητα
// είναι όντως ανεβασμένη: γεμάτη για κρίσιμο, περίγραμμα για υψηλό, τίποτα για
// τα υπόλοιπα. Χρώμα κρατά μόνο η εκπρόθεσμη ημερομηνία.
export function priDotColor(v: string) { return v === 'critical' ? 'var(--text-primary)' : 'var(--text-tertiary)' }
/** Δείχνεται τελεία; Μόνο για ανεβασμένη προτεραιότητα. */
export function priShowDot(v: string) { return v === 'critical' || v === 'high' }
// ΔΥΟ ΣΦΑΛΜΑΤΑ ΣΤΗΝ ΙΔΙΑ ΓΡΑΜΜΗ, ΚΑΙ ΤΟ ΔΕΥΤΕΡΟ ΕΖΗΣΕ ΤΗ ΔΙΟΡΘΩΣΗ ΤΟΥ ΠΡΩΤΟΥ.
//
// Το πρώτο ήταν η ώρα: τα `setMonth`/`setFullYear` είναι ΤΟΠΙΚΑ πάνω σε
// ημερομηνία γεννημένη σε UTC, οπότε μια μηνιαία εργασία με προθεσμία 20
// Μαρτίου έπαιρνε 19 Απριλίου και κάθε επόμενη έχανε άλλη μία μέρα.
//
// Το δεύτερο ήταν η υπερχείλιση, και έμεινε: το `setUTCMonth(+1)` πάνω σε 31
// Ιανουαρίου δίνει 31 Φεβρουαρίου, που ο JavaScript «διορθώνει» σε 3 Μαρτίου.
// Δηλαδή κάθε επαναλαμβανόμενη εργασία με προθεσμία στο τέλος του μήνα
// ολίσθαινε δύο ή τρεις μέρες μέσα στον επόμενο, κάθε φορά.
//
// Η σωστή πρόσθεση μηνών —με το κλείδωμα στην τελευταία ημέρα του μήνα— είναι
// γραμμένη και δοκιμασμένη μία φορά, στο `lib/loans/progress`. Δεν γράφεται
// δεύτερη εδώ: δύο αντίγραφα του ίδιου ημερολογιακού κανόνα αποκλίνουν.
const RECUR_MONTHS: Readonly<Record<Recurring, number>> = {
  none: 0, monthly: 1, quarterly: 3, yearly: 12,
}

export function nextDueDate(due: string, recurring: Recurring): string {
  return addCalendarMonths(due, RECUR_MONTHS[recurring]) ?? due
}
// ── Η σημείωση ως φάκελος ──────────────────────────────────────────────────
// Η στήλη `note` κρατά JSON (__cv:2) με τη σημείωση, τις υπο-εργασίες, τα σχόλια
// και τις ετικέτες. Προστίθενται τρία πράγματα ΧΩΡΙΣ αλλαγή σχήματος, γιατί η
// βάση είναι σε free tier χωρίς αντίγραφα και μια νέα στήλη δεν στήνεται εδώ:
//   • ref     — η ταυτότητα παραγόμενης υποχρέωσης, ώστε να μη γραφτεί δύο φορές
//   • src     — η επίσημη πηγή, ώστε ο χρήστης να επιβεβαιώνει μόνος του
//   • receipt — ΤΟ ΠΑΡΑΣΤΑΤΙΚΟ που δικαιολογεί το actual_cost
// Άγνωστα κλειδιά αγνοούνται από παλιότερες εκδόσεις, άρα τίποτα δεν σπάει.
export interface NotePayload {
  note: string; subtasks: SubTask[]; comments: Comment[]; tags: string[]
  ref?: string | null; src?: string | null; who?: Who | null; receipt?: ItemReceipt | null
}
// ΤΟ ΜΟΝΟ ΣΗΜΕΙΟ ΠΟΥ ΓΡΑΜΜΗ ΒΑΣΗΣ ΓΙΝΕΤΑΙ ΕΚΚΡΕΜΟΤΗΤΑ ΟΘΟΝΗΣ.
// Η βάση δέχεται κενό σε στήλες που η οθόνη θεωρεί δεδομένες (ακίνητο, χρήστης,
// κατάσταση). Τα κενά κλείνουν ΕΔΩ, μία φορά, αντί να ταξιδεύουν μέσα στην
// καρτέλα ως `null` που κανείς δεν περιμένει.
// ΤΟ `as unknown as ChecklistItem` ΕΛΕΓΕ ΨΕΜΑΤΑ ΣΤΟ ΙΔΙΟ ΤΟΥ ΤΟ ΣΧΟΛΙΟ.
// «Τα κενά κλείνουν ΕΔΩ», έγραφε — και έκλεινε επτά. Δύο ΔΕΝ έκλειναν, και το
// cast τα άφηνε να περάσουν: το `priority` και το `status` είναι γυμνό `text`
// στη βάση, χωρίς CHECK, ενώ η οθόνη τα δηλώνει ως ενώσεις τεσσάρων τιμών. Μια
// γραμμή με `priority: null` (ή με τιμή από παλιά έκδοση) έφτανε στην απόδοση
// ως τιμή που ΚΑΜΙΑ σύγκριση δεν πιάνει: η εργασία δεν έμπαινε σε κανένα
// φίλτρο, δεν έπαιρνε χρώμα και δεν εμφανιζόταν στη μαζική επιλογή.
export const asPriority = (v: string | null): Priority =>
  v === 'critical' || v === 'high' || v === 'low' ? v : 'normal'
export const asStatus = (v: string | null): Status =>
  v === 'in_progress' || v === 'done' || v === 'skipped' ? v : 'pending'
export const asRecurring = (v: string | null): Recurring =>
  v === 'monthly' || v === 'quarterly' || v === 'yearly' ? v : 'none'

export function parseItem(row: ChecklistItemsRow): ChecklistItem {
  const item: ChecklistItem = {
    ...row,
    property_id: row.property_id ?? '',
    user_id: row.user_id ?? '',
    note: row.note ?? null,
    completed: row.completed ?? false,
    created_at: row.created_at ?? '',
    estimated_cost: row.estimated_cost ?? 0,
    actual_cost: row.actual_cost ?? 0,
    priority: asPriority(row.priority),
    status: asStatus(row.status),
    recurring: asRecurring(row.recurring),
    sort_order: row.sort_order ?? 0,
  }
  try {
    const p = JSON.parse(item.note || '{}')
    if (p?.__cv === 2) return {
      ...item, note: p.note || null,
      _subtasks: p.subtasks || [], _comments: p.comments || [], _tags: p.tags || [],
      _ref: p.ref || null, _src: p.src || null, _who: p.who || null, _receipt: p.receipt || null,
    }
  } catch {}
  return { ...item, _subtasks: [], _comments: [], _tags: [], _ref: null, _src: null, _who: null, _receipt: null }
}
export function serializeNote(d: NotePayload) {
  return JSON.stringify({ __cv: 2, ...d })
}
/**
 * Η ΕΠΟΜΕΝΗ ΕΜΦΑΝΙΣΗ ΜΙΑΣ ΕΠΑΝΑΛΑΜΒΑΝΟΜΕΝΗΣ ΕΡΓΑΣΙΑΣ.
 *
 * Το ίδιο αντικείμενο δεκατεσσάρων πεδίων ήταν γραμμένο ΤΡΕΙΣ φορές μέσα στο
 * αρχείο: στη μονή ολοκλήρωση, στη μαζική, και στην αντιγραφή. Τρία αντίγραφα
 * που μπορούσαν να αποκλίνουν σιωπηλά — και μια νέα στήλη θα έπρεπε να θυμηθεί
 * κανείς να την προσθέσει και στα τρία.
 *
 * ΤΙ ΔΕΝ ΜΕΤΑΦΕΡΕΤΑΙ, ΚΑΙ ΓΙΑΤΙ: οι υποεργασίες και τα σχόλια μένουν πίσω. Η
 * νέα εμφάνιση είναι νέα δουλειά· τα τσεκαρισμένα βήματα του περασμένου εξαμήνου
 * θα την έδειχναν μισοτελειωμένη από τη γέννησή της. Οι ετικέτες, η προέλευση
 * και ο υπεύθυνος μεταφέρονται: περιγράφουν την εργασία, όχι την εκτέλεσή της.
 */
export function nextOccurrence(item: ChecklistItem, due: string | null): Record<string, unknown> {
  return {
    property_id: item.property_id, user_id: item.user_id,
    description: item.description, category: item.category, priority: item.priority,
    recurring: item.recurring, due_date: due, status: 'pending', completed: false,
    note: serializeNote({ note: '', subtasks: [], comments: [], tags: item._tags || [], ref: null, src: item._src || null, who: item._who || null, receipt: null }),
    estimated_cost: item.estimated_cost, actual_cost: 0, template_id: item.template_id, sort_order: item.sort_order,
  }
}
/** Ό,τι δεν επεξεργάζεται η φόρμα αλλά ΔΕΝ επιτρέπεται να χαθεί σε μια αποθήκευση. */
export function carryOver(item?: ChecklistItem | null): Pick<NotePayload, 'ref' | 'src' | 'who' | 'receipt'> {
  return { ref: item?._ref || null, src: item?._src || null, who: item?._who || null, receipt: item?._receipt || null }
}
// ΤΟ `actual_cost` ΔΕΝ ΕΙΝΑΙ ΠΕΔΙΟ ΤΗΣ ΦΟΡΜΑΣ, ΕΠΙΤΗΔΕΣ. Μπαίνει μόνο από
// σαρωμένο παραστατικό (ItemReceipt). Πληκτρολογημένο ποσό χωρίς συνημμένο είναι
// ακριβώς η «Απόκλιση» που έφτανε στον λογιστή ως 0 − εκτίμηση.
// Το `budget` έφυγε επίσης: γραφόταν πάντα 0 και εμφανιζόταν μόνο σε μια στήλη Excel.
export const mkEmpty = () => ({
  description: '', category: 'other', note: '', priority: 'normal' as Priority,
  due_date: '', recurring: 'none' as Recurring,
  assigned_contact_id: '', assigned_contact_name: '',
  estimated_cost: '', status: 'pending' as Status,
  subtasks: [] as SubTask[], tags: [] as string[], comments: [] as Comment[], depends_on: '',
})
