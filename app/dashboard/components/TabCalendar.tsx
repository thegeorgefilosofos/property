'use client'
import { useState, useEffect, useRef } from 'react'
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
  TrendingUp, Clock, Info,
} from 'lucide-react'
import { DatePicker } from './UIComponents'

type EventCategory = 'financial' | 'bills' | 'maintenance' | 'contract' | 'tenant' | 'reminder'
type EventPriority = 'low' | 'medium' | 'high' | 'critical'
type EventStatus   = 'pending' | 'paid' | 'cancelled' | 'in_progress'
type ViewMode      = 'month' | 'week' | 'list' | 'timeline'

interface CalEvent {
  id: string; property_id: string; user_id: string; title: string
  category: EventCategory; event_date: string; amount?: number | null
  priority: EventPriority; status: EventStatus; recurring: boolean
  recurring_interval?: string | null; notes?: string | null
  source: string; attachment_url?: string | null; color?: string | null; created_at: string
}

interface FormState {
  title: string; category: EventCategory; event_date: string; amount: string
  priority: EventPriority; status: EventStatus; recurring: boolean
  recurring_interval: string; notes: string; attachment_url: string
}

// Google-aligned category colors
const CATEGORIES: Record<EventCategory, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  financial:   { label: 'Οικονομικά',   color: 'var(--accent)',    bg: 'var(--accent-dim)',    border: 'var(--border-accent)', icon: <Euro size={11}/> },
  bills:       { label: 'Λογαριασμοί', color: 'var(--info)',      bg: 'var(--info-dim)',      border: 'var(--info)',          icon: <Zap size={11}/> },
  maintenance: { label: 'Συντήρηση',   color: 'var(--positive)',  bg: 'var(--positive-dim)',  border: 'var(--positive)',      icon: <Wrench size={11}/> },
  contract:    { label: 'Συμβόλαιο',   color: '#8b5cf6',          bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', icon: <FileText size={11}/> },
  tenant:      { label: 'Ενοικιαστής', color: 'var(--warning)',   bg: 'var(--warning-dim)',   border: 'var(--warning)',       icon: <User size={11}/> },
  reminder:    { label: 'Υπενθύμιση',  color: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', border: 'var(--border-default)', icon: <Bell size={11}/> },
}

const PRIORITIES: Record<EventPriority, { label: string; color: string }> = {
  low:      { label: 'Χαμηλή',  color: 'var(--positive)' },
  medium:   { label: 'Μέτρια',  color: 'var(--warning)' },
  high:     { label: 'Υψηλή',   color: 'var(--warning)' },
  critical: { label: 'Κρίσιμη', color: 'var(--negative)' },
}

const STATUSES: Record<EventStatus, { label: string; color: string }> = {
  pending:     { label: 'Εκκρεμεί',    color: 'var(--warning)' },
  paid:        { label: 'Πληρώθηκε',   color: 'var(--positive)' },
  in_progress: { label: 'Σε εξέλιξη', color: 'var(--info)' },
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

const EMPTY_FORM: FormState = {
  title: '', category: 'reminder', event_date: '', amount: '',
  priority: 'medium', status: 'pending', recurring: false,
  recurring_interval: 'monthly', notes: '', attachment_url: '',
}

function fmt(date: string) { if (!date) return ''; const [y,m,d]=date.split('-'); return `${d}/${m}/${y}` }
function fmtShort(date: string) { if (!date) return ''; const [y,m,d]=date.split('-'); return `${d} ${MONTH_SHORT_GR[parseInt(m)-1]}` }
function daysUntil(dateStr: string) { const t=new Date(); t.setHours(0,0,0,0); const g=new Date(dateStr); g.setHours(0,0,0,0); return Math.round((g.getTime()-t.getTime())/86400000) }
function isOverdue(e: CalEvent)  { return e.status==='pending'&&daysUntil(e.event_date)<0 }
function isThisWeek(e: CalEvent) { const d=daysUntil(e.event_date); return e.status==='pending'&&d>=0&&d<=7 }
function isThisMonth(e: CalEvent){ const d=daysUntil(e.event_date); return e.status==='pending'&&d>7&&d<=30 }
function isExpiring(e: CalEvent) { const d=daysUntil(e.event_date); return e.category==='contract'&&e.status==='pending'&&d>=0&&d<=60 }
function todayStr() { return new Date().toISOString().split('T')[0] }

// Google-style tooltip
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position:'relative', display:'inline-flex' }} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && text && (
        <div style={{ position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:4, padding:'6px 12px', fontSize:12, color:'var(--text-primary)', fontFamily:"'Roboto',sans-serif", zIndex:999, pointerEvents:'none', maxWidth:260, whiteSpace:'pre-wrap' as any, boxShadow:'var(--shadow-lg)' }}>
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
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, fontFamily:"'Roboto',sans-serif", color:s.color, letterSpacing:'0.25px' }}>
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
  const labels: Record<string,string> = { bills:'Bills', loan:'Συντήρηση', rent:'Ενοίκιο' }
  return (
    <span style={{ fontSize:11, fontFamily:"'Roboto',sans-serif", padding:'1px 6px', borderRadius:4, color:'var(--text-tertiary)', border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)' }}>
      auto · {labels[source]??source}
    </span>
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
    isAuto?`Auto-synced από ${event.source}`:'',
  ].filter(Boolean).join('\n')

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px',
      background: selected?'var(--accent-dim)':done?'var(--bg-elevated)':'var(--bg-surface)',
      border:`1px solid ${selected?'var(--border-accent)':overdue?'var(--negative-border)':'var(--border-subtle)'}`,
      borderLeft:`3px solid ${overdue?'var(--negative)':cat.color}`,
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
            <a href={event.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--info)', display:'flex', alignItems:'center', gap:2, fontFamily:"'Roboto',sans-serif" }}>
              Σύνδεσμος <ArrowRight size={9}/>
            </a>
          )}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
        <span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:overdue?'var(--negative)':due<=3&&!done?'var(--warning)':'var(--text-secondary)' }}>
          {overdue?`${Math.abs(due)}μ πριν`:due===0?'Σήμερα!':fmt(event.event_date)}
        </span>
        {!done&&due>=0&&due<=7&&(
          <span style={{ fontSize:11, fontFamily:"'Inter',sans-serif", fontWeight:500, color:due===0?'var(--negative)':due<=3?'var(--warning)':'var(--accent)', background:due===0?'var(--negative-dim)':'var(--accent-dim)', padding:'2px 8px', borderRadius:12 }}>
            {due===0?'ΣΗΜΕΡΑ':`σε ${due}μ`}
          </span>
        )}
        {!isAuto&&!bulkMode&&(
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={()=>onEdit(event)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', padding:4, display:'flex', borderRadius:4 }}
              onMouseEnter={e=>e.currentTarget.style.color='var(--text-primary)'}
              onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}><Edit2 size={13}/></button>
            <button onClick={()=>onDelete(event.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-tertiary)', padding:4, display:'flex', borderRadius:4 }}
              onMouseEnter={e=>e.currentTarget.style.color='var(--negative)'}
              onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}><Trash2 size={13}/></button>
          </div>
        )}
      </div>
    </div>
  )
}

// Month View
function MonthView({ events, currentDate, onDayClick, onEventClick, upcomingAll }: {
  events: CalEvent[]; currentDate: Date; onDayClick:(date:string)=>void; onEventClick:(e:CalEvent)=>void; upcomingAll:CalEvent[]
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
            <span style={{ fontSize:12, fontFamily:"'Roboto',sans-serif", color:'var(--text-secondary)', letterSpacing:'0.4px' }}>{events.length} γεγονότα</span>
            {monthPendingAmt>0&&<span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)' }}>{monthPendingAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'})} εκκρεμή</span>}
            <span style={{ fontSize:12, fontFamily:"'Roboto',sans-serif", color:'var(--positive)' }}>{monthPaid.length} πληρωμένα</span>
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
              return (
                <div key={idx} onClick={()=>day&&onDayClick(dateStr)} style={{ minHeight:80, padding:'6px', borderRight:(idx+1)%7===0?'none':'1px solid var(--border-subtle)', borderBottom:idx<cells.length-7?'1px solid var(--border-subtle)':'none', background:isToday?'var(--accent-dim)':'transparent', cursor:day?'pointer':'default', transition:'background 0.1s' }}
                  onMouseEnter={e=>{if(day)(e.currentTarget as HTMLElement).style.background=isToday?'var(--accent-dim)':'var(--bg-hover)'}}
                  onMouseLeave={e=>{if(day)(e.currentTarget as HTMLElement).style.background=isToday?'var(--accent-dim)':'transparent'}}
                >
                  {day&&(
                    <>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:isToday?700:400, color:isToday?'var(--accent)':'var(--text-secondary)', width:24, height:24, borderRadius:'50%', background:isToday?'var(--accent-dim)':'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>{day}</span>
                        {hasOverdue&&<span style={{ width:6, height:6, borderRadius:'50%', background:'var(--negative)' }}/>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        {dayEvents.slice(0,3).map(ev=>(
                          <Tooltip key={ev.id} text={`${ev.title}${ev.amount?` · ${ev.amount.toLocaleString('el-GR',{style:'currency',currency:'EUR'})}` :''}${ev.notes?`\n${ev.notes}`:''}`}>
                            <div onClick={e=>{e.stopPropagation();onEventClick(ev)}} style={{ fontSize:11, padding:'1px 5px', borderRadius:4, background:CATEGORIES[ev.category].bg, color:CATEGORIES[ev.category].color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', width:'100%', opacity:ev.status==='paid'?0.4:1, textDecoration:ev.status==='paid'?'line-through':'none', fontFamily:"'Roboto',sans-serif", letterSpacing:'0.25px' }}>
                              {ev.recurring&&'↻ '}{ev.title}
                            </div>
                          </Tooltip>
                        ))}
                        {dayEvents.length>3&&<span style={{ fontSize:10, color:'var(--text-tertiary)', paddingLeft:3, fontFamily:"'Roboto',sans-serif" }}>+{dayEvents.length-3} ακόμα</span>}
                      </div>
                      {dayAmt>0&&<div style={{ marginTop:2 }}><span style={{ fontSize:10, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)', opacity:0.8 }}>{dayAmt>=1000?`${(dayAmt/1000).toFixed(1)}k€`:`${dayAmt.toFixed(0)}€`}</span></div>}
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
          {upcoming7.length===0&&<p style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Roboto',sans-serif" }}>Κανένα εκκρεμές</p>}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {upcoming7.map(ev=>{
              const d=daysUntil(ev.event_date); const cat=CATEGORIES[ev.category]
              return (
                <div key={ev.id} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <div style={{ width:3, borderRadius:2, background:cat.color, alignSelf:'stretch', flexShrink:0, minHeight:28 }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontFamily:"'Roboto',sans-serif", color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>{ev.title}</p>
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
          {Object.entries(CATEGORIES).map(([k,cat])=>{ const cnt=events.filter(e=>e.category===k).length; if(cnt===0)return null; return (<div key={k} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}><span style={{ color:cat.color, display:'flex' }}>{cat.icon}</span><span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Roboto',sans-serif", flex:1 }}>{cat.label}</span><span style={{ fontSize:12, fontFamily:"'Inter', sans-serif", color:'var(--text-secondary)' }}>{cnt}</span></div>) })}
        </div>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:12 }}>
          <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>Ετήσια δραστ.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:3 }}>
            {MONTH_SHORT_GR.map((m,mIdx)=>{ const cnt=upcomingAll.filter(e=>{const d=new Date(e.event_date);return d.getMonth()===mIdx&&d.getFullYear()===currentDate.getFullYear()}).length; const intensity=cnt===0?0:cnt<=2?0.2:cnt<=5?0.5:1; const isCur=mIdx===currentDate.getMonth(); return (
              <Tooltip key={m} text={`${m}: ${cnt} γεγονότα`}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ width:'100%', aspectRatio:'1', borderRadius:3, background:`rgba(25,103,210,${intensity})`, border:isCur?'1px solid var(--border-accent)':'1px solid transparent', marginBottom:2 }}/>
                  <span style={{ fontSize:7, color:'var(--text-tertiary)', fontFamily:"'Roboto',sans-serif" }}>{m.slice(0,1)}</span>
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
function WeekView({ events, currentDate, onDayClick, onEventClick }: { events:CalEvent[]; currentDate:Date; onDayClick:(date:string)=>void; onEventClick:(e:CalEvent)=>void }) {
  const d=new Date(currentDate); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); d.setDate(diff)
  const weekDays=Array.from({length:7},(_,i)=>{ const nd=new Date(d); nd.setDate(d.getDate()+i); return nd })
  const today=todayStr()
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden', boxShadow:'var(--shadow-sm)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
        {weekDays.map((wd,idx)=>{
          const ds=wd.toISOString().split('T')[0]; const dayEvs=events.filter(e=>e.event_date===ds)
          const isToday=ds===today; const hasOverdue=dayEvs.some(isOverdue)
          const dayAmt=dayEvs.filter(e=>e.amount&&e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
          return (
            <div key={idx} style={{ borderRight:idx<6?'1px solid var(--border-subtle)':'none' }}>
              <div onClick={()=>onDayClick(ds)} style={{ padding:'12px 8px 8px', borderBottom:'1px solid var(--border-subtle)', cursor:'pointer', background:isToday?'var(--accent-dim)':'var(--bg-elevated)', textAlign:'center' }}>
                <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:4 }}>{DAY_NAMES_GR[idx===6?0:idx+1]}</p>
                <span style={{ fontSize:18, fontFamily:"'Inter',sans-serif", color:isToday?'var(--accent)':'var(--text-primary)', fontWeight:isToday?700:400, width:36, height:36, borderRadius:'50%', background:isToday?'var(--accent-dim)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }}>{wd.getDate()}</span>
                {hasOverdue&&<div style={{ width:6, height:6, borderRadius:'50%', background:'var(--negative)', margin:'4px auto 0' }}/>}
              </div>
              <div style={{ padding:'6px', minHeight:120, display:'flex', flexDirection:'column', gap:4 }}>
                {dayEvs.map(ev=>(
                  <Tooltip key={ev.id} text={`${ev.title}${ev.amount?` · ${ev.amount}€`:''}${ev.notes?`\n${ev.notes}`:''}`}>
                    <div onClick={()=>onEventClick(ev)} style={{ fontSize:11, padding:'4px 6px', borderRadius:4, background:CATEGORIES[ev.category].bg, color:CATEGORIES[ev.category].color, cursor:'pointer', opacity:ev.status==='paid'?0.4:1, borderLeft:`3px solid ${CATEGORIES[ev.category].color}`, fontFamily:"'Roboto',sans-serif" }}>
                      <p style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</p>
                      {ev.amount&&<p style={{ fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', opacity:0.8 }}>{ev.amount}€</p>}
                    </div>
                  </Tooltip>
                ))}
                {dayAmt>0&&<p style={{ fontSize:10, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums', color:'var(--accent)', textAlign:'center', marginTop:'auto', opacity:0.8 }}>{dayAmt}€</p>}
              </div>
            </div>
          )
        })}
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
          { label:'Ήδη πληρώθηκαν', value:paidAmt>0?paidAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'—', color:'var(--positive)' },
          { label:'Γεγονότα έτους', value:`${events.length}`, color:'var(--info)' },
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
                  {monthEvs.length>7&&<span style={{ fontSize:9, color:'var(--text-tertiary)', textAlign:'center', fontFamily:"'Roboto',sans-serif" }}>+{monthEvs.length-7}</span>}
                </div>
                {totalM>0&&<p style={{ fontSize:10, color:'var(--accent)', textAlign:'center', marginTop:5, fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums' }}>{totalM>=1000?`${(totalM/1000).toFixed(1)}k€`:`${totalM.toFixed(0)}€`}</p>}
                {monthEvs.length===0&&<p style={{ fontSize:9, color:'var(--text-tertiary)', textAlign:'center', fontFamily:"'Roboto',sans-serif" }}>—</p>}
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop:14, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
          {Object.entries(CATEGORIES).map(([key,cat])=>(
            <div key={key} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span style={{ width:10, height:4, borderRadius:2, background:cat.color, display:'inline-block' }}/>
              <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:"'Roboto',sans-serif", letterSpacing:'0.25px' }}>{cat.label}</span>
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
          <p style={{ fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--positive)', letterSpacing:'0.1px' }}>Auto-Pull Δεδομένων</p>
          {lastSync&&<p style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Roboto',sans-serif", marginTop:2 }}>Τελευταίος sync: {lastSync}</p>}
        </div>
        <button onClick={syncAll} disabled={syncing} style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 16px', background:syncing?'transparent':'var(--positive-dim)', border:'1px solid var(--positive)', borderRadius:18, cursor:syncing?'not-allowed':'pointer', color:'var(--positive)', fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500 }}>
          <RefreshCw size={14} style={{ animation:syncing?'spin 1s linear infinite':'none' }}/>{syncing?'Συγχρονισμός...':'Sync τώρα'}
        </button>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[{key:'bills',label:'Λογαριασμοί',icon:<Zap size={13}/>,desc:'Από τους λογαριασμούς'},{key:'loan',label:'Συντήρηση',icon:<Wrench size={13}/>,desc:'Εργασίες συντήρησης'},{key:'rent',label:'Ενοίκιο',icon:<Euro size={13}/>,desc:'12 μήνες'}].map(({key,label,icon,desc})=>{
          const active=sources[key as keyof typeof sources]
          return (
            <button key={key} onClick={()=>setSources(s=>({...s,[key]:!s[key as keyof typeof sources]}))} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:active?'var(--positive-dim)':'var(--bg-elevated)', border:`1px solid ${active?'var(--positive)':'var(--border-default)'}`, borderRadius:8, cursor:'pointer' }}>
              <span style={{ color:active?'var(--positive)':'var(--text-tertiary)' }}>{icon}</span>
              <div style={{ textAlign:'left' }}>
                <p style={{ fontSize:13, fontFamily:"'Inter',sans-serif", color:active?'var(--positive)':'var(--text-secondary)' }}>{label}</p>
                <p style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Roboto',sans-serif" }}>{desc}</p>
              </div>
              <span style={{ color:active?'var(--positive)':'var(--text-tertiary)' }}>{active?<ToggleRight size={16}/>:<ToggleLeft size={16}/>}</span>
            </button>
          )
        })}
      </div>
      {msg&&<p style={{ marginTop:8, fontSize:13, fontFamily:"'Roboto',sans-serif", color:'var(--positive)' }}>{msg}</p>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// Contact Picker
function ContactPickerInput({ value, onChange, propertyId, inputStyle, placeholder, prefix='' }: {
  value:string; onChange:(v:string)=>void; propertyId:string; inputStyle:React.CSSProperties; placeholder?:string; prefix?:string
}) {
  const [contacts,setContacts]=useState<{id:string;full_name:string}[]>([])
  const [show,setShow]=useState(false)
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{ const sb=createClient(); sb.from('contacts').select('id,full_name').eq('property_id',propertyId).then(({data}:{data:{id:string;full_name:string}[]|null})=>setContacts(data||[])) },[propertyId])
  useEffect(()=>{ const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setShow(false)}; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h) },[])
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div style={{ display:'flex', gap:6 }}>
        <input style={{...inputStyle,flex:1}} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>
        {contacts.length>0&&(
          <button type="button" onClick={()=>setShow(s=>!s)} style={{ height:40, padding:'0 12px', borderRadius:4, border:'1px solid var(--border-default)', background:show?'var(--accent-dim)':'var(--bg-surface)', color:show?'var(--accent)':'var(--text-secondary)', cursor:'pointer', fontSize:14, fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
            Επαφές
          </button>
        )}
      </div>
      {show&&(
        <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:'var(--bg-surface)', borderRadius:4, padding:'8px 0', zIndex:2000, minWidth:220, maxHeight:200, overflowY:'auto', boxShadow:'var(--shadow-lg)' }}>
          <div style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', padding:'4px 16px 8px', letterSpacing:'0.5px', textTransform:'uppercase', borderBottom:'1px solid var(--border-subtle)', marginBottom:4 }}>Επιλογή Επαφής</div>
          {contacts.map(c=>(
            <div key={c.id} onClick={()=>{onChange(prefix?prefix+c.full_name:c.full_name);setShow(false)}} style={{ padding:'10px 16px', cursor:'pointer', fontSize:14, color:'var(--text-primary)', fontFamily:"'Roboto',sans-serif" }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              {c.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Event Modal
function EventModal({ form, setForm, onSave, onClose, editing, saving, propertyId }: {
  form:FormState; setForm:React.Dispatch<React.SetStateAction<FormState>>
  onSave:()=>void; onClose:()=>void; editing:boolean; saving:boolean; propertyId:string
}) {
  const inp: React.CSSProperties = { width:'100%', background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:4, padding:'10px 16px', color:'var(--text-primary)', fontSize:14, fontFamily:"'Roboto',sans-serif", outline:'none', boxSizing:'border-box', height:40 }
  const lbl: React.CSSProperties = { fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:500, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:6 }
  const templates = [
    {label:'ΔΕΗ',cat:'bills',pri:'high',title:'Πληρωμή ΔΕΗ'},
    {label:'Ενοίκιο',cat:'financial',pri:'high',title:'Είσπραξη Ενοικίου'},
    {label:'ΕΝΦΙΑ',cat:'financial',pri:'critical',title:'Πληρωμή ΕΝΦΙΑ'},
    {label:'Ασφάλεια',cat:'contract',pri:'high',title:'Ανανέωση Ασφάλειας'},
    {label:'Service',cat:'maintenance',pri:'medium',title:'Service Κλιματιστικού'},
  ]
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.32)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:24 }}>
      <div style={{ background:'var(--bg-surface)', borderRadius:28, width:'100%', maxWidth:540, maxHeight:'90vh', overflowY:'auto', padding:24, boxShadow:'var(--shadow-xl)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <p style={{ fontFamily:"'Inter',sans-serif", fontSize:22, fontWeight:400, color:'var(--text-primary)', lineHeight:'28px' }}>{editing?'Επεξεργασία':'Νέο Γεγονός'}</p>
          <button onClick={onClose} style={{ width:40, height:40, borderRadius:20, border:'none', background:'transparent', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><X size={18}/></button>
        </div>
        {!editing&&(
          <div style={{ marginBottom:16 }}>
            <p style={lbl}>Γρήγορη επιλογή</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {templates.map(t=>(
                <button key={t.label} onClick={()=>setForm(f=>({...f,title:t.title,category:t.cat as EventCategory,priority:t.pri as EventPriority}))} style={{ height:32, padding:'0 12px', borderRadius:16, fontSize:13, cursor:'pointer', border:`1px solid ${form.title===t.title?'var(--border-accent)':'var(--border-default)'}`, background:form.title===t.title?'var(--accent-dim)':'transparent', color:form.title===t.title?'var(--accent)':'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500, transition:'all 0.15s' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={lbl}>Τίτλος *</label>
            <ContactPickerInput value={form.title} onChange={v=>setForm(f=>({...f,title:v}))} propertyId={propertyId} inputStyle={inp} placeholder="για παράδειγμα Πληρωμή ΔΕΗ Ιουνίου" prefix="Ραντεβού με "/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:16 }}>
            <div>
              <label style={lbl}>Κατηγορία</label>
              <select style={{...inp,appearance:'none' as any,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%235f6368'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center',paddingRight:36}} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value as EventCategory}))}>
                {Object.entries(CATEGORIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Προτεραιότητα</label>
              <select style={{...inp,appearance:'none' as any,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%235f6368'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center',paddingRight:36}} value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value as EventPriority}))}>
                {Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:16 }}>
            <div>
              <label style={lbl}>Ημερομηνία *</label>
              <DatePicker value={form.event_date} onChange={v=>setForm(f=>({...f,event_date:v}))}/>
            </div>
            <div>
              <label style={lbl}>Ποσό (€)</label>
              <input type="number" style={inp} placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
            </div>
          </div>
          <div>
            <label style={lbl}>Κατάσταση</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {Object.entries(STATUSES).map(([k,v])=>(
                <button key={k} onClick={()=>setForm(f=>({...f,status:k as EventStatus}))} style={{ height:36, padding:'0 16px', borderRadius:18, cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:500, border:`1px solid ${form.status===k?v.color:'var(--border-default)'}`, background:form.status===k?`${v.color}15`:'transparent', color:form.status===k?v.color:'var(--text-secondary)', transition:'all 0.15s' }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:14 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:form.recurring?12:0 }}>
              <div>
                <p style={{ fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:500, color:'var(--text-primary)' }}>Επαναλαμβανόμενο</p>
                <p style={{ fontFamily:"'Roboto',sans-serif", fontSize:13, color:'var(--text-secondary)', letterSpacing:'0.25px' }}>Ενοίκιο, δόση, ΕΝΦΙΑ και άλλα</p>
              </div>
              <div onClick={()=>setForm(f=>({...f,recurring:!f.recurring}))} style={{ width:52, height:32, borderRadius:16, border:`2px solid ${form.recurring?'var(--accent)':'var(--border-default)'}`, background:form.recurring?'var(--accent)':'transparent', position:'relative', transition:'all 0.2s', cursor:'pointer', flexShrink:0 }}>
                <span style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', width:form.recurring?24:16, height:form.recurring?24:16, borderRadius:'50%', background:form.recurring?'var(--accent-text)':'var(--text-secondary)', left:form.recurring?'calc(100% - 26px)':'2px', transition:'all 0.2s' }}/>
              </div>
            </div>
            {form.recurring&&(
              <select style={{...inp,appearance:'none' as any,marginTop:0}} value={form.recurring_interval} onChange={e=>setForm(f=>({...f,recurring_interval:e.target.value}))}>
                {RECURRING_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={lbl}>Σημειώσεις</label>
            <textarea style={{...inp,height:'auto',resize:'vertical',minHeight:64}} placeholder="Πάροχος, αρ. λογαριασμού, οδηγίες..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
          </div>
          <div>
            <label style={lbl}>Link (τιμολόγιο, σύμβαση)</label>
            <input style={inp} placeholder="https://..." value={form.attachment_url} onChange={e=>setForm(f=>({...f,attachment_url:e.target.value}))}/>
          </div>
          <button onClick={onSave} disabled={saving||!form.title||!form.event_date} style={{ height:40, borderRadius:20, border:'none', background:saving||!form.title||!form.event_date?'var(--bg-overlay)':'var(--accent)', color:saving||!form.title||!form.event_date?'var(--text-tertiary)':'var(--accent-text)', fontFamily:"'Inter',sans-serif", fontSize:14, fontWeight:500, cursor:saving||!form.title||!form.event_date?'not-allowed':'pointer', letterSpacing:'0.1px', opacity:saving||!form.title||!form.event_date?0.6:1 }}>
            {saving?'Αποθήκευση...':editing?'Ενημέρωση':'Προσθήκη'}
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
        <span style={{ fontSize:12, fontFamily:"'Roboto',sans-serif", color:'var(--text-tertiary)' }}>({events.length})</span>
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

// Main Component
export default function TabCalendar({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase=createClient()
  const [events,setEvents]=useState<CalEvent[]>([])
  const [loading,setLoading]=useState(true)
  const [viewMode,setViewMode]=useState<ViewMode>('month')
  const [currentDate,setCurrentDate]=useState(new Date())
  const [showModal,setShowModal]=useState(false)
  const [editingEvent,setEditingEvent]=useState<CalEvent|null>(null)
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

  const filtered=events.filter(e=>{
    if(filterCat!=='all'&&e.category!==filterCat)return false
    if(filterStatus!=='all'&&e.status!==filterStatus)return false
    if(searchQ&&!e.title.toLowerCase().includes(searchQ.toLowerCase()))return false
    return true
  })

  const overdue=filtered.filter(isOverdue)
  const thisWeek=filtered.filter(isThisWeek)
  const thisMonth=filtered.filter(isThisMonth)
  const expiring=filtered.filter(isExpiring)
  const later=filtered.filter(e=>{const d=daysUntil(e.event_date);return e.status==='pending'&&d>30})
  const done=filtered.filter(e=>e.status==='paid'||e.status==='cancelled')
  const totalPending=filtered.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const nextEvent=filtered.filter(e=>e.status==='pending'&&daysUntil(e.event_date)>=0).sort((a,b)=>a.event_date.localeCompare(b.event_date))[0]
  const monthEvents=filtered.filter(e=>{const d=new Date(e.event_date);return d.getFullYear()===currentDate.getFullYear()&&d.getMonth()===currentDate.getMonth()})

  function openNew(date?:string){setEditingEvent(null);setForm({...EMPTY_FORM,event_date:date||''});setShowModal(true)}
  function openEdit(e:CalEvent){setEditingEvent(e);setForm({title:e.title,category:e.category,event_date:e.event_date,amount:e.amount?.toString()||'',priority:e.priority,status:e.status,recurring:e.recurring,recurring_interval:e.recurring_interval||'monthly',notes:e.notes||'',attachment_url:e.attachment_url||''});setShowModal(true)}

  async function saveEvent(){
    if(!form.title||!form.event_date)return; setSaving(true)
    const payload={property_id:propertyId,user_id:userId,title:form.title,category:form.category,event_date:form.event_date,amount:form.amount?parseFloat(form.amount):null,priority:form.priority,status:form.status,recurring:form.recurring,recurring_interval:form.recurring?form.recurring_interval:null,notes:form.notes||null,attachment_url:form.attachment_url||null,source:'manual'}
    if(editingEvent){await supabase.from('calendar_events').update(payload).eq('id',editingEvent.id)}
    else{await supabase.from('calendar_events').insert(payload)}
    await load(); setShowModal(false); setSaving(false)
  }

  async function toggleStatus(e:CalEvent){
    const ns:EventStatus=e.status==='paid'?'pending':'paid'
    await supabase.from('calendar_events').update({status:ns}).eq('id',e.id)
    setEvents(prev=>prev.map(ev=>ev.id===e.id?{...ev,status:ns}:ev))
  }
  async function deleteEvent(id:string){
    if(!confirm('Διαγραφή γεγονότος;'))return
    await supabase.from('calendar_events').delete().eq('id',id)
    setEvents(prev=>prev.filter(e=>e.id!==id))
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
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Property OS//Calendar 1.0//EL','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Property OS — Ημερολόγιο','X-WR-TIMEZONE:Europe/Athens']
    filtered.forEach(e=>{
      const d=e.event_date.replace(/-/g,''); const cat=CATEGORIES[e.category]
      const descParts=[e.notes||'', e.amount?`Ποσό: ${e.amount.toLocaleString('el-GR')} €`:''].filter(Boolean)
      lines.push('BEGIN:VEVENT',
        `UID:${e.id}@property-os`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        `DTEND;VALUE=DATE:${d}`,
        icsFold(`SUMMARY:${icsEsc((cat?`${cat.label}: `:'')+e.title)}`),
        descParts.length?icsFold(`DESCRIPTION:${icsEsc(descParts.join(' — '))}`):'',
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
    const html=`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Ημερολόγιο — Property OS</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',system-ui,sans-serif;color:#202124;padding:40px;max-width:800px;margin:0 auto}@media print{body{padding:0}@page{margin:16mm}}table{width:100%;border-collapse:collapse}</style></head>
    <body><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:16px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px"><div style="width:32px;height:32px;border-radius:8px;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px">P</div><div><div style="font-weight:700;font-size:15px">Property OS</div><div style="font-size:11px;color:#5f6368">Επερχόμενα Γεγονότα & Προθεσμίες</div></div></div>
      <div style="text-align:right;font-size:12px;color:#5f6368">${esc(new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'}))}</div></div>
      <table><thead><tr><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Ημερομηνία</th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Γεγονός</th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Κατηγορία</th><th style="text-align:right;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f6368;border-bottom:2px solid #e8eaed">Πότε</th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:30px;font-size:10px;color:#80868b;border-top:1px solid #eee;padding-top:12px">Δημιουργήθηκε αυτόματα από το Property OS.</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>`
    const w=window.open('','_blank'); if(!w){alert('Επίτρεψε τα αναδυόμενα παράθυρα.');return} w.document.write(html); w.document.close()
  }

  const prevPeriod=()=>{ if(viewMode==='week')setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()-7)); else setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1)) }
  const nextPeriod=()=>{ if(viewMode==='week')setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+7)); else setCurrentDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1)) }
  const periodLabel=()=>{ if(viewMode==='week'){const d=new Date(currentDate);const day=d.getDay();const diff=d.getDate()-day+(day===0?-6:1);d.setDate(diff);const end=new Date(d);end.setDate(d.getDate()+6);return`${d.getDate()} ${MONTH_SHORT_GR[d.getMonth()]} – ${end.getDate()} ${MONTH_SHORT_GR[end.getMonth()]}`}; return`${MONTH_NAMES_GR[currentDate.getMonth()]} ${currentDate.getFullYear()}` }

  // Google-style button base
  const toolBtn=(active:boolean,activeColor:string='var(--accent)'): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:6, height:36, padding:'0 12px',
    background:active?`${activeColor}15`:'var(--bg-surface)',
    border:`1px solid ${active?activeColor:'var(--border-default)'}`,
    borderRadius:18, cursor:'pointer', color:active?activeColor:'var(--text-secondary)',
    fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:500, letterSpacing:'0.1px',
    transition:'all 0.15s', whiteSpace:'nowrap' as const,
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* KPI Bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:12 }}>
        {[
          {label:'Εκκρεμή ποσά', value:totalPending>0?totalPending.toLocaleString('el-GR',{style:'currency',currency:'EUR'}):'—', color:totalPending>0?'var(--accent)':'var(--text-secondary)', icon:<TrendingUp size={14}/>},
          {label:'Εκπρόθεσμα', value:overdue.length>0?`${overdue.length} γεγονότα`:'Κανένα', color:overdue.length>0?'var(--negative)':'var(--positive)', icon:<AlertTriangle size={14}/>},
          {label:'Επόμενη πληρωμή', value:nextEvent?(daysUntil(nextEvent.event_date)===0?'Σήμερα!':`σε ${daysUntil(nextEvent.event_date)}μ`):'—', color:'var(--info)', icon:<Clock size={14}/>},
          {label:'Λήξεις συμβολαίων', value:expiring.length>0?`${expiring.length} σύντομα`:'Κανένα', color:expiring.length>0?'#8b5cf6':'var(--text-secondary)', icon:<Shield size={14}/>},
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
              <p style={{ fontSize:14, color:'var(--negative)', fontFamily:"'Roboto',sans-serif", flex:1, letterSpacing:'0.25px' }}>
                {overdue.length} εκπρόθεσμ{overdue.length===1?'ο γεγονός':'α γεγονότα'} — χρειάζονται άμεση δράση
              </p>
              <span style={{ fontSize:13, color:'var(--negative)', fontFamily:"'Inter', sans-serif", fontVariantNumeric:'tabular-nums' }}>
                {overdue.reduce((s,e)=>s+(e.amount||0),0)>0&&`${overdue.reduce((s,e)=>s+(e.amount||0),0).toLocaleString('el-GR',{style:'currency',currency:'EUR'})}`}
              </span>
            </div>
          )}
          {expiring.length>0&&(
            <div style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.3)', borderRadius:8, padding:'10px 16px' }}>
              <Shield size={14} color="#8b5cf6"/>
              <p style={{ fontSize:14, color:'#8b5cf6', fontFamily:"'Roboto',sans-serif", letterSpacing:'0.25px' }}>
                {expiring.length} συμβόλαι{expiring.length===1?'ο λήγει':'α λήγουν'} εντός 60 ημερών — {expiring.map(e=>`${e.title} (${fmtShort(e.event_date)})`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* View toggle */}
        <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8, overflow:'hidden' }}>
          {([['month','Μήνας',<Calendar size={13}/>],['week','Εβδομάδα',<CalendarDays size={13}/>],['list','Λίστα',<List size={13}/>],['timeline','Timeline',<BarChart2 size={13}/>]] as [ViewMode,string,React.ReactNode][]).map(([v,label,icon])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 12px', border:'none', cursor:'pointer', fontSize:13, fontFamily:"'Inter',sans-serif", fontWeight:500, background:viewMode===v?'var(--accent-dim)':'transparent', color:viewMode===v?'var(--accent)':'var(--text-secondary)', transition:'all 0.15s', letterSpacing:'0.1px' }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Period nav */}
        {viewMode!=='list'&&viewMode!=='timeline'&&(
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <button onClick={prevPeriod} style={{ width:36, height:36, borderRadius:18, border:'1px solid var(--border-default)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='var(--bg-surface)'}><ChevronLeft size={16}/></button>
            <span style={{ fontSize:14, fontFamily:"'Inter',sans-serif", color:'var(--text-primary)', minWidth:180, textAlign:'center', letterSpacing:'0.1px' }}>{periodLabel()}</span>
            <button onClick={nextPeriod} style={{ width:36, height:36, borderRadius:18, border:'1px solid var(--border-default)', background:'var(--bg-surface)', cursor:'pointer', color:'var(--text-secondary)', display:'flex', alignItems:'center', justifyContent:'center' }} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='var(--bg-surface)'}><ChevronRight size={16}/></button>
            <button onClick={()=>setCurrentDate(new Date())} style={{...toolBtn(false)}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='var(--bg-hover)';(e.currentTarget as HTMLElement).style.color='var(--text-primary)'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='var(--bg-surface)';(e.currentTarget as HTMLElement).style.color='var(--text-secondary)'}}>Σήμερα</button>
          </div>
        )}

        <input placeholder="Αναζήτηση..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}
          style={{ flex:1, minWidth:120, height:36, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:18, padding:'0 16px', color:'var(--text-primary)', fontSize:14, fontFamily:"'Roboto',sans-serif", letterSpacing:'0.25px', outline:'none' }}/>

        <button onClick={()=>{setBulkMode(b=>!b);setSelectedIds(new Set())}} style={toolBtn(bulkMode,'var(--info)')}>
          <CheckSquare size={14}/>Bulk
        </button>
        <button onClick={()=>setShowFilters(f=>!f)} style={toolBtn(showFilters)}>
          <Filter size={14}/>Φίλτρα
        </button>
        <button onClick={()=>setShowAutoPull(f=>!f)} style={toolBtn(showAutoPull,'var(--positive)')}>
          <RefreshCw size={14}/>Sync
        </button>
        <button onClick={exportICal} style={toolBtn(false)}>
          <Download size={14}/>iCal
        </button>
        <button onClick={printCalendar} style={toolBtn(false)}>
          <Printer size={14}/>Εκτύπωση
        </button>
        <ExportButton disabled={filtered.length===0} onClick={()=>downloadCsv(
          `imerologio_${new Date().toISOString().slice(0,10)}`,
          ['Ημερομηνία','Τίτλος','Κατηγορία','Ποσό (€)','Κατάσταση'],
          [...filtered].sort((a,b)=>a.event_date.localeCompare(b.event_date)).map(e=>[
            csvDate(e.event_date), e.title, CATEGORIES[e.category]?.label||e.category,
            csvEur(e.amount), STATUSES[e.status]?.label||e.status,
          ])
        )}/>
        <button onClick={()=>openNew()} style={{ display:'flex', alignItems:'center', gap:6, height:36, padding:'0 16px', background:'var(--accent)', border:'none', borderRadius:20, cursor:'pointer', color:'var(--accent-text)', fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500, letterSpacing:'0.1px', boxShadow:'var(--shadow-sm)' }}>
          <Plus size={14}/>Προσθήκη
        </button>
      </div>

      {/* Bulk action bar */}
      {bulkMode&&selectedIds.size>0&&(
        <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--info-dim)', border:'1px solid var(--border-accent)', borderRadius:8, padding:'10px 16px' }}>
          <span style={{ fontSize:14, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--info)' }}>{selectedIds.size} επιλεγμένα</span>
          <button onClick={bulkMarkPaid} style={{ height:32, padding:'0 16px', background:'var(--positive-dim)', border:'1px solid var(--positive)', borderRadius:16, cursor:'pointer', fontSize:13, color:'var(--positive)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Πληρωμένα</button>
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
          <MonthView events={monthEvents} currentDate={currentDate} onDayClick={openNew} onEventClick={openEdit} upcomingAll={filtered}/>
          {monthEvents.length>0&&(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.5px', textTransform:'uppercase' }}>Γεγονότα {MONTH_NAMES_GR[currentDate.getMonth()]}</p>
              {monthEvents.map(e=>(<EventCard key={e.id} event={e} onToggleStatus={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} selected={selectedIds.has(e.id)} onSelect={toggleSelect} bulkMode={bulkMode}/>))}
            </div>
          )}
          {monthEvents.length===0&&<div style={{ textAlign:'center', padding:'20px 0' }}><p style={{ fontSize:14, fontFamily:"'Roboto',sans-serif", color:'var(--text-tertiary)' }}>Δεν υπάρχουν γεγονότα αυτόν τον μήνα</p></div>}
        </div>
      )}

      {!loading&&viewMode==='week'&&<WeekView events={filtered} currentDate={currentDate} onDayClick={openNew} onEventClick={openEdit}/>}

      {!loading&&viewMode==='list'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {overdue.length>0&&<Section title="Εκπρόθεσμα" color="var(--negative)" events={overdue} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisWeek.length>0&&<Section title="Επόμενες 7 μέρες" color="var(--accent)" events={thisWeek} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisMonth.length>0&&<Section title="Αυτόν τον μήνα" color="var(--info)" events={thisMonth} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {later.length>0&&<Section title="Αργότερα" color="var(--text-secondary)" events={later} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {done.length>0&&<Section title="Ολοκληρωμένα / Ακυρωμένα" color="var(--text-tertiary)" events={done} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} collapsed bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {filtered.length===0&&<div style={{ textAlign:'center', padding:'50px 0' }}><Calendar size={28} color="var(--text-tertiary)" style={{ margin:'0 auto 12px' }}/><p style={{ fontSize:14, fontFamily:"'Roboto',sans-serif", color:'var(--text-tertiary)' }}>Δεν υπάρχουν γεγονότα</p></div>}
        </div>
      )}

      {!loading&&viewMode==='timeline'&&<TimelineView events={filtered} currentYear={timelineYear} onYearChange={setTimelineYear}/>}

      {showModal&&<EventModal form={form} setForm={setForm} onSave={saveEvent} onClose={()=>setShowModal(false)} editing={!!editingEvent} saving={saving} propertyId={propertyId}/>}
    </div>
  )
}