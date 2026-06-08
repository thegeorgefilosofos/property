'use client'
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, ReferenceLine
} from 'recharts'
import {
  ChevronDown, ChevronUp, Save, Calendar, ArrowRight, Plus,
  Trash2, Edit2, Check, X, FileText, TrendingUp
} from 'lucide-react'
import {
  BANKS, LOAN_TYPES, BORROWER_PROFILES, TAX_DATA,
  calcMonthly, calcAmortization, calcFmaExemption, calcRentalTax,
  fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, LoanScenario, MarketRates, SavedLoan
} from './TabLoanData'

// ─── Design tokens (matches app exactly) ─────────────────────────────────────
const C = {
  bg:      '#0a0a0f',
  card:    '#12121f',
  border:  '#1e1e2e',
  border2: '#242438',
  gold:    '#d4af42',
  goldDim: 'rgba(212,175,66,0.12)',
  goldBorder:'rgba(212,175,66,0.25)',
  red:     '#f87171',
  green:   '#34d399',
  blue:    '#60a5fa',
  purple:  '#a78bfa',
  orange:  '#fb923c',
  muted:   '#5a5a70',
  muted2:  '#4a4a60',
  text:    '#e2e2f0',
  textDim: '#9090a8',
}

const inp: React.CSSProperties = {
  width:'100%', background:'#08080d', border:`1px solid ${C.border2}`,
  borderRadius:6, padding:'8px 10px', color:C.text,
  fontSize:13, fontFamily:'JetBrains Mono, monospace', outline:'none', boxSizing:'border-box'
}
const lbl: React.CSSProperties = {
  fontSize:9, fontFamily:'JetBrains Mono, monospace', color:C.muted,
  textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5
}
const sectionTitle = (label:string) => (
  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
    <span style={{width:6,height:6,borderRadius:'50%',background:C.gold,display:'inline-block'}}/>
    <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:C.muted,textTransform:'uppercase',letterSpacing:'0.1em'}}>{label}</p>
  </div>
)

function KPI({label,value,color=C.text,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
      <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:C.muted2,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</p>
      <p style={{fontSize:16,fontFamily:'JetBrains Mono, monospace',color,fontWeight:700}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:C.muted,marginTop:3}}>{sub}</p>}
    </div>
  )
}

function Collapsible({title,sub,children,defaultOpen=false}:{title:string;sub?:string;children:React.ReactNode;defaultOpen?:boolean}) {
  const [open,setOpen]=useState(defaultOpen)
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'none',border:'none',cursor:'pointer'}}>
        <div style={{textAlign:'left'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:5,height:5,borderRadius:'50%',background:open?C.gold:C.muted2,display:'inline-block',transition:'background 0.2s'}}/>
            <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:open?C.gold:C.text,textTransform:'uppercase',letterSpacing:'0.08em'}}>{title}</p>
          </div>
          {sub&&<p style={{fontSize:11,color:C.muted,marginTop:3,marginLeft:13}}>{sub}</p>}
        </div>
        {open?<ChevronUp size={14} color={C.muted}/>:<ChevronDown size={14} color={C.muted}/>}
      </button>
      {open&&<div style={{padding:'0 16px 16px'}}>{children}</div>}
    </div>
  )
}

// Custom recharts tooltip
function ChartTooltip({active,payload,label}:any) {
  if(!active||!payload?.length)return null
  return (
    <div style={{background:'#1a1a2e',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 14px',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
      <p style={{color:C.muted,marginBottom:6}}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <p key={i} style={{color:p.color,marginBottom:2}}>{p.name}: {fmtEur(p.value)}</p>
      ))}
    </div>
  )
}

interface Props {
  propertyId:string; userId:string; market:MarketRates
  onSaveLoan:(loan:Partial<SavedLoan>)=>Promise<void>
  onSaveToCalendar:(monthly:number,years:number,startDate:string,bankName:string)=>Promise<void>
  onSaveToExpenses:(monthly:number,bankName:string)=>Promise<void>
}

export default function TabLoanCalculator({propertyId,userId,market,onSaveLoan,onSaveToCalendar,onSaveToExpenses}:Props) {
  const [loanAmount,setLoanAmount]=useState(150000)
  const [propertyValue,setPropertyValue]=useState(200000)
  const [rate,setRate]=useState(3.50)
  const [years,setYears]=useState(25)
  const [rateType,setRateType]=useState<RateType>('fixed')
  const [loanType,setLoanType]=useState<LoanType>('purchase')
  const [borrowerType,setBorrowerType]=useState<BorrowerType>('individual')
  const [startDate,setStartDate]=useState(new Date().toISOString().split('T')[0])
  const [fixedPeriod,setFixedPeriod]=useState<'3'|'5'|'10'|'15'|'20'>('5')
  const [selectedBankId,setSelectedBankId]=useState('')
  const [customBankName,setCustomBankName]=useState('')
  const [showCustomBank,setShowCustomBank]=useState(false)
  const [loanNotes,setLoanNotes]=useState('')
  const [extraPayment,setExtraPayment]=useState(0)
  const [monthlyIncome,setMonthlyIncome]=useState(2000)
  const [maritalStatus,setMaritalStatus]=useState<'single'|'married'>('single')
  const [children,setChildren]=useState(0)
  const [scenarios,setScenarios]=useState<LoanScenario[]>([])
  const [editingId,setEditingId]=useState<string|null>(null)
  const [remBalance,setRemBalance]=useState(100000)
  const [remYears,setRemYears]=useState(20)
  const [newRate,setNewRate]=useState(3.0)
  const [transferCost,setTransferCost]=useState(2000)
  const [saving,setSaving]=useState(false)

  const effectiveRate=rateType==='variable'?market.euribor_3m+rate:rate
  const monthly=calcMonthly(loanAmount,effectiveRate,years)
  const totalPayment=monthly*years*12
  const totalInterest=totalPayment-loanAmount
  const ltv=propertyValue>0?(loanAmount/propertyValue)*100:0
  const amortization=useMemo(()=>calcAmortization(loanAmount,effectiveRate,years),[loanAmount,effectiveRate,years])

  // Annual chart data for recharts
  const amortChartData=useMemo(()=>{
    const out=[]
    for(let y=1;y<=Math.min(years,30);y++){
      const rows=amortization.slice((y-1)*12,y*12)
      out.push({
        year:`${y}`,
        Κεφάλαιο:Math.round(rows.reduce((s,r)=>s+r.principal,0)),
        Τόκοι:Math.round(rows.reduce((s,r)=>s+r.interest,0)),
      })
    }
    return out
  },[amortization,years])

  // Scenarios bar chart
  const scenariosChartData=useMemo(()=>scenarios.map(s=>{
    const m=calcMonthly(s.amount,s.rate,s.years)
    return{name:s.label,Τόκοι:Math.round(m*s.years*12-s.amount),Δόση:Math.round(m)}
  }),[scenarios])

  const extraSavings=useMemo(()=>{
    if(extraPayment<=0)return null
    let bal=loanAmount,months=0,ti=0
    const m=monthly+extraPayment
    while(bal>0&&months<years*12){const int=bal*(effectiveRate/100/12);ti+=int;bal=bal*(1+effectiveRate/100/12)-m;months++}
    return{savedMonths:years*12-months,savedInterest:Math.max(0,totalInterest-ti)}
  },[loanAmount,effectiveRate,years,extraPayment,monthly,totalInterest])

  const currMonthly=calcMonthly(remBalance,effectiveRate,remYears)
  const newMonthly=calcMonthly(remBalance,newRate,remYears)
  const monthlySaving=currMonthly-newMonthly
  const refinanceSaving=monthlySaving*remYears*12-transferCost
  const breakEvenMonths=monthlySaving>0?Math.ceil(transferCost/monthlySaving):null

  const maxLoanByIncome=useMemo(()=>{
    const maxM=monthlyIncome*BORROWER_PROFILES[borrowerType].income_ratio
    const r=effectiveRate/100/12,n=years*12
    return r>0?maxM*(Math.pow(1+r,n)-1)/(r*Math.pow(1+r,n)):maxM*n
  },[monthlyIncome,borrowerType,effectiveRate,years])

  const fmaExemption=calcFmaExemption(maritalStatus,children)
  const fmaOwed=loanType==='first_home'&&propertyValue<=fmaExemption?0:propertyValue*TAX_DATA.fma_rate
  const annualRentalIncome=loanType==='investment'?monthly*12*0.8:0
  const rentalTax=calcRentalTax(annualRentalIncome*(1-TAX_DATA.rental_expense_deduction))
  const spitiRate=Math.max(market.euribor_3m*0.5+0.3,1.0)
  const spitiMonthly=calcMonthly(loanAmount,spitiRate,years)
  const spitiSavings=(monthly-spitiMonthly)*years*12

  const stressTests=[
    {label:'Τρέχον',rate:effectiveRate},
    {label:'+0.5%',rate:effectiveRate+0.5},
    {label:'+1%',rate:effectiveRate+1},
    {label:'+2%',rate:effectiveRate+2},
    {label:'+3%',rate:effectiveRate+3},
    {label:'6%',rate:6},
  ].map(s=>({...s,monthly:calcMonthly(loanAmount,s.rate,years)}))

  const stressChartData=stressTests.map(s=>({
    name:s.label,
    Δόση:Math.round(s.monthly),
  }))

  const selectedBankName=selectedBankId==='custom'?customBankName:BANKS.find(b=>b.id===selectedBankId)?.name||''

  function addScenario(){
    setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:loanAmount,rate:effectiveRate,years,rateType}])
  }
  function updateScenario(id:string,field:string,val:any){setScenarios(s=>s.map(x=>x.id===id?{...x,[field]:val}:x))}
  function deleteScenario(id:string){setScenarios(s=>s.filter(x=>x.id!==id))}
  function applyScenario(s:LoanScenario){setLoanAmount(s.amount);setRate(s.rateType==='variable'?s.rate-market.euribor_3m:s.rate);setYears(s.years);setRateType(s.rateType)}

  async function handleSave(){setSaving(true);await onSaveLoan({bank:selectedBankName||'Μη καθορισμένη',loan_type:loanType,amount:loanAmount,property_value:propertyValue,rate:effectiveRate,rate_type:rateType,years,start_date:startDate,status:'active',notes:loanNotes});setSaving(false)}

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {/* Type selectors */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {/* Borrower */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
          {sectionTitle('Δανειολήπτης')}
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {(Object.entries(BORROWER_PROFILES) as [BorrowerType,any][]).map(([k,v])=>(
              <button key={k} onClick={()=>setBorrowerType(k)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:7,border:`1px solid ${borrowerType===k?C.goldBorder:C.border}`,background:borrowerType===k?C.goldDim:'transparent',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:borrowerType===k?C.gold:C.border2,flexShrink:0,transition:'background 0.15s'}}/>
                <div style={{flex:1}}>
                  <p style={{fontSize:12,color:borrowerType===k?C.gold:C.textDim,fontFamily:'JetBrains Mono, monospace'}}>{v.label}</p>
                  <p style={{fontSize:9,color:C.muted}}>{v.notes}</p>
                </div>
                {v.special&&borrowerType===k&&<span style={{fontSize:9,color:C.green,fontFamily:'JetBrains Mono, monospace',whiteSpace:'nowrap'}}>{v.special}</span>}
              </button>
            ))}
          </div>
        </div>
        {/* Loan type */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
          {sectionTitle('Σκοπός Δανείου')}
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {(Object.entries(LOAN_TYPES) as [LoanType,any][]).map(([k,v])=>(
              <button key={k} onClick={()=>setLoanType(k)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:7,border:`1px solid ${loanType===k?C.goldBorder:C.border}`,background:loanType===k?C.goldDim:'transparent',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:loanType===k?C.gold:C.border2,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <p style={{fontSize:12,color:loanType===k?C.gold:C.textDim,fontFamily:'JetBrains Mono, monospace'}}>{v.label}</p>
                  <p style={{fontSize:9,color:C.muted}}>{v.typical_rate} · LTV {v.typical_ltv}%</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tax note */}
      <div style={{background:'rgba(212,175,66,0.04)',border:`1px solid ${C.goldBorder}`,borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:14}}>⚖️</span>
        <p style={{fontSize:11,color:C.gold,fontFamily:'JetBrains Mono, monospace'}}>{LOAN_TYPES[loanType].tax_note}</p>
      </div>

      {/* Main inputs */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {/* Loan details */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
          {sectionTitle('Στοιχεία Δανείου')}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div><label style={lbl}>Αξία Ακινήτου (€)</label><input style={inp} type="number" value={propertyValue} onChange={e=>setPropertyValue(Number(e.target.value))}/></div>
            <div>
              <label style={lbl}>Ποσό Δανείου (€)</label>
              <input style={inp} type="number" value={loanAmount} onChange={e=>setLoanAmount(Number(e.target.value))}/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
                <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:ltv>90?C.red:ltv>80?C.orange:C.green}}>LTV {ltv.toFixed(1)}% {ltv>90?'⚠ Πολύ υψηλό':ltv>80?'⚠ Υψηλό':'✓ OK'}</span>
                <span style={{fontSize:10,color:C.muted,fontFamily:'JetBrains Mono, monospace'}}>Ίδια: {fmtEur(propertyValue-loanAmount)}</span>
              </div>
            </div>
            <div><label style={lbl}>Διάρκεια (χρόνια)</label><input style={inp} type="number" min={3} max={35} value={years} onChange={e=>setYears(Number(e.target.value))}/></div>
            <div><label style={lbl}>Ημ/νία Έναρξης</label><input type="date" style={inp} value={startDate} onChange={e=>setStartDate(e.target.value)}/></div>
            <div>
              <label style={lbl}>Τράπεζα</label>
              <select style={{...inp,appearance:'none' as any}} value={selectedBankId} onChange={e=>{setSelectedBankId(e.target.value);setShowCustomBank(e.target.value==='custom')}}>
                <option value="">— Επιλογή —</option>
                {BANKS.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="custom">Άλλη τράπεζα</option>
              </select>
              {showCustomBank&&<input style={{...inp,marginTop:6}} type="text" placeholder="π.χ. Παγκρήτια" value={customBankName} onChange={e=>setCustomBankName(e.target.value)}/>}
            </div>
          </div>
        </div>

        {/* Rate */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
          {sectionTitle('Επιτόκιο')}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div>
              <label style={lbl}>Τύπος</label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                {(['fixed','variable','mixed'] as RateType[]).map(rt=>(
                  <button key={rt} onClick={()=>setRateType(rt)} style={{padding:'8px 0',borderRadius:7,border:`1px solid ${rateType===rt?C.gold:C.border2}`,background:rateType===rt?C.goldDim:'transparent',color:rateType===rt?C.gold:C.muted,fontSize:11,fontFamily:'JetBrains Mono, monospace',cursor:'pointer',transition:'all 0.15s'}}>
                    {rt==='fixed'?'Σταθερό':rt==='variable'?'Κυμαινόμενο':'Μικτό'}
                  </button>
                ))}
              </div>
            </div>
            {(rateType==='fixed'||rateType==='mixed')&&(
              <div>
                <label style={lbl}>Διάρκεια σταθερού</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5}}>
                  {(['3','5','10','15','20'] as const).map(p=>(
                    <button key={p} onClick={()=>setFixedPeriod(p)} style={{padding:'7px 0',borderRadius:6,border:`1px solid ${fixedPeriod===p?C.gold:C.border2}`,background:fixedPeriod===p?C.goldDim:'transparent',color:fixedPeriod===p?C.gold:C.muted,fontSize:11,fontFamily:'JetBrains Mono, monospace',cursor:'pointer',transition:'all 0.15s'}}>
                      {p}χρ
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label style={lbl}>{rateType==='variable'?'Spread (%)':'Επιτόκιο (%)'}</label>
              <input style={inp} type="number" step={0.05} value={rate} onChange={e=>setRate(Number(e.target.value))}/>
              {rateType==='variable'&&(
                <div style={{marginTop:6,background:'rgba(96,165,250,0.05)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:6,padding:'8px 10px'}}>
                  <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:C.blue}}>Euribor {fmtPct(market.euribor_3m)} + {fmtPct(rate)} = <strong>{fmtPct(effectiveRate)}</strong></p>
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Έκτακτη μηνιαία πληρωμή (€)</label>
              <input style={inp} type="number" value={extraPayment} onChange={e=>setExtraPayment(Number(e.target.value))} placeholder="0"/>
              {extraSavings&&extraPayment>0&&(
                <div style={{marginTop:5,background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:6,padding:'8px 10px'}}>
                  <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:C.green}}>Εξοικονομείς {Math.round(extraSavings.savedMonths/12)} χρόνια & {fmtEur(extraSavings.savedInterest)} τόκους</p>
                </div>
              )}
            </div>
            <div><label style={lbl}>Σημειώσεις</label><textarea style={{...inp,resize:'vertical' as any,minHeight:50}} placeholder="π.χ. Alpha Bank, Σπίτι μου ΙΙ..." value={loanNotes} onChange={e=>setLoanNotes(e.target.value)}/></div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        <KPI label="Μηνιαία Δόση" value={fmtEur(monthly)} color={C.gold}/>
        <KPI label="Σύνολο Τόκων" value={fmtEur(totalInterest)} color={C.red} sub={`${((totalInterest/loanAmount)*100).toFixed(0)}% κεφαλαίου`}/>
        <KPI label="Συνολική Αποπληρωμή" value={fmtEur(totalPayment)} color={C.text}/>
        <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?C.red:ltv>70?C.orange:C.green} sub={`Ίδια: ${fmtEur(propertyValue-loanAmount)}`}/>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {[
          {label:saving?'Αποθήκευση...':'Αποθήκευση Δανείου',icon:<Save size={12}/>,color:C.gold,bg:'rgba(212,175,66,0.1)',border:'rgba(212,175,66,0.3)',action:handleSave},
          {label:'Δόσεις → Ημερολόγιο',icon:<Calendar size={12}/>,color:C.blue,bg:'rgba(96,165,250,0.1)',border:'rgba(96,165,250,0.3)',action:()=>onSaveToCalendar(monthly,years,startDate,selectedBankName)},
          {label:'Δόση → Δαπάνες',icon:<ArrowRight size={12}/>,color:C.green,bg:'rgba(52,211,153,0.1)',border:'rgba(52,211,153,0.3)',action:()=>onSaveToExpenses(monthly,selectedBankName)},
          {label:'+ Σενάριο',icon:<Plus size={12}/>,color:C.purple,bg:'rgba(167,139,250,0.1)',border:'rgba(167,139,250,0.3)',action:addScenario},
        ].map((btn,i)=>(
          <button key={i} onClick={btn.action} style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:btn.bg,border:`1px solid ${btn.border}`,borderRadius:8,cursor:'pointer',color:btn.color,fontSize:11,fontFamily:'JetBrains Mono, monospace',fontWeight:500}}>
            {btn.icon}{btn.label}
          </button>
        ))}
      </div>

      {/* Scenarios — editable + chart */}
      {scenarios.length>0&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
          {sectionTitle('Σύγκριση Σεναρίων')}
          <div style={{overflowX:'auto',marginBottom:20}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {['Σενάριο','Ποσό (€)','Επιτόκιο','Χρόνια','Δόση/μήνα','Σύν. Τόκοι','Διαφορά',''].map(h=>(
                    <th key={h} style={{padding:'6px 10px',textAlign:'left',fontSize:9,fontFamily:'JetBrains Mono, monospace',color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s=>{
                  const m=calcMonthly(s.amount,s.rate,s.years)
                  const ti=m*s.years*12-s.amount
                  const saved=totalInterest-ti
                  const isBest=saved===Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return totalInterest-(mx*x.years*12-x.amount)}))
                  const isEditing=editingId===s.id
                  return (
                    <tr key={s.id} style={{borderBottom:`1px solid ${C.border}`,background:isBest?'rgba(52,211,153,0.03)':'transparent'}}>
                      <td style={{padding:'8px 10px'}}>
                        {isEditing
                          ? <input style={{...inp,padding:'4px 8px',fontSize:11,width:110}} value={s.label} onChange={e=>updateScenario(s.id,'label',e.target.value)}/>
                          : <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontSize:12,color:C.text}}>{s.label}</span>
                              {isBest&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:3,background:'rgba(52,211,153,0.12)',color:C.green,border:'1px solid rgba(52,211,153,0.2)',fontFamily:'JetBrains Mono, monospace'}}>ΒΕΛΤΙΣΤΟ</span>}
                            </div>
                        }
                      </td>
                      <td style={{padding:'8px 10px'}}>
                        {isEditing?<input style={{...inp,padding:'4px 8px',fontSize:11,width:90}} type="number" value={s.amount} onChange={e=>updateScenario(s.id,'amount',Number(e.target.value))}/>
                          :<span style={{fontFamily:'JetBrains Mono, monospace',color:C.gold}}>{fmtEur(s.amount)}</span>}
                      </td>
                      <td style={{padding:'8px 10px'}}>
                        {isEditing?<input style={{...inp,padding:'4px 8px',fontSize:11,width:70}} type="number" step={0.05} value={s.rate} onChange={e=>updateScenario(s.id,'rate',Number(e.target.value))}/>
                          :<span style={{fontFamily:'JetBrains Mono, monospace',color:C.blue}}>{fmtPct(s.rate)}</span>}
                      </td>
                      <td style={{padding:'8px 10px'}}>
                        {isEditing?<input style={{...inp,padding:'4px 8px',fontSize:11,width:60}} type="number" value={s.years} onChange={e=>updateScenario(s.id,'years',Number(e.target.value))}/>
                          :<span style={{color:C.muted,fontFamily:'JetBrains Mono, monospace'}}>{s.years}χρ</span>}
                      </td>
                      <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:C.green}}>{fmtEur(m)}</td>
                      <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:C.red}}>{fmtEur(ti)}</td>
                      <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:saved>0?C.green:C.red}}>{saved>0?`-${fmtEur(saved)}`:`+${fmtEur(-saved)}`}</td>
                      <td style={{padding:'8px 10px'}}>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          {isEditing
                            ?<button onClick={()=>setEditingId(null)} style={{background:'none',border:'none',cursor:'pointer',color:C.green,display:'flex'}}><Check size={13}/></button>
                            :<><button onClick={()=>setEditingId(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:C.muted,display:'flex'}}><Edit2 size={12}/></button>
                              <button onClick={()=>applyScenario(s)} style={{background:'none',border:'none',cursor:'pointer',color:C.gold,display:'flex',fontSize:10,fontFamily:'JetBrains Mono, monospace'}}>↩</button></>
                          }
                          <button onClick={()=>deleteScenario(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:C.border2,display:'flex'}}><Trash2 size={11}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Scenarios chart — recharts */}
          <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Σύγκριση Συνολικών Τόκων</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={scenariosChartData} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{fontSize:10,fontFamily:'JetBrains Mono, monospace',fill:C.muted}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fontFamily:'JetBrains Mono, monospace',fill:C.muted}} axisLine={false} tickLine={false} width={70}/>
              <Tooltip content={<ChartTooltip/>}/>
              <Bar dataKey="Τόκοι" fill="rgba(248,113,113,0.6)" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Collapsible tools */}
      <Collapsible title="Γράφημα Αποπληρωμής" sub="Κεφάλαιο vs Τόκοι ανά έτος">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={amortChartData} barCategoryGap="15%">
            <XAxis dataKey="year" tick={{fontSize:9,fontFamily:'JetBrains Mono, monospace',fill:C.muted}} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fontFamily:'JetBrains Mono, monospace',fill:C.muted}} axisLine={false} tickLine={false} width={70}/>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={<ChartTooltip/>}/>
            <Legend wrapperStyle={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:C.muted}}/>
            <Bar dataKey="Κεφάλαιο" stackId="a" fill="rgba(52,211,153,0.6)" radius={[0,0,0,0]}/>
            <Bar dataKey="Τόκοι" stackId="a" fill="rgba(248,113,113,0.55)" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Collapsible>

      <Collapsible title="Σπίτι μου ΙΙ vs Κανονικό Δάνειο" sub="Εκτίμηση εξοικονόμησης — deadline 31/08/2026">
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
          {[
            {label:'🏠 Σπίτι μου ΙΙ (εκτίμηση)',rate:spitiRate,m:spitiMonthly,ti:spitiMonthly*years*12-loanAmount,c:C.green,bg:'rgba(52,211,153,0.04)',border:'rgba(52,211,153,0.15)'},
            {label:'📊 Κανονικό Δάνειο',rate:effectiveRate,m:monthly,ti:totalInterest,c:C.red,bg:'rgba(248,113,113,0.04)',border:'rgba(248,113,113,0.15)'},
          ].map(item=>(
            <div key={item.label} style={{background:item.bg,border:`1px solid ${item.border}`,borderRadius:8,padding:14}}>
              <p style={{fontSize:11,color:item.c,fontFamily:'JetBrains Mono, monospace',fontWeight:600,marginBottom:10}}>{item.label}</p>
              {[['Επιτόκιο',fmtPct(item.rate)],['Δόση/μήνα',fmtEur(item.m)],['Σύν. τόκοι',fmtEur(item.ti)]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:11,color:C.muted}}>{k}</span>
                  <span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:item.c}}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{background:'rgba(212,175,66,0.05)',border:`1px solid ${C.goldBorder}`,borderRadius:8,padding:'12px 16px',textAlign:'center'}}>
          <p style={{fontSize:11,color:C.muted,marginBottom:4}}>Εκτιμώμενη εξοικονόμηση</p>
          <p style={{fontSize:28,fontFamily:'JetBrains Mono, monospace',color:C.gold,fontWeight:700}}>{fmtEur(spitiSavings)}</p>
        </div>
        <p style={{fontSize:10,color:C.muted,marginTop:10,lineHeight:1.6}}>
          ⓘ Εκτίμηση βάσει μέσου επιτοκίου προγράμματος. Το ακριβές επιτόκιο καθορίζεται από την τράπεζα. Ισχύει για ηλικία 25-50, πρώτη κατοικία, εισόδημα ≤40.000€. Deadline συμβασιοποίησης: 31/08/2026. →{' '}
          <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>greece20.gov.gr</a>
        </p>
      </Collapsible>

      <Collapsible title="Δανειοληπτική Ικανότητα" sub="Max δάνειο & DTI Ratio">
        <div style={{marginBottom:12}}><label style={lbl}>Μηνιαίο καθαρό εισόδημα (€)</label><input style={inp} type="number" value={monthlyIncome} onChange={e=>setMonthlyIncome(Number(e.target.value))}/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          <KPI label="Max δόση/μήνα" value={fmtEur(monthlyIncome*BORROWER_PROFILES[borrowerType].income_ratio)} color={C.gold} sub={`${(BORROWER_PROFILES[borrowerType].income_ratio*100).toFixed(0)}% εισοδήματος`}/>
          <KPI label="Max δάνειο" value={fmtEur(maxLoanByIncome)} color={maxLoanByIncome>=loanAmount?C.green:C.red}/>
          <KPI label="DTI Ratio" value={monthly>0?fmtPct1((monthly/monthlyIncome)*100):'—'} color={(monthly/monthlyIncome)>0.4?C.red:(monthly/monthlyIncome)>0.35?C.orange:C.green} sub="Δόση / Εισόδημα"/>
        </div>
        {maxLoanByIncome<loanAmount&&<div style={{marginTop:10,background:'rgba(248,113,113,0.05)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:7,padding:'9px 12px'}}><p style={{fontSize:11,color:C.red,fontFamily:'JetBrains Mono, monospace'}}>⚠ Υπέρβαση κατά {fmtEur(loanAmount-maxLoanByIncome)} — μείωσε ποσό ή αύξησε διάρκεια</p></div>}
      </Collapsible>

      <Collapsible title="Φορολογική Ανάλυση" sub="ΦΜΑ, απαλλαγές, ενοίκια — ΑΑΔΕ 2026">
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* FMA */}
          <div>
            <p style={{fontSize:10,color:C.muted,fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Φόρος Μεταβίβασης (ΦΜΑ 3%)</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div>
                <label style={lbl}>Οικογενειακή κατάσταση</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {(['single','married'] as const).map(s=>(
                    <button key={s} onClick={()=>setMaritalStatus(s)} style={{padding:'8px 0',borderRadius:7,border:`1px solid ${maritalStatus===s?C.gold:C.border2}`,background:maritalStatus===s?C.goldDim:'transparent',color:maritalStatus===s?C.gold:C.muted,fontSize:11,fontFamily:'JetBrains Mono, monospace',cursor:'pointer',transition:'all 0.15s'}}>
                      {s==='single'?'Άγαμος':'Έγγαμος'}
                    </button>
                  ))}
                </div>
              </div>
              <div><label style={lbl}>Αριθμός τέκνων</label><input style={inp} type="number" min={0} max={10} value={children} onChange={e=>setChildren(Number(e.target.value))}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              <KPI label="Όριο απαλλαγής" value={fmtEur(fmaExemption)} color={C.green} sub="ΑΑΔΕ 2026"/>
              <KPI label="ΦΜΑ που αναλογεί" value={fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed)} color={fmaOwed===0?C.green:C.red} sub={fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας'}/>
              <KPI label="Αξία ακινήτου" value={fmtEur(propertyValue)} color={propertyValue<=fmaExemption?C.green:C.orange} sub={propertyValue<=fmaExemption?'Εντός ορίου':'Εκτός ορίου'}/>
            </div>
            {loanType==='first_home'&&propertyValue<=fmaExemption&&<div style={{marginTop:8,background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:6,padding:'8px 12px'}}><p style={{fontSize:11,color:C.green}}>✓ Δικαιούσαι απαλλαγή ΦΜΑ — εξοικονόμηση {fmtEur(propertyValue*0.03)}</p></div>}
          </div>
          {/* Rental tax */}
          {loanType==='investment'&&(
            <div>
              <p style={{fontSize:10,color:C.muted,fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Κλίμακα Ενοικίων 2026 (Ν.4172/2013)</p>
              <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                {TAX_DATA.rental_tax.map((b,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'rgba(255,255,255,0.02)',border:`1px solid ${C.border}`,borderRadius:6}}>
                    <span style={{fontSize:11,color:C.textDim}}>{b.label}</span>
                    <span style={{fontSize:13,fontFamily:'JetBrains Mono, monospace',color:C.gold}}>{(b.rate*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <div style={{background:'rgba(212,175,66,0.04)',border:`1px solid ${C.goldBorder}`,borderRadius:6,padding:'8px 12px'}}>
                <p style={{fontSize:10,color:C.gold,fontFamily:'JetBrains Mono, monospace'}}>Αυτόματη έκπτωση 5% δαπανών · Εκτ. φόρος: {fmtEur(rentalTax)}/χρόνο</p>
              </div>
              <p style={{fontSize:10,color:C.muted,marginTop:8,lineHeight:1.6}}>ⓘ Οι τόκοι στεγαστικού δεν εκπίπτουν για δάνεια μετά το 2013. Για φορολογική συμβουλή απευθυνθείτε σε λογιστή. →{' '}<a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>aade.gr</a></p>
            </div>
          )}
        </div>
      </Collapsible>

      <Collapsible title="Stress Test Επιτοκίου" sub="Αντοχή σε άνοδο Euribor">
        <div style={{marginBottom:14}}>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stressChartData} barCategoryGap="25%">
              <XAxis dataKey="name" tick={{fontSize:10,fontFamily:'JetBrains Mono, monospace',fill:C.muted}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>fmtEur(v)} tick={{fontSize:9,fontFamily:'JetBrains Mono, monospace',fill:C.muted}} axisLine={false} tickLine={false} width={70}/>
              <Tooltip content={<ChartTooltip/>}/>
              <ReferenceLine y={monthlyIncome*BORROWER_PROFILES[borrowerType].income_ratio} stroke={C.orange} strokeDasharray="4 4" label={{value:'DTI 35%',fill:C.orange,fontSize:9}}/>
              <Bar dataKey="Δόση" fill={C.gold} radius={[4,4,0,0]} opacity={0.7}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead><tr>{['Σενάριο','Επιτόκιο','Δόση/μήνα','Αύξηση/μήνα','DTI'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',fontSize:9,fontFamily:'JetBrains Mono, monospace',color:C.muted,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
            <tbody>
              {stressTests.map((s,i)=>{
                const diff=s.monthly-stressTests[0].monthly
                const dti=(s.monthly/monthlyIncome)*100
                return(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i===0?'rgba(212,175,66,0.03)':'transparent'}}>
                    <td style={{padding:'8px 10px',color:i===0?C.gold:C.text,fontWeight:i===0?600:400}}>{s.label}</td>
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:C.blue}}>{fmtPct(s.rate)}</td>
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?C.gold:diff>400?C.red:diff>200?C.orange:C.text}}>{fmtEur(s.monthly)}</td>
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?C.muted:C.red}}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:dti>40?C.red:dti>35?C.orange:C.green}}>{fmtPct1(dti)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rateType==='fixed'&&<p style={{fontSize:10,color:C.green,fontFamily:'JetBrains Mono, monospace',marginTop:10}}>✓ Σταθερό {fixedPeriod} χρόνια — προστατεύεσαι από αυξήσεις Euribor για {fixedPeriod} χρόνια</p>}
      </Collapsible>

      <Collapsible title="Αναχρηματοδότηση" sub="Break-even ανάλυση μεταφοράς δανείου">
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
          <div><label style={lbl}>Υπόλοιπο (€)</label><input style={inp} type="number" value={remBalance} onChange={e=>setRemBalance(Number(e.target.value))}/></div>
          <div><label style={lbl}>Χρόνια που μένουν</label><input style={inp} type="number" value={remYears} onChange={e=>setRemYears(Number(e.target.value))}/></div>
          <div><label style={lbl}>Νέο επιτόκιο (%)</label><input style={inp} type="number" step={0.05} value={newRate} onChange={e=>setNewRate(Number(e.target.value))}/></div>
          <div><label style={lbl}>Κόστος μεταφοράς (€)</label><input style={inp} type="number" value={transferCost} onChange={e=>setTransferCost(Number(e.target.value))}/></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
          <KPI label="Τρέχουσα δόση" value={fmtEur(currMonthly)} color={C.red}/>
          <KPI label="Νέα δόση" value={fmtEur(newMonthly)} color={C.green} sub={`${fmtEur(monthlySaving)}/μήνα`}/>
          <KPI label="Καθαρή εξοικονόμηση" value={fmtEur(Math.max(0,refinanceSaving))} color={refinanceSaving>0?C.gold:C.red} sub={refinanceSaving>0?'Αξίζει':'Δεν αξίζει'}/>
          <KPI label="Break-even" value={breakEvenMonths?`${breakEvenMonths} μήνες`:'—'} color={breakEvenMonths&&breakEvenMonths<24?C.green:breakEvenMonths&&breakEvenMonths<48?C.orange:C.red} sub="Μήνες αποσβέσεως"/>
        </div>
      </Collapsible>

      <Collapsible title="Πίνακας Αποπληρωμής" sub={`${years*12} δόσεις`}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead><tr>{['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Σύν. Τόκοι'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'right',fontSize:9,fontFamily:'JetBrains Mono, monospace',color:C.muted,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
            <tbody>
              {amortization.slice(0,24).map(row=>(
                <tr key={row.month} style={{borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:'5px 10px',textAlign:'right',color:C.muted,fontFamily:'JetBrains Mono, monospace'}}>{row.month}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',color:C.gold,fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.payment)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',color:C.green,fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.principal)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',color:C.red,fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.interest)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',color:C.text,fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.balance)}</td>
                  <td style={{padding:'5px 10px',textAlign:'right',color:C.muted,fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.totalInterestPaid)}</td>
                </tr>
              ))}
              {amortization.length>24&&<tr><td colSpan={6} style={{padding:'10px',textAlign:'center',color:C.muted,fontSize:10,fontFamily:'JetBrains Mono, monospace'}}>... {amortization.length-24} ακόμα δόσεις</td></tr>}
            </tbody>
          </table>
        </div>
      </Collapsible>

      <Collapsible title="Απαραίτητα Έγγραφα" sub={LOAN_TYPES[loanType].label}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <div>
            <p style={{fontSize:9,color:C.muted,fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:8}}>Βασικά</p>
            {LOAN_TYPES[loanType].docs.map((d,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <FileText size={11} color={C.gold}/>
                <span style={{fontSize:11,color:C.textDim}}>{d}</span>
              </div>
            ))}
          </div>
          <div>
            <p style={{fontSize:9,color:C.muted,fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:8}}>Ανά δανειολήπτη</p>
            {borrowerType==='professional'&&['Δηλώσεις 2χρ','Επαγγελματική δραστηριότητα ΔΟΥ'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><FileText size={11} color={C.blue}/><span style={{fontSize:11,color:C.textDim}}>{d}</span></div>)}
            {borrowerType==='company'&&['Καταστατικό','Ισολογισμοί 3χρ','Απόφαση ΔΣ'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><FileText size={11} color={C.blue}/><span style={{fontSize:11,color:C.textDim}}>{d}</span></div>)}
            {borrowerType==='military'&&['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><FileText size={11} color={C.blue}/><span style={{fontSize:11,color:C.textDim}}>{d}</span></div>)}
            {borrowerType==='abroad'&&['Φορολ. κατοικία εξωτ.','Εισοδήματα ξένης χώρας','Μεταφράσεις'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}><FileText size={11} color={C.blue}/><span style={{fontSize:11,color:C.textDim}}>{d}</span></div>)}
            {!['professional','company','military','abroad'].includes(borrowerType)&&<p style={{fontSize:11,color:C.muted}}>Μισθοδοτικές + εκκαθαριστικό</p>}
            <div style={{marginTop:12,padding:'8px 10px',background:'rgba(212,175,66,0.04)',border:`1px solid ${C.goldBorder}`,borderRadius:6}}>
              <p style={{fontSize:10,color:C.gold}}>💡 {BORROWER_PROFILES[borrowerType].tax_benefits}</p>
            </div>
          </div>
        </div>
      </Collapsible>

      {/* Cost summary */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
        {sectionTitle('Εκτιμώμενα Έξοδα Αγοράς')}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
          {[
            {label:'ΦΜΑ 3%',value:fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed),sub:fmaOwed===0?'Πρώτη κατοικία':'Επί αξίας ακινήτου',hi:fmaOwed===0},
            {label:'Συμβολαιογραφικά',value:`${fmtEur(propertyValue*0.01)}-${fmtEur(propertyValue*0.02)}`,sub:'1-2% αξίας',hi:false},
            {label:'Εγγραφή υποθήκης',value:fmtEur(loanAmount*0.005),sub:'~0.5% δανείου',hi:false},
            {label:'Νομικός + Τεχνικός',value:'300-750€',sub:'Ή δωρεάν από τράπεζα',hi:false},
            {label:'Ασφάλεια κατοικίας',value:'100-300€/έτος',sub:'Υποχρεωτική',hi:false},
            {label:'Ασφάλεια ζωής',value:`${fmtEur(loanAmount*0.001)}/έτος`,sub:'Συχνά υποχρεωτική',hi:false},
            {label:'Σύνολο εξόδων',value:`~${fmtEur(fmaOwed+propertyValue*0.015+loanAmount*0.005+500)}`,sub:'Εκτός δόσεων',hi:true},
            {label:'Συνολική επένδυση',value:fmtEur(propertyValue-loanAmount+fmaOwed+propertyValue*0.015+loanAmount*0.005+500),sub:'Ίδια κεφάλαια + έξοδα',hi:true},
          ].map((item:any)=>(
            <div key={item.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',borderRadius:8,background:item.hi?'rgba(212,175,66,0.05)':'rgba(255,255,255,0.02)',border:`1px solid ${item.hi?C.goldBorder:C.border}`}}>
              <div>
                <p style={{fontSize:12,color:item.hi?C.gold:C.text,fontWeight:item.hi?600:400}}>{item.label}</p>
                <p style={{fontSize:10,color:C.muted,marginTop:2}}>{item.sub}</p>
              </div>
              <span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:item.hi?C.gold:C.blue,fontWeight:item.hi?700:400}}>{item.value}</span>
            </div>
          ))}
        </div>
        <p style={{fontSize:10,color:C.muted,marginTop:12,lineHeight:1.6}}>ⓘ Εκτιμήσεις — τα τελικά ποσά καθορίζονται από συμβολαιογράφο και τράπεζα. Φορολογική συμβουλή: <a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>aade.gr</a></p>
      </div>
    </div>
  )
}