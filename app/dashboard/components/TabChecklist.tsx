'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import * as properties from '@/lib/data/properties'
import * as billStore from '@/lib/data/bills'
import * as calendar from '@/lib/data/calendar'
import * as checklist from '@/lib/data/checklist'
import { BulkActionBar } from './UIComponents'
import * as loanStore from '@/lib/data/loans'
import * as contactStore from '@/lib/data/contacts'
import * as billing from '@/lib/data/billing'
import { T, fn, fe, fp, PageTitle, InfoBanner, Btn, EmptyState, Skeleton, SkeletonKPIs, isOverlayOpen, pageShell } from '@/components/Theme'
import { confirmDialog } from '@/components/confirmBus'
import { notify, notifyOk } from '@/components/Toast'
import { saved, savedData } from '@/components/dbWrite'
import { ClipboardCheck, SearchX } from 'lucide-react'
import { useReportBranding } from '@/lib/reportBranding'
import { annuityMonthly } from '@/lib/loans/recommend'
// ΜΙΑ ΠΗΓΗ ΓΙΑ ΤΙΣ ΥΠΟΧΡΕΩΣΕΙΣ ΚΑΙ ΕΝΑΣ ΦΥΛΑΚΑΣ ΓΙΑ ΤΙΣ ΔΑΠΑΝΕΣ.
// Εδώ ζούσε ΤΡΙΤΟ ημερολόγιο υποχρεώσεων (AADE_CALENDAR) με «ΕΝΦΙΑ 1 Σεπτεμβρίου»
// και «Ε2 Ιανουάριος», που έγραφε κάθε προθεσμία ως 1η του μήνα. Σβήστηκε: οι
// θεσμικές ημερομηνίες έρχονται από το lib/tax/greekTaxCalendar.ts μέσω του
// obligationTasks, με confidence, επίσημη πηγή και μετάθεση σε εργάσιμη.
import {
  obligationDrafts, pendingDrafts, isGeneratedRef, isTaxTaskRef,
} from '@/lib/checklist/obligationTasks'
import { taxProfileOf, type PropertyTaxProfile } from '@/lib/tax/greekTaxCalendar'
import { HAS_BUSINESS } from '@/lib/accounting/dossier'
import type { FieldContext } from '@/lib/property/fields'
import type { StatusRow } from '@/lib/property/status'
import type { ChecklistItemsRow } from '@/lib/supabase/tables'
import { athensToday } from '@/lib/core/time'
import SmartSuggestions from './SmartSuggestions'
import { navLabel } from '@/lib/nav/labels'
import { MSG } from '@/lib/core/dbError'

// ═══ ΟΙ ΕΚΚΡΕΜΟΤΗΤΕΣ ΣΕ ΟΚΤΩ ΑΡΧΕΙΑ, ΟΧΙ ΣΕ ΕΝΑ ══════════════════════════
// Ήταν 2.671 γραμμές και μέσα τους ζούσαν πράγματα που δεν έχουν καμία σχέση
// μεταξύ τους: το μοντέλο των εργασιών, τα έτοιμα πρότυπα, τρεις εξαγωγές των
// εξακοσίων γραμμών, η σειρά της λίστας, δύο παράθυρα και η σελίδα.
//
// Εδώ μένει η σελίδα: τι φορτώνεται, τι αποθηκεύεται, ποια φίλτρα ισχύουν και
// ποιες υποχρεώσεις προτείνονται.
import {
  CATEGORIES, PRIORITIES, STATUSES, TEMPLATES,
  type ChecklistItem, type Contact, type Priority, type Status, type Recurring,
  type ViewMode, type FilterStatus, type TabChecklistProps,
  type ProfileType, type SmartSuggestion,
} from './checklist/model'
import {
  fmtDate, isOverdue,
  nextDueDate, nextOccurrence, parseItem, serializeNote, mkEmpty, carryOver,
} from './checklist/calc'
import { FilterSelect, ExportMenu, iStyle } from './checklist/Bits'
import { ItemRow } from './checklist/ItemRow'
import { TimelineView } from './checklist/TimelineView'
import { TemplateModal } from './checklist/TemplateModal'
import { ItemModal } from './checklist/ItemModal'
import { ReceiptScanModal } from './checklist/ReceiptScanModal'
import { exportChecklistExcel, exportChecklistPDF, exportHandoverProtocol } from './checklist/reports'
import { useLoad } from '@/app/hooks/useLoad'

const supabase = createSupabaseClient()

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────






// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabChecklist({ propertyId, userId, embedded, profileType = 'individual' }: TabChecklistProps & { embedded?: boolean; profileType?: ProfileType }) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  // Ο ΔΕΙΚΤΗΣ ΦΟΡΤΩΣΗΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΟ ΠΟΙΟΥ ΑΚΙΝΗΤΟΥ ΕΙΝΑΙ Η ΛΙΣΤΑ. Ηταν
  // `setLoading(true)` στην πρώτη γραμμή της φόρτωσης, μέσα σε effect: σύγχρονη
  // γραφή και, με την αλλαγή ακινήτου, ένα καρέ με τις εκκρεμότητες του
  // προηγούμενου.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== propertyId
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCat, setFilterCat] = useState('all')
  const [filterPri, setFilterPri] = useState('all')
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [receiptItem, setReceiptItem] = useState<ChecklistItem | null>(null)
  // ΤΟ `deleteId` ΚΑΙ ΤΟ `bulkDeleteConfirm` ΣΒΗΣΤΗΚΑΝ ΜΑΖΙ ΜΕ ΤΑ ΠΑΡΑΘΥΡΑ ΤΟΥΣ.
  // Ήταν δύο καταστάσεις που δεν κρατούσαν δεδομένα: κρατούσαν «ρώτησα;». Η
  // ερώτηση ζει τώρα μέσα στο `await confirmDialog(...)`, δηλαδή στη ΓΡΑΜΜΗ που
  // κάνει τη διαγραφή, οπότε δεν υπάρχει τρόπος να μείνει «μισοανοιχτή».
  //
  // ΤΟ ΜΟΝΟ ΠΟΥ ΧΡΕΙΑΖΕΤΑΙ ΑΚΟΜΗ ΝΑ ΞΕΡΕΙ Η ΟΘΟΝΗ ΕΙΝΑΙ «ΡΩΤΑΩ ΤΩΡΑ;» και το
  // χρειάζεται για ΕΝΑ πράγμα: το Escape (βλ. τον ακροατή πληκτρολογίου πιο
  // κάτω). Ο δίαυλος επιβεβαίωσης ζει έξω από το React, οπότε δεν υπάρχει άλλος
  // τρόπος να το μάθει.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([])
  const [tenantInfo, setTenantInfo] = useState<{full_name?: string; phone?: string; afm?: string; email?: string} | null>(null)
  const [loanPayment, setLoanPayment] = useState(0)
  // ── ΤΙ ΕΧΕΙ ΕΠΙΛΕΞΕΙ Ο ΧΡΗΣΤΗΣ, ΚΑΙ ΤΙ ΒΛΕΠΕΙ ΓΙ' ΑΥΤΟ ────────────────────
  // Η κατάσταση του ακινήτου, η νομική μορφή, τα βιβλία και το πλήθος ακινήτων.
  // Κρίνουν ΠΟΙΑ πρότυπα εμφανίζονται και ΠΟΙΕΣ υποχρεώσεις προτείνονται: ο
  // ιδιώτης με κενό ακίνητο δεν βλέπει «δήλωση βραχυχρόνιας διαμονής», το φυσικό
  // πρόσωπο δεν βλέπει υποχρεώσεις επιχείρησης. Καμία τιμή δεν μαντεύεται —
  // όλες διαβάζονται από ό,τι έχει δηλώσει ο χρήστης.
  const [statusRow, setStatusRow] = useState<StatusRow | null>(null)
  const [legalForm, setLegalForm] = useState<string>('individual')
  const [bookkeeping, setBookkeeping] = useState<string>('none')
  const [propertyCount, setPropertyCount] = useState(1)
  const prevPct = useRef(0)
  const branding = useReportBranding(userId)

  // Το τοπικό toast έφευγε στον κοινό host: ο δικός του setTimeout δεν καθαριζόταν
  // ποτέ σε unmount (διαρροή) και το z-index 9998 έκανε αυτή την καρτέλα να απαντά
  // αλλιώς από κάθε άλλη.
  // ΜΙΑ ΦΟΡΤΩΣΗ ΤΗ ΦΟΡΑ, ΚΑΙ ΚΕΡΔΙΖΕΙ Η ΝΕΟΤΕΡΗ. Η `fetchAll` ξαναχτίζεται σε κάθε
  // αλλαγή ακινήτου και το effect την ξανακαλεί, αλλά η ΠΡΟΗΓΟΥΜΕΝΗ εκτέλεση
  // συνέχιζε: όποια απάντηση προσγειωνόταν δεύτερη, αυτή έγραφε. Ο χρήστης έβλεπε
  // τις εκκρεμότητες, τις επαφές και τη δόση δανείου του άλλου ακινήτου και ένα
  // από τα ερωτήματα ΓΡΑΦΕΙ (σημειώνει τον ΕΝΦΙΑ πληρωμένο) — σε εργασία που
  // μπορεί να ανήκε αλλού.
  // Η ΑΚΥΡΩΣΗ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟΝ ΚΑΛΟΥΝΤΑ, γιατί εκεί ζει και ο ανταγωνισμός: το
  // effect από κάτω ξέρει πότε η δική του εκτέλεση έπαψε να ισχύει. Οι
  // χειροκίνητες ανανεώσεις (μετά από αποθήκευση ή διαγραφή) δεν έχουν τέτοιο
  // πρόβλημα και δεν περνούν τίποτα.
  const fetchAll = useCallback(async (fresh: () => boolean = () => true) => {
    // Ο ενοικιαστής-επαφή ζητιόταν ΔΥΟ φορές μέσα σε αυτή τη φόρτωση: μια εδώ
    // για να κριθεί αν προτείνεται λίστα check-in και μια παρακάτω για τηλέφωνο
    // και email. Ίδια γραμμή, δύο ταξίδια. Τώρα μία, με όλες τις στήλες.
    const [itemData, contactData, tenantContact] = await Promise.all([
      checklist.all<ChecklistItemsRow>(supabase, propertyId, '*', userId),
      contactStore.ofUser<Contact>(supabase, userId, 'id,full_name,role,phone,property_id'),
      contactStore.withRole<{ full_name?: string; phone?: string; email?: string }>(
        supabase, propertyId, 'tenant', 'full_name,phone,email', userId),
    ])
    // Οι γραμμές παίρνουν τον τύπο του πίνακα· το `parseItem` είναι η μία πύλη
    // που τις μετατρέπει στο σχήμα της οθόνης, με τα κενά συμπληρωμένα.
    const rows = (itemData || []) as ChecklistItemsRow[]
    if (!fresh()) return
    setItems(rows.map(parseItem))
    // Χαρτοφυλάκιο-wide λίστα επαφών ώστε να επιλέγεται π.χ. ο ψυκτικός όπου κι αν είναι
    // αποθηκευμένος· οι επαφές του τρέχοντος ακινήτου προηγούνται (σταθερή ταξινόμηση).
    setContacts([...contactData].sort((a, b) =>
      (a.property_id === propertyId ? 0 : 1) - (b.property_id === propertyId ? 0 : 1)
    ))
    const existingTemplates = new Set(rows.map(i => i.template_id).filter(Boolean))
    const suggestions: SmartSuggestion[] = []
    if (tenantContact && !existingTemplates.has('checkin'))
      suggestions.push({ title: 'Νέος Ενοικιαστής', reason: 'Βρέθηκε ενοικιαστής, δημιούργησε check-in checklist', templateKey: 'checkin' })
    if (!rows.some(i => i.category === 'maintenance') && !existingTemplates.has('maintenance'))
      suggestions.push({ title: 'Ετήσια Συντήρηση', reason: 'Καμία εργασία συντήρησης ακόμη', templateKey: 'maintenance' })
    // Ο τίτλος ακολουθεί την ετικέτα του προτύπου: το «Νομικά / ΑΑΔΕ» έγινε
    // «Έγγραφα ακινήτου» όταν οι φορολογικές υποχρεώσεις έφυγαν από το πρότυπο
    // και πήγαν στο ένα ημερολόγιο. Δύο ονόματα για το ίδιο κουμπί μπερδεύουν.
    if (!rows.some(i => i.category === 'legal'))
      suggestions.push({ title: TEMPLATES.legal.label, reason: 'Ασφαλιστήριο, ΠΕΑ, βεβαίωση μηχανικού', templateKey: 'legal' })
    setSmartSuggestions(suggestions.slice(0, 2))

    setTenantInfo(tenantContact)

    try {
      // Η μηνιαία δόση υπολογίζεται από ποσό/επιτόκιο/διάρκεια (τοκοχρεολυτική
      // φόρμουλα) — ίδια πηγή με την Επισκόπηση, άθροισμα ενεργών δανείων.
      // Ποιο δάνειο είναι «ενεργό» δεν κρίνεται εδώ: ο κανόνας είναι ένας και
      // ζει στο στρώμα, μαζί με τη μετατροπή σε ποσό και επιτόκιο.
      const loans = await loanStore.ofProperty(supabase, propertyId, userId, { activeOnly: true })
      if (!fresh()) return
      setLoanPayment(
        loans.reduce((sum,l)=>sum+annuityMonthly(Number(l.amount)||0,Number(l.rate)||0,Number(l.years)||0),0)
      )
    } catch (_) {}

    // Η ΚΑΤΑΣΤΑΣΗ ΤΟΥ ΑΚΙΝΗΤΟΥ ΚΑΙ Η ΝΟΜΙΚΗ ΜΟΡΦΗ, από τη μία πηγή τους. Όλα
    // best-effort: αν δεν διαβαστούν, το προφίλ πέφτει στο ασφαλέστερο
    // («ιδιοκτήτης», φυσικό πρόσωπο) και εμφανίζονται ΛΙΓΟΤΕΡΑ, ποτέ περισσότερα.
    try {
      const [propRow, bp, count] = await Promise.all([
        properties.one<StatusRow>(supabase, propertyId, 'status_detail,rental_mode', userId),
        billing.profile<{ legal_form: string | null; bookkeeping: string | null }>(supabase, userId, 'legal_form,bookkeeping'),
        properties.count(supabase, userId),
      ])
      if (!fresh()) return
      setStatusRow((propRow as StatusRow | null) || null)
      setLegalForm(bp?.legal_form || 'individual')
      setBookkeeping(bp?.bookkeeping || 'none')
      setPropertyCount(Math.max(1, count || 1))
    } catch (_) {}

    try {
      // Ο πίνακας `bills` ΔΕΝ έχει `status` ούτε `description`: έχει `paid`
      // (boolean), `name` και `notes`. Και οι δύο αναφορές ήταν άκυρες, άρα το
      // ερώτημα απορριπτόταν ολόκληρο και ο ΕΝΦΙΑ ΔΕΝ σημειωνόταν ποτέ ως
      // πληρωμένος στις εκκρεμότητες — ο ιδιοκτήτης έβλεπε για πάντα ανοιχτή
      // υποχρέωση που είχε ήδη πληρώσει.
      const enfiaBillData = await billStore.matchingText<{ id: string; paid: boolean | null }>(
        supabase, propertyId, 'id,paid', 'name.ilike.%ΕΝΦΙΑ%,name.ilike.%enfia%,notes.ilike.%ΕΝΦΙΑ%', userId)
      const isPaid = enfiaBillData[0]?.paid === true
      // Η ΓΡΑΦΗ ΕΙΝΑΙ ΤΟ ΣΟΒΑΡΟ: χωρίς αυτόν τον έλεγχο, η καθυστερημένη απάντηση
      // του προηγούμενου ακινήτου σημείωνε πληρωμένη εργασία άλλου ακινήτου.
      if (isPaid && itemData && fresh()) {
        const enfiaTask = rows.find(i => i.description?.toLowerCase().includes('ενφια') && i.status !== 'done')
        if (enfiaTask) {
          await saved('Ο ΕΝΦΙΑ δεν σημειώθηκε πληρωμένος',
            checklist.markDone(supabase, enfiaTask.id))
        }
      }
    } catch (_) {}
    if (fresh()) setLoadedFor(propertyId)
  }, [propertyId, userId])

  // Η ΑΚΥΡΩΣΗ ΜΕΤΑΚΟΜΙΖΕΙ ΜΕΣΑ ΣΤΗ ΦΟΡΤΩΣΗ. Ηταν `let alive` στο effect, δηλαδή
  // το effect έπρεπε να ξέρει τι σημαίνει «άκυρη απάντηση». Ενας αύξων αριθμός
  // εκτέλεσης λέει το ίδιο πράγμα χωρίς να το ξέρει κανείς άλλος: γράφει μόνο
  // η ΤΕΛΕΥΤΑΙΑ φόρτωση που ξεκίνησε. Η απάντηση του προηγούμενου ακινήτου, που
  // φτάνει αργότερα, δεν γράφει τίποτα.
  const runId = useRef(0)
  const boot = useCallback(async () => {
    const id = runId.current + 1
    runId.current = id
    await fetchAll(() => runId.current === id)
  }, [fetchAll])
  useLoad(boot)

  // ── ΤΟ ESCAPE ΑΝΗΚΕΙ ΣΤΗΝ ΕΠΙΚΑΛΥΨΗ ΠΟΥ ΕΙΝΑΙ ΑΝΟΙΧΤΗ ─────────────────────
  // Όσο τα παράθυρα αυτής της οθόνης ήταν χειρόγραφα, ΚΑΝΕΝΑ δεν άκουγε Escape:
  // το πλήκτρο είχε εδώ μία μόνο δουλειά, να βγάζει από τη λειτουργία επιλογής.
  // Από τη στιγμή που έγιναν <Modal> και confirmDialog, το ΙΔΙΟ πάτημα κάνει
  // δύο πράγματα — και τα δύο ακούγονται στο `document`, με τον δικό μας
  // ακροατή να τρέχει ΠΡΩΤΟΣ επειδή γράφτηκε πρώτος. Ο χρήστης που διάλεξε δέκα
  // εργασίες, πάτησε «Διαγραφή» και μετά μετάνιωσε με Escape, έχανε την ερώτηση
  // ΚΑΙ τις δέκα επιλογές: ακύρωνε μια διαγραφή και πλήρωνε ξαναδιαλέγοντας τα
  // πάντα. Όσο υπάρχει ανοιχτή επικάλυψη, το Escape είναι δικό της και μόνο.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isOverlayOpen()) return
      if (e.key === 'Escape' && (selected.size > 0 || selectMode)) { setSelected(new Set()); setSelectMode(false) }
    }
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler)
  }, [selected, selectMode])

  // Έξοδος από τη λειτουργία επιλογής: καθαρίζει και την τρέχουσα επιλογή.
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }


  // ── ΤΟ ΠΛΑΙΣΙΟ ΤΟΥ ΧΡΗΣΤΗ, ΚΑΙ ΟΙ ΥΠΟΧΡΕΩΣΕΙΣ ΠΟΥ ΛΕΙΠΟΥΝ ────────────────
  // `taxProfileOf` και `readStatus` ζουν στη μία πηγή τους: καμία δεύτερη
  // ερμηνεία του `rental_mode` εδώ μέσα.
  const taxProfile: PropertyTaxProfile = useMemo(() => taxProfileOf(statusRow), [statusRow])
  const fieldCtx: FieldContext = useMemo(() => ({
    status: statusRow ? (taxProfile === 'short_term' ? 'rent_short' : taxProfile === 'long_term' ? 'rent_long' : (statusRow.status_detail === 'own_use' ? 'own_use' : statusRow.status_detail === 'renovation' ? 'renovation' : statusRow.status_detail === 'for_sale' ? 'for_sale' : statusRow.status_detail === 'disputed' ? 'disputed' : 'vacant')) : 'vacant',
    business: HAS_BUSINESS.has(legalForm),
    doubleEntry: bookkeeping === 'double_entry',
    propertyCount,
    hasLoan: loanPayment > 0,
  }), [statusRow, taxProfile, legalForm, bookkeeping, propertyCount, loanPayment])

  // Όσες υποχρεώσεις ΔΕΝ υπάρχουν ήδη στη λίστα. Το κλειδί είναι το `ref`, ώστε
  // δεύτερο πάτημα να μην γράφει διπλότυπα ούτε όταν αλλάξει η διατύπωση.
  // ═══ Η ΙΔΙΑ ΠΡΟΘΕΣΜΙΑ, ΔΥΟ ΦΟΡΕΣ, ΣΕ ΔΥΟ ΠΙΝΑΚΕΣ ═══════════════════════════
  // Οι θεσμικές προθεσμίες βγαίνουν από ΜΙΑ πηγή (greekTaxCalendar), αλλά τις
  // γράφουν ΔΥΟ οθόνες σε δύο πίνακες: το Ημερολόγιο σε `calendar_events` με
  // κλειδί `tax:<id>`, οι Εκκρεμότητες σε `checklist_items` με το ίδιο `<id>`.
  // Όποιος πάτησε και τα δύο κουμπιά έβλεπε τον ίδιο ΕΝΦΙΑ δύο φορές, με δύο
  // ελαφρώς διαφορετικούς τίτλους και δεν είχε τρόπο να καταλάβει ότι είναι
  // το ίδιο πράγμα.
  //
  // Η λύση δεν είναι να διαγραφεί το ένα: και οι δύο οθόνες έχουν λόγο να τις
  // δείχνουν. Είναι να μη ΠΡΟΤΕΙΝΕΤΑΙ ξανά ό,τι υπάρχει ήδη αλλού. Το «Λείπουν
  // Ν υποχρεώσεις» μετρά πλέον μόνο όσες δεν έχει ούτε το ημερολόγιο.
  const [calendarTaxRefs, setCalendarTaxRefs] = useState<string[]>([])
  useEffect(() => {
    if (!propertyId) return
    let alive = true
    ;(async () => {
      // Το κλειδί είναι ΤΟ ΙΔΙΟ και στους δύο πίνακες: `tax:<id>`. Το `source`
      // του γεγονότος μπαίνει αυτούσιο· κόβοντας το πρόθεμα δεν θα ταίριαζε ποτέ.
      const refs = await calendar.sources(supabase, propertyId, { prefix: 'tax:' })
      if (alive) setCalendarTaxRefs(refs)
    })()
    return () => { alive = false }
  }, [propertyId, supabase])

  const pendingObligations = useMemo(() => {
    const today = athensToday()
    const have = [
      ...items.map(i => i._ref).filter((r): r is string => !!r),
      ...calendarTaxRefs,
    ]
    return pendingDrafts(obligationDrafts(today, taxProfile, fieldCtx), have)
  }, [items, taxProfile, fieldCtx, calendarTaxRefs])
  /** Η πρώτη προθεσμία που λείπει. Ένα όνομα και μια ημερομηνία πείθουν· ένα
   *  σκέτο πλήθος δεν λέει τίποτα σε κανέναν. */
  const nextObligation = useMemo(
    () => pendingObligations.filter(d => !!d.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0] || null,
    [pendingObligations],
  )

  // ── ΤΟ ΚΥΚΛΩΜΑ, ΧΩΡΙΣ ΤΟ ΣΚΕΛΟΣ ΤΩΝ ΨΕΥΤΙΚΩΝ ΔΑΠΑΝΩΝ ──────────────────────
  // Εργασία με προθεσμία → γεγονός ημερολογίου (υπενθύμιση email). ΤΕΛΟΣ.
  // Εδώ υπήρχε και `makeTaskExpense`, που έγραφε την ΕΚΤΙΜΗΣΗ ως εκκρεμή γραμμή
  // στον πίνακα `expenses` με σημείωση «Προγραμματισμένη εκκρεμότητα». Δηλαδή
  // κάθε φόρτωση προτύπου μόλυνε τον προϋπολογισμό και το σύνολο δαπανών που πάει
  // στο Ε2 με νούμερα που κανείς δεν μέτρησε. Σβήστηκε ολόκληρο. Δαπάνη γράφεται
  // ΜΟΝΟ από το ReceiptScanModal και μόνο με παραστατικό (expenseFromReceipt).
  //
  // Το `amount` του γεγονότος έγινε επίσης null: ένα ημερολόγιο που δείχνει
  // «300 €» σε μια υπενθύμιση χωρίς παραστατικό λέει το ίδιο ψέμα πιο ήσυχα.
  const calPriorityOf = (p: Priority) => (p === 'normal' ? 'medium' : p)
  const taskTitleOf = (it: { description: string; assigned_contact_name?: string | null }) => (it.assigned_contact_name ? `${it.description} · ${it.assigned_contact_name}` : it.description)
  const makeTaskCal = async (it: { description: string; assigned_contact_name?: string | null; due_date: string | null; priority: Priority; recurring: Recurring; estimated_cost: number }): Promise<string | null> => {
    if (!it.due_date) return null
    const data = await savedData<{ id?: string }>('Η εκκρεμότητα δεν μπήκε στο ημερολόγιο',
      calendar.add(supabase, { propertyId, userId }, 'checklist', { title: taskTitleOf(it), notes: it.estimated_cost > 0 ? `Δική σου εκτίμηση κόστους ${fe(it.estimated_cost)}, χωρίς παραστατικό` : null, category: 'maintenance', event_date: it.due_date, priority: calPriorityOf(it.priority), recurring: it.recurring !== 'none' }))
    return data?.id || null
  }

  const saveItem = async (form: ReturnType<typeof mkEmpty>) => {
    // Το `ref`/`src`/`who`/`receipt` ταξιδεύουν μαζί: μια αποθήκευση από τη φόρμα
    // δεν επιτρέπεται να ξεκολλήσει το παραστατικό ή την πηγή από την υποχρέωση.
    const noteJson = serializeNote({
      note: form.note, subtasks: form.subtasks, comments: form.comments, tags: form.tags,
      ...carryOver(editItem),
    })
    const done = form.status === 'done'
    const payload = {
      property_id: propertyId, user_id: userId,
      description: form.description.trim(), category: form.category, note: noteJson,
      priority: form.priority, due_date: form.due_date || null,
      recurring: form.recurring, assigned_contact_id: form.assigned_contact_id || null,
      assigned_contact_name: form.assigned_contact_name || null,
      // ΤΟ `actual_cost` ΔΕΝ ΓΡΑΦΕΤΑΙ ΑΠΟ ΤΗ ΦΟΡΜΑ. Πριν, γραφόταν πάντα
      // `parseFloat(form.actual_cost) || 0` από ένα πεδίο που δεν είχε input,
      // δηλαδή σταθερό 0 — και έφτιαχνε την «Απόκλιση» που πήγαινε στον λογιστή.
      estimated_cost: parseFloat(form.estimated_cost) || 0,
      status: form.status, depends_on: form.depends_on || null,
      completed: done, completed_at: done ? new Date().toISOString() : null,
    }
    if (editItem) {
      // Η ΚΥΡΙΑ ΑΠΟΘΗΚΕΥΣΗ ΣΤΑΜΑΤΑ ΤΗ ΡΟΗ ΟΤΑΝ ΑΠΟΤΥΧΕΙ. Πριν, μια ενημέρωση που
      // απορριπτόταν από RLS δεν έλεγε τίποτα: η φόρμα έκλεινε και το μήνυμα
      // «Η εκκρεμότητα ενημερώθηκε» εμφανιζόταν κανονικά.
      if (!await saved('Η εκκρεμότητα δεν ενημερώθηκε',
          checklist.update(supabase, editItem.id, payload))) return
      // Reconcile συνδεδεμένο event: ενημέρωση / δημιουργία / διαγραφή αν αφαιρέθηκε η προθεσμία.
      // Οι φορολογικές υποχρεώσεις ΔΕΝ αποκτούν δικό τους event από εδώ: το γράφει
      // η Επισκόπηση/Ημερολόγιο με κλειδί `tax:<id>` και θα ήταν διπλότυπο.
      if (editItem.calendar_event_id) {
        if (payload.due_date) await saved('Η υπενθύμιση στο ημερολόγιο δεν ενημερώθηκε', calendar.update(supabase, editItem.calendar_event_id, { title: taskTitleOf(payload), event_date: payload.due_date, priority: calPriorityOf(payload.priority), recurring: payload.recurring !== 'none' }))
        else if (await saved('Η υπενθύμιση δεν αφαιρέθηκε από το ημερολόγιο', calendar.remove(supabase, editItem.calendar_event_id))) {
          await saved('Ο σύνδεσμος με το ημερολόγιο δεν καθαρίστηκε', checklist.linkEvent(supabase, editItem.id, null))
        }
      } else if (payload.due_date && !isGeneratedRef(editItem._ref)) { const c = await makeTaskCal({ ...payload, estimated_cost: payload.estimated_cost }); if (c) await saved(MSG.calendarLink, checklist.linkEvent(supabase, editItem.id, c)) }
    } else {
      const ins = await savedData<{ id?: string }>('Η εκκρεμότητα δεν προστέθηκε',
        checklist.addReturning(supabase, payload))
      if (!ins) return
      const newId = ins.id
      if (newId && payload.due_date) {
        const calId = await makeTaskCal({ ...payload, estimated_cost: payload.estimated_cost })
        if (calId) await saved(MSG.calendarLink, checklist.linkEvent(supabase, newId, calId))
      }
    }
    setShowAddModal(false); setEditItem(null); fetchAll()
    notifyOk(editItem ? 'Η εκκρεμότητα ενημερώθηκε' : payload.due_date ? 'Προστέθηκε, μπήκε και στο ημερολόγιο' : 'Η εκκρεμότητα προστέθηκε')
  }

  const togglingRef = useRef<Set<string>>(new Set())
  const toggleItem = async (item: ChecklistItem) => {
    if (togglingRef.current.has(item.id)) return // guard: double-click δεν διπλασιάζει επαναλαμβανόμενες/κύκλωμα
    togglingRef.current.add(item.id)
    try {
      const newStatus: Status = item.status === 'done' ? 'pending' : 'done'
      // Το τσεκάρισμα είναι η πιο συχνή ενέργεια της οθόνης. Αν αποτύχει σιωπηλά,
      // ο χρήστης βλέπει το κουτάκι γεμάτο, φεύγει, γυρίζει και το βρίσκει άδειο.
      if (!await saved('Η κατάσταση δεν αποθηκεύτηκε',
          checklist.setStatus(supabase, item.id, newStatus))) return
      if (newStatus === 'done') {
        // ΤΟ ΠΑΡΑΣΤΑΤΙΚΟ ΔΕΝ ΞΕ-ΠΛΗΡΩΝΕΤΑΙ ΚΑΙ ΔΕΝ ΞΑΝΑ-ΠΛΗΡΩΝΕΤΑΙ. Εδώ η
        // ολοκλήρωση έκανε `expenses.paid = true` και η αναίρεση `paid = false`.
        // Έβγαζε νόημα όσο η δαπάνη ήταν μια εκτίμηση που «θα γίνει»· τώρα η
        // δαπάνη υπάρχει μόνο όταν υπάρχει τιμολόγιο και ένα τιμολόγιο που
        // πληρώθηκε δεν γίνεται απλήρωτο επειδή ξανάνοιξε μια εκκρεμότητα.
        if (item.calendar_event_id) await saved('Το ημερολόγιο δεν ενημερώθηκε', calendar.update(supabase, item.calendar_event_id, { status: 'paid' }))
        if (item.recurring !== 'none' && item.due_date) {
          const newDue = nextDueDate(item.due_date, item.recurring)
          // Η επόμενη εμφάνιση ξεκινά ΧΩΡΙΣ παραστατικό και χωρίς πραγματικό
          // κόστος: το τιμολόγιο του περασμένου έτους δεν ισχύει για το επόμενο.
          const rec = await savedData<{ id?: string }>('Η επόμενη επανάληψη δεν δημιουργήθηκε', checklist.addReturning(supabase, nextOccurrence(item, newDue)))
          const recId = rec?.id
          if (recId && !isGeneratedRef(item._ref)) { const c = await makeTaskCal({ ...item, due_date: newDue }); if (c) await saved(MSG.calendarLink, checklist.linkEvent(supabase, recId, c)) }
          if (recId) notifyOk(`Ολοκληρώθηκε, Επόμενο: ${fmtDate(newDue)}`)
        }
      } else if (item.calendar_event_id) {
        await saved('Το ημερολόγιο δεν ενημερώθηκε', calendar.update(supabase, item.calendar_event_id, { status: 'pending' }))
      }
      await fetchAll()
    } finally { togglingRef.current.delete(item.id) }
  }

  const duplicateItem = async (item: ChecklistItem) => {
    // Το αντίγραφο ΔΕΝ κληρονομεί ούτε το παραστατικό ούτε την ταυτότητα
    // υποχρέωσης: ένα τιμολόγιο ανήκει σε μία δαπάνη και δύο γραμμές με το ίδιο
    // `ref` θα σήμαιναν διπλή υποχρέωση.
    if (!await saved('Η εργασία δεν αντιγράφηκε', checklist.addMany(supabase, [{ ...nextOccurrence(item, item.due_date), description: item.description + ' (αντίγραφο)', note: serializeNote({ note: '', subtasks: item._subtasks || [], comments: [], tags: item._tags || [], ref: null, src: item._src || null, who: item._who || null, receipt: null }), sort_order: (item.sort_order || 0) + 1 }]))) return
    fetchAll(); notifyOk('Η εργασία αντιγράφηκε')
  }

  const deleteItem = async (id: string) => {
    // Η ΕΡΩΤΗΣΗ ΜΠΗΚΕ ΜΕΣΑ ΣΤΗ ΔΙΑΓΡΑΦΗ. Πριν, το κουμπί της σειράς άναβε ένα
    // χειρόγραφο παράθυρο 14 γραμμών και ΕΚΕΙΝΟ καλούσε το `deleteItem` — μια
    // `deleteItem` που, καλεσμένη από αλλού, θα έσβηνε ΧΩΡΙΣ να ρωτήσει. Τώρα η
    // εγγύηση είναι της συνάρτησης, όχι της οθόνης.
    if (!await confirmDialog({ title: 'Διαγραφή εργασίας;', message: 'Αυτή η ενέργεια δεν αναιρείται.', confirmLabel: 'Διαγραφή', tone: 'negative' })) return
    const it = items.find(i => i.id === id)
    if (it?.calendar_event_id) await saved('Η υπενθύμιση δεν αφαιρέθηκε από το ημερολόγιο', calendar.remove(supabase, it.calendar_event_id))
    // Η ΔΑΠΑΝΗ ΜΕ ΠΑΡΑΣΤΑΤΙΚΟ ΕΠΙΖΕΙ ΤΗΣ ΕΚΚΡΕΜΟΤΗΤΑΣ. Εδώ διαγραφόταν η
    // συνδεδεμένη γραμμή των Δαπανών (όσο ήταν απλήρωτη εκτίμηση, σωστό). Τώρα
    // κάθε συνδεδεμένη δαπάνη έχει τιμολόγιο πίσω της: το χρήμα ξοδεύτηκε
    // πραγματικά και δεν παύει να ξοδεύτηκε όταν σβήνεται μια εργασία.
    // Η διαγραφή που «πέτυχε» χωρίς να πετύχει είναι η χειρότερη: ο χρήστης
    // βλέπει «διαγράφηκε», η γραμμή επιστρέφει στην επόμενη ανανέωση.
    if (!await saved('Η εκκρεμότητα δεν διαγράφηκε', checklist.remove(supabase, id))) return
    setSelected(s => { const n = new Set(s); n.delete(id); return n }); fetchAll(); notify('Η εκκρεμότητα διαγράφηκε')
  }

  const addToCalendar = async (item: ChecklistItem) => {
    // Ο τίτλος του event περιλαμβάνει την ανατεθειμένη επαφή, ώστε στο Ημερολόγιο να
    // φαίνεται αμέσως ποιος συνεργάτης αναλαμβάνει (π.χ. «Service κλιματιστικών — Γ. Ψυκτικός»).
    const title = item.assigned_contact_name ? `${item.description} · ${item.assigned_contact_name}` : item.description
    // Το Ημερολόγιο δέχεται low|medium|high|critical — το checklist έχει και «normal».
    // Χαρτογράφηση normal → medium, αλλιώς το Ημερολόγιο κρασάρει σε άγνωστη προτεραιότητα.
    // Ιδempotent: αν υπάρχει ήδη συνδεδεμένο event, μην δημιουργείς διπλότυπο.
    if (item.calendar_event_id) { notify('Ήδη στο ημερολόγιο', { tone: 'info' }); return }
    const calPriority = item.priority === 'normal' ? 'medium' : item.priority
    const data = await savedData<{ id?: string }>('Η εκκρεμότητα δεν μπήκε στο ημερολόγιο',
      calendar.add(supabase, { propertyId, userId }, 'checklist', { title, event_date: item.due_date || athensToday(), category: 'maintenance', priority: calPriority, recurring: item.recurring !== 'none' }))
    const calId = data?.id
    if (!calId) return
    // Χωρίς τον σύνδεσμο, η επόμενη προσθήκη θα έφτιαχνε δεύτερο γεγονός για το ίδιο.
    if (!await saved(MSG.calendarLink,
      checklist.linkEvent(supabase, item.id, calId))) return
    fetchAll()
    notifyOk(item.assigned_contact_name ? `Προγραμματίστηκε στο Ημερολόγιο: ${item.assigned_contact_name}` : 'Προστέθηκε στο Ημερολόγιο')
  }

  // ── ΟΙ ΥΠΟΧΡΕΩΣΕΙΣ ΠΟΥ ΠΡΟΚΥΠΤΟΥΝ ΑΠΟ ΤΟΝ ΝΟΜΟ ─────────────────────────────
  // Στη θέση του `loadAADECalendar`, που έγραφε δέκα σταθερές γραμμές με
  // `due_date = ${έτος}-MM-01` — ημερομηνία που δεν ήταν προθεσμία κανενός — και
  // αντιφάσκε με το φορολογικό ημερολόγιο της ίδιας εφαρμογής σε δύο άλλες οθόνες.
  //
  // Τώρα: το `obligationTasks` δίνει τις υποχρεώσεις αυτού του ακινήτου (μία
  // γραμμή ανά υποχρέωση, με πραγματική ημερομηνία, επίσημη πηγή, «ποιος το
  // κάνει») και τις αλλαγές νομοθεσίας που ζητούν κίνηση. Το `ref` κάνει την
  // ενέργεια επαναληπτική χωρίς διπλότυπα: δεύτερο πάτημα δεν γράφει τίποτα.
  // Χωρίς `estimated_cost`: καμία υποχρέωση δεν ξέρει πόσο κοστίζει.
  const loadObligations = async () => {
    const fresh = pendingObligations
    if (fresh.length === 0) { notify('Δεν λείπει καμία υποχρέωση', { tone: 'info' }); return }
    const rows = fresh.map((d, i) => ({
      property_id: propertyId, user_id: userId,
      description: d.description, category: d.category, priority: d.priority,
      recurring: 'none' as Recurring, status: 'pending', completed: false,
      due_date: d.due_date,
      note: serializeNote({
        note: d.note, subtasks: [], comments: [],
        tags: isTaxTaskRef(d.ref) ? ['ΑΑΔΕ'] : ['Νομοθεσία'],
        ref: d.ref, src: d.sourceUrl, who: d.who, receipt: null,
      }),
      estimated_cost: 0, actual_cost: 0, sort_order: i,
      template_id: isTaxTaskRef(d.ref) ? 'tax_calendar' : 'legal_updates',
    }))
    const { error } = await checklist.addMany(supabase, rows)
    if (error) { notify('Δεν προστέθηκαν οι υποχρεώσεις. Δοκίμασε ξανά.', { tone: 'negative' }); return }
    fetchAll()
    notifyOk(`Προστέθηκαν ${fresh.length} ${fresh.length === 1 ? 'υποχρέωση' : 'υποχρεώσεις'}, με ημερομηνία και πηγή`)
  }

  // ΔΥΟ ΕΡΩΤΗΜΑΤΑ, ΟΧΙ ΕΝΑ ΑΝΑ ΕΡΓΑΣΙΑ.
  // Ήταν σειριακός βρόχος με ένα INSERT ανά γραμμή προτύπου: σε πρότυπο είκοσι
  // εργασιών, είκοσι διαδοχικές διαδρομές στη βάση, η μία μετά την άλλη. Στο
  // κινητό με σύνδεση κινητής τηλεφωνίας αυτό είναι δευτερόλεπτα αναμονής για
  // μία ενέργεια που ο χρήστης θεωρεί στιγμιαία. Το αρχείο ήδη το ήξερε: το
  // `bulkComplete` δέκα γραμμές πιο κάτω το γράφει ρητά στο σχόλιό του.
  //
  // Ο ΛΟΓΟΣ ΠΟΥ ΕΓΙΝΑΝ ΔΥΟ ΚΑΙ ΟΧΙ ΕΝΑ: οι εργασίες αλυσιδώνονται μεταξύ τους
  // (`depends_on` δείχνει σε γραμμή του ίδιου προτύπου) και το αναγνωριστικό
  // της γεννιέται από τη βάση. Πρώτα μπαίνουν όλες, μετά δένονται οι κρίκοι.
  const loadTemplate = async (key: string) => {
    const tpl = TEMPLATES[key]; if (!tpl) return
    // `estimated_cost: 0` και όχι σταθερά προτύπου: τα 24 επινοημένα κόστη
    // σβήστηκαν. Ό,τι κόστος μπει, το βάζει ο χρήστης ή το τιμολόγιο.
    const rows = tpl.items.map((tItem, i) => ({
      property_id: propertyId, user_id: userId, description: tItem.description, category: tItem.category,
      priority: tItem.priority, recurring: tItem.recurring || 'none', status: 'pending', completed: false,
      note: serializeNote({ note: '', subtasks: [], comments: [], tags: [] }),
      estimated_cost: 0, actual_cost: 0, sort_order: i, template_id: key, depends_on: null,
    }))
    const inserted = await savedData<{ id: string; sort_order: number }[]>('Το πρότυπο δεν φορτώθηκε',
      checklist.addManyReturning(supabase, rows))
    if (!inserted) { fetchAll(); return }

    // Η σειρά επιστροφής δεν είναι εγγυημένη· το `sort_order` είναι ο δείκτης
    // που έγραψε το πρότυπο, άρα η μόνη ασφαλής αντιστοίχιση.
    const idByIndex = new Map(inserted.map(r => [r.sort_order, r.id]))
    const links = tpl.items
      .map((tItem, i) => ({ id: idByIndex.get(i), dep: tItem.depends_on_idx !== undefined ? idByIndex.get(tItem.depends_on_idx) : undefined }))
      .filter((l): l is { id: string; dep: string } => !!l.id && !!l.dep)
    // Οι εξαρτήσεις δείχνουν σε διαφορετική γραμμή η καθεμία, οπότε δεν
    // συμπτύσσονται σε ένα update — τρέχουν όμως παράλληλα, όχι σε σειρά.
    if (links.length) {
      await Promise.all(links.map(l => saved('Μια εξάρτηση εργασίας δεν αποθηκεύτηκε',
        checklist.update(supabase, l.id, { depends_on: l.dep }))))
    }
    fetchAll(); notifyOk(`«${tpl.label}» φορτώθηκε, ${tpl.items.length} εργασίες`)
  }

  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulkComplete = async () => {
    const count = selected.size; if (!count) return
    const ids = [...selected]
    const chosen = ids.map(id => items.find(it => it.id === id)).filter((it): it is ChecklistItem => !!it && it.status !== 'done')
    // Ένα ερώτημα αντί για ένα ανά γραμμή: λιγότερες διαδρομές και ΕΝΑ σφάλμα
    // να ελεγχθεί αντί για δέκα που κανείς δεν κοίταζε.
    if (!await saved('Οι εργασίες δεν ολοκληρώθηκαν',
      checklist.markDoneMany(supabase, ids))) return
    // Κλείνουν τα γεγονότα του ημερολογίου. ΟΧΙ οι δαπάνες: κάθε συνδεδεμένη
    // δαπάνη έχει πλέον τιμολόγιο και είναι ήδη πληρωμένη. Το μαζικό
    // `expenses.paid = true` ανήκε στην εποχή των εκτιμήσεων.
    const calIds = chosen.map(it => it.calendar_event_id).filter((c): c is string => !!c)
    if (calIds.length) await saved('Τα γεγονότα ημερολογίου δεν έκλεισαν',
      calendar.updateMany(supabase, calIds, { status: 'paid' }))
    // Επαναλαμβανόμενες: επόμενη εμφάνιση + φρέσκο κύκλωμα (ίδια λογική με τη μονή ολοκλήρωση).
    const recurring = chosen.filter(it => it.recurring !== 'none' && !!it.due_date)
    for (const item of recurring) {
      const newDue = nextDueDate(item.due_date!, item.recurring)
      const rec = await savedData<{ id?: string }>('Η επόμενη επανάληψη δεν δημιουργήθηκε', checklist.addReturning(supabase, nextOccurrence(item, newDue)))
      const recId = rec?.id
      if (recId && !isGeneratedRef(item._ref)) {
        const c = await makeTaskCal({ ...item, due_date: newDue })
        if (c) await saved('Η επανάληψη δεν συνδέθηκε με το ημερολόγιο',
          checklist.linkEvent(supabase, recId, c))
      }
    }
    setSelected(new Set()); fetchAll(); notifyOk(`${count} εργασίες ολοκληρώθηκαν${recurring.length ? `, ${recurring.length} επαναπρογραμματίστηκαν` : ''}`)
  }
  const bulkDelete = async () => {
    const count = selected.size; if (!count) return
    // Ίδια ερώτηση, ίδιο primitive με τη μονή διαγραφή. Πριν, οι δύο διαγραφές
    // της ΙΔΙΑΣ οθόνης ρωτούσαν με δύο χωριστά χειρόγραφα παράθυρα — ίδιο
    // εικονίδιο, ίδια πρόταση, δύο αντίγραφα κώδικα που μπορούσαν να αποκλίνουν.
    if (!await confirmDialog({ title: `Διαγραφή ${count} εργασιών;`, message: 'Αυτή η ενέργεια δεν αναιρείται.', confirmLabel: 'Διαγραφή', tone: 'negative' })) return
    const chosen = [...selected].map(id => items.find(it => it.id === id)).filter((it): it is ChecklistItem => !!it)
    const calIds = chosen.map(it => it.calendar_event_id).filter((c): c is string => !!c)
    if (calIds.length) await saved('Τα γεγονότα ημερολογίου δεν διαγράφηκαν',
      calendar.remove(supabase, calIds))
    // Οι δαπάνες ΔΕΝ διαγράφονται μαζί: έχουν παραστατικό, δηλαδή συνέβησαν.
    if (!await saved('Οι εργασίες δεν διαγράφηκαν',
      checklist.removeMany(supabase, [...selected]))) return
    setSelected(new Set()); fetchAll(); notify(`${count} εργασίες διαγράφηκαν`)
  }

  const stats = useMemo(() => {
    const total = items.length; const done = items.filter(i => i.status === 'done').length
    const overdue = items.filter(i => isOverdue(i.due_date, i.status)).length
    const inProgress = items.filter(i => i.status === 'in_progress').length
    const critical = items.filter(i => i.priority === 'critical' && i.status !== 'done').length
    const totalEstimated = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
    const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, overdue, inProgress, critical, totalEstimated, totalActual, pct }
  }, [items])

  useEffect(() => {
    if (stats.pct === 100 && prevPct.current < 100 && stats.total > 0) { setShowCelebration(true); setTimeout(() => setShowCelebration(false), 4000) }
    prevPct.current = stats.pct
  }, [stats.pct, stats.total])

  const filtered = useMemo(() => items.filter(item => {
    const matchStatus = filterStatus === 'all' ? true : filterStatus === 'overdue' ? isOverdue(item.due_date, item.status) : item.status === filterStatus
    const matchCat = filterCat === 'all' || item.category === filterCat
    const matchPri = filterPri === 'all' || item.priority === filterPri
    const q = search.toLowerCase()
    return matchStatus && matchCat && matchPri && (!q || item.description.toLowerCase().includes(q) || (item.assigned_contact_name || '').toLowerCase().includes(q) || (item._tags || []).some(t => t.toLowerCase().includes(q)))
  }), [items, filterStatus, filterCat, filterPri, search])

  const grouped = useMemo(() => { const g: Record<string, ChecklistItem[]> = {}; filtered.forEach(item => { if (!g[item.category]) g[item.category] = []; g[item.category].push(item) }); return g }, [filtered])
  const usedCats = CATEGORIES.filter(c => items.some(i => i.category === c.id))
  const hasFilters = filterStatus !== 'all' || filterCat !== 'all' || filterPri !== 'all' || !!search
  const clearFilters = () => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all'); setSearch('') }

  // Ήρεμη σειρά KPI: οι αριθμοί μένουν --text-primary (neutral). Χρώμα κρατιέται
  // ΜΟΝΟ για ένα πραγματικά επείγον σήμα — τα εκπρόθεσμα, όταν υπάρχουν.
  // 3 έξυπνα, συνδυασμένα KPI αντί για 5 — clean & minimal: εκκρεμείς · προσοχή · ολοκλήρωση.
  const openCount = stats.total - stats.done
  const attention = stats.overdue + stats.critical
  // ΤΑ ΤΡΙΑ ΠΛΑΚΙΔΙΑ ΕΦΥΓΑΝ. Έλεγαν τους ΙΔΙΟΥΣ τρεις αριθμούς με τον υπότιτλο
  // της σελίδας, με τη γραμμή προόδου και με τα chips των κατηγοριών: το «6»
  // τυπωνόταν πέντε φορές («6 εργασίες», «ΕΚΚΡΕΜΕΙΣ 6», «από 6 συνολικά»,
  // «0/6», «Όλα (6)») και το «0%» τέσσερις. Τετρακόσια εικονοστοιχεία για να
  // ειπωθούν τρεις αριθμοί, που τώρα λέγονται μία φορά ο καθένας: το πλήθος
  // στον υπότιτλο, η πρόοδος στη μπάρα, η κατανομή στα chips.

  return (
    <div style={pageShell(1100)}>

      {/* ΔΕΝ ΕΙΝΑΙ ΠΑΡΑΘΥΡΟ ΚΑΙ ΔΕΝ ΓΙΝΕΤΑΙ <Modal>. Δεν ρωτά τίποτα, δεν έχει
          κουμπιά, δεν έχει «×» και δεν κλείνει ο χρήστης: φεύγει μόνο του σε 4
          δευτερόλεπτα. Το `pointerEvents: 'none'` λέει ακριβώς αυτό — δεν
          δέχεται ούτε ένα κλικ. Ένα Modal θα του φόρτωνε scrim, παγίδα εστίασης
          και κλείδωμα κύλισης για μια γιορτή που δεν διακόπτει τίποτα. Έμεινε
          όπως ήταν· ευθυγραμμίστηκε μόνο η ακτίνα με το token (18 → T.radius.modal,
          ίδια τιμή, μία πηγή). */}
      {showCelebration && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9997, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.modal, padding: '32px 48px', textAlign: 'center', boxShadow: 'var(--elev-3)' }}>
            {/* ΗΤΑΝ Η ΙΔΙΑ ΠΡΟΤΑΣΗ ΔΥΟ ΦΟΡΕΣ, ΣΤΟΙΒΑΓΜΕΝΗ. «Όλα ολοκληρώθηκαν» και
                από κάτω «Όλες οι εργασίες έχουν ολοκληρωθεί» — στη μία στιγμή που
                η εφαρμογή έχει να πει κάτι καλό. Η δεύτερη γραμμή λέει τώρα κάτι
                που ο χρήστης δεν ξέρει ήδη. */}
            <div style={{ fontFamily: T.font.sans, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Όλα ολοκληρώθηκαν</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Οι επαναλαμβανόμενες θα ξαναεμφανιστούν στην ώρα τους.</div>
          </div>
        </div>
      )}

      {/* ΤΡΕΙΣ ΚΑΤΑΣΤΑΣΕΙΣ ΣΥΜΠΙΕΣΜΕΝΕΣ ΣΕ ΔΥΟ, ΚΑΙ Η ΤΡΙΤΗ ΕΒΓΑΖΕ ΑΣΥΝΤΑΚΤΟ.
          Το `openCount === 0` είναι αληθές ΚΑΙ όταν όλα ολοκληρώθηκαν ΚΑΙ όταν
          δεν υπάρχει τίποτα. Με άδεια λίστα ο υπότιτλος έγραφε «Ολοκληρώθηκαν
          και οι 0»: γραμματικά σπασμένο και ψέμα — τίποτα δεν ολοκληρώθηκε,
          τίποτα δεν υπάρχει. Ο ενικός έβγαζε «Ολοκληρώθηκαν και οι 1».

          Ο τίτλος διαβάζεται από το μενού, για τον ίδιο λόγο με την Απόδοση:
          ό,τι γράφεται δεύτερη φορά, αποκλίνει. */}
      {!embedded && <PageTitle
        title={navLabel('checklist')}
        titleHint="Λίστα ελέγχου εργασιών ακινήτου"
        sub={stats.total === 0
          ? 'Καμία εργασία ακόμη'
          : openCount === 0
          ? (stats.total === 1 ? 'Ολοκληρώθηκε η μοναδική εργασία' : `Ολοκληρώθηκαν και οι ${fn(stats.total)}`)
          : `${fn(openCount)} ${openCount === 1 ? 'ανοιχτή' : 'ανοιχτές'}`
            + (attention > 0 ? ` · ${fn(attention)} ${attention === 1 ? 'χρειάζεται' : 'χρειάζονται'} προσοχή` : '')
            + ` · ${fn(stats.done)} από ${fn(stats.total)} ολοκληρωμένες`}
        right={loading || items.length === 0 ? undefined : (
          <>
            {/* ΤΟ «ghost» ΕΙΝΑΙ ΓΙΑ ΤΙΣ ΑΠΟΡΡΙΠΤΙΚΕΣ ΕΝΕΡΓΕΙΕΣ, ΚΑΙ ΜΟΝΟ.
                Το φοράνε το «Ακύρωση», το «Άλλη φορά», το «Διαγραφή»: πράγματα
                που ο χρήστης πατά για να ΜΗΝ κάνει κάτι. Εδώ όμως τα «Πρότυπα»
                είναι ισότιμη ενέργεια με την Εξαγωγή που κάθεται δίπλα τους και
                χωρίς περίγραμμα διαβάζονταν ως κείμενο και όχι ως κουμπί. Η ίδια
                ενέργεια στην άδεια κατάσταση ήταν ήδη «secondary». */}
            <Btn variant="secondary" onClick={() => setShowTemplates(true)}>Πρότυπα</Btn>
            <ExportMenu
              onExcel={() => exportChecklistExcel(items)}
              onPdf={() => exportChecklistPDF(items, branding)}
              onHandover={profileType === 'professional' ? () => exportHandoverProtocol(items, 'checkin', tenantInfo || undefined, branding) : undefined}
            />
            <Btn variant="primary" onClick={() => { setEditItem(null); setShowAddModal(true) }}>Νέα εκκρεμότητα</Btn>
          </>
        )}
      />}


      {/* ΟΙ ΥΠΟΧΡΕΩΣΕΙΣ ΠΟΥ ΛΕΙΠΟΥΝ, ΣΤΗΝ ΟΘΟΝΗ ΚΑΙ ΟΧΙ ΜΕΣΑ ΣΕ ΜΕΝΟΥ. Ο χρήστης
          που δεν άνοιξε ποτέ τα «Πρότυπα» δεν είχε τρόπο να μάθει ότι υπάρχει
          προθεσμία που τον αφορά. Δεν γράφεται τίποτα αυτόματα: το κουμπί είναι
          δική του απόφαση, με την πρώτη προθεσμία ονομαστικά μπροστά του. */}
      {!loading && items.length > 0 && pendingObligations.length > 0 && (
        <InfoBanner tone="warning">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{pendingObligations.length === 1 ? 'Λείπει 1 υποχρέωση' : `Λείπουν ${pendingObligations.length} υποχρεώσεις`}</strong>
              {' '}που προκύπτουν από τον νόμο για αυτό το ακίνητο, με ημερομηνία και επίσημη πηγή.
              {nextObligation ? ` Πρώτη: ${nextObligation.description}, ${fmtDate(nextObligation.due_date)}.` : ''}
            </span>
            <Btn variant="secondary" onClick={loadObligations}>Πρόσθεσέ τες</Btn>
          </div>
        </InfoBanner>
      )}

      {/* Η ΠΡΟΟΔΟΣ ΩΣ ΓΡΑΜΜΗ, ΧΩΡΙΣ ΔΙΚΗ ΤΗΣ ΕΤΙΚΕΤΑ.
          Είχε επικεφαλίδα «Συνολική Πρόοδος» και ποσοστό δεξιά — δηλαδή έλεγε
          για τρίτη φορά το «0%» που έγραφαν ήδη ο υπότιτλος της σελίδας και το
          πλακίδιο «Ολοκλήρωση». Μια μπάρα ΕΙΝΑΙ ποσοστό· δεν χρειάζεται να το
          ανακοινώσει. Το κόστος μένει: είναι άλλη πληροφορία, όχι επανάληψη. */}
      {stats.total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 4, borderRadius: T.radius.pill, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: stats.pct + '%', background: 'var(--accent)', borderRadius: T.radius.pill,
                          transition: `width .4s ${T.ease.standard}` }} />
          </div>
          {(stats.totalEstimated > 0 || stats.totalActual > 0) && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans,
                          fontVariantNumeric: 'tabular-nums' }}>
              {stats.totalActual > 0 ? `${fe(stats.totalActual)} με παραστατικό` : ''}
              {stats.totalActual > 0 && stats.totalEstimated > 0 ? ' · ' : ''}
              {stats.totalEstimated > 0 ? `${fe(stats.totalEstimated)} εκτίμηση` : ''}
            </div>
          )}
        </div>
      )}

      {/* ═══ ΣΕ ΚΙΝΗΤΟ Η ΓΡΑΜΜΗ ΤΩΝ ΦΙΛΤΡΩΝ ΓΙΝΕΤΑΙ ΠΛΕΓΜΑ ══════════════════════
          ΜΕΤΡΗΜΕΝΟ ΣΕ Galaxy A, 360×800. Έξι χειριστήρια με ελάχιστα πλάτη
          240, 172, 178 και τρία «όσο θέλει το κείμενό μου» δεν χωρούν δύο σε
          σειρά στα 336 της κάρτας, οπότε το `flex-wrap` τα βάζει ένα ανά
          σειρά: έξι σειρές, καθεμία σε ΑΛΛΟ πλάτος, με τη δεξιά άκρη να
          κάνει σκάλα. Δεν σπάει τίποτα, απλώς φαίνεται σαν να μην το είδε
          κανείς.

          ΤΟ ΠΛΕΓΜΑ ΔΙΝΕΙ ΜΙΑ ΑΚΡΗ. Δύο ίσες στήλες, η αναζήτηση σε ολόκληρο
          πλάτος από πάνω επειδή είναι το ένα πράγμα που θέλει χώρο για να
          γραφτεί, τα υπόλοιπα ανά δύο. Τα ελάχιστα πλάτη μηδενίζονται εδώ:
          κρατούν την υπόδειξη ολόκληρη σε φαρδιά οθόνη, αλλά σε 164
          εικονοστοιχεία στήλης η υπόδειξη κόβεται με αποσιωπητικά, που το
          ίδιο το χειριστήριο ήδη ξέρει να κάνει. */}
      {items.length > 0 && <div className="filter-bar" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* ΤΟ ΕΛΑΧΙΣΤΟ ΠΛΑΤΟΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗΝ ΥΠΟΔΕΙΞΗ, ΟΧΙ ΑΠΟ ΣΤΡΟΓΓΥΛΟ ΑΡΙΘΜΟ.
            Στα 180 το πεδίο χωρούσε δίπλα στα φίλτρα σε ορισμένα πλάτη και η
            υπόδειξη κοβόταν στη μέση: μετρημένο στα 430, ήθελε 209 και είχε 176.
            Με ελάχιστο 240 είτε χωρά ολόκληρη, είτε το πεδίο πέφτει σε δική του
            σειρά και παίρνει όλο το πλάτος. */}
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Εργασία, ετικέτα ή επαφή" aria-label="Αναζήτηση εκκρεμοτήτων" style={iStyle} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
          {search && <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>}
        </div>
        <FilterSelect value={filterStatus} onChange={v => setFilterStatus(v as FilterStatus)} minWidth={172} idle="Κατάσταση"
          options={[{ value: 'all', label: 'Όλες οι καταστάσεις' }, ...STATUSES.map(s => ({ value: s.value, label: s.label })), { value: 'overdue', label: 'Ληξιπρόθεσμα' }]} />
        <FilterSelect value={filterPri} onChange={setFilterPri} minWidth={178} idle="Προτεραιότητα"
          options={[{ value: 'all', label: 'Όλες οι προτεραιότητες' }, ...PRIORITIES.map(p => ({ value: p.value, label: p.label }))]} />
        {/* ΤΟ «ΟΛΟΚΛΗΡΩΜΕΝΑ» ΗΤΑΝ ΔΕΥΤΕΡΟ ΦΙΛΤΡΟ ΓΙΑ ΤΗΝ ΙΔΙΑ ΣΤΗΛΗ, ΚΑΙ
            ΜΠΟΡΟΥΣΑΝ ΝΑ ΔΙΑΦΩΝΗΣΟΥΝ. Το φίλτρο κατάστασης έχει ήδη
            «Ολοκληρώθηκε»: με αυτό επιλεγμένο ΚΑΙ τον διακόπτη ενεργό, η λίστα
            άδειαζε και δεν υπήρχε τίποτα στην οθόνη να εξηγήσει γιατί — δύο
            χειριστήρια που λένε αντίθετα πράγματα για το ίδιο πεδίο. Έμεινε το
            φίλτρο, που είναι το γενικό και το εξηγήσιμο. */}
        {viewMode === 'list' && items.length > 3 && (
          <button type="button" onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true) }}
            title="Επιλογή εργασιών για μαζικές ενέργειες"
            style={{ padding: '9px 14px', borderRadius: T.radius.pill, border: '1px solid ' + (selectMode ? 'var(--accent)' : 'var(--border-subtle)'), background: selectMode ? 'var(--accent-soft)' : 'var(--bg-surface)', color: selectMode ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', fontFamily: T.font.sans, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
            {selectMode ? 'Τέλος επιλογής' : 'Επιλογή'}
          </button>
        )}
        {/* Η ΟΜΑΔΑ ΤΩΝ ΔΥΟ ΔΙΑΤΑΞΕΩΝ ΠΙΑΝΕΙ ΟΛΟ ΤΟ ΠΛΑΤΟΣ ΣΕ ΚΙΝΗΤΟ. Οι δύο
            ετικέτες θέλουν 187 μαζί και το κελί του πλέγματος δίνει 164:
            μετρημένο σε Galaxy A, το «Κατά προθεσμία» κοβόταν στη μέση μέσα
            στο ίδιο του το κουμπί. Με μία σειρά δική της, οι δύο διατάξεις
            μοιράζονται τα 340 και γράφονται ολόκληρες. */}
        <div className="seg-two" style={{ display: 'flex', gap: 2, padding: '3px', background: 'var(--bg-surface)', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)' }}>
          {/* ΔΥΟ ΔΙΑΤΑΞΕΙΣ, ΟΧΙ ΤΡΕΙΣ. Ο «Πίνακας» ήταν kanban: τέσσερις στήλες
              κατάστασης, με κάρτες που μετακινούνται. Για έξι εκκρεμότητες ενός
              διαμερίσματος είναι εργαλείο ομάδας λογισμικού, όχι ιδιοκτήτη — και
              η αλλαγή κατάστασης γίνεται ήδη με ένα κλικ στη σειρά. Έμειναν οι
              δύο που απαντούν σε πραγματικές ερωτήσεις: «τι έχω ανά κατηγορία»
              και «τι λήγει πότε». */}
          {(['list', 'timeline'] as ViewMode[]).map(v => (
            <button key={v} type="button" title={v === 'timeline' ? 'Κατά προθεσμία' : 'Ανά κατηγορία'} onClick={() => { setViewMode(v); if (v !== 'list') exitSelectMode() }} style={{ padding: '6px 12px', borderRadius: T.radius.badge, border: 'none', background: viewMode === v ? 'var(--accent)' : 'transparent', color: viewMode === v ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: viewMode === v ? 700 : 400, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', fontFamily: T.font.sans }}>
              {v === 'list' ? 'Ανά κατηγορία' : 'Κατά προθεσμία'}
            </button>
          ))}
        </div>
        {/* Ο καθαρισμός φίλτρων ήταν κόκκινος, σαν διαγραφή. Δεν σβήνει τίποτα:
            επαναφέρει την όψη. */}
        {hasFilters && <button type="button" onClick={clearFilters} style={{ padding: '8px 12px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: T.font.sans }}>Καθαρισμός φίλτρων</button>}
      </div>}

      {usedCats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setFilterCat('all')} style={{ padding: '5px 12px', borderRadius: T.radius.pill, border: '1px solid ' + (filterCat === 'all' ? 'var(--accent)' : 'var(--border-subtle)'), background: filterCat === 'all' ? 'var(--accent-soft)' : 'transparent', color: filterCat === 'all' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: filterCat === 'all' ? 700 : 400 }}>Όλα ({items.length})</button>
          {usedCats.map(c => {
            const count = items.filter(i => i.category === c.id).length
            const catDone = items.filter(i => i.category === c.id && i.status === 'done').length
            return (
              <button key={c.id} type="button" onClick={() => setFilterCat(filterCat === c.id ? 'all' : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: T.radius.pill, border: '1px solid ' + (filterCat === c.id ? 'var(--accent)' : 'var(--border-subtle)'), background: filterCat === c.id ? 'var(--accent-soft)' : 'transparent', color: filterCat === c.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: filterCat === c.id ? 700 : 400, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                {c.label}
                <span style={{ fontSize: 11, opacity: 0.8, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{catDone}/{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        // Σκελετός αντί για spinner: το σχήμα της καρτέλας (KPIs + λίστα) είναι γνωστό,
        // οπότε ο χρήστης βλέπει πού θα εμφανιστεί τι και δεν «πηδά» η διάταξη.
        <>
          <SkeletonKPIs n={4} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={62} r={12} />)}</div>
        </>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={20} />}
          title="Όλα καθαρά εδώ"
          hint={pendingObligations.length > 0
            ? `Δεν έχεις καμία εργασία, αλλά ο νόμος έχει ${pendingObligations.length} υποχρεώσεις για αυτό το ακίνητο.${nextObligation ? ` Πρώτη: ${nextObligation.description}, ${fmtDate(nextObligation.due_date)}.` : ''}`
            : 'Ξεκίνα με ένα έτοιμο πρότυπο ή πρόσθεσε τη δική σου εκκρεμότητα.'}
          action={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {pendingObligations.length > 0 && <Btn variant="primary" onClick={loadObligations}>Φέρε τις υποχρεώσεις</Btn>}
              <Btn variant="secondary" onClick={() => setShowTemplates(true)}>Πρότυπα</Btn>
              <Btn variant={pendingObligations.length > 0 ? 'secondary' : 'primary'} onClick={() => { setEditItem(null); setShowAddModal(true) }}>Νέα εκκρεμότητα</Btn>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={20} />}
          title="Δεν βρέθηκαν εκκρεμότητες"
          /* Το «Καθαρισμός φίλτρων» βρίσκεται ήδη στη μπάρα φίλτρων, λίγο πιο
             πάνω και πάντα ορατό όσο υπάρχει φίλτρο. Δεύτερο ίδιο κουμπί σε
             απόσταση σαράντα εικονοστοιχείων δεν βοηθά, ρωτά ποιο είναι ποιο. */
          hint="Δοκίμασε διαφορετικά φίλτρα, ή πάτησε «Καθαρισμός φίλτρων» πιο πάνω."
        />
      ) : viewMode === 'timeline' ? (
        <TimelineView items={filtered} onEdit={item => { setEditItem(item); setShowAddModal(true) }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {CATEGORIES.filter(c => grouped[c.id]?.length).map(cat => {
            const catItems = grouped[cat.id]
            const catDone = catItems.filter(i => i.status === 'done').length
            const catPct = catItems.length > 0 ? Math.round((catDone / catItems.length) * 100) : 0
            const catEst = catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0)
            return (
              <div key={cat.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{cat.label}</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, var(--border-default), transparent)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{catDone}/{catItems.length} · {fp(catPct)}{catEst > 0 ? ` · ${fe(catEst)}` : ''}</span>
                </div>
                <div style={{ height: 3, borderRadius: 3, background: 'var(--bg-elevated)', marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: catPct + '%', background: 'var(--series-in)', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                  {catItems.map((item, idx) => (
                    <ItemRow key={item.id} item={item} allItems={items}
                      onToggle={() => toggleItem(item)}
                      onEdit={() => { setEditItem(item); setShowAddModal(true) }}
                      onDelete={() => deleteItem(item.id)}
                      onAddToCalendar={() => addToCalendar(item)}
                      onScanReceipt={() => setReceiptItem(item)}
                      onDuplicate={() => duplicateItem(item)}
                      onSelect={() => toggleSelect(item.id)}
                      selected={selected.has(item.id)}
                      selectMode={selectMode}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ΟΙ ΠΡΟΤΑΣΕΙΣ ΤΗΣ ΝΟΑΣ ΗΡΘΑΝ ΕΔΩ, ΑΠΟ ΤΗΝ ΕΠΙΣΚΟΨΗ.
          Στην αρχική οθόνη ήταν η τέταρτη κάρτα «τι να κάνεις» στη σειρά, κάτω
          από τρεις άλλες που έλεγαν εν μέρει τα ίδια. Εδώ είναι το φυσικό της
          σημείο: αυτή η καρτέλα ΕΙΝΑΙ η λίστα εκκρεμοτήτων και δίπλα της ζουν
          ήδη οι προτάσεις προτύπων. Ό,τι προτείνεται, προστίθεται εδώ. */}
      {!embedded && <SmartSuggestions userId={userId} propertyId={propertyId} />}

      {/* Γραμμή μαζικών ενεργειών — εμφανίζεται μόλις επιλεγεί ≥1 εργασία.
          Ηταν γραμμένη εδώ και ξανά στο Χαρτοφυλάκιο, με πέντε διαφορές που δεν
          αποφάσισε ποτέ κανείς. Ζει τώρα μία φορά, στο UIComponents. */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          countLabel={selected.size === filtered.length ? 'όλα επιλεγμένα' : 'επιλεγμένα'}
          onClear={exitSelectMode}
          minWidth={520}
          actions={[
            {
              label: selected.size === filtered.length ? 'Καθαρισμός επιλογής' : `Επιλογή όλων (${filtered.length})`,
              onClick: () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(i => i.id))); },
            },
            // Πράσινο και κόκκινο δίπλα δίπλα σε δύο ενέργειες που εκτελεί ο
            // ίδιος άνθρωπος με τον ίδιο τρόπο. Η διαγραφή ζητά ούτως ή άλλως
            // επιβεβαίωση και ΕΚΕΙ το κόκκινο έχει νόημα.
            { label: 'Ολοκλήρωση', onClick: bulkComplete, tone: 'strong' as const },
            { label: 'Διαγραφή', onClick: bulkDelete },
          ]}
        />
      )}

      {showTemplates && <TemplateModal onSelect={loadTemplate} onLoadObligations={loadObligations} onClose={() => setShowTemplates(false)} ctx={fieldCtx} pending={pendingObligations} smart={smartSuggestions} />}
      {showAddModal && <ItemModal item={editItem || undefined} contacts={contacts} onSave={saveItem} onClose={() => { setShowAddModal(false); setEditItem(null) }}
        onScan={editItem ? () => { const it = editItem; setShowAddModal(false); setEditItem(null); setReceiptItem(it) } : undefined} />}
      {receiptItem && <ReceiptScanModal item={receiptItem} propertyId={propertyId} userId={userId} onClose={() => setReceiptItem(null)} onSaved={msg => { notifyOk(msg); fetchAll() }} />}

      {/* ΤΑ ΔΥΟ ΠΑΡΑΘΥΡΑ ΔΙΑΓΡΑΦΗΣ ΕΦΥΓΑΝ ΑΠΟ ΕΔΩ. Ήταν 31 γραμμές markup που
          έλεγαν δύο φορές το ίδιο πράγμα — ίδιο εικονίδιο κάδου, ίδια πρόταση
          «Αυτή η ενέργεια δεν αναιρείται.», ίδια δύο κουμπιά — και δεν είχαν
          ούτε Escape ούτε επιστροφή εστίασης. Η ερώτηση ζει τώρα στη γραμμή που
          διαγράφει (`deleteItem`, `bulkDelete`) μέσω του confirmDialog. */}
    </div>
  )
}