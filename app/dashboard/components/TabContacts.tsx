'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { Phone, Mail, X, Star, Search, Edit2, Trash2, Download, Plus, History, QrCode, Printer, MoreHorizontal, Camera, FileText, Globe, MapPin, Clock, AlertTriangle } from 'lucide-react'
import { DatePicker } from './UIComponents'

const supabase = createSupabaseClient()

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContactExtra {
  phone2?: string; whatsapp?: boolean; viber?: boolean; website?: string
  office_address?: string; afm?: string; license_number?: string; iban?: string
  schedule?: string; rating?: number; preferred?: boolean
  last_contact?: string; next_appointment?: string; specialty?: string
  tags?: string[]; avatar_url?: string
  notes_log?: { id: string; text: string; ts: string }[]
  reminder_days?: number; reminder_set?: string
  status?: 'active' | 'pending' | 'inactive' | 'problematic'
  files?: { name: string; url: string; size: string; uploaded: string }[]
}
interface Contact {
  id: string; property_id: string; user_id: string; role: string; full_name: string
  phone: string | null; email: string | null; notes: string | null; created_at: string
  _extra?: ContactExtra; _freeNotes?: string
}
interface TabContactsProps { propertyId: string; userId: string }
type SortMode = 'recent' | 'alpha' | 'rating'
type ViewMode = 'cards' | 'compact'

// ─── Role Groups ──────────────────────────────────────────────────────────────
const GROUPS = [
  { id: 'authorities', label: 'Δημόσιες Αρχές', icon: '', color: '#6366f1', roles: [{ value: 'doy', label: 'ΔΟΥ', icon: '' }, { value: 'ktimatologio', label: 'Κτηματολόγιο', icon: '' }, { value: 'dimos', label: 'Δήμος / Πολεοδομία', icon: '' }, { value: 'efka', label: 'ΕΦΚΑ', icon: '' }, { value: 'dei', label: 'ΔΕΔΔΗΕ / ΔΕΗ', icon: '' }, { value: 'eydap', label: 'ΕΥΔΑΠ', icon: '' }, { value: 'fire_dept', label: 'Πυροσβεστική', icon: '' }] },
  { id: 'legal_finance', label: 'Νομικοί & Οικονομικοί', icon: '', color: '#8b5cf6', roles: [{ value: 'notary', label: 'Συμβολαιογράφος', icon: '' }, { value: 'lawyer', label: 'Δικηγόρος', icon: '' }, { value: 'accountant', label: 'Λογιστής', icon: '' }, { value: 'agent', label: 'Μεσίτης', icon: '' }, { value: 'appraiser', label: 'Εκτιμητής Ακινήτων', icon: '' }, { value: 'insurance', label: 'Ασφαλιστής', icon: '' }, { value: 'bank', label: 'Τράπεζα / Δανειοδότης', icon: '' }] },
  { id: 'management', label: 'Διαχείριση & Λειτουργία', icon: '', color: '#0ea5e9', roles: [{ value: 'manager', label: 'Διαχειριστής Πολυκατοικίας', icon: '' }, { value: 'prop_mgmt', label: 'Εταιρεία Διαχείρισης', icon: '' }, { value: 'cleaning', label: 'Καθαρισμός', icon: '' }, { value: 'security', label: 'Ασφάλεια / Φύλαξη', icon: '' }, { value: 'concierge', label: 'Θυρωρός / Concierge', icon: '' }] },
  { id: 'technical', label: 'Τεχνικοί & Μάστορες', icon: '', color: 'var(--warning)', roles: [{ value: 'plumber', label: 'Υδραυλικός', icon: '' }, { value: 'electrician', label: 'Ηλεκτρολόγος', icon: '' }, { value: 'hvac', label: 'Ψυκτικός / Κλιματισμός', icon: '' }, { value: 'carpenter', label: 'Μαραγκός / Ξυλουργός', icon: '' }, { value: 'painter', label: 'Ελαιοχρωματιστής', icon: '' }, { value: 'tiles', label: 'Πλακάδες / Μαρμαράς', icon: '' }, { value: 'aluminum', label: 'Αλουμινάς / Κουφώματα', icon: '' }, { value: 'locksmith', label: 'Κλειδαράς', icon: '' }, { value: 'welder', label: 'Σιδεράς / Συγκολλητής', icon: '' }, { value: 'elevator', label: 'Ανελκυστήρας', icon: '' }, { value: 'solar', label: 'Ηλιακά / Φωτοβολταϊκά', icon: '' }, { value: 'insulation', label: 'Μονώσεις', icon: '' }, { value: 'roofing', label: 'Στέγη / Επιστεγάσεις', icon: '' }, { value: 'alarm', label: 'Συναγερμός / CCTV', icon: '' }, { value: 'network', label: 'Δίκτυα / Τηλεφωνία', icon: '' }, { value: 'general_tech', label: 'Γενικός Τεχνίτης', icon: '' }] },
  { id: 'outdoor', label: 'Εξωτερικοί Χώροι', icon: '', color: '#10b981', roles: [{ value: 'gardener', label: 'Κηπουρός', icon: '' }, { value: 'pool', label: 'Συντηρητής Πισίνας', icon: '' }, { value: 'pest', label: 'Απεντόμωση / Μυοκτονία', icon: '' }, { value: 'cleaning_ext', label: 'Καθαρισμός Εξωτ. Χώρων', icon: '' }] },
  { id: 'tenants', label: 'Ενοικιαστές & Άλλοι', icon: '', color: '#3b82f6', roles: [{ value: 'tenant', label: 'Ενοικιαστής', icon: '' }, { value: 'prev_tenant', label: 'Πρώην Ενοικιαστής', icon: '' }, { value: 'neighbor', label: 'Γείτονας', icon: '' }, { value: 'other', label: 'Άλλο', icon: '' }] },
]

const ALL_ROLES = GROUPS.flatMap(g => g.roles.map(r => ({ ...r, groupId: g.id, groupColor: g.color, groupLabel: g.label })))
const ROLE_META: Record<string, typeof ALL_ROLES[0]> = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]))
const ROLE_SELECT_OPTIONS = GROUPS.flatMap(g => g.roles.map(r => ({ value: r.value, label: r.icon + ' ' + r.label })))

const PRESET_TAGS = ['Αξιόπιστος', 'VIP', 'Ακριβός', 'Γρήγορος', 'Προτεινόμενος', 'Προσοχή', 'Εκκρεμεί πληρωμή', 'Συνεργάτης']
const REMINDER_OPTIONS = [7, 14, 30, 60, 90]
const STATUS_OPTIONS = [
  { value: 'active',      label: 'Ενεργός',       color: 'var(--positive)', bg: 'var(--positive-dim)',  dot: 'var(--positive)' },
  { value: 'pending',     label: 'Σε αναμονή',    color: 'var(--warning)', bg: 'var(--warning-dim)',  dot: 'var(--warning)' },
  { value: 'inactive',    label: 'Ανενεργός',     color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', dot: 'var(--text-tertiary)' },
  { value: 'problematic', label: 'Προβληματικός', color: 'var(--negative)', bg: 'var(--negative-dim)', dot: 'var(--negative)' },
]

//  Serialize / Parse 
function parseContact(c: Contact): Contact {
  let extra: ContactExtra = {}; let freeNotes = c.notes || ''
  try { const p = JSON.parse(c.notes || '{}'); if (p?.__v === 2) { extra = p.extra || {}; freeNotes = p.notes || '' } } catch { }
  return { ...c, _extra: extra, _freeNotes: freeNotes }
}
function serializeNotes(extra: ContactExtra, freeNotes: string): string {
  return JSON.stringify({ __v: 2, extra, notes: freeNotes })
}

const EMPTY_EXTRA: ContactExtra = {
  phone2: '', whatsapp: false, viber: false, website: '', office_address: '',
  afm: '', license_number: '', iban: '', schedule: '', rating: 0, preferred: false,
  last_contact: '', next_appointment: '', specialty: '', tags: [], avatar_url: '',
  notes_log: [], reminder_days: 0, reminder_set: '', status: 'active', files: [],
}
const EMPTY_FORM = { full_name: '', role: 'other', phone: '', email: '', freeNotes: '', extra: { ...EMPTY_EXTRA } }

//  Helpers 
function fmtDate(d: string) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function daysUntil(d: string) {
  if (!d) return null
  return Math.round((new Date(d).getTime() - Date.now()) / 86400000)
}
function isOverdue(d: string) { const n = daysUntil(d); return n !== null && n < 0 }

// ─── Input helpers ────────────────────────────────────────────────────────────
const iStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: "'Roboto', sans-serif", boxSizing: 'border-box', transition: 'border-color 0.15s' }

function Inp({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
}
function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
}
function Txt({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }} onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')} />
}
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 500, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{children}</label>
}
function Toggle({ value, onChange, colorOn = 'var(--accent)' }: { value: boolean; onChange: (v: boolean) => void; colorOn?: string }) {
  return <button type="button" onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: value ? colorOn : 'var(--border-subtle)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}><div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} /></button>
}
function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  return <div style={{ display: 'flex', gap: 3 }}>{[1,2,3,4,5].map(n => <span key={n} onClick={() => onChange && onChange(n === value ? 0 : n)} onMouseEnter={() => onChange && setHover(n)} onMouseLeave={() => onChange && setHover(0)} style={{ fontSize: onChange ? 22 : 13, cursor: onChange ? 'pointer' : 'default', color: n <= (hover || value) ? 'var(--warning)' : 'var(--border-subtle)', userSelect: 'none', transition: 'color 0.1s' }}></span>)}</div>
}

//  Status Badge 
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 20, background: s.bg, fontSize: 10, fontWeight: 600, color: s.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

//  Tags component 
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = (t: string) => { const v = t.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput('') }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {tags.map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', fontSize: 12, color: 'var(--accent)' }}>
            {t}<button type="button" onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {PRESET_TAGS.filter(t => !tags.includes(t)).map(t => (
          <button key={t} type="button" onClick={() => add(t)} style={{ padding: '3px 9px', borderRadius: 20, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>+ {t}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add(input))} placeholder="Νέα ετικέτα..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={() => add(input)} style={{ padding: '8px 14px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

//  Notes Log 
function NotesLog({ log, onChange }: { log: { id: string; text: string; ts: string }[]; onChange: (l: { id: string; text: string; ts: string }[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    if (!input.trim()) return
    onChange([{ id: Date.now().toString(), text: input.trim(), ts: new Date().toISOString() }, ...log])
    setInput('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Νέα σημείωση..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '8px 14px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {log.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: 16 }}>Δεν υπάρχουν σημειώσεις</p>}
        {log.map(e => (
          <div key={e.id} style={{ background: 'var(--bg-surface)', borderRadius: 4, padding: '8px 12px', border: '1px solid var(--border-subtle)', position: 'relative' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: 'Roboto Mono, monospace' }}>{new Date(e.ts).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{e.text}</div>
            <button type="button" onClick={() => onChange(log.filter(x => x.id !== e.id))} style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

//  Avatar Upload 
function AvatarUpload({ avatarUrl, initials, color, onChange }: { avatarUrl: string; initials: string; color: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const path = `contacts/${Date.now()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error && data) { const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path); onChange(pub.publicUrl) }
    setUploading(false)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid ' + color }} />
          : <div style={{ width: 72, height: 72, borderRadius: '50%', background: color + '22', border: '2px solid ' + color + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color }}>{initials}</div>}
        <button type="button" onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{uploading ? '...' : ''}</button>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Φωτογραφία Επαφής</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>JPG, PNG έως 5MB</div>
        {avatarUrl && <button type="button" onClick={() => onChange('')} style={{ fontSize: 11, color: 'var(--negative)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Αφαίρεση</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

//  File Uploader 
function FileUploader({ files, onChange, contactId }: { files: { name: string; url: string; size: string; uploaded: string }[]; onChange: (f: { name: string; url: string; size: string; uploaded: string }[]) => void; contactId?: string }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const path = `contact-files/${contactId || 'new'}/${Date.now()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      onChange([...files, { name: file.name, url: pub.publicUrl, size: file.size > 1048576 ? `${(file.size/1048576).toFixed(1)}MB` : `${(file.size/1024).toFixed(0)}KB`, uploaded: new Date().toISOString() }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  const icon = (name: string) => ''
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {files.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 12 }}><div style={{ fontSize: 28, marginBottom: 8 }}></div>Δεν υπάρχουν αρχεία</div>}
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 18 }}>{icon(f.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{f.size} · {new Date(f.uploaded).toLocaleDateString('el-GR')}</div>
            </div>
            <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)' }}>Άνοιγμα</a>
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--negative)', fontSize: 16, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 4, border: '1px dashed var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, width: '100%', justifyContent: 'center' }}>
        {uploading ? 'Ανέβασμα...' : 'Προσθήκη Αρχείου (PDF, DOC, JPG, Excel)'}
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

//  QR Code Modal 
function QRCodeModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const vcard = ['BEGIN:VCARD','VERSION:3.0',`FN:${contact.full_name}`,contact.phone?`TEL:${contact.phone}`:'',contact.email?`EMAIL:${contact.email}`:'',contact._extra?.website?`URL:${contact._extra.website}`:'','END:VCARD'].filter(Boolean).join('\n')
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(vcard)}&bgcolor=0e0e1c&color=d4af42&qzone=2`
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, padding: 32, width: '100%', maxWidth: 300, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 18, margin: '0 0 6px', color: 'var(--text-primary)' }}>QR Επαφής</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>Σκάναρε για να αποθηκεύσεις τα στοιχεία</p>
        <img src={qrUrl} alt="QR" style={{ width: 200, height: 200, borderRadius: 12, margin: '0 auto 16px' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{contact.full_name}</p>
        {contact.phone && <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{contact.phone}</p>}
        <button type="button" onClick={onClose} style={{ marginTop: 20, padding: '9px 24px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>Κλείσιμο</button>
      </div>
    </div>
  )
}

//  Contact History Panel 
function ContactHistoryPanel({ contact, propertyId }: { contact: Contact; propertyId: string }) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    async function load() {
      setLoading(true)
      const name = contact.full_name
      const [{ data: exp }, { data: ev }] = await Promise.all([
        supabase.from('expenses').select('id,description,amount,date,category').eq('property_id', propertyId).ilike('description', `%${name}%`).order('date', { ascending: false }).limit(10),
        supabase.from('calendar_events').select('id,title,event_date,status,category').eq('property_id', propertyId).ilike('title', `%${name}%`).order('event_date', { ascending: false }).limit(10),
      ])
      setExpenses(exp || []); setEvents(ev || []); setLoading(false)
    }
    load()
  }, [contact.id, propertyId])
  const extra = contact._extra || {}
  const notesLog = extra.notes_log || []
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const timeline = [
    ...expenses.map(e => ({ date: e.date, title: e.description, sub: e.amount?.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' }), color: 'var(--negative)' })),
    ...events.map(e => ({ date: e.event_date, title: e.title, sub: e.status === 'paid' ? 'Ολοκληρώθηκε' : 'Εκκρεμεί', color: 'var(--info)', icon: '' })),
    ...notesLog.map(n => ({ date: n.ts.split('T')[0], title: n.text, sub: 'Σημείωση', color: 'var(--accent)', icon: '' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, fontFamily: "'Roboto', sans-serif" }}>Φόρτωση ιστορικού...</div>
  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        {[{ label: 'ΔΑΠΑΝΕΣ', value: totalExpenses > 0 ? totalExpenses.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' }) : '—', color: 'var(--negative)' }, { label: 'Ραντεβού', value: events.length > 0 ? `${events.length}` : '—', color: 'var(--info)', icon: '' }, { label: 'Σημειώσεις', value: notesLog.length > 0 ? `${notesLog.length}` : '—', color: 'var(--accent)', icon: '' }].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', borderRadius: 4, padding: '8px 10px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: 'Roboto Mono, monospace' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>
      {timeline.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 12 }}><div style={{ fontSize: 28, marginBottom: 8 }}></div>Δεν υπάρχει ιστορικό για αυτήν την επαφή</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {timeline.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: item.color + '22', border: '1px solid ' + item.color + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, zIndex: 1 }}></div>
                <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: 4, padding: '8px 12px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ display: 'flex', gap: 8 }}><span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtDate(item.date)}</span><span style={{ fontSize: 10, color: item.color }}>{item.sub}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

//  Print Card 
function printContactCard(contact: Contact) {
  const meta = ROLE_META[contact.role] || { icon: '', label: contact.role, groupColor: 'var(--text-tertiary)' }
  const extra = contact._extra || {}
  const status = STATUS_OPTIONS.find(s => s.value === (extra.status || 'active')) || STATUS_OPTIONS[0]
  const html = `<html><head><title>${contact.full_name}</title><style>body{font-family:Inter,sans-serif;padding:40px;max-width:400px;margin:0 auto;color:#111}h1{font-size:22px;margin:0 0 4px}p{margin:4px 0;font-size:13px;color:#555}.role{font-size:12px;color:#888;margin-bottom:8px}.status{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-bottom:16px}.row{display:flex;gap:8px;align-items:center;margin:6px 0}.tag{padding:2px 8px;border-radius:20px;background:#f3f4f6;font-size:11px}hr{border:none;border-top:1px solid #eee;margin:16px 0}</style></head><body>
    <h1>${contact.full_name}</h1><div class="role">${meta.icon} ${meta.label}</div>
    <div class="status" style="background:${status.bg};color:${status.color}"> ${status.label}</div><hr>
    ${contact.phone ? `<div class="row"> ${contact.phone}${extra.whatsapp ? ' · WA' : ''}${extra.viber ? ' · VB' : ''}</div>` : ''}
    ${extra.phone2 ? `<div class="row"> ${extra.phone2} (2ο)</div>` : ''}
    ${contact.email ? `<div class="row"> ${contact.email}</div>` : ''}
    ${extra.website ? `<div class="row"> ${extra.website}</div>` : ''}
    ${extra.office_address ? `<div class="row"> ${extra.office_address}</div>` : ''}
    ${extra.afm ? `<div class="row">ΑΦΜ: ${extra.afm}</div>` : ''}
    ${extra.iban ? `<div class="row">IBAN: ${extra.iban}</div>` : ''}
    ${extra.schedule ? `<div class="row"> ${extra.schedule}</div>` : ''}
    ${(extra.tags||[]).length > 0 ? `<div style="margin-top:12px">${(extra.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(' ')}</div>` : ''}
    ${contact._freeNotes ? `<hr><p>${contact._freeNotes}</p>` : ''}
    <hr><p style="font-size:10px;color:#bbb">Property OS · ${new Date().toLocaleDateString('el-GR')}</p></body></html>`
  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close(); win.print() }
}

//  Compact Row 
function CompactRow({ contact, onEdit, onDelete, selected, onSelect, bulkMode }: { contact: Contact; onEdit: () => void; onDelete: () => void; selected?: boolean; onSelect?: () => void; bulkMode?: boolean }) {
  const meta = ROLE_META[contact.role] || { icon: '', label: contact.role, groupColor: 'var(--text-tertiary)' }
  const extra = contact._extra || {}; const [hov, setHov] = useState(false)
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  const statusMeta = STATUS_OPTIONS.find(s => s.value === (extra.status || 'active')) || STATUS_OPTIONS[0]
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: hov ? 'var(--bg-elevated)' : selected ? 'rgba(212,175,66,0.06)' : 'transparent', transition: 'background 0.15s', border: selected ? '1px solid var(--border-accent)' : '1px solid transparent' }}>
      {bulkMode && <input type="checkbox" checked={!!selected} onChange={onSelect} style={{ width: 16, height: 16, cursor: 'pointer' }} />}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: overdue ? 'var(--negative)' : statusMeta.dot, flexShrink: 0 }} />
      <div style={{ width: 200, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.full_name}</div>
        <div style={{ fontSize: 11, color: meta.groupColor }}>{meta.icon} {meta.label}</div>
      </div>
      <div style={{ width: 130, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{contact.phone || '—'}</div>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || '—'}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 140 }}>{(extra.tags || []).slice(0,2).map(t => <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-accent)' }}>{t}</span>)}</div>
      <StatusBadge status={extra.status || 'active'} />
      {(extra.rating || 0) > 0 && <Stars value={extra.rating || 0} />}
      <div style={{ display: 'flex', gap: 6, opacity: hov ? 1 : 0, transition: 'opacity 0.15s' }}>
        {contact.phone && <a href={'tel:' + contact.phone} style={{ textDecoration: 'none', display:'flex',alignItems:'center' }}></a>}
        {contact.email && <a href={'mailto:' + contact.email} style={{ textDecoration: 'none', display:'flex',alignItems:'center' }}></a>}
        <button type="button" onClick={onEdit} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Επεξεργασία</button>
        <button type="button" onClick={onDelete} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Διαγραφή</button>
      </div>
    </div>
  )
}

//  Contact Card 
function ContactCard({ contact, onEdit, onDelete, onQuickExpense, onQuickCalendar, onShowHistory, onShowQR, selected, onSelect, bulkMode }: {
  contact: Contact; onEdit: () => void; onDelete: () => void
  onQuickExpense: () => void; onQuickCalendar: () => void
  onShowHistory: () => void; onShowQR: () => void
  selected?: boolean; onSelect?: () => void; bulkMode?: boolean
}) {
  const meta = ROLE_META[contact.role] || { icon: '', label: contact.role, groupColor: 'var(--text-tertiary)', groupId: '', groupLabel: '' }
  const extra = contact._extra || {}; const color = meta.groupColor
  const initials = contact.full_name.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase()
  const [hov, setHov] = useState(false); const [editHov, setEditHov] = useState(false); const [delHov, setDelHov] = useState(false); const [showActions, setShowActions] = useState(false)
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  const dueDays = extra.next_appointment ? daysUntil(extra.next_appointment) : null
  const reminderDue = extra.reminder_set ? (daysUntil(extra.reminder_set) || 0) <= 0 : false

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); setShowActions(false) }}
      style={{ background: 'var(--bg-surface)', border: '1px solid ' + (selected ? 'rgba(212,175,66,0.5)' : hov ? color + '66' : overdue ? 'rgba(197,34,31,0.4)' : 'var(--border-subtle)'), borderRadius: 28, padding: '18px 18px 14px', position: 'relative', overflow: 'hidden', boxShadow: hov ? '0 4px 24px ' + color + '18' : 'none', transition: 'all 0.2s' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: overdue ? 'var(--negative)' : color, borderRadius: '14px 0 0 14px' }} />
      {bulkMode && <div style={{ position: 'absolute', top: 10, left: 10 }}><input type="checkbox" checked={!!selected} onChange={onSelect} style={{ width: 16, height: 16, cursor: 'pointer' }} /></div>}
      {overdue && <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--negative)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: '0 14px 0 8px', letterSpacing: '0.06em' }}>ΛΗΞΗ ΡΑΝΤΕΒΟΥ</div>}
      {reminderDue && !overdue && <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--warning)', color: '#000', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: '0 14px 0 8px', letterSpacing: '0.06em' }}>ΥΠΕΝΘΥΜΙΣΗ</div>}
      {hov && !bulkMode && (
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
          {contact.phone && <a href={'tel:' + contact.phone} style={{ width: 28, height: 28, borderRadius: '50%', background: '#25d36622', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, textDecoration: 'none', border: '1px solid #25d36644' }}><Phone size={14}/></a>}
          {extra.whatsapp && contact.phone && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ width: 28, height: 28, borderRadius: '50%', background: '#25d36622', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, textDecoration: 'none', border: '1px solid #25d36644' }}>WA</a>}
          {contact.email && <a href={'mailto:' + contact.email} style={{ width: 28, height: 28, borderRadius: '50%', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, textDecoration: 'none', border: '1px solid ' + color + '44' }}><Mail size={14}/></a>}
          <button type="button" onClick={() => setShowActions(s => !s)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⋯</button>
        </div>
      )}
      {showActions && (
        <div style={{ position: 'absolute', top: 44, right: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 6, zIndex: 10, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {[{ icon: null, label: 'Νέα Δαπάνη', onClick: onQuickExpense }, { icon: null, label: 'Νέο Ραντεβού', onClick: onQuickCalendar }, { icon: null, label: 'Ιστορικό', onClick: onShowHistory }, { icon: null, label: 'QR Code', onClick: onShowQR }, { icon: null, label: 'Εκτύπωση Κάρτας', onClick: () => printContactCard(contact) }].map((a, i) => (
            <button key={i} type="button" onClick={() => { a.onClick(); setShowActions(false) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{a.label}</button>
          ))}
        </div>
      )}
      
      <div style={{ paddingLeft: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          {extra.avatar_url
            ? <img src={extra.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid ' + color + '44', flexShrink: 0 }} />
            : <div style={{ width: 46, height: 46, borderRadius: '50%', background: color + '22', border: '2px solid ' + color + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color, flexShrink: 0 }}>{initials}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.full_name}</div>
            <div style={{ fontSize: 12, color, fontWeight: 600, marginTop: 1 }}>{meta.icon} {meta.label || contact.role}</div>
            {extra.specialty && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{extra.specialty}</div>}
          </div>
        </div>

        {/* Status + Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <StatusBadge status={extra.status || 'active'} />
          {(extra.rating || 0) > 0 && <Stars value={extra.rating || 0} />}
        </div>

        {/* Tags */}
        {(extra.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {(extra.tags || []).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent)' }}>{t}</span>)}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {contact.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}><span style={{ fontFamily: 'Roboto Mono, monospace' }}>{contact.phone}</span>{extra.whatsapp && <span style={{ fontSize: 11, color: '#25d366' }}>WA</span>}{extra.viber && <span style={{ fontSize: 11, color: '#7360f2' }}>VB</span>}</div>}
          {extra.phone2 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><span style={{ fontFamily: 'Roboto Mono, monospace' }}>{extra.phone2}</span><span style={{ fontSize: 10, fontStyle: 'italic' }}>(2ο)</span></div>}
          {contact.email && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span></div>}
          {extra.website && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.website}</span></div>}
          {extra.office_address && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}><span>{extra.office_address}</span></div>}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: contact._freeNotes ? 8 : 12 }}>
          {extra.afm && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>ΑΦΜ {extra.afm}</span>}
          {extra.schedule && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}> {extra.schedule}</span>}
          {extra.next_appointment && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: overdue ? 'var(--negative-dim)' : color + '15', border: '1px solid ' + (overdue ? 'rgba(197,34,31,0.4)' : color + '33'), color: overdue ? 'var(--negative)' : color }}>
              {overdue ? ' ' : ''}{fmtDate(extra.next_appointment)}{overdue && ` (${Math.abs(dueDays || 0)}μ πριν)`}
            </span>
          )}
          {extra.last_contact && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Τελ. επαφή {fmtDate(extra.last_contact)}</span>}
          {(extra.notes_log || []).length > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent)' }}> {(extra.notes_log || []).length} σημ.</span>}
          {(extra.files || []).length > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: 'var(--info)' }}> {(extra.files || []).length} αρχεία</span>}
        </div>

        {contact._freeNotes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface)', borderRadius: 4, padding: '6px 10px', marginBottom: 12, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{contact._freeNotes}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onEdit} onMouseEnter={() => setEditHov(true)} onMouseLeave={() => setEditHov(false)} style={{ flex: 1, padding: '7px 0', borderRadius: 4, border: '1px solid ' + (editHov ? color : 'var(--border-subtle)'), background: 'transparent', color: editHov ? color : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' }}> Επεξεργασία</button>
          <button type="button" onClick={onShowHistory} style={{ padding: '7px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Ιστορικό</button>
          <button type="button" onClick={onDelete} onMouseEnter={() => setDelHov(true)} onMouseLeave={() => setDelHov(false)} style={{ padding: '7px 12px', borderRadius: 4, border: '1px solid ' + (delHov ? 'var(--negative)' : 'var(--border-subtle)'), background: 'transparent', color: delHov ? 'var(--negative)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>Διαγραφή</button>
        </div>
      </div>
    </div>
  )
}

//  History Modal 
function HistoryModal({ contact, propertyId, onClose }: { contact: Contact; propertyId: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, width: '100%', maxWidth: 520, maxHeight: '85vh', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 18, margin: 0, color: 'var(--text-primary)' }}>Ιστορικό Επαφής</h3><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{contact.full_name}</p></div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}><X size={16}/></button>
        </div>
        <div style={{ padding: '0 24px', overflowY: 'auto', flex: 1 }}><ContactHistoryPanel contact={contact} propertyId={propertyId} /></div>
      </div>
    </div>
  )
}

//  Quick Modals 
function QuickExpenseModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState(contact.full_name); const [saving, setSaving] = useState(false)
  const save = async () => { if (!amount) return; setSaving(true); await supabase.from('expenses').insert({ property_id: propertyId, user_id: userId, amount: parseFloat(amount), description, date: new Date().toISOString().split('T')[0], category: 'Αμοιβές Συνεργατών' }); setSaving(false); onSaved(); onClose() }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, padding: 28, width: '100%', maxWidth: 400, border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 18, margin: '0 0 20px', color: 'var(--text-primary)' }}>Νέα Δαπάνη</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8 }}>Επαφή: <strong style={{ color: 'var(--text-primary)' }}>{contact.full_name}</strong></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Ποσό (€)</FL><Inp value={amount} onChange={setAmount} placeholder="π.χ. 150" type="number" /></div>
          <div><FL>Περιγραφή</FL><Inp value={description} onChange={setDescription} placeholder="Περιγραφή εργασίας" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving || !amount} style={{ flex: 2, padding: '10px 0', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Αποθήκευση...' : 'Αποθήκευση Δαπάνης'}</button>
        </div>
      </div>
    </div>
  )
}

function QuickCalendarModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const [title, setTitle] = useState('Ραντεβού με ' + contact.full_name)
  const [date, setDate] = useState(tomorrow.toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const save = async () => { if (!title || !date) return; setSaving(true); await supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title, event_date: date, category: 'tenant', priority: 'medium', status: 'pending', recurring: false, source: 'manual' }); setSaving(false); onSaved(); onClose() }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, padding: 28, width: '100%', maxWidth: 420, border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 18, margin: '0 0 20px', color: 'var(--text-primary)' }}>Νέο Ραντεβού</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Τίτλος</FL><Inp value={title} onChange={setTitle} placeholder="Τίτλος ραντεβού" /></div>
          <div><FL>Ημερομηνία</FL><DatePicker value={date} onChange={v => setDate(v)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving} style={{ flex: 2, padding: '10px 0', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Αποθήκευση...' : 'Προσθήκη στο Ημερολόγιο'}</button>
        </div>
      </div>
    </div>
  )
}

//  Main Component 
export default function TabContacts({ propertyId, userId }: TabContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, extra: { ...EMPTY_EXTRA } })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterTag, setFilterTag] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [modalTab, setModalTab] = useState<'basic' | 'contact' | 'professional' | 'tags' | 'notes' | 'files'>('basic')
  const [error, setError] = useState<string | null>(null)
  const [quickExpense, setQuickExpense] = useState<Contact | null>(null)
  const [quickCalendar, setQuickCalendar] = useState<Contact | null>(null)
  const [historyContact, setHistoryContact] = useState<Contact | null>(null)
  const [qrContact, setQrContact] = useState<Contact | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const fetchContacts = useCallback(async () => { setLoading(true); const { data } = await supabase.from('contacts').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }); setContacts((data || []).map(parseContact)); setLoading(false) }, [propertyId])
  useEffect(() => { fetchContacts() }, [fetchContacts])

  const openAdd = () => { setEditContact(null); setForm({ ...EMPTY_FORM, extra: { ...EMPTY_EXTRA } }); setError(null); setModalTab('basic'); setShowModal(true) }
  const openEdit = (c: Contact) => { setEditContact(c); setForm({ full_name: c.full_name, role: c.role, phone: c.phone || '', email: c.email || '', freeNotes: c._freeNotes || '', extra: { ...EMPTY_EXTRA, ...(c._extra || {}), tags: c._extra?.tags || [], notes_log: c._extra?.notes_log || [], files: c._extra?.files || [] } }); setError(null); setModalTab('basic'); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditContact(null); setError(null) }
  const setExtra = (key: keyof ContactExtra, value: unknown) => setForm(f => ({ ...f, extra: { ...f.extra, [key]: value } }))

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError('Το ονοματεπώνυμο είναι υποχρεωτικό.'); setModalTab('basic'); return }
    setSaving(true); setError(null)
    const payload = { full_name: form.full_name.trim(), role: form.role, phone: form.phone.trim() || null, email: form.email.trim() || null, notes: serializeNotes(form.extra, form.freeNotes) }
    if (editContact) { const { error: e } = await supabase.from('contacts').update(payload).eq('id', editContact.id); if (e) { setError('Σφάλμα αποθήκευσης.'); setSaving(false); return } }
    else { const { error: e } = await supabase.from('contacts').insert({ ...payload, property_id: propertyId, user_id: userId }); if (e) { setError('Σφάλμα αποθήκευσης.'); setSaving(false); return } }
    setSaving(false); closeModal(); fetchContacts(); showToast(editContact ? 'Επαφή ενημερώθηκε' : 'Επαφή προστέθηκε')
  }

  const handleDelete = async (id: string) => { await supabase.from('contacts').delete().eq('id', id); setDeleteId(null); fetchContacts(); showToast('Επαφή διαγράφηκε') }

  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulkDelete = async () => {
    if (!selected.size || !confirm(`Διαγραφή ${selected.size} επαφών;`)) return
    await Promise.all([...selected].map(id => supabase.from('contacts').delete().eq('id', id)))
    setSelected(new Set()); setBulkMode(false); fetchContacts(); showToast(`${selected.size} επαφές διαγράφηκαν`)
  }
  const bulkEmail = () => { const emails = contacts.filter(c => selected.has(c.id) && c.email).map(c => c.email).join(','); if (emails) window.open('mailto:' + emails) }

  const exportCSV = () => {
    const rows = [['Όνομα', 'Ρόλος', 'Κατάσταση', 'Τηλέφωνο', 'Email', 'ΑΦΜ', 'IBAN', 'Αξιολόγηση', 'Ετικέτες', 'Αρχεία', 'Σημειώσεις']]
    contacts.forEach(c => { rows.push([c.full_name, ROLE_META[c.role]?.label || c.role, STATUS_OPTIONS.find(s=>s.value===(c._extra?.status||'active'))?.label||'', c.phone || '', c.email || '', c._extra?.afm || '', c._extra?.iban || '', String(c._extra?.rating || ''), (c._extra?.tags || []).join('; '), String((c._extra?.files||[]).length), c._freeNotes || '']) })
    const csv = rows.map(r => r.map(v => '"' + v.replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'epafes.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const processed = useMemo(() => {
    let list = contacts.filter(c => {
      const matchGroup = filterGroup === 'all' || ROLE_META[c.role]?.groupId === filterGroup
      const matchTag = !filterTag || (c._extra?.tags || []).includes(filterTag)
      const q = search.toLowerCase(); const ex = c._extra || {}
      return matchGroup && matchTag && (!q || c.full_name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q) || (ex.specialty || '').toLowerCase().includes(q) || (ex.afm || '').includes(q) || (ex.tags || []).some((t: string) => t.toLowerCase().includes(q)))
    })
    if (sortMode === 'alpha') list = [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, 'el'))
    if (sortMode === 'rating') list = [...list].sort((a, b) => (b._extra?.rating || 0) - (a._extra?.rating || 0))
    return [...list.filter(c => c._extra?.preferred), ...list.filter(c => !c._extra?.preferred)]
  }, [contacts, search, filterGroup, filterTag, sortMode])

  const groupedFiltered: Record<string, Contact[]> = {}
  processed.forEach(c => { const gid = ROLE_META[c.role]?.groupId || 'tenants'; if (!groupedFiltered[gid]) groupedFiltered[gid] = []; groupedFiltered[gid].push(c) })

  const preferred = contacts.filter(c => c._extra?.preferred)
  const overdueContacts = contacts.filter(c => c._extra?.next_appointment && isOverdue(c._extra.next_appointment))
  const allTags = [...new Set(contacts.flatMap(c => c._extra?.tags || []))]

  const filterOptions = [{ value: 'all', label: 'Όλες οι κατηγορίες' }, ...GROUPS.map(g => ({ value: g.id, label: g.icon + ' ' + g.label }))]
  const sortOptions = [{ value: 'recent', label: 'Πιο πρόσφατες' }, { value: 'alpha', label: 'Αλφαβητικά' }, { value: 'rating', label: 'Αξιολόγηση' }]
  const modalTabs = [
    { id: 'basic' as const, label: 'Βασικά' },
    { id: 'contact' as const, label: 'Επικοινωνία' },
    { id: 'professional' as const, label: 'Επαγγελματικά' },
    { id: 'tags' as const, label: 'Ετικέτες' },
    { id: 'notes' as const, label: 'Σημειώσεις' },
    { id: 'files' as const, label: 'Αρχεία' },
  ]

  const initials = form.full_name.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase()
  const formColor = ROLE_META[form.role]?.groupColor || 'var(--text-tertiary)'

  return (
    <div style={{ padding: '24px', maxWidth: 1060, margin: '0 auto' }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', zIndex: 2000, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>{toast}</div>}

      {/* Overdue Alert */}
      {overdueContacts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(197,34,31,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 20 }}>
          <span style={{ fontSize: 18 }}></span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--negative)' }}>{overdueContacts.length} επαφές με ληγμένο ραντεβού: </span>
            <span style={{ fontSize: 12, color: 'var(--negative)' }}>{overdueContacts.map(c => c.full_name).join(', ')}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Επαφές Ακινήτου</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 0' }}>{contacts.length} επαφές · {preferred.length} προτιμώμενες{overdueContacts.length > 0 ? ` · ${overdueContacts.length} ληγμένα` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { setBulkMode(b => !b); setSelected(new Set()) }} style={{ padding: '9px 12px', borderRadius: 4, border: '1px solid ' + (bulkMode ? 'var(--accent)' : 'var(--border-subtle)'), background: bulkMode ? 'var(--accent-dim)' : 'transparent', color: bulkMode ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}> Bulk</button>
          <button type="button" onClick={exportCSV} style={{ padding: '9px 14px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}> CSV</button>
          <button type="button" onClick={openAdd} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 20, padding: '0 20px', height: 36, fontSize: 14, fontWeight: 500, fontFamily: "'Google Sans', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>+</span> Νέα Επαφή</button>
        </div>
      </div>

      {/* Bulk bar */}
      {bulkMode && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 4, padding: '10px 16px', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{selected.size} επιλεγμένες</span>
          <button type="button" onClick={bulkEmail} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}> Email σε όλες</button>
          <button type="button" onClick={bulkDelete} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid rgba(197,34,31,0.4)', background: 'rgba(248,113,113,0.08)', fontSize: 12, color: 'var(--negative)', cursor: 'pointer' }}> Διαγραφή</button>
          <button type="button" onClick={() => setSelected(new Set(processed.map(c => c.id)))} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Επιλογή όλων</button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Αποεπιλογή</button>
        </div>
      )}

      {/* Preferred Quick Bar */}
      {preferred.length > 0 && (
        <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}> Γρήγορη Πρόσβαση</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {preferred.map(c => { const meta = ROLE_META[c.role] || { icon: '', groupColor: 'var(--text-tertiary)', label: c.role }; const overdue = c._extra?.next_appointment && isOverdue(c._extra.next_appointment); return (
              <div key={c.id} onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 30, background: 'var(--bg-elevated)', border: '1px solid ' + (overdue ? 'rgba(197,34,31,0.4)' : meta.groupColor + '44'), cursor: 'pointer', position: 'relative' }}>
                {overdue && <span style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--negative)', border: '2px solid var(--bg-elevated)' }} />}
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: meta.groupColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: meta.groupColor }}>
                  {c._extra?.avatar_url ? <img src={c._extra.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : c.full_name.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase()}
                </div>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.full_name}</div><div style={{ fontSize: 11, color: meta.groupColor }}>{meta.icon} {meta.label}</div></div>
                {c.phone && <a href={'tel:' + c.phone} onClick={e => e.stopPropagation()} style={{ marginLeft: 4, textDecoration: 'none', display:'flex' }}><Phone size={14}/></a>}
              </div>
            )})}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 200 }}><Inp value={search} onChange={setSearch} placeholder="Αναζήτηση ονόματος, τηλ., email, ΑΦΜ, ετικέτας..." /></div>
        <div style={{ minWidth: 200 }}><Sel value={filterGroup} onChange={setFilterGroup} options={filterOptions} /></div>
        {allTags.length > 0 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...iStyle, minWidth: 140, width: 'auto', cursor: 'pointer' }}>
            <option value="">Όλες οι ετικέτες</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <div style={{ minWidth: 160 }}><Sel value={sortMode} onChange={v => setSortMode(v as SortMode)} options={sortOptions} /></div>
        <div style={{ display: 'flex', gap: 4, padding: '4px', background: 'var(--bg-surface)', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
          {(['cards', 'compact'] as ViewMode[]).map(v => <button key={v} type="button" onClick={() => setViewMode(v)} style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: viewMode === v ? 'var(--accent)' : 'transparent', color: viewMode === v ? '#000' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: viewMode === v ? 700 : 400 }}>{v === 'cards' ? 'Κάρτες' : 'Λίστα'}</button>)}
        </div>
      </div>

      {/* Category pills */}
      {contacts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {GROUPS.filter(g => contacts.some(c => ROLE_META[c.role]?.groupId === g.id)).map(g => { const count = contacts.filter(c => ROLE_META[c.role]?.groupId === g.id).length; return (
            <button key={g.id} type="button" onClick={() => setFilterGroup(filterGroup === g.id ? 'all' : g.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: '1px solid ' + (filterGroup === g.id ? g.color : 'var(--border-subtle)'), background: filterGroup === g.id ? g.color + '15' : 'transparent', cursor: 'pointer', fontSize: 12, color: filterGroup === g.id ? g.color : 'var(--text-secondary)', fontWeight: filterGroup === g.id ? 700 : 400, transition: 'all 0.15s' }}>
              <span>{g.icon}</span>{g.label}<span style={{ background: filterGroup === g.id ? g.color : 'var(--bg-elevated)', color: filterGroup === g.id ? '#fff' : 'var(--text-secondary)', borderRadius: 20, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{count}</span>
            </button>
          )})}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>Φόρτωση...</div>
      ) : contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 12, border: '1px dashed var(--border-subtle)' }}>
          
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Δεν υπάρχουν επαφές</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Πρόσθεσε ΔΟΥ, συμβολαιογράφους, τεχνικούς και όλες τις επαφές του ακινήτου.</div>
          <button type="button" onClick={openAdd} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 20, padding: '0 24px', height: 40, fontSize: 14, fontWeight: 500, fontFamily: "'Google Sans', sans-serif", cursor: 'pointer' }}>Πρόσθεσε την πρώτη επαφή</button>
        </div>
      ) : processed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}><div>Δεν βρέθηκαν αποτελέσματα.</div></div>
      ) : viewMode === 'compact' ? (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            {bulkMode && <div style={{ width: 20 }} />}
            <div style={{ width: 8 }} />
            <div style={{ width: 200, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Όνομα</div>
            <div style={{ width: 130, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Τηλέφωνο</div>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</div>
            <div style={{ width: 100, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ετικέτες</div>
            <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Κατάσταση</div>
          </div>
          {processed.map(c => <CompactRow key={c.id} contact={c} onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {GROUPS.filter(g => groupedFiltered[g.id]?.length).map(g => (
            <div key={g.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 20 }}>{g.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: g.color }}>{g.label}</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, ' + g.color + '44, transparent)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '2px 10px', borderRadius: 20, border: '1px solid var(--border-subtle)' }}>{groupedFiltered[g.id].length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {groupedFiltered[g.id].map(c => (
                  <ContactCard key={c.id} contact={c}
                    onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)}
                    onQuickExpense={() => setQuickExpense(c)} onQuickCalendar={() => setQuickCalendar(c)}
                    onShowHistory={() => setHistoryContact(c)} onShowQR={() => setQrContact(c)}
                    selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/*  MODAL  */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, width: '100%', maxWidth: 580, maxHeight: '92vh', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '24px 28px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{editContact ? 'Επεξεργασία Επαφής' : 'Νέα Επαφή'}</h3>
                <button type="button" onClick={closeModal} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}><X size={16}/></button>
              </div>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
                {modalTabs.map(t => <button type="button" key={t.id} onClick={() => setModalTab(t.id)} style={{ padding: '8px 14px', border: 'none', background: 'none', fontSize: 12, fontWeight: modalTab === t.id ? 700 : 500, color: modalTab === t.id ? 'var(--accent)' : 'var(--text-secondary)', borderBottom: modalTab === t.id ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}>{t.label}</button>)}
              </div>
            </div>

            <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>

              {modalTab === 'basic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <AvatarUpload avatarUrl={form.extra.avatar_url || ''} initials={initials} color={formColor} onChange={v => setExtra('avatar_url', v)} />
                  <div><FL>Ονοματεπώνυμο / Επωνυμία *</FL><Inp value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} placeholder="π.χ. Γιώργης Παπαδόπουλος ή Τεχνική ΑΕ" /></div>
                  <div><FL>Κατηγορία / Ειδικότητα</FL><Sel value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} options={ROLE_SELECT_OPTIONS} /></div>
                  <div><FL>Υπο-ειδικότητα (προαιρετικό)</FL><Inp value={form.extra.specialty || ''} onChange={v => setExtra('specialty', v)} placeholder="π.χ. Ειδικός σε κεντρική θέρμανση" /></div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Προτιμώμενη Επαφή</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Γρήγορη πρόσβαση στην κορυφή</div></div>
                    <Toggle value={!!form.extra.preferred} onChange={v => setExtra('preferred', v)} />
                  </div>
                  <div><FL>Αξιολόγηση</FL><Stars value={form.extra.rating || 0} onChange={v => setExtra('rating', v)} /></div>
                  <div>
                    <FL>Κατάσταση Σχέσης</FL>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {STATUS_OPTIONS.map(s => (
                        <button key={s.value} type="button" onClick={() => setExtra('status', s.value)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, border: '1px solid ' + ((form.extra.status || 'active') === s.value ? s.color : 'var(--border-subtle)'), background: (form.extra.status || 'active') === s.value ? s.bg : 'transparent', color: (form.extra.status || 'active') === s.value ? s.color : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: (form.extra.status || 'active') === s.value ? 700 : 400, transition: 'all 0.15s' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />{s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'contact' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div><FL>Κύριο Τηλέφωνο</FL><Inp value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="π.χ. 2101234567" /></div>
                  <div><FL>2ο Τηλέφωνο / Κινητό</FL><Inp value={form.extra.phone2 || ''} onChange={v => setExtra('phone2', v)} placeholder="π.χ. 6941234567" /></div>
                  <div><FL>Email</FL><Inp value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@example.gr" /></div>
                  <div style={{ display: 'flex', gap: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle value={!!form.extra.whatsapp} onChange={v => setExtra('whatsapp', v)} colorOn="#25d366" /><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}> WhatsApp</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle value={!!form.extra.viber} onChange={v => setExtra('viber', v)} colorOn="#7360f2" /><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}> Viber</span></div>
                  </div>
                  <div><FL>Website</FL><Inp value={form.extra.website || ''} onChange={v => setExtra('website', v)} placeholder="www.example.gr" /></div>
                  <div><FL>Διεύθυνση Γραφείου</FL><Inp value={form.extra.office_address || ''} onChange={v => setExtra('office_address', v)} placeholder="π.χ. Σταδίου 15, Αθήνα" /></div>
                  <div><FL>Ωράριο Εργασίας</FL><Inp value={form.extra.schedule || ''} onChange={v => setExtra('schedule', v)} placeholder="π.χ. Δε-Πα 09:00-17:00" /></div>
                </div>
              )}

              {modalTab === 'professional' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div><FL>ΑΦΜ</FL><Inp value={form.extra.afm || ''} onChange={v => setExtra('afm', v)} placeholder="π.χ. 123456789" /></div>
                  <div><FL>Αρ. Μητρώου / Άδειας</FL><Inp value={form.extra.license_number || ''} onChange={v => setExtra('license_number', v)} placeholder="π.χ. Αρ. Αδείας Μεσίτη 123" /></div>
                  <div><FL>IBAN (για πληρωμές)</FL><Inp value={form.extra.iban || ''} onChange={v => setExtra('iban', v)} placeholder="GR1601101250000000012300695" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><FL>Τελευταία Επαφή</FL><DatePicker value={form.extra.last_contact || ''} onChange={v => setExtra('last_contact', v)} /></div>
                    <div><FL>Επόμενο Ραντεβού</FL><DatePicker value={form.extra.next_appointment || ''} onChange={v => setExtra('next_appointment', v)} /></div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 14, border: '1px solid var(--border-subtle)' }}>
                    <FL>Υπενθύμιση Επικοινωνίας</FL>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {[0, ...REMINDER_OPTIONS].map(d => (
                        <button key={d} type="button" onClick={() => { setExtra('reminder_days', d); setExtra('reminder_set', d > 0 ? new Date(Date.now() + d * 86400000).toISOString().split('T')[0] : '') }}
                          style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid ' + ((form.extra.reminder_days || 0) === d ? 'var(--accent)' : 'var(--border-subtle)'), background: (form.extra.reminder_days || 0) === d ? 'var(--accent-dim)' : 'transparent', color: (form.extra.reminder_days || 0) === d ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                          {d === 0 ? 'Καμία' : `${d}μ`}
                        </button>
                      ))}
                    </div>
                    {(form.extra.reminder_days || 0) > 0 && form.extra.reminder_set && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Υπενθύμιση: {fmtDate(form.extra.reminder_set)}</div>}
                  </div>
                </div>
              )}

              {modalTab === 'tags' && (
                <div><FL>Ετικέτες Επαφής</FL><TagEditor tags={form.extra.tags || []} onChange={v => setExtra('tags', v)} /></div>
              )}

              {modalTab === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <FL>Ημερολόγιο Σημειώσεων</FL>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Κάθε σημείωση αποθηκεύεται με timestamp — ιδανικό για ιστορικό συνεργασίας.</p>
                    <NotesLog log={form.extra.notes_log || []} onChange={v => setExtra('notes_log', v)} />
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                    <FL>Ελεύθερες Σημειώσεις</FL>
                    <Txt value={form.freeNotes} onChange={v => setForm(f => ({ ...f, freeNotes: v }))} placeholder="Ελεύθερες σημειώσεις — ιστορικό, τιμές, συμφωνίες..." rows={6} />
                  </div>
                </div>
              )}

              {modalTab === 'files' && (
                <div>
                  <FL>Αρχεία Επαφής</FL>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Συμβόλαια, τιμολόγια, άδειες — όλα συνδεδεμένα με αυτήν την επαφή.</p>
                  <FileUploader files={form.extra.files || []} onChange={v => setExtra('files', v)} contactId={editContact?.id} />
                </div>
              )}

              {error && <div style={{ marginTop: 12, background: 'var(--negative)20', border: '1px solid var(--negative)', borderRadius: 4, padding: '10px 14px', color: 'var(--negative)', fontSize: 13 }}>{error}</div>}
            </div>

            <div style={{ padding: '16px 28px 24px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
              <button type="button" onClick={closeModal} style={{ flex: 1, padding: '11px 0', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: 4, border: 'none', background: saving ? '#6b5c2a' : 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Αποθήκευση...' : editContact ? 'Αποθήκευση Αλλαγών' : 'Προσθήκη Επαφής'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 28, padding: 32, width: '100%', maxWidth: 380, border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}></div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18 }}>Διαγραφή Επαφής;</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 24px' }}>Αυτή η ενέργεια δεν αναιρείται.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={() => handleDelete(deleteId!)} style={{ flex: 1, padding: '10px 0', borderRadius: 4, border: 'none', background: 'var(--negative)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Διαγραφή</button>
            </div>
          </div>
        </div>
      )}

      {quickExpense && <QuickExpenseModal contact={quickExpense!} propertyId={propertyId} userId={userId} onClose={() => setQuickExpense(null)} onSaved={() => showToast('Δαπάνη αποθηκεύτηκε')} />}
      {quickCalendar && <QuickCalendarModal contact={quickCalendar!} propertyId={propertyId} userId={userId} onClose={() => setQuickCalendar(null)} onSaved={() => showToast('Ραντεβού προστέθηκε')} />}
      {historyContact && <HistoryModal contact={historyContact!} propertyId={propertyId} onClose={() => setHistoryContact(null)} />}
      {qrContact && <QRCodeModal contact={qrContact!} onClose={() => setQrContact(null)} />}
    </div>
  )
}