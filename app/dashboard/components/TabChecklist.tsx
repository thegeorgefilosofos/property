'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { DatePicker } from './UIComponents'

const supabase = createSupabaseClient()

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = 'critical' | 'high' | 'normal' | 'low'
type Status   = 'pending' | 'in_progress' | 'done' | 'skipped'
type Recurring = 'none' | 'monthly' | 'quarterly' | 'yearly'
type ViewMode  = 'list' | 'board' | 'timeline'
type FilterStatus = 'all' | 'pending' | 'in_progress' | 'done' | 'overdue'

interface SubTask  { id: string; text: string; done: boolean }
interface Comment  { id: string; text: string; ts: string }
interface ChecklistItem {
  id: string; property_id: string; user_id: string; category: string
  description: string; note: string | null; completed: boolean
  completed_at: string | null; created_at: string; priority: Priority
  due_date: string | null; start_date?: string | null; recurring: Recurring
  assigned_contact_id: string | null; assigned_contact_name: string | null
  estimated_cost: number; actual_cost: number; status: Status
  template_id: string | null; sort_order: number; budget?: number
  depends_on?: string | null
  _subtasks?: SubTask[]; _comments?: Comment[]; _tags?: string[]
}
interface Contact { id: string; full_name: string; role: string; phone?: string | null }
interface SmartSuggestion { title: string; reason: string; templateKey: string }
interface TabChecklistProps { propertyId: string; userId: string }

// ─── Design tokens (matching rest of app) ────────────────────────────────────
const T = {
  radius: { card: '14px', inner: '10px', badge: '6px', btn: '10px', pill: '100px' },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
}

const iStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  fontFamily: T.font.sans, boxSizing: 'border-box', transition: 'border-color 0.15s',
}
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{children}</label>
}
function Inp({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'checkin',     label: 'Παράδοση Ακινήτου',    color: 'var(--positive)', dot: '#34a853' },
  { id: 'checkout',   label: 'Αποχώρηση Ενοικιαστή', color: 'var(--negative)', dot: '#ea4335' },
  { id: 'maintenance',label: 'Συντήρηση',              color: 'var(--warning)', dot: '#f29900' },
  { id: 'legal',      label: 'Νομικά / ΑΑΔΕ',         color: 'var(--info)', dot: '#1a73e8' },
  { id: 'renovation', label: 'Ανακαίνιση',            color: 'var(--info)', dot: '#1967d2' },
  { id: 'purchase',   label: 'Αγορά Ακινήτου',        color: 'var(--info)', dot: '#185fa5' },
  { id: 'airbnb',     label: 'Short-term / Airbnb',   color: 'var(--negative)', dot: '#d93025' },
  { id: 'financial',  label: 'Οικονομικά',            color: 'var(--accent)', dot: '#d4af42' },
  { id: 'other',      label: 'Άλλο',                  color: 'var(--text-secondary)', dot: '#888' },
]
const PRIORITIES = [
  { value: 'critical', label: 'Κρίσιμο',  color: 'var(--negative)', bg: 'rgba(255,59,48,0.12)' },
  { value: 'high',     label: 'Υψηλή',    color: 'var(--warning)', bg: 'rgba(255,149,0,0.12)' },
  { value: 'normal',   label: 'Κανονική', color: 'var(--info)', bg: 'rgba(10,132,255,0.12)' },
  { value: 'low',      label: 'Χαμηλή',   color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)' },
]
const STATUSES = [
  { value: 'pending',     label: 'Εκκρεμεί',     color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)' },
  { value: 'in_progress', label: 'Σε εξέλιξη',   color: 'var(--info)', bg: 'rgba(10,132,255,0.12)' },
  { value: 'done',        label: 'Ολοκληρώθηκε', color: 'var(--positive)', bg: 'rgba(52,199,89,0.12)' },
  { value: 'skipped',     label: 'Παραλείφθηκε', color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)' },
]
const RECURRING_OPTIONS = [
  { value: 'none',      label: 'Χωρίς επανάληψη' },
  { value: 'monthly',   label: 'Μηνιαία' },
  { value: 'quarterly', label: 'Τριμηνιαία' },
  { value: 'yearly',    label: 'Ετήσια' },
]
const ITEM_TAGS = ['Επείγον','Εγγύηση','Εξωτερικός','DIY','Νόμος','Ασφάλεια','Προτεραιότητα','Αναβλήθηκε']

const AADE_CALENDAR = [
  { month: 1,  description: 'Υποβολή εντύπου Ε2 — Μισθώματα περσινού έτους', category: 'legal', priority: 'critical' as Priority },
  { month: 2,  description: 'Φορολογική δήλωση (Ε1) — Εισοδήματα ιδιοκτήτη', category: 'legal', priority: 'critical' as Priority },
  { month: 3,  description: 'Πληρωμή 1ης δόσης φόρου εισοδήματος', category: 'financial', priority: 'critical' as Priority },
  { month: 5,  description: 'Καταχώρηση μισθωτηρίων ΑΑΔΕ (αν νέα)', category: 'legal', priority: 'high' as Priority },
  { month: 7,  description: 'Πληρωμή 2ης δόσης φόρου εισοδήματος', category: 'financial', priority: 'critical' as Priority },
  { month: 9,  description: 'Πληρωμή ΕΝΦΙΑ — 1η δόση', category: 'legal', priority: 'critical' as Priority },
  { month: 10, description: 'Πληρωμή ΕΝΦΙΑ — 2η δόση', category: 'legal', priority: 'critical' as Priority },
  { month: 10, description: 'Ανανέωση ασφαλιστηρίου ακινήτου', category: 'legal', priority: 'high' as Priority },
  { month: 11, description: 'Έλεγχος ΠΕΑ — λήξη πιστοποιητικού ενεργειακής', category: 'legal', priority: 'normal' as Priority },
  { month: 12, description: 'Προετοιμασία εγγράφων για φορολογική δήλωση', category: 'legal', priority: 'normal' as Priority },
]

const TEMPLATES: Record<string, { label: string; color: string; items: Array<{ description: string; category: string; priority: Priority; recurring?: Recurring; estimated_cost?: number; depends_on_idx?: number }> }> = {
  checkin: { label: 'Νέος Ενοικιαστής', color: '#34a853', items: [
    { description: 'Φωτογράφηση κάθε δωματίου (before)', category: 'checkin', priority: 'critical' },
    { description: 'Παράδοση κλειδιών — καταγραφή αριθμού σετ', category: 'checkin', priority: 'critical' },
    { description: 'Καταγραφή μετρητή ΔΕΗ', category: 'checkin', priority: 'critical' },
    { description: 'Καταγραφή μετρητή ΕΥΔΑΠ', category: 'checkin', priority: 'critical' },
    { description: 'Υπογραφή πρωτοκόλλου παράδοσης', category: 'checkin', priority: 'critical' },
    { description: 'Δήλωση μισθωτηρίου στην ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Ενημέρωση ΔΟΥ', category: 'legal', priority: 'high' },
    { description: 'Εξήγηση λειτουργίας θέρμανσης / boiler', category: 'checkin', priority: 'high' },
    { description: 'Εξήγηση λειτουργίας alarm', category: 'checkin', priority: 'high' },
    { description: 'Ενεργοποίηση ασφαλιστηρίου', category: 'checkin', priority: 'high', estimated_cost: 300 },
    { description: 'Αλλαγή κωδικών WiFi', category: 'checkin', priority: 'normal' },
    { description: 'Μεταβίβαση λογαριασμών ΔΕΗ / ΕΥΔΑΠ', category: 'checkin', priority: 'normal' },
  ]},
  checkout: { label: 'Αποχώρηση Ενοικιαστή', color: '#ea4335', items: [
    { description: 'Επιστροφή κλειδιών — έλεγχος αριθμού', category: 'checkout', priority: 'critical' },
    { description: 'Τελική ανάγνωση μετρητή ΔΕΗ', category: 'checkout', priority: 'critical' },
    { description: 'Τελική ανάγνωση μετρητή ΕΥΔΑΠ', category: 'checkout', priority: 'critical' },
    { description: 'Φωτογράφηση κατάστασης vs check-in', category: 'checkout', priority: 'critical' },
    { description: 'Λήξη μισθωτηρίου ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Διακανονισμός εγγύησης', category: 'checkout', priority: 'critical' },
    { description: 'Τελικός καθαρισμός ακινήτου', category: 'checkout', priority: 'high', estimated_cost: 150 },
    { description: 'Έλεγχος ζημιών — αξιολόγηση κόστους', category: 'checkout', priority: 'high' },
    { description: 'Ακύρωση / μεταβίβαση ΔΕΗ / ΕΥΔΑΠ', category: 'checkout', priority: 'high' },
    { description: 'Αλλαγή κλειδαριάς', category: 'checkout', priority: 'normal', estimated_cost: 120 },
    { description: 'Ενημέρωση ΔΟΥ για λήξη μίσθωσης', category: 'legal', priority: 'normal' },
  ]},
  maintenance: { label: 'Ετήσια Συντήρηση', color: '#fbbc04', items: [
    { description: 'Service καλοριφέρ / λέβητα', category: 'maintenance', priority: 'critical', recurring: 'yearly', estimated_cost: 80 },
    { description: 'Έλεγχος πυροσβεστήρων', category: 'maintenance', priority: 'critical', recurring: 'yearly', estimated_cost: 30 },
    { description: 'Τσεκ ηλεκτρολογικού πίνακα', category: 'maintenance', priority: 'high', recurring: 'yearly', estimated_cost: 60 },
    { description: 'Καθαρισμός υδρορροών', category: 'maintenance', priority: 'high', recurring: 'yearly', estimated_cost: 40 },
    { description: 'Έλεγχος στέγης / ταράτσας', category: 'maintenance', priority: 'high', recurring: 'yearly', estimated_cost: 100 },
    { description: 'Service κλιματιστικών', category: 'maintenance', priority: 'high', recurring: 'yearly', estimated_cost: 70 },
    { description: 'Απολύμανση / pest control', category: 'maintenance', priority: 'normal', recurring: 'yearly', estimated_cost: 80 },
    { description: 'Έλεγχος μόνωσης παραθύρων', category: 'maintenance', priority: 'normal', recurring: 'yearly' },
    { description: 'Βαφή / ανανέωση κοινόχρηστων', category: 'maintenance', priority: 'low', recurring: 'yearly', estimated_cost: 200 },
    { description: 'Service ανελκυστήρα', category: 'maintenance', priority: 'high', recurring: 'quarterly', estimated_cost: 150 },
  ]},
  legal: { label: 'Νομικά / ΑΑΔΕ', color: '#7c3aed', items: [
    { description: 'Κατάθεση Ε2 (δήλωση μισθωμάτων)', category: 'legal', priority: 'critical', recurring: 'yearly' },
    { description: 'Πληρωμή ΕΝΦΙΑ', category: 'legal', priority: 'critical', recurring: 'yearly' },
    { description: 'Ανανέωση ασφαλιστηρίου ακινήτου', category: 'legal', priority: 'critical', recurring: 'yearly', estimated_cost: 300 },
    { description: 'Έλεγχος ΠΕΑ (Πιστοποιητικό Ενεργειακής)', category: 'legal', priority: 'high' },
    { description: 'Έλεγχος βεβαίωσης μηχανικού', category: 'legal', priority: 'high' },
    { description: 'Πληρωμή δημοτικών τελών', category: 'financial', priority: 'normal', recurring: 'yearly' },
  ]},
  renovation: { label: 'Ανακαίνιση', color: '#1967d2', items: [
    { description: 'Αίτηση άδειας εργασιών', category: 'renovation', priority: 'critical' },
    { description: 'Επιλογή και ανάθεση εργολάβου', category: 'renovation', priority: 'critical', depends_on_idx: 0 },
    { description: 'Σύνταξη σύμβασης εργολάβου', category: 'renovation', priority: 'critical', depends_on_idx: 1 },
    { description: 'Φωτογράφηση πριν την έναρξη', category: 'renovation', priority: 'critical' },
    { description: 'Έλεγχος ηλεκτρολογικής εγκατάστασης', category: 'renovation', priority: 'high', estimated_cost: 200 },
    { description: 'Φάση 1 — Κατεδάφιση', category: 'renovation', priority: 'normal', depends_on_idx: 2 },
    { description: 'Φάση 2 — Κατασκευή', category: 'renovation', priority: 'normal', depends_on_idx: 5 },
    { description: 'Φάση 3 — Φινίρισμα', category: 'renovation', priority: 'normal', depends_on_idx: 6 },
    { description: 'Τελική επιθεώρηση και παραλαβή', category: 'renovation', priority: 'critical', depends_on_idx: 7 },
  ]},
  airbnb: { label: 'Short-term / Airbnb', color: '#ff5a5f', items: [
    { description: 'Ρύθμιση smart lock / κωδικός check-in', category: 'airbnb', priority: 'critical', estimated_cost: 150 },
    { description: 'Δημιουργία οδηγού φιλοξενίας', category: 'airbnb', priority: 'critical' },
    { description: 'Καταχώρηση σε Airbnb / Booking.com', category: 'airbnb', priority: 'critical' },
    { description: 'Φωτογράφηση από επαγγελματία', category: 'airbnb', priority: 'high', estimated_cost: 200 },
    { description: 'Εγγραφή στο Μητρώο Βραχυχρόνιας Μίσθωσης ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Ρύθμιση καναλιού καθαριότητας', category: 'airbnb', priority: 'high' },
    { description: 'Ανεφοδιασμός (σαπούνια, χαρτί κλπ)', category: 'airbnb', priority: 'normal', recurring: 'monthly', estimated_cost: 30 },
    { description: 'Τσεκ κλιματισμού πριν κάθε σεζόν', category: 'airbnb', priority: 'high', recurring: 'quarterly', estimated_cost: 70 },
  ]},
  purchase: { label: 'Αγορά Ακινήτου', color: '#1967d2', items: [
    { description: 'Νομικός έλεγχος τίτλων ιδιοκτησίας', category: 'purchase', priority: 'critical', estimated_cost: 500 },
    { description: 'Τεχνικός έλεγχος ακινήτου από μηχανικό', category: 'purchase', priority: 'critical', estimated_cost: 300 },
    { description: 'Έλεγχος βαρών / υποθηκών κτηματολόγιο', category: 'purchase', priority: 'critical' },
    { description: 'Πιστοποιητικό ενεργειακής απόδοσης ΠΕΑ', category: 'purchase', priority: 'critical', estimated_cost: 150 },
    { description: 'Συμβολαιογράφος — προσύμφωνο', category: 'purchase', priority: 'critical', estimated_cost: 600, depends_on_idx: 0 },
    { description: 'Έγκριση δανείου από τράπεζα', category: 'purchase', priority: 'critical' },
    { description: 'Ασφάλεια ακινήτου', category: 'purchase', priority: 'high', estimated_cost: 300 },
    { description: 'Τελικό συμβόλαιο αγοράς', category: 'purchase', priority: 'critical', depends_on_idx: 4 },
    { description: 'Μεταγραφή στο κτηματολόγιο', category: 'purchase', priority: 'critical', depends_on_idx: 7 },
    { description: 'Εγγραφή στο ΑΑΔΕ ως ιδιοκτήτης', category: 'legal', priority: 'high' },
  ]},
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function isOverdue(due: string | null, status: string) {
  if (!due || status === 'done' || status === 'skipped') return false
  return new Date(due) < new Date()
}
function daysUntil(d: string | null) { if (!d) return null; return Math.round((new Date(d).getTime() - Date.now()) / 86400000) }
function getCat(id: string) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1] }
function getPri(v: string) { return PRIORITIES.find(p => p.value === v) || PRIORITIES[2] }
function getStatusMeta(v: string) { return STATUSES.find(s => s.value === v) || STATUSES[0] }
function nextDueDate(due: string, recurring: Recurring): string {
  const d = new Date(due)
  if (recurring === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (recurring === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (recurring === 'yearly') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}
function parseItem(item: ChecklistItem): ChecklistItem {
  try {
    const p = JSON.parse(item.note || '{}')
    if (p?.__cv === 2) return { ...item, note: p.note || null, _subtasks: p.subtasks || [], _comments: p.comments || [], _tags: p.tags || [] }
  } catch {}
  return { ...item, _subtasks: [], _comments: [], _tags: [] }
}
function serializeNote(d: { note: string; subtasks: SubTask[]; comments: Comment[]; tags: string[] }) {
  return JSON.stringify({ __cv: 2, ...d })
}
const mkEmpty = () => ({
  description: '', category: 'other', note: '', priority: 'normal' as Priority,
  due_date: '', start_date: '', recurring: 'none' as Recurring,
  assigned_contact_id: '', assigned_contact_name: '',
  estimated_cost: '', actual_cost: '', budget: '', status: 'pending' as Status,
  subtasks: [] as SubTask[], tags: [] as string[], comments: [] as Comment[], depends_on: '',
})


// ─── Sub-components ───────────────────────────────────────────────────────────
function SubTaskEditor({ subtasks, onChange }: { subtasks: SubTask[]; onChange: (s: SubTask[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([...subtasks, { id: Date.now().toString(), text: input.trim(), done: false }]); setInput('') }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {subtasks.map(st => (
          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={() => onChange(subtasks.map(s => s.id === st.id ? { ...s, done: !s.done } : s))}
              style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid ' + (st.done ? 'var(--positive)' : 'var(--border-default)'), background: st.done ? 'var(--positive)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
              {st.done && <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round"/></svg>}
            </button>
            <span style={{ flex: 1, fontSize: 13, color: st.done ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: st.done ? 'line-through' : 'none' }}>{st.text}</span>
            <button type="button" onClick={() => onChange(subtasks.filter(s => s.id !== st.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Νέο υπο-task..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

function CommentsEditor({ comments, onChange }: { comments: Comment[]; onChange: (c: Comment[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([{ id: Date.now().toString(), text: input.trim(), ts: new Date().toISOString() }, ...comments]); setInput('') }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Γράψε σχόλιο..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {comments.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 16 }}>Δεν υπάρχουν σχόλια ακόμα</p>}
        {comments.map(c => (
          <div key={c.id} style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)', position: 'relative' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, fontFamily: T.font.mono }}>{new Date(c.ts).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, paddingRight: 20 }}>{c.text}</div>
            <button type="button" onClick={() => onChange(comments.filter(x => x.id !== c.id))} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Export functions ─────────────────────────────────────────────────────────
async function exportChecklistExcel(items: ChecklistItem[]) {
  const XLSX = await import('xlsx')
  const today = new Date().toLocaleDateString('el-GR')
  const wb = XLSX.utils.book_new()
  const done = items.filter(i => i.status === 'done').length
  const totalEst = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalAct = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const overdue = items.filter(i => isOverdue(i.due_date, i.status)).length

  const byCategory: Record<string, { count: number; done: number; est: number; act: number }> = {}
  items.forEach(i => {
    const k = i.category
    if (!byCategory[k]) byCategory[k] = { count: 0, done: 0, est: 0, act: 0 }
    byCategory[k].count++
    if (i.status === 'done') byCategory[k].done++
    byCategory[k].est += i.estimated_cost || 0
    byCategory[k].act += i.actual_cost || 0
  })

  // ── Sheet 1: Σύνοψη ──────────────────────────────────────────────────────
  const summaryData: (string | number)[][] = [
    ['Property OS — Checklist Ακινήτου', ''],
    ['Ημερομηνία εξαγωγής:', today],
    [''],
    ['ΓΕΝΙΚΗ ΣΥΝΟΨΗ', ''],
    ['Σύνολο Tasks', items.length],
    ['Ολοκληρωμένα', done],
    ['Εκκρεμή', items.filter(i => i.status === 'pending').length],
    ['Σε εξέλιξη', items.filter(i => i.status === 'in_progress').length],
    ['Παραλειφθέντα', items.filter(i => i.status === 'skipped').length],
    ['Ληγμένα', overdue],
    ['Ποσοστό Ολοκλήρωσης (%)', items.length > 0 ? Math.round((done / items.length) * 100) : 0],
    [''],
    ['ΟΙΚΟΝΟΜΙΚΗ ΣΥΝΟΨΗ', ''],
    ['Εκτιμώμενο Κόστος (€)', totalEst],
    ['Πραγματικό Κόστος (€)', totalAct],
    ['Απόκλιση (€)', totalAct - totalEst],
    ['Απόκλιση (%)', totalEst > 0 ? Math.round(((totalAct - totalEst) / totalEst) * 1000) / 10 : 0],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΗΓΟΡΙΑ', '', '', '', '', ''],
    ['Κατηγορία', 'Tasks', 'Ολοκλ.', 'Πρόοδος %', 'Εκτιμώμενο €', 'Πραγματικό €'],
    ...CATEGORIES.filter(c => byCategory[c.id]).map(c => [
      c.label,
      byCategory[c.id].count,
      byCategory[c.id].done,
      Math.round((byCategory[c.id].done / byCategory[c.id].count) * 100),
      byCategory[c.id].est,
      byCategory[c.id].act,
    ]),
    ['ΣΥΝΟΛΟ', items.length, done, items.length > 0 ? Math.round((done / items.length) * 100) : 0, totalEst, totalAct],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΠΡΟΤΕΡΑΙΟΤΗΤΑ', '', ''],
    ['Προτεραιότητα', 'Tasks', 'Ολοκλ.'],
    ...PRIORITIES.map(p => [
      p.label,
      items.filter(i => i.priority === p.value).length,
      items.filter(i => i.priority === p.value && i.status === 'done').length,
    ]),
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΑΣΤΑΣΗ', ''],
    ['Κατάσταση', 'Tasks'],
    ...STATUSES.map(s => [s.label, items.filter(i => i.status === s.value).length]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη')

  // ── Sheet 2: Αναλυτική Λίστα ─────────────────────────────────────────────
  const headers = ['Κατηγορία', 'Περιγραφή', 'Προτεραιότητα', 'Κατάσταση', 'Deadline', 'Επανάληψη', 'Ανατέθηκε σε', 'Εκτιμ. Κόστος €', 'Πραγμ. Κόστος €', 'Budget €', 'Εξάρτηση', 'Ετικέτες', 'Σημειώσεις']
  const detailRows: (string | number)[][] = [headers]

  CATEGORIES.forEach(cat => {
    const catItems = items.filter(i => i.category === cat.id)
    if (catItems.length === 0) return
    detailRows.push([`▶ ${cat.label}`, `${catItems.filter(i => i.status === 'done').length}/${catItems.length} ολοκλ.`, '', '', '', '', '', catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0), catItems.reduce((s, i) => s + (i.actual_cost || 0), 0), '', '', '', ''])

    catItems.sort((a, b) => {
      const pOrder = { critical: 0, high: 1, normal: 2, low: 3 }
      return pOrder[a.priority] - pOrder[b.priority]
    }).forEach(item => {
      detailRows.push([
        cat.label,
        item.description,
        getPri(item.priority).label,
        getStatusMeta(item.status).label,
        item.due_date ? fmtDate(item.due_date) : '',
        RECURRING_OPTIONS.find(r => r.value === item.recurring)?.label || '',
        item.assigned_contact_name || '',
        item.estimated_cost || '',
        item.actual_cost || '',
        (item as any).budget || '',
        item.depends_on ? 'Ναι' : '',
        (item._tags || []).join('; '),
        item.note || '',
      ])
    })
    detailRows.push(['', '', '', '', '', '', '', '', '', '', '', '', ''])
  })

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Αναλυτικά Tasks')

  // ── Sheet 3: Ληγμένα & Εκκρεμή (action list) ────────────────────────────
  const actionItems = items.filter(i => i.status !== 'done' && i.status !== 'skipped')
    .sort((a, b) => {
      if (isOverdue(a.due_date, a.status) && !isOverdue(b.due_date, b.status)) return -1
      if (!isOverdue(a.due_date, a.status) && isOverdue(b.due_date, b.status)) return 1
      const pOrder = { critical: 0, high: 1, normal: 2, low: 3 }
      return pOrder[a.priority] - pOrder[b.priority]
    })
  const actionHeaders = ['Κατάσταση', 'Κατηγορία', 'Περιγραφή', 'Προτεραιότητα', 'Deadline', 'Ημέρες', 'Ανατέθηκε σε', 'Εκτιμ. Κόστος €']
  const actionRows: (string | number)[][] = [
    ['Property OS — Λίστα Εκκρεμών Ενεργειών', ''],
    [`${actionItems.length} εκκρεμή tasks · ${overdue} ληγμένα`, today],
    [''],
    actionHeaders,
    ...actionItems.map(item => {
      const d = daysUntil(item.due_date)
      return [
        getStatusMeta(item.status).label,
        getCat(item.category).label,
        item.description,
        getPri(item.priority).label,
        item.due_date ? fmtDate(item.due_date) : '—',
        d !== null ? (d < 0 ? `${Math.abs(d)} πριν` : `${d} ημέρες`) : '—',
        item.assigned_contact_name || '—',
        item.estimated_cost || '',
      ]
    }),
  ]
  const ws3 = XLSX.utils.aoa_to_sheet(actionRows)
  ws3['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 42 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Εκκρεμείς Ενέργειες')

  XLSX.writeFile(wb, `checklist_ακινητου_${new Date().toISOString().split('T')[0]}.xlsx`)
}

function exportChecklistPDF(items: ChecklistItem[]) {
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })
  const done = items.filter(i => i.status === 'done').length
  const totalEst = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalAct = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const overdue = items.filter(i => isOverdue(i.due_date, i.status)).length
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0

  const grouped: Record<string, ChecklistItem[]> = {}
  items.forEach(i => { if (!grouped[i.category]) grouped[i.category] = []; grouped[i.category].push(i) })

  const kpiHtml = (val: string, lbl: string, color: string) =>
    `<div class="kpi"><div class="kpi-v" style="color:${color}">${val}</div><div class="kpi-l">${lbl}</div></div>`

  const groupSections = CATEGORIES.filter(c => grouped[c.id]?.length).map(cat => {
    const grpDone = grouped[cat.id].filter(i => i.status === 'done').length
    const grpPct = Math.round((grpDone / grouped[cat.id].length) * 100)
    const rows = grouped[cat.id].map(item => {
      const pri = getPri(item.priority); const sm = getStatusMeta(item.status)
      const od = isOverdue(item.due_date, item.status)
      return `<tr>
        <td style="width:18px;padding:7px 8px;vertical-align:middle">
          <div style="width:14px;height:14px;border:2px solid ${item.status==='done'?'#34a853':'#dadce0'};border-radius:3px;background:${item.status==='done'?'#34a853':'#fff'};display:flex;align-items:center;justify-content:center">
            ${item.status==='done'?'<svg width="8" height="8" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>':''}
          </div>
        </td>
        <td style="padding:7px 8px">
          <div style="font-size:11px;color:${item.status==='done'?'#9aa0a6':'#202124'};text-decoration:${item.status==='done'?'line-through':'none'}">${item.description}</div>
          ${item.assigned_contact_name?`<div style="font-size:9px;color:#9aa0a6;margin-top:2px">${item.assigned_contact_name}</div>`:''}
          ${(item._tags||[]).length>0?`<div style="margin-top:3px">${(item._tags||[]).map(t=>`<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#f1f3f4;font-size:8px;color:#5f6368;margin-right:3px">${t}</span>`).join('')}</div>`:''}
        </td>
        <td style="padding:7px 8px;text-align:center"><span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${pri.bg.replace('rgba','rgba').replace('0.1','0.15')};color:${pri.color}">${pri.label}</span></td>
        <td style="padding:7px 8px;text-align:center"><span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${sm.bg.replace('0.1','0.15')};color:${sm.color}">${sm.label}</span></td>
        <td style="padding:7px 8px;text-align:right;font-family:'Roboto Mono',monospace;font-size:10px;color:${od?'#ea4335':'#5f6368'}">${item.due_date?fmtDate(item.due_date):'—'}</td>
        <td style="padding:7px 8px;text-align:right;font-family:'Roboto Mono',monospace;font-size:10px;color:#1a1a2e">${item.estimated_cost>0?item.estimated_cost.toLocaleString('el-GR')+'€':'—'}</td>
      </tr>`
    }).join('')
    return `
      <div class="sec">
        <div class="g-header" style="border-left:4px solid ${cat.dot}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:8px;height:8px;border-radius:50%;background:${cat.dot}"></div>
              <strong style="color:${cat.dot}">${cat.label}</strong>
              <span style="font-size:9px;color:#5f6368">${grpDone}/${grouped[cat.id].length} ολοκλ.</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:60px;height:4px;background:#e8eaed;border-radius:2px;overflow:hidden">
                <div style="height:100%;width:${grpPct}%;background:${grpPct===100?'#34a853':cat.dot};border-radius:2px"></div>
              </div>
              <span style="font-size:10px;font-weight:700;color:${cat.dot}">${grpPct}%</span>
            </div>
          </div>
        </div>
        <table>
          <thead><tr>
            <th style="width:18px"></th>
            <th>Περιγραφή</th>
            <th style="width:70px;text-align:center">Προτερ.</th>
            <th style="width:90px;text-align:center">Κατάσταση</th>
            <th style="width:80px;text-align:right">Deadline</th>
            <th style="width:70px;text-align:right">Εκτιμ.</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }).join('')

  const w = window.open('', '_blank', 'width=1100,height=850')
  if (!w) { alert('Επίτρεψε τα popups'); return }
  w.document.write(`<!DOCTYPE html><html lang="el"><head>
<meta charset="UTF-8"><title>Checklist Ακινήτου</title>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Roboto',sans-serif;background:#fff;color:#1a1a2e;font-size:10.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:28px 32px;max-width:940px;margin:0 auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:20px;border-bottom:3px solid #1a73e8}
.logo{font-family:'Google Sans',sans-serif;font-size:22px;font-weight:700;color:#1a73e8}.logo span{color:#d4af42}
.logo-s{font-size:10px;color:#5f6368;margin-top:2px}
.meta-r{text-align:right}.meta-title{font-family:'Google Sans',sans-serif;font-size:15px;font-weight:500;color:#1a1a2e}
.meta-d{font-size:10px;color:#5f6368;margin-top:3px}
.sec-title{font-family:'Google Sans',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:#1a73e8;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:5px}
.sec-title::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:#d4af42;flex-shrink:0}
.sec{margin-bottom:20px}
.kpi-row{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px}
.kpi{background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;padding:10px 12px}
.kpi-v{font-family:'Roboto Mono',monospace;font-size:16px;font-weight:700;margin-bottom:3px}
.kpi-l{font-family:'Google Sans',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#5f6368}
.progress-bar{height:8px;background:#e8eaed;border-radius:4px;overflow:hidden;margin-bottom:16px}
.progress-fill{height:100%;border-radius:4px;transition:width 0s}
.g-header{padding:9px 14px;margin-bottom:0;background:#f8f9fa;border-radius:6px 6px 0 0;border:1px solid #e8eaed;border-bottom:none}
table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:16px}
th{font-family:'Google Sans',sans-serif;font-size:8.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;padding:6px 8px;border-bottom:2px solid #e8eaed;text-align:left;background:#f8f9fa;border:1px solid #e8eaed}
td{border:1px solid #f1f3f4;vertical-align:middle;color:#3c4043}
tr:nth-child(even) td{background:#fafafa}
.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e8eaed;display:flex;justify-content:space-between;font-size:9px;color:#9aa0a6}
@media print{.page{padding:18px 22px}}
</style></head><body><div class="page">
<div class="hdr">
  <div><div class="logo">Property <span>OS</span></div><div class="logo-s">Επαγγελματικό Εργαλείο Διαχείρισης Ακινήτων</div></div>
  <div class="meta-r"><div class="meta-title">Checklist Ακινήτου</div><div class="meta-d">${today}</div></div>
</div>
<div class="sec">
  <div class="sec-title">Σύνοψη</div>
  <div class="kpi-row">
    ${kpiHtml(String(items.length), 'Σύνολο Tasks', '#1a73e8')}
    ${kpiHtml(String(done), 'Ολοκληρωμένα', '#34a853')}
    ${kpiHtml(String(items.length - done), 'Εκκρεμή', '#ea4335')}
    ${kpiHtml(String(overdue), 'Ληγμένα', '#ea4335')}
    ${kpiHtml(totalEst > 0 ? totalEst.toLocaleString('el-GR') + '€' : '—', 'Εκτιμώμενο', '#5f6368')}
    ${kpiHtml(totalAct > 0 ? totalAct.toLocaleString('el-GR') + '€' : '—', 'Πραγματικό', '#b45309')}
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#5f6368;margin-bottom:5px">
    <span>Συνολική Πρόοδος</span><span style="font-weight:700;color:${pct===100?'#34a853':'#1a73e8'}">${pct}%</span>
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${pct===100?'#34a853':'#1a73e8'}"></div></div>
</div>
<div class="sec">
  <div class="sec-title">Αναλυτικά Tasks ανά Κατηγορία</div>
  ${groupSections}
</div>
<div class="footer"><div>Property OS · Checklist Ακινήτου</div><div>${today}</div></div>
</div></body></html>`)
  w.document.close()
  setTimeout(() => { w.print() }, 900)
}

// ─── Handover Protocol PDF (12 sections, auto-fill from cross-tab data) ───────
interface TenantData { full_name?: string; phone?: string; afm?: string; lease_end?: string; email?: string }

function exportHandoverProtocol(items: ChecklistItem[], type: 'checkin' | 'checkout', tenant?: TenantData) {
  const relevant = items.filter(i => i.category === type || (type === 'checkin' && i.category === 'legal'))
  const title = type === 'checkin' ? 'Πρωτόκολλο Παράδοσης Ακινήτου' : 'Πρωτόκολλο Αποχώρησης Ενοικιαστή'
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })

  const tenantName = tenant?.full_name || '______________________________'
  const tenantPhone = tenant?.phone || '______________________________'
  const tenantAfm = tenant?.afm || '______________________________'
  const leaseEnd = tenant?.lease_end ? new Date(tenant.lease_end).toLocaleDateString('el-GR') : '______________________________'

  const sectionHtml = (num: number, title: string, content: string) => `
    <div class="sec">
      <div class="sec-hdr"><div class="sec-num">${num}</div><div class="sec-title">${title}</div></div>
      <div class="sec-body">${content}</div>
    </div>`

  const fieldRow = (label: string, value = '', width = '100%') =>
    `<div class="field-row" style="width:${width}"><div class="field-label">${label}</div><div class="field-val">${value || ''}</div></div>`

  const checkRow = (label: string, done = false) =>
    `<div class="check-row">
      <div class="cb ${done ? 'cb-done' : ''}">${done ? '<svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</div>
      <div class="check-label">${label}</div>
    </div>`

  const rooms = ['Σαλόνι', 'Κουζίνα', 'Υπνοδωμάτιο 1', 'Υπνοδωμάτιο 2', 'Μπάνιο', 'WC', 'Χολ / Είσοδος', 'Αποθήκη / Βοηθητικός']
  const roomRows = rooms.map(r => `
    <tr>
      <td class="room-name">${r}</td>
      <td class="room-cell"><div class="rating-row">${['Άριστη','Καλή','Μέτρια','Κακή'].map(s => `<label class="rating-opt"><input type="checkbox"> ${s}</label>`).join('')}</div></td>
      <td class="room-notes"></td>
    </tr>`).join('')

  const taskRows = relevant.map(item => `
    <div class="task-row ${item.status === 'done' ? 'done' : ''}">
      <div class="task-cb ${item.status === 'done' ? 'task-cb-done' : ''}">${item.status === 'done' ? '<svg width="9" height="9" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>' : ''}</div>
      <div class="task-label">${item.description}</div>
      ${item.assigned_contact_name ? `<div class="task-contact">${item.assigned_contact_name}</div>` : ''}
    </div>`).join('')

  const html = `<!DOCTYPE html><html lang="el"><head>
<meta charset="UTF-8"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Roboto',sans-serif;background:#fff;color:#202124;font-size:11px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:900px;margin:0 auto;padding:28px 36px}

/* Header */
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:24px;border-bottom:3px solid #1a73e8}
.logo{font-family:'Google Sans',sans-serif;font-size:20px;font-weight:700;color:#1a73e8}.logo span{color:#d4af42}
.logo-sub{font-size:10px;color:#5f6368;margin-top:2px}
.hdr-right{text-align:right}
.hdr-title{font-family:'Google Sans',sans-serif;font-size:16px;font-weight:500;color:#202124}
.hdr-meta{font-size:10px;color:#5f6368;margin-top:4px}
.hdr-type{display:inline-block;padding:4px 14px;border-radius:20px;font-size:10px;font-weight:600;font-family:'Google Sans',sans-serif;margin-top:6px;background:${type==='checkin'?'#e6f4ea':'#fce8e6'};color:${type==='checkin'?'#137333':'#c5221f'}}

/* Sections */
.sec{margin-bottom:20px;border:1px solid #e8eaed;border-radius:10px;overflow:hidden;break-inside:avoid}
.sec-hdr{display:flex;align-items:center;gap:12px;padding:11px 16px;background:#f8f9fa;border-bottom:1px solid #e8eaed;border-left:3px solid #1a73e8}
.sec-num{width:26px;height:26px;border-radius:50%;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:'Google Sans',sans-serif;flex-shrink:0;letter-spacing:0}
.sec-title{font-family:'Google Sans',sans-serif;font-size:13px;font-weight:500;color:#202124}
.sec-body{padding:14px 16px}

/* Field rows */
.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.field-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px}
.field-row{display:flex;flex-direction:column;gap:4px}
.field-label{font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;font-family:'Google Sans',sans-serif}
.field-val{min-height:30px;border-bottom:2px solid #dadce0;padding:4px 0 3px;font-size:12px;color:#202124;font-family:'Roboto Mono',monospace;letter-spacing:0.02em}
.field-val.prefilled{color:#1a73e8;font-weight:500;border-bottom-color:#1a73e8}
.field-area{min-height:56px;border:1px solid #e8eaed;border-radius:6px;padding:8px;margin-top:4px;background:#fafafa}

/* Checkbox rows */
.check-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f3f4}
.check-row:last-child{border-bottom:none}
.cb{width:16px;height:16px;border:2px solid #dadce0;border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px}
.cb-done{background:#34a853;border-color:#34a853}
.check-label{font-size:12px;color:#3c4043;flex:1;line-height:1.4}

/* Room table */
.room-table{width:100%;border-collapse:collapse;font-size:11px}
.room-table th{background:#f8f9fa;padding:7px 10px;border:1px solid #e8eaed;text-align:left;font-family:'Google Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#5f6368}
.room-table td{padding:7px 10px;border:1px solid #e8eaed;vertical-align:middle}
.room-name{font-weight:500;color:#202124;width:140px}
.room-cell{min-width:220px}
.room-notes{min-height:28px;min-width:160px}
.rating-row{display:flex;gap:10px}
.rating-opt{font-size:10px;color:#5f6368;cursor:default}

/* Meter grid */
.meter-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.meter-card{border:1px solid #e8eaed;border-radius:8px;padding:12px;background:#fafafa}
.meter-title{font-family:'Google Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;margin-bottom:8px}
.meter-val{font-size:22px;font-weight:700;color:#202124;border-bottom:3px solid #1a73e8;padding-bottom:6px;margin-bottom:6px;font-family:'Roboto Mono',monospace;min-height:36px;letter-spacing:-0.5px}
.meter-unit{font-size:9px;color:#9aa0a6;font-family:'Google Sans',sans-serif}
.meter-serial{font-size:10px;color:#5f6368;margin-top:8px;border-top:1px solid #e8eaed;padding-top:6px}

/* Key tracking */
.key-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.key-card{border:1px solid #e8eaed;border-radius:8px;padding:10px;text-align:center}
.key-num{font-size:26px;font-weight:700;color:#1a73e8;font-family:'Roboto Mono',monospace;min-height:38px;border-bottom:2px solid #1a73e8;margin-bottom:8px;letter-spacing:-1px}
.key-label{font-size:10px;color:#5f6368;font-family:'Google Sans',sans-serif}

/* Appliance table */
.app-table{width:100%;border-collapse:collapse;font-size:11px}
.app-table th{background:#f8f9fa;padding:6px 10px;border:1px solid #e8eaed;font-family:'Google Sans',sans-serif;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;text-align:left}
.app-table td{padding:6px 10px;border:1px solid #e8eaed}
.app-cb{width:14px;height:14px;border:1.5px solid #dadce0;border-radius:2px;display:inline-block}
.app-include{text-align:center}

/* Tasks */
.task-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid #f1f3f4}
.task-row:last-child{border-bottom:none}
.task-row.done .task-label{text-decoration:line-through;color:#9aa0a6}
.task-cb{width:16px;height:16px;border:1.5px solid #dadce0;border-radius:3px;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center}
.task-cb-done{background:#34a853;border-color:#34a853}
.task-label{flex:1;font-size:12px;color:#3c4043}
.task-contact{font-size:10px;color:#5f6368;background:#f1f3f4;padding:1px 7px;border-radius:20px;white-space:nowrap}

/* Damage */
.damage-box{border:1px solid #e8eaed;border-radius:8px;min-height:100px;padding:12px;background:#fafafa}
.photo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.photo-box{border:1px dashed #dadce0;border-radius:6px;height:80px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9aa0a6;background:#f8f9fa}

/* Signatures */
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:12px}
.sig-block{border-top:2px solid #202124;padding-top:10px}
.sig-role{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#1a73e8;font-family:'Google Sans',sans-serif;margin-bottom:18px}
.sig-line{border-bottom:2px solid #202124;margin-bottom:10px;height:48px}
.sig-detail{font-size:10px;color:#5f6368;margin-bottom:4px}

/* Commons */
.commons-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.commons-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f3f4}
.commons-row:last-child{border-bottom:none}
.commons-dot{width:8px;height:8px;border-radius:50%;background:#1a73e8;flex-shrink:0}
.commons-label{font-size:12px;color:#3c4043;flex:1}
.commons-val{font-size:11px;border-bottom:1px solid #dadce0;min-width:80px;padding-bottom:2px;font-family:'Roboto Mono',monospace}

/* Footer */
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #e8eaed;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#9aa0a6}
.notice{background:#e8f0fe;border:1px solid #a8c7fa;border-radius:8px;padding:10px 16px;font-size:10px;color:#1a1c4b;margin-bottom:20px;display:flex;align-items:flex-start;gap:8px}

@media print{.sec{break-inside:avoid}.page{padding:18px 24px}}
</style></head><body>
<div class="page">

<div class="hdr">
  <div>
    <div class="logo">Property <span>OS</span></div>
    <div class="logo-sub">Επαγγελματικό Εργαλείο Διαχείρισης Ακινήτων</div>
  </div>
  <div class="hdr-right">
    <div class="hdr-title">${title}</div>
    <div class="hdr-meta">Ημερομηνία: ${today}</div>
    <div class="hdr-type">${type === 'checkin' ? 'Παράδοση' : 'Αποχώρηση'}</div>
  </div>
</div>

<div class="notice"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span>Αυτό το πρωτόκολλο αποτελεί νομικά δεσμευτικό αποδεικτικό παράδοσης/παραλαβής ακινήτου. Κρατήστε αντίγραφο και οι δύο πλευρές. Εκτυπώστε σε 2 αντίτυπα.</span></div>

${sectionHtml(1, 'Στοιχεία Ακινήτου & Συμβαλλομένων', `
  <div class="field-grid">
    ${fieldRow('Διεύθυνση Ακινήτου', '')}
    ${fieldRow('Διαμέρισμα / Όροφος', '')}
    ${fieldRow('Τ.Κ. / Πόλη', '')}
    ${fieldRow('Ημερομηνία Συναλλαγής', today)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
    <div style="background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;padding:12px">
      <div style="font-family:'Google Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#1a73e8;margin-bottom:8px">Ιδιοκτήτης</div>
      <div class="field-row" style="margin-bottom:8px">${fieldRow('Ονοματεπώνυμο', '')}</div>
      <div class="field-grid">
        ${fieldRow('ΑΦΜ', '')}
        ${fieldRow('Τηλέφωνο', '')}
      </div>
    </div>
    <div style="background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;padding:12px">
      <div style="font-family:'Google Sans',sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#34a853;margin-bottom:8px">Ενοικιαστής</div>
      <div class="field-row" style="margin-bottom:8px">${fieldRow('Ονοματεπώνυμο', `<span class="${tenantName !== '______________________________' ? 'prefilled' : ''}">${tenantName}</span>`)}</div>
      <div class="field-grid">
        ${fieldRow('ΑΦΜ', `<span class="${tenantAfm !== '______________________________' ? 'prefilled' : ''}">${tenantAfm}</span>`)}
        ${fieldRow('Τηλέφωνο', `<span class="${tenantPhone !== '______________________________' ? 'prefilled' : ''}">${tenantPhone}</span>`)}
      </div>
    </div>
  </div>
  <div class="field-grid" style="margin-top:10px">
    ${fieldRow('Διάρκεια Μίσθωσης', '')}
    ${fieldRow('Λήξη Μίσθωσης', `<span class="${leaseEnd !== '______________________________' ? 'prefilled' : ''}">${leaseEnd}</span>`)}
    ${fieldRow('Εγγύηση (€)', '')}
    ${fieldRow('Ενοίκιο / Μήνα (€)', '')}
  </div>
`)}

${sectionHtml(2, 'Κατάσταση Χώρων ανά Δωμάτιο', `
  <table class="room-table">
    <thead><tr>
      <th>Χώρος</th>
      <th>Κατάσταση</th>
      <th>Παρατηρήσεις</th>
    </tr></thead>
    <tbody>${roomRows}</tbody>
  </table>
`)}

${sectionHtml(3, 'Κατάσταση Τοίχων, Δαπέδων & Οροφής', `
  <table class="room-table">
    <thead><tr><th>Στοιχείο</th><th>Κατάσταση</th><th>Περιγραφή</th></tr></thead>
    <tbody>
      ${['Τοίχοι (βαφή/ταπετσαρία)', 'Δάπεδα (τύπος/κατάσταση)', 'Οροφή', 'Πόρτες εισόδου', 'Εσωτερικές πόρτες', 'Παράθυρα/Κουφώματα', 'Ρολά/Στόρια'].map(r => `<tr><td class="room-name">${r}</td><td class="room-cell"><div class="rating-row">${['Άριστη','Καλή','Μέτρια','Κακή'].map(s => `<label class="rating-opt"><input type="checkbox"> ${s}</label>`).join('')}</div></td><td class="room-notes"></td></tr>`).join('')}
    </tbody>
  </table>
`)}

${sectionHtml(4, 'Μετρητές Παροχών', `
  <div class="meter-grid">
    <div class="meter-card">
      <div class="meter-title">ΔΕΗ / Ρεύμα</div>
      <div class="meter-val"></div>
      <div class="meter-unit">kWh</div>
      <div class="meter-serial">Αρ. Σειράς: ____________________</div>
    </div>
    <div class="meter-card">
      <div class="meter-title">ΕΥΔΑΠ / Νερό</div>
      <div class="meter-val"></div>
      <div class="meter-unit">m³</div>
      <div class="meter-serial">Αρ. Σειράς: ____________________</div>
    </div>
    <div class="meter-card">
      <div class="meter-title">Φυσικό Αέριο</div>
      <div class="meter-val"></div>
      <div class="meter-unit">m³</div>
      <div class="meter-serial">Αρ. Σειράς: ____________________</div>
    </div>
  </div>
  <div style="margin-top:12px">
    ${fieldRow('Αριθμός Παροχής ΔΕΗ', '')}
  </div>
`)}

${sectionHtml(5, 'Κλειδιά & Κλειδαριές', `
  <div class="key-grid">
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών εισόδου</div>
    </div>
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών κτιρίου</div>
    </div>
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών αποθήκης</div>
    </div>
    <div class="key-card">
      <div class="key-num"></div>
      <div class="key-label">Σετ κλειδιών parking</div>
    </div>
  </div>
  <div class="field-grid" style="margin-top:12px">
    ${fieldRow('Τύπος Κλειδαριάς', '')}
    ${fieldRow('Smart Lock / Κωδικός', '')}
    ${fieldRow('Αρ. Γραμματοκιβωτίου', '')}
    ${fieldRow('Κωδικός Συναγερμού', '')}
  </div>
`)}

${sectionHtml(6, 'Συσκευές & Έπιπλα', `
  <table class="app-table">
    <thead><tr><th>Είδος</th><th>Περιλαμβάνεται</th><th>Μάρκα / Μοντέλο</th><th>Κατάσταση</th><th>Εγγύηση</th></tr></thead>
    <tbody>
      ${['Ψυγείο', 'Πλυντήριο Ρούχων', 'Στεγνωτήριο', 'Πλυντήριο Πιάτων', 'Φούρνος / Κουζίνα', 'Κλιματιστικό', 'Boiler / Ηλιακός', 'Τηλεόραση', 'Πλυντήριο / Κάδοι', 'Επιπλωμένο (γενικά)', 'Άλλο'].map(s => `<tr><td>${s}</td><td class="app-include"><div class="app-cb"></div></td><td></td><td></td><td></td></tr>`).join('')}
    </tbody>
  </table>
`)}

${sectionHtml(7, 'Parking & Αποθήκη', `
  <div class="field-grid">
    ${fieldRow('Parking — Θέση Νο', '')}
    ${fieldRow('Parking — Τύπος', '')}
    ${fieldRow('Αποθήκη — Νο', '')}
    ${fieldRow('Αποθήκη — Όροφος', '')}
  </div>
  <div class="field-area"></div>
`)}

${sectionHtml(8, 'Κοινόχρηστοι Χώροι & Εγκαταστάσεις', `
  <div class="commons-grid">
    <div>
      ${['Ανελκυστήρας', 'Γεννήτρια / UPS', 'Σύστημα Ασφαλείας / CCTV', 'Πόρτα Εισόδου (αυτόματη)'].map(c => `<div class="commons-row"><div class="commons-dot"></div><div class="commons-label">${c}</div><div class="commons-val"></div></div>`).join('')}
    </div>
    <div>
      ${['Κολυμβητήριο', 'Κοινόχρηστο Πλυντήριο', 'Κοινόχρηστη Ταράτσα', 'Κάδοι Ανακύκλωσης'].map(c => `<div class="commons-row"><div class="commons-dot"></div><div class="commons-label">${c}</div><div class="commons-val"></div></div>`).join('')}
    </div>
  </div>
`)}

${sectionHtml(9, 'Λίστα Ελέγχου (Checklist)', `
  ${taskRows || `<div style="text-align:center;padding:20px;color:#9aa0a6;font-size:12px">Δεν υπάρχουν tasks στην κατηγορία ${type === 'checkin' ? 'παράδοσης' : 'αποχώρησης'}</div>`}
`)}

${sectionHtml(10, 'Καταγεγραμμένες Ζημιές & Αποκλίσεις', `
  <div style="font-size:12px;color:#5f6368;margin-bottom:10px">Καταγράψτε κάθε ζημιά, φθορά ή απόκλιση από την αρχική κατάσταση. Συνημμένα: φωτογραφίες με ημερομηνία.</div>
  <div class="damage-box"></div>
  <div class="photo-grid">
    ${Array(8).fill(0).map(() => `<div class="photo-box">Φωτογραφία</div>`).join('')}
  </div>
`)}

${sectionHtml(11, 'Λοιπές Συμφωνίες & Σημειώσεις', `
  <div class="damage-box" style="min-height:80px"></div>
  <div class="field-grid" style="margin-top:10px">
    ${fieldRow('Συμφωνημένη ημ. επιστροφής εγγύησης', '')}
    ${fieldRow('Εκκρεμή ποσά προς διακανονισμό', '')}
  </div>
`)}

${sectionHtml(12, 'Δηλώσεις & Υπογραφές', `
  <div style="padding:12px;background:#f8f9fa;border-radius:8px;border:1px solid #e8eaed;font-size:11px;color:#3c4043;line-height:1.6;margin-bottom:16px">
    Οι υπογράφοντες βεβαιώνουν ότι έχουν λάβει γνώση και αποδέχονται το σύνολο των παραπάνω καταγεγραμμένων στοιχείων. Η παρούσα αποτελεί αναπόσπαστο παράρτημα της μισθωτικής σύμβασης.
  </div>
  <div class="sig-grid">
    <div class="sig-block">
      <div class="sig-role">Ιδιοκτήτης</div>
      <div class="sig-line"></div>
      <div class="sig-detail">Ονοματεπώνυμο: ________________________________</div>
      <div class="sig-detail">ΑΦΜ: ________________________________</div>
      <div class="sig-detail">Τηλέφωνο: ________________________________</div>
    </div>
    <div class="sig-block">
      <div class="sig-role">Ενοικιαστής</div>
      <div class="sig-line"></div>
      <div class="sig-detail">Ονοματεπώνυμο: <strong>${tenantName !== '______________________________' ? tenantName : '________________________________'}</strong></div>
      <div class="sig-detail">ΑΦΜ: ${tenantAfm !== '______________________________' ? tenantAfm : '________________________________'}</div>
      <div class="sig-detail">Τηλέφωνο: ${tenantPhone !== '______________________________' ? tenantPhone : '________________________________'}</div>
    </div>
  </div>
`)}

<div class="footer">
  <div>Property OS · Πρωτόκολλο ${type === 'checkin' ? 'Παράδοσης' : 'Αποχώρησης'} · Αντίγραφο ___/2</div><div>Αρ. Αναφοράς: ${new Date().getTime().toString(36).toUpperCase().slice(-8)}</div>
  <div>${today}</div>
</div>

</div></body></html>`

  const win = window.open('', '_blank', 'width=1200,height=900')
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 900) }
}


// ─── ItemRow ──────────────────────────────────────────────────────────────────
function ItemRow({ item, allItems, onToggle, onEdit, onDelete, onAddToCalendar, onAddToExpenses, onDuplicate, onBulkSelect, bulkSelected, bulkMode }: {
  item: ChecklistItem; allItems: ChecklistItem[]; onToggle: () => void; onEdit: () => void; onDelete: () => void
  onAddToCalendar: () => void; onAddToExpenses: () => void; onDuplicate: () => void
  onBulkSelect?: () => void; bulkSelected?: boolean; bulkMode?: boolean
}) {
  const [hov, setHov] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  const cat = getCat(item.category); const pri = getPri(item.priority); const sm = getStatusMeta(item.status)
  const overdue = isOverdue(item.due_date, item.status); const due = daysUntil(item.due_date)
  const done = item.status === 'done'
  const subtasks = item._subtasks || []; const subDone = subtasks.filter(s => s.done).length
  const tags = item._tags || []
  const dependsOn = item.depends_on ? allItems.find(i => i.id === item.depends_on) : null
  const blocked = !!(dependsOn && dependsOn.status !== 'done')

  useEffect(() => {
    if (!showMenu) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showMenu])

  const openMenu = () => {
    if (menuBtnRef.current) { const r = menuBtnRef.current.getBoundingClientRect(); setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right }) }
    setShowMenu(s => !s)
  }

  const cbColor = bulkMode ? (bulkSelected ? 'var(--accent)' : 'var(--border-default)') : done ? 'var(--positive)' : overdue ? 'var(--negative)' : 'var(--border-default)'
  const cbBg = bulkMode ? (bulkSelected ? 'var(--accent)' : 'transparent') : done ? 'var(--positive)' : 'transparent'

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 16px', background: bulkSelected ? 'rgba(26,115,232,0.06)' : hov ? 'var(--bg-elevated)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s', opacity: blocked ? 0.6 : 1, position: 'relative' }}>

      <button type="button" onClick={() => { if (bulkMode) onBulkSelect?.(); else if (!blocked) onToggle() }}
        style={{ width: 20, height: 20, borderRadius: bulkMode ? 5 : 6, flexShrink: 0, marginTop: 2, border: '2px solid ' + cbColor, background: cbBg, cursor: blocked && !bulkMode ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
        onMouseEnter={e => { if (!bulkMode && !done && !blocked) { e.currentTarget.style.borderColor = 'var(--positive)'; e.currentTarget.style.background = 'rgba(52,168,83,0.1)' } }}
        onMouseLeave={e => { if (!bulkMode && !done && !blocked) { e.currentTarget.style.borderColor = overdue ? 'var(--negative)' : 'var(--border-default)'; e.currentTarget.style.background = 'transparent' } }}>
        {(done || (bulkMode && bulkSelected)) && (
          <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke={done ? '#000' : '#fff'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
        {!bulkMode && blocked && !done && <span style={{ fontSize: 9 }}>⛔</span>}
      </button>

      <div style={{ flex: 1, minWidth: 0, cursor: bulkMode ? 'pointer' : 'default' }} onClick={bulkMode ? () => onBulkSelect?.() : undefined}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: done || blocked ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1, fontFamily: T.font.sans }}>
            {item.description}
          </span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: T.radius.pill, background: pri.bg, color: pri.color, fontWeight: 600, flexShrink: 0, fontFamily: T.font.sans }}>
            {pri.label}
          </span>
          {item.status !== 'pending' && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: T.radius.pill, background: sm.bg, color: sm.color, fontWeight: 600, flexShrink: 0 }}>{sm.label}</span>
          )}
          {item.recurring !== 'none' && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: T.radius.pill, background: 'rgba(212,175,66,0.08)', color: 'var(--accent)', border: '1px solid rgba(212,175,66,0.2)', flexShrink: 0 }}>
              {RECURRING_OPTIONS.find(r => r.value === item.recurring)?.label}
            </span>
          )}
          {tags.map(t => <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>{t}</span>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: cat.color, fontWeight: 500, fontFamily: T.font.sans }}>{cat.label}</span>
          {item.due_date && (
            <span style={{ fontSize: 11, fontFamily: T.font.mono, color: overdue && !done ? '#c5221f' : due !== null && due <= 3 && due >= 0 && !done ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: (overdue || (due !== null && due <= 3)) && !done ? 700 : 400 }}>
              {fmtDate(item.due_date)}{overdue && !done && due !== null ? ` (${Math.abs(due)}μ πριν)` : ''}{!overdue && due !== null && due <= 3 && due >= 0 && !done ? ` (σε ${due}μ)` : ''}
            </span>
          )}
          {item.assigned_contact_name && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{item.assigned_contact_name}</span>}
          {item.estimated_cost > 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{item.estimated_cost.toLocaleString('el-GR')}€{item.actual_cost > 0 ? ` / ${item.actual_cost.toLocaleString('el-GR')}€` : ' εκτ.'}</span>}
          {subtasks.length > 0 && <span style={{ fontSize: 11, color: subDone === subtasks.length ? 'var(--positive)' : 'var(--text-secondary)' }}>{subDone}/{subtasks.length} υπο-tasks</span>}
          {(item._comments || []).length > 0 && <span style={{ fontSize: 11, color: 'var(--info)' }}>{(item._comments || []).length} σχόλια</span>}
        </div>
        {subtasks.length > 0 && (
          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden', maxWidth: 120 }}>
            <div style={{ height: '100%', width: (subDone / subtasks.length * 100) + '%', background: 'var(--positive)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        )}
      </div>

      {hov && !bulkMode && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={onEdit}
            style={{ padding: '4px 10px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.1s', fontFamily: T.font.sans }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            Επεξ.
          </button>
          <button type="button" onClick={onDelete}
            style={{ padding: '4px 10px', borderRadius: T.radius.btn, border: '1px solid rgba(234,67,53,0.3)', background: 'rgba(234,67,53,0.08)', color: 'var(--negative)', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.1s', fontFamily: T.font.sans }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(234,67,53,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(234,67,53,0.08)' }}>
            Διαγρ.
          </button>
          <button ref={menuBtnRef} type="button" onClick={openMenu}
            style={{ padding: '4px 9px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: showMenu ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 17, lineHeight: 1, transition: 'all 0.1s' }}>
            ···
          </button>
        </div>
      )}

      {showMenu && (
        <div ref={menuRef} style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 6, zIndex: 9999, minWidth: 220, boxShadow: '0 16px 48px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '6px 10px 4px', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>Ενέργειες</div>
          {[
            { label: 'Προσθήκη στο Ημερολόγιο', sub: 'Δημιουργία event', fn: () => { onAddToCalendar(); setShowMenu(false) } },
            { label: 'Καταχώρηση Δαπάνης', sub: 'Άμεση καταχώρηση στα Δαπάνες', fn: () => { onAddToExpenses(); setShowMenu(false) } },
            { label: 'Αντιγραφή Task', sub: 'Δημιουργία αντιγράφου', fn: () => { onDuplicate(); setShowMenu(false) } },
          ].map((a, i) => (
            <button key={i} type="button" onClick={a.fn}
              style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '9px 12px', borderRadius: T.radius.inner, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, fontFamily: T.font.sans }}>{a.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{a.sub}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── BoardCard ────────────────────────────────────────────────────────────────
function BoardCard({ item, onToggle, onEdit }: { item: ChecklistItem; onToggle: () => void; onEdit: () => void }) {
  const cat = getCat(item.category); const pri = getPri(item.priority)
  const overdue = isOverdue(item.due_date, item.status)
  const subtasks = item._subtasks || []; const subDone = subtasks.filter(s => s.done).length
  return (
    <div onClick={onEdit} style={{ background: 'var(--bg-surface)', border: '1px solid ' + (overdue ? 'rgba(234,67,53,0.35)' : 'var(--border-subtle)'), borderLeft: '3px solid ' + cat.color, borderRadius: T.radius.inner, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.4, paddingRight: 8, fontFamily: T.font.sans }}>{item.description}</div>
        <button type="button" onClick={e => { e.stopPropagation(); onToggle() }} style={{ width: 20, height: 20, borderRadius: 6, border: '2px solid ' + (item.status === 'done' ? 'var(--positive)' : 'var(--border-default)'), background: item.status === 'done' ? 'var(--positive)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
          {item.status === 'done' && <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: subtasks.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 10, color: cat.color, fontFamily: T.font.sans }}>{cat.label}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: T.radius.pill, background: pri.bg, color: pri.color }}>{pri.label}</span>
        {item.due_date && <span style={{ fontSize: 10, color: overdue ? 'var(--negative)' : 'var(--text-secondary)', fontFamily: T.font.mono }}>{fmtDate(item.due_date)}</span>}
        {item.estimated_cost > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{item.estimated_cost}€</span>}
      </div>
      {subtasks.length > 0 && (
        <div>
          <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden', marginBottom: 3 }}>
            <div style={{ height: '100%', width: (subDone / subtasks.length * 100) + '%', background: 'var(--positive)', borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{subDone}/{subtasks.length} υπο-tasks</div>
        </div>
      )}
    </div>
  )
}

// ─── TimelineView ─────────────────────────────────────────────────────────────
function TimelineView({ items, onEdit }: { items: ChecklistItem[]; onEdit: (item: ChecklistItem) => void }) {
  const withDates = [...items].filter(i => i.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const noDates = items.filter(i => !i.due_date)
  return (
    <div>
      <div style={{ position: 'relative', paddingLeft: 32 }}>
        <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: 'var(--border-subtle)' }} />
        {withDates.map(item => {
          const cat = getCat(item.category); const pri = getPri(item.priority)
          const overdue = isOverdue(item.due_date, item.status); const done = item.status === 'done'; const due = daysUntil(item.due_date)
          return (
            <div key={item.id} style={{ marginBottom: 14, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -26, top: 8, width: 14, height: 14, borderRadius: '50%', background: done ? 'var(--positive)' : overdue ? 'var(--negative)' : cat.color, border: '2px solid var(--bg-base)', zIndex: 1 }} />
              <div onClick={() => onEdit(item)} style={{ background: 'var(--bg-surface)', border: '1px solid ' + (overdue ? 'rgba(234,67,53,0.3)' : 'var(--border-subtle)'), borderRadius: T.radius.inner, padding: '10px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = cat.color)} onMouseLeave={e => (e.currentTarget.style.borderColor = overdue ? 'rgba(234,67,53,0.3)' : 'var(--border-subtle)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', marginBottom: 4, fontFamily: T.font.sans }}>{item.description}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: cat.color }}>{cat.label}</span>
                      <span style={{ fontSize: 11, color: pri.color }}>{pri.label}</span>
                      {item.assigned_contact_name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.assigned_contact_name}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: overdue ? 'var(--negative)' : due !== null && due <= 3 && due >= 0 ? 'var(--warning)' : 'var(--text-secondary)', fontFamily: T.font.mono }}>{fmtDate(item.due_date)}</div>
                    {overdue && <div style={{ fontSize: 10, color: 'var(--negative)' }}>{Math.abs(due || 0)}μ πριν</div>}
                    {!overdue && due !== null && due <= 7 && due >= 0 && <div style={{ fontSize: 10, color: 'var(--warning)' }}>σε {due} ημ.</div>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {noDates.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, fontWeight: 600, fontFamily: T.font.sans }}>Χωρίς Deadline ({noDates.length})</div>
          {noDates.map(item => {
            const cat = getCat(item.category)
            return (
              <div key={item.id} onClick={() => onEdit(item)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, marginBottom: 6, cursor: 'pointer' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, fontFamily: T.font.sans }}>{item.description}</span>
                <span style={{ fontSize: 11, color: cat.color }}>{cat.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TemplateModal ────────────────────────────────────────────────────────────
function TemplateModal({ onSelect, onClose }: { onSelect: (key: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, width: '100%', maxWidth: 620, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontFamily: T.font.sans, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Έτοιμα Templates</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Φόρτωσε έτοιμη λίστα tasks με ένα κλικ</p>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center' }}>✕</button>
          </div>
        </div>
        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, overflowY: 'auto' }}>
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <button key={key} type="button" onClick={() => { onSelect(key); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: T.radius.inner, border: '1px solid ' + t.color + '40', background: t.color + '08', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = t.color + '18'; e.currentTarget.style.borderColor = t.color }}
              onMouseLeave={e => { e.currentTarget.style.background = t.color + '08'; e.currentTarget.style.borderColor = t.color + '40' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t.items.length} tasks · {t.items.filter(i => i.estimated_cost).reduce((s, i) => s + (i.estimated_cost || 0), 0)}€ εκτιμ.</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── ItemModal ────────────────────────────────────────────────────────────────
function ItemModal({ item, contacts, allItems, onSave, onClose }: {
  item?: ChecklistItem; contacts: Contact[]; allItems: ChecklistItem[]
  onSave: (data: ReturnType<typeof mkEmpty>) => void; onClose: () => void
}) {
  const [form, setForm] = useState<ReturnType<typeof mkEmpty>>(item ? {
    description: item.description, category: item.category, note: item.note || '',
    priority: item.priority, due_date: item.due_date || '', start_date: item.start_date || '',
    recurring: item.recurring, assigned_contact_id: item.assigned_contact_id || '',
    assigned_contact_name: item.assigned_contact_name || '',
    estimated_cost: String(item.estimated_cost || ''), actual_cost: String(item.actual_cost || ''),
    budget: String((item as any).budget || ''), status: item.status,
    subtasks: item._subtasks || [], tags: item._tags || [],
    comments: item._comments || [], depends_on: item.depends_on || '',
  } : mkEmpty())
  const [activeTab, setActiveTab] = useState<'basic' | 'subtasks' | 'comments' | 'tags' | 'advanced'>('basic')
  const subDone = form.subtasks.filter(s => s.done).length
  const budgetN = parseFloat(form.budget) || 0; const actualN = parseFloat(form.actual_cost) || 0
  const overBudget = budgetN > 0 && actualN > budgetN * 1.1

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, width: '100%', maxWidth: 580, maxHeight: '92vh', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontFamily: T.font.sans, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{item ? 'Επεξεργασία Task' : 'Νέο Task'}</h3>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center' }}>✕</button>
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {[
              { id: 'basic' as const, label: 'Βασικά' },
              { id: 'subtasks' as const, label: `Υπο-tasks${form.subtasks.length > 0 ? ` (${subDone}/${form.subtasks.length})` : ''}` },
              { id: 'comments' as const, label: `Σχόλια${form.comments.length > 0 ? ` (${form.comments.length})` : ''}` },
              { id: 'tags' as const, label: 'Ετικέτες' },
              { id: 'advanced' as const, label: 'Εξαρτήσεις' },
            ].map(t => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                style={{ padding: '9px 16px', border: 'none', background: 'none', fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500, color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)', borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap', transition: 'color 0.15s', fontFamily: T.font.sans }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div><FL>Περιγραφή *</FL><Inp value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="π.χ. Service καλοριφέρ" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><FL>Κατηγορία</FL><Sel value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))} /></div>
                <div><FL>Προτεραιότητα</FL><Sel value={form.priority} onChange={v => setForm(f => ({ ...f, priority: v as Priority }))} options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><FL>Κατάσταση</FL><Sel value={form.status} onChange={v => setForm(f => ({ ...f, status: v as Status }))} options={STATUSES.map(s => ({ value: s.value, label: s.label }))} /></div>
                <div><FL>Επανάληψη</FL><Sel value={form.recurring} onChange={v => setForm(f => ({ ...f, recurring: v as Recurring }))} options={RECURRING_OPTIONS} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><FL>Ημ. Έναρξης</FL><DatePicker value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} /></div>
                <div><FL>Deadline</FL><DatePicker value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} /></div>
              </div>
              <div><FL>Ανάθεση σε Επαφή</FL>
                <select value={form.assigned_contact_id} onChange={e => { const c = contacts.find(x => x.id === e.target.value); setForm(f => ({ ...f, assigned_contact_id: e.target.value, assigned_contact_name: c?.full_name || '' })) }} style={{ ...iStyle, cursor: 'pointer' }}>
                  <option value="">— Χωρίς ανάθεση —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><FL>Budget (€)</FL><Inp value={form.budget} onChange={v => setForm(f => ({ ...f, budget: v }))} placeholder="Ανώτατο" type="number" /></div>
                <div><FL>Εκτιμώμενο (€)</FL><Inp value={form.estimated_cost} onChange={v => setForm(f => ({ ...f, estimated_cost: v }))} placeholder="150" type="number" /></div>
                <div><FL>Πραγματικό (€)</FL><Inp value={form.actual_cost} onChange={v => setForm(f => ({ ...f, actual_cost: v }))} placeholder="180" type="number" /></div>
              </div>
              {overBudget && <div style={{ background: 'rgba(234,67,53,0.08)', border: '1px solid rgba(234,67,53,0.3)', borderRadius: T.radius.inner, padding: '8px 12px', fontSize: 12, color: 'var(--negative)' }}>Υπέρβαση budget κατά {Math.round((actualN / budgetN - 1) * 100)}%</div>}
              <div><FL>Σημείωση</FL>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Επιπλέον πληροφορίες..." rows={3} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
              </div>
            </div>
          )}
          {activeTab === 'subtasks' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>Χωρίσε το task σε μικρότερα βήματα.</p>
              {form.subtasks.length > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <span>Πρόοδος</span><span style={{ fontWeight: 700, color: subDone === form.subtasks.length ? 'var(--positive)' : 'var(--text-primary)', fontFamily: T.font.mono }}>{subDone}/{form.subtasks.length}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: (form.subtasks.length > 0 ? subDone / form.subtasks.length * 100 : 0) + '%', background: 'var(--positive)', borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
              <SubTaskEditor subtasks={form.subtasks} onChange={v => setForm(f => ({ ...f, subtasks: v }))} />
            </div>
          )}
          {activeTab === 'comments' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>Activity log — ιστορικό ενεργειών και σημειώσεις συνεργασίας.</p>
              <CommentsEditor comments={form.comments} onChange={v => setForm(f => ({ ...f, comments: v }))} />
            </div>
          )}
          {activeTab === 'tags' && (
            <div>
              <FL>Ετικέτες</FL>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>Γρήγορη κατηγοριοποίηση και αναζήτηση.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {ITEM_TAGS.map(t => (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))}
                    style={{ padding: '6px 14px', borderRadius: T.radius.pill, border: '1px solid ' + (form.tags.includes(t) ? 'var(--accent)' : 'var(--border-subtle)'), background: form.tags.includes(t) ? 'rgba(212,175,66,0.12)' : 'transparent', color: form.tags.includes(t) ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: form.tags.includes(t) ? 700 : 400, transition: 'all 0.15s', fontFamily: T.font.sans }}>
                    {form.tags.includes(t) ? '✓ ' : ''}{t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'advanced' && (
            <div>
              <FL>Εξάρτηση από άλλο Task</FL>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>Το task εμφανίζεται ως κλειδωμένο μέχρι το επιλεγμένο να ολοκληρωθεί.</p>
              <select value={form.depends_on} onChange={e => setForm(f => ({ ...f, depends_on: e.target.value }))} style={{ ...iStyle, cursor: 'pointer' }}>
                <option value="">— Χωρίς εξάρτηση —</option>
                {allItems.filter(i => i.id !== item?.id).map(i => (
                  <option key={i.id} value={i.id}>{getCat(i.category).label}: {i.description.slice(0, 50)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div style={{ padding: '16px 28px 24px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
          <button type="button" onClick={() => form.description.trim() && onSave(form)}
            style={{ flex: 2, padding: '12px 0', borderRadius: T.radius.btn, border: 'none', background: form.description.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: form.description.trim() ? '#000' : 'var(--text-tertiary)', fontWeight: 700, cursor: form.description.trim() ? 'pointer' : 'not-allowed', fontSize: 14, transition: 'all 0.15s', fontFamily: T.font.sans }}>
            {item ? 'Αποθήκευση' : 'Προσθήκη Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── QuickExpenseModal ────────────────────────────────────────────────────────
function QuickExpenseModal({ item, propertyId, userId, onClose, onSaved }: { item: ChecklistItem; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(item.actual_cost || item.estimated_cost || ''))
  const [desc, setDesc] = useState(item.description); const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!amount) return; setSaving(true)
    await supabase.from('expenses').insert({ property_id: propertyId, user_id: userId, amount: parseFloat(amount), description: desc, date: new Date().toISOString().split('T')[0], category: 'Συντήρηση & Επισκευές', expense_group: 'maintenance' })
    setSaving(false); onSaved(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <h3 style={{ fontFamily: T.font.sans, fontSize: 18, fontWeight: 700, margin: '0 0 20px', color: 'var(--text-primary)' }}>Καταχώρηση Δαπάνης</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Ποσό (€)</FL><Inp value={amount} onChange={setAmount} placeholder="0" type="number" /></div>
          <div><FL>Περιγραφή</FL><Inp value={desc} onChange={setDesc} placeholder="Περιγραφή δαπάνης" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving || !amount} style={{ flex: 2, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: amount ? 'var(--accent)' : 'var(--bg-elevated)', color: amount ? '#000' : 'var(--text-tertiary)', fontWeight: 700, cursor: amount ? 'pointer' : 'not-allowed', fontFamily: T.font.sans }}>
            {saving ? 'Καταχώρηση...' : 'Καταχώρηση Δαπάνης'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabChecklist({ propertyId, userId }: TabChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCat, setFilterCat] = useState('all')
  const [filterPri, setFilterPri] = useState('all')
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [quickExpenseItem, setQuickExpenseItem] = useState<ChecklistItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showCelebration, setShowCelebration] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([])
  const [tenantInfo, setTenantInfo] = useState<{full_name?: string; phone?: string; afm?: string; email?: string} | null>(null)
  const [loanPayment, setLoanPayment] = useState(0)
  const [enfiaPaid, setEnfiaPaid] = useState(false)
  const prevPct = useRef(0)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200) }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: itemData }, { data: contactData }, { data: tenantData }] = await Promise.all([
      supabase.from('checklist_items').select('*').eq('property_id', propertyId).order('sort_order').order('created_at'),
      supabase.from('contacts').select('id,full_name,role,phone').eq('property_id', propertyId),
      supabase.from('contacts').select('id,full_name').eq('property_id', propertyId).eq('role', 'tenant').limit(1),
    ])
    setItems((itemData || []).map(parseItem))
    setContacts(contactData || [])
    const existingTemplates = new Set((itemData || []).map((i: any) => i.template_id).filter(Boolean))
    const suggestions: SmartSuggestion[] = []
    if (tenantData && tenantData.length > 0 && !existingTemplates.has('checkin'))
      suggestions.push({ title: 'Νέος Ενοικιαστής', reason: 'Βρέθηκε ενοικιαστής — δημιούργησε check-in checklist', templateKey: 'checkin' })
    if (!(itemData || []).some((i: any) => i.category === 'maintenance') && !existingTemplates.has('maintenance'))
      suggestions.push({ title: 'Ετήσια Συντήρηση', reason: 'Δεν υπάρχουν maintenance tasks ακόμα', templateKey: 'maintenance' })
    if (!(itemData || []).some((i: any) => i.category === 'legal'))
      suggestions.push({ title: 'Νομικά / ΑΑΔΕ', reason: 'Δεν υπάρχουν νομικά tasks', templateKey: 'legal' })
    setSmartSuggestions(suggestions.slice(0, 2))

    // Cross-tab: fetch tenant info, loan, ΕΝΦΙΑ bill status (safe — all errors caught)
    try {
      const { data: tenantContactData } = await supabase
        .from('contacts').select('full_name,phone,email')
        .eq('property_id', propertyId).eq('role', 'tenant').limit(1)
      setTenantInfo(tenantContactData?.[0] || null)
    } catch (_) {}

    try {
      const { data: loanData } = await supabase
        .from('loans').select('monthly_payment')
        .eq('property_id', propertyId).limit(1)
      setLoanPayment(loanData?.[0]?.monthly_payment || 0)
    } catch (_) {}

    try {
      const { data: enfiaBillData } = await supabase
        .from('bills').select('id,status')
        .eq('property_id', propertyId)
        .or('description.ilike.%ΕΝΦΙΑ%,description.ilike.%enfia%')
        .limit(1)
      const isPaid = !!(enfiaBillData?.[0]?.status === 'paid' || enfiaBillData?.[0]?.status === 'done')
      setEnfiaPaid(isPaid)
      if (isPaid && itemData) {
        const enfiaTask = (itemData as any[]).find((i: any) => i.description?.toLowerCase().includes('ενφια') && i.status !== 'done')
        if (enfiaTask) {
          await supabase.from('checklist_items').update({ status: 'done', completed: true, completed_at: new Date().toISOString() }).eq('id', enfiaTask.id)
        }
      }
    } catch (_) {}
    setLoading(false)
  }, [propertyId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bulkMode) { setBulkMode(false); setSelected(new Set()) }
    }
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler)
  }, [bulkMode])

  const saveItem = async (form: ReturnType<typeof mkEmpty>) => {
    const noteJson = serializeNote({ note: form.note, subtasks: form.subtasks, comments: form.comments, tags: form.tags })
    const payload = {
      property_id: propertyId, user_id: userId,
      description: form.description.trim(), category: form.category, note: noteJson,
      priority: form.priority, due_date: form.due_date || null, start_date: form.start_date || null,
      recurring: form.recurring, assigned_contact_id: form.assigned_contact_id || null,
      assigned_contact_name: form.assigned_contact_name || null,
      estimated_cost: parseFloat(form.estimated_cost) || 0, actual_cost: parseFloat(form.actual_cost) || 0,
      budget: parseFloat(form.budget) || 0, status: form.status, depends_on: form.depends_on || null,
    }
    if (editItem) { await supabase.from('checklist_items').update(payload).eq('id', editItem.id) }
    else { await supabase.from('checklist_items').insert({ ...payload, completed: false }) }
    setShowAddModal(false); setEditItem(null); fetchAll()
    showToast(editItem ? 'Task ενημερώθηκε' : 'Task προστέθηκε')
  }

  const toggleItem = async (item: ChecklistItem) => {
    const newStatus: Status = item.status === 'done' ? 'pending' : 'done'
    await supabase.from('checklist_items').update({ status: newStatus, completed: newStatus === 'done', completed_at: newStatus === 'done' ? new Date().toISOString() : null }).eq('id', item.id)
    if (newStatus === 'done' && item.recurring !== 'none' && item.due_date) {
      const newDue = nextDueDate(item.due_date, item.recurring)
      await supabase.from('checklist_items').insert({
        property_id: item.property_id, user_id: item.user_id,
        description: item.description, category: item.category, priority: item.priority,
        recurring: item.recurring, due_date: newDue, status: 'pending', completed: false,
        note: serializeNote({ note: '', subtasks: [], comments: [], tags: item._tags || [] }),
        estimated_cost: item.estimated_cost, actual_cost: 0, template_id: item.template_id, sort_order: item.sort_order,
      })
      showToast(`Ολοκληρώθηκε — Επόμενο: ${fmtDate(newDue)}`)
    }
    await fetchAll()
  }

  const duplicateItem = async (item: ChecklistItem) => {
    await supabase.from('checklist_items').insert({ property_id: item.property_id, user_id: item.user_id, description: item.description + ' (αντίγραφο)', category: item.category, priority: item.priority, recurring: item.recurring, due_date: item.due_date, status: 'pending', completed: false, note: serializeNote({ note: '', subtasks: item._subtasks || [], comments: [], tags: item._tags || [] }), estimated_cost: item.estimated_cost, actual_cost: 0, template_id: item.template_id, sort_order: (item.sort_order || 0) + 1 })
    fetchAll(); showToast('Task αντιγράφηκε')
  }

  const deleteItem = async (id: string) => {
    await supabase.from('checklist_items').delete().eq('id', id)
    setDeleteId(null); setSelected(s => { const n = new Set(s); n.delete(id); return n }); fetchAll(); showToast('Task διαγράφηκε')
  }

  const addToCalendar = async (item: ChecklistItem) => {
    await supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title: item.description, event_date: item.due_date || new Date().toISOString().split('T')[0], category: 'maintenance', priority: item.priority === 'critical' ? 'high' : item.priority, status: 'pending', recurring: item.recurring !== 'none', source: 'manual' })
    showToast('Προστέθηκε στο Ημερολόγιο')
  }

  const loadAADECalendar = async () => {
    const year = new Date().getFullYear()
    const rows = AADE_CALENDAR.map((item, i) => ({ property_id: propertyId, user_id: userId, description: item.description, category: item.category, priority: item.priority, recurring: 'yearly' as Recurring, status: 'pending', completed: false, due_date: `${year}-${String(item.month).padStart(2, '0')}-01`, note: serializeNote({ note: '', subtasks: [], comments: [], tags: ['ΑΑΔΕ'] }), estimated_cost: 0, actual_cost: 0, sort_order: i, template_id: 'aade_calendar' }))
    await supabase.from('checklist_items').insert(rows)
    fetchAll(); showToast(`ΑΑΔΕ Ημερολόγιο ${year} φορτώθηκε`)
  }

  const loadTemplate = async (key: string) => {
    const tpl = TEMPLATES[key]; if (!tpl) return
    const insertedIds: string[] = []
    for (let i = 0; i < tpl.items.length; i++) {
      const tItem = tpl.items[i]
      const { data } = await supabase.from('checklist_items').insert({ property_id: propertyId, user_id: userId, description: tItem.description, category: tItem.category, priority: tItem.priority, recurring: tItem.recurring || 'none', status: 'pending', completed: false, note: serializeNote({ note: '', subtasks: [], comments: [], tags: [] }), estimated_cost: tItem.estimated_cost || 0, actual_cost: 0, sort_order: i, template_id: key, depends_on: tItem.depends_on_idx !== undefined && insertedIds[tItem.depends_on_idx] ? insertedIds[tItem.depends_on_idx] : null }).select('id').single()
      insertedIds.push(data?.id || '')
    }
    fetchAll(); showToast(`"${tpl.label}" φορτώθηκε — ${tpl.items.length} tasks`)
  }

  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulkComplete = async () => { const count = selected.size; await Promise.all([...selected].map(id => supabase.from('checklist_items').update({ status: 'done', completed: true, completed_at: new Date().toISOString() }).eq('id', id))); setSelected(new Set()); setBulkMode(false); fetchAll(); showToast(`${count} tasks ολοκληρώθηκαν`) }
  const bulkDelete = async () => { const count = selected.size; if (!confirm(`Διαγραφή ${count} tasks;`)) return; await Promise.all([...selected].map(id => supabase.from('checklist_items').delete().eq('id', id))); setSelected(new Set()); setBulkMode(false); fetchAll(); showToast(`${count} tasks διαγράφηκαν`) }

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
    return matchStatus && matchCat && matchPri && (!hideCompleted || item.status !== 'done') && (!q || item.description.toLowerCase().includes(q) || (item.assigned_contact_name || '').toLowerCase().includes(q) || (item._tags || []).some(t => t.toLowerCase().includes(q)))
  }), [items, filterStatus, filterCat, filterPri, search, hideCompleted])

  const grouped = useMemo(() => { const g: Record<string, ChecklistItem[]> = {}; filtered.forEach(item => { if (!g[item.category]) g[item.category] = []; g[item.category].push(item) }); return g }, [filtered])
  const boardCols = useMemo(() => ({ pending: filtered.filter(i => i.status === 'pending'), in_progress: filtered.filter(i => i.status === 'in_progress'), done: filtered.filter(i => i.status === 'done'), skipped: filtered.filter(i => i.status === 'skipped') }), [filtered])
  const usedCats = CATEGORIES.filter(c => items.some(i => i.category === c.id))
  const hasFilters = filterStatus !== 'all' || filterCat !== 'all' || filterPri !== 'all' || !!search

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: T.font.sans }}>

      {toast && <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--bg-elevated)', border: '1px solid rgba(212,175,66,0.4)', borderRadius: 12, padding: '13px 22px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', zIndex: 9998, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />{toast}</div>}

      {showCelebration && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9997, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: '32px 48px', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 28, fontWeight: 700, color: 'var(--positive)', marginBottom: 8 }}>100% Ολοκληρώθηκε!</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Όλα τα tasks έχουν ολοκληρωθεί</div>
          </div>
        </div>
      )}

      {stats.overdue > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 22 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--negative)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--negative)' }}>{stats.overdue} ληγμένα tasks</span>{stats.critical > 0 && <span style={{ fontSize: 12, color: 'var(--negative)' }}> · {stats.critical} κρίσιμα εκκρεμή</span>}</div>
          <button type="button" onClick={() => setFilterStatus('overdue')} style={{ padding: '5px 14px', borderRadius: T.radius.btn, border: '1px solid rgba(234,67,53,0.4)', background: 'transparent', color: 'var(--negative)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Εμφάνιση</button>
        </div>
      )}

      {smartSuggestions.length > 0 && (
        <div style={{ marginBottom: 22, padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-accent)', borderRadius: T.radius.card }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Έξυπνες Προτάσεις</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {smartSuggestions.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.reason}</div>
                </div>
                <button type="button" onClick={() => loadTemplate(s.templateKey)} style={{ padding: '5px 12px', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>Φόρτωσε</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context ribbon — live cross-tab data */}
      {(tenantInfo || loanPayment > 0 || enfiaPaid) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0, fontFamily: T.font.sans }}>Ζωντανά</div>
          {tenantInfo && tenantInfo.full_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'var(--bg-elevated)', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>{tenantInfo.full_name}</span>
              {tenantInfo.phone && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{tenantInfo.phone}</span>}
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Ενοικιαστής</span>
            </div>
          )}
          {loanPayment > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'var(--bg-elevated)', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Δόση δανείου:</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>{loanPayment.toLocaleString('el-GR')} €/μήνα</span>
            </div>
          )}
          {enfiaPaid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(52,168,83,0.1)', borderRadius: T.radius.pill, border: '1px solid rgba(52,168,83,0.25)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--positive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 600, fontFamily: T.font.sans }}>ΕΝΦΙΑ εξοφλημένο</span>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: T.font.sans, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>Checklist Ακινήτου</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0', fontFamily: T.font.sans }}>{stats.total} tasks · {stats.done} ολοκληρωμένα · {stats.pct}% πρόοδος</p>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0, maxWidth: '75%' }}>
          <button type="button" onClick={() => setHideCompleted(h => !h)} style={{ padding: '6px 11px', borderRadius: T.radius.btn, border: '1px solid ' + (hideCompleted ? 'var(--accent)' : 'var(--border-subtle)'), background: hideCompleted ? 'rgba(212,175,66,0.1)' : 'transparent', color: hideCompleted ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {hideCompleted ? 'Εμφάνιση done' : 'Κρύψε done'}
          </button>
          <button type="button" onClick={() => { setBulkMode(b => !b); setSelected(new Set()) }} style={{ padding: '6px 11px', borderRadius: T.radius.btn, border: '1px solid ' + (bulkMode ? 'var(--accent)' : 'var(--border-subtle)'), background: bulkMode ? 'rgba(212,175,66,0.1)' : 'transparent', color: bulkMode ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s' }}>{bulkMode ? 'Έξοδος' : 'Επιλογή'}</button>
          <button type="button" onClick={() => setShowTemplates(true)} style={{ padding: '6px 11px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>Templates</button>
          <button type="button" onClick={loadAADECalendar}
            style={{ padding: '8px 13px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            ΑΑΔΕ {new Date().getFullYear()}
          </button>
          <button type="button" onClick={() => exportChecklistExcel(items)} style={{ padding: '6px 11px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>Excel</button>
          <button type="button" onClick={() => exportChecklistPDF(items)} style={{ padding: '6px 11px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>PDF</button>
          <button type="button" onClick={() => exportHandoverProtocol(items, 'checkin', tenantInfo || undefined)} style={{ padding: '6px 11px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>Πρωτόκολλο Παράδοσης</button>
          <button type="button" onClick={() => { setEditItem(null); setShowAddModal(true) }} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.pill, padding: '0 18px', height: 34, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'opacity 0.15s', whiteSpace: 'nowrap' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.88'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            + Νέο Task
          </button>
        </div>
      </div>

      {/* Progress */}
      {stats.total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Συνολική Πρόοδος</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: stats.pct === 100 ? 'var(--positive)' : 'var(--accent)', fontFamily: T.font.mono }}>{stats.pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: stats.pct + '%', background: stats.pct === 100 ? 'var(--positive)' : 'var(--accent)', borderRadius: 4, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {stats.total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Σύνολο', value: stats.total, color: 'var(--text-primary)', onClick: () => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all') } },
            { label: 'Ολοκλήρωση', value: stats.done, color: 'var(--positive)', onClick: () => setFilterStatus('done') },
            { label: 'Σε εξέλιξη', value: stats.inProgress, color: '#1a73e8', onClick: () => setFilterStatus('in_progress') },
            { label: 'Ληγμένα', value: stats.overdue, color: 'var(--negative)', onClick: () => setFilterStatus('overdue') },
            { label: 'Κρίσιμα', value: stats.critical, color: 'var(--negative)', onClick: () => setFilterPri('critical') },
            { label: 'Εκτιμ. Κόστος', value: stats.totalEstimated > 0 ? stats.totalEstimated.toLocaleString('el-GR') + '€' : '—', color: 'var(--accent)', onClick: undefined as any },
            { label: 'Πραγματικό', value: stats.totalActual > 0 ? stats.totalActual.toLocaleString('el-GR') + '€' : '—', color: 'var(--warning)', onClick: undefined as any },
          ].map(s => (
            <div key={s.label} onClick={s.onClick} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 12px', textAlign: 'center', cursor: s.onClick ? 'pointer' : 'default', transition: 'border-color 0.15s' }}
              onMouseEnter={e => { if (s.onClick) e.currentTarget.style.borderColor = 'var(--border-default)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontFamily: T.font.mono, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk bar */}
      {bulkMode && selected.size === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', marginBottom: 14, background: 'rgba(212,175,66,0.06)', border: '1px solid var(--border-accent)', borderRadius: T.radius.inner }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>Κάνε κλικ στα tasks για να τα επιλέξεις</span>
          <button type="button" onClick={() => setSelected(new Set(filtered.map(i => i.id)))} style={{ padding: '5px 14px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontFamily: T.font.sans }}>Επιλογή όλων ({filtered.length})</button>
          <button type="button" onClick={() => { setBulkMode(false); setSelected(new Set()) }} style={{ padding: '5px 10px', borderRadius: T.radius.btn, border: 'none', background: 'transparent', fontSize: 16, color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση task, ετικέτας, επαφής..." style={iStyle} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
          {search && <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}>×</button>}
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)} style={{ ...iStyle, minWidth: 160, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Όλες οι καταστάσεις</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          <option value="overdue">Ληγμένα</option>
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...iStyle, minWidth: 165, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Όλες οι κατηγορίες</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)} style={{ ...iStyle, minWidth: 160, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Όλες οι προτεραιότητες</option>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 2, padding: '3px', background: 'var(--bg-surface)', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)' }}>
          {(['list', 'board', 'timeline'] as ViewMode[]).map(v => (
            <button key={v} type="button" onClick={() => setViewMode(v)} style={{ padding: '6px 12px', borderRadius: T.radius.badge, border: 'none', background: viewMode === v ? 'var(--accent)' : 'transparent', color: viewMode === v ? '#000' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: viewMode === v ? 700 : 400, transition: 'all 0.15s', fontFamily: T.font.sans }}>
              {v === 'list' ? 'Λίστα' : v === 'board' ? 'Board' : 'Timeline'}
            </button>
          ))}
        </div>
        {hasFilters && <button type="button" onClick={() => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all'); setSearch('') }} style={{ padding: '8px 12px', borderRadius: T.radius.btn, border: '1px solid rgba(234,67,53,0.3)', background: 'rgba(255,59,48,0.08)', color: 'var(--negative)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: T.font.sans }}>✕ Καθαρισμός</button>}
      </div>

      {/* Category pills */}
      {usedCats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setFilterCat('all')} style={{ padding: '5px 12px', borderRadius: T.radius.pill, border: '1px solid ' + (filterCat === 'all' ? 'var(--accent)' : 'var(--border-subtle)'), background: filterCat === 'all' ? 'rgba(212,175,66,0.1)' : 'transparent', color: filterCat === 'all' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: filterCat === 'all' ? 700 : 400 }}>Όλα ({items.length})</button>
          {usedCats.map(c => {
            const count = items.filter(i => i.category === c.id).length
            const catDone = items.filter(i => i.category === c.id && i.status === 'done').length
            return (
              <button key={c.id} type="button" onClick={() => setFilterCat(filterCat === c.id ? 'all' : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: T.radius.pill, border: '1px solid ' + (filterCat === c.id ? c.color : 'var(--border-subtle)'), background: filterCat === c.id ? c.color + '15' : 'transparent', color: filterCat === c.id ? c.color : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: filterCat === c.id ? 700 : 400, transition: 'all 0.15s' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                {c.label}
                <span style={{ fontSize: 10, opacity: 0.8, fontFamily: T.font.mono }}>{catDone}/{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Φόρτωση...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px dashed var(--border-default)' }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" style={{ margin: '0 auto 18px', display: 'block', opacity: 0.35 }}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" /></svg>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Δεν υπάρχουν tasks ακόμα</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 14, lineHeight: 1.6 }}>Ξεκίνα με ένα έτοιμο template<br />ή πρόσθεσε χειροκίνητα.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowTemplates(true)} style={{ padding: '11px 22px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontWeight: 600, fontFamily: T.font.sans }}>Templates</button>
            <button type="button" onClick={loadAADECalendar} style={{ padding: '11px 22px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontWeight: 600, fontFamily: T.font.sans }}>ΑΑΔΕ Ημερολόγιο</button>
            <button type="button" onClick={() => setShowAddModal(true)} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.pill, height: 40, padding: '0 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>+ Νέο Task</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)' }}>
          <div style={{ marginBottom: 12 }}>Δεν βρέθηκαν αποτελέσματα.</div>
          <button type="button" onClick={() => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all'); setSearch('') }} style={{ padding: '7px 16px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: T.font.sans }}>Καθαρισμός φίλτρων</button>
        </div>
      ) : viewMode === 'board' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
          {STATUSES.map(s => (
            <div key={s.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: T.radius.inner, background: s.bg, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, fontFamily: T.font.sans }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.color + '20', borderRadius: T.radius.pill, padding: '1px 7px', fontFamily: T.font.mono }}>{boardCols[s.value as keyof typeof boardCols].length}</span>
              </div>
              {boardCols[s.value as keyof typeof boardCols].map(item => (
                <BoardCard key={item.id} item={item} onToggle={() => toggleItem(item)} onEdit={() => { setEditItem(item); setShowAddModal(true) }} />
              ))}
              {boardCols[s.value as keyof typeof boardCols].length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 12, borderRadius: T.radius.inner, border: '1px dashed var(--border-subtle)' }}>Κανένα task</div>
              )}
            </div>
          ))}
        </div>
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
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: cat.color, fontFamily: T.font.sans }}>{cat.label}</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, ' + cat.color + '44, transparent)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{catDone}/{catItems.length} · {catPct}%{catEst > 0 ? ` · ${catEst.toLocaleString('el-GR')}€` : ''}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-elevated)', marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: catPct + '%', background: catPct === 100 ? 'var(--positive)' : cat.color, borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
                <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                  {catItems.map((item, idx) => (
                    <ItemRow key={item.id} item={item} allItems={items}
                      onToggle={() => toggleItem(item)}
                      onEdit={() => { setEditItem(item); setShowAddModal(true) }}
                      onDelete={() => setDeleteId(item.id)}
                      onAddToCalendar={() => addToCalendar(item)}
                      onAddToExpenses={() => setQuickExpenseItem(item)}
                      onDuplicate={() => duplicateItem(item)}
                      onBulkSelect={() => toggleSelect(item.id)}
                      bulkSelected={selected.has(item.id)}
                      bulkMode={bulkMode}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating bulk toolbar */}
      {bulkMode && selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 500, display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', minWidth: 480, maxWidth: '90vw' }}>
          <div style={{ padding: '12px 18px', borderRight: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000', fontFamily: T.font.mono }}>{selected.size}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{selected.size === filtered.length ? 'Όλα επιλεγμένα' : 'επιλεγμένα'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            {[
              { label: 'Ολοκλήρωση', fn: bulkComplete, color: 'var(--positive)', hoverBg: 'rgba(52,168,83,0.1)' },
              { label: selected.size === filtered.length ? 'Αποεπιλογή' : `Όλα (${filtered.length})`, fn: () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(i => i.id))) }, color: 'var(--text-secondary)', hoverBg: 'var(--bg-surface)' },
              { label: 'Διαγραφή', fn: bulkDelete, color: 'var(--negative)', hoverBg: 'rgba(234,67,53,0.08)' },
            ].map((a, i, arr) => (
              <button key={i} type="button" onClick={a.fn}
                style={{ flex: 1, padding: '12px 0', border: 'none', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: a.color, fontWeight: 600, fontSize: 13, transition: 'background 0.15s', fontFamily: T.font.sans }}
                onMouseEnter={e => e.currentTarget.style.background = a.hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {a.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setBulkMode(false); setSelected(new Set()) }}
            style={{ padding: '12px 16px', border: 'none', borderLeft: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>✕</button>
        </div>
      )}

      {showTemplates && <TemplateModal onSelect={loadTemplate} onClose={() => setShowTemplates(false)} />}
      {showAddModal && <ItemModal item={editItem || undefined} contacts={contacts} allItems={items} onSave={saveItem} onClose={() => { setShowAddModal(false); setEditItem(null) }} />}
      {quickExpenseItem && <QuickExpenseModal item={quickExpenseItem} propertyId={propertyId} userId={userId} onClose={() => setQuickExpenseItem(null)} onSaved={() => showToast('Δαπάνη καταχωρήθηκε')} />}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 36, width: '100%', maxWidth: 380, border: '1px solid var(--border-subtle)', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(234,67,53,0.1)', border: '1px solid rgba(255,59,48,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 700, fontFamily: T.font.sans }}>Διαγραφή Task;</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>Αυτή η ενέργεια δεν αναιρείται.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
              <button type="button" onClick={() => deleteItem(deleteId!)} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--negative)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>Διαγραφή</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}