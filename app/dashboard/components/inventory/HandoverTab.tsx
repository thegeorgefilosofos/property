'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΩΤΟΚΟΛΛΟ ΠΑΡΑΔΟΣΗΣ ΚΑΙ ΠΑΡΑΛΑΒΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Ό,τι καταγράφεται εδώ κρίνεται μήνες αργότερα, όταν ο μισθωτής φύγει και
// διαφωνήσετε για την εγγύηση. Γι' αυτό η κατάσταση κάθε αντικειμένου
// παγιώνεται σε στιγμιότυπο με ημερομηνία και το έντυπο τυπώνεται με θέσεις
// υπογραφής: δεν είναι λογιστική κατάσταση, είναι έγγραφο που υπογράφεται.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useId } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { T, Btn, EmptyState, ABSENT, formGrid, fieldRow } from '@/components/Theme'
import { CustomSelect, TextInput, DatePicker } from '../UIComponents'
import { ClipboardCheck } from 'lucide-react'
import { notifyError } from '@/components/Toast'
import { uploadPath } from '@/lib/core/uploadPath'
import { uploadUserScoped } from '@/lib/storage/scopedUpload'
import { reportHead, reportHeader, reportDisclaimer, openReport, rEsc, rDate } from '../reportPdf'
import { INK, INK_FAINT, INK_MUTED, PAPER_ALT, RULE } from '@/lib/print/ink'
import { athensToday } from '@/lib/core/time'
import { CONDITIONS, CONDITION_COLOR, type InventoryItem, type InventoryHandover, type HandoverIntent } from './model'
import { fmtDate } from './calc'
import { Badge, SectionLabel, labelStyle } from './Bits'
import { MSG, SAY, failed } from '@/lib/core/dbError'

const supabase = createSupabaseClient()


// Πλέγμα με περιγράμματα και θέσεις υπογραφής: ένα πρωτόκολλο παράδοσης είναι
// έντυπο που συμπληρώνεται και υπογράφεται, όχι λογιστική κατάσταση.
const HANDOVER_CSS = `
  table.grid{margin-top:18px}
  table.grid th{background:${PAPER_ALT};padding:8px;border:1px solid ${RULE};font-size: 11px}
  table.grid td{padding:8px;border:1px solid ${RULE};color:${INK_MUTED};font-size:12px}
  .shot{width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid ${RULE}}
  .shot-at{font-size: 11px;color:${INK_FAINT}}
  .sig{margin-top:48px;display:flex;gap:60px;break-inside:avoid}
  .sig-box{flex:1;border-top:2px solid ${INK};padding-top:8px;font-size:11px;color:${INK_MUTED}}
`

// Πλέγμα καρτών με φωτογραφία: η έκθεση προς τον ασφαλιστή είναι φωτογραφική
// τεκμηρίωση, όχι πίνακας. Οι τρεις μετρικές από πάνω χρησιμοποιούν το κοινό
// `.kpis`/`.kpi`, οπότε δεν ξαναγράφονται εδώ.

export function HandoverTab({items,handovers,propertyId,userId,onSaved,seed}:{items:InventoryItem[];handovers:InventoryHandover[];propertyId:string;userId:string;onSaved:()=>void;seed?:(HandoverIntent&{n:number})|null}) {
  const [mode,setMode] = useState<'list'|'new'|'compare'>('list')
  const [type,setType] = useState<'check_in'|'check_out'>('check_in')
  const [tenantName,setTenantName] = useState(''); const [tenantPhone,setTenantPhone] = useState('')
  const [handoverDate,setHandoverDate] = useState(''); const [notes,setNotes] = useState('')
  const nameId = useId(); const phoneId = useId(); const notesId = useId()
  const [itemConds,setItemConds] = useState<Record<string,{condition:string;notes:string;photo?:string}>>({})
  const [saving,setSaving] = useState(false)
  const [uploadingId,setUploadingId] = useState<string|null>(null)
  const [cmpA,setCmpA] = useState(''); const [cmpB,setCmpB] = useState('')
  const [fromTenant,setFromTenant] = useState('')
  const uploadCondPhoto = async(itemId:string,file:File) => {
    setUploadingId(itemId)
    const {path,error}=await uploadUserScoped(supabase,'inventory-photos',uploadPath(file.name,'handover'),file,{upsert:true})
    if(error){notifyError(failed(MSG.upload));setUploadingId(null);return}
    const {data}=supabase.storage.from('inventory-photos').getPublicUrl(path)
    setItemConds(p=>({...p,[itemId]:{...p[itemId],photo:data.publicUrl}}))
    setUploadingId(null)
  }
  // ΤΡΕΙΣ ΠΡΟΣΑΡΜΟΓΕΣ ΚΑΤΑ ΤΗΝ ΑΠΟΔΟΣΗ, ΟΧΙ ΤΡΙΑ EFFECT. Ολες ήταν «όταν αλλάξει
  // αυτό, γράψε εκείνο»: ως effect, η οθόνη ζωγραφιζόταν πρώτα με τα ΠΑΛΙΑ και
  // μετά με τα νέα. Σε πρωτόκολλο παράδοσης, το ενδιάμεσο καρέ δείχνει
  // καταστάσεις αντικειμένων από άλλη παράδοση. Η React το ονομάζει «adjusting
  // state when a prop changes».
  //
  // Reset ΜΟΝΟ όταν μπαίνουμε σε νέο πρωτόκολλο (αλλαγή mode), όχι σε κάθε
  // refetch των items.
  const [modeSeen,setModeSeen]=useState(mode)
  if(mode!==modeSeen){
    setModeSeen(mode)
    if(mode==='new'){const init:Record<string,{condition:string;notes:string;photo?:string}>={};items.forEach(i=>{init[i.id]={condition:i.condition,notes:''}});setItemConds(init)}
    if(mode==='list')setFromTenant('')
  }
  // Αν αλλάξουν τα items ενώ συμπληρώνουμε, πρόσθεσε μόνο τα νέα — διατήρησε
  // κατάσταση, σημειώσεις και φωτογραφίες σε εξέλιξη.
  const [itemsSeen,setItemsSeen]=useState(items)
  if(items!==itemsSeen){
    setItemsSeen(items)
    if(mode==='new') setItemConds(prev=>{const next={...prev};items.forEach(i=>{if(!next[i.id])next[i.id]={condition:i.condition,notes:''}});return next})
  }
  // Prefill από deep-link (καρτέλα ενοικιαστή): άνοιξε νέο πρωτόκολλο με το
  // όνομα, το τηλέφωνο και τον τύπο έτοιμα.
  const [seedSeen,setSeedSeen]=useState<number|null>(seed?.n??null)
  if(seed&&seed.n!==seedSeen){
    setSeedSeen(seed.n)
    setMode('new')
    if(seed.tenantName){setTenantName(seed.tenantName);setFromTenant(seed.tenantName)}
    if(seed.tenantPhone)setTenantPhone(seed.tenantPhone)
    if(seed.type)setType(seed.type)
  }
  const handleSave = async() => {
    if(!tenantName.trim()){notifyError(SAY.nameRequired);return}
    setSaving(true)
    const nowIso=new Date().toISOString()
    const snap = items.map(i=>({item_id:i.id,name:i.name,category:i.category,condition_at_handover:itemConds[i.id]?.condition||i.condition,condition_notes:itemConds[i.id]?.notes||'',photo_url:i.photo_url||'',condition_photo:itemConds[i.id]?.photo||'',captured_at:itemConds[i.id]?.photo?nowIso:''}))
    const {error} = await supabase.from('inventory_handovers').insert({property_id:propertyId,user_id:userId,handover_type:type,tenant_name:tenantName,tenant_phone:tenantPhone,handover_date:handoverDate||athensToday(),notes,items_snapshot:snap})
    if(error){notifyError(failed('Το πρωτόκολλο δεν αποθηκεύτηκε',error));setSaving(false);return}
    setMode('list');onSaved();setSaving(false)
  }
  // ΤΟ ΠΡΩΤΟΚΟΛΛΟ ΕΙΝΑΙ ΕΝΤΥΠΟ ΠΟΥ ΥΠΟΓΡΑΦΕΤΑΙ, άρα κρατά πλέγμα με περιγράμματα
  // αντί για το ύφος λογιστικής κατάστασης — αυτό είναι πραγματική διαφορά
  // εγγράφου. Ό,τι ΔΕΝ ήταν διαφορά έφυγε: η χειρόγραφη επικεφαλίδα, η
  // διακοσμητική έγχρωμη λωρίδα στην κορυφή, ένα ακόμη γκρι (#6b7280) και το
  // κουμπί «Εκτύπωση» μέσα στη σελίδα — τα άλλα οκτώ έγγραφα τυπώνονται μόνα
  // τους, αυτό περίμενε κλικ σε ένα κουμπί που το ίδιο του το CSS έκρυβε στην
  // εκτύπωση.
  const printHandover = (h:InventoryHandover) => {
    const snap=h.items_snapshot||[]
    const html = reportHead('Πρωτόκολλο παράδοσης και παραλαβής', HANDOVER_CSS)
      + `<body><div class="page">`
      + reportHeader(null, `Πρωτόκολλο ${h.handover_type==='check_in'?'παράδοσης':'παραλαβής'}`, {
          rightLabel: 'Ημερομηνία', rightValue: rDate(h.handover_date),
        })
      + `
    <h1>${rEsc(h.tenant_name)}</h1>
    <div class="sub">${[h.tenant_phone, fmtDate(h.handover_date)].filter(Boolean).map(x=>rEsc(String(x))).join(' · ')}</div>
    <table class="grid"><thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κατάσταση</th><th>Παρατηρήσεις</th><th>Φωτογραφία κατάστασης</th></tr></thead><tbody>
    ${snap.map(s=>`<tr><td>${rEsc(s.name)}</td><td>${rEsc(s.category)}</td><td>${rEsc(s.condition_at_handover)}</td><td>${rEsc(s.condition_notes||ABSENT)}</td><td>${s.condition_photo?`<img src="${rEsc(s.condition_photo)}" class="shot"/>${s.captured_at?`<br><span class="shot-at">${rEsc(fmtDate(s.captured_at))}</span>`:''}`:rEsc(ABSENT)}</td></tr>`).join('')}
    </tbody></table>
    <div class="sig"><div class="sig-box">Υπογραφή ιδιοκτήτη</div><div class="sig-box">Υπογραφή ενοικιαστή</div><div class="sig-box">Ημερομηνία</div></div>
    ${reportDisclaimer('Πρωτόκολλο παράδοσης και παραλαβής εξοπλισμού. Ισχύει με τις υπογραφές και των δύο μερών.')}
    </div></body></html>`
    openReport(html)
  }
  if(mode==='compare') {
    const hA=handovers.find(h=>h.id===cmpA); const hB=handovers.find(h=>h.id===cmpB)
    const condOrder=['Άριστη','Καλή','Μέτρια','Κακή','Εκτός Λειτουργίας']
    const allNames=[...new Set([...(hA?.items_snapshot||[]).map(s=>s.name),...(hB?.items_snapshot||[]).map(s=>s.name)])]
    return (
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Σύγκριση πρωτοκόλλων</p>
          <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize: 'var(--fs-base)',fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
        </div>
        <div style={{...formGrid(200, 270),gap:12}}>
          {[{v:cmpA,sv:setCmpA},{v:cmpB,sv:setCmpB}].map(({v,sv},i)=>(
            <div key={i}>
              <label style={labelStyle}>Πρωτόκολλο {i===0?'Α':'Β'}</label>
              <CustomSelect ariaLabel={`Πρωτόκολλο ${i===0?'Α':'Β'}`} value={v} onChange={sv} options={[{value:'',label:'Επιλογή πρωτοκόλλου'},...handovers.filter(h=>i===0||h.id!==cmpA).map(h=>({value:h.id,label:`${h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${h.tenant_name} · ${fmtDate(h.handover_date)}`}))]}/>
            </div>
          ))}
        </div>
        {hA&&hB&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'8px 14px',borderBottom:'2px solid var(--border-subtle)'}}>
              {['Αντικείμενο',`${hA.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${hA.tenant_name}`,`${hB.handover_type==='check_in'?'Είσοδος':'Έξοδος'} · ${hB.tenant_name}`].map(h=><p key={h} style={{fontSize: 'var(--fs-xs)',color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:T.font.sans}}>{h}</p>)}
            </div>
            {allNames.map(name=>{
              const sA=hA.items_snapshot?.find(s=>s.name===name); const sB=hB.items_snapshot?.find(s=>s.name===name)
              const cA=sA?.condition_at_handover||null; const cB=sB?.condition_at_handover||null
              const degraded=cA!==cB&&cA!=null&&cB!=null&&condOrder.indexOf(cB)>condOrder.indexOf(cA)
              return (
                <div key={name} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:0,padding:'10px 14px',background:degraded?'var(--negative-dim)':'var(--bg-elevated)',borderRadius:8,marginBottom:4,border:`1px solid ${degraded?'var(--negative-border)':'var(--border-subtle)'}`}}>
                  <p style={{fontSize:12,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{name}{degraded&&<span title="Υποβαθμισμένη κατάσταση" style={{display:'inline-flex',color:'var(--negative)',marginLeft:6,verticalAlign:'middle'}}><svg aria-hidden="true" width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg></span>}</p>
                  <div>{cA!=null?<Badge label={cA} color={CONDITION_COLOR[cA]||'var(--text-tertiary)'}/>:<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Δεν υπήρχε</span>}</div>
                  <div>{cB!=null?<Badge label={cB} color={CONDITION_COLOR[cB]||'var(--text-tertiary)'}/>:<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Δεν υπήρχε</span>}</div>
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
      <style>{`@keyframes invSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <p style={{fontSize:18,fontWeight:400,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Νέο πρωτόκολλο παράδοσης</p>
        <button onClick={()=>setMode('list')} style={{padding:'0 16px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize: 'var(--fs-base)',fontFamily:T.font.sans,cursor:'pointer'}}>Πίσω</button>
      </div>
      {fromTenant&&(
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--accent-soft)',border:'1px solid var(--accent-border)',borderRadius:T.radius.inner}}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Προσυμπληρώθηκε από την καρτέλα ενοικιαστή για <strong style={{color:'var(--text-primary)'}}>{fromTenant}</strong>. Έλεγξε την κατάσταση κάθε αντικειμένου πριν αποθηκεύσεις.</p>
        </div>
      )}
      <div style={{...formGrid(200, 270),gap:10}}>
        {(['check_in','check_out'] as const).map(t=>(
          <button key={t} onClick={()=>setType(t)} style={{padding:'14px',borderRadius:T.radius.card,cursor:'pointer',fontWeight:500,fontFamily:T.font.sans,fontSize: 'var(--fs-base)',border:`1px solid ${type===t?'var(--accent)':'var(--border-subtle)'}`,background:type===t?'var(--accent)':'var(--bg-elevated)',color:type===t?'var(--accent-text)':'var(--text-secondary)',transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s'}}>
            {t==='check_in'?'Είσοδος ενοικιαστή':'Έξοδος ενοικιαστή'}
          </button>
        ))}
      </div>
      <div {...fieldRow(180, 12)}>
        <div><label htmlFor={nameId} style={labelStyle}>Ονοματεπώνυμο *</label><TextInput id={nameId} value={tenantName} onChange={setTenantName} placeholder="Παράδειγμα: Ιωάννης Παπαδόπουλος"/></div>
        <div><label htmlFor={phoneId} style={labelStyle}>Τηλέφωνο</label><TextInput id={phoneId} value={tenantPhone} onChange={setTenantPhone} placeholder="6912345678"/></div>
        <div><label style={labelStyle}>Ημερομηνία</label><DatePicker value={handoverDate} onChange={setHandoverDate}/></div>
        <div><label htmlFor={notesId} style={labelStyle}>Σημειώσεις</label><TextInput id={notesId} value={notes} onChange={setNotes} placeholder="Γενικές παρατηρήσεις…"/></div>
      </div>
      <div>
        <SectionLabel label="Κατάσταση αντικειμένων" right={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{items.length} αντικείμενα</span>}/>
        <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,margin:'-4px 0 10px',lineHeight:1.5}}>Πάτησε τη μικρογραφία για να τραβήξεις <strong style={{color:'var(--text-secondary)'}}>φωτογραφία της τρέχουσας κατάστασης</strong>, χρονοσφραγίζεται και μπαίνει στο εκτυπώσιμο πρωτόκολλο ως απόδειξη.</p>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {items.map(item=>(
            <div key={item.id} style={{display:'grid',gridTemplateColumns:'44px minmax(0,1.4fr) 150px minmax(0,1.6fr)',gap:14,alignItems:'center',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
              {(()=>{const cp=itemConds[item.id]?.photo;const busy=uploadingId===item.id;return (
                <label title={cp?'Φωτογραφία κατάστασης (πάτησε για αλλαγή)':'Τράβα φωτογραφία της τρέχουσας κατάστασης'} style={{position:'relative',width:44,height:44,borderRadius:10,overflow:'hidden',flexShrink:0,cursor:'pointer',display:'block',border:cp?'2px solid var(--accent)':'1px solid var(--border-subtle)'}}>
                  {cp
                    ?<img src={cp} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                    :item.photo_url
                      ?<img src={item.photo_url} style={{width:'100%',height:'100%',objectFit:'cover',opacity:0.5}} alt=""/>
                      :<div style={{width:'100%',height:'100%',background:'var(--accent-soft)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center'}}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg></div>}
                  <span style={{position:'absolute',right:2,bottom:2,width:16,height:16,borderRadius:6,background:cp?'var(--accent)':'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {busy?<span style={{width:9,height:9,border:`1.5px solid ${cp?'var(--accent-text)':'#fff'}`,borderTopColor:'transparent',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>:<svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={cp?'var(--accent-text)':'#fff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>}
                  </span>
                  <input type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadCondPhoto(item.id,f)}}/>
                </label>
              )})()}
              <div style={{minWidth:0}}>
                <p style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</p>
                <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category}{item.room?` · ${item.room}`:''}</p>
              </div>
              <CustomSelect ariaLabel={`Κατάσταση: ${item.name}`} value={itemConds[item.id]?.condition||item.condition} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],condition:v}}))} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
              <TextInput ariaLabel={`Παρατηρήσεις: ${item.name}`} value={itemConds[item.id]?.notes||''} onChange={v=>setItemConds(p=>({...p,[item.id]:{...p[item.id],notes:v}}))} placeholder="μικρή γρατζουνιά στην πόρτα"/>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:10}}>
        <button onClick={()=>setMode('list')} style={{padding:'0 20px',height:T.h.lg,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize: 'var(--fs-base)',fontFamily:T.font.sans,cursor:'pointer'}}>Ακύρωση</button>
        <button onClick={handleSave} disabled={saving} style={{padding:'0 24px',height:T.h.lg,borderRadius:T.radius.pill,background:saving?'var(--bg-elevated)':'var(--accent)',border:'none',color:saving?'var(--text-tertiary)':'var(--accent-text)',fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,cursor:saving?'wait':'pointer'}}>
          {saving?'Αποθήκευση…':'Αποθήκευση Πρωτοκόλλου'}
        </button>
      </div>
    </div>
  )
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:16,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>Πρωτόκολλα παράδοσης</p>
          <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,marginTop:2,maxWidth:560,lineHeight:1.5}}>Καταγράφει την κατάσταση κάθε αντικειμένου κατά την είσοδο & έξοδο του ενοικιαστή, απόδειξη για την επιστροφή της εγγύησης σε περίπτωση φθορών.</p>
        </div>
        <div style={{display:'flex',gap:8,flexShrink:0}}>
          {handovers.length>=2&&<button onClick={()=>setMode('compare')} style={{padding:'0 14px',height:T.h.md,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontFamily:T.font.sans,fontWeight:500,cursor:'pointer'}}>Σύγκριση εισόδου/εξόδου</button>}
          {handovers.length>0&&<button onClick={()=>setMode('new')} style={{padding:'0 18px',height:T.h.md,borderRadius:T.radius.pill,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>Νέο πρωτόκολλο</button>}
        </div>
      </div>
      {handovers.length===0
        ?/* ΧΩΡΙΣ ΚΑΡΤΑ ΓΥΡΩ ΑΠΟ ΤΟ ΤΙΠΟΤΑ. Δύο από τις σαράντα πέντε κενές
           καταστάσεις της εφαρμογής τυλίγονταν σε κάρτα, οι σαράντα τρεις όχι:
           ο χρήστης έβλεπε την ίδια κατάσταση με δύο διαφορετικά βάρη ανάλογα
           με την καρτέλα. Ένα περίγραμμα γύρω από την απουσία της δίνει σώμα
           που δεν έχει. */
        <EmptyState icon={<ClipboardCheck size={20}/>} title="Κανένα πρωτόκολλο ακόμη" hint="Στην είσοδο ενός ενοικιαστή κατέγραψε την κατάσταση κάθε αντικειμένου· στην έξοδο συγκρίνεις και τεκμηριώνεις φθορές." action={<Btn variant="primary" onClick={()=>setMode('new')}>Νέο πρωτόκολλο</Btn>} />
        :<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {handovers.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map(h=>{
            const snap=h.items_snapshot||[]; const bad=snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').length
            return (
              <div key={h.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:bad>0?12:0}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <Badge label={h.handover_type==='check_in'?'Είσοδος':'Έξοδος'} color="var(--text-secondary)"/>
                      <p style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)'}}>{h.tenant_name}</p>
                    </div>
                    <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{fmtDate(h.handover_date)}{h.tenant_phone?` · ${h.tenant_phone}`:''} · {snap.length} αντικείμενα{(()=>{const ph=snap.filter(s=>s.condition_photo).length;return ph>0?` · ${ph} φωτό`:''})()}</p>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {bad>0&&<Badge label={`${bad} προβλήματα`} color="var(--negative)"/>}
                    <button onClick={()=>printHandover(h)} style={{padding:'0 12px',height:T.h.sm,borderRadius:T.radius.pill,border:'1px solid var(--border-subtle)',background:'none',color:'var(--accent)',fontSize:12,fontFamily:T.font.sans,cursor:'pointer',fontWeight:500}}>Εκτύπωση</button>
                  </div>
                </div>
                {bad>0&&(
                  <div style={{padding:'8px 12px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>
                    {snap.filter(s=>s.condition_at_handover==='Κακή'||s.condition_at_handover==='Εκτός Λειτουργίας').map((s,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize: 'var(--fs-xs)',color:'var(--text-secondary)',fontFamily:T.font.sans,padding:'2px 0'}}>
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
