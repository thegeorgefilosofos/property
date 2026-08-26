'use client'
import { navLabel } from '@/lib/nav/labels';
import { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { isoDate, athensToday, daysUntil as athensDaysUntil } from '@/lib/core/time'
import { deviceNotifyOn, NOTIFY_EVENT } from '@/lib/push/client'
import { addMonths } from '@/lib/loans/progress'
import { createClient } from '@/lib/supabase/client'
import * as properties from '@/lib/data/properties';
import * as stayStore from '@/lib/data/stays';
import * as billStore from '@/lib/data/bills';
import * as tenantStore from '@/lib/data/tenants';
import * as expenses from '@/lib/data/expenses'
// Το Supabase δεν πετάει σε σφάλμα βάσης· η `must` το κάνει να πετάει.
import { must } from '@/lib/supabase/must'
// Ο πίνακας των γεγονότων έχει ένα σπίτι: lib/data/calendar.
import * as calendar from '@/lib/data/calendar'
import * as feedStore from '@/lib/data/calendarFeed'
import { feedUrl } from '@/lib/data/calendarFeed'
// Ο πίνακας των δανείων έχει ένα σπίτι: lib/data/loans.
import * as loanStore from '@/lib/data/loans'
import type { BillsRow, CalendarEventsRow, ClientStaysRow, MaintenanceTasksRow } from '@/lib/supabase/tables'
import type { TenantScheduleInput } from './TabTenantHelpers'

// Ό,τι διαβάζει ο συγχρονισμός από κάθε πίνακα, γραμμένο εδώ και μόνο εδώ.
type TenantScheduleRow = TenantScheduleInput & { rent_due_day?: number | null }
type StayWithGuest = Pick<ClientStaysRow, 'id'|'check_in'|'check_out'|'total'|'nights'|'guests'|'channel'> & { clients?: { full_name?: string | null } | null }
// Οι μπάρες διαμονής της προβολής Μήνα ζητούν ΛΙΓΟΤΕΡΕΣ στήλες από τον συγχρονισμό
// κρατήσεων (χωρίς nights/guests). Δηλώνονται ξεχωριστά, ακριβώς όσες λέει το
// select(), ώστε στήλη που δεν ζητήθηκε να μη διαβάζεται κατά λάθος ως υπαρκτή.
//
// ΤΟ `clients(full_name)` ΜΕΝΕΙ `unknown`, ΚΑΙ ΟΧΙ ΑΠΟ ΤΕΜΠΕΛΙΑ. Το σχήμα του
// συνδεδεμένου πίνακα δεν είναι στήλη: το `client_stays.client_id` δείχνει σε ΕΝΑΝ
// πελάτη, άρα το PostgREST επιστρέφει αντικείμενο — αλλά ο τύπος που συμπεραίνει το
// postgrest-js χωρίς γεννημένους τύπους βάσης υποθέτει ΠΙΝΑΚΑ (`{full_name}[]`).
// Οι δύο διαφωνούν και κανείς δεν μπορεί να αποδειχθεί εδώ, οπότε το διαβάζουμε με
// φύλακα που δέχεται και τα δύο — αντί να δηλώσουμε τη μία εκδοχή και, αν είναι η
// λάθος, το `?.full_name` να δίνει σιωπηλά undefined σε ΚΑΘΕ κράτηση.
type StayBarRow = Pick<ClientStaysRow, 'id'|'check_in'|'check_out'|'total'|'channel'> & { clients?: unknown }
const joinedFullName = (v: unknown): string | null => {
  const one: unknown = Array.isArray(v) ? v[0] : v
  if (!one || typeof one !== 'object' || !('full_name' in one)) return null
  return typeof one.full_name === 'string' ? one.full_name : null
}
import { savedData } from '@/components/dbWrite'
import { T, Modal, Spinner, Skeleton, EmptyState, Chip, feAuto, fe, fn, localDay, pressable, CloseButton } from '@/components/Theme'
import { fixedCols } from '@/components/tokens'
import type { XlsxSheet, XlsxCol } from './exportXlsx';
import { downloadXlsx } from './sheets';
import {
  AlertTriangle, Plus, X, ChevronLeft, ChevronRight,
  Calendar, List, Check, FileText,
  Zap, Shield, User, Bell, Filter, Download,
  ChevronDown, Edit2, Trash2, RotateCcw,
  Euro, Wrench, RefreshCw, Landmark,
  Printer, CheckSquare, CalendarDays, ArrowRight,
  TrendingUp, Clock, Info, MoreHorizontal, Share2, CalendarPlus, Repeat,
} from 'lucide-react'
import { DatePicker, CustomSelect, NumberInput } from './UIComponents'
import { allCalendarLinks, buildICS } from '@/lib/calendar/externalLinks'
import { holidayName, isWeekend } from '@/lib/calendar/greekHolidays'
import { expandRecurring } from '@/lib/calendar/recurrence'
import { findConflicts } from '@/lib/calendar/availability'
import { parseICS } from '@/lib/calendar/icsImport'
import { parseQuickAdd } from '@/lib/calendar/quickAdd'
import { groupSeries, rowCount, type SeriesRow } from '@/lib/calendar/series'
import { dueReminders, notifyBody } from '@/lib/calendar/notify'
import { buildBookingEvents } from '@/lib/calendar/bookingEvents'
import { toStaySpan, staysOnDay, weekSegments, channelColor, type StaySpan } from '@/lib/calendar/stayBars'
import { buildInviteICS, inviteMailto, inviteWhatsApp, inviteViber, canInvite } from '@/lib/calendar/invite'
import {
  taxObligationsHorizon, taxObligationToEvent, taxProfileOf, taxKindMeta, taxKindOfEventSource,
  TAX_EVENT_CATEGORY, CONFIDENCE_LABEL, CONFIDENCE_HINT, AADE_CALENDAR_URL, TAXHEAVEN_CALENDAR_URL,
} from '@/lib/tax/greekTaxCalendar'
import { WHO_LABEL } from '@/lib/accounting/dossier'
import { annuityMonthly } from '@/lib/loans/recommend'
import { syncTenantSchedule } from './TabTenantHelpers'
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { confirmDialog } from '@/components/confirmBus';
import { MONTHS_GEN, MONTHS_NOM, MONTHS_SHORT, DAY_NAMES_SHORT, mondayFirst } from '@/lib/core/months';
import { INK, INK_MUTED } from '@/lib/print/ink';
import { reportHead, reportHeader, reportDisclaimer, openReport, rEsc, rEur } from './reportPdf';
import { downloadFile } from '@/lib/core/download'

// Οι τρεις απαριθμήσεις του γεγονότος ζουν στο στρώμα δεδομένων, όχι εδώ: τις
// γράφουν και άλλες οθόνες και μία λάθος συμβολοσειρά είναι αόρατη μέχρι να
// φτάσει στη βάση.
type EventCategory = calendar.EventCategory
type EventPriority = calendar.EventPriority
type EventStatus   = calendar.EventStatus
// Μήνας + Ατζέντα. Οι προβολές Έτους/Εβδομάδας/Ημέρας έφυγαν: ο ιδιοκτήτης έχει μια
// ντουζίνα προθεσμίες τον χρόνο, όχι ραντεβού του λεπτού — και τα ίδια νούμερα
// επαναλαμβάνονταν με τρεις διαφορετικές εμβέλειες σε τρεις προβολές.
type ViewMode      = 'month' | 'agenda'

interface CalEvent {
  id: string; property_id: string; user_id: string; title: string
  category: EventCategory; event_date: string; event_time?: string | null; duration_minutes?: number | null
  amount?: number | null
  priority: EventPriority; status: EventStatus; recurring: boolean
  recurring_interval?: string | null; notes?: string | null
  source: string; attachment_url?: string | null; color?: string | null; created_at: string
  contact_phone?: string | null; contact_email?: string | null
  recurrence_until?: string | null; recurrence_count?: number | null; recurrence_exdates?: string[] | null
  _virtual?: boolean; _seriesId?: string  // εικονική εμφάνιση επαναλαμβανόμενου (μόνο για προβολή)
}

interface FormState {
  title: string; category: EventCategory; event_date: string; event_time: string; duration: string; amount: string
  priority: EventPriority; status: EventStatus; recurring: boolean
  recurring_interval: string; recurrence_end_mode: 'none'|'until'|'count'; recurrence_until: string; recurrence_count: string
  notes: string; attachment_url: string; phone: string; email: string; add_expense: boolean
}

// Χρώματα κατηγοριών ευθυγραμμισμένα με το Google
const CATEGORIES: Record<EventCategory, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  tax:         { label: 'Φορολογικά',   color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <Landmark size={11}/> },
  financial:   { label: 'Οικονομικά',   color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <Euro size={11}/> },
  bills:       { label: 'Λογαριασμοί', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <Zap size={11}/> },
  maintenance: { label: 'Συντήρηση',   color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <Wrench size={11}/> },
  contract:    { label: 'Συμβόλαιο',   color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <FileText size={11}/> },
  tenant:      { label: 'Ενοικιαστής', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <User size={11}/> },
  reminder:    { label: 'Υπενθύμιση',  color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', icon: <Bell size={11}/> },
}

const PRIORITIES: Record<EventPriority, { label: string; color: string }> = {
  low:      { label: 'Χαμηλή',  color: 'var(--text-secondary)' },
  medium:   { label: 'Μέτρια',  color: 'var(--text-secondary)' },
  high:     { label: 'Υψηλή',   color: 'var(--text-secondary)' },
  critical: { label: 'Κρίσιμη', color: 'var(--negative)' },
}

const STATUSES: Record<EventStatus, { label: string; color: string }> = {
  pending:     { label: 'Εκκρεμεί',    color: 'var(--warning)' },
  paid:        { label: 'Πληρώθηκε',   color: 'var(--positive)' },
  in_progress: { label: 'Σε εξέλιξη', color: 'var(--accent)' },
  cancelled:   { label: 'Ακυρώθηκε',  color: 'var(--negative)' },
}

// ── Κατηγορίες που γράφουν ΑΛΛΕΣ καρτέλες ─────────────────────────────────────
// Ο συγχρονισμός μίσθωσης, ασφάλισης και αερίου γράφει στη στήλη `category` τιμές
// που ΔΕΝ υπάρχουν στο `CATEGORIES`. Το ημερολόγιο έκανε `CATEGORIES[e.category].color`
// και έσπαγε στην πρώτη τέτοια εγγραφή· μεταφράζονται ΜΙΑ φορά, στην είσοδο.
//
// Ο πίνακας ψευδωνύμων ζει πλέον στο στρώμα δεδομένων, δίπλα στον τύπο που εξηγεί:
// τα ονόματα τα γράφουν τρεις οθόνες και τα διαβάζει αυτή.
const canonicalCategory = calendar.canonicalCategory

// Τα σταθερά στοιχεία κάθε φορολογικής υποχρέωσης — ποιος το κάνει και πόσο σίγουρη
// είναι η ημερομηνία — ανά ΕΙΔΟΣ, ώστε να ισχύουν για γεγονός οποιουδήποτε έτους.
// Πηγή: lib/tax/greekTaxCalendar.ts. Δεν αντιγράφεται τίποτα εδώ.
const TAX_META = taxKindMeta(new Date().getFullYear())

const RECURRING_OPTIONS = [
  { value: 'weekly',    label: 'Κάθε εβδομάδα' },
  { value: 'monthly',   label: 'Κάθε μήνα' },
  { value: 'bimonthly', label: 'Κάθε 2 μήνες' },
  { value: 'quarterly', label: 'Κάθε 3 μήνες' },
  { value: 'biannual',  label: 'Κάθε 6 μήνες' },
  { value: 'annual',    label: 'Κάθε χρόνο' },
]

// «Γεγονότα Αύγουστος» δεν είναι ελληνικά. Ο μήνας μετά από ουσιαστικό μπαίνει
// σε γενική και η γενική δεν βγαίνει με κανόνα από την ονομαστική.

// ═══ ΤΟ ΓΕΜΙΣΜΑ ΠΟΥ ΕΓΙΝΕ ΔΕΔΟΜΕΝΟ ═══════════════════════════════════════
// Ο υπολογιστής δανείου αποθήκευε `bank: bankName || 'Μη καθορισμένη'`. Η φράση
// «Μη καθορισμένη» δεν είναι όνομα τράπεζας: είναι το κείμενο που θα έδειχνε η
// οθόνη ΑΝ έλειπε το όνομα. Γραμμένη στη στήλη, έγινε δεδομένο — και βγήκε
// στο ημερολόγιο ως «Δόση δανείου, Μη καθορισμένη», σε κάθε μία από τις εξήντα
// δόσεις. Η απουσία ανήκει στην οθόνη, όχι στη βάση.
export const UNSET_BANK = 'Μη καθορισμένη'
const cleanBank = (b: string | null | undefined): string => {
  const v = (b || '').trim()
  return !v || v === UNSET_BANK ? '' : v
}
/** «Δόση δανείου, Πειραιώς» — ή σκέτο «Δόση δανείου» όταν η τράπεζα δεν έχει δηλωθεί. */
export const loanEventTitle = (bank: string | null | undefined): string => {
  const b = cleanBank(bank)
  return b ? `Δόση δανείου, ${b}` : 'Δόση δανείου'
}
// Τα ονόματα των ημερών και ο κανόνας «η εβδομάδα ξεκινά Δευτέρα» ζουν στο
// lib/core/months.ts, με ελέγχους πάνω σε πραγματικές ημερομηνίες.
const DAY_NAMES_GR    = DAY_NAMES_SHORT

const EMPTY_FORM: FormState = {
  title: '', category: 'reminder', event_date: '', event_time: '', duration: '', amount: '',
  priority: 'medium', status: 'pending', recurring: false,
  recurring_interval: 'monthly', recurrence_end_mode: 'none', recurrence_until: '', recurrence_count: '',
  notes: '', attachment_url: '', phone: '', email: '', add_expense: false,
}

function fmt(date: string) { if (!date) return ''; const [y,m,d]=date.split('-'); return `${d}/${m}/${y}` }
function fmtShort(date: string) { if (!date) return ''; const [y,m,d]=date.split('-'); return `${d} ${MONTHS_SHORT[parseInt(m)-1]}` }
// Τρέχουσα στιγμή σε ώρα Ελλάδας (Europe/Athens), ανεξάρτητα από τη ζώνη της
// συσκευής — ώστε «σήμερα», η γραμμή «τώρα» και οι υπενθυμίσεις να είναι σωστές.
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΘΗΝΑ ΔΕΝ ΒΓΑΙΝΕΙ ΜΕ ΣΤΡΟΓΓΥΛΟΠΟΙΗΣΗ ΜΕΣΩ ΚΕΙΜΕΝΟΥ.
// ─────────────────────────────────────────────────────────────────────────
// Εδώ ζούσε δεύτερη υλοποίηση ημέρας: `new Date(new Date().toLocaleString(
// 'en-US', {timeZone:'Europe/Athens'}))`. Το ιδίωμα μορφοποιεί σε κείμενο και
// το ΞΑΝΑΔΙΑΒΑΖΕΙ ως τοπική ώρα — δηλαδή στηρίζεται στο ότι ο αναλυτής του
// περιηγητή θα καταλάβει τη μορφή που παρήγαγε ο μορφοποιητής, κάτι που καμία
// προδιαγραφή δεν εγγυάται και που χάνει τα χιλιοστά.
//
// Και η μέτρηση ημερών απο πάνω του έφτιαχνε ΤΡΙΤΟ ζεύγος μεσάνυχτων με
// `setHours(0,0,0,0)` σε δύο διαφορετικές ζώνες. Το `lib/core/time` το κάνει
// σωστά, με `Intl.DateTimeFormat` και σύγκριση ημερολογιακών ημερών.
//
// ΤΟ `athensNow` ΜΕΝΕΙ, γιατί τρία σημεία θέλουν ΑΝΤΙΚΕΙΜΕΝΟ ημερομηνίας για
// τον μήνα που δείχνει το ημερολόγιο — αλλά χτίζεται πλέον απο το
// `athensToday()`, δηλαδή απο την ίδια πηγή, χωρίς γύρισμα απο κείμενο.
// ═══════════════════════════════════════════════════════════════════════════
function athensNow(): Date { const t=athensToday(); return new Date(`${t}T00:00:00`) }
function daysUntil(dateStr: string) { return athensDaysUntil(dateStr) ?? 0 }
function isOverdue(e: CalEvent)  { return e.status==='pending'&&daysUntil(e.event_date)<0 }
function isThisWeek(e: CalEvent) { const d=daysUntil(e.event_date); return e.status==='pending'&&d>=0&&d<=7 }
function isThisMonth(e: CalEvent){ const d=daysUntil(e.event_date); return e.status==='pending'&&d>7&&d<=30 }
function isExpiring(e: CalEvent) { const d=daysUntil(e.event_date); return e.category==='contract'&&e.status==='pending'&&d>=0&&d<=60 }
function todayStr() { return athensToday() }
function addDaysStr(date:string, days:number) { const [y,m,d]=date.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d+days)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}` }

// Google-style tooltip — portal ώστε να ΜΗΝ κόβεται από overflow (π.χ. στα κελιά του μήνα).
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ `inline-flex` ΤΟΥ TOOLTIP ΕΙΝΑΙ ΠΟΥ ΕΣΠΑΣΕ ΤΙΣ ΜΠΑΡΕΣ ΔΙΑΜΟΝΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Το περιτύλιγμα είναι σωστό για ό,τι τυλίγει μέχρι σήμερα: ένα εικονίδιο, ένα
// σήμα, ένα κουμπί — πράγματα που ΠΡΕΠΕΙ να έχουν το πλάτος του περιεχομένου
// τους. Για κάτι που πρέπει να ΓΕΜΙΣΕΙ τον χώρο του όμως, το `inline-flex`
// είναι παγίδα: το παιδί γίνεται στοιχείο ευέλικτου δοχείου και ένα
// `width:'100%'` επάνω του μετρά το 100% ΤΟΥ ΙΔΙΟΥ του περιεχομένου. Δηλαδή
// κυκλικά: πλάτος όσο το κείμενο, όσο μεγάλο κι αν είναι το δοχείο.
//
// Γι' αυτό η κράτηση τεσσάρων νυχτών φαινόταν σαν ένα χάπι, τρία κενά κελιά και
// μια γραμμούλα. Το `fill` το λύνει ρητά, χωρίς να αλλάξει τίποτα στις
// υπόλοιπες τριάντα χρήσεις.
function Tooltip({ text, children, fill }: { text: string; children: React.ReactNode; fill?: boolean }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left:number; top:number; below:boolean }>({ left:0, top:0, below:false })
  const W = 280
  const place = () => { const el=ref.current; if(!el)return; const r=el.getBoundingClientRect(); const below=r.top<170; const cx=r.left+r.width/2; const left=Math.max(8+W/2, Math.min(cx, window.innerWidth-8-W/2)); setPos({ left, top: below?r.bottom+8:r.top-8, below }) }
  useEffect(()=>{ if(!show)return; place(); const s=()=>place(); window.addEventListener('scroll',s,true); window.addEventListener('resize',s); return ()=>{ window.removeEventListener('scroll',s,true); window.removeEventListener('resize',s) } },[show])
  return (
    <div ref={ref} style={fill?{ display:'flex', width:'100%', height:'100%' }:{ display:'inline-flex' }} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && text && createPortal(
        <div style={{ position:'fixed', left:pos.left, top:pos.top, transform:`translate(-50%, ${pos.below?'0':'-100%'})`, background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:8, padding:'9px 13px', fontSize:12, lineHeight:1.5, color:'var(--text-primary)', fontFamily: T.font.sans, zIndex:3000, pointerEvents:'none', width:W, maxWidth:'calc(100vw - 16px)', whiteSpace:'pre-wrap' as const, boxShadow:'var(--elev-3)' }}>
          {text}
        </div>, document.body)}
    </div>
  )
}

function StatusDot({ status }: { status: EventStatus }) {
  const s = STATUSES[status]
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontFamily: T.font.sans, color:s.color, letterSpacing:'0.25px' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.color, display:'inline-block', flexShrink:0 }}/>
      {s.label}
    </span>
  )
}

// Μετατροπή γεγονότος σε είσοδο για τους συνδέσμους εξωτερικών ημερολογίων.
function toCalInput(e: CalEvent) {
  const cat = CATEGORIES[e.category]?.label || ''
  const details = [e.notes||'', e.amount?`Ποσό: ${fe(e.amount)}`:''].filter(Boolean).join(' · ')
  return { title: (cat?`${cat}: `:'')+e.title, date: e.event_date, time: e.event_time||undefined, durationMinutes: e.duration_minutes||undefined, details }
}
function downloadEventIcs(e: CalEvent) {
  downloadFile(buildICS(toCalInput(e)), `${e.title.slice(0,40)||'γεγονός'}.ics`, 'text/calendar;charset=utf-8')
}

// «Πρόσθεσε σε ημερολόγιο» + «Κοινοποίηση» — ένα διακριτικό μενού, portal ώστε να
// μη κόβεται. Καλύπτει Google / Outlook / Office 365 / Apple(.ics) / Yahoo και
// κοινοποίηση σε WhatsApp / Viber. Καθαροί σύνδεσμοι, χωρίς backend.
function AddToCalendarMenu({ event, onEdit, onDelete, onOpenChange }: { event: CalEvent; onEdit?:(e:CalEvent)=>void; onDelete?:(id:string)=>void; onOpenChange?:(open:boolean)=>void }) {
  const [open,setOpen]=useState(false)
  const btnRef=useRef<HTMLButtonElement>(null)
  const popRef=useRef<HTMLDivElement>(null)
  const [pos,setPos]=useState({top:0,left:0,maxH:440,up:false})
  const setOpenX=setOpen
  // Ειδοποίηση γονέα εκτός φάσης render (όχι μέσα στον updater) — αποφυγή warning/StrictMode διπλο-κλήσης.
  useEffect(()=>{ onOpenChange?.(open) },[open,onOpenChange])
  // Τοποθέτηση με επίγνωση viewport: διάλεξε την πλευρά (κάτω/πάνω) με τον
  // περισσότερο χώρο και όρισε maxHeight ίσο με τον διαθέσιμο χώρο, ώστε το μενού
  // να ΧΩΡΑΕΙ ΠΑΝΤΑ στην οθόνη και να κάνει εσωτερικό scroll αν δεν φτάνει.
  const reposition=()=>{
    if(!btnRef.current)return;
    const r=btnRef.current.getBoundingClientRect();
    const W=232, M=8, GAP=6, DESIRED=440;
    const left=Math.max(M, Math.min(r.left, window.innerWidth-W-M));
    const spaceBelow=window.innerHeight - r.bottom - M;
    const spaceAbove=r.top - M;
    const up = spaceBelow < DESIRED && spaceAbove > spaceBelow;
    const avail = up ? spaceAbove : spaceBelow;
    const maxH = Math.max(140, Math.min(avail - GAP, DESIRED));
    setPos({ top: up ? r.top - GAP : r.bottom + GAP, left, maxH, up });
  }
  useEffect(()=>{ if(!open)return; reposition(); const h=(ev:MouseEvent)=>{const t=ev.target as Node; if(btnRef.current&&!btnRef.current.contains(t)&&popRef.current&&!popRef.current.contains(t))setOpenX(false)}; const s=()=>reposition(); document.addEventListener('mousedown',h); window.addEventListener('scroll',s,true); window.addEventListener('resize',s); return ()=>{document.removeEventListener('mousedown',h); window.removeEventListener('scroll',s,true); window.removeEventListener('resize',s)} },[open])
  const links=allCalendarLinks(toCalInput(event))
  const row=(label:string,onClick:()=>void,icon:React.ReactNode,danger?:boolean)=>(
    <button key={label} type="button" onClick={()=>{onClick();setOpenX(false)}} style={{ display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',border:'none',background:'transparent',cursor:'pointer',textAlign:'left',color:'var(--text-primary)',fontSize:13,fontFamily: T.font.sans,borderRadius:8,transition:'background 0.12s, color 0.12s' }} onMouseEnter={e=>{e.currentTarget.style.background=danger?'var(--negative-dim)':'var(--bg-hover)';if(danger)e.currentTarget.style.color='var(--negative)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';if(danger)e.currentTarget.style.color='var(--text-primary)'}}>
      <span style={{ color:danger?'inherit':'var(--text-tertiary)',display:'flex',flexShrink:0 }}>{icon}</span>{label}
    </button>
  )
  const openExt=(href:string)=>window.open(href,'_blank','noopener,noreferrer')
  return (
    <>
      <button ref={btnRef} type="button" aria-label="Ενέργειες" title="Ενέργειες" onClick={e=>{e.stopPropagation();setOpenX(o=>!o)}}
        style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:'50%',border:'1px solid '+(open?'var(--border-default)':'transparent'),background:open?'var(--bg-elevated)':'transparent',cursor:'pointer',color:'var(--text-secondary)',flexShrink:0,transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
        <MoreHorizontal size={16}/>
      </button>
      {open&&createPortal(
        <div ref={popRef} style={{ position:'fixed',top:pos.top,left:pos.left,transform:pos.up?'translateY(-100%)':'none',width:232,maxHeight:pos.maxH,overflowY:'auto',overscrollBehavior:'contain',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,boxShadow:'var(--elev-3)',padding:6,zIndex:2000 }}>
          <div style={{ fontSize:11,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'6px 12px 4px',fontFamily: T.font.sans }}>Πρόσθεσε σε ημερολόγιο</div>
          {row('Google Calendar',()=>openExt(links.google),<Calendar size={15}/>)}
          {row('Outlook',()=>openExt(links.outlook),<Calendar size={15}/>)}
          {row('Office 365',()=>openExt(links.office),<Calendar size={15}/>)}
          {row('Apple / λήψη .ics',()=>downloadEventIcs(event),<Download size={15}/>)}
          {row('Yahoo',()=>openExt(links.yahoo),<Calendar size={15}/>)}
          <div style={{ height:1,background:'var(--border-subtle)',margin:'6px 8px' }}/>
          <div style={{ fontSize:11,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'2px 12px 4px',fontFamily: T.font.sans }}>Κοινοποίηση</div>
          {row('WhatsApp',()=>openExt(links.whatsapp),<Share2 size={15}/>)}
          {row('Viber',()=>openExt(links.viber),<Share2 size={15}/>)}
          {(onEdit||onDelete)&&<div style={{ height:1,background:'var(--border-subtle)',margin:'6px 8px' }}/>}
          {onEdit&&row('Επεξεργασία',()=>onEdit(event),<Edit2 size={15}/>)}
          {onDelete&&row('Διαγραφή',()=>onDelete(event.id),<Trash2 size={15}/>,true)}
        </div>, document.body)}
    </>
  )
}

function EventCard({ event, onToggleStatus, onEdit, onDelete, selected, onSelect, bulkMode }: {
  event: CalEvent; onToggleStatus:(e:CalEvent)=>void; onEdit:(e:CalEvent)=>void
  onDelete:(id:string)=>void; selected?:boolean; onSelect?:(id:string)=>void; bulkMode?:boolean
}) {
  const overdue = isOverdue(event)
  const done    = event.status==='paid'||event.status==='cancelled'
  const cat     = CATEGORIES[event.category]
  const isAuto  = event.source!=='manual'
  // Φορολογική προθεσμία: το ημερολόγιο ξέρει ΠΟΙΟΣ την κάνει και ΠΟΣΟ σίγουρη
  // είναι η ημερομηνία. Δεν τα κρατά για τον εαυτό του.
  const taxKind = taxKindOfEventSource(event.source)
  const taxInfo = taxKind ? TAX_META[taxKind] : null
  const due     = daysUntil(event.event_date)
  const relLbl = (n:number) => { const a=Math.abs(n); return a===1?'1 ημέρα':`${a} ημέρες` }
  const [hover,setHover]=useState(false)
  const [menuOpen,setMenuOpen]=useState(false)
  // ═══ ΤΟ ΕΚΠΡΟΘΕΣΜΟ ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ ΚΟΚΚΙΝΟ ══════════════════════════════════
  // Η κάρτα βαφόταν κόκκινη σε περίγραμμα και σε λωρίδα. Με τέσσερα εκπρόθεσμα
  // στη σειρά, η οθόνη γινόταν ένα κόκκινο μπλοκ όπου τίποτα δεν ξεχωρίζει από
  // τίποτα — και το κόκκινο σταματά να σημαίνει κάτι όταν το φοράνε όλοι.
  // Η ίδια οθόνη το λύνει ήδη αλλού με ιεραρχία: πιο έντονη λωρίδα και πιο βαρύ
  // νούμερο ημερών. Ίδια γλώσσα με τη λίστα «τι χρειάζεται τώρα» της Επισκόπησης.
  const accentBar = overdue?'var(--accent)':`color-mix(in srgb, ${cat.color} 50%, transparent)`

  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{ display:'flex', alignItems:'flex-start', gap:11, padding:'12px 15px',
      background: selected?'var(--accent-dim)':done?'var(--bg-elevated)':'var(--bg-surface)',
      border:`1px solid ${selected?'var(--border-accent)':'var(--border-subtle)'}`,
      borderLeft:`${overdue?4:3}px solid ${accentBar}`,
      borderRadius:10, opacity:done?0.62:1, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', boxShadow:'var(--shadow-sm)',
    }}>
      {bulkMode&&onSelect&&(
        <button aria-label="Επιλογή" aria-pressed={selected} onClick={()=>onSelect(event.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', flexShrink:0, marginTop:2 }}>
          <span style={{ width:18, height:18, borderRadius:6, border:`2px solid ${selected?'var(--accent)':'var(--border-default)'}`, background:selected?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition: 'background-color 0.13s, border-color 0.13s, color 0.13s, box-shadow 0.13s, transform 0.13s, opacity 0.13s' }}>
            {selected&&<Check size={12} color="var(--accent-text)" strokeWidth={3}/>}
          </span>
        </button>
      )}
      {/* ΤΟ ΙΔΙΟ ΣΤΡΟΓΓΥΛΟ ΚΟΥΤΑΚΙ, ΔΥΟ ΧΡΩΜΑΤΑ, ΔΥΟ ΚΑΡΤΕΛΕΣ. Στις Εκκρεμότητες
          το κουμπί ολοκλήρωσης άλλαξε από πράσινο σε μπλε, με τον λόγο γραμμένο
          δίπλα του: το πράσινο γινόταν το πιο δυνατό χρώμα της οθόνης και
          μετέτρεπε μια μέτρηση σε επιβράβευση. Το ημερολόγιο δεν πήρε ποτέ την
          ίδια διόρθωση. Το μπλε μένει το χρώμα της πράξης, εδώ και εκεί. */}
      {!bulkMode&&(
        <button aria-label={done?'Αναίρεση':'Ολοκλήρωση'} onClick={()=>onToggleStatus(event)} style={{ marginTop:1, flexShrink:0, width:18, height:18, borderRadius:'50%', border:`2px solid ${done?'var(--accent)':'var(--border-default)'}`, background:done?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
          {done&&<Check size={9} color="var(--accent-text)"/>}
        </button>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
          <span style={{ fontFamily: T.font.sans, fontSize:14, fontWeight:500, color:done?'var(--text-tertiary)':'var(--text-primary)', textDecoration:done?'line-through':'none', letterSpacing:'0.1px', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {event.title}
          </span>
          {event.recurring&&<Tooltip text="Επαναλαμβανόμενο"><RotateCcw size={11} color="var(--text-tertiary)" style={{ flexShrink:0 }}/></Tooltip>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
            <span style={{ width:7, height:7, borderRadius:3, background:cat.color, flexShrink:0 }}/>
            <span style={{ fontSize:12, fontFamily: T.font.sans, color:'var(--text-tertiary)', letterSpacing:'0.3px' }}>{cat.label}</span>
          </span>
          {event.status!=='pending'&&<StatusDot status={event.status}/>}
          {event.amount!=null&&(
            <span style={{ fontSize:13, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)', fontWeight:500 }}>
              {feAuto(event.amount)}
            </span>
          )}
          {event.attachment_url&&(
            <a href={event.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--accent)', display:'flex', alignItems:'center', gap:2, fontFamily: T.font.sans }}>
              Σύνδεσμος <ArrowRight size={9}/>
            </a>
          )}
        </div>
        {/* ═══ ΤΡΙΑ ΠΡΑΓΜΑΤΑ, ΤΑ ΔΥΟ ΙΔΙΑ ΣΕ ΚΑΘΕ ΚΑΡΤΑ ══════════════════════
            Κάθε φορολογική προθεσμία κουβαλούσε τρεις ενδείξεις. Η μία —ποιος
            την κάνει— αλλάζει ανά υποχρέωση και μένει. Οι άλλες δύο ήταν οι
            ίδιες σε όλες: μια ολόκληρη προτροπή σε ετικέτα και ένας σύνδεσμος
            προς την ΙΔΙΑ σελίδα της ΑΑΔΕ. Με τέσσερα εκπρόθεσμα στη σειρά, ο
            χρήστης διάβαζε τέσσερις φορές την ίδια πρόταση και έβλεπε τέσσερις
            φορές τον ίδιο σύνδεσμο — που υπάρχει ούτως ή άλλως, μία φορά, στην
            κορδέλα των φορολογικών προθεσμιών πάνω από τη λίστα. */}
        {taxInfo&&(
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:7 }}>
            <Chip tone="neutral" title="Ποιος κάνει αυτή τη δουλειά">{WHO_LABEL[taxInfo.who]}</Chip>
            <Chip tone="neutral" title={CONFIDENCE_HINT[taxInfo.confidence]}>
              {CONFIDENCE_LABEL[taxInfo.confidence]}
            </Chip>
          </div>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
        {/* Το βάρος κάνει τη δουλειά που έκανε το χρώμα: εκπρόθεσμο και σημερινό
            διαβάζονται πιο έντονα, τα υπόλοιπα υποχωρούν. */}
        <span style={{ fontSize:12, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', fontWeight:(overdue||due===0)?600:400, color:(overdue||due===0)?'var(--text-primary)':'var(--text-secondary)' }}>
          {overdue?`πριν ${relLbl(due)}`:due===0?'Σήμερα':due===1?'Αύριο':fmt(event.event_date)}{event.event_time?` · ${event.event_time}`:''}
        </span>
        {!bulkMode&&(
          <div style={{ display:'flex', gap:2, alignItems:'center', opacity:(hover||menuOpen)?1:0, pointerEvents:(hover||menuOpen)?'auto':'none', transition:'opacity 0.13s' }}>
            <AddToCalendarMenu event={event} onEdit={isAuto?undefined:onEdit} onDelete={onDelete} onOpenChange={setMenuOpen}/>
          </div>
        )}
      </div>
    </div>
  )
}

// Ενιαίο drag με pointer events — δουλεύει σε ΠΟΝΤΙΚΙ ΚΑΙ ΑΦΗ (κινητό/tablet).
// Στόχοι drop φέρουν data-drop-date (και προαιρετικά data-drop-time: «HH:00» για ώρα,
// «» για ολοήμερο, απόν = κράτα ώρα). Η μεταφορά ξεκινά μετά από κατώφλι 6px ώστε το
// απλό «κλικ» να ανοίγει κανονικά το γεγονός.
type DragCtl = { onDown:(id:string,label:string)=>(e:React.PointerEvent)=>void; ghost:{label:string;x:number;y:number}|null }
function usePointerDrag(onMove:(id:string,date:string,time?:string|null)=>void): DragCtl {
  const [ghost,setGhost]=useState<{label:string;x:number;y:number}|null>(null)
  const st=useRef<{id:string;label:string;active:boolean;sx:number;sy:number}|null>(null)
  const clearHot=()=>document.querySelectorAll('[data-drop-hot]').forEach(n=>{const el=n as HTMLElement; el.style.background=el.dataset.dropBg||''; el.removeAttribute('data-drop-hot'); delete el.dataset.dropBg})
  useEffect(()=>{
    const move=(e:PointerEvent)=>{
      const s=st.current; if(!s)return
      if(!s.active){ if(Math.hypot(e.clientX-s.sx,e.clientY-s.sy)<6)return; s.active=true }
      e.preventDefault()
      setGhost({label:s.label,x:e.clientX,y:e.clientY})
      clearHot()
      const el=(document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest('[data-drop-date]') as HTMLElement|null
      if(el){ el.dataset.dropBg=el.style.background; el.setAttribute('data-drop-hot','1'); el.style.background='var(--accent-dim)' }
    }
    const up=(e:PointerEvent)=>{
      const s=st.current; st.current=null; setGhost(null)
      if(!s||!s.active){ clearHot(); return }
      const el=(document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest('[data-drop-date]') as HTMLElement|null
      clearHot()
      if(el&&el.dataset.dropDate){ const t=el.dataset.dropTime; onMove(s.id, el.dataset.dropDate, t===undefined?undefined:(t===''?null:t)) }
      // κατάπιε το επόμενο click ώστε να μην ανοίξει «νέο γεγονός» στο cell
      const kill=(ev:Event)=>{ ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click',kill,true) }
      window.addEventListener('click',kill,true); setTimeout(()=>window.removeEventListener('click',kill,true),350)
    }
    window.addEventListener('pointermove',move,{passive:false})
    window.addEventListener('pointerup',up)
    return ()=>{ window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up) }
  },[onMove])
  const onDown=(id:string,label:string)=>(e:React.PointerEvent)=>{ if(e.button&&e.button!==0)return; st.current={id,label,active:false,sx:e.clientX,sy:e.clientY} }
  return { onDown, ghost }
}

// ═══ Η ΓΕΩΜΕΤΡΙΑ ΤΟΥ ΔΙΑΔΡΟΜΟΥ ΚΡΑΤΗΣΕΩΝ, ΣΕ ΕΝΑ ΣΗΜΕΙΟ ══════════════════
// Τα ίδια νούμερα τα χρειάζονται δύο ανεξάρτητα σημεία: το κελί, που κρατά τον
// χώρο και η επικάλυψη, που τοποθετεί τη μπάρα. Αν αποκλίνουν έστω κατά ένα
// εικονοστοιχείο, η μπάρα κάθεται πάνω στο κείμενο ή αφήνει κενή λωρίδα.
const BAR_H = 18            // ύψος μπάρας
const BAR_GAP = 3           // απόσταση μεταξύ σειρών
const BAR_INSET = 3         // πόσο μαζεύει το κλειστό άκρο, ώστε δύο κρατήσεις να μην ακουμπούν
const MAX_LANES = 3         // πάνω από τρεις, η ημέρα γράφει «+N κρατήσεις»
const CELL_PAD = 6          // το padding του κελιού
const DAY_HEAD_H = 27       // ύψος της γραμμής με τον αριθμό της ημέρας (24 + 3 κενό)
// Η ΑΡΓΙΑ ΑΝΗΚΕΙ ΣΤΗΝ ΗΜΕΡΑ, Ο ΔΙΑΔΡΟΜΟΣ ΣΤΗΝ ΕΒΔΟΜΑΔΑ. Με τον διάδρομο από
// πάνω, το «Κοίμηση της Θεοτόκου» έπεφτε σαράντα εικονοστοιχεία κάτω από το 15
// και διαβαζόταν σαν να ανήκει σε άλλο πράγμα. Η αργία γράφεται τώρα ΠΡΙΝ τον
// διάδρομο και ο χώρος της κρατιέται σε ΟΛΑ τα κελιά της εβδομάδας που έχει
// έστω μία — αλλιώς οι μπάρες της εβδομάδας θα κάθονταν σε δύο ύψη.
const HOL_H = 16          // μία γραμμή αργίας
const HOL_H2 = 30         // δύο γραμμές, όταν το όνομα δεν χωράει σε μία

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΕΛΙ ΜΕ ΤΗΝ ΑΡΓΙΑ ΜΕΓΑΛΩΝΕ ΚΑΙ ΕΣΠΡΩΧΝΕ ΤΑ ΥΠΟΛΟΙΠΑ
// ─────────────────────────────────────────────────────────────────────────
// Το πλέγμα έγραφε `repeat(7, 1fr)`. Το `1fr` σημαίνει `minmax(auto, 1fr)`,
// και το `auto` ως ΕΛΑΧΙΣΤΟ είναι το min-content: με `white-space: nowrap`,
// ολόκληρο το κείμενο. Αρα η στήλη που είχε αργία φούσκωνε όσο χρειαζόταν το
// «Εθνική εορτή 25ης Μαρτίου» και έκλεβε πλάτος από τις άλλες έξι.
//
// Και επειδή κάθε εβδομάδα είναι ΔΙΚΟ ΤΗΣ πλέγμα, το φούσκωμα ήταν τοπικό:
// στον Μάρτιο 2027 η γραμμή με την Καθαρά Δευτέρα και η γραμμή με την 25η
// Μαρτίου είχαν διαφορετικά όρια στηλών από τις υπόλοιπες. Το ημερολόγιο
// έπαυε να είναι πλέγμα. Με `minmax(0, 1fr)` οι εφτά στήλες είναι ίσες πάντα.
//
// ΤΟ ΔΕΥΤΕΡΟ ΜΙΣΟ: με ίσες στήλες, το μακρύ όνομα κόβεται. Μετρημένο σε
// πραγματικό φυλλομετρητή, στήλη 79 εικονοστοιχείων έναντι κειμένου 138.
// Τυλίγεται πια σε δεύτερη γραμμή και ο χώρος κρατιέται σε ΟΛΑ τα κελιά της
// εβδομάδας ώστε ο διάδρομος των κρατήσεων να ξεκινά στο ίδιο ύψος.
//
// ΠΟΣΕΣ ΓΡΑΜΜΕΣ ΧΡΕΙΑΖΟΝΤΑΙ: μετριέται, δεν μαντεύεται. Ο καμβάς δίνει το
// ακριβές πλάτος του κειμένου στη γραμματοσειρά που θα αποδοθεί, οπότε η
// δεύτερη γραμμή κρατιέται μόνο όταν η πρώτη δεν φτάνει. Χωρίς μέτρηση θα
// έπρεπε είτε να κρατιέται πάντα (χαμένος χώρος σε κάθε αργία) είτε να
// μαντεύεται με χαρακτήρες (και να κόβεται όταν η εικασία πέσει έξω).
let holCanvas: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return 0
  if (!holCanvas) holCanvas = document.createElement('canvas').getContext('2d')
  if (!holCanvas) return 0
  holCanvas.font = font
  return holCanvas.measureText(text).width
}

function MonthView({ events, currentDate, selectedDate, onDayClick, onEventClick, upcomingAll, drag, stays=[] }: {
  events: CalEvent[]; currentDate: Date; selectedDate?:string; onDayClick:(date:string)=>void; onEventClick:(e:CalEvent)=>void; upcomingAll:CalEvent[]; drag?:DragCtl; stays?:StaySpan[]
}) {
  // Το πλάτος του πλέγματος, μετρημένο. Χρειάζεται για να κριθεί αν το όνομα
  // της αργίας χωράει σε μία γραμμή. Μηδέν στην πρώτη απόδοση και στον
  // διακομιστή: τότε κρατιέται μία γραμμή και η δεύτερη μπαίνει μόλις γίνει η
  // μέτρηση, χωρίς να κοπεί ποτέ κείμενο στο ενδιάμεσο.
  const gridRef=useRef<HTMLDivElement|null>(null)
  const [gridW,setGridW]=useState(0)
  useEffect(()=>{
    const el=gridRef.current; if(!el) return
    // Ο παρατηρητής πυροδοτεί ΜΙΑ φορά μόλις ξεκινήσει, οπότε δεν χρειάζεται
    // δεύτερη μέτρηση εδώ. Μια κλήση `setGridW` κατευθείαν μέσα στο effect θα
    // ήταν και περιττή και δεύτερη απόδοση.
    const ro=new ResizeObserver(([e])=>setGridW(e.contentRect.width))
    ro.observe(el)
    return ()=>ro.disconnect()
  },[])

  const year=currentDate.getFullYear(); const month=currentDate.getMonth()
  const firstDay=mondayFirst(new Date(year,month,1).getDay())
  const daysInMonth=new Date(year,month+1,0).getDate()
  const today=todayStr()
  const cells:(number|null)[] = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let i=1;i<=daysInMonth;i++) cells.push(i)
  while(cells.length%7!==0) cells.push(null)
  // Το πλέγμα δεν είναι πια σαράντα δύο αδερφά κελιά αλλά έξι γραμμές των επτά:
  // η μπάρα της κράτησης χρειάζεται ΓΡΑΜΜΗ για να τοποθετηθεί απόλυτα επάνω της.
  const weeks:(number|null)[][]=[]
  for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7))
  // Οι κρατήσεις φαίνονται ως ενιαία μπάρα διαμονής — κρύβουμε τα booking: chips
  // ώστε να μη διπλογράφονται.
  const eventsForDay=(day:number)=>{ const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; return events.filter(e=>e.event_date===ds&&!(e.source||'').startsWith('booking:')) }
  // Έπαιρνε τα ΕΠΤΑ ΠΡΩΤΑ εκκρεμή. Με δάνειο εικοσαετίας και τα επτά ήταν δόσεις
  // του ίδιου δανείου: η ράγα «Επόμενα» έγραφε επτά φορές «Δόση δανείου 751,00 €»
  // και δεν έδειχνε ΠΟΤΕ τίποτε άλλο — ούτε λήξη μίσθωσης, ούτε φορολογική
  // προθεσμία. Τώρα μαζεύεται πρώτα η σειρά και μετά κρατιούνται επτά ΘΕΣΕΙΣ.
  const upcomingRows=groupSeries(
    upcomingAll.filter(e=>e.status==='pending'&&daysUntil(e.event_date)>=0)
               .sort((a,b)=>a.event_date.localeCompare(b.event_date))
  ).slice(0,7)
  const monthPendingAmt=events.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const monthPaid=events.filter(e=>e.status==='paid')

  return (
    <div className="cal-layout" style={{ display:'flex', gap:12 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, padding:'8px 16px', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-elevated)' }}>
            {/* ═══ ΕΠΤΑ ΚΟΥΚΚΙΔΕΣ ΣΤΟ ΙΔΙΟ ΓΚΡΙ ══════════════════════════════
                Ο υπόμνημα κατηγοριών έπιανε όλη τη δεξιά πλευρά της γραμμής:
                επτά τετραγωνάκια δίπλα σε επτά λέξεις. ΚΑΙ ΤΑ ΕΠΤΑ έχουν
                `color: var(--text-secondary)` — το ίδιο ακριβώς γκρι. Ένα
                υπόμνημα του οποίου όλα τα δείγματα είναι ίδια δεν ξεχωρίζει
                τίποτα: είναι διακόσμηση με το σχήμα της πληροφορίας και
                μάλιστα η μεγαλύτερη σε έκταση στην οθόνη. Η κατηγορία λέγεται
                με λέξεις πάνω σε κάθε γεγονός, εκεί που χρειάζεται.

                Και «1 γεγονότα». Ο πληθυντικός ήταν σταθερός. */}
            {/* ΤΟ «0 ΓΕΓΟΝΟΤΑ» ΠΑΝΩ ΑΠΟ ΑΔΕΙΟ ΠΛΕΓΜΑ. Σε μήνα χωρίς τίποτα, η ίδια
                απουσία λεγόταν ΤΡΕΙΣ φορές: εδώ ως αριθμός, μετά με το κενό πλέγμα
                και από κάτω με ολόκληρη κενή κατάσταση. Ο ίδιος συλλογισμός που
                έβγαλε το «0 πληρωμένα» δίπλα του — η μέτρηση έχει νόημα όταν
                υπάρχει κάτι να μετρηθεί. */}
            {events.length>0&&<span style={{ fontSize:12, fontFamily: T.font.sans, color:'var(--text-secondary)', letterSpacing:'0.4px' }}>{events.length===1?'1 γεγονός':`${events.length} γεγονότα`}</span>}
            {monthPendingAmt>0&&<span title={`Άθροισμα των εκκρεμών ποσών ${MONTHS_GEN[month]} ${year}, μόνο αυτού του μήνα`} style={{ fontSize:12, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--accent)' }}>{fe(monthPendingAmt)} εκκρεμή</span>}
            {/* ΤΟ «0 ΠΛΗΡΩΜΕΝΑ» ΔΙΠΛΑ ΣΤΟ «0 ΓΕΓΟΝΟΤΑ» ΔΕΝ ΛΕΕΙ ΤΙΠΟΤΑ. Σε άδειο
                μήνα η γραμμή έγραφε δύο μηδενικά στη σειρά — δύο μετρήσεις για το
                ίδιο κενό. Ο αριθμός των πληρωμένων έχει νόημα μόνο όταν υπάρχει
                κάτι πληρωμένο· αλλιώς μιλά η κενή κατάσταση από κάτω. */}
            {monthPaid.length>0&&<span style={{ fontSize:12, fontFamily: T.font.sans, color:'var(--text-secondary)' }}>{monthPaid.length===1?'1 πληρωμένο':`${monthPaid.length} πληρωμένα`}</span>}
          </div>
          <div ref={gridRef} style={{ display:'grid', gridTemplateColumns:'repeat(7, minmax(0, 1fr))', borderBottom:'1px solid var(--border-subtle)' }}>
            {DAY_NAMES_GR.map(d=>(
              <div key={d} style={{ padding:'8px 0', textAlign:'center', fontSize:12, fontFamily: T.font.sans, fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>
          {weeks.map((week,wIdx)=>{
            const weekDates=week.map(day=>day?`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null)
            const { segments, lanes }=weekSegments(stays,weekDates)
            const weekHasHoliday=weekDates.some(d=>!!d&&!!holidayName(d))
            // Χωράει το μακρύτερο όνομα της εβδομάδας σε μία γραμμή; Το πλάτος
            // της στήλης είναι το πλάτος του πλέγματος διά εφτά, μείον το
            // εσωτερικό περιθώριο του κελιού από τις δύο πλευρές.
            const colInner=Math.max(0,(gridW/7)-CELL_PAD*2)
            const weekHolH=!weekHasHoliday?0:(weekDates.some(d=>{
              const n=d?holidayName(d):null
              return !!n && colInner>0 && textWidth(n,'600 10px '+T.font.sans)>colInner
            })?HOL_H2:HOL_H)
            const shownLanes=Math.min(lanes,MAX_LANES)
            const railH=shownLanes*(BAR_H+BAR_GAP)
            return (
            <div key={wIdx} style={{ position:'relative', display:'grid', gridTemplateColumns:'repeat(7, minmax(0, 1fr))' }}>
            {week.map((day,col)=>{
              const idx=wIdx*7+col
              const dateStr=day?`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`:''
              const dayEvents=day?eventsForDay(day):[]
              const isToday=dateStr===today
              const isSelected=!!day&&!!selectedDate&&dateStr===selectedDate
              const hasOverdue=dayEvents.some(isOverdue)
              const dayAmt=dayEvents.filter(e=>e.amount&&e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
              const hol=day?holidayName(dateStr):null
              const wknd=day?isWeekend(dateStr):false
              // ═══ ΤΟ «ΣΗΜΕΡΑ» ΛΕΓΟΤΑΝ ΔΥΟ ΦΟΡΕΣ ═════════════════════════════
              // Ολόκληρο το κελί έπαιρνε `--accent-dim` ΚΑΙ ο αριθμός έπαιρνε
              // κύκλο με το ίδιο ακριβώς χρώμα. Δύο σήματα για ένα γεγονός και
              // το ένα από αυτά είναι ένα γεμάτο ορθογώνιο ενενήντα επί εκατόν
              // σαράντα εικονοστοιχείων: σε γραμμή που δεν έχει τίποτα άλλο, το
              // κελί διαβάζεται ως κουτί που κάθεται πάνω στο πλέγμα και η
              // διπλανή ημέρα μοιάζει να ξεφεύγει από αυτό.
              //
              // Το σήμερα είναι ΜΙΑ ημέρα, όχι μια περιοχή. Το λέει ο αριθμός
              // της, με γεμάτο κύκλο — όπως σε κάθε ημερολόγιο που δουλεύει.
              // Η επιλεγμένη ημέρα κρατά το δαχτυλίδι της: είναι άλλο πράγμα
              // (τι κοιτάς) και πρέπει να ξεχωρίζει από το σήμερα (τι μέρα είναι).
              const cellBg=isSelected?'color-mix(in srgb, var(--accent) 12%, transparent)':hol?'color-mix(in srgb, var(--accent) 5%, transparent)':wknd?'color-mix(in srgb, var(--text-tertiary) 5%, transparent)':'transparent'
              return (
                <div key={idx} {...pressable(()=>day&&onDayClick(dateStr))} data-drop-date={day?dateStr:undefined} style={{ minHeight:80, padding:'6px', borderRight:(idx+1)%7===0?'none':'1px solid var(--border-subtle)', borderBottom:idx<cells.length-7?'1px solid var(--border-subtle)':'none', background:cellBg, boxShadow:isSelected&&!isToday?'inset 0 0 0 2px var(--accent)':'none', cursor:day?'pointer':'default', transition:'background 0.1s' }}
                  onMouseEnter={e=>{if(day)(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
                  onMouseLeave={e=>{if(day)(e.currentTarget as HTMLElement).style.background=cellBg}}
                >
                  {day!=null&&(
                    <>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                        <span aria-current={isToday?'date':undefined} style={{ fontSize:13, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', fontWeight:isToday||isSelected?700:400, color:isToday?'var(--accent-text)':isSelected?'var(--accent)':wknd||hol?'var(--text-tertiary)':'var(--text-secondary)', width:24, height:24, borderRadius:'50%', background:isToday?'var(--accent)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{day}</span>
                        {hasOverdue&&<span style={{ width:6, height:6, borderRadius:'50%', background:'var(--negative)' }}/>}
                      </div>
                      {/* Η αργία, κολλητά στην ημερομηνία της. Ο χώρος κρατιέται
                          και στα κελιά χωρίς αργία, ώστε ο διάδρομος από κάτω να
                          ξεκινά στο ίδιο ύψος σε όλη την εβδομάδα. */}
                      {weekHasHoliday&&(
                        <div title={hol||undefined} style={{ height:weekHolH, fontSize: 11, lineHeight:'14px', color:'var(--accent)', fontWeight:600, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', textWrap:'balance', wordBreak:'break-word', fontFamily: T.font.sans }}>{hol||''}</div>
                      )}
                      {/* Ο ΔΙΑΔΡΟΜΟΣ ΤΩΝ ΚΡΑΤΗΣΕΩΝ. Το κελί δεν ζωγραφίζει πια
                          κομμάτια μπάρας — κρατά μόνο το ύψος τους, ώστε ό,τι
                          έρχεται από κάτω να μη γράφεται επάνω τους. Οι μπάρες
                          ζωγραφίζονται ΜΙΑ φορά, πάνω από ολόκληρη την εβδομάδα. */}
                      {railH>0&&<div aria-hidden style={{ height:railH, marginBottom:3 }}/>}
                      {(()=>{ const extra=staysOnDay(stays,dateStr).length-shownLanes; return extra>0
                        ? <div style={{ fontSize: 11, color:'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom:2 }}>+{extra} {extra===1?'κράτηση':'κρατήσεις'}</div>
                        : null })()}
                      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        {dayEvents.slice(0,3).map(ev=>(
                          <Tooltip key={ev.id} text={`${ev.title}${ev.event_time?` · ${ev.event_time}`:''}${ev.amount?` · ${fe(ev.amount)}` :''}${ev._virtual?'\n(επαναλαμβανόμενο)':''}${ev.notes?`\n${ev.notes}`:''}`}>
                            <div onPointerDown={!ev._virtual&&drag?drag.onDown(ev.id,ev.title):undefined} role="button" tabIndex={0} aria-label={`Άνοιγμα: ${ev.title}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onEventClick(ev)}}} onClick={e=>{e.stopPropagation();onEventClick(ev)}} style={{ touchAction:'none', fontSize:11, padding:'1px 5px', borderRadius:6, background:CATEGORIES[ev.category].bg, color:CATEGORIES[ev.category].color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:ev._virtual?'pointer':'grab', width:'100%', opacity:ev.status==='paid'?0.4:ev._virtual?0.72:1, textDecoration:ev.status==='paid'?'line-through':'none', fontFamily: T.font.sans, letterSpacing:'0.25px' }}>
                              {(ev.recurring||ev._virtual)&&<RotateCcw size={9} style={{ marginRight:3, verticalAlign:'middle', opacity:0.7 }}/>}{ev.event_time?ev.event_time+' ':''}{ev.title}
                            </div>
                          </Tooltip>
                        ))}
                        {dayEvents.length>3&&<span style={{ fontSize: 11, color:'var(--text-tertiary)', paddingLeft:3, fontFamily: T.font.sans }}>+{dayEvents.length-3} ακόμη</span>}
                      </div>
                      {/* ══ ΤΟ ΠΟΣΟ ΤΗΣ ΗΜΕΡΑΣ ΓΡΑΦΟΤΑΝ ΠΑΝΩ ΣΤΗΝ ΕΠΟΜΕΝΗ ══
                          Μετρημένο σε 360: το κελί δίνει 36,28 εικονοστοιχεία
                          ωφέλιμα και το «751,00 €» θέλει 44,47 — κάθε ενοίκιο,
                          δόση, λογαριασμός και ΕΝΦΙΑ έβγαινε από το κελί του.
                          Οταν είχαν ποσό δύο διαδοχικές ημέρες, τα ψηφία
                          επικαλύπτονταν και τα δύο ποσά διαβάζονταν ως ένας
                          ανύπαρκτος αριθμός· την Κυριακή το ποσό ψαλιδιζόταν
                          από το overflow της κάρτας χωρίς κανένα σημάδι.

                          Ιδιο ιδίωμα με το κελί του ημερολογίου τιμών: ακέραια
                          ευρώ εδώ, πλήρες ποσό στην ημέρα που ανοίγει με το
                          πάτημα. Το μέγεθος βγαίνει από το μήκος και το
                          δοχείο κόβει ως έσχατο δίχτυ ώστε τίποτα να μη
                          μπορεί ποτέ να πέσει στο διπλανό κελί. */}
                      {dayAmt>0&&(()=>{
                        const txt=fn(dayAmt)
                        const [fs,es]=txt.length<=3?[10,8]:txt.length<=5?[9,7]:[8,7]
                        return (
                          <div style={{ marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            <span style={{ fontSize:fs, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--accent)', opacity:0.8 }}>
                              {txt}<span style={{ fontSize:es, marginLeft:1.5, opacity:0.7 }}>€</span>
                            </span>
                          </div>
                        )
                      })()}
                    </>
                  )}
                </div>
              )
            })}
            {/* ═══ ΟΙ ΜΠΑΡΕΣ, ΠΑΝΩ ΑΠΟ ΤΑ ΚΕΛΙΑ ═══════════════════════════
                Μία ανά κράτηση και ανά εβδομάδα, με το όνομα γραμμένο μία φορά
                μέσα σε ΟΛΟ το πλάτος της. Το `pointerEvents:'none'` στο στρώμα
                αφήνει το κλικ να περάσει στο κελί από κάτω· η ίδια η μπάρα το
                ξαναπιάνει, ώστε το tooltip να δουλεύει και το κλικ επάνω της να
                μην αλλάζει ημέρα. */}
            {shownLanes>0&&(
              <div aria-hidden={false} style={{ position:'absolute', left:0, right:0, top:CELL_PAD+DAY_HEAD_H+weekHolH, height:railH, pointerEvents:'none' }}>
                {segments.filter(g=>g.lane<MAX_LANES).map(g=>{
                  const cc=channelColor(g.stay.channel)
                  const L=g.openLeft?0:BAR_INSET, R=g.openRight?0:BAR_INSET
                  return (
                    <div key={g.stay.id} style={{ position:'absolute', top:g.lane*(BAR_H+BAR_GAP), left:`calc(${(g.startCol/7)*100}% + ${L}px)`, width:`calc(${(g.span/7)*100}% - ${L+R}px)`, height:BAR_H, pointerEvents:'auto' }}>
                      {/* ΤΟ ΑΓΝΩΣΤΟ ΓΡΑΦΕΤΑΙ ΩΣ ΑΓΝΩΣΤΟ. Οταν λείπει η αναχώρηση, το
                          `end` της μπάρας είναι γέμισμα και το «έως» θα έδειχνε την
                          ημέρα άφιξης· μαζί με το παλιό ταβάνι, η υπόδειξη έλεγε
                          «1 Αυγ έως 1 Αυγ · 1 νύχτα» για κράτηση που δεν ξέρουμε
                          πόσο κράτησε. Τώρα λέει τι λείπει και ποιος το συμπληρώνει. */}
                      <Tooltip fill text={g.nights === null
                        ? `${g.stay.guest} · ${cc.label}\nΑφιξη ${g.stay.start} · χωρίς καταχωρημένη αναχώρηση${g.stay.total?`\n${fe(g.stay.total)}`:''}`
                        : `${g.stay.guest} · ${cc.label}\n${g.stay.start} έως ${g.stay.end} · ${g.nights} ${g.nights===1?'νύχτα':'νύχτες'}${g.stay.total?`\n${fe(g.stay.total)}`:''}`}>
                        <div onClick={e=>e.stopPropagation()} style={{ width:'100%', height:BAR_H, boxSizing:'border-box', display:'flex', alignItems:'center', gap:4, padding:`0 ${g.openRight?4:8}px 0 ${g.openLeft?4:9}px`, background:cc.solid, color:'var(--on-tone)', fontSize:11, fontWeight:600, fontFamily: T.font.sans, letterSpacing:'0.1px', borderTopLeftRadius:g.openLeft?2:BAR_H/2, borderBottomLeftRadius:g.openLeft?2:BAR_H/2, borderTopRightRadius:g.openRight?2:BAR_H/2, borderBottomRightRadius:g.openRight?2:BAR_H/2, overflow:'hidden', whiteSpace:'nowrap', cursor:'default' }}>
                          {!g.openLeft&&<User size={10} style={{ flexShrink:0, opacity:0.9 }}/>}
                          <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis' }}>{g.stay.guest}{!g.openLeft&&g.nights!==null&&g.nights>1?` · ${g.nights} ν.`:''}</span>
                        </div>
                      </Tooltip>
                    </div>
                  )
                })}
              </div>
            )}
            </div>
            )
          })}
        </div>
      </div>
      <div className="cal-rail" style={{ width:200, flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
        {/* Εδώ ζούσε ΤΡΙΤΗ εκδοχή του ίδιου υπομνήματος: κάρτα με τον μήνα
            ως τίτλο και μία σειρά ανά κατηγορία με το πλήθος της. Με ένα
            γεγονός στον μήνα, έγραφε «Αύγουστος / Οικονομικά 1» — δηλαδή
            κατέλαβε μια ολόκληρη κάρτα για να πει «ένα», τη στιγμή που η
            γραμμή σύνοψης το έλεγε ήδη και το ίδιο το γεγονός φαινόταν από
            κάτω. */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12, boxShadow:'var(--shadow-sm)' }}>
          <p style={{ fontSize:12, fontFamily: T.font.sans, fontWeight:500, color:'var(--accent)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>Επόμενα</p>
          {upcomingRows.length===0&&<p style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>Καμία εκκρεμότητα</p>}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {upcomingRows.map(row=>{
              const ev=row.kind==='series'?row.lead:row.event
              const d=daysUntil(ev.event_date); const cat=CATEGORIES[ev.category]
              const when=d===0?'Σήμερα':d===1?'Αύριο':`σε ${d} ημέρες`
              const soon=d<=1
              const more=row.kind==='series'?row.count-1:0
              return (
                <div key={row.kind==='series'?row.key:ev.id} title={`${ev.title}${ev.event_time?`, ${ev.event_time}`:''} ${when}`} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                  <div style={{ width:3, borderRadius:3, background:cat.color, alignSelf:'stretch', flexShrink:0, minHeight:30, opacity:0.85 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontFamily: T.font.sans, color:'var(--text-primary)', lineHeight:1.35, marginBottom:3, letterSpacing:'0.1px' }}>{ev.title}</p>
                    <div style={{ display:'flex', gap:8, alignItems:'baseline', flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, fontFamily: T.font.sans, fontWeight:soon?600:400, color:soon?'var(--text-primary)':'var(--text-tertiary)' }}>{when}</span>
                      {ev.amount!=null&&<span style={{ fontSize:12, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)' }}>{fe(ev.amount)}</span>}
                    </div>
                    {more>0&&<p style={{ fontSize:11, fontFamily: T.font.sans, color:'var(--text-tertiary)', margin:'3px 0 0' }}>{row.kind==='series'&&row.cadence?`${row.cadence}, ` : ''}{more===1?'1 ακόμη':`${more} ακόμη`}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Έξυπνος συγχρονισμός: αναγνωρίζει τον τύπο μίσθωσης του ακινήτου και τραβά ΜΟΝΟ
// ό,τι έχει νόημα — μακροχρόνια → ενοίκιο & λήξεις μίσθωσης· βραχυχρόνια → κρατήσεις
// με το όνομα του επισκέπτη. Δείχνει ζωντανά πλήθη ανά πηγή πριν τραβήξει.
type SyncKey='bills'|'maintenance'|'leases'|'bookings'|'tax'|'loans'
function AutoPullPanel({ propertyId, userId, onRefresh, onClose }: { propertyId:string; userId:string; onRefresh:()=>void; onClose?:()=>void }) {
  const supabase=createClient()
  const scope=useMemo(()=>({propertyId,userId}),[propertyId,userId])
  const [busy,setBusy]=useState<SyncKey|null>(null)
  const [mode,setMode]=useState<'long_term'|'short_term'|null>(null)
  const [counts,setCounts]=useState<Record<SyncKey,number>|null>(null)
  const [done,setDone]=useState<Record<string,{n:number;at:string}>>({})
  const [lastSync,setLastSync]=useState<string|null>(null)
  // Το φορολογικό προφίλ βγαίνει από την ΜΙΑ κατάσταση του ακινήτου (taxProfileOf),
  // τον ίδιο κανόνα που χρησιμοποιεί και η Επισκόπηση.
  const taxProfile=(mode==='short_term'?'short_term':mode==='long_term'?'long_term':'owner')

  // Ο τύπος του ερωτήματος καταμέτρησης δεν γράφεται με το χέρι — τον δίνει το ίδιο
  // το Supabase. Με `(q:any)=>any` το `extra` μπορούσε να καλέσει οτιδήποτε πάνω στο
  // ερώτημα (ακόμη και μέθοδο που δεν υπάρχει) ή να επιστρέψει κάτι που δεν είναι
  // καν ερώτημα και το `await q` παρακάτω θα έσκαγε μόνο στον browser.
  const countQuery=(table:string)=>supabase.from(table).select('*',{count:'exact',head:true}).eq('property_id',propertyId)
  type CountQuery=ReturnType<typeof countQuery>
  const cnt=async(table:string,extra?:(q:CountQuery)=>CountQuery)=>{ let q=countQuery(table); if(extra)q=extra(q); const{count}=await q; return count||0 }
  useEffect(()=>{
    (async()=>{
      const[prop,bills,maintenance,leases,bookings,loans]=await Promise.all([
        properties.one<{ status_detail: string | null; rental_mode: string | null }>(supabase, propertyId, 'status_detail,rental_mode', userId),
        cnt('bills'), cnt('maintenance_tasks'),
        cnt('tenants',q=>q.neq('status','past')), cnt('client_stays'), cnt('loans'),
      ])
      const prof=taxProfileOf(prop)
      const m=prof==='short_term'?'short_term':prof==='long_term'?'long_term':null
      const tax=taxObligationsHorizon(todayStr(),prof).length
      setMode(m); setCounts({bills,maintenance,leases,bookings,tax,loans})
      try{ const ls=localStorage.getItem(`cal_sync_${propertyId}`); if(ls)setLastSync(ls) }catch{}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[propertyId])

  // Ποιες πηγές δείχνουμε: ανά τύπο μίσθωσης (η «διαφορά» του AI — σωστά φίλτρα).
  // Τα Φορολογικά αφορούν ΚΑΘΕ ιδιοκτήτη, οπότε εμφανίζονται πάντα.
  const visible:SyncKey[]=useMemo(()=>{
    if(mode==='short_term')return['bookings','tax','loans','bills','maintenance']
    if(mode==='long_term')return['leases','tax','loans','bills','maintenance']
    return['leases','bookings','tax','loans','bills','maintenance']
  },[mode])

  // ══ ΤΟ «ΤΙΠΟΤΑ ΑΚΟΜΗ» ΔΙΑΒΑΖΟΤΑΝ ΩΣ ΒΛΑΒΗ ══════════════════════════════════
  // Τρία πλακίδια θαμπά, με την ίδια τρίλεξη φράση κάτω από τρεις διαφορετικές
  // ετικέτες: ο χρήστης δεν μπορούσε να ξεχωρίσει «ο συγχρονισμός χάλασε» από
  // «δεν υπάρχει τίποτα να τραβηχτεί». Και τα δύο δείχνουν ίδια, μόνο που το
  // πρώτο θέλει διόρθωση και το δεύτερο δεν θέλει τίποτα.
  //
  // Κάθε πηγή λέει τώρα ΤΙ ΤΗΣ ΛΕΙΠΕΙ, με το όνομα του πράγματος. «Δεν έχεις
  // καταχωρήσει δάνειο» δεν είναι σφάλμα, είναι κατάσταση και ο χρήστης ξέρει
  // αμέσως ότι η αιτία είναι στα δικά του δεδομένα και όχι στη σύνδεση.
  const META:Record<SyncKey,{label:string;icon:React.ReactNode;unit:(n:number)=>string;empty:string}>={
    leases:     {label:'Ενοίκιο και μισθώσεις', icon:<Euro size={15}/>,     unit:n=>n===1?'1 ενοικιαστής':`${n} ενοικιαστές`, empty:'Κανένας ενοικιαστής ακόμη'},
    bookings:   {label:'Κρατήσεις',            icon:<User size={15}/>,     unit:n=>n===1?'1 κράτηση':`${n} κρατήσεις`,       empty:'Καμία κράτηση ακόμη'},
    tax:        {label:'Φορολογικά (ΑΑΔΕ)',    icon:<FileText size={15}/>, unit:n=>n===1?'1 προθεσμία':`${n} προθεσμίες`,    empty:'Καμία προθεσμία στο επόμενο διάστημα'},
    loans:      {label:'Δόσεις δανείου',        icon:<TrendingUp size={15}/>,unit:n=>n===1?'1 δάνειο':`${n} δάνεια`,          empty:'Δεν έχεις καταχωρήσει δάνειο'},
    bills:      {label:'Λογαριασμοί',          icon:<Zap size={15}/>,      unit:n=>n===1?'1 λογαριασμός':`${n} λογαριασμοί`, empty:'Δεν έχεις καταχωρήσει λογαριασμό'},
    maintenance:{label:'Συντήρηση',            icon:<Wrench size={15}/>,   unit:n=>n===1?'1 εργασία':`${n} εργασίες`,        empty:'Καμία εργασία συντήρησης'},
  }

  // Συγχρονισμός ΜΙΑΣ πηγής — το ίδιο το κουτάκι είναι το κουμπί. Χωρίς on/off,
  // χωρίς ξεχωριστό «Συγχρονισμός τώρα»: πατάς π.χ. «Φορολογικά (ΑΑΔΕ)» και
  // τραβιούνται ΟΛΕΣ οι καταληκτικές αλλά και οι πρώτες ημερομηνίες.
  async function syncOne(k:SyncKey):Promise<number> {
    // ── Λογαριασμοί ──
    if(k==='bills'){
      const bills=await billStore.ofProperty(supabase,propertyId,'*',userId)
      const todayIso=athensToday()
      // ΔΥΟ ΝΕΚΡΑ ΕΝΑΛΛΑΚΤΙΚΑ ΠΕΔΙΑ. Το `next_due_date` δεν υπάρχει σε κανέναν
      // από τους πίνακες και το `provider` υπάρχει μόνο στα τιμολόγια ρεύματος.
      // Το `(b:any)` τα έκρυβε από τον μεταγλωττιστή, όπως το `as any` στα δάνεια.
      // Αποτέλεσμα: λογαριασμός χωρίς όνομα γινόταν γεγονός με τίτλο
      // «Λογαριασμός» — πέντε πανομοιότυπες γραμμές στο ημερολόγιο, χωρίς να
      // ξεχωρίζει ποια είναι το ρεύμα και ποια το νερό. Ο τύπος του λογαριασμού
      // υπάρχει και είναι ήδη ο τίτλος του στην Επισκόπηση.
      // ── Η ΠΡΟΘΕΣΜΙΑ ΓΡΑΦΟΤΑΝ ΜΙΑ ΜΕΡΑ ΝΩΡΙΤΕΡΑ, ΣΤΟ 27% ΤΩΝ ΠΕΡΙΠΤΩΣΕΩΝ ──
      // Η παλιά γραμμή έφτιαχνε `new Date('2026-03-10')` — μεσάνυχτα UTC — και
      // μετά την πείραζε με ΤΟΠΙΚΟΥΣ setters (`setMonth`, `setFullYear`) για να
      // τη φέρει στον τρέχοντα μήνα και τη διάβαζε πίσω με `toISOString()`,
      // δηλαδή ξανά σε UTC. Όταν η αφετηρία είναι χειμερινή ώρα (UTC+2) και ο
      // προορισμός θερινή (UTC+3), χάνεται μία ώρα πάνω από τα μεσάνυχτα και
      // πέφτει μία μέρα. Μετρημένο σε 222 μετακινήσεις: 60 έπεφταν λάθος.
      //
      // Χειρότερα, το αποτέλεσμα ΓΡΑΦΕΤΑΙ στη βάση: κάθε επαναλαμβανόμενος
      // λογαριασμός καθόταν στο ημερολόγιο μια μέρα πριν από την πραγματική του
      // προθεσμία, σιωπηλά.
      //
      // Η αριθμητική γίνεται τώρα σε ημερολογιακούς μήνες πάνω σε κείμενο, με
      // την `addMonths` που ήδη προστατεύει και από την υπερχείλιση (31 Ιανουαρίου
      // συν έναν μήνα δεν είναι 31 Φεβρουαρίου). Καμία ζώνη ώρας δεν συμμετέχει.
      const rows=((bills||[]) as BillsRow[]).filter(b=>b.due_date).map(b=>{
        let dueDate=b.due_date
        if(dueDate<todayIso){
          const monthsApart=(Number(todayIso.slice(0,4))-Number(dueDate.slice(0,4)))*12
            +(Number(todayIso.slice(5,7))-Number(dueDate.slice(5,7)))
          const moved=addMonths(dueDate,monthsApart)??dueDate
          dueDate=moved<todayIso?(addMonths(moved,1)??moved):moved
        }
        return{title:b.name||b.type||'Λογαριασμός',category:'bills' as EventCategory,event_date:dueDate,amount:b.amount||null,status:(b.paid?'paid':'pending') as EventStatus,recurring:true,recurring_interval:'monthly',notes:b.category?`Κατηγορία: ${b.category}`:null}
      })
      await must(calendar.replaceSource(supabase,scope,{source:'bills'},rows))
      // ΤΟ ΣΚΑΝΑΡΙΣΜΕΝΟ ΔΙΑΓΡΑΦΕΤΑΙ ΜΕΤΑ, ΚΑΙ ΜΟΝΟ ΑΝ ΠΕΤΥΧΕ Η ΕΓΓΡΑΦΗ.
      //
      // Αυτή η γραμμή ήταν πριν από την εισαγωγή. Τα υπόλοιπα γεγονότα εδώ είναι
      // ΠΑΡΑΓΩΓΑ — ξαναφτιάχνονται από τον πίνακα λογαριασμών σε κάθε συγχρονισμό,
      // οπότε μια αποτυχία απλώς απαιτεί δεύτερο πάτημα. Οι υπενθυμίσεις από
      // ΣΑΡΩΣΗ όμως δεν παράγονται από πουθενά: αν σβήνονταν πρώτες και η
      // εισαγωγή αποτύγχανε, χάνονταν οριστικά, χωρίς μήνυμα.
      await must(calendar.clearSource(supabase,scope,{source:'scan',category:'bills'}))
      return rows.length
    }
    // ── Συντήρηση ──
    if(k==='maintenance'){
      // ΤΟ ΕΡΩΤΗΜΑ ΚΑΙ Η ΜΕΤΑΤΡΟΠΗ ΗΤΑΝ ΣΤΗΝ ΙΔΙΑ ΓΡΑΜΜΗ ΤΩΝ 200 ΧΑΡΑΚΤΗΡΩΝ.
      // Ο φύλακας σχήματος διάβαζε το κλειδί `status:` του αντικειμένου ως
      // φίλτρο πάνω στον πίνακα `maintenance_tasks` — που δεν έχει τέτοια στήλη —
      // και κοκκίνιζε το CI για ερώτημα που είναι σωστό. Δεν χαλαρώνει ο
      // φύλακας: χωρίζεται η γραμμή, γιατί το ερώτημα και η μετατροπή του είναι
      // δύο πράγματα και έτσι διαβάζονται και από άνθρωπο.
      const tasks: MaintenanceTasksRow[] =
        await must(supabase.from('maintenance_tasks').select('*').eq('property_id', propertyId)) ?? []
      const rows = tasks.filter(t => t.due_date).map(t => ({
        title: t.title || 'Εργασία συντήρησης',
        category: 'maintenance' as EventCategory,
        event_date: t.due_date,
        priority: (t.priority || 'medium') as EventPriority,
        status: (t.completed ? 'paid' : 'pending') as EventStatus,
        notes: t.description || null,
      }))
      await must(calendar.replaceSource(supabase,scope,{sources:['loan','maintenance']},rows))
      return rows.length
    }
    // ── Ενοίκιο & μισθώσεις (πραγματικά δεδομένα ενοικιαστή, idempotent) ──
    if(k==='leases'){
      // Το παλιό φίλτρο κοίταζε μόνο αν η κατάσταση του μισθωτή ήταν
      // «παρελθοντική» και άφηνε μέσα όποιον είχε ημερομηνία αποχώρησης χωρίς
      // αλλαγή κατάστασης — δηλαδή δημιουργούσε δόσεις ενοικίου για μισθωτή που
      // έχει ήδη φύγει. Ο κανόνας ζει πλέον σε ένα σημείο, στο tenantStore.
      //
      // Η ΠΕΡΙΓΡΑΦΗ ΕΙΝΑΙ ΣΕ ΛΕΞΕΙΣ ΚΑΙ ΟΧΙ ΣΕ ΚΩΔΙΚΑ, ΣΚΟΠΙΜΑ. Το σχόλιο
      // παρέθετε την παλιά κλήση αυτούσια και ο φύλακας σχήματος τη διάβαζε ως
      // ζωντανό φίλτρο πάνω στο προηγούμενο ερώτημα της ίδιας αλυσίδας: το CI
      // κοκκίνιζε για στήλη που κανείς δεν ζητούσε. Κώδικας μέσα σε σχόλιο δεν
      // εκτελείται, αλλά διαβάζεται από τα εργαλεία.
      const tenants=await tenantStore.currentAll<TenantScheduleRow>(supabase,propertyId,'*',userId)
      let n=0
      for(const t of ((tenants||[]) as TenantScheduleRow[])){
        await syncTenantSchedule(supabase,t,propertyId,userId,'save',{rentDueDay:t.rent_due_day??1})
        if(t.monthly_rent)n++
      }
      return n
    }
    // ── Κρατήσεις (με όνομα επισκέπτη) ──
    if(k==='bookings'){
      const stays=await stayStore.withClientName(supabase,propertyId,'id,check_in,check_out,total,nights,guests,channel',userId)
      // Κράτηση χωρίς ημερομηνία άφιξης δεν γίνεται γεγονός: δεν υπάρχει μέρα να μπει.
      const rows=buildBookingEvents(((stays||[]) as StayWithGuest[]).filter((s):s is StayWithGuest&{check_in:string}=>!!s.check_in).map(s=>({id:s.id,check_in:s.check_in,check_out:s.check_out,total:s.total,nights:s.nights,guests:s.guests,channel:s.channel,guest_name:s.clients?.full_name??null})))
      await must(calendar.replaceSource(supabase,scope,{prefix:'booking:'},rows))
      return rows.length
    }
    // ── Φορολογικά (ΑΑΔΕ): πραγματικές, θεσμοθετημένες προθεσμίες ──
    // Ο ορίζοντας και οι ημερομηνίες ορίζονται ΜΟΝΟ στο greekTaxCalendar. Το κλειδί
    // `tax:<id>` είναι το ίδιο που γράφει και η κάρτα «Υποχρεώσεις & Προθεσμίες»
    // της Επισκόπησης, άρα το δεύτερο πάτημα αντικαθιστά — δεν διπλογράφει.
    if(k==='tax'){
      const obs=taxObligationsHorizon(todayStr(),taxProfile)
      const rows=obs.map(o=>taxObligationToEvent(o))
      await must(calendar.replaceSource(supabase,scope,{prefix:'tax:'},rows))
      return rows.length
    }
    // ── Δόσεις δανείου: ίδιο source με το κουμπί των Δανείων → idempotent, χωρίς διπλά ──
    if(k==='loans'){
      // ΤΟ ΠΟΣΟ ΤΟΥ ΔΑΝΕΙΟΥ ΔΕΝ ΛΕΓΕΤΑΙ `amount`, ΚΑΙ ΤΟ ΕΠΙΤΟΚΙΟ ΔΕΝ ΕΙΝΑΙ ΣΤΗΛΗ.
      // Εδώ διαβαζόταν `(l as any).amount` και `(l as any).rate`. Η στήλη λέγεται
      // `loan_amount` και το επιτόκιο προκύπτει από `fixed_rate` ή από
      // `euribor + spread` ανάλογα με τον τύπο. Δηλαδή και τα δύο έβγαιναν
      // undefined, το `Number(undefined)||0` τα έκανε μηδέν και το `if(!amount)`
      // παρακάτω πετούσε ΚΑΘΕ δάνειο: ο συγχρονισμός δόσεων απαντούσε πάντα
      // «μηδέν» και κανείς δεν καταλάβαινε γιατί το ημερολόγιο έμενε άδειο.
      //
      // Η μετατροπή και το φίλτρο του «ενεργού» ζουν πλέον στο στρώμα: εδώ
      // ζητούνται ΜΟΝΟ τα ενεργά δάνεια του χρήστη και η αποτυχία πετάει.
      const loans=await loanStore.ofProperty(supabase,propertyId,userId,{activeOnly:true,strict:true})
      let n=0
      for(const l of loans){
        const amount=l.amount, rate=l.rate, years=Number(l.years)||0
        const start=l.start_date||todayStr(); const bank=cleanBank(l.bank)
        if(!amount||!years)continue
        const monthly=annuityMonthly(amount,rate,years); if(!monthly)continue
        const src='loan_schedule:'+(bank||'γενικό').toLowerCase().replace(/\s+/g,'_').slice(0,40)
        const d=new Date(start); const cnt2=Math.min(years*12,60); const rows:calendar.EventDraft[]=[]
                // ΤΟ ΠΟΣΟ ΚΡΑΤΑΕΙ ΤΑ ΛΕΠΤΑ ΤΟΥ. Ήταν `Math.round(monthly)`: μια δόση
        // 751,43 € αποθηκευόταν ως 751 και το ημερολόγιο διαφωνούσε με την
        // τράπεζα κατά 43 λεπτά τον μήνα, δηλαδή πάνω από πέντε ευρώ τον χρόνο.
        const monthlyExact=Math.round(monthly*100)/100
        // Τοπικά μεσάνυχτα σε UTC = χθες: οι δόσεις έμπαιναν μία μέρα νωρίτερα.
        for(let i=0;i<cnt2;i++){ const ev=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate()); rows.push({title:loanEventTitle(bank),category:'financial',event_date:isoDate(ev),amount:monthlyExact,priority:'high',notes:`${fe(monthlyExact)} ανά μήνα`}) }
        await must(calendar.replaceSource(supabase,scope,{source:src},rows))
        n+=rows.length
      }
      return n
    }
    return 0
  }

  async function runOne(k:SyncKey) {
    if(busy) return
    setBusy(k)
    // Η ΑΠΟΤΥΧΙΑ ΔΕΝ ΓΡΑΦΕΤΑΙ ΩΣ ΕΠΙΤΥΧΙΑ.
    //
    // Εδώ υπήρχε `try { n = await syncOne(k) } finally { … }` — χωρίς catch. Το
    // `finally` έτρεχε ούτως ή άλλως και έγραφε σφραγίδα «συγχρονίστηκε τώρα» με
    // n=0. Ο χρήστης διάβαζε «0» και καταλάβαινε «δεν υπήρχε τίποτα να τραβήξω»,
    // ενώ η αλήθεια ήταν «απέτυχε». Η σφραγίδα κρατιόταν και στο localStorage,
    // οπότε το ψέμα επιβίωνε και μετά την ανανέωση της σελίδας.
    let n=0, failed=false
    try{ n=await syncOne(k) }
    catch{
      failed=true
      notifyError('Ο συγχρονισμός δεν ολοκληρώθηκε. Δοκίμασε ξανά· τα στοιχεία ξαναχτίζονται από την πηγή τους.')
    }
    finally{
      if(!failed){
        const stamp=new Date().toLocaleString('el-GR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
        setDone(d=>({...d,[k]:{n,at:stamp}}))
        setLastSync(stamp); try{ localStorage.setItem(`cal_sync_${propertyId}`,stamp) }catch{}
      }
      setBusy(null); onRefresh()
    }
  }

  const modeHint=mode==='short_term'?'Βραχυχρόνια μίσθωση, τραβάω τις κρατήσεις με το όνομα του επισκέπτη.'
    :mode==='long_term'?'Μακροχρόνια μίσθωση, τραβάω την είσπραξη ενοικίου και τις λήξεις.'
    :'Τραβάω αυτόματα ό,τι αφορά αυτό το ακίνητο.'

  const hasTax=(counts?.tax||0)>0
  return (
    <div style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius: T.radius.modal, padding:'20px 22px', boxShadow:'var(--highlight-inset), var(--elev-3)', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:24, right:24, height:1, background:'linear-gradient(90deg, transparent, var(--accent-border), transparent)', opacity:0.7 }}/>
      {onClose&&<CloseButton onClose={onClose} style={{ position:'absolute', top:14, right:14, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', zIndex:2 }} />}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:16, paddingRight:38 }}>
        <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg, var(--accent), var(--accent-hover))', color:'var(--accent-text)', boxShadow:'0 6px 16px -6px var(--accent)' }}><RefreshCw size={17}/></span>
        <div style={{ minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <p style={{ fontSize:16, fontFamily: T.font.sans, fontWeight:700, color:'var(--text-primary)', letterSpacing:'0.1px' }}>Έξυπνος συγχρονισμός</p>
            {mode&&<span style={{ fontSize: 11, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--accent)', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius: T.radius.modal, padding:'2px 9px', fontFamily: T.font.sans }}>{mode==='short_term'?'Βραχυχρόνια':'Μακροχρόνια'}</span>}
          </div>
          <p style={{ fontSize:13, color:'var(--text-secondary)', fontFamily: T.font.sans, marginTop:4, lineHeight:1.45 }}>{modeHint} Πάτησε μια πηγή για να την τραβήξεις.</p>
          {lastSync&&<p style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans, marginTop:4 }}>Τελευταίος συγχρονισμός: {lastSync}</p>}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap:10 }}>
        {visible.map(k=>{
          const c=counts?.[k]; const has=(c||0)>0; const meta=META[k]
          const isBusy=busy===k; const d=done[k]; const disabled=!has||(busy!==null&&!isBusy)
          return (
            <button key={k} onClick={()=>has&&runOne(k)} disabled={disabled} style={{ display:'flex', alignItems:'center', gap:11, padding:'13px 15px', background:isBusy?'color-mix(in srgb, var(--accent) 9%, var(--bg-surface))':'var(--bg-surface)', border:`1px solid ${isBusy?'var(--accent-border)':'var(--border-subtle)'}`, borderRadius:12, cursor:has&&!disabled?'pointer':'default', opacity:has?(disabled&&!isBusy?0.6:1):0.5, textAlign:'left', boxShadow:isBusy?'0 6px 18px -12px var(--accent)':'var(--elev-1)', transition:'transform 0.14s, box-shadow 0.14s, border-color 0.14s, background 0.14s' }} onMouseEnter={e=>{if(has&&!disabled){e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='var(--elev-2)';e.currentTarget.style.borderColor='var(--accent-border)'}}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow=isBusy?'0 6px 18px -12px var(--accent)':'var(--elev-1)';e.currentTarget.style.borderColor=isBusy?'var(--accent-border)':'var(--border-subtle)'}}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:10, flexShrink:0, background:isBusy?'linear-gradient(135deg, var(--accent), var(--accent-hover))':'var(--bg-elevated)', color:isBusy?'var(--accent-text)':'var(--text-tertiary)', border:isBusy?'none':'1px solid var(--border-subtle)', boxShadow:isBusy?'0 4px 12px -6px var(--accent)':'none' }}>{isBusy?<RefreshCw size={16} style={{ animation:'spin 1s linear infinite' }}/>:meta.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontFamily: T.font.sans, fontWeight:600, color:isBusy?'var(--accent)':'var(--text-primary)' }}>{meta.label}</p>
                <p style={{ fontSize:12, color:d?'var(--positive)':'var(--text-tertiary)', fontFamily: T.font.sans, marginTop:1 }}>{isBusy?'Συγχρονισμός…':d?`Ενημερώθηκε · ${d.n}`:counts===null?'…':has?meta.unit(c!):meta.empty}</p>
              </div>
              {has&&!isBusy&&(d?<Check size={17} style={{ color:'var(--positive)', flexShrink:0 }}/>:<RefreshCw size={15} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>)}
            </button>
          )
        })}
      </div>
      {/* ΜΙΑ ΓΡΑΜΜΗ ΠΟΥ ΑΠΑΝΤΑ ΣΤΗΝ ΕΡΩΤΗΣΗ ΠΡΙΝ ΓΙΝΕΙ. Το θαμπό πλακίδιο είναι
          σύμβαση διεπαφής («δεν πατιέται»), όχι εξήγηση. Χωρίς αυτήν τη γραμμή ο
          χρήστης βλέπει τρία σβηστά κουτιά και συμπεραίνει ότι κάτι έσπασε. */}
      {counts!==null&&visible.some(k=>(counts[k]||0)===0)&&(
        <p style={{ marginTop:12, fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight:1.5 }}>
          Οι θαμπές πηγές δεν έχουν ακόμη δεδομένα να τραβήξουν. Μόλις καταχωρήσεις την πρώτη εγγραφή, ανάβουν μόνες τους.
        </p>
      )}
      {hasTax&&(
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:12, fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>
          <Info size={13} style={{ color:'var(--accent)' }}/>
          Οι φορολογικές προθεσμίες βασίζονται στο πλαίσιο της ΑΑΔΕ (έκδοση, πρώτη και τελευταία δόση). Διπλός έλεγχος:
          <a href={AADE_CALENDAR_URL} target="_blank" rel="noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>myAADE</a>·
          <a href={TAXHEAVEN_CALENDAR_URL} target="_blank" rel="noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>taxheaven</a>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// Καθαρός επιλογέας ώρας — αντικαθιστά το άσχημο native <input type="time">.
// Κουμπί με ώρα → portal λίστα ανά 15΄ (κλιπ-άτρωτη, ίδια αισθητική με το app).
function TimeField({ value, onChange }: { value:string; onChange:(v:string)=>void }) {
  const [open,setOpen]=useState(false)
  const [rect,setRect]=useState<{left:number;top:number;width:number}|null>(null)
  const ref=useRef<HTMLButtonElement>(null)
  const listRef=useRef<HTMLDivElement>(null)
  const times=useMemo(()=>{ const t:string[]=[]; for(let h=0;h<24;h++)for(const m of [0,15,30,45])t.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`); return t },[])
  const openMenu=()=>{ const r=ref.current?.getBoundingClientRect(); if(r)setRect({left:r.left,top:r.bottom+6,width:Math.max(r.width,132)}); setOpen(o=>!o) }
  useEffect(()=>{ if(!open)return; const close=(e:MouseEvent)=>{ if(!ref.current?.contains(e.target as Node)&&!listRef.current?.contains(e.target as Node))setOpen(false) }; const esc=(e:KeyboardEvent)=>{ if(e.key==='Escape'){e.stopPropagation();setOpen(false)} }; document.addEventListener('mousedown',close); document.addEventListener('keydown',esc,true); return ()=>{ document.removeEventListener('mousedown',close); document.removeEventListener('keydown',esc,true) } },[open])
  useEffect(()=>{ if(open&&listRef.current){ let idx=times.indexOf(value); if(idx<0)idx=36; const el=listRef.current.children[idx+1] as HTMLElement; el?.scrollIntoView({block:'center'}) } },[open,value,times])
  return (
    <>
      <button ref={ref} type="button" onClick={openMenu} style={{ width:'100%', boxSizing:'border-box', height:44, background:'var(--bg-surface)', border:'1px solid '+(open?'var(--accent)':'var(--border-subtle)'), borderRadius:12, padding:'0 12px', color:value?'var(--text-primary)':'var(--text-tertiary)', fontSize:14, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', outline:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, transition:'border-color 0.15s' }}>
        <span>{value||'--:--'}</span><Clock size={15} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>
      </button>
      {open&&rect&&createPortal(
        <div ref={listRef} style={{ position:'fixed', left:rect.left, top:rect.top, width:rect.width, maxHeight:244, overflowY:'auto', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, boxShadow:'var(--elev-3)', padding:5, zIndex:2000 }}>
          <button type="button" onClick={()=>{ onChange(''); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', color:'var(--text-tertiary)', fontSize:13, fontFamily: T.font.sans, borderRadius:8, cursor:'pointer' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Καμία ώρα</button>
          {times.map(t=>{ const active=t===value; return (
            <button key={t} type="button" onClick={()=>{ onChange(t); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:active?'var(--accent-soft)':'transparent', color:active?'var(--accent)':'var(--text-primary)', fontSize:14, fontWeight:active?600:400, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', borderRadius:8, cursor:'pointer' }} onMouseEnter={e=>{ if(!active)e.currentTarget.style.background='var(--bg-hover)' }} onMouseLeave={e=>{ if(!active)e.currentTarget.style.background='transparent' }}>{t}</button>
          )})}
        </div>,
        document.body
      )}
    </>
  )
}

function EventModal({ form, setForm, onSave, onClose, editing, saving, conflicts }: {
  form:FormState; setForm:React.Dispatch<React.SetStateAction<FormState>>
  onSave:()=>void; onClose:()=>void; editing:boolean; saving:boolean; conflicts?:number
}) {
  const [showDetails,setShowDetails]=useState(editing)
  // Προσβασιμότητα: Cmd/Ctrl+Enter αποθηκεύει. Το Escape έφυγε από εδώ επειδή
  // το ίδιο το <Modal> το ακούει (useOverlayShell) — δύο listeners στο ίδιο
  // πλήκτρο σήμαινε δύο κλήσεις onClose στο ίδιο πάτημα.
  // Ο ΙΔΙΟΣ ΕΛΕΓΧΟΣ ΜΕ ΤΟ ΚΟΥΜΠΙ. Το κουμπί κλείδωνε όσο έτρεχε το αίτημα, η
  // συντόμευση όχι: δύο γρήγορα Cmd+Enter καταχωρούσαν δύο πανομοιότυπα γεγονότα,
  // και σε νέο γεγονός με ποσό γράφονταν ΚΑΙ δύο δαπάνες. Ο πραγματικός φρουρός
  // μπήκε μέσα στο ίδιο το `saveEvent`, ώστε να ισχύει για κάθε δρόμο εισόδου·
  // εδώ μένει ο ίδιος έλεγχος για να μη φαίνεται καν να δέχεται το πάτημα.
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!saving&&form.title.trim()&&form.event_date)onSave() }; document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h) },[onSave,saving,form.title,form.event_date])
  // ── Η ΕΣΤΙΑΣΗ ΣΤΟΝ ΤΙΤΛΟ, ΠΙΣΩ ────────────────────────────────────────────
  // Το `autoFocus` του πεδίου όντως δεν έκανε τίποτα μέσα στο <Modal>: το
  // πλαίσιο εστιάζει τον εαυτό του σε effect, που τρέχει ΜΕΤΑ το autoFocus.
  // Το συμπέρασμα όμως ήταν λάθος — δεν έφταιγε η εστίαση στον τίτλο, έφταιγε
  // ο ΤΡΟΠΟΣ. Χωρίς αυτήν, «Νέο γεγονός» ανοίγει με τον δρομέα πουθενά και ο
  // χρήστης πρέπει να πατήσει στο πεδίο πριν γράψει — και η γρήγορη καταχώρηση
  // (parseQuickAdd) στηρίζεται ακριβώς στο να αρχίσεις να πληκτρολογείς αμέσως.
  // Ως effect του ΓΟΝΕΑ τρέχει μετά τα effects του παιδιού <Modal>, οπότε
  // κερδίζει την εστίαση αντί να τη χάνει. Ο διάλογος έχει ούτως ή άλλως
  // role="dialog" + aria-label, άρα ο αναγνώστης οθόνης ανακοινώνει και τα δύο.
  const titleRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{ titleRef.current?.focus() },[])
  // Ενιαία, καθαρά πεδία — ίδιο ύψος/καμπύλη/χρώμα παντού (Google λογική).
  const fld: React.CSSProperties = { width:'100%', boxSizing:'border-box', height:T.h.lg, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:6, padding:'0 16px', color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans, outline:'none', transition:'border-color 0.15s' }
  const focus=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>e.currentTarget.style.borderColor='var(--accent)'
  const blur=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>e.currentTarget.style.borderColor='var(--border-default)'
  // Το βέλος-εικόνα και το στυλ του ντόπιου <select> έφυγαν μαζί με τα ίδια τα
  // <select>: ήταν καρφωμένο γκρι που δεν άλλαζε ποτέ με το θέμα, δίπλα σε
  // λίστα επιλογών που τη ζωγράφιζε το λειτουργικό με δικά του χρώματα.
  const lbl: React.CSSProperties = { fontFamily: T.font.sans, fontSize:11, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:6 }
  const amt=parseFloat(form.amount)
  const canSave=!!form.title.trim()&&!!form.event_date
  return (
    <Modal open onClose={onClose} title={editing?'Επεξεργασία':'Νέο γεγονός'} width={480} footer={<>
      <button onClick={onClose} style={{ height:T.h.lg, padding:'0 18px', borderRadius:T.radius.btn, border:'1px solid var(--border-subtle)', background:'transparent', color:'var(--text-secondary)', fontSize:14, cursor:'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>
      <button onClick={onSave} disabled={saving||!canSave} style={{ height:T.h.lg, padding:'0 22px', borderRadius:T.radius.btn, border:'none', background:canSave&&!saving?'var(--accent)':'var(--bg-surface)', color:canSave&&!saving?'var(--accent-text)':'var(--text-tertiary)', fontSize:14, fontWeight:600, cursor:canSave&&!saving?'pointer':'not-allowed', fontFamily: T.font.sans }}>
        {saving?'Αποθήκευση…':editing?'Αποθήκευση':'Προσθήκη'}
      </button>
    </>}>
      {/* Τίτλος + έξυπνη ανάγνωση φυσικής γλώσσας (quick-add) */}
      <div>
        {/* Ήταν το μόνο πεδίο ΧΩΡΙΣ ετικέτα: το τι ζητούσε το έλεγε μόνο το
            κείμενο-υπόδειγμα, που εξαφανίζεται με το πρώτο γράμμα. Και το
            υπόδειγμα έγραφε «Service λέβητα Παρασκευή 10πμ»: μία αγγλική
            λέξη και μία συντομογραφία ώρας, σε ελληνική εφαρμογή. */}
        <label style={lbl}>Τίτλος</label>
        {/* Η εστίαση με το άνοιγμα δίνεται από το effect του `titleRef` πιο πάνω,
            όχι με `autoFocus` (το <Modal> την έπαιρνε πίσω). Το ύψος 48 έγινε
            T.h.lg — ήταν το μοναδικό χειριστήριο του παραθύρου εκτός κλίμακας·
            η έμφαση του τίτλου μένει στα 16/500, δηλαδή σε μέγεθος και βάρος. */}
        <input ref={titleRef} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} onFocus={focus} onBlur={blur} placeholder="Συντήρηση λέβητα, Παρασκευή 10:00" style={{...fld, fontSize:16, fontWeight:500}}/>
        {(()=>{ if(editing)return null; const qa=parseQuickAdd(form.title, new Date()); const hasExtra=!!(qa.date||qa.time)&&(qa.date!==form.event_date||qa.time!==(form.event_time||null)||qa.title!==form.title); if(!hasExtra)return null
          const dLbl=qa.date?localDay(qa.date).toLocaleDateString('el-GR',{weekday:'short',day:'numeric',month:'short'}):''
          return (
            <button onClick={()=>setForm(f=>({...f,title:qa.title,event_date:qa.date||f.event_date,event_time:qa.time||f.event_time}))} style={{ display:'flex', alignItems:'center', gap:7, marginTop:8, padding:'7px 12px', borderRadius:10, border:'1px solid var(--accent-border)', background:'var(--accent-soft)', color:'var(--accent)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily: T.font.sans, width:'100%', textAlign:'left' }}>
              <Zap size={13}/>Ορισμός: {[dLbl,qa.time].filter(Boolean).join(' · ')}, «{qa.title}»
            </button>
          )
        })()}
      </div>

      {/* Ημερομηνία + Ώρα */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 130px', gap:10 }}>
        <div>
          <label style={lbl}>Ημερομηνία</label>
          <DatePicker value={form.event_date} onChange={v=>setForm(f=>({...f,event_date:v}))}/>
        </div>
        <div>
          <label style={lbl}>Ώρα</label>
          <TimeField value={form.event_time} onChange={v=>setForm(f=>({...f,event_time:v}))}/>
        </div>
      </div>

      {/* Έξυπνες ενδείξεις: αργία/ΣΚ + σύγκρουση */}
      {form.event_date&&(holidayName(form.event_date)||isWeekend(form.event_date))&&(
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--accent)', fontFamily: T.font.sans, marginTop:-4 }}>
          <Info size={13}/>{holidayName(form.event_date)?`Αργία: ${holidayName(form.event_date)}`:'Σαββατοκύριακο'}
        </div>
      )}
      {form.event_time&&!!conflicts&&conflicts>0&&(
        <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:'var(--warning)', background:'var(--warning-dim)', border:'1px solid var(--warning-border)', borderRadius:10, padding:'8px 12px', fontFamily: T.font.sans }}>
          <AlertTriangle size={14}/>Έχεις ήδη {conflicts===1?'ένα γεγονός':`${conflicts} γεγονότα`} εκείνη την ώρα.
        </div>
      )}
      {/* Λεπτομέρειες (progressive) */}
      <button onClick={()=>setShowDetails(s=>!s)} style={{ display:'flex', alignItems:'center', gap:6, alignSelf:'flex-start', background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:13, fontWeight:500, fontFamily: T.font.sans, padding:'2px 0' }}>
        <ChevronDown size={15} style={{ transform:showDetails?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>{showDetails?'Λιγότερα':'Λεπτομέρειες'}
      </button>

      {showDetails&&(<>
        {/* ── ΜΙΑ ΣΕΙΡΑ, ΟΧΙ ΔΥΟ, ΚΑΙ ΜΙΑ ΕΤΙΚΕΤΑ, ΟΧΙ ΔΥΟ ──────────────────────
            Ηταν δύο πλέγματα των δύο στηλών, οπότε το «Ποσό» έπεφτε μόνο του σε
            δεύτερη σειρά ενώ δίπλα του έμενε κενό. Και οι ετικέτες ήταν σε δύο
            ιδιώματα, κολλητά η μία στην άλλη: «Κατηγορία» πεζά από το
            CustomSelect, «ΠΟΣΟ ΣΕ ΕΥΡΩ» κεφαλαία από τοπικό στιλ αυτού του
            αρχείου. Το πεδίο ποσού είναι πλέον το κοινό NumberInput, με το «€»
            μέσα του — άρα η ετικέτα δεν χρειάζεται να το πει.

            Το πλέγμα είναι το κοινό `fixedCols` των tokens, όχι δικό μου
            `minmax`: τρεις στήλες στο παράθυρο, μία σε κινητό, με τον ίδιο
            κανόνα που ακολουθεί κάθε άλλη φόρμα της εφαρμογής. */}
        <div {...fixedCols(3, 10)}>
          <CustomSelect label="Κατηγορία" value={form.category} onChange={v=>setForm(f=>({...f,category:v as EventCategory}))}
            options={Object.entries(CATEGORIES).map(([k,v])=>({ value:k, label:v.label }))}/>
          <CustomSelect label="Προτεραιότητα" value={form.priority} onChange={v=>setForm(f=>({...f,priority:v as EventPriority}))}
            options={Object.entries(PRIORITIES).map(([k,v])=>({ value:k, label:v.label }))}/>
          <NumberInput label="Ποσό" value={form.amount} onChange={v=>setForm(f=>({...f,amount:v}))} suffix="€"/>
          {form.event_time&&(
            <CustomSelect label="Διάρκεια" value={form.duration} onChange={v=>setForm(f=>({...f,duration:v}))} placeholder="Χωρίς διάρκεια"
              options={[{value:'',label:'Χωρίς διάρκεια'},{value:'30',label:'30 λεπτά'},{value:'60',label:'1 ώρα'},{value:'90',label:'1 ώρα 30 λεπτά'},{value:'120',label:'2 ώρες'},{value:'180',label:'3 ώρες'}]}/>
          )}
        </div>
        {/* Κύκλωμα: κόστος → δαπάνη */}
        {amt>0&&!editing&&(
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', borderRadius:10, background:form.add_expense?'var(--accent-soft)':'var(--bg-surface)', border:'1px solid '+(form.add_expense?'var(--accent-border)':'var(--border-subtle)'), transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
            <input type="checkbox" checked={form.add_expense} onChange={e=>setForm(f=>({...f,add_expense:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--accent)', cursor:'pointer' }}/>
            <span style={{ fontSize:13, color:'var(--text-primary)', fontFamily: T.font.sans }}>Καταχώρησέ το και στις <strong>Δαπάνες</strong> και στον <strong>Προϋπολογισμό</strong> ({fe(amt)})</span>
          </label>
        )}
        {/* Επικοινωνία */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={lbl}>Τηλέφωνο</label>
            <input type="tel" style={fld} placeholder="6912345678" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} onFocus={focus} onBlur={blur}/>
          </div>
          <div>
            <label style={lbl}>Ηλεκτρονική διεύθυνση</label>
            <input type="email" style={fld} placeholder="onoma@etaireia.gr" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} onFocus={focus} onBlur={blur}/>
          </div>
        </div>
        {/* Πρόσκληση συμμετέχοντα — στέλνει invite (.ics/mailto/WhatsApp/Viber) στην επαφή */}
        {(()=>{ if(!form.title.trim()||!form.event_date)return null
          const inv={title:form.title,date:form.event_date,time:form.event_time||undefined,durationMinutes:form.duration?+form.duration:undefined,details:form.notes||undefined,attendeeEmail:form.email||undefined,attendeePhone:form.phone||undefined}
          const cap=canInvite(inv); if(!cap.email&&!cap.phone)return null
          const btn:React.CSSProperties={ display:'inline-flex', alignItems:'center', gap:6, height:34, padding:'0 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily: T.font.sans, textDecoration:'none' }
          return (
            <div>
              <label style={lbl}>Πρόσκληση</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {cap.email&&<a href={inviteMailto(inv)} style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><FileText size={13}/>Με μήνυμα</a>}
                {cap.phone&&<a href={inviteWhatsApp(inv)} target="_blank" rel="noreferrer" style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}>WhatsApp</a>}
                {cap.phone&&<a href={inviteViber(inv)} style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}>Viber</a>}
                <button type="button" onClick={()=>downloadFile(buildInviteICS(inv), 'πρόσκληση.ics', 'text/calendar;charset=utf-8')} style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><CalendarPlus size={13}/>Αρχείο ημερολογίου</button>
              </div>
            </div>
          )
        })()}
        <div>
          <label style={lbl}>Σύνδεσμος τιμολογίου ή σύμβασης</label>
          <input style={fld} placeholder="https://…" value={form.attachment_url} onChange={e=>setForm(f=>({...f,attachment_url:e.target.value}))} onFocus={focus} onBlur={blur}/>
        </div>
        {/* Κατάσταση */}
        <div>
          <label style={lbl}>Κατάσταση</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {/* Η επιλεγμένη κατάσταση βαφόταν με το ΣΗΜΑΣΙΟΛΟΓΙΚΟ χρώμα της:
                πορτοκαλί το «Εκκρεμεί», πράσινο το «Πληρώθηκε», κόκκινο το
                «Ακυρώθηκε». Δηλαδή η φόρμα έβγαζε ετυμηγορία για μια επιλογή
                που μόλις έκανε ο χρήστης και το «Εκκρεμεί» —η προεπιλογή
                κάθε νέου γεγονότος— άνοιγε πάντα με προειδοποιητικό χρώμα.
                Η επιλογή δείχνει ΕΠΙΛΟΓΗ, με το χρώμα της επιλογής. */}
            {Object.entries(STATUSES).map(([k,v])=>(
              <button key={k} onClick={()=>setForm(f=>({...f,status:k as EventStatus}))} style={{ height:T.h.sm, padding:'0 14px', borderRadius: T.radius.modal, cursor:'pointer', fontSize:13, fontFamily: T.font.sans, fontWeight:form.status===k?600:500, border:`1px solid ${form.status===k?'var(--accent-border)':'var(--border-subtle)'}`, background:form.status===k?'var(--accent-soft)':'transparent', color:form.status===k?'var(--accent)':'var(--text-secondary)', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>{v.label}</button>
            ))}
          </div>
        </div>
        {/* Επανάληψη */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'12px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily: T.font.sans, fontSize:14, fontWeight:500, color:'var(--text-primary)' }}>Επαναλαμβανόμενο</span>
            <div {...pressable(()=>setForm(f=>({...f,recurring:!f.recurring})))} style={{ width:46, height:28, borderRadius: T.radius.card, background:form.recurring?'var(--accent)':'var(--border-default)', position:'relative', transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s', cursor:'pointer', flexShrink:0 }}>
              <span style={{ position:'absolute', top:2, left:form.recurring?'calc(100% - 26px)':2, width:24, height:24, borderRadius:'50%', background:'var(--bg-surface)', transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s', boxShadow:'var(--elev-1)' }}/>
            </div>
          </div>
          {form.recurring&&(
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
              <CustomSelect value={form.recurring_interval} onChange={v=>setForm(f=>({...f,recurring_interval:v}))} options={RECURRING_OPTIONS.map(o=>({ value:o.value, label:o.label }))}/>
              <CustomSelect value={form.recurrence_end_mode} onChange={v=>setForm(f=>({...f,recurrence_end_mode:v as FormState['recurrence_end_mode']}))}
                options={[{value:'none',label:'Χωρίς λήξη'},{value:'until',label:'Μέχρι ημερομηνία'},{value:'count',label:'Για πλήθος φορών'}]}/>
              {form.recurrence_end_mode==='until'&&<div style={{ gridColumn:'1 / -1' }}><DatePicker value={form.recurrence_until} onChange={v=>setForm(f=>({...f,recurrence_until:v}))}/></div>}
              {form.recurrence_end_mode==='count'&&<div style={{ gridColumn:'1 / -1' }}><input type="number" min="1" style={fld} placeholder="Παράδειγμα: 12 φορές" value={form.recurrence_count} onChange={e=>setForm(f=>({...f,recurrence_count:e.target.value}))} onFocus={focus} onBlur={blur}/></div>}
            </div>
          )}
        </div>
        {/* Σημειώσεις */}
        <div>
          <label style={lbl}>Σημειώσεις</label>
          <textarea style={{...fld, height:'auto', minHeight:60, padding:'10px 14px', resize:'vertical'}} placeholder="Οδηγίες, αριθμός λογαριασμού…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} onFocus={focus} onBlur={blur}/>
        </div>
      </>)}
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΣΕΙΡΑ, ΜΙΑ ΓΡΑΜΜΗ
// ─────────────────────────────────────────────────────────────────────────
// Η καρτέλα που εκπροσωπεί ολόκληρο πρόγραμμα δόσεων. Λέει ό,τι θέλει να ξέρει
// κανείς με μια ματιά — τι είναι, πότε είναι η επόμενη, με τι ρυθμό, πόσες
// μένουν και πόσο κάνουν συνολικά — και ανοίγει σε πλήρη ανάλυση με ένα κλικ.
//
// Το ποσό στα δεξιά είναι της ΕΠΟΜΕΝΗΣ δόσης, όχι το σύνολο: αυτό είναι που θα
// φύγει από τον λογαριασμό. Το σύνολο λέγεται με λέξεις από κάτω, ώστε να μη
// μπερδεύεται με το ποσό της γραμμής.
function SeriesCard({ group, onToggle, onEdit, onDelete, bulkMode, selectedIds, onSelect }: {
  group: SeriesRow<CalEvent> & { kind:'series' }
  onToggle:(e:CalEvent)=>void; onEdit:(e:CalEvent)=>void; onDelete:(id:string)=>void
  bulkMode?:boolean; selectedIds?:Set<string>; onSelect?:(id:string)=>void
}) {
  const [open,setOpen]=useState(false)
  const { lead, rest, count, cadence, lastDate, totalAmount } = group
  const cat = CATEGORIES[lead.category]
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      <div style={{ display:'flex', alignItems:'center', gap:11, padding:'12px 15px', background:'var(--bg-surface)',
        border:'1px solid var(--border-subtle)', borderLeft:`3px solid color-mix(in srgb, ${cat.color} 50%, transparent)`,
        borderRadius:10, boxShadow:'var(--shadow-sm)' }}>
        <span title="Επαναλαμβανόμενη σειρά" style={{ flexShrink:0, width:18, height:18, borderRadius:'50%', border:'2px solid var(--border-default)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)' }}>
          <Repeat size={9}/>
        </span>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:14, fontFamily: T.font.sans, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.title}</p>
          <p style={{ fontSize:12, fontFamily: T.font.sans, color:'var(--text-tertiary)', margin:'3px 0 0' }}>
            {[cadence, `επόμενη ${fmt(lead.event_date)}`, `${count} συνολικά έως ${fmt(lastDate)}`].filter(Boolean).join(' · ')}
            {totalAmount!=null&&<> · σύνολο <span style={{ fontVariantNumeric:'tabular-nums' }}>{fe(totalAmount)}</span></>}
          </p>
        </div>
        {lead.amount!=null&&(
          <span style={{ fontSize:13, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)', flexShrink:0 }}>{fe(lead.amount)}</span>
        )}
        <button onClick={()=>setOpen(o=>!o)} aria-expanded={open}
          style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, height:T.h.sm, padding:'0 11px', borderRadius:T.radius.pill, border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-secondary)', fontSize:12, fontFamily: T.font.sans, cursor:'pointer', whiteSpace:'nowrap' }}>
          {open?'Σύμπτυξη':'Ανάλυση'}
          <ChevronDown size={12} style={{ transform:open?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
        </button>
      </div>
      {open&&(
        <div style={{ display:'flex', flexDirection:'column', gap:7, paddingLeft:18, borderLeft:'1px solid var(--border-subtle)', marginLeft:7 }}>
          {[lead,...rest].map(e=>(
            <EventCard key={e.id} event={e} onToggleStatus={onToggle} onEdit={onEdit} onDelete={onDelete}
              selected={selectedIds?.has(e.id)} onSelect={onSelect} bulkMode={bulkMode}/>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ title, color, events, onToggle, onEdit, onDelete, collapsed=false, desc=false, bulkMode, selectedIds, onSelect }: {
  title:string; color:string; events:CalEvent[]; onToggle:(e:CalEvent)=>void; onEdit:(e:CalEvent)=>void; onDelete:(id:string)=>void
  collapsed?:boolean; desc?:boolean; bulkMode?:boolean; selectedIds?:Set<string>; onSelect?:(id:string)=>void
}) {
  const [open,setOpen]=useState(!collapsed)
  const sorted=[...events].sort((a,b)=>desc?b.event_date.localeCompare(a.event_date):a.event_date.localeCompare(b.event_date))
  // ═══ ΕΚΑΤΟΝ ΔΕΚΑΕΝΝΕΑ ΓΡΑΜΜΕΣ ΠΟΥ ΕΛΕΓΑΝ ΤΟ ΙΔΙΟ ══════════════════════════
  // Ένα δάνειο εικοσαετίας γράφει μία εγγραφή ανά δόση. Στην «Αργότερα» αυτό
  // γινόταν εκατόν δεκαεννέα διαδοχικές, πανομοιότυπες γραμμές «Δόση δανείου ·
  // 751,00 €» και ό,τι άλλο είχε το ημερολόγιο —μια λήξη μίσθωσης, ένας
  // έλεγχος λέβητα— θαβόταν από κάτω. Στη μαζική επιλογή, το πρώτο πράγμα που
  // έβλεπε ο χρήστης ήταν εκατό κουτάκια για το ίδιο δάνειο.
  //
  // Οι εγγραφές μένουν στη βάση μία-μία, γιατί καθεμιά πληρώνεται χωριστά. Εδώ
  // εμφανίζονται σαν αυτό που είναι: μία σειρά, με «Ανάλυση» για όποιον τη θέλει.
  const rows=groupSeries(sorted)
  const shown=rows.reduce((n,r)=>n+rowCount(r),0)
  return (
    <div>
      <button onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', marginBottom:open?11:0, padding:0 }}>
        <span style={{ width:6, height:6, borderRadius:3, background:color, flexShrink:0, opacity:0.9 }}/>
        <span style={{ fontSize:12, fontFamily: T.font.sans, fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.06em', textTransform:'uppercase' }}>{title}</span>
        <span style={{ fontSize:12, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--text-tertiary)', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'0 7px', lineHeight:'17px' }}>{shown}</span>
        <ChevronDown size={13} color="var(--text-tertiary)" style={{ transform:open?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
      </button>
      {open&&(
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {rows.map(r=>r.kind==='series'
            ?<SeriesCard key={r.key} group={r} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete}
               bulkMode={bulkMode} selectedIds={selectedIds} onSelect={onSelect}/>
            :<EventCard key={r.event.id} event={r.event} onToggleStatus={onToggle} onEdit={onEdit} onDelete={onDelete}
               selected={selectedIds?.has(r.event.id)} onSelect={onSelect} bulkMode={bulkMode}/>
          )}
        </div>
      )}
    </div>
  )
}

// Επιλογή εμβέλειας για επαναλαμβανόμενο (επεξεργασία ή διαγραφή).
//
// ΓΙΑΤΙ Modal ΚΑΙ ΟΧΙ confirmDialog: οι απαντήσεις είναι ΤΡΕΙΣ, όχι δύο —
// «μόνο αυτό», «αυτό και τα επόμενα», «όλη τη σειρά». Το confirmDialog ξέρει
// μόνο ναι/όχι· να το στριμώξουμε εδώ σημαίνει δύο διαδοχικές ερωτήσεις για
// μία απόφαση.
//
// ΤΟ zIndex 1100 ΕΦΥΓΕ ΚΑΙ ΔΕΝ ΛΕΙΠΕΙ — αλλά ούτε και η στοίβαξη χρειάζεται:
// τα δύο παράθυρα ΔΕΝ είναι πια ανοιχτά μαζί (δες τη συνθήκη `!scopePrompt`
// στο σημείο που αποδίδεται το EventModal). Το παράθυρο εμβέλειας ρωτά μία
// αυτοτελή ερώτηση για τις αλλαγές που μόλις έγιναν· η φόρμα από κάτω δεν
// προσθέτει τίποτα και δύο <Modal> μαζί έσπαγαν δύο πράγματα ταυτόχρονα:
// το Escape έκλεινε ΚΑΙ τα δύο (χαμένες αλλαγές) και το κλείδωμα κύλισης
// του useOverlayShell δεν είναι μετρημένο — στο κοινό ξεμοντάρισμα η σειρά
// επαναφοράς άφηνε `.app-content` και `body` κολλημένα σε overflow:hidden.
function ScopeModal({ title, hint, danger, onPick, onClose }: { title:string; hint?:string; danger?:boolean; onPick:(s:'this'|'following'|'all')=>void; onClose:()=>void }) {
  const opts:[('this'|'following'|'all'),string][]=[['this','Μόνο αυτό το γεγονός'],['following','Αυτό και τα επόμενα'],['all','Όλη τη σειρά']]
  return (
    <Modal open onClose={onClose} title={title} subtitle={hint} width={400}
      footer={<button onClick={onClose} style={{ height:T.h.lg, padding:'0 18px', borderRadius:T.radius.btn, border:'none', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', fontFamily: T.font.sans }}>Ακύρωση</button>}>
      <div style={{ display:'flex', flexDirection:'column', gap:T.sp.sm }}>
        {opts.map(([v,label])=>(
          <button key={v} onClick={()=>onPick(v)} style={{ display:'flex', alignItems:'center', gap:10, height:T.h.lg, padding:'0 16px', borderRadius:T.radius.btn, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', cursor:'pointer', fontSize:14, fontWeight:500, color:danger&&v==='all'?'var(--negative)':'var(--text-primary)', fontFamily: T.font.sans, textAlign:'left', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=danger&&v==='all'?'var(--negative)':'var(--accent)';e.currentTarget.style.background='var(--bg-elevated)'}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.background='var(--bg-surface)'}}>{label}</button>
        ))}
      </div>
    </Modal>
  )
}

// ══ ΕΝΑ ΙΔΙΩΜΑ ΓΙΑ ΤΟΝ ΣΥΝΔΕΣΜΟ, ΚΑΙ ΦΑΙΝΕΤΑΙ ΟΛΟΚΛΗΡΟΣ ══════════════════════
// ΤΙ ΔΕΝ ΠΗΓΑΙΝΕ. Οι δύο σύνδεσμοι ζούσαν μέσα σε <input readOnly> πλάτους 280
// εικονοστοιχείων. Ο πρώτος έχει 62 χαρακτήρες και ο δεύτερος 118: φαινόταν
// περίπου το ένα τρίτο του καθενός, κομμένο στη μέση μιας λέξης. Ένα πεδίο
// εισόδου υπόσχεται ότι γράφεις μέσα του, εδώ όμως δεν γράφεις ποτέ — αντιγράφεις
// και επικολλάς αλλού. Και για να ΕΠΙΒΕΒΑΙΩΣΕΙΣ ότι αντέγραψες το σωστό (ο ένας
// σύνδεσμος φέρνει ονόματα επισκεπτών, ο άλλος όχι) πρέπει να τον δεις ολόκληρο.
//
// Τώρα είναι μπλοκ που αναδιπλώνεται: όλος ο σύνδεσμος ορατός, σε γραμματοσειρά
// σταθερού πλάτους όπως κάθε άλλο τεχνικό στοιχείο της εφαρμογής, με το κουμπί
// αντιγραφής στη γραμμή της ετικέτας αντί για κολλητά δεξιά. Το ίδιο στοιχείο
// και στις δύο θέσεις, ώστε οι δύο ενότητες να διαβάζονται ως ζευγάρι.
function FeedLink({ label, hint, url, onCopy, copied }: {
  label:string; hint:string; url:string; onCopy:()=>void; copied:boolean
}) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12, marginBottom:6 }}>
        <span style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily: T.font.sans }}>{label}</span>
        <button onClick={onCopy} style={{ flexShrink:0, height:T.h.sm, padding:'0 12px', borderRadius:T.radius.btn, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily: T.font.sans }}>{copied?'Αντιγράφηκε':'Αντιγραφή'}</button>
      </div>
      <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'0 0 8px', lineHeight:1.5, fontFamily: T.font.sans }}>{hint}</p>
      {/* ΤΟ ΚΕΙΜΕΝΟ ΕΠΙΛΕΓΕΤΑΙ ΜΕ ΤΟ ΧΕΡΙ ΟΠΩΣ ΠΡΙΝ. Το `user-select: all` δίνει
          ολόκληρο τον σύνδεσμο με ένα κλικ, για όποιον δεν εμπιστεύεται το
          πρόχειρο ή δουλεύει σε περιηγητή που το αρνείται. */}
      <code style={{ display:'block', padding:'10px 12px', borderRadius:T.radius.btn, border:'1px solid var(--border-subtle)', background:'var(--bg-base)', color:'var(--text-secondary)', fontSize:12, lineHeight:1.6, fontFamily: T.font.num, wordBreak:'break-all', userSelect:'all' }}>{url}</code>
    </div>
  )
}

// Ζωντανή συνδρομή: το εξωτερικό ημερολόγιο διαβάζει το feed και ενημερώνεται μόνο του.
// ── ΜΙΑ ΣΥΝΔΡΟΜΗ, ΟΧΙ ΔΥΟ ────────────────────────────────────────────────────
// Ο σύνδεσμος έδειχνε σε συνάρτηση άκρου (`/functions/v1/calendar-feed`) που
// έγραφε ΔΙΚΟ ΤΗΣ .ics: τρίτο αντίγραφο της διαφυγής του προτύπου και
// αναδίπλωση γραμμής μετρημένη σε ΧΑΡΑΚΤΗΡΕΣ αντί για οκτάδες — δηλαδή κάθε
// ελληνικός τίτλος πάνω από 37 γράμματα έσπαγε εκτός προτύπου. Εδειχνε επίσης
// ΜΟΝΟ τα γεγονότα του ημερολογίου: ούτε λογαριασμός που λήγει, ούτε δόση
// ενοικίου, ούτε εκκρεμότητα με προθεσμία.
//
// Δείχνει πλέον στη διαδρομή της εφαρμογής (`/imerologio/<κουπόνι>.ics`), που
// είναι δοκιμασμένη, τυλίγει σωστά και κουβαλά και τις τέσσερις πηγές. Το
// κουπόνι είναι ΤΟ ΙΔΙΟ — ίδιος πίνακας, ίδια γραμμή — οπότε καμία υπάρχουσα
// συνδρομή δεν χάνεται· αλλάζει μόνο η διεύθυνση που προτείνουμε.
function SubscribeModal({ token, propertyId, onClose }: { token:string|null; propertyId:string; onClose:()=>void }) {
  const [copied,setCopied]=useState(false)
  const [copiedBusy,setCopiedBusy]=useState(false)
  const base=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'')
  const httpsUrl=feedUrl(token)
  const busyUrl=token?`${base}/functions/v1/bookings-feed?token=${token}&property=${propertyId}`:''
  const copyBusy=async()=>{ try{ await navigator.clipboard.writeText(busyUrl); setCopiedBusy(true); setTimeout(()=>setCopiedBusy(false),1800) }catch{} }
  const webcalUrl=httpsUrl.replace(/^https?:\/\//,'webcal://')
  const googleUrl=`https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(httpsUrl)}`
  const copy=async()=>{ try{ await navigator.clipboard.writeText(httpsUrl); setCopied(true); setTimeout(()=>setCopied(false),1800) }catch{} }
  const linkBtn:React.CSSProperties={ display:'flex', alignItems:'center', justifyContent:'center', gap:8, height:T.h.lg, borderRadius:T.radius.btn, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:14, fontWeight:500, textDecoration:'none', fontFamily: T.font.sans, cursor:'pointer' }
  return (
    <Modal open onClose={onClose} width={500} icon={<CalendarPlus size={19}/>}
      title="Ζωντανή συνδρομή"
      subtitle="Σύνδεσε μία φορά και το ημερολόγιό σου ενημερώνεται μόνο του, σε Google, Apple ή Outlook. Κουβαλά όλα σου τα ακίνητα: γεγονότα, λογαριασμούς που λήγουν, δόσεις ενοικίου και εκκρεμότητες με προθεσμία.">
      {!token?(
        <Spinner size={20} label="Δημιουργία συνδέσμου…" />
      ):(<>
        <FeedLink label="Σύνδεσμος συνδρομής" url={httpsUrl} onCopy={copy} copied={copied}
          hint="Προσωπικός σύνδεσμος: δείχνει όλα τα ακίνητά σου, με τα ονόματα των γεγονότων. Μην τον μοιράζεσαι." />
        {/* Τα δύο κουμπιά κάνουν τη δουλειά χωρίς αντιγραφή: το πρώτο ανοίγει
            κατευθείαν την οθόνη προσθήκης του Google, το δεύτερο παραδίδει τον
            σύνδεσμο στην εφαρμογή ημερολογίου του λειτουργικού. */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <a href={googleUrl} target="_blank" rel="noreferrer" style={linkBtn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><Calendar size={16}/>Google Calendar</a>
          <a href={webcalUrl} style={linkBtn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><CalendarDays size={16}/>Apple / Outlook</a>
        </div>
        {/* Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΓΙΑ ΤΟΝ ΠΡΟΣΩΠΙΚΟ ΣΥΝΔΕΣΜΟ ΕΦΥΓΕ ΑΠΟ ΕΔΩ: λέγεται
            πλέον δίπλα στον ίδιο τον σύνδεσμο, όπου την αφορά. Εδώ μένουν μόνο
            οι οδηγίες για όποιον προτιμά τη χειροκίνητη διαδρομή. */}
        <div style={{ display:'flex', gap:8, padding:'10px 12px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:T.radius.inner }}>
          <Info size={15} color="var(--accent)" style={{ flexShrink:0, marginTop:1 }}/>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, margin:0, fontFamily: T.font.sans }}>Με το χέρι στο Google Calendar: «Άλλα ημερολόγια», μετά «Από URL» και επικόλλησε τον σύνδεσμο.</p>
        </div>
        {/* Αμφίδρομος συγχρονισμός καναλιών (Airbnb/Booking auto-block) */}
        <div style={{ paddingTop:16, borderTop:'1px solid var(--border-subtle)' }}>
          <FeedLink label="Μπλοκάρισμα σε Airbnb ή Booking" url={busyUrl} onCopy={copyBusy} copied={copiedBusy}
            hint="Επικόλλησέ τον στο «Import calendar» κάθε καναλιού. Κάθε κράτηση μπλοκάρει τις ημερομηνίες παντού, χωρίς να ταξιδεύει το όνομα του επισκέπτη." />
        </div>
      </>)}
    </Modal>
  )
}

// Οποιος αλλάξει τον διακόπτη σε ΑΛΛΗ καρτέλα ή σε άλλη οθόνη, φτάνει εδώ.
function subscribeNotify(onChange: () => void): () => void {
  window.addEventListener(NOTIFY_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => { window.removeEventListener(NOTIFY_EVENT, onChange); window.removeEventListener('storage', onChange) }
}

export default function TabCalendar({ propertyId, userId, openTasks = 0, onOpenTasks }: {
  propertyId:string; userId:string;
  /** Πόσες εκκρεμότητες είναι ανοιχτές. Δείχνεται δίπλα στον σύνδεσμο, όχι ως σήμα. */
  openTasks?: number;
  /** Άνοιγμα των Εκκρεμοτήτων. Έφυγαν από την πλαϊνή μπάρα και ανοίγουν από εδώ. */
  onOpenTasks?: () => void;
}) {
  const supabase=createClient()
  const [events,setEvents]=useState<CalEvent[]>([])
  const [loading,setLoading]=useState(true)
  const [viewMode,setViewMode]=useState<ViewMode>('month')
  const [currentDate,setCurrentDate]=useState(athensNow())
  const [selectedDate,setSelectedDate]=useState<string>(todayStr())
  const [showModal,setShowModal]=useState(false)
  const [editingEvent,setEditingEvent]=useState<CalEvent|null>(null)
  const [editOccDate,setEditOccDate]=useState<string|null>(null)   // ημερομηνία της συγκεκριμένης εμφάνισης
  const [scopePrompt,setScopePrompt]=useState(false)                // επιλογή εμβέλειας επεξεργασίας
  const [deleteScope,setDeleteScope]=useState<{seriesId:string;occ:string}|null>(null)
  const [form,setForm]=useState<FormState>(EMPTY_FORM)
  const [saving,setSaving]=useState(false)
  const [filterCat,setFilterCat]=useState<EventCategory|'all'>('all')
  const [filterStatus,setFilterStatus]=useState<EventStatus|'all'>('all')
  const [dateFrom,setDateFrom]=useState('')
  const [dateTo,setDateTo]=useState('')
  const [showFilters,setShowFilters]=useState(false)
  const [showOverdue,setShowOverdue]=useState(false)
  const [showAutoPull,setShowAutoPull]=useState(false)
  const [searchQ,setSearchQ]=useState('')
  const [bulkMode,setBulkMode]=useState(false)
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set())
  const [showMenu,setShowMenu]=useState(false)
  const [showSubscribe,setShowSubscribe]=useState(false)
  const [feedToken,setFeedToken]=useState<string|null>(null)
  const menuRef=useRef<HTMLDivElement>(null)
  const menuBtnRef=useRef<HTMLButtonElement>(null)
  const menuPopRef=useRef<HTMLDivElement>(null)
  const [menuCoords,setMenuCoords]=useState<{top:number;left:number;up:boolean}>({top:0,left:0,up:false})
  // Θέση του μενού «⋯»: portal + fixed, δεξιά-στοιχισμένο στο κουμπί αλλά πάντα
  // πλήρως ορατό (clamp στα άκρα της οθόνης), προς τα κάτω· πάνω μόνο αν δεν χωράει.
  const positionMenu=()=>{ const el=menuBtnRef.current; if(!el)return; const r=el.getBoundingClientRect(); const W=248, PANEL_H=392, M=8; const below=window.innerHeight-r.bottom-M; const up=below<PANEL_H && r.top-M>below; const left=Math.max(M,Math.min(r.right-W,window.innerWidth-W-M)); setMenuCoords({top:up?r.top-6:r.bottom+6,left,up}) }
  const importRef=useRef<HTMLInputElement>(null)
  // Ο ΔΙΑΚΟΠΤΗΣ ΕΙΝΑΙ ΤΟΥ ΠΕΡΙΗΓΗΤΗ, ΟΧΙ ΤΗΣ REACT. Ηταν `useState(false)` και
  // `if(deviceNotifyOn())setNotifyOn(true)` μέσα στο effect που στήνει τον
  // ακροατή: σύγχρονη γραφή κατάστασης, δηλαδή δεύτερη απόδοση σε κάθε φόρτωση
  // του ημερολογίου. Το `useSyncExternalStore` δίνει ΞΕΧΩΡΙΣΤΗ απάντηση στον
  // διακομιστή («όχι», γιατί εκεί δεν υπάρχουν ειδοποιήσεις), οπότε δεν υπάρχει
  // ούτε ασυμφωνία ενυδάτωσης ούτε δεύτερη απόδοση.
  const notifyOn = useSyncExternalStore(subscribeNotify, deviceNotifyOn, () => false)
  const [stays,setStays]=useState<StaySpan[]>([])
  const notifiedRef=useRef<Set<string>>(new Set())
  // Ενιαίο drag (ποντίκι + αφή) — μετακίνηση γεγονότος με σύρσιμο στο πλέγμα του μήνα.
  const drag=usePointerDrag((id,date,time)=>moveEvent(id,date,time))
  // Εισαγωγή γεγονότων από αρχείο .ics (Google/Apple/Outlook export).
  async function importIcs(file:File){
    setShowMenu(false)
    try{
      const text=await file.text()
      const evs=parseICS(text)
      if(!evs.length){ notify('Δεν βρέθηκαν γεγονότα στο αρχείο.',{tone:'warning'}); return }
      const rows=evs.map(ev=>calendar.row({propertyId,userId},'import',{title:ev.title,category:'reminder',event_date:ev.date,event_time:ev.time,duration_minutes:ev.durationMinutes,notes:ev.notes}))
      await saved('Τα γεγονότα δεν εισήχθησαν', calendar.insert(supabase,rows))
      await load()
      notifyOk(`Εισήχθησαν ${rows.length} γεγονότα.`)
    }catch{ notifyError('Το αρχείο δεν διαβάστηκε.') }
  }
  // Η ΓΡΑΜΜΗ ΓΕΝΝΙΕΤΑΙ ΠΛΕΟΝ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ (20260821160000), ΟΠΟΤΕ ΕΔΩ
  // ΜΕΝΕΙ ΜΟΝΟ ΑΝΑΓΝΩΣΗ. Πριν, το κουπόνι δημιουργούνταν ΤΕΜΠΕΛΙΚΑ την πρώτη
  // φορά που άνοιγε αυτό το παράθυρο: όποιος δεν περνούσε από εδώ δεν είχε
  // διεύθυνση ημερολογίου και οι Ρυθμίσεις δεν είχαν τι να του δείξουν.
  async function openSubscribe(){
    setShowMenu(false)
    if(!feedToken){
      const { row } = await feedStore.feed(supabase, userId)
      setFeedToken(row?.token || null)
    }
    setShowSubscribe(true)
  }
  useEffect(()=>{ if(!showMenu)return; positionMenu(); const h=(ev:MouseEvent)=>{ const t=ev.target as Node; if((menuRef.current?.contains(t))||(menuPopRef.current?.contains(t)))return; setShowMenu(false) }; const rp=()=>positionMenu(); document.addEventListener('mousedown',h); window.addEventListener('scroll',rp,true); window.addEventListener('resize',rp); return ()=>{document.removeEventListener('mousedown',h); window.removeEventListener('scroll',rp,true); window.removeEventListener('resize',rp)} },[showMenu])

  // ΟΙ ΕΙΔΟΠΟΙΗΣΕΙΣ ΣΥΣΚΕΥΗΣ ΕΧΟΥΝ ΕΝΑΝ ΔΙΑΚΟΠΤΗ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΕΔΩ. Ζει στις
  // Ρυθμίσεις → Ειδοποιήσεις (DeviceNotifications.tsx) και ανάβει ΚΑΙ την πρωινή
  // ειδοποίηση με την εφαρμογή κλειστή ΚΑΙ αυτή εδώ την τοπική, ~10' πριν από
  // κάθε ραντεβού, όσο η εφαρμογή είναι ανοιχτή. Το ημερολόγιο ΑΚΟΥΕΙ: όποιος
  // αλλάξει τον διακόπτη σε άλλη καρτέλα δεν χρειάζεται να ανανεώσει σελίδα.
  useEffect(()=>{
    if(!notifyOn||typeof Notification==='undefined')return
    const tick=()=>{
      if(Notification.permission!=='granted')return
      const due=dueReminders(events.filter(e=>!e._virtual),athensNow(),10,notifiedRef.current)
      for(const e of due){
        notifiedRef.current.add(e.id)
        try{ new Notification(e.title,{ body:notifyBody(e,athensNow()), tag:`cal_${e.id}` }) }catch{}
      }
    }
    tick()
    const iv=setInterval(tick,60000)
    return ()=>clearInterval(iv)
  },[notifyOn,events])
  useEffect(()=>{
    load()
    // Ζωντανό: κάθε αλλαγή στα γεγονότα (π.χ. συμφωνία πληρωμής, sync υποχρεώσεων
    // από άλλα tabs) ενημερώνει αμέσως το ημερολόγιο, χωρίς refresh.
    const ch=supabase.channel(`calendar_${propertyId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'calendar_events',filter:`property_id=eq.${propertyId}`},()=>silentReload())
      .subscribe()
    return ()=>{ supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[propertyId])

  // Κάθε γεγονός περνά από ΜΙΑ κανονικοποίηση κατηγορίας: άλλες καρτέλες γράφουν
  // τιμές που το ημερολόγιο δεν γνώριζε ('rent_due', 'insurance_renewal', …) και
  // έσπαγαν την απόδοση. Μεταφράζονται εδώ, μία φορά, για όλες τις χρήσεις.
  // ΟΤΑΝ ΞΕΡΟΥΜΕ ΟΤΙ ΕΙΝΑΙ ΦΟΡΟΛΟΓΙΚΗ ΠΡΟΘΕΣΜΙΑ, ΤΟ ΛΕΜΕ. Παλιές εγγραφές
  // συγχρονισμού έχουν αποθηκευμένη κατηγορία «contract», οπότε το «Ε9, δήλωση
  // μεταβολών ακινήτων» και ο ΕΝΦΙΑ εμφανίζονταν ως «Συμβόλαιο» — ενώ η ίδια
  // κάρτα από δίπλα έδειχνε στοιχεία ΑΑΔΕ. Η πηγή του γεγονότος τα αναγνωρίζει
  // με βεβαιότητα (γι' αυτό εμφανίζονται τα στοιχεία), άρα η κατηγορία
  // διορθώνεται στην ανάγνωση και για τα παλιά δεδομένα, μία φορά, εδώ.
  const normalize=(rows:CalEvent[]|null)=>(rows||[]).map(e=>({
    ...e,
    category: taxKindOfEventSource(e.source) ? TAX_EVENT_CATEGORY : canonicalCategory(e.category),
  }))
  async function load() {
    setLoading(true)
    setEvents(normalize(await calendar.all(supabase,propertyId) as CalEvent[])); setLoading(false)
    loadStays()
  }
  // Επαναφόρτωση χωρίς spinner (για live ενημερώσεις)
  async function silentReload() {
    setEvents(normalize(await calendar.all(supabase,propertyId) as CalEvent[]))
  }
  // Κρατήσεις βραχυχρόνιας (client_stays) → μπάρες διαμονής στην προβολή Μήνα.
  async function loadStays() {
    const data=await stayStore.withClientName<StayBarRow>(supabase,propertyId,'id,check_in,check_out,total,channel',userId)
    // ΤΟ check_in ΤΩΝ ΚΡΑΤΗΣΕΩΝ ΔΕΧΕΤΑΙ NULL. Το `(s:any)` το έκρυβε: η κράτηση χωρίς
    // άφιξη έμπαινε ολόκληρη στο `toStaySpan`, όπου το `regex.test(null)` δοκίμαζε τη
    // λέξη "null" και γύριζε null — σωστό αποτέλεσμα, αλλά κατά τύχη. Ο συγχρονισμός
    // κρατήσεων παραπάνω κόβει ήδη ρητά τις ίδιες γραμμές· εδώ γίνεται το ίδιο.
    const rows:StayBarRow[]=data??[]
    const spans=rows
      .filter((s):s is StayBarRow&{check_in:string}=>!!s.check_in)
      .map(s=>toStaySpan({id:s.id,check_in:s.check_in,check_out:s.check_out,total:s.total,channel:s.channel,guest_name:joinedFullName(s.clients)}))
      .filter((s):s is StaySpan=>s!==null)
    setStays(spans)
  }

  const filtered=useMemo(()=>events.filter(e=>{
    // Οι κρατήσεις εμφανίζονται ΜΟΝΟ ως ενιαία μπάρα διαμονής (από τα ζωντανά
    // client_stays) — κρύβουμε παντού τα booking:* events ώστε να μη διπλοφαίνονται
    // σε λίστες/ατζέντα/ημέρα/αναζήτηση. (Παραμένουν στη βάση για feed/υπενθυμίσεις.)
    if((e.source||'').startsWith('booking:'))return false
    if(filterCat!=='all'&&e.category!==filterCat)return false
    if(filterStatus!=='all'&&e.status!==filterStatus)return false
    if(dateFrom&&e.event_date<dateFrom)return false
    if(dateTo&&e.event_date>dateTo)return false
    if(searchQ){
      // Αναζήτηση σε τίτλο, σημειώσεις, ποσό και κατηγορία (όχι μόνο τίτλο).
      const q=searchQ.toLowerCase()
      const hay=[e.title,e.notes||'',e.amount!=null?String(e.amount):'',CATEGORIES[e.category]?.label||e.category].join(' ').toLowerCase()
      if(!hay.includes(q))return false
    }
    return true
  }),[events,filterCat,filterStatus,searchQ,dateFrom,dateTo])

  const overdue=filtered.filter(isOverdue)
  const thisWeek=filtered.filter(isThisWeek)
  const thisMonth=filtered.filter(isThisMonth)
  const expiring=filtered.filter(isExpiring)
  const later=filtered.filter(e=>{const d=daysUntil(e.event_date);return e.status==='pending'&&d>30})
  const done=filtered.filter(e=>e.status==='paid'||e.status==='cancelled')
  // Το εύρος της προβολής: ο μήνας, με επέκταση των επαναλαμβανόμενων ώστε να
  // φαίνονται σε ΟΛΕΣ τις εμφανίσεις τους.
  const monthEvents = useMemo(()=>{
    const p2=(n:number)=>String(n).padStart(2,'0')
    const _y=currentDate.getFullYear(), _mo=currentDate.getMonth()
    const monthStart=`${_y}-${p2(_mo+1)}-01`, monthEnd=`${_y}-${p2(_mo+1)}-${p2(new Date(_y,_mo+1,0).getDate())}`
    return expandRecurring(filtered, monthStart, monthEnd)
  },[filtered,currentDate])
  // Ζωντανός έλεγχος σύγκρουσης ώρας για τη φόρμα («έχεις ήδη κάτι τότε»).
  const formConflicts=useMemo(()=> (showModal&&form.event_time&&form.event_date)
    ? findConflicts({id:editingEvent?.id,date:form.event_date,time:form.event_time,durationMinutes:form.duration?parseInt(form.duration):60,status:form.status}, events.map(e=>({id:e.id,date:e.event_date,time:e.event_time,durationMinutes:e.duration_minutes,status:e.status}))).length
    : 0, [showModal,form.event_time,form.event_date,form.duration,form.status,editingEvent,events])

  // Το κλικ σε μέρα/ώρα ΜΟΝΟ επιλέγει (δεν ανοίγει φόρμα). Η φόρμα ανοίγει με «Νέο»,
  // προσυμπληρωμένη με την επιλεγμένη μέρα και (αν υπάρχει) την επιλεγμένη ώρα.
  function openNew(date?:string){setEditingEvent(null);setForm({...EMPTY_FORM,event_date:date||selectedDate||todayStr()});setShowModal(true)}
  function openEdit(ev:CalEvent){
    // Εικονική εμφάνιση επαναλαμβανόμενου → φόρτωσε τη ΣΕΙΡΑ (base) αλλά κράτα ποια μέρα άνοιξε.
    const e=ev._virtual&&ev._seriesId?(events.find(x=>x.id===ev._seriesId)||ev):ev
    setEditingEvent(e); setEditOccDate(ev.event_date)
    const endMode:FormState['recurrence_end_mode']=e.recurrence_until?'until':e.recurrence_count?'count':'none'
    setForm({title:e.title,category:e.category,event_date:e.event_date,event_time:e.event_time||'',duration:e.duration_minutes?String(e.duration_minutes):'',amount:e.amount?.toString()||'',priority:e.priority,status:e.status,recurring:e.recurring,recurring_interval:e.recurring_interval||'monthly',recurrence_end_mode:endMode,recurrence_until:e.recurrence_until||'',recurrence_count:e.recurrence_count?String(e.recurrence_count):'',notes:e.notes||'',attachment_url:e.attachment_url||'',phone:e.contact_phone||'',email:e.contact_email||'',add_expense:false});setShowModal(true)
  }
  function buildPayload():calendar.EventRow{
    return calendar.row({propertyId,userId},'manual',{title:form.title,category:form.category,event_date:form.event_date,event_time:form.event_time||null,duration_minutes:form.duration?parseInt(form.duration):null,amount:form.amount?parseFloat(form.amount):null,priority:form.priority,status:form.status,recurring:form.recurring,recurring_interval:form.recurring?form.recurring_interval:null,recurrence_until:form.recurring&&form.recurrence_end_mode==='until'&&form.recurrence_until?form.recurrence_until:null,recurrence_count:form.recurring&&form.recurrence_end_mode==='count'&&form.recurrence_count?parseInt(form.recurrence_count):null,notes:form.notes||null,attachment_url:form.attachment_url||null,contact_phone:form.phone||null,contact_email:form.email||null})
  }
  // Κύκλωμα: το κόστος ενός γεγονότος μπορεί να γίνει και εκκρεμής δαπάνη (προϋπολογισμός/δαπάνες).
  async function maybeCreateExpense(){
    const amt=parseFloat(form.amount)
    if(!form.add_expense||!(amt>0))return
    const catMap:Record<string,string>={maintenance:'Συντήρηση & Επισκευές',bills:'Λογαριασμοί',contract:'Ασφάλιση και Νομικά',financial:'Λοιπά έξοδα',tenant:'Λοιπά έξοδα',reminder:'Λοιπά έξοδα'}
    // ΤΟ `try{}catch{}` ΕΔΩ ΗΤΑΝ ΔΙΠΛΑ ΑΟΡΑΤΟ: ο Supabase δεν πετά, οπότε δεν
    // έπιανε τίποτα· και το κενό `catch` θα κατάπινε ό,τι έπιανε. Ο χρήστης
    // τσέκαρε ρητά «καταχώρησέ το και στις Δαπάνες» και δεν μάθαινε ποτέ αν έγινε.
    // Η ΟΜΑΔΑ ΠΑΡΑΓΟΤΑΝ ΑΠΟ ΤΗΝ ΚΑΤΗΓΟΡΙΑ ΤΟΥ ΓΕΓΟΝΟΤΟΣ, ΟΧΙ ΤΗΣ ΔΑΠΑΝΗΣ και
    // η τιμή 'general' δεν υπάρχει καν στην ταξινομία: ασφάλιστρο καταχωρημένο
    // από εδώ έπαυε να εκπίπτει. Την παράγει πλέον το στρώμα, από την κατηγορία.
    await saved('Η δαπάνη δεν καταχωρήθηκε στα έξοδα',
      expenses.insert(supabase,[expenses.row({propertyId,userId},{amount:amt,description:form.title,date:form.event_date,category:catMap[form.category]||'Λοιπά έξοδα',paid:form.status==='paid'})]))
  }
  // Μετακίνηση με σύρσιμο (drag): αλλάζει ημερομηνία (και ώρα σε προβολή ωρών). Οι
  // εικονικές εμφανίσεις σειράς ΔΕΝ σύρονται (θα άλλαζαν όλη τη σειρά αμφίσημα).
  async function moveEvent(id:string, newDate:string, newTime?:string|null){
    if(id.includes('__'))return
    const patch:{event_date:string;event_time?:string|null}={event_date:newDate}
    if(newTime!==undefined)patch.event_time=newTime
    setEvents(prev=>prev.map(e=>e.id===id?{...e,...patch}:e))
    // Αισιόδοξη μετακίνηση: η κάρτα πηγαίνει στη νέα ημέρα αμέσως. Αν η αποθήκευση
    // αποτύχει, ΠΡΕΠΕΙ να γυρίσει πίσω — αλλιώς ο χρήστης βλέπει το γεγονός στη
    // νέα θέση, κλείνει και το βρίσκει στην παλιά χωρίς να έχει καταλάβει γιατί.
    if(!await saved('Η μετακίνηση δεν αποθηκεύτηκε', calendar.update(supabase,id,patch))) await load()
  }
  async function saveEvent(){
    // ΕΝΑ ΓΕΓΟΝΟΣ ΑΝΑ ΠΑΤΗΜΑ, ΑΠΟ ΟΠΟΥ ΚΙ ΑΝ ΕΡΘΕΙ. Το κλείδωμα ζούσε μόνο στο
    // `disabled` του κουμπιού, οπότε η συντόμευση πληκτρολογίου το παρέκαμπτε.
    if(saving)return
    if(!form.title||!form.event_date)return
    // Επεξεργασία υπάρχουσας ΣΕΙΡΑΣ → ρώτα εμβέλεια (μόνο αυτό / επόμενα / όλα).
    if(editingEvent&&editingEvent.recurring){ setScopePrompt(true); return }
    setSaving(true)
    const payload=buildPayload()
    // Το παράθυρο ΔΕΝ κλείνει αν δεν αποθηκεύτηκε. Πριν, το σφάλμα του Supabase
    // αγνοούνταν (δεν πετάει, επιστρέφει { error }) και το modal έκλεινε σαν να
    // πέτυχε — ο χρήστης έχανε τίτλο, ημερομηνία, ώρα, ποσό, επανάληψη και
    // σημειώσεις, χωρίς να του πει κανείς τίποτα.
    const { error } = editingEvent
      ? await calendar.update(supabase,editingEvent.id,payload)
      : await calendar.insert(supabase,[payload])
    if(error){ notifyError('Το γεγονός δεν αποθηκεύτηκε. Δοκίμασε ξανά.'); setSaving(false); return }
    if(!editingEvent) await maybeCreateExpense()
    await load(); setShowModal(false); setSaving(false)
  }
  // Εφαρμογή εμβέλειας επεξεργασίας σε επαναλαμβανόμενο.
  async function applyEditScope(scope:'this'|'following'|'all'){
    if(!editingEvent)return; setSaving(true)
    const base=editingEvent; const occ=editOccDate||base.event_date; const payload=buildPayload()
    try{
      if(scope==='all'){
        await saved('Η σειρά δεν ενημερώθηκε', calendar.update(supabase,base.id,payload))
      }else if(scope==='this'){
        // Απόσπαση μόνο αυτής: νέο μεμονωμένο με τις αλλαγές + εξαίρεση της ημέρας από τη σειρά.
        // Η ΣΕΙΡΑ ΤΩΝ ΔΥΟ ΕΧΕΙ ΣΗΜΑΣΙΑ: αν μπει η εξαίρεση χωρίς να έχει
        // δημιουργηθεί το μεμονωμένο, η εμφάνιση εξαφανίζεται εντελώς.
        if(await saved('Η εξαίρεση της ημέρας δεν αποθηκεύτηκε', calendar.insert(supabase,[{...payload,event_date:occ,recurring:false,recurring_interval:null,recurrence_until:null,recurrence_count:null}]))){
          const ex=Array.from(new Set([...(base.recurrence_exdates||[]),occ]))
          await saved('Η ημέρα δεν αφαιρέθηκε από τη σειρά', calendar.update(supabase,base.id,{recurrence_exdates:ex}))
        }
      }else{
        // Αυτό και τα επόμενα: κόψε τη σειρά την προηγούμενη μέρα + νέα σειρά από την occ.
        if(await saved('Η σειρά δεν κόπηκε στη σωστή ημερομηνία', calendar.update(supabase,base.id,{recurrence_until:addDaysStr(occ,-1),recurrence_count:null}))){
          await saved('Η νέα σειρά δεν δημιουργήθηκε', calendar.insert(supabase,[{...payload,event_date:occ}]))
        }
      }
    }catch{}
    await load(); setScopePrompt(false); setShowModal(false); setEditOccDate(null); setSaving(false)
  }

  async function toggleStatus(e:CalEvent){
    // Ολοκλήρωση εικονικής εμφάνισης → απόσπασέ την ως «πληρωμένη» + εξαίρεσέ την από τη σειρά.
    if(e._virtual&&e._seriesId){
      const base=events.find(x=>x.id===e._seriesId); if(!base)return
      if(!await saved('Η ολοκλήρωση δεν αποθηκεύτηκε', calendar.insert(supabase,[calendar.row({propertyId:base.property_id,userId:base.user_id},base.source||'manual',{title:base.title,category:base.category,event_date:e.event_date,event_time:base.event_time||null,duration_minutes:base.duration_minutes||null,amount:base.amount??null,priority:base.priority,status:'paid',notes:base.notes||null,attachment_url:base.attachment_url||null})]))) return
      const ex=Array.from(new Set([...(base.recurrence_exdates||[]),e.event_date]))
      await saved('Η ημέρα δεν αφαιρέθηκε από τη σειρά', calendar.update(supabase,base.id,{recurrence_exdates:ex}))
      await load(); return
    }
    const ns:EventStatus=e.status==='paid'?'pending':'paid'
    if(!await saved('Η κατάσταση δεν αποθηκεύτηκε', calendar.update(supabase,e.id,{status:ns}))) return
    setEvents(prev=>prev.map(ev=>ev.id===e.id?{...ev,status:ns}:ev))
  }
  // Έγινε async επειδή ο διάλογος επιβεβαίωσης δεν παγώνει πια τη σελίδα όπως το
  // native confirm. Διπλό κλικ στην ίδια κάρτα ΔΕΝ διπλοδιαγράφει: ο δίαυλος
  // κρατά έναν μόνο διάλογο ανοιχτό και απαντά «όχι» σε κάθε δεύτερη ερώτηση.
  // Οι δύο έλεγχοι επανάληψης μένουν ΠΑΝΩ από το await, ώστε το επαναλαμβανόμενο
  // γεγονός να ανοίγει το δικό του παράθυρο εμβέλειας χωρίς καμία αναμονή.
  async function deleteEvent(id:string){
    if(id.includes('__')){ const i=id.indexOf('__'); setDeleteScope({seriesId:id.slice(0,i),occ:id.slice(i+2)}); return }
    const ev=events.find(e=>e.id===id)
    if(ev?.recurring){ setDeleteScope({seriesId:id,occ:ev.event_date}); return }
    if(!(await confirmDialog('Διαγραφή γεγονότος;',{tone:'negative'})))return
    // Ήταν `.then(()=>{})`: η διαγραφή ξεκινούσε και κανείς δεν περίμενε ούτε
    // κοιτούσε το αποτέλεσμα, ενώ η γραμμή έφευγε ήδη από την οθόνη.
    if(!await saved('Το γεγονός δεν διαγράφηκε', calendar.remove(supabase,id))) return
    setEvents(prev=>prev.filter(e=>e.id!==id))
  }
  async function applyDeleteScope(scope:'this'|'following'|'all'){
    if(!deleteScope)return; const {seriesId,occ}=deleteScope
    const base=events.find(e=>e.id===seriesId); if(!base){setDeleteScope(null);return}
    if(scope==='all'){await saved('Η σειρά δεν διαγράφηκε', calendar.remove(supabase,seriesId))}
    else if(scope==='this'){const ex=Array.from(new Set([...(base.recurrence_exdates||[]),occ]));await saved('Η ημέρα δεν αφαιρέθηκε από τη σειρά', calendar.update(supabase,seriesId,{recurrence_exdates:ex}))}
    else{await saved('Η σειρά δεν κόπηκε', calendar.update(supabase,seriesId,{recurrence_until:addDaysStr(occ,-1),recurrence_count:null}))}
    await load(); setDeleteScope(null)
  }

  function toggleSelect(id:string){setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
  async function bulkMarkPaid(){
    if(!selectedIds.size)return
    await saved('Τα γεγονότα δεν σημειώθηκαν ως πληρωμένα', calendar.updateMany(supabase,[...selectedIds],{status:'paid'}))
    await load(); setSelectedIds(new Set()); setBulkMode(false)
  }
  async function bulkDelete(){
    // Ρητό στιγμιότυπο ΠΡΙΝ την ερώτηση: ο διάλογος δεν παγώνει πια τη σελίδα, άρα η
    // επιλογή μπορεί να αλλάξει όσο περιμένουμε απάντηση. Το πλήθος στο μήνυμα και
    // τα γεγονότα που σβήνουν προέρχονται πλέον από την ίδια, μία λίστα.
    const ids=[...selectedIds]
    if(!ids.length||!(await confirmDialog(`Διαγραφή ${ids.length} γεγονότων;`,{tone:'negative'})))return
    await saved('Τα γεγονότα δεν διαγράφηκαν', calendar.remove(supabase,ids))
    await load(); setSelectedIds(new Set()); setBulkMode(false)
  }

  // Escaping κατά RFC 5545 + αναδίπλωση γραμμών στους 75 χαρακτήρες.
  function icsEsc(s:string){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n') }
  function icsFold(line:string){ if(line.length<=75)return line; const out:string[]=[]; let s=line; while(s.length>75){ out.push(s.slice(0,75)); s=' '+s.slice(75) } out.push(s); return out.join('\r\n') }
  function exportICal(){
    const now=new Date(); const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PROPERWISE//Calendar 1.0//EL','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:PROPERWISE, Ημερολόγιο','X-WR-TIMEZONE:Europe/Athens']
    filtered.forEach(e=>{
      const d=e.event_date.replace(/-/g,''); const cat=CATEGORIES[e.category]
      const descParts=[e.notes||'', e.amount?`Ποσό: ${fe(e.amount)}`:''].filter(Boolean)
      lines.push('BEGIN:VEVENT',
        // ΤΟ ΕΠΙΘΕΜΑ ΤΟΥ UID ΕΙΝΑΙ ΑΝΑΓΝΩΡΙΣΤΙΚΟ, ΟΧΙ ΕΠΩΝΥΜΙΑ, ΚΑΙ ΜΕΝΕΙ.
        // Το Google και το Apple ταυτίζουν τα γεγονότα του ημερολογίου με το
        // UID. Αν αλλάξει, κάθε ήδη κατεβασμένο γεγονός γίνεται ΞΕΝΟ: μένει ως
        // φάντασμα και δίπλα του εμφανίζεται διπλότυπο. Η μετονομασία δεν
        // επιτρέπεται να διπλασιάσει τις προθεσμίες κανενός.
        `UID:${e.id}@properwise`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        `DTEND;VALUE=DATE:${d}`,
        icsFold(`SUMMARY:${icsEsc((cat?`${cat.label}: `:'')+e.title)}`),
        descParts.length?icsFold(`DESCRIPTION:${icsEsc(descParts.join(', '))}`):'',
        `CATEGORIES:${icsEsc(cat?.label||'')}`,
        `STATUS:${e.status==='paid'?'CONFIRMED':'TENTATIVE'}`,
        `PRIORITY:${e.priority==='critical'||e.priority==='high'?1:e.priority==='medium'?5:9}`,
        'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY',icsFold(`DESCRIPTION:${icsEsc(e.title)}`),'END:VALARM',
        'END:VEVENT')
    })
    lines.push('END:VCALENDAR')
    downloadFile(lines.filter(Boolean).join('\r\n'), 'properwise.ics', 'text/calendar;charset=utf-8')
  }

  // ΕΚΤΥΠΩΣΗ ΕΠΕΡΧΟΜΕΝΩΝ. Ήταν χειρόγραφο έγγραφο δίπλα σε επτά που περνούν από
  // το `reportPdf.ts`: δική του επικεφαλίδα, δική του τυπογραφία, δικό του
  // γαλάζιο περίγραμμα, δικά του γκρι. Και μια γραμμή που δεν δούλευε καθόλου:
  //
  //     const col = d<0 ? '#c5221f' : d<=7 ? '#e37400' : '${INK_MUTED}'
  //
  // Το τρίτο σκέλος ήταν μέσα σε ΜΟΝΑ εισαγωγικά, δηλαδή η κυριολεκτική
  // συμβολοσειρά «${INK_MUTED}» και όχι η τιμή της: το CSS έβγαινε άκυρο και το
  // χρώμα έπεφτε σιωπηλά στο κληρονομημένο. Δηλαδή δύο από τις τρεις καταστάσεις
  // βάφονταν κόκκινη και πορτοκαλί και η τρίτη δεν βαφόταν καθόλου.
  //
  // Η ΕΠΕΙΓΟΥΣΑ ΚΑΤΑΣΤΑΣΗ ΔΕΝ ΛΕΓΕΤΑΙ ΜΕ ΧΡΩΜΑ. Η στήλη γράφει ήδη «3 ημέρες
  // πριν», «Σήμερα», «σε 5 ημέρες» — η πληροφορία είναι εκεί, σε λέξεις. Το
  // ληξιπρόθεσμο παίρνει βάρος, όχι κόκκινο: σε ασπρόμαυρη εκτύπωση το κόκκινο
  // γίνεται ούτως ή άλλως γκρι και σε έγχρωμη είναι σήμα που δεν έχει μάθει
  // κανείς. Καμία συντομογραφία: «ημ.» → «ημέρες».
  function printCalendar(){
    const up=[...filtered].filter(e=>e.status!=='paid').sort((a,b)=>a.event_date.localeCompare(b.event_date))
    const fmtD=(s:string)=>localDay(s).toLocaleDateString('el-GR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})
    const whenText=(d:number)=>d<0?`${Math.abs(d)} ${Math.abs(d)===1?'ημέρα':'ημέρες'} πριν`:d===0?'Σήμερα':`σε ${d} ${d===1?'ημέρα':'ημέρες'}`
    const rows=up.length?up.map(e=>{
      const cat=CATEGORIES[e.category]; const d=daysUntil(e.event_date)
      // Ληξιπρόθεσμο και σημερινό: έντονα. Τα υπόλοιπα: κανονικό βάρος.
      const weight=d<=0?700:400
      return `<tr>
      <td style="white-space:nowrap">${rEsc(fmtD(e.event_date))}</td>
      <td style="font-weight:600;color:${INK}">${rEsc(e.title)}${e.amount?` <span class="tnum" style="color:${INK_MUTED}">${rEsc(rEur(e.amount))}</span>`:''}</td>
      <td style="font-size:11px">${rEsc(cat?.label||'')}</td>
      <td class="n" style="font-weight:${weight};font-size:12px;white-space:nowrap">${rEsc(whenText(d))}</td></tr>`}).join('')
      :`<tr><td colspan="4" class="empty" style="text-align:center">Καμία εκκρεμότητα.</td></tr>`
    const html=reportHead('Ημερολόγιο, PROPERWISE')
      + `<body><div class="page">`
      + reportHeader(null, 'Επερχόμενα γεγονότα και προθεσμίες')
      + `
      <table style="margin-top:22px">
        <thead><tr><th>Ημερομηνία</th><th>Γεγονός</th><th>Κατηγορία</th><th class="n">Πότε</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${reportDisclaimer('Κατάσταση επερχόμενων γεγονότων και προθεσμιών, όπως καταγράφονται στο ημερολόγιο του ακινήτου.')}
      </div></body></html>`
    openReport(html)
  }

  const prevPeriod=()=>setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))
  const nextPeriod=()=>setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))
  const periodLabel=()=>`${MONTHS_NOM[currentDate.getMonth()]} ${currentDate.getFullYear()}`

  // Βάση κουμπιού σε ύφος Google

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* ── Η ΟΘΟΝΗ ΧΡΕΙΑΖΕΤΑΙ ΟΝΟΜΑ, ΚΑΙ ΑΣ ΜΗΝ ΤΟ ΔΕΙΧΝΕΙ ──────────────────
          Δώδεκα καρτέλες έχουν ορατό τίτλο μέσω `PageTitle`, δηλαδή `h1`. Αυτή
          δεν είχε ΚΑΝΕΝΑ: ο αναγνώστης οθόνης ανακοίνωνε τη σελίδα χωρίς όνομα,
          η πλοήγηση ανά επικεφαλίδα —ο βασικός τρόπος που διαβάζει κανείς μια
          άγνωστη οθόνη— ξεκινούσε από `h2` ή `h3` και η ιεραρχία δεν είχε
          κορυφή. Το όνομα έρχεται από το `lib/nav/labels.ts`, την ίδια πηγή με
          το μενού και τη Νόα: δεν επινοείται δεύτερο εδώ.
          Κρυφό ΟΠΤΙΚΑ, όχι από τον αναγνώστη — η οθόνη έχει ήδη τη δική της
          κεφαλίδα και δεν αλλάζει ούτε ένα εικονοστοιχείο. */}
      <h1 className="sr-only">{navLabel('calendar')}</h1>

      {/* ═══ ΟΙ ΕΚΚΡΕΜΟΤΗΤΕΣ ΑΝΟΙΓΟΥΝ ΑΠΟ ΕΔΩ ══════════════════════════════════
          Ήταν δική τους γραμμή στην πλαϊνή μπάρα, στα «Εργαλεία», δίπλα στην
          απογραφή επίπλων. Είναι όμως προθεσμίες και τις προθεσμίες τις ψάχνει
          κανείς στο ημερολόγιο. Μία λέξη με τον αριθμό των ανοιχτών: η μπάρα
          γλιτώνει μια γραμμή και η καρτέλα βρίσκεται εκεί που τη σκέφτεσαι. */}
      {onOpenTasks && (
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onOpenTasks}
            style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontFamily: T.font.sans, fontSize:12, fontWeight:600, color:'var(--accent)', display:'inline-flex', alignItems:'center', gap:6 }}>
            Εκκρεμότητες
            {openTasks > 0 && <span style={{ fontFamily: T.font.mono, fontVariantNumeric:'tabular-nums', color:'var(--text-tertiary)', fontWeight:500 }}>{openTasks}</span>}
          </button>
        </div>
      )}

      {/* Εκπρόθεσμα — ΜΙΑ γραμμή, ίδια γλώσσα με το μπάνερ των λήξεων.
          Η γραμμή KPI έφυγε: επαναλάμβανε τα ίδια τρία νούμερα μέσα σε 40px (το
          μπάνερ λήξεων έλεγε τον ίδιο αριθμό, η ράγα «Επόμενα» τα ίδια γεγονότα)
          και το «Εκκρεμή ποσά» της ήταν το ΤΡΙΤΟ διαφορετικό νούμερο με την ίδια
          ετικέτα. Έμεινε μία εμβέλεια, δηλωμένη στην οθόνη: του μήνα. */}
      {/* ═══ ΤΟ ΙΔΙΟ ΤΕΣΣΕΡΑ, ΤΡΕΙΣ ΦΟΡΕΣ ═══════════════════════════════════
          Ήταν ΔΥΟ ζώνες: μια γραμμή «4 εκπρόθεσμα · Εμφάνιση» και από κάτω μια
          κάρτα που ΞΑΝΑΕΓΡΑΦΕ «ΕΚΠΡΟΘΕΣΜΑ · 4» ως δική της επικεφαλίδα, με δικό
          της κουμπί κλεισίματος δίπλα στο βέλος που μόλις είχε πατηθεί. Δύο
          επικεφαλίδες, δύο μετρητές, δύο τρόποι να κλείσει το ίδιο πράγμα.

          Και ΤΡΙΤΗ φορά στην «Ατζέντα»: εκεί η λίστα έχει ήδη δική της ενότητα
          «Εκπρόθεσμα» με τα ίδια τέσσερα, αναλυτικά. Οι δύο ζώνες αποδίδονταν
          από πάνω ούτως ή άλλως, οπότε ο χρήστης έβλεπε τα τέσσερα εκπρόθεσμα
          τρεις φορές στην ίδια οθόνη.

          Τώρα: μία κάρτα, η επικεφαλίδα της είναι το κουμπί και μόνο στην όψη
          «Μήνας» — γιατί μόνο εκεί λείπει. */}
      {viewMode==='month'&&overdue.length>0&&(
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--negative)', borderRadius:12, overflow:'hidden' }}>
          <button onClick={()=>setShowOverdue(o=>!o)} aria-expanded={showOverdue}
            style={{ display:'flex', alignItems:'center', gap:11, width:'100%', textAlign:'left', background:'transparent', border:'none', borderBottom:showOverdue?'1px solid var(--border-subtle)':'none', padding:'11px 16px', cursor:'pointer' }}>
            <AlertTriangle size={14} color="var(--negative)"/>
            <p style={{ fontSize:14, color:'var(--text-secondary)', fontFamily: T.font.sans, letterSpacing:'0.1px', margin:0, flex:1 }}>
              {overdue.length===1?'1 εκπρόθεσμο':`${overdue.length} εκπρόθεσμα`} · <span style={{ color:'var(--text-primary)' }}>{showOverdue?'Απόκρυψη':'Εμφάνιση'}</span>
            </p>
            <ChevronDown size={15} style={{ color:'var(--text-tertiary)', transform:showOverdue?'rotate(180deg)':'none', transition:'transform 0.15s' }}/>
          </button>
          {showOverdue&&(
            <div>
              {[...overdue].sort((a,b)=>a.event_date.localeCompare(b.event_date)).map((e,i,arr)=>{ const late=Math.abs(daysUntil(e.event_date)); const cat=CATEGORIES[e.category]; return (
                <button key={e.id} onClick={()=>openEdit(e)} style={{ display:'flex', alignItems:'center', gap:12, width:'100%', textAlign:'left', padding:'11px 16px', border:'none', borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none', background:'transparent', cursor:'pointer', transition:'background 0.12s' }} onMouseEnter={ev=>ev.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                  <span style={{ width:7, height:7, borderRadius:3, background:cat.color, flexShrink:0 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:14, fontFamily: T.font.sans, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>{e.title}</p>
                    <p style={{ fontSize:12, fontFamily: T.font.sans, color:'var(--text-tertiary)', margin:'2px 0 0' }}>{fmt(e.event_date)}{e.event_time?` · ${e.event_time}`:''}</p>
                  </div>
                  {e.amount!=null&&<span style={{ fontSize:13, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)' }}>{fe(e.amount)}</span>}
                  <span style={{ fontSize:12, fontFamily: T.font.sans, color:'var(--text-tertiary)', flexShrink:0 }}>πριν {late===1?'1 ημέρα':`${late} ημέρες`}</span>
                </button>
              )})}
            </div>
          )}
        </div>
      )}

      {/* Smart Alerts — μόνο η λήξη συμβολαίων· τα εκπρόθεσμα ανοίγουν από το KPI (χωρίς διπλό κόκκινο) */}
      {expiring.length>0&&(
        <div style={{ display:'flex', alignItems:'center', gap:11, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--warning)', borderRadius:10, padding:'10px 16px' }}>
          <Shield size={14} color="var(--warning)"/>
          <p style={{ fontSize:14, color:'var(--text-secondary)', fontFamily: T.font.sans, letterSpacing:'0.1px', margin:0 }}>
            {expiring.length} συμβόλαι{expiring.length===1?'ο λήγει':'α λήγουν'} εντός 60 ημερών · <span style={{ color:'var(--text-primary)' }}>{expiring.map(e=>`${e.title} (${fmtShort(e.event_date)})`).join(', ')}</span>
          </p>
        </div>
      )}

      {/* Toolbar — καθαρή, ένα πρωτεύον κουμπί· τα δευτερεύοντα σε ένα ήσυχο μενού */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
          {([['month','Μήνας',Calendar],['agenda','Ατζέντα',List]] as [ViewMode,string,typeof Calendar][]).map(([v,label,Icon])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{ display:'flex', alignItems:'center', gap:6, height:T.h.sm, padding:'0 12px', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily: T.font.sans, fontWeight:viewMode===v?600:500, background:viewMode===v?'var(--accent)':'transparent', color:viewMode===v?'var(--accent-text)':'var(--text-secondary)', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', letterSpacing:'0.1px' }}>
              <Icon size={13}/>{label}
            </button>
          ))}
        </div>

        {viewMode!=='agenda'&&(
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button aria-label="Προηγούμενο" title="Προηγούμενο" onClick={prevPeriod} style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><ChevronLeft size={18}/></button>
            <span aria-live="polite" style={{ fontSize:15, fontWeight:600, fontFamily: T.font.sans, color:'var(--text-primary)', minWidth:150, textAlign:'center', letterSpacing:'0.1px' }}>{periodLabel()}</span>
            <button aria-label="Επόμενο" title="Επόμενο" onClick={nextPeriod} style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><ChevronRight size={18}/></button>
            <button onClick={()=>setCurrentDate(athensNow())} style={{ height:T.h.sm, padding:'0 14px', borderRadius: T.radius.modal, border:'1px solid var(--border-default)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', fontSize:13, fontWeight:500, fontFamily: T.font.sans }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.color='var(--text-secondary)'}}>Σήμερα</button>
          </div>
        )}

        <div style={{ flex:1, minWidth:100, position:'relative' }}>
          <input className="po-field" aria-label="Αναζήτηση γεγονότος" placeholder="Τίτλος γεγονότος" value={searchQ} onChange={e=>setSearchQ(e.target.value)}
            style={{ width:'100%', height:T.h.md, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius: T.radius.modal, padding:'0 16px', color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans, outline:'none' }}
            onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}/>
        </div>

        <button onClick={()=>openNew()} title="Νέο γεγονός" style={{ display:'flex', alignItems:'center', gap:6, height:T.h.md, padding:'0 18px', background:'var(--accent)', border:'none', borderRadius: T.radius.modal, cursor:'pointer', color:'var(--accent-text)', fontSize:14, fontFamily: T.font.sans, fontWeight:600, letterSpacing:'0.1px', boxShadow:'var(--shadow-sm)' }}>
          <Plus size={15}/>Νέο
        </button>

        {/* Ένα ήσυχο μενού για όλα τα δευτερεύοντα */}
        <div ref={menuRef} style={{ position:'relative' }}>
          <button ref={menuBtnRef} aria-label="Περισσότερα" aria-haspopup="menu" aria-expanded={showMenu} title="Περισσότερα" onClick={()=>setShowMenu(m=>!m)} style={{ width:T.h.md, height:T.h.md, borderRadius:'50%', border:'1px solid '+(showMenu?'var(--border-default)':'var(--border-subtle)'), background:showMenu?'var(--bg-elevated)':'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }}><MoreHorizontal size={18}/></button>
          {showMenu&&createPortal(
            <div ref={menuPopRef} role="menu" style={{ position:'fixed', top:menuCoords.top, left:menuCoords.left, transform:menuCoords.up?'translateY(-100%)':'none', width:248, maxHeight:'min(392px, 80vh)', overflowY:'auto', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, boxShadow:'var(--elev-3)', padding:6, zIndex:3000 }}>
              {([
                {label: bulkMode?'Τέλος επιλογής':'Μαζική επιλογή', icon:<CheckSquare size={15}/>, on:()=>{setBulkMode(b=>!b);setSelectedIds(new Set());setShowMenu(false)}},
                {label: showFilters?'Απόκρυψη φίλτρων':'Φίλτρα', icon:<Filter size={15}/>, on:()=>{setShowFilters(f=>!f);setShowMenu(false)}},
                {label:'Συγχρονισμός δεδομένων', icon:<RefreshCw size={15}/>, on:()=>{setShowAutoPull(f=>!f);setShowMenu(false)}},
                {label:'Συνδρομή σε ζωντανό ημερολόγιο', icon:<CalendarPlus size={15}/>, on:openSubscribe},
                {label:'Λήψη αρχείου .ics', icon:<Download size={15}/>, on:()=>{exportICal();setShowMenu(false)}},
                {label:'Εισαγωγή από .ics', icon:<CalendarDays size={15}/>, on:()=>{importRef.current?.click()}},
                {label:'Εξαγωγή σε Excel', icon:<FileText size={15}/>, on:()=>{
                  // Καθαρός, φιλτραρίσιμος πίνακας: κάθε πεδίο σε δικό του κελί, αριθμοί
                  // ως αριθμοί (2 δεκαδικά), στήλες Έτος/Μήνας/Προθεσμία για φιλτράρισμα,
                  // και ξεχωριστά φύλλα «Εκπρόθεσμα»/«Επερχόμενα».
                  const prothesmia=(e:CalEvent)=> (e.status==='paid'||e.status==='cancelled')?'Ολοκληρωμένο':isOverdue(e)?'Εκπρόθεσμο':'Εντός προθεσμίας'
                  const cols:XlsxCol[]=[
                    {header:'Ημερομηνία',kind:'date',width:13},
                    {header:'Ημέρα',width:11},
                    {header:'Μήνας',width:12},
                    {header:'Έτος',kind:'year',width:8},
                    {header:'Κατηγορία',width:18},
                    {header:'Τίτλος',width:44},
                    {header:'Ποσό',kind:'eur',width:14},
                    {header:'Κατάσταση',width:13},
                    {header:'Προθεσμία',width:16},
                  ]
                  const WD=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο']
                  const toRow=(e:CalEvent)=>{ const d=new Date(e.event_date+'T00:00:00'); return [d,WD[d.getDay()],MONTHS_NOM[d.getMonth()],d.getFullYear(),CATEGORIES[e.category]?.label||e.category,e.title,(e.amount||null),STATUSES[e.status]?.label||e.status,prothesmia(e)] }
                  // Ταξινόμηση: χρονολογικά (κύριο) και δευτερευόντως με τη λογική σειρά
                  // κατηγοριών της εφαρμογής — καθαρή, προβλέψιμη ακολουθία.
                  const CAT_ORDER=Object.keys(CATEGORIES)
                  const catRank=(e:CalEvent)=>{ const i=CAT_ORDER.indexOf(e.category); return i<0?99:i }
                  const all=[...filtered].sort((a,b)=> a.event_date.localeCompare(b.event_date) || catRank(a)-catRank(b))
                  const curYear=athensNow().getFullYear()
                  const cur=all.filter(e=>new Date(e.event_date+'T00:00:00').getFullYear()===curYear)
                  const overdue=all.filter(e=>prothesmia(e)==='Εκπρόθεσμο'), upcoming=all.filter(e=>prothesmia(e)==='Εντός προθεσμίας')
                  // Πρώτο (προεπιλεγμένο) φύλλο: μόνο το τρέχον έτος. Ακολουθεί το πλήρες
                  // αρχείο και τα φύλλα εκπρόθεσμων/επερχόμενων.
                  const issued=athensNow().toLocaleDateString('el-GR')
                  const subFor=(scope:string)=>`${scope} · Έκδοση ${issued} · PROPERWISE`
                  const TOT=[6] // στήλη «Ποσό» → γραμμή ΣΥΝΟΛΟ
                  const sheets:XlsxSheet[]=[{name:`Ατζέντα ${curYear}`,title:`ΑΤΖΕΝΤΑ ΥΠΟΧΡΕΩΣΕΩΝ ${curYear}`,subtitle:subFor(`Έτος ${curYear}`),columns:cols,rows:cur.map(toRow),totalCols:TOT}]
                  if(all.length>cur.length) sheets.push({name:'Όλα τα έτη',title:'ΑΤΖΕΝΤΑ ΥΠΟΧΡΕΩΣΕΩΝ · ΟΛΑ ΤΑ ΕΤΗ',subtitle:subFor('Όλα τα έτη'),columns:cols,rows:all.map(toRow),totalCols:TOT})
                  if(overdue.length) sheets.push({name:'Εκπρόθεσμα',title:'ΕΚΠΡΟΘΕΣΜΕΣ ΥΠΟΧΡΕΩΣΕΙΣ',subtitle:subFor('Εκπρόθεσμες υποχρεώσεις'),columns:cols,rows:overdue.map(toRow),totalCols:TOT})
                  if(upcoming.length) sheets.push({name:'Επερχόμενα',title:'ΕΠΕΡΧΟΜΕΝΕΣ ΥΠΟΧΡΕΩΣΕΙΣ',subtitle:subFor('Επερχόμενες υποχρεώσεις'),columns:cols,rows:upcoming.map(toRow),totalCols:TOT})
                  downloadXlsx(`Ατζέντα υποχρεώσεων ${curYear}`,sheets)
                  setShowMenu(false)
                }},
                {label:'Εκτύπωση', icon:<Printer size={15}/>, on:()=>{printCalendar();setShowMenu(false)}},
              ] as {label:string;icon:React.ReactNode;on:()=>void}[]).map(it=>(
                <button key={it.label} onClick={it.on} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left', color:'var(--text-primary)', fontSize:13, fontFamily: T.font.sans, borderRadius:8, transition:'background 0.12s' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ color:'var(--text-tertiary)', display:'flex', flexShrink:0 }}>{it.icon}</span>{it.label}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>

      {bulkMode&&selectedIds.size>0&&(
        <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8, padding:'10px 16px' }}>
          <span style={{ fontSize:14, fontFamily: T.font.sans, fontWeight:500, color:'var(--accent)' }}>{selectedIds.size} επιλεγμένα</span>
          <button onClick={bulkMarkPaid} style={{ height:T.h.sm, padding:'0 16px', background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius: T.radius.card, cursor:'pointer', fontSize:13, color:'var(--accent)', fontFamily: T.font.sans, fontWeight:500 }}>Πληρωμένα</button>
          <button onClick={bulkDelete} style={{ height:T.h.sm, padding:'0 16px', background:'var(--negative-dim)', border:'1px solid var(--negative)', borderRadius: T.radius.card, cursor:'pointer', fontSize:13, color:'var(--negative)', fontFamily: T.font.sans, fontWeight:500 }}>Διαγραφή</button>
          <button onClick={()=>setSelectedIds(new Set(filtered.map(e=>e.id)))} style={{ height:T.h.sm, padding:'0 16px', background:'transparent', border:'1px solid var(--border-default)', borderRadius: T.radius.card, cursor:'pointer', fontSize:13, color:'var(--text-secondary)', fontFamily: T.font.sans }}>Επιλογή όλων</button>
        </div>
      )}

      {/* Filters Panel — ζωντανά πλήθη ανά φίλτρο, χρωματικές τελείες, καθάρισμα */}
      {showFilters&&(()=>{
        const anyActive=filterCat!=='all'||filterStatus!=='all'||!!searchQ||!!dateFrom||!!dateTo
        const inRange=(e:CalEvent)=>(!dateFrom||e.event_date>=dateFrom)&&(!dateTo||e.event_date<=dateTo)
        const matchSearch=(e:CalEvent)=>{ if(!searchQ)return true; const q=searchQ.toLowerCase(); return [e.title,e.notes||'',e.amount!=null?String(e.amount):'',CATEGORIES[e.category]?.label||e.category].join(' ').toLowerCase().includes(q) }
        const base=events.filter(e=>!(e.source||'').startsWith('booking:'))
        const catBase=base.filter(e=>(filterStatus==='all'||e.status===filterStatus)&&matchSearch(e)&&inRange(e))
        const statBase=base.filter(e=>(filterCat==='all'||e.category===filterCat)&&matchSearch(e)&&inRange(e))
        const catCount=(k:string)=>catBase.filter(e=>e.category===k).length
        const statCount=(k:string)=>statBase.filter(e=>e.status===k).length
        // Σταθερές διαστάσεις σε active/inactive (ίδιο fontWeight & ίδιο badge box)
        // ώστε η επιλογή να ΜΗΝ αλλάζει το μέγεθος του chip και να μη «χοροπηδά» το κουτί.
        const Chip=({active,color,onClick,dot,label,count}:{active:boolean;color:string;onClick:()=>void;dot?:string;label:string;count:number})=>(
          <button onClick={onClick} style={{ display:'inline-flex', alignItems:'center', gap:7, height:T.h.sm, padding:'0 13px', borderRadius: T.radius.modal, fontSize:13, cursor:'pointer', border:`1px solid ${active?color:'var(--border-subtle)'}`, background:active?`color-mix(in srgb, ${color} 15%, var(--bg-surface))`:'var(--bg-surface)', color:active?color:'var(--text-secondary)', fontFamily: T.font.sans, fontWeight:600, opacity:count===0&&!active?0.5:1, transition:'background 0.13s, border-color 0.13s, color 0.13s' }} onMouseEnter={e=>{if(!active)e.currentTarget.style.borderColor='var(--border-default)'}} onMouseLeave={e=>{if(!active)e.currentTarget.style.borderColor='var(--border-subtle)'}}>
            {dot&&<span style={{ width:8, height:8, borderRadius:3, background:dot, flexShrink:0 }}/>}
            {label}
            <span style={{ fontSize:11, fontVariantNumeric:'tabular-nums', color:active?color:'var(--text-tertiary)', background:'var(--bg-elevated)', borderRadius:8, padding:'1px 6px', minWidth:16, boxSizing:'border-box', textAlign:'center' }}>{count}</span>
          </button>
        )
        const activeCount=(filterCat!=='all'?1:0)+(filterStatus!=='all'?1:0)+(searchQ?1:0)+((dateFrom||dateTo)?1:0)
        return (
        <div style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius: T.radius.card, padding:'16px 18px', boxShadow:'var(--highlight-inset), var(--elev-2)', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Filter size={14} style={{ color:'var(--accent)' }}/>
              <p style={{ fontSize:13, fontFamily: T.font.sans, fontWeight:600, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>Φίλτρα</p>
              {activeCount>0&&<span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius: T.radius.modal, padding:'1px 8px', fontFamily: T.font.sans }}>{activeCount} ενεργά</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>{setFilterCat('all');setFilterStatus('all');setSearchQ('');setDateFrom('');setDateTo('')}} disabled={!anyActive} style={{ display:'inline-flex', alignItems:'center', gap:6, height:28, padding:'0 12px', borderRadius: T.radius.card, border:'1px solid '+(anyActive?'var(--border-default)':'var(--border-subtle)'), background:'var(--bg-surface)', color:anyActive?'var(--text-secondary)':'var(--text-tertiary)', fontSize:13, fontWeight:500, cursor:anyActive?'pointer':'not-allowed', opacity:anyActive?1:0.5, fontFamily: T.font.sans, transition: 'background-color 0.13s, border-color 0.13s, color 0.13s, box-shadow 0.13s, transform 0.13s, opacity 0.13s' }} onMouseEnter={e=>{if(anyActive){e.currentTarget.style.borderColor='var(--negative)';e.currentTarget.style.color='var(--negative)'}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=anyActive?'var(--border-default)':'var(--border-subtle)';e.currentTarget.style.color=anyActive?'var(--text-secondary)':'var(--text-tertiary)'}}><RotateCcw size={12}/>Καθάρισε</button>
              <button aria-label="Κλείσιμο φίλτρων" onClick={()=>setShowFilters(false)} style={{ width:T.h.sm, height:T.h.sm, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition: 'background-color 0.13s, border-color 0.13s, color 0.13s, box-shadow 0.13s, transform 0.13s, opacity 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.color='var(--text-secondary)'}}><X size={16}/></button>
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontFamily: T.font.sans, fontWeight:600, color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:9 }}>Κατηγορία</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <Chip active={filterCat==='all'} color="var(--accent)" onClick={()=>setFilterCat('all')} label="Όλες" count={catBase.length}/>
              {Object.entries(CATEGORIES).map(([k,v])=>(
                <Chip key={k} active={filterCat===k} color={v.color==='var(--text-secondary)'?'var(--accent)':v.color} onClick={()=>setFilterCat(filterCat===k?'all':k as EventCategory)} dot={v.color} label={v.label} count={catCount(k)}/>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontFamily: T.font.sans, fontWeight:600, color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:9 }}>Κατάσταση</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <Chip active={filterStatus==='all'} color="var(--accent)" onClick={()=>setFilterStatus('all')} label="Όλες" count={statBase.length}/>
              {Object.entries(STATUSES).map(([k,v])=>(
                <Chip key={k} active={filterStatus===k} color={v.color} onClick={()=>setFilterStatus(filterStatus===k?'all':k as EventStatus)} dot={v.color} label={v.label} count={statCount(k)}/>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10 }}>
              <p style={{ fontSize:11, fontFamily: T.font.sans, fontWeight:600, color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', margin:0 }}>Εύρος ημερομηνιών</p>
              {(dateFrom||dateTo)&&(()=>{ const f=(d:string)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric'}):'…'; return (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', color:'var(--accent)', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius: T.radius.modal, padding:'2px 10px' }}>{f(dateFrom)}<ArrowRight size={11}/>{f(dateTo)}</span>
              )})()}
            </div>
            <div style={{ display:'flex', gap:9, alignItems:'center' }}>
              <div style={{ flex:1, minWidth:0 }}><DatePicker value={dateFrom} onChange={setDateFrom} placeholder="Από"/></div>
              <ArrowRight size={14} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}><DatePicker value={dateTo} onChange={setDateTo} placeholder="Έως"/></div>
            </div>
            {(()=>{ const pad2=(n:number)=>String(n).padStart(2,'0'); const iso=(d:Date)=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; const an=athensNow(); const presets=[
              {label:'Αυτός ο μήνας', from:iso(new Date(an.getFullYear(),an.getMonth(),1)), to:iso(new Date(an.getFullYear(),an.getMonth()+1,0))},
              {label:'Επόμενες 30 ημέρες', from:todayStr(), to:iso(new Date(an.getFullYear(),an.getMonth(),an.getDate()+30))},
              {label:'Φέτος', from:`${an.getFullYear()}-01-01`, to:`${an.getFullYear()}-12-31`},
            ]; return (
              <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginTop:10 }}>
                {presets.map(p=>{ const on=dateFrom===p.from&&dateTo===p.to; return (
                  <button key={p.label} onClick={()=>{setDateFrom(on?'':p.from);setDateTo(on?'':p.to)}} style={{ height:28, padding:'0 11px', borderRadius: T.radius.card, border:`1px solid ${on?'var(--accent-border)':'var(--border-subtle)'}`, background:on?'var(--accent-soft)':'var(--bg-surface)', color:on?'var(--accent)':'var(--text-secondary)', fontSize:12, fontWeight:on?600:500, cursor:'pointer', fontFamily: T.font.sans, transition: 'background-color 0.13s, border-color 0.13s, color 0.13s, box-shadow 0.13s, transform 0.13s, opacity 0.13s' }} onMouseEnter={e=>{if(!on)e.currentTarget.style.borderColor='var(--border-default)'}} onMouseLeave={e=>{if(!on)e.currentTarget.style.borderColor='var(--border-subtle)'}}>{p.label}</button>
                )})}
                {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom('');setDateTo('')}} style={{ display:'inline-flex', alignItems:'center', gap:5, height:28, padding:'0 10px', borderRadius: T.radius.card, border:'none', background:'transparent', color:'var(--text-tertiary)', fontSize:12, cursor:'pointer', fontFamily: T.font.sans }} onMouseEnter={e=>e.currentTarget.style.color='var(--negative)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}><X size={12}/>Καθαρισμός</button>}
              </div>
            )})()}
          </div>
        </div>
        )
      })()}

      {showAutoPull&&<AutoPullPanel propertyId={propertyId} userId={userId} onRefresh={load} onClose={()=>setShowAutoPull(false)}/>}

      {/* Σκελετός στο σχήμα του πλέγματος του μήνα: ο δείκτης φόρτωσης άφηνε τη
          σελίδα να «πηδά» σε ύψος μόλις έφταναν τα γεγονότα. */}
      {loading&&<Skeleton h={420} r={14} />}

      {!loading&&viewMode==='month'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <MonthView events={monthEvents} currentDate={currentDate} selectedDate={selectedDate} onDayClick={d=>{setSelectedDate(d);setCurrentDate(new Date(d+'T00:00:00'))}} onEventClick={openEdit} upcomingAll={filtered} drag={drag} stays={stays}/>
          {monthEvents.length>0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <p style={{ fontSize:12, fontFamily: T.font.sans, fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>Γεγονότα {MONTHS_GEN[currentDate.getMonth()]}</p>
              {monthEvents.map(e=>(<EventCard key={e.id} event={e} onToggleStatus={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} selected={selectedIds.has(e.id)} onSelect={toggleSelect} bulkMode={bulkMode}/>))}
            </div>
          )}
          {monthEvents.length===0&&<EmptyState icon={<CalendarDays size={20}/>} title="Δεν βρέθηκαν γεγονότα αυτόν τον μήνα" hint="Πάτησε σε μια ημέρα για να προσθέσεις ραντεβού, πληρωμή ή υπενθύμιση." />}
        </div>
      )}

      {!loading&&viewMode==='agenda'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {overdue.length>0&&<Section title="Εκπρόθεσμα" color="var(--negative)" events={overdue} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisWeek.length>0&&<Section title="Επόμενες 7 μέρες" color="var(--accent)" events={thisWeek} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisMonth.length>0&&<Section title="Αυτόν τον μήνα" color="var(--text-secondary)" events={thisMonth} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {later.length>0&&<Section title="Αργότερα" color="var(--text-secondary)" events={later} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {done.length>0&&<Section title="Ολοκληρωμένα και ακυρωμένα" color="var(--text-tertiary)" events={done} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} collapsed desc bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {/* ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΕΣ ΚΕΝΕΣ ΚΑΤΑΣΤΑΣΕΙΣ, ΟΧΙ ΜΙΑ. Το «άλλαξε φίλτρο» σε
              λογαριασμό χωρίς ούτε ένα γεγονός στέλνει τον χρήστη να ψάξει
              ρύθμιση που δεν φταίει· το «πρόσθεσε γεγονός» σε φιλτραρισμένη όψη
              κρύβει ότι τα γεγονότα υπάρχουν και απλώς δεν ταιριάζουν. */}
          {filtered.length===0&&(events.length===0
            ? <EmptyState icon={<CalendarDays size={20}/>} title="Κανένα γεγονός ακόμη" hint="Πάτησε σε μια ημέρα για να προσθέσεις ραντεβού, πληρωμή ή υπενθύμιση." />
            : <EmptyState icon={<CalendarDays size={20}/>} title="Δεν βρέθηκαν γεγονότα" hint="Άλλαξε φίλτρο ή περίοδο για να δεις τα υπόλοιπα." />)}
        </div>
      )}

      <input ref={importRef} type="file" accept=".ics,text/calendar" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0]; if(f)importIcs(f); e.currentTarget.value=''}}/>
      {/* Ένα παράθυρο κάθε φορά: όσο ρωτάμε εμβέλεια, η φόρμα παραμερίζεται
          (τα δεδομένα της ζουν στο `form` εδώ, δεν χάνεται τίποτα — με
          «Ακύρωση» στην εμβέλεια η φόρμα επιστρέφει συμπληρωμένη). */}
      {showModal&&!scopePrompt&&<EventModal form={form} setForm={setForm} onSave={saveEvent} onClose={()=>setShowModal(false)} editing={!!editingEvent} saving={saving} conflicts={formConflicts}/>}
      {showSubscribe&&<SubscribeModal token={feedToken} propertyId={propertyId} onClose={()=>setShowSubscribe(false)}/>}
      {scopePrompt&&<ScopeModal title="Επεξεργασία επαναλαμβανόμενου" hint="Σε ποιες εμφανίσεις να εφαρμοστούν οι αλλαγές;" onPick={applyEditScope} onClose={()=>setScopePrompt(false)}/>}
      {deleteScope&&<ScopeModal title="Διαγραφή επαναλαμβανόμενου" hint="Τι θέλεις να διαγράψεις;" danger onPick={applyDeleteScope} onClose={()=>setDeleteScope(null)}/>}
      {drag.ghost&&createPortal(
        <div style={{ position:'fixed', left:drag.ghost.x+14, top:drag.ghost.y+14, pointerEvents:'none', zIndex:3000, background:'var(--accent)', color:'var(--accent-text)', fontSize:12, fontWeight:600, padding:'5px 11px', borderRadius:8, boxShadow:'var(--elev-2)', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily: T.font.sans }}>{drag.ghost.label}</div>,
        document.body
      )}
    </div>
  )
}