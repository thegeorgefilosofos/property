'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea } from './UIComponents'
import {
  BANKS, LOAN_TYPES, BORROWER_PROFILES, TAX_DATA,
  calcMonthly, calcAmortization, calcFmaExemption, calcRentalTax,
  fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, LoanScenario, MarketRates, SavedLoan
} from './TabLoanData'

// ── MD3 tokens ────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif",
  display:'block',marginBottom:6,
}
const cardStyle: React.CSSProperties = {
  background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16,
}
const pillBtn = (active:boolean, accentColor='var(--accent)'): React.CSSProperties => ({
  padding:'0 14px',height:36,borderRadius:18,border:`1px solid ${active?accentColor:'var(--border-subtle)'}`,
  background:active?`${accentColor}14`:'none',color:active?accentColor:'var(--text-secondary)',
  cursor:'pointer',fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:active?500:400,
  transition:'all 0.15s',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap' as const,
})

const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/>
      <p style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{label}</p>
    </div>
    {right}
  </div>
)

function KPI({label,value,color,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'12px 14px'}}>
      <p style={{...labelStyle,marginBottom:6}}>{label}</p>
      <p style={{fontSize:16,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:color||'var(--text-primary)',fontWeight:700}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>{sub}</p>}
    </div>
  )
}

function Section({title,sub,children,defaultOpen=false,badge}:{title:string;sub?:string;children:React.ReactNode;defaultOpen?:boolean;badge?:string}) {
  const [open,setOpen] = useState(defaultOpen)
  return (
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:open?'var(--accent)':'var(--border-default)',display:'inline-block',transition:'background 0.2s'}}/>
            <p style={{fontSize:13,color:open?'var(--accent)':'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:400}}>{title}</p>
            {badge&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:8,background:'var(--positive-dim)',color:'var(--positive)',border:'1px solid var(--positive-border)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{badge}</span>}
          </div>
          {sub&&<p style={{fontSize:12,color:'var(--text-secondary)',marginTop:3,marginLeft:13,lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{sub}</p>}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polyline points={open?"18 15 12 9 6 15":"6 9 12 15 18 9"}/></svg>
      </button>
      {open&&<div style={{padding:'0 16px 16px'}}>{children}</div>}
    </div>
  )
}

function ChartTip({active,payload,label}:any) {
  if(!active||!payload?.length)return null
  return (
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:12,padding:'10px 14px',fontSize:11,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',boxShadow:'var(--shadow-lg)'}}>
      <p style={{color:'var(--text-secondary)',marginBottom:6,fontSize:10,fontFamily:"'Inter',sans-serif"}}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
          <span style={{width:8,height:8,borderRadius:2,background:p.color,display:'inline-block'}}/>
          <p style={{color:'var(--text-primary)'}}>{p.name}: <strong style={{color:p.color}}>{p.value>100?fmtEur(p.value):`${p.value}%`}</strong></p>
        </div>
      ))}
    </div>
  )
}

const PROPERTY_TYPES = [
  {value:'residence',    label:'Κατοικία',              desc:'Διαμέρισμα, μονοκατοικία, μεζονέτα', notary_pct:0.013, stamp:0, vat_possible:false},
  {value:'new_residence',label:'Νεόδμητη Κατοικία',     desc:'Άδεια μετά το 2006, ΦΠΑ 24%',      notary_pct:0.015, stamp:0, vat_possible:true},
  {value:'store',        label:'Κατάστημα / Γραφείο',   desc:'Επαγγελματική χρήση',                notary_pct:0.015, stamp:0.036, vat_possible:false},
  {value:'warehouse',    label:'Αποθήκη / Βιομηχανικό', desc:'Βιομηχανική / αποθήκευση',          notary_pct:0.015, stamp:0.036, vat_possible:false},
  {value:'land',         label:'Οικόπεδο / Γη',         desc:'Εντός ή εκτός σχεδίου',             notary_pct:0.012, stamp:0, vat_possible:false},
  {value:'parking',      label:'Θέση Στάθμευσης',       desc:'Αυτοτελής ή παράρτημα',             notary_pct:0.010, stamp:0, vat_possible:false},
]

function calcNotaryFees(propValue:number, propType:string):{notary:number;landReg:number;agent:number;legal:number;other:number;total:number;breakdown:string[]} {
  let notaryFee=0
  const bands=[{up:120000,rate:0.008},{up:380000,rate:0.007},{up:2000000,rate:0.0065},{up:Infinity,rate:0.006}]
  let remaining=propValue,prev=0
  for(const band of bands){
    const chunk=Math.min(remaining,band.up-prev);if(chunk<=0)break
    notaryFee+=chunk*band.rate;remaining-=chunk;prev=band.up
  }
  notaryFee=Math.max(notaryFee,200)
  const mortgageDeed=notaryFee*0.4
  const landReg=propValue*0.00475
  const legal=Math.min(Math.max(propValue*0.003,300),1500)
  const mortgageTax=propValue*0.001
  const total=notaryFee+mortgageDeed+landReg+legal+mortgageTax
  const isCommercial=propType==='store'||propType==='warehouse'
  const breakdown=[
    `Συμβολαιογραφικά αγοράς: ${fmtEur(notaryFee)}`,
    `Συμβολαιογραφικά υποθήκης: ${fmtEur(mortgageDeed)}`,
    `Κτηματολόγιο (0.475‰): ${fmtEur(landReg)}`,
    `Δικηγόρος ελέγχου τίτλων: ${fmtEur(legal)}`,
    isCommercial?`Τέλη χαρτοσήμου μίσθωσης (3.6%): ${fmtEur(propValue*0.036)}`:`Φόρος ενεγγύησης υποθήκης: ${fmtEur(mortgageTax)}`,
  ]
  return{notary:notaryFee+mortgageDeed,landReg,agent:0,legal,other:mortgageTax,total,breakdown}
}

const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k,v])=>({value:k,label:v.label,description:`${v.typical_rate} · LTV έως ${v.typical_ltv}%`}))
const BORROWER_OPTIONS  = Object.entries(BORROWER_PROFILES).map(([k,v])=>({value:k,label:v.label,description:v.notes}))
const BANK_OPTIONS      = [...BANKS.map(b=>({value:b.id,label:b.name,description:`${b.note} · ${b.fees}`,dot:b.color})),{value:'custom',label:'Άλλη τράπεζα',description:'Καταχωρήστε το όνομά της'}]
const RATE_TYPE_OPTIONS = [{value:'fixed',label:'Σταθερό',description:'Σταθερό για την επιλεγμένη περίοδο'},{value:'variable',label:'Κυμαινόμενο',description:'Euribor + spread'},{value:'mixed',label:'Μικτό',description:'Σταθερό αρχικά, μετά κυμαινόμενο'}]
const FIXED_PERIOD_OPTIONS = ['3','5','10','15','20'].map(v=>({value:v,label:`${v} χρόνια`,description:v==='5'?'Πιο συνηθισμένο':v==='10'?'Καλή ισορροπία':''}))
const MARITAL_OPTIONS   = [{value:'single',label:'Άγαμος / Άγαμη',description:'Όριο ΦΜΑ: 200.000€'},{value:'married',label:'Έγγαμος / Έγγαμη',description:'Όριο ΦΜΑ: 250.000€'}]
const CHILDREN_OPTIONS  = [0,1,2,3,4,5].map(n=>({value:String(n),label:n===0?'Χωρίς τέκνα':`${n} εξαρτώμεν${n===1?'ο':'α'} τέκν${n===1?'ο':'α'}`,description:n===0?'—':n===1?'+25.000€':n===2?'+50.000€':`+${50+(n-2)*30}.000€`}))
const PROP_TYPE_OPTIONS = PROPERTY_TYPES.map(p=>({value:p.value,label:p.label,description:p.desc}))

const PRESETS = [
  {id:'first_buyer',label:'Νέος Αγοραστής',desc:'Πρώτη κατοικία, Σπίτι μου ΙΙ',color:'var(--positive-dim)',border:'var(--positive-border)',textColor:'var(--positive)',values:{loanAmount:'150000',propValue:'185000',sqm:'80',rate:'1.80',years:'25',rateType:'fixed' as RateType,loanType:'first_home' as LoanType,borrower:'young' as BorrowerType,fixedPeriod:'5',propType:'residence',area:'center_athens'}},
  {id:'investor',label:'Επενδυτής',desc:'Ακίνητο προς ενοικίαση',color:'var(--info-dim)',border:'var(--info-border)',textColor:'var(--info)',values:{loanAmount:'200000',propValue:'280000',sqm:'90',rate:'3.20',years:'20',rateType:'fixed' as RateType,loanType:'investment' as LoanType,borrower:'individual' as BorrowerType,fixedPeriod:'5',propType:'residence',area:'south_suburbs'}},
  {id:'commercial',label:'Επαγγελματικό',desc:'Κατάστημα / Γραφείο',color:'var(--warning-dim)',border:'var(--warning-border)',textColor:'var(--warning)',values:{loanAmount:'150000',propValue:'220000',sqm:'50',rate:'3.80',years:'15',rateType:'fixed' as RateType,loanType:'commercial' as LoanType,borrower:'professional' as BorrowerType,fixedPeriod:'5',propType:'store',area:'center_athens'}},
  {id:'renovation',label:'Ανακαίνιση',desc:'Ενεργειακή αναβάθμιση',color:'var(--accent-dim)',border:'var(--border-accent)',textColor:'var(--accent)',values:{loanAmount:'25000',propValue:'200000',sqm:'85',rate:'2.90',years:'15',rateType:'fixed' as RateType,loanType:'energy' as LoanType,borrower:'individual' as BorrowerType,fixedPeriod:'5',propType:'residence',area:'center_athens'}},
]

const AREA_OPTIONS = [
  {value:'attica_center_prime',label:'Αθήνα Κέντρο Α',description:'Κολωνάκι, Σύνταγμα, Πλάκα'},
  {value:'attica_center_std',label:'Αθήνα Κέντρο Β',description:'Κυψέλη, Ζωγράφου, Παγκράτι'},
  {value:'attica_south_prime',label:'Αττική Νότια Α',description:'Γλυφάδα, Βούλα, Βουλιαγμένη'},
  {value:'attica_south_std',label:'Αττική Νότια Β',description:'Άλιμος, Ελληνικό, Αργυρούπολη'},
  {value:'attica_north_prime',label:'Αττική Βόρεια Α',description:'Κηφισιά, Εκάλη, Διόνυσος'},
  {value:'attica_north_std',label:'Αττική Βόρεια Β',description:'Μαρούσι, Χαλάνδρι, Αγ. Παρασκευή'},
  {value:'attica_east',label:'Αττική Ανατολική',description:'Παλλήνη, Κορωπί, Σπάτα'},
  {value:'attica_west',label:'Αττική Δυτική',description:'Περιστέρι, Αιγάλεω, Ίλιον'},
  {value:'attica_piraeus_prime',label:'Πειραιάς Α',description:'Καστέλα, Φρεαττύδα'},
  {value:'attica_piraeus_std',label:'Πειραιάς Β',description:'Κερατσίνι, Νίκαια'},
  {value:'thess_center',label:'Θεσσαλονίκη Κέντρο',description:'Κέντρο, ΑΠΘ, Λαδάδικα'},
  {value:'thess_east',label:'Θεσσαλονίκη Ανατολικά',description:'Καλαμαριά, Τριανδρία'},
  {value:'thess_suburbs_n',label:'Θεσσαλονίκη Βόρεια',description:'Πυλαία, Θέρμη'},
  {value:'crete_heraklion',label:'Ηράκλειο Κρήτης',description:'Ηράκλειο, Γάζι'},
  {value:'crete_chania',label:'Χανιά',description:'Χανιά, Ακρωτήρι'},
  {value:'mykonos',label:'Μύκονος',description:'Μύκονος, Άνω Μέρα'},
  {value:'santorini',label:'Σαντορίνη',description:'Φηρά, Οία'},
  {value:'rhodes',label:'Ρόδος',description:'Ρόδος πόλη, Λίνδος'},
  {value:'corfu',label:'Κέρκυρα',description:'Κέρκυρα πόλη'},
  {value:'patras',label:'Αχαΐα',description:'Πάτρα, Ρίο'},
  {value:'larissa',label:'Λάρισα',description:'Λάρισα, Τύρναβος'},
  {value:'volos',label:'Μαγνησία',description:'Βόλος, Πήλιο'},
  {value:'ioannina',label:'Ιωάννινα',description:'Ιωάννινα, Ζαγόρι'},
  {value:'other',label:'Άλλη περιοχή',description:''},
]

interface CalcHistory {id:string;ts:string;loanType:LoanType;amount:number;rate:number;years:number;monthly:number}

interface Props {
  propertyId:string;userId:string;market:MarketRates
  onSaveLoan:(loan:Partial<SavedLoan>)=>Promise<void>
  onSaveToCalendar:(monthly:number,years:number,startDate:string,bankName:string)=>Promise<void>
  onSaveToExpenses:(monthly:number,bankName:string)=>Promise<void>
  onStateChange?:(s:any)=>void
}

export default function TabLoanCalculator({propertyId,userId,market,onSaveLoan,onSaveToCalendar,onSaveToExpenses,onStateChange}:Props) {
  const [loanAmount,  setLoanAmount]  = useState('150000')
  const [propValue,   setPropValue]   = useState('185000')
  const [sqm,         setSqm]         = useState('80')
  const [propType,    setPropType]    = useState('residence')
  const [area,        setArea]        = useState('attica_center_std')
  const [rate,        setRate]        = useState('3.50')
  const [years,       setYears]       = useState('25')
  const [rateType,    setRateType]    = useState<RateType>('fixed')
  const [loanType,    setLoanType]    = useState<LoanType>('purchase')
  const [borrower,    setBorrower]    = useState<BorrowerType>('individual')
  const [startDate,   setStartDate]   = useState(new Date().toISOString().split('T')[0])
  const [fixedPeriod, setFixedPeriod] = useState('5')
  const [bankId,      setBankId]      = useState('')
  const [customBank,  setCustomBank]  = useState('')
  const [notes,       setNotes]       = useState('')
  const [extraPay,    setExtraPay]    = useState('0')
  const [income,      setIncome]      = useState('2000')
  const [marital,     setMarital]     = useState<'single'|'married'>('single')
  const [children,    setChildren]    = useState('0')
  const [hasAgent,    setHasAgent]    = useState(false)
  const [agentPct,    setAgentPct]    = useState('2')
  const [scenarios,   setScenarios]   = useState<LoanScenario[]>([])
  const [editingId,   setEditingId]   = useState<string|null>(null)
  const [remBal,      setRemBal]      = useState('100000')
  const [remYears,    setRemYears]    = useState('20')
  const [curRate,     setCurRate]     = useState('4.0')
  const [newRate,     setNewRate]     = useState('3.0')
  const [xferCost,    setXferCost]    = useState('2000')
  const [saving,      setSaving]      = useState(false)
  const [activePreset,setActivePreset]= useState<string|null>(null)
  const [history,     setHistory]     = useState<CalcHistory[]>([])
  const [advisorSync, setAdvisorSync] = useState(false)
  const historyTimer = useRef<any>(null)

  const LA   = parseFloat(loanAmount)||0
  const PV   = parseFloat(propValue)||0
  const SQM  = parseFloat(sqm)||0
  const R    = parseFloat(rate)||0
  const Y    = parseInt(years)||0
  const EP   = parseFloat(extraPay)||0
  const INC  = parseFloat(income)||2000
  const CH   = parseInt(children)||0
  const RB   = parseFloat(remBal)||0
  const RY   = parseFloat(remYears)||0
  const CR   = parseFloat(curRate)||0
  const NR   = parseFloat(newRate)||0
  const XC   = parseFloat(xferCost)||0
  const AGNT = hasAgent?(PV*parseFloat(agentPct||'2')/100):0

  const effRate   = rateType==='variable'?market.euribor_3m+R:R
  const monthly   = calcMonthly(LA,effRate,Y)
  const total     = monthly*Y*12
  const totalInt  = total-LA
  const ltv       = PV>0?(LA/PV)*100:0
  const sqmPrice  = PV>0&&SQM>0?PV/SQM:0
  const amort     = useMemo(()=>calcAmortization(LA,effRate,Y),[LA,effRate,Y])

  const notaryCosts = useMemo(()=>calcNotaryFees(PV,propType),[PV,propType])
  const selectedPropType = PROPERTY_TYPES.find(p=>p.value===propType)||PROPERTY_TYPES[0]
  const fmaEx    = calcFmaExemption(marital,CH)
  const isNewBuilding = propType==='new_residence'
  const isCommercial  = propType==='store'||propType==='warehouse'
  const fmaOwed  = useMemo(()=>{
    if(isNewBuilding)return 0
    if(isCommercial)return PV*0.03
    if(loanType==='first_home'&&PV<=fmaEx)return 0
    return PV*0.03
  },[isNewBuilding,isCommercial,loanType,PV,fmaEx])
  const vatOwed  = isNewBuilding?PV*0.24:0
  const totalCosts = useMemo(()=>{
    const tax=isNewBuilding?vatOwed:fmaOwed
    return{tax,notary:notaryCosts.notary,landReg:notaryCosts.landReg,legal:notaryCosts.legal,agent:AGNT,other:notaryCosts.other,total:tax+notaryCosts.total+AGNT,downpayment:PV-LA,totalCash:(PV-LA)+tax+notaryCosts.total+AGNT}
  },[isNewBuilding,vatOwed,fmaOwed,notaryCosts,AGNT,PV,LA])

  const renInc   = loanType==='investment'?monthly*12*0.8:0
  const renTax   = calcRentalTax(renInc*(1-TAX_DATA.rental_expense_deduction))
  // «Σπίτι μου ΙΙ»: το 50% του δανείου είναι άτοκο (0%), το υπόλοιπο 50% με το
  // επιτόκιο της τράπεζάς σου. Μοντελοποιούμε τα δύο σκέλη αντί για αυθαίρετο
  // ευριστικό. Το εμφανιζόμενο «επιτόκιο» είναι το μεικτό (~μισό του κανονικού).
  const spitiM   = calcMonthly(LA*0.5,0,Y) + calcMonthly(LA*0.5,effRate,Y)
  const spitiR   = effRate/2
  const spitiSv  = (monthly-spitiM)*Y*12

  // Στην αναχρηματοδότηση το «τρέχον» επιτόκιο είναι του υπάρχοντος δανείου
  // (curRate), όχι το νέο μοντελοποιημένο επιτόκιο.
  const currM    = calcMonthly(RB,CR,RY)
  const newM     = calcMonthly(RB,NR,RY)
  const mSav     = currM-newM
  const refSav   = mSav*RY*12-XC
  const brkEven  = mSav>0?Math.ceil(XC/mSav):null

  const maxLoan  = useMemo(()=>{
    const maxM=INC*BORROWER_PROFILES[borrower].income_ratio
    const r=effRate/100/12,n=Y*12
    return r>0?maxM*(Math.pow(1+r,n)-1)/(r*Math.pow(1+r,n)):maxM*n
  },[INC,borrower,effRate,Y])

  const stress   = [{label:'Τρέχον',rate:effRate},{label:'+0.5%',rate:effRate+0.5},{label:'+1%',rate:effRate+1},{label:'+2%',rate:effRate+2},{label:'+3%',rate:effRate+3},{label:'6%',rate:6}].map(s=>({...s,monthly:calcMonthly(LA,s.rate,Y)}))
  const amortChart = useMemo(()=>{const out=[];for(let y=1;y<=Math.min(Y,30);y++){const rows=amort.slice((y-1)*12,y*12);out.push({year:`${y}`,Κεφάλαιο:Math.round(rows.reduce((s,r)=>s+r.principal,0)),Τόκοι:Math.round(rows.reduce((s,r)=>s+r.interest,0))})}return out},[amort,Y])
  const varMonthly  = calcMonthly(LA,market.euribor_3m+R,Y)
  const fvChartData = useMemo(()=>{const pts=[3,5,7,10,15,20,25,30].filter(y=>y<=Y);return pts.map(yr=>({year:`${yr}χρ`,Σταθερό:Math.round(monthly*yr*12-LA*(yr/Y)),Κυμαινόμενο:Math.round(varMonthly*yr*12-LA*(yr/Y))}))},[monthly,varMonthly,LA,Y])
  const scenChart = useMemo(()=>scenarios.map(s=>({name:s.label,Τόκοι:Math.round(calcMonthly(s.amount,s.rate,s.years)*s.years*12-s.amount)})),[scenarios])

  const extraSav = useMemo(()=>{
    if(EP<=0)return null
    let bal=LA,months=0,ti=0,m=monthly+EP
    while(bal>0&&months<Y*12){const int=bal*(effRate/100/12);ti+=int;bal=bal*(1+effRate/100/12)-m;months++}
    return{savedMonths:Y*12-months,savedInt:Math.max(0,totalInt-ti)}
  },[LA,effRate,Y,EP,monthly,totalInt])

  useMemo(()=>{
    onStateChange?.({loanType,borrowerType:borrower,loanAmount:LA,years:Y,rateType,effectiveRate:effRate,monthly,totalInterest:totalInt,propertyValue:PV,sqm:SQM,propType,area})
    setAdvisorSync(true);setTimeout(()=>setAdvisorSync(false),1200)
    if(LA>0&&Y>0&&effRate>0){
      if(historyTimer.current)clearTimeout(historyTimer.current)
      historyTimer.current=setTimeout(()=>{setHistory(h=>[{id:Date.now().toString(),ts:new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}),loanType,amount:LA,rate:effRate,years:Y,monthly},...h].slice(0,5))},800)
    }
  },[loanType,borrower,LA,Y,rateType,effRate,monthly,totalInt,PV])

  const bankName = bankId==='custom'?customBank:BANKS.find(b=>b.id===bankId)?.name||''
  const areaLabel = AREA_OPTIONS.find(a=>a.value===area)?.label||''
  const propTypeLabel = PROPERTY_TYPES.find(p=>p.value===propType)?.label||''

  function applyPreset(p:typeof PRESETS[0]){setLoanAmount(p.values.loanAmount);setPropValue(p.values.propValue);setSqm(p.values.sqm);setRate(p.values.rate);setYears(p.values.years);setRateType(p.values.rateType);setLoanType(p.values.loanType);setBorrower(p.values.borrower);setFixedPeriod(p.values.fixedPeriod);setPropType(p.values.propType);setArea(p.values.area);setActivePreset(p.id)}
  function addScen(){setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:LA,rate:effRate,years:Y,rateType}])}
  function updScen(id:string,f:string,v:any){setScenarios(s=>s.map(x=>x.id===id?{...x,[f]:v}:x))}
  function delScen(id:string){setScenarios(s=>s.filter(x=>x.id!==id))}
  function applyScen(s:LoanScenario){setLoanAmount(String(s.amount));setRate(String(s.rateType==='variable'?s.rate-market.euribor_3m:s.rate));setYears(String(s.years));setRateType(s.rateType);setActivePreset(null)}
  function applyHist(h:CalcHistory){setLoanAmount(String(h.amount));setRate(String(h.rate));setYears(String(h.years));setLoanType(h.loanType);setActivePreset(null)}
  async function handleSave(){setSaving(true);await onSaveLoan({bank:bankName||'Μη καθορισμένη',loan_type:loanType,amount:LA,property_value:PV,rate:effRate,rate_type:rateType,years:Y,start_date:startDate,status:'active',notes:`${propTypeLabel} ${SQM}τμ, ${areaLabel}${notes?`, ${notes}`:''}`});setSaving(false)}

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Sticky summary */}
      <div style={{position:'sticky',top:0,zIndex:50,background:'var(--bg-base)',borderBottom:'1px solid var(--border-subtle)',padding:'10px 0',marginBottom:2}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          {[
            {l:'Δόση/μήνα',v:fmtEur(monthly),c:'var(--accent)',big:true},
            {l:'Τόκοι',v:fmtEur(totalInt),c:'var(--negative)',big:false},
            {l:'Σύνολο',v:fmtEur(total),c:'var(--text-primary)',big:false},
            {l:'LTV',v:`${ltv.toFixed(1)}%`,c:ltv>80?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)',big:false},
            {l:'€/τμ',v:sqmPrice>0?fmtEur(sqmPrice):'—',c:'var(--text-secondary)',big:false},
          ].map(item=>(
            <div key={item.l} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
              <span style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontFamily:"'Inter',sans-serif"}}>{item.l}</span>
              <span style={{fontSize:item.big?15:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:item.c,fontWeight:700}}>{item.v}</span>
            </div>
          ))}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:advisorSync?'var(--accent-dim)':'transparent',border:`1px solid ${advisorSync?'var(--border-accent)':'transparent'}`,borderRadius:8,transition:'all 0.3s'}}>
            <span style={{fontSize:10,color:advisorSync?'var(--accent)':'var(--border-default)',fontFamily:"'Inter',sans-serif",fontWeight:500,transition:'color 0.3s'}}>{advisorSync?'Advisor ενημερώθηκε':'Advisor'}</span>
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <div style={cardStyle}>
        <SectionLabel label="Γρήγορα Προφίλ" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>Κλικ για αυτόματη συμπλήρωση</span>}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:8}}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>applyPreset(p)} style={{padding:'12px 14px',background:activePreset===p.id?p.color:'var(--bg-surface)',border:`1px solid ${activePreset===p.id?p.border:'var(--border-subtle)'}`,borderRadius:12,cursor:'pointer',textAlign:'left' as const,transition:'all 0.2s'}}>
              <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:6}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:activePreset===p.id?p.textColor:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {activePreset===p.id&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <p style={{fontSize:13,color:activePreset===p.id?p.textColor:'var(--text-primary)',fontWeight:activePreset===p.id?500:400,fontFamily:"'Inter',sans-serif"}}>{p.label}</p>
              </div>
              <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Property + Loan type */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
        <div style={cardStyle}>
          <SectionLabel label="Στοιχεία Ακινήτου"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <CustomSelect label="Τύπος Ακινήτου" value={propType} onChange={v=>{setPropType(v);setActivePreset(null)}} options={PROP_TYPE_OPTIONS}/>
            <CustomSelect label="Περιοχή" value={area} onChange={v=>{setArea(v);setActivePreset(null)}} options={AREA_OPTIONS}/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10}}>
              <NumberInput label="Τιμή Αγοράς (€)" value={propValue} onChange={v=>{setPropValue(v);setActivePreset(null)}} suffix="€"/>
              <NumberInput label="Εμβαδόν (τετραγωνικά μέτρα)" value={sqm} onChange={v=>{setSqm(v);setActivePreset(null)}} suffix="τμ"/>
            </div>
            {sqmPrice>0&&(
              <div style={{padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Τιμή ανά τετραγωνικό μέτρο</span>
                <span style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--accent)',fontWeight:700}}>{fmtEur(sqmPrice)}/τμ</span>
              </div>
            )}
            {isNewBuilding&&<div style={{padding:'9px 12px',background:'var(--warning-dim)',border:'1px solid var(--warning-border)',borderRadius:8}}><p style={{fontSize:12,color:'var(--warning)',fontFamily:"'Inter',sans-serif"}}>Νεόδμητο: ΦΠΑ 24% ({fmtEur(vatOwed)}) αντί ΦΜΑ</p></div>}
            {isCommercial&&<div style={{padding:'9px 12px',background:'var(--info-dim)',border:'1px solid var(--info)',borderRadius:8}}><p style={{fontSize:12,color:'var(--info)',fontFamily:"'Inter',sans-serif"}}>Επαγγελματικό: ΦΜΑ 3% + Τέλη χαρτοσήμου 3.6% αν εκμισθωθεί</p></div>}
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>setHasAgent(h=>!h)} style={pillBtn(hasAgent,'var(--positive)')}>
                {hasAgent?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
                Αμοιβή Μεσίτη
              </button>
              {hasAgent&&<div style={{flex:1}}><NumberInput label="%" value={agentPct} onChange={setAgentPct} suffix="%" step={0.5}/></div>}
              {hasAgent&&<span style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)'}}>{fmtEur(AGNT)}</span>}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Σκοπός & Δανειολήπτης"/>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <CustomSelect label="Σκοπός Δανείου" value={loanType} onChange={v=>{setLoanType(v as LoanType);setActivePreset(null)}} options={LOAN_TYPE_OPTIONS}/>
            <div style={{padding:'8px 12px',background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8}}>
              <p style={{fontSize:12,color:'var(--accent)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{LOAN_TYPES[loanType].tax_note}</p>
            </div>
            <CustomSelect label="Τύπος Δανειολήπτη" value={borrower} onChange={v=>{setBorrower(v as BorrowerType);setActivePreset(null)}} options={BORROWER_OPTIONS}/>
            <div style={{padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{BORROWER_PROFILES[borrower].tax_benefits}</p>
            </div>
            {BORROWER_PROFILES[borrower].special&&<div style={{padding:'7px 12px',background:'var(--positive-dim)',border:'1px solid var(--positive-border)',borderRadius:8}}><p style={{fontSize:12,color:'var(--positive)',fontFamily:"'Inter',sans-serif"}}>{BORROWER_PROFILES[borrower].special}</p></div>}
          </div>
        </div>
      </div>

      {/* Loan params */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
        <div style={cardStyle}>
          <SectionLabel label="Στοιχεία Δανείου"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <NumberInput label="Ποσό Δανείου (€)" value={loanAmount} onChange={v=>{setLoanAmount(v);setActivePreset(null)}} suffix="€"/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
                <span style={{fontSize:12,color:ltv>90?'var(--negative)':ltv>80?'var(--warning)':'var(--positive)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>LTV {ltv.toFixed(1)}%</span>
                <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>Ίδια: {fmtEur(PV-LA)}</span>
              </div>
            </div>
            <NumberInput label="Διάρκεια (χρόνια)" value={years} onChange={v=>{setYears(v);setActivePreset(null)}} suffix="χρ" min={3} max={35}/>
            <DatePicker label="Ημερομηνία Έναρξης" value={startDate} onChange={setStartDate}/>
            <div>
              <CustomSelect label="Τράπεζα" value={bankId} onChange={setBankId} options={BANK_OPTIONS} placeholder="— Επιλέξτε τράπεζα —"/>
              {bankId==='custom'&&<div style={{marginTop:8}}><TextInput label="Όνομα τράπεζας" value={customBank} onChange={setCustomBank} placeholder="για παράδειγμα Παγκρήτια Τράπεζα"/></div>}
            </div>
            <Textarea label="Σημειώσεις" value={notes} onChange={setNotes} placeholder="για παράδειγμα 3ος όροφος, άποψη, ανακαινισμένο..." rows={2}/>
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Επιτόκιο & Παράμετροι"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <CustomSelect label="Τύπος Επιτοκίου" value={rateType} onChange={v=>{setRateType(v as RateType);setActivePreset(null)}} options={RATE_TYPE_OPTIONS}/>
            {(rateType==='fixed'||rateType==='mixed')&&<CustomSelect label="Διάρκεια Σταθερής Περιόδου" value={fixedPeriod} onChange={setFixedPeriod} options={FIXED_PERIOD_OPTIONS}/>}
            <div>
              <NumberInput label={rateType==='variable'?'Spread Τράπεζας (%)':'Ετήσιο Επιτόκιο (%)'} value={rate} onChange={v=>{setRate(v);setActivePreset(null)}} suffix="%" step={0.05}/>
              {rateType==='variable'&&(
                <div style={{marginTop:7,padding:'9px 12px',background:'var(--info-dim)',border:'1px solid var(--info)',borderRadius:8}}>
                  <p style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--info)'}}>Euribor {fmtPct(market.euribor_3m)} + {fmtPct(R)} = <strong>{fmtPct(effRate)}</strong></p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>Αυτόματη ενημέρωση από ECB κάθε πρωί</p>
                </div>
              )}
            </div>
            <div>
              <NumberInput label="Έκτακτη Μηνιαία Πληρωμή (€)" value={extraPay} onChange={setExtraPay} suffix="€" placeholder="0"/>
              {extraSav&&EP>0&&(
                <div style={{marginTop:6,padding:'9px 12px',background:'var(--positive-dim)',border:'1px solid var(--positive-border)',borderRadius:8}}>
                  <p style={{fontSize:12,color:'var(--positive)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Εξοικονομείτε {Math.round(extraSav.savedMonths/12)} χρόνια & {fmtEur(extraSav.savedInt)} τόκους</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:8}}>
        <KPI label="Μηνιαία Δόση" value={fmtEur(monthly)} color="var(--accent)"/>
        <KPI label="Σύνολο Τόκων" value={fmtEur(totalInt)} color="var(--negative)" sub={`${((totalInt/Math.max(LA,1))*100).toFixed(0)}% επί κεφαλαίου`}/>
        <KPI label="Συνολική Αποπληρωμή" value={fmtEur(total)}/>
        <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)'} sub={`Ίδια: ${fmtEur(PV-LA)}`}/>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {[
          {label:saving?'Αποθήκευση...':'Αποθήκευση Δανείου',fn:handleSave,disabled:saving,color:'var(--accent)',bg:'var(--accent-dim)',border:'var(--border-accent)'},
          {label:'Δόσεις → Ημερολόγιο',fn:()=>onSaveToCalendar(monthly,Y,startDate,bankName),disabled:false,color:'var(--info)',bg:'var(--info-dim)',border:'var(--info)'},
          {label:'Δόση → Δαπάνες',fn:()=>onSaveToExpenses(monthly,bankName),disabled:false,color:'var(--positive)',bg:'var(--positive-dim)',border:'var(--positive-border)'},
          {label:'+ Προσθήκη Σεναρίου',fn:addScen,disabled:false,color:'var(--text-secondary)',bg:'var(--bg-elevated)',border:'var(--border-subtle)'},
        ].map(a=>(
          <button key={a.label} onClick={a.fn} disabled={a.disabled} style={{display:'flex',alignItems:'center',gap:7,padding:'0 18px',height:36,background:a.bg,border:`1px solid ${a.border}`,borderRadius:18,cursor:a.disabled?'wait':'pointer',color:a.color,fontSize:13,fontFamily:"'Inter',sans-serif",fontWeight:500,transition:'all 0.15s',whiteSpace:'nowrap' as const}}>
            {a.label}
          </button>
        ))}
      </div>

      {/* History */}
      {history.length>0&&(
        <div style={cardStyle}>
          <SectionLabel label="Ιστορικό Υπολογισμών" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>Κλικ για επαναφορά</span>}/>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {history.map((h,i)=>(
              <button key={h.id} onClick={()=>applyHist(h)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:i===0?'var(--bg-surface)':'transparent',border:'1px solid var(--border-subtle)',borderRadius:8,cursor:'pointer',textAlign:'left' as const}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <div>
                  <p style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600}}>{fmtEur(h.monthly)}/μήνα</p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{fmtEur(h.amount)} · {fmtPct(h.rate)} · {h.years}χρ · {h.ts}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scenarios */}
      {scenarios.length>0&&(
        <div style={cardStyle}>
          <SectionLabel label="Σύγκριση Σεναρίων"/>
          <div style={{overflowX:'auto',marginBottom:16}}>
            <div className="table-wrap">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{borderBottom:'1px solid var(--border-subtle)'}}>{['Σενάριο','Ποσό','Επιτόκιο','Χρόνια','Δόση/μήνα','Σύν. Τόκοι','Διαφορά',''].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{h}</th>)}</tr></thead>
              <tbody>
                {scenarios.map(s=>{
                  const m=calcMonthly(s.amount,s.rate,s.years),ti=m*s.years*12-s.amount,saved=totalInt-ti
                  const isBest=scenarios.length>1&&saved===Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return totalInt-(mx*x.years*12-x.amount)}))
                  const isEd=editingId===s.id
                  const cell=(v:string,f:string,w:number)=><input value={v} onChange={e=>updScen(s.id,f,f==='label'?e.target.value:Number(e.target.value))} style={{background:'var(--bg-surface)',border:'1px solid var(--accent)',borderRadius:4,padding:'5px 8px',color:'var(--text-primary)',fontSize:12,outline:'none',width:w,fontFamily:f==='label'?"'Inter',sans-serif":"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}} type={f==='label'?'text':'number'} step={f==='rate'?0.05:1}/>
                  return(
                    <tr key={s.id} style={{borderBottom:'1px solid var(--border-subtle)',background:isBest?'var(--positive-dim)':'transparent'}}>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(s.label,'label',120):<div style={{display:'flex',alignItems:'center',gap:7}}><span style={{color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{s.label}</span>{isBest&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:8,background:'var(--positive-dim)',color:'var(--positive)',border:'1px solid var(--positive-border)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>ΒΕΛΤΙΣΤΟ</span>}</div>}</td>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(String(s.amount),'amount',90):<span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--accent)',fontWeight:600}}>{fmtEur(s.amount)}</span>}</td>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(String(s.rate),'rate',65):<span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--info)'}}>{fmtPct(s.rate)}</span>}</td>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(String(s.years),'years',55):<span style={{color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{s.years} χρ</span>}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)',fontWeight:600}}>{fmtEur(m)}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--negative)'}}>{fmtEur(ti)}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:saved>0?'var(--positive)':'var(--negative)',fontWeight:600}}>{saved>0?`-${fmtEur(saved)}`:`+${fmtEur(-saved)}`}</td>
                      <td style={{padding:'9px 10px'}}>
                        <div style={{display:'flex',gap:3,alignItems:'center'}}>
                          {isEd
                            ?<button onClick={()=>setEditingId(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--positive)',display:'flex',padding:4}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>
                            :<>
                              <button onClick={()=>setEditingId(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',display:'flex',padding:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                              <button onClick={()=>applyScen(s)} style={{background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8,cursor:'pointer',color:'var(--accent)',display:'flex',alignItems:'center',gap:3,padding:'3px 7px',fontSize:11,fontFamily:"'Inter',sans-serif",fontWeight:500}}>Εφαρμογή</button>
                            </>
                          }
                          <button onClick={()=>delScen(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--border-default)',display:'flex',padding:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
          {scenChart.length>0&&(
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={scenChart} barCategoryGap="30%">
                <defs><linearGradient id="scenNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{stopColor:'var(--negative)',stopOpacity:0.85}}/><stop offset="100%" style={{stopColor:'var(--negative)',stopOpacity:0.38}}/></linearGradient></defs>
                <XAxis dataKey="name" tick={{fontSize:10,fill:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fill:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace"}} axisLine={false} tickLine={false} width={72}/>
                <Tooltip content={ChartTip}/><Bar dataKey="Τόκοι" fill="url(#scenNeg)" radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Charts */}
      <Section title="Γράφημα Αποπληρωμής" sub="Κεφάλαιο έναντι τόκων ανά έτος" defaultOpen>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={amortChart} barCategoryGap="12%">
            <defs>
              <linearGradient id="amortCap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{stopColor:'var(--positive)',stopOpacity:0.95}}/>
                <stop offset="100%" style={{stopColor:'var(--positive)',stopOpacity:0.5}}/>
              </linearGradient>
              <linearGradient id="amortInt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{stopColor:'var(--negative)',stopOpacity:0.85}}/>
                <stop offset="100%" style={{stopColor:'var(--negative)',stopOpacity:0.38}}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="year" tick={{fontSize:9,fill:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fill:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace"}} axisLine={false} tickLine={false} width={72}/>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={ChartTip}/><Legend wrapperStyle={{fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}/>
            <Bar dataKey="Κεφάλαιο" stackId="a" fill="url(#amortCap)" radius={[0,0,2,2]}/>
            <Bar dataKey="Τόκοι"    stackId="a" fill="url(#amortInt)" radius={[5,5,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Σταθερό vs Κυμαινόμενο" sub="Ανάλυση κόστους σε πραγματικό χρόνο" badge="LIVE">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12,marginBottom:14}}>
          {[
            {label:'Σταθερό Επιτόκιο',rate:effRate,m:monthly,pros:['Γνωστή δόση, χωρίς εκπλήξεις','Προστασία από άνοδο Euribor','Ιδανικό αν Euribor αναμένεται να ανέβει'],cons:['Αρχικά υψηλότερο επιτόκιο','Ποινή πρόωρης αποπληρωμής'],c:'var(--positive)',bg:'var(--positive-dim)',border:'var(--positive-border)'},
            {label:'Κυμαινόμενο Επιτόκιο',rate:market.euribor_3m+R,m:varMonthly,pros:['Σήμερα χαμηλότερο κόστος','Ωφελείσαι αν Euribor πέσει','Χωρίς ποινή πρόωρης αποπληρωμής'],cons:['Κίνδυνος ανόδου Euribor','Αβεβαιότητα δόσης'],c:'var(--info)',bg:'var(--info-dim)',border:'var(--info-border)'},
          ].map(item=>(
            <div key={item.label} style={{background:item.bg,border:`1px solid ${item.border}`,borderRadius:10,padding:14}}>
              <p style={{fontSize:13,color:item.c,fontWeight:500,fontFamily:"'Inter',sans-serif",marginBottom:12}}>{item.label}</p>
              <div style={{display:'flex',gap:16,marginBottom:12}}>
                {[['Επιτόκιο',fmtPct(item.rate)],['Δόση/μήνα',fmtEur(item.m)],['Σύν. Τόκοι',fmtEur(item.m*Y*12-LA)]].map(([k,v])=>(
                  <div key={k}><p style={{fontSize:9,color:'var(--text-tertiary)',marginBottom:2,fontFamily:"'Inter',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px'}}>{k}</p><p style={{fontSize:16,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:item.c,fontWeight:700}}>{v}</p></div>
                ))}
              </div>
              {item.pros.map((p,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:3}}><span style={{color:'var(--positive)',flexShrink:0}}>+</span><p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{p}</p></div>)}
              {item.cons.map((c,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:3}}><span style={{color:'var(--negative)',flexShrink:0}}>-</span><p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{c}</p></div>)}
            </div>
          ))}
        </div>
        <p style={{...labelStyle,marginBottom:10}}>Σωρευτικοί Τόκοι ανά Χρόνο</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={fvChartData}>
            <XAxis dataKey="year" tick={{fontSize:9,fill:'var(--text-secondary)'}} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fill:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace"}} axisLine={false} tickLine={false} width={72}/>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={ChartTip}/><Legend wrapperStyle={{fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}/>
            <Line type="monotone" dataKey="Σταθερό" stroke="var(--positive)" strokeWidth={2} dot={false}/>
            <Line type="monotone" dataKey="Κυμαινόμενο" stroke="var(--info)" strokeWidth={2} dot={false} strokeDasharray="4 2"/>
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Σπίτι μου ΙΙ vs Κανονικό Δάνειο" sub="Εκτίμηση εξοικονόμησης, deadline 31/08/2026">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12,marginBottom:14}}>
          {[
            {label:'Σπίτι μου ΙΙ (εκτίμηση)',rate:spitiR,m:spitiM,ti:spitiM*Y*12-LA,c:'var(--positive)',bg:'var(--positive-dim)',border:'var(--positive-border)'},
            {label:'Κανονικό Δάνειο',rate:effRate,m:monthly,ti:totalInt,c:'var(--negative)',bg:'var(--negative-dim)',border:'var(--negative-border)'},
          ].map(item=>(
            <div key={item.label} style={{background:item.bg,border:`1px solid ${item.border}`,borderRadius:10,padding:14}}>
              <p style={{fontSize:13,color:item.c,fontWeight:500,fontFamily:"'Inter',sans-serif",marginBottom:12}}>{item.label}</p>
              {[['Επιτόκιο',fmtPct(item.rate)],['Δόση/μήνα',fmtEur(item.m)],['Σύν. τόκοι',fmtEur(item.ti)],['Σύνολο',fmtEur(item.m*Y*12)]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{k}</span>
                  <span style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:item.c,fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:10,padding:'14px 18px',textAlign:'center' as const}}>
          <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4,fontFamily:"'Inter',sans-serif"}}>Εκτιμώμενη συνολική εξοικονόμηση</p>
          <p style={{fontSize:32,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--accent)',fontWeight:700}}>{fmtEur(spitiSv)}</p>
          <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:6,fontFamily:"'Inter',sans-serif"}}>{fmtEur(spitiSv/Math.max(Y*12,1))}/μήνα εξοικονόμηση</p>
        </div>
        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:10,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>Εκτίμηση βάσει μέσου επιδοτούμενου επιτοκίου. → <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:'var(--info)',textDecoration:'none',fontWeight:500}}>greece20.gov.gr</a></p>
      </Section>

      <Section title="Δανειοληπτική Ικανότητα & DTI" sub="Μέγιστο δάνειο βάσει εισοδήματος">
        <div style={{marginBottom:12}}><NumberInput label="Μηνιαίο Καθαρό Εισόδημα (€)" value={income} onChange={setIncome} suffix="€"/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8}}>
          <KPI label="Μέγιστη δόση/μήνα" value={fmtEur(INC*BORROWER_PROFILES[borrower].income_ratio)} color="var(--accent)" sub={`${(BORROWER_PROFILES[borrower].income_ratio*100).toFixed(0)}% εισοδήματος`}/>
          <KPI label="Μέγιστο δάνειο" value={fmtEur(maxLoan)} color={maxLoan>=LA?'var(--positive)':'var(--negative)'}/>
          <KPI label="DTI Ratio" value={monthly>0?fmtPct1((monthly/INC)*100):'—'} color={(monthly/INC)>0.4?'var(--negative)':(monthly/INC)>0.35?'var(--warning)':'var(--positive)'} sub="Δόση / Εισόδημα"/>
        </div>
        {maxLoan<LA&&<div style={{marginTop:10,padding:'10px 14px',background:'var(--negative-dim)',border:'1px solid var(--negative-border)',borderRadius:8}}><p style={{fontSize:12,color:'var(--negative)',fontFamily:"'Inter',sans-serif"}}>Υπέρβαση κατά {fmtEur(LA-maxLoan)}, μειώστε ποσό ή αυξήστε διάρκεια</p></div>}
      </Section>

      <Section title="Φορολογική Ανάλυση" sub="ΦΜΑ, απαλλαγές, ενοίκια, ΑΑΔΕ 2026">
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
            <p style={{...labelStyle,marginBottom:12}}>{isNewBuilding?'ΦΠΑ 24%':isCommercial?'ΦΜΑ 3% + Χαρτόσημο':'ΦΜΑ 3%'}</p>
            {!isNewBuilding&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10,marginBottom:12}}>
                <CustomSelect label="Οικογενειακή Κατάσταση" value={marital} onChange={v=>setMarital(v as any)} options={MARITAL_OPTIONS}/>
                <CustomSelect label="Εξαρτώμενα Τέκνα" value={children} onChange={setChildren} options={CHILDREN_OPTIONS}/>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8,marginBottom:10}}>
              {isNewBuilding?(
                <>
                  <KPI label="ΦΠΑ 24%" value={fmtEur(vatOwed)} color="var(--negative)" sub="Αντί ΦΜΑ"/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color="var(--text-primary)"/>
                  <KPI label="Τιμή πριν ΦΠΑ" value={fmtEur(PV-vatOwed)} color="var(--text-secondary)"/>
                </>
              ):(
                <>
                  <KPI label={isCommercial?'ΦΜΑ 3%':'Όριο απαλλαγής ΦΜΑ'} value={isCommercial?fmtEur(fmaOwed):fmtEur(fmaEx)} color={isCommercial?'var(--negative)':'var(--positive)'}/>
                  <KPI label="ΦΜΑ που αναλογεί" value={fmaOwed===0?'Απαλλαγή':fmtEur(fmaOwed)} color={fmaOwed===0?'var(--positive)':'var(--negative)'}/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color={(!isCommercial&&PV<=fmaEx)?'var(--positive)':'var(--warning)'}/>
                </>
              )}
            </div>
            {loanType==='first_home'&&PV<=fmaEx&&!isNewBuilding&&!isCommercial&&<div style={{padding:'10px 14px',background:'var(--positive-dim)',border:'1px solid var(--positive-border)',borderRadius:8}}><p style={{fontSize:13,color:'var(--positive)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Δικαιούστε πλήρη απαλλαγή ΦΜΑ, εξοικονόμηση {fmtEur(PV*0.03)}</p></div>}
          </div>
          {loanType==='investment'&&(
            <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
              <p style={{...labelStyle,marginBottom:12}}>Κλίμακα Ενοικίων 2026</p>
              {TAX_DATA.rental_tax.map((b,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8,marginBottom:5}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{b.label}</span>
                  <span style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--accent)',fontWeight:700}}>{(b.rate*100).toFixed(0)}%</span>
                </div>
              ))}
              <div style={{marginTop:10,padding:'9px 12px',background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8}}>
                <p style={{fontSize:12,color:'var(--accent)',fontFamily:"'Inter',sans-serif"}}>Αυτόματη έκπτωση 5% · Εκτ. φόρος: {fmtEur(renTax)}/χρόνο</p>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Stress Test Επιτοκίου" sub="Αντοχή δόσης σε σενάρια ανόδου Euribor">
        <div style={{marginBottom:14}}>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stress.map(s=>({name:s.label,Δόση:Math.round(s.monthly)}))} barCategoryGap="22%">
              <defs><linearGradient id="stressAccent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{stopColor:'var(--accent)',stopOpacity:0.95}}/><stop offset="100%" style={{stopColor:'var(--accent)',stopOpacity:0.5}}/></linearGradient></defs>
              <XAxis dataKey="name" tick={{fontSize:10,fill:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fill:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace"}} axisLine={false} tickLine={false} width={72}/>
              <Tooltip content={ChartTip}/>
              <ReferenceLine y={INC*BORROWER_PROFILES[borrower].income_ratio} stroke="var(--warning)" strokeDasharray="4 4"/>
              <Bar dataKey="Δόση" fill="url(#stressAccent)" radius={[5,5,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="table-wrap">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{borderBottom:'1px solid var(--border-subtle)'}}>{['Σενάριο','Επιτόκιο','Δόση/μήνα','Αύξηση','DTI'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{h}</th>)}</tr></thead>
          <tbody>
            {stress.map((s,i)=>{
              const diff=s.monthly-stress[0].monthly,dti=(s.monthly/INC)*100
              return <tr key={i} style={{borderBottom:'1px solid var(--border-subtle)',background:i===0?'var(--accent-dim)':'transparent'}}>
                <td style={{padding:'8px 10px',color:i===0?'var(--accent)':'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:i===0?500:400}}>{s.label}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--info)'}}>{fmtPct(s.rate)}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:i===0?'var(--accent)':diff>500?'var(--negative)':diff>250?'var(--warning)':'var(--text-primary)',fontWeight:600}}>{fmtEur(s.monthly)}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:i===0?'var(--text-tertiary)':'var(--negative)'}}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:dti>40?'var(--negative)':dti>35?'var(--warning)':'var(--positive)',fontWeight:600}}>{fmtPct1(dti)}</td>
              </tr>
            })}
          </tbody>
        </table>
        </div>
        {rateType==='fixed'&&<div style={{marginTop:10,padding:'9px 12px',background:'var(--positive-dim)',border:'1px solid var(--positive-border)',borderRadius:8}}><p style={{fontSize:12,color:'var(--positive)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Σταθερό {fixedPeriod} χρόνια, προστατευμένοι από ανατιμήσεις Euribor</p></div>}
      </Section>

      <Section title="Ανάλυση Αναχρηματοδότησης" sub="Break-even, πότε αξίζει η μεταφορά">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:10,marginBottom:14}}>
          <NumberInput label="Υπόλοιπο (€)" value={remBal} onChange={setRemBal} suffix="€"/>
          <NumberInput label="Χρόνια που μένουν" value={remYears} onChange={setRemYears} suffix="χρ"/>
          <NumberInput label="Τρέχον επιτόκιο (%)" value={curRate} onChange={setCurRate} suffix="%" step={0.05}/>
          <NumberInput label="Νέο επιτόκιο (%)" value={newRate} onChange={setNewRate} suffix="%" step={0.05}/>
          <NumberInput label="Κόστος μεταφοράς (€)" value={xferCost} onChange={setXferCost} suffix="€"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:8}}>
          <KPI label="Τρέχουσα δόση" value={fmtEur(currM)} color="var(--negative)"/>
          <KPI label="Νέα δόση" value={fmtEur(newM)} color="var(--positive)" sub={`${fmtEur(mSav)}/μήνα`}/>
          <KPI label="Καθαρή εξοικονόμηση" value={fmtEur(Math.max(0,refSav))} color={refSav>0?'var(--accent)':'var(--negative)'} sub={refSav>0?'Αξίζει':'Δεν συμφέρει'}/>
          <KPI label="Break-even" value={brkEven?`${brkEven} μήνες`:'—'} color={brkEven&&brkEven<24?'var(--positive)':brkEven&&brkEven<48?'var(--warning)':'var(--negative)'} sub="Αποσβέσεως εξόδων"/>
        </div>
      </Section>

      <Section title="Πίνακας Αποπληρωμής" sub={`${Y*12} δόσεις αναλυτικά`}>
        <div style={{overflowX:'auto'}}>
          <div className="table-wrap">
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{borderBottom:'1px solid var(--border-subtle)'}}>{['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Σύν. Τόκοι'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'right',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{h}</th>)}</tr></thead>
            <tbody>
              {amort.slice(0,24).map(row=>(
                <tr key={row.month} style={{borderBottom:'1px solid var(--border-subtle)'}}>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'var(--text-tertiary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{row.month}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'var(--accent)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600}}>{fmtEur(row.payment)}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'var(--positive)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEur(row.principal)}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'var(--negative)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEur(row.interest)}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEur(row.balance)}</td>
                  <td style={{padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{fmtEur(row.totalInterestPaid)}</td>
                </tr>
              ))}
              {amort.length>24&&<tr><td colSpan={6} style={{padding:10,textAlign:'center',color:'var(--text-tertiary)',fontSize:11,fontFamily:"'Inter',sans-serif"}}>... {amort.length-24} ακόμα δόσεις</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </Section>

      <Section title="Απαραίτητα Έγγραφα" sub={`${LOAN_TYPES[loanType].label} · ${propTypeLabel}`}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16}}>
          <div>
            <p style={{...labelStyle,marginBottom:10}}>Γενικά Δικαιολογητικά</p>
            {LOAN_TYPES[loanType].docs.map((d,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{d}</span>
              </div>
            ))}
            {isNewBuilding&&(
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{fontSize:12,color:'var(--warning)',fontFamily:"'Inter',sans-serif"}}>Άδεια οικοδομής + ΦΠΑ βεβαίωση</span>
              </div>
            )}
          </div>
          <div>
            <p style={{...labelStyle,marginBottom:10}}>Ανά Τύπο Δανειολήπτη</p>
            {borrower==='professional'&&['Φορολογικές δηλώσεις 2 ετών','Βεβαίωση δραστηριότητας ΔΟΥ'].map((d,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{d}</span>
              </div>
            ))}
            {borrower==='company'&&['Καταστατικό','Ισολογισμοί 3 ετών','Απόφαση ΔΣ'].map((d,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{d}</span>
              </div>
            ))}
            {borrower==='military'&&['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση'].map((d,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{d}</span>
              </div>
            ))}
            {borrower==='abroad'&&['Αποδεικτικό κατοικίας εξωτερικού','Εισοδήματα ξένης χώρας','Επίσημες μεταφράσεις'].map((d,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{d}</span>
              </div>
            ))}
            {!['professional','company','military','abroad'].includes(borrower)&&(
              <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Μισθοδοτικές 3 μηνών + Εκκαθαριστικό</p>
            )}
            <div style={{marginTop:12,padding:'9px 12px',background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8}}>
              <p style={{fontSize:12,color:'var(--accent)',fontFamily:"'Inter',sans-serif"}}>{BORROWER_PROFILES[borrower].tax_benefits}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Full acquisition cost */}
      <div style={cardStyle}>
        <SectionLabel label="Πλήρης Ανάλυση Κόστους Απόκτησης" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{propTypeLabel}{SQM>0?` · ${SQM}τμ`:''} · {areaLabel}</span>}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8,marginBottom:14}}>
          {[
            {label:isNewBuilding?'ΦΠΑ 24%':'Φόρος Μεταβίβασης (ΦΜΑ)',value:isNewBuilding?fmtEur(vatOwed):fmaOwed===0?'Απαλλαγή':fmtEur(fmaOwed),sub:isNewBuilding?'Νεόδμητο':fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας',hi:false},
            {label:'Συμβολαιογραφικά',value:fmtEur(totalCosts.notary),sub:'Κλιμακωτή κλίμακα',hi:false},
            {label:'Κτηματολόγιο & Εγγραφή',value:fmtEur(totalCosts.landReg),sub:'0.475‰ δανείου',hi:false},
            {label:'Δικηγόρος ελέγχου τίτλων',value:fmtEur(totalCosts.legal),sub:'Έλεγχος + παρουσία',hi:false},
            {label:'Αμοιβή μεσίτη',value:hasAgent?fmtEur(AGNT):'—',sub:hasAgent?`${agentPct}%`:'Ανενεργό',hi:false},
            {label:'Λοιπά',value:fmtEur(totalCosts.other),sub:'Φόρος ενεγγύησης',hi:false},
            {label:'Σύνολο Εξόδων Αγοράς',value:fmtEur(totalCosts.total),sub:'Εκτός δόσεων',hi:true},
            {label:'Απαιτούμενα Ίδια Κεφάλαια',value:fmtEur(totalCosts.totalCash),sub:'Προκαταβολή + έξοδα',hi:true},
          ].map((item:any)=>(
            <div key={item.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 14px',borderRadius:10,background:item.hi?'var(--accent-dim)':'var(--bg-surface)',border:`1px solid ${item.hi?'var(--border-accent)':'var(--border-subtle)'}`}}>
              <div>
                <p style={{fontSize:13,color:item.hi?'var(--accent)':'var(--text-primary)',fontWeight:item.hi?500:400,fontFamily:"'Inter',sans-serif"}}>{item.label}</p>
                <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif"}}>{item.sub}</p>
              </div>
              <span style={{fontSize:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:item.hi?'var(--accent)':'var(--info)',fontWeight:item.hi?700:400,marginLeft:12,whiteSpace:'nowrap' as const}}>{item.value}</span>
            </div>
          ))}
        </div>
        <div style={{padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:9,marginBottom:10}}>
          <p style={{...labelStyle,marginBottom:8}}>Ανάλυση Συμβολαιογραφικών</p>
          {notaryCosts.breakdown.map((line,i)=>(
            <p key={i} style={{fontSize:12,color:'var(--text-secondary)',marginBottom:3,lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>· {line}</p>
          ))}
        </div>
        <div style={{padding:'10px 14px',background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:9,marginBottom:10}}>
          <p style={{fontSize:12,color:'var(--accent)',fontFamily:"'Inter',sans-serif"}}>Ασφάλεια κατοικίας 100-300€/έτος (υποχρεωτική) · Ασφάλεια ζωής ~{fmtEur(LA*0.001)}/έτος</p>
        </div>
        <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
          Εκτιμήσεις βάσει δεδομένων χρήστη. →{' '}
          <a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{color:'var(--info)',textDecoration:'none',fontWeight:500}}>ΑΑΔΕ</a>
        </p>
      </div>
    </div>
  )
}