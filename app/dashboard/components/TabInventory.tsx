'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { CustomSelect, NumberInput, TextInput, DatePicker, Toggle, Textarea } from './UIComponents'
import { PageTitle, KPIGrid, SecHdr, InfoBanner, fe, fn, fd, Spinner, ExportButton } from '@/components/Theme'
import { downloadCsv, csvEur, csvDate } from './exportCsv'

const supabase = createSupabaseClient()

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
interface TabInventoryProps { propertyId: string; userId: string }

const CATEGORIES = ['Επιπλα','Ηλεκτρικες Συσκευες','Ηλεκτρονικα','Υδραυλικα','Θερμανση & Ψυξη','Φωτιστικα','Διακοσμηση','Λοιπα']
const CATEGORIES_DISPLAY = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά']
const ROOM_PRESETS = ['Σαλόνι','Κουζίνα','Κύριο Υπνοδωμάτιο','Υπνοδωμάτιο 2','Υπνοδωμάτιο 3','Μπάνιο','WC','Χολ / Διάδρομος','Μπαλκόνι','Αποθήκη','Γκαράζ']
const CONDITIONS = ['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
const ENERGY_CLASSES = ['A+++','A++','A+','A','B','C','D','E','F','G']
const PROVENANCE_OPTIONS = [
  {value:'new', label:'Νέο — Αγορά από κατάστημα'},
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
  'A+++':'#059669','A++':'#10b981','A+':'#34d399','A':'#22c55e',
  'B':'#fbbf24','C':'#f59e0b','D':'#f97316','E':'#ef4444','F':'#dc2626','G':'#991b1b',
}
const CATEGORY_ICONS: Record<string,string> = {
  'Έπιπλα':'','Ηλεκτρικές Συσκευές':'','Ηλεκτρονικά':'',
  'Υδραυλικά':'','Θέρμανση & Ψύξη':'','Φωτιστικά':'','Διακόσμηση':'','Λοιπά':'',
}
const DEPRECIATION_YEARS: Record<string,number> = {
  'Έπιπλα':10,'Ηλεκτρικές Συσκευές':6,'Ηλεκτρονικά':3,'Υδραυλικά':15,
  'Θέρμανση & Ψύξη':12,'Φωτιστικά':8,'Διακόσμηση':20,'Λοιπά':8,
}
const REPLACEMENT_RANGES: Record<string,{min:number;max:number}> = {
  'Ηλεκτρικές Συσκευές':{min:200,max:1200},'Ηλεκτρονικά':{min:150,max:2000},
  'Θέρμανση & Ψύξη':{min:300,max:3000},'Φωτιστικά':{min:30,max:500},
  'Έπιπλα':{min:100,max:3000},'Υδραυλικά':{min:50,max:800},'Λοιπά':{min:50,max:500},
}
const AVAILABLE_TAGS = ['Ενεργοβόρο','Υπό Παρακολούθηση','Νέο','Αντικ. Σύντομα','Smart','Εγγύηση Ενεργή','Επισκευάστηκε','Σημαντικό']
const DEFAULT_MAINTENANCE = [
  {task:'Ετήσιος έλεγχος λέβητα',interval_months:12,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρων κλιματιστικού',interval_months:3,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρου πλυντηρίου',interval_months:3,category:'Ηλεκτρικές Συσκευές'},
  {task:'Αποασβεστοποίηση καφετιέρας',interval_months:2,category:'Ηλεκτρικές Συσκευές'},
  {task:'Έλεγχος μπαταρίας ανιχνευτή καπνού',interval_months:6,category:'Λοιπά'},
  {task:'Έλεγχος αντλίας θερμότητας',interval_months:12,category:'Θέρμανση & Ψύξη'},
]

const calcCurrentValue = (item: InventoryItem) => {
  if (!item.purchase_value || !item.purchase_date) return item.purchase_value || 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  return Math.round(item.purchase_value * Math.max(0, 1 - years/(DEPRECIATION_YEARS[item.category]||8)))
}
const calcDepreciationPct = (item: InventoryItem) => {
  if (!item.purchase_date) return 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  return Math.min(100, Math.round((years/(DEPRECIATION_YEARS[item.category]||8))*100))
}
const calcYearsLeft = (item: InventoryItem) => {
  if (!item.purchase_date) return 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  return Math.max(0, Math.round((DEPRECIATION_YEARS[item.category]||8) - years))
}
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
  borderRadius:12,
  padding:'18px 20px',
}
const labelStyle: React.CSSProperties = {
  fontSize:11,
  color:'var(--text-secondary)',
  textTransform:'uppercase' as const,
  letterSpacing:'0.5px',
  fontWeight:500,
  fontFamily:"'Google Sans', sans-serif",
  display:'block',
  marginBottom:6,
}
const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <SecHdr label={label} right={right}/>
)

const StatCard = ({label,value,color,sub,accent}:{label:string;value:string;color?:string;sub?:string;accent?:boolean}) => (
  <div style={{background:accent?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${accent?'var(--border-accent)':'var(--border-subtle)'}`,borderRadius:12,padding:'16px 18px'}}>
    <p style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Google Sans',sans-serif",marginBottom:8}}>{label}</p>
    <p style={{fontSize:20,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:color||'var(--text-primary)',fontWeight:700,letterSpacing:'-0.5px',lineHeight:1}}>{value}</p>
    {sub&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:5,fontFamily:"'Roboto',sans-serif"}}>{sub}</p>}
  </div>
)

const Badge = ({label,color}:{label:string;color:string}) => (
  <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color,background:color+'18',border:`1px solid ${color}30`,whiteSpace:'nowrap'}}>{label}</span>
)

const EnergyBadge = ({cls}:{cls:string}) => !cls ? null : (
  <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,color:'#fff',background:ENERGY_COLOR[cls]||'#888',letterSpacing:'0.5px',fontFamily:"'Google Sans',sans-serif"}}>{cls}</span>
)

const DepBar = ({pct,left}:{pct:number;left:number}) => {
  const c = pct<40?'var(--positive)':pct<70?'var(--warning)':'var(--negative)'
  return (
    <div>
      <div style={{height:3,background:'var(--border-subtle)',borderRadius:2,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:c,borderRadius:2,transition:'width 0.4s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>Απόσβεση {pct}%</span>
        {left>0
          ?<span style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>~{left} χρόνια</span>
          :<span style={{fontSize:9,color:'var(--negative)',fontWeight:700,fontFamily:"'Google Sans',sans-serif"}}>Πλήρης</span>
        }
      </div>
    </div>
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
      <button onClick={()=>setOpen(v=>!v)} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:CONDITION_COLOR[item.condition],background:CONDITION_COLOR[item.condition]+'18',border:`1px solid ${CONDITION_COLOR[item.condition]}40`,cursor:'pointer'}}>
        {item.condition}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l3 3 3-3"/></svg>
      </button>
      {open&&(
        <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:12,padding:6,zIndex:600,minWidth:160,boxShadow:'var(--shadow-lg)'}}>
          {CONDITIONS.map(c=>(
            <div key={c} onClick={()=>{onUpdate(item.id,c);setOpen(false)}}
              style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:12,fontFamily:"'Google Sans',sans-serif",color:CONDITION_COLOR[c],background:item.condition===c?CONDITION_COLOR[c]+'15':'transparent',fontWeight:item.condition===c?600:400,transition:'background 0.1s'}}
              onMouseEnter={e=>(e.currentTarget.style.background=CONDITION_COLOR[c]+'10')}
              onMouseLeave={e=>(e.currentTarget.style.background=item.condition===c?CONDITION_COLOR[c]+'15':'transparent')}
            >{c}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoomInput({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  const [showCustom,setShowCustom] = useState(!ROOM_PRESETS.includes(value)&&value!=='')
  const [focused,setFocused] = useState(false)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {ROOM_PRESETS.map(r=>(
          <button key={r} onClick={()=>{onChange(r);setShowCustom(false)}} style={{padding:'4px 10px',borderRadius:20,fontSize:11,cursor:'pointer',fontFamily:"'Google Sans',sans-serif",border:`1px solid ${value===r?'var(--accent)':'var(--border-subtle)'}`,background:value===r?'var(--accent-dim)':'transparent',color:value===r?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>
            {r}
          </button>
        ))}
        <button onClick={()=>{setShowCustom(true);onChange('')}} style={{padding:'4px 10px',borderRadius:20,fontSize:11,cursor:'pointer',fontFamily:"'Google Sans',sans-serif",border:`1px solid ${showCustom?'var(--accent)':'var(--border-subtle)'}`,background:showCustom?'var(--accent-dim)':'transparent',color:showCustom?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>
          Άλλο...
        </button>
      </div>
      {showCustom&&(
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder="Πληκτρολογήστε δωμάτιο..." onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{background:'var(--bg-surface)',border:`1px solid ${focused?'var(--accent)':'var(--border-default)'}`,borderRadius:4,padding:'0 16px',height:40,color:'var(--text-primary)',fontSize:14,outline:'none',fontFamily:"'Roboto',sans-serif",width:'100%',boxSizing:'border-box'}}
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
            <button onClick={e=>{e.stopPropagation();onRemove(url)}} style={{position:'absolute',top:4,right:4,width:18,height:18,borderRadius:'50%',background:'rgba(197,34,31,0.9)',border:'none',color:'#fff',fontSize:10,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>×</button>
            {url===primary&&<div style={{position:'absolute',bottom:0,inset:'auto 0 0 0',background:'var(--accent)',fontSize:8,color:'var(--accent-text)',textAlign:'center',fontWeight:700,fontFamily:"'Google Sans',sans-serif",padding:'2px',letterSpacing:'0.5px'}}>ΚΥΡΙΑ</div>}
          </div>
        ))}
        <div onClick={()=>!uploading&&ref.current?.click()} style={{height:80,borderRadius:8,border:'1.5px dashed var(--border-accent)',background:'var(--accent-dim)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,cursor:uploading?'wait':'pointer'}}>
          <span style={{fontSize:12,color:'var(--accent)',fontFamily:"'Google Sans',sans-serif",fontWeight:500}}>{uploading?'...':'+ Φωτο'}</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
      {photos.length>1&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:6,fontFamily:"'Roboto',sans-serif"}}>Κλικ φωτογραφίας για κύρια</p>}
    </div>
  )
}

function QRModal({item,onClose}:{item:InventoryItem;onClose:()=>void}) {
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify({n:item.name,b:item.brand,m:item.model,sn:item.serial_number,cat:item.category,cond:item.condition,w:item.warranty_expiry}))}`
  const print = () => {
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>QR</title><style>body{font-family:'Google Sans',Roboto,sans-serif;padding:24px;text-align:center}@media print{button{display:none}}</style></head><body><h2>${item.name}</h2><img src="${qr}" width="180" height="180" style="margin:12px auto;display:block;border:1px solid #eee;padding:8px;border-radius:8px"/><button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer;border-radius:6px">Εκτύπωση</button></body></html>`)
    w.document.close()
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:28,padding:28,maxWidth:320,width:'100%',display:'flex',flexDirection:'column',gap:16,alignItems:'center',boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
          <p style={{fontSize:16,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>QR Αντικειμένου</p>
          <button onClick={onClose} style={{padding:'4px 12px',borderRadius:20,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer',fontFamily:"'Google Sans',sans-serif"}}>Κλείσιμο</button>
        </div>
        <div style={{background:'#fff',padding:12,borderRadius:12}}><img src={qr} width={200} height={200} alt="QR"/></div>
        <div style={{textAlign:'center'}}>
          <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
          <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{item.brand} {item.model}{item.serial_number?` · SN: ${item.serial_number}`:''}</p>
        </div>
        <button onClick={print} style={{width:'100%',padding:'10px',borderRadius:20,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Εκτύπωση Καρτέλας</button>
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
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:28,padding:28,width:'100%',maxWidth:600,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:18,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>Μαζική Εισαγωγή CSV</p>
          <button onClick={onClose} style={{width:36,height:36,borderRadius:18,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>
        {step==='upload'&&(
          <>
            <button onClick={downloadTemplate} style={{padding:'10px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Κατέβασμα Template</button>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}} style={{border:'2px dashed var(--border-accent)',borderRadius:12,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:'var(--accent-dim)'}}>
              <p style={{fontSize:14,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:8}}>Σύρτε ή κλικ για ανέβασμα CSV</p>
              <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>Μορφή: UTF-8 CSV</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
            {errors.length>0&&<div style={{padding:'10px 14px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>{errors.map((e,i)=><p key={i} style={{fontSize:11,color:'var(--negative)',fontFamily:"'Roboto',sans-serif"}}>{e}</p>)}</div>}
          </>
        )}
        {step==='preview'&&(
          <>
            <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>Βρέθηκαν <strong style={{color:'var(--text-primary)'}}>{rows.length} αντικείμενα</strong></p>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'var(--bg-elevated)'}}>{['Ονομασία','Κατηγορία','Κατάσταση','Αξία'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--text-secondary)',fontWeight:500,fontSize:10,fontFamily:"'Google Sans',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px'}}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0,15).map((r,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-subtle)'}}><td style={{padding:'7px 10px',color:'var(--text-primary)',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{r.name}</td><td style={{padding:'7px 10px',color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>{r.category}</td><td style={{padding:'7px 10px'}}><Badge label={r.condition||'—'} color={CONDITION_COLOR[r.condition||'']||'var(--text-tertiary)'}/></td><td style={{padding:'7px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)'}}>{r.purchase_value?fmtEur(r.purchase_value):'—'}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setStep('upload')} style={{padding:'9px 18px',borderRadius:20,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Πίσω</button>
              <button onClick={handleImport} disabled={importing} style={{padding:'9px 22px',borderRadius:20,background:importing?'var(--bg-elevated)':'var(--accent)',border:'none',color:importing?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:importing?'wait':'pointer'}}>{importing?'Εισαγωγή...':`Εισαγωγή ${rows.length} αντικειμένων`}</button>
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

function ItemFormModal({item,onSave,onClose}:{item?:InventoryItem|null;onSave:(d:Partial<InventoryItem>)=>void;onClose:()=>void}) {
  const [form,setForm] = useState<Partial<InventoryItem>>(item?{...item,photos:item.photos||[],tags:item.tags||[]}:{...EMPTY_ITEM})
  const [saving,setSaving] = useState(false)
  const [tab,setTab] = useState<'basic'|'finance'|'energy'|'smart'>('basic')
  const set = (k:keyof InventoryItem,v:any) => setForm(f=>({...f,[k]:v}))
  const isElectric = ['Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Θέρμανση & Ψύξη','Φωτιστικά'].includes(form.category||'')
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
  const TABS = [
    {key:'basic',label:'Βασικά'},
    {key:'finance',label:'Οικονομικά'},
    ...(isElectric?[{key:'energy',label:'Ενέργεια'},{key:'smart',label:'Smart'}]:[]),
  ] as {key:string;label:string}[]

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:'8px 16px'}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:28,width:'100%',maxWidth:680,height:'calc(100vh - 32px)',maxHeight:820,overflow:'hidden',padding:0,display:'flex',flexDirection:'column',boxShadow:'var(--shadow-xl)'}}>
        <div style={{padding:'22px 28px 0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <p style={{fontSize:22,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>{item?'Επεξεργασία Αντικειμένου':'Νέο Αντικείμενο'}</p>
              {item&&<p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Roboto',sans-serif"}}>{item.name}</p>}
            </div>
            <button onClick={onClose} style={{width:40,height:40,borderRadius:20,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>×</button>
          </div>
          <div style={{display:'flex',borderBottom:'1px solid var(--border-subtle)'}}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key as any)}
                style={{padding:'10px 16px',fontSize:13,fontWeight:tab===t.key?500:400,fontFamily:"'Google Sans',sans-serif",color:tab===t.key?'var(--accent)':'var(--text-secondary)',borderTop:'none',borderLeft:'none',borderRight:'none',borderBottom:`2px solid ${tab===t.key?'var(--accent)':'transparent'}`,background:'none',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',marginBottom:-1}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{padding:'20px 28px',display:'flex',flexDirection:'column',gap:18,flex:1,overflowY:'auto'}}>
          {tab==='basic'&&(
            <>
              <MultiPhotoUpload photos={form.photos||[]} primary={form.photo_url||''} onAdd={u=>set('photos',[...(form.photos||[]),u])} onRemove={u=>{const p=(form.photos||[]).filter(x=>x!==u);set('photos',p);if(form.photo_url===u)set('photo_url',p[0]||'')}} onSetPrimary={u=>set('photo_url',u)}/>
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
                <div><label style={labelStyle}>Λήξη Εγγύησης</label><DatePicker value={form.warranty_expiry||''} onChange={v=>set('warranty_expiry',v)}/></div>
              </div>
              <div>
                <label style={labelStyle}>Χώρος Τοποθέτησης</label>
                <RoomInput value={form.room||''} onChange={v=>set('room',v)}/>
              </div>
              <div>
                <label style={labelStyle}>Tags</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {AVAILABLE_TAGS.map(tag=>{
                    const active=(form.tags||[]).includes(tag)
                    return <button key={tag} onClick={()=>toggleTag(tag)} style={{padding:'4px 12px',borderRadius:20,fontSize:12,cursor:'pointer',fontFamily:"'Google Sans',sans-serif",fontWeight:active?500:400,border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`,background:active?'var(--accent-dim)':'none',color:active?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>{tag}</button>
                  })}
                </div>
              </div>
              <Textarea label="Σημειώσεις" value={form.notes||''} onChange={v=>set('notes',v)} placeholder="Παρατηρήσεις, ιστορικό, χαρακτηριστικά..." rows={2}/>
            </>
          )}
          {tab==='finance'&&(
            <>
              <div>
                <label style={labelStyle}>Προέλευση Αντικειμένου</label>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {PROVENANCE_OPTIONS.map(opt=>{
                    const active=form.provenance===opt.value
                    return (
                      <div key={opt.value} onClick={()=>set('provenance',opt.value)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`,background:active?'var(--accent-dim)':'var(--bg-elevated)',cursor:'pointer',transition:'all 0.15s'}}>
                        <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${active?'var(--accent)':'var(--border-default)'}`,background:active?'var(--accent)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {active&&<div style={{width:6,height:6,borderRadius:'50%',background:'var(--accent-text)'}}/>}
                        </div>
                        <span style={{fontSize:13,fontFamily:"'Roboto',sans-serif",color:active?'var(--accent)':'var(--text-primary)',fontWeight:active?500:400}}>{opt.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {(form.provenance==='new'||form.provenance==='discount')&&(
                <div style={{padding:'14px 16px',background:'var(--accent-dim)',borderRadius:12,border:'1px solid var(--border-accent)',display:'flex',flexDirection:'column',gap:12}}>
                  <p style={{fontSize:12,color:'var(--accent)',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>Στοιχεία Τιμής</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10}}>
                    <div><label style={labelStyle}>Αρχική Τιμή (€)</label><NumberInput value={String(form.original_price||0)} onChange={v=>set('original_price',parseFloat(v)||0)} suffix="€" min={0}/></div>
                    <div><label style={labelStyle}>Έκπτωση (%)</label><NumberInput value={String(form.discount_pct||0)} onChange={v=>set('discount_pct',parseFloat(v)||0)} suffix="%" min={0} max={100}/></div>
                  </div>
                  <div>
                    <label style={labelStyle}>Τελική Τιμή (€)</label>
                    {discountedPrice>0
                      ?<div style={{background:'var(--bg-elevated)',border:'1px solid var(--positive)',borderRadius:8,padding:'10px 14px',fontSize:16,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)',fontWeight:700}}>{fmtEur(discountedPrice)}</div>
                      :<NumberInput value={String(form.purchase_value||0)} onChange={v=>set('purchase_value',parseFloat(v)||0)} suffix="€" min={0}/>
                    }
                  </div>
                  {discountedPrice>0&&(form.original_price||0)>0&&(
                    <div style={{padding:'8px 12px',background:'var(--positive-dim)',borderRadius:8,border:'1px solid var(--positive-border)'}}>
                      <span style={{fontSize:12,color:'var(--positive)',fontFamily:"'Roboto',sans-serif"}}>Εξοικονόμηση: <strong style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEur((form.original_price||0)-discountedPrice)}</strong> ({form.discount_pct}% έκπτωση)</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
                {!(form.provenance==='new'||form.provenance==='discount')&&(
                  <div><label style={labelStyle}>Αξία Αγοράς / Εκτίμηση (€)</label><NumberInput value={String(form.purchase_value||0)} onChange={v=>set('purchase_value',parseFloat(v)||0)} suffix="€" min={0}/></div>
                )}
                <div>
                  <label style={labelStyle}>Κόστος Αντικατάστασης (€)</label>
                  <NumberInput value={String(form.replacement_cost||0)} onChange={v=>set('replacement_cost',parseFloat(v)||0)} suffix="€" min={0}/>
                  {replRange&&!form.replacement_cost&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:4,fontFamily:"'Roboto',sans-serif"}}>Εκτίμηση: {fmtEur(replRange.min)}–{fmtEur(replRange.max)}</p>}
                </div>
                <div><label style={labelStyle}>Ημερομηνία Αγοράς</label><DatePicker value={form.purchase_date||''} onChange={v=>{set('purchase_date',v);if(discountedPrice>0)set('purchase_value',discountedPrice)}}/></div>
                <div><label style={labelStyle}>Κατάστημα / Πηγή</label><TextInput value={form.store_vendor||''} onChange={v=>set('store_vendor',v)} placeholder="Παράδειγμα: Κωτσόβολος, Amazon"/></div>
                <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Αριθμός Απόδειξης / Τιμολόγιο</label><TextInput value={form.receipt_number||''} onChange={v=>set('receipt_number',v)} placeholder="Παράδειγμα: ΑΠΥ-2024-001"/></div>
              </div>
              {form.purchase_date&&form.purchase_value&&(
                <div style={{padding:'14px 16px',background:'var(--bg-elevated)',borderRadius:12,border:'1px solid var(--border-subtle)'}}>
                  <p style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Google Sans',sans-serif",marginBottom:12}}>Απόσβεση</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8}}>
                    {[
                      {label:'Τρέχουσα Αξία',value:fmtEur(calcCurrentValue({...form,id:'',user_id:''} as InventoryItem)),color:'var(--positive)'},
                      {label:'Απόσβεση',value:`${calcDepreciationPct({...form,id:'',user_id:''} as InventoryItem)}%`,color:'var(--warning)'},
                      {label:'Υπολ. Ζωή',value:`~${calcYearsLeft({...form,id:'',user_id:''} as InventoryItem)} χρόνια`,color:'var(--info)'},
                    ].map((k,i)=>(
                      <div key={i} style={{textAlign:'center',padding:10,background:'var(--bg-surface)',borderRadius:8}}>
                        <p style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,color:k.color,marginBottom:3}}>{k.value}</p>
                        <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:"'Google Sans',sans-serif"}}>{k.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {tab==='energy'&&(
            <>
              <div style={{padding:'10px 14px',background:'var(--info-dim)',borderRadius:10,border:'1px solid var(--info)'}}>
                <p style={{fontSize:12,color:'var(--info)',fontFamily:"'Roboto',sans-serif"}}>Βρείτε τα στοιχεία στην ετικέτα ενέργειας ή στο εγχειρίδιο.</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
                <div><label style={labelStyle}>Ενεργειακή Κλάση</label><CustomSelect value={form.energy_class||''} onChange={v=>set('energy_class',v)} options={[{value:'',label:'— Δεν γνωρίζω'},...ENERGY_CLASSES.map(c=>({value:c,label:c}))]}/></div>
                <div><label style={labelStyle}>Ισχύς Λειτουργίας (W)</label><NumberInput value={String(form.power_watts||0)} onChange={v=>set('power_watts',parseFloat(v)||0)} suffix="W" min={0}/></div>
                <div><label style={labelStyle}>Ώρες Χρήσης / Ημέρα</label><NumberInput value={String(form.daily_hours_use||0)} onChange={v=>set('daily_hours_use',parseFloat(v)||0)} suffix="ώρ/ημ" min={0} max={24}/></div>
                <div><label style={labelStyle}>Κατανάλωση Αναμονής (W)</label><NumberInput value={String(form.standby_watts||0)} onChange={v=>set('standby_watts',parseFloat(v)||0)} suffix="W" min={0}/></div>
              </div>
              {liveKwh>0&&(
                <div style={{background:'var(--bg-elevated)',borderRadius:12,padding:'14px 16px',border:'1px solid var(--border-subtle)'}}>
                  <p style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>Εκτιμώμενη Κατανάλωση</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:8}}>
                    {[{label:'kWh/μήνα',value:`${liveKwh.toFixed(1)}`},{label:'kWh/έτος',value:`${(liveKwh*12).toFixed(0)}`},{label:'Κόστος/μήνα',value:fmtEurC(liveKwh*0.22)},{label:'Κόστος/έτος',value:fmtEurC(liveKwh*0.22*12)}].map((k,i)=>(
                      <div key={i} style={{textAlign:'center',padding:'10px 6px',background:'var(--bg-surface)',borderRadius:8}}>
                        <p style={{fontSize:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:3}}>{k.value}</p>
                        <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:"'Google Sans',sans-serif"}}>{k.label}</p>
                      </div>
                    ))}
                  </div>
                  {form.energy_class&&!['A+++','A++','A+'].includes(form.energy_class)&&(
                    <div style={{marginTop:12,padding:'8px 12px',background:'var(--positive-dim)',borderRadius:8,border:'1px solid var(--positive-border)'}}>
                      <p style={{fontSize:12,color:'var(--positive)',fontFamily:"'Roboto',sans-serif"}}>Αναβάθμιση σε Α+++ → εκτιμ. εξοικονόμηση <strong>{fmtEurC(liveKwh*0.22*12*0.5)}–{fmtEurC(liveKwh*0.22*12*0.6)}/χρόνο</strong></p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {tab==='smart'&&(
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'var(--bg-elevated)',borderRadius:12,border:'1px solid var(--border-subtle)'}}>
                <div>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>Έξυπνη Συσκευή</p>
                  <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Roboto',sans-serif"}}>Συνδέεται με app, smart plug ή automation</p>
                </div>
                <Toggle on={form.smart_device||false} onChange={(v:boolean)=>set('smart_device',v)}/>
              </div>
              {form.smart_device&&(
                <div><label style={labelStyle}>App / Σύστημα Ελέγχου</label><TextInput value={form.smart_notes||''} onChange={v=>set('smart_notes',v)} placeholder="Παράδειγμα: Shelly 1PM + Home Assistant"/></div>
              )}
              <div style={{padding:'14px 16px',background:'var(--accent-dim)',borderRadius:12,border:'1px solid var(--border-accent)'}}>
                <p style={{fontSize:12,color:'var(--accent)',fontWeight:500,fontFamily:"'Google Sans',sans-serif",marginBottom:12}}>Προτεινόμενα Smart Devices</p>
                {[
                  {label:'Smart Plug με μέτρηση',desc:'Shelly Plug S, Tapo P115 — μέτρηση κατανάλωσης ανά συσκευή',saving:'έως 15% εξοικονόμηση'},
                  {label:'Smart Θερμοστάτης',desc:'Tado, Nest, Heatmiser — για κλιματισμό & θέρμανση',saving:'15-25% εξοικονόμηση'},
                  {label:'Home Assistant',desc:'Δωρεάν ενοποίηση, automation, dashboard για όλες τις συσκευές',saving:'Κεντρικός έλεγχος'},
                  {label:'Smart LED Φωτισμός',desc:'Philips Hue, IKEA TRÅDFRI — χρονοπρογράμματα & παρουσία',saving:'έως 80% λιγότερο'},
                ].map((tip,i)=>(
                  <div key={i} style={{display:'flex',gap:12,padding:'10px 0',borderBottom:i<3?'1px solid var(--border-subtle)':'none'}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',marginTop:5,flexShrink:0}}/>
                    <div>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2}}>{tip.label}</p>
                      <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:2,fontFamily:"'Roboto',sans-serif"}}>{tip.desc}</p>
                      <p style={{fontSize:11,color:'var(--positive)',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{tip.saving}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{padding:'16px 28px 24px',borderTop:'1px solid var(--border-subtle)',display:'flex',gap:10,justifyContent:'flex-end',flexShrink:0,background:'var(--bg-surface)'}}>
          <button onClick={onClose} style={{padding:'0 20px',height:40,borderRadius:20,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Ακύρωση</button>
          <button onClick={handleSave} disabled={saving} style={{padding:'0 24px',height:40,borderRadius:20,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:saving?'wait':'pointer',minWidth:120}}>
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
      await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Επισκευή: ${item.name}${form.technician?` (${form.technician})`:''}${form.description?` — ${form.description}`:''}`,amount:form.cost,category:'Συντήρηση & Επισκευές',expense_group:'maintenance',date:form.repair_date||new Date().toISOString().split('T')[0],paid_by:'owner',paid:true,notes:`Αυτόματη εισαγωγή από Απογραφή — ${item.name}`})
    }
    setForm({repair_date:'',cost:0,technician:'',description:''})
    setSaving(false)
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.32)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:28,width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',padding:28,display:'flex',flexDirection:'column',gap:16,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <p style={{fontSize:18,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>Επισκευές</p>
            <p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Roboto',sans-serif"}}>{item.name}</p>
          </div>
          <button onClick={onClose} style={{width:40,height:40,borderRadius:20,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>
        {totalCost>0&&curVal>0&&(
          <div style={{padding:'10px 14px',background:totalCost>curVal*0.5?'var(--negative-dim)':'var(--positive-dim)',borderRadius:10,border:`1px solid ${totalCost>curVal*0.5?'var(--negative-border)':'var(--positive-border)'}`}}>
            <p style={{fontSize:12,color:totalCost>curVal*0.5?'var(--negative)':'var(--positive)',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{totalCost>curVal*0.5?`Κόστος επισκευών ${fmtEur(totalCost)} > 50% τρέχουσας αξίας ${fmtEur(curVal)}`:`Επισκευές ${fmtEur(totalCost)} εντός ορίων vs αξία ${fmtEur(curVal)}`}</p>
          </div>
        )}
        <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
        {itemRepairs.length>0&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <SectionLabel label="Ιστορικό" right={<span style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--negative)'}}>{fmtEur(totalCost)}</span>}/>
            {itemRepairs.map(r=>(
              <div key={r.id} style={{background:'var(--bg-elevated)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--border-subtle)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>{r.description}</p>
                  <p style={{fontSize:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--negative)',fontWeight:700}}>{fmtEur(r.cost)}</p>
                </div>
                <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{fmtDate(r.repair_date)}{r.technician?` · ${r.technician}`:''}</p>
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
                  <button type="button" onClick={()=>setShowContactPicker(s=>!s)} style={{padding:'0 12px',height:40,borderRadius:8,border:'1px solid var(--border-subtle)',background:showContactPicker?'var(--accent-dim)':'var(--bg-elevated)',color:showContactPicker?'var(--accent)':'var(--text-secondary)',fontSize:12,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Επαφές</button>
                  {showContactPicker&&(
                    <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:12,padding:8,zIndex:700,minWidth:200,maxHeight:200,overflowY:'auto',boxShadow:'var(--shadow-lg)'}}>
                      <div style={{fontSize:10,color:'var(--text-secondary)',padding:'4px 8px 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Google Sans',sans-serif",borderBottom:'1px solid var(--border-subtle)',marginBottom:4}}>Επιλογή Επαφής</div>
                      {contacts.map(c=>(
                        <div key={c.id} onClick={()=>{setForm(f=>({...f,technician:c.full_name}));setShowContactPicker(false)}} style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:13,fontFamily:"'Roboto',sans-serif",color:'var(--text-primary)'}} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-elevated)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>{c.full_name}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Περιγραφή *</label><Textarea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="Τι επισκευάστηκε..." rows={2}/></div>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--positive-dim)',borderRadius:10,border:'1px solid var(--positive-border)'}}>
          <div>
            <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--positive)'}}>Καταχώρηση στις Δαπάνες</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>Αυτόματη εισαγωγή στο tab "Δαπάνες"</p>
          </div>
          <Toggle on={pushExpenses} onChange={setPushExpenses}/>
        </div>
        <button onClick={handleAdd} disabled={saving} style={{padding:'0 20px',height:40,borderRadius:20,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:saving?'wait':'pointer',alignSelf:'flex-end'}}>
          {saving?'Αποθήκευση...':'Καταχώρηση Επισκευής'}
        </button>
      </div>
    </div>
  )
}

function OverviewTab({items,repairs,kwhPrice}:{items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number}) {
  const totalPurchase = items.reduce((s,i)=>s+(i.purchase_value||0),0)
  const totalCurrent = items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairs = repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems = items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyCost = electricItems.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice),0)
  const byCategory = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
  const maxVal = Math.max(...byCategory.map(x=>x.val),1)
  const topEnergy = [...electricItems].sort((a,b)=>calcMonthlyCost(b,kwhPrice)-calcMonthlyCost(a,kwhPrice)).slice(0,5)
  const fullyDep = items.filter(i=>calcDepreciationPct(i)>=100&&i.purchase_date)
  const warrantySoon = items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90})
  const badCondition = items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας')
  const badEnergy = electricItems.filter(i=>!['A+++','A++','A+'].includes(i.energy_class||''))
  const potSavings = badEnergy.reduce((s,i)=>s+calcMonthlyCost(i,kwhPrice)*12*0.5,0)
  const totalDiscount = items.reduce((s,i)=>s+((i.original_price||0)-(i.purchase_value||0)),0)

  if(items.length===0) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',gap:20,textAlign:'center'}}>
      <div style={{width:72,height:72,borderRadius:18,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
      </div>
      <div>
        <p style={{fontSize:20,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:8}}>Ξεκινήστε την Απογραφή</p>
        <p style={{fontSize:14,color:'var(--text-secondary)',maxWidth:360,lineHeight:1.7,margin:'0 auto',fontFamily:"'Roboto',sans-serif"}}>Καταγράψτε τον εξοπλισμό για παρακολούθηση αξίας, ρεύματος και εγγυήσεων.</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12,maxWidth:480,width:'100%'}}>
        {[{t:'Πρόσθεσε Αντικείμενο',d:'Έπιπλα, συσκευές, ηλεκτρονικά'},{t:'Βάλε Κατανάλωση',d:'Υπολογισμός κόστους ρεύματος'},{t:'Ορίστε Εγγύηση',d:'Υπενθύμιση πριν λήξει'}].map((s,i)=>(
          <div key={i} style={{padding:'20px 14px',background:'var(--bg-elevated)',borderRadius:14,border:'1px solid var(--border-subtle)'}}>
            <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:4}}>{s.t}</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5,fontFamily:"'Roboto',sans-serif"}}>{s.d}</p>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))',gap:10}}>
        <StatCard label="Αντικείμενα" value={String(items.length)} sub={`${byCategory.length} κατηγορίες`}/>
        <StatCard label="Τρέχουσα Αξία" value={fmtEur(totalCurrent)} color="var(--positive)" sub="Μετά απόσβεση"/>
        <StatCard label="Ασφαλιστέα Αξία" value={fmtEur(Math.round(totalCurrent*1.1))} color="var(--info)" sub="+10% buffer"/>
        <StatCard label="Επισκευές" value={fmtEur(totalRepairs)} color="var(--warning)"/>
        {electricItems.length>0
          ?<StatCard label="Ρεύμα/Μήνα" value={fmtEurC(totalMonthlyCost)} color="var(--accent)" sub={`${Math.round(electricItems.reduce((s,i)=>s+calcMonthlyKwh(i),0))} kWh/μήνα`} accent/>
          :<StatCard label="Ρεύμα" value="—" sub="Πρόσθεσε Watt"/>
        }
      </div>
      {totalDiscount>0&&(
        <div style={{padding:'12px 16px',background:'var(--positive-dim)',borderRadius:12,border:'1px solid var(--positive-border)',display:'flex',alignItems:'center',gap:12}}>
          <div>
            <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--positive)'}}>Εξοικονόμηση από εκπτώσεις & μεταχειρισμένα: <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEur(totalDiscount)}</span></p>
            <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>Βάσει αρχικών τιμών vs τιμών αγοράς</p>
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
                  <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>{cat} <span style={{color:'var(--text-tertiary)',fontSize:10}}>({count})</span></span>
                  <span style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(val)}</span>
                </div>
                <div style={{height:4,background:'var(--border-subtle)',borderRadius:2}}><div style={{height:4,borderRadius:2,background:'var(--accent)',width:`${(val/maxVal)*100}%`,transition:'width 0.5s'}}/></div>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>Αξία Αγοράς (σύνολο)</span>
            <span style={{fontSize:11,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>{fmtEur(totalPurchase)}</span>
          </div>
        </div>
        <div style={cardStyle}>
          <SectionLabel label="Κατανάλωση Ρεύματος"/>
          {electricItems.length===0?(
            <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-tertiary)'}}>
              <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-secondary)',marginBottom:4}}>Δεν υπάρχουν δεδομένα</p>
              <p style={{fontSize:11,fontFamily:"'Roboto',sans-serif"}}>Πρόσθεσε Watt στις ηλεκτρικές συσκευές</p>
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
                        <span style={{fontSize:11,color:'var(--text-primary)',fontFamily:"'Roboto',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                      </div>
                      <span style={{fontSize:11,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--warning)',fontWeight:700,flexShrink:0}}>{fmtEurC(mc)}/μήνα</span>
                    </div>
                    <div style={{height:3,background:'var(--border-subtle)',borderRadius:2}}><div style={{height:3,borderRadius:2,background:'var(--warning)',width:`${maxMc>0?(mc/maxMc)*100:0}%`}}/></div>
                  </div>
                )
              })}
              {potSavings>0&&(
                <div style={{marginTop:12,padding:'8px 12px',background:'var(--positive-dim)',borderRadius:8,border:'1px solid var(--positive-border)'}}>
                  <p style={{fontSize:12,color:'var(--positive)',fontFamily:"'Roboto',sans-serif"}}>Αναβάθμιση {badEnergy.length} συσκευών → <strong style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEurC(potSavings)}/χρόνο</strong></p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12}}>
        {[
          {title:'Πλήρης Απόσβεση',color:'var(--negative)',items:fullyDep,render:(item:InventoryItem)=><span style={{fontSize:10,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--negative)'}}>{item.replacement_cost?fmtEur(item.replacement_cost):'—'}</span>},
          {title:'Εγγυήσεις ≤90 Μέρες',color:'var(--warning)',items:warrantySoon,render:(item:InventoryItem)=><Badge label={warrantyStatus(item.warranty_expiry).label} color={warrantyStatus(item.warranty_expiry).color}/>},
          {title:'Χρειάζονται Προσοχή',color:'var(--negative)',items:badCondition,render:(item:InventoryItem)=><Badge label={item.condition} color={CONDITION_COLOR[item.condition]}/>},
        ].map(({title,color,items:list,render})=>(
          <div key={title} style={{...cardStyle,border:`1px solid ${list.length>0?color+'25':'var(--border-subtle)'}`}}>
            <SectionLabel label={title} right={list.length>0?<Badge label={String(list.length)} color={color}/>:undefined}/>
            {list.length===0?<p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'12px 0',fontFamily:"'Roboto',sans-serif"}}>Κανένα</p>
              :<div style={{display:'flex',flexDirection:'column',gap:6}}>
                {list.slice(0,4).map(item=>(
                  <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-elevated)',borderRadius:8}}>
                    <span style={{fontSize:11,color:'var(--text-primary)',fontFamily:"'Google Sans',sans-serif",overflow:'hidden',textOverflow:'ellipsis',marginRight:8}}>{item.name}</span>
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

function ItemsTab({items,repairs,kwhPrice,onAdd,onEdit,onDelete,onRepair,onQR,onUpdateCondition}:{
  items:InventoryItem[];repairs:InventoryRepair[];kwhPrice:number
  onAdd:()=>void;onEdit:(i:InventoryItem)=>void;onDelete:(id:string)=>void
  onRepair:(i:InventoryItem)=>void;onQR:(i:InventoryItem)=>void
  onUpdateCondition:(id:string,c:string)=>void
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
  const toggleSort = (key:SortKey) => { if(sortKey===key)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortKey(key);setSortDir('desc')} }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:180}}><TextInput value={search} onChange={setSearch} placeholder="Αναζήτηση αντικειμένου, μάρκας..."/></div>
        <div style={{width:160}}><CustomSelect value={filterCat} onChange={setFilterCat} options={['Όλες',...['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].filter(c=>items.some(i=>i.category===c))].map(c=>({value:c,label:c==='Όλες'?'Όλες Κατηγορίες':c}))}/></div>
        {allRooms.length>0&&<div style={{width:140}}><CustomSelect value={filterRoom} onChange={setFilterRoom} options={[{value:'Όλα',label:'Όλα Δωμάτια'},...allRooms.map(r=>({value:r,label:r}))]}/></div>}
        {allTags.length>0&&<div style={{width:120}}><CustomSelect value={filterTag} onChange={setFilterTag} options={[{value:'Όλα',label:'Όλα Tags'},...allTags.map(t=>({value:t,label:t}))]}/></div>}
        <button onClick={()=>setShowNeedsAction(v=>!v)} style={{padding:'0 12px',height:36,borderRadius:18,fontSize:12,cursor:'pointer',fontFamily:"'Google Sans',sans-serif",fontWeight:500,border:`1px solid ${showNeedsAction?'var(--negative)':'var(--border-subtle)'}`,background:showNeedsAction?'var(--negative-dim)':'var(--bg-elevated)',color:showNeedsAction?'var(--negative)':'var(--text-secondary)',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}>
          Δράση {actionCount>0&&<span style={{background:'var(--negative)',color:'#fff',borderRadius:10,padding:'0 6px',fontSize:10,fontWeight:700}}>{actionCount}</span>}
        </button>
        <div style={{display:'flex',border:'1px solid var(--border-subtle)',borderRadius:20,overflow:'hidden',padding:2,background:'var(--bg-elevated)'}}>
          {(['grid','list'] as const).map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{padding:'6px 14px',fontSize:12,fontFamily:"'Google Sans',sans-serif",cursor:'pointer',border:'none',borderRadius:16,background:viewMode===m?'var(--accent)':'transparent',color:viewMode===m?'var(--accent-text)':'var(--text-secondary)',fontWeight:viewMode===m?500:400,transition:'all 0.15s'}}>{m==='grid'?'Κάρτες':'Λίστα'}</button>
          ))}
        </div>
        <button onClick={onAdd} style={{padding:'0 18px',height:36,borderRadius:18,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer',whiteSpace:'nowrap'}}>+ Νέο</button>
      </div>
      <div style={{display:'flex',gap:2,alignItems:'center',borderBottom:'1px solid var(--border-subtle)',paddingBottom:8}}>
        <span style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Google Sans',sans-serif",marginRight:8}}>Ταξινόμηση</span>
        {([['name','Όνομα'],['value','Αξία'],['energy','Ρεύμα/μήνα'],['age','Ηλικία'],['depreciation','Απόσβεση']] as [SortKey,string][]).map(([k,l])=>(
          <button key={k} onClick={()=>toggleSort(k)} style={{padding:'4px 12px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:sortKey===k?500:400,fontFamily:"'Google Sans',sans-serif",border:'none',borderBottom:`2px solid ${sortKey===k?'var(--accent)':'transparent'}`,background:'none',color:sortKey===k?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>
            {l} {sortKey===k?(sortDir==='asc'?'↑':'↓'):''}
          </button>
        ))}
        <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{filtered.length} αντικείμενα</span>
        <ExportButton disabled={filtered.length===0} onClick={()=>downloadCsv(
          `apografi_${new Date().toISOString().slice(0,10)}`,
          ['Αντικείμενο','Κατηγορία','Δωμάτιο','Μάρκα','Κατάσταση','Ημ. Αγοράς','Τιμή Αγοράς (€)','Τρέχουσα Αξία (€)','Εγγύηση έως'],
          filtered.map(item=>[
            item.name, item.category, item.room||'', item.brand||'', item.condition,
            csvDate(item.purchase_date), csvEur(item.purchase_value), csvEur(calcCurrentValue(item)), csvDate(item.warranty_expiry),
          ])
        )}/>
      </div>
      {filtered.length===0?(
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-tertiary)'}}>
          <p style={{fontSize:14,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-secondary)',marginBottom:4}}>{items.length===0?'Δεν έχεις καταχωρίσει αντικείμενα':'Δεν βρέθηκαν αποτελέσματα'}</p>
          <p style={{fontSize:12,fontFamily:"'Roboto',sans-serif"}}>{items.length===0?'Πάτησε «+ Νέο» για να ξεκινήσεις':'Δοκίμασε διαφορετικά φίλτρα'}</p>
        </div>
      ):viewMode==='grid'?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:16}}>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item); const left=calcYearsLeft(item)
            const mc=calcMonthlyCost(item,kwhPrice); const age=calcAgeDisplay(item.purchase_date)
            const photos=(item.photos||[]).filter(Boolean); const displayPhoto=item.photo_url||(photos[0]||'')
            const action=needsAction(item); const repairCost=repairs.filter(r=>r.item_id===item.id).reduce((s,r)=>s+(r.cost||0),0)
            return (
              <div key={item.id} style={{background:'var(--bg-surface)',border:`1px solid ${action?'rgba(227,116,0,0.4)':'var(--border-subtle)'}`,borderRadius:16,overflow:'hidden',display:'flex',flexDirection:'column',transition:'all 0.2s'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='var(--shadow-md)';(e.currentTarget as HTMLDivElement).style.borderColor=action?'rgba(227,116,0,0.6)':'var(--border-default)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.borderColor=action?'rgba(227,116,0,0.4)':'var(--border-subtle)'}}
              >
                <div style={{height:140,background:'var(--bg-elevated)',position:'relative',overflow:'hidden',flexShrink:0}}>
                  {displayPhoto
                    ?<img src={displayPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                    :<div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',opacity:0.2}}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                    </div>
                  }
                  <div style={{position:'absolute',top:10,left:10,display:'flex',gap:4}}>
                    <button onClick={()=>onQR(item)} style={{padding:'3px 8px',borderRadius:6,background:'rgba(0,0,0,0.6)',border:'none',color:'#fff',fontSize:10,cursor:'pointer',fontFamily:"'Google Sans',sans-serif",fontWeight:500,backdropFilter:'blur(4px)'}}>QR</button>
                    {photos.length>1&&<span style={{padding:'3px 7px',borderRadius:6,background:'rgba(0,0,0,0.6)',color:'#fff',fontSize:9,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>+{photos.length-1}</span>}
                  </div>
                  <div style={{position:'absolute',top:10,right:10,display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                    <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                    {item.smart_device&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'var(--accent)',color:'var(--accent-text)',fontWeight:700,fontFamily:"'Google Sans',sans-serif",letterSpacing:'0.5px'}}>SMART</span>}
                    {item.provenance&&item.provenance!=='new'&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'var(--info)',color:'#fff',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{provenanceLabel(item.provenance)}</span>}
                  </div>
                  {action&&<div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'var(--warning)'}}/>}
                </div>
                <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:10,flex:1}}>
                  <div>
                    <p style={{fontSize:14,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2,lineHeight:1.3}}>{item.name}</p>
                    <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{item.category}{item.room?` · ${item.room}`:''}{item.brand?` · ${item.brand}`:''}</p>
                    {age&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Roboto',sans-serif"}}>{age}</p>}
                  </div>
                  {(item.tags||[]).length>0&&(
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {(item.tags||[]).slice(0,3).map(t=><span key={t} style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:'var(--accent-dim)',color:'var(--accent)',border:'1px solid var(--border-accent)',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{t}</span>)}
                    </div>
                  )}
                  <DepBar pct={depPct} left={left}/>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8}}>
                    <div style={{padding:'9px 12px',background:'var(--bg-elevated)',borderRadius:10,textAlign:'center'}}>
                      <p style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--positive)',marginBottom:2}}>{fmtEur(curVal)}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:"'Google Sans',sans-serif"}}>Τρέχουσα αξία</p>
                    </div>
                    {mc>0?(
                      <div style={{padding:'9px 12px',background:'var(--bg-elevated)',borderRadius:10,textAlign:'center'}}>
                        <p style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--warning)',marginBottom:2}}>{fmtEurC(mc)}</p>
                        <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:"'Google Sans',sans-serif"}}>{calcMonthlyKwh(item)} kWh/μήνα</p>
                      </div>
                    ):(
                      <div onClick={()=>onEdit(item)} style={{padding:'9px 12px',background:'var(--accent-dim)',borderRadius:10,textAlign:'center',cursor:'pointer',border:'1px dashed var(--border-accent)'}}>
                        <p style={{fontSize:12,color:'var(--accent)',fontWeight:500,fontFamily:"'Google Sans',sans-serif",marginBottom:2}}>+ Watt</p>
                        <p style={{fontSize:9,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>Προσθήκη</p>
                      </div>
                    )}
                  </div>
                  {item.warranty_expiry
                    ?<div style={{fontSize:10,color:warrantyStatus(item.warranty_expiry).color,display:'flex',alignItems:'center',gap:4,fontFamily:"'Roboto',sans-serif"}}>Εγγύηση {warrantyStatus(item.warranty_expiry).label}</div>
                    :<div onClick={()=>onEdit(item)} style={{fontSize:10,color:'var(--text-tertiary)',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontFamily:"'Roboto',sans-serif"}}><span style={{color:'var(--accent)'}}>+</span> Προσθήκη εγγύησης</div>
                  }
                  {repairCost>0&&<div style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>Επισκευές: <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--warning)'}}>{fmtEur(repairCost)}</span></div>}
                  <div style={{display:'flex',gap:6,paddingTop:8,borderTop:'1px solid var(--border-subtle)'}}>
                    <button onClick={()=>onEdit(item)} style={{flex:1,padding:'7px 0',borderRadius:18,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,fontFamily:"'Google Sans',sans-serif",cursor:'pointer',transition:'all 0.15s',fontWeight:500}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='var(--accent)';(e.currentTarget as HTMLButtonElement).style.color='var(--accent)'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='var(--border-subtle)';(e.currentTarget as HTMLButtonElement).style.color='var(--text-secondary)'}}
                    >Επεξεργασία</button>
                    <button onClick={()=>onRepair(item)} style={{padding:'7px 10px',borderRadius:18,border:'1px solid var(--border-subtle)',background:'none',color:'var(--warning)',fontSize:12,cursor:'pointer',fontFamily:"'Google Sans',sans-serif"}}>Επισκ.</button>
                    <button onClick={()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}} style={{padding:'7px 10px',borderRadius:18,border:'1px solid var(--negative-border)',background:'none',color:'var(--negative)',fontSize:12,cursor:'pointer'}}>×</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ):(
        <div style={{overflowX:'auto',margin:'0 -4px',WebkitOverflowScrolling:'touch'}}>
        <div style={{display:'flex',flexDirection:'column',gap:1,background:'var(--bg-surface)',borderRadius:12,border:'1px solid var(--border-subtle)',overflow:'hidden',minWidth:620}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 70px 90px 100px auto',gap:8,padding:'10px 16px',borderBottom:'2px solid var(--border-subtle)',background:'var(--bg-elevated)'}}>
            {['Αντικείμενο','Κατηγορία','Κλάση','Αξία','Ρεύμα/μήνα',''].map(h=><p key={h} style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{h}</p>)}
          </div>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const mc=calcMonthlyCost(item,kwhPrice); const age=calcAgeDisplay(item.purchase_date)
            return (
              <div key={item.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 70px 90px 100px auto',gap:8,padding:'12px 16px',background:needsAction(item)?'var(--warning-dim)':'var(--bg-surface)',borderBottom:'1px solid var(--border-subtle)',alignItems:'center',transition:'background 0.15s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background='var(--bg-elevated)'}
                onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background=needsAction(item)?'var(--warning-dim)':'var(--bg-surface)'}
              >
                <div>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif",marginBottom:4}}>{item.brand?`${item.brand} · `:''}{item.room||''}{age?` · ${age}`:''}</p>
                  {(item.tags||[]).length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:4}}>{(item.tags||[]).map(t=><span key={t} style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:'var(--accent-dim)',color:'var(--accent)',fontFamily:"'Google Sans',sans-serif"}}>{t}</span>)}</div>}
                  <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
                </div>
                <p style={{fontSize:11,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>{item.category}</p>
                <div>{item.energy_class?<EnergyBadge cls={item.energy_class}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                <p style={{fontSize:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)',fontWeight:700}}>{fmtEur(curVal)}</p>
                <div>{mc>0?<p style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--warning)',fontWeight:700}}>{fmtEurC(mc)}</p>:<button onClick={()=>onEdit(item)} style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:0,fontFamily:"'Google Sans',sans-serif"}}>+ Watt</button>}</div>
                <div style={{display:'flex',gap:4,alignItems:'center'}}>
                  <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                  <button onClick={()=>onQR(item)} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:9,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>QR</button>
                  <button onClick={()=>onEdit(item)} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>Επεξ.</button>
                  <button onClick={()=>onRepair(item)} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--warning)',fontSize:11,cursor:'pointer',fontFamily:"'Google Sans',sans-serif"}}>Επισκ.</button>
                  <button onClick={()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--negative-border)',background:'none',color:'var(--negative)',fontSize:11,cursor:'pointer'}}>×</button>
                </div>
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
    await supabase.from('calendar_events').insert({property_id:propertyId,user_id:userId,title:`Εγγύηση: ${item.name}`,description:`Λήγει ${fmtDate(item.warranty_expiry)}`,event_date:item.warranty_expiry,event_type:'reminder',priority:daysUntil(item.warranty_expiry)<=30?'high':'medium'})
    setPushed(p=>new Set(p).add(item.id))
    setPushing(null)
  }
  const WSection = ({title,color,list}:{title:string;color:string;list:InventoryItem[]}) => list.length===0?null:(
    <div style={{background:'var(--bg-elevated)',border:`1px solid ${color}25`,borderRadius:12,padding:16}}>
      <SectionLabel label={title} right={<Badge label={String(list.length)} color={color}/>}/>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {list.map(item=>{const ws=warrantyStatus(item.warranty_expiry);return(
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:10,alignItems:'center',padding:'10px 12px',background:'var(--bg-surface)',borderRadius:10}}>
            <div>
              <p style={{fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
              <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{item.brand}{item.model?` ${item.model}`:''} · {item.category}</p>
            </div>
            {item.serial_number&&<p style={{fontSize:10,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>SN: {item.serial_number}</p>}
            <Badge label={ws.label} color={ws.color}/>
            {daysUntil(item.warranty_expiry)>=0&&daysUntil(item.warranty_expiry)<=90&&(
              <button onClick={()=>pushCal(item)} disabled={pushing===item.id||pushed.has(item.id)} style={{padding:'5px 10px',borderRadius:16,border:`1px solid ${pushed.has(item.id)?'var(--positive)':'var(--border-subtle)'}`,background:pushed.has(item.id)?'var(--positive-dim)':'none',color:pushed.has(item.id)?'var(--positive)':'var(--text-secondary)',fontSize:11,fontFamily:"'Google Sans',sans-serif",cursor:'pointer',whiteSpace:'nowrap'}}>
                {pushing===item.id?'...':pushed.has(item.id)?'✓ Προστέθηκε':'Ημ/λόγιο'}
              </button>
            )}
          </div>
        )})}
      </div>
    </div>
  )
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12}}>
        <StatCard label="Ληγμένες" value={String(expired.length)} color="var(--negative)"/>
        <StatCard label="Λήγουν ≤90 Μέρες" value={String(soon.length)} color="var(--warning)"/>
        <StatCard label="Σε Ισχύ" value={String(valid.length)} color="var(--positive)"/>
      </div>
      {soon.length>0&&<div style={{padding:'10px 14px',background:'var(--warning-dim)',borderRadius:10,border:'1px solid var(--warning-border)'}}><p style={{fontSize:12,color:'var(--warning)',fontFamily:"'Roboto',sans-serif"}}>Κλικ "Ημ/λόγιο" για υπενθύμιση πριν λήξουν.</p></div>}
      <WSection title="Λήγουν Σύντομα (≤90 Μέρες)" color="var(--warning)" list={soon}/>
      <WSection title="Ληγμένες" color="var(--negative)" list={expired}/>
      <WSection title="Σε Ισχύ" color="var(--positive)" list={valid}/>
      {withW.length===0&&<div style={{textAlign:'center',padding:'60px 0'}}><p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>Δεν έχεις καταχωρίσει ημερομηνίες εγγύησης</p></div>}
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
    w.document.write(`<html><head><title>Πρωτόκολλο</title><style>body{font-family:'Google Sans',Arial;font-size:12px;margin:30px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f4f4f4;padding:8px;text-align:left;font-size:10px;border-bottom:2px solid #ddd}td{padding:8px;border-bottom:1px solid #eee}.sig{margin-top:48px;display:flex;gap:60px}.sig-box{flex:1;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#666}@media print{button{display:none}}</style></head><body>
    <h1>Πρωτόκολλο ${h.handover_type==='check_in'?'Παράδοσης':'Παραλαβής'}</h1>
    <p><strong>${h.tenant_name}</strong>${h.tenant_phone?` · ${h.tenant_phone}`:''} · ${fmtDate(h.handover_date)}</p>
    <table><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κατάσταση</th><th>Παρατηρήσεις</th></tr></thead><tbody>
    ${snap.map(s=>`<tr><td>${s.name}</td><td>${s.category}</td><td>${s.condition_at_handover}</td><td>${s.condition_notes||'—'}</td></tr>`).join('')}
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
          <p style={{fontSize:18,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>Σύγκριση Πρωτοκόλλων</p>
          <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:36,borderRadius:18,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Πίσω</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
          {[{v:cmpA,sv:setCmpA},{v:cmpB,sv:setCmpB}].map(({v,sv},i)=>(
            <div key={i}>
              <label style={labelStyle}>Πρωτόκολλο {i===0?'Α':'Β'}</label>
              <CustomSelect value={v} onChange={sv} options={[{value:'',label:'— Επιλέξτε'},...handovers.filter(h=>i===0||h.id!==cmpA).map(h=>({value:h.id,label:`${h.handover_type==='check_in'?'Check-In':'Check-Out'} · ${h.tenant_name} · ${fmtDate(h.handover_date)}`}))]}/>
            </div>
          ))}
        </div>
        {hA&&hB&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'8px 14px',borderBottom:'2px solid var(--border-subtle)'}}>
              {['Αντικείμενο',`${hA.handover_type==='check_in'?'Check-In':'Check-Out'} · ${hA.tenant_name}`,`${hB.handover_type==='check_in'?'Check-In':'Check-Out'} · ${hB.tenant_name}`].map(h=><p key={h} style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Google Sans',sans-serif"}}>{h}</p>)}
            </div>
            {allNames.map(name=>{
              const sA=hA.items_snapshot?.find(s=>s.name===name); const sB=hB.items_snapshot?.find(s=>s.name===name)
              const cA=sA?.condition_at_handover||'—'; const cB=sB?.condition_at_handover||'—'
              const degraded=cA!==cB&&cA!=='—'&&cB!=='—'&&condOrder.indexOf(cB)>condOrder.indexOf(cA)
              return (
                <div key={name} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'10px 14px',background:degraded?'var(--negative-dim)':'var(--bg-elevated)',borderRadius:8,marginBottom:4,border:`1px solid ${degraded?'var(--negative-border)':'var(--border-subtle)'}`}}>
                  <p style={{fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>{name}{degraded&&<span style={{fontSize:10,color:'var(--negative)',marginLeft:6}}>↓</span>}</p>
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
        <p style={{fontSize:18,fontWeight:400,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>Νέο Πρωτόκολλο Παράδοσης</p>
        <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:36,borderRadius:18,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Πίσω</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10}}>
        {(['check_in','check_out'] as const).map(t=>(
          <button key={t} onClick={()=>setType(t)} style={{padding:'14px',borderRadius:12,cursor:'pointer',fontWeight:500,fontFamily:"'Google Sans',sans-serif",fontSize:13,border:`1px solid ${type===t?'var(--accent)':'var(--border-subtle)'}`,background:type===t?'var(--accent)':'var(--bg-elevated)',color:type===t?'var(--accent-text)':'var(--text-secondary)',transition:'all 0.2s'}}>
            {t==='check_in'?'Check-In — Είσοδος':'Check-Out — Έξοδος'}
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
        <SectionLabel label="Κατάσταση Αντικειμένων" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{items.length} αντικείμενα</span>}/>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {items.map(item=>(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'auto 1fr 160px 1fr',gap:12,alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
              <div style={{width:44,height:44,background:'var(--bg-surface)',borderRadius:8,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {item.photo_url?<img src={item.photo_url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
              </div>
              <div>
                <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>{item.name}</p>
                <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{item.category}{item.room?` · ${item.room}`:''}</p>
              </div>
              <CustomSelect value={itemConds[item.id]?.condition||item.condition} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],condition:v}}))} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
              <TextInput value={itemConds[item.id]?.notes||''} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],notes:v}}))} placeholder="Παρατηρήσεις..."/>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
        <button onClick={()=>setMode('list')} style={{padding:'0 20px',height:40,borderRadius:20,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:13,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Ακύρωση</button>
        <button onClick={handleSave} disabled={saving} style={{padding:'0 24px',height:40,borderRadius:20,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:saving?'wait':'pointer'}}>
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
          {handovers.length>=2&&<button onClick={()=>setMode('compare')} style={{padding:'0 14px',height:36,borderRadius:18,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontFamily:"'Google Sans',sans-serif",fontWeight:500,cursor:'pointer'}}>Σύγκριση</button>}
          <button onClick={()=>setMode('new')} style={{padding:'0 18px',height:36,borderRadius:18,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>+ Νέο Πρωτόκολλο</button>
        </div>
      </div>
      {handovers.length===0
        ?<div style={{textAlign:'center',padding:'60px 0'}}><p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif"}}>Δεν υπάρχουν πρωτόκολλα</p></div>
        :<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {handovers.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map(h=>{
            const snap=h.items_snapshot||[]; const bad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:bad>0?12:0}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <Badge label={h.handover_type==='check_in'?'Check-In':'Check-Out'} color={h.handover_type==='check_in'?'var(--positive)':'var(--info)'}/>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)'}}>{h.tenant_name}</p>
                    </div>
                    <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{fmtDate(h.handover_date)}{h.tenant_phone?` · ${h.tenant_phone}`:''} · {snap.length} αντικείμενα</p>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {bad>0&&<Badge label={`${bad} προβλήματα`} color="var(--negative)"/>}
                    <button onClick={()=>printHandover(h)} style={{padding:'0 12px',height:32,borderRadius:16,border:'1px solid var(--border-subtle)',background:'none',color:'var(--accent)',fontSize:12,fontFamily:"'Google Sans',sans-serif",cursor:'pointer',fontWeight:500}}>Εκτύπωση</button>
                  </div>
                </div>
                {bad>0&&(
                  <div style={{padding:'8px 12px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>
                    {snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').map((s,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)',fontFamily:"'Roboto',sans-serif",padding:'2px 0'}}>
                        <span>{s.name}</span><span style={{color:'var(--negative)'}}>{s.condition_at_handover}{s.condition_notes?` — ${s.condition_notes}`:''}</span>
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
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Συντήρηση: ${s.task}${s.item_name?` — ${s.item_name}`:''}`,amount:0,category:'Συντήρηση & Επισκευές',expense_group:'maintenance',date:today,paid_by:'owner',paid:true,notes:'Αυτόματη εισαγωγή από Συντήρηση'})
    onSaved()
  }
  const deleteSched=async(id:string)=>{await supabase.from('inventory_maintenance').delete().eq('id',id);onSaved()}
  const pushCal=async(s:MaintenanceSchedule)=>{await supabase.from('calendar_events').insert({property_id:propertyId,user_id:userId,title:`Συντήρηση: ${s.task}${s.item_name?` — ${s.item_name}`:''}`,event_date:s.next_due,event_type:'maintenance',priority:'medium'});setPushed(p=>new Set(p).add(s.id))}
  const addSuggested=async(s:{task:string;interval_months:number;category:string})=>{
    const matching=items.filter(i=>i.category===s.category)
    const inserts=matching.length>0?matching.map(item=>({property_id:propertyId,user_id:userId,item_id:item.id,item_name:item.name,task:s.task,interval_months:s.interval_months,last_done:'',next_due:addMonths('',s.interval_months),notes:''})):[{property_id:propertyId,user_id:userId,item_id:'',item_name:'',task:s.task,interval_months:s.interval_months,last_done:'',next_due:addMonths('',s.interval_months),notes:''}]
    await supabase.from('inventory_maintenance').insert(inserts);onSaved()
  }
  const handleSave=async()=>{
    if(!form.task.trim()){alert('Η εργασία είναι υποχρεωτική.');return}
    setSaving(true)
    await supabase.from('inventory_maintenance').insert({property_id:propertyId,user_id:userId,item_id:form.item_id||'',item_name:form.item_name,task:form.task,interval_months:form.interval_months,last_done:form.last_done,next_due:addMonths(form.last_done,form.interval_months),notes:form.notes})
    if(form.last_done){await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Συντήρηση: ${form.task}${form.item_name?` — ${form.item_name}`:''}`,amount:0,category:'Συντήρηση & Επισκευές',expense_group:'maintenance',date:form.last_done,paid_by:'owner',paid:true,notes:'Αυτόματη εισαγωγή από Συντήρηση'})}
    setAdding(false);setForm({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:''});setSaving(false);onSaved()
  }
  const SchedRow=({s}:{s:MaintenanceSchedule})=>{
    const days=daysUntil(s.next_due); const c=days<0?'var(--negative)':days<=30?'var(--warning)':'var(--positive)'
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:10,border:`1px solid ${days<0?'var(--negative-border)':days<=30?'var(--warning-border)':'var(--border-subtle)'}`}}>
        <div>
          <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2}}>{s.task}</p>
          <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>{s.item_name||'Γενική'} · κάθε {s.interval_months} μήνες{s.last_done?` · Τελ: ${fmtDate(s.last_done)}`:''}</p>
        </div>
        <Badge label={days<0?`${Math.abs(days)} ημ. καθυστ.`:days===0?'Σήμερα!':`${days} ημ.`} color={c}/>
        <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>→ {fmtDate(s.next_due)}</span>
        <button onClick={()=>markDone(s)} style={{padding:'0 10px',height:32,borderRadius:16,border:'1px solid var(--positive-border)',background:'var(--positive-dim)',color:'var(--positive)',fontSize:11,fontFamily:"'Google Sans',sans-serif",cursor:'pointer',fontWeight:500,whiteSpace:'nowrap'}}>Έγινε</button>
        <div style={{display:'flex',gap:4}}>
          <button onClick={()=>pushCal(s)} style={{padding:'0 8px',height:32,borderRadius:16,border:`1px solid ${pushed.has(s.id)?'var(--positive)':'var(--border-subtle)'}`,background:pushed.has(s.id)?'var(--positive-dim)':'none',color:pushed.has(s.id)?'var(--positive)':'var(--text-secondary)',fontSize:11,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>{pushed.has(s.id)?'✓':'Ημ/λόγ.'}</button>
          <button onClick={()=>{if(confirm('Διαγραφή;'))deleteSched(s.id)}} style={{width:32,height:32,borderRadius:16,border:'1px solid var(--negative-border)',background:'none',color:'var(--negative)',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <SectionLabel label="Πρόγραμμα Συντήρησης"/>
        <button onClick={()=>setAdding(true)} style={{padding:'0 18px',height:36,borderRadius:18,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>+ Νέα Εργασία</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12}}>
        <StatCard label="Σε Καθυστέρηση" value={String(overdue.length)} color="var(--negative)"/>
        <StatCard label="Επόμενες 30 Μέρες" value={String(soon.length)} color="var(--warning)"/>
        <StatCard label="Προγραμματισμένες" value={String(upcoming.length)} color="var(--positive)"/>
      </div>
      {schedules.length===0&&(
        <div style={cardStyle}>
          <SectionLabel label="Προτεινόμενες Εργασίες"/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8}}>
            {DEFAULT_MAINTENANCE.map((s,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10}}>
                <div>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:2}}>{s.task}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif"}}>κάθε {s.interval_months} μήνες · {s.category}</p>
                </div>
                <button onClick={()=>addSuggested(s)} style={{padding:'0 12px',height:32,borderRadius:16,border:'1px solid var(--border-accent)',background:'var(--accent-dim)',color:'var(--accent)',fontSize:11,fontFamily:"'Google Sans',sans-serif",fontWeight:500,cursor:'pointer',whiteSpace:'nowrap'}}>+ Προσθήκη</button>
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
            <button onClick={()=>setAdding(false)} style={{padding:'0 16px',height:36,borderRadius:18,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Ακύρωση</button>
            <button onClick={handleSave} disabled={saving} style={{padding:'0 20px',height:36,borderRadius:18,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση...':'Αποθήκευση'}</button>
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
    const csv=[headers,...rows].map(row=>row.map(cell=>`"${String(cell||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));a.download='απογραφη.csv';a.click()
  }
  const exportPDF=()=>{
    const byCat=['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά'].map(cat=>{const ci=items.filter(i=>i.category===cat);return{cat,count:ci.length,val:ci.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>Απογραφή</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Google Sans',Roboto,Arial;font-size:11px;color:#111;padding:32px}h1{font-size:22px;font-weight:400;margin-bottom:4px}.sub{color:#666;margin-bottom:24px;font-size:12px}.kpis{display:flex;gap:12px;margin-bottom:28px}.kpi{flex:1;background:#f8f8f8;border-radius:8px;padding:14px}.kpi-v{font-size:18px;font-weight:700;font-family:'Roboto Mono',monospace;margin-bottom:2px}.kpi-l{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888}h2{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #eee}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f4f4f4;padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:7px 8px;border-bottom:1px solid #f0f0f0;font-size:11px}.footer{margin-top:40px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center}@media print{button{display:none}}</style></head><body>
    <h1>Απογραφή Ακινήτου</h1><div class="sub">${new Date().toLocaleDateString('el-GR')} · ${items.length} αντικείμενα</div>
    <div class="kpis"><div class="kpi"><div class="kpi-v">${fmtEur(totalCurrent)}</div><div class="kpi-l">Τρέχουσα Αξία</div></div><div class="kpi"><div class="kpi-v">${fmtEur(Math.round(totalCurrent*1.1))}</div><div class="kpi-l">Ασφαλιστέα (+10%)</div></div><div class="kpi"><div class="kpi-v">${fmtEur(totalRepairs)}</div><div class="kpi-l">Επισκευές</div></div>${electricItems.length>0?`<div class="kpi"><div class="kpi-v">${fmtEurC(totalMonthlyCost)}</div><div class="kpi-l">Ρεύμα/Μήνα</div></div>`:''}</div>
    <h2>Ανά Κατηγορία</h2>${byCat.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0"><span>${cat} (${count})</span><strong>${fmtEur(val)}</strong></div>`).join('')}
    <h2>Αναλυτική Κατάλογος</h2><table><thead><tr><th>Αντικείμενο</th><th>Κλάση</th><th>Κατάσταση</th><th>Προέλευση</th><th>Αξία Αγοράς</th><th>Τρέχουσα</th><th>Απόσβεση</th><th>kWh/μήνα</th><th>Εγγύηση</th></tr></thead><tbody>
    ${items.map(i=>`<tr><td><strong>${i.name}</strong>${i.brand?`<br><small style="color:#888">${i.brand} ${i.model||''}</small>`:''}</td><td>${i.energy_class||'—'}</td><td>${i.condition}</td><td>${provenanceLabel(i.provenance)||'Νέο'}</td><td style="font-family:monospace">${i.purchase_value?fmtEur(i.purchase_value):'—'}</td><td style="font-family:monospace;font-weight:bold">${fmtEur(calcCurrentValue(i))}</td><td>${calcDepreciationPct(i)}%</td><td>${calcMonthlyKwh(i)>0?calcMonthlyKwh(i)+' kWh':'—'}</td><td>${i.warranty_expiry?fmtDate(i.warranty_expiry):'—'}</td></tr>`).join('')}
    </tbody></table><div class="footer">Property OS · ${new Date().toLocaleDateString('el-GR')}</div>
    <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer;border-radius:6px">Εκτύπωση</button></body></html>`)
    w.document.close()
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <SectionLabel label="Εξαγωγές Δεδομένων"/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16}}>
        {[
          {title:'Απογραφή PDF',desc:'Πλήρης έκθεση με αξίες, ενεργειακές κλάσεις, ηλικία, tags, προέλευση και εγγυήσεις.',fn:exportPDF,primary:true},
          {title:'Εξαγωγή CSV',desc:'Excel-συμβατό αρχείο με όλα τα πεδία — ιδανικό για λογιστή ή αρχειοθέτηση.',fn:exportCSV,primary:false},
        ].map(({title,desc,fn,primary})=>(
          <div key={title} style={cardStyle}>
            <div style={{textAlign:'center',marginBottom:14}}>
              <p style={{fontSize:15,fontWeight:500,fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',marginBottom:6}}>{title}</p>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Roboto',sans-serif"}}>{desc}</p>
            </div>
            <div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:8,fontSize:12,color:'var(--text-tertiary)',fontFamily:"'Roboto',sans-serif",marginBottom:14}}>
              <p>{items.length} αντικείμενα · <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)'}}>{fmtEur(totalCurrent)}</span></p>
              {electricItems.length>0&&<p>Ρεύμα: <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--warning)'}}>{fmtEurC(totalMonthlyCost)}</span>/μήνα</p>}
            </div>
            <button onClick={fn} style={{width:'100%',padding:'0 0',height:40,borderRadius:20,background:primary?'var(--accent)':'var(--bg-elevated)',border:primary?'none':'1px solid var(--border-default)',color:primary?'var(--accent-text)':'var(--text-primary)',fontSize:13,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>{title}</button>
          </div>
        ))}
      </div>
      <div style={{padding:'14px 16px',background:'var(--info-dim)',borderRadius:12,border:'1px solid var(--info)'}}>
        <p style={{fontSize:12,color:'var(--info)',fontWeight:500,fontFamily:"'Google Sans',sans-serif",marginBottom:4}}>Ασφάλιση Περιεχομένου</p>
        <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Roboto',sans-serif"}}>Ασφαλιστέα αξία: <strong style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--info)'}}>{fmtEur(Math.round(totalCurrent*1.1))}</strong> (τρέχουσα +10% buffer για αντικατάσταση).</p>
      </div>
    </div>
  )
}

export default function TabInventory({propertyId,userId}:TabInventoryProps) {
  const [activeTab,setActiveTab] = useState<'overview'|'items'|'warranties'|'handover'|'maintenance'|'exports'>('overview')
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
      const loadedItems=iR.data.map((i:any)=>({...i,photos:i.photos||[],tags:i.tags||[]}))
      setItems(loadedItems)
      for(const item of loadedItems){
        const dep=calcDepreciationPct(item as InventoryItem)
        const warranty=daysUntil(item.warranty_expiry)
        if(dep>=100&&item.purchase_date){
          await supabase.from('calendar_events').upsert({property_id:propertyId,user_id:userId,title:`Αντικατάσταση: ${item.name}`,description:`Πλήρης απόσβεση — εκτιμ. κόστος ${item.replacement_cost?fmtEur(item.replacement_cost):'άγνωστο'}`,event_date:new Date().toISOString().split('T')[0],event_type:'reminder',priority:'medium'},{onConflict:'property_id,title'})
        }
        if(warranty>=0&&warranty<=30&&item.warranty_expiry){
          await supabase.from('calendar_events').upsert({property_id:propertyId,user_id:userId,title:`Εγγύηση λήγει: ${item.name}`,description:`Λήγει ${fmtDate(item.warranty_expiry)}`,event_date:item.warranty_expiry,event_type:'reminder',priority:'high'},{onConflict:'property_id,title'})
        }
      }
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

  const TABS=[
    {key:'overview',label:'Επισκόπηση'},
    {key:'items',label:'Αντικείμενα'},
    {key:'warranties',label:'Εγγυήσεις'},
    {key:'handover',label:'Παράδοση'},
    {key:'maintenance',label:'Συντήρηση'},
    {key:'exports',label:'Εξαγωγές'},
  ] as const

  const overdueCount=schedules.filter(s=>daysUntil(s.next_due)<0).length
  const warnCount=schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30}).length
  const actionCount=items.filter(needsAction).length
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

      <PageTitle
        title="Απογραφή"
        sub="Διαχείριση εξοπλισμού, αξίας, ρεύματος, εγγυήσεων και παράδοσης"
        right={<>
          <button onClick={()=>setShowBulkImport(true)} style={{padding:'0 12px',height:36,borderRadius:18,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontWeight:500,fontFamily:"'Google Sans',sans-serif",cursor:'pointer'}}>Μαζική Εισαγωγή</button>
          <div style={{display:'flex',alignItems:'center',background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:8,overflow:'hidden'}}>
            <span style={{padding:'0 10px',fontSize:10,color:'var(--text-tertiary)',borderRight:'1px solid var(--border-subtle)',alignSelf:'stretch',display:'flex',alignItems:'center',whiteSpace:'nowrap',letterSpacing:'0.5px',textTransform:'uppercase',fontFamily:"'Google Sans',sans-serif"}}>kWh €</span>
            <input type="text" inputMode="decimal" value={kwInput}
              onChange={e=>{const raw=e.target.value.replace(',','.');setKwInput(raw);if(/^\d*\.?\d*$/.test(raw)&&raw!=='')setKwhPrice(parseFloat(raw)||0)}}
              onFocus={e=>{if(kwInput==='0')setKwInput('');e.target.select()}}
              onBlur={()=>{const n=parseFloat(kwInput);if(isNaN(n)||kwInput===''){setKwInput('0.22');setKwhPrice(0.22);saveKwh(0.22)}else{setKwInput(String(n));setKwhPrice(n);saveKwh(n)}}}
              style={{width:60,background:'transparent',border:'none',outline:'none',padding:'8px 10px',fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',textAlign:'right'}}
            />
          </div>
        </>}
      />

      {!loading&&(items.length===0
        ? <InfoBanner tone="info">Δεν υπάρχουν ακόμη αντικείμενα στην απογραφή. Πρόσθεσε το πρώτο αντικείμενο ή χρησιμοποίησε τη Μαζική Εισαγωγή για να ξεκινήσεις.</InfoBanner>
        : <>
            <KPIGrid items={[
              {label:'Σύνολο Αντικειμένων',value:fn(items.length)},
              {label:'Συνολική Αξία',value:fe(totalValue,0),sub:'Τρέχουσα αξία μετά απόσβεση'},
              {label:'Εγγυήσεις που Λήγουν',value:fn(warrantyExpiringCount),tone:warrantyExpiringCount>0?'warning':'neutral',sub:'Εντός 90 ημερών'},
              {label:'Αντικείμενα σε Κακή Κατάσταση',value:fn(badConditionCount),tone:badConditionCount>0?'negative':'neutral'},
              {label:'Επόμενη Συντήρηση',value:nextMaintenanceDate?fd(nextMaintenanceDate):'—',tone:overdueCount>0?'negative':'neutral',sub:overdueCount>0?`${overdueCount} σε καθυστέρηση`:undefined},
            ]}/>
            {actionCount>0&&<InfoBanner tone="warning">{fn(actionCount)} {actionCount===1?'αντικείμενο χρειάζεται':'αντικείμενα χρειάζονται'} την προσοχή σου (εγγύηση, κατάσταση ή απόσβεση).</InfoBanner>}
            {warrantyExpiringCount>0&&<InfoBanner tone="warning">{fn(warrantyExpiringCount)} {warrantyExpiringCount===1?'εγγύηση λήγει':'εγγυήσεις λήγουν'} εντός των επόμενων 90 ημερών.</InfoBanner>}
            {badConditionCount>0&&<InfoBanner tone="negative">{fn(badConditionCount)} {badConditionCount===1?'αντικείμενο βρίσκεται':'αντικείμενα βρίσκονται'} σε κακή κατάσταση ή εκτός λειτουργίας.</InfoBanner>}
            {overdueCount>0&&<InfoBanner tone="negative">{fn(overdueCount)} {overdueCount===1?'εργασία συντήρησης έχει':'εργασίες συντήρησης έχουν'} καθυστερήσει.</InfoBanner>}
            {warnCount>0&&<InfoBanner tone="warning">{fn(warnCount)} {warnCount===1?'εργασία συντήρησης προγραμματίζεται':'εργασίες συντήρησης προγραμματίζονται'} εντός των επόμενων 30 ημερών.</InfoBanner>}
          </>
      )}

      <div style={{display:'flex',gap:2,borderBottom:'1px solid var(--border-subtle)',marginLeft:-24,marginRight:-24,paddingLeft:24,overflowX:'auto',marginTop:24,marginBottom:24}}>
        {TABS.map(tab=>(
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
            style={{padding:'12px 18px',fontSize:13,fontWeight:activeTab===tab.key?500:400,fontFamily:"'Google Sans',sans-serif",color:activeTab===tab.key?'var(--accent)':'var(--text-secondary)',borderBottom:`2px solid ${activeTab===tab.key?'var(--accent)':'transparent'}`,borderLeft:'none',borderRight:'none',borderTop:'none',background:'none',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',display:'flex',alignItems:'center',gap:6,marginBottom:-1}}
            onMouseEnter={e=>{if(activeTab!==tab.key)(e.currentTarget as HTMLButtonElement).style.color='var(--text-primary)'}}
            onMouseLeave={e=>{if(activeTab!==tab.key)(e.currentTarget as HTMLButtonElement).style.color='var(--text-secondary)'}}
          >
            {tab.label}
            {tab.key==='maintenance'&&(overdueCount>0||warnCount>0)&&<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:16,height:16,borderRadius:8,background:overdueCount>0?'var(--negative)':'var(--warning)',color:'#fff',fontSize:9,fontWeight:700,padding:'0 4px'}}>{overdueCount+warnCount>9?'9+':overdueCount+warnCount}</span>}
            {tab.key==='items'&&actionCount>0&&<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:16,height:16,borderRadius:8,background:'var(--warning)',color:'#fff',fontSize:9,fontWeight:700,padding:'0 4px'}}>{actionCount>9?'9+':actionCount}</span>}
          </button>
        ))}
      </div>

      {loading
        ?<Spinner label="Φόρτωση…" />
        :(
          <>
            {activeTab==='overview'&&<OverviewTab items={items} repairs={repairs} kwhPrice={kwhPrice}/>}
            {activeTab==='items'&&<ItemsTab items={items} repairs={repairs} kwhPrice={kwhPrice} onAdd={()=>{setEditingItem(null);setShowItemForm(true)}} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onDelete={handleDelete} onRepair={item=>setRepairItem(item)} onQR={item=>setQrItem(item)} onUpdateCondition={handleUpdateCondition}/>}
            {activeTab==='warranties'&&<WarrantiesTab items={items} userId={userId} propertyId={propertyId}/>}
            {activeTab==='handover'&&<HandoverTab items={items} handovers={handovers} propertyId={propertyId} userId={userId} onSaved={fetchData}/>}
            {activeTab==='maintenance'&&<MaintenanceTab items={items} schedules={schedules} propertyId={propertyId} userId={userId} onSaved={fetchData}/>}
            {activeTab==='exports'&&<ExportsTab items={items} repairs={repairs} kwhPrice={kwhPrice}/>}
          </>
        )
      }
    </div>
  )
}