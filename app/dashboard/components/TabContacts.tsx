'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { Phone, Mail, X, Search, Globe, MapPin, Clock, FileText, Star, QrCode, Printer, History, Receipt, CalendarPlus, Users, Building2, Scale, Wrench, Trees, UserCheck, Zap, Wifi, Landmark, Shield, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { DatePicker } from './UIComponents'
import { T, PageTitle, KPIGrid, SecHdr, InfoBanner, Btn, EmptyState, fn, Spinner, ExportButton, type KPIItem } from '@/components/Theme'
import { downloadCsv } from './exportCsv'
import { reportAccent, brandRootVars, brandLogoImg, brandName, useReportBranding, type ReportBranding } from '@/lib/reportBranding'

const supabase = createSupabaseClient()

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContactExtra {
  phone2?: string; whatsapp?: boolean; viber?: boolean; website?: string
  office_address?: string; afm?: string; license_number?: string
  iban?: string; iban2?: string; iris?: boolean
  schedule?: string; rating?: number; preferred?: boolean
  last_contact?: string; next_appointment?: string; specialty?: string
  tags?: string[]; avatar_url?: string
  notes_log?: { id: string; text: string; ts: string }[]
  reminder_days?: number; reminder_set?: string
  status?: 'active' | 'pending' | 'inactive' | 'problematic'
  files?: { name: string; url: string; size: string; uploaded: string }[]
  // Πεδίο εμβέλειας (μόνο για επαγγελματικό προφίλ). Αποθηκεύεται εντός του JSON `notes`
  // αφού δεν υπάρχει διαθέσιμη ειδική στήλη — βλ. σημείωση στην αναφορά.
  scope?: 'property' | 'portfolio'; scope_property_id?: string
}
interface Contact {
  id: string; property_id: string; user_id: string; role: string; full_name: string
  phone: string | null; email: string | null; notes: string | null; created_at?: string
  _extra?: ContactExtra; _freeNotes?: string
}
interface TabContactsProps {
  propertyId: string; userId: string; embedded?: boolean
  profileType?: 'individual' | 'professional'
  properties?: { id: string; name: string }[]
}
type SortMode = 'recent' | 'alpha' | 'rating'
type ViewMode = 'cards' | 'compact'

// ─── Design System ────────────────────────────────────────────────────────────
const iStyle: React.CSSProperties = {
  width: '100%', height: 42, padding: '10px 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, letterSpacing: 0, outline: 'none',
  fontFamily: T.font.sans, boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
}

// ─── ROLE GROUPS, Πλήρης Ελληνική Λίστα ─────────────────────────────────────
const GROUPS = [
  {
    id: 'authorities', label: 'Δημόσιες Αρχές', color: '#1a73e8', Icon: Building2,
    roles: [
      { value: 'doy', label: 'ΔΟΥ' },
      { value: 'ktimatologio', label: 'Κτηματολόγιο' },
      { value: 'dimos', label: 'Δήμος / Πολεοδομία' },
      { value: 'efka', label: 'ΕΦΚΑ' },
      { value: 'fire_dept', label: 'Πυροσβεστική' },
      { value: 'notary', label: 'Συμβολαιογράφος' },
      { value: 'lawyer', label: 'Δικηγόρος' },
      { value: 'accountant', label: 'Λογιστής' },
    ],
  },
  {
    id: 'electricity', label: 'Πάροχοι Ρεύματος', color: '#1a73e8', Icon: Zap,
    roles: [
      { value: 'elec_dei', label: 'ΔΕΗ' },
      { value: 'elec_heron', label: 'Heron Energy' },
      { value: 'elec_protergia', label: 'Protergia' },
      { value: 'elec_nrg', label: 'NRG' },
      { value: 'elec_zenith', label: 'Zenith Energy' },
      { value: 'elec_fysiko', label: 'Φυσικό Αέριο Ελλάδος' },
      { value: 'elec_enerwave', label: 'Enerwave' },
      { value: 'elec_spp', label: 'SPP (Smart Power Plan)' },
      { value: 'elec_watt_volt', label: 'Watt+Volt' },
      { value: 'elec_engie', label: 'ENGIE' },
      { value: 'elec_mytilineos', label: 'Mytilineos Energy' },
      { value: 'elec_green', label: 'Green Energy' },
      { value: 'elec_eydap', label: 'ΕΥΔΑΠ (νερό)' },
      { value: 'elec_deddie', label: 'ΔΕΔΔΗΕ' },
      { value: 'elec_other', label: 'Άλλος Πάροχος Ρεύματος' },
    ],
  },
  {
    id: 'telecom', label: 'Τηλεφωνία & Internet', color: '#1a73e8', Icon: Wifi,
    roles: [
      { value: 'tel_ote', label: 'OTE / Cosmote' },
      { value: 'tel_vodafone', label: 'Vodafone' },
      { value: 'tel_wind', label: 'Wind / Nova' },
      { value: 'tel_nova', label: 'Nova Broadband' },
      { value: 'tel_inalan', label: 'Inalan' },
      { value: 'tel_forthnet', label: 'Forthnet' },
      { value: 'tel_cyta', label: 'Cyta Hellas' },
      { value: 'tel_hol', label: 'HOL (Hellas OnLine)' },
      { value: 'tel_panafonet', label: 'Panafonet' },
      { value: 'tel_alterego', label: 'AlterEgo Networks' },
      { value: 'tel_speednet', label: 'SpeedNet' },
      { value: 'tel_on', label: 'On Telecoms' },
      { value: 'tel_other', label: 'Άλλος Πάροχος Internet / Τηλεφωνίας' },
    ],
  },
  {
    id: 'banks', label: 'Τράπεζες & Χρηματοδότηση', color: '#1a73e8', Icon: Landmark,
    roles: [
      { value: 'bank_alpha', label: 'Alpha Bank' },
      { value: 'bank_eurobank', label: 'Eurobank' },
      { value: 'bank_piraeus', label: 'Τράπεζα Πειραιώς' },
      { value: 'bank_nbg', label: 'Εθνική Τράπεζα (ΕΤΕ)' },
      { value: 'bank_attica', label: 'Attica Bank' },
      { value: 'bank_optima', label: 'Optima Bank' },
      { value: 'bank_credia', label: 'Credia (Παγκρήτια)' },
      { value: 'bank_pancreta', label: 'Τράπεζα Κρήτης' },
      { value: 'bank_aegean', label: 'Aegean Baltic Bank' },
      { value: 'bank_hsbc', label: 'HSBC Ελλάδα' },
      { value: 'bank_ing', label: 'ING Ελλάδα' },
      { value: 'bank_bnp', label: 'BNP Paribas' },
      { value: 'bank_astrobank', label: 'Astrobank' },
      { value: 'bank_vivaltia', label: 'Vivaltia Finance' },
      { value: 'bank_other', label: 'Άλλη Τράπεζα / Χρηματοδότης' },
    ],
  },
  {
    id: 'insurance', label: 'Ασφαλιστικές Εταιρείες', color: '#1a73e8', Icon: Shield,
    roles: [
      { value: 'ins_interamerican', label: 'Interamerican' },
      { value: 'ins_allianz', label: 'Allianz Ελλάδα' },
      { value: 'ins_eurolife', label: 'Eurolife FFH' },
      { value: 'ins_ergo', label: 'ERGO Ασφαλιστική' },
      { value: 'ins_axa', label: 'AXA Ελλάδα' },
      { value: 'ins_groupama', label: 'Groupama Φοίνιξ' },
      { value: 'ins_ethiniki', label: 'Εθνική Ασφαλιστική' },
      { value: 'ins_generali', label: 'Generali Ελλάδα' },
      { value: 'ins_alpha', label: 'Alpha Insurance' },
      { value: 'ins_aig', label: 'AIG Ελλάδα' },
      { value: 'ins_hdi', label: 'HDI Global' },
      { value: 'ins_metlife', label: 'MetLife' },
      { value: 'ins_mnlife', label: 'ΜΝ Life' },
      { value: 'ins_ika', label: 'ΙΚΑ / ΕΦΚΑ (κρατική)' },
      { value: 'ins_agent', label: 'Ασφαλιστικός Σύμβουλος' },
      { value: 'ins_other', label: 'Άλλη Ασφαλιστική Εταιρεία' },
    ],
  },
  {
    id: 'real_estate', label: 'Μεσιτεία & Αξιολόγηση', color: '#1a73e8', Icon: Building2,
    roles: [
      { value: 'agent', label: 'Μεσίτης Ακινήτων' },
      { value: 'appraiser', label: 'Εκτιμητής Ακινήτων' },
      { value: 'prop_mgmt', label: 'Εταιρεία Διαχείρισης' },
      { value: 'manager', label: 'Διαχειριστής Πολυκατοικίας' },
      { value: 'concierge', label: 'Θυρωρός / Concierge' },
    ],
  },
  {
    id: 'technical', label: 'Τεχνικοί & Μάστορες', color: '#1a73e8', Icon: Wrench,
    roles: [
      { value: 'plumber', label: 'Υδραυλικός' },
      { value: 'electrician', label: 'Ηλεκτρολόγος' },
      { value: 'hvac', label: 'Ψυκτικός / Κλιματισμός' },
      { value: 'carpenter', label: 'Μαραγκός / Ξυλουργός' },
      { value: 'painter', label: 'Ελαιοχρωματιστής' },
      { value: 'tiles', label: 'Πλακάδες / Μαρμαράς' },
      { value: 'aluminum', label: 'Αλουμινάς / Κουφώματα' },
      { value: 'locksmith', label: 'Κλειδαράς' },
      { value: 'welder', label: 'Σιδεράς / Συγκολλητής' },
      { value: 'elevator', label: 'Ανελκυστήρας' },
      { value: 'solar', label: 'Ηλιακά / Φωτοβολταϊκά' },
      { value: 'insulation', label: 'Μονώσεις' },
      { value: 'roofing', label: 'Στέγη / Επιστεγάσεις' },
      { value: 'alarm', label: 'Συναγερμός / CCTV' },
      { value: 'network', label: 'Δίκτυα / Τηλεφωνία' },
      { value: 'general_tech', label: 'Γενικός Τεχνίτης' },
    ],
  },
  {
    id: 'outdoor', label: 'Εξωτερικοί Χώροι & Υπηρεσίες', color: '#1a73e8', Icon: Trees,
    roles: [
      { value: 'gardener', label: 'Κηπουρός' },
      { value: 'pool', label: 'Συντηρητής Πισίνας' },
      { value: 'pest', label: 'Απεντόμωση / Μυοκτονία' },
      { value: 'cleaning', label: 'Καθαρισμός' },
      { value: 'cleaning_ext', label: 'Καθαρισμός Εξωτερικών Χώρων' },
      { value: 'security', label: 'Ασφάλεια / Φύλαξη' },
    ],
  },
  {
    id: 'tenants', label: 'Ενοικιαστές & Γείτονες', color: '#1a73e8', Icon: UserCheck,
    roles: [
      { value: 'tenant', label: 'Ενοικιαστής' },
      { value: 'prev_tenant', label: 'Πρώην Ενοικιαστής' },
      { value: 'neighbor', label: 'Γείτονας' },
      { value: 'other', label: 'Άλλο' },
    ],
  },
]

const ALL_ROLES = GROUPS.flatMap(g => g.roles.map(r => ({ ...r, groupId: g.id, groupColor: g.color, groupLabel: g.label, GroupIcon: g.Icon })))
const ROLE_META: Record<string, typeof ALL_ROLES[0]> = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]))
const ROLE_SELECT_OPTIONS = GROUPS.flatMap(g => [
  { value: `__group_${g.id}`, label: `── ${g.label} ──`, disabled: true },
  ...g.roles.map(r => ({ value: r.value, label: r.label, disabled: false })),
])

const PRESET_TAGS = ['Αξιόπιστος', 'VIP', 'Ακριβός', 'Γρήγορος', 'Προτεινόμενος', 'Προσοχή', 'Εκκρεμεί πληρωμή', 'Συνεργάτης', 'Επείγον', 'Σταθερός']
const REMINDER_LABELS: Record<number, string> = { 0: 'Καμία', 7: '7 ημέρες', 14: '14 ημέρες', 30: '30 ημέρες', 60: '60 ημέρες', 90: '90 ημέρες' }
const STATUS_OPTIONS = [
  { value: 'active',      label: 'Ενεργός',       color: 'var(--positive)', bg: 'rgba(52,199,89,0.12)',  dot: 'var(--positive)' },
  { value: 'pending',     label: 'Σε αναμονή',    color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)', dot: 'var(--warning)' },
  { value: 'inactive',    label: 'Ανενεργός',     color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', dot: 'var(--text-tertiary)' },
  { value: 'problematic', label: 'Προβληματικός', color: 'var(--negative)', bg: 'rgba(255,59,48,0.12)',  dot: 'var(--negative)' },
]

// ─── Serialize / Parse ────────────────────────────────────────────────────────
function parseContact(c: Contact): Contact {
  let extra: ContactExtra = {}; let freeNotes = c.notes || ''
  try { const p = JSON.parse(c.notes || '{}'); if (p?.__v === 2) { extra = p.extra || {}; freeNotes = p.notes || '' } } catch { /* noop */ }
  return { ...c, _extra: extra, _freeNotes: freeNotes }
}
function serializeNotes(extra: ContactExtra, freeNotes: string): string {
  return JSON.stringify({ __v: 2, extra, notes: freeNotes })
}
const EMPTY_EXTRA: ContactExtra = {
  phone2: '', whatsapp: false, viber: false, website: '', office_address: '',
  afm: '', license_number: '', iban: '', iban2: '', iris: false, schedule: '',
  rating: 0, preferred: false, last_contact: '', next_appointment: '',
  specialty: '', tags: [], avatar_url: '', notes_log: [],
  reminder_days: 0, reminder_set: '', status: 'active', files: [],
  scope: 'property', scope_property_id: '',
}
const EMPTY_FORM = { full_name: '', role: 'other', phone: '', email: '', freeNotes: '', extra: { ...EMPTY_EXTRA } }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function daysUntil(d: string) { if (!d) return null; return Math.round((new Date(d).getTime() - Date.now()) / 86400000) }
function isOverdue(d: string) { const n = daysUntil(d); return n !== null && n < 0 }
// HTML-escape any dynamic value interpolated into printable/PDF HTML written via document.write.
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// ─── Input primitives ─────────────────────────────────────────────────────────
function Inp({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
}
function Txt({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...iStyle, height: 'auto', resize: 'vertical', lineHeight: 1.6 }} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
}
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{children}</label>
}
// Επικεφαλίδα ενότητας φόρμας — διακριτική, premium, με λεπτή γραμμή.
function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 2px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  )
}
function Tog({ value, onChange, colorOn = 'var(--accent)' }: { value: boolean; onChange: (v: boolean) => void; colorOn?: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: value ? colorOn : 'var(--border-default)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.35)', transition: 'left 0.18s' }} />
    </button>
  )
}
function StarRating({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={onChange ? 22 : 13}
          fill={n <= (hover || value) ? 'var(--accent)' : 'none'}
          color={n <= (hover || value) ? 'var(--accent)' : 'var(--border-default)'}
          onClick={() => onChange && onChange(n === value ? 0 : n)}
          onMouseEnter={() => onChange && setHover(n)} onMouseLeave={() => onChange && setHover(0)}
          style={{ cursor: onChange ? 'pointer' : 'default', flexShrink: 0 }} />
      ))}
    </div>
  )
}
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: T.radius.pill, background: s.bg, fontSize: 11, fontWeight: 600, color: s.color, fontFamily: T.font.sans }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />{s.label}
    </span>
  )
}

// ─── Quick action button (calm, uniform, hover-revealed) ──────────────────────
function QuickAct({ as, href, target, rel, onClick, title, label, children }: {
  as: 'a' | 'button'; href?: string; target?: string; rel?: string; onClick?: () => void
  title: string; label?: string; children?: React.ReactNode
}) {
  const base: React.CSSProperties = {
    width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    textDecoration: 'none', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, fontWeight: 800, flexShrink: 0,
    transition: 'border-color 0.15s, color 0.15s, background 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.14)',
  }
  const enter = (e: React.MouseEvent<HTMLElement>) => { const s = e.currentTarget.style; s.borderColor = 'var(--accent-border)'; s.color = 'var(--accent)'; s.background = 'var(--accent-soft)' }
  const leave = (e: React.MouseEvent<HTMLElement>) => { const s = e.currentTarget.style; s.borderColor = 'var(--border-subtle)'; s.color = 'var(--text-secondary)'; s.background = 'var(--bg-elevated)' }
  const content = children ?? label
  if (as === 'a') return <a href={href} target={target} rel={rel} title={title} aria-label={title} style={base} onMouseEnter={enter} onMouseLeave={leave}>{content}</a>
  return <button type="button" onClick={onClick} title={title} aria-label={title} style={base} onMouseEnter={enter} onMouseLeave={leave}>{content}</button>
}

// ─── Tag Editor ───────────────────────────────────────────────────────────────
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = (t: string) => { const v = t.trim(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput('') }
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {tags.map(t => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: T.radius.pill, background: 'rgba(26,115,232,0.12)', border: '1px solid rgba(26,115,232,0.3)', fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
              {t}<button type="button" onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', padding: 0 }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {PRESET_TAGS.filter(t => !tags.includes(t)).map(t => (
          <button key={t} type="button" onClick={() => add(t)}
            style={{ padding: '4px 11px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
            + {t}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add(input))} placeholder="Νέα ετικέτα..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={() => add(input)} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: '1px solid var(--accent)', background: 'rgba(26,115,232,0.1)', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

// ─── Notes Log ────────────────────────────────────────────────────────────────
function NotesLog({ log, onChange }: { log: { id: string; text: string; ts: string }[]; onChange: (l: { id: string; text: string; ts: string }[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => { if (!input.trim()) return; onChange([{ id: Date.now().toString(), text: input.trim(), ts: new Date().toISOString() }, ...log]); setInput('') }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Νέα σημείωση..." style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={add} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
        {log.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Δεν υπάρχουν σημειώσεις ακόμα</div>}
        {log.map(e => (
          <div key={e.id} style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)', position: 'relative' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4, fontFamily: T.font.mono }}>{new Date(e.ts).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, paddingRight: 24 }}>{e.text}</div>
            <button type="button" onClick={() => onChange(log.filter(x => x.id !== e.id))} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Avatar Upload ────────────────────────────────────────────────────────────
function AvatarUpload({ avatarUrl, initials, color, onChange }: { avatarUrl: string; initials: string; color: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true)
    const path = `contacts/${Date.now()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error && data) { const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path); onChange(pub.publicUrl) }
    setUploading(false)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '2px solid ' + color + '60' }} />
          : <div style={{ width: 68, height: 68, borderRadius: '50%', background: color + '20', border: '2px solid ' + color + '50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color, fontFamily: T.font.sans }}>{initials || '?'}</div>}
        <button type="button" onClick={() => fileRef.current?.click()} style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-elevated)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700 }}>
          {uploading ? '…' : '+'}
        </button>
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Φωτογραφία Επαφής</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>JPG, PNG έως 5MB</div>
        {avatarUrl && <button type="button" onClick={() => onChange('')} style={{ fontSize: 12, color: 'var(--negative)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Αφαίρεση φωτογραφίας</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

// ─── File Uploader ────────────────────────────────────────────────────────────
function FileUploader({ files, onChange, contactId }: { files: { name: string; url: string; size: string; uploaded: string }[]; onChange: (f: { name: string; url: string; size: string; uploaded: string }[]) => void; contactId?: string }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true)
    const path = `contact-files/${contactId || 'new'}/${Date.now()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      onChange([...files, { name: file.name, url: pub.publicUrl, size: file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`, uploaded: new Date().toISOString() }])
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = ''
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {files.length === 0 && <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-secondary)', fontSize: 13 }}><FileText size={30} style={{ opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />Δεν υπάρχουν αρχεία ακόμα</div>}
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <FileText size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{f.size} · {new Date(f.uploaded).toLocaleDateString('el-GR')}</div>
            </div>
            <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', padding: '4px 10px', borderRadius: T.radius.badge, border: '1px solid rgba(26,115,232,0.3)', background: 'rgba(26,115,232,0.08)', whiteSpace: 'nowrap' }}>Άνοιγμα</a>
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}><X size={15} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: T.radius.inner, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, width: '100%' }}>
        {uploading ? 'Ανέβασμα...' : '+ Προσθήκη Αρχείου (PDF, DOC, JPG, Excel)'}
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────
function QRCodeModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${contact.full_name}`, contact.phone ? `TEL:${contact.phone}` : '', contact.email ? `EMAIL:${contact.email}` : '', contact._extra?.website ? `URL:${contact._extra.website}` : '', 'END:VCARD'].filter(Boolean).join('\n')
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(vcard)}&bgcolor=0e0e1c&color=d4af42&qzone=2`
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 36, width: '100%', maxWidth: 320, border: '1px solid var(--border-subtle)', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <QrCode size={28} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontFamily: T.font.sans, fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>QR Επαφής</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 22 }}>Σκάναρε για να αποθηκεύσεις τα στοιχεία</p>
        <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', display: 'inline-block', marginBottom: 16 }}>
          <img src={qrUrl} alt="QR" style={{ width: 180, height: 180, borderRadius: 8, display: 'block' }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{contact.full_name}</div>
        {contact.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone}</div>}
        <button type="button" onClick={onClose} style={{ marginTop: 20, padding: '10px 28px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, width: '100%' }}>Κλείσιμο</button>
      </div>
    </div>
  )
}

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ contact, propertyId, onClose }: { contact: Contact; propertyId: string; onClose: () => void }) {
  const [expenses, setExpenses] = useState<{ id: string; description: string; amount: number; date: string }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('expenses').select('id,description,amount,date').eq('property_id', propertyId).ilike('description', `%${contact.full_name}%`).order('date', { ascending: false }).limit(10)
      setExpenses(data || []); setLoading(false)
    }
    load()
  }, [contact.id, propertyId, contact.full_name])
  const notesLog = contact._extra?.notes_log || []
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const timeline = [
    ...expenses.map(e => ({ date: e.date, title: e.description, sub: e.amount?.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' }), color: 'var(--negative)' })),
    ...notesLog.map(n => ({ date: n.ts.split('T')[0], title: n.text, sub: 'Σημείωση', color: 'var(--accent)' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, width: '100%', maxWidth: 540, maxHeight: '85vh', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '22px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ fontFamily: T.font.sans, fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Ιστορικό Συνεργασίας</h3><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '3px 0 0' }}>{contact.full_name}</p></div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
          {loading ? <Spinner label="Φόρτωση…" /> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 24 }}>
                {[{ label: 'Συνολικές Δαπάνες', value: totalExpenses > 0 ? totalExpenses.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' }) : '—', color: 'var(--negative)' }, { label: 'Σημειώσεις', value: notesLog.length > 0 ? `${notesLog.length}` : '—', color: 'var(--accent)' }].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '14px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {timeline.length === 0 ? <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Δεν υπάρχει ιστορικό ακόμα</div> : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {timeline.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: item.color + '20', border: '1px solid ' + item.color + '40', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} /></div>
                        <div style={{ flex: 1, background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '9px 13px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
                          <div style={{ display: 'flex', gap: 10 }}><span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{fmtDate(item.date)}</span><span style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>{item.sub}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Print Card ───────────────────────────────────────────────────────────────
function printContactCard(contact: Contact, branding?: ReportBranding | null) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: '#888', groupLabel: '' }
  const extra = contact._extra || {}
  const status = STATUS_OPTIONS.find(s => s.value === (extra.status || 'active')) || STATUS_OPTIONS[0]
  const html = `<html><head><title>${esc(contact.full_name)}</title><style>body{font-family:Inter,sans-serif;padding:40px;max-width:420px;margin:0 auto;color:#111}h1{font-size:22px;margin:0 0 2px}p{margin:3px 0;font-size:13px;color:#555}.cat{font-size:11px;color:${meta.groupColor};font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}.role{font-size:13px;color:#444;margin-bottom:6px}.status{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-bottom:14px}.row{display:flex;gap:6px;align-items:flex-start;margin:5px 0;font-size:13px;color:#333}.label{min-width:80px;color:#888;font-size:11px;text-transform:uppercase;padding-top:1px}.tag{padding:2px 8px;border-radius:20px;background:#f3f4f6;font-size:11px}hr{border:none;border-top:1px solid #eee;margin:14px 0}.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px}</style></head><body>
    <div class="cat">${esc(meta.groupLabel)}</div>
    <h1>${esc(contact.full_name)}</h1>
    <div class="role">${esc(meta.label)}</div>
    <div class="status" style="background:${status.bg};color:${status.color}">${esc(status.label)}</div><hr>
    ${contact.phone ? `<div class="row"><span class="label">Τηλέφωνο</span><span>${esc(contact.phone)}${extra.whatsapp ? '<span class="badge" style="background:#dcfce7;color:#166534">WA</span>' : ''}${extra.viber ? '<span class="badge" style="background:#ede9fe;color:#5b21b6">VB</span>' : ''}</span></div>` : ''}
    ${extra.phone2 ? `<div class="row"><span class="label">2ο Τηλέφωνο</span><span>${esc(extra.phone2)}</span></div>` : ''}
    ${contact.email ? `<div class="row"><span class="label">Email</span><span>${esc(contact.email)}</span></div>` : ''}
    ${extra.website ? `<div class="row"><span class="label">Ιστοσελίδα</span><span>${esc(extra.website)}</span></div>` : ''}
    ${extra.office_address ? `<div class="row"><span class="label">Διεύθυνση</span><span>${esc(extra.office_address)}</span></div>` : ''}
    ${extra.afm ? `<div class="row"><span class="label">ΑΦΜ</span><span>${esc(extra.afm)}</span></div>` : ''}
    ${extra.iban ? `<div class="row"><span class="label">IBAN</span><span style="font-family:monospace">${esc(extra.iban)}${extra.iris ? '<span class="badge" style="background:#fef3c7;color:#92400e">IRIS</span>' : ''}</span></div>` : ''}
    ${extra.iban2 ? `<div class="row"><span class="label">IBAN 2</span><span style="font-family:monospace">${esc(extra.iban2)}</span></div>` : ''}
    ${extra.schedule ? `<div class="row"><span class="label">Ωράριο</span><span>${esc(extra.schedule)}</span></div>` : ''}
    ${(extra.tags || []).length > 0 ? `<div style="margin-top:12px">${(extra.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>` : ''}
    ${contact._freeNotes ? `<hr><p style="line-height:1.6">${esc(contact._freeNotes)}</p>` : ''}
    <hr><p style="font-size:10px;color:#bbb">${branding?.companyName ? brandName(branding)+' · ' : 'Property OS · '}${esc(new Date().toLocaleDateString('el-GR'))}</p></body></html>`
  const win = window.open('', '_blank'); if (win) { win.document.write(html); win.document.close(); win.print() }
}

// ─── Quick Modals ─────────────────────────────────────────────────────────────
function QuickExpenseModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState(contact.full_name); const [saving, setSaving] = useState(false)
  const save = async () => { if (!amount) return; setSaving(true); await supabase.from('expenses').insert({ property_id: propertyId, user_id: userId, amount: parseFloat(amount), description, date: new Date().toISOString().split('T')[0], category: 'Αμοιβές Συνεργατών' }); setSaving(false); onSaved(); onClose() }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 440, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,59,48,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Receipt size={18} color="var(--negative)" /></div>
          <div><h3 style={{ fontFamily: T.font.sans, fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Νέα Δαπάνη</h3><p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{contact.full_name}</p></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Ποσό (€)</FL><Inp value={amount} onChange={setAmount} placeholder="Παράδειγμα: 150" type="number" /></div>
          <div><FL>Περιγραφή</FL><Inp value={description} onChange={setDescription} placeholder="Περιγραφή εργασίας" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving || !amount} style={{ flex: 2, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Αποθήκευση...' : 'Αποθήκευση Δαπάνης'}</button>
        </div>
      </div>
    </div>
  )
}
function QuickCalendarModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const [title, setTitle] = useState('Ραντεβού με ' + contact.full_name); const [date, setDate] = useState(tomorrow.toISOString().split('T')[0]); const [saving, setSaving] = useState(false)
  const save = async () => { if (!title || !date) return; setSaving(true); await supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title, event_date: date, category: 'tenant', priority: 'medium', status: 'pending', recurring: false, source: 'manual' }); setSaving(false); onSaved(); onClose() }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 440, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(26,115,232,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalendarPlus size={18} color="var(--accent)" /></div>
          <div><h3 style={{ fontFamily: T.font.sans, fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Νέο Ραντεβού</h3><p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{contact.full_name}</p></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Τίτλος</FL><Inp value={title} onChange={setTitle} placeholder="Τίτλος ραντεβού" /></div>
          <div><FL>Ημερομηνία</FL><DatePicker value={date} onChange={v => setDate(v)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Αποθήκευση...' : 'Προσθήκη στο Ημερολόγιο'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Excel Export (SheetJS, same pattern as TabExpenses) ─────────────────────
async function exportContactsExcel(contacts: Contact[]) {
  const XLSX = await import('xlsx')
  const today = new Date().toLocaleDateString('el-GR')
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Σύνοψη ──────────────────────────────────────────────────────
  const byGroup: Record<string, number> = {}
  contacts.forEach(c => {
    const g = ROLE_META[c.role]?.groupId || 'tenants'
    byGroup[g] = (byGroup[g] || 0) + 1
  })
  const preferred = contacts.filter(c => c._extra?.preferred).length
  const withWhatsApp = contacts.filter(c => c._extra?.whatsapp).length
  const withViber = contacts.filter(c => c._extra?.viber).length
  const withIBAN = contacts.filter(c => c._extra?.iban).length
  const withIRIS = contacts.filter(c => c._extra?.iris).length
  const avgRating = contacts.filter(c => (c._extra?.rating || 0) > 0).reduce((s, c) => s + (c._extra?.rating || 0), 0) / (contacts.filter(c => (c._extra?.rating || 0) > 0).length || 1)

  const summaryData: (string | number)[][] = [
    ['Property OS, Κατάσταση Επαφών', ''],
    ['Ημερομηνία εξαγωγής:', today],
    ['Σύνολο εγγραφών:', contacts.length],
    [''],
    ['ΓΕΝΙΚΗ ΣΤΑΤΙΣΤΙΚΗ', ''],
    ['Σύνολο Επαφών', contacts.length],
    ['Προτιμώμενες Επαφές', preferred],
    ['Με WhatsApp', withWhatsApp],
    ['Με Viber', withViber],
    ['Με IBAN', withIBAN],
    ['Με IRIS', withIRIS],
    ['Μέση Αξιολόγηση', Math.round(avgRating * 10) / 10],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΗΓΟΡΙΑ', '', ''],
    ['Κατηγορία', 'Αριθμός Επαφών', 'Ποσοστό %'],
    ...GROUPS.filter(g => byGroup[g.id]).map(g => [
      g.label,
      byGroup[g.id] || 0,
      Math.round(((byGroup[g.id] || 0) / contacts.length) * 1000) / 10,
    ]),
    ['ΣΥΝΟΛΟ', contacts.length, 100],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΑΣΤΑΣΗ', '', ''],
    ['Κατάσταση', 'Αριθμός'],
    ...STATUS_OPTIONS.map(s => [
      s.label,
      contacts.filter(c => (c._extra?.status || 'active') === s.value).length,
    ]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 36 }, { wch: 18 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη')

  // ── Sheet 2: Αναλυτικές Επαφές ─────────────────────────────────────────
  const headers = [
    'Ονοματεπώνυμο', 'Κατηγορία', 'Ρόλος', 'Κατάσταση', 'Αξιολόγηση',
    'Κύριο Τηλέφωνο', 'WhatsApp', 'Viber', 'Δεύτερο Τηλέφωνο', 'Email',
    'Ιστοσελίδα', 'Διεύθυνση Γραφείου', 'Ωράριο Εργασίας',
    'ΑΦΜ', 'Αρ. Μητρώου/Άδειας', 'IBAN', 'IBAN 2', 'IRIS',
    'Τελευταία Επαφή', 'Επόμενο Ραντεβού', 'Υπενθύμιση (ημέρες)',
    'Ετικέτες', 'Αρχεία', 'Ελεύθερες Σημειώσεις', 'Σημειώσεις (log)',
  ]
  const detailRows: (string | number)[][] = [headers]

  GROUPS.forEach(g => {
    const grpContacts = contacts.filter(c => ROLE_META[c.role]?.groupId === g.id)
    if (grpContacts.length === 0) return
    detailRows.push([g.label, `${grpContacts.length} επαφές`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
    grpContacts.sort((a, b) => a.full_name.localeCompare(b.full_name, 'el')).forEach(c => {
      const ex = c._extra || {}
      const status = STATUS_OPTIONS.find(s => s.value === (ex.status || 'active'))?.label || ''
      detailRows.push([
        c.full_name,
        ROLE_META[c.role]?.groupLabel || '',
        ROLE_META[c.role]?.label || c.role,
        status,
        ex.rating || '',
        c.phone || '',
        ex.whatsapp ? 'ΝΑΙ' : 'ΟΧΙ',
        ex.viber ? 'ΝΑΙ' : 'ΟΧΙ',
        ex.phone2 || '',
        c.email || '',
        ex.website || '',
        ex.office_address || '',
        ex.schedule || '',
        ex.afm || '',
        ex.license_number || '',
        ex.iban || '',
        ex.iban2 || '',
        ex.iris ? 'ΝΑΙ' : 'ΟΧΙ',
        ex.last_contact ? new Date(ex.last_contact + 'T00:00:00').toLocaleDateString('el-GR') : '',
        ex.next_appointment ? new Date(ex.next_appointment + 'T00:00:00').toLocaleDateString('el-GR') : '',
        ex.reminder_days || '',
        (ex.tags || []).join('; '),
        (ex.files || []).length,
        c._freeNotes || '',
        (ex.notes_log || []).map((n: {ts: string; text: string}) => `[${new Date(n.ts).toLocaleDateString('el-GR')}] ${n.text}`).join(' | '),
      ])
    })
    detailRows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
  })

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2['!cols'] = [
    { wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 22 }, { wch: 22 },
    { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 28 }, { wch: 9 },
    { wch: 14 }, { wch: 16 }, { wch: 12 },
    { wch: 26 }, { wch: 8 }, { wch: 32 }, { wch: 48 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Αναλυτικές Επαφές')

  // ── Sheet 3: Κατάλογος Επαφών (ταχεία αναφορά) ─────────────────────────
  const dirHeaders = ['Ονοματεπώνυμο', 'Ρόλος', 'Τηλέφωνο', 'Email', 'Κατάσταση', 'Αξιολόγηση', 'WhatsApp', 'IRIS']
  const dirRows: (string | number)[][] = [dirHeaders]
  contacts
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'el'))
    .forEach(c => {
      const ex = c._extra || {}
      dirRows.push([
        c.full_name,
        ROLE_META[c.role]?.label || c.role,
        c.phone || '—',
        c.email || '—',
        STATUS_OPTIONS.find(s => s.value === (ex.status || 'active'))?.label || '',
        (ex.rating ? ex.rating + '/5' : '—'),
        ex.whatsapp ? 'WA' : '',
        ex.iris ? 'IRIS' : '',
      ])
    })
  const ws3 = XLSX.utils.aoa_to_sheet(dirRows)
  ws3['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 6 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Κατάλογος')

  XLSX.writeFile(wb, `επαφες_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportContactsPDF(contacts: Contact[], branding?: ReportBranding | null) {
  const accent = reportAccent(branding)
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })
  const preferred = contacts.filter(c => c._extra?.preferred)
  const byGroup: Record<string, Contact[]> = {}
  contacts.forEach(c => {
    const g = ROLE_META[c.role]?.groupId || 'tenants'
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(c)
  })

  const groupColors: Record<string, string> = {
    authorities: '#3949ab', legal_finance: '#7e57c2', management: '#039be5',
    electricity: '#e8710a', telecom: '#039be5', banks: '#7e57c2',
    insurance: '#00897b', real_estate: '#5e35b1',
    technical: '#e8710a', outdoor: '#34a853', tenants: '#4285f4',
  }

  const kpiHtml = (val: string, label: string, color: string) =>
    `<div class="kpi"><div class="kpi-v" style="color:${color}">${esc(val)}</div><div class="kpi-l">${esc(label)}</div></div>`

  const groupSections = GROUPS.filter(g => byGroup[g.id]?.length).map(g => {
    const grpColor = groupColors[g.id] || '#888'
    const rows = byGroup[g.id].map(c => {
      const ex = c._extra || {}
      const statusMeta = STATUS_OPTIONS.find(s => s.value === (ex.status || 'active')) || STATUS_OPTIONS[0]
      return `
        <tr>
          <td>
            <div style="font-weight:500;color:#1a1a2e">${esc(c.full_name)}</div>
            <div style="font-size:9px;color:#9aa0a6">${esc(ROLE_META[c.role]?.label || c.role)}</div>
          </td>
          <td>
            ${c.phone ? `<div style="font-family:'Roboto Mono',monospace;font-size:11px">${esc(c.phone)}</div>` : '—'}
            ${ex.whatsapp ? '<span class="badge" style="background:#e6f4ea;color:#137333">WA</span>' : ''}
            ${ex.viber ? '<span class="badge" style="background:#ede9fe;color:#5b21b6">VB</span>' : ''}
          </td>
          <td style="font-size:10px">${esc(c.email || '—')}</td>
          <td>
            <span class="badge" style="background:${statusMeta.bg.replace('rgba', 'rgba').replace('0.12', '0.15')};color:${statusMeta.color}">
              ${esc(statusMeta.label)}
            </span>
          </td>
          <td style="text-align:center">${(ex.rating ? ex.rating + '/5' : '—')}</td>
          <td style="font-family:'Roboto Mono',monospace;font-size:10px">
            ${ex.iban ? `···${esc(ex.iban.slice(-4))}${ex.iris ? ' <span style="color:#b45309">IRIS</span>' : ''}` : '—'}
          </td>
        </tr>`
    }).join('')
    return `
      <div class="sec">
        <div class="g-header" style="border-left:4px solid ${grpColor}">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:10px;height:10px;border-radius:2px;background:${grpColor}"></div>
            <strong style="color:${grpColor}">${esc(g.label)}</strong>
            <span style="font-size:9px;color:#5f6368">${byGroup[g.id].length} επαφές</span>
          </div>
        </div>
        <table>
          <thead><tr>
            <th>Ονοματεπώνυμο</th><th>Τηλέφωνο</th><th>Email</th>
            <th>Κατάσταση</th><th style="text-align:center">Αξιολ.</th><th>IBAN</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }).join('')

  const w = window.open('', '_blank', 'width=1100,height=850')
  if (!w) { alert('Επίτρεψε τα popups'); return }

  w.document.write(`<!DOCTYPE html><html lang="el"><head>
<meta charset="UTF-8"><title>Κατάσταση Επαφών</title>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
${brandRootVars(branding)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#fff;color:#1a1a2e;font-size:10.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:28px 32px;max-width:940px;margin:0 auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;margin-bottom:20px;border-bottom:3px solid ${accent}}
.logo{font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:${accent}}.logo span{color:var(--accent)}
.logo-s{font-size:10px;color:#5f6368;margin-top:2px}
.meta-r{text-align:right}.meta-title{font-family:'Inter',sans-serif;font-size:15px;font-weight:500;color:#1a1a2e}
.meta-d{font-size:10px;color:#5f6368;margin-top:3px}
.sec-title{font-family:'Inter',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;color:${accent};margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e8eaed;display:flex;align-items:center;gap:5px}
.sec-title::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent);flex-shrink:0}
.sec{margin-bottom:20px}
.kpi-row{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px}
.kpi{background:#f8f9fa;border:1px solid #e8eaed;border-radius:8px;padding:10px 12px}
.kpi-v{font-family:'Roboto Mono',monospace;font-size:15px;font-weight:700;margin-bottom:3px}
.kpi-l{font-family:'Inter',sans-serif;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#5f6368}
.g-header{background:#f8f9fa;padding:9px 14px;margin-bottom:0;border-radius:6px 6px 0 0;border:1px solid #e8eaed;border-bottom:none}
table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:16px}
th{font-family:'Inter',sans-serif;font-size:8.5px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;padding:6px 8px;border-bottom:2px solid #e8eaed;text-align:left;background:#f8f9fa;border:1px solid #e8eaed}
td{padding:7px 8px;border:1px solid #f1f3f4;vertical-align:top;color:#3c4043}
tr:nth-child(even) td{background:#fafafa}
.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:8px;font-weight:500;font-family:'Inter',sans-serif;margin-left:3px}
.preferred-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.pref-card{border:1px solid #e8eaed;border-radius:8px;padding:10px 12px;background:#f8f9fa}
.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e8eaed;display:flex;justify-content:space-between;font-size:9px;color:#9aa0a6}
@media print{.page{padding:18px 22px}}
</style></head><body><div class="page">
<div class="hdr">
  <div>
    ${branding ? `${brandLogoImg(branding, 30)}<div class="logo">${brandName(branding)}</div>` : `<div class="logo">Property <span>OS</span></div>`}
    <div class="logo-s">Επαγγελματικό Εργαλείο Διαχείρισης Ακινήτων</div>
  </div>
  <div class="meta-r">
    <div class="meta-title">Κατάσταση Επαφών</div>
    <div class="meta-d">${esc(today)}</div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">Σύνοψη</div>
  <div class="kpi-row">
    ${kpiHtml(String(contacts.length), 'Σύνολο Επαφών', '#1a73e8')}
    ${kpiHtml(String(preferred.length), 'Προτιμώμενες', 'var(--accent)')}
    ${kpiHtml(String(contacts.filter(c => c._extra?.whatsapp).length), 'WhatsApp', '#25d366')}
    ${kpiHtml(String(contacts.filter(c => c._extra?.viber).length), 'Viber', '#7360f2')}
    ${kpiHtml(String(contacts.filter(c => c._extra?.iban).length), 'Με IBAN', '#1e7e34')}
    ${kpiHtml(String(contacts.filter(c => c._extra?.iris).length), 'Με IRIS', '#b45309')}
  </div>
</div>

${preferred.length > 0 ? `
<div class="sec">
  <div class="sec-title">Προτιμώμενες Επαφές, Γρήγορη Αναφορά</div>
  <div class="preferred-grid">
    ${preferred.map(c => {
      const ex = c._extra || {}
      return `<div class="pref-card">
        <div style="font-weight:500;font-family:'Inter',sans-serif;margin-bottom:4px">${esc(c.full_name)}</div>
        <div style="font-size:9px;color:#5f6368;margin-bottom:4px">${esc(ROLE_META[c.role]?.label || c.role)}</div>
        ${c.phone ? `<div style="font-family:'Roboto Mono',monospace;font-size:10px">${esc(c.phone)}</div>` : ''}
        ${c.email ? `<div style="font-size:9px;color:#5f6368">${esc(c.email)}</div>` : ''}
      </div>`
    }).join('')}
  </div>
</div>` : ''}

<div class="sec">
  <div class="sec-title">Αναλυτικές Επαφές ανά Κατηγορία</div>
  ${groupSections}
</div>

<div class="footer">
  <div>${branding?.companyName ? brandName(branding) : 'Property OS'} · Κατάσταση Επαφών Ακινήτου</div>
  <div>${esc(today)}</div>
</div>
</div></body></html>`)
  w.document.close()
  setTimeout(() => { w.print() }, 900)
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({ contact, onEdit, onDelete, onQuickExpense, onQuickCalendar, onShowHistory, onShowQR, selected, onSelect, bulkMode, branding, scopeLabel, scopePortfolio }: {
  contact: Contact; onEdit: () => void; onDelete: () => void
  onQuickExpense: () => void; onQuickCalendar: () => void; onShowHistory: () => void; onShowQR: () => void
  selected?: boolean; onSelect?: () => void; bulkMode?: boolean; branding?: ReportBranding | null
  scopeLabel?: string | null; scopePortfolio?: boolean
}) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: 'var(--text-tertiary)', GroupIcon: Users, groupLabel: '' }
  const extra = contact._extra || {}; const color = meta.groupColor
  const initials = contact.full_name.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase()
  const [hov, setHov] = useState(false); const [showActions, setShowActions] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  // Κλείσιμο του μενού «···» με κλικ εκτός ή με Escape (χωρίς μετατόπιση διάταξης).
  useEffect(() => {
    if (!showActions) return
    const onDown = (e: MouseEvent) => { if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setShowActions(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowActions(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [showActions])
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  const dueDays = extra.next_appointment ? daysUntil(extra.next_appointment) : null
  const reminderDue = extra.reminder_set ? (daysUntil(extra.reminder_set) || 0) <= 0 : false
  const GroupIcon = meta.GroupIcon || Users

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: 'var(--bg-surface)', border: '1px solid ' + (selected ? 'rgba(26,115,232,0.5)' : hov ? color + '50' : overdue ? 'rgba(255,59,48,0.35)' : 'var(--border-subtle)'), borderRadius: T.radius.card, padding: '18px 18px 16px', position: 'relative', overflow: 'hidden', boxShadow: hov ? '0 6px 24px rgba(0,0,0,0.18)' : 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: overdue ? 'var(--negative)' : 'var(--border-subtle)', borderRadius: '16px 0 0 16px' }} />
      {bulkMode && <div style={{ position: 'absolute', top: 13, left: 10 }}><input type="checkbox" checked={!!selected} onChange={onSelect} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} /></div>}
      {overdue && <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--negative)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: '0 16px 0 8px', letterSpacing: '0.07em' }}>ΛΗΞΗ ΡΑΝΤΕΒΟΥ</div>}
      {reminderDue && !overdue && <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--warning)', color: '#000', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: '0 16px 0 8px', letterSpacing: '0.07em' }}>ΥΠΕΝΘΥΜΙΣΗ</div>}
      {(hov || showActions) && !bulkMode && (
        <div ref={actionsRef} style={{ position: 'absolute', top: 12, right: 12, zIndex: 20 }}>
          {/* Ορατές μόνο οι πιο συχνές ενέργειες — όλες οι υπόλοιπες μπαίνουν στο «···» */}
          <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
            {contact.phone && <QuickAct as="a" href={'tel:' + contact.phone} title="Κλήση"><Phone size={13} /></QuickAct>}
            {extra.whatsapp && contact.phone && <QuickAct as="a" href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" title="WhatsApp" label="WA" />}
            {extra.viber && contact.phone && <QuickAct as="a" href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} title="Viber" label="VB" />}
            {contact.email && <QuickAct as="a" href={'mailto:' + contact.email} title="Email"><Mail size={13} /></QuickAct>}
            <QuickAct as="button" onClick={() => setShowActions(s => !s)} title="Περισσότερες ενέργειες"><span style={{ fontSize: 17, fontWeight: 700, lineHeight: 0, marginTop: -5 }}>···</span></QuickAct>
          </div>
          {showActions && (
            <div role="menu" style={{ position: 'absolute', top: 38, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '6px', minWidth: 210, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
              {[
                { Icon: Pencil, label: 'Επεξεργασία', onClick: onEdit, color: 'var(--text-secondary)' },
                { Icon: Receipt, label: 'Νέα Δαπάνη', onClick: onQuickExpense, color: 'var(--negative)' },
                { Icon: CalendarPlus, label: 'Νέο Ραντεβού', onClick: onQuickCalendar, color: 'var(--text-secondary)' },
                { Icon: History, label: 'Ιστορικό Συνεργασίας', onClick: onShowHistory, color: 'var(--text-secondary)' },
                { Icon: QrCode, label: 'QR Code', onClick: onShowQR, color: 'var(--accent)' },
                { Icon: Printer, label: 'Εκτύπωση Κάρτας', onClick: () => printContactCard(contact, branding), color: 'var(--text-secondary)' },
              ].map((a, i) => (
                <button key={i} type="button" role="menuitem" onClick={() => { a.onClick(); setShowActions(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', borderRadius: T.radius.badge, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <a.Icon size={14} color={a.color} style={{ flexShrink: 0 }} />{a.label}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '5px 8px' }} />
              <button type="button" role="menuitem" onClick={() => { onDelete(); setShowActions(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', borderRadius: T.radius.badge, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--negative)', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,59,48,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Trash2 size={14} color="var(--negative)" style={{ flexShrink: 0 }} />Διαγραφή
              </button>
            </div>
          )}
        </div>
      )}
      <div style={{ paddingLeft: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 12, paddingRight: (hov || showActions) ? 100 : 0, transition: 'padding-right 0.15s' }}>
          {extra.avatar_url ? <img src={extra.avatar_url} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid ' + color + '50', flexShrink: 0 }} />
            : <div style={{ width: 50, height: 50, borderRadius: '50%', background: color + '18', border: '2px solid ' + color + '40', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color, flexShrink: 0 }}>{initials || <GroupIcon size={20} />}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font.sans, marginBottom: 1 }}>{contact.full_name}</div>
            <div style={{ fontSize: 11, color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><GroupIcon size={11} style={{ flexShrink: 0 }} />{meta.label || contact.role}</div>
            {extra.specialty && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extra.specialty}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <StatusBadge status={extra.status || 'active'} />
          {(extra.rating || 0) > 0 && <StarRating value={extra.rating || 0} />}
          {extra.preferred && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'rgba(26,115,232,0.15)', border: '1px solid rgba(26,115,232,0.3)', color: 'var(--accent)', fontWeight: 700 }}>Προτιμώμενη</span>}
          {scopeLabel && (
            <span title={scopePortfolio ? 'Ισχύει για όλο το χαρτοφυλάκιο' : 'Ανήκει σε συγκεκριμένο ακίνητο'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: scopePortfolio ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: '1px solid ' + (scopePortfolio ? 'var(--accent-border)' : 'var(--border-subtle)'), color: scopePortfolio ? 'var(--accent-text)' : 'var(--text-secondary)', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scopePortfolio ? <Globe size={10} style={{ flexShrink: 0 }} /> : <Building2 size={10} style={{ flexShrink: 0 }} />}{scopeLabel}
            </span>
          )}
        </div>
        {(extra.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {(extra.tags || []).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'rgba(26,115,232,0.1)', border: '1px solid rgba(26,115,232,0.22)', color: 'var(--accent)' }}>{t}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {contact.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone}</span>
              {extra.whatsapp && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: 9, color: '#25d366', fontWeight: 800, background: 'rgba(37,211,102,0.1)', padding: '1px 5px', borderRadius: 4 }}>WA</a>}
              {extra.viber && <a href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} style={{ textDecoration: 'none', fontSize: 9, color: '#7360f2', fontWeight: 800, background: 'rgba(115,96,242,0.1)', padding: '1px 5px', borderRadius: 4 }}>VB</a>}
            </div>
          )}
          {extra.phone2 && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{extra.phone2}</span><span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>2ο</span></div>}
          {contact.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}><Mail size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span></div>}
          {extra.website && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.website}</span></div>}
          {extra.office_address && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{extra.office_address}</span></div>}
          {extra.schedule && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{extra.schedule}</span></div>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {extra.afm && <span title="Αριθμός Φορολογικού Μητρώου" style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>ΑΦΜ {extra.afm}</span>}
          {extra.iban && <span title="Διεθνής Αριθμός Τραπεζικού Λογαριασμού (IBAN)" style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>IBAN ···{extra.iban.slice(-4)}{extra.iris && <span title="Σύστημα άμεσων πληρωμών σε πραγματικό χρόνο (IRIS)" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginLeft: 4 }}>IRIS</span>}</span>}
          {extra.iban2 && <span title="Διεθνής Αριθμός Τραπεζικού Λογαριασμού (IBAN)" style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>IBAN2 ···{extra.iban2.slice(-4)}</span>}
          {extra.next_appointment && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: overdue ? 'rgba(255,59,48,0.1)' : color + '12', border: '1px solid ' + (overdue ? 'rgba(255,59,48,0.3)' : color + '30'), color: overdue ? 'var(--negative)' : color }}>{overdue ? `Ραντεβού ${Math.abs(dueDays || 0)} ημέρες πριν` : `Ραντεβού ${fmtDate(extra.next_appointment)}`}</span>}
          {extra.last_contact && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Τελ. επαφή {fmtDate(extra.last_contact)}</span>}
          {(extra.notes_log || []).length > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.2)', color: 'var(--accent)' }}>{(extra.notes_log || []).length} σημειώσεις</span>}
          {(extra.files || []).length > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{(extra.files || []).length} αρχεία</span>}
        </div>
        {contact._freeNotes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: T.radius.badge, padding: '7px 11px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{contact._freeNotes}</div>}
      </div>
    </div>
  )
}

// ─── Compact Row ──────────────────────────────────────────────────────────────
function CompactRow({ contact, onEdit, onDelete, selected, onSelect, bulkMode, scopePortfolio }: { contact: Contact; onEdit: () => void; onDelete: () => void; selected?: boolean; onSelect?: () => void; bulkMode?: boolean; scopePortfolio?: boolean }) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: 'var(--text-tertiary)' }
  const extra = contact._extra || {}; const [hov, setHov] = useState(false)
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  const statusMeta = STATUS_OPTIONS.find(s => s.value === (extra.status || 'active')) || STATUS_OPTIONS[0]
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: hov ? 'var(--bg-elevated)' : selected ? 'rgba(26,115,232,0.04)' : 'transparent', transition: 'background 0.15s', borderBottom: '1px solid var(--border-subtle)' }}>
      {bulkMode && <input type="checkbox" checked={!!selected} onChange={onSelect} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }} />}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: overdue ? 'var(--negative)' : statusMeta.dot, flexShrink: 0 }} />
      <div style={{ width: 200, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.full_name}</div>
        <div style={{ fontSize: 11, color: meta.groupColor, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>{meta.label}{scopePortfolio && <span title="Όλο το χαρτοφυλάκιο" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent-text)' }}><Globe size={10} /></span>}</div>
      </div>
      <div style={{ width: 140, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone || '—'}</div>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || '—'}</div>
      <div style={{ display: 'flex', gap: 4, maxWidth: 160, flexWrap: 'wrap' }}>{(extra.tags || []).slice(0, 2).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: T.radius.pill, background: 'rgba(26,115,232,0.1)', color: 'var(--accent)', border: '1px solid rgba(26,115,232,0.22)' }}>{t}</span>)}</div>
      <StatusBadge status={extra.status || 'active'} />
      <div style={{ display: 'flex', gap: 6, opacity: hov ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
        {contact.phone && <a href={'tel:' + contact.phone} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: 4, color: 'var(--text-secondary)' }}><Phone size={14} /></a>}
        {extra.whatsapp && contact.phone && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#25d366', background: 'rgba(37,211,102,0.1)', borderRadius: 4 }}>WA</a>}
        {extra.viber && contact.phone && <a href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#7360f2', background: 'rgba(115,96,242,0.1)', borderRadius: 4 }}>VB</a>}
        {contact.email && <a href={'mailto:' + contact.email} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: 4, color: 'var(--text-secondary)' }}><Mail size={14} /></a>}
        <button type="button" onClick={onEdit} style={{ fontSize: 12, padding: '4px 10px', borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Επεξεργασία</button>
        <button type="button" onClick={onDelete} style={{ fontSize: 12, padding: '4px 10px', borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Διαγραφή</button>
      </div>
    </div>
  )
}

// ─── Group Divider ────────────────────────────────────────────────────────────
function GroupDivider({ group, count }: { group: typeof GROUPS[0]; count: number }) {
  const GroupIcon = group.Icon
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: group.color + '18', border: '1px solid ' + group.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <GroupIcon size={15} color={group.color} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: group.color, fontFamily: T.font.sans }}>{group.label}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, ' + group.color + '40, transparent)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>{count}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabContacts({ propertyId, userId, embedded, profileType = 'individual', properties = [] }: TabContactsProps) {
  const isPro = profileType === 'professional'
  const branding = useReportBranding(userId)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, extra: { ...EMPTY_EXTRA } })
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [filterScope, setFilterScope] = useState<'all' | 'portfolio' | 'property'>('all')
  const [filterTag, setFilterTag] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [showMore, setShowMore] = useState(false)   // πτυσσόμενες προαιρετικές λεπτομέρειες στη φόρμα
  const [error, setError] = useState<string | null>(null)
  const [quickExpense, setQuickExpense] = useState<Contact | null>(null)
  const [quickCalendar, setQuickCalendar] = useState<Contact | null>(null)
  const [historyContact, setHistoryContact] = useState<Contact | null>(null)
  const [qrContact, setQrContact] = useState<Contact | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200) }
  // ─── Εμβέλεια επαφής (μόνο επαγγελματικό προφίλ) ──────────────────────────────
  const propName = (id?: string | null) => properties.find(p => p.id === id)?.name || ''
  const scopeIsPortfolio = (c: Contact) => c._extra?.scope === 'portfolio'
  const scopeLabelFor = (c: Contact): string | null => {
    if (!isPro) return null
    if (scopeIsPortfolio(c)) return 'Όλο το χαρτοφυλάκιο'
    return propName(c._extra?.scope_property_id || propertyId) || 'Αυτό το ακίνητο'
  }
  const fetchContacts = useCallback(async () => {
    setLoading(true)
    // Φέρνουμε ΟΛΕΣ τις επαφές του χρήστη και δείχνουμε: αυτές του τρέχοντος ακινήτου
    // ΣΥΝ όσες έχουν οριστεί «όλο το χαρτοφυλάκιο» (ώστε οι επαγγελματικές επαφές
    // χαρτοφυλακίου να εμφανίζονται πραγματικά σε κάθε ακίνητο, όχι μόνο ως ετικέτα).
    const { data } = await supabase.from('contacts').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    const parsed = (data || []).map(parseContact)
    setContacts(parsed.filter(c => c.property_id === propertyId || c._extra?.scope === 'portfolio'))
    setLoading(false)
  }, [propertyId, userId])
  useEffect(() => { fetchContacts() }, [fetchContacts])

  const openAdd = () => { setEditContact(null); setForm({ ...EMPTY_FORM, extra: { ...EMPTY_EXTRA } }); setError(null); setShowMore(false); setShowModal(true) }
  const openEdit = (c: Contact) => { setEditContact(c); setForm({ full_name: c.full_name, role: c.role, phone: c.phone || '', email: c.email || '', freeNotes: c._freeNotes || '', extra: { ...EMPTY_EXTRA, ...(c._extra || {}), tags: c._extra?.tags || [], notes_log: c._extra?.notes_log || [], files: c._extra?.files || [] } }); setError(null); setShowMore(!!(c._extra?.tags?.length || c._extra?.notes_log?.length || c._extra?.files?.length || c._extra?.rating || c._extra?.next_appointment)); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditContact(null); setError(null) }
  const setExtra = (key: keyof ContactExtra, value: unknown) => setForm(f => ({ ...f, extra: { ...f.extra, [key]: value } }))

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError('Το ονοματεπώνυμο είναι υποχρεωτικό.'); return }
    setSaving(true); setError(null)
    const payload = { full_name: form.full_name.trim(), role: form.role, phone: form.phone.trim() || null, email: form.email.trim() || null, notes: serializeNotes(form.extra, form.freeNotes) }
    if (editContact) {
      const { error: e } = await supabase.from('contacts').update(payload).eq('id', editContact.id)
      if (e) { setError('Σφάλμα: ' + e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('contacts').insert({ ...payload, property_id: propertyId, user_id: userId })
      if (e) { setError('Σφάλμα: ' + e.message); setSaving(false); return }
    }
    setSaving(false); closeModal(); fetchContacts(); showToast(editContact ? 'Επαφή ενημερώθηκε' : 'Επαφή προστέθηκε')
  }

  const handleDelete = async (id: string) => { await supabase.from('contacts').delete().eq('id', id); setDeleteId(null); fetchContacts(); showToast('Επαφή διαγράφηκε') }
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulkDelete = async () => { if (!selected.size || !confirm(`Διαγραφή ${selected.size} επαφών;`)) return; await Promise.all([...selected].map(id => supabase.from('contacts').delete().eq('id', id))); setSelected(new Set()); setBulkMode(false); fetchContacts(); showToast(`${selected.size} επαφές διαγράφηκαν`) }
  const bulkEmail = () => { const emails = contacts.filter(c => selected.has(c.id) && c.email).map(c => c.email).join(','); if (emails) window.open('mailto:' + emails) }

  // ─── Enhanced CSV Export ───────────────────────────────────────────────────

  const processed = useMemo(() => {
    let list = contacts.filter(c => {
      const matchGroup = filterGroup === 'all' || ROLE_META[c.role]?.groupId === filterGroup
      const matchTag = !filterTag || (c._extra?.tags || []).includes(filterTag)
      const matchScope = !isPro || filterScope === 'all'
        || (filterScope === 'portfolio' ? scopeIsPortfolio(c) : !scopeIsPortfolio(c))
      const q = search.toLowerCase(); const ex = c._extra || {}
      return matchGroup && matchTag && matchScope && (!q || c.full_name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q) || (ex.specialty || '').toLowerCase().includes(q) || (ex.afm || '').includes(q) || (ex.iban || '').includes(q) || (ex.tags || []).some((t: string) => t.toLowerCase().includes(q)))
    })
    if (sortMode === 'alpha') list = [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, 'el'))
    if (sortMode === 'rating') list = [...list].sort((a, b) => (b._extra?.rating || 0) - (a._extra?.rating || 0))
    return [...list.filter(c => c._extra?.preferred), ...list.filter(c => !c._extra?.preferred)]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, search, filterGroup, filterTag, filterScope, sortMode, isPro])

  const groupedFiltered: Record<string, Contact[]> = {}
  processed.forEach(c => { const gid = ROLE_META[c.role]?.groupId || 'tenants'; if (!groupedFiltered[gid]) groupedFiltered[gid] = []; groupedFiltered[gid].push(c) })
  const preferred = contacts.filter(c => c._extra?.preferred)
  const overdueContacts = contacts.filter(c => c._extra?.next_appointment && isOverdue(c._extra.next_appointment))
  const allTags = [...new Set(contacts.flatMap(c => c._extra?.tags || []))]
  const tenantsCount = contacts.filter(c => ROLE_META[c.role]?.groupId === 'tenants').length
  const technicalCount = contacts.filter(c => ROLE_META[c.role]?.groupId === 'technical').length
  const providersCount = contacts.filter(c => ['electricity', 'telecom'].includes(ROLE_META[c.role]?.groupId || '')).length
  const kpiItems: KPIItem[] = [
    { label: 'Σύνολο Επαφών', value: fn(contacts.length) },
    { label: 'Ενοικιαστές', value: fn(tenantsCount), tone: 'neutral' },
    { label: 'Τεχνικοί & Μάστορες', value: fn(technicalCount), tone: 'neutral' },
    { label: 'Πάροχοι Ρεύματος & Internet', value: fn(providersCount) },
    { label: 'Προτιμώμενες', value: fn(preferred.length), tone: preferred.length > 0 ? 'accent' : 'neutral' },
  ]
  const initials = form.full_name.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase()
  const formColor = ROLE_META[form.role]?.groupColor || 'var(--text-tertiary)'

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1080, margin: '0 auto', fontFamily: T.font.sans }}>

      {toast && <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--bg-elevated)', border: '1px solid rgba(26,115,232,0.45)', borderRadius: 12, padding: '13px 22px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', zIndex: 2000, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />{toast}</div>}

      {!embedded && <PageTitle
        title="Επαφές"
        sub="Πάροχοι, τράπεζες, τεχνικοί και όλες οι επαφές του ακινήτου"
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant={bulkMode ? 'secondary' : 'ghost'} onClick={() => { setBulkMode(b => !b); setSelected(new Set()) }}>{bulkMode ? 'Ακύρωση επιλογής' : 'Μαζική επιλογή'}</Btn>
          <Btn variant="ghost" onClick={() => exportContactsExcel(contacts)}>Εξαγωγή Excel</Btn>
          <Btn variant="ghost" onClick={() => exportContactsPDF(contacts, branding)}>Εξαγωγή PDF</Btn>
          <Btn variant="primary" onClick={openAdd}>Νέα επαφή</Btn>
        </div>}
      />}

      {contacts.length > 0 && <KPIGrid items={kpiItems} />}

      {overdueContacts.length > 0 && (
        <InfoBanner tone="warning">
          <strong style={{ color: 'var(--text-primary)' }}>{overdueContacts.length} επαφές με ληγμένο ραντεβού: </strong>{overdueContacts.map(c => c.full_name).join(', ')}
        </InfoBanner>
      )}

      {bulkMode && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(26,115,232,0.08)', border: '1px solid rgba(26,115,232,0.3)', borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{selected.size} επιλεγμένες</span>
          <button type="button" onClick={bulkEmail} style={{ padding: '5px 12px', borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Email σε όλες</button>
          <button type="button" onClick={bulkDelete} style={{ padding: '5px 12px', borderRadius: T.radius.badge, border: '1px solid rgba(255,59,48,0.35)', background: 'rgba(255,59,48,0.07)', fontSize: 12, color: 'var(--negative)', cursor: 'pointer' }}>Διαγραφή επιλεγμένων</button>
          <button type="button" onClick={() => setSelected(new Set(processed.map(c => c.id)))} style={{ padding: '5px 12px', borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Επιλογή όλων</button>
          <button type="button" onClick={() => setSelected(new Set())} style={{ padding: '5px 12px', borderRadius: T.radius.badge, border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>Αποεπιλογή</button>
        </div>
      )}

      {preferred.length > 0 && (
        <div style={{ marginBottom: 22, padding: '16px 20px', background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)' }}>
          <SecHdr label="Γρήγορη Πρόσβαση" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {preferred.map(c => {
              const meta = ROLE_META[c.role] || { groupColor: 'var(--text-tertiary)', label: c.role, GroupIcon: Users }
              const overdue = c._extra?.next_appointment && isOverdue(c._extra.next_appointment)
              const GroupIcon = meta.GroupIcon || Users
              return (
                <div key={c.id} onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid ' + (overdue ? 'var(--negative-border)' : meta.groupColor + '40'), cursor: 'pointer', position: 'relative' }}>
                  {overdue && <span style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--negative)', border: '2px solid var(--bg-elevated)' }} />}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: meta.groupColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: meta.groupColor, overflow: 'hidden', flexShrink: 0 }}>
                    {c._extra?.avatar_url ? <img src={c._extra.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : c.full_name.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase() || <GroupIcon size={14} />}
                  </div>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{c.full_name}</div><div style={{ fontSize: 11, color: meta.groupColor }}>{meta.label}</div></div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                    {c.phone && <a href={'tel:' + c.phone} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 3 }}><Phone size={13} /></a>}
                    {c._extra?.whatsapp && c.phone && <a href={'https://wa.me/' + c.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: 9, fontWeight: 800, color: '#25d366', background: 'rgba(37,211,102,0.12)', padding: '2px 5px', borderRadius: 4 }}>WA</a>}
                    {c._extra?.viber && c.phone && <a href={'viber://chat?number=' + c.phone.replace(/\D/g, '')} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: 9, fontWeight: 800, color: '#7360f2', background: 'rgba(115,96,242,0.12)', padding: '2px 5px', borderRadius: 4 }}>VB</a>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, τηλ., email, ΑΦΜ, IBAN, ετικέτας..." style={{ ...iStyle, paddingLeft: 38 }} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
        </div>
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ ...iStyle, minWidth: 200, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Όλες οι κατηγορίες</option>
          {GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        {allTags.length > 0 && (
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...iStyle, minWidth: 150, width: 'auto', cursor: 'pointer' }}>
            <option value="">Όλες οι ετικέτες</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} style={{ ...iStyle, minWidth: 160, width: 'auto', cursor: 'pointer' }}>
          <option value="recent">Πιο πρόσφατες</option>
          <option value="alpha">Αλφαβητικά</option>
          <option value="rating">Αξιολόγηση</option>
        </select>
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, overflow: 'hidden' }}>
          {(['cards', 'compact'] as ViewMode[]).map(v => (
            <button key={v} type="button" onClick={() => setViewMode(v)} style={{ padding: '7px 16px', border: 'none', background: viewMode === v ? 'var(--accent)' : 'transparent', color: viewMode === v ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 500, fontFamily: T.font.sans, transition: 'all 0.15s' }}>{v === 'cards' ? 'Κάρτες' : 'Λίστα'}</button>
          ))}
        </div>
      </div>

      {isPro && contacts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Εμβέλεια</span>
          {([
            { id: 'all' as const, label: 'Όλες', Icon: Users },
            { id: 'portfolio' as const, label: 'Όλο το χαρτοφυλάκιο', Icon: Globe },
            { id: 'property' as const, label: 'Ανά ακίνητο', Icon: Building2 },
          ]).map(o => { const active = filterScope === o.id; const Ico = o.Icon; return (
            <button key={o.id} type="button" onClick={() => setFilterScope(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', fontSize: 12, color: active ? 'var(--accent-text)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
              <Ico size={12} />{o.label}
            </button>
          )})}
        </div>
      )}

      {contacts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {GROUPS.filter(g => contacts.some(c => ROLE_META[c.role]?.groupId === g.id)).map(g => {
            const count = contacts.filter(c => ROLE_META[c.role]?.groupId === g.id).length; const active = filterGroup === g.id; const GroupIcon = g.Icon
            return (
              <button key={g.id} type="button" onClick={() => setFilterGroup(active ? 'all' : g.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', fontSize: 12, color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
                <GroupIcon size={12} />{g.label}<span style={{ background: active ? 'var(--accent)' : 'var(--bg-elevated)', color: active ? 'var(--accent-text)' : 'var(--text-secondary)', borderRadius: T.radius.pill, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {contacts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{processed.length} επαφές</span>
          <ExportButton disabled={processed.length === 0} onClick={() => downloadCsv(
            `epafes_${new Date().toISOString().slice(0, 10)}`,
            ['Όνομα', 'Ρόλος', 'Κατηγορία', 'Τηλέφωνο', 'Email', 'Σημειώσεις'],
            processed.map(c => [
              c.full_name, ROLE_META[c.role]?.label || c.role, ROLE_META[c.role]?.groupLabel || '',
              c.phone || '', c.email || '', (c._freeNotes || '').replace(/\n/g, ' '),
            ])
          )} />
        </div>
      )}

      {loading ? (
        <Spinner label="Φόρτωση…" />
      ) : contacts.length === 0 ? (
        <EmptyState
          title="Δεν υπάρχουν επαφές"
          hint="Πρόσθεσε παρόχους ρεύματος, τράπεζες, τεχνικούς και όλες τις επαφές του ακινήτου."
          action={<Btn variant="primary" onClick={openAdd}>Νέα επαφή</Btn>}
        />
      ) : processed.length === 0 ? (
        <EmptyState title="Δεν βρέθηκαν αποτελέσματα" hint="Δοκίμασε διαφορετική αναζήτηση ή κατηγορία." />
      ) : viewMode === 'compact' ? (
        <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            {bulkMode && <div style={{ width: 20 }} />}
            <div style={{ width: 8 }} />
            <div style={{ width: 200, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Όνομα</div>
            <div style={{ width: 140, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Τηλέφωνο</div>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Email</div>
            <div style={{ width: 120, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ετικέτες</div>
            <div style={{ width: 100, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Κατάσταση</div>
          </div>
          {processed.map(c => <CompactRow key={c.id} contact={c} onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} scopePortfolio={isPro && scopeIsPortfolio(c)} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 42 }}>
          {GROUPS.filter(g => groupedFiltered[g.id]?.length).map(g => (
            <div key={g.id}>
              <GroupDivider group={g} count={groupedFiltered[g.id].length} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 14 }}>
                {groupedFiltered[g.id].map(c => (
                  <ContactCard key={c.id} contact={c} onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)} onQuickExpense={() => setQuickExpense(c)} onQuickCalendar={() => setQuickCalendar(c)} onShowHistory={() => setHistoryContact(c)} onShowQR={() => setQrContact(c)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} branding={branding} scopeLabel={scopeLabelFor(c)} scopePortfolio={scopeIsPortfolio(c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, width: '100%', maxWidth: 600, maxHeight: '92vh', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '22px 28px 18px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {ROLE_META[form.role] && (() => { const meta = ROLE_META[form.role]; const Icon = meta.GroupIcon || Users; return <div style={{ width: 36, height: 36, borderRadius: 10, background: meta.groupColor + '18', border: '1px solid ' + meta.groupColor + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={17} color={meta.groupColor} /></div> })()}
                  <div>
                    <h3 style={{ fontFamily: T.font.sans, fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{editContact ? 'Επεξεργασία επαφής' : 'Νέα επαφή'}</h3>
                    {editContact && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{editContact.full_name}</p>}
                  </div>
                </div>
                <button type="button" onClick={closeModal} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
              </div>
            </div>

            <div style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* ── Στοιχεία ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                    <AvatarUpload avatarUrl={form.extra.avatar_url || ''} initials={initials} color={formColor} onChange={v => setExtra('avatar_url', v)} />
                  </div>
                  <div><FL>Ονοματεπώνυμο ή επωνυμία *</FL><Inp value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} placeholder="Παράδειγμα: Γιώργος Παπαδόπουλος ή ΔΕΗ Α.Ε." /></div>
                  <div>
                    <FL>Κατηγορία ή ειδικότητα</FL>
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...iStyle, cursor: 'pointer' }}>
                      {ROLE_SELECT_OPTIONS.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
                    </select>
                  </div>
                  {isPro && (
                    <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
                      <FL>Εμβέλεια επαφής</FL>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {([{ v: 'property' as const, label: 'Συγκεκριμένο ακίνητο', Icon: Building2 }, { v: 'portfolio' as const, label: 'Όλο το χαρτοφυλάκιο', Icon: Globe }]).map(o => {
                          const active = (form.extra.scope || 'property') === o.v; const Ico = o.Icon; return (
                            <button key={o.v} type="button" onClick={() => setExtra('scope', o.v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
                              <Ico size={14} />{o.label}
                            </button>
                          )
                        })}
                      </div>
                      {(form.extra.scope || 'property') !== 'portfolio' && properties.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <select value={form.extra.scope_property_id || propertyId} onChange={e => setExtra('scope_property_id', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
                            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.5 }}>
                        {(form.extra.scope || 'property') === 'portfolio' ? 'Κοινή επαφή, διαθέσιμη σε όλο το χαρτοφυλάκιο.' : 'Η επαφή αφορά το επιλεγμένο ακίνητο.'}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Επικοινωνία ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SecHead>Επικοινωνία</SecHead>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                    <div><FL>Τηλέφωνο</FL><Inp value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="2101234567" /></div>
                    <div><FL>Κινητό</FL><Inp value={form.extra.phone2 || ''} onChange={v => setExtra('phone2', v)} placeholder="6941234567" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Tog value={!!form.extra.whatsapp} onChange={v => setExtra('whatsapp', v)} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>WhatsApp</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Tog value={!!form.extra.viber} onChange={v => setExtra('viber', v)} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Viber</span></div>
                  </div>
                  <div><FL>Email</FL><Inp value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@example.gr" /></div>
                </div>

                {/* ── Πτυσσόμενες λεπτομέρειες ── */}
                <button type="button" onClick={() => setShowMore(m => !m)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', border: '1px dashed var(--border-default)', borderRadius: T.radius.inner, background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>
                  {showMore ? 'Λιγότερες λεπτομέρειες' : 'Περισσότερες λεπτομέρειες'}
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
                </button>

                {showMore && (
                  <>
                    {/* ── Επαγγελματικά & πληρωμές ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Επαγγελματικά και πληρωμές</SecHead>
                      <div><FL>Υπο-ειδικότητα</FL><Inp value={form.extra.specialty || ''} onChange={v => setExtra('specialty', v)} placeholder="Παράδειγμα: ειδικός σε κεντρική θέρμανση" /></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                        <div><FL><span title="Αριθμός Φορολογικού Μητρώου">ΑΦΜ</span></FL><Inp value={form.extra.afm || ''} onChange={v => setExtra('afm', v)} placeholder="123456789" /></div>
                        <div><FL>Αριθμός μητρώου ή άδειας</FL><Inp value={form.extra.license_number || ''} onChange={v => setExtra('license_number', v)} placeholder="Παράδειγμα: άδεια μεσίτη 123" /></div>
                      </div>
                      <div><FL><span title="Διεθνής Αριθμός Τραπεζικού Λογαριασμού (IBAN)">IBAN</span></FL><Inp value={form.extra.iban || ''} onChange={v => setExtra('iban', v)} placeholder="GR16 0110 1250 0000 0001 2300 695" /></div>
                      <div><FL>Δεύτερος IBAN</FL><Inp value={form.extra.iban2 || ''} onChange={v => setExtra('iban2', v)} placeholder="Αν υπάρχει" /></div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                        <div><div title="Σύστημα άμεσων πληρωμών σε πραγματικό χρόνο (IRIS)" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>IRIS</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>Δέχεται άμεσες πληρωμές μέσω IRIS</div></div>
                        <Tog value={!!form.extra.iris} onChange={v => setExtra('iris', v)} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                        <div><FL>Ιστοσελίδα</FL><Inp value={form.extra.website || ''} onChange={v => setExtra('website', v)} placeholder="www.example.gr" /></div>
                        <div><FL>Ωράριο</FL><Inp value={form.extra.schedule || ''} onChange={v => setExtra('schedule', v)} placeholder="Δευτέρα–Παρασκευή 09:00–17:00" /></div>
                      </div>
                      <div><FL>Διεύθυνση γραφείου</FL><Inp value={form.extra.office_address || ''} onChange={v => setExtra('office_address', v)} placeholder="Παράδειγμα: Σταδίου 15, Αθήνα" /></div>
                    </div>

                    {/* ── Σχέση & αξιολόγηση ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Σχέση και αξιολόγηση</SecHead>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                        <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Προτιμώμενη επαφή</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Εμφάνιση στη γρήγορη πρόσβαση</div></div>
                        <Tog value={!!form.extra.preferred} onChange={v => setExtra('preferred', v)} />
                      </div>
                      <div><FL>Αξιολόγηση</FL><StarRating value={form.extra.rating || 0} onChange={v => setExtra('rating', v)} /></div>
                      <div>
                        <FL>Κατάσταση σχέσης</FL>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {STATUS_OPTIONS.map(s => { const active = (form.extra.status || 'active') === s.value; return (
                            <button key={s.value} type="button" onClick={() => setExtra('status', s.value)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 15px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? s.color : 'var(--border-subtle)'), background: active ? s.bg : 'transparent', color: active ? s.color : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: active ? 700 : 400, transition: 'all 0.15s' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />{s.label}
                            </button>
                          )})}
                        </div>
                      </div>
                      <div><FL>Ετικέτες</FL><TagEditor tags={form.extra.tags || []} onChange={v => setExtra('tags', v)} /></div>
                    </div>

                    {/* ── Παρακολούθηση ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Παρακολούθηση</SecHead>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                        <div><FL>Τελευταία επαφή</FL><DatePicker value={form.extra.last_contact || ''} onChange={v => setExtra('last_contact', v)} /></div>
                        <div><FL>Επόμενο ραντεβού</FL><DatePicker value={form.extra.next_appointment || ''} onChange={v => setExtra('next_appointment', v)} /></div>
                      </div>
                      <div>
                        <FL>Υπενθύμιση επικοινωνίας</FL>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                          {([0, 7, 14, 30, 60, 90] as const).map(d => { const active = (form.extra.reminder_days || 0) === d; return (
                            <button key={d} type="button" onClick={() => { setExtra('reminder_days', d); setExtra('reminder_set', d > 0 ? new Date(Date.now() + d * 86400000).toISOString().split('T')[0] : '') }} style={{ padding: '6px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: active ? 700 : 400 }}>
                              {REMINDER_LABELS[d]}
                            </button>
                          )})}
                        </div>
                        {(form.extra.reminder_days || 0) > 0 && form.extra.reminder_set && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Υπενθύμιση: <strong style={{ color: 'var(--accent)' }}>{fmtDate(form.extra.reminder_set)}</strong></div>}
                      </div>
                    </div>

                    {/* ── Σημειώσεις & αρχεία ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Σημειώσεις και αρχεία</SecHead>
                      <div><FL>Ελεύθερες σημειώσεις</FL><Txt value={form.freeNotes} onChange={v => setForm(f => ({ ...f, freeNotes: v }))} placeholder="Ιστορικό, τιμές, συμφωνίες…" rows={4} /></div>
                      <div><FL>Ημερολόγιο σημειώσεων</FL><NotesLog log={form.extra.notes_log || []} onChange={v => setExtra('notes_log', v)} /></div>
                      <div><FL>Αρχεία</FL><FileUploader files={form.extra.files || []} onChange={v => setExtra('files', v)} contactId={editContact?.id} /></div>
                    </div>
                  </>
                )}
              </div>
              {error && <div style={{ marginTop: 14, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: T.radius.inner, padding: '11px 16px', color: 'var(--negative)', fontSize: 13 }}>{error}</div>}
            </div>

            <div style={{ padding: '16px 28px 24px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
              <button type="button" onClick={closeModal} style={{ flex: 1, padding: '12px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px 0', borderRadius: T.radius.btn, border: 'none', background: saving ? 'var(--border-default)' : 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                {saving ? 'Αποθήκευση...' : editContact ? 'Αποθήκευση Αλλαγών' : 'Προσθήκη Επαφής'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 36, width: '100%', maxWidth: 380, border: '1px solid var(--border-subtle)', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Διαγραφή Επαφής;</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>Αυτή η ενέργεια δεν αναιρείται.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={() => handleDelete(deleteId!)} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--negative)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Διαγραφή</button>
            </div>
          </div>
        </div>
      )}

      {quickExpense && <QuickExpenseModal contact={quickExpense} propertyId={propertyId} userId={userId} onClose={() => setQuickExpense(null)} onSaved={() => showToast('Δαπάνη αποθηκεύτηκε')} />}
      {quickCalendar && <QuickCalendarModal contact={quickCalendar} propertyId={propertyId} userId={userId} onClose={() => setQuickCalendar(null)} onSaved={() => showToast('Ραντεβού προστέθηκε')} />}
      {historyContact && <HistoryModal contact={historyContact} propertyId={propertyId} onClose={() => setHistoryContact(null)} />}
      {qrContact && <QRCodeModal contact={qrContact} onClose={() => setQrContact(null)} />}
    </div>
  )
}