'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { Calculator, Building2, Star, Zap, BookOpen, Save, Check, X, ExternalLink, Leaf, ChevronDown, ChevronUp, RefreshCw, AlertTriangle } from 'lucide-react'
import { CustomSelect } from './UIComponents'
import TabLoanCalculator from './TabLoanCalculator'
import { useMarketRates, useBankRates, useLoanPrograms } from '../../hooks/useMarketData'
import {
  BANKS as BANKS_STATIC, STATE_PROGRAMS as PROGRAMS_STATIC,
  LOAN_TYPES, BORROWER_PROFILES,
  GLOSSARY, PROCESS_STEPS, EURIBOR_HISTORY,
  calcMonthly, fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, SavedLoan, MarketRates,
  MARKET_FALLBACK
} from './TabLoanData'

// ─── Shared helpers ───────────────────────────────────────────────────────────
const dot = (label: string, right?: React.ReactNode) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', display:'inline-block', flexShrink:0 }}/>
      <p style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:600 }}>{label}</p>
    </div>
    {right}
  </div>
)

function KPI({ label, value, color, sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'12px 14px' }}>
      <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6, fontWeight:600 }}>{label}</p>
      <p style={{ fontSize:16, fontFamily:'JetBrains Mono, monospace', color:color||'var(--text-primary)', fontWeight:700 }}>{value}</p>
      {sub&&<p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:3 }}>{sub}</p>}
    </div>
  )
}

function ChartTip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'JetBrains Mono, monospace', boxShadow:'0 4px 16px rgba(0,0,0,0.3)' }}>
      <p style={{ color:'var(--text-secondary)', marginBottom:6, fontSize:10 }}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:2, background:p.color, display:'inline-block' }}/>
          <p style={{ color:'var(--text-primary)' }}>{p.name}: <strong style={{ color:p.color }}>{typeof p.value==='number'&&p.value>10?fmtEur(p.value):`${p.value}%`}</strong></p>
        </div>
      ))}
    </div>
  )
}

// Advisor select options
const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k,v])=>({ value:k, label:v.label }))
const BORROWER_OPTIONS  = Object.entries(BORROWER_PROFILES).map(([k,v])=>({ value:k, label:v.label }))

interface CalcState {
  loanType:LoanType; borrowerType:BorrowerType; loanAmount:number; years:number
  rateType:RateType; effectiveRate:number; monthly:number; totalInterest:number; propertyValue:number
}

export default function TabLoan({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase = createClient()
  const [tab, setTab] = useState<'calculator'|'banks'|'programs'|'advisor'|'guide'|'saved'>('calculator')
  const [saved, setSaved] = useState<SavedLoan[]>([])
  const [filterGreen, setFG] = useState(false)
  const [filterSpiti, setFS] = useState(false)
  const [showGloss, setShowGloss] = useState(false)

  // ── Live data from Supabase (ECB + ΤτΕ auto-updated daily) ──
  const market      = useMarketRates()
  const { banks: liveBanks, loading: banksLoading, verifiedAt } = useBankRates()
  const { programs: livePrograms, loading: programsLoading }    = useLoanPrograms()

  // Fallback to static if DB empty
  const BANKS    = liveBanks.length    ? liveBanks    : BANKS_STATIC
  const PROGRAMS = livePrograms.length ? livePrograms : PROGRAMS_STATIC

  // Calculator state (synced from child)
  const [calcState, setCalcState] = useState<CalcState>({
    loanType:'purchase', borrowerType:'individual', loanAmount:150000,
    years:25, rateType:'fixed', effectiveRate:3.5,
    monthly:calcMonthly(150000,3.5,25), totalInterest:0, propertyValue:200000,
  })

  // Advisor inputs (default from calculator)
  const [advType, setAdvType] = useState<LoanType>('purchase')
  const [advBorr, setAdvBorr] = useState<BorrowerType>('individual')
  const [advAmt,  setAdvAmt]  = useState('150000')
  const [advYrs,  setAdvYrs]  = useState('25')

  useEffect(()=>{ loadSaved() },[propertyId])

  // Sync advisor from calculator when tab changes
  useEffect(()=>{
    if(tab==='advisor'){
      setAdvType(calcState.loanType)
      setAdvBorr(calcState.borrowerType)
      setAdvAmt(String(Math.round(calcState.loanAmount)))
      setAdvYrs(String(calcState.years))
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
    alert(`✓ ${Math.min(years*12,60)} δόσεις αποθηκεύτηκαν στο Ημερολόγιο`)
  }
  async function handleSaveExp(monthly:number,bankName:string){
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Δόση δανείου${bankName?` — ${bankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:new Date().toISOString().split('T')[0]})
    alert('✓ Δόση καταχωρήθηκε στις Δαπάνες')
  }
  async function deleteLoan(id:string){if(!confirm('Διαγραφή δανείου;'))return;await supabase.from('loans').delete().eq('id',id);await loadSaved()}

  const updStr = market.isLoading ? '...' : new Date(market.updated_at).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})
  const banksUpdStr = verifiedAt ? new Date(verifiedAt).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'}) : updStr
  const LA = parseFloat(advAmt)||150000
  const Y  = parseInt(advYrs)||25

  // Active programs — from DB view (auto-filtered) or static fallback
  const activePrograms = PROGRAMS

  const TABS = [
    {id:'calculator',label:'Calculator',icon:<Calculator size={11}/>},
    {id:'banks',label:'Τράπεζες',icon:<Building2 size={11}/>},
    {id:'programs',label:'Κρατικά Προγράμματα',icon:<Star size={11}/>},
    {id:'advisor',label:'Advisor',icon:<Zap size={11}/>},
    {id:'guide',label:'Οδηγός',icon:<BookOpen size={11}/>},
    {id:'saved',label:`Αποθηκευμένα${saved.length>0?` (${saved.length})`:''}`,icon:<Save size={11}/>},
  ]

  return (
    <div style={{ fontFamily:'Inter,sans-serif', color:'var(--text-primary)', display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Header ── */}
      <div style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Calculator size={15} color="var(--accent)"/>
          <div>
            <p style={{ fontSize:13, color:'var(--accent)', fontWeight:700 }}>Εργαλείο Στεγαστικών Δανείων</p>
            <p style={{ fontSize:10, color:'var(--text-tertiary)' }}>Ελληνική Αγορά · Δεδομένα ECB + ΤτΕ</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:20, marginLeft:'auto', flexWrap:'wrap', alignItems:'center' }}>
          {[
            {l:'Euribor 3M', v:market.euribor_3m, c:'var(--info)'},
            {l:'Euribor 1M', v:market.euribor_1m, c:'var(--info)'},
            {l:'ΕΚΤ',        v:market.ecb_rate,   c:'#a78bfa'},
            ...(market.bog_housing_new ? [{l:'ΤτΕ Μέσο', v:market.bog_housing_new, c:'var(--positive)'}] : []),
          ].map(item=>(
            <div key={item.l} style={{ textAlign:'center' as const }}>
              <p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{item.l}</p>
              <p style={{ fontSize:14, fontFamily:'JetBrains Mono, monospace', color:market.isLoading?'var(--border-default)':item.c, fontWeight:700 }}>
                {market.isLoading?'…':fmtPct(item.v)}
              </p>
            </div>
          ))}
          <div style={{ textAlign:'right' as const }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:market.isStale?'var(--warning)':'var(--positive)', display:'inline-block' }}/>
              <p style={{ fontSize:9, color:'var(--text-tertiary)' }}>
                {market.isStale ? 'Δεδομένα > 48ω — ενημέρωση σύντομα' : `Live · ${updStr}`}
              </p>
            </div>
            <p style={{ fontSize:9, color:'var(--text-tertiary)', marginTop:1 }}>
              {market.source_euribor === 'ECB EMMI live' ? '✓ ECB API live' : '~ Fallback'}
            </p>
          </div>
          {market.rate_changed && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:'rgba(251,146,60,0.1)', border:'1px solid rgba(251,146,60,0.3)', borderRadius:8 }}>
              <AlertTriangle size={12} color="var(--warning)"/>
              <span style={{ fontSize:10, color:'var(--warning)', fontWeight:600 }}>Euribor άλλαξε</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)} style={{
            display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10,
            border:`1px solid ${tab===t.id?'var(--accent)':'var(--border-subtle)'}`,
            background:tab===t.id?'var(--accent)':'var(--bg-elevated)',
            color:tab===t.id?'var(--bg-base)':'var(--text-secondary)',
            cursor:'pointer', fontSize:12, fontWeight:600, transition:'all 0.2s', whiteSpace:'nowrap' as const,
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ═══ CALCULATOR ═══ */}
      {tab==='calculator'&&(
        <TabLoanCalculator
          propertyId={propertyId} userId={userId}
          market={{
            euribor_3m: market.euribor_3m,
            euribor_1m: market.euribor_1m,
            ecb_rate:   market.ecb_rate,
            updated_at: market.updated_at,
          }}
          onSaveLoan={handleSaveLoan}
          onSaveToCalendar={handleSaveCal}
          onSaveToExpenses={handleSaveExp}
          onStateChange={setCalcState}
        />
      )}

      {/* ═══ BANKS ═══ */}
      {tab==='banks'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Filters */}
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            {[
              {l:'Πράσινα Δάνεια',i:<Leaf size={11}/>,a:filterGreen,t:()=>setFG(f=>!f)},
              {l:'Σπίτι μου ΙΙ',i:'🏠',a:filterSpiti,t:()=>setFS(f=>!f)},
            ].map(f=>(
              <button key={f.l} onClick={f.t} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', background:f.a?'rgba(52,211,153,0.08)':'var(--bg-elevated)', border:`1px solid ${f.a?'rgba(52,211,153,0.3)':'var(--border-subtle)'}`, borderRadius:9, cursor:'pointer', color:f.a?'var(--positive)':'var(--text-secondary)', fontSize:12, fontWeight:600 }}>
                {f.i}{f.l}
              </button>
            ))}
            <p style={{ fontSize:10, color:'var(--text-tertiary)', marginLeft:'auto' }}>
              {banksLoading ? 'Φόρτωση...' : `vresdaneio.gr · ${banksUpdStr}`}
              {liveBanks.length > 0 && <span style={{ color:'var(--positive)', marginLeft:6 }}>✓ Live DB</span>}
            </p>
          </div>

          {/* Rate comparison table */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16, overflowX:'auto' }}>
            {dot('Σύγκριση Επιτοκίων — Ιούνιος 2026')}
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                  {['Τράπεζα','3 χρόνια','5 χρόνια','10 χρόνια','15 χρόνια','20 χρόνια','Κυμαινόμενο spread','Max LTV','Σπίτι ΙΙ'].map(h=>(
                    <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).map((bank:any)=>(
                  <tr key={bank.id||bank.bank_id} style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                    <td style={{ padding:'9px 10px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:2, background:bank.color, flexShrink:0 }}/>
                        <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{bank.bank_name||bank.name}</span>
                      </div>
                    </td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--info)', fontWeight:600 }}>{bank.fixed_3yr||bank.fixed3||'—'}%</td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--info)', fontWeight:600 }}>{bank.fixed_5yr||bank.fixed5||'—'}%</td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--info)', fontWeight:600 }}>{bank.fixed_10yr||bank.fixed10||'—'}%</td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--info)', fontWeight:600 }}>{bank.fixed_15yr||bank.fixed15||'—'}%</td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--info)', fontWeight:600 }}>{bank.fixed_20yr||bank.fixed20||'—'}%</td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--positive)' }}>+{bank.variable_spread_min}–{bank.variable_spread_max}%</td>
                    <td style={{ padding:'9px 10px', fontFamily:'JetBrains Mono, monospace', fontSize:12, color:bank.max_ltv>=90?'var(--positive)':'var(--accent)', fontWeight:600 }}>{bank.max_ltv}%</td>
                    <td style={{ padding:'9px 10px' }}>{bank.spiti_mou?<Check size={14} color="var(--positive)"/>:<X size={14} color="var(--border-default)"/>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:12, lineHeight:1.6 }}>
              ⓘ Ενδεικτικά επιτόκια βάσει δημόσιων ιστοσελίδων τραπεζών ({updStr}). Η τελική τιμολόγηση εξαρτάται από το προφίλ δανειολήπτη, το ακίνητο και την τράπεζα. →{' '}
              <a href="https://e-stegastiko.gr" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>e-stegastiko.gr</a> για εξατομικευμένη σύγκριση.
            </p>
          </div>

          {/* Bank cards */}
          {BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).map((bank:any)=>{
            const effMin = filterGreen?bank.fixed_min-bank.green_discount:bank.fixed_min
            const fixed5Display = bank.fixed_5yr || bank.fixed5 || '—'
            const myM    = calcMonthly(calcState.loanAmount||150000, effMin, calcState.years||25)
            return(
              <div key={bank.id||bank.bank_id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:`3px solid ${bank.color}`, borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                      <p style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{bank.bank_name||bank.name}</p>
                      <span style={{ fontSize:10, padding:'2px 9px', borderRadius:6, background:`${bank.color}18`, color:bank.color, fontWeight:700, border:`1px solid ${bank.color}30` }}>{bank.note}</span>
                      {bank.spiti_mou&&<span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'rgba(52,211,153,0.1)', color:'var(--positive)', fontWeight:700, border:'1px solid rgba(52,211,153,0.2)' }}>🏠 Σπίτι ΙΙ</span>}
                    </div>
                    <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
                      {[
                        {l:'Σταθερό 5 ετών',v:`${fixed5Display}%`,c:'var(--positive)',sz:22},
                        {l:'Κυμαινόμενο από',v:`+${bank.variable_spread_min}%`,c:'var(--info)',sz:22,sub:`= ${fmtPct(market.euribor_3m+bank.variable_spread_min)} σήμερα`},
                        {l:`Δόση ${Math.round((calcState.loanAmount||150000)/1000)}κ/${calcState.years||25}χρ`,v:fmtEur(myM),c:'var(--accent)',sz:22},
                        {l:'Max LTV / Ποσό',v:`${bank.max_ltv}% / ${Math.round(bank.max_amount/1000)}κ€`,c:'var(--text-primary)',sz:14},
                      ].map(item=>(
                        <div key={item.l}>
                          <p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3, fontWeight:600 }}>{item.l}</p>
                          <p style={{ fontSize:item.sz, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700, lineHeight:1 }}>{item.v}</p>
                          {(item as any).sub&&<p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:2 }}>{(item as any).sub}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0, marginLeft:16 }}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:8, color:'var(--text-secondary)', fontSize:11, textDecoration:'none', fontWeight:600 }}><ExternalLink size={10}/>Επίσκεψη</a>}
                    <button onClick={()=>setTab('calculator')} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8, color:'var(--accent)', fontSize:11, cursor:'pointer', fontWeight:700 }}><Calculator size={10}/>Υπολόγισε</button>
                  </div>
                </div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:8 }}>
                  {(bank.features||[]).map((f:string,i:number)=>(
                    <span key={i} style={{ fontSize:11, padding:'4px 10px', borderRadius:7, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--positive)', display:'inline-block', flexShrink:0 }}/>
                      {f}
                    </span>
                  ))}
                  {filterGreen&&bank.green_discount>0&&(
                    <span style={{ fontSize:11, padding:'4px 10px', borderRadius:7, background:'rgba(52,211,153,0.07)', border:'1px solid rgba(52,211,153,0.2)', color:'var(--positive)', display:'flex', alignItems:'center', gap:5 }}>
                      <Leaf size={10}/>Έκπτωση πράσινου δανείου -{fmtPct(bank.green_discount)}
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                  {(bank.programs||[]).map((p:string)=><span key={p} style={{ fontSize:10, padding:'2px 9px', borderRadius:5, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)' }}>{p}</span>)}
                  <span style={{ fontSize:10, color:'var(--text-tertiary)', marginLeft:4 }}>{bank.fees}</span>
                </div>
              </div>
            )
          })}

          <div style={{ padding:'10px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
            <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.6 }}>
              ⓘ Τα επιτόκια ενδέχεται να έχουν αλλάξει. Πάντα επαληθεύετε από τις ιστοσελίδες των τραπεζών ή επικοινωνήστε απευθείας. Για σύγκριση όλων των τραπεζών →{' '}
              <a href="https://vresdaneio.gr/epitokia/index.html" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>vresdaneio.gr</a>
            </p>
          </div>
        </div>
      )}

      {/* ═══ PROGRAMS ═══ */}
      {tab==='programs'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:10, padding:'10px 16px' }}>
            <p style={{ fontSize:11, color:'var(--accent)', lineHeight:1.6 }}>
              {livePrograms.length > 0
                ? <>✓ Ζωντανά δεδομένα από Supabase — τα ληγμένα προγράμματα αφαιρούνται αυτόματα. Πηγές: </>
                : <>Στατικά δεδομένα (DB φόρτωση...). Πηγές: </>
              }
              <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>greece20.gov.gr</a>,{' '}
              <a href="https://ypen.gov.gr/exoikonomo-anakoinosi-parataseon/" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>ypen.gov.gr</a>,{' '}
              <a href="https://exoikonomo2025.gov.gr/" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>exoikonomo2025.gov.gr</a>{' '}
              — {updStr}
            </p>
          </div>

          {activePrograms.map((prog:any)=>(
            <div key={prog.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:`3px solid ${prog.color}`, borderRadius:12, padding:18 }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:22 }}>{prog.icon}</span>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <p style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>{prog.name}</p>
                        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:prog.status==='active'?'rgba(52,211,153,0.1)':'rgba(96,165,250,0.1)', color:prog.status==='active'?'var(--positive)':'var(--info)', fontWeight:700 }}>{prog.status==='active'?'Ενεργό':'Επερχόμενο'}</span>
                        {prog.deadline_urgent&&<span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'rgba(248,113,113,0.1)', color:'var(--negative)', fontWeight:700 }}>⏰ Λήγει σύντομα</span>}
                      </div>
                      <p style={{ fontSize:10, color:prog.color, marginTop:2, fontWeight:600 }}>{prog.type}</p>
                    </div>
                  </div>
                  <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6 }}>{prog.desc}</p>
                </div>
                <a href={prog.url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 13px', background:`${prog.color}10`, border:`1px solid ${prog.color}30`, borderRadius:9, color:prog.color, fontSize:11, textDecoration:'none', fontWeight:700, flexShrink:0, marginLeft:14 }}>
                  <ExternalLink size={11}/>Επίσκεψη
                </a>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:12 }}>
                <div>
                  <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Κριτήρια Επιλεξιμότητας</p>
                  {(prog.criteria||[]).map((c:string,i:number)=>(
                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:prog.color, flexShrink:0, marginTop:5 }}/>
                      <span style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.4 }}>{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Βασικά Στοιχεία</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {[
                      prog.max_amount&&['Μέγιστο ποσό',fmtEur(prog.max_amount),prog.color,14],
                      prog.max_ltv&&['Μέγιστο LTV',`${prog.max_ltv}%`,'var(--info)',14],
                      (prog as any).max_sqm&&['Μέγιστα τ.μ.',`${(prog as any).max_sqm} τ.μ.`,'var(--text-primary)',12],
                      (prog as any).age_max&&['Ηλικία δικαιούχου',`${(prog as any).age_min}–${(prog as any).age_max} ετών`,'var(--text-primary)',12],
                      ['Διάρκεια',prog.duration,'var(--text-primary)',11],
                      ['Προθεσμία',prog.deadline,prog.deadline_urgent?'var(--negative)':'var(--positive)',11],
                      ['Προϋπολογισμός',prog.total_budget,'var(--accent)',11],
                    ].filter(Boolean).map((item:any)=>(
                      <div key={item[0]} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize:10, color:'var(--text-tertiary)', fontWeight:600 }}>{item[0]}</span>
                        <span style={{ fontSize:item[3], fontFamily:'JetBrains Mono, monospace', color:item[2], fontWeight:item[3]>12?700:500 }}>{item[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {(prog as any).how_it_works&&<div style={{ padding:'10px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9, marginBottom:8 }}><p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 }}>⚙ {(prog as any).how_it_works}</p></div>}
              {prog.extra&&<div style={{ padding:'10px 14px', background:`${prog.color}06`, border:`1px solid ${prog.color}20`, borderRadius:9, marginBottom:8 }}><p style={{ fontSize:11, color:prog.color, lineHeight:1.5 }}>⭐ {prog.extra}</p></div>}
              {prog.savings_example&&<div style={{ padding:'10px 14px', background:'rgba(52,211,153,0.04)', border:'1px solid rgba(52,211,153,0.15)', borderRadius:9, marginBottom:10 }}><p style={{ fontSize:11, color:'var(--positive)', lineHeight:1.5 }}>📊 {prog.savings_example}</p></div>}
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {(prog.participating_banks||prog.banks||[]).map((b:string)=><span key={b} style={{ fontSize:11, padding:'3px 9px', borderRadius:5, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)' }}>{b}</span>)}
              </div>
            </div>
          ))}

          {activePrograms.length===0&&(
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-secondary)' }}>
              <p style={{ fontSize:14 }}>Δεν υπάρχουν ενεργά προγράμματα αυτή τη στιγμή.</p>
              <p style={{ fontSize:12, marginTop:6, color:'var(--text-tertiary)' }}>Τα προγράμματα ενημερώνονται αυτόματα βάσει των επίσημων deadlines.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ ADVISOR ═══ */}
      {tab==='advisor'&&(()=>{
        // ── Derived facts from Calculator state ──────────────────────────────
        const cs = calcState
        const ltv = cs.propertyValue>0 ? (cs.loanAmount/cs.propertyValue)*100 : 0
        const totalCost = cs.monthly*cs.years*12
        const interestRatio = cs.loanAmount>0 ? cs.totalInterest/cs.loanAmount : 0
        const varMonthly = calcMonthly(cs.loanAmount, market.euribor_3m+( cs.effectiveRate-market.euribor_3m ), cs.years)
        const stressMonthly2 = calcMonthly(cs.loanAmount, cs.effectiveRate+2, cs.years)
        const spitiRate = Math.max(market.euribor_3m*0.5+0.3,1.0)
        const spitiMonthly = calcMonthly(cs.loanAmount, spitiRate, cs.years)
        const spitiSaving = (cs.monthly-spitiMonthly)*cs.years*12
        const shortMonthly20 = cs.years>20 ? calcMonthly(cs.loanAmount, cs.effectiveRate, 20) : 0
        const savedByShortening = cs.years>20 ? (cs.monthly*cs.years*12)-(shortMonthly20*20*12) : 0
        const extraPay100Saving = (()=>{
          let bal=cs.loanAmount,months=0
          while(bal>0&&months<cs.years*12){bal=bal*(1+cs.effectiveRate/100/12)-(cs.monthly+100);months++}
          return Math.max(0,(cs.years*12-months)/12)
        })()
        const bestBank = BANKS.slice().sort((a:any,b:any)=>a.fixed_min-b.fixed_min)[0] as any
        const bestBankMonthly = bestBank ? calcMonthly(cs.loanAmount, bestBank.fixed_min, cs.years) : cs.monthly
        const savingVsBestBank = (cs.monthly-bestBankMonthly)*cs.years*12

        // ── Score card: how healthy is this loan? ─────────────────────────────
        let score = 100
        const issues: string[] = []
        if(ltv>85){score-=20;issues.push('LTV')}
        if(cs.effectiveRate>4){score-=15;issues.push('Επιτόκιο')}
        if(cs.rateType==='variable'){score-=10;issues.push('Κυμαινόμενο')}
        if(cs.years>25){score-=10;issues.push('Διάρκεια')}
        if(interestRatio>0.6){score-=15;issues.push('Τόκοι')}
        const scoreColor = score>=80?'var(--positive)':score>=60?'var(--warning)':'var(--negative)'
        const scoreLabel = score>=80?'Υγιές δάνειο':score>=60?'Αποδεκτό — υπάρχει περιθώριο βελτίωσης':'Προσοχή — αξίζει επανεξέταση'

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Header with sync badge */}
            <div style={{ padding:'12px 16px', background:'rgba(167,139,250,0.07)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <p style={{ fontSize:13, color:'#a78bfa', fontWeight:700 }}>Προσωπικός Σύμβουλος</p>
                <p style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>
                  Ανάλυση βάσει <strong>{fmtEur(cs.loanAmount)}</strong> / <strong>{cs.years} χρ</strong> / <strong>{fmtPct(cs.effectiveRate)}</strong> {cs.rateType==='variable'?'κυμαινόμενο':'σταθερό'} — {LOAN_TYPES[cs.loanType]?.label||''}
                </p>
              </div>
              <div style={{ textAlign:'right' as const }}>
                <p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3 }}>Βαθμολογία δανείου</p>
                <p style={{ fontSize:22, fontFamily:'JetBrains Mono, monospace', color:scoreColor, fontWeight:700 }}>{score}/100</p>
                <p style={{ fontSize:10, color:scoreColor }}>{scoreLabel}</p>
              </div>
            </div>

            {/* Inputs — editable */}
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
              {dot('Στοιχεία Ανάλυσης', <span style={{ fontSize:10, color:'var(--positive)' }}>⚡ Συγχρονισμένο από Calculator</span>)}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                <CustomSelect label="Σκοπός Δανείου" value={advType} onChange={v=>setAdvType(v as LoanType)} options={LOAN_TYPE_OPTIONS}/>
                <CustomSelect label="Τύπος Δανειολήπτη" value={advBorr} onChange={v=>setAdvBorr(v as BorrowerType)} options={BORROWER_OPTIONS}/>
                <div>
                  <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:5, fontWeight:600 }}>Ποσό Δανείου (€)</p>
                  <input type="number" value={advAmt} onChange={e=>setAdvAmt(e.target.value)} style={{ width:'100%', background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:8, padding:'9px 12px', color:'var(--text-primary)', fontSize:13, outline:'none', boxSizing:'border-box' as any, fontFamily:'Inter,sans-serif' }}/>
                </div>
                <div>
                  <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.14em', marginBottom:5, fontWeight:600 }}>Διάρκεια (χρόνια)</p>
                  <input type="number" value={advYrs} onChange={e=>setAdvYrs(e.target.value)} style={{ width:'100%', background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:8, padding:'9px 12px', color:'var(--text-primary)', fontSize:13, outline:'none', boxSizing:'border-box' as any, fontFamily:'Inter,sans-serif' }}/>
                </div>
              </div>
            </div>

            {/* ── Personalized insights ── */}
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
              {dot('Τι Βλέπω στο Σενάριό σας')}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

                {/* LTV insight */}
                <div style={{ display:'flex', gap:12, padding:'12px 14px', background:ltv>85?'rgba(248,113,113,0.05)':ltv>70?'rgba(251,146,60,0.05)':'rgba(52,211,153,0.05)', border:`1px solid ${ltv>85?'rgba(248,113,113,0.2)':ltv>70?'rgba(251,146,60,0.2)':'rgba(52,211,153,0.2)'}`, borderRadius:9 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:ltv>85?'rgba(248,113,113,0.1)':ltv>70?'rgba(251,146,60,0.1)':'rgba(52,211,153,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:18 }}>
                    {ltv>85?'⚠️':ltv>70?'👁':'✅'}
                  </div>
                  <div>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>
                      LTV {ltv.toFixed(1)}% — {ltv>85?'Υψηλό — απαιτείται προσοχή':ltv>70?'Μέτριο — αποδεκτό':'Καλό — εντός ασφαλών ορίων'}
                    </p>
                    <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                      {ltv>85
                        ? `Χρηματοδοτείτε το ${ltv.toFixed(0)}% της αξίας — οι τράπεζες είναι επιφυλακτικές άνω του 80%. Αν αυξήσετε την προκαταβολή κατά ${fmtEur(cs.propertyValue*0.85-cs.loanAmount > 0 ? cs.propertyValue*0.15-(cs.propertyValue-cs.loanAmount) : 0)}, το LTV πέφτει στο 85% και βελτιώνετε τους όρους.`
                        : ltv>70
                        ? `Ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)} (${(100-ltv).toFixed(0)}% της αξίας). Εντός αποδεκτών ορίων — δεν απαιτούνται πρόσθετες εξασφαλίσεις.`
                        : `Άριστη αναλογία — ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)} (${(100-ltv).toFixed(0)}%). Αυτό ενισχύει τη διαπραγματευτική σας θέση με την τράπεζα.`
                      }
                    </p>
                  </div>
                </div>

                {/* Interest rate insight */}
                <div style={{ display:'flex', gap:12, padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:'rgba(96,165,250,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:18 }}>📈</div>
                  <div>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>
                      Επιτόκιο {fmtPct(cs.effectiveRate)} — {cs.rateType==='variable'?'Κυμαινόμενο':'Σταθερό'}
                      {cs.rateType==='variable'&&<span style={{ fontSize:10, color:'var(--warning)', marginLeft:6, fontWeight:400 }}>⚠ Εκτεθειμένο σε Euribor</span>}
                    </p>
                    <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                      {cs.rateType==='variable'
                        ? `Το τρέχον Euribor είναι ${fmtPct(market.euribor_3m)}. Αν ανέβει +2% (όπως το 2022-23), η μηνιαία σας δόση γίνεται ${fmtEur(stressMonthly2)} — αύξηση ${fmtEur(stressMonthly2-cs.monthly)}/μήνα ή ${fmtEur((stressMonthly2-cs.monthly)*12)}/χρόνο. Αξιολογήστε αν αντέχετε αυτή την επιβάρυνση.`
                        : bestBank&&savingVsBestBank>0
                        ? `Σταθερό επιτόκιο — ασφάλεια έναντι ανόδου Euribor. Το καλύτερο σταθερό στην αγορά σήμερα είναι ${fmtPct(bestBank.fixed_min)} (${bestBank.bank_name||bestBank.name}), που σημαίνει δόση ${fmtEur(bestBankMonthly)}/μήνα και δυνητική εξοικονόμηση ${fmtEur(savingVsBestBank)} συνολικά.`
                        : `Σταθερό επιτόκιο ${fmtPct(cs.effectiveRate)} — προστατευμένοι από διακυμάνσεις. Το τρέχον Euribor 3M είναι ${fmtPct(market.euribor_3m)}.`
                      }
                    </p>
                  </div>
                </div>

                {/* Total cost insight */}
                <div style={{ display:'flex', gap:12, padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:'rgba(248,113,113,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:18 }}>💰</div>
                  <div>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>
                      Συνολικοί τόκοι {fmtEur(cs.totalInterest)} — {(interestRatio*100).toFixed(0)}% επί κεφαλαίου
                    </p>
                    <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                      Για δάνειο {fmtEur(cs.loanAmount)} θα αποπληρώσετε συνολικά {fmtEur(totalCost)}.
                      {cs.years>20 && savedByShortening>0
                        ? ` Μειώνοντας σε 20 χρόνια (δόση ${fmtEur(shortMonthly20)}/μήνα, +${fmtEur(shortMonthly20-cs.monthly)}), εξοικονομείτε ${fmtEur(savedByShortening)} τόκους.`
                        : ` Με έκτακτη πληρωμή 100€/μήνα μειώνετε τη διάρκεια κατά ~${extraPay100Saving.toFixed(1)} χρόνια.`
                      }
                    </p>
                  </div>
                </div>

                {/* Spiti mou II if applicable */}
                {(advType==='first_home'||(advBorr==='young'||advBorr==='family'))&&spitiSaving>5000&&(
                  <div style={{ display:'flex', gap:12, padding:'12px 14px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:9 }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:'rgba(52,211,153,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:18 }}>🏠</div>
                    <div>
                      <p style={{ fontSize:12, fontWeight:700, color:'var(--positive)', marginBottom:3 }}>
                        Σπίτι μου ΙΙ: εξοικονομείτε {fmtEur(spitiSaving)} — deadline 31/08/2026
                      </p>
                      <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                        Με το πρόγραμμα Σπίτι μου ΙΙ, η δόση σας γίνεται {fmtEur(spitiMonthly)}/μήνα αντί {fmtEur(cs.monthly)} — διαφορά {fmtEur(cs.monthly-spitiMonthly)}/μήνα. Αξίζει να ελέγξετε επιλεξιμότητα στο gov.gr άμεσα.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Eligibility */}
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
              {dot('Επιλεξιμότητα Κρατικών Προγραμμάτων')}
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {[
                  {
                    l:'Σπίτι μου ΙΙ — Deadline 31/08/2026',
                    el:(advBorr==='young'||advBorr==='family')&&advType==='first_home',
                    reason:(advBorr==='young'||advBorr==='family')&&advType==='first_home'
                      ?`Πληροίτε τα κριτήρια. Δόση από ${fmtEur(spitiMonthly)}/μήνα — εξοικονόμηση ${fmtEur(spitiSaving)}`
                      :advType!=='first_home'?'Αλλάξτε σκοπό σε "Πρώτη κατοικία" ώστε να ελεγχθεί η επιλεξιμότητά σας'
                      :'Απαιτείται ηλικία 25-50 — ελέγξτε το προφίλ δανειολήπτη',
                    badge:`-${fmtEur(cs.monthly-spitiMonthly)}/μήνα`
                  },
                  {
                    l:'Αναβαθμίζω — Deadline 31/08/2026',
                    el:advType==='energy',
                    reason:advType==='energy'?`Κατάλληλο. Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο`:'Επιλέξτε "Ενεργειακή αναβάθμιση" ως σκοπό',
                    badge:'Επιδοτούμενο επιτόκιο ΤΑΑ'
                  },
                  {
                    l:'Πράσινο Δάνειο (-0.15% έως -0.25%)',
                    el:advType==='energy'||advType==='renovation',
                    reason:advType==='energy'||advType==='renovation'?`Εξοικονόμηση ~${fmtEur(cs.loanAmount*0.002*cs.years)} τόκων με την πράσινη έκπτωση`:'Για ενεργειακή αναβάθμιση ή ανακαίνιση',
                    badge:`~${fmtEur(cs.loanAmount*0.002*cs.years)}`
                  },
                  {
                    l:'Ένοπλες Δυνάμεις — ΤΑΠ-ΟΙΚ',
                    el:advBorr==='military',
                    reason:advBorr==='military'?'Δικαιούστε επιδοτούμενο δάνειο μέσω ΤΑΠ — επικοινωνήστε με το Ταμείο':'Μόνο για εν ενεργεία μέλη Ενόπλων Δυνάμεων & Σωμάτων Ασφαλείας',
                    badge:'Χαμηλότερο επιτόκιο'
                  },
                  {
                    l:'Γέφυρα 3 — Επιδότηση δόσης',
                    el:cs.rateType==='variable',
                    reason:cs.rateType==='variable'?`Το κυμαινόμενο επιτόκιό σας ${fmtPct(cs.effectiveRate)} σας κάνει επιλέξιμο εφόσον πληροίτε τα εισοδηματικά κριτήρια ευάλωτου δανειολήπτη`:'Εφαρμόζεται μόνο σε κυμαινόμενα δάνεια',
                    badge:'50% αύξησης δόσης'
                  },
                ].map(item=>(
                  <div key={item.l} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:item.el?'rgba(52,211,153,0.04)':'var(--bg-surface)', border:`1px solid ${item.el?'rgba(52,211,153,0.15)':'var(--border-subtle)'}`, borderRadius:9 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:item.el?'rgba(52,211,153,0.15)':'rgba(248,113,113,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {item.el?<Check size={12} color="var(--positive)"/>:<X size={12} color="var(--negative)"/>}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:12, color:item.el?'var(--text-primary)':'var(--text-secondary)', fontWeight:item.el?600:400 }}>{item.l}</p>
                      <p style={{ fontSize:11, color:'var(--text-tertiary)', marginTop:2 }}>{item.reason}</p>
                    </div>
                    {item.el&&<span style={{ fontSize:10, fontFamily:'JetBrains Mono, monospace', color:'var(--positive)', background:'rgba(52,211,153,0.08)', padding:'4px 10px', borderRadius:6, border:'1px solid rgba(52,211,153,0.18)', whiteSpace:'nowrap' as const, fontWeight:600 }}>{item.badge}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Bank ranking — with personalized delta */}
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
              {dot(`Καλύτερες Τράπεζες για ${fmtEur(cs.loanAmount)} / ${cs.years} χρόνια`)}
              {BANKS.slice().sort((a:any,b:any)=>a.fixed_min-b.fixed_min).slice(0,4).map((bank:any,i:number)=>{
                const m=calcMonthly(cs.loanAmount,bank.fixed_min,cs.years)
                const ti=m*cs.years*12-cs.loanAmount
                const savedVsCurrent=cs.totalInterest-ti
                const medals=['🥇','🥈','🥉','4️⃣']
                return(
                  <div key={bank.id||bank.bank_id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', marginBottom:7, background:i===0?'var(--accent-dim)':'var(--bg-surface)', border:`1px solid ${i===0?'var(--border-accent)':'var(--border-subtle)'}`, borderRadius:9 }}>
                    <span style={{ fontSize:20, flexShrink:0 }}>{medals[i]}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{bank.bank_name||bank.name}</p>
                      <p style={{ fontSize:11, color:'var(--text-secondary)' }}>
                        {bank.note} · {fmtPct(bank.fixed_min)} σταθερό
                        {bank.spiti_mou&&<span style={{ color:'var(--positive)', marginLeft:6 }}>· Σπίτι ΙΙ ✓</span>}
                      </p>
                    </div>
                    <div style={{ textAlign:'right' as const }}>
                      <p style={{ fontSize:15, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700 }}>{fmtEur(m)}/μήνα</p>
                      {i===0
                        ?<p style={{ fontSize:10, color:'var(--positive)', fontFamily:'JetBrains Mono, monospace' }}>Καλύτερο στην αγορά</p>
                        :<p style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:'JetBrains Mono, monospace' }}>Σύν. τόκοι: {fmtEur(ti)}</p>
                      }
                    </div>
                    <button onClick={()=>setTab('calculator')} style={{ padding:'7px 13px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8, cursor:'pointer', color:'var(--accent)', fontSize:11, fontWeight:700 }}>Επιλογή</button>
                  </div>
                )
              })}
            </div>

            {/* Score breakdown & action plan */}
            {issues.length>0&&(
              <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
                {dot('Τι Μπορείτε να Βελτιώσετε')}
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {issues.includes('LTV')&&(
                    <div style={{ display:'flex', gap:10, padding:'10px 14px', background:'rgba(248,113,113,0.04)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:8 }}>
                      <span style={{ color:'var(--negative)', fontWeight:700, flexShrink:0 }}>↑</span>
                      <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                        <strong>Αυξήστε την προκαταβολή:</strong> Αν φέρετε {fmtEur(cs.propertyValue*0.2-(cs.propertyValue-cs.loanAmount))} επιπλέον ίδια κεφάλαια, το LTV πέφτει στο 80% — καλύτερο επιτόκιο και αποδοχή.
                      </p>
                    </div>
                  )}
                  {issues.includes('Επιτόκιο')&&(
                    <div style={{ display:'flex', gap:10, padding:'10px 14px', background:'rgba(251,146,60,0.04)', border:'1px solid rgba(251,146,60,0.15)', borderRadius:8 }}>
                      <span style={{ color:'var(--warning)', fontWeight:700, flexShrink:0 }}>↓</span>
                      <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                        <strong>Διαπραγματευτείτε το spread:</strong> Ζητήστε γραπτές προσφορές από τουλάχιστον 3 τράπεζες — η ανταγωνιστική πίεση συχνά οδηγεί σε μειώσεις 0.10-0.25%.
                      </p>
                    </div>
                  )}
                  {issues.includes('Κυμαινόμενο')&&(
                    <div style={{ display:'flex', gap:10, padding:'10px 14px', background:'rgba(251,146,60,0.04)', border:'1px solid rgba(251,146,60,0.15)', borderRadius:8 }}>
                      <span style={{ color:'var(--warning)', fontWeight:700, flexShrink:0 }}>⚠</span>
                      <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                        <strong>Σκεφτείτε σταθερό:</strong> Κυμαινόμενο +2% Euribor = δόση {fmtEur(stressMonthly2)} (+{fmtEur(stressMonthly2-cs.monthly)}/μήνα). Σταθερό 5ετίας προστατεύει και κοστίζει σήμερα μόλις {fmtPct(Math.max(0,(bestBank?.fixed5||3.5)-cs.effectiveRate))} επιπλέον.
                      </p>
                    </div>
                  )}
                  {issues.includes('Διάρκεια')&&cs.years>20&&(
                    <div style={{ display:'flex', gap:10, padding:'10px 14px', background:'rgba(96,165,250,0.04)', border:'1px solid rgba(96,165,250,0.15)', borderRadius:8 }}>
                      <span style={{ color:'var(--info)', fontWeight:700, flexShrink:0 }}>⏱</span>
                      <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>
                        <strong>Μειώστε τη διάρκεια:</strong> Στα 20 χρόνια η δόση γίνεται {fmtEur(shortMonthly20)} (+{fmtEur(shortMonthly20-cs.monthly)}/μήνα) αλλά εξοικονομείτε {fmtEur(savedByShortening)} τόκους. Εναλλακτικά, έκτακτη πληρωμή 200€/μήνα μειώνει τη διάρκεια κατά ~{(extraPay100Saving*2).toFixed(0)} χρόνια.
                      </p>
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
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Real process with honest difficulty notes */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
            {dot('Πώς Λειτουργεί Ένα Στεγαστικό Δάνειο στην Ελλάδα — Πλήρης Οδηγός')}
            {[
              {
                step:1, title:'Προεπιλογή & Προετοιμασία', time:'1-2 εβδομάδες',
                color:'var(--accent)',
                desc:'Ελέγξτε πρώτα την επιλεξιμότητά σας στο gov.gr με τα Taxisnet credentials. Για Σπίτι μου ΙΙ η προεπιλογή είναι αυτόματη και δεν απαιτεί επίσκεψη σε τράπεζα.',
                tip:'💡 Κάντε πρώτα τον έλεγχο επιλεξιμότητας στο gov.gr — αν αποτύχει, μάθετε νωρίς γιατί και τι μπορείτε να διορθώσετε.',
                warning:'⚠ Συνηθισμένο πρόβλημα: Χρέη σε ΔΟΥ, ΕΦΚΑ ή εκτελεστοί τίτλοι μπλοκάρουν άμεσα την αίτηση. Τακτοποιήστε τα πρώτα.',
                url: null,
              },
              {
                step:2, title:'Συλλογή Εγγράφων', time:'1-3 εβδομάδες',
                color:'var(--info)',
                desc:'Εκκαθαριστικά σημειώματα αποδοχών 3 τελευταίων μηνών, εκκαθαριστικά εφορίας 2 ετών, Ε9, πιστοποιητικό οικογενειακής κατάστασης, ΑΜΚΑ, ΑΦΜ. Για ελεύθερους επαγγελματίες: φορολογικές δηλώσεις 2 ετών και βεβαίωση έναρξης επιτηδεύματος.',
                tip:'💡 Ζητήστε ΚΑΘΕ έγγραφο που μπορεί να χρειαστεί από την αρχή. Η τράπεζα συχνά ζητάει επιπλέον στοιχεία εκ των υστέρων, καθυστερώντας τη διαδικασία κατά εβδομάδες.',
                warning:'⚠ Τα Ε1/Ε9 αντλούνται από ΑΑΔΕ — βεβαιωθείτε ότι είναι ενημερωμένα. Αδήλωτα ακίνητα στο Ε9 μπορεί να σας αποκλείσουν από την απαλλαγή ΦΜΑ.',
                url: null,
              },
              {
                step:3, title:'Αίτηση στην Τράπεζα', time:'1 ημέρα',
                color:'var(--positive)',
                desc:'Προχωρήστε στην υποβολή αίτησης με τη συνεργαζόμενη τράπεζα της επιλογής σας. Για το πρόγραμμα Σπίτι μου ΙΙ δύναται να επιλέξετε μόνο ΜΙΑ τράπεζα — δεν μπορείτε να κάνετε ταυτόχρονες αιτήσεις σε περισσότερες. Επιλέξτε προσεκτικά βάσει επιτοκίου και ποιότητας εξυπηρέτησης.',
                tip:'💡 Ζητήστε γραπτή προσφορά (ESIS) από τουλάχιστον 2-3 τράπεζες πριν δεσμευτείτε. Σύμφωνα με το νόμο, η τράπεζα οφείλει να σας δώσει 7 εργάσιμες ημέρες για να αποφασίσετε.',
                warning:'⚠ Μην υπογράφετε τίποτα την πρώτη μέρα. Μελετήστε προσεκτικά το ESIS (Ευρωπαϊκό Τυποποιημένο Δελτίο Πληροφοριών) πριν από οποιαδήποτε δέσμευση.',
                url: 'https://www.bankofgreece.gr/el/to-nea/anakoinoseis/2016/pliroforiso-tous-katagites-gia-stegastika',
              },
              {
                step:4, title:'Εκτίμηση Ακινήτου & Νομικός Έλεγχος', time:'1-3 εβδομάδες',
                color:'var(--warning)',
                desc:'Η τράπεζα αναθέτει σε πιστοποιημένο εκτιμητή (RICS ή ΤΕΕ) την αξιολόγηση του ακινήτου. Ταυτόχρονα, ο νομικός σύμβουλος της τράπεζας ελέγχει τους τίτλους στο Κτηματολόγιο ή στο Υποθηκοφυλακείο.',
                tip:'💡 Αν η εκτίμηση προκύψει χαμηλότερη από την τιμή αγοράς, το LTV υπολογίζεται επί της εκτιμηθείσας αξίας — ενδέχεται να χρειαστείτε περισσότερα ίδια κεφάλαια.',
                warning:'⚠ Πολύ συνηθισμένο πρόβλημα: Αυθαίρετα τμήματα (κλεισμένες βεράντες, αλλαγές χωρίς άδεια) μπλοκάρουν τη μεταβίβαση ή μειώνουν δραστικά την εκτίμηση. Ζητήστε τεχνικό έλεγχο πριν προχωρήσετε.',
                url: 'https://www.ktimatologio.gr',
              },
              {
                step:5, title:'Έγκριση Δανείου', time:'3-10 εργάσιμες',
                color:'var(--positive)',
                desc:'Η τράπεζα αξιολογεί εισόδημα, πιστωτικό ιστορικό (Τειρεσίας), εκτίμηση και νομικά στοιχεία. Η απόφαση χορήγησης είναι γραπτή και ισχύει συνήθως 90 ημέρες. Για το πρόγραμμα Σπίτι μου ΙΙ η έγκριση από την ΕΑΤ λαμβάνεται παράλληλα.',
                tip:'💡 Σε περίπτωση απόρριψης, ζητήστε γραπτώς τον λόγο. Μπορείτε να επανέλθετε μετά από 6 μήνες ή να υποβάλετε αίτηση σε άλλη τράπεζα.',
                warning:'⚠ Τειρεσίας: Ακόμα και μία ακάλυπτη επιταγή ή δόση με καθυστέρηση άνω των 90 ημερών μπορεί να επηρεάσει αρνητικά. Τυχόν οφειλές πρέπει να τακτοποιηθούν νωρίτερα.',
                url: 'https://www.tiresias.gr',
              },
              {
                step:6, title:'Συμβόλαιο & Εκταμίευση', time:'1-2 εβδομάδες',
                color:'var(--accent)',
                desc:'Υπογραφή αγοραπωλητηρίου συμβολαίου ενώπιον συμβολαιογράφου, με παρουσία αγοραστή, πωλητή, εκπροσώπου τράπεζας και δικηγόρου. Σε δεύτερο χρόνο πραγματοποιείται συνήθως η καταχώρηση στο Κτηματολόγιο και η εκταμίευση του δανείου.',
                tip:'💡 Για νεόδμητα: βεβαιωθείτε ότι έχει εκδοθεί Πιστοποιητικό Ενεργειακής Απόδοσης (ΠΕΑ) — είναι υποχρεωτικό για τη μεταβίβαση.',
                warning:'⚠ Έχετε μαζί σας ΟΛΕΣ τις φορολογικές και ασφαλιστικές ενημερότητες — λήγουν γρήγορα (15-30 ημέρες) και η υπογραφή μπορεί να ματαιωθεί.',
                url: null,
              },
            ].map((step,i,arr)=>(
              <div key={i} style={{ display:'flex', gap:16, alignItems:'flex-start', paddingBottom:20, borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none', marginBottom:i<arr.length-1?20:0 }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--accent-dim)', border:`2px solid ${step.color}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:13, fontFamily:'JetBrains Mono, monospace', color:step.color, fontWeight:700 }}>{step.step}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{step.title}</p>
                    <span style={{ fontSize:9, color:'var(--text-secondary)', background:'var(--bg-surface)', padding:'2px 8px', borderRadius:5, border:'1px solid var(--border-subtle)', fontWeight:600 }}>{step.time}</span>
                  </div>
                  <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.7, marginBottom:8 }}>{step.desc}</p>
                  <div style={{ padding:'8px 12px', background:'rgba(52,211,153,0.05)', border:'1px solid rgba(52,211,153,0.15)', borderRadius:7, marginBottom:6 }}>
                    <p style={{ fontSize:11, color:'var(--positive)', lineHeight:1.5 }}>{step.tip}</p>
                  </div>
                  <div style={{ padding:'8px 12px', background:'rgba(251,146,60,0.05)', border:'1px solid rgba(251,146,60,0.15)', borderRadius:7 }}>
                    <p style={{ fontSize:11, color:'var(--warning)', lineHeight:1.5 }}>{step.warning}</p>
                  </div>
                  {step.url&&<a href={step.url} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:8, fontSize:11, color:'var(--info)', textDecoration:'none', fontWeight:600 }}><ExternalLink size={10}/>Επίσημη πηγή</a>}
                </div>
              </div>
            ))}
          </div>

          {/* Common rejection reasons */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
            {dot('Γιατί Απορρίπτεται Μια Αίτηση — Τι να Ελέγξετε Πρώτα')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { icon:'📋', title:'Εγγραφή στον Τειρεσία', desc:'Ακόμα και μία ακάλυπτη επιταγή ή δόση με καθυστέρηση άνω των 90 ημερών αρκεί. Τυχόν οφειλές πρέπει να τακτοποιηθούν νωρίτερα — ελέγξτε πριν από οποιαδήποτε αίτηση.', url:'https://www.tiresias.gr' },
                { icon:'💰', title:'Χαμηλό εισόδημα / Υψηλό DTI', desc:'Η δόση δεν πρέπει να υπερβαίνει το 35-40% του καθαρού εισοδήματος. Επαγγελματικά με χαμηλές δηλώσεις είναι ο κύριος λόγος απόρριψης.', url:null },
                { icon:'🏠', title:'Αυθαίρετα στο ακίνητο', desc:'Τροποποιήσεις χωρίς άδεια (κλεισμένη βεράντα, πατάρι, αλλαγή χρήσης) μπλοκάρουν τη μεταβίβαση ή μειώνουν την εκτίμηση.', url:'https://www.ktimatologio.gr' },
                { icon:'📑', title:'Προβλήματα τίτλων', desc:'Ακαθόριστοι τίτλοι, αδήλωτα ακίνητα σε Ε9, εκκρεμείς διαδικασίες κληρονομιάς. Ο νομικός έλεγχος διαρκεί εβδομάδες.', url:null },
                { icon:'🏦', title:'Χρέη σε ΔΟΥ / ΕΦΚΑ', desc:'Απαιτείται φορολογική και ασφαλιστική ενημερότητα για υπογραφή συμβολαίου. Χρέη πρέπει να τακτοποιηθούν πριν.', url:'https://www.aade.gr' },
                { icon:'📉', title:'LTV > 80-90%', desc:'Οι τράπεζες χορηγούν συνήθως έως 80% για κανονικό δάνειο ή 90% για Σπίτι μου ΙΙ. Χρειάζεστε ίδια κεφάλαια για τη διαφορά + έξοδα.', url:null },
              ].map(item=>(
                <div key={item.title} style={{ padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:18 }}>{item.icon}</span>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{item.title}</p>
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:item.url?8:0 }}>{item.desc}</p>
                  {item.url&&<a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--info)', textDecoration:'none', fontWeight:600, display:'inline-flex', alignItems:'center', gap:4 }}><ExternalLink size={9}/>Ελέγξτε εδώ</a>}
                </div>
              ))}
            </div>
          </div>

          {/* Special categories */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
            {dot('Ειδικές Κατηγορίες Δανειοληπτών')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                {title:'Ένοπλες Δυνάμεις',icon:'🎖️',desc:'ΤΑΠ-ΟΙΚ: επιδοτούμενα στεγαστικά δάνεια με χαμηλότερο επιτόκιο για εν ενεργεία μέλη των Ενόπλων Δυνάμεων και των Σωμάτων Ασφαλείας. Ισχύουν ειδικά κριτήρια βαθμού και υπηρεσίας.',url:'https://www.tap.gr'},
                {title:'Κάτοικοι Εξωτερικού',icon:'✈️',desc:'Max LTV 55-70%. Απαιτούνται επίσημες μεταφράσεις, αποδεικτικό κατοικίας εξωτερικού, εισοδήματα από ξένη χώρα. Ισχύουν ΣΑΔΦ.',url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia'},
                {title:'Νέοι 25-50 ετών',icon:'⭐',desc:'Σπίτι μου ΙΙ: 50% άτοκο κεφάλαιο, deadline 31/08/2026. Εισόδημα €25.000-€40.000 (νέα όρια 2026). Πρώτη κατοικία έως 150τμ.',url:'https://greece20.gov.gr/en/home-loans/'},
                {title:'Ελεύθεροι Επαγγελματίες',icon:'💼',desc:'Ο μέσος όρος εισοδήματος 2 ετών υπολογίζεται αντί του τελευταίου. Max LTV 65-70%. Απαιτείται συνέπεια στις φορολογικές δηλώσεις.',url:'https://www.aade.gr'},
                {title:'Πολύτεκνοι & Τρίτεκνοι',icon:'👨‍👩‍👧‍👦',desc:'+50% επιδότηση επιτοκίου Σπίτι μου ΙΙ. Εισόδημα έως €45.000 (2 παιδιά) ή €50.000 (3+ παιδιά). Αυξημένα όρια ΦΜΑ.',url:'https://greece20.gov.gr/en/home-loans/'},
                {title:'Εταιρείες & Επαγγελματικά',icon:'🏢',desc:'Ισολογισμοί 3 ετών + Απόφαση ΔΣ + εγγύηση φυσικού προσώπου. LTV 60-70%. Πλήρης έκπτωση τόκων από φορολογικά αποτελέσματα.',url:'https://www.nbg.gr/el/epixeiriseis'},
              ].map(cat=>(
                <div key={cat.title} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                    <span style={{ fontSize:18 }}>{cat.icon}</span>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{cat.title}</p>
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:8 }}>{cat.desc}</p>
                  <a href={cat.url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'var(--info)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4, fontWeight:600 }}>
                    <ExternalLink size={10}/>Περισσότερα
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Euribor history */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
            {dot('Ιστορικό Euribor 3M — 2020 έως Σήμερα', <a href="https://data.ecb.europa.eu" target="_blank" rel="noreferrer" style={{ fontSize:9, color:'var(--info)', textDecoration:'none', fontWeight:600 }}>Πηγή: ECB</a>)}
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={EURIBOR_HISTORY.map(d=>({date:d.date,Euribor:d.val}))} barCategoryGap="8%">
                <XAxis dataKey="date" tick={{ fontSize:8, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} interval={3}/>
                <YAxis tick={{ fontSize:9, fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} width={36}/>
                <Tooltip content={({active,payload,label}:any)=>{
                  if(!active||!payload?.length)return null
                  return <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:8, padding:'9px 12px', fontSize:11, fontFamily:'JetBrains Mono, monospace' }}><p style={{ color:'var(--text-secondary)', marginBottom:4 }}>{label}</p><p style={{ color:'var(--accent)', fontWeight:700 }}>{payload[0].value}%</p></div>
                }}/>
                <ReferenceLine y={0} stroke="var(--border-subtle)" strokeWidth={1}/>
                <Bar dataKey="Euribor" radius={[3,3,0,0]} fill="var(--info)" opacity={0.75}/>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', gap:24, marginTop:12, flexWrap:'wrap' }}>
              {[
                {l:'Ιστορικό χαμηλό',v:'-0.55% (2021)',c:'var(--info)'},
                {l:'Ιστορικό υψηλό',v:'4.0% (Οκτ 2023)',c:'var(--negative)'},
                {l:'Τρέχον',v:fmtPct(market.euribor_3m),c:'var(--positive)'},
                {l:'Μείωση από peak',v:`-${fmtPct(4.0-market.euribor_3m)}`,c:'var(--positive)'},
              ].map(item=>(
                <div key={item.l}>
                  <p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3, fontWeight:600 }}>{item.l}</p>
                  <p style={{ fontSize:14, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700 }}>{item.v}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(96,165,250,0.05)', border:'1px solid rgba(96,165,250,0.15)', borderRadius:8 }}>
              <p style={{ fontSize:11, color:'var(--info)', lineHeight:1.6 }}>
                Κυμαινόμενα δάνεια εκταμιευμένα το 2021 (Euribor -0.55%) έχουν σήμερα πραγματικό επιτόκιο <strong>{fmtPct(market.euribor_3m+1.5)}</strong> περίπου. Η ΕΚΤ μείωσε το επιτόκιο 8 φορές από τον Ιούνιο 2024 — οι αναλυτές αναμένουν περαιτέρω μειώσεις εντός 2026.
              </p>
            </div>
          </div>

          {/* Glossary */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden' }}>
            <button onClick={()=>setShowGloss(g=>!g)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' as const }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:showGloss?'var(--accent)':'var(--border-default)', display:'inline-block', transition:'background 0.2s' }}/>
                <p style={{ fontSize:11, color:showGloss?'var(--accent)':'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>Γλωσσάρι Βασικών Όρων</p>
              </div>
              {showGloss?<ChevronUp size={14} color="var(--text-secondary)"/>:<ChevronDown size={14} color="var(--text-secondary)"/>}
            </button>
            {showGloss&&(
              <div style={{ padding:'0 16px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {GLOSSARY.map((item,i)=>(
                  <div key={i} style={{ padding:'11px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9 }}>
                    <p style={{ fontSize:12, color:'var(--accent)', fontWeight:700, marginBottom:4, fontFamily:'JetBrains Mono, monospace' }}>{item.term}</p>
                    <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.6 }}>{item.def}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Links — elegant, categorized */}
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
            {dot('Επίσημες Πηγές')}
            {[
              {
                category:'Κρατικά Προγράμματα',
                links:[
                  {label:'Σπίτι μου ΙΙ — Επίσημη σελίδα', sub:'Αίτηση, κριτήρια, deadline 31/08/2026', url:'https://greece20.gov.gr/en/home-loans/'},
                  {label:'Αναβαθμίζω το Σπίτι μου', sub:'HDB — επίσημη πλατφόρμα αιτήσεων', url:'https://hdb.gr/anavathmizo-to-spiti-mou/'},
                  {label:'Εξοικονομώ 2025', sub:'Επιδότηση ενεργειακής αναβάθμισης', url:'https://exoikonomo2025.gov.gr/'},
                  {label:'Ανακαινίζω & Νοικιάζω — ΟΠΕΚΑ', sub:'40% επιδότηση + εγγυημένο ενοίκιο', url:'https://www.opeka.gr'},
                  {label:'Γέφυρα 3 — Επιδότηση δόσης', sub:'Για κυμαινόμενα δάνεια, ευάλωτοι', url:'https://gefyra3.gr'},
                ],
              },
              {
                category:'Φορολογικά & Κτηματολόγιο',
                links:[
                  {label:'ΑΑΔΕ — Φορολογικά ακινήτων', sub:'ΦΜΑ, ΕΝΦΙΑ, εισοδήματα από ενοίκια', url:'https://www.aade.gr/polites/foroi-akiniton'},
                  {label:'Κτηματολόγιο — Έλεγχος τίτλων', sub:'Ηλεκτρονικός έλεγχος εγγράφων', url:'https://www.ktimatologio.gr'},
                  {label:'Επιλεξιμότητα Σπίτι μου ΙΙ — gov.gr', sub:'Ηλεκτρονικός έλεγχος με Taxisnet', url:'https://www.gov.gr/ipiresies/periousia-kai-phorologia/akinhta/elegkhos-epile3imotetas-programmatos-spiti-mou-ii'},
                ],
              },
              {
                category:'Τράπεζες & Επιτόκια',
                links:[
                  {label:'Τράπεζα Ελλάδος — Επιτόκια', sub:'Επίσημα μέσα επιτόκια αγοράς', url:'https://www.bankofgreece.gr/el/statistiki/nomismatiki-kai-trapeziki-statistiki/epitokia-katatheseon-kai-daneion'},
                  {label:'vresdaneio.gr — Σύγκριση επιτοκίων', sub:'Σύγκριση επιτοκίων όλων των τραπεζών', url:'https://vresdaneio.gr/epitokia/index.html'},
                  {label:'e-stegastiko.gr — Πλατφόρμα ΤτΕ', sub:'Επίσημη πλατφόρμα στεγαστικών δανείων', url:'https://e-stegastiko.gr'},
                  {label:'Τειρεσίας — Έλεγχος πιστοληπτικής', sub:'Ελέγξτε αν έχετε εγγραφές πριν αιτηθείτε', url:'https://www.tiresias.gr'},
                ],
              },
              {
                category:'Χρήσιμα Εργαλεία',
                links:[
                  {label:'HDB — Ελληνική Αναπτυξιακή Τράπεζα', sub:'Διαχείριση κρατικών προγραμμάτων δανείων', url:'https://hdb.gr'},
                  {label:'ΥΠΕΝ — Ενεργειακά προγράμματα', sub:'Παρατάσεις, νέα, ανακοινώσεις ΥΠΕΝ', url:'https://ypen.gov.gr'},
                  {label:'ΤΑΠ — Ταμείο Αλληλοβοηθείας Πολεμιστών', sub:'Στεγαστικά για στελέχη Ένοπλων Δυνάμεων', url:'https://www.tap.gr'},
                  {label:'Ευρωπαϊκή Κεντρική Τράπεζα — Euribor', sub:'Επίσημα ιστορικά δεδομένα Euribor', url:'https://data.ecb.europa.eu/data/datasets/FM/FM.B.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA'},
                ],
              },
            ].map(group=>(
              <div key={group.category} style={{ marginBottom:16 }}>
                <p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.12em', fontWeight:600, marginBottom:8 }}>{group.category}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {group.links.map(link=>(
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8, textDecoration:'none', transition:'background 0.15s' }}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='var(--bg-surface)')}
                    >
                      <div>
                        <p style={{ fontSize:12, color:'var(--text-primary)', fontWeight:500 }}>{link.label}</p>
                        <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:2 }}>{link.sub}</p>
                      </div>
                      <ExternalLink size={11} color="var(--text-tertiary)" style={{ flexShrink:0, marginLeft:12 }}/>
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginTop:4, padding:'10px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
              <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.6 }}>
                ⚠ <strong style={{ color:'var(--text-secondary)' }}>Disclaimer:</strong> Ενημερωτικές πληροφορίες — δεν αποτελούν χρηματοοικονομική, νομική ή φορολογική συμβουλή. Πάντα επαληθεύετε από επίσημες πηγές.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SAVED ═══ */}
      {tab==='saved'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {saved.length===0&&(
            <div style={{ textAlign:'center', padding:'60px 0' }}>
              <Save size={32} color="var(--border-default)" style={{ margin:'0 auto 14px', display:'block' }}/>
              <p style={{ fontSize:14, color:'var(--text-secondary)', fontWeight:600 }}>Δεν υπάρχουν αποθηκευμένα δάνεια</p>
              <p style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:6 }}>Χρησιμοποιήστε τον Calculator για να υπολογίσετε και να αποθηκεύσετε δάνεια.</p>
              <button onClick={()=>setTab('calculator')} style={{ marginTop:14, padding:'9px 18px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:9, color:'var(--accent)', fontSize:12, fontWeight:700, cursor:'pointer' }}>→ Πηγαίνετε στον Calculator</button>
            </div>
          )}
          {saved.map(loan=>{
            const m=calcMonthly(loan.amount,loan.rate,loan.years)
            const ti=m*loan.years*12-loan.amount
            const ltv=loan.property_value>0?(loan.amount/loan.property_value)*100:0
            const elapsed=loan.start_date?Math.floor((Date.now()-new Date(loan.start_date).getTime())/(1000*60*60*24*30.44)):0
            const rem=Math.max(0,loan.years*12-elapsed)
            const bal=Math.max(0,calcMonthly(loan.amount,loan.rate,loan.years)*rem*(1-loan.rate/100/12*(rem/2)))
            return(
              <div key={loan.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                      <p style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>{loan.bank}</p>
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'rgba(52,211,153,0.1)', color:'var(--positive)', fontWeight:700 }}>{loan.status==='active'?'Ενεργό':'Ανενεργό'}</span>
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)' }}>{LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type}</span>
                    </div>
                    {loan.notes&&<p style={{ fontSize:12, color:'var(--text-secondary)' }}>{loan.notes}</p>}
                  </div>
                  <button onClick={()=>deleteLoan(loan.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--border-default)', padding:4, display:'flex', borderRadius:5 }}><X size={15}/></button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:12 }}>
                  <KPI label="Ποσό Δανείου" value={fmtEur(loan.amount)} color="var(--accent)"/>
                  <KPI label="Επιτόκιο" value={fmtPct(loan.rate)} color="var(--info)" sub={loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό'}/>
                  <KPI label="Δόση/μήνα" value={fmtEur(m)} color="var(--positive)"/>
                  <KPI label="Σύν. Τόκοι" value={fmtEur(ti)} color="var(--negative)"/>
                  <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?'var(--warning)':'var(--positive)'}/>
                </div>
                {loan.start_date&&(
                  <div style={{ padding:'10px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9, display:'flex', gap:24, flexWrap:'wrap' }}>
                    <div><p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', marginBottom:2 }}>Έναρξη</p><p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>{loan.start_date}</p></div>
                    <div><p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', marginBottom:2 }}>Αποπληρωμένοι μήνες</p><p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>~{elapsed}</p></div>
                    <div><p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', marginBottom:2 }}>Υπόλοιποι μήνες</p><p style={{ fontSize:12, color:'var(--text-secondary)', fontWeight:600 }}>~{rem}</p></div>
                    <div><p style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', marginBottom:2 }}>Εκτ. Υπόλοιπο Κεφαλαίου</p><p style={{ fontSize:14, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700 }}>~{fmtEur(bal)}</p></div>
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