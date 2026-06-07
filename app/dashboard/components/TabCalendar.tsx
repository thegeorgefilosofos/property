'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AlertTriangle, Plus, X, ChevronLeft, ChevronRight,
  Calendar, List, BarChart2, Check, FileText,
  Zap, Shield, User, Bell, Filter, Download,
  ChevronDown, Edit2, Trash2, RotateCcw,
  DollarSign, Wrench, RefreshCw, ToggleLeft, ToggleRight,
  Printer, Square, CheckSquare, CalendarDays, ArrowRight,
  TrendingUp, Clock, Info,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventCategory = 'financial' | 'bills' | 'maintenance' | 'contract' | 'tenant' | 'reminder'
type EventPriority = 'low' | 'medium' | 'high' | 'critical'
type EventStatus   = 'pending' | 'paid' | 'cancelled' | 'in_progress'
type ViewMode      = 'month' | 'week' | 'list' | 'timeline'

interface CalEvent {
  id: string
  property_id: string
  user_id: string
  title: string
  category: EventCategory
  event_date: string
  amount?: number | null
  priority: EventPriority
  status: EventStatus
  recurring: boolean
  recurring_interval?: string | null
  notes?: string | null
  source: string
  attachment_url?: string | null
  color?: string | null
  created_at: string
}

interface FormState {
  title: string
  category: EventCategory
  event_date: string
  amount: string
  priority: EventPriority
  status: EventStatus
  recurring: boolean
  recurring_interval: string
  notes: string
  attachment_url: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: Record<EventCategory, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  financial:   { label: 'Οικονομικά',   color: '#d4af42', bg: 'rgba(212,175,66,0.12)',  border: 'rgba(212,175,66,0.3)',  icon: <DollarSign size={11}/> },
  bills:       { label: 'Λογαριασμοί', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  icon: <Zap size={11}/> },
  maintenance: { label: 'Συντήρηση',   color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  icon: <Wrench size={11}/> },
  contract:    { label: 'Συμβόλαιο',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', icon: <FileText size={11}/> },
  tenant:      { label: 'Ενοικιαστής', color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)',  icon: <User size={11}/> },
  reminder:    { label: 'Υπενθύμιση',  color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.3)', icon: <Bell size={11}/> },
}

const PRIORITIES: Record<EventPriority, { label: string; color: string }> = {
  low:      { label: 'Χαμηλή',  color: '#34d399' },
  medium:   { label: 'Μέτρια',  color: '#d4af42' },
  high:     { label: 'Υψηλή',   color: '#fb923c' },
  critical: { label: 'Κρίσιμη', color: '#f87171' },
}

const STATUSES: Record<EventStatus, { label: string; color: string }> = {
  pending:     { label: 'Εκκρεμεί',    color: '#d4af42' },
  paid:        { label: 'Πληρώθηκε',   color: '#34d399' },
  in_progress: { label: 'Σε εξέλιξη', color: '#60a5fa' },
  cancelled:   { label: 'Ακυρώθηκε',  color: '#6b7280' },
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
  title: '', category: 'reminder', event_date: '', amount: '',
  priority: 'medium', status: 'pending', recurring: false,
  recurring_interval: 'monthly', notes: '', attachment_url: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string) {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}
function fmtShort(date: string) {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return `${d} ${MONTH_SHORT_GR[parseInt(m)-1]}`
}
function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
function isOverdue(e: CalEvent)  { return e.status === 'pending' && daysUntil(e.event_date) < 0 }
function isThisWeek(e: CalEvent) { const d = daysUntil(e.event_date); return e.status === 'pending' && d >= 0 && d <= 7 }
function isThisMonth(e: CalEvent){ const d = daysUntil(e.event_date); return e.status === 'pending' && d > 7 && d <= 30 }
function isExpiring(e: CalEvent) { const d = daysUntil(e.event_date); return e.category === 'contract' && e.status === 'pending' && d >= 0 && d <= 60 }
function todayStr() { return new Date().toISOString().split('T')[0] }

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && text && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 6,
          padding: '5px 10px', fontSize: 11, color: '#c0c0d8',
          zIndex: 999, pointerEvents: 'none', fontFamily: 'JetBrains Mono, monospace',
          maxWidth: 260, whiteSpace: 'pre-wrap' as any,
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #2a2a40' }}/>
        </div>
      )}
    </div>
  )
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function CategoryBadge({ cat }: { cat: EventCategory }) {
  const c = CATEGORIES[cat]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 4, color: c.color, background: c.bg, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      {c.icon}{c.label}
    </span>
  )
}
function StatusDot({ status }: { status: EventStatus }) {
  const s = STATUSES[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: s.color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }}/>
      {s.label}
    </span>
  )
}
function PriorityTag({ priority }: { priority: EventPriority }) {
  const p = PRIORITIES[priority]
  return (
    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '1px 5px', borderRadius: 3, color: p.color, border: `1px solid ${p.color}33` }}>
      {p.label}
    </span>
  )
}
function SourceBadge({ source }: { source: string }) {
  if (source === 'manual') return null
  const labels: Record<string, string> = { bills: 'Bills', loan: 'Συντήρηση', rent: 'Ενοίκιο' }
  return (
    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', padding: '1px 5px', borderRadius: 3, color: '#5a5a70', border: '1px solid #2a2a3e', background: 'rgba(255,255,255,0.02)' }}>
      auto · {labels[source] ?? source}
    </span>
  )
}

// ─── Event Card (full) ────────────────────────────────────────────────────────

function EventCard({ event, onToggleStatus, onEdit, onDelete, selected, onSelect, bulkMode }: {
  event: CalEvent; onToggleStatus: (e: CalEvent) => void
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void
  selected?: boolean; onSelect?: (id: string) => void; bulkMode?: boolean
}) {
  const overdue = isOverdue(event)
  const done    = event.status === 'paid' || event.status === 'cancelled'
  const cat     = CATEGORIES[event.category]
  const isAuto  = event.source !== 'manual'
  const due     = daysUntil(event.event_date)
  const tooltipText = [
    event.notes ? `📝 ${event.notes}` : '',
    event.attachment_url ? `🔗 ${event.attachment_url}` : '',
    event.recurring ? `🔄 Επαναλαμβάνεται: ${RECURRING_OPTIONS.find(o=>o.value===event.recurring_interval)?.label??''}` : '',
    isAuto ? `⚡ Auto-synced από ${event.source}` : '',
  ].filter(Boolean).join('\n')

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 13px',
      background: selected ? 'rgba(212,175,66,0.06)' : done ? 'rgba(255,255,255,0.015)' : '#12121f',
      border: `1px solid ${selected ? 'rgba(212,175,66,0.35)' : overdue ? 'rgba(248,113,113,0.35)' : '#242438'}`,
      borderLeft: `3px solid ${overdue ? '#f87171' : cat.color}`,
      borderRadius: 8, opacity: done ? 0.55 : 1, transition: 'all 0.15s',
    }}>
      {/* Bulk checkbox */}
      {bulkMode && onSelect && (
        <button onClick={() => onSelect(event.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected ? '#d4af42' : '#3a3a54', padding: 0, display: 'flex', flexShrink: 0, marginTop: 1 }}>
          {selected ? <CheckSquare size={15}/> : <Square size={15}/>}
        </button>
      )}
      {/* Toggle done */}
      {!bulkMode && (
        <button onClick={() => onToggleStatus(event)} style={{ marginTop: 1, flexShrink: 0, width: 17, height: 17, borderRadius: '50%', border: `1.5px solid ${done ? '#d4af42' : '#3a3a54'}`, background: done ? '#d4af42' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
          {done && <Check size={9} color="#08080d"/>}
        </button>
      )}
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 13, color: done ? '#5a5a70' : '#e2e2f0', textDecoration: done ? 'line-through' : 'none', fontWeight: 500 }}>
            {event.title}
          </span>
          <CategoryBadge cat={event.category}/>
          <PriorityTag priority={event.priority}/>
          <SourceBadge source={event.source}/>
          {event.recurring && <Tooltip text="Επαναλαμβανόμενο"><RotateCcw size={10} color="#5a5a70"/></Tooltip>}
          {tooltipText && (
            <Tooltip text={tooltipText}>
              <Info size={10} color="#3a3a54" style={{ cursor: 'help' }}/>
            </Tooltip>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <StatusDot status={event.status}/>
          {event.amount != null && (
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42' }}>
              {event.amount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
          {event.attachment_url && (
            <a href={event.attachment_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 2 }}>
              Σύνδεσμος <ArrowRight size={9}/>
            </a>
          )}
        </div>
      </div>
      {/* Date + urgency + actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: overdue ? '#f87171' : due <= 3 && !done ? '#fb923c' : '#5a5a70' }}>
          {overdue ? `${Math.abs(due)}μ πριν` : due === 0 ? 'Σήμερα!' : fmt(event.event_date)}
        </span>
        {!done && due >= 0 && due <= 7 && (
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: due === 0 ? '#f87171' : due <= 3 ? '#fb923c' : '#d4af42', background: due === 0 ? 'rgba(248,113,113,0.1)' : 'rgba(212,175,66,0.08)', padding: '1px 5px', borderRadius: 3 }}>
            {due === 0 ? 'ΣΗΜΕΡΑ' : `σε ${due}μ`}
          </span>
        )}
        {!isAuto && !bulkMode && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onEdit(event)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a3a54', padding: 2, display: 'flex' }}><Edit2 size={12}/></button>
            <button onClick={() => onDelete(event.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a3a54', padding: 2, display: 'flex' }}><Trash2 size={12}/></button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({ events, currentDate, onDayClick, onEventClick, upcomingAll }: {
  events: CalEvent[]; currentDate: Date
  onDayClick: (date: string) => void; onEventClick: (e: CalEvent) => void
  upcomingAll: CalEvent[]
}) {
  const year  = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = todayStr()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsForDay = (day: number) => {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return events.filter(e => e.event_date === ds)
  }

  // Upcoming 7 events across all months
  const upcoming7 = upcomingAll
    .filter(e => e.status === 'pending' && daysUntil(e.event_date) >= 0)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 7)

  // Monthly stats
  const monthPending = events.filter(e => e.status === 'pending')
  const monthPendingAmt = monthPending.reduce((s, e) => s + (e.amount || 0), 0)
  const monthPaid = events.filter(e => e.status === 'paid')

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {/* Main grid */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, overflow: 'hidden' }}>
          {/* Month summary bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 14px', borderBottom: '1px solid #1a1a2e', background: 'rgba(255,255,255,0.01)' }}>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70' }}>
              {events.length} γεγονότα
            </span>
            {monthPendingAmt > 0 && (
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42' }}>
                {monthPendingAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'})} εκκρεμή
              </span>
            )}
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#34d399' }}>
              {monthPaid.length} πληρωμένα
            </span>
            {/* Mini legend */}
            {/* Mini legend */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(CATEGORIES).map(([k, c]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block', flexShrink: 0 }}/>
                  <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #1e1e30' }}>
            {DAY_NAMES_GR.map(d => (
              <div key={d} style={{ padding: '7px 0', textAlign: 'center', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {d}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {cells.map((day, idx) => {
              const dateStr = day ? `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
              const dayEvents = day ? eventsForDay(day) : []
              const isToday = dateStr === today
              const hasOverdue = dayEvents.some(isOverdue)
              const dayAmt = dayEvents.filter(e => e.amount && e.status === 'pending').reduce((s,e)=>s+(e.amount||0),0)

              return (
                <div key={idx} onClick={() => day && onDayClick(dateStr)} style={{
                  minHeight: 74, padding: '5px 5px 3px',
                  borderRight: (idx+1)%7===0 ? 'none' : '1px solid #1a1a2e',
                  borderBottom: idx<cells.length-7 ? '1px solid #1a1a2e' : 'none',
                  background: isToday ? 'rgba(212,175,66,0.05)' : 'transparent',
                  cursor: day ? 'pointer' : 'default', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => { if (day) (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(212,175,66,0.09)' : 'rgba(255,255,255,0.015)' }}
                  onMouseLeave={e => { if (day) (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(212,175,66,0.05)' : 'transparent' }}
                >
                  {day && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{
                          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                          color: isToday ? '#d4af42' : '#5a5a70', fontWeight: isToday ? 700 : 400,
                          width: 20, height: 20, borderRadius: '50%',
                          background: isToday ? 'rgba(212,175,66,0.18)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{day}</span>
                        {hasOverdue && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f87171' }}/>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {dayEvents.slice(0,3).map(ev => (
                          <Tooltip key={ev.id} text={`${ev.title}${ev.amount ? ` · ${ev.amount.toLocaleString('el-GR',{style:'currency',currency:'EUR'})}` : ''}${ev.notes ? `\n${ev.notes}` : ''}`}>
                            <div onClick={e => { e.stopPropagation(); onEventClick(ev) }} style={{
                              fontSize: 9, padding: '1px 4px', borderRadius: 3,
                              background: CATEGORIES[ev.category].bg,
                              color: CATEGORIES[ev.category].color,
                              border: `1px solid ${CATEGORIES[ev.category].border}`,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              cursor: 'pointer', width: '100%',
                              opacity: ev.status === 'paid' ? 0.4 : 1,
                              textDecoration: ev.status === 'paid' ? 'line-through' : 'none',
                            }}>
                              {ev.recurring && '↻ '}{ev.title}
                            </div>
                          </Tooltip>
                        ))}
                        {dayEvents.length > 3 && (
                          <span style={{ fontSize: 8, color: '#4a4a60', paddingLeft: 3 }}>+{dayEvents.length - 3} ακόμα</span>
                        )}
                      </div>
                      {dayAmt > 0 && (
                        <div style={{ marginTop: 2 }}>
                          <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42', opacity: 0.7 }}>
                            {dayAmt >= 1000 ? `${(dayAmt/1000).toFixed(1)}k€` : `${dayAmt.toFixed(0)}€`}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right sidebar: upcoming + mini stats */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Upcoming strip */}
        <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Επόμενα
          </p>
          {upcoming7.length === 0 && (
            <p style={{ fontSize: 10, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace' }}>Κανένα εκκρεμές</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming7.map(ev => {
              const d = daysUntil(ev.event_date)
              const cat = CATEGORIES[ev.category]
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 3, borderRadius: 2, background: cat.color, alignSelf: 'stretch', flexShrink: 0, minHeight: 30 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, color: '#c0c0d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 1 }}>{ev.title}</p>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: d === 0 ? '#f87171' : d <= 3 ? '#fb923c' : '#5a5a70' }}>
                        {d === 0 ? 'Σήμερα' : d === 1 ? 'Αύριο' : `${d}μ`}
                      </span>
                      {ev.amount && <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42' }}>{ev.amount}€</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Monthly mini-stats */}
        <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            {MONTH_SHORT_GR[currentDate.getMonth()]}
          </p>
          {Object.entries(CATEGORIES).map(([k, cat]) => {
            const cnt = events.filter(e => e.category === k).length
            if (cnt === 0) return null
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: cat.color, display: 'flex' }}>{cat.icon}</span>
                <span style={{ fontSize: 10, color: '#6b6b85', flex: 1 }}>{cat.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70' }}>{cnt}</span>
              </div>
            )
          })}
        </div>

        {/* Heatmap mini */}
        <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Ετήσια δραστ.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 3 }}>
            {MONTH_SHORT_GR.map((m, mIdx) => {
              const cnt = upcomingAll.filter(e => {
                const d = new Date(e.event_date)
                return d.getMonth() === mIdx && d.getFullYear() === currentDate.getFullYear()
              }).length
              const intensity = cnt === 0 ? 0 : cnt <= 2 ? 0.2 : cnt <= 5 ? 0.5 : 1
              const isCur = mIdx === currentDate.getMonth()
              return (
                <Tooltip key={m} text={`${m}: ${cnt} γεγονότα`}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 3, background: `rgba(212,175,66,${intensity})`, border: isCur ? '1px solid rgba(212,175,66,0.5)' : '1px solid transparent', marginBottom: 2 }}/>
                    <span style={{ fontSize: 7, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace' }}>{m.slice(0,1)}</span>
                  </div>
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({ events, currentDate, onDayClick, onEventClick }: {
  events: CalEvent[]; currentDate: Date
  onDayClick: (date: string) => void; onEventClick: (e: CalEvent) => void
}) {
  // Get Monday of the week
  const d = new Date(currentDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(d)
    nd.setDate(d.getDate() + i)
    return nd
  })
  const today = todayStr()

  return (
    <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {weekDays.map((wd, idx) => {
          const ds = wd.toISOString().split('T')[0]
          const dayEvs = events.filter(e => e.event_date === ds)
          const isToday = ds === today
          const hasOverdue = dayEvs.some(isOverdue)
          const dayAmt = dayEvs.filter(e=>e.amount&&e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
          return (
            <div key={idx} style={{ borderRight: idx < 6 ? '1px solid #1a1a2e' : 'none' }}>
              {/* Header */}
              <div onClick={() => onDayClick(ds)} style={{
                padding: '10px 8px 8px', borderBottom: '1px solid #1a1a2e', cursor: 'pointer',
                background: isToday ? 'rgba(212,175,66,0.07)' : 'rgba(255,255,255,0.01)',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', marginBottom: 4 }}>
                  {DAY_NAMES_GR[idx === 6 ? 0 : idx + 1]}
                </p>
                <span style={{
                  fontSize: 16, fontFamily: 'JetBrains Mono, monospace',
                  color: isToday ? '#d4af42' : '#c0c0d8', fontWeight: isToday ? 700 : 400,
                  width: 32, height: 32, borderRadius: '50%',
                  background: isToday ? 'rgba(212,175,66,0.15)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                }}>
                  {wd.getDate()}
                </span>
                {hasOverdue && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f87171', margin: '4px auto 0' }}/>}
              </div>
              {/* Events */}
              <div style={{ padding: '6px 5px', minHeight: 120, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dayEvs.map(ev => (
                  <Tooltip key={ev.id} text={`${ev.title}${ev.amount ? ` · ${ev.amount}€` : ''}${ev.notes ? `\n${ev.notes}` : ''}`}>
                    <div onClick={() => onEventClick(ev)} style={{
                      fontSize: 9, padding: '3px 5px', borderRadius: 4,
                      background: CATEGORIES[ev.category].bg,
                      color: CATEGORIES[ev.category].color,
                      border: `1px solid ${CATEGORIES[ev.category].border}`,
                      cursor: 'pointer', opacity: ev.status === 'paid' ? 0.4 : 1,
                      borderLeft: `3px solid ${CATEGORIES[ev.category].color}`,
                    }}>
                      <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                      {ev.amount && <p style={{ fontFamily: 'JetBrains Mono, monospace', opacity: 0.8 }}>{ev.amount}€</p>}
                    </div>
                  </Tooltip>
                ))}
                {dayAmt > 0 && (
                  <p style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42', textAlign: 'center', marginTop: 'auto', opacity: 0.7 }}>
                    {dayAmt}€
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Timeline View ─────────────────────────────────────────────────────────────

function TimelineView({ events, currentYear, onYearChange }: {
  events: CalEvent[]; currentYear: number; onYearChange: (y: number) => void
}) {
  const today = new Date()
  const todayMonth = today.getMonth()
  const totalAmt = events.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const paidAmt  = events.filter(e=>e.status==='paid').reduce((s,e)=>s+(e.amount||0),0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Year totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[
          { label: 'Σύνολο εκκρεμή', value: totalAmt > 0 ? totalAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'}) : '—', color: '#d4af42' },
          { label: 'Ήδη πληρώθηκαν', value: paidAmt > 0 ? paidAmt.toLocaleString('el-GR',{style:'currency',currency:'EUR'}) : '—', color: '#34d399' },
          { label: 'Γεγονότα έτους',  value: `${events.length}`, color: '#60a5fa' },
        ].map(s => (
          <div key={s.label} style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 8, padding: '10px 13px' }}>
            <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: s.color, fontWeight: 600 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => onYearChange(currentYear - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5a70', display: 'flex' }}><ChevronLeft size={14}/></button>
            <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Ετήσιος ορίζοντας {currentYear}
            </p>
            <button onClick={() => onYearChange(currentYear + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5a70', display: 'flex' }}><ChevronRight size={14}/></button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 6 }}>
          {MONTH_SHORT_GR.map((mName, mIdx) => {
            const monthEvs = events.filter(e => {
              const d = new Date(e.event_date)
              return d.getFullYear() === currentYear && d.getMonth() === mIdx
            })
            const isCurrentMonth = mIdx === todayMonth && currentYear === today.getFullYear()
            const isPast = currentYear < today.getFullYear() || (currentYear === today.getFullYear() && mIdx < todayMonth)
            const pending = monthEvs.filter(e => e.status === 'pending')
            const totalM = pending.reduce((s,e) => s+(e.amount||0), 0)
            const overdueCount = monthEvs.filter(isOverdue).length

            return (
              <div key={mIdx} style={{
                background: isCurrentMonth ? 'rgba(212,175,66,0.08)' : isPast ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isCurrentMonth ? 'rgba(212,175,66,0.3)' : overdueCount > 0 ? 'rgba(248,113,113,0.2)' : '#1e1e30'}`,
                borderRadius: 8, padding: '8px 5px', minHeight: 100,
              }}>
                <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: isCurrentMonth ? '#d4af42' : isPast ? '#2a2a3e' : '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, textAlign: 'center' }}>
                  {mName}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {monthEvs.slice(0, 7).map(ev => (
                    <Tooltip key={ev.id} text={`${ev.title}${ev.amount ? ` · ${ev.amount}€` : ''}`}>
                      <div style={{ width: '100%', height: 4, borderRadius: 2, background: CATEGORIES[ev.category].color, opacity: ev.status === 'paid' ? 0.2 : isPast ? 0.5 : 1 }}/>
                    </Tooltip>
                  ))}
                  {monthEvs.length > 7 && <span style={{ fontSize: 7, color: '#3a3a54', textAlign: 'center' }}>+{monthEvs.length-7}</span>}
                </div>
                {totalM > 0 && (
                  <p style={{ fontSize: 8, color: '#d4af42', textAlign: 'center', marginTop: 5, fontFamily: 'JetBrains Mono, monospace' }}>
                    {totalM >= 1000 ? `${(totalM/1000).toFixed(1)}k€` : `${totalM.toFixed(0)}€`}
                  </p>
                )}
                {monthEvs.length === 0 && <p style={{ fontSize: 8, color: '#1e1e30', textAlign: 'center' }}>—</p>}
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid #1a1a2e' }}>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 4, borderRadius: 2, background: cat.color, display: 'inline-block' }}/>
              <span style={{ fontSize: 9, color: '#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>{cat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Auto-Pull Panel ──────────────────────────────────────────────────────────

function AutoPullPanel({ propertyId, userId, onRefresh }: { propertyId: string; userId: string; onRefresh: () => void }) {
  const supabase = createClient()
  const [syncing, setSyncing] = useState(false)
  const [sources, setSources] = useState({ bills: true, loan: true, rent: true })
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function syncAll() {
    setSyncing(true); setMsg(''); let count = 0

    if (sources.bills) {
      const { data: bills } = await supabase.from('bills').select('*').eq('property_id', propertyId)
      if (bills?.length) {
        await supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', 'bills')
        const today = new Date()
        const billEvents = bills.filter((b: any) => b.due_date || b.next_due_date).map((b: any) => {
          let dueDate = b.due_date || b.next_due_date
          const d = new Date(dueDate)
          if (d < today) { d.setMonth(today.getMonth()); d.setFullYear(today.getFullYear()); if (d < today) d.setMonth(d.getMonth() + 1); dueDate = d.toISOString().split('T')[0] }
          return { property_id: propertyId, user_id: userId, title: b.name || b.provider || 'Λογαριασμός', category: 'bills' as EventCategory, event_date: dueDate, amount: b.amount || null, priority: 'medium' as EventPriority, status: (b.paid ? 'paid' : 'pending') as EventStatus, recurring: true, recurring_interval: 'monthly', notes: b.category ? `Κατηγορία: ${b.category}` : null, source: 'bills' }
        })
        if (billEvents.length) { await supabase.from('calendar_events').insert(billEvents); count += billEvents.length }
      }
    }
    if (sources.loan) {
      const { data: tasks } = await supabase.from('maintenance_tasks').select('*').eq('property_id', propertyId)
      if (tasks?.length) {
        await supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', 'loan')
        const taskEvents = tasks.map((t: any) => ({ property_id: propertyId, user_id: userId, title: t.title, category: 'maintenance' as EventCategory, event_date: t.due_date, amount: null, priority: (t.priority || 'medium') as EventPriority, status: (t.completed ? 'paid' : 'pending') as EventStatus, recurring: false, notes: t.description || null, source: 'loan' }))
        await supabase.from('calendar_events').insert(taskEvents); count += taskEvents.length
      }
    }
    if (sources.rent) {
      const { data: prop } = await supabase.from('properties').select('monthly_rent, rent_day').eq('id', propertyId).maybeSingle()
      if (prop?.monthly_rent) {
        await supabase.from('calendar_events').delete().eq('property_id', propertyId).eq('source', 'rent')
        const rentDay = prop.rent_day || 1; const today2 = new Date()
        const rentEvents = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(today2.getFullYear(), today2.getMonth() + i, rentDay)
          return { property_id: propertyId, user_id: userId, title: 'Είσπραξη Ενοικίου', category: 'financial' as EventCategory, event_date: d.toISOString().split('T')[0], amount: prop.monthly_rent, priority: 'high' as EventPriority, status: 'pending' as EventStatus, recurring: true, recurring_interval: 'monthly', notes: 'Auto-pulled από στοιχεία ακινήτου', source: 'rent' }
        })
        await supabase.from('calendar_events').insert(rentEvents); count += rentEvents.length
      }
    }
    setLastSync(new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}))
    setMsg(`✓ Συγχρονίστηκαν ${count} γεγονότα`)
    setSyncing(false); onRefresh()
  }

  return (
    <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Auto-Pull Δεδομένων</p>
          {lastSync && <p style={{ fontSize: 9, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>Τελευταίος sync: {lastSync}</p>}
        </div>
        <button onClick={syncAll} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: syncing ? 'transparent' : 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 7, cursor: syncing ? 'not-allowed' : 'pointer', color: '#34d399', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
          <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}/>
          {syncing ? 'Συγχρονισμός...' : 'Sync τώρα'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {[
          { key: 'bills', label: 'Λογαριασμοί', icon: <Zap size={11}/>, desc: 'Bills tab' },
          { key: 'loan',  label: 'Συντήρηση',   icon: <Wrench size={11}/>, desc: 'Maintenance tasks' },
          { key: 'rent',  label: 'Ενοίκιο',     icon: <DollarSign size={11}/>, desc: '12 μήνες' },
        ].map(({ key, label, icon, desc }) => {
          const active = sources[key as keyof typeof sources]
          return (
            <button key={key} onClick={() => setSources(s => ({ ...s, [key]: !s[key as keyof typeof sources] }))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: active ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(52,211,153,0.25)' : '#1e1e30'}`, borderRadius: 7, cursor: 'pointer' }}>
              <span style={{ color: active ? '#34d399' : '#3a3a54' }}>{icon}</span>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: active ? '#34d399' : '#3a3a54' }}>{label}</p>
                <p style={{ fontSize: 9, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace' }}>{desc}</p>
              </div>
              <span style={{ color: active ? '#34d399' : '#2a2a3e' }}>{active ? <ToggleRight size={14}/> : <ToggleLeft size={14}/>}</span>
            </button>
          )
        })}
      </div>
      {msg && <p style={{ marginTop: 8, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#34d399' }}>{msg}</p>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ─── Event Modal ──────────────────────────────────────────────────────────────

function EventModal({ form, setForm, onSave, onClose, editing, saving }: {
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSave: () => void; onClose: () => void; editing: boolean; saving: boolean
}) {
  const inp: React.CSSProperties = { width: '100%', background: '#08080d', border: '1px solid #242438', borderRadius: 6, padding: '8px 10px', color: '#e2e2f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }

  // Quick templates
  const templates = [
    { label: 'ΔΕΗ',     cat: 'bills',    pri: 'high',   title: 'Πληρωμή ΔΕΗ' },
    { label: 'Ενοίκιο', cat: 'financial', pri: 'high',   title: 'Είσπραξη Ενοικίου' },
    { label: 'ΕΝΦΙΑ',   cat: 'financial', pri: 'critical',title: 'Πληρωμή ΕΝΦΙΑ' },
    { label: 'Ασφάλεια',cat: 'contract',  pri: 'high',   title: 'Ανανέωση Ασφάλειας' },
    { label: 'Service', cat: 'maintenance',pri:'medium',  title: 'Service Κλιματιστικού' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#0e0e1c', border: '1px solid #242438', borderRadius: 12, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {editing ? 'Επεξεργασία' : 'Νέο Γεγονός'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a5a70', display: 'flex' }}><X size={15}/></button>
        </div>

        {/* Quick templates (only for new) */}
        {!editing && (
          <div style={{ marginBottom: 14 }}>
            <p style={lbl}>Γρήγορη επιλογή</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {templates.map(t => (
                <button key={t.label} onClick={() => setForm(f => ({ ...f, title: t.title, category: t.cat as EventCategory, priority: t.pri as EventPriority }))}
                  style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, cursor: 'pointer', border: '1px solid #242438', background: form.title === t.title ? 'rgba(212,175,66,0.12)' : 'transparent', color: form.title === t.title ? '#d4af42' : '#5a5a70', fontFamily: 'JetBrains Mono, monospace', transition: 'all 0.15s' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <label style={lbl}>Τίτλος *</label>
            <input style={inp} placeholder="π.χ. Πληρωμή ΔΕΗ Ιουνίου"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Κατηγορία</label>
              <select style={{ ...inp, appearance: 'none' as any }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as EventCategory }))}>
                {Object.entries(CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Προτεραιότητα</label>
              <select style={{ ...inp, appearance: 'none' as any }} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as EventPriority }))}>
                {Object.entries(PRIORITIES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Ημερομηνία *</label>
              <input type="date" style={inp} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}/>
            </div>
            <div>
              <label style={lbl}>Ποσό (€)</label>
              <input type="number" style={inp} placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
            </div>
          </div>
          <div>
            <label style={lbl}>Κατάσταση</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(STATUSES).map(([k,v]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, status: k as EventStatus }))} style={{ padding: '5px 11px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', border: `1px solid ${form.status===k?v.color:'#242438'}`, background: form.status===k?`${v.color}15`:'transparent', color: form.status===k?v.color:'#5a5a70', transition: 'all 0.15s' }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e1e30', borderRadius: 8, padding: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.recurring ? 10 : 0 }}>
              <div>
                <p style={{ fontSize: 12, color: '#e2e2f0', fontWeight: 500 }}>Επαναλαμβανόμενο</p>
                <p style={{ fontSize: 11, color: '#5a5a70' }}>Ενοίκιο, δόση, ΕΝΦΙΑ κ.λπ.</p>
              </div>
              <button onClick={() => setForm(f => ({ ...f, recurring: !f.recurring }))} style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: form.recurring ? '#d4af42' : '#242438', position: 'relative', transition: 'background 0.2s' }}>
                <span style={{ position: 'absolute', top: 2, left: form.recurring ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }}/>
              </button>
            </div>
            {form.recurring && (
              <select style={{ ...inp, appearance: 'none' as any }} value={form.recurring_interval} onChange={e => setForm(f => ({ ...f, recurring_interval: e.target.value }))}>
                {RECURRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={lbl}>Σημειώσεις</label>
            <textarea style={{ ...inp, resize: 'vertical' as any, minHeight: 56 }} placeholder="Πάροχος, αρ. λογαριασμού, οδηγίες..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
          </div>
          <div>
            <label style={lbl}>Link (τιμολόγιο, σύμβαση)</label>
            <input style={inp} placeholder="https://..." value={form.attachment_url} onChange={e => setForm(f => ({ ...f, attachment_url: e.target.value }))}/>
          </div>
          <button onClick={onSave} disabled={saving || !form.title || !form.event_date} style={{ background: '#d4af42', color: '#08080d', border: 'none', borderRadius: 7, padding: '10px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', fontWeight: 600, opacity: saving || !form.title || !form.event_date ? 0.5 : 1 }}>
            {saving ? 'Αποθήκευση...' : editing ? 'Ενημέρωση' : 'Προσθήκη'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Section helper ───────────────────────────────────────────────────────────

function Section({ title, color, events, onToggle, onEdit, onDelete, collapsed=false, bulkMode, selectedIds, onSelect }: {
  title: string; color: string; events: CalEvent[]
  onToggle: (e: CalEvent) => void; onEdit: (e: CalEvent) => void; onDelete: (id: string) => void
  collapsed?: boolean; bulkMode?: boolean; selectedIds?: Set<string>; onSelect?: (id: string) => void
}) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', marginBottom: open ? 8 : 0, padding: 0 }}>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</span>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#3a3a54' }}>({events.length})</span>
        <ChevronDown size={11} color="#3a3a54" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {events.map(e => (
            <EventCard key={e.id} event={e} onToggleStatus={onToggle} onEdit={onEdit} onDelete={onDelete}
              selected={selectedIds?.has(e.id)} onSelect={onSelect} bulkMode={bulkMode}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabCalendar({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient()
  const [events, setEvents]             = useState<CalEvent[]>([])
  const [loading, setLoading]           = useState(true)
  const [viewMode, setViewMode]         = useState<ViewMode>('month')
  const [currentDate, setCurrentDate]   = useState(new Date())
  const [showModal, setShowModal]       = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null)
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [filterCat, setFilterCat]       = useState<EventCategory | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<EventStatus | 'all'>('all')
  const [showFilters, setShowFilters]   = useState(false)
  const [showAutoPull, setShowAutoPull] = useState(false)
  const [searchQ, setSearchQ]           = useState('')
  const [bulkMode, setBulkMode]         = useState(false)
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [timelineYear, setTimelineYear] = useState(new Date().getFullYear())

  useEffect(() => { load() }, [propertyId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('calendar_events').select('*').eq('property_id', propertyId).order('event_date')
    setEvents(data || [])
    setLoading(false)
  }

  const filtered = events.filter(e => {
    if (filterCat !== 'all' && e.category !== filterCat) return false
    if (filterStatus !== 'all' && e.status !== filterStatus) return false
    if (searchQ && !e.title.toLowerCase().includes(searchQ.toLowerCase())) return false
    return true
  })

  const overdue   = filtered.filter(isOverdue)
  const thisWeek  = filtered.filter(isThisWeek)
  const thisMonth = filtered.filter(isThisMonth)
  const expiring  = filtered.filter(isExpiring)
  const later     = filtered.filter(e => { const d = daysUntil(e.event_date); return e.status === 'pending' && d > 30 })
  const done      = filtered.filter(e => e.status === 'paid' || e.status === 'cancelled')

  const totalPending = filtered.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
  const nextEvent    = filtered.filter(e=>e.status==='pending'&&daysUntil(e.event_date)>=0).sort((a,b)=>a.event_date.localeCompare(b.event_date))[0]

  const monthEvents = filtered.filter(e => {
    const d = new Date(e.event_date)
    return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === currentDate.getMonth()
  })
  const weekEvents = filtered // WeekView handles internal filtering

  function openNew(date?: string) {
    setEditingEvent(null); setForm({ ...EMPTY_FORM, event_date: date || '' }); setShowModal(true)
  }
  function openEdit(e: CalEvent) {
    setEditingEvent(e)
    setForm({ title: e.title, category: e.category, event_date: e.event_date, amount: e.amount?.toString()||'', priority: e.priority, status: e.status, recurring: e.recurring, recurring_interval: e.recurring_interval||'monthly', notes: e.notes||'', attachment_url: e.attachment_url||'' })
    setShowModal(true)
  }

  async function saveEvent() {
    if (!form.title || !form.event_date) return
    setSaving(true)
    const payload = { property_id: propertyId, user_id: userId, title: form.title, category: form.category, event_date: form.event_date, amount: form.amount ? parseFloat(form.amount) : null, priority: form.priority, status: form.status, recurring: form.recurring, recurring_interval: form.recurring ? form.recurring_interval : null, notes: form.notes||null, attachment_url: form.attachment_url||null, source: 'manual' }
    if (editingEvent) { await supabase.from('calendar_events').update(payload).eq('id', editingEvent.id) }
    else { await supabase.from('calendar_events').insert(payload) }
    await load(); setShowModal(false); setSaving(false)
  }

  async function toggleStatus(e: CalEvent) {
    const ns: EventStatus = e.status === 'paid' ? 'pending' : 'paid'
    await supabase.from('calendar_events').update({ status: ns }).eq('id', e.id)
    setEvents(prev => prev.map(ev => ev.id === e.id ? { ...ev, status: ns } : ev))
  }
  async function deleteEvent(id: string) {
    if (!confirm('Διαγραφή γεγονότος;')) return
    await supabase.from('calendar_events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  // Bulk actions
  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  async function bulkMarkPaid() {
    if (!selectedIds.size) return
    await Promise.all([...selectedIds].map(id => supabase.from('calendar_events').update({ status: 'paid' }).eq('id', id)))
    await load(); setSelectedIds(new Set()); setBulkMode(false)
  }
  async function bulkDelete() {
    if (!selectedIds.size || !confirm(`Διαγραφή ${selectedIds.size} γεγονότων;`)) return
    await Promise.all([...selectedIds].map(id => supabase.from('calendar_events').delete().eq('id', id)))
    await load(); setSelectedIds(new Set()); setBulkMode(false)
  }

  // iCal export
  function exportICal() {
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Property OS//GR','CALSCALE:GREGORIAN']
    filtered.forEach(e => {
      const d = e.event_date.replace(/-/g,'')
      lines.push('BEGIN:VEVENT',`UID:${e.id}@propertyos`,`DTSTART;VALUE=DATE:${d}`,`SUMMARY:${e.title}`,e.notes?`DESCRIPTION:${e.notes}`:'','END:VEVENT')
    })
    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.filter(Boolean).join('\r\n')],{type:'text/calendar'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='property-os.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  // Print
  function printCalendar() { window.print() }

  // Go to today
  function goToday() { setCurrentDate(new Date()) }

  const prevPeriod = () => {
    if (viewMode === 'week') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1))
  }
  const nextPeriod = () => {
    if (viewMode === 'week') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7))
    else setCurrentDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1))
  }

  const periodLabel = () => {
    if (viewMode === 'week') {
      const d = new Date(currentDate)
      const day = d.getDay(); const diff = d.getDate() - day + (day===0?-6:1)
      d.setDate(diff)
      const end = new Date(d); end.setDate(d.getDate()+6)
      return `${d.getDate()} ${MONTH_SHORT_GR[d.getMonth()]} – ${end.getDate()} ${MONTH_SHORT_GR[end.getMonth()]}`
    }
    return `${MONTH_NAMES_GR[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── KPI Bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[
          { label: 'Εκκρεμή ποσά',       value: totalPending>0 ? totalPending.toLocaleString('el-GR',{style:'currency',currency:'EUR'}) : '—', color: totalPending>0?'#d4af42':'#5a5a70', icon: <TrendingUp size={13}/> },
          { label: 'Εκπρόθεσμα',         value: overdue.length>0?`${overdue.length} γεγονότα`:'Κανένα ✓', color: overdue.length>0?'#f87171':'#34d399', icon: <AlertTriangle size={13}/> },
          { label: 'Επόμενη πληρωμή',    value: nextEvent?(daysUntil(nextEvent.event_date)===0?'Σήμερα!':`σε ${daysUntil(nextEvent.event_date)}μ`):'—', color: '#60a5fa', icon: <Clock size={13}/> },
          { label: 'Λήξεις συμβολαίων', value: expiring.length>0?`${expiring.length} σύντομα`:'Κανένα', color: expiring.length>0?'#a78bfa':'#5a5a70', icon: <Shield size={13}/> },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 8, padding: '10px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ color: kpi.color, opacity: 0.7 }}>{kpi.icon}</span>
              <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{kpi.label}</p>
            </div>
            <p style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', color: kpi.color, fontWeight: 600 }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Smart Alerts ── */}
      {(overdue.length>0||expiring.length>0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {overdue.length>0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 8, padding: '9px 13px' }}>
              <AlertTriangle size={13} color="#f87171"/>
              <p style={{ fontSize: 12, color: '#f87171', fontFamily: 'JetBrains Mono, monospace', flex: 1 }}>
                {overdue.length} εκπρόθεσμ{overdue.length===1?'ο γεγονός':'α γεγονότα'} — χρειάζονται άμεση δράση
              </p>
              <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>
                {overdue.reduce((s,e)=>s+(e.amount||0),0)>0 && `${overdue.reduce((s,e)=>s+(e.amount||0),0).toLocaleString('el-GR',{style:'currency',currency:'EUR'})}`}
              </span>
            </div>
          )}
          {expiring.length>0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: 8, padding: '9px 13px' }}>
              <Shield size={13} color="#a78bfa"/>
              <p style={{ fontSize: 12, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>
                {expiring.length} συμβόλαι{expiring.length===1?'ο λήγει':'α λήγουν'} εντός 60 ημερών — {expiring.map(e=>`${e.title} (${fmtShort(e.event_date)})`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {/* View toggle */}
        <div style={{ display: 'flex', background: '#12121f', border: '1px solid #242438', borderRadius: 7, overflow: 'hidden' }}>
          {([
            ['month','Μήνας',<Calendar size={11}/>],
            ['week','Εβδομάδα',<CalendarDays size={11}/>],
            ['list','Λίστα',<List size={11}/>],
            ['timeline','Timeline',<BarChart2 size={11}/>],
          ] as [ViewMode,string,React.ReactNode][]).map(([v,label,icon]) => (
            <button key={v} onClick={() => setViewMode(v)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: 'none', borderRight: '1px solid #1e1e30', cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', background: viewMode===v?'rgba(212,175,66,0.15)':'transparent', color: viewMode===v?'#d4af42':'#5a5a70', transition: 'all 0.15s' }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Period nav */}
        {viewMode !== 'list' && viewMode !== 'timeline' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button onClick={prevPeriod} style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#5a5a70', display: 'flex' }}><ChevronLeft size={12}/></button>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#e2e2f0', minWidth: 160, textAlign: 'center' }}>{periodLabel()}</span>
            <button onClick={nextPeriod} style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#5a5a70', display: 'flex' }}><ChevronRight size={12}/></button>
            <button onClick={goToday} style={{ padding: '5px 10px', background: 'transparent', border: '1px solid #242438', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70' }}>Σήμερα</button>
          </div>
        )}

        <input placeholder="Αναζήτηση..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
          style={{ flex: 1, minWidth: 100, background: '#12121f', border: '1px solid #242438', borderRadius: 7, padding: '6px 10px', color: '#e2e2f0', fontSize: 11, fontFamily: 'inherit', outline: 'none' }}/>

        {/* Bulk mode toggle */}
        <button onClick={() => { setBulkMode(b=>!b); setSelectedIds(new Set()) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 9px', background: bulkMode?'rgba(96,165,250,0.1)':'#12121f', border: `1px solid ${bulkMode?'rgba(96,165,250,0.3)':'#242438'}`, borderRadius: 7, cursor: 'pointer', color: bulkMode?'#60a5fa':'#5a5a70', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
          <CheckSquare size={11}/>Bulk
        </button>

        <button onClick={() => setShowFilters(f=>!f)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 9px', background: showFilters?'rgba(212,175,66,0.1)':'#12121f', border: `1px solid ${showFilters?'rgba(212,175,66,0.3)':'#242438'}`, borderRadius: 7, cursor: 'pointer', color: showFilters?'#d4af42':'#5a5a70', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
          <Filter size={11}/>Φίλτρα
        </button>

        <button onClick={() => setShowAutoPull(f=>!f)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 9px', background: showAutoPull?'rgba(52,211,153,0.08)':'#12121f', border: `1px solid ${showAutoPull?'rgba(52,211,153,0.3)':'#242438'}`, borderRadius: 7, cursor: 'pointer', color: showAutoPull?'#34d399':'#5a5a70', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
          <RefreshCw size={11}/>Sync
        </button>

        <button onClick={exportICal} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 9px', background: '#12121f', border: '1px solid #242438', borderRadius: 7, cursor: 'pointer', color: '#5a5a70', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
          <Download size={11}/>iCal
        </button>

        <button onClick={printCalendar} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 9px', background: '#12121f', border: '1px solid #242438', borderRadius: 7, cursor: 'pointer', color: '#5a5a70', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
          <Printer size={11}/>Print
        </button>

        <button onClick={() => openNew()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: '#d4af42', border: 'none', borderRadius: 7, cursor: 'pointer', color: '#08080d', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <Plus size={12}/>Προσθήκη
        </button>
      </div>

      {/* ── Bulk action bar ── */}
      {bulkMode && selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '9px 14px' }}>
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#60a5fa' }}>{selectedIds.size} επιλεγμένα</span>
          <button onClick={bulkMarkPaid} style={{ padding: '4px 12px', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 10, color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>✓ Mark as Paid</button>
          <button onClick={bulkDelete} style={{ padding: '4px 12px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 10, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>Διαγραφή</button>
          <button onClick={() => setSelectedIds(new Set(filtered.map(e=>e.id)))} style={{ padding: '4px 12px', background: 'transparent', border: '1px solid #242438', borderRadius: 6, cursor: 'pointer', fontSize: 10, color: '#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>Επιλογή όλων</button>
        </div>
      )}

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Κατηγορία</p>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button onClick={() => setFilterCat('all')} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', border: '1px solid #242438', background: filterCat==='all'?'#d4af42':'transparent', color: filterCat==='all'?'#08080d':'#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>Όλες</button>
              {Object.entries(CATEGORIES).map(([k,v]) => (
                <button key={k} onClick={() => setFilterCat(k as EventCategory)} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', border: `1px solid ${filterCat===k?v.color:'#242438'}`, background: filterCat===k?v.bg:'transparent', color: filterCat===k?v.color:'#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>{v.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Κατάσταση</p>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button onClick={() => setFilterStatus('all')} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', border: '1px solid #242438', background: filterStatus==='all'?'#d4af42':'transparent', color: filterStatus==='all'?'#08080d':'#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>Όλες</button>
              {Object.entries(STATUSES).map(([k,v]) => (
                <button key={k} onClick={() => setFilterStatus(k as EventStatus)} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', border: `1px solid ${filterStatus===k?v.color:'#242438'}`, background: filterStatus===k?`${v.color}15`:'transparent', color: filterStatus===k?v.color:'#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>{v.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Auto-Pull ── */}
      {showAutoPull && <AutoPullPanel propertyId={propertyId} userId={userId} onRefresh={load}/>}

      {/* ── Loading ── */}
      {loading && <div style={{ textAlign: 'center', padding: 40 }}><p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#3a3a54' }}>Φόρτωση...</p></div>}

      {/* ── Month View ── */}
      {!loading && viewMode === 'month' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MonthView events={monthEvents} currentDate={currentDate} onDayClick={openNew} onEventClick={openEdit} upcomingAll={filtered}/>
          {monthEvents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Γεγονότα {MONTH_NAMES_GR[currentDate.getMonth()]}
              </p>
              {monthEvents.map(e => (
                <EventCard key={e.id} event={e} onToggleStatus={toggleStatus} onEdit={openEdit} onDelete={deleteEvent}
                  selected={selectedIds.has(e.id)} onSelect={toggleSelect} bulkMode={bulkMode}/>
              ))}
            </div>
          )}
          {monthEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#3a3a54' }}>Δεν υπάρχουν γεγονότα αυτόν τον μήνα</p>
            </div>
          )}
        </div>
      )}

      {/* ── Week View ── */}
      {!loading && viewMode === 'week' && (
        <WeekView events={filtered} currentDate={currentDate} onDayClick={openNew} onEventClick={openEdit}/>
      )}

      {/* ── List View ── */}
      {!loading && viewMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {overdue.length>0   && <Section title="Εκπρόθεσμα"               color="#f87171" events={overdue}   onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisWeek.length>0  && <Section title="Επόμενες 7 μέρες"         color="#d4af42" events={thisWeek}  onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {thisMonth.length>0 && <Section title="Αυτόν τον μήνα"            color="#60a5fa" events={thisMonth} onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {later.length>0     && <Section title="Αργότερα"                  color="#5a5a70" events={later}     onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {done.length>0      && <Section title="Ολοκληρωμένα / Ακυρωμένα" color="#2a2a3e" events={done}      onToggle={toggleStatus} onEdit={openEdit} onDelete={deleteEvent} collapsed bulkMode={bulkMode} selectedIds={selectedIds} onSelect={toggleSelect}/>}
          {filtered.length===0 && (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <Calendar size={28} color="#2a2a3e" style={{ margin: '0 auto 10px' }}/>
              <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#3a3a54' }}>Δεν υπάρχουν γεγονότα</p>
            </div>
          )}
        </div>
      )}

      {/* ── Timeline View ── */}
      {!loading && viewMode === 'timeline' && (
        <TimelineView events={filtered} currentYear={timelineYear} onYearChange={setTimelineYear}/>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <EventModal form={form} setForm={setForm} onSave={saveEvent} onClose={() => setShowModal(false)} editing={!!editingEvent} saving={saving}/>
      )}
    </div>
  )
}