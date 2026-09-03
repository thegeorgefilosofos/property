'use client'

import { useState, useEffect, useCallback, useContext, useMemo, useRef, createContext, type ElementType } from 'react'
import { useCoarsePointer } from '@/components/useCoarsePointer'
import { downloadWorkbook } from './sheets';
import { qrDataUrl } from '@/lib/qr';
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import * as expenseStore from '@/lib/data/expenses'
import * as calendar from '@/lib/data/calendar'
// Οι επαφές έχουν ένα σπίτι: lib/data/contacts.
import * as contactStore from '@/lib/data/contacts';
import { inferRole } from '@/lib/contacts/roles'
import { alphaBucket, buildAlphaIndex, compareNames, initialsOf, type AlphaEntry } from '@/lib/contacts/alpha'
import { Phone, Mail, X, Search, Globe, MapPin, FileText, QrCode, Printer, History, Receipt, CalendarPlus, Users, Building2, Wrench, Trees, UserCheck, Zap, Wifi, Landmark, Shield, Pencil, Trash2, Copy, MessageSquare, UserPlus, Camera, SearchX } from 'lucide-react'
import { DatePicker, CustomSelect, Toggle, InfoDot } from './UIComponents'
import { T, PageTitle, fieldRow, SecHdr, Btn, EmptyState, fn, fe, Skeleton, SkeletonKPIs, SelectBox, ABSENT, ABSENT_SHORT, Modal, SideSheet, localDay, pressable, pageShell } from '@/components/Theme'
import { showTool, SHOW_FROM } from '@/lib/ui/thresholds'
import { ActionMenu } from '@/components/ActionMenu'
import { notify, notifyOk, notifyError } from '@/components/Toast'
import { saved } from '@/components/dbWrite'
import { confirmDialog } from '@/components/confirmBus'
import { useReportBranding, type ReportBranding } from '@/lib/reportBranding'
import { reportHead, reportHeader, reportSection, reportKpi, reportDisclaimer, openReport, rEsc } from './reportPdf'
import { uploadUserScoped } from '@/lib/storage/scopedUpload';
import { CONTACT_BUCKET, removeFiles, linkFor, type ContactFile } from '@/lib/storage/contactFiles';
import { formFields, CONTACT_FIELDS, type FieldContext, type FieldDecision } from '@/lib/property/fields';
import { athensToday, isoDate, daysUntilOrNull } from '@/lib/core/time';
import { INK, INK_FAINT, INK_MUTED, PAPER_ALT, RULE } from '@/lib/print/ink';
import { downloadFile } from '@/lib/core/download';
import { MSG, SAY, failed } from '@/lib/core/dbError';
// Το Αρχείο έχει ένα σπίτι: lib/data/documents.
import * as documents from '@/lib/data/documents';
import { useLoad } from '@/app/hooks/useLoad';
import { toggleIn } from '@/lib/core/toggleSet';

// ── Δομικά του ντοσιέ επαφής ──────────────────────────────────────────────
// ΣΕ MODULE SCOPE: ορισμένα μέσα στο DossierPanel, ξαναγεννιούνταν σε κάθε
// render του πάνελ. Ο React έβλεπε νέο τύπο component κάθε φορά, άρα
// αποσυναρμολογούσε και ξανάχτιζε ΟΛΟ το ντοσιέ — δεκαοκτώ κόμβοι, σε κάθε
// πληκτρολόγηση ή ανανέωση. Δεν είναι μόνο σπατάλη: ό,τι state ζει μέσα τους
// (scroll, focus, επιλογή κειμένου) χανόταν.
const DossierRow = ({ icon: Ic, children, onCopy }: { icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>; children: React.ReactNode; onCopy?: () => void }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <Ic size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
    <span style={{ flex: 1, fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
    {onCopy && <button type="button" onClick={onCopy} title="Αντιγραφή" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 4, flexShrink: 0 }}><Copy size={13} /></button>}
  </div>
)
const DossierSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '15px 16px', boxShadow: 'var(--elev-1)' }}>
    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{title}</div>
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
//    αναφορά στην Πολιτική απορρήτου, ενώ η ίδια εφαρμογή υπόσχεται στον χρήστη ότι
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
//    πάντα ορατό και στην κενή κατάσταση.
//
// 3. Ο ΚΥΚΛΟΣ ΠΑΡΑΣΤΑΤΙΚΟ ↔ ΕΠΑΦΗ ΗΤΑΝ ΣΠΑΣΜΕΝΟΣ. Οι δαπάνες ταίριαζαν με
//    `description.ilike.*όνομα*`: ο «Παπαδόπουλος Υδραυλικός» δεν έβρισκε τη δαπάνη
//    «Συντήρηση — Παπαδόπουλος». Το ΑΦΜ αποθηκευόταν, υπάρχει και στα σαρωμένα
//    έγγραφα και ποτέ δεν συνέδεε τα δύο. → Ταίριασμα με ΑΦΜ (contacts.afm ↔
//    property_documents.provider_afm) και «όλα τα παραστατικά αυτού του παρόχου».
//
// 4. ΕΞΙ ΠΕΔΙΑ ΧΩΡΙΣ ΚΑΜΙΑ ΕΝΕΡΓΕΙΑ έφυγαν (αριθμός μητρώου/άδειας, δεύτερος IBAN,
//    ωράριο, τελευταία επαφή, αξιολόγηση με αστέρια, «κατάσταση σχέσης» που κόλλαγε
//    την ετικέτα «Προβληματικός» πάνω σε όνομα ανθρώπου), μαζί με την «Υπενθύμιση
//    επικοινωνίας» που υποσχόταν ρυθμό και έδινε μία παγωμένη ημερομηνία και τις
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
  files?: ContactFile[]
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
  // Ο φάκελος του `notes` είναι ελεύθερος: τα δηλωμένα πεδία είναι όσα ΔΙΑΒΑΖΕΙ
  // η οθόνη, όχι όσα υπάρχουν. Παλιές επαφές κουβαλούν και άλλα.
  [key: string]: unknown
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
  width: '100%', height: T.h.lg, padding: '10px 16px', borderRadius: 6,
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
      { value: 'elec_fysiko', label: 'Φυσικό αέριο Ελλάδος' },
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
    id: 'telecom', label: 'Τηλεφωνία και Internet', color: 'var(--accent)', Icon: Wifi,
    roles: [
      { value: 'tel_ote', label: 'Cosmote (OTE)' },
      { value: 'tel_vodafone', label: 'Vodafone' },
      { value: 'tel_nova', label: 'Nova' },
      { value: 'tel_inalan', label: 'Inalan' },
      { value: 'tel_other', label: 'Άλλος Πάροχος Internet / Τηλεφωνίας' },
    ],
  },
  {
    id: 'banks', label: 'Τράπεζες και Χρηματοδότηση', color: 'var(--accent)', Icon: Landmark,
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
    id: 'real_estate', label: 'Μεσιτεία και Αξιολόγηση', color: 'var(--accent)', Icon: Building2,
    roles: [
      { value: 'agent', label: 'Μεσίτης Ακινήτων' },
      { value: 'appraiser', label: 'Εκτιμητής Ακινήτων' },
      { value: 'prop_mgmt', label: 'Εταιρεία Διαχείρισης' },
      { value: 'manager', label: 'Διαχειριστής Πολυκατοικίας' },
      { value: 'concierge', label: 'Θυρωρός / Concierge' },
    ],
  },
  {
    id: 'technical', label: 'Τεχνικοί και Μάστορες', color: 'var(--accent)', Icon: Wrench,
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
    id: 'outdoor', label: 'Εξωτερικοί Χώροι και Υπηρεσίες', color: 'var(--accent)', Icon: Trees,
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
    id: 'tenants', label: 'Ενοικιαστές και Γείτονες', color: 'var(--accent)', Icon: UserCheck,
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
// φιλτράρει τη δική του λίστα και κανείς δεν του υποβάλλει κρίση για τρίτον.

// ─── Serialize / Parse ────────────────────────────────────────────────────────
function parseContact(c: Contact): Contact {
  let extra: ContactExtra = {}; let freeNotes = c.notes || ''
  const decoded = contactStore.decodeNotes(c.notes)
  extra = decoded.extra as ContactExtra; freeNotes = decoded.notes
  return { ...c, _extra: extra, _freeNotes: freeNotes }
}
const serializeNotes = (extra: ContactExtra, freeNotes: string): string =>
  contactStore.encodeNotes(extra, freeNotes)
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
  try { return localDay(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
// Η πολιτική «null όταν λείπει, 0 όταν είναι άκυρη» ζει στο lib/core/time.
const daysUntil = daysUntilOrNull
function isOverdue(d: string) { const n = daysUntil(d); return n !== null && n < 0 }
// HTML-escape any dynamic value interpolated into printable/PDF HTML written via document.write.

// ─── Input primitives ─────────────────────────────────────────────────────────
// Το `min` περνά μέχρι το πεδίο: ποσό αμοιβής συνεργείου μείον πενήντα ευρώ
// δεν υπάρχει και το πεδίο δεν έχει λόγο να το δέχεται.
// Ο τύπος ΔΕΝ δέχεται 'date': οι ημερομηνίες αυτής της οθόνης περνούν από τον
// DatePicker, που τον χρησιμοποιεί ήδη τρεις φορές.
// ΤΟ ΟΝΟΜΑ ΤΟΥ ΠΕΔΙΟΥ ΤΟ ΞΕΡΕΙ ΗΔΗ Ο ΓΟΝΕΑΣ, ΚΑΙ ΔΕΝ ΕΦΤΑΝΕ ΠΟΤΕ ΣΤΟ ΠΕΔΙΟ.
// Το `CField` γράφει την ετικέτα («ΟΝΟΜΑ», «ΤΗΛΕΦΩΝΟ», «ΑΦΜ») ως ΑΔΕΛΦΟ του
// κουτιού, όχι συνδεδεμένη με αυτό. Ο βλέπων διαβάζει τη σειρά και καταλαβαίνει·
// ο αναγνώστης οθόνης ακούει «πλαίσιο κειμένου» δεκατέσσερις φορές στη σειρά.
// Το `placeholder` δεν σώζει: σβήνεται με τον πρώτο χαρακτήρα.
//
// ΓΙΑΤΙ ΣΥΜΦΡΑΖΟΜΕΝΑ ΚΑΙ ΟΧΙ ΙΔΙΟΤΗΤΑ ΣΕ ΚΑΘΕ ΚΛΗΣΗ. Οι κλήσεις είναι
// δεκαπέντε και η ετικέτα υπάρχει ΗΔΗ, μία φορά, στο μητρώο πεδίων. Γραμμένη
// ξανά σε κάθε `<Inp>` θα ήταν το ίδιο κείμενο δύο φορές, με τον γνωστό
// επόμενο βαθμό: τη μέρα που αλλάξει η μία και μείνει η άλλη.
const FieldName = createContext<string | undefined>(undefined);

function Inp({ value, onChange, placeholder, type = 'text', min, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: 'text' | 'email' | 'tel' | 'url' | 'search' | 'number' | 'password'; min?: number; ariaLabel?: string }) {
  const named = useContext(FieldName);
  return <input type={type} min={min} value={value} aria-label={ariaLabel ?? named} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={iStyle} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
}
function Txt({ value, onChange, placeholder, rows = 4, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; ariaLabel?: string }) {
  const named = useContext(FieldName);
  return <textarea value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel ?? named} placeholder={placeholder} rows={rows} style={{ ...iStyle, height: 'auto', resize: 'vertical', lineHeight: 1.6 }} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
}
// Πεδίο ΜΕ ΤΟ «ΓΙΑΤΙ» ΤΟΥ, από το μητρώο. Αν το πεδίο δεν αφορά αυτόν τον χρήστη,
// δεν αποδίδεται καθόλου — δεν κλειδώνεται και δεν εμφανίζεται γκριζαρισμένο.
// ═══ ΤΟ «ΓΙΑΤΙ» ΗΤΑΝ ΜΟΝΙΜΗ ΠΑΡΑΓΡΑΦΟΣ ΚΑΤΩ ΑΠΟ ΤΟ ΠΕΔΙΟ ══════════════════════
// Το ΑΦΜ της επαφής κουβαλούσε τέσσερις σειρές κειμένου κάτω από ένα κουτί δύο
// εκατοστών: «Συνδέει τα παραστατικά του με την επαφή. Χωρίς αυτό, το ταίριασμα
// γίνεται με το όνομα και αστοχεί.» Σωστό, χρήσιμο και διαβάζεται ΜΙΑ φορά στη
// ζωή του χρήστη — μετά είναι θόρυβος που ψηλώνει τη φόρμα και σπρώχνει τα
// επόμενα πεδία εκτός οθόνης. Και η ίδια η σειρά έσπαγε τη στοίχιση: το πεδίο
// δίπλα του τελείωνε τέσσερις σειρές ψηλότερα.
//
// Πάει στο κυκλάκι, όπως κάθε εξήγηση της εφαρμογής. Το κείμενο δεν χάνεται
// ούτε για τον αναγνώστη οθόνης: το `InfoDot` το γράφει σε κρυφό κόμβο που
// ανακοινώνεται με το κουμπί του.
function CField({ d, required, children }: { d?: FieldDecision; required?: boolean; children: React.ReactNode }) {
  if (!d) return null
  return (
    <div>
      <FL>{d.label}{required || d.critical ? ' *' : ''}{!d.selfEvident && d.why ? <InfoDot text={d.why} /> : null}</FL>
      {/* Η ετικέτα που μόλις γράφτηκε ταξιδεύει και ΜΕΣΑ στο πεδίο, ως όνομα για
          τον αναγνώστη οθόνης. Το `why` δεν μπαίνει: είναι περιγραφή, όχι όνομα·
          ένα όνομα δύο προτάσεων ακούγεται σε κάθε εστίαση. */}
      <FieldName.Provider value={d.label}>{children}</FieldName.Provider>
    </div>
  )
}
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{children}</label>
}
// ΕΔΩ ΗΤΑΝ ΤΟ AddressAutocomplete (52 γραμμές). Έστελνε ΚΑΘΕ πληκτρολόγηση του
// χρήστη σε τρίτο εξυπηρετητή (nominatim.openstreetmap.org) για να προτείνει
// διευθύνσεις: δηλαδή διευθύνσεις γραφείων τρίτων προσώπων έφευγαν εκτός της
// υποδομής μας, χωρίς να αναφέρεται πουθενά στην Πολιτική απορρήτου, στην ίδια
// εφαρμογή που υπόσχεται στον χρήστη ότι ξέρει ποιος βλέπει τα δεδομένα του.
// Και η ίδια η πολιτική χρήσης του Nominatim απαγορεύει ρητά το autocomplete —
// σε παραγωγή η υπηρεσία θα μπλόκαρε και το πεδίο θα σταματούσε σιωπηλά.
// Το πεδίο είναι πλέον απλό κείμενο. Ο χάρτης ανοίγει με ρητό κλικ του χρήστη.

// Επικεφαλίδα ενότητας φόρμας — διακριτική, premium, με λεπτή γραμμή.
function SecHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 2px' }}>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
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
    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: 800, flexShrink: 0,
    transition: 'border-color 0.15s, color 0.15s, background 0.15s', boxShadow: 'var(--elev-1)',
  }
  const enter = (e: React.MouseEvent<HTMLElement>) => { const s = e.currentTarget.style; s.borderColor = 'var(--accent-border)'; s.color = 'var(--accent)'; s.background = 'var(--accent-soft)' }
  const leave = (e: React.MouseEvent<HTMLElement>) => { const s = e.currentTarget.style; s.borderColor = 'var(--border-subtle)'; s.color = 'var(--text-secondary)'; s.background = 'var(--bg-elevated)' }
  const content = children ?? label
  // ΤΟ ΣΤΡΟΓΓΥΛΟ ΤΩΝ 30 ΜΕΝΕΙ 30, Ο ΣΤΟΧΟΣ ΓΙΝΕΤΑΙ 56. Το δάπεδο των 44 του
  // globals.css πιάνει `button`, `select` και `input`: ο σύνδεσμος έμενε στα 30
  // και το κουμπί γινόταν 30 επί 44, δηλαδή δύο ΔΙΑΦΟΡΕΤΙΚΟΙ στόχοι για δύο
  // κουμπιά που φαίνονται ίδια. Το `po-box` τα εξισώνει και στα δύο, χωρίς να
  // πειραχτεί ο κύκλος: αόρατη ζώνη −13 γύρω γύρω.
  if (as === 'a') return <a className="po-box" href={href} target={target} rel={rel} title={title} aria-label={title} style={base} onMouseEnter={enter} onMouseLeave={leave}>{content}</a>
  return <button type="button" className="po-box" onClick={onClick} title={title} aria-label={title} style={base} onMouseEnter={enter} onMouseLeave={leave}>{content}</button>
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
        <input value={input} aria-label="Νέα ετικέτα" onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add(input))} placeholder="Νέα ετικέτα…" style={{ ...iStyle, flex: 1 }} />
        <button type="button" onClick={() => add(input)} style={{ padding: '10px 16px', borderRadius: T.radius.inner, border: '1px solid var(--accent-border)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
      </div>
    </div>
  )
}

// ─── Notes Log ────────────────────────────────────────────────────────────────
// Το «ανέβασμα φωτογραφίας επαφής» έφυγε από τη φόρμα: ήταν το ΠΡΩΤΟ πράγμα που
// έβλεπε ο χρήστης όταν καταχωρούσε υδραυλικό και δεν κάνει τίποτα. Όσες επαφές
// έχουν ήδη φωτογραφία συνεχίζουν να τη δείχνουν στην κάρτα και στο ντοσιέ.

// ─── File Uploader ────────────────────────────────────────────────────────────
function FileUploader({ files, onChange, contactId }: { files: ContactFile[]; onChange: (f: ContactFile[]) => void; contactId?: string }) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true)
    // ΙΔΙΩΤΙΚΟΣ ΚΑΔΟΣ, ΚΑΙ ΑΠΟΘΗΚΕΥΕΤΑΙ ΤΟ ΜΟΝΟΠΑΤΙ ΑΝΤΙ ΓΙΑ ΤΗ ΔΙΕΥΘΥΝΣΗ. Ο
    // «avatars» είναι δηλωμένος δημόσιος: το μισθωτήριο και το τιμολόγιο με το
    // ΑΦΜ κατέβαιναν από οποιονδήποτε ήξερε τη διεύθυνση.
    const { path, error } = await uploadUserScoped(supabase, CONTACT_BUCKET, `contact-files/${contactId || 'new'}/${Date.now()}.${file.name.split('.').pop()}`, file, { upsert: true, contentType: file.type || undefined })
    if (error) notifyError('Το αρχείο δεν ανέβηκε')
    else onChange([...files, { name: file.name, url: '', path, size: file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`, uploaded: new Date().toISOString() }])
    setUploading(false); if (fileRef.current) fileRef.current.value = ''
  }

  // ΤΟ «Χ» ΣΒΗΝΕΙ ΚΑΙ ΤΟ ΑΡΧΕΙΟ, ΟΧΙ ΜΟΝΟ ΤΗ ΓΡΑΜΜΗ. Πριν, το αντικείμενο
  // έμενε στον κάδο για πάντα και ο χρήστης δεν είχε πια τρόπο να το βρει.
  const drop = async (i: number) => {
    const gone = files[i]
    onChange(files.filter((_, j) => j !== i))
    const failed = await removeFiles(supabase, [gone])
    if (failed) notifyError('Η γραμμή αφαιρέθηκε αλλά το αρχείο δεν σβήστηκε')
  }

  // Ο σύνδεσμος υπογράφεται τη στιγμή που τον ζητά ο χρήστης και ζει μία ώρα.
  const open = async (f: ContactFile) => {
    const href = await linkFor(supabase, f)
    if (href) window.open(href, '_blank', 'noopener')
    else notifyError('Το αρχείο δεν άνοιξε')
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {/* ΤΕΣΣΕΡΑ ΚΕΙΜΕΝΑ ΓΙΑ ΝΑ ΠΕΙ ΚΑΝΕΙΣ «ΑΝΕΒΑΣΕ ΕΝΑ ΑΡΧΕΙΟ». Με άδεια λίστα, η
            οθόνη έγραφε τίτλο («Κανένα αρχείο ακόμη»), υπότιτλο («Ανέβασε συμβόλαια,
            τιμολόγια ή φωτογραφίες που αφορούν αυτή την επαφή»), το κουμπί
            («+ Προσθήκη Αρχείου») και από κάτω μια τέταρτη σειρά με το «γιατί» του
            μητρώου. Το κουμπί λέει ήδη και τι κάνει και τι δέχεται· τα άλλα τρία
            ήταν εκατόν είκοσι εικονοστοιχεία για να το επαναλάβουν. Μένει το κουμπί. */}
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <FileText size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{f.size} · {new Date(f.uploaded).toLocaleDateString('el-GR')}</div>
            </div>
            <Btn variant="ghost" onClick={() => open(f)}>Άνοιγμα</Btn>
            <button type="button" onClick={() => drop(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}><X size={15} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 16px', borderRadius: T.radius.inner, border: '1px dashed var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--fs-base)', width: '100%' }}>
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
    <Modal open onClose={onClose} title="QR Επαφής" subtitle="Σάρωσε για να αποθηκεύσεις τα στοιχεία"
      icon={<QrCode size={17} />} size="sm" footer={<Btn onClick={onClose}>Κλείσιμο</Btn>}>
      <div style={{ textAlign: 'center' }}>
        {/* ΤΟ ΜΟΝΟ ΚΥΡΙΟΛΕΚΤΙΚΟ ΛΕΥΚΟ ΤΟΥ ΑΡΧΕΙΟΥ, ΚΑΙ ΜΕ ΛΟΓΟ: ο κώδικας QR
            διαβάζεται από τη ΔΙΑΦΟΡΑ φωτεινότητας. Με token επιφάνειας, στο
            σκούρο θέμα το πλαίσιο γίνεται σκούρο και η κάμερα δεν βρίσκει τα
            τρία τετράγωνα εντοπισμού — ο κώδικας παύει να σαρώνεται. */}
        <div style={{ padding: T.sp.md, background: 'var(--qr-paper)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', display: 'inline-block' }}>
          <img src={qrUrl} alt="QR" style={{ width: 190, height: 190, borderRadius: 6, display: 'block' }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: T.sp.lg }}>{contact.full_name}</div>
        {contact.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, marginTop: 3 }}>{contact.phone}</div>}
      </div>
    </Modal>
  )
}

// ─── ΤΑΙΡΙΑΣΜΑ ΕΠΑΦΗΣ ↔ ΠΑΡΑΣΤΑΤΙΚΩΝ ─────────────────────────────────────────
// ΤΟ ΑΦΜ ΕΙΝΑΙ Ο ΣΥΝΔΕΣΜΟΣ. Το όνομα δεν είναι: ο «Παπαδόπουλος Υδραυλικός» δεν
// βρίσκει τη δαπάνη «Συντήρηση — Παπαδόπουλος» και η «ΔΕΗ Α.Ε.» δεν βρίσκει τη
// «ΔΕΗ». Το ΑΦΜ γράφεται μία φορά, είναι ένα και υπάρχει και στα σαρωμένα έγγραφα
// (property_documents.provider_afm). Το ταίριασμα με ελεύθερο κείμενο μένει ΜΟΝΟ
// ως εφεδρεία για παλιές δαπάνες που δεν έχουν contact_id.
const digitsOf = (v?: string | null) => (v || '').replace(/\D/g, '')

/** Όλα τα παραστατικά αυτού του παρόχου, με ΑΦΜ. Αυτό ζητά ο λογιστής. */
async function fetchSupplierDocs(afm: string, propertyId: string) {
  if (digitsOf(afm).length !== 9) return []
  // Αμυντικά: αν η στήλη δεν υπάρχει ακόμη στη βάση, γυρνάμε κενό αντί να σκάσουμε.
  return documents.ofSupplierAfm<SupplierDoc>(
    supabase, propertyId, digitsOf(afm), 'id,title,category,doc_date,issue_date,amount,file_path')
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
      const [data, d] = await Promise.all([
        expenseStore.ledger<{ id: string; description: string; amount: number; date: string }>(supabase, propertyId, { columns: 'id,description,amount,date', or: filter, order: { column: 'date', ascending: false }, limit: 20 }),
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
    ...expenses.map(e => ({ date: e.date, title: e.description, sub: fe(e.amount ?? 0), color: 'var(--text-secondary)' })),
    ...docs.map(d => ({ date: (d.issue_date || d.doc_date || '').slice(0, 10), title: d.title || d.category || 'Παραστατικό', sub: d.amount ? fe(d.amount) : 'Παραστατικό', color: 'var(--accent)' })),
    ...notesLog.map(n => ({ date: n.ts.split('T')[0], title: n.text, sub: 'Σημείωση', color: 'var(--accent)' })),
  ].filter(x => x.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)
  return (
    <Modal open onClose={onClose} title="Ιστορικό συνεργασίας" subtitle={contact.full_name} icon={<History size={17} />} size="md">
      {loading ? (
        <div><SkeletonKPIs n={3} />{[0, 1, 2].map(i => <Skeleton key={i} h={48} r={10} style={{ marginBottom: 12 }} />)}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
            {[{ label: 'Συνολικές Δαπάνες', value: totalExpenses > 0 ? fe(totalExpenses) : fe(0), color: 'var(--text-primary)' },
              { label: 'Παραστατικά με το ΑΦΜ του', value: docs.length > 0 ? `${docs.length}${docsTotal > 0 ? ' · ' + fe(docsTotal) : ''}` : (afm.length === 9 ? '0' : ABSENT_SHORT), color: 'var(--text-primary)' },
              { label: 'Σημειώσεις', value: notesLog.length > 0 ? `${notesLog.length}` : '0', color: 'var(--text-primary)' }].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-surface)', borderRadius: T.radius.inner, padding: '14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{s.value}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {afm.length !== 9 && (
            <div style={{ padding: '11px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
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
                      <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-primary)', fontWeight: 500, marginBottom: 2 }}>{item.title}</div>
                      <div style={{ display: 'flex', gap: 10 }}><span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{fmtDate(item.date)}</span><span style={{ fontSize: 'var(--fs-xs)', color: item.color, fontWeight: 600 }}>{item.sub}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── ΚΑΡΤΑ ΕΠΑΦΗΣ ΓΙΑ ΕΚΤΥΠΩΣΗ ───────────────────────────────────────────────
//
// ΗΤΑΝ ΤΟ ΕΝΑΤΟ ΧΕΙΡΟΓΡΑΦΟ ΕΓΓΡΑΦΟ και τα μισά του χρώματα δεν έκαναν τίποτα:
//
//   • `.cat{color:${meta.groupColor}}` — το groupColor είναι `var(--accent)`,
//     δηλαδή μεταβλητή CSS που ΔΕΝ ΥΠΑΡΧΕΙ σε αυτόνομο παράθυρο εκτύπωσης. Η
//     γραμμή κατηγορίας έβγαινε άχρωμη. (Το `#888` ήταν μόνο η εφεδρεία για
//     άγνωστο ρόλο — δηλαδή το μοναδικό χρώμα που δούλευε ήταν το λάθος.)
//   • `.status` — κλάση ορισμένη και ΠΟΥΘΕΝΑ χρησιμοποιημένη.
//   • `#333` για το κείμενο των γραμμών, δίπλα στο `INK` (#111): δύο «κύρια
//     μελάνια» στο ίδιο χαρτί. Και `#bbb` για το υποσέλιδο, δίπλα στο INK_FAINT.
//   • Τρία έγχρωμα σήματα (WhatsApp πράσινο, Viber μωβ, IRIS κεχριμπαρένιο) —
//     σημασιολογικό χρώμα σε τυπωμένο χαρτί, που ούτως ή άλλως βγαίνει γκρι.
//     Η πληροφορία λέγεται με τις ίδιες τρεις λέξεις, χωρίς χρώμα.
//
// Τυπογραφία και επικεφαλίδα έρχονται πλέον από το `reportPdf.ts`, όπως στα
// άλλα οκτώ έγγραφα. Δικό της μένει μόνο το πλάτος — μια κάρτα επαφής είναι
// στενή εξ ορισμού — και η διάταξη «ετικέτα δίπλα σε τιμή».
const CONTACT_CARD_CSS = `
  .page{max-width:460px}
  .crow{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13px;color:${INK}}
  .clabel{min-width:88px;color:${INK_FAINT};font-size:11px;text-transform:uppercase;padding-top:1px;flex-shrink:0}
  .ctag{display:inline-block;padding:2px 9px;border-radius:20px;background:${PAPER_ALT};border:1px solid ${RULE};font-size:11px;color:${INK_MUTED};margin-right:4px}
  .cbadge{font-size: 11px;font-weight:700;color:${INK_MUTED};margin-left:6px;letter-spacing:.04em}
`

function printContactCard(contact: Contact, branding?: ReportBranding | null) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupLabel: '' }
  const extra = contact._extra || {}
  const row = (label: string, value: string, mono = false) =>
    `<div class="crow"><span class="clabel">${rEsc(label)}</span><span${mono ? ' style="font-family:\'Roboto Mono\',monospace"' : ''}>${value}</span></div>`
  const badge = (text: string) => `<span class="cbadge">${rEsc(text)}</span>`

  const html = reportHead(`Επαφή · ${contact.full_name}`, CONTACT_CARD_CSS)
    + `<body><div class="page">`
    + reportHeader(branding, meta.groupLabel || 'Επαφή')
    + `
    <h1>${rEsc(contact.full_name)}</h1>
    <div class="sub">${rEsc(meta.label)}</div>

    ${reportSection('Στοιχεία επικοινωνίας')}
    ${contact.phone ? row('Τηλέφωνο', rEsc(contact.phone) + (extra.whatsapp ? badge('WhatsApp') : '') + (extra.viber ? badge('Viber') : '')) : ''}
    ${extra.phone2 ? row('Δεύτερο τηλέφωνο', rEsc(extra.phone2)) : ''}
    ${contact.email ? row('Ηλεκτρονικό ταχυδρομείο', rEsc(contact.email)) : ''}
    ${extra.website ? row('Ιστοσελίδα', rEsc(extra.website)) : ''}
    ${extra.office_address ? row('Διεύθυνση', rEsc(extra.office_address)) : ''}
    ${extra.afm ? row('ΑΦΜ', rEsc(extra.afm), true) : ''}
    ${extra.iban ? row('IBAN', rEsc(extra.iban) + (extra.iris ? badge('IRIS') : ''), true) : ''}
    ${(extra.tags || []).length > 0 ? `<div style="margin-top:14px">${(extra.tags || []).map(t => `<span class="ctag">${rEsc(t)}</span>`).join('')}</div>` : ''}
    ${contact._freeNotes ? reportSection('Σημειώσεις') + `<div class="note">${rEsc(contact._freeNotes)}</div>` : ''}

    ${reportDisclaimer('Κάρτα επαφής από το μητρώο συνεργατών του ακινήτου.', branding)}
    </div></body></html>`
  openReport(html)
}

// ─── Quick Modals ─────────────────────────────────────────────────────────────
function QuickExpenseModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState(contact.full_name); const [saving, setSaving] = useState(false)
  // ΦΡΟΥΡΑ ΚΛΕΙΣΙΜΑΤΟΣ. Το χειρόγραφο παράθυρο ΔΕΝ έκλεινε ούτε με Escape ούτε
  // με κλικ στο φόντο — το Modal δίνει και τα δύο. Χωρίς φρουρά, ένα Escape στη
  // μέση της εγγραφής ξεφορτώνει τη φόρμα ενώ η καταχώρηση συνεχίζει.
  const close = () => { if (!saving) onClose() }
  const save = async () => {
    if (!amount) return
    setSaving(true)
    const ok = await saved('Η δαπάνη δεν αποθηκεύτηκε', expenseStore.insert(supabase, [expenseStore.row({ propertyId, userId }, { contact_id: contact.id, amount: parseFloat(amount), description, date: athensToday(), category: 'Αμοιβές Συνεργατών' })]))
    setSaving(false)
    if (!ok) return
    onSaved(); onClose()
  }
  return (
    <Modal open onClose={close} title="Νέα δαπάνη" subtitle={contact.full_name} icon={<Receipt size={17} />} size="sm"
      footer={<>
        <Btn onClick={close} disabled={saving}>Ακύρωση</Btn>
        <Btn variant="primary" onClick={save} disabled={saving || !amount}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση δαπάνης'}</Btn>
      </>}>
      <div><FL>Ποσό (€)</FL><Inp value={amount} onChange={setAmount} placeholder="Παράδειγμα: 150" type="number" min={0} /></div>
      <div><FL>Περιγραφή</FL><Inp value={description} onChange={setDescription} placeholder="Περιγραφή εργασίας" /></div>
    </Modal>
  )
}
function QuickCalendarModal({ contact, propertyId, userId, onClose, onSaved }: { contact: Contact; propertyId: string; userId: string; onClose: () => void; onSaved: (date: string) => void }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const [title, setTitle] = useState('Ραντεβού με ' + contact.full_name); const [date, setDate] = useState(isoDate(tomorrow)); const [saving, setSaving] = useState(false)
  // Ίδια φρουρά με τη «Νέα δαπάνη»: Escape και κλικ στο φόντο δεν κλείνουν όσο
  // η καταχώρηση είναι στον αέρα.
  const close = () => { if (!saving) onClose() }
  const save = async () => {
    if (!title || !date) return
    setSaving(true)
    const ok = await saved('Το ραντεβού δεν αποθηκεύτηκε', calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'manual', { title, event_date: date, category: 'tenant' })]))
    setSaving(false)
    if (!ok) return
    onSaved(date); onClose()
  }
  return (
    <Modal open onClose={close} title="Νέο ραντεβού" subtitle={contact.full_name} icon={<CalendarPlus size={17} />} size="sm"
      footer={<>
        <Btn onClick={close} disabled={saving}>Ακύρωση</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Προσθήκη στο Ημερολόγιο'}</Btn>
      </>}>
      <div><FL>Τίτλος</FL><Inp value={title} onChange={setTitle} placeholder="Τίτλος ραντεβού" /></div>
      <div><FL>Ημερομηνία</FL><DatePicker value={date} onChange={v => setDate(v)} /></div>
    </Modal>
  )
}

// ─── Excel Export (SheetJS, ίδιο μοτίβο με τα υπόλοιπα φύλλα) ───────────────
async function exportContactsExcel(contacts: Contact[]) {
  const XLSX = (await import('xlsx-js-style')).default
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
    ['PROPERWISE, Κατάσταση Επαφών', ''],
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

  downloadWorkbook(wb, `Επαφές ${athensToday()}`)
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
    on ? ` <span class="muted" style="font-size: 11px;font-weight:600">${rEsc(text)}</span>` : ''

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
            + `<td><div style="font-weight:600;color:${INK}">${rEsc(c.full_name)}</div>`
            +   `<div class="muted" style="font-size: 11px">${rEsc(role)}</div></td>`
            + `<td class="tnum">${c.phone ? rEsc(c.phone) : ABSENT_SHORT}</td>`
            + `<td>${rEsc(c.email || ABSENT)}</td>`
            + `</tr>`
        }).join('')
      + `</tbody></table>`
    : ''

  const groupSections = GROUPS.filter(g => byGroup[g.id]?.length).map(g => {
    const rows = byGroup[g.id].map(c => {
      const ex = c._extra || {}
      const role = ROLE_META[c.role]?.label || c.role
      const iban = ex.iban ? `···${rEsc(ex.iban.slice(-4))}${mark(ex.iris, 'IRIS')}` : ABSENT_SHORT
      return `<tr>`
        + `<td><div style="font-weight:600;color:${INK}">${rEsc(c.full_name)}</div>`
        +   `<div class="muted" style="font-size: 11px">${rEsc(role)}</div></td>`
        + `<td class="tnum">${c.phone ? rEsc(c.phone) : ABSENT_SHORT}${mark(ex.whatsapp, 'WA')}${mark(ex.viber, 'VB')}</td>`
        + `<td>${rEsc(c.email || ABSENT)}</td>`
        + `<td class="tnum">${ex.afm ? rEsc(ex.afm) : ABSENT_SHORT}</td>`
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
// ─── Bulk Action Button ───────────────────────────────────────────────────────
// Ουδέτερο κουμπί (Google-clean) που αποκαλύπτει accent —ή κόκκινο για διαγραφή—
// μόνο στο hover. Γίνεται ανενεργό/ξεθωριασμένο όταν δεν υπάρχει επιλογή.
function BulkBtn({ icon: Icon, label, onClick, disabled, danger }: { icon: ElementType; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  const [hov, setHov] = useState(false)
  const active = hov && !disabled
  return (
    <button type="button" disabled={disabled} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 8, fontSize: 'var(--fs-base)', fontWeight: 600, fontFamily: T.font.sans, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
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
  // ΣΕ ΟΘΟΝΗ ΑΦΗΣ ΔΕΝ ΥΠΑΡΧΕΙ hover, ΑΡΑ ΔΕΝ ΥΠΗΡΧΑΝ ΚΑΙ ΟΙ ΕΝΕΡΓΕΙΕΣ. Κλήση,
  // WhatsApp, Viber, email και ολόκληρο το μενού «···» (Επεξεργασία, Νέα δαπάνη,
  // Ραντεβού, Ιστορικό, QR, Εκτύπωση, Διαγραφή) εμφανίζονταν μόνο με ποντίκι.
  // Δηλαδή σε κινητό — που είναι η πλειονότητα των χρηστών — η καρτέλα Επαφές
  // ήταν λίστα ονομάτων χωρίς καμία ενέργεια. Η εφαρμογή έχει ήδη τη λύση δύο
  // φορές: το `useCoarsePointer` και ένα `@media (hover: none)` στο φύλλο στυλ.
  const coarse = useCoarsePointer()
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
      /* ═══ Η ΚΑΡΤΑ ΕΠΑΦΗΣ ΑΝΑΠΑΥΕΤΑΙ ΟΠΟΥ ΚΑΙ Η ΚΑΡΤΑ ΠΕΛΑΤΗ ══════════════════
         ΜΕΤΡΗΜΕΝΟ ΣΤΟΝ ΠΑΓΚΟ, 22 ΟΘΟΝΕΣ: πέντε κάρτες επαφής ήταν οι μόνες της
         οθόνης χωρίς βάθος, ενώ δίπλα τους οι κάρτες ενότητας ανασηκώνονται.
         Το `boxShadow` πήγαινε από το ΤΙΠΟΤΑ κατευθείαν στο `elev-2` με το
         ποντίκι, δηλαδή η κάρτα δεν ανέβαινε ένα σκαλί, εμφανιζόταν.

         Η `.client-card` του globals.css λέει ήδη πώς αναπαύεται μια κάρτα
         περιεχομένου σε πλέγμα: `surface-raised` με `border-raised` και
         `highlight-inset, elev-1`. Στο hover παίρνει `highlight-inset-strong` με
         `elev-2`. Η κάρτα επαφής είναι το ίδιο πράγμα και παίρνει τα ίδια.

         ΚΑΙ ΤΟ ΠΕΡΙΓΡΑΜΜΑ ΓΙΝΕΤΑΙ ΕΝΟΣ ΕΙΚΟΝΟΣΤΟΙΧΕΙΟΥ. Το 1,5 ήταν το μόνο
         της εφαρμογής: κάθε άλλη κάρτα, εδώ και παντού, γράφει 1. */
      style={{ background: selected ? 'color-mix(in srgb, var(--accent) 6%, var(--surface-raised))' : 'var(--surface-raised)', border: '1px solid ' + (selected ? 'var(--accent)' : hov ? 'var(--accent-border)' : overdue ? 'var(--negative-border)' : 'var(--border-raised)'), borderRadius: T.radius.card, padding: bulkMode ? '18px 18px 16px 46px' : '18px 18px 16px', position: 'relative', boxShadow: selected ? '0 0 0 3px var(--accent-soft)' : hov ? 'var(--highlight-inset-strong), var(--elev-2)' : 'var(--highlight-inset), var(--elev-1)', transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s', cursor: bulkMode ? 'pointer' : 'default' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: overdue ? 'var(--negative)' : 'var(--border-subtle)', borderRadius: `${T.radius.card}px 0 0 ${T.radius.card}px`, opacity: bulkMode ? 0 : 1 }} />
      {bulkMode && <div style={{ position: 'absolute', top: 17, left: 15, zIndex: 2 }}><SelectBox checked={!!selected} onChange={() => onSelect?.()} label={`Επιλογή ${contact.full_name}`} /></div>}
      {overdue && <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--negative)', color: 'var(--text-inverse)', fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '3px 10px', borderRadius: '0 16px 0 8px', letterSpacing: '0.07em' }}>ΛΗΞΗ ΡΑΝΤΕΒΟΥ</div>}
      {(hov || showActions || coarse) && !bulkMode && (
        <div ref={actionsRef} style={{ position: 'absolute', top: 12, right: 12, zIndex: 20 }}>
          {/* Ορατές μόνο οι πιο συχνές ενέργειες — όλες οι υπόλοιπες μπαίνουν στο «···» */}
          <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
            {contact.phone && <QuickAct as="a" href={'tel:' + contact.phone} title="Κλήση"><Phone size={13} /></QuickAct>}
            {extra.whatsapp && contact.phone && <QuickAct as="a" href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" title="WhatsApp" label="WA" />}
            {extra.viber && contact.phone && <QuickAct as="a" href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} title="Viber" label="VB" />}
            {contact.email && <QuickAct as="a" href={'mailto:' + contact.email} title="Ηλεκτρονικό ταχυδρομείο"><Mail size={13} /></QuickAct>}
            <QuickAct as="button" onClick={() => setShowActions(s => !s)} title="Περισσότερες ενέργειες"><span style={{ fontSize: 16, fontWeight: 700, lineHeight: 0, marginTop: -5 }}>···</span></QuickAct>
          </div>
          {showActions && (
            <div role="menu" style={{ position: 'absolute', top: 38, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '6px', minWidth: 210, boxShadow: 'var(--elev-3)' }}>
              {[
                { Icon: Pencil, label: 'Επεξεργασία', onClick: onEdit, color: 'var(--text-secondary)' },
                { Icon: Receipt, label: 'Νέα δαπάνη', onClick: onQuickExpense, color: 'var(--text-secondary)' },
                { Icon: CalendarPlus, label: 'Νέο ραντεβού', onClick: onQuickCalendar, color: 'var(--text-secondary)' },
                { Icon: History, label: 'Ιστορικό συνεργασίας', onClick: onShowHistory, color: 'var(--text-secondary)' },
                { Icon: QrCode, label: 'QR Code', onClick: onShowQR, color: 'var(--accent)' },
                { Icon: Printer, label: 'Εκτύπωση Κάρτας', onClick: () => printContactCard(contact, branding), color: 'var(--text-secondary)' },
              ].map((a, i) => (
                <button key={i} type="button" role="menuitem" onClick={() => { a.onClick(); setShowActions(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', borderRadius: T.radius.badge, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--fs-base)', color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <a.Icon size={14} color={a.color} style={{ flexShrink: 0 }} />{a.label}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '5px 8px' }} />
              <button type="button" role="menuitem" onClick={() => { onDelete(); setShowActions(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', borderRadius: T.radius.badge, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--fs-base)', color: 'var(--negative)', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--negative) 8%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Trash2 size={14} color="var(--negative)" style={{ flexShrink: 0 }} />Διαγραφή
              </button>
            </div>
          )}
        </div>
      )}
      <div style={{ paddingLeft: 10, pointerEvents: bulkMode ? 'none' : undefined }}>
        <div {...pressable(() => onOpen && !bulkMode && onOpen())} style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 12, paddingRight: (hov || showActions) ? 100 : 0, transition: 'padding-right 0.15s', cursor: onOpen && !bulkMode ? 'pointer' : 'default' }}>
          {extra.avatar_url ? <img src={extra.avatar_url} alt="" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-border)', flexShrink: 0 }} />
            : <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--accent-soft)', border: '2px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{initials || <GroupIcon size={20} />}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font.sans, marginBottom: 1 }}>{contact.full_name}</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><GroupIcon size={11} style={{ flexShrink: 0 }} />{meta.label || contact.role}</div>
            {extra.specialty && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extra.specialty}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {extra.preferred && <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700 }}>Προτιμώμενη</span>}
          {scopeLabel && (
            <span title={scopePortfolio ? 'Ισχύει για όλο το χαρτοφυλάκιο' : 'Ανήκει σε συγκεκριμένο ακίνητο'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: scopePortfolio ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: '1px solid ' + (scopePortfolio ? 'var(--accent-border)' : 'var(--border-subtle)'), color: scopePortfolio ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scopePortfolio ? <Globe size={10} style={{ flexShrink: 0 }} /> : <Building2 size={10} style={{ flexShrink: 0 }} />}{scopeLabel}
            </span>
          )}
        </div>
        {(extra.tags || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {(extra.tags || []).map(t => <span key={t} style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{t}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {contact.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{contact.phone}</span>
              {extra.whatsapp && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 800, background: 'var(--accent-soft)', padding: '1px 5px', borderRadius: 6 }}>WA</a>}
              {extra.viber && <a href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} style={{ textDecoration: 'none', fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 800, background: 'var(--accent-soft)', padding: '1px 5px', borderRadius: 6 }}>VB</a>}
            </div>
          )}
          {extra.phone2 && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{extra.phone2}</span><span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>2ο</span></div>}
          {contact.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}><Mail size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</span></div>}
          {extra.website && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.website}</span></div>}
          {extra.office_address && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{extra.office_address}</span></div>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {extra.afm && <span title="Αριθμός Φορολογικού Μητρώου" style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>ΑΦΜ {extra.afm}</span>}
          {extra.iban && <span title="Διεθνής Αριθμός Τραπεζικού Λογαριασμού (IBAN)" style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>IBAN ···{extra.iban.slice(-4)}{extra.iris && <span title="Σύστημα άμεσων πληρωμών σε πραγματικό χρόνο (IRIS)" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginLeft: 4 }}>IRIS</span>}</span>}
          {extra.next_appointment && <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: overdue ? 'var(--negative-soft)' : 'var(--accent-soft)', border: '1px solid ' + (overdue ? 'var(--negative-border)' : 'var(--accent-border)'), color: overdue ? 'var(--negative)' : 'var(--accent)' }}>{overdue ? `Ραντεβού ${Math.abs(dueDays || 0)} ημέρες πριν` : `Ραντεβού ${fmtDate(extra.next_appointment)}`}</span>}
          {(extra.notes_log || []).length > 0 && <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{(extra.notes_log || []).length} σημειώσεις</span>}
          {(extra.files || []).length > 0 && <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{(extra.files || []).length} αρχεία</span>}
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
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 6px', borderRadius: T.radius.card, cursor: 'pointer', textDecoration: 'none', fontFamily: T.font.sans, background: accent ? 'var(--accent)' : 'var(--bg-surface)', color: accent ? 'var(--accent-text)' : 'var(--text-primary)', border: '1px solid ' + (accent ? 'transparent' : 'var(--border-subtle)'), boxShadow: h ? 'var(--elev-2)' : 'var(--elev-1)', transform: h ? 'translateY(-3px)' : 'none', transition: 'transform .18s cubic-bezier(.2,0,0,1), box-shadow .18s' }}>
      <Icon size={19} /><span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600 }}>{label}</span>
    </a>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΔΥΟ ΔΡΟΜΟΙ ΤΗΣ ΚΕΝΗΣ ΚΑΤΑΣΤΑΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΔΕΝ ΠΗΓΑΙΝΕ. Το πλακίδιο είχε σταθερό πλάτος 150 και ελληνικούς τίτλους
// σε προστακτική: «Φωτογράφισε κάρτα» έσπαγε σε δύο σειρές και «Γράψ' την με
// το χέρι» άφηνε τη λέξη «χέρι» μόνη της στη δεύτερη. Δίπλα τους, ο ένας
// υπότιτλος έπιανε τρεις σειρές και ο άλλος μία, οπότε τα δύο πλακίδια είχαν
// ίδιο ύψος αλλά διαφορετική εσωτερική ισορροπία: ο τίτλος του ενός δεν
// βρισκόταν ποτέ στη γραμμή βάσης του άλλου.
//
// ΤΡΕΙΣ ΔΙΟΡΘΩΣΕΙΣ, ΚΑΙ ΟΙ ΤΡΕΙΣ ΚΑΝΟΝΑΣ ΚΑΙ ΟΧΙ ΓΟΥΣΤΟ:
//
//   • ΙΣΕΣ ΣΤΗΛΕΣ. Το πλάτος δεν είναι καρφωτό· βγαίνει από πλέγμα δύο ίσων
//     στηλών (`contactRouteGrid`). Δύο επιλογές ισότιμης βαρύτητας πρέπει να
//     έχουν ίδιο εμβαδόν, αλλιώς η μία διαβάζεται ως δευτερεύουσα πριν καν
//     διαβαστεί το κείμενο.
//   • ΤΟ ΡΗΜΑ, ΟΧΙ Ο ΔΡΟΜΟΣ. Ηταν «Από φωτογραφία» και «Με το χέρι» — ονόμαζαν
//     τον ΤΡΟΠΟ, όχι το αποτέλεσμα και ο δεύτερος ήταν και μειωτικός για τη
//     μοναδική διαδρομή που δίνει πλήρη στοιχεία. «Σάρωσε» και «Καταχώρησε»
//     λένε ΤΙ γίνεται, με το ίδιο βάρος και στα δύο· ο υπότιτλος από κάτω λέει
//     ήδη τον τρόπο («Κάρτα ή τιμολόγιο», «Ονομα, ειδικότητα, τηλέφωνο, ΑΦΜ»),
//     οπότε ο τίτλος δεν χρειάζεται να τον ξαναπεί.
//   • ΣΤΑΘΕΡΗ ΓΡΑΜΜΗ ΒΑΣΗΣ. Ο υπότιτλος κρατά ύψος δύο σειρών σε κάθε
//     περίπτωση, οπότε ο τίτλος κάθεται στο ίδιο ύψος και στα δύο πλακίδια
//     ανεξάρτητα από το μήκος του κειμένου.
// ═══════════════════════════════════════════════════════════════════════════

/** Δύο ίσες στήλες, με ανώτατο πλάτος ώστε τα πλακίδια να μη διαλυθούν σε μεγάλη οθόνη. */
// ΚΑΤΩ ΑΠΟ ΤΑ 340 ΟΙ ΔΥΟ ΔΙΑΔΡΟΜΕΣ ΜΠΑΙΝΟΥΝ Η ΜΙΑ ΚΑΤΩ ΑΠΟ ΤΗΝ ΑΛΛΗ. Στα 320 οι
// δύο στήλες αφήνουν 90 εικονοστοιχεία στην καθεμία και η λέξη «Καταχώρησε»
// θέλει 99: κοβόταν το
// ίδιο το ρήμα που ονομάζει τη διαδρομή. Στοιβαγμένες, οι δύο κάρτες κρατούν το
// ίδιο εμβαδόν μεταξύ τους, που είναι ο λόγος που μπήκαν σε πλέγμα εξαρχής.
// Η στοίβαξη γράφεται στο globals.css, γιατί το ενσωματωμένο στυλ δεν έχει
// ερωτήματα μέσων.
const contactRouteGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: T.sp.md, maxWidth: 420, margin: `${T.sp.sm}px auto 0`, alignItems: 'stretch',
}

const SUB_LINE = 15   // ύψος γραμμής υποτίτλου· δύο από αυτές κρατούν το ύψος

function ContactActionTile({ Icon, label, sub, onClick, primary }: { Icon: React.ComponentType<{ size?: number }>; label: string; sub?: string; onClick: () => void; primary?: boolean }) {
  const [h, setH] = useState(false)
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: T.sp.md,
        width: '100%', padding: `${T.sp.xl}px ${T.sp.lg}px`, borderRadius: T.radius.card,
        cursor: 'pointer', fontFamily: T.font.sans, textAlign: 'center',
        background: primary ? 'var(--accent)' : 'var(--bg-surface)',
        color: primary ? 'var(--accent-text)' : 'var(--text-primary)',
        border: '1px solid ' + (primary ? 'transparent' : 'var(--border-subtle)'),
        boxShadow: h ? 'var(--elev-3)' : 'var(--elev-1)',
        transform: h ? 'translateY(-3px)' : 'none',
        transition: 'transform .2s cubic-bezier(.2,0,0,1), box-shadow .2s',
      }}>
      {/* Το γέμισμα του εικονιδίου βγαίνει από το ΜΕΛΑΝΙ του πλακιδίου, όχι από
          καρφωτό λευκό: στο σκούρο θέμα το `--accent` είναι ανοιχτό παστέλ και
          ένα λευκό 18% επάνω του ήταν πρακτικά αόρατο. */}
      <div style={{ width: 46, height: 46, borderRadius: T.radius.inner, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: primary ? 'color-mix(in srgb, var(--accent-text) 20%, transparent)' : 'var(--accent-soft)', color: primary ? 'var(--accent-text)' : 'var(--accent)' }}><Icon size={22} /></div>
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, textWrap: 'balance' }}>{label}</div>
        {/* Ο υπότιτλος είχε `opacity: 0.75`. Μετρημένο: πάνω στο γεμάτο accent
            του φωτεινού θέματος έβγαινε 3,94:1, δηλαδή ΚΑΤΩ από το 4,5:1 που
            απαιτούν έντεκα εικονοστοιχεία. Η διαφάνεια είναι λάθος εργαλείο για
            υποβάθμιση πάνω σε κορεσμένο φόντο: για να περάσει χρειάζεται 0,90,
            που είναι οπτικά αδιάκριτο από το γεμάτο και άρα δεν υποβαθμίζει.
            Η ιεραρχία βγαίνει από την ΚΛΙΜΑΚΑ (14/700 έναντι 11/400) και το
            χρώμα από ΔΕΙΚΤΗ, έναν ανά ρόλο. Μετρημένο μετά: 5,74 και 9,00 στο
            κύριο, 6,05 και 5,43 στο δεύτερο. */}
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 400, color: primary ? 'var(--accent-text)' : 'var(--text-secondary)', marginTop: 4, lineHeight: `${SUB_LINE}px`, minHeight: SUB_LINE * 2, textWrap: 'balance' }}>{sub}</div>
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
      expenseStore.ledger<{ amount: number }>(supabase, propertyId, { columns: 'amount', or: filter }),
      fetchSupplierDocs(afm, propertyId),
    ]).then(([rows, docs]) => {
      if (!live) return
      setExp({ total: rows.reduce((s, e) => s + (e.amount || 0), 0), count: rows.length, docs: docs.length })
    })
    return () => { live = false }
  }, [contact.id, contact.full_name, propertyId, refreshKey, afm])
  // Ο ΤΟΠΙΚΟΣ ΑΚΡΟΑΤΗΣ ESCAPE ΕΦΥΓΕ: το SideSheet τον έχει ήδη (useOverlayShell),
  // μαζί με δύο πράγματα που ΕΛΕΙΠΑΝ εδώ — εστίαση μέσα στο πάνελ και επιστροφή
  // της στο σημείο εκκίνησης και κλείδωμα της κύλισης του φόντου (το σύρσιμο
  // πάνω στο σκοτεινό φόντο κυλούσε τη λίστα από πίσω).

  return (
    <SideSheet open onClose={onClose} ariaLabel="Καρτέλα επαφής" size="sm"
      header={<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          {extra.avatar_url
            ? <img src={extra.avatar_url} alt="" style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-border)', flexShrink: 0 }} />
            : <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--accent-soft)', border: '3px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{initials || <GroupIcon size={26} />}</div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15 }}>{contact.full_name}</div>
            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}><GroupIcon size={13} />{meta.label || contact.role}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {extra.preferred && <span style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700 }}>Προτιμώμενη</span>}
            </div>
          </div>
        </div>
        {extra.specialty && <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>{extra.specialty}</div>}
      </>}>
      <style>{`.dsr-act:hover{border-color:var(--accent-border);background:var(--accent-soft);color:var(--accent)} .dsr-del{border:1px solid var(--border-subtle);background:var(--bg-elevated);color:var(--text-secondary)} .dsr-del:hover{border-color:var(--negative);color:var(--negative);background:var(--negative-soft)}`}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(78px,1fr))', gap: 9 }}>
        {contact.phone && <CommButton label="Κλήση" Icon={Phone} href={'tel:' + contact.phone} accent />}
        {contact.phone && <CommButton label="WhatsApp" Icon={MessageSquare} href={'https://wa.me/' + digits(contact.phone)} target="_blank" />}
        {contact.phone && <CommButton label="Viber" Icon={Phone} href={'viber://chat?number=' + digits(contact.phone)} />}
        {contact.email && <CommButton label="Ηλεκτρονικό ταχυδρομείο" Icon={Mail} href={'mailto:' + contact.email} />}
        {site && <CommButton label="Ιστοσελίδα" Icon={Globe} href={site} target="_blank" />}
      </div>

      {(exp.count > 0 || exp.docs > 0) && (
        <button type="button" onClick={onShowHistory} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', boxShadow: 'var(--elev-1)', fontFamily: T.font.sans }}>
          <div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Πληρωμές</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{fe(exp.total)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{exp.count} {exp.count === 1 ? 'καταχώρηση' : 'καταχωρήσεις'}{exp.docs > 0 ? ` · ${exp.docs} ${exp.docs === 1 ? 'παραστατικό' : 'παραστατικά'} με το ΑΦΜ του` : ''}</div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>Πλήρες ιστορικό ›</span>
        </button>
      )}

      {(contact.phone || extra.phone2 || contact.email || extra.office_address) && (
        <DossierSection title="Στοιχεία επικοινωνίας">
          {contact.phone && <DossierRow icon={Phone} onCopy={() => copy(contact.phone!, 'Το τηλέφωνο')}><span style={{ fontFamily: T.font.num }}>{contact.phone}</span></DossierRow>}
          {extra.phone2 && <DossierRow icon={Phone} onCopy={() => copy(extra.phone2!, 'Το τηλέφωνο')}><span style={{ fontFamily: T.font.num }}>{extra.phone2}</span> <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs-xs)' }}>δεύτερο</span></DossierRow>}
          {contact.email && <DossierRow icon={Mail} onCopy={() => copy(contact.email!, 'Το email')}>{contact.email}</DossierRow>}
          {extra.office_address && <DossierRow icon={MapPin}>{extra.office_address}</DossierRow>}
        </DossierSection>
      )}

      {/* Ο χάρτης ΔΕΝ φορτώνεται μόνος του. Το iframe έστελνε τη διεύθυνση
          γραφείου τρίτου προσώπου στην Google με το που άνοιγε το ντοσιέ, χωρίς
          ο χρήστης να ζητήσει χάρτη. Τώρα ανοίγει με ρητό κλικ, σε νέα καρτέλα. */}
      {mapLink && (
        <a href={mapLink} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '13px 16px', color: 'var(--text-secondary)', fontSize: 'var(--fs-base)', boxShadow: 'var(--elev-1)' }}>
          <MapPin size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>Άνοιγμα διεύθυνσης στον χάρτη</span>
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>›</span>
        </a>
      )}

      {(extra.afm || extra.iban) && (
        <DossierSection title="Επαγγελματικά και πληρωμές">
          {extra.afm && <DossierRow icon={FileText} onCopy={() => copy(extra.afm!, 'Το ΑΦΜ')}><span title="Αριθμός Φορολογικού Μητρώου">ΑΦΜ</span> <span style={{ fontFamily: T.font.mono }}>{extra.afm}</span></DossierRow>}
          {extra.iban && <DossierRow icon={Landmark} onCopy={() => copy(extra.iban!, 'Το IBAN')}><span style={{ fontFamily: T.font.mono, fontSize: 12 }}>{extra.iban}</span>{extra.iris && <span title="Σύστημα άμεσων πληρωμών σε πραγματικό χρόνο (IRIS)" style={{ marginLeft: 6, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)' }}>IRIS</span>}</DossierRow>}
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
            {(extra.tags || []).map(t => <span key={t} style={{ fontSize: 'var(--fs-xs)', padding: '3px 10px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}>{t}</span>)}
          </div>
        </DossierSection>
      )}

      {(contact._freeNotes || (extra.notes_log || []).length > 0) && (
        <DossierSection title="Σημειώσεις">
          {contact._freeNotes && <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{contact._freeNotes}</div>}
          {(extra.notes_log || []).map(n => (
            <div key={n.id} style={{ borderLeft: '2px solid var(--border-default)', paddingLeft: 12 }}>
              <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.text}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{fmtDate(n.ts)}</div>
            </div>
          ))}
        </DossierSection>
      )}

      {(extra.files || []).length > 0 && (
        <DossierSection title="Αρχεία">
          {(extra.files || []).map((f, i) => (
            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text-secondary)', fontSize: 'var(--fs-base)' }}>
              <FileText size={14} color="var(--text-tertiary)" />{f.name}
            </a>
          ))}
        </DossierSection>
      )}

      {/* Το `marginTop: 2` έφυγε: το σώμα του SideSheet είναι ήδη flex column με
          gap, οπότε πρόσθετε δεύτερο κενό πάνω από τη γραμμή διαχωρισμού. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
        {[
          { Icon: Pencil, label: 'Επεξεργασία', onClick: onEdit },
          { Icon: Receipt, label: 'Δαπάνη', onClick: onQuickExpense },
          { Icon: CalendarPlus, label: 'Ραντεβού', onClick: onQuickCalendar },
          { Icon: History, label: 'Ιστορικό', onClick: onShowHistory },
          { Icon: QrCode, label: 'QR', onClick: onShowQR },
          { Icon: FileText, label: 'vCard', onClick: onVcard },
          { Icon: Printer, label: 'Εκτύπωση', onClick: () => printContactCard(contact, branding) },
        ].map((a, i) => (
          <button key={i} type="button" onClick={a.onClick} className="dsr-act" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 62, padding: '10px 4px', borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'background .15s, border-color .15s, color .15s' }}>
            <a.Icon size={17} /><span style={{ whiteSpace: 'nowrap' }}>{a.label}</span>
          </button>
        ))}
        <button type="button" onClick={onDelete} className="dsr-del" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 62, padding: '10px 4px', borderRadius: 12, fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, transition: 'background .15s, border-color .15s, color .15s' }}>
          <Trash2 size={17} /><span style={{ whiteSpace: 'nowrap' }}>Διαγραφή</span>
        </button>
      </div>
    </SideSheet>
  )
}

// ─── Compact Row ──────────────────────────────────────────────────────────────
/** Πλάτος της στήλης ενεργειών. Σταθερό ώστε επαφές με και χωρίς
 *  WhatsApp/Viber να δίνουν την ΙΔΙΑ γεωμετρία γραμμής και η κεφαλίδα να
 *  μπορεί να κρατήσει την ίδια στήλη. Μετρήθηκε 294,2 με τα δύο και 227
 *  χωρίς — δηλαδή κάθε γραμμή στοίχιζε αλλού. */
const CONTACT_ACTIONS_W = 300
const CONTACT_ROW_MIN = 8 + 120 + 100 + 160 + 120 + 90 + CONTACT_ACTIONS_W + 12 * 6 + 32

function CompactRow({ contact, onOpen, onEdit, onDelete, selected, onSelect, bulkMode, scopePortfolio }: { contact: Contact; onOpen?: () => void; onEdit: () => void; onDelete: () => void; selected?: boolean; onSelect?: () => void; bulkMode?: boolean; scopePortfolio?: boolean }) {
  const meta = ROLE_META[contact.role] || { label: contact.role, groupColor: 'var(--text-tertiary)' }
  const extra = contact._extra || {}; const [hov, setHov] = useState(false)
  // Η γραμμή της λίστας ήταν χειρότερη από την κάρτα: `opacity: 0` χωρίς
  // `pointerEvents: none`, άρα «Επεξεργασία» και «Διαγραφή» ήταν ΑΟΡΑΤΕΣ αλλά
  // πατιόνταν. Σε κινητό ο χρήστης διέγραφε επαφή χωρίς να δει τι πάτησε.
  const coarse = useCoarsePointer()
  const overdue = extra.next_appointment && isOverdue(extra.next_appointment)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={bulkMode ? onSelect : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: selected ? 'var(--accent-soft)' : hov ? 'var(--bg-elevated)' : 'transparent', transition: 'background 0.15s', borderBottom: '1px solid var(--border-subtle)', cursor: bulkMode ? 'pointer' : 'default' }}>
      {bulkMode && <SelectBox checked={!!selected} onChange={() => onSelect?.()} label={`Επιλογή ${contact.full_name}`} />}
      {/* Η κουκκίδα σημαίνει ΕΝΑ πράγμα: ληξιπρόθεσμο ραντεβού. Πριν έδειχνε
          «κατάσταση σχέσης» — τέσσερα χρώματα για μια επιλογή χωρίς συνέπεια. */}
      <div title={overdue ? 'Ληξιπρόθεσμο ραντεβού' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', background: overdue ? 'var(--negative)' : 'var(--border-default)', flexShrink: 0 }} />
      <div {...pressable(() => onOpen && !bulkMode && onOpen())} style={{ width: 200, minWidth: 120, flexShrink: 1, cursor: onOpen && !bulkMode ? 'pointer' : 'default' }}>
        <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.full_name}</div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>{meta.label}{scopePortfolio && <span title="Όλο το χαρτοφυλάκιο" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--accent)' }}><Globe size={10} /></span>}</div>
      </div>
      <div style={{ width: 140, minWidth: 100, flexShrink: 1, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.phone || ABSENT}</div>
      <div title={contact.email || undefined} style={{ flex: 1, minWidth: 160, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || ABSENT}</div>
      {/* ΤΟ maxWidth ΔΕΝ ΕΙΝΑΙ ΠΛΑΤΟΣ. Η κεφαλίδα δίνει στις «Ετικέτες» στήλη
          120, η γραμμή όμως έδινε `maxWidth:160` χωρίς `width` — δηλαδή πλάτος
          όσο το περιεχόμενο. Επαφή χωρίς ετικέτες κατέληγε 0 πλάτος και η
          στήλη ΑΦΜ ανέβαινε 120 εικονοστοιχεία αριστερά από την επικεφαλίδα
          της· επαφή με δύο ετικέτες την έσπρωχνε δεξιά. Η ίδια στήλη άλλαζε
          θέση σε κάθε γραμμή. Σταθερό πλάτος, ίδιο με την κεφαλίδα. */}
      <div title={(extra.tags || []).join(', ') || undefined} style={{ display: 'flex', alignItems: 'center', gap: 4, width: 120, flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {(extra.tags || []).slice(0, 1).map(t => <span key={t} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'var(--fs-xs)', padding: '2px 7px', borderRadius: T.radius.pill, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>{t}</span>)}
        {(extra.tags || []).length > 1 && <span style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>+{(extra.tags || []).length - 1}</span>}
      </div>
      <div style={{ width: 120, minWidth: 90, flexShrink: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontFamily: T.font.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.afm ? 'ΑΦΜ ' + extra.afm : ''}</div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', width: CONTACT_ACTIONS_W, opacity: bulkMode ? 0 : (hov || coarse) ? 1 : 0, pointerEvents: bulkMode || !(hov || coarse) ? 'none' : undefined, transition: 'opacity 0.15s', flexShrink: 0 }}>
        {contact.phone && <a href={'tel:' + contact.phone} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: 4, color: 'var(--text-secondary)' }}><Phone size={14} /></a>}
        {extra.whatsapp && contact.phone && <a href={'https://wa.me/' + contact.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '4px 6px', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6 }}>WA</a>}
        {extra.viber && contact.phone && <a href={'viber://chat?number=' + contact.phone.replace(/\D/g, '')} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '4px 6px', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6 }}>VB</a>}
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
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)' }}>{count}</span>
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
                borderRadius: T.radius.chip, background: on ? 'var(--accent)' : 'transparent',
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
  // Ο ΔΕΙΚΤΗΣ ΦΟΡΤΩΣΗΣ ΔΕΝ ΕΙΝΑΙ ΞΕΧΩΡΙΣΤΗ ΚΑΤΑΣΤΑΣΗ, ΕΙΝΑΙ ΕΡΩΤΗΣΗ.
  // Ηταν `setLoading(true)` στην πρώτη γραμμή της φόρτωσης: σύγχρονη γραφή μέσα
  // σε effect, δηλαδή δεύτερη απόδοση πριν καν φύγει το αίτημα. Η ερώτηση που
  // ΟΝΤΩΣ απαντά είναι «τα δεδομένα που κρατώ είναι αυτού του ακινήτου;» και
  // απαντιέται κατά την απόδοση, χωρίς καμία γραφή. Με την αλλαγή ακινήτου
  // γίνεται αληθής ΑΜΕΣΩΣ, οπότε δεν υπάρχει καρέ με τα νούμερα του προηγούμενου.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== propertyId
  const [showModal, setShowModal] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, extra: { ...EMPTY_EXTRA } })
  const [saving, setSaving] = useState(false)
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
    // Φέρνουμε ΟΛΕΣ τις επαφές του χρήστη και δείχνουμε: αυτές του τρέχοντος ακινήτου
    // ΣΥΝ όσες έχουν οριστεί «όλο το χαρτοφυλάκιο» (ώστε οι επαγγελματικές επαφές
    // χαρτοφυλακίου να εμφανίζονται πραγματικά σε κάθε ακίνητο, όχι μόνο ως ετικέτα).
    const data = await contactStore.ofUser<Contact>(supabase, userId, '*', { orderBy: 'created_at', ascending: false })
    const parsed = data.map(parseContact)
    setContacts(parsed.filter(c => c.property_id === propertyId || c._extra?.scope === 'portfolio'))
    setLoadedFor(propertyId)
  }, [propertyId, userId])
  useLoad(fetchContacts)

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
    downloadFile(list.map(vcardFor).join('\n'), name, 'text/vcard;charset=utf-8')
  }

  const openEdit = (c: Contact) => { const known = !!ROLE_META[c.role]; setRoleOther(known ? '' : (c.role || '')); setEditContact(c); setForm({ full_name: c.full_name, role: known ? c.role : 'other', phone: c.phone || '', email: c.email || '', freeNotes: c._freeNotes || '', extra: { ...EMPTY_EXTRA, ...(c._extra || {}), tags: c._extra?.tags || [], notes_log: c._extra?.notes_log || [], files: c._extra?.files || [] } }); setError(null); setShowMore(!!(c._extra?.tags?.length || c._extra?.notes_log?.length || c._extra?.files?.length || c._extra?.iban || c._extra?.next_appointment)); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditContact(null); setError(null) }
  // ── ΦΡΟΥΡΑ «ΜΗΝ ΚΛΕΙΣΕΙΣ ΟΣΟ ΑΠΟΘΗΚΕΥΕΙ» ────────────────────────────────
  // Το χειρόγραφο παράθυρο έκλεινε ΜΟΝΟ από το «×» και την «Ακύρωση». Το Modal
  // προσθέτει Escape και κλικ στο φόντο, δηλαδή δύο νέους τρόπους να φύγεις στη
  // μέση της αποθήκευσης. Αν φύγεις, η κλήση συνεχίζει· και αν αποτύχει, το
  // `setError` γράφει σε παράθυρο που δεν υπάρχει πια — ο χρήστης χάνει ό,τι
  // πληκτρολόγησε και δεν μαθαίνει ποτέ γιατί. Το `closeModal` μένει άθικτο για
  // το `persist`, που κλείνει ΜΕΤΑ από επιτυχία (και δεν βλέπει ακόμη το
  // setSaving(false) της ίδιας ριπής).
  const requestCloseModal = () => { if (!saving) closeModal() }
  const requestCloseDup = () => { if (!saving) setDup(null) }
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
    // ΜΟΝΟ το ραντεβού. Η «Υπενθύμιση επικοινωνίας» υποσχόταν ρυθμό (κάθε 30
    // ημέρες) και έγραφε μία παγωμένη ημερομηνία, υπολογισμένη μία φορά στο κλικ.
    const date = form.extra.next_appointment || ''
    await saved(MSG.reminder, calendar.replaceSource(supabase, { propertyId, userId }, { source: src },
      date ? [{ title: `Επικοινωνία: ${name}`, category: 'reminder', event_date: date, notes: form.extra.specialty || null }] : []))
  }

  const persist = async (mode: 'update' | 'insert' | 'merge', target?: Contact) => {
    setSaving(true); setError(null)
    const name = form.full_name.trim()
    const finalRole = isOtherRole(form.role) && roleOther.trim() ? roleOther.trim() : form.role
    if (mode === 'merge' && target) {
      const mergedExtra = { ...(target._extra || {}), ...cleanExtra(form.extra) }
      const mergedNotes = [target._freeNotes, form.freeNotes].filter(Boolean).join('\n').trim()
      const mergedRole = (finalRole && finalRole !== 'other') ? finalRole : target.role
      const { error: e } = await contactStore.update(supabase, target.id, { full_name: name || target.full_name, role: mergedRole, phone: form.phone.trim() || target.phone, email: form.email.trim() || target.email, notes: serializeNotes(mergedExtra, mergedNotes) })
      if (e) { setError(failed('Η επαφή δεν αποθηκεύτηκε', e)); setSaving(false); return }
      await syncContactReminder(target.id, name || target.full_name)
      setSaving(false); setDup(null); closeModal(); fetchContacts(); notifyOk('Οι επαφές συγχωνεύθηκαν'); return
    }
    const payload = { full_name: name, role: finalRole, phone: form.phone.trim() || null, email: form.email.trim() || null, notes: serializeNotes(form.extra, form.freeNotes) }
    if (mode === 'update' && editContact) {
      const { error: e } = await contactStore.update(supabase, editContact.id, payload)
      if (e) { setError(failed('Η επαφή δεν αποθηκεύτηκε', e)); setSaving(false); return }
      await syncContactReminder(editContact.id, name)
      setSaving(false); closeModal(); fetchContacts(); notifyOk('Επαφή ενημερώθηκε'); return
    }
    const { data: ins, error: e } = await contactStore.addReturningId(supabase, propertyId, userId, payload)
    if (e) { setError(failed('Η επαφή δεν αποθηκεύτηκε', e)); setSaving(false); return }
    if (ins?.id) await syncContactReminder(ins.id, name)
    setSaving(false); setDup(null); closeModal(); fetchContacts(); notifyOk('Επαφή προστέθηκε')
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError(SAY.nameRequired); return }
    if (!editContact) { const d = findDuplicate(); if (d) { setDup(d); return } }
    await persist(editContact ? 'update' : 'insert')
  }

  const handleDelete = async (id: string) => {
    // ΤΑ ΑΡΧΕΙΑ ΦΕΥΓΟΥΝ ΠΡΩΤΑ, ΟΣΟ ΥΠΑΡΧΕΙ ΑΚΟΜΗ Η ΓΡΑΜΜΗ ΠΟΥ ΤΑ ΞΕΡΕΙ.
    // Διαγραμμένη η επαφή, τα μονοπάτια τους δεν είναι πουθενά γραμμένα.
    const gone = contacts.find(c => c.id === id)?._extra?.files ?? []
    if (gone.length) await removeFiles(supabase, gone)
    if (!await saved('Η επαφή δεν διαγράφηκε', contactStore.remove(supabase, id))) return
    await saved('Η υπενθύμιση της επαφής δεν καθαρίστηκε', calendar.clearSource(supabase, { propertyId, userId }, { source: `contact:${id}:reminder` }))
    fetchContacts(); notify('Επαφή διαγράφηκε')
  }
  // ΜΙΑ ΕΡΩΤΗΣΗ ΓΙΑ ΤΕΣΣΕΡΑ ΚΟΥΜΠΙΑ. Το «Διαγραφή» της κάρτας, της γραμμής
  // λίστας, του μενού «···» και του ντοσιέ άναβαν όλα την ίδια κατάσταση
  // `deleteId`, που υπήρχε αποκλειστικά για να εμφανίσει το χειρόγραφο παράθυρο.
  // Η ερώτηση είναι πλέον εδώ, σε μία γραμμή και η κατάσταση δεν χρειάζεται.
  const askDelete = async (c: Contact) => {
    if (!await confirmDialog({ title: 'Διαγραφή Επαφής;', message: 'Αυτή η ενέργεια δεν αναιρείται.', confirmLabel: 'Διαγραφή', tone: 'negative' })) return
    await handleDelete(c.id)
  }
  const toggleSelect = (id: string) => setSelected(p => { return toggleIn(p, id) })
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
      contactStore.removeMany(supabase, ids))) return
    // Καθαρισμός των υπενθυμίσεων ημερολογίου (ισοτιμία με τη μεμονωμένη διαγραφή).
    await saved('Οι υπενθυμίσεις των επαφών δεν καθαρίστηκαν', calendar.clearSource(supabase, { propertyId, userId }, { sources: ids.map(id => `contact:${id}:reminder`) }))
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
      contactStore.update(supabase, c.id, { notes: serializeNotes(extra, c._freeNotes || '') }))) return
    // Υπενθύμιση ημερολογίου μία ημέρα πριν (idempotent ανά επαφή).
    const src = `contact:${c.id}:reminder`
    const remind = new Date(date + 'T00:00:00'); remind.setDate(remind.getDate() - 1)
    await saved('Η υπενθύμιση ραντεβού δεν δημιουργήθηκε', calendar.replaceSource(supabase, { propertyId, userId }, { source: src },
      [{ title: `Υπενθύμιση ραντεβού: ${c.full_name}`, category: 'reminder', event_date: isoDate(remind) }]))
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

  // ── ΠΟΣΑ ΕΙΔΗ ΥΠΑΡΧΟΥΝ ΠΡΑΓΜΑΤΙΚΑ ─────────────────────────────────────────
  // Οι δύο αριθμοί που κρίνουν αν ένα φίλτρο έχει τι να φιλτράρει: πόσες ομάδες
  // επαφών υπάρχουν όντως και πόσα είδη εμβέλειας. Ένα φίλτρο με μία επιλογή
  // δεν είναι φίλτρο — είναι ετικέτα με περίγραμμα κουμπιού.
  const groupsPresent = useMemo(
    () => GROUPS.filter(g => contacts.some(c => ROLE_META[c.role]?.groupId === g.id)),
    [contacts])
  const scopeKinds = useMemo(
    () => new Set(contacts.map(c => (c._extra?.scope === 'portfolio' ? 'portfolio' : 'property'))).size,
    [contacts])

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
    <div style={pageShell(1080)}>


      <input ref={cardRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) runCardScan(f); e.currentTarget.value = '' }} />
      {/* ── ΔΕΝ ΕΙΝΑΙ ΠΑΡΑΘΥΡΟ, ΕΙΝΑΙ ΠΡΟΟΔΟΣ: ΜΕΝΕΙ ΧΕΙΡΟΓΡΑΦΟ ──────────────
          Δεν ρωτά τίποτα και δεν προσφέρει καμία ενέργεια — ούτε πρέπει. Το
          Modal δίνει «×» και Escape, δηλαδή δύο τρόπους να το κλείσεις· όμως το
          κλείσιμο ΔΕΝ ακυρώνει την κλήση προς το μοντέλο, οπότε ο χρήστης θα
          έβλεπε τη φόρμα να ανοίγει μόνη της δευτερόλεπτα αφού «έφυγε» από τη
          σάρωση. Ένα υπόσχεση-ακύρωσης που δεν ακυρώνει είναι χειρότερη από την
          αναμονή. Ευθυγραμμίζονται μόνο scrim, ακτίνα και σκιά με τα tokens.
          Ο role="status" αντικαθιστά το role="dialog": ο αναγνώστης οθόνης
          ανακοινώνει την πρόοδο αντί να ψάχνει χειριστήρια που δεν υπάρχουν. */}
      {scanning && (
        <div role="status" aria-live="polite" aria-label="Ανάλυση κάρτας" style={{ position: 'fixed', inset: 0, background: T.scrim, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.modal, padding: '26px 32px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--elev-3)' }}>
            <div style={{ width: 22, height: 22, border: '2.5px solid var(--border-default)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'contactsSpin 0.7s linear infinite' }} />
            <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Ανάλυση κάρτας…</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Εξάγω τα στοιχεία επαφής</div></div>
          </div>
          <style>{`@keyframes contactsSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ΤΑ ΚΟΥΜΠΙΑ ΤΗΣ ΚΕΦΑΛΙΔΑΣ ΑΠΟΔΙΔΟΝΤΑΙ ΠΑΝΤΑ. Πριν, όλα μαζί — και η σάρωση —
          εμφανίζονταν ΜΟΝΟ αν υπήρχε ήδη επαφή: ο νέος χρήστης δεν έβλεπε ποτέ τη
          σάρωση και ο μόνος δρόμος για την πρώτη του επαφή ήταν η φόρμα. Το κύριο
          κουμπί είναι η ΦΩΤΟΓΡΑΦΙΑ, όχι η χειροκίνητη καταχώρηση. */}
      {/* ΕΝΘΕΤΟ: ΕΠΙΚΕΦΑΛΙΔΑ ΕΝΟΤΗΤΑΣ, ΟΧΙ ΔΕΥΤΕΡΟΣ ΤΙΤΛΟΣ ΣΕΛΙΔΑΣ.
          Μέσα στο Αρχείο υπήρχαν δύο τίτλοι πρώτου επιπέδου ο ένας κάτω από τον
          άλλο, με δύο υπότιτλους που έλεγαν την ίδια πρόταση με άλλες λέξεις.
          Οι ενέργειες είναι ΟΙ ΙΔΙΕΣ και στις δύο μορφές: γράφονται μία φορά. */}
      {(() => {
      // ── ΤΡΙΑ ΚΟΥΜΠΙΑ ΕΓΙΝΑΝ ΔΥΟ ────────────────────────────────────────────
      // Ήταν «Νέα επαφή», «Εξαγωγή ▾» και «Σάρωση κάρτας» σε μία σειρά: δύο από
      // τα τρία οδηγούν στο ΙΔΙΟ αποτέλεσμα (μια νέα επαφή) με διαφορετική
      // ταχύτητα και το τρίτο είναι εξαγωγή — ενέργεια που δεν κάνει κανείς
      // στην πρώτη του επίσκεψη και δεν αξίζει μόνιμη θέση δίπλα στη δημιουργία.
      //
      // Μένει ΜΙΑ κύρια ενέργεια, η γρήγορη: η φωτογραφία της κάρτας διαβάζει
      // όνομα, τηλέφωνο, email και ΑΦΜ μόνη της. Η χειροκίνητη καταχώρηση και οι
      // τρεις εξαγωγές πάνε στο κοινό μενού «Περισσότερα» — το ίδιο που
      // χρησιμοποιεί ήδη η Απογραφή, ώστε οι δύο οθόνες να διαβάζονται σαν μία.
      const actions = <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <ActionMenu label="Περισσότερα" items={[
            { key: 'add', label: 'Νέα επαφή χειροκίνητα', description: 'Χωρίς κάρτα: συμπληρώνεις εσύ τα πεδία.', onClick: openAdd },
            ...(contacts.length > 0 ? [
              { key: 'xlsx', label: 'Κατάλογος σε Excel', description: 'Όλα τα πεδία, για υπολογιστικό φύλλο.', onClick: () => exportContactsExcel(contacts) },
              { key: 'pdf', label: 'Κατάλογος σε PDF', description: 'Έτοιμος για εκτύπωση ή αποστολή.', onClick: () => exportContactsPDF(contacts, branding) },
              { key: 'vcf', label: 'Επαφές στο κινητό', description: 'Αρχείο vCard για το τηλεφωνικό σου ευρετήριο.', onClick: () => downloadVcf(contacts, 'epafes.vcf') },
            ] : []),
          ]} />
          {/* Η ΙΔΙΑ ΚΥΡΙΑ ΕΝΕΡΓΕΙΑ ΔΥΟ ΦΟΡΕΣ, ΚΑΙ ΟΙ ΔΥΟ ΜΠΛΕ, ΣΤΗΝ ΙΔΙΑ ΟΘΟΝΗ.
              Με άδειο κατάλογο, ο χρήστης έβλεπε «Σάρωση κάρτας» πάνω δεξιά ΚΑΙ
              «Φωτογράφισε κάρτα» στο κέντρο — δύο γεμάτα γαλάζια κουμπιά που
              καλούν το ΙΔΙΟ `cardRef.current?.click()`. Το μάτι δεν ξέρει πού να
              πάει και το σχόλιο τρεις γραμμές πιο πάνω υπόσχεται ρητά «μένει
              ΜΙΑ κύρια ενέργεια».

              Όταν δεν υπάρχει τίποτα, η κενή κατάσταση ΕΙΝΑΙ η πρόσκληση: δίνει
              και τους δύο δρόμους, με εξήγηση τι διαβάζεται από την κάρτα. Το
              κουμπί της κεφαλίδας εμφανίζεται μόλις υπάρχει κατάλογος, όπου
              πραγματικά χρειάζεται συντόμευση. */}
          {contacts.length > 0 && (
            <Btn variant="primary" onClick={() => cardRef.current?.click()}>{scanning ? 'Σάρωση…' : 'Σάρωση κάρτας'}</Btn>
          )}
        </div>;
      return embedded
        ? <SecHdr label="Επαφές του ακινήτου" sub="Πάροχοι, τεχνικοί, τράπεζες, ασφαλιστές" right={actions}/>
        : <PageTitle title="Επαφές" sub="Συνεργάτες, πάροχοι και υπηρεσίες του ακινήτου" right={actions}/>;
      })()}

      {/* ══ ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΠΡΟΣΟΧΗ ══════════════════════════════════════════
          Πριν εδώ υπήρχαν ΔΥΟ ζώνες που έλεγαν το ίδιο: τρία πλακίδια
          («ΛΗΓΜΕΝΑ ΡΑΝΤΕΒΟΥ 0 · ΧΩΡΙΣ ΑΦΜ 1 · ΣΥΝΟΛΟ ΕΠΑΦΩΝ 1») και από κάτω
          μια κορδέλα που ξανάλεγε τα ληγμένα ραντεβού ονομαστικά. Το σύνολο
          λεγόταν άλλες τρεις φορές παρακάτω — στη γραμμή πλήθους, στο chip της
          κατηγορίας και στον διαχωριστή της ομάδας.

          Ένα πλήθος δεν είναι ενέργεια: το «4 τεχνικοί» δεν σε βάζει να κάνεις
          τίποτα. Εδώ μένουν μόνο τα δύο που ΖΗΤΟΥΝ κάτι και είναι φίλτρα: το
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
                <span style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 'var(--fs-xs)', opacity: on ? 0.85 : 0.6 }}>{fn(a.count)}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '11px 16px', marginBottom: 18, flexWrap: 'wrap', boxShadow: 'var(--elev-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <SelectBox checked={allOn} indeterminate={someOn} onChange={masterToggle} label="Επιλογή όλων" />
              <span style={{ fontSize: 14, fontWeight: 650, color: none ? 'var(--text-secondary)' : 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
                {none ? `Επιλογή όλων (${processed.length})` : `${selected.size} ${selected.size === 1 ? 'επιλεγμένη' : 'επιλεγμένες'}`}
              </span>
            </div>
            <div style={{ width: 1, height: 22, background: 'var(--border-subtle)', flexShrink: 0 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <BulkBtn icon={Mail} label="Ηλεκτρονικό ταχυδρομείο" onClick={bulkEmail} disabled={!hasEmail} />
              <BulkBtn icon={FileText} label="Εξαγωγή vCard" onClick={bulkVcard} disabled={none} />
              <BulkBtn icon={Trash2} label="Διαγραφή" onClick={bulkDelete} disabled={none} danger />
            </div>
            <button type="button" onClick={() => { setBulkMode(false); setSelected(new Set()) }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'transparent', fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}><X size={14} />Τέλος</button>
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
                <div key={c.id} {...pressable(() => openEdit(c))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid ' + (overdue ? 'var(--negative-border)' : 'var(--accent-border)'), cursor: 'pointer', position: 'relative', maxWidth: '100%', minWidth: 0 }}>
                  {overdue && <span style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--negative)', border: '2px solid var(--bg-elevated)' }} />}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                    {c._extra?.avatar_url ? <img src={c._extra.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : initialsOf(c.full_name) || <GroupIcon size={14} />}
                  </div>
                  <div title={c.full_name} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.full_name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.label}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 4, flexShrink: 0 }}>
                    {c.phone && <a href={'tel:' + c.phone} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 3 }}><Phone size={13} /></a>}
                    {c._extra?.whatsapp && c.phone && <a href={'https://wa.me/' + c.phone.replace(/\D/g, '')} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 5px', borderRadius: 6 }}>WA</a>}
                    {c._extra?.viber && c.phone && <a href={'viber://chat?number=' + c.phone.replace(/\D/g, '')} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', fontSize: 'var(--fs-xs)', fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 5px', borderRadius: 6 }}>VB</a>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && contacts.length > 0 && (<>
      {/* ── ΤΑ ΕΡΓΑΛΕΙΑ ΕΜΦΑΝΙΖΟΝΤΑΙ ΟΤΑΝ ΤΑ ΔΙΚΑΙΟΛΟΓΕΙ ΤΟ ΠΛΗΘΟΣ ───────
          Με μία επαφή, αυτή η οθόνη έδειχνε δώδεκα χειριστήρια: αναζήτηση,
          ετικέτες, ταξινόμηση, προβολή, αλφαβητικό ευρετήριο, τρία κουμπιά
          εμβέλειας, chip ομάδας, πλήθος και μαζική επιλογή. Κανένα δεν είναι
          λάθος — όλα είναι λάθος ΕΚΕΙ: η αναζήτηση δεν λύνει τίποτα σε μία
          γραμμή, η ταξινόμηση δύο τιμών σε ένα στοιχείο δεν αλλάζει τίποτα,
          ένα ευρετήριο για τρία γράμματα δεν είναι ευρετήριο.
          Τα κατώφλια ζουν στο lib/ui/thresholds.ts, ένα για όλη την εφαρμογή. */}
      {(showTool('search', contacts.length) || showTool('sort', contacts.length)) && (
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {showTool('search', contacts.length) && (
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input value={search} aria-label="Αναζήτηση επαφής" onChange={e => setSearch(e.target.value)} placeholder="Όνομα, τηλέφωνο, email, ΑΦΜ ή IBAN" style={{ ...iStyle, paddingLeft: 38 }} onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)' }} onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none' }} />
        </div>
        )}
        {allTags.length > 0 && (
          <div style={{ minWidth: 170 }}>
            <CustomSelect ariaLabel="Ετικέτα" value={filterTag} onChange={setFilterTag} placeholder="Όλες οι ετικέτες"
              options={[{ value: '', label: 'Όλες οι ετικέτες' }, ...allTags.map(t => ({ value: t, label: t }))]} />
          </div>
        )}
        {/* Ταξινόμηση: δύο επιλογές, ορατές. Ένα αναδυόμενο μενού για δύο τιμές
            κρύβει τη μισή πληροφορία πίσω από ένα κλικ, χωρίς λόγο. */}
        {showTool('sort', contacts.length) && (
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, overflow: 'hidden', background: 'var(--bg-elevated)', padding: 3, gap: 2 }}>
          {([['recent', 'Πρόσφατες'], ['alpha', 'Αλφαβητικά']] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setSortMode(m)} style={{ padding: '5px 15px', border: 'none', borderRadius: T.radius.pill, background: sortMode === m ? 'var(--bg-surface)' : 'transparent', color: sortMode === m ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: sortMode === m ? 700 : 500, fontFamily: T.font.sans, boxShadow: sortMode === m ? 'var(--elev-1)' : 'none', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>{label}</button>
          ))}
        </div>
        )}
        {showTool('view', contacts.length) && (
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, overflow: 'hidden', background: 'var(--bg-elevated)', padding: 3, gap: 2 }}>
          {(['cards', 'compact'] as ViewMode[]).map(v => (
            <button key={v} type="button" onClick={() => setViewMode(v)} style={{ padding: '5px 15px', border: 'none', borderRadius: T.radius.pill, background: viewMode === v ? 'var(--bg-surface)' : 'transparent', color: viewMode === v ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: viewMode === v ? 700 : 500, fontFamily: T.font.sans, boxShadow: viewMode === v ? 'var(--elev-1)' : 'none', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>{v === 'cards' ? 'Κάρτες' : 'Λίστα'}</button>
          ))}
        </div>
        )}
      </div>
      )}

      {/* Ένα ευρετήριο έχει νόημα όταν τα γράμματα είναι λιγότερα από τις
          γραμμές. Με πέντε επαφές είναι απλώς δεύτερη λίστα από πάνω. */}
      {showTool('index', contacts.length) && (
        <AlphaRail entries={alphaIndex} active={letter} onPick={setLetterFilter} />
      )}

      {/* Η εμβέλεια είναι ερώτηση μόνο όταν υπάρχουν επαφές σε ΠΑΝΩ ΑΠΟ ΜΙΑ.
          Με όλες στο ίδιο ακίνητο, τα τρία κουμπιά δίνουν τρεις φορές την ίδια
          λίστα — και η ετικέτα «Εμβέλεια» δίπλα τους ονομάτιζε μια επιλογή που
          δεν υπήρχε. */}
      {isPro && scopeKinds > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Εμβέλεια</span>
          {([
            { id: 'all' as const, label: 'Όλες', Icon: Users },
            { id: 'portfolio' as const, label: 'Όλο το χαρτοφυλάκιο', Icon: Globe },
            { id: 'property' as const, label: 'Ανά ακίνητο', Icon: Building2 },
          ]).map(o => { const active = filterScope === o.id; const Ico = o.Icon; return (
            <button key={o.id} type="button" onClick={() => setFilterScope(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--border-default)' : 'var(--border-subtle)'), background: active ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', fontSize: 12, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
              <Ico size={12} />{o.label}
            </button>
          )})}
        </div>
      )}

      {/* Ένα chip φίλτρου που επιλέγει τα πάντα δεν φιλτράρει τίποτα: με μία
          μόνο ομάδα, η σειρά είναι ετικέτα μεταμφιεσμένη σε χειριστήριο. */}
      {groupsPresent.length >= SHOW_FROM.filter && (
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {groupsPresent.map(g => {
            const count = contacts.filter(c => ROLE_META[c.role]?.groupId === g.id).length; const active = filterGroup === g.id; const GroupIcon = g.Icon
            return (
              <button key={g.id} type="button" onClick={() => setFilterGroup(active ? 'all' : g.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--border-default)' : 'var(--border-subtle)'), background: active ? 'var(--bg-elevated)' : 'transparent', cursor: 'pointer', fontSize: 12, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                <GroupIcon size={12} />{g.label}<span style={{ background: active ? 'var(--border-raised)' : 'var(--bg-elevated)', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: T.radius.pill, padding: '1px 7px', fontSize: 'var(--fs-xs)', fontWeight: 700 }}>{count}</span>
              </button>
            )
          })}
      </div>
      )}

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
        {!bulkMode && showTool('bulk', processed.length) && (
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
        // Η βοήθεια έλεγε ΤΑ ΙΔΙΑ με τα δύο πλακίδια από κάτω, σε προστακτική και
        // με τη λίστα των πεδίων δύο φορές. Λέει τώρα ΜΟΝΟ αυτό που δεν λένε τα
        // πλακίδια: τι κάνει η σάρωση και ποιος αποφασίζει τελικά.
        // ΚΑΙ ΤΟ «ΤΟΥ» ΔΕΝ ΕΙΧΕ ΣΕ ΤΙ ΝΑ ΑΝΑΦΕΡΘΕΙ. Η υπόδειξη έλεγε «η κάρτα ή
        // ένα τιμολόγιό του», τρεις λέξεις κάτω από τον τίτλο «Καμία επαφή
        // ακόμη»: δεν έχει προηγηθεί κανένα πρόσωπο στην οθόνη. Ονομάζεται.
        // Ο υπότιτλος του πλακιδίου έλεγε πάλι «Κάρτα ή τιμολόγιο του
        // συνεργάτη», ακριβώς από κάτω· κρατά πια ό,τι ΔΕΝ λέει η υπόδειξη,
        // δηλαδή από πού έρχεται η φωτογραφία.
        <EmptyState
          icon={<Users size={20} />}
          title="Καμία επαφή ακόμη"
          hint="Η κάρτα ή ένα τιμολόγιο του συνεργάτη διαβάζεται και συμπληρώνει τα πεδία, μαζί με το IBAN. Τίποτα δεν αποθηκεύεται πριν το ελέγξεις."
          action={<div className="route-two" style={contactRouteGrid}>
            <ContactActionTile Icon={Camera} label="Σάρωσε" sub={scanning ? 'Ανάλυση…' : 'Με την κάμερα ή από αρχείο'} onClick={() => cardRef.current?.click()} primary />
            {/* «Τέσσερα πεδία» ήταν σωστό και αόριστο. Τα τέσσερα ονομάζονται:
                ο χρήστης ξέρει τι τον περιμένει πριν πατήσει. */}
            <ContactActionTile Icon={UserPlus} label="Καταχώρησε" sub="Όνομα, ειδικότητα, τηλέφωνο, ΑΦΜ" onClick={openAdd} />
          </div>}
        />
      ) : processed.length === 0 ? (
        <EmptyState icon={<SearchX size={20} />} title="Δεν βρέθηκαν επαφές"
          hint={letter ? `Καμία επαφή στο «${letter}» με τα ενεργά φίλτρα.` : 'Ο συνδυασμός αναζήτησης, κατηγορίας και φίλτρων δεν αφήνει καμία επαφή.'}
          action={<Btn variant="secondary" onClick={() => { setSearch(''); setFilterGroup('all'); setFilterTag(''); setLetterFilter(null); setAttention(null) }}>Καθαρισμός φίλτρων</Btn>} />
      ) : viewMode === 'compact' ? (
        <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: CONTACT_ROW_MIN }}>
          <div style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            {bulkMode && <div style={{ width: 18, flexShrink: 0 }} />}
            <div style={{ width: 8, flexShrink: 0 }} />
            <div style={{ width: 200, minWidth: 120, flexShrink: 1, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Όνομα</div>
            <div style={{ width: 140, minWidth: 100, flexShrink: 1, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Τηλέφωνο</div>
            <div style={{ flex: 1, minWidth: 160, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ηλεκτρονικό ταχυδρομείο</div>
            <div style={{ width: 120, flexShrink: 0, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ετικέτες</div>
            <div style={{ width: 120, minWidth: 90, flexShrink: 1, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>ΑΦΜ</div>
            {/* Η στήλη των ενεργειών υπάρχει και στην κεφαλίδα, αλλιώς όλες οι
                από πάνω της στέκονται 306 εικονοστοιχεία αριστερότερα από τα
                δεδομένα τους. Κενή, γιατί οι ενέργειες δεν έχουν όνομα. */}
            <div style={{ width: CONTACT_ACTIONS_W, flexShrink: 0 }} />
          </div>
          {processed.map(c => <CompactRow key={c.id} contact={c} onOpen={() => setDetailId(c.id)} onEdit={() => openEdit(c)} onDelete={() => askDelete(c)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} scopePortfolio={isPro && scopeIsPortfolio(c)} />)}
          </div>
        </div>
      ) : letter || sortMode === 'alpha' ? (
        <div data-list style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 14 }}>
          {processed.map(c => (
            <ContactCard key={c.id} contact={c} onOpen={() => setDetailId(c.id)} onEdit={() => openEdit(c)} onDelete={() => askDelete(c)} onQuickExpense={() => setQuickExpense(c)} onQuickCalendar={() => setQuickCalendar(c)} onShowHistory={() => setHistoryContact(c)} onShowQR={() => setQrContact(c)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} branding={branding} scopeLabel={scopeLabelFor(c)} scopePortfolio={scopeIsPortfolio(c)} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 42 }}>
          {GROUPS.filter(g => groupedFiltered[g.id]?.length).map(g => (
            <div key={g.id}>
              <GroupDivider group={g} count={groupedFiltered[g.id].length} />
              <div data-list style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 14 }}>
                {groupedFiltered[g.id].map(c => (
                  <ContactCard key={c.id} contact={c} onOpen={() => setDetailId(c.id)} onEdit={() => openEdit(c)} onDelete={() => askDelete(c)} onQuickExpense={() => setQuickExpense(c)} onQuickCalendar={() => setQuickCalendar(c)} onShowHistory={() => setHistoryContact(c)} onShowQR={() => setQrContact(c)} selected={selected.has(c.id)} onSelect={() => toggleSelect(c.id)} bulkMode={bulkMode} branding={branding} scopeLabel={scopeLabelFor(c)} scopePortfolio={scopeIsPortfolio(c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Η ΣΕΙΡΑ ΤΟΥ DOM ΕΙΝΑΙ Η ΣΕΙΡΑ ΤΩΝ ΕΠΙΠΕΔΩΝ ────────────────────────
          Το ντοσιέ ήταν γραμμένο ΜΕΤΑ τα παράθυρα, όταν κουβαλούσε δικό του
          z-index 900 και τα παράθυρα 1000–1300: η αριθμητική το κρατούσε από
          κάτω ό,τι σειρά κι αν είχε. Τα κοινά Modal και SideSheet έχουν ΤΟ ΙΔΙΟ
          z-index (1000) — άρα κερδίζει όποιο έρχεται τελευταίο στο DOM και το
          ντοσιέ σκέπαζε τη φόρμα επεξεργασίας που άνοιγε το ίδιο του το κουμπί
          «Επεξεργασία». Ανεβαίνει εδώ, πριν από όσα ανοίγουν ΠΑΝΩ του. */}
      {detail && <ContactDossier contact={detail} propertyId={propertyId} branding={branding} onVcard={() => downloadVcf([detail], (detail.full_name || 'epafi').replace(/[^\w.\-]+/g, '_') + '.vcf')} onClose={() => setDetailId(null)}
        onEdit={() => openEdit(detail)}
        onDelete={() => askDelete(detail)}
        onQuickExpense={() => setQuickExpense(detail)}
        onQuickCalendar={() => setQuickCalendar(detail)}
        onShowHistory={() => setHistoryContact(detail)}
        onShowQR={() => setQrContact(detail)} refreshKey={dossierRefresh} />}

      {/* MODAL */}
      {showModal && (() => {
        // Το εικονίδιο της κατηγορίας μπαίνει στην υποδοχή `icon` του Modal, που
        // ήδη δίνει το τετράγωνο accent-soft — το χειρόγραφο 36×36 πλαίσιο ήταν
        // αντίγραφό του με άλλη ακτίνα.
        const roleMeta = ROLE_META[form.role]
        const RoleIcon = roleMeta?.GroupIcon || Users
        return (
        <Modal open onClose={requestCloseModal}
          title={editContact ? 'Επεξεργασία επαφής' : 'Νέα επαφή'}
          subtitle={editContact ? editContact.full_name : undefined}
          icon={roleMeta ? <RoleIcon size={17} /> : undefined}
          size="md"
          footer={<>
            <Btn onClick={requestCloseModal} disabled={saving}>Ακύρωση</Btn>
            <Btn variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Αποθήκευση…' : editContact ? 'Αποθήκευση αλλαγών' : 'Προσθήκη επαφής'}
            </Btn>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── Στοιχεία ──
                Ποια πεδία υπάρχουν εδώ το ορίζει το CONTACT_FIELDS και κάθε ένα
                δείχνει ΓΡΑΜΜΕΝΟ το γιατί το ζητάμε. Η φωτογραφία επαφής έφυγε:
                ένα πορτρέτο του υδραυλικού δεν κάνει τίποτα και ήταν το πρώτο
                πράγμα που έβλεπε ο χρήστης ανοίγοντας τη φόρμα. */}
            {/* ΤΟ ΜΕΓΕΘΟΣ ΤΟΥ ΚΟΥΤΙΟΥ ΕΙΝΑΙ ΥΠΟΣΧΕΣΗ ΓΙΑ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ.
                Ηταν τέσσερα κουτιά το ένα κάτω από το άλλο, καθένα 550
                εικονοστοιχεία σε ταμπλέτα: πεντακόσια πενήντα για δέκα ψηφία
                τηλεφώνου και άλλα τόσα για εννιά του ΑΦΜ. Η φόρμα διαβαζόταν
                σαν να ζητά κείμενο εκεί που ζητά αριθμό· χρειαζόταν και κύλιση
                για τέσσερα πεδία.

                Το όνομα κρατά ολόκληρο το πλάτος, γιατί όντως το θέλει. Τα
                τρία σύντομα μπαίνουν σε μία σειρά των 170: το κουτί λέει
                πλέον την αλήθεια για το τι χωρά και η φόρμα χωρά ολόκληρη σε
                μία οθόνη. Σε κινητό η σειρά σπάει μόνη της. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <CField d={cf('contact.name')} required>
                <Inp value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} placeholder="Γιώργος Παπαδόπουλος" />
              </CField>
              <div {...fieldRow(160, 16, { alignItems: 'start' })}>
                <CField d={cf('contact.role')}>
                  <CustomSelect ariaLabel="Ρόλος επαφής" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))}
                    options={ROLE_SELECT_OPTIONS.filter(o => !o.disabled).map(o => ({ value: o.value, label: o.label }))} />
                  {isOtherRole(form.role) && <div style={{ marginTop: 10 }}><Inp value={roleOther} onChange={setRoleOther} placeholder="Κατηγορία" /></div>}
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
            </div>

            {/* ── Πτυσσόμενες λεπτομέρειες ── */}
            <button type="button" onClick={() => setShowMore(m => !m)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', border: '1px dashed var(--border-default)', borderRadius: T.radius.inner, background: 'transparent', color: 'var(--text-secondary)', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans }}>
              {showMore ? 'Λιγότερες λεπτομέρειες' : 'Περισσότερες λεπτομέρειες'}
              <svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
            </button>

            {showMore && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SecHead>Επικοινωνία και πληρωμές</SecHead>
                  <div {...fieldRow(190, 16, { alignItems: 'start' })}>
                    <CField d={cf('contact.email')}>
                      <Inp value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@example.gr" />
                    </CField>
                    <CField d={cf('contact.mobile')}>
                      <Inp value={form.extra.phone2 || ''} onChange={v => setExtra('phone2', v)} placeholder="6941234567" />
                    </CField>
                  </div>
                  <CField d={cf('contact.messaging')}>
                    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle on={!!form.extra.whatsapp} onChange={v => setExtra('whatsapp', v)} ariaLabel="WhatsApp" /><span style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>WhatsApp</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle on={!!form.extra.viber} onChange={v => setExtra('viber', v)} ariaLabel="Viber" /><span style={{ fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-primary)' }}>Viber</span></div>
                    </div>
                  </CField>
                  <CField d={cf('contact.iban')}>
                    <Inp value={form.extra.iban || ''} onChange={v => setExtra('iban', v)} placeholder="GR16 0110 1250 0000 0001 2300 695" />
                  </CField>
                  <CField d={cf('contact.iris')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-primary)' }}>Δέχεται πληρωμή με IRIS</span>
                      <Toggle on={!!form.extra.iris} onChange={v => setExtra('iris', v)} ariaLabel="Δέχεται πληρωμή με IRIS" />
                    </div>
                  </CField>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <SecHead>Στοιχεία συνεργάτη</SecHead>
                  <div {...fieldRow(190, 16, { alignItems: 'start' })}>
                    <CField d={cf('contact.specialty')}>
                      <Inp value={form.extra.specialty || ''} onChange={v => setExtra('specialty', v)} placeholder="Ειδικός σε κεντρική θέρμανση" />
                    </CField>
                    <CField d={cf('contact.website')}>
                      <Inp value={form.extra.website || ''} onChange={v => setExtra('website', v)} placeholder="www.example.gr" />
                    </CField>
                  </div>
                  {/* ΑΠΛΟ ΠΕΔΙΟ ΚΕΙΜΕΝΟΥ. Ήταν autocomplete που έστελνε κάθε
                      πληκτρολόγηση σε τρίτο εξυπηρετητή — διεύθυνση γραφείου
                      τρίτου προσώπου, εκτός της υποδομής μας. */}
                  <div {...fieldRow(190, 16, { alignItems: 'start' })}>
                    <CField d={cf('contact.address')}>
                      <Inp value={form.extra.office_address || ''} onChange={v => setExtra('office_address', v)} placeholder="Οδός, αριθμός, πόλη" />
                    </CField>
                    <CField d={cf('contact.next_appointment')}>
                      <DatePicker value={form.extra.next_appointment || ''} onChange={v => setExtra('next_appointment', v)} />
                    </CField>
                  </div>
                  <CField d={cf('contact.scope')}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {([{ v: 'property' as const, label: 'Συγκεκριμένο ακίνητο', Icon: Building2 }, { v: 'portfolio' as const, label: 'Όλο το χαρτοφυλάκιο', Icon: Globe }]).map(o => {
                        const active = (form.extra.scope || 'property') === o.v; const Ico = o.Icon; return (
                          <button key={o.v} type="button" onClick={() => setExtra('scope', o.v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: T.radius.pill, border: '1px solid ' + (active ? 'var(--accent-border)' : 'var(--border-subtle)'), background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 'var(--fs-base)', cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                            <Ico size={14} />{o.label}
                          </button>
                        )
                      })}
                    </div>
                    {(form.extra.scope || 'property') !== 'portfolio' && properties.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <CustomSelect ariaLabel="Ακίνητο" value={form.extra.scope_property_id || propertyId} onChange={v => setExtra('scope_property_id', v)}
                          options={properties.map(p => ({ value: p.id, label: p.name }))} />
                      </div>
                    )}
                  </CField>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
                    <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Προτιμώμενη επαφή</div><div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Ανεβαίνει στη γρήγορη πρόσβαση, για να τη βρίσκεις αμέσως</div></div>
                    <Toggle on={!!form.extra.preferred} onChange={v => setExtra('preferred', v)} ariaLabel="Προτιμώμενη επαφή" />
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
          {error && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.inner, padding: '11px 16px', color: 'var(--negative)', fontSize: 'var(--fs-base)' }}>{error}</div>}
        </Modal>
        )
      })()}

      {/* ΤΟ ΠΑΡΑΘΥΡΟ ΔΙΑΓΡΑΦΗΣ ΕΦΥΓΕ ΜΑΖΙ ΜΕ ΤΗΝ ΚΑΤΑΣΤΑΣΗ ΤΟΥ. Ήταν εικονίδιο,
          μία ερώτηση, μία πρόταση και δύο κουμπιά — ακριβώς ο ορισμός του
          confirmDialog. Η κατάσταση `deleteId` υπήρχε ΜΟΝΟ για να το ανοίγει,
          οπότε σβήστηκε και αυτή: η ερώτηση ζει τώρα μέσα στο `askDelete`. */}

      {dup && (
        <Modal open onClose={requestCloseDup} title="Υπάρχει ήδη παρόμοια επαφή" size="sm"
          footer={<>
            <Btn onClick={requestCloseDup} disabled={saving}>Ακύρωση</Btn>
            <Btn onClick={() => persist('insert')} disabled={saving}>Ξεχωριστή</Btn>
            <Btn variant="primary" onClick={() => persist('merge', dup)} disabled={saving}>{saving ? 'Συγχώνευση…' : 'Συγχώνευση'}</Btn>
          </>}>
          {/* ΔΕΝ ΕΙΝΑΙ ΕΡΩΤΗΣΗ ΝΑΙ/ΟΧΙ, ΑΡΑ ΔΕΝ ΕΙΝΑΙ confirmDialog: οι απαντήσεις
              είναι ΤΡΕΙΣ (ακύρωση, ξεχωριστή εγγραφή, συγχώνευση) και ανάμεσά
              τους στέκει η καρτέλα της επαφής που βρέθηκε — χωρίς αυτήν ο
              χρήστης δεν ξέρει ΜΕ ΠΟΙΑΝ θα συγχωνεύσει. */}
          <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>Βρέθηκε επαφή με το ίδιο τηλέφωνο ή ΑΦΜ. Θέλεις να τη συγχωνεύσεις (να συμπληρωθούν τα νέα στοιχεία) ή να δημιουργήσεις ξεχωριστή εγγραφή;</p>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{dup.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {dup.phone && <span style={{ fontFamily: T.font.mono }}>{dup.phone}</span>}
              {dup._extra?.afm && <span title="Αριθμός Φορολογικού Μητρώου">ΑΦΜ {dup._extra.afm}</span>}
            </div>
          </div>
        </Modal>
      )}

      {quickExpense && <QuickExpenseModal contact={quickExpense} propertyId={propertyId} userId={userId} onClose={() => setQuickExpense(null)} onSaved={() => { notifyOk('Δαπάνη αποθηκεύτηκε'); setDossierRefresh(x => x + 1) }} />}
      {quickCalendar && <QuickCalendarModal contact={quickCalendar} propertyId={propertyId} userId={userId} onClose={() => setQuickCalendar(null)} onSaved={(date) => { linkAppointmentToContact(quickCalendar, date); notifyOk('Ραντεβού προστέθηκε, καταχωρήθηκε και στην επαφή') }} />}
      {historyContact && <HistoryModal contact={historyContact} propertyId={propertyId} onClose={() => setHistoryContact(null)} />}
      {qrContact && <QRCodeModal contact={qrContact} onClose={() => setQrContact(null)} />}
    </div>
  )
}