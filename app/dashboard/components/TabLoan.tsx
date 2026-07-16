'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExportButton } from '@/components/Theme'
import { downloadCsv, csvEur, csvDec, csvDate } from './exportCsv'
import TabLoanCalculator from './TabLoanCalculator'
import { useMarketRates, useBankRates, useLoanPrograms, useIsAdmin } from '../../hooks/useMarketData'
import {
  BANKS_NORM, STATE_PROGRAMS as PROGRAMS_STATIC, BANKS_VERIFIED, RATES_DISCLAIMER,
  LOAN_TYPES, GLOSSARY, EURIBOR_HISTORY, SERVICERS_GUIDE,
  calcMonthly, fmtEur, fmtPct,
  LoanType, RateType, BorrowerType, SavedLoan, MARKET_FALLBACK
} from './TabLoanData'
import { rankLoans, spitiMouEligibility, type UserLoanNeeds } from '@/lib/loans/recommend'
import { euriborInsight } from '@/lib/loans/affordability'
import LoanDocScan, { type AppliedLoan } from './LoanDocScan'
import Glossary from './Glossary'
import SpitiMouPanel from './SpitiMouPanel'
import ApprovalPanel from './ApprovalPanel'
import EsisScanPanel from './EsisScanPanel'
import BankRatesAdmin from './BankRatesAdmin'
import { InfoDot } from './UIComponents'
import { KPI, LensBar, labelStyle, cardStyle } from './LoanShared'

// Μορφοποίηση επιτοκίων ως κείμενο: κόμμα δεκαδικό και σωστή παύλα εύρους (–),
// π.χ. «2.40-4.70» → «2,40–4,70». Καθαρά ελληνικά, χωρίς πρόχειρες παύλες.
const fmtRateStr = (v:unknown):string => String(v ?? '').trim().replace(/\./g,',').replace(/\s*-\s*/g,'–')
// Πρώτος αριθμός (επιτόκιο «από») ενός εύρους ή μονής τιμής → number.
const rateNum = (v:unknown):number|null => { const m = String(v ?? '').match(/-?\d+[.,]?\d*/); return m ? parseFloat(m[0].replace(',','.')) : null }
// Δύο δεκαδικά με κόμμα, τυποποιημένα: 3.4 → «3,40», 2 → «2,00».
const fmtRate2 = (n:number):string => n.toFixed(2).replace('.',',')
// Κελί πίνακα/κάρτας: πάντα ενιαία μορφή «X,XX%» (επιτόκιο εκκίνησης).
const cellRate = (v:unknown):string => { const n = rateNum(v); return n===null ? '—' : `${fmtRate2(n)}%` }

// Επικεφαλίδα ενεργού φακού — ο τίτλος τον οποίο το LensBar έχει επιλέξει.
function LensPanel({title,subtitle,right,children}:{title:string;subtitle?:string;right?:React.ReactNode;children:React.ReactNode}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'2px 2px 0'}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",letterSpacing:'-0.01em'}}>{title}</p>
          {subtitle&&<p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// Πτυσσόμενη υπο-ενότητα — premium, διακριτική· ο τίτλος και προαιρετικά
// badges/meta μένουν ορατά, οι λεπτομέρειες ανοίγουν με κλικ (όχι ατέρμονες λίστες).
function MiniSection({title,badges,meta,defaultOpen,order,flat,children}:{title:string;badges?:React.ReactNode;meta?:React.ReactNode;defaultOpen?:boolean;order?:number;flat?:boolean;children:React.ReactNode}) {
  const [open,setOpen] = useState(!!defaultOpen)
  // flat: χωρίς περίγραμμα/φόντο — για ένθετες ενότητες, ώστε να μη διπλασιάζεται το πλαίσιο.
  return (
    <div style={flat
      ? {order,borderTop:'1px solid var(--border-subtle)'}
      : {order,background:'var(--bg-elevated)',border:`1px solid ${open?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:16,overflow:'hidden',transition:'border-color 0.2s'}}>
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:flat?'13px 2px':'15px 18px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flexWrap:'wrap'}}>
          <span style={{fontSize:flat?13:14.5,fontWeight:600,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",letterSpacing:'-0.01em'}}>{title}</span>
          {badges}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          {meta}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      {open&&<div style={{padding:flat?'0 2px 6px':'0 18px 18px'}}>{children}</div>}
    </div>
  )
}

// Ατομικά πτυσσόμενη σειρά — κλειστή δείχνει μόνο τον τίτλο με βέλος δεξιά·
// με κλικ αποκαλύπτεται η περιγραφή και ο σύνδεσμος. Ήσυχη, ομοιόμορφη,
// χωρίς γαλάζια διακόσμηση (το βέλος περιστρέφεται 180° στο άνοιγμα).
function CatRow({title,desc,url,linkLabel,last}:{title:string;desc:string;url?:string|null;linkLabel:string;last?:boolean}) {
  const [open,setOpen] = useState(false)
  return (
    <div style={{borderBottom:last?'none':'1px solid var(--border-subtle)'}}>
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 2px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <span style={{fontSize:13,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',minWidth:0}}>{title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{flexShrink:0,transform:open?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open&&(
        <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif",padding:'0 2px 12px'}}>{desc}{url&&<> <InlineLink href={url}>{linkLabel}</InlineLink></>}</p>
      )}
    </div>
  )
}

// Διακριτικός σύνδεσμος μέσα σε κείμενο: ουδέτερος, αποκτά χρώμα μόνο στο πέρασμα
// του κέρσορα/δαχτύλου. Καθαρό, premium, χωρίς μόνιμο γαλάζιο.
function InlineLink({href,children}:{href:string;children:React.ReactNode}) {
  const [h,setH] = useState(false)
  return (
    <a href={href} target="_blank" rel="noreferrer"
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onFocus={()=>setH(true)} onBlur={()=>setH(false)}
      style={{color:h?'var(--accent)':'var(--text-secondary)',textDecoration:'none',fontWeight:500,borderBottom:`1px solid ${h?'var(--border-accent)':'var(--border-default)'}`,transition:'color 0.15s, border-color 0.15s'}}>{children}</a>
  )
}

// Κουμπί-σύνδεσμος επίσημης πηγής: ουδέτερο, αποκτά γαλάζιο μόνο στο πέρασμα του
// κέρσορα (ίδια λογική με τα υπόλοιπα· κανένα μόνιμο γαλάζιο).
function SourceLinkPill({href,children}:{href:string;children:React.ReactNode}) {
  const [h,setH] = useState(false)
  return (
    <a href={href} target="_blank" rel="noreferrer"
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onFocus={()=>setH(true)} onBlur={()=>setH(false)}
      style={{display:'inline-flex',alignItems:'center',gap:6,padding:'0 16px',height:36,borderRadius:18,
        background:h?'var(--accent-dim)':'var(--bg-surface)',border:`1px solid ${h?'var(--border-accent)':'var(--border-subtle)'}`,
        color:h?'var(--accent)':'var(--text-secondary)',fontSize:12.5,fontFamily:"'Inter',sans-serif",textDecoration:'none',fontWeight:600,
        transition:'color 0.15s, background 0.15s, border-color 0.15s'}}>{children}</a>
  )
}

// Τυποποιημένη κάρτα-σύνδεσμος για επίσημες πηγές: ενιαία στοίχιση, ήπιο βάθος,
// τίτλος και εικονίδιο αποκτούν χρώμα μόνο στο hover. Καμία «λίστα σούπερ μάρκετ».
function LinkCard({href,label,sub}:{href:string;label:string;sub?:string}) {
  const [h,setH] = useState(false)
  return (
    <a href={href} target="_blank" rel="noreferrer"
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onFocus={()=>setH(true)} onBlur={()=>setH(false)}
      style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'11px 14px',background:'var(--bg-surface)',
        border:`1px solid ${h?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:10,textDecoration:'none',
        transition:'border-color 0.15s, box-shadow 0.15s',boxShadow:h?'0 1px 2px color-mix(in srgb, var(--text-primary) 7%, transparent)':'none'}}>
      <div style={{minWidth:0}}>
        <p style={{fontSize:13,color:h?'var(--accent)':'var(--text-primary)',fontWeight:500,fontFamily:"'Inter',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',transition:'color 0.15s'}}>{label}</p>
        {sub&&<p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</p>}
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={h?'var(--accent)':'var(--text-tertiary)'} strokeWidth="2" style={{flexShrink:0,transition:'stroke 0.15s'}} aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </a>
  )
}

// Bespoke minimal γράφημα Euribor — καθαρή περιοχή/γραμμή, σημεία υψηλού/χαμηλού
// και τρέχοντος, χωρίς βιβλιοθήκη. Επαγγελματικό, ήσυχο, χωρίς θόρυβο.
const EU_MONTHS=['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιούν','Ιούλ','Αύγ','Σεπ','Οκτ','Νοέ','Δεκ']
const euFmtDate=(d:string)=>{ const [y,m]=d.split('-'); return `${EU_MONTHS[(Number(m)||1)-1]} ${y}` }
function EuriborArea({data}:{data:{date:string;val:number}[]}) {
  const [hi,setHi]=useState<number|null>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const W=620,H=160,padL=6,padR=10,padT=18,padB=22
  const n=data.length
  if(n<2) return null
  const vals=data.map(d=>d.val)
  const maxV=Math.max(...vals), minRaw=Math.min(...vals), minV=Math.min(minRaw,0)
  const range=(maxV-minV)||1
  const X=(i:number)=> padL+(i/(n-1))*(W-padL-padR)
  const Y=(v:number)=> padT+(1-(v-minV)/range)*(H-padT-padB)
  const line=data.map((d,i)=>`${i===0?'M':'L'} ${X(i).toFixed(1)} ${Y(d.val).toFixed(1)}`).join(' ')
  const area=`M ${X(0).toFixed(1)} ${Y(minV).toFixed(1)} `+data.map((d,i)=>`L ${X(i).toFixed(1)} ${Y(d.val).toFixed(1)}`).join(' ')+` L ${X(n-1).toFixed(1)} ${Y(minV).toFixed(1)} Z`
  const maxI=vals.indexOf(maxV), minI=vals.indexOf(minRaw)
  const seen=new Set<string>(); const yearTicks:{i:number;yr:string}[]=[]
  data.forEach((d,i)=>{ const yr=d.date.slice(0,4); if(!seen.has(yr)){seen.add(yr); yearTicks.push({i,yr})} })
  const locate=(clientX:number)=>{
    const el=wrapRef.current; if(!el)return
    const r=el.getBoundingClientRect()
    const xv=((clientX-r.left)/r.width)*W
    setHi(Math.max(0,Math.min(n-1,Math.round((xv-padL)/((W-padL-padR)/(n-1))))))
  }
  const leftPct=hi!=null?Math.max(12,Math.min(88,(X(hi)/W)*100)):0
  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',touchAction:'pan-y',cursor:'crosshair'}}
      onMouseMove={e=>locate(e.clientX)} onMouseLeave={()=>setHi(null)}
      onTouchStart={e=>locate(e.touches[0].clientX)} onTouchMove={e=>locate(e.touches[0].clientX)} onTouchEnd={()=>setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block'}} role="img" aria-label="Ιστορική πορεία Euribor τριμήνου, διαδραστικό">
        <defs>
          <linearGradient id="euriborFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {minV<0&&<line x1={padL} y1={Y(0)} x2={W-padR} y2={Y(0)} stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3 3"/>}
        <path d={area} fill="url(#euriborFill)"/>
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {hi==null&&(<>
          <circle cx={X(maxI)} cy={Y(maxV)} r="3" fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth="1.5"/>
          <text x={X(maxI)} y={Y(maxV)-7} textAnchor="middle" style={{fontSize:9.5,fontFamily:"'Inter',sans-serif",fill:'var(--text-secondary)',fontWeight:600}}>{maxV.toFixed(2).replace('.',',')}%</text>
          <circle cx={X(minI)} cy={Y(minRaw)} r="3" fill="var(--text-tertiary)" stroke="var(--bg-elevated)" strokeWidth="1.5"/>
          <text x={X(minI)} y={Y(minRaw)+13} textAnchor="middle" style={{fontSize:9.5,fontFamily:"'Inter',sans-serif",fill:'var(--text-tertiary)'}}>{minRaw.toFixed(2).replace('.',',')}%</text>
        </>)}
        {/* Τρέχον σημείο (ζωντανό) */}
        <circle cx={X(n-1)} cy={Y(vals[n-1])} r="4" fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth="2"/>
        {hi!=null&&(<g>
          <line x1={X(hi)} y1={padT-6} x2={X(hi)} y2={Y(minV)} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.5"/>
          <circle cx={X(hi)} cy={Y(vals[hi])} r="4.5" fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth="2"/>
        </g>)}
        {yearTicks.map(t=>(<text key={t.yr} x={X(t.i)} y={H-6} textAnchor={t.i===0?'start':'middle'} style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:hi!=null&&data[hi].date.slice(0,4)===t.yr?'var(--accent)':'var(--text-tertiary)',fontWeight:hi!=null&&data[hi].date.slice(0,4)===t.yr?700:400}}>{t.yr}</text>))}
      </svg>
      {hi!=null&&(
        <div style={{position:'absolute',top:0,left:`${leftPct}%`,transform:'translateX(-50%)',pointerEvents:'none',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:'7px 12px',boxShadow:'var(--shadow-lg)',whiteSpace:'nowrap' as const,textAlign:'center' as const}}>
          <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:3,fontFamily:"'Inter',sans-serif"}}>{euFmtDate(data[hi].date)}</p>
          <p style={{fontSize:15,color:'var(--accent)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',fontWeight:700,lineHeight:1}}>{vals[hi].toFixed(2).replace('.',',')}%</p>
        </div>
      )}
    </div>
  )
}

interface CalcState {
  loanType:LoanType;borrowerType:BorrowerType;loanAmount:number;years:number
  rateType:RateType;effectiveRate:number;monthly:number;totalInterest:number;propertyValue:number
  sqm?:number;incomeMonthly?:number;marital?:'single'|'married'|'single_parent';children?:number
}

export default function TabLoan({propertyId,userId,propertyValue,propertyRent,propertySqm,propertyYearBuilt,profileType='individual'}:{propertyId:string;userId:string;propertyValue?:number;propertyRent?:number;propertySqm?:number;propertyYearBuilt?:number;profileType?:'individual'|'professional'}) {
  const supabase = createClient()
  // Πραγματικά στοιχεία του ακινήτου του χρήστη (αντί για γενικές προεπιλογές).
  const initValue  = propertyValue && propertyValue > 0 ? Math.round(propertyValue) : 200000
  const initAmount = propertyValue && propertyValue > 0 ? Math.round(propertyValue * 0.8) : 150000
  // Ενοποιημένη ροή: ένας υπολογιστής στην κορυφή + έξυπνες πτυσσόμενες ενότητες.
  // Μία ανοιχτή τη φορά, ώστε να παραμένει καθαρό — όχι «σούπερ μάρκετ» με καρτέλες.
  const [openSec,setOpenSec] = useState<'advisor'|'banks'|'programs'|'guide'>('advisor')
  // Το προφίλ ακολουθεί την καθολική ρύθμιση της εφαρμογής (Ρυθμίσεις → τύπος
  // προφίλ). ΜΙΑ πηγή αλήθειας — χωρίς διπλό διακόπτη μέσα στην καρτέλα.
  const profile: 'individual'|'business' = profileType==='professional' ? 'business' : 'individual'
  // Οι ενότητες του οδηγού εμφανίζονται με τη σειρά που γράφονται (DOM = οπτική
  // σειρά). Δεν χρησιμοποιούμε flex «order» — προκαλούσε ασυμφωνία DOM/διάταξης
  // και το scroll «πηδούσε» προς τα πάνω κατά το άνοιγμα μιας ενότητας.
  const calcRef = useRef<HTMLDivElement>(null)
  const scrollToCalc = ()=>calcRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  // Εφαρμογή επιτοκίου τράπεζας στον Υπολογιστή (μέσω του καναλιού «applied»· η
  // σφραγίδα έκδοσης εξασφαλίζει ότι εφαρμόζεται ακόμη κι αν ξαναπατηθεί η ίδια τιμή).
  // Προσοχή: για ΚΥΜΑΙΝΟΜΕΝΟ, ο Υπολογιστής περιμένει το ΠΕΡΙΘΩΡΙΟ (spread), όχι το
  // πλήρες επιτόκιο (effRate = Euribor + spread). Η σύσταση δίνει το πλήρες επιτόκιο,
  // οπότε αφαιρούμε το Euribor ώστε να μη μετρηθεί δύο φορές (όπως κάνει και το applyScen).
  const applyBank = (rate:number, rt:RateType, bankName?:string)=>{
    const eur = market.euribor_3m || MARKET_FALLBACK.euribor_3m
    const applyRate = rt==='variable' ? Math.max(0, Number((rate - eur).toFixed(2))) : rate
    setAppliedLoan({ v: Date.now(), rate:applyRate, rateType:rt })
    if(bankName) showToast(`Εφαρμόστηκε το επιτόκιο: ${bankName}`)
    scrollToCalc()
  }
  const [saved,setSaved] = useState<SavedLoan[]>([])
  const [filterSpiti,setFS] = useState(false)
  const [selBank,setSelBank] = useState<string|null>(null)
  const [appliedLoan,setAppliedLoan] = useState<AppliedLoan|undefined>(undefined)
  const [recHover,setRecHover] = useState(false)
  const [applyHover,setApplyHover] = useState(false)
  const [scoreHover,setScoreHover] = useState(false)
  const [otherHover,setOtherHover] = useState<string|null>(null)
  const [hoverBank,setHoverBank] = useState<string|null>(null)
  const [uniHover,setUniHover] = useState<number|null>(null)
  const [hoverBankRow,setHoverBankRow] = useState<number|null>(null)
  const [hoverRate,setHoverRate] = useState<number|null>(null)
  const [toast,setToast] = useState<string|null>(null)
  function showToast(msg:string){setToast(msg);setTimeout(()=>setToast(null),2500)}

  const market      = useMarketRates()
  const {banks:liveBanks,loading:banksLoading,verifiedAt} = useBankRates()
  const {programs:livePrograms,loading:programsLoading}   = useLoanPrograms()
  const {isAdmin} = useIsAdmin()

  const BANKS    = liveBanks.length    ? liveBanks    : BANKS_NORM
  const PROGRAMS = livePrograms.length ? livePrograms : PROGRAMS_STATIC

  const [calcState,setCalcState] = useState<CalcState>({
    loanType:'purchase',borrowerType:'individual',loanAmount:initAmount,
    years:25,rateType:'fixed',effectiveRate:3.5,
    monthly:calcMonthly(initAmount,3.5,25),totalInterest:0,propertyValue:initValue,
  })

  useEffect(()=>{loadSaved()},[propertyId])

  async function loadSaved(){const{data}=await supabase.from('loans').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false});setSaved(data||[])}
  async function handleSaveLoan(loan:Partial<SavedLoan>){
    await supabase.from('loans').insert({...loan,property_id:propertyId,user_id:userId})
    await loadSaved()
    // Αυτόματη προσυμπλήρωση των δόσεων στο Ημερολόγιο, ανά ημέρα πληρωμής,
    // εφόσον το δάνειο είναι ενεργό — ώστε να συμψηφίζεται με το υπόλοιπο app.
    const active = (loan.status ?? 'active') === 'active'
    if(active && loan.amount && loan.rate && loan.years){
      const monthly = calcMonthly(loan.amount, loan.rate, loan.years)
      const start = loan.start_date || new Date().toISOString().split('T')[0]
      await handleSaveCal(monthly, loan.years, start, loan.bank || '', loan.amount, true)
      showToast('Το δάνειο αποθηκεύτηκε και οι δόσεις προστέθηκαν στο Ημερολόγιο')
    } else {
      showToast('Το δάνειο αποθηκεύτηκε')
    }
  }
  async function handleSaveCal(monthly:number,years:number,startDate:string,bankName:string,loanAmount?:number,silent=false){
    const d=new Date(startDate),events=[]
    const n=Math.min(years*12,60)
    // Ξεχωριστή, ιδιότυπη πηγή ανά τράπεζα → idempotent (δεν διπλογράφεται στο
    // ξαναπάτημα, ούτε μπερδεύεται με χειροκίνητα γεγονότα). Ρητές δόσεις, όχι
    // recurring, ώστε να μη διπλασιάζονται από την ανάπτυξη επαναλαμβανόμενων.
    const src='loan_schedule:'+(bankName||'γενικό').toLowerCase().replace(/\s+/g,'_').slice(0,40)
    const title=`Δόση δανείου${bankName?`, ${bankName}`:''}`
    // Οι σημειώσεις κρατούν ποιο δάνειο και τι ποσό, για συμψηφισμό/αναγνώριση.
    const note=`Δόση ${fmtEur(monthly)} τον μήνα${loanAmount?` · Δάνειο ${fmtEur(loanAmount)}`:''}${bankName?` · ${bankName}`:''}`
    for(let i=0;i<n;i++){
      const ev=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate())
      events.push({property_id:propertyId,user_id:userId,title,category:'financial',event_date:ev.toISOString().split('T')[0],amount:Math.round(monthly),priority:'high',status:'pending',recurring:false,recurring_interval:null,notes:note,source:src})
    }
    await supabase.from('calendar_events').delete().eq('property_id',propertyId).eq('source',src)
    for(let i=0;i<events.length;i+=20)await supabase.from('calendar_events').insert(events.slice(i,i+20))
    if(!silent) showToast(`${n} δόσεις αποθηκεύτηκαν στο Ημερολόγιο`)
  }
  async function handleSaveExp(monthly:number,bankName:string){
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:`Δόση δανείου${bankName?`, ${bankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:new Date().toISOString().split('T')[0]})
    showToast('Δόση καταχωρήθηκε στις Δαπάνες')
  }
  async function deleteLoan(id:string){if(!confirm('Διαγραφή δανείου;'))return;await supabase.from('loans').delete().eq('id',id);await loadSaved()}

  const updStr = market.isLoading?'…' : new Date(market.updated_at).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})
  const banksUpdStr = new Date(verifiedAt || BANKS_VERIFIED).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})
  // Έντιμη φρεσκάδα: τα ανά-τράπεζα επιτόκια είναι επαληθευμένα δεδομένα με
  // ημερομηνία (όχι αυτόματη ροή). Αν παλιώσουν, το λέμε καθαρά και παραπέμπουμε
  // στην πηγή, αντί να δίνουμε ψευδή εντύπωση «ζωντανών» τιμών.
  const banksAgeDays = Math.floor((Date.now() - new Date(verifiedAt || BANKS_VERIFIED).getTime())/86400000)
  const banksStale = banksAgeDays > 45
  // Μία πηγή αλήθειας: η ανάλυση αντλεί απευθείας τα στοιχεία του Υπολογιστή
  // (χωρίς διπλά πεδία ποσού/διάρκειας/σκοπού).
  const advType = calcState.loanType
  const advBorr = calcState.borrowerType
  const LA = calcState.loanAmount || 150000
  const Y  = calcState.years || 25
  // Ταξινόμηση προγραμμάτων: πρώτα όσα λήγουν σύντομα, μετά κατά ημερομηνία
  // λήξης (πλησιέστερη πρώτη), και τέλος κατά σημαντικότητα (Σπίτι μου ΙΙ ψηλά).
  const progDeadlineTs = (d?:string):number => {
    if(!d) return Number.POSITIVE_INFINITY
    let iso: string|null = null
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)) iso = d
    else { const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/); if(m) iso = `${m[3]}-${m[2]}-${m[1]}` }
    if(!iso) return Number.POSITIVE_INFINITY
    const t = new Date(iso).getTime()
    return isNaN(t) ? Number.POSITIVE_INFINITY : t
  }
  // Μόνο το «Σπίτι μου ΙΙ» θεωρείται κορυφαίας σημασίας — όχι το «Αναβαθμίζω το
  // Σπίτι μου», που περιέχει επίσης τη φράση. Γι' αυτό αγκυρώνουμε στην αρχή.
  const isSpitiMou2 = (name?:string) => /^\s*σπίτι μου/i.test(name||'')
  const progRank = (p:any):number => isSpitiMou2(p.name) ? 0 : p.status==='active' ? 1 : 2
  const activePrograms = [...PROGRAMS].sort((a:any,b:any)=>{
    if(!!a.deadline_urgent !== !!b.deadline_urgent) return a.deadline_urgent ? -1 : 1
    const da=progDeadlineTs(a.deadline), db=progDeadlineTs(b.deadline)
    if(da!==db) return da-db
    return progRank(a)-progRank(b)
  })

  // Περιεχόμενο «Αποθηκευμένα δάνεια» — εμφανίζεται στο τέλος του «Μάθε
  // περισσότερα» (κάτω από τις επίσημες πηγές), όχι ως ξεχωριστός φακός.
  const savedContent = (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{saved.length} δάνεια</span>
        <ExportButton disabled={saved.length===0} onClick={()=>downloadCsv(
          `daneio_${new Date().toISOString().slice(0,10)}`,
          ['Τράπεζα','Τύπος δανείου','Ποσό (€)','Επιτόκιο (%)','Τύπος επιτοκίου','Διάρκεια (έτη)','Δόση τον μήνα (€)','Συνολικοί τόκοι (€)','Δάνειο προς αξία (%)','Έναρξη','Κατάσταση','Σημειώσεις'],
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

      {/* ── Ενιαίο δάνειο: όλα τα δάνεια του δανειολήπτη σε μία εικόνα ── */}
      {saved.length>0&&(()=>{
        const rows = saved.map(l=>{ const m=calcMonthly(l.amount,l.rate,l.years); return { l, m, ti:m*l.years*12-l.amount } })
        const totalAmount = rows.reduce((s,r)=>s+r.l.amount,0)
        const totalMonthly = rows.reduce((s,r)=>s+r.m,0)
        const totalInterest = rows.reduce((s,r)=>s+r.ti,0)
        const blended = totalAmount>0 ? rows.reduce((s,r)=>s+r.l.amount*r.l.rate,0)/totalAmount : 0
        const tiles = [
          { k:'Συνολικό υπόλοιπο', v:fmtEur(totalAmount), accent:false },
          { k:'Συνολική δόση τον μήνα', v:fmtEur(totalMonthly), accent:false },
          { k:'Μέσο σταθμισμένο επιτόκιο', v:fmtPct(blended), accent:false },
          { k:'Συνολικοί τόκοι', v:fmtEur(totalInterest), accent:false },
        ]
        return (
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:16,padding:'16px 18px'}}>
            <p style={{...labelStyle,marginBottom:12}}>Ενιαίο δάνειο, συνολική εικόνα · {rows.length} δάνεια</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:10,marginBottom:16}}>
              {tiles.map((t,i)=>{const on=uniHover===i;return(
                <div key={t.k} onMouseEnter={()=>setUniHover(i)} onMouseLeave={()=>setUniHover(null)} onTouchStart={()=>setUniHover(i)} onTouchEnd={()=>setUniHover(null)} style={{background:'var(--bg-elevated)',border:`1px solid ${on?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:12,padding:'14px 16px',transition:'border-color 0.15s, box-shadow 0.15s',boxShadow:on?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent)':'none'}}>
                  <p style={{fontSize:10,textTransform:'uppercase' as const,letterSpacing:'0.06em',fontWeight:600,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{t.k}</p>
                  <p style={{fontSize:24,fontWeight:700,letterSpacing:'-0.02em',lineHeight:1,marginTop:8,color:t.accent?'var(--accent)':on?'var(--accent)':'var(--text-primary)',fontVariantNumeric:'tabular-nums',fontFamily:"'Inter',sans-serif",transition:'color 0.15s'}}>{t.v}</p>
                </div>
              )})}
            </div>
            {rows.length>1&&(<>
              <p style={{...labelStyle,marginBottom:9}}>Κατανομή μηνιαίας δόσης ανά δάνειο</p>
              <div style={{display:'flex',height:14,borderRadius:7,overflow:'hidden',border:'1px solid var(--border-subtle)',marginBottom:10}}>
                {rows.map((r,i)=>(
                  <div key={r.l.id} title={`${r.l.bank}: ${fmtEur(r.m)} τον μήνα`} style={{width:`${totalMonthly>0?(r.m/totalMonthly)*100:0}%`,height:'100%',background:`color-mix(in srgb, var(--accent) ${Math.max(20,100-i*14)}%, var(--bg-elevated))`}}/>
                ))}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {rows.map((r,i)=>(
                  <div key={r.l.id} style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{width:10,height:10,borderRadius:3,flexShrink:0,background:`color-mix(in srgb, var(--accent) ${Math.max(20,100-i*14)}%, var(--bg-elevated))`}}/>
                    <span style={{fontSize:12.5,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.l.bank||'Δάνειο'}</span>
                    <span style={{fontSize:11.5,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>{fmtPct(r.l.rate)}</span>
                    <span style={{fontSize:12.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',fontWeight:600,minWidth:110,textAlign:'right' as const}}>{fmtEur(r.m)} τον μήνα</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        )
      })()}
      {saved.length===0&&(
        <div style={{textAlign:'center',padding:'40px 0'}}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border-default)" strokeWidth="1.5" style={{margin:'0 auto 14px',display:'block'}}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          <p style={{fontSize:15,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:400}}>Δεν υπάρχουν αποθηκευμένα δάνεια</p>
          <p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:6,fontFamily:"'Inter',sans-serif"}}>Χρησιμοποίησε τον Υπολογιστή Δανείου για να υπολογίσεις και να αποθηκεύσεις δάνεια.</p>
          <button onClick={scrollToCalc} style={{marginTop:14,padding:'0 18px',height:36,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:18,color:'var(--text-secondary)',fontSize:13,fontFamily:"'Inter',sans-serif",fontWeight:500,cursor:'pointer'}}>Άνοιξε τον Υπολογιστή Δανείου</button>
        </div>
      )}
      {saved.map(loan=>{
        const m=calcMonthly(loan.amount,loan.rate,loan.years)
        const ti=m*loan.years*12-loan.amount
        const ltv=loan.property_value>0?(loan.amount/loan.property_value)*100:0
        const elapsed=loan.start_date?Math.floor((Date.now()-new Date(loan.start_date).getTime())/(1000*60*60*24*30.44)):0
        const rem=Math.max(0,loan.years*12-elapsed)
        return(
          <div key={loan.id} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:16,padding:16}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                  <p style={{fontSize:16,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{loan.bank}</p>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{loan.status==='active'?'Ενεργό':'Ανενεργό'}</span>
                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type}</span>
                </div>
                {loan.notes&&<p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{loan.notes}</p>}
              </div>
              <button onClick={()=>deleteLoan(loan.id)} aria-label="Διαγραφή δανείου" title="Διαγραφή" style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:8,margin:-4,display:'flex',borderRadius:8}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))',gap:8,marginBottom:12}}>
              <KPI label="Ποσό" value={fmtEur(loan.amount)}/>
              <KPI label="Επιτόκιο" value={fmtPct(loan.rate)} color="var(--text-primary)" sub={loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό'}/>
              <KPI label="Δόση τον μήνα" value={fmtEur(m)} color="var(--text-primary)"/>
              <KPI label="Συνολικοί τόκοι" value={fmtEur(ti)} color="var(--text-primary)"/>
              <KPI label="Δάνειο προς αξία" value={`${ltv.toFixed(1).replace('.',',')}%`} color={ltv>90?'var(--negative)':'var(--text-primary)'} title="Ποσοστό δανείου ως προς την αξία του ακινήτου"/>
            </div>
            {loan.start_date&&(
              <div style={{padding:'10px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,display:'flex',gap:24,flexWrap:'wrap'}}>
                <div><p style={{...labelStyle,marginBottom:2}}>Έναρξη</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>{new Date(loan.start_date).toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'})}</p></div>
                <div><p style={{...labelStyle,marginBottom:2}}>Μήνες αποπληρωμής</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>~{elapsed}</p></div>
                <div><p style={{...labelStyle,marginBottom:2}}>Υπόλοιποι μήνες</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>~{rem}</p></div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',display:'flex',flexDirection:'column',gap:16}}>

      {/* Header — compact, premium, ήσυχο */}
      <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:14,padding:'13px 18px',display:'flex',alignItems:'center',gap:18,flexWrap:'wrap',boxShadow:'var(--shadow-sm)'}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:15.5,color:'var(--text-primary)',fontWeight:640,fontFamily:"'Inter',sans-serif",letterSpacing:'-0.02em'}}>Στεγαστικό δάνειο</p>
          <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:1,fontFamily:"'Inter',sans-serif"}}>Ελληνική αγορά · δεδομένα ΕΚΤ και Τράπεζας Ελλάδος</p>
        </div>
        <div style={{display:'flex',gap:10,marginLeft:'auto',flexWrap:'wrap',alignItems:'stretch'}}>
          {[
            {l:'Euribor τριμήνου',v:market.euribor_3m},
            {l:'Euribor μηνός',v:market.euribor_1m},
            {l:'ΕΚΤ',v:market.ecb_rate},
            ...(market.bog_housing_new?[{l:'ΤτΕ μέσο',v:market.bog_housing_new}]:[]),
          ].map((item,i)=>{
            const on=hoverRate===i
            return (
            <div key={item.l} onMouseEnter={()=>setHoverRate(i)} onMouseLeave={()=>setHoverRate(null)} onTouchStart={()=>setHoverRate(i)} onTouchEnd={()=>setHoverRate(null)}
              style={{textAlign:'center' as const,minWidth:76,padding:'2px 10px',borderRadius:10,transition:'background 0.15s',background:on?'var(--bg-surface)':'transparent',cursor:'default'}}>
              <p style={{fontSize:9,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const}}>{item.l}</p>
              <p style={{fontSize:15,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:market.isLoading?'var(--border-default)':on?'var(--accent)':'var(--text-primary)',fontWeight:700,marginTop:2,letterSpacing:'-0.01em',transition:'color 0.15s'}}>
                {market.isLoading?'…':fmtPct(item.v)}
              </p>
            </div>
          )})}
        </div>
      </div>

      {/* ═══ ΥΠΟΛΟΓΙΣΤΗΣ — πάντα ορατός στην κορυφή ═══ */}
      <div ref={calcRef}>
        <TabLoanCalculator
          propertyId={propertyId} userId={userId}
          profile={profile}
          applied={appliedLoan}
          market={{euribor_3m:market.euribor_3m,euribor_1m:market.euribor_1m,ecb_rate:market.ecb_rate,updated_at:market.updated_at}}
          initial={{
            loanAmount:String(initAmount), propValue:String(initValue),
            sqm: propertySqm && propertySqm>0 ? String(Math.round(propertySqm)) : undefined,
          }}
          onSaveLoan={handleSaveLoan}
          onSaveToCalendar={handleSaveCal}
          onSaveToExpenses={handleSaveExp}
          onStateChange={setCalcState}
        />
      </div>

      {/* ═══ COCKPIT: εναλλαγή φακών επί τόπου — ένα πάνελ τη φορά ═══ */}
      <LensBar value={openSec} onChange={v=>setOpenSec(v as any)} items={[
        {id:'advisor',label:'Σύσταση'},
        {id:'banks',label:'Τράπεζες'},
        {id:'programs',label:'Προγράμματα'},
        {id:'guide',label:'Μάθε περισσότερα'},
      ]}/>

      {/* ═══ ΣΥΓΚΡΙΣΗ ΤΡΑΠΕΖΩΝ ═══ */}
      {openSec==='banks' && (<LensPanel title="Σύγκριση τραπεζών" subtitle={`${BANKS.length} τράπεζες · επιβεβαιωμένα ${banksUpdStr}${banksStale?' · χρήζουν επαλήθευσης':''}`}>
        {openSec==='banks'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {isAdmin && <BankRatesAdmin showToast={showToast} onSaved={()=>{}}/>}
          {banksStale&&(
            <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>Τα επιτόκια επιβεβαιώθηκαν πριν από {banksAgeDays} ημέρες και ενδέχεται να έχουν αλλάξει. Για δεσμευτική προσφορά επιβεβαιώστε απευθείας με την τράπεζα ή στο <a href="https://vresdaneio.gr/epitokia/index.html" target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>vresdaneio.gr</a>.</p>
            </div>
          )}
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={()=>setFS(f=>!f)} style={{display:'flex',alignItems:'center',gap:7,padding:'0 14px',height:36,background:filterSpiti?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${filterSpiti?'var(--border-accent)':'var(--border-subtle)'}`,borderRadius:18,cursor:'pointer',color:filterSpiti?'var(--accent)':'var(--text-secondary)',fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:500}}>
              Σπίτι μου ΙΙ
            </button>
            <p style={{fontSize:11,color:'var(--text-tertiary)',marginLeft:'auto',fontFamily:"'Inter',sans-serif"}}>
              {banksLoading?'Φόρτωση…':`vresdaneio.gr · ${banksUpdStr}`}
              {liveBanks.length>0&&<span style={{color:'var(--text-secondary)',marginLeft:6}}>Ενημερωμένα στοιχεία</span>}
            </p>
          </div>

          {/* Επιλέξιμες συμπαγείς κάρτες — διάλεξε τράπεζα για λεπτομέρειες */}
          <p style={{...labelStyle,marginBottom:2}}>Διάλεξε τράπεζα για ανάλυση</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',gap:10}}>
            {BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).map((bank:any)=>{
              const key = String(bank.id||bank.bank_id||bank.bank_name||bank.name)
              const on = selBank===key
              const fixed5 = bank.fixed_5yr||bank.fixed5||bank.fixed_min||'—'
              const myM = calcMonthly(calcState.loanAmount||150000, bank.fixed_min||parseFloat(bank.fixed_5yr)||parseFloat(bank.fixed_3yr)||3.5, calcState.years||25)
              return (
                <button key={key} onClick={()=>setSelBank(on?null:key)} aria-pressed={on} onMouseEnter={()=>setHoverBank(key)} onMouseLeave={()=>setHoverBank(null)} onTouchStart={()=>setHoverBank(key)} onTouchEnd={()=>setHoverBank(null)} style={{textAlign:'left' as const,cursor:'pointer',background:'var(--bg-elevated)',
                  border:`1px solid ${on?'var(--border-accent)':hoverBank===key?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:16,padding:'14px 15px',transition:'border-color 0.15s, box-shadow 0.15s',
                  boxShadow:on?'0 2px 4px color-mix(in srgb, var(--accent) 14%, transparent), 0 10px 24px -14px color-mix(in srgb, var(--accent) 40%, transparent)':hoverBank===key?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent)':'0 1px 2px color-mix(in srgb, var(--text-primary) 6%, transparent)'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12}}>
                    <span style={{fontSize:14,fontWeight:600,fontFamily:"'Inter',sans-serif",color:(on||hoverBank===key)?'var(--accent)':'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',transition:'color 0.15s'}}>{bank.bank_name||bank.name}</span>
                    {bank.spiti_mou&&<span style={{flexShrink:0,fontSize:10,padding:'3px 9px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>Σπίτι μου ΙΙ</span>}
                  </div>
                  <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:12}}>
                    <div style={{minWidth:0}}>
                      <p style={{fontSize:20,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:(on||hoverBank===key)?'var(--accent)':'var(--text-primary)',fontWeight:700,lineHeight:1,letterSpacing:'-0.02em',whiteSpace:'nowrap',transition:'color 0.15s'}}>{cellRate(fixed5)==='—'?'—':`από ${cellRate(fixed5)}`}</p>
                      <p style={{fontSize:10.5,color:'var(--text-tertiary)',marginTop:4,fontFamily:"'Inter',sans-serif"}}>Σταθερό 5 ετών</p>
                    </div>
                    <div style={{textAlign:'right' as const,flexShrink:0}}>
                      <p style={{fontSize:13.5,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600,lineHeight:1}}>{fmtEur(myM)}</p>
                      <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:4,fontFamily:"'Inter',sans-serif"}}>δόση{bank.max_ltv?` · έως ${bank.max_ltv}%`:''}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Λεπτομέρειες επιλεγμένης τράπεζας */}
          {(()=>{
            const bank:any = BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).find((b:any)=>String(b.id||b.bank_id||b.bank_name||b.name)===selBank)
            if(!bank) return null
            const varRate = bank.variable_spread_min!==undefined?fmtPct(market.euribor_3m+bank.variable_spread_min):null
            const myM = calcMonthly(calcState.loanAmount||150000, bank.fixed_min||parseFloat(bank.fixed_5yr)||parseFloat(bank.fixed_3yr)||3.5, calcState.years||25)
            const terms = [['3 ετών','fixed_3yr'],['5 ετών','fixed_5yr'],['10 ετών','fixed_10yr'],['15 ετών','fixed_15yr'],['20 ετών','fixed_20yr']] as const
            return (
              <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-accent)',borderRadius:16,padding:'18px 20px',boxShadow:'var(--shadow-sm)'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:16}}>
                  <div>
                    <p style={{fontSize:17,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',letterSpacing:'-0.01em'}}>{bank.bank_name||bank.name}</p>
                    {bank.note&&<p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>{bank.note}</p>}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{padding:'0 16px',height:36,borderRadius:18,border:'1px solid var(--border-default)',background:'none',color:'var(--text-secondary)',fontSize:12.5,fontFamily:"'Inter',sans-serif",textDecoration:'none',fontWeight:500,display:'flex',alignItems:'center'}}>Επίσκεψη</a>}
                    <button onClick={()=>applyBank(bank.fixed_min||parseFloat(bank.fixed_5yr)||parseFloat(bank.fixed_3yr)||3.5, 'fixed', bank.bank_name||bank.name)} style={{padding:'0 16px',height:36,borderRadius:18,background:'var(--accent)',border:'none',color:'var(--accent-text)',fontSize:12.5,fontFamily:"'Inter',sans-serif",cursor:'pointer',fontWeight:600}}>Υπολόγισε τη δόση</button>
                  </div>
                </div>
                <p style={{...labelStyle,marginBottom:10}}>Σταθερά επιτόκια «από», ανά διάρκεια</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 90px), 1fr))',gap:8,marginBottom:16}}>
                  {terms.map(([lab,k])=>(
                    <div key={k} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'10px 12px'}}>
                      <p style={{fontSize:10,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",marginBottom:5}}>{lab}</p>
                      <p style={{fontSize:16,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1}}>{cellRate((bank as any)[k])}</p>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8}}>
                  {[
                    {label:'Κυμαινόμενο περιθώριο',value:bank.variable_spread_min!==undefined?`+${fmtRate2(bank.variable_spread_min)}–${fmtRate2(bank.variable_spread_max)}%`:'—',sub:varRate?`≈ ${varRate} σήμερα`:null},
                    {label:'Εκτιμώμενη δόση',value:fmtEur(myM),sub:`${fmtEur(calcState.loanAmount||150000)} · ${calcState.years||25} έτη`},
                    {label:'Μέγιστο δάνειο προς αξία',value:bank.max_ltv?`${bank.max_ltv}%`:'—',sub:bank.max_amount?`έως ${fmtEur(bank.max_amount)}`:null},
                    {label:'Σπίτι μου ΙΙ',value:bank.spiti_mou?'Ναι':'Όχι',sub:bank.spiti_mou?'Συμμετέχει στο πρόγραμμα':'Δεν συμμετέχει'},
                  ].map(s=>(
                    <div key={s.label} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'11px 13px'}}>
                      <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.05em',fontWeight:600,fontFamily:"'Inter',sans-serif",marginBottom:6}}>{s.label}</p>
                      <p style={{fontSize:18,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1}}>{s.value}</p>
                      {s.sub&&<p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:4,fontFamily:"'Inter',sans-serif"}}>{s.sub}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Πλήρης πίνακας επιτοκίων — πτυσσόμενος */}
          <MiniSection title="Πλήρης πίνακας επιτοκίων" meta={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{banksUpdStr}</span>}>
            <div style={{overflowX:'auto'}}>
              <div className="table-wrap">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border-subtle)'}}>
                    {[['Τράπεζα','left'],['3 έτη','right'],['5 έτη','right'],['10 έτη','right'],['15 έτη','right'],['20 έτη','right'],['Κυμαινόμενο περιθώριο','right'],['Δάνειο προς αξία','right'],['Σπίτι μου ΙΙ','left']].map(([h,al])=>(
                      <th key={h} style={{padding:'8px 12px',textAlign:al as any,fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:600,fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BANKS.filter((b:any)=>!filterSpiti||b.spiti_mou).map((bank:any,i:number)=>(
                    <tr key={bank.id||bank.bank_id} onMouseEnter={()=>setHoverBankRow(i)} onMouseLeave={()=>setHoverBankRow(null)} onTouchStart={()=>setHoverBankRow(i)} onTouchEnd={()=>setHoverBankRow(null)} style={{borderBottom:'1px solid var(--border-subtle)',background:hoverBankRow===i?'var(--bg-hover)':'transparent',transition:'background 0.12s'}}>
                      <td style={{padding:'10px 12px'}}>
                        <span style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>{bank.bank_name||bank.name}</span>
                      </td>
                      {['fixed_3yr','fixed_5yr','fixed_10yr','fixed_15yr','fixed_20yr'].map(k=>(
                        <td key={k} style={{padding:'10px 12px',textAlign:'right' as const,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:12.5,color:(bank as any)[k]?(hoverBankRow===i?'var(--accent)':'var(--text-primary)'):'var(--text-tertiary)',fontWeight:500,transition:'color 0.12s'}}>{cellRate((bank as any)[k])}</td>
                      ))}
                      <td style={{padding:'10px 12px',textAlign:'right' as const,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:12.5,color:hoverBankRow===i?'var(--accent)':'var(--text-primary)',transition:'color 0.12s'}}>{bank.variable_spread_min!==undefined?`+${fmtRate2(bank.variable_spread_min)}–${fmtRate2(bank.variable_spread_max)}%`:'—'}</td>
                      <td style={{padding:'10px 12px',textAlign:'right' as const,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:12.5,color:bank.max_ltv?(hoverBankRow===i?'var(--accent)':'var(--text-primary)'):'var(--text-tertiary)',fontWeight:500,transition:'color 0.12s'}}>{bank.max_ltv?`${bank.max_ltv}%`:'—'}</td>
                      <td style={{padding:'10px 12px'}}>
                        {bank.spiti_mou
                          ?<span style={{fontSize:11.5,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Ναι</span>
                          :<span style={{fontSize:11.5,color:'var(--text-tertiary)'}}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
              Εμφανίζονται τα χαμηλότερα («από») επιτόκια ανά διάρκεια. {RATES_DISCLAIMER} Επιβεβαιωμένα {banksUpdStr}. →{' '}
              <a href="https://e-stegastiko.gr" target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>e-stegastiko.gr</a>
            </p>
          </MiniSection>
        </div>
        )}
      </LensPanel>)}

      {/* ═══ ΚΡΑΤΙΚΑ ΠΡΟΓΡΑΜΜΑΤΑ ═══ */}
      {openSec==='programs' && (<LensPanel title="Κρατικά προγράμματα" subtitle={`${activePrograms.length} ενεργά · Σπίτι μου ΙΙ, Αναβαθμίζω, Εξοικονομώ`}>
        {openSec==='programs'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{padding:'2px 2px 4px'}}>
            <p style={{fontSize:11.5,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
              Στοιχεία από επίσημες πηγές{' · '}
              <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:'inherit',textDecoration:'none',fontWeight:500,borderBottom:'1px solid var(--border-default)'}}>greece20.gov.gr</a>{', '}
              <a href="https://ypen.gov.gr" target="_blank" rel="noreferrer" style={{color:'inherit',textDecoration:'none',fontWeight:500,borderBottom:'1px solid var(--border-default)'}}>ypen.gov.gr</a>{' · '}{updStr}
            </p>
          </div>

          {activePrograms.map((prog:any)=>{
            const deadStr = prog.deadline ? (prog.deadline.match(/^\d{4}-\d{2}-\d{2}$/)?prog.deadline.split('-').reverse().join('/'):prog.deadline) : null
            return (
            <MiniSection key={prog.id} title={prog.name} defaultOpen={isSpitiMou2(prog.name)}
              badges={<>
                <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:prog.status==='active'?'var(--text-primary)':'var(--text-tertiary)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{prog.status==='active'?'Ενεργό':'Επερχόμενο'}</span>
                {prog.deadline_urgent&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-default)',color:'var(--text-secondary)',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>Λήγει σύντομα</span>}
              </>}
              meta={deadStr?<span style={{fontSize:11.5,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const}}>Προθεσμία {deadStr}</span>:undefined}
            >
              <p style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:10,fontWeight:600,fontFamily:"'Inter',sans-serif",textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>{prog.type}</p>
              <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif",marginBottom:16}}>{prog.desc}</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:14,marginBottom:12}}>
                <div>
                  <p style={{...labelStyle,marginBottom:10}}>Κριτήρια επιλεξιμότητας</p>
                  {(prog.criteria||[]).map((c:string,i:number)=>(
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:'var(--border-subtle)',flexShrink:0,marginTop:5}}/>
                      <span style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{...labelStyle,marginBottom:10}}>Βασικά στοιχεία</p>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {[
                      prog.max_amount&&['Μέγιστο ποσό',fmtEur(prog.max_amount),'var(--text-primary)',16],
                      prog.max_ltv&&['Μέγιστο δάνειο προς αξία',`${prog.max_ltv}%`,'var(--text-primary)',14],
                      (prog as any).max_sqm&&['Μέγιστα τετραγωνικά',`${(prog as any).max_sqm} τετραγωνικά μέτρα`,'var(--text-primary)',12],
                      (prog as any).age_max&&['Ηλικία δικαιούχου',`${(prog as any).age_min}–${(prog as any).age_max} ετών`,'var(--text-primary)',12],
                      (prog.duration&&prog.duration!=='null')&&['Διάρκεια',prog.duration,'var(--text-secondary)',12],
                      prog.deadline&&['Προθεσμία',(prog.deadline.match(/^\d{4}-\d{2}-\d{2}$/)?prog.deadline.split('-').reverse().join('/'):prog.deadline),'var(--text-primary)',13],
                      (prog.total_budget&&prog.total_budget!=='null'&&prog.total_budget!=='-')&&['Προϋπολογισμός',prog.total_budget,'var(--text-primary)',13],
                    ].filter(Boolean).map((item:any,idx:number,arr:any[])=>(
                      <div key={item[0]} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:16,padding:'6px 0',borderBottom:idx<arr.length-1?'1px solid var(--border-subtle)':'none'}}>
                        <span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",flexShrink:0}}>{item[0]}</span>
                        <span style={{fontSize:item[3],fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:item[2],fontWeight:item[3]>12?700:500,textAlign:'right' as const,lineHeight:1.35}}>{item[1]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {((prog as any).how_it_works||prog.extra||prog.savings_example)&&(
                <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,marginBottom:12,display:'flex',flexDirection:'column',gap:9}}>
                  {(prog as any).how_it_works&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>{(prog as any).how_it_works}</p>}
                  {prog.extra&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{prog.extra}</p>}
                  {prog.savings_example&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{prog.savings_example}</p>}
                </div>
              )}
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:14}}>
                {(prog.participating_banks||prog.banks||[]).map((b:string)=><span key={b} style={{fontSize:11,padding:'3px 9px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{b}</span>)}
              </div>
              <SourceLinkPill href={prog.url}>Επίσημη σελίδα προγράμματος →</SourceLinkPill>
            </MiniSection>
            )
          })}
          {activePrograms.length===0&&(
            <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-secondary)'}}>
              <p style={{fontSize:14,fontFamily:"'Inter',sans-serif"}}>Δεν υπάρχουν ενεργά προγράμματα.</p>
            </div>
          )}
        </div>
        )}
      </LensPanel>)}

      {/* ═══ ΣΥΣΤΑΣΗ ΚΑΙ ΑΝΑΛΥΣΗ ═══ */}
      {openSec==='advisor' && (<LensPanel title="Σύσταση και ανάλυση δανείου" subtitle={`Βάσει ${fmtEur(LA)} / ${Y} χρόνια · από τον Υπολογιστή`}>
        <LoanDocScan
          banks={BANKS}
          euribor={market.euribor_3m || MARKET_FALLBACK.euribor_3m}
          defaultPropertyValue={calcState.propertyValue}
          onApply={a=>setAppliedLoan(a)}
          onSaveLoan={handleSaveLoan}
          onOpenCalculator={scrollToCalc}
        />
        {openSec==='advisor'&&(()=>{
        const cs = calcState
        const ltv = cs.propertyValue>0?(cs.loanAmount/cs.propertyValue)*100:0
        const totalCost = cs.monthly*cs.years*12
        const interestRatio = cs.loanAmount>0?cs.totalInterest/cs.loanAmount:0
        const stressMonthly2 = calcMonthly(cs.loanAmount,cs.effectiveRate+2,cs.years)
        // «Σπίτι μου ΙΙ»: 50% άτοκο + 50% με το επιτόκιο του δανειολήπτη (δύο σκέλη).
        const spitiMonthly = calcMonthly(cs.loanAmount*0.5,0,cs.years)+calcMonthly(cs.loanAmount*0.5,cs.effectiveRate,cs.years)
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
        // ── Σύσταση καλύτερου δανείου (recommender) ──────────────────────────────
        const needs: UserLoanNeeds = {
          amount: LA, propertyValue: calcState.propertyValue || 0, years: Y,
          purpose: advType, ratePreference: calcState.rateType,
        }
        const euribor = market.euribor_3m || MARKET_FALLBACK.euribor_3m
        const ranked = rankLoans(needs, BANKS as any, euribor)
        const spiti = spitiMouEligibility(needs)
        // Το πλήρες πάνελ «Σπίτι μου ΙΙ» εμφανίζεται μόνο όταν αφορά· τότε αποφεύγουμε
        // να επαναλάβουμε την ίδια πληροφορία στη σύνοψη πιο κάτω (ενιαία πηγή).
        const spitiPanelShown = advType==='first_home'||advBorr==='young'||advBorr==='family'
        const bestRankIdx = ranked.findIndex(r=>r.eligible)
        let score=100; const issues:string[]=[]
        if(ltv>85){score-=20;issues.push('LTV')}
        if(cs.effectiveRate>4){score-=15;issues.push('Επιτόκιο')}
        if(cs.rateType==='variable'){score-=10;issues.push('Κυμαινόμενο')}
        if(cs.years>25){score-=10;issues.push('Διάρκεια')}
        if(interestRatio>0.6){score-=15;issues.push('Τόκοι')}
        const scoreLabel=score>=80?'Υγιές δάνειο':score>=60?'Αποδεκτό, υπάρχει περιθώριο βελτίωσης':'Προσοχή, αξίζει επανεξέταση'
        const insight = euriborInsight({ euribor3m: euribor, loanAmount: cs.loanAmount, ratePct: cs.effectiveRate, years: cs.years, rateType: cs.rateType })
        // Κορυφαία πρόταση + λοιπές επιλογές (για πτυσσόμενη εμφάνιση, όχι «σούπερ μάρκετ»).
        const topRec = ranked[bestRankIdx>=0?bestRankIdx:0]
        const otherRecs = ranked.filter((_,i)=>i!==(bestRankIdx>=0?bestRankIdx:0)).slice(0,4)
        // Παράγοντες που μειώνουν τη βαθμολογία, με αναγνώσιμη περιγραφή.
        const FACTOR:Record<string,{label:string;d:number}> = {
          LTV:{label:'Υψηλό δάνειο προς αξία',d:20}, 'Επιτόκιο':{label:'Υψηλό επιτόκιο',d:15},
          'Κυμαινόμενο':{label:'Κυμαινόμενο επιτόκιο',d:10}, 'Διάρκεια':{label:'Μεγάλη διάρκεια',d:10}, 'Τόκοι':{label:'Υψηλοί συνολικοί τόκοι',d:15},
        }

        return (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>

            {/* ── Insight της ημέρας ── */}
            {insight&&(
              <div style={{display:'flex',alignItems:'flex-start',gap:11,padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-default)',borderRadius:12}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z"/></svg>
                <p style={{fontSize:12.5,color:'var(--text-primary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{insight}</p>
              </div>
            )}

            {/* ── Σπίτι μου ΙΙ, για σένα — όταν αφορά (πρώτη κατοικία ή νέος/οικογένεια) ── */}
            {spitiPanelShown && (
              <MiniSection title="Σπίτι μου ΙΙ, για σένα" defaultOpen badges={<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--accent-dim)',border:'1px solid var(--border-accent)',color:'var(--accent)',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>50% άτοκο</span>}>
                <SpitiMouPanel
                  amount={LA} propertyValue={cs.propertyValue} years={Y} bankRatePct={cs.effectiveRate}
                  incomeMonthly={calcState.incomeMonthly} marital={calcState.marital} children={calcState.children}
                  sqm={calcState.sqm ?? propertySqm} yearBuilt={propertyYearBuilt}
                  banks={BANKS} euribor={euribor} fmtEur={fmtEur} fmtPct={fmtPct} onOpenCalculator={scrollToCalc}
                />
              </MiniSection>
            )}

            {/* ── Θα εγκριθώ; — διαδραστική εκτίμηση πιθανότητας έγκρισης ── */}
            <MiniSection title="Πιθανότητα έγκρισης" defaultOpen badges={<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>Νέο</span>} meta={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const}}>Δανειοληπτικό προφίλ</span>}>
              <ApprovalPanel
                amount={LA} years={Y} ratePct={cs.effectiveRate} propertyValue={cs.propertyValue}
                incomeMonthly={calcState.incomeMonthly} borrowerType={advBorr}
                firstHomeDefault={advType==='first_home'} fmtEur={fmtEur}
              />
            </MiniSection>

            {/* ── Ανάλυση προσφοράς ESIS — τεχνικό εργαλείο, μόνο σε λειτουργία επαγγελματία ── */}
            {profile==='business' && (
            <MiniSection title="Ανάλυση προσφοράς ESIS" badges={<span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>Νέο</span>} meta={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const}}>Πραγματικό κόστος, ΣΕΠΠΕ</span>}>
              <EsisScanPanel
                defaultAmount={LA} defaultYears={Y}
                benchmarkAprc={topRec?Math.round((topRec.effectiveRatePct+0.3)*100)/100:undefined}
                fmtEur={fmtEur}
              />
            </MiniSection>
            )}

            {/* ── Σύσταση καλύτερου δανείου — premium, πτυσσόμενη ── */}
            <MiniSection title="Σύσταση καλύτερου δανείου" defaultOpen meta={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const}}>{fmtEur(LA)} / {Y} έτη</span>}>
              {topRec && (
                <div onMouseEnter={()=>setRecHover(true)} onMouseLeave={()=>setRecHover(false)}
                  onTouchStart={()=>setRecHover(true)} onTouchEnd={()=>setRecHover(false)}
                  style={{position:'relative',overflow:'hidden',borderRadius:14,padding:'13px 16px',marginBottom:10,
                  background:'var(--bg-surface)',
                  border:`1px solid ${recHover?'var(--border-default)':'var(--border-subtle)'}`,
                  boxShadow:recHover?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent), 0 10px 22px -14px color-mix(in srgb, var(--text-primary) 22%, transparent)':'0 1px 2px color-mix(in srgb, var(--text-primary) 6%, transparent)',transition:'border-color 0.15s, box-shadow 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:5}}>
                        <span style={{fontSize:9.5,padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:600,fontFamily:"'Inter',sans-serif",letterSpacing:'0.02em'}}>Καλύτερη επιλογή</span>
                        {topRec.spitiMouApplied&&<span style={{fontSize:9.5,padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>Σπίτι μου ΙΙ</span>}
                      </div>
                      <p style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",letterSpacing:'-0.02em',lineHeight:1.1}}>{topRec.bankName}</p>
                      <p style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:3,lineHeight:1.45,fontFamily:"'Inter',sans-serif"}}>{topRec.eligible?topRec.why:topRec.blockers.join(' · ')}</p>
                      {topRec.eligible&&(
                        <button onClick={()=>applyBank(topRec.nominalRatePct, topRec.rateType, topRec.bankName)}
                          onMouseEnter={()=>setApplyHover(true)} onMouseLeave={()=>setApplyHover(false)}
                          onTouchStart={()=>setApplyHover(true)} onTouchEnd={()=>setApplyHover(false)}
                          style={{marginTop:10,display:'inline-flex',alignItems:'center',gap:6,height:32,padding:'0 13px',borderRadius:16,background:applyHover?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${applyHover?'var(--border-accent)':'var(--border-subtle)'}`,color:applyHover?'var(--accent)':'var(--text-secondary)',fontSize:12,fontWeight:600,fontFamily:"'Inter',sans-serif",cursor:'pointer',transition:'color 0.15s, background 0.15s, border-color 0.15s'}}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                          Εφαρμογή στον Υπολογιστή
                        </button>
                      )}
                    </div>
                    <div style={{textAlign:'right' as const,flexShrink:0}}>
                      <p style={{fontSize:23,fontWeight:700,color:recHover?'var(--accent)':'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',lineHeight:1,letterSpacing:'-0.03em',transition:'color 0.15s'}}>{fmtPct(topRec.effectiveRatePct)}</p>
                      <p style={{fontSize:12.5,color:'var(--text-primary)',marginTop:5,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',fontWeight:600}}>{fmtEur(topRec.monthlyPayment)} τον μήνα</p>
                      <p style={{fontSize:10.5,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>Σύνολο {fmtEur(topRec.totalCost)}</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Σύνοψη «Σπίτι μου ΙΙ» — μόνο όταν ΔΕΝ δείχνεται το πλήρες πάνελ πιο πάνω
                  (αποφυγή διπλής εμφάνισης της ίδιας πληροφορίας στη ροή πρώτης κατοικίας). */}
              {!spitiPanelShown && (
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',marginBottom:otherRecs.length?12:0,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
                <div style={{minWidth:0}}>
                  <p style={{fontSize:12.5,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)'}}>Σπίτι μου ΙΙ: {spiti.eligible?'πιθανώς επιλέξιμο':'μη επιλέξιμο'} <span style={{color:'var(--text-secondary)',fontWeight:400}}>· {Math.round(spiti.interestFreeShare*100)}% άτοκο</span></p>
                  <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5,marginTop:2,fontFamily:"'Inter',sans-serif"}}>{spiti.reasons.slice(0,3).join(' · ')}. Ενδεικτικό, επιβεβαίωσε στην πύλη.</p>
                </div>
              </div>
              )}
              {otherRecs.length>0 && (
                <MiniSection flat title={`Άλλες επιλογές (${otherRecs.length})`}>
                  <div style={{display:'flex',flexDirection:'column',gap:7}}>
                    {otherRecs.map(r=>{
                      const on=otherHover===r.bankId
                      return (
                      <div key={r.bankId}
                        onMouseEnter={()=>setOtherHover(r.bankId)} onMouseLeave={()=>setOtherHover(null)}
                        onTouchStart={()=>setOtherHover(r.bankId)} onTouchEnd={()=>setOtherHover(null)}
                        onClick={r.eligible?()=>applyBank(r.nominalRatePct, r.rateType, r.bankName):undefined}
                        role={r.eligible?'button':undefined} title={r.eligible?'Εφαρμογή επιτοκίου στον Υπολογιστή':undefined}
                        style={{display:'flex',alignItems:'center',gap:9,padding:'10px 13px',background:'var(--bg-surface)',border:`1px solid ${on?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:10,opacity:r.eligible?1:0.6,transition:'border-color 0.15s',cursor:r.eligible?'pointer':'default'}}>
                        <span style={{fontSize:13,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{r.bankName||'Τράπεζα'}</span>
                        {r.spitiMouApplied&&<span style={{flexShrink:0,fontSize:9.5,padding:'2px 7px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>Σπίτι μου ΙΙ</span>}
                        <div style={{marginLeft:'auto',flexShrink:0,display:'flex',alignItems:'baseline',gap:12}}>
                          <span style={{fontSize:11.5,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap' as const}}>{fmtEur(r.monthlyPayment)}/μήνα</span>
                          <span style={{fontSize:14,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:on?'var(--accent)':'var(--text-primary)',fontWeight:700,lineHeight:1,transition:'color 0.15s',minWidth:52,textAlign:'right' as const}}>{fmtPct(r.effectiveRatePct)}</span>
                          <InfoDot text={r.eligible?r.why:r.blockers.join(' · ')}/>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </MiniSection>
              )}
              <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>{RATES_DISCLAIMER}</p>
            </MiniSection>

            {/* ── Στρατηγική ανά προφίλ: φυσικό vs νομικό πρόσωπο ── */}
            {(()=>{
              const isLegal = profile==='business'
              const isCompany = advBorr==='company'
              const kindLabel = !isLegal ? 'Ιδιώτης' : isCompany ? 'Νομικό πρόσωπο' : 'Επαγγελματίας'
              // Ασπίδα φόρου: οι τόκοι επιχειρηματικού δανείου εκπίπτουν. Για νομικό
              // πρόσωπο ο συντελεστής είναι 22% (σταθερός) — δίνουμε πραγματικό νούμερο.
              const taxShieldCompany = Math.round(cs.totalInterest * 0.22)
              const intro = isLegal
                ? (isCompany
                    ? 'Ως νομικό πρόσωπο το δάνειο αξιολογείται με βάση τους ισολογισμούς και την ταμειακή ροή, όχι το προσωπικό εισόδημα. Η βασική διαφορά είναι φορολογική: οι τόκοι εκπίπτουν.'
                    : 'Ως επαγγελματίας κρίνεσαι με τον μέσο όρο των φορολογικών δηλώσεων της τελευταίας διετίας. Οι τόκοι δανείου επαγγελματικού σκοπού εκπίπτουν από τα ακαθάριστα έσοδα.')
                : 'Ως φυσικό πρόσωπο η έγκριση βασίζεται στο εισόδημα και στον Τειρεσία. Στόχος: χαμηλότερο κόστος, σταθερότητα δόσης και αξιοποίηση κρατικών προγραμμάτων για πρώτη κατοικία και αναβάθμιση.'
              const rows = isLegal ? [
                {t:'Φορολογική ασπίδα των τόκων', b: isCompany
                  ? `Οι τόκοι εκπίπτουν πλήρως. Με συντελεστή 22% το έμμεσο όφελος στη διάρκεια εκτιμάται περίπου ${fmtEur(taxShieldCompany)}, δηλαδή το πραγματικό κόστος δανεισμού είναι χαμηλότερο από το ονομαστικό επιτόκιο.`
                  : 'Οι τόκοι δανείου επαγγελματικού σκοπού εκπίπτουν από τα ακαθάριστα έσοδα. Το όφελος εξαρτάται από τον οριακό σου συντελεστή· επιβεβαίωσέ το με τον λογιστή σου.'},
                {t:'Απόσβεση κτηρίου', b:'Το κτηριακό μέρος (όχι το οικόπεδο) αποσβένεται και μειώνει το φορολογητέο αποτέλεσμα κάθε χρόνο. Συνδυασμένο με τους τόκους, βελτιώνει ουσιαστικά την καθαρή απόδοση.'},
                {t:'Χρηματοδότηση και εξασφαλίσεις', b:'Τυπικό δάνειο προς αξία 60–70%. Ζητούνται ισολογισμοί τριετίας, απόφαση διοίκησης και συνήθως προσωπική εγγύηση. Προετοίμασε ενημερότητες ΑΑΔΕ και ΕΦΚΑ έγκαιρα.'},
                {t:'Ανάπτυξη χαρτοφυλακίου με μόχλευση', b:'Η μόχλευση επιταχύνει την ανάπτυξη μόνο όταν η καθαρή απόδοση του ακινήτου υπερβαίνει το κόστος δανεισμού. Κράτα απόθεμα ρευστότητας για κενές περιόδους και συντήρηση.'},
              ] : [
                {t:'Αξιοποίηση κρατικών προγραμμάτων', b:'Για πρώτη κατοικία, το «Σπίτι μου ΙΙ» μειώνει δραστικά το κόστος (50% άτοκο). Έλεγξε την επιλεξιμότητα πριν επιλέξεις τράπεζα· δεν επιτρέπονται ταυτόχρονες αιτήσεις.'},
                {t:'Πειθαρχία στον δείκτη δόσης', b:'Τα όρια της Τράπεζας Ελλάδος: δόση έως 50% του εισοδήματος για πρώτη κατοικία, 40% για τους υπόλοιπους. Χαμηλότερος δείκτης σημαίνει καλύτερο επιτόκιο και ευκολότερη έγκριση.'},
                {t:'Αύξηση αξίας με ενεργειακή αναβάθμιση', b:'Προγράμματα όπως «Εξοικονομώ» και «Αναβαθμίζω» ανεβάζουν την ενεργειακή κλάση, την αξία και το ενοίκιο, με επιδοτούμενο επιτόκιο και επιχορήγηση.'},
                {t:'Σταθερότητα δόσης', b:`Το σταθερό επιτόκιο προστατεύει από αυξήσεις. Στο τρέχον σενάριο, αύξηση Euribor +2% θα ανέβαζε τη δόση κατά ${fmtEur(calcMonthly(cs.loanAmount,cs.effectiveRate+2,cs.years)-cs.monthly)} τον μήνα.`},
              ]
              return (
                <MiniSection title="Στρατηγική ανά προφίλ" meta={<span style={{fontSize:11,padding:'2px 10px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{kindLabel}</span>}>
                  <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.65,fontFamily:"'Inter',sans-serif",marginBottom:14}}>{intro}</p>
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {rows.map(r=>(
                      <div key={r.t} style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-subtle)',borderRadius:8}}>
                        <div style={{width:6,height:6,borderRadius:'50%',background:'var(--border-default)',flexShrink:0,marginTop:6}}/>
                        <div>
                          <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>{r.t}</p>
                          <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{r.b}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>Ρύθμισε τον τύπο δανειολήπτη στον Υπολογιστή για να προσαρμοστεί η στρατηγική. Ενημερωτικές πληροφορίες, όχι φορολογική ή νομική συμβουλή.</p>
                </MiniSection>
              )
            })()}

            {(()=>{
              const c = score>=80?'var(--accent)':score>=60?'var(--text-primary)':'var(--negative)'
              const factors = issues.map(k=>FACTOR[k]).filter(Boolean)
              return (
              <MiniSection title="Ανάλυση δανείου" meta={<span style={{fontSize:12,color:score>=60?'var(--text-secondary)':'var(--negative)',fontFamily:"'Inter',sans-serif",fontWeight:600,whiteSpace:'nowrap' as const}}>{scoreLabel}</span>}>
                <div style={{display:'flex',alignItems:'center',gap:22,flexWrap:'wrap'}}>
                  <div onMouseEnter={()=>setScoreHover(true)} onMouseLeave={()=>setScoreHover(false)}
                    onTouchStart={()=>setScoreHover(true)} onTouchEnd={()=>setScoreHover(false)}
                    style={{display:'flex',alignItems:'baseline',gap:5,flexShrink:0,cursor:'default'}}>
                    <span style={{fontSize:46,fontWeight:700,color:score<60?'var(--negative)':scoreHover?'var(--accent)':'var(--text-primary)',fontFamily:"'Inter',sans-serif",letterSpacing:'-0.04em',fontVariantNumeric:'tabular-nums',lineHeight:1,transition:'color 0.15s'}}>{score}</span>
                    <span style={{fontSize:15,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",fontWeight:600}}>/ 100</span>
                  </div>
                  <div style={{flex:1,minWidth:220}}>
                    <div style={{position:'relative',height:10,borderRadius:6,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
                      <div style={{width:`${score}%`,height:'100%',borderRadius:6,background:c,transition:'width 0.4s ease'}}/>
                      <div style={{position:'absolute',left:'60%',top:0,bottom:0,width:0,borderLeft:'1px dashed var(--text-tertiary)',opacity:0.5}}/>
                      <div style={{position:'absolute',left:'80%',top:0,bottom:0,width:0,borderLeft:'1px dashed var(--text-tertiary)',opacity:0.5}}/>
                    </div>
                    <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:7,fontFamily:"'Inter',sans-serif"}}>Όρια: αποδεκτό 60 · υγιές 80. Βάσει {fmtEur(cs.loanAmount)} · {cs.years} έτη · {fmtPct(cs.effectiveRate)} {cs.rateType==='variable'?'κυμαινόμενο':'σταθερό'}.</p>
                  </div>
                </div>
                {factors.length>0 ? (
                  <div style={{marginTop:16}}>
                    <p style={{...labelStyle,marginBottom:9}}>Τι μειώνει τη βαθμολογία</p>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {factors.map(f=>(
                        <span key={f.label} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'7px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>
                          {f.label}<span style={{fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--negative)',fontWeight:700}}>−{f.d}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{marginTop:14,fontSize:12.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",lineHeight:1.5}}>Δεν εντοπίστηκε καμία επισήμανση· άριστο προφίλ δανείου.</p>
                )}
              </MiniSection>
              )
            })()}

            {(()=>{ const info=LOAN_TYPES[advType]; return (
              <MiniSection title={`Οδηγός, ${info.label}`}>
                <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif",margin:'0 0 14px'}}>{info.desc}. {info.notes}.</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%,150px),1fr))',gap:10,marginBottom:14}}>
                  {[['Τυπικό επιτόκιο',info.typical_rate],['Τυπικό δάνειο προς αξία',`έως ${info.typical_ltv}%`]].map(([k,v])=>(
                    <div key={k as string} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'11px 13px'}}>
                      <div style={{fontSize:10,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase',color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",marginBottom:5}}>{k}</div>
                      <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',letterSpacing:'-0.01em'}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'11px 13px',marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",marginBottom:4}}>Φορολογικά και νομικά</div>
                  <div style={{fontSize:12.5,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{info.tax_note}</div>
                </div>
                <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif",margin:0}}>Τα απαραίτητα δικαιολογητικά και η πρόοδός τους βρίσκονται στον Υπολογιστή, ενότητα «Πίνακας και έγγραφα».</p>
              </MiniSection>
            ); })()}

            <MiniSection title="Τι βλέπω στο σενάριό σας">
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {/* LTV */}
                <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',borderLeft:'3px solid var(--border-subtle)',borderRadius:8,border:'1px solid var(--border-subtle)'}}>
                  <div style={{width:36,height:36,borderRadius:8,background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                      Δάνειο προς αξία: {ltv.toFixed(1).replace('.',',')}%. {ltv>85?'Υψηλό, απαιτείται προσοχή':ltv>70?'Μέτριο, αποδεκτό':'Καλό, εντός ορίων'}
                    </p>
                    <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                      {ltv>85
                        ?`Χρηματοδοτείτε το ${ltv.toFixed(0)}% της αξίας, οι τράπεζες είναι επιφυλακτικές άνω του 80%.`
                        :ltv>70
                        ?`Ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)} (${(100-ltv).toFixed(0)}% της αξίας). Εντός αποδεκτών ορίων.`
                        :`Άριστη αναλογία, ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)} (${(100-ltv).toFixed(0)}%). Ενισχύει τη διαπραγματευτική σας θέση.`
                      }
                    </p>
                  </div>
                </div>

                {/* Rate */}
                <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                  <div style={{width:36,height:36,borderRadius:8,background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                      Επιτόκιο {fmtPct(cs.effectiveRate)}, {cs.rateType==='variable'?'κυμαινόμενο':'σταθερό'}
                      {cs.rateType==='variable'&&<span title="Διατραπεζικό επιτόκιο ευρώ — βάση κυμαινόμενων δανείων" style={{fontSize:11,color:'var(--text-tertiary)',marginLeft:8,fontWeight:400}}>Εκτεθειμένο σε Euribor</span>}
                    </p>
                    <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                      {cs.rateType==='variable'
                        ?`Τρέχον Euribor ${fmtPct(market.euribor_3m)}. Αν ανέβει +2%, η δόση γίνεται ${fmtEur(stressMonthly2)}, αύξηση ${fmtEur(stressMonthly2-cs.monthly)} τον μήνα.`
                        :bestBank&&savingVsBestBank>0
                        ?`Σταθερό, ασφάλεια. Καλύτερο σταθερό αγοράς: ${fmtPct(bestBank.fixed_min)} (${bestBank.bank_name||bestBank.name}) → δόση ${fmtEur(bestBankMonthly)} → εξοικονόμηση ${fmtEur(savingVsBestBank)}.`
                        :`Σταθερό ${fmtPct(cs.effectiveRate)}, προστατευμένοι. Euribor τριμήνου: ${fmtPct(market.euribor_3m)}.`
                      }
                    </p>
                  </div>
                </div>

                {/* Total cost */}
                <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                  <div style={{width:36,height:36,borderRadius:8,background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                  </div>
                  <div>
                    <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                      Συνολικοί τόκοι {fmtEur(cs.totalInterest)}, {(interestRatio*100).toFixed(0)}% επί κεφαλαίου
                    </p>
                    <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                      Για {fmtEur(cs.loanAmount)} θα αποπληρώσετε συνολικά {fmtEur(totalCost)}.
                      {cs.years>20&&savedByShortening>0
                        ?` Σε 20 χρόνια: δόση ${fmtEur(shortMonthly20)} τον μήνα (+${fmtEur(shortMonthly20-cs.monthly)}) → εξοικονόμηση ${fmtEur(savedByShortening)} τόκοι.`
                        :` Έκτακτη πληρωμή 100€ τον μήνα → -${extraPay100Saving.toFixed(1).replace('.',',')} χρόνια διάρκεια.`
                      }
                    </p>
                  </div>
                </div>

                {advType==='first_home'&&spiti.eligible&&spitiSaving>5000&&(
                  <div style={{display:'flex',gap:12,padding:'12px 14px',background:'var(--bg-surface)',borderLeft:'3px solid var(--border-subtle)',borderRadius:8,border:'1px solid var(--border-subtle)'}}>
                    <div style={{width:36,height:36,borderRadius:8,background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div>
                      <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:3}}>
                        Σπίτι μου ΙΙ: εξοικονομείτε {fmtEur(spitiSaving)}, προθεσμία συμβολαίων 31/08/2026
                      </p>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
                        Δόση {fmtEur(spitiMonthly)} τον μήνα αντί {fmtEur(cs.monthly)}, διαφορά {fmtEur(cs.monthly-spitiMonthly)} τον μήνα.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </MiniSection>

            {/* Eligibility */}
            <MiniSection title="Επιλεξιμότητα κρατικών προγραμμάτων">
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {[
                  {l:'Σπίτι μου ΙΙ, προθεσμία 31/08/2026',el:(advBorr==='young'||advBorr==='family')&&advType==='first_home',reason:(advBorr==='young'||advBorr==='family')&&advType==='first_home'?`Πληροίτε τα κριτήρια. Δόση από ${fmtEur(spitiMonthly)} τον μήνα`:advType!=='first_home'?'Αλλάξτε σε «Πρώτη κατοικία»':'Ηλικία 25–50',badge:`-${fmtEur(cs.monthly-spitiMonthly)} τον μήνα`},
                  {l:'Αναβαθμίζω, προθεσμία 31/08/2026',el:advType==='energy',reason:advType==='energy'?'Κατάλληλο. Δάνειο έως 25.000€ με επιδοτούμενο επιτόκιο':'Επιλέξτε «Ενεργειακή αναβάθμιση»',badge:'Επιδοτούμενο επιτόκιο'},
                  {l:'Πράσινο δάνειο (-0,15% έως -0,25%)',el:advType==='energy'||advType==='renovation',reason:advType==='energy'||advType==='renovation'?`Εξοικονόμηση ~${fmtEur(cs.loanAmount*0.002*cs.years)} τόκων`:'Για ενεργειακή αναβάθμιση ή ανακαίνιση',badge:`~${fmtEur(cs.loanAmount*0.002*cs.years)}`},
                  {l:'Ένοπλες Δυνάμεις, ΤΑΠ-ΟΙΚ',el:advBorr==='military',reason:advBorr==='military'?'Δικαιούστε επιδοτούμενο δάνειο μέσω ΤΑΠ':'Μόνο για εν ενεργεία μέλη',badge:'Χαμηλότερο επιτόκιο'},
                  {l:'Γέφυρα 3, Επιδότηση δόσης',el:cs.rateType==='variable',reason:cs.rateType==='variable'?'Κυμαινόμενο επιτόκιο, ελέγξτε εισοδηματικά κριτήρια':'Εφαρμόζεται μόνο σε κυμαινόμενα',badge:'50% αύξησης δόσης'},
                ].map(item=>(
                  <div key={item.l} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-subtle)',borderRadius:8}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:item.el?'var(--accent-dim)':'var(--bg-elevated)',border:item.el?'none':'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {item.el
                        ?<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        :<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      }
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontSize:13,color:item.el?'var(--text-primary)':'var(--text-secondary)',fontWeight:item.el?500:400,fontFamily:"'Inter',sans-serif"}}>{item.l}</p>
                      <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif"}}>{item.reason}</p>
                    </div>
                    {item.el&&<span style={{fontSize:11,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--accent)',background:'var(--accent-dim)',padding:'4px 10px',borderRadius:8,border:'1px solid var(--border-accent)',whiteSpace:'nowrap' as const,fontWeight:600}}>{item.badge}</span>}
                  </div>
                ))}
              </div>
            </MiniSection>

            {/* Improvements */}
            {issues.length>0&&(
              <MiniSection title="Τι μπορείτε να βελτιώσετε">
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {issues.includes('LTV')&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--text-secondary)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Αξία</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Αυξήστε την προκαταβολή:</strong> δάνειο προς αξία κάτω από 80% → καλύτερο επιτόκιο και αποδοχή.</p>
                    </div>
                  )}
                  {issues.includes('Επιτόκιο')&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--text-secondary)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Επιτόκιο</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Διαπραγματευτείτε:</strong> Γραπτές προσφορές από 3 τράπεζες, μειώσεις 0,10–0,25% είναι συνηθισμένες.</p>
                    </div>
                  )}
                  {issues.includes('Κυμαινόμενο')&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--negative)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Κίνδυνος</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Σκεφτείτε σταθερό:</strong> +2% Euribor → δόση {fmtEur(stressMonthly2)} (+{fmtEur(stressMonthly2-cs.monthly)} τον μήνα).</p>
                    </div>
                  )}
                  {issues.includes('Διάρκεια')&&cs.years>20&&(
                    <div style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                      <span style={{color:'var(--text-secondary)',fontWeight:700,flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Χρόνια</span>
                      <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}><strong>Μειώστε τη διάρκεια:</strong> 20 χρόνια → δόση {fmtEur(shortMonthly20)} → εξοικονόμηση {fmtEur(savedByShortening)} τόκοι.</p>
                    </div>
                  )}
                </div>
              </MiniSection>
            )}
          </div>
        )
      })()}
      </LensPanel>)}

      {/* ═══ ΟΔΗΓΟΣ ΚΑΙ ΔΙΑΔΙΚΑΣΙΑ ═══ */}
      {openSec==='guide' && (<LensPanel title="Μάθε περισσότερα" subtitle="Διαδικασία, διαχειριστές και κόκκινα δάνεια, απορρίψεις, γλωσσάρι, πηγές">
        {openSec==='guide'&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Προσαρμοζόμενος τόνος ανά προφίλ — καθοδήγηση για ιδιώτες, ανάλυση για επαγγελματίες */}
          <div style={{padding:'13px 16px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12}}>
            <p style={{fontSize:12.5,color:'var(--text-secondary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
              {profile==='business'
                ? 'Τεχνική ανάλυση αγοράς, κριτηρίων και εργαλείων για επαγγελματίες και επιχειρήσεις. Ξεκίνα από το ιστορικό Euribor και τις ειδικές κατηγορίες. Για κάθε δεσμευτική απόφαση, διασταύρωσε με τράπεζα, λογιστή ή δικηγόρο.'
                : 'Απλός οδηγός βήμα-βήμα για την πρώτη σου κατοικία ή επένδυση. Δες πρώτα «Πώς λειτουργεί» και «Γιατί απορρίπτεται μια αίτηση». Για πιο εξειδικευμένη ανάλυση, άλλαξε σε προφίλ «Επαγγελματίας» από τις Ρυθμίσεις.'}
            </p>
          </div>
          <MiniSection title="Πώς λειτουργεί ένα στεγαστικό δάνειο στην Ελλάδα" defaultOpen={profile!=='business'}>
            {[
              {step:1,title:'Προεπιλογή και προετοιμασία',time:'1–2 εβδομάδες',color:'var(--accent)',dim:'var(--accent-dim)',desc:'Ελέγξτε επιλεξιμότητα στο gov.gr με Taxisnet. Για Σπίτι μου ΙΙ η προεπιλογή είναι αυτόματη.',tip:'Κάντε πρώτα τον έλεγχο επιλεξιμότητας στο gov.gr, αν αποτύχει μάθετε νωρίς γιατί.',warning:'Χρέη σε ΔΟΥ, ΕΦΚΑ ή εκτελεστοί τίτλοι μπλοκάρουν άμεσα. Τακτοποιήστε πρώτα.',url:null},
              {step:2,title:'Συλλογή εγγράφων',time:'1–3 εβδομάδες',color:'var(--accent)',dim:'var(--accent-dim)',desc:'Εκκαθαριστικά, μισθοδοτικές 3 μηνών, Ε9, πιστοποιητικό οικογενειακής κατάστασης. Ελεύθεροι επαγγελματίες: φορολογικές 2 ετών.',tip:'Ζητήστε κάθε έγγραφο εκ των προτέρων, η τράπεζα συχνά ζητά επιπλέον κατά τη διαδικασία.',warning:'Τα Ε1/Ε9 από ΑΑΔΕ, βεβαιωθείτε ότι είναι ενημερωμένα.',url:null},
              {step:3,title:'Αίτηση στην τράπεζα',time:'1 ημέρα',color:'var(--accent)',dim:'var(--accent-dim)',desc:'Για Σπίτι μου ΙΙ επιλέξτε ΜΙΑ τράπεζα, δεν επιτρέπονται ταυτόχρονες αιτήσεις. Επιλέξτε προσεκτικά βάσει επιτοκίου.',tip:'Ζητήστε γραπτή προσφορά (τυποποιημένο ευρωπαϊκό δελτίο πληροφοριών, ESIS) από 2-3 τράπεζες πριν δεσμευτείτε. Δικαιούστε 7 εργάσιμες για απόφαση.',warning:'Μην υπογράφετε τίποτα την πρώτη μέρα. Μελετήστε το τυποποιημένο ευρωπαϊκό δελτίο πληροφοριών (ESIS).',url:'https://www.bankofgreece.gr'},
              {step:4,title:'Εκτίμηση ακινήτου και νομικός έλεγχος',time:'1–3 εβδομάδες',color:'var(--accent)',dim:'var(--accent-dim)',desc:'Πιστοποιημένος εκτιμητής (RICS ή ΤΕΕ) αξιολογεί το ακίνητο. Νομικός έλεγχος τίτλων στο Κτηματολόγιο.',tip:'Αν η εκτίμηση είναι χαμηλότερη από την τιμή αγοράς, το δάνειο προς αξία υπολογίζεται επί αυτής, ενδέχεται να χρειαστείτε επιπλέον κεφάλαια.',warning:'Αυθαίρετα (κλεισμένες βεράντες, αλλαγές χωρίς άδεια) μπλοκάρουν τη μεταβίβαση. Ζητήστε τεχνικό έλεγχο πρώτα.',url:'https://www.ktimatologio.gr'},
              {step:5,title:'Έγκριση δανείου',time:'3–10 εργάσιμες',color:'var(--accent)',dim:'var(--accent-dim)',desc:'Η τράπεζα αξιολογεί εισόδημα, Τειρεσία, εκτίμηση, νομικά. Η απόφαση ισχύει συνήθως 90 ημέρες.',tip:'Σε απόρριψη ζητήστε γραπτώς τον λόγο. Επανεξετάστε μετά από 6 μήνες ή αλλάξτε τράπεζα.',warning:'Ακόμα και μία ακάλυπτη επιταγή ή δόση με καθυστέρηση >90 ημερών επηρεάζει τον Τειρεσία.',url:'https://www.tiresias.gr'},
              {step:6,title:'Συμβόλαιο και εκταμίευση',time:'1–2 εβδομάδες',color:'var(--accent)',dim:'var(--accent-dim)',desc:'Αγοραπωλητήριο ενώπιον συμβολαιογράφου. Εκταμίευση μετά καταχώρηση στο Κτηματολόγιο.',tip:'Νεόδμητα: απαιτείται ΠΕΑ για τη μεταβίβαση.',warning:'Φορολογικές & ασφαλιστικές ενημερότητες λήγουν γρήγορα (15–30 μέρες), έχετε τα μαζί σας.',url:null},
            ].map((step,i,arr)=>(
              <div key={i} style={{display:'flex',gap:16,alignItems:'flex-start',paddingBottom:20,borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none',marginBottom:i<arr.length-1?20:0}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--border-default)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{fontSize:13,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)',fontWeight:600}}>{step.step}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:6,flexWrap:'wrap'}}>
                    <p style={{fontSize:14,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',letterSpacing:'-0.01em'}}>{step.title}</p>
                    <span style={{fontSize:10,color:'var(--text-tertiary)',background:'var(--bg-surface)',padding:'2px 8px',borderRadius:8,border:'1px solid var(--border-subtle)',fontFamily:"'Inter',sans-serif",fontWeight:500,whiteSpace:'nowrap' as const}}>{step.time}</span>
                  </div>
                  <p style={{fontSize:12.5,color:'var(--text-secondary)',lineHeight:1.65,fontFamily:"'Inter',sans-serif"}}>{step.desc}</p>
                  <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.55,marginTop:6,fontFamily:"'Inter',sans-serif"}}>{step.warning}{step.url&&<> · <InlineLink href={step.url}>πηγή</InlineLink></>}</p>
                </div>
              </div>
            ))}
          </MiniSection>


          {/* Rejection reasons */}
          <MiniSection title="Γιατί απορρίπτεται μια αίτηση">
            <div style={{display:'flex',flexDirection:'column'}}>
              {[
                {title:'Εγγραφή στον Τειρεσία',desc:'Μία ακάλυπτη επιταγή ή δόση με καθυστέρηση >90 ημερών αρκεί. Τακτοποίησε οφειλές πριν την αίτηση.',url:'https://www.tiresias.gr'},
                {title:'Χαμηλό εισόδημα ή υψηλός δείκτης δόσης',desc:'Όρια ΤτΕ: δόση έως 50% του εισοδήματος για πρώτη κατοικία, 40% για τους υπόλοιπους.',url:null},
                {title:'Αυθαίρετα στο ακίνητο',desc:'Αλλαγές χωρίς άδεια (βεράντα, πατάρι, αλλαγή χρήσης) μπλοκάρουν τη μεταβίβαση ή μειώνουν την εκτίμηση.',url:'https://www.ktimatologio.gr'},
                {title:'Προβλήματα τίτλων',desc:'Ακαθόριστοι τίτλοι, αδήλωτα σε Ε9, εκκρεμείς κληρονομιές. Ο νομικός έλεγχος διαρκεί εβδομάδες.',url:null},
                {title:'Χρέη σε ΔΟΥ ή ΕΦΚΑ',desc:'Απαιτείται φορολογική και ασφαλιστική ενημερότητα για υπογραφή συμβολαίου.',url:'https://www.aade.gr'},
                {title:'Δείκτης δανείου προς αξία πάνω από 80–90%',desc:'Συνήθως έως 80% (κανονικό) ή 90% (Σπίτι μου ΙΙ). Χρειάζεσαι ίδια κεφάλαια για τη διαφορά και τα έξοδα.',url:null},
              ].sort((a,b)=>a.title.localeCompare(b.title,'el')).map((item,i,a)=>(
                <CatRow key={item.title} title={item.title} desc={item.desc} url={item.url} linkLabel="έλεγχος" last={i===a.length-1}/>
              ))}
            </div>
          </MiniSection>

          {/* Special borrower categories — compact */}
          <MiniSection title="Ειδικές κατηγορίες δανειοληπτών" defaultOpen={profile==='business'}>
            <div style={{display:'flex',flexDirection:'column'}}>
              {[
                {title:'Ένοπλες Δυνάμεις',desc:'ΤΑΠ-ΟΙΚ: επιδοτούμενα στεγαστικά με χαμηλότερο επιτόκιο για εν ενεργεία μέλη.',url:'https://www.tap.gr'},
                {title:'Κάτοικοι εξωτερικού',desc:'Δάνειο έως 55–70% της αξίας. Επίσημες μεταφράσεις, αποδεικτικό κατοικίας, εισοδήματα ξένης χώρας.',url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia'},
                {title:'Νέοι 25–50 ετών',desc:'Σπίτι μου ΙΙ: 50% άτοκο. Εισόδημα άγαμος 25.000€, έγγαμοι 35.000€ +5.000€/τέκνο. Έως 150 τετραγωνικά.',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Ελεύθεροι επαγγελματίες',desc:'Μέσος όρος εισοδήματος διετίας. Δάνειο έως 65–70% της αξίας. Συνέπεια στις δηλώσεις.',url:'https://www.aade.gr'},
                {title:'Πολύτεκνοι και τρίτεκνοι',desc:'+50% επιδότηση επιτοκίου στο Σπίτι μου ΙΙ. Εισόδημα έως 45.000€ (2 παιδιά) ή 50.000€ (3+).',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Εταιρείες και επαγγελματικά',desc:'Ισολογισμοί 3 ετών, απόφαση διοίκησης, προσωπική εγγύηση. Πλήρης έκπτωση τόκων.',url:'https://www.nbg.gr/el/epixeiriseis'},
              ].sort((a,b)=>a.title.localeCompare(b.title,'el')).map((cat,i,a)=>(
                <CatRow key={cat.title} title={cat.title} desc={cat.desc} url={cat.url} linkLabel="περισσότερα" last={i===a.length-1}/>
              ))}
            </div>
          </MiniSection>

          {/* Euribor chart */}
          <MiniSection defaultOpen={profile==='business'} title="Ιστορικό Euribor τριμήνου, 2020 έως σήμερα" meta={<a href="https://data.ecb.europa.eu" target="_blank" rel="noreferrer" style={{fontSize:10.5,color:'var(--accent)',textDecoration:'none',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Πηγή: Ευρωπαϊκή Κεντρική Τράπεζα</a>}>
            <EuriborArea data={EURIBOR_HISTORY}/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',gap:10,marginTop:14}}>
              {[
                {l:'Ιστορικό χαμηλό',v:fmtPct(Math.min(...EURIBOR_HISTORY.map(p=>p.val))),s:'2021'},
                {l:'Ιστορικό υψηλό',v:fmtPct(Math.max(...EURIBOR_HISTORY.map(p=>p.val))),s:'Οκτώβριος 2023'},
                {l:'Τρέχον',v:fmtPct(market.euribor_3m),s:'σήμερα'},
                {l:'Μείωση από το ανώτατο',v:`-${fmtPct(Math.max(...EURIBOR_HISTORY.map(p=>p.val))-market.euribor_3m)}`,s:'από το 2023'},
              ].map(item=>(
                <div key={item.l} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'11px 13px'}}>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.05em',fontWeight:600,fontFamily:"'Inter',sans-serif",marginBottom:6}}>{item.l}</p>
                  <p style={{fontSize:17,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1}}>{item.v}</p>
                  <p style={{fontSize:10.5,color:'var(--text-tertiary)',marginTop:4,fontFamily:"'Inter',sans-serif"}}>{item.s}</p>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif",marginTop:14}}>
              Δάνεια που δόθηκαν το 2021 με Euribor -0,55% έχουν σήμερα πραγματικό επιτόκιο περίπου {fmtPct(market.euribor_3m+1.5)}. Η Ευρωπαϊκή Κεντρική Τράπεζα μείωσε το επιτόκιο 8 φορές από τον Ιούνιο 2024.
            </p>
          </MiniSection>

          {/* Γλωσσάρι — σωστά ελληνικά, καθαρή λίστα ορισμών, ανάλογα με το προφίλ */}
          {/* ── Διαχειριστές (servicers) & κόκκινα δάνεια ── */}
          <MiniSection title="Δάνεια σε διαχειριστές και κόκκινα δάνεια">
            <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7,fontFamily:"'Inter',sans-serif",marginBottom:16}}>{SERVICERS_GUIDE.intro}</p>

            {/* Μαζεμένες σειρές· η επεξήγηση κρύβεται πίσω από ⓘ (όχι κατεβατό). */}
            <p style={{...labelStyle,marginBottom:10}}>Τα δικαιώματά σου</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',gap:6,marginBottom:18}}>
              {SERVICERS_GUIDE.rights.map(r=>(
                <div key={r.t} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{flexShrink:0}} aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                  <span style={{flex:1,minWidth:0,fontSize:12.5,fontWeight:600,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.t}</span>
                  <InfoDot text={r.d}/>
                </div>
              ))}
            </div>

            <p style={{...labelStyle,marginBottom:10}}>Εργαλεία ρύθμισης και προστασίας</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',gap:10,marginBottom:18}}>
              {SERVICERS_GUIDE.tools.map(t=>(
                <div key={t.name} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:14,display:'flex',flexDirection:'column'}}>
                  <p style={{fontSize:13,fontWeight:500,fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',marginBottom:6}}>{t.name}</p>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif",marginBottom:10}}>{t.d}</p>
                  <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                    {t.facts.map((f,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'flex-start',gap:7}}>
                        <span style={{width:5,height:5,borderRadius:'50%',background:'var(--border-default)',flexShrink:0,marginTop:6}}/>
                        <span style={{fontSize:11.5,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <span style={{marginTop:'auto',fontSize:12,fontFamily:"'Inter',sans-serif"}}><InlineLink href={t.url}>Επίσημη πηγή →</InlineLink></span>
                </div>
              ))}
            </div>

            <p style={{...labelStyle,marginBottom:10}}>Προσοχή στα ψιλά γράμματα</p>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
              {SERVICERS_GUIDE.redFlags.map((f,i)=>(
                <div key={i} style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-default)',borderRadius:8}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>{f}</p>
                </div>
              ))}
            </div>

            <p style={{...labelStyle,marginBottom:8}}>Επίσημες πηγές</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',gap:8,marginBottom:12}}>
              {SERVICERS_GUIDE.sources.map(s=>(
                <LinkCard key={s.url} href={s.url} label={s.label} sub={s.sub}/>
              ))}
            </div>
            <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>Ενημερωτικές πληροφορίες με βάση το ισχύον πλαίσιο (Ιούλιος 2026), όχι νομική ή χρηματοοικονομική συμβουλή. Για την περίπτωσή σου συμβουλέψου δικηγόρο ή πιστοποιημένο σύμβουλο αναδιάρθρωσης.</p>
          </MiniSection>

          <MiniSection title="Γλωσσάρι όρων" meta={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{profile==='business'?'Πλήρες':'Βασικοί όροι'}</span>}>
            <Glossary items={[...GLOSSARY.filter(g=>profile==='business'||g.level==='basic')].sort((a,b)=>a.term.localeCompare(b.term,'el'))}/>
            {profile!=='business'&&(
              <p style={{fontSize:11.5,color:'var(--text-tertiary)',marginTop:14,lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>
                Περισσότεροι, πιο εξειδικευμένοι όροι εμφανίζονται στη λειτουργία «Επαγγελματίας», από τις Ρυθμίσεις.
              </p>
            )}
          </MiniSection>

          {/* Links */}
          <MiniSection title="Επίσημες πηγές">
            {[
              {category:'Κρατικά προγράμματα',links:[
                {label:'Σπίτι μου ΙΙ · επίσημη σελίδα',sub:'Αίτηση, κριτήρια, προθεσμία συμβολαίων 31/08/2026',url:'https://greece20.gov.gr/home-loans/'},
                {label:'Αναβαθμίζω το Σπίτι μου',sub:'Ελληνική Αναπτυξιακή Τράπεζα, επίσημη πλατφόρμα',url:'https://hdb.gr/anavathmizo-to-spiti-mou/'},
                {label:'Εξοικονομώ 2025',sub:'Επιδότηση ενεργειακής αναβάθμισης',url:'https://exoikonomo2025.gov.gr/'},
                {label:'Ανακαινίζω και Νοικιάζω · ΟΠΕΚΑ',sub:'40% επιδότηση και εγγυημένο ενοίκιο',url:'https://www.opeka.gr'},
                {label:'Γέφυρα 3 · επιδότηση δόσης',sub:'Για κυμαινόμενα δάνεια ευάλωτων',url:'https://gefyra3.gr'},
              ]},
              {category:'Τράπεζες και επιτόκια',links:[
                {label:'Τράπεζα Ελλάδος · επιτόκια',sub:'Επίσημα μέσα επιτόκια αγοράς',url:'https://www.bankofgreece.gr/el/statistiki/nomismatiki-kai-trapeziki-statistiki/epitokia-katatheseon-kai-daneion'},
                {label:'Σύγκριση επιτοκίων τραπεζών',sub:'Ενημερωμένη σύγκριση όλων των τραπεζών',url:'https://vresdaneio.gr/epitokia/index.html'},
                {label:'e-stegastiko · πλατφόρμα Τράπεζας Ελλάδος',sub:'Επίσημη πλατφόρμα στεγαστικών',url:'https://e-stegastiko.gr'},
                {label:'Τειρεσίας · έλεγχος πιστοληπτικής',sub:'Ελέγξτε αν έχετε εγγραφές πριν αιτηθείτε',url:'https://www.tiresias.gr'},
              ]},
              {category:'Φορολογικά και τίτλοι',links:[
                {label:'ΑΑΔΕ · φορολογικά ακινήτων',sub:'Φόρος μεταβίβασης, ΕΝΦΙΑ, εισοδήματα ενοικίων',url:'https://www.aade.gr/polites/foroi-akiniton'},
                {label:'Κτηματολόγιο · έλεγχος τίτλων',sub:'Ηλεκτρονικός έλεγχος εγγράφων',url:'https://www.ktimatologio.gr'},
                {label:'Επιλεξιμότητα Σπίτι μου ΙΙ · gov.gr',sub:'Ηλεκτρονικός έλεγχος με κωδικούς Taxisnet',url:'https://www.gov.gr/ipiresies/periousia-kai-phorologia/akinhta/elegkhos-epile3imotetas-programmatos-spiti-mou-ii'},
              ]},
              {category:'Χρήσιμα εργαλεία',links:[
                {label:'Ελληνική Αναπτυξιακή Τράπεζα',sub:'Διαχείριση κρατικών προγραμμάτων δανείων',url:'https://hdb.gr'},
                {label:'Υπουργείο Περιβάλλοντος και Ενέργειας',sub:'Ενεργειακά προγράμματα, παρατάσεις, ανακοινώσεις',url:'https://ypen.gov.gr'},
                {label:'Ταμείο Αλληλοβοηθείας Στρατού',sub:'Στεγαστικά για στελέχη Ενόπλων Δυνάμεων',url:'https://www.tap.gr'},
                {label:'Ευρωπαϊκή Κεντρική Τράπεζα · Euribor',sub:'Επίσημα ιστορικά δεδομένα Euribor',url:'https://data.ecb.europa.eu/data/datasets/FM/FM.B.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA'},
              ]},
            ].map(group=>(
              <div key={group.category} style={{marginBottom:16}}>
                <p style={{...labelStyle,marginBottom:8}}>{group.category}</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',gap:8}}>
                  {group.links.map(link=>(
                    <LinkCard key={link.url} href={link.url} label={link.label} sub={link.sub}/>
                  ))}
                </div>
              </div>
            ))}
            <div style={{padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
              <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
                Ενημερωτικές πληροφορίες, δεν αποτελούν χρηματοοικονομική, νομική ή φορολογική συμβουλή.
              </p>
            </div>
          </MiniSection>

          {/* ── Αποθηκευμένα δάνεια — στο τέλος του οδηγού, κάτω από τις πηγές ── */}
          <MiniSection order={8} title="Αποθηκευμένα δάνεια" defaultOpen={saved.length>0}
            meta={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{saved.length>0?`${saved.length} δάνεια`:'Παρακολούθηση υπολοίπου'}</span>}>
            {savedContent}
          </MiniSection>
        </div>
        )}
      </LensPanel>)}

      {toast&&(
        <div style={{position:'fixed',bottom:24,right:24,zIndex:1000,display:'flex',alignItems:'center',gap:9,padding:'11px 16px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,boxShadow:'var(--shadow-lg)',maxWidth:320}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'var(--accent)',display:'inline-block',flexShrink:0}}/>
          <span style={{fontSize:13,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif"}}>{toast}</span>
        </div>
      )}
    </div>
  )
}