'use client'
import { T, TT, formGrid, fixedCols } from '@/components/Theme'
import { useState, useEffect } from 'react'
import { NumberInput, CustomSelect, Toggle, InfoChip } from './UIComponents'
import { assessApproval, verdictLabel, type EmploymentType, type CreditHistory } from '@/lib/loans/approval'
import { fp } from '@/lib/core/format'
import type { BorrowerType } from './TabLoanData'

// «Θα εγκριθώ;» — διαδραστική εκτίμηση πιθανότητας έγκρισης. Καθαρό, μονόχρωμο·
// το χρώμα (γαλάζιο θετικό / κόκκινο κινδύνου) μόνο στην ετυμηγορία, όχι παντού.
const labelStyle: React.CSSProperties = TT.label

const EMPLOYMENT_OPTIONS:{value:EmploymentType;label:string}[] = [
  {value:'employee_permanent',label:'Μισθωτός αορίστου χρόνου'},
  {value:'employee_temp',label:'Μισθωτός ορισμένου χρόνου'},
  {value:'freelancer',label:'Ελεύθερος επαγγελματίας'},
  {value:'company',label:'Εταιρεία ή νομικό πρόσωπο'},
  {value:'pensioner',label:'Συνταξιούχος'},
]
const CREDIT_OPTIONS:{value:CreditHistory;label:string}[] = [
  {value:'clean',label:'Χωρίς δυσμενή στοιχεία'},
  {value:'minor',label:'Παλαιότερες, τακτοποιημένες εγγραφές'},
  {value:'severe',label:'Ενεργές δυσμενείς εγγραφές'},
]

// Προεπιλογή τύπου απασχόλησης από τον τύπο δανειολήπτη του υπολογιστή.
function defaultEmployment(b?: BorrowerType): EmploymentType {
  if (b === 'professional') return 'freelancer'
  if (b === 'company') return 'company'
  if (b === 'senior') return 'pensioner'
  return 'employee_permanent'
}


export default function ApprovalPanel({
  amount, years, ratePct, propertyValue, incomeMonthly, borrowerType, firstTimeBuyerDefault, fmtEur,
}:{
  amount:number; years:number; ratePct:number; propertyValue:number;
  incomeMonthly?:number; borrowerType?:BorrowerType; firstTimeBuyerDefault?:boolean;
  fmtEur:(n:number)=>string;
}) {
  const [hm,setHm] = useState<number|null>(null)
  const [vh,setVh] = useState(false)
  const [age,setAge] = useState<string>('35')
  // ── ΤΟ ΕΙΣΟΔΗΜΑ ΕΧΑΝΕ ΤΑ ΛΕΠΤΑ ΤΟΥ, ΚΑΙ ΤΑ ΕΧΑΝΕ ΣΕ ΚΑΘΕ ΑΠΟΔΟΣΗ ──────────
  //
  // Δύο σφάλματα στην ίδια γραμμή. Το `Math.round` πετούσε τα λεπτά: εισόδημα
  // 1.850,50 € γινόταν 1.851 και ο δείκτης δόσης υπολογιζόταν πάνω σε νούμερο
  // που ο χρήστης δεν έδωσε ποτέ. Και ο συγχρονισμός ζούσε σε `useEffect`, άρα
  // η οθόνη αποδιδόταν ΔΥΟ φορές σε κάθε αλλαγή του Υπολογιστή: μία με το παλιό
  // εισόδημα και τον παλιό δείκτη, μία με τα νέα.
  //
  // Η προσαρμογή κατάστασης όταν αλλάζει ένα prop δεν είναι δουλειά του effect:
  // γίνεται στην ίδια απόδοση, κρατώντας την προηγούμενη τιμή του prop. Έτσι
  // τρέχει ΜΟΝΟ όταν το εισόδημα όντως άλλαξε, και όχι στη φόρτωση, και η
  // τοπική τιμή του χρήστη («τι-αν») επιβιώνει μέχρι να αλλάξει η πηγή.
  const incomeStr = (n?:number) => n && n>0 ? String(n) : '2000'
  const [income,setIncome] = useState<string>(() => incomeStr(incomeMonthly))
  const [lastIncome,setLastIncome] = useState(incomeMonthly)
  if (incomeMonthly !== lastIncome) {
    setLastIncome(incomeMonthly)
    if (incomeMonthly && incomeMonthly > 0) setIncome(incomeStr(incomeMonthly))
  }
  const [existing,setExisting] = useState<string>('0')
  const [employment,setEmployment] = useState<EmploymentType>(defaultEmployment(borrowerType))
  const [credit,setCredit] = useState<CreditHistory>('clean')
  const [guarantor,setGuarantor] = useState<boolean>(false)
  const [firstTimeBuyer,setFirstTimeBuyer] = useState<boolean>(firstTimeBuyerDefault ?? true)

  const res = assessApproval({
    incomeMonthly:Number(income)||0, existingMonthlyDebt:Number(existing)||0, amount, years, ratePct,
    propertyValue, age:Number(age)||0, firstTimeBuyer, employment, credit, hasGuarantor:guarantor,
  })

  // ΤΟ ΠΑΝΕΛ ΕΙΧΕ ΔΙΚΟ ΤΟΥ ΜΟΡΦΟΠΟΙΗΤΗ ΠΟΣΟΣΤΟΥ («37,6%», «75%»), δίπλα στον
  // δείκτη της ίδιας οθόνης που έγραφε «75,00%». Δύο συστήματα αρίθμησης σε μια
  // απόσταση ματιάς. Ένας μορφοποιητής, ο ίδιος με όλη την εφαρμογή.
  const metrics = [
    { l:'Δείκτης δόσης', v:fp(res.dstiPct), sub:`όριο ${fp(res.dstiLimitPct)}`, over:res.dstiPct>res.dstiLimitPct },
    { l:'Δάνειο προς αξία', v:fp(res.ltvPct), sub:`όριο ${fp(res.maxLtv)}`, over:res.ltvPct>res.maxLtv },
    { l:'Ηλικία στη λήξη', v:`${res.ageAtEnd}`, sub:'όριο 75', over:res.ageAtEnd>75 },
    { l:'Δόση', v:fmtEur(res.requestedMonthly), sub:'τον μήνα', over:false },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Είσοδοι */}
      {/* Το ελάχιστο πλάτος ήταν 190 και η μεγαλύτερη επιλογή («Μισθωτός αορίστου
          χρόνου») χρειάζεται περισσότερα: το πεδίο έγραφε «Μισθωτός αορίστ…». */}
      <div style={{...formGrid(215, 290),gap:10}}>
        <NumberInput label="Ηλικία" value={age} onChange={setAge} suffix="ετών"/>
        <NumberInput label="Καθαρό μηνιαίο εισόδημα" value={income} onChange={setIncome} suffix="€"/>
        <NumberInput label="Υφιστάμενες μηνιαίες δόσεις" value={existing} onChange={setExisting} suffix="€"/>
        <CustomSelect label="Τύπος απασχόλησης" value={employment} onChange={v=>setEmployment(v as EmploymentType)} options={EMPLOYMENT_OPTIONS}/>
        <CustomSelect label="Πιστοληπτικό ιστορικό" value={credit} onChange={v=>setCredit(v as CreditHistory)} options={CREDIT_OPTIONS}/>
      </div>
      <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
        {/* ΤΟ ΜΕΝΟΥ ΕΛΕΓΕ «ΠΡΩΤΗ ΚΑΤΟΙΚΙΑ» ΚΑΙ ΕΚΡΙΝΕ ΑΛΛΟ. Τα όρια της ΤτΕ
            (δόση 50%, δάνειο προς αξία 90%) τα δίνει ο ΠΡΩΤΟΑΓΟΡΑΣΤΗΣ. Οποιος
            αγοράζει την κύρια κατοικία του έχοντας ήδη ένα εξοχικό ή ένα παλιό
            εξοφλημένο στεγαστικό παίρνει 40% και 80% — και το πάνελ του έλεγε
            «περνάς». */}
        <Toggle on={firstTimeBuyer} onChange={setFirstTimeBuyer} label="Δανείζομαι για πρώτη φορά"/>
        <Toggle on={guarantor} onChange={setGuarantor} label="Υπάρχει εγγυητής ή συνοφειλέτης"/>
      </div>

      {/* Ετυμηγορία — ουδέτερο κουτί· λευκή/ομοιόμορφη, γαλάζια μόνο στο πέρασμα του
          κέρσορα (το κόκκινο για πραγματικό κίνδυνο παραμένει πάντα). */}
      {(()=>{ const blocked=res.verdict==='blocked'
        const verdictColor = blocked?'var(--negative)':(vh?'var(--accent)':'var(--text-primary)')
        const barColor = blocked?'var(--negative)':(vh?'var(--accent)':'var(--text-secondary)')
        return (
      <div onMouseEnter={()=>setVh(true)} onMouseLeave={()=>setVh(false)} onTouchStart={()=>setVh(true)} onTouchEnd={()=>setVh(false)}
        style={{background:'var(--bg-surface)',border:`1px solid ${vh?'var(--border-default)':'var(--border-subtle)'}`,borderRadius: T.radius.card,padding:'16px',transition:'border-color 0.15s'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:14,flexWrap:'wrap',marginBottom:12}}>
          <p style={{fontSize:16,fontWeight:700,fontFamily: T.font.sans,color:verdictColor,letterSpacing:'-0.01em',transition:'color 0.15s'}}>{verdictLabel(res.verdict)}</p>
          <p style={{fontSize:13,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',fontWeight:600}}>{res.score}<span style={{fontSize:11,color:'var(--text-tertiary)'}}> / 100</span></p>
        </div>
        <div role="progressbar" aria-valuenow={res.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Βαθμολογία έγκρισης ${res.score} στα 100`} style={{height:6,borderRadius:3,background:'color-mix(in srgb, var(--text-primary) 8%, transparent)',overflow:'hidden'}}>
          <div style={{height:'100%',width:`${res.score}%`,borderRadius:3,background:barColor,transition:'width 0.3s, background 0.15s'}}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:10,marginTop:14}}>
          {metrics.map((m,i)=>(
            <div key={m.l} onMouseEnter={()=>setHm(i)} onMouseLeave={()=>setHm(null)} onTouchStart={()=>setHm(i)} onTouchEnd={()=>setHm(null)}>
              <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.06em',fontWeight:700,fontFamily: T.font.sans,marginBottom:4}}>{m.l}</p>
              <p style={{fontSize:16,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',fontWeight:700,lineHeight:1,color:m.over?'var(--negative)':hm===i?'var(--accent)':'var(--text-primary)',transition:'color 0.15s'}}>{m.v}</p>
              <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:4,fontFamily: T.font.sans}}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
      )})()}

      {/* Ανάλυση κριτηρίων — μαζεμένες σειρές· η επεξήγηση κρύβεται πίσω από ⓘ */}
      <div>
        <p style={{...labelStyle,marginBottom:10}}>Ανάλυση κριτηρίων</p>
        {/* Πέντε κριτήρια, μία σειρά. Το `auto-fit` τα έβγαζε τρία και δύο. */}
        <div {...fixedCols(res.factors.length, 6, 'stretch')}>
          {res.factors.map((f,i)=>(
            <InfoChip key={i} label={f.label} detail={f.detail} tone={f.kind==='block'?'negative':'default'}
              icon={f.kind==='pass'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : f.kind==='warn'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}/>
          ))}
        </div>
      </div>

      {/* Προτάσεις */}
      {res.suggestions.length>0 && (
        <div>
          <p style={{...labelStyle,marginBottom:10}}>Πώς ενισχύεις την αίτηση</p>
          <div style={{padding:'12px 16px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,display:'flex',flexDirection:'column',gap:8}}>
            {res.suggestions.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:9}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:'var(--border-default)',flexShrink:0,marginTop:6}}/>
                <span style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily: T.font.sans}}>
        Ενδεικτική εκτίμηση βάσει των στοιχείων που δηλώνεις και των ορίων Τράπεζας Ελλάδος. Η τελική απόφαση ανήκει στην τράπεζα μετά από πλήρη αξιολόγηση.
      </p>
    </div>
  )
}
