'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΕΠΙΣΚΕΥΗ, ΚΑΙ Η ΔΑΠΑΝΗ ΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Η επισκευή δεν είναι μόνο ιστορικό του αντικειμένου: είναι και ποσό που
// εκπίπτει. Γι' αυτό γράφεται προαιρετικά και στις Δαπάνες, με ένα πάτημα, αντί
// να ξαναγραφτεί με το χέρι σε δεύτερη οθόνη.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useId } from 'react'
import { T, Modal, Btn, fe, formGrid, pressable } from '@/components/Theme'
import { NumberInput, TextInput, DatePicker, Toggle, Textarea } from '../UIComponents'
import * as expenses from '@/lib/data/expenses'
import { notifyError } from '@/components/Toast'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import type { InventoryItem, InventoryRepair } from './model'
import { calcCurrentValue, calcDepreciationPct, calcYearsLeft, fmtDate } from './calc'
import { DepBar, SectionLabel, labelStyle } from './Bits'
import { athensToday } from '@/lib/core/time'
import { navLabel } from '@/lib/nav/labels'
import { failed } from '@/lib/core/dbError'
import * as contactStore from '@/lib/data/contacts'

const supabase = createSupabaseClient()

export function RepairModal({item,repairs,onAdd,onClose,propertyId,userId}:{item:InventoryItem;repairs:InventoryRepair[];onAdd:(r:Partial<InventoryRepair>)=>void;onClose:()=>void;propertyId:string;userId:string}) {
  const [form,setForm] = useState({repair_date:'',cost:0,technician:'',description:''})
  const costId = useId(); const techId = useId()
  const [pushExpenses,setPushExpenses] = useState(true)
  const [saving,setSaving] = useState(false)
  const [contacts,setContacts] = useState<{id:string;full_name:string}[]>([])
  const [showContactPicker,setShowContactPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{contactStore.ofProperty<{id:string;full_name:string}>(supabase,propertyId,'id,full_name',userId).then(setContacts)},[propertyId,userId])
  useEffect(()=>{const h=(e:MouseEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(e.target as Node))setShowContactPicker(false)};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h)},[])
  const itemRepairs = repairs.filter(r=>r.item_id===item.id)
  const totalCost = itemRepairs.reduce((s,r)=>s+(r.cost||0),0)
  const curVal = calcCurrentValue(item)
  const handleAdd = async() => {
    if(!form.description.trim()){notifyError('Η περιγραφή είναι υποχρεωτική.');return}
    setSaving(true)
    await onAdd(form)
    if(pushExpenses&&form.cost>0){
      const {error}=await expenses.insert(supabase,[expenses.row({propertyId,userId},{description:`Επισκευή: ${item.name}${form.technician?` (${form.technician})`:''}${form.description?`, ${form.description}`:''}`,amount:form.cost,category:'Συντήρηση & Επισκευές',date:form.repair_date||athensToday(),paid:true,notes:`Αυτόματη εισαγωγή από ${navLabel('inventory')}, ${item.name}`})])
      // Ο διακόπτης υπόσχεται ρητά ότι η επισκευή περνά στις δαπάνες. Αν δεν
      // περάσει, ο χρήστης πρέπει να το μάθει ΤΩΡΑ, όχι στη φορολογική δήλωση.
      if(error) notifyError(failed('Η επισκευή καταχωρήθηκε, αλλά η δαπάνη δεν πέρασε στα έξοδα',error))
    }
    setForm({repair_date:'',cost:0,technician:'',description:''})
    setSaving(false)
  }
  // Η «Καταχώρηση Επισκευής» ήταν το τελευταίο στοιχείο ΜΕΣΑ στο σώμα που κυλά:
  // με ιστορικό πέντε επισκευών ο χρήστης έπρεπε να κυλήσει ως το τέλος για να τη
  // βρει. Στο υποσέλιδο του Modal μένει καρφωμένη και ορατή σε κάθε θέση κύλισης.
  //
  // Η καταχώρηση γράφει σε ΔΥΟ πίνακες (inventory_repairs και, με τον διακόπτη
  // ανοιχτό, expenses). Escape ή κλικ στο φόντο ανάμεσα στα δύο — έξοδοι που το
  // χειρόγραφο δεν είχε — κρύβει το μήνυμα που λέει ότι η δαπάνη δεν πέρασε.
  const closeGuarded = () => { if(!saving) onClose() }
  return (
    <Modal open onClose={closeGuarded} width={520} title="Επισκευές" subtitle={item.name}
      footer={<Btn variant="primary" onClick={handleAdd} disabled={saving}>{saving?'Αποθήκευση…':'Καταχώρηση Επισκευής'}</Btn>}>
      {/* Το ξεπέρασμα του ορίου είναι προειδοποίηση· το «εντός ορίων» δεν
          είναι βραβείο. Πράσινο πλαίσιο γύρω από ένα κόστος επισκευών λέει
          στον χρήστη «μπράβο που ξόδεψες», που δεν το εννοούσε κανείς. */}
      {totalCost>0&&curVal>0&&(
        <div style={{padding:'10px 14px',background:totalCost>curVal*0.5?'var(--warning-soft)':'var(--bg-elevated)',borderRadius:T.radius.inner,border:`1px solid ${totalCost>curVal*0.5?'var(--warning-border)':'var(--border-subtle)'}`}}>
          <p style={{fontSize:12,color:totalCost>curVal*0.5?'var(--warning)':'var(--text-secondary)',fontWeight:500,fontFamily:T.font.sans}}>{totalCost>curVal*0.5?`Οι επισκευές (${fe(totalCost)}) ξεπερνούν το μισό της τρέχουσας αξίας (${fe(curVal)}). Σκέψου αντικατάσταση.`:`Επισκευές ${fe(totalCost)} σε αξία ${fe(curVal)}.`}</p>
        </div>
      )}
      <DepBar pct={calcDepreciationPct(item)} left={calcYearsLeft(item)}/>
      {itemRepairs.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <SectionLabel label="Ιστορικό" right={<span style={{fontSize:12,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{fe(totalCost)}</span>}/>
          {itemRepairs.map(r=>(
            <div key={r.id} style={{background:'var(--bg-elevated)',borderRadius:8,padding:'10px 14px',border:'1px solid var(--border-subtle)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{r.description}</p>
                <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{fe(r.cost)}</p>
              </div>
              <p style={{fontSize: 11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(r.repair_date)}{r.technician?` · ${r.technician}`:''}</p>
            </div>
          ))}
        </div>
      )}
      <SectionLabel label="Νέα επισκευή"/>
      <div style={{...formGrid(200, 270),gap:12}}>
        <div><label style={labelStyle}>Ημερομηνία</label><DatePicker value={form.repair_date} onChange={v=>setForm(f=>({...f,repair_date:v}))}/></div>
        <div><label htmlFor={costId} style={labelStyle}>Κόστος</label><NumberInput id={costId} value={String(form.cost)} onChange={v=>setForm(f=>({...f,cost:parseFloat(v)||0}))} suffix="€" min={0}/></div>
        <div style={{gridColumn:'1/-1'}}>
          <label htmlFor={techId} style={labelStyle}>Τεχνικός, συνεργείο</label>
          <div style={{display:'flex',gap:8}}>
            <div style={{flex:1}}><TextInput id={techId} value={form.technician} onChange={v=>setForm(f=>({...f,technician:v}))} placeholder="Παράδειγμα: Ηλεκτρολόγος Γεωργίου"/></div>
            {contacts.length>0&&(
              <div ref={pickerRef} style={{position:'relative',flexShrink:0}}>
                <button type="button" onClick={()=>setShowContactPicker(s=>!s)} style={{padding:'0 12px',height:T.h.lg,borderRadius:8,border:'1px solid var(--border-subtle)',background:showContactPicker?'var(--accent-dim)':'var(--bg-elevated)',color:showContactPicker?'var(--accent)':'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer'}}>Επαφές</button>
                {showContactPicker&&(
                  <div style={{position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:T.radius.card,padding:8,zIndex:700,minWidth:200,maxHeight:200,overflowY:'auto',boxShadow:'var(--shadow-lg)'}}>
                    <div style={{fontSize: 11,color:'var(--text-secondary)',padding:'4px 8px 8px',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans,borderBottom:'1px solid var(--border-subtle)',marginBottom:4}}>Επιλογή επαφής</div>
                    {contacts.map(c=>(
                      <div key={c.id} {...pressable(()=>{setForm(f=>({...f,technician:c.full_name}));setShowContactPicker(false)})} style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:13,fontFamily:T.font.sans,color:'var(--text-primary)'}} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-elevated)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>{c.full_name}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{gridColumn:'1/-1'}}><label style={labelStyle}>Περιγραφή *</label><Textarea value={form.description} onChange={v=>setForm(f=>({...f,description:v}))} placeholder="Τι επισκευάστηκε…" rows={2}/></div>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
        <div>
          <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Καταχώρηση στις Δαπάνες</p>
          <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Αυτόματη εισαγωγή στην καρτέλα «Δαπάνες»</p>
        </div>
        <Toggle on={pushExpenses} onChange={setPushExpenses}/>
      </div>
    </Modal>
  )
}
