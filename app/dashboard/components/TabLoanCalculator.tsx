'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine
} from 'recharts'
import {
  Save, Calendar, ArrowRight, Plus, Trash2, Edit2, Check, X,
  FileText, ChevronDown, ChevronUp, Zap, TrendingUp, Clock, RefreshCw
} from 'lucide-react'
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea } from './UIComponents'
import {
  BANKS, LOAN_TYPES, BORROWER_PROFILES, TAX_DATA,
  calcMonthly, calcAmortization, calcFmaExemption, calcRentalTax,
  fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, LoanScenario, MarketRates, SavedLoan
} from './TabLoanData'

// ─── Design helpers ───────────────────────────────────────────────────────────
const dot = (label: string, right?: React.ReactNode) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', display:'inline-block', flexShrink:0 }}/>
      <p style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:600 }}>{label}</p>
    </div>
    {right}
  </div>
)

function KPI({ label, value, color, sub, trend }: { label:string; value:string; color?:string; sub?:string; trend?:'up'|'down'|'neutral' }) {
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'12px 14px' }}>
      <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6, fontWeight:600 }}>{label}</p>
      <p style={{ fontSize:16, fontFamily:'JetBrains Mono, monospace', color:color||'var(--text-primary)', fontWeight:700 }}>{value}</p>
      {sub&&<p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:3 }}>{sub}</p>}
    </div>
  )
}

function Section({ title, sub, children, defaultOpen=false, badge }: { title:string; sub?:string; children:React.ReactNode; defaultOpen?:boolean; badge?:string }) {
  const [open,setOpen] = useState(defaultOpen)
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden' }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' as const }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:open?'var(--accent)':'var(--border-default)', display:'inline-block', transition:'background 0.2s' }}/>
            <p style={{ fontSize:11, color:open?'var(--accent)':'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>{title}</p>
            {badge&&<span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'rgba(52,211,153,0.12)', color:'var(--positive)', border:'1px solid rgba(52,211,153,0.2)', fontWeight:700 }}>{badge}</span>}
          </div>
          {sub&&<p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:3, marginLeft:13, lineHeight:1.4 }}>{sub}</p>}
        </div>
        {open?<ChevronUp size={14} color="var(--text-secondary)"/>:<ChevronDown size={14} color="var(--text-secondary)"/>}
      </button>
      {open&&<div style={{ padding:'0 16px 16px' }}>{children}</div>}
    </div>
  )
}

function ChartTip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'JetBrains Mono, monospace', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
      <p style={{ color:'var(--text-secondary)', marginBottom:6, fontSize:10 }}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:2, background:p.color, display:'inline-block' }}/>
          <p style={{ color:'var(--text-primary)' }}>{p.name}: <strong style={{ color:p.color }}>{p.value>100?fmtEur(p.value):`${p.value}%`}</strong></p>
        </div>
      ))}
    </div>
  )
}

// ─── Select options ───────────────────────────────────────────────────────────
const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k,v])=>({
  value:k, label:v.label, description:`${v.typical_rate} · LTV έως ${v.typical_ltv}%`
}))
const BORROWER_OPTIONS = Object.entries(BORROWER_PROFILES).map(([k,v])=>({
  value:k, label:v.label, description:v.notes
}))
const BANK_OPTIONS = [
  ...BANKS.map(b=>({ value:b.id, label:b.name, description:`${b.note} · ${b.fees}`, dot:b.color })),
  { value:'custom', label:'Άλλη τράπεζα', description:'Καταχωρήστε το όνομά της' }
]
const RATE_TYPE_OPTIONS = [
  { value:'fixed',    label:'Σταθερό',     description:'Το επιτόκιο δεν αλλάζει για την επιλεγμένη περίοδο' },
  { value:'variable', label:'Κυμαινόμενο', description:'Euribor + spread — αλλάζει με την αγορά' },
  { value:'mixed',    label:'Μικτό',        description:'Σταθερό για κάποια χρόνια, μετά κυμαινόμενο' },
]
const FIXED_PERIOD_OPTIONS = ['3','5','10','15','20'].map(v=>({
  value:v, label:`${v} χρόνια`, description:v==='5'?'Πιο συνηθισμένο':v==='10'?'Καλή ισορροπία':'',
}))
const MARITAL_OPTIONS = [
  { value:'single',  label:'Άγαμος / Άγαμη',  description:'Βασικό όριο απαλλαγής ΦΜΑ: 200.000€' },
  { value:'married', label:'Έγγαμος / Έγγαμη', description:'Βασικό όριο απαλλαγής ΦΜΑ: 250.000€' },
]
const CHILDREN_OPTIONS = [0,1,2,3,4,5,6,7].map(n=>({
  value:String(n),
  label:n===0?'Χωρίς εξαρτώμενα τέκνα':`${n} εξαρτώμεν${n===1?'ο':'α'} τέκν${n===1?'ο':'α'}`,
  description:n===0?'Δεν επηρεάζει το όριο απαλλαγής':
              n===1?'Προσαύξηση +25.000€ στο όριο ΦΜΑ':
              n===2?'Προσαύξηση +50.000€ στο όριο ΦΜΑ':
              n===3?'Προσαύξηση +80.000€ (3ο τέκνο +30.000€)':
              `Προσαύξηση +${50+(n-2)*30}.000€ στο όριο ΦΜΑ`
}))

// ─── Quick Presets ────────────────────────────────────────────────────────────
const PRESETS = [
  {
    id:'first_buyer',
    label:'Νέος Αγοραστής',
    emoji:'🏠',
    desc:'Σπίτι μου ΙΙ — πρώτη κατοικία',
    color:'rgba(52,211,153,0.15)',
    border:'rgba(52,211,153,0.3)',
    textColor:'var(--positive)',
    values:{ loanAmount:'150000', propValue:'180000', rate:'1.80', years:'25', rateType:'fixed' as RateType, loanType:'first_home' as LoanType, borrower:'young' as BorrowerType, fixedPeriod:'5' },
  },
  {
    id:'investor',
    label:'Επενδυτής',
    emoji:'📈',
    desc:'Αγορά ακινήτου προς ενοικίαση',
    color:'rgba(96,165,250,0.12)',
    border:'rgba(96,165,250,0.3)',
    textColor:'var(--info)',
    values:{ loanAmount:'200000', propValue:'280000', rate:'3.20', years:'20', rateType:'fixed' as RateType, loanType:'investment' as LoanType, borrower:'individual' as BorrowerType, fixedPeriod:'5' },
  },
  {
    id:'renovation',
    label:'Ανακαίνιση',
    emoji:'🔧',
    desc:'Ενεργειακή αναβάθμιση — πράσινο δάνειο',
    color:'rgba(167,139,250,0.12)',
    border:'rgba(167,139,250,0.3)',
    textColor:'#a78bfa',
    values:{ loanAmount:'25000', propValue:'200000', rate:'2.90', years:'15', rateType:'fixed' as RateType, loanType:'energy' as LoanType, borrower:'individual' as BorrowerType, fixedPeriod:'5' },
  },
  {
    id:'refinance',
    label:'Αναχρηματοδότηση',
    emoji:'🔄',
    desc:'Μεταφορά υπάρχοντος δανείου',
    color:'rgba(212,175,66,0.12)',
    border:'rgba(212,175,66,0.3)',
    textColor:'var(--accent)',
    values:{ loanAmount:'100000', propValue:'200000', rate:'2.80', years:'20', rateType:'fixed' as RateType, loanType:'refinance' as LoanType, borrower:'individual' as BorrowerType, fixedPeriod:'5' },
  },
]

interface CalcHistory {
  id:string; ts:string; loanType:LoanType; amount:number; rate:number; years:number; rateType:RateType; monthly:number; totalInt:number
}

interface Props {
  propertyId:string; userId:string; market:MarketRates
  onSaveLoan:(loan:Partial<SavedLoan>)=>Promise<void>
  onSaveToCalendar:(monthly:number,years:number,startDate:string,bankName:string)=>Promise<void>
  onSaveToExpenses:(monthly:number,bankName:string)=>Promise<void>
  onStateChange?:(s:{loanType:LoanType;borrowerType:BorrowerType;loanAmount:number;years:number;rateType:RateType;effectiveRate:number;monthly:number;totalInterest:number;propertyValue:number})=>void
}

export default function TabLoanCalculator({ propertyId, userId, market, onSaveLoan, onSaveToCalendar, onSaveToExpenses, onStateChange }: Props) {
  const [loanAmount,  setLoanAmount]  = useState('150000')
  const [propValue,   setPropValue]   = useState('200000')
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
  const [scenarios,   setScenarios]   = useState<LoanScenario[]>([])
  const [editingId,   setEditingId]   = useState<string|null>(null)
  const [remBal,      setRemBal]      = useState('100000')
  const [remYears,    setRemYears]    = useState('20')
  const [newRate,     setNewRate]     = useState('3.0')
  const [xferCost,    setXferCost]    = useState('2000')
  const [saving,      setSaving]      = useState(false)
  const [activePreset, setActivePreset] = useState<string|null>(null)
  const [history,     setHistory]     = useState<CalcHistory[]>([])
  const [advisorSync, setAdvisorSync] = useState(false) // visual feedback flag
  const historyTimer  = useRef<any>(null)

  // Parse numbers
  const LA   = parseFloat(loanAmount)||0
  const PV   = parseFloat(propValue)||0
  const R    = parseFloat(rate)||0
  const Y    = parseInt(years)||0
  const EP   = parseFloat(extraPay)||0
  const INC  = parseFloat(income)||2000
  const CH   = parseInt(children)||0
  const RB   = parseFloat(remBal)||0
  const RY   = parseFloat(remYears)||0
  const NR   = parseFloat(newRate)||0
  const XC   = parseFloat(xferCost)||0

  const effRate  = rateType==='variable' ? market.euribor_3m+R : R
  const monthly  = calcMonthly(LA,effRate,Y)
  const total    = monthly*Y*12
  const totalInt = total-LA
  const ltv      = PV>0?(LA/PV)*100:0
  const amort    = useMemo(()=>calcAmortization(LA,effRate,Y),[LA,effRate,Y])

  // Notify parent + visual sync feedback + history
  useMemo(()=>{
    onStateChange?.({loanType,borrowerType:borrower,loanAmount:LA,years:Y,rateType,effectiveRate:effRate,monthly,totalInterest:totalInt,propertyValue:PV})
    // Advisor sync flash
    setAdvisorSync(true)
    setTimeout(()=>setAdvisorSync(false),1200)
    // Add to history (debounced)
    if(LA>0&&Y>0&&effRate>0){
      if(historyTimer.current) clearTimeout(historyTimer.current)
      historyTimer.current = setTimeout(()=>{
        setHistory(h=>{
          const entry:CalcHistory = { id:Date.now().toString(), ts:new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}), loanType, amount:LA, rate:effRate, years:Y, rateType, monthly, totalInt }
          const updated=[entry,...h].slice(0,5)
          return updated
        })
      },800)
    }
  },[loanType,borrower,LA,Y,rateType,effRate,monthly,totalInt,PV])

  // Chart data
  const amortChart = useMemo(()=>{
    const out=[]
    for(let y=1;y<=Math.min(Y,30);y++){
      const rows=amort.slice((y-1)*12,y*12)
      out.push({ year:`${y}`, Κεφάλαιο:Math.round(rows.reduce((s,r)=>s+r.principal,0)), Τόκοι:Math.round(rows.reduce((s,r)=>s+r.interest,0)) })
    }
    return out
  },[amort,Y])

  const scenChart = useMemo(()=>scenarios.map(s=>({ name:s.label, Τόκοι:Math.round(calcMonthly(s.amount,s.rate,s.years)*s.years*12-s.amount) })),[scenarios])

  const extraSav = useMemo(()=>{
    if(EP<=0)return null
    let bal=LA,months=0,ti=0,m=monthly+EP
    while(bal>0&&months<Y*12){const int=bal*(effRate/100/12);ti+=int;bal=bal*(1+effRate/100/12)-m;months++}
    return{savedMonths:Y*12-months,savedInt:Math.max(0,totalInt-ti)}
  },[LA,effRate,Y,EP,monthly,totalInt])

  const maxLoan = useMemo(()=>{
    const maxM=INC*BORROWER_PROFILES[borrower].income_ratio
    const r=effRate/100/12,n=Y*12
    return r>0?maxM*(Math.pow(1+r,n)-1)/(r*Math.pow(1+r,n)):maxM*n
  },[INC,borrower,effRate,Y])

  // Fixed vs Variable comparison
  const fixedRate    = effRate
  const variableRate = market.euribor_3m+R
  const fixedMonthly = calcMonthly(LA,fixedRate,Y)
  const varMonthly   = calcMonthly(LA,variableRate,Y)
  const fvChartData  = useMemo(()=>{
    const years5=[1,2,3,4,5,6,7,8,9,10,15,20,25,30].filter(y=>y<=Y)
    return years5.map(yr=>{
      // fixed stays same, variable assumes Euribor stays current
      const fM=calcMonthly(LA,fixedRate,Y)
      const vM=calcMonthly(LA,variableRate,Y)
      return{
        year:`${yr}χρ`,
        Σταθερό:Math.round(fM*yr*12-LA*(yr/Y)),
        Κυμαινόμενο:Math.round(vM*yr*12-LA*(yr/Y)),
      }
    })
  },[LA,fixedRate,variableRate,Y])

  const fmaEx   = calcFmaExemption(marital,CH)
  const fmaOwed = loanType==='first_home'&&PV<=fmaEx ? 0 : PV*TAX_DATA.fma_rate
  const renInc  = loanType==='investment' ? monthly*12*0.8 : 0
  const renTax  = calcRentalTax(renInc*(1-TAX_DATA.rental_expense_deduction))
  const spitiR  = Math.max(market.euribor_3m*0.5+0.3,1.0)
  const spitiM  = calcMonthly(LA,spitiR,Y)
  const spitiSv = (monthly-spitiM)*Y*12

  const currM   = calcMonthly(RB,effRate,RY)
  const newM    = calcMonthly(RB,NR,RY)
  const mSav    = currM-newM
  const refSav  = mSav*RY*12-XC
  const brkEven = mSav>0?Math.ceil(XC/mSav):null

  const stress = [
    {label:'Τρέχον', rate:effRate},
    {label:'+0.5%',  rate:effRate+0.5},
    {label:'+1%',    rate:effRate+1},
    {label:'+2%',    rate:effRate+2},
    {label:'+3%',    rate:effRate+3},
    {label:'6%',     rate:6},
  ].map(s=>({...s,monthly:calcMonthly(LA,s.rate,Y)}))

  const bankName = bankId==='custom'?customBank:BANKS.find(b=>b.id===bankId)?.name||''

  // Apply preset
  function applyPreset(p:typeof PRESETS[0]){
    setLoanAmount(p.values.loanAmount)
    setPropValue(p.values.propValue)
    setRate(p.values.rate)
    setYears(p.values.years)
    setRateType(p.values.rateType)
    setLoanType(p.values.loanType)
    setBorrower(p.values.borrower)
    setFixedPeriod(p.values.fixedPeriod)
    setActivePreset(p.id)
  }

  function addScen(){setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:LA,rate:effRate,years:Y,rateType}])}
  function updScen(id:string,f:string,v:any){setScenarios(s=>s.map(x=>x.id===id?{...x,[f]:v}:x))}
  function delScen(id:string){setScenarios(s=>s.filter(x=>x.id!==id))}
  function applyScen(s:LoanScenario){
    setLoanAmount(String(s.amount))
    setRate(String(s.rateType==='variable'?s.rate-market.euribor_3m:s.rate))
    setYears(String(s.years))
    setRateType(s.rateType)
    setActivePreset(null)
  }
  function applyHistory(h:CalcHistory){
    setLoanAmount(String(h.amount))
    setRate(String(h.rateType==='variable'?h.rate-market.euribor_3m:h.rate))
    setYears(String(h.years))
    setRateType(h.rateType)
    setLoanType(h.loanType)
    setActivePreset(null)
  }

  async function handleSave(){
    setSaving(true)
    await onSaveLoan({bank:bankName||'Μη καθορισμένη',loan_type:loanType,amount:LA,property_value:PV,rate:effRate,rate_type:rateType,years:Y,start_date:startDate,status:'active',notes})
    setSaving(false)
  }

  const btn = (clr:string,bg:string,border:string): React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:7, padding:'10px 18px',
    background:bg, border:`1px solid ${border}`, borderRadius:10,
    cursor:'pointer', color:clr, fontSize:12, fontFamily:'Inter,sans-serif', fontWeight:700,
    transition:'all 0.15s', whiteSpace:'nowrap' as const,
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Sticky summary bar ── */}
      <div style={{ position:'sticky', top:0, zIndex:50, background:'var(--bg-base)', borderBottom:'1px solid var(--border-subtle)', padding:'10px 0 10px', marginBottom:2 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {/* Live KPIs always visible */}
          {[
            {l:'Δόση/μήνα',v:fmtEur(monthly),c:'var(--accent)',big:true},
            {l:'Τόκοι',v:fmtEur(totalInt),c:'var(--negative)',big:false},
            {l:'Σύνολο',v:fmtEur(total),c:'var(--text-primary)',big:false},
            {l:'LTV',v:`${ltv.toFixed(1)}%`,c:ltv>80?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)',big:false},
          ].map(item=>(
            <div key={item.l} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
              <span style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{item.l}</span>
              <span style={{ fontSize:item.big?15:13, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700 }}>{item.v}</span>
            </div>
          ))}
          {/* Advisor sync indicator */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:advisorSync?'rgba(167,139,250,0.12)':'transparent', border:`1px solid ${advisorSync?'rgba(167,139,250,0.3)':'transparent'}`, borderRadius:7, transition:'all 0.3s' }}>
            <Zap size={11} color={advisorSync?'#a78bfa':'var(--border-default)'}/>
            <span style={{ fontSize:10, color:advisorSync?'#a78bfa':'var(--border-default)', fontWeight:600, transition:'color 0.3s' }}>
              {advisorSync?'Advisor ενημερώθηκε':'Advisor'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Quick Presets ── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
        {dot('Γρήγορα Προφίλ', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>Επιλέξτε για αυτόματη συμπλήρωση</span>)}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>applyPreset(p)} style={{ padding:'12px 14px', background:activePreset===p.id?p.color:'var(--bg-surface)', border:`1px solid ${activePreset===p.id?p.border:'var(--border-subtle)'}`, borderRadius:10, cursor:'pointer', textAlign:'left' as const, transition:'all 0.2s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{p.emoji}</span>
                <p style={{ fontSize:12, color:activePreset===p.id?p.textColor:'var(--text-primary)', fontWeight:700 }}>{p.label}</p>
                {activePreset===p.id&&<Check size={12} color={p.textColor}/>}
              </div>
              <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.4 }}>{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Loan type + Borrower ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Σκοπός Δανείου')}
          <CustomSelect value={loanType} onChange={v=>{setLoanType(v as LoanType);setActivePreset(null)}} options={LOAN_TYPE_OPTIONS} placeholder="Επιλέξτε σκοπό..."/>
          <div style={{ marginTop:10, padding:'9px 12px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8 }}>
            <p style={{ fontSize:11, color:'var(--accent)', lineHeight:1.5 }}>⚖️ {LOAN_TYPES[loanType].tax_note}</p>
          </div>
          <div style={{ marginTop:8, padding:'8px 12px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>📋 {LOAN_TYPES[loanType].notes}</p>
          </div>
        </div>
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Τύπος Δανειολήπτη')}
          <CustomSelect value={borrower} onChange={v=>{setBorrower(v as BorrowerType);setActivePreset(null)}} options={BORROWER_OPTIONS} placeholder="Επιλέξτε τύπο..."/>
          <div style={{ marginTop:10, padding:'9px 12px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>💡 {BORROWER_PROFILES[borrower].tax_benefits}</p>
          </div>
          {BORROWER_PROFILES[borrower].special&&(
            <div style={{ marginTop:6, padding:'7px 12px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:8 }}>
              <p style={{ fontSize:11, color:'var(--positive)' }}>⭐ {BORROWER_PROFILES[borrower].special}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Main inputs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Στοιχεία Δανείου')}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <NumberInput label="Αξία Ακινήτου" value={propValue} onChange={v=>{setPropValue(v);setActivePreset(null)}} suffix="€"/>
            <div>
              <NumberInput label="Ποσό Δανείου" value={loanAmount} onChange={v=>{setLoanAmount(v);setActivePreset(null)}} suffix="€"/>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                <span style={{ fontSize:11, color:ltv>90?'var(--negative)':ltv>80?'var(--warning)':'var(--positive)', fontWeight:600 }}>
                  LTV {ltv.toFixed(1)}% — {ltv>90?'Πολύ υψηλό':ltv>80?'Υψηλό':'Εντός ορίου'}
                </span>
                <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>Ίδια κεφάλαια: {fmtEur(PV-LA)}</span>
              </div>
            </div>
            <NumberInput label="Διάρκεια (χρόνια)" value={years} onChange={v=>{setYears(v);setActivePreset(null)}} suffix="χρ" min={3} max={35}/>
            <DatePicker label="Ημερομηνία Έναρξης Δανείου" value={startDate} onChange={setStartDate}/>
            <div>
              <CustomSelect label="Τράπεζα" value={bankId} onChange={setBankId} options={BANK_OPTIONS} placeholder="— Επιλέξτε τράπεζα —"/>
              {bankId==='custom'&&<div style={{ marginTop:8 }}><TextInput label="Όνομα τράπεζας" value={customBank} onChange={setCustomBank} placeholder="π.χ. Παγκρήτια Τράπεζα"/></div>}
            </div>
            <Textarea label="Σημειώσεις" value={notes} onChange={setNotes} placeholder="π.χ. Alpha Bank — αίτηση 10/06/2026, περίοδος χάριτος 2 χρόνια..." rows={2}/>
          </div>
        </div>

        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Επιτόκιο & Παράμετροι')}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <CustomSelect label="Τύπος Επιτοκίου" value={rateType} onChange={v=>{setRateType(v as RateType);setActivePreset(null)}} options={RATE_TYPE_OPTIONS}/>
            {(rateType==='fixed'||rateType==='mixed')&&(
              <CustomSelect label="Διάρκεια Σταθερής Περιόδου" value={fixedPeriod} onChange={setFixedPeriod} options={FIXED_PERIOD_OPTIONS}/>
            )}
            <div>
              <NumberInput label={rateType==='variable'?'Spread Τράπεζας (%)':'Ετήσιο Επιτόκιο (%)'} value={rate} onChange={v=>{setRate(v);setActivePreset(null)}} suffix="%" step={0.05}/>
              {rateType==='variable'&&(
                <div style={{ marginTop:7, padding:'9px 12px', background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.18)', borderRadius:8 }}>
                  <p style={{ fontSize:11, fontFamily:'JetBrains Mono, monospace', color:'var(--info)' }}>
                    Euribor {fmtPct(market.euribor_3m)} + spread {fmtPct(R)} = <strong>{fmtPct(effRate)}</strong>
                  </p>
                  <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:3 }}>Ενημερώνεται αυτόματα κάθε πρωί από ECB</p>
                </div>
              )}
            </div>
            <div>
              <NumberInput label="Έκτακτη Μηνιαία Αποπληρωμή (€)" value={extraPay} onChange={setExtraPay} suffix="€" placeholder="0"/>
              {extraSav&&EP>0&&(
                <div style={{ marginTop:6, padding:'9px 12px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.18)', borderRadius:8 }}>
                  <p style={{ fontSize:11, color:'var(--positive)', fontWeight:600 }}>
                    Εξοικονομείτε {Math.round(extraSav.savedMonths/12)} χρόνια & {fmtEur(extraSav.savedInt)} τόκους
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        <KPI label="Μηνιαία Δόση" value={fmtEur(monthly)} color="var(--accent)"/>
        <KPI label="Σύνολο Τόκων" value={fmtEur(totalInt)} color="var(--negative)" sub={`${((totalInt/Math.max(LA,1))*100).toFixed(0)}% επί κεφαλαίου`}/>
        <KPI label="Συνολική Αποπληρωμή" value={fmtEur(total)} color="var(--text-primary)"/>
        <KPI label="LTV Δανείου" value={`${ltv.toFixed(1)}%`} color={ltv>80?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)'} sub={`Ίδια: ${fmtEur(PV-LA)}`}/>
      </div>

      {/* ── Actions ── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={handleSave} disabled={saving} style={btn('var(--accent)','var(--accent-dim)','var(--border-accent)')}>
          <Save size={13}/>{saving?'Αποθήκευση...':'Αποθήκευση Δανείου'}
        </button>
        <button onClick={()=>onSaveToCalendar(monthly,Y,startDate,bankName)} style={btn('var(--info)','rgba(96,165,250,0.08)','rgba(96,165,250,0.25)')}>
          <Calendar size={13}/>Δόσεις → Ημερολόγιο
        </button>
        <button onClick={()=>onSaveToExpenses(monthly,bankName)} style={btn('var(--positive)','rgba(52,211,153,0.08)','rgba(52,211,153,0.25)')}>
          <ArrowRight size={13}/>Δόση → Δαπάνες
        </button>
        <button onClick={addScen} style={btn('#a78bfa','rgba(167,139,250,0.08)','rgba(167,139,250,0.25)')}>
          <Plus size={13}/>Προσθήκη Σεναρίου
        </button>
      </div>

      {/* ── History ── */}
      {history.length>0&&(
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:14 }}>
          {dot('Ιστορικό Υπολογισμών', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>Τελευταίοι 5 — κλικ για επαναφορά</span>)}
          <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
            {history.map((h,i)=>(
              <button key={h.id} onClick={()=>applyHistory(h)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:i===0?'var(--bg-surface)':'transparent', border:'1px solid var(--border-subtle)', borderRadius:8, cursor:'pointer', textAlign:'left' as const }}>
                <Clock size={10} color="var(--text-tertiary)"/>
                <div>
                  <p style={{ fontSize:11, color:'var(--text-primary)', fontWeight:600 }}>{fmtEur(h.monthly)}/μήνα</p>
                  <p style={{ fontSize:9, color:'var(--text-tertiary)' }}>{fmtEur(h.amount)} · {fmtPct(h.rate)} · {h.years}χρ · {h.ts}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Scenarios ── */}
      {scenarios.length>0&&(
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Σύγκριση Σεναρίων', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>Κλικ ✏️ για επεξεργασία · ↩ για εφαρμογή</span>)}
          <div style={{ overflowX:'auto', marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                  {['Σενάριο','Ποσό','Επιτόκιο','Χρόνια','Δόση/μήνα','Σύν. Τόκοι','Διαφορά',''].map(h=>(
                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s=>{
                  const m=calcMonthly(s.amount,s.rate,s.years)
                  const ti=m*s.years*12-s.amount
                  const saved=totalInt-ti
                  const isBest=scenarios.length>1&&saved===Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return totalInt-(mx*x.years*12-x.amount)}))
                  const isEd=editingId===s.id
                  const cellInput=(v:string,f:string,w:number)=>(
                    <input value={v} onChange={e=>updScen(s.id,f,f==='label'?e.target.value:Number(e.target.value))} style={{ background:'var(--bg-base)', border:'1px solid var(--accent)', borderRadius:6, padding:'5px 8px', color:'var(--text-primary)', fontSize:12, outline:'none', width:w }} type={f==='label'?'text':'number'} step={f==='rate'?0.05:1}/>
                  )
                  return (
                    <tr key={s.id} style={{ borderBottom:'1px solid var(--border-subtle)', background:isBest?'rgba(52,211,153,0.04)':'transparent' }}>
                      <td style={{ padding:'9px 10px' }}>
                        {isEd?cellInput(s.label,'label',120):
                          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{s.label}</span>
                            {isBest&&<span style={{ fontSize:9, padding:'2px 7px', borderRadius:4, background:'rgba(52,211,153,0.12)', color:'var(--positive)', border:'1px solid rgba(52,211,153,0.2)', fontWeight:700 }}>ΒΕΛΤΙΣΤΟ</span>}
                          </div>}
                      </td>
                      <td style={{ padding:'9px 10px' }}>
                        {isEd?cellInput(String(s.amount),'amount',90):<span style={{ fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:600 }}>{fmtEur(s.amount)}</span>}
                      </td>
                      <td style={{ padding:'9px 10px' }}>
                        {isEd?cellInput(String(s.rate),'rate',65):<span style={{ fontFamily:'JetBrains Mono, monospace', color:'var(--info)' }}>{fmtPct(s.rate)}</span>}
                      </td>
                      <td style={{ padding:'9px 10px' }}>
                        {isEd?cellInput(String(s.years),'years',55):<span style={{ color:'var(--text-secondary)' }}>{s.years} χρόνια</span>}
                      </td>
                      <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', color:'var(--positive)', fontWeight:600 }}>{fmtEur(m)}</td>
                      <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', color:'var(--negative)' }}>{fmtEur(ti)}</td>
                      <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', color:saved>0?'var(--positive)':'var(--negative)', fontWeight:600 }}>{saved>0?`-${fmtEur(saved)}`:`+${fmtEur(-saved)}`}</td>
                      <td style={{ padding:'9px 10px' }}>
                        <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                          {isEd
                            ?<button onClick={()=>setEditingId(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--positive)', display:'flex', padding:4 }} title="Αποθήκευση"><Check size={14}/></button>
                            :<>
                              <button onClick={()=>setEditingId(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', display:'flex', padding:4 }} title="Επεξεργασία"><Edit2 size={12}/></button>
                              <button onClick={()=>applyScen(s)} style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:5, cursor:'pointer', color:'var(--accent)', display:'flex', alignItems:'center', gap:3, padding:'3px 7px', fontSize:10, fontWeight:700 }} title="Εφάρμοσε στον Calculator">
                                <RefreshCw size={10}/>Εφαρμογή
                              </button>
                            </>
                          }
                          <button onClick={()=>delScen(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--border-default)', display:'flex', padding:4 }} title="Διαγραφή"><Trash2 size={12}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Scenarios chart */}
          {scenChart.length>0&&(
            <>
              <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Σύγκριση Συνολικών Τόκων</p>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={scenChart} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize:10, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="Τόκοι" fill="rgba(248,113,113,0.6)" radius={[5,5,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}

      {/* ── Collapsibles ── */}

      <Section title="Γράφημα Αποπληρωμής" sub="Κεφάλαιο έναντι τόκων ανά έτος" defaultOpen>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={amortChart} barCategoryGap="12%">
            <XAxis dataKey="year" tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={<ChartTip/>}/>
            <Legend wrapperStyle={{ fontSize:11, color:'var(--text-secondary)' }}/>
            <Bar dataKey="Κεφάλαιο" stackId="a" fill="rgba(52,211,153,0.55)"/>
            <Bar dataKey="Τόκοι"    stackId="a" fill="rgba(248,113,113,0.5)" radius={[5,5,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Σταθερό vs Κυμαινόμενο — Σύγκριση" sub="Real-time ανάλυση κινδύνου και κόστους" badge="NEW">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          {[
            {
              label:'Σταθερό Επιτόκιο',
              rate:rateType==='variable'?effRate:effRate,
              monthly:fixedMonthly,
              totalInt:fixedMonthly*Y*12-LA,
              pros:['Προβλεψιμότητα — ξέρεις πάντα τη δόση','Προστασία από άνοδο Euribor','Ιδανικό για μακροπρόθεσμο σχεδιασμό'],
              cons:['Συνήθως υψηλότερο αρχικό επιτόκιο','Ποινή πρόωρης αποπληρωμής'],
              color:'var(--positive)', bg:'rgba(52,211,153,0.04)', border:'rgba(52,211,153,0.15)',
            },
            {
              label:'Κυμαινόμενο Επιτόκιο',
              rate:market.euribor_3m+R,
              monthly:varMonthly,
              totalInt:varMonthly*Y*12-LA,
              pros:['Σήμερα χαμηλότερο επιτόκιο','Χωρίς ποινή πρόωρης αποπληρωμής','Ωφελείσαι αν Euribor συνεχίσει να πέφτει'],
              cons:['Κίνδυνος ανόδου Euribor','Αβεβαιότητα στη δόση κάθε μήνα'],
              color:'var(--info)', bg:'rgba(96,165,250,0.04)', border:'rgba(96,165,250,0.15)',
            },
          ].map(item=>(
            <div key={item.label} style={{ background:item.bg, border:`1px solid ${item.border}`, borderRadius:10, padding:14 }}>
              <p style={{ fontSize:12, color:item.color, fontWeight:700, marginBottom:10 }}>{item.label}</p>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <div><p style={{ fontSize:9, color:'var(--text-tertiary)', marginBottom:2 }}>Επιτόκιο</p><p style={{ fontSize:16, fontFamily:'JetBrains Mono, monospace', color:item.color, fontWeight:700 }}>{fmtPct(item.rate)}</p></div>
                <div><p style={{ fontSize:9, color:'var(--text-tertiary)', marginBottom:2 }}>Δόση/μήνα</p><p style={{ fontSize:16, fontFamily:'JetBrains Mono, monospace', color:item.color, fontWeight:700 }}>{fmtEur(item.monthly)}</p></div>
                <div><p style={{ fontSize:9, color:'var(--text-tertiary)', marginBottom:2 }}>Σύν. Τόκοι</p><p style={{ fontSize:14, fontFamily:'JetBrains Mono, monospace', color:item.color, fontWeight:700 }}>{fmtEur(item.totalInt)}</p></div>
              </div>
              <div style={{ marginBottom:6 }}>
                {item.pros.map((p,i)=><div key={i} style={{ display:'flex', gap:6, marginBottom:3 }}><span style={{ color:'var(--positive)', flexShrink:0, marginTop:1 }}>✓</span><p style={{ fontSize:10, color:'var(--text-secondary)', lineHeight:1.4 }}>{p}</p></div>)}
              </div>
              {item.cons.map((c,i)=><div key={i} style={{ display:'flex', gap:6, marginBottom:3 }}><span style={{ color:'var(--negative)', flexShrink:0, marginTop:1 }}>✗</span><p style={{ fontSize:10, color:'var(--text-secondary)', lineHeight:1.4 }}>{c}</p></div>)}
            </div>
          ))}
        </div>
        {/* Side-by-side interest comparison chart */}
        <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Σωρευτικοί Τόκοι ανά Έτος (με σταθερό Euribor)</p>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={fvChartData}>
            <XAxis dataKey="year" tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={<ChartTip/>}/>
            <Legend wrapperStyle={{ fontSize:11, color:'var(--text-secondary)' }}/>
            <Line type="monotone" dataKey="Σταθερό"      stroke="rgba(52,211,153,0.8)"  strokeWidth={2} dot={false}/>
            <Line type="monotone" dataKey="Κυμαινόμενο" stroke="rgba(96,165,250,0.8)"  strokeWidth={2} dot={false} strokeDasharray="4 2"/>
          </LineChart>
        </ResponsiveContainer>
        <div style={{ marginTop:10, padding:'9px 12px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
          <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.6 }}>
            ⓘ Η σύγκριση κυμαινόμενου βασίζεται στο τρέχον Euribor {fmtPct(market.euribor_3m)}. Αλλαγές στο Euribor θα επηρεάσουν σημαντικά το κόστος. Χρησιμοποιήστε το Stress Test για σενάρια ανόδου.
          </p>
        </div>
      </Section>

      <Section title="Σπίτι μου ΙΙ vs Κανονικό Δάνειο" sub="Εκτίμηση εξοικονόμησης — deadline συμβασιοποίησης: 31/08/2026">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          {[
            {label:'🏠 Σπίτι μου ΙΙ (εκτίμηση)', rate:spitiR, m:spitiM, ti:spitiM*Y*12-LA, c:'var(--positive)', bg:'rgba(52,211,153,0.04)', border:'rgba(52,211,153,0.15)'},
            {label:'📊 Κανονικό Δάνειο Αγοράς',  rate:effRate, m:monthly,  ti:totalInt,        c:'var(--negative)', bg:'rgba(248,113,113,0.04)', border:'rgba(248,113,113,0.15)'},
          ].map(item=>(
            <div key={item.label} style={{ background:item.bg, border:`1px solid ${item.border}`, borderRadius:10, padding:14 }}>
              <p style={{ fontSize:12, color:item.c, fontWeight:700, marginBottom:12 }}>{item.label}</p>
              {[['Επιτόκιο',fmtPct(item.rate)],['Δόση/μήνα',fmtEur(item.m)],['Συνολικοί τόκοι',fmtEur(item.ti)],['Συνολική αποπληρωμή',fmtEur(item.m*Y*12)]].map(([k,v])=>(
                <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontSize:12, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:10, padding:'14px 18px', textAlign:'center' as const }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:4 }}>Εκτιμώμενη συνολική εξοικονόμηση</p>
          <p style={{ fontSize:32, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700, lineHeight:1 }}>{fmtEur(spitiSv)}</p>
          <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:6 }}>= {fmtEur(spitiSv/Math.max(Y*12,1))}/μήνα εξοικονόμηση στη δόση</p>
        </div>
        <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:10, lineHeight:1.6 }}>
          ⓘ Εκτίμηση βάσει μέσου επιδοτούμενου επιτοκίου. Ισχύει για ηλικίες 25-50, πρώτη κατοικία, εισόδημα ≤40.000€, αξία ≤250.000€. →{' '}
          <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>greece20.gov.gr</a>
        </p>
      </Section>

      <Section title="Δανειοληπτική Ικανότητα & DTI" sub="Μέγιστο δάνειο και Debt-to-Income ratio">
        <div style={{ marginBottom:12 }}>
          <NumberInput label="Μηνιαίο Καθαρό Εισόδημα (€)" value={income} onChange={setIncome} suffix="€"/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          <KPI label="Μέγιστη δόση/μήνα" value={fmtEur(INC*BORROWER_PROFILES[borrower].income_ratio)} color="var(--accent)" sub={`${(BORROWER_PROFILES[borrower].income_ratio*100).toFixed(0)}% εισοδήματος`}/>
          <KPI label="Μέγιστο δάνειο" value={fmtEur(maxLoan)} color={maxLoan>=LA?'var(--positive)':'var(--negative)'}/>
          <KPI label="DTI Ratio" value={monthly>0?fmtPct1((monthly/INC)*100):'—'} color={(monthly/INC)>0.4?'var(--negative)':(monthly/INC)>0.35?'var(--warning)':'var(--positive)'} sub="Δόση / Εισόδημα"/>
        </div>
        {maxLoan<LA&&<div style={{ marginTop:10, padding:'10px 14px', background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:8 }}><p style={{ fontSize:12, color:'var(--negative)' }}>⚠ Υπέρβαση κατά {fmtEur(LA-maxLoan)} — μειώστε ποσό ή αυξήστε διάρκεια</p></div>}
      </Section>

      <Section title="Φορολογική Ανάλυση" sub="Φόρος Μεταβίβασης, απαλλαγές & κλίμακα ενοικίων — ΑΑΔΕ 2026">
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
            <p style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, fontWeight:600 }}>Φόρος Μεταβίβασης Ακινήτων (ΦΜΑ 3%)</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <CustomSelect label="Οικογενειακή Κατάσταση" value={marital} onChange={v=>setMarital(v as any)} options={MARITAL_OPTIONS}/>
              <CustomSelect label="Αριθμός Εξαρτώμενων Τέκνων" value={children} onChange={setChildren} options={CHILDREN_OPTIONS}/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
              <KPI label="Όριο απαλλαγής ΦΜΑ" value={fmtEur(fmaEx)} color="var(--positive)" sub="Βάσει ΑΑΔΕ 2026"/>
              <KPI label="ΦΜΑ που αναλογεί" value={fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed)} color={fmaOwed===0?'var(--positive)':'var(--negative)'} sub={fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας'}/>
              <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color={PV<=fmaEx?'var(--positive)':'var(--warning)'} sub={PV<=fmaEx?'Εντός ορίου':'Εκτός ορίου'}/>
            </div>
            {loanType==='first_home'&&PV<=fmaEx&&<div style={{ padding:'10px 14px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.18)', borderRadius:8 }}><p style={{ fontSize:12, color:'var(--positive)', fontWeight:600 }}>✓ Δικαιούστε πλήρη απαλλαγή ΦΜΑ — εξοικονόμηση {fmtEur(PV*0.03)}</p></div>}
            {loanType!=='first_home'&&<div style={{ padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8 }}><p style={{ fontSize:11, color:'var(--text-secondary)' }}>ℹ️ Η απαλλαγή ΦΜΑ ισχύει εάν πρόκειται για πρώτη κατοικία — επιλέξτε "Πρώτη κατοικία" ως σκοπό δανείου.</p></div>}
          </div>
          {loanType==='investment'&&(
            <div style={{ padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
              <p style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, fontWeight:600 }}>Φορολόγηση Εισοδήματος από Ενοίκια 2026</p>
              {TAX_DATA.rental_tax.map((b,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8, marginBottom:5 }}>
                  <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{b.label}</span>
                  <span style={{ fontSize:14, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700 }}>{(b.rate*100).toFixed(0)}%</span>
                </div>
              ))}
              <div style={{ marginTop:10, padding:'9px 12px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8 }}>
                <p style={{ fontSize:11, color:'var(--accent)' }}>Αυτόματη έκπτωση 5% · Εκτιμώμενος φόρος: {fmtEur(renTax)}/χρόνο</p>
              </div>
            </div>
          )}
          <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.6 }}>ⓘ Βάσει ΑΑΔΕ & Ν.4172/2013. Τόκοι δεν εκπίπτουν για δάνεια μετά το 2013. → <a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>aade.gr</a></p>
        </div>
      </Section>

      <Section title="Stress Test Επιτοκίου" sub="Αντοχή δόσης σε σενάρια ανόδου Euribor — κρίσιμο για κυμαινόμενα δάνεια">
        <div style={{ marginBottom:16 }}>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={stress.map(s=>({ name:s.label, Δόση:Math.round(s.monthly) }))} barCategoryGap="22%">
              <XAxis dataKey="name" tick={{ fontSize:10, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
              <Tooltip content={<ChartTip/>}/>
              <ReferenceLine y={INC*BORROWER_PROFILES[borrower].income_ratio} stroke="var(--warning)" strokeDasharray="4 4" label={{ value:'Όριο DTI 35%', fill:'var(--warning)', fontSize:9 }}/>
              <Bar dataKey="Δόση" fill="var(--accent)" radius={[5,5,0,0]} opacity={0.75}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>{['Σενάριο','Επιτόκιο','Δόση/μήνα','Αύξηση/μήνα','DTI'].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', fontWeight:600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {stress.map((s,i)=>{
              const diff=s.monthly-stress[0].monthly
              const dti=(s.monthly/INC)*100
              return <tr key={i} style={{ borderBottom:'1px solid var(--border-subtle)', background:i===0?'var(--accent-dim)':'transparent' }}>
                <td style={{ padding:'8px 10px', color:i===0?'var(--accent)':'var(--text-primary)', fontWeight:i===0?700:400 }}>{s.label}</td>
                <td style={{ padding:'8px 10px', fontFamily:'JetBrains Mono, monospace', color:'var(--info)' }}>{fmtPct(s.rate)}</td>
                <td style={{ padding:'8px 10px', fontFamily:'JetBrains Mono, monospace', color:i===0?'var(--accent)':diff>500?'var(--negative)':diff>250?'var(--warning)':'var(--text-primary)', fontWeight:600 }}>{fmtEur(s.monthly)}</td>
                <td style={{ padding:'8px 10px', fontFamily:'JetBrains Mono, monospace', color:i===0?'var(--text-tertiary)':'var(--negative)' }}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                <td style={{ padding:'8px 10px', fontFamily:'JetBrains Mono, monospace', color:dti>40?'var(--negative)':dti>35?'var(--warning)':'var(--positive)', fontWeight:600 }}>{fmtPct1(dti)}</td>
              </tr>
            })}
          </tbody>
        </table>
        {rateType==='fixed'&&<div style={{ marginTop:10, padding:'9px 12px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.18)', borderRadius:8 }}><p style={{ fontSize:12, color:'var(--positive)', fontWeight:600 }}>✓ Σταθερό {fixedPeriod} χρόνια — προστατευμένοι από ανατιμήσεις Euribor για αυτή την περίοδο</p></div>}
      </Section>

      <Section title="Ανάλυση Αναχρηματοδότησης" sub="Break-even — πότε αξίζει η μεταφορά σε άλλη τράπεζα">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
          <NumberInput label="Υπόλοιπο Κεφαλαίου (€)" value={remBal} onChange={setRemBal} suffix="€"/>
          <NumberInput label="Χρόνια που Απομένουν" value={remYears} onChange={setRemYears} suffix="χρ"/>
          <NumberInput label="Νέο Επιτόκιο (%)" value={newRate} onChange={setNewRate} suffix="%" step={0.05}/>
          <NumberInput label="Κόστος Μεταφοράς (€)" value={xferCost} onChange={setXferCost} suffix="€"/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          <KPI label="Τρέχουσα Δόση" value={fmtEur(currM)} color="var(--negative)"/>
          <KPI label="Νέα Δόση" value={fmtEur(newM)} color="var(--positive)" sub={`Εξοικ. ${fmtEur(mSav)}/μήνα`}/>
          <KPI label="Καθαρή Εξοικονόμηση" value={fmtEur(Math.max(0,refSav))} color={refSav>0?'var(--accent)':'var(--negative)'} sub={refSav>0?'Αξίζει η μεταφορά':'Δεν συμφέρει ακόμα'}/>
          <KPI label="Break-even" value={brkEven?`${brkEven} μήνες`:'—'} color={brkEven&&brkEven<24?'var(--positive)':brkEven&&brkEven<48?'var(--warning)':'var(--negative)'} sub="Μήνες για απόσβεση"/>
        </div>
      </Section>

      <Section title="Πίνακας Αποπληρωμής" sub={`${Y*12} δόσεις — κατανομή κεφαλαίου και τόκων`}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>{['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Σύν. Τόκοι'].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:'right', fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', fontWeight:600 }}>{h}</th>)}</tr></thead>
            <tbody>
              {amort.slice(0,24).map(row=>(
                <tr key={row.month} style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'var(--text-tertiary)', fontFamily:'JetBrains Mono, monospace' }}>{row.month}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'var(--accent)', fontFamily:'JetBrains Mono, monospace', fontWeight:600 }}>{fmtEur(row.payment)}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'var(--positive)', fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.principal)}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'var(--negative)', fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.interest)}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'var(--text-primary)', fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.balance)}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:'var(--text-secondary)', fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.totalInterestPaid)}</td>
                </tr>
              ))}
              {amort.length>24&&<tr><td colSpan={6} style={{ padding:10, textAlign:'center', color:'var(--text-tertiary)', fontSize:11 }}>... {amort.length-24} ακόμα δόσεις</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Απαραίτητα Έγγραφα" sub={`Για δάνειο τύπου: ${LOAN_TYPES[loanType].label}`}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Γενικά Έγγραφα</p>
            {LOAN_TYPES[loanType].docs.map((d,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <FileText size={12} color="var(--accent)"/>
                <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{d}</span>
              </div>
            ))}
          </div>
          <div>
            <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Ανά Τύπο Δανειολήπτη</p>
            {borrower==='professional'&&['Φορολογικές δηλώσεις 2 ετών','Βεβαίωση επαγγελματικής δραστηριότητας'].map((d,i)=><div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12, color:'var(--text-secondary)' }}>{d}</span></div>)}
            {borrower==='company'&&['Καταστατικό εταιρείας','Ισολογισμοί 3 ετών','Απόφαση Διοικητικού Συμβουλίου'].map((d,i)=><div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12, color:'var(--text-secondary)' }}>{d}</span></div>)}
            {borrower==='military'&&['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση'].map((d,i)=><div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12, color:'var(--text-secondary)' }}>{d}</span></div>)}
            {borrower==='abroad'&&['Αποδεικτικό κατοικίας εξωτερικού','Εισοδήματα ξένης χώρας','Επίσημες μεταφράσεις'].map((d,i)=><div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12, color:'var(--text-secondary)' }}>{d}</span></div>)}
            {!['professional','company','military','abroad'].includes(borrower)&&<p style={{ fontSize:12, color:'var(--text-secondary)' }}>Μισθοδοτικές 3 μηνών + Εκκαθαριστικό εισοδήματος</p>}
            <div style={{ marginTop:12, padding:'9px 12px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8 }}>
              <p style={{ fontSize:11, color:'var(--accent)' }}>💡 {BORROWER_PROFILES[borrower].tax_benefits}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Cost summary ── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
        {dot('Εκτιμώμενα Συνολικά Έξοδα Αγοράς')}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
          {[
            {label:'Φόρος Μεταβίβασης (ΦΜΑ)', value:fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed), sub:fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας', hi:fmaOwed===0},
            {label:'Συμβολαιογραφικά έξοδα', value:`${fmtEur(PV*0.01)} – ${fmtEur(PV*0.02)}`, sub:'1-2% αξίας ακινήτου'},
            {label:'Εγγραφή υποθήκης', value:fmtEur(LA*0.005), sub:'~0.5% ποσού δανείου'},
            {label:'Αμοιβή νομικού & τεχνικού', value:'300 – 750€', sub:'Ή δωρεάν από τράπεζα'},
            {label:'Ασφάλεια κατοικίας', value:'100 – 300€/έτος', sub:'Υποχρεωτική'},
            {label:'Ασφάλεια ζωής', value:`${fmtEur(LA*0.001)}/έτος`, sub:'Συχνά υποχρεωτική'},
            {label:'Συνολικά έξοδα (εκτίμηση)', value:`~${fmtEur(fmaOwed+PV*0.015+LA*0.005+500)}`, sub:'Εκτός μηνιαίων δόσεων', hi:true},
            {label:'Συνολική επένδυση', value:fmtEur(PV-LA+fmaOwed+PV*0.015+LA*0.005+500), sub:'Ίδια κεφάλαια + έξοδα', hi:true},
          ].map((item:any)=>(
            <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderRadius:9, background:item.hi?'var(--accent-dim)':'var(--bg-surface)', border:`1px solid ${item.hi?'var(--border-accent)':'var(--border-subtle)'}` }}>
              <div>
                <p style={{ fontSize:12, color:item.hi?'var(--accent)':'var(--text-primary)', fontWeight:item.hi?700:400 }}>{item.label}</p>
                <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:2 }}>{item.sub}</p>
              </div>
              <span style={{ fontSize:13, fontFamily:'JetBrains Mono, monospace', color:item.hi?'var(--accent)':'var(--info)', fontWeight:item.hi?700:400, marginLeft:12, whiteSpace:'nowrap' as const }}>{item.value}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:12, lineHeight:1.6 }}>
          ⓘ Εκτιμήσεις — τελικά ποσά καθορίζονται από συμβολαιογράφο και τράπεζα. →{' '}
          <a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>aade.gr</a>
        </p>
      </div>
    </div>
  )
}