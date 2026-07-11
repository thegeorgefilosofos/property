'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/Theme'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, CheckCircle2, AlertTriangle } from 'lucide-react'
import {
  buildLedger, profitAndLoss, cashflowByYear, reconcile, reconSummary,
  type LedgerInput, type Expected, type Actual, type ReconStatus,
} from '@/lib/accounting/ledger'

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιούν','Ιούλ','Αύγ','Σεπ','Οκτ','Νοέ','Δεκ']
const eur = (n:number)=>n.toLocaleString('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0})
const eur2 = (n:number)=>n.toLocaleString('el-GR',{style:'currency',currency:'EUR'})
function athensYear(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Athens'})).getFullYear() }
function todayAthens(){ const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Athens'})); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const STATUS_META:Record<ReconStatus,{label:string;color:string}> = {
  paid:     { label:'Πληρώθηκε', color:'var(--positive)' },
  partial:  { label:'Μερικώς',   color:'var(--warning)' },
  unpaid:   { label:'Εκκρεμεί',  color:'var(--text-secondary)' },
  overdue:  { label:'Εκπρόθεσμο', color:'var(--negative)' },
}

export default function TabAccounting({ propertyId, userId }: { propertyId:string; userId:string }) {
  const supabase = createClient()
  const [loading,setLoading] = useState(true)
  const [year,setYear] = useState(athensYear())
  const [expenses,setExpenses] = useState<any[]>([])
  const [rent,setRent] = useState<any[]>([])
  const [stays,setStays] = useState<any[]>([])

  useEffect(()=>{ (async()=>{
    setLoading(true)
    const [ex, rp, st] = await Promise.all([
      supabase.from('expenses').select('date,amount,category,description').eq('property_id',propertyId),
      supabase.from('rent_payments').select('period_year,period_month,amount,paid,paid_date,due_date').eq('property_id',propertyId),
      supabase.from('client_stays').select('id,check_in,total,channel').eq('property_id',propertyId),
    ])
    setExpenses(ex.data||[]); setRent(rp.data||[]); setStays(st.data||[]); setLoading(false)
  })() },[propertyId])

  // Ενιαίο καθολικό: έσοδα (ενοίκιο εισπραγμένο + βραχυχρόνια) + έξοδα (δαπάνες).
  const entries = useMemo<LedgerInput[]>(()=>{
    const out:LedgerInput[]=[]
    for(const p of rent){ if(p.paid&&(p.amount||0)>0){ out.push({ date:p.paid_date||p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01`, type:'income', category:'Ενοίκιο', description:`Ενοίκιο ${MONTHS_GR[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount, source:'rent' }) } }
    for(const s of stays){ if((s.total||0)>0&&s.check_in){ out.push({ date:s.check_in, type:'income', category:'Βραχυχρόνια', description:`Κράτηση ${s.channel||''}`.trim(), amount:s.total, source:'stay' }) } }
    for(const e of expenses){ if((e.amount||0)>0&&e.date){ out.push({ date:e.date, type:'expense', category:e.category||'Δαπάνες', description:e.description||'Δαπάνη', amount:e.amount, source:'expense' }) } }
    return out
  },[rent,stays,expenses])

  const yearEntries = useMemo(()=>entries.filter(e=>e.date.slice(0,4)===String(year)),[entries,year])
  const pnl = useMemo(()=>profitAndLoss(yearEntries),[yearEntries])
  const cash = useMemo(()=>cashflowByYear(entries,year),[entries,year])
  const ledger = useMemo(()=>buildLedger(yearEntries).slice(-12).reverse(),[yearEntries])

  // Συμφωνία ενοικίων (expected vs actual) για το έτος.
  const recon = useMemo(()=>{
    const yr = rent.filter(p=>p.period_year===year)
    const expected:Expected[] = yr.map(p=>({ id:`${p.period_year}-${p.period_month}`, date:p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01`, amount:p.amount||0, label:`${MONTHS_GR[(p.period_month||1)-1]} ${p.period_year}` }))
    const actual:Actual[] = yr.filter(p=>p.paid).map(p=>({ refId:`${p.period_year}-${p.period_month}`, date:p.paid_date, amount:p.amount||0, paid:true }))
    return reconcile(expected, actual, todayAthens())
  },[rent,year])
  const rs = useMemo(()=>reconSummary(recon),[recon])

  const maxCash = Math.max(1, ...cash.map(c=>Math.max(c.income,c.expense)))
  const card:React.CSSProperties = { position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius:16, padding:'16px 18px', boxShadow:'0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 34px -20px rgba(0,0,0,0.55)' }

  if(loading) return <div style={{ padding:40 }}><Spinner label="Φόρτωση λογιστικής…" /></div>

  const kpis = [
    { label:'Έσοδα', value:eur(pnl.income), color:'var(--positive)', icon:<TrendingUp size={15}/> },
    { label:'Έξοδα', value:eur(pnl.expense), color:'var(--negative)', icon:<TrendingDown size={15}/> },
    { label:'Καθαρό αποτέλεσμα', value:eur(pnl.net), color:pnl.net>=0?'var(--accent)':'var(--negative)', icon:<Wallet size={15}/> },
    { label:'Ανείσπρακτα ενοίκια', value:eur(rs.outstanding), color:rs.outstanding>0?'var(--warning)':'var(--positive)', icon:<AlertTriangle size={15}/> },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header + year nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0 }}>Λογιστική εικόνα</h2>
          <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'4px 0 0', fontFamily:"'Inter',sans-serif" }}>Έσοδα, έξοδα, ταμειακές ροές και συμφωνία ενοικίων — από τα πραγματικά δεδομένα του ακινήτου.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button onClick={()=>setYear(y=>y-1)} aria-label="Προηγούμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronLeft size={17}/></button>
          <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", minWidth:64, textAlign:'center', fontVariantNumeric:'tabular-nums' }}>{year}</span>
          <button onClick={()=>setYear(y=>y+1)} aria-label="Επόμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronRight size={17}/></button>
        </div>
      </div>

      {/* KPIs (3D) */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap:12 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px -12px rgba(0,0,0,0.5)', overflow:'hidden' }}>
            <span style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background:k.color, opacity:0.55 }}/>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:9, background:`color-mix(in srgb, ${k.color} 14%, transparent)`, color:k.color }}>{k.icon}</span>
              <p style={{ fontSize:12, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.4px', textTransform:'uppercase', margin:0 }}>{k.label}</p>
            </div>
            <p style={{ fontSize:20, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', color:k.color, fontWeight:600, margin:0 }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Cashflow by month */}
      <div style={card}>
        <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', margin:'0 0 14px', fontFamily:"'Inter',sans-serif" }}>Ταμειακές ροές {year}</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:8, alignItems:'end', minHeight:130 }}>
          {cash.map((c,i)=>(
            <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:100 }}>
                <div title={`Έσοδα: ${eur(c.income)}`} style={{ width:9, height:`${Math.round(c.income/maxCash*100)}%`, minHeight:c.income>0?3:0, background:'var(--positive)', borderRadius:'3px 3px 0 0', opacity:0.85 }}/>
                <div title={`Έξοδα: ${eur(c.expense)}`} style={{ width:9, height:`${Math.round(c.expense/maxCash*100)}%`, minHeight:c.expense>0?3:0, background:'var(--negative)', borderRadius:'3px 3px 0 0', opacity:0.75 }}/>
              </div>
              <span style={{ fontSize:9.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{MONTHS_GR[i].slice(0,1)}</span>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:16, marginTop:12, paddingTop:10, borderTop:'1px solid var(--border-subtle)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}><span style={{ width:9, height:9, borderRadius:2, background:'var(--positive)' }}/>Έσοδα</span>
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}><span style={{ width:9, height:9, borderRadius:2, background:'var(--negative)' }}/>Έξοδα</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16 }}>
        {/* Reconciliation */}
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', margin:0, fontFamily:"'Inter',sans-serif" }}>Συμφωνία ενοικίων</p>
            <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>Εισπράχθηκαν <strong style={{ color:'var(--positive)' }}>{eur(rs.collectedTotal)}</strong> / {eur(rs.expectedTotal)}</span>
          </div>
          {recon.length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'12px 0' }}>Δεν υπάρχουν καταχωρημένα ενοίκια για το {year}. Καταχώρησέ τα στην καρτέλα «Ενοικιαστής».</p>
          ):(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {recon.map((r,i)=>{ const m=STATUS_META[r.status]; return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:m.color, flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>{r.expected.label}</span>
                  <span style={{ fontSize:12.5, color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur2(r.paidAmount)} / {eur2(r.expected.amount)}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:m.color, background:`color-mix(in srgb, ${m.color} 13%, transparent)`, borderRadius:20, padding:'2px 9px', fontFamily:"'Inter',sans-serif", minWidth:78, textAlign:'center' }}>{m.label}</span>
                </div>
              )})}
            </div>
          )}
        </div>

        {/* P&L by category */}
        <div style={card}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px', fontFamily:"'Inter',sans-serif" }}>Ανά κατηγορία</p>
          {Object.keys(pnl.byCategory).length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'12px 0' }}>Καμία κίνηση για το {year}.</p>
          ):(
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {Object.entries(pnl.byCategory).sort((a,b)=>Math.abs(b[1].net)-Math.abs(a[1].net)).map(([cat,v])=>(
                <div key={cat} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat}</span>
                  {v.income>0&&<span style={{ fontSize:12.5, color:'var(--positive)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>+{eur(v.income)}</span>}
                  {v.expense>0&&<span style={{ fontSize:12.5, color:'var(--negative)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>−{eur(v.expense)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent ledger */}
      <div style={card}>
        <p style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px', fontFamily:"'Inter',sans-serif" }}>Πρόσφατες κινήσεις</p>
        {ledger.length===0?(
          <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'8px 0' }}>Καμία κίνηση για το {year}.</p>
        ):(
          <div style={{ display:'flex', flexDirection:'column' }}>
            {ledger.map((e,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<ledger.length-1?'1px solid var(--border-subtle)':'none' }}>
                <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', width:74, flexShrink:0 }}>{e.date.split('-').reverse().join('/')}</span>
                <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description}</span>
                <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{e.category}</span>
                <span style={{ fontSize:13, fontWeight:600, color:e.type==='income'?'var(--positive)':'var(--negative)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif", width:96, textAlign:'right' }}>{e.type==='income'?'+':'−'}{eur2(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
