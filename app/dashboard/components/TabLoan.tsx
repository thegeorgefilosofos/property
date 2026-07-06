'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { CustomSelect } from './UIComponents'
import { ExportButton } from '@/components/Theme'
import { downloadCsv, csvEur, csvDec, csvDate } from './exportCsv'
import TabLoanCalculator from './TabLoanCalculator'
import { useMarketRates, useBankRates, useLoanPrograms } from '../../hooks/useMarketData'
import {
  BANKS as BANKS_STATIC, STATE_PROGRAMS as PROGRAMS_STATIC,
  LOAN_TYPES, BORROWER_PROFILES, GLOSSARY, EURIBOR_HISTORY,
  calcMonthly, fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, SavedLoan, MarketRates, MARKET_FALLBACK
} from './TabLoanData'

// ── MD3 design tokens ──────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif",
}
const cardStyle: React.CSSProperties = {
  background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16,
}

const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',display:'inline-block',flexShrink:0}}/>
      <p style={{...labelStyle,marginBottom:0}}>{label}</p>
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

function ChartTip({active,payload,label}:any) {
  if(!active||!payload?.length)return null
  return (
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:12,padding:'10px 14px',fontSize:11,fontFamily:"'Roboto Mono',monospace",boxShadow:'var(--shadow-lg)'}}>
      <p style={{color:'var(--text-secondary)',marginBottom:6,fontSize:10,fontFamily:"'Inter',sans-serif"}}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
          <span style={{width:8,height:8,borderRadius:2,background:p.color,display:'inline-block'}}/>
          <p style={{color:'var(--text-primary)'}}>{p.name}: <strong style={{color:p.color}}>{typeof p.value==='number'&&p.value>10?fmtEur(p.value):`${p.value}%`}</strong></p>
        </div>
      ))}
    </div>
  )
}

const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k,v])=>({value:k,label:v.label}))
const BORROWER_OPTIONS  = Object.entries(BORROWER_PROFILES).map(([k,v])=>({value:k,label:v.label}))

interface CalcState {
  loanType:LoanType;borrowerType:BorrowerType;loanAmount:number;years:number
  rateType:RateType;effectiveRate:number;monthly:number;totalInterest:number;propertyValue:number
}

export default function TabLoan({propertyId,userId}:{propertyId:string;userId:string}) {
  const supabase = createClient()
  const [tab,setTab] = useState<'calculator'|'banks'|'programs'|'advisor'|'guide'|'saved'>('calculator')
  const [saved,setSaved] = useState<SavedLoan[]>([])
  const [filterSpiti,setFS] = useState(false)
  const [showGloss,setShowGloss] = useState(false)

  const market      = useMarketRates()
  const {banks:liveBanks,loading:banksLoading,verifiedAt} = useBankRates()
  const {programs:livePrograms,loading:programsLoading}   = useLoanPrograms()

  const BANKS    = liveBanks.length    ? liveBanks    : BANKS_STATIC
  const PROGRAMS = livePrograms.length ? livePrograms : PROGRAMS_STATIC

  const [calcState,setCalcState] = useState<CalcState>({
    loanType:'purchase',borrowerType:'individual',loanAmount:150000,
    years:25,rateType:'fixed',effectiveRate:3.5,
    monthly:calcMonthly(150000,3.5,25),totalInterest:0,propertyValue:200000,
  })

  const [advType,setAdvType] = useState<LoanType>('purchase')
  const [advBorr,setAdvBorr] = useState<BorrowerType>('individual')
  const [advAmt,setAdvAmt]   = useState('150000')
  const [advYrs,setAdvYrs]   = useState('25')

  useEffect(()=>{loadSaved()},[propertyId])
  useEffect(()=>{
    if(tab==='advisor'){
      setAdvType(calcState.loanType);setAdvBorr(calcState.borrowerType)
      setAdvAmt(String(Math.round(calcState.loanAmount)));setAdvYrs(String(calcState.years))
    }
  },[tab])

  async function loadSaved(){const{data}=await supabase.from('loans').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false});setSaved(data||[])}
  async function handleSaveLoan(loan:Partial<SavedLoan>){await supabase.from('loans').insert({...loan,property_id:propertyId,user_id:userId});await loadSaved()}
  async function handleSaveCal(monthly:number,years:number,startDate:string,bankName:string){
    const d=new Date(startDate),events=[]
    for(let i=0;i<Math.min(years*12,60);i++){
      const ev=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate())
      events.push({property_id:propertyId,user_id:userId,title:`Δόση δανείου${bankName?` — ${bankName}`:''}`,category:'financial',event_date:ev.toISOString().split('T')[0],amount:Math.round(monthly),priority:'high',status:'pending',recurring:true,recurring_interval:'monthly',notes:`${fmtEur(monthly)}/μήνα`,source:'manual'})
    }
    for(let i=0;i<events.length;i+=20)await supabase.from('calendar_events').insert(events.slice(i,i+20))
    alert(`${Math.min(years*12,60)} δόσεις αποθηκεύτηκαν στο Ημερολόγιο`)
  }
  async function handleSaveExp(monthly:number,bankName:string){
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Δόση δανείου${bankName?` — ${bankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:new Date().toISOString().split('T')[0]})
    alert('Δόση καταχωρήθηκε στις Δαπάνες')
  }
  async function deleteLoan(id:string){if(!confirm('Διαγραφή δανείου;'))return;await supabase.from('loans').delete().eq('id',id);await loadSaved()}

  const updStr = market.isLoading?'...' : new Date(market.updated_at).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})
  const banksUpdStr = verifiedAt ? new Date(verifiedAt).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'}) : updStr
  const LA = parseFloat(advAmt)||150000
  const Y  = parseInt(advYrs)||25
  const activePrograms = PROGRAMS

  const TABS = [
    {id:'calculator',label:'Υπολογιστής'},
    {id:'banks',label:'Τράπεζες'},
    {id:'programs',label:'Κρατικά Προγράμματα'},
    {id:'advisor',label:'Advisor'},
    {id:'guide',label:'Οδηγός'},
    {id:'saved',label:`Αποθηκευμένα${saved.length>0?` (${saved.length})`:''}` },
  ]

  return (
    <div style={{fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',display:'flex',flexDirection:'column',gap:16}}>

      {/* Header */}
      <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'14px 20px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
        <div>
          <p style={{fontSize:16,color:'var(--text-secondary)',fontWeight:400,fontFamily:"'Inter',sans-serif"}}>Εργαλείο Στεγαστικών Δανείων</p>
          <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>Ελληνική Αγορά · Δεδομένα ECB + ΤτΕ</p>
        </div>
        <div style={{display:'flex',gap:24,marginLeft:'auto',flexWrap:'wrap',alignItems:'center'}}>
          {[
            {l:'Euribor 3M',v:market.euribor_3m,c:'var(--info)'},
            {l:'Euribor 1M',v:market.euribor_1m,c:'var(--info)'},
            {l:'ΕΚΤ',v:market.ecb_rate,c:'#7c4dff'},
            ...(market.bog_housing_new?[{l:'ΤτΕ Μέσο',v:market.bog_housing_new,c:'var(--positive)'}]:[]),
          ].map(item=>(
            <div key={item.l} style={{textAlign:'center' as const}}>
              <p style={{...labelStyle,marginBottom:2}}>{item.l}</p>
              <p style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:market.isLoading?'var(--border-default)':item.c,fontWeight:700}}>
                {market.isLoading?'…':fmtPct(item.v)}
              </p>
            </div>
          ))}
          <div style={{textAlign:'right' as const}}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:market.isStale?'var(--warning)':'var(--positive)',display:'inline-block'}}/>
              <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>
                {market.isStale?'Δεδομένα > 48ω':`Live · ${updStr}`}
              </p>
            </div>
            <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:1,fontFamily:"'Inter',sans-serif"}}>
              {market.source_euribor==='ECB EMMI live'?'ECB API live':'Fallback'}
            </p>
          </div>
          {market.rate_changed&&(
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'var(--warning-dim)',border:'1px solid var(--warning-border)',borderRadius:8}}>
              <span style={{fontSize:11,color:'var(--warning)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Euribor άλλαξε</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border-subtle)',gap:0,overflowX:'auto'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)}
            style={{padding:'12px 18px',fontSize:13,fontWeight:tab===t.id?500:400,fontFamily:"'Inter',sans-serif",color:tab===t.id?'var(--accent)':'var(--text-secondary)',borderBottom:`2px solid ${tab===t.id?'var(--accent)':'transparent'}`,borderLeft:'none',borderRight:'none',borderTop:'none',background:'none',cursor:'pointer',whiteSpace:'nowrap' as const,transition:'all 0.15s',marginBottom:-1}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ CALCULATOR ═══ */}
      {tab==='calculator'&&(
        <TabLoanCalculator
          propertyId={propertyId} userId={userId}
          market={{euribor_3m:market.euribor_3m,euribor_1m:market.euribor_1m,ecb_rate:market.ecb_rate,updated_at:market.updated_at}}
          onSaveLoan={handleSaveLoan}
          onSaveToCalendar={handleSaveCal}
          onSaveToExpenses={handleSaveExp}
          onStateChange={setCalcState}
        />
      )}

      {/* ═══ BANKS ═══ */}
      {tab==='banks'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={()=>setFS(f=>!f)} style={{display:'flex',alignItems:'center',gap:7,padding:'0 14px',height:36,background:filterSpiti?'var(--positive-dim)':'var(--bg-elevated)',border:`1px solid ${filterSpiti?'var(--positive-border)':'var(--border-subtle)'}`,borderRadius:20,cursor:'pointer',color:filterSpiti?'var(--positive)':'var(--text-secondary)',fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:500}}>
              Σπίτι μου ΙΙ
            </button>
            <p style={{fontSize:11,color:'var(--text-tertiary)',marginLeft:'auto',fontFamily:"'Inter',sans-serif"}}>
              {banksLoading?'Φόρτωση...':`vresdaneio.gr · ${banksUpdStr}`}
              {liveBanks.length>0&&<span style={{color:'var(--positive)',marginLeft:6}}>Live DB</span>}
            </p>
          </div>

          <div style={cardStyle}>
            <SectionLabel label="Σύγκριση Επιτοκίων — Ιούνιος 2026"/>
            <div style={{overflowX:'auto'}}>
              <div className="table-wrap">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border-subtle)'}}>
                    {['Τράπεζα','3 χρόνια','5 χρόνια','10 χρόνια','15 χρόνια','20 χρόνια','Κυμαινόμενο spread','Max LTV','Σπίτι ΙΙ'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).map((bank:any)=>(
                    <tr key={bank.id||bank.bank_id} style={{borderBottom:'1px solid var(--border-subtle)'}}>
                      <td style={{padding:'9px 10px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:8,height:8,borderRadius:2,background:bank.color,flexShrink:0}}/>
                          <span style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{bank.bank_name||bank.name}</span>
                        </div>
                      </td>
                      {['fixed_3yr','fixed_5yr','fixed_10yr','fixed_15yr','fixed_20yr'].map(k=>(
                        <td key={k} style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:12,color:'var(--text-primary)',fontWeight:500}}>{(bank as any)[k]||'—'}%</td>
                      ))}
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:12,color:'var(--positive)'}}>{bank.variable_spread_min!==undefined?`+${bank.variable_spread_min}–${bank.variable_spread_max}%`:'—'}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:12,color:'var(--text-primary)',fontWeight:500}}>{bank.max_ltv}%</td>
                      <td style={{padding:'9px 10px'}}>
                        {bank.spiti_mou
                          ?<span style={{fontSize:11,color:'var(--positive)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Ναι</span>
                          :<span style={{fontSize:11,color:'var(--border-default)'}}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
              Ενδεικτικά επιτόκια ({updStr}). →{' '}
              <a href="https://e-stegastiko.gr" target="_blank" rel="noreferrer" style={{color:'var(--info)',textDecoration:'none',fontWeight:500}}>e-stegastiko.gr</a>
            </p>
          </div>

          {BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).map((bank:any)=>{
            const myM = calcMonthly(calcState.loanAmount||150000, bank.fixed_min||parseFloat(bank.fixed_3yr)||3.5, calcState.years||25)
            const fixed5 = bank.fixed_5yr||bank.fixed5||'—'
            const varRate = bank.variable_spread_min?fmtPct(market.euribor_3m+bank.variable_spread_min):null
            return (
              <div key={bank.id||bank.bank_id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:`4px solid ${bank.color}`,borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border-subtle)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div>
                      <p style={{fontSize:16,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:6,lineHeight:1}}>{bank.bank_name||bank.name}</p>
                      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                        {bank.note&&<span style={{fontSize:11,padding:'2px 10px',borderRadius:20,background:`${bank.color}18`,color:bank.color,fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{bank.note}</span>}
                        {bank.spiti_mou&&<span style={{fontSize:11,padding:'2px 10px',borderRadius:20,background:'var(--positive-soft)',color:'var(--positive)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>Σπίτι μου ΙΙ</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,flexShrink:0}}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{padding:'0 16px',height:34,borderRadius:20,border:'1px solid var(--border-default)',background:'none',color:'var(--text-secondary)',fontSize:12,fontFamily:"'Inter',sans-serif",textDecoration:'none',fontWeight:500,display:'flex',alignItems:'center'}}>Επίσκεψη</a>}
                    <button onClick={()=>setTab('calculator')} style={{padding:'0 16px',height:34,borderRadius:20,background:bank.color,border:'none',color:'#fff',fontSize:12,fontFamily:"'Inter',sans-serif",cursor:'pointer',fontWeight:500}}>Υπολόγισε</button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))'}}>
                  {[
                    {label:'Σταθερό 5 ετών',value:`${fixed5}%`,color:'var(--text-primary)',sub:null},
                    {label:'Κυμαινόμενο spread',value:bank.variable_spread_min?`+${bank.variable_spread_min}%`:'—',color:'var(--text-primary)',sub:varRate?`= ${varRate} σήμερα`:null},
                    {label:'Εκτιμώμενη δόση',value:fmtEur(myM),color:bank.color,sub:`${Math.round((calcState.loanAmount||150000)/1000)}κ€ / ${calcState.years||25} χρόνια`},
                    {label:'Μέγιστο LTV',value:`${bank.max_ltv}%`,color:bank.max_ltv>=85?'var(--text-primary)':'var(--text-primary)',sub:bank.max_amount?`έως ${fmtEur(bank.max_amount)}`:null},
                  ].map((stat,si)=>(
                    <div key={stat.label} style={{padding:'16px 20px',borderRight:si<3?'1px solid var(--border-subtle)':'none'}}>
                      <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif",marginBottom:8}}>{stat.label}</p>
                      <p style={{fontSize:22,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:stat.color,fontWeight:700,lineHeight:1,marginBottom:4}}>{stat.value}</p>
                      {stat.sub&&<p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{stat.sub}</p>}
                    </div>
                  ))}
                </div>
                <div style={{padding:'12px 20px',borderTop:'1px solid var(--border-subtle)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  {(bank.features||[]).map((f:string,fi:number)=>(
                    <span key={fi} style={{fontSize:11,padding:'4px 12px',borderRadius:20,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",display:'flex',alignItems:'center',gap:5}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:'var(--positive)',display:'inline-block',flexShrink:0}}/>
                      {f}
                    </span>
                  ))}
                  {(bank.programs||[]).map((p:string)=>(
                    <span key={p} style={{fontSize:11,padding:'4px 12px',borderRadius:20,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{p}</span>
                  ))}
                  {bank.fees&&<span style={{fontSize:11,color:'var(--text-tertiary)',marginLeft:'auto',fontFamily:"'Inter',sans-serif"}}>{bank.fees}</span>}
                </div>
              </div>
            )
          })}
          <div style={{padding:'10px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
            <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
              Τα επιτόκια ενδέχεται να έχουν αλλάξει. →{' '}
              <a href="https://vresdaneio.gr/epitokia/index.html" target="_blank" rel="noreferrer" style={{color:'var(--info)',textDecoration:'none',fontWeight:500}}>vresdaneio.gr</a>
            </p>
          </div>
        </div>
      )}

      {/* ═══ PROGRAMS ═══ */}
      {tab==='programs'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'10px 16px'}}>
            <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
              {livePrograms.length>0?'Ζωντανά δεδομένα από Supabase. Πηγές:':'Στατικά δεδομένα. Πηγές:'}{' '}
              <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:'var(--info)',textDecoration:'none',fontWeight:500}}>greece20.gov.gr</a>,{' '}
              <a href="https://ypen.gov.gr" target="_blank" rel="noreferrer" style={{color:'var(--info)',textDecoration:'none',fontWeight:500}}>ypen.gov.gr</a> — {updStr}
            </p>
          </div>

          {activePrograms.map((prog:any)=>(
            <div key={prog.id} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:`3px solid ${prog.color}`,borderRadius:12,padding:18}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <p style={{fontSize:16,fontWeight:400,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{prog.name}</p>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:12,background:prog.status==='active'?'var(--positive-dim)':'var(--info-dim)',color:prog.status==='active'?'var(--positive)':'var(--info)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{prog.status==='active'?'Ενεργό':'Επερχόμενο'}</span>
                        {prog.deadline_urgent&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:12,background:'var(--negative-dim)',color:'var(--negative)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>Λήγει σύντομα</span>}
                      </div>
                      <p style={{fontSize:11,color:prog.color,marginTop:2,fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{prog.type}</p>
                    </div>
                  </div>
                  <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>{prog.desc}</p>
                </div>
                <a href={prog.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,padding:'0 13px',height:32,background:prog.color.startsWith('var')?'var(--accent-dim)':`${prog.color}18`,border:prog.color.startsWith('var')?'1px solid var(--border-accent)':`1px solid ${prog.color}35`,borderRadius:20,color:prog.color,fontSize:12,fontFamily:"'Inter',sans-serif",textDecoration:'none',fontWeight:500,flexShrink:0,marginLeft:14}}>Επίσκεψη</a>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:14,marginBottom:12}}>
                <div>
                  <p style={{...labelStyle,marginBottom:10}}>Κριτήρια Επιλεξιμότητας</p>
                  {(prog.criteria||[]).map((c:string,i:number)=>(
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:prog.color,flexShrink:0,marginTop:5}}/>
                      <span style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{...labelStyle,marginBottom:10}}>Βασικά Στοιχεία</p>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {[
                      prog.max_amount&&['Μέγιστο ποσό',fmtEur(prog.max_amount),prog.color.startsWith('var')?'var(--info)':prog.color,16],
                      prog.max_ltv&&['Μέγιστο LTV',`${prog.max_ltv}%`,'var(--info)',14],
                      (prog as any).max_sqm&&['Μέγιστα τετραγωνικά',`${(prog as any).max_sqm} τετραγωνικά μέτρα`,'var(--text-primary)',12],
                      (prog as any).age_max&&['Ηλικία δικαιούχου',`${(prog as any).age_min}–${(prog as any).age_max} ετών`,'var(--text-primary)',12],
                      (prog.duration&&prog.duration!=='null')&&['Διάρκεια',prog.duration,'var(--text-secondary)',12],
                      prog.deadline&&['Προθεσμία',(prog.deadline.match(/^\d{4}-\d{2}-\d{2}$/)?prog.deadline.split('-').reverse().join('/'):prog.deadline),prog.deadline_urgent?'var(--negative)':'var(--positive)',13],
                      (prog.total_budget&&prog.total_budget!=='null'&&prog.total_budget!=='-')&&['Προϋπολογισμός',prog.total_budget,'var(--info)',13],
                    ].filter(Boolean).map((item:any)=>(
                      <div key={item[0]} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--border-subtle)'}}>
                        <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{item[0]}</span>
                        <span style={{fontSize:item[3],fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:item[2],fontWeight:item[3]>12?700:500}}>{item[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {(prog as any).how_it_works&&<div style={{padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,marginBottom:8}}><p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>{(prog as any).how_it_works}</p></div>}
              {prog.extra&&<div style={{padding:'10px 14px',background:prog.color.startsWith('var')?'var(--accent-dim)':`${prog.color}12`,border:prog.color.startsWith('var')?'1px solid var(--border-accent)':`1px solid ${prog.color}28`,borderRadius:8,marginBottom:8}}><p style={{fontSize:12,color:prog.color,lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{prog.extra}</p></div>}
              {prog.savings_example&&<div style={{padding:'10px 14px',background:'var(--positive-soft)',border:'1px solid var(--positive-border)',borderRadius:8,marginBottom:10}}><p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{prog.savings_example}</p></div>}
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {(prog.participating_banks||prog.banks||[]).map((b:string)=><span key={b} style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{b}</span>)}
              </div>
            </div>
          ))}
          {activePrograms.length===0&&(
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-secondary)'}}>
              <p style={{fontSize:14,fontFamily:"'Inter',sans-serif"}}>Δεν υπάρχουν ενεργά προγράμματα.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ ADVISOR ═══ */}
      {tab==='advisor'&&(()=>{
        const cs = calcState
        const ltv = cs.propertyValue>0?(cs.loanAmount/cs.propertyValue)*100:0
        const totalCost = cs.monthly*cs.years*12
        const interestRatio = cs.loanAmount>0?cs.totalInterest/cs.loanAmount:0
        const stressMonthly2 = calcMonthly(cs.loanAmount,cs.effectiveRate+2,cs.years)
        const spitiRate = Math.max(market.euribor_3m*0.5+0.3,1.0)
        const spitiMonthly = calcMonthly(cs.loanAmount,spitiRate,cs.years)
        const spitiSaving = (cs.monthly-spitiMonthly)*cs.years*12
        const shortMonthly20 = cs.years>20?calcMonthly(cs.loanAmount,cs.effectiveRate,20):0
        const savedByShortening = cs.years>20?(cs.monthly*cs.years*12)-(shortMonthly20*20*12):0
        const extraPay100Saving = (()=>{
          let bal=cs.loanAmount,months=0
          while(bal>0&&months<cs.years*12){bal=bal*(1+cs.effectiveRate/100/12)-(cs.monthly+100);months++}
          return Math.max(0,(cs.years*12-months)/12)
        })()
        const bestBank = BANKS.slice().sort((a:any,b:any)=>(a.fixed_min||parseFloat(a.fixed_3yr)||99)-(b.fixed_min||parseFloat(b.fixed_3yr)||99))[0] as any
        const bestBankMonthly = bestBank?calcMonthly(cs.loanAmount,bestBank.fixed_min,cs.years):cs.monthly
        const savingVsBestBank = (cs.monthly-bestBankMonthly)*cs.years*12
        let score=100; const issues:string[]=[]
        if(ltv>85){score-=20;issues.push('LTV')}
        if(cs.effectiveRate>4){score-=15;issues.push('Επιτόκιο')}
        if(cs.rateType==='variable'){score-=10;issues.push('Κυμαινόμενο')}
        if(cs.years>25){score-=10;issues.push('Διάρκεια')}
        if(interestRatio>0.6){score-=15;issues.push('Τόκοι')}
        const scoreColor=score>=80?'var(--positive)':score>=60?'var(--warning)':'var(--negative)'
        const scoreLabel=score>=80?'Υγιές δάνειο':score>=60?'Αποδεκτό — υπάρχει περιθώριο βελτίωσης':'Προσοχή — αξίζει επανεξέταση'

        return (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{padding:'14px 18px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <p style={{fontSize:15,color:'var(--info)',fontWeight:400,fontFamily:"'Inter',sans-serif"}}>Προσωπικός Σύμβουλος</p>
                <p style={{fontSize:12,color:'var(--text-secondary)',marginTop:2,fontFamily:"'Inter',sans-serif"}}>
                  Ανάλυση βάσει <strong>{fmtEur(cs.loanAmount)}</strong> / <strong>{cs.years} χρ</strong> / <strong>{fmtPct(cs.effectiveRate)}</strong> {cs.rateType==='variable'?'κυμαινόμενο':'σταθερό'}
                </p>
              </div>
              <div style={{textAlign:'right' as const}}>
                <p style={{...labelStyle,marginBottom:3}}>Βαθμολογία δανείου</p>
                <p style={{fontSize:22,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:scoreColor,fontWeight:700}}>{score}/100</p>
                <p style={{fontSize:11,color:scoreColor,fontFamily:"'Inter',sans-serif"}}>{scoreLabel}</p>
              </div>
            </div>

            <div style={cardStyle}>
              <SectionLabel label="Στοιχεία Ανάλυσης" right={<span style={{fontSize:11,color:'var(--positive)',fontFamily:"'Inter',sans-serif"}}>Συγχρονισμένο από τον Υπολογιστή</span>}/>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:10}}>
                <CustomSelect label="Σκοπός Δανείου" value={advType} onChange={v=>setAdvType(v as LoanType)} options={LOAN_TYPE_OPTIONS}/>
                <CustomSelect label="Τύπος Δανειολήπτη" value={advBorr} onChange={v=>setAdvBorr(v as BorrowerType)} options={BORROWER_OPTIONS}/>
                <div>
                  <label style={{...labelStyle,display:'block',marginBottom:6}}>Ποσό Δανείου (€)</label>
                  <input type="number" value={advAmt} onChange={e=>setAdvAmt(e.target.value)} style={{width:'100%',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:4,height:40,padding:'0 12px',color:'var(--text-primary)',fontSize:14,outline:'none',boxSizing:'border-box' as any,fontFamily:"'Roboto Mono',monospace"}}/>
                </div>
                <div>
                  <label style={{...labelStyle,display:'block',marginBottom:6}}>Διάρκεια (χρόνια)</label>
                  <input type="number" value={advYrs} onChange={e=>setAdvYrs(e.target.value)} style={{width:'100%',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:4,height:40,padding:'0 12px',color:'var(--text-primary)',fontSize:14,outline:'none',boxSizing:'border-box' as any,fontFamily:"'Roboto Mono',monospace"}}/>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <SectionLabel label="Τι Βλέπω στο Σενάριό σας"/>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {/* LTV */}
                <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',borderLeft:`3px solid ${ltv>85?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)'}`,borderRadius:8,border:'1px solid var(--border-subtle)'}}>
                  <div style={{width:36,height:36,borderRadius:8,background:ltv>85?'var(--negative-soft)':ltv>70?'var(--warning-soft)':'var(--positive-soft)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ltv>85?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)'} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                      LTV {ltv.toFixed(1)}% — {ltv>85?'Υψηλό — απαιτείται προσοχή':ltv>70?'Μέτριο — αποδεκτό':'Καλό — εντός ορίων'}
                    </p>
                    <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                      {ltv>85
                        ?`Χρηματοδοτείτε το ${ltv.toFixed(0)}% της αξίας — οι τράπεζες είναι επιφυλακτικές άνω του 80%.`
                        :ltv>70
                        ?`Ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)} (${(100-ltv).toFixed(0)}% της αξίας). Εντός αποδεκτών ορίων.`
                        :`Άριστη αναλογία — ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)} (${(100-ltv).toFixed(0)}%). Ενισχύει τη διαπραγματευτική σας θέση.`
                      }
                    </p>
                  </div>
                </div>

                {/* Rate */}
                <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                  <div style={{width:36,height:36,borderRadius:8,background:'var(--info-dim)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                      Επιτόκιο {fmtPct(cs.effectiveRate)} — {cs.rateType==='variable'?'Κυμαινόμενο':'Σταθερό'}
                      {cs.rateType==='variable'&&<span style={{fontSize:11,color:'var(--warning)',marginLeft:8,fontWeight:400}}>Εκτεθειμένο σε Euribor</span>}
                    </p>
                    <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                      {cs.rateType==='variable'
                        ?`Τρέχον Euribor ${fmtPct(market.euribor_3m)}. Αν ανέβει +2%, η δόση γίνεται ${fmtEur(stressMonthly2)} — αύξηση ${fmtEur(stressMonthly2-cs.monthly)}/μήνα.`
                        :bestBank&&savingVsBestBank>0
                        ?`Σταθερό — ασφάλεια. Καλύτερο σταθερό αγοράς: ${fmtPct(bestBank.fixed_min)} (${bestBank.name}) → δόση ${fmtEur(bestBankMonthly)} → εξοικονόμηση ${fmtEur(savingVsBestBank)}.`
                        :`Σταθερό ${fmtPct(cs.effectiveRate)} — προστατευμένοι. Euribor 3M: ${fmtPct(market.euribor_3m)}.`
                      }
                    </p>
                  </div>
                </div>

                {/* Total cost */}
                <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                  <div style={{width:36,height:36,borderRadius:8,background:'var(--negative-dim)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                      Συνολικοί τόκοι {fmtEur(cs.totalInterest)} — {(interestRatio*100).toFixed(0)}% επί κεφαλαίου
                    </p>
                    <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                      Για {fmtEur(cs.loanAmount)} θα αποπληρώσετε συνολικά {fmtEur(totalCost)}.
                      {cs.years>20&&savedByShortening>0
                        ?` Σε 20 χρόνια: δόση ${fmtEur(shortMonthly20)}/μήνα (+${fmtEur(shortMonthly20-cs.monthly)}) → εξοικονόμηση ${fmtEur(savedByShortening)} τόκοι.`
                        :` Έκτακτη πληρωμή 100€/μήνα → -${extraPay100Saving.toFixed(1)} χρόνια διάρκεια.`
                      }
                    </p>
                  </div>
                </div>

                {(advType==='first_home'||(advBorr==='young'||advBorr==='family'))&&spitiSaving>5000&&(
                  <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',borderLeft:'3px solid var(--positive)',borderRadius:8,border:'1px solid var(--border-subtle)'}}>
                    <div style={{width:36,height:36,borderRadius:8,background:'var(--positive-soft)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--positive)',marginBottom:3}}>
                        Σπίτι μου ΙΙ: εξοικονομείτε {fmtEur(spitiSaving)} — deadline 31/08/2026
                      </p>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                        Δόση {fmtEur(spitiMonthly)}/μήνα αντί {fmtEur(cs.monthly)} — διαφορά {fmtEur(cs.monthly-spitiMonthly)}/μήνα.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Eligibility */}
            <div style={cardStyle}>
              <SectionLabel label="Επιλεξιμότητα Κρατικών Προγραμμάτων"/>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {[
                  {l:'Σπίτι μου ΙΙ — Deadline 31/08/2026',el:(advBorr==='young'||advBorr==='family')&&advType==='first_home',reason:(advBorr==='young'||advBorr==='family')&&advType==='first_home'?`Πληροίτε τα κριτήρια. Δόση από ${fmtEur(spitiMonthly)}/μήνα`:advType!=='first_home'?'Αλλάξτε σε "Πρώτη κατοικία"':'Ηλικία 25-50',badge:`-${fmtEur(cs.monthly-spitiMonthly)}/μήνα`},
                  {l:'Αναβαθμίζω — Deadline 31/08/2026',el:advType==='energy',reason:advType==='energy'?'Κατάλληλο. Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο':'Επιλέξτε "Ενεργειακή αναβάθμιση"',badge:'Επιδοτούμενο επιτόκιο ΤΑΑ'},
                  {l:'Πράσινο Δάνειο (-0.15% έως -0.25%)',el:advType==='energy'||advType==='renovation',reason:advType==='energy'||advType==='renovation'?`Εξοικονόμηση ~${fmtEur(cs.loanAmount*0.002*cs.years)} τόκων`:'Για ενεργειακή αναβάθμιση ή ανακαίνιση',badge:`~${fmtEur(cs.loanAmount*0.002*cs.years)}`},
                  {l:'Ένοπλες Δυνάμεις — ΤΑΠ-ΟΙΚ',el:advBorr==='military',reason:advBorr==='military'?'Δικαιούστε επιδοτούμενο δάνειο μέσω ΤΑΠ':'Μόνο για εν ενεργεία μέλη',badge:'Χαμηλότερο επιτόκιο'},
                  {l:'Γέφυρα 3 — Επιδότηση δόσης',el:cs.rateType==='variable',reason:cs.rateType==='variable'?'Κυμαινόμενο επιτόκιο — ελέγξτε εισοδηματικά κριτήρια':'Εφαρμόζεται μόνο σε κυμαινόμενα',badge:'50% αύξησης δόσης'},
                ].map(item=>(
                  <div key={item.l} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderLeft:`3px solid ${item.el?'var(--positive)':'var(--border-subtle)'}`,borderRadius:8}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:item.el?'var(--positive-soft)':'var(--negative-dim)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {item.el
                        ?<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        :<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      }
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontSize:13,color:item.el?'var(--text-primary)':'var(--text-secondary)',fontWeight:item.el?500:400,fontFamily:"'Inter',sans-serif"}}>{item.l}</p>
                      <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif"}}>{item.reason}</p>
                    </div>
                    {item.el&&<span style={{fontSize:11,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--positive)',background:'var(--positive-dim)',padding:'4px 10px',borderRadius:8,border:'1px solid var(--positive-border)',whiteSpace:'nowrap' as const,fontWeight:500}}>{item.badge}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Bank ranking */}
            <div style={cardStyle}>
              <SectionLabel label={`Καλύτερες Τράπεζες για ${fmtEur(cs.loanAmount)} / ${cs.years} χρόνια`}/>
              {BANKS.slice().sort((a:any,b:any)=>(a.fixed_min||parseFloat(a.fixed_3yr)||99)-(b.fixed_min||parseFloat(b.fixed_3yr)||99)).slice(0,4).map((bank:any,i:number)=>{
                const m=calcMonthly(cs.loanAmount,bank.fixed_min,cs.years)
                const ti=m*cs.years*12-cs.loanAmount
                const medals=['1','2','3','4']
                return(
                  <div key={bank.id||bank.bank_id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',marginBottom:7,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderLeft:i===0?`3px solid var(--info)`:'3px solid transparent',borderRadius:8}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:i===0?'var(--accent)':'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <span style={{fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:700,color:i===0?'var(--accent-text)':'var(--text-secondary)'}}>{medals[i]}</span>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{bank.bank_name||bank.name}</p>
                      <p style={{fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>
                        {bank.note} · {fmtPct(bank.fixed_min)} σταθερό
                        {bank.spiti_mou&&<span style={{color:'var(--positive)',marginLeft:8}}>· Σπίτι ΙΙ</span>}
                      </p>
                    </div>
                    <div style={{textAlign:'right' as const}}>
                      <p style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)',fontWeight:700}}>{fmtEur(m)}/μήνα</p>
                      {i===0
                        ?<p style={{fontSize:10,color:'var(--positive)',fontFamily:"'Inter',sans-serif"}}>Καλύτερο στην αγορά</p>
                        :<p style={{fontSize:10,color:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>Συνολικοί τόκοι: {fmtEur(ti)}</p>
                      }
                    </div>
                    <button onClick={()=>setTab('calculator')} style={{padding:'0 12px',height:32,background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:20,cursor:'pointer',color:'var(--text-secondary)',fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:500}}>Επιλογή</button>
                  </div>
                )
              })}
            </div>

            {/* Improvements */}
            {issues.length>0&&(
              <div style={cardStyle}>
                <SectionLabel label="Τι Μπορείτε να Βελτιώσετε"/>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {issues.includes('LTV')&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--negative)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>LTV</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Αυξήστε την προκαταβολή:</strong> LTV κάτω από 80% → καλύτερο επιτόκιο και αποδοχή.</p>
                    </div>
                  )}
                  {issues.includes('Επιτόκιο')&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--warning)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Spread</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Διαπραγματευτείτε:</strong> Γραπτές προσφορές από 3 τράπεζες — μειώσεις 0.10-0.25% είναι συνηθισμένες.</p>
                    </div>
                  )}
                  {issues.includes('Κυμαινόμενο')&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--warning)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Κίνδυνος</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Σκεφτείτε σταθερό:</strong> +2% Euribor → δόση {fmtEur(stressMonthly2)} (+{fmtEur(stressMonthly2-cs.monthly)}/μήνα).</p>
                    </div>
                  )}
                  {issues.includes('Διάρκεια')&&cs.years>20&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--info)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Χρόνια</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Μειώστε τη διάρκεια:</strong> 20 χρόνια → δόση {fmtEur(shortMonthly20)} → εξοικονόμηση {fmtEur(savedByShortening)} τόκοι.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ═══ GUIDE ═══ */}
      {tab==='guide'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={cardStyle}>
            <SectionLabel label="Πώς Λειτουργεί Ένα Στεγαστικό Δάνειο στην Ελλάδα"/>
            {[
              {step:1,title:'Προεπιλογή & Προετοιμασία',time:'1-2 εβδομάδες',color:'var(--info)',dim:'var(--info-soft)',desc:'Ελέγξτε επιλεξιμότητα στο gov.gr με Taxisnet. Για Σπίτι μου ΙΙ η προεπιλογή είναι αυτόματη.',tip:'Κάντε πρώτα τον έλεγχο επιλεξιμότητας στο gov.gr — αν αποτύχει μάθετε νωρίς γιατί.',warning:'Χρέη σε ΔΟΥ, ΕΦΚΑ ή εκτελεστοί τίτλοι μπλοκάρουν άμεσα. Τακτοποιήστε πρώτα.',url:null},
              {step:2,title:'Συλλογή Εγγράφων',time:'1-3 εβδομάδες',color:'var(--positive)',dim:'var(--positive-soft)',desc:'Εκκαθαριστικά, μισθοδοτικές 3 μηνών, Ε9, πιστοποιητικό οικογενειακής κατάστασης. Ελεύθεροι επαγγελματίες: φορολογικές 2 ετών.',tip:'Ζητήστε κάθε έγγραφο εκ των προτέρων — η τράπεζα συχνά ζητά επιπλέον κατά τη διαδικασία.',warning:'Τα Ε1/Ε9 από ΑΑΔΕ — βεβαιωθείτε ότι είναι ενημερωμένα.',url:null},
              {step:3,title:'Αίτηση στην Τράπεζα',time:'1 ημέρα',color:'var(--warning)',dim:'var(--warning-soft)',desc:'Για Σπίτι μου ΙΙ επιλέξτε ΜΙΑ τράπεζα — δεν επιτρέπονται ταυτόχρονες αιτήσεις. Επιλέξτε προσεκτικά βάσει επιτοκίου.',tip:'Ζητήστε γραπτή προσφορά (ESIS) από 2-3 τράπεζες πριν δεσμευτείτε. Δικαιούστε 7 εργάσιμες για απόφαση.',warning:'Μην υπογράφετε τίποτα την πρώτη μέρα. Μελετήστε το ESIS.',url:'https://www.bankofgreece.gr'},
              {step:4,title:'Εκτίμηση Ακινήτου & Νομικός Έλεγχος',time:'1-3 εβδομάδες',color:'var(--info)',dim:'var(--info-soft)',desc:'Πιστοποιημένος εκτιμητής (RICS ή ΤΕΕ) αξιολογεί το ακίνητο. Νομικός έλεγχος τίτλων στο Κτηματολόγιο.',tip:'Αν η εκτίμηση είναι χαμηλότερη από την τιμή αγοράς, το LTV υπολογίζεται επί αυτής — ενδέχεται να χρειαστείτε επιπλέον κεφάλαια.',warning:'Αυθαίρετα (κλεισμένες βεράντες, αλλαγές χωρίς άδεια) μπλοκάρουν τη μεταβίβαση. Ζητήστε τεχνικό έλεγχο πρώτα.',url:'https://www.ktimatologio.gr'},
              {step:5,title:'Έγκριση Δανείου',time:'3-10 εργάσιμες',color:'var(--positive)',dim:'var(--positive-soft)',desc:'Η τράπεζα αξιολογεί εισόδημα, Τειρεσία, εκτίμηση, νομικά. Η απόφαση ισχύει συνήθως 90 ημέρες.',tip:'Σε απόρριψη ζητήστε γραπτώς τον λόγο. Επανεξετάστε μετά από 6 μήνες ή αλλάξτε τράπεζα.',warning:'Ακόμα και μία ακάλυπτη επιταγή ή δόση με καθυστέρηση >90 ημερών επηρεάζει τον Τειρεσία.',url:'https://www.tiresias.gr'},
              {step:6,title:'Συμβόλαιο & Εκταμίευση',time:'1-2 εβδομάδες',color:'var(--warning)',dim:'var(--warning-soft)',desc:'Αγοραπωλητήριο ενώπιον συμβολαιογράφου. Εκταμίευση μετά καταχώρηση στο Κτηματολόγιο.',tip:'Νεόδμητα: απαιτείται ΠΕΑ για τη μεταβίβαση.',warning:'Φορολογικές & ασφαλιστικές ενημερότητες λήγουν γρήγορα (15-30 μέρες) — έχετε τα μαζί σας.',url:null},
            ].map((step,i,arr)=>(
              <div key={i} style={{display:'flex',gap:16,alignItems:'flex-start',paddingBottom:20,borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none',marginBottom:i<arr.length-1?20:0}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:(step as any).dim||'var(--accent-dim)',border:`2px solid ${step.color}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{fontSize:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:step.color,fontWeight:700}}>{step.step}</span>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                    <p style={{fontSize:14,fontWeight:400,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{step.title}</p>
                    <span style={{fontSize:10,color:'var(--text-secondary)',background:'var(--bg-surface)',padding:'2px 8px',borderRadius:8,border:'1px solid var(--border-subtle)',fontFamily:"'Inter',sans-serif"}}>{step.time}</span>
                  </div>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.7,marginBottom:8,fontFamily:"'Inter',sans-serif"}}>{step.desc}</p>
                  <div style={{padding:'8px 12px',background:'var(--positive-soft)',border:'1px solid var(--positive-border)',borderRadius:8,marginBottom:6}}>
                    <p style={{fontSize:12,color:'var(--positive)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{step.tip}</p>
                  </div>
                  <div style={{padding:'8px 12px',background:'var(--warning-soft)',border:'1px solid var(--warning-border)',borderRadius:8}}>
                    <p style={{fontSize:12,color:'var(--warning)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{step.warning}</p>
                  </div>
                  {step.url&&<a href={step.url} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:8,fontSize:12,color:'var(--info)',textDecoration:'none',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Επίσημη πηγή →</a>}
                </div>
              </div>
            ))}
          </div>


          {/* Rejection reasons */}
          <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
            <SectionLabel label="Γιατί Απορρίπτεται Μια Αίτηση — Τι να Ελέγξετε Πρώτα"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8}}>
              {[
                {title:'Εγγραφή στον Τειρεσία',desc:'Ακόμα και μία ακάλυπτη επιταγή ή δόση με καθυστέρηση άνω των 90 ημερών αρκεί. Τυχόν οφειλές πρέπει να τακτοποιηθούν πριν από οποιαδήποτε αίτηση.',url:'https://www.tiresias.gr'},
                {title:'Χαμηλό εισόδημα / Υψηλό DTI',desc:'Η δόση δεν πρέπει να υπερβαίνει το 35-40% του καθαρού εισοδήματος. Επαγγελματίες με χαμηλές δηλώσεις είναι ο κύριος λόγος απόρριψης.',url:null},
                {title:'Αυθαίρετα στο ακίνητο',desc:'Τροποποιήσεις χωρίς άδεια (κλεισμένη βεράντα, πατάρι, αλλαγή χρήσης) μπλοκάρουν τη μεταβίβαση ή μειώνουν την εκτίμηση.',url:'https://www.ktimatologio.gr'},
                {title:'Προβλήματα τίτλων',desc:'Ακαθόριστοι τίτλοι, αδήλωτα ακίνητα σε Ε9, εκκρεμείς διαδικασίες κληρονομιάς. Ο νομικός έλεγχος διαρκεί εβδομάδες.',url:null},
                {title:'Χρέη σε ΔΟΥ / ΕΦΚΑ',desc:'Απαιτείται φορολογική και ασφαλιστική ενημερότητα για υπογραφή συμβολαίου. Χρέη πρέπει να τακτοποιηθούν πριν.',url:'https://www.aade.gr'},
                {title:'LTV > 80-90%',desc:'Οι τράπεζες χορηγούν συνήθως έως 80% για κανονικό δάνειο ή 90% για Σπίτι μου ΙΙ. Χρειάζεστε ίδια κεφάλαια για τη διαφορά + έξοδα.',url:null},
              ].map(item=>(
                <div key={item.title} style={{padding:'14px 16px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12}}>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:6}}>{item.title}</p>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:item.url?8:0,fontFamily:"'Inter',sans-serif"}}>{item.desc}</p>
                  {item.url&&<a href={item.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--info)',textDecoration:'none',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Ελέγξτε εδώ →</a>}
                </div>
              ))}
            </div>
          </div>

          {/* Special borrower categories */}
          <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16}}>
            <SectionLabel label="Ειδικές Κατηγορίες Δανειοληπτών"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10}}>
              {[
                {title:'Ένοπλες Δυνάμεις',desc:'ΤΑΠ-ΟΙΚ: επιδοτούμενα στεγαστικά με χαμηλότερο επιτόκιο για εν ενεργεία μέλη Ένοπλων Δυνάμεων και Σωμάτων Ασφαλείας. Ισχύουν ειδικά κριτήρια βαθμού και υπηρεσίας.',url:'https://www.tap.gr'},
                {title:'Κάτοικοι Εξωτερικού',desc:'Max LTV 55-70%. Απαιτούνται επίσημες μεταφράσεις, αποδεικτικό κατοικίας εξωτερικού, εισοδήματα από ξένη χώρα. Ισχύουν ΣΑΔΦ.',url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia'},
                {title:'Νέοι 25-50 ετών',desc:'Σπίτι μου ΙΙ: 50% άτοκο κεφάλαιο, deadline 31/08/2026. Εισόδημα έως €40.000. Πρώτη κατοικία έως 150τμ.',url:'https://greece20.gov.gr/en/home-loans/'},
                {title:'Ελεύθεροι Επαγγελματίες',desc:'Μέσος όρος εισοδήματος 2 ετών. Max LTV 65-70%. Απαιτείται συνέπεια στις φορολογικές δηλώσεις.',url:'https://www.aade.gr'},
                {title:'Πολύτεκνοι & Τρίτεκνοι',desc:'+50% επιδότηση επιτοκίου Σπίτι μου ΙΙ. Εισόδημα έως €45.000 (2 παιδιά) ή €50.000 (3+ παιδιά). Αυξημένα όρια ΦΜΑ.',url:'https://greece20.gov.gr/en/home-loans/'},
                {title:'Εταιρείες & Επαγγελματικά',desc:'Ισολογισμοί 3 ετών + Απόφαση ΔΣ + εγγύηση φυσικού προσώπου. LTV 60-70%. Πλήρης έκπτωση τόκων από φορολογικά αποτελέσματα.',url:'https://www.nbg.gr/el/epixeiriseis'},
              ].map(cat=>(
                <div key={cat.title} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,padding:14}}>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:7}}>{cat.title}</p>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,marginBottom:8,fontFamily:"'Inter',sans-serif"}}>{cat.desc}</p>
                  <a href={cat.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--info)',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4,fontFamily:"'Inter',sans-serif",fontWeight:500}}>Περισσότερα →</a>
                </div>
              ))}
            </div>
          </div>

          {/* Euribor chart */}
          <div style={cardStyle}>
            <SectionLabel label="Ιστορικό Euribor 3M — 2020 έως Σήμερα" right={<a href="https://data.ecb.europa.eu" target="_blank" rel="noreferrer" style={{fontSize:10,color:'var(--info)',textDecoration:'none',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Πηγή: ECB</a>}/>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={EURIBOR_HISTORY.map(d=>({date:d.date,Euribor:d.val}))} barCategoryGap="8%">
                <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}} axisLine={false} tickLine={false} interval={3}/>
                <YAxis tick={{fontSize:10,fill:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} width={36}/>
                <Tooltip content={ChartTip}/>
                <ReferenceLine y={0} stroke="var(--border-subtle)" strokeWidth={1}/>
                <Bar dataKey="Euribor" radius={[3,3,0,0]} fill="var(--info)" opacity={0.75}/>
              </BarChart>
            </ResponsiveContainer>
            <div style={{display:'flex',gap:24,marginTop:12,flexWrap:'wrap'}}>
              {[
                {l:'Ιστορικό χαμηλό',v:'-0.55% (2021)',c:'var(--info)'},
                {l:'Ιστορικό υψηλό',v:'4.0% (Οκτ 2023)',c:'var(--negative)'},
                {l:'Τρέχον',v:fmtPct(market.euribor_3m),c:'var(--positive)'},
                {l:'Μείωση από peak',v:`-${fmtPct(4.0-market.euribor_3m)}`,c:'var(--positive)'},
              ].map(item=>(
                <div key={item.l}>
                  <p style={{...labelStyle,marginBottom:3}}>{item.l}</p>
                  <p style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:item.c,fontWeight:700}}>{item.v}</p>
                </div>
              ))}
            </div>
            <div style={{marginTop:12,padding:'10px 14px',background:'var(--info-dim)',border:'1px solid var(--info)',borderRadius:8}}>
              <p style={{fontSize:12,color:'var(--info)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
                Κυμαινόμενα δάνεια (2021, Euribor -0.55%) έχουν σήμερα πραγματικό επιτόκιο ~{fmtPct(market.euribor_3m+1.5)}. Η ΕΚΤ μείωσε 8 φορές από Ιούνιο 2024.
              </p>
            </div>
          </div>

          {/* Glossary */}
          <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,overflow:'hidden'}}>
            <button onClick={()=>setShowGloss(g=>!g)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:showGloss?'var(--accent)':'var(--border-default)',display:'inline-block',transition:'background 0.2s'}}/>
                <p style={{fontSize:13,color:showGloss?'var(--accent)':'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:400}}>Γλωσσάρι Βασικών Όρων</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polyline points={showGloss?"18 15 12 9 6 15":"6 9 12 15 18 9"}/></svg>
            </button>
            {showGloss&&(
              <div style={{padding:'0 16px 16px',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8}}>
                {GLOSSARY.map((item,i)=>(
                  <div key={i} style={{padding:'11px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                    <p style={{fontSize:12,color:'var(--text-secondary)',fontWeight:500,marginBottom:4,fontFamily:"'Roboto Mono',monospace"}}>{item.term}</p>
                    <p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>{item.def}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Links */}
          <div style={cardStyle}>
            <SectionLabel label="Επίσημες Πηγές"/>
            {[
              {category:'Κρατικά Προγράμματα',links:[
                {label:'Σπίτι μου ΙΙ — Επίσημη σελίδα',sub:'Αίτηση, κριτήρια, deadline 31/08/2026',url:'https://greece20.gov.gr/en/home-loans/'},
                {label:'Αναβαθμίζω το Σπίτι μου',sub:'HDB — επίσημη πλατφόρμα αιτήσεων',url:'https://hdb.gr/anavathmizo-to-spiti-mou/'},
                {label:'Εξοικονομώ 2025',sub:'Επιδότηση ενεργειακής αναβάθμισης',url:'https://exoikonomo2025.gov.gr/'},
                {label:'Ανακαινίζω & Νοικιάζω — ΟΠΕΚΑ',sub:'40% επιδότηση + εγγυημένο ενοίκιο',url:'https://www.opeka.gr'},
                {label:'Γέφυρα 3 — Επιδότηση δόσης',sub:'Για κυμαινόμενα δάνεια, ευάλωτοι',url:'https://gefyra3.gr'},
              ]},
              {category:'Τράπεζες & Επιτόκια',links:[
                {label:'Τράπεζα Ελλάδος — Επιτόκια',sub:'Επίσημα μέσα επιτόκια αγοράς',url:'https://www.bankofgreece.gr/el/statistiki/nomismatiki-kai-trapeziki-statistiki/epitokia-katatheseon-kai-daneion'},
                {label:'vresdaneio.gr — Σύγκριση',sub:'Σύγκριση επιτοκίων όλων των τραπεζών',url:'https://vresdaneio.gr/epitokia/index.html'},
                {label:'e-stegastiko.gr — Πλατφόρμα ΤτΕ',sub:'Επίσημη πλατφόρμα στεγαστικών',url:'https://e-stegastiko.gr'},
                {label:'Τειρεσίας — Έλεγχος πιστοληπτικής',sub:'Ελέγξτε αν έχετε εγγραφές πριν αιτηθείτε',url:'https://www.tiresias.gr'},
              ]},
              {category:'Φορολογικά',links:[
                {label:'ΑΑΔΕ — Φορολογικά ακινήτων',sub:'ΦΜΑ, ΕΝΦΙΑ, εισοδήματα από ενοίκια',url:'https://www.aade.gr/polites/foroi-akiniton'},
                {label:'Κτηματολόγιο — Έλεγχος τίτλων',sub:'Ηλεκτρονικός έλεγχος εγγράφων',url:'https://www.ktimatologio.gr'},
                {label:'Επιλεξιμότητα Σπίτι μου ΙΙ — gov.gr',sub:'Ηλεκτρονικός έλεγχος με Taxisnet',url:'https://www.gov.gr/ipiresies/periousia-kai-phorologia/akinhta/elegkhos-epile3imotetas-programmatos-spiti-mou-ii'},
              ]},
              {category:'Χρήσιμα Εργαλεία',links:[
                {label:'HDB — Ελληνική Αναπτυξιακή Τράπεζα',sub:'Διαχείριση κρατικών προγραμμάτων δανείων',url:'https://hdb.gr'},
                {label:'ΥΠΕΝ — Ενεργειακά προγράμματα',sub:'Παρατάσεις, νέα, ανακοινώσεις',url:'https://ypen.gov.gr'},
                {label:'ΤΑΠ — Ταμείο Αλληλοβοηθείας',sub:'Στεγαστικά για στελέχη Ένοπλων Δυνάμεων',url:'https://www.tap.gr'},
                {label:'Ευρωπαϊκή Κεντρική Τράπεζα — Euribor',sub:'Επίσημα ιστορικά δεδομένα Euribor',url:'https://data.ecb.europa.eu/data/datasets/FM/FM.B.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA'},
              ]},
            ].map(group=>(
              <div key={group.category} style={{marginBottom:16}}>
                <p style={{...labelStyle,marginBottom:8}}>{group.category}</p>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {group.links.map(link=>(
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,textDecoration:'none',transition:'background 0.15s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-elevated)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='var(--bg-surface)')}
                    >
                      <div>
                        <p style={{fontSize:13,color:'var(--text-primary)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{link.label}</p>
                        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif"}}>{link.sub}</p>
                      </div>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{flexShrink:0,marginLeft:12}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <div style={{padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
              <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
                Ενημερωτικές πληροφορίες — δεν αποτελούν χρηματοοικονομική, νομική ή φορολογική συμβουλή.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SAVED ═══ */}
      {tab==='saved'&&(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{saved.length} δάνεια</span>
            <ExportButton disabled={saved.length===0} onClick={()=>downloadCsv(
              `daneio_${new Date().toISOString().slice(0,10)}`,
              ['Τράπεζα','Τύπος Δανείου','Ποσό (€)','Επιτόκιο (%)','Τύπος Επιτοκίου','Διάρκεια (έτη)','Δόση/μήνα (€)','Συνολικοί Τόκοι (€)','LTV (%)','Έναρξη','Κατάσταση','Σημειώσεις'],
              saved.map(loan=>{
                const m=calcMonthly(loan.amount,loan.rate,loan.years)
                const ti=m*loan.years*12-loan.amount
                const ltv=loan.property_value>0?(loan.amount/loan.property_value)*100:0
                return [
                  loan.bank, LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type,
                  csvEur(loan.amount), csvDec(loan.rate), loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό',
                  loan.years, csvEur(m), csvEur(ti), csvDec(ltv,1),
                  csvDate(loan.start_date), loan.status==='active'?'Ενεργό':'Ανενεργό', (loan.notes||'').replace(/\n/g,' '),
                ]
              })
            )}/>
          </div>
          {saved.length===0&&(
            <div style={{textAlign:'center',padding:'60px 0'}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border-default)" strokeWidth="1.5" style={{margin:'0 auto 14px',display:'block'}}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <p style={{fontSize:15,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:400}}>Δεν υπάρχουν αποθηκευμένα δάνεια</p>
              <p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:6,fontFamily:"'Inter',sans-serif"}}>Χρησιμοποίησε τον Υπολογιστή Δανείου για να υπολογίσεις και να αποθηκεύσεις δάνεια.</p>
              <button onClick={()=>setTab('calculator')} style={{marginTop:14,padding:'0 18px',height:36,background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:20,color:'var(--text-secondary)',fontSize:13,fontFamily:"'Inter',sans-serif",fontWeight:500,cursor:'pointer'}}>Άνοιξε τον Υπολογιστή Δανείου</button>
            </div>
          )}
          {saved.map(loan=>{
            const m=calcMonthly(loan.amount,loan.rate,loan.years)
            const ti=m*loan.years*12-loan.amount
            const ltv=loan.property_value>0?(loan.amount/loan.property_value)*100:0
            const elapsed=loan.start_date?Math.floor((Date.now()-new Date(loan.start_date).getTime())/(1000*60*60*24*30.44)):0
            const rem=Math.max(0,loan.years*12-elapsed)
            return(
              <div key={loan.id} style={cardStyle}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                      <p style={{fontSize:16,fontWeight:400,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{loan.bank}</p>
                      <span style={{fontSize:10,padding:'2px 8px',borderRadius:12,background:'var(--positive-dim)',color:'var(--positive)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{loan.status==='active'?'Ενεργό':'Ανενεργό'}</span>
                      <span style={{fontSize:10,padding:'2px 8px',borderRadius:12,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type}</span>
                    </div>
                    {loan.notes&&<p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{loan.notes}</p>}
                  </div>
                  <button onClick={()=>deleteLoan(loan.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--border-default)',padding:4,display:'flex',borderRadius:8}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))',gap:8,marginBottom:12}}>
                  <KPI label="Ποσό" value={fmtEur(loan.amount)} color="var(--accent)"/>
                  <KPI label="Επιτόκιο" value={fmtPct(loan.rate)} color="var(--info)" sub={loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό'}/>
                  <KPI label="Δόση/μήνα" value={fmtEur(m)} color="var(--positive)"/>
                  <KPI label="Συνολικοί Τόκοι" value={fmtEur(ti)} color="var(--negative)"/>
                  <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?'var(--warning)':'var(--positive)'}/>
                </div>
                {loan.start_date&&(
                  <div style={{padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,display:'flex',gap:24,flexWrap:'wrap'}}>
                    <div><p style={{...labelStyle,marginBottom:2}}>Έναρξη</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{loan.start_date}</p></div>
                    <div><p style={{...labelStyle,marginBottom:2}}>Αποπλ. μήνες</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>~{elapsed}</p></div>
                    <div><p style={{...labelStyle,marginBottom:2}}>Υπόλοιποι μήνες</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>~{rem}</p></div>
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