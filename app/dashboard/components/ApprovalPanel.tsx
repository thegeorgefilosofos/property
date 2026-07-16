'use client'
import { useState } from 'react'
import { NumberInput, CustomSelect, Toggle, InfoDot } from './UIComponents'
import { assessApproval, verdictLabel, type EmploymentType, type CreditHistory, type ApprovalVerdict } from '@/lib/loans/approval'
import type { BorrowerType } from './TabLoanData'

// «Θα εγκριθώ;» — διαδραστική εκτίμηση πιθανότητας έγκρισης. Καθαρό, μονόχρωμο·
// το χρώμα (γαλάζιο θετικό / κόκκινο κινδύνου) μόνο στην ετυμηγορία, όχι παντού.
const labelStyle: React.CSSProperties = {
  fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.06em',fontWeight:600,fontFamily:"'Inter',sans-serif",
}

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

// Ουδέτερο κουτί· χρώμα (γαλάζιο θετικό / κόκκινο κινδύνου) ΜΟΝΟ στην ετυμηγορία
// και τη μπάρα — όχι σε ολόκληρο το πλαίσιο.
const V_STYLE: Record<ApprovalVerdict,{c:string}> = {
  high:    { c:'var(--accent)' },
  medium:  { c:'var(--text-primary)' },
  low:     { c:'var(--text-secondary)' },
  blocked: { c:'var(--negative)' },
}

export default function ApprovalPanel({
  amount, years, ratePct, propertyValue, incomeMonthly, borrowerType, firstHomeDefault, fmtEur,
}:{
  amount:number; years:number; ratePct:number; propertyValue:number;
  incomeMonthly?:number; borrowerType?:BorrowerType; firstHomeDefault?:boolean;
  fmtEur:(n:number)=>string;
}) {
  const [age,setAge] = useState<string>('35')
  const [income,setIncome] = useState<string>(incomeMonthly && incomeMonthly>0 ? String(Math.round(incomeMonthly)) : '2000')
  const [existing,setExisting] = useState<string>('0')
  const [employment,setEmployment] = useState<EmploymentType>(defaultEmployment(borrowerType))
  const [credit,setCredit] = useState<CreditHistory>('clean')
  const [guarantor,setGuarantor] = useState<boolean>(false)
  const [firstHome,setFirstHome] = useState<boolean>(firstHomeDefault ?? true)

  const res = assessApproval({
    incomeMonthly:Number(income)||0, existingMonthlyDebt:Number(existing)||0, amount, years, ratePct,
    propertyValue, age:Number(age)||0, firstHome, employment, credit, hasGuarantor:guarantor,
  })
  const vs = V_STYLE[res.verdict]

  const dec = (n:number)=>String(n).replace('.',',')
  const metrics = [
    { l:'Δείκτης δόσης', v:`${dec(res.dstiPct)}%`, sub:`όριο ${dec(res.dstiLimitPct)}%`, over:res.dstiPct>res.dstiLimitPct },
    { l:'Δάνειο προς αξία', v:`${dec(res.ltvPct)}%`, sub:`όριο ${res.maxLtv}%`, over:res.ltvPct>res.maxLtv },
    { l:'Ηλικία στη λήξη', v:`${res.ageAtEnd}`, sub:'όριο 75', over:res.ageAtEnd>75 },
    { l:'Δόση', v:fmtEur(res.requestedMonthly), sub:'τον μήνα', over:false },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Είσοδοι */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',gap:10}}>
        <NumberInput label="Ηλικία" value={age} onChange={setAge} suffix="ετών"/>
        <NumberInput label="Καθαρό μηνιαίο εισόδημα" value={income} onChange={setIncome} suffix="€"/>
        <NumberInput label="Υφιστάμενες μηνιαίες δόσεις" value={existing} onChange={setExisting} suffix="€"/>
        <CustomSelect label="Τύπος απασχόλησης" value={employment} onChange={v=>setEmployment(v as EmploymentType)} options={EMPLOYMENT_OPTIONS}/>
        <CustomSelect label="Πιστοληπτικό ιστορικό" value={credit} onChange={v=>setCredit(v as CreditHistory)} options={CREDIT_OPTIONS}/>
      </div>
      <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
        <Toggle on={firstHome} onChange={setFirstHome} label="Πρώτη κατοικία"/>
        <Toggle on={guarantor} onChange={setGuarantor} label="Υπάρχει εγγυητής ή συνοφειλέτης"/>
      </div>

      {/* Ετυμηγορία — ουδέτερο κουτί, χρώμα μόνο στην ετυμηγορία και τη μπάρα */}
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:14,padding:'16px 18px'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:14,flexWrap:'wrap',marginBottom:12}}>
          <p style={{fontSize:16,fontWeight:700,fontFamily:"'Inter',sans-serif",color:vs.c,letterSpacing:'-0.01em'}}>{verdictLabel(res.verdict)}</p>
          <p style={{fontSize:13,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',fontWeight:600}}>{res.score}<span style={{fontSize:11,color:'var(--text-tertiary)'}}> / 100</span></p>
        </div>
        <div role="progressbar" aria-valuenow={res.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Βαθμολογία έγκρισης ${res.score} στα 100`} style={{height:6,borderRadius:3,background:'color-mix(in srgb, var(--text-primary) 8%, transparent)',overflow:'hidden'}}>
          <div style={{height:'100%',width:`${res.score}%`,borderRadius:3,background:vs.c,transition:'width 0.3s'}}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:10,marginTop:14}}>
          {metrics.map(m=>(
            <div key={m.l}>
              <p style={{fontSize:9.5,color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.05em',fontWeight:600,fontFamily:"'Inter',sans-serif",marginBottom:4}}>{m.l}</p>
              <p style={{fontSize:15.5,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',fontWeight:700,lineHeight:1,color:m.over?'var(--negative)':'var(--text-primary)'}}>{m.v}</p>
              <p style={{fontSize:10.5,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ανάλυση κριτηρίων — μαζεμένες σειρές· η επεξήγηση κρύβεται πίσω από ⓘ */}
      <div>
        <p style={{...labelStyle,marginBottom:10}}>Ανάλυση κριτηρίων</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',gap:6}}>
          {res.factors.map((f,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
              <span style={{flexShrink:0,display:'inline-flex'}} aria-hidden="true">
                {f.kind==='pass'
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : f.kind==='warn'
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              </span>
              <span style={{flex:1,minWidth:0,fontSize:12.5,fontWeight:600,fontFamily:"'Inter',sans-serif",color:f.kind==='block'?'var(--negative)':'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.label}</span>
              <InfoDot text={f.detail}/>
            </div>
          ))}
        </div>
      </div>

      {/* Προτάσεις */}
      {res.suggestions.length>0 && (
        <div>
          <p style={{...labelStyle,marginBottom:10}}>Πώς ενισχύεις την αίτηση</p>
          <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,display:'flex',flexDirection:'column',gap:8}}>
            {res.suggestions.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:9}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:'var(--border-default)',flexShrink:0,marginTop:6}}/>
                <span style={{fontSize:12.5,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
        Ενδεικτική εκτίμηση βάσει των στοιχείων που δηλώνεις και των ορίων Τράπεζας Ελλάδος. Η τελική απόφαση ανήκει στην τράπεζα μετά από πλήρη αξιολόγηση.
      </p>
    </div>
  )
}
