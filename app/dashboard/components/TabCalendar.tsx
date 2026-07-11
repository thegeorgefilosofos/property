'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { Spinner, ExportButton } from '@/components/Theme'
import { downloadCsv, csvEur, csvDate } from './exportCsv'
import {
  AlertTriangle, Plus, X, ChevronLeft, ChevronRight,
  Calendar, List, BarChart2, Check, FileText,
  Zap, Shield, User, Bell, Filter, Download,
  ChevronDown, Edit2, Trash2, RotateCcw,
  Euro, Wrench, RefreshCw, ToggleLeft, ToggleRight,
  Printer, Square, CheckSquare, CalendarDays, ArrowRight,
  TrendingUp, Clock, Info, MoreHorizontal, Share2, CalendarPlus,
} from 'lucide-react'
import { DatePicker } from './UIComponents'
import { allCalendarLinks, buildICS } from '@/lib/calendar/externalLinks'
import { holidayName, isWeekend } from '@/lib/calendar/greekHolidays'
import { expandRecurring } from '@/lib/calendar/recurrence'
import { findConflicts, findFreeSlots } from '@/lib/calendar/availability'
import { parseICS } from '@/lib/calendar/icsImport'
import { parseQuickAdd } from '@/lib/calendar/quickAdd'
import { dueReminders, notifyBody } from '@/lib/calendar/notify'

type EventCategory = 'financial' | 'bills' | 'maintenance' | 'contract' | 'tenant' | 'reminder'
type EventPriority = 'low' | 'medium' | 'high' | 'critical'
type EventStatus   = 'pending' | 'paid' | 'cancelled' | 'in_progress'
type ViewMode      = 'day' | 'week' | 'month' | 'year' | 'agenda'

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

// Google-aligned category colors
const CATEGORIES: Record<EventCategory, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
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
  cancelled:   { label: 'Ακυρώθηκε',  color: 'var(--text-tertiary)' },
}

const RECURRING_OPTIONS = [
  { value: 'weekly',    label: 'Κάθε εβδομάδα' },
  { value: 'monthly',   label: 'Κάθε μήνα' },
  { value: 'bimonthly', label: 'Κάθε 2 μήνες' },
  { value: 'quarterly', label: 'Κάθε 3 μήνες' },
  { value: 'biannual',  label: 'Κάθε 6 μήνες' },
  { value: 'annual',    label: 'Κάθε χρόνο' },
]

const MONTH_NAMES_GR  = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']
const MONTH_SHORT_GR  = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ']
const DAY_NAMES_GR    = ['Κυρ','Δευ','Τρι','Τετ','Πεμ','Παρ','Σαβ']
const DAY_FULL_GR     = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο']

const EMPTY_FORM: FormState = {
  title: '', category: 'reminder', event_date: '', event_time: '', duration: '', amount: '',
  priority: 'medium', status: 'pending', recurring: false,
  recurring_interval: 'monthly', recurrence_end_mode: 'none', recurrence_until: '', recurrence_count: '',
  notes: '', attachment_url: '', phone: '', email: '', add_expense: false,
}

function fmt(date: string) { if (!date) return ''; const [y,m,d]=date.split('-'); return `${d}/${m}/${y}` }
function fmtShort(date: string) { if (!date) return ''; const [y,m,d]=date.split('-'); return `${d} ${MONTH_SHORT_GR[parseInt(m)-1]}` }
function daysUntil(dateStr: string) { const t=new Date(); t.setHours(0,0,0,0); const g=new Date(dateStr); g.setHours(0,0,0,0); return Math.round((g.getTime()-t.getTime())/86400000) }
function isOverdue(e: CalEvent)  { return e.status==='pending'&&daysUntil(e.event_date)<0 }
function isThisWeek(e: CalEvent) { const d=daysUntil(e.event_date); return e.status==='pending'&&d>=0&&d<=7 }
function isThisMonth(e: CalEvent){ const d=daysUntil(e.event_date); return e.status==='pending'&&d>7&&d<=30 }
function isExpiring(e: CalEvent) { const d=daysUntil(e.event_date); return e.category==='contract'&&e.status==='pending'&&d>=0&&d<=60 }
function todayStr() { return new Date().toISOString().split('T')[0] }
function addDaysStr(date:string, days:number) { const [y,m,d]=date.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d+days)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}` }

// Google-style tooltip
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position:'relative', display:'inline-flex' }} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && text && (
        <div style={{ position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:4, padding:'6px 12px', fontSize:12, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", zIndex:999, pointerEvents:'none', maxWidth:260, whiteSpace:'pre-wrap' as any, boxShadow:'var(--shadow-lg)' }}>
          {text}
          <div style={{ position:'absolute', top:'100%', left:'50%', transform:'translateX(-50%)', width:0, height:0, borderLeft:'5px solid transparent', borderRight:'5px solid transparent', borderTop:'5px solid var(--border-default)' }}/>
        </div>
      )}
    </div>
  )
}

function CategoryBadge({ cat }: { cat: EventCategory }) {
  const c = CATEGORIES[cat]
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:500, letterSpacing:'0.5px', textTransform:'uppercase', padding:'2px 8px', borderRadius:16, color:c.color, background:c.bg, whiteSpace:'nowrap' }}>
      {c.icon}{c.label}
    </span>
  )
}

function StatusDot({ status }: { status: EventStatus }) {
  const s = STATUSES[status]
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontFamily:"'Inter',sans-serif", color:s.color, letterSpacing:'0.25px' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.color, display:'inline-block', flexShrink:0 }}/>
      {s.label}
    </span>
  )
}

function PriorityTag({ priority }: { priority: EventPriority }) {
  const p = PRIORITIES[priority]
  return (
    <span style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:500, letterSpacing:'0.5px', textTransform:'uppercase', padding:'1px 6px', borderRadius:4, color:p.color, background:`${p.color}15` }}>
      {p.label}
    </span>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source==='manual') return null
  const labels: Record<string,string> = { bills:'Λογαριασμοί', loan:'Συντήρηση', rent:'Ενοίκιο', checklist:'Εκκρεμότητα', maintenance:'Συντήρηση' }
  return (
    <span title="Δημιουργήθηκε αυτόματα από άλλη καρτέλα" style={{ fontSize:11, fontFamily:"'Inter',sans-serif", padding:'1px 6px', borderRadius:4, color:'var(--text-tertiary)', border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)' }}>
      αυτόματο · {labels[source]??source}
    </span>
  )
}

// Μετατροπή γεγονότος σε είσοδο για τους συνδέσμους εξωτερικών ημερολογίων.
function toCalInput(e: CalEvent) {
  const cat = CATEGORIES[e.category]?.label || ''
  const details = [e.notes||'', e.amount?`Ποσό: ${e.amount.toLocaleString('el-GR')} €`:''].filter(Boolean).join(' · ')
  return { title: (cat?`${cat}: `:'')+e.title, date: e.event_date, time: e.event_time||undefined, durationMinutes: e.duration_minutes||undefined, details }
}
function downloadEventIcs(e: CalEvent) {
  const blob = new Blob([buildICS(toCalInput(e))], { type:'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = `${e.title.replace(/[^\p{L}\p{N}]+/gu,'-').slice(0,40)||'event'}.ics`; a.click(); URL.revokeObjectURL(url)
}

// «Πρόσθεσε σε ημερολόγιο» + «Κοινοποίηση» — ένα διακριτικό μενού, portal ώστε να
// μη κόβεται. Καλύπτει Google / Outlook / Office 365 / Apple(.ics) / Yahoo και
// κοινοποίηση σε WhatsApp / Viber. Καθαροί σύνδεσμοι, χωρίς backend.
function AddToCalendarMenu({ event }: { event: CalEvent }) {
  const [open,setOpen]=useState(false)
  const btnRef=useRef<HTMLButtonElement>(null)
  const popRef=useRef<HTMLDivElement>(null)
  const [pos,setPos]=useState({top:0,left:0})
  const reposition=()=>{ if(!btnRef.current)return; const r=btnRef.current.getBoundingClientRect(); const W=232,H=356; const left=Math.min(r.left,window.innerWidth-W-8); const openUp=r.bottom+H+8>window.innerHeight&&r.top-H-8>0; setPos({top:openUp?r.top-H-6:r.bottom+6,left:Math.max(8,left)}) }
  useEffect(()=>{ if(!open)return; reposition(); const h=(ev:MouseEvent)=>{const t=ev.target as Node; if(btnRef.current&&!btnRef.current.contains(t)&&popRef.current&&!popRef.current.contains(t))setOpen(false)}; const s=()=>reposition(); document.addEventListener('mousedown',h); window.addEventListener('scroll',s,true); window.addEventListener('resize',s); return ()=>{document.removeEventListener('mousedown',h); window.removeEventListener('scroll',s,true); window.removeEventListener('resize',s)} },[open])
  const links=allCalendarLinks(toCalInput(event))
  const row=(label:string,onClick:()=>void,icon:React.ReactNode)=>(
    <button key={label} type="button" onClick={()=>{onClick();setOpen(false)}} style={{ display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',border:'none',background:'transparent',cursor:'pointer',textAlign:'left',color:'var(--text-primary)',fontSize:13,fontFamily:"'Inter',sans-serif",borderRadius:8,transition:'background 0.12s' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <span style={{ color:'var(--text-tertiary)',display:'flex',flexShrink:0 }}>{icon}</span>{label}
    </button>
  )
  const openExt=(href:string)=>window.open(href,'_blank','noopener,noreferrer')
  return (
    <>
      <button ref={btnRef} type="button" title="Πρόσθεσε σε ημερολόγιο ή κοινοποίησε" onClick={e=>{e.stopPropagation();setOpen(o=>!o)}}
        style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:'50%',border:'1px solid '+(open?'var(--border-default)':'transparent'),background:open?'var(--bg-elevated)':'transparent',cursor:'pointer',color:'var(--text-secondary)',flexShrink:0,transition:'all 0.15s' }}>
        <CalendarPlus size={15}/>
      </button>
      {open&&createPortal(
        <div ref={popRef} style={{ position:'fixed',top:pos.top,left:pos.left,width:232,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,boxShadow:'0 12px 40px rgba(0,0,0,0.35)',padding:6,zIndex:2000 }}>
          <div style={{ fontSize:10.5,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'6px 12px 4px',fontFamily:"'Inter',sans-serif" }}>Πρόσθεσε σε ημερολόγιο</div>
          {row('Google Calendar',()=>openExt(links.google),<Calendar size={15}/>)}
          {row('Outlook',()=>openExt(links.outlook),<Calendar size={15}/>)}
          {row('Office 365',()=>openExt(links.office),<Calendar size={15}/>)}
          {row('Apple / λήψη .ics',()=>downloadEventIcs(event),<Download size={15}/>)}
          {row('Yahoo',()=>openExt(links.yahoo),<Calendar size={15}/>)}
          <div style={{ height:1,background:'var(--border-subtle)',margin:'6px 8px' }}/>
          <div style={{ fontSize:10.5,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'2px 12px 4px',fontFamily:"'Inter',sans-serif" }}>Κοινοποίηση</div>
          {row('WhatsApp',()=>openExt(links.whatsapp),<Share2 size={15}/>)}
          {row('Viber',()=>openExt(links.viber),<Share2 size={15}/>)}
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
  const due     = daysUntil(event.event_date)
  const tooltipText = [
    event.notes?`${event.notes}`:'',
    event.recurring?`Επαναλαμβάνεται: ${RECURRING_OPTIONS.find(o=>o.value===event.recurring_interval)?.label??''}` : '',
    isAuto?`Δημιουργήθηκε αυτόματα`:'',
  ].filter(Boolean).join('\n')
  const relLbl = (n:number) => { const a=Math.abs(n); return a===1?'1 ημέρα':`${a} ημέρες` }

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px',
      background: selected?'var(--accent-dim)':done?'var(--bg-elevated)':'var(--bg-surface)',
      border:`1px solid ${selected?'var(--border-accent)':overdue?'var(--negative-border)':'var(--border-subtle)'}`,
      borderLeft:`3px solid ${overdue?'var(--negative)':'var(--border-subtle)'}`,
      borderRadius:8, opacity:done?0.6:1, transition:'all 0.15s', boxShadow:'var(--shadow-sm)',
    }}>
      {bulkMode&&onSelect&&(
        <button onClick={()=>onSelect(event.id)} style={{ background:'none', border:'none', cursor:'pointer', color:selected?'var(--accent)':'var(--text-tertiary)', padding:0, display:'flex', flexShrink:0, marginTop:1 }}>
          {selected?<CheckSquare size={15}/>:<Square size={15}/>}
        </button>
      )}
      {!bulkMode&&(
        <button onClick={()=>onToggleStatus(event)} style={{ marginTop:1, flexShrink:0, width:18, height:18, borderRadius:'50%', border:`2px solid ${done?'var(--positive)':'var(--border-default)'}`, background:done?'var(--positive)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s' }}>
          {done&&<Check size={9} color="var(--accent-text)"/>}
        </button>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
          <span style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:500, color:done?'var(--text-tertiary)':'var(--text-primary)', textDecoration:done?'line-through':'none', letterSpacing:'0.1px' }}>
            {event.title}
          </span>
          <CategoryBadge cat={event.category}/>
          <PriorityTag priority={event.priority}/>
          <SourceBadge source={event.source}/>
          {event.recurring&&<Tooltip text="Επαναλαμβανόμενο"><RotateCcw size={10} color="var(--text-tertiary)"/></Tooltip>}
          {tooltipText&&<Tooltip text={tooltipText}><Info size={10} color="var(--text-tertiary)" style={{ cursor:'help' }}/></Tooltip>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <StatusDot status={event.status}/>
          {event.amount!=null&&(
            <span style={{ fontSize:13, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)', fontWeight:500 }}>
              {event.amount.toLocaleString('el-GR',{style:'currency',currency:'EUR'})}
            </span>
          )}
          {event.attachment_url&&(
            <a href={event.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--accent)', display:'flex', alignItems:'center', gap:2, fontFamily:"'Inter',sans-serif" }}>
              Σύνδεσμος <ArrowRight size={9}/>
            </a>
          )}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
        <span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:overdue?'var(--negative)':due<=3&&!done?'var(--warning)':'var(--text-secondary)' }}>
          {overdue?`πριν ${relLbl(due)}`:due===0?'Σήμερα':fmt(event.event_date)}{event.event_time?` · ${event.event_time}`:''}
        </span>
        {!done&&due>=0&&due<=7&&(
          <span style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:500, color:due===0?'var(--negative)':due<=3?'var(--warning)':'var(--accent)', background:due===0?'var(--negative-dim)':'var(--accent-dim)', padding:'2px 8px', borderRadius:12 }}>
            {due===0?'Σήμερα':`σε ${relLbl(due)}`}
          </span>
        )}
        {!bulkMode&&(
          <div style={{ display:'flex', gap:2, alignItems:'center' }}>
            <AddToCalendarMenu event={event}/>
            {!isAuto&&<>
              <button title="Επεξεργασία" onClick={()=>onEdit(event)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', padding:4, display:'flex', borderRadius:4 }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--text-primary)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}><Edit2 size={13}/></button>
              <button title="Διαγραφή" onClick={()=>onDelete(event.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', padding:4, display:'flex', borderRadius:4 }}
                onMouseEnter={e=>e.currentTarget.style.color='var(--negative)'}
                onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}><Trash2 size={13}/></button>
            </>}
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

// Month View
function MonthView({ events, currentDate, onDayClick, onEventClick, upcomingAll, drag }: {
  events: CalEvent[]; currentDate: Date; onDayClick:(date:string)=>void; onEventClick:(e:CalEvent)=>void; upcomingAll:CalEvent[]; drag?:DragCtl
}) {
  const year=currentDate.getFullYear(); const month=currentDate.getMonth()
  const firstDay=new Date(year,month,1).getDay()
  const daysInMonth=new Date(year,month+1,0).getDate()
  const today=todayStr()
  const cells:(number|null)[] = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let i=1;i<=daysInMonth;i++) cells.push(i)
  while(cells.length%7!==0) cells.push(null)
  const eventsForDay=(day:number)=>{ const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; return events.filter(e=>e.event_date===ds) }
  const upcoming7=upcomingAll.filter(e=>e.status==='pending'&&daysUntil(e.event_date)>=0).sort((a,b)=>a.event_date.localeCompare(b.event_date)).slice(0,7)
  const monthPendingAmt=events.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const monthPaid=events.filter(e=>e.status==='paid')

  return (
    <div className="cal-layout" style={{ display:'flex', gap:12 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, padding:'8px 16px', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-elevated)' }}>
            <span style={{ fontSize:12, fontFamily:"'Inter',sans-serif", color:'var(--text-secondary)', letterSpacing:'0.4px' }}>{events.length} γεγονότα</span>
            {monthPendingAmt>0&&<span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)' }}>{monthPendingAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'})} εκκρεμή</span>}
            <span style={{ fontSize:12, fontFamily:"'Inter',sans-serif", color:'var(--text-secondary)' }}>{monthPaid.length} πληρωμένα</span>
            <div style={{ marginLeft:'auto', display:'flex', gap:12, flexWrap:'wrap' }}>
              {Object.entries(CATEGORIES).map(([k,c])=>(
                <div key={k} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:c.color, display:'inline-block' }}/>
                  <span style={{ fontSize:11, fontFamily:"'Inter',sans-serif", color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid var(--border-subtle)' }}>
            {DAY_NAMES_GR.map(d=>(
              <div key={d} style={{ padding:'8px 0', textAlign:'center', fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>{d}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
            {cells.map((day,idx)=>{
              const dateStr=day?`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`:''
              const dayEvents=day?eventsForDay(day):[]
              const isToday=dateStr===today
              const hasOverdue=dayEvents.some(isOverdue)
              const dayAmt=dayEvents.filter(e=>e.amount&&e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
              const hol=day?holidayName(dateStr):null
              const wknd=day?isWeekend(dateStr):false
              const cellBg=isToday?'var(--accent-dim)':hol?'color-mix(in srgb, var(--accent) 5%, transparent)':wknd?'color-mix(in srgb, var(--text-tertiary) 5%, transparent)':'transparent'
              return (
                <div key={idx} onClick={()=>day&&onDayClick(dateStr)} data-drop-date={day?dateStr:undefined} style={{ minHeight:80, padding:'6px', borderRight:(idx+1)%7===0?'none':'1px solid var(--border-subtle)', borderBottom:idx<cells.length-7?'1px solid var(--border-subtle)':'none', background:cellBg, cursor:day?'pointer':'default', transition:'background 0.1s' }}
                  onMouseEnter={e=>{if(day)(e.currentTarget as HTMLElement).style.background=isToday?'var(--accent-dim)':'var(--bg-hover)'}}
                  onMouseLeave={e=>{if(day)(e.currentTarget as HTMLElement).style.background=cellBg}}
                >
                  {day&&(
                    <>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:isToday?700:400, color:isToday?'var(--accent)':wknd||hol?'var(--text-tertiary)':'var(--text-secondary)', width:24, height:24, borderRadius:'50%', background:isToday?'var(--accent-dim)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>{day}</span>
                        {hasOverdue&&<span style={{ width:6, height:6, borderRadius:'50%', background:'var(--negative)' }}/>}
                      </div>
                      {hol&&<div title={hol} style={{ fontSize:9.5, color:'var(--accent)', fontWeight:600, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{hol}</div>}
                      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        {dayEvents.slice(0,3).map(ev=>(
                          <Tooltip key={ev.id} text={`${ev.title}${ev.event_time?` · ${ev.event_time}`:''}${ev.amount?` · ${ev.amount.toLocaleString('el-GR',{style:'currency',currency:'EUR'})}` :''}${ev._virtual?'\n(επαναλαμβανόμενο)':''}${ev.notes?`\n${ev.notes}`:''}`}>
                            <div onPointerDown={!ev._virtual&&drag?drag.onDown(ev.id,ev.title):undefined} onClick={e=>{e.stopPropagation();onEventClick(ev)}} style={{ touchAction:'none', fontSize:11, padding:'1px 5px', borderRadius:4, background:CATEGORIES[ev.category].bg, color:CATEGORIES[ev.category].color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:ev._virtual?'pointer':'grab', width:'100%', opacity:ev.status==='paid'?0.4:ev._virtual?0.72:1, textDecoration:ev.status==='paid'?'line-through':'none', fontFamily:"'Inter',sans-serif", letterSpacing:'0.25px' }}>
                              {(ev.recurring||ev._virtual)&&<RotateCcw size={9} style={{ marginRight:3, verticalAlign:'middle', opacity:0.7 }}/>}{ev.event_time?ev.event_time+' ':''}{ev.title}
                            </div>
                          </Tooltip>
                        ))}
                        {dayEvents.length>3&&<span style={{ fontSize:10, color:'var(--text-tertiary)', paddingLeft:3, fontFamily:"'Inter',sans-serif" }}>+{dayEvents.length-3} ακόμα</span>}
                      </div>
                      {dayAmt>0&&<div style={{ marginTop:2 }}><span style={{ fontSize:10, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)', opacity:0.8 }}>{Math.round(dayAmt).toLocaleString('el-GR')} €</span></div>}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="cal-rail" style={{ width:200, flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12, boxShadow:'var(--shadow-sm)' }}>
          <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--accent)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>Επόμενα</p>
          {upcoming7.length===0&&<p style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Κανένα εκκρεμές</p>}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {upcoming7.map(ev=>{
              const d=daysUntil(ev.event_date); const cat=CATEGORIES[ev.category]
              return (
                <div key={ev.id} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <div style={{ width:3, borderRadius:2, background:cat.color, alignSelf:'stretch', flexShrink:0, minHeight:28 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{ev.title}</p>
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <span style={{ fontSize:11, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:d===0?'var(--negative)':d<=3?'var(--warning)':'var(--text-secondary)' }}>{d===0?'Σήμερα':d===1?'Αύριο':`${d}μ`}</span>
                      {ev.amount&&<span style={{ fontSize:11, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)' }}>{ev.amount}€</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12 }}>
          <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>{MONTH_SHORT_GR[currentDate.getMonth()]}</p>
          {Object.entries(CATEGORIES).map(([k,cat])=>{ const cnt=events.filter(e=>e.category===k).length; if(cnt===0)return null; return (<div key={k} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}><span style={{ color:cat.color, display:'flex' }}>{cat.icon}</span><span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", flex:1 }}>{cat.label}</span><span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", color:'var(--text-secondary)' }}>{cnt}</span></div>) })}
        </div>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12 }}>
          <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>Ετήσια δραστηριότητα</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:3 }}>
            {MONTH_SHORT_GR.map((m,mIdx)=>{ const cnt=upcomingAll.filter(e=>{const d=new Date(e.event_date);return d.getMonth()===mIdx&&d.getFullYear()===currentDate.getFullYear()}).length; const intensity=cnt===0?0:cnt<=2?0.2:cnt<=5?0.5:1; const isCur=mIdx===currentDate.getMonth(); return (
              <Tooltip key={m} text={`${m}: ${cnt} γεγονότα`}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ width:'100%', aspectRatio:'1', borderRadius:3, background:`rgba(25,103,210,${intensity})`, border:isCur?'1px solid var(--border-accent)':'1px solid transparent', marginBottom:2 }}/>
                  <span style={{ fontSize:7, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{m.slice(0,1)}</span>
                </div>
              </Tooltip>
            )})}
          </div>
        </div>
      </div>
    </div>
  )
}

// Week View
function WeekView({ events, currentDate, onDayClick, onSlotClick, onEventClick, drag }: { events:CalEvent[]; currentDate:Date; onDayClick:(date:string)=>void; onSlotClick:(date:string,time:string)=>void; onEventClick:(e:CalEvent)=>void; drag?:DragCtl }) {
  const d=new Date(currentDate); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); d.setDate(diff)
  const weekDays=Array.from({length:7},(_,i)=>{ const nd=new Date(d); nd.setDate(d.getDate()+i); return nd })
  const dsOf=(dt:Date)=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  const today=todayStr()
  const weekHasToday=weekDays.some(wd=>dsOf(wd)===today)
  const HOURS=Array.from({length:16},(_,i)=>i+7) // 07:00–22:00
  const GRID='56px repeat(7, minmax(116px, 1fr))'
  const hasAllDay=weekDays.some(wd=>events.some(e=>e.event_date===dsOf(wd)&&!e.event_time))
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
      <div style={{ overflowX:'auto' }}>
        <div style={{ minWidth:868 }}>
          {/* Επικεφαλίδες ημερών */}
          <div style={{ display:'grid', gridTemplateColumns:GRID, borderBottom:'1px solid var(--border-subtle)', position:'sticky', top:0, background:'var(--bg-elevated)', zIndex:1 }}>
            <div/>
            {weekDays.map((wd,idx)=>{ const ds=dsOf(wd); const isToday=ds===today; const hol=holidayName(ds); return (
              <div key={idx} onClick={()=>onDayClick(ds)} title={hol?`Αργία: ${hol}`:'Νέο ολοήμερο γεγονός'} style={{ padding:'10px 6px 8px', textAlign:'center', cursor:'pointer', borderLeft:'1px solid var(--border-subtle)', background:hol?'color-mix(in srgb, var(--accent) 5%, transparent)':isWeekend(ds)?'color-mix(in srgb, var(--text-tertiary) 4%, transparent)':'transparent' }}>
                <p style={{ fontSize:11, fontWeight:600, color:isToday?'var(--accent)':'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', fontFamily:"'Inter',sans-serif" }}>{DAY_NAMES_GR[idx===6?0:idx+1]}</p>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, marginTop:3, borderRadius:'50%', fontSize:15, fontWeight:isToday?700:500, background:isToday?'var(--accent)':'transparent', color:isToday?'var(--accent-text)':'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>{wd.getDate()}</span>
                {hol&&<p title={hol} style={{ fontSize:9, color:'var(--accent)', fontWeight:600, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{hol}</p>}
              </div>
            )})}
          </div>
          {/* Ολοήμερα */}
          {hasAllDay&&(
            <div style={{ display:'grid', gridTemplateColumns:GRID, borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-surface)' }}>
              <div style={{ fontSize:10, color:'var(--text-tertiary)', textAlign:'right', padding:'6px 8px', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Inter',sans-serif" }}>Ολοήμερα</div>
              {weekDays.map((wd,idx)=>{ const ds=dsOf(wd); const evs=events.filter(e=>e.event_date===ds&&!e.event_time); return (
                <div key={idx} data-drop-date={ds} data-drop-time="" style={{ borderLeft:'1px solid var(--border-subtle)', padding:4, display:'flex', flexDirection:'column', gap:3, minHeight:28 }}>
                  {evs.map(ev=>(
                    <button key={ev.id} onPointerDown={!ev._virtual&&drag?drag.onDown(ev.id,ev.title):undefined} onClick={()=>onEventClick(ev)} title={ev.title} style={{ touchAction:'none', display:'block', width:'100%', textAlign:'left', fontSize:11, padding:'3px 7px', borderRadius:7, border:'none', borderLeft:'3px solid '+(isOverdue(ev)?'var(--negative)':'var(--accent)'), background:isOverdue(ev)?'var(--negative-soft)':'var(--accent-soft)', color:'var(--text-primary)', cursor:ev._virtual?'pointer':'grab', opacity:ev.status==='paid'?0.5:ev._virtual?0.75:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{(ev.recurring||ev._virtual)&&<RotateCcw size={9} style={{ marginRight:3, verticalAlign:'middle', opacity:0.7 }}/>}{ev.title}</button>
                  ))}
                </div>
              )})}
            </div>
          )}
          {/* Πλέγμα ωρών */}
          <div style={{ maxHeight:560, overflowY:'auto' }}>
            {HOURS.map(h=>{ const hh=String(h).padStart(2,'0'); return (
              <div key={h} style={{ display:'grid', gridTemplateColumns:GRID, minHeight:46, borderBottom:'1px solid var(--border-subtle)', position:'relative' }}>
                <NowLine show={weekHasToday} hour={h} gutter={56}/>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', textAlign:'right', padding:'4px 8px', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>{hh}:00</div>
                {weekDays.map((wd,idx)=>{ const ds=dsOf(wd); const isToday=ds===today; const evs=events.filter(e=>e.event_date===ds&&!!e.event_time&&parseInt((e.event_time||'0:0').split(':')[0])===h); return (
                  <div key={idx} onClick={()=>onSlotClick(ds,`${hh}:00`)} data-drop-date={ds} data-drop-time={`${hh}:00`} title="Κλικ για νέο ραντεβού" style={{ borderLeft:'1px solid var(--border-subtle)', padding:3, cursor:'pointer', display:'flex', flexDirection:'column', gap:3, background:isToday?'color-mix(in srgb, var(--accent) 4%, transparent)':'transparent' }}>
                    {evs.map(ev=>(
                      <button key={ev.id} onPointerDown={!ev._virtual&&drag?drag.onDown(ev.id,ev.title):undefined} onClick={e=>{e.stopPropagation();onEventClick(ev)}} title={`${ev.event_time} ${ev.title}`} style={{ touchAction:'none', display:'block', width:'100%', textAlign:'left', fontSize:11, padding:'4px 7px', borderRadius:7, border:'none', borderLeft:'3px solid var(--accent)', background:'var(--accent-soft)', color:'var(--text-primary)', cursor:ev._virtual?'pointer':'grab', opacity:ev.status==='paid'?0.5:ev._virtual?0.75:1, overflow:'hidden', fontFamily:"'Inter',sans-serif" }}>
                        <span style={{ color:'var(--accent)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{ev.event_time}</span> <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{ev.title}</span>
                      </button>
                    ))}
                  </div>
                )})}
              </div>
            )})}
          </div>
        </div>
      </div>
    </div>
  )
}

// Timeline View
function TimelineView({ events, currentYear, onYearChange }: { events:CalEvent[]; currentYear:number; onYearChange:(y:number)=>void }) {
  const today=new Date(); const todayMonth=today.getMonth()
  const totalAmt=events.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const paidAmt=events.filter(e=>e.status==='paid').reduce((s,e)=>s+(e.amount||0),0)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:12 }}>
        {[
          { label:'Σύνολο εκκρεμή', value:totalAmt>0?totalAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'—', color:'var(--accent)' },
          { label:'Ήδη πληρώθηκαν', value:paidAmt>0?paidAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'—', color:'var(--text-primary)' },
          { label:'Γεγονότα έτους', value:`${events.length}`, color:'var(--text-primary)' },
        ].map(s=>(
          <div key={s.label} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'12px 16px', boxShadow:'var(--shadow-sm)' }}>
            <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:4 }}>{s.label}</p>
            <p style={{ fontSize:18, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:s.color, fontWeight:400 }}>{s.value}</p>
          </div>
        ))}
      </div>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:20, boxShadow:'var(--shadow-sm)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={()=>onYearChange(currentYear-1)} style={{ width:32, height:32, borderRadius:16, border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><ChevronLeft size={16}/></button>
            <p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-primary)', letterSpacing:'0.1px' }}>Ετήσιος ορίζοντας {currentYear}</p>
            <button onClick={()=>onYearChange(currentYear+1)} style={{ width:32, height:32, borderRadius:16, border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><ChevronRight size={16}/></button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:6 }}>
          {MONTH_SHORT_GR.map((mName,mIdx)=>{
            const monthEvs=events.filter(e=>{const d=new Date(e.event_date);return d.getFullYear()===currentYear&&d.getMonth()===mIdx})
            const isCurrentMonth=mIdx===todayMonth&&currentYear===today.getFullYear()
            const isPast=currentYear<today.getFullYear()||(currentYear===today.getFullYear()&&mIdx<todayMonth)
            const pending=monthEvs.filter(e=>e.status==='pending')
            const totalM=pending.reduce((s,e)=>s+(e.amount||0),0)
            const overdueCount=monthEvs.filter(isOverdue).length
            return (
              <div key={mIdx} style={{ background:isCurrentMonth?'var(--accent-dim)':isPast?'var(--bg-elevated)':'var(--bg-elevated)', border:`1px solid ${isCurrentMonth?'var(--border-accent)':overdueCount>0?'var(--negative-border)':'var(--border-subtle)'}`, borderRadius:8, padding:'8px 5px', minHeight:100 }}>
                <p style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:500, color:isCurrentMonth?'var(--accent)':isPast?'var(--text-tertiary)':'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:6, textAlign:'center' }}>{mName}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  {monthEvs.slice(0,7).map(ev=>(
                    <Tooltip key={ev.id} text={`${ev.title}${ev.amount?` · ${ev.amount}€`:''}`}>
                      <div style={{ width:'100%', height:4, borderRadius:2, background:CATEGORIES[ev.category].color, opacity:ev.status==='paid'?0.2:isPast?0.5:1 }}/>
                    </Tooltip>
                  ))}
                  {monthEvs.length>7&&<span style={{ fontSize:9, color:'var(--text-tertiary)', textAlign:'center', fontFamily:"'Inter',sans-serif" }}>+{monthEvs.length-7}</span>}
                </div>
                {totalM>0&&<p style={{ fontSize:10, color:'var(--accent)', textAlign:'center', marginTop:5, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums' }}>{Math.round(totalM).toLocaleString('el-GR')} €</p>}
                {monthEvs.length===0&&<p style={{ fontSize:9, color:'var(--text-tertiary)', textAlign:'center', fontFamily:"'Inter',sans-serif" }}>—</p>}
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:14, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
          {Object.entries(CATEGORIES).map(([key,cat])=>(
            <div key={key} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:10, height:4, borderRadius:2, background:cat.color, display:'inline-block' }}/>
              <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", letterSpacing:'0.25px' }}>{cat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Auto-Pull Panel
function AutoPullPanel({ propertyId, userId, onRefresh }: { propertyId:string; userId:string; onRefresh:()=>void }) {
  const supabase=createClient()
  const [syncing,setSyncing]=useState(false)
  const [sources,setSources]=useState({bills:true,loan:true,rent:true})
  const [lastSync,setLastSync]=useState<string|null>(null)
  const [msg,setMsg]=useState('')

  async function syncAll() {
    setSyncing(true); setMsg(''); let count=0
    if(sources.bills){
      const{data:bills}=await supabase.from('bills').select('*').eq('property_id',propertyId)
      if(bills?.length){
        await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source','bills')
        const today=new Date()
        const billEvents=bills.filter((b:any)=>b.due_date||b.next_due_date).map((b:any)=>{
          let dueDate=b.due_date||b.next_due_date; const d=new Date(dueDate)
          if(d<today){d.setMonth(today.getMonth());d.setFullYear(today.getFullYear());if(d<today)d.setMonth(d.getMonth()+1);dueDate=d.toISOString().split('T')[0]}
          return{property_id:propertyId,user_id:userId,title:b.name||b.provider||'Λογαριασμός',category:'bills' as EventCategory,event_date:dueDate,amount:b.amount||null,priority:'medium' as EventPriority,status:(b.paid?'paid':'pending') as EventStatus,recurring:true,recurring_interval:'monthly',notes:b.category?`Κατηγορία: ${b.category}`:null,source:'bills'}
        })
        if(billEvents.length){await supabase.from('calendar_events').insert(billEvents);count+=billEvents.length}
      }
    }
    if(sources.loan){
      const{data:tasks}=await supabase.from('maintenance_tasks').select('*').eq('property_id',propertyId)
      if(tasks?.length){
        await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source','loan')
        const taskEvents=tasks.map((t:any)=>({property_id:propertyId,user_id:userId,title:t.title,category:'maintenance' as EventCategory,event_date:t.due_date,amount:null,priority:(t.priority||'medium') as EventPriority,status:(t.completed?'paid':'pending') as EventStatus,recurring:false,notes:t.description||null,source:'loan'}))
        await supabase.from('calendar_events').insert(taskEvents); count+=taskEvents.length
      }
    }
    if(sources.rent){
      const{data:prop}=await supabase.from('properties').select('monthly_rent,rent_day').eq('id',propertyId).maybeSingle()
      if(prop?.monthly_rent){
        await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source','rent')
        const rentDay=prop.rent_day||1; const today2=new Date()
        const rentEvents=Array.from({length:12},(_,i)=>{const d=new Date(today2.getFullYear(),today2.getMonth()+i,rentDay);return{property_id:propertyId,user_id:userId,title:'Είσπραξη Ενοικίου',category:'financial' as EventCategory,event_date:d.toISOString().split('T')[0],amount:prop.monthly_rent,priority:'high' as EventPriority,status:'pending' as EventStatus,recurring:true,recurring_interval:'monthly',notes:'Auto-pulled από στοιχεία ακινήτου',source:'rent'}})
        await supabase.from('calendar_events').insert(rentEvents); count+=rentEvents.length
      }
    }
    setLastSync(new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}))
    setMsg(`Συγχρονίστηκαν ${count} γεγονότα`)
    setSyncing(false); onRefresh()
  }

  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16, boxShadow:'var(--shadow-sm)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-primary)', letterSpacing:'0.1px' }}>Αυτόματος συγχρονισμός</p>
          {lastSync&&<p style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", marginTop:2 }}>Τελευταίος συγχρονισμός: {lastSync}</p>}
        </div>
        <button onClick={syncAll} disabled={syncing} style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 16px', background:syncing?'transparent':'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:18, cursor:syncing?'not-allowed':'pointer', color:'var(--accent)', fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500 }}>
          <RefreshCw size={14} style={{ animation:syncing?'spin 1s linear infinite':'none' }}/>{syncing?'Συγχρονισμός…':'Συγχρονισμός τώρα'}
        </button>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[{key:'bills',label:'Λογαριασμοί',icon:<Zap size={13}/>,desc:'Από τους λογαριασμούς'},{key:'loan',label:'Συντήρηση',icon:<Wrench size={13}/>,desc:'Εργασίες συντήρησης'},{key:'rent',label:'Ενοίκιο',icon:<Euro size={13}/>,desc:'12 μήνες'}].map(({key,label,icon,desc})=>{
          const active=sources[key as keyof typeof sources]
          return (
            <button key={key} onClick={()=>setSources(s=>({...s,[key]:!s[key as keyof typeof sources]}))} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:active?'var(--accent-dim)':'var(--bg-elevated)', border:`1px solid ${active?'var(--accent)':'var(--border-default)'}`, borderRadius:8, cursor:'pointer' }}>
              <span style={{ color:active?'var(--accent)':'var(--text-tertiary)' }}>{icon}</span>
              <div style={{ textAlign:'left' }}>
                <p style={{ fontSize:13, fontFamily:"'Inter',sans-serif", color:active?'var(--accent)':'var(--text-secondary)' }}>{label}</p>
                <p style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{desc}</p>
              </div>
              <span style={{ color:active?'var(--accent)':'var(--text-tertiary)' }}>{active?<ToggleRight size={16}/>:<ToggleLeft size={16}/>}</span>
            </button>
          )
        })}
      </div>
      {msg&&<p style={{ marginTop:8, fontSize:13, fontFamily:"'Inter',sans-serif", color:'var(--text-secondary)' }}>{msg}</p>}
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
      <button ref={ref} type="button" onClick={openMenu} style={{ width:'100%', boxSizing:'border-box', height:44, background:'var(--bg-surface)', border:'1px solid '+(open?'var(--accent)':'var(--border-subtle)'), borderRadius:12, padding:'0 12px', color:value?'var(--text-primary)':'var(--text-tertiary)', fontSize:14, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', outline:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, transition:'border-color 0.15s' }}>
        <span>{value||'--:--'}</span><Clock size={15} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>
      </button>
      {open&&rect&&createPortal(
        <div ref={listRef} style={{ position:'fixed', left:rect.left, top:rect.top, width:rect.width, maxHeight:244, overflowY:'auto', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,0.35)', padding:5, zIndex:2000 }}>
          <button type="button" onClick={()=>{ onChange(''); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:'transparent', color:'var(--text-tertiary)', fontSize:13, fontFamily:"'Inter',sans-serif", borderRadius:8, cursor:'pointer' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Καμία ώρα</button>
          {times.map(t=>{ const active=t===value; return (
            <button key={t} type="button" onClick={()=>{ onChange(t); setOpen(false) }} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 12px', border:'none', background:active?'var(--accent-soft)':'transparent', color:active?'var(--accent)':'var(--text-primary)', fontSize:13.5, fontWeight:active?600:400, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', borderRadius:8, cursor:'pointer' }} onMouseEnter={e=>{ if(!active)e.currentTarget.style.background='var(--bg-hover)' }} onMouseLeave={e=>{ if(!active)e.currentTarget.style.background='transparent' }}>{t}</button>
          )})}
        </div>,
        document.body
      )}
    </>
  )
}

// Event Modal
function EventModal({ form, setForm, onSave, onClose, editing, saving, conflicts, freeSlots }: {
  form:FormState; setForm:React.Dispatch<React.SetStateAction<FormState>>
  onSave:()=>void; onClose:()=>void; editing:boolean; saving:boolean; conflicts?:number; freeSlots?:string[]
}) {
  const [showDetails,setShowDetails]=useState(editing)
  // Προσβασιμότητα: Escape κλείνει, Cmd/Ctrl+Enter αποθηκεύει.
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if(e.key==='Escape')onClose(); if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&form.title.trim()&&form.event_date)onSave() }; document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h) },[onClose,onSave,form.title,form.event_date])
  // Ενιαία, καθαρά πεδία — ίδιο ύψος/καμπύλη/χρώμα παντού (Google λογική).
  const fld: React.CSSProperties = { width:'100%', boxSizing:'border-box', height:44, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'0 14px', color:'var(--text-primary)', fontSize:14, fontFamily:"'Inter',sans-serif", outline:'none', transition:'border-color 0.15s' }
  const focus=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>e.currentTarget.style.borderColor='var(--accent)'
  const blur=(e:React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>e.currentTarget.style.borderColor='var(--border-subtle)'
  const chevron="url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%239aa0a6'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")"
  const sel: React.CSSProperties = {...fld, appearance:'none' as any, cursor:'pointer', backgroundImage:chevron, backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:34}
  const lbl: React.CSSProperties = { fontFamily:"'Inter',sans-serif", fontSize:11, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:6 }
  const amt=parseFloat(form.amount)
  const canSave=!!form.title.trim()&&!!form.event_date
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cal-modal-title" onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-elevated)', borderRadius:22, width:'100%', maxWidth:480, maxHeight:'92vh', border:'1px solid var(--border-subtle)', boxShadow:'0 24px 70px rgba(0,0,0,0.45)', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 22px 14px', borderBottom:'1px solid var(--border-subtle)', flexShrink:0 }}>
          <h3 id="cal-modal-title" style={{ fontFamily:"'Inter',sans-serif", fontSize:17, fontWeight:700, color:'var(--text-primary)', margin:0 }}>{editing?'Επεξεργασία':'Νέο γεγονός'}</h3>
          <button aria-label="Κλείσιμο" onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><X size={17}/></button>
        </div>

        {/* Body */}
        <div style={{ padding:'18px 22px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
          {/* Τίτλος + έξυπνη ανάγνωση φυσικής γλώσσας (quick-add) */}
          <div>
            <input autoFocus value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} onFocus={focus} onBlur={blur} placeholder="π.χ. Service λέβητα Παρασκευή 10πμ" style={{...fld, height:48, fontSize:16, fontWeight:500}}/>
            {(()=>{ if(editing)return null; const qa=parseQuickAdd(form.title, new Date()); const hasExtra=!!(qa.date||qa.time)&&(qa.date!==form.event_date||qa.time!==(form.event_time||null)||qa.title!==form.title); if(!hasExtra)return null
              const dLbl=qa.date?new Date(qa.date).toLocaleDateString('el-GR',{weekday:'short',day:'numeric',month:'short'}):''
              return (
                <button onClick={()=>setForm(f=>({...f,title:qa.title,event_date:qa.date||f.event_date,event_time:qa.time||f.event_time}))} style={{ display:'flex', alignItems:'center', gap:7, marginTop:8, padding:'7px 12px', borderRadius:10, border:'1px solid var(--accent-border)', background:'var(--accent-soft)', color:'var(--accent)', fontSize:12.5, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", width:'100%', textAlign:'left' }}>
                  <Zap size={13}/>Ορισμός: {[dLbl,qa.time].filter(Boolean).join(' · ')} — «{qa.title}»
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
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--accent)', fontFamily:"'Inter',sans-serif", marginTop:-4 }}>
              <Info size={13}/>{holidayName(form.event_date)?`Αργία: ${holidayName(form.event_date)}`:'Σαββατοκύριακο'}
            </div>
          )}
          {form.event_time&&!!conflicts&&conflicts>0&&(
            <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12.5, color:'var(--warning)', background:'var(--warning-dim)', border:'1px solid var(--warning-border)', borderRadius:10, padding:'8px 12px', fontFamily:"'Inter',sans-serif" }}>
              <AlertTriangle size={14}/>Έχεις ήδη {conflicts===1?'ένα γεγονός':`${conflicts} γεγονότα`} εκείνη την ώρα.
            </div>
          )}
          {/* Πρότεινε ελεύθερη ώρα */}
          {!form.event_time&&!!freeSlots&&freeSlots.length>0&&(
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:5 }}><Clock size={13}/>Ελεύθερες ώρες:</span>
              {freeSlots.map(s=>(
                <button key={s} onClick={()=>setForm(f=>({...f,event_time:s}))} style={{ height:28, padding:'0 12px', borderRadius:14, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--accent)', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.background='var(--accent-soft)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.background='var(--bg-surface)'}}>{s}</button>
              ))}
            </div>
          )}

          {/* Λεπτομέρειες (progressive) */}
          <button onClick={()=>setShowDetails(s=>!s)} style={{ display:'flex', alignItems:'center', gap:6, alignSelf:'flex-start', background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', fontSize:13, fontWeight:500, fontFamily:"'Inter',sans-serif", padding:'2px 0' }}>
            <ChevronDown size={15} style={{ transform:showDetails?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>{showDetails?'Λιγότερα':'Λεπτομέρειες'}
          </button>

          {showDetails&&(<>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={lbl}>Κατηγορία</label>
                <select style={sel} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value as EventCategory}))} onFocus={focus} onBlur={blur}>{Object.entries(CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
              </div>
              <div>
                <label style={lbl}>Προτεραιότητα</label>
                <select style={sel} value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value as EventPriority}))} onFocus={focus} onBlur={blur}>{Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={lbl}>Ποσό (€)</label>
                <input type="number" style={fld} placeholder="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} onFocus={focus} onBlur={blur}/>
              </div>
              {form.event_time&&(
                <div>
                  <label style={lbl}>Διάρκεια</label>
                  <select style={sel} value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} onFocus={focus} onBlur={blur}>
                    <option value="">—</option><option value="30">30 λεπτά</option><option value="60">1 ώρα</option><option value="90">1 ώρα 30 λεπτά</option><option value="120">2 ώρες</option><option value="180">3 ώρες</option>
                  </select>
                </div>
              )}
            </div>
            {/* Κύκλωμα: κόστος → δαπάνη */}
            {amt>0&&!editing&&(
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'10px 12px', borderRadius:10, background:form.add_expense?'var(--accent-soft)':'var(--bg-surface)', border:'1px solid '+(form.add_expense?'var(--accent-border)':'var(--border-subtle)'), transition:'all 0.15s' }}>
                <input type="checkbox" checked={form.add_expense} onChange={e=>setForm(f=>({...f,add_expense:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--accent)', cursor:'pointer' }}/>
                <span style={{ fontSize:12.5, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>Καταχώρησέ το και στις <strong>Δαπάνες</strong> & τον <strong>Προϋπολογισμό</strong> ({amt.toLocaleString('el-GR')} €)</span>
              </label>
            )}
            {/* Επικοινωνία */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <label style={lbl}>Τηλέφωνο</label>
                <input type="tel" style={fld} placeholder="69…" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} onFocus={focus} onBlur={blur}/>
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input type="email" style={fld} placeholder="name@…" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} onFocus={focus} onBlur={blur}/>
              </div>
            </div>
            <div>
              <label style={lbl}>Σύνδεσμος (τιμολόγιο, σύμβαση)</label>
              <input style={fld} placeholder="https://…" value={form.attachment_url} onChange={e=>setForm(f=>({...f,attachment_url:e.target.value}))} onFocus={focus} onBlur={blur}/>
            </div>
            {/* Κατάσταση */}
            <div>
              <label style={lbl}>Κατάσταση</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {Object.entries(STATUSES).map(([k,v])=>(
                  <button key={k} onClick={()=>setForm(f=>({...f,status:k as EventStatus}))} style={{ height:34, padding:'0 14px', borderRadius:17, cursor:'pointer', fontSize:12.5, fontFamily:"'Inter',sans-serif", fontWeight:500, border:`1px solid ${form.status===k?v.color:'var(--border-subtle)'}`, background:form.status===k?`${v.color}18`:'transparent', color:form.status===k?v.color:'var(--text-secondary)', transition:'all 0.15s' }}>{v.label}</button>
                ))}
              </div>
            </div>
            {/* Επανάληψη */}
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:13.5, fontWeight:500, color:'var(--text-primary)' }}>Επαναλαμβανόμενο</span>
                <div onClick={()=>setForm(f=>({...f,recurring:!f.recurring}))} style={{ width:46, height:28, borderRadius:14, background:form.recurring?'var(--accent)':'var(--border-default)', position:'relative', transition:'all 0.2s', cursor:'pointer', flexShrink:0 }}>
                  <span style={{ position:'absolute', top:2, left:form.recurring?'calc(100% - 26px)':2, width:24, height:24, borderRadius:'50%', background:'#fff', transition:'all 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }}/>
                </div>
              </div>
              {form.recurring&&(
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
                  <select style={sel} value={form.recurring_interval} onChange={e=>setForm(f=>({...f,recurring_interval:e.target.value}))} onFocus={focus} onBlur={blur}>{RECURRING_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  <select style={sel} value={form.recurrence_end_mode} onChange={e=>setForm(f=>({...f,recurrence_end_mode:e.target.value as FormState['recurrence_end_mode']}))} onFocus={focus} onBlur={blur}>
                    <option value="none">Χωρίς λήξη</option><option value="until">Μέχρι ημερομηνία</option><option value="count">Για πλήθος φορών</option>
                  </select>
                  {form.recurrence_end_mode==='until'&&<div style={{ gridColumn:'1 / -1' }}><DatePicker value={form.recurrence_until} onChange={v=>setForm(f=>({...f,recurrence_until:v}))}/></div>}
                  {form.recurrence_end_mode==='count'&&<div style={{ gridColumn:'1 / -1' }}><input type="number" min="1" style={fld} placeholder="π.χ. 12 φορές" value={form.recurrence_count} onChange={e=>setForm(f=>({...f,recurrence_count:e.target.value}))} onFocus={focus} onBlur={blur}/></div>}
                </div>
              )}
            </div>
            {/* Σημειώσεις */}
            <div>
              <label style={lbl}>Σημειώσεις</label>
              <textarea style={{...fld, height:'auto', minHeight:60, padding:'10px 14px', resize:'vertical'}} placeholder="Οδηγίες, αριθμός λογαριασμού…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} onFocus={focus} onBlur={blur}/>
            </div>
          </>)}
        </div>

        {/* Footer */}
        <div style={{ display:'flex', gap:10, padding:'14px 22px', borderTop:'1px solid var(--border-subtle)', flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, height:44, borderRadius:12, border:'1px solid var(--border-subtle)', background:'transparent', color:'var(--text-secondary)', fontSize:14, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Ακύρωση</button>
          <button onClick={onSave} disabled={saving||!canSave} style={{ flex:2, height:44, borderRadius:12, border:'none', background:canSave&&!saving?'var(--accent)':'var(--bg-surface)', color:canSave&&!saving?'var(--accent-text)':'var(--text-tertiary)', fontSize:14, fontWeight:600, cursor:canSave&&!saving?'pointer':'not-allowed', fontFamily:"'Inter',sans-serif" }}>
            {saving?'Αποθήκευση…':editing?'Αποθήκευση':'Προσθήκη'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Section
function Section({ title, color, events, onToggle, onEdit, onDelete, collapsed=false, bulkMode, selectedIds, onSelect }: {
  title:string; color:string; events:CalEvent[]; onToggle:(e:CalEvent)=>void; onEdit:(e:CalEvent)=>void; onDelete:(id:string)=>void
  collapsed?:boolean; bulkMode?:boolean; selectedIds?:Set<string>; onSelect?:(id:string)=>void
}) {
  const [open,setOpen]=useState(!collapsed)
  return (
    <div>
      <button onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', marginBottom:open?10:0, padding:0 }}>
        <span style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color, letterSpacing:'0.5px', textTransform:'uppercase' }}>{title}</span>
        <span style={{ fontSize:12, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)' }}>({events.length})</span>
        <ChevronDown size={13} color="var(--text-tertiary)" style={{ transform:open?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
      </button>
      {open&&(
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {events.map(e=>(
            <EventCard key={e.id} event={e} onToggleStatus={onToggle} onEdit={onEdit} onDelete={onDelete}
              selected={selectedIds?.has(e.id)} onSelect={onSelect} bulkMode={bulkMode}/>
          ))}
        </div>
      )}
    </div>
  )
}

// Επιλογή εμβέλειας για επαναλαμβανόμενο (επεξεργασία ή διαγραφή).
function ScopeModal({ title, hint, danger, onPick, onClose }: { title:string; hint?:string; danger?:boolean; onPick:(s:'this'|'following'|'all')=>void; onClose:()=>void }) {
  const opts:[('this'|'following'|'all'),string][]=[['this','Μόνο αυτό το γεγονός'],['following','Αυτό και τα επόμενα'],['all','Όλη τη σειρά']]
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1100, padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-elevated)', borderRadius:18, width:'100%', maxWidth:400, border:'1px solid var(--border-subtle)', boxShadow:'0 24px 64px rgba(0,0,0,0.4)', padding:'22px 24px' }}>
        <h3 style={{ fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'0 0 4px' }}>{title}</h3>
        {hint&&<p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:'0 0 16px', fontFamily:"'Inter',sans-serif" }}>{hint}</p>}
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:hint?0:14 }}>
          {opts.map(([v,label])=>(
            <button key={v} onClick={()=>onPick(v)} style={{ display:'flex', alignItems:'center', gap:10, height:46, padding:'0 16px', borderRadius:12, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', cursor:'pointer', fontSize:14, fontWeight:500, color:danger&&v==='all'?'var(--negative)':'var(--text-primary)', fontFamily:"'Inter',sans-serif", textAlign:'left', transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=danger&&v==='all'?'var(--negative)':'var(--accent)';e.currentTarget.style.background='var(--bg-elevated)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.background='var(--bg-surface)'}}>{label}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ marginTop:12, width:'100%', height:40, borderRadius:12, border:'none', background:'transparent', color:'var(--text-secondary)', fontSize:13, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Άκυρο</button>
      </div>
    </div>
  )
}

// Ζωντανή συνδρομή: το εξωτερικό ημερολόγιο διαβάζει το feed και ενημερώνεται μόνο του.
function SubscribeModal({ token, propertyId, onClose }: { token:string|null; propertyId:string; onClose:()=>void }) {
  const [copied,setCopied]=useState(false)
  const base=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'')
  const httpsUrl=token?`${base}/functions/v1/calendar-feed?token=${token}&property=${propertyId}`:''
  const webcalUrl=httpsUrl.replace(/^https?:\/\//,'webcal://')
  const googleUrl=`https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(httpsUrl)}`
  const copy=async()=>{ try{ await navigator.clipboard.writeText(httpsUrl); setCopied(true); setTimeout(()=>setCopied(false),1800) }catch{} }
  const linkBtn:React.CSSProperties={ display:'flex', alignItems:'center', justifyContent:'center', gap:8, height:44, borderRadius:12, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:14, fontWeight:500, textDecoration:'none', fontFamily:"'Inter',sans-serif", cursor:'pointer' }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-elevated)', borderRadius:20, width:'100%', maxWidth:520, border:'1px solid var(--border-subtle)', boxShadow:'0 24px 64px rgba(0,0,0,0.4)', overflow:'hidden' }}>
        <div style={{ padding:'22px 26px 16px', borderBottom:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div>
            <h3 style={{ fontFamily:"'Inter',sans-serif", fontSize:18, fontWeight:700, color:'var(--text-primary)', margin:0 }}>Ζωντανή συνδρομή ημερολογίου</h3>
            <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'6px 0 0', lineHeight:1.5, fontFamily:"'Inter',sans-serif" }}>Σύνδεσε το μία φορά και το ημερολόγιό σου ενημερώνεται αυτόματα σε Google, Apple ή Outlook — χωρίς χειροκίνητες εξαγωγές.</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'1px solid var(--border-subtle)', borderRadius:'50%', width:30, height:30, cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><X size={15}/></button>
        </div>
        <div style={{ padding:'20px 26px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {!token?(
            <div style={{ padding:'24px 0', textAlign:'center', color:'var(--text-tertiary)', fontSize:13 }}>Δημιουργία συνδέσμου…</div>
          ):(<>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:7, textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif" }}>Σύνδεσμος συνδρομής</label>
              <div style={{ display:'flex', gap:8 }}>
                <input readOnly value={httpsUrl} onFocus={e=>e.currentTarget.select()} style={{ flex:1, minWidth:0, height:40, padding:'0 12px', borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:12.5, fontFamily:"'Inter',sans-serif" }}/>
                <button onClick={copy} style={{ height:40, padding:'0 16px', borderRadius:10, border:'none', background:copied?'var(--positive)':'var(--accent)', color:'var(--accent-text)', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{copied?'Αντιγράφηκε':'Αντιγραφή'}</button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <a href={googleUrl} target="_blank" rel="noreferrer" style={linkBtn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><Calendar size={16}/>Google Calendar</a>
              <a href={webcalUrl} style={linkBtn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><CalendarDays size={16}/>Apple / Outlook</a>
            </div>
            <div style={{ display:'flex', gap:8, padding:'10px 12px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:10 }}>
              <Info size={15} color="var(--accent)" style={{ flexShrink:0, marginTop:1 }}/>
              <p style={{ fontSize:11.5, color:'var(--text-secondary)', lineHeight:1.5, margin:0, fontFamily:"'Inter',sans-serif" }}>Στο Google Calendar: «Άλλα ημερολόγια» → «Από URL» → επικόλλησε τον σύνδεσμο. Ο σύνδεσμος είναι προσωπικός — μην τον μοιράζεσαι.</p>
            </div>
          </>)}
        </div>
      </div>
    </div>
  )
}

// Προβολή Ημέρας — πλέγμα ωρών με ραντεβού. Κλικ σε ώρα → νέο γεγονός σε εκείνη την ώρα.
// Λεπτή γραμμή «τώρα» μέσα στην τρέχουσα ώρα (τοποθέτηση αναλογικά ώστε να μη
// χαλάει από γραμμές διαφορετικού ύψους). Επιστρέφει null εκτός ωραρίου/μέρας.
function NowLine({ show, hour, gutter }: { show:boolean; hour:number; gutter:number }) {
  if(!show)return null
  const now=new Date()
  if(now.getHours()!==hour)return null
  const frac=now.getMinutes()/60
  return (
    <div style={{ position:'absolute', left:gutter, right:0, top:`${frac*100}%`, height:2, background:'var(--negative)', zIndex:3, pointerEvents:'none' }}>
      <span style={{ position:'absolute', left:-5, top:-4, width:9, height:9, borderRadius:'50%', background:'var(--negative)' }}/>
    </div>
  )
}

function DayView({ events, currentDate, onSlotClick, onEventClick, drag }: {
  events:CalEvent[]; currentDate:Date; onSlotClick:(date:string,time:string)=>void; onEventClick:(e:CalEvent)=>void; drag?:DragCtl
}) {
  const y=currentDate.getFullYear(), m=currentDate.getMonth(), d=currentDate.getDate()
  const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  const isToday=dateStr===todayStr()
  const dayEvents=events.filter(e=>e.event_date===dateStr)
  const allDay=dayEvents.filter(e=>!e.event_time)
  const timed=dayEvents.filter(e=>!!e.event_time)
  const HOURS=Array.from({length:16},(_,i)=>i+7) // 07:00–22:00
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:16, boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
      {allDay.length>0&&(
        <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border-subtle)', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:11, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600, fontFamily:"'Inter',sans-serif" }}>Ολοήμερα</span>
          {allDay.map(e=>(
            <button key={e.id} onPointerDown={!e._virtual&&drag?drag.onDown(e.id,e.title):undefined} onClick={()=>onEventClick(e)} style={{ touchAction:'none', display:'flex', alignItems:'center', gap:6, height:26, padding:'0 10px', borderRadius:13, border:'1px solid var(--accent-border)', background:'var(--accent-soft)', color:'var(--accent)', fontSize:12.5, fontWeight:500, cursor:e._virtual?'pointer':'grab', opacity:e._virtual?0.75:1, fontFamily:"'Inter',sans-serif" }}>
              {(e.recurring||e._virtual)&&<RotateCcw size={10} style={{ opacity:0.7 }}/>}{e.title}{e.amount!=null?` · ${e.amount.toLocaleString('el-GR')} €`:''}
            </button>
          ))}
        </div>
      )}
      <div style={{ maxHeight:600, overflowY:'auto' }}>
        {HOURS.map(h=>{
          const hh=String(h).padStart(2,'0')
          const evs=timed.filter(e=>parseInt((e.event_time||'0:0').split(':')[0])===h)
          return (
            <div key={h} style={{ display:'flex', minHeight:54, borderBottom:'1px solid var(--border-subtle)', position:'relative' }}>
              <NowLine show={isToday} hour={h} gutter={60}/>
              <div style={{ width:60, flexShrink:0, padding:'6px 8px', textAlign:'right', fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>{hh}:00</div>
              <div onClick={()=>onSlotClick(dateStr,`${hh}:00`)} data-drop-date={dateStr} data-drop-time={`${hh}:00`} title="Κλικ για νέο ραντεβού" style={{ flex:1, minWidth:0, padding:6, cursor:'pointer', display:'flex', flexDirection:'row', flexWrap:'wrap', gap:4, borderLeft:'1px solid var(--border-subtle)' }}>
                {evs.map(e=>(
                  <button key={e.id} onPointerDown={!e._virtual&&drag?drag.onDown(e.id,e.title):undefined} onClick={ev=>{ev.stopPropagation();onEventClick(e)}} title={`${e.event_time} ${e.title}`} style={{ touchAction:'none', flex:evs.length>1?'1 1 42%':'1 1 100%', minWidth:0, display:'flex', alignItems:'center', gap:7, padding:'7px 10px', borderRadius:10, border:'none', borderLeft:'3px solid var(--accent)', background:'var(--accent-soft)', color:'var(--text-primary)', fontSize:13, fontWeight:500, cursor:e._virtual?'pointer':'grab', opacity:e._virtual?0.75:1, textAlign:'left', fontFamily:"'Inter',sans-serif" }}>
                    <span style={{ fontVariantNumeric:'tabular-nums', color:'var(--accent)', fontWeight:600, flexShrink:0 }}>{e.event_time}</span>
                    {(e.recurring||e._virtual)&&<RotateCcw size={10} style={{ opacity:0.6, flexShrink:0 }}/>}
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.title}</span>
                    {e.amount!=null&&evs.length===1&&<span style={{ marginLeft:'auto', color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{e.amount.toLocaleString('el-GR')} €</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Main Component
export default function TabCalendar({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase=createClient()
  const [events,setEvents]=useState<CalEvent[]>([])
  const [loading,setLoading]=useState(true)
  const [viewMode,setViewMode]=useState<ViewMode>('month')
  const [currentDate,setCurrentDate]=useState(new Date())
  const [showModal,setShowModal]=useState(false)
  const [editingEvent,setEditingEvent]=useState<CalEvent|null>(null)
  const [editOccDate,setEditOccDate]=useState<string|null>(null)   // ημερομηνία της συγκεκριμένης εμφάνισης
  const [scopePrompt,setScopePrompt]=useState(false)                // επιλογή εμβέλειας επεξεργασίας
  const [deleteScope,setDeleteScope]=useState<{seriesId:string;occ:string}|null>(null)
  const [form,setForm]=useState<FormState>(EMPTY_FORM)
  const [saving,setSaving]=useState(false)
  const [filterCat,setFilterCat]=useState<EventCategory|'all'>('all')
  const [filterStatus,setFilterStatus]=useState<EventStatus|'all'>('all')
  const [showFilters,setShowFilters]=useState(false)
  const [showAutoPull,setShowAutoPull]=useState(false)
  const [searchQ,setSearchQ]=useState('')
  const [bulkMode,setBulkMode]=useState(false)
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set())
  const [timelineYear,setTimelineYear]=useState(new Date().getFullYear())
  const [showMenu,setShowMenu]=useState(false)
  const [showSubscribe,setShowSubscribe]=useState(false)
  const [feedToken,setFeedToken]=useState<string|null>(null)
  const menuRef=useRef<HTMLDivElement>(null)
  const importRef=useRef<HTMLInputElement>(null)
  const [importMsg,setImportMsg]=useState<string|null>(null)
  const [notifyOn,setNotifyOn]=useState(false)
  const notifiedRef=useRef<Set<string>>(new Set())
  // Ενιαίο drag (ποντίκι + αφή) — μετακίνηση γεγονότος με σύρσιμο σε μήνα/εβδομάδα/ημέρα.
  const drag=usePointerDrag((id,date,time)=>moveEvent(id,date,time))
  // Εισαγωγή γεγονότων από αρχείο .ics (Google/Apple/Outlook export).
  async function importIcs(file:File){
    setShowMenu(false)
    try{
      const text=await file.text()
      const evs=parseICS(text)
      if(!evs.length){ setImportMsg('Δεν βρέθηκαν γεγονότα στο αρχείο.'); setTimeout(()=>setImportMsg(null),3500); return }
      const rows=evs.map(ev=>({property_id:propertyId,user_id:userId,title:ev.title,category:'reminder' as EventCategory,event_date:ev.date,event_time:ev.time,duration_minutes:ev.durationMinutes,notes:ev.notes,attachment_url:null,priority:'medium' as EventPriority,status:'pending' as EventStatus,recurring:false,source:'import'}))
      await supabase.from('calendar_events').insert(rows)
      await load()
      setImportMsg(`Εισήχθησαν ${rows.length} γεγονότα.`); setTimeout(()=>setImportMsg(null),3500)
    }catch{ setImportMsg('Το αρχείο δεν διαβάστηκε.'); setTimeout(()=>setImportMsg(null),3500) }
  }
  async function openSubscribe(){
    setShowMenu(false)
    let token=feedToken
    if(!token){
      const{data}=await supabase.from('calendar_feed_tokens').select('token').eq('user_id',userId).maybeSingle()
      token=data?.token||null
      if(!token){ const{data:ins}=await supabase.from('calendar_feed_tokens').insert({user_id:userId}).select('token').single(); token=(ins as any)?.token||null }
      setFeedToken(token)
    }
    setShowSubscribe(true)
  }
  useEffect(()=>{ if(!showMenu)return; const h=(ev:MouseEvent)=>{ if(menuRef.current&&!menuRef.current.contains(ev.target as Node))setShowMenu(false) }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h) },[showMenu])

  // Ειδοποιήσεις συσκευής: αναβοσβήνουν όσο η εφαρμογή είναι ανοιχτή, ~10' πριν από
  // κάθε ραντεβού. Το email υπενθυμίσεων (pg_cron) καλύπτει το background κανάλι.
  useEffect(()=>{
    if(typeof window==='undefined'||typeof Notification==='undefined')return
    if(localStorage.getItem('cal_notify')==='1'&&Notification.permission==='granted')setNotifyOn(true)
  },[])
  useEffect(()=>{
    if(!notifyOn||typeof Notification==='undefined')return
    const tick=()=>{
      if(Notification.permission!=='granted')return
      const due=dueReminders(events.filter(e=>!e._virtual),new Date(),10,notifiedRef.current)
      for(const e of due){
        notifiedRef.current.add(e.id)
        try{ new Notification(e.title,{ body:notifyBody(e,new Date()), tag:`cal_${e.id}` }) }catch{}
      }
    }
    tick()
    const iv=setInterval(tick,60000)
    return ()=>clearInterval(iv)
  },[notifyOn,events])
  async function toggleNotify(){
    setShowMenu(false)
    if(typeof Notification==='undefined'){ setImportMsg('Ο περιηγητής δεν υποστηρίζει ειδοποιήσεις.'); setTimeout(()=>setImportMsg(null),3500); return }
    if(notifyOn){ setNotifyOn(false); localStorage.removeItem('cal_notify'); setImportMsg('Οι ειδοποιήσεις συσκευής απενεργοποιήθηκαν.'); setTimeout(()=>setImportMsg(null),3500); return }
    let perm=Notification.permission
    if(perm==='default')perm=await Notification.requestPermission()
    if(perm==='granted'){ setNotifyOn(true); localStorage.setItem('cal_notify','1'); setImportMsg('Ενεργές ειδοποιήσεις — θα σε προειδοποιούμε ~10΄ πριν.'); setTimeout(()=>setImportMsg(null),3500) }
    else{ setImportMsg('Χρειάζεται άδεια ειδοποιήσεων από τον περιηγητή.'); setTimeout(()=>setImportMsg(null),3500) }
  }

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

  async function load() {
    setLoading(true)
    const{data}=await supabase.from('calendar_events').select('*').eq('property_id',propertyId).order('event_date')
    setEvents(data||[]); setLoading(false)
  }
  // Επαναφόρτωση χωρίς spinner (για live ενημερώσεις)
  async function silentReload() {
    const{data}=await supabase.from('calendar_events').select('*').eq('property_id',propertyId).order('event_date')
    setEvents(data||[])
  }

  const filtered=useMemo(()=>events.filter(e=>{
    if(filterCat!=='all'&&e.category!==filterCat)return false
    if(filterStatus!=='all'&&e.status!==filterStatus)return false
    if(searchQ&&!e.title.toLowerCase().includes(searchQ.toLowerCase()))return false
    return true
  }),[events,filterCat,filterStatus,searchQ])

  const overdue=filtered.filter(isOverdue)
  const thisWeek=filtered.filter(isThisWeek)
  const thisMonth=filtered.filter(isThisMonth)
  const expiring=filtered.filter(isExpiring)
  const later=filtered.filter(e=>{const d=daysUntil(e.event_date);return e.status==='pending'&&d>30})
  const done=filtered.filter(e=>e.status==='paid'||e.status==='cancelled')
  const totalPending=filtered.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const nextEvent=filtered.filter(e=>e.status==='pending'&&daysUntil(e.event_date)>=0).sort((a,b)=>a.event_date.localeCompare(b.event_date))[0]
  // Εύρη προβολής + επέκταση επαναλαμβανόμενων ώστε να φαίνονται σε ΟΛΕΣ τις εμφανίσεις.
  const { monthEvents, weekEvents, dayEvents } = useMemo(()=>{
    const p2=(n:number)=>String(n).padStart(2,'0')
    const _y=currentDate.getFullYear(), _mo=currentDate.getMonth(), _d=currentDate.getDate()
    const monthStart=`${_y}-${p2(_mo+1)}-01`, monthEnd=`${_y}-${p2(_mo+1)}-${p2(new Date(_y,_mo+1,0).getDate())}`
    const _wk=new Date(currentDate); const _wd=_wk.getDay(); _wk.setDate(_wk.getDate()-_wd+(_wd===0?-6:1))
    const weekStart=`${_wk.getFullYear()}-${p2(_wk.getMonth()+1)}-${p2(_wk.getDate())}`
    const _we=new Date(_wk); _we.setDate(_wk.getDate()+6); const weekEnd=`${_we.getFullYear()}-${p2(_we.getMonth()+1)}-${p2(_we.getDate())}`
    const dayStr=`${_y}-${p2(_mo+1)}-${p2(_d)}`
    return { monthEvents: expandRecurring(filtered, monthStart, monthEnd), weekEvents: expandRecurring(filtered, weekStart, weekEnd), dayEvents: expandRecurring(filtered, dayStr, dayStr) }
  },[filtered,currentDate])
  // Ζωντανός έλεγχος σύγκρουσης ώρας για τη φόρμα («έχεις ήδη κάτι τότε»).
  const formConflicts=useMemo(()=> (showModal&&form.event_time&&form.event_date)
    ? findConflicts({id:editingEvent?.id,date:form.event_date,time:form.event_time,durationMinutes:form.duration?parseInt(form.duration):60,status:form.status}, events.map(e=>({id:e.id,date:e.event_date,time:e.event_time,durationMinutes:e.duration_minutes,status:e.status}))).length
    : 0, [showModal,form.event_time,form.event_date,form.duration,form.status,editingEvent,events])
  // Προτεινόμενες ελεύθερες ώρες για την επιλεγμένη ημέρα (όταν δεν έχει οριστεί ώρα).
  const freeSlots=useMemo(()=>{
    if(!(showModal&&form.event_date&&!form.event_time))return [] as string[]
    const busy=events.filter(e=>e.event_date===form.event_date&&e.id!==editingEvent?.id).map(e=>({id:e.id,date:e.event_date,time:e.event_time,durationMinutes:e.duration_minutes,status:e.status}))
    return findFreeSlots(busy, form.event_date, form.duration?parseInt(form.duration):60).slice(0,6).map(iv=>`${String(Math.floor(iv.start/60)).padStart(2,'0')}:${String(iv.start%60).padStart(2,'0')}`)
  },[showModal,form.event_date,form.event_time,form.duration,events,editingEvent])

  function openNew(date?:string){setEditingEvent(null);setForm({...EMPTY_FORM,event_date:date||''});setShowModal(true)}
  function openEdit(ev:CalEvent){
    // Εικονική εμφάνιση επαναλαμβανόμενου → φόρτωσε τη ΣΕΙΡΑ (base) αλλά κράτα ποια μέρα άνοιξε.
    const e=ev._virtual&&ev._seriesId?(events.find(x=>x.id===ev._seriesId)||ev):ev
    setEditingEvent(e); setEditOccDate(ev.event_date)
    const endMode:FormState['recurrence_end_mode']=e.recurrence_until?'until':e.recurrence_count?'count':'none'
    setForm({title:e.title,category:e.category,event_date:e.event_date,event_time:e.event_time||'',duration:e.duration_minutes?String(e.duration_minutes):'',amount:e.amount?.toString()||'',priority:e.priority,status:e.status,recurring:e.recurring,recurring_interval:e.recurring_interval||'monthly',recurrence_end_mode:endMode,recurrence_until:e.recurrence_until||'',recurrence_count:e.recurrence_count?String(e.recurrence_count):'',notes:e.notes||'',attachment_url:e.attachment_url||'',phone:e.contact_phone||'',email:e.contact_email||'',add_expense:false});setShowModal(true)
  }
  function buildPayload(){
    return {property_id:propertyId,user_id:userId,title:form.title,category:form.category,event_date:form.event_date,event_time:form.event_time||null,duration_minutes:form.duration?parseInt(form.duration):null,amount:form.amount?parseFloat(form.amount):null,priority:form.priority,status:form.status,recurring:form.recurring,recurring_interval:form.recurring?form.recurring_interval:null,recurrence_until:form.recurring&&form.recurrence_end_mode==='until'&&form.recurrence_until?form.recurrence_until:null,recurrence_count:form.recurring&&form.recurrence_end_mode==='count'&&form.recurrence_count?parseInt(form.recurrence_count):null,notes:form.notes||null,attachment_url:form.attachment_url||null,contact_phone:form.phone||null,contact_email:form.email||null,source:'manual'}
  }
  // Κύκλωμα: το κόστος ενός γεγονότος μπορεί να γίνει και εκκρεμής δαπάνη (προϋπολογισμός/δαπάνες).
  async function maybeCreateExpense(){
    const amt=parseFloat(form.amount)
    if(!form.add_expense||!(amt>0))return
    const catMap:Record<string,string>={maintenance:'Συντήρηση & Επισκευές',bills:'Λογαριασμοί',contract:'Ασφάλιση & Νομικά',financial:'Λοιπά έξοδα',tenant:'Λοιπά έξοδα',reminder:'Λοιπά έξοδα'}
    try{ await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,amount:amt,description:form.title,date:form.event_date,category:catMap[form.category]||'Λοιπά έξοδα',expense_group:form.category==='maintenance'?'maintenance':'general',paid:form.status==='paid'}) }catch{}
  }
  // Μετακίνηση με σύρσιμο (drag): αλλάζει ημερομηνία (και ώρα σε προβολή ωρών). Οι
  // εικονικές εμφανίσεις σειράς ΔΕΝ σύρονται (θα άλλαζαν όλη τη σειρά αμφίσημα).
  async function moveEvent(id:string, newDate:string, newTime?:string|null){
    if(id.includes('__'))return
    const patch:{event_date:string;event_time?:string|null}={event_date:newDate}
    if(newTime!==undefined)patch.event_time=newTime
    setEvents(prev=>prev.map(e=>e.id===id?{...e,...patch}:e))
    await supabase.from('calendar_events').update(patch).eq('id',id)
  }

  async function saveEvent(){
    if(!form.title||!form.event_date)return
    // Επεξεργασία υπάρχουσας ΣΕΙΡΑΣ → ρώτα εμβέλεια (μόνο αυτό / επόμενα / όλα).
    if(editingEvent&&editingEvent.recurring){ setScopePrompt(true); return }
    setSaving(true)
    const payload=buildPayload()
    if(editingEvent){await supabase.from('calendar_events').update(payload).eq('id',editingEvent.id)}
    else{await supabase.from('calendar_events').insert(payload); await maybeCreateExpense()}
    await load(); setShowModal(false); setSaving(false)
  }
  // Εφαρμογή εμβέλειας επεξεργασίας σε επαναλαμβανόμενο.
  async function applyEditScope(scope:'this'|'following'|'all'){
    if(!editingEvent)return; setSaving(true)
    const base=editingEvent; const occ=editOccDate||base.event_date; const payload=buildPayload()
    try{
      if(scope==='all'){
        await supabase.from('calendar_events').update(payload).eq('id',base.id)
      }else if(scope==='this'){
        // Απόσπαση μόνο αυτής: νέο μεμονωμένο με τις αλλαγές + εξαίρεση της ημέρας από τη σειρά.
        await supabase.from('calendar_events').insert({...payload,event_date:occ,recurring:false,recurring_interval:null,recurrence_until:null,recurrence_count:null})
        const ex=Array.from(new Set([...(base.recurrence_exdates||[]),occ]))
        await supabase.from('calendar_events').update({recurrence_exdates:ex}).eq('id',base.id)
      }else{
        // Αυτό και τα επόμενα: κόψε τη σειρά την προηγούμενη μέρα + νέα σειρά από την occ.
        await supabase.from('calendar_events').update({recurrence_until:addDaysStr(occ,-1),recurrence_count:null}).eq('id',base.id)
        await supabase.from('calendar_events').insert({...payload,event_date:occ})
      }
    }catch{}
    await load(); setScopePrompt(false); setShowModal(false); setEditOccDate(null); setSaving(false)
  }

  async function toggleStatus(e:CalEvent){
    // Ολοκλήρωση εικονικής εμφάνισης → απόσπασέ την ως «πληρωμένη» + εξαίρεσέ την από τη σειρά.
    if(e._virtual&&e._seriesId){
      const base=events.find(x=>x.id===e._seriesId); if(!base)return
      await supabase.from('calendar_events').insert({property_id:base.property_id,user_id:base.user_id,title:base.title,category:base.category,event_date:e.event_date,event_time:base.event_time||null,duration_minutes:base.duration_minutes||null,amount:base.amount??null,priority:base.priority,status:'paid',recurring:false,recurring_interval:null,notes:base.notes||null,attachment_url:base.attachment_url||null,source:base.source})
      const ex=Array.from(new Set([...(base.recurrence_exdates||[]),e.event_date]))
      await supabase.from('calendar_events').update({recurrence_exdates:ex}).eq('id',base.id)
      await load(); return
    }
    const ns:EventStatus=e.status==='paid'?'pending':'paid'
    await supabase.from('calendar_events').update({status:ns}).eq('id',e.id)
    setEvents(prev=>prev.map(ev=>ev.id===e.id?{...ev,status:ns}:ev))
  }
  function deleteEvent(id:string){
    if(id.includes('__')){ const i=id.indexOf('__'); setDeleteScope({seriesId:id.slice(0,i),occ:id.slice(i+2)}); return }
    const ev=events.find(e=>e.id===id)
    if(ev?.recurring){ setDeleteScope({seriesId:id,occ:ev.event_date}); return }
    if(!confirm('Διαγραφή γεγονότος;'))return
    supabase.from('calendar_events').delete().eq('id',id).then(()=>{})
    setEvents(prev=>prev.filter(e=>e.id!==id))
  }
  async function applyDeleteScope(scope:'this'|'following'|'all'){
    if(!deleteScope)return; const {seriesId,occ}=deleteScope
    const base=events.find(e=>e.id===seriesId); if(!base){setDeleteScope(null);return}
    if(scope==='all'){await supabase.from('calendar_events').delete().eq('id',seriesId)}
    else if(scope==='this'){const ex=Array.from(new Set([...(base.recurrence_exdates||[]),occ]));await supabase.from('calendar_events').update({recurrence_exdates:ex}).eq('id',seriesId)}
    else{await supabase.from('calendar_events').update({recurrence_until:addDaysStr(occ,-1),recurrence_count:null}).eq('id',seriesId)}
    await load(); setDeleteScope(null)
  }

  function toggleSelect(id:string){setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
  async function bulkMarkPaid(){
    if(!selectedIds.size)return
    await Promise.all([...selectedIds].map(id=>supabase.from('calendar_events').update({status:'paid'}).eq('id',id)))
    await load(); setSelectedIds(new Set()); setBulkMode(false)
  }
  async function bulkDelete(){
    if(!selectedIds.size||!confirm(`Διαγραφή ${selectedIds.size} γεγονότων;`))return
    await Promise.all([...selectedIds].map(id=>supabase.from('calendar_events').delete().eq('id',id)))
    await load(); setSelectedIds(new Set()); setBulkMode(false)
  }

  // Escaping κατά RFC 5545 + αναδίπλωση γραμμών στους 75 χαρακτήρες.
  function icsEsc(s:string){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n') }
  function icsFold(line:string){ if(line.length<=75)return line; const out:string[]=[]; let s=line; while(s.length>75){ out.push(s.slice(0,75)); s=' '+s.slice(75) } out.push(s); return out.join('\r\n') }
  function exportICal(){
    const now=new Date(); const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Property OS//Calendar 1.0//EL','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Property OS, Ημερολόγιο','X-WR-TIMEZONE:Europe/Athens']
    filtered.forEach(e=>{
      const d=e.event_date.replace(/-/g,''); const cat=CATEGORIES[e.category]
      const descParts=[e.notes||'', e.amount?`Ποσό: ${e.amount.toLocaleString('el-GR')} €`:''].filter(Boolean)
      lines.push('BEGIN:VEVENT',
        `UID:${e.id}@property-os`,
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
    const blob=new Blob([lines.filter(Boolean).join('\r\n')],{type:'text/calendar;charset=utf-8'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='property-os.ics'; a.click(); URL.revokeObjectURL(url)
  }

  // Εκτύπωση: καθαρή, branded αναφορά επερχόμενων γεγονότων (όχι raw σελίδα).
  function printCalendar(){
    const esc=(s:string)=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]||c))
    const up=[...filtered].filter(e=>e.status!=='paid').sort((a,b)=>a.event_date.localeCompare(b.event_date))
    const fmtD=(s:string)=>new Date(s).toLocaleDateString('el-GR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})
    const rows=up.length?up.map(e=>{const cat=CATEGORIES[e.category];const d=daysUntil(e.event_date);const tag=d<0?`${Math.abs(d)} ημ. πριν`:d===0?'Σήμερα':`σε ${d} ημ.`;const col=d<0?'#c5221f':d<=7?'#e37400':'#5f6368';return `<tr>
      <td style="padding:11px 8px;border-bottom:1px solid #eee;font-size:13px;white-space:nowrap">${esc(fmtD(e.event_date))}</td>
      <td style="padding:11px 8px;border-bottom:1px solid #eee;font-size:13px;font-weight:600">${esc(e.title)}${e.amount?` <span style="color:#1a73e8;font-family:monospace">${e.amount.toLocaleString('el-GR')} €</span>`:''}</td>
      <td style="padding:11px 8px;border-bottom:1px solid #eee;font-size:11px;color:#5f6368">${esc(cat?.label||'')}</td>
      <td style="padding:11px 8px;border-bottom:1px solid #eee;font-size:12px;font-weight:700;color:${col};white-space:nowrap;text-align:right">${tag}</td></tr>`}).join(''):'<tr><td colspan="4" style="padding:24px;text-align:center;color:#80868b">Καμία εκκρεμότητα.</td></tr>'
    const html=`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Ημερολόγιο, Property OS</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;color:#202124;padding:40px;max-width:800px;margin:0 auto}@media print{body{padding:0}@page{margin:16mm}}table{width:100%;border-collapse:collapse}</style></head>
    <body><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:16px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:8px;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px">P</div><div><div style="font-weight:700;font-size:15px">Property OS</div><div style="font-size:11px;color:#5f6368">Επερχόμενα Γεγονότα & Προθεσμίες</div></div></div>
      <div style="text-align:right;font-size:12px;color:#5f6368">${esc(new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'}))}</div></div>
      <table><thead><tr><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Ημερομηνία</th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Γεγονός</th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Κατηγορία</th><th style="text-align:right;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Πότε</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:30px;font-size:10px;color:#80868b;border-top:1px solid #eee;padding-top:12px">Δημιουργήθηκε αυτόματα από το Property OS.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>`
    const w=window.open('','_blank'); if(!w){alert('Επίτρεψε τα αναδυόμενα παράθυρα.');return} w.document.write(html); w.document.close()
  }

  const prevPeriod=()=>{ if(viewMode==='year')setTimelineYear(y=>y-1); else if(viewMode==='day')setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()-1)); else if(viewMode==='week')setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()-7)); else setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1)) }
  const nextPeriod=()=>{ if(viewMode==='year')setTimelineYear(y=>y+1); else if(viewMode==='day')setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)); else if(viewMode==='week')setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+7)); else setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1)) }
  const periodLabel=()=>{
    if(viewMode==='year')return`${timelineYear}`
    if(viewMode==='day')return`${DAY_FULL_GR[currentDate.getDay()]} ${currentDate.getDate()} ${MONTH_NAMES_GR[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    if(viewMode==='week'){const d=new Date(currentDate);const day=d.getDay();const diff=d.getDate()-day+(day===0?-6:1);d.setDate(diff);const end=new Date(d);end.setDate(d.getDate()+6);return`${d.getDate()} ${MONTH_SHORT_GR[d.getMonth()]} – ${end.getDate()} ${MONTH_SHORT_GR[end.getMonth()]}`}
    return`${MONTH_NAMES_GR[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  // Google-style button base

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* KPI Bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:12 }}>
        {[
          {label:'Εκκρεμή ποσά', value:totalPending>0?totalPending.toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'—', color:totalPending>0?'var(--accent)':'var(--text-secondary)', icon:<TrendingUp size={14}/>},
          {label:'Εκπρόθεσμα', value:overdue.length>0?`${overdue.length} γεγονότα`:'Κανένα', color:overdue.length>0?'var(--negative)':'var(--positive)', icon:<AlertTriangle size={14}/>},
          {label:'Επόμενη πληρωμή', value:nextEvent?(daysUntil(nextEvent.event_date)===0?'Σήμερα':`σε ${daysUntil(nextEvent.event_date)} ημέρες`):'—', color:'var(--text-primary)', icon:<Clock size={14}/>},
          {label:'Λήξεις συμβολαίων', value:expiring.length>0?`${expiring.length} σύντομα`:'Κανένα', color:expiring.length>0?'var(--warning)':'var(--text-secondary)', icon:<Shield size={14}/>},
        ].map(kpi=>(
          <div key={kpi.label} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'12px 16px', boxShadow:'var(--shadow-sm)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
              <span style={{ color:kpi.color, opacity:0.8 }}>{kpi.icon}</span>
              <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>{kpi.label}</p>
            </div>
            <p style={{ fontSize:16, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:kpi.color, fontWeight:400 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Smart Alerts */}
      {(overdue.length>0||expiring.length>0)&&(
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {overdue.length>0&&(
            <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--negative-dim)', border:'1px solid var(--negative-border)', borderRadius:8, padding:'10px 16px' }}>
              <AlertTriangle size={14} color="var(--negative)"/>
              <p style={{ fontSize:14, color:'var(--negative)', fontFamily:"'Inter',sans-serif", flex:1, letterSpacing:'0.25px' }}>
                {overdue.length} εκπρόθεσμ{overdue.length===1?'ο γεγονός':'α γεγονότα'}, χρειάζονται άμεση δράση
              </p>
              <span style={{ fontSize:13, color:'var(--negative)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums' }}>
                {overdue.reduce((s,e)=>s+(e.amount||0),0)>0&&`${overdue.reduce((s,e)=>s+(e.amount||0),0).toLocaleString('el-GR',{style:'currency',currency:'EUR'})}`}
              </span>
            </div>
          )}
          {expiring.length>0&&(
            <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--warning-dim)', border:'1px solid var(--warning-border)', borderRadius:8, padding:'10px 16px' }}>
              <Shield size={14} color="var(--warning)"/>
              <p style={{ fontSize:14, color:'var(--warning)', fontFamily:"'Inter',sans-serif", letterSpacing:'0.25px' }}>
                {expiring.length} συμβόλαι{expiring.length===1?'ο λήγει':'α λήγουν'} εντός 60 ημερών, {expiring.map(e=>`${e.title} (${fmtShort(e.event_date)})`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Toolbar — καθαρή, ένα πρωτεύον κουμπί· τα δευτερεύοντα σε ένα ήσυχο μενού */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        {/* View switcher */}
        <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
          {([['day','Ημέρα',<Clock size={13}/>],['week','Εβδομάδα',<CalendarDays size={13}/>],['month','Μήνας',<Calendar size={13}/>],['year','Έτος',<BarChart2 size={13}/>],['agenda','Ατζέντα',<List size={13}/>]] as [ViewMode,string,React.ReactNode][]).map(([v,label,icon])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{ display:'flex', alignItems:'center', gap:6, height:32, padding:'0 12px', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:viewMode===v?600:500, background:viewMode===v?'var(--accent)':'transparent', color:viewMode===v?'var(--accent-text)':'var(--text-secondary)', transition:'all 0.15s', letterSpacing:'0.1px' }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Period nav */}
        {viewMode!=='agenda'&&(
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button aria-label="Προηγούμενο" title="Προηγούμενο" onClick={prevPeriod} style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><ChevronLeft size={18}/></button>
            <span aria-live="polite" style={{ fontSize:15, fontWeight:600, fontFamily:"'Inter',sans-serif", color:'var(--text-primary)', minWidth:viewMode==='day'?200:150, textAlign:'center', letterSpacing:'0.1px' }}>{periodLabel()}</span>
            <button aria-label="Επόμενο" title="Επόμενο" onClick={nextPeriod} style={{ width:34, height:34, borderRadius:'50%', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><ChevronRight size={18}/></button>
            <button onClick={()=>{setCurrentDate(new Date());setTimelineYear(new Date().getFullYear())}} style={{ height:34, padding:'0 14px', borderRadius:17, border:'1px solid var(--border-default)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', fontSize:13, fontWeight:500, fontFamily:"'Inter',sans-serif" }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.color='var(--text-secondary)'}}>Σήμερα</button>
          </div>
        )}

        <div style={{ flex:1, minWidth:100, position:'relative' }}>
          <input aria-label="Αναζήτηση γεγονότος" placeholder="Αναζήτηση γεγονότος…" value={searchQ} onChange={e=>setSearchQ(e.target.value)}
            style={{ width:'100%', height:36, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:18, padding:'0 16px', color:'var(--text-primary)', fontSize:14, fontFamily:"'Inter',sans-serif", outline:'none' }}
            onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}/>
        </div>

        <button onClick={()=>openNew()} style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 18px', background:'var(--accent)', border:'none', borderRadius:18, cursor:'pointer', color:'var(--accent-text)', fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:600, letterSpacing:'0.1px', boxShadow:'var(--shadow-sm)' }}>
          <Plus size={15}/>Νέο
        </button>

        {/* Ένα ήσυχο μενού για όλα τα δευτερεύοντα */}
        <div ref={menuRef} style={{ position:'relative' }}>
          <button aria-label="Περισσότερα" aria-haspopup="menu" aria-expanded={showMenu} title="Περισσότερα" onClick={()=>setShowMenu(m=>!m)} style={{ width:36, height:36, borderRadius:'50%', border:'1px solid '+(showMenu?'var(--border-default)':'var(--border-subtle)'), background:showMenu?'var(--bg-elevated)':'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }}><MoreHorizontal size={18}/></button>
          {showMenu&&(
            <div role="menu" style={{ position:'absolute', top:42, right:0, width:236, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, boxShadow:'0 12px 40px rgba(0,0,0,0.35)', padding:6, zIndex:200 }}>
              {([
                {label: bulkMode?'Τέλος επιλογής':'Επιλογή για μαζικές ενέργειες', icon:<CheckSquare size={15}/>, on:()=>{setBulkMode(b=>!b);setSelectedIds(new Set());setShowMenu(false)}},
                {label: showFilters?'Απόκρυψη φίλτρων':'Φίλτρα', icon:<Filter size={15}/>, on:()=>{setShowFilters(f=>!f);setShowMenu(false)}},
                {label:'Συγχρονισμός δεδομένων', icon:<RefreshCw size={15}/>, on:()=>{setShowAutoPull(f=>!f);setShowMenu(false)}},
                {label: notifyOn?'Ειδοποιήσεις συσκευής: ενεργές':'Ειδοποιήσεις στη συσκευή', icon:<Bell size={15}/>, on:toggleNotify},
                {label:'Συνδρομή σε ζωντανό ημερολόγιο', icon:<CalendarPlus size={15}/>, on:openSubscribe},
                {label:'Λήψη αρχείου .ics', icon:<Download size={15}/>, on:()=>{exportICal();setShowMenu(false)}},
                {label:'Εισαγωγή από .ics', icon:<CalendarDays size={15}/>, on:()=>{importRef.current?.click()}},
                {label:'Εξαγωγή σε Excel/CSV', icon:<FileText size={15}/>, on:()=>{downloadCsv(`imerologio_${new Date().toISOString().slice(0,10)}`,['Ημερομηνία','Τίτλος','Κατηγορία','Ποσό (€)','Κατάσταση'],[...filtered].sort((a,b)=>a.event_date.localeCompare(b.event_date)).map(e=>[csvDate(e.event_date),e.title,CATEGORIES[e.category]?.label||e.category,csvEur(e.amount),STATUSES[e.status]?.label||e.status]));setShowMenu(false)}},
                {label:'Εκτύπωση', icon:<Printer size={15}/>, on:()=>{printCalendar();setShowMenu(false)}},
              ] as {label:string;icon:React.ReactNode;on:()=>void}[]).map(it=>(
                <button key={it.label} onClick={it.on} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'9px 12px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left', color:'var(--text-primary)', fontSize:13, fontFamily:"'Inter',sans-serif", borderRadius:8, transition:'background 0.12s' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ color:'var(--text-tertiary)', display:'flex', flexShrink:0 }}>{it.icon}</span>{it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode&&selectedIds.size>0&&(
        <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8, padding:'10px 16px' }}>
          <span style={{ fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--accent)' }}>{selectedIds.size} επιλεγμένα</span>
          <button onClick={bulkMarkPaid} style={{ height:32, padding:'0 16px', background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:16, cursor:'pointer', fontSize:13, color:'var(--accent)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Πληρωμένα</button>
          <button onClick={bulkDelete} style={{ height:32, padding:'0 16px', background:'var(--negative-dim)', border:'1px solid var(--negative)', borderRadius:16, cursor:'pointer', fontSize:13, color:'var(--negative)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Διαγραφή</button>
          <button onClick={()=>setSelectedIds(new Set(filtered.map(e=>e.id)))} style={{ height:32, padding:'0 16px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:16, cursor:'pointer', fontSize:13, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>Επιλογή όλων</button>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters&&(
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'14px 16px', display:'flex', gap:24, flexWrap:'wrap', boxShadow:'var(--shadow-sm)' }}>
          <div>
            <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>Κατηγορία</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button onClick={()=>setFilterCat('all')} style={{ height:32, padding:'0 12px', borderRadius:16, fontSize:13, cursor:'pointer', border:'1px solid var(--border-default)', background:filterCat==='all'?'var(--accent)':'transparent', color:filterCat==='all'?'var(--accent-text)':'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Όλες</button>
              {Object.entries(CATEGORIES).map(([k,v])=>(
                <button key={k} onClick={()=>setFilterCat(k as EventCategory)} style={{ height:32, padding:'0 12px', borderRadius:16, fontSize:13, cursor:'pointer', border:`1px solid ${filterCat===k?v.color:'var(--border-default)'}`, background:filterCat===k?v.bg:'transparent', color:filterCat===k?v.color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>{v.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>Κατάσταση</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button onClick={()=>setFilterStatus('all')} style={{ height:32, padding:'0 12px', borderRadius:16, fontSize:13, cursor:'pointer', border:'1px solid var(--border-default)', background:filterStatus==='all'?'var(--accent)':'transparent', color:filterStatus==='all'?'var(--accent-text)':'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Όλες</button>
              {Object.entries(STATUSES).map(([k,v])=>(
                <button key={k} onClick={()=>setFilterStatus(k as EventStatus)} style={{ height:32, padding:'0 12px', borderRadius:16, fontSize:13, cursor:'pointer', border:`1px solid ${filterStatus===k?v.color:'var(--border-default)'}`, background:filterStatus===k?`${v.color}15`:'transparent', color:filterStatus===k?v.color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>{v.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAutoPull&&<AutoPullPanel propertyId={propertyId} userId={userId} onRefresh={load}/>}

      {loading&&<Spinner label="Φόρτωση…" />}

      {!loading&&viewMode==='month'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <MonthView events={monthEvents} currentDate={currentDate} onDayClick={openNew} onEventClick={openEdit} upcomingAll={filtered} drag={drag}/>
          {monthEvents.length>0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>Γεγονότα {MONTH_NAMES_GR[currentDate.getMonth()]}</p>
              {monthEvents.map(e=>(<EventCard key={e.id} event={e} onToggleStatus={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} selected={selectedIds.has(e.id)} onSelect={toggleSelect} bulkMode={bulkMode}/>))}
            </div>
          )}
          {monthEvents.length===0&&<div style={{ textAlign:'center', padding:'20px 0' }}><p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)' }}>Δεν υπάρχουν γεγονότα αυτόν τον μήνα</p></div>}
        </div>
      )}

      {!loading&&viewMode==='day'&&<DayView events={dayEvents} currentDate={currentDate} onSlotClick={(date,time)=>{setEditingEvent(null);setForm({...EMPTY_FORM,event_date:date,event_time:time});setShowModal(true)}} onEventClick={openEdit} drag={drag}/>}

      {!loading&&viewMode==='week'&&<WeekView events={weekEvents} currentDate={currentDate} onDayClick={openNew} onSlotClick={(date,time)=>{setEditingEvent(null);setForm({...EMPTY_FORM,event_date:date,event_time:time});setShowModal(true)}} onEventClick={openEdit} drag={drag}/>}

      {!loading&&viewMode==='agenda'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {overdue.length>0&&<Section title="Εκπρόθεσμα" color="var(--negative)" events={overdue} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisWeek.length>0&&<Section title="Επόμενες 7 μέρες" color="var(--accent)" events={thisWeek} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisMonth.length>0&&<Section title="Αυτόν τον μήνα" color="var(--text-secondary)" events={thisMonth} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {later.length>0&&<Section title="Αργότερα" color="var(--text-secondary)" events={later} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {done.length>0&&<Section title="Ολοκληρωμένα / Ακυρωμένα" color="var(--text-tertiary)" events={done} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} collapsed bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {filtered.length===0&&<div style={{ textAlign:'center', padding:'50px 0' }}><Calendar size={28} color="var(--text-tertiary)" style={{ margin:'0 auto 12px' }}/><p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)' }}>Δεν υπάρχουν γεγονότα</p></div>}
        </div>
      )}

      {!loading&&viewMode==='year'&&<TimelineView events={filtered} currentYear={timelineYear} onYearChange={setTimelineYear}/>}

      <input ref={importRef} type="file" accept=".ics,text/calendar" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0]; if(f)importIcs(f); e.currentTarget.value=''}}/>
      {importMsg&&<div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'var(--bg-elevated)', border:'1px solid var(--accent-border)', borderRadius:12, padding:'11px 20px', fontSize:13, color:'var(--text-primary)', zIndex:1200, boxShadow:'0 8px 32px rgba(0,0,0,0.35)', fontFamily:"'Inter',sans-serif" }}>{importMsg}</div>}
      {showModal&&<EventModal form={form} setForm={setForm} onSave={saveEvent} onClose={()=>setShowModal(false)} editing={!!editingEvent} saving={saving} conflicts={formConflicts} freeSlots={freeSlots}/>}
      {showSubscribe&&<SubscribeModal token={feedToken} propertyId={propertyId} onClose={()=>setShowSubscribe(false)}/>}
      {scopePrompt&&<ScopeModal title="Επεξεργασία επαναλαμβανόμενου" hint="Σε ποιες εμφανίσεις να εφαρμοστούν οι αλλαγές;" onPick={applyEditScope} onClose={()=>setScopePrompt(false)}/>}
      {deleteScope&&<ScopeModal title="Διαγραφή επαναλαμβανόμενου" hint="Τι θέλεις να διαγράψεις;" danger onPick={applyDeleteScope} onClose={()=>setDeleteScope(null)}/>}
      {drag.ghost&&createPortal(
        <div style={{ position:'fixed', left:drag.ghost.x+14, top:drag.ghost.y+14, pointerEvents:'none', zIndex:3000, background:'var(--accent)', color:'var(--accent-text)', fontSize:12, fontWeight:600, padding:'5px 11px', borderRadius:9, boxShadow:'0 10px 30px rgba(0,0,0,0.32)', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{drag.ghost.label}</div>,
        document.body
      )}
    </div>
  )
}