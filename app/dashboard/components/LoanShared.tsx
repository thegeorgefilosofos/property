'use client'
import { T, TT } from '@/components/Theme'
import { useState } from 'react'

// ── Κοινά primitives του Δανείου (μία πηγή αλήθειας για TabLoan + TabLoanCalculator) ──
// Πριν υπήρχαν διπλά αντίγραφα που είχαν αποκλίνει (διαφορετικές ακτίνες/μεγέθη).
// Εδώ ενοποιούνται ώστε τα δύο αρχεία να μοιάζουν απόλυτα.

// Η ετικέτα πεδίου ΔΕΝ ξαναορίζεται: είναι το TT.label, λέξη προς λέξη. Ήταν
// γραμμένη οκτώ φορές σε οκτώ αρχεία, με δύο τυπογραφίες (10/700 και 11/600)
// για το ίδιο ακριβώς πράγμα — δηλαδή οι ίδιες ετικέτες άλλαζαν μέγεθος από
// οθόνη σε οθόνη. Επανεξάγεται από εδώ ώστε να μη σπάσει καμία εισαγωγή.
export const labelStyle: React.CSSProperties = TT.label
// Οι ακτίνες/κενά έρχονται πλέον από τα tokens και όχι από literals: όταν αλλάξει η
// ακτίνα κάρτας στο components/tokens.ts, το Δάνειο δεν μένει πίσω με το δικό του 14.
export const cardStyle: React.CSSProperties = {
  background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,padding:T.sp.lg,
}

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΧΡΩΜΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΓΙ' ΑΥΤΟ ΕΦΥΓΕ ΑΠΟ ΠΑΝΤΟΥ.
// ─────────────────────────────────────────────────────────────────────────
// Το πλακίδιο δεχόταν `color` και το ερμήνευε ΣΗΜΑΣΙΟΛΟΓΙΚΑ: `var(--negative)`
// έβαφε την τιμή κόκκινη, `var(--accent)` την κρατούσε μόνιμα γαλάζια ως
// «θετικό». Επειδή είναι το κοινό primitive και των δύο οθονών του Δανείου, η
// παραβίαση κληρονομιόταν σε κάθε δείκτη: LTV πάνω από 90%, βαθμολογία κάτω από
// 60, DTI πάνω από 40%, δόση πάνω από το όριο — δεκατέσσερα κόκκινα νούμερα σε
// μία οθόνη που ο χρήστης βλέπει όταν σκέφτεται να πάρει δάνειο.
//
// Ένα δάνειο με LTV 92% δεν είναι «λάθος»: είναι ένα δάνειο με LTV 92%, και το
// αν τον συμφέρει το κρίνει ο ίδιος. Το κόκκινο δεν πρόσθετε πληροφορία που δεν
// έλεγε ήδη ο αριθμός — πρόσθετε ετυμηγορία.
//
// ΤΙ ΜΕΝΕΙ: η έμφαση, χωρίς σημασία. Το `emphasis` κρατά την τιμή σε πλήρη
// ένταση κειμένου (`--text-primary`) αντί για τη δευτερεύουσα, και ο τόνος
// μπαίνει ΜΟΝΟ στην αλληλεπίδραση — ίδιος κανόνας με το KPIGrid του Theme.
// ═══════════════════════════════════════════════════════════════════════════
export function KPI({label,value,emphasis,sub,title}:{label:string;value:string;emphasis?:boolean;sub?:string;title?:string}) {
  const [h,setH]=useState(false)
  return (
    <div onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onTouchStart={()=>setH(true)} onTouchEnd={()=>setH(false)}
      style={{background:'var(--bg-elevated)',border:`1px solid ${h?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:T.radius.card,padding:'12px 16px',transition:'border-color 0.15s, box-shadow 0.15s',boxShadow:h?'0 2px 4px color-mix(in srgb, var(--text-primary) 9%, transparent)':'none'}}>
      <p title={title} style={{...labelStyle,marginBottom:6,cursor:title?'help':undefined}}>{label}</p>
      <p style={{fontSize:16,fontFamily: T.font.sans,fontVariantNumeric:'tabular-nums',color:h?'var(--accent)':'var(--text-primary)',fontWeight:emphasis?700:600,transition:'color 0.15s'}}>{value}</p>
      {sub&&<p style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontFamily: T.font.sans}}>{sub}</p>}
    </div>
  )
}

// Cockpit: εναλλαγή φακών επί τόπου (segmented control, ένα πάνελ τη φορά).
export function LensBar({value,onChange,items}:{value:string;onChange:(v:string)=>void;items:{id:string;label:string}[]}) {
  return (
    <div style={{display:'flex',gap:3,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:14,padding:4,overflowX:'auto'}}>
      {items.map(it=>{const on=value===it.id;return(
        <button key={it.id} onClick={()=>onChange(it.id)} aria-pressed={on} style={{flex:'1 0 auto',minWidth:92,borderRadius:10,padding:'9px 14px',cursor:'pointer',fontFamily: T.font.sans,fontSize:13,fontWeight:on?600:500,whiteSpace:'nowrap' as const,border:'none',
          color:on?'var(--accent)':'var(--text-tertiary)',background:on?'var(--bg-elevated)':'transparent',
          boxShadow:on?'0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent), 0 2px 8px -4px color-mix(in srgb, var(--text-primary) 18%, transparent)':'none',
          transition:'color 0.2s, background 0.2s, box-shadow 0.2s'}}>{it.label}</button>
      )})}
    </div>
  )
}
