'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calculator, ChevronDown, ChevronUp, DollarSign, TrendingUp, PieChart,
  Percent, Save, Calendar, ArrowRight, Plus, Trash2, Edit2, Check, X,
  FileText, Home, Wrench, Leaf, Briefcase, Star, Building2, RefreshCw,
  Users, ShieldCheck, Award, ExternalLink, BarChart2
} from 'lucide-react'
import {
  BANKS, LOAN_TYPES, BORROWER_PROFILES, TAX_DATA,
  calcMonthly, calcAmortization, calcFmaExemption, calcRentalTax,
  fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, LoanScenario, MarketRates, SavedLoan
} from './TabLoanData'

const inp:React.CSSProperties={width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:13,fontFamily:'JetBrains Mono, monospace',outline:'none',boxSizing:'border-box'}
const lbl:React.CSSProperties={fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',textTransform:'uppercase',letterSpacing:'0.08em',display:'block',marginBottom:5}

function KPI({label,value,color='#e2e2f0',sub,icon}:{label:string;value:string;color?:string;sub?:string;icon?:React.ReactNode}) {
  return (
    <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:8,padding:'11px 13px'}}>
      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
        {icon&&<span style={{color,opacity:0.7}}>{icon}</span>}
        <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#4a4a60',textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</p>
      </div>
      <p style={{fontSize:15,fontFamily:'JetBrains Mono, monospace',color,fontWeight:700}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'#5a5a70',marginTop:2}}>{sub}</p>}
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
  const supabase=createClient()

  // Core inputs
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

  // UI toggles
  const [showAmort,setShowAmort]=useState(false)
  const [showStress,setShowStress]=useState(false)
  const [showRefinance,setShowRefinance]=useState(false)
  const [showAfford,setShowAfford]=useState(false)
  const [showDocs,setShowDocs]=useState(false)
  const [showTax,setShowTax]=useState(false)
  const [showSpitiComparison,setShowSpitiComparison]=useState(false)
  const [showChart,setShowChart]=useState(false)

  // Refinance
  const [remBalance,setRemBalance]=useState(100000)
  const [remYears,setRemYears]=useState(20)
  const [newRate,setNewRate]=useState(3.0)
  const [transferCost,setTransferCost]=useState(2000)

  // Scenarios — editable
  const [scenarios,setScenarios]=useState<LoanScenario[]>([])
  const [editingId,setEditingId]=useState<string|null>(null)

  const [saving,setSaving]=useState(false)
  const [savingCal,setSavingCal]=useState(false)

  // Calculations
  const effectiveRate=rateType==='variable'?market.euribor_3m+rate:rate
  const monthly=calcMonthly(loanAmount,effectiveRate,years)
  const totalPayment=monthly*years*12
  const totalInterest=totalPayment-loanAmount
  const ltv=propertyValue>0?(loanAmount/propertyValue)*100:0
  const amortization=useMemo(()=>calcAmortization(loanAmount,effectiveRate,years),[loanAmount,effectiveRate,years])

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

  const stressTests=[
    {label:'Βασικό',rate:effectiveRate,monthly:calcMonthly(loanAmount,effectiveRate,years)},
    {label:'+0.5%',rate:effectiveRate+0.5,monthly:calcMonthly(loanAmount,effectiveRate+0.5,years)},
    {label:'+1%',rate:effectiveRate+1,monthly:calcMonthly(loanAmount,effectiveRate+1,years)},
    {label:'+2%',rate:effectiveRate+2,monthly:calcMonthly(loanAmount,effectiveRate+2,years)},
    {label:'+3%',rate:effectiveRate+3,monthly:calcMonthly(loanAmount,effectiveRate+3,years)},
    {label:'6% worst',rate:6,monthly:calcMonthly(loanAmount,6,years)},
  ]

  // Tax calculations
  const fmaExemption=calcFmaExemption(maritalStatus,children)
  const fmaOwed=loanType==='first_home'&&propertyValue<=fmaExemption?0:propertyValue*TAX_DATA.fma_rate
  const annualRentalIncome=(loanType==='investment')?monthly*12*0.8:0
  const rentalTax=calcRentalTax(annualRentalIncome*(1-TAX_DATA.rental_expense_deduction))

  // Σπίτι μου ΙΙ comparison
  const spitiRate=market.euribor_3m*0.5+0.5 // approximate subsidized rate
  const spitiMonthly=calcMonthly(loanAmount,spitiRate,years)
  const spitiSavings=(monthly-spitiMonthly)*years*12

  const selectedBankName=selectedBankId==='custom'?customBankName:BANKS.find(b=>b.id===selectedBankId)?.name||''

  function addScenario(){
    setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:loanAmount,rate:effectiveRate,years,rateType}])
  }
  function updateScenario(id:string,field:string,val:any){
    setScenarios(s=>s.map(x=>x.id===id?{...x,[field]:val}:x))
  }
  function deleteScenario(id:string){setScenarios(s=>s.filter(x=>x.id!==id))}
  function applyScenario(s:LoanScenario){
    setLoanAmount(s.amount);setRate(s.rateType==='variable'?s.rate-market.euribor_3m:s.rate);setYears(s.years);setRateType(s.rateType)
  }

  async function handleSave(){
    setSaving(true)
    await onSaveLoan({bank:selectedBankName||'Μη καθορισμένη',loan_type:loanType,amount:loanAmount,property_value:propertyValue,rate:effectiveRate,rate_type:rateType,years,start_date:startDate,status:'active',notes:loanNotes})
    setSaving(false)
  }
  async function handleSaveCal(){
    setSavingCal(true)
    await onSaveToCalendar(monthly,years,startDate,selectedBankName)
    setSavingCal(false)
  }

  // Mini bar chart for amortization
  const chartData=useMemo(()=>{
    const annual=[]
    for(let y=1;y<=Math.min(years,30);y++){
      const rows=amortization.slice((y-1)*12,y*12)
      const principalSum=rows.reduce((s,r)=>s+r.principal,0)
      const interestSum=rows.reduce((s,r)=>s+r.interest,0)
      annual.push({year:y,principal:principalSum,interest:interestSum})
    }
    return annual
  },[amortization,years])
  const maxBar=Math.max(...chartData.map(d=>d.principal+d.interest),1)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Borrower + Loan type */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:14}}>
          <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Τύπος Δανειολήπτη</p>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {(Object.entries(BORROWER_PROFILES) as [BorrowerType,any][]).map(([k,v])=>(
              <button key={k} onClick={()=>setBorrowerType(k)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:7,border:`1px solid ${borrowerType===k?'rgba(212,175,66,0.4)':'#1e1e30'}`,background:borrowerType===k?'rgba(212,175,66,0.08)':'transparent',cursor:'pointer',textAlign:'left'}}>
                <div style={{flex:1}}>
                  <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:borrowerType===k?'#d4af42':'#9090a8'}}>{v.label}</p>
                  <p style={{fontSize:9,color:'#3a3a54'}}>{v.notes}</p>
                </div>
                {v.special&&borrowerType===k&&<span style={{fontSize:8,color:'#34d399',fontFamily:'JetBrains Mono, monospace',background:'rgba(52,211,153,0.08)',padding:'2px 5px',borderRadius:4}}>{v.special}</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:14}}>
          <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Σκοπός Δανείου</p>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {(Object.entries(LOAN_TYPES) as [LoanType,any][]).map(([k,v])=>(
              <button key={k} onClick={()=>setLoanType(k)} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:7,border:`1px solid ${loanType===k?'rgba(212,175,66,0.4)':'#1e1e30'}`,background:loanType===k?'rgba(212,175,66,0.08)':'transparent',cursor:'pointer',textAlign:'left'}}>
                <div style={{flex:1}}>
                  <p style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:loanType===k?'#d4af42':'#9090a8'}}>{v.label}</p>
                  <p style={{fontSize:9,color:'#3a3a54'}}>{v.typical_rate} · LTV {v.typical_ltv}%</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tax note banner */}
      <div style={{background:'rgba(212,175,66,0.06)',border:'1px solid rgba(212,175,66,0.2)',borderRadius:8,padding:'9px 13px'}}>
        <p style={{fontSize:11,color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>⚖️ {LOAN_TYPES[loanType].tax_note}</p>
      </div>

      {/* Main inputs */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
          <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Στοιχεία Δανείου</p>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div><label style={lbl}>Αξία Ακινήτου (€)</label><input style={inp} type="number" value={propertyValue} onChange={e=>setPropertyValue(Number(e.target.value))}/></div>
            <div>
              <label style={lbl}>Ποσό Δανείου (€)</label>
              <input style={inp} type="number" value={loanAmount} onChange={e=>setLoanAmount(Number(e.target.value))}/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <p style={{fontSize:10,color:ltv>90?'#f87171':ltv>80?'#fb923c':'#34d399',fontFamily:'JetBrains Mono, monospace'}}>LTV: {ltv.toFixed(1)}% {ltv>90?'⚠ Πολύ υψηλό':ltv>80?'⚠ Υψηλό':'✓ OK'}</p>
                <p style={{fontSize:10,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>Ίδια: {fmtEur(propertyValue-loanAmount)}</p>
              </div>
            </div>
            <div><label style={lbl}>Διάρκεια (χρόνια)</label><input style={inp} type="number" min={3} max={35} value={years} onChange={e=>setYears(Number(e.target.value))}/></div>
            <div><label style={lbl}>Ημ/νία Έναρξης</label><input type="date" style={inp} value={startDate} onChange={e=>setStartDate(e.target.value)}/></div>
            <div>
              <label style={lbl}>Τράπεζα</label>
              <select style={{...inp,appearance:'none' as any}} value={selectedBankId} onChange={e=>{setSelectedBankId(e.target.value);setShowCustomBank(e.target.value==='custom')}}>
                <option value="">— Επιλογή —</option>
                {BANKS.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="custom">Άλλη τράπεζα (custom)</option>
              </select>
              {showCustomBank&&<input style={{...inp,marginTop:6}} type="text" placeholder="Όνομα τράπεζας" value={customBankName} onChange={e=>setCustomBankName(e.target.value)}/>}
            </div>
          </div>
        </div>

        <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
          <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Επιτόκιο</p>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div>
              <label style={lbl}>Τύπος</label>
              <div style={{display:'flex',gap:6}}>
                {(['fixed','variable','mixed'] as RateType[]).map(rt=>(
                  <button key={rt} onClick={()=>setRateType(rt)} style={{flex:1,padding:'7px 0',borderRadius:6,border:`1px solid ${rateType===rt?'#d4af42':'#242438'}`,background:rateType===rt?'rgba(212,175,66,0.1)':'transparent',color:rateType===rt?'#d4af42':'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}>
                    {rt==='fixed'?'Σταθερό':rt==='variable'?'Κυμαινόμενο':'Μικτό'}
                  </button>
                ))}
              </div>
            </div>
            {(rateType==='fixed'||rateType==='mixed')&&(
              <div>
                <label style={lbl}>Διάρκεια σταθερού</label>
                <div style={{display:'flex',gap:5}}>
                  {(['3','5','10','15','20'] as const).map(p=>(
                    <button key={p} onClick={()=>setFixedPeriod(p)} style={{flex:1,padding:'5px 0',borderRadius:5,border:`1px solid ${fixedPeriod===p?'#d4af42':'#242438'}`,background:fixedPeriod===p?'rgba(212,175,66,0.1)':'transparent',color:fixedPeriod===p?'#d4af42':'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}>
                      {p}χρ
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label style={lbl}>{rateType==='variable'?'Spread (%)':'Επιτόκιο (%)'}</label>
              <input style={inp} type="number" step={0.05} value={rate} onChange={e=>setRate(Number(e.target.value))}/>
              {rateType==='variable'&&<div style={{marginTop:5,background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:6,padding:'7px 10px'}}><p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#60a5fa'}}>Euribor {fmtPct(market.euribor_3m)} + spread {fmtPct(rate)} = <strong>{fmtPct(effectiveRate)}</strong></p></div>}
            </div>
            <div>
              <label style={lbl}>Έκτακτη μηνιαία πληρωμή (€)</label>
              <input style={inp} type="number" value={extraPayment} onChange={e=>setExtraPayment(Number(e.target.value))} placeholder="0"/>
              {extraSavings&&extraPayment>0&&<div style={{marginTop:5,background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:6,padding:'7px 10px'}}><p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>Εξοικονομείς {Math.round(extraSavings.savedMonths/12)} χρόνια & {fmtEur(extraSavings.savedInterest)} τόκους</p></div>}
            </div>
            <div><label style={lbl}>Σημειώσεις</label><textarea style={{...inp,resize:'vertical' as any,minHeight:48}} placeholder="π.χ. Alpha Bank Πρώτη Κατοικία..." value={loanNotes} onChange={e=>setLoanNotes(e.target.value)}/></div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        <KPI label="Μηνιαία Δόση" value={fmtEur(monthly)} color="#d4af42" icon={<DollarSign size={13}/>}/>
        <KPI label="Σύνολο Τόκων" value={fmtEur(totalInterest)} color="#f87171" icon={<TrendingUp size={13}/>} sub={`${((totalInterest/loanAmount)*100).toFixed(0)}% κεφαλαίου`}/>
        <KPI label="Συνολική Αποπληρωμή" value={fmtEur(totalPayment)} color="#e2e2f0" icon={<PieChart size={13}/>}/>
        <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?'#f87171':ltv>70?'#fb923c':'#34d399'} icon={<Percent size={13}/>} sub={`Ίδια: ${fmtEur(propertyValue-loanAmount)}`}/>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button onClick={handleSave} disabled={saving} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:7,cursor:'pointer',color:'#d4af42',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
          <Save size={12}/>{saving?'Αποθήκευση...':'Αποθήκευση Δανείου'}
        </button>
        <button onClick={handleSaveCal} disabled={savingCal} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(96,165,250,0.1)',border:'1px solid rgba(96,165,250,0.3)',borderRadius:7,cursor:'pointer',color:'#60a5fa',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
          <Calendar size={12}/>{savingCal?'...':'Δόσεις → Ημερολόγιο'}
        </button>
        <button onClick={()=>onSaveToExpenses(monthly,selectedBankName)} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.3)',borderRadius:7,cursor:'pointer',color:'#34d399',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
          <ArrowRight size={12}/>Δόση → Δαπάνες
        </button>
        <button onClick={addScenario} style={{display:'flex',alignItems:'center',gap:5,padding:'8px 14px',background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.3)',borderRadius:7,cursor:'pointer',color:'#a78bfa',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
          <Plus size={12}/>Σενάριο
        </button>
      </div>

      {/* Editable Scenarios */}
      {scenarios.length>0&&(
        <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
          <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Σύγκριση Σεναρίων — Κλικ για επεξεργασία</p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr>{['Σενάριο','Ποσό (€)','Επιτόκιο (%)','Χρόνια','Δόση/μήνα','Σύν. τόκοι','Διαφορά',''].map(h=>(
                  <th key={h} style={{padding:'6px 10px',textAlign:'left',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase',borderBottom:'1px solid #1a1a2e'}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {scenarios.map((s,idx)=>{
                  const m=calcMonthly(s.amount,s.rate,s.years)
                  const ti=m*s.years*12-s.amount
                  const saved=totalInterest-ti
                  const isBest=saved===Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return totalInterest-(mx*x.years*12-x.amount)}))
                  const isEditing=editingId===s.id
                  return (
                    <tr key={s.id} style={{borderBottom:'1px solid #0e0e1c',background:isBest?'rgba(52,211,153,0.04)':'transparent'}}>
                      <td style={{padding:'7px 10px'}}>
                        {isEditing
                          ? <input style={{...inp,padding:'4px 8px',fontSize:11,width:100}} value={s.label} onChange={e=>updateScenario(s.id,'label',e.target.value)}/>
                          : <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{color:'#e2e2f0'}}>{s.label}</span>
                              {isBest&&<span style={{fontSize:8,padding:'1px 5px',borderRadius:3,background:'rgba(52,211,153,0.15)',color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>ΒΕΛΤΙΣΤΟ</span>}
                            </div>
                        }
                      </td>
                      <td style={{padding:'7px 10px'}}>
                        {isEditing ? <input style={{...inp,padding:'4px 8px',fontSize:11,width:90}} type="number" value={s.amount} onChange={e=>updateScenario(s.id,'amount',Number(e.target.value))}/> : <span style={{fontFamily:'JetBrains Mono, monospace',color:'#d4af42'}}>{fmtEur(s.amount)}</span>}
                      </td>
                      <td style={{padding:'7px 10px'}}>
                        {isEditing ? <input style={{...inp,padding:'4px 8px',fontSize:11,width:70}} type="number" step={0.05} value={s.rate} onChange={e=>updateScenario(s.id,'rate',Number(e.target.value))}/> : <span style={{fontFamily:'JetBrains Mono, monospace',color:'#60a5fa'}}>{fmtPct(s.rate)}</span>}
                      </td>
                      <td style={{padding:'7px 10px'}}>
                        {isEditing ? <input style={{...inp,padding:'4px 8px',fontSize:11,width:60}} type="number" value={s.years} onChange={e=>updateScenario(s.id,'years',Number(e.target.value))}/> : <span style={{color:'#5a5a70'}}>{s.years}χρ</span>}
                      </td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>{fmtEur(m)}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#f87171'}}>{fmtEur(ti)}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:saved>0?'#34d399':'#f87171'}}>{saved>0?`-${fmtEur(saved)}`:fmtEur(-saved)}</td>
                      <td style={{padding:'7px 10px'}}>
                        <div style={{display:'flex',gap:4}}>
                          {isEditing
                            ? <button onClick={()=>setEditingId(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#34d399'}}><Check size={13}/></button>
                            : <>
                                <button onClick={()=>setEditingId(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#5a5a70'}}><Edit2 size={12}/></button>
                                <button onClick={()=>applyScenario(s)} style={{background:'none',border:'none',cursor:'pointer',color:'#d4af42'}} title="Εφάρμοσε στον calculator"><Calculator size={12}/></button>
                              </>
                          }
                          <button onClick={()=>deleteScenario(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#3a3a54'}}><Trash2 size={11}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Mini bar chart for scenarios */}
          <div style={{marginTop:14,display:'flex',alignItems:'flex-end',gap:8,height:80}}>
            {scenarios.map(s=>{
              const m=calcMonthly(s.amount,s.rate,s.years),ti=m*s.years*12-s.amount
              const maxTi=Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return mx*x.years*12-x.amount}),1)
              const h=(ti/maxTi)*70
              return(
                <div key={s.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1}}>
                  <span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#f87171'}}>{fmtEur(ti)}</span>
                  <div style={{width:'100%',height:h,background:'rgba(248,113,113,0.4)',border:'1px solid rgba(248,113,113,0.6)',borderRadius:'3px 3px 0 0'}}/>
                  <span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Collapsible advanced tools */}
      {[
        {key:'chart',show:showChart,setShow:setShowChart,title:'Γράφημα Αποπληρωμής',sub:'Κεφάλαιο vs Τόκοι ανά έτος',
          content:(
            <div style={{marginTop:12}}>
              <div style={{display:'flex',alignItems:'flex-end',gap:3,height:140,overflowX:'auto'}}>
                {chartData.map(d=>{
                  const totalH=140
                  const pH=(d.principal/(d.principal+d.interest))*totalH
                  const iH=(d.interest/(d.principal+d.interest))*totalH
                  return(
                    <div key={d.year} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0,minWidth:20,flex:1}}>
                      <div style={{width:'100%',display:'flex',flexDirection:'column'}}>
                        <div style={{height:iH,background:'rgba(248,113,113,0.5)',borderRadius:'3px 3px 0 0'}} title={`Τόκος: ${fmtEur(d.interest)}`}/>
                        <div style={{height:pH,background:'rgba(52,211,153,0.5)'}} title={`Κεφάλαιο: ${fmtEur(d.principal)}`}/>
                      </div>
                      <span style={{fontSize:8,color:'#5a5a70',marginTop:3}}>{d.year}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{display:'flex',gap:16,marginTop:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,background:'rgba(52,211,153,0.5)',borderRadius:2}}/><span style={{fontSize:10,color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>Κεφάλαιο</span></div>
                <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:12,height:12,background:'rgba(248,113,113,0.5)',borderRadius:2}}/><span style={{fontSize:10,color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>Τόκοι</span></div>
              </div>
            </div>
          )},
        {key:'spiti',show:showSpitiComparison,setShow:setShowSpitiComparison,title:'Σπίτι μου ΙΙ vs Κανονικό Δάνειο',sub:'Σύγκριση εξοικονόμησης — deadline 31/08/2026',
          content:(
            <div style={{marginTop:12}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div style={{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.2)',borderRadius:8,padding:14}}>
                  <p style={{fontSize:11,color:'#34d399',fontFamily:'JetBrains Mono, monospace',fontWeight:600,marginBottom:8}}>🏠 Σπίτι μου ΙΙ (εκτίμηση)</p>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:'#5a5a70'}}>Εκτιμώμενο επιτόκιο</span><span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>{fmtPct(spitiRate)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:'#5a5a70'}}>Μηνιαία δόση</span><span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>{fmtEur(spitiMonthly)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:'#5a5a70'}}>Σύν. τόκοι</span><span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#34d399'}}>{fmtEur(spitiMonthly*years*12-loanAmount)}</span></div>
                  </div>
                </div>
                <div style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:8,padding:14}}>
                  <p style={{fontSize:11,color:'#f87171',fontFamily:'JetBrains Mono, monospace',fontWeight:600,marginBottom:8}}>📊 Κανονικό Δάνειο</p>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:'#5a5a70'}}>Επιτόκιο</span><span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#f87171'}}>{fmtPct(effectiveRate)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:'#5a5a70'}}>Μηνιαία δόση</span><span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#f87171'}}>{fmtEur(monthly)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:'#5a5a70'}}>Σύν. τόκοι</span><span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#f87171'}}>{fmtEur(totalInterest)}</span></div>
                  </div>
                </div>
              </div>
              <div style={{background:'rgba(212,175,66,0.08)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:8,padding:'12px 16px',textAlign:'center'}}>
                <p style={{fontSize:11,color:'#5a5a70',marginBottom:4}}>Εκτιμώμενη εξοικονόμηση με Σπίτι μου ΙΙ</p>
                <p style={{fontSize:24,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{fmtEur(spitiSavings)}</p>
                <p style={{fontSize:10,color:'#5a5a70',marginTop:4}}>⚠ Εκτίμηση — το ακριβές επιτόκιο καθορίζεται από την τράπεζα. Ισχύει για ηλικία 25-50 ετών, πρώτη κατοικία, deadline 31/08/2026</p>
              </div>
            </div>
          )},
        {key:'afford',show:showAfford,setShow:setShowAfford,title:'Δανειοληπτική Ικανότητα',sub:'Max δάνειο & DTI Ratio',
          content:(
            <div style={{marginTop:12}}>
              <div style={{marginBottom:12}}><label style={lbl}>Μηνιαίο καθαρό εισόδημα (€)</label><input style={inp} type="number" value={monthlyIncome} onChange={e=>setMonthlyIncome(Number(e.target.value))}/></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                <KPI label="Max δόση/μήνα" value={fmtEur(monthlyIncome*BORROWER_PROFILES[borrowerType].income_ratio)} color="#d4af42" sub={`${(BORROWER_PROFILES[borrowerType].income_ratio*100).toFixed(0)}% εισοδήματος`}/>
                <KPI label="Max δάνειο" value={fmtEur(maxLoanByIncome)} color={maxLoanByIncome>=loanAmount?'#34d399':'#f87171'}/>
                <KPI label="DTI Ratio" value={monthly>0?fmtPct1((monthly/monthlyIncome)*100):'—'} color={(monthly/monthlyIncome)>0.4?'#f87171':(monthly/monthlyIncome)>0.35?'#fb923c':'#34d399'} sub="Δόση / Εισόδημα"/>
              </div>
              {maxLoanByIncome<loanAmount&&<div style={{marginTop:10,background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>⚠ Υπέρβαση max κατά {fmtEur(loanAmount-maxLoanByIncome)} — μείωσε ποσό ή αύξησε διάρκεια</p></div>}
            </div>
          )},
        {key:'tax',show:showTax,setShow:setShowTax,title:'Φορολογική Ανάλυση',sub:'ΦΜΑ, απαλλαγές, φορολόγηση ενοικίων 2026 — ΑΑΔΕ',
          content:(
            <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:12}}>
              {/* ΦΜΑ */}
              <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:8,padding:14}}>
                <p style={{fontSize:10,color:'#d4af42',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Φόρος Μεταβίβασης (ΦΜΑ 3%)</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                  <div>
                    <label style={lbl}>Οικογενειακή κατάσταση</label>
                    <div style={{display:'flex',gap:6}}>
                      {(['single','married'] as const).map(s=>(
                        <button key={s} onClick={()=>setMaritalStatus(s)} style={{flex:1,padding:'6px 0',borderRadius:6,border:`1px solid ${maritalStatus===s?'#d4af42':'#242438'}`,background:maritalStatus===s?'rgba(212,175,66,0.1)':'transparent',color:maritalStatus===s?'#d4af42':'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}>
                          {s==='single'?'Άγαμος':'Έγγαμος'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Αριθμός τέκνων</label>
                    <input style={inp} type="number" min={0} max={10} value={children} onChange={e=>setChildren(Number(e.target.value))}/>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                  <KPI label="Όριο απαλλαγής ΦΜΑ" value={fmtEur(fmaExemption)} color="#34d399" sub="Βάσει ΑΑΔΕ 2026"/>
                  <KPI label="ΦΜΑ που αναλογεί" value={fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed)} color={fmaOwed===0?'#34d399':'#f87171'} sub={fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας'}/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(propertyValue)} color={propertyValue<=fmaExemption?'#34d399':'#fb923c'} sub={propertyValue<=fmaExemption?'Εντός ορίου':'Εκτός ορίου'}/>
                </div>
                {loanType==='first_home'&&propertyValue<=fmaExemption&&<div style={{marginTop:8,background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.2)',borderRadius:6,padding:'8px 12px'}}><p style={{fontSize:11,color:'#34d399'}}>✓ Δικαιούσαι απαλλαγή ΦΜΑ — εξοικονόμηση {fmtEur(propertyValue*0.03)}</p></div>}
                {loanType==='construction'&&<div style={{marginTop:8,background:'rgba(251,146,60,0.06)',border:'1px solid rgba(251,146,60,0.2)',borderRadius:6,padding:'8px 12px'}}><p style={{fontSize:11,color:'#fb923c'}}>⚠ Νεόδμητα (άδεια μετά 2006): ΦΠΑ 24% αντί ΦΜΑ — ελέγξτε με νομικό. {TAX_DATA.vat_suspension_note}</p></div>}
              </div>
              {/* Rental tax */}
              {loanType==='investment'&&(
                <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:8,padding:14}}>
                  <p style={{fontSize:10,color:'#d4af42',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Φορολόγηση Ενοικίων 2026 (Ν.4172/2013)</p>
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
                    {TAX_DATA.rental_tax.map((b,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 10px',background:'rgba(255,255,255,0.02)',border:'1px solid #1a1a2e',borderRadius:6}}>
                        <span style={{fontSize:11,color:'#9090a8'}}>{b.label}</span>
                        <span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#d4af42'}}>{(b.rate*100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'rgba(212,175,66,0.06)',border:'1px solid rgba(212,175,66,0.2)',borderRadius:6,padding:'8px 12px'}}>
                    <p style={{fontSize:10,color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>💡 Αυτόματη έκπτωση 5% δαπανών · Δαπάνες ανακαίνισης με e-πληρωμές μειώνουν φορολογητέο εισόδημα · Βεβαίωση ΦΜΑ πρόβλεψη: {fmtEur(annualRentalIncome)} ετήσια → φόρος ~{fmtEur(rentalTax)}</p>
                  </div>
                  <div style={{marginTop:8,background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:6,padding:'8px 12px'}}>
                    <p style={{fontSize:10,color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>⚠ Οι τόκοι στεγαστικού δανείου ΔΕΝ εκπίπτουν από το φορολογητέο εισόδημα για δάνεια μετά το 2013</p>
                  </div>
                </div>
              )}
              <div style={{background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:7,padding:'8px 12px'}}>
                <p style={{fontSize:10,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace'}}>ⓘ Φορολογική ανάλυση βάσει ΑΑΔΕ & Ν.4172/2013 (Ιούνιος 2026). Για εξατομικευμένη φορολογική συμβουλή απευθυνθείτε σε λογιστή ή φοροτεχνικό σύμβουλο.</p>
              </div>
            </div>
          )},
        {key:'stress',show:showStress,setShow:setShowStress,title:'Stress Test Επιτοκίου',sub:'Τι γίνεται αν ανέβει το Euribor;',
          content:(
            <div style={{marginTop:12,overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr>{['Σενάριο','Επιτόκιο','Δόση/μήνα','Αύξηση/μήνα','Αύξηση/χρόνο','DTI (εισ. 2.000€)'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase',borderBottom:'1px solid #1a1a2e'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {stressTests.map((s,i)=>{const diff=s.monthly-stressTests[0].monthly;const dti=(s.monthly/monthlyIncome)*100;return(
                    <tr key={i} style={{borderBottom:'1px solid #0e0e1c',background:i===0?'rgba(212,175,66,0.04)':'transparent'}}>
                      <td style={{padding:'7px 10px',color:i===0?'#d4af42':'#e2e2f0',fontWeight:i===0?600:400}}>{s.label}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:'#60a5fa'}}>{fmtPct(s.rate)}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'#d4af42':diff>400?'#f87171':diff>200?'#fb923c':'#e2e2f0'}}>{fmtEur(s.monthly)}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'#5a5a70':'#f87171'}}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'#5a5a70':'#f87171'}}>{i===0?'—':`+${fmtEur(diff*12)}`}</td>
                      <td style={{padding:'7px 10px',fontFamily:'JetBrains Mono, monospace',color:dti>40?'#f87171':dti>35?'#fb923c':'#34d399'}}>{fmtPct1(dti)}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
              {rateType==='fixed'&&<div style={{marginTop:10,background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>✓ Σταθερό {fixedPeriod} χρόνια — προστατεύεσαι από αυξήσεις Euribor</p></div>}
            </div>
          )},
        {key:'refinance',show:showRefinance,setShow:setShowRefinance,title:'Αξίζει Αναχρηματοδότηση;',sub:'Υπολόγισε αν συμφέρει + break-even σημείο',
          content:(
            <div style={{marginTop:12}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
                <div><label style={lbl}>Υπόλοιπο κεφάλαιο (€)</label><input style={inp} type="number" value={remBalance} onChange={e=>setRemBalance(Number(e.target.value))}/></div>
                <div><label style={lbl}>Χρόνια που μένουν</label><input style={inp} type="number" value={remYears} onChange={e=>setRemYears(Number(e.target.value))}/></div>
                <div><label style={lbl}>Νέο επιτόκιο (%)</label><input style={inp} type="number" step={0.05} value={newRate} onChange={e=>setNewRate(Number(e.target.value))}/></div>
                <div><label style={lbl}>Κόστος μεταφοράς (€)</label><input style={inp} type="number" value={transferCost} onChange={e=>setTransferCost(Number(e.target.value))}/></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                <KPI label="Τρέχουσα δόση" value={fmtEur(currMonthly)} color="#f87171"/>
                <KPI label="Νέα δόση" value={fmtEur(newMonthly)} color="#34d399" sub={`Εξοικ. ${fmtEur(monthlySaving)}/μήνα`}/>
                <KPI label="Καθαρή εξοικονόμηση" value={fmtEur(Math.max(0,refinanceSaving))} color={refinanceSaving>0?'#d4af42':'#f87171'} sub={refinanceSaving>0?'Αξίζει!':'Δεν αξίζει'}/>
                <KPI label="Break-even" value={breakEvenMonths?`${breakEvenMonths} μήνες`:'—'} color={breakEvenMonths&&breakEvenMonths<24?'#34d399':breakEvenMonths&&breakEvenMonths<48?'#fb923c':'#f87171'} sub="Μήνες για να αποσβεστούν τα έξοδα"/>
              </div>
            </div>
          )},
        {key:'amort',show:showAmort,setShow:setShowAmort,title:'Πίνακας Αποπληρωμής',sub:`${years*12} δόσεις αναλυτικά`,
          content:(
            <div style={{marginTop:12,overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead><tr>{['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Σύν. Τόκοι'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'right',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase',borderBottom:'1px solid #1a1a2e'}}>{h}</th>)}</tr></thead>
                <tbody>
                  {amortization.slice(0,24).map(row=>(
                    <tr key={row.month} style={{borderBottom:'1px solid #0e0e1c'}}>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>{row.month}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.payment)}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.principal)}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.interest)}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#e2e2f0',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.balance)}</td>
                      <td style={{padding:'5px 10px',textAlign:'right',color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>{fmtEur(row.totalInterestPaid)}</td>
                    </tr>
                  ))}
                  {amortization.length>24&&<tr><td colSpan={6} style={{padding:'8px 10px',textAlign:'center',color:'#3a3a54',fontSize:10,fontFamily:'JetBrains Mono, monospace'}}>... {amortization.length-24} ακόμα δόσεις</td></tr>}
                </tbody>
              </table>
            </div>
          )},
        {key:'docs',show:showDocs,setShow:setShowDocs,title:'Απαραίτητα Έγγραφα',sub:`Για: ${LOAN_TYPES[loanType].label}`,
          content:(
            <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',marginBottom:8}}>Βασικά έγγραφα</p>
                {LOAN_TYPES[loanType].docs.map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#d4af42"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
              </div>
              <div>
                <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#60a5fa',textTransform:'uppercase',marginBottom:8}}>Ανά δανειολήπτη</p>
                {borrowerType==='professional'&&['Δηλώσεις 2χρ','Επαγγελματική δραστηριότητα ΔΟΥ'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                {borrowerType==='company'&&['Καταστατικό','Ισολογισμοί 3χρ','ΔΟΥ','Απόφαση ΔΣ'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                {borrowerType==='military'&&['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                {borrowerType==='abroad'&&['Φορολ. κατοικία εξωτ.','Εισοδήματα ξένης χώρας','Μεταφράσεις'].map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><FileText size={11} color="#60a5fa"/><span style={{fontSize:11,color:'#9090a8'}}>{d}</span></div>)}
                {!['professional','company','military','abroad'].includes(borrowerType)&&<p style={{fontSize:11,color:'#3a3a54'}}>Μισθοδοτικές καταστάσεις + εκκαθαριστικό</p>}
                <div style={{marginTop:10,padding:'8px 10px',background:'rgba(212,175,66,0.06)',border:'1px solid rgba(212,175,66,0.2)',borderRadius:6}}>
                  <p style={{fontSize:10,color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>💡 {BORROWER_PROFILES[borrowerType].tax_benefits}</p>
                </div>
              </div>
            </div>
          )},
      ].map(({key,show,setShow,title,sub,content})=>(
        <div key={key} style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
          <button onClick={()=>setShow((s:boolean)=>!s)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',background:'none',border:'none',cursor:'pointer',padding:0}}>
            <div style={{textAlign:'left'}}>
              <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em'}}>{title}</p>
              <p style={{fontSize:11,color:'#5a5a70',marginTop:2}}>{sub}</p>
            </div>
            {show?<ChevronUp size={13} color="#5a5a70"/>:<ChevronDown size={13} color="#5a5a70"/>}
          </button>
          {show&&content}
        </div>
      ))}

      {/* Loan costs summary */}
      <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
        <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Εκτιμώμενα Συνολικά Έξοδα Αγοράς</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
          {[
            {label:'ΦΜΑ',value:fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed),note:fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας',hi:false},
            {label:'Συμβολαιογραφικά',value:`${fmtEur(propertyValue*0.01)}-${fmtEur(propertyValue*0.02)}`,note:'1-2% εμπ. αξίας',hi:false},
            {label:'Εγγραφή υποθήκης',value:fmtEur(loanAmount*0.005),note:'~0.5% δανείου',hi:false},
            {label:'Νομικός+Τεχνικός',value:'300-750€',note:'Τράπεζα ή δωρεάν',hi:false},
            {label:'Ασφάλεια κατοικίας',value:'100-300€/έτος',note:'Υποχρεωτική',hi:false},
            {label:'Ασφάλεια ζωής',value:`${fmtEur(loanAmount*0.001)}/έτος`,note:'Συχνά υποχρεωτική',hi:false},
            {label:'Σύνολο εξόδων (εκτ.)',value:`~${fmtEur(fmaOwed+propertyValue*0.015+loanAmount*0.005+500)}`,note:'Εκτός δόσεων',hi:true},
            {label:'Συνολική επένδυση',value:fmtEur(propertyValue-loanAmount+fmaOwed+propertyValue*0.015+loanAmount*0.005+500),note:'Ίδια+έξοδα',hi:true},
          ].map((item:any)=>(
            <div key={item.label} style={{padding:'9px 12px',borderRadius:7,background:item.hi?'rgba(212,175,66,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${item.hi?'rgba(212,175,66,0.2)':'#1e1e30'}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><p style={{fontSize:12,color:item.hi?'#d4af42':'#e2e2f0',fontWeight:item.hi?600:400}}>{item.label}</p><p style={{fontSize:10,color:'#5a5a70'}}>{item.note}</p></div>
              <span style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:item.hi?'#d4af42':'#60a5fa',fontWeight:item.hi?700:400}}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
