'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { CustomSelect, NumberInput, TextInput, DatePicker, Toggle, Textarea } from './UIComponents'
import { T, PageTitle, KPIGrid, SecHdr, InfoBanner, Btn, EmptyState, fe, fn, fd, Spinner, ExportButton } from '@/components/Theme'
import { downloadCsv, csvEur, csvDate, csvSafe } from './exportCsv'
import { depreciate, replacementSuggestion, portfolioSummary, USEFUL_LIFE_YEARS } from '@/lib/inventory/depreciation'

const supabase = createSupabaseClient()

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))

interface InventoryItem {
  id: string; property_id: string; user_id: string
  name: string; category: string; room: string; brand: string; model: string
  serial_number: string; purchase_value: number; current_value: number
  purchase_date: string; warranty_expiry: string; condition: string
  notes: string; photo_url: string; photos: string[]
  energy_class: string; power_watts: number; daily_hours_use: number
  standby_watts: number; replacement_cost: number
  smart_device: boolean; smart_notes: string; tags: string[]
  provenance: string; original_price: number; discount_pct: number
  store_vendor: string; receipt_number: string
  created_at: string; updated_at: string
}
interface InventoryRepair {
  id: string; item_id: string; user_id: string
  repair_date: string; cost: number; technician: string; description: string
}
interface InventoryHandover {
  id: string; property_id: string
  handover_type: 'check_in' | 'check_out'
  tenant_name: string; tenant_phone: string; handover_date: string
  notes: string; items_snapshot: HandoverItemSnapshot[]; created_at: string
}
interface HandoverItemSnapshot {
  item_id: string; name: string; category: string
  condition_at_handover: string; condition_notes: string; photo_url: string
}
interface MaintenanceSchedule {
  id: string; property_id: string; user_id: string; item_id: string
  item_name: string; task: string; interval_months: number
  last_done: string; next_due: string; notes: string
}
interface TabInventoryProps { propertyId: string; userId: string; profileType?: 'individual'|'professional' }

const CATEGORIES = ['Επιπλα','Ηλεκτρικες Συσκευες','Ηλεκτρονικα','Υδραυλικα','Θερμανση & Ψυξη','Φωτιστικα','Διακοσμηση','Λοιπα']
const CATEGORIES_DISPLAY = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά']
const ROOM_PRESETS = ['Σαλόνι','Κουζίνα','Κύριο Υπνοδωμάτιο','Υπνοδωμάτιο 2','Υπνοδωμάτιο 3','Μπάνιο','WC','Χολ / Διάδρομος','Μπαλκόνι','Αποθήκη','Γκαράζ']
const CONDITIONS = ['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
const ENERGY_CLASSES = ['A+++','A++','A+','A','B','C','D','E','F','G']
const PROVENANCE_OPTIONS = [
  {value:'new', label:'Νέο, Αγορά από κατάστημα'},
  {value:'used', label:'Μεταχειρισμένο'},
  {value:'refurbished', label:'Ανακατασκευασμένο (Refurbished)'},
  {value:'gift', label:'Δώρο'},
  {value:'previous_home', label:'Από προηγούμενο σπίτι'},
  {value:'family', label:'Από οικογένεια / φίλο'},
  {value:'inherited', label:'Κληρονομιά'},
  {value:'discount', label:'Αγορά με έκπτωση'},
]
const CONDITION_COLOR: Record<string,string> = {
  'Άριστη':'var(--positive)','Καλή':'var(--info)','Μέτρια':'var(--warning)',
  'Κακή':'var(--negative)','Εκτός Λειτουργίας':'var(--text-tertiary)',
}
const ENERGY_COLOR: Record<string,string> = {
  'A+++':'#059669','A++':'#00897b','A+':'#34d399','A':'#22c55e',
  'B':'#fbbf24','C':'#e8710a','D':'#e8710a','E':'#c5221f','F':'#dc2626','G':'#991b1b',
}
const CATEGORY_ICONS: Record<string,string> = {
  'Έπιπλα':'','Ηλεκτρικές Συσκευές':'','Ηλεκτρονικά':'',
  'Υδραυλικά':'','Θέρμανση & Ψύξη':'','Φωτιστικά':'','Διακόσμηση':'','Λοιπά':'',
}
// Ωφέλιμη ζωή ανά κατηγορία: πηγή αλήθειας στο lib/inventory/depreciation.ts (μοιράζεται με τα τεστ).
const DEPRECIATION_YEARS = USEFUL_LIFE_YEARS
const REPLACEMENT_RANGES: Record<string,{min:number;max:number}> = {
  'Ηλεκτρικές Συσκευές':{min:200,max:1200},'Ηλεκτρονικά':{min:150,max:2000},
  'Θέρμανση & Ψύξη':{min:300,max:3000},'Φωτιστικά':{min:30,max:500},
  'Έπιπλα':{min:100,max:3000},'Υδραυλικά':{min:50,max:800},'Λοιπά':{min:50,max:500},
}
const AVAILABLE_TAGS = ['Ενεργοβόρο','Υπό Παρακολούθηση','Νέο','Αντικ. Σύντομα','Έξυπνη','Εγγύηση Ενεργή','Επισκευάστηκε','Σημαντικό']
const DEFAULT_MAINTENANCE = [
  {task:'Ετήσιος έλεγχος λέβητα',interval_months:12,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρων κλιματιστικού',interval_months:3,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρου πλυντηρίου',interval_months:3,category:'Ηλεκτρικές Συσκευές'},
  {task:'Αποασβεστοποίηση καφετιέρας',interval_months:2,category:'Ηλεκτρικές Συσκευές'},
  {task:'Έλεγχος μπαταρίας ανιχνευτή καπνού',interval_months:6,category:'Λοιπά'},
  {task:'Έλεγχος αντλίας θερμότητας',interval_months:12,category:'Θέρμανση & Ψύξη'},
]

// Οι υπολογισμοί απόσβεσης διοχετεύονται στην καθαρή μηχανή του lib (μία πηγή αλήθειας).
const calcCurrentValue = (item: InventoryItem) => depreciate(item).bookValue
const calcDepreciationPct = (item: InventoryItem) => depreciate(item).depreciatedPct
const calcYearsLeft = (item: InventoryItem) => depreciate(item).yearsRemaining
const calcAgeDisplay = (d: string) => {
  if (!d) return ''
  const ms = Date.now() - new Date(d).getTime()
  const y = Math.floor(ms/(1000*60*60*24*365))
  const m = Math.floor((ms%(1000*60*60*24*365))/(1000*60*60*24*30))
  if (y===0) return `${m} μήνες`
  if (m===0) return `${y} χρόνια`
  return `${y} χρόνια ${m} μήνες`
}
const calcMonthlyKwh = (item: InventoryItem) => {
  if (!item.power_watts||!item.daily_hours_use) return 0
  const active = (item.power_watts/1000)*item.daily_hours_use*30
  const standby = item.standby_watts ? (item.standby_watts/1000)*(24-item.daily_hours_use)*30 : 0
  return Math.round((active+standby)*10)/10
}
const calcMonthlyCost = (item: InventoryItem, price: number) => Math.round(calcMonthlyKwh(item)*price*100)/100
const fmtEur = (n: number) => new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmtEurC = (n: number) => new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('el-GR') : '—'
const daysUntil = (d: string) => !d ? Infinity : Math.ceil((new Date(d).getTime()-Date.now())/(1000*60*60*24))
const warrantyStatus = (expiry: string) => {
  if (!expiry) return {label:'Χωρίς εγγύηση',color:'var(--text-tertiary)'}
  const d = daysUntil(expiry)
  if (d<0) return {label:'Έληξε',color:'var(--negative)'}
  if (d<=30) return {label:`${d} μέρες`,color:'var(--negative)'}
  if (d<=90) return {label:`${d} μέρες`,color:'var(--warning)'}
  return {label:`έως ${fmtDate(expiry)}`,color:'var(--positive)'}
}
const addMonths = (date: string, months: number) => {
  const d = date ? new Date(date) : new Date()
  d.setMonth(d.getMonth()+months)
  return d.toISOString().split('T')[0]
}
const needsAction = (item: InventoryItem) => {
  const d = daysUntil(item.warranty_expiry)
  return item.condition==='Κακή'||item.condition==='Εκτός Λειτουργίας'||calcDepreciationPct(item)>=100||(d>=0&&d<=90)
}
const provenanceLabel = (p: string) => PROVENANCE_OPTIONS.find(o=>o.value===p)?.label.split('—')[0].trim()||''

// ── MD3 Design Tokens ──────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background:'var(--bg-surface)',
  border:'1px solid var(--border-subtle)',
  borderRadius:T.radius.card,
  padding:'18px 20px',
}
const labelStyle: React.CSSProperties = {
  fontSize:11,
  color:'var(--text-secondary)',
  textTransform:'uppercase' as const,
  letterSpacing:'0.06em',
  fontWeight:600,
  fontFamily:T.font.sans,
  display:'block',
  marginBottom:7,
}
const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <SecHdr label={label} right={right}/>
)

const Badge = ({label,color}:{label:string;color:string}) => (
  <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:T.radius.pill,fontSize:10,fontWeight:500,fontFamily:T.font.sans,color,background:color+'18',border:`1px solid ${color}30`,whiteSpace:'nowrap'}}>{label}</span>
)

const EnergyBadge = ({cls}:{cls:string}) => { if(!cls) return null; const c=ENERGY_COLOR[cls]||'var(--text-tertiary)'; return (
  <span title={`Ενεργειακή κλάση ${cls}`} style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,color:c,background:c+'18',border:`1px solid ${c}30`,letterSpacing:'0.5px',fontFamily:T.font.sans}}>{cls}</span>
) }

const DepBar = ({pct,left}:{pct:number;left:number}) => {
  const c = pct<40?'var(--positive)':pct<70?'var(--warning)':'var(--negative)'
  return (
    <div>
      <div style={{height:3,background:'var(--border-subtle)',borderRadius:2,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:c,borderRadius:2,transition:'width 0.4s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>Απόσβεση {pct}%</span>
        {left>0
          ?<span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>~{left} χρόνια</span>
          :<span style={{fontSize:9,color:'var(--negative)',fontWeight:700,fontFamily:T.font.sans}}>Πλήρης</span>
        }
      </div>
    </div>
  )
}

// Ήπια ένδειξη πρότασης αντικατάστασης — calm, όχι «κόκκινος συναγερμός».
function ReplacementHint({item,compact}:{item:InventoryItem;compact?:boolean}) {
  const s = replacementSuggestion(item)
  if (s.severity === 'none') return null
  const due = s.severity === 'due'
  const tip = s.reasons.join(' · ')
  if (due) return (
    <div title={tip} style={{display:'inline-flex',alignItems:'center',gap:6,padding:compact?'2px 8px':'6px 10px',borderRadius:compact?20:8,background:'var(--warning-soft)',border:'1px solid var(--warning-border)',maxWidth:'100%'}}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <span style={{fontSize:compact?9:10,color:'var(--warning)',fontFamily:T.font.sans,fontWeight:600,letterSpacing:compact?'0.02em':0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Προτείνεται αντικατάσταση</span>
    </div>
  )
  // soft: πλησιάζει τέλος ωφέλιμης ζωής
  return (
    <span title={tip} style={{fontSize:compact?9:10,color:'var(--text-tertiary)',fontFamily:T.font.sans,whiteSpace:'nowrap'}}>Πλησιάζει το τέλος ζωής</span>
  )
}

function InlineConditionEdit({item,onUpdate}:{item:InventoryItem;onUpdate:(id:string,c:string)=>void}) {
  const [open,setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)
  },[])
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <button onClick={()=>setOpen(v=>!v)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:T.radius.pill,fontSize:10,fontWeight:500,fontFamily:T.font.sans,color:CONDITION_COLOR[item.condition],background:CONDITION_COLOR[item.condition]+'18',border:`1px solid ${CONDITION_COLOR[item.condition]}40`,cursor:'pointer'}}>
        {item.condition}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l3 3 3-3"/></svg>
      </button>
      {open&&(
        <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:T.radius.card,padding:6,zIndex:600,minWidth:160,boxShadow:'var(--shadow-lg)'}}>
          {CONDITIONS.map(c=>(
            <div key={c} onClick={()=>{onUpdate(item.id,c);setOpen(false)}}
              style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:12,fontFamily:T.font.sans,color:CONDITION_COLOR[c],background:item.condition===c?CONDITION_COLOR[c]+'15':'transparent',fontWeight:item.condition===c?600:400,transition:'background 0.1s'}}
              onMouseEnter={e=>(e.currentTarget.style.background=CONDITION_COLOR[c]+'10')}
              onMouseLeave={e=>(e.currentTarget.style.background=item.condition===c?CONDITION_COLOR[c]+'15':'transparent')}
            >{c}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Διακριτικό μενού ενεργειών «···» — μαζεύει όλες τις ενέργειες ανά αντικείμενο.
interface OverflowAction { label:string; onClick:()=>void; icon?:React.ReactNode; danger?:boolean }
function OverflowMenu({actions,align='right',dark}:{actions:OverflowAction[];align?:'left'|'right';dark?:boolean}) {
  const [open,setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)
  },[])
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}} onClick={e=>e.stopPropagation()}>
      <button title="Ενέργειες" aria-label="Ενέργειες" onClick={()=>setOpen(v=>!v)}
        style={{width:28,height:28,borderRadius:T.radius.pill,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s',
          border:`1px solid ${dark?'rgba(255,255,255,0.25)':'var(--border-subtle)'}`,
          background:dark?'rgba(0,0,0,0.45)':(open?'var(--bg-hover)':'var(--bg-surface)'),
          color:dark?'#fff':'var(--text-secondary)',backdropFilter:dark?'blur(4px)':undefined}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
      {open&&(
        <div style={{position:'absolute',top:'calc(100% + 6px)',...(align==='right'?{right:0}:{left:0}),background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:5,zIndex:800,minWidth:180,boxShadow:'var(--shadow-lg)'}}>
          {actions.map((a,i)=>(
            <button key={i} onClick={()=>{a.onClick();setOpen(false)}}
              style={{display:'flex',alignItems:'center',gap:10,width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:8,fontSize:12.5,fontFamily:T.font.sans,fontWeight:500,color:a.danger?'var(--negative)':'var(--text-primary)',background:'transparent',border:'none',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=a.danger?'var(--negative-dim)':'var(--bg-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{display:'flex',width:15,color:a.danger?'var(--negative)':'var(--text-tertiary)',flexShrink:0}}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
const IconEdit = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
const IconRepair = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 00-5.6 5.6l-6 6L5 20l6-6a4 4 0 005.6-5.6l-2.3 2.3-2-2z"/></svg>
const IconQR = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 20h.01M20 14h.01M14 20h.01"/></svg>
const IconCal = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
const IconTrash = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>

function RoomInput({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  const [showCustom,setShowCustom] = useState(!ROOM_PRESETS.includes(value)&&value!=='')
  const [focused,setFocused] = useState(false)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {ROOM_PRESETS.map(r=>(
          <button key={r} onClick={()=>{onChange(r);setShowCustom(false)}} style={{padding:'4px 10px',borderRadius:T.radius.pill,fontSize:11,cursor:'pointer',fontFamily:T.font.sans,border:`1px solid ${value===r?'var(--accent)':'var(--border-subtle)'}`,background:value===r?'var(--accent-dim)':'transparent',color:value===r?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>
            {r}
          </button>
        ))}
        <button onClick={()=>{setShowCustom(true);onChange('')}} style={{padding:'4px 10px',borderRadius:T.radius.pill,fontSize:11,cursor:'pointer',fontFamily:T.font.sans,border:`1px solid ${showCustom?'var(--accent)':'var(--border-subtle)'}`,background:showCustom?'var(--accent-dim)':'transparent',color:showCustom?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>
          Άλλο...
        </button>
      </div>
      {showCustom&&(
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder="Πληκτρολογήστε δωμάτιο..." onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{background:'var(--bg-surface)',border:`1px solid ${focused?'var(--accent)':'var(--border-default)'}`,boxShadow:focused?'0 0 0 3px var(--accent-dim)':'none',borderRadius:T.radius.inner,padding:'0 14px',height:42,color:'var(--text-primary)',fontSize:14,letterSpacing:0,outline:'none',fontFamily:T.font.sans,width:'100%',boxSizing:'border-box'}}
        />
      )}
    </div>
  )
}

function MultiPhotoUpload({photos,onAdd,onRemove,primary,onSetPrimary}:{photos:string[];onAdd:(u:string)=>void;onRemove:(u:string)=>void;primary:string;onSetPrimary:(u:string)=>void}) {
  const [uploading,setUploading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const handleFile = async(file:File) => {
    setUploading(true)
    const path=`${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
    const {error} = await supabase.storage.from('inventory-photos').upload(path,file,{upsert:true})
    if(error){alert('Σφάλμα upload: '+error.message);setUploading(false);return}
    const {data:u} = supabase.storage.from('inventory-photos').getPublicUrl(path)
    onAdd(u.publicUrl);setUploading(false)
  }
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:8}}>
        {photos.map((url,i)=>(
          <div key={i} style={{position:'relative',height:80,borderRadius:8,overflow:'hidden',border:`2px solid ${url===primary?'var(--accent)':'var(--border-subtle)'}`,cursor:'pointer'}} onClick={()=>onSetPrimary(url)}>
            <img src={url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
            <button onClick={e=>{e.stopPropagation();onRemove(url)}} style={{position:'absolute',top:4,right:4,width:18,height:18,borderRadius:'50%',background:'rgba(197,34,31,0.9)',border:'none',color:'#fff',fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            {url===primary&&<div style={{position:'absolute',bottom:0,inset:'auto 0 0 0',background:'var(--accent)',fontSize:8,color:'var(--accent-text)',textAlign:'center',fontWeight:700,fontFamily:T.font.sans,padding:'2px',letterSpacing:'0.5px'}}>ΚΥΡΙΑ</div>}
          </div>
        ))}
        <div onClick={()=>!uploading&&ref.current?.click()} style={{height:80,borderRadius:8,border:'1.5px dashed var(--border-accent)',background:'var(--accent-dim)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,cursor:uploading?'wait':'pointer'}}>
          <span style={{fontSize:12,color:'var(--accent)',fontFamily:T.font.sans,fontWeight:500}}>{uploading?'...':'+ Φωτο'}</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
      {photos.length>1&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:6,fontFamily:T.font.sans}}>Κλικ φωτογραφίας για κύρια</p>}
    </div>
  )
}

function QRModal({item,onClose}:{item:InventoryItem;onClose:()=>void}) {
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify({n:item.name,b:item.brand,m:item.model,sn:item.serial_number,cat:item.category,cond:item.condition,w:item.warranty_expiry}))}`
  const print = () => {
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>QR</title><style>body{font-family:'Inter',Roboto,sans-serif;padding:24px;text-align:center}@media print{button{display:none}}</style></head><body><h2>${esc(item.name)}</h2><img src="${esc(qr)}" width="180" height="180" style="margin:12px auto;display:block;border:1px solid #eee;padding:8px;border-radius:8px"/><button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer;border-radius:6px">Εκτύπωση</button></body></html>`)
    w.document.close()
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:28,maxWidth:320,width:'100%',display:'flex',flexDirection:'column',gap:16,alignItems:'center',boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
          <p title="Κωδικός QR — γρήγορη σάρωση στοιχείων αντικειμένου με κινητό" style={{fontSize:16,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>QR Αντικειμένου</p>
          <button onClick={onClose} style={{padding:'4px 12px',borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer',fontFamily:T.font.sans}}>Κλείσιμο</button>
        </div>
        <div style={{background:'#fff',padding:12,borderRadius:T.radius.card}}><img src={qr} width={200} height={200} alt="QR"/></div>
        <div style={{textAlign:'center'}}>
          <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
          <p title="SN = Σειριακός αριθμός (Serial Number)" style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{item.brand} {item.model}{item.serial_number?` · SN: ${item.serial_number}`:''}</p>
        </div>
        <button onClick={print} style={{width:'100%',padding:'10px',borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>Εκτύπωση Καρτέλας</button>
      </div>
    </div>
  )
}

function BulkImportModal({propertyId,userId,onImported,onClose}:{propertyId:string;userId:string;onImported:()=>void;onClose:()=>void}) {
  const [step,setStep] = useState<'upload'|'preview'>('upload')
  const [rows,setRows] = useState<Partial<InventoryItem>[]>([])
  const [errors,setErrors] = useState<string[]>([])
  const [importing,setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const TEMPLATE = `Ονομασία,Κατηγορία,Δωμάτιο,Μάρκα,Μοντέλο,Σειριακός,Κατάσταση,Αξία Αγοράς,Ημ/νία Αγοράς,Λήξη Εγγύησης,Ενεργ.Κλάση,Ισχύς (W),Ώρες/Ημέρα,Προέλευση,Κατάστημα\nΠλυντήριο,Ηλεκτρικές Συσκευές,Κουζίνα,Bosch,WAU28,SN123,Καλή,650,2021-03-15,2026-03-15,A+,2100,1,new,Κωτσόβολος`
  const downloadTemplate = () => {
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+TEMPLATE],{type:'text/csv;charset=utf-8;'}));a.download='template.csv';a.click()
  }
  const parseCSV = (text:string) => {
    const lines=text.trim().split('\n').filter(l=>l.trim())
    if(lines.length<2){setErrors(['Το αρχείο δεν έχει δεδομένα.']);return}
    const parsed:Partial<InventoryItem>[]=[]; const errs:string[]=[]
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(',').map(c=>c.replace(/^"|"$/g,'').trim())
      if(!cols[0])continue
      const cat=cols[1]||'Λοιπά'; const cond=cols[6]||'Καλή'
      if(!['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].includes(cat))errs.push(`Γραμμή ${i+1}: Άγνωστη κατηγορία "${cat}"`)
      parsed.push({name:cols[0],category:cat,room:cols[2]||'',brand:cols[3]||'',model:cols[4]||'',serial_number:cols[5]||'',condition:CONDITIONS.includes(cond)?cond:'Καλή',purchase_value:parseFloat(cols[7])||0,purchase_date:cols[8]||'',warranty_expiry:cols[9]||'',energy_class:cols[10]||'',power_watts:parseFloat(cols[11])||0,daily_hours_use:parseFloat(cols[12])||0,provenance:cols[13]||'new',store_vendor:cols[14]||''})
    }
    setRows(parsed);setErrors(errs);if(parsed.length>0)setStep('preview')
  }
  const handleFile=(file:File)=>{const r=new FileReader();r.onload=e=>parseCSV(e.target?.result as string);r.readAsText(file,'UTF-8')}
  const handleImport=async()=>{
    setImporting(true)
    const {error}=await supabase.from('inventory_items').insert(rows.map(r=>({...r,property_id:propertyId,user_id:userId,photos:[],tags:[]})))
    if(error){alert('Σφάλμα: '+error.message);setImporting(false);return}
    onImported();onClose()
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:28,width:'100%',maxWidth:600,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Μαζική Εισαγωγή <span title="CSV — αρχείο τιμών χωρισμένων με κόμμα· ανοίγει σε Excel/λογιστικά φύλλα">CSV</span></p>
          <button onClick={onClose} style={{width:36,height:36,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        {step==='upload'&&(
          <>
            <button onClick={downloadTemplate} style={{padding:'10px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>Κατέβασμα προτύπου</button>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}} style={{border:'2px dashed var(--border-accent)',borderRadius:T.radius.card,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:'var(--accent-dim)'}}>
              <p style={{fontSize:14,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:8}}>Σύρτε ή κλικ για ανέβασμα CSV</p>
              <p title="UTF-8 — κωδικοποίηση κειμένου που υποστηρίζει ελληνικούς χαρακτήρες" style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Μορφή: UTF-8 CSV</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
            {errors.length>0&&<div style={{padding:'10px 14px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>{errors.map((e,i)=><p key={i} style={{fontSize:11,color:'var(--negative)',fontFamily:T.font.sans}}>{e}</p>)}</div>}
          </>
        )}
        {step==='preview'&&(
          <>
            <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Βρέθηκαν <strong style={{color:'var(--text-primary)'}}>{rows.length} αντικείμενα</strong></p>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'var(--bg-elevated)'}}>{['Ονομασία','Κατηγορία','Κατάσταση','Αξία'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--text-secondary)',fontWeight:500,fontSize:10,fontFamily:T.font.sans,textTransform:'uppercase',letterSpacing:'0.5px'}}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0,15).map((r,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-subtle)'}}><td style={{padding:'7px 10px',color:'var(--text-primary)',fontWeight:500,fontFamily:T.font.sans}}>{r.name}</td><td style={{padding:'7px 10px',color:'var(--text-secondary)',fontFamily:T.font.sans}}>{r.category}</td><td style={{padding:'7px 10px'}}><Badge label={r.condition||'—'} color={CONDITION_COLOR[r.condition||'']||'var(--text-tertiary)'}/></td><td style={{padding:'7px 10px',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{r.purchase_value?fmtEur(r.purchase_value):'—'}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setStep('upload')} style={{padding:'9px 18px',borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
              <button onClick={handleImport} disabled={importing} style={{padding:'9px 22px',borderRadius:T.radius.pill,background:importing?'var(--bg-elevated)':'var(--accent)',border:'none',color:importing?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:importing?'wait':'pointer'}}>{importing?'Εισαγωγή...':`Εισαγωγή ${rows.length} αντικειμένων`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const EMPTY_ITEM: Partial<InventoryItem> = {
  name:'',category:'Ηλεκτρικές Συσκευές',room:'',brand:'',model:'',serial_number:'',
  purchase_value:0,purchase_date:'',warranty_expiry:'',condition:'Καλή',notes:'',
  photo_url:'',photos:[],tags:[],energy_class:'',power_watts:0,daily_hours_use:0,
  standby_watts:0,replacement_cost:0,smart_device:false,smart_notes:'',
  provenance:'new',original_price:0,discount_pct:0,store_vendor:'',receipt_number:'',
}

// Σύστημα αναγνώρισης εξοπλισμού από φωτογραφία (συσκευασία/ετικέτα/booklet/απόδειξη).
const ITEM_SCAN_SYSTEM = `Είσαι σύστημα αναγνώρισης οικιακού εξοπλισμού από φωτογραφία (συσκευασία, ετικέτα ενέργειας, booklet ή απόδειξη αγοράς). Επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON, χωρίς άλλο κείμενο:
{"name":"","brand":"","model":"","serial_number":"","category":"<μία από: Έπιπλα, Ηλεκτρικές Συσκευές, Ηλεκτρονικά, Υδραυλικά, Θέρμανση & Ψύξη, Φωτιστικά, Διακόσμηση, Λοιπά>","price":"αριθμός € ή κενό","warranty_expiry":"YYYY-MM-DD ή κενό","energy_class":"π.χ. A+++ ή κενό","power_watts":"αριθμός W ή κενό","store":"","purchase_date":"YYYY-MM-DD ή κενό"}
Διάβασε ό,τι φαίνεται με ακρίβεια· άφησε κενά όσα δεν διακρίνονται. Το name να είναι περιγραφικό (π.χ. «Πλυντήριο Bosch WAU28»). Χωρίς κείμενο εκτός του JSON.`

function ItemFormModal({item,onSave,onClose}:{item?:InventoryItem|null;onSave:(d:Partial<InventoryItem>)=>void;onClose:()=>void}) {
  const [form,setForm] = useState<Partial<InventoryItem>>(item?{...item,photos:item.photos||[],tags:item.tags||[]}:{...EMPTY_ITEM})
  const [saving,setSaving] = useState(false)
  const [scanning,setScanning] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const set = (k:keyof InventoryItem,v:any) => setForm(f=>({...f,[k]:v}))
  const isElectric = ['Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Θέρμανση & Ψύξη','Φωτιστικά'].includes(form.category||'')
  // «Περισσότερα»: ανοιχτό εξ αρχής όταν επεξεργαζόμαστε αντικείμενο με προχωρημένα στοιχεία.
  const [showMore,setShowMore] = useState<boolean>(!!(item&&(item.provenance&&item.provenance!=='new'||item.original_price||item.replacement_cost||item.energy_class||item.power_watts||item.smart_device||item.receipt_number)))
  const liveKwh = (form.power_watts||0)>0&&(form.daily_hours_use||0)>0
    ? (((form.power_watts||0)/1000)*(form.daily_hours_use||0)*30+(((form.standby_watts||0)/1000)*(24-(form.daily_hours_use||0))*30)) : 0
  const replRange = REPLACEMENT_RANGES[form.category||'']
  const discountedPrice = form.original_price && form.discount_pct
    ? Math.round(form.original_price*(1-form.discount_pct/100)) : 0
  const handleSave = async() => {
    if(!form.name?.trim()){alert('Το όνομα είναι υποχρεωτικό.');return}
    const primaryUrl = form.photo_url||(form.photos&&form.photos.length>0?form.photos[0]:'')
    setSaving(true)
    await onSave({...form,photo_url:primaryUrl})
    setSaving(false)
  }
  const toggleTag = (tag:string) => {
    const tags=form.tags||[]
    set('tags',tags.includes(tag)?tags.filter(t=>t!==tag):[...tags,tag])
  }
  // AI σάρωση φωτογραφίας (συσκευασία/ετικέτα/booklet/απόδειξη) → προσυμπλήρωση πεδίων.
  const runScan = async(file:File) => {
    if(!file.type.startsWith('image/')||file.size>10*1024*1024) return
    setScanning(true)
    try {
      const b64:string|null = await new Promise(res=>{const r=new FileReader();r.onload=()=>res((r.result as string).split(',')[1]||null);r.onerror=()=>res(null);r.readAsDataURL(file)})
      if(!b64){setScanning(false);return}
      const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000)
      const res=await fetch('/api/anthropic',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({
        model:'claude-sonnet-5',max_tokens:600,system:ITEM_SCAN_SYSTEM,
        messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:file.type||'image/jpeg',data:b64}},{type:'text',text:'Διάβασε τα στοιχεία του αντικειμένου/συσκευής από τη φωτογραφία.'}]}],
      })})
      clearTimeout(timer)
      const data=await res.json()
      if(res.ok&&!data?.error){
        const txt=(data.content||[]).find((c:{type:string})=>c.type==='text')?.text||'{}'
        const d=JSON.parse(txt.replace(/```json?|```/g,'').trim()) as Record<string,string>
        const num=(v:string)=>{const n=parseFloat(String(v||'').replace(/[^\d.]/g,''));return isNaN(n)?0:n}
        setForm(f=>({...f,
          name:f.name||d.name||[d.brand,d.model].filter(Boolean).join(' ')||'',
          brand:f.brand||d.brand||'',
          model:f.model||d.model||'',
          serial_number:f.serial_number||d.serial_number||'',
          category:d.category&&['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].includes(d.category)?d.category:f.category,
          purchase_value:f.purchase_value||Math.round(num(d.price)),
          warranty_expiry:f.warranty_expiry||d.warranty_expiry||'',
          energy_class:f.energy_class||(ENERGY_CLASSES.includes(d.energy_class)?d.energy_class:''),
          power_watts:f.power_watts||num(d.power_watts),
          store_vendor:f.store_vendor||d.store||'',
          purchase_date:f.purchase_date||d.purchase_date||'',
        }))
        if(d.energy_class||d.power_watts||d.price) setShowMore(true)
      }
    } catch { /* σιωπηλή αποτυχία — μη μπλοκάρει τη ροή */ }
    setScanning(false)
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:'8px 16px'}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,width:'100%',maxWidth:680,height:'calc(100vh - 32px)',maxHeight:820,overflow:'hidden',padding:0,display:'flex',flexDirection:'column',boxShadow:'var(--shadow-xl)'}}>
        <div style={{padding:'22px 28px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <p style={{fontSize:22,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{item?'Επεξεργασία Αντικειμένου':'Νέο Αντικείμενο'}</p>
              {item&&<p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2,fontFamily:T.font.sans}}>{item.name}</p>}
            </div>
            <button onClick={onClose} style={{width:40,height:40,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='none'}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
        </div>
        <div style={{padding:'20px 28px',display:'flex',flexDirection:'column',gap:18,flex:1,overflowY:'auto'}}>
          {/* Σάρωση με AI — φωτο συσκευασίας/ετικέτας/booklet/απόδειξης → προσυμπλήρωση */}
          <input ref={scanRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)runScan(f);e.currentTarget.value=''}}/>
          <button onClick={()=>{if(!scanning)scanRef.current?.click()}} disabled={scanning}
            style={{display:'flex',alignItems:'center',gap:13,width:'100%',textAlign:'left',padding:'12px 16px',borderRadius:T.radius.card,border:'1px solid var(--accent-border)',background:'var(--accent-soft)',cursor:scanning?'wait':'pointer',fontFamily:T.font.sans}}>
            <div style={{width:38,height:38,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--accent)'}}>
              {scanning?<div style={{width:16,height:16,border:'2px solid var(--accent-border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>
                :<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.2"/></svg>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--accent)'}}>{scanning?'Ανάγνωση φωτογραφίας…':'Σάρωση με AI'}</div>
              <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.4}}>Φωτογραφία συσκευασίας, ετικέτας, booklet ή απόδειξης — συμπληρώνει μόνο του μάρκα, μοντέλο, αξία, εγγύηση, ενέργεια…</div>
            </div>
          </button>
          <style>{`@keyframes invSpin{to{transform:rotate(360deg)}}`}</style>

          <MultiPhotoUpload photos={form.photos||[]} primary={form.photo_url||''} onAdd={u=>set('photos',[...(form.photos||[]),u])} onRemove={u=>{const p=(form.photos||[]).filter(x=>x!==u);set('photos',p);if(form.photo_url===u)set('photo_url',p[0]||'')}} onSetPrimary={u=>set('photo_url',u)}/>

          {/* Ταυτότητα αντικειμένου */}
          <div>
            <label style={labelStyle}>Ονομασία *</label>
            <TextInput value={form.name||''} onChange={v=>set('name',v)} placeholder="Παράδειγμα: Πλυντήριο Ρούχων Bosch WAU28"/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
            <div><label style={labelStyle}>Κατηγορία</label><CustomSelect value={form.category||'Λοιπά'} onChange={v=>set('category',v)} options={['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].map(c=>({value:c,label:c}))}/></div>
            <div><label style={labelStyle}>Κατάσταση</label><CustomSelect value={form.condition||'Καλή'} onChange={v=>set('condition',v)} options={CONDITIONS.map(c=>({value:c,label:c}))}/></div>
            <div><label style={labelStyle}>Μάρκα</label><TextInput value={form.brand||''} onChange={v=>set('brand',v)} placeholder="Παράδειγμα: Bosch"/></div>
            <div><label style={labelStyle}>Μοντέλο</label><TextInput value={form.model||''} onChange={v=>set('model',v)} placeholder="Παράδειγμα: WAU28PI0GR"/></div>
            <div><label style={labelStyle}>Σειριακός Αριθμός</label><TextInput value={form.serial_number||''} onChange={v=>set('serial_number',v)} placeholder="SN / IMEI"/></div>
            <div><label style={labelStyle}>Χώρος Τοποθέτησης</label><RoomInput value={form.room||''} onChange={v=>set('room',v)}/></div>
          </div>

          {/* Αγορά & Εγγύηση */}
          <SectionLabel label="Αγορά & Εγγύηση"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
            <div><label style={labelStyle}>Ημερομηνία Αγοράς</label><DatePicker value={form.purchase_date||''} onChange={v=>set('purchase_date',v)}/></div>
            <div><label style={labelStyle}>Αξία (€)</label><NumberInput value={String(form.purchase_value||0)} onChange={v=>set('purchase_value',parseFloat(v)||0)} suffix="€" min={0}/></div>
            <div><label style={labelStyle}>Λήξη Εγγύησης</label><DatePicker value={form.warranty_expiry||''} onChange={v=>set('warranty_expiry',v)}/></div>
            <div><label style={labelStyle}>Κατάστημα / Πηγή</label><TextInput value={form.store_vendor||''} onChange={v=>set('store_vendor',v)} placeholder="Παράδειγμα: Κωτσόβολος"/></div>
          </div>
          {form.purchase_date&&(form.purchase_value||0)>0&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',gap:8,padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
              {[
                {label:'Τρέχουσα Αξία',value:fmtEur(calcCurrentValue({...form,id:'',user_id:''} as InventoryItem))},
                {label:'Απόσβεση',value:`${calcDepreciationPct({...form,id:'',user_id:''} as InventoryItem)}%`},
                {label:'Υπολ. Ζωή',value:`~${calcYearsLeft({...form,id:'',user_id:''} as InventoryItem)} χρ.`},
              ].map((k,i)=>(
                <div key={i} style={{textAlign:'center'}}>
                  <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{k.value}</p>
                  <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Περισσότερα — προέλευση, κόστος αντικατάστασης, ενέργεια, έξυπνη */}
          <button onClick={()=>setShowMore(m=>!m)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',textAlign:'left',padding:'11px 14px',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',cursor:'pointer',fontFamily:T.font.sans}}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--text-tertiary)',transform:showMore?'rotate(90deg)':'none',transition:'transform 0.15s'}}><path d="m9 18 6-6-6-6"/></svg>
            <span style={{flex:1,fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>Περισσότερα{isElectric?' — προέλευση, ενέργεια & έξυπνη':' — προέλευση & κόστος'}</span>
          </button>
          {showMore&&(<>
            <div>
              <label style={labelStyle}>Προέλευση</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:6}}>
                {PROVENANCE_OPTIONS.map(opt=>{
                  const active=form.provenance===opt.value
                  return (
                    <div key={opt.value} onClick={()=>set('provenance',opt.value)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:T.radius.inner,border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`,background:active?'var(--accent-dim)':'var(--bg-elevated)',cursor:'pointer',transition:'all 0.15s'}}>
                      <div style={{width:15,height:15,borderRadius:'50%',border:`2px solid ${active?'var(--accent)':'var(--border-default)'}`,background:active?'var(--accent)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{active&&<div style={{width:5,height:5,borderRadius:'50%',background:'var(--accent-text)'}}/>}</div>
                      <span style={{fontSize:12.5,fontFamily:T.font.sans,color:active?'var(--accent)':'var(--text-primary)',fontWeight:active?500:400}}>{opt.label.split('—')[0].trim()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {(form.provenance==='new'||form.provenance==='discount')&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',gap:10}}>
                <div><label style={labelStyle}>Αρχική Τιμή (€)</label><NumberInput value={String(form.original_price||0)} onChange={v=>{const orig=parseFloat(v)||0;const disc=form.discount_pct||0;setForm(f=>({...f,original_price:orig,purchase_value:disc>0?Math.round(orig*(1-disc/100)):orig}))}} suffix="€" min={0}/></div>
                <div><label style={labelStyle}>Έκπτωση (%)</label><NumberInput value={String(form.discount_pct||0)} onChange={v=>{const disc=parseFloat(v)||0;const orig=form.original_price||0;setForm(f=>({...f,discount_pct:disc,purchase_value:orig>0?Math.round(orig*(1-disc/100)):f.purchase_value}))}} suffix="%" min={0} max={100}/></div>
                {discountedPrice>0&&(form.original_price||0)>0&&(
                  <div style={{gridColumn:'1/-1',padding:'8px 12px',background:'var(--positive-dim)',borderRadius:8,border:'1px solid var(--positive-border)'}}>
                    <span style={{fontSize:12,color:'var(--positive)',fontFamily:T.font.sans}}>Εξοικονόμηση: <strong style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtEur((form.original_price||0)-discountedPrice)}</strong> ({form.discount_pct}%)</span>
                  </div>
                )}
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
              <div>
                <label style={labelStyle}>Κόστος Αντικατάστασης (€)</label>
                <NumberInput value={String(form.replacement_cost||0)} onChange={v=>set('replacement_cost',parseFloat(v)||0)} suffix="€" min={0}/>
                {replRange&&!form.replacement_cost&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:4,fontFamily:T.font.sans}}>Εκτίμηση: {fmtEur(replRange.min)}–{fmtEur(replRange.max)}</p>}
              </div>
              <div><label style={labelStyle}>Αριθμός Απόδειξης / Τιμολόγιο</label><TextInput value={form.receipt_number||''} onChange={v=>set('receipt_number',v)} placeholder="Παράδειγμα: ΑΠΥ-2024-001"/></div>
            </div>
            {isElectric&&(<>
              <SectionLabel label="Ενέργεια"/>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
                <div><label style={labelStyle}>Ενεργειακή Κλάση</label><CustomSelect value={form.energy_class||''} onChange={v=>set('energy_class',v)} options={[{value:'',label:'— Δεν γνωρίζω'},...ENERGY_CLASSES.map(c=>({value:c,label:c}))]}/></div>
                <div><label style={labelStyle} title="W = Watt — μονάδα ισχύος/κατανάλωσης ρεύματος">Ισχύς Λειτουργίας (W)</label><NumberInput value={String(form.power_watts||0)} onChange={v=>set('power_watts',parseFloat(v)||0)} suffix="W" min={0}/></div>
                <div><label style={labelStyle}>Ώρες Χρήσης / Ημέρα</label><NumberInput value={String(form.daily_hours_use||0)} onChange={v=>set('daily_hours_use',parseFloat(v)||0)} suffix="ώρ/ημ" min={0} max={24}/></div>
                <div><label style={labelStyle}>Κατανάλωση Αναμονής (W)</label><NumberInput value={String(form.standby_watts||0)} onChange={v=>set('standby_watts',parseFloat(v)||0)} suffix="W" min={0}/></div>
              </div>
              {liveKwh>0&&(
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',gap:8,padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
                  {[{label:'kWh/μήνα',value:`${liveKwh.toFixed(1)}`},{label:'kWh/έτος',value:`${(liveKwh*12).toFixed(0)}`},{label:'Κόστος/μήνα',value:fmtEurC(liveKwh*0.22)},{label:'Κόστος/έτος',value:fmtEurC(liveKwh*0.22*12)}].map((k,i)=>(
                    <div key={i} style={{textAlign:'center'}}>
                      <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{k.value}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
                <div>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Έξυπνη Συσκευή</p>
                  <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2,fontFamily:T.font.sans}}>Συνδέεται με εφαρμογή, έξυπνη πρίζα ή αυτοματισμό</p>
                </div>
                <Toggle on={form.smart_device||false} onChange={(v:boolean)=>set('smart_device',v)}/>
              </div>
              {form.smart_device&&(
                <div><label style={labelStyle}>App / Σύστημα Ελέγχου</label><TextInput value={form.smart_notes||''} onChange={v=>set('smart_notes',v)} placeholder="Παράδειγμα: Shelly 1PM + Home Assistant"/></div>
              )}
            </>)}
          </>)}

          {/* Ετικέτες & σημειώσεις */}
          <div>
            <label style={labelStyle}>Ετικέτες</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {AVAILABLE_TAGS.map(tag=>{
                const active=(form.tags||[]).includes(tag)
                return <button key={tag} onClick={()=>toggleTag(tag)} style={{padding:'4px 12px',borderRadius:T.radius.pill,fontSize:12,cursor:'pointer',fontFamily:T.font.sans,fontWeight:active?500:400,border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`,background:active?'var(--accent-dim)':'none',color:active?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>{tag}</button>
              })}
            </div>
          </div>
          <Textarea label="Σημειώσεις" value={form.notes||''} onChange={v=>set('notes',v)} placeholder="Παρατηρήσεις, ιστορικό, χαρακτηριστικά..." rows={2}/>
        </div>
        <div style={{padding:'16px 28px 24px',borderTop:'1px solid var(--border-subtle)',display:'flex',gap:10,justifyContent:'flex-end',flexShrink:0,background:'var(--bg-surface)'}}>
          <button onClick={onClose} style={{padding:'0 20px',height:40,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
          <button onClick={handleSave} disabled={saving} style={{padding:'0 24px',height:40,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer',minWidth:120}}>
            {saving?'Αποθήκευση...':'Αποθήκευση'}
          </button>
        </div>
      </div>
    </div>
  )
}
function RepairModal({item,repairs,onAdd,onClose,propertyId,userId}:{item:InventoryItem;repairs:InventoryRepair[];onAdd:(r:Partial<InventoryRepair>)=>void;onClose:()=>void;propertyId:string;userId:string}) {
  const [form,setForm] = useState({repair_date:'',cost:0,technician:'',description:''})
  const [pushExpenses,setPushExpenses] = useState(true)
  const [saving,setSaving] = useState(false)
  const [contacts,setContacts] = useState<{id:string;full_name:string}[]>([])
  const [showContactPicker,setShowContactPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{supabase.from('contacts').select('id,full_name').eq('property_id',propertyId).then(({data})=>setContacts(data||[]))},[propertyId])
  useEffect(()=>{const h=(e:MouseEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(e.target as Node))setShowContactPicker(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])
  const itemRepairs = repairs.filter(r=>r.item_id===item.id)
  const totalCost = itemRepairs.reduce((s,r)=>s+(r.cost||0),0)
  const curVal = calcCurrentValue(item)
  const handleAdd = async() => {
    if(!form.description.trim()){alert('Η περιγραφή είναι υποχρεωτική.');return}
    setSaving(true)
    await onAdd(form)
    if(pushExpenses&&form.cost>0){
      await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Επισκευή: ${item.name}${form.technician?` (${form.technician})`:''}${form.description?`, ${form.description}`:''}`,amount:form.cost,category:'Συντήρηση & Επισκευές',expense_group:'maintenance',date:form.repair_date||new Date().toISOString().split('T')[0],paid_by:'owner',paid:true,notes:`Αυτόματη εισαγωγή από Απογραφή, ${item.name}`})
    }
    setForm({repair_date:'',cost:0,technician:'',description:''})
    setSaving(false)
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',padding:28,display:'flex',flexDirection:'column',gap:16,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Επισκευές</p>
            <p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2,fontFamily:T.font.sans}}>{item.name}</p>
          </div>
          <button onClick={onClose} style={{width:40,height:40,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        {totalCost>0&&curVal>0&&(
          <div style={{padding:'10px 14px',background:totalCost>curVal*0.5?'var(--negative-dim)':'var(--positive-dim)',borderRadius:T.radius.inner,border:`1px solid ${totalCost>curVal*0.5?'var(--negative-border)':'var(--positive-border)'}`}}>
            <p style={{fontSize:12,color:totalCost>curVal*0.5?'var(--negative)':'var(--positive)',fontWeight:500,fontFamily:T.font.sans}}>{totalCost>curVal*0.5?`Κόστος επισκευών ${fmtEur(totalCost)} > 50% τρέχουσας αξίας ${fmtEur(curVal)}`:`Επισκευές ${fmtEur(totalCost)} εντός ορίων vs αξία ${fmtEur(curVal)}`}</p>
          </div>
        )}
        <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
        {itemRepairs.length>0&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <SectionLabel label="Ιστορικό" right={<span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{fmtEur(totalCost)}</span>}/>
            {itemRepairs.map(r=>(
              <div key={r.id} style={{background:'var(--bg-elevated)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--border-subtle)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{r.description}</p>
                  <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fmtEur(r.cost)}</p>
                </div>
                <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(r.repair_date)}{r.technician?` · ${r.technician}`:''}</p>
              </div>
            ))}
          </div>
        )}
        <SectionLabel label="Νέα Επισκευή"/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
          <div><label style={labelStyle}>Ημερομηνία</label><DatePicker value={form.repair_date} onChange={v=>setForm(f=>({...f,repair_date:v}))}/></div>
          <div><label style={labelStyle}>Κόστος (€)</label><NumberInput value={String(form.cost)} onChange={v=>setForm(f=>({...f,cost:parseFloat(v)||0}))} suffix="€" min={0}/></div>
          <div style={{gridColumn:'1/-1'}}>
            <label style={labelStyle}>Τεχνικός / Συνεργείο</label>
            <div style={{display:'flex',gap:8}}>
              <div style={{flex:1}}><TextInput value={form.technician} onChange={v=>setForm(f=>({...f,technician:v}))} placeholder="Παράδειγμα: Ηλεκτρολόγος Γεωργίου"/></div>
              {contacts.length>0&&(
                <div ref={pickerRef} style={{position:'relative',flexShrink:0}}>
                  <button type="button" onClick={()=>setShowContactPicker(s=>!s)} style={{padding:'0 12px',height:40,borderRadius:8,border:'1px solid var(--border-subtle)',background:showContactPicker?'var(--accent-dim)':'var(--bg-elevated)',color:showContactPicker?'var(--accent)':'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer'}}>Επαφές</button>
                  {showContactPicker&&(
                    <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:T.radius.card,padding:8,zIndex:700,minWidth:200,maxHeight:200,overflowY:'auto',boxShadow:'var(--shadow-lg)'}}>
                      <div style={{fontSize:10,color:'var(--text-secondary)',padding:'4px 8px 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans,borderBottom:'1px solid var(--border-subtle)',marginBottom:4}}>Επιλογή Επαφής</div>
                      {contacts.map(c=>(
                        <div key={c.id} onClick={()=>{setForm(f=>({...f,technician:c.full_name}));setShowContactPicker(false)}} style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:13,fontFamily:T.font.sans,color:'var(--text-primary)'}} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-elevated)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>{c.full_name}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Περιγραφή *</label><Textarea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="Τι επισκευάστηκε..." rows={2}/></div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
          <div>
            <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Καταχώρηση στις Δαπάνες</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Αυτόματη εισαγωγή στο tab "Δαπάνες"</p>
          </div>
          <Toggle on={pushExpenses} onChange={setPushExpenses}/>
        </div>
        <button onClick={handleAdd} disabled={saving} style={{padding:'0 20px',height:40,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer',alignSelf:'flex-end'}}>
          {saving?'Αποθήκευση...':'Καταχώρηση Επισκευής'}
        </button>
      </div>
    </div>
  )
}

function OverviewTab({items,repairs,kwhPrice,profileType='individual'}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number;profileType?:'individual'|'professional'}) {
  const summary = portfolioSummary(items)
  const needReplacement = items.filter(i=>replacementSuggestion(i).suggested)
  const totalPurchase = items.reduce((s,i)=>s+(i.purchase_value||0),0)
  const totalCurrent = items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairs = repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems = items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyCost = electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  const byCategory = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
  const maxVal = Math.max(...byCategory.map(x=>x.val),1)
  const topEnergy = [...electricItems].sort((a,b)=>calcMonthlyCost(b,kwhPrice)-calcMonthlyCost(a,kwhPrice)).slice(0,5)
  const warrantySoon = items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90})
  const badCondition = items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας')
  const badEnergy = electricItems.filter(i=>!['A+++','A++','A+'].includes(i.energy_class||''))
  const potSavings = badEnergy.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice)*12*0.5,0)
  const totalDiscount = items.reduce((s,i)=>s+((i.original_price||0)-(i.purchase_value||0)),0)

  if(items.length===0) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',gap:20,textAlign:'center'}}>
      <div style={{width:72,height:72,borderRadius:T.radius.card,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
      </div>
      <div>
        <p style={{fontSize:20,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:8}}>Ξεκινήστε την Απογραφή</p>
        <p style={{fontSize:14,color:'var(--text-secondary)',maxWidth:360,lineHeight:1.7,margin:'0 auto',fontFamily:T.font.sans}}>Καταγράψτε τον εξοπλισμό για παρακολούθηση αξίας, ρεύματος και εγγυήσεων.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12,maxWidth:480,width:'100%'}}>
        {[{t:'Πρόσθεσε Αντικείμενο',d:'Έπιπλα, συσκευές, ηλεκτρονικά'},{t:'Βάλε Κατανάλωση',d:'Υπολογισμός κόστους ρεύματος'},{t:'Ορίστε Εγγύηση',d:'Υπενθύμιση πριν λήξει'}].map((s,i)=>(
          <div key={i} style={{padding:'20px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.card,border:'1px solid var(--border-subtle)'}}>
            <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:4}}>{s.t}</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5,fontFamily:T.font.sans}}>{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <KPIGrid items={[
        {label:'Αντικείμενα',value:String(items.length),sub:`${byCategory.length} κατηγορίες`},
        {label:'Τρέχουσα Αξία',value:fmtEur(totalCurrent),sub:'Μετά απόσβεση'},
        {label:'Ασφαλιστέα Αξία',value:fmtEur(Math.round(totalCurrent*1.1)),sub:'+10% περιθώριο'},
        {label:'Επισκευές',value:fmtEur(totalRepairs)},
        electricItems.length>0
          ?{label:'Ρεύμα/Μήνα',value:fmtEurC(totalMonthlyCost),sub:`${Math.round(electricItems.reduce((s,i)=>s+calcMonthlyKwh(i),0))} kWh/μήνα`,tone:'accent' as const}
          :{label:'Ρεύμα',value:'—',sub:'Πρόσθεσε Watt'},
      ]}/>
      {summary.totalOriginal>0&&(
        <div style={cardStyle}>
          <SectionLabel label={profileType==='professional'?'Απόσβεση & Αξία Χαρτοφυλακίου':'Αξία & Απόσβεση'} right={<span style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>εκτιμήσεις</span>}/>
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6,gap:8}}>
              <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Διατηρούμενη αξία</span>
              <span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(summary.totalBookValue)} <span style={{color:'var(--text-tertiary)',fontWeight:400}}>/ {fmtEur(summary.totalOriginal)}</span></span>
            </div>
            <div style={{height:6,background:'var(--border-subtle)',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${summary.totalOriginal>0?Math.round((summary.totalBookValue/summary.totalOriginal)*100):0}%`,background:'var(--accent)',borderRadius:3,transition:'width 0.5s'}}/>
            </div>
            <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:5,fontFamily:T.font.sans}}>Μέση απόσβεση {summary.avgDepreciatedPct}% · εκτιμ. απομείωση −{fmtEur(summary.totalDepreciation)}</p>
          </div>
          {profileType==='professional'&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',gap:8}}>
                {[
                  {label:'Αξία Αγοράς',value:fmtEur(summary.totalOriginal),color:'var(--text-primary)'},
                  {label:'Τρέχουσα Αξία',value:fmtEur(summary.totalBookValue),color:'var(--text-primary)'},
                  {label:'Προς Αντικατάσταση',value:String(summary.needAttentionCount),color:summary.needAttentionCount>0?'var(--warning)':'var(--text-primary)'},
                  {label:'Προϋπ. Αντικατάστασης',value:fmtEur(summary.replacementBudget),color:'var(--text-primary)'},
                ].map((k,i)=>(
                  <div key={i} style={{textAlign:'center',padding:'10px 6px',background:'var(--bg-elevated)',borderRadius:8}}>
                    <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:k.color,marginBottom:3}}>{k.value}</p>
                    <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
                  </div>
                ))}
              </div>
              {summary.replacementBudget>0&&(
                <div style={{marginTop:12,padding:'10px 14px',background:'var(--warning-soft)',borderRadius:T.radius.inner,border:'1px solid var(--warning-border)'}}>
                  <p style={{fontSize:12,color:'var(--warning)',fontFamily:T.font.sans}}>Εκτιμώμενος προϋπολογισμός αντικατάστασης για {summary.needAttentionCount} {summary.needAttentionCount===1?'αντικείμενο':'αντικείμενα'}: <strong style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtEur(summary.replacementBudget)}</strong></p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2,fontFamily:T.font.sans}}>Βάσει δηλωμένου κόστους αντικατάστασης ή αξίας αγοράς. Προτείνεται πρόβλεψη στον ετήσιο προϋπολογισμό.</p>
                </div>
              )}
            </>
          )}
          {profileType!=='professional'&&summary.needAttentionCount>0&&(
            <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>{summary.needAttentionCount} {summary.needAttentionCount===1?'αντικείμενο προτείνεται':'αντικείμενα προτείνονται'} για αντικατάσταση.</p>
          )}
        </div>
      )}
      {totalDiscount>0&&(
        <div style={{padding:'12px 16px',background:'var(--positive-dim)',borderRadius:T.radius.card,border:'1px solid var(--positive-border)',display:'flex',alignItems:'center',gap:12}}>
          <div>
            <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--positive)'}}>Εξοικονόμηση από εκπτώσεις & μεταχειρισμένα: <span style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtEur(totalDiscount)}</span></p>
            <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Βάσει αρχικών τιμών vs τιμών αγοράς</p>
          </div>
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:16}}>
        <div style={cardStyle}>
          <SectionLabel label="Κατανομή Αξίας ανά Κατηγορία"/>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {byCategory.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>(
              <div key={cat}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>{cat} <span style={{color:'var(--text-tertiary)',fontSize:10}}>({count})</span></span>
                  <span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(val)}</span>
                </div>
                <div style={{height:4,background:'var(--border-subtle)',borderRadius:2}}><div style={{height:4,borderRadius:2,background:'var(--accent)',width:`${(val/maxVal)*100}%`,transition:'width 0.5s'}}/></div>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Αξία Αγοράς (σύνολο)</span>
            <span style={{fontSize:11,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>{fmtEur(totalPurchase)}</span>
          </div>
        </div>
        <div style={cardStyle}>
          <SectionLabel label="Κατανάλωση Ρεύματος"/>
          {electricItems.length===0?(
            <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-tertiary)'}}>
              <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-secondary)',marginBottom:4}}>Δεν υπάρχουν δεδομένα</p>
              <p style={{fontSize:11,fontFamily:T.font.sans}}>Πρόσθεσε Watt στις ηλεκτρικές συσκευές</p>
            </div>
          ):(
            <>
              {topEnergy.map(item=>{
                const mc=calcMonthlyCost(item,kwhPrice); const maxMc=calcMonthlyCost(topEnergy[0],kwhPrice)
                return (
                  <div key={item.id} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4,gap:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                        {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                        <span style={{fontSize:11,color:'var(--text-primary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                      </div>
                      <span style={{fontSize:11,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,flexShrink:0}}>{fmtEurC(mc)}/μήνα</span>
                    </div>
                    <div style={{height:3,background:'var(--border-subtle)',borderRadius:2}}><div style={{height:3,borderRadius:2,background:'var(--accent)',width:`${maxMc>0?(mc/maxMc)*100:0}%`}}/></div>
                  </div>
                )
              })}
              {potSavings>0&&(
                <div style={{marginTop:12,padding:'8px 12px',background:'var(--positive-dim)',borderRadius:8,border:'1px solid var(--positive-border)'}}>
                  <p style={{fontSize:12,color:'var(--positive)',fontFamily:T.font.sans}}>Αναβάθμιση {badEnergy.length} συσκευών → <strong style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtEurC(potSavings)}/χρόνο</strong></p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12}}>
        {[
          {title:'Προτείνεται Αντικατάσταση',color:'var(--warning)',items:needReplacement,render:(item:InventoryItem)=><span style={{fontSize:10,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>{item.replacement_cost?fmtEur(item.replacement_cost):'—'}</span>},
          {title:'Εγγυήσεις ≤90 Μέρες',color:'var(--warning)',items:warrantySoon,render:(item:InventoryItem)=><Badge label={warrantyStatus(item.warranty_expiry).label} color={warrantyStatus(item.warranty_expiry).color}/>},
          {title:'Χρειάζονται Προσοχή',color:'var(--negative)',items:badCondition,render:(item:InventoryItem)=><Badge label={item.condition} color={CONDITION_COLOR[item.condition]}/>},
        ].map(({title,color,items:list,render})=>(
          <div key={title} style={{...cardStyle,border:'1px solid var(--border-subtle)'}}>
            <SectionLabel label={title} right={list.length>0?<Badge label={String(list.length)} color={color}/>:undefined}/>
            {list.length===0?<p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'12px 0',fontFamily:T.font.sans}}>Κανένα</p>
              :<div style={{display:'flex',flexDirection:'column',gap:6}}>
                {list.slice(0,4).map(item=>(
                  <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-elevated)',borderRadius:8}}>
                    <span style={{fontSize:11,color:'var(--text-primary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',marginRight:8}}>{item.name}</span>
                    {render(item)}
                  </div>
                ))}
              </div>
            }
          </div>
        ))}
      </div>
    </div>
  )
}

type SortKey = 'name'|'value'|'energy'|'age'|'depreciation'

function ItemsTab({items,repairs,kwhPrice,onAdd,onEdit,onDelete,onRepair,onQR,onUpdateCondition,onWarrantyReminder}:{
  items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number
  onAdd:()=>void;onEdit:(i:InventoryItem)=>void;onDelete:(id:string)=>void
  onRepair:(i:InventoryItem)=>void;onQR:(i:InventoryItem)=>void
  onUpdateCondition:(id:string,c:string)=>void
  onWarrantyReminder:(i:InventoryItem)=>void
}) {
  const [filterCat,setFilterCat] = useState('Όλες')
  const [filterRoom,setFilterRoom] = useState('Όλα')
  const [filterTag,setFilterTag] = useState('Όλα')
  const [search,setSearch] = useState('')
  const [viewMode,setViewMode] = useState<'grid'|'list'>('grid')
  const [sortKey,setSortKey] = useState<SortKey>('name')
  const [sortDir,setSortDir] = useState<'asc'|'desc'>('asc')
  const [showNeedsAction,setShowNeedsAction] = useState(false)
  const allRooms = [...new Set(items.map(i=>i.room).filter(Boolean))]
  const allTags = [...new Set(items.flatMap(i=>i.tags||[]))]
  const actionCount = items.filter(needsAction).length
  const filtered = items
    .filter(item=>{
      if(showNeedsAction&&!needsAction(item)) return false
      if(filterCat!=='Όλες'&&item.category!==filterCat) return false
      if(filterRoom!=='Όλα'&&item.room!==filterRoom) return false
      if(filterTag!=='Όλα'&&!(item.tags||[]).includes(filterTag)) return false
      if(search&&!item.name.toLowerCase().includes(search.toLowerCase())&&!(item.brand||'').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a,b)=>{
      let va:any=0,vb:any=0
      if(sortKey==='name'){va=a.name;vb=b.name}
      else if(sortKey==='value'){va=calcCurrentValue(a);vb=calcCurrentValue(b)}
      else if(sortKey==='energy'){va=calcMonthlyCost(a,kwhPrice);vb=calcMonthlyCost(b,kwhPrice)}
      else if(sortKey==='age'){va=a.purchase_date?new Date(a.purchase_date).getTime():0;vb=b.purchase_date?new Date(b.purchase_date).getTime():0}
      else if(sortKey==='depreciation'){va=calcDepreciationPct(a);vb=calcDepreciationPct(b)}
      if(typeof va==='string') return sortDir==='asc'?va.localeCompare(vb):vb.localeCompare(va)
      return sortDir==='asc'?va-vb:vb-va
    })
  const itemActions = (item:InventoryItem):OverflowAction[] => [
    {label:'Επεξεργασία',icon:IconEdit,onClick:()=>onEdit(item)},
    {label:'Επισκευές & ιστορικό',icon:IconRepair,onClick:()=>onRepair(item)},
    {label:'Κωδικός QR',icon:IconQR,onClick:()=>onQR(item)},
    ...(item.warranty_expiry?[{label:'Υπενθύμιση εγγύησης',icon:IconCal,onClick:()=>onWarrantyReminder(item)}]:[]),
    {label:'Διαγραφή',icon:IconTrash,danger:true,onClick:()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}},
  ]
  const SORT_LABELS:Record<SortKey,string> = {name:'Όνομα',value:'Αξία',energy:'Ρεύμα/μήνα',age:'Ηλικία',depreciation:'Απόσβεση'}

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:180}}><TextInput value={search} onChange={setSearch} placeholder="Αναζήτηση αντικειμένου, μάρκας..."/></div>
        <div style={{width:150}}><CustomSelect value={filterCat} onChange={setFilterCat} options={['Όλες',...['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].filter(c=>items.some(i=>i.category===c))].map(c=>({value:c,label:c==='Όλες'?'Όλες Κατηγορίες':c}))}/></div>
        {allRooms.length>0&&<div style={{width:140}}><CustomSelect value={filterRoom} onChange={setFilterRoom} options={[{value:'Όλα',label:'Όλα Δωμάτια'},...allRooms.map(r=>({value:r,label:r}))]}/></div>}
        {allTags.length>0&&<div style={{width:130}}><CustomSelect value={filterTag} onChange={setFilterTag} options={[{value:'Όλα',label:'Όλες οι ετικέτες'},...allTags.map(t=>({value:t,label:t}))]}/></div>}
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:150}}><CustomSelect value={sortKey} onChange={v=>setSortKey(v as SortKey)} options={(Object.keys(SORT_LABELS) as SortKey[]).map(k=>({value:k,label:`Ταξ.: ${SORT_LABELS[k]}`}))}/></div>
          <button title={sortDir==='asc'?'Αύξουσα':'Φθίνουσα'} aria-label="Κατεύθυνση ταξινόμησης" onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} style={{width:36,height:36,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',cursor:'pointer',fontFamily:T.font.sans,fontSize:14,flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{sortDir==='asc'?<path d="M12 19V5M5 12l7-7 7 7"/>:<path d="M12 5v14M19 12l-7 7-7-7"/>}</svg></button>
        </div>
        {actionCount>0&&<button onClick={()=>setShowNeedsAction(v=>!v)} title="Προβολή μόνο όσων χρειάζονται προσοχή" style={{padding:'0 12px',height:36,borderRadius:T.radius.pill,fontSize:12,cursor:'pointer',fontFamily:T.font.sans,fontWeight:500,border:`1px solid ${showNeedsAction?'var(--warning-border)':'var(--border-subtle)'}`,background:showNeedsAction?'var(--warning-soft)':'var(--bg-elevated)',color:showNeedsAction?'var(--warning)':'var(--text-secondary)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
          Προσοχή <span style={{background:showNeedsAction?'var(--warning)':'var(--text-tertiary)',color:'#fff',borderRadius:T.radius.inner,padding:'0 6px',fontSize:10,fontWeight:700}}>{actionCount}</span>
        </button>}
        <div style={{display:'flex',border:'1px solid var(--border-subtle)',borderRadius:T.radius.pill,overflow:'hidden',padding:2,background:'var(--bg-elevated)'}}>
          {(['grid','list'] as const).map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{padding:'6px 14px',fontSize:12,fontFamily:T.font.sans,cursor:'pointer',border:'none',borderRadius:T.radius.pill,background:viewMode===m?'var(--accent)':'transparent',color:viewMode===m?'var(--accent-text)':'var(--text-secondary)',fontWeight:viewMode===m?500:400,transition:'all 0.15s'}}>{m==='grid'?'Κάρτες':'Λίστα'}</button>
          ))}
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',borderBottom:'1px solid var(--border-subtle)',paddingBottom:8}}>
        <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{filtered.length} {filtered.length===1?'αντικείμενο':'αντικείμενα'}</span>
      </div>
      {filtered.length===0?(
        <EmptyState
          title={items.length===0?'Δεν έχεις καταχωρίσει αντικείμενα':'Δεν βρέθηκαν αποτελέσματα'}
          hint={items.length===0?'Πρόσθεσε το πρώτο αντικείμενο για να ξεκινήσεις την απογραφή.':'Δοκίμασε διαφορετικά φίλτρα ή αναζήτηση.'}
          action={items.length===0?<Btn variant="primary" onClick={onAdd}>Νέο αντικείμενο</Btn>:undefined}
        />
      ):viewMode==='grid'?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14}}>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item); const left=calcYearsLeft(item)
            const mc=calcMonthlyCost(item,kwhPrice)
            const photos=(item.photos||[]).filter(Boolean); const displayPhoto=item.photo_url||(photos[0]||'')
            const ws=item.warranty_expiry?warrantyStatus(item.warranty_expiry):null
            const repl=replacementSuggestion(item)
            return (
              <div key={item.id} onClick={()=>onEdit(item)} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,overflow:'hidden',display:'flex',flexDirection:'column',transition:'all 0.2s',cursor:'pointer'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='var(--shadow-md)';(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-default)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-subtle)'}}
              >
                <div style={{height:118,background:'var(--bg-elevated)',position:'relative',overflow:'hidden',flexShrink:0}}>
                  {displayPhoto
                    ?<img src={displayPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                    :<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',opacity:0.18}}>
                      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                    </div>
                  }
                  <div style={{position:'absolute',top:8,left:8}} onClick={e=>e.stopPropagation()}>
                    <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                  </div>
                  <div style={{position:'absolute',top:8,right:8}}>
                    <OverflowMenu dark actions={itemActions(item)}/>
                  </div>
                  {(item.energy_class||photos.length>1)&&<div style={{position:'absolute',bottom:8,left:8,display:'flex',gap:4,alignItems:'center'}}>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                    {photos.length>1&&<span style={{padding:'2px 6px',borderRadius:5,background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:9,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>+{photos.length-1}</span>}
                  </div>}
                </div>
                <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                    <div style={{minWidth:0}}>
                      <p style={{fontSize:13.5,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
                      <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category}{item.room?` · ${item.room}`:''}</p>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',lineHeight:1.2}}>{fmtEur(curVal)}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>Τρέχουσα αξία</p>
                    </div>
                  </div>
                  <DepBar pct={depPct} left={left}/>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,minHeight:15}}>
                    <div style={{minWidth:0,overflow:'hidden'}}>
                      {repl.suggested
                        ?<ReplacementHint item={item} compact/>
                        :ws&&<span style={{fontSize:10,color:ws.color,fontFamily:T.font.sans,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Εγγύηση {ws.label}</span>}
                    </div>
                    {mc>0&&<span title="Εκτιμώμενο κόστος ρεύματος/μήνα" style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap',flexShrink:0}}>{fmtEurC(mc)}/μ</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ):(
        <div style={{overflowX:'auto',margin:'0 -4px',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',flexDirection:'column',gap:1,background:'var(--bg-surface)',borderRadius:T.radius.card,border:'1px solid var(--border-subtle)',overflow:'hidden',minWidth:560}}>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) 130px 96px 90px 44px',gap:10,padding:'10px 16px',borderBottom:'2px solid var(--border-subtle)',background:'var(--bg-elevated)'}}>
            {['Αντικείμενο','Κατάσταση','Αξία','Ρεύμα/μήνα',''].map(h=><p key={h} style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans}}>{h}</p>)}
          </div>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const mc=calcMonthlyCost(item,kwhPrice); const age=calcAgeDisplay(item.purchase_date)
            return (
              <div key={item.id} onClick={()=>onEdit(item)} style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) 130px 96px 90px 44px',gap:10,padding:'11px 16px',background:'var(--bg-surface)',borderBottom:'1px solid var(--border-subtle)',alignItems:'center',transition:'background 0.15s',cursor:'pointer'}}
                onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background='var(--bg-elevated)'}
                onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background='var(--bg-surface)'}
              >
                <div style={{minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                  </div>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans,margin:'2px 0 4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category}{item.room?` · ${item.room}`:''}{age?` · ${age}`:''}</p>
                  <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
                  {replacementSuggestion(item).suggested&&<div style={{marginTop:4}}><ReplacementHint item={item} compact/></div>}
                </div>
                <div onClick={e=>e.stopPropagation()}><InlineConditionEdit item={item} onUpdate={onUpdateCondition}/></div>
                <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fmtEur(curVal)}</p>
                <div>{mc>0?<p style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fmtEurC(mc)}</p>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                <div style={{display:'flex',justifyContent:'flex-end'}}><OverflowMenu actions={itemActions(item)}/></div>
              </div>
            )
          })}
        </div>
        </div>
      )}
    </div>
  )
}

function WarrantiesTab({items,userId,propertyId}:{items:InventoryItem[];userId:string;propertyId:string}) {
  const [pushing,setPushing] = useState<string|null>(null)
  const [pushed,setPushed] = useState<Set<string>>(new Set())
  const withW = items.filter(i=>i.warranty_expiry).sort((a,b)=>new Date(a.warranty_expiry).getTime()-new Date(b.warranty_expiry).getTime())
  const expired = withW.filter(i=>daysUntil(i.warranty_expiry)<0)
  const soon = withW.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90})
  const valid = withW.filter(i=>daysUntil(i.warranty_expiry)>90)
  const pushCal = async(item:InventoryItem) => {
    setPushing(item.id)
    const {error}=await supabase.from('calendar_events').insert({property_id:propertyId,user_id:userId,title:`Εγγύηση: ${item.name}`,description:`Λήγει ${fmtDate(item.warranty_expiry)}`,event_date:item.warranty_expiry,category:'maintenance',status:'pending',priority:daysUntil(item.warranty_expiry)<=30?'high':'medium',source:'inventory'})
    setPushing(null)
    if(error){alert('Δεν μπόρεσα να προσθέσω την υπενθύμιση: '+error.message);return}
    setPushed(p=>new Set(p).add(item.id))
  }
  const WSection = ({title,color,list}:{title:string;color:string;list:InventoryItem[]}) => list.length===0?null:(
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,padding:16}}>
      <SectionLabel label={title} right={<Badge label={String(list.length)} color={color}/>}/>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {list.map(item=>{const ws=warrantyStatus(item.warranty_expiry);return(
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:10,alignItems:'center',padding:'10px 12px',background:'var(--bg-surface)',borderRadius:T.radius.inner}}>
            <div>
              <p style={{fontSize:12,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
              <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{item.brand}{item.model?` ${item.model}`:''} · {item.category}</p>
            </div>
            {item.serial_number&&<p title="SN = Σειριακός αριθμός (Serial Number)" style={{fontSize:10,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>SN: {item.serial_number}</p>}
            <Badge label={ws.label} color={ws.color}/>
            {daysUntil(item.warranty_expiry)>=0&&daysUntil(item.warranty_expiry)<=90&&(
              <button onClick={()=>pushCal(item)} disabled={pushing===item.id||pushed.has(item.id)} style={{padding:'5px 10px',borderRadius:T.radius.pill,border:`1px solid ${pushed.has(item.id)?'var(--positive)':'var(--border-subtle)'}`,background:pushed.has(item.id)?'var(--positive-dim)':'none',color:pushed.has(item.id)?'var(--positive)':'var(--text-secondary)',fontSize:11,fontFamily:T.font.sans,cursor:'pointer',whiteSpace:'nowrap'}}>
                {pushing===item.id?'...':pushed.has(item.id)?'Προστέθηκε':'Ημερολόγιο'}
              </button>
            )}
          </div>
        )})}
      </div>
    </div>
  )
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <KPIGrid items={[
        {label:'Ληγμένες',value:String(expired.length),tone:expired.length>0?'negative':'neutral'},
        {label:'Λήγουν ≤90 Μέρες',value:String(soon.length),tone:soon.length>0?'warning':'neutral'},
        {label:'Σε Ισχύ',value:String(valid.length)},
      ]}/>
      {soon.length>0&&<div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Κλικ "Ημερολόγιο" για υπενθύμιση πριν λήξουν.</p></div>}
      <WSection title="Λήγουν Σύντομα (≤90 Μέρες)" color="var(--warning)" list={soon}/>
      <WSection title="Ληγμένες" color="var(--negative)" list={expired}/>
      <WSection title="Σε Ισχύ" color="var(--positive)" list={valid}/>
      {withW.length===0&&<div style={{textAlign:'center',padding:'60px 0'}}><p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Δεν έχεις καταχωρίσει ημερομηνίες εγγύησης</p></div>}
    </div>
  )
}

function HandoverTab({items,handovers,propertyId,userId,onSaved}:{items:InventoryItem[];handovers:InventoryHandover[];propertyId:string;userId:string;onSaved:()=>void}) {
  const [mode,setMode] = useState<'list'|'new'|'compare'>('list')
  const [type,setType] = useState<'check_in'|'check_out'>('check_in')
  const [tenantName,setTenantName] = useState(''); const [tenantPhone,setTenantPhone] = useState('')
  const [handoverDate,setHandoverDate] = useState(''); const [notes,setNotes] = useState('')
  const [itemConds,setItemConds] = useState<Record<string,{condition:string;notes:string}>>({})
  const [saving,setSaving] = useState(false)
  const [cmpA,setCmpA] = useState(''); const [cmpB,setCmpB] = useState('')
  useEffect(()=>{
    if(mode==='new'){const init:Record<string,{condition:string;notes:string}>={};items.forEach(i=>{init[i.id]={condition:i.condition,notes:''}});setItemConds(init)}
  },[mode,items])
  const handleSave = async() => {
    if(!tenantName.trim()){alert('Το ονοματεπώνυμο είναι υποχρεωτικό.');return}
    setSaving(true)
    const snap = items.map(i=>({item_id:i.id,name:i.name,category:i.category,condition_at_handover:itemConds[i.id]?.condition||i.condition,condition_notes:itemConds[i.id]?.notes||'',photo_url:i.photo_url||''}))
    const {error} = await supabase.from('inventory_handovers').insert({property_id:propertyId,user_id:userId,handover_type:type,tenant_name:tenantName,tenant_phone:tenantPhone,handover_date:handoverDate||new Date().toISOString().split('T')[0],notes,items_snapshot:snap})
    if(error){alert('Σφάλμα: '+error.message);setSaving(false);return}
    setMode('list');onSaved();setSaving(false)
  }
  const printHandover = (h:InventoryHandover) => {
    const snap=h.items_snapshot||[]
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>Πρωτόκολλο</title><style>body{font-family:'Inter',Arial;font-size:12px;margin:30px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f4f4f4;padding:8px;text-align:left;font-size:10px;border-bottom:2px solid #ddd}td{padding:8px;border-bottom:1px solid #eee}.sig{margin-top:48px;display:flex;gap:60px}.sig-box{flex:1;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#666}@media print{button{display:none}}</style></head><body>
    <h1>Πρωτόκολλο ${h.handover_type==='check_in'?'Παράδοσης':'Παραλαβής'}</h1>
    <p><strong>${esc(h.tenant_name)}</strong>${h.tenant_phone?` · ${esc(h.tenant_phone)}`:''} · ${esc(fmtDate(h.handover_date))}</p>
    <table><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κατάσταση</th><th>Παρατηρήσεις</th></tr></thead><tbody>
    ${snap.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.category)}</td><td>${esc(s.condition_at_handover)}</td><td>${esc(s.condition_notes||'—')}</td></tr>`).join('')}
    </tbody></table>
    <div class="sig"><div class="sig-box">Υπογραφή Ιδιοκτήτη</div><div class="sig-box">Υπογραφή Ενοικιαστή</div><div class="sig-box">Ημερομηνία</div></div>
    <button onclick="window.print()" style="margin-top:24px;padding:8px 16px;cursor:pointer">Εκτύπωση</button></body></html>`)
    w.document.close()
  }
  if(mode==='compare') {
    const hA=handovers.find(h=>h.id===cmpA); const hB=handovers.find(h=>h.id===cmpB)
    const condOrder=['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
    const allNames=[...new Set([...(hA?.items_snapshot||[]).map(s=>s.name),...(hB?.items_snapshot||[]).map(s=>s.name)])]
    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Σύγκριση Πρωτοκόλλων</p>
          <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:36,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
          {[{v:cmpA,sv:setCmpA},{v:cmpB,sv:setCmpB}].map(({v,sv},i)=>(
            <div key={i}>
              <label style={labelStyle}>Πρωτόκολλο {i===0?'Α':'Β'}</label>
              <CustomSelect value={v} onChange={sv} options={[{value:'',label:'— Επιλέξτε'},...handovers.filter(h=>i===0||h.id!==cmpA).map(h=>({value:h.id,label:`${h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${h.tenant_name} · ${fmtDate(h.handover_date)}`}))]}/>
            </div>
          ))}
        </div>
        {hA&&hB&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'8px 14px',borderBottom:'2px solid var(--border-subtle)'}}>
              {['Αντικείμενο',`${hA.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${hA.tenant_name}`,`${hB.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${hB.tenant_name}`].map(h=><p key={h} style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans}}>{h}</p>)}
            </div>
            {allNames.map(name=>{
              const sA=hA.items_snapshot?.find(s=>s.name===name); const sB=hB.items_snapshot?.find(s=>s.name===name)
              const cA=sA?.condition_at_handover||'—'; const cB=sB?.condition_at_handover||'—'
              const degraded=cA!==cB&&cA!=='—'&&cB!=='—'&&condOrder.indexOf(cB)>condOrder.indexOf(cA)
              return (
                <div key={name} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'10px 14px',background:degraded?'var(--negative-dim)':'var(--bg-elevated)',borderRadius:8,marginBottom:4,border:`1px solid ${degraded?'var(--negative-border)':'var(--border-subtle)'}`}}>
                  <p style={{fontSize:12,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{name}{degraded&&<span title="Υποβαθμισμένη κατάσταση" style={{display:'inline-flex',color:'var(--negative)',marginLeft:6,verticalAlign:'middle'}}><svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></span>}</p>
                  <div>{cA!=='—'?<Badge label={cA} color={CONDITION_COLOR[cA]||'var(--text-tertiary)'}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                  <div>{cB!=='—'?<Badge label={cB} color={CONDITION_COLOR[cB]||'var(--text-tertiary)'}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
  if(mode==='new') return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Νέο Πρωτόκολλο Παράδοσης</p>
        <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:36,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10}}>
        {(['check_in','check_out'] as const).map(t=>(
          <button key={t} onClick={()=>setType(t)} style={{padding:'14px',borderRadius:T.radius.card,cursor:'pointer',fontWeight:500,fontFamily:T.font.sans,fontSize:13,border:`1px solid ${type===t?'var(--accent)':'var(--border-subtle)'}`,background:type===t?'var(--accent)':'var(--bg-elevated)',color:type===t?'var(--accent-text)':'var(--text-secondary)',transition:'all 0.2s'}}>
            {t==='check_in'?'Είσοδος ενοικιαστή':'Έξοδος ενοικιαστή'}
          </button>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
        <div><label style={labelStyle}>Ονοματεπώνυμο *</label><TextInput value={tenantName} onChange={setTenantName} placeholder="Παράδειγμα: Ιωάννης Παπαδόπουλος"/></div>
        <div><label style={labelStyle}>Τηλέφωνο</label><TextInput value={tenantPhone} onChange={setTenantPhone} placeholder="6912345678"/></div>
        <div><label style={labelStyle}>Ημερομηνία</label><DatePicker value={handoverDate} onChange={setHandoverDate}/></div>
        <div><label style={labelStyle}>Σημειώσεις</label><TextInput value={notes} onChange={setNotes} placeholder="Γενικές παρατηρήσεις..."/></div>
      </div>
      <div>
        <SectionLabel label="Κατάσταση Αντικειμένων" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{items.length} αντικείμενα</span>}/>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {items.map(item=>(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'auto 1fr 160px 1fr',gap:12,alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
              <div style={{width:44,height:44,background:'var(--bg-surface)',borderRadius:8,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {item.photo_url?<img src={item.photo_url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
              </div>
              <div>
                <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{item.name}</p>
                <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{item.category}{item.room?` · ${item.room}`:''}</p>
              </div>
              <CustomSelect value={itemConds[item.id]?.condition||item.condition} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],condition:v}}))} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
              <TextInput value={itemConds[item.id]?.notes||''} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],notes:v}}))} placeholder="Παρατηρήσεις..."/>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
        <button onClick={()=>setMode('list')} style={{padding:'0 20px',height:40,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
        <button onClick={handleSave} disabled={saving} style={{padding:'0 24px',height:40,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer'}}>
          {saving?'Αποθήκευση...':'Αποθήκευση Πρωτοκόλλου'}
        </button>
      </div>
    </div>
  )
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <SectionLabel label="Πρωτόκολλα Παράδοσης"/>
        <div style={{display:'flex',gap:8}}>
          {handovers.length>=2&&<button onClick={()=>setMode('compare')} style={{padding:'0 14px',height:36,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer'}}>Σύγκριση</button>}
          <button onClick={()=>setMode('new')} style={{padding:'0 18px',height:36,borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>+ Νέο Πρωτόκολλο</button>
        </div>
      </div>
      {handovers.length===0
        ?<div style={{textAlign:'center',padding:'60px 0'}}><p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Δεν υπάρχουν πρωτόκολλα</p></div>
        :<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {handovers.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map(h=>{
            const snap=h.items_snapshot||[]; const bad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:bad>0?12:0}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <Badge label={h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} color="var(--text-secondary)"/>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{h.tenant_name}</p>
                    </div>
                    <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(h.handover_date)}{h.tenant_phone?` · ${h.tenant_phone}`:''} · {snap.length} αντικείμενα</p>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {bad>0&&<Badge label={`${bad} προβλήματα`} color="var(--negative)"/>}
                    <button onClick={()=>printHandover(h)} style={{padding:'0 12px',height:32,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--accent)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer',fontWeight:500}}>Εκτύπωση</button>
                  </div>
                </div>
                {bad>0&&(
                  <div style={{padding:'8px 12px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>
                    {snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').map((s,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)',fontFamily:T.font.sans,padding:'2px 0'}}>
                        <span>{s.name}</span><span style={{color:'var(--negative)'}}>{s.condition_at_handover}{s.condition_notes?`, ${s.condition_notes}`:''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      }
    </div>
  )
}

function MaintenanceTab({items,schedules,propertyId,userId,onSaved}:{items:InventoryItem[];schedules:MaintenanceSchedule[];propertyId:string;userId:string;onSaved:()=>void}) {
  const [adding,setAdding] = useState(false)
  const [form,setForm] = useState({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:''})
  const [saving,setSaving] = useState(false)
  const [pushed,setPushed] = useState<Set<string>>(new Set())
  const overdue=schedules.filter(s=>daysUntil(s.next_due)<0)
  const soon=schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30})
  const upcoming=schedules.filter(s=>daysUntil(s.next_due)>30)
  const markDone=async(s:MaintenanceSchedule)=>{
    const today=new Date().toISOString().split('T')[0]
    await supabase.from('inventory_maintenance').update({last_done:today,next_due:addMonths(today,s.interval_months)}).eq('id',s.id)
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Συντήρηση: ${s.task}${s.item_name?`, ${s.item_name}`:''}`,amount:0,category:'Συντήρηση & Επισκευές',expense_group:'maintenance',date:today,paid_by:'owner',paid:true,notes:'Αυτόματη εισαγωγή από Συντήρηση'})
    onSaved()
  }
  const deleteSched=async(id:string)=>{await supabase.from('inventory_maintenance').delete().eq('id',id);onSaved()}
  const pushCal=async(s:MaintenanceSchedule)=>{await supabase.from('calendar_events').insert({property_id:propertyId,user_id:userId,title:`Συντήρηση: ${s.task}${s.item_name?`, ${s.item_name}`:''}`,category:'maintenance',event_date:s.next_due,priority:'medium',status:'pending',source:'inventory'});setPushed(p=>new Set(p).add(s.id))}
  const addSuggested=async(s:{task:string;interval_months:number;category:string})=>{
    const matching=items.filter(i=>i.category===s.category)
    const inserts=matching.length>0?matching.map(item=>({property_id:propertyId,user_id:userId,item_id:item.id,item_name:item.name,task:s.task,interval_months:s.interval_months,last_done:'',next_due:addMonths('',s.interval_months),notes:''})):[{property_id:propertyId,user_id:userId,item_id:'',item_name:'',task:s.task,interval_months:s.interval_months,last_done:'',next_due:addMonths('',s.interval_months),notes:''}]
    await supabase.from('inventory_maintenance').insert(inserts);onSaved()
  }
  const handleSave=async()=>{
    if(!form.task.trim()){alert('Η εργασία είναι υποχρεωτική.');return}
    setSaving(true)
    await supabase.from('inventory_maintenance').insert({property_id:propertyId,user_id:userId,item_id:form.item_id||'',item_name:form.item_name,task:form.task,interval_months:form.interval_months,last_done:form.last_done,next_due:addMonths(form.last_done,form.interval_months),notes:form.notes})
    if(form.last_done){await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Συντήρηση: ${form.task}${form.item_name?`, ${form.item_name}`:''}`,amount:0,category:'Συντήρηση & Επισκευές',expense_group:'maintenance',date:form.last_done,paid_by:'owner',paid:true,notes:'Αυτόματη εισαγωγή από Συντήρηση'})}
    setAdding(false);setForm({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:''});setSaving(false);onSaved()
  }
  const SchedRow=({s}:{s:MaintenanceSchedule})=>{
    const days=daysUntil(s.next_due); const c=days<0?'var(--negative)':days<=30?'var(--warning)':'var(--positive)'
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
        <div>
          <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{s.task}</p>
          <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{s.item_name||'Γενική'} · κάθε {s.interval_months} μήνες{s.last_done?` · Τελ: ${fmtDate(s.last_done)}`:''}</p>
        </div>
        <Badge label={days<0?`${Math.abs(days)} ημ. καθυστ.`:days===0?'Σήμερα!':`${days} ημ.`} color={c}/>
        <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtDate(s.next_due)}</span>
        <button onClick={()=>markDone(s)} style={{padding:'0 12px',height:32,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:11,fontFamily:T.font.sans,cursor:'pointer',fontWeight:500,whiteSpace:'nowrap'}}>Έγινε</button>
        <OverflowMenu actions={[
          {label:pushed.has(s.id)?'Προστέθηκε στο ημερολόγιο':'Υπενθύμιση στο ημερολόγιο',icon:IconCal,onClick:()=>pushCal(s)},
          {label:'Διαγραφή',icon:IconTrash,danger:true,onClick:()=>{if(confirm('Διαγραφή;'))deleteSched(s.id)}},
        ]}/>
      </div>
    )
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <SectionLabel label="Πρόγραμμα Συντήρησης"/>
        <button onClick={()=>setAdding(true)} style={{padding:'0 18px',height:36,borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>+ Νέα Εργασία</button>
      </div>
      <KPIGrid items={[
        {label:'Σε Καθυστέρηση',value:String(overdue.length),tone:overdue.length>0?'negative':'neutral'},
        {label:'Επόμενες 30 Μέρες',value:String(soon.length),tone:soon.length>0?'warning':'neutral'},
        {label:'Προγραμματισμένες',value:String(upcoming.length)},
      ]}/>
      {schedules.length===0&&(
        <div style={cardStyle}>
          <SectionLabel label="Προτεινόμενες Εργασίες"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8}}>
            {DEFAULT_MAINTENANCE.map((s,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner}}>
                <div>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{s.task}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>κάθε {s.interval_months} μήνες · {s.category}</p>
                </div>
                <button onClick={()=>addSuggested(s)} style={{padding:'0 12px',height:32,borderRadius:T.radius.pill,border:'1px solid var(--border-accent)',background:'var(--accent-dim)',color:'var(--accent)',fontSize:11,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>+ Προσθήκη</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {overdue.length>0&&<div style={{display:'flex',flexDirection:'column',gap:6}}><SectionLabel label="Σε Καθυστέρηση" right={<Badge label={String(overdue.length)} color="var(--negative)"/>}/>{overdue.map(s=><SchedRow key={s.id} s={s}/>)}</div>}
      {soon.length>0&&<div style={{display:'flex',flexDirection:'column',gap:6}}><SectionLabel label="Επόμενες 30 Μέρες" right={<Badge label={String(soon.length)} color="var(--warning)"/>}/>{soon.map(s=><SchedRow key={s.id} s={s}/>)}</div>}
      {upcoming.length>0&&<div style={{display:'flex',flexDirection:'column',gap:6}}><SectionLabel label="Επερχόμενες"/>{upcoming.map(s=><SchedRow key={s.id} s={s}/>)}</div>}
      {adding&&(
        <div style={{...cardStyle,border:'1px solid var(--border-accent)'}}>
          <SectionLabel label="Νέα Εργασία Συντήρησης"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
            <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Εργασία *</label><TextInput value={form.task} onChange={v=>setForm(f=>({...f,task:v}))} placeholder="Παράδειγμα: Ετήσιος έλεγχος λέβητα"/></div>
            <div><label style={labelStyle}>Αντικείμενο</label><CustomSelect value={form.item_id} onChange={v=>{const it=items.find(i=>i.id===v);setForm(f=>({...f,item_id:v,item_name:it?.name||''}))}} options={[{value:'',label:'— Γενική εργασία'},...items.map(i=>({value:i.id,label:i.name}))]}/></div>
            <div><label style={labelStyle}>Κάθε (μήνες)</label><NumberInput value={String(form.interval_months)} onChange={v=>setForm(f=>({...f,interval_months:parseInt(v)||1}))} suffix="μήνες" min={1} max={60}/></div>
            <div><label style={labelStyle}>Τελευταία Εκτέλεση</label><DatePicker value={form.last_done} onChange={v=>setForm(f=>({...f,last_done:v}))}/></div>
            <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Σημειώσεις</label><TextInput value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Τεχνικός, παρατηρήσεις..."/></div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>
            <button onClick={()=>setAdding(false)} style={{padding:'0 16px',height:36,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
            <button onClick={handleSave} disabled={saving} style={{padding:'0 20px',height:36,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:12,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση...':'Αποθήκευση'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExportsTab({items,repairs,kwhPrice}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number}) {
  const totalCurrent=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairs=repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems=items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyCost=electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  const exportCSV=()=>{
    const headers=['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Προέλευση','Κατάστημα','Αριθμός Απόδειξης','Αξία Αγοράς','Αρχ.Τιμή','Έκπτωση%','Τρέχουσα Αξία','Κόστος Αντικ.','Απόσβεση%','Ηλ.Κλάση','Watt','Ώρες/ημ','kWh/μήνα','Κόστος Ρεύμ./μήνα','Smart','Tags','Ηλικία','Ημ/νία Αγοράς','Λήξη Εγγύησης','Σημειώσεις']
    const rows=items.map(i=>[i.name,i.category,i.room,i.brand,i.model,i.serial_number,i.condition,provenanceLabel(i.provenance)||i.provenance||'Νέο',i.store_vendor||'',i.receipt_number||'',i.purchase_value||'',i.original_price||'',i.discount_pct||'',calcCurrentValue(i),i.replacement_cost||'',calcDepreciationPct(i)+'%',i.energy_class||'',i.power_watts||'',i.daily_hours_use||'',calcMonthlyKwh(i)||'',kwhPrice>0?calcMonthlyCost(i,kwhPrice).toFixed(2):'',i.smart_device?'Ναι':'Όχι',(i.tags||[]).join(';'),calcAgeDisplay(i.purchase_date),i.purchase_date,i.warranty_expiry,i.notes])
    const csv=[headers,...rows].map(row=>row.map(cell=>{const s=csvSafe(String(cell??''));return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(';')).join('\r\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));a.download='απογραφη.csv';a.click()
  }
  const exportPDF=()=>{
    const byCat=['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>Απογραφή</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',Roboto,Arial;font-size:11px;color:#111;padding:32px}h1{font-size:22px;font-weight:400;margin-bottom:4px}.sub{color:#666;margin-bottom:24px;font-size:12px}.kpis{display:flex;gap:12px;margin-bottom:28px}.kpi{flex:1;background:#f8f8f8;border-radius:8px;padding:14px}.kpi-v{font-size:18px;font-weight:700;font-family:'Roboto Mono',monospace;margin-bottom:2px}.kpi-l{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888}h2{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #eee}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f4f4f4;padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:7px 8px;border-bottom:1px solid #f0f0f0;font-size:11px}.footer{margin-top:40px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center}@media print{button{display:none}}</style></head><body>
    <h1>Απογραφή Ακινήτου</h1><div class="sub">${esc(new Date().toLocaleDateString('el-GR'))} · ${esc(items.length)} αντικείμενα</div>
    <div class="kpis"><div class="kpi"><div class="kpi-v">${esc(fmtEur(totalCurrent))}</div><div class="kpi-l">Τρέχουσα Αξία</div></div><div class="kpi"><div class="kpi-v">${esc(fmtEur(Math.round(totalCurrent*1.1)))}</div><div class="kpi-l">Ασφαλιστέα (+10%)</div></div><div class="kpi"><div class="kpi-v">${esc(fmtEur(totalRepairs))}</div><div class="kpi-l">Επισκευές</div></div>${electricItems.length>0?`<div class="kpi"><div class="kpi-v">${esc(fmtEurC(totalMonthlyCost))}</div><div class="kpi-l">Ρεύμα/Μήνα</div></div>`:''}</div>
    <h2>Ανά Κατηγορία</h2>${byCat.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0"><span>${esc(cat)} (${esc(count)})</span><strong>${esc(fmtEur(val))}</strong></div>`).join('')}
    <h2>Αναλυτική Κατάλογος</h2><table><thead><tr><th>Αντικείμενο</th><th>Κλάση</th><th>Κατάσταση</th><th>Προέλευση</th><th>Αξία Αγοράς</th><th>Τρέχουσα</th><th>Απόσβεση</th><th>kWh/μήνα</th><th>Εγγύηση</th></tr></thead><tbody>
    ${items.map(i=>`<tr><td><strong>${esc(i.name)}</strong>${i.brand?`<br><small style="color:#888">${esc(i.brand)} ${esc(i.model||'')}</small>`:''}</td><td>${esc(i.energy_class||'—')}</td><td>${esc(i.condition)}</td><td>${esc(provenanceLabel(i.provenance)||'Νέο')}</td><td style="font-family:monospace">${esc(i.purchase_value?fmtEur(i.purchase_value):'—')}</td><td style="font-family:monospace;font-weight:bold">${esc(fmtEur(calcCurrentValue(i)))}</td><td>${esc(calcDepreciationPct(i))}%</td><td>${esc(calcMonthlyKwh(i)>0?calcMonthlyKwh(i)+' kWh':'—')}</td><td>${esc(i.warranty_expiry?fmtDate(i.warranty_expiry):'—')}</td></tr>`).join('')}
    </tbody></table><div class="footer">Property OS · ${esc(new Date().toLocaleDateString('el-GR'))}</div>
    <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer;border-radius:6px">Εκτύπωση</button></body></html>`)
    w.document.close()
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionLabel label="Εξαγωγές Δεδομένων"/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16}}>
        {[
          {title:'Απογραφή PDF',desc:'Πλήρης έκθεση με αξίες, ενεργειακές κλάσεις, ηλικία, tags, προέλευση και εγγυήσεις.',fn:exportPDF,primary:true},
          {title:'Εξαγωγή CSV',desc:'Excel-συμβατό αρχείο με όλα τα πεδία, ιδανικό για λογιστή ή αρχειοθέτηση.',fn:exportCSV,primary:false},
        ].map(({title,desc,fn,primary})=>(
          <div key={title} style={cardStyle}>
            <div style={{textAlign:'center',marginBottom:14}}>
              <p style={{fontSize:15,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:6}}>{title}</p>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:T.font.sans}}>{desc}</p>
            </div>
            <div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:8,fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,marginBottom:14}}>
              <p>{items.length} αντικείμενα · <span style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{fmtEur(totalCurrent)}</span></p>
              {electricItems.length>0&&<p>Ρεύμα: <span style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{fmtEurC(totalMonthlyCost)}</span>/μήνα</p>}
            </div>
            <button onClick={fn} style={{width:'100%',padding:'0 0',height:40,borderRadius:T.radius.pill,background:primary?'var(--accent)':'var(--bg-elevated)',border:primary?'none':'1px solid var(--border-default)',color:primary?'var(--accent-text)':'var(--text-primary)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>{title}</button>
          </div>
        ))}
      </div>
      <div style={{padding:'14px 16px',background:'var(--bg-elevated)',borderRadius:T.radius.card,border:'1px solid var(--border-subtle)'}}>
        <p style={{fontSize:12,color:'var(--text-primary)',fontWeight:500,fontFamily:T.font.sans,marginBottom:4}}>Ασφάλιση Περιεχομένου</p>
        <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:T.font.sans}}>Ασφαλιστέα αξία: <strong style={{fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{fmtEur(Math.round(totalCurrent*1.1))}</strong> (τρέχουσα +10% περιθώριο ασφαλείας για το κόστος αντικατάστασης).</p>
      </div>
    </div>
  )
}

export default function TabInventory({propertyId,userId,profileType='individual',embedded}:TabInventoryProps & {embedded?:boolean}) {
  const [activeTab,setActiveTab] = useState<'items'|'care'|'handover'|'overview'>('items')
  const [items,setItems] = useState<InventoryItem[]>([])
  const [repairs,setRepairs] = useState<InventoryRepair[]>([])
  const [handovers,setHandovers] = useState<InventoryHandover[]>([])
  const [schedules,setSchedules] = useState<MaintenanceSchedule[]>([])
  const [kwhPrice,setKwhPrice] = useState(0.22)
  const [kwInput,setKwInput] = useState('0.22')
  const [loading,setLoading] = useState(true)
  const [showItemForm,setShowItemForm] = useState(false)
  const [editingItem,setEditingItem] = useState<InventoryItem|null>(null)
  const [repairItem,setRepairItem] = useState<InventoryItem|null>(null)
  const [qrItem,setQrItem] = useState<InventoryItem|null>(null)
  const [showBulkImport,setShowBulkImport] = useState(false)

  const fetchData = useCallback(async()=>{
    setLoading(true)
    const [iR,rR,hR,sR,bR,psR] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_repairs').select('*').eq('user_id',userId).order('repair_date',{ascending:false}),
      supabase.from('inventory_handovers').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_maintenance').select('*').eq('property_id',propertyId).order('next_due'),
      supabase.from('bills_electricity').select('price_per_kwh').eq('property_id',propertyId).limit(1),
      supabase.from('property_settings').select('kwh_price').eq('property_id',propertyId).eq('user_id',userId).limit(1),
    ])
    if(iR.data){
      // Καμία εγγραφή κατά την ανάγνωση: οι υπενθυμίσεις ημερολογίου δημιουργούνται
      // ΜΟΝΟ με ρητή ενέργεια του χρήστη (κουμπί «Ημερολόγιο»), όχι αυτόματα σε κάθε load.
      const loadedItems=iR.data.map((i:any)=>({...i,photos:i.photos||[],tags:i.tags||[]}))
      setItems(loadedItems)
    }
    if(rR.data)setRepairs(rR.data)
    if(hR.data)setHandovers(hR.data as InventoryHandover[])
    if(sR.data)setSchedules(sR.data)
    const savedKwh=psR.data?.[0]?.kwh_price||bR.data?.[0]?.price_per_kwh
    if(savedKwh){setKwhPrice(savedKwh);setKwInput(String(savedKwh))}
    setLoading(false)
  },[propertyId,userId])

  useEffect(()=>{fetchData()},[fetchData])

  const saveKwh=async(price:number)=>{
    await supabase.from('property_settings').upsert({property_id:propertyId,user_id:userId,kwh_price:price,updated_at:new Date().toISOString()},{onConflict:'property_id,user_id'})
  }
  const handleSaveItem=async(data:Partial<InventoryItem>)=>{
    if(data.original_price&&data.discount_pct&&!data.purchase_value){data.purchase_value=Math.round((data.original_price)*(1-data.discount_pct/100))}
    const payload={name:data.name||'',category:data.category||'Λοιπά',room:data.room||'',brand:data.brand||'',model:data.model||'',serial_number:data.serial_number||'',condition:data.condition||'Καλή',notes:data.notes||'',photo_url:data.photo_url||'',photos:data.photos||[],tags:data.tags||[],purchase_value:data.purchase_value||0,purchase_date:data.purchase_date||null,warranty_expiry:data.warranty_expiry||null,energy_class:data.energy_class||'',power_watts:data.power_watts||0,daily_hours_use:data.daily_hours_use||0,standby_watts:data.standby_watts||0,replacement_cost:data.replacement_cost||0,smart_device:data.smart_device||false,smart_notes:data.smart_notes||'',provenance:data.provenance||'new',original_price:data.original_price||0,discount_pct:data.discount_pct||0,store_vendor:data.store_vendor||'',receipt_number:data.receipt_number||'',updated_at:new Date().toISOString()}
    if(editingItem){const {error}=await supabase.from('inventory_items').update(payload).eq('id',editingItem.id);if(error)alert('Σφάλμα: '+error.message)}
    else{const {error}=await supabase.from('inventory_items').insert({...payload,property_id:propertyId,user_id:String(userId)});if(error)alert('Σφάλμα: '+error.message)}
    setShowItemForm(false);setEditingItem(null);fetchData()
  }
  const handleDelete=async(id:string)=>{const {error}=await supabase.from('inventory_items').delete().eq('id',id);if(error){alert('Σφάλμα: '+error.message);return};fetchData()}
  const handleAddRepair=async(data:Partial<InventoryRepair>)=>{if(!repairItem)return;await supabase.from('inventory_repairs').insert({...data,item_id:repairItem.id,user_id:userId});fetchData()}
  const handleUpdateCondition=async(id:string,condition:string)=>{await supabase.from('inventory_items').update({condition,updated_at:new Date().toISOString()}).eq('id',id);setItems(prev=>prev.map(i=>i.id===id?{...i,condition}:i))}
  const handleWarrantyReminder=async(item:InventoryItem)=>{
    if(!item.warranty_expiry){alert('Το αντικείμενο δεν έχει ημερομηνία λήξης εγγύησης.');return}
    const {error}=await supabase.from('calendar_events').insert({property_id:propertyId,user_id:userId,title:`Εγγύηση: ${item.name}`,description:`Λήγει ${fmtDate(item.warranty_expiry)}`,event_date:item.warranty_expiry,category:'maintenance',status:'pending',priority:daysUntil(item.warranty_expiry)<=30?'high':'medium',source:'inventory'})
    if(error){alert('Δεν μπόρεσα να προσθέσω την υπενθύμιση: '+error.message);return}
    alert(`Προστέθηκε υπενθύμιση εγγύησης στο ημερολόγιο για «${item.name}».`)
  }
  const exportInventoryCsv=()=>downloadCsv(
    `apografi_${new Date().toISOString().slice(0,10)}`,
    ['Αντικείμενο','Κατηγορία','Δωμάτιο','Μάρκα','Κατάσταση','Ημ. Αγοράς','Τιμή Αγοράς (€)','Τρέχουσα Αξία (€)','Εγγύηση έως'],
    items.map(item=>[item.name,item.category,item.room||'',item.brand||'',item.condition,csvDate(item.purchase_date),csvEur(item.purchase_value),csvEur(calcCurrentValue(item)),csvDate(item.warranty_expiry)])
  )

  const TABS=[
    {key:'items',label:'Αντικείμενα'},
    {key:'care',label:'Εγγυήσεις & Συντήρηση'},
    {key:'handover',label:'Παράδοση'},
    {key:'overview',label:'Επισκόπηση'},
  ] as const

  const overdueCount=schedules.filter(s=>daysUntil(s.next_due)<0).length
  const warnCount=schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30}).length
  const actionCount=items.filter(needsAction).length
  const invSummary=portfolioSummary(items)
  const replacementCount=items.filter(i=>replacementSuggestion(i).suggested).length
  const totalValue=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const warrantyExpiringCount=items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90}).length
  const badConditionCount=items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας').length
  const nextMaintenanceDate=schedules.map(s=>s.next_due).filter(Boolean).sort()[0]||''

  return (
    <div style={{minWidth:0,width:'100%'}}>
      {(showItemForm||editingItem)&&<ItemFormModal item={editingItem} onSave={handleSaveItem} onClose={()=>{setShowItemForm(false);setEditingItem(null)}}/>}
      {repairItem&&<RepairModal item={repairItem} repairs={repairs} onAdd={handleAddRepair} onClose={()=>setRepairItem(null)} propertyId={propertyId} userId={userId}/>}
      {qrItem&&<QRModal item={qrItem} onClose={()=>setQrItem(null)}/>}
      {showBulkImport&&<BulkImportModal propertyId={propertyId} userId={userId} onImported={fetchData} onClose={()=>setShowBulkImport(false)}/>}

      {!embedded && <PageTitle
        title="Έπιπλα / Εξοπλισμός"
        sub="Διαχείριση εξοπλισμού, αξίας, ρεύματος, εγγυήσεων και παράδοσης"
        right={<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <div title="kWh = κιλοβατώρα, μονάδα κατανάλωσης ρεύματος· τιμή σε € ανά kWh" style={{display:'flex',alignItems:'center',height:36,background:'transparent',border:'1px solid var(--border-default)',borderRadius:T.radius.pill,overflow:'hidden'}}>
            <span style={{padding:'0 10px',fontSize:10,color:'var(--text-tertiary)',borderRight:'1px solid var(--border-subtle)',alignSelf:'stretch',display:'flex',alignItems:'center',whiteSpace:'nowrap',letterSpacing:'0.5px',textTransform:'uppercase',fontFamily:T.font.sans}}>kWh €</span>
            <input type="text" inputMode="decimal" value={kwInput}
              onChange={e=>{const raw=e.target.value.replace(',','.');setKwInput(raw);if(/^\d*\.?\d*$/.test(raw)&&raw!=='')setKwhPrice(parseFloat(raw)||0)}}
              onFocus={e=>{if(kwInput==='0')setKwInput('');e.target.select()}}
              onBlur={()=>{const n=parseFloat(kwInput);if(isNaN(n)||kwInput===''){setKwInput('0.22');setKwhPrice(0.22);saveKwh(0.22)}else{setKwInput(String(n));setKwhPrice(n);saveKwh(n)}}}
              style={{width:56,background:'transparent',border:'none',outline:'none',padding:'0 10px',fontSize:12,color:'var(--text-primary)',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',textAlign:'right'}}
            />
          </div>
          <Btn variant="ghost" onClick={()=>setShowBulkImport(true)}>Μαζική εισαγωγή</Btn>
          <ExportButton onClick={exportInventoryCsv} disabled={items.length===0}/>
          <Btn variant="primary" onClick={()=>{setEditingItem(null);setShowItemForm(true)}}>Νέο αντικείμενο</Btn>
        </div>}
      />}

      {!loading&&(items.length===0
        ? <InfoBanner tone="info">Δεν υπάρχουν ακόμη αντικείμενα στην απογραφή. Πρόσθεσε το πρώτο αντικείμενο ή χρησιμοποίησε τη Μαζική Εισαγωγή για να ξεκινήσεις.</InfoBanner>
        : <>
            <KPIGrid items={[
              {label:'Σύνολο Αντικειμένων',value:fn(items.length)},
              {label:'Συνολική Αξία',value:fe(totalValue,0),sub:invSummary.totalOriginal>0?`από ${fe(invSummary.totalOriginal,0)} αξία αγοράς`:'Τρέχουσα αξία μετά απόσβεση'},
              {label:'Προς Αντικατάσταση',value:fn(replacementCount),tone:replacementCount>0?'warning':'neutral',sub:profileType==='professional'&&invSummary.replacementBudget>0?`~${fe(invSummary.replacementBudget,0)} προϋπ.`:'Απόσβεση, κατάσταση ή εγγύηση'},
              {label:'Εγγυήσεις που Λήγουν',value:fn(warrantyExpiringCount),tone:warrantyExpiringCount>0?'warning':'neutral',sub:'Εντός 90 ημερών'},
              {label:'Αντικείμενα σε Κακή Κατάσταση',value:fn(badConditionCount),tone:badConditionCount>0?'negative':'neutral'},
              {label:'Επόμενη Συντήρηση',value:nextMaintenanceDate?fd(nextMaintenanceDate):'—',tone:overdueCount>0?'negative':'neutral',sub:overdueCount>0?`${overdueCount} σε καθυστέρηση`:undefined},
            ]}/>
            {(()=>{
              const parts:string[]=[]
              if(actionCount>0) parts.push(`${fn(actionCount)} ${actionCount===1?'αντικείμενο χρειάζεται προσοχή':'αντικείμενα χρειάζονται προσοχή'}`)
              if(warrantyExpiringCount>0) parts.push(`${fn(warrantyExpiringCount)} ${warrantyExpiringCount===1?'εγγύηση λήγει':'εγγυήσεις λήγουν'} σε 90 ημέρες`)
              if(overdueCount>0) parts.push(`${fn(overdueCount)} ${overdueCount===1?'εργασία συντήρησης σε καθυστέρηση':'εργασίες συντήρησης σε καθυστέρηση'}`)
              const tone = overdueCount>0||badConditionCount>0 ? 'warning' : 'info'
              return (
                <InfoBanner tone={tone}>
                  {parts.length>0 && <><strong>{parts.join(' · ')}.</strong> </>}
                  Οι αξίες, η απόσβεση και οι προτάσεις αντικατάστασης είναι <strong>εκτιμήσεις</strong> για την καθοδήγησή σου, όχι λογιστικά μεγέθη.
                </InfoBanner>
              )
            })()}
          </>
      )}

      <div style={{display:'flex',gap:2,borderBottom:'1px solid var(--border-subtle)',marginLeft:-24,marginRight:-24,paddingLeft:24,overflowX:'auto',marginTop:24,marginBottom:24}}>
        {TABS.map(tab=>(
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
            style={{padding:'12px 18px',fontSize:13,fontWeight:activeTab===tab.key?500:400,fontFamily:T.font.sans,color:activeTab===tab.key?'var(--accent)':'var(--text-secondary)',borderBottom:`2px solid ${activeTab===tab.key?'var(--accent)':'transparent'}`,borderLeft:'none',borderRight:'none',borderTop:'none',background:'none',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',display:'flex',alignItems:'center',gap:6,marginBottom:-1}}
            onMouseEnter={e=>{if(activeTab!==tab.key)(e.currentTarget as HTMLButtonElement).style.color='var(--text-primary)'}}
            onMouseLeave={e=>{if(activeTab!==tab.key)(e.currentTarget as HTMLButtonElement).style.color='var(--text-secondary)'}}
          >
            {tab.label}
            {tab.key==='care'&&(overdueCount>0||warnCount>0)&&<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:16,height:16,borderRadius:8,background:overdueCount>0?'var(--negative)':'var(--warning)',color:'#fff',fontSize:9,fontWeight:700,padding:'0 4px'}}>{overdueCount+warnCount>9?'9+':overdueCount+warnCount}</span>}
            {tab.key==='items'&&actionCount>0&&<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:16,height:16,borderRadius:8,background:'var(--warning)',color:'#fff',fontSize:9,fontWeight:700,padding:'0 4px'}}>{actionCount>9?'9+':actionCount}</span>}
          </button>
        ))}
      </div>

      {loading
        ?<Spinner label="Φόρτωση…" />
        :(
          <>
            {activeTab==='items'&&<ItemsTab items={items} repairs={repairs} kwhPrice={kwhPrice} onAdd={()=>{setEditingItem(null);setShowItemForm(true)}} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onDelete={handleDelete} onRepair={item=>setRepairItem(item)} onQR={item=>setQrItem(item)} onUpdateCondition={handleUpdateCondition} onWarrantyReminder={handleWarrantyReminder}/>}
            {activeTab==='care'&&<div style={{display:'flex',flexDirection:'column',gap:28}}><WarrantiesTab items={items} userId={userId} propertyId={propertyId}/><MaintenanceTab items={items} schedules={schedules} propertyId={propertyId} userId={userId} onSaved={fetchData}/></div>}
            {activeTab==='handover'&&<HandoverTab items={items} handovers={handovers} propertyId={propertyId} userId={userId} onSaved={fetchData}/>}
            {activeTab==='overview'&&<div style={{display:'flex',flexDirection:'column',gap:28}}><OverviewTab items={items} repairs={repairs} kwhPrice={kwhPrice} profileType={profileType}/><ExportsTab items={items} repairs={repairs} kwhPrice={kwhPrice}/></div>}
          </>
        )
      }
    </div>
  )
}