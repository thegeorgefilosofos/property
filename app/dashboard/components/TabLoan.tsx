'use client'
import { navLabel } from '@/lib/nav/labels';
import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as expenses from '@/lib/data/expenses'
import * as loanStore from '@/lib/data/loans'
import * as calendar from '@/lib/data/calendar'
import { must } from '@/lib/supabase/must'
import { saved } from '@/components/dbWrite'
import { toLoanRow } from '@/lib/loans/shape'
import { fp, fe } from '@/lib/core/format'
import { fdLong, ABSENT } from '@/components/tokens'
import { loanProgress } from '@/lib/loans/progress'
import { AADE_HOME } from '@/lib/tax/aade'
import { programStatus, programDateLabel, PROGRAM_ORDER } from '@/lib/loans/programStatus'
import { T, ExportButton, EmptyState, fixedCols, Bar, Tile, widestOf } from '@/components/Theme'
import { loanEventTitle, UNSET_BANK } from './TabCalendar'
import { notifyOk, notifyError } from '@/components/Toast'
import { confirmDialog } from '@/components/confirmBus'
import { Gift } from 'lucide-react'
import { downloadXlsx } from './sheets';
import TabLoanCalculator, { type LoanCalcState } from './TabLoanCalculator'
import { useMarketRates, useBankRates, useLoanPrograms, useIsAdmin, useMarketFeedHealth } from '../../hooks/useMarketData'
import { greekWhen, seriesPage, ECB_SERIES } from '@/lib/market/ecb'
import { BANKS_NORM, PROGRAMS_NORM, mergeBanks, mergePrograms, BANKS_VERIFIED, RATES_DISCLAIMER, type ComparisonBank, type ComparisonProgram, LOAN_TYPES, rateRange, GLOSSARY, EURIBOR_HISTORY, SERVICERS_GUIDE, calcMonthly, fmtEur, fmtPct, LoanType, RateType, SavedLoan, MARKET_FALLBACK } from './TabLoanData'
import { rankLoans, spitiMouEligibility, type UserLoanNeeds } from '@/lib/loans/recommend'
import { euriborInsight } from '@/lib/loans/affordability'
import LoanDocScan, { type AppliedLoan } from './LoanDocScan'
import Glossary from './Glossary'
import SpitiMouPanel from './SpitiMouPanel'
import ApprovalPanel from './ApprovalPanel'
import EsisScanPanel from './EsisScanPanel'
import BankRatesAdmin from './BankRatesAdmin'
import { InfoDot, InfoChip } from './UIComponents'
import { LensBar, labelStyle, cardStyle, panelStyle } from './LoanShared'
import { athensToday, isoDate } from '@/lib/core/time';
import { MONTHS_SHORT } from '@/lib/core/months';
import { failed } from '@/lib/core/dbError';
import { grDate } from '@/lib/core/format'
import { useChartWidth } from '@/app/hooks/useChartWidth'

// Μορφοποίηση επιτοκίων ως κείμενο: κόμμα δεκαδικό και σωστή παύλα εύρους (–),
// π.χ. «2.40-4.70» → «2,40–4,70». Καθαρά ελληνικά, χωρίς πρόχειρες παύλες.
// Πρώτος αριθμός (επιτόκιο «από») ενός εύρους ή μονής τιμής → number.
const rateNum = (v:unknown):number|null => { const m = String(v ?? '').match(/-?\d+[.,]?\d*/); return m ? parseFloat(m[0].replace(',','.')) : null }
// Κελί πίνακα/κάρτας: ενιαία μορφή, από τον ΕΝΑ μορφοποιητή της εφαρμογής.
// Εδώ ζούσε τρίτος τοπικός («n.toFixed(2).replace»), που έβγαζε το ίδιο
// αποτέλεσμα με το fp() για τιμές κάτω από χίλια και διαφορετικό από πάνω.
const NO_RATE = 'Χωρίς στοιχεία'

// ── ΤΑ ΒΑΣΙΚΑ ΣΤΟΙΧΕΙΑ ΕΝΟΣ ΠΡΟΓΡΑΜΜΑΤΟΣ ───────────────────────────────────
// Ήταν πίνακας από `συνθήκη && [ετικέτα, τιμή, χρώμα, μέγεθος]` με `filter(Boolean)`
// και ανάγνωση με δείκτες (`item[3]`). Ο μεταγλωττιστής δεν μπορούσε να ξέρει
// ότι μετά το φιλτράρισμα δεν μένουν ψευδείς τιμές και το `item[3]` δεν έχει
// όνομα: μια μετατόπιση θέσης θα άλλαζε αθόρυβα το μέγεθος με το χρώμα.
interface ProgramFact { label: string; value: string; color: string; size: number }

function programFacts(p: ComparisonProgram): ProgramFact[] {
  const facts: ProgramFact[] = []
  const add = (label: string, value: string, color: string, size: number) => facts.push({ label, value, color, size })
  if (p.maxAmount) add('Μέγιστο ποσό', fmtEur(p.maxAmount), 'var(--text-primary)', 16)
  if (p.maxLtv)    add('Μέγιστο δάνειο προς αξία', fp(p.maxLtv), 'var(--text-primary)', 14)
  if (p.maxSqm)    add('Μέγιστα τ.μ.', `${p.maxSqm} τ.μ.`, 'var(--text-primary)', 12)
  if (p.ageMax)    add('Ηλικία δικαιούχου', `${p.ageMin}–${p.ageMax} ετών`, 'var(--text-primary)', 12)
  if (p.duration)  add('Διάρκεια', p.duration, 'var(--text-secondary)', 12)
  if (p.deadline)  add('Προθεσμία', grDate(p.deadline), 'var(--text-primary)', 13)
  if (p.totalBudget) add('Προϋπολογισμός', p.totalBudget, 'var(--text-primary)', 13)
  return facts
}
const cellRate = (v:unknown):string => { const n = rateNum(v); return n===null ? NO_RATE : fp(n) }

// Επικεφαλίδα ενεργού φακού — ο τίτλος τον οποίο το LensBar έχει επιλέξει.
// ══ Ο ΤΙΤΛΟΣ ΤΟΥ ΦΑΚΟΥ ΓΡΑΦΟΤΑΝ ΔΥΟ ΦΟΡΕΣ, ΣΕ ΑΠΟΣΤΑΣΗ ΔΕΚΑ ΕΙΚΟΝΟΣΤΟΙΧΕΙΩΝ
//
// Η μπάρα από πάνω δείχνει ΗΔΗ ποιος φακός είναι ανοιχτός: το κουμπί είναι
// φωτισμένο, με έντονα γράμματα και δικό του φόντο. Αμέσως από κάτω το πάνελ
// ξανάγραφε τις ίδιες λέξεις ως επικεφαλίδα — «Το δάνειό σου» πάνω από «Το
// δάνειό σου», «Οδηγός» πάνω από «Οδηγός δανείου». Η επιλογή που μόλις έκανε ο
// χρήστης δεν χρειάζεται επιβεβαίωση σε δεύτερη γραμμή.
//
// Ο ΥΠΟΤΙΤΛΟΣ ΜΕΝΕΙ, ΓΙΑΤΙ ΛΕΕΙ ΚΑΤΙ ΑΛΛΟ: «Βάσει 148.000,00 € / 25 χρόνια, από
// τον Υπολογιστή» ή «7 τράπεζες, επιβεβαιωμένα 08/07/2026». Αυτό δεν το λέει η
// μπάρα και είναι ο λόγος που ο αναγνώστης εμπιστεύεται ό,τι ακολουθεί.
//
// Ο τίτλος μένει στον τύπο και πηγαίνει στον αναγνώστη οθόνης: η μπάρα δίνει
// `aria-pressed`, όχι επικεφαλίδα, οπότε χωρίς αυτόν η περιοχή θα ήταν ανώνυμη
// στην πλοήγηση ανά επικεφαλίδα.
function LensPanel({title,subtitle,right,children}:{title:string;subtitle?:string;right?:React.ReactNode;children:React.ReactNode}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}} aria-label={title} role="group">
      {(subtitle||right)&&(
      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'2px 2px 0'}}>
        {subtitle
          ? <p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,minWidth:0}}>{subtitle}</p>
          : <span/>}
        {right}
      </div>
      )}
      {children}
    </div>
  )
}

// Πτυσσόμενη υπο-ενότητα — premium, διακριτική· ο τίτλος και προαιρετικά
// badges/meta μένουν ορατά, οι λεπτομέρειες ανοίγουν με κλικ (όχι ατέρμονες λίστες).
// ΕΛΕΓΧΟΜΕΝΗ Η ΑΥΤΟΝΟΜΗ. Οι περισσότερες ενότητες κρατούν μόνες τους το άνοιγμά
// τους· μία όμως πρέπει να ανοίγει και απο ΑΛΛΟΥ (ο «Οδηγός» στέλνει στα
// «Απαραίτητα έγγραφα», που ζουν μέσα στον Υπολογιστή). Οταν δίνεται `open`,
// η κατάσταση ανήκει στον γονέα — ίδιο ιδίωμα με το Foldable του ΕΝΦΙΑ.
function MiniSection({title,badges,meta,defaultOpen,order,flat,open:openProp,onToggle,children}:{title:string;badges?:React.ReactNode;meta?:React.ReactNode;defaultOpen?:boolean;order?:number;flat?:boolean;open?:boolean;onToggle?:(v:boolean)=>void;children:React.ReactNode}) {
  const [openOwn,setOpenOwn] = useState(!!defaultOpen)
  const open = openProp ?? openOwn
  const setOpen = (fn:(o:boolean)=>boolean) => { const next = fn(open); onToggle ? onToggle(next) : setOpenOwn(next) }
  // flat: χωρίς περίγραμμα/φόντο — για ένθετες ενότητες, ώστε να μη διπλασιάζεται το πλαίσιο.
  return (
    <div style={flat
      ? {order,borderTop:'1px solid var(--border-subtle)'}
      : {order,...panelStyle,border:`1px solid ${open?'var(--border-default)':'var(--border-raised)'}`,transition:'border-color 0.2s'}}>
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:flat?'13px 2px':'15px 18px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flexWrap:'wrap'}}>
          <span style={{fontSize:flat?13:14.5,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.sans,letterSpacing:'-0.01em'}}>{title}</span>
          {badges}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
          {meta}
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>
      {open&&<div style={{padding:flat?'0 2px 6px':'0 18px 18px'}}>{children}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΓΡΑΜΜΗ ΕΥΡΗΜΑΤΟΣ, ΚΑΙ ΤΟ ΤΕΤΑΡΤΟ ΠΛΑΙΣΙΟ ΦΕΥΓΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Τέσσερις λίστες αυτής της καρτέλας έλεγαν το ίδιο πράγμα με τέσσερα σχήματα:
// «Στρατηγική ανά προφίλ», «Τι βλέπω στο σενάριό σου», «Επιλεξιμότητα κρατικών
// προγραμμάτων» και «Τι μπορείς να βελτιώσεις». Καθεμιά έφτιαχνε ΔΙΚΟ ΤΗΣ κουτί
// μέσα στο κουτί της ενότητας, που ζει μέσα στο κουτί του φακού: τρία
// περιγράμματα για να διαβαστεί μία πρόταση.
//
// ΚΑΙ ΤΟ 3px ΑΡΙΣΤΕΡΟ ΠΕΡΙΘΩΡΙΟ ΔΕΝ ΣΗΜΑΙΝΕ ΤΙΠΟΤΑ. Ηταν στο ΙΔΙΟ χρώμα με το
// υπόλοιπο περίγραμμα, δηλαδή μια αριστερή ακμή λίγο πιο χοντρή — και μπήκε σε
// δύο από τις τέσσερις σειρές της ίδιας λίστας, όχι στις άλλες δύο. Οταν ένα
// στοιχείο ύφους εμφανίζεται άλλοτε ναι και άλλοτε όχι μέσα στην ίδια λίστα,
// δεν είναι έμφαση: είναι απροσεξία και τη βλέπει ο χρήστης.
//
// Μένει λεπτή γραμμή ανάμεσα, το ίδιο ιδίωμα με τα υπόλοιπα εργαλεία.
// ═══════════════════════════════════════════════════════════════════════════
function FindingRow({lead,title,body,right,last}:{lead?:React.ReactNode;title:React.ReactNode;body?:React.ReactNode;right?:React.ReactNode;last?:boolean}) {
  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 0',borderBottom:last?'none':'1px solid var(--border-subtle)'}}>
      {lead}
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily: T.font.sans,color:'var(--text-primary)',lineHeight:1.45}}>{title}</p>
        {/* ΚΑΜΙΑ ΜΟΝΗ ΛΕΞΗ ΣΕ ΔΕΥΤΕΡΗ ΓΡΑΜΜΗ. Το κείμενο έσπαγε αφήνοντας το
            «τόκους.» ολομόναχο από κάτω: μια σχεδόν άδεια γραμμή που κάνει τη
            σειρά να φαίνεται δύο φορές ψηλότερη απ' όσο χρειάζεται. Το
            `pretty` μοιράζει τις τελευταίες δύο γραμμές ώστε να μη μένει
            ορφανή λέξη, χωρίς να κόψει τίποτα από το νόημα. */}
        {body&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans,marginTop:3,textWrap:'pretty' as const}}>{body}</p>}
      </div>
      {right}
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
        <span style={{fontSize: 'var(--fs-base)',fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)',minWidth:0}}>{title}</span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{flexShrink:0,transform:open?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open&&(
        <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans,padding:'0 2px 12px'}}>{desc}{url&&<> <InlineLink href={url}>{linkLabel}</InlineLink></>}</p>
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
      style={{display:'inline-flex',alignItems:'center',gap:6,padding:'0 16px',height:T.h.md,borderRadius: T.radius.modal,
        background:h?'var(--accent-dim)':'var(--bg-surface)',border:`1px solid ${h?'var(--border-accent)':'var(--border-subtle)'}`,
        color:h?'var(--accent)':'var(--text-secondary)',fontSize: 'var(--fs-base)',fontFamily: T.font.sans,textDecoration:'none',fontWeight:600,
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
        <p style={{fontSize: 'var(--fs-base)',color:h?'var(--accent)':'var(--text-primary)',fontWeight:500,fontFamily: T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',transition:'color 0.15s'}}>{label}</p>
        {sub&&<p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:2,fontFamily: T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</p>}
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={h?'var(--accent)':'var(--text-tertiary)'} strokeWidth="2" style={{flexShrink:0,transition:'stroke 0.15s'}} aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </a>
  )
}

// Bespoke minimal γράφημα Euribor — καθαρή περιοχή/γραμμή, σημεία υψηλού/χαμηλού
// και τρέχοντος, χωρίς βιβλιοθήκη. Επαγγελματικό, ήσυχο, χωρίς θόρυβο.
const euFmtDate=(d:string)=>{ const [y,m]=d.split('-'); return `${MONTHS_SHORT[(Number(m)||1)-1]} ${y}` }
function EuriborArea({data}:{data:{date:string;val:number}[]}) {
  const [hi,setHi]=useState<number|null>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const [svgRef,W]=useChartWidth(620)
  const H=160,padL=6,padR=10,padT=18,padB=22
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
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{display:'block'}} role="img" aria-label="Ιστορική πορεία Euribor τριμήνου, διαδραστικό">
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
          <text x={X(maxI)} y={Y(maxV)-7} textAnchor="middle" style={{fontSize: 'var(--fs-xs)',fontFamily: T.font.sans,fill:'var(--text-secondary)',fontWeight:600}}>{fp(maxV)}</text>
          <circle cx={X(minI)} cy={Y(minRaw)} r="3" fill="var(--text-tertiary)" stroke="var(--bg-elevated)" strokeWidth="1.5"/>
          <text x={X(minI)} y={Y(minRaw)+13} textAnchor="middle" style={{fontSize: 'var(--fs-xs)',fontFamily: T.font.sans,fill:'var(--text-tertiary)'}}>{fp(minRaw)}</text>
        </>)}
        {/* Τρέχον σημείο (ζωντανό) */}
        <circle cx={X(n-1)} cy={Y(vals[n-1])} r="4" fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth="2"/>
        {hi!=null&&(<g>
          <line x1={X(hi)} y1={padT-6} x2={X(hi)} y2={Y(minV)} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.5"/>
          <circle cx={X(hi)} cy={Y(vals[hi])} r="4.5" fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth="2"/>
        </g>)}
        {yearTicks.map(t=>(<text key={t.yr} x={X(t.i)} y={H-6} textAnchor={t.i===0?'start':'middle'} style={{fontSize: 'var(--fs-xs)',fontFamily: T.font.sans,fill:hi!=null&&data[hi].date.slice(0,4)===t.yr?'var(--accent)':'var(--text-tertiary)',fontWeight:hi!=null&&data[hi].date.slice(0,4)===t.yr?700:400}}>{t.yr}</text>))}
      </svg>
      {hi!=null&&(
        <div style={{position:'absolute',top:0,left:`${leftPct}%`,transform:'translateX(-50%)',pointerEvents:'none',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:'7px 12px',boxShadow:'var(--shadow-lg)',whiteSpace:'nowrap' as const,textAlign:'center' as const}}>
          <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginBottom:3,fontFamily: T.font.sans}}>{euFmtDate(data[hi].date)}</p>
          <p style={{fontSize:15,color:'var(--accent)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',fontWeight:700,lineHeight:1}}>{fp(vals[hi])}</p>
        </div>
      )}
    </div>
  )
}

// Ο τύπος ζει εκεί που παράγεται η τιμή (TabLoanCalculator). Εδώ υπήρχε δεύτερη
// δήλωση του ίδιου σχήματος, με ένα πεδίο λιγότερο: ο υπολογιστής στέλνει και
// `propType`/`area`, που αυτή η δήλωση δεν ήξερε — και επειδή η άλλη πλευρά ήταν
// `any`, κανείς δεν το έμαθε ποτέ.
type CalcState = LoanCalcState;

// Το `propertyRent` έφυγε από τα props: περνούσε από το page.tsx και δεν
// χρησιμοποιούνταν ποτέ — ένα νεκρό καλώδιο που έδινε την εντύπωση ότι ο
// Υπολογιστής ξέρει το ενοίκιο, ενώ αυτός υπολόγιζε «4% της αξίας». Πλέον ο
// Υπολογιστής διαβάζει ο ίδιος το πραγματικό ενοίκιο (rent_config) από τη βάση.
export default function TabLoan({propertyId,userId,propertyValue,propertySqm,propertyYearBuilt,profileType='individual'}:{propertyId:string;userId:string;propertyValue?:number;propertySqm?:number;propertyYearBuilt?:number;profileType?:'individual'|'professional'}) {
  const supabase = createClient()
  // Πραγματικά στοιχεία του ακινήτου του χρήστη (αντί για γενικές προεπιλογές).
  const initValue  = propertyValue && propertyValue > 0 ? Math.round(propertyValue) : 200000
  const initAmount = propertyValue && propertyValue > 0 ? Math.round(propertyValue * 0.8) : 150000
  // Ενοποιημένη ροή: ένας υπολογιστής στην κορυφή + έξυπνες πτυσσόμενες ενότητες.
  // Μία ανοιχτή τη φορά, ώστε να παραμένει καθαρό — όχι «σούπερ μάρκετ» με καρτέλες.
  type LoanSection = 'advisor'|'banks'|'programs'|'guide'
  // Τα κλειδιά δηλώνονται ΜΙΑ φορά και ως κλειδιά του τύπου: ένα λάθος όνομα
  // στήλης σταματά στη μεταγλώττιση αντί να βγει ως κενό κελί.
  const FIXED_TERM_COLUMNS = ['fixed_3yr','fixed_5yr','fixed_10yr','fixed_15yr','fixed_20yr'] as const satisfies readonly (keyof ComparisonBank)[]
  const [openSec,setOpenSec] = useState<LoanSection>('advisor')
  // Το προφίλ ακολουθεί την καθολική ρύθμιση της εφαρμογής (Ρυθμίσεις → τύπος
  // προφίλ). ΜΙΑ πηγή αλήθειας — χωρίς διπλό διακόπτη μέσα στην καρτέλα.
  const profile: 'individual'|'business' = profileType==='professional' ? 'business' : 'individual'
  // Οι ενότητες του οδηγού εμφανίζονται με τη σειρά που γράφονται (DOM = οπτική
  // σειρά). Δεν χρησιμοποιούμε flex «order» — προκαλούσε ασυμφωνία DOM/διάταξης
  // και το scroll «πηδούσε» προς τα πάνω κατά το άνοιγμα μιας ενότητας.
  const calcRef = useRef<HTMLDivElement>(null)
  const scrollToCalc = ()=>calcRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  // Ο φακός του Υπολογιστή. Ζει εδώ και όχι μέσα του, γιατί ο «Οδηγός» της
  // Συμβουλευτικής παραπέμπει στα «Απαραίτητα έγγραφα» — και μια παραπομπή που
  // δεν μπορεί να ανοίξει τον προορισμό της είναι κείμενο, όχι διαδρομή.
  const [calcLens,setCalcLens] = useState('amort')
  const lensRef = useRef<HTMLDivElement>(null)
  // Ανοιχτός εξ ορισμού· κλείνει μόνο όταν φορτωθεί αποθηκευμένο δάνειο (πιο κάτω).
  const [calcOpen,setCalcOpen] = useState(true)
  const openCalcDocs = ()=>{
    // Ο Οδηγός μπορεί να στείλει εδώ ενώ ο Υπολογιστής είναι διπλωμένος: πρώτα
    // ανοίγει η ενότητα, αλλιώς ο φακός δεν έχει πού να εμφανιστεί.
    setCalcOpen(true)
    setCalcLens('table')
    requestAnimationFrame(()=>lensRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))
  }
  // Εφαρμογή επιτοκίου τράπεζας στον Υπολογιστή (μέσω του καναλιού «applied»· η
  // σφραγίδα έκδοσης εξασφαλίζει ότι εφαρμόζεται ακόμη κι αν ξαναπατηθεί η ίδια τιμή).
  // Προσοχή: για ΚΥΜΑΙΝΟΜΕΝΟ, ο Υπολογιστής περιμένει το ΠΕΡΙΘΩΡΙΟ (spread), όχι το
  // πλήρες επιτόκιο (effRate = Euribor + spread). Η σύσταση δίνει το πλήρες επιτόκιο,
  // οπότε αφαιρούμε το Euribor ώστε να μη μετρηθεί δύο φορές (όπως κάνει και το applyScen).
  const applyBank = (rate:number, rt:RateType, bankName?:string)=>{
    const eur = market.euribor_3m || MARKET_FALLBACK.euribor_3m
    const applyRate = rt==='variable' ? Math.max(0, Number((rate - eur).toFixed(2))) : rate
    setAppliedLoan({ v: Date.now(), rate:applyRate, rateType:rt })
    if(bankName) notifyOk(`Εφαρμόστηκε το επιτόκιο: ${bankName}`)
    scrollToCalc()
  }
  // Ονομάζεται `savedLoans`: το `saved` ανήκει πια στον βοηθό που ελέγχει αν ένα
  // γράψιμο πέτυχε και δύο πράγματα δεν μοιράζονται ένα όνομα.
  const [savedLoans,setSaved] = useState<SavedLoan[]>([])
  const [filterSpiti,setFS] = useState(false)
  const [selBank,setSelBank] = useState<string|null>(null)
  const [appliedLoan,setAppliedLoan] = useState<AppliedLoan|undefined>(undefined)
  const [recHover,setRecHover] = useState(false)
  const [applyHover,setApplyHover] = useState(false)
  const [scoreHover,setScoreHover] = useState(false)
  const [otherHover,setOtherHover] = useState<string|null>(null)
  const [hoverBank,setHoverBank] = useState<string|null>(null)
  const [hoverBankRow,setHoverBankRow] = useState<number|null>(null)
  // Ξεκινά «true»: πριν, η καρτέλα έδειχνε ΤΙΠΟΤΑ όσο έτρεχε η loadSaved και μετά
  // αναβόσβηνε για μια στιγμή η κενή κατάσταση «δεν υπάρχουν δάνεια», σαν να μην
  // είχε αποθηκεύσει ποτέ τίποτα ο χρήστης.
  const [loadingSaved,setLoadingSaved] = useState(true)

  const market      = useMarketRates()
  const {banks:liveBanks,loading:banksLoading,verifiedAt,health:feed,reload:reloadBanks} = useBankRates()
  const {programs:livePrograms }   = useLoanPrograms()
  const {isAdmin} = useIsAdmin()
  // Ρωτιέται ΜΟΝΟ όταν ο χρήστης είναι διαχειριστής: κανένα περιττό αίτημα
  // στη βάση για τους υπόλοιπους, που ούτως ή άλλως δεν θα έβλεπαν τίποτα.
  const feedHealth = useMarketFeedHealth(isAdmin)

  // Ζωντανά ή εφεδρικά, περνούν από την ΙΔΙΑ κανονικοποίηση. Πριν, τα ζωντανά
  // πήγαιναν κατευθείαν στην οθόνη με άλλα ονόματα πεδίων από τα εφεδρικά και
  // η απόδοση τα γεφύρωνε με `||` και `as any` σε δώδεκα σημεία.
  // Και ό,τι λείπει από τη ζωντανή γραμμή έρχεται από τον κατάλογο: «όλο ή
  // τίποτα» έσβηνε την προθεσμία αίτησης του «Σπίτι μου ΙΙ» και η οθόνη πήρε
  // την προθεσμία υπογραφής στη θέση της. Ο λόγος γράφεται στο TabLoanData.
  const BANKS: ComparisonBank[]       = liveBanks.length    ? mergeBanks(liveBanks)       : BANKS_NORM
  const PROGRAMS: ComparisonProgram[] = livePrograms.length ? mergePrograms(livePrograms) : PROGRAMS_NORM

  const [calcState,setCalcState] = useState<CalcState>({
    loanType:'purchase',borrowerType:'individual',loanAmount:initAmount,
    years:25,rateType:'fixed',effectiveRate:3.5,
    monthly:calcMonthly(initAmount,3.5,25),totalInterest:0,propertyValue:initValue,
  })

  useEffect(()=>{loadSaved()},[propertyId])

  async function loadSaved(){
    try{
      const rows = await loanStore.ofProperty(supabase,propertyId,userId) as SavedLoan[]
      setSaved(rows)
      // ΟΠΟΙΟΣ ΕΧΕΙ ΔΑΝΕΙΟ ΔΕΝ ΨΑΧΝΕΙ ΔΑΝΕΙΟ. Ο υπολογιστής αγοράς κλείνει —
      // δεν φεύγει. Γίνεται εδώ και όχι με αρχική τιμή του `useState`, γιατί το
      // αν υπάρχει δάνειο το μαθαίνουμε ΜΕΤΑ τη φόρτωση· ένα `useState(!rows)`
      // θα ήταν πάντα ανοιχτό στο πρώτο render και θα «πηδούσε» κλείνοντας.
      if(rows.length > 0) setCalcOpen(false)
    } finally { setLoadingSaved(false) }
  }
  async function handleSaveLoan(loan:Partial<SavedLoan>){
    // ΤΟ ΜΗΝΥΜΑ ΕΠΙΤΥΧΙΑΣ ΗΤΑΝ ΨΕΜΑ. Το insert έγραφε `amount`, `rate`,
    // `loan_type`, `status`, `property_value` — πέντε στήλες που δεν υπήρχαν —
    // και το αποτέλεσμα δεν ελεγχόταν ποτέ. Ο χρήστης καταχωρούσε δάνειο,
    // έβλεπε «Το δάνειο αποθηκεύτηκε» και δεν αποθηκευόταν τίποτα.
    // Τώρα: μετάφραση στις πραγματικές στήλες (toLoanRow) και `must`, ώστε η
    // αποτυχία να φτάνει στο catch που ήδη περιβάλλει την κλήση.
    try {
      await must(loanStore.add(supabase,propertyId,userId,toLoanRow(loan)))
    } catch (e) {
      notifyError(failed('Το δάνειο δεν αποθηκεύτηκε', e))
      return
    }
    await loadSaved()
    // Αυτόματη προσυμπλήρωση των δόσεων στο Ημερολόγιο, ανά ημέρα πληρωμής,
    // εφόσον το δάνειο είναι ενεργό — ώστε να συμψηφίζεται με το υπόλοιπο app.
    const active = (loan.status ?? 'active') === 'active'
    if(active && loan.amount && loan.rate && loan.years){
      const monthly = calcMonthly(loan.amount, loan.rate, loan.years)
      const start = loan.start_date || athensToday()
      await handleSaveCal(monthly, loan.years, start, loan.bank || '', loan.amount, true)
      notifyOk('Το δάνειο αποθηκεύτηκε και οι δόσεις προστέθηκαν στο Ημερολόγιο')
    } else {
      notifyOk('Το δάνειο αποθηκεύτηκε')
    }
  }
  async function handleSaveCal(monthly:number,years:number,startDate:string,bankName:string,loanAmount?:number,silent=false){
    const d=new Date(startDate),events:calendar.EventDraft[]=[]
    const n=Math.min(years*12,60)
    // Ξεχωριστή, ιδιότυπη πηγή ανά τράπεζα → idempotent (δεν διπλογράφεται στο
    // ξαναπάτημα, ούτε μπερδεύεται με χειροκίνητα γεγονότα). Ρητές δόσεις, όχι
    // recurring, ώστε να μη διπλασιάζονται από την ανάπτυξη επαναλαμβανόμενων.
    // Ίδιο κλειδί πηγής και ίδιος τίτλος με τη γεννήτρια του Ημερολογίου: αν
    // αποκλίνουν, οι δύο δρόμοι φτιάχνουν ΔΥΟ σειρές για το ίδιο δάνειο.
    const src='loan_schedule:'+((bankName.trim()===UNSET_BANK?'':bankName.trim())||'γενικό').toLowerCase().replace(/\s+/g,'_').slice(0,40)
    const title=loanEventTitle(bankName)
    // Οι σημειώσεις κρατούν ποιο δάνειο και τι ποσό, για συμψηφισμό/αναγνώριση.
    const note=`Δόση ${fmtEur(monthly)} τον μήνα${loanAmount?` · Δάνειο ${fmtEur(loanAmount)}`:''}${bankName?` · ${bankName}`:''}`
    for(let i=0;i<n;i++){
      // Ίδιο σφάλμα με τις προτάσεις: τοπικά μεσάνυχτα σε UTC = χθες. Οι δόσεις
      // έμπαιναν στο ημερολόγιο μία μέρα ΝΩΡΙΤΕΡΑ από την πραγματική τους.
      const ev=new Date(d.getFullYear(),d.getMonth()+i+1,d.getDate())
      events.push({title,category:'financial',event_date:isoDate(ev),amount:Math.round(monthly),priority:'high',notes:note})
    }
    // Οι δόσεις γράφονται πρώτα και οι παλιές σβήνονται μετά: αν σπάσει κάτι στη
    // μέση, το ημερολόγιο δείχνει διπλά, όχι μισό δάνειο.
    if(!await saved('Οι δόσεις δεν αποθηκεύτηκαν στο ημερολόγιο',calendar.replaceSource(supabase,{propertyId,userId},{source:src},events))) return
    if(!silent) notifyOk(`${n} δόσεις αποθηκεύτηκαν στο Ημερολόγιο`)
  }
  async function handleSaveExp(monthly:number,bankName:string){
    if(!await saved('Η δόση δεν καταχωρήθηκε στις δαπάνες',expenses.insert(supabase,[expenses.row({propertyId,userId},{description:`Δόση δανείου${bankName?`, ${bankName}`:''}`,amount:Math.round(monthly),category:'Δόση Δανείου',date:athensToday()})]))) return
    notifyOk('Δόση καταχωρήθηκε στις Δαπάνες')
  }
  async function deleteLoan(id:string){
    if(!(await confirmDialog('Διαγραφή δανείου;',{tone:'negative'})))return
    if(!await saved('Το δάνειο δεν διαγράφηκε',loanStore.remove(supabase,id))) return
    await loadSaved()
  }

  const banksUpdStr = new Date(verifiedAt || BANKS_VERIFIED).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'})
  // Έντιμη φρεσκάδα: τα ανά-τράπεζα επιτόκια είναι επαληθευμένα δεδομένα με
  // ημερομηνία (όχι αυτόματη ροή). Αν παλιώσουν, το λέμε καθαρά και παραπέμπουμε
  // στην πηγή, αντί να δίνουμε ψευδή εντύπωση «ζωντανών» τιμών.
  const banksAgeDays = Math.floor((Date.now() - new Date(verifiedAt || BANKS_VERIFIED).getTime())/86400000)
  // ═══ «ΕΛΕΓΧΘΗΚΑΝ ΣΗΜΕΡΑ» ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ «ΑΛΛΑΞΑΝ ΣΗΜΕΡΑ» ═════════
  // Η οθόνη έγραφε «επιβεβαιώθηκαν πριν από 56 ημέρες» επειδή το verified_at
  // ήταν η μόνη πληροφορία που είχε. Τώρα η τροφοδοσία τρέχει κάθε μέρα και
  // αφήνει ίχνος (bank_feed_health): αν έτρεξε τις τελευταίες 36 ώρες και
  // πέτυχε, τα επιτόκια ΕΛΕΓΧΘΗΚΑΝ — και η ημερομηνία που δείχνουμε είναι
  // πότε επιβεβαιώθηκαν, όχι πότε τα κοίταξε τελευταία κάποιος.
  const feedFresh = feed.checked && feed.ok && feed.hoursSilent != null && feed.hoursSilent <= 36
  const feedCheckedStr = feed.lastOk ? new Date(feed.lastOk).toLocaleDateString('el-GR',{day:'2-digit',month:'short'}) : ''
  const banksStale = !feedFresh && banksAgeDays > 45
  // Μία πηγή αλήθειας: η ανάλυση αντλεί απευθείας τα στοιχεία του Υπολογιστή
  // (χωρίς διπλά πεδία ποσού/διάρκειας/σκοπού).
  /**
   * Το δημοσιευμένο επιτόκιο της τράπεζας, ή null αν ΔΕΝ έχει δημοσιεύσει.
   *
   * ΓΙΑΤΙ null ΚΑΙ ΟΧΙ 3,5%: ο κώδικας είχε `|| 3.5` ως έσχατο δίχτυ. Αυτό
   * σήμαινε ότι τράπεζα χωρίς δημοσιευμένο επιτόκιο εμφάνιζε «Εκτιμώμενη δόση»
   * υπολογισμένη σε ΕΠΙΝΟΗΜΕΝΟ επιτόκιο — με το όνομα της τράπεζας από πάνω.
   * Δεν είναι πρόχειρη εκτίμηση· είναι αριθμός που αποδίδεται σε πραγματικό
   * ίδρυμα και μπορεί να κρίνει πού θα πάει ο χρήστης να δανειστεί.
   */
  type RateSource = { fixed_min?: unknown; fixed_5yr?: unknown; fixed_3yr?: unknown };
  const publishedRate = (bank: RateSource): number | null => {
    for (const r of [bank.fixed_min, bank.fixed_5yr, bank.fixed_3yr]) {
      const n = typeof r === 'number' ? r : parseFloat(String(r ?? ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const advType = calcState.loanType
  const advBorr = calcState.borrowerType
  const LA = calcState.loanAmount || 150000
  const Y  = calcState.years || 25
  // Ταξινόμηση προγραμμάτων: πρώτα όσα λήγουν σύντομα, μετά κατά ημερομηνία
  // λήξης (πλησιέστερη πρώτη) και τέλος κατά σημαντικότητα (Σπίτι μου ΙΙ ψηλά).
  // Μόνο το «Σπίτι μου ΙΙ» θεωρείται κορυφαίας σημασίας — όχι το «Αναβαθμίζω το
  // Σπίτι μου», που περιέχει επίσης τη φράση. Γι' αυτό αγκυρώνουμε στην αρχή.
  const isSpitiMou2 = (name?:string) => /^\s*σπίτι μου/i.test(name||'')

  // ── Η ΣΕΙΡΑ ΚΑΙ Η ΚΑΤΑΣΤΑΣΗ ΒΓΑΙΝΟΥΝ ΑΠΟ ΤΟ ΗΜΕΡΟΛΟΓΙΟ ──────────────────
  // Πριν, η ταξινόμηση ξεκινούσε από το χειρόγραφο `deadline_urgent`: ένα
  // πρόγραμμα με ξεχασμένη σημαία καθόταν πρώτο στη λίστα αφότου είχε κλείσει.
  // Τώρα ό,τι δέχεται αίτηση ΣΗΜΕΡΑ ανεβαίνει και ό,τι έκλεισε πέφτει.
  const today = useMemo(()=>new Date(),[])
  const progStatus = useMemo(()=>{
    const m = new Map<string, ReturnType<typeof programStatus>>()
    for(const p of PROGRAMS) m.set(p.id, programStatus(
      { applicationDeadline: p.applicationDeadline, deadline: p.deadline, status: p.status }, today))
    return m
  },[PROGRAMS, today])
  const stateOf = (p:ComparisonProgram) => progStatus.get(p.id) ?? programStatus({ status: p.status }, today)
  // ΤΟ «4 ΕΝΕΡΓΑ» ΗΤΑΝ ΤΟ ΠΛΗΘΟΣ ΟΛΩΝ ΤΩΝ ΓΡΑΜΜΩΝ. Ο υπότιτλος μετρούσε το
  // μήκος του πίνακα και το ονόμαζε «ενεργά», ενώ ο ίδιος πίνακας περιέχει και
  // όσα έχουν κλείσει — και οι κάρτες από κάτω το έγραφαν σωστά, μία μία. Η
  // κεφαλίδα διαφωνούσε με το περιεχόμενό της.
  const openPrograms = useMemo(() => PROGRAMS.filter(p => stateOf(p).acceptsApplications).length,
    // Η `stateOf` διαβάζει μόνο από τα `progStatus`/`today`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [PROGRAMS, progStatus])
  const activePrograms = useMemo<ComparisonProgram[]>(()=>[...PROGRAMS].sort((a,b)=>{
    const sa = stateOf(a), sb = stateOf(b)
    const oa = PROGRAM_ORDER[sa.state], ob = PROGRAM_ORDER[sb.state]
    if(oa!==ob) return oa-ob
    const da = sa.daysLeft ?? Number.POSITIVE_INFINITY, db = sb.daysLeft ?? Number.POSITIVE_INFINITY
    if(da!==db) return da-db
    return isSpitiMou2(a.name) ? -1 : isSpitiMou2(b.name) ? 1 : 0
  // Η `stateOf` διαβάζει μόνο από τα `progStatus`/`today`, που είναι στις εξαρτήσεις.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[PROGRAMS, progStatus])

  // Περιεχόμενο «Αποθηκευμένα δάνεια» — εμφανίζεται στο τέλος του «Μάθε
  // περισσότερα» (κάτω από τις επίσημες πηγές), όχι ως ξεχωριστός φακός.
  // Εξαγωγή αποθηκευμένων δανείων — «λογιστικού επιπέδου» .xlsx: τίτλος/υπότιτλος,
  // ωμοί αριθμοί (σωστή στοίχιση/μορφή), σωστά πλάτη στηλών, ζωντανά σύνολα SUM.
  const exportSavedLoans = () => {
    downloadXlsx(`Αποθηκευμένα δάνεια ${athensToday()}`, [{
      name: 'Δάνεια',
      title: 'Αποθηκευμένα δάνεια',
      subtitle: `${savedLoans.length} ${savedLoans.length===1?'δάνειο':'δάνεια'} · Έκδοση ${new Date().toLocaleDateString('el-GR')} · PROPERWISE`,
      columns: [
        { header:'Τράπεζα', kind:'text', width:20 },
        { header:'Τύπος δανείου', kind:'text', width:22 },
        { header:'Ποσό (€)', kind:'eur', width:15 },
        { header:'Επιτόκιο (%)', kind:'pct', width:12 },
        { header:'Τύπος επιτοκίου', kind:'text', width:15 },
        { header:'Διάρκεια (έτη)', kind:'int', width:13 },
        { header:'Δόση τον μήνα (€)', kind:'eur', width:16 },
        { header:'Συνολικοί τόκοι (€)', kind:'eur', width:17 },
        { header:'Δάνειο προς αξία (%)', kind:'pct', width:18 },
        { header:'Έναρξη', kind:'date', width:13 },
        { header:'Κατάσταση', kind:'text', width:12 },
        { header:'Σημειώσεις', kind:'text', width:30 },
      ],
      rows: savedLoans.map(loan=>{
        const m=calcMonthly(loan.amount,loan.rate,loan.years)
        const ti=m*loan.years*12-loan.amount
        const ltv=loan.property_value>0?(loan.amount/loan.property_value)*100:0
        return [
          loan.bank, LOAN_TYPES[loan.loan_type as LoanType]?.label||loan.loan_type,
          loan.amount, loan.rate, loan.rate_type==='variable'?'Κυμαινόμενο':'Σταθερό',
          loan.years, m, ti, ltv,
          loan.start_date ? new Date(loan.start_date) : '', loan.status==='active'?'Ενεργό':'Ανενεργό',
          (loan.notes||'').replace(/\n/g,' '),
        ]
      }),
      totalCols: [2, 6, 7],
    }])
  }

  const savedContent = (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        {/* «1 δάνεια». Ο σωστός πληθυντικός γραφόταν ήδη στην εξαγωγή Excel
            δέκα γραμμές πιο πάνω· εδώ και στη σύνοψη είχε ξεχαστεί. */}
        <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>{savedLoans.length} {savedLoans.length===1?'δάνειο':'δάνεια'}</span>
        <ExportButton disabled={savedLoans.length===0} onClick={exportSavedLoans}/>
      </div>

      {/* ═══ Η ΣΥΝΟΨΗ ΕΛΕΓΕ «ΥΠΟΛΟΙΠΟ» ΚΑΙ ΕΔΕΙΧΝΕ ΤΟ ΑΡΧΙΚΟ ΠΟΣΟ ══════════
          ΤΟ ΣΦΑΛΜΑ. Το πλακίδιο «Συνολικό υπόλοιπο» άθροιζε το `l.amount`,
          δηλαδή το ποσό της πρώτης μέρας. Διακόσια εικονοστοιχεία πιο κάτω η
          κάρτα του ίδιου δανείου έγραφε «Υπόλοιπο σήμερα» με το ΠΡΑΓΜΑΤΙΚΟ
          υπόλοιπο, από τη `loanProgress`. Μετρημένο στο δάνειο του πάγκου:
          120.000,00 € η σύνοψη, 107.143,80 € η κάρτα. Δώδεκα χιλιάδες
          οκτακόσια πενήντα έξι ευρώ διαφορά, για το ίδιο χρέος, στην ίδια
          οθόνη — και η σύνοψη ήταν αυτή που έλεγε ψέματα.

          Η ίδια ρίζα και στο επιτόκιο: το «μέσο σταθμισμένο» σταθμιζόταν με
          το αρχικό ποσό. Οταν δύο δάνεια έχουν προχωρήσει διαφορετικά, ο
          μέσος όρος που πληρώνεις σήμερα βγαίνει από το ΤΡΕΧΟΝ υπόλοιπο.

          ΚΑΙ ΜΕ ΕΝΑ ΔΑΝΕΙΟ Η ΣΥΝΟΨΗ ΕΙΝΑΙ Η ΚΑΡΤΑ. Τέσσερα πλακίδια με τα
          νούμερα που ξαναγράφονται αυτούσια αμέσως από κάτω. Το ίδιο το
          μπλοκ το ήξερε ήδη: η κατανομή δόσης ανά δάνειο εμφανιζόταν μόνο
          από δύο και πάνω. Τώρα το ξέρει ολόκληρο. ═══════════════════ */}
      {savedLoans.length>1&&(()=>{
        const rows = savedLoans.map(l=>{
          const prog = loanProgress({ amount:l.amount, annualRatePct:l.rate, years:l.years,
            startDate: l.start_date || null, today: athensToday() })
          const m = prog ? prog.monthly : calcMonthly(l.amount,l.rate,l.years)
          // Χωρίς ημερομηνία έναρξης το δάνειο δεν έχει αρχίσει να πληρώνεται:
          // υπόλοιπο το αρχικό ποσό, τόκοι όλοι όσοι θα τρέξουν.
          return { l, m, balance: prog ? prog.balance : l.amount,
            ti: prog ? prog.interestRemaining : m*l.years*12-l.amount }
        })
        const totalBalance = rows.reduce((s,r)=>s+r.balance,0)
        const totalMonthly = rows.reduce((s,r)=>s+r.m,0)
        const totalInterest = rows.reduce((s,r)=>s+r.ti,0)
        const blended = totalBalance>0 ? rows.reduce((s,r)=>s+r.balance*r.l.rate,0)/totalBalance : 0
        const tiles = [
          { k:'Συνολικό υπόλοιπο', v:fmtEur(totalBalance) },
          { k:'Συνολική δόση τον μήνα', v:fmtEur(totalMonthly) },
          { k:'Σταθμισμένο επιτόκιο', v:fmtPct(blended) },
          { k:'Τόκοι που απομένουν', v:fmtEur(totalInterest) },
        ]
        // Ενα μέγεθος για όλη τη σειρά: το μακρύτερο ποσό δίνει τον ρυθμό.
        const tilesWidest = widestOf(...tiles.map(t=>t.v))
        return (
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius: T.radius.card,padding:'16px 18px'}}>
            {/* «2 δάνεια» γραφόταν και στη γραμμή από πάνω, δίπλα στην εξαγωγή.
                Ο τίτλος της σύνοψης δεν χρειάζεται να το ξαναπεί. */}
            <p style={{...labelStyle,marginBottom:12}}>Ενιαίο δάνειο, συνολική εικόνα</p>
            {/* ══ ΤΟ ΠΟΣΟ ΔΕΝ ΧΩΡΑΓΕ ΣΤΟ ΠΛΑΚΙΔΙΟ ΤΟΥ ══════════════════════════
                Μετρημένο στα 375 έως 768: το «123.186,65 €» στα 24 θέλει 171
                εικονοστοιχεία και το πλακίδιο έδινε 118 έως 145. Το ευρώ έβγαινε
                έξω από την κάρτα σε ΚΑΘΕ πλάτος από 375 και πάνω· ο χρήστης
                διάβαζε «123.186,65» χωρίς νόμισμα, ή και κομμένο.

                Το κατώφλι 150 γράφτηκε για τετραψήφια ποσά. Το 205 είναι το
                μετρημένο πλάτος του μεγαλύτερου ποσού συν το περιθώριο του
                πλακιδίου: εξαψήφιο υπόλοιπο με λεπτά και σύμβολο. ══════ */}
            {/* ΤΟ `auto-fit` ΕΒΓΑΖΕ ΤΡΕΙΣ ΣΤΗΛΕΣ ΚΑΙ ΑΦΗΝΕ ΤΟ ΤΕΤΑΡΤΟ ΜΟΝΟ ΤΟΥ.
                Μετρημένο στα 768, 820 και 900: «3+1», με τους τόκους να κάθονται
                αριστερά και τρύπα δύο στηλών δεξιά τους. Το πλήθος εδώ το όρισε ο
                σχεδιαστής (τέσσερα αθροίσματα, πάντα τα ίδια), οπότε το ορφανό
                διορθώνεται: τέσσερις στήλες όπου χωρούν τα ποσά, δύο παντού
                αλλού, ποτέ τρεις.

                ΚΑΙ ΤΑ ΠΛΑΚΙΔΙΑ ΕΓΙΝΑΝ ΤΟ ΚΟΙΝΟ `KPI`. Είχαν δικό τους κουτί με
                σταθερό αριθμό στα 24, οπότε σε δύο στήλες κινητού το
                «123.186,65 €» κοβόταν. Το κοινό `KPI` του Δανείου κλιμακώνει τον
                αριθμό με το πλάτος της στήλης, δηλαδή το πρόβλημα ήταν ήδη
                λυμένο και εδώ γραφόταν δεύτερη φορά με άλλο ιδίωμα.

                ΕΔΩ ΜΕΝΟΥΝ ΠΛΑΚΙΔΙΑ, ΣΤΗΝ ΚΑΡΤΑ ΟΧΙ. Αυτά τα τέσσερα είναι τα
                ΑΘΡΟΙΣΜΑΤΑ: ο μόνος τόπος όπου υπάρχει το συνολικό υπόλοιπο, άρα
                είναι το περιεχόμενο της σύνοψης. Στην κάρτα κάθε δανείου ο ήρωας
                είναι το δικό της υπόλοιπο και τα υπόλοιπα μεγέθη κατεβαίνουν σε
                γραμμή στοιχείων. */}
            <div {...fixedCols(4, 10, 'stretch', 'fc-xs-2 fc-roomy fc-xxs-1')} style={{...fixedCols(4, 10, 'stretch', 'fc-xs-2 fc-roomy fc-xxs-1').style, marginBottom:16}}>
              {tiles.map(t=>(<Tile key={t.k} label={t.k} value={t.v} chars={tilesWidest}/>))}
            </div>
            {/* ══ ΤΟ ΥΠΟΜΝΗΜΑ ΞΑΝΑΕΓΡΑΦΕ ΤΙΣ ΚΑΡΤΕΣ ΠΟΥ ΑΚΟΛΟΥΘΟΥΝ ═══════════════
                Καθε γραμμή του έλεγε τράπεζα, επιτόκιο και δόση — τα ίδια τρία
                που γράφει, με μεγαλύτερα γράμματα, η κάρτα του κάθε δανείου
                αμέσως από κάτω. Δύο δάνεια, έξι νούμερα γραμμένα δύο φορές μέσα
                σε μία οθόνη.

                Η ΜΠΑΡΑ ΜΕΝΕΙ, ΓΙΑΤΙ ΛΕΕΙ ΚΑΤΙ ΠΟΥ ΟΙ ΚΑΡΤΕΣ ΔΕΝ ΛΕΝΕ: την
                αναλογία. Το υπόμνημα κρατά μόνο αυτό — όνομα και ποσοστό, σε μία
                γραμμή που τυλίγεται. Το επιτόκιο και η δόση ζουν στην κάρτα
                τους, όπου έχουν και το μέγεθος που τους αξίζει. */}
            {rows.length>1&&(<>
              <Bar height={10} style={{borderRadius: T.radius.pill,border:'1px solid var(--border-subtle)',marginBottom:9}}
                parts={rows.map((r,i)=>({
                  pct: totalMonthly>0?(r.m/totalMonthly)*100:0,
                  tone: `color-mix(in srgb, var(--accent) ${Math.max(20,100-i*14)}%, var(--bg-elevated))`,
                  title: `${r.l.bank}: ${fmtEur(r.m)} τον μήνα`,
                }))}/>
              <div style={{display:'flex',flexWrap:'wrap',gap:'4px 16px'}}>
                {rows.map((r,i)=>(
                  <span key={r.l.id} style={{display:'inline-flex',alignItems:'center',gap:7,minWidth:0}}>
                    <span style={{width:8,height:8,borderRadius:2,flexShrink:0,background:`color-mix(in srgb, var(--accent) ${Math.max(20,100-i*14)}%, var(--bg-elevated))`}}/>
                    <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily: T.font.sans,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.l.bank||'Δάνειο'}</span>
                    <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums'}}>{fp(totalMonthly>0?(r.m/totalMonthly)*100:0)}</span>
                  </span>
                ))}
              </div>
            </>)}
          </div>
        )
      })()}
      {/* Η κατάσταση φόρτωσης και η κενή κατάσταση έφυγαν από εδώ: το μπλοκ
          αποδίδεται πλέον ΜΟΝΟ όταν υπάρχουν δάνεια, οπότε καμία από τις δύο δεν
          μπορούσε να εμφανιστεί. Και η κενή κατάσταση έστελνε «άνοιξε τον
          Υπολογιστή Δανείου» — ο οποίος είναι τώρα ακριβώς από κάτω. */}
      {savedLoans.map(loan=>{
        // ═══ Η ΘΕΣΗ ΤΟΥ ΔΑΝΕΙΟΥ ΣΗΜΕΡΑ ═══════════════════════════════════════
        // Η κάρτα έδειχνε πέντε πλακίδια ίδιου βάρους, με πρώτο το «Ποσό» — το
        // ΑΡΧΙΚΟ κεφάλαιο, δηλαδή τον αριθμό που ίσχυε την ημέρα της υπογραφής
        // και ποτέ ξανά. Όποιος πληρώνει οκτώ χρόνια διάβαζε ακόμη το ποσό της
        // πρώτης μέρας σαν να ήταν το χρέος του, ενώ το ΥΠΟΛΟΙΠΟ — ο λόγος που
        // ανοίγει κανείς αυτή την οθόνη — δεν υπήρχε πουθενά.
        //
        // Η ιεραρχία τώρα λέει μία πρόταση: ΧΡΩΣΤΑΩ ΤΟΣΑ, πληρώνω τόσα τον μήνα,
        // τελειώνω τότε. Ό,τι δεν αλλάζει ποτέ (αρχικό ποσό, επιτόκιο, LTV)
        // κατεβαίνει σε ήσυχη γραμμή στοιχείων· δεν είναι λιγότερο αληθινό,
        // είναι λιγότερο επείγον.
        const prog = loanProgress({
          amount: loan.amount, annualRatePct: loan.rate, years: loan.years,
          startDate: loan.start_date || null, today: athensToday(),
        })
        const m = prog ? prog.monthly : calcMonthly(loan.amount,loan.rate,loan.years)
        const ltv = loan.property_value>0?(loan.amount/loan.property_value)*100:0
        return(
          <div key={loan.id} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius: T.radius.card,padding:18}}>

            {/* Ταυτότητα: τράπεζα, κατάσταση, είδος. */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:16}}>
              <div style={{minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
                  <p style={{fontSize:15,fontWeight:700,fontFamily:T.font.sans,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>{loan.bank}</p>
                  {/* ΤΟ ΣΗΜΑ ΕΓΡΑΦΕ «mortgage» ΣΕ ΕΛΛΗΝΙΚΗ ΟΘΟΝΗ. Η εφεδρεία ήταν
                      «αν δεν ξέρω την ετικέτα, τύπωσε το κλειδί»: ένας αγγλικός
                      κωδικός βάσης, δίπλα στο όνομα της τράπεζας. Η στήλη είναι
                      απλό `text` χωρίς περιορισμό, οπότε αρκεί μία παλιά ή
                      χειροκίνητη εγγραφή για να βγει στην επιφάνεια. Κωδικός που
                      δεν λέει τίποτα στον χρήστη δεν είναι πληροφορία: το σήμα
                      εμφανίζεται μόνο όταν υπάρχει ελληνική ετικέτα. */}
                  {LOAN_TYPES[loan.loan_type as LoanType]&&<span style={{fontSize: 'var(--fs-xs)',padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily:T.font.sans}}>{LOAN_TYPES[loan.loan_type as LoanType].label}</span>}
                  {loan.status!=='active'&&<span style={{fontSize: 'var(--fs-xs)',padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',color:'var(--text-tertiary)',fontFamily:T.font.sans}}>Ανενεργό</span>}
                </div>
                {loan.notes&&<p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>{loan.notes}</p>}
              </div>
              {/* Ήταν «×» — το σύμβολο του κλεισίματος, πάνω δεξιά, εκεί ακριβώς
                  όπου ο χρήστης το πατά για να ΦΥΓΕΙ. Διέγραφε το δάνειο. */}
              <button onClick={()=>deleteLoan(loan.id)} aria-label="Διαγραφή δανείου" title="Διαγραφή δανείου"
                style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:8,margin:-4,display:'flex',borderRadius:8,flexShrink:0}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
            </div>

            {prog ? (<>
              {/* Ο ΕΝΑΣ ΑΡΙΘΜΟΣ. Μεγαλύτερος από όλα τα υπόλοιπα, μόνος στη σειρά του.
                  ΚΑΙ ΣΤΟΙΧΙΖΕΤΑΙ ΑΠΟ ΠΑΝΩ, ΟΧΙ ΑΠΟ ΚΑΤΩ. Με `flex-end` έδεναν τα
                  κάτω άκρα, οπότε τα δύο νούμερα κάθονταν σε διαφορετικό ύψος —
                  μετρημένο σε tablet, οκτώ εικονοστοιχεία διαφορά — και η σκόπιμη
                  ιεραρχία μεγέθους διαβαζόταν ως αστοχία στοίχισης. Με τις δύο
                  ετικέτες στην ίδια γραμμή, τα νούμερα ξεκινούν στο ίδιο ύψος και
                  διαφέρουν ΜΟΝΟ σε μέγεθος, που είναι το ζητούμενο. */}
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20,flexWrap:'wrap',marginBottom:14}}>
                <div>
                  <p style={{...labelStyle,marginBottom:4}}>Υπόλοιπο σήμερα</p>
                  <p style={{fontSize:28,fontWeight:700,letterSpacing:'-0.025em',lineHeight:1.05,color:'var(--text-primary)',fontFamily:T.font.sans}}>{fe(prog.balance)}</p>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:4,fontFamily:T.font.sans}}>
                    από {fe(loan.amount)} · εκτίμηση με σταθερή δόση
                  </p>
                </div>
                <div className="pole-right">
                  <p style={{...labelStyle,marginBottom:4}}>Δόση τον μήνα</p>
                  <p style={{fontSize:20,fontWeight:600,color:'var(--text-primary)',fontFamily:T.font.sans,lineHeight:1.1}}>{fe(m)}</p>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:4,fontFamily:T.font.sans}}>
                    {prog.remainingMonths} {prog.remainingMonths===1?'δόση ακόμη':'δόσεις ακόμη'}
                  </p>
                </div>
              </div>

              {/* Η πρόοδος, ως μήκος και όχι ως χρώμα. Δείχνει αυτό που δεν
                  φαίνεται αλλού: στα πρώτα χρόνια πληρώνεις κυρίως τόκους, οπότε
                  η μπάρα υπολείπεται πάντα του χρόνου που πέρασε. */}
              <div style={{marginBottom:14}}>
                <Bar pct={prog.percentRepaid} label="Ποσοστό αποπληρωμής" track="var(--bg-elevated)" style={{borderRadius: T.radius.pill,border:'1px solid var(--border-subtle)'}}/>
                <div style={{display:'flex',justifyContent:'space-between',gap:12,marginTop:6}}>
                  <span style={{fontSize: 'var(--fs-xs)',color:'var(--text-secondary)',fontFamily:T.font.sans}}>
                    Εξοφλήθηκε {fp(prog.percentRepaid)} του κεφαλαίου σε {prog.paidMonths} από {prog.totalMonths} δόσεις
                  </span>
                  {prog.endDate&&<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily:T.font.sans,whiteSpace:'nowrap'}}>Λήξη {fdLong(prog.endDate)}</span>}
                </div>
              </div>

            </>) : (
              // Χωρίς ημερομηνία έναρξης δεν υπάρχει «σήμερα»: δεν τυπώνεται
              // υπόλοιπο-εικασία, λέγεται τι λείπει για να υπολογιστεί.
              <div style={{marginBottom:14}}>
                <p style={{...labelStyle,marginBottom:4}}>Δόση τον μήνα</p>
                <p style={{fontSize:28,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)',fontFamily:T.font.sans,lineHeight:1.1}}>{fe(m)}</p>
                <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:5,fontFamily:T.font.sans}}>
                  Συμπλήρωσε ημερομηνία έναρξης για να υπολογιστεί το υπόλοιπο και η λήξη.
                </p>
              </div>
            )}

            {/* ══ ΜΙΑ ΚΑΡΤΑ ΔΑΝΕΙΟΥ, ΕΝΑΣ ΗΡΩΑΣ ΚΑΙ ΜΙΑ ΓΡΑΜΜΗ ΣΤΟΙΧΕΙΩΝ ═════════
                ΤΙ ΕΦΥΓΕ ΑΠΟ ΤΗ ΓΡΑΜΜΗ. Είχε πέντε στοιχεία και τα δύο γράφονταν
                ήδη πιο πάνω: το «Αρχικό ποσό 120.000,00 €» κάθεται δύο εκατοστά
                ψηλότερα ως «από 120.000,00 €», ακριβώς κάτω από το υπόλοιπο, όπου
                έχει και νόημα· και η «Διάρκεια 25 έτη» γράφεται από τη μπάρα ως
                «σε 53 από 300 δόσεις», με τη λήξη σε ημερομηνία δίπλα της.
                Τριακόσιες δόσεις ΕΙΝΑΙ εικοσιπέντε έτη.

                ΤΙ ΗΡΘΕ ΜΕΣΑ ΤΗΣ. Οι δύο τόκοι ήταν πλακίδια `KPI` σε δύο στήλες:
                στα 1.280 αυτό σημαίνει δύο κουτιά των 940 εικονοστοιχείων που
                κρατούν από ένα ποσό το καθένα, δηλαδή ένα νούμερο με το βάρος
                του υπολοίπου χωρίς να είναι το υπόλοιπο. Ο ήρωας της κάρτας
                είναι ΕΝΑΣ, το υπόλοιπο· τα υπόλοιπα είναι στοιχεία και ζουν στη
                γραμμή στοιχείων. Ιδια πληροφορία, μισό ύψος, μία ιεραρχία. */}
            <div style={{display:'flex',gap:22,flexWrap:'wrap',paddingTop:12,borderTop:'1px solid var(--border-subtle)'}}>
              <div><p style={{...labelStyle,marginBottom:2}}>Επιτόκιο</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>{fp(loan.rate)} · {loan.rate_type==='variable'?'κυμαινόμενο':'σταθερό'}</p></div>
              {ltv>0&&<div><p style={{...labelStyle,marginBottom:2}}>Δάνειο προς αξία</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>{fp(ltv)}</p></div>}
              {loan.start_date&&<div><p style={{...labelStyle,marginBottom:2}}>Έναρξη</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans}}>{fdLong(loan.start_date)}</p></div>}
              {prog&&<div><p style={{...labelStyle,marginBottom:2}}>Τόκοι που πλήρωσες</p><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:T.font.sans,fontVariantNumeric:'tabular-nums'}}>{fe(prog.interestPaid)}</p></div>}
              {prog&&<div><p style={{...labelStyle,marginBottom:2}}>Τόκοι που απομένουν</p><p style={{fontSize:12,color:'var(--text-primary)',fontWeight:600,fontFamily:T.font.sans,fontVariantNumeric:'tabular-nums'}}>{fe(prog.interestRemaining)}</p></div>}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{fontFamily: T.font.sans,color:'var(--text-primary)',display:'flex',flexDirection:'column',gap:16}}>
      {/* ── Η ΟΘΟΝΗ ΧΡΕΙΑΖΕΤΑΙ ΟΝΟΜΑ, ΚΑΙ ΑΣ ΜΗΝ ΤΟ ΔΕΙΧΝΕΙ ──────────────────
          Δώδεκα καρτέλες έχουν ορατό τίτλο μέσω `PageTitle`, δηλαδή `h1`. Αυτή
          δεν είχε ΚΑΝΕΝΑ: ο αναγνώστης οθόνης ανακοίνωνε τη σελίδα χωρίς όνομα,
          η πλοήγηση ανά επικεφαλίδα —ο βασικός τρόπος που διαβάζει κανείς μια
          άγνωστη οθόνη— ξεκινούσε από `h2` ή `h3` και η ιεραρχία δεν είχε
          κορυφή. Το όνομα έρχεται από το `lib/nav/labels.ts`, την ίδια πηγή με
          το μενού και τη Νόα: δεν επινοείται δεύτερο εδώ.
          Κρυφό ΟΠΤΙΚΑ, όχι από τον αναγνώστη — η οθόνη έχει ήδη τη δική της
          κεφαλίδα και δεν αλλάζει ούτε ένα εικονοστοιχείο. */}
      <h1 className="sr-only">{navLabel('loan')}</h1>

      {/* Header — compact, premium, ήσυχο */}
      <div style={{...cardStyle,padding:'13px 18px',display:'flex',alignItems:'center',gap:18,flexWrap:'wrap'}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:16,color:'var(--text-primary)',fontWeight:700,fontFamily: T.font.sans,letterSpacing:'-0.02em'}}>Στεγαστικό δάνειο</p>
          <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:1,fontFamily: T.font.sans}}>Ελληνική αγορά · δεδομένα ΕΚΤ και Τράπεζας Ελλάδος</p>
        </div>
        {/* ══ ΤΕΣΣΕΡΑ ΕΠΙΤΟΚΙΑ ΑΝΑΦΟΡΑΣ ΔΕΝ ΕΙΝΑΙ ΤΕΣΣΕΡΙΣ ΔΕΙΚΤΕΣ ═══════════
            ΗΤΑΝ ΤΕΣΣΕΡΑ ΠΛΑΚΙΔΙΑ ΜΕ ΣΤΟΙΧΙΣΗ ΣΤΟ ΚΕΝΤΡΟ, ΕΤΙΚΕΤΑ ΠΑΝΩ ΚΑΙ
            ΑΡΙΘΜΟ 15 ΑΠΟ ΚΑΤΩ. Μετρημένο στα 390: 106 εικονοστοιχεία σε 2×2,
            με την κεφαλίδα να φτάνει τα 188 πριν αρχίσει η οθόνη. Ομως αυτά τα
            νούμερα δεν είναι δικά σου: είναι το Euribor και το επιτόκιο της
            ΕΚΤ, δηλαδή το κλίμα της αγοράς. Οταν φορούν το ίδιο ρούχο με το
            υπόλοιπο του δανείου σου, διεκδικούν την ίδια προσοχή με αυτό.

            Τώρα είναι μία ήσυχη λωρίδα, ετικέτα και τιμή στην ίδια γραμμή, με
            λεπτό διαχωριστικό ανάμεσα. Ιδια πληροφορία, καμία λιγότερη, στο
            μισό ύψος και χωρίς να μοιάζει με δείκτη απόδοσης.

            ΚΑΙ ΤΟ ΦΩΤΙΣΜΑ ΣΤΟ ΠΕΡΑΣΜΑ ΤΟΥ ΚΕΡΣΟΡΑ ΕΦΥΓΕ. Αλλαζε φόντο σε κάτι
            που δεν πατιέται και δεν ανοίγει τίποτα: κίνηση χωρίς προορισμό. */}
        <div style={{display:'flex',flexWrap:'wrap',alignItems:'baseline',gap:'6px 20px',marginLeft:'auto',minWidth:0}}>
          {[
            {l:'Euribor τριμήνου',v:market.euribor_3m,k:'euribor_3m' as const},
            {l:'Euribor μηνός',v:market.euribor_1m,k:'euribor_1m' as const},
            {l:'ΕΚΤ',v:market.ecb_rate,k:'ecb_rate' as const},
            ...(market.bog_housing_new?[{l:'ΤτΕ μέσο',v:market.bog_housing_new,k:'bog_housing_new' as const}]:[]),
          ].map(item=>(
            /* ΤΟ ΔΙΑΧΩΡΙΣΤΙΚΟ ΗΤΑΝ ΑΡΙΣΤΕΡΟ ΠΕΡΙΓΡΑΜΜΑ, ΚΑΙ ΣΤΟ ΤΥΛΙΓΜΑ ΕΠΕΦΤΕ ΣΤΗΝ
               ΑΡΧΗ ΤΗΣ ΓΡΑΜΜΗΣ. Μετρημένο στα 390: η λωρίδα σπάει σε 1+2+1 και
               δύο κάθετες γραμμούλες κάθονταν κολλητά στο αριστερό περιθώριο,
               χωρίς να χωρίζουν τίποτα. Ενα διαχωριστικό που δεν ξέρει πού
               τελειώνει η σειρά του δεν είναι διαχωριστικό. Χωρίζει το κενό: η
               ετικέτα είναι μικρή κεφαλαία και η τιμή έντονη, οπότε το ζευγάρι
               διαβάζεται ως μονάδα χωρίς βοήθεια. */
            /* ΚΑΙ Η ΗΜΕΡΟΜΗΝΙΑ ΤΗΣ ΚΑΘΕ ΤΙΜΗΣ, ΔΙΠΛΑ ΤΗΣ. Η λωρίδα έδειχνε
               τέσσερα νούμερα χωρίς να λέει πότε ισχύουν· και πιο κάτω μία
               κοινή ημερομηνία «ενημέρωσης» που ήταν η ώρα που έτρεξε η
               εργασία — όχι η ώρα της παρατήρησης. Τα τέσσερα νούμερα ΔΕΝ
               είναι της ίδιας μέρας: το Euribor βγαίνει κάθε εργάσιμη, το
               επιτόκιο της ΕΚΤ αλλάζει λίγες φορές τον χρόνο και το ελληνικό
               μέσο δημοσιεύεται μηνιαία με έξι εβδομάδες καθυστέρηση. Μία
               κοινή ημερομηνία για όλα ήταν λάθος και στα τέσσερα.

               Οταν η τιμή δεν έχει ταυτότητα (πριν από το πρώτο πέρασμα της
               τροφοδοσίας) δεν γράφεται τίποτα στη θέση της: ούτε παύλα ούτε
               «σήμερα». Η απουσία λέγεται με απουσία. */
            <span key={item.l} style={{display:'inline-flex',alignItems:'baseline',gap:6,whiteSpace:'nowrap' as const}}>
              <span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.06em',fontWeight:600,fontFamily: T.font.sans}}>{item.l}</span>
              <span style={{fontSize: 'var(--fs-base)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:market.isLoading?'var(--border-default)':'var(--text-primary)',fontWeight:700,letterSpacing:'-0.01em'}}>
                {market.isLoading?'…':fmtPct(item.v)}
              </span>
              {!market.isLoading && market.provenance[item.k] && (
                <span title={`${market.provenance[item.k]!.basis}, ${market.provenance[item.k]!.source}${market.stale.includes(item.k)?'. Δεν ανανεώθηκε στον αναμενόμενο χρόνο':''}`}
                  style={{fontSize: 'var(--fs-xs)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',fontWeight:500,
                    borderBottom:market.stale.includes(item.k)?'1px dotted var(--text-tertiary)':undefined}}>
                  {greekWhen(market.provenance[item.k]!.asOf, market.provenance[item.k]!.basis)}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* ══ Η ΤΡΟΦΟΔΟΣΙΑ ΜΙΛΑ ΜΟΝΟ ΟΤΑΝ ΕΧΕΙ ΧΑΛΑΣΕΙ ═══════════════════════════
          ΣΙΩΠΗ ΟΤΑΝ ΟΛΑ ΔΟΥΛΕΥΟΥΝ. Ενα μόνιμο «όλα καλά» θα ήταν άλλη μια
          γραμμή που ο διαχειριστής μαθαίνει να προσπερνά — και ακριβώς τη μέρα
          που θα άλλαζε, δεν θα το πρόσεχε. Εμφανίζεται μόνο με πρόβλημα.

          ΚΑΙ ΜΟΝΟ ΣΤΟΝ ΔΙΑΧΕΙΡΙΣΤΗ. Ο ιδιοκτήτης βλέπει ήδη την αλήθεια: κάθε
          τιμή κουβαλά την ημερομηνία της και η παλιά υπογραμμίζεται
          διακεκομμένα. Δεν έχει τι να κάνει με το «η εργασία δεν έτρεξε» και
          δεν του χρωστάμε άγχος για κάτι που δεν ελέγχει. */}
      {isAdmin && feedHealth.checked && !feedHealth.ok && (
        <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 13px',marginTop:-4,
          background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10}}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
          <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>
            Η τροφοδοσία επιτοκίων χρειάζεται έλεγχο: {feedHealth.reason}. Οι τιμές που βλέπεις είναι οι τελευταίες που ήρθαν, με τη δική τους ημερομηνία η καθεμία.
          </p>
        </div>
      )}

      {/* ═══ ΤΟ ΔΑΝΕΙΟ ΣΟΥ — ΠΡΩΤΟ, ΠΑΝΤΑ ═══════════════════════════════════
          Ζούσε σε `MiniSection order={8}`, μέσα στον φακό «Μάθε περισσότερα»,
          ΚΑΤΩ ΑΠΟ ΤΙΣ «Επίσημες πηγές» — το σχόλιο του κώδικα το έγραφε ρητά.
          Δηλαδή ο ιδιοκτήτης που έχει δάνειο άνοιγε την καρτέλα Δάνειο και
          έβλεπε: υπολογιστή για δάνειο που δεν έχει πάρει, μετά σύσταση για
          δάνειο που δεν ψάχνει και για να δει ΤΟ ΔΙΚΟ ΤΟΥ έπρεπε να αλλάξει
          φάκο και να περάσει επτά πτυσσόμενες ενότητες με γλωσσάρι, ιστορικό
          Euribor και συνδέσμους της Τράπεζας Ελλάδος.

          Το υπόλοιπο, η δόση και η λήξη είναι ο λόγος που ανοίγει αυτή την
          οθόνη κάποιος που ΗΔΗ έχει δάνειο. Ο υπολογιστής είναι για όποιον
          ψάχνει — χρήσιμος, αλλά δεύτερος. ═══════════════════════════════ */}
      {!loadingSaved && savedLoans.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>{savedContent}</div>
      )}

      {/* ═══ ΥΠΟΛΟΓΙΣΤΗΣ ═══
          ΔΙΠΛΩΝΕΙ ΟΤΑΝ ΥΠΑΡΧΕΙ ΗΔΗ ΔΑΝΕΙΟ. Το σχόλιο απο πάνω το έγραφε ήδη —
          «ο υπολογιστής είναι για όποιον ψάχνει, χρήσιμος αλλά δεύτερος» — και
          η προηγούμενη διόρθωση άλλαξε μόνο τη ΣΕΙΡΑ. Ομως 1.596 γραμμές
          υπολογιστή αγοράς, ανοιχτές κάτω απο το δικό σου δάνειο, δεν είναι
          δεύτερες: είναι η μισή οθόνη. Μένει ένα πάτημα μακριά, δεν φεύγει.
          Οποιος ΔΕΝ έχει δάνειο τη βρίσκει ανοιχτή, όπως πάντα. */}
      <div ref={calcRef}>
        <MiniSection title="Υπολογιστής νέου δανείου"
          meta={<span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,whiteSpace:'nowrap' as const}}>δόση, επιτόκια, δικαιολογητικά</span>}
          open={calcOpen} onToggle={setCalcOpen}>
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
          lens={calcLens} onLens={setCalcLens} lensRef={lensRef}
        />
        </MiniSection>
      </div>

      {/* ═══ COCKPIT: εναλλαγή φακών επί τόπου — ένα πάνελ τη φορά ═══ */}
      {/* ΤΡΕΙΣ ΦΑΚΟΙ, ΟΧΙ ΤΕΣΣΕΡΙΣ.
          Η «Σύσταση» και το «Μάθε περισσότερα» ήταν και τα δύο συμβουλευτική,
          χωρισμένη σε δύο προορισμούς: στον πρώτο η ανάλυση του δικού σου
          σεναρίου, στον δεύτερο επτά ενότητες αναφοράς (γλωσσάρι, πώς
          λειτουργεί ένα στεγαστικό, γιατί απορρίπτεται μια αίτηση, ιστορικό
          Euribor, επίσημες πηγές). Ο χρήστης δεν έχει τρόπο να ξέρει σε ποιον
          από τους δύο ζει η απάντησή του — και το «Πώς λειτουργεί» έβγαινε από
          τον έναν και συνεχιζόταν στον άλλο.

          Τώρα είναι μία «Συμβουλευτική»: πρώτα η ανάλυση του σεναρίου σου, μετά
          η γνώση. Τα «Τράπεζες» και «Προγράμματα» μένουν χωριστά γιατί είναι
          ΔΕΔΟΜΕΝΑ (επιτόκια, κρατικά προγράμματα), όχι συμβουλή. */}
      <LensBar value={openSec} onChange={v=>setOpenSec(v as LoanSection)} items={[
        {id:'advisor',label:'Το δάνειό σου'},
        {id:'banks',label:'Τράπεζες'},
        {id:'programs',label:'Προγράμματα'},
        {id:'guide',label:'Οδηγός'},
      ]}/>

      {/* ═══ ΣΥΓΚΡΙΣΗ ΤΡΑΠΕΖΩΝ ═══ */}
      {openSec==='banks' && (<LensPanel title="Σύγκριση τραπεζών" subtitle={`${BANKS.length} τράπεζες · επιβεβαιωμένα ${banksUpdStr}${banksStale?' · χρήζουν επαλήθευσης':''}`}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Ο διαχειριστής αποθήκευε νέα επιτόκια και η οθόνη κρατούσε τα ΠΑΛΙΑ:
              το onSaved ήταν κενό, οπότε ο πίνακας σύγκρισης, οι κάρτες τραπεζών
              και η ημερομηνία επιβεβαίωσης έμεναν στις τιμές που είχε φέρει το
              useBankRates κατά την προσάρτηση. Το BankRatesAdmin ξαναδιάβαζε
              ΜΟΝΟ τον δικό του πίνακα, άρα ο διαχειριστής έβλεπε δύο διαφορετικά
              επιτόκια για την ίδια τράπεζα στην ίδια οθόνη. Το hook επιστρέφει
              πλέον `reload` και δένεται εδώ. */}
          {isAdmin && <BankRatesAdmin onSaved={reloadBanks}/>}
          {banksStale&&(
            <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'11px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10}}>
              <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>{feed.checked && !feed.ok ? `Ο αυτόματος έλεγχος επιτοκίων δεν τρέχει (${feed.reason}). ` : ''}Τα επιτόκια επιβεβαιώθηκαν πριν από {banksAgeDays} ημέρες και ενδέχεται να έχουν αλλάξει. Για δεσμευτική προσφορά επιβεβαιώστε απευθείας με την τράπεζα ή στο <a href="https://vresdaneio.gr/epitokia/index.html" target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>vresdaneio.gr</a>.</p>
            </div>
          )}
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={()=>setFS(f=>!f)} style={{display:'flex',alignItems:'center',gap:7,padding:'0 14px',height:T.h.md,background:filterSpiti?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${filterSpiti?'var(--border-accent)':'var(--border-subtle)'}`,borderRadius: T.radius.modal,cursor:'pointer',color:filterSpiti?'var(--accent)':'var(--text-secondary)',fontSize:12,fontFamily: T.font.sans,fontWeight:500}}>
              Σπίτι μου ΙΙ
            </button>
            <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginLeft:'auto',fontFamily: T.font.sans}}>
              {banksLoading?'Φόρτωση…':feedFresh?`Ελέγχθηκαν ${feedCheckedStr} · επιβεβαιωμένα ${banksUpdStr}`:`vresdaneio.gr · ${banksUpdStr}`}
              {liveBanks.length>0&&!feedFresh&&<span style={{color:'var(--text-secondary)',marginLeft:6}}>Ενημερωμένα στοιχεία</span>}
              {feed.heldChanges>0&&<span style={{color:'var(--warning)',marginLeft:6}}>{feed.heldChanges} {feed.heldChanges===1?'μεταβολή περιμένει':'μεταβολές περιμένουν'} επιβεβαίωση</span>}
            </p>
          </div>

          {/* Επιλέξιμες συμπαγείς κάρτες — διάλεξε τράπεζα για λεπτομέρειες */}
          <p style={{...labelStyle,marginBottom:2}}>Διάλεξε τράπεζα για ανάλυση</p>
          {/* ΤΟ ΠΛΗΘΟΣ ΤΩΝ ΤΡΑΠΕΖΩΝ ΔΕΝ ΤΟ ΟΡΙΖΕΙ Ο ΣΧΕΔΙΑΣΜΟΣ. Ο σαρωτής
              κατήγγειλε «3+3+1» στα 768 και «6+1» στα 1.440: επτά τράπεζες σε
              τρεις ή έξι στήλες αφήνουν πάντα μία στην τελευταία σειρά. Καμία
              διάταξη δεν το αποφεύγει, γιατί το επτά δεν είναι επιλογή μας —
              είναι όσες τράπεζες δίνουν στεγαστικό· και ο αριθμός αλλάζει και
              με το φίλτρο «Σπίτι μου ΙΙ» που πατά ο χρήστης. Ακριβώς γι' αυτό
              υπάρχει το `data-list`: δηλώνει ότι το πλήθος είναι δεδομένο, όχι
              απόφαση. */}
          <div data-list style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',gap:10}}>
            {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map(bank=>{
              const key = bank.id||bank.name
              const on = selBank===key
              const fixed5 = bank.fixed_5yr||bank.fixed_min||ABSENT
              const bankRate = publishedRate(bank)
            const myM = bankRate !== null && LA > 0 ? calcMonthly(LA, bankRate, Y) : null
              return (
                <button key={key} onClick={()=>setSelBank(on?null:key)} aria-pressed={on} onMouseEnter={()=>setHoverBank(key)} onMouseLeave={()=>setHoverBank(null)} onTouchStart={()=>setHoverBank(key)} onTouchEnd={()=>setHoverBank(null)} style={{textAlign:'left' as const,cursor:'pointer',background:'var(--bg-elevated)',
                  border:`1px solid ${on?'var(--border-accent)':hoverBank===key?'var(--border-default)':'var(--border-subtle)'}`,borderRadius: T.radius.card,padding:'14px 15px',transition:'border-color 0.15s, box-shadow 0.15s',
                  boxShadow:on?'0 2px 4px color-mix(in srgb, var(--accent) 14%, transparent), 0 10px 24px -14px color-mix(in srgb, var(--accent) 40%, transparent)':hoverBank===key?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent)':'0 1px 2px color-mix(in srgb, var(--text-primary) 6%, transparent)'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:12}}>
                    <span style={{fontSize:14,fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)',minWidth:0,lineHeight:1.3}}>{bank.name}</span>
                    {bank.spiti_mou&&<span style={{flexShrink:0,fontSize: 'var(--fs-xs)',padding:'3px 9px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:500,fontFamily: T.font.sans}}>Σπίτι μου ΙΙ</span>}
                  </div>
                  <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:12}}>
                    <div style={{minWidth:0}}>
                      <p style={{fontSize:20,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1,letterSpacing:'-0.02em',whiteSpace:'nowrap'}}>{cellRate(fixed5)===NO_RATE?NO_RATE:<>από <span style={{color:(on||hoverBank===key)?'var(--accent)':'var(--text-primary)',transition:'color 0.15s'}}>{cellRate(fixed5)}</span></>}</p>
                      <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:4,fontFamily: T.font.sans}}>Σταθερό 5 ετών</p>
                    </div>
                    <div style={{textAlign:'right' as const,flexShrink:0}}>
                      <p style={{fontSize:14,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600,lineHeight:1}}>{myM!==null?fmtEur(myM):fe(0)}</p>
                      <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:4,fontFamily: T.font.sans}}>{myM!==null?'δόση':'χωρίς δημοσιευμένο επιτόκιο'}{myM!==null&&bank.max_ltv?` · έως ${bank.max_ltv}%`:''}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Λεπτομέρειες επιλεγμένης τράπεζας */}
          {(()=>{
            const bank = BANKS.filter(b=>!filterSpiti||b.spiti_mou).find(b=>(b.id||b.name)===selBank)
            if(!bank) return null
            const varRate = bank.variable_spread_min?fmtPct(market.euribor_3m+bank.variable_spread_min):null
            const bankRate = publishedRate(bank)
            const myM = bankRate !== null && LA > 0 ? calcMonthly(LA, bankRate, Y) : null
            const terms = [['3 ετών','fixed_3yr'],['5 ετών','fixed_5yr'],['10 ετών','fixed_10yr'],['15 ετών','fixed_15yr'],['20 ετών','fixed_20yr']] as const
            return (
              <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-accent)',borderRadius: T.radius.card,padding:'18px 20px',boxShadow:'var(--shadow-sm)'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:16}}>
                  <div>
                    <p style={{fontSize:16,fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>{bank.name}</p>
                    {bank.note&&<p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:3,fontFamily: T.font.sans}}>{bank.note}</p>}
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    {bank.url&&<a href={bank.url} target="_blank" rel="noreferrer" style={{padding:'0 16px',height:T.h.md,borderRadius: T.radius.modal,border:'1px solid var(--border-default)',background:'none',color:'var(--text-secondary)',fontSize: 'var(--fs-base)',fontFamily: T.font.sans,textDecoration:'none',fontWeight:500,display:'flex',alignItems:'center'}}>Επίσκεψη</a>}
                    <button disabled={bankRate===null} title={bankRate===null?'Η τράπεζα δεν έχει δημοσιεύσει επιτόκιο· δεν υπάρχει τιμή να εφαρμοστεί':undefined} onClick={()=>{ if(bankRate!==null) applyBank(bankRate, 'fixed', bank.name) }} style={{padding:'0 16px',height:T.h.md,borderRadius: T.radius.modal,background:bankRate===null?'var(--bg-elevated)':'var(--accent)',border:bankRate===null?'1px solid var(--border-subtle)':'none',color:bankRate===null?'var(--text-tertiary)':'var(--accent-text)',fontSize: 'var(--fs-base)',fontFamily: T.font.sans,cursor:bankRate===null?'not-allowed':'pointer',fontWeight:600}}>Υπολόγισε τη δόση</button>
                    {/* ΤΟ ΠΑΝΕΛ ΑΝΟΙΓΕ ΚΑΙ ΔΕΝ ΕΚΛΕΙΝΕ ΑΠΟ ΠΟΥΘΕΝΑ. Η μόνη έξοδος
                        ήταν να ξαναβρεί ο χρήστης το πλακίδιο της τράπεζας ΠΑΝΩ από
                        το πάνελ και να το ξαναπατήσει — δηλαδή να κυλήσει προς τα
                        πάνω, να θυμηθεί ποιο από τα επτά ήταν, να μαντέψει ότι
                        το δεύτερο πάτημα κλείνει. Πεντακόσια εικονοστοιχεία
                        περιεχομένου χωρίς κουμπί κλεισίματος. Το «×» κάθεται εκεί
                        που κάθεται σε κάθε παράθυρο της εφαρμογής: δεξιά στην
                        κεφαλίδα, με ζώνη αφής 44. */}
                    <button type="button" onClick={()=>setSelBank(null)} aria-label={`Κλείσιμο: ${bank.name}`}
                      style={{width:T.h.md,height:T.h.md,display:'flex',alignItems:'center',justifyContent:'center',borderRadius: T.radius.modal,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-tertiary)',cursor:'pointer',fontSize:18,lineHeight:1,fontFamily: T.font.sans,padding:0}}>×</button>
                  </div>
                </div>
                <p style={{...labelStyle,marginBottom:10}}>Σταθερά επιτόκια «από», ανά διάρκεια</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 90px), 1fr))',gap:8,marginBottom:16}}>
                  {terms.map(([lab,k])=>(
                    <div key={k} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'10px 12px'}}>
                      <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans,marginBottom:5}}>{lab}</p>
                      <p style={{fontSize:16,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1}}>{cellRate(bank[k])}</p>
                    </div>
                  ))}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8}}>
                  {[
                    {label:'Κυμαινόμενο περιθώριο',value:bank.variable_spread_min!==undefined?`+${fp(bank.variable_spread_min)} έως +${fp(bank.variable_spread_max)}`:NO_RATE,sub:varRate?`≈ ${varRate} σήμερα`:null},
                    {label:'Εκτιμώμενη δόση',value: myM !== null ? fmtEur(myM) : fe(0),sub: myM !== null ? `${fmtEur(LA)} · ${Y} έτη` : bankRate === null ? 'Η τράπεζα δεν έχει δημοσιεύσει επιτόκιο' : 'Συμπλήρωσε ποσό δανείου για υπολογισμό'},
                    {label:'Μέγιστο δάνειο προς αξία',value:bank.max_ltv?fp(bank.max_ltv):NO_RATE,sub:bank.max_amount?`έως ${fmtEur(bank.max_amount)}`:null},
                    {label:'Σπίτι μου ΙΙ',value:bank.spiti_mou?'Ναι':'Όχι',sub:bank.spiti_mou?'Συμμετέχει στο πρόγραμμα':'Δεν συμμετέχει'},
                  ].map(s=>(
                    <div key={s.label} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'11px 13px'}}>
                      <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.05em',fontWeight:600,fontFamily: T.font.sans,marginBottom:6}}>{s.label}</p>
                      <p style={{fontSize:16,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1}}>{s.value}</p>
                      {s.sub&&<p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:4,fontFamily: T.font.sans}}>{s.sub}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Πλήρης πίνακας επιτοκίων — πτυσσόμενος */}
          <MiniSection title="Πλήρης πίνακας επιτοκίων" meta={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans}}>{banksUpdStr}</span>}>
            <div style={{overflowX:'auto'}}>
              <div className="table-wrap">
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border-subtle)'}}>
                    {([['Τράπεζα','left'],['3 έτη','right'],['5 έτη','right'],['10 έτη','right'],['15 έτη','right'],['20 έτη','right'],['Κυμαινόμενο περιθώριο','right'],['Δάνειο προς αξία','right'],['Σπίτι μου ΙΙ','left']] as const).map(([h,al])=>(
                      <th key={h} style={{padding:'8px 12px',textAlign:al,fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:600,fontFamily: T.font.sans,whiteSpace:'nowrap' as const}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BANKS.filter(b=>!filterSpiti||b.spiti_mou).map((bank,i)=>(
                    <tr key={bank.id||bank.name} onMouseEnter={()=>setHoverBankRow(i)} onMouseLeave={()=>setHoverBankRow(null)} onTouchStart={()=>setHoverBankRow(i)} onTouchEnd={()=>setHoverBankRow(null)} style={{borderBottom:'1px solid var(--border-subtle)',background:hoverBankRow===i?'var(--bg-hover)':'transparent',transition:'background 0.12s'}}>
                      <td style={{padding:'10px 12px'}}>
                        <span style={{fontSize: 'var(--fs-base)',fontWeight:500,fontFamily: T.font.sans,color:'var(--text-primary)'}}>{bank.name}</span>
                      </td>
                      {FIXED_TERM_COLUMNS.map(k=>(
                        <td key={k} style={{padding:'10px 12px',textAlign:'right' as const,fontFamily: T.font.mono,fontVariantNumeric:'tabular-nums',fontSize: 'var(--fs-base)',color:bank[k]?(hoverBankRow===i?'var(--accent)':'var(--text-primary)'):'var(--text-tertiary)',fontWeight:500,transition:'color 0.12s'}}>{cellRate(bank[k])}</td>
                      ))}
                      <td style={{padding:'10px 12px',textAlign:'right' as const,fontFamily: T.font.mono,fontVariantNumeric:'tabular-nums',fontSize: 'var(--fs-base)',color:hoverBankRow===i?'var(--accent)':'var(--text-primary)',transition:'color 0.12s'}}>{bank.variable_spread_min!==undefined?`+${fp(bank.variable_spread_min)} έως +${fp(bank.variable_spread_max)}`:NO_RATE}</td>
                      <td style={{padding:'10px 12px',textAlign:'right' as const,fontFamily: T.font.mono,fontVariantNumeric:'tabular-nums',fontSize: 'var(--fs-base)',color:bank.max_ltv?(hoverBankRow===i?'var(--accent)':'var(--text-primary)'):'var(--text-tertiary)',fontWeight:500,transition:'color 0.12s'}}>{bank.max_ltv?fp(bank.max_ltv):NO_RATE}</td>
                      <td style={{padding:'10px 12px'}}>
                        {bank.spiti_mou
                          ?<span style={{fontSize:12,color:'var(--text-primary)',fontFamily: T.font.sans,fontWeight:500}}>Ναι</span>
                          :<span style={{fontSize:12,color:'var(--text-tertiary)'}}>Όχι</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily: T.font.sans}}>
              Εμφανίζονται τα χαμηλότερα («από») επιτόκια ανά διάρκεια. {RATES_DISCLAIMER} Επιβεβαιωμένα {banksUpdStr}. Πηγή:{' '}
              <a href="https://e-stegastiko.gr" target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>e-stegastiko.gr</a>
            </p>
          </MiniSection>
        </div>
      </LensPanel>)}

      {/* ═══ ΚΡΑΤΙΚΑ ΠΡΟΓΡΑΜΜΑΤΑ ═══ */}
      {openSec==='programs' && (<LensPanel title="Κρατικά προγράμματα" subtitle={openPrograms>0 ? `${openPrograms} ${openPrograms===1?'δέχεται αιτήσεις':'δέχονται αιτήσεις'} από ${activePrograms.length}` : `Κανένα από τα ${activePrograms.length} δεν δέχεται αιτήσεις σήμερα`}>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{padding:'2px 2px 4px'}}>
            <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily: T.font.sans}}>
              Στοιχεία από επίσημες πηγές{' · '}
              <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:'inherit',textDecoration:'none',fontWeight:500,borderBottom:'1px solid var(--border-default)'}}>greece20.gov.gr</a>{', '}
              {/* ΕΔΩ ΚΑΘΟΤΑΝ ΗΜΕΡΟΜΗΝΙΑ ΠΟΥ ΑΝΗΚΕ ΣΕ ΑΛΛΑ ΔΕΔΟΜΕΝΑ. Ηταν η
                  `market.updated_at`, δηλαδή η ώρα που έτρεξε η εργασία των
                  ΕΠΙΤΟΚΙΩΝ, τυπωμένη δίπλα σε δύο κυβερνητικούς συνδέσμους για
                  τα ΠΡΟΓΡΑΜΜΑΤΑ. Δεν έλεγε πότε ελέγχθηκε το greece20.gov.gr:
                  έλεγε πότε ρωτήθηκε η ΕΚΤ. Η προθεσμία κάθε προγράμματος
                  γράφεται στην κάρτα του, με τη δική της ημερομηνία. */}
              <a href="https://ypen.gov.gr" target="_blank" rel="noreferrer" style={{color:'inherit',textDecoration:'none',fontWeight:500,borderBottom:'1px solid var(--border-default)'}}>ypen.gov.gr</a>
            </p>
          </div>

          {activePrograms.map(prog=>{
            const st = stateOf(prog)
            // Η ημερομηνία που δείχνεται είναι αυτή που ΜΕΤΡΑΕΙ για τον χρήστη:
            // όσο δέχεται αιτήσεις, η προθεσμία αίτησης· αφού κλείσουν, η
            // προθεσμία υπογραφής, με το κείμενο να λέει ρητά ποιανού είναι.
            const deadStr = programDateLabel(
              st.acceptsApplications ? (prog.applicationDeadline || prog.deadline) : prog.deadline) || null
            // ΤΟ «ΕΩΣ» ΘΕΛΕΙ ΗΜΕΡΟΜΗΝΙΑ. Το πεδίο της προθεσμίας δέχεται και
            // κείμενο, για προγράμματα χωρίς ανακοινωμένη λήξη: τότε η κεφαλίδα
            // έγραφε «Αιτήσεις έως Χωρίς ανακοινωμένη λήξη», που δεν στέκει ως
            // ελληνικά και στα 320 ξέφευγε 14 έξω από την κάρτα. Οταν δεν είναι
            // ημερομηνία, λέγεται σκέτο.
            const deadIsDate = !!deadStr && /^\d{2}\/\d{2}\/\d{4}$/.test(deadStr)
            const closed = !st.acceptsApplications
            // ΤΟ `nowrap` ΕΒΓΑΖΕ ΤΗΝ ΠΡΟΘΕΣΜΙΑ ΕΞΩ ΑΠΟ ΤΗΝ ΚΑΡΤΑ. Μετρημένο στα
            // 320: το όνομα του προγράμματος και το «Αιτήσεις έως 31/05/2026» δεν
            // χωρούν στην ίδια γραμμή και η ημερομηνία ξέφευγε 14 εικονοστοιχεία.
            // Η προθεσμία επιτρέπεται να πέσει σε δεύτερη γραμμή· να βγει έξω από
            // την κάρτα δεν επιτρέπεται.
            return (
            <MiniSection key={prog.id} title={prog.name} defaultOpen={isSpitiMou2(prog.name) && st.acceptsApplications}
              badges={<>
                <span style={{fontSize: 'var(--fs-xs)',padding:'2px 8px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:closed?'var(--text-tertiary)':'var(--text-primary)',fontWeight:closed?500:600,fontFamily: T.font.sans}}>{st.badge}</span>
              </>}
              meta={deadStr?<span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans}}>{deadIsDate?`${st.acceptsApplications?'Αιτήσεις έως':'Υπογραφές έως'} ${deadStr}`:deadStr}</span>:undefined}
            >
              {/* Η ΠΡΟΤΑΣΗ ΠΟΥ ΕΛΕΙΠΕ. Χωρίς αυτήν, δύο ημερομηνίες κάθονταν
                  δίπλα-δίπλα και ο χρήστης μάντευε ποια τον αφορά. */}
              {st.note&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily: T.font.sans,marginBottom:12,padding:'9px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10}}>{st.note}</p>}
              <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginBottom:10,fontWeight:600,fontFamily: T.font.sans,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>{prog.type}</p>
              <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',lineHeight:1.6,fontFamily: T.font.sans,marginBottom:16}}>{prog.desc}</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:14,marginBottom:12}}>
                <div>
                  <p style={{...labelStyle,marginBottom:10}}>Κριτήρια επιλεξιμότητας</p>
                  {prog.criteria.map((c,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:6}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:'var(--border-subtle)',flexShrink:0,marginTop:5}}/>
                      <span style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.4,fontFamily: T.font.sans}}>{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{...labelStyle,marginBottom:10}}>Βασικά στοιχεία</p>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {programFacts(prog).map((fact,idx,arr)=>(
                      <div key={fact.label} style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:16,padding:'6px 0',borderBottom:idx<arr.length-1?'1px solid var(--border-subtle)':'none'}}>
                        <span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans,flexShrink:0}}>{fact.label}</span>
                        <span style={{fontSize:fact.size,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:fact.color,fontWeight:fact.size>12?700:500,textAlign:'right' as const,lineHeight:1.35}}>{fact.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {(prog.howItWorks||prog.extra||prog.savingsExample)&&(
                <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,marginBottom:12,display:'flex',flexDirection:'column',gap:9}}>
                  {prog.howItWorks&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,fontFamily: T.font.sans}}>{prog.howItWorks}</p>}
                  {prog.extra&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>{prog.extra}</p>}
                  {prog.savingsExample&&<p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>{prog.savingsExample}</p>}
                </div>
              )}
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:14}}>
                {prog.banks.map(b=><span key={b} style={{fontSize: 'var(--fs-xs)',padding:'3px 9px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontFamily: T.font.sans}}>{b}</span>)}
              </div>
              <SourceLinkPill href={prog.url}>Επίσημη σελίδα προγράμματος</SourceLinkPill>
            </MiniSection>
            )
          })}
          {activePrograms.length===0&&(
            <EmptyState
              icon={<Gift size={20}/>}
              title="Κανένα ενεργό πρόγραμμα"
              hint="Τα κρατικά προγράμματα στέγασης εμφανίζονται εδώ μόλις ανοίξει νέος κύκλος."
            />
          )}
        </div>
      </LensPanel>)}

      {/* ═══ ΣΥΣΤΑΣΗ ΚΑΙ ΑΝΑΛΥΣΗ ═══ */}
      {openSec==='advisor' && (<LensPanel title="Το δάνειό σου" subtitle={`Βάσει ${fmtEur(LA)} / ${Y} χρόνια · από τον Υπολογιστή`}>
        <LoanDocScan
          banks={BANKS}
          euribor={market.euribor_3m || MARKET_FALLBACK.euribor_3m}
          defaultPropertyValue={calcState.propertyValue}
          onApply={a=>setAppliedLoan(a)}
          onSaveLoan={handleSaveLoan}
          onOpenCalculator={scrollToCalc}
        />
        {(()=>{
        const cs = calcState
        const ltv = cs.propertyValue>0?(cs.loanAmount/cs.propertyValue)*100:0
        const totalCost = cs.monthly*cs.years*12
        const interestRatio = cs.loanAmount>0?cs.totalInterest/cs.loanAmount:0
        const stressMonthly2 = calcMonthly(cs.loanAmount,cs.effectiveRate+2,cs.years)
        // «Σπίτι μου ΙΙ»: 50% άτοκο + 50% με το επιτόκιο του δανειολήπτη (δύο σκέλη).
        const spitiMonthly = calcMonthly(cs.loanAmount*0.5,0,cs.years)+calcMonthly(cs.loanAmount*0.5,cs.effectiveRate,cs.years)
        const shortMonthly20 = cs.years>20?calcMonthly(cs.loanAmount,cs.effectiveRate,20):0
        const savedByShortening = cs.years>20?(cs.monthly*cs.years*12)-(shortMonthly20*20*12):0
        const extraPay100Saving = (()=>{
          let bal=cs.loanAmount,months=0
          while(bal>0&&months<cs.years*12){bal=bal*(1+cs.effectiveRate/100/12)-(cs.monthly+100);months++}
          return Math.max(0,(cs.years*12-months)/12)
        })()
        // ── Σύσταση καλύτερου δανείου (recommender) ──────────────────────────────
        const needs: UserLoanNeeds = {
          amount: LA, propertyValue: calcState.propertyValue || 0, years: Y,
          purpose: advType, ratePreference: calcState.rateType,
        }
        const euribor = market.euribor_3m || MARKET_FALLBACK.euribor_3m
        const ranked = rankLoans(needs, BANKS, euribor, athensToday())
        const spiti = spitiMouEligibility(needs, athensToday())
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
        // ══ ΔΥΟ ΥΠΟΛΟΓΙΣΜΟΙ ΓΙΑ ΤΟ «ΚΑΛΥΤΕΡΟ ΔΑΝΕΙΟ», ΣΤΗΝ ΙΔΙΑ ΣΥΝΑΡΤΗΣΗ ═════
        //
        // Η ανάγνωση του σεναρίου έλεγε «Καλύτερο σταθερό της αγοράς: Χ% από ΤΡΑΠΕΖΑ»
        // από δική της ταξινόμηση: `BANKS.sort(fixed_min)[0]`. Δηλαδή το φθηνότερο
        // ΔΙΑΦΗΜΙΖΟΜΕΝΟ επιτόκιο, αγνοώντας αν ο δανειολήπτης είναι επιλέξιμος,
        // αγνοώντας το «Σπίτι μου ΙΙ», αγνοώντας την πράσινη έκπτωση και
        // ταξινομώντας με το επιτόκιο αντί για το ΣΥΝΟΛΙΚΟ κόστος. Τριάντα γραμμές
        // πιο κάτω, η κάρτα «Σύσταση καλύτερου δανείου» απαντούσε το ίδιο ερώτημα
        // με τον κανονικό ταξινομητή, που τα λαμβάνει όλα υπόψη.
        //
        // Δύο απαντήσεις στην ίδια ερώτηση, στην ίδια οθόνη· και μπορούσαν να
        // ονομάζουν ΑΛΛΗ τράπεζα. Μένει ο ταξινομητής, που είναι και ο σωστός.
        const bestMonthly = topRec ? topRec.monthlyPayment : cs.monthly
        const savingVsBest = (cs.monthly-bestMonthly)*cs.years*12
        // Παράγοντες που μειώνουν τη βαθμολογία, με αναγνώσιμη περιγραφή.
        const FACTOR:Record<string,{label:string;d:number}> = {
          LTV:{label:'Υψηλό δάνειο προς αξία',d:20}, 'Επιτόκιο':{label:'Υψηλό επιτόκιο',d:15},
          'Κυμαινόμενο':{label:'Κυμαινόμενο επιτόκιο',d:10}, 'Διάρκεια':{label:'Μεγάλη διάρκεια',d:10}, 'Τόκοι':{label:'Υψηλοί συνολικοί τόκοι',d:15},
        }

        return (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>

            {/* ══════════════════════════════════════════════════════════════
                Η ΣΕΙΡΑ: ΠΡΩΤΑ ΤΟ ΔΙΚΟ ΣΟΥ, ΜΕΤΑ ΤΟ ΓΕΝΙΚΟ
                ─────────────────────────────────────────────────────────────
                Το προσωπικό και το γενικό εναλλάσσονταν: στρατηγική (γενική),
                ανάλυση (δική σου), οδηγός (γενικός), τι βλέπω (δικό σου),
                επιλεξιμότητα (δική σου). Ο αναγνώστης άλλαζε ύψος πτήσης πέντε
                φορές σε μία οθόνη.

                Η σειρά τώρα ακολουθεί τις ερωτήσεις με τη σειρά που γίνονται:
                είναι καλό αυτό το δάνειο (βαθμολογία, ανάγνωση, τι να αλλάξεις),
                θα εγκριθώ, υπάρχει κάτι καλύτερο (Σπίτι μου ΙΙ, προγράμματα,
                τράπεζες) και τέλος τι πρέπει να ξέρω (οδηγός, στρατηγική).
            ══════════════════════════════════════════════════════════════ */}
            {/* ── Insight της ημέρας ── */}
            {insight&&(
              <div style={{display:'flex',alignItems:'flex-start',gap:11,padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-default)',borderRadius:12}}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z"/></svg>
                <p style={{fontSize: 'var(--fs-base)',color:'var(--text-primary)',lineHeight:1.55,fontFamily: T.font.sans}}>{insight}</p>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                ΤΡΙΑ ΠΑΝΕΛ ΕΛΕΓΑΝ ΤΑ ΙΔΙΑ ΝΟΥΜΕΡΑ ΜΕ ΤΡΕΙΣ ΔΙΑΤΥΠΩΣΕΙΣ
                ─────────────────────────────────────────────────────────────
                «Ανάλυση δανείου», «Τι βλέπω στο σενάριό σου» και «Τι μπορείς
                να βελτιώσεις» ήταν τρεις κάρτες, η μία κάτω από την άλλη, για
                τον ίδιο ακριβώς έλεγχο. Το ίδιο εύρημα γραφόταν τρεις φορές:

                  · η μπάρα «Τι μειώνει τη βαθμολογία» έβγαζε πλακίδιο
                    «Κυμαινόμενο επιτόκιο −10»·
                  · η ανάγνωση από κάτω έγραφε «Αν ανέβει δύο μονάδες, η δόση
                    γίνεται 780,12 €, δηλαδή 123,60 € παραπάνω τον μήνα»·
                  · και η βελτίωση, τρίτη κάρτα, έγραφε «Με το Euribor δύο
                    μονάδες ψηλότερα η δόση γίνεται 780,12 €, δηλαδή 123,60 €
                    παραπάνω τον μήνα».

                Δύο προτάσεις με τα ΙΔΙΑ δύο ποσά, σε απόσταση μιας κύλισης.
                Το ίδιο και για τη διάρκεια: «Σε 20 χρόνια η δόση γίνεται …
                και γλιτώνεις … τόκους» γραφόταν και στους τόκους και στις
                βελτιώσεις.

                ΤΩΡΑ ΕΙΝΑΙ ΕΝΑ ΠΑΝΕΛ ΚΑΙ ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΕΥΡΗΜΑ: τι ισχύει,
                πόσο κοστίζει στη βαθμολογία (δεξιά) και τι κάνεις γι' αυτό
                (τελευταία πρόταση). Οποιο εύρημα δεν κοστίζει βαθμούς δεν
                έχει αριθμό δεξιά και δεν ζητά κίνηση.
            ══════════════════════════════════════════════════════════════ */}
            {(()=>{
              const c = score>=80?'var(--accent)':'var(--text-primary)'
              // Το κόστος κάθε ευρήματος στη βαθμολογία, από την ΙΔΙΑ πηγή που
              // το αφαίρεσε. Οταν δεν υπάρχει, η γραμμή είναι απλή διαπίστωση.
              const cost = (k:string)=> issues.includes(k)
                ? <span style={{fontSize:12,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)',fontWeight:700,whiteSpace:'nowrap' as const}}>−{FACTOR[k].d}</span>
                : null
              // Η κίνηση μπαίνει στο ΤΕΛΟΣ της ίδιας γραμμής, όχι σε δική της
              // κάρτα: «τι ισχύει» και «τι κάνω» είναι μία σκέψη.
              const ltvFix = issues.includes('LTV') ? ' Με προκαταβολή που ρίχνει τον δείκτη κάτω από 80% παίρνεις καλύτερο επιτόκιο και ευκολότερη αποδοχή.' : ''
              const rateFix = issues.includes('Επιτόκιο') ? ` Ζήτησε γραπτές προσφορές από τρεις τράπεζες: μειώσεις ${fp(0.10)} έως ${fp(0.25)} είναι συνηθισμένες.` : ''
              const varFix = issues.includes('Κυμαινόμενο') ? ' Το σταθερό κλειδώνει τη δόση για όλη τη διάρκεια.' : ''
              return (
              <MiniSection title="Ανάλυση δανείου" defaultOpen meta={<span style={{fontSize:12,color:'var(--text-secondary)',fontFamily: T.font.sans,fontWeight:600,whiteSpace:'nowrap' as const}}>{scoreLabel}</span>}>
                <div style={{display:'flex',alignItems:'center',gap:22,flexWrap:'wrap'}}>
                  <div onMouseEnter={()=>setScoreHover(true)} onMouseLeave={()=>setScoreHover(false)}
                    onTouchStart={()=>setScoreHover(true)} onTouchEnd={()=>setScoreHover(false)}
                    style={{display:'flex',alignItems:'baseline',gap:5,flexShrink:0,cursor:'default'}}>
                    <span style={{fontSize:28,fontWeight:700,color:scoreHover?'var(--accent)':'var(--text-primary)',fontFamily: T.font.sans,letterSpacing:'-0.04em',fontVariantNumeric:'tabular-nums',lineHeight:1,transition:'color 0.15s'}}>{score}</span>
                    <span style={{fontSize:15,color:'var(--text-tertiary)',fontFamily: T.font.sans,fontWeight:600}}>/ 100</span>
                  </div>
                  <div style={{flex:1,minWidth:220}}>
                    <div style={{position:'relative',height:10,borderRadius:6,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
                      <div style={{width:`${score}%`,height:'100%',borderRadius:6,background:c,transition:'width 0.4s ease'}}/>
                      <div style={{position:'absolute',left:'60%',top:0,bottom:0,width:0,borderLeft:'1px dashed var(--text-tertiary)',opacity:0.5}}/>
                      <div style={{position:'absolute',left:'80%',top:0,bottom:0,width:0,borderLeft:'1px dashed var(--text-tertiary)',opacity:0.5}}/>
                    </div>
                    <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:7,fontFamily: T.font.sans}}>Όρια: αποδεκτό 60 · υγιές 80. Βάσει {fmtEur(cs.loanAmount)} · {cs.years} έτη · {fmtPct(cs.effectiveRate)} {cs.rateType==='variable'?'κυμαινόμενο':'σταθερό'}.</p>
                  </div>
                </div>

                <div style={{marginTop:16}}>
                  <FindingRow
                    right={cost('LTV')}
                    title={`Δάνειο προς αξία ${fp(ltv)}: ${ltv>85?'υψηλό, απαιτεί προσοχή':ltv>70?'μέτριο, αποδεκτό':'καλό, εντός ορίων'}`}
                    body={ltv>85
                      ? `Χρηματοδοτείς το ${fp(ltv)} της αξίας. Οι τράπεζες είναι επιφυλακτικές πάνω από 80%.${ltvFix}`
                      : `Ίδια κεφάλαια ${fmtEur(cs.propertyValue-cs.loanAmount)}, δηλαδή ${fp(100-ltv)} της αξίας. ${ltv>70?'Εντός αποδεκτών ορίων.':'Ενισχύει τη διαπραγματευτική σου θέση.'}`}
                  />

                  <FindingRow
                    right={cost('Επιτόκιο') ?? cost('Κυμαινόμενο')}
                    title={<>Επιτόκιο {fmtPct(cs.effectiveRate)}, {cs.rateType==='variable'?'κυμαινόμενο':'σταθερό'}
                      {cs.rateType==='variable'&&<span title="Διατραπεζικό επιτόκιο ευρώ, βάση κυμαινόμενων δανείων" style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginLeft:8,fontWeight:400}}>εκτεθειμένο σε Euribor</span>}</>}
                    body={cs.rateType==='variable'
                      ? `Τρέχον Euribor τριμήνου ${fmtPct(market.euribor_3m)}. Αν ανέβει δύο μονάδες, η δόση γίνεται ${fmtEur(stressMonthly2)}, δηλαδή ${fmtEur(stressMonthly2-cs.monthly)} παραπάνω τον μήνα.${varFix}${rateFix}`
                      : topRec&&savingVsBest>0
                      // Η ΤΡΑΠΕΖΑ ΟΝΟΜΑΖΕΤΑΙ ΜΙΑ ΦΟΡΑ ΣΤΟΝ ΦΑΚΟ. Εδώ γραφόταν
                      // «2,40% από Eurobank, δόση 656,52 €» και τρία πάνελ πιο
                      // κάτω η «Σύσταση καλύτερου δανείου» έγραφε τα ίδια τρία
                      // μεγέθη ξανά, με το κουμπί που τα εφαρμόζει. Η διάγνωση
                      // κρατά αυτό που είναι δικό της (πόσο χάνεις)· το όνομα,
                      // το επιτόκιο και η δόση ζουν εκεί που πατιούνται.
                      ? `Υπάρχει φθηνότερο επιτόκιο για το προφίλ σου: θα γλίτωνες ${fmtEur(savingVsBest)} στη διάρκεια.${rateFix}`
                      : topRec
                      ? `Καμία τράπεζα του πίνακα δεν δίνει φθηνότερο. Euribor τριμήνου ${fmtPct(market.euribor_3m)}, από το οποίο είσαι προστατευμένος.`
                      : `Σταθερή δόση για όλη τη διάρκεια. Euribor τριμήνου ${fmtPct(market.euribor_3m)}, από το οποίο είσαι προστατευμένος.`}
                  />

                  <FindingRow last
                    right={cost('Τόκοι') ?? cost('Διάρκεια')}
                    title={`Συνολικοί τόκοι ${fmtEur(cs.totalInterest)}, ${fp(interestRatio*100)} επί του κεφαλαίου`}
                    body={<>Για {fmtEur(cs.loanAmount)} αποπληρώνεις συνολικά {fmtEur(totalCost)}.
                      {cs.years>20&&savedByShortening>0
                        ? ` Σε 20 χρόνια η δόση γίνεται ${fmtEur(shortMonthly20)}, δηλαδή ${fmtEur(shortMonthly20-cs.monthly)} παραπάνω, με ${fmtEur(savedByShortening)} λιγότερους τόκους.`
                        : ` Έκτακτη πληρωμή 100 € τον μήνα κόβει ${extraPay100Saving.toFixed(1).replace('.',',')} χρόνια από τη διάρκεια.`}</>}
                  />
                </div>
                {/* ΤΟ «ΑΡΙΣΤΟ ΠΡΟΦΙΛ ΔΑΝΕΙΟΥ» ΕΦΥΓΕ. Η ίδια ετυμηγορία γραφόταν
                    τρεις φορές μέσα σε δεκαπέντε εικονοστοιχεία: το σήμα δεξιά
                    έλεγε «Υγιές δάνειο», ο αριθμός έλεγε «100 / 100» με γεμάτη
                    μπάρα και από κάτω μια πρόταση το ξανάλεγε με τρίτη
                    διατύπωση. Η απουσία επισημάνσεων ΕΙΝΑΙ το μήνυμα. */}
              </MiniSection>
              )
            })()}
            {/* ── Θα εγκριθώ; — διαδραστική εκτίμηση πιθανότητας έγκρισης ── */}
            {/* ΤΟ ΣΗΜΑ «ΝΕΟ» ΔΕΝ ΕΙΧΕ ΗΜΕΡΟΜΗΝΙΑ, ΑΡΑ ΔΕΝ ΕΛΗΓΕ ΠΟΤΕ. Δύο πάνελ
                το φορούσαν μόνιμα, χωρίς να ξέρει κανείς νέο από πότε και νέο
                για ποιον: ο χρήστης που ανοίγει σήμερα την εφαρμογή δεν έχει
                δει παλαιότερη έκδοση, οπότε το σήμα δεν του λέει τίποτα· και σε
                έξι μήνες θα λέει ψέματα. Το «καινούργιο» είναι ανακοίνωση με
                ημερομηνία λήξης· χωρίς αυτήν είναι διακόσμηση. */}
            <MiniSection title="Πιθανότητα έγκρισης" meta={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans,whiteSpace:'nowrap' as const}}>Δανειοληπτικό προφίλ</span>}>
              <ApprovalPanel
                amount={LA} years={Y} ratePct={cs.effectiveRate} propertyValue={cs.propertyValue}
                incomeMonthly={calcState.incomeMonthly} borrowerType={advBorr}
                firstTimeBuyerDefault={advType==='first_home'} fmtEur={fmtEur}
              />
            </MiniSection>

            {/* ── Σπίτι μου ΙΙ, για σένα — όταν αφορά (πρώτη κατοικία ή νέος/οικογένεια) ── */}
            {spitiPanelShown && (
              <MiniSection title="Σπίτι μου ΙΙ, για σένα" badges={<span style={{fontSize: 'var(--fs-xs)',padding:'2px 8px',borderRadius:8,background:'var(--accent-dim)',border:'1px solid var(--border-accent)',color:'var(--accent)',fontWeight:600,fontFamily: T.font.sans}}>50% άτοκο</span>}>
                <SpitiMouPanel
                  amount={LA} propertyValue={cs.propertyValue} years={Y} bankRatePct={cs.effectiveRate}
                  incomeMonthly={calcState.incomeMonthly} marital={calcState.marital} childCount={calcState.children}
                  sqm={calcState.sqm ?? propertySqm} yearBuilt={propertyYearBuilt}
                  banks={BANKS} euribor={euribor} fmtEur={fmtEur} fmtPct={fmtPct} onOpenCalculator={scrollToCalc}
                />
              </MiniSection>
            )}

            {/* ═══ Η ΕΠΙΛΕΞΙΜΟΤΗΤΑ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΜΗΧΑΝΗ, ΟΧΙ ΑΠΟ ΔΥΟ ΜΕΝΟΥ ═══
                ΤΟ ΣΦΑΛΜΑ. Η λίστα έκρινε το «Σπίτι μου ΙΙ» επιλέξιμο όταν ο
                χρήστης είχε διαλέξει «Πρώτη κατοικία» και τύπο δανειολήπτη «νέος»
                ή «οικογένεια» — και τίποτε άλλο. Τριάντα γραμμές πιο πάνω, στο
                ΙΔΙΟ σκοπευτικό πεδίο, καθόταν το `spiti` της `spitiMouEligibility`,
                που ελέγχει ηλικία, εισόδημα, αξία, εμβαδόν, έτος κατασκευής ΚΑΙ τις
                δύο προθεσμίες. Η οθόνη το αγνοούσε.

                Στις 19/08/2026 αυτό σήμαινε: «Πληροίς τα κριτήρια, δόση από …»
                για πρόγραμμα του οποίου οι αιτήσεις έκλεισαν στις 31/05/2026. Ο
                χρήστης διάβαζε ότι προλαβαίνει· δεν προλάβαινε.

                ΚΑΙ ΟΙ ΠΡΟΘΕΣΜΙΕΣ ΗΤΑΝ ΓΡΑΜΜΕΝΕΣ ΜΕ ΤΟ ΧΕΡΙ μέσα στις ετικέτες
                («προθεσμία 31/08/2026», δύο φορές), ενώ ζουν στα δεδομένα του
                προγράμματος. Το lib/loans/programStatus.ts γράφτηκε ακριβώς για να
                μην ξανασυμβεί αυτό και εδώ είχε ξανασυμβεί.

                ΤΩΡΑ: η κατάσταση κάθε προγράμματος έρχεται από την ημερομηνία, το
                «Σπίτι μου ΙΙ» ρωτά τη μηχανή και όσα ισχύουν ανεβαίνουν πάνω. ═══ */}
{(()=>{
              // ══ Ο ΚΑΤΑΛΟΓΟΣ ΤΩΝ ΠΡΟΓΡΑΜΜΑΤΩΝ ΗΤΑΝ ΓΡΑΜΜΕΝΟΣ ΔΕΥΤΕΡΗ ΦΟΡΑ ΕΔΩ ══
              //
              // Ο φακός «Προγράμματα» δείχνει τον κανονικό κατάλογο, με πηγή,
              // προθεσμίες και κριτήρια. Αυτή η κάρτα έγραφε τη ΔΙΚΗ της λίστα με
              // πέντε χειρόγραφες γραμμές· και οι δύο λίστες δεν συμφωνούσαν:
              //
              //   · Τρία υπαρκτά προγράμματα έλειπαν εντελώς από εδώ (Εξοικονομώ
              //     2025, Εξοικονομώ 2026, Ανακαινίζω και Νοικιάζω), δηλαδή η κάρτα
              //     που υπόσχεται «ποια σε αφορούν» δεν τα εξέταζε καν.
              //   · Δύο γραμμές δεν ήταν κρατικά προγράμματα: το «Πράσινο δάνειο»
              //     είναι έκπτωση περιθωρίου της τράπεζας, που ο ταξινομητής την
              //     εφαρμόζει ήδη· και το «ΑΟΟΑ» δεν έχει ούτε προθεσμία ούτε
              //     κριτήρια ούτε σύνδεσμο, δηλαδή τίποτα να επαληθευτεί.
              //   · Η «Γέφυρα 3» εμφανιζόταν κάτω από τίτλο «κρατικών
              //     προγραμμάτων» ενώ η ίδια της η περιγραφή λέει ότι είναι
              //     πρωτοβουλία των τραπεζών.
              //   · Η προθεσμία που έδειχνε ήταν πάντα η ημερομηνία ΥΠΟΓΡΑΦΗΣ. Ο
              //     φακός το κάνει σωστά: όσο δέχεται αιτήσεις, δείχνει την
              //     προθεσμία ΑΙΤΗΣΗΣ. Στις 31/08/2026 η κάρτα έγραφε «Σπίτι μου ΙΙ,
              //     προθεσμία 31/08/2026» ενώ οι αιτήσεις είχαν κλείσει στις 31/05.
              //
              // Τώρα η λίστα βγαίνει από τον ΙΔΙΟ κατάλογο. Το «αν με αφορά» το
              // κρίνει, ανά πρόγραμμα, ό,τι λέει το ίδιο το πρόγραμμα για τον εαυτό
              // του: η μηχανή του «Σπίτι μου ΙΙ», ο σκοπός του δανείου για τα
              // ενεργειακά και την ανακαίνιση, ο τύπος επιτοκίου για τη Γέφυρα.
              const rows = activePrograms.map(prog=>{
                const st = stateOf(prog)
                const open = st.acceptsApplications
                // Η ημερομηνία που μετράει για τον χρήστη, όπως και στον φακό.
                const when = programDateLabel(open ? (prog.applicationDeadline || prog.deadline) : prog.deadline)
                const shut = open ? null : (st.note || 'Οι αιτήσεις έκλεισαν')
                if (prog.id==='spiti_mou_2') return {
                  id: prog.id, l: prog.name, when, url: prog.url,
                  el: open && spiti.eligible && advType==='first_home',
                  reason: shut ?? (advType!=='first_home' ? 'Αφορά πρώτη και κύρια κατοικία'
                    : spiti.eligible ? `Πληροίς τα κριτήρια. Δόση από ${fmtEur(spitiMonthly)} τον μήνα`
                    : (spiti.reasons.find(r=>/έκλεισ|κλείσ|εκτός|Απαιτείται|>|</.test(r)) || 'Δεν πληρούνται τα κριτήρια')),
                  badge: open && spiti.eligible && advType==='first_home' ? `−${fmtEur(cs.monthly-spitiMonthly)} τον μήνα` : null,
                }
                if (prog.id==='anavathmizo') return {
                  id: prog.id, l: prog.name, when, url: prog.url,
                  el: open && advType==='energy',
                  reason: shut ?? (advType==='energy'
                    ? `Κατάλληλο. Δάνειο έως ${fmtEur(prog.maxAmount ?? 25000)} χωρίς τόκο για τον δανειολήπτη`
                    : 'Επίλεξε «Ενεργειακή αναβάθμιση» στον Υπολογιστή'),
                  badge: open && advType==='energy' ? 'Χωρίς τόκο' : null,
                }
                if (prog.id.startsWith('exoikonomo')) return {
                  id: prog.id, l: prog.name, when, url: prog.url,
                  el: open && advType==='energy',
                  reason: shut ?? (advType==='energy' ? 'Επιδότηση ενεργειακής αναβάθμισης, δες τα κριτήρια'
                    : 'Επίλεξε «Ενεργειακή αναβάθμιση» στον Υπολογιστή'),
                  badge: null,
                }
                if (prog.id==='anakainizo_noikazo') return {
                  id: prog.id, l: prog.name, when, url: prog.url,
                  el: open && advType==='renovation',
                  reason: shut ?? (advType==='renovation'
                    ? 'Επιδότηση ανακαίνισης και εγγυημένο ενοίκιο από τον ΟΠΕΚΑ'
                    : 'Επίλεξε «Ανακαίνιση» στον Υπολογιστή'),
                  badge: null,
                }
                if (prog.id==='gefyra_3') return {
                  id: prog.id, l: prog.name, when, url: prog.url,
                  el: open && cs.rateType==='variable',
                  reason: shut ?? (cs.rateType==='variable'
                    ? 'Πρωτοβουλία των τραπεζών, όχι κρατική επιδότηση. Απαιτείται βεβαίωση ευάλωτου οφειλέτη'
                    : 'Αφορά μόνο κυμαινόμενα επιτόκια'),
                  badge: null,
                }
                // Πρόγραμμα που ο κατάλογος γνωρίζει αλλά δεν έχει κανόνα εδώ: δεν
                // λέμε «όχι», λέμε ότι δεν το κρίναμε.
                return { id: prog.id, l: prog.name, when, url: prog.url, el: false,
                  reason: shut ?? 'Δες τα κριτήρια του προγράμματος', badge: null }
              })
              // Οσα ισχύουν, πρώτα. Μια λίστα που ξεκινά με «όχι» διαβάζεται ως
              // άρνηση· η ίδια λίστα ταξινομημένη διαβάζεται ως ευκαιρία.
              const sorted = [...rows].sort((a,b)=>Number(b.el)-Number(a.el))
              const yes = sorted.filter(r=>r.el).length
              return (
              <MiniSection title="Επιλεξιμότητα προγραμμάτων"
                meta={<span style={{fontSize:12,color:'var(--text-secondary)',fontFamily: T.font.sans,fontWeight:600,whiteSpace:'nowrap' as const}}>{yes>0?`${yes} από ${sorted.length} σε ισχύ για σένα`:'κανένα αυτή τη στιγμή'}</span>}>
                <div>
                  {sorted.map((item,i)=>(
                    <FindingRow key={item.id} last={i===sorted.length-1}
                      lead={<span style={{width:20,height:20,marginTop:1,borderRadius:'50%',background:item.el?'var(--accent-dim)':'var(--bg-elevated)',border:item.el?'none':'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {item.el
                          ?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                          :<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                      </span>}
                      title={<span style={{color:item.el?'var(--text-primary)':'var(--text-secondary)',fontWeight:item.el?500:400}}>
                        {item.l}{item.when?<span style={{color:'var(--text-tertiary)',fontWeight:400}}>, {item.when}</span>:null}
                      </span>}
                      body={<span style={{color:'var(--text-tertiary)'}}>{item.reason}</span>}
                      right={item.badge?<span style={{fontSize: 'var(--fs-xs)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--accent)',background:'var(--accent-dim)',padding:'2px 8px',borderRadius:8,whiteSpace:'nowrap' as const}}>{item.badge}</span>:null}
                    />
                  ))}
                </div>
              </MiniSection>
              )
            })()}

            {/* ── Σύσταση καλύτερου δανείου — premium, πτυσσόμενη ── */}
            {/* Η ΚΛΕΙΣΤΗ ΓΡΑΜΜΗ ΕΔΙΝΕ ΤΑ ΔΕΔΟΜΕΝΑ, ΟΧΙ ΤΗΝ ΑΠΑΝΤΗΣΗ. Το `meta`
                έγραφε «120.000 € / 25 έτη», δηλαδή ό,τι έβαλε ο ίδιος ο χρήστης
                στον Υπολογιστή δύο οθόνες πιο πάνω. Ο κανόνας του αρχείου είναι
                ότι η κλειστή ενότητα λέει ΤΙ ΥΠΑΡΧΕΙ χωρίς να την ανοίξεις: εδώ
                αυτό είναι το όνομα της τράπεζας και το επιτόκιό της. */}
            <MiniSection title="Σύσταση καλύτερου δανείου" meta={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap' as const}}>{topRec ? `${topRec.bankName} · ${fmtPct(topRec.effectiveRatePct)}` : `${fmtEur(LA)} / ${Y} έτη`}</span>}>
              {topRec && (
                <div onMouseEnter={()=>setRecHover(true)} onMouseLeave={()=>setRecHover(false)}
                  onTouchStart={()=>setRecHover(true)} onTouchEnd={()=>setRecHover(false)}
                  style={{position:'relative',overflow:'hidden',borderRadius: T.radius.card,padding:'13px 16px',marginBottom:10,
                  background:'var(--bg-surface)',
                  border:`1px solid ${recHover?'var(--border-default)':'var(--border-subtle)'}`,
                  boxShadow:recHover?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent), 0 10px 22px -14px color-mix(in srgb, var(--text-primary) 22%, transparent)':'0 1px 2px color-mix(in srgb, var(--text-primary) 6%, transparent)',transition:'border-color 0.15s, box-shadow 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
                    <div style={{minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:5}}>
                        <span style={{fontSize: 'var(--fs-xs)',padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:600,fontFamily: T.font.sans,letterSpacing:'0.02em'}}>Καλύτερη επιλογή</span>
                        {topRec.spitiMouApplied&&<span style={{fontSize: 'var(--fs-xs)',padding:'2px 8px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:500,fontFamily: T.font.sans}}>Σπίτι μου ΙΙ</span>}
                      </div>
                      <p style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily: T.font.sans,letterSpacing:'-0.02em',lineHeight:1.1}}>{topRec.bankName}</p>
                      <p style={{fontSize:12,color:'var(--text-secondary)',marginTop:3,lineHeight:1.45,fontFamily: T.font.sans}}>{topRec.eligible?topRec.why:topRec.blockers.join(' · ')}</p>
                      {topRec.eligible&&(
                        <button onClick={()=>applyBank(topRec.nominalRatePct, topRec.rateType, topRec.bankName)}
                          onMouseEnter={()=>setApplyHover(true)} onMouseLeave={()=>setApplyHover(false)}
                          onTouchStart={()=>setApplyHover(true)} onTouchEnd={()=>setApplyHover(false)}
                          style={{marginTop:10,display:'inline-flex',alignItems:'center',gap:6,height:T.h.sm,padding:'0 13px',borderRadius: T.radius.card,background:applyHover?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${applyHover?'var(--border-accent)':'var(--border-subtle)'}`,color:applyHover?'var(--accent)':'var(--text-secondary)',fontSize:12,fontWeight:600,fontFamily: T.font.sans,cursor:'pointer',transition:'color 0.15s, background 0.15s, border-color 0.15s'}}>
                          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                          Εφαρμογή στον Υπολογιστή
                        </button>
                      )}
                    </div>
                    <div style={{textAlign:'right' as const,flexShrink:0}}>
                      <p style={{fontSize:22,fontWeight:700,color:recHover?'var(--accent)':'var(--text-primary)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',lineHeight:1,letterSpacing:'-0.03em',transition:'color 0.15s'}}>{fmtPct(topRec.effectiveRatePct)}</p>
                      <p style={{fontSize: 'var(--fs-base)',color:'var(--text-primary)',marginTop:5,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',fontWeight:600}}>{fmtEur(topRec.monthlyPayment)} τον μήνα</p>
                      <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:2,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums'}}>Σύνολο {fmtEur(topRec.totalCost)}</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Σύνοψη «Σπίτι μου ΙΙ» — μόνο όταν ΔΕΝ δείχνεται το πλήρες πάνελ πιο πάνω
                  (αποφυγή διπλής εμφάνισης της ίδιας πληροφορίας στη ροή πρώτης κατοικίας). */}
              {!spitiPanelShown && (
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',marginBottom:otherRecs.length?12:0,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
                <div style={{minWidth:0}}>
                  <p style={{fontSize: 'var(--fs-base)',fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)'}}>Σπίτι μου ΙΙ: {spiti.eligible?'πιθανώς επιλέξιμο':'μη επιλέξιμο'} <span style={{color:'var(--text-secondary)',fontWeight:400}}>· {Math.round(spiti.interestFreeShare*100)}% άτοκο</span></p>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',lineHeight:1.5,marginTop:2,fontFamily: T.font.sans}}>{spiti.reasons.slice(0,3).join(' · ')}. Ενδεικτικό, επιβεβαίωσε στην πύλη.</p>
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
                        <span style={{fontSize: 'var(--fs-base)',fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0}}>{r.bankName||'Τράπεζα'}</span>
                        {r.spitiMouApplied&&<span style={{flexShrink:0,fontSize: 'var(--fs-xs)',padding:'2px 7px',borderRadius:8,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:500,fontFamily: T.font.sans}}>Σπίτι μου ΙΙ</span>}
                        <div style={{marginLeft:'auto',flexShrink:0,display:'flex',alignItems:'baseline',gap:12}}>
                          <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap' as const}}>{fmtEur(r.monthlyPayment)}/μήνα</span>
                          <span style={{fontSize:14,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:on?'var(--accent)':'var(--text-primary)',fontWeight:700,lineHeight:1,transition:'color 0.15s',minWidth:52,textAlign:'right' as const}}>{fmtPct(r.effectiveRatePct)}</span>
                          {!r.eligible && <InfoDot text={r.blockers.join(' · ')}/>}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </MiniSection>
              )}
              <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily: T.font.sans}}>{RATES_DISCLAIMER}</p>
            </MiniSection>

            {/* ── Ανάλυση προσφοράς ESIS — τεχνικό εργαλείο, μόνο σε λειτουργία επαγγελματία ── */}
            {profile==='business' && (
            <MiniSection title="Ανάλυση προσφοράς ESIS" meta={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans,whiteSpace:'nowrap' as const}}>Πραγματικό κόστος, ΣΕΠΠΕ</span>}>
              <EsisScanPanel
                defaultAmount={LA} defaultYears={Y}
                benchmarkAprc={topRec?Math.round((topRec.effectiveRatePct+0.3)*100)/100:undefined}
                fmtEur={fmtEur}
              />
            </MiniSection>
            )}


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
                {t:'Απόσβεση κτιρίου', b:'Το κτηριακό μέρος (όχι το οικόπεδο) αποσβένεται και μειώνει το φορολογητέο αποτέλεσμα κάθε χρόνο. Συνδυασμένο με τους τόκους, βελτιώνει ουσιαστικά την καθαρή απόδοση.'},
                {t:'Χρηματοδότηση και εξασφαλίσεις', b:'Τυπικό δάνειο προς αξία 60–70%. Ζητούνται ισολογισμοί τριετίας, απόφαση διοίκησης και συνήθως προσωπική εγγύηση. Προετοίμασε ενημερότητες ΑΑΔΕ και ΕΦΚΑ έγκαιρα.'},
                {t:'Ανάπτυξη χαρτοφυλακίου με μόχλευση', b:'Η μόχλευση επιταχύνει την ανάπτυξη μόνο όταν η καθαρή απόδοση του ακινήτου υπερβαίνει το κόστος δανεισμού. Κράτα απόθεμα ρευστότητας για κενές περιόδους και συντήρηση.'},
              ] : [
                // Το «ΑΟΟΑ» καθόταν στη λίστα «Επιλεξιμότητα κρατικών προγραμμάτων»
                // χωρίς προθεσμία, χωρίς κριτήρια και χωρίς σύνδεσμο: τίποτα να
                // επαληθευτεί, δίπλα σε προγράμματα με πηγή. Είναι υπόδειξη προς
                // φορέα, όχι πρόγραμμα με όρους· και ζει εκεί που δίνονται οι
                // υποδείξεις ανά προφίλ.
                ...(advBorr==='military' ? [{t:'Ταμεία των Ενόπλων Δυνάμεων', b:'Ο ΑΟΟΑ και το Ταμείο Παρακαταθηκών δίνουν στεγαστικά με δικούς τους όρους, συχνά ευνοϊκότερους από την αγορά. Ζήτησέ τους γραπτή προσφορά και σύγκρινέ την με τις τράπεζες του πίνακα.'}] : []),
                {t:'Αξιοποίηση κρατικών προγραμμάτων', b:'Για πρώτη κατοικία, το «Σπίτι μου ΙΙ» μειώνει δραστικά το κόστος (50% άτοκο). Έλεγξε την επιλεξιμότητα πριν επιλέξεις τράπεζα· δεν επιτρέπονται ταυτόχρονες αιτήσεις.'},
                {t:'Πειθαρχία στον δείκτη δόσης', b:'Όρια της Τράπεζας της Ελλάδος από 1/1/2025 (ΠΕΕ 227/1/2024): δόση έως 50% του εισοδήματος για όσους δανείζονται για πρώτη φορά, 40% για τους υπόλοιπους. Το κριτήριο είναι ο πρωτοαγοραστής, όχι η πρώτη κατοικία: όποιος έχει ήδη ακίνητο ή προηγούμενο στεγαστικό μετρά στο 40%.'},
                {t:'Αύξηση αξίας με ενεργειακή αναβάθμιση', b:'Προγράμματα όπως «Εξοικονομώ» και «Αναβαθμίζω» ανεβάζουν την ενεργειακή κλάση, την αξία και το ενοίκιο, με επιδοτούμενο επιτόκιο και επιχορήγηση.'},
                // ══ Η ΓΡΑΜΜΗ ΕΛΕΓΕ ΣΕ ΣΤΑΘΕΡΟ ΔΑΝΕΙΟ ΟΤΙ Η ΔΟΣΗ ΤΟΥ ΘΑ ΑΝΕΒΕΙ ══
                //
                // Το κείμενο ήταν ένα και το ίδιο για τους δύο τύπους επιτοκίου:
                // «Το σταθερό επιτόκιο προστατεύει από αυξήσεις. Στο τρέχον
                // σενάριο, αύξηση Euribor +2% θα ανέβαζε τη δόση κατά 123,60 €
                // τον μήνα.» Οι δύο προτάσεις αναιρούν η μία την άλλη: αν το
                // δάνειο είναι σταθερό, η δόση ΔΕΝ ανεβαίνει με το Euribor. Ο
                // κάτοχος σταθερού διάβαζε ότι κινδυνεύει ενώ δεν κινδυνεύει.
                //
                // Και ήταν η ΤΡΙΤΗ γραφή του ίδιου ποσού στην ίδια οθόνη, μετά
                // την ανάγνωση του σεναρίου και τις βελτιώσεις. Πλέον το ποσό
                // γράφεται μία φορά, στην Ανάλυση· και εδώ μόνο όταν δεν το
                // έχει ήδη πει: δηλαδή στα σταθερά, ως υποθετικό.
                {t:'Σταθερότητα δόσης', b: cs.rateType==='variable'
                  ? 'Η δόση σου ακολουθεί το Euribor: κάθε αναπροσαρμογή την αλλάζει. Το σταθερό επιτόκιο κλειδώνει το ποσό για όλη τη διάρκεια και το κόστος της προστασίας είναι η διαφορά των δύο επιτοκίων σήμερα.'
                  : `Η δόση σου είναι κλειδωμένη: αύξηση του Euribor δεν την αγγίζει. Αν είχες κυμαινόμενο, δύο μονάδες πάνω θα την ανέβαζαν κατά ${fmtEur(calcMonthly(cs.loanAmount,cs.effectiveRate+2,cs.years)-cs.monthly)} τον μήνα.`},
              ]
              return (
                <MiniSection title="Στρατηγική ανά προφίλ" meta={<span style={{fontSize: 'var(--fs-xs)',padding:'2px 10px',borderRadius:8,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',color:'var(--text-secondary)',fontWeight:600,fontFamily: T.font.sans}}>{kindLabel}</span>}>
                  <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',lineHeight:1.65,fontFamily: T.font.sans,marginBottom:14}}>{intro}</p>
                  <div>
                    {rows.map((r,i)=>(<FindingRow key={r.t} title={r.t} body={r.b} last={i===rows.length-1}/>))}
                  </div>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:12,lineHeight:1.6,fontFamily: T.font.sans}}>Ρύθμισε τον τύπο δανειολήπτη στον Υπολογιστή για να προσαρμοστεί η στρατηγική. Ενημερωτικές πληροφορίες, όχι φορολογική ή νομική συμβουλή.</p>
                </MiniSection>
              )
            })()}

          </div>
        )
      })()}
      </LensPanel>)}

      {/* ═══ Η ΓΝΩΣΗ ΕΓΙΝΕ ΔΙΚΟΣ ΤΗΣ ΦΑΚΟΣ ════════════════════════════════
          Η «Συμβουλευτική» κρατούσε ΔΕΚΑΟΚΤΩ πάνελ στην ίδια κύλιση: έντεκα
          για το δικό σου σενάριο και επτά εγκυκλοπαιδικά (πώς λειτουργεί ένα
          στεγαστικό, γιατί απορρίπτεται μια αίτηση, ειδικές κατηγορίες,
          ιστορικό Euribor, κόκκινα δάνεια, γλωσσάρι, πηγές). Οποιος ήθελε το
          γλωσσάρι περνούσε από τη βαθμολογία του δανείου του· όποιος ήθελε τη
          βαθμολογία δεν έβλεπε πού τελειώνει η σελίδα.

          ΓΙΑΤΙ ΤΩΡΑ ΔΟΥΛΕΥΕΙ ΕΝΩ ΤΟΤΕ ΟΧΙ. Ο παλιός χωρισμός ήταν «Σύσταση»
          και «Μάθε περισσότερα»: δύο ονόματα που και τα δύο υπόσχονται
          συμβουλή, οπότε κανείς δεν ήξερε πού ζει η απάντησή του. «Το δάνειό
          σου» και «Οδηγός» δεν συγχέονται: το ένα έχει τα ΝΟΥΜΕΡΑ σου, το
          άλλο ό,τι ισχύει για όλους. ═══════════════════════════════════ */}
      {openSec==='guide' && (<LensPanel title="Οδηγός δανείου" subtitle="Πώς λειτουργεί η αγορά, τι ζητά η τράπεζα και πού βρίσκεις την πηγή">
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Ο οδηγός του τύπου δανείου καθόταν ΜΕΣΑ στην ανάλυση, με τίτλο
              «Οδηγός, …» — δηλαδή ένα πάνελ ονόματι «Οδηγός» μέσα σε φακό που
              δεν λεγόταν έτσι, ενώ ο φακός «Οδηγός» υπάρχει. Είναι αναφορά, όχι
              ανάγνωση του σεναρίου σου: τυπικό επιτόκιο αγοράς, ανώτατο δάνειο
              προς αξία, φορολογικά και δικαιολογητικά. Πρώτο εδώ, γιατί είναι
              το μόνο κομμάτι της γνώσης που αλλάζει με τον τύπο του δανείου. */}
          {/* ═══ Ο ΟΔΗΓΟΣ ΤΟΥ ΤΥΠΟΥ ΔΑΝΕΙΟΥ ═══════════════════════════════
              ΤΡΙΑ ΙΔΙΑ ΚΟΥΤΙΑ ΓΙΑ ΤΡΕΙΣ ΔΙΑΦΟΡΕΤΙΚΕΣ ΔΟΥΛΕΙΕΣ. Δύο αριθμοί
              και μια νομική σημείωση φορούσαν το ίδιο ακριβώς πλαίσιο, το
              ίδιο φόντο και την ίδια ακτίνα: η κάρτα διαβαζόταν ως τρία
              όμοια πράγματα, ενώ είναι μια αγορά, ένα όριο και ένας φόρος.
              Τώρα είναι ΜΙΑ κατάσταση στοιχείων — ετικέτα πάνω, τιμή κάτω,
              λεπτή γραμμή ανάμεσα. Το πλαίσιο φεύγει, η ιεραρχία μένει.

              ΚΑΙ Η ΠΑΡΑΠΟΜΠΗ ΗΤΑΝ ΚΕΙΜΕΝΟ. Η τελευταία γραμμή έλεγε πού
              βρίσκονται τα δικαιολογητικά· δεν πήγαινε εκεί. Τώρα ανοίγει
              τον φακό «Πίνακας και έγγραφα» του Υπολογιστή και κυλά ως εκεί
              και ο τίτλος του κουμπιού είναι το όνομα του προορισμού. ═══ */}
          {(()=>{ const info=LOAN_TYPES[advType]; const facts=[
            {k:'Τυπικό επιτόκιο αγοράς',v:rateRange(info)},
            {k:'Δάνειο προς αξία έως',  v:fp(info.typical_ltv)},
          ]; return (
            <MiniSection title={info.label} meta={<span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily: T.font.sans,whiteSpace:'nowrap' as const}}>{info.docs.length} δικαιολογητικά</span>}>
              <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',lineHeight:1.6,fontFamily: T.font.sans,margin:'0 0 4px'}}>{info.desc}. {info.notes}.</p>
              {/* Ευέλικτη ροή, όχι πλέγμα auto-fit: σε φαρδιά κάρτα το auto-fit
                  θα άνοιγε τρίτη κενή στήλη και η γραμμή θα σταματούσε στη μέση. */}
              <div style={{display:'flex',flexWrap:'wrap'}}>
                {facts.map(f=>(
                  <div key={f.k} style={{flex:'1 1 190px',minWidth:0,padding:'13px 22px 13px 0',borderTop:'1px solid var(--border-subtle)'}}>
                    <div style={{...labelStyle,marginBottom:6}}>{f.k}</div>
                    <div style={{fontSize:18,fontWeight:600,color:'var(--text-primary)',fontFamily: T.font.num,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.02em'}}>{f.v}</div>
                  </div>
                ))}
                <div style={{flex:'1 1 100%',padding:'13px 0 15px',borderTop:'1px solid var(--border-subtle)'}}>
                  <div style={{...labelStyle,marginBottom:6}}>Φορολογικά και νομικά</div>
                  <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>{info.tax_note}</p>
                </div>
              </div>
              <button type="button" onClick={openCalcDocs} style={{display:'inline-flex',alignItems:'center',gap:9,height:T.h.md,padding:'0 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.btn,cursor:'pointer',color:'var(--text-primary)',fontSize: 'var(--fs-base)',fontWeight:500,fontFamily: T.font.sans}}>
                Απαραίτητα έγγραφα
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>
            </MiniSection>
          ); })()}
          {/* Ο ΠΑΡΑΓΡΑΦΟΣ ΠΟΥ ΕΔΕΙΧΝΕ ΤΟ ΑΜΕΣΩΣ ΑΠΟ ΚΑΤΩ ΕΦΥΓΕ. Ελεγε «Δες πρώτα
              "Πώς λειτουργεί" και "Γιατί απορρίπτεται μια αίτηση"» — δύο τίτλους
              που ο αναγνώστης είχε ήδη μπροστά του, στη σειρά που τους ανέφερε.
              Και η επιφύλαξη «όχι νομική συμβουλή» γραφόταν ήδη στο τέλος της
              Στρατηγικής. Οδηγίες ανάγνωσης για μια λίστα δέκα σειρών είναι
              θόρυβος· η σειρά των τίτλων είναι η οδηγία. */}
          <MiniSection title="Πώς λειτουργεί ένα στεγαστικό δάνειο στην Ελλάδα">
            {[
              {step:1,title:'Προεπιλογή και προετοιμασία',time:'1 έως 2 εβδομάδες',desc:'Υπολόγισε πόσο αντέχεις και μάζεψε τα οικονομικά σου στοιχεία πριν μιλήσεις σε τράπεζα. Το «Σπίτι μου ΙΙ» έκλεισε για νέες αιτήσεις στις 31/05/2026.',tip:'Ξεκίνα από τη δόση που αντέχεις, όχι από το ποσό που θέλεις: η τράπεζα κρίνει με τον δείκτη δόσης προς εισόδημα.',warning:'Οι οφειλές σε ΔΟΥ ή ΕΦΚΑ δεν μπλοκάρουν αυτόματα την έγκριση. Η ενημερότητα ζητείται στο συμβόλαιο, κυρίως από τον πωλητή και εκδίδεται ακόμη και με οφειλές με παρακράτηση από το τίμημα.',url:null},
              {step:2,title:'Συλλογή εγγράφων',time:'1 έως 3 εβδομάδες',desc:'Εκκαθαριστικά, μισθοδοτικές 3 μηνών, Ε9, πιστοποιητικό οικογενειακής κατάστασης. Ελεύθεροι επαγγελματίες: φορολογικές 2 ετών.',tip:'Ζήτησε κάθε έγγραφο εκ των προτέρων, η τράπεζα συχνά ζητά επιπλέον κατά τη διαδικασία.',warning:'Τα Ε1/Ε9 από ΑΑΔΕ, βεβαιώσου ότι είναι ενημερωμένα.',url:null},
              {step:3,title:'Αίτηση στην τράπεζα',time:'1 ημέρα',desc:'Κατάθεσε αίτηση σε δύο ή τρεις τράπεζες και σύγκρινε γραπτές προσφορές, όχι προφορικές.',tip:'Ζήτησε το τυποποιημένο ευρωπαϊκό δελτίο πληροφοριών (ΕΣΔΠ, ESIS) γραπτώς. Ο ν.4438/2016 προβλέπει προθεσμία μελέτης ανάμεσα στη δεσμευτική προσφορά και την υπογραφή: μη δεσμευτείς αυθημερόν.',warning:'Μην υπογράφεις τίποτα την πρώτη μέρα. Μελέτησε το τυποποιημένο ευρωπαϊκό δελτίο πληροφοριών (ESIS).',url:'https://www.bankofgreece.gr'},
              {step:4,title:'Εκτίμηση ακινήτου και νομικός έλεγχος',time:'1 έως 3 εβδομάδες',desc:'Πιστοποιημένος εκτιμητής (RICS ή ΤΕΕ) αξιολογεί το ακίνητο. Νομικός έλεγχος τίτλων στο Κτηματολόγιο.',tip:'Αν η εκτίμηση είναι χαμηλότερη από την τιμή αγοράς, το δάνειο προς αξία υπολογίζεται επί αυτής, ενδέχεται να χρειαστείς επιπλέον κεφάλαια.',warning:'Αυθαίρετα (κλεισμένοι ημιυπαίθριοι, αλλαγές χωρίς άδεια) εμποδίζουν τη μεταβίβαση: ο ν.4495/2017 απαιτεί βεβαίωση μηχανικού επί ποινή ακυρότητας. Δεν είναι οριστικό εμπόδιο, τακτοποιούνται πρώτα. Ζήτησε τεχνικό έλεγχο.',url:'https://www.ktimatologio.gr'},
              {step:5,title:'Έγκριση δανείου',time:'3 έως 10 εργάσιμες',desc:'Η τράπεζα αξιολογεί εισόδημα, Τειρεσία, εκτίμηση και νομικά. Η διάρκεια ισχύος της έγκρισης δεν είναι ενιαία, την ορίζει κάθε τράπεζα: ρώτησε την ημέρα που θα την πάρεις.',tip:'Σε απόρριψη ζήτησε γραπτώς τον λόγο. Επανεξέτασε μετά από έξι μήνες ή άλλαξε τράπεζα.',warning:'Σφραγισμένη επιταγή που δεν εξοφλήθηκε μέσα σε 30 ημέρες καταχωρείται στον Τειρεσία, όπως και ανεξόφλητες οφειλές πάνω από 1.000 €.',url:'https://www.tiresias.gr'},
              {step:6,title:'Συμβόλαιο και εκταμίευση',time:'1 έως 2 εβδομάδες',desc:'Αγοραπωλητήριο ενώπιον συμβολαιογράφου. Η εκταμίευση γίνεται αφού εγγραφεί η προσημείωση υποθήκης και μεταγραφεί το συμβόλαιο στο Κτηματολόγιο.',tip:'Νεόδμητα: απαιτείται ΠΕΑ για τη μεταβίβαση.',warning:'Η φορολογική ενημερότητα ισχύει δύο μήνες, ή έναν με ρυθμισμένες οφειλές. Η ασφαλιστική ισχύει έξι μήνες, ή δύο με ρύθμιση. Συντόνισε την έκδοση με την ημέρα υπογραφής.',url:null},
            ].map((step,i,arr)=>(
              <div key={i} style={{display:'flex',gap:16,alignItems:'flex-start',paddingBottom:20,borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none',marginBottom:i<arr.length-1?20:0}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'var(--bg-surface)',border:'1px solid var(--border-default)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{fontSize: 'var(--fs-base)',fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)',fontWeight:600}}>{step.step}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  {/* Η ΣΥΜΒΟΥΛΗ ΗΤΑΝ ΓΡΑΜΜΕΝΗ ΚΑΙ ΔΕΝ ΕΜΠΑΙΝΕ ΠΟΥΘΕΝΑ. Έξι
                      συμβουλές, μία ανά βήμα, καμία στην οθόνη: ο κώδικας τις
                      κουβαλούσε και ο χρήστης δεν τις έβλεπε. Ζουν πίσω από την
                      κουκκίδα του τίτλου, χωρίς να προσθέτουν ύψος στη σειρά. */}
                  <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:6,flexWrap:'wrap'}}>
                    <p style={{fontSize:14,fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>{step.title}</p>
                    <span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',background:'var(--bg-surface)',padding:'2px 8px',borderRadius:8,border:'1px solid var(--border-subtle)',fontFamily: T.font.sans,fontWeight:500,whiteSpace:'nowrap' as const}}>{step.time}</span>
                    <InfoDot text={step.tip}/>
                  </div>
                  <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',lineHeight:1.65,fontFamily: T.font.sans}}>{step.desc}</p>
                  {/* Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΔΙΑΒΑΖΟΤΑΝ ΣΑΝ ΔΕΥΤΕΡΗ ΠΡΟΤΑΣΗ ΤΗΣ
                      ΠΕΡΙΓΡΑΦΗΣ. Ίδιο γκρι, ίδια στοίχιση, ένα εικονοστοιχείο
                      διαφορά στο μέγεθος: τίποτα δεν έλεγε ότι εδώ μπλοκάρει η
                      αίτηση. Μία λέξη μπροστά κάνει τη διαφορά. */}
                  <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.55,marginTop:6,fontFamily: T.font.sans}}><strong style={{color:'var(--text-secondary)',fontWeight:600}}>Προσοχή:</strong> {step.warning}{step.url&&<> · <InlineLink href={step.url}>πηγή</InlineLink></>}</p>
                </div>
              </div>
            ))}
          </MiniSection>

          <MiniSection title="Γιατί απορρίπτεται μια αίτηση">
            <div style={{display:'flex',flexDirection:'column'}}>
              {[
                {title:'Δυσμενή στοιχεία στον Τειρεσία',desc:'Στο αρχείο αθέτησης υποχρεώσεων καταχωρείται σφραγισμένη επιταγή που δεν εξοφλήθηκε μέσα σε 30 ημέρες και ανεξόφλητες οφειλές πάνω από 1.000 €. Η καθυστέρηση δόσης δεν καταχωρείται από μόνη της: τα δάνεια περνούν στο αρχείο συγκέντρωσης κινδύνων, που βλέπουν οι τράπεζες ούτως ή άλλως. Τακτοποίησε τις οφειλές πριν την αίτηση.',url:'https://www.tiresias.gr'},
                {title:'Χαμηλό εισόδημα ή υψηλός δείκτης δόσης',desc:'Όρια της Τράπεζας της Ελλάδος (ΠΕΕ 227/1/2024, ισχύς από 1/1/2025): δόση έως 50% του εισοδήματος για όσους δανείζονται για πρώτη φορά, 40% για τους υπόλοιπους.',url:'https://www.bankofgreece.gr'},
                {title:'Αυθαίρετα στο ακίνητο',desc:'Αλλαγές χωρίς άδεια (βεράντα, πατάρι, αλλαγή χρήσης) μπλοκάρουν τη μεταβίβαση ή μειώνουν την εκτίμηση.',url:'https://www.ktimatologio.gr'},
                {title:'Προβλήματα τίτλων',desc:'Ακαθόριστοι τίτλοι, αδήλωτα σε Ε9, εκκρεμείς κληρονομιές. Ο νομικός έλεγχος διαρκεί εβδομάδες.',url:null},
                {title:'Χρέη σε ΔΟΥ ή ΕΦΚΑ',desc:'Απαιτείται φορολογική και ασφαλιστική ενημερότητα για υπογραφή συμβολαίου.',url:AADE_HOME},
                {title:'Δείκτης δανείου προς αξία πάνω από το όριο',desc:'Όρια της Τράπεζας της Ελλάδος: έως 90% της αξίας για όσους δανείζονται για πρώτη φορά, έως 80% για τους υπόλοιπους. Δεν είναι προνόμιο κρατικού προγράμματος, ισχύει σε κάθε στεγαστικό. Χρειάζεσαι ίδια κεφάλαια για τη διαφορά και για τα έξοδα.',url:'https://www.bankofgreece.gr'},
              ].sort((a,b)=>a.title.localeCompare(b.title,'el')).map((item,i,a)=>(
                <CatRow key={item.title} title={item.title} desc={item.desc} url={item.url} linkLabel="έλεγχος" last={i===a.length-1}/>
              ))}
            </div>
          </MiniSection>

          {/* Ειδικές κατηγορίες δανειοληπτών, σε συμπτυγμένη μορφή */}
          <MiniSection title="Ειδικές κατηγορίες δανειοληπτών">
            <div style={{display:'flex',flexDirection:'column'}}>
              {[
                {title:'Ένοπλες Δυνάμεις',desc:'Στεγαστική υποστήριξη σε εν ενεργεία στελέχη δίνουν ο Αυτόνομος Οικοδομικός Οργανισμός Αξιωματικών (ΑΟΟΑ) και το Ταμείο Παρακαταθηκών και Δανείων, με δικούς τους όρους. Το σταθερό εισόδημα βοηθά και στην τραπεζική αξιολόγηση.',url:'https://www.aooa.gr'},
                {title:'Κάτοικοι εξωτερικού',desc:'Δάνειο έως 55% ή 70% της αξίας. Επίσημες μεταφράσεις, αποδεικτικό κατοικίας, εισοδήματα ξένης χώρας.',url:'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia'},
                {title:'Νέοι 25 έως 50 ετών',desc:'Σπίτι μου ΙΙ: το μισό δάνειο άτοκο. Εισόδημα έως 25.000,00 € για άγαμο και 35.000,00 € για έγγαμους, συν 5.000,00 € ανά τέκνο. Ακίνητο έως 150 τ.μ.',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Ελεύθεροι επαγγελματίες',desc:'Μέσος όρος εισοδήματος διετίας. Δάνειο έως 65–70% της αξίας. Συνέπεια στις δηλώσεις.',url:AADE_HOME},
                {title:'Πολύτεκνοι και τρίτεκνοι',desc:'+50% επιδότηση επιτοκίου στο Σπίτι μου ΙΙ. Εισόδημα έως 45.000 € (2 παιδιά) ή 50.000 € (3+).',url:'https://greece20.gov.gr/home-loans/'},
                {title:'Εταιρείες και επαγγελματικά',desc:'Ισολογισμοί 3 ετών, απόφαση διοίκησης, προσωπική εγγύηση. Πλήρης έκπτωση τόκων.',url:'https://www.nbg.gr/el/epixeiriseis'},
              ].sort((a,b)=>a.title.localeCompare(b.title,'el')).map((cat,i,a)=>(
                <CatRow key={cat.title} title={cat.title} desc={cat.desc} url={cat.url} linkLabel="περισσότερα" last={i===a.length-1}/>
              ))}
            </div>
          </MiniSection>

          <MiniSection title="Ιστορικό Euribor τριμήνου, 2020 έως σήμερα" meta={/* Ο ΣΥΝΔΕΣΜΟΣ ΗΤΑΝ 13 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ΨΗΛΟΣ. Κείμενο 11 σε γραμμή
                    χωρίς ύψος: στο κινητό ο στόχος αφής ήταν το ένα τρίτο των 44
                    που ζητά ο κανόνας· και δίπλα του κάθεται το βέλος που ανοίγει
                    την ενότητα — δηλαδή η αστοχία δεν ήταν «δεν άνοιξε», ήταν
                    «άνοιξε κάτι άλλο». Το ύψος έρχεται από την κλίμακα, που στο
                    κινητό γίνεται 44 από μόνη της· το κείμενο δεν μετακινείται,
                    γιατί η κεφαλίδα είναι ήδη ψηλότερη. */
                  <a href="https://data.ecb.europa.eu" target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',minHeight:T.h.md,fontSize: 'var(--fs-xs)',color:'var(--accent)',textDecoration:'none',fontFamily: T.font.sans,fontWeight:500}}>Πηγή: Ευρωπαϊκή Κεντρική Τράπεζα</a>}>
            <EuriborArea data={EURIBOR_HISTORY}/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',gap:10,marginTop:14}}>
              {[
                {l:'Ιστορικό χαμηλό',v:fmtPct(Math.min(...EURIBOR_HISTORY.map(p=>p.val))),s:'2021'},
                {l:'Ιστορικό υψηλό',v:fmtPct(Math.max(...EURIBOR_HISTORY.map(p=>p.val))),s:'Οκτώβριος 2023'},
                {l:'Τρέχον',v:fmtPct(market.euribor_3m),s:market.provenance.euribor_3m?greekWhen(market.provenance.euribor_3m.asOf,market.provenance.euribor_3m.basis):'χωρίς ημερομηνία'},
                {l:'Μείωση από το ανώτατο',v:`-${fmtPct(Math.max(...EURIBOR_HISTORY.map(p=>p.val))-market.euribor_3m)}`,s:'από το 2023'},
              ].map(item=>(
                <div key={item.l} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'11px 13px'}}>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.05em',fontWeight:600,fontFamily: T.font.sans,marginBottom:6}}>{item.l}</p>
                  <p style={{fontSize:16,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700,lineHeight:1}}>{item.v}</p>
                  <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',marginTop:4,fontFamily: T.font.sans}}>{item.s}</p>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily: T.font.sans,marginTop:14}}>
              Δάνεια που δόθηκαν το 2021 με Euribor -0,55% έχουν σήμερα πραγματικό επιτόκιο περίπου {fmtPct(market.euribor_3m+1.5)}. Η Ευρωπαϊκή Κεντρική Τράπεζα μείωσε το επιτόκιο 8 φορές από τον Ιούνιο 2024.
            </p>
          </MiniSection>

          {/* Γλωσσάρι — σωστά ελληνικά, καθαρή λίστα ορισμών, ανάλογα με το προφίλ */}
          {/* ── Διαχειριστές (servicers) & κόκκινα δάνεια ── */}
          <MiniSection title="Δάνεια σε διαχειριστές και κόκκινα δάνεια">
            <p style={{fontSize:15,color:'var(--text-primary)',lineHeight:1.55,fontFamily: T.font.sans,fontWeight:500,letterSpacing:'-0.01em',marginBottom:8}}>{SERVICERS_GUIDE.lead}</p>
            <p style={{fontSize: 'var(--fs-base)',color:'var(--text-secondary)',lineHeight:1.7,fontFamily: T.font.sans,marginBottom:16}}>{SERVICERS_GUIDE.intro}</p>

            {/* Μαζεμένες σειρές· η επεξήγηση κρύβεται πίσω από ⓘ (όχι κατεβατό). */}
            <p style={{...labelStyle,marginBottom:10}}>Τα δικαιώματά σου</p>
            {/* Τέσσερα δικαιώματα, μία σειρά. Το `auto-fit` έβγαζε τρία και ένα
                σε οθόνη με zoom, γιατί το πλήθος στηλών του το ορίζει το
                διαθέσιμο πλάτος και όχι η λίστα. */}
            {/* ΙΣΟ ΥΨΟΣ, ΟΧΙ ΙΣΟ ΚΕΙΜΕΝΟ. Με στοίχιση στο κάτω άκρο, ένα δικαίωμα
                μιας γραμμής κάθεται χαμηλότερα από το διπλανό του των δύο και
                τα τέσσερα πλακίδια διαβάζονται σαν σκαλοπάτια. Τεντωμένα στο ίδιο
                ύψος, το κείμενο κεντράρεται και η σειρά είναι μία ευθεία. */}
            <div {...fixedCols(4, 8, 'stretch')} style={{...fixedCols(4, 8, 'stretch').style, marginBottom:18}}>
              {SERVICERS_GUIDE.rights.map(r=>(
                <InfoChip key={r.t} label={r.t} detail={r.d}
                  icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>}/>
              ))}
            </div>

            <p style={{...labelStyle,marginBottom:10}}>Εργαλεία ρύθμισης και προστασίας</p>
            {/* Τρία εργαλεία, τρεις στήλες ίδιου ύψους: οι τρεις σύνδεσμοι
                «Επίσημη πηγή» κάθονται στην ίδια γραμμή βάσης, όσο άνισο κι αν
                είναι το κείμενο από πάνω τους. */}
            <div {...fixedCols(3, 12, 'stretch')} style={{...fixedCols(3, 12, 'stretch').style, marginBottom:18}}>
              {SERVICERS_GUIDE.tools.map(t=>(
                <div key={t.name} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.inner,padding:14,display:'flex',flexDirection:'column'}}>
                  {/* Τίτλος κάρτας σε βάρος τίτλου. Στο 500 διαβαζόταν ίδιος με
                      το κείμενο από κάτω και οι τρεις κάρτες έμοιαζαν με τρεις
                      παραγράφους χωρίς επικεφαλίδα. */}
                  <p style={{fontSize: 'var(--fs-base)',fontWeight:600,fontFamily: T.font.sans,color:'var(--text-primary)',lineHeight:1.4,marginBottom:6}}>{t.name}</p>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans,marginBottom:10}}>{t.d}</p>
                  <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10}}>
                    {t.facts.map((f,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'flex-start',gap:7}}>
                        <span style={{width:5,height:5,borderRadius:'50%',background:'var(--border-default)',flexShrink:0,marginTop:6}}/>
                        <span style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily: T.font.sans}}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <span style={{marginTop:'auto',fontSize:12,fontFamily: T.font.sans}}><InlineLink href={t.url}>Επίσημη πηγή</InlineLink></span>
                </div>
              ))}
            </div>

            <p style={{...labelStyle,marginBottom:10}}>Προσοχή στα ψιλά γράμματα</p>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
              {SERVICERS_GUIDE.redFlags.map((f,i)=>(
                <div key={i} style={{display:'flex',gap:10,padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-default)',borderRadius:8}}>
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.55,fontFamily: T.font.sans}}>{f}</p>
                </div>
              ))}
            </div>

            {/* ΟΙ ΕΠΙΣΗΜΕΣ ΠΗΓΕΣ ΗΤΑΝ ΣΕ ΔΥΟ ΣΗΜΕΙΑ ΤΗΣ ΙΔΙΑΣ ΟΘΟΝΗΣ: πέντε εδώ,
                δεκαέξι σε δική τους κάρτα λίγο πιο κάτω, με τον ίδιο τίτλο. Ο
                χρήστης δεν ξέρει ποια από τις δύο λίστες είναι «οι πηγές» και
                σε ποια να ψάξει. Μαζεύτηκαν όλες στη μία κάρτα, ταξινομημένες,
                με τη ρύθμιση οφειλών πρώτη ενότητα. */}
            <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',lineHeight:1.6,fontFamily: T.font.sans}}>Ενημερωτικές πληροφορίες με βάση το ισχύον πλαίσιο (Ιούλιος 2026), όχι νομική ή χρηματοοικονομική συμβουλή. Για την περίπτωσή σου συμβουλέψου δικηγόρο ή πιστοποιημένο σύμβουλο αναδιάρθρωσης.</p>
          </MiniSection>

          <MiniSection title="Γλωσσάρι όρων" meta={<span style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',fontFamily: T.font.sans}}>{profile==='business'?'Πλήρες':'Βασικοί όροι'}</span>}>
            <Glossary items={[...GLOSSARY.filter(g=>profile==='business'||g.level==='basic')].sort((a,b)=>a.term.localeCompare(b.term,'el'))}/>
            {profile!=='business'&&(
              <p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:14,lineHeight:1.55,fontFamily: T.font.sans}}>
                Περισσότεροι, πιο εξειδικευμένοι όροι εμφανίζονται στη λειτουργία «Επαγγελματίας», από τις Ρυθμίσεις.
              </p>
            )}
          </MiniSection>

          {/* ΜΙΑ ΚΑΡΤΑ ΠΗΓΩΝ, ΜΕ ΣΕΙΡΑ ΠΟΥ ΒΓΑΙΝΕΙ ΑΠΟ ΤΟ ΤΙ ΨΑΧΝΕΙ Ο ΧΡΗΣΤΗΣ.
              Πρώτα ό,τι λύνει πρόβλημα που ΗΔΗ έχει (ρύθμιση οφειλών), μετά ό,τι
              δίνει χρήματα (κρατικά προγράμματα), μετά ό,τι συγκρίνει (τράπεζες
              και επιτόκια), μετά ό,τι ελέγχεται (φορολογικά και τίτλοι) και
              τελευταία τα υπόλοιπα εργαλεία. */}
          <MiniSection title="Επίσημες πηγές">
            {[
              {category:'Ρύθμιση οφειλών και διαχειριστές',links:SERVICERS_GUIDE.sources.map(x=>({label:x.label,sub:x.sub,url:x.url}))},
              {category:'Κρατικά προγράμματα',links:[
                {label:'Σπίτι μου ΙΙ · επίσημη σελίδα',sub:'Κριτήρια και όροι του προγράμματος',url:'https://greece20.gov.gr/home-loans/'},
                {label:'Αναβαθμίζω το Σπίτι μου',sub:'Ελληνική Αναπτυξιακή Τράπεζα, επίσημη πλατφόρμα',url:'https://hdb.gr/anavathmizo-to-spiti-mou/'},
                {label:'Εξοικονομώ 2025',sub:'Επιδότηση ενεργειακής αναβάθμισης',url:'https://exoikonomo2025.gov.gr/'},
                {label:'Ανακαινίζω και Νοικιάζω · ΟΠΕΚΑ',sub:'40% επιδότηση και εγγυημένο ενοίκιο',url:'https://www.opeka.gr'},
                {label:'Γέφυρα 3 · κάλυψη αύξησης δόσης',sub:'Πρωτοβουλία τραπεζών για ευάλωτους οφειλέτες',url:'https://gefyra3.gr'},
              ]},
              {category:'Τράπεζες και επιτόκια',links:[
                {label:'Τράπεζα Ελλάδος · επιτόκια',sub:'Επίσημα μέσα επιτόκια αγοράς',url:'https://www.bankofgreece.gr/el/statistiki/nomismatiki-kai-trapeziki-statistiki/epitokia-katatheseon-kai-daneion'},
                {label:'Σύγκριση επιτοκίων τραπεζών',sub:'Ενημερωμένη σύγκριση όλων των τραπεζών',url:'https://vresdaneio.gr/epitokia/index.html'},
                {label:'e-stegastiko · πλατφόρμα Τράπεζας Ελλάδος',sub:'Επίσημη πλατφόρμα στεγαστικών',url:'https://e-stegastiko.gr'},
                {label:'Τειρεσίας · έλεγχος πιστοληπτικής',sub:'Έλεγξε αν έχεις εγγραφές πριν αιτηθείς',url:'https://www.tiresias.gr'},
              ]},
              {category:'Φορολογικά και τίτλοι',links:[
                {label:'ΑΑΔΕ · φορολογικά ακινήτων',sub:'Φόρος μεταβίβασης, ΕΝΦΙΑ, εισοδήματα ενοικίων',url:AADE_HOME},
                {label:'Κτηματολόγιο · έλεγχος τίτλων',sub:'Ηλεκτρονικός έλεγχος εγγράφων',url:'https://www.ktimatologio.gr'},
                {label:'Επιλεξιμότητα Σπίτι μου ΙΙ · gov.gr',sub:'Ηλεκτρονικός έλεγχος με κωδικούς Taxisnet',url:'https://www.gov.gr/ipiresies/periousia-kai-phorologia/akinhta/elegkhos-epile3imotetas-programmatos-spiti-mou-ii'},
              ]},
              {category:'Χρήσιμα εργαλεία',links:[
                {label:'Ελληνική Αναπτυξιακή Τράπεζα',sub:'Διαχείριση κρατικών προγραμμάτων δανείων',url:'https://hdb.gr'},
                {label:'Υπουργείο Περιβάλλοντος και Ενέργειας',sub:'Ενεργειακά προγράμματα, παρατάσεις, ανακοινώσεις',url:'https://ypen.gov.gr'},
                {label:'Ταμείο Αλληλοβοηθείας Στρατού',sub:'Στεγαστικά για στελέχη Ενόπλων Δυνάμεων',url:'https://www.tap.gr'},
                /* Ο ΣΥΝΔΕΣΜΟΣ ΕΒΓΑΖΕ ΣΕ ΣΕΙΡΑ ΠΟΥ ΔΕΝ ΤΡΟΦΟΔΟΤΕΙ ΤΙΠΟΤΑ. Ηταν γραμμένο με το
                 χέρι το ΠΑΛΙΟ κλειδί («RT0»), το ίδιο που χρησιμοποιούσε η εργασία
                 πριν διορθωθεί: ο χρήστης πατούσε «Επίσημα δεδομένα» και έφτανε σε
                 άλλη σειρά από αυτήν που δείχνει η οθόνη του. Παράγεται πλέον από
                 τον κατάλογο, οπότε δεν μπορεί να αποκλίνει. */
              {label:'Ευρωπαϊκή Κεντρική Τράπεζα · Euribor',sub:'Η σειρά που τροφοδοτεί την εφαρμογή',url:seriesPage(ECB_SERIES.find(x=>x.key==='euribor_3m')!.candidates[0])},
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
              <p style={{fontSize: 'var(--fs-xs)',color:'var(--text-tertiary)',lineHeight:1.6,fontFamily: T.font.sans}}>
                Ενημερωτικές πληροφορίες, δεν αποτελούν χρηματοοικονομική, νομική ή φορολογική συμβουλή.
              </p>
            </div>
          </MiniSection>

        </div>
      </LensPanel>)}

    </div>
  )
}