'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  CustomSelect, NumberInput, TextInput, DatePicker, Toggle, Textarea,
} from './UIComponents'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────
interface InventoryItem {
  id: string; property_id: string; user_id: string
  name: string; category: string; room: string; brand: string; model: string
  serial_number: string; purchase_value: number; current_value: number
  purchase_date: string; warranty_expiry: string; condition: string
  notes: string; photo_url: string; photos: string[]
  energy_class: string; power_watts: number; daily_hours_use: number
  standby_watts: number; replacement_cost: number
  smart_device: boolean; smart_notes: string; tags: string[]
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

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['Έπιπλα','Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Υδραυλικά','Θέρμανση & Ψύξη','Φωτιστικά','Διακόσμηση','Λοιπά']
const ROOMS = ['Σαλόνι','Κουζίνα','Κύριο Υπνοδωμάτιο','Υπνοδωμάτιο 2','Υπνοδωμάτιο 3','Μπάνιο','WC','Χολ / Διάδρομος','Μπαλκόνι','Αποθήκη','Γκαράζ','Άλλο']
const CONDITIONS = ['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
const ENERGY_CLASSES = ['A+++','A++','A+','A','B','C','D','E','F','G']
const CONDITION_COLOR: Record<string,string> = {
  'Άριστη':'var(--positive)','Καλή':'#60a5fa','Μέτρια':'var(--warning)',
  'Κακή':'var(--negative)','Εκτός Λειτουργίας':'var(--text-tertiary)',
}
const ENERGY_COLOR: Record<string,string> = {
  'A+++':'#059669','A++':'#10b981','A+':'#34d399','A':'#22c55e',
  'B':'#fbbf24','C':'#f59e0b','D':'#f97316','E':'#ef4444','F':'#dc2626','G':'#991b1b',
}
const CATEGORY_ICONS: Record<string,string> = {
  'Έπιπλα':'🛋️','Ηλεκτρικές Συσκευές':'🔌','Ηλεκτρονικά':'💻',
  'Υδραυλικά':'🚿','Θέρμανση & Ψύξη':'❄️','Φωτιστικά':'💡','Διακόσμηση':'🖼️','Λοιπά':'📦',
}
const DEPRECIATION_YEARS: Record<string,number> = {
  'Έπιπλα':10,'Ηλεκτρικές Συσκευές':6,'Ηλεκτρονικά':3,'Υδραυλικά':15,
  'Θέρμανση & Ψύξη':12,'Φωτιστικά':8,'Διακόσμηση':20,'Λοιπά':8,
}
// Εκτιμώμενο κόστος αντικατάστασης ανά κατηγορία (range σε €)
const REPLACEMENT_RANGES: Record<string,{min:number;max:number;note:string}> = {
  'Ηλεκτρικές Συσκευές': {min:200,max:1200,note:'Πλυντήριο: 400-800€ | Ψυγείο: 300-1000€ | Πλυντ. πιάτων: 300-700€'},
  'Ηλεκτρονικά': {min:150,max:2000,note:'TV: 300-1500€ | Laptop: 500-1500€ | Tablet: 150-800€'},
  'Θέρμανση & Ψύξη': {min:300,max:3000,note:'Κλιματιστικό: 400-1500€ | Λέβητας: 800-3000€'},
  'Φωτιστικά': {min:30,max:500,note:'Απλό φωτιστικό: 30-150€ | Designer: 200-500€'},
  'Έπιπλα': {min:100,max:3000,note:'Καναπές: 400-2000€ | Κρεβάτι: 300-1500€ | Τραπέζι: 150-800€'},
  'Υδραυλικά': {min:50,max:800,note:'Μπαταρία: 80-300€ | Καζανάκι: 50-200€ | Θερμοσίφωνας: 150-400€'},
  'Λοιπά': {min:50,max:500,note:'Εξαρτάται από το αντικείμενο'},
}
const SMART_IDEAS: Record<string,{idea:string;saving:string;app:string}[]> = {
  'Ηλεκτρικές Συσκευές':[
    {idea:'Smart plug με μέτρηση κατανάλωσης',saving:'Ανίχνευση standby — έως 15% εξοικονόμηση',app:'Tapo P115, Shelly Plug S'},
    {idea:'Χρονοδιακόπτης απενεργοποίησης',saving:'Αυτόματη απενεργοποίηση τη νύχτα',app:'Sonoff S26, Shelly 1PM'},
  ],
  'Θέρμανση & Ψύξη':[
    {idea:'Smart θερμοστάτης',saving:'Εκτιμώμενη εξοικονόμηση 15-25% (ευρωπαϊκές μελέτες)',app:'Tado, Nest, Heatmiser'},
    {idea:'IR controller για κλιματιστικό',saving:'Χρονοπρογράμματα, έλεγχος από κινητό',app:'Sensibo, Broadlink RM4'},
  ],
  'Φωτιστικά':[
    {idea:'Smart LED λαμπτήρες',saving:'Έως 80% λιγότερη κατανάλωση vs παλαιοί',app:'Philips Hue, IKEA TRÅDFRI'},
    {idea:'Έξυπνος διακόπτης',saving:'Χρονοπρογράμματα, αισθητήρας παρουσίας',app:'Shelly i4, Sonoff ZBMINIL2'},
  ],
  'Ηλεκτρονικά':[
    {idea:'Smart power strip',saving:'Αποτροπή phantom load',app:'TP-Link HS300, Kasa'},
  ],
}
const DEFAULT_MAINTENANCE = [
  {task:'Ετήσιος έλεγχος λέβητα',interval_months:12,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρων κλιματιστικού',interval_months:3,category:'Θέρμανση & Ψύξη'},
  {task:'Καθαρισμός φίλτρου πλυντηρίου',interval_months:3,category:'Ηλεκτρικές Συσκευές'},
  {task:'Αποασβεστοποίηση καφετιέρας',interval_months:2,category:'Ηλεκτρικές Συσκευές'},
  {task:'Έλεγχος μπαταρίας ανιχνευτή καπνού',interval_months:6,category:'Λοιπά'},
  {task:'Έλεγχος αντλίας θερμότητας',interval_months:12,category:'Θέρμανση & Ψύξη'},
]
const AVAILABLE_TAGS = ['Ενεργοβόρο','Υπό Παρακολούθηση','Νέο','Αντικ. Σύντομα','Smart','Εγγύηση Ενεργή','Επισκευάστηκε','Σημαντικό']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcCurrentValue(item: InventoryItem): number {
  if (!item.purchase_value || !item.purchase_date) return item.purchase_value || 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  const lifespan = DEPRECIATION_YEARS[item.category] || 8
  return Math.round(item.purchase_value * Math.max(0, 1 - years/lifespan))
}
function calcDepreciationPct(item: InventoryItem): number {
  if (!item.purchase_date) return 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  return Math.min(100, Math.round((years / (DEPRECIATION_YEARS[item.category] || 8)) * 100))
}
function calcYearsLeft(item: InventoryItem): number {
  if (!item.purchase_date) return 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  return Math.max(0, Math.round((DEPRECIATION_YEARS[item.category] || 8) - years))
}
function calcAgeDisplay(purchaseDate: string): string {
  if (!purchaseDate) return ''
  const ms = Date.now() - new Date(purchaseDate).getTime()
  const years = Math.floor(ms / (1000*60*60*24*365))
  const months = Math.floor((ms % (1000*60*60*24*365)) / (1000*60*60*24*30))
  if (years === 0) return `${months} μήνες`
  if (months === 0) return `${years} χρόνια`
  return `${years} χρόν. και ${months} μήνες`
}
function calcMonthlyKwh(item: InventoryItem): number {
  if (!item.power_watts || !item.daily_hours_use) return 0
  const active = (item.power_watts / 1000) * item.daily_hours_use * 30
  const standby = item.standby_watts ? (item.standby_watts / 1000) * (24 - item.daily_hours_use) * 30 : 0
  return Math.round((active + standby) * 10) / 10
}
function calcMonthlyCost(item: InventoryItem, price: number): number {
  return Math.round(calcMonthlyKwh(item) * price * 100) / 100
}
function formatEuro(n: number): string {
  return new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
}
function formatEuroCents(n: number): string {
  return new Intl.NumberFormat('el-GR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
}
function formatDate(d: string): string { return d ? new Date(d).toLocaleDateString('el-GR') : '—' }
function daysUntil(d: string): number {
  if (!d) return Infinity
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000*60*60*24))
}
function warrantyStatus(expiry: string): {label:string;color:string} {
  if (!expiry) return {label:'Χωρίς εγγύηση',color:'var(--text-tertiary)'}
  const d = daysUntil(expiry)
  if (d < 0) return {label:'Έληξε',color:'var(--negative)'}
  if (d <= 30) return {label:`Λήγει σε ${d} μέρες`,color:'var(--negative)'}
  if (d <= 90) return {label:`Λήγει σε ${d} μέρες`,color:'var(--warning)'}
  return {label:`Ισχύει έως ${formatDate(expiry)}`,color:'var(--positive)'}
}
function addMonths(date: string, months: number): string {
  const d = date ? new Date(date) : new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
function needsAction(item: InventoryItem): boolean {
  const depPct = calcDepreciationPct(item)
  const wDays = daysUntil(item.warranty_expiry)
  return (
    item.condition === 'Κακή' || item.condition === 'Εκτός Λειτουργίας' ||
    depPct >= 100 ||
    (wDays >= 0 && wDays <= 90)
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const dot = (label: string, right?: React.ReactNode) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/>
      <p style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:600}}>{label}</p>
    </div>
    {right}
  </div>
)
function KPI({label,value,color,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'12px 14px'}}>
      <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6,fontWeight:600}}>{label}</p>
      <p style={{fontSize:16,fontFamily:'JetBrains Mono, monospace',color:color||'var(--text-primary)',fontWeight:700}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3}}>{sub}</p>}
    </div>
  )
}
function Badge({label,color}:{label:string;color:string}) {
  return (
    <span style={{display:'inline-block',padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,color,background:color+'18',border:`1px solid ${color}30`,letterSpacing:'0.04em'}}>{label}</span>
  )
}
function DepreciationBar({pct,yearsLeft}:{pct:number;yearsLeft:number}) {
  const color = pct < 40 ? 'var(--positive)' : pct < 70 ? 'var(--warning)' : 'var(--negative)'
  return (
    <div>
      <div style={{height:4,background:'var(--border-subtle)',borderRadius:2,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:2,transition:'width 0.5s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)'}}>Απόσβεση {pct}%</span>
        {yearsLeft > 0
          ? <span style={{fontSize:9,color:'var(--text-tertiary)'}}>~{yearsLeft} χρόν.</span>
          : <span style={{fontSize:9,color:'var(--negative)',fontWeight:600}}>Πλήρης απόσβεση</span>}
      </div>
    </div>
  )
}
function EnergyBadge({cls}:{cls:string}) {
  if (!cls) return null
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:800,color:'#fff',background:ENERGY_COLOR[cls]||'#888'}}>
      ⚡ {cls}
    </span>
  )
}

// ─── Inline Condition Editor ──────────────────────────────────────────────────
function InlineConditionEdit({item,onUpdate}:{item:InventoryItem;onUpdate:(id:string,condition:string)=>void}) {
  const [open,setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const h = (e:MouseEvent) => { if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h)
  },[])
  return (
    <div ref={ref} style={{position:'relative',display:'inline-block'}}>
      <span
        onClick={()=>setOpen(v=>!v)}
        style={{display:'inline-block',padding:'2px 8px',borderRadius:6,fontSize:10,fontWeight:700,
          color:CONDITION_COLOR[item.condition],background:CONDITION_COLOR[item.condition]+'18',
          border:`1px solid ${CONDITION_COLOR[item.condition]}30`,cursor:'pointer',letterSpacing:'0.04em'}}
        title="Κλικ για αλλαγή"
      >
        {item.condition} ✎
      </span>
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:10,padding:6,zIndex:500,minWidth:160,boxShadow:'var(--shadow-md)'}}>
          {CONDITIONS.map(c=>(
            <div key={c} onClick={()=>{onUpdate(item.id,c);setOpen(false)}} style={{padding:'7px 12px',cursor:'pointer',borderRadius:7,fontSize:12,color:CONDITION_COLOR[c],background:item.condition===c?CONDITION_COLOR[c]+'18':'transparent',fontWeight:item.condition===c?700:400}}
              onMouseEnter={e=>(e.currentTarget.style.background=CONDITION_COLOR[c]+'12')}
              onMouseLeave={e=>(e.currentTarget.style.background=item.condition===c?CONDITION_COLOR[c]+'18':'transparent')}
            >{c}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Multi Photo Upload ───────────────────────────────────────────────────────
function MultiPhotoUpload({photos,onAdd,onRemove,primary,onSetPrimary}:{
  photos:string[];onAdd:(url:string)=>void;onRemove:(url:string)=>void;
  primary:string;onSetPrimary:(url:string)=>void
}) {
  const [uploading,setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleFile = async(file:File) => {
    setUploading(true)
    const ext=file.name.split('.').pop()
    const path=`${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const {error} = await supabase.storage.from('inventory-photos').upload(path,file,{upsert:true})
    if(error){alert('Σφάλμα: '+error.message);setUploading(false);return}
    const {data:urlData} = supabase.storage.from('inventory-photos').getPublicUrl(path)
    onAdd(urlData.publicUrl);setUploading(false)
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(80px,1fr))',gap:6}}>
        {photos.map((url,i)=>(
          <div key={i} style={{position:'relative',height:80,borderRadius:8,overflow:'hidden',border:`2px solid ${url===primary?'var(--accent)':'var(--border-subtle)'}`}}>
            <img src={url} style={{width:'100%',height:'100%',objectFit:'cover'}} />
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',transition:'background 0.2s'}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(0,0,0,0.35)')}
              onMouseLeave={e=>(e.currentTarget.style.background='rgba(0,0,0,0)')}>
              <button onClick={()=>onSetPrimary(url)} style={{position:'absolute',top:3,left:3,background:'rgba(0,0,0,0.6)',border:'none',borderRadius:4,color:'#fff',fontSize:10,cursor:'pointer',padding:'1px 5px'}} title="Κύρια φωτό">★</button>
              <button onClick={()=>onRemove(url)} style={{position:'absolute',top:3,right:3,background:'rgba(220,38,38,0.8)',border:'none',borderRadius:4,color:'#fff',fontSize:10,cursor:'pointer',padding:'1px 5px'}}>✕</button>
            </div>
            {url===primary&&<div style={{position:'absolute',bottom:0,left:0,right:0,background:'var(--accent)',padding:'1px',fontSize:8,color:'var(--bg-base)',textAlign:'center',fontWeight:700}}>ΚΥΡΙΑ</div>}
          </div>
        ))}
        <div onClick={()=>inputRef.current?.click()} style={{height:80,borderRadius:8,border:'1.5px dashed var(--border-accent)',background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',cursor:uploading?'wait':'pointer',flexDirection:'column',gap:4}}>
          <p style={{fontSize:18}}>{uploading?'⏳':'📷'}</p>
          <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{uploading?'...':'Προσθήκη'}</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
      {photos.length>1&&<p style={{fontSize:10,color:'var(--text-tertiary)'}}>Κλικ ★ για να ορίσετε την κύρια φωτογραφία</p>}
    </div>
  )
}

// ─── QR Modal (real scannable) ────────────────────────────────────────────────
function QRModal({item,onClose}:{item:InventoryItem;onClose:()=>void}) {
  const [qrDataUrl,setQrDataUrl] = useState('')
  const itemUrl = `${typeof window!=='undefined'?window.location.origin:''}/item/${item.id}`
  
  useEffect(()=>{
    // Generate QR using Google Charts API (no npm needed)
    const data = encodeURIComponent(JSON.stringify({
      n:item.name, b:item.brand, m:item.model, sn:item.serial_number,
      cat:item.category, cond:item.condition, warranty:item.warranty_expiry,
    }))
    setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${data}`)
  },[item])

  const printQR = () => {
    const w = window.open('','_blank'); if(!w) return
    w.document.write(`<html><head><title>QR — ${item.name}</title><style>body{font-family:Arial,sans-serif;padding:20px;text-align:center}h2{font-size:16px;margin-bottom:4px}p{font-size:12px;color:#666;margin:2px 0}table{margin:16px auto;border-collapse:collapse;font-size:11px}td{padding:4px 8px;border-bottom:1px solid #eee}td:first-child{color:#999;text-align:right}@media print{button{display:none}}</style></head><body>
    <h2>${item.name}</h2>
    <img src="${qrDataUrl}" width="160" height="160" style="margin:12px auto;display:block;border:1px solid #eee;padding:8px"/>
    <table>
      ${item.brand?`<tr><td>Μάρκα</td><td><strong>${item.brand}</strong></td></tr>`:''}
      ${item.model?`<tr><td>Μοντέλο</td><td><strong>${item.model}</strong></td></tr>`:''}
      ${item.serial_number?`<tr><td>Σειριακός</td><td><strong>${item.serial_number}</strong></td></tr>`:''}
      <tr><td>Κατηγορία</td><td>${item.category}</td></tr>
      <tr><td>Κατάσταση</td><td>${item.condition}</td></tr>
      ${item.warranty_expiry?`<tr><td>Εγγύηση έως</td><td>${formatDate(item.warranty_expiry)}</td></tr>`:''}
      ${item.energy_class?`<tr><td>Ενεργ. Κλάση</td><td>${item.energy_class}</td></tr>`:''}
    </table>
    <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer">🖨️ Εκτύπωση</button>
    </body></html>`)
    w.document.close()
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,padding:24,maxWidth:320,width:'100%',display:'flex',flexDirection:'column',gap:16,alignItems:'center'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%'}}>
          <p style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>QR Αντικειμένου</p>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>
        <div style={{background:'#fff',padding:12,borderRadius:10,border:'1px solid var(--border-subtle)'}}>
          {qrDataUrl&&<img src={qrDataUrl} width={200} height={200} alt="QR Code"/>}
        </div>
        <div style={{textAlign:'center'}}>
          <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
          <p style={{fontSize:11,color:'var(--text-tertiary)'}}>{item.brand} {item.model}{item.serial_number?` · SN: ${item.serial_number}`:''}</p>
        </div>
        <p style={{fontSize:10,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 12px',background:'var(--bg-elevated)',borderRadius:8,border:'1px solid var(--border-subtle)'}}>
          Σκανάρετε με κάμερα κινητού για να δείτε τα στοιχεία του αντικειμένου
        </p>
        <button onClick={printQR} style={{width:'100%',padding:'10px',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>🖨️ Εκτύπωση Καρτέλας</button>
      </div>
    </div>
  )
}

// ─── Bulk CSV Import ──────────────────────────────────────────────────────────
function BulkImportModal({propertyId,userId,onImported,onClose}:{propertyId:string;userId:string;onImported:()=>void;onClose:()=>void}) {
  const [step,setStep] = useState<'upload'|'preview'>('upload')
  const [rows,setRows] = useState<Partial<InventoryItem>[]>([])
  const [errors,setErrors] = useState<string[]>([])
  const [importing,setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const TEMPLATE = `Ονομασία,Κατηγορία,Δωμάτιο,Μάρκα,Μοντέλο,Σειριακός,Κατάσταση,Αξία Αγοράς,Ημ/νία Αγοράς,Λήξη Εγγύησης,Ενεργ.Κλάση,Ισχύς (W),Ώρες/Ημέρα,Σημειώσεις\nΠλυντήριο Ρούχων,Ηλεκτρικές Συσκευές,Κουζίνα,Bosch,WAU28,SN123,Καλή,650,2021-03-15,2026-03-15,A+,2100,1,\nΨυγείο,Ηλεκτρικές Συσκευές,Κουζίνα,Samsung,RT38,SN789,Άριστη,800,2022-01-10,2027-01-10,A++,150,24,`
  const downloadTemplate = () => {
    const blob = new Blob(['\uFEFF'+TEMPLATE],{type:'text/csv;charset=utf-8;'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='template.csv'; a.click()
  }
  const parseCSV = (text:string) => {
    const lines = text.trim().split('\n').filter(l=>l.trim())
    if(lines.length<2){setErrors(['Το αρχείο δεν έχει δεδομένα.']);return}
    const parsed:Partial<InventoryItem>[] = []; const errs:string[] = []
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(',').map(c=>c.replace(/^"|"$/g,'').trim())
      if(!cols[0]) continue
      const cat=cols[1]||'Λοιπά'; const cond=cols[6]||'Καλή'
      if(!CATEGORIES.includes(cat)) errs.push(`Γραμμή ${i+1}: Άγνωστη κατηγορία "${cat}"`)
      parsed.push({name:cols[0],category:cat,room:cols[2]||'',brand:cols[3]||'',model:cols[4]||'',serial_number:cols[5]||'',condition:CONDITIONS.includes(cond)?cond:'Καλή',purchase_value:parseFloat(cols[7])||0,purchase_date:cols[8]||'',warranty_expiry:cols[9]||'',energy_class:cols[10]||'',power_watts:parseFloat(cols[11])||0,daily_hours_use:parseFloat(cols[12])||0,notes:cols[13]||''})
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
    <div style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,padding:24,width:'100%',maxWidth:640,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>Μαζική Εισαγωγή CSV</p>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>
        {step==='upload'&&(
          <>
            <div style={{padding:'12px 16px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25'}}>
              <p style={{fontSize:11,color:'var(--info)',fontWeight:600,marginBottom:4}}>📋 Οδηγίες</p>
              <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.7}}>1. Κατεβάστε το template<br/>2. Συμπληρώστε (μία γραμμή = ένα αντικείμενο)<br/>3. Αποθηκεύστε ως CSV (UTF-8) και ανεβάστε</p>
            </div>
            <button onClick={downloadTemplate} style={{padding:'10px',borderRadius:10,border:'1px solid var(--border-default)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:12,fontWeight:600,cursor:'pointer'}}>📥 Κατέβασμα Template CSV</button>
            <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}} style={{border:'2px dashed var(--border-accent)',borderRadius:12,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:'var(--accent-dim)'}}>
              <p style={{fontSize:24,marginBottom:8}}>📂</p>
              <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>Σύρτε ή κλικ για ανέβασμα CSV</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
            {errors.length>0&&<div style={{padding:'10px 14px',background:'rgba(248,113,113,0.1)',borderRadius:8}}>{errors.map((e,i)=><p key={i} style={{fontSize:11,color:'var(--negative)'}}>{e}</p>)}</div>}
          </>
        )}
        {step==='preview'&&(
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <p style={{fontSize:12,color:'var(--text-secondary)'}}>Βρέθηκαν <strong style={{color:'var(--text-primary)'}}>{rows.length} αντικείμενα</strong></p>
              <button onClick={()=>setStep('upload')} style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>← Πίσω</button>
            </div>
            {errors.length>0&&<div style={{padding:'10px 14px',background:'rgba(251,146,60,0.1)',borderRadius:8}}>{errors.map((e,i)=><p key={i} style={{fontSize:11,color:'var(--warning)'}}>{e}</p>)}</div>}
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr style={{background:'var(--bg-elevated)'}}>{['Ονομασία','Κατηγορία','Κατάσταση','Αξία','Εγγύηση'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--text-secondary)',fontWeight:600,fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0,20).map((r,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-subtle)'}}><td style={{padding:'7px 10px',color:'var(--text-primary)',fontWeight:600}}>{r.name}</td><td style={{padding:'7px 10px',color:'var(--text-secondary)'}}>{r.category}</td><td style={{padding:'7px 10px'}}><Badge label={r.condition||'—'} color={CONDITION_COLOR[r.condition||'']||'var(--text-tertiary)'}/></td><td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'var(--positive)'}}>{r.purchase_value?formatEuro(r.purchase_value):'—'}</td><td style={{padding:'7px 10px',color:'var(--text-tertiary)'}}>{r.warranty_expiry?formatDate(r.warranty_expiry):'—'}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setStep('upload')} style={{padding:'9px 18px',borderRadius:10,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>Ακύρωση</button>
              <button onClick={handleImport} disabled={importing} style={{padding:'9px 22px',borderRadius:10,background:importing?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:importing?'wait':'pointer'}}>
                {importing?'Εισαγωγή...':` Εισαγωγή ${rows.length} Αντικειμένων`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Item Form Modal ──────────────────────────────────────────────────────────
const EMPTY: Partial<InventoryItem> = {
  name:'',category:'Ηλεκτρικές Συσκευές',room:'Κουζίνα',brand:'',model:'',
  serial_number:'',purchase_value:0,purchase_date:'',warranty_expiry:'',
  condition:'Καλή',notes:'',photo_url:'',photos:[],tags:[],
  energy_class:'',power_watts:0,daily_hours_use:0,standby_watts:0,
  replacement_cost:0,smart_device:false,smart_notes:'',
}

function ItemFormModal({item,onSave,onClose}:{item?:InventoryItem|null;onSave:(d:Partial<InventoryItem>)=>void;onClose:()=>void}) {
  const [form,setForm] = useState<Partial<InventoryItem>>(item?{...item,photos:item.photos||[],tags:item.tags||[]}:EMPTY)
  const [saving,setSaving] = useState(false)
  const [tab,setTab] = useState<'basic'|'energy'|'smart'>('basic')
  const set = (k:keyof InventoryItem,v:any) => setForm(f=>({...f,[k]:v}))
  const isElectric = ['Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Θέρμανση & Ψύξη','Φωτιστικά'].includes(form.category||'')
  const liveKwh = form.power_watts&&form.daily_hours_use ? ((form.power_watts/1000)*form.daily_hours_use*30+((form.standby_watts||0)/1000)*(24-(form.daily_hours_use||0))*30) : 0
  const replRange = REPLACEMENT_RANGES[form.category||'']
  const handleSave = async() => {
    if(!form.name?.trim()){alert('Το όνομα είναι υποχρεωτικό.');return}
    // Set primary photo_url from photos array if not set
    const primaryUrl = form.photo_url || (form.photos&&form.photos.length>0?form.photos[0]:'')
    setSaving(true); await onSave({...form,photo_url:primaryUrl}); setSaving(false)
  }
  const tbStyle = (t:string):React.CSSProperties => ({padding:'7px 14px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',border:`1px solid ${tab===t?'var(--accent)':'var(--border-subtle)'}`,background:tab===t?'var(--accent)':'none',color:tab===t?'var(--bg-base)':'var(--text-secondary)'})
  const toggleTag = (tag:string) => {
    const tags = form.tags||[]
    set('tags', tags.includes(tag) ? tags.filter(t=>t!==tag) : [...tags,tag])
  }
  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,width:'100%',maxWidth:660,maxHeight:'92vh',overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:18}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <p style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>{item?'Επεξεργασία':'Νέο Αντικείμενο'}</p>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button style={tbStyle('basic')} onClick={()=>setTab('basic')}>Βασικά</button>
          {isElectric&&<button style={tbStyle('energy')} onClick={()=>setTab('energy')}>⚡ Ενέργεια</button>}
          {isElectric&&<button style={tbStyle('smart')} onClick={()=>setTab('smart')}>🏠 Smart Home</button>}
        </div>

        {tab==='basic'&&(
          <>
            {dot('Φωτογραφίες')}
            <MultiPhotoUpload
              photos={form.photos||[]}
              primary={form.photo_url||''}
              onAdd={url=>set('photos',[...(form.photos||[]),url])}
              onRemove={url=>{
                const newPhotos=(form.photos||[]).filter(p=>p!==url)
                set('photos',newPhotos)
                if(form.photo_url===url) set('photo_url',newPhotos[0]||'')
              }}
              onSetPrimary={url=>set('photo_url',url)}
            />
            {dot('Βασικά Στοιχεία')}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ονομασία *</p>
                <TextInput value={form.name||''} onChange={v=>set('name',v)} placeholder="π.χ. Πλυντήριο Ρούχων Bosch"/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κατηγορία</p>
                <CustomSelect value={form.category||'Λοιπά'} onChange={v=>set('category',v)} options={CATEGORIES.map(c=>({value:c,label:`${CATEGORY_ICONS[c]} ${c}`}))}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Χώρος</p>
                <CustomSelect value={form.room||'Σαλόνι'} onChange={v=>set('room',v)} options={ROOMS.map(r=>({value:r,label:r}))}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Μάρκα</p>
                <TextInput value={form.brand||''} onChange={v=>set('brand',v)} placeholder="π.χ. Bosch"/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Μοντέλο</p>
                <TextInput value={form.model||''} onChange={v=>set('model',v)} placeholder="π.χ. WAU28PI0GR"/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Σειριακός Αριθμός</p>
                <TextInput value={form.serial_number||''} onChange={v=>set('serial_number',v)} placeholder="SN / IMEI"/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κατάσταση</p>
                <CustomSelect value={form.condition||'Καλή'} onChange={v=>set('condition',v)} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Αξία Αγοράς (€)</p>
                <NumberInput value={String(form.purchase_value||0)} onChange={v=>set('purchase_value',parseFloat(v)||0)} suffix="€" min={0}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κόστος Αντικατάστασης (€)</p>
                <NumberInput value={String(form.replacement_cost||0)} onChange={v=>set('replacement_cost',parseFloat(v)||0)} suffix="€" min={0}/>
                {replRange&&!form.replacement_cost&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:4}}>Εκτίμηση: {formatEuro(replRange.min)}–{formatEuro(replRange.max)}</p>}
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ημερομηνία Αγοράς</p>
                <DatePicker value={form.purchase_date||''} onChange={v=>set('purchase_date',v)}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Λήξη Εγγύησης</p>
                <DatePicker value={form.warranty_expiry||''} onChange={v=>set('warranty_expiry',v)}/>
              </div>
            </div>
            {dot('Tags')}
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {AVAILABLE_TAGS.map(tag=>{
                const active=(form.tags||[]).includes(tag)
                return <button key={tag} onClick={()=>toggleTag(tag)} style={{padding:'4px 12px',borderRadius:20,fontSize:11,cursor:'pointer',fontWeight:600,border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`,background:active?'var(--accent-dim)':'none',color:active?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s'}}>{tag}</button>
              })}
            </div>
            {dot('Σημειώσεις')}
            <Textarea value={form.notes||''} onChange={v=>set('notes',v)} placeholder="Παρατηρήσεις κατάστασης, ιστορικό..." rows={2}/>
          </>
        )}

        {tab==='energy'&&(
          <>
            {dot('Ενεργειακά Στοιχεία')}
            <div style={{padding:'10px 14px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25'}}>
              <p style={{fontSize:11,color:'var(--info)'}}>💡 Βρες τα στοιχεία στην ετικέτα ενέργειας ή στο εγχειρίδιο. Η ισχύς είναι η <strong>μέγιστη ισχύς λειτουργίας</strong>.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ενεργειακή Κλάση</p>
                <CustomSelect value={form.energy_class||''} onChange={v=>set('energy_class',v)} options={[{value:'',label:'— Δεν γνωρίζω'},...ENERGY_CLASSES.map(c=>({value:c,label:c}))]}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ισχύς Λειτουργίας (Watt)</p>
                <NumberInput value={String(form.power_watts||0)} onChange={v=>set('power_watts',parseFloat(v)||0)} suffix="W" min={0}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Μέσες Ώρες Χρήσης / Ημέρα</p>
                <NumberInput value={String(form.daily_hours_use||0)} onChange={v=>set('daily_hours_use',parseFloat(v)||0)} suffix="ώρ/ημ" min={0} max={24}/>
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κατανάλωση Αναμονής (standby W)</p>
                <NumberInput value={String(form.standby_watts||0)} onChange={v=>set('standby_watts',parseFloat(v)||0)} suffix="W" min={0}/>
              </div>
            </div>
            {liveKwh > 0 && (
              <div style={{background:'var(--bg-elevated)',borderRadius:10,padding:'14px 16px',border:'1px solid var(--border-subtle)'}}>
                <p style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10,fontWeight:600}}>Εκτιμώμενη Κατανάλωση (βάσει στοιχείων κατασκευαστή)</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                  {[
                    {label:'kWh / Μήνα',value:`${liveKwh.toFixed(1)} kWh`},
                    {label:'kWh / Έτος',value:`${(liveKwh*12).toFixed(0)} kWh`},
                    {label:'Κόστος / Μήνα (~0.22€)',value:formatEuroCents(liveKwh*0.22)},
                    {label:'Κόστος / Έτος (~0.22€)',value:formatEuroCents(liveKwh*0.22*12)},
                  ].map((k,i)=>(
                    <div key={i} style={{textAlign:'center',padding:'10px',background:'var(--bg-surface)',borderRadius:8}}>
                      <p style={{fontSize:13,fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--text-primary)',marginBottom:3}}>{k.value}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</p>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:8}}>* Εκτίμηση βάσει τεχνικών χαρακτηριστικών κατασκευαστή. Η πραγματική κατανάλωση εξαρτάται από τον τρόπο χρήσης.</p>
              </div>
            )}
            {/* Energy class comparison */}
            {form.energy_class&&!['A+++','A++','A+'].includes(form.energy_class)&&(form.power_watts||0)>0&&(form.daily_hours_use||0)>0&&(
              <div style={{padding:'12px 16px',background:'rgba(52,211,153,0.08)',borderRadius:10,border:'1px solid var(--positive)25'}}>
                <p style={{fontSize:11,color:'var(--positive)',fontWeight:600,marginBottom:6}}>💚 Εξοικονόμηση με αναβάθμιση σε Α+++</p>
                <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>
                  Μια τυπική συσκευή Α+++ καταναλώνει ~40-60% λιγότερο από κλάση {form.energy_class}. 
                  Εκτιμώμενη εξοικονόμηση: <strong style={{fontFamily:'JetBrains Mono, monospace',color:'var(--positive)'}}>~{formatEuroCents(liveKwh*0.22*12*0.5)}–{formatEuroCents(liveKwh*0.22*12*0.6)}/χρόνο</strong>.
                  Ελέγξτε επιδοτήσεις ΕΣΠΑ για ενεργειακές αναβαθμίσεις.
                </p>
              </div>
            )}
          </>
        )}

        {tab==='smart'&&(
          <>
            {dot('Smart Home Αναβάθμιση')}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
              <div>
                <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>Έξυπνη Συσκευή</p>
                <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Συνδέεται με app, smart plug ή automation</p>
              </div>
              <Toggle on={form.smart_device||false} onChange={(v:boolean)=>set('smart_device',v)}/>
            </div>
            {form.smart_device&&(
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>App / Σύστημα Ελέγχου</p>
                <TextInput value={form.smart_notes||''} onChange={v=>set('smart_notes',v)} placeholder="π.χ. Shelly 1PM + Home Assistant"/>
              </div>
            )}
            {(SMART_IDEAS[form.category||'']||[]).length>0&&(
              <>
                {dot('Προτάσεις για αυτή την κατηγορία')}
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {(SMART_IDEAS[form.category||'']||[]).map((idea,i)=>(
                    <div key={i} style={{padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
                      <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>🔌 {idea.idea}</p>
                      <p style={{fontSize:11,color:'var(--positive)',marginBottom:4}}>📉 {idea.saving}</p>
                      <p style={{fontSize:10,color:'var(--text-tertiary)'}}>Devices: <span style={{color:'var(--info)'}}>{idea.app}</span></p>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{padding:'12px 14px',background:'rgba(212,175,66,0.08)',borderRadius:10,border:'1px solid var(--border-accent)'}}>
              <p style={{fontSize:11,color:'var(--accent)',fontWeight:600,marginBottom:6}}>💡 Γενικές Smart Home Συμβουλές</p>
              {['Smart plugs (Shelly, Tapo P115): ακριβής μέτρηση κατανάλωσης ανά συσκευή','Home Assistant (δωρεάν): ενοποίηση όλων σε ένα dashboard, automation','Tado / Nest θερμοστάτης: εκτιμώμενη εξοικονόμηση 15-25% στη θέρμανση','Philips Hue / IKEA TRÅDFRI: LED smart φωτισμός, έως 80% λιγότερη κατανάλωση'].map((tip,i)=>(
                <p key={i} style={{fontSize:11,color:'var(--text-secondary)',paddingLeft:12,borderLeft:'2px solid var(--border-accent)',marginBottom:4}}>→ {tip}</p>
              ))}
            </div>
          </>
        )}

        <div style={{display:'flex',gap:10,justifyContent:'flex-end',paddingTop:8,borderTop:'1px solid var(--border-subtle)'}}>
          <button onClick={onClose} style={{padding:'9px 18px',borderRadius:10,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>Ακύρωση</button>
          <button onClick={handleSave} disabled={saving} style={{padding:'9px 22px',borderRadius:10,background:saving?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση...':'Αποθήκευση'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Repair Modal (με auto-push στο TabExpenses) ──────────────────────────────
function RepairModal({item,repairs,onAdd,onClose,propertyId,userId}:{
  item:InventoryItem;repairs:InventoryRepair[];
  onAdd:(r:Partial<InventoryRepair>)=>void;
  onClose:()=>void;propertyId:string;userId:string
}) {
  const [form,setForm] = useState({repair_date:'',cost:0,technician:'',description:''})
  const [pushToExpenses,setPushToExpenses] = useState(true)
  const [saving,setSaving] = useState(false)
  const handleAdd = async() => {
    if(!form.description.trim()){alert('Η περιγραφή είναι υποχρεωτική.');return}
    setSaving(true)
    await onAdd(form)
    // Auto-push στο TabExpenses
    if(pushToExpenses && form.cost > 0) {
      await supabase.from('expenses').insert({
        property_id: propertyId,
        user_id: userId,
        description: `Επισκευή: ${item.name}${form.technician?` (${form.technician})`:''}${form.description?` — ${form.description}`:''}`,
        amount: form.cost,
        category: 'Συντήρηση & Επισκευές',
        expense_group: 'maintenance',
        date: form.repair_date || new Date().toISOString().split('T')[0],
        paid_by: 'owner',
        paid: true,
        notes: `Αυτόματη εισαγωγή από Απογραφή — ${item.name}`,
      })
    }
    setForm({repair_date:'',cost:0,technician:'',description:''})
    setSaving(false)
  }
  const itemRepairs = repairs.filter(r=>r.item_id===item.id)
  const totalCost = itemRepairs.reduce((s,r)=>s+(r.cost||0),0)
  const depPct = calcDepreciationPct(item); const curVal = calcCurrentValue(item)
  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <p style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>Επισκευές — {item.name}</p>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>
        {totalCost>0&&curVal>0&&(
          <div style={{padding:'10px 14px',background:totalCost>curVal*0.5?'rgba(248,113,113,0.08)':'rgba(52,211,153,0.08)',borderRadius:10,border:`1px solid ${totalCost>curVal*0.5?'var(--negative)':'var(--positive)'}25`}}>
            <p style={{fontSize:11,color:totalCost>curVal*0.5?'var(--negative)':'var(--positive)',fontWeight:600}}>
              {totalCost>curVal*0.5?`⚠️ Κόστος επισκευών (${formatEuro(totalCost)}) > 50% τρέχουσας αξίας (${formatEuro(curVal)}) — Αξιολογήστε αντικατάσταση`:`✓ Κόστος επισκευών (${formatEuro(totalCost)}) εντός λογικών ορίων vs τρέχουσα αξία (${formatEuro(curVal)})`}
            </p>
          </div>
        )}
        <DepreciationBar pct={depPct} yearsLeft={calcYearsLeft(item)}/>
        {itemRepairs.length>0&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {dot('Ιστορικό Επισκευών',<span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'var(--negative)'}}>Σύνολο: {formatEuro(totalCost)}</span>)}
            {itemRepairs.map(r=>(
              <div key={r.id} style={{background:'var(--bg-elevated)',borderRadius:8,padding:'10px 12px',border:'1px solid var(--border-subtle)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{r.description}</p>
                  <p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'var(--negative)'}}>{formatEuro(r.cost)}</p>
                </div>
                <p style={{fontSize:11,color:'var(--text-tertiary)'}}>{formatDate(r.repair_date)}{r.technician?` · ${r.technician}`:''}</p>
              </div>
            ))}
          </div>
        )}
        {dot('Νέα Επισκευή')}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ημερομηνία</p>
            <DatePicker value={form.repair_date} onChange={v=>setForm(f=>({...f,repair_date:v}))}/>
          </div>
          <div>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κόστος (€)</p>
            <NumberInput value={String(form.cost)} onChange={v=>setForm(f=>({...f,cost:parseFloat(v)||0}))} suffix="€" min={0}/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Τεχνικός / Συνεργείο</p>
            <TextInput value={form.technician} onChange={v=>setForm(f=>({...f,technician:v}))} placeholder="π.χ. Ηλεκτρολόγος Παπαδόπουλος"/>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Περιγραφή *</p>
            <Textarea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="Τι επισκευάστηκε..." rows={2}/>
          </div>
        </div>
        {/* Auto-push toggle */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(52,211,153,0.08)',borderRadius:10,border:'1px solid var(--positive)25'}}>
          <div>
            <p style={{fontSize:12,fontWeight:600,color:'var(--positive)'}}>Αυτόματη καταχώρηση στις Δαπάνες</p>
            <p style={{fontSize:10,color:'var(--text-tertiary)'}}>Η επισκευή θα εμφανιστεί στην καρτέλα "Δαπάνες" ως "Συντήρηση & Επισκευές"</p>
          </div>
          <Toggle on={pushToExpenses} onChange={setPushToExpenses}/>
        </div>
        <button onClick={handleAdd} disabled={saving} style={{padding:'9px 20px',borderRadius:10,background:saving?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:saving?'wait':'pointer',alignSelf:'flex-end'}}>
          {saving?'Αποθήκευση...':'Καταχώρηση Επισκευής'}
        </button>
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({items,repairs,electricityPrice}:{items:InventoryItem[];repairs:InventoryRepair[];electricityPrice:number}) {
  const totalPurchase = items.reduce((s,i)=>s+(i.purchase_value||0),0)
  const totalCurrent = items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const insurableValue = Math.round(totalCurrent*1.1)
  const totalRepairs = repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems = items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyKwh = electricItems.reduce((s,i)=>s+calcMonthlyKwh(i),0)
  const totalMonthlyCost = electricItems.reduce((s,i)=>s+calcMonthlyCost(i,electricityPrice),0)
  const totalAnnualCost = totalMonthlyCost * 12
  const byCategory = CATEGORIES.map(cat=>{const catItems=items.filter(i=>i.category===cat);return{cat,count:catItems.length,val:catItems.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
  const maxVal = Math.max(...byCategory.map(x=>x.val),1)
  const topEnergy = [...electricItems].sort((a,b)=>calcMonthlyCost(b,electricityPrice)-calcMonthlyCost(a,electricityPrice)).slice(0,5)
  const fullyDepreciated = items.filter(i=>calcDepreciationPct(i)>=100&&i.purchase_date)
  const warrantyAlert = items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90})
  const needsAttention = items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας')
  // Potential savings from upgrading bad energy class items
  const badEnergyItems = electricItems.filter(i=>!['A+++','A++','A+'].includes(i.energy_class||'')&&i.power_watts>0&&i.daily_hours_use>0)
  const potentialSavings = badEnergyItems.reduce((s,i)=>s+calcMonthlyCost(i,electricityPrice)*12*0.5,0)

  // Empty state
  if(items.length===0) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',gap:20,textAlign:'center'}}>
      <p style={{fontSize:40}}>📦</p>
      <p style={{fontSize:16,fontWeight:700,color:'var(--text-primary)'}}>Ξεκινήστε την Απογραφή σας</p>
      <p style={{fontSize:13,color:'var(--text-secondary)',maxWidth:400,lineHeight:1.7}}>Καταγράψτε τον εξοπλισμό του ακινήτου για να παρακολουθείτε την αξία, την κατανάλωση ρεύματος και τις εγγυήσεις.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,maxWidth:500,width:'100%'}}>
        {[
          {icon:'📦',title:'1. Προσθέστε Αντικείμενο',desc:'Έπιπλα, συσκευές, ηλεκτρονικά'},
          {icon:'⚡',title:'2. Βάλτε Watt',desc:'Για υπολογισμό κόστους ρεύματος'},
          {icon:'📋',title:'3. Ορίστε Εγγύηση',desc:'Λαμβάνετε υπενθύμιση πριν λήξει'},
        ].map((s,i)=>(
          <div key={i} style={{padding:'16px 12px',background:'var(--bg-elevated)',borderRadius:12,border:'1px solid var(--border-subtle)'}}>
            <p style={{fontSize:24,marginBottom:8}}>{s.icon}</p>
            <p style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{s.title}</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
        <KPI label="Αντικείμενα" value={String(items.length)} sub={`${byCategory.length} κατηγορίες`}/>
        <KPI label="Τρέχουσα Αξία" value={formatEuro(totalCurrent)} color="var(--positive)" sub="Μετά απόσβεση"/>
        <KPI label="Ασφαλιστέα Αξία" value={formatEuro(insurableValue)} color="var(--info)" sub="+10% buffer"/>
        <KPI label="Κόστος Επισκευών" value={formatEuro(totalRepairs)} color="var(--warning)"/>
        {electricItems.length>0
          ?<KPI label="Ρεύμα/Μήνα" value={formatEuroCents(totalMonthlyCost)} color="var(--accent)" sub={`${Math.round(totalMonthlyKwh)} kWh · ${formatEuroCents(totalAnnualCost)}/χρόνο`}/>
          :<KPI label="Ρεύμα" value="—" sub="Προσθέστε Watt στις συσκευές"/>
        }
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
          {dot('Κατανομή Αξίας ανά Κατηγορία')}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {byCategory.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>(
              <div key={cat}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:11,color:'var(--text-secondary)'}}>{CATEGORY_ICONS[cat]} {cat} <span style={{color:'var(--text-tertiary)'}}>({count})</span></span>
                  <span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'var(--text-primary)'}}>{formatEuro(val)}</span>
                </div>
                <div style={{height:4,background:'var(--border-subtle)',borderRadius:2}}>
                  <div style={{height:4,borderRadius:2,background:'var(--accent)',width:`${(val/maxVal)*100}%`,transition:'width 0.5s'}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:10,color:'var(--text-tertiary)'}}>Αξία Αγοράς</span>
            <span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'var(--text-secondary)'}}>{formatEuro(totalPurchase)}</span>
          </div>
        </div>
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
          {dot('Κατανάλωση Ρεύματος ανά Συσκευή')}
          {electricItems.length===0?(
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <p style={{fontSize:28,marginBottom:8}}>⚡</p>
              <p style={{fontSize:12,color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Δεν υπάρχουν δεδομένα κατανάλωσης</p>
              <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Προσθέστε Watt & ώρες χρήσης στις ηλεκτρικές συσκευές</p>
            </div>
          ):(
            <>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {topEnergy.map(item=>{
                  const monthly=calcMonthlyCost(item,electricityPrice); const kWh=calcMonthlyKwh(item)
                  const maxCost=calcMonthlyCost(topEnergy[0],electricityPrice)
                  return (
                    <div key={item.id}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,alignItems:'center',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                          {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                          <span style={{fontSize:11,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'var(--warning)',fontWeight:700}}>{formatEuroCents(monthly)}/μήνα</span>
                          <span style={{fontSize:10,color:'var(--text-tertiary)',display:'block'}}>{kWh} kWh</span>
                        </div>
                      </div>
                      <div style={{height:3,background:'var(--border-subtle)',borderRadius:2}}>
                        <div style={{height:3,borderRadius:2,background:'var(--warning)',width:`${maxCost>0?(monthly/maxCost)*100:0}%`}}/>
                      </div>
                    </div>
                  )
                })}
              </div>
              {potentialSavings>0&&(
                <div style={{marginTop:12,padding:'8px 12px',background:'rgba(52,211,153,0.08)',borderRadius:8,border:'1px solid var(--positive)20'}}>
                  <p style={{fontSize:11,color:'var(--positive)'}}>💚 Αναβάθμιση σε Α+++ των {badEnergyItems.length} συσκευών χαμηλής κλάσης → εκτιμώμενη εξοικονόμηση <strong style={{fontFamily:'JetBrains Mono, monospace'}}>{formatEuroCents(potentialSavings)}/χρόνο</strong></p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        <div style={{background:'var(--bg-elevated)',border:`1px solid ${fullyDepreciated.length>0?'var(--negative)':'var(--border-subtle)'}25`,borderRadius:12,padding:16}}>
          {dot('Πλήρης Απόσβεση',fullyDepreciated.length>0?<Badge label={`${fullyDepreciated.length}`} color="var(--negative)"/>:undefined)}
          {fullyDepreciated.length===0?<p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 0'}}>Κανένα αντικείμενο</p>
            :<div style={{display:'flex',flexDirection:'column',gap:6}}>
              {fullyDepreciated.slice(0,4).map(item=>(
                <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-surface)',borderRadius:8}}>
                  <span style={{fontSize:11,color:'var(--text-primary)'}}>{item.name}</span>
                  <span style={{fontSize:10,color:'var(--negative)',fontFamily:'JetBrains Mono, monospace'}}>{item.replacement_cost?formatEuro(item.replacement_cost):'—'}</span>
                </div>
              ))}
            </div>
          }
        </div>
        <div style={{background:'var(--bg-elevated)',border:`1px solid ${warrantyAlert.length>0?'var(--warning)':'var(--border-subtle)'}25`,borderRadius:12,padding:16}}>
          {dot('Εγγυήσεις ≤90 Μέρες',warrantyAlert.length>0?<Badge label={`${warrantyAlert.length}`} color="var(--warning)"/>:undefined)}
          {warrantyAlert.length===0?<p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 0'}}>Καμία λήξη σύντομα</p>
            :<div style={{display:'flex',flexDirection:'column',gap:6}}>
              {warrantyAlert.slice(0,4).map(item=>{const ws=warrantyStatus(item.warranty_expiry);return(
                <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-surface)',borderRadius:8}}>
                  <span style={{fontSize:11,color:'var(--text-primary)'}}>{item.name}</span>
                  <Badge label={ws.label} color={ws.color}/>
                </div>
              )})}
            </div>
          }
        </div>
        <div style={{background:'var(--bg-elevated)',border:`1px solid ${needsAttention.length>0?'var(--negative)':'var(--border-subtle)'}25`,borderRadius:12,padding:16}}>
          {dot('Χρειάζονται Προσοχή',needsAttention.length>0?<Badge label={`${needsAttention.length}`} color="var(--negative)"/>:undefined)}
          {needsAttention.length===0?<p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 0'}}>Όλα σε καλή κατάσταση</p>
            :<div style={{display:'flex',flexDirection:'column',gap:6}}>
              {needsAttention.map(item=>(
                <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-surface)',borderRadius:8}}>
                  <span style={{fontSize:11,color:'var(--text-primary)'}}>{item.name}</span>
                  <Badge label={item.condition} color={CONDITION_COLOR[item.condition]}/>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
      {electricItems.filter(i=>(i.standby_watts||0)>10).length>0&&(
        <div style={{padding:'12px 16px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25'}}>
          <p style={{fontSize:11,color:'var(--info)',fontWeight:600,marginBottom:4}}>🔌 Υψηλή κατανάλωση αναμονής (standby)</p>
          <p style={{fontSize:11,color:'var(--text-secondary)'}}>{electricItems.filter(i=>(i.standby_watts||0)>10).map(i=>`${i.name} (${i.standby_watts}W standby)`).join(', ')}. Smart plug με χρονοδιακόπτη μπορεί να μηδενίσει αυτή την κατανάλωση.</p>
        </div>
      )}
    </div>
  )
}

// ─── Items Tab ────────────────────────────────────────────────────────────────
type SortKey = 'name'|'value'|'energy'|'age'|'depreciation'
function ItemsTab({items,repairs,electricityPrice,onAdd,onEdit,onDelete,onAddRepair,onShowQR,onUpdateCondition}:{
  items:InventoryItem[];repairs:InventoryRepair[];electricityPrice:number
  onAdd:()=>void;onEdit:(i:InventoryItem)=>void;onDelete:(id:string)=>void
  onAddRepair:(i:InventoryItem)=>void;onShowQR:(i:InventoryItem)=>void
  onUpdateCondition:(id:string,condition:string)=>void
}) {
  const [filterCat,setFilterCat] = useState('Όλες')
  const [filterRoom,setFilterRoom] = useState('Όλα')
  const [filterTag,setFilterTag] = useState('Όλα')
  const [search,setSearch] = useState('')
  const [viewMode,setViewMode] = useState<'grid'|'list'>('grid')
  const [sortKey,setSortKey] = useState<SortKey>('name')
  const [sortDir,setSortDir] = useState<'asc'|'desc'>('asc')
  const [showNeedsAction,setShowNeedsAction] = useState(false)

  const allTags = [...new Set(items.flatMap(i=>i.tags||[]))]

  const filtered = items
    .filter(item=>{
      if(showNeedsAction&&!needsAction(item)) return false
      const matchCat=filterCat==='Όλες'||item.category===filterCat
      const matchRoom=filterRoom==='Όλα'||item.room===filterRoom
      const matchTag=filterTag==='Όλα'||(item.tags||[]).includes(filterTag)
      const matchSearch=!search||item.name.toLowerCase().includes(search.toLowerCase())||(item.brand||'').toLowerCase().includes(search.toLowerCase())
      return matchCat&&matchRoom&&matchTag&&matchSearch
    })
    .sort((a,b)=>{
      let va:number|string=0, vb:number|string=0
      if(sortKey==='name'){va=a.name;vb=b.name}
      else if(sortKey==='value'){va=calcCurrentValue(a);vb=calcCurrentValue(b)}
      else if(sortKey==='energy'){va=calcMonthlyCost(a,electricityPrice);vb=calcMonthlyCost(b,electricityPrice)}
      else if(sortKey==='age'){va=a.purchase_date?new Date(a.purchase_date).getTime():0;vb=b.purchase_date?new Date(b.purchase_date).getTime():0}
      else if(sortKey==='depreciation'){va=calcDepreciationPct(a);vb=calcDepreciationPct(b)}
      if(typeof va==='string') return sortDir==='asc'?va.localeCompare(vb as string):(vb as string).localeCompare(va)
      return sortDir==='asc'?(va as number)-(vb as number):(vb as number)-(va as number)
    })

  const usedCategories=['Όλες',...CATEGORIES.filter(c=>items.some(i=>i.category===c))]
  const usedRooms=['Όλα',...ROOMS.filter(r=>items.some(i=>i.room===r))]
  const actionCount = items.filter(needsAction).length

  const toggleSort = (key:SortKey) => {
    if(sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc')
    else {setSortKey(key);setSortDir('desc')}
  }
  const sortIndicator = (key:SortKey) => sortKey===key?(sortDir==='asc'?'↑':'↓'):''

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:180}}>
          <TextInput value={search} onChange={setSearch} placeholder="Αναζήτηση αντικειμένου, μάρκας..."/>
        </div>
        <div style={{width:150}}>
          <CustomSelect value={filterCat} onChange={setFilterCat} options={usedCategories.map(c=>({value:c,label:c==='Όλες'?'Όλες Κατηγορίες':`${CATEGORY_ICONS[c]} ${c}`}))}/>
        </div>
        <div style={{width:140}}>
          <CustomSelect value={filterRoom} onChange={setFilterRoom} options={usedRooms.map(r=>({value:r,label:r==='Όλα'?'Όλα Δωμάτια':r}))}/>
        </div>
        {allTags.length>0&&(
          <div style={{width:130}}>
            <CustomSelect value={filterTag} onChange={setFilterTag} options={[{value:'Όλα',label:'Όλα Tags'},...allTags.map(t=>({value:t,label:t}))]}/>
          </div>
        )}
        <button onClick={()=>setShowNeedsAction(v=>!v)} style={{padding:'7px 12px',borderRadius:8,fontSize:11,cursor:'pointer',fontWeight:600,border:`1px solid ${showNeedsAction?'var(--negative)':'var(--border-subtle)'}`,background:showNeedsAction?'rgba(248,113,113,0.12)':'var(--bg-elevated)',color:showNeedsAction?'var(--negative)':'var(--text-secondary)',position:'relative'}}>
          ⚠️ Δράση{actionCount>0&&<span style={{marginLeft:4,background:'var(--negative)',color:'#fff',borderRadius:10,padding:'0 5px',fontSize:10}}>{actionCount}</span>}
        </button>
        <div style={{display:'flex',gap:4}}>
          {(['grid','list'] as const).map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{padding:'7px 12px',borderRadius:8,fontSize:11,cursor:'pointer',fontWeight:600,border:`1px solid ${viewMode===m?'var(--accent)':'var(--border-subtle)'}`,background:viewMode===m?'var(--accent)':'var(--bg-elevated)',color:viewMode===m?'var(--bg-base)':'var(--text-secondary)'}}>
              {m==='grid'?'⊞':'☰'}
            </button>
          ))}
        </div>
        <button onClick={onAdd} style={{padding:'8px 16px',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Νέο</button>
      </div>

      {/* Sort bar */}
      <div style={{display:'flex',gap:4,alignItems:'center',padding:'6px 0'}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.12em',fontWeight:600,marginRight:4}}>Ταξινόμηση</span>
        {([['name','Όνομα'],['value','Αξία'],['energy','Ρεύμα'],['age','Ηλικία'],['depreciation','Απόσβεση']] as [SortKey,string][]).map(([k,l])=>(
          <button key={k} onClick={()=>toggleSort(k)} style={{padding:'5px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:sortKey===k?600:400,border:'none',borderBottom:`2px solid ${sortKey===k?'var(--accent)':'transparent'}`,background:'none',color:sortKey===k?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s',fontFamily:'Inter,sans-serif'}}>
            {l} {sortIndicator(k)}
          </button>
        ))}
      </div>

      {filtered.length===0?(
        <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-tertiary)'}}>
          <p style={{fontSize:28,marginBottom:8}}>📦</p>
          <p style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:4}}>{items.length===0?'Δεν έχετε καταχωρήσει αντικείμενα':'Δεν βρέθηκαν αποτελέσματα'}</p>
          <p style={{fontSize:12}}>{items.length===0?'Προσθέστε έπιπλα, συσκευές και εξοπλισμό':'Δοκιμάστε διαφορετικά φίλτρα'}</p>
        </div>
      ):viewMode==='grid'?(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:12}}>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item); const yearsLeft=calcYearsLeft(item)
            const ws=warrantyStatus(item.warranty_expiry); const monthlyCost=calcMonthlyCost(item,electricityPrice)
            const itemRepairCost=repairs.filter(r=>r.item_id===item.id).reduce((s,r)=>s+(r.cost||0),0)
            const age=calcAgeDisplay(item.purchase_date)
            const allPhotos=[...(item.photos||[])].filter(Boolean)
            const displayPhoto=item.photo_url||(allPhotos.length>0?allPhotos[0]:'')
            const action=needsAction(item)
            return (
              <div key={item.id} style={{background:'var(--bg-elevated)',border:`1px solid ${action?'var(--warning)25':'var(--border-subtle)'}`,borderRadius:12,overflow:'hidden'}}>
                <div style={{height:120,background:'var(--bg-surface)',position:'relative',overflow:'hidden'}}>
                  {displayPhoto?<img src={displayPhoto} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',fontSize:28}}>{CATEGORY_ICONS[item.category]}</div>}
                  <div style={{position:'absolute',top:8,right:8,display:'flex',gap:4,flexDirection:'column',alignItems:'flex-end'}}>
                    <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                    {item.smart_device&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:5,background:'rgba(212,175,66,0.9)',color:'#000',fontWeight:700}}>SMART</span>}
                  </div>
                  <button onClick={()=>onShowQR(item)} style={{position:'absolute',top:8,left:8,padding:'3px 7px',borderRadius:6,background:'rgba(0,0,0,0.5)',border:'none',color:'#fff',fontSize:10,cursor:'pointer'}}>QR</button>
                  {allPhotos.length>1&&<div style={{position:'absolute',bottom:8,right:8,background:'rgba(0,0,0,0.6)',borderRadius:10,padding:'2px 6px',fontSize:9,color:'#fff'}}>+{allPhotos.length-1} φωτό</div>}
                </div>
                <div style={{padding:'12px 14px'}}>
                  <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:4}}>{CATEGORY_ICONS[item.category]} {item.category}{item.room?` · ${item.room}`:''}{item.brand?` · ${item.brand}`:''}</p>
                  {age&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:6}}>🗓 Ηλικία: {age}</p>}
                  {(item.tags||[]).length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>{(item.tags||[]).map(t=><span key={t} style={{fontSize:9,padding:'1px 6px',borderRadius:10,background:'var(--accent-dim)',color:'var(--accent)',border:'1px solid var(--border-accent)'}}>{t}</span>)}</div>}
                  <DepreciationBar pct={depPct} yearsLeft={yearsLeft}/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:10}}>
                    <div style={{textAlign:'center',padding:'6px',background:'var(--bg-surface)',borderRadius:7}}>
                      <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--positive)'}}>{formatEuro(curVal)}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Τρέχουσα αξία</p>
                    </div>
                    {monthlyCost>0?(
                      <div style={{textAlign:'center',padding:'6px',background:'var(--bg-surface)',borderRadius:7}}>
                        <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--warning)'}}>{formatEuroCents(monthlyCost)}/μήνα</p>
                        <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{calcMonthlyKwh(item)} kWh</p>
                      </div>
                    ):(
                      <div onClick={()=>onEdit(item)} style={{textAlign:'center',padding:'6px',background:'var(--accent-dim)',borderRadius:7,cursor:'pointer',border:'1px dashed var(--border-accent)'}}>
                        <p style={{fontSize:10,color:'var(--accent)',fontWeight:600}}>+ Watt</p>
                        <p style={{fontSize:9,color:'var(--text-tertiary)'}}>Προσθήκη</p>
                      </div>
                    )}
                  </div>
                  {item.warranty_expiry?(
                    <div style={{fontSize:10,color:warrantyStatus(item.warranty_expiry).color,marginTop:8}}>⏱ {warrantyStatus(item.warranty_expiry).label}</div>
                  ):(
                    <div onClick={()=>onEdit(item)} style={{fontSize:10,color:'var(--text-tertiary)',marginTop:8,cursor:'pointer',textDecoration:'underline'}}>+ Προσθήκη ημ/νίας εγγύησης</div>
                  )}
                  {itemRepairCost>0&&<div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:4}}>🔧 Επισκευές: {formatEuro(itemRepairCost)}</div>}
                  <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:'1px solid var(--border-subtle)'}}>
                    <button onClick={()=>onEdit(item)} style={{flex:1,padding:'6px 0',borderRadius:7,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>Επεξεργασία</button>
                    <button onClick={()=>onAddRepair(item)} style={{flex:1,padding:'6px 0',borderRadius:7,border:'1px solid var(--border-subtle)',background:'none',color:'var(--warning)',fontSize:11,cursor:'pointer'}}>🔧</button>
                    <button onClick={()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}} style={{padding:'6px 8px',borderRadius:7,border:'1px solid var(--negative)30',background:'none',color:'var(--negative)',fontSize:11,cursor:'pointer'}}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 80px 1fr 1fr 140px',gap:10,padding:'6px 14px'}}>
            {['Αντικείμενο','Κατηγορία','Κλάση','Αξία','Ρεύμα/μήνα',''].map(h=>(
              <p key={h} style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:600}}>{h}</p>
            ))}
          </div>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const monthlyCost=calcMonthlyCost(item,electricityPrice)
            const age=calcAgeDisplay(item.purchase_date)
            return (
              <div key={item.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 80px 1fr 1fr 140px',gap:10,padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,border:`1px solid ${needsAction(item)?'var(--warning)25':'var(--border-subtle)'}`,alignItems:'center'}}>
                <div>
                  <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{item.name}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)'}}>{item.brand}{item.room?` · ${item.room}`:''}{age?` · ${age}`:''}</p>
                  {(item.tags||[]).length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:3}}>{(item.tags||[]).map(t=><span key={t} style={{fontSize:9,padding:'1px 5px',borderRadius:8,background:'var(--accent-dim)',color:'var(--accent)'}}>{t}</span>)}</div>}
                  <div style={{marginTop:4}}><DepreciationBar pct={calcDepreciationPct(item)} yearsLeft={calcYearsLeft(item)}/></div>
                </div>
                <p style={{fontSize:11,color:'var(--text-secondary)'}}>{CATEGORY_ICONS[item.category]} {item.category}</p>
                <div>{item.energy_class?<EnergyBadge cls={item.energy_class}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                <p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'var(--positive)',fontWeight:700}}>{formatEuro(curVal)}</p>
                <div>
                  {monthlyCost>0
                    ?<p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'var(--warning)',fontWeight:700}}>{formatEuroCents(monthlyCost)}</p>
                    :<button onClick={()=>onEdit(item)} style={{fontSize:10,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>+ Προσθήκη W</button>
                  }
                </div>
                <div style={{display:'flex',gap:4}}>
                  <InlineConditionEdit item={item} onUpdate={onUpdateCondition}/>
                  <button onClick={()=>onShowQR(item)} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:9,cursor:'pointer'}}>QR</button>
                  <button onClick={()=>onEdit(item)} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:10,cursor:'pointer'}}>✎</button>
                  <button onClick={()=>onAddRepair(item)} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--warning)',fontSize:10,cursor:'pointer'}}>🔧</button>
                  <button onClick={()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}} style={{padding:'4px 6px',borderRadius:6,border:'1px solid var(--negative)30',background:'none',color:'var(--negative)',fontSize:10,cursor:'pointer'}}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Warranties Tab ───────────────────────────────────────────────────────────
function WarrantiesTab({items,userId,propertyId}:{items:InventoryItem[];userId:string;propertyId:string}) {
  const [pushing,setPushing] = useState<string|null>(null)
  const [pushed,setPushed] = useState<Set<string>>(new Set())
  const withWarranty = items.filter(i=>i.warranty_expiry).sort((a,b)=>new Date(a.warranty_expiry).getTime()-new Date(b.warranty_expiry).getTime())
  const expired = withWarranty.filter(i=>daysUntil(i.warranty_expiry)<0)
  const expiringSoon = withWarranty.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90})
  const valid = withWarranty.filter(i=>daysUntil(i.warranty_expiry)>90)
  const pushToCalendar = async(item:InventoryItem) => {
    setPushing(item.id)
    const {error} = await supabase.from('calendar_events').insert({
      property_id:propertyId,user_id:userId,
      title:`⏱ Εγγύηση λήγει: ${item.name}`,
      description:`Εγγύηση ${item.brand?`(${item.brand} ${item.model||''}) `:''}λήγει ${formatDate(item.warranty_expiry)}.`,
      event_date:item.warranty_expiry,event_type:'reminder',
      priority:daysUntil(item.warranty_expiry)<=30?'high':'medium',
    })
    if(!error) setPushed(p=>new Set(p).add(item.id))
    else alert('Σφάλμα: '+error.message)
    setPushing(null)
  }
  const Section = ({title,color,list}:{title:string;color:string;list:InventoryItem[]}) =>
    list.length>0?(
      <div style={{background:'var(--bg-elevated)',border:`1px solid ${color}25`,borderRadius:12,padding:16}}>
        {dot(title,<Badge label={`${list.length}`} color={color}/>)}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {list.map(item=>{const ws=warrantyStatus(item.warranty_expiry);return(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'8px 12px',background:'var(--bg-surface)',borderRadius:8}}>
              <div>
                <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{item.name}</p>
                <p style={{fontSize:10,color:'var(--text-tertiary)'}}>{item.brand}{item.model?` · ${item.model}`:''} · {CATEGORY_ICONS[item.category]} {item.category}</p>
              </div>
              {item.serial_number&&<p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'var(--text-tertiary)'}}>SN: {item.serial_number}</p>}
              <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Αγορά: {formatDate(item.purchase_date)}</p>
              <Badge label={ws.label} color={ws.color}/>
              {daysUntil(item.warranty_expiry)>=0&&daysUntil(item.warranty_expiry)<=90&&(
                <button onClick={()=>pushToCalendar(item)} disabled={pushing===item.id||pushed.has(item.id)} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border-subtle)',background:pushed.has(item.id)?'var(--positive)18':'none',color:pushed.has(item.id)?'var(--positive)':'var(--text-secondary)',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>
                  {pushing===item.id?'...':pushed.has(item.id)?'✓ Ημ/λόγιο':'→ Ημ/λόγιο'}
                </button>
              )}
            </div>
          )})}
        </div>
      </div>
    ):null
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
        <KPI label="Ληγμένες" value={String(expired.length)} color="var(--negative)"/>
        <KPI label="Λήγουν ≤90 Μέρες" value={String(expiringSoon.length)} color="var(--warning)"/>
        <KPI label="Σε Ισχύ" value={String(valid.length)} color="var(--positive)"/>
      </div>
      {expiringSoon.length>0&&<div style={{padding:'10px 14px',background:'rgba(251,146,60,0.08)',borderRadius:10,border:'1px solid var(--warning)25'}}><p style={{fontSize:11,color:'var(--warning)'}}>💡 Κάντε κλικ "→ Ημ/λόγιο" για υπενθύμιση στο Ημερολόγιο.</p></div>}
      <Section title="Λήγουν Σύντομα (≤90 Μέρες)" color="var(--warning)" list={expiringSoon}/>
      <Section title="Ληγμένες Εγγυήσεις" color="var(--negative)" list={expired}/>
      <Section title="Εγγυήσεις σε Ισχύ" color="var(--positive)" list={valid}/>
      {withWarranty.length===0&&<div style={{textAlign:'center',padding:'48px 0',color:'var(--text-tertiary)'}}><p style={{fontSize:28,marginBottom:8}}>📋</p><p style={{fontSize:13}}>Δεν έχετε καταχωρήσει ημερομηνίες εγγύησης</p></div>}
    </div>
  )
}

// ─── Handover Tab ─────────────────────────────────────────────────────────────
function HandoverTab({items,handovers,propertyId,userId,onHandoverSaved}:{
  items:InventoryItem[];handovers:InventoryHandover[];
  propertyId:string;userId:string;onHandoverSaved:()=>void
}) {
  const [mode,setMode] = useState<'list'|'new'|'compare'>('list')
  const [handoverType,setHandoverType] = useState<'check_in'|'check_out'>('check_in')
  const [tenantName,setTenantName] = useState('');const [tenantPhone,setTenantPhone] = useState('')
  const [handoverDate,setHandoverDate] = useState('');const [notes,setNotes] = useState('')
  const [itemConditions,setItemConditions] = useState<Record<string,{condition:string;notes:string}>>({})
  const [saving,setSaving] = useState(false)
  const [compareA,setCompareA] = useState('');const [compareB,setCompareB] = useState('')
  useEffect(()=>{
    if(mode==='new'){
      const init:Record<string,{condition:string;notes:string}>={}
      items.forEach(item=>{init[item.id]={condition:item.condition,notes:''}})
      setItemConditions(init)
    }
  },[mode,items])
  const handleSave = async() => {
    if(!tenantName.trim()){alert('Το ονοματεπώνυμο είναι υποχρεωτικό.');return}
    setSaving(true)
    const snapshot:HandoverItemSnapshot[] = items.map(item=>({
      item_id:item.id,name:item.name,category:item.category,
      condition_at_handover:itemConditions[item.id]?.condition||item.condition,
      condition_notes:itemConditions[item.id]?.notes||'',
      photo_url:item.photo_url||'',
    }))
    const {error} = await supabase.from('inventory_handovers').insert({
      property_id:propertyId,user_id:userId,handover_type:handoverType,
      tenant_name:tenantName,tenant_phone:tenantPhone,
      handover_date:handoverDate||new Date().toISOString().split('T')[0],notes,items_snapshot:snapshot,
    })
    if(error){alert('Σφάλμα: '+error.message);setSaving(false);return}
    setMode('list');onHandoverSaved();setSaving(false)
  }
  const printHandover = (h:InventoryHandover) => {
    const snap=h.items_snapshot||[]
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>Πρωτόκολλο</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px}h1{font-size:18px;margin-bottom:4px}.sub{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f4f4f4;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:8px;border-bottom:1px solid #eee}.sig{margin-top:48px;display:flex;gap:60px}.sig-box{flex:1;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#666}@media print{button{display:none}}</style></head><body>
    <h1>Πρωτόκολλο ${h.handover_type==='check_in'?'Παράδοσης':'Παραλαβής'}</h1>
    <div class="sub">Ενοικιαστής: <strong>${h.tenant_name}</strong>${h.tenant_phone?` · ${h.tenant_phone}`:''}<br>Ημερομηνία: <strong>${formatDate(h.handover_date)}</strong></div>
    ${h.notes?`<p><em>${h.notes}</em></p>`:''}
    <table><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κατάσταση</th><th>Παρατηρήσεις</th></tr></thead><tbody>
    ${snap.map(s=>`<tr><td>${s.name}</td><td>${s.category}</td><td>${s.condition_at_handover}</td><td>${s.condition_notes||'—'}</td></tr>`).join('')}
    </tbody></table>
    <div class="sig"><div class="sig-box">Υπογραφή Ιδιοκτήτη</div><div class="sig-box">Υπογραφή Ενοικιαστή</div><div class="sig-box">Ημερομηνία</div></div>
    <button onclick="window.print()" style="margin-top:24px;padding:8px 16px;cursor:pointer">🖨️ Εκτύπωση</button>
    </body></html>`)
    w.document.close()
  }

  // Compare mode
  if(mode==='compare') {
    const hA=handovers.find(h=>h.id===compareA); const hB=handovers.find(h=>h.id===compareB)
    const condOrder=['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
    const allItemNames=[...new Set([...(hA?.items_snapshot||[]).map(s=>s.name),...(hB?.items_snapshot||[]).map(s=>s.name)])]
    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>Σύγκριση Check-In vs Check-Out</p>
          <button onClick={()=>setMode('list')} style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>← Πίσω</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Πρωτόκολλο Α</p>
            <CustomSelect value={compareA} onChange={setCompareA} options={[{value:'',label:'— Επιλέξτε'},...handovers.map(h=>({value:h.id,label:`${h.handover_type==='check_in'?'🔑':'🚪'} ${h.tenant_name} · ${formatDate(h.handover_date)}`}))]}/>
          </div>
          <div>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Πρωτόκολλο Β</p>
            <CustomSelect value={compareB} onChange={setCompareB} options={[{value:'',label:'— Επιλέξτε'},...handovers.filter(h=>h.id!==compareA).map(h=>({value:h.id,label:`${h.handover_type==='check_in'?'🔑':'🚪'} ${h.tenant_name} · ${formatDate(h.handover_date)}`}))]}/>
          </div>
        </div>
        {hA&&hB&&(
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,borderRadius:12,overflow:'hidden',border:'1px solid var(--border-subtle)'}}>
              <div style={{background:'rgba(52,211,153,0.08)',padding:'10px 16px',borderRight:'1px solid var(--border-subtle)'}}>
                <Badge label={hA.handover_type==='check_in'?'🔑 Check-In':'🚪 Check-Out'} color={hA.handover_type==='check_in'?'var(--positive)':'var(--info)'}/>
                <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginTop:6}}>{hA.tenant_name}</p>
                <p style={{fontSize:11,color:'var(--text-tertiary)'}}>{formatDate(hA.handover_date)}</p>
              </div>
              <div style={{background:'rgba(96,165,250,0.08)',padding:'10px 16px'}}>
                <Badge label={hB.handover_type==='check_in'?'🔑 Check-In':'🚪 Check-Out'} color={hB.handover_type==='check_in'?'var(--positive)':'var(--info)'}/>
                <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginTop:6}}>{hB.tenant_name}</p>
                <p style={{fontSize:11,color:'var(--text-tertiary)'}}>{formatDate(hB.handover_date)}</p>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,padding:'6px 14px'}}>
                {['Αντικείμενο','Κατάσταση Α','Κατάσταση Β'].map(h=><p key={h} style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:600}}>{h}</p>)}
              </div>
              {allItemNames.map(name=>{
                const sA=hA.items_snapshot?.find(s=>s.name===name)
                const sB=hB.items_snapshot?.find(s=>s.name===name)
                const condA=sA?.condition_at_handover||'—'; const condB=sB?.condition_at_handover||'—'
                const changed=condA!==condB&&condA!=='—'&&condB!=='—'
                const degraded=changed&&condOrder.indexOf(condB)>condOrder.indexOf(condA)
                return (
                  <div key={name} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,padding:'8px 14px',background:degraded?'rgba(248,113,113,0.06)':changed?'rgba(251,146,60,0.06)':'var(--bg-elevated)',borderRadius:8,marginBottom:4,border:`1px solid ${degraded?'var(--negative)25':changed?'var(--warning)25':'var(--border-subtle)'}`}}>
                    <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{name}{degraded&&<span style={{fontSize:10,color:'var(--negative)',marginLeft:6}}>⬇ Χειροτέρευση</span>}</p>
                    <div>{condA!=='—'?<Badge label={condA} color={CONDITION_COLOR[condA]||'var(--text-tertiary)'}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                    <div>{condB!=='—'?<Badge label={condB} color={CONDITION_COLOR[condB]||'var(--text-tertiary)'}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                  </div>
                )
              })}
            </div>
            {allItemNames.filter(name=>{
              const sA=hA.items_snapshot?.find(s=>s.name===name); const sB=hB.items_snapshot?.find(s=>s.name===name)
              return sA&&sB&&condOrder.indexOf(sB.condition_at_handover)>condOrder.indexOf(sA.condition_at_handover)
            }).length>0&&(
              <div style={{padding:'12px 16px',background:'rgba(248,113,113,0.08)',borderRadius:10,border:'1px solid var(--negative)25'}}>
                <p style={{fontSize:11,color:'var(--negative)',fontWeight:600,marginBottom:4}}>⚠️ Αντικείμενα που χειροτέρεψαν</p>
                <p style={{fontSize:11,color:'var(--text-secondary)'}}>Ελέγξτε αν απαιτείται κράτηση από εγγύηση ή αποζημίωση.</p>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  if(mode==='new') return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <p style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>Νέο Πρωτόκολλο Παράδοσης</p>
        <button onClick={()=>setMode('list')} style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>← Πίσω</button>
      </div>
      {dot('Τύπος Παράδοσης')}
      <div style={{display:'flex',gap:10}}>
        {(['check_in','check_out'] as const).map(t=>(
          <button key={t} onClick={()=>setHandoverType(t)} style={{flex:1,padding:'12px 0',borderRadius:10,cursor:'pointer',fontWeight:600,fontSize:13,border:`1px solid ${handoverType===t?'var(--accent)':'var(--border-subtle)'}`,background:handoverType===t?'var(--accent)':'var(--bg-elevated)',color:handoverType===t?'var(--bg-base)':'var(--text-secondary)'}}>
            {t==='check_in'?'🔑 Check-In — Είσοδος Ενοικιαστή':'🚪 Check-Out — Έξοδος Ενοικιαστή'}
          </button>
        ))}
      </div>
      {dot('Στοιχεία Ενοικιαστή')}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div><p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ονοματεπώνυμο *</p><TextInput value={tenantName} onChange={setTenantName} placeholder="π.χ. Ιωάννης Παπαδόπουλος"/></div>
        <div><p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Τηλέφωνο</p><TextInput value={tenantPhone} onChange={setTenantPhone} placeholder="6912345678"/></div>
        <div><p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ημερομηνία</p><DatePicker value={handoverDate} onChange={setHandoverDate}/></div>
        <div><p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Σημειώσεις</p><TextInput value={notes} onChange={setNotes} placeholder="Γενικές παρατηρήσεις..."/></div>
      </div>
      {dot('Κατάσταση Αντικειμένων',<span style={{fontSize:10,color:'var(--text-tertiary)'}}>{items.length} αντικείμενα</span>)}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {items.map(item=>(
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'auto 1fr 160px 1fr',gap:12,alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
            {item.photo_url?<img src={item.photo_url} style={{width:40,height:40,objectFit:'cover',borderRadius:6}}/>:<div style={{width:40,height:40,background:'var(--bg-surface)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{CATEGORY_ICONS[item.category]}</div>}
            <div><p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{item.name}</p><p style={{fontSize:10,color:'var(--text-tertiary)'}}>{item.category}{item.room?` · ${item.room}`:''}</p></div>
            <CustomSelect value={itemConditions[item.id]?.condition||item.condition} onChange={v=>setItemConditions(p=>({...p,[item.id]:{...p[item.id],condition:v}}))} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
            <TextInput value={itemConditions[item.id]?.notes||''} onChange={v=>setItemConditions(p=>({...p,[item.id]:{...p[item.id],notes:v}}))} placeholder="Παρατηρήσεις..."/>
          </div>
        ))}
      </div>
      {items.length===0&&<div style={{padding:'16px',background:'rgba(251,146,60,0.1)',borderRadius:10,border:'1px solid var(--warning)30'}}><p style={{fontSize:12,color:'var(--warning)'}}>⚠️ Δεν έχετε αντικείμενα στην απογραφή.</p></div>}
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
        <button onClick={()=>setMode('list')} style={{padding:'9px 18px',borderRadius:10,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>Ακύρωση</button>
        <button onClick={handleSave} disabled={saving} style={{padding:'9px 22px',borderRadius:10,background:saving?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση...':'📋 Αποθήκευση Πρωτοκόλλου'}</button>
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        {dot('Πρωτόκολλα Παράδοσης')}
        <div style={{display:'flex',gap:8}}>
          {handovers.length>=2&&<button onClick={()=>setMode('compare')} style={{padding:'8px 14px',borderRadius:10,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontWeight:600,cursor:'pointer'}}>⟺ Σύγκριση</button>}
          <button onClick={()=>setMode('new')} style={{padding:'8px 16px',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Νέο Πρωτόκολλο</button>
        </div>
      </div>
      {handovers.length===0
        ?<div style={{textAlign:'center',padding:'48px 0'}}><p style={{fontSize:28,marginBottom:8}}>📋</p><p style={{fontSize:13,color:'var(--text-secondary)',fontWeight:600}}>Δεν έχετε πρωτόκολλα παράδοσης</p></div>
        :<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {handovers.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map(h=>{
            const snap=h.items_snapshot||[]; const condBad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <Badge label={h.handover_type==='check_in'?'🔑 Check-In':'🚪 Check-Out'} color={h.handover_type==='check_in'?'var(--positive)':'var(--info)'}/>
                      <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{h.tenant_name}</p>
                    </div>
                    <p style={{fontSize:11,color:'var(--text-tertiary)'}}>{formatDate(h.handover_date)}{h.tenant_phone?` · ${h.tenant_phone}`:''}</p>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {condBad>0&&<Badge label={`${condBad} προβλήματα`} color="var(--negative)"/>}
                    <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{snap.length} αντικείμενα</span>
                    <button onClick={()=>printHandover(h)} style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'none',color:'var(--accent)',fontSize:11,cursor:'pointer',fontWeight:600}}>🖨️</button>
                  </div>
                </div>
                {condBad>0&&(
                  <div style={{padding:'8px 12px',background:'rgba(248,113,113,0.08)',borderRadius:8,border:'1px solid var(--negative)25'}}>
                    <p style={{fontSize:10,color:'var(--negative)',fontWeight:600,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Αντικείμενα με Προβλήματα</p>
                    {snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').map((s,idx)=>(
                      <div key={idx} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)',padding:'2px 0'}}>
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

// ─── Maintenance Tab ──────────────────────────────────────────────────────────
function MaintenanceTab({items,schedules,propertyId,userId,onSaved}:{
  items:InventoryItem[];schedules:MaintenanceSchedule[];
  propertyId:string;userId:string;onSaved:()=>void
}) {
  const [adding,setAdding] = useState(false)
  const [pushing,setPushing] = useState<string|null>(null)
  const [pushed,setPushed] = useState<Set<string>>(new Set())
  const [form,setForm] = useState({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:''})
  const [saving,setSaving] = useState(false)
  const overdue=schedules.filter(s=>daysUntil(s.next_due)<0)
  const dueSoon=schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30})
  const upcoming=schedules.filter(s=>daysUntil(s.next_due)>30)
  const pushToCalendar=async(s:MaintenanceSchedule)=>{
    setPushing(s.id)
    const {error}=await supabase.from('calendar_events').insert({property_id:propertyId,user_id:userId,title:`🔧 ${s.task}${s.item_name?` — ${s.item_name}`:''}`,description:`Προγραμματισμένη συντήρηση. Επόμενη: ${formatDate(s.next_due)}`,event_date:s.next_due,event_type:'maintenance',priority:'medium'})
    if(!error) setPushed(p=>new Set(p).add(s.id))
    else alert('Σφάλμα: '+error.message)
    setPushing(null)
  }
  const addSuggested=async(suggestion:{task:string;interval_months:number;category:string})=>{
    const matchingItems=items.filter(i=>i.category===suggestion.category)
    const inserts=matchingItems.length>0
      ?matchingItems.map(item=>({property_id:propertyId,user_id:userId,item_id:item.id,item_name:item.name,task:suggestion.task,interval_months:suggestion.interval_months,last_done:'',next_due:addMonths('',suggestion.interval_months),notes:''}))
      :[{property_id:propertyId,user_id:userId,item_id:'',item_name:'',task:suggestion.task,interval_months:suggestion.interval_months,last_done:'',next_due:addMonths('',suggestion.interval_months),notes:''}]
    await supabase.from('inventory_maintenance').insert(inserts);onSaved()
  }
  const handleSave=async()=>{
    if(!form.task.trim()){alert('Η εργασία είναι υποχρεωτική.');return}
    setSaving(true)
    await supabase.from('inventory_maintenance').insert({property_id:propertyId,user_id:userId,item_id:form.item_id||'',item_name:form.item_name,task:form.task,interval_months:form.interval_months,last_done:form.last_done,next_due:addMonths(form.last_done,form.interval_months),notes:form.notes})
    setAdding(false);setForm({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:''});setSaving(false);onSaved()
  }
  const markDone=async(s:MaintenanceSchedule)=>{
    const today=new Date().toISOString().split('T')[0]
    await supabase.from('inventory_maintenance').update({last_done:today,next_due:addMonths(today,s.interval_months)}).eq('id',s.id);onSaved()
  }
  const deleteSchedule=async(id:string)=>{await supabase.from('inventory_maintenance').delete().eq('id',id);onSaved()}
  const ScheduleRow=({s}:{s:MaintenanceSchedule})=>{
    const days=daysUntil(s.next_due)
    const color=days<0?'var(--negative)':days<=30?'var(--warning)':'var(--positive)'
    const statusLabel=days<0?`Καθυστέρηση ${Math.abs(days)} ημ.`:days===0?'Σήμερα!':`${days} ημέρες`
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,border:`1px solid ${days<0?'var(--negative)':days<=30?'var(--warning)':'var(--border-subtle)'}25`}}>
        <div>
          <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{s.task}</p>
          <p style={{fontSize:10,color:'var(--text-tertiary)'}}>{s.item_name||'Γενική συντήρηση'} · κάθε {s.interval_months} μήνες{s.last_done?` · Τελευταία: ${formatDate(s.last_done)}`:''}</p>
        </div>
        <Badge label={statusLabel} color={color}/>
        <p style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>Επόμενη: {formatDate(s.next_due)}</p>
        <button onClick={()=>markDone(s)} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--positive)30',background:'rgba(52,211,153,0.1)',color:'var(--positive)',fontSize:10,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>✓ Έγινε</button>
        <div style={{display:'flex',gap:4}}>
          <button onClick={()=>pushToCalendar(s)} disabled={pushing===s.id||pushed.has(s.id)} style={{padding:'5px 8px',borderRadius:7,border:'1px solid var(--border-subtle)',background:pushed.has(s.id)?'var(--positive)18':'none',color:pushed.has(s.id)?'var(--positive)':'var(--text-secondary)',fontSize:10,cursor:'pointer'}}>
            {pushing===s.id?'...':pushed.has(s.id)?'✓':'📅'}
          </button>
          <button onClick={()=>{if(confirm('Διαγραφή;'))deleteSchedule(s.id)}} style={{padding:'5px 8px',borderRadius:7,border:'1px solid var(--negative)30',background:'none',color:'var(--negative)',fontSize:10,cursor:'pointer'}}>✕</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        {dot('Πρόγραμμα Συντήρησης')}
        <button onClick={()=>setAdding(true)} style={{padding:'8px 16px',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Νέα Εργασία</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        <KPI label="Σε Καθυστέρηση" value={String(overdue.length)} color="var(--negative)"/>
        <KPI label="Επόμενες 30 Μέρες" value={String(dueSoon.length)} color="var(--warning)"/>
        <KPI label="Προγραμματισμένες" value={String(upcoming.length)} color="var(--positive)"/>
      </div>
      {schedules.length===0&&(
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
          {dot('Προτεινόμενες Εργασίες')}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {DEFAULT_MAINTENANCE.map((s,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--bg-surface)',borderRadius:8}}>
                <div><p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{s.task}</p><p style={{fontSize:10,color:'var(--text-tertiary)'}}>κάθε {s.interval_months} μήνες · {s.category}</p></div>
                <button onClick={()=>addSuggested(s)} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--accent)40',background:'var(--accent-dim)',color:'var(--accent)',fontSize:10,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>+ Προσθήκη</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {overdue.length>0&&(<div style={{display:'flex',flexDirection:'column',gap:8}}>{dot('Σε Καθυστέρηση',<Badge label={`${overdue.length}`} color="var(--negative)"/>)}{overdue.map(s=><ScheduleRow key={s.id} s={s}/>)}</div>)}
      {dueSoon.length>0&&(<div style={{display:'flex',flexDirection:'column',gap:8}}>{dot('Επόμενες 30 Μέρες',<Badge label={`${dueSoon.length}`} color="var(--warning)"/>)}{dueSoon.map(s=><ScheduleRow key={s.id} s={s}/>)}</div>)}
      {upcoming.length>0&&(<div style={{display:'flex',flexDirection:'column',gap:8}}>{dot('Επερχόμενες Εργασίες')}{upcoming.map(s=><ScheduleRow key={s.id} s={s}/>)}</div>)}
      {adding&&(
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-accent)',borderRadius:12,padding:16,display:'flex',flexDirection:'column',gap:12}}>
          {dot('Νέα Εργασία Συντήρησης')}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{gridColumn:'1/-1'}}>
              <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Εργασία *</p>
              <TextInput value={form.task} onChange={v=>setForm(f=>({...f,task:v}))} placeholder="π.χ. Ετήσιος έλεγχος λέβητα"/>
            </div>
            <div>
              <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Αντικείμενο (προαιρετικό)</p>
              <CustomSelect value={form.item_id} onChange={v=>{const item=items.find(i=>i.id===v);setForm(f=>({...f,item_id:v,item_name:item?.name||''}))}} options={[{value:'',label:'— Γενική εργασία'},...items.map(i=>({value:i.id,label:`${CATEGORY_ICONS[i.category]} ${i.name}`}))]}/>
            </div>
            <div>
              <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κάθε (μήνες)</p>
              <NumberInput value={String(form.interval_months)} onChange={v=>setForm(f=>({...f,interval_months:parseInt(v)||1}))} suffix="μήνες" min={1} max={60}/>
            </div>
            <div>
              <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Τελευταία Εκτέλεση</p>
              <DatePicker value={form.last_done} onChange={v=>setForm(f=>({...f,last_done:v}))}/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Σημειώσεις</p>
              <TextInput value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Τεχνικός, παρατηρήσεις..."/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={()=>setAdding(false)} style={{padding:'8px 16px',borderRadius:10,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>Ακύρωση</button>
            <button onClick={handleSave} disabled={saving} style={{padding:'8px 18px',borderRadius:10,background:saving?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση...':'Αποθήκευση'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Exports Tab ──────────────────────────────────────────────────────────────
function ExportsTab({items,repairs,electricityPrice}:{items:InventoryItem[];repairs:InventoryRepair[];electricityPrice:number}) {
  const totalCurrent=items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairCost=repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems=items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyCost=electricItems.reduce((s,i)=>s+calcMonthlyCost(i,electricityPrice),0)
  const exportCSV=()=>{
    const headers=['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Αξία Αγοράς','Τρέχουσα Αξία','Απόσβεση %','Ηλ.Κλάση','Watt','Ώρες/ημ','kWh/μήνα','Κόστος Ρεύμ./μήνα','Smart','Tags','Ηλικία','Ημ/νία Αγοράς','Λήξη Εγγύησης','Σημειώσεις']
    const rows=items.map(i=>[i.name,i.category,i.room,i.brand,i.model,i.serial_number,i.condition,i.purchase_value||'',calcCurrentValue(i),calcDepreciationPct(i)+'%',i.energy_class||'',i.power_watts||'',i.daily_hours_use||'',calcMonthlyKwh(i)||'',electricityPrice>0?calcMonthlyCost(i,electricityPrice).toFixed(2):'',i.smart_device?'Ναι':'Όχι',(i.tags||[]).join(';'),calcAgeDisplay(i.purchase_date),i.purchase_date,i.warranty_expiry,i.notes])
    const csv=[headers,...rows].map(row=>row.map(cell=>`"${String(cell||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='απογραφη.csv';a.click()
  }
  const exportPDF=()=>{
    const byCategory=CATEGORIES.map(cat=>{const catItems=items.filter(i=>i.category===cat);return{cat,count:catItems.length,val:catItems.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
    const w=window.open('','_blank');if(!w)return
    w.document.write(`<html><head><title>Απογραφή Ακινήτου</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:30px}h1{font-size:20px;font-weight:bold;margin-bottom:4px}.subtitle{color:#666;margin-bottom:24px}.kpis{display:flex;gap:12px;margin-bottom:24px}.kpi{flex:1;background:#f8f8f8;border-radius:8px;padding:12px}.kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:4px}.kpi-value{font-size:16px;font-weight:bold;font-family:monospace}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:20px 0 10px;border-bottom:1px solid #eee;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f4f4f4;padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:7px 8px;border-bottom:1px solid #f0f0f0}.footer{margin-top:40px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center}@media print{button{display:none}}</style></head><body>
    <h1>Απογραφή Ακινήτου</h1>
    <div class="subtitle">Έκδοση: ${new Date().toLocaleDateString('el-GR')} · ${items.length} αντικείμενα</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Τρέχουσα Αξία</div><div class="kpi-value">${formatEuro(totalCurrent)}</div></div>
      <div class="kpi"><div class="kpi-label">Ασφαλιστέα Αξία (+10%)</div><div class="kpi-value">${formatEuro(Math.round(totalCurrent*1.1))}</div></div>
      <div class="kpi"><div class="kpi-label">Κόστος Επισκευών</div><div class="kpi-value">${formatEuro(totalRepairCost)}</div></div>
      ${electricItems.length>0?`<div class="kpi"><div class="kpi-label">Ρεύμα/Μήνα</div><div class="kpi-value">${formatEuroCents(totalMonthlyCost)}</div></div>`:''}
    </div>
    <h2>Ανά Κατηγορία</h2>
    ${byCategory.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0"><span>${CATEGORY_ICONS[cat]} ${cat} (${count})</span><span style="font-family:monospace;font-weight:bold">${formatEuro(val)}</span></div>`).join('')}
    <h2>Αναλυτική Απογραφή</h2>
    <table><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κλάση</th><th>Κατάσταση</th><th>Αξία Αγοράς</th><th>Τρέχουσα Αξία</th><th>Απόσβεση</th><th>kWh/μήνα</th><th>Ηλικία</th><th>Εγγύηση</th></tr></thead><tbody>
    ${items.map(i=>`<tr><td><strong>${i.name}</strong>${i.brand?`<br><small>${i.brand} ${i.model||''}</small>`:''}${(i.tags||[]).length>0?`<br><small style="color:#999">${(i.tags||[]).join(', ')}</small>`:''}</td><td>${i.category}</td><td>${i.energy_class||'—'}</td><td>${i.condition}</td><td style="font-family:monospace">${i.purchase_value?formatEuro(i.purchase_value):'—'}</td><td style="font-family:monospace;font-weight:bold">${formatEuro(calcCurrentValue(i))}</td><td>${calcDepreciationPct(i)}%</td><td>${calcMonthlyKwh(i)>0?calcMonthlyKwh(i)+' kWh':'—'}</td><td>${calcAgeDisplay(i.purchase_date)||'—'}</td><td>${i.warranty_expiry?formatDate(i.warranty_expiry):'—'}</td></tr>`).join('')}
    </tbody></table>
    <div class="footer">Property OS · ${new Date().toLocaleDateString('el-GR')}</div>
    <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer">🖨️ Εκτύπωση</button>
    </body></html>`)
    w.document.close()
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {dot('Εξαγωγές Δεδομένων')}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:28,textAlign:'center'}}>📄</div>
          <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',textAlign:'center'}}>Απογραφή PDF</p>
          <p style={{fontSize:11,color:'var(--text-secondary)',textAlign:'center',lineHeight:1.6}}>Πλήρης απογραφή με αξίες, ενεργειακές κλάσεις, ηλικία, tags και εγγυήσεις.</p>
          <div style={{background:'var(--bg-surface)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'var(--text-tertiary)'}}>
            <p>📦 {items.length} αντικείμενα · Αξία: <span style={{fontFamily:'JetBrains Mono, monospace',color:'var(--positive)'}}>{formatEuro(totalCurrent)}</span></p>
            {electricItems.length>0&&<p>⚡ Ρεύμα/μήνα: <span style={{fontFamily:'JetBrains Mono, monospace',color:'var(--warning)'}}>{formatEuroCents(totalMonthlyCost)}</span></p>}
          </div>
          <button onClick={exportPDF} style={{padding:'10px 0',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>📄 Εξαγωγή PDF</button>
        </div>
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:28,textAlign:'center'}}>📊</div>
          <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',textAlign:'center'}}>Εξαγωγή CSV</p>
          <p style={{fontSize:11,color:'var(--text-secondary)',textAlign:'center',lineHeight:1.6}}>Excel-συμβατό με όλες τις στήλες, ηλικία, tags και κατανάλωση ρεύματος.</p>
          <div style={{background:'var(--bg-surface)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'var(--text-tertiary)'}}>
            <p>📋 {items.length} γραμμές · 🔧 Επισκευές: <span style={{fontFamily:'JetBrains Mono, monospace',color:'var(--negative)'}}>{formatEuro(totalRepairCost)}</span></p>
          </div>
          <button onClick={exportCSV} style={{padding:'10px 0',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border-default)',color:'var(--text-primary)',fontSize:12,fontWeight:700,cursor:'pointer'}}>📊 Εξαγωγή CSV</button>
        </div>
      </div>
      <div style={{padding:'14px 16px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25'}}>
        <p style={{fontSize:11,color:'var(--info)',fontWeight:600,marginBottom:4}}>💡 Ασφάλιση Περιεχομένου</p>
        <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>Ασφαλιστέα αξία περιεχομένου: <strong style={{fontFamily:'JetBrains Mono, monospace',color:'var(--info)'}}>{formatEuro(Math.round(totalCurrent*1.1))}</strong> (τρέχουσα αξία +10% buffer). Μεταβείτε στην καρτέλα Λογαριασμοί → Ασφάλεια για ενημέρωση.</p>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabInventory({propertyId,userId}:TabInventoryProps) {
  const [activeTab,setActiveTab] = useState<'overview'|'items'|'warranties'|'handover'|'maintenance'|'exports'>('overview')
  const [items,setItems] = useState<InventoryItem[]>([])
  const [repairs,setRepairs] = useState<InventoryRepair[]>([])
  const [handovers,setHandovers] = useState<InventoryHandover[]>([])
  const [schedules,setSchedules] = useState<MaintenanceSchedule[]>([])
  const [electricityPrice,setElectricityPrice] = useState(0.22)
  const [kwInput,setKwInput] = useState('0.22')
  const [loading,setLoading] = useState(true)
  const [showItemForm,setShowItemForm] = useState(false)
  const [editingItem,setEditingItem] = useState<InventoryItem|null>(null)
  const [repairItem,setRepairItem] = useState<InventoryItem|null>(null)
  const [qrItem,setQrItem] = useState<InventoryItem|null>(null)
  const [showBulkImport,setShowBulkImport] = useState(false)

  const fetchData = useCallback(async()=>{
    setLoading(true)
    const [itemsRes,repairsRes,handoversRes,schedulesRes,billsRes,settingsRes] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_repairs').select('*').eq('user_id',userId).order('repair_date',{ascending:false}),
      supabase.from('inventory_handovers').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_maintenance').select('*').eq('property_id',propertyId).order('next_due'),
      supabase.from('bills_electricity').select('price_per_kwh').eq('property_id',propertyId).limit(1),
      supabase.from('property_settings').select('kwh_price').eq('property_id',propertyId).eq('user_id',userId).limit(1),
    ])
    if(itemsRes.data) setItems(itemsRes.data.map(i=>({...i,photos:i.photos||[],tags:i.tags||[]})))
    if(repairsRes.data) setRepairs(repairsRes.data)
    if(handoversRes.data) setHandovers(handoversRes.data as InventoryHandover[])
    if(schedulesRes.data) setSchedules(schedulesRes.data)
    // Priority: property_settings > bills_electricity > default
    const savedKwh = settingsRes.data?.[0]?.kwh_price || billsRes.data?.[0]?.price_per_kwh
    if(savedKwh) { setElectricityPrice(savedKwh); setKwInput(String(savedKwh)) }
    setLoading(false)
  },[propertyId,userId])

  useEffect(()=>{fetchData()},[fetchData])

  const saveKwhPrice = async(price:number) => {
    await supabase.from('property_settings').upsert({
      property_id:propertyId, user_id:userId, kwh_price:price, updated_at:new Date().toISOString()
    },{onConflict:'property_id,user_id'})
  }

  const handleSaveItem = async(data:Partial<InventoryItem>)=>{
    if(editingItem) await supabase.from('inventory_items').update({...data,updated_at:new Date().toISOString()}).eq('id',editingItem.id)
    else await supabase.from('inventory_items').insert({...data,property_id:propertyId,user_id:userId})
    setShowItemForm(false);setEditingItem(null);fetchData()
  }
  const handleDeleteItem = async(id:string)=>{await supabase.from('inventory_items').delete().eq('id',id);fetchData()}
  const handleAddRepair = async(data:Partial<InventoryRepair>)=>{
    if(!repairItem) return
    await supabase.from('inventory_repairs').insert({...data,item_id:repairItem.id,user_id:userId})
    fetchData()
  }
  const handleUpdateCondition = async(id:string,condition:string)=>{
    await supabase.from('inventory_items').update({condition,updated_at:new Date().toISOString()}).eq('id',id)
    setItems(prev=>prev.map(i=>i.id===id?{...i,condition}:i))
  }

  const TABS = [
    {key:'overview',label:'Επισκόπηση'},
    {key:'items',label:'Αντικείμενα'},
    {key:'warranties',label:'Εγγυήσεις'},
    {key:'handover',label:'Παράδοση'},
    {key:'maintenance',label:'Συντήρηση'},
    {key:'exports',label:'Εξαγωγές'},
  ] as const

  const overdueCount = schedules.filter(s=>daysUntil(s.next_due)<0).length
  const warningCount = schedules.filter(s=>{const d=daysUntil(s.next_due);return d>=0&&d<=30}).length
  const actionCount = items.filter(needsAction).length

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      {(showItemForm||editingItem)&&<ItemFormModal item={editingItem} onSave={handleSaveItem} onClose={()=>{setShowItemForm(false);setEditingItem(null)}}/>}
      {repairItem&&<RepairModal item={repairItem} repairs={repairs} onAdd={handleAddRepair} onClose={()=>setRepairItem(null)} propertyId={propertyId} userId={userId}/>}
      {qrItem&&<QRModal item={qrItem} onClose={()=>setQrItem(null)}/>}
      {showBulkImport&&<BulkImportModal propertyId={propertyId} userId={userId} onImported={fetchData} onClose={()=>setShowBulkImport(false)}/>}

      {/* Header */}
      <div style={{marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <p style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.3px'}}>Απογραφή</p>
            {actionCount>0&&<span style={{padding:'2px 10px',borderRadius:10,background:'rgba(251,146,60,0.15)',color:'var(--warning)',fontSize:11,fontWeight:700,border:'1px solid var(--warning)30'}}>⚠️ {actionCount} αντικείμενα χρειάζονται δράση</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>setShowBulkImport(true)} style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:11,fontWeight:600,cursor:'pointer'}}>📥 Μαζική Εισαγωγή</button>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.1em',whiteSpace:'nowrap'}}>Τιμή Ρεύματος</p>
              <div style={{display:'flex',alignItems:'center',background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:8,overflow:'hidden',width:110}}>
                <input
                  type="text" inputMode="decimal" value={kwInput}
                  onChange={e=>{const raw=e.target.value.replace(',','.');setKwInput(raw);if(/^\d*\.?\d*$/.test(raw)&&raw!=='')setElectricityPrice(parseFloat(raw)||0)}}
                  onFocus={e=>{if(kwInput==='0')setKwInput('');e.target.select()}}
                  onBlur={()=>{
                    const n=parseFloat(kwInput)
                    if(isNaN(n)||kwInput===''){setKwInput('0.22');setElectricityPrice(0.22);saveKwhPrice(0.22)}
                    else{setKwInput(String(n));setElectricityPrice(n);saveKwhPrice(n)}
                  }}
                  placeholder="0.22"
                  style={{flex:1,background:'transparent',border:'none',outline:'none',padding:'7px 8px',fontSize:12,color:'var(--text-primary)',fontFamily:'JetBrains Mono, monospace',width:60}}
                />
                <span style={{padding:'0 8px',fontSize:10,color:'var(--text-secondary)',background:'var(--bg-elevated)',borderLeft:'1px solid var(--border-subtle)',alignSelf:'stretch',display:'flex',alignItems:'center',whiteSpace:'nowrap'}}>€/kWh</span>
              </div>
            </div>
          </div>
        </div>
        <p style={{fontSize:12,color:'var(--text-secondary)'}}>Διαχείριση εξοπλισμού, ενεργειακής κατανάλωσης, εγγυήσεων και παράδοσης</p>
      </div>

      {/* Sub-tabs — ίδιο style με .app-tabs */}
      <div style={{
        display:'flex', gap:2, marginBottom:24,
        borderBottom:'1px solid var(--border-subtle)',
        marginLeft:-24, marginRight:-24, paddingLeft:24,
        overflowX:'auto', flexShrink:0,
      }}>
        {TABS.map(tab=>(
          <button
            key={tab.key}
            onClick={()=>setActiveTab(tab.key)}
            style={{
              position:'relative',
              padding:'12px 18px',
              fontSize:12, fontWeight:activeTab===tab.key?600:500,
              color:activeTab===tab.key?'var(--accent)':'var(--text-secondary)',
              borderBottom:`2px solid ${activeTab===tab.key?'var(--accent)':'transparent'}`,
              borderLeft:'none', borderRight:'none', borderTop:'none',
              background:'none', cursor:'pointer',
              whiteSpace:'nowrap', transition:'all 0.15s',
              fontFamily:'Inter, sans-serif',
            }}
            onMouseEnter={e=>{if(activeTab!==tab.key)(e.currentTarget as HTMLButtonElement).style.color='var(--text-primary)'}}
            onMouseLeave={e=>{if(activeTab!==tab.key)(e.currentTarget as HTMLButtonElement).style.color='var(--text-secondary)'}}
          >
            {tab.label}
            {tab.key==='maintenance'&&(overdueCount>0||warningCount>0)&&(
              <span style={{
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                marginLeft:6, minWidth:16, height:16, borderRadius:8,
                background:overdueCount>0?'var(--negative)':'var(--warning)',
                color:'#fff', fontSize:9, fontWeight:700, padding:'0 4px',
              }}>{overdueCount+warningCount>9?'9+':overdueCount+warningCount}</span>
            )}
            {tab.key==='items'&&actionCount>0&&(
              <span style={{
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                marginLeft:6, minWidth:16, height:16, borderRadius:8,
                background:'var(--warning)', color:'#fff', fontSize:9, fontWeight:700, padding:'0 4px',
              }}>{actionCount>9?'9+':actionCount}</span>
            )}
          </button>
        ))}
      </div>

      {loading?(
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-tertiary)'}}><p style={{fontSize:14}}>Φόρτωση απογραφής...</p></div>
      ):(
        <>
          {activeTab==='overview'&&<OverviewTab items={items} repairs={repairs} electricityPrice={electricityPrice}/>}
          {activeTab==='items'&&<ItemsTab items={items} repairs={repairs} electricityPrice={electricityPrice} onAdd={()=>{setEditingItem(null);setShowItemForm(true)}} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onDelete={handleDeleteItem} onAddRepair={item=>setRepairItem(item)} onShowQR={item=>setQrItem(item)} onUpdateCondition={handleUpdateCondition}/>}
          {activeTab==='warranties'&&<WarrantiesTab items={items} userId={userId} propertyId={propertyId}/>}
          {activeTab==='handover'&&<HandoverTab items={items} handovers={handovers} propertyId={propertyId} userId={userId} onHandoverSaved={fetchData}/>}
          {activeTab==='maintenance'&&<MaintenanceTab items={items} schedules={schedules} propertyId={propertyId} userId={userId} onSaved={fetchData}/>}
          {activeTab==='exports'&&<ExportsTab items={items} repairs={repairs} electricityPrice={electricityPrice}/>}
        </>
      )}
    </div>
  )
}