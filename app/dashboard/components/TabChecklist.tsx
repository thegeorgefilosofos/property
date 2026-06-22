'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { DatePicker } from './UIComponents'
import { Check, ChevronRight } from 'lucide-react'

const supabase = createSupabaseClient()

type Priority = 'critical' | 'high' | 'normal' | 'low'
type Status = 'pending' | 'in_progress' | 'done' | 'skipped'
type Recurring = 'none' | 'monthly' | 'quarterly' | 'yearly'
type ViewMode = 'list' | 'board' | 'timeline'
type FilterStatus = 'all' | 'pending' | 'in_progress' | 'done' | 'overdue'

interface SubTask { id: string; text: string; done: boolean }
interface Comment { id: string; text: string; ts: string }
interface ChecklistItem {
  id: string; property_id: string; user_id: string; category: string
  description: string; note: string | null; completed: boolean
  completed_at: string | null; created_at: string; priority: Priority
  due_date: string | null; start_date?: string | null; recurring: Recurring
  assigned_contact_id: string | null; assigned_contact_name: string | null
  estimated_cost: number; actual_cost: number; status: Status
  template_id: string | null; linked_expense_id: string | null
  linked_event_id: string | null; sort_order: number; budget?: number
  depends_on?: string | null
  _subtasks?: SubTask[]; _comments?: Comment[]; _tags?: string[]; _photo_url?: string
}
interface Contact { id: string; full_name: string; role: string; phone?: string | null }
interface SmartSuggestion { title: string; reason: string; templateKey: string; icon: string }
interface TabChecklistProps { propertyId: string; userId: string }

const CATEGORIES = [
  { id: 'checkin',     label: 'Παράδοση Ακινήτου',    icon: '🔑', color: 'var(--positive)' },
  { id: 'checkout',   label: 'Αποχώρηση Ενοικιαστή', icon: '🚪', color: 'var(--negative)' },
  { id: 'maintenance',label: 'Συντήρηση',              icon: '🔧', color: 'var(--warning)' },
  { id: 'legal',      label: 'Νομικά / ΑΑΔΕ',         icon: '⚖', color: '#7C3AED' },
  { id: 'renovation', label: 'Ανακαίνιση',            icon: '🏗', color: '#1967D2' },
  { id: 'purchase',   label: 'Αγορά Ακινήτου',        icon: '🏠', color: '#1967D2' },
  { id: 'airbnb',     label: 'Short-term / Airbnb',   icon: '🌴', color: 'var(--positive)' },
  { id: 'financial',  label: 'Οικονομικά',            icon: '💰', color: 'var(--accent)' },
  { id: 'other',      label: 'Άλλο',                  icon: '📋', color: 'var(--text-tertiary)' },
]
const PRIORITIES = [
  { value: 'critical', label: 'Κρίσιμο',  color: 'var(--negative)', bg: 'var(--negative-dim)', icon: '🔴' },
  { value: 'high',     label: 'Υψηλή',    color: 'var(--warning)', bg: 'var(--warning-dim)',  icon: '🟠' },
  { value: 'normal',   label: 'Κανονική', color: 'var(--info)', bg: 'var(--info-dim)',  icon: '🔵' },
  { value: 'low',      label: 'Χαμηλή',   color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', icon: '⚪' },
]
const STATUSES = [
  { value: 'pending',     label: 'Εκκρεμεί',     color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', icon: '⏳' },
  { value: 'in_progress', label: 'Σε εξέλιξη',   color: 'var(--info)', bg: 'var(--info-dim)',  icon: '▶' },
  { value: 'done',        label: 'Ολοκληρώθηκε', color: 'var(--positive)', bg: 'var(--positive-dim)',  icon: '✅' },
  { value: 'skipped',     label: 'Παραλείφθηκε', color: 'var(--negative)', bg: 'var(--negative-dim)', icon: '⏭' },
]
const RECURRING_OPTIONS = [
  { value: 'none', label: 'Χωρίς επανάληψη' },
  { value: 'monthly', label: 'Μηνιαία' },
  { value: 'quarterly', label: 'Τριμηνιαία' },
  { value: 'yearly', label: 'Ετήσια' },
]
const ITEM_TAGS = ['Επείγον','Εγγύηση','Εξωτερικός','DIY','Νόμος','Ασφάλεια','Προτεραιότητα','Αναβλήθηκε']

const AADE_CALENDAR: Array<{ month: number; description: string; category: string; priority: Priority }> = [
  { month: 1,  description: 'Υποβολή εντύπου Ε2 — Μισθώματα περσινού έτους', category: 'legal', priority: 'critical' },
  { month: 2,  description: 'Φορολογική δήλωση (Ε1) — Εισοδήματα ιδιοκτήτη', category: 'legal', priority: 'critical' },
  { month: 3,  description: 'Πληρωμή 1ης δόσης φόρου εισοδήματος', category: 'financial', priority: 'critical' },
  { month: 5,  description: 'Καταχώρηση μισθωτηρίων ΑΑΔΕ (αν νέα)', category: 'legal', priority: 'high' },
  { month: 7,  description: 'Πληρωμή 2ης δόσης φόρου εισοδήματος', category: 'financial', priority: 'critical' },
  { month: 9,  description: 'Πληρωμή ΕΝΦΙΑ — 1η δόση', category: 'legal', priority: 'critical' },
  { month: 10, description: 'Πληρωμή ΕΝΦΙΑ — 2η δόση', category: 'legal', priority: 'critical' },
  { month: 10, description: 'Ανανέωση ασφαλιστηρίου ακινήτου', category: 'legal', priority: 'high' },
  { month: 11, description: 'Έλεγχος ΠΕΑ — λήξη πιστοποιητικού', category: 'legal', priority: 'normal' },
  { month: 12, description: 'Προετοιμασία εγγράφων για φορολογική δήλωση', category: 'legal', priority: 'normal' },
]

const TEMPLATES: Record<string, { label: string; icon: string; color: string; items: Array<{ description: string; category: string; priority: Priority; recurring?: Recurring; estimated_cost?: number; depends_on_idx?: number }> }> = {
  checkin: { label: 'Νέος Ενοικιαστής', icon: '🔑', color: 'var(--positive)', items: [
    { description: 'Φωτογράφηση κάθε δωματίου', category: 'checkin', priority: 'critical' },
    { description: 'Παράδοση κλειδιών (καταγραφή αριθμού σετ)', category: 'checkin', priority: 'critical' },
    { description: 'Καταγραφή μετρητή ΔΕΗ', category: 'checkin', priority: 'critical' },
    { description: 'Καταγραφή μετρητή ΕΥΔΑΠ', category: 'checkin', priority: 'critical' },
    { description: 'Υπογραφή πρωτοκόλλου παράδοσης', category: 'checkin', priority: 'critical' },
    { description: 'Δήλωση μισθωτηρίου στην ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Ενημέρωση ΔΟΥ', category: 'legal', priority: 'high' },
    { description: 'Εξήγηση λειτουργίας θέρμανσης / boiler', category: 'checkin', priority: 'high' },
    { description: 'Εξήγηση λειτουργίας alarm', category: 'checkin', priority: 'high' },
    { description: 'Ενεργοποίηση ασφαλιστηρίου', category: 'checkin', priority: 'high', estimated_cost: 300 },
    { description: 'Παράδοση οδηγιών τοπικής διαχείρισης', category: 'checkin', priority: 'normal' },
    { description: 'Αλλαγή κωδικών WiFi', category: 'checkin', priority: 'normal' },
    { description: 'Μεταβίβαση λογαριασμών ΔΕΗ / ΕΥΔΑΠ', category: 'checkin', priority: 'normal' },
  ]},
  checkout: { label: 'Αποχώρηση Ενοικιαστή', icon: '🚪', color: 'var(--negative)', items: [
    { description: 'Επιστροφή κλειδιών (έλεγχος αριθμού)', category: 'checkout', priority: 'critical' },
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
  maintenance: { label: 'Ετήσια Συντήρηση', icon: '🔧', color: 'var(--warning)', items: [
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
  legal: { label: 'Νομικά / ΑΑΔΕ', icon: '⚖', color: '#7C3AED', items: [
    { description: 'Κατάθεση Ε2 (δήλωση μισθωμάτων)', category: 'legal', priority: 'critical', recurring: 'yearly' },
    { description: 'Πληρωμή ΕΝΦΙΑ', category: 'legal', priority: 'critical', recurring: 'yearly' },
    { description: 'Ανανέωση ασφαλιστηρίου ακινήτου', category: 'legal', priority: 'critical', recurring: 'yearly', estimated_cost: 300 },
    { description: 'Έλεγχος ΠΕΑ (Πιστοποιητικό Ενεργειακής)', category: 'legal', priority: 'high' },
    { description: 'Έλεγχος βεβαίωσης μηχανικού', category: 'legal', priority: 'high' },
    { description: 'Ανανέωση άδειας χρήσης', category: 'legal', priority: 'normal' },
    { description: 'Έλεγχος κτηματολογίου', category: 'legal', priority: 'normal' },
    { description: 'Πληρωμή δημοτικών τελών', category: 'financial', priority: 'normal', recurring: 'yearly' },
  ]},
  renovation: { label: 'Ανακαίνιση', icon: '🏗', color: '#1967D2', items: [
    { description: 'Αίτηση άδειας εργασιών', category: 'renovation', priority: 'critical' },
    { description: 'Επιλογή και ανάθεση εργολάβου', category: 'renovation', priority: 'critical', depends_on_idx: 0 },
    { description: 'Σύνταξη σύμβασης εργολάβου', category: 'renovation', priority: 'critical', depends_on_idx: 1 },
    { description: 'Φωτογράφηση πριν την έναρξη', category: 'renovation', priority: 'critical' },
    { description: 'Έλεγχος ηλεκτρολογικής εγκατάστασης', category: 'renovation', priority: 'high', estimated_cost: 200 },
    { description: 'Έλεγχος υδραυλικής εγκατάστασης', category: 'renovation', priority: 'high', estimated_cost: 150 },
    { description: 'Φάση 1 — Κατεδάφιση', category: 'renovation', priority: 'normal', depends_on_idx: 2 },
    { description: 'Φάση 2 — Κατασκευή', category: 'renovation', priority: 'normal', depends_on_idx: 6 },
    { description: 'Φάση 3 — Φινίρισμα', category: 'renovation', priority: 'normal', depends_on_idx: 7 },
    { description: 'Τελική επιθεώρηση και παραλαβή', category: 'renovation', priority: 'critical', depends_on_idx: 8 },
    { description: 'Έκδοση βεβαίωσης μηχανικού', category: 'renovation', priority: 'high', depends_on_idx: 9 },
  ]},
  airbnb: { label: 'Short-term / Airbnb', icon: '🌴', color: 'var(--positive)', items: [
    { description: 'Ρύθμιση smart lock / κωδικός check-in', category: 'airbnb', priority: 'critical', estimated_cost: 150 },
    { description: 'Δημιουργία οδηγού φιλοξενίας', category: 'airbnb', priority: 'critical' },
    { description: 'Καταχώρηση σε Airbnb / Booking.com', category: 'airbnb', priority: 'critical' },
    { description: 'Φωτογράφηση από επαγγελματία', category: 'airbnb', priority: 'high', estimated_cost: 200 },
    { description: 'Εγγραφή στο Μητρώο Βραχυχρόνιας Μίσθωσης ΑΑΔΕ', category: 'legal', priority: 'critical' },
    { description: 'Ρύθμιση καναλιού καθαριότητας', category: 'airbnb', priority: 'high' },
    { description: 'Ανεφοδιασμός (σαπούνια, χαρτί κλπ)', category: 'airbnb', priority: 'normal', recurring: 'monthly', estimated_cost: 30 },
    { description: 'Τσεκ κλιματισμού πριν κάθε σεζόν', category: 'airbnb', priority: 'high', recurring: 'quarterly', estimated_cost: 70 },
    { description: 'Ανανέωση φωτογραφιών listing', category: 'airbnb', priority: 'low', recurring: 'yearly', estimated_cost: 200 },
  ]},
  purchase: { label: 'Αγορά Ακινήτου', icon: '🏠', color: '#1967D2', items: [
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
    { description: 'Άνοιγμα λογαριασμών ΔΕΗ / ΕΥΔΑΠ', category: 'purchase', priority: 'normal' },
  ]},
}

function fmtDate(d: string | null) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function isOverdue(due: string | null, status: string) {
  if (!due || status === 'done' || status === 'skipped') return false
  return new Date(due) < new Date()
}
function daysUntil(d: string | null) {
  if (!d) return null
  return Math.round((new Date(d).getTime() - Date.now()) / 86400000)
}
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
    if (p?.__cv === 2) return { ...item, note: p.note || null, _subtasks: p.subtasks || [], _comments: p.comments || [], _tags: p.tags || [], _photo_url: p.photo_url || '' }
  } catch {}
  return { ...item, _subtasks: [], _comments: [], _tags: [], _photo_url: '' }
}
function serializeNote(d: { note: string; subtasks: SubTask[]; comments: Comment[]; tags: string[]; photo_url: string }) {
  return JSON.stringify({ __cv: 2, ...d })
}

const iStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: "'Roboto', sans-serif", boxSizing: 'border-box', transition: 'border-color 0.15s' }
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 500, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{children}</label>
}
function Inp({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
}
const mkEmpty = () => ({
  description: '', category: 'other', note: '', priority: 'normal' as Priority,
  due_date: '', start_date: '', recurring: 'none' as Recurring,
  assigned_contact_id: '', assigned_contact_name: '',
  estimated_cost: '', actual_cost: '', budget: '', status: 'pending' as Status,
  subtasks: [] as SubTask[], tags: [] as string[], photo_url: '', comments: [] as Comment[], depends_on: '',
})

function SubTaskEditor({ subtasks, onChange }: { subtasks: SubTask[]; onChange: (s: SubTask[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([...subtasks, { id: Date.now().toString(), text: input.trim(), done: false }]); setInput('') }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {subtasks.map(st => (
          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={() => onChange(subtasks.map(s => s.id === st.id ? { ...s, done: !s.done } : s))} style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid ' + (st.done ? 'var(--positive)' : 'var(--border-subtle)'), background: st.done ? 'var(--positive)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>{st.done && '✓'}</button>
            <span style={{ flex: 1, fontSize: 12, color: st.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: st.done ? 'line-through' : 'none' }}>{st.text}</span>
            <button type="button" onClick={() => onChange(subtasks.filter(s => s.id !== st.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--negative)', fontSize: 14 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Νέο υπο-task..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

function CommentsEditor({ comments, onChange }: { comments: Comment[]; onChange: (c: Comment[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    if (!input.trim()) return
    onChange([{ id: Date.now().toString(), text: input.trim(), ts: new Date().toISOString() }, ...comments])
    setInput('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Γράψε σχόλιο..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {comments.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: 16 }}>Δεν υπάρχουν σχόλια ακόμα</p>}
        {comments.map(c => (
          <div key={c.id} style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border-subtle)', position: 'relative' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: 'Roboto Mono, monospace' }}>{new Date(c.ts).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{c.text}</div>
            <button type="button" onClick={() => onChange(comments.filter(x => x.id !== c.id))} style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function SmartSuggestionsBar({ suggestions, onAccept }: { suggestions: SmartSuggestion[]; onAccept: (key: string) => void }) {
  if (suggestions.length === 0) return null
  return (
    <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--bg-surface)', border: '1px solid var(--border-accent)', borderRadius: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Έξυπνες Προτάσεις</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {suggestions.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
            
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.reason}</div>
            </div>
            <button type="button" onClick={() => onAccept(s.templateKey)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Φόρτωσε</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function exportHandoverProtocol(items: ChecklistItem[], type: 'checkin' | 'checkout') {
  const relevant = items.filter(i => i.category === type || (type === 'checkin' && i.category === 'legal'))
  const title = type === 'checkin' ? 'Πρωτόκολλο Παράδοσης Ακινήτου' : 'Πρωτόκολλο Αποχώρησης Ενοικιαστή'
  const html = `<html><head><title>${title}</title>
  <style>body{font-family:'Google Sans',Roboto,sans-serif;padding:50px;color:#111;max-width:700px;margin:0 auto}
  h1{font-size:22px;border-bottom:2px solid #111;padding-bottom:8px}
  h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#555;margin:20px 0 8px}
  .item{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #eee}
  .cb{width:18px;height:18px;border:2px solid #111;border-radius:4px;flex-shrink:0;margin-top:2px}
  .done .cb{background:var(--positive)}.done .label{text-decoration:line-through;color:#999}
  .label{font-size:13px;flex:1}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
  .box{border:1px solid #ddd;border-radius:8px;padding:14px}
  .sig{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .sig-box{border-top:1px solid #111;padding-top:8px;font-size:12px;color:#555}
  </style></head><body>
  <h1>${title}</h1>
  <p style="color:#888;font-size:13px">Ημερομηνία: ${new Date().toLocaleDateString('el-GR')} | Ακίνητο: ____________________________</p>
  <h2>Λίστα Ελέγχου</h2>
  ${relevant.map(item => `<div class="item ${item.status === 'done' ? 'done' : ''}"><div class="cb">${item.status === 'done' ? '✓' : ''}</div><div class="label">${item.description}</div></div>`).join('')}
  <h2>Μετρητές</h2>
  <div class="grid">
    <div class="box"><div style="font-size:12px;color:#555;margin-bottom:8px">Μετρητής ΔΕΗ</div><div style="font-size:18px;font-weight:700">_____________</div><div style="font-size:11px;color:#888;margin-top:4px">kWh</div></div>
    <div class="box"><div style="font-size:12px;color:#555;margin-bottom:8px">Μετρητής ΕΥΔΑΠ</div><div style="font-size:18px;font-weight:700">_____________</div><div style="font-size:11px;color:#888;margin-top:4px">m³</div></div>
  </div>
  <h2>Κλειδιά</h2>
  <div class="box">Αριθμός σετ: _______ &nbsp; Αριθμός κλειδαριών: _______</div>
  <h2>Παρατηρήσεις</h2>
  <div class="box" style="min-height:80px;color:#999;font-size:13px">Σχόλια / παρατηρήσεις...</div>
  <div class="sig">
    <div class="sig-box">Ιδιοκτήτης<br><br><br>Ονοματεπώνυμο: ____________________<br>Υπογραφή:</div>
    <div class="sig-box">Ενοικιαστής<br><br><br>Ονοματεπώνυμο: ____________________<br>Υπογραφή:</div>
  </div>
  <p style="font-size:10px;color:#bbb;margin-top:40px;text-align:center">Property OS · ${new Date().toLocaleDateString('el-GR')}</p>
  </body></html>`
  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close(); win.print() }
}

function exportPDF(items: ChecklistItem[]) {
  const grouped: Record<string, ChecklistItem[]> = {}
  items.forEach(i => { if (!grouped[i.category]) grouped[i.category] = []; grouped[i.category].push(i) })
  const totalEst = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalAct = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const done = items.filter(i => i.status === 'done').length
  const html = `<html><head><title>Checklist</title>
  <style>body{font-family:'Google Sans',Roboto,sans-serif;padding:40px;color:#111;max-width:800px;margin:0 auto}
  h1{font-size:24px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #eee;padding-bottom:4px}
  .stats{display:flex;gap:20px;margin:16px 0;padding:12px 16px;background:#f9fafb;border-radius:8px}
  .stat{text-align:center}.stat-val{font-size:18px;font-weight:700}.stat-lbl{font-size:10px;color:#888;text-transform:uppercase}
  .item{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6}
  .done{color:var(--text-secondary);text-decoration:line-through}.meta{font-size:11px;color:#888;margin-top:2px}
  </style></head><body>
  <h1>Checklist Ακινήτου</h1>
  <p style="color:#888;font-size:13px">${new Date().toLocaleDateString('el-GR')} · ${done}/${items.length} ολοκληρωμένα</p>
  <div class="stats">
    <div class="stat"><div class="stat-val">${items.length}</div><div class="stat-lbl">Σύνολο</div></div>
    <div class="stat"><div class="stat-val">${done}</div><div class="stat-lbl">Ολοκλήρωση</div></div>
    <div class="stat"><div class="stat-val">${items.length - done}</div><div class="stat-lbl">Εκκρεμή</div></div>
    <div class="stat"><div class="stat-val">${totalEst > 0 ? totalEst.toLocaleString('el-GR') + '€' : '—'}</div><div class="stat-lbl">Εκτιμώμενο</div></div>
    <div class="stat"><div class="stat-val">${totalAct > 0 ? totalAct.toLocaleString('el-GR') + '€' : '—'}</div><div class="stat-lbl">Πραγματικό</div></div>
  </div>
  ${CATEGORIES.filter(c => grouped[c.id]?.length).map(cat => `
    <h2>${cat.icon} ${cat.label}</h2>
    ${(grouped[cat.id] || []).map(item => `
      <div class="item">
        <div style="width:16px;height:16px;border:2px solid #d1d5db;border-radius:4px;flex-shrink:0;margin-top:2px;background:${item.status === 'done' ? 'var(--positive)' : 'white'}"></div>
        <div><div class="${item.status === 'done' ? 'done' : ''}">${item.description}</div>
        <div class="meta">${item.due_date ? '' + fmtDate(item.due_date) + ' · ' : ''}${item.assigned_contact_name ? '' + item.assigned_contact_name + ' · ' : ''}${item.estimated_cost > 0 ? '' + item.estimated_cost + '€' : ''}</div></div>
      </div>`).join('')}
  `).join('')}
  <p style="font-size:10px;color:#bbb;margin-top:40px">Property OS · ${new Date().toLocaleDateString('el-GR')}</p>
  </body></html>`
  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close(); win.print() }
}

// ─── ItemRow — single unified checkbox, professional UX ─────────────────────────
function ItemRow({ item, allItems, onToggle, onEdit, onDelete, onAddToCalendar, onAddToExpenses, onDuplicate, onBulkSelect, bulkSelected, bulkMode }: {
  item: ChecklistItem; allItems: ChecklistItem[]; onToggle: () => void; onEdit: () => void; onDelete: () => void
  onAddToCalendar: () => void; onAddToExpenses: () => void; onDuplicate: () => void
  onBulkSelect?: () => void; bulkSelected?: boolean; bulkMode?: boolean
}) {
  const [hov, setHov] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const cat = getCat(item.category); const pri = getPri(item.priority); const sm = getStatusMeta(item.status)
  const overdue = isOverdue(item.due_date, item.status); const due = daysUntil(item.due_date)
  const done = item.status === 'done'
  const subtasks = item._subtasks || []; const subDone = subtasks.filter(s => s.done).length
  const comments = item._comments || []; const tags = item._tags || []
  const dependsOn = item.depends_on ? allItems.find(i => i.id === item.depends_on) : null
  const blocked = !!(dependsOn && dependsOn.status !== 'done')

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const openMenu = () => {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    setShowMenu(s => !s)
  }

  // ONE checkbox that changes behavior based on mode
  const handleCheck = () => {
    if (bulkMode) { onBulkSelect?.(); return }
    if (!blocked) onToggle()
  }

  // Visual state of the single checkbox
  const cbBorder = bulkMode
    ? (bulkSelected ? 'var(--accent)' : 'var(--border-subtle)')
    : done ? 'var(--positive)' : blocked ? 'var(--text-tertiary)' : overdue ? 'var(--negative)' : 'var(--border-subtle)'
  const cbBg = bulkMode
    ? (bulkSelected ? 'var(--accent)' : 'transparent')
    : done ? 'var(--positive)' : 'transparent'
  const cbCursor = bulkMode ? 'pointer' : blocked ? 'not-allowed' : 'pointer'
  const cbRadius = bulkMode ? 5 : 6

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 16px',
        background: bulkSelected ? 'var(--accent-dim)' : hov ? 'var(--bg-elevated)' : 'transparent',
        border: bulkSelected ? '1px solid var(--border-accent)' : overdue && !done ? '1px solid var(--negative-dim)' : '1px solid transparent',
        borderRadius: 8, transition: 'background 0.12s', opacity: blocked ? 0.65 : 1, position: 'relative',
      }}>

      {/* ── Single unified checkbox ── */}
      <button
        type="button"
        onClick={handleCheck}
        style={{
          width: 20, height: 20, borderRadius: cbRadius, flexShrink: 0, marginTop: 2,
          border: '2px solid ' + cbBorder, background: cbBg, cursor: cbCursor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          if (!bulkMode && !done && !blocked) {
            e.currentTarget.style.borderColor = 'var(--positive)'
            e.currentTarget.style.background = 'rgba(52,211,153,0.1)'
          }
        }}
        onMouseLeave={e => {
          if (!bulkMode && !done && !blocked) {
            e.currentTarget.style.borderColor = overdue ? 'var(--negative)' : 'var(--border-subtle)'
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        {bulkMode && bulkSelected && <span style={{ color: '#000', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
        {!bulkMode && done && <span style={{ color: '#000', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
        {!bulkMode && blocked && !done && <span style={{ fontSize: 9, lineHeight: 1 }}></span>}
      </button>

      {/* ── Content ── */}
      <div style={{ flex: 1, minWidth: 0, cursor: bulkMode ? 'pointer' : 'default' }} onClick={bulkMode ? handleCheck : undefined}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{
            fontSize: 14, fontWeight: 600, lineHeight: 1.35,
            color: done || blocked ? 'var(--text-secondary)' : 'var(--text-primary)',
            textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1,
          }}>
            {item.description}
          </span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: pri.bg, color: pri.color, fontWeight: 600, flexShrink: 0 }}>
            {pri.label}
          </span>
          {item.status !== 'pending' && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: sm.bg, color: sm.color, fontWeight: 600, flexShrink: 0 }}>
              {sm.icon} {sm.label}
            </span>
          )}
          {item.recurring !== 'none' && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)', flexShrink: 0 }}>
              {RECURRING_OPTIONS.find(r => r.value === item.recurring)?.label}
            </span>
          )}
          {blocked && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(107,114,128,0.1)', color: 'var(--text-secondary)', flexShrink: 0 }}>
              Αναμένει: 
            </span>
          )}
          {tags.map(t => (
            <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {t}
            </span>
          ))}
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: cat.color, fontWeight: 500 }}>{cat.label}</span>
          {item.due_date && (
            <span style={{
              fontSize: 11, fontFamily: "'Roboto Mono', monospace",
              color: overdue && !done ? 'var(--negative)' : due !== null && due <= 3 && due >= 0 && !done ? 'var(--warning)' : 'var(--text-secondary)',
              fontWeight: ((overdue || (due !== null && due <= 3 && due >= 0)) && !done) ? 700 : 400,
            }}>
              
              {fmtDate(item.due_date)}
              {overdue && !done && due !== null ? ` (${Math.abs(due)}μ πριν)` : ''}
              {!overdue && due !== null && due <= 3 && due >= 0 && !done ? ` (σε ${due}μ)` : ''}
            </span>
          )}
          {item.assigned_contact_name && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.assigned_contact_name}</span>
          )}
          {item.estimated_cost > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Roboto Mono', monospace" }}>
              {item.estimated_cost.toLocaleString('el-GR')}€{item.actual_cost > 0 ? ` / ${item.actual_cost.toLocaleString('el-GR')}€` : ' εκτ.'}
            </span>
          )}
          {subtasks.length > 0 && (
            <span style={{ fontSize: 11, color: subDone === subtasks.length ? 'var(--positive)' : 'var(--text-secondary)' }}>
              {subDone}/{subtasks.length}
            </span>
          )}
          {comments.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--info)' }}>{comments.length} σχ.</span>
          )}
        </div>

        {/* Subtask progress */}
        {subtasks.length > 0 && (
          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'var(--bg-overlay)', overflow: 'hidden', maxWidth: 100 }}>
            <div style={{ height: '100%', width: (subDone / subtasks.length * 100) + '%', background: 'var(--positive)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        )}
      </div>

      {/* ── Hover actions (normal mode only) ── */}
      {hov && !bulkMode && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={onEdit}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            Επεξ.
          </button>
          <button type="button" onClick={onDelete}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(197,34,31,0.3)', background: 'var(--negative-dim)', color: 'var(--negative)', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; e.currentTarget.style.borderColor = 'var(--negative)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--negative-dim)'; e.currentTarget.style.borderColor = 'rgba(197,34,31,0.3)' }}>
            Διαγρ.
          </button>
          <button ref={menuBtnRef} type="button" onClick={openMenu}
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: showMenu ? 'var(--bg-elevated)' : 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, lineHeight: 1, transition: 'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
            onMouseLeave={e => { if (!showMenu) e.currentTarget.style.background = 'var(--bg-surface)' }}>
            ⋯
          </button>
        </div>
      )}

      {/* ── Portal dropdown ── */}
      {showMenu && (
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: 12, padding: 6, zIndex: 9999, minWidth: 230,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          maxHeight: 'calc(100vh - ' + menuPos.top + 'px - 20px)', overflowY: 'auto',
        }}>
          <div style={{ padding: '6px 10px 4px', fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ενέργειες</div>
          {[
            { icon: null, label: 'Προσθήκη στο Ημερολόγιο', sub: 'Δημιουργία event', fn: () => { onAddToCalendar(); setShowMenu(false) } },
            { icon: null, label: 'Καταχώρηση Δαπάνης', sub: 'Άμεση καταχώρηση στα έξοδα', fn: () => { onAddToExpenses(); setShowMenu(false) } },
            { icon: null, label: 'Αντιγραφή Task', sub: 'Δημιουργία αντιγράφου', fn: () => { onDuplicate(); setShowMenu(false) } },
          ].map((a, i) => (
            <button key={i} type="button" onClick={a.fn}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{a.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{a.sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
function BoardCard({ item, onToggle, onEdit }: { item: ChecklistItem; onToggle: () => void; onEdit: () => void }) {
  const cat = getCat(item.category); const pri = getPri(item.priority)
  const overdue = isOverdue(item.due_date, item.status)
  const subtasks = item._subtasks || []; const subDone = subtasks.filter(s => s.done).length
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid ' + (overdue ? 'rgba(197,34,31,0.4)' : 'var(--border-subtle)'), borderLeft: '3px solid ' + cat.color, borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onClick={onEdit} onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)')} onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.4, paddingRight: 8 }}>{item.description}</div>
        <button type="button" onClick={e => { e.stopPropagation(); onToggle() }} style={{ width: 20, height: 20, borderRadius: 5, border: '2px solid ' + (item.status === 'done' ? 'var(--positive)' : 'var(--border-subtle)'), background: item.status === 'done' ? 'var(--positive)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{item.status === 'done' && '✓'}</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: subtasks.length > 0 ? 6 : 0 }}>
        <span style={{ fontSize: 10, color: cat.color }}>{cat.label}</span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: pri.bg, color: pri.color }}>{pri.label}</span>
        {item.due_date && <span style={{ fontSize: 10, color: overdue ? 'var(--negative)' : 'var(--text-secondary)' }}>{fmtDate(item.due_date)}</span>}
        {item.assigned_contact_name && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{item.assigned_contact_name}</span>}
        {item.estimated_cost > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{item.estimated_cost}€</span>}
        {(item._comments || []).length > 0 && <span style={{ fontSize: 10, color: 'var(--info)' }}>{(item._comments || []).length} σχ.</span>}
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

function TimelineView({ items, onEdit }: { items: ChecklistItem[]; onEdit: (item: ChecklistItem) => void }) {
  const withDates = [...items].filter(i => i.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const noDates = items.filter(i => !i.due_date)
  if (items.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Δεν βρέθηκαν tasks.</div>
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
              <div onClick={() => onEdit(item)} style={{ background: 'var(--bg-surface)', border: '1px solid ' + (overdue ? 'rgba(197,34,31,0.3)' : 'var(--border-subtle)'), borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = cat.color)} onMouseLeave={e => (e.currentTarget.style.borderColor = overdue ? 'rgba(197,34,31,0.3)' : 'var(--border-subtle)')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', marginBottom: 4 }}>{item.description}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: cat.color }}>{cat.label}</span>
                      <span style={{ fontSize: 11, color: pri.color }}>{pri.label}</span>
                      {item.start_date && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>▶ {fmtDate(item.start_date)}</span>}
                      {item.assigned_contact_name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.assigned_contact_name}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: overdue ? 'var(--negative)' : due !== null && due <= 3 && due >= 0 ? 'var(--warning)' : 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtDate(item.due_date)}</div>
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
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, fontWeight: 600 }}>Χωρίς Προθεσμία ({noDates.length})</div>
          {noDates.map(item => { const cat = getCat(item.category); return (
            <div key={item.id} onClick={() => onEdit(item)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{item.description}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cat.label}</span>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

function TemplateModal({ onSelect, onClose }: { onSelect: (key: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, width: '100%', maxWidth: 600, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.32)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 22, fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>Έτοιμα Templates</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Φόρτωσε έτοιμη λίστα tasks με ένα κλικ</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: '20px 26px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, overflowY: 'auto' }}>
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <button key={key} type="button" onClick={() => { onSelect(key); onClose() }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid ' + t.color + '44', background: t.color + '08', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = t.color + '18'; e.currentTarget.style.borderColor = t.color }}
              onMouseLeave={e => { e.currentTarget.style.background = t.color + '08'; e.currentTarget.style.borderColor = t.color + '44' }}>
              
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t.items.length} tasks · {t.items.filter(i => i.estimated_cost).reduce((s, i) => s + (i.estimated_cost || 0), 0)}€ εκτιμ.</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

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
    photo_url: item._photo_url || '', comments: item._comments || [],
    depends_on: item.depends_on || '',
  } : mkEmpty())
  const [activeTab, setActiveTab] = useState<'basic' | 'subtasks' | 'comments' | 'tags' | 'advanced'>('basic')
  const subDone = form.subtasks.filter(s => s.done).length
  const budgetN = parseFloat(form.budget) || 0; const actualN = parseFloat(form.actual_cost) || 0
  const overBudget = budgetN > 0 && actualN > budgetN * 1.1

  const tabs = [
    { id: 'basic' as const, label: 'Βασικά' },
    { id: 'subtasks' as const, label: `Υπο-tasks${form.subtasks.length > 0 ? ` (${subDone}/${form.subtasks.length})` : ''}` },
    { id: 'comments' as const, label: `Σχόλια${form.comments.length > 0 ? ` (${form.comments.length})` : ''}` },
    { id: 'tags' as const, label: 'Ετικέτες' },
    { id: 'advanced' as const, label: 'Εξαρτήσεις' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, width: '100%', maxWidth: 580, maxHeight: '92vh', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.32)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '22px 26px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 22, fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>{item ? 'Επεξεργασία Task' : 'Νέο Task'}</h3>
            <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>✕</button>
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
            {tabs.map(t => <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} style={{ padding: '9px 14px', border: 'none', background: 'none', fontSize: 12, fontWeight: activeTab === t.id ? 700 : 500, color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)', borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap', transition: 'color 0.15s' }}>{t.label}</button>)}
          </div>
        </div>
        <div style={{ padding: '18px 26px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              {overBudget && (
                <div style={{ background: 'var(--negative-dim)', border: '1px solid rgba(197,34,31,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--negative)' }}>
                  Υπέρβαση budget κατά {Math.round((actualN / budgetN - 1) * 100)}%
                </div>
              )}
              <div><FL>Σημείωση</FL>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Επιπλέον πληροφορίες..." rows={3} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
              </div>
            </div>
          )}
          {activeTab === 'subtasks' && (
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Χωρίσε το task σε μικρότερα βήματα. Κάθε υπο-task μπορεί να ολοκληρωθεί ανεξάρτητα.</p>
              {form.subtasks.length > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <span>Πρόοδος</span><span style={{ fontWeight: 700, color: subDone === form.subtasks.length ? 'var(--positive)' : 'var(--text-primary)' }}>{subDone}/{form.subtasks.length}</span>
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
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>Activity log — κράτα σημειώσεις, ενημερώσεις, και ιστορικό ενεργειών.</p>
              <CommentsEditor comments={form.comments} onChange={v => setForm(f => ({ ...f, comments: v }))} />
            </div>
          )}
          {activeTab === 'tags' && (
            <div>
              <FL>Ετικέτες</FL>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>Επίλεξε ετικέτες για εύκολη κατηγοριοποίηση και αναζήτηση.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {ITEM_TAGS.map(t => (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }))}
                    style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid ' + (form.tags.includes(t) ? 'var(--accent)' : 'var(--border-subtle)'), background: form.tags.includes(t) ? 'var(--accent-dim)' : 'transparent', color: form.tags.includes(t) ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: form.tags.includes(t) ? 700 : 400, transition: 'all 0.15s' }}>
                    {form.tags.includes(t) ? '' : ''}{t}
                  </button>
                ))}
              </div>
              {form.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 8, border: '1px solid var(--border-accent)' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 4, alignSelf: 'center' }}>ΕΠΙΛΕΓΜΕΝΑ:</span>
                  {form.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 600 }}>{t}</span>)}
                </div>
              )}
            </div>
          )}
          {activeTab === 'advanced' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <FL>Εξάρτηση από άλλο Task</FL>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
                  Αν επιλέξεις εξάρτηση, αυτό το task εμφανίζεται ως κλειδωμένο (κλειδωμένο) μέχρι το επιλεγμένο task να ολοκληρωθεί.
                </p>
                <select value={form.depends_on} onChange={e => setForm(f => ({ ...f, depends_on: e.target.value }))} style={{ ...iStyle, cursor: 'pointer' }}>
                  <option value="">— Χωρίς εξάρτηση —</option>
                  {allItems.filter(i => i.id !== item?.id).map(i => (
                    <option key={i.id} value={i.id}>{getCat(i.category).icon} {i.description.slice(0, 55)}</option>
                  ))}
                </select>
                {form.depends_on && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid rgba(107,114,128,0.2)', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span></span><span>Αυτό το task θα εμφανίζεται κλειδωμένο μέχρι να ολοκληρωθεί το προαπαιτούμενο.</span>
                  </div>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
                <FL>Γρήγορες Ενέργειες από τη Λίστα</FL>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {[
                    { icon: null, text: 'Κουμπί ⋯ → Προσθήκη στο Ημερολόγιο' },
                    { icon: null, text: 'Κουμπί ⋯ → Καταχώρηση Δαπάνης στα Έξοδα' },
                    { icon: null, text: 'Κουμπί ⋯ → Αντιγραφή Task' },
                  ].map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-base)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                      
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 26px 22px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>Ακύρωση</button>
          <button type="button" onClick={() => form.description.trim() && onSave(form)}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: form.description.trim() ? 'var(--accent)' : 'var(--bg-elevated)', color: form.description.trim() ? '#fff' : 'var(--text-secondary)', fontWeight: 700, cursor: form.description.trim() ? 'pointer' : 'not-allowed', fontSize: 13, transition: 'all 0.15s' }}>
            {item ? 'Αποθήκευση' : 'Προσθήκη Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickExpenseModal({ item, propertyId, userId, onClose, onSaved }: { item: ChecklistItem; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(item.actual_cost || item.estimated_cost || ''))
  const [desc, setDesc] = useState(item.description); const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!amount) return; setSaving(true)
    await supabase.from('expenses').insert({ property_id: propertyId, user_id: userId, amount: parseFloat(amount), description: desc, date: new Date().toISOString().split('T')[0], category: 'Συντήρηση & Επισκευές' })
    setSaving(false); onSaved(); onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, padding: 28, width: '100%', maxWidth: 380, border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 18, margin: '0 0 20px', color: 'var(--text-primary)' }}>Καταχώρηση Δαπάνης</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><FL>Ποσό (€)</FL><Inp value={amount} onChange={setAmount} placeholder="0" type="number" /></div>
          <div><FL>Περιγραφή</FL><Inp value={desc} onChange={setDesc} placeholder="Περιγραφή δαπάνης" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving || !amount} style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: amount ? 'var(--accent)' : 'var(--bg-elevated)', color: amount ? '#fff' : 'var(--text-secondary)', fontWeight: 700, cursor: amount ? 'pointer' : 'not-allowed' }}>{saving ? 'Καταχώρηση...' : 'Καταχώρηση'}</button>
        </div>
      </div>
    </div>
  )
}

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
  const prevPct = useRef(0)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

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
      suggestions.push({ title: 'Νέος Ενοικιαστής', reason: 'Βρέθηκε ενοικιαστής — δημιούργησε check-in checklist', templateKey: 'checkin', icon: '🔑' })
    if (!(itemData || []).some((i: any) => i.category === 'maintenance') && !existingTemplates.has('maintenance'))
      suggestions.push({ title: 'Ετήσια Συντήρηση', reason: 'Δεν υπάρχουν maintenance tasks', templateKey: 'maintenance', icon: '🔧' })
    if (!(itemData || []).some((i: any) => i.category === 'legal') && !existingTemplates.has('legal') && !existingTemplates.has('aade_calendar'))
      suggestions.push({ title: 'Νομικά / ΑΑΔΕ', reason: 'Δεν υπάρχουν νομικά tasks', templateKey: 'legal', icon: '⚖' })
    setSmartSuggestions(suggestions.slice(0, 2))
    setLoading(false)
  }, [propertyId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Keyboard shortcuts — defined after filtered (moved below filtered useMemo)

  const saveItem = async (form: ReturnType<typeof mkEmpty>) => {
    const noteJson = serializeNote({ note: form.note, subtasks: form.subtasks, comments: form.comments, tags: form.tags, photo_url: form.photo_url })
    const payload = {
      property_id: propertyId, user_id: userId,
      description: form.description.trim(), category: form.category, note: noteJson,
      priority: form.priority, due_date: form.due_date || null, start_date: form.start_date || null,
      recurring: form.recurring, assigned_contact_id: form.assigned_contact_id || null,
      assigned_contact_name: form.assigned_contact_name || null,
      estimated_cost: parseFloat(form.estimated_cost) || 0,
      actual_cost: parseFloat(form.actual_cost) || 0,
      budget: parseFloat(form.budget) || 0,
      status: form.status, depends_on: form.depends_on || null,
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
        note: serializeNote({ note: '', subtasks: [], comments: [], tags: item._tags || [], photo_url: '' }),
        estimated_cost: item.estimated_cost, actual_cost: 0, template_id: item.template_id, sort_order: item.sort_order,
      })
      showToast(`✓ Ολοκληρώθηκε — Επόμενο: ${fmtDate(newDue)}`)
    }
    await fetchAll()
  }

  const duplicateItem = async (item: ChecklistItem) => {
    await supabase.from('checklist_items').insert({
      property_id: item.property_id, user_id: item.user_id,
      description: item.description + ' (αντίγραφο)', category: item.category,
      priority: item.priority, recurring: item.recurring, due_date: item.due_date,
      status: 'pending', completed: false,
      note: serializeNote({ note: '', subtasks: item._subtasks || [], comments: [], tags: item._tags || [], photo_url: '' }),
      estimated_cost: item.estimated_cost, actual_cost: 0,
      template_id: item.template_id, sort_order: (item.sort_order || 0) + 1,
    })
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
    const rows = AADE_CALENDAR.map((item, i) => ({
      property_id: propertyId, user_id: userId,
      description: item.description, category: item.category, priority: item.priority,
      recurring: 'yearly' as Recurring, status: 'pending', completed: false,
      due_date: `${year}-${String(item.month).padStart(2, '0')}-01`,
      note: serializeNote({ note: '', subtasks: [], comments: [], tags: ['ΑΑΔΕ'], photo_url: '' }),
      estimated_cost: 0, actual_cost: 0, sort_order: i, template_id: 'aade_calendar',
    }))
    await supabase.from('checklist_items').insert(rows)
    fetchAll(); showToast(`ΑΑΔΕ Ημερολόγιο ${year} φορτώθηκε ✓`)
  }

  const loadTemplate = async (key: string) => {
    const tpl = TEMPLATES[key]; if (!tpl) return
    const insertedIds: string[] = []
    for (let i = 0; i < tpl.items.length; i++) {
      const tItem = tpl.items[i]
      const { data } = await supabase.from('checklist_items').insert({
        property_id: propertyId, user_id: userId,
        description: tItem.description, category: tItem.category,
        priority: tItem.priority, recurring: tItem.recurring || 'none',
        status: 'pending', completed: false,
        note: serializeNote({ note: '', subtasks: [], comments: [], tags: [], photo_url: '' }),
        estimated_cost: tItem.estimated_cost || 0, actual_cost: 0, sort_order: i, template_id: key,
        depends_on: tItem.depends_on_idx !== undefined && insertedIds[tItem.depends_on_idx] ? insertedIds[tItem.depends_on_idx] : null,
      }).select('id').single()
      insertedIds.push(data?.id || '')
    }
    fetchAll(); showToast(`"${tpl.label}" φορτώθηκε — ${tpl.items.length} tasks ✓`)
  }

  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const deleteAll = async () => {
    if (!confirm(`Διαγραφή ΟΛΩΝ των ${items.length} tasks; Η ενέργεια δεν αναιρείται.`)) return
    await supabase.from('checklist_items').delete().eq('property_id', propertyId)
    fetchAll(); showToast('Όλα τα tasks διαγράφηκαν')
  }

  const deleteAllDone = async () => {
    const doneItems = items.filter(i => i.status === 'done')
    if (!doneItems.length) return
    if (!confirm(`Διαγραφή ${doneItems.length} ολοκληρωμένων tasks;`)) return
    await Promise.all(doneItems.map(i => supabase.from('checklist_items').delete().eq('id', i.id)))
    fetchAll(); showToast(`${doneItems.length} ολοκληρωμένα tasks διαγράφηκαν`)
  }

  const bulkComplete = async () => {
    const count = selected.size
    await Promise.all([...selected].map(id => supabase.from('checklist_items').update({ status: 'done', completed: true, completed_at: new Date().toISOString() }).eq('id', id)))
    setSelected(new Set()); setBulkMode(false); fetchAll(); showToast(`${count} tasks ολοκληρώθηκαν ✓`)
  }
  const bulkDelete = async () => {
    const count = selected.size
    if (!confirm(`Διαγραφή ${count} tasks; Η ενέργεια δεν αναιρείται.`)) return
    await Promise.all([...selected].map(id => supabase.from('checklist_items').delete().eq('id', id)))
    setSelected(new Set()); setBulkMode(false); fetchAll(); showToast(`${count} tasks διαγράφηκαν`)
  }

  const stats = useMemo(() => {
    const total = items.length; const done = items.filter(i => i.status === 'done').length
    const overdue = items.filter(i => isOverdue(i.due_date, i.status)).length
    const inProgress = items.filter(i => i.status === 'in_progress').length
    const critical = items.filter(i => i.priority === 'critical' && i.status !== 'done').length
    const totalEstimated = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
    const totalActual = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
    const totalBudget = items.reduce((s, i) => s + ((i as any).budget || 0), 0)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, overdue, inProgress, critical, totalEstimated, totalActual, totalBudget, pct }
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
    const matchHide = !hideCompleted || item.status !== 'done'
    return matchStatus && matchCat && matchPri && matchHide && (!q || item.description.toLowerCase().includes(q) || (item.assigned_contact_name || '').toLowerCase().includes(q) || (item._tags || []).some(t => t.toLowerCase().includes(q)))
  }), [items, filterStatus, filterCat, filterPri, search, hideCompleted])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bulkMode) { setBulkMode(false); setSelected(new Set()) }
      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && bulkMode) {
        e.preventDefault()
        if (selected.size === filtered.length) setSelected(new Set())
        else setSelected(new Set(filtered.map(i => i.id)))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [bulkMode, filtered, selected])

  const grouped = useMemo(() => {
    const g: Record<string, ChecklistItem[]> = {}
    filtered.forEach(item => { if (!g[item.category]) g[item.category] = []; g[item.category].push(item) })
    return g
  }, [filtered])

  const boardCols = useMemo(() => ({
    pending: filtered.filter(i => i.status === 'pending'),
    in_progress: filtered.filter(i => i.status === 'in_progress'),
    done: filtered.filter(i => i.status === 'done'),
    skipped: filtered.filter(i => i.status === 'skipped'),
  }), [filtered])

  const usedCats = CATEGORIES.filter(c => items.some(i => i.category === c.id))
  const hasFilters = filterStatus !== 'all' || filterCat !== 'all' || filterPri !== 'all' || !!search

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', zIndex: 9998, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {showCelebration && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9997, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '2px solid var(--accent)', borderRadius: 20, padding: '32px 48px', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.32)' }}>
            
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>100% Ολοκληρώθηκε!</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Όλα τα tasks έχουν ολοκληρωθεί </div>
          </div>
        </div>
      )}

      {stats.overdue > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--negative-dim)', border: '1px solid rgba(197,34,31,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 20 }}>
          
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--negative)' }}>{stats.overdue} ληγμένα tasks</span>
            {stats.critical > 0 && <span style={{ fontSize: 12, color: 'var(--negative)' }}> · {stats.critical} κρίσιμα εκκρεμή</span>}
          </div>
          <button type="button" onClick={() => setFilterStatus('overdue')} style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(197,34,31,0.4)', background: 'transparent', color: 'var(--negative)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Εμφάνιση →</button>
        </div>
      )}

      <SmartSuggestionsBar suggestions={smartSuggestions} onAccept={loadTemplate} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Checklist Ακινήτου</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 0' }}>{stats.total} tasks · {stats.done} ολοκληρωμένα · {stats.pct}% πρόοδος</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>

          {/* ── View controls ── */}
          <button type="button" onClick={() => setHideCompleted(h => !h)}
            title={hideCompleted ? 'Εμφάνιση ολοκληρωμένων' : 'Απόκρυψη ολοκληρωμένων'}
            style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid ' + (hideCompleted ? 'var(--accent)' : 'var(--border-subtle)'), background: hideCompleted ? 'var(--accent-dim)' : 'transparent', color: hideCompleted ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {hideCompleted ? 'Εμφάνιση done' : 'Κρύψε done'}
          </button>

          <button type="button" onClick={() => { setBulkMode(b => !b); setSelected(new Set()) }}
            style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid ' + (bulkMode ? 'var(--accent)' : 'var(--border-subtle)'), background: bulkMode ? 'var(--accent-dim)' : 'transparent', color: bulkMode ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {bulkMode ? 'Έξοδος' : 'Επιλογή'}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

          {/* ── Add content ── */}
          <button type="button" onClick={() => setShowTemplates(true)}
            style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            Templates
          </button>

          <button type="button" onClick={loadAADECalendar}
            style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.06)', color: '#7C3AED', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(124,58,237,0.06)'}>
            ΑΑΔΕ {new Date().getFullYear()}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

          {/* ── Exports (icon-only with tooltip) ── */}
          <button type="button" onClick={() => exportPDF(items)} title="Εξαγωγή PDF"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 15, cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            PDF
          </button>

          <button type="button" onClick={() => exportHandoverProtocol(items, 'checkin')} title="Πρωτόκολλο Παράδοσης"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 15, cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            Πρωτόκολλο
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)' }} />

          {/* ── Primary CTA ── */}
          <button type="button" onClick={() => { setEditItem(null); setShowAddModal(true) }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Νέο Task
          </button>
        </div>
      </div>

      {stats.total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Συνολική Πρόοδος</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: stats.pct === 100 ? 'var(--positive)' : 'var(--accent)', fontFamily: 'Roboto Mono, monospace' }}>{stats.pct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: stats.pct + '%', background: stats.pct === 100 ? 'var(--positive)' : 'var(--accent)', borderRadius: 5, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

      {stats.total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Σύνολο', value: stats.total, color: 'var(--text-primary)', icon: '📋', onClick: () => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all') } },
            { label: 'Ολοκλήρωση', value: stats.done, color: 'var(--positive)', icon: '✅', onClick: () => setFilterStatus('done') },
            { label: 'Σε εξέλιξη', value: stats.inProgress, color: 'var(--info)', icon: '▶', onClick: () => setFilterStatus('in_progress') },
            { label: 'Ληγμένα', value: stats.overdue, color: 'var(--negative)', icon: '⚠', onClick: () => setFilterStatus('overdue') },
            { label: 'Κρίσιμα', value: stats.critical, color: 'var(--negative)', icon: '🔴', onClick: () => setFilterPri('critical') },
            { label: 'Εκτιμ. Κόστος', value: stats.totalEstimated > 0 ? stats.totalEstimated.toLocaleString('el-GR') + '€' : '—', color: 'var(--accent)', icon: '💰', onClick: undefined as any },
            { label: 'Πραγματικό', value: stats.totalActual > 0 ? stats.totalActual.toLocaleString('el-GR') + '€' : '—', color: stats.totalBudget > 0 && stats.totalActual > stats.totalBudget ? 'var(--negative)' : 'var(--warning)', icon: '💳', onClick: undefined as any },
          ].map(s => (
            <div key={s.label} onClick={s.onClick} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', cursor: s.onClick ? 'pointer' : 'default', transition: 'border-color 0.15s' }}
              onMouseEnter={e => { if (s.onClick) e.currentTarget.style.borderColor = 'var(--border-default)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: 'Roboto Mono, monospace' }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      
      {/* ── Bulk mode hint bar (when active but nothing selected) ── */}
      {bulkMode && selected.size === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 12, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 10 }}>
          
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>Κάνε κλικ στα tasks για να τα επιλέξεις</span>
          <button type="button" onClick={() => setSelected(new Set(filtered.map(i => i.id)))}
            style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
            Επιλογή όλων ({filtered.length})
          </button>
          <button type="button" onClick={() => { setBulkMode(false); setSelected(new Set()) }}
            style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση task, ετικέτας, επαφής..." style={iStyle} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
          {search && <button type="button" onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16 }}>×</button>}
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)} style={{ ...iStyle, minWidth: 160, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Όλες οι καταστάσεις</option>
          <option value="pending">Εκκρεμεί</option>
          <option value="in_progress">Σε εξέλιξη</option>
          <option value="done">Ολοκληρωμένα</option>
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
        <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
          {([['list', 'Λίστα', 'Λίστα'], ['board', 'Board', 'Board'], ['timeline', 'Timeline', 'Timeline']] as [ViewMode, string, string][]).map(([v, icon, lbl]) => (
            <button key={v} type="button" onClick={() => setViewMode(v)} title={lbl} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: viewMode === v ? 'var(--accent)' : 'transparent', color: viewMode === v ? '#000' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: viewMode === v ? 700 : 400, transition: 'all 0.15s' }}>{icon}</button>
          ))}
        </div>
        {hasFilters && (
          <button type="button" onClick={() => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all'); setSearch('') }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(197,34,31,0.3)', background: 'var(--negative-dim)', color: 'var(--negative)', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            ✕ Καθαρισμός φίλτρων
          </button>
        )}
      </div>

      {usedCats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setFilterCat('all')} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (filterCat === 'all' ? 'var(--accent)' : 'var(--border-subtle)'), background: filterCat === 'all' ? 'var(--accent-dim)' : 'transparent', color: filterCat === 'all' ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: filterCat === 'all' ? 700 : 400 }}>Όλα ({items.length})</button>
          {usedCats.map(c => { const count = items.filter(i => i.category === c.id).length; const catDone = items.filter(i => i.category === c.id && i.status === 'done').length; return (
            <button key={c.id} type="button" onClick={() => setFilterCat(filterCat === c.id ? 'all' : c.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (filterCat === c.id ? c.color : 'var(--border-subtle)'), background: filterCat === c.id ? c.color + '15' : 'transparent', color: filterCat === c.id ? c.color : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: filterCat === c.id ? 700 : 400, transition: 'all 0.15s' }}>
              {c.label} <span style={{ fontSize: 10, opacity: 0.8, fontFamily: 'Roboto Mono, monospace' }}>{catDone}/{count}</span>
            </button>
          )})}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Φόρτωση...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 28, border: '1px dashed var(--border-subtle)' }}>
          
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Δεν υπάρχουν tasks ακόμα</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 14 }}>Ξεκίνα με ένα έτοιμο template ή πρόσθεσε το πρώτο σου task χειροκίνητα.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setShowTemplates(true)} style={{ padding: '11px 22px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Επίλεξε Template</button>
            <button type="button" onClick={loadAADECalendar} style={{ padding: '11px 22px', borderRadius: 8, border: '1px solid rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.06)', color: '#7C3AED', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>ΑΑΔΕ Ημερολόγιο</button>
            <button type="button" onClick={() => setShowAddModal(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 20, height: 40, padding: '0 22px', fontSize: 14, fontWeight: 500, fontFamily: "'Google Sans', sans-serif", cursor: 'pointer' }}>+ Νέο Task</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
          
          <div style={{ marginBottom: 12 }}>Δεν βρέθηκαν tasks με τα επιλεγμένα φίλτρα.</div>
          <button type="button" onClick={() => { setFilterStatus('all'); setFilterCat('all'); setFilterPri('all'); setSearch('') }} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Καθαρισμός φίλτρων</button>
        </div>
      ) : viewMode === 'board' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'start' }}>
          {STATUSES.map(s => (
            <div key={s.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: s.bg, marginBottom: 10 }}>
                
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1 }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.color + '22', borderRadius: 20, padding: '1px 7px' }}>{boardCols[s.value as keyof typeof boardCols].length}</span>
              </div>
              {boardCols[s.value as keyof typeof boardCols].map(item => (
                <BoardCard key={item.id} item={item} onToggle={() => toggleItem(item)} onEdit={() => { setEditItem(item); setShowAddModal(true) }} />
              ))}
              {boardCols[s.value as keyof typeof boardCols].length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 12, borderRadius: 8, border: '1px dashed var(--border-subtle)' }}>Κανένα task</div>
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
                  
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: cat.color }}>{cat.label}</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, ' + cat.color + '44, transparent)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{catDone}/{catItems.length} · {catPct}%{catEst > 0 ? ` · ${catEst.toLocaleString('el-GR')}€` : ''}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-elevated)', marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: catPct + '%', background: catPct === 100 ? 'var(--positive)' : cat.color, borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
                <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                  {catItems.map((item, idx) => (
                    <div key={item.id} style={{ borderBottom: idx < catItems.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <ItemRow item={item} allItems={items}
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
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Floating bulk action toolbar ── */}
      {bulkMode && selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 500, display: 'flex', alignItems: 'center', gap: 0,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px var(--accent-dim)',
          overflow: 'hidden', minWidth: 500, maxWidth: '90vw',
        }}>
          {/* Count */}
          <div style={{ padding: '12px 18px', borderRight: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000' }}>
              {selected.size}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {selected.size === filtered.length ? 'Όλα επιλεγμένα' : `επιλεγμέν${selected.size === 1 ? 'ο' : 'α'}`}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <button type="button" onClick={bulkComplete}
              style={{ flex: 1, padding: '12px 0', border: 'none', borderRight: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--positive)', fontWeight: 600, fontSize: 13, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--positive-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
               Ολοκλήρωση
            </button>

            <button type="button" onClick={() => {
              if (selected.size === filtered.length) setSelected(new Set())
              else setSelected(new Set(filtered.map(i => i.id)))
            }}
              style={{ flex: 1, padding: '12px 0', border: 'none', borderRight: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {selected.size === filtered.length ? '☐ Αποεπιλογή' : `☑ Όλα (${filtered.length})`}
            </button>

            <button type="button" onClick={bulkDelete}
              style={{ flex: 1, padding: '12px 0', border: 'none', borderRight: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--negative)', fontWeight: 600, fontSize: 13, transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--negative-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
               Διαγραφή
            </button>
          </div>

          {/* Close */}
          <button type="button" onClick={() => { setBulkMode(false); setSelected(new Set()) }}
            style={{ padding: '12px 16px', border: 'none', borderLeft: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title="Έξοδος από επιλογή">
            ✕
          </button>
        </div>
      )}


      {showTemplates && <TemplateModal onSelect={loadTemplate} onClose={() => setShowTemplates(false)} />}
      {showAddModal && <ItemModal item={editItem || undefined} contacts={contacts} allItems={items} onSave={saveItem} onClose={() => { setShowAddModal(false); setEditItem(null) }} />}
      {quickExpenseItem && <QuickExpenseModal item={quickExpenseItem} propertyId={propertyId} userId={userId} onClose={() => setQuickExpenseItem(null)} onSaved={() => showToast('Δαπάνη καταχωρήθηκε ✓')} />}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, padding: 36, width: '100%', maxWidth: 380, border: '1px solid var(--border-subtle)', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
            
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 22, fontFamily: "'Google Sans', sans-serif" }}>Διαγραφή Task;</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 28px', lineHeight: 1.5 }}>Αυτή η ενέργεια είναι μη αναστρέψιμη. Το task θα διαγραφεί οριστικά.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Ακύρωση</button>
              <button type="button" onClick={() => deleteItem(deleteId)} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: 'var(--negative)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Διαγραφή</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}