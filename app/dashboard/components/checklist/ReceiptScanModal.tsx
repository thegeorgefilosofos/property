'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟ ΤΗ ΦΩΤΟΓΡΑΦΙΑ ΤΟΥ ΤΙΜΟΛΟΓΙΟΥ ΣΤΗΝ ΠΡΑΓΜΑΤΙΚΗ ΔΑΠΑΝΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο μόνος δρόμος για να γίνει το εκτιμώμενο κόστος πραγματικό: το παραστατικό.
// Η ίδια σάρωση με κάθε άλλη οθόνη, ώστε ένα τιμολόγιο να διαβάζεται το ίδιο
// όπου κι αν φωτογραφηθεί.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { T, Modal, Btn, Skeleton, fe, formGrid } from '@/components/Theme'
import { DatePicker } from '../UIComponents'
import { FL, Inp } from './Bits'
import { saved, savedData } from '@/components/dbWrite'
import { MSG, failed } from '@/lib/core/dbError'
import * as expenses from '@/lib/data/expenses'
import * as documents from '@/lib/data/documents'
import * as calendar from '@/lib/data/calendar'
import * as checklist from '@/lib/data/checklist'
import { scanDocument } from '../scanDoc'
import { normalizeScannedDoc, planDocSave, type ScannedDoc } from '@/lib/billing/documents'
import { expenseFromReceipt, type ReceiptEntry, type ReceiptEvidence } from '@/lib/checklist/obligationTasks'
import { athensToday } from '@/lib/core/time'
import { serializeNote, carryOver } from './calc'
import type { ChecklistItem, ItemReceipt } from './model'

const supabase = createSupabaseClient()

// κλείνει. Καμία δική μας λογική OCR: ίδιο pipeline (scanDoc → documents.ts) με
// όλες τις υπόλοιπες σαρώσεις της εφαρμογής.
//
// Ο ΧΡΗΣΤΗΣ ΕΠΙΒΕΒΑΙΩΝΕΙ, ΔΕΝ ΠΛΗΚΤΡΟΛΟΓΕΙ ΑΠΟ ΤΟ ΜΗΔΕΝ. Η OCR κάνει λάθη· γι'
// αυτό τα πεδία είναι επεξεργάσιμα και δηλώνεται πόσο σίγουρη ήταν η ανάγνωση.
// Αυτό που ΔΕΝ επιτρέπεται είναι ποσό χωρίς αρχείο.
type ScanStage = 'pick' | 'reading' | 'confirm' | 'saving'

/** Η κατηγορία δαπάνης που ταιριάζει στην κατηγορία της εκκρεμότητας. Μία
 *  αντιστοίχιση, ώστε ένα τιμολόγιο συνεργείου να μη γράφεται ως φόρος. */
const EXPENSE_BY_TASK_CATEGORY: Record<string, { cat: string; group: string }> = {
  maintenance: { cat: 'Συντήρηση & Επισκευές', group: 'maintenance' },
  checkin:     { cat: 'Συντήρηση & Επισκευές', group: 'maintenance' },
  checkout:    { cat: 'Συντήρηση & Επισκευές', group: 'maintenance' },
  renovation:  { cat: 'Ανακαίνιση / Βελτιώσεις', group: 'improvement' },
  airbnb:      { cat: 'Λειτουργικά βραχυχρόνιας', group: 'operating' },
  legal:       { cat: 'Νομικά / Λογιστικά', group: 'professional' },
  financial:   { cat: 'Φόροι και Τέλη', group: 'taxes' },
  purchase:    { cat: 'Έξοδα Απόκτησης', group: 'acquisition' },
  other:       { cat: 'Λοιπά έξοδα', group: 'general' },
}
const expenseCategoryFor = (taskCategory: string) => EXPENSE_BY_TASK_CATEGORY[taskCategory] || EXPENSE_BY_TASK_CATEGORY.other



export function ReceiptScanModal({ item, propertyId, userId, onClose, onSaved }: {
  item: ChecklistItem; propertyId: string; userId: string
  onClose: () => void; onSaved: (msg: string) => void
}) {
  const [stage, setStage] = useState<ScanStage>('pick')
  const [err, setErr] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<ScannedDoc | null>(null)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [provider, setProvider] = useState('')
  const [desc, setDesc] = useState(item.description)
  const fileRef = useRef<HTMLInputElement>(null)
  const today = athensToday()

  const read = async (f: File) => {
    setFile(f); setErr(''); setStage('reading')
    const r = await scanDocument(f)
    if (!r.doc) {
      setStage('pick')
      setErr(r.error === 'big' ? 'Πολύ μεγάλο αρχείο, το όριο είναι 10MB.'
        : r.error === 'key_missing' ? 'Η αυτόματη ανάγνωση δεν είναι ενεργή σε αυτόν τον λογαριασμό.'
        : 'Δεν διάβασα καθαρά το έγγραφο. Δοκίμασε καθαρότερη φωτογραφία ή PDF.')
      return
    }
    // Κανονικοποίηση με την ΙΔΙΑ συνάρτηση που χρησιμοποιεί κάθε άλλη σάρωση,
    // ώστε ΑΦΜ και περίοδος να μη διαφέρουν ανά οθόνη.
    const nd = normalizeScannedDoc(r.doc)
    setDoc(nd)
    const amt = nd.amount ?? nd.premium
    setAmount(typeof amt === 'number' && amt > 0 ? String(amt) : '')
    setDate(nd.issue_date || nd.due_date || today)
    setProvider(nd.provider || '')
    if (nd.title || nd.provider) setDesc(`${item.description} · ${nd.provider || nd.title}`.slice(0, 180))
    setStage('confirm')
  }

  const amountNum = parseFloat(amount)
  const canSave = !!file && amountNum > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !!desc.trim()

  const save = async () => {
    if (!file || !doc || !canSave) return
    setStage('saving'); setErr('')

    // 1) ΤΟ ΠΡΩΤΟΤΥΠΟ ΣΤΟ ΑΡΧΕΙΟ. Πρώτα αυτό: αν αποτύχει, δεν γράφεται ποσό
    //    πουθενά. Ο φύλακας δεν είναι σύμβαση, είναι σειρά εκτέλεσης.
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `${userId}/${propertyId}/document/${Date.now()}_${safe}`
    const { error: upErr } = await supabase.storage.from('property-files').upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (upErr) { setStage('confirm'); setErr(failed('Το αρχείο δεν ανέβηκε', upErr)); return }

    // Η δρομολόγηση του παραστατικού είναι ΤΟΥ documents.ts, όχι δική μας: ίδιος
    // φάκελος Αρχείου, ίδια πεδία (ποσό, ΑΦΜ, περίοδος) με κάθε άλλη σάρωση.
    const plan = planDocSave({ ...doc, amount: amountNum, provider: provider || doc.provider, issue_date: date }, today)
    const archive = plan.archive
    const docBase: Record<string, unknown> = {
      property_id: propertyId, user_id: userId, kind: 'document',
      category: archive?.category || 'Άλλο Έγγραφο',
      title: (doc.title || desc || file.name).slice(0, 200),
      notes: `Παραστατικό εκκρεμότητας: ${item.description}`.slice(0, 500),
      doc_date: date, file_path: path, file_name: file.name,
      mime: file.type || null, size_bytes: file.size,
    }
    // Οι στήλες ποσού/ΑΦΜ/περιόδου προστέθηκαν με migration. Αν δεν έχει τρέξει
    // ακόμη στη βάση, το στρώμα αφαιρεί ΜΙΑ στήλη τη φορά — εδώ πετιόνταν και οι
    // πέντε μαζί, οπότε ένα `issue_date` που έλειπε άφηνε το παραστατικό και
    // χωρίς ποσό, χωρίς ΑΦΜ και χωρίς περίοδο.
    const { id: docId } = await documents.add(supabase, propertyId, userId, {
      ...docBase, supplier: archive?.supplier || null, amount: amountNum,
      provider_afm: archive?.provider_afm || null,
      period_from: archive?.period_from || null, period_to: archive?.period_to || null,
      issue_date: date,
    })

    const evidence: ReceiptEvidence = { path, name: file.name, docId }
    const map = expenseCategoryFor(item.category)
    const entry: ReceiptEntry = {
      amount: amountNum, date, description: desc.trim(),
      provider: provider || null, category: map.cat, group: map.group, evidence,
    }

    // 2) Ο ΦΥΛΑΚΑΣ. Αν επιστρέψει null, δεν γράφεται τίποτα στα Δαπάνες.
    const expenseRow = expenseFromReceipt(entry)
    if (!expenseRow) { setStage('confirm'); setErr('Χωρίς έγκυρο ποσό και παραστατικό δεν καταχωρείται δαπάνη.'); return }
    const expIns = await savedData<{ id?: string }>('Η δαπάνη από το παραστατικό δεν καταχωρήθηκε',
      expenses.addRow(supabase, { ...expenseRow, property_id: propertyId, user_id: userId }))
    const expenseId = expIns?.id || item.expense_id || null

    // 3) Η ΕΚΚΡΕΜΟΤΗΤΑ ΚΛΕΙΝΕΙ ΜΕ ΠΡΑΓΜΑΤΙΚΟ ΚΟΣΤΟΣ και το παραστατικό μένει
    //    κολλημένο πάνω της, ώστε το «πραγματικό κόστος» να έχει πάντα πηγή.
    const receipt: ItemReceipt = {
      path, name: file.name, docId, amount: amountNum, date,
      provider: provider || null, scanned_at: new Date().toISOString(),
    }
    if (!await saved('Η εκκρεμότητα δεν έκλεισε', checklist.markDone(supabase, item.id, {
      actual_cost: amountNum, expense_id: expenseId,
      note: serializeNote({
        note: item.note || '', subtasks: item._subtasks || [],
        comments: item._comments || [], tags: item._tags || [],
        ...carryOver(item), receipt,
      }),
    }).eq('id', item.id))) { setStage('confirm'); return }

    if (item.calendar_event_id) await saved(MSG.calendarEvent,
      calendar.update(supabase, item.calendar_event_id, { status: 'paid', amount: amountNum }))
    // Το αρχείο ανέβηκε ΠΑΝΤΑ (χωρίς αυτό δεν φτάναμε ως εδώ). Αν δεν γράφτηκε η
    // γραμμή του Αρχείου, το λέμε: το παραστατικό υπάρχει αλλά δεν θα φαίνεται
    // στην καρτέλα Αρχείο και ο χρήστης πρέπει να το ξέρει, όχι να το ανακαλύψει.
    onSaved(docId
      ? `Καταχωρήθηκε ${fe(amountNum)} με παραστατικό στο Αρχείο`
      : `Καταχωρήθηκε ${fe(amountNum)}. Το αρχείο αποθηκεύτηκε, αλλά δεν μπήκε στο Αρχείο.`)
    onClose()
  }

  const busy = stage === 'reading' || stage === 'saving'
  // ΤΟ ΚΛΕΙΣΙΜΟ ΕΙΝΑΙ ΚΛΕΙΔΩΜΕΝΟ ΟΣΟ ΤΡΕΧΕΙ ΑΝΑΓΝΩΣΗ Ή ΚΑΤΑΧΩΡΗΣΗ. Ο φύλακας
  // υπήρχε ήδη στο κουμπί «Ακύρωση» (`disabled={busy}`), αλλά το χειρόγραφο
  // παράθυρο δεν είχε καθόλου Escape, οπότε δεν φαινόταν ότι έλειπε από αλλού.
  // Το <Modal> προσθέτει Escape, «×» και κλικ στο φόντο· και οι τρεις δρόμοι
  // περνούν από εδώ, ώστε να μη διακόπτεται μια σάρωση στη μέση.
  const close = () => { if (!busy) onClose() }
  // Η ΕΤΙΚΕΤΑ ΤΟΥ ΑΝΑΓΝΩΣΤΗ ΟΘΟΝΗΣ ΗΤΑΝ ΑΛΛΟΥ ΠΑΡΑΘΥΡΟΥ. Το χειρόγραφο κέλυφος
  // έγραφε aria-label="Νέα εργασία σε επιλεγμένα" πάνω από τον ορατό τίτλο
  // «Φωτογράφισε το τιμολόγιο»: ο τυφλός χρήστης άκουγε μαζική ενέργεια τη
  // στιγμή που φωτογράφιζε παραστατικό. Το <Modal> παράγει την ετικέτα από τον
  // ΟΡΑΤΟ τίτλο, οπότε τα δύο δεν μπορούν να ξαναχωρίσουν.
  return (
    <Modal open onClose={close} width={460}
      title="Φωτογράφισε το τιμολόγιο" subtitle={item.description}
      footer={<>
        <Btn variant="secondary" disabled={busy} onClick={close}>Ακύρωση</Btn>
        {(stage === 'confirm' || stage === 'saving') && (
          <Btn variant="primary" disabled={!canSave || busy} onClick={save}>
            {stage === 'saving' ? 'Καταχώρηση…' : 'Καταχώρησε με το παραστατικό'}
          </Btn>
        )}
      </>}>
      {stage === 'pick' && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()}
            style={{ width: '100%', padding: '22px 16px', borderRadius: T.radius.card, border: '1px dashed var(--border-default)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: T.font.sans }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="4"/></svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Φωτογραφία ή PDF</span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>Διαβάζουμε ποσό, πάροχο και ημερομηνία. Τα ελέγχεις πριν αποθηκευτούν.</span>
          </button>
          {/* Το περιθώριο 12 έγινε 0: το σώμα του <Modal> έχει ήδη δικό του gap
              ανάμεσα στα παιδιά και τα δύο μαζί έδιναν διπλό κενό. */}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, margin: 0, lineHeight: 1.5 }}>
            Το αρχείο μπαίνει στο Αρχείο του ακινήτου και η δαπάνη καταχωρείται πληρωμένη. Χωρίς αρχείο δεν γράφεται ποσό πουθενά.
          </p>
        </>
      )}

      {stage === 'reading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
          <Skeleton h={16} r={6} /><Skeleton h={16} r={6} /><Skeleton h={16} r={6} />
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans, margin: 0 }}>Διαβάζω το έγγραφο…</p>
        </div>
      )}

      {(stage === 'confirm' || stage === 'saving') && doc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name}</span>
            {/* Η ΒΕΒΑΙΟΤΗΤΑ ΤΗΣ ΑΝΑΓΝΩΣΗΣ, ρητά. Χαμηλή βεβαιότητα σημαίνει
                «κοίτα τα νούμερα», όχι «είναι λάθος». Οταν το μοντέλο δεν την
                έδωσε, το πεδίο λείπει και η θέση μένει κενή: το «Διαβάστηκε
                καθαρά» ήταν κρίση πάνω σε προεπιλογή 70 που δεν είπε κανείς. */}
            {typeof doc.confidence === 'number' && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: doc.confidence >= 80 ? 'var(--text-tertiary)' : 'var(--warning)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
                {doc.confidence >= 80 ? 'Διαβάστηκε καθαρά' : 'Έλεγξε τα πεδία'}
              </span>
            )}
          </div>
          <div style={{ ...formGrid(150, 210), gap: 12 }}>
            <div><FL>Ποσό (€) *</FL><Inp ariaLabel="Ποσό σε ευρώ" value={amount} onChange={setAmount} placeholder="" type="number" min={0} /></div>
            <div><FL>Ημερομηνία *</FL><DatePicker value={date} onChange={setDate} /></div>
          </div>
          <div><FL>Πάροχος</FL><Inp ariaLabel="Πάροχος" value={provider} onChange={setProvider} placeholder="Παράδειγμα: Υδραυλικές Εργασίες ΕΠΕ" /></div>
          <div><FL>Περιγραφή δαπάνης</FL><Inp ariaLabel="Περιγραφή δαπάνης" value={desc} onChange={setDesc} placeholder="Περιγραφή" /></div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, margin: 0, lineHeight: 1.5 }}>
            Καταχωρείται ως <strong style={{ color: 'var(--text-secondary)' }}>{expenseCategoryFor(item.category).cat}</strong>, πληρωμένη, με το αρχείο συνημμένο στο Αρχείο.
          </p>
        </div>
      )}

      {err && <p style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, margin: 0, lineHeight: 1.5 }}>{err}</p>}

      <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.currentTarget.value = '' }} />
    </Modal>
  )
}