'use client'
import { T, TT } from '@/components/Theme'

// ── Κοινά primitives του Δανείου (μία πηγή αλήθειας για TabLoan + TabLoanCalculator) ──
// Πριν υπήρχαν διπλά αντίγραφα που είχαν αποκλίνει (διαφορετικές ακτίνες/μεγέθη).
// Εδώ ενοποιούνται ώστε τα δύο αρχεία να μοιάζουν απόλυτα.

// Η ετικέτα πεδίου ΔΕΝ ξαναορίζεται: είναι το TT.label, λέξη προς λέξη. Ήταν
// γραμμένη οκτώ φορές σε οκτώ αρχεία, με δύο τυπογραφίες (10/700 και 11/600)
// για το ίδιο ακριβώς πράγμα — δηλαδή οι ίδιες ετικέτες άλλαζαν μέγεθος από
// οθόνη σε οθόνη. Επανεξάγεται από εδώ ώστε να μη σπάσει καμία εισαγωγή.
export const labelStyle: React.CSSProperties = TT.label
// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΓΚΡΙ ΤΟΥ ΔΑΝΕΙΟΥ ΗΤΑΝ ΑΛΛΟ ΓΚΡΙ ΑΠΟ ΟΛΗΣ ΤΗΣ ΕΦΑΡΜΟΓΗΣ
// ─────────────────────────────────────────────────────────────────────────
// Κάθε κάρτα του PROPERWISE είναι η `Card` του Theme, δηλαδή:
//
//     background  var(--surface-raised)   ήπια βαθμίδα, #313236 → #2a2b2e
//     border      var(--border-raised)
//     box-shadow  var(--highlight-inset), var(--elev-1)
//
// Το Δάνειο έγραφε δικό του κουτί: `var(--bg-elevated)` — ΕΠΙΠΕΔΟ #35363a, ένα
// σκαλί ανοιχτότερο, χωρίς βαθμίδα, χωρίς σκιά και χωρίς τη λεπτή φωτεινή ακμή
// στην κορυφή. Δίπλα σε οποιαδήποτε άλλη καρτέλα διαβαζόταν ως κομμάτι άλλης
// εφαρμογής, και δεν μπορούσε κανείς να πει γιατί: η διαφορά είναι τρία
// εικονοστοιχεία φωτεινότητας και μια σκιά που λείπει.
//
// ΚΑΙ ΤΟ `--bg-elevated` ΔΕΝ ΕΙΝΑΙ ΛΑΘΟΣ ΤΟΚΕΝ — είναι λάθος ΘΕΣΗ. Είναι η
// βυθισμένη επιφάνεια ΜΕΣΑ σε κάρτα (σημειώσεις, πλακίδια, κεφαλίδες πίνακα).
// Ως κάρτα, το βύθισμα γίνεται ανύψωση και η ιεραρχία αντιστρέφεται.
// ═══════════════════════════════════════════════════════════════════════════
export const cardStyle: React.CSSProperties = {
  background:'var(--surface-raised)',border:'1px solid var(--border-raised)',borderRadius:T.radius.card,padding:T.sp.lg,
  boxShadow:'var(--highlight-inset), var(--elev-1)',
}

/** Το ίδιο κουτί χωρίς εσωτερικό περιθώριο, για ενότητες με δική τους κεφαλίδα. */
export const panelStyle: React.CSSProperties = { ...cardStyle, padding:0, overflow:'hidden' }

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
// ΚΑΙ Η ΑΝΥΨΩΣΗ ΤΗΝ ΚΑΝΕΙ ΤΟ CSS, ΟΧΙ ΤΟ REACT. Το πλακίδιο κρατούσε δική του
// κατάσταση `hover` με τέσσερις ακροατές (mouse enter/leave, touch start/end)
// για να αλλάξει ένα περίγραμμα και ένα χρώμα — δηλαδή μια απόδοση σε κάθε
// κίνηση του ποντικιού, σε δώδεκα πλακίδια ταυτόχρονα. Η `.kpi-card` του
// globals.css το κάνει χωρίς JavaScript, και το κάνει ΙΔΙΟ με τα KPI των
// υπόλοιπων δεκατεσσάρων καρτελών: ίδια βαθμίδα, ίδια σκιά, ίδιο σήκωμα.
export function KPI({label,value,emphasis,sub,title}:{label:string;value:string;emphasis?:boolean;sub?:string;title?:string}) {
  return (
    <div className="kpi-card" style={{display:'flex',flexDirection:'column',gap:6}}>
      <p title={title} className="kpi-label" style={{cursor:title?'help':undefined}}>{label}</p>
      {/* ΙΔΙΟ ΚΟΥΤΙ, ΠΙΟ ΣΦΙΧΤΟΣ ΑΡΙΘΜΟΣ, ΚΑΙ ΕΧΕΙ ΛΟΓΟ. Τα πλέγματα του Δανείου
          κατεβαίνουν σε στήλες των 120 εικονοστοιχείων — έξι και εφτά δείκτες
          στη σειρά, όχι τέσσερις όπως στις υπόλοιπες καρτέλες. Με το ταβάνι των
          24 της `.kpi-value`, ένα «1.234,56 €» θα έσπαγε σε δεύτερη γραμμή σε
          κάθε στενή στήλη. Κλιμακώνεται με το πλάτος της κάρτας όπως παντού,
          απλώς με χαμηλότερο ταβάνι. */}
      <p className="kpi-value" style={{fontSize:'clamp(15px, 12cqi, 18px)',marginBottom:0,fontWeight:emphasis?700:600}}>{value}</p>
      {sub&&<p style={{fontSize: 11,color:'var(--text-tertiary)',fontFamily: T.font.sans,lineHeight:1.4}}>{sub}</p>}
    </div>
  )
}

// Cockpit: εναλλαγή φακών επί τόπου (segmented control, ένα πάνελ τη φορά).
export function LensBar({value,onChange,items,barRef}:{value:string;onChange:(v:string)=>void;items:{id:string;label:string}[];barRef?:React.Ref<HTMLDivElement>}) {
  return (
    <div ref={barRef} style={{display:'flex',gap:3,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:T.radius.card,padding:4,overflowX:'auto'}}>
      {items.map(it=>{const on=value===it.id;return(
        <button key={it.id} onClick={()=>onChange(it.id)} aria-pressed={on} style={{flex:'1 0 auto',minWidth:92,borderRadius:T.radius.inner,padding:'9px 14px',cursor:'pointer',fontFamily: T.font.sans,fontSize:13,fontWeight:on?600:500,whiteSpace:'nowrap' as const,border:'none',
          color:on?'var(--accent)':'var(--text-tertiary)',background:on?'var(--bg-elevated)':'transparent',
          boxShadow:on?'0 1px 2px color-mix(in srgb, var(--text-primary) 10%, transparent), 0 2px 8px -4px color-mix(in srgb, var(--text-primary) 18%, transparent)':'none',
          transition:'color 0.2s, background 0.2s, box-shadow 0.2s'}}>{it.label}</button>
      )})}
    </div>
  )
}
