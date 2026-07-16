'use client'
import { useState } from 'react'

// ── Κοινά primitives του Δανείου (μία πηγή αλήθειας για TabLoan + TabLoanCalculator) ──
// Πριν υπήρχαν διπλά αντίγραφα που είχαν αποκλίνει (διαφορετικές ακτίνες/μεγέθη).
// Εδώ ενοποιούνται ώστε τα δύο αρχεία να μοιάζουν απόλυτα.

export const labelStyle: React.CSSProperties = {
  fontSize:11,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.06em',fontWeight:600,fontFamily:"'Inter',sans-serif",
}
export const cardStyle: React.CSSProperties = {
  background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:16,padding:16,
}

// Ομοιόμορφο πλακίδιο μετρικής: λευκή τιμή, γαλάζια στο πέρασμα του κέρσορα/δαχτύλου·
// αρνητικές τιμές κόκκινες· αν δοθεί color=var(--accent) η τιμή μένει μόνιμα γαλάζια
// (θετικό/eligibility state). Ήπιο 3D στο hover.
export function KPI({label,value,color,sub,title}:{label:string;value:string;color?:string;sub?:string;title?:string}) {
  const [h,setH]=useState(false)
  const isNeg = color==='var(--negative)'
  const isPos = color==='var(--accent)'
  return (
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onTouchStart={()=>setH(true)} onTouchEnd={()=>setH(false)}
      style={{background:'var(--bg-elevated)',border:`1px solid ${h?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:12,padding:'12px 14px',transition:'border-color 0.15s, box-shadow 0.15s',boxShadow:h?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent)':'none'}}>
      <p title={title} style={{...labelStyle,marginBottom:6,cursor:title?'help':undefined}}>{label}</p>
      <p style={{fontSize:16,fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums',color:isNeg?'var(--negative)':(isPos||h)?'var(--accent)':'var(--text-primary)',fontWeight:700,transition:'color 0.15s'}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontFamily:"'Inter',sans-serif"}}>{sub}</p>}
    </div>
  )
}

// Cockpit: εναλλαγή φακών επί τόπου (segmented control, ένα πάνελ τη φορά).
export function LensBar({value,onChange,items}:{value:string;onChange:(v:string)=>void;items:{id:string;label:string}[]}) {
  return (
    <div style={{display:'flex',gap:3,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:16,padding:4,overflowX:'auto'}}>
      {items.map(it=>{const on=value===it.id;return(
        <button key={it.id} onClick={()=>onChange(it.id)} aria-pressed={on} style={{flex:'1 0 auto',minWidth:92,borderRadius:12,padding:'9px 14px',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:on?600:500,whiteSpace:'nowrap' as const,border:'none',
          color:on?'var(--accent)':'var(--text-tertiary)',background:on?'var(--bg-elevated)':'transparent',
          boxShadow:on?'0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent), 0 2px 8px -4px color-mix(in srgb, var(--text-primary) 18%, transparent)':'none',
          transition:'color 0.2s, background 0.2s, box-shadow 0.2s'}}>{it.label}</button>
      )})}
    </div>
  )
}
