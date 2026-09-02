'use client'
import { T, TT, formGrid, ABSENT } from '@/components/Theme'
import { notify, notifyOk, notifyError } from '@/components/Toast'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NumberInput, TextInput, Toggle, InfoDot } from './UIComponents'
import { athensToday } from '@/lib/core/time';
import { useLoad } from '@/app/hooks/useLoad';

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
// ΜΟΝΟ τα πεδία κειμένου. Ήταν `keyof AdminBank`, δηλαδή ο τύπος επέτρεπε και
// το `max_ltv` (αριθμός) ή το `spiti_mou` (λογικό) σε πεδίο κειμένου — γι' αυτό
// χρειαζόταν `as any` στην ανάθεση. Ο περιορισμός λέει την αλήθεια και η
// μετατροπή περισσεύει.
type RateKey = 'fixed_3yr' | 'fixed_5yr' | 'fixed_10yr' | 'fixed_15yr' | 'fixed_20yr';
const RATE_FIELDS:{k:RateKey;label:string}[] = [
  {k:'fixed_3yr',label:'Σταθερό 3ετίας'},
  {k:'fixed_5yr',label:'Σταθερό 5ετίας'},
  {k:'fixed_10yr',label:'Σταθερό 10ετίας'},
  {k:'fixed_15yr',label:'Σταθερό 15ετίας'},
  {k:'fixed_20yr',label:'Σταθερό 20ετίας'},
]
const labelStyle:React.CSSProperties = TT.label
const today = () => athensToday()

export default function BankRatesAdmin({ onSaved }:{
  onSaved?:()=>void
  // Απομεινάρι: τα μηνύματα δεν ανεβαίνουν πια στον γονέα — πάνε κατευθείαν στο
  // κοινό toast. Ο τύπος μένει δηλωμένος (και προαιρετικός) επειδή ο καλών
  // εξακολουθεί να περνά το prop· αν έφευγε τώρα, θα έσπαγε η μεταγλώττιση σε
  // αρχείο εκτός αυτής της αλλαγής. Δεν αποδομείται, άρα δεν χρησιμοποιείται.
  showToast?:(m:string)=>void
}) {
  const supabase = createClient()
  const [open,setOpen] = useState(false)
  const [rows,setRows] = useState<AdminBank[]>([])
  const [edit,setEdit] = useState<AdminBank|null>(null)
  const [selId,setSelId] = useState<string|null>(null)
  const [saving,setSaving] = useState(false)
  const [refreshing,setRefreshing] = useState(false)
  // ═══ ΤΙ ΕΚΑΝΕ Η ΤΡΟΦΟΔΟΣΙΑ ΚΑΙ ΤΙ ΚΡΑΤΗΣΕ ═══════════════════════════════
  // Ο διαχειριστής είναι ο μόνος που μπορεί να ΔΙΟΡΘΩΣΕΙ: βλέπει πότε έτρεξε
  // τελευταία ο καθημερινός έλεγχος, αν πέτυχε και ποιες μεταβολές κρατήθηκαν
  // επειδή ήταν μεγάλες και δεν επιβεβαιώθηκαν ακόμη από δεύτερο πέρασμα. Οι
  // κρατημένες δεν εφαρμόζονται από εδώ με ένα πάτημα: αν είναι σωστές, το
  // επόμενο πέρασμα θα τις επιβεβαιώσει μόνο του· αν είναι λάθος, ο
  // διαχειριστής γράφει τη σωστή τιμή στη φόρμα από κάτω.
  type Health = { ok:boolean; reason:string; last_check:string|null; last_ok:string|null; held_changes:number }
  type Held = { ran_at:string; bank_id:string; field:string; old_value:number|null; new_value:number; reason:string }
  const [health,setHealth] = useState<Health|null>(null)
  const [held,setHeld] = useState<Held[]>([])

  async function load() {
    const { data } = await supabase.from('bank_rates').select('*').order('fixed_min',{ascending:true})
    if (data) setRows(data as AdminBank[])
    const [{ data: h }, { data: hd }] = await Promise.all([supabase.rpc('bank_feed_health'), supabase.rpc('bank_feed_held')])
    const row = Array.isArray(h) ? h[0] : h
    if (row) setHealth(row as Health)
    if (Array.isArray(hd)) setHeld(hd as Held[])
  }
  // Φορτώνει μία φορά, όταν ανοίξει το πάνελ. Το `rows.length` δεν είναι
  // εξάρτηση: αν ήταν, η φόρτωση θα ξανάτρεχε μόλις γέμιζε ο πίνακας.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boot = useCallback(async () => { if (open && rows.length === 0) await load() }, [open])
  useLoad(boot)

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
    if (error) { notifyError('Η αποθήκευση απέτυχε: ελέγξτε δικαιώματα διαχειριστή'); return }
    notifyOk(`Ενημερώθηκαν τα επιτόκια: ${edit.bank_name}`)
    setSelId(null); setEdit(null)
    await load(); onSaved?.()
  }

  async function refreshAI() {
    setRefreshing(true)
    try {
      const { error } = await supabase.functions.invoke('bank-rates-updater',{ body:{} })
      if (error) throw error
      notify('Η αυτόματη επικαιροποίηση ξεκίνησε, ανανέωση σε λίγο', { tone: 'info' })
      setTimeout(async()=>{ await load(); onSaved?.() }, 8000)
    } catch {
      notify('Η αυτόματη επικαιροποίηση δεν είναι διαθέσιμη', { tone: 'warning' })
    }
    setRefreshing(false)
  }

  return (
    <div style={{border:'1px solid var(--border-subtle)',borderRadius: T.radius.card,background:'var(--bg-surface)',overflow:'hidden'}}>
      {/* Κεφαλίδα — συμπτυσσόμενη */}
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.sans}}>Διαχείριση επιτοκίων</span>
        <InfoDot text="Ορατό μόνο σε διαχειριστές. Διόρθωσε χειροκίνητα ένα επιτόκιο ή τρέξε αυτόματη επικαιροποίηση με έρευνα ιστού. Η ημερομηνία επιβεβαίωσης ενημερώνεται αυτόματα."/>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div style={{padding:'2px 14px 14px',display:'flex',flexDirection:'column',gap:12}}>
          {/* Αυτόματη επικαιροποίηση */}
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <button onClick={refreshAI} disabled={refreshing} style={{display:'inline-flex',alignItems:'center',gap:7,height:T.h.sm,padding:'0 14px',borderRadius: T.radius.pill,cursor:refreshing?'wait':'pointer',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontSize:12,fontWeight:500,fontFamily: T.font.sans}}>
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              {refreshing?'Επικαιροποίηση…':'Αυτόματη επικαιροποίηση με AI'}
            </button>
            <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>Έρευνα ιστού · γράφει μόνο έγκυρες τιμές</span>
          </div>

          {health && (
            <p style={{fontSize:12,color:health.ok?'var(--text-secondary)':'var(--negative)',fontFamily: T.font.sans,lineHeight:1.5}}>
              {health.ok
                ? `Καθημερινός έλεγχος: τελευταίο πέρασμα ${health.last_check ? new Date(health.last_check).toLocaleString('el-GR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ABSENT}, πέτυχε.`
                : `Καθημερινός έλεγχος: ${health.reason}.`}
            </p>
          )}
          {held.length>0 && (
            <div style={{border:'1px solid var(--warning-border)',background:'var(--warning-soft)',borderRadius: T.radius.inner,padding:'10px 12px',display:'flex',flexDirection:'column',gap:4}}>
              <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.sans}}>Μεταβολές που περιμένουν δεύτερη επιβεβαίωση</p>
              {held.map((c,i)=>(
                <p key={i} style={{fontSize:12,color:'var(--text-secondary)',fontFamily: T.font.sans}}>
                  <span style={{fontFamily: T.font.mono}}>{c.bank_id} · {c.field}</span>: από {c.old_value==null?ABSENT:String(c.old_value).replace('.',',')} σε {String(c.new_value).replace('.',',')} · {c.reason}
                </p>
              ))}
              <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>Αν το επόμενο πέρασμα επιστρέψει την ίδια τιμή, εφαρμόζεται μόνη της. Αν είναι λάθος, γράψε τη σωστή τιμή στη φόρμα της τράπεζας.</p>
            </div>
          )}

          {/* Λίστα τραπεζών — διάλεξε για επεξεργασία */}
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {rows.map(b=>{
              const on = selId===b.bank_id
              return (
                <div key={b.bank_id} style={{border:`1px solid ${on?'var(--border-accent)':'var(--border-subtle)'}`,borderRadius:10,background:'var(--bg-elevated)',overflow:'hidden'}}>
                  <button onClick={()=>pick(b)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left' as const}}>
                    <span style={{flex:1,fontSize:13,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.sans}}>{b.bank_name}</span>
                    <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily: T.font.mono,fontVariantNumeric:'tabular-nums'}}>από {String(b.fixed_min).replace('.',',')}%</span>
                    <span style={{fontSize: 11,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>{b.verified_at}</span>
                  </button>

                  {on && edit && (
                    <div style={{padding:'2px 12px 13px',display:'flex',flexDirection:'column',gap:11,borderTop:'1px solid var(--border-subtle)'}}>
                      <p style={{...labelStyle,marginTop:11}}>Σταθερά επιτόκια (κείμενο, π.χ. «2,90» ή «2,50-2,90»)</p>
                      <div style={{...formGrid(150, 210),gap:10}}>
                        {RATE_FIELDS.map(f=>(
                          <TextInput key={f.k} label={f.label} value={String(edit[f.k] ?? '')} onChange={v=>set(f.k, v)} placeholder=""/>
                        ))}
                      </div>
                      <p style={{...labelStyle}}>Παράμετροι</p>
                      <div style={{...formGrid(150, 210),gap:10}}>
                        <NumberInput label="Ελάχιστο σταθερό" value={String(edit.fixed_min ?? '')} onChange={v=>set('fixed_min', Number(v))} suffix="%" step={0.05}/>
                        <NumberInput label="Περιθώριο ελάχιστο" value={String(edit.variable_spread_min ?? '')} onChange={v=>set('variable_spread_min', Number(v))} suffix="%" step={0.05}/>
                        <NumberInput label="Περιθώριο μέγιστο" value={String(edit.variable_spread_max ?? '')} onChange={v=>set('variable_spread_max', Number(v))} suffix="%" step={0.05}/>
                        <NumberInput label="Μέγιστο δάνειο προς αξία" value={String(edit.max_ltv ?? '')} onChange={v=>set('max_ltv', Number(v))} suffix="%"/>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                        <Toggle on={!!edit.spiti_mou} onChange={v=>set('spiti_mou', v)} label="Συμμετέχει στο Σπίτι μου ΙΙ"/>
                        <div style={{flex:1,minWidth:180}}><TextInput label="Επίσημη πηγή (σύνδεσμος)" value={edit.source_url ?? ''} onChange={v=>set('source_url', v)} placeholder="https://…"/></div>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <button onClick={save} disabled={saving} style={{display:'inline-flex',alignItems:'center',gap:7,height:T.h.md,padding:'0 18px',borderRadius: T.radius.pill,cursor:saving?'wait':'pointer',background:'var(--accent)',border:'1px solid var(--accent)',color:'var(--accent-text)',fontSize:13,fontWeight:700,fontFamily: T.font.sans}}>
                          {saving?'Αποθήκευση…':'Αποθήκευση'}
                        </button>
                        <button onClick={()=>{setSelId(null);setEdit(null)}} style={{height:T.h.md,padding:'0 16px',borderRadius: T.radius.pill,cursor:'pointer',background:'transparent',border:'1px solid var(--border-default)',color:'var(--text-secondary)',fontSize:13,fontWeight:500,fontFamily: T.font.sans}}>Ακύρωση</button>
                        <span style={{fontSize:11,color:'var(--text-tertiary)',marginLeft:'auto',fontFamily: T.font.sans}}>Η επιβεβαίωση ορίζεται στο σήμερα</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {rows.length===0 && <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,padding:'4px 2px'}}>Καμία ζωντανή εγγραφή επιτοκίων ακόμη</p>}
          </div>
        </div>
      )}
    </div>
  )
}
