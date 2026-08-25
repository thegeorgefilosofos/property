'use client'
// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΡΤΕΛΑ ΕΝΟΣ ΑΝΤΙΚΕΙΜΕΝΟΥ: ΦΩΤΟΓΡΑΦΙΑ, ΕΤΙΚΕΤΑ, ΚΑΙ ΜΕΤΑ ΤΑ ΠΕΔΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Η μεγαλύτερη οθόνη της απογραφής και η μόνη με τρεις αυτόματους δρόμους
// συμπλήρωσης: τη φωτογραφία που τη διαβάζει ο βοηθός, τον κωδικό της
// ενεργειακής ετικέτας που τη φέρνει από το ευρωπαϊκό μητρώο και το χέρι.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useRef } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { T, Modal, Btn, fe, feRate, pressable, formGrid } from '@/components/Theme'
import { NOT_TAX_DEPRECIATION_NOTE } from '@/lib/inventory/depreciation'
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea } from '../UIComponents'
import { formFields, INVENTORY_FIELDS, type FieldContext, type FieldDecision } from '@/lib/property/fields'
import { suggestedEnergyMode, ENERGY_MODE_LABEL, type EnergyMode, type EnergyInput, monthlyKwh } from '@/lib/property/energy'
import { parseEprelRef, warrantyExpiry, type EprelFill } from '@/lib/property/eprel'
import { notifyError } from '@/components/Toast'
import { failed, MSG } from '@/lib/core/dbError'
import { uploadPath } from '@/lib/core/uploadPath'
import { uploadUserScoped } from '@/lib/storage/scopedUpload'
import { INVENTORY_CATEGORIES, CONDITIONS, ENERGY_CLASSES, type InventoryItem } from './model'
import { blankIfZero, calcCurrentValue, calcDepreciationPct, calcYearsLeft } from './calc'
import { DOCS_BUCKET, openInventoryDoc } from './storage'
import { Field, RoomInput, SectionLabel, labelStyle } from './Bits'

const supabase = createSupabaseClient()

// 28 πεδία ανά αντικείμενο έγιναν 13 και το ποιο βλέπει ο χρήστης το κρίνει το
// μητρώο (INVENTORY_FIELDS), όχι αυτό το αντικείμενο. Οι στήλες της βάσης δεν
// αγγίζονται — απλώς δεν ζητάμε πια δεδομένα που δεν κάνουν τίποτα.
const EMPTY_ITEM: Partial<InventoryItem> = {
  name:'',category:'Ηλεκτρικές Συσκευές',room:'',brand:'',model:'',serial_number:'',
  purchase_value:0,purchase_date:'',warranty_expiry:'',condition:'Καλή',notes:'',
  photo_url:'',photos:[],energy_class:'',energy_mode:null,kwh_per_100_cycles:0,cycles_per_month:0,annual_kwh:0,power_watts:0,daily_hours_use:0,
  replacement_cost:0,
}

// Σύστημα αναγνώρισης εξοπλισμού από φωτογραφία (συσκευασία/ετικέτα/booklet/απόδειξη).
const ITEM_SCAN_SYSTEM = `Είσαι σύστημα αναγνώρισης οικιακού εξοπλισμού από φωτογραφία (συσκευασία, ετικέτα ενέργειας, booklet ή απόδειξη αγοράς). Επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON, χωρίς άλλο κείμενο:
{"name":"","brand":"","model":"","serial_number":"","category":"<μία από: Έπιπλα, Ηλεκτρικές Συσκευές, Ηλεκτρονικά, Υδραυλικά, Θέρμανση & Ψύξη, Φωτιστικά, Διακόσμηση, Λοιπά>","price":"αριθμός € ή κενό","warranty_expiry":"YYYY-MM-DD ή κενό","energy_class":"π.χ. A+++ ή κενό","power_watts":"αριθμός W ή κενό","store":"","purchase_date":"YYYY-MM-DD ή κενό"}
Διάβασε ό,τι φαίνεται με ακρίβεια· άφησε κενά όσα δεν διακρίνονται. Το name να είναι περιγραφικό (π.χ. «Πλυντήριο Bosch WAU28»). Χωρίς κείμενο εκτός του JSON.`


export function ItemFormModal({item,onSave,onClose,propertyId,ctx,kwhPrice,startManual}:{item?:InventoryItem|null;onSave:(d:Partial<InventoryItem>)=>void;onClose:()=>void;propertyId:string;ctx:FieldContext;kwhPrice:number;
  /** Ανοίγει με όλα τα πεδία ορατά, όταν ο χρήστης ζήτησε ρητά το χέρι. */
  startManual?:boolean}) {
  const [form,setForm] = useState<Partial<InventoryItem>>(item?{...item,photos:item.photos||[]}:{...EMPTY_ITEM})
  const [saving,setSaving] = useState(false)
  const [scanning,setScanning] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof InventoryItem>(k:K,v:InventoryItem[K]) => setForm(f=>({...f,[k]:v}))
  const isElectric = ['Ηλεκτρικές Συσκευές','Ηλεκτρονικά','Φωτιστικά','Θέρμανση & Ψύξη'].includes(form.category||'')
  // Ποια πεδία βλέπει ΑΥΤΟΣ ο χρήστης, σε ΑΥΤΗ τη φόρμα, τώρα.
  const fields = formFields(INVENTORY_FIELDS, ctx)
  const byId = new Map<string,FieldDecision>([...fields.core, ...fields.more].map(d=>[d.id,d]))
  const f = (id:string) => byId.get(id)
  // Η ετικέτα που βλέπει ο χρήστης τη γράφει το <Field>· ο αναγνώστης οθόνης
  // όμως διαβάζει το πεδίο, όχι το <Field>. Ίδιο κείμενο, μία πηγή.
  const fl = (id:string) => byId.get(id)?.label
  // «Περισσότερα»: ανοιχτό εξ αρχής όταν το αντικείμενο έχει ήδη τέτοια στοιχεία.
  const [showMore,setShowMore] = useState<boolean>(!!(item&&(item.replacement_cost||item.energy_class||item.power_watts||item.serial_number||item.brand||item.notes)))
  // ═══ Η ΦΩΤΟΓΡΑΦΙΑ ΕΙΝΑΙ Ο ΠΡΩΤΟΣ ΔΡΟΜΟΣ, ΟΧΙ ΕΝΑΣ ΑΠΟ ΤΟΥΣ ΔΕΚΑΠΕΝΤΕ ══════
  //
  // ΤΙ ΕΛΕΓΕ ΚΑΙ ΤΙ ΕΚΑΝΕ. Η κάρτα υπόσχεται «φωτογράφισε την ετικέτα και
  // συμπληρώνουμε μάρκα, μοντέλο, αξία, εγγύηση και ενεργειακή κλάση» — και
  // αμέσως από κάτω άνοιγε δεκατέσσερα άδεια πεδία. Ο χρήστης διαβάζει την
  // υπόσχεση, βλέπει τη φόρμα και συμπεραίνει ότι η φωτογραφία είναι ένα ακόμη
  // προαιρετικό βήμα πριν τη χειρωνακτική δουλειά. Έτσι η δυνατότητα που
  // ξεχωρίζει το προϊόν καταλήγει να μη χρησιμοποιείται.
  //
  // ΤΙ ΜΕΝΕΙ ΟΡΑΤΟ ΠΡΙΝ ΤΗ ΦΩΤΟΓΡΑΦΙΑ. Τα τρία που ΔΕΝ βγαίνουν ποτέ από
  // εικόνα: δωμάτιο, κατάσταση και απόδειξη. Όλα τα υπόλοιπα τα διαβάζει η
  // σάρωση, οπότε το να ζητηθούν πρώτα είναι δουλειά που ίσως δεν χρειαστεί.
  //
  // ΚΑΙ ΠΑΝΤΑ ΥΠΑΡΧΕΙ ΤΟ ΧΕΡΙ. Παλιό έπιπλο χωρίς ετικέτα, συσκευή που δεν
  // φωτογραφίζεται, χρήστης που βιάζεται: ένα πάτημα ανοίγει τα πάντα. Κρύβουμε
  // βήματα, δεν κλειδώνουμε δρόμους.
  //
  // ΣΤΗΝ ΕΠΕΞΕΡΓΑΣΙΑ ΑΝΟΙΓΕΙ ΟΛΟΚΛΗΡΗ. Όποιος πατά «Επεξεργασία» ήρθε για ένα
  // συγκεκριμένο πεδίο· να το ψάξει πίσω από κουμπί θα ήταν εχθρικό.
  const [manual,setManual] = useState<boolean>(!!item||!!startManual)
  const revealed = manual || (form.photos||[]).length>0
  // Ο αποθηκευμένος τρόπος, αλλιώς η πρόταση της κατηγορίας. Η πρόταση ΔΕΝ
  // γράφεται σιωπηλά στη βάση: γράφεται μόνο αν ο χρήστης αποθηκεύσει, οπότε
  // ένα άνοιγμα της φόρμας δεν αλλάζει δεδομένα.
  const energyMode = (form.energy_mode || suggestedEnergyMode(form.category) || 'hours') as EnergyMode
  const liveKwh = monthlyKwh({ ...form, energy_mode: energyMode } as EnergyInput) ?? 0
  const handleSave = async() => {
    if(!form.name?.trim()){notifyError('Το όνομα είναι υποχρεωτικό.');return}
    const primaryUrl = form.photo_url||(form.photos&&form.photos.length>0?form.photos[0]:'')
    setSaving(true)
    await onSave({...form,photo_url:primaryUrl})
    setSaving(false)
  }
  const [docUp,setDocUp] = useState(false)
  // Οι αποδείξεις πάνε σε ΙΔΙΩΤΙΚΟ bucket, με path ανά ακίνητο· αποθηκεύουμε το PATH και ανοίγουμε με signed URL.
  const uploadReceiptDoc = async(file:File) => {
    setDocUp(true)
    const path=uploadPath(file.name,`receipts/${propertyId}`)
    // ΤΟ `upsert:true` ΔΕΝ ΕΙΧΕ ΠΟΛΙΤΙΚΗ ΝΑ ΤΟ ΣΤΗΡΙΞΕΙ. Ο κάδος έχει πολιτικές
    // μόνο για εισαγωγή, ανάγνωση και διαγραφή — καμία για ενημέρωση, οπότε κάθε
    // αντικατάσταση θα έσκαγε με σφάλμα δικαιωμάτων. Ούτως ή άλλως η διαδρομή
    // περιέχει χρόνο και τυχαίο, άρα δεν υπάρχει τίποτα να αντικατασταθεί.
    const {error}=await supabase.storage.from(DOCS_BUCKET).upload(path,file,{upsert:false})
    if(error){notifyError(failed(MSG.upload));setDocUp(false);return}
    const prev=form.receipt_doc_url
    setForm(f=>({...f,receipt_doc_url:path,receipt_doc_name:file.name}))
    // Καθάρισε τυχόν προηγούμενο ΑΝΕΒΑΣΜΑ αυτής της συνεδρίας (όχι το αρχικά αποθηκευμένο).
    if(prev&&prev!==item?.receipt_doc_url&&!/^https?:\/\//.test(prev)) await supabase.storage.from(DOCS_BUCKET).remove([prev])
    setDocUp(false)
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
          category:d.category&&[...INVENTORY_CATEGORIES].includes(d.category)?d.category:f.category,
          purchase_value:f.purchase_value||Math.round(num(d.price)),
          warranty_expiry:f.warranty_expiry||d.warranty_expiry||'',
          energy_class:f.energy_class||(ENERGY_CLASSES.includes(d.energy_class)?d.energy_class:''),
          power_watts:f.power_watts||num(d.power_watts),
          purchase_date:f.purchase_date||d.purchase_date||'',
        }))
        if(d.energy_class||d.power_watts||d.price) setShowMore(true)
      }
    } catch { /* σιωπηλή αποτυχία — μη μπλοκάρει τη ροή */ }
    setScanning(false)
  }

  // ═══ Ο ΚΩΔΙΚΟΣ ΤΗΣ ΕΝΕΡΓΕΙΑΚΗΣ ΕΤΙΚΕΤΑΣ ΣΥΜΠΛΗΡΩΝΕΙ ΤΗΝ ΚΑΡΤΕΛΑ ═══════════
  //
  // ΤΙ ΑΛΛΑΖΕΙ. Τα kWh ανά 100 κύκλους δεν τα θυμάται κανείς και δεν γράφονται
  // στο ταμπελάκι του σασί: γράφονται στην ενεργειακή ετικέτα, που συνήθως έχει
  // πεταχτεί μαζί με το κουτί. Το QR της ετικέτας οδηγεί στο ευρωπαϊκό μητρώο,
  // όπου ο ΙΔΙΟΣ ο κατασκευαστής είναι υποχρεωμένος να τα έχει δηλώσει.
  //
  // ΓΙΑΤΙ ΓΡΑΦΕΙ ΠΑΝΩ ΑΠΟ ΟΣΑ ΥΠΑΡΧΟΥΝ. Σε αντίθεση με τη σάρωση φωτογραφίας,
  // που μαντεύει και άρα δεν πειράζει ό,τι έγραψε ο χρήστης, εδώ η πηγή είναι ο
  // κατασκευαστής και ο χρήστης ζήτησε ρητά τη συμπλήρωση. Η εγγύηση είναι η
  // εξαίρεση: το μητρώο δίνει ΜΗΝΕΣ, όχι ημερομηνία, οπότε χρειάζεται
  // ημερομηνία αγοράς — και δεν σβήνει ημερομηνία που έχει βάλει ο χρήστης.
  const [eprelInput,setEprelInput] = useState('')
  const [eprelBusy,setEprelBusy] = useState(false)
  const [eprelSource,setEprelSource] = useState('')
  const fillFromEprel = async() => {
    if(!parseEprelRef(eprelInput)){notifyError('Χρειάζεται ο σύνδεσμος του QR της ετικέτας ή η ομάδα προϊόντος με τον αριθμό μητρώου.');return}
    setEprelBusy(true)
    try {
      const res=await fetch(`/api/eprel?ref=${encodeURIComponent(eprelInput.trim())}`)
      const data=await res.json() as {fill?:EprelFill;source?:string;error?:string}
      if(!res.ok||data.error||!data.fill){notifyError(data.error||failed('Η ανάγνωση του μητρώου'));setEprelBusy(false);return}
      const fill=data.fill
      setForm(f=>({...f,
        name:f.name||[fill.brand,fill.model].filter(Boolean).join(' '),
        brand:fill.brand??f.brand,
        model:fill.model??f.model,
        energy_class:fill.energy_class&&ENERGY_CLASSES.includes(fill.energy_class)?fill.energy_class:f.energy_class,
        energy_mode:fill.energy_mode??f.energy_mode,
        kwh_per_100_cycles:fill.kwh_per_100_cycles??f.kwh_per_100_cycles,
        annual_kwh:fill.annual_kwh??f.annual_kwh,
        warranty_expiry:f.warranty_expiry||warrantyExpiry(f.purchase_date,fill.guarantee_months)||'',
      }))
      setEprelSource(data.source||'')
      setShowMore(true)
    } catch { notifyError(failed('Η ανάγνωση του μητρώου')) }
    setEprelBusy(false)
  }

  // Ενιαίο πεδίο φωτογραφίας: ανεβάζει τη φωτογραφία ΚΑΙ (προαιρετικά) τη διαβάζει
  // με AI — μία ενέργεια, όχι δύο ξεχωριστά «πεδία φωτο».
  const [photoBusy,setPhotoBusy] = useState(false)
  const addPhotoFile = async(file:File) => {
    setPhotoBusy(true)
    const {path,error}=await uploadUserScoped(supabase,'inventory-photos',uploadPath(file.name),file,{upsert:true})
    if(!error){ const {data:u}=supabase.storage.from('inventory-photos').getPublicUrl(path); setForm(f=>{const photos=[...(f.photos||[]),u.publicUrl]; return {...f,photos,photo_url:f.photo_url||u.publicUrl}}) }
    else notifyError(failed(MSG.upload))
    setPhotoBusy(false)
  }
  const removePhoto = (url:string) => { const p=(form.photos||[]).filter(x=>x!==url); set('photos',p); if(form.photo_url===url) set('photo_url',p[0]||'') }
  const pickPhoto = async(file:File) => { await addPhotoFile(file); runScan(file) }

  // ΤΟ ΥΨΟΣ ΗΤΑΝ ΚΛΕΙΔΩΜΕΝΟ ΣΤΟ `calc(100vh - 32px)` ΜΕ maxHeight 820: ένα «Νέο
  // Αντικείμενο» με τρία πεδία άνοιγε παράθυρο ολόκληρης οθόνης με 600px κενό
  // κάτω από την τελευταία γραμμή. Το Modal μεγαλώνει με το περιεχόμενο ως 92dvh.
  //
  // ΚΑΜΙΑ ΕΞΟΔΟΣ ΟΣΟ ΤΡΕΧΕΙ Η ΑΠΟΘΗΚΕΥΣΗ. Το Modal φέρνει Escape και κλικ στο
  // φόντο, που το χειρόγραφο δεν είχε· εδώ όμως έχουν ήδη ανέβει φωτογραφίες και
  // απόδειξη στο storage, οπότε μια έξοδος στη μέση της εγγραφής αφήνει ορφανά
  // αρχεία και αντικείμενο που ο χρήστης νομίζει ότι καταχωρήθηκε.
  const closeGuarded = () => { if(!saving) onClose() }
  return (
    <Modal open onClose={closeGuarded} width={680}
      title={item?'Επεξεργασία Αντικειμένου':'Νέο Αντικείμενο'}
      subtitle={item?item.name:undefined}
      footer={<>
        <Btn onClick={closeGuarded} disabled={saving}>Ακύρωση</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση'}</Btn>
      </>}>
      {/* Ένα πεδίο: φωτογραφία + αυτόματη ανάγνωση με AI (μάρκα, μοντέλο, αξία, εγγύηση, ενέργεια) */}
      <input ref={scanRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)pickPhoto(f);e.currentTarget.value=''}}/>
      <style>{`@keyframes invSpin{to{transform:rotate(360deg)}}`}</style>
      {(form.photos||[]).length===0 ? (
        <button onClick={()=>{if(!scanning&&!photoBusy)scanRef.current?.click()}} disabled={scanning||photoBusy}
          style={{display:'flex',alignItems:'center',gap:14,width:'100%',textAlign:'left',padding:'16px 18px',borderRadius:T.radius.card,border:'1px solid var(--accent-border)',background:'var(--accent-soft)',cursor:(scanning||photoBusy)?'wait':'pointer',fontFamily:T.font.sans}}>
          <div style={{width:44,height:44,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--accent-border)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--accent)'}}>
            {(scanning||photoBusy)?<div style={{width:18,height:18,border:'2px solid var(--accent-border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>
              :<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.2"/></svg>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,color:'var(--accent)'}}>{scanning?'Ανάγνωση φωτογραφίας…':photoBusy?'Μεταφόρτωση…':'Προσθήκη φωτογραφίας'}</div>
            <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.45,marginTop:2}}>Ανεβάστε φωτογραφία του αντικειμένου, της ετικέτας ή της απόδειξης και συμπληρώνουμε αυτόματα μάρκα, μοντέλο, αξία, εγγύηση και ενεργειακή κλάση.</div>
          </div>
        </button>
      ) : (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(84px,1fr))',gap:8}}>
            {(form.photos||[]).map((url,i)=>(
              <div key={i} {...pressable(()=>set('photo_url',url), url===form.photo_url?'Κύρια φωτογραφία':'Ορισμός ως κύρια φωτογραφία')} title={url===form.photo_url?'Κύρια φωτογραφία':'Ορισμός ως κύρια'} style={{position:'relative',height:84,borderRadius:10,overflow:'hidden',border:`2px solid ${url===form.photo_url?'var(--accent)':'var(--border-subtle)'}`,cursor:'pointer'}}>
                <img src={url} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                <button onClick={e=>{e.stopPropagation();removePhoto(url)}} aria-label="Αφαίρεση" style={{position:'absolute',top:5,right:5,width:20,height:20,borderRadius:'50%',background:'rgba(0,0,0,0.55)',border:'none',color:'var(--on-media)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
                {url===form.photo_url&&<div style={{position:'absolute',inset:'auto 0 0 0',background:'var(--accent)',fontSize: 11,color:'var(--accent-text)',textAlign:'center',fontWeight:700,fontFamily:T.font.sans,padding:'2px',letterSpacing:'0.5px'}}>ΚΥΡΙΑ</div>}
              </div>
            ))}
            <button onClick={()=>{if(!scanning&&!photoBusy)scanRef.current?.click()}} disabled={scanning||photoBusy} title="Προσθήκη φωτογραφίας" style={{height:84,borderRadius:10,border:'1.5px dashed var(--border-accent)',background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',cursor:(scanning||photoBusy)?'wait':'pointer',color:'var(--accent)'}}>
              {(scanning||photoBusy)?<div style={{width:16,height:16,border:'2px solid var(--accent-border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'invSpin 0.7s linear infinite'}}/>
                :<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>}
            </button>
          </div>
          <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:7,fontFamily:T.font.sans}}>Κάθε νέα φωτογραφία διαβάζεται αυτόματα με AI. Κλικ σε φωτογραφία για να οριστεί ως κύρια.</p>
        </div>
      )}

      {/* Ταυτότητα αντικειμένου — μόνο όσα ορίζει το μητρώο, με το «γιατί» τους */}
      {revealed && (<>
        <Field d={f('inv.name')}>
          <TextInput ariaLabel={fl('inv.name')} value={form.name||''} onChange={v=>set('name',v)} placeholder="Παράδειγμα: Πλυντήριο Ρούχων Bosch WAU28"/>
        </Field>
        <Field d={f('inv.category')}>
          <CustomSelect value={form.category||'Λοιπά'} onChange={v=>set('category',v)} options={[...INVENTORY_CATEGORIES].map(c=>({value:c,label:c}))}/>
        </Field>
      </>)}
      <div style={{...formGrid(200, 270),gap:12}}>
        <Field d={f('inv.condition')}>
          <CustomSelect value={form.condition||'Καλή'} onChange={v=>set('condition',v)} options={CONDITIONS.map(c=>({value:c,label:c}))}/>
        </Field>
        <Field d={f('inv.room')}><RoomInput value={form.room||''} onChange={v=>set('room',v)}/></Field>
      </div>

      {/* Αγορά */}
      {revealed && (<>
        <SectionLabel label="Αγορά"/>
        <div style={{...formGrid(200, 270),gap:12}}>
          <Field d={f('inv.purchase_date')}><DatePicker value={form.purchase_date||''} onChange={v=>set('purchase_date',v)}/></Field>
          <Field d={f('inv.value')}><NumberInput ariaLabel={fl('inv.value')} value={blankIfZero(form.purchase_value)} onChange={v=>set('purchase_value',parseFloat(v)||0)} suffix="€" min={0}/></Field>
        </div>
      </>)}

      {/* Η ΑΠΟΔΕΙΞΗ ΕΙΝΑΙ CORE, ΟΧΙ «ΠΕΡΙΣΣΟΤΕΡΑ»: χωρίς παραστατικό η δαπάνη
          δεν εκπίπτει και το χαρτί δεν ξαναβρίσκεται έξι μήνες μετά. */}
      {f('inv.receipt') && (
        <Field d={f('inv.receipt')}>
          {form.receipt_doc_url
            ?<div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.inner}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                <span style={{flex:1,minWidth:0,fontSize:13,color:'var(--text-primary)',fontFamily:T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.receipt_doc_name||'Συνημμένο αρχείο'}</span>
                <button onClick={()=>openInventoryDoc(form.receipt_doc_url)} style={{fontSize:12,color:'var(--accent)',fontFamily:T.font.sans,fontWeight:500,background:'none',border:'none',cursor:'pointer',whiteSpace:'nowrap',padding:0}}>Άνοιγμα</button>
                <button onClick={async()=>{const old=form.receipt_doc_url;setForm(f2=>({...f2,receipt_doc_url:'',receipt_doc_name:''}));/* Διέγραψε αμέσως μόνο αν είναι αρχείο αυτής της συνεδρίας· το αρχικά αποθηκευμένο καθαρίζεται με το save. */ if(old&&old!==item?.receipt_doc_url&&!/^https?:\/\//.test(old))await supabase.storage.from(DOCS_BUCKET).remove([old])}} title="Αφαίρεση" style={{width:26,height:26,borderRadius:'50%',border:'1px solid var(--border-subtle)',background:'var(--bg-surface)',color:'var(--text-tertiary)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
              </div>
            :<label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,height:44,border:'1.5px dashed var(--border-default)',borderRadius:T.radius.inner,cursor:'pointer',color:'var(--text-secondary)',fontSize:13,fontFamily:T.font.sans}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                {docUp?'Ανέβασμα…':'Φωτογράφισε ή επισύναψε την απόδειξη'}
                <input type="file" accept=".pdf,image/*" style={{display:'none'}} onChange={e=>{const fl=e.target.files?.[0];if(fl)uploadReceiptDoc(fl)}}/>
              </label>}
        </Field>
      )}

      {form.purchase_date&&(form.purchase_value||0)>0&&(
        <div style={{padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',gap:8}}>
            {[
              {label:'Εκτιμώμενη υπολειπόμενη αξία',value:fe(calcCurrentValue({...form,id:'',user_id:''} as InventoryItem))},
              {label:'Ποσοστό που μένει',value:`${Math.max(0,100-calcDepreciationPct({...form,id:'',user_id:''} as InventoryItem))}%`},
              {label:'Εκτιμώμενα χρόνια ζωής',value:`περίπου ${calcYearsLeft({...form,id:'',user_id:''} as InventoryItem)} χρόνια`},
            ].map((k,i)=>(
              <div key={i} style={{textAlign:'center'}}>
                <p style={{fontSize:14,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{k.value}</p>
                <p style={{fontSize: 11,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
              </div>
            ))}
          </div>
          <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45,marginTop:8}}>{NOT_TAX_DEPRECIATION_NOTE}</p>
        </div>
      )}

      {/* ΤΟ ΧΕΡΙ, ΓΙΑ ΟΣΑ ΔΕΝ ΦΩΤΟΓΡΑΦΙΖΟΝΤΑΙ. Παλιό έπιπλο χωρίς ετικέτα,
          αντικείμενο που δεν έχει πια συσκευασία, χρήστης που βιάζεται. */}
      {!revealed && (
        <button onClick={()=>setManual(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:'11px 14px',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',background:'transparent',cursor:'pointer',fontFamily:T.font.sans,fontSize:13,fontWeight:500,color:'var(--text-secondary)'}}>
          Συμπλήρωση με το χέρι
        </button>
      )}

      {/* Περισσότερα — υπαρκτά αλλά σπάνια, κλειστά εξ αρχής */}
      {revealed && fields.more.length>0 && (
        <button onClick={()=>setShowMore(m=>!m)} style={{display:'flex',alignItems:'center',gap:8,width:'100%',textAlign:'left',padding:'11px 14px',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',cursor:'pointer',fontFamily:T.font.sans}}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--text-tertiary)',transform:showMore?'rotate(90deg)':'none',transition:'transform 0.15s'}}><path d="m9 18 6-6-6-6"/></svg>
          <span style={{flex:1,fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>Περισσότερα: εγγύηση, ταυτότητα συσκευής{isElectric?', ενέργεια':''} και κόστος αντικατάστασης</span>
        </button>
      )}
      {revealed&&showMore&&(<>
        {/* ═══ ΤΡΙΑ ΠΕΔΙΑ ΣΕ ΔΥΟ ΣΤΗΛΕΣ, ΚΑΙ ΤΟ ΕΝΑ ΚΟΒΟΤΑΝ ══════════════════════
            Η «Μάρκα και μοντέλο» είναι ΔΥΟ κουτιά μέσα σε ΕΝΑ κελί πλέγματος,
            με τον «Σειριακό» δίπλα στο δεύτερο κελί. Το κελί φτάνει τα 270
            εικονοστοιχεία, οπότε τα δύο κουτιά έμεναν με 130 το καθένα: το
            «WAU28PI0GR» δεν χωρούσε και φαινόταν κομμένο κάτω από τον σειριακό.
            Ο κωδικός μοντέλου είναι ακριβώς αυτό που πάει στον τεχνικό — ένα
            πεδίο που δεν δείχνει την τιμή του δεν έχει λόγο ύπαρξης.

            Η μάρκα και το μοντέλο παίρνουν δική τους σειρά σε όλο το πλάτος και
            ο σειριακός κατεβαίνει δίπλα στην εγγύηση: δύο κωδικοί που ζητούνται
            σε δύο διαφορετικές στιγμές (ανταλλακτικό, ασφαλιστική) δεν χρειάζεται
            να μοιράζονται σειρά. */}
        <Field d={f('inv.brand_model')}>
          <div style={{...formGrid(160, 300),gap:10}}>
            <TextInput ariaLabel="Μάρκα" value={form.brand||''} onChange={v=>set('brand',v)} placeholder="Bosch"/>
            <TextInput ariaLabel="Μοντέλο" value={form.model||''} onChange={v=>set('model',v)} placeholder="WAU28PI0GR"/>
          </div>
        </Field>
        <div style={{...formGrid(200, 270),gap:12}}>
          <Field d={f('inv.serial')}><TextInput ariaLabel={fl('inv.serial')} value={form.serial_number||''} onChange={v=>set('serial_number',v)} placeholder="SN / IMEI"/></Field>
          <Field d={f('inv.warranty')}><DatePicker value={form.warranty_expiry||''} onChange={v=>set('warranty_expiry',v)}/></Field>
        </div>
        <Field d={f('inv.replacement_cost')}>
          <NumberInput ariaLabel={fl('inv.replacement_cost')} value={blankIfZero(form.replacement_cost)} onChange={v=>set('replacement_cost',parseFloat(v)||0)} suffix="€" min={0}/>
        </Field>
        {isElectric&&(<>
          <SectionLabel label="Ενέργεια"/>
          {/* ═══ Ο ΚΩΔΙΚΟΣ ΤΗΣ ΕΤΙΚΕΤΑΣ ΠΡΩΤΟΣ, ΤΑ ΠΕΔΙΑ ΜΕΤΑ ═══════════════════
              Ό,τι ακολουθεί από κάτω το δηλώνει ήδη ο κατασκευαστής στο
              ευρωπαϊκό μητρώο. Το να ζητηθεί πρώτα το χέρι και μετά να
              προσφερθεί ο εύκολος δρόμος είναι η ίδια αντιστροφή που είχε και η
              φωτογραφία: ο χρήστης προλαβαίνει να πληκτρολογήσει. */}
          <div>
            <label style={labelStyle}>Ενεργειακή ετικέτα (μητρώο EPREL)</label>
            <div style={{...formGrid(200, 150),gap:10}}>
              {/* Μόλις αλλάξει ο κωδικός, η αναφορά στην πηγή σβήνει: θα έδειχνε
                  τη ΓΕΙΤΟΝΙΚΗ καταχώρηση για νούμερα που δεν ήρθαν από εκείνη. */}
              <TextInput ariaLabel="Σύνδεσμος ή κωδικός μητρώου EPREL" value={eprelInput}
                onChange={v=>{setEprelInput(v);setEprelSource('')}}
                placeholder="eprel.ec.europa.eu/screen/product/…"/>
              <Btn onClick={fillFromEprel} disabled={eprelBusy||!eprelInput.trim()}>
                {eprelBusy?'Ανάγνωση…':'Συμπλήρωση'}
              </Btn>
            </div>
            {/* Η ΠΗΓΗ ΜΕΝΕΙ ΟΡΑΤΗ. Νούμερα που μπήκαν μόνα τους χωρίς τρόπο να
                ελεγχθούν είναι χειρότερα από νούμερα που έγραψε ο χρήστης. */}
            <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45,marginTop:5}}>
              {eprelSource
                ? <>Συμπληρώθηκαν από τον κατασκευαστή. <a href={eprelSource} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)'}}>Η καταχώρηση στο μητρώο</a></>
                : 'Σάρωσε το QR της ενεργειακής ετικέτας και επικόλλησε τον σύνδεσμο. Μάρκα, μοντέλο, κλάση και κατανάλωση έρχονται όπως τα δηλώνει ο κατασκευαστής.'}
            </p>
          </div>
          <Field d={f('inv.energy_class')}>
            <CustomSelect value={form.energy_class||''} onChange={v=>set('energy_class',v)} options={[{value:'',label:'Δεν γνωρίζω'},...ENERGY_CLASSES.map(c=>({value:c,label:c}))]}/>
          </Field>
          {/* ═══ ΤΡΕΙΣ ΤΡΟΠΟΙ, ΓΙΑΤΙ Η ΕΤΙΚΕΤΑ ΔΗΛΩΝΕΙ ΔΙΑΦΟΡΕΤΙΚΟ ΜΕΓΕΘΟΣ ══════
              Η φόρμα ρωτούσε ΠΑΝΤΑ Watt και ώρες την ημέρα. Το πλυντήριο όμως
              δεν δουλεύει ώρες την ημέρα, δουλεύει κύκλους — και η ενεργειακή
              του ετικέτα δεν γράφει πουθενά Watt: γράφει kWh ανά 100 κύκλους.
              Το ψυγείο γράφει kWh τον χρόνο. Ζητούσαμε δηλαδή νούμερα που δεν
              υπάρχουν πάνω στη συσκευή και βγάζαμε κόστος δεκαεπτά φορές πάνω
              από το πραγματικό.

              Ο ΤΡΟΠΟΣ ΠΡΟΤΕΙΝΕΤΑΙ ΑΠΟ ΤΗΝ ΚΑΤΗΓΟΡΙΑ ΚΑΙ ΑΛΛΑΖΕΙ. Η κατηγορία
              «Ηλεκτρικές Συσκευές» χωράει και πλυντήριο και ψυγείο, οπότε η
              πρόταση θα πέφτει έξω τις μισές φορές· γι' αυτό αποθηκεύεται και
              δεν συνάγεται κάθε φορά από το είδος. */}
          <div>
            <label style={labelStyle}>Πώς μετριέται</label>
            <CustomSelect value={energyMode} onChange={v=>set('energy_mode',v as EnergyMode)}
              options={(['cycles','annual','hours'] as const).map(m=>({value:m,label:ENERGY_MODE_LABEL[m]}))}/>
          </div>
          {energyMode==='cycles'&&(
            <Field d={f('inv.power_use')}>
              <div style={{...formGrid(160, 220),gap:12}}>
                <NumberInput ariaLabel="Κιλοβατώρες ανά 100 κύκλους" value={blankIfZero(form.kwh_per_100_cycles)} onChange={v=>set('kwh_per_100_cycles',parseFloat(v)||0)} suffix="kWh/100" min={0}/>
                <NumberInput ariaLabel="Κύκλοι ανά μήνα" value={blankIfZero(form.cycles_per_month)} onChange={v=>set('cycles_per_month',parseFloat(v)||0)} suffix="φορές/μήνα" min={0}/>
              </div>
            </Field>
          )}
          {energyMode==='annual'&&(
            <Field d={f('inv.power_use')}>
              <NumberInput ariaLabel="Κιλοβατώρες ανά έτος" value={blankIfZero(form.annual_kwh)} onChange={v=>set('annual_kwh',parseFloat(v)||0)} suffix="kWh/έτος" min={0}/>
            </Field>
          )}
          {energyMode==='hours'&&(
            <Field d={f('inv.power_use')}>
              <div style={{...formGrid(160, 220),gap:12}}>
                <NumberInput ariaLabel="Ισχύς σε βατ" value={blankIfZero(form.power_watts)} onChange={v=>set('power_watts',parseFloat(v)||0)} suffix="W" min={0}/>
                <NumberInput ariaLabel="Ώρες χρήσης ανά ημέρα" value={blankIfZero(form.daily_hours_use)} onChange={v=>set('daily_hours_use',parseFloat(v)||0)} suffix="ώρες/ημέρα" min={0} max={24}/>
              </div>
            </Field>
          )}
          {/* ΤΟ ΚΟΣΤΟΣ ΕΜΦΑΝΙΖΕΤΑΙ ΜΟΝΟ ΜΕ ΔΗΛΩΜΕΝΗ ΤΙΜΗ ΡΕΥΜΑΤΟΣ. Πριν, εδώ
              πολλαπλασιαζόταν με σταθερά 0,22 €/kWh — νούμερο που κανείς δεν είχε
              δηλώσει και που άλλαζε το συμπέρασμα κάθε συσκευής. */}
          {liveKwh>0&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',gap:8,padding:'12px 14px',background:'var(--bg-elevated)',borderRadius:T.radius.inner,border:'1px solid var(--border-subtle)'}}>
              {[{label:'kWh/μήνα',value:liveKwh.toFixed(1)},{label:'kWh/έτος',value:(liveKwh*12).toFixed(0)},
                {label:'Κόστος/μήνα',value:kwhPrice>0?fe(liveKwh*kwhPrice):fe(0)},
                {label:'Κόστος/έτος',value:kwhPrice>0?fe(liveKwh*kwhPrice*12):fe(0)}].map((k,i)=>(
                <div key={i} style={{textAlign:'center'}}>
                  <p style={{fontSize:13,fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)',marginBottom:2}}>{k.value}</p>
                  <p style={{fontSize: 11,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:T.font.sans}}>{k.label}</p>
                </div>
              ))}
              <p style={{gridColumn:'1/-1',fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45}}>
                {kwhPrice>0
                  ? `Στην τιμή ${feRate(kwhPrice)} ανά κιλοβατώρα, όπως προκύπτει από τον λογαριασμό ρεύματός σου.`
                  : 'Για να δεις κόστος σε ευρώ, σάρωσε έναν λογαριασμό ρεύματος ή δήλωσε την τιμή €/kWh στην Επισκόπηση. Δεν βάζουμε δική μας τιμή.'}
              </p>
            </div>
          )}
        </>)}
        <Field d={f('inv.notes')}>
          <Textarea value={form.notes||''} onChange={v=>set('notes',v)} placeholder="Παρατηρήσεις, ιστορικό, χαρακτηριστικά…" rows={2}/>
        </Field>
      </>)}
    </Modal>
  )
}
