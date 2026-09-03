'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΜΙΚΡΑ ΚΟΜΜΑΤΙΑ ΤΩΝ ΕΚΚΡΕΜΟΤΗΤΩΝ
// ─────────────────────────────────────────────────────────────────────────
// Ετικέτα, πεδίο, επιλογέας, φίλτρο, ένδειξη προτεραιότητας, συντάκτης
// υποεργασιών, συντάκτης σχολίων, μενού εξαγωγών. Κανένα δεν ξέρει από βάση:
// παίρνουν ό,τι δείχνουν και επιστρέφουν ό,τι άλλαξε.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { T, EmptyState } from '@/components/Theme'
import { CustomSelect } from '../UIComponents'
import { MessageSquare } from 'lucide-react'
import { getPri, priDotColor, priShowDot } from './calc'
import type { Comment, SubTask } from './model'

// ══ ΤΟ ΥΨΟΣ ΒΓΑΙΝΕ ΑΠΟ PADDING, ΚΑΙ ΓΙ' ΑΥΤΟ ΔΕΝ ΣΥΜΦΩΝΟΥΣΕ ΜΕ ΚΑΝΕΝΑ ══════
// Μετρημένο στη γραμμή φίλτρων των Εκκρεμοτήτων, στην ίδια σειρά: πεδίο
// αναζήτησης 38, δύο φίλτρα 35, ομάδα διάταξης 34. Τέσσερα χειριστήρια δίπλα
// δίπλα, τέσσερα ύψη, κανένα τους γραμμένο ως ύψος. Με padding, κάθε αλλαγή
// μεγέθους γραμμάτων μετακινεί σιωπηλά το κουτί.
//
// Η κλίμακα του έργου δίνει 40 για ό,τι κάθεται σε σειρά με πεδίο και 32 για
// τα κουμπάκια μέσα σε ομάδα. Η ομάδα των δύο διατάξεων βγαίνει έτσι κι αυτή
// 40: 32 το κουμπί, 3 το γέμισμα, 1 το περίγραμμα.
export const iStyle: React.CSSProperties = {
  width: '100%', height: T.h.lg, padding: '0 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  // ΧΩΡΙΣ `outline: none`. Το ενσώματο στυλ πατούσε τον καθολικό κανόνα
  // `input:focus-visible` και η θέση της εστίασης χανόταν: μετρημένο με
  // πραγματικό Tab, το πεδίο αναζήτησης δεν άλλαζε ΚΑΜΙΑ ιδιότητα όψης.
  color: 'var(--text-primary)', fontSize: 14,
  fontFamily: T.font.sans, boxSizing: 'border-box', transition: 'border-color 0.15s',
}
export function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{children}</label>
}
// Το `min` περνά μέχρι το πεδίο: χωρίς αυτό, τα ποσά και οι εκτιμήσεις κόστους
// δέχονταν αρνητικούς αριθμούς — δαπάνη μείον διακοσίων ευρώ δεν υπάρχει.
// Ο τύπος ΔΕΝ δέχεται 'date': το ημερολόγιο του περιηγητή γράφει αγγλικά και
// αντιστρέφει ημέρα με μήνα. Οι ημερομηνίες περνούν από τον DatePicker.
// Η <FL> γράφει την ετικέτα ΔΙΠΛΑ στο πεδίο, όχι συνδεδεμένη με αυτό: ο βλέπων
// τη διαβάζει, ο αναγνώστης οθόνης ακούει «πλαίσιο κειμένου». Πέντε κλήσεις εδώ,
// οπότε το όνομα γράφεται ρητά σε καθεμία αντί για συμφραζόμενα.
export function Inp({ value, onChange, placeholder, type = 'text', min, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: 'text' | 'email' | 'tel' | 'url' | 'search' | 'number' | 'password'; min?: number; ariaLabel?: string }) {
  return <input type={type} min={min} value={value} aria-label={ariaLabel} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} />
}
// Ένα σημείο για όλα τα πεδία επιλογής της οθόνης. Ήταν ντόπιο <select>, δηλαδή
// το λειτουργικό ζωγράφιζε τη λίστα με δικά του χρώματα μέσα σε μια οθόνη που
// έχει δικό της σύστημα πεδίων.
export function Sel({ value, onChange, options, ariaLabel }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; ariaLabel: string }) {
  return <CustomSelect ariaLabel={ariaLabel} value={value} onChange={onChange} options={options} />
}
// Σαφής, μη-διφορούμενη ένδειξη χρόνου: ολογράφως «ημέρες» (ποτέ «μ» που μπερδεύεται με μήνες).
export function relDays(n: number) { const a = Math.abs(n); return a === 0 ? 'σήμερα' : `${a} ${a === 1 ? 'ημέρα' : 'ημέρες'}` }

// Premium, καθαρό φίλτρο-dropdown: portal (δεν κόβεται από overflow), σαφής επιλεγμένη
// κατάσταση, ήρεμα χρώματα. Αντικαθιστά τα «φθηνά» native selects.
/**
 * ΟΤΑΝ ΔΕΝ ΦΙΛΤΡΑΡΕΙ ΤΙΠΟΤΑ, ΤΟ ΚΟΥΜΠΙ ΛΕΕΙ ΤΟ ΟΝΟΜΑ ΤΟΥ ΠΕΔΙΟΥ.
 *
 * Το «Όλες οι προτεραιότητες» είναι σωστή διατύπωση για ΕΠΙΛΟΓΗ μέσα στο μενού:
 * εκεί στέκει δίπλα στην «Κρίσιμη» και στην «Υψηλή» και λέει ποια από τις
 * τέσσερις διάλεξες. Πάνω στο κλειστό κουμπί λέει «δεν έχω φιλτράρει», δηλαδή
 * τίποτα, με δεκαέξι γράμματα παραπάνω.
 *
 * ΚΑΙ ΔΕΝ ΧΩΡΑΕΙ. ΜΕΤΡΗΜΕΝΟ ΣΕ Galaxy A, 360×800, με τη γραμμή φίλτρων σε δύο
 * στήλες: το κουμπί δίνει 116 στο κείμενο και το «Όλες οι προτεραιότητες» θέλει
 * 160, το «Όλες οι καταστάσεις» 138. Και τα δύο έβγαιναν «Όλες οι κατα…»,
 * δηλαδή δύο κουμπιά που δείχνουν το ίδιο πράγμα και δεν λένε κανένα.
 * Το «Προτεραιότητα» θέλει 93 και γράφεται ολόκληρο.
 */
export function FilterSelect({ value, onChange, options, minWidth = 168, idle }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; minWidth?: number; idle?: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number }>({ top: 0, left: 0, width: minWidth, maxH: 320 })
  const current = options.find(o => o.value === value) || options[0]
  const active = value !== 'all'
  const reposition = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const menuH = Math.min(options.length * 40 + 12, 320)
    const openUp = r.bottom + menuH + 8 > window.innerHeight && r.top - menuH - 8 > 0
    // maxH = ο ίδιος διαθέσιμος χώρος που δεσμεύτηκε για το flip, ώστε το πραγματικό ύψος
    // να μη ξεπερνά τον χώρο και το πλεόνασμα να κάνει εσωτερικό scroll (αντί να κόβεται).
    const avail = openUp ? r.top - 8 : window.innerHeight - r.bottom - 8
    setPos({ top: openUp ? r.top - menuH - 6 : r.bottom + 6, left: r.left, width: r.width, maxH: Math.max(120, Math.min(menuH, avail - 6)) })
  }
  useEffect(() => {
    if (!open) return
    reposition()
    const h = (e: MouseEvent) => { const t = e.target as Node; if (btnRef.current && !btnRef.current.contains(t) && menuRef.current && !menuRef.current.contains(t)) setOpen(false) }
    const s = () => reposition()
    document.addEventListener('mousedown', h); window.addEventListener('scroll', s, true); window.addEventListener('resize', s)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', s, true); window.removeEventListener('resize', s) }
  }, [open])
  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: T.h.lg, padding: '0 12px 0 14px', minWidth, borderRadius: T.radius.pill, border: '1px solid ' + (open || active ? 'var(--accent)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'var(--bg-surface)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 'var(--fs-base)', fontWeight: active ? 600 : 500, cursor: 'pointer', fontFamily: T.font.sans, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', whiteSpace: 'nowrap' }}>
        <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{!active && idle ? idle : current.label}</span>
        <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, opacity: 0.7 }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, boxShadow: 'var(--elev-3)', padding: 6, zIndex: 2000 }}>
          {options.map(o => {
            const sel = o.value === value
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: T.radius.inner, border: 'none', background: sel ? 'var(--accent-soft)' : 'transparent', color: sel ? 'var(--accent)' : 'var(--text-primary)', fontSize: 'var(--fs-base)', fontWeight: sel ? 600 : 400, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans, transition: 'background 0.12s', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ flex: 1 }}>{o.label}</span>
                {sel && <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5"/></svg>}
              </button>
            )
          })}
        </div>, document.body)}
    </>
  )
}

// Μικρή, διακριτική ένδειξη προτεραιότητας: τελεία + ήσυχη ετικέτα.
export function PriorityCue({ priority }: { priority: string }) {
  const label = getPri(priority).label
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      {priShowDot(priority) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: priority === 'critical' ? priDotColor(priority) : 'transparent', border: priority === 'critical' ? 'none' : '1.5px solid var(--text-tertiary)', boxSizing: 'border-box', flexShrink: 0 }} />}
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: priority === 'critical' ? 600 : 400 }}>{label}</span>
    </span>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
export function SubTaskEditor({ subtasks, onChange }: { subtasks: SubTask[]; onChange: (s: SubTask[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([...subtasks, { id: Date.now().toString(), text: input.trim(), done: false }]); setInput('') }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {subtasks.map(st => (
          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={() => onChange(subtasks.map(s => s.id === st.id ? { ...s, done: !s.done } : s))}
              style={{ width: 18, height: 18, borderRadius: 6, border: '2px solid ' + (st.done ? 'var(--accent)' : 'var(--border-default)'), background: st.done ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
              {st.done && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--text-inverse)" strokeWidth="2" strokeLinecap="round"/></svg>}
            </button>
            <span style={{ flex: 1, fontSize: 'var(--fs-base)', color: st.done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: st.done ? 'line-through' : 'none' }}>{st.text}</span>
            <button type="button" onClick={() => onChange(subtasks.filter(s => s.id !== st.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1 }}><svg aria-hidden="true" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} aria-label="Νέο βήμα" onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Νέο βήμα…" style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

export function CommentsEditor({ comments, onChange }: { comments: Comment[]; onChange: (c: Comment[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([{ id: Date.now().toString(), text: input.trim(), ts: new Date().toISOString() }, ...comments]); setInput('') }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} aria-label="Νέο σχόλιο" onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Γράψε σχόλιο…" style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {comments.length === 0 && <EmptyState icon={<MessageSquare size={20} />} title="Κανένα σχόλιο ακόμη" hint="Γράψε σημείωση για να κρατήσεις το ιστορικό της εκκρεμότητας." />}
        {comments.map(c => (
          <div key={c.id} style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)', position: 'relative' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginBottom: 4, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{new Date(c.ts).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-primary)', lineHeight: 1.5, paddingRight: 20 }}>{c.text}</div>
            <button type="button" onClick={() => onChange(comments.filter(x => x.id !== c.id))} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}><svg aria-hidden="true" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ExportMenu ───────────────────────────────────────────────────────────────
// Μία διακριτική «Εξαγωγή» αντί για δύο φωναχτά κουμπιά: αναδιπλώνει Excel, PDF και
// (μόνο για επαγγελματίες) το Πρωτόκολλο Παράδοσης σε ένα ήσυχο μενού.
export function ExportMenu({ onExcel, onPdf, onHandover }: { onExcel: () => void; onPdf: () => void; onHandover?: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  const opts = [
    { label: 'Αναλυτικό Excel', sub: 'Σύνοψη, ανάλυση και εκκρεμότητες', fn: onExcel },
    { label: 'Αναφορά PDF', sub: 'Εκτυπώσιμη λίστα ανά κατηγορία', fn: onPdf },
    ...(onHandover ? [{ label: 'Πρωτόκολλο παράδοσης', sub: 'Έντυπο 12 ενοτήτων παράδοσης/αποχώρησης', fn: onHandover }] : []),
  ]
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Εξαγωγή δεδομένων"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: T.h.md, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid ' + (open ? 'var(--accent)' : 'var(--border-default)'), background: open ? 'var(--accent-soft)' : 'transparent', color: open ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
        <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Εξαγωγή
        <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 6, zIndex: 9999, minWidth: 250, boxShadow: 'var(--elev-3)' }}>
          {opts.map((o, i) => (
            <button key={i} type="button" onClick={() => { o.fn(); setOpen(false) }}
              style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '9px 12px', borderRadius: T.radius.inner, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>{o.label}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 1 }}>{o.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}