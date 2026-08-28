'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΜΙΚΡΑ ΚΟΜΜΑΤΙΑ ΤΗΣ ΑΠΟΓΡΑΦΗΣ, ΣΕ ΕΝΑ ΣΗΜΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Σήμα κατάστασης, σήμα ενεργειακής κλάσης, μπάρα απόσβεσης, μενού ενεργειών,
// πεδίο δωματίου, κωδικός QR. Κανένα δεν ξέρει από βάση και κανένα δεν κρατά
// δεδομένα της οθόνης: παίρνουν ό,τι δείχνουν και το δείχνουν.
//
// ΓΙΑΤΙ ΜΑΖΙ ΚΑΙ ΟΧΙ ΕΝΑ ΑΡΧΕΙΟ ΤΟ ΚΑΘΕΝΑ. Επειδή χρησιμοποιούνται ΟΛΑ μαζί,
// από τις ίδιες οθόνες και κανένα δεν στέκεται μόνο του: έντεκα αρχεία των
// είκοσι γραμμών θα ήταν έντεκα εισαγωγές σε κάθε οθόνη για να δειχτεί μία
// κάρτα.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { qrDataUrl } from '@/lib/qr'
import { T, TT, Modal, SecHdr, Btn, pressable, fp } from '@/components/Theme'
// Το πλαίσιο επιλογής ζει στο Theme, ένα για όλη την εφαρμογή. Ξαναβγαίνει από
// εδώ ώστε τα σημεία που το εισάγουν από τα Bits να μη χρειαστεί να αλλάξουν.
export { SelectBox } from '@/components/Theme'
import { CustomSelect } from '../UIComponents'
import { replacementSuggestion } from '@/lib/inventory/depreciation'
import { openReport, rEsc } from '../reportPdf'
import { INK, RULE } from '@/lib/print/ink'
import type { FieldDecision } from '@/lib/property/fields'
import { CONDITIONS, CONDITION_COLOR, ENERGY_TONE, ROOM_PRESETS, type InventoryItem } from './model'

// ── Η ΚΑΡΤΑ ΤΗΣ ΑΠΟΓΡΑΦΗΣ ΕΙΝΑΙ Η ΚΑΡΤΑ ΤΗΣ ΕΦΑΡΜΟΓΗΣ ─────────────────────
// ΜΙΑ ΚΑΡΤΕΛΑ ΕΙΧΕ ΔΙΚΟ ΤΗΣ ΟΡΙΣΜΟ ΚΑΡΤΑΣ. Η συνταγή εδώ ήταν bg-surface με
// border-subtle και ΚΑΘΟΛΟΥ βάθος, ενώ η `.card` του globals.css είναι
// surface-raised με border-raised και `highlight-inset, elev-1`. Δηλαδή άλλο
// χρώμα και άλλο βάθος από κάθε άλλη οθόνη, με το ίδιο όνομα.
//
// ΜΕΤΡΗΜΕΝΟ ΣΤΟΝ ΠΑΓΚΟ, 22 ΟΘΟΝΕΣ: 25 κάρτες ανώτατου επιπέδου έβγαιναν χωρίς
// βάθος, δίπλα σε ανυψωμένες κάρτες της ίδιας οθόνης· οι 16 ήταν αυτή εδώ.
//
// Οι τιμές δεν ξαναγράφονται με το χέρι: είναι ΟΙ ΙΔΙΕΣ μεταβλητές που διαβάζει
// η `.card`, οπότε κάθε μελλοντική αλλαγή του θέματος τις πιάνει και τις δύο.
export const cardStyle: React.CSSProperties = {
  background:'var(--surface-raised)',
  border:'1px solid var(--border-raised)',
  borderRadius:T.radius.card,
  padding:16,
  boxShadow:'var(--highlight-inset), var(--elev-1)',
}
export const labelStyle: React.CSSProperties = { ...TT.label, display:'block', marginBottom:6 }

export const SectionLabel = ({label,right}:{label:string;right?:React.ReactNode}) => (
  <SecHdr label={label} right={right}/>
)

// Μικρό labeled dropdown (portal) για μαζικές ενέργειες — δεν το κόβει κανένα overflow.
/**
 * Η ΗΣΥΧΗ ΣΥΝΤΟΜΕΥΣΗ: ΕΝΑ ΣΧΗΜΑ ΓΙΑ ΟΛΕΣ.
 *
 * Στην άδεια οθόνη στέκονται δίπλα δίπλα τρεις εναλλακτικές του ίδιου πράγματος
 * — μαζική εισαγωγή, έτοιμο πρότυπο, αντιγραφή από άλλο ακίνητο. Ήταν γραμμένες
 * με τρία διαφορετικά στυλ στο χέρι και φαινόταν: διαφορετικό ύψος,
 * διαφορετικό φόντο, διαφορετικό κενό. Το μάτι έψαχνε ποια είναι η σημαντική,
 * ενώ καμία δεν είναι — είναι τρεις δρόμοι για την ίδια δουλειά.
 */
export const quietAction: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: T.h.sm, padding: '0 12px', borderRadius: T.radius.pill,
  border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
  fontFamily: T.font.sans, cursor: 'pointer',
}

export function BulkPicker({label,icon,options,onPick,accent}:{label:string;icon:React.ReactNode;options:string[];onPick:(v:string)=>void;accent?:boolean}) {
  const [open,setOpen] = useState(false)
  const [rect,setRect] = useState<{top:number;left:number}|null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const place = useCallback(()=>{const b=btnRef.current?.getBoundingClientRect();if(b)setRect({top:b.bottom+4,left:b.left})},[])
  useEffect(()=>{
    if(!open) return
    place()
    const close=(e:Event)=>{const t=e.target as Node;if(btnRef.current?.contains(t)||menuRef.current?.contains(t))return;setOpen(false)}
    const s=()=>place()
    document.addEventListener('mousedown',close);window.addEventListener('scroll',s,true);window.addEventListener('resize',s)
    return()=>{document.removeEventListener('mousedown',close);window.removeEventListener('scroll',s,true);window.removeEventListener('resize',s)}
  },[open,place])
  return (
    <div style={{display:'inline-block'}}>
      <button ref={btnRef} onClick={()=>setOpen(v=>!v)}
        style={accent
          ? {...quietAction, border:'1px solid var(--accent-border)', background:'var(--accent-soft)', color:'var(--accent)'}
          : quietAction}>
        <span style={{display:'flex'}}>{icon}</span>{label}
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l3 3 3-3"/></svg>
      </button>
      {open&&rect&&typeof document!=='undefined'&&createPortal(
        <div ref={menuRef} style={{position:'fixed',top:rect.top,left:rect.left,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:5,zIndex:9000,minWidth:180,maxHeight:300,overflowY:'auto',boxShadow:'var(--shadow-xl)'}}>
          {options.length===0
            ?<p style={{fontSize:12,color:'var(--text-tertiary)',fontFamily:T.font.sans,padding:'8px 12px'}}>Καμία επιλογή</p>
            :options.map(o=>(
              <div key={o} {...pressable(()=>{onPick(o);setOpen(false)})} style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:13,fontFamily:T.font.sans,color:'var(--text-primary)'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>{o}</div>
            ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export const Badge = ({label,color}:{label:string;color:string}) => (
  <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:T.radius.pill,fontSize: 11,fontWeight:500,fontFamily:T.font.sans,color,background:`color-mix(in srgb, ${color} 10%, transparent)`,border:`1px solid color-mix(in srgb, ${color} 26%, transparent)`,whiteSpace:'nowrap'}}>{label}</span>
)

export const EnergyBadge = ({cls}:{cls:string}) => { if(!cls) return null; const tone=ENERGY_TONE[cls]
  const fg = tone?`var(--${tone})`:'var(--text-secondary)'
  const bg = tone?`var(--${tone}-soft)`:'var(--bg-elevated)'
  const bd = tone?`var(--${tone}-border)`:'var(--border-subtle)'
  return (
  <span title={`Ενεργειακή κλάση ${cls}`} style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:6,fontSize: 11,fontWeight:700,color:fg,background:bg,border:`1px solid ${bd}`,letterSpacing:'0.5px',fontFamily:T.font.sans}}>{cls}</span>
) }

// ═══════════════════════════════════════════════════════════════════════════
// Η ΜΠΑΡΑ ΔΕΝ ΜΙΛΑ ΓΙΑ ΑΝΤΙΚΕΙΜΕΝΟ ΠΟΥ ΔΕΝ ΞΕΡΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΒΛΕΠΕ Ο ΧΡΗΣΤΗΣ. Δεκατρία αντικείμενα χωρίς τιμή αγοράς έδειχναν, ΟΛΑ,
// «0,00 € ΤΡΕΧΟΥΣΑ ΑΞΙΑ», «Εκτιμώμενη υπολειπόμενη αξία 100%», γεμάτη μπάρα και
// «περίπου 9 χρόνια». Τέσσερα νούμερα, κανένα αληθινό:
//
//   · το «0,00 €» δεν είναι αξία, είναι ΑΠΟΥΣΙΑ αξίας
//   · το «100%» είναι εκατό τοις εκατό του τίποτα
//   · η γεμάτη μπάρα σε κάθε κάρτα δεν διακρίνει τίποτα από τίποτα
//   · τα «περίπου 9 χρόνια» είναι η ωφέλιμη ζωή ΤΗΣ ΚΑΤΗΓΟΡΙΑΣ, όχι αυτού του
//     αντικειμένου: χωρίς ημερομηνία αγοράς δεν ξέρουμε πόσο έχει ήδη ζήσει
//
// Η μηχανή το ήξερε και το έλεγε. Το `depreciate()` επιστρέφει `hasData: false`
// όταν λείπει η ημερομηνία (lib/inventory/depreciation.ts:85) και το πεδίο δεν
// το διάβαζε ΚΑΜΙΑ οθόνη: ζούσε μόνο μέσα στην πρόταση αντικατάστασης.
//
// Τώρα η κάρτα λέει τι της λείπει. Ο,τι λείπει είναι και η επόμενη κίνηση.
// ═══════════════════════════════════════════════════════════════════════════
// Το `compact` είναι για ΚΑΤΑΛΟΓΟ: εκεί η ίδια ετικέτα θα γραφόταν όσες φορές
// υπάρχουν αντικείμενα. Μετρήθηκε στην απογραφή των δεκατριών: «Εκτιμώμενη
// υπολειπόμενη αξία» ×9 σε μία οθόνη. Ολόκληρη μένει όπου το αντικείμενο είναι
// ΕΝΑ, δηλαδή στο παράθυρο επισκευής.
export const DepBar = ({pct,left,hasData=true,hasValue=true,compact}:{pct:number;left:number;hasData?:boolean;hasValue?:boolean;compact?:boolean}) => {
  if (!hasValue || !hasData) {
    return (
      <div style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45}}>
        {!hasValue ? 'Χωρίς τιμή αγοράς' : 'Χωρίς ημερομηνία αγοράς'}
      </div>
    )
  }
  const remaining = Math.max(0, 100 - pct)
  // Η υπολειπόμενη αξία δεν είναι βαθμός. Ένα ψυγείο στο 45% δεν είναι
  // «κίτρινο» και στο 70% δεν είναι «πράσινο» — απλώς έχει την ηλικία του.
  // Το μήκος της μπάρας λέει ήδη πόσο μένει· το χρώμα μπαίνει μόνο όταν η
  // αξία έχει σχεδόν εξαντληθεί, δηλαδή όταν πλησιάζει αντικατάσταση.
  const c = remaining>20?'var(--series-in)':'var(--warning)'
  // ΤΟ `title` ΕΦΥΓΕ: ΔΕΝ ΑΝΟΙΓΕΙ ΜΕ ΔΑΧΤΥΛΟ. Η νομική επιφύλαξη κρεμόταν εδώ ως
  // αιωρούμενη υπόδειξη, δηλαδή ήταν αόρατη σε κάθε κινητό και σε κάθε ταμπλέτα.
  // Λέγεται τώρα μία φορά, στο κυκλάκι πάνω από το πλέγμα, που ανοίγει και με
  // πάτημα.
  return (
    <div>
      <div style={{height:3,background:'var(--border-subtle)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${remaining}%`,background:c,borderRadius:3,transition:'width 0.4s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize: 11,color:'var(--text-tertiary)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums'}}>{compact?'μένει ':'Εκτιμώμενη υπολειπόμενη αξία '}{fp(remaining)}</span>
        {left>0
          ?<span style={{fontSize: 11,color:'var(--text-tertiary)',fontFamily:T.font.num,fontVariantNumeric:'tabular-nums'}}>περίπου {left} χρόνια</span>
          :<span style={{fontSize: 11,color:'var(--text-secondary)',fontFamily:T.font.sans}}>Τέλος ωφέλιμης ζωής</span>
        }
      </div>
    </div>
  )
}

// Ήπια ένδειξη πρότασης αντικατάστασης — calm, όχι «κόκκινος συναγερμός».
export function ReplacementHint({item,compact}:{item:InventoryItem;compact?:boolean}) {
  const s = replacementSuggestion(item)
  if (s.severity === 'none') return null
  const due = s.severity === 'due'
  const tip = s.reasons.join(' · ')
  // ΤΑ 9 ΚΑΙ ΤΑ 10 ΣΗΜΕΙΑ ΕΓΙΝΑΝ 11, ΤΟ ΔΑΠΕΔΟ ΤΟΥ ΕΡΓΟΥ. Η πρώτη σάρωση που
  // είδε ποτέ αυτή την καρτέλα βρήκε το ίδιο εύρημα και στις δώδεκα συσκευές:
  // η μόνη προειδοποίηση της κάρτας γραφόταν στα εννιά σημεία, δηλαδή ήταν
  // δυσανάγνωστη ακριβώς εκεί που έπρεπε να διαβαστεί. Η σμίκρυνση δεν λύνει
  // πρόβλημα χώρου, το μεταφέρει σε όποιον δεν βλέπει καλά.
  if (due) return (
    <div title={tip} style={{display:'inline-flex',alignItems:'center',gap:6,padding:compact?'2px 8px':'6px 10px',borderRadius:compact?20:8,background:'var(--warning-soft)',border:'1px solid var(--warning-border)',maxWidth:'100%'}}>
      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <span style={{fontSize:11,color:'var(--warning)',fontFamily:T.font.sans,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Προτείνεται αντικατάσταση</span>
    </div>
  )
  // soft: πλησιάζει τέλος ωφέλιμης ζωής
  return (
    <span title={tip} style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,whiteSpace:'nowrap'}}>Πλησιάζει το τέλος ζωής</span>
  )
}

export function InlineConditionEdit({item,onUpdate}:{item:InventoryItem;onUpdate:(id:string,c:string)=>void}) {
  const [open,setOpen] = useState(false)
  const [rect,setRect] = useState<{top:number;left:number;width:number;up?:boolean;maxH?:number}|null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Το μενού ζει σε portal (fixed) ώστε να μην το «κόβει» κανένα overflow:hidden γονικό (κάρτα/φωτο).
  // Τοποθέτηση με επίγνωση viewport: διαλέγει πλευρά με χώρο + maxHeight ώστε να μη κόβεται εκτός οθόνης.
  const place = useCallback(()=>{
    const b=btnRef.current?.getBoundingClientRect()
    if(!b) return
    const M=8, GAP=4, needed=CONDITIONS.length*36+12
    const spaceBelow=window.innerHeight-b.bottom-M, spaceAbove=b.top-M
    const up = spaceBelow<needed && spaceAbove>spaceBelow
    const maxH = Math.max(120, Math.min((up?spaceAbove:spaceBelow)-GAP, needed))
    setRect({top: up?b.top-GAP:b.bottom+GAP, left:b.left, width:b.width, up, maxH})
  },[])
  useEffect(()=>{
    if(!open) return
    place()
    const close=(e:Event)=>{
      const t=e.target as Node
      if(btnRef.current?.contains(t)||menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll=()=>place()
    document.addEventListener('mousedown',close)
    window.addEventListener('scroll',onScroll,true)
    window.addEventListener('resize',onScroll)
    return()=>{document.removeEventListener('mousedown',close);window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll)}
  },[open,place])
  return (
    <div style={{display:'inline-block'}}>
      <button ref={btnRef} onClick={e=>{e.stopPropagation();setOpen(v=>!v)}} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 10px',borderRadius:T.radius.pill,fontSize: 11,fontWeight:500,fontFamily:T.font.sans,color:CONDITION_COLOR[item.condition],background:CONDITION_COLOR[item.condition]+'18',border:`1px solid ${CONDITION_COLOR[item.condition]}40`,cursor:'pointer'}}>
        {item.condition}
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{transform:open?'rotate(180deg)':'none',transition:'transform 0.15s'}}><path d="M2 4l3 3 3-3"/></svg>
      </button>
      {open&&rect&&typeof document!=='undefined'&&createPortal(
        <div ref={menuRef} onClick={e=>e.stopPropagation()}
          style={{position:'fixed',top:rect.top,left:rect.left,transform:rect.up?'translateY(-100%)':'none',maxHeight:rect.maxH,overflowY:'auto',overscrollBehavior:'contain',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:6,zIndex:9000,minWidth:Math.max(160,rect.width),boxShadow:'var(--shadow-xl)'}}>
          {CONDITIONS.map(c=>(
            <div key={c} {...pressable(()=>{onUpdate(item.id,c);setOpen(false)})}
              style={{padding:'8px 12px',cursor:'pointer',borderRadius:8,fontSize:12,fontFamily:T.font.sans,color:CONDITION_COLOR[c],background:item.condition===c?CONDITION_COLOR[c]+'15':'transparent',fontWeight:item.condition===c?600:400,transition:'background 0.1s'}}
              onMouseEnter={e=>(e.currentTarget.style.background=CONDITION_COLOR[c]+'10')}
              onMouseLeave={e=>(e.currentTarget.style.background=item.condition===c?CONDITION_COLOR[c]+'15':'transparent')}
            >{c}</div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// Διακριτικό μενού ενεργειών «···» — μαζεύει όλες τις ενέργειες ανά αντικείμενο.
export interface OverflowAction { label:string; onClick:()=>void; icon?:React.ReactNode; danger?:boolean }
export function OverflowMenu({actions,align='right',dark}:{actions:OverflowAction[];align?:'left'|'right';dark?:boolean}) {
  const [open,setOpen] = useState(false)
  const [rect,setRect] = useState<{top:number;right:number;left:number;up?:boolean;maxH?:number}|null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const place = useCallback(()=>{
    const b=btnRef.current?.getBoundingClientRect()
    if(!b) return
    const M=8, GAP=6, needed=actions.length*38+12
    const spaceBelow=window.innerHeight-b.bottom-M, spaceAbove=b.top-M
    const up = spaceBelow<needed && spaceAbove>spaceBelow
    const maxH = Math.max(120, Math.min((up?spaceAbove:spaceBelow)-GAP, needed))
    setRect({top: up?b.top-GAP:b.bottom+GAP, right:window.innerWidth-b.right, left:b.left, up, maxH})
  },[actions.length])
  useEffect(()=>{
    if(!open) return
    place()
    const close=(e:Event)=>{
      const t=e.target as Node
      if(btnRef.current?.contains(t)||menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScroll=()=>place()
    document.addEventListener('mousedown',close)
    window.addEventListener('scroll',onScroll,true)
    window.addEventListener('resize',onScroll)
    return()=>{document.removeEventListener('mousedown',close);window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll)}
  },[open,place])
  return (
    <div style={{display:'inline-block'}} onClick={e=>e.stopPropagation()}>
      {/* ΤΟ ΔΑΠΕΔΟ ΤΩΝ 44 ΔΙΝΕΙ ΜΟΝΟ ΥΨΟΣ, ΟΧΙ ΠΛΑΤΟΣ. Ο κανόνας του globals.css
          τεντώνει κάθε κουμπί σε 44 ΥΨΟΣ σε συσκευή αφής· αυτό εδώ έχει καρφωμένο
          πλάτος 28, οπότε ο στόχος έβγαινε 28 επί 44 και το δάχτυλο αστοχούσε
          κατά πλάτος. Το `po-box` βγάζει το κουμπί από το δάπεδο και του δίνει
          αόρατη ζώνη −13 γύρω γύρω, δηλαδή 54 επί 54, χωρίς να πειραχτεί το
          σχήμα του: το ίδιο ιδίωμα που κρατά τα τετράγωνα σημάδια στα 18. */}
      <button ref={btnRef} className="po-box" title="Ενέργειες" aria-label="Ενέργειες" onClick={()=>setOpen(v=>!v)}
        style={{width:28,height:28,borderRadius:T.radius.pill,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s',
          border:`1px solid ${dark?'rgba(255,255,255,0.25)':'var(--border-subtle)'}`,
          background:dark?'rgba(0,0,0,0.45)':(open?'var(--bg-hover)':'var(--bg-surface)'),
          color:dark?'#fff':'var(--text-secondary)',backdropFilter:dark?'blur(4px)':undefined}}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
      </button>
      {open&&rect&&typeof document!=='undefined'&&createPortal(
        <div ref={menuRef} onClick={e=>e.stopPropagation()}
          style={{position:'fixed',top:rect.top,...(align==='right'?{right:rect.right}:{left:rect.left}),transform:rect.up?'translateY(-100%)':'none',maxHeight:rect.maxH,overflowY:'auto',overscrollBehavior:'contain',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.card,padding:5,zIndex:9000,minWidth:180,boxShadow:'var(--shadow-xl)'}}>
          {actions.map((a,i)=>(
            <button key={i} onClick={()=>{a.onClick();setOpen(false)}}
              style={{display:'flex',alignItems:'center',gap:10,width:'100%',textAlign:'left',padding:'8px 12px',borderRadius:8,fontSize:13,fontFamily:T.font.sans,fontWeight:500,color:a.danger?'var(--negative)':'var(--text-primary)',background:'transparent',border:'none',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=a.danger?'var(--negative-dim)':'var(--bg-hover)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{display:'flex',width:15,color:a.danger?'var(--negative)':'var(--text-tertiary)',flexShrink:0}}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
export const IconEdit = <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
export const IconRepair = <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 00-5.6 5.6l-6 6L5 20l6-6a4 4 0 005.6-5.6l-2.3 2.3-2-2z"/></svg>
export const IconQR = <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 20h.01M20 14h.01M14 20h.01"/></svg>
export const IconCal = <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
export const IconTrash = <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>

export function RoomInput({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  // Ένα καθαρό dropdown αντί για δεκάδες κουμπάκια — «Άλλος χώρος…» για ελεύθερο κείμενο.
  const isCustom = value!=='' && !ROOM_PRESETS.includes(value)
  const [custom,setCustom] = useState(isCustom)
  const [focused,setFocused] = useState(false)
  const options = [
    ...ROOM_PRESETS.map(r=>({value:r,label:r})),
    {value:'__custom__',label:'Άλλος χώρος…'},
  ]
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8}}>
      <CustomSelect ariaLabel="Χώρος" value={custom?'__custom__':value} placeholder="Επιλέξτε χώρο"
        onChange={v=>{ if(v==='__custom__'){setCustom(true);onChange('')} else {setCustom(false);onChange(v)} }}
        options={options}/>
      {custom&&(
        <input aria-label="Χώρος" value={value} onChange={e=>onChange(e.target.value)} placeholder="Πληκτρολογήστε τον χώρο (π.χ. Ξενώνας)" onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{background:'var(--bg-surface)',border:`1px solid ${focused?'var(--accent)':'var(--border-default)'}`,boxShadow:focused?'0 0 0 3px var(--accent-dim)':'none',borderRadius:6,padding:'0 16px',height:T.h.lg,color:'var(--text-primary)',fontSize:14,letterSpacing:0,outline:'none',fontFamily:T.font.sans,width:'100%',boxSizing:'border-box'}}
        />
      )}
    </div>
  )
}

export function QRModal({item,onClose}:{item:InventoryItem;onClose:()=>void}) {
  // QR τοπικά: τα στοιχεία της απογραφής δεν φεύγουν σε εξωτερική υπηρεσία.
  const qr = qrDataUrl(JSON.stringify({n:item.name,b:item.brand,m:item.model,sn:item.serial_number,cat:item.category,cond:item.condition,w:item.warranty_expiry}), { size: 200 })
  // ΕΤΙΚΕΤΑ, ΟΧΙ ΑΝΑΦΟΡΑ: ένα αυτοκόλλητο που κολλάει πάνω στο αντικείμενο δεν
  // παίρνει επικεφαλίδα εγγράφου, μετρικές και υποσημείωση. Παίρνει όμως την
  // ίδια τυπογραφία και το ίδιο μελάνι με τα υπόλοιπα και τυπώνεται ΜΟΝΟ του —
  // πριν περίμενε κλικ σε κουμπί που το ίδιο του το CSS έκρυβε στην εκτύπωση.
  const print = () => openReport(
    `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Ετικέτα ${rEsc(item.name)}</title>`
    + `<style>body{font-family:'Inter',system-ui,Arial,sans-serif;color:${INK};padding:24px;text-align:center}`
    + `h2{font-size:16px;font-weight:700;margin-bottom:4px}</style></head><body>`
    + `<h2>${rEsc(item.name)}</h2>`
    + `<img src="${rEsc(qr)}" width="180" height="180" style="margin:12px auto;display:block;border:1px solid ${RULE};padding:8px;border-radius:8px"/>`
    + `</body></html>`)
  // ΔΕΝ ΕΙΝΑΙ ΣΑΡΩΤΗΣ ΚΑΜΕΡΑΣ ΟΥΤΕ ΠΡΟΒΟΛΗ ΦΩΤΟΓΡΑΦΙΑΣ, παρότι είχε zIndex 1100:
  // είναι τίτλος + ένα παραγόμενο τοπικά QR + μία ενέργεια («Εκτύπωση καρτέλας»),
  // δηλαδή κανονικό κεντραρισμένο παράθυρο. Το 1100 το κρατούσε πάνω από τη φόρμα
  // αντικειμένου (1000)· η σειρά διατηρείται γιατί το <QRModal> αποδίδεται ΜΕΤΑ το
  // <ItemFormModal> στο ίδιο επίπεδο (βλ. τέλος αρχείου), άρα ζωγραφίζεται από πάνω.
  // Το κουμπί «Κλείσιμο» της κεφαλίδας το δίνει πλέον το ίδιο το Modal (× με
  // aria-label «Κλείσιμο»), μαζί με Escape και επιστροφή εστίασης που δεν υπήρχαν.
  return (
    <Modal open onClose={onClose} size="sm" ariaLabel="QR αντικειμένου"
      title={<span title="Κωδικός QR: γρήγορη σάρωση στοιχείων αντικειμένου με κινητό">QR αντικειμένου</span>}
      footer={<Btn variant="primary" onClick={print}>Εκτύπωση καρτέλας</Btn>}>
      <div style={{background:'var(--qr-paper)',padding:12,borderRadius:T.radius.card,alignSelf:'center'}}><img src={qr} width={200} height={200} alt="QR"/></div>
      <div style={{textAlign:'center'}}>
        <p style={{fontSize:13,fontWeight:500,fontFamily:T.font.sans,color:'var(--text-primary)',marginBottom:2}}>{item.name}</p>
        <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans}}>{item.brand} {item.model}{item.serial_number?` · Σειριακός ${item.serial_number}`:''}</p>
      </div>
    </Modal>
  )
}

// Ετικέτα πεδίου ΜΕ ΤΟ «ΓΙΑΤΙ» ΤΟΥ. Δεν είναι διακόσμηση: όποιος δεν καταλαβαίνει
// γιατί ζητάμε κάτι δεν το συμπληρώνει και μετά λείπει από τη δήλωση. Το κείμενο
// έρχεται από το μητρώο (lib/property/fields.ts) — μία πηγή, ίδια λόγια παντού.
export function Field({d,children}:{d?:FieldDecision;children:React.ReactNode}) {
  if(!d) return null
  return (
    <div>
      <label style={labelStyle}>{d.label}{d.critical?' *':''}</label>
      {children}
      <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:T.font.sans,lineHeight:1.45,marginTop:5}}>{d.why}</p>
    </div>
  )
}
