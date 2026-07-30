// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΚΚΡΕΜΟΤΗΤΕΣ ΠΟΥ ΔΕΝ ΤΙΣ ΓΡΑΦΕΙ Ο ΧΡΗΣΤΗΣ — και ο φύλακας του παραστατικού.
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΕΓΙΝΑΝ ΛΑΘΟΣ ΣΤΗΝ ΚΑΡΤΕΛΑ ΕΚΚΡΕΜΟΤΗΤΩΝ, ΚΑΙ ΖΟΥΝ ΕΔΩ ΣΩΣΤΑ
//
// 1) ΤΡΙΤΟ ΗΜΕΡΟΛΟΓΙΟ. Το TabChecklist είχε δικό του πίνακα `AADE_CALENDAR` με
//    «ΕΝΦΙΑ 1 Σεπτεμβρίου» και «Ε2 Ιανουάριος», και έγραφε ΚΑΘΕ υποχρέωση με
//    `due_date = ${έτος}-MM-01` — δηλαδή πάντα την 1η του μήνα, ημερομηνία που
//    δεν είναι προθεσμία κανενός. Ο ίδιος χρήστης έβλεπε τρεις διαφορετικές
//    ημερομηνίες για τον ίδιο φόρο σε τρεις οθόνες. Σβήστηκε. Η ΜΟΝΗ πηγή
//    θεσμικής προθεσμίας είναι το `lib/tax/greekTaxCalendar.ts`, που έχει
//    `confidence`, `official_url`, `who` και μετάθεση σε εργάσιμη ημέρα.
//
// 2) ΕΠΙΝΟΗΜΕΝΑ ΚΟΣΤΗ ΠΟΥ ΓΙΝΟΝΤΑΝ ΔΑΠΑΝΕΣ. Τα πρότυπα κρατούσαν 24 σταθερές
//    («80 € service λέβητα», «600 € συμβολαιογράφος») χωρίς πηγή, έτος ή
//    περιοχή, και κάθε μία γραφόταν ως εκκρεμής γραμμή στον πίνακα `expenses`.
//    Νούμερα που κανείς δεν μέτρησε μολύνανε τον προϋπολογισμό και το σύνολο
//    δαπανών που πάει στο Ε2. Εδώ ζει ο κανόνας που το απαγορεύει:
//    `expenseFromReceipt` επιστρέφει γραμμή δαπάνης ΜΟΝΟ όταν υπάρχει
//    παραστατικό. Χωρίς αρχείο, δεν υπάρχει ποσό.
//
// 3) «ΟΧΙ ΠΑΝΤΟΥ ΤΑ ΠΑΝΤΑ». Οι υποχρεώσεις φιλτράρονται κατά κατάσταση
//    ακινήτου, νομική μορφή και πλήθος ακινήτων (`FieldContext`). Ο ιδιώτης με
//    κενό ακίνητο δεν βλέπει «δήλωση βραχυχρόνιας διαμονής», το φυσικό πρόσωπο
//    δεν βλέπει υποχρεώσεις επιχείρησης. Ό,τι αφορά συμμόρφωση φέρει
//    `critical: true` και ΔΕΝ κρύβεται ποτέ.
//
// ΚΑΘΑΡΟ, ΧΩΡΙΣ I/O: καμία κλήση βάσης, ώστε κάθε κανόνας να είναι δοκιμάσιμος.
// ═══════════════════════════════════════════════════════════════════════════

import {
  taxObligationsHorizon, taxObligationNotes,
  type PropertyTaxProfile, type TaxObligation, type TaxObligationKind,
} from '@/lib/tax/greekTaxCalendar'
import { actionableUpdatesFor, type UpdateAudience } from '@/lib/accounting/updates2026'
import { WHO_LABEL, type Who } from '@/lib/accounting/dossier'
import type { FieldContext } from '@/lib/property/fields'

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low'

/** Η ταυτότητα μιας παραγόμενης εργασίας. Δεύτερο πάτημα → ίδιο κλειδί → καμία
 *  δεύτερη γραμμή. Το ίδιο μοτίβο με το `calendar_events.source`. */
export const TAX_REF_PREFIX = 'tax:'
export const LAW_REF_PREFIX = 'law:'
export const taxTaskRef = (id: string): string => `${TAX_REF_PREFIX}${id}`
export const lawTaskRef = (id: string): string => `${LAW_REF_PREFIX}${id}`
export const isTaxTaskRef = (ref?: string | null): boolean => !!ref && ref.startsWith(TAX_REF_PREFIX)
export const isLawTaskRef = (ref?: string | null): boolean => !!ref && ref.startsWith(LAW_REF_PREFIX)
export const isGeneratedRef = (ref?: string | null): boolean => isTaxTaskRef(ref) || isLawTaskRef(ref)

/**
 * Μια εργασία έτοιμη να γραφτεί στο `checklist_items`, χωρίς τα κλειδιά της βάσης.
 *
 * ΤΟ `estimated_cost` ΔΕΝ ΥΠΑΡΧΕΙ ΕΔΩ, ΕΠΙΤΗΔΕΣ. Καμία παραγόμενη υποχρέωση δεν
 * ξέρει πόσο κοστίζει: ο ΕΝΦΙΑ του καθενός είναι άλλος, το τιμολόγιο του
 * υδραυλικού δεν έχει γραφτεί ακόμη. Το ποσό μπαίνει ΜΟΝΟ από παραστατικό.
 */
export interface ChecklistTaskDraft {
  ref: string
  description: string
  category: string
  priority: TaskPriority
  /** ISO ή `null`. `null` σημαίνει «δεν υπάρχει προθεσμία», ΟΧΙ «1η του μήνα». */
  due_date: string | null
  who: Who
  /** Το κείμενο που βλέπει ο χρήστης: τι είναι, ποιος το κάνει, πόσο σίγουρη
   *  είναι η ημερομηνία. Ίδια διατύπωση με την Επισκόπηση και το Ημερολόγιο. */
  note: string
  /** Η επίσημη πηγή. Χωρίς αυτό ο χρήστης δεν έχει τρόπο να επιβεβαιώσει. */
  sourceUrl: string | null
  /** Συμμόρφωση: δεν κρύβεται και δεν κλειδώνεται ποτέ. */
  critical: boolean
}

// ── Φορολογικές υποχρεώσεις ────────────────────────────────────────────────

/**
 * Κατηγορία της καρτέλας ανά είδος υποχρέωσης: οι ΔΗΛΩΣΕΙΣ και οι ΕΓΓΡΑΦΕΣ
 * είναι «Νομικά / ΑΑΔΕ», οι ΠΛΗΡΩΜΕΣ και οι ΑΠΟΔΟΣΕΙΣ «Οικονομικά». Έτσι ο
 * χρήστης που ψάχνει «τι πληρώνω» δεν σκρολάρει μέσα σε δηλώσεις.
 */
const TAX_CATEGORY: Record<TaxObligationKind, string> = {
  'enfia-issue': 'legal',
  'enfia-first': 'financial',
  'enfia-last': 'financial',
  e9: 'legal',
  'income-decl': 'legal',
  'str-registry': 'legal',
  'str-climate-fee': 'financial',
}

function draftOfTaxObligation(o: TaxObligation): ChecklistTaskDraft {
  return {
    ref: taxTaskRef(o.id),
    description: o.title,
    category: TAX_CATEGORY[o.kind] || 'legal',
    // Προθεσμία του νόμου δεν μετακινείται· ανακοινωνόμενη μπορεί. Δεν
    // ουρλιάζουν και οι δύο με το ίδιο βάρος (ίδιος κανόνας με το Ημερολόγιο).
    priority: o.confidence === 'statutory' ? 'critical' : 'high',
    due_date: o.date,
    who: o.who,
    note: taxObligationNotes(o),
    sourceUrl: o.official_url,
    critical: true,
  }
}

/**
 * Οι επόμενες φορολογικές υποχρεώσεις, ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΥΠΟΧΡΕΩΣΗ.
 *
 * ΓΙΑΤΙ ΜΟΝΟ Η ΕΠΟΜΕΝΗ ΚΑΘΕ ΕΙΔΟΥΣ: ο κυλιόμενος ορίζοντας του ημερολογίου
 * περιέχει, για βραχυχρόνια, δώδεκα δηλώσεις διαμονής και δώδεκα αποδόσεις
 * τέλους ανά έτος. Γραμμένες όλες μαζί, η λίστα του χρήστη γίνεται τριάντα
 * γραμμές που δεν διαβάζει κανείς. Μπαίνει η ΕΠΟΜΕΝΗ κάθε είδους· όταν
 * ολοκληρωθεί, το ημερολόγιο δίνει την επόμενη.
 */
export function taxTaskDrafts(today: string, profile: PropertyTaxProfile): ChecklistTaskDraft[] {
  const seen = new Set<TaxObligationKind>()
  const out: ChecklistTaskDraft[] = []
  for (const o of taxObligationsHorizon(today, profile)) {
    if (o.date < today) continue          // περασμένη προθεσμία δεν είναι εκκρεμότητα
    if (seen.has(o.kind)) continue        // ήδη ταξινομημένες κατά ημερομηνία → η πρώτη είναι η επόμενη
    seen.add(o.kind)
    out.push(draftOfTaxObligation(o))
  }
  return out
}

// ── Αλλαγές νομοθεσίας ─────────────────────────────────────────────────────

/**
 * Ποια προφίλ αφορούν αυτόν τον χρήστη.
 *
 * ΚΑΘΕ ΕΙΣΟΔΟΣ ΕΙΝΑΙ ΔΗΛΩΜΕΝΗ, ΚΑΜΙΑ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ. Το `buyer` λείπει επίτηδες:
 * δεν υπάρχει πεδίο «σκοπεύω να αγοράσω», και μια μαντεψιά θα γέμιζε τη λίστα
 * του ιδιοκτήτη με υποχρεώσεις αγοραστή που δεν είναι.
 */
export function audiencesFor(ctx: FieldContext): UpdateAudience[] {
  const out: UpdateAudience[] = []
  if (ctx.status === 'rent_long') out.push('long_term')
  if (ctx.status === 'rent_short') out.push('short_term')
  if (ctx.business) out.push('business')
  if (ctx.hasLoan === true) out.push('borrower')
  return out
}

/**
 * Οι αλλαγές νομοθεσίας που ζητούν κίνηση, ως εκκρεμότητες.
 *
 * ΧΩΡΙΣ ΠΡΟΘΕΣΜΙΑ, ΕΠΙΤΗΔΕΣ. Ένας κανόνας έχει ημερομηνία ΙΣΧΥΟΣ («από
 * 1/1/2026»), όχι προθεσμία υποβολής. Αν βάζαμε την ισχύ ως `due_date`, το app
 * θα έλεγε «εκπρόθεσμο» για κάτι που δεν έχει καταληκτική ημερομηνία — και θα
 * επαναλάμβανε ακριβώς το λάθος του παλιού `AADE_CALENDAR`.
 */
export function lawTaskDrafts(ctx: FieldContext): ChecklistTaskDraft[] {
  const byId = new Map<string, ChecklistTaskDraft>()
  for (const audience of audiencesFor(ctx)) {
    for (const { update: u, action } of actionableUpdatesFor(audience)) {
      if (byId.has(u.id)) continue
      byId.set(u.id, {
        ref: lawTaskRef(u.id),
        description: action.action,
        category: 'legal',
        priority: u.severity === 'warning' ? 'critical' : 'high',
        due_date: null,
        who: action.who,
        note: [
          u.title,
          action.cost,
          `Ισχύς: ${u.effective}. Βάση: ${u.legalBasis}.`,
          `Ποιος το κάνει: ${WHO_LABEL[action.who]}.`,
        ].join(' '),
        sourceUrl: u.sourceHref || null,
        critical: true,
      })
    }
  }
  return [...byId.values()]
}

/** Όλες οι παραγόμενες υποχρεώσεις: θεσμικές προθεσμίες + αλλαγές νομοθεσίας. */
export function obligationDrafts(today: string, profile: PropertyTaxProfile, ctx: FieldContext): ChecklistTaskDraft[] {
  return [...taxTaskDrafts(today, profile), ...lawTaskDrafts(ctx)]
}

/** Όσες δεν υπάρχουν ήδη. Το κλειδί είναι το `ref`, όχι η περιγραφή: αν αλλάξει
 *  η διατύπωση του τίτλου, ο χρήστης δεν αποκτά διπλή εγγραφή. */
export function pendingDrafts(drafts: readonly ChecklistTaskDraft[], existingRefs: Iterable<string>): ChecklistTaskDraft[] {
  const have = new Set(existingRefs)
  return drafts.filter(d => !have.has(d.ref))
}

// ═══════════════════════════════════════════════════════════════════════════
// Ο ΦΥΛΑΚΑΣ ΤΟΥ ΠΑΡΑΣΤΑΤΙΚΟΥ
//
// Ο ΚΑΝΟΝΑΣ, ΣΕ ΜΙΑ ΓΡΑΜΜΗ: καμία εκκρεμότητα δεν γράφει ποσό στον πίνακα
// `expenses` χωρίς αρχείο παραστατικού. Ούτε εκτίμηση, ούτε «προγραμματισμένη
// δαπάνη», ούτε ποσό που πληκτρολογήθηκε στο χέρι χωρίς συνημμένο.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΑΠΑΡΑΒΑΤΟ: το σύνολο των δαπανών φεύγει στο Ε2 και στον λογιστή.
// Ένα νούμερο που κανείς δεν μέτρησε, μέσα σε αυτό το σύνολο, δεν είναι
// «περίπου σωστό» — είναι λάθος δήλωση με το όνομα του χρήστη πάνω.
// ═══════════════════════════════════════════════════════════════════════════

/** Το αρχείο που αποδεικνύει τη δαπάνη, όπως αποθηκεύτηκε στο Αρχείο. */
export interface ReceiptEvidence {
  /** Διαδρομή στο storage. Η ΑΠΟΔΕΙΞΗ. Κενή διαδρομή = κανένα παραστατικό. */
  path: string
  name: string
  /** Η γραμμή του Αρχείου (`property_documents.id`), όταν γράφτηκε. */
  docId?: string | null
}

/** Τι διάβασε η σάρωση, αφού το επιβεβαίωσε ο χρήστης. */
export interface ReceiptEntry {
  amount: number
  /** ISO ημερομηνία παραστατικού. */
  date: string
  description: string
  provider?: string | null
  /** Κατηγορία δαπάνης της εφαρμογής (ελληνικό λεκτικό). */
  category: string
  /** Ομάδα δαπάνης (`expense_group`). */
  group: string
  evidence: ReceiptEvidence | null
}

export interface ExpenseInsert {
  description: string
  amount: number
  category: string
  expense_group: string
  date: string
  paid: boolean
  paid_by: string
  store_vendor: string | null
  notes: string
}

/**
 * Η γραμμή δαπάνης μιας εκκρεμότητας — ή `null`.
 *
 * `null` όταν: δεν υπάρχει αρχείο παραστατικού, ή το ποσό δεν είναι θετικό, ή
 * λείπει ημερομηνία. Σε καθεμία από τις τρεις περιπτώσεις η σωστή συμπεριφορά
 * είναι να ΜΗΝ γραφτεί τίποτα, όχι να γραφτεί κάτι κατά προσέγγιση.
 */
export function expenseFromReceipt(e: ReceiptEntry): ExpenseInsert | null {
  if (!e.evidence || !e.evidence.path.trim()) return null
  if (!(typeof e.amount === 'number' && isFinite(e.amount) && e.amount > 0)) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null
  const desc = e.description.trim()
  if (!desc) return null
  return {
    description: desc,
    amount: e.amount,
    category: e.category,
    expense_group: e.group,
    date: e.date,
    // Υπάρχει παραστατικό, άρα η δαπάνη ΕΓΙΝΕ. Το «εκκρεμής δαπάνη» ήταν
    // ακριβώς το ψέμα που έγραφε το παλιό `makeTaskExpense`.
    paid: true,
    paid_by: 'owner',
    store_vendor: (e.provider || '').trim() || null,
    notes: `Από σάρωση παραστατικού · Αρχείο: ${e.evidence.name}`,
  }
}

/**
 * Το πραγματικό κόστος που καταγράφεται στην εκκρεμότητα (`actual_cost`).
 * Ίδιος φύλακας: χωρίς παραστατικό, το `actual_cost` μένει όπως ήταν.
 */
export function actualCostFromReceipt(e: ReceiptEntry): number | null {
  const row = expenseFromReceipt(e)
  return row ? row.amount : null
}

/**
 * Η απόκλιση εκτίμησης/πραγματικού, ΜΟΝΟ όταν υπάρχουν και τα δύο.
 *
 * ΤΟ ΛΑΘΟΣ ΠΟΥ ΔΙΟΡΘΩΝΕΙ: το `actual_cost` δεν είχε ποτέ τιμή και γραφόταν
 * πάντα `0`, οπότε η «Απόκλιση» στο Excel και στο PDF ήταν δομικά
 * `0 − εκτίμηση` — δηλαδή πάντα το αρνητικό της εκτίμησης, και στελνόταν στον
 * λογιστή σαν μέτρηση. Χωρίς πραγματικό κόστος δεν υπάρχει απόκλιση, υπάρχει
 * άγνωστο.
 */
export function costVariance(estimated: number, actual: number): number | null {
  if (!(estimated > 0) || !(actual > 0)) return null
  return actual - estimated
}
