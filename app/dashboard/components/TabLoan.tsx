'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calculator, Building2, Star, Zap, BookOpen, Save,
  Check, X, ExternalLink, Leaf, ChevronDown, ChevronUp,
  RefreshCw, AlertTriangle, Award, Info
} from 'lucide-react'
import TabLoanCalculator from './TabLoanCalculator'
import {
  BANKS, STATE_PROGRAMS, LOAN_TYPES, BORROWER_PROFILES, GLOSSARY, PROCESS_STEPS,
  MARKET_FALLBACK, EURIBOR_HISTORY, calcMonthly, fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, SavedLoan, MarketRates
} from './TabLoanData'

const inp:React.CSSProperties={width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:13,fontFamily:'JetBrains Mono, monospace',outline:'none',boxSizing:'border-box'}

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

export default function TabLoan({propertyId,userId}:{propertyId:string;userId:string}) {
  const supabase=createClient()
  const [activeTab,setActiveTab]=useState<'calculator'|'banks'|'programs'|'advisor'|'guide'|'saved'>('calculator')
  const [market,setMarket]=useState<MarketRates>(MARKET_FALLBACK)
  const [euriborLoading,setEuriborLoading]=useState(true)
  const [savedLoans,setSavedLoans]=useState<SavedLoan[]>([])
  const [filterGreen,setFilterGreen]=useState(false)
  const [filterSpiti,setFilterSpiti]=useState(false)
  const [showGlossary,setShowGlossary]=useState(false)
  // for advisor
  const [advLoanType,setAdvLoanType]=useState<LoanType>('purchase')
  const [advBorrower,setAdvBorrower]=useState<BorrowerType>('individual')
  const [advAmount,setAdvAmount]=useState(150000)
  const [advYears,setAdvYears]=useState(25)
  const [advRateType,setAdvRateType]=useState<RateType>('fixed')

  useEffect(()=>{loadMarket();loadSaved()},[propertyId])

  async function loadMarket() {
    setEuriborLoading(true)
    try {
      const {data}=await supabase.from('market_rates').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle()
      if(data)setMarket(data as MarketRates)
    } catch{}
    setEuriborLoading(false)
  }

  async function loadSaved() {
    const {data}=await supabase.from('loans').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false})
    setSavedLoans(data||[])
  }

  async function handleSaveLoan(loan:Partial<SavedLoan>) {
    await supabase.from('loans').insert({...loan,property_id:propertyId,user_id:userId})
    await loadSaved()
  }

  async function handleSaveToCalendar(monthly:number,years:number,startDate:string,bankName:string) {
    const d=new Date(startDate),events=[]
    for(let i=0;i<Math.min(years*12,60);i++){
      const evDate=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate())
      events.push({property_id:propertyId,user_id:userId,title:`Δόση δανείου${bankName?` - ${bankName}`:''}`,category:'financial',event_date:evDate.toISOString().split('T')[0],amount:Math.round(monthly),priority:'high',status:'pending',recurring:true,recurring_interval:'monthly',notes:`Δάνειο @ ${fmtPct(monthly)}`,source:'manual'})
    }
    for(let i=0;i<events.length;i+=20)await supabase.from('calendar_events').insert(events.slice(i,i+20))
    alert(`✓ ${Math.min(years*12,60)} δόσεις → Ημερολόγιο!`)
  }

  async function handleSaveToExpenses(monthly:number,bankName:string) {
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Δόση δανείου${bankName?` - ${bankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:new Date().toISOString().split('T')[0]})
    alert('✓ Δόση → Δαπάνες!')
  }

  async function deleteLoan(id:string){if(!confirm('Διαγραφή;'))return;await supabase.from('loans').delete().eq('id',id);await loadSaved()}

  const tabs=[
    {id:'calculator',label:'Calculator',icon:<Calculator size={11}/>},
    {id:'banks',label:'Τράπεζες',icon:<Building2 size={11}/>},
    {id:'programs',label:'Κρατικά',icon:<Star size={11}/>},
    {id:'advisor',label:'Advisor',icon:<Zap size={11}/>},
    {id:'guide',label:'Οδηγός',icon:<BookOpen size={11}/>},
    {id:'saved',label:`Αποθηκευμένα${savedLoans.length>0?` (${savedLoans.length})`:''}`,icon:<Save size={11}/>},
  ]

  // Last update formatting
  const lastUpdate=new Date(market.updated_at)
  const updatedStr=lastUpdate.toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Header with live Euribor */}
      <div style={{background:'rgba(212,175,66,0.05)',border:'1px solid rgba(212,175,66,0.15)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Calculator size={16} color="#d4af42"/>
          <p style={{fontSize:12,color:'#d4af42',fontFamily:'JetBrains Mono, monospace',fontWeight:600}}>Εργαλείο Στεγαστικών Δανείων — Ελληνική Αγορά</p>
        </div>
        <div style={{display:'flex',gap:16,marginLeft:'auto',flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>
            Euribor 3M {euriborLoading?<span style={{color:'#3a3a54'}}>…</span>:<span style={{color:'#60a5fa'}}>{fmtPct(market.euribor_3m)}</span>}
          </span>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>
            Euribor 1M {euriborLoading?<span style={{color:'#3a3a54'}}>…</span>:<span style={{color:'#60a5fa'}}>{fmtPct(market.euribor_1m)}</span>}
          </span>
          <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>
            ΕΚΤ <span style={{color:'#a78bfa'}}>{fmtPct(market.ecb_rate)}</span>
          </span>
          <a href="https://www.bankofgreece.gr" target="_blank" rel="noreferrer" style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#3a3a54',textDecoration:'none'}}>
            Ενημ: {updatedStr} · ΤτΕ
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'#12121f',border:'1px solid #242438',borderRadius:8,overflow:'hidden'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id as any)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'9px 0',border:'none',borderRight:'1px solid #1e1e30',cursor:'pointer',fontSize:10,fontFamily:'JetBrains Mono, monospace',background:activeTab===t.id?'rgba(212,175,66,0.12)':'transparent',color:activeTab===t.id?'#d4af42':'#5a5a70',transition:'all 0.15s'}}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ═══ CALCULATOR ═══ */}
      {activeTab==='calculator'&&(
        <TabLoanCalculator
          propertyId={propertyId} userId={userId} market={market}
          onSaveLoan={handleSaveLoan}
          onSaveToCalendar={handleSaveToCalendar}
          onSaveToExpenses={handleSaveToExpenses}
        />
      )}

      {/* ═══ BANKS ═══ */}
      {activeTab==='banks'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <button onClick={()=>setFilterGreen(f=>!f)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:filterGreen?'rgba(52,211,153,0.1)':'transparent',border:`1px solid ${filterGreen?'rgba(52,211,153,0.4)':'#242438'}`,borderRadius:7,cursor:'pointer',color:filterGreen?'#34d399':'#5a5a70',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              <Leaf size={11}/>Πράσινα Δάνεια
            </button>
            <button onClick={()=>setFilterSpiti(f=>!f)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:filterSpiti?'rgba(52,211,153,0.1)':'transparent',border:`1px solid ${filterSpiti?'rgba(52,211,153,0.4)':'#242438'}`,borderRadius:7,cursor:'pointer',color:filterSpiti?'#34d399':'#5a5a70',fontSize:11,fontFamily:'JetBrains Mono, monospace'}}>
              🏠 Σπίτι μου ΙΙ
            </button>
            <p style={{fontSize:10,color:'#3a3a54',fontFamily:'JetBrains Mono, monospace',marginLeft:'auto'}}>vresdaneio.gr · {updatedStr}</p>
          </div>

          {/* Rate comparison table */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16,overflowX:'auto'}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Πίνακας Επιτοκίων — Απρίλιος/Ιούνιος 2026</p>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:'1px solid #1a1a2e'}}>
                  {['Τράπεζα','3χρ','5χρ','10χρ','15χρ','20χρ','Κυμ. spread','Max LTV','Σπίτι ΙΙ'].map(h=>(
                    <th key={h} style={{padding:'7px 10px',textAlign:'left',fontFamily:'JetBrains Mono, monospace',fontSize:9,color:'#4a4a60',textTransform:'uppercase'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>(
                  <tr key={bank.id} style={{borderBottom:'1px solid #0e0e1c'}}>
                    <td style={{padding:'8px 10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                        <span style={{width:10,height:10,borderRadius:2,background:bank.color,display:'inline-block',flexShrink:0}}/>
                        <span style={{fontSize:12,color:'#e2e2f0',fontWeight:500}}>{bank.name}</span>
                      </div>
                    </td>
                    {(['fixed3','fixed5','fixed10','fixed15','fixed20'] as const).map(k=>(
                      <td key={k} style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',fontSize:11,color:'#60a5fa'}}>{(bank as any)[k]}%</td>
                    ))}
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',fontSize:11,color:'#34d399'}}>+{bank.variable_spread_min}-{bank.variable_spread_max}%</td>
                    <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',fontSize:11,color:bank.max_ltv>=90?'#34d399':'#d4af42'}}>{bank.max_ltv}%</td>
                    <td style={{padding:'8px 10px'}}>{bank.spiti_mou?<Check size={14} color="#34d399"/>:<X size={14} color="#3a3a54"/>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bank cards */}
          {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>{
            const effMin=filterGreen?bank.fixed_min-bank.green_discount:bank.fixed_min
            const myMonthly=calcMonthly(150000,effMin,25)
            return(
              <div key={bank.id} style={{background:'#12121f',border:'1px solid #242438',borderLeft:`4px solid ${bank.color}`,borderRadius:10,padding:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <p style={{fontSize:15,color:'#e2e2f0',fontWeight:700}}>{bank.name}</p>
                      <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:`${bank.color}20`,color:bank.color,fontFamily:'JetBrains Mono, monospace',border:`1px solid ${bank.color}40`}}>{bank.note}</span>
                      {bank.spiti_mou&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(52,211,153,0.1)',color:'#34d399',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(52,211,153,0.2)'}}>🏠 Σπίτι μου ΙΙ</span>}
                    </div>
                    <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Σταθερό 5χρ</p><p style={{fontSize:20,fontFamily:'JetBrains Mono, monospace',color:'#34d399',fontWeight:700}}>{bank.fixed5}%</p></div>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Κυμ. από</p><p style={{fontSize:20,fontFamily:'JetBrains Mono, monospace',color:'#60a5fa',fontWeight:700}}>+{bank.variable_spread_min}%</p><p style={{fontSize:10,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>σήμερα {fmtPct(market.euribor_3m+bank.variable_spread_min)}</p></div>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Δόση 150κ/25χρ</p><p style={{fontSize:20,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{fmtEur(myMonthly)}</p></div>
                      <div><p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:2}}>Max LTV / Ποσό</p><p style={{fontSize:16,fontFamily:'JetBrains Mono, monospace',color:'#a78bfa',fontWeight:700}}>{bank.max_ltv}% / {Math.round(bank.max_amount/1000)}κ€</p></div>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0,marginLeft:12}}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'transparent',border:'1px solid #242438',borderRadius:7,color:'#5a5a70',fontSize:10,fontFamily:'JetBrains Mono, monospace',textDecoration:'none'}}><ExternalLink size={11}/>Επίσκεψη</a>}
                    <button onClick={()=>setActiveTab('calculator')} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:7,color:'#d4af42',fontSize:10,fontFamily:'JetBrains Mono, monospace',cursor:'pointer'}}><Calculator size={11}/>Υπολόγισε</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
                  {bank.features.map((f,i)=><span key={i} style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'rgba(255,255,255,0.03)',border:'1px solid #1e1e30',color:'#6b6b85',display:'flex',alignItems:'center',gap:4}}><Check size={9} color="#34d399"/>{f}</span>)}
                  {filterGreen&&bank.green_discount>0&&<span style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.2)',color:'#34d399',display:'flex',alignItems:'center',gap:4}}><Leaf size={9}/>-{fmtPct(bank.green_discount)}</span>}
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {bank.programs.map(p=><span key={p} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(167,139,250,0.08)',border:'1px solid rgba(167,139,250,0.2)',color:'#a78bfa',fontFamily:'JetBrains Mono, monospace'}}>{p}</span>)}
                  <span style={{fontSize:9,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace',padding:'2px 7px'}}>{bank.fees}</span>
                </div>
              </div>
            )
          })}

          <div style={{background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace'}}>ⓘ Επιτόκια βάσει vresdaneio.gr ({updatedStr}). Η τελική τιμολόγηση εξαρτάται από το προφίλ δανειολήπτη. Για εξατομικευμένη προσφορά: e-stegastiko.gr ή απευθείας στην τράπεζα.</p>
          </div>
        </div>
      )}

      {/* ═══ PROGRAMS ═══ */}
      {activeTab==='programs'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'rgba(212,175,66,0.06)',border:'1px solid rgba(212,175,66,0.2)',borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:'#d4af42',fontFamily:'JetBrains Mono, monospace'}}>⚠️ Μόνο ενεργά ή επερχόμενα προγράμματα 2026. Πηγές: greece20.gov.gr, ypen.gov.gr, exoikonomo2025.gov.gr, dovaluegreece.gr — {updatedStr}</p>
          </div>
          {STATE_PROGRAMS.map(prog=>(
            <div key={prog.id} style={{background:'#12121f',border:`1px solid ${prog.color}30`,borderLeft:`4px solid ${prog.color}`,borderRadius:10,padding:18}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:22}}>{prog.icon}</span>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <p style={{fontSize:15,color:'#e2e2f0',fontWeight:700}}>{prog.name}</p>
                        <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:prog.status==='active'?'rgba(52,211,153,0.15)':'rgba(96,165,250,0.15)',color:prog.status==='active'?'#34d399':'#60a5fa',fontFamily:'JetBrains Mono, monospace',border:`1px solid ${prog.status==='active'?'rgba(52,211,153,0.3)':'rgba(96,165,250,0.3)'}`}}>{prog.status==='active'?'Ενεργό':'Επερχόμενο'}</span>
                        {prog.deadline_urgent&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(248,113,113,0.15)',color:'#f87171',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(248,113,113,0.3)'}}>⏰ Σύντομα λήγει</span>}
                      </div>
                      <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:`${prog.color}18`,color:prog.color,fontFamily:'JetBrains Mono, monospace',border:`1px solid ${prog.color}30`}}>{prog.type}</span>
                    </div>
                  </div>
                  <p style={{fontSize:12,color:'#9090a8',marginTop:4}}>{prog.desc}</p>
                </div>
                <a href={prog.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'7px 12px',background:`${prog.color}15`,border:`1px solid ${prog.color}40`,borderRadius:7,color:prog.color,fontSize:10,fontFamily:'JetBrains Mono, monospace',textDecoration:'none',flexShrink:0}}><ExternalLink size={11}/>Επίσκεψη</a>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:8}}>Κριτήρια</p>
                  {prog.criteria.map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}><Check size={11} color={prog.color}/><span style={{fontSize:11,color:'#9090a8'}}>{c}</span></div>)}
                </div>
                <div>
                  <p style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase',marginBottom:8}}>Στοιχεία</p>
                  {prog.max_amount&&<div style={{marginBottom:5}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>MAX </span><span style={{fontSize:14,color:prog.color,fontFamily:'JetBrains Mono, monospace',fontWeight:700}}>{fmtEur(prog.max_amount)}</span></div>}
                  {prog.max_ltv&&<div style={{marginBottom:5}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>LTV </span><span style={{fontSize:13,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace',fontWeight:700}}>{prog.max_ltv}%</span></div>}
                  {(prog as any).max_sqm&&<div style={{marginBottom:5}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>ΤΜ </span><span style={{fontSize:12,color:'#e2e2f0',fontFamily:'JetBrains Mono, monospace'}}>{(prog as any).max_sqm} τ.μ.</span></div>}
                  {(prog as any).age_max&&<div style={{marginBottom:5}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>ΗΛΙΚΙΑ </span><span style={{fontSize:12,color:'#e2e2f0',fontFamily:'JetBrains Mono, monospace'}}>{(prog as any).age_min}-{(prog as any).age_max} ετών</span></div>}
                  <div style={{marginBottom:5}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>DEADLINE </span><span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:prog.deadline_urgent?'#f87171':'#34d399'}}>{prog.deadline}</span></div>
                  <div style={{marginBottom:5}}><span style={{fontSize:9,color:'#4a4a60',fontFamily:'JetBrains Mono, monospace'}}>BUDGET </span><span style={{fontSize:11,color:'#d4af42'}}>{prog.total_budget}</span></div>
                </div>
              </div>
              {(prog as any).how_it_works&&<div style={{marginTop:10,background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:10,color:'#6b6b85'}}>⚙ {(prog as any).how_it_works}</p></div>}
              {prog.extra&&<div style={{marginTop:8,background:`${prog.color}08`,border:`1px solid ${prog.color}20`,borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:prog.color}}>⭐ {prog.extra}</p></div>}
              {prog.savings_example&&<div style={{marginTop:6,background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:7,padding:'8px 12px'}}><p style={{fontSize:11,color:'#34d399'}}>📊 {prog.savings_example}</p></div>}
              <div style={{marginTop:10,display:'flex',gap:5,flexWrap:'wrap'}}>{prog.banks.map(b=><span key={b} style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(255,255,255,0.03)',border:'1px solid #1e1e30',color:'#6b6b85'}}>{b}</span>)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ ADVISOR ═══ */}
      {activeTab==='advisor'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.15)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10}}>
            <Zap size={14} color="#a78bfa" style={{flexShrink:0,marginTop:1}}/>
            <p style={{fontSize:11,color:'#a78bfa',fontFamily:'JetBrains Mono, monospace'}}>Ο Advisor συνδυάζει τα δεδομένα σου για να προτείνει την καλύτερη στρατηγική. Επίλεξε τον τύπο σου.</p>
          </div>

          {/* Advisor quick inputs */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Στοιχεία Ανάλυσης</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              <div>
                <label style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',textTransform:'uppercase',display:'block',marginBottom:5}}>Σκοπός</label>
                <select style={{...{width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:12,fontFamily:'JetBrains Mono, monospace',outline:'none'} as React.CSSProperties,appearance:'none' as any}} value={advLoanType} onChange={e=>setAdvLoanType(e.target.value as LoanType)}>
                  {Object.entries(LOAN_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',textTransform:'uppercase',display:'block',marginBottom:5}}>Δανειολήπτης</label>
                <select style={{width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:12,fontFamily:'JetBrains Mono, monospace',outline:'none',appearance:'none' as any}} value={advBorrower} onChange={e=>setAdvBorrower(e.target.value as BorrowerType)}>
                  {Object.entries(BORROWER_PROFILES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',textTransform:'uppercase',display:'block',marginBottom:5}}>Ποσό (€)</label>
                <input style={{width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:12,fontFamily:'JetBrains Mono, monospace',outline:'none',boxSizing:'border-box' as any}} type="number" value={advAmount} onChange={e=>setAdvAmount(Number(e.target.value))}/>
              </div>
              <div>
                <label style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',textTransform:'uppercase',display:'block',marginBottom:5}}>Χρόνια</label>
                <input style={{width:'100%',background:'#08080d',border:'1px solid #242438',borderRadius:6,padding:'8px 10px',color:'#e2e2f0',fontSize:12,fontFamily:'JetBrains Mono, monospace',outline:'none',boxSizing:'border-box' as any}} type="number" value={advYears} onChange={e=>setAdvYears(Number(e.target.value))}/>
              </div>
            </div>
          </div>

          {/* Eligibility */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Έλεγχος Επιλεξιμότητας Προγραμμάτων</p>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {[
                {label:'Σπίτι μου ΙΙ — deadline 31/08/2026',eligible:(advBorrower==='young'||advBorrower==='family')&&advLoanType==='first_home',reason:(advBorrower==='young'||advBorrower==='family')&&advLoanType==='first_home'?'✓ Πληροίς':advLoanType!=='first_home'?'Άλλαξε σε "Πρώτη κατοικία"':'Απαιτείται ηλικία 25-50',saving:`Εξοικονόμηση ~${fmtEur(calcMonthly(advAmount,3.5,advYears)*advYears*12*0.45)} τόκων`},
                {label:'Αναβαθμίζω — deadline 31/08/2026',eligible:advLoanType==='energy',reason:advLoanType==='energy'?'✓ Κατάλληλος':'Άλλαξε σε "Ενεργειακή αναβάθμιση"',saving:'Επιδοτούμενο επιτόκιο ΤΑΑ'},
                {label:'Εξοικονομώ 2025 — deadline 30/06/2026',eligible:advLoanType==='energy',reason:advLoanType==='energy'?'✓ Κατάλληλο':'Μόνο για ενεργειακές παρεμβάσεις',saving:'Επιδότηση κόστους αναβάθμισης'},
                {label:'Πράσινο Δάνειο (-0.15 έως -0.25%)',eligible:advLoanType==='energy'||advLoanType==='renovation',reason:'Για ενεργειακά & ανακαίνιση',saving:`~${fmtEur(advAmount*0.002*advYears)} εξοικονόμηση τόκων`},
                {label:'Ένοπλες Δυνάμεις ΤΑΠ-ΟΙΚ',eligible:advBorrower==='military',reason:advBorrower==='military'?'✓ Δικαιούσαι':'Μόνο για αξιωματικούς/υπαξιωματικούς',saving:'Χαμηλότερο επιτόκιο ΤΑΠ'},
                {label:'Γέφυρα 3 (κυμαινόμενο δάνειο)',eligible:advRateType==='variable',reason:advRateType==='variable'?'✓ Εάν είσαι ευάλωτος δανειολήπτης':'Μόνο για κυμαινόμενα δάνεια',saving:'Επιδότηση 50% αύξησης δόσης'},
              ].map(item=>(
                <div key={item.label} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 13px',background:item.eligible?'rgba(52,211,153,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${item.eligible?'rgba(52,211,153,0.2)':'#1e1e30'}`,borderRadius:8}}>
                  <div style={{width:22,height:22,borderRadius:'50%',background:item.eligible?'rgba(52,211,153,0.2)':'rgba(248,113,113,0.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {item.eligible?<Check size={12} color="#34d399"/>:<X size={12} color="#f87171"/>}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:12,color:item.eligible?'#e2e2f0':'#5a5a70',fontWeight:item.eligible?500:400}}>{item.label}</p>
                    <p style={{fontSize:10,color:'#5a5a70'}}>{item.reason}</p>
                  </div>
                  {item.eligible&&<span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#34d399',background:'rgba(52,211,153,0.1)',padding:'3px 8px',borderRadius:5,whiteSpace:'nowrap'}}>{item.saving}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Best bank ranking */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Κατάταξη Τραπεζών — {fmtEur(advAmount)} / {advYears}χρ</p>
            {BANKS.slice().sort((a,b)=>a.fixed_min-b.fixed_min).slice(0,4).map((bank,i)=>{
              const m=calcMonthly(advAmount,bank.fixed_min,advYears)
              const ti=m*advYears*12-advAmount
              return(
                <div key={bank.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 13px',marginBottom:6,background:i===0?'rgba(212,175,66,0.06)':'rgba(255,255,255,0.02)',border:`1px solid ${i===0?'rgba(212,175,66,0.2)':'#1e1e30'}`,borderRadius:8}}>
                  <span style={{fontSize:18}}>{'🥇🥈🥉'.split('')[i]||'4'}</span>
                  <div style={{flex:1}}><p style={{fontSize:12,color:'#e2e2f0',fontWeight:600}}>{bank.name}</p><p style={{fontSize:10,color:'#5a5a70'}}>{bank.note}</p></div>
                  <div style={{textAlign:'right'}}>
                    <p style={{fontSize:14,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{fmtEur(m)}/μήνα</p>
                    <p style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Τόκοι: {fmtEur(ti)}</p>
                  </div>
                  <button onClick={()=>setActiveTab('calculator')} style={{padding:'5px 10px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:6,cursor:'pointer',color:'#d4af42',fontSize:10,fontFamily:'JetBrains Mono, monospace'}}>Επιλογή</button>
                </div>
              )
            })}
          </div>

          {/* Smart tips */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Έξυπνες Συμβουλές</p>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {[
                advAmount>200000&&{icon:'🏦',tip:'Δάνειο >200.000€: διαπραγματεύσου spread απευθείας με διεύθυνση τράπεζας — συχνά -0.10-0.20%.'},
                advLoanType==='first_home'&&advBorrower!=='young'&&advBorrower!=='family'&&{icon:'🏠',tip:'Σπίτι μου ΙΙ ισχύει έως 31/08/2026 για ηλικία 25-50. Αν πληροίς — η εξοικονόμηση είναι τεράστια.'},
                advLoanType==='investment'&&{icon:'💰',tip:`Επενδυτικό: ενοίκια φορολογούνται 15%/25%/35%. Λογιστική έκπτωση 5% δαπανών αυτόματα. Τόκοι δεν εκπίπτουν (δάνεια μετά 2013).`},
                advYears>25&&{icon:'⏱️',tip:`${advYears} χρόνια = υψηλοί τόκοι. Εξέτασε 20χρ: εξοικονόμηση ${fmtEur(Math.max(0,(calcMonthly(advAmount,3.5,advYears)*advYears*12)-(calcMonthly(advAmount,3.5,20)*20*12)))} τόκων.`},
                {icon:'📊',tip:`Stress test: αν Euribor ανέβει +2%, κυμαινόμενη δόση → ${fmtEur(calcMonthly(advAmount,market.euribor_3m+2.5,advYears))}/μήνα. Σκέψου σταθερό.`},
              ].filter(Boolean).slice(0,4).map((tip:any,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'9px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7}}>
                  <span style={{fontSize:16,flexShrink:0}}>{tip.icon}</span>
                  <p style={{fontSize:11,color:'#9090a8',lineHeight:1.5}}>{tip.tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ GUIDE ═══ */}
      {activeTab==='guide'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Process */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:16}}>Βήματα Διαδικασίας Δανείου</p>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {PROCESS_STEPS.map((step,i)=>(
                <div key={i} style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(212,175,66,0.15)',border:'1px solid rgba(212,175,66,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{fontSize:13,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',fontWeight:700}}>{step.step}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <p style={{fontSize:13,color:'#e2e2f0',fontWeight:600}}>{step.title}</p>
                      {step.time!=='—'&&<span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70',background:'rgba(255,255,255,0.03)',padding:'2px 7px',borderRadius:4,border:'1px solid #1e1e30'}}>{step.time}</span>}
                    </div>
                    <p style={{fontSize:11,color:'#6b6b85',lineHeight:1.6}}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Special categories */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Ειδικές Κατηγορίες</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                {title:'Ένοπλες Δυνάμεις',icon:'🎖️',desc:'ΤΑΠ-ΟΙΚ: ειδικά επιδοτούμενα δάνεια για αξιωματικούς/υπαξιωματικούς.',url:'https://tap.gr'},
                {title:'Κάτοικοι Εξωτερικού',icon:'✈️',desc:'Επιπλέον έγγραφα, LTV ≤70%, ΣΑΔΦ για φορολογία εξωτερικού.',url:'https://e-stegastiko.gr/ellines-eksoterikou/'},
                {title:'Νέοι 25-50 ετών',icon:'⭐',desc:'Σπίτι μου ΙΙ deadline 31/08/2026. Alpha: 2.50% σταθερό 3χρ.',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Επαγγελματίες',icon:'💼',desc:'LTV 65-70%, 2+ χρόνια φορολογικά, δαπάνες εκπιπτόμενες.',url:'https://e-stegastiko.gr/epaggelmaties/'},
              ].map(cat=>(
                <div key={cat.title} style={{background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:8,padding:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{fontSize:18}}>{cat.icon}</span><p style={{fontSize:12,color:'#e2e2f0',fontWeight:600}}>{cat.title}</p></div>
                  <p style={{fontSize:11,color:'#6b6b85',lineHeight:1.5,marginBottom:8}}>{cat.desc}</p>
                  <a href={cat.url} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,color:'#60a5fa',textDecoration:'none',fontFamily:'JetBrains Mono, monospace'}}><ExternalLink size={10}/>Περισσότερα</a>
                </div>
              ))}
            </div>
          </div>

          {/* Euribor History Chart */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <div style={{marginBottom:14}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em'}}>Ιστορικό Euribor 3M — 2020 έως Σήμερα</p>
              <p style={{fontSize:11,color:'#5a5a70',marginTop:2}}>Πηγή: ECB Statistical Data Warehouse</p>
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:3,height:120,overflowX:'auto',paddingBottom:20,position:'relative'}}>
              {/* Zero line */}
              <div style={{position:'absolute',bottom:20,left:0,right:0,height:1,background:'rgba(255,255,255,0.08)'}}/>
              {EURIBOR_HISTORY.map((d,i)=>{
                const minVal=-0.6,maxVal=4.1,range=maxVal-minVal
                const isNeg=d.val<0
                const barH=Math.abs(d.val/range)*100
                const isRecent=d.date>='2026-01'
                const isCurrent=d.date==='2026-06'
                return(
                  <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,minWidth:22,flex:1,position:'relative'}}>
                    {isCurrent&&<span style={{fontSize:7,fontFamily:'JetBrains Mono, monospace',color:'#34d399',whiteSpace:'nowrap',position:'absolute',top:-16}}>{fmtPct(d.val)}</span>}
                    <div style={{
                      width:'100%',
                      height:barH,
                      background:isCurrent?'#34d399':isRecent?'rgba(52,211,153,0.4)':isNeg?'rgba(96,165,250,0.3)':'rgba(212,175,66,0.4)',
                      borderRadius:'3px 3px 0 0',
                      marginBottom:isNeg?0:undefined,
                      border:isCurrent?'1px solid #34d399':undefined,
                    }}/>
                    {i%4===0&&<span style={{fontSize:7,fontFamily:'JetBrains Mono, monospace',color:'#3a3a54',transform:'rotate(-45deg)',transformOrigin:'top left',marginTop:4,whiteSpace:'nowrap'}}>{d.date.slice(0,4)}</span>}
                  </div>
                )
              })}
            </div>
            <div style={{display:'flex',gap:14,marginTop:4,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,background:'rgba(96,165,250,0.3)',borderRadius:2}}/><span style={{fontSize:9,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>Αρνητικό (2020-2022)</span></div>
              <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,background:'rgba(212,175,66,0.4)',borderRadius:2}}/><span style={{fontSize:9,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>Άνοδος (2022-2024)</span></div>
              <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,background:'rgba(52,211,153,0.4)',borderRadius:2}}/><span style={{fontSize:9,color:'#5a5a70',fontFamily:'JetBrains Mono, monospace'}}>Πτώση ΕΚΤ (2025-2026)</span></div>
              <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:10,height:10,background:'#34d399',borderRadius:2}}/><span style={{fontSize:9,color:'#34d399',fontFamily:'JetBrains Mono, monospace'}}>Σήμερα: {fmtPct(market.euribor_3m)}</span></div>
            </div>
            <div style={{marginTop:10,background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.15)',borderRadius:6,padding:'7px 10px'}}>
              <p style={{fontSize:10,color:'#60a5fa',fontFamily:'JetBrains Mono, monospace'}}>📊 Το Euribor έφτασε στο peak 4.0% τον Οκτ 2023. Σήμερα στο {fmtPct(market.euribor_3m)} — μείωση {fmtPct(4.0-market.euribor_3m)} από το peak. Κυμαινόμενα δάνεια που πάρθηκαν το 2021 με Euribor -0.5% σήμερα έχουν {fmtPct(market.euribor_3m+0.5)} επιτόκιο.</p>
            </div>
          </div>

          {/* PDF Export */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>PDF Export Ανάλυσης Δανείου</p>
            <p style={{fontSize:11,color:'#6b6b85',marginBottom:12}}>Κατέβασε πλήρη ανάλυση δανείου για να την έχεις στα χέρια σου ή να την μοιραστείς.</p>
            <button onClick={()=>{
              const content=`
PROPERTY OS — ΑΝΑΛΥΣΗ ΣΤΕΓΑΣΤΙΚΟΥ ΔΑΝΕΙΟΥ
==========================================
Ημερομηνία: ${new Date().toLocaleDateString('el-GR')}
Euribor 3M: ${fmtPct(market.euribor_3m)} | ECB: ${fmtPct(market.ecb_rate)}

ΑΓΟΡΑ: ${fmtPct(market.euribor_3m)}
ΠΗΓΗ: Τράπεζα της Ελλάδος / ECB | Ενημέρωση: ${new Date(market.updated_at).toLocaleDateString('el-GR')}

ΤΡΑΠΕΖΕΣ — ΕΠΙΤΟΚΙΑ ΣΤΑΘΕΡΟΥ (Απρ/Ιουν 2026)
================================================
${BANKS.map(b=>`${b.name.padEnd(20)} 5χρ: ${b.fixed5}% | Κυμ: +${b.variable_spread_min}% | LTV: ${b.max_ltv}% | Σπίτι ΙΙ: ${b.spiti_mou?'ΝΑΙ':'ΟΧΙ'}`).join('\n')}

ΚΡΑΤΙΚΑ ΠΡΟΓΡΑΜΜΑΤΑ 2026
=========================
${STATE_PROGRAMS.filter(p=>p.status==='active').map(p=>`${p.name}: ${p.deadline}`).join('\n')}

ΦΟΡΟΛΟΓΙΚΑ (ΑΑΔΕ 2026)
========================
Φόρος Μεταβίβασης (ΦΜΑ): 3%
Απαλλαγή πρώτης κατοικίας: Άγαμος έως €200.000 | Έγγαμος έως €250.000
Φορολόγηση ενοικίων: 15% (έως €12.000) | 25% (€12.001-24.000) | 35% (άνω €24.000)
Αυτόματη έκπτωση δαπανών: 5%

ΧΡΗΣΙΜΟΙ ΣΥΝΔΕΣΜΟΙ
===================
Σπίτι μου ΙΙ: greece20.gov.gr/home-loans/
Εξοικονομώ 2025: exoikonomo2025.gov.gr
Γέφυρα 3: dovaluegreece.gr
Σύγκριση επιτοκίων: vresdaneio.gr
Επίσημα επιτόκια: bankofgreece.gr

DISCLAIMER: Πληροφορίες ενημερωτικές — δεν αποτελούν χρηματοοικονομική/φορολογική συμβουλή.
              `.trim()
              const blob=new Blob([content],{type:'text/plain;charset=utf-8'})
              const url=URL.createObjectURL(blob)
              const a=document.createElement('a')
              a.href=url;a.download=`PropertyOS-LoanAnalysis-${new Date().toISOString().split('T')[0]}.txt`
              a.click();URL.revokeObjectURL(url)
            }} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',background:'rgba(212,175,66,0.1)',border:'1px solid rgba(212,175,66,0.3)',borderRadius:8,cursor:'pointer',color:'#d4af42',fontSize:12,fontFamily:'JetBrains Mono, monospace',fontWeight:600}}>
              📄 Κατέβασε Ανάλυση (.txt)
            </button>
          </div>

          {/* Glossary */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <button onClick={()=>setShowGlossary(g=>!g)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',background:'none',border:'none',cursor:'pointer',padding:0}}>
              <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em'}}>Γλωσσάρι Όρων</p>
              {showGlossary?<ChevronUp size={13} color="#5a5a70"/>:<ChevronDown size={13} color="#5a5a70"/>}
            </button>
            {showGlossary&&(
              <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
                {GLOSSARY.map((item,i)=>(
                  <div key={i} style={{padding:'9px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7}}>
                    <p style={{fontSize:12,color:'#d4af42',fontWeight:600,marginBottom:3}}>{item.term}</p>
                    <p style={{fontSize:10,color:'#9090a8',lineHeight:1.5}}>{item.def}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Useful links */}
          <div style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
            <p style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#d4af42',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12}}>Επίσημοι Σύνδεσμοι & Πηγές</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {[
                {name:'greece20.gov.gr',desc:'Σπίτι μου ΙΙ — επίσημη πληροφόρηση',url:'https://greece20.gov.gr/home-loans/'},
                {name:'exoikonomo2025.gov.gr',desc:'Εξοικονομώ 2025 — επίσημο',url:'https://exoikonomo2025.gov.gr/'},
                {name:'ypen.gov.gr',desc:'ΥΠΕΝ — παρατάσεις προγραμμάτων',url:'https://ypen.gov.gr/exoikonomo-anakoinosi-parataseon/'},
                {name:'e-stegastiko.gr',desc:'Πλατφόρμα δανείων ΤτΕ',url:'https://e-stegastiko.gr'},
                {name:'vresdaneio.gr',desc:'Σύγκριση επιτοκίων',url:'https://vresdaneio.gr/epitokia/index.html'},
                {name:'dovaluegreece.gr',desc:'Γέφυρα 3 — επιδότηση δόσης',url:'https://dovaluegreece.gr/programma-epidotisis-dosis-logo-ayxisis-epitokion-gefyra-3'},
                {name:'bankofgreece.gr',desc:'Επίσημα επιτόκια ΤτΕ',url:'https://www.bankofgreece.gr'},
                {name:'ktimatologio.gr',desc:'Έλεγχος τίτλων & βαρών',url:'https://www.ktimatologio.gr'},
                {name:'aade.gr',desc:'ΑΑΔΕ — φορολογικά ακινήτων',url:'https://www.aade.gr'},
                {name:'opeka.gr',desc:'ΟΠΕΚΑ — Ανακαινίζω & Νοικιάζω',url:'https://www.opeka.gr'},
              ].map(link=>(
                <a key={link.name} href={link.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:8,textDecoration:'none'}}>
                  <ExternalLink size={12} color="#60a5fa" style={{flexShrink:0}}/>
                  <div><p style={{fontSize:11,color:'#60a5fa',fontWeight:500}}>{link.name}</p><p style={{fontSize:10,color:'#5a5a70'}}>{link.desc}</p></div>
                </a>
              ))}
            </div>
          </div>

          <div style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:'#f87171',fontFamily:'JetBrains Mono, monospace'}}>⚠ Disclaimer: Πληροφορίες ενημερωτικές — δεν αποτελούν χρηματοοικονομική ή φορολογική συμβουλή. Για εξατομικευμένη συμβουλή: τράπεζα, πιστοποιημένος σύμβουλος ή φοροτεχνικός. Τα επιτόκια και προγράμματα αλλάζουν — πάντα επαληθεύετε από επίσημες πηγές.</p>
          </div>
        </div>
      )}

      {/* ═══ SAVED ═══ */}
      {activeTab==='saved'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {savedLoans.length===0&&(
            <div style={{textAlign:'center',padding:'40px 0'}}>
              <Save size={28} color="#2a2a3e" style={{margin:'0 auto 10px'}}/>
              <p style={{fontSize:12,fontFamily:'JetBrains Mono, monospace',color:'#3a3a54'}}>Δεν υπάρχουν αποθηκευμένα δάνεια</p>
              <button onClick={()=>setActiveTab('calculator')} style={{marginTop:10,fontSize:11,color:'#d4af42',background:'none',border:'none',cursor:'pointer',fontFamily:'JetBrains Mono, monospace'}}>→ Πήγαινε στο Calculator</button>
            </div>
          )}
          {savedLoans.map(loan=>{
            const m=calcMonthly(loan.amount,loan.rate,loan.years)
            const ti=m*loan.years*12-loan.amount
            const ltv2=loan.property_value>0?(loan.amount/loan.property_value)*100:0
            const monthsElapsed=loan.start_date?Math.floor((Date.now()-new Date(loan.start_date).getTime())/(1000*60*60*24*30.44)):0
            const remainingMonths=Math.max(0,loan.years*12-monthsElapsed)
            const balanceApprox=calcMonthly(loan.amount,loan.rate,loan.years)*remainingMonths*(1-loan.rate/100/12*(remainingMonths/2))
            return(
              <div key={loan.id} style={{background:'#12121f',border:'1px solid #242438',borderRadius:10,padding:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <p style={{fontSize:14,color:'#e2e2f0',fontWeight:600}}>{loan.bank}</p>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(52,211,153,0.1)',color:'#34d399',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(52,211,153,0.2)'}}>{loan.status==='active'?'Ενεργό':'Ανενεργό'}</span>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(96,165,250,0.1)',color:'#60a5fa',fontFamily:'JetBrains Mono, monospace',border:'1px solid rgba(96,165,250,0.2)'}}>{LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type}</span>
                    </div>
                    {loan.notes&&<p style={{fontSize:11,color:'#5a5a70'}}>{loan.notes}</p>}
                  </div>
                  <button onClick={()=>deleteLoan(loan.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#3a3a54',display:'flex'}}><X size={14}/></button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:8}}>
                  <KPI label="Ποσό" value={fmtEur(loan.amount)} color="#d4af42"/>
                  <KPI label="Επιτόκιο" value={fmtPct(loan.rate)} color="#60a5fa" sub={loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό'}/>
                  <KPI label="Δόση/μήνα" value={fmtEur(m)} color="#34d399"/>
                  <KPI label="Σύν. τόκοι" value={fmtEur(ti)} color="#f87171"/>
                  <KPI label="LTV" value={`${ltv2.toFixed(1)}%`} color={ltv2>80?'#fb923c':'#34d399'}/>
                </div>
                {loan.start_date&&(
                  <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid #1e1e30',borderRadius:7,display:'flex',gap:16,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Έναρξη: {loan.start_date}</span>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Αποπληρωθέντες μήνες: ~{monthsElapsed}</span>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#5a5a70'}}>Μένουν: ~{remainingMonths} μήνες</span>
                    <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'#d4af42'}}>Εκτ. Υπόλοιπο: ~{fmtEur(Math.max(0,balanceApprox))}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
