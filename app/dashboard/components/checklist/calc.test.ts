// ═══════════════════════════════════════════════════════════════════════════
// Ο ΦΑΚΕΛΟΣ ΜΕΣΑ ΣΤΗ ΣΗΜΕΙΩΣΗ: ΓΡΑΨΙΜΟ ΚΑΙ ΔΙΑΒΑΣΜΑ, ΧΩΡΙΣ ΑΠΩΛΕΙΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΤΩΡΑ. Αυτές οι συναρτήσεις ζούσαν μέσα σε ένα αρχείο 2.671 γραμμών με
// τριάντα εισαγωγές του περιηγητή: δεν μπορούσαν να δοκιμαστούν χωρίς να
// φορτωθεί ολόκληρη η οθόνη. Τώρα είναι καθαρές συναρτήσεις σε δικό τους
// αρχείο, και ελέγχονται.
//
// ΤΙ ΔΙΑΚΥΒΕΥΕΤΑΙ. Οι υποεργασίες, τα σχόλια, οι ετικέτες, η επίσημη πηγή, ο
// υπεύθυνος και ΤΟ ΠΑΡΑΣΤΑΤΙΚΟ που δικαιολογεί το πραγματικό κόστος ζουν όλα
// μέσα σε μία στήλη κειμένου, ως JSON. Δεν υπάρχει σχήμα βάσης να τα φυλάξει:
// αν το γράψιμο και το διάβασμα αποκλίνουν κατά ένα κλειδί, τα δεδομένα του
// χρήστη γίνονται αόρατα χωρίς κανένα σφάλμα πουθενά.
// ═══════════════════════════════════════════════════════════════════════════
import type { ChecklistItemsRow } from '@/lib/supabase/tables'
import {
  parseItem, serializeNote, nextDueDate, nextOccurrence, carryOver, mkEmpty,
  isOverdue, asPriority, asStatus, asRecurring, getCat, getPri, getStatusMeta,
} from './calc'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

/** Μια γραμμή της βάσης, με ό,τι επιτρέπει η βάση να είναι κενό. */
const row = (o: Partial<ChecklistItemsRow> = {}): ChecklistItemsRow => ({
  id: 'x', property_id: null, user_id: null, category: 'maintenance',
  description: 'Έλεγχος λέβητα', note: null, completed: null, completed_at: null,
  created_at: null, priority: null, due_date: null, recurring: null,
  assigned_contact_id: null, assigned_contact_name: null, estimated_cost: null,
  actual_cost: null, status: null, template_id: null, sort_order: null,
  ...o,
}) as ChecklistItemsRow

// ── ΤΟ ΤΑΞΙΔΙ ΓΡΑΨΙΜΟ → ΒΑΣΗ → ΔΙΑΒΑΣΜΑ ───────────────────────────────────
{
  const payload = {
    note: 'Να ζητηθεί προσφορά',
    subtasks: [{ id: '1', text: 'Τηλέφωνο στον τεχνικό', done: true }],
    comments: [{ id: 'c1', text: 'Είπε Τρίτη', ts: '2026-08-10' }],
    tags: ['Εγγύηση'],
    ref: 'tax:enfia:2026', src: 'https://www.aade.gr/', who: 'owner' as const,
    receipt: { path: 'x/y.pdf', name: 'τιμολόγιο.pdf', amount: 84.5, date: '2026-08-11', provider: 'Υδραυλικές ΕΠΕ', scanned_at: '2026-08-11' },
  }
  const back = parseItem(row({ note: serializeNote(payload) }))
  ok('η σημείωση επιστρέφει καθαρή', back.note === 'Να ζητηθεί προσφορά')
  ok('οι υποεργασίες επιβιώνουν με την κατάστασή τους',
     back._subtasks?.length === 1 && back._subtasks[0].done === true)
  ok('τα σχόλια επιβιώνουν', back._comments?.[0].text === 'Είπε Τρίτη')
  ok('οι ετικέτες επιβιώνουν', back._tags?.[0] === 'Εγγύηση')
  ok('η ταυτότητα της υποχρέωσης επιβιώνει', back._ref === 'tax:enfia:2026')
  ok('η επίσημη πηγή επιβιώνει', back._src === 'https://www.aade.gr/')
  ok('ο υπεύθυνος επιβιώνει', back._who === 'owner')
  // ΤΟ ΠΙΟ ΚΡΙΣΙΜΟ: χωρίς παραστατικό το πραγματικό κόστος είναι ανεπιβεβαίωτο.
  ok('το παραστατικό επιβιώνει ακέραιο',
     back._receipt?.amount === 84.5 && back._receipt?.path === 'x/y.pdf' && back._receipt?.name === 'τιμολόγιο.pdf')
}

// ── ΟΙ ΓΡΑΜΜΕΣ ΠΟΥ ΔΕΝ ΓΡΑΦΤΗΚΑΝ ΑΠΟ ΤΗΝ ΟΘΟΝΗ ────────────────────────────
// Παλιά γραμμή, χειροκίνητη εγγραφή, ή σημείωση από προηγούμενη έκδοση: καμία
// δεν επιτρέπεται να σπάσει την καρτέλα.
{
  const plain = parseItem(row({ note: 'σκέτο κείμενο' }))
  ok('σκέτο κείμενο μένει σημείωση', plain.note === 'σκέτο κείμενο')
  ok('…και οι λίστες είναι κενές, όχι undefined',
     Array.isArray(plain._subtasks) && plain._subtasks.length === 0 && plain._receipt === null)

  const broken = parseItem(row({ note: '{«χαλασμένο JSON' }))
  ok('χαλασμένο JSON δεν ρίχνει την καρτέλα', broken._subtasks?.length === 0)

  const older = parseItem(row({ note: JSON.stringify({ __cv: 1, note: 'παλιά μορφή' }) }))
  ok('παλιότερη έκδοση σχήματος διαβάζεται ως σκέτο κείμενο', older._subtasks?.length === 0)
}

// ── ΤΑ ΚΕΝΑ ΤΗΣ ΒΑΣΗΣ ΚΛΕΙΝΟΥΝ ΕΔΩ ────────────────────────────────────────
// Η βάση δέχεται κενό σε στήλες που η οθόνη θεωρεί δεδομένες. Μια εργασία με
// `priority: null` δεν έμπαινε σε κανένα φίλτρο και δεν έπαιρνε χρώμα.
{
  const r = parseItem(row())
  ok('χωρίς προτεραιότητα, κανονική', r.priority === 'normal')
  ok('χωρίς κατάσταση, εκκρεμής', r.status === 'pending')
  ok('χωρίς επανάληψη, καμία', r.recurring === 'none')
  ok('χωρίς ακίνητο και χρήστη, κενά αντί για null', r.property_id === '' && r.user_id === '')
  ok('χωρίς κόστη, μηδέν', r.estimated_cost === 0 && r.actual_cost === 0)

  ok('τιμή από παλιά έκδοση δεν περνά', asPriority('urgent' as string) === 'normal')
  ok('άγνωστη κατάσταση δεν περνά', asStatus('archived' as string) === 'pending')
  ok('άγνωστη επανάληψη δεν περνά', asRecurring('weekly' as string) === 'none')

  // Και οι τρεις αναζητήσεις έχουν καταφύγιο: άγνωστο κλειδί δεν αφήνει την
  // οθόνη χωρίς ετικέτα.
  ok('άγνωστη κατηγορία πέφτει στις λοιπές', !!getCat('ανύπαρκτη').label)
  ok('άγνωστη προτεραιότητα πέφτει στην κανονική', getPri('ανύπαρκτη').value === 'normal')
  ok('άγνωστη κατάσταση πέφτει στην εκκρεμή', getStatusMeta('ανύπαρκτη').value === 'pending')
}

// ── Η ΕΠΟΜΕΝΗ ΕΜΦΑΝΙΣΗ ΕΠΑΝΑΛΑΜΒΑΝΟΜΕΝΗΣ ΕΡΓΑΣΙΑΣ ─────────────────────────
{
  ok('μηνιαία: 20 Μαρτίου δίνει 20 Απριλίου', nextDueDate('2026-03-20', 'monthly') === '2026-04-20')
  ok('τριμηνιαία', nextDueDate('2026-03-20', 'quarterly') === '2026-06-20')
  ok('ετήσια', nextDueDate('2026-03-20', 'yearly') === '2027-03-20')
  ok('χωρίς επανάληψη, ίδια ημερομηνία', nextDueDate('2026-03-20', 'none') === '2026-03-20')
  // Η ΥΠΕΡΧΕΙΛΙΣΗ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ. Το `setUTCMonth(+1)` πάνω σε 31 Ιανουαρίου
  // δίνει 31 Φεβρουαρίου, που ο JavaScript «διορθώνει» σε 3 Μαρτίου: κάθε
  // επαναλαμβανόμενη εργασία με προθεσμία στο τέλος του μήνα ολίσθαινε δύο ή
  // τρεις μέρες μέσα στον επόμενο, κάθε φορά.
  ok('31 Ιανουαρίου συν έναν μήνα δίνει 28 Φεβρουαρίου', nextDueDate('2026-01-31', 'monthly') === '2026-02-28')
  ok('31 Μαρτίου συν έναν μήνα δίνει 30 Απριλίου', nextDueDate('2026-03-31', 'monthly') === '2026-04-30')
  ok('31 Ιανουαρίου συν τρίμηνο δίνει 30 Απριλίου', nextDueDate('2026-01-31', 'quarterly') === '2026-04-30')
  ok('η χρονιά γυρίζει σωστά', nextDueDate('2026-12-31', 'monthly') === '2027-01-31')

  const item = parseItem(row({
    note: serializeNote({ note: 'ν', subtasks: [{ id: '1', text: 'β', done: true }], comments: [{ id: 'c', text: 'σ', ts: 't' }], tags: ['Ασφάλεια'], ref: 'r', src: 's', who: 'owner', receipt: null }),
    actual_cost: 120, estimated_cost: 100,
  }))
  const next = nextOccurrence(item, '2026-09-20') as Record<string, unknown>
  const note = JSON.parse(String(next.note)) as { subtasks: unknown[]; comments: unknown[]; tags: string[]; src: string | null }
  // Η νέα εμφάνιση είναι νέα δουλειά: τα τσεκαρισμένα βήματα του περασμένου
  // εξαμήνου θα την έδειχναν μισοτελειωμένη από τη γέννησή της.
  ok('οι υποεργασίες δεν μεταφέρονται', note.subtasks.length === 0)
  ok('τα σχόλια δεν μεταφέρονται', note.comments.length === 0)
  ok('οι ετικέτες μεταφέρονται', note.tags[0] === 'Ασφάλεια')
  ok('η πηγή μεταφέρεται', note.src === 's')
  ok('το πραγματικό κόστος ξεκινά από το μηδέν', next.actual_cost === 0)
  ok('η εκτίμηση μεταφέρεται', next.estimated_cost === 100)
  ok('η νέα εμφάνιση είναι εκκρεμής', next.status === 'pending' && next.completed === false)
}

// ── Η ΑΝΤΙΓΡΑΦΗ ΚΡΑΤΑ ΤΗΝ ΤΑΥΤΟΤΗΤΑ, ΟΧΙ ΤΗΝ ΕΚΤΕΛΕΣΗ ─────────────────────
{
  const src = parseItem(row({ note: serializeNote({ note: '', subtasks: [], comments: [], tags: [], ref: 'tax:e2', src: 'πηγή', who: 'owner', receipt: { path: 'p', name: 'n', amount: 5, date: '2026-01-01', scanned_at: 't' } }) }))
  const c = carryOver(src)
  ok('η ταυτότητα της υποχρέωσης κρατιέται', c.ref === 'tax:e2')
  ok('η πηγή κρατιέται', c.src === 'πηγή')
  ok('το παραστατικό κρατιέται', c.receipt?.amount === 5)
  ok('χωρίς αντικείμενο, όλα κενά', carryOver(null).ref === null)
}

// ── ΕΚΠΡΟΘΕΣΜΗ ────────────────────────────────────────────────────────────
{
  ok('χωρίς προθεσμία, ποτέ εκπρόθεσμη', isOverdue(null, 'pending') === false)
  ok('ολοκληρωμένη δεν είναι εκπρόθεσμη', isOverdue('2020-01-01', 'done') === false)
  ok('παραλειφθείσα δεν είναι εκπρόθεσμη', isOverdue('2020-01-01', 'skipped') === false)
  ok('περασμένη και εκκρεμής, εκπρόθεσμη', isOverdue('2020-01-01', 'pending') === true)
  ok('μελλοντική, όχι', isOverdue('2099-01-01', 'pending') === false)
}

// ── Η ΑΔΕΙΑ ΦΟΡΜΑ ─────────────────────────────────────────────────────────
// Ό,τι λείπει από εδώ δεν εμφανίζεται ποτέ στη φόρμα προσθήκης.
{
  const e = mkEmpty()
  ok('η άδεια φόρμα ξεκινά εκκρεμής και κανονική', e.status === 'pending' && e.priority === 'normal')
  ok('…χωρίς επανάληψη και χωρίς κόστος', e.recurring === 'none' && e.estimated_cost === '')
  ok('…με κενές λίστες', e.subtasks.length === 0 && e.comments.length === 0 && e.tags.length === 0)
}

console.log(`checklist/calc.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
