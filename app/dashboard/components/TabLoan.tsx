'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import {
  Calculator, Building2, Star, Zap, BookOpen, Save,
  Check, X, ExternalLink, Leaf, ChevronDown, ChevronUp
} from 'lucide-react'
import TabLoanCalculator from './TabLoanCalculator'
import {
  BANKS, STATE_PROGRAMS, LOAN_TYPES, BORROWER_PROFILES,
  GLOSSARY, PROCESS_STEPS, MARKET_FALLBACK, EURIBOR_HISTORY,
  calcMonthly, fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, SavedLoan, MarketRates
} from './TabLoanData'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:'#0a0a0f', card:'#12121f', border:'#1e1e2e', border2:'#242438',
  gold:'#d4af42', goldDim:'rgba(212,175,66,0.10)', goldBorder:'rgba(212,175,66,0.22)',
  red:'#f87171', green:'#34d399', blue:'#60a5fa', purple:'#a78bfa', orange:'#fb923c',
  muted:'#5a5a70', muted2:'#4a4a60', text:'#e2e2f0', textDim:'#9090a8',
}
const mono = 'JetBrains Mono, monospace'

const sT = (label:string,right?:React.ReactNode) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:C.gold,display:'inline-block'}}/>
      <p style={{fontSize:10,fontFamily:mono,color:C.muted,textTransform:'uppercase',letterSpacing:'0.1em'}}>{label}</p>
    </div>
    {right}
  </div>
)

function KPI({label,value,color=C.text,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
      <p style={{fontSize:9,fontFamily:mono,color:C.muted2,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{label}</p>
      <p style={{fontSize:16,fontFamily:mono,color,fontWeight:700}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:C.muted,marginTop:3}}>{sub}</p>}
    </div>
  )
}

function ChartTooltip({active,payload,label}:any) {
  if(!active||!payload?.length)return null
  return(
    <div style={{background:'#1a1a2e',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 14px',fontSize:11,fontFamily:mono}}>
      <p style={{color:C.muted,marginBottom:6}}>{label}</p>
      {payload.map((p:any,i:number)=><p key={i} style={{color:p.color||C.gold,marginBottom:2}}>{p.name||''}: {typeof p.value==='number'&&p.value>100?fmtEur(p.value):fmtPct(p.value)}</p>)}
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
  const [advLoanType,setAdvLoanType]=useState<LoanType>('purchase')
  const [advBorrower,setAdvBorrower]=useState<BorrowerType>('individual')
  const [advAmount,setAdvAmount]=useState(150000)
  const [advYears,setAdvYears]=useState(25)
  const [advRateType,setAdvRateType]=useState<RateType>('fixed')

  useEffect(()=>{loadMarket();loadSaved()},[propertyId])

  async function loadMarket(){
    setEuriborLoading(true)
    try{const{data}=await supabase.from('market_rates').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(data)setMarket(data as MarketRates)}catch{}
    setEuriborLoading(false)
  }
  async function loadSaved(){const{data}=await supabase.from('loans').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false});setSavedLoans(data||[])}
  async function handleSaveLoan(loan:Partial<SavedLoan>){await supabase.from('loans').insert({...loan,property_id:propertyId,user_id:userId});await loadSaved()}
  async function handleSaveToCalendar(monthly:number,years:number,startDate:string,bankName:string){
    const d=new Date(startDate),events=[]
    for(let i=0;i<Math.min(years*12,60);i++){
      const evDate=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate())
      events.push({property_id:propertyId,user_id:userId,title:`Δόση δανείου${bankName?` - ${bankName}`:''}`,category:'financial',event_date:evDate.toISOString().split('T')[0],amount:Math.round(monthly),priority:'high',status:'pending',recurring:true,recurring_interval:'monthly',source:'manual'})
    }
    for(let i=0;i<events.length;i+=20)await supabase.from('calendar_events').insert(events.slice(i,i+20))
    alert(`✓ ${Math.min(years*12,60)} δόσεις → Ημερολόγιο`)
  }
  async function handleSaveToExpenses(monthly:number,bankName:string){
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Δόση δανείου${bankName?` - ${bankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:new Date().toISOString().split('T')[0]})
    alert('✓ Δόση → Δαπάνες')
  }
  async function deleteLoan(id:string){if(!confirm('Διαγραφή;'))return;await supabase.from('loans').delete().eq('id',id);await loadSaved()}

  const updatedStr=new Date(market.updated_at).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})

  const tabs=[
    {id:'calculator',label:'Calculator',icon:<Calculator size={11}/>},
    {id:'banks',label:'Τράπεζες',icon:<Building2 size={11}/>},
    {id:'programs',label:'Κρατικά',icon:<Star size={11}/>},
    {id:'advisor',label:'Advisor',icon:<Zap size={11}/>},
    {id:'guide',label:'Οδηγός',icon:<BookOpen size={11}/>},
    {id:'saved',label:`Αποθηκευμένα${savedLoans.length>0?` (${savedLoans.length})`:''}`,icon:<Save size={11}/>},
  ]

  // Euribor history chart data
  const euriborChartData = EURIBOR_HISTORY.map(d=>({
    date:d.date.slice(0,7),
    Euribor:d.val,
  }))

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {/* Header */}
      <div style={{background:'rgba(212,175,66,0.04)',border:`1px solid ${C.goldBorder}`,borderRadius:10,padding:'11px 16px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <Calculator size={15} color={C.gold}/>
          <p style={{fontSize:11,color:C.gold,fontFamily:mono,fontWeight:600,letterSpacing:'0.03em'}}>Εργαλείο Στεγαστικών Δανείων</p>
        </div>
        <div style={{display:'flex',gap:18,marginLeft:'auto',flexWrap:'wrap',alignItems:'center'}}>
          {[
            {label:'Euribor 3M',val:market.euribor_3m,color:C.blue},
            {label:'Euribor 1M',val:market.euribor_1m,color:C.blue},
            {label:'ΕΚΤ',val:market.ecb_rate,color:C.purple},
          ].map(item=>(
            <span key={item.label} style={{fontSize:10,fontFamily:mono,color:C.muted}}>
              {item.label}{' '}
              {euriborLoading
                ?<span style={{color:C.border2}}>…</span>
                :<span style={{color:item.color,fontWeight:600}}>{fmtPct(item.val)}</span>
              }
            </span>
          ))}
          <a href="https://www.bankofgreece.gr" target="_blank" rel="noreferrer" style={{fontSize:9,fontFamily:mono,color:C.muted2,textDecoration:'none'}}>Ενημ. {updatedStr}</a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:C.card,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
        {tabs.map((t,i)=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id as any)} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5,padding:'10px 0',border:'none',borderRight:i<tabs.length-1?`1px solid ${C.border}`:'none',cursor:'pointer',fontSize:10,fontFamily:mono,background:activeTab===t.id?C.goldDim:'transparent',color:activeTab===t.id?C.gold:C.muted,transition:'all 0.15s',letterSpacing:'0.02em'}}>
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
          {/* Filters */}
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            {[
              {label:'Πράσινα Δάνεια',icon:<Leaf size={10}/>,active:filterGreen,toggle:()=>setFilterGreen(f=>!f)},
              {label:'Σπίτι μου ΙΙ',icon:'🏠',active:filterSpiti,toggle:()=>setFilterSpiti(f=>!f)},
            ].map(f=>(
              <button key={String(f.label)} onClick={f.toggle} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 13px',background:f.active?'rgba(52,211,153,0.08)':'transparent',border:`1px solid ${f.active?'rgba(52,211,153,0.3)':C.border2}`,borderRadius:7,cursor:'pointer',color:f.active?C.green:C.muted,fontSize:11,fontFamily:mono,transition:'all 0.15s'}}>
                {f.icon}{f.label}
              </button>
            ))}
            <p style={{fontSize:9,fontFamily:mono,color:C.muted2,marginLeft:'auto'}}>vresdaneio.gr · {updatedStr}</p>
          </div>

          {/* Rate table */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16,overflowX:'auto'}}>
            {sT('Σύγκριση Επιτοκίων — Ιούνιος 2026')}
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {['Τράπεζα','3χρ','5χρ','10χρ','15χρ','20χρ','Κυμ. spread','LTV','ΣΙΙ'].map(h=>(
                    <th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:9,fontFamily:mono,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>(
                  <tr key={bank.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:'9px 10px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{width:8,height:8,borderRadius:2,background:bank.color,display:'inline-block',flexShrink:0}}/>
                        <span style={{fontSize:12,color:C.text,fontWeight:500}}>{bank.name}</span>
                      </div>
                    </td>
                    {(['fixed3','fixed5','fixed10','fixed15','fixed20'] as const).map(k=>(
                      <td key={k} style={{padding:'9px 10px',fontFamily:mono,fontSize:11,color:C.blue}}>{(bank as any)[k]}%</td>
                    ))}
                    <td style={{padding:'9px 10px',fontFamily:mono,fontSize:11,color:C.green}}>+{bank.variable_spread_min}-{bank.variable_spread_max}%</td>
                    <td style={{padding:'9px 10px',fontFamily:mono,fontSize:11,color:bank.max_ltv>=90?C.green:C.gold}}>{bank.max_ltv}%</td>
                    <td style={{padding:'9px 10px'}}>{bank.spiti_mou?<Check size={13} color={C.green}/>:<X size={13} color={C.border2}/>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{fontSize:10,color:C.muted,marginTop:12,lineHeight:1.6}}>ⓘ Ενδεικτικά επιτόκια βάσει vresdaneio.gr. Η τελική τιμολόγηση εξαρτάται από το προφίλ δανειολήπτη και το ακίνητο. → <a href="https://e-stegastiko.gr" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>e-stegastiko.gr</a> για εξατομικευμένη προσφορά.</p>
          </div>

          {/* Bank cards */}
          {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>{
            const effMin=filterGreen?bank.fixed_min-bank.green_discount:bank.fixed_min
            const myMonthly=calcMonthly(150000,effMin,25)
            return(
              <div key={bank.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${bank.color}`,borderRadius:10,padding:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                      <p style={{fontSize:15,color:C.text,fontWeight:700}}>{bank.name}</p>
                      <span style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:`${bank.color}18`,color:bank.color,fontFamily:mono,border:`1px solid ${bank.color}30`}}>{bank.note}</span>
                      {bank.spiti_mou&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(52,211,153,0.08)',color:C.green,fontFamily:mono,border:'1px solid rgba(52,211,153,0.18)'}}>🏠 Σπίτι ΙΙ</span>}
                    </div>
                    <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                      {[
                        {label:'Σταθερό 5χρ',val:`${bank.fixed5}%`,color:C.green,size:20},
                        {label:'Κυμαινόμενο spread',val:`+${bank.variable_spread_min}%`,color:C.blue,size:20,sub:`σήμερα ${fmtPct(market.euribor_3m+bank.variable_spread_min)}`},
                        {label:'Δόση 150κ/25χρ',val:fmtEur(myMonthly),color:C.gold,size:20},
                        {label:'Max LTV / Ποσό',val:`${bank.max_ltv}% / ${Math.round(bank.max_amount/1000)}κ€`,color:C.purple,size:16},
                      ].map(item=>(
                        <div key={item.label}>
                          <p style={{fontSize:9,color:C.muted2,fontFamily:mono,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{item.label}</p>
                          <p style={{fontSize:item.size,fontFamily:mono,color:item.color,fontWeight:700,lineHeight:1}}>{item.val}</p>
                          {(item as any).sub&&<p style={{fontSize:9,color:C.muted,fontFamily:mono,marginTop:2}}>{(item as any).sub}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0,marginLeft:16}}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:'transparent',border:`1px solid ${C.border}`,borderRadius:7,color:C.muted,fontSize:10,fontFamily:mono,textDecoration:'none'}}><ExternalLink size={10}/>Επίσκεψη</a>}
                    <button onClick={()=>setActiveTab('calculator')} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:C.goldDim,border:`1px solid ${C.goldBorder}`,borderRadius:7,color:C.gold,fontSize:10,fontFamily:mono,cursor:'pointer'}}><Calculator size={10}/>Υπολόγισε</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
                  {bank.features.map((f,i)=>(
                    <span key={i} style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'rgba(255,255,255,0.02)',border:`1px solid ${C.border}`,color:C.textDim,display:'flex',alignItems:'center',gap:4}}>
                      <span style={{width:4,height:4,borderRadius:'50%',background:C.green,display:'inline-block'}}/>
                      {f}
                    </span>
                  ))}
                  {filterGreen&&bank.green_discount>0&&<span style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',color:C.green,display:'flex',alignItems:'center',gap:4}}><Leaf size={9}/>-{fmtPct(bank.green_discount)}</span>}
                </div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {bank.programs.map(p=><span key={p} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.18)',color:C.purple,fontFamily:mono}}>{p}</span>)}
                  <span style={{fontSize:9,color:C.muted,fontFamily:mono,padding:'2px 6px'}}>{bank.fees}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ PROGRAMS ═══ */}
      {activeTab==='programs'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'rgba(212,175,66,0.04)',border:`1px solid ${C.goldBorder}`,borderRadius:8,padding:'10px 14px'}}>
            <p style={{fontSize:10,color:C.gold,fontFamily:mono}}>Μόνο ενεργά ή επερχόμενα προγράμματα 2026. Πηγές: <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>greece20.gov.gr</a>, <a href="https://ypen.gov.gr/exoikonomo-anakoinosi-parataseon/" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>ypen.gov.gr</a>, <a href="https://exoikonomo2025.gov.gr/" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>exoikonomo2025.gov.gr</a> — {updatedStr}</p>
          </div>

          {STATE_PROGRAMS.map(prog=>(
            <div key={prog.id} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${prog.color}`,borderRadius:10,padding:18}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <span style={{fontSize:20}}>{prog.icon}</span>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <p style={{fontSize:14,color:C.text,fontWeight:700}}>{prog.name}</p>
                        <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:prog.status==='active'?'rgba(52,211,153,0.1)':'rgba(96,165,250,0.1)',color:prog.status==='active'?C.green:C.blue,fontFamily:mono,border:`1px solid ${prog.status==='active'?'rgba(52,211,153,0.2)':'rgba(96,165,250,0.2)'}`}}>{prog.status==='active'?'Ενεργό':'Επερχόμενο'}</span>
                        {prog.deadline_urgent&&<span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(248,113,113,0.1)',color:C.red,fontFamily:mono,border:'1px solid rgba(248,113,113,0.2)'}}>⏰ Σύντομα λήγει</span>}
                      </div>
                      <p style={{fontSize:9,color:prog.color,fontFamily:mono,marginTop:3}}>{prog.type}</p>
                    </div>
                  </div>
                  <p style={{fontSize:11,color:C.textDim,lineHeight:1.6}}>{prog.desc}</p>
                </div>
                <a href={prog.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:`${prog.color}10`,border:`1px solid ${prog.color}30`,borderRadius:7,color:prog.color,fontSize:10,fontFamily:mono,textDecoration:'none',flexShrink:0,marginLeft:12}}><ExternalLink size={10}/>Επίσκεψη</a>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:12}}>
                <div>
                  <p style={{fontSize:9,color:C.muted,fontFamily:mono,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Κριτήρια</p>
                  {prog.criteria.map((c,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:7,marginBottom:5}}>
                      <span style={{width:4,height:4,borderRadius:'50%',background:prog.color,flexShrink:0}}/>
                      <span style={{fontSize:11,color:C.textDim}}>{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{fontSize:9,color:C.muted,fontFamily:mono,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Στοιχεία</p>
                  {[
                    prog.max_amount&&['MAX ΠΟΣΟ',fmtEur(prog.max_amount),prog.color,14],
                    prog.max_ltv&&['MAX LTV',`${prog.max_ltv}%`,C.blue,14],
                    (prog as any).max_sqm&&['MAX ΤΜ',`${(prog as any).max_sqm} τ.μ.`,C.text,12],
                    (prog as any).age_max&&['ΗΛΙΚΙΑ',`${(prog as any).age_min}-${(prog as any).age_max} ετών`,C.text,12],
                    ['ΔΙΑΡΚΕΙΑ',prog.duration,C.text,11],
                    ['DEADLINE',prog.deadline,prog.deadline_urgent?C.red:C.green,11],
                    ['BUDGET',prog.total_budget,C.gold,11],
                  ].filter(Boolean).map((item:any)=>(
                    <div key={item[0]} style={{marginBottom:6}}>
                      <span style={{fontSize:8,color:C.muted2,fontFamily:mono,letterSpacing:'0.08em'}}>{item[0]} </span>
                      <span style={{fontSize:item[3],fontFamily:mono,color:item[2],fontWeight:item[3]>12?700:400}}>{item[1]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {(prog as any).how_it_works&&<div style={{background:'rgba(255,255,255,0.02)',border:`1px solid ${C.border}`,borderRadius:7,padding:'9px 12px',marginBottom:8}}><p style={{fontSize:10,color:C.muted,lineHeight:1.6}}>⚙ {(prog as any).how_it_works}</p></div>}
              {prog.extra&&<div style={{background:`${prog.color}06`,border:`1px solid ${prog.color}20`,borderRadius:7,padding:'9px 12px',marginBottom:8}}><p style={{fontSize:11,color:prog.color,lineHeight:1.5}}>⭐ {prog.extra}</p></div>}
              {prog.savings_example&&<div style={{background:'rgba(52,211,153,0.04)',border:'1px solid rgba(52,211,153,0.14)',borderRadius:7,padding:'9px 12px',marginBottom:10}}><p style={{fontSize:11,color:C.green}}>📊 {prog.savings_example}</p></div>}
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {prog.banks.map(b=><span key={b} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(255,255,255,0.02)',border:`1px solid ${C.border}`,color:C.muted,fontFamily:mono}}>{b}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ ADVISOR ═══ */}
      {activeTab==='advisor'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'rgba(167,139,250,0.05)',border:'1px solid rgba(167,139,250,0.15)',borderRadius:8,padding:'10px 14px',display:'flex',gap:10,alignItems:'flex-start'}}>
            <Zap size={13} color={C.purple} style={{flexShrink:0,marginTop:1}}/>
            <p style={{fontSize:11,color:C.purple,fontFamily:mono}}>Ο Advisor ελέγχει επιλεξιμότητα και κατατάσσει τράπεζες βάσει των επιλογών σου.</p>
          </div>

          {/* Quick inputs */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Στοιχεία Ανάλυσης')}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {[
                {label:'Σκοπός',el:<select style={{width:'100%',background:'#08080d',border:`1px solid ${C.border2}`,borderRadius:6,padding:'8px 10px',color:C.text,fontSize:12,fontFamily:mono,outline:'none',appearance:'none' as any}} value={advLoanType} onChange={e=>setAdvLoanType(e.target.value as LoanType)}>{Object.entries(LOAN_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>},
                {label:'Δανειολήπτης',el:<select style={{width:'100%',background:'#08080d',border:`1px solid ${C.border2}`,borderRadius:6,padding:'8px 10px',color:C.text,fontSize:12,fontFamily:mono,outline:'none',appearance:'none' as any}} value={advBorrower} onChange={e=>setAdvBorrower(e.target.value as BorrowerType)}>{Object.entries(BORROWER_PROFILES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>},
                {label:'Ποσό (€)',el:<input style={{width:'100%',background:'#08080d',border:`1px solid ${C.border2}`,borderRadius:6,padding:'8px 10px',color:C.text,fontSize:12,fontFamily:mono,outline:'none',boxSizing:'border-box' as any}} type="number" value={advAmount} onChange={e=>setAdvAmount(Number(e.target.value))}/>},
                {label:'Χρόνια',el:<input style={{width:'100%',background:'#08080d',border:`1px solid ${C.border2}`,borderRadius:6,padding:'8px 10px',color:C.text,fontSize:12,fontFamily:mono,outline:'none',boxSizing:'border-box' as any}} type="number" value={advYears} onChange={e=>setAdvYears(Number(e.target.value))}/>},
              ].map(item=>(
                <div key={item.label}>
                  <p style={{fontSize:9,fontFamily:mono,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',display:'block',marginBottom:5}}>{item.label}</p>
                  {item.el}
                </div>
              ))}
            </div>
          </div>

          {/* Eligibility */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Έλεγχος Επιλεξιμότητας')}
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {[
                {label:'Σπίτι μου ΙΙ — deadline 31/08/2026',el:(advBorrower==='young'||advBorrower==='family')&&advLoanType==='first_home',reason:(advBorrower==='young'||advBorrower==='family')&&advLoanType==='first_home'?'✓ Πληροίς':advLoanType!=='first_home'?'Άλλαξε σε "Πρώτη κατοικία"':'Ηλικία 25-50',badge:`~${fmtEur(calcMonthly(advAmount,3.5,advYears)*advYears*12*0.45)} εξοικονόμηση`},
                {label:'Αναβαθμίζω — deadline 31/08/2026',el:advLoanType==='energy',reason:advLoanType==='energy'?'✓ Κατάλληλος':'Ενεργειακή αναβάθμιση',badge:'Επιδοτούμενο επιτόκιο'},
                {label:'Εξοικονομώ 2025 — deadline 30/06/2026',el:advLoanType==='energy',reason:advLoanType==='energy'?'✓ Κατάλληλο':'Μόνο ενεργειακές',badge:'Επιδότηση κόστους'},
                {label:'Πράσινο Δάνειο (-0.15-0.25%)',el:advLoanType==='energy'||advLoanType==='renovation',reason:'Για ενεργειακά & ανακαίνιση',badge:`~${fmtEur(advAmount*0.002*advYears)} τόκοι`},
                {label:'Ένοπλες Δυνάμεις ΤΑΠ-ΟΙΚ',el:advBorrower==='military',reason:advBorrower==='military'?'✓ Δικαιούσαι':'Μόνο αξιωματικοί/υπαξιωματικοί',badge:'Χαμηλότερο επιτόκιο'},
              ].map(item=>(
                <div key={item.label} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:item.el?'rgba(52,211,153,0.04)':'transparent',border:`1px solid ${item.el?'rgba(52,211,153,0.15)':C.border}`,borderRadius:8,transition:'all 0.15s'}}>
                  <div style={{width:20,height:20,borderRadius:'50%',background:item.el?'rgba(52,211,153,0.15)':'rgba(248,113,113,0.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {item.el?<Check size={11} color={C.green}/>:<X size={11} color={C.red}/>}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{fontSize:11,color:item.el?C.text:C.muted,fontWeight:item.el?500:400}}>{item.label}</p>
                    <p style={{fontSize:10,color:C.muted}}>{item.reason}</p>
                  </div>
                  {item.el&&<span style={{fontSize:9,fontFamily:mono,color:C.green,background:'rgba(52,211,153,0.08)',padding:'3px 8px',borderRadius:5,border:'1px solid rgba(52,211,153,0.15)',whiteSpace:'nowrap'}}>{item.badge}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Bank ranking */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT(`Κατάταξη Τραπεζών — ${fmtEur(advAmount)} / ${advYears}χρ`)}
            {BANKS.slice().sort((a,b)=>a.fixed_min-b.fixed_min).slice(0,4).map((bank,i)=>{
              const m=calcMonthly(advAmount,bank.fixed_min,advYears)
              const ti=m*advYears*12-advAmount
              const medals=['🥇','🥈','🥉','4']
              return(
                <div key={bank.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',marginBottom:6,background:i===0?C.goldDim:'rgba(255,255,255,0.01)',border:`1px solid ${i===0?C.goldBorder:C.border}`,borderRadius:8,transition:'all 0.15s'}}>
                  <span style={{fontSize:16}}>{medals[i]}</span>
                  <div style={{flex:1}}>
                    <p style={{fontSize:12,color:C.text,fontWeight:600}}>{bank.name}</p>
                    <p style={{fontSize:10,color:C.muted}}>{bank.note} · {bank.fees}</p>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <p style={{fontSize:14,fontFamily:mono,color:C.gold,fontWeight:700}}>{fmtEur(m)}/μήνα</p>
                    <p style={{fontSize:10,fontFamily:mono,color:C.muted}}>Τόκοι: {fmtEur(ti)}</p>
                  </div>
                  <button onClick={()=>setActiveTab('calculator')} style={{padding:'5px 10px',background:C.goldDim,border:`1px solid ${C.goldBorder}`,borderRadius:6,cursor:'pointer',color:C.gold,fontSize:10,fontFamily:mono}}>Επιλογή</button>
                </div>
              )
            })}
          </div>

          {/* Smart tips */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Έξυπνες Συμβουλές')}
            {[
              advAmount>200000&&{icon:'🏦',tip:'Δάνειο >200.000€: διαπραγματεύσου spread απευθείας με διεύθυνση τράπεζας — συχνά -0.10-0.20%.'},
              advLoanType==='first_home'&&advBorrower!=='young'&&advBorrower!=='family'&&{icon:'🏠',tip:'Σπίτι μου ΙΙ ισχύει για ηλικία 25-50 έως 31/08/2026. Αν πληροίς — η εξοικονόμηση είναι τεράστια.'},
              advLoanType==='investment'&&{icon:'💰',tip:'Επενδυτικό: ενοίκια 15%/25%/35% (2026). Αυτόματη έκπτωση 5% δαπανών. Τόκοι δεν εκπίπτουν (μετά 2013).'},
              advYears>25&&{icon:'⏱️',tip:`${advYears} χρόνια = πολλοί τόκοι. Σκέψου 20χρ.`},
              {icon:'📊',tip:`Stress test: Euribor +2% → δόση ${fmtEur(calcMonthly(advAmount,market.euribor_3m+2.5,advYears))}/μήνα. Σκέψου σταθερό επιτόκιο.`},
            ].filter(Boolean).slice(0,4).map((tip:any,i)=>(
              <div key={i} style={{display:'flex',gap:10,padding:'9px 12px',background:'rgba(255,255,255,0.01)',border:`1px solid ${C.border}`,borderRadius:7,marginBottom:6}}>
                <span style={{fontSize:15,flexShrink:0}}>{tip.icon}</span>
                <p style={{fontSize:11,color:C.textDim,lineHeight:1.6}}>{tip.tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ GUIDE ═══ */}
      {activeTab==='guide'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>

          {/* Process */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Βήματα Διαδικασίας Δανείου')}
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {PROCESS_STEPS.map((step,i)=>(
                <div key={i} style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:C.goldDim,border:`1px solid ${C.goldBorder}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{fontSize:12,fontFamily:mono,color:C.gold,fontWeight:700}}>{step.step}</span>
                  </div>
                  <div style={{flex:1,paddingBottom:10,borderBottom:i<PROCESS_STEPS.length-1?`1px solid ${C.border}`:'none'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <p style={{fontSize:12,color:C.text,fontWeight:600}}>{step.title}</p>
                      {step.time!=='—'&&<span style={{fontSize:9,fontFamily:mono,color:C.muted,background:'rgba(255,255,255,0.02)',padding:'2px 7px',borderRadius:4,border:`1px solid ${C.border}`}}>{step.time}</span>}
                    </div>
                    <p style={{fontSize:11,color:C.textDim,lineHeight:1.6}}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Special categories */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Ειδικές Κατηγορίες')}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                {title:'Ένοπλες Δυνάμεις',icon:'🎖️',desc:'Ειδικά επιδοτούμενα μέσω ΤΑΠ-ΟΙΚ.',url:'https://tap.gr'},
                {title:'Κάτοικοι Εξωτερικού',icon:'✈️',desc:'Επιπλέον έγγραφα, LTV ≤70%, ΣΑΔΦ για φορολογία.',url:'https://e-stegastiko.gr/ellines-eksoterikou/'},
                {title:'Νέοι 25-50 ετών',icon:'⭐',desc:'Σπίτι μου ΙΙ deadline 31/08/2026. Alpha: 2.50% σταθερό 3χρ.',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Επαγγελματίες',icon:'💼',desc:'LTV 65-70%, 2+ φορολογικά, δαπάνες εκπιπτόμενες.',url:'https://e-stegastiko.gr/epaggelmaties/'},
              ].map(cat=>(
                <div key={cat.title} style={{background:'rgba(255,255,255,0.01)',border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><span style={{fontSize:18}}>{cat.icon}</span><p style={{fontSize:12,color:C.text,fontWeight:600}}>{cat.title}</p></div>
                  <p style={{fontSize:11,color:C.textDim,lineHeight:1.5,marginBottom:8}}>{cat.desc}</p>
                  <a href={cat.url} target="_blank" rel="noreferrer" style={{fontSize:10,color:C.blue,textDecoration:'none',fontFamily:mono,display:'flex',alignItems:'center',gap:4}}><ExternalLink size={10}/>Περισσότερα</a>
                </div>
              ))}
            </div>
          </div>

          {/* Euribor History Chart */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Ιστορικό Euribor 3M — 2020 έως Σήμερα',<span style={{fontSize:9,fontFamily:mono,color:C.muted}}>Πηγή: ECB</span>)}
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={euriborChartData} barCategoryGap="8%">
                <XAxis dataKey="date" tick={{fontSize:8,fontFamily:mono,fill:C.muted}} axisLine={false} tickLine={false} interval={3}/>
                <YAxis tick={{fontSize:9,fontFamily:mono,fill:C.muted}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} width={35}/>
                <Tooltip content={({active,payload,label}:any)=>{
                  if(!active||!payload?.length)return null
                  return <div style={{background:'#1a1a2e',border:`1px solid ${C.border2}`,borderRadius:7,padding:'8px 12px',fontSize:10,fontFamily:mono}}><p style={{color:C.muted,marginBottom:4}}>{label}</p><p style={{color:C.gold}}>{payload[0].value}%</p></div>
                }}/>
                <ReferenceLine y={0} stroke={C.border2} strokeWidth={1}/>
                <Bar dataKey="Euribor" radius={[2,2,0,0]} fill={C.blue}
                  // Color by value: negative = blue dim, recent = gold
                  label={false}
                />
              </BarChart>
            </ResponsiveContainer>
            <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}}>
              <span style={{fontSize:10,color:C.muted,fontFamily:mono}}>Peak: <span style={{color:C.red}}>4.0% (Οκτ 2023)</span></span>
              <span style={{fontSize:10,color:C.muted,fontFamily:mono}}>Σήμερα: <span style={{color:C.green}}>{fmtPct(market.euribor_3m)}</span></span>
              <span style={{fontSize:10,color:C.muted,fontFamily:mono}}>Μείωση από peak: <span style={{color:C.green}}>-{fmtPct(4.0-market.euribor_3m)}</span></span>
            </div>
            <p style={{fontSize:10,color:C.muted,marginTop:8,lineHeight:1.6}}>Κυμαινόμενα δάνεια με Euribor -0.5% το 2021 σήμερα έχουν {fmtPct(market.euribor_3m+0.5)} πραγματικό επιτόκιο. → <a href="https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:'none'}}>ECB</a></p>
          </div>

          {/* PDF Export */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Εξαγωγή Ανάλυσης')}
            <p style={{fontSize:11,color:C.textDim,marginBottom:12}}>Κατέβασε πλήρη ανάλυση δανείου με επιτόκια, προγράμματα και φορολογικά στοιχεία.</p>
            <button onClick={()=>{
              const content=[
                'PROPERTY OS — ΑΝΑΛΥΣΗ ΣΤΕΓΑΣΤΙΚΟΥ ΔΑΝΕΙΟΥ',
                '='.repeat(50),
                `Ημερομηνία: ${new Date().toLocaleDateString('el-GR')}`,
                `Euribor 3M: ${fmtPct(market.euribor_3m)} | ECB: ${fmtPct(market.ecb_rate)}`,
                `Πηγή: Τράπεζα της Ελλάδος / ECB | Ενημέρωση: ${updatedStr}`,
                '',
                'ΤΡΑΠΕΖΕΣ — ΕΠΙΤΟΚΙΑ ΣΤΑΘΕΡΟΥ (Ιούν 2026)',
                '='.repeat(50),
                ...BANKS.map(b=>`${b.name.padEnd(22)} 5χρ: ${b.fixed5}% | Κυμ: +${b.variable_spread_min}% | LTV: ${b.max_ltv}% | Σπίτι ΙΙ: ${b.spiti_mou?'ΝΑΙ':'ΟΧΙ'}`),
                '',
                'ΚΡΑΤΙΚΑ ΠΡΟΓΡΑΜΜΑΤΑ 2026',
                '='.repeat(50),
                ...STATE_PROGRAMS.filter(p=>p.status==='active').map(p=>`${p.name.padEnd(28)} Deadline: ${p.deadline}`),
                '',
                'ΦΟΡΟΛΟΓΙΚΑ — ΑΑΔΕ 2026',
                '='.repeat(50),
                'ΦΜΑ: 3% | Απαλλαγή 1ης κατοικίας: Άγαμος ≤200.000€ | Έγγαμος ≤250.000€',
                'Φορολόγηση ενοικίων: 15% (≤12.000€) | 25% (12.001-24.000€) | 35% (>24.000€)',
                'Αυτόματη έκπτωση δαπανών: 5% | Τόκοι δεν εκπίπτουν (δάνεια μετά 2013)',
                '',
                'ΕΠΙΣΗΜΟΙ ΣΥΝΔΕΣΜΟΙ',
                '='.repeat(50),
                'Σπίτι μου ΙΙ: greece20.gov.gr/home-loans/',
                'Εξοικονομώ 2025: exoikonomo2025.gov.gr',
                'Γέφυρα 3: dovaluegreece.gr',
                'Επιτόκια: vresdaneio.gr | e-stegastiko.gr',
                'ΑΑΔΕ: aade.gr | ΤτΕ: bankofgreece.gr',
                '',
                'DISCLAIMER',
                '='.repeat(50),
                'Πληροφορίες ενημερωτικές — δεν αποτελούν χρηματοοικονομική ή φορολογική συμβουλή.',
                'Για εξατομικευμένη συμβουλή: τράπεζα, σύμβουλος ή φοροτεχνικός.',
              ].join('\n')
              const blob=new Blob([content],{type:'text/plain;charset=utf-8'})
              const url=URL.createObjectURL(blob)
              const a=document.createElement('a')
              a.href=url;a.download=`PropertyOS-LoanAnalysis-${new Date().toISOString().split('T')[0]}.txt`
              a.click();URL.revokeObjectURL(url)
            }} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 18px',background:C.goldDim,border:`1px solid ${C.goldBorder}`,borderRadius:8,cursor:'pointer',color:C.gold,fontSize:11,fontFamily:mono,fontWeight:600}}>
              📄 Κατέβασε Ανάλυση (.txt)
            </button>
          </div>

          {/* Glossary */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
            <button onClick={()=>setShowGlossary(g=>!g)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'none',border:'none',cursor:'pointer'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:showGlossary?C.gold:C.muted2,display:'inline-block'}}/>
                <p style={{fontSize:10,fontFamily:mono,color:showGlossary?C.gold:C.text,textTransform:'uppercase',letterSpacing:'0.1em'}}>Γλωσσάρι Όρων</p>
              </div>
              {showGlossary?<ChevronUp size={14} color={C.muted}/>:<ChevronDown size={14} color={C.muted}/>}
            </button>
            {showGlossary&&(
              <div style={{padding:'0 16px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
                {GLOSSARY.map((item,i)=>(
                  <div key={i} style={{padding:'10px 12px',background:'rgba(255,255,255,0.01)',border:`1px solid ${C.border}`,borderRadius:7}}>
                    <p style={{fontSize:11,color:C.gold,fontWeight:600,marginBottom:3,fontFamily:mono}}>{item.term}</p>
                    <p style={{fontSize:10,color:C.textDim,lineHeight:1.5}}>{item.def}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Links — subtle */}
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
            {sT('Επίσημες Πηγές')}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
              {[
                {name:'greece20.gov.gr',desc:'Σπίτι μου ΙΙ',url:'https://greece20.gov.gr/home-loans/'},
                {name:'exoikonomo2025.gov.gr',desc:'Εξοικονομώ 2025',url:'https://exoikonomo2025.gov.gr/'},
                {name:'ypen.gov.gr',desc:'ΥΠΕΝ — παρατάσεις',url:'https://ypen.gov.gr/exoikonomo-anakoinosi-parataseon/'},
                {name:'e-stegastiko.gr',desc:'Πλατφόρμα δανείων ΤτΕ',url:'https://e-stegastiko.gr'},
                {name:'vresdaneio.gr',desc:'Σύγκριση επιτοκίων',url:'https://vresdaneio.gr/epitokia/index.html'},
                {name:'dovaluegreece.gr',desc:'Γέφυρα 3',url:'https://dovaluegreece.gr/programma-epidotisis-dosis-logo-ayxisis-epitokion-gefyra-3'},
                {name:'bankofgreece.gr',desc:'Επίσημα επιτόκια',url:'https://www.bankofgreece.gr'},
                {name:'ktimatologio.gr',desc:'Έλεγχος τίτλων',url:'https://www.ktimatologio.gr'},
                {name:'aade.gr',desc:'Φορολογικά ακινήτων',url:'https://www.aade.gr'},
                {name:'opeka.gr',desc:'ΟΠΕΚΑ — Ανακαινίζω',url:'https://www.opeka.gr'},
              ].map(link=>(
                <a key={link.name} href={link.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',background:'rgba(255,255,255,0.01)',border:`1px solid ${C.border}`,borderRadius:7,textDecoration:'none',transition:'border-color 0.15s'}}>
                  <div>
                    <p style={{fontSize:11,color:C.blue,fontFamily:mono}}>{link.name}</p>
                    <p style={{fontSize:9,color:C.muted,marginTop:1}}>{link.desc}</p>
                  </div>
                  <ExternalLink size={11} color={C.muted2}/>
                </a>
              ))}
            </div>
            <p style={{fontSize:10,color:C.muted,marginTop:12,lineHeight:1.6}}>⚠ Disclaimer: Πληροφορίες ενημερωτικές — δεν αποτελούν χρηματοοικονομική ή φορολογική συμβουλή. Τα επιτόκια και τα προγράμματα αλλάζουν — πάντα επαληθεύετε από τις επίσημες πηγές.</p>
          </div>
        </div>
      )}

      {/* ═══ SAVED ═══ */}
      {activeTab==='saved'&&(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {savedLoans.length===0&&(
            <div style={{textAlign:'center',padding:'50px 0'}}>
              <Save size={28} color={C.border} style={{margin:'0 auto 12px'}}/>
              <p style={{fontSize:12,fontFamily:mono,color:C.muted}}>Δεν υπάρχουν αποθηκευμένα δάνεια</p>
              <button onClick={()=>setActiveTab('calculator')} style={{marginTop:12,fontSize:11,color:C.gold,background:'none',border:'none',cursor:'pointer',fontFamily:mono}}>→ Calculator</button>
            </div>
          )}
          {savedLoans.map(loan=>{
            const m=calcMonthly(loan.amount,loan.rate,loan.years)
            const ti=m*loan.years*12-loan.amount
            const ltv2=loan.property_value>0?(loan.amount/loan.property_value)*100:0
            const monthsElapsed=loan.start_date?Math.floor((Date.now()-new Date(loan.start_date).getTime())/(1000*60*60*24*30.44)):0
            const remMonths=Math.max(0,loan.years*12-monthsElapsed)
            const balApprox=calcMonthly(loan.amount,loan.rate,loan.years)*remMonths*(1-loan.rate/100/12*(remMonths/2))
            return(
              <div key={loan.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <p style={{fontSize:14,color:C.text,fontWeight:600}}>{loan.bank}</p>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(52,211,153,0.08)',color:C.green,fontFamily:mono,border:'1px solid rgba(52,211,153,0.18)'}}>{loan.status==='active'?'Ενεργό':'Ανενεργό'}</span>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:4,background:'rgba(96,165,250,0.08)',color:C.blue,fontFamily:mono,border:'1px solid rgba(96,165,250,0.18)'}}>{LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type}</span>
                    </div>
                    {loan.notes&&<p style={{fontSize:11,color:C.muted}}>{loan.notes}</p>}
                  </div>
                  <button onClick={()=>deleteLoan(loan.id)} style={{background:'none',border:'none',cursor:'pointer',color:C.border2,display:'flex',padding:4}}><X size={14}/></button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:10}}>
                  <KPI label="Ποσό" value={fmtEur(loan.amount)} color={C.gold}/>
                  <KPI label="Επιτόκιο" value={fmtPct(loan.rate)} color={C.blue} sub={loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό'}/>
                  <KPI label="Δόση/μήνα" value={fmtEur(m)} color={C.green}/>
                  <KPI label="Σύν. τόκοι" value={fmtEur(ti)} color={C.red}/>
                  <KPI label="LTV" value={`${ltv2.toFixed(1)}%`} color={ltv2>80?C.orange:C.green}/>
                </div>
                {loan.start_date&&(
                  <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.01)',border:`1px solid ${C.border}`,borderRadius:7,display:'flex',gap:20,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,fontFamily:mono,color:C.muted}}>Έναρξη: {loan.start_date}</span>
                    <span style={{fontSize:10,fontFamily:mono,color:C.muted}}>Αποπληρωθέντες: ~{monthsElapsed} μήνες</span>
                    <span style={{fontSize:10,fontFamily:mono,color:C.muted}}>Μένουν: ~{remMonths} μήνες</span>
                    <span style={{fontSize:10,fontFamily:mono,color:C.gold}}>Εκτ. Υπόλοιπο: ~{fmtEur(Math.max(0,balApprox))}</span>
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