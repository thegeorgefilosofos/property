'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type ElementType } from 'react'
import { qrDataUrl } from '@/lib/qr';
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { inferRole } from '@/lib/contacts/roles'
import { alphaBucket, buildAlphaIndex, compareNames, initialsOf, type AlphaEntry } from '@/lib/contacts/alpha'
import { Phone, Mail, X, Search, Globe, MapPin, FileText, QrCode, Printer, History, Receipt, CalendarPlus, Users, Building2, Wrench, Trees, UserCheck, Zap, Wifi, Landmark, Shield, Pencil, Trash2, Copy, MessageSquare, UserPlus, Camera, Check, Minus, SearchX } from 'lucide-react'
import { DatePicker, CustomSelect } from './UIComponents'
import { T, PageTitle, SecHdr, Btn, EmptyState, fn, fe, Skeleton, SkeletonKPIs, ABSENT } from '@/components/Theme'
import { notify, notifyOk, notifyError } from '@/components/Toast'
import { saved } from '@/components/dbWrite'
import { confirmDialog } from '@/components/confirmBus'
import { brandName, useReportBranding, type ReportBranding } from '@/lib/reportBranding'
import { reportHead, reportHeader, reportSection, reportKpi, reportDisclaimer, openReport, rEsc } from './reportPdf'
import { escHtml as esc } from '@/lib/reportBranding';
import { uploadUserScoped } from '@/lib/storage/scopedUpload';
import { formFields, CONTACT_FIELDS, type FieldContext, type FieldDecision } from '@/lib/property/fields';
import { athensToday, daysUntil as athensDaysUntil } from '@/lib/core/time';

// ── Δομικά του ντοσιέ επαφής ──────────────────────────────────────────────
// ΣΕ MODULE SCOPE: ορισμένα μέσα στο DossierPanel, ξαναγεννιούνταν σε κάθε
// render του πάνελ. Ο React έβλεπε νέο τύπο component κάθε φορά, άρα
// αποσυναρμολογούσε και ξανάχτιζε ΟΛΟ το ντοσιέ — δεκαοκτώ κόμβοι, σε κάθε
// πληκτρολόγηση ή ανανέωση. Δεν είναι μόνο σπατάλη: ό,τι state ζει μέσα τους
// (scroll, focus, επιλογή κειμένου) χανόταν.
const DossierRow = ({ icon: Ic, children, onCopy }: { icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>; children: React.ReactNode; onCopy?: () => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <Ic size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
    {onCopy && <button type="button" onClick={onCopy} title="Αντιγραφή" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 4, flexShrink: 0 }}><Copy size={13} /></button>}
  </div>
)
const DossierSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '15px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
)

const supabase = createSupabaseClient()

// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΑΛΛΑΞΕ ΣΕ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ ΚΑΙ ΓΙΑΤΙ
//
// 1. ΑΠΟΡΡΗΤΟ. Το πεδίο διεύθυνσης έστελνε ΚΑΘΕ ΠΛΗΚΤΡΟΛΟΓΗΣΗ στο
//    nominatim.openstreetmap.org (debounce 450ms, κάθε είσοδος ≥4 χαρακτήρων).
//    Έφευγαν διευθύνσεις γραφείων ΤΡΙΤΩΝ ΠΡΟΣΩΠΩΝ εκτός της υποδομής μας, χωρίς
//    αναφορά στην Πολιτική Απορρήτου, ενώ η ίδια εφαρμογή υπόσχεται στον χρήστη ότι
//    ξέρει ποιος βλέπει τα δεδομένα του. Επιπλέον η πολιτική του Nominatim
//    ΑΠΑΓΟΡΕΥΕΙ autocomplete και απαιτεί δικό User-Agent: σε παραγωγή θα
//    μπλοκαριζόταν σιωπηλά. → Απλό πεδίο κειμένου. Ο χάρτης δεν φορτώνεται πια
//    μόνος του σε iframe (που στέλνει τη διεύθυνση στην Google με το που ανοίγει το
//    ντοσιέ) αλλά ανοίγει με ΡΗΤΟ κλικ του χρήστη.
//
// 2. Η ΣΑΡΩΣΗ ΕΞΑΦΑΝΙΖΟΤΑΝ ΑΚΡΙΒΩΣ ΟΤΑΝ ΧΡΕΙΑΖΟΤΑΝ. Όλα τα κουμπιά της κεφαλίδας,
//    μαζί με το «Σάρωσε κάρτα», αποδίδονταν μόνο αν υπήρχε ΗΔΗ επαφή. Ο νέος
//    χρήστης δεν έβλεπε καθόλου τη σάρωση και ο μόνος δρόμος για την πρώτη επαφή
//    ήταν η φόρμα των 20 πεδίων. → «Φωτογράφισε κάρτα ή τιμολόγιο» ως κύριο CTA,
//    πάντα ορατό, και στην κενή κατάσταση.
//
// 3. Ο ΚΥΚΛΟΣ ΠΑΡΑΣΤΑΤΙΚΟ ↔ ΕΠΑΦΗ ΗΤΑΝ ΣΠΑΣΜΕΝΟΣ. Οι δαπάνες ταίριαζαν με
//    `description.ilike.*όνομα*`: ο «Παπαδόπουλος Υδραυλικός» δεν έβρισκε τη δαπάνη
//    «Συντήρηση — Παπαδόπουλος». Το ΑΦΜ αποθηκευόταν, υπάρχει και στα σαρωμένα
//    έγγραφα, και ποτέ δεν συνέδεε τα δύο. → Ταίριασμα με ΑΦΜ (contacts.afm ↔
//    property_documents.provider_afm) και «όλα τα παραστατικά αυτού του παρόχου».
//
// 4. ΕΞΙ ΠΕΔΙΑ ΧΩΡΙΣ ΚΑΜΙΑ ΕΝΕΡΓΕΙΑ έφυγαν (αριθμός μητρώου/άδειας, δεύτερος IBAN,
//    ωράριο, τελευταία επαφή, αξιολόγηση με αστέρια, «κατάσταση σχέσης» που κόλλαγε
//    την ετικέτα «Προβληματικός» πάνω σε όνομα ανθρώπου), μαζί με την «Υπενθύμιση
//    επικοινωνίας» που υποσχόταν ρυθμό και έδινε μία παγωμένη ημερομηνία, και τις
//    δύο διαδρομές εισαγωγής αρχείου (.vcf/.csv) που η φωτογράφιση καλύπτει.
//    Ποια πεδία μένουν το ορίζει το lib/property/fields.ts (CONTACT_FIELDS).
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContactExtra {
  phone2?: string; whatsapp?: boolean; viber?: boolean; website?: string
  office_address?: string; afm?: string
  iban?: string; iris?: boolean
  preferred?: boolean
  next_appointment?: string; specialty?: string
  tags?: string[]; avatar_url?: string
  notes_log?: { id: string; text: string; ts: string }[]
  files?: { name: string; url: string; size: string; uploaded: string }[]
  // ΠΑΛΙΑ ΠΕΔΙΑ, ΔΕΝ ΓΡΑΦΟΝΤΑΙ ΠΙΑ. Παραμένουν στον τύπο επειδή ζουν μέσα στο JSON
  // του `notes` παλιών επαφών — δεν σβήνουμε δεδομένα χρήστη, απλώς δεν τα ζητάμε
  // και δεν τα δείχνουμε: κανένα δεν προκαλούσε καμία ενέργεια στο app.
  license_number?: string; iban2?: string; schedule?: string
  rating?: number; last_contact?: string
  reminder_days?: number; reminder_set?: string
  status?: 'active' | 'pending' | 'inactive' | 'problematic'
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
type SortMode = 'recent' | 'alpha'
type ViewMode = 'cards' | 'compact'

// ─── Design System ────────────────────────────────────────────────────────────
const iStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '10px 16px', borderRadius: 6,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, letterSpacing: 0, outline: 'none',
  fontFamily: T.font.sans, boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
}

// ─── ROLE GROUPS, Πλήρης Ελληνική Λίστα ─────────────────────────────────────
const GROUPS = [
  {
    id: 'authorities', label: 'Δημόσιες Αρχές', color: 'var(--accent)', Icon: Building2,
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
    id: 'electricity', label: 'Πάροχοι Ρεύματος', color: 'var(--accent)', Icon: Zap,
    roles: [
      { value: 'elec_dei', label: 'ΔΕΗ' },
      { value: 'elec_protergia', label: 'Protergia (Metlen)' },
      { value: 'elec_heron', label: 'Ήρων (Heron)' },
      { value: 'elec_elpedison', label: 'Elpedison' },
      { value: 'elec_nrg', label: 'NRG' },
      { value: 'elec_zenith', label: 'Zenith' },
      { value: 'elec_fysiko', label: 'Φυσικό Αέριο Ελλάδος' },
      { value: 'elec_volterra', label: 'Volterra' },
      { value: 'elec_volton', label: 'Volton' },
      { value: 'elec_elin', label: 'Elin' },
      { value: 'elec_we', label: 'We Energy' },
      { value: 'elec_watt_volt', label: 'Watt+Volt' },
      { value: 'elec_eydap', label: 'ΕΥΔΑΠ (νερό)' },
      { value: 'elec_deddie', label: 'ΔΕΔΔΗΕ (δίκτυο)' },
      { value: 'elec_other', label: 'Άλλος Πάροχος Ρεύματος' },
    ],
  },
  {
    id: 'telecom', label: 'Τηλεφωνία & Internet', color: 'var(--accent)', Icon: Wifi,
    roles: [
      { value: 'tel_ote', label: 'Cosmote (OTE)' },
      { value: 'tel_vodafone', label: 'Vodafone' },
      { value: 'tel_nova', label: 'Nova' },
      { value: 'tel_inalan', label: 'Inalan' },
      { value: 'tel_other', label: 'Άλλος Πάροχος Internet / Τηλεφωνίας' },
    ],
  },
  {
    id: 'banks', label: 'Τράπεζες & Χρηματοδότηση', color: 'var(--accent)', Icon: Landmark,
    roles: [
      { value: 'bank_alpha', label: 'Alpha Bank' },
      { value: 'bank_eurobank', label: 'Eurobank' },
      { value: 'bank_piraeus', label: 'Τράπεζα Πειραιώς' },
      { value: 'bank_nbg', label: 'Εθνική Τράπεζα (ΕΤΕ)' },
      { value: 'bank_attica', label: 'Attica Bank' },
      { value: 'bank_optima', label: 'Optima Bank' },
      { value: 'bank_credia', label: 'Credia Bank (πρώην Παγκρήτια)' },
      { value: 'bank_aegean', label: 'Aegean Baltic Bank' },
      { value: 'bank_revolut', label: 'Revolut' },
      { value: 'bank_ing', label: 'ING' },
      { value: 'bank_other', label: 'Άλλη Τράπεζα / Χρηματοδότης' },
    ],
  },
  {
    id: 'insurance', label: 'Ασφαλιστικές Εταιρείες', color: 'var(--accent)', Icon: Shield,
    roles: [
      { value: 'ins_ethiniki', label: 'Εθνική Ασφαλιστική' },
      { value: 'ins_interamerican', label: 'Interamerican' },
      { value: 'ins_eurolife', label: 'Eurolife FFH' },
      { value: 'ins_allianz', label: 'Allianz Ελλάδα' },
      { value: 'ins_generali', label: 'Generali Ελλάδα' },
      { value: 'ins_ergo', label: 'ERGO Ασφαλιστική' },
      { value: 'ins_groupama', label: 'Groupama Ασφαλιστική' },
      { value: 'ins_nn', label: 'NN Hellas' },
      { value: 'ins_ydrogios', label: 'Υδρόγειος Ασφαλιστική' },
      { value: 'ins_interlife', label: 'Interlife' },
      { value: 'ins_agent', label: 'Ασφαλιστικός Σύμβουλος / Πράκτορας' },
      { value: 'ins_other', label: 'Άλλη Ασφαλιστική Εταιρεία' },
    ],
  },
  {
    id: 'real_estate', label: 'Μεσιτεία & Αξιολόγηση', color: 'var(--accent)', Icon: Building2,
    roles: [
      { value: 'agent', label: 'Μεσίτης Ακινήτων' },
      { value: 'appraiser', label: 'Εκτιμητής Ακινήτων' },
      { value: 'prop_mgmt', label: 'Εταιρεία Διαχείρισης' },
      { value: 'manager', label: 'Διαχειριστής Πολυκατοικίας' },
      { value: 'concierge', label: 'Θυρωρός / Concierge' },
    ],
  },
  {
    id: 'technical', label: 'Τεχνικοί & Μάστορες', color: 'var(--accent)', Icon: Wrench,
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
    id: 'outdoor', label: 'Εξωτερικοί Χώροι & Υπηρεσίες', color: 'var(--accent)', Icon: Trees,
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
    id: 'tenants', label: 'Ενοικιαστές & Γείτονες', color: 'var(--accent)', Icon: UserCheck,
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

// Οι έτοιμες ετικέτες έφυγαν. Ήταν «VIP», «Ακριβός», «Προσοχή», «Προβληματικός»:
// χαρακτηρισμοί ΠΡΟΣΩΠΩΝ που τους πρότεινε το ίδιο το app, δίπλα σε ονοματεπώνυμο
// και ΑΦΜ. Οι ετικέτες μένουν ως ελεύθερο κείμενο — τις γράφει ο χρήστης, για να
// φιλτράρει τη δική του λίστα, και κανείς δεν του υποβάλλει κρίση για τρίτον.

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
  afm: '', iban: '', iris: false, preferred: false, next_appointment: '',
  specialty: '', tags: [], avatar_url: '', notes_log: [], files: [],
  scope: 'property', scope_property_id: '',
}
const EMPTY_FORM = { full_name: '', role: 'other', phone: '', email: '', freeNotes: '', extra: { ...EMPTY_EXTRA } }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function daysUntil(d: string) { if (!d) return null; return athensDaysUntil(d) ?? 0 }
function isOverdue(d: string) { const n = daysUntil(d); return n !== null && n < 0 }
// HTML-escape any dynamic value interpolated into printable/PDF HTML written via document.write.

// ─── Input primitives ─────────────────────────────────────────────────────────
function Inp({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
}
function Txt({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...iStyle, height: 'auto', resize: 'vertical', lineHeight: 1.6 }} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
}
// Πεδίο ΜΕ ΤΟ «ΓΙΑΤΙ» ΤΟΥ, από το μητρώο. Αν το πεδίο δεν αφορά αυτόν τον χρήστη,
// δεν αποδίδεται καθόλου — δεν κλειδώνεται και δεν εμφανίζεται γκριζαρισμένο.
function CField({ d, required, children }: { d?: FieldDecision; required?: boolean; children: React.ReactNode }) {
  if (!d) return null
  return (
    <div>
      <FL>{d.label}{required || d.critical ? ' *' : ''}</FL>
      {children}
      {/* Κενό `why` δεν αποδίδει γραμμή. Πριν, ΚΑΘΕ πεδίο κουβαλούσε τη δική του
          πρόταση και τα μισά ξανάλεγαν την ετικέτα («Όνομα · Για να τον βρεις»):
          διπλάσιο ύψος φόρμας για μηδέν πληροφορία, και ύφος οδηγιών χρήσης αντί
          για εργαλείο. Μένουν μόνο όσες λένε συνέπεια που δεν μαντεύεται. */}
      {!d.selfEvident && d.why && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.45, marginTop: 6 }}>{d.why}</div>}
    </div>
  )
}
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{children}</label>
}
// ΕΔΩ ΗΤΑΝ ΤΟ AddressAutocomplete (52 γραμμές). Έστελνε ΚΑΘΕ πληκτρολόγηση του
// χρήστη σε τρίτο εξυπηρετητή (nominatim.openstreetmap.org) για να προτείνει
// διευθύνσεις: δηλαδή διευθύνσεις γραφείων τρίτων προσώπων έφευγαν εκτός της
// υποδομής μας, χωρίς να αναφέρεται πουθενά στην Πολιτική Απορρήτου, στην ίδια
// εφαρμογή που υπόσχεται στον χρήστη ότι ξέρει ποιος βλέπει τα δεδομένα του.
// Και η ίδια η πολιτική χρήσης του Nominatim απαγορεύει ρητά το autocomplete —
// σε παραγωγή η υπηρεσία θα μπλόκαρε και το πεδίο θα σταματούσε σιωπηλά.
// Το πεδίο είναι πλέον απλό κείμενο. Ο χάρτης ανοίγει με ρητό κλικ του χρήστη.

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
    <button type="button" onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 12, border: 'none', cursor: 'pointer', background: value ? colorOn : 'var(--border-default)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-surface)', boxShadow: '0 1px 4px rgba(0,0,0,0.35)', transition: 'left 0.18s' }} />
    </button>
  )
}
// Τα αστέρια αξιολόγησης και το «badge κατάστασης σχέσης» έφυγαν: ένα σκορ και μια
// ετικέτα «Προβληματικός» πάνω σε άνθρωπο, χωρίς καμία ενέργεια πίσω τους. Ό,τι
// χρειάζεται ο χρήστης το λένε τα γεγονότα — πληρωμές, παραστατικά, ραντεβού.

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
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
              {t}<button type="button" onClick={() => onChange(tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', padding: 0 }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add(input))} placeholder="Νέα ετικέτα…" style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={() => add(input)} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

// ─── Notes Log ────────────────────────────────────────────────────────────────
// Το «ανέβασμα φωτογραφίας επαφής» έφυγε από τη φόρμα: ήταν το ΠΡΩΤΟ πράγμα που
// έβλεπε ο χρήστης όταν καταχωρούσε υδραυλικό, και δεν κάνει τίποτα. Όσες επαφές
// έχουν ήδη φωτογραφία συνεχίζουν να τη δείχνουν στην κάρτα και στο ντοσιέ.

// ─── File Uploader ────────────────────────────────────────────────────────────
function FileUploader({ files, onChange, contactId }: { files: { name: string; url: string; size: string; uploaded: string }[]; onChange: (f: { name: string; url: string; size: string; uploaded: string }[]) => void; contactId?: string }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true)
    const { path, error } = await uploadUserScoped(supabase, 'avatars', `contact-files/${contactId || 'new'}/${Date.now()}.${file.name.split('.').pop()}`, file, { upsert: true })
    if (!error) {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      onChange([...files, { name: file.name, url: pub.publicUrl, size: file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`, uploaded: new Date().toISOString() }])
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = ''
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {files.length === 0 && <EmptyState icon={<FileText size={20} />} title="Κανένα αρχείο ακόμη" hint="Ανέβασε συμβόλαια, τιμολόγια ή φωτογραφίες που αφορούν αυτή την επαφή." />}
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <FileText size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{f.size} · {new Date(f.uploaded).toLocaleDateString('el-GR')}</div>
            </div>
            <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', padding: '4px 10px', borderRadius: T.radius.badge, border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', whiteSpace: 'nowrap' }}>Άνοιγμα</a>
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}><X size={15} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: T.radius.inner, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, width: '100%' }}>
        {uploading ? 'Ανέβασμα…' : '+ Προσθήκη Αρχείου (PDF, DOC, JPG, Excel)'}
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────
function QRCodeModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${contact.full_name}`, contact.phone ? `TEL:${contact.phone}` : '', contact.email ? `EMAIL:${contact.email}` : '', contact._extra?.website ? `URL:${contact._extra.website}` : '', 'END:VCARD'].filter(Boolean).join('\n')
  // QR τοπικά: η κάρτα επαφής (όνομα, τηλέφωνο, email) δεν φεύγει από τη συσκευή.
  const qrUrl = qrDataUrl(vcard, { size: 240 })
  return (
    <div role="dialog" aria-modal="true" aria-label="Αρχεία επαφής" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 36, width: '100%', maxWidth: 320, border: '1px solid var(--border-subtle)', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <QrCode size={28} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontFamily: T.font.sans, fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>QR Επαφής</h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 22 }}>Σάρωσε για να αποθηκεύσεις τα στοιχεία</p>
        <div style={{ padding: 12, background: '#ffffff', borderRadius: 14, border: '1px solid var(--border-subtle)', display: 'inline-block', marginBottom: 16 }}>
          <img src={qrUrl} alt="QR" style={{ width: 190, height: 190, borderRadius: 6, display: 'block' }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{contact.full_name}</div>
        {contact.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone}</div>}
        <button type="button" onClick={onClose} style={{ marginTop: 20, padding: '10px 28px', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, width: '100%' }}>Κλείσιμο</button>
      </div>
    </div>
  )
}

// ─── ΤΑΙΡΙΑΣΜΑ ΕΠΑΦΗΣ ↔ ΠΑΡΑΣΤΑΤΙΚΩΝ ─────────────────────────────────────────
// ΤΟ ΑΦΜ ΕΙΝΑΙ Ο ΣΥΝΔΕΣΜΟΣ. Το όνομα δεν είναι: ο «Παπαδόπουλος Υδραυλικός» δεν
// βρίσκει τη δαπάνη «Συντήρηση — Παπαδόπουλος», και η «ΔΕΗ Α.Ε.» δεν βρίσκει τη
// «ΔΕΗ». Το ΑΦΜ γράφεται μία φορά, είναι ένα, και υπάρχει και στα σαρωμένα έγγραφα
// (property_documents.provider_afm). Το ταίριασμα με ελεύθερο κείμενο μένει ΜΟΝΟ
// ως εφεδρεία για παλιές δαπάνες που δεν έχουν contact_id.
const digitsOf = (v?: string | null) => (v || '').replace(/\D/g, '')

/** Όλα τα παραστατικά αυτού του παρόχου, με ΑΦΜ. Αυτό ζητά ο λογιστής. */
async function fetchSupplierDocs(afm: string, propertyId: string) {
  if (digitsOf(afm).length !== 9) return []
  // Αμυντικά: αν η στήλη δεν υπάρχει ακόμη στη βάση, γυρνάμε κενό αντί να σκάσουμε.
  const { data, error } = await supabase
    .from('property_documents')
    .select('id,title,category,doc_date,issue_date,amount,file_path')
    .eq('property_id', propertyId).eq('provider_afm', digitsOf(afm))
    .order('doc_date', { ascending: false }).limit(50)
  if (error) return []
  return (data || []) as SupplierDoc[]
}
interface SupplierDoc { id: string; title: string | null; category: string | null; doc_date: string | null; issue_date: string | null; amount: number | null; file_path: string }

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ contact, propertyId, onClose }: { contact: Contact; propertyId: string; onClose: () => void }) {
  const [expenses, setExpenses] = useState<{ id: string; description: string; amount: number; date: string }[]>([])
  const [docs, setDocs] = useState<SupplierDoc[]>([])
  const [loading, setLoading] = useState(true)
  const afm = digitsOf(contact._extra?.afm)
  useEffect(() => {
    async function load() {
      setLoading(true)
      // 1) contact_id: το σωστό, για ό,τι καταχωρήθηκε μέσα από την επαφή.
      // 2) όνομα: εφεδρεία για παλιές δαπάνες, γι' αυτό και δεν είναι μόνη της.
      const nm = (contact.full_name || '').replace(/[,()*%\\]/g, ' ').trim()
      const filter = nm.length >= 3 ? `contact_id.eq.${contact.id},description.ilike.*${nm}*` : `contact_id.eq.${contact.id}`
      const [{ data }, d] = await Promise.all([
        supabase.from('expenses').select('id,description,amount,date').eq('property_id', propertyId).or(filter).order('date', { ascending: false }).limit(20),
        fetchSupplierDocs(afm, propertyId),
      ])
      setExpenses(data || []); setDocs(d); setLoading(false)
    }
    load()
  }, [contact.id, propertyId, contact.full_name, afm])
  const notesLog = contact._extra?.notes_log || []
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)
  const docsTotal = docs.reduce((s, d) => s + (d.amount || 0), 0)
  const timeline = [
    ...expenses.map(e => ({ date: e.date, title: e.description, sub: e.amount?.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' }), color: 'var(--text-secondary)' })),
    ...docs.map(d => ({ date: (d.issue_date || d.doc_date || '').slice(0, 10), title: d.title || d.category || 'Παραστατικό', sub: d.amount ? d.amount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' }) : 'Παραστατικό', color: 'var(--accent)' })),
    ...notesLog.map(n => ({ date: n.ts.split('T')[0], title: n.text, sub: 'Σημείωση', color: 'var(--accent)' })),
  ].filter(x => x.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)
  return (
    <div role="dialog" aria-modal="true" aria-label="Ιστορικό επαφής" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, width: '100%', maxWidth: 540, maxHeight: '85vh', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '22px 28px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ fontFamily: T.font.sans, fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Ιστορικό Συνεργασίας</h3><p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '3px 0 0' }}>{contact.full_name}</p></div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <><SkeletonKPIs n={3} />{[0, 1, 2].map(i => <Skeleton key={i} h={48} r={10} style={{ marginBottom: 12 }} />)}</>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginBottom: 24 }}>
                {[{ label: 'Συνολικές Δαπάνες', value: totalExpenses > 0 ? fe(totalExpenses) : fe(0), color: 'var(--text-primary)' },
                  { label: 'Παραστατικά με το ΑΦΜ του', value: docs.length > 0 ? `${docs.length}${docsTotal > 0 ? ' · ' + fe(docsTotal) : ''}` : (afm.length === 9 ? '0' : '—'), color: 'var(--text-primary)' },
                  { label: 'Σημειώσεις', value: notesLog.length > 0 ? `${notesLog.length}` : '—', color: 'var(--text-primary)' }].map(s => (
                  <div key={s.label} style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '14px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {afm.length !== 9 && (
                <div style={{ marginBottom: 18, padding: '11px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  Χωρίς ΑΦΜ, τα παραστατικά αυτού του παρόχου δεν συνδέονται με την επαφή: το ταίριασμα γίνεται με το όνομα και αστοχεί. Συμπλήρωσέ το μία φορά στην επεξεργασία της επαφής.
                </div>
              )}
              {timeline.length === 0 ? <EmptyState icon={<History size={20} />} title="Καμία κίνηση ακόμη" hint="Δαπάνες, παραστατικά με το ΑΦΜ του και σημειώσεις εμφανίζονται εδώ χρονολογικά." /> : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {timeline.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'color-mix(in srgb, ' + item.color + ' 14%, transparent)', border: '1px solid color-mix(in srgb, ' + item.color + ' 34%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} /></div>
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
  const html = `<html><head><title>${esc(contact.full_name)}</title><style>body{font-family:Inter,sans-serif;padding:40px;max-width:420px;margin:0 auto;color:#111}h1{font-size:22px;margin:0 0 2px}p{margin:3px 0;font-size:13px;color:#555}.cat{font-size:11px;color:${meta.groupColor};font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}.role{font-size:13px;color:#444;margin-bottom:6px}.status{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-bottom:14px}.row{display:flex;gap:6px;align-items:flex-start;margin:5px 0;font-size:13px;color:#333}.label{min-width:80px;color:#888;font-size:11px;text-transform:uppercase;padding-top:1px}.tag{padding:2px 8px;border-radius:20px;background:#f3f4f6;font-size:11px}hr{border:none;border-top:1px solid #eee;margin:14px 0}.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px}</style></head><body>
    <div class="cat">${esc(meta.groupLabel)}</div>
    <h1>${esc(contact.full_name)}</h1>
    <div class="role">${esc(meta.label)}</div>
    <hr>
    ${contact.phone ? `<div class="row"><span class="label">Τηλέφωνο</span><span>${esc(contact.phone)}${extra.whatsapp ? '<span class="badge" style="background:#dcfce7;color:#166534">WA</span>' : ''}${extra.viber ? '<span class="badge" style="background:#ede9fe;color:#5b21b6">VB</span>' : ''}</span></div>` : ''}
    ${extra.phone2 ? `<div class="row"><span class="label">2ο Τηλέφωνο</span><span>${esc(extra.phone2)}</span></div>` : ''}
    ${contact.email ? `<div class="row"><span class="label">Ηλεκτρονικό ταχυδρομείο</span><span>${esc(contact.email)}</span></div>` : ''}
    ${extra.website ? `<div class="row"><span class="label">Ιστοσελίδα</span><span>${esc(extra.website)}</span></div>` : ''}
    ${extra.office_address ? `<div class="row"><span class="label">Διεύθυνση</span><span>${esc(extra.office_address)}</span></div>` : ''}
    ${extra.afm ? `<div class="row"><span class="label">ΑΦΜ</span><span>${esc(extra.afm)}</span></div>` : ''}
    ${extra.iban ? `<div class="row"><span class="label">IBAN</span><span style="font-family:monospace">${esc(extra.iban)}${extra.iris ? '<span class="badge" style="background:#fef3c7;color:#92400e">IRIS</span>' : ''}</span></div>` : ''}
    ${(extra.tags || []).length > 0 ? `<div style="margin-top:12px">${(extra.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>` : ''}
    ${contact._freeNotes ? `<hr><p style="line-height:1.6">${esc(contact._freeNotes)}</p>` : ''}
    <hr><p style="font-size:10px;color:#bbb">${branding?.companyName ? brandName(branding)+' · ' : 'Property OS · '}${esc(new Date().toLocaleDateString('el-GR'))}</p></body></html>`
  const win = window.open('', '_blank'); if (win) { win.document.write(html); win.document.close(); win.print() }
}

// ─── Quick Modals ─────────────────────────────────────────────────────────────
function QuickExpenseModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState(contact.full_name); const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!amount) return
    setSaving(true)
    const ok = await saved('Η δαπάνη δεν αποθηκεύτηκε', supabase.from('expenses').insert({ property_id: propertyId, user_id: userId, contact_id: contact.id, amount: parseFloat(amount), description, date: athensToday(), category: 'Αμοιβές Συνεργατών' }))
    setSaving(false)
    if (!ok) return
    onSaved(); onClose()
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Εκτύπωση καρτέλας" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 440, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Receipt size={18} color="var(--accent)" /></div>
          <div><h3 style={{ fontFamily: T.font.sans, fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Νέα Δαπάνη</h3><p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{contact.full_name}</p></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Ποσό (€)</FL><Inp value={amount} onChange={setAmount} placeholder="Παράδειγμα: 150" type="number" /></div>
          <div><FL>Περιγραφή</FL><Inp value={description} onChange={setDescription} placeholder="Περιγραφή εργασίας" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving || !amount} style={{ flex: 2, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση Δαπάνης'}</button>
        </div>
      </div>
    </div>
  )
}
function QuickCalendarModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: (date: string) => void }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const [title, setTitle] = useState('Ραντεβού με ' + contact.full_name); const [date, setDate] = useState(tomorrow.toISOString().split('T')[0]); const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!title || !date) return
    setSaving(true)
    const ok = await saved('Το ραντεβού δεν αποθηκεύτηκε', supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title, event_date: date, category: 'tenant', priority: 'medium', status: 'pending', recurring: false, source: 'manual' }))
    setSaving(false)
    if (!ok) return
    onSaved(date); onClose()
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Κωδικός QR επαφής" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 32, width: '100%', maxWidth: 440, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalendarPlus size={18} color="var(--accent)" /></div>
          <div><h3 style={{ fontFamily: T.font.sans, fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Νέο Ραντεβού</h3><p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{contact.full_name}</p></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><FL>Τίτλος</FL><Inp value={title} onChange={setTitle} placeholder="Τίτλος ραντεβού" /></div>
          <div><FL>Ημερομηνία</FL><DatePicker value={date} onChange={v => setDate(v)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
          <button type="button" onClick={save} disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Αποθήκευση…' : 'Προσθήκη στο Ημερολόγιο'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Excel Export (SheetJS, ίδιο μοτίβο με τα υπόλοιπα φύλλα) ───────────────
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
  const withAfm = contacts.filter(c => c._extra?.afm).length

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
    ['Με ΑΦΜ (ταιριάζουν με παραστατικά)', withAfm],
    [''],
    ['ΚΑΤΑΝΟΜΗ ΑΝΑ ΚΑΤΗΓΟΡΙΑ', '', ''],
    ['Κατηγορία', 'Αριθμός Επαφών', 'Ποσοστό %'],
    ...GROUPS.filter(g => byGroup[g.id]).map(g => [
      g.label,
      byGroup[g.id] || 0,
      Math.round(((byGroup[g.id] || 0) / contacts.length) * 1000) / 10,
    ]),
    ['ΣΥΝΟΛΟ', contacts.length, 100],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 36 }, { wch: 18 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Σύνοψη')

  // ── Sheet 2: Αναλυτικές Επαφές ─────────────────────────────────────────
  const headers = [
    'Ονοματεπώνυμο', 'Κατηγορία', 'Ρόλος',
    'Κύριο Τηλέφωνο', 'WhatsApp', 'Viber', 'Κινητό', 'Ηλεκτρονικό ταχυδρομείο',
    'Ιστοσελίδα', 'Διεύθυνση Γραφείου',
    'ΑΦΜ', 'IBAN', 'IRIS',
    'Επόμενο Ραντεβού',
    'Ετικέτες', 'Αρχεία', 'Ελεύθερες Σημειώσεις', 'Σημειώσεις (log)',
  ]
  const detailRows: (string | number)[][] = [headers]

  GROUPS.forEach(g => {
    const grpContacts = contacts.filter(c => ROLE_META[c.role]?.groupId === g.id)
    if (grpContacts.length === 0) return
    detailRows.push([g.label, `${grpContacts.length} επαφές`, ...Array(headers.length - 2).fill('')])
    grpContacts.sort((a, b) => a.full_name.localeCompare(b.full_name, 'el')).forEach(c => {
      const ex = c._extra || {}
      detailRows.push([
        c.full_name,
        ROLE_META[c.role]?.groupLabel || '',
        ROLE_META[c.role]?.label || c.role,
        c.phone || '',
        ex.whatsapp ? 'ΝΑΙ' : 'ΟΧΙ',
        ex.viber ? 'ΝΑΙ' : 'ΟΧΙ',
        ex.phone2 || '',
        c.email || '',
        ex.website || '',
        ex.office_address || '',
        ex.afm || '',
        ex.iban || '',
        ex.iris ? 'ΝΑΙ' : 'ΟΧΙ',
        ex.next_appointment ? new Date(ex.next_appointment + 'T00:00:00').toLocaleDateString('el-GR') : '',
        (ex.tags || []).join('; '),
        (ex.files || []).length,
        c._freeNotes || '',
        (ex.notes_log || []).map((n: {ts: string; text: string}) => `[${new Date(n.ts).toLocaleDateString('el-GR')}] ${n.text}`).join(' | '),
      ])
    })
    detailRows.push(Array(headers.length).fill(''))
  })

  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2['!cols'] = [
    { wch: 26 }, { wch: 22 }, { wch: 22 },
    { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 26 },
    { wch: 22 }, { wch: 22 },
    { wch: 12 }, { wch: 28 }, { wch: 9 },
    { wch: 16 },
    { wch: 26 }, { wch: 8 }, { wch: 32 }, { wch: 48 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, 'Αναλυτικές Επαφές')

  // ── Sheet 3: Κατάλογος Επαφών (ταχεία αναφορά) ─────────────────────────
  const dirHeaders = ['Ονοματεπώνυμο', 'Ρόλος', 'Τηλέφωνο', 'Ηλεκτρονικό ταχυδρομείο', 'ΑΦΜ', 'WhatsApp', 'IRIS']
  const dirRows: (string | number)[][] = [dirHeaders]
  contacts
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'el'))
    .forEach(c => {
      const ex = c._extra || {}
      dirRows.push([
        c.full_name,
        ROLE_META[c.role]?.label || c.role,
        c.phone || ABSENT,
        c.email || ABSENT,
        ex.afm || ABSENT,
        ex.whatsapp ? 'WA' : '',
        ex.iris ? 'IRIS' : '',
      ])
    })
  const ws3 = XLSX.utils.aoa_to_sheet(dirRows)
  ws3['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 6 }]
  XLSX.utils.book_append_sheet(wb, ws3, 'Κατάλογος')

  XLSX.writeFile(wb, `επαφες_${athensToday()}.xlsx`)
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportContactsPDF(contacts: Contact[], branding?: ReportBranding | null) {
  const preferred = contacts.filter(c => c._extra?.preferred)
  const byGroup: Record<string, Contact[]> = {}
  contacts.forEach(c => {
    const g = ROLE_META[c.role]?.groupId || 'tenants'
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(c)
  })

  // Διακριτικοί, ΑΣΠΡΟΜΑΥΡΟΙ δείκτες (WA/VB/IRIS): κείμενο, χωρίς χρώμα.
  const mark = (on: boolean | undefined, text: string) =>
    on ? ` <span class="muted" style="font-size:9px;font-weight:600">${rEsc(text)}</span>` : ''

  const kpis = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">`
    + reportKpi('Σύνολο επαφών', String(contacts.length))
    + reportKpi('Προτιμώμενες', String(preferred.length))
    + reportKpi('WhatsApp', String(contacts.filter(c => c._extra?.whatsapp).length))
    + reportKpi('Viber', String(contacts.filter(c => c._extra?.viber).length))
    + reportKpi('Με IBAN', String(contacts.filter(c => c._extra?.iban).length))
    + reportKpi('Με ΑΦΜ', String(contacts.filter(c => c._extra?.afm).length))
    + `</div>`

  const preferredSection = preferred.length
    ? reportSection('Προτιμώμενες επαφές')
      + `<table><thead><tr><th>Ονοματεπώνυμο</th><th>Τηλέφωνο</th><th>Ηλεκτρονικό ταχυδρομείο</th></tr></thead><tbody>`
      + preferred.map(c => {
          const role = ROLE_META[c.role]?.label || c.role
          return `<tr>`
            + `<td><div style="font-weight:600;color:#111">${rEsc(c.full_name)}</div>`
            +   `<div class="muted" style="font-size:10px">${rEsc(role)}</div></td>`
            + `<td class="tnum">${c.phone ? rEsc(c.phone) : '—'}</td>`
            + `<td>${rEsc(c.email || ABSENT)}</td>`
            + `</tr>`
        }).join('')
      + `</tbody></table>`
    : ''

  const groupSections = GROUPS.filter(g => byGroup[g.id]?.length).map(g => {
    const rows = byGroup[g.id].map(c => {
      const ex = c._extra || {}
      const role = ROLE_META[c.role]?.label || c.role
      const iban = ex.iban ? `···${rEsc(ex.iban.slice(-4))}${mark(ex.iris, 'IRIS')}` : '—'
      return `<tr>`
        + `<td><div style="font-weight:600;color:#111">${rEsc(c.full_name)}</div>`
        +   `<div class="muted" style="font-size:10px">${rEsc(role)}</div></td>`
        + `<td class="tnum">${c.phone ? rEsc(c.phone) : '—'}${mark(ex.whatsapp, 'WA')}${mark(ex.viber, 'VB')}</td>`
        + `<td>${rEsc(c.email || ABSENT)}</td>`
        + `<td class="tnum">${ex.afm ? rEsc(ex.afm) : '—'}</td>`
        + `<td class="tnum">${iban}</td>`
        + `</tr>`
    }).join('')
    return reportSection(`${g.label} · ${byGroup[g.id].length} επαφές`)
      + `<table><thead><tr>`
      +   `<th>Ονοματεπώνυμο</th><th>Τηλέφωνο</th><th>Ηλεκτρονικό ταχυδρομείο</th>`
      +   `<th>ΑΦΜ</th><th>IBAN</th>`
      + `</tr></thead><tbody>${rows}</tbody></table>`
  }).join('')

  const title = 'Κατάσταση Επαφών'
  const html = reportHead(title)
    + `<body><div class="page">`
    + reportHeader(branding, 'Κατάλογος επαφών', { rightNote: `${contacts.length} επαφές` })
    + `<h1>${rEsc(title)}</h1>`
    + `<div class="sub">Κατάλογος συνεργατών, παρόχων και υπηρεσιών ακινήτου</div>`
    + reportSection('Σύνοψη')
    + kpis
    + preferredSection
    + groupSections
    + reportDisclaimer('Ο κατάλογος περιλαμβάνει τις καταχωρημένες επαφές του ακινήτου. Τα στοιχεία επικοινωνίας παρέχονται για ενημερωτική και οργανωτική χρήση.', branding)
    + `</div></body></html>`

  openReport(html)
}

// ─── Select Box ───────────────────────────────────────────────────────────────
// Premium custom checkbox (αντικαθιστά το browser default). Υποστηρίζει
// indeterminate για το «κύριο» κουτί επιλογής όλων.
function SelectBox({ checked, indeterminate, onToggle, size = 19 }: { checked: boolean; indeterminate?: boolean; onToggle?: () => void; size?: number }) {
  const on = checked || indeterminate
  const [foc, setFoc] = useState(false)
  const ring = on ? '0 1px 5px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none'
  return (
    <span role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} tabIndex={0}
      onClick={e => { e.stopPropagation(); onToggle?.() }}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle?.() } }}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--accent)' : 'var(--bg-elevated)', border: '1.5px solid ' + (on ? 'var(--accent)' : 'var(--border-default)'), color: 'var(--accent-text)', cursor: 'pointer', outline: 'none', transition: 'background .15s, border-color .15s, box-shadow .15s', boxShadow: foc ? '0 0 0 3px var(--accent-soft)' + (ring !== 'none' ? ', ' + ring : '') : ring }}>
      {indeterminate ? <Minus size={size - 7} strokeWidth={3.2} /> : checked ? <Check size={size - 7} strokeWidth={3.2} /> : null}
    </span>
  )
}

// ─── Bulk Action Button ───────────────────────────────────────────────────────
// Ουδέτερο κουμπί (Google-clean) που αποκαλύπτει accent —ή κόκκινο για διαγραφή—
// μόνο στο hover. Γίνεται ανενεργό/ξεθωριασμένο όταν δεν υπάρχει επιλογή.
function BulkBtn({ icon: Icon, label, onClick, disabled, danger }: { icon: ElementType; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  const [hov, setHov] = useState(false)
  const active = hov && !disabled
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: T.font.sans, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        border: '1px solid ' + (active ? (danger ? 'var(--negative-border)' : 'var(--accent-border)') : 'var(--border-subtle)'),
        background: active ? (danger ? 'var(--negative-soft)' : 'var(--accent-soft)') : 'var(--bg-elevated)',
        color: active ? (danger ? 'var(--negative)' : 'var(--accent)') : 'var(--text-secondary)',
        transition: 'background .15s, border-color .15s, color .15s' }}>
      <Icon size={14} />{label}
    </button>
  )
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({ contact, onOpen, onEdit, onDelete, onQuickExpense, onQuickCalendar, onShowHistory, onShowQR, selected, onSelect, bulkMode, branding, scopeLabel, scopePortfolio }: {
  contact: Contact; onOpen?: () => void; onEdit: () => void; onDelete: () => void
  onQuickExpense: () => void; onQuickCalendar: () => void; onShowHistory: () => void; onShowQR: () => void
  selected?: boolean; onSelect?: () => void; bulkMode?: boolean; branding?: ReportBranding | null
  scopeLabel?: string | null; scopePortfolio?: boolean
}) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: 'var(--text-tertiary)', GroupIcon: Users, groupLabel: '' }
  const extra = contact._extra || {}
  const initials = initialsOf(contact.full_name)
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
  const GroupIcon = meta.GroupIcon || Users

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={bulkMode ? onSelect : undefined}
      style={{ background: selected ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface))' : 'var(--bg-surface)', border: '1.5px solid ' + (selected ? 'var(--accent)' : hov ? 'var(--accent-border)' : overdue ? 'var(--negative-border)' : 'var(--border-subtle)'), borderRadius: T.radius.card, padding: bulkMode ? '18px 18px 16px 46px' : '18px 18px 16px', position: 'relative', boxShadow: selected ? '0 0 0 3px var(--accent-soft)' : hov ? '0 6px 24px rgba(0,0,0,0.18)' : 'none', transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s', cursor: bulkMode ? 'pointer' : 'default' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: overdue ? 'var(--negative)' : 'var(--border-subtle)', borderRadius: '16px 0 0 16px', opacity: bulkMode ? 0 : 1 }} />
      {bulkMode && <div style={{ position: 'absolute', top: 17, left: 15, zIndex: 2 }}><SelectBox checked={!!selected} onToggle={onSelect} /></div>}
      {overdue && <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--negative)', color: 'var(--text-inverse)', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: '0 16px 0 8px', letterSpacing: '0.07em' }}>ΛΗΞΗ ΡΑΝΤΕΒΟΥ</div>}
      {(hov || showActions) && !bulkMode && (
        <div ref={actionsRef} style={{ position: 'absolute', top: 12, right: 12, zIndex: 20 }}>
          {/* Ορατές μόνο οι πιο συχνές ενέργειες — όλες οι υπόλοιπες μπαίνουν στο «···» */}
          <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
            {contact.phone && <QuickAct as="a" href={'tel:' + contact.phone} title="Κλήση"><Phone size={13} /></QuickAct>}
            {extra.whatsapp && contact.phone && <QuickAct as="a" href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" title="WhatsApp" label="WA" />}
            {extra.viber && contact.phone && <QuickAct as="a" href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} title="Viber" label="VB" />}
            {contact.email && <QuickAct as="a" href={'mailto:' + contact.email} title="Ηλεκτρονικό ταχυδρομείο"><Mail size={13} /></QuickAct>}
            <QuickAct as="button" onClick={() => setShowActions(s => !s)} title="Περισσότερες ενέργειες"><span style={{ fontSize: 17, fontWeight: 700, lineHeight: 0, marginTop: -5 }}>···</span></QuickAct>
          </div>
          {showActions && (
            <div role="menu" style={{ position: 'absolute', top: 38, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '6px', minWidth: 210, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
              {[
                { Icon: Pencil, label: 'Επεξεργασία', onClick: onEdit, color: 'var(--text-secondary)' },
                { Icon: Receipt, label: 'Νέα Δαπάνη', onClick: onQuickExpense, color: 'var(--text-secondary)' },
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
      <div style={{ paddingLeft: 10, pointerEvents: bulkMode ? 'none' : undefined }}>
        <div onClick={() => onOpen && !bulkMode && onOpen()} style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 12, paddingRight: (hov || showActions) ? 100 : 0, transition: 'padding-right 0.15s', cursor: onOpen && !bulkMode ? 'pointer' : 'default' }}>
          {extra.avatar_url ? <img src={extra.avatar_url} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-border)', flexShrink: 0 }} />
            : <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--accent-soft)', border: '2px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{initials || <GroupIcon size={20} />}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font.sans, marginBottom: 1 }}>{contact.full_name}</div>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><GroupIcon size={11} style={{ flexShrink: 0 }} />{meta.label || contact.role}</div>
            {extra.specialty && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extra.specialty}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {extra.preferred && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700 }}>Προτιμώμενη</span>}
          {scopeLabel && (
            <span title={scopePortfolio ? 'Ισχύει για όλο το χαρτοφυλάκιο' : 'Ανήκει σε συγκεκριμένο ακίνητο'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: scopePortfolio ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: '1px solid ' + (scopePortfolio ? 'var(--accent-border)' : 'var(--border-subtle)'), color: scopePortfolio ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scopePortfolio ? <Globe size={10} style={{ flexShrink: 0 }} /> : <Building2 size={10} style={{ flexShrink: 0 }} />}{scopeLabel}
            </span>
          )}
        </div>
        {(extra.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {(extra.tags || []).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{t}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {contact.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone}</span>
              {extra.whatsapp && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: 9, color: 'var(--accent)', fontWeight: 800, background: 'var(--accent-soft)', padding: '1px 5px', borderRadius: 6 }}>WA</a>}
              {extra.viber && <a href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} style={{ textDecoration: 'none', fontSize: 9, color: 'var(--accent)', fontWeight: 800, background: 'var(--accent-soft)', padding: '1px 5px', borderRadius: 6 }}>VB</a>}
            </div>
          )}
          {extra.phone2 && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{extra.phone2}</span><span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>2ο</span></div>}
          {contact.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}><Mail size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span></div>}
          {extra.website && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.website}</span></div>}
          {extra.office_address && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{extra.office_address}</span></div>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {extra.afm && <span title="Αριθμός Φορολογικού Μητρώου" style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>ΑΦΜ {extra.afm}</span>}
          {extra.iban && <span title="Διεθνής Αριθμός Τραπεζικού Λογαριασμού (IBAN)" style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>IBAN ···{extra.iban.slice(-4)}{extra.iris && <span title="Σύστημα άμεσων πληρωμών σε πραγματικό χρόνο (IRIS)" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginLeft: 4 }}>IRIS</span>}</span>}
          {extra.next_appointment && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: overdue ? 'var(--negative-soft)' : 'var(--accent-soft)', border: '1px solid ' + (overdue ? 'var(--negative-border)' : 'var(--accent-border)'), color: overdue ? 'var(--negative)' : 'var(--accent)' }}>{overdue ? `Ραντεβού ${Math.abs(dueDays || 0)} ημέρες πριν` : `Ραντεβού ${fmtDate(extra.next_appointment)}`}</span>}
          {(extra.notes_log || []).length > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{(extra.notes_log || []).length} σημειώσεις</span>}
          {(extra.files || []).length > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{(extra.files || []).length} αρχεία</span>}
        </div>
        {contact._freeNotes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderRadius: T.radius.badge, padding: '7px 11px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{contact._freeNotes}</div>}
      </div>
    </div>
  )
}

// ─── Κουμπί επικοινωνίας (ανάγλυφο, με hover-lift) ──────────────────────────────
function CommButton({ label, Icon, href, target, accent }: { label: string; Icon: React.ComponentType<{ size?: number }>; href: string; target?: string; accent?: boolean }) {
  const [h, setH] = useState(false)
  return (
    <a href={href} target={target} rel={target ? 'noopener noreferrer' : undefined}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 6px', borderRadius: 14, cursor: 'pointer', textDecoration: 'none', fontFamily: T.font.sans, background: accent ? 'var(--accent)' : 'var(--bg-surface)', color: accent ? 'var(--accent-text)' : 'var(--text-primary)', border: '1px solid ' + (accent ? 'transparent' : 'var(--border-subtle)'), boxShadow: h ? '0 10px 26px rgba(0,0,0,0.26)' : '0 2px 8px rgba(0,0,0,0.12)', transform: h ? 'translateY(-3px)' : 'none', transition: 'transform .18s cubic-bezier(.2,0,0,1), box-shadow .18s' }}>
      <Icon size={19} /><span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
    </a>
  )
}

// ─── Premium action tile (κενή κατάσταση) — Apple/Google αισθητική ─────────────
function ContactActionTile({ Icon, label, sub, onClick, primary }: { Icon: React.ComponentType<{ size?: number }>; label: string; sub?: string; onClick: () => void; primary?: boolean }) {
  const [h, setH] = useState(false)
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: 150, padding: '22px 14px', borderRadius: 18, cursor: 'pointer', fontFamily: T.font.sans, textAlign: 'center', background: primary ? 'var(--accent)' : 'var(--bg-surface)', color: primary ? 'var(--accent-text)' : 'var(--text-primary)', border: '1px solid ' + (primary ? 'transparent' : 'var(--border-subtle)'), boxShadow: h ? '0 16px 36px rgba(0,0,0,0.22)' : '0 2px 10px rgba(0,0,0,0.10)', transform: h ? 'translateY(-4px)' : 'none', transition: 'transform .2s cubic-bezier(.2,0,0,1), box-shadow .2s' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: primary ? 'rgba(255,255,255,0.18)' : 'var(--accent-soft)', color: primary ? 'var(--accent-text)' : 'var(--accent)' }}><Icon size={23} /></div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.72, marginTop: 3 }}>{sub}</div>}
      </div>
    </button>
  )
}

// ─── Contact Dossier (πλήρες προφίλ επαφής, slide-in) ───────────────────────────
// Το `notify` ΔΕΝ είναι πλέον prop: ερχόταν από τον γονέα ως τοπικό showToast και
// σκίαζε το κοινό `notify` του '@/components/Toast'. Επειδή το όνομα είναι ίδιο,
// αν έμενε το prop ο κώδικας θα μεταγλωττιζόταν κανονικά ενώ θα συνέχιζε να καλεί
// τον παλιό, ιδιωτικό υποδοχέα — σιωπηλή αποτυχία της ενοποίησης.
function ContactDossier({ contact, propertyId, onClose, onEdit, onDelete, onQuickExpense, onQuickCalendar, onShowHistory, onShowQR, onVcard, branding, refreshKey }: {
  contact: Contact; propertyId: string; onClose: () => void; onEdit: () => void; onDelete: () => void
  onQuickExpense: () => void; onQuickCalendar: () => void; onShowHistory: () => void; onShowQR: () => void; onVcard: () => void
  branding?: ReportBranding | null; refreshKey?: number
}) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: 'var(--text-tertiary)', GroupIcon: Users, groupLabel: '' }
  const extra = contact._extra || {}
  const initials = initialsOf(contact.full_name)
  const GroupIcon = meta.GroupIcon || Users
  const digits = (p?: string | null) => { const d = (p || '').replace(/\D/g, ''); return d.length === 10 ? '30' + d : d }
  const site = extra.website ? (/^https?:\/\//.test(extra.website) ? extra.website : 'https://' + extra.website) : ''
  const mapLink = extra.office_address ? 'https://maps.google.com/maps?q=' + encodeURIComponent(extra.office_address) : ''
  const copy = (t: string, label: string) => { try { navigator.clipboard.writeText(t); notify(label + ' αντιγράφηκε') } catch { /* ignore */ } }
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  // Σύνδεση με δαπάνες: σύνολο + πλήθος πληρωμών προς αυτόν τον επαγγελματία.
  const [exp, setExp] = useState<{ total: number; count: number; docs: number }>({ total: 0, count: 0, docs: 0 })
  const afm = digitsOf(extra.afm)
  useEffect(() => {
    let live = true
    // Ταιριάζει με contact_id (νέες δαπάνες) ή με το όνομα στην περιγραφή (παλιές),
    // ΚΑΙ με το ΑΦΜ για τα σαρωμένα παραστατικά του ίδιου παρόχου.
    const nm = (contact.full_name || '').replace(/[,()*%\\]/g, ' ').trim()
    const filter = nm.length >= 3 ? `contact_id.eq.${contact.id},description.ilike.*${nm}*` : `contact_id.eq.${contact.id}`
    Promise.all([
      supabase.from('expenses').select('amount').eq('property_id', propertyId).or(filter),
      fetchSupplierDocs(afm, propertyId),
    ]).then(([{ data }, docs]) => {
      if (!live || !data) return
      setExp({ total: data.reduce((s: number, e: { amount: number }) => s + (e.amount || 0), 0), count: data.length, docs: docs.length })
    })
    return () => { live = false }
  }, [contact.id, contact.full_name, propertyId, refreshKey, afm])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [onClose])


  return (
    <div role="dialog" aria-modal="true" aria-label="Καρτέλα επαφής" onClick={onClose} style={{ position: 'fixed', inset: 0, background: T.scrim, zIndex: 900, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(100%, 460px)', height: '100%', background: 'var(--bg-base)', borderLeft: '1px solid var(--border-subtle)', boxShadow: '-24px 0 80px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'dossierIn .28s cubic-bezier(.2,0,0,1)' }}>
        <style>{`@keyframes dossierIn{from{transform:translateX(44px);opacity:.5}to{transform:none;opacity:1}} .dsr-act:hover{border-color:var(--accent-border);background:var(--accent-soft);color:var(--accent)} .dsr-del{border:1px solid var(--border-subtle);background:var(--bg-elevated);color:var(--text-secondary)} .dsr-del:hover{border-color:var(--negative);color:var(--negative);background:var(--negative-soft)}`}</style>

        <div style={{ position: 'relative', padding: '22px 22px 20px', background: 'linear-gradient(155deg, var(--accent-soft), transparent 66%)', borderBottom: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, width: T.h.sm, height: T.h.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            {extra.avatar_url
              ? <img src={extra.avatar_url} alt="" style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-border)', boxShadow: '0 6px 18px rgba(0,0,0,0.25)', flexShrink: 0 }} />
              : <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--accent-soft)', border: '3px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: 'var(--accent)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)', flexShrink: 0 }}>{initials || <GroupIcon size={26} />}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15 }}>{contact.full_name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}><GroupIcon size={13} />{meta.label || contact.role}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {extra.preferred && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700 }}>Προτιμώμενη</span>}
              </div>
            </div>
          </div>
          {extra.specialty && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>{extra.specialty}</div>}
        </div>

        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(78px,1fr))', gap: 9, borderBottom: '1px solid var(--border-subtle)' }}>
          {contact.phone && <CommButton label="Κλήση" Icon={Phone} href={'tel:' + contact.phone} accent />}
          {contact.phone && <CommButton label="WhatsApp" Icon={MessageSquare} href={'https://wa.me/' + digits(contact.phone)} target="_blank" />}
          {contact.phone && <CommButton label="Viber" Icon={Phone} href={'viber://chat?number=' + digits(contact.phone)} />}
          {contact.email && <CommButton label="Ηλεκτρονικό ταχυδρομείο" Icon={Mail} href={'mailto:' + contact.email} />}
          {site && <CommButton label="Ιστοσελίδα" Icon={Globe} href={site} target="_blank" />}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(exp.count > 0 || exp.docs > 0) && (
            <button type="button" onClick={onShowHistory} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', fontFamily: T.font.sans }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Πληρωμές</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{fe(exp.total)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{exp.count} {exp.count === 1 ? 'καταχώρηση' : 'καταχωρήσεις'}{exp.docs > 0 ? ` · ${exp.docs} ${exp.docs === 1 ? 'παραστατικό' : 'παραστατικά'} με το ΑΦΜ του` : ''}</div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>Πλήρες ιστορικό ›</span>
            </button>
          )}

          {(contact.phone || extra.phone2 || contact.email || extra.office_address) && (
            <DossierSection title="Στοιχεία επικοινωνίας">
              {contact.phone && <DossierRow icon={Phone} onCopy={() => copy(contact.phone!, 'Το τηλέφωνο')}><span style={{ fontFamily: T.font.mono }}>{contact.phone}</span></DossierRow>}
              {extra.phone2 && <DossierRow icon={Phone} onCopy={() => copy(extra.phone2!, 'Το τηλέφωνο')}><span style={{ fontFamily: T.font.mono }}>{extra.phone2}</span> <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>δεύτερο</span></DossierRow>}
              {contact.email && <DossierRow icon={Mail} onCopy={() => copy(contact.email!, 'Το email')}>{contact.email}</DossierRow>}
              {extra.office_address && <DossierRow icon={MapPin}>{extra.office_address}</DossierRow>}
            </DossierSection>
          )}

          {/* Ο χάρτης ΔΕΝ φορτώνεται μόνος του. Το iframe έστελνε τη διεύθυνση
              γραφείου τρίτου προσώπου στην Google με το που άνοιγε το ντοσιέ, χωρίς
              ο χρήστης να ζητήσει χάρτη. Τώρα ανοίγει με ρητό κλικ, σε νέα καρτέλα. */}
          {mapLink && (
            <a href={mapLink} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 13, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <MapPin size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>Άνοιγμα διεύθυνσης στον χάρτη</span>
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>›</span>
            </a>
          )}

          {(extra.afm || extra.iban) && (
            <DossierSection title="Επαγγελματικά και πληρωμές">
              {extra.afm && <DossierRow icon={FileText} onCopy={() => copy(extra.afm!, 'Το ΑΦΜ')}><span title="Αριθμός Φορολογικού Μητρώου">ΑΦΜ</span> <span style={{ fontFamily: T.font.mono }}>{extra.afm}</span></DossierRow>}
              {extra.iban && <DossierRow icon={Landmark} onCopy={() => copy(extra.iban!, 'Το IBAN')}><span style={{ fontFamily: T.font.mono, fontSize: 12 }}>{extra.iban}</span>{extra.iris && <span title="Σύστημα άμεσων πληρωμών σε πραγματικό χρόνο (IRIS)" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>IRIS</span>}</DossierRow>}
            </DossierSection>
          )}

          {extra.next_appointment && (
            <DossierSection title="Παρακολούθηση">
              <DossierRow icon={CalendarPlus}><span style={{ color: overdue ? 'var(--negative)' : 'var(--text-secondary)' }}>Επόμενο ραντεβού: {fmtDate(extra.next_appointment)}{overdue ? ' (ληξιπρόθεσμο)' : ''}</span></DossierRow>
            </DossierSection>
          )}

          {(extra.tags || []).length > 0 && (
            <DossierSection title="Ετικέτες">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(extra.tags || []).map(t => <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{t}</span>)}
              </div>
            </DossierSection>
          )}

          {(contact._freeNotes || (extra.notes_log || []).length > 0) && (
            <DossierSection title="Σημειώσεις">
              {contact._freeNotes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{contact._freeNotes}</div>}
              {(extra.notes_log || []).map(n => (
                <div key={n.id} style={{ borderLeft: '2px solid var(--border-default)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{fmtDate(n.ts)}</div>
                </div>
              ))}
            </DossierSection>
          )}

          {(extra.files || []).length > 0 && (
            <DossierSection title="Αρχεία">
              {(extra.files || []).map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <FileText size={14} color="var(--text-tertiary)" />{f.name}
                </a>
              ))}
            </DossierSection>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, paddingTop: 16, marginTop: 2, borderTop: '1px solid var(--border-subtle)' }}>
            {[
              { Icon: Pencil, label: 'Επεξεργασία', onClick: onEdit },
              { Icon: Receipt, label: 'Δαπάνη', onClick: onQuickExpense },
              { Icon: CalendarPlus, label: 'Ραντεβού', onClick: onQuickCalendar },
              { Icon: History, label: 'Ιστορικό', onClick: onShowHistory },
              { Icon: QrCode, label: 'QR', onClick: onShowQR },
              { Icon: FileText, label: 'vCard', onClick: onVcard },
              { Icon: Printer, label: 'Εκτύπωση', onClick: () => printContactCard(contact, branding) },
            ].map((a, i) => (
              <button key={i} type="button" onClick={a.onClick} className="dsr-act" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 62, padding: '10px 4px', borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'background .15s, border-color .15s, color .15s' }}>
                <a.Icon size={17} /><span style={{ whiteSpace: 'nowrap' }}>{a.label}</span>
              </button>
            ))}
            <button type="button" onClick={onDelete} className="dsr-del" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 62, padding: '10px 4px', borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'background .15s, border-color .15s, color .15s' }}>
              <Trash2 size={17} /><span style={{ whiteSpace: 'nowrap' }}>Διαγραφή</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Compact Row ──────────────────────────────────────────────────────────────
function CompactRow({ contact, onOpen, onEdit, onDelete, selected, onSelect, bulkMode, scopePortfolio }: { contact: Contact; onOpen?: () => void; onEdit: () => void; onDelete: () => void; selected?: boolean; onSelect?: () => void; bulkMode?: boolean; scopePortfolio?: boolean }) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: 'var(--text-tertiary)' }
  const extra = contact._extra || {}; const [hov, setHov] = useState(false)
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={bulkMode ? onSelect : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: selected ? 'var(--accent-soft)' : hov ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s', borderBottom: '1px solid var(--border-subtle)', cursor: bulkMode ? 'pointer' : 'default' }}>
      {bulkMode && <SelectBox checked={!!selected} onToggle={onSelect} size={18} />}
      {/* Η κουκκίδα σημαίνει ΕΝΑ πράγμα: ληξιπρόθεσμο ραντεβού. Πριν έδειχνε
          «κατάσταση σχέσης» — τέσσερα χρώματα για μια επιλογή χωρίς συνέπεια. */}
      <div title={overdue ? 'Ληξιπρόθεσμο ραντεβού' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', background: overdue ? 'var(--negative)' : 'var(--border-default)', flexShrink: 0 }} />
      <div onClick={() => onOpen && !bulkMode && onOpen()} style={{ width: 200, minWidth: 0, cursor: onOpen && !bulkMode ? 'pointer' : 'default' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.full_name}</div>
        <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>{meta.label}{scopePortfolio && <span title="Όλο το χαρτοφυλάκιο" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent)' }}><Globe size={10} /></span>}</div>
      </div>
      <div style={{ width: 140, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone || ABSENT}</div>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || ABSENT}</div>
      <div style={{ display: 'flex', gap: 4, maxWidth: 160, flexWrap: 'wrap' }}>{(extra.tags || []).slice(0, 2).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>{t}</span>)}</div>
      <div style={{ width: 120, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{extra.afm ? 'ΑΦΜ ' + extra.afm : ''}</div>
      <div style={{ display: 'flex', gap: 6, opacity: bulkMode ? 0 : hov ? 1 : 0, pointerEvents: bulkMode ? 'none' : undefined, transition: 'opacity 0.15s', flexShrink: 0 }}>
        {contact.phone && <a href={'tel:' + contact.phone} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: 4, color: 'var(--text-secondary)' }}><Phone size={14} /></a>}
        {extra.whatsapp && contact.phone && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '4px 6px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6 }}>WA</a>}
        {extra.viber && contact.phone && <a href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '4px 6px', fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6 }}>VB</a>}
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
      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <GroupIcon size={15} color="var(--accent)" />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', fontFamily: T.font.sans }}>{group.label}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, var(--accent-border), transparent)' }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>{count}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΛΦΑΒΗΤΙΚΗ ΡΑΓΑ
// ─────────────────────────────────────────────────────────────────────────
// Δύο αλφάβητα, γιατί ένα ελληνικό ευρετήριο δεν βρίσκει το «Booking.com» και
// ένα λατινικό δεν βρίσκει τον «Παπαδόπουλο». Χωρίζονται με λεπτή κάθετη
// γραμμή — όχι με ετικέτα «Ελληνικά»/«Αγγλικά», που θα ήταν δύο λέξεις για κάτι
// που φαίνεται.
//
// ΜΟΝΟ ΤΑ ΓΡΑΜΜΑΤΑ ΠΟΥ ΥΠΑΡΧΟΥΝ. Πενήντα ένα γράμματα εκ των οποίων τα σαράντα
// οκτώ νεκρά δεν είναι ευρετήριο· είναι διακόσμηση που κοστίζει δύο σειρές
// οθόνης. Το πλήθος κάθε γράμματος ζει στο tooltip και όχι δίπλα στο γράμμα:
// στη ράγα μετράει η ταχύτητα του ματιού, όχι η αναφορά.
// ═══════════════════════════════════════════════════════════════════════════
function AlphaRail({ entries, active, onPick }: {
  entries: AlphaEntry[]; active: string | null; onPick: (letter: string | null) => void
}) {
  if (entries.length < 2) return null   // Ένα γράμμα δεν είναι ευρετήριο.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginBottom: 18 }}>
      {entries.map((e, i) => {
        const on = active === e.letter
        // Η αλλαγή αλφαβήτου σημαδεύεται μία φορά, στο σημείο που συμβαίνει.
        const boundary = i > 0 && entries[i - 1].script !== e.script
        return (
          <span key={e.letter} style={{ display: 'contents' }}>
            {boundary && <span aria-hidden style={{ width: 1, height: 14, background: 'var(--border-default)', margin: '0 7px', flexShrink: 0 }} />}
            <button type="button" onClick={() => onPick(on ? null : e.letter)} aria-pressed={on}
              title={`${e.count} ${e.count === 1 ? 'επαφή' : 'επαφές'}`}
              style={{
                minWidth: 26, height: 26, padding: '0 4px', border: 'none', cursor: 'pointer',
                borderRadius: 7, background: on ? 'var(--accent)' : 'transparent',
                color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
                fontFamily: T.font.sans, fontSize: 12, fontWeight: on ? 700 : 500,
                fontVariantNumeric: 'tabular-nums', transition: 'background .14s, color .14s',
              }}
              onMouseEnter={ev => { if (!on) ev.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={ev => { if (!on) ev.currentTarget.style.background = 'transparent' }}>
              {e.letter}
            </button>
          </span>
        )
      })}
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
  const [letterFilter, setLetterFilter] = useState<string | null>(null)
  const [attention, setAttention] = useState<'overdue' | 'no-afm' | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [showMore, setShowMore] = useState(false)   // πτυσσόμενες προαιρετικές λεπτομέρειες στη φόρμα
  const [detailId, setDetailId] = useState<string | null>(null)   // ανοιχτό προφίλ (dossier), ζωντανό από τη λίστα
  const [scanning, setScanning] = useState(false)   // σάρωση κάρτας/τιμολογίου με AI
  const cardRef = useRef<HTMLInputElement>(null)
  const [dup, setDup] = useState<Contact | null>(null)   // υποψήφιο διπλότυπο (ίδιο τηλέφωνο/ΑΦΜ)
  const [roleOther, setRoleOther] = useState('')   // ελεύθερο κείμενο όταν επιλεγεί «Άλλο»
  const [error, setError] = useState<string | null>(null)
  const [quickExpense, setQuickExpense] = useState<Contact | null>(null)
  const [quickCalendar, setQuickCalendar] = useState<Contact | null>(null)
  const [historyContact, setHistoryContact] = useState<Contact | null>(null)
  const [qrContact, setQrContact] = useState<Contact | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dossierRefresh, setDossierRefresh] = useState(0)   // ανανεώνει τις πληρωμές στο dossier μετά από νέα δαπάνη

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

  const isOtherRole = (r: string) => r === 'other' || r.endsWith('_other')
  const openAdd = () => { setEditContact(null); setForm({ ...EMPTY_FORM, extra: { ...EMPTY_EXTRA } }); setRoleOther(''); setError(null); setShowMore(false); setShowModal(true) }

  // Σάρωση επαγγελματικής κάρτας ή τιμολογίου με AI: εξάγει στοιχεία, προσυμπληρώνει
  // τη φόρμα και την ανοίγει για έλεγχο πριν την αποθήκευση (ο χρήστης επιβεβαιώνει).
  const runCardScan = async (file: File) => {
    setScanning(true)
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
      const base64 = dataUrl.split(',')[1]; const mime = file.type || 'image/jpeg'; const isPdf = mime === 'application/pdf'
      const contentPart = isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
      const sys = 'Είσαι βοηθός καταχώρησης επαφών για διαχείριση ακινήτων. Από επαγγελματική κάρτα ή τιμολόγιο, εξάγεις τα στοιχεία του επαγγελματία/εταιρείας. Σε τιμολόγιο, κράτα τον ΕΚΔΟΤΗ/προμηθευτή (όχι τον πελάτη). Απάντησε ΜΟΝΟ με έγκυρο JSON χωρίς επεξήγηση, με κλειδιά: full_name (string), role (μία λέξη στα αγγλικά που περιγράφει την ειδικότητα, π.χ. plumber, electrician, accountant, lawyer, notary, hvac· αλλιώς κενό), phone, phone2, email, website, address, afm (μόνο ψηφία), iban, specialty. Ό,τι δεν υπάρχει, κενή συμβολοσειρά.'
      const res = await fetch('/api/anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 900, system: sys, messages: [{ role: 'user', content: [contentPart, { type: 'text', text: 'Εξάγαγε τα στοιχεία επαφής από αυτό το έγγραφο.' }] }] }) })
      const data = await res.json()
      if (!res.ok || data?.error) { setScanning(false); notifyError('Η σάρωση δεν είναι διαθέσιμη τώρα'); return }
      const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}'
      let d: Record<string, string> = {}
      try { d = JSON.parse(text.replace(/```json?|```/g, '').trim()) } catch { setScanning(false); notifyError('Δεν διάβασα καθαρά την κάρτα, δοκίμασε πάλι'); return }
      const roleVal = (d.role && ROLE_META[d.role.trim().toLowerCase()]) ? d.role.trim().toLowerCase() : inferRole([d.role, d.specialty, d.full_name].filter(Boolean).join(' ')) || 'other'
      const has = (v?: string) => (v || '').trim()
      setEditContact(null); setRoleOther('')
      setForm({
        full_name: has(d.full_name), role: roleVal, phone: has(d.phone), email: has(d.email), freeNotes: '',
        extra: { ...EMPTY_EXTRA, phone2: has(d.phone2), website: has(d.website), office_address: has(d.address), afm: has(d.afm).replace(/\D/g, ''), iban: has(d.iban).replace(/\s/g, '').toUpperCase(), specialty: has(d.specialty) },
      })
      setShowMore(!!(has(d.afm) || has(d.iban) || has(d.website) || has(d.address) || has(d.specialty)))
      setError(null); setScanning(false); setShowModal(true)
      notify(has(d.full_name) ? 'Έλεγξε τα στοιχεία και αποθήκευσε' : 'Συμπλήρωσε τα στοιχεία που λείπουν', { tone: 'info' })
    } catch { setScanning(false); notifyError('Παρουσιάστηκε σφάλμα στη σάρωση') }
  }
  // ΕΔΩ ΗΤΑΝ ΔΥΟ ΔΙΑΔΡΟΜΕΣ ΕΙΣΑΓΩΓΗΣ (~60 γραμμές): αρχείο .vcf/.csv και Contacts
  // Picker του κινητού. Έφυγαν και οι δύο. Η πρώτη έσπαγε σε κάθε πραγματικό CSV
  // (έκοβε σε «,» ή «;» χωρίς να σέβεται εισαγωγικά, οπότε ένα «Παπαδόπουλος, ΑΕ»
  // γινόταν δύο στήλες)· η δεύτερη δουλεύει σε ελάχιστα προγράμματα περιήγησης και
  // φέρνει ονόματα χωρίς ειδικότητα, χωρίς ΑΦΜ, χωρίς IBAN — δηλαδή επαφές που
  // πρέπει να ξανασυμπληρωθούν με το χέρι. Και τα δύο τα καλύπτει η ΦΩΤΟΓΡΑΦΙΑ της
  // κάρτας ή του τιμολογίου, που διαβάζει όνομα, ειδικότητα, τηλέφωνο, ΑΦΜ και IBAN
  // με μία κίνηση.

  // ── Εξαγωγή vCard ──
  const vcardFor = (c: Contact) => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.full_name}`, c._extra?.specialty ? `TITLE:${c._extra.specialty}` : '', c.phone ? `TEL:${c.phone}` : '', c._extra?.phone2 ? `TEL:${c._extra.phone2}` : '', c.email ? `EMAIL:${c.email}` : '', c._extra?.website ? `URL:${c._extra.website}` : '', c._extra?.office_address ? `ADR:;;${c._extra.office_address};;;;` : '', 'END:VCARD'].filter(Boolean).join('\n')
  const downloadVcf = (list: Contact[], name: string) => {
    const blob = new Blob([list.map(vcardFor).join('\n')], { type: 'text/vcard' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
  }

  const openEdit = (c: Contact) => { const known = !!ROLE_META[c.role]; setRoleOther(known ? '' : (c.role || '')); setEditContact(c); setForm({ full_name: c.full_name, role: known ? c.role : 'other', phone: c.phone || '', email: c.email || '', freeNotes: c._freeNotes || '', extra: { ...EMPTY_EXTRA, ...(c._extra || {}), tags: c._extra?.tags || [], notes_log: c._extra?.notes_log || [], files: c._extra?.files || [] } }); setError(null); setShowMore(!!(c._extra?.tags?.length || c._extra?.notes_log?.length || c._extra?.files?.length || c._extra?.iban || c._extra?.next_appointment)); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditContact(null); setError(null) }
  const setExtra = (key: keyof ContactExtra, value: unknown) => setForm(f => ({ ...f, extra: { ...f.extra, [key]: value } }))

  // ── Εντοπισμός διπλότυπου (ίδιο τηλέφωνο ≥8 ψηφία ή ίδιο ΑΦΜ) ──
  const onlyDigits = (s?: string | null) => (s || '').replace(/\D/g, '')
  const findDuplicate = (): Contact | null => {
    const ph = onlyDigits(form.phone); const afm = onlyDigits(form.extra.afm)
    return contacts.find(c => c.id !== editContact?.id && (
      (ph.length >= 8 && onlyDigits(c.phone) === ph) ||
      (afm.length >= 9 && onlyDigits(c._extra?.afm) === afm)
    )) || null
  }
  // Για συγχώνευση: κρατάμε μόνο τα «γεμάτα» πεδία του νέου (τα false/0/κενά δεν
  // σβήνουν υπάρχουσες τιμές, π.χ. προτιμώμενη/αξιολόγηση/WhatsApp της παλιάς επαφής).
  const cleanExtra = (e: ContactExtra): Partial<ContactExtra> => {
    const out: Record<string, unknown> = {}
    Object.entries(e).forEach(([k, v]) => { if (!v) return; if (Array.isArray(v) && v.length === 0) return; out[k] = v })
    return out as Partial<ContactExtra>
  }
  // Συγχρονισμός υπενθύμισης/ραντεβού επαφής στο ημερολόγιο, ώστε να στέλνεται ειδοποίηση.
  const syncContactReminder = async (contactId: string, name: string) => {
    const src = `contact:${contactId}:reminder`
    await saved('Η παλιά υπενθύμιση δεν καθαρίστηκε', supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', src))
    // ΜΟΝΟ το ραντεβού. Η «Υπενθύμιση επικοινωνίας» υποσχόταν ρυθμό (κάθε 30
    // ημέρες) και έγραφε μία παγωμένη ημερομηνία, υπολογισμένη μία φορά στο κλικ.
    const date = form.extra.next_appointment || ''
    if (date) await saved('Η υπενθύμιση δεν μπήκε στο ημερολόγιο', supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title: `Επικοινωνία: ${name}`, category: 'reminder', event_date: date, amount: null, priority: 'medium', status: 'pending', recurring: false, source: src, notes: form.extra.specialty || null }))
  }

  const persist = async (mode: 'update' | 'insert' | 'merge', target?: Contact) => {
    setSaving(true); setError(null)
    const name = form.full_name.trim()
    const finalRole = isOtherRole(form.role) && roleOther.trim() ? roleOther.trim() : form.role
    if (mode === 'merge' && target) {
      const mergedExtra = { ...(target._extra || {}), ...cleanExtra(form.extra) }
      const mergedNotes = [target._freeNotes, form.freeNotes].filter(Boolean).join('\n').trim()
      const mergedRole = (finalRole && finalRole !== 'other') ? finalRole : target.role
      const { error: e } = await supabase.from('contacts').update({ full_name: name || target.full_name, role: mergedRole, phone: form.phone.trim() || target.phone, email: form.email.trim() || target.email, notes: serializeNotes(mergedExtra, mergedNotes) }).eq('id', target.id)
      if (e) { setError('Σφάλμα: ' + e.message); setSaving(false); return }
      await syncContactReminder(target.id, name || target.full_name)
      setSaving(false); setDup(null); closeModal(); fetchContacts(); notifyOk('Οι επαφές συγχωνεύθηκαν'); return
    }
    const payload = { full_name: name, role: finalRole, phone: form.phone.trim() || null, email: form.email.trim() || null, notes: serializeNotes(form.extra, form.freeNotes) }
    if (mode === 'update' && editContact) {
      const { error: e } = await supabase.from('contacts').update(payload).eq('id', editContact.id)
      if (e) { setError('Σφάλμα: ' + e.message); setSaving(false); return }
      await syncContactReminder(editContact.id, name)
      setSaving(false); closeModal(); fetchContacts(); notifyOk('Επαφή ενημερώθηκε'); return
    }
    const { data: ins, error: e } = await supabase.from('contacts').insert({ ...payload, property_id: propertyId, user_id: userId }).select('id').single()
    if (e) { setError('Σφάλμα: ' + e.message); setSaving(false); return }
    if (ins?.id) await syncContactReminder(ins.id, name)
    setSaving(false); setDup(null); closeModal(); fetchContacts(); notifyOk('Επαφή προστέθηκε')
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError('Το ονοματεπώνυμο είναι υποχρεωτικό.'); return }
    if (!editContact) { const d = findDuplicate(); if (d) { setDup(d); return } }
    await persist(editContact ? 'update' : 'insert')
  }

  const handleDelete = async (id: string) => {
    if (!await saved('Η επαφή δεν διαγράφηκε', supabase.from('contacts').delete().eq('id', id))) return
    await saved('Η υπενθύμιση της επαφής δεν καθαρίστηκε', supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', `contact:${id}:reminder`))
    setDeleteId(null); fetchContacts(); notify('Επαφή διαγράφηκε')
  }
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulkDelete = async () => {
    // Το στιγμιότυπο των ids παίρνεται ΠΡΙΝ την ερώτηση. Με το native confirm η
    // σελίδα πάγωνε, οπότε το `selected` δεν μπορούσε να αλλάξει όσο ρωτούσαμε.
    // Ο δικός μας διάλογος δεν παγώνει τίποτα: αν διαβάζαμε το `selected` μετά
    // το await, ο χρήστης θα μπορούσε να αλλάξει επιλογή και θα διαγράφονταν
    // ΑΛΛΕΣ επαφές από όσες ανέφερε το μήνυμα — και σε άλλο πλήθος από το `n`.
    const ids = [...selected]
    const n = ids.length
    if (!n || !(await confirmDialog(`Διαγραφή ${n} ${n === 1 ? 'επαφής' : 'επαφών'};`, { tone: 'negative' }))) return
    if (!await saved(`${n === 1 ? 'Η επαφή δεν διαγράφηκε' : 'Οι επαφές δεν διαγράφηκαν'}`,
      supabase.from('contacts').delete().in('id', ids))) return
    // Καθαρισμός των υπενθυμίσεων ημερολογίου (ισοτιμία με τη μεμονωμένη διαγραφή).
    await saved('Οι υπενθυμίσεις των επαφών δεν καθαρίστηκαν', supabase.from('calendar_events')
      .delete().eq('property_id', propertyId).in('source', ids.map(id => `contact:${id}:reminder`)))
    setSelected(new Set()); setBulkMode(false); fetchContacts(); notify(`${n} ${n === 1 ? 'επαφή διαγράφηκε' : 'επαφές διαγράφηκαν'}`)
  }
  const bulkEmail = () => { const emails = contacts.filter(c => selected.has(c.id) && c.email).map(c => c.email).join(','); if (emails) window.open('mailto:' + emails); else notify('Καμία από τις επιλεγμένες δεν έχει email', { tone: 'warning' }) }
  const bulkVcard = () => { const sel = contacts.filter(c => selected.has(c.id)); if (sel.length) downloadVcf(sel, 'epafes-epilogi.vcf') }
  // Το ραντεβού που κλείνεται από το προφίλ γράφεται και στην ΙΔΙΑ την επαφή
  // (πεδίο «επόμενο ραντεβού»), ώστε να ανάβει το badge/η παρακολούθηση ληξιπρόθεσμων.
  const linkAppointmentToContact = async (c: Contact | null, date: string) => {
    if (!c || !date) return
    const extra = { ...EMPTY_EXTRA, ...(c._extra || {}), next_appointment: date }
    if (!await saved('Το ραντεβού δεν γράφτηκε στην επαφή',
      supabase.from('contacts').update({ notes: serializeNotes(extra, c._freeNotes || '') }).eq('id', c.id))) return
    // Υπενθύμιση ημερολογίου μία ημέρα πριν (idempotent ανά επαφή).
    const src = `contact:${c.id}:reminder`
    await saved('Η παλιά υπενθύμιση δεν καθαρίστηκε', supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', src))
    const remind = new Date(date + 'T00:00:00'); remind.setDate(remind.getDate() - 1)
    await saved('Η υπενθύμιση ραντεβού δεν δημιουργήθηκε', supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title: `Υπενθύμιση ραντεβού: ${c.full_name}`, category: 'reminder', event_date: remind.toISOString().split('T')[0], priority: 'medium', status: 'pending', recurring: false, source: src }))
    fetchContacts()
  }

  // ─── Enhanced CSV Export ───────────────────────────────────────────────────

  // Το σύνολο ΠΡΙΝ από το γράμμα: πάνω σε αυτό χτίζεται η ράγα, ώστε τα πλήθη
  // της να ακολουθούν την αναζήτηση και τις κατηγορίες — αλλά να μη μηδενίζονται
  // από την ίδια της την επιλογή. Αν η ράγα μετρούσε το τελικό αποτέλεσμα, μόλις
  // πάταγες «Π» θα έμενε ΜΟΝΟ το «Π» και δεν θα υπήρχε δρόμος για το «Α».
  const scoped = useMemo(() => contacts.filter(c => {
    const matchGroup = filterGroup === 'all' || ROLE_META[c.role]?.groupId === filterGroup
    const matchTag = !filterTag || (c._extra?.tags || []).includes(filterTag)
    const matchScope = !isPro || filterScope === 'all'
      || (filterScope === 'portfolio' ? scopeIsPortfolio(c) : !scopeIsPortfolio(c))
    const matchAttention = !attention || (attention === 'overdue'
      ? !!(c._extra?.next_appointment && isOverdue(c._extra.next_appointment))
      : digitsOf(c._extra?.afm).length !== 9)
    const q = search.toLowerCase(); const ex = c._extra || {}
    return matchGroup && matchTag && matchScope && matchAttention && (!q || c.full_name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q) || (ex.specialty || '').toLowerCase().includes(q) || (ex.afm || '').includes(q) || (ex.iban || '').includes(q) || (ex.tags || []).some((t: string) => t.toLowerCase().includes(q)))
  }), [contacts, search, filterGroup, filterTag, filterScope, attention, isPro])

  const alphaIndex = useMemo(() => buildAlphaIndex(scoped.map(c => c.full_name)), [scoped])

  // Το γράμμα που δεν υπάρχει πια δεν επιτρέπεται να μείνει πατημένο: αν έσβηνες
  // την τελευταία επαφή στο «Π», η οθόνη θα έδειχνε κενό με ενεργό ένα γράμμα
  // που δεν φαίνεται πουθενά — αδιέξοδο χωρίς ορατή έξοδο.
  const letter = letterFilter && alphaIndex.some(e => e.letter === letterFilter) ? letterFilter : null

  const processed = useMemo(() => {
    const list = letter ? scoped.filter(c => alphaBucket(c.full_name) === letter) : [...scoped]
    // Με ενεργό γράμμα η σειρά είναι ΠΑΝΤΑ αλφαβητική — το «πιο πρόσφατες» μέσα
    // σε ένα γράμμα δεν απαντά καμία ερώτηση.
    if (sortMode === 'alpha' || letter) list.sort((a, b) => compareNames(a.full_name, b.full_name))
    return [...list.filter(c => c._extra?.preferred), ...list.filter(c => !c._extra?.preferred)]
  }, [scoped, sortMode, letter])

  const groupedFiltered: Record<string, Contact[]> = {}
  processed.forEach(c => { const gid = ROLE_META[c.role]?.groupId || 'tenants'; if (!groupedFiltered[gid]) groupedFiltered[gid] = []; groupedFiltered[gid].push(c) })
  const preferred = contacts.filter(c => c._extra?.preferred)
  const overdueContacts = contacts.filter(c => c._extra?.next_appointment && isOverdue(c._extra.next_appointment))
  const allTags = [...new Set(contacts.flatMap(c => c._extra?.tags || []))]
  // ΠΕΝΤΕ ΠΛΗΘΗ ΕΓΙΝΑΝ ΤΡΙΑ, ΚΑΙ ΤΟ ΣΗΜΑ ΑΝΕΒΗΚΕ ΠΑΝΩ. Πριν, η μόνη γραμμή που
  // ζητούσε ενέργεια (ληγμένα ραντεβού) ήταν ΚΑΤΩ από πέντε μετρητές που δεν
  // ζητούν τίποτα. Ένα πλήθος δεν είναι κρίση: «4 τεχνικοί» δεν σε βάζει να κάνεις
  // κάτι. Το «λείπει ΑΦΜ» σε βάζει, γιατί χωρίς αυτό δεν δένουν τα παραστατικά.
  const missingAfm = contacts.filter(c => digitsOf(c._extra?.afm).length !== 9).length
  // Το ΑΦΜ δεν είναι γραφειοκρατία: χωρίς αυτό, ένα τιμολόγιο του συνεργάτη δεν
  // δένει με την επαφή του και η δαπάνη μένει ανώνυμη στο βιβλίο.
  const needsAttention = ([
    { id: 'overdue' as const, label: 'Ληγμένο ραντεβού', count: overdueContacts.length },
    { id: 'no-afm' as const, label: 'Χωρίς ΑΦΜ', count: missingAfm },
  ]).filter(a => a.count > 0)
  // Ποια πεδία βλέπει ΑΥΤΟΣ ο χρήστης. Η «εμβέλεια» π.χ. δεν έχει νόημα με ένα
  // ακίνητο, οπότε δεν υπάρχει καθόλου — δεν είναι ρύθμιση, είναι θόρυβος.
  const contactCtx: FieldContext = {
    status: 'rent_long', business: isPro, doubleEntry: false,
    propertyCount: Math.max(properties.length, 1),
  }
  const contactFields = formFields(CONTACT_FIELDS, contactCtx)
  const contactById = new Map<string, FieldDecision>([...contactFields.core, ...contactFields.more].map(d => [d.id, d]))
  const cf = (id: string) => contactById.get(id)
  const detail = detailId ? (contacts.find(c => c.id === detailId) || null) : null   // ζωντανό (ανανεώνεται μετά από edit/refresh)

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1080, margin: '0 auto', fontFamily: T.font.sans }}>


      <input ref={cardRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) runCardScan(f); e.currentTarget.value = '' }} />
      {scanning && (
        <div role="dialog" aria-modal="true" aria-label="Κατάλογος επαφών" style={{ position: 'fixed', inset: 0, background: T.scrim, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 18, padding: '26px 32px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 22, height: 22, border: '2.5px solid var(--border-default)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'contactsSpin 0.7s linear infinite' }} />
            <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Ανάλυση κάρτας…</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Εξάγω τα στοιχεία επαφής</div></div>
          </div>
          <style>{`@keyframes contactsSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ΤΑ ΚΟΥΜΠΙΑ ΤΗΣ ΚΕΦΑΛΙΔΑΣ ΑΠΟΔΙΔΟΝΤΑΙ ΠΑΝΤΑ. Πριν, όλα μαζί — και η σάρωση —
          εμφανίζονταν ΜΟΝΟ αν υπήρχε ήδη επαφή: ο νέος χρήστης δεν έβλεπε ποτέ τη
          σάρωση και ο μόνος δρόμος για την πρώτη του επαφή ήταν η φόρμα. Το κύριο
          κουμπί είναι η ΦΩΤΟΓΡΑΦΙΑ, όχι η χειροκίνητη καταχώριση. */}
      {!embedded && <PageTitle
        title="Επαφές"
        sub="Συνεργάτες, πάροχοι και υπηρεσίες του ακινήτου"
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn variant="secondary" onClick={openAdd}>Νέα επαφή</Btn>
          {contacts.length > 0 && <details className="po-menu" style={{ position: 'relative' }}>
            <summary style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: T.radius.btn, fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
              Εξαγωγή
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, minWidth: 190, background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.inner, boxShadow: 'var(--elev-2)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {([
                { label: 'Excel', fn: () => exportContactsExcel(contacts) },
                { label: 'PDF', fn: () => exportContactsPDF(contacts, branding) },
                { label: 'vCard', fn: () => downloadVcf(contacts, 'epafes.vcf') },
              ]).map(item => (
                <button key={item.label} type="button" onClick={e => { item.fn(); (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open') }}
                  style={{ appearance: 'none', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  {item.label}
                </button>
              ))}
            </div>
          </details>}
          <Btn variant="primary" onClick={() => cardRef.current?.click()}>{scanning ? 'Σάρωση…' : 'Σάρωση κάρτας'}</Btn>
        </div>}
      />}

      {/* ══ ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΠΡΟΣΟΧΗ ══════════════════════════════════════════
          Πριν εδώ υπήρχαν ΔΥΟ ζώνες που έλεγαν το ίδιο: τρία πλακίδια
          («ΛΗΓΜΕΝΑ ΡΑΝΤΕΒΟΥ 0 · ΧΩΡΙΣ ΑΦΜ 1 · ΣΥΝΟΛΟ ΕΠΑΦΩΝ 1») και από κάτω
          μια κορδέλα που ξανάλεγε τα ληγμένα ραντεβού ονομαστικά. Το σύνολο
          λεγόταν άλλες τρεις φορές παρακάτω — στη γραμμή πλήθους, στο chip της
          κατηγορίας και στον διαχωριστή της ομάδας.

          Ένα πλήθος δεν είναι ενέργεια: το «4 τεχνικοί» δεν σε βάζει να κάνεις
          τίποτα. Εδώ μένουν μόνο τα δύο που ΖΗΤΟΥΝ κάτι, και είναι φίλτρα: το
          πάτημα σε πηγαίνει στις συγκεκριμένες επαφές αντί να σε αφήνει να τις
          ψάξεις. Όταν δεν υπάρχει τίποτα εκκρεμές, η ζώνη δεν υπάρχει — η
          απουσία προβλήματος δεν χρειάζεται ανακοίνωση. */}
      {!loading && needsAttention.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {needsAttention.map(a => {
            const on = attention === a.id
            return (
              <button key={a.id} type="button" onClick={() => setAttention(on ? null : a.id)} aria-pressed={on}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: T.h.sm, padding: '0 14px',
                  borderRadius: T.radius.pill, cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border-subtle)'),
                  background: on ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: on ? 'var(--on-tone)' : 'var(--text-secondary)', transition: 'background .14s, border-color .14s' }}>
                {a.label}
                <span style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 10.5, opacity: on ? 0.85 : 0.6 }}>{fn(a.count)}</span>
              </button>
            )
          })}
        </div>
      )}

      {bulkMode && (() => {
        const allOn = processed.length > 0 && processed.every(c => selected.has(c.id))
        const someOn = selected.size > 0 && !allOn
        const masterToggle = () => setSelected(allOn ? new Set() : new Set(processed.map(c => c.id)))
        const hasEmail = contacts.some(c => selected.has(c.id) && c.email)
        const none = selected.size === 0
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '11px 16px', marginBottom: 18, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <SelectBox checked={allOn} indeterminate={someOn} onToggle={masterToggle} />
              <span style={{ fontSize: 13.5, fontWeight: 650, color: none ? 'var(--text-secondary)' : 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
                {none ? `Επιλογή όλων (${processed.length})` : `${selected.size} ${selected.size === 1 ? 'επιλεγμένη' : 'επιλεγμένες'}`}
              </span>
            </div>
            <div style={{ width: 1, height: 22, background: 'var(--border-subtle)', flexShrink: 0 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <BulkBtn icon={Mail} label="Ηλεκτρονικό ταχυδρομείο" onClick={bulkEmail} disabled={!hasEmail} />
              <BulkBtn icon={FileText} label="Εξαγωγή vCard" onClick={bulkVcard} disabled={none} />
              <BulkBtn icon={Trash2} label="Διαγραφή" onClick={bulkDelete} disabled={none} danger />
            </div>
            <button type="button" onClick={() => { setBulkMode(false); setSelected(new Set()) }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}><X size={14} />Τέλος</button>
          </div>
        )
      })()}

      {preferred.length > 0 && (
        <div style={{ marginBottom: 22, padding: '16px 20px', background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)' }}>
          <SecHdr label="Γρήγορη πρόσβαση" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {preferred.map(c => {
              const meta = ROLE_META[c.role] || { groupColor: 'var(--text-tertiary)', label: c.role, GroupIcon: Users }
              const overdue = c._extra?.next_appointment && isOverdue(c._extra.next_appointment)
              const GroupIcon = meta.GroupIcon || Users
              return (
                <div key={c.id} onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid ' + (overdue ? 'var(--negative-border)' : 'var(--accent-border)'), cursor: 'pointer', position: 'relative' }}>
                  {overdue && <span style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--negative)', border: '2px solid var(--bg-elevated)' }} />}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                    {c._extra?.avatar_url ? <img src={c._extra.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : initialsOf(c.full_name) || <GroupIcon size={14} />}
                  </div>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{c.full_name}</div><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{meta.label}</div></div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                    {c.phone && <a href={'tel:' + c.phone} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 3 }}><Phone size={13} /></a>}
                    {c._extra?.whatsapp && c.phone && <a href={'https://wa.me/' + c.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: 9, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 5px', borderRadius: 6 }}>WA</a>}
                    {c._extra?.viber && c.phone && <a href={'viber://chat?number=' + c.phone.replace(/\D/g, '')} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: 9, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 5px', borderRadius: 6 }}>VB</a>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && contacts.length > 0 && (<>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Όνομα, τηλέφωνο, email, ΑΦΜ ή IBAN" style={{ ...iStyle, paddingLeft: 38 }} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
        </div>
        {allTags.length > 0 && (
          <div style={{ minWidth: 170 }}>
            <CustomSelect value={filterTag} onChange={setFilterTag} placeholder="Όλες οι ετικέτες"
              options={[{ value: '', label: 'Όλες οι ετικέτες' }, ...allTags.map(t => ({ value: t, label: t }))]} />
          </div>
        )}
        {/* Ταξινόμηση: δύο επιλογές, ορατές. Ένα αναδυόμενο μενού για δύο τιμές
            κρύβει τη μισή πληροφορία πίσω από ένα κλικ, χωρίς λόγο. */}
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, overflow: 'hidden', background: 'var(--bg-elevated)', padding: 3, gap: 2 }}>
          {([['recent', 'Πρόσφατες'], ['alpha', 'Αλφαβητικά']] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setSortMode(m)} style={{ padding: '5px 15px', border: 'none', borderRadius: T.radius.pill, background: sortMode === m ? 'var(--bg-surface)' : 'transparent', color: sortMode === m ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: sortMode === m ? 700 : 500, fontFamily: T.font.sans, boxShadow: sortMode === m ? 'var(--elev-1)' : 'none', transition: 'all 0.15s' }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, overflow: 'hidden', background: 'var(--bg-elevated)', padding: 3, gap: 2 }}>
          {(['cards', 'compact'] as ViewMode[]).map(v => (
            <button key={v} type="button" onClick={() => setViewMode(v)} style={{ padding: '5px 15px', border: 'none', borderRadius: T.radius.pill, background: viewMode === v ? 'var(--bg-surface)' : 'transparent', color: viewMode === v ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: viewMode === v ? 700 : 500, fontFamily: T.font.sans, boxShadow: viewMode === v ? 'var(--elev-1)' : 'none', transition: 'all 0.15s' }}>{v === 'cards' ? 'Κάρτες' : 'Λίστα'}</button>
          ))}
        </div>
      </div>

      <AlphaRail entries={alphaIndex} active={letter} onPick={setLetterFilter} />

      {isPro && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Εμβέλεια</span>
          {([
            { id: 'all' as const, label: 'Όλες', Icon: Users },
            { id: 'portfolio' as const, label: 'Όλο το χαρτοφυλάκιο', Icon: Globe },
            { id: 'property' as const, label: 'Ανά ακίνητο', Icon: Building2 },
          ]).map(o => { const active = filterScope === o.id; const Ico = o.Icon; return (
            <button key={o.id} type="button" onClick={() => setFilterScope(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--border-default)' : 'var(--border-subtle)'), background: active ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', fontSize: 12, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
              <Ico size={12} />{o.label}
            </button>
          )})}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {GROUPS.filter(g => contacts.some(c => ROLE_META[c.role]?.groupId === g.id)).map(g => {
            const count = contacts.filter(c => ROLE_META[c.role]?.groupId === g.id).length; const active = filterGroup === g.id; const GroupIcon = g.Icon
            return (
              <button key={g.id} type="button" onClick={() => setFilterGroup(active ? 'all' : g.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--border-default)' : 'var(--border-subtle)'), background: active ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', fontSize: 12, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
                <GroupIcon size={12} />{g.label}<span style={{ background: active ? 'var(--border-raised)' : 'var(--bg-elevated)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: T.radius.pill, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{count}</span>
              </button>
            )
          })}
      </div>

      {/* Η ΓΡΑΜΜΗ ΤΟΥ ΠΛΗΘΟΥΣ. Το δεύτερο κουμπί εξαγωγής που καθόταν εδώ έφυγε:
          η κεφαλίδα προσφέρει ήδη Excel, PDF και vCard — τρεις μορφές, ένα
          σημείο. Στη θέση του μπήκε η μαζική επιλογή, δηλαδή ό,τι αφορά ΑΥΤΕΣ
          τις επαφές, δίπλα στο πλήθος τους. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
          {processed.length === contacts.length
            ? `${fn(contacts.length)} ${contacts.length === 1 ? 'επαφή' : 'επαφές'}`
            : `${fn(processed.length)} από ${fn(contacts.length)}`}
        </span>
        {!bulkMode && processed.length > 0 && (
          <button type="button" onClick={() => { setBulkMode(true); setSelected(new Set()) }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12,
              fontFamily: T.font.sans, color: 'var(--accent)' }}>
            Επιλογή πολλαπλών
          </button>
        )}
      </div>
      </>)}

      {loading ? (
        // Ο γυμνός Spinner δεν προδιέγραφε τίποτα: μόλις έρχονταν τα δεδομένα, τα
        // KPIs και η λίστα εμφανίζονταν μαζί και η σελίδα πηδούσε. Το σχήμα είναι
        // γνωστό (4 μετρικές + λίστα επαφών), άρα ο σκελετός κρατά το ύψος.
        <>
          <SkeletonKPIs n={4} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={54} r={10} />)}</div>
        </>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="Καμία επαφή ακόμη"
          hint="Φωτογράφισε την επαγγελματική κάρτα ή ένα τιμολόγιό του: διαβάζονται όνομα, ειδικότητα, τηλέφωνο, ΑΦΜ και IBAN, και τα ελέγχεις πριν αποθηκευτούν."
          action={<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
            <ContactActionTile Icon={Camera} label="Φωτογράφισε κάρτα" sub={scanning ? 'Ανάλυση…' : 'ή τιμολόγιο του συνεργάτη'} onClick={() => cardRef.current?.click()} primary />
            <ContactActionTile Icon={UserPlus} label="Γράψ' την με το χέρι" sub="Τέσσερα πεδία" onClick={openAdd} />
          </div>}
        />
      ) : processed.length === 0 ? (
        <EmptyState icon={<SearchX size={20} />} title="Δεν βρέθηκαν επαφές"
          hint={letter ? `Καμία επαφή στο «${letter}» με τα ενεργά φίλτρα.` : 'Ο συνδυασμός αναζήτησης, κατηγορίας και φίλτρων δεν αφήνει καμία επαφή.'}
          action={<Btn variant="secondary" onClick={() => { setSearch(''); setFilterGroup('all'); setFilterTag(''); setLetterFilter(null); setAttention(null) }}>Καθαρισμός φίλτρων</Btn>} />
      ) : viewMode === 'compact' ? (
        <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            {bulkMode && <div style={{ width: 18 }} />}
            <div style={{ width: 8 }} />
            <div style={{ width: 200, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Όνομα</div>
            <div style={{ width: 140, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Τηλέφωνο</div>
            <div style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ηλεκτρονικό ταχυδρομείο</div>
            <div style={{ width: 120, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ετικέτες</div>
            <div style={{ width: 120, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>ΑΦΜ</div>
          </div>
          {processed.map(c => <CompactRow key={c.id} contact={c} onOpen={() => setDetailId(c.id)} onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} scopePortfolio={isPro && scopeIsPortfolio(c)} />)}
        </div>
      ) : letter || sortMode === 'alpha' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 14 }}>
          {processed.map(c => (
            <ContactCard key={c.id} contact={c} onOpen={() => setDetailId(c.id)} onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)} onQuickExpense={() => setQuickExpense(c)} onQuickCalendar={() => setQuickCalendar(c)} onShowHistory={() => setHistoryContact(c)} onShowQR={() => setQrContact(c)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} branding={branding} scopeLabel={scopeLabelFor(c)} scopePortfolio={scopeIsPortfolio(c)} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 42 }}>
          {GROUPS.filter(g => groupedFiltered[g.id]?.length).map(g => (
            <div key={g.id}>
              <GroupDivider group={g} count={groupedFiltered[g.id].length} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 14 }}>
                {groupedFiltered[g.id].map(c => (
                  <ContactCard key={c.id} contact={c} onOpen={() => setDetailId(c.id)} onEdit={() => openEdit(c)} onDelete={() => setDeleteId(c.id)} onQuickExpense={() => setQuickExpense(c)} onQuickCalendar={() => setQuickCalendar(c)} onShowHistory={() => setHistoryContact(c)} onShowQR={() => setQrContact(c)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} branding={branding} scopeLabel={scopeLabelFor(c)} scopePortfolio={scopeIsPortfolio(c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div role="dialog" aria-modal="true" aria-label="Στοιχεία επαφής" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, width: '100%', maxWidth: 600, maxHeight: '92vh', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '22px 28px 18px', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {ROLE_META[form.role] && (() => { const meta = ROLE_META[form.role]; const Icon = meta.GroupIcon || Users; return <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={17} color="var(--accent)" /></div> })()}
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

                {/* ── Στοιχεία ──
                    Ποια πεδία υπάρχουν εδώ το ορίζει το CONTACT_FIELDS, και κάθε ένα
                    δείχνει ΓΡΑΜΜΕΝΟ το γιατί το ζητάμε. Η φωτογραφία επαφής έφυγε:
                    ένα πορτρέτο του υδραυλικού δεν κάνει τίποτα, και ήταν το πρώτο
                    πράγμα που έβλεπε ο χρήστης ανοίγοντας τη φόρμα. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <CField d={cf('contact.name')} required>
                    <Inp value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} placeholder="Παράδειγμα: Γιώργος Παπαδόπουλος ή ΔΕΗ Α.Ε." />
                  </CField>
                  <CField d={cf('contact.role')}>
                    <CustomSelect value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))}
                      options={ROLE_SELECT_OPTIONS.filter(o => !o.disabled).map(o => ({ value: o.value, label: o.label }))} />
                    {isOtherRole(form.role) && <div style={{ marginTop: 10 }}><Inp value={roleOther} onChange={setRoleOther} placeholder="Γράψε ελεύθερα κατηγορία ή όνομα εταιρείας" /></div>}
                  </CField>
                  <CField d={cf('contact.phone')}>
                    <Inp value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="2101234567" />
                  </CField>
                  {/* ΤΟ ΑΦΜ ΕΙΝΑΙ CORE. Είναι το μόνο πεδίο που συνδέει την επαφή με τα
                      παραστατικά της: χωρίς αυτό το ταίριασμα γίνεται με το όνομα και
                      αστοχεί σε κάθε «Συντήρηση — Παπαδόπουλος». */}
                  <CField d={cf('contact.afm')}>
                    <Inp value={form.extra.afm || ''} onChange={v => setExtra('afm', v.replace(/\D/g, '').slice(0, 9))} placeholder="123456789" />
                  </CField>
                </div>

                {/* ── Πτυσσόμενες λεπτομέρειες ── */}
                <button type="button" onClick={() => setShowMore(m => !m)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', border: '1px dashed var(--border-default)', borderRadius: T.radius.inner, background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>
                  {showMore ? 'Λιγότερες λεπτομέρειες' : 'Περισσότερες λεπτομέρειες'}
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
                </button>

                {showMore && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Επικοινωνία και πληρωμές</SecHead>
                      <CField d={cf('contact.email')}>
                        <Inp value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@example.gr" />
                      </CField>
                      <CField d={cf('contact.mobile')}>
                        <Inp value={form.extra.phone2 || ''} onChange={v => setExtra('phone2', v)} placeholder="6941234567" />
                      </CField>
                      <CField d={cf('contact.messaging')}>
                        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Tog value={!!form.extra.whatsapp} onChange={v => setExtra('whatsapp', v)} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>WhatsApp</span></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Tog value={!!form.extra.viber} onChange={v => setExtra('viber', v)} /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Viber</span></div>
                        </div>
                      </CField>
                      <CField d={cf('contact.iban')}>
                        <Inp value={form.extra.iban || ''} onChange={v => setExtra('iban', v)} placeholder="GR16 0110 1250 0000 0001 2300 695" />
                      </CField>
                      <CField d={cf('contact.iris')}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Δέχεται πληρωμή με IRIS</span>
                          <Tog value={!!form.extra.iris} onChange={v => setExtra('iris', v)} />
                        </div>
                      </CField>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Στοιχεία συνεργάτη</SecHead>
                      <CField d={cf('contact.specialty')}>
                        <Inp value={form.extra.specialty || ''} onChange={v => setExtra('specialty', v)} placeholder="Παράδειγμα: ειδικός σε κεντρική θέρμανση" />
                      </CField>
                      <CField d={cf('contact.website')}>
                        <Inp value={form.extra.website || ''} onChange={v => setExtra('website', v)} placeholder="www.example.gr" />
                      </CField>
                      {/* ΑΠΛΟ ΠΕΔΙΟ ΚΕΙΜΕΝΟΥ. Ήταν autocomplete που έστελνε κάθε
                          πληκτρολόγηση σε τρίτο εξυπηρετητή — διεύθυνση γραφείου
                          τρίτου προσώπου, εκτός της υποδομής μας. */}
                      <CField d={cf('contact.address')}>
                        <Inp value={form.extra.office_address || ''} onChange={v => setExtra('office_address', v)} placeholder="Οδός, αριθμός, πόλη" />
                      </CField>
                      <CField d={cf('contact.next_appointment')}>
                        <DatePicker value={form.extra.next_appointment || ''} onChange={v => setExtra('next_appointment', v)} />
                      </CField>
                      <CField d={cf('contact.scope')}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {([{ v: 'property' as const, label: 'Συγκεκριμένο ακίνητο', Icon: Building2 }, { v: 'portfolio' as const, label: 'Όλο το χαρτοφυλάκιο', Icon: Globe }]).map(o => {
                            const active = (form.extra.scope || 'property') === o.v; const Ico = o.Icon; return (
                              <button key={o.v} type="button" onClick={() => setExtra('scope', o.v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}>
                                <Ico size={14} />{o.label}
                              </button>
                            )
                          })}
                        </div>
                        {(form.extra.scope || 'property') !== 'portfolio' && properties.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <CustomSelect value={form.extra.scope_property_id || propertyId} onChange={v => setExtra('scope_property_id', v)}
                              options={properties.map(p => ({ value: p.id, label: p.name }))} />
                          </div>
                        )}
                      </CField>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                        <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Προτιμώμενη επαφή</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Ανεβαίνει στη γρήγορη πρόσβαση, για να τη βρίσκεις αμέσως</div></div>
                        <Tog value={!!form.extra.preferred} onChange={v => setExtra('preferred', v)} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <SecHead>Σημειώσεις και αρχεία</SecHead>
                      <CField d={cf('contact.tags')}>
                        <TagEditor tags={form.extra.tags || []} onChange={v => setExtra('tags', v)} />
                      </CField>
                      <CField d={cf('contact.notes')}>
                        <Txt value={form.freeNotes} onChange={v => setForm(f => ({ ...f, freeNotes: v }))} placeholder="Ιστορικό, τιμές, συμφωνίες…" rows={4} />
                      </CField>
                      <CField d={cf('contact.files')}>
                        <FileUploader files={form.extra.files || []} onChange={v => setExtra('files', v)} contactId={editContact?.id} />
                      </CField>
                    </div>
                  </>
                )}
              </div>
              {error && <div style={{ marginTop: 14, background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '11px 16px', color: 'var(--negative)', fontSize: 13 }}>{error}</div>}
            </div>

            <div style={{ padding: '16px 28px 24px', flexShrink: 0, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
              <button type="button" onClick={closeModal} style={{ flex: 1, padding: '12px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px 0', borderRadius: T.radius.btn, border: 'none', background: saving ? 'var(--border-default)' : 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                {saving ? 'Αποθήκευση…' : editContact ? 'Αποθήκευση Αλλαγών' : 'Προσθήκη Επαφής'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div role="dialog" aria-modal="true" aria-label="Επιβεβαίωση διαγραφής" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 24, padding: 36, width: '100%', maxWidth: 380, border: '1px solid var(--border-subtle)', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
            </div>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Διαγραφή Επαφής;</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 28px', lineHeight: 1.5 }}>Αυτή η ενέργεια δεν αναιρείται.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={() => handleDelete(deleteId!)} style={{ flex: 1, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--negative)', color: 'var(--text-inverse)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Διαγραφή</button>
            </div>
          </div>
        </div>
      )}

      {dup && (
        <div role="dialog" aria-modal="true" aria-label="Επιβεβαίωση μαζικής διαγραφής" style={{ position: 'fixed', inset: 0, background: T.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontFamily: T.font.sans, fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Υπάρχει ήδη παρόμοια επαφή</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 16px', lineHeight: 1.55 }}>Βρέθηκε επαφή με το ίδιο τηλέφωνο ή ΑΦΜ. Θέλεις να τη συγχωνεύσεις (να συμπληρωθούν τα νέα στοιχεία) ή να δημιουργήσεις ξεχωριστή εγγραφή;</p>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{dup.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {dup.phone && <span style={{ fontFamily: T.font.mono }}>{dup.phone}</span>}
                {dup._extra?.afm && <span title="Αριθμός Φορολογικού Μητρώου">ΑΦΜ {dup._extra.afm}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setDup(null)} style={{ flex: 1, minWidth: 90, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>Ακύρωση</button>
              <button type="button" onClick={() => persist('insert')} disabled={saving} style={{ flex: 1, minWidth: 120, padding: '11px 0', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Ξεχωριστή</button>
              <button type="button" onClick={() => persist('merge', dup)} disabled={saving} style={{ flex: 1.4, minWidth: 130, padding: '11px 0', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Συγχώνευση…' : 'Συγχώνευση'}</button>
            </div>
          </div>
        </div>
      )}

      {detail && <ContactDossier contact={detail} propertyId={propertyId} branding={branding} onVcard={() => downloadVcf([detail], (detail.full_name || 'epafi').replace(/[^\w.\-]+/g, '_') + '.vcf')} onClose={() => setDetailId(null)}
        onEdit={() => openEdit(detail)}
        onDelete={() => setDeleteId(detail.id)}
        onQuickExpense={() => setQuickExpense(detail)}
        onQuickCalendar={() => setQuickCalendar(detail)}
        onShowHistory={() => setHistoryContact(detail)}
        onShowQR={() => setQrContact(detail)} refreshKey={dossierRefresh} />}
      {quickExpense && <QuickExpenseModal contact={quickExpense} propertyId={propertyId} userId={userId} onClose={() => setQuickExpense(null)} onSaved={() => { notifyOk('Δαπάνη αποθηκεύτηκε'); setDossierRefresh(x => x + 1) }} />}
      {quickCalendar && <QuickCalendarModal contact={quickCalendar} propertyId={propertyId} userId={userId} onClose={() => setQuickCalendar(null)} onSaved={(date) => { linkAppointmentToContact(quickCalendar, date); notifyOk('Ραντεβού προστέθηκε, καταχωρήθηκε και στην επαφή') }} />}
      {historyContact && <HistoryModal contact={historyContact} propertyId={propertyId} onClose={() => setHistoryContact(null)} />}
      {qrContact && <QRCodeModal contact={qrContact} onClose={() => setQrContact(null)} />}
    </div>
  )
}