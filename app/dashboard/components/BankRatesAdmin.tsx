'use client'
import { T } from '@/components/Theme'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NumberInput, TextInput, Toggle, InfoDot } from './UIComponents'

// ── Διαχείριση επιτοκίων τραπεζών (μόνο διαχειριστές) ──────────────────────────
// Γρήγορη, χειροκίνητη διόρθωση του `bank_rates` απευθείας από την εφαρμογή, ή
// αυτόματη επικαιροποίηση με AII. Η εγγραφή περνά από την πολιτική RLS (app_admins),
// άρα ασφαλής ακόμη κι αν το κουμπί εμφανιστεί κατά λάθος. Καθαρό, μονόχρωμο·
// γαλάζιο μόνο στην ενέργεια αποθήκευσης.

interface AdminBank {
  bank_id:string; bank_name:string
  fixed_3yr:string; fixed_5yr:string; fixed_10yr:string; fixed_15yr:string; fixed_20yr:string
  variable_spread_min:number; variable_spread_max:number; fixed_min:number
  max_ltv:number; spiti_mou:boolean; source_url:string; verified_at:string
}
const RATE_FIELDS:{k:keyof AdminBank;label:string}[] = [
  {k:'fixed_3yr',label:'Σταθερό 3ετίας'},
  {k:'fixed_5yr',label:'Σταθερό 5ετίας'},
  {k:'fixed_10yr',label:'Σταθερό 10ετίας'},
  {k:'fixed_15yr',label:'Σταθερό 15ετίας'},
  {k:'fixed_20yr',label:'Σταθερό 20ετίας'},
]
const labelStyle:React.CSSProperties = {
  fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.06em',fontWeight:600,fontFamily: T.font.sans,
}
const today = () => new Date().toISOString().slice(0,10)

export default function BankRatesAdmin({ onSaved, showToast }:{
  onSaved?:()=>void; showToast:(m:string)=>void
}) {
  const supabase = createClient()
  const [open,setOpen] = useState(false)
  const [rows,setRows] = useState<AdminBank[]>([])
  const [edit,setEdit] = useState<AdminBank|null>(null)
  const [selId,setSelId] = useState<string|null>(null)
  const [saving,setSaving] = useState(false)
  const [refreshing,setRefreshing] = useState(false)

  async function load() {
    const { data } = await supabase.from('bank_rates').select('*').order('fixed_min',{ascending:true})
    if (data) setRows(data as AdminBank[])
  }
  useEffect(()=>{ if(open && rows.length===0) load() },[open])

  function pick(b:AdminBank) {
    if (selId===b.bank_id) { setSelId(null); setEdit(null); return }
    setSelId(b.bank_id); setEdit({...b})
  }
  function set<K extends keyof AdminBank>(k:K, v:AdminBank[K]) {
    setEdit(e => e ? {...e, [k]:v} : e)
  }

  async function save() {
    if (!edit) return
    setSaving(true)
    const patch = {
      fixed_3yr:edit.fixed_3yr, fixed_5yr:edit.fixed_5yr, fixed_10yr:edit.fixed_10yr,
      fixed_15yr:edit.fixed_15yr, fixed_20yr:edit.fixed_20yr,
      variable_spread_min:Number(edit.variable_spread_min)||0,
      variable_spread_max:Number(edit.variable_spread_max)||0,
      fixed_min:Number(edit.fixed_min)||0,
      max_ltv:Math.round(Number(edit.max_ltv))||0,
      spiti_mou:!!edit.spiti_mou,
      source_url:edit.source_url||null,
      verified_at:today(),
    }
    const { error } = await supabase.from('bank_rates').update(patch).eq('bank_id',edit.bank_id)
    setSaving(false)
    if (error) { showToast('Η αποθήκευση απέτυχε: ελέγξτε δικαιώματα διαχειριστή'); return }
    showToast(`Ενημερώθηκαν τα επιτόκια: ${edit.bank_name}`)
    setSelId(null); setEdit(null)
    await load(); onSaved?.()
  }

  async function refreshAI() {
    setRefreshing(true)
    try {
      const { error } = await supabase.functions.invoke('bank-rates-updater',{ body:{} })
      if (error) throw error
      showToast('Η αυτόματη επικαιροποίηση ξεκίνησε, ανανέωση σε λίγο')
      setTimeout(async()=>{ await load(); onSaved?.() }, 8000)
    } catch {
      showToast('Η αυτόματη επικαιροποίηση δεν είναι διαθέσιμη')
    }
    setRefreshing(false)
  }

  return (
    <div style={{border:'1px solid var(--border-subtle)',borderRadius:14,background:'var(--bg-surface)',overflow:'hidden'}}>
      {/* Κεφαλίδα — συμπτυσσόμενη */}
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.sans}}>Διαχείριση επιτοκίων</span>
        <InfoDot text="Ορατό μόνο σε διαχειριστές. Διόρθωσε χειροκίνητα ένα επιτόκιο ή τρέξε αυτόματη επικαιροποίηση με έρευνα ιστού. Η ημερομηνία επιβεβαίωσης ενημερώνεται αυτόματα."/>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div style={{padding:'2px 14px 14px',display:'flex',flexDirection:'column',gap:12}}>
          {/* Αυτόματη επικαιροποίηση */}
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <button onClick={refreshAI} disabled={refreshing} style={{display:'inline-flex',alignItems:'center',gap:7,height:32,padding:'0 14px',borderRadius:100,cursor:refreshing?'wait':'pointer',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontSize:12,fontWeight:500,fontFamily: T.font.sans}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              {refreshing?'Επικαιροποίηση…':'Αυτόματη επικαιροποίηση με AI'}
            </button>
            <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>Έρευνα ιστού · γράφει μόνο έγκυρες τιμές</span>
          </div>

          {/* Λίστα τραπεζών — διάλεξε για επεξεργασία */}
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {rows.map(b=>{
              const on = selId===b.bank_id
              return (
                <div key={b.bank_id} style={{border:`1px solid ${on?'var(--border-accent)':'var(--border-subtle)'}`,borderRadius:10,background:'var(--bg-elevated)',overflow:'hidden'}}>
                  <button onClick={()=>pick(b)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left' as const}}>
                    <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.sans}}>{b.bank_name}</span>
                    <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily: T.font.mono,fontVariantNumeric:'tabular-nums'}}>από {String(b.fixed_min).replace('.',',')}%</span>
                    <span style={{fontSize:10,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>{b.verified_at}</span>
                  </button>

                  {on && edit && (
                    <div style={{padding:'2px 12px 13px',display:'flex',flexDirection:'column',gap:11,borderTop:'1px solid var(--border-subtle)'}}>
                      <p style={{...labelStyle,marginTop:11}}>Σταθερά επιτόκια (κείμενο, π.χ. «2,90» ή «2,50-2,90»)</p>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:10}}>
                        {RATE_FIELDS.map(f=>(
                          <TextInput key={f.k} label={f.label} value={String(edit[f.k] ?? '')} onChange={v=>set(f.k, v as any)} placeholder="0,00"/>
                        ))}
                      </div>
                      <p style={{...labelStyle}}>Παράμετροι</p>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:10}}>
                        <NumberInput label="Ελάχιστο σταθερό" value={String(edit.fixed_min ?? '')} onChange={v=>set('fixed_min', Number(v) as any)} suffix="%" step={0.05}/>
                        <NumberInput label="Περιθώριο ελάχιστο" value={String(edit.variable_spread_min ?? '')} onChange={v=>set('variable_spread_min', Number(v) as any)} suffix="%" step={0.05}/>
                        <NumberInput label="Περιθώριο μέγιστο" value={String(edit.variable_spread_max ?? '')} onChange={v=>set('variable_spread_max', Number(v) as any)} suffix="%" step={0.05}/>
                        <NumberInput label="Μέγιστο δάνειο προς αξία" value={String(edit.max_ltv ?? '')} onChange={v=>set('max_ltv', Number(v) as any)} suffix="%"/>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                        <Toggle on={!!edit.spiti_mou} onChange={v=>set('spiti_mou', v as any)} label="Συμμετέχει στο Σπίτι μου ΙΙ"/>
                        <div style={{flex:1,minWidth:180}}><TextInput label="Επίσημη πηγή (σύνδεσμος)" value={edit.source_url ?? ''} onChange={v=>set('source_url', v as any)} placeholder="https://…"/></div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <button onClick={save} disabled={saving} style={{display:'inline-flex',alignItems:'center',gap:7,height:36,padding:'0 18px',borderRadius:100,cursor:saving?'wait':'pointer',background:'var(--accent)',border:'1px solid var(--accent)',color:'var(--accent-text)',fontSize:13,fontWeight:700,fontFamily: T.font.sans}}>
                          {saving?'Αποθήκευση…':'Αποθήκευση'}
                        </button>
                        <button onClick={()=>{setSelId(null);setEdit(null)}} style={{height:36,padding:'0 16px',borderRadius:100,cursor:'pointer',background:'transparent',border:'1px solid var(--border-default)',color:'var(--text-secondary)',fontSize:13,fontWeight:500,fontFamily: T.font.sans}}>Ακύρωση</button>
                        <span style={{fontSize:10.5,color:'var(--text-tertiary)',marginLeft:'auto',fontFamily: T.font.sans}}>Η επιβεβαίωση ορίζεται στο σήμερα</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {rows.length===0 && <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,padding:'4px 2px'}}>Δεν υπάρχουν ζωντανές εγγραφές επιτοκίων στη βάση ακόμη.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
