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
  id: string
  property_id: string
  user_id: string
  name: string
  category: string
  room: string
  brand: string
  model: string
  serial_number: string
  purchase_value: number
  current_value: number
  purchase_date: string
  warranty_expiry: string
  condition: string
  notes: string
  photo_url: string
  energy_class: string
  power_watts: number
  daily_hours_use: number
  standby_watts: number
  replacement_cost: number
  smart_device: boolean
  smart_notes: string
  created_at: string
  updated_at: string
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
  'A+++':'#059669','A++':'#10b981','A+':'#34d399','A':'#6ee7b7',
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

// Smart home suggestions per category
const SMART_IDEAS: Record<string,{ idea: string; saving: string; app: string }[]> = {
  'Ηλεκτρικές Συσκευές': [
    { idea: 'Smart plug με μέτρηση κατανάλωσης', saving: 'Ανίχνευση standby κατανάλωσης — έως 15% εξοικονόμηση', app: 'Tapo/TP-Link, Shelly, Meross' },
    { idea: 'Έξυπνη πρίζα με χρονοδιακόπτη', saving: 'Αυτόματη απενεργοποίηση τη νύχτα', app: 'Shelly 1PM, Sonoff S26' },
  ],
  'Θέρμανση & Ψύξη': [
    { idea: 'Smart θερμοστάτης', saving: 'Έως 20-30% στο κόστος θέρμανσης βάσει ευρωπαϊκών μελετών', app: 'Tado, Nest, Heatmiser' },
    { idea: 'IR controller για κλιματιστικό', saving: 'Έλεγχος από κινητό, χρονοπρογράμματα', app: 'Sensibo, Broadlink RM4' },
  ],
  'Φωτιστικά': [
    { idea: 'Smart LED λαμπτήρες', saving: 'Έως 80% λιγότερη κατανάλωση vs παλαιά λαμπτήρα', app: 'Philips Hue, IKEA TRÅDFRI, Yeelight' },
    { idea: 'Έξυπνος διακόπτης χωρίς καλωδίωση', saving: 'Χρονοπρογράμματα, αισθητήρας παρουσίας', app: 'Shelly i4, Sonoff ZBMINIL2' },
  ],
  'Ηλεκτρονικά': [
    { idea: 'Smart power strip', saving: 'Αποτροπή phantom load από TV/PC/console', app: 'TP-Link HS300, Kasa' },
  ],
}

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
  const lifespan = DEPRECIATION_YEARS[item.category] || 8
  return Math.min(100, Math.round((years/lifespan)*100))
}

function calcYearsLeft(item: InventoryItem): number {
  if (!item.purchase_date) return 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365)
  const lifespan = DEPRECIATION_YEARS[item.category] || 8
  return Math.max(0, Math.round(lifespan - years))
}

// kWh/μήνα υπολογισμός
function calcMonthlyKwh(item: InventoryItem): number {
  if (!item.power_watts || !item.daily_hours_use) return 0
  const activeKwh = (item.power_watts / 1000) * item.daily_hours_use * 30
  const standbyKwh = item.standby_watts ? (item.standby_watts / 1000) * (24 - item.daily_hours_use) * 30 : 0
  return Math.round((activeKwh + standbyKwh) * 10) / 10
}

function calcMonthlyCost(item: InventoryItem, pricePerKwh: number): number {
  return Math.round(calcMonthlyKwh(item) * pricePerKwh * 100) / 100
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
function warrantyStatus(expiry: string): { label: string; color: string } {
  if (!expiry) return { label:'Χωρίς εγγύηση', color:'var(--text-tertiary)' }
  const days = daysUntil(expiry)
  if (days < 0) return { label:'Έληξε', color:'var(--negative)' }
  if (days <= 30) return { label:`Λήγει σε ${days} μέρες`, color:'var(--negative)' }
  if (days <= 90) return { label:`Λήγει σε ${days} μέρες`, color:'var(--warning)' }
  return { label:`Ισχύει έως ${formatDate(expiry)}`, color:'var(--positive)' }
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

// Depreciation progress bar
function DepreciationBar({pct,yearsLeft}:{pct:number;yearsLeft:number}) {
  const color = pct < 40 ? 'var(--positive)' : pct < 70 ? 'var(--warning)' : 'var(--negative)'
  return (
    <div>
      <div style={{height:4,background:'var(--border-subtle)',borderRadius:2,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:2,transition:'width 0.5s ease'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize:9,color:'var(--text-tertiary)'}}>Απόσβεση {pct}%</span>
        {yearsLeft > 0
          ? <span style={{fontSize:9,color:'var(--text-tertiary)'}}>~{yearsLeft} χρόν. απομένουν</span>
          : <span style={{fontSize:9,color:'var(--negative)',fontWeight:600}}>Πλήρης απόσβεση</span>}
      </div>
    </div>
  )
}

// Energy class badge
function EnergyBadge({cls}:{cls:string}) {
  if (!cls) return null
  const color = ENERGY_COLOR[cls] || '#888'
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:5,fontSize:10,fontWeight:800,color:'#fff',background:color,letterSpacing:'0.05em'}}>
      ⚡ {cls}
    </span>
  )
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────
function PhotoUpload({currentUrl,onUploaded}:{currentUrl:string;onUploaded:(url:string)=>void}) {
  const [uploading,setUploading] = useState(false)
  const [preview,setPreview] = useState(currentUrl||'')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file:File) => {
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const {error} = await supabase.storage.from('inventory-photos').upload(path,file,{upsert:true})
    if (error) { alert('Σφάλμα: '+error.message); setUploading(false); return }
    const {data:urlData} = supabase.storage.from('inventory-photos').getPublicUrl(path)
    setPreview(urlData.publicUrl); onUploaded(urlData.publicUrl); setUploading(false)
  }

  return (
    <div onClick={()=>inputRef.current?.click()} style={{width:'100%',height:100,borderRadius:10,border:'1.5px dashed var(--border-accent)',background:preview?'transparent':'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',cursor:uploading?'wait':'pointer',overflow:'hidden',position:'relative'}}>
      {preview
        ? <img src={preview} style={{width:'100%',height:'100%',objectFit:'cover'}} />
        : <div style={{textAlign:'center'}}><p style={{fontSize:20,marginBottom:4}}>📷</p><p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{uploading?'Ανεβάζεται...':'Κλικ για φωτογραφία'}</p></div>
      }
      {preview&&<div style={{position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.5)',padding:'3px 8px',fontSize:10,color:'#fff',textAlign:'center'}}>Κλικ για αλλαγή</div>}
      <input ref={inputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}} />
    </div>
  )
}

// ─── Item Form Modal ──────────────────────────────────────────────────────────
const EMPTY: Partial<InventoryItem> = {
  name:'',category:'Ηλεκτρικές Συσκευές',room:'Κουζίνα',brand:'',model:'',
  serial_number:'',purchase_value:0,purchase_date:'',warranty_expiry:'',
  condition:'Καλή',notes:'',photo_url:'',energy_class:'',power_watts:0,
  daily_hours_use:0,standby_watts:0,replacement_cost:0,smart_device:false,smart_notes:'',
}

function ItemFormModal({item,onSave,onClose}:{item?:InventoryItem|null;onSave:(d:Partial<InventoryItem>)=>void;onClose:()=>void}) {
  const [form,setForm] = useState<Partial<InventoryItem>>(item||EMPTY)
  const [saving,setSaving] = useState(false)
  const [tab,setTab] = useState<'basic'|'energy'|'smart'>('basic')
  const set = (k:keyof InventoryItem,v:any) => setForm(f=>({...f,[k]:v}))

  const isElectric = ['Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Θέρμανση & Ψύξη','Φωτιστικά'].includes(form.category||'')

  const handleSave = async () => {
    if (!form.name?.trim()) { alert('Το όνομα είναι υποχρεωτικό.'); return }
    setSaving(true); await onSave(form); setSaving(false)
  }

  const tabBtnStyle = (t:string) => ({
    padding:'7px 14px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
    border:`1px solid ${tab===t?'var(--accent)':'var(--border-subtle)'}`,
    background:tab===t?'var(--accent)':'none',
    color:tab===t?'var(--bg-base)':'var(--text-secondary)',
  })

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,width:'100%',maxWidth:640,maxHeight:'92vh',overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:18}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <p style={{fontSize:15,fontWeight:700,color:'var(--text-primary)'}}>{item?'Επεξεργασία':'Νέο Αντικείμενο'}</p>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>

        {/* Inner tabs */}
        <div style={{display:'flex',gap:6}}>
          <button style={tabBtnStyle('basic')} onClick={()=>setTab('basic')}>Βασικά</button>
          {isElectric && <button style={tabBtnStyle('energy')} onClick={()=>setTab('energy')}>⚡ Ενέργεια</button>}
          {isElectric && <button style={tabBtnStyle('smart')} onClick={()=>setTab('smart')}>🏠 Smart Home</button>}
        </div>

        {tab === 'basic' && (
          <>
            <PhotoUpload currentUrl={form.photo_url||''} onUploaded={url=>set('photo_url',url)} />
            {dot('Βασικά Στοιχεία')}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={{gridColumn:'1/-1'}}>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ονομασία *</p>
                <TextInput value={form.name||''} onChange={v=>set('name',v)} placeholder="π.χ. Πλυντήριο Ρούχων Bosch" />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κατηγορία</p>
                <CustomSelect value={form.category||'Λοιπά'} onChange={v=>set('category',v)} options={CATEGORIES.map(c=>({value:c,label:`${CATEGORY_ICONS[c]} ${c}`}))} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Χώρος</p>
                <CustomSelect value={form.room||'Σαλόνι'} onChange={v=>set('room',v)} options={ROOMS.map(r=>({value:r,label:r}))} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Μάρκα</p>
                <TextInput value={form.brand||''} onChange={v=>set('brand',v)} placeholder="π.χ. Bosch" />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Μοντέλο</p>
                <TextInput value={form.model||''} onChange={v=>set('model',v)} placeholder="π.χ. WAU28PI0GR" />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Σειριακός Αριθμός</p>
                <TextInput value={form.serial_number||''} onChange={v=>set('serial_number',v)} placeholder="SN / IMEI" />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κατάσταση</p>
                <CustomSelect value={form.condition||'Καλή'} onChange={v=>set('condition',v)} options={CONDITIONS.map(c=>({value:c,label:c}))} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Αξία Αγοράς (€)</p>
                <NumberInput value={String(form.purchase_value||0)} onChange={v=>set('purchase_value',v)} suffix="€" min={0} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Εκτιμώμενο Κόστος Αντικατάστασης (€)</p>
                <NumberInput value={String(form.replacement_cost||0)} onChange={v=>set('replacement_cost',v)} suffix="€" min={0} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ημερομηνία Αγοράς</p>
                <DatePicker value={form.purchase_date||''} onChange={v=>set('purchase_date',v)} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Λήξη Εγγύησης</p>
                <DatePicker value={form.warranty_expiry||''} onChange={v=>set('warranty_expiry',v)} />
              </div>
            </div>
            {dot('Σημειώσεις')}
            <Textarea value={form.notes||''} onChange={v=>set('notes',v)} placeholder="Παρατηρήσεις κατάστασης, ιστορικό..." rows={2} />
          </>
        )}

        {tab === 'energy' && (
          <>
            {dot('Ενεργειακά Στοιχεία')}
            <div style={{padding:'10px 14px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25',marginBottom:4}}>
              <p style={{fontSize:11,color:'var(--info)'}}>💡 Βρες τα στοιχεία στην ετικέτα ενέργειας ή στο εγχειρίδιο του κατασκευαστή. Η κατανάλωση που αναγράφεται είναι η <strong>μέγιστη ισχύς λειτουργίας</strong>.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ενεργειακή Κλάση</p>
                <CustomSelect value={form.energy_class||''} onChange={v=>set('energy_class',v)} options={[{value:'',label:'— Δεν γνωρίζω'},...ENERGY_CLASSES.map(c=>({value:c,label:c}))]} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Ισχύς Λειτουργίας (Watt)</p>
                <NumberInput value={String(form.power_watts||0)} onChange={v=>set('power_watts',v)} suffix="W" min={0} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Μέσες Ώρες Χρήσης / Ημέρα</p>
                <NumberInput value={String(form.daily_hours_use||0)} onChange={v=>set('daily_hours_use',v)} suffix="ώρ/ημ" min={0} />
              </div>
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κατανάλωση Αναμονής (Watt standby)</p>
                <NumberInput value={String(form.standby_watts||0)} onChange={v=>set('standby_watts',v)} suffix="W" min={0} />
              </div>
            </div>
            {/* Live preview */}
            {(form.power_watts||0) > 0 && (form.daily_hours_use||0) > 0 && (
              <div style={{background:'var(--bg-elevated)',borderRadius:10,padding:'14px 16px',border:'1px solid var(--border-subtle)'}}>
                <p style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10,fontWeight:600}}>Εκτιμώμενη Κατανάλωση (βάσει στοιχείων κατασκευαστή)</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  {[
                    {label:'kWh / Μήνα', value:`${(((form.power_watts||0)/1000)*(form.daily_hours_use||0)*30).toFixed(1)} kWh`},
                    {label:'kWh / Έτος', value:`${(((form.power_watts||0)/1000)*(form.daily_hours_use||0)*365).toFixed(0)} kWh`},
                    {label:'Κόστος / Μήνα (~0.22€/kWh)', value:formatEuroCents((((form.power_watts||0)/1000)*(form.daily_hours_use||0)*30)*0.22)},
                  ].map((k,i)=>(
                    <div key={i} style={{textAlign:'center',padding:'10px',background:'var(--bg-surface)',borderRadius:8}}>
                      <p style={{fontSize:13,fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--text-primary)',marginBottom:3}}>{k.value}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{k.label}</p>
                    </div>
                  ))}
                </div>
                <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:8}}>* Η πραγματική κατανάλωση εξαρτάται από τον τρόπο χρήσης, τις ρυθμίσεις και τις συνθήκες λειτουργίας. Τα νούμερα αυτά είναι εκτιμήσεις βάσει των τεχνικών χαρακτηριστικών που δηλώσατε.</p>
              </div>
            )}
          </>
        )}

        {tab === 'smart' && (
          <>
            {dot('Smart Home Αναβάθμιση')}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
              <div>
                <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>Έξυπνη Συσκευή</p>
                <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Συνδέεται με app, smart plug ή automation</p>
              </div>
              <Toggle on={form.smart_device||false} onChange={(v:boolean)=>set('smart_device',v)} />
            </div>
            {form.smart_device && (
              <div>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>App / Σύστημα Ελέγχου</p>
                <TextInput value={form.smart_notes||''} onChange={v=>set('smart_notes',v)} placeholder="π.χ. Shelly 1PM + Home Assistant" />
              </div>
            )}

            {/* Smart ideas */}
            {(SMART_IDEAS[form.category||'']||[]).length > 0 && (
              <>
                {dot('Προτάσεις για αυτή την κατηγορία')}
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {(SMART_IDEAS[form.category||'']||[]).map((idea,i)=>(
                    <div key={i} style={{padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
                      <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>🔌 {idea.idea}</p>
                      <p style={{fontSize:11,color:'var(--positive)',marginBottom:4}}>📉 {idea.saving}</p>
                      <p style={{fontSize:10,color:'var(--text-tertiary)'}}>Apps/Devices: <span style={{color:'var(--info)'}}>{idea.app}</span></p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{padding:'12px 14px',background:'rgba(212,175,66,0.08)',borderRadius:10,border:'1px solid var(--border-accent)'}}>
              <p style={{fontSize:11,color:'var(--accent)',fontWeight:600,marginBottom:6}}>💡 Γενικές Smart Home Συμβουλές</p>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[
                  'Smart plugs με μέτρηση κατανάλωσης (Shelly, Tapo): γνωρίζεις ακριβώς τι καταναλώνει κάθε συσκευή',
                  'Home Assistant (δωρεάν, self-hosted): ενοποιεί όλες τις έξυπνες συσκευές σε ένα dashboard',
                  'Google Home / Amazon Alexa: φωνητικός έλεγχος, αυτοματισμοί ώρας',
                  'Zigbee/Z-Wave: πρωτόκολλα χαμηλής κατανάλωσης για αισθητήρες',
                ].map((tip,i)=>(
                  <p key={i} style={{fontSize:11,color:'var(--text-secondary)',paddingLeft:12,borderLeft:'2px solid var(--border-accent)'}}>→ {tip}</p>
                ))}
              </div>
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

// ─── Repair Modal ─────────────────────────────────────────────────────────────
function RepairModal({item,repairs,onAdd,onClose}:{item:InventoryItem;repairs:InventoryRepair[];onAdd:(r:Partial<InventoryRepair>)=>void;onClose:()=>void}) {
  const [form,setForm] = useState({repair_date:'',cost:0,technician:'',description:''})
  const [saving,setSaving] = useState(false)
  const set = (k:string,v:any) => setForm(f=>({...f,[k]:v}))
  const handleAdd = async () => {
    if (!form.description.trim()) { alert('Η περιγραφή είναι υποχρεωτική.'); return }
    setSaving(true); await onAdd(form); setForm({repair_date:'',cost:0,technician:'',description:''}); setSaving(false)
  }
  const itemRepairs = repairs.filter(r=>r.item_id===item.id)
  const totalCost = itemRepairs.reduce((s,r)=>s+(r.cost||0),0)
  const depPct = calcDepreciationPct(item)
  const curVal = calcCurrentValue(item)
  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,width:'100%',maxWidth:520,maxHeight:'85vh',overflowY:'auto',padding:24,display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <p style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>Επισκευές — {item.name}</p>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>

        {/* Repair vs replace insight */}
        {totalCost > 0 && curVal > 0 && (
          <div style={{padding:'10px 14px',background: totalCost > curVal*0.5 ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)',borderRadius:10,border:`1px solid ${totalCost > curVal*0.5 ? 'var(--negative)' : 'var(--positive)'}25`}}>
            <p style={{fontSize:11,color:totalCost > curVal*0.5 ? 'var(--negative)' : 'var(--positive)',fontWeight:600}}>
              {totalCost > curVal*0.5
                ? `⚠️ Συνολικό κόστος επισκευών (${formatEuro(totalCost)}) > 50% τρέχουσας αξίας (${formatEuro(curVal)}) — Αξιολογήστε αντικατάσταση`
                : `✓ Κόστος επισκευών (${formatEuro(totalCost)}) εντός λογικών ορίων vs τρέχουσα αξία (${formatEuro(curVal)})`
              }
            </p>
          </div>
        )}

        <DepreciationBar pct={depPct} yearsLeft={calcYearsLeft(item)} />

        {itemRepairs.length > 0 && (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {dot('Ιστορικό Επισκευών', <span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'var(--negative)'}}>Σύνολο: {formatEuro(totalCost)}</span>)}
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
            <DatePicker value={form.repair_date} onChange={v=>set('repair_date',v)} />
          </div>
          <div>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Κόστος (€)</p>
            <NumberInput value={String(form.cost)} onChange={v=>set('cost',v)} suffix="€" min={0} />
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Τεχνικός / Συνεργείο</p>
            <TextInput value={form.technician} onChange={v=>set('technician',v)} placeholder="π.χ. Ηλεκτρολόγος Παπαδόπουλος" />
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6,fontWeight:600}}>Περιγραφή *</p>
            <Textarea value={form.description} onChange={v=>set('description',v)} placeholder="Τι επισκευάστηκε..." rows={2} />
          </div>
        </div>
        <button onClick={handleAdd} disabled={saving} style={{padding:'9px 20px',borderRadius:10,background:saving?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:saving?'wait':'pointer',alignSelf:'flex-end'}}>
          {saving?'Αποθήκευση...':'Καταχώρηση Επισκευής'}
        </button>
      </div>
    </div>
  )
}

// ─── Overview Sub-tab ─────────────────────────────────────────────────────────
function OverviewTab({items,repairs,electricityPrice}:{items:InventoryItem[];repairs:InventoryRepair[];electricityPrice:number}) {
  const totalPurchase = items.reduce((s,i)=>s+(i.purchase_value||0),0)
  const totalCurrent = items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const insurableValue = Math.round(totalCurrent*1.1)
  const totalRepairs = repairs.reduce((s,r)=>s+(r.cost||0),0)

  // Energy totals — only items with power data
  const electricItems = items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyKwh = electricItems.reduce((s,i)=>s+calcMonthlyKwh(i),0)
  const totalMonthlyCost = electricItems.reduce((s,i)=>s+calcMonthlyCost(i,electricityPrice),0)

  const byCategory = CATEGORIES.map(cat=>{
    const catItems = items.filter(i=>i.category===cat)
    const val = catItems.reduce((s,i)=>s+calcCurrentValue(i),0)
    return {cat,count:catItems.length,val}
  }).filter(x=>x.count>0)
  const maxVal = Math.max(...byCategory.map(x=>x.val),1)

  // Fully deprecated
  const fullyDepreciated = items.filter(i=>calcDepreciationPct(i)>=100&&i.purchase_date)
  // Expiring warranty
  const warrantyAlert = items.filter(i=>{const d=daysUntil(i.warranty_expiry);return d>=0&&d<=90})
  // High energy consumers
  const topEnergy = [...electricItems].sort((a,b)=>calcMonthlyCost(b,electricityPrice)-calcMonthlyCost(a,electricityPrice)).slice(0,5)
  // Needs attention
  const needsAttention = items.filter(i=>i.condition==='Κακή'||i.condition==='Εκτός Λειτουργίας')

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
        <KPI label="Αντικείμενα" value={String(items.length)} sub={`${byCategory.length} κατηγορίες`} />
        <KPI label="Τρέχουσα Αξία" value={formatEuro(totalCurrent)} color="var(--positive)" sub="Μετά απόσβεση" />
        <KPI label="Ασφαλιστέα Αξία" value={formatEuro(insurableValue)} color="var(--info)" sub="+10% buffer" />
        <KPI label="Κόστος Επισκευών" value={formatEuro(totalRepairs)} color="var(--warning)" />
        {electricItems.length>0
          ? <KPI label="Κόστος Ρεύματος/Μήνα" value={formatEuroCents(totalMonthlyCost)} color="var(--accent)" sub={`${Math.round(totalMonthlyKwh)} kWh · ${electricItems.length} συσκευές`} />
          : <KPI label="Ρεύμα" value="—" sub="Προσθέστε στοιχεία κατανάλωσης" />
        }
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* Category chart */}
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
                  <div style={{height:4,borderRadius:2,background:'var(--accent)',width:`${(val/maxVal)*100}%`,transition:'width 0.5s ease'}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:10,color:'var(--text-tertiary)'}}>Αξία Αγοράς</span>
            <span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'var(--text-secondary)'}}>{formatEuro(totalPurchase)}</span>
          </div>
        </div>

        {/* Energy ranking */}
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
          {dot('Κατανάλωση Ρεύματος ανά Συσκευή', electricItems.length>0?<span style={{fontSize:10,color:'var(--text-tertiary)'}}>{electricityPrice>0?`${electricityPrice}€/kWh`:'Δεν έχει οριστεί τιμή'}</span>:undefined)}
          {electricItems.length===0 ? (
            <div style={{textAlign:'center',padding:'20px 0'}}>
              <p style={{fontSize:28,marginBottom:8}}>⚡</p>
              <p style={{fontSize:12,color:'var(--text-secondary)',fontWeight:600,marginBottom:4}}>Δεν υπάρχουν δεδομένα κατανάλωσης</p>
              <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Προσθέστε Watt & ώρες χρήσης στις ηλεκτρικές συσκευές</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {topEnergy.map(item=>{
                const monthly = calcMonthlyCost(item,electricityPrice)
                const kWh = calcMonthlyKwh(item)
                const maxCost = calcMonthlyCost(topEnergy[0],electricityPrice)
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
              {electricityPrice===0&&(
                <p style={{fontSize:10,color:'var(--text-tertiary)',textAlign:'center',marginTop:8}}>Ορίστε την τιμή ρεύματος στα στοιχεία ρεύματος για ακριβή κόστη</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alerts row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        {/* Fully deprecated */}
        <div style={{background:'var(--bg-elevated)',border:`1px solid ${fullyDepreciated.length>0?'var(--negative)':'var(--border-subtle)'}25`,borderRadius:12,padding:16}}>
          {dot('Πλήρης Απόσβεση', fullyDepreciated.length>0?<Badge label={`${fullyDepreciated.length}`} color="var(--negative)"/>:undefined)}
          {fullyDepreciated.length===0
            ? <p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 0'}}>Κανένα αντικείμενο δεν έχει πλήρη απόσβεση</p>
            : <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {fullyDepreciated.slice(0,4).map(item=>(
                  <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-surface)',borderRadius:8}}>
                    <span style={{fontSize:11,color:'var(--text-primary)'}}>{item.name}</span>
                    <span style={{fontSize:10,color:'var(--negative)',fontFamily:'JetBrains Mono, monospace'}}>{item.replacement_cost?formatEuro(item.replacement_cost):'—'}</span>
                  </div>
                ))}
                {fullyDepreciated.length>4&&<p style={{fontSize:10,color:'var(--text-tertiary)',textAlign:'center'}}>+{fullyDepreciated.length-4} ακόμα</p>}
              </div>
          }
        </div>

        {/* Warranty alerts */}
        <div style={{background:'var(--bg-elevated)',border:`1px solid ${warrantyAlert.length>0?'var(--warning)':'var(--border-subtle)'}25`,borderRadius:12,padding:16}}>
          {dot('Εγγυήσεις ≤90 Ημέρες', warrantyAlert.length>0?<Badge label={`${warrantyAlert.length}`} color="var(--warning)"/>:undefined)}
          {warrantyAlert.length===0
            ? <p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 0'}}>Καμία εγγύηση δεν λήγει σύντομα</p>
            : <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {warrantyAlert.slice(0,4).map(item=>{const ws=warrantyStatus(item.warranty_expiry);return(
                  <div key={item.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--bg-surface)',borderRadius:8}}>
                    <span style={{fontSize:11,color:'var(--text-primary)'}}>{item.name}</span>
                    <Badge label={ws.label} color={ws.color}/>
                  </div>
                )})}
              </div>
          }
        </div>

        {/* Needs attention */}
        <div style={{background:'var(--bg-elevated)',border:`1px solid ${needsAttention.length>0?'var(--negative)':'var(--border-subtle)'}25`,borderRadius:12,padding:16}}>
          {dot('Χρειάζονται Προσοχή', needsAttention.length>0?<Badge label={`${needsAttention.length}`} color="var(--negative)"/>:undefined)}
          {needsAttention.length===0
            ? <p style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',padding:'8px 0'}}>Όλα σε καλή κατάσταση</p>
            : <div style={{display:'flex',flexDirection:'column',gap:6}}>
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

      {/* Energy savings suggestions — only if data exists */}
      {electricItems.length>0&&(
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
          {dot('Προτάσεις Εξοικονόμησης Ενέργειας')}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {electricItems.filter(i=>!['A+++','A++','A+','A'].includes(i.energy_class||'')).length>0&&(
              <div style={{padding:'10px 14px',background:'rgba(251,146,60,0.08)',borderRadius:10,border:'1px solid var(--warning)25'}}>
                <p style={{fontSize:11,color:'var(--warning)',fontWeight:600,marginBottom:4}}>⚡ Συσκευές με χαμηλή ενεργειακή κλάση</p>
                <p style={{fontSize:11,color:'var(--text-secondary)'}}>
                  {electricItems.filter(i=>!['A+++','A++','A+','A'].includes(i.energy_class||'')).map(i=>i.name).join(', ')} — Η αντικατάστασή τους με κλάση Α+ ή ανώτερη μπορεί να μειώσει σημαντικά την κατανάλωση. Ελέγξτε επιδοτήσεις ΕΣΠΑ για ενεργειακές αναβαθμίσεις.
                </p>
              </div>
            )}
            {electricItems.filter(i=>(i.standby_watts||0)>10).length>0&&(
              <div style={{padding:'10px 14px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25'}}>
                <p style={{fontSize:11,color:'var(--info)',fontWeight:600,marginBottom:4}}>🔌 Υψηλή κατανάλωση αναμονής (standby)</p>
                <p style={{fontSize:11,color:'var(--text-secondary)'}}>
                  {electricItems.filter(i=>(i.standby_watts||0)>10).map(i=>`${i.name} (${i.standby_watts}W standby)`).join(', ')}. Χρήση smart plug με χρονοδιακόπτη μπορεί να εξαλείψει αυτή την κατανάλωση.
                </p>
              </div>
            )}
            <div style={{padding:'10px 14px',background:'rgba(212,175,66,0.08)',borderRadius:10,border:'1px solid var(--border-accent)'}}>
              <p style={{fontSize:11,color:'var(--accent)',fontWeight:600,marginBottom:4}}>🏠 Smart Home Quick Wins</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:6}}>
                {[
                  {title:'Smart plugs με μέτρηση',desc:'Tapo P115, Shelly Plug S — γνωρίζεις ακριβώς τι καταναλώνει κάθε συσκευή'},
                  {title:'Smart θερμοστάτης',desc:'Tado, Nest — αυτόματη ρύθμιση θερμοκρασίας. Εκτιμώμενη εξοικονόμηση 15-25% στη θέρμανση βάσει ευρωπαϊκών μελετών'},
                  {title:'LED αναβάθμιση',desc:'Philips Hue, IKEA TRÅDFRI — έως 80% λιγότερη κατανάλωση vs παλαιοί λαμπτήρες'},
                  {title:'Home Assistant (δωρεάν)',desc:'Ενοποίηση όλων των έξυπνων συσκευών, automation, monitoring κατανάλωσης'},
                ].map((tip,i)=>(
                  <div key={i} style={{padding:'8px 10px',background:'var(--bg-surface)',borderRadius:8}}>
                    <p style={{fontSize:11,fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>{tip.title}</p>
                    <p style={{fontSize:10,color:'var(--text-secondary)',lineHeight:1.5}}>{tip.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Items Sub-tab ────────────────────────────────────────────────────────────
function ItemsTab({items,repairs,electricityPrice,onAdd,onEdit,onDelete,onAddRepair}:{
  items:InventoryItem[];repairs:InventoryRepair[];electricityPrice:number
  onAdd:()=>void;onEdit:(i:InventoryItem)=>void;onDelete:(id:string)=>void;onAddRepair:(i:InventoryItem)=>void
}) {
  const [filterCat,setFilterCat] = useState('Όλες')
  const [filterRoom,setFilterRoom] = useState('Όλα')
  const [search,setSearch] = useState('')
  const [viewMode,setViewMode] = useState<'grid'|'list'>('grid')

  const filtered = items.filter(item=>{
    const matchCat = filterCat==='Όλες'||item.category===filterCat
    const matchRoom = filterRoom==='Όλα'||item.room===filterRoom
    const matchSearch = !search||item.name.toLowerCase().includes(search.toLowerCase())||item.brand?.toLowerCase().includes(search.toLowerCase())
    return matchCat&&matchRoom&&matchSearch
  })
  const usedCategories = ['Όλες',...CATEGORIES.filter(c=>items.some(i=>i.category===c))]
  const usedRooms = ['Όλα',...ROOMS.filter(r=>items.some(i=>i.room===r))]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:180}}>
          <TextInput value={search} onChange={setSearch} placeholder="Αναζήτηση αντικειμένου, μάρκας..." />
        </div>
        <div style={{width:160}}>
          <CustomSelect value={filterCat} onChange={setFilterCat} options={usedCategories.map(c=>({value:c,label:c==='Όλες'?'Όλες οι Κατηγορίες':`${CATEGORY_ICONS[c]} ${c}`}))} />
        </div>
        <div style={{width:150}}>
          <CustomSelect value={filterRoom} onChange={setFilterRoom} options={usedRooms.map(r=>({value:r,label:r==='Όλα'?'Όλα τα Δωμάτια':r}))} />
        </div>
        <div style={{display:'flex',gap:4}}>
          {(['grid','list'] as const).map(m=>(
            <button key={m} onClick={()=>setViewMode(m)} style={{padding:'7px 12px',borderRadius:8,fontSize:11,cursor:'pointer',fontWeight:600,border:`1px solid ${viewMode===m?'var(--accent)':'var(--border-subtle)'}`,background:viewMode===m?'var(--accent)':'var(--bg-elevated)',color:viewMode===m?'var(--bg-base)':'var(--text-secondary)'}}>
              {m==='grid'?'⊞ Πλέγμα':'☰ Λίστα'}
            </button>
          ))}
        </div>
        <button onClick={onAdd} style={{padding:'8px 16px',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Νέο Αντικείμενο</button>
      </div>

      {filtered.length===0 ? (
        <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-tertiary)'}}>
          <p style={{fontSize:28,marginBottom:8}}>📦</p>
          <p style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)',marginBottom:4}}>{items.length===0?'Δεν έχετε καταχωρήσει αντικείμενα':'Δεν βρέθηκαν αποτελέσματα'}</p>
          <p style={{fontSize:12,color:'var(--text-tertiary)'}}>{items.length===0?'Προσθέστε έπιπλα, συσκευές και εξοπλισμό':'Δοκιμάστε διαφορετικά φίλτρα'}</p>
        </div>
      ) : viewMode==='grid' ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:12}}>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item); const yearsLeft=calcYearsLeft(item)
            const ws=warrantyStatus(item.warranty_expiry); const monthlyCost=calcMonthlyCost(item,electricityPrice)
            const itemRepairCost=repairs.filter(r=>r.item_id===item.id).reduce((s,r)=>s+(r.cost||0),0)
            return (
              <div key={item.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,overflow:'hidden'}}>
                <div style={{height:120,background:'var(--bg-surface)',position:'relative',overflow:'hidden'}}>
                  {item.photo_url
                    ? <img src={item.photo_url} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                    : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',fontSize:28}}>{CATEGORY_ICONS[item.category]}</div>
                  }
                  <div style={{position:'absolute',top:8,right:8,display:'flex',gap:4,flexDirection:'column',alignItems:'flex-end'}}>
                    <Badge label={item.condition} color={CONDITION_COLOR[item.condition]}/>
                    {item.energy_class&&<EnergyBadge cls={item.energy_class}/>}
                    {item.smart_device&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:5,background:'rgba(212,175,66,0.9)',color:'#000',fontWeight:700}}>SMART</span>}
                  </div>
                </div>
                <div style={{padding:'12px 14px'}}>
                  <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:8}}>{CATEGORY_ICONS[item.category]} {item.category}{item.room?` · ${item.room}`:''}{item.brand?` · ${item.brand}`:''}</p>
                  <DepreciationBar pct={depPct} yearsLeft={yearsLeft}/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:10}}>
                    <div style={{textAlign:'center',padding:'6px',background:'var(--bg-surface)',borderRadius:7}}>
                      <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--positive)'}}>{formatEuro(curVal)}</p>
                      <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Τρέχουσα αξία</p>
                    </div>
                    {monthlyCost>0
                      ? <div style={{textAlign:'center',padding:'6px',background:'var(--bg-surface)',borderRadius:7}}>
                          <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',fontWeight:700,color:'var(--warning)'}}>{formatEuroCents(monthlyCost)}/μήνα</p>
                          <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{calcMonthlyKwh(item)} kWh</p>
                        </div>
                      : <div style={{textAlign:'center',padding:'6px',background:'var(--bg-surface)',borderRadius:7}}>
                          <p style={{fontSize:11,color:'var(--text-tertiary)'}}>—</p>
                          <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Δεν έχει W</p>
                        </div>
                    }
                  </div>
                  {item.warranty_expiry&&<div style={{fontSize:10,color:ws.color,marginTop:8}}>⏱ {ws.label}</div>}
                  {itemRepairCost>0&&<div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:4}}>🔧 Επισκευές: {formatEuro(itemRepairCost)}</div>}
                  <div style={{display:'flex',gap:6,marginTop:10,paddingTop:10,borderTop:'1px solid var(--border-subtle)'}}>
                    <button onClick={()=>onEdit(item)} style={{flex:1,padding:'6px 0',borderRadius:7,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>Επεξεργασία</button>
                    <button onClick={()=>onAddRepair(item)} style={{flex:1,padding:'6px 0',borderRadius:7,border:'1px solid var(--border-subtle)',background:'none',color:'var(--warning)',fontSize:11,cursor:'pointer'}}>🔧 Επισκευή</button>
                    <button onClick={()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}} style={{padding:'6px 8px',borderRadius:7,border:'1px solid var(--negative)30',background:'none',color:'var(--negative)',fontSize:11,cursor:'pointer'}}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 80px 1fr 1fr 120px',gap:10,padding:'6px 14px'}}>
            {['Αντικείμενο','Κατηγορία','Κλάση','Αξία','Ρεύμα/μήνα',''].map(h=>(
              <p key={h} style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:600}}>{h}</p>
            ))}
          </div>
          {filtered.map(item=>{
            const curVal=calcCurrentValue(item); const depPct=calcDepreciationPct(item)
            const monthlyCost=calcMonthlyCost(item,electricityPrice)
            return (
              <div key={item.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 80px 1fr 1fr 120px',gap:10,padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)',alignItems:'center'}}>
                <div>
                  <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{item.name}</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)'}}>{item.brand}{item.room?` · ${item.room}`:''}</p>
                  <div style={{marginTop:4}}><DepreciationBar pct={depPct} yearsLeft={calcYearsLeft(item)}/></div>
                </div>
                <p style={{fontSize:11,color:'var(--text-secondary)'}}>{CATEGORY_ICONS[item.category]} {item.category}</p>
                <div>{item.energy_class?<EnergyBadge cls={item.energy_class}/>:<span style={{fontSize:11,color:'var(--text-tertiary)'}}>—</span>}</div>
                <p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'var(--positive)',fontWeight:700}}>{formatEuro(curVal)}</p>
                <p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:monthlyCost>0?'var(--warning)':'var(--text-tertiary)',fontWeight:monthlyCost>0?700:400}}>{monthlyCost>0?formatEuroCents(monthlyCost)+'€':'—'}</p>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>onEdit(item)} style={{padding:'5px 8px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:10,cursor:'pointer'}}>✎</button>
                  <button onClick={()=>onAddRepair(item)} style={{padding:'5px 8px',borderRadius:6,border:'1px solid var(--border-subtle)',background:'none',color:'var(--warning)',fontSize:10,cursor:'pointer'}}>🔧</button>
                  <button onClick={()=>{if(confirm(`Διαγραφή "${item.name}";`))onDelete(item.id)}} style={{padding:'5px 8px',borderRadius:6,border:'1px solid var(--negative)30',background:'none',color:'var(--negative)',fontSize:10,cursor:'pointer'}}>✕</button>
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

  const pushToCalendar = async (item:InventoryItem) => {
    setPushing(item.id)
    const {error} = await supabase.from('calendar_events').insert({
      property_id: propertyId,
      user_id: userId,
      title: `⏱ Εγγύηση λήγει: ${item.name}`,
      description: `Η εγγύηση ${item.brand?`(${item.brand} ${item.model||''}) `:''}λήγει στις ${formatDate(item.warranty_expiry)}. Ελέγξτε αν θέλετε να την ανανεώσετε.`,
      event_date: item.warranty_expiry,
      event_type: 'reminder',
      priority: daysUntil(item.warranty_expiry)<=30 ? 'high' : 'medium',
    })
    if (!error) setPushed(p=>new Set(p).add(item.id))
    else alert('Σφάλμα: '+error.message)
    setPushing(null)
  }

  const Section = ({title,color,list}:{title:string;color:string;list:InventoryItem[]}) =>
    list.length>0 ? (
      <div style={{background:'var(--bg-elevated)',border:`1px solid ${color}25`,borderRadius:12,padding:16}}>
        {dot(title,<Badge label={`${list.length}`} color={color}/>)}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {list.map(item=>{const ws=warrantyStatus(item.warranty_expiry); return(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'8px 12px',background:'var(--bg-surface)',borderRadius:8}}>
              <div>
                <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{item.name}</p>
                <p style={{fontSize:10,color:'var(--text-tertiary)'}}>{item.brand}{item.model?` · ${item.model}`:''} · {CATEGORY_ICONS[item.category]} {item.category}</p>
              </div>
              {item.serial_number&&<p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'var(--text-tertiary)'}}>SN: {item.serial_number}</p>}
              <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Αγορά: {formatDate(item.purchase_date)}</p>
              <Badge label={ws.label} color={ws.color}/>
              {daysUntil(item.warranty_expiry)>=0&&daysUntil(item.warranty_expiry)<=90&&(
                <button
                  onClick={()=>pushToCalendar(item)}
                  disabled={pushing===item.id||pushed.has(item.id)}
                  style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border-subtle)',background:pushed.has(item.id)?'var(--positive)18':'none',color:pushed.has(item.id)?'var(--positive)':'var(--text-secondary)',fontSize:10,cursor:pushing===item.id?'wait':'pointer',whiteSpace:'nowrap'}}
                >
                  {pushing===item.id?'...' : pushed.has(item.id)?'✓ Στο Ημ/λόγιο':'→ Ημ/λόγιο'}
                </button>
              )}
            </div>
          )})}
        </div>
      </div>
    ) : null

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
        <KPI label="Ληγμένες" value={String(expired.length)} color="var(--negative)"/>
        <KPI label="Λήγουν ≤90 Μέρες" value={String(expiringSoon.length)} color="var(--warning)"/>
        <KPI label="Σε Ισχύ" value={String(valid.length)} color="var(--positive)"/>
      </div>
      {expiringSoon.length>0&&<div style={{padding:'10px 14px',background:'rgba(251,146,60,0.08)',borderRadius:10,border:'1px solid var(--warning)25'}}><p style={{fontSize:11,color:'var(--warning)'}}>💡 Κάντε κλικ στο "→ Ημ/λόγιο" για να προσθέσετε υπενθύμιση απευθείας στο Ημερολόγιο.</p></div>}
      <Section title="Λήγουν Σύντομα (≤90 Μέρες)" color="var(--warning)" list={expiringSoon}/>
      <Section title="Ληγμένες Εγγυήσεις" color="var(--negative)" list={expired}/>
      <Section title="Εγγυήσεις σε Ισχύ" color="var(--positive)" list={valid}/>
      {withWarranty.length===0&&<div style={{textAlign:'center',padding:'48px 0',color:'var(--text-tertiary)'}}><p style={{fontSize:28,marginBottom:8}}>📋</p><p style={{fontSize:13}}>Δεν έχετε καταχωρήσει ημερομηνίες εγγύησης</p></div>}
    </div>
  )
}

// ─── Handover Tab ─────────────────────────────────────────────────────────────
function HandoverTab({items,handovers,propertyId,userId,onHandoverSaved}:{items:InventoryItem[];handovers:InventoryHandover[];propertyId:string;userId:string;onHandoverSaved:()=>void}) {
  const [mode,setMode] = useState<'list'|'new'>('list')
  const [handoverType,setHandoverType] = useState<'check_in'|'check_out'>('check_in')
  const [tenantName,setTenantName] = useState(''); const [tenantPhone,setTenantPhone] = useState('')
  const [handoverDate,setHandoverDate] = useState(''); const [notes,setNotes] = useState('')
  const [itemConditions,setItemConditions] = useState<Record<string,{condition:string;notes:string}>>({})
  const [saving,setSaving] = useState(false)

  useEffect(()=>{
    if(mode==='new'){
      const init:Record<string,{condition:string;notes:string}>={}
      items.forEach(item=>{init[item.id]={condition:item.condition,notes:''}})
      setItemConditions(init)
    }
  },[mode,items])

  const handleSave = async () => {
    if(!tenantName.trim()){alert('Το ονοματεπώνυμο είναι υποχρεωτικό.');return}
    setSaving(true)
    const snapshot:HandoverItemSnapshot[] = items.map(item=>({
      item_id:item.id,name:item.name,category:item.category,
      condition_at_handover:itemConditions[item.id]?.condition||item.condition,
      condition_notes:itemConditions[item.id]?.notes||'',photo_url:item.photo_url||'',
    }))
    const {error} = await supabase.from('inventory_handovers').insert({
      property_id:propertyId,user_id:userId,handover_type:handoverType,
      tenant_name:tenantName,tenant_phone:tenantPhone,
      handover_date:handoverDate||new Date().toISOString().split('T')[0],notes,items_snapshot:snapshot,
    })
    if(error){alert('Σφάλμα: '+error.message);setSaving(false);return}
    setMode('list'); onHandoverSaved(); setSaving(false)
  }

  const printHandover = (h:InventoryHandover) => {
    const snap=h.items_snapshot||[]
    const w=window.open('','_blank'); if(!w)return
    w.document.write(`<html><head><title>Πρωτόκολλο Παράδοσης</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px;color:#111}h1{font-size:18px;margin-bottom:4px}.sub{color:#666;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f4f4f4;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #ddd}td{padding:8px 10px;border-bottom:1px solid #eee}.sig{margin-top:48px;display:flex;gap:60px}.sig-box{flex:1;border-top:1px solid #999;padding-top:8px;font-size:11px;color:#666}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:bold}@media print{button{display:none}}</style></head><body>
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
        <button onClick={()=>setMode('new')} style={{padding:'8px 16px',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Νέο Πρωτόκολλο</button>
      </div>
      {handovers.length===0
        ? <div style={{textAlign:'center',padding:'48px 0'}}><p style={{fontSize:28,marginBottom:8}}>📋</p><p style={{fontSize:13,color:'var(--text-secondary)',fontWeight:600}}>Δεν έχετε πρωτόκολλα παράδοσης</p></div>
        : <div style={{display:'flex',flexDirection:'column',gap:10}}>
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
                      <button onClick={()=>printHandover(h)} style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'none',color:'var(--accent)',fontSize:11,cursor:'pointer',fontWeight:600}}>🖨️ Εκτύπωση</button>
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

// ─── Exports Tab ──────────────────────────────────────────────────────────────
function ExportsTab({items,repairs,electricityPrice}:{items:InventoryItem[];repairs:InventoryRepair[];electricityPrice:number}) {
  const totalCurrent = items.reduce((s,i)=>s+calcCurrentValue(i),0)
  const totalRepairCost = repairs.reduce((s,r)=>s+(r.cost||0),0)
  const electricItems = items.filter(i=>i.power_watts>0&&i.daily_hours_use>0)
  const totalMonthlyCost = electricItems.reduce((s,i)=>s+calcMonthlyCost(i,electricityPrice),0)

  const exportCSV = () => {
    const headers = ['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Αξία Αγοράς (€)','Τρέχουσα Αξία (€)','Απόσβεση (%)','Ηλ.Κλάση','Ισχύς (W)','Ώρες/ημ','kWh/μήνα','Κόστος Ρεύματος/μήνα (€)','Smart','Ημ/νία Αγοράς','Λήξη Εγγύησης','Σημειώσεις']
    const rows = items.map(i=>[
      i.name,i.category,i.room,i.brand,i.model,i.serial_number,i.condition,
      i.purchase_value||'',calcCurrentValue(i),calcDepreciationPct(i)+'%',
      i.energy_class||'',i.power_watts||'',i.daily_hours_use||'',
      calcMonthlyKwh(i)||'',electricityPrice>0?calcMonthlyCost(i,electricityPrice).toFixed(2):'',
      i.smart_device?'Ναι':'Όχι',i.purchase_date,i.warranty_expiry,i.notes,
    ])
    const csv=[headers,...rows].map(row=>row.map(cell=>`"${String(cell||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='απογραφη.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const byCategory = CATEGORIES.map(cat=>{const catItems=items.filter(i=>i.category===cat);return{cat,count:catItems.length,val:catItems.reduce((s,i)=>s+calcCurrentValue(i),0)}}).filter(x=>x.count>0)
    const w=window.open('','_blank'); if(!w)return
    w.document.write(`<html><head><title>Απογραφή Ακινήτου</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:30px}h1{font-size:20px;font-weight:bold;margin-bottom:4px}.subtitle{color:#666;margin-bottom:24px}.kpis{display:flex;gap:12px;margin-bottom:24px}.kpi{flex:1;background:#f8f8f8;border-radius:8px;padding:12px}.kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:4px}.kpi-value{font-size:16px;font-weight:bold;font-family:monospace}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:20px 0 10px;border-bottom:1px solid #eee;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f4f4f4;padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #ddd}td{padding:7px 8px;border-bottom:1px solid #f0f0f0}.footer{margin-top:40px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center}@media print{button{display:none}}</style></head><body>
    <h1>Απογραφή Ακινήτου</h1>
    <div class="subtitle">Έκδοση: ${new Date().toLocaleDateString('el-GR')} · ${items.length} αντικείμενα</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Τρέχουσα Αξία</div><div class="kpi-value">${formatEuro(totalCurrent)}</div></div>
      <div class="kpi"><div class="kpi-label">Ασφαλιστέα Αξία (+10%)</div><div class="kpi-value">${formatEuro(Math.round(totalCurrent*1.1))}</div></div>
      <div class="kpi"><div class="kpi-label">Κόστος Επισκευών</div><div class="kpi-value">${formatEuro(totalRepairCost)}</div></div>
      ${electricItems.length>0?`<div class="kpi"><div class="kpi-label">Ρεύμα/Μήνα (εκτίμηση)</div><div class="kpi-value">${formatEuroCents(totalMonthlyCost)}</div></div>`:''}
    </div>
    <h2>Ανά Κατηγορία</h2>
    ${byCategory.sort((a,b)=>b.val-a.val).map(({cat,count,val})=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0"><span>${CATEGORY_ICONS[cat]} ${cat} (${count})</span><span style="font-family:monospace;font-weight:bold">${formatEuro(val)}</span></div>`).join('')}
    <h2>Αναλυτική Απογραφή</h2>
    <table><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κλάση</th><th>Κατάσταση</th><th>Αξία Αγοράς</th><th>Τρέχουσα Αξία</th><th>Απόσβεση</th><th>kWh/μήνα</th><th>Εγγύηση</th></tr></thead><tbody>
    ${items.map(i=>`<tr><td><strong>${i.name}</strong>${i.brand?`<br><small>${i.brand} ${i.model||''}</small>`:''}</td><td>${i.category}</td><td>${i.energy_class||'—'}</td><td>${i.condition}</td><td style="font-family:monospace">${i.purchase_value?formatEuro(i.purchase_value):'—'}</td><td style="font-family:monospace;font-weight:bold">${formatEuro(calcCurrentValue(i))}</td><td>${calcDepreciationPct(i)}%</td><td>${calcMonthlyKwh(i)>0?calcMonthlyKwh(i)+' kWh':'—'}</td><td>${i.warranty_expiry?formatDate(i.warranty_expiry):'—'}</td></tr>`).join('')}
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
          <p style={{fontSize:11,color:'var(--text-secondary)',textAlign:'center',lineHeight:1.6}}>Πλήρης απογραφή με αξίες, ενεργειακές κλάσεις, απόσβεση, εγγυήσεις.</p>
          <div style={{background:'var(--bg-surface)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'var(--text-tertiary)'}}>
            <p>📦 {items.length} αντικείμενα · Αξία: <span style={{fontFamily:'JetBrains Mono, monospace',color:'var(--positive)'}}>{formatEuro(totalCurrent)}</span></p>
            {electricItems.length>0&&<p>⚡ Ρεύμα/μήνα: <span style={{fontFamily:'JetBrains Mono, monospace',color:'var(--warning)'}}>{formatEuroCents(totalMonthlyCost)}</span></p>}
          </div>
          <button onClick={exportPDF} style={{padding:'10px 0',borderRadius:10,background:'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:'pointer'}}>📄 Εξαγωγή PDF</button>
        </div>
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:28,textAlign:'center'}}>📊</div>
          <p style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',textAlign:'center'}}>Εξαγωγή CSV</p>
          <p style={{fontSize:11,color:'var(--text-secondary)',textAlign:'center',lineHeight:1.6}}>Excel-συμβατό με όλες τις στήλες συμπεριλαμβανομένης της ενεργειακής κατανάλωσης.</p>
          <div style={{background:'var(--bg-surface)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'var(--text-tertiary)'}}>
            <p>📋 {items.length} γραμμές · 🔧 Επισκευές: <span style={{fontFamily:'JetBrains Mono, monospace',color:'var(--negative)'}}>{formatEuro(totalRepairCost)}</span></p>
          </div>
          <button onClick={exportCSV} style={{padding:'10px 0',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border-default)',color:'var(--text-primary)',fontSize:12,fontWeight:700,cursor:'pointer'}}>📊 Εξαγωγή CSV</button>
        </div>
      </div>
      <div style={{padding:'14px 16px',background:'rgba(96,165,250,0.08)',borderRadius:10,border:'1px solid var(--info)25'}}>
        <p style={{fontSize:11,color:'var(--info)',fontWeight:600,marginBottom:4}}>💡 Ασφάλιση Περιεχομένου</p>
        <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6}}>Ασφαλιστέα αξία περιεχομένου: <strong style={{fontFamily:'JetBrains Mono, monospace',color:'var(--info)'}}>{formatEuro(Math.round(totalCurrent*1.1))}</strong> (τρέχουσα αξία +10% buffer). Χρησιμοποιήστε αυτό το νούμερο στο συμβόλαιο ασφάλισης. Μεταβείτε στην καρτέλα Λογαριασμοί → Ασφάλεια για να ενημερώσετε το ποσό κάλυψης.</p>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabInventory({propertyId,userId}:TabInventoryProps) {
  const [activeTab,setActiveTab] = useState<'overview'|'items'|'warranties'|'handover'|'exports'>('overview')
  const [items,setItems] = useState<InventoryItem[]>([])
  const [repairs,setRepairs] = useState<InventoryRepair[]>([])
  const [handovers,setHandovers] = useState<InventoryHandover[]>([])
  const [electricityPrice,setElectricityPrice] = useState(0.22) // €/kWh default
  const [loading,setLoading] = useState(true)
  const [showItemForm,setShowItemForm] = useState(false)
  const [editingItem,setEditingItem] = useState<InventoryItem|null>(null)
  const [repairItem,setRepairItem] = useState<InventoryItem|null>(null)

  const fetchData = useCallback(async()=>{
    setLoading(true)
    const [itemsRes,repairsRes,handoversRes,billsRes] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('inventory_repairs').select('*').eq('user_id',userId).order('repair_date',{ascending:false}),
      supabase.from('inventory_handovers').select('*').eq('property_id',propertyId).order('created_at',{ascending:false}),
      // Αντλεί τιμή kWh από τα bills settings αν υπάρχει
      supabase.from('bills_electricity').select('price_per_kwh').eq('property_id',propertyId).limit(1),
    ])
    if(itemsRes.data) setItems(itemsRes.data)
    if(repairsRes.data) setRepairs(repairsRes.data)
    if(handoversRes.data) setHandovers(handoversRes.data as InventoryHandover[])
    if(billsRes.data?.[0]?.price_per_kwh) setElectricityPrice(billsRes.data[0].price_per_kwh)
    setLoading(false)
  },[propertyId,userId])

  useEffect(()=>{fetchData()},[fetchData])

  const handleSaveItem = async(data:Partial<InventoryItem>)=>{
    if(editingItem) await supabase.from('inventory_items').update({...data,updated_at:new Date().toISOString()}).eq('id',editingItem.id)
    else await supabase.from('inventory_items').insert({...data,property_id:propertyId,user_id:userId})
    setShowItemForm(false); setEditingItem(null); fetchData()
  }
  const handleDeleteItem = async(id:string)=>{ await supabase.from('inventory_items').delete().eq('id',id); fetchData() }
  const handleAddRepair = async(data:Partial<InventoryRepair>)=>{
    if(!repairItem) return
    await supabase.from('inventory_repairs').insert({...data,item_id:repairItem.id,user_id:userId})
    fetchData()
  }

  const TABS = [
    {key:'overview',label:'Επισκόπηση'},
    {key:'items',label:'Αντικείμενα'},
    {key:'warranties',label:'Εγγυήσεις'},
    {key:'handover',label:'Παράδοση'},
    {key:'exports',label:'Εξαγωγές'},
  ] as const

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      {(showItemForm||editingItem)&&<ItemFormModal item={editingItem} onSave={handleSaveItem} onClose={()=>{setShowItemForm(false);setEditingItem(null)}}/>}
      {repairItem&&<RepairModal item={repairItem} repairs={repairs} onAdd={handleAddRepair} onClose={()=>setRepairItem(null)}/>}

      <div style={{marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <p style={{fontSize:18,fontWeight:700,color:'var(--text-primary)'}}>Απογραφή</p>
          {/* Τιμή ρεύματος override */}
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Τιμή ρεύματος</p>
            <div style={{width:100}}>
              <NumberInput value={String(electricityPrice)} onChange={v=>setElectricityPrice(Number(v))} suffix="€/kWh" min={0} />
            </div>
          </div>
        </div>
        <p style={{fontSize:12,color:'var(--text-secondary)'}}>Διαχείριση εξοπλισμού, ενεργειακής κατανάλωσης, εγγυήσεων και παράδοσης</p>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
        {TABS.map(tab=>(
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{padding:'9px 16px',borderRadius:10,border:`1px solid ${activeTab===tab.key?'var(--accent)':'var(--border-subtle)'}`,background:activeTab===tab.key?'var(--accent)':'var(--bg-elevated)',color:activeTab===tab.key?'var(--bg-base)':'var(--text-secondary)',cursor:'pointer',fontSize:12,fontWeight:600,transition:'all 0.2s'}}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--text-tertiary)'}}><p style={{fontSize:14}}>Φόρτωση απογραφής...</p></div>
      ) : (
        <>
          {activeTab==='overview'&&<OverviewTab items={items} repairs={repairs} electricityPrice={electricityPrice}/>}
          {activeTab==='items'&&<ItemsTab items={items} repairs={repairs} electricityPrice={electricityPrice} onAdd={()=>{setEditingItem(null);setShowItemForm(true)}} onEdit={item=>{setEditingItem(item);setShowItemForm(true)}} onDelete={handleDeleteItem} onAddRepair={item=>setRepairItem(item)}/>}
          {activeTab==='warranties'&&<WarrantiesTab items={items} userId={userId} propertyId={propertyId}/>}
          {activeTab==='handover'&&<HandoverTab items={items} handovers={handovers} propertyId={propertyId} userId={userId} onHandoverSaved={fetchData}/>}
          {activeTab==='exports'&&<ExportsTab items={items} repairs={repairs} electricityPrice={electricityPrice}/>}
        </>
      )}
    </div>
  )
}