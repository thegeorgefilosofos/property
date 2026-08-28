'use client'
// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΡΤΕΛΑ ΜΙΑΣ ΕΚΚΡΕΜΟΤΗΤΑΣ
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { T, Modal, Btn, fe, fieldRow } from '@/components/Theme'
import { WHO_LABEL } from '@/lib/accounting/dossier'
import { DatePicker, CustomSelect } from '../UIComponents'
import { FL, Inp, Sel, SubTaskEditor, CommentsEditor, iStyle } from './Bits'
import { mkEmpty, fmtDate } from './calc'
import { CATEGORIES, PRIORITIES, STATUSES, RECURRING_OPTIONS, ITEM_TAGS, type ChecklistItem, type Contact, type Priority, type Recurring, type Status } from './model'

// ─── ItemModal ────────────────────────────────────────────────────────────────
export function ItemModal({ item, contacts, onSave, onClose, onScan }: {
  item?: ChecklistItem; contacts: Contact[]
  onSave: (data: ReturnType<typeof mkEmpty>) => void; onClose: () => void
  /** «Φωτογράφισε το τιμολόγιο» — ο ΜΟΝΟΣ δρόμος για πραγματικό κόστος. */
  onScan?: () => void
}) {
  const [form, setForm] = useState<ReturnType<typeof mkEmpty>>(item ? {
    description: item.description, category: item.category, note: item.note || '',
    priority: item.priority, due_date: item.due_date || '',
    recurring: item.recurring, assigned_contact_id: item.assigned_contact_id || '',
    assigned_contact_name: item.assigned_contact_name || '',
    estimated_cost: String(item.estimated_cost || ''), status: item.status,
    subtasks: item._subtasks || [], tags: item._tags || [],
    comments: item._comments || [], depends_on: item.depends_on || '',
  } : mkEmpty())
  // Ένα καθαρό form — χωρίς tabs, χωρίς επαναλήψεις (Google λογική).
  //
  // ΤΟ ΤΙΤΛΟ-ΣΩΜΑ-ΕΝΕΡΓΕΙΕΣ ΤΟ ΔΙΝΕΙ ΤΟ <Modal>. Το χειρόγραφο κέλυφος έγραφε
  // ΔΙΚΟ του radius (24 αντί για T.radius.modal=18) και ΔΙΚΟ του μέγεθος τίτλου
  // (20 αντί για TT.h2=16): δύο τιμές που έκαναν αυτό το παράθυρο να μοιάζει
  // μεγαλύτερο από κάθε άλλο της εφαρμογής, δίπλα-δίπλα στην ίδια οθόνη με το
  // παράθυρο επιβεβαίωσης. Escape, επιστροφή εστίασης και κλείδωμα κύλισης
  // φόντου ΔΕΝ υπήρχαν καθόλου — τώρα έρχονται μαζί με το primitive.
  const canSave = !!form.description.trim()
  return (
    <Modal open onClose={onClose} size="md"
      title={item ? 'Επεξεργασία εκκρεμότητας' : 'Νέα εκκρεμότητα'}
      footer={<>
        <Btn variant="secondary" onClick={onClose}>Ακύρωση</Btn>
        <Btn variant="primary" disabled={!canSave} onClick={() => { if (canSave) onSave(form) }}>{item ? 'Αποθήκευση' : 'Προσθήκη εκκρεμότητας'}</Btn>
      </>}>
      <div><FL>Περιγραφή *</FL><Inp ariaLabel="Περιγραφή" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Service καλοριφέρ" /></div>
      {/* ═══ ΔΥΟ ΣΕΙΡΕΣ ΤΩΝ ΤΡΙΩΝ, ΟΧΙ ΤΕΣΣΕΡΙΣ ΤΩΝ ΔΥΟ ══════════════════════
          Τα επτά πεδία κάθονταν σε τέσσερα ξεχωριστά πλέγματα των δύο, οπότε η
          φόρμα έβγαινε 2-2-2-1: τέσσερις σειρές, με την τελευταία μισή άδεια
          και το πλάτος της κάρτας αχρησιμοποίητο δεξιά σε κάθε μία.

          Και ο χωρισμός δεν σήμαινε τίποτα: η «Κατάσταση» κάθισε με το κόστος
          επειδή έτσι έτυχε να προστεθεί, όχι επειδή έχουν σχέση.

          Τώρα οι σειρές λένε κάτι. Η πρώτη είναι ΤΙ ΕΙΝΑΙ η εργασία:
          κατηγορία, προτεραιότητα, κατάσταση. Η δεύτερη είναι ΠΟΤΕ ΚΑΙ ΠΟΣΟ:
          προθεσμία, επανάληψη, εκτίμηση κόστους. Η ανάθεση μένει μόνη της σε
          όλο το πλάτος, γιατί δείχνει ονόματα ανθρώπων και είναι το μόνο πεδίο
          που μια στήλη των 170 θα του έκοβε το όνομα.

          Το `fieldRow` μοιράζει ΙΣΑ σε όλο το πλάτος, σε αντίθεση με το
          `formGrid` που κόβει κάθε στήλη σε σταθερό μέγιστο και αφήνει το
          υπόλοιπο κενό. Σε στενή οθόνη τυλίγει μόνο του. */}
      <div {...fieldRow(170, 12)}>
        <div><FL>Κατηγορία</FL><Sel value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))} /></div>
        <div><FL>Προτεραιότητα</FL><Sel value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v as Priority }))} options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} /></div>
        <div><FL>Κατάσταση</FL><Sel value={form.status} onChange={v => setForm(f => ({ ...f, status: v as Status }))} options={STATUSES.map(st => ({ value: st.value, label: st.label }))} /></div>
      </div>
      <div {...fieldRow(170, 12)}>
        <div><FL>Προθεσμία</FL><DatePicker value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} /></div>
        <div><FL>Επανάληψη</FL><Sel value={form.recurring} onChange={v => setForm(f => ({ ...f, recurring: v as Recurring }))} options={RECURRING_OPTIONS} /></div>
        <div><FL>Δική σου εκτίμηση κόστους (€)</FL><Inp ariaLabel="Δική σου εκτίμηση κόστους σε ευρώ" value={form.estimated_cost} onChange={v => setForm(f => ({ ...f, estimated_cost: v }))} placeholder="προαιρετικό" type="number" min={0} /></div>
      </div>
      <div>
        <div><FL>Ανάθεση σε επαφή</FL>
          <CustomSelect value={form.assigned_contact_id}
            onChange={v => { const c = contacts.find(x => x.id === v); setForm(f => ({ ...f, assigned_contact_id: v, assigned_contact_name: c?.full_name || '' })) }}
            placeholder="Χωρίς ανάθεση"
            options={[{ value: '', label: 'Χωρίς ανάθεση' }, ...contacts.map(c => ({ value: c.id, label: c.full_name }))]} />
      </div>
      </div>
      <div>
        <FL>Ετικέτες</FL>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ITEM_TAGS.map(t => (
            <button key={t} type="button" title={t === 'DIY' ? 'Do It Yourself, εργασία που κάνεις μόνος σου' : undefined} onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))}
              style={{ padding: '7px 14px', borderRadius: T.radius.pill, border: '1px solid ' + (form.tags.includes(t) ? 'var(--accent)' : 'var(--border-subtle)'), background: form.tags.includes(t) ? 'var(--accent-soft)' : 'transparent', color: form.tags.includes(t) ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: form.tags.includes(t) ? 600 : 400, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', fontFamily: T.font.sans }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {/* ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΚΟΣΤΟΣ ΔΕΝ ΠΛΗΚΤΡΟΛΟΓΕΙΤΑΙ. Εδώ φαίνεται τι λέει το χαρτί,
          ή το κουμπί που το φέρνει. Χωρίς παραστατικό δεν υπάρχει νούμερο. */}
      <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
        <FL>Πραγματικό κόστος</FL>
        {item?._receipt ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(item._receipt.amount)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
              {item._receipt.provider ? `${item._receipt.provider} · ` : ''}{fmtDate(item._receipt.date)} · {item._receipt.name}
            </span>
            {onScan && <button type="button" onClick={onScan} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: T.font.sans }}>Άλλαξέ το</button>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, margin: 0, flex: 1, minWidth: 180, lineHeight: 1.5 }}>
              Μπαίνει μόνο από το τιμολόγιο ή την απόδειξη. Φωτογράφισέ το και καταχωρείται το ποσό, το αρχείο και η δαπάνη μαζί.
            </p>
            {onScan && <button type="button" onClick={onScan} style={{ padding: '8px 14px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>Φωτογράφισε το τιμολόγιο</button>}
          </div>
        )}
      </div>
      {/* ΟΙ ΔΥΟ EDITORS ΠΟΥ ΟΡΙΖΟΝΤΑΝ ΚΑΙ ΔΕΝ ΑΠΟΔΙΔΟΝΤΑΝ ΠΟΥΘΕΝΑ. Τα βήματα
          μετρούνταν στον Πίνακα («2/5 υπο-εργασίες») χωρίς κανέναν τρόπο να
          δημιουργηθούν και τα σχόλια δεν γράφονταν ποτέ. */}
      <div><FL>Βήματα ({form.subtasks.filter(st => st.done).length}/{form.subtasks.length})</FL>
        <SubTaskEditor subtasks={form.subtasks} onChange={sub => setForm(f => ({ ...f, subtasks: sub }))} />
      </div>
      <div><FL>Σημείωση</FL>
        <textarea value={form.note} aria-label="Σημείωση" onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Επιπλέον πληροφορίες…" rows={3} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-default)')} />
      </div>
      <div><FL>Ιστορικό ({form.comments.length})</FL>
        <CommentsEditor comments={form.comments} onChange={c => setForm(f => ({ ...f, comments: c }))} />
      </div>
      {/* Η ΕΠΙΣΗΜΗ ΠΗΓΗ ΤΗΣ ΥΠΟΧΡΕΩΣΗΣ, όταν δεν την έγραψε ο χρήστης. */}
      {item?._src && (
        <div style={{ padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, margin: 0 }}>
            {item._who ? <strong style={{ color: 'var(--text-primary)' }}>{WHO_LABEL[item._who]}. </strong> : null}
            <a href={item._src} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Επίσημη πηγή</a>
          </p>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        {/* ΚΑΜΙΑ ΥΠΟΣΧΕΣΗ «ΕΚΚΡΕΜΗΣ ΔΑΠΑΝΗ». Η εκτίμηση δεν γράφεται πλέον στα
            Δαπάνες: ο προϋπολογισμός και το σύνολο που πάει στο Ε2 δεν δέχονται
            νούμερο χωρίς παραστατικό. */}
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, margin: 0 }}>{form.due_date ? <>Με προθεσμία μπαίνει στο <strong style={{ color: 'var(--text-primary)' }}>ημερολόγιο</strong> με υπενθύμιση email. Η εκτίμηση μένει εδώ, <strong style={{ color: 'var(--text-primary)' }}>δεν γίνεται δαπάνη</strong> πριν υπάρξει παραστατικό.</> : 'Βάλε προθεσμία για αυτόματη υπενθύμιση στο ημερολόγιο.'}</p>
      </div>
    </Modal>
  )
}
