'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea } from './UIComponents'
import { downloadCsv, csvEur } from './exportCsv'
import DocChecklist from './DocChecklist'
import { escHtml } from '@/lib/reportBranding'
import { affordability, rentVsBuy } from '@/lib/loans/affordability'
import {
  BANKS, LOAN_TYPES, BORROWER_PROFILES, TAX_DATA,
  calcMonthly, calcAmortization, calcFmaExemption, calcRentalTax,
  fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, LoanScenario, MarketRates, SavedLoan
} from './TabLoanData'

// ── MD3 tokens ────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.06em',fontWeight:600,fontFamily:"'Inter',sans-serif",
  display:'block',marginBottom:6,
}
const cardStyle: React.CSSProperties = {
  background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:16,
}
const pillBtn = (active:boolean, accentColor='var(--accent)'): React.CSSProperties => ({
  padding:'0 14px',height:36,borderRadius:18,border:`1px solid ${active?accentColor:'var(--border-subtle)'}`,
  background:active?`${accentColor}14`:'none',color:active?accentColor:'var(--text-secondary)',
  cursor:'pointer',fontSize:12,fontFamily:"'Inter',sans-serif",fontWeight:active?500:400,
  transition:'all 0.15s',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap' as const,
})

const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <p style={{fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{label}</p>
    </div>
    {right}
  </div>
)

// Ομοιόμορφο πλακίδιο μετρικής: η τιμή είναι λευκή και γίνεται γαλάζια μόνο όταν
// περνά ο κέρσορας/δάχτυλο· αρνητικές τιμές μένουν κόκκινες. Ήπιο 3D στο hover.
function KPI({label,value,color,sub,title}:{label:string;value:string;color?:string;sub?:string;title?:string}) {
  const [h,setH]=useState(false)
  const isNeg = color==='var(--negative)'
  return (
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onTouchStart={()=>setH(true)} onTouchEnd={()=>setH(false)}
      style={{background:'var(--bg-elevated)',border:`1px solid ${h?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:12,padding:'12px 14px',transition:'border-color 0.15s, box-shadow 0.15s',boxShadow:h?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent)':'none'}}>
      <p title={title} style={{...labelStyle,marginBottom:6,cursor:title?'help':undefined}}>{label}</p>
      <p style={{fontSize:16,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:isNeg?'var(--negative)':h?'var(--accent)':'var(--text-primary)',fontWeight:700,transition:'color 0.15s'}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>{sub}</p>}
    </div>
  )
}

function Section({title,sub,children,defaultOpen=false,badge}:{title:string;sub?:string;children:React.ReactNode;defaultOpen?:boolean;badge?:string}) {
  const [open,setOpen] = useState(defaultOpen)
  return (
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <p style={{fontSize:14,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:600}}>{title}</p>
            {badge&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:8,background:'var(--bg-surface)',color:'var(--text-secondary)',border:'1px solid var(--border-subtle)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{badge}</span>}
          </div>
          {sub&&<p style={{fontSize:12,color:'var(--text-secondary)',marginTop:3,lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{sub}</p>}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" aria-hidden="true" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open&&<div style={{padding:'0 16px 16px'}}>{children}</div>}
    </div>
  )
}

// ── Bespoke SVG: donut κατανομής κεφαλαίου/τόκων (αισθητική «2050», μονόχρωμη) ──
function AmortDonut({principal,interest}:{principal:number;interest:number}) {
  const total = Math.max(1, principal+interest)
  const pFrac = principal/total
  const R=52, sw=15, C=2*Math.PI*R
  const pLen = C*pFrac
  return (
    <svg viewBox="0 0 136 136" width="128" height="128" role="img" aria-label={`Κατανομή: ${Math.round(pFrac*100)}% κεφάλαιο, ${Math.round((1-pFrac)*100)}% τόκοι`} style={{flexShrink:0}}>
      <defs>
        <linearGradient id="donutCap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.6"/>
        </linearGradient>
        <filter id="donutShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="var(--text-primary)" floodOpacity="0.15"/>
        </filter>
      </defs>
      <circle cx="68" cy="68" r={R} fill="none" stroke="var(--text-tertiary)" strokeOpacity="0.22" strokeWidth={sw}/>
      <circle cx="68" cy="68" r={R} fill="none" stroke="url(#donutCap)" strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${pLen} ${C-pLen}`} transform="rotate(-90 68 68)" filter="url(#donutShadow)"/>
      <text x="68" y="63" textAnchor="middle" style={{fontSize:22,fontWeight:700,fontFamily:"'Inter',sans-serif",fill:'var(--text-primary)'}}>{Math.round(pFrac*100)}%</text>
      <text x="68" y="80" textAnchor="middle" style={{fontSize:9.5,fontFamily:"'Inter',sans-serif",fill:'var(--text-tertiary)',letterSpacing:'0.04em'}}>ΚΕΦΑΛΑΙΟ</text>
    </svg>
  )
}

// ── Bespoke SVG: στοιβαγμένες στήλες ανά έτος — κεφάλαιο (κάτω) / τόκοι (πάνω) ──
// Κάθε στήλη είναι η ετήσια δόση. Η αναλογία μετατοπίζεται σταδιακά από «κυρίως
// τόκοι» σε «κυρίως κεφάλαιο». Καθαρός διαχωρισμός, χωρίς αλληλοκαλύψεις.
function AmortArea({data,fmt}:{data:{year:string;cap:number;int:number}[];fmt:(n:number)=>string}) {
  const [hi,setHi]=useState<number|null>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const W=620,H=228,padL=6,padR=52,padT=16,padB=26
  const n=data.length
  if(n<1) return null
  const maxTotal=Math.max(...data.map(d=>d.cap+d.int),1)
  const plotW=W-padL-padR, plotH=H-padT-padB
  const step=plotW/n
  const bw=Math.min(26, step*0.58)
  const cx=(i:number)=> padL + i*step + step/2
  const Y=(v:number)=> padT + (1 - v/maxTotal)*plotH
  const base=padT+plotH
  const r=Math.min(3, bw/2)
  const crossIdx=data.findIndex(d=>d.cap>=d.int)
  const grid=[0,0.5,1].map(f=>({ y:padT+(1-f)*plotH, label:fmt(maxTotal*f) }))
  const tickEvery=Math.max(1, Math.ceil(n/8))
  const locate=(clientX:number)=>{
    const el=wrapRef.current; if(!el)return
    const r2=el.getBoundingClientRect()
    const xv=((clientX-r2.left)/r2.width)*W
    let i=Math.floor((xv-padL)/step)
    setHi(Math.max(0,Math.min(n-1,i)))
  }
  const leftPct=hi!=null?Math.max(13,Math.min(87,(cx(hi)/W)*100)):0
  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',touchAction:'pan-y',cursor:'crosshair'}}
      onMouseMove={e=>locate(e.clientX)} onMouseLeave={()=>setHi(null)}
      onTouchStart={e=>locate(e.touches[0].clientX)} onTouchMove={e=>locate(e.touches[0].clientX)} onTouchEnd={()=>setHi(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block'}} role="img" aria-label="Κατανομή κεφαλαίου και τόκων ανά έτος">
      <defs>
        <linearGradient id="barCap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="1"/>
          <stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 78%, transparent)" stopOpacity="1"/>
        </linearGradient>
        <filter id="barLift" x="-30%" y="-20%" width="160%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="var(--text-primary)" floodOpacity="0.12"/></filter>
      </defs>
      {/* Γραμμές αναφοράς + ετικέτες αξόνων */}
      {grid.map((g,i)=>(
        <g key={i}>
          <line x1={padL} y1={g.y} x2={W-padR} y2={g.y} stroke="var(--border-subtle)" strokeWidth="1" strokeOpacity={i===0?0.9:0.45}/>
          <text x={W-padR+6} y={g.y+3} textAnchor="start" style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:'var(--text-tertiary)',fontVariantNumeric:'tabular-nums'}}>{g.label}</text>
        </g>
      ))}
      {/* Στοιβαγμένες στήλες — η δόση ανάβει μπλε στο πέρασμα του δείκτη/δαχτύλου */}
      {data.map((d,i)=>{
        const x=cx(i)-bw/2
        const yTot=Y(d.cap+d.int), yCap=Y(d.cap)
        const capH=Math.max(0,base-yCap)
        const active=hi===i
        return (
          <g key={i}>
            {active&&<rect x={cx(i)-step/2} y={padT} width={step} height={plotH} fill="var(--accent)" fillOpacity="0.06"/>}
            {/* τόκοι (πάνω· στο hover γίνονται πιο έντονο accent) */}
            <path d={`M ${x} ${yCap} L ${x} ${yTot+r} Q ${x} ${yTot} ${x+r} ${yTot} L ${x+bw-r} ${yTot} Q ${x+bw} ${yTot} ${x+bw} ${yTot+r} L ${x+bw} ${yCap} Z`} fill={active?'var(--accent)':'var(--text-tertiary)'} fillOpacity={active?0.4:0.26}/>
            {/* κεφάλαιο (κάτω, accent — πιο φωτεινό στο hover) */}
            {capH>0 && <rect x={x} y={yCap} width={bw} height={capH} fill={active?'var(--accent)':'url(#barCap)'} filter={(active||i===n-1)?'url(#barLift)':undefined}/>}
          </g>
        )
      })}
      <line x1={padL} y1={base} x2={W-padR} y2={base} stroke="var(--border-default)" strokeWidth="1"/>
      {/* Έτος τομής — όπου το κεφάλαιο ξεπερνά τους τόκους */}
      {crossIdx>0&&hi==null&&(
        <g>
          <line x1={cx(crossIdx)} y1={padT} x2={cx(crossIdx)} y2={base} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.55"/>
          <text x={cx(crossIdx)} y={padT-4} textAnchor="middle" style={{fontSize:9.5,fontFamily:"'Inter',sans-serif",fill:'var(--accent)',fontWeight:600}}>έτος {data[crossIdx].year}</text>
        </g>
      )}
      {/* Άξονας x */}
      {data.map((d,i)=> (i%tickEvery===0 || i===n-1) ? (
        <text key={i} x={cx(i)} y={H-8} textAnchor="middle" style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:hi===i?'var(--accent)':'var(--text-secondary)',fontWeight:hi===i?700:400}}>{d.year}</text>
      ) : null)}
    </svg>
    {hi!=null&&(
      <div style={{position:'absolute',top:0,left:`${leftPct}%`,transform:'translateX(-50%)',pointerEvents:'none',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:'8px 11px',boxShadow:'var(--shadow-lg)',whiteSpace:'nowrap' as const}}>
        <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:5,fontFamily:"'Inter',sans-serif",textAlign:'center' as const}}>Έτος {data[hi].year}</p>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
          <span style={{width:9,height:9,borderRadius:2,background:'var(--accent)',display:'inline-block'}}/>
          <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Κεφάλαιο</span>
          <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{fmt(data[hi].cap)}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
          <span style={{width:9,height:9,borderRadius:2,background:'var(--text-tertiary)',opacity:0.5,display:'inline-block'}}/>
          <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Τόκοι</span>
          <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{fmt(data[hi].int)}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14,paddingTop:5,marginTop:2,borderTop:'1px solid var(--border-subtle)'}}>
          <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Ετήσια δόση</span>
          <span style={{fontSize:12.5,color:'var(--accent)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,marginLeft:'auto'}}>{fmt(data[hi].cap+data[hi].int)}</span>
        </div>
      </div>
    )}
    </div>
  )
}

// ── Bespoke SVG: δύο σωρευτικές γραμμές, διαδραστικές (δείκτης ή άγγιγμα) ──
// Περιηγήσου πάνω στο γράφημα με τον κέρσορα ή το δάχτυλο για να δεις κάθε έτος.
function DualLine({data,keyA,keyB,fmt}:{data:any[];keyA:string;keyB:string;fmt:(n:number)=>string}) {
  const [hi,setHi]=useState<number|null>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const W=620,H=200,padL=8,padR=56,padT=18,padB=28
  const n=data.length
  if(n<2) return null
  const vals=data.flatMap(d=>[d[keyA],d[keyB]] as number[])
  const maxV=Math.max(...vals,1)
  const X=(i:number)=> padL + (i/(n-1))*(W-padL-padR)
  const Y=(v:number)=> padT + (1 - v/maxV)*(H-padT-padB)
  const path=(k:string)=> data.map((d,i)=>`${i===0?'M':'L'} ${X(i)} ${Y(d[k])}`).join(' ')
  const areaA=`M ${X(0)} ${Y(0)} `+data.map((d,i)=>`L ${X(i)} ${Y(d[keyA])}`).join(' ')+` L ${X(n-1)} ${Y(0)} Z`
  const grid=[0,0.5,1].map(f=>({y:Y(maxV*f),label:fmt(maxV*f)}))
  const locate=(clientX:number)=>{
    const el=wrapRef.current; if(!el)return
    const r=el.getBoundingClientRect()
    const xv=((clientX-r.left)/r.width)*W
    let i=Math.round((xv-padL)/((W-padL-padR)/(n-1)))
    setHi(Math.max(0,Math.min(n-1,i)))
  }
  const leftPct=hi!=null?Math.max(11,Math.min(89,(X(hi)/W)*100)):0
  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',touchAction:'pan-y',cursor:'crosshair'}}
      onMouseMove={e=>locate(e.clientX)} onMouseLeave={()=>setHi(null)}
      onTouchStart={e=>locate(e.touches[0].clientX)} onTouchMove={e=>locate(e.touches[0].clientX)} onTouchEnd={()=>setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block'}} role="img" aria-label="Σύγκριση σωρευτικών τόκων στη διάρκεια">
        <defs>
          <linearGradient id="dualAreaA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {grid.map((g,i)=>(<g key={i}><line x1={padL} y1={g.y} x2={W-padR} y2={g.y} stroke="var(--border-subtle)" strokeWidth="1" strokeOpacity={i===0?0.9:0.4}/><text x={W-padR+5} y={g.y+3} textAnchor="start" style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:'var(--text-tertiary)',fontVariantNumeric:'tabular-nums'}}>{g.label}</text></g>))}
        <path d={areaA} fill="url(#dualAreaA)"/>
        <path d={path(keyB)} fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" strokeOpacity="0.85"/>
        <path d={path(keyA)} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"/>
        {hi!=null&&(
          <g>
            <line x1={X(hi)} y1={padT-4} x2={X(hi)} y2={Y(0)} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.5"/>
            <circle cx={X(hi)} cy={Y(data[hi][keyB])} r="4" fill="var(--bg-surface)" stroke="var(--text-tertiary)" strokeWidth="2"/>
            <circle cx={X(hi)} cy={Y(data[hi][keyA])} r="4.5" fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2"/>
          </g>
        )}
        {hi==null&&<circle cx={X(n-1)} cy={Y(data[n-1][keyA])} r="4" fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2"/>}
        {data.map((d,i)=> (i===0||i===n-1||i===Math.floor(n/2)) ? (<text key={i} x={X(i)} y={H-8} textAnchor={i===0?'start':i===n-1?'end':'middle'} style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:'var(--text-secondary)'}}>{d.year}</text>) : null)}
      </svg>
      {hi!=null&&(
        <div style={{position:'absolute',top:0,left:`${leftPct}%`,transform:'translateX(-50%)',pointerEvents:'none',
          background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:'8px 11px',boxShadow:'var(--shadow-lg)',whiteSpace:'nowrap' as const}}>
          <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:5,fontFamily:"'Inter',sans-serif",textAlign:'center' as const}}>{data[hi].year}</p>
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
            <span style={{width:12,height:2.4,borderRadius:2,background:'var(--accent)',display:'inline-block'}}/>
            <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Σταθερό</span>
            <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{fmt(data[hi][keyA])}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <span style={{width:12,height:0,borderTop:'2px dashed var(--text-tertiary)',display:'inline-block'}}/>
            <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Κυμαινόμενο</span>
            <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{fmt(data[hi][keyB])}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bespoke SVG: αγορά vs ενοικίαση, διαδραστικό (δείκτης ή άγγιγμα) ──
// Περιηγήσου πάνω στη γραμμή για να δεις το καθαρό κόστος κάθε έτους.
function RentBuyChart({buy,rent,horizon,breakEvenYear,fmt}:{buy:number[];rent:number[];horizon:number;breakEvenYear?:number|null;fmt:(n:number)=>string}) {
  const [hi,setHi]=useState<number|null>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const W=560,H=170,padL=6,padR=52,padT=14,padB=22, n=horizon+1
  if(n<2) return null
  const maxV=Math.max(...buy,...rent,1)
  const minV=Math.min(...buy,0)
  const X=(i:number)=>padL+(i/(n-1))*(W-padL-padR)
  const Yv=(v:number)=>padT+(1-(v-minV)/(maxV-minV||1))*(H-padT-padB)
  const buyLine=buy.map((v,i)=>`${i===0?'M':'L'} ${X(i)} ${Yv(v)}`).join(' ')
  const rentLine=rent.map((v,i)=>`${i===0?'M':'L'} ${X(i)} ${Yv(v)}`).join(' ')
  const grid=[0,0.5,1].map(f=>{const v=minV+(maxV-minV)*f;return{y:Yv(v),label:fmt(v)}})
  const locate=(clientX:number)=>{
    const el=wrapRef.current; if(!el)return
    const r=el.getBoundingClientRect()
    const xv=((clientX-r.left)/r.width)*W
    setHi(Math.max(0,Math.min(n-1,Math.round((xv-padL)/((W-padL-padR)/(n-1))))))
  }
  const leftPct=hi!=null?Math.max(13,Math.min(87,(X(hi)/W)*100)):0
  const diff=hi!=null?buy[hi]-rent[hi]:0
  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',touchAction:'pan-y',cursor:'crosshair'}}
      onMouseMove={e=>locate(e.clientX)} onMouseLeave={()=>setHi(null)}
      onTouchStart={e=>locate(e.touches[0].clientX)} onTouchMove={e=>locate(e.touches[0].clientX)} onTouchEnd={()=>setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block'}} role="img" aria-label="Σύγκριση κόστους αγοράς και ενοικίασης, διαδραστικό">
        {grid.map((g,i)=>(<g key={i}><line x1={padL} y1={g.y} x2={W-padR} y2={g.y} stroke="var(--border-subtle)" strokeWidth="1" strokeOpacity={i===0?0.9:0.4}/><text x={W-padR+5} y={g.y+3} textAnchor="start" style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:'var(--text-tertiary)',fontVariantNumeric:'tabular-nums'}}>{g.label}</text></g>))}
        <line x1={padL} y1={H-padB} x2={W-padR} y2={H-padB} stroke="var(--border-default)" strokeWidth="1"/>
        <path d={rentLine} fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round"/>
        <path d={buyLine} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round"/>
        {breakEvenYear&&hi==null&&<line x1={X(breakEvenYear)} y1={padT} x2={X(breakEvenYear)} y2={H-padB} stroke="var(--border-accent)" strokeWidth="1" strokeDasharray="3 3"/>}
        {hi!=null&&(<g>
          <line x1={X(hi)} y1={padT-4} x2={X(hi)} y2={H-padB} stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.5"/>
          <circle cx={X(hi)} cy={Yv(rent[hi])} r="3.5" fill="var(--text-tertiary)" stroke="var(--bg-surface)" strokeWidth="1.5"/>
          <circle cx={X(hi)} cy={Yv(buy[hi])} r="4.5" fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2"/>
        </g>)}
        {[0,Math.round(horizon/2),horizon].map(i=><text key={i} x={X(i)} y={H-6} textAnchor={i===0?'start':i===horizon?'end':'middle'} style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:hi===i?'var(--accent)':'var(--text-secondary)',fontWeight:hi===i?700:400}}>έτος {i}</text>)}
      </svg>
      {hi!=null&&(
        <div style={{position:'absolute',top:0,left:`${leftPct}%`,transform:'translateX(-50%)',pointerEvents:'none',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:'8px 11px',boxShadow:'var(--shadow-lg)',whiteSpace:'nowrap' as const,minWidth:150}}>
          <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:5,fontFamily:"'Inter',sans-serif",textAlign:'center' as const}}>Έτος {hi}</p>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:3}}>
            <span style={{width:9,height:9,borderRadius:2,background:'var(--accent)',display:'inline-block'}}/>
            <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Αγορά</span>
            <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{fmt(buy[hi])}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{width:9,height:2.5,background:'var(--text-tertiary)',display:'inline-block'}}/>
            <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Ενοικίαση</span>
            <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{fmt(rent[hi])}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:14,paddingTop:5,marginTop:3,borderTop:'1px solid var(--border-subtle)'}}>
            <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{diff<0?'Υπέρ αγοράς':'Υπέρ ενοικίασης'}</span>
            <span style={{fontSize:12.5,color:'var(--accent)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,marginLeft:'auto'}}>{fmt(Math.abs(diff))}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bespoke SVG: αντοχή δόσης σε άνοδο επιτοκίου, διαδραστικό ──
function StressBars({stress,limit,INC,fmt,fmtPct,fmtPct1}:{stress:{label:string;rate:number;monthly:number}[];limit:number;INC:number;fmt:(n:number)=>string;fmtPct:(n:number)=>string;fmtPct1:(n:number)=>string}) {
  const [hi,setHi]=useState<number|null>(null)
  const wrapRef=useRef<HTMLDivElement>(null)
  const W=620,H=176,padL=8,padR=58,padT=18,padB=28
  const plotW=W-padL-padR, plotH=H-padT-padB, base=padT+plotH
  const maxV=Math.max(...stress.map(s=>s.monthly), limit, 1)*1.14
  const step=plotW/stress.length, bw=Math.min(42, step*0.56)
  const Y=(v:number)=> padT+(1-v/maxV)*plotH
  const cx=(i:number)=> padL+i*step+step/2
  const grid=limit>0?[0,limit,maxV/1.14]:[0,maxV/2/1.14,maxV/1.14]
  const locate=(clientX:number)=>{
    const el=wrapRef.current; if(!el)return
    const r=el.getBoundingClientRect()
    const xv=((clientX-r.left)/r.width)*W
    setHi(Math.max(0,Math.min(stress.length-1,Math.floor((xv-padL)/step))))
  }
  const leftPct=hi!=null?Math.max(15,Math.min(80,(cx(hi)/W)*100)):0
  return (
    <div ref={wrapRef} style={{position:'relative',width:'100%',touchAction:'pan-y',cursor:'crosshair'}}
      onMouseMove={e=>locate(e.clientX)} onMouseLeave={()=>setHi(null)}
      onTouchStart={e=>locate(e.touches[0].clientX)} onTouchMove={e=>locate(e.touches[0].clientX)} onTouchEnd={()=>setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:'block'}} role="img" aria-label="Αντοχή δόσης σε άνοδο επιτοκίου, διαδραστικό">
        <defs>
          <linearGradient id="stressBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="1"/><stop offset="100%" stopColor="color-mix(in srgb, var(--accent) 76%, transparent)"/></linearGradient>
          <linearGradient id="stressOver" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--negative)" stopOpacity="1"/><stop offset="100%" stopColor="color-mix(in srgb, var(--negative) 74%, transparent)"/></linearGradient>
          <filter id="stressLift" x="-40%" y="-20%" width="180%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="var(--text-primary)" floodOpacity="0.14"/></filter>
        </defs>
        {grid.map((gv,i)=>(<g key={i}><line x1={padL} y1={Y(gv)} x2={W-padR} y2={Y(gv)} stroke="var(--border-subtle)" strokeWidth="1" strokeOpacity={i===0?0.9:0.4}/><text x={W-padR+6} y={Y(gv)+3} style={{fontSize:9,fontFamily:"'Inter',sans-serif",fill:'var(--text-tertiary)',fontVariantNumeric:'tabular-nums'}}>{fmt(gv)}</text></g>))}
        {stress.map((s,i)=>{
          const over=limit>0&&s.monthly>limit
          const active=hi===i
          const x=cx(i)-bw/2, y=Y(s.monthly), r=Math.min(4,bw/2)
          return (
            <g key={i}>
              {active&&<rect x={cx(i)-step/2} y={padT} width={step} height={plotH} fill="var(--accent)" fillOpacity="0.06"/>}
              <path d={`M ${x} ${y+r} Q ${x} ${y} ${x+r} ${y} L ${x+bw-r} ${y} Q ${x+bw} ${y} ${x+bw} ${y+r} L ${x+bw} ${base} L ${x} ${base} Z`} fill={over?'url(#stressOver)':'url(#stressBar)'} filter={active?'url(#stressLift)':undefined}/>
              <text x={cx(i)} y={H-9} textAnchor="middle" style={{fontSize:9.5,fontFamily:"'Inter',sans-serif",fill:active||i===0?'var(--accent)':'var(--text-secondary)',fontWeight:active||i===0?600:400}}>{s.label}</text>
            </g>
          )
        })}
        {limit>0&&(<g>
          <line x1={padL} y1={Y(limit)} x2={W-padR} y2={Y(limit)} stroke="var(--text-secondary)" strokeWidth="1.4" strokeDasharray="5 4"/>
          <text x={padL+2} y={Y(limit)-5} style={{fontSize:9.5,fontFamily:"'Inter',sans-serif",fill:'var(--text-secondary)',fontWeight:600}}>Όριο δόσης</text>
        </g>)}
        <line x1={padL} y1={base} x2={W-padR} y2={base} stroke="var(--border-default)" strokeWidth="1"/>
      </svg>
      {hi!=null&&(()=>{
        const s=stress[hi], diff=s.monthly-stress[0].monthly, dti=INC>0?(s.monthly/INC)*100:0, over=limit>0&&s.monthly>limit
        return (
          <div style={{position:'absolute',top:0,left:`${leftPct}%`,transform:'translateX(-50%)',pointerEvents:'none',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:'8px 11px',boxShadow:'var(--shadow-lg)',whiteSpace:'nowrap' as const,minWidth:150}}>
            <p style={{fontSize:10,color:'var(--text-tertiary)',marginBottom:5,fontFamily:"'Inter',sans-serif",textAlign:'center' as const}}>{s.label} · {fmtPct(s.rate)}</p>
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:3}}>
              <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Δόση τον μήνα</span>
              <span style={{fontSize:12.5,color:over?'var(--negative)':'var(--accent)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,marginLeft:'auto'}}>{fmt(s.monthly)}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:3}}>
              <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Αύξηση</span>
              <span style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600,marginLeft:'auto'}}>{hi===0?'—':`+${fmt(diff)}`}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:14,paddingTop:5,marginTop:2,borderTop:'1px solid var(--border-subtle)'}}>
              <span style={{fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Δόση προς εισόδημα</span>
              <span style={{fontSize:12.5,color:dti>40?'var(--negative)':'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:700,marginLeft:'auto'}}>{fmtPct1(dti)}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Lens switcher: εναλλάσσει ΕΝΑ δυναμικό πάνελ επί τόπου (όχι στοίβαγμα) ──
function LensBar({value,onChange,items}:{value:string;onChange:(v:string)=>void;items:{id:string;label:string}[]}) {
  return (
    <div style={{display:'flex',gap:3,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:14,padding:4,overflowX:'auto'}}>
      {items.map(it=>{const on=value===it.id;return(
        <button key={it.id} onClick={()=>onChange(it.id)} aria-pressed={on} style={{flex:'1 0 auto',minWidth:92,borderRadius:11,padding:'9px 14px',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:on?600:500,whiteSpace:'nowrap' as const,border:'none',
          color:on?'var(--accent)':'var(--text-tertiary)',background:on?'var(--bg-elevated)':'transparent',
          boxShadow:on?'0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent), 0 2px 8px -4px color-mix(in srgb, var(--text-primary) 18%, transparent)':'none',
          transition:'color 0.2s, background 0.2s, box-shadow 0.2s'}}>{it.label}</button>
      )})}
    </div>
  )
}

const PROPERTY_TYPES = [
  {value:'residence',    label:'Κατοικία',              desc:'Διαμέρισμα, μονοκατοικία, μεζονέτα'},
  {value:'new_residence',label:'Νεόδμητη κατοικία',     desc:'Άδεια μετά το 2006, ΦΠΑ 24%'},
  {value:'store',        label:'Κατάστημα / Γραφείο',   desc:'Επαγγελματική χρήση'},
  {value:'warehouse',    label:'Αποθήκη / Βιομηχανικό', desc:'Βιομηχανική / αποθήκευση'},
  {value:'land',         label:'Οικόπεδο / Γη',         desc:'Εντός ή εκτός σχεδίου'},
  {value:'parking',      label:'Θέση στάθμευσης',       desc:'Αυτοτελής ή παράρτημα'},
]

function calcNotaryFees(propValue:number, propType:string):{notary:number;landReg:number;agent:number;legal:number;other:number;total:number;breakdown:string[]} {
  let notaryFee=0
  const bands=[{up:120000,rate:0.008},{up:380000,rate:0.007},{up:2000000,rate:0.0065},{up:Infinity,rate:0.006}]
  let remaining=propValue,prev=0
  for(const band of bands){
    const chunk=Math.min(remaining,band.up-prev);if(chunk<=0)break
    notaryFee+=chunk*band.rate;remaining-=chunk;prev=band.up
  }
  notaryFee=Math.max(notaryFee,200)
  const mortgageDeed=notaryFee*0.4
  const landReg=propValue*0.00475
  const legal=Math.min(Math.max(propValue*0.003,300),1500)
  const mortgageTax=propValue*0.001
  const total=notaryFee+mortgageDeed+landReg+legal+mortgageTax
  const isCommercial=propType==='store'||propType==='warehouse'
  const breakdown=[
    `Συμβολαιογραφικά αγοράς: ${fmtEur(notaryFee)}`,
    `Συμβολαιογραφικά υποθήκης: ${fmtEur(mortgageDeed)}`,
    `Κτηματολόγιο (0,475%): ${fmtEur(landReg)}`,
    `Δικηγόρος ελέγχου τίτλων: ${fmtEur(legal)}`,
    isCommercial?`Τέλη χαρτοσήμου μίσθωσης (3,6%): ${fmtEur(propValue*0.036)}`:`Φόρος ενεγγύησης υποθήκης: ${fmtEur(mortgageTax)}`,
  ]
  return{notary:notaryFee+mortgageDeed,landReg,agent:0,legal,other:mortgageTax,total,breakdown}
}

const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k,v])=>({value:k,label:v.label,description:`${v.typical_rate} · Δάνειο προς αξία έως ${v.typical_ltv}%`}))
const BORROWER_OPTIONS  = Object.entries(BORROWER_PROFILES).map(([k,v])=>({value:k,label:v.label,description:v.notes}))
const BANK_OPTIONS      = [...BANKS.map(b=>({value:b.id,label:b.name,description:`${b.note} · ${b.fees}`})),{value:'custom',label:'Άλλη τράπεζα',description:'Καταχωρήστε το όνομά της'}]
const RATE_TYPE_OPTIONS = [{value:'fixed',label:'Σταθερό',description:'Σταθερό για την επιλεγμένη περίοδο'},{value:'variable',label:'Κυμαινόμενο',description:'Euribor συν περιθώριο τράπεζας'},{value:'mixed',label:'Μικτό',description:'Σταθερό αρχικά, μετά κυμαινόμενο'}]
const FIXED_PERIOD_OPTIONS = ['3','5','10','15','20'].map(v=>({value:v,label:`${v} χρόνια`,description:v==='5'?'Πιο συνηθισμένο':v==='10'?'Καλή ισορροπία':''}))
const MARITAL_OPTIONS   = [{value:'single',label:'Άγαμος / Άγαμη',description:'Όριο ΦΜΑ: 200.000€'},{value:'married',label:'Έγγαμος / Έγγαμη',description:'Όριο ΦΜΑ: 250.000€'}]
const CHILDREN_OPTIONS  = [0,1,2,3,4,5].map(n=>({value:String(n),label:n===0?'Χωρίς τέκνα':`${n} εξαρτώμεν${n===1?'ο':'α'} τέκν${n===1?'ο':'α'}`,description:n===0?'':n===1?'+25.000€':n===2?'+50.000€':`+${50+(n-2)*30}.000€`}))
const PROP_TYPE_OPTIONS = PROPERTY_TYPES.map(p=>({value:p.value,label:p.label,description:p.desc}))

const PRESETS = [
  {id:'first_buyer',label:'Νέος αγοραστής',desc:'Πρώτη κατοικία, Σπίτι μου ΙΙ',color:'var(--accent-dim)',border:'var(--border-accent)',textColor:'var(--accent)',values:{loanAmount:'150000',propValue:'185000',sqm:'80',rate:'1.80',years:'25',rateType:'fixed' as RateType,loanType:'first_home' as LoanType,borrower:'young' as BorrowerType,fixedPeriod:'5',propType:'residence',area:'center_athens'}},
  {id:'investor',label:'Επενδυτής',desc:'Ακίνητο προς ενοικίαση',color:'var(--accent-dim)',border:'var(--border-accent)',textColor:'var(--accent)',values:{loanAmount:'200000',propValue:'280000',sqm:'90',rate:'3.20',years:'20',rateType:'fixed' as RateType,loanType:'investment' as LoanType,borrower:'individual' as BorrowerType,fixedPeriod:'5',propType:'residence',area:'south_suburbs'}},
  {id:'commercial',label:'Επαγγελματικό',desc:'Κατάστημα / Γραφείο',color:'var(--accent-dim)',border:'var(--border-accent)',textColor:'var(--accent)',values:{loanAmount:'150000',propValue:'220000',sqm:'50',rate:'3.80',years:'15',rateType:'fixed' as RateType,loanType:'commercial' as LoanType,borrower:'professional' as BorrowerType,fixedPeriod:'5',propType:'store',area:'center_athens'}},
  {id:'renovation',label:'Ανακαίνιση',desc:'Ενεργειακή αναβάθμιση',color:'var(--accent-dim)',border:'var(--border-accent)',textColor:'var(--accent)',values:{loanAmount:'25000',propValue:'200000',sqm:'85',rate:'2.90',years:'15',rateType:'fixed' as RateType,loanType:'energy' as LoanType,borrower:'individual' as BorrowerType,fixedPeriod:'5',propType:'residence',area:'center_athens'}},
]

const AREA_OPTIONS = [
  {value:'attica_center_prime',label:'Αθήνα Κέντρο Α',description:'Κολωνάκι, Σύνταγμα, Πλάκα'},
  {value:'attica_center_std',label:'Αθήνα Κέντρο Β',description:'Κυψέλη, Ζωγράφου, Παγκράτι'},
  {value:'attica_south_prime',label:'Αττική Νότια Α',description:'Γλυφάδα, Βούλα, Βουλιαγμένη'},
  {value:'attica_south_std',label:'Αττική Νότια Β',description:'Άλιμος, Ελληνικό, Αργυρούπολη'},
  {value:'attica_north_prime',label:'Αττική Βόρεια Α',description:'Κηφισιά, Εκάλη, Διόνυσος'},
  {value:'attica_north_std',label:'Αττική Βόρεια Β',description:'Μαρούσι, Χαλάνδρι, Αγία Παρασκευή'},
  {value:'attica_east',label:'Αττική Ανατολική',description:'Παλλήνη, Κορωπί, Σπάτα'},
  {value:'attica_west',label:'Αττική Δυτική',description:'Περιστέρι, Αιγάλεω, Ίλιον'},
  {value:'attica_piraeus_prime',label:'Πειραιάς Α',description:'Καστέλα, Φρεαττύδα'},
  {value:'attica_piraeus_std',label:'Πειραιάς Β',description:'Κερατσίνι, Νίκαια'},
  {value:'thess_center',label:'Θεσσαλονίκη Κέντρο',description:'Κέντρο, ΑΠΘ, Λαδάδικα'},
  {value:'thess_east',label:'Θεσσαλονίκη Ανατολικά',description:'Καλαμαριά, Τριανδρία'},
  {value:'thess_suburbs_n',label:'Θεσσαλονίκη Βόρεια',description:'Πυλαία, Θέρμη'},
  {value:'crete_heraklion',label:'Ηράκλειο Κρήτης',description:'Ηράκλειο, Γάζι'},
  {value:'crete_chania',label:'Χανιά',description:'Χανιά, Ακρωτήρι'},
  {value:'mykonos',label:'Μύκονος',description:'Μύκονος, Άνω Μέρα'},
  {value:'santorini',label:'Σαντορίνη',description:'Φηρά, Οία'},
  {value:'rhodes',label:'Ρόδος',description:'Ρόδος πόλη, Λίνδος'},
  {value:'corfu',label:'Κέρκυρα',description:'Κέρκυρα πόλη'},
  {value:'patras',label:'Αχαΐα',description:'Πάτρα, Ρίο'},
  {value:'larissa',label:'Λάρισα',description:'Λάρισα, Τύρναβος'},
  {value:'volos',label:'Μαγνησία',description:'Βόλος, Πήλιο'},
  {value:'ioannina',label:'Ιωάννινα',description:'Ιωάννινα, Ζαγόρι'},
  {value:'other',label:'Άλλη περιοχή',description:''},
]

interface CalcHistory {id:string;ts:string;loanType:LoanType;amount:number;rate:number;years:number;monthly:number}

interface Props {
  propertyId:string;userId:string;market:MarketRates
  onSaveLoan:(loan:Partial<SavedLoan>)=>Promise<void>
  onSaveToCalendar:(monthly:number,years:number,startDate:string,bankName:string)=>Promise<void>
  onSaveToExpenses:(monthly:number,bankName:string)=>Promise<void>
  onStateChange?:(s:any)=>void
  // Προφίλ χρήστη: «ιδιώτης» ή «επιχείρηση». Καθορίζει ποιοι τύποι δανειολήπτη
  // είναι σχετικοί, ώστε να μην κουράζουμε τον χρήστη με άσχετες επιλογές.
  profile?:'individual'|'business'
  // Αρχικές τιμές από το πραγματικό ακίνητο του χρήστη (προαιρετικά).
  initial?:{loanAmount?:string;propValue?:string;sqm?:string}
  // Τιμές που «εφαρμόζονται» εξωτερικά (π.χ. από σάρωση εγγράφου δανειολήπτη).
  // Το πεδίο v είναι σφραγίδα έκδοσης ώστε η εφαρμογή να ενεργοποιείται μόνο σε νέα σάρωση.
  applied?:{v:number;loanAmount?:number;propValue?:number;rate?:number;years?:number;rateType?:RateType;loanType?:string;income?:number;marital?:'single'|'married';children?:number}
}

const NATURAL_BORROWERS:BorrowerType[] = ['individual','young','family','senior','military','abroad']
const BUSINESS_BORROWERS:BorrowerType[] = ['professional','company']

export default function TabLoanCalculator({propertyId,userId,market,initial,applied,onSaveLoan,onSaveToCalendar,onSaveToExpenses,onStateChange,profile='individual'}:Props) {
  const [loanAmount,  setLoanAmount]  = useState(initial?.loanAmount || '150000')
  const [propValue,   setPropValue]   = useState(initial?.propValue || '185000')
  const [sqm,         setSqm]         = useState(initial?.sqm || '80')
  const [propType,    setPropType]    = useState('residence')
  const [area,        setArea]        = useState('attica_center_std')
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
  const [lens,        setLens]        = useState('amort')
  const [income,      setIncome]      = useState('2000')
  const [monthlyRent, setMonthlyRent] = useState(()=>String(Math.round((parseFloat(initial?.propValue||'185000')||185000)*0.04/12)))
  const [marital,     setMarital]     = useState<'single'|'married'>('single')
  const [children,    setChildren]    = useState('0')
  const [hasAgent,    setHasAgent]    = useState(false)
  const [agentPct,    setAgentPct]    = useState('2')
  const [scenarios,   setScenarios]   = useState<LoanScenario[]>([])
  const [editingId,   setEditingId]   = useState<string|null>(null)

  // Εφαρμογή τιμών από εξωτερική σάρωση (έγγραφο/φωτογραφία δανειολήπτη). Τρέχει
  // μόνο όταν αλλάζει η σφραγίδα έκδοσης, ώστε να μη «μαχαιρώνει» τις χειροκίνητες αλλαγές.
  useEffect(()=>{
    if(!applied) return
    if(applied.loanAmount!=null && applied.loanAmount>0) setLoanAmount(String(Math.round(applied.loanAmount)))
    if(applied.propValue!=null && applied.propValue>0) setPropValue(String(Math.round(applied.propValue)))
    if(applied.rate!=null && applied.rate>0) setRate(String(applied.rate))
    if(applied.years!=null && applied.years>0) setYears(String(Math.round(applied.years)))
    if(applied.rateType) setRateType(applied.rateType)
    if(applied.loanType && (LOAN_TYPES as any)[applied.loanType]) setLoanType(applied.loanType as LoanType)
    if(applied.income!=null && applied.income>0) setIncome(String(Math.round(applied.income)))
    if(applied.marital) setMarital(applied.marital)
    if(applied.children!=null) setChildren(String(Math.round(applied.children)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[applied?.v])
  const [remBal,      setRemBal]      = useState('100000')
  const [remYears,    setRemYears]    = useState('20')
  const [curRate,     setCurRate]     = useState('4.0')
  const [newRate,     setNewRate]     = useState('3.0')
  const [xferCost,    setXferCost]    = useState('2000')
  const [saving,      setSaving]      = useState(false)
  const [activePreset,setActivePreset]= useState<string|null>(null)
  const [history,     setHistory]     = useState<CalcHistory[]>([])
  // Ομοιόμορφοι αριθμοί: όλα λευκά, γαλάζιο μόνο όταν περνά ο κέρσορας/δάχτυλο.
  const [hoverKpi,  setHoverKpi]  = useState<number|null>(null)
  const [hoverAct,  setHoverAct]  = useState<number|null>(null)
  const [hoverCap,  setHoverCap]  = useState<number|null>(null)
  const [hoverHist, setHoverHist] = useState<number|null>(null)
  const [hoverRow,  setHoverRow]  = useState<number|null>(null)
  const [hoverCost, setHoverCost] = useState<number|null>(null)
  const [toast,       setToast]       = useState<string|null>(null)
  const historyTimer = useRef<any>(null)
  const toastTimer   = useRef<any>(null)
  function showToast(msg:string){setToast(msg);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),2500)}

  // Το προφίλ (ιδιώτης/επιχείρηση) περιορίζει τους τύπους δανειολήπτη σε αυτούς
  // που πραγματικά αφορούν τον χρήστη — καθαρή, στοχευμένη εμπειρία.
  const borrowerOptions = useMemo(
    ()=>BORROWER_OPTIONS.filter(o=>(profile==='business'?BUSINESS_BORROWERS:NATURAL_BORROWERS).includes(o.value as BorrowerType)),
    [profile]
  )
  useEffect(()=>{
    const allowed = profile==='business'?BUSINESS_BORROWERS:NATURAL_BORROWERS
    if(!allowed.includes(borrower)) setBorrower(profile==='business'?'professional':'individual')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[profile])

  const LA   = parseFloat(loanAmount)||0
  const PV   = parseFloat(propValue)||0
  const SQM  = parseFloat(sqm)||0
  const R    = parseFloat(rate)||0
  const Y    = parseInt(years)||0
  const EP   = parseFloat(extraPay)||0
  const INC  = parseFloat(income)||2000
  const CH   = parseInt(children)||0
  const RB   = parseFloat(remBal)||0
  const RY   = parseFloat(remYears)||0
  const CR   = parseFloat(curRate)||0
  const NR   = parseFloat(newRate)||0
  const XC   = parseFloat(xferCost)||0
  const AGNT = hasAgent?(PV*parseFloat(agentPct||'2')/100):0

  const effRate   = rateType==='variable'?market.euribor_3m+R:R
  const monthly   = calcMonthly(LA,effRate,Y)
  const total     = monthly*Y*12
  const totalInt  = total-LA
  const ltv       = PV>0?(LA/PV)*100:0
  const sqmPrice  = PV>0&&SQM>0?PV/SQM:0
  const amort     = useMemo(()=>calcAmortization(LA,effRate,Y),[LA,effRate,Y])

  const notaryCosts = useMemo(()=>calcNotaryFees(PV,propType),[PV,propType])
  const fmaEx    = calcFmaExemption(marital,CH)
  const isNewBuilding = propType==='new_residence'
  const isCommercial  = propType==='store'||propType==='warehouse'
  const fmaOwed  = useMemo(()=>{
    if(isNewBuilding)return 0
    if(isCommercial)return PV*0.03
    if(loanType==='first_home'&&PV<=fmaEx)return 0
    return PV*0.03
  },[isNewBuilding,isCommercial,loanType,PV,fmaEx])
  const vatOwed  = isNewBuilding?PV*0.24:0
  const totalCosts = useMemo(()=>{
    const tax=isNewBuilding?vatOwed:fmaOwed
    return{tax,notary:notaryCosts.notary,landReg:notaryCosts.landReg,legal:notaryCosts.legal,agent:AGNT,other:notaryCosts.other,total:tax+notaryCosts.total+AGNT,downpayment:PV-LA,totalCash:(PV-LA)+tax+notaryCosts.total+AGNT}
  },[isNewBuilding,vatOwed,fmaOwed,notaryCosts,AGNT,PV,LA])

  // Ενδεικτικό μεικτό ετήσιο ενοίκιο ~4% της αξίας (όχι συνάρτηση της δόσης — η προηγούμενη
  // εκτίμηση «80% της δόσης» ανέβαινε αντι-διαισθητικά όταν ανέβαινε το επιτόκιο).
  const renInc   = loanType==='investment'?PV*0.04:0
  const renTax   = calcRentalTax(renInc*(1-TAX_DATA.rental_expense_deduction))
  // «Σπίτι μου ΙΙ»: το 50% του δανείου είναι άτοκο (0%), το υπόλοιπο 50% με το
  // επιτόκιο της τράπεζάς σου. Μοντελοποιούμε τα δύο σκέλη αντί για αυθαίρετο
  // ευριστικό. Το εμφανιζόμενο «επιτόκιο» είναι το μεικτό (~μισό του κανονικού).
  const spitiM   = calcMonthly(LA*0.5,0,Y) + calcMonthly(LA*0.5,effRate,Y)
  const spitiR   = effRate/2
  const spitiSv  = (monthly-spitiM)*Y*12
  // «Σπίτι μου ΙΙ»: μόνο πρώτη κατοικία, αξία έως 250.000€, υφιστάμενο (όχι νεόδμητο)
  // και όχι επαγγελματικό. Χωρίς αυτά τα κριτήρια η εκτίμηση εξοικονόμησης είναι
  // παραπλανητική — γι' αυτό την εμφανίζουμε μόνο όταν το ακίνητο πληροί τα βασικά.
  const spitiEligible = loanType==='first_home' && PV<=250000 && !isNewBuilding && !isCommercial

  // Στην αναχρηματοδότηση το «τρέχον» επιτόκιο είναι του υπάρχοντος δανείου
  // (curRate), όχι το νέο μοντελοποιημένο επιτόκιο.
  const currM    = calcMonthly(RB,CR,RY)
  const newM     = calcMonthly(RB,NR,RY)
  const mSav     = currM-newM
  const refSav   = mSav*RY*12-XC
  const brkEven  = mSav>0?Math.ceil(XC/mSav):null

  const stress   =[{label:'Τρέχον',rate:effRate},{label:'+0,5%',rate:effRate+0.5},{label:'+1%',rate:effRate+1},{label:'+2%',rate:effRate+2},{label:'+3%',rate:effRate+3},{label:'6% συνολικό',rate:6}].filter(s=>s.label==='Τρέχον'||s.rate>effRate).map(s=>({...s,monthly:calcMonthly(LA,s.rate,Y)}))
  const amortChart = useMemo(()=>{const out=[];for(let y=1;y<=Math.min(Y,30);y++){const rows=amort.slice((y-1)*12,y*12);out.push({year:`${y}`,Κεφάλαιο:Math.round(rows.reduce((s,r)=>s+r.principal,0)),Τόκοι:Math.round(rows.reduce((s,r)=>s+r.interest,0))})}return out},[amort,Y])
  // Κυμαινόμενο = Euribor + ΠΕΡΙΘΩΡΙΟ (spread). Σε λειτουργία «σταθερού» το R είναι το ΠΛΗΡΕΣ
  // επιτόκιο, όχι spread — γι' αυτό χρησιμοποιούμε τυπικό περιθώριο αγοράς (πριν διπλομετρούσαμε).
  const typicalVarSpread = 1.5
  const variableRate = market.euribor_3m + (rateType==='variable'?R:typicalVarSpread)
  const varMonthly  = calcMonthly(LA,variableRate,Y)
  // Γνήσια σύγκριση σταθερού/κυμαινόμενου: σε λειτουργία «κυμαινόμενου» το effRate
  // ΕΙΝΑΙ ήδη Euribor+περιθώριο, άρα ταυτίζεται με το variableRate και η σύγκριση
  // εκφυλίζεται· χρησιμοποιούμε αντιπροσωπευτικό σταθερό της αγοράς ως αναφορά.
  const bankFixedMins = BANKS.map((b:any)=>Number(b.fixed_min)).filter((x:number)=>x>0)
  const fixedRefRate = rateType==='variable' && bankFixedMins.length ? Math.min(...bankFixedMins) : effRate
  const fixedRefMonthly = calcMonthly(LA,fixedRefRate,Y)
  const varShownRate = rateType==='variable' ? effRate : variableRate
  const varShownMonthly = rateType==='variable' ? monthly : varMonthly
  // Σωρευτικοί τόκοι με πραγματική τοκοχρεολυτική απόσβεση (όχι γραμμική αναλογία κεφαλαίου).
  const cumInterest = (ratePct:number,uptoYear:number)=>{const m=calcMonthly(LA,ratePct,Y);const rr=ratePct/100/12;let bal=LA,sum=0;for(let k=1;k<=uptoYear*12&&bal>0;k++){const i=rr===0?0:bal*rr;sum+=i;bal-=(m-i)}return Math.round(sum)}
  const fvChartData = useMemo(()=>{const pts=[3,5,7,10,15,20,25,30].filter(y=>y<=Y);return pts.map(yr=>({year:`${yr} έτη`,Σταθερό:cumInterest(fixedRefRate,yr),Κυμαινόμενο:cumInterest(varShownRate,yr)}))},[fixedRefRate,varShownRate,LA,Y])
  const scenChart = useMemo(()=>scenarios.map(s=>({name:s.label,Τόκοι:Math.round(calcMonthly(s.amount,s.rate,s.years)*s.years*12-s.amount)})),[scenarios])

  const extraSav = useMemo(()=>{
    if(EP<=0)return null
    let bal=LA,months=0,ti=0,m=monthly+EP
    while(bal>0&&months<Y*12){const int=bal*(effRate/100/12);ti+=int;bal=bal*(1+effRate/100/12)-m;months++}
    return{savedMonths:Y*12-months,savedInt:Math.max(0,totalInt-ti)}
  },[LA,effRate,Y,EP,monthly,totalInt])

  useMemo(()=>{
    onStateChange?.({loanType,borrowerType:borrower,loanAmount:LA,years:Y,rateType,effectiveRate:effRate,monthly,totalInterest:totalInt,propertyValue:PV,sqm:SQM,propType,area})
    if(LA>0&&Y>0&&effRate>0){
      if(historyTimer.current)clearTimeout(historyTimer.current)
      historyTimer.current=setTimeout(()=>{setHistory(h=>[{id:Date.now().toString(),ts:new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}),loanType,amount:LA,rate:effRate,years:Y,monthly},...h].slice(0,5))},800)
    }
  },[loanType,borrower,LA,Y,rateType,effRate,monthly,totalInt,PV])

  const bankName = bankId==='custom'?customBank:BANKS.find(b=>b.id===bankId)?.name||''
  const areaLabel = AREA_OPTIONS.find(a=>a.value===area)?.label||''
  const propTypeLabel = PROPERTY_TYPES.find(p=>p.value===propType)?.label||''

  function applyPreset(p:typeof PRESETS[0]){setLoanAmount(p.values.loanAmount);setPropValue(p.values.propValue);setSqm(p.values.sqm);setRate(p.values.rate);setYears(p.values.years);setRateType(p.values.rateType);setLoanType(p.values.loanType);setBorrower(p.values.borrower);setFixedPeriod(p.values.fixedPeriod);setPropType(p.values.propType);setArea(p.values.area);setActivePreset(p.id)}
  function addScen(){setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:LA,rate:effRate,years:Y,rateType}])}
  function updScen(id:string,f:string,v:any){setScenarios(s=>s.map(x=>x.id===id?{...x,[f]:v}:x))}
  function delScen(id:string){setScenarios(s=>s.filter(x=>x.id!==id))}
  function applyScen(s:LoanScenario){setLoanAmount(String(s.amount));setRate(String(s.rateType==='variable'?s.rate-market.euribor_3m:s.rate));setYears(String(s.years));setRateType(s.rateType);setActivePreset(null)}
  function applyHist(h:CalcHistory){setLoanAmount(String(h.amount));setRate(String(h.rate));setYears(String(h.years));setLoanType(h.loanType);setActivePreset(null)}
  async function handleSave(){setSaving(true);await onSaveLoan({bank:bankName||'Μη καθορισμένη',loan_type:loanType,amount:LA,property_value:PV,rate:effRate,rate_type:rateType,years:Y,start_date:startDate,status:'active',notes:`${propTypeLabel} ${SQM}τ.μ., ${areaLabel}${notes?`, ${notes}`:''}`});setSaving(false);showToast('Το δάνειο αποθηκεύτηκε')}

  // ── Ημερομηνία δόσης i (1..n) με βάση την έναρξη ──────────────────────────────
  function installmentDate(i:number){
    const base=startDate?new Date(startDate):new Date()
    const d=new Date(base.getFullYear(),base.getMonth()+i,base.getDate())
    return d
  }
  const amortFileBase = ()=>`toxoxreolysio_${bankName?bankName.toLowerCase().replace(/\s+/g,'_').slice(0,24)+'_':''}${Math.round(LA/1000)}k_${Y}et`

  // ── Εξαγωγή πλήρους πίνακα τοκοχρεολυσίου σε CSV (ανοίγει σε Excel) ───────────
  function exportAmortCsv(){
    if(!amort.length){showToast('Δεν υπάρχουν δόσεις προς εξαγωγή');return}
    downloadCsv(
      amortFileBase(),
      ['Δόση','Ημερομηνία','Έτος','Ποσό δόσης (€)','Κεφάλαιο (€)','Τόκος (€)','Υπόλοιπο (€)','Σωρευτικοί τόκοι (€)'],
      amort.map(r=>{
        const dt=installmentDate(r.month)
        return [
          r.month,
          dt.toLocaleDateString('el-GR',{month:'2-digit',year:'numeric'}),
          Math.ceil(r.month/12),
          csvEur(r.payment), csvEur(r.principal), csvEur(r.interest),
          csvEur(r.balance), csvEur(r.totalInterestPaid),
        ]
      })
    )
    showToast('Ο πίνακας τοκοχρεολυσίου εξήχθη')
  }

  // ── Εξαγωγή πίνακα τοκοχρεολυσίου σε εκτυπώσιμο PDF (μέσω παραθύρου εκτύπωσης) ─
  function exportAmortPdf(){
    if(!amort.length){showToast('Δεν υπάρχουν δόσεις προς εξαγωγή');return}
    const w=window.open('','_blank','width=900,height=700')
    if(!w){showToast('Επιτρέψτε τα αναδυόμενα παράθυρα για εξαγωγή PDF');return}
    const today=new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'})
    const meta=[
      ['Τράπεζα', bankName||'—'],
      ['Ποσό δανείου', fmtEur(LA)],
      ['Επιτόκιο', `${fmtPct(effRate)} · ${rateType==='variable'?'κυμαινόμενο':'σταθερό'}`],
      ['Διάρκεια', `${Y} έτη (${Y*12} δόσεις)`],
      ['Μηνιαία δόση', fmtEur(monthly)],
      ['Σύνολο τόκων', fmtEur(totalInt)],
      ['Συνολική αποπληρωμή', fmtEur(LA+totalInt)],
    ]
    const metaRows=meta.map(([k,v])=>`<div class="m"><span>${escHtml(k)}</span><strong>${escHtml(v)}</strong></div>`).join('')
    const bodyRows=amort.map(r=>{
      const dt=installmentDate(r.month).toLocaleDateString('el-GR',{month:'2-digit',year:'numeric'})
      const yearStart=(r.month-1)%12===0
      return `<tr${yearStart?' class="ys"':''}><td class="n">${r.month}</td><td class="n">${escHtml(dt)}</td><td class="e">${escHtml(fmtEur(r.payment))}</td><td class="e">${escHtml(fmtEur(r.principal))}</td><td class="e dim">${escHtml(fmtEur(r.interest))}</td><td class="e">${escHtml(fmtEur(r.balance))}</td><td class="e dim">${escHtml(fmtEur(r.totalInterestPaid))}</td></tr>`
    }).join('')
    w.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"/><title>Πίνακας τοκοχρεολυσίου</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;padding:32px 36px;font-size:12px;line-height:1.4}
      h1{font-size:19px;font-weight:600;letter-spacing:-.01em}
      .sub{color:#666;font-size:11px;margin-top:3px}
      .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:16px}
      .brand{font-size:12px;color:#666;text-align:right}
      .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 28px;margin-bottom:20px}
      .m{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:5px 0}
      .m span{color:#666}
      .m strong{font-variant-numeric:tabular-nums;font-weight:600}
      table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
      thead th{text-align:right;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#666;font-weight:600;padding:7px 8px;border-bottom:1px solid #111}
      thead th:first-child,thead th:nth-child(2){text-align:left}
      tbody td{padding:4px 8px;border-bottom:1px solid #f0f0f0}
      td.n{text-align:left;color:#666}
      td.e{text-align:right}
      td.dim{color:#666}
      tr.ys td{border-top:1px solid #d8d8d8}
      tfoot{color:#999;font-size:10px}
      .note{margin-top:16px;color:#999;font-size:10px;line-height:1.5}
      @media print{body{padding:0}@page{margin:14mm}}
    </style></head><body>
      <div class="hd">
        <div><h1>Πίνακας τοκοχρεολυσίου</h1><div class="sub">Ανάλυση αποπληρωμής ανά δόση</div></div>
        <div class="brand"><strong>Property OS</strong><br/>${escHtml(today)}</div>
      </div>
      <div class="meta">${metaRows}</div>
      <table>
        <thead><tr><th>Δόση</th><th>Ημ/νία</th><th>Ποσό</th><th>Κεφάλαιο</th><th>Τόκος</th><th>Υπόλοιπο</th><th>Σωρ. τόκοι</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="note">Ενδεικτικός υπολογισμός με σταθερή τοκοχρεολυτική δόση. Οι πραγματικοί όροι εξαρτώνται από την τράπεζα και τυχόν έξοδα, ασφάλιστρα ή μεταβολές επιτοκίου.</div>
      <script>window.onload=function(){window.print()}</script>
    </body></html>`)
    w.document.close()
    showToast('Άνοιξε το παράθυρο εκτύπωσης PDF')
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Quick Presets — συμπτυσσόμενα, διακριτικά chips (όχι κουραστικές κάρτες) */}
      <Section title="Γρήγορη συμπλήρωση" sub="Έτοιμα σενάρια — προαιρετικό ξεκίνημα">
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {PRESETS.map(p=>{
            const on = activePreset===p.id
            return (
              <button key={p.id} onClick={()=>applyPreset(p)} title={p.desc} style={{display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 14px',borderRadius:20,cursor:'pointer',background:on?'var(--accent-dim)':'var(--bg-surface)',border:`1px solid ${on?'var(--border-accent)':'var(--border-subtle)'}`,color:on?'var(--accent)':'var(--text-secondary)',fontSize:12.5,fontFamily:"'Inter',sans-serif",fontWeight:500,transition:'all 0.15s'}}>
                {on&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
                {p.label}
              </button>
            )
          })}
        </div>
      </Section>

      {/* Property + Loan type */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12,alignItems:'start'}}>
        <div style={cardStyle}>
          <SectionLabel label="Στοιχεία ακινήτου"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <CustomSelect label="Τύπος ακινήτου" value={propType} onChange={v=>{setPropType(v);setActivePreset(null)}} options={PROP_TYPE_OPTIONS}/>
            <CustomSelect label="Περιοχή" value={area} onChange={v=>{setArea(v);setActivePreset(null)}} options={AREA_OPTIONS}/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10}}>
              <NumberInput label="Τιμή αγοράς (€)" value={propValue} onChange={v=>{setPropValue(v);setActivePreset(null)}} suffix="€"/>
              <NumberInput label="Εμβαδόν (τετραγωνικά μέτρα)" value={sqm} onChange={v=>{setSqm(v);setActivePreset(null)}} suffix="τ.μ."/>
            </div>
            {sqmPrice>0&&(
              <div style={{padding:'10px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Τιμή ανά τετραγωνικό μέτρο</span>
                <span style={{fontSize:13,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(sqmPrice)}</span>
              </div>
            )}
            {isNewBuilding&&<div style={{padding:'9px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}><p title="ΦΠΑ: Φόρος Προστιθέμενης Αξίας · ΦΜΑ: Φόρος Μεταβίβασης Ακινήτου" style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Νεόδμητο: ΦΠΑ 24% ({fmtEur(vatOwed)}) αντί ΦΜΑ</p></div>}
            {isCommercial&&<div style={{padding:'9px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}><p title="ΦΜΑ: Φόρος Μεταβίβασης Ακινήτου (3% επί της αξίας)" style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Επαγγελματικό: ΦΜΑ 3% + Τέλη χαρτοσήμου 3,6% αν εκμισθωθεί</p></div>}
            <div style={{display:'flex',alignItems:'flex-end',gap:12,flexWrap:'wrap'}}>
              <button onClick={()=>setHasAgent(h=>!h)} style={{...pillBtn(hasAgent,'var(--accent)'),height:44}}>
                {hasAgent?<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
                Αμοιβή μεσίτη
              </button>
              {hasAgent&&<div style={{width:150}}><NumberInput label="Ποσοστό μεσίτη" value={agentPct} onChange={setAgentPct} suffix="%" step={0.5}/></div>}
              {hasAgent&&<div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',justifyContent:'flex-end',height:44,padding:'0 4px'}}><span style={{fontSize:14,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(AGNT)}</span></div>}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Σκοπός και δανειολήπτης"/>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <CustomSelect label="Σκοπός δανείου" value={loanType} onChange={v=>{setLoanType(v as LoanType);setActivePreset(null)}} options={LOAN_TYPE_OPTIONS}/>
            <div style={{padding:'8px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{LOAN_TYPES[loanType].tax_note}</p>
            </div>
            <CustomSelect label="Τύπος δανειολήπτη" value={borrower} onChange={v=>{setBorrower(v as BorrowerType);setActivePreset(null)}} options={borrowerOptions}/>
            <div style={{padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
              <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{BORROWER_PROFILES[borrower].tax_benefits}</p>
            </div>
            {BORROWER_PROFILES[borrower].special&&<div style={{padding:'7px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{BORROWER_PROFILES[borrower].special}</p></div>}
          </div>
        </div>
      </div>

      {/* Loan params */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12}}>
        <div style={cardStyle}>
          <SectionLabel label="Στοιχεία δανείου"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <NumberInput label="Ποσό δανείου (€)" value={loanAmount} onChange={v=>{setLoanAmount(v);setActivePreset(null)}} suffix="€"/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
                <span title="Ποσοστό δανείου ως προς την αξία του ακινήτου" style={{fontSize:12,color:ltv>90?'var(--negative)':'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Δάνειο προς αξία {ltv.toFixed(1).replace('.',',')}%</span>
                <span style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>Ίδια: {fmtEur(PV-LA)}</span>
              </div>
            </div>
            <NumberInput label="Διάρκεια (χρόνια)" value={years} onChange={v=>{setYears(v);setActivePreset(null)}} suffix="έτη" min={3} max={35}/>
            <DatePicker label="Ημερομηνία έναρξης" value={startDate} onChange={setStartDate}/>
            <div>
              <CustomSelect label="Τράπεζα" value={bankId} onChange={setBankId} options={BANK_OPTIONS} placeholder="— Επιλέξτε τράπεζα —"/>
              {bankId==='custom'&&<div style={{marginTop:8}}><TextInput label="Όνομα τράπεζας" value={customBank} onChange={setCustomBank} placeholder="π.χ. Παγκρήτια Τράπεζα"/></div>}
            </div>
            <Textarea label="Σημειώσεις" value={notes} onChange={setNotes} placeholder="π.χ. 3ος όροφος, άποψη, ανακαινισμένο…" rows={2}/>
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Επιτόκιο και παράμετροι"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <CustomSelect label="Τύπος επιτοκίου" value={rateType} onChange={v=>{setRateType(v as RateType);setActivePreset(null)}} options={RATE_TYPE_OPTIONS}/>
            {(rateType==='fixed'||rateType==='mixed')&&<CustomSelect label="Διάρκεια σταθερής περιόδου" value={fixedPeriod} onChange={setFixedPeriod} options={FIXED_PERIOD_OPTIONS}/>}
            <div title={rateType==='variable'?'Περιθώριο τράπεζας πάνω από το Euribor':undefined}>
              <NumberInput label={rateType==='variable'?'Περιθώριο τράπεζας (%)':'Ετήσιο επιτόκιο (%)'} value={rate} onChange={v=>{setRate(v);setActivePreset(null)}} suffix="%" step={0.05}/>
              {rateType==='variable'&&(
                <div style={{marginTop:7,padding:'9px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                  <p style={{fontSize:12,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}><span title="Διατραπεζικό επιτόκιο ευρώ — βάση κυμαινόμενων δανείων">Euribor</span> {fmtPct(market.euribor_3m)} + {fmtPct(R)} = <strong>{fmtPct(effRate)}</strong></p>
                  <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>Αυτόματη ενημέρωση από την ΕΚΤ κάθε πρωί</p>
                </div>
              )}
            </div>
            <div>
              <NumberInput label="Έκτακτη μηνιαία πληρωμή (€)" value={extraPay} onChange={setExtraPay} suffix="€" placeholder="0"/>
              {extraSav&&EP>0&&(
                <div style={{marginTop:6,padding:'9px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--accent)',borderRadius:8}}>
                  <p style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Εξοικονομείτε {Math.round(extraSav.savedMonths/12)} χρόνια και {fmtEur(extraSav.savedInt)} τόκους</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs — ομοιόμορφα 3D κουτάκια· ίδιο χρώμα παντού, γαλάζιο μόνο στο hover */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:14}}>
        {[
          {k:'Μηνιαία δόση',v:fmtEur(monthly),s:`${rateType==='variable'?'κυμαινόμενο':'σταθερό'} ${fmtPct(effRate)} · ${Y} έτη`,neg:false},
          {k:'Σύνολο τόκων',v:fmtEur(totalInt),s:`${((totalInt/Math.max(LA,1))*100).toFixed(0)}% επί κεφαλαίου`,neg:false},
          {k:'Συνολική αποπληρωμή',v:fmtEur(total),s:`κεφάλαιο ${fmtEur(LA)}`,neg:false},
          {k:'Δάνειο προς αξία',v:`${ltv.toFixed(1).replace('.',',')}%`,s:`ίδια κεφάλαια ${fmtEur(PV-LA)}`,neg:ltv>90},
        ].map((t,i)=>{
          const on=hoverKpi===i
          return (
          <div key={t.k}
            onMouseEnter={()=>setHoverKpi(i)} onMouseLeave={()=>setHoverKpi(null)}
            onTouchStart={()=>setHoverKpi(i)} onTouchEnd={()=>setHoverKpi(null)}
            style={{position:'relative',background:'var(--bg-elevated)',border:`1px solid ${on?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:16,padding:'18px 18px 16px',transition:'border-color 0.15s, box-shadow 0.15s',
            boxShadow:on?'0 2px 4px color-mix(in srgb, var(--text-primary) 10%, transparent), 0 12px 26px -12px color-mix(in srgb, var(--text-primary) 28%, transparent)':'0 1px 2px color-mix(in srgb, var(--text-primary) 8%, transparent), 0 8px 20px -12px color-mix(in srgb, var(--text-primary) 22%, transparent)'}}>
            <p style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.07em',fontWeight:700,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{t.k}</p>
            <p style={{fontSize:29,fontWeight:700,letterSpacing:'-0.025em',lineHeight:1,marginTop:8,color:t.neg?'var(--negative)':on?'var(--accent)':'var(--text-primary)',fontVariantNumeric:'tabular-nums',fontFamily:"'Inter',sans-serif",transition:'color 0.15s'}}>{t.v}</p>
            <p style={{fontSize:11.5,marginTop:7,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{t.s}</p>
          </div>
          )
        })}
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {[
          {label:saving?'Αποθήκευση…':'Αποθήκευση δανείου',fn:handleSave,disabled:saving,color:'var(--accent)',bg:'var(--accent-dim)',border:'var(--border-accent)'},
          {label:'Δόσεις → Ημερολόγιο',fn:async()=>{await onSaveToCalendar(monthly,Y,startDate,bankName);showToast('Οι δόσεις προστέθηκαν στο ημερολόγιο')},disabled:false,color:'var(--text-secondary)',bg:'var(--bg-elevated)',border:'var(--border-subtle)'},
          {label:'Δόση → Δαπάνες',fn:async()=>{await onSaveToExpenses(monthly,bankName);showToast('Η δόση προστέθηκε στις δαπάνες')},disabled:false,color:'var(--text-secondary)',bg:'var(--bg-elevated)',border:'var(--border-subtle)'},
          {label:'+ Προσθήκη σεναρίου',fn:addScen,disabled:false,color:'var(--text-secondary)',bg:'var(--bg-elevated)',border:'var(--border-subtle)'},
        ].map(a=>(
          <button key={a.label} onClick={a.fn} disabled={a.disabled} style={{display:'flex',alignItems:'center',gap:7,padding:'0 18px',height:36,background:a.bg,border:`1px solid ${a.border}`,borderRadius:18,cursor:a.disabled?'wait':'pointer',color:a.color,fontSize:13,fontFamily:"'Inter',sans-serif",fontWeight:500,transition:'all 0.15s',whiteSpace:'nowrap' as const}}>
            {a.label}
          </button>
        ))}
      </div>

      {/* History */}
      {history.length>0&&(
        <div style={cardStyle}>
          <SectionLabel label="Ιστορικό υπολογισμών" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>Πάτησε για επαναφορά</span>}/>
          <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:2,scrollbarWidth:'none' as any}}>
            {history.map((h,i)=>{
              const on=hoverHist===i
              // «Έξυπνη» ένδειξη: διαφορά δόσης από τον προηγούμενο υπολογισμό.
              const prev=history[i+1]
              const delta=prev?Math.round(h.monthly-prev.monthly):0
              return (
              <button key={h.id} onClick={()=>applyHist(h)}
                onMouseEnter={()=>setHoverHist(i)} onMouseLeave={()=>setHoverHist(null)}
                onTouchStart={()=>setHoverHist(i)} onTouchEnd={()=>setHoverHist(null)}
                style={{flexShrink:0,display:'flex',flexDirection:'column',gap:5,padding:'10px 13px',minWidth:150,textAlign:'left' as const,cursor:'pointer',
                  background:'var(--bg-surface)',borderRadius:12,transition:'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
                  border:`1px solid ${on?'var(--border-default)':'var(--border-subtle)'}`,borderLeft:i===0?'2px solid var(--accent)':undefined,
                  transform:on?'translateY(-1px)':'none',boxShadow:on?'0 4px 14px -6px color-mix(in srgb, var(--text-primary) 30%, transparent)':'none'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                  <span style={{fontSize:9,textTransform:'uppercase' as const,letterSpacing:'0.05em',fontWeight:700,color:i===0?'var(--accent)':'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{i===0?'Τελευταίο':h.ts}</span>
                  {delta!==0&&<span style={{fontSize:10,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',fontWeight:600,color:'var(--text-tertiary)'}}>{delta>0?'▲':'▼'} {fmtEur(Math.abs(delta))}</span>}
                </div>
                <p style={{fontSize:15,color:on?'var(--accent)':'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',fontWeight:700,lineHeight:1,transition:'color 0.15s'}}>{fmtEur(h.monthly)}<span style={{fontSize:10,fontWeight:500,color:'var(--text-tertiary)'}}> τον μήνα</span></p>
                <p style={{fontSize:10.5,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>{fmtEur(h.amount)} · {fmtPct(h.rate)} · {h.years} έτη</p>
              </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Scenarios */}
      {scenarios.length>0&&(
        <div style={cardStyle}>
          <SectionLabel label="Σύγκριση σεναρίων"/>
          <div style={{overflowX:'auto',marginBottom:16}}>
            <div className="table-wrap">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{borderBottom:'1px solid var(--border-subtle)'}}>{['Σενάριο','Ποσό','Επιτόκιο','Χρόνια','Δόση τον μήνα','Συνολικοί τόκοι','Διαφορά',''].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{h}</th>)}</tr></thead>
              <tbody>
                {scenarios.map(s=>{
                  const m=calcMonthly(s.amount,s.rate,s.years),ti=m*s.years*12-s.amount,saved=totalInt-ti
                  const isBest=scenarios.length>1&&saved===Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return totalInt-(mx*x.years*12-x.amount)}))
                  const isEd=editingId===s.id
                  const cell=(v:string,f:string,w:number)=><input value={v} onChange={e=>updScen(s.id,f,f==='label'?e.target.value:Number(e.target.value))} style={{background:'var(--bg-surface)',border:'1px solid var(--accent)',borderRadius:10,padding:'5px 8px',color:'var(--text-primary)',fontSize:12,letterSpacing:0,outline:'none',width:w,fontFamily:f==='label'?"'Inter',sans-serif":"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}} type={f==='label'?'text':'number'} step={f==='rate'?0.05:1}/>
                  return(
                    <tr key={s.id} style={{borderBottom:'1px solid var(--border-subtle)',background:isBest?'var(--bg-surface)':'transparent'}}>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(s.label,'label',120):<div style={{display:'flex',alignItems:'center',gap:7}}><span style={{color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{s.label}</span>{isBest&&<span style={{fontSize:9,padding:'2px 7px',borderRadius:8,background:'var(--accent-dim)',color:'var(--accent)',border:'1px solid var(--border-accent)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>ΒΕΛΤΙΣΤΟ</span>}</div>}</td>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(String(s.amount),'amount',90):<span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(s.amount)}</span>}</td>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(String(s.rate),'rate',65):<span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>{fmtPct(s.rate)}</span>}</td>
                      <td style={{padding:'9px 10px'}}>{isEd?cell(String(s.years),'years',55):<span style={{color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{s.years} έτη</span>}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(m)}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>{fmtEur(ti)}</td>
                      <td style={{padding:'9px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:saved>0?'var(--accent)':'var(--text-tertiary)',fontWeight:600}}>{saved>0?`-${fmtEur(saved)}`:`+${fmtEur(-saved)}`}</td>
                      <td style={{padding:'9px 10px'}}>
                        <div style={{display:'flex',gap:3,alignItems:'center'}}>
                          {isEd
                            ?<button onClick={()=>setEditingId(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--accent)',display:'flex',padding:4}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>
                            :<>
                              <button onClick={()=>setEditingId(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',display:'flex',padding:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                              <button onClick={()=>applyScen(s)} style={{background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8,cursor:'pointer',color:'var(--accent)',display:'flex',alignItems:'center',gap:3,padding:'3px 7px',fontSize:11,fontFamily:"'Inter',sans-serif",fontWeight:500}}>Εφαρμογή</button>
                            </>
                          }
                          <button onClick={()=>delScen(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--border-default)',display:'flex',padding:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
          {scenChart.length>0&&(()=>{
            const maxI=Math.max(...scenChart.map(s=>s.Τόκοι),1)
            const minI=Math.min(...scenChart.map(s=>s.Τόκοι))
            return (
            <div style={{display:'flex',flexDirection:'column',gap:9}}>
              <p style={{...labelStyle,marginBottom:2}}>Συνολικοί τόκοι ανά σενάριο</p>
              {scenChart.map((s,i)=>{
                const best=scenChart.length>1&&s.Τόκοι===minI
                const w=Math.max(4,(s.Τόκοι/maxI)*100)
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
                    <span style={{width:96,flexShrink:0,fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis'}}>{s.name}</span>
                    <div style={{flex:1,height:26,borderRadius:8,background:'var(--bg-surface)',overflow:'hidden',position:'relative'}}>
                      <div style={{width:`${w}%`,height:'100%',borderRadius:8,transition:'width 0.4s ease',
                        background:best?'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 82%, transparent))':'color-mix(in srgb, var(--text-tertiary) 34%, transparent)'}}/>
                    </div>
                    <span style={{width:88,flexShrink:0,textAlign:'right' as const,fontSize:12.5,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:best?'var(--accent)':'var(--text-primary)',fontWeight:600}}>{fmtEur(s.Τόκοι)}</span>
                  </div>
                )
              })}
            </div>
            )
          })()}
        </div>
      )}

      {/* ── Lens switcher: ένα δυναμικό πάνελ επί τόπου (όχι στοίβαγμα) ── */}
      <LensBar value={lens} onChange={setLens} items={[
        {id:'amort',label:'Απόσβεση'},
        {id:'rate',label:'Επιτόκιο'},
        {id:'capacity',label:'Ικανότητα'},
        {id:'more',label:'Φόρος και αντοχή'},
        {id:'table',label:'Πίνακας και έγγραφα'},
      ]}/>

      {lens==='amort' && (
      <Section title="Γράφημα αποπληρωμής" sub="Κεφάλαιο έναντι τόκων στη διάρκεια" defaultOpen>
        <div style={{display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
            <AmortDonut principal={LA} interest={totalInt}/>
            <div style={{display:'flex',gap:14}}>
              <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}><span style={{width:9,height:9,borderRadius:2,background:'var(--accent)'}}/>Κεφάλαιο {fmtEur(LA)}</span>
              <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}><span style={{width:9,height:9,borderRadius:2,background:'var(--text-tertiary)',opacity:0.5}}/>Τόκοι {fmtEur(totalInt)}</span>
            </div>
          </div>
          <div style={{flex:1,minWidth:260}}>
            <AmortArea data={amortChart.map(d=>({year:d.year,cap:d.Κεφάλαιο,int:d.Τόκοι}))} fmt={fmtEur}/>
            <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:6,lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>
              Κάθε στήλη είναι η ετήσια δόση. Στην αρχή πληρώνεις κυρίως τόκους· σταδιακά υπερισχύει το κεφάλαιο. Η διακεκομμένη γραμμή δείχνει το έτος όπου το κεφάλαιο ξεπερνά τους τόκους.
            </p>
          </div>
        </div>
      </Section>
      )}

      {lens==='rate' && (<>
      <Section title="Σταθερό ή κυμαινόμενο επιτόκιο" sub="Ανάλυση κόστους σε πραγματικό χρόνο" badge="Ζωντανά" defaultOpen>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12,marginBottom:14}}>
          {[
            {label:'Σταθερό επιτόκιο',rate:fixedRefRate,m:fixedRefMonthly,pros:['Γνωστή δόση, χωρίς εκπλήξεις','Προστασία από άνοδο Euribor','Ιδανικό αν το Euribor αναμένεται να ανέβει'],cons:['Αρχικά υψηλότερο επιτόκιο','Ποινή πρόωρης αποπληρωμής'],c:'var(--text-primary)',bg:'var(--bg-surface)',border:'var(--border-subtle)'},
            {label:'Κυμαινόμενο επιτόκιο',rate:varShownRate,m:varShownMonthly,pros:[varShownMonthly<fixedRefMonthly?'Σήμερα χαμηλότερη δόση από το σταθερό':'Χαμηλότερη δόση αν υποχωρήσει το Euribor','Ωφελείσαι αν πέσει το Euribor','Χωρίς ποινή πρόωρης αποπληρωμής'],cons:['Κίνδυνος ανόδου Euribor','Αβεβαιότητα δόσης'],c:'var(--text-primary)',bg:'var(--bg-surface)',border:'var(--border-subtle)'},
          ].map(item=>(
            <div key={item.label} style={{background:item.bg,border:`1px solid ${item.border}`,borderRadius:10,padding:14}}>
              <p style={{fontSize:13,color:item.c,fontWeight:500,fontFamily:"'Inter',sans-serif",marginBottom:12}}>{item.label}</p>
              <div style={{display:'flex',gap:16,marginBottom:12}}>
                {[['Επιτόκιο',fmtPct(item.rate)],['Δόση τον μήνα',fmtEur(item.m)],['Συνολικοί τόκοι',fmtEur(item.m*Y*12-LA)]].map(([k,v])=>(
                  <div key={k}><p style={{fontSize:9,color:'var(--text-tertiary)',marginBottom:2,fontFamily:"'Inter',sans-serif",textTransform:'uppercase',letterSpacing:'0.5px'}}>{k}</p><p style={{fontSize:16,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:item.c,fontWeight:700}}>{v}</p></div>
                ))}
              </div>
              {item.pros.map((p,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:3}}><span style={{color:'var(--accent)',flexShrink:0,fontWeight:600}}>+</span><p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{p}</p></div>)}
              {item.cons.map((c,i)=><div key={i} style={{display:'flex',gap:6,marginBottom:3}}><span style={{color:'var(--text-tertiary)',flexShrink:0,fontWeight:600}}>−</span><p style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.4,fontFamily:"'Inter',sans-serif"}}>{c}</p></div>)}
            </div>
          ))}
        </div>
        <div style={{padding:'10px 13px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-default)',borderRadius:10,marginBottom:14}}>
          <p style={{fontSize:12.5,color:'var(--text-primary)',lineHeight:1.55,fontFamily:"'Inter',sans-serif"}}>
            {varShownMonthly<fixedRefMonthly
              ? `Σήμερα το κυμαινόμενο έχει χαμηλότερη δόση κατά ${fmtEur(fixedRefMonthly-varShownMonthly)} τον μήνα, όμως η δόση μεταβάλλεται με το Euribor.`
              : varShownMonthly>fixedRefMonthly
              ? `Σήμερα το σταθερό έχει χαμηλότερη δόση κατά ${fmtEur(varShownMonthly-fixedRefMonthly)} τον μήνα και εξασφαλίζει σταθερότητα σε όλη τη διάρκεια.`
              : 'Σήμερα οι δύο επιλογές έχουν παρόμοια δόση· το σταθερό προσφέρει σταθερότητα, το κυμαινόμενο ευελιξία.'}
          </p>
        </div>
        <p style={{...labelStyle,marginBottom:10}}>Σωρευτικοί τόκοι στη διάρκεια</p>
        <DualLine data={fvChartData} keyA="Σταθερό" keyB="Κυμαινόμενο" fmt={fmtEur}/>
        <div style={{display:'flex',gap:16,marginTop:8}}>
          <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}><span style={{width:14,height:2.4,borderRadius:2,background:'var(--accent)',display:'inline-block'}}/>Σταθερό</span>
          <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}><span style={{width:14,height:0,borderTop:'2px dashed var(--text-tertiary)',display:'inline-block'}}/>Κυμαινόμενο</span>
        </div>
      </Section>

      <Section title="Σπίτι μου ΙΙ έναντι κανονικού δανείου" sub={spitiEligible?'Εκτίμηση εξοικονόμησης, προθεσμία συμβολαίων 31/08/2026':'Κριτήρια ένταξης'}>
        {spitiEligible?(<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:12,marginBottom:14}}>
          {[
            {label:'Σπίτι μου ΙΙ (εκτίμηση)',rate:spitiR,m:spitiM,ti:spitiM*Y*12-LA,c:'var(--text-primary)',bg:'var(--bg-surface)',border:'var(--border-subtle)'},
            {label:'Κανονικό δάνειο',rate:effRate,m:monthly,ti:totalInt,c:'var(--text-primary)',bg:'var(--bg-surface)',border:'var(--border-subtle)'},
          ].map(item=>(
            <div key={item.label} style={{background:item.bg,border:`1px solid ${item.border}`,borderRadius:10,padding:14}}>
              <p style={{fontSize:13,color:item.c,fontWeight:500,fontFamily:"'Inter',sans-serif",marginBottom:12}}>{item.label}</p>
              {[['Επιτόκιο',fmtPct(item.rate)],['Δόση τον μήνα',fmtEur(item.m)],['Συνολικοί τόκοι',fmtEur(item.ti)],['Σύνολο',fmtEur(item.m*Y*12)]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{k}</span>
                  <span style={{fontSize:12,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:item.c,fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:10,padding:'14px 18px',textAlign:'center' as const}}>
          <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4,fontFamily:"'Inter',sans-serif"}}>Εκτιμώμενη συνολική εξοικονόμηση</p>
          <p style={{fontSize:32,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:'var(--accent)',fontWeight:700}}>{fmtEur(spitiSv)}</p>
          <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:6,fontFamily:"'Inter',sans-serif"}}>{fmtEur(spitiSv/Math.max(Y*12,1))} τον μήνα εξοικονόμηση</p>
        </div>
        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:10,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>Εκτίμηση βάσει μέσου επιδοτούμενου επιτοκίου. → <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>greece20.gov.gr</a></p>
        </>):(
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'16px 18px'}}>
          <p style={{fontSize:13,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",lineHeight:1.7,marginBottom:12}}>Το πρόγραμμα «Σπίτι μου ΙΙ» αφορά αποκλειστικά την αγορά πρώτης κατοικίας. Με τα τρέχοντα στοιχεία δεν πληρούνται τα βασικά κριτήρια, οπότε δεν εμφανίζεται εκτίμηση εξοικονόμησης για να μη σας δώσουμε παραπλανητικό νούμερο.</p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[
              {ok:loanType==='first_home',t:'Σκοπός: αγορά πρώτης κατοικίας'},
              {ok:PV<=250000,t:'Αξία ακινήτου έως 250.000€'},
              {ok:!isNewBuilding,t:'Υφιστάμενο ακίνητο (όχι νεόδμητο)'},
              {ok:!isCommercial,t:'Κατοικία (όχι επαγγελματικό ακίνητο)'},
            ].map(c=>(
              <div key={c.t} style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{width:18,height:18,borderRadius:'50%',flexShrink:0,border:`1.5px solid ${c.ok?'var(--border-accent)':'var(--border-default)'}`,background:c.ok?'var(--accent-dim)':'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,color:c.ok?'var(--accent)':'var(--text-tertiary)',fontWeight:700}}>{c.ok?'✓':''}</span>
                <span style={{fontSize:12.5,color:c.ok?'var(--text-primary)':'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{c.t}</span>
              </div>
            ))}
          </div>
          <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:14,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>Αναλυτικά κριτήρια και δικαιολογητικά → <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>greece20.gov.gr</a></p>
        </div>
        )}
      </Section>
      </>)}

      {lens==='capacity' && (<>
      {(()=>{
        // Δανειοληπτική ικανότητα με τα πραγματικά όρια ΤτΕ (50% πρώτη κατοικία / 40% λοιποί).
        const firstHome = loanType==='first_home'
        const aff = affordability({ incomeMonthly:INC, firstHome, desiredAmount:LA, ratePct:effRate, years:Y })
        return (
      <Section title="Δανειοληπτική ικανότητα" sub="Μέγιστο δάνειο βάσει εισοδήματος και ορίων Τράπεζας Ελλάδος" defaultOpen>
        <div style={{marginBottom:16}}><NumberInput label="Μηνιαίο καθαρό εισόδημα (€)" value={income} onChange={setIncome} suffix="€"/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:12,marginBottom:16}}>
          {[
            {k:'Μέγιστη δόση τον μήνα',v:fmtEur(aff.maxMonthly),s:`${Math.round(aff.limitPct*100)}% του εισοδήματος${firstHome?', πρώτη κατοικία':''}`,accent:false,neg:false},
            {k:'Μέγιστο δάνειο',v:fmtEur(aff.maxLoan),s:`με ${fmtPct(effRate)} · ${Y} έτη`,accent:false,neg:aff.maxLoan<LA},
            {k:'Δείκτης δόσης προς εισόδημα',v:INC>0?fmtPct1(aff.dstiUsedPct):'—',s:`όριο ${Math.round(aff.limitPct*100)}%`,accent:false,neg:aff.dstiUsedPct/100>aff.limitPct},
          ].map((t,i)=>{
            const on=hoverCap===i
            return (
            <div key={t.k}
              onMouseEnter={()=>setHoverCap(i)} onMouseLeave={()=>setHoverCap(null)}
              onTouchStart={()=>setHoverCap(i)} onTouchEnd={()=>setHoverCap(null)}
              style={{position:'relative',background:'var(--bg-elevated)',border:`1px solid ${on?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:16,padding:'16px 16px 14px',transition:'border-color 0.15s, box-shadow 0.15s',
              boxShadow:on?'0 2px 4px color-mix(in srgb, var(--text-primary) 10%, transparent), 0 12px 26px -12px color-mix(in srgb, var(--text-primary) 28%, transparent)':'0 1px 2px color-mix(in srgb, var(--text-primary) 8%, transparent), 0 8px 20px -12px color-mix(in srgb, var(--text-primary) 22%, transparent)'}}>
              <p style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:700,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{t.k}</p>
              <p style={{fontSize:26,fontWeight:700,letterSpacing:'-0.025em',lineHeight:1,marginTop:8,color:t.neg?'var(--negative)':on?'var(--accent)':'var(--text-primary)',fontVariantNumeric:'tabular-nums',fontFamily:"'Inter',sans-serif",transition:'color 0.15s'}}>{t.v}</p>
              <p style={{fontSize:11.5,marginTop:7,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{t.s}</p>
            </div>
            )
          })}
        </div>
        {/* Οπτικός μετρητής: πού βρίσκεται η δόση σου σε σχέση με το όριο */}
        {INC>0&&(()=>{
          const limitPct=aff.limitPct*100, usedPct=aff.dstiUsedPct, over=usedPct>limitPct
          const scaleMax=Math.max(limitPct*1.35, usedPct*1.08, 1)
          const usedW=Math.min(100,(usedPct/scaleMax)*100), limitX=Math.min(100,(limitPct/scaleMax)*100)
          return (
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:9}}>
                <span style={{fontSize:12.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Η δόση ως ποσοστό του εισοδήματος</span>
                <span style={{fontSize:12.5,color:over?'var(--negative)':'var(--accent)',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontWeight:600}}>{fmtPct1(usedPct)} <span style={{color:'var(--text-tertiary)'}}>από {Math.round(limitPct)}%</span></span>
              </div>
              <div style={{position:'relative',height:38,borderRadius:12,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',overflow:'hidden'}}>
                <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${usedW}%`,borderRadius:'12px 0 0 12px',transition:'width 0.4s ease',
                  background:over?'linear-gradient(90deg, color-mix(in srgb, var(--negative) 80%, transparent), var(--negative))':'linear-gradient(90deg, color-mix(in srgb, var(--accent) 78%, transparent), var(--accent))'}}/>
                <div style={{position:'absolute',left:`${limitX}%`,top:0,bottom:0,width:0,borderLeft:'2px dashed var(--text-secondary)'}}/>
                <span style={{position:'absolute',left:`calc(${limitX}% + 6px)`,top:'50%',transform:'translateY(-50%)',fontSize:10.5,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:600,whiteSpace:'nowrap' as const}}>Όριο {Math.round(limitPct)}%</span>
              </div>
            </div>
          )
        })()}
        {!aff.affordable
          ? <div style={{padding:'11px 14px',background:'var(--negative-dim)',border:'1px solid var(--negative-border)',borderRadius:10}}><p style={{fontSize:12.5,color:'var(--negative)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>Η δόση υπερβαίνει το όριο κατά {fmtEur(aff.gapMonthly)} τον μήνα. Μείωσε το ποσό έως {fmtEur(aff.maxLoan)} ή αύξησε τη διάρκεια.</p></div>
          : <div style={{padding:'11px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--border-default)',borderRadius:10}}><p style={{fontSize:12.5,color:'var(--text-primary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>Η δόση καλύπτεται άνετα. Απομένει περιθώριο έως {fmtEur(aff.maxMonthly-aff.requestedMonthly)} τον μήνα, που αντιστοιχεί σε επιπλέον δάνειο έως {fmtEur(aff.maxLoan-LA)}.</p></div>
        }
      </Section>
        )
      })()}

      {(()=>{
        // Ενοικίαση ή αγορά — απλό, έντιμο TCO σε βάθος ετών.
        const rent = parseFloat(monthlyRent)||0
        const horizon = Math.min(Math.max(Y,5),20)
        // totalCosts.total = φόροι + συμβολαιογραφικά + μεσιτικά (έξοδα συναλλαγής,
        // ΧΩΡΙΣ την προκαταβολή). Η προκαταβολή περνά χωριστά ως downPayment.
        const rvb = rentVsBuy({ price:PV, downPayment:PV-LA, ratePct:effRate, years:Y, monthlyRent:rent, purchaseCosts:totalCosts.total, horizonYears:horizon })
        const buys = rvb.advantageAtHorizon>0
        return (
      <Section title="Ενοικίαση ή αγορά" sub={`Σύγκριση συνολικού κόστους σε ${horizon} έτη`}>
        <div style={{marginBottom:12,maxWidth:280}}><NumberInput label="Μηνιαίο ενοίκιο αντίστοιχου ακινήτου (€)" value={monthlyRent} onChange={setMonthlyRent} suffix="€"/></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8,marginBottom:14}}>
          <KPI label="Καθαρό κόστος αγοράς" value={fmtEur(rvb.buyNetAtHorizon)} sub={`σε ${horizon} έτη, μετά την περιουσία`}/>
          <KPI label="Κόστος ενοικίασης" value={fmtEur(rvb.rentAtHorizon)} sub={`σε ${horizon} έτη`}/>
          <KPI label={buys?'Πλεονέκτημα αγοράς':'Πλεονέκτημα ενοικίασης'} value={fmtEur(Math.abs(rvb.advantageAtHorizon))} color={buys?'var(--accent)':'var(--text-primary)'} sub={rvb.breakEvenYear?`ισοσκελισμός στο έτος ${rvb.breakEvenYear}`:'χωρίς ισοσκελισμό στον ορίζοντα'}/>
        </div>
        <RentBuyChart buy={rvb.buyNetCostByYear} rent={rvb.rentCostByYear} horizon={horizon} breakEvenYear={rvb.breakEvenYear} fmt={fmtEur}/>
        <div style={{display:'flex',gap:16,marginTop:8}}>
          <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}><span style={{width:14,height:2.4,background:'var(--accent)',display:'inline-block'}}/>Αγορά (καθαρό)</span>
          <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}><span style={{width:14,height:2,borderTop:'2px dashed var(--text-tertiary)',display:'inline-block'}}/>Ενοικίαση</span>
        </div>
        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:10,lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>Το «καθαρό κόστος αγοράς» αφαιρεί την περιουσία που χτίζεις (αξία μείον υπόλοιπο δανείου) και υποθέτει ήπια ανατίμηση και αύξηση ενοικίου ~2% τον χρόνο. Ενδεικτικό.</p>
      </Section>
        )
      })()}
      </>)}

      {lens==='more' && (<>
      <Section title="Φορολογική ανάλυση" sub="ΦΜΑ, απαλλαγές, ενοίκια, ΑΑΔΕ 2026" defaultOpen>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
            <p title="ΦΜΑ: Φόρος Μεταβίβασης Ακινήτου · ΦΠΑ: Φόρος Προστιθέμενης Αξίας" style={{...labelStyle,marginBottom:4}}>{isNewBuilding?'ΦΠΑ 24%':isCommercial?'ΦΜΑ 3% + Χαρτόσημο':'ΦΜΑ 3%'}</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:12,lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{isNewBuilding?'Φόρος Προστιθέμενης Αξίας':isCommercial?'Φόρος Μεταβίβασης Ακινήτου και τέλη χαρτοσήμου μίσθωσης':'Φόρος Μεταβίβασης Ακινήτου'}</p>
            {!isNewBuilding&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:10,marginBottom:12}}>
                <CustomSelect label="Οικογενειακή κατάσταση" value={marital} onChange={v=>setMarital(v as any)} options={MARITAL_OPTIONS}/>
                <CustomSelect label="Εξαρτώμενα τέκνα" value={children} onChange={setChildren} options={CHILDREN_OPTIONS}/>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:8,marginBottom:10}}>
              {isNewBuilding?(
                <>
                  <KPI label="ΦΠΑ 24%" value={fmtEur(vatOwed)} color="var(--text-primary)" sub="Αντί ΦΜΑ"/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color="var(--text-primary)"/>
                  <KPI label="Τιμή πριν ΦΠΑ" value={fmtEur(PV-vatOwed)} color="var(--text-secondary)"/>
                </>
              ):(
                <>
                  <KPI label={isCommercial?'ΦΜΑ 3%':'Όριο απαλλαγής ΦΜΑ'} value={isCommercial?fmtEur(fmaOwed):fmtEur(fmaEx)} color={isCommercial?'var(--text-primary)':'var(--accent)'}/>
                  <KPI label="ΦΜΑ που αναλογεί" value={fmaOwed===0?'Απαλλαγή':fmtEur(fmaOwed)} color={fmaOwed===0?'var(--accent)':'var(--text-primary)'}/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color="var(--text-primary)"/>
                </>
              )}
            </div>
            {loanType==='first_home'&&PV<=fmaEx&&!isNewBuilding&&!isCommercial&&<div style={{padding:'10px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--accent)',borderRadius:8}}><p title="ΦΜΑ: Φόρος Μεταβίβασης Ακινήτου" style={{fontSize:13,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Δικαιούστε πλήρη απαλλαγή ΦΜΑ, εξοικονόμηση {fmtEur(PV*0.03)}</p></div>}
          </div>
          {loanType==='investment'&&(
            <div style={{padding:'12px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
              <p style={{...labelStyle,marginBottom:12}}>Κλίμακα ενοικίων 2026</p>
              {TAX_DATA.rental_tax.map((b,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8,marginBottom:5}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>{b.label}</span>
                  <span style={{fontSize:14,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:700}}>{(b.rate*100).toFixed(0)}%</span>
                </div>
              ))}
              <div style={{marginTop:10,padding:'9px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8}}>
                <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Αυτόματη έκπτωση 5% · Εκτιμώμενος φόρος: {fmtEur(renTax)} τον χρόνο</p>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Αντοχή σε άνοδο επιτοκίου" sub="Αντοχή δόσης σε σενάρια ανόδου Euribor">
        <div style={{marginBottom:16}}>
          <StressBars stress={stress} limit={INC>0?INC*BORROWER_PROFILES[borrower].income_ratio:0} INC={INC} fmt={fmtEur} fmtPct={fmtPct} fmtPct1={fmtPct1}/>
        </div>
        <div className="table-wrap">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{borderBottom:'1px solid var(--border-subtle)'}}>{['Σενάριο','Επιτόκιο','Δόση τον μήνα','Αύξηση','Δόση προς εισόδημα'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:500,fontFamily:"'Inter',sans-serif"}}>{h}</th>)}</tr></thead>
          <tbody>
            {stress.map((s,i)=>{
              const diff=s.monthly-stress[0].monthly,dti=(s.monthly/INC)*100
              return <tr key={i} style={{borderBottom:'1px solid var(--border-subtle)',background:i===0?'var(--bg-elevated)':'transparent'}}>
                <td style={{padding:'8px 10px',color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:i===0?600:400}}>{s.label}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-secondary)'}}>{fmtPct(s.rate)}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:'var(--text-primary)',fontWeight:600}}>{fmtEur(s.monthly)}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:i===0?'var(--text-tertiary)':'var(--text-secondary)'}}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                <td style={{padding:'8px 10px',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:dti>40?"var(--negative)":"var(--text-primary)",fontWeight:600}}>{fmtPct1(dti)}</td>
              </tr>
            })}
          </tbody>
        </table>
        </div>
        {rateType==='fixed'&&<div style={{marginTop:10,padding:'9px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:8}}><p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>Σταθερό {fixedPeriod} χρόνια, προστατευμένοι από ανατιμήσεις Euribor</p></div>}
      </Section>

      <Section title="Ανάλυση αναχρηματοδότησης" sub="Σημείο απόσβεσης, πότε αξίζει η μεταφορά">
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:10,marginBottom:14}}>
          <NumberInput label="Υπόλοιπο (€)" value={remBal} onChange={setRemBal} suffix="€"/>
          <NumberInput label="Χρόνια που μένουν" value={remYears} onChange={setRemYears} suffix="έτη"/>
          <NumberInput label="Τρέχον επιτόκιο (%)" value={curRate} onChange={setCurRate} suffix="%" step={0.05}/>
          <NumberInput label="Νέο επιτόκιο (%)" value={newRate} onChange={setNewRate} suffix="%" step={0.05}/>
          <NumberInput label="Κόστος μεταφοράς (€)" value={xferCost} onChange={setXferCost} suffix="€"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',gap:8}}>
          <KPI label="Τρέχουσα δόση" value={fmtEur(currM)} color="var(--text-primary)"/>
          <KPI label="Νέα δόση" value={fmtEur(newM)} color="var(--accent)" sub={`${fmtEur(mSav)} τον μήνα`}/>
          <KPI label="Καθαρή εξοικονόμηση" value={fmtEur(Math.max(0,refSav))} color={refSav>0?'var(--accent)':'var(--text-secondary)'} sub={refSav>0?'Αξίζει':'Δεν συμφέρει'}/>
          <KPI label="Σημείο απόσβεσης" value={brkEven?`${brkEven} μήνες`:'—'} color={brkEven&&brkEven<24?'var(--accent)':'var(--text-primary)'} sub="Απόσβεση εξόδων μεταφοράς"/>
        </div>
      </Section>
      </>)}

      {lens==='table' && (<>
      <Section title="Πίνακας αποπληρωμής" sub={`${Y*12} δόσεις αναλυτικά`} defaultOpen>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          <button onClick={exportAmortPdf} style={{display:'inline-flex',alignItems:'center',gap:7,height:36,padding:'0 14px',borderRadius:20,border:'1px solid var(--border-accent)',background:'var(--accent-dim)',color:'var(--accent)',fontSize:12.5,fontFamily:"'Inter',sans-serif",fontWeight:500,cursor:'pointer'}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Εκτύπωση / PDF
          </button>
          <button onClick={exportAmortCsv} style={{display:'inline-flex',alignItems:'center',gap:7,height:36,padding:'0 14px',borderRadius:20,border:'1px solid var(--border-default)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontSize:12.5,fontFamily:"'Inter',sans-serif",fontWeight:500,cursor:'pointer'}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Λήψη για Excel
          </button>
        </div>
        {/* Κύλιση με κολλημένη κεφαλίδα· ομοιόμορφοι λευκοί αριθμοί, γαλάζιο μόνο στη γραμμή που εξετάζεις */}
        <div style={{maxHeight:268,overflow:'auto',border:'1px solid var(--border-subtle)',borderRadius:12}}>
          <table style={{width:'100%',minWidth:480,borderCollapse:'separate',borderSpacing:0,fontSize:12}}>
            <thead>
              <tr>
                {['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Συνολικοί τόκοι'].map(h=>(
                  <th key={h} style={{position:'sticky',top:0,zIndex:1,background:'var(--bg-elevated)',padding:'10px 14px',textAlign:'right',fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',fontWeight:600,fontFamily:"'Inter',sans-serif",borderBottom:'1px solid var(--border-default)',whiteSpace:'nowrap' as const}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {amort.map((row,i)=>{
                const on=hoverRow===i
                const yearStart=i>0&&row.month%12===1
                const cell:React.CSSProperties={padding:'9px 14px',textAlign:'right',fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:on?'var(--accent)':'var(--text-primary)',borderBottom:'1px solid var(--border-subtle)',borderTop:yearStart?'1px solid var(--border-default)':undefined,transition:'color 0.12s'}
                return (
                  <tr key={row.month}
                    onMouseEnter={()=>setHoverRow(i)} onMouseLeave={()=>setHoverRow(null)}
                    onTouchStart={()=>setHoverRow(i)} onTouchEnd={()=>setHoverRow(null)}
                    style={{background:on?'var(--bg-hover)':'transparent',transition:'background 0.12s'}}>
                    <td style={{...cell,fontWeight:on?600:400}}>{row.month}</td>
                    <td style={{...cell,fontWeight:on?700:600}}>{fmtEur(row.payment)}</td>
                    <td style={cell}>{fmtEur(row.principal)}</td>
                    <td style={cell}>{fmtEur(row.interest)}</td>
                    <td style={cell}>{fmtEur(row.balance)}</td>
                    <td style={cell}>{fmtEur(row.totalInterestPaid)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:8,lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>Και οι {amort.length} δόσεις αναλυτικά. Κύλισε στον πίνακα· πέρασε τον δείκτη ή το δάχτυλο σε μια γραμμή για να δεις καθαρά τη δόση, το κεφάλαιο, τον τόκο, το υπόλοιπο και τους σωρευτικούς τόκους της.</p>
      </Section>

      <Section title="Απαραίτητα έγγραφα" sub={`${LOAN_TYPES[loanType].label} · ${propTypeLabel}`}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',gap:14,alignItems:'start'}}>
          <DocChecklist
            compact
            docs={isNewBuilding
              ? [...LOAN_TYPES[loanType].docs, { name:'Άδεια οικοδομής και βεβαίωση ΦΠΑ', where:'Πολεοδομία' }]
              : LOAN_TYPES[loanType].docs}
            storageKey={`${propertyId}:calc:${loanType}${isNewBuilding?':new':''}`}
            title="Γενικά δικαιολογητικά"/>
          {(()=>{
            const borrowerDocs:string[] = borrower==='professional'?['Φορολογικές δηλώσεις δύο ετών','Βεβαίωση δραστηριότητας ΔΟΥ']
              : borrower==='company'?['Καταστατικό','Ισολογισμοί τριών ετών','Απόφαση διοικητικού συμβουλίου']
              : borrower==='military'?['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση']
              : borrower==='abroad'?['Αποδεικτικό κατοικίας εξωτερικού','Εισοδήματα ξένης χώρας','Επίσημες μεταφράσεις']
              : ['Μισθοδοτικές τριών μηνών','Εκκαθαριστικό σημείωμα']
            return (
              <div>
                <p style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Ανά τύπο δανειολήπτη</p>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {borrowerDocs.map((d,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 11px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)'}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" style={{flexShrink:0}} aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span style={{fontSize:12.5,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500}}>{d}</span>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:10,padding:'10px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:'3px solid var(--accent)',borderRadius:10}}>
                  <p style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>{BORROWER_PROFILES[borrower].tax_benefits}</p>
                </div>
              </div>
            )
          })()}
        </div>
      </Section>

      {/* Full acquisition cost */}
      <div style={cardStyle}>
        <SectionLabel label="Πλήρης ανάλυση κόστους απόκτησης" right={<span style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif"}}>{propTypeLabel}{SQM>0?` · ${SQM}τ.μ.`:''} · {areaLabel}</span>}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:8,marginBottom:14}}>
          {[
            {label:isNewBuilding?'ΦΠΑ 24%':'Φόρος μεταβίβασης (ΦΜΑ)',value:isNewBuilding?fmtEur(vatOwed):fmaOwed===0?'Απαλλαγή':fmtEur(fmaOwed),sub:isNewBuilding?'Νεόδμητο':fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας',hi:false},
            {label:'Συμβολαιογραφικά',value:fmtEur(totalCosts.notary),sub:'Κλιμακωτή αμοιβή',hi:false},
            {label:'Κτηματολόγιο και εγγραφή',value:fmtEur(totalCosts.landReg),sub:'0,475% επί αξίας',hi:false},
            {label:'Δικηγόρος ελέγχου τίτλων',value:fmtEur(totalCosts.legal),sub:'Έλεγχος + παρουσία',hi:false},
            {label:'Αμοιβή μεσίτη',value:hasAgent?fmtEur(AGNT):'—',sub:hasAgent?`${agentPct}%`:'Ανενεργό',hi:false},
            {label:'Λοιπά',value:fmtEur(totalCosts.other),sub:'Φόρος ενεγγύησης',hi:false},
            {label:'Σύνολο εξόδων αγοράς',value:fmtEur(totalCosts.total),sub:'Εκτός δόσεων',hi:true,primary:false},
            {label:'Απαιτούμενα ίδια κεφάλαια',value:fmtEur(totalCosts.totalCash),sub:'Προκαταβολή + έξοδα',hi:true,primary:true},
          ].map((item:any,i:number)=>{
            const on=hoverCost===i
            return (
            <div key={item.label}
              onMouseEnter={()=>setHoverCost(i)} onMouseLeave={()=>setHoverCost(null)}
              onTouchStart={()=>setHoverCost(i)} onTouchEnd={()=>setHoverCost(null)}
              style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,background:'var(--bg-elevated)',border:`1px solid ${on?'var(--border-default)':'var(--border-subtle)'}`,borderLeft:item.primary?'2px solid var(--accent)':undefined,transition:'border-color 0.15s, box-shadow 0.15s, transform 0.15s',transform:on?'translateY(-1px)':'none',
              boxShadow:on?'0 4px 14px -6px color-mix(in srgb, var(--text-primary) 26%, transparent)':'none'}}>
              <div style={{minWidth:0}}>
                <p style={{fontSize:12.5,color:'var(--text-primary)',fontWeight:item.hi?600:500,fontFamily:"'Inter',sans-serif"}}>{item.label}</p>
                <p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2,fontFamily:"'Inter',sans-serif"}}>{item.sub}</p>
              </div>
              <span style={{fontSize:13,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',color:on?'var(--accent)':'var(--text-primary)',fontWeight:item.hi?700:600,marginLeft:10,whiteSpace:'nowrap' as const,transition:'color 0.15s'}}>{item.value}</span>
            </div>
            )
          })}
        </div>
        <div style={{padding:'10px 14px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:9,marginBottom:10}}>
          <p style={{...labelStyle,marginBottom:8}}>Ανάλυση συμβολαιογραφικών</p>
          {notaryCosts.breakdown.map((line,i)=>(
            <p key={i} style={{fontSize:12,color:'var(--text-secondary)',marginBottom:3,lineHeight:1.5,fontFamily:"'Inter',sans-serif"}}>· {line}</p>
          ))}
        </div>
        <div style={{padding:'10px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:9,marginBottom:10}}>
          <p style={{fontSize:12,color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif"}}>Ασφάλεια κατοικίας 100-300€ τον χρόνο (υποχρεωτική) · Ασφάλεια ζωής ~{fmtEur(LA*0.001)} τον χρόνο</p>
        </div>
        <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:"'Inter',sans-serif"}}>
          Εκτιμήσεις βάσει δεδομένων χρήστη. →{' '}
          <a href="https://www.aade.gr" target="_blank" rel="noreferrer" title="ΑΑΔΕ: Ανεξάρτητη Αρχή Δημοσίων Εσόδων" style={{color:'var(--accent)',textDecoration:'none',fontWeight:500}}>ΑΑΔΕ</a>
        </p>
      </div>
      </>)}

      {/* Non-blocking success toast */}
      {toast&&(
        <div style={{position:'fixed',bottom:20,right:20,zIndex:1000,display:'flex',alignItems:'center',gap:9,padding:'12px 18px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,boxShadow:'var(--shadow-lg)',fontSize:13,color:'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontWeight:500,maxWidth:'calc(100vw - 40px)'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" style={{flexShrink:0}}><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
    </div>
  )
}