'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΕΤΟΙΜΑ ΠΡΟΤΥΠΑ ΚΑΙ ΟΙ ΘΕΣΜΙΚΕΣ ΥΠΟΧΡΕΩΣΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// Δύο πηγές, μία οθόνη: τα πρότυπα λένε τι κάνει κανείς σε μια κατάσταση, οι
// υποχρεώσεις τι επιβάλλει ο νόμος με ημερομηνία. Φαίνονται μόνο όσα ταιριάζουν
// στο ακίνητο: ο ιδιοκτήτης κενού ακινήτου δεν χρειάζεται λίστα αποχώρησης.
// ═══════════════════════════════════════════════════════════════════════════
import { T, Modal } from '@/components/Theme'
import { fmtDate } from './calc'
import { TEMPLATES, type SmartSuggestion } from './model'
import type { ChecklistTaskDraft } from '@/lib/checklist/obligationTasks'
import type { FieldContext } from '@/lib/property/fields'


// ─── TemplateModal ────────────────────────────────────────────────────────────
export function TemplateModal({ onSelect, onLoadObligations, onClose, ctx, pending, smart = [] }: {
  onSelect: (key: string) => void; onLoadObligations: () => void; onClose: () => void
  ctx: FieldContext; pending: ChecklistTaskDraft[]; smart?: SmartSuggestion[]
}) {
  // Το ίδιο φίλτρο ΚΑΙ στα «Προτεινόμενα»: μια πρόταση που το `when` κρύβει από
  // τη λίστα δεν επιτρέπεται να μπει από την πίσω πόρτα ως «προτεινόμενη».
  const visibleSmart = smart.filter(sg => { const t = TEMPLATES[sg.templateKey]; return !t || !t.when || t.when(ctx) })
  // Ό,τι εμφανίζεται στα «Προτεινόμενα για εσένα» δεν επαναλαμβάνεται στη γενική λίστα.
  const smartKeys = new Set(visibleSmart.map(sg => sg.templateKey))
  // ΤΟ ΦΙΛΤΡΟ ΕΙΝΑΙ Η ΚΑΤΑΣΤΑΣΗ ΤΟΥ ΑΚΙΝΗΤΟΥ, ΟΧΙ Ο ΤΥΠΟΣ ΣΥΝΔΡΟΜΗΣ. Πριν, τα
  // πρότυπα «Ανακαίνιση/Airbnb/Αγορά» κρύβονταν με κριτήριο `profileType`, δηλαδή
  // ο ιδιώτης με ένα ακίνητο στο Airbnb δεν έβλεπε ποτέ τη λίστα βραχυχρόνιας —
  // ενώ ο επαγγελματίας με κενό ακίνητο τα έβλεπε όλα. Τώρα κρίνει η επιλογή του
  // χρήστη: κατάσταση ακινήτου και πλήθος ακινήτων (lib/property/fields.ts).
  const entries = Object.entries(TEMPLATES).filter(([key, t]) => (!t.when || t.when(ctx)) && !smartKeys.has(key))
  // Η πρώτη προθεσμία που λείπει, για να λέει η κάρτα κάτι αληθινό και όχι πλήθος.
  const firstDue = pending.filter(d => !!d.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0]
  // ΤΟ ΚΕΛΥΦΟΣ ΕΦΥΓΕ ΣΤΟ <Modal>. Ήταν 12 γραμμές χειρόγραφου παραθύρου (scrim,
  // radius 24, δικό του «×», δικό του maxHeight 85vh) που έλεγαν ό,τι λέει ήδη
  // το primitive — και ΔΕΝ έλεγαν τίποτα για Escape, εστίαση ή κλείδωμα κύλισης
  // φόντου: τα τρία που το χειρόγραφο παράθυρο ξεχνά πάντα. Έμεινε μόνο το
  // περιεχόμενο, που είναι και το μόνο που ήταν δικό του.
  return (
    <Modal open onClose={onClose} width={620}
      title="Έτοιμα πρότυπα"
      subtitle="Έτοιμες λίστες εργασιών, και οι υποχρεώσεις που προκύπτουν από τον νόμο για αυτό το ακίνητο.">
      {visibleSmart.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 10 }}>Προτεινόμενα για εσένα</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleSmart.map(s => {
              const t = TEMPLATES[s.templateKey]
              return (
                <button key={s.templateKey} type="button" onClick={() => { onSelect(s.templateKey); onClose() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '13px 16px', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-surface)' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.reason}{t ? ` · ${t.items.length} εργασίες` : ''}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 10 }}>Υποχρεώσεις &amp; νομοθεσία</div>
        {/* ΟΧΙ «Ημερολόγιο ΑΑΔΕ 2026» με δέκα σταθερές ημερομηνίες 1ης του
            μήνα. Οι υποχρεώσεις υπολογίζονται για ΑΥΤΟ το ακίνητο, από το ένα
            φορολογικό ημερολόγιο και από τις αλλαγές νομοθεσίας που το
            αφορούν. Ο αριθμός στην κάρτα είναι όσες ΛΕΙΠΟΥΝ, όχι ένα σταθερό
            πλήθος: όταν δεν λείπει καμία, η κάρτα το λέει και δεν γράφει τίποτα. */}
        <button type="button" onClick={() => { if (pending.length > 0) { onLoadObligations(); onClose() } }}
          disabled={pending.length === 0}
          title={pending.length === 0 ? 'Δεν λείπει καμία υποχρέωση αυτή τη στιγμή' : 'Προσθήκη των υποχρεώσεων που λείπουν'}
          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px', borderRadius: T.radius.card, border: '1px solid ' + (pending.length === 0 ? 'var(--border-subtle)' : 'var(--accent-border)'), background: pending.length === 0 ? 'var(--bg-surface)' : 'var(--accent-soft)', cursor: pending.length === 0 ? 'default' : 'pointer', textAlign: 'left', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}
          onMouseEnter={e => { if (pending.length > 0) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { if (pending.length > 0) e.currentTarget.style.borderColor = 'var(--accent-border)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: pending.length === 0 ? 'var(--bg-elevated)' : 'var(--accent)', color: pending.length === 0 ? 'var(--text-tertiary)' : 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
              {pending.length === 0 ? 'Οι υποχρεώσεις είναι όλες μέσα' : `Πρόσθεσε ${pending.length} ${pending.length === 1 ? 'υποχρέωση' : 'υποχρεώσεις'}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {pending.length === 0
                ? 'Τίποτα δεν λείπει από το φορολογικό ημερολόγιο για αυτό το ακίνητο.'
                : firstDue ? `Πρώτη προθεσμία: ${firstDue.description}, ${fmtDate(firstDue.due_date)}` : 'Αλλαγές νομοθεσίας που αφορούν αυτό το ακίνητο'}
            </div>
          </div>
          {pending.length > 0 && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>}
        </button>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 10 }}>Λίστες εργασιών</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 10 }}>
          {entries.map(([key, t]) => {
            const icons: Record<string, string> = {
              checkin: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4 M10 17l5-5-5-5 M15 12H3',
              checkout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9',
              maintenance: 'M14.7 6.3a4 4 0 00-5.6 5.6l-6 6L5 20l6-6a4 4 0 005.6-5.6l-2.3 2.3-2-2z',
              legal: 'M12 3v18 M5 7h14 M5 7l-2.5 6a4 4 0 008 0z M19 7l2.5 6a4 4 0 01-8 0z',
              renovation: 'M3 21h18 M5 21V8l7-5 7 5v13 M10 21v-6h4v6',
              airbnb: 'M2 8h16a2 2 0 012 2v9 M2 4v15 M2 16h20 M6 8V6a2 2 0 012-2h3',
              purchase: 'M6 6h15l-1.6 9H7.6z M6 6 5 3H2 M9 20h.01 M17 20h.01',
            }
            const path = icons[key] || 'M4 6h16 M4 12h16 M4 18h10'
            return (
              <button key={key} type="button" onClick={() => { onSelect(key); onClose() }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{path.split(' M').map((seg, j) => <path key={j} d={(j === 0 ? '' : 'M') + seg} />)}</svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</div>
                  {/* ΚΑΝΕΝΑ «~1.850 €» ΕΔΩ. Το σύνολο ήταν άθροισμα 24 σταθερών
                      χωρίς πηγή, έτος ή περιοχή. Στη θέση του μπαίνει ο λόγος
                      που το πρότυπο εμφανίζεται σε αυτόν τον χρήστη. */}
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.items.length} εργασίες{t.why ? ` · ${t.why}` : ''}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}