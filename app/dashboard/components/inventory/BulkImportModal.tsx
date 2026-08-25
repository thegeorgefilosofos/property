'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΜΑΖΙΚΗ ΕΙΣΑΓΩΓΗ ΑΠΟΓΡΑΦΗΣ: ΑΡΧΕΙΟ, ΕΠΙΚΟΛΛΗΣΗ, Η ΕΤΟΙΜΟ ΠΡΟΤΥΠΟ
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback } from 'react'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { T, Modal, Btn, fe, ABSENT } from '@/components/Theme'
import { notifyError } from '@/components/Toast'
import { readSheetAsCsv, SheetError } from '@/lib/core/readSheet'
import { csvTable } from '@/lib/core/csv'
import { S, ROW } from '../sheetFormat';
import type { InventoryItem } from './model'
import { INVENTORY_CATEGORIES, CONDITIONS, CONDITION_COLOR } from './model'
import { Badge } from './Bits'
import * as inventory from '@/lib/data/inventory'
import { failed } from '@/lib/core/dbError'

const supabase = createSupabaseClient()

export function BulkImportModal({propertyId,userId,onImported,onClose}:{propertyId:string;userId:string;onImported:()=>void;onClose:()=>void}) {
  const [step,setStep] = useState<'upload'|'preview'>('upload')
  const [rows,setRows] = useState<Partial<InventoryItem>[]>([])
  const [errors,setErrors] = useState<string[]>([])
  const [importing,setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Δες DocumentScan: το ref διαβάζεται σε useCallback, όχι στην απόδοση.
  const openFilePicker = useCallback(() => fileRef.current?.click(), [])
  // ══ ΤΟ ΥΠΟΔΕΙΓΜΑ ΕΙΝΑΙ ΒΙΒΛΙΟ ΕΡΓΑΣΙΑΣ, ΟΧΙ CSV ══════════════════════════
  //
  // Ήταν CSV χωρισμένο με ΚΟΜΜΑ. Το Excel όμως χωρίζει στήλες με το
  // διαχωριστικό ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ και σε ελληνικά Windows αυτό είναι το
  // ερωτηματικό — γιατί το κόμμα είναι το δεκαδικό σημείο. Ο χρήστης άνοιγε το
  // υπόδειγμα και έβλεπε ΟΛΟΚΛΗΡΗ τη γραμμή μέσα στο κελί A1: δεκατέσσερις
  // στήλες στοιβαγμένες σε μία, χωρίς κανένα μήνυμα λάθους.
  //
  // Και ο γυρισμός ήταν χειρότερος: αν τελικά το συμπλήρωνε, το Excel το
  // αποθήκευε ΜΕ ΕΡΩΤΗΜΑΤΙΚΑ, ενώ η ανάγνωση έσπαγε στο κόμμα. Κάθε γραμμή
  // εισαγόταν ως ένα αντικείμενο με ολόκληρη τη γραμμή για όνομα — «επιτυχώς».
  //
  // Ένα .xlsx δεν έχει διαχωριστικό. Ανοίγει το ίδιο σε κάθε υπολογιστή.
  const TEMPLATE_HEAD = ['Ονομασία','Κατηγορία','Δωμάτιο','Μάρκα','Μοντέλο','Σειριακός','Κατάσταση','Αξία Αγοράς','Ημερομηνία Αγοράς','Λήξη Εγγύησης','Ενεργειακή Κλάση','Ισχύς (W)','Ώρες ανά Ημέρα','Κόστος Αντικατάστασης']
  const TEMPLATE_ROW = ['Πλυντήριο','Ηλεκτρικές Συσκευές','Κουζίνα','Bosch','WAU28','SN123','Καλή','650','2021-03-15','2026-03-15','A+','2100','1','700']
  // Η ΒΙΒΛΙΟΘΗΚΗ ΤΟΥ EXCEL ΦΟΡΤΩΝΕΤΑΙ ΜΕ ΤΟ ΠΑΤΗΜΑ. Το υπόδειγμα είναι δεκατέσσερις
  // στήλες και δύο γραμμές· η στατική εισαγωγή του γεννήτορα έφερνε 2,5 MB μέσα
  // στον πίνακα, για ένα κουμπί που πατιέται μία φορά στη ζωή ενός λογαριασμού.
  const downloadTemplate = async () => {
    const { XLSX, setCell, autoWidths, downloadWorkbook } = await import('../xlsxStyle')
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEAD, TEMPLATE_ROW])
    ws['!rows'] = []; ws['!rows'][0] = { hpt: ROW.head }
    for (let c = 0; c < TEMPLATE_HEAD.length; c++) setCell(ws, 0, c, { s: S.head })
    for (let c = 0; c < TEMPLATE_HEAD.length; c++) setCell(ws, 1, c, { s: S.txt })
    ws['!cols'] = autoWidths(ws, { headRow: 0 }).cols
    XLSX.utils.book_append_sheet(wb, ws, 'Απογραφή')
    downloadWorkbook(wb, 'υπόδειγμα απογραφής')
  }
  const parseCSV = (text:string) => {
    // Ο αναλυτής ζει στο lib/core/csv.ts: ξέρει και το «;» και τα εισαγωγικά.
    // Εδώ έκανε σκέτο `split(',')`, οπότε μια «Πολυθρόνα, δερμάτινη» έγραφε την
    // κατηγορία μέσα στο όνομα και μετακινούσε κάθε επόμενη στήλη κατά μία.
    const table=csvTable(text)
    if(table.length<2){setErrors(['Το αρχείο δεν έχει δεδομένα.']);return}
    const parsed:Partial<InventoryItem>[]=[]; const errs:string[]=[]
    for(let i=1;i<table.length;i++){
      const cols=table[i]
      if(!cols[0])continue
      const cat=cols[1]||'Λοιπά'; const cond=cols[6]||'Καλή'
      if(![...INVENTORY_CATEGORIES].includes(cat))errs.push(`Γραμμή ${i+1}: Άγνωστη κατηγορία "${cat}"`)
      parsed.push({name:cols[0],category:cat,room:cols[2]||'',brand:cols[3]||'',model:cols[4]||'',serial_number:cols[5]||'',condition:CONDITIONS.includes(cond)?cond:'Καλή',purchase_value:parseFloat(cols[7])||0,purchase_date:cols[8]||'',warranty_expiry:cols[9]||'',energy_class:cols[10]||'',power_watts:parseFloat(cols[11])||0,daily_hours_use:parseFloat(cols[12])||0,replacement_cost:parseFloat(cols[13])||0})
    }
    setRows(parsed);setErrors(errs);if(parsed.length>0)setStep('preview')
  }
  // ΤΟ ΑΡΧΕΙΟ ΠΟΥ ΓΥΡΙΖΕΙ ΕΙΝΑΙ ΣΥΝΗΘΩΣ ΑΥΤΟ ΠΟΥ ΕΦΥΓΕ. Αφού το υπόδειγμα είναι
  // βιβλίο εργασίας, ο χρήστης το συμπληρώνει και το ανεβάζει όπως είναι· το
  // «αποθήκευση ως CSV» ήταν βήμα που δεν έπρεπε να ζητηθεί ποτέ. Το CSV
  // εξακολουθεί να γίνεται δεκτό, για όποιον το εξάγει από αλλού.
  const handleFile=async(file:File)=>{
    const isSheet=/\.(xlsx|xlsm|xls)$/i.test(file.name)
    if(isSheet){
      try{ parseCSV(await readSheetAsCsv(file)) }
      catch(e){ setErrors([e instanceof SheetError?e.message:'Το αρχείο δεν διαβάστηκε.']) }
      return
    }
    const r=new FileReader();r.onload=e=>parseCSV(e.target?.result as string);r.readAsText(file,'UTF-8')
  }
  const handleImport=async()=>{
    setImporting(true)
    const {error}=await inventory.add(supabase,propertyId,userId,rows.map(r=>({...r,photos:[]})))
    if(error){notifyError(failed('Η μαζική εισαγωγή δεν ολοκληρώθηκε',error));setImporting(false);return}
    onImported();onClose()
  }
  // Τίτλος + περιεχόμενο δύο βημάτων + ενέργειες, κεντραρισμένο: κανονικό Modal.
  // Οι δύο ενέργειες του βήματος «preview» φεύγουν στο υποσέλιδο, όπου μένουν
  // ορατές ενώ ο πίνακας των 15 πρώτων γραμμών κυλά από πάνω τους.
  //
  // ΤΟ ΠΑΡΑΘΥΡΟ ΔΕΝ ΦΕΥΓΕΙ ΟΣΟ ΓΡΑΦΕΙ. Το Modal προσθέτει δύο εξόδους που το
  // χειρόγραφο δεν είχε — Escape και κλικ στο φόντο — και η εισαγωγή είναι ΕΝΑ
  // insert για ΟΛΕΣ τις γραμμές του αρχείου. Χωρίς τη φρουρά, ένα κατά λάθος
  // Escape στη μέση αφήνει τον χρήστη χωρίς να μάθει αν πέρασαν ή όχι.
  const closeGuarded = () => { if(!importing) onClose() }
  return (
    <Modal open onClose={closeGuarded} width={600} ariaLabel="Μαζική εισαγωγή CSV"
      title={<>Μαζική εισαγωγή <span title="CSV: αρχείο τιμών χωρισμένων με κόμμα· ανοίγει σε Excel/λογιστικά φύλλα">CSV</span></>}
      footer={step==='preview'?(<>
        <Btn onClick={()=>setStep('upload')}>Πίσω</Btn>
        <Btn variant="primary" onClick={handleImport} disabled={importing}>{importing?'Εισαγωγή…':`Εισαγωγή ${rows.length} αντικειμένων`}</Btn>
      </>):undefined}>
      {step==='upload'&&(
        <>
          <button onClick={downloadTemplate} style={{padding:'10px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:13,fontWeight:500,fontFamily:T.font.sans,cursor:'pointer'}}>Κατέβασμα προτύπου</button>
          {/* Ρητά, όχι με spread: δες DocumentScan — το spread κρύβει τις ιδιότητες
              από τον μεταγλωττιστή και ξυπνά τα σφάλματα των διπλανών χειριστών. */}
          <div role="button" tabIndex={0} onClick={openFilePicker} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFilePicker()}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}} style={{border:'2px dashed var(--border-accent)',borderRadius:T.radius.card,padding:'40px 20px',textAlign:'center',cursor:'pointer',background:'var(--accent-dim)'}}>
            <p style={{fontSize:14,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:8}}>Σύρτε ή κλικ για ανέβασμα αρχείου</p>
            <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Excel ή CSV</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
          {errors.length>0&&<div style={{padding:'10px 14px',background:'var(--negative-dim)',borderRadius:8,border:'1px solid var(--negative-border)'}}>{errors.map((e,i)=><p key={i} style={{fontSize:11,color:'var(--negative)',fontFamily:T.font.sans}}>{e}</p>)}</div>}
        </>
      )}
      {step==='preview'&&(
        <>
          <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Βρέθηκαν <strong style={{color:'var(--text-primary)'}}>{rows.length} αντικείμενα</strong></p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:'var(--bg-elevated)'}}>{['Ονομασία','Κατηγορία','Κατάσταση','Αξία'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--text-secondary)',fontWeight:500,fontSize: 11,fontFamily:T.font.sans,textTransform:'uppercase',letterSpacing:'0.5px'}}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(0,15).map((r,i)=><tr key={i} style={{borderBottom:'1px solid var(--border-subtle)'}}><td style={{padding:'7px 10px',color:'var(--text-primary)',fontWeight:500,fontFamily:T.font.sans}}>{r.name}</td><td style={{padding:'7px 10px',color:'var(--text-secondary)',fontFamily:T.font.sans}}>{r.category}</td><td style={{padding:'7px 10px'}}><Badge label={r.condition||ABSENT} color={CONDITION_COLOR[r.condition||'']||'var(--text-tertiary)'}/></td><td style={{padding:'7px 10px',fontFamily:T.font.mono,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)'}}>{r.purchase_value?fe(r.purchase_value):fe(0)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
