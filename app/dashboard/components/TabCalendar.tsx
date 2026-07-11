'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/Theme'
import { downloadCsv, csvEur, csvDate } from './exportCsv'
import {
  AlertTriangle, Plus, X, ChevronLeft, ChevronRight,
  Calendar, List, BarChart2, Check, FileText,
  Zap, Shield, User, Bell, Filter, Download,
  ChevronDown, Edit2, Trash2, RotateCcw,
  Euro, Wrench, RefreshCw,
  Printer, Square, CheckSquare, CalendarDays, ArrowRight,
  TrendingUp, Clock, Info, MoreHorizontal, Share2, CalendarPlus,
} from 'lucide-react'
import { DatePicker } from './UIComponents'
import { allCalendarLinks, buildICS } from '@/lib/calendar/externalLinks'
import { holidayName, isWeekend } from '@/lib/calendar/greekHolidays'
import { expandRecurring } from '@/lib/calendar/recurrence'
import { findConflicts } from '@/lib/calendar/availability'
import { parseICS } from '@/lib/calendar/icsImport'
import { parseQuickAdd } from '@/lib/calendar/quickAdd'
import { dueReminders, notifyBody } from '@/lib/calendar/notify'
import { buildBookingEvents } from '@/lib/calendar/bookingEvents'
import { toStaySpan, staysOnDay, segMeta, channelColor, CHANNEL_COLORS, type StaySpan } from '@/lib/calendar/stayBars'
import { layoutDay } from '@/lib/calendar/overlap'
import { buildInviteICS, inviteMailto, inviteWhatsApp, inviteViber, canInvite } from '@/lib/calendar/invite'
import { greekPropertyTaxObligations, taxObligationToEvent, AADE_CALENDAR_URL, TAXHEAVEN_CALENDAR_URL } from '@/lib/tax/greekTaxCalendar'
import { annuityMonthly } from '@/lib/loans/recommend'
import { syncTenantSchedule } from './TabTenantHelpers'

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
  cancelled:   { label: 'Ακυρώθηκε',  color: 'var(--negative)' },
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
// Τρέχουσα στιγμή σε ώρα Ελλάδας (Europe/Athens), ανεξάρτητα από τη ζώνη της
// συσκευής — ώστε «σήμερα», η γραμμή «τώρα» και οι υπενθυμίσεις να είναι σωστές.
function athensNow(): Date { return new Date(new Date().toLocaleString('en-US',{ timeZone:'Europe/Athens' })) }
function daysUntil(dateStr: string) { const t=athensNow(); t.setHours(0,0,0,0); const [y,m,d]=dateStr.split('-').map(Number); const g=new Date(y,(m||1)-1,d||1); g.setHours(0,0,0,0); return Math.round((g.getTime()-t.getTime())/86400000) }
function isOverdue(e: CalEvent)  { return e.status==='pending'&&daysUntil(e.event_date)<0 }
function isThisWeek(e: CalEvent) { const d=daysUntil(e.event_date); return e.status==='pending'&&d>=0&&d<=7 }
function isThisMonth(e: CalEvent){ const d=daysUntil(e.event_date); return e.status==='pending'&&d>7&&d<=30 }
function isExpiring(e: CalEvent) { const d=daysUntil(e.event_date); return e.category==='contract'&&e.status==='pending'&&d>=0&&d<=60 }
function todayStr() { const d=athensNow(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
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

function StatusDot({ status }: { status: EventStatus }) {
  const s = STATUSES[status]
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontFamily:"'Inter',sans-serif", color:s.color, letterSpacing:'0.25px' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.color, display:'inline-block', flexShrink:0 }}/>
      {s.label}
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
function AddToCalendarMenu({ event, onEdit, onDelete, onOpenChange }: { event: CalEvent; onEdit?:(e:CalEvent)=>void; onDelete?:(id:string)=>void; onOpenChange?:(open:boolean)=>void }) {
  const [open,setOpen]=useState(false)
  const btnRef=useRef<HTMLButtonElement>(null)
  const popRef=useRef<HTMLDivElement>(null)
  const [pos,setPos]=useState({top:0,left:0})
  const setOpenX=setOpen
  // Ειδοποίηση γονέα εκτός φάσης render (όχι μέσα στον updater) — αποφυγή warning/StrictMode διπλο-κλήσης.
  useEffect(()=>{ onOpenChange?.(open) },[open,onOpenChange])
  const reposition=()=>{ if(!btnRef.current)return; const r=btnRef.current.getBoundingClientRect(); const W=232,H=420; const left=Math.min(r.left,window.innerWidth-W-8); const openUp=r.bottom+H+8>window.innerHeight&&r.top-H-8>0; setPos({top:openUp?r.top-H-6:r.bottom+6,left:Math.max(8,left)}) }
  useEffect(()=>{ if(!open)return; reposition(); const h=(ev:MouseEvent)=>{const t=ev.target as Node; if(btnRef.current&&!btnRef.current.contains(t)&&popRef.current&&!popRef.current.contains(t))setOpenX(false)}; const s=()=>reposition(); document.addEventListener('mousedown',h); window.addEventListener('scroll',s,true); window.addEventListener('resize',s); return ()=>{document.removeEventListener('mousedown',h); window.removeEventListener('scroll',s,true); window.removeEventListener('resize',s)} },[open])
  const links=allCalendarLinks(toCalInput(event))
  const row=(label:string,onClick:()=>void,icon:React.ReactNode,danger?:boolean)=>(
    <button key={label} type="button" onClick={()=>{onClick();setOpenX(false)}} style={{ display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 12px',border:'none',background:'transparent',cursor:'pointer',textAlign:'left',color:'var(--text-primary)',fontSize:13,fontFamily:"'Inter',sans-serif",borderRadius:8,transition:'background 0.12s, color 0.12s' }} onMouseEnter={e=>{e.currentTarget.style.background=danger?'var(--negative-dim)':'var(--bg-hover)';if(danger)e.currentTarget.style.color='var(--negative)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';if(danger)e.currentTarget.style.color='var(--text-primary)'}}>
      <span style={{ color:danger?'inherit':'var(--text-tertiary)',display:'flex',flexShrink:0 }}>{icon}</span>{label}
    </button>
  )
  const openExt=(href:string)=>window.open(href,'_blank','noopener,noreferrer')
  return (
    <>
      <button ref={btnRef} type="button" aria-label="Ενέργειες" title="Ενέργειες" onClick={e=>{e.stopPropagation();setOpenX(o=>!o)}}
        style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:'50%',border:'1px solid '+(open?'var(--border-default)':'transparent'),background:open?'var(--bg-elevated)':'transparent',cursor:'pointer',color:'var(--text-secondary)',flexShrink:0,transition:'all 0.15s' }}>
        <MoreHorizontal size={16}/>
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
  const due     = daysUntil(event.event_date)
  const relLbl = (n:number) => { const a=Math.abs(n); return a===1?'1 ημέρα':`${a} ημέρες` }
  const [hover,setHover]=useState(false)
  const [menuOpen,setMenuOpen]=useState(false)
  // Χρώμα μόνο όπου μετράει: η αριστερή γραμμή δείχνει κατηγορία (διακριτικά), ή
  // κόκκινο όταν εκπρόθεσμο. Χωρίς πολύχρωμα badges/πηγή — καθαρή, ακριβή αίσθηση.
  const accentBar = overdue?'var(--negative)':`color-mix(in srgb, ${cat.color} 50%, transparent)`

  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{ display:'flex', alignItems:'flex-start', gap:11, padding:'12px 15px',
      background: selected?'var(--accent-dim)':done?'var(--bg-elevated)':'var(--bg-surface)',
      border:`1px solid ${selected?'var(--border-accent)':overdue?'var(--negative-border)':'var(--border-subtle)'}`,
      borderLeft:`3px solid ${accentBar}`,
      borderRadius:10, opacity:done?0.62:1, transition:'all 0.15s', boxShadow:'var(--shadow-sm)',
    }}>
      {bulkMode&&onSelect&&(
        <button aria-label="Επιλογή" onClick={()=>onSelect(event.id)} style={{ background:'none', border:'none', cursor:'pointer', color:selected?'var(--accent)':'var(--text-tertiary)', padding:0, display:'flex', flexShrink:0, marginTop:2 }}>
          {selected?<CheckSquare size={16}/>:<Square size={16}/>}
        </button>
      )}
      {!bulkMode&&(
        <button aria-label={done?'Αναίρεση':'Ολοκλήρωση'} onClick={()=>onToggleStatus(event)} style={{ marginTop:1, flexShrink:0, width:18, height:18, borderRadius:'50%', border:`2px solid ${done?'var(--positive)':'var(--border-default)'}`, background:done?'var(--positive)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s' }}>
          {done&&<Check size={9} color="var(--accent-text)"/>}
        </button>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
          <span style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:500, color:done?'var(--text-tertiary)':'var(--text-primary)', textDecoration:done?'line-through':'none', letterSpacing:'0.1px', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {event.title}
          </span>
          {event.recurring&&<Tooltip text="Επαναλαμβανόμενο"><RotateCcw size={11} color="var(--text-tertiary)" style={{ flexShrink:0 }}/></Tooltip>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
            <span style={{ width:7, height:7, borderRadius:2, background:cat.color, flexShrink:0 }}/>
            <span style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)', letterSpacing:'0.3px' }}>{cat.label}</span>
          </span>
          {event.status!=='pending'&&<StatusDot status={event.status}/>}
          {event.amount!=null&&(
            <span style={{ fontSize:13, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)', fontWeight:500 }}>
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
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
        <span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:due===0?600:400, color:due===0?'var(--text-primary)':'var(--text-secondary)' }}>
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

// Month View
function MonthView({ events, currentDate, selectedDate, onDayClick, onEventClick, upcomingAll, drag, stays=[] }: {
  events: CalEvent[]; currentDate: Date; selectedDate?:string; onDayClick:(date:string)=>void; onEventClick:(e:CalEvent)=>void; upcomingAll:CalEvent[]; drag?:DragCtl; stays?:StaySpan[]
}) {
  const year=currentDate.getFullYear(); const month=currentDate.getMonth()
  const firstDay=new Date(year,month,1).getDay()
  const daysInMonth=new Date(year,month+1,0).getDate()
  const today=todayStr()
  const cells:(number|null)[] = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let i=1;i<=daysInMonth;i++) cells.push(i)
  while(cells.length%7!==0) cells.push(null)
  // Οι κρατήσεις φαίνονται ως ενιαία μπάρα διαμονής — κρύβουμε τα booking: chips
  // ώστε να μη διπλογράφονται.
  const eventsForDay=(day:number)=>{ const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; return events.filter(e=>e.event_date===ds&&!(e.source||'').startsWith('booking:')) }
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
              {Array.from(new Set(stays.map(s=>(s.channel||'').toLowerCase()).filter(c=>CHANNEL_COLORS[c]))).map(ch=>(
                <div key={ch} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:CHANNEL_COLORS[ch].solid, display:'inline-block' }}/>
                  <span style={{ fontSize:11, fontFamily:"'Inter',sans-serif", color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>{CHANNEL_COLORS[ch].label}</span>
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
              const isSelected=!!day&&!!selectedDate&&dateStr===selectedDate
              const hasOverdue=dayEvents.some(isOverdue)
              const dayAmt=dayEvents.filter(e=>e.amount&&e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
              const hol=day?holidayName(dateStr):null
              const wknd=day?isWeekend(dateStr):false
              const cellBg=isToday?'var(--accent-dim)':isSelected?'color-mix(in srgb, var(--accent) 12%, transparent)':hol?'color-mix(in srgb, var(--accent) 5%, transparent)':wknd?'color-mix(in srgb, var(--text-tertiary) 5%, transparent)':'transparent'
              return (
                <div key={idx} onClick={()=>day&&onDayClick(dateStr)} data-drop-date={day?dateStr:undefined} style={{ minHeight:80, padding:'6px', borderRight:(idx+1)%7===0?'none':'1px solid var(--border-subtle)', borderBottom:idx<cells.length-7?'1px solid var(--border-subtle)':'none', background:cellBg, boxShadow:isSelected&&!isToday?'inset 0 0 0 2px var(--accent)':'none', cursor:day?'pointer':'default', transition:'background 0.1s' }}
                  onMouseEnter={e=>{if(day)(e.currentTarget as HTMLElement).style.background=isToday?'var(--accent-dim)':'var(--bg-hover)'}}
                  onMouseLeave={e=>{if(day)(e.currentTarget as HTMLElement).style.background=cellBg}}
                >
                  {day&&(
                    <>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:isToday||isSelected?700:400, color:isToday||isSelected?'var(--accent)':wknd||hol?'var(--text-tertiary)':'var(--text-secondary)', width:24, height:24, borderRadius:'50%', background:isToday?'var(--accent-dim)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>{day}</span>
                        {hasOverdue&&<span style={{ width:6, height:6, borderRadius:'50%', background:'var(--negative)' }}/>}
                      </div>
                      {hol&&<div title={hol} style={{ fontSize:9.5, color:'var(--accent)', fontWeight:600, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{hol}</div>}
                      {(()=>{ const ds=staysOnDay(stays,dateStr); if(!ds.length)return null; const col=idx%7; return (
                        <div style={{ margin:'0 -6px 3px', display:'flex', flexDirection:'column', gap:2 }}>
                          {ds.slice(0,3).map(s=>{ const m=segMeta(s,dateStr,col); const cc=channelColor(s.channel); const nights=Math.max(1,Math.round((Date.UTC(+s.end.slice(0,4),+s.end.slice(5,7)-1,+s.end.slice(8,10))-Date.UTC(+s.start.slice(0,4),+s.start.slice(5,7)-1,+s.start.slice(8,10)))/86400000)); return (
                            <Tooltip key={s.id} text={`${s.guest} · ${cc.label}\n${s.start} → ${s.end}${s.total?`\n${s.total.toLocaleString('el-GR',{style:'currency',currency:'EUR'})}`:''}`}>
                              <div onClick={e=>e.stopPropagation()} style={{ height:17, display:'flex', alignItems:'center', background:`color-mix(in srgb, ${cc.solid} 90%, var(--bg-elevated))`, color:'#fff', fontSize:10.5, fontWeight:600, fontFamily:"'Inter',sans-serif", letterSpacing:'0.2px', paddingLeft:m.showLabel?8:0, paddingRight:m.roundRight?6:0, borderTopLeftRadius:m.roundLeft?8:0, borderBottomLeftRadius:m.roundLeft?8:0, borderTopRightRadius:m.roundRight?8:0, borderBottomRightRadius:m.roundRight?8:0, marginLeft:m.roundLeft?4:0, marginRight:m.roundRight?4:0, overflow:'hidden', whiteSpace:'nowrap', cursor:'default' }}>
                                {m.showLabel&&<span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{m.isStart&&<User size={9} style={{ marginRight:3, verticalAlign:'-1px', opacity:0.85 }}/>}{s.guest}{m.isStart&&nights>1?` · ${nights} ν.`:''}</span>}
                              </div>
                            </Tooltip>
                          )})}
                          {ds.length>3&&<span style={{ fontSize:9.5, color:'var(--text-tertiary)', paddingLeft:8, fontFamily:"'Inter',sans-serif" }}>+{ds.length-3} κρατήσεις</span>}
                        </div>
                      )})()}
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
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12 }}>
          <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>{MONTH_NAMES_GR[currentDate.getMonth()]}</p>
          {events.length===0&&<p style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Κανένα γεγονός</p>}
          {Object.entries(CATEGORIES).map(([k,cat])=>{ const cnt=events.filter(e=>e.category===k).length; if(cnt===0)return null; return (<div key={k} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}><span style={{ color:cat.color, display:'flex' }}>{cat.icon}</span><span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", flex:1 }}>{cat.label}</span><span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", color:'var(--text-secondary)' }}>{cnt}</span></div>) })}
        </div>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12, boxShadow:'var(--shadow-sm)' }}>
          <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--accent)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>Επόμενα</p>
          {upcoming7.length===0&&<p style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Κανένα εκκρεμές</p>}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {upcoming7.map(ev=>{
              const d=daysUntil(ev.event_date); const cat=CATEGORIES[ev.category]
              const when=d===0?'Σήμερα':d===1?'Αύριο':`σε ${d} ημέρες`
              const soon=d<=1
              return (
                <div key={ev.id} title={`${ev.title}${ev.event_time?`, ${ev.event_time}`:''} ${when}`} style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                  <div style={{ width:3, borderRadius:2, background:cat.color, alignSelf:'stretch', flexShrink:0, minHeight:30, opacity:0.85 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12.5, fontFamily:"'Inter',sans-serif", color:'var(--text-primary)', lineHeight:1.35, marginBottom:3, letterSpacing:'0.1px' }}>{ev.title}</p>
                    <div style={{ display:'flex', gap:8, alignItems:'baseline', flexWrap:'wrap' }}>
                      <span style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", fontWeight:soon?600:400, color:soon?'var(--text-primary)':'var(--text-tertiary)' }}>{when}</span>
                      {ev.amount!=null&&<span style={{ fontSize:11.5, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)' }}>{ev.amount.toLocaleString('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0})}</span>}
                    </div>
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

// Week View
function WeekView({ events, currentDate, selectedDate, onDayClick, onSlotClick, onEventClick, drag, stays=[] }: { events:CalEvent[]; currentDate:Date; selectedDate?:string; onDayClick:(date:string)=>void; onSlotClick:(date:string,time:string)=>void; onEventClick:(e:CalEvent)=>void; drag?:DragCtl; stays?:StaySpan[] }) {
  const d=new Date(currentDate); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); d.setDate(diff)
  const weekDays=Array.from({length:7},(_,i)=>{ const nd=new Date(d); nd.setDate(d.getDate()+i); return nd })
  const dsOf=(dt:Date)=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  const today=todayStr()
  const weekHasToday=weekDays.some(wd=>dsOf(wd)===today)
  // Πλήρες 24ωρο (00:00–24:00) — με scroll για όλη τη μέρα.
  const wkStartH=0, wkEndH=24
  const HOURS=Array.from({length:wkEndH-wkStartH},(_,i)=>i+wkStartH)
  const GRID='56px repeat(7, minmax(116px, 1fr))'
  const weekHasStay=weekDays.some(wd=>staysOnDay(stays,dsOf(wd)).length>0)
  const hasAllDay=weekHasStay||weekDays.some(wd=>events.some(e=>e.event_date===dsOf(wd)&&!e.event_time&&!(e.source||'').startsWith('booking:')))
  // Πλήρες 24ωρο: scroll στην πρώτη ώρα με γεγονός (ή πρωί/τρέχουσα) με το άνοιγμα.
  const HOUR_ROW=46
  const gridRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{ const el=gridRef.current; if(!el)return; const hrs=events.filter(e=>!!e.event_time).map(e=>parseInt((e.event_time||'0:0').split(':')[0])); const h=hrs.length?Math.min(...hrs):(weekHasToday?athensNow().getHours():8); el.scrollTop=Math.max(0,(h-1)*HOUR_ROW)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dsOf(weekDays[0])])
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:16, overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
      <div style={{ overflowX:'auto' }}>
        <div style={{ minWidth:868 }}>
          {/* Επικεφαλίδες ημερών */}
          <div style={{ display:'grid', gridTemplateColumns:GRID, borderBottom:'1px solid var(--border-subtle)', position:'sticky', top:0, background:'var(--bg-elevated)', zIndex:1 }}>
            <div/>
            {weekDays.map((wd,idx)=>{ const ds=dsOf(wd); const isToday=ds===today; const isSel=!!selectedDate&&ds===selectedDate&&!isToday; const mark=isToday||isSel; const hol=holidayName(ds); return (
              <div key={idx} onClick={()=>onDayClick(ds)} title={hol?`Αργία: ${hol}`:'Επιλογή ημέρας'} style={{ padding:'10px 6px 8px', textAlign:'center', cursor:'pointer', borderLeft:'1px solid var(--border-subtle)', background:'transparent' }}>
                <p style={{ fontSize:11, fontWeight:600, color:mark?'var(--accent)':'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', fontFamily:"'Inter',sans-serif" }}>{DAY_NAMES_GR[idx===6?0:idx+1]}</p>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, marginTop:3, borderRadius:'50%', fontSize:15, fontWeight:mark?700:500, background:mark?'var(--accent)':'transparent', color:mark?'var(--accent-text)':'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>{wd.getDate()}</span>
                {hol&&<p title={hol} style={{ fontSize:9, color:'var(--text-tertiary)', fontWeight:500, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{hol}</p>}
              </div>
            )})}
          </div>
          {/* Ολοήμερα */}
          {hasAllDay&&(
            <div style={{ display:'grid', gridTemplateColumns:GRID, borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-surface)' }}>
              <div style={{ fontSize:10, color:'var(--text-tertiary)', textAlign:'right', padding:'6px 8px', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Inter',sans-serif" }}>Ολοήμερα</div>
              {weekDays.map((wd,idx)=>{ const ds=dsOf(wd); const evs=events.filter(e=>e.event_date===ds&&!e.event_time&&!(e.source||'').startsWith('booking:')); const dayStays=staysOnDay(stays,ds); return (
                <div key={idx} data-drop-date={ds} data-drop-time="" style={{ borderLeft:'1px solid var(--border-subtle)', padding:4, display:'flex', flexDirection:'column', gap:3, minHeight:28 }}>
                  {dayStays.map(s=>{ const m=segMeta(s,ds,idx===6?6:idx===0?0:idx); const cc=channelColor(s.channel); return (
                    <Tooltip key={s.id} text={`${s.guest} · ${cc.label}\n${s.start} → ${s.end}`}>
                      <div style={{ height:20, display:'flex', alignItems:'center', background:`color-mix(in srgb, ${cc.solid} 90%, var(--bg-elevated))`, color:'#fff', fontSize:10.5, fontWeight:600, fontFamily:"'Inter',sans-serif", paddingLeft:m.showLabel?7:0, borderTopLeftRadius:m.roundLeft?7:0, borderBottomLeftRadius:m.roundLeft?7:0, borderTopRightRadius:m.roundRight?7:0, borderBottomRightRadius:m.roundRight?7:0, marginLeft:m.roundLeft?0:-4, marginRight:m.roundRight?0:-4, overflow:'hidden', whiteSpace:'nowrap' }}>
                        {m.showLabel&&<span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{m.isStart&&<User size={9} style={{ marginRight:3, verticalAlign:'-1px', opacity:0.85 }}/>}{s.guest}</span>}
                      </div>
                    </Tooltip>
                  )})}
                  {evs.map(ev=>(
                    <button key={ev.id} onPointerDown={!ev._virtual&&drag?drag.onDown(ev.id,ev.title):undefined} onClick={()=>onEventClick(ev)} title={ev.title} style={{ touchAction:'none', display:'block', width:'100%', textAlign:'left', fontSize:11, padding:'3px 7px', borderRadius:7, border:'none', borderLeft:'3px solid '+(isOverdue(ev)?'var(--negative)':'var(--accent)'), background:isOverdue(ev)?'var(--negative-soft)':'var(--accent-soft)', color:'var(--text-primary)', cursor:ev._virtual?'pointer':'grab', opacity:ev.status==='paid'?0.5:ev._virtual?0.75:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{(ev.recurring||ev._virtual)&&<RotateCcw size={9} style={{ marginRight:3, verticalAlign:'middle', opacity:0.7 }}/>}{ev.title}</button>
                  ))}
                </div>
              )})}
            </div>
          )}
          {/* Πλέγμα ωρών */}
          <div ref={gridRef} style={{ maxHeight:560, overflowY:'auto' }}>
            {HOURS.map(h=>{ const hh=String(h).padStart(2,'0'); return (
              <div key={h} style={{ display:'grid', gridTemplateColumns:GRID, minHeight:46, borderBottom:'1px solid var(--border-subtle)', position:'relative' }}>
                <NowLine show={weekHasToday} hour={h} gutter={56}/>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', textAlign:'right', padding:'4px 8px', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>{hh}:00</div>
                {weekDays.map((wd,idx)=>{ const ds=dsOf(wd); const evs=events.filter(e=>e.event_date===ds&&!!e.event_time&&parseInt((e.event_time||'0:0').split(':')[0])===h); return (
                  <div key={idx} onClick={()=>onSlotClick(ds,`${hh}:00`)} data-drop-date={ds} data-drop-time={`${hh}:00`} title="Επιλογή ώρας · πάτησε «Νέο» για καταχώρηση" style={{ borderLeft:'1px solid var(--border-subtle)', padding:3, cursor:'pointer', display:'flex', flexDirection:'column', gap:3, background:'transparent' }}>
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
function TimelineView({ events, currentYear, onYearChange, onPickMonth }: { events:CalEvent[]; currentYear:number; onYearChange:(y:number)=>void; onPickMonth?:(monthIndex:number)=>void }) {
  const today=athensNow(); const todayMonth=today.getMonth()
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
            const monthEvs=events.filter(e=>+e.event_date.slice(0,4)===currentYear&&+e.event_date.slice(5,7)-1===mIdx)
            const isCurrentMonth=mIdx===todayMonth&&currentYear===today.getFullYear()
            const isPast=currentYear<today.getFullYear()||(currentYear===today.getFullYear()&&mIdx<todayMonth)
            const pending=monthEvs.filter(e=>e.status==='pending')
            const totalM=pending.reduce((s,e)=>s+(e.amount||0),0)
            const overdueCount=monthEvs.filter(isOverdue).length
            return (
              <button key={mIdx} onClick={()=>onPickMonth?.(mIdx)} title={`Άνοιγμα ${MONTH_NAMES_GR[mIdx]}`} style={{ textAlign:'left', background:isCurrentMonth?'var(--accent-dim)':'var(--bg-elevated)', border:`1px solid ${isCurrentMonth?'var(--border-accent)':overdueCount>0?'var(--negative-border)':'var(--border-subtle)'}`, borderRadius:8, padding:'8px 5px', minHeight:100, cursor:onPickMonth?'pointer':'default', transition:'border-color 0.13s, transform 0.1s' }} onMouseEnter={e=>{if(onPickMonth){e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.transform='translateY(-2px)'}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=isCurrentMonth?'var(--border-accent)':overdueCount>0?'var(--negative-border)':'var(--border-subtle)';e.currentTarget.style.transform='none'}}>
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
              </button>
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
// Έξυπνος συγχρονισμός: αναγνωρίζει τον τύπο μίσθωσης του ακινήτου και τραβά ΜΟΝΟ
// ό,τι έχει νόημα — μακροχρόνια → ενοίκιο & λήξεις μίσθωσης· βραχυχρόνια → κρατήσεις
// με το όνομα του επισκέπτη. Δείχνει ζωντανά πλήθη ανά πηγή πριν τραβήξει.
type SyncKey='bills'|'maintenance'|'leases'|'bookings'|'tax'|'loans'
function AutoPullPanel({ propertyId, userId, onRefresh, onClose }: { propertyId:string; userId:string; onRefresh:()=>void; onClose?:()=>void }) {
  const supabase=createClient()
  const [busy,setBusy]=useState<SyncKey|null>(null)
  const [mode,setMode]=useState<'long_term'|'short_term'|null>(null)
  const [counts,setCounts]=useState<Record<SyncKey,number>|null>(null)
  const [done,setDone]=useState<Record<string,{n:number;at:string}>>({})
  const [lastSync,setLastSync]=useState<string|null>(null)
  const taxProfile=(mode==='short_term'?'short_term':mode==='long_term'?'long_term':'owner')

  const cnt=async(table:string,extra?:(q:any)=>any)=>{ let q=supabase.from(table).select('*',{count:'exact',head:true}).eq('property_id',propertyId); if(extra)q=extra(q); const{count}=await q; return count||0 }
  useEffect(()=>{
    (async()=>{
      const[{data:prop},bills,maintenance,leases,bookings,loans]=await Promise.all([
        supabase.from('user_properties').select('rental_mode').eq('id',propertyId).maybeSingle(),
        cnt('bills'), cnt('maintenance_tasks'),
        cnt('tenants',(q:any)=>q.neq('status','past')), cnt('client_stays'), cnt('loans'),
      ])
      const m=(prop as any)?.rental_mode==='short_term'?'short_term':(prop as any)?.rental_mode==='long_term'?'long_term':null
      const prof=(m==='short_term'?'short_term':m==='long_term'?'long_term':'owner')
      const tax=greekPropertyTaxObligations(athensNow().getFullYear(),prof).length
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

  const META:Record<SyncKey,{label:string;icon:React.ReactNode;unit:(n:number)=>string}>={
    leases:     {label:'Ενοίκιο & μισθώσεις', icon:<Euro size={15}/>,     unit:n=>n===1?'1 ενοικιαστής':`${n} ενοικιαστές`},
    bookings:   {label:'Κρατήσεις',            icon:<User size={15}/>,     unit:n=>n===1?'1 κράτηση':`${n} κρατήσεις`},
    tax:        {label:'Φορολογικά (ΑΑΔΕ)',    icon:<FileText size={15}/>, unit:n=>n===1?'1 προθεσμία':`${n} προθεσμίες`},
    loans:      {label:'Δόσεις δανείου',        icon:<TrendingUp size={15}/>,unit:n=>n===1?'1 δάνειο':`${n} δάνεια`},
    bills:      {label:'Λογαριασμοί',          icon:<Zap size={15}/>,      unit:n=>n===1?'1 λογαριασμός':`${n} λογαριασμοί`},
    maintenance:{label:'Συντήρηση',            icon:<Wrench size={15}/>,   unit:n=>n===1?'1 εργασία':`${n} εργασίες`},
  }

  // Συγχρονισμός ΜΙΑΣ πηγής — το ίδιο το κουτάκι είναι το κουμπί. Χωρίς on/off,
  // χωρίς ξεχωριστό «Συγχρονισμός τώρα»: πατάς π.χ. «Φορολογικά (ΑΑΔΕ)» και
  // τραβιούνται ΟΛΕΣ οι καταληκτικές αλλά και οι πρώτες ημερομηνίες.
  async function syncOne(k:SyncKey):Promise<number> {
    // ── Λογαριασμοί ──
    if(k==='bills'){
      const{data:bills}=await supabase.from('bills').select('*').eq('property_id',propertyId)
      await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source','bills')
      // Καθάρισε και τυχόν σκαναρισμένη υπενθύμιση λογαριασμού (source='scan',
      // category='bills') ώστε να μη συνυπάρχει με τη συγχρονισμένη — μία εγγραφή.
      await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source','scan').eq('category','bills')
      const today=new Date()
      const rows=(bills||[]).filter((b:any)=>b.due_date||b.next_due_date).map((b:any)=>{
        let dueDate=b.due_date||b.next_due_date; const d=new Date(dueDate)
        if(d<today){d.setMonth(today.getMonth());d.setFullYear(today.getFullYear());if(d<today)d.setMonth(d.getMonth()+1);dueDate=d.toISOString().split('T')[0]}
        return{property_id:propertyId,user_id:userId,title:b.name||b.provider||'Λογαριασμός',category:'bills' as EventCategory,event_date:dueDate,amount:b.amount||null,priority:'medium' as EventPriority,status:(b.paid?'paid':'pending') as EventStatus,recurring:true,recurring_interval:'monthly',notes:b.category?`Κατηγορία: ${b.category}`:null,source:'bills'}
      })
      if(rows.length)await supabase.from('calendar_events').insert(rows)
      return rows.length
    }
    // ── Συντήρηση ──
    if(k==='maintenance'){
      const{data:tasks}=await supabase.from('maintenance_tasks').select('*').eq('property_id',propertyId)
      await supabase.from('calendar_events').delete().eq('property_id',propertyId).in('source',['loan','maintenance'])
      const rows=(tasks||[]).filter((t:any)=>t.due_date).map((t:any)=>({property_id:propertyId,user_id:userId,title:t.title||'Εργασία συντήρησης',category:'maintenance' as EventCategory,event_date:t.due_date,amount:null,priority:(t.priority||'medium') as EventPriority,status:(t.completed?'paid':'pending') as EventStatus,recurring:false,notes:t.description||null,source:'maintenance'}))
      if(rows.length)await supabase.from('calendar_events').insert(rows)
      return rows.length
    }
    // ── Ενοίκιο & μισθώσεις (πραγματικά δεδομένα ενοικιαστή, idempotent) ──
    if(k==='leases'){
      const{data:tenants}=await supabase.from('tenants').select('*').eq('property_id',propertyId).neq('status','past')
      let n=0
      for(const t of (tenants||[])){ await syncTenantSchedule(supabase,t as any,propertyId,userId,'save',{rentDueDay:(t as any).rent_due_day??1}); if((t as any).monthly_rent)n++ }
      return n
    }
    // ── Κρατήσεις (με όνομα επισκέπτη) ──
    if(k==='bookings'){
      const{data:stays}=await supabase.from('client_stays').select('id,check_in,check_out,total,nights,guests,channel,clients(full_name)').eq('property_id',propertyId)
      await supabase.from('calendar_events').delete().eq('property_id',propertyId).like('source','booking:%')
      const rows=buildBookingEvents((stays||[]).map((s:any)=>({id:s.id,check_in:s.check_in,check_out:s.check_out,total:s.total,nights:s.nights,guests:s.guests,channel:s.channel,guest_name:s.clients?.full_name??null})),propertyId,userId)
      if(rows.length)await supabase.from('calendar_events').insert(rows)
      return rows.length
    }
    // ── Φορολογικά (ΑΑΔΕ): πραγματικές, θεσμοθετημένες προθεσμίες — έκδοση/1η/τελευταία δόση ──
    if(k==='tax'){
      const year=athensNow().getFullYear()
      const obs=[...greekPropertyTaxObligations(year,taxProfile),...greekPropertyTaxObligations(year+1,taxProfile).filter(o=>o.date<`${year+1}-04-01`)]
      await supabase.from('calendar_events').delete().eq('property_id',propertyId).like('source','tax:%')
      const rows=obs.map(o=>taxObligationToEvent(o,propertyId,userId))
      if(rows.length)await supabase.from('calendar_events').insert(rows)
      return rows.length
    }
    // ── Δόσεις δανείου: ίδιο source με το κουμπί των Δανείων → idempotent, χωρίς διπλά ──
    if(k==='loans'){
      const{data:loans}=await supabase.from('loans').select('*').eq('property_id',propertyId)
      let n=0
      for(const l of (loans||[])){
        const amount=Number((l as any).amount)||0, rate=Number((l as any).rate)||0, years=Number((l as any).years)||0
        const start=(l as any).start_date||todayStr(); const bank=(l as any).bank||''
        if(!amount||!years)continue
        const monthly=annuityMonthly(amount,rate,years); if(!monthly)continue
        const src='loan_schedule:'+(bank||'γενικό').toLowerCase().replace(/\s+/g,'_').slice(0,40)
        const d=new Date(start); const cnt2=Math.min(years*12,60); const rows:any[]=[]
        for(let i=0;i<cnt2;i++){ const ev=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate()); rows.push({property_id:propertyId,user_id:userId,title:`Δόση δανείου${bank?`, ${bank}`:''}`,category:'financial',event_date:ev.toISOString().split('T')[0],amount:Math.round(monthly),priority:'high',status:'pending',recurring:false,recurring_interval:null,notes:`${Math.round(monthly).toLocaleString('el-GR')} €/μήνα`,source:src}) }
        await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source',src)
        for(let i=0;i<rows.length;i+=20)await supabase.from('calendar_events').insert(rows.slice(i,i+20))
        n+=rows.length
      }
      return n
    }
    return 0
  }

  async function runOne(k:SyncKey) {
    if(busy) return
    setBusy(k)
    let n=0
    try{ n=await syncOne(k) }finally{
      const stamp=new Date().toLocaleString('el-GR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      setDone(d=>({...d,[k]:{n,at:stamp}}))
      setLastSync(stamp); try{ localStorage.setItem(`cal_sync_${propertyId}`,stamp) }catch{}
      setBusy(null); onRefresh()
    }
  }

  const modeHint=mode==='short_term'?'Βραχυχρόνια μίσθωση, τραβάω τις κρατήσεις με το όνομα του επισκέπτη.'
    :mode==='long_term'?'Μακροχρόνια μίσθωση, τραβάω την είσπραξη ενοικίου και τις λήξεις.'
    :'Τραβάω αυτόματα ό,τι αφορά αυτό το ακίνητο.'

  const hasTax=(counts?.tax||0)>0
  return (
    <div style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius:18, padding:'20px 22px', boxShadow:'0 1px 0 rgba(255,255,255,0.05) inset, 0 18px 44px -22px rgba(0,0,0,0.6)', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:24, right:24, height:1, background:'linear-gradient(90deg, transparent, var(--accent-border), transparent)', opacity:0.7 }}/>
      {onClose&&<button aria-label="Κλείσιμο" onClick={onClose} style={{ position:'absolute', top:14, right:14, width:32, height:32, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.color='var(--text-secondary)'}}><X size={16}/></button>}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:16, paddingRight:38 }}>
        <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:11, flexShrink:0, background:'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #000))', color:'var(--accent-text)', boxShadow:'0 6px 16px -6px var(--accent)' }}><RefreshCw size={17}/></span>
        <div style={{ minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <p style={{ fontSize:15.5, fontFamily:"'Inter',sans-serif", fontWeight:700, color:'var(--text-primary)', letterSpacing:'0.1px' }}>Έξυπνος συγχρονισμός</p>
            {mode&&<span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--accent)', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:20, padding:'2px 9px', fontFamily:"'Inter',sans-serif" }}>{mode==='short_term'?'Βραχυχρόνια':'Μακροχρόνια'}</span>}
          </div>
          <p style={{ fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", marginTop:4, lineHeight:1.45 }}>{modeHint} Πάτησε μια πηγή για να την τραβήξεις.</p>
          {lastSync&&<p style={{ fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", marginTop:4 }}>Τελευταίος συγχρονισμός: {lastSync}</p>}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap:10 }}>
        {visible.map(k=>{
          const c=counts?.[k]; const has=(c||0)>0; const meta=META[k]
          const isBusy=busy===k; const d=done[k]; const disabled=!has||(busy!==null&&!isBusy)
          return (
            <button key={k} onClick={()=>has&&runOne(k)} disabled={disabled} style={{ display:'flex', alignItems:'center', gap:11, padding:'13px 15px', background:isBusy?'color-mix(in srgb, var(--accent) 9%, var(--bg-surface))':'var(--bg-surface)', border:`1px solid ${isBusy?'var(--accent-border)':'var(--border-subtle)'}`, borderRadius:13, cursor:has&&!disabled?'pointer':'default', opacity:has?(disabled&&!isBusy?0.6:1):0.5, textAlign:'left', boxShadow:isBusy?'0 6px 18px -12px var(--accent)':'0 1px 2px rgba(0,0,0,0.15)', transition:'transform 0.14s, box-shadow 0.14s, border-color 0.14s, background 0.14s' }} onMouseEnter={e=>{if(has&&!disabled){e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 8px 20px -12px rgba(0,0,0,0.5)';e.currentTarget.style.borderColor='var(--accent-border)'}}} onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow=isBusy?'0 6px 18px -12px var(--accent)':'0 1px 2px rgba(0,0,0,0.15)';e.currentTarget.style.borderColor=isBusy?'var(--accent-border)':'var(--border-subtle)'}}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:10, flexShrink:0, background:isBusy?'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 72%, #000))':'var(--bg-elevated)', color:isBusy?'var(--accent-text)':'var(--text-tertiary)', border:isBusy?'none':'1px solid var(--border-subtle)', boxShadow:isBusy?'0 4px 12px -6px var(--accent)':'none' }}>{isBusy?<RefreshCw size={16} style={{ animation:'spin 1s linear infinite' }}/>:meta.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13.5, fontFamily:"'Inter',sans-serif", fontWeight:600, color:isBusy?'var(--accent)':'var(--text-primary)' }}>{meta.label}</p>
                <p style={{ fontSize:11.5, color:d?'var(--positive)':'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", marginTop:1 }}>{isBusy?'Συγχρονισμός…':d?`Ενημερώθηκε · ${d.n}`:counts===null?'…':has?meta.unit(c!):'Τίποτα ακόμη'}</p>
              </div>
              {has&&!isBusy&&(d?<Check size={17} style={{ color:'var(--positive)', flexShrink:0 }}/>:<RefreshCw size={15} style={{ color:'var(--text-tertiary)', flexShrink:0 }}/>)}
            </button>
          )
        })}
      </div>
      {hasTax&&(
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginTop:12, fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>
          <Info size={13} style={{ color:'var(--accent)' }}/>
          Οι φορολογικές προθεσμίες βασίζονται στο πλαίσιο της ΑΑΔΕ (έκδοση, 1η & τελευταία δόση). Διπλός έλεγχος:
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
function EventModal({ form, setForm, onSave, onClose, editing, saving, conflicts }: {
  form:FormState; setForm:React.Dispatch<React.SetStateAction<FormState>>
  onSave:()=>void; onClose:()=>void; editing:boolean; saving:boolean; conflicts?:number
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
          <button aria-label="Κλείσιμο" onClick={onClose} style={{ width:32, height:32, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.color='var(--text-secondary)'}}><X size={16}/></button>
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
            {/* Πρόσκληση συμμετέχοντα — στέλνει invite (.ics/mailto/WhatsApp/Viber) στην επαφή */}
            {(()=>{ if(!form.title.trim()||!form.event_date)return null
              const inv={title:form.title,date:form.event_date,time:form.event_time||undefined,durationMinutes:form.duration?+form.duration:undefined,details:form.notes||undefined,attendeeEmail:form.email||undefined,attendeePhone:form.phone||undefined}
              const cap=canInvite(inv); if(!cap.email&&!cap.phone)return null
              const btn:React.CSSProperties={ display:'inline-flex', alignItems:'center', gap:6, height:34, padding:'0 12px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:12.5, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", textDecoration:'none' }
              return (
                <div>
                  <label style={lbl}>Πρόσκληση</label>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {cap.email&&<a href={inviteMailto(inv)} style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><FileText size={13}/>Email</a>}
                    {cap.phone&&<a href={inviteWhatsApp(inv)} target="_blank" rel="noreferrer" style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}>WhatsApp</a>}
                    {cap.phone&&<a href={inviteViber(inv)} style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}>Viber</a>}
                    <button type="button" onClick={()=>{ const blob=new Blob([buildInviteICS(inv)],{type:'text/calendar'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='invite.ics'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000) }} style={btn} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border-default)'}><CalendarPlus size={13}/>.ics</button>
                  </div>
                </div>
              )
            })()}
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
function Section({ title, color, events, onToggle, onEdit, onDelete, collapsed=false, desc=false, bulkMode, selectedIds, onSelect }: {
  title:string; color:string; events:CalEvent[]; onToggle:(e:CalEvent)=>void; onEdit:(e:CalEvent)=>void; onDelete:(id:string)=>void
  collapsed?:boolean; desc?:boolean; bulkMode?:boolean; selectedIds?:Set<string>; onSelect?:(id:string)=>void
}) {
  const [open,setOpen]=useState(!collapsed)
  const sorted=[...events].sort((a,b)=>desc?b.event_date.localeCompare(a.event_date):a.event_date.localeCompare(b.event_date))
  return (
    <div>
      <button onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', marginBottom:open?11:0, padding:0 }}>
        <span style={{ width:6, height:6, borderRadius:2, background:color, flexShrink:0, opacity:0.9 }}/>
        <span style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:600, color:'var(--text-primary)', letterSpacing:'0.06em', textTransform:'uppercase' }}>{title}</span>
        <span style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--text-tertiary)', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'0 7px', lineHeight:'17px' }}>{events.length}</span>
        <ChevronDown size={13} color="var(--text-tertiary)" style={{ transform:open?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
      </button>
      {open&&(
        <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
          {sorted.map(e=>(
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
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if(e.key==='Escape')onClose() }; document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h) },[onClose])
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
  const [copiedBusy,setCopiedBusy]=useState(false)
  useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if(e.key==='Escape')onClose() }; document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h) },[onClose])
  const base=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'')
  const httpsUrl=token?`${base}/functions/v1/calendar-feed?token=${token}&property=${propertyId}`:''
  const busyUrl=token?`${base}/functions/v1/bookings-feed?token=${token}&property=${propertyId}`:''
  const copyBusy=async()=>{ try{ await navigator.clipboard.writeText(busyUrl); setCopiedBusy(true); setTimeout(()=>setCopiedBusy(false),1800) }catch{} }
  const webcalUrl=httpsUrl.replace(/^https?:\/\//,'webcal://')
  const googleUrl=`https://calendar.google.com/calendar/r/settings/addbyurl?url=${encodeURIComponent(httpsUrl)}`
  const copy=async()=>{ try{ await navigator.clipboard.writeText(httpsUrl); setCopied(true); setTimeout(()=>setCopied(false),1800) }catch{} }
  const linkBtn:React.CSSProperties={ display:'flex', alignItems:'center', justifyContent:'center', gap:8, height:44, borderRadius:12, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:14, fontWeight:500, textDecoration:'none', fontFamily:"'Inter',sans-serif", cursor:'pointer' }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(8,10,14,0.55)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', borderRadius:22, width:'100%', maxWidth:500, border:'1px solid var(--border-subtle)', boxShadow:'0 1px 0 rgba(255,255,255,0.05) inset, 0 40px 90px -30px rgba(0,0,0,0.7)', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:32, right:32, height:1, background:'linear-gradient(90deg, transparent, var(--accent-border), transparent)' }}/>
        <div style={{ padding:'24px 28px 18px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div style={{ display:'flex', gap:13 }}>
            <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:40, height:40, borderRadius:12, flexShrink:0, background:'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #000))', color:'var(--accent-text)', boxShadow:'0 8px 20px -8px var(--accent)' }}><CalendarPlus size={19}/></span>
            <div>
              <h3 style={{ fontFamily:"'Inter',sans-serif", fontSize:18, fontWeight:700, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>Ζωντανή συνδρομή</h3>
              <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:'5px 0 0', lineHeight:1.5, fontFamily:"'Inter',sans-serif" }}>Σύνδεσε μία φορά — το ημερολόγιό σου ενημερώνεται αυτόματα σε Google, Apple ή Outlook.</p>
            </div>
          </div>
          <button aria-label="Κλείσιμο" onClick={onClose} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:10, width:32, height:32, cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.color='var(--text-secondary)'}}><X size={16}/></button>
        </div>
        <div style={{ padding:'8px 28px 26px', display:'flex', flexDirection:'column', gap:16 }}>
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
            {/* Αμφίδρομος συγχρονισμός καναλιών (Airbnb/Booking auto-block) */}
            <div style={{ paddingTop:16, borderTop:'1px solid var(--border-subtle)' }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--text-secondary)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif" }}>Μπλοκάρισμα σε Airbnb / Booking</label>
              <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'0 0 8px', lineHeight:1.5, fontFamily:"'Inter',sans-serif" }}>Επικόλλησε αυτόν τον σύνδεσμο στο «Import calendar» κάθε καναλιού — κάθε κράτηση μπλοκάρει αυτόματα τις ημερομηνίες παντού (χωρίς όνομα επισκέπτη).</p>
              <div style={{ display:'flex', gap:8 }}>
                <input readOnly value={busyUrl} onFocus={e=>e.currentTarget.select()} style={{ flex:1, minWidth:0, height:40, padding:'0 12px', borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:12.5, fontFamily:"'Inter',sans-serif" }}/>
                <button onClick={copyBusy} style={{ height:40, padding:'0 16px', borderRadius:10, border:'none', background:copiedBusy?'var(--positive)':'var(--accent)', color:'var(--accent-text)', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}>{copiedBusy?'Αντιγράφηκε':'Αντιγραφή'}</button>
              </div>
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
  const now=athensNow()
  if(now.getHours()!==hour)return null
  const frac=now.getMinutes()/60
  return (
    <div style={{ position:'absolute', left:gutter, right:0, top:`${frac*100}%`, height:2, background:'var(--negative)', zIndex:3, pointerEvents:'none' }}>
      <span style={{ position:'absolute', left:-5, top:-4, width:9, height:9, borderRadius:'50%', background:'var(--negative)' }}/>
    </div>
  )
}

function DayView({ events, currentDate, onSlotClick, onEventClick, drag, onResize }: {
  events:CalEvent[]; currentDate:Date; onSlotClick:(date:string,time:string)=>void; onEventClick:(e:CalEvent)=>void; drag?:DragCtl; onResize?:(id:string,dur:number)=>void
}) {
  const y=currentDate.getFullYear(), m=currentDate.getMonth(), d=currentDate.getDate()
  const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  const isToday=dateStr===todayStr()
  const dayEvents=events.filter(e=>e.event_date===dateStr)
  const allDay=dayEvents.filter(e=>!e.event_time)
  const timed=dayEvents.filter(e=>!!e.event_time)
  const toMin=(t?:string|null)=>{const[a,b]=(t||'0:0').split(':').map(Number);return a*60+(b||0)}
  // Πλήρες 24ωρο (00:00–24:00) — με scroll για όλη τη μέρα.
  const startH=0, endH=24
  const HOURS=Array.from({length:endH-startH},(_,i)=>i+startH)
  const HOUR_H=58, START_MIN=startH*60, END_MIN=endH*60
  const laid=layoutDay(timed,e=>toMin(e.event_time),e=>toMin(e.event_time)+(e.duration_minutes||60))
  // Resize με σύρσιμο της κάτω λαβής (ns-resize) — ζωντανή προεπισκόπηση ύψους.
  const rz=useRef<{id:string;startY:number;startDur:number}|null>(null)
  const resized=useRef(false)
  const [rzDur,setRzDur]=useState<{id:string;dur:number}|null>(null)
  useEffect(()=>{
    const move=(ev:PointerEvent)=>{ const s=rz.current; if(!s)return; ev.preventDefault(); resized.current=true; const dur=Math.max(15,Math.min(720,Math.round((s.startDur+(ev.clientY-s.startY)/HOUR_H*60)/15)*15)); setRzDur({id:s.id,dur}) }
    const up=()=>{ const s=rz.current; rz.current=null; if(s&&resized.current&&rzDur&&onResize)onResize(s.id,rzDur.dur); setRzDur(null); setTimeout(()=>{resized.current=false},60) }
    window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',up)
    return ()=>{ window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up) }
  },[rzDur,onResize])
  const startResize=(id:string,dur:number)=>(ev:React.PointerEvent)=>{ if(ev.button&&ev.button!==0)return; ev.stopPropagation(); ev.preventDefault(); resized.current=false; rz.current={id,startY:ev.clientY,startDur:dur} }
  // Πλήρες 24ωρο: με το άνοιγμα κάνε scroll στην πρώτη ώρα με γεγονός (ή πρωί/τρέχουσα ώρα)
  // ώστε να μη «κρύβεται» η μέρα κάτω από τα μεσάνυχτα.
  const gridRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{ const el=gridRef.current; if(!el)return; const h=timed.length?Math.min(...timed.map(e=>Math.floor(toMin(e.event_time)/60))):(isToday?athensNow().getHours():8); el.scrollTop=Math.max(0,(h-1)*HOUR_H)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dateStr])
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
      <div ref={gridRef} style={{ maxHeight:600, overflowY:'auto' }}>
        <div style={{ position:'relative', height:HOURS.length*HOUR_H }}>
          {/* Υπόβαθρο: γραμμές ωρών + κλικ για νέο ραντεβού */}
          {HOURS.map((h,i)=>{ const hh=String(h).padStart(2,'0'); return (
            <div key={h} onClick={()=>onSlotClick(dateStr,`${hh}:00`)} data-drop-date={dateStr} data-drop-time={`${hh}:00`} title="Επιλογή ώρας · πάτησε «Νέο» για καταχώρηση" style={{ position:'absolute', top:i*HOUR_H, left:0, right:0, height:HOUR_H, borderBottom:'1px solid var(--border-subtle)', cursor:'pointer' }}>
              <NowLine show={isToday} hour={h} gutter={60}/>
              <span style={{ position:'absolute', left:8, top:4, fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>{hh}:00</span>
              <div style={{ position:'absolute', left:60, top:0, bottom:0, width:1, background:'var(--border-subtle)' }}/>
            </div>
          )})}
          {/* Γεγονότα: αναλογικό ύψος (διάρκεια) + στήλες για επικαλύψεις + λαβή resize */}
          {laid.map(l=>{ const e=l.event as CalEvent
            const liveDur=rzDur&&rzDur.id===e.id?rzDur.dur:(e.duration_minutes||60)
            const s=Math.max(l.startMin,START_MIN), en=Math.min(s+liveDur,END_MIN)
            if(en<=s)return null
            const top=(s-START_MIN)/60*HOUR_H, height=Math.max(24,(en-s)/60*HOUR_H-2)
            const left=`calc(62px + (100% - 66px) * ${l.lane} / ${l.lanes})`, width=`calc((100% - 66px) / ${l.lanes} - 3px)`
            return (
              <button key={e.id} onClick={ev=>{ev.stopPropagation(); if(resized.current)return; onEventClick(e)}} title={`${e.event_time} ${e.title}`} style={{ position:'absolute', top, height, left, width, boxSizing:'border-box', display:'flex', flexDirection:'column', gap:2, padding:'5px 8px', borderRadius:9, border:'none', borderLeft:'3px solid var(--accent)', background:'var(--accent-soft)', color:'var(--text-primary)', fontSize:12.5, fontWeight:500, cursor:'pointer', opacity:e._virtual?0.78:1, textAlign:'left', overflow:'hidden', fontFamily:"'Inter',sans-serif" }}>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ fontVariantNumeric:'tabular-nums', color:'var(--accent)', fontWeight:600 }}>{e.event_time}</span>{(e.recurring||e._virtual)&&<RotateCcw size={9} style={{ opacity:0.6 }}/>}</span>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.title}</span>
                {rzDur&&rzDur.id===e.id&&<span style={{ fontSize:10.5, color:'var(--accent)', fontVariantNumeric:'tabular-nums' }}>{Math.floor(liveDur/60)?`${Math.floor(liveDur/60)}ω `:''}{liveDur%60?`${liveDur%60}′`:''}</span>}
                {!e._virtual&&onResize&&<div onPointerDown={startResize(e.id,e.duration_minutes||60)} title="Σύρε για διάρκεια" style={{ position:'absolute', left:0, right:0, bottom:0, height:9, cursor:'ns-resize', touchAction:'none' }}><div style={{ position:'absolute', left:'50%', bottom:2, transform:'translateX(-50%)', width:24, height:3, borderRadius:2, background:'var(--accent)', opacity:0.5 }}/></div>}
              </button>
            )
          })}
        </div>
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
  const [currentDate,setCurrentDate]=useState(athensNow())
  const [selectedDate,setSelectedDate]=useState<string>(todayStr())
  const [pendingTime,setPendingTime]=useState<string>('')
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
  const [timelineYear,setTimelineYear]=useState(athensNow().getFullYear())
  const [showMenu,setShowMenu]=useState(false)
  const [showSubscribe,setShowSubscribe]=useState(false)
  const [feedToken,setFeedToken]=useState<string|null>(null)
  const menuRef=useRef<HTMLDivElement>(null)
  const importRef=useRef<HTMLInputElement>(null)
  const [importMsg,setImportMsg]=useState<string|null>(null)
  const [notifyOn,setNotifyOn]=useState(false)
  const [stays,setStays]=useState<StaySpan[]>([])
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
    loadStays()
  }
  // Επαναφόρτωση χωρίς spinner (για live ενημερώσεις)
  async function silentReload() {
    const{data}=await supabase.from('calendar_events').select('*').eq('property_id',propertyId).order('event_date')
    setEvents(data||[])
  }
  // Κρατήσεις βραχυχρόνιας (client_stays) → μπάρες διαμονής στην προβολή Μήνα.
  async function loadStays() {
    const{data}=await supabase.from('client_stays').select('id,check_in,check_out,total,channel,clients(full_name)').eq('property_id',propertyId)
    const spans=(data||[]).map((s:any)=>toStaySpan({id:s.id,check_in:s.check_in,check_out:s.check_out,total:s.total,channel:s.channel,guest_name:s.clients?.full_name??null})).filter(Boolean) as StaySpan[]
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

  // Το κλικ σε μέρα/ώρα ΜΟΝΟ επιλέγει (δεν ανοίγει φόρμα). Η φόρμα ανοίγει με «Νέο»,
  // προσυμπληρωμένη με την επιλεγμένη μέρα και (αν υπάρχει) την επιλεγμένη ώρα.
  function openNew(date?:string){setEditingEvent(null);setForm({...EMPTY_FORM,event_date:date||selectedDate||todayStr(),event_time:pendingTime||''});setPendingTime('');setShowModal(true)}
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
  // Αλλαγή διάρκειας με σύρσιμο (resize) — ελάχιστη 15', μέγιστη 12 ώρες.
  async function resizeEvent(id:string, durationMinutes:number){
    if(id.includes('__'))return
    const dur=Math.max(15,Math.min(720,Math.round(durationMinutes/15)*15))
    setEvents(prev=>prev.map(e=>e.id===id?{...e,duration_minutes:dur}:e))
    await supabase.from('calendar_events').update({duration_minutes:dur}).eq('id',id)
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
    const fmtD=(s:string)=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,(m||1)-1,d||1).toLocaleDateString('el-GR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})}
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
        {([
          {label:'Εκκρεμή ποσά', value:totalPending>0?totalPending.toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'—', color:totalPending>0?'var(--accent)':'var(--text-secondary)', icon:<TrendingUp size={14}/>, onClick:undefined, open:false},
          {label:'Εκπρόθεσμα', value:overdue.length>0?`${overdue.length} γεγονότα`:'Κανένα', color:overdue.length>0?'var(--negative)':'var(--text-secondary)', icon:<AlertTriangle size={14}/>, onClick:overdue.length>0?()=>setShowOverdue(o=>!o):undefined, open:showOverdue&&overdue.length>0},
          {label:'Επόμενη πληρωμή', value:nextEvent?(daysUntil(nextEvent.event_date)===0?'Σήμερα':`σε ${daysUntil(nextEvent.event_date)} ημέρες`):'—', color:'var(--text-secondary)', icon:<Clock size={14}/>, onClick:undefined, open:false},
          {label:'Λήξεις συμβολαίων', value:expiring.length>0?`${expiring.length} σύντομα`:'Κανένα', color:expiring.length>0?'var(--warning)':'var(--text-secondary)', icon:<Shield size={14}/>, onClick:undefined, open:false},
        ] as {label:string;value:string;color:string;icon:React.ReactNode;onClick?:()=>void;open:boolean}[]).map(kpi=>{
          const clickable=!!kpi.onClick
          return (
          <div key={kpi.label} role={clickable?'button':undefined} tabIndex={clickable?0:undefined} onClick={kpi.onClick} onKeyDown={clickable?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();kpi.onClick!()}}:undefined} style={{ position:'relative', background:kpi.open?`linear-gradient(180deg, color-mix(in srgb, ${kpi.color} 8%, var(--bg-elevated)) 0%, var(--bg-surface) 100%)`:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:`1px solid ${kpi.open?`color-mix(in srgb, ${kpi.color} 45%, var(--border-subtle))`:'var(--border-subtle)'}`, borderRadius:14, padding:'13px 16px', boxShadow:'0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 16px -8px rgba(0,0,0,0.45), 0 2px 4px -2px rgba(0,0,0,0.3)', overflow:'hidden', cursor:clickable?'pointer':'default', transition:'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s' }}
            onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow='0 1px 0 rgba(255,255,255,0.06) inset, 0 16px 32px -12px rgba(0,0,0,0.55), 0 4px 8px -4px rgba(0,0,0,0.35)'}}
            onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 16px -8px rgba(0,0,0,0.45), 0 2px 4px -2px rgba(0,0,0,0.3)'}}>
            <span style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background:kpi.color, opacity:0.55 }}/>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:7 }}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:8, background:`color-mix(in srgb, ${kpi.color} 14%, transparent)`, color:kpi.color }}>{kpi.icon}</span>
              <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', flex:1 }}>{kpi.label}</p>
            </div>
            <p style={{ fontSize:17, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:kpi.color, fontWeight:500, letterSpacing:'0.2px' }}>{kpi.value}</p>
          </div>
        )})}
      </div>

      {/* Εκπρόθεσμα — αναλυτικά, χρονολογικά (παλαιότερο πρώτο) */}
      {showOverdue&&overdue.length>0&&(
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:14, overflow:'hidden', boxShadow:'0 8px 24px -14px rgba(0,0,0,0.5)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, padding:'11px 16px', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-elevated)' }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--negative)', flexShrink:0 }}/>
            <p style={{ fontSize:12.5, fontFamily:"'Inter',sans-serif", fontWeight:600, color:'var(--text-primary)', margin:0, flex:1, letterSpacing:'0.06em', textTransform:'uppercase' }}>Εκπρόθεσμα · {overdue.length}</p>
            <button aria-label="Κλείσιμο" onClick={()=>setShowOverdue(false)} style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.color='var(--text-primary)';e.currentTarget.style.borderColor='var(--border-default)'}} onMouseLeave={e=>{e.currentTarget.style.color='var(--text-secondary)';e.currentTarget.style.borderColor='var(--border-subtle)'}}><X size={14}/></button>
          </div>
          <div>
            {[...overdue].sort((a,b)=>a.event_date.localeCompare(b.event_date)).map((e,i,arr)=>{ const late=Math.abs(daysUntil(e.event_date)); const cat=CATEGORIES[e.category]; return (
              <button key={e.id} onClick={()=>openEdit(e)} style={{ display:'flex', alignItems:'center', gap:12, width:'100%', textAlign:'left', padding:'11px 16px', border:'none', borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none', background:'transparent', cursor:'pointer', transition:'background 0.12s' }} onMouseEnter={ev=>ev.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                <span style={{ width:7, height:7, borderRadius:2, background:cat.color, flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13.5, fontFamily:"'Inter',sans-serif", color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>{e.title}</p>
                  <p style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)', margin:'2px 0 0' }}>{fmt(e.event_date)}{e.event_time?` · ${e.event_time}`:''}</p>
                </div>
                {e.amount!=null&&<span style={{ fontSize:13, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)' }}>{e.amount.toLocaleString('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0})}</span>}
                <span style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)', flexShrink:0 }}>πριν {late===1?'1 ημέρα':`${late} ημέρες`}</span>
              </button>
            )})}
          </div>
        </div>
      )}

      {/* Smart Alerts — μόνο η λήξη συμβολαίων· τα εκπρόθεσμα ανοίγουν από το KPI (χωρίς διπλό κόκκινο) */}
      {expiring.length>0&&(
        <div style={{ display:'flex', alignItems:'center', gap:11, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--warning)', borderRadius:10, padding:'10px 16px' }}>
          <Shield size={14} color="var(--warning)"/>
          <p style={{ fontSize:13.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", letterSpacing:'0.1px', margin:0 }}>
            {expiring.length} συμβόλαι{expiring.length===1?'ο λήγει':'α λήγουν'} εντός 60 ημερών · <span style={{ color:'var(--text-primary)' }}>{expiring.map(e=>`${e.title} (${fmtShort(e.event_date)})`).join(', ')}</span>
          </p>
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
            <button onClick={()=>{setCurrentDate(athensNow());setTimelineYear(athensNow().getFullYear())}} style={{ height:34, padding:'0 14px', borderRadius:17, border:'1px solid var(--border-default)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', fontSize:13, fontWeight:500, fontFamily:"'Inter',sans-serif" }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.color='var(--text-secondary)'}}>Σήμερα</button>
          </div>
        )}

        <div style={{ flex:1, minWidth:100, position:'relative' }}>
          <input aria-label="Αναζήτηση γεγονότος" placeholder="Αναζήτηση γεγονότος…" value={searchQ} onChange={e=>setSearchQ(e.target.value)}
            style={{ width:'100%', height:36, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:18, padding:'0 16px', color:'var(--text-primary)', fontSize:14, fontFamily:"'Inter',sans-serif", outline:'none' }}
            onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}/>
        </div>

        <button onClick={()=>openNew()} title={pendingTime?`Νέο γεγονός στις ${pendingTime}`:'Νέο γεγονός'} style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 18px', background:'var(--accent)', border:'none', borderRadius:18, cursor:'pointer', color:'var(--accent-text)', fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:600, letterSpacing:'0.1px', boxShadow:'var(--shadow-sm)' }}>
          <Plus size={15}/>Νέο{pendingTime?` · ${pendingTime}`:''}
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
          <button onClick={onClick} style={{ display:'inline-flex', alignItems:'center', gap:7, height:34, padding:'0 13px', borderRadius:17, fontSize:13, cursor:'pointer', border:`1px solid ${active?color:'var(--border-subtle)'}`, background:active?`color-mix(in srgb, ${color} 15%, var(--bg-surface))`:'var(--bg-surface)', color:active?color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:600, opacity:count===0&&!active?0.5:1, transition:'background 0.13s, border-color 0.13s, color 0.13s' }} onMouseEnter={e=>{if(!active)e.currentTarget.style.borderColor='var(--border-default)'}} onMouseLeave={e=>{if(!active)e.currentTarget.style.borderColor='var(--border-subtle)'}}>
            {dot&&<span style={{ width:8, height:8, borderRadius:3, background:dot, flexShrink:0 }}/>}
            {label}
            <span style={{ fontSize:11, fontVariantNumeric:'tabular-nums', color:active?color:'var(--text-tertiary)', background:'var(--bg-elevated)', borderRadius:9, padding:'1px 6px', minWidth:16, boxSizing:'border-box', textAlign:'center' }}>{count}</span>
          </button>
        )
        const activeCount=(filterCat!=='all'?1:0)+(filterStatus!=='all'?1:0)+(searchQ?1:0)+((dateFrom||dateTo)?1:0)
        return (
        <div style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius:16, padding:'16px 18px', boxShadow:'0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 34px -18px rgba(0,0,0,0.55)', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Filter size={14} style={{ color:'var(--accent)' }}/>
              <p style={{ fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:600, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>Φίλτρα</p>
              {activeCount>0&&<span style={{ fontSize:10.5, fontWeight:700, color:'var(--accent)', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:20, padding:'1px 8px', fontFamily:"'Inter',sans-serif" }}>{activeCount} ενεργά</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>{setFilterCat('all');setFilterStatus('all');setSearchQ('');setDateFrom('');setDateTo('')}} disabled={!anyActive} style={{ display:'inline-flex', alignItems:'center', gap:6, height:30, padding:'0 12px', borderRadius:15, border:'1px solid '+(anyActive?'var(--border-default)':'var(--border-subtle)'), background:'var(--bg-surface)', color:anyActive?'var(--text-secondary)':'var(--text-tertiary)', fontSize:12.5, fontWeight:500, cursor:anyActive?'pointer':'not-allowed', opacity:anyActive?1:0.5, fontFamily:"'Inter',sans-serif", transition:'all 0.13s' }} onMouseEnter={e=>{if(anyActive){e.currentTarget.style.borderColor='var(--negative)';e.currentTarget.style.color='var(--negative)'}}} onMouseLeave={e=>{e.currentTarget.style.borderColor=anyActive?'var(--border-default)':'var(--border-subtle)';e.currentTarget.style.color=anyActive?'var(--text-secondary)':'var(--text-tertiary)'}}><RotateCcw size={12}/>Καθάρισε</button>
              <button aria-label="Κλείσιμο φίλτρων" onClick={()=>setShowFilters(false)} style={{ width:32, height:32, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='var(--bg-surface)';e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.color='var(--text-secondary)'}}><X size={16}/></button>
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:600, color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:9 }}>Κατηγορία</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <Chip active={filterCat==='all'} color="var(--accent)" onClick={()=>setFilterCat('all')} label="Όλες" count={catBase.length}/>
              {Object.entries(CATEGORIES).map(([k,v])=>(
                <Chip key={k} active={filterCat===k} color={v.color==='var(--text-secondary)'?'var(--accent)':v.color} onClick={()=>setFilterCat(filterCat===k?'all':k as EventCategory)} dot={v.color} label={v.label} count={catCount(k)}/>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:600, color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:9 }}>Κατάσταση</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <Chip active={filterStatus==='all'} color="var(--accent)" onClick={()=>setFilterStatus('all')} label="Όλες" count={statBase.length}/>
              {Object.entries(STATUSES).map(([k,v])=>(
                <Chip key={k} active={filterStatus===k} color={v.color} onClick={()=>setFilterStatus(filterStatus===k?'all':k as EventStatus)} dot={v.color} label={v.label} count={statCount(k)}/>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:10 }}>
              <p style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:600, color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase', margin:0 }}>Εύρος ημερομηνιών</p>
              {(dateFrom||dateTo)&&(()=>{ const f=(d:string)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric'}):'…'; return (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:20, padding:'2px 10px' }}>{f(dateFrom)}<ArrowRight size={11}/>{f(dateTo)}</span>
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
                  <button key={p.label} onClick={()=>{setDateFrom(on?'':p.from);setDateTo(on?'':p.to)}} style={{ height:28, padding:'0 11px', borderRadius:14, border:`1px solid ${on?'var(--accent-border)':'var(--border-subtle)'}`, background:on?'var(--accent-soft)':'var(--bg-surface)', color:on?'var(--accent)':'var(--text-secondary)', fontSize:12, fontWeight:on?600:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.13s' }} onMouseEnter={e=>{if(!on)e.currentTarget.style.borderColor='var(--border-default)'}} onMouseLeave={e=>{if(!on)e.currentTarget.style.borderColor='var(--border-subtle)'}}>{p.label}</button>
                )})}
                {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom('');setDateTo('')}} style={{ display:'inline-flex', alignItems:'center', gap:5, height:28, padding:'0 10px', borderRadius:14, border:'none', background:'transparent', color:'var(--text-tertiary)', fontSize:12, cursor:'pointer', fontFamily:"'Inter',sans-serif" }} onMouseEnter={e=>e.currentTarget.style.color='var(--negative)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}><X size={12}/>Καθαρισμός</button>}
              </div>
            )})()}
          </div>
        </div>
        )
      })()}

      {showAutoPull&&<AutoPullPanel propertyId={propertyId} userId={userId} onRefresh={load} onClose={()=>setShowAutoPull(false)}/>}

      {loading&&<Spinner label="Φόρτωση…" />}

      {!loading&&viewMode==='month'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <MonthView events={monthEvents} currentDate={currentDate} selectedDate={selectedDate} onDayClick={d=>{setSelectedDate(d);setCurrentDate(new Date(d+'T00:00:00'));setPendingTime('')}} onEventClick={openEdit} upcomingAll={filtered} drag={drag} stays={stays}/>
          {monthEvents.length>0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>Γεγονότα {MONTH_NAMES_GR[currentDate.getMonth()]}</p>
              {monthEvents.map(e=>(<EventCard key={e.id} event={e} onToggleStatus={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} selected={selectedIds.has(e.id)} onSelect={toggleSelect} bulkMode={bulkMode}/>))}
            </div>
          )}
          {monthEvents.length===0&&<div style={{ textAlign:'center', padding:'20px 0' }}><p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)' }}>Δεν υπάρχουν γεγονότα αυτόν τον μήνα</p></div>}
        </div>
      )}

      {!loading&&viewMode==='day'&&<DayView events={dayEvents} currentDate={currentDate} onSlotClick={(date,time)=>{setSelectedDate(date);setPendingTime(time)}} onEventClick={openEdit} drag={drag} onResize={resizeEvent}/>}

      {!loading&&viewMode==='week'&&<WeekView events={weekEvents} currentDate={currentDate} selectedDate={selectedDate} onDayClick={d=>{setSelectedDate(d);setCurrentDate(new Date(d+'T00:00:00'));setPendingTime('')}} onSlotClick={(date,time)=>{setSelectedDate(date);setCurrentDate(new Date(date+'T00:00:00'));setPendingTime(time)}} onEventClick={openEdit} drag={drag} stays={stays}/>}

      {!loading&&viewMode==='agenda'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {overdue.length>0&&<Section title="Εκπρόθεσμα" color="var(--negative)" events={overdue} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisWeek.length>0&&<Section title="Επόμενες 7 μέρες" color="var(--accent)" events={thisWeek} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisMonth.length>0&&<Section title="Αυτόν τον μήνα" color="var(--text-secondary)" events={thisMonth} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {later.length>0&&<Section title="Αργότερα" color="var(--text-secondary)" events={later} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {done.length>0&&<Section title="Ολοκληρωμένα / Ακυρωμένα" color="var(--text-tertiary)" events={done} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} collapsed desc bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {filtered.length===0&&<div style={{ textAlign:'center', padding:'50px 0' }}><Calendar size={28} color="var(--text-tertiary)" style={{ margin:'0 auto 12px' }}/><p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", color:'var(--text-tertiary)' }}>Δεν υπάρχουν γεγονότα</p></div>}
        </div>
      )}

      {!loading&&viewMode==='year'&&<TimelineView events={filtered} currentYear={timelineYear} onYearChange={setTimelineYear} onPickMonth={mi=>{setCurrentDate(new Date(timelineYear,mi,1));setViewMode('month')}}/>}

      <input ref={importRef} type="file" accept=".ics,text/calendar" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0]; if(f)importIcs(f); e.currentTarget.value=''}}/>
      {importMsg&&<div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'var(--bg-elevated)', border:'1px solid var(--accent-border)', borderRadius:12, padding:'11px 20px', fontSize:13, color:'var(--text-primary)', zIndex:1200, boxShadow:'0 8px 32px rgba(0,0,0,0.35)', fontFamily:"'Inter',sans-serif" }}>{importMsg}</div>}
      {showModal&&<EventModal form={form} setForm={setForm} onSave={saveEvent} onClose={()=>setShowModal(false)} editing={!!editingEvent} saving={saving} conflicts={formConflicts}/>}
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