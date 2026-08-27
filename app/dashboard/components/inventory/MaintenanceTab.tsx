'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΟΓΡΑΜΜΑ ΣΥΝΤΗΡΗΣΗΣ: ΚΑΘΕ ΠΟΤΕ, ΚΑΙ ΤΙ ΓΙΝΕΤΑΙ ΟΤΑΝ ΓΙΝΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Μια συντήρηση που «έγινε» παράγει τρία πράγματα ταυτόχρονα: νέα προθεσμία,
// γεγονός στο ημερολόγιο και δαπάνη. Γράφονται μαζί, από ένα πάτημα, αλλιώς
// το ένα από τα τρία ξεχνιέται πάντα.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useId } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { T, EmptyState, fe, formGrid } from '@/components/Theme'
import { CustomSelect, NumberInput, TextInput, DatePicker } from '../UIComponents'
import * as calendar from '@/lib/data/calendar'
import * as expenses from '@/lib/data/expenses'
import { notifyError } from '@/components/Toast'
import { saved } from '@/components/dbWrite'
import { confirmDialog } from '@/components/confirmBus'
import { failed, MSG } from '@/lib/core/dbError'
import { athensToday } from '@/lib/core/time'
import { DEFAULT_MAINTENANCE, type InventoryItem, type MaintenanceSchedule } from './model'
import { addMonths, daysUntil, fmtDate } from './calc'
import { Badge, OverflowMenu, IconTrash, SectionLabel, labelStyle, cardStyle } from './Bits'
import { ActionMenu } from '@/components/ActionMenu'
import { ClipboardCheck } from 'lucide-react'

const supabase = createSupabaseClient()

export function MaintenanceTab({items,schedules,propertyId,userId,onSaved}:{items:InventoryItem[];schedules:MaintenanceSchedule[];propertyId:string;userId:string;onSaved:()=>void}) {
  const [adding,setAdding] = useState(false)
  const [form,setForm] = useState({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:'',est_cost:0})
  const intervalId = useId(); const estCostId = useId(); const taskId = useId(); const mNotesId = useId()
  const [saving,setSaving] = useState(false)
  const [doneBusy,setDoneBusy] = useState<string|null>(null)
  // Και εδώ το `embedded` ήταν πάντα αληθές, άρα το πλέγμα των τριών μετρικών
  // που κρεμόταν από το `!embedded` δεν αποδόθηκε ποτέ. Έλεγε ούτως ή άλλως τα
  // ίδια τρία νούμερα με τα σήματα των τριών ενοτήτων ακριβώς από κάτω.
  const today=()=>athensToday()
  const taskTitle=(task:string,item_name:string)=>`Συντήρηση: ${task}${item_name?`, ${item_name}`:''}`
  // Το «κύκλωμα»: μια προγραμματισμένη εργασία → εγγραφή ημερολογίου (υπενθύμιση/εκκρεμότητα)
  // + προγραμματισμένη (εκκρεμής) δαπάνη → τροφοδοτεί προϋπολογισμό «Συντήρηση» & «Εκκρεμείς πληρωμές».
  // Οι δύο δημιουργοί του κυκλώματος επιστρέφουν πλέον ΚΑΙ το σφάλμα τους: ένα
  // ραντεβού συντήρησης που δεν μπήκε στο ημερολόγιο, ή μια προγραμματισμένη
  // δαπάνη που δεν μπήκε στον προϋπολογισμό, είναι ακριβώς η υπόσχεση που δίνει
  // το πλαίσιο πάνω από το κουμπί αποθήκευσης. Σιωπηλή αποτυχία εκεί σημαίνει ότι
  // ο χρήστης βασίζεται σε υπενθύμιση που δεν υπάρχει.
  const makeCalEvent=async(task:string,item_name:string,due:string,est:number):Promise<string|undefined>=>{
    const {data,error}=await calendar.add(supabase,{propertyId,userId},'inventory-maint',{title:taskTitle(task,item_name),category:'maintenance',event_date:due,amount:est||0,notes:est>0?`Αυτόματο από Συντήρηση Απογραφής · εκτιμώμενο κόστος ${fe(est)}`:'Αυτόματο από Συντήρηση Απογραφής'})
    if(error){notifyError(failed(MSG.reminder,error));return undefined}
    return data?.id
  }
  const makePlannedExpense=async(task:string,item_name:string,due:string,est:number):Promise<string|undefined>=>{
    if(!(est>0)) return undefined
    const {data,error}=await expenses.add(supabase,{propertyId,userId},{description:taskTitle(task,item_name),amount:est,category:'Συντήρηση & Επισκευές',date:due,notes:'Προγραμματισμένη δαπάνη συντήρησης (εκκρεμεί)'})
    if(error){notifyError(failed('Η προγραμματισμένη δαπάνη δεν καταχωρήθηκε',error));return undefined}
    return data?.id
  }
  const markDone=async(s:MaintenanceSchedule)=>{
    if(doneBusy) return
    setDoneBusy(s.id)
    const t=today(); const newDue=addMonths(t,s.interval_months); const est=s.est_cost||0
    // Η προγραμματισμένη δαπάνη γίνεται πραγματοποιημένη (πληρωμένη)· αν δεν υπήρχε, καταγράφεται τώρα.
    if(s.expense_id) await expenses.update(supabase,s.expense_id,{paid:true,date:t})
    else if(est>0) await expenses.insert(supabase,[expenses.row({propertyId,userId},{description:taskTitle(s.task,s.item_name),amount:est,category:'Συντήρηση & Επισκευές',date:t,paid:true,notes:'Πραγματοποιημένη συντήρηση'})])
    if(s.calendar_event_id) await calendar.update(supabase,s.calendar_event_id,{status:'paid'})
    // Ρολάρισμα + νέο κύκλωμα για την επόμενη φορά.
    const calId=await makeCalEvent(s.task,s.item_name,newDue,est)
    const expId=await makePlannedExpense(s.task,s.item_name,newDue,est)
    const {error}=await supabase.from('inventory_maintenance').update({last_done:t,next_due:newDue,calendar_event_id:calId||null,expense_id:expId||null}).eq('id',s.id)
    setDoneBusy(null)
    // Αν αυτό αποτύχει, η εργασία μένει στην ίδια ημερομηνία και ο χρήστης βλέπει
    // το κουμπί «Έγινε» να μην κάνει τίποτα. Χωρίς μήνυμα, το ξαναπατάει.
    if(error){notifyError(failed('Η εκτέλεση δεν καταγράφηκε',error));return}
    onSaved()
  }
  const deleteSched=async(s:MaintenanceSchedule)=>{
    if(s.calendar_event_id) await calendar.remove(supabase,s.calendar_event_id)
    if(s.expense_id) await expenses.removeIfUnpaid(supabase,s.expense_id)
    const {error}=await supabase.from('inventory_maintenance').delete().eq('id',s.id)
    if(error){notifyError(failed('Η εργασία δεν διαγράφηκε',error));return}
    onSaved()
  }
  // «Προτεινόμενη εργασία» → ανοίγει την επεξεργάσιμη φόρμα προ-συμπληρωμένη (διάστημα/αντικείμενο/κόστος),
  // ώστε ο χρήστης να την προσαρμόσει και μετά να μπει στο κύκλωμα (ημερολόγιο/εκκρεμότητες/δαπάνες).
  const addSuggested=(s:{task:string;interval_months:number;category:string})=>{
    const match=items.find(i=>i.category===s.category)
    setForm({item_id:match?.id||'',item_name:match?.name||'',task:s.task,interval_months:s.interval_months,last_done:'',notes:'',est_cost:0})
    setAdding(true)
  }
  const handleSave=async()=>{
    if(!form.task.trim()){notifyError('Η εργασία είναι υποχρεωτική.');return}
    setSaving(true)
    const base=form.last_done||today(); const nextDue=addMonths(base,form.interval_months); const est=form.est_cost||0
    const {data:sched,error:schedErr}=await supabase.from('inventory_maintenance').insert({property_id:propertyId,user_id:userId,item_id:form.item_id||'',item_name:form.item_name,task:form.task,interval_months:form.interval_months,last_done:form.last_done,next_due:nextDue,notes:form.notes,est_cost:est}).select('id').single()
    // Αν αποτύχει η εγγραφή (π.χ. δεν έχει τρέξει η migration), μην δημιουργήσεις ορφανές εγγραφές στο κύκλωμα.
    if(schedErr){notifyError(failed('Η συντήρηση δεν προγραμματίστηκε',schedErr));setSaving(false);return}
    // Αν έχει ήδη γίνει (δηλωμένη τελευταία εκτέλεση) κατέγραψε πληρωμένη δαπάνη για το ιστορικό.
    if(form.last_done&&est>0) await saved('Η πραγματοποιημένη συντήρηση δεν καταγράφηκε στις δαπάνες',expenses.insert(supabase,[expenses.row({propertyId,userId},{description:taskTitle(form.task,form.item_name),amount:est,category:'Συντήρηση & Επισκευές',date:form.last_done,paid:true,notes:'Πραγματοποιημένη συντήρηση'})]))
    // Κύκλωμα για την επόμενη προγραμματισμένη εκτέλεση.
    const calId=await makeCalEvent(form.task,form.item_name,nextDue,est)
    const expId=await makePlannedExpense(form.task,form.item_name,nextDue,est)
    const sid=(sched as {id?:string}|null)?.id
    if(sid&&(calId||expId)) await saved(MSG.calendarLink,supabase.from('inventory_maintenance').update({calendar_event_id:calId||null,expense_id:expId||null}).eq('id',sid))
    setAdding(false);setForm({item_id:'',item_name:'',task:'',interval_months:12,last_done:'',notes:'',est_cost:0});setSaving(false);onSaved()
  }
  const SchedRow=({s}:{s:MaintenanceSchedule})=>{
    const days=daysUntil(s.next_due); const c=days<0?'var(--negative)':days<=30?'var(--warning)':'var(--positive)'
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto auto',gap:10,alignItems:'center',padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
        <div>
          <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{s.task}</p>
          <p style={{fontSize: 11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{s.item_name||'Γενική'} · κάθε {s.interval_months} μήνες{(s.est_cost||0)>0?` · περίπου ${fe(s.est_cost||0)}`:''}{s.last_done?` · τελευταία ${fmtDate(s.last_done)}`:''}</p>
        </div>
        <Badge label={days<0?`${Math.abs(days)===1?'1 ημέρα':`${Math.abs(days)} ημέρες`} καθυστέρηση`:days===0?'Σήμερα':days===1?'Αύριο':`σε ${days} ημέρες`} color={c}/>
        <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums'}}>{fmtDate(s.next_due)}</span>
        <button onClick={()=>markDone(s)} disabled={doneBusy===s.id} title="Καταγράφει την εκτέλεση, ρολάρει στην επόμενη ημερομηνία και ενημερώνει δαπάνες/ημερολόγιο" style={{padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:doneBusy===s.id?'var(--text-tertiary)':'var(--text-secondary)',fontSize:11,fontFamily:T.font.sans,cursor:doneBusy===s.id?'wait':'pointer',fontWeight:500,whiteSpace:'nowrap'}}>{doneBusy===s.id?'…':'Έγινε'}</button>
        <OverflowMenu actions={[
          {label:'Διαγραφή',icon:IconTrash,danger:true,onClick:async()=>{ if(await confirmDialog('Διαγραφή; Θα αφαιρεθεί και η προγραμματισμένη υπενθύμιση/δαπάνη.',{tone:'negative'})) await deleteSched(s) }},
        ]}/>
      </div>
    )
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* ΟΙ ΠΡΟΤΕΙΝΟΜΕΝΕΣ ΕΡΓΑΣΙΕΣ ΕΓΙΝΑΝ ΜΕΝΟΥ.
          Ήταν πλέγμα έξι καρτών με έξι κουμπιά «Προσθήκη», που καταλάμβανε μισή
          οθόνη και εμφανιζόταν ΜΟΝΟ όταν δεν υπήρχε καμία εργασία — δηλαδή
          εξαφανιζόταν ακριβώς τη στιγμή που ο χρήστης μάθαινε ότι υπάρχει. Τώρα
          είναι ένα μενού που ζει πάντα δίπλα στον τίτλο. */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <SectionLabel label="Συντήρηση" right={schedules.length>0?<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{schedules.length} {schedules.length===1?'εργασία':'εργασίες'}</span>:undefined}/>
        {!adding&&<ActionMenu label="Νέα εργασία" items={[
          ...DEFAULT_MAINTENANCE.map((sug,i)=>({
            key:`sug${i}`, label:sug.task,
            description:`κάθε ${sug.interval_months} μήνες · ${sug.category}`,
            onClick:()=>addSuggested(sug),
          })),
          {key:'own', label:'Δική μου εργασία', description:'Ορίζεις εσύ τι, κάθε πότε και με τι κόστος.', onClick:()=>setAdding(true)},
        ]}/>}
      </div>
      {adding&&(
        <div style={{...cardStyle,border:'1px solid var(--border-accent)'}}>
          <SectionLabel label="Νέα εργασία συντήρησης"/>
          <div style={{...formGrid(200, 270),gap:12}}>
            <div style={{gridColumn:'1/-1'}}><label htmlFor={taskId} style={labelStyle}>Εργασία *</label><TextInput id={taskId} value={form.task} onChange={v=>setForm(f=>({...f,task:v}))} placeholder="Ετήσιος έλεγχος λέβητα"/></div>
            <div><label style={labelStyle}>Αντικείμενο</label><CustomSelect value={form.item_id} onChange={v=>{const it=items.find(i=>i.id===v);setForm(f=>({...f,item_id:v,item_name:it?.name||''}))}} options={[{value:'',label:'Γενική εργασία'},...items.map(i=>({value:i.id,label:i.name}))]}/></div>
            <div><label htmlFor={intervalId} style={labelStyle}>Επανάληψη κάθε</label><NumberInput id={intervalId} value={String(form.interval_months)} onChange={v=>setForm(f=>({...f,interval_months:parseInt(v)||1}))} suffix="μήνες" min={1} max={60}/></div>
            <div><label style={labelStyle}>Τελευταία εκτέλεση</label><DatePicker value={form.last_done} onChange={v=>setForm(f=>({...f,last_done:v}))}/></div>
            <div><label htmlFor={estCostId} style={labelStyle}>Εκτιμώμενο κόστος</label><NumberInput id={estCostId} value={String(form.est_cost)} onChange={v=>setForm(f=>({...f,est_cost:parseFloat(v)||0}))} suffix="€" min={0}/></div>
            <div style={{gridColumn:'1/-1'}}><label htmlFor={mNotesId} style={labelStyle}>Σημειώσεις</label><TextInput id={mNotesId} value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} placeholder="Τεχνικός, παρατηρήσεις…"/></div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,padding:'9px 12px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.inner}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans,lineHeight:1.5}}>Με την αποθήκευση μπαίνει αυτόματα στο <strong style={{color:'var(--text-primary)'}}>ημερολόγιο</strong> (με υπενθύμιση email πριν λήξει){form.est_cost>0?<> και ως <strong style={{color:'var(--text-primary)'}}>εκκρεμής δαπάνη</strong> στον προϋπολογισμό «Συντήρηση»</>:''}.</p>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>
            <button onClick={()=>setAdding(false)} style={{padding:'0 16px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
            <button onClick={handleSave} disabled={saving} style={{padding:'0 20px',height:T.h.md,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize:12,fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer'}}>{saving?'Αποθήκευση…':'Αποθήκευση'}</button>
          </div>
        </div>
      )}
      {/* ΜΙΑ ΛΙΣΤΑ, ΟΧΙ ΤΡΕΙΣ. Ήταν χωρισμένη σε «σε καθυστέρηση», «επόμενες 30
          ημέρες» και «επερχόμενες», με σήμα-πλήθος σε κάθε επικεφαλίδα. Κάθε
          γραμμή ΗΔΗ γράφει πόσες ημέρες λείπουν ή πόσες καθυστερεί, οπότε οι
          τρεις επικεφαλίδες επαναλάμβαναν ό,τι έλεγε η ίδια η σειρά. Ταξινομημένη
          κατά ημερομηνία, η καθυστέρηση είναι από μόνη της πρώτη. */}
      {/* ΜΙΑ ΓΡΑΜΜΗ, ΟΧΙ ΚΕΝΤΡΑΡΙΣΜΕΝΟ ΜΠΛΟΚ. Η κενή κατάσταση είχε εικονίδιο 20
          σημείων, τίτλο και οδηγία δύο προτάσεων, ενώ το κουμπί «Νέα εργασία»
          στέκεται δύο εκατοστά πιο πάνω και λέει την ίδια κίνηση. Σε κινητό το
          μπλοκ έπιανε μισή οθόνη για να ανακοινώσει ότι δεν υπάρχει τίποτα. */}
      {schedules.length===0
        ? <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,margin:0}}>Καμία προγραμματισμένη συντήρηση.</p>
        : <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {[...schedules].sort((a,b)=>daysUntil(a.next_due)-daysUntil(b.next_due)).map(s=><SchedRow key={s.id} s={s}/>)}
          </div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// «ΦΡΟΝΤΙΔΑ»: ΔΥΟ ΕΝΟΤΗΤΕΣ, ΚΑΝΕΝΑ ΠΛΑΚΙΔΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Είχε τέσσερα πλακίδια στην κορυφή: ληγμένες εγγυήσεις, εγγυήσεις που λήγουν,
// συντήρηση σε καθυστέρηση, συντήρηση που έρχεται. Και τα τέσσερα νούμερα
// ξαναγράφονταν αμέσως από κάτω, ως σήμα δίπλα στον τίτλο της αντίστοιχης
// ενότητας — που έχει και τη λίστα, δηλαδή λέει το ίδιο ΚΑΙ δείχνει τι είναι.
//
// Ένα πλακίδιο που γράφει «2» πάνω από μια λίστα δύο γραμμών δεν πληροφορεί:
// καταλαμβάνει την κορυφή της οθόνης για να επαναλάβει ό,τι θα διαβαστεί ούτως
// ή άλλως δύο εκατοστά πιο κάτω. Έφυγαν και τα τέσσερα.
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΞΑΓΩΓΕΣ ΕΙΝΑΙ ΕΝΕΡΓΕΙΕΣ, ΟΧΙ ΕΝΟΤΗΤΑ ΤΗΣ ΣΕΛΙΔΑΣ
// ─────────────────────────────────────────────────────────────────────────
// Ήταν κάρτα με τρεις γραμμές, μόνιμα στο κάτω μέρος της οθόνης. Μια εξαγωγή
// όμως δεν είναι πληροφορία που κοιτάς: είναι κάτι που κάνεις μία φορά στους
// έξι μήνες. Κατέλαβε το τέλος κάθε επίσκεψης για να προσφέρει κάτι που σχεδόν
// ποτέ δεν ζητήθηκε εκείνη τη στιγμή. Τώρα ζουν στο μενού της κεφαλίδας.
