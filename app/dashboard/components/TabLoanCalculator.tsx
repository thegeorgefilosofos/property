'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine
} from 'recharts'
import {
  Save, Calendar, ArrowRight, Plus, Trash2, Edit2, Check, X,
  FileText, ChevronDown, ChevronUp, Clock, RefreshCw, MapPin, Home, Building, Info
} from 'lucide-react'
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea } from './UIComponents'
import {
  BANKS, LOAN_TYPES, BORROWER_PROFILES, TAX_DATA,
  calcMonthly, calcAmortization, calcFmaExemption, calcRentalTax,
  fmtEur, fmtPct, fmtPct1,
  LoanType, RateType, BorrowerType, LoanScenario, MarketRates, SavedLoan
} from './TabLoanData'

// ─── Design helpers ───────────────────────────────────────────────────────────
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

function Section({ title, sub, children, defaultOpen=false, badge }: { title:string; sub?:string; children:React.ReactNode; defaultOpen?:boolean; badge?:string }) {
  const [open,setOpen] = useState(defaultOpen)
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, overflow:'hidden' }}>
      <button onClick={()=>setOpen(o=>!o)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' as const }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:open?'var(--accent)':'var(--border-default)', display:'inline-block', transition:'background 0.2s' }}/>
            <p style={{ fontSize:11, color:open?'var(--accent)':'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>{title}</p>
            {badge&&<span style={{ fontSize:9, padding:'2px 7px', borderRadius:5, background:'rgba(52,211,153,0.12)', color:'var(--positive)', border:'1px solid rgba(52,211,153,0.2)', fontWeight:700 }}>{badge}</span>}
          </div>
          {sub&&<p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:3, marginLeft:13, lineHeight:1.4 }}>{sub}</p>}
        </div>
        {open?<ChevronUp size={14} color="var(--text-secondary)"/>:<ChevronDown size={14} color="var(--text-secondary)"/>}
      </button>
      {open&&<div style={{ padding:'0 16px 16px' }}>{children}</div>}
    </div>
  )
}

function ChartTip({ active, payload, label }: any) {
  if (!active||!payload?.length) return null
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'JetBrains Mono, monospace', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
      <p style={{ color:'var(--text-secondary)', marginBottom:6, fontSize:10 }}>{label}</p>
      {payload.map((p:any,i:number)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
          <span style={{ width:8, height:8, borderRadius:2, background:p.color, display:'inline-block' }}/>
          <p style={{ color:'var(--text-primary)' }}>{p.name}: <strong style={{ color:p.color }}>{p.value>100?fmtEur(p.value):`${p.value}%`}</strong></p>
        </div>
      ))}
    </div>
  )
}

// ─── Property type data (realistic notary costs per type) ─────────────────────
const PROPERTY_TYPES = [
  { value:'residence',    label:'Κατοικία',              desc:'Διαμέρισμα, μονοκατοικία, μεζονέτα', notary_pct:0.013, stamp:0, vat_possible:false },
  { value:'new_residence',label:'Νεόδμητη Κατοικία',     desc:'Άδεια μετά το 2006 — ΦΠΑ 24%',      notary_pct:0.015, stamp:0, vat_possible:true  },
  { value:'store',        label:'Κατάστημα / Γραφείο',   desc:'Επαγγελματική χρήση',                notary_pct:0.015, stamp:0.036, vat_possible:false },
  { value:'warehouse',    label:'Αποθήκη / Βιομηχανικό', desc:'Βιομηχανική / αποθήκευση',          notary_pct:0.015, stamp:0.036, vat_possible:false },
  { value:'land',         label:'Οικόπεδο / Γη',         desc:'Εντός ή εκτός σχεδίου',             notary_pct:0.012, stamp:0,     vat_possible:false },
  { value:'parking',      label:'Θέση Στάθμευσης',       desc:'Αυτοτελής ή παράρτημα',             notary_pct:0.010, stamp:0,     vat_possible:false },
]

// ─── Zone multipliers for realistic notary fees ───────────────────────────────
// Notary fees in Greece are on a sliding scale based on property value
function calcNotaryFees(propValue: number, propType: string): {
  notary: number, landReg: number, agent: number, legal: number, other: number, total: number, breakdown: string[]
} {
  // Official Greek notary fee scale (ΔΣΑ/ΣΣΣΕ)
  let notaryFee = 0
  const bands = [
    { up: 120000, rate: 0.008 },
    { up: 380000, rate: 0.007 },
    { up: 2000000, rate: 0.0065 },
    { up: Infinity, rate: 0.006 },
  ]
  let remaining = propValue
  let prev = 0
  for (const band of bands) {
    const chunk = Math.min(remaining, band.up - prev)
    if (chunk <= 0) break
    notaryFee += chunk * band.rate
    remaining -= chunk
    prev = band.up
  }
  notaryFee = Math.max(notaryFee, 200) // minimum

  // Mortgage deed notary (separate — ~40% of main deed)
  const mortgageDeed = notaryFee * 0.4

  // Land registry (Κτηματολόγιο) — 0.475% of loan amount (passed as propValue here as reference)
  const landReg = propValue * 0.00475

  // Legal check (δικηγόρος) — optional but standard
  const legal = Math.min(Math.max(propValue * 0.003, 300), 1500)

  // Mortgage registration tax (L. 128/75 — 0.12% per year but paid upfront varies)
  const mortgageTax = propValue * 0.001

  const total = notaryFee + mortgageDeed + landReg + legal + mortgageTax

  const isCommercial = propType === 'store' || propType === 'warehouse'

  const breakdown = [
    `Συμβολαιογραφικά αγοράς: ${fmtEur(notaryFee)}`,
    `Συμβολαιογραφικά υποθήκης: ${fmtEur(mortgageDeed)}`,
    `Κτηματολόγιο (0.475‰): ${fmtEur(landReg)}`,
    `Δικηγόρος ελέγχου τίτλων: ${fmtEur(legal)}`,
    isCommercial ? `Τέλη χαρτοσήμου μίσθωσης (3.6%): ${fmtEur(propValue * 0.036)} — εφόσον εκμισθωθεί` : `Φόρος ενεγγύησης υποθήκης: ${fmtEur(mortgageTax)}`,
  ]

  return { notary: notaryFee + mortgageDeed, landReg, agent: 0, legal, other: mortgageTax, total, breakdown }
}

// ─── Select options ───────────────────────────────────────────────────────────
const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPES).map(([k,v])=>({ value:k, label:v.label, description:`${v.typical_rate} · LTV έως ${v.typical_ltv}%` }))
const BORROWER_OPTIONS  = Object.entries(BORROWER_PROFILES).map(([k,v])=>({ value:k, label:v.label, description:v.notes }))
const BANK_OPTIONS      = [...BANKS.map(b=>({ value:b.id, label:b.name, description:`${b.note} · ${b.fees}`, dot:b.color })), { value:'custom', label:'Άλλη τράπεζα', description:'Καταχωρήστε το όνομά της' }]
const RATE_TYPE_OPTIONS = [
  { value:'fixed',    label:'Σταθερό',     description:'Σταθερό για την επιλεγμένη περίοδο' },
  { value:'variable', label:'Κυμαινόμενο', description:'Euribor + spread — αλλάζει με την αγορά' },
  { value:'mixed',    label:'Μικτό',        description:'Σταθερό αρχικά, μετά κυμαινόμενο' },
]
const FIXED_PERIOD_OPTIONS = ['3','5','10','15','20'].map(v=>({ value:v, label:`${v} χρόνια`, description:v==='5'?'Πιο συνηθισμένο':v==='10'?'Καλή ισορροπία':'' }))
const MARITAL_OPTIONS   = [
  { value:'single',  label:'Άγαμος / Άγαμη',  description:'Όριο απαλλαγής ΦΜΑ: 200.000€' },
  { value:'married', label:'Έγγαμος / Έγγαμη', description:'Όριο απαλλαγής ΦΜΑ: 250.000€' },
]
const CHILDREN_OPTIONS  = [0,1,2,3,4,5,6,7].map(n=>({
  value:String(n),
  label:n===0?'Χωρίς εξαρτώμενα τέκνα':`${n} εξαρτώμεν${n===1?'ο':'α'} τέκν${n===1?'ο':'α'}`,
  description:n===0?'Δεν επηρεάζει το όριο ΦΜΑ':n===1?'+25.000€ στο όριο ΦΜΑ':n===2?'+50.000€ στο όριο ΦΜΑ':n===3?'+80.000€ (3ο τέκνο +30.000€)':`+${50+(n-2)*30}.000€`
}))
const PROP_TYPE_OPTIONS = PROPERTY_TYPES.map(p=>({ value:p.value, label:p.label, description:p.desc }))

// ─── Area options with realistic zone info ────────────────────────────────────
const AREA_OPTIONS = [
  // ── Αττική — Αθήνα ──────────────────────────────────────────────────────────
  { value:'attica_center_prime',   label:'Αθήνα — Premium Κέντρο',      description:'Κολωνάκι, Σύνταγμα, Εξάρχεια, Πλάκα, Μεταξουργείο' },
  { value:'attica_center_std',     label:'Αθήνα — Κέντρο',              description:'Κυψέλη, Ζωγράφου, Παγκράτι, Ν.Σμύρνη, Νέος Κόσμος' },
  { value:'attica_south_prime',    label:'Αττική — Νότια Premium',      description:'Γλυφάδα, Βούλα, Βουλιαγμένη, Βάρη, Άνω Βούλα' },
  { value:'attica_south_std',      label:'Αττική — Νότια',              description:'Άλιμος, Ελληνικό, Αργυρούπολη, Άγιος Δημήτριος, Καλλιθέα' },
  { value:'attica_north_prime',    label:'Αττική — Βόρεια Premium',     description:'Κηφισιά, Εκάλη, Διόνυσος, Ν.Ερυθραία, Ν.Πεντέλη' },
  { value:'attica_north_std',      label:'Αττική — Βόρεια',             description:'Μαρούσι, Χαλάνδρι, Αγία Παρασκευή, Βριλήσσια, Φιλοθέη' },
  { value:'attica_east',           label:'Αττική — Ανατολική',          description:'Παλλήνη, Κορωπί, Σπάτα, Αρτέμιδα, Ραφήνα, Μαραθώνας' },
  { value:'attica_west',           label:'Αττική — Δυτική',             description:'Περιστέρι, Αιγάλεω, Ίλιον, Πετρούπολη, Χαϊδάρι' },
  { value:'attica_piraeus_prime',  label:'Πειραιάς — Premium',          description:'Καστέλα, Φρεαττύδα, Πασαλιμάνι' },
  { value:'attica_piraeus_std',    label:'Πειραιάς & Περίχωρα',        description:'Κερατσίνι, Νίκαια, Δραπετσώνα, Κορυδαλλός, Πέραμα' },
  { value:'attica_riviera',        label:'Αττική Ριβιέρα',              description:'Σαρωνίδα, Λαγονήσι, Σούνιο, Ανάβυσσος, Λαύριο' },
  { value:'attica_suburbs_mid',    label:'Αττική — Μεσαία Προάστια',   description:'Νέα Ιωνία, Ηράκλειο, Λυκόβρυση, Μεταμόρφωση, Κηφισιά (νότια)' },

  // ── Θεσσαλονίκη ─────────────────────────────────────────────────────────────
  { value:'thess_center',          label:'Θεσσαλονίκη — Κέντρο',        description:'Κέντρο, ΑΠΘ, Λαδάδικα, Βαρδάρης, Ιπποκράτειο' },
  { value:'thess_east',            label:'Θεσσαλονίκη — Ανατολικά',    description:'Καλαμαριά, Τριανδρία, Καλαμαριά, Χαριλάου' },
  { value:'thess_suburbs_n',       label:'Θεσσαλονίκη — Βόρεια Προάστια',description:'Πυλαία, Χορτιάτης, Θέρμη, Ταγαράδες, Επανομή' },
  { value:'thess_suburbs_w',       label:'Θεσσαλονίκη — Δυτικά',       description:'Σταυρούπολη, Ευόσμος, Κορδελιό, Αμπελόκηποι, Πολίχνη' },
  { value:'thess_halkidiki',       label:'Χαλκιδική',                   description:'Κασσάνδρα, Σιθωνία, Άθως — τουριστικές & παραθεριστικές' },

  // ── Κρήτη ────────────────────────────────────────────────────────────────────
  { value:'crete_heraklion',       label:'Κρήτη — Ηράκλειο',           description:'Ηράκλειο, Νίκος Καζαντζάκης, Αρχάνες, Γάζι' },
  { value:'crete_chania',          label:'Κρήτη — Χανιά',              description:'Χανιά, Ακρωτήρι, Πλατανιάς, Κολυμβάρι' },
  { value:'crete_rethymno',        label:'Κρήτη — Ρέθυμνο',            description:'Ρέθυμνο, Σπήλι, Αρκάδι' },
  { value:'crete_lasithi',         label:'Κρήτη — Λασίθι',             description:'Άγιος Νικόλαος, Ιεράπετρα, Σητεία, Ελούντα' },
  { value:'crete_elounda',         label:'Κρήτη — Ελούντα / Λούτρο',  description:'Ultra-premium resort area — υψηλές αξίες' },

  // ── Δωδεκάνησα / Ν. Αιγαίο ───────────────────────────────────────────────────
  { value:'rhodes',                label:'Ρόδος',                       description:'Ρόδος πόλη, Λίνδος, Φαληράκι, Ιαλυσός' },
  { value:'kos',                   label:'Κως',                         description:'Κως πόλη, Καρδάμαινα, Τίγκακι' },
  { value:'mykonos',               label:'Μύκονος',                     description:'Μύκονος — premium, υψηλές αξίες' },
  { value:'santorini',             label:'Σαντορίνη',                   description:'Φηρά, Οία, Ημεροβίγλι, Ακρωτήρι — premium' },
  { value:'paros_naxos',           label:'Πάρος / Νάξος',               description:'Παροικία, Νάουσα, Νάξος — επενδυτικό ενδιαφέρον' },
  { value:'syros',                 label:'Σύρος',                       description:'Ερμούπολη — πρωτεύουσα Κυκλάδων' },
  { value:'lesvos',                label:'Λέσβος / Χίος / Σάμος',      description:'Μυτιλήνη, Χίος, Σάμος' },
  { value:'corfu',                 label:'Κέρκυρα',                     description:'Κέρκυρα πόλη, Κανόνι, Βόρεια Κέρκυρα' },
  { value:'lefkada_zakynthos',     label:'Λευκάδα / Ζάκυνθος / Κεφαλλονιά',description:'Ιόνια νησιά — τουριστική ζήτηση' },
  { value:'islands_small',         label:'Μικρά Νησιά / Σποράδες',     description:'Σκιάθος, Σκόπελος, Αλόννησος, Σκύρος, Χαλκίδα' },

  // ── Πελοπόννησος ─────────────────────────────────────────────────────────────
  { value:'patras',                label:'Πάτρα & Αχαΐα',              description:'Πάτρα, Ρίο, Αίγιο — 3η πόλη Ελλάδας' },
  { value:'peloponnese_coast',     label:'Πελοπόννησος — Παραλιακή',   description:'Ναύπλιο, Πόρτο Χέλι, Λεωνίδιο, Σπέτσες, Ύδρα' },
  { value:'kalamata',              label:'Καλαμάτα & Μεσσηνία',        description:'Καλαμάτα, Κυπαρισσία, Πύλος, Μεθώνη' },
  { value:'sparta_lakonia',        label:'Σπάρτη / Λακωνία / Μάνη',    description:'Σπάρτη, Μονεμβάσια, Γύθειο — αναπτυσσόμενη αγορά' },
  { value:'corinthia',             label:'Κορινθία / Αργολίδα',        description:'Κόρινθος, Ναύπλιο, Άργος, Λουτράκι' },
  { value:'tripoli',               label:'Τρίπολη / Αρκαδία',          description:'Τρίπολη, Άστρος, Λεωνίδιο' },

  // ── Κεντρική & Δυτική Ελλάδα ─────────────────────────────────────────────────
  { value:'larissa',               label:'Λάρισα & Θεσσαλία',          description:'Λάρισα, Βόλος, Τρίκαλα, Καρδίτσα' },
  { value:'volos',                 label:'Βόλος & Πήλιο',              description:'Βόλος, Πήλιο — παραθεριστική & αστική αγορά' },
  { value:'ioannina',              label:'Ιωάννινα & Ήπειρος',          description:'Ιωάννινα, Πρέβεζα, Άρτα' },
  { value:'agrinio',               label:'Αγρίνιο & Αιτωλοακαρνανία', description:'Αγρίνιο, Μεσολόγγι, Ναύπακτος' },
  { value:'lamia',                 label:'Λαμία & Στερεά Ελλάδα',     description:'Λαμία, Χαλκίδα, Λιβαδειά, Αμφίκλεια' },
  { value:'kavala',                label:'Καβάλα & Ανατολική Μακεδονία',description:'Καβάλα, Δράμα, Ξάνθη, Κομοτηνή, Αλεξανδρούπολη' },
  { value:'serres_kilkis',         label:'Σέρρες / Κιλκίς / Ημαθία',  description:'Σέρρες, Κιλκίς, Βέροια, Νάουσα, Έδεσσα' },
  { value:'kozani_florina',        label:'Κοζάνη / Φλώρινα / Καστοριά', description:'Δυτική Μακεδονία — αναπτυσσόμενη αγορά' },

  // ── Βόρεια Ελλάδα / Μακεδονία ────────────────────────────────────────────────
  { value:'katerini_pieria',       label:'Κατερίνη & Πιερία',          description:'Κατερίνη, Παραλία, Πλαταμώνας' },
  { value:'alexandroupoli',        label:'Αλεξανδρούπολη & Θράκη',     description:'Αλεξανδρούπολη, Κομοτηνή, Ξάνθη — στρατηγική θέση' },
  { value:'thassos_samothraki',    label:'Θάσος / Σαμοθράκη',          description:'Παραθεριστική — αναπτυσσόμενο επενδυτικό ενδιαφέρον' },
]

// ─── Quick Presets ────────────────────────────────────────────────────────────
const PRESETS = [
  { id:'first_buyer', label:'Νέος Αγοραστής', emoji:'🏠', desc:'Πρώτη κατοικία — Σπίτι μου ΙΙ',
    color:'rgba(52,211,153,0.12)', border:'rgba(52,211,153,0.3)', textColor:'var(--positive)',
    values:{ loanAmount:'150000', propValue:'185000', sqm:'80', rate:'1.80', years:'25', rateType:'fixed' as RateType, loanType:'first_home' as LoanType, borrower:'young' as BorrowerType, fixedPeriod:'5', propType:'residence', area:'center_athens' }},
  { id:'investor', label:'Επενδυτής', emoji:'📈', desc:'Ακίνητο προς ενοικίαση',
    color:'rgba(96,165,250,0.12)', border:'rgba(96,165,250,0.3)', textColor:'var(--info)',
    values:{ loanAmount:'200000', propValue:'280000', sqm:'90', rate:'3.20', years:'20', rateType:'fixed' as RateType, loanType:'investment' as LoanType, borrower:'individual' as BorrowerType, fixedPeriod:'5', propType:'residence', area:'south_suburbs' }},
  { id:'commercial', label:'Επαγγελματικό', emoji:'🏢', desc:'Κατάστημα / Γραφείο',
    color:'rgba(251,146,60,0.12)', border:'rgba(251,146,60,0.3)', textColor:'var(--warning)',
    values:{ loanAmount:'150000', propValue:'220000', sqm:'50', rate:'3.80', years:'15', rateType:'fixed' as RateType, loanType:'commercial' as LoanType, borrower:'professional' as BorrowerType, fixedPeriod:'5', propType:'store', area:'center_athens' }},
  { id:'renovation', label:'Ανακαίνιση', emoji:'🔧', desc:'Ενεργειακή αναβάθμιση',
    color:'rgba(167,139,250,0.12)', border:'rgba(167,139,250,0.3)', textColor:'#a78bfa',
    values:{ loanAmount:'25000', propValue:'200000', sqm:'85', rate:'2.90', years:'15', rateType:'fixed' as RateType, loanType:'energy' as LoanType, borrower:'individual' as BorrowerType, fixedPeriod:'5', propType:'residence', area:'center_athens' }},
]

interface CalcHistory { id:string; ts:string; loanType:LoanType; amount:number; rate:number; years:number; monthly:number }

interface Props {
  propertyId:string; userId:string; market:MarketRates
  onSaveLoan:(loan:Partial<SavedLoan>)=>Promise<void>
  onSaveToCalendar:(monthly:number,years:number,startDate:string,bankName:string)=>Promise<void>
  onSaveToExpenses:(monthly:number,bankName:string)=>Promise<void>
  onStateChange?:(s:any)=>void
}

export default function TabLoanCalculator({ propertyId, userId, market, onSaveLoan, onSaveToCalendar, onSaveToExpenses, onStateChange }: Props) {
  // Core inputs
  const [loanAmount,  setLoanAmount]  = useState('150000')
  const [propValue,   setPropValue]   = useState('185000')
  const [sqm,         setSqm]         = useState('80')
  const [propType,    setPropType]    = useState('residence')
  const [area,        setArea]        = useState('center_athens')
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
  const [income,      setIncome]      = useState('2000')
  const [marital,     setMarital]     = useState<'single'|'married'>('single')
  const [children,    setChildren]    = useState('0')
  const [hasAgent,    setHasAgent]    = useState(false)
  const [agentPct,    setAgentPct]    = useState('2')
  const [scenarios,   setScenarios]   = useState<LoanScenario[]>([])
  const [editingId,   setEditingId]   = useState<string|null>(null)
  const [remBal,      setRemBal]      = useState('100000')
  const [remYears,    setRemYears]    = useState('20')
  const [newRate,     setNewRate]     = useState('3.0')
  const [xferCost,    setXferCost]    = useState('2000')
  const [saving,      setSaving]      = useState(false)
  const [activePreset,setActivePreset]= useState<string|null>(null)
  const [history,     setHistory]     = useState<CalcHistory[]>([])
  const [advisorSync, setAdvisorSync] = useState(false)
  const historyTimer = useRef<any>(null)

  // Parse
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
  const NR   = parseFloat(newRate)||0
  const XC   = parseFloat(xferCost)||0
  const AGNT = hasAgent ? (PV * parseFloat(agentPct||'2') / 100) : 0

  const effRate   = rateType==='variable' ? market.euribor_3m+R : R
  const monthly   = calcMonthly(LA, effRate, Y)
  const total     = monthly * Y * 12
  const totalInt  = total - LA
  const ltv       = PV > 0 ? (LA/PV)*100 : 0
  const sqmPrice  = PV > 0 && SQM > 0 ? PV/SQM : 0
  const amort     = useMemo(()=>calcAmortization(LA,effRate,Y),[LA,effRate,Y])

  // Realistic notary calculation based on actual property type and value
  const notaryCosts = useMemo(()=>calcNotaryFees(PV, propType),[PV,propType])

  // FMA calculation
  const selectedPropType = PROPERTY_TYPES.find(p=>p.value===propType)||PROPERTY_TYPES[0]
  const fmaEx    = calcFmaExemption(marital, CH)
  const isNewBuilding = propType === 'new_residence'
  const isCommercial  = propType === 'store' || propType === 'warehouse'

  // FMA: residential only. New buildings have VAT instead. Commercial has stamp duty.
  const fmaRate  = 0.03
  const fmaOwed  = useMemo(()=>{
    if (isNewBuilding) return 0 // ΦΠΑ 24% instead, not ΦΜΑ
    if (isCommercial)  return PV * fmaRate // No exemption for commercial
    if (loanType==='first_home' && PV <= fmaEx) return 0
    return PV * fmaRate
  },[isNewBuilding, isCommercial, loanType, PV, fmaEx])

  const vatOwed  = isNewBuilding ? PV * 0.24 : 0
  const stampOwed= isCommercial  ? PV * selectedPropType.stamp : 0

  // Mortgage registration tax (different from FMA)
  const mortgageTax = LA * 0.00475  // Κτηματολόγιο — ~0.475% of loan

  // Total acquisition cost
  const totalCosts = useMemo(()=>{
    const tax = isNewBuilding ? vatOwed : fmaOwed
    return {
      tax,
      notary: notaryCosts.notary,
      landReg: notaryCosts.landReg,
      legal: notaryCosts.legal,
      agent: AGNT,
      other: notaryCosts.other,
      total: tax + notaryCosts.total + AGNT,
      downpayment: PV - LA,
      totalCash: (PV - LA) + tax + notaryCosts.total + AGNT,
    }
  },[isNewBuilding, vatOwed, fmaOwed, notaryCosts, AGNT, PV, LA])

  const renInc   = loanType==='investment' ? monthly*12*0.8 : 0
  const renTax   = calcRentalTax(renInc*(1-TAX_DATA.rental_expense_deduction))
  const spitiR   = Math.max(market.euribor_3m*0.5+0.3, 1.0)
  const spitiM   = calcMonthly(LA, spitiR, Y)
  const spitiSv  = (monthly - spitiM) * Y * 12

  const currM    = calcMonthly(RB, effRate, RY)
  const newM     = calcMonthly(RB, NR, RY)
  const mSav     = currM - newM
  const refSav   = mSav * RY * 12 - XC
  const brkEven  = mSav > 0 ? Math.ceil(XC/mSav) : null

  const maxLoan  = useMemo(()=>{
    const maxM = INC * BORROWER_PROFILES[borrower].income_ratio
    const r = effRate/100/12, n = Y*12
    return r>0 ? maxM*(Math.pow(1+r,n)-1)/(r*Math.pow(1+r,n)) : maxM*n
  },[INC,borrower,effRate,Y])

  const stress   = [
    {label:'Τρέχον', rate:effRate},
    {label:'+0.5%',  rate:effRate+0.5},
    {label:'+1%',    rate:effRate+1},
    {label:'+2%',    rate:effRate+2},
    {label:'+3%',    rate:effRate+3},
    {label:'6%',     rate:6},
  ].map(s=>({...s,monthly:calcMonthly(LA,s.rate,Y)}))

  const amortChart = useMemo(()=>{
    const out=[]
    for(let y=1;y<=Math.min(Y,30);y++){
      const rows=amort.slice((y-1)*12,y*12)
      out.push({ year:`${y}`, Κεφάλαιο:Math.round(rows.reduce((s,r)=>s+r.principal,0)), Τόκοι:Math.round(rows.reduce((s,r)=>s+r.interest,0)) })
    }
    return out
  },[amort,Y])

  const scenChart = useMemo(()=>scenarios.map(s=>({
    name:s.label, Τόκοι:Math.round(calcMonthly(s.amount,s.rate,s.years)*s.years*12-s.amount)
  })),[scenarios])

  const extraSav = useMemo(()=>{
    if(EP<=0)return null
    let bal=LA,months=0,ti=0,m=monthly+EP
    while(bal>0&&months<Y*12){const int=bal*(effRate/100/12);ti+=int;bal=bal*(1+effRate/100/12)-m;months++}
    return{savedMonths:Y*12-months,savedInt:Math.max(0,totalInt-ti)}
  },[LA,effRate,Y,EP,monthly,totalInt])

  // Fixed vs variable comparison
  const varMonthly  = calcMonthly(LA, market.euribor_3m+R, Y)
  const fvChartData = useMemo(()=>{
    const pts=[3,5,7,10,15,20,25,30].filter(y=>y<=Y)
    return pts.map(yr=>({
      year:`${yr}χρ`,
      Σταθερό:Math.round(monthly*yr*12 - LA*(yr/Y)),
      Κυμαινόμενο:Math.round(varMonthly*yr*12 - LA*(yr/Y)),
    }))
  },[monthly,varMonthly,LA,Y])

  // Notify parent
  useMemo(()=>{
    onStateChange?.({loanType,borrowerType:borrower,loanAmount:LA,years:Y,rateType,effectiveRate:effRate,monthly,totalInterest:totalInt,propertyValue:PV,sqm:SQM,propType,area})
    setAdvisorSync(true)
    setTimeout(()=>setAdvisorSync(false),1200)
    if(LA>0&&Y>0&&effRate>0){
      if(historyTimer.current) clearTimeout(historyTimer.current)
      historyTimer.current = setTimeout(()=>{
        setHistory(h=>[{id:Date.now().toString(),ts:new Date().toLocaleTimeString('el-GR',{hour:'2-digit',minute:'2-digit'}),loanType,amount:LA,rate:effRate,years:Y,monthly},...h].slice(0,5))
      },800)
    }
  },[loanType,borrower,LA,Y,rateType,effRate,monthly,totalInt,PV])

  const bankName = bankId==='custom'?customBank:BANKS.find(b=>b.id===bankId)?.name||''
  const areaLabel = AREA_OPTIONS.find(a=>a.value===area)?.label||''
  const propTypeLabel = PROPERTY_TYPES.find(p=>p.value===propType)?.label||''

  function applyPreset(p:typeof PRESETS[0]){
    setLoanAmount(p.values.loanAmount); setPropValue(p.values.propValue)
    setSqm(p.values.sqm); setRate(p.values.rate); setYears(p.values.years)
    setRateType(p.values.rateType); setLoanType(p.values.loanType)
    setBorrower(p.values.borrower); setFixedPeriod(p.values.fixedPeriod)
    setPropType(p.values.propType); setArea(p.values.area)
    setActivePreset(p.id)
  }

  function addScen(){setScenarios(s=>[...s,{id:Date.now().toString(),label:`Σενάριο ${s.length+1}`,amount:LA,rate:effRate,years:Y,rateType}])}
  function updScen(id:string,f:string,v:any){setScenarios(s=>s.map(x=>x.id===id?{...x,[f]:v}:x))}
  function delScen(id:string){setScenarios(s=>s.filter(x=>x.id!==id))}
  function applyScen(s:LoanScenario){setLoanAmount(String(s.amount));setRate(String(s.rateType==='variable'?s.rate-market.euribor_3m:s.rate));setYears(String(s.years));setRateType(s.rateType);setActivePreset(null)}
  function applyHist(h:CalcHistory){setLoanAmount(String(h.amount));setRate(String(h.rate));setYears(String(h.years));setLoanType(h.loanType);setActivePreset(null)}

  async function handleSave(){
    setSaving(true)
    await onSaveLoan({bank:bankName||'Μη καθορισμένη',loan_type:loanType,amount:LA,property_value:PV,rate:effRate,rate_type:rateType,years:Y,start_date:startDate,status:'active',notes:`${propTypeLabel} ${SQM}τμ, ${areaLabel}${notes?` — ${notes}`:''}`})
    setSaving(false)
  }

  const btn=(clr:string,bg:string,border:string):React.CSSProperties=>({
    display:'flex',alignItems:'center',gap:7,padding:'10px 18px',
    background:bg,border:`1px solid ${border}`,borderRadius:10,
    cursor:'pointer',color:clr,fontSize:12,fontFamily:'Inter,sans-serif',fontWeight:700,
    transition:'all 0.15s',whiteSpace:'nowrap' as const,
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Sticky summary bar ── */}
      <div style={{ position:'sticky', top:0, zIndex:50, background:'var(--bg-base)', borderBottom:'1px solid var(--border-subtle)', padding:'10px 0', marginBottom:2 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {[
            {l:'Δόση/μήνα',v:fmtEur(monthly),c:'var(--accent)',big:true},
            {l:'Τόκοι',v:fmtEur(totalInt),c:'var(--negative)',big:false},
            {l:'Σύνολο αποπλ.',v:fmtEur(total),c:'var(--text-primary)',big:false},
            {l:'LTV',v:`${ltv.toFixed(1)}%`,c:ltv>80?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)',big:false},
            {l:'€/τμ',v:sqmPrice>0?fmtEur(sqmPrice):'—',c:'var(--text-secondary)',big:false},
          ].map(item=>(
            <div key={item.l} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
              <span style={{ fontSize:9, color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{item.l}</span>
              <span style={{ fontSize:item.big?15:13, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700 }}>{item.v}</span>
            </div>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:advisorSync?'rgba(167,139,250,0.1)':'transparent', border:`1px solid ${advisorSync?'rgba(167,139,250,0.3)':'transparent'}`, borderRadius:7, transition:'all 0.3s' }}>
            <span style={{ fontSize:10, color:advisorSync?'#a78bfa':'var(--border-default)', fontWeight:600, transition:'color 0.3s' }}>{advisorSync?'⚡ Advisor ενημερώθηκε':'⚡ Advisor'}</span>
          </div>
        </div>
      </div>

      {/* ── Quick Presets ── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
        {dot('Γρήγορα Προφίλ', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>Κλικ για αυτόματη συμπλήρωση</span>)}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>applyPreset(p)} style={{ padding:'12px 14px', background:activePreset===p.id?p.color:'var(--bg-surface)', border:`1px solid ${activePreset===p.id?p.border:'var(--border-subtle)'}`, borderRadius:10, cursor:'pointer', textAlign:'left' as const, transition:'all 0.2s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{p.emoji}</span>
                <p style={{ fontSize:12, color:activePreset===p.id?p.textColor:'var(--text-primary)', fontWeight:700 }}>{p.label}</p>
                {activePreset===p.id&&<Check size={12} color={p.textColor}/>}
              </div>
              <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.4 }}>{p.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Property + Loan type ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Στοιχεία Ακινήτου')}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <CustomSelect label="Τύπος Ακινήτου" value={propType} onChange={v=>{setPropType(v);setActivePreset(null)}} options={PROP_TYPE_OPTIONS}/>
            <CustomSelect label="Περιοχή" value={area} onChange={v=>{setArea(v);setActivePreset(null)}} options={AREA_OPTIONS}/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <NumberInput label="Τιμή Αγοράς (€)" value={propValue} onChange={v=>{setPropValue(v);setActivePreset(null)}} suffix="€"/>
              <NumberInput label="Εμβαδόν (τ.μ.)" value={sqm} onChange={v=>{setSqm(v);setActivePreset(null)}} suffix="τμ"/>
            </div>
            {sqmPrice>0&&(
              <div style={{ padding:'8px 12px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8, display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:11, color:'var(--text-secondary)' }}>Τιμή ανά τ.μ.</span>
                <span style={{ fontSize:12, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700 }}>{fmtEur(sqmPrice)}/τμ</span>
              </div>
            )}
            {/* Property type specific notes */}
            {isNewBuilding&&(
              <div style={{ padding:'9px 12px', background:'rgba(251,146,60,0.06)', border:'1px solid rgba(251,146,60,0.2)', borderRadius:8 }}>
                <p style={{ fontSize:11, color:'var(--warning)' }}>⚠ Νεόδμητο: ΦΠΑ 24% ({fmtEur(vatOwed)}) αντί ΦΜΑ — ελέγξτε με νομικό</p>
              </div>
            )}
            {isCommercial&&(
              <div style={{ padding:'9px 12px', background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.15)', borderRadius:8 }}>
                <p style={{ fontSize:11, color:'var(--info)' }}>ℹ Επαγγελματικό: ΦΜΑ 3% + Τέλη χαρτοσήμου 3.6% αν εκμισθωθεί</p>
              </div>
            )}
            {/* Agent fee toggle */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={()=>setHasAgent(h=>!h)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', background:hasAgent?'var(--accent-dim)':'var(--bg-surface)', border:`1px solid ${hasAgent?'var(--border-accent)':'var(--border-subtle)'}`, borderRadius:8, cursor:'pointer', color:hasAgent?'var(--accent)':'var(--text-secondary)', fontSize:11, fontWeight:600 }}>
                {hasAgent?<Check size={11}/>:<Plus size={11}/>} Αμοιβή Μεσίτη
              </button>
              {hasAgent&&<div style={{ flex:1 }}><NumberInput label="Ποσοστό (%)" value={agentPct} onChange={setAgentPct} suffix="%" step={0.5}/></div>}
              {hasAgent&&<span style={{ fontSize:11, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)' }}>{fmtEur(AGNT)}</span>}
            </div>
          </div>
        </div>

        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Σκοπός & Δανειολήπτης')}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <CustomSelect label="Σκοπός Δανείου" value={loanType} onChange={v=>{setLoanType(v as LoanType);setActivePreset(null)}} options={LOAN_TYPE_OPTIONS}/>
            <div style={{ padding:'8px 12px', background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:8 }}>
              <p style={{ fontSize:11, color:'var(--accent)', lineHeight:1.5 }}>⚖️ {LOAN_TYPES[loanType].tax_note}</p>
            </div>
            <CustomSelect label="Τύπος Δανειολήπτη" value={borrower} onChange={v=>{setBorrower(v as BorrowerType);setActivePreset(null)}} options={BORROWER_OPTIONS}/>
            <div style={{ padding:'8px 12px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:8 }}>
              <p style={{ fontSize:11, color:'var(--text-secondary)', lineHeight:1.5 }}>💡 {BORROWER_PROFILES[borrower].tax_benefits}</p>
            </div>
            {BORROWER_PROFILES[borrower].special&&<div style={{ padding:'7px 12px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', borderRadius:8 }}><p style={{ fontSize:11, color:'var(--positive)' }}>⭐ {BORROWER_PROFILES[borrower].special}</p></div>}
          </div>
        </div>
      </div>

      {/* ── Loan params ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Στοιχεία Δανείου')}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <NumberInput label="Ποσό Δανείου (€)" value={loanAmount} onChange={v=>{setLoanAmount(v);setActivePreset(null)}} suffix="€"/>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                <span style={{ fontSize:11, color:ltv>90?'var(--negative)':ltv>80?'var(--warning)':'var(--positive)', fontWeight:600 }}>LTV {ltv.toFixed(1)}% — {ltv>90?'Πολύ υψηλό':ltv>80?'Υψηλό':'Εντός ορίου'}</span>
                <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>Ίδια: {fmtEur(PV-LA)}</span>
              </div>
            </div>
            <NumberInput label="Διάρκεια (χρόνια)" value={years} onChange={v=>{setYears(v);setActivePreset(null)}} suffix="χρ" min={3} max={35}/>
            <DatePicker label="Ημερομηνία Έναρξης" value={startDate} onChange={setStartDate}/>
            <div>
              <CustomSelect label="Τράπεζα" value={bankId} onChange={setBankId} options={BANK_OPTIONS} placeholder="— Επιλέξτε τράπεζα —"/>
              {bankId==='custom'&&<div style={{ marginTop:8 }}><TextInput label="Όνομα τράπεζας" value={customBank} onChange={setCustomBank} placeholder="π.χ. Παγκρήτια Τράπεζα"/></div>}
            </div>
            <Textarea label="Σημειώσεις" value={notes} onChange={setNotes} placeholder="π.χ. 3ος όροφος, άποψη, ανακαινισμένο..." rows={2}/>
          </div>
        </div>

        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Επιτόκιο & Παράμετροι')}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <CustomSelect label="Τύπος Επιτοκίου" value={rateType} onChange={v=>{setRateType(v as RateType);setActivePreset(null)}} options={RATE_TYPE_OPTIONS}/>
            {(rateType==='fixed'||rateType==='mixed')&&<CustomSelect label="Διάρκεια Σταθερής Περιόδου" value={fixedPeriod} onChange={setFixedPeriod} options={FIXED_PERIOD_OPTIONS}/>}
            <div>
              <NumberInput label={rateType==='variable'?'Spread Τράπεζας (%)':'Ετήσιο Επιτόκιο (%)'} value={rate} onChange={v=>{setRate(v);setActivePreset(null)}} suffix="%" step={0.05}/>
              {rateType==='variable'&&(
                <div style={{ marginTop:7, padding:'9px 12px', background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.18)', borderRadius:8 }}>
                  <p style={{ fontSize:11, fontFamily:'JetBrains Mono, monospace', color:'var(--info)' }}>Euribor {fmtPct(market.euribor_3m)} + {fmtPct(R)} = <strong>{fmtPct(effRate)}</strong></p>
                  <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:3 }}>Αυτόματη ενημέρωση από ECB κάθε πρωί</p>
                </div>
              )}
            </div>
            <div>
              <NumberInput label="Έκτακτη Μηνιαία Πληρωμή (€)" value={extraPay} onChange={setExtraPay} suffix="€" placeholder="0"/>
              {extraSav&&EP>0&&(
                <div style={{ marginTop:6, padding:'9px 12px', background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.18)', borderRadius:8 }}>
                  <p style={{ fontSize:11, color:'var(--positive)', fontWeight:600 }}>Εξοικονομείτε {Math.round(extraSav.savedMonths/12)} χρόνια & {fmtEur(extraSav.savedInt)} τόκους</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        <KPI label="Μηνιαία Δόση" value={fmtEur(monthly)} color="var(--accent)"/>
        <KPI label="Σύνολο Τόκων" value={fmtEur(totalInt)} color="var(--negative)" sub={`${((totalInt/Math.max(LA,1))*100).toFixed(0)}% επί κεφαλαίου`}/>
        <KPI label="Συνολική Αποπληρωμή" value={fmtEur(total)}/>
        <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv>80?'var(--negative)':ltv>70?'var(--warning)':'var(--positive)'} sub={`Ίδια: ${fmtEur(PV-LA)}`}/>
      </div>

      {/* ── Actions ── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={handleSave} disabled={saving} style={btn('var(--accent)','var(--accent-dim)','var(--border-accent)')}><Save size={13}/>{saving?'Αποθήκευση...':'Αποθήκευση Δανείου'}</button>
        <button onClick={()=>onSaveToCalendar(monthly,Y,startDate,bankName)} style={btn('var(--info)','rgba(96,165,250,0.08)','rgba(96,165,250,0.25)')}><Calendar size={13}/>Δόσεις → Ημερολόγιο</button>
        <button onClick={()=>onSaveToExpenses(monthly,bankName)} style={btn('var(--positive)','rgba(52,211,153,0.08)','rgba(52,211,153,0.25)')}><ArrowRight size={13}/>Δόση → Δαπάνες</button>
        <button onClick={addScen} style={btn('#a78bfa','rgba(167,139,250,0.08)','rgba(167,139,250,0.25)')}><Plus size={13}/>Προσθήκη Σεναρίου</button>
      </div>

      {/* ── History ── */}
      {history.length>0&&(
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:14 }}>
          {dot('Ιστορικό Υπολογισμών', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>Κλικ για επαναφορά</span>)}
          <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
            {history.map((h,i)=>(
              <button key={h.id} onClick={()=>applyHist(h)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:i===0?'var(--bg-surface)':'transparent', border:'1px solid var(--border-subtle)', borderRadius:8, cursor:'pointer', textAlign:'left' as const }}>
                <Clock size={10} color="var(--text-tertiary)"/>
                <div>
                  <p style={{ fontSize:11, color:'var(--text-primary)', fontWeight:600 }}>{fmtEur(h.monthly)}/μήνα</p>
                  <p style={{ fontSize:9, color:'var(--text-tertiary)' }}>{fmtEur(h.amount)} · {fmtPct(h.rate)} · {h.years}χρ · {h.ts}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Scenarios ── */}
      {scenarios.length>0&&(
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
          {dot('Σύγκριση Σεναρίων', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>✏️ επεξεργασία · ↩ εφαρμογή</span>)}
          <div style={{ overflowX:'auto', marginBottom:16 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>{['Σενάριο','Ποσό','Επιτόκιο','Χρόνια','Δόση/μήνα','Σύν. Τόκοι','Διαφορά',''].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', fontWeight:600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {scenarios.map(s=>{
                  const m=calcMonthly(s.amount,s.rate,s.years),ti=m*s.years*12-s.amount,saved=totalInt-ti
                  const isBest=scenarios.length>1&&saved===Math.max(...scenarios.map(x=>{const mx=calcMonthly(x.amount,x.rate,x.years);return totalInt-(mx*x.years*12-x.amount)}))
                  const isEd=editingId===s.id
                  const cell=(v:string,f:string,w:number)=><input value={v} onChange={e=>updScen(s.id,f,f==='label'?e.target.value:Number(e.target.value))} style={{ background:'var(--bg-base)',border:'1px solid var(--accent)',borderRadius:6,padding:'5px 8px',color:'var(--text-primary)',fontSize:12,outline:'none',width:w }} type={f==='label'?'text':'number'} step={f==='rate'?0.05:1}/>
                  return(
                    <tr key={s.id} style={{ borderBottom:'1px solid var(--border-subtle)', background:isBest?'rgba(52,211,153,0.04)':'transparent' }}>
                      <td style={{ padding:'9px 10px' }}>{isEd?cell(s.label,'label',120):<div style={{ display:'flex',alignItems:'center',gap:7 }}><span style={{ color:'var(--text-primary)',fontWeight:500 }}>{s.label}</span>{isBest&&<span style={{ fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(52,211,153,0.12)',color:'var(--positive)',border:'1px solid rgba(52,211,153,0.2)',fontWeight:700 }}>ΒΕΛΤΙΣΤΟ</span>}</div>}</td>
                      <td style={{ padding:'9px 10px' }}>{isEd?cell(String(s.amount),'amount',90):<span style={{ fontFamily:'JetBrains Mono, monospace',color:'var(--accent)',fontWeight:600 }}>{fmtEur(s.amount)}</span>}</td>
                      <td style={{ padding:'9px 10px' }}>{isEd?cell(String(s.rate),'rate',65):<span style={{ fontFamily:'JetBrains Mono, monospace',color:'var(--info)' }}>{fmtPct(s.rate)}</span>}</td>
                      <td style={{ padding:'9px 10px' }}>{isEd?cell(String(s.years),'years',55):<span style={{ color:'var(--text-secondary)' }}>{s.years} χρ</span>}</td>
                      <td style={{ padding:'9px 10px',fontFamily:'JetBrains Mono, monospace',color:'var(--positive)',fontWeight:600 }}>{fmtEur(m)}</td>
                      <td style={{ padding:'9px 10px',fontFamily:'JetBrains Mono, monospace',color:'var(--negative)' }}>{fmtEur(ti)}</td>
                      <td style={{ padding:'9px 10px',fontFamily:'JetBrains Mono, monospace',color:saved>0?'var(--positive)':'var(--negative)',fontWeight:600 }}>{saved>0?`-${fmtEur(saved)}`:`+${fmtEur(-saved)}`}</td>
                      <td style={{ padding:'9px 10px' }}>
                        <div style={{ display:'flex',gap:3,alignItems:'center' }}>
                          {isEd?<button onClick={()=>setEditingId(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--positive)',display:'flex',padding:4 }}><Check size={14}/></button>
                           :<><button onClick={()=>setEditingId(s.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-secondary)',display:'flex',padding:4 }}><Edit2 size={12}/></button>
                            <button onClick={()=>applyScen(s)} style={{ background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:5,cursor:'pointer',color:'var(--accent)',display:'flex',alignItems:'center',gap:3,padding:'3px 7px',fontSize:10,fontWeight:700 }} title="Εφαρμογή στον Calculator"><RefreshCw size={10}/>Εφαρμογή</button></>}
                          <button onClick={()=>delScen(s.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--border-default)',display:'flex',padding:4 }}><Trash2 size={12}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {scenChart.length>0&&(
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={scenChart} barCategoryGap="30%">
                <XAxis dataKey="name" tick={{ fontSize:10,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
                <Tooltip content={<ChartTip/>}/><Bar dataKey="Τόκοι" fill="rgba(248,113,113,0.6)" radius={[5,5,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Collapsibles ── */}
      <Section title="Γράφημα Αποπληρωμής" sub="Κεφάλαιο έναντι τόκων ανά έτος" defaultOpen>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={amortChart} barCategoryGap="12%">
            <XAxis dataKey="year" tick={{ fontSize:9,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={<ChartTip/>}/><Legend wrapperStyle={{ fontSize:11,color:'var(--text-secondary)' }}/>
            <Bar dataKey="Κεφάλαιο" stackId="a" fill="rgba(52,211,153,0.55)"/>
            <Bar dataKey="Τόκοι"    stackId="a" fill="rgba(248,113,113,0.5)" radius={[5,5,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Section>

      <Section title="Σταθερό vs Κυμαινόμενο — Σύγκριση" sub="Ανάλυση κόστους και κινδύνου σε πραγματικό χρόνο" badge="LIVE">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          {[
            { label:'Σταθερό Επιτόκιο', rate:effRate, m:monthly, pros:['Γνωστή δόση — σχεδιασμός χωρίς εκπλήξεις','Προστασία από άνοδο Euribor','Ιδανικό αν Euribor αναμένεται να ανέβει'], cons:['Αρχικά υψηλότερο επιτόκιο','Ποινή πρόωρης αποπληρωμής (σταθερή περίοδο)'], c:'var(--positive)', bg:'rgba(52,211,153,0.04)', border:'rgba(52,211,153,0.15)' },
            { label:'Κυμαινόμενο Επιτόκιο', rate:market.euribor_3m+R, m:varMonthly, pros:['Σήμερα χαμηλότερο κόστος','Ωφελείσαι αν Euribor συνεχίσει να πέφτει','Χωρίς ποινή πρόωρης αποπληρωμής'], cons:['Κίνδυνος ανόδου Euribor','Αβεβαιότητα δόσης'], c:'var(--info)', bg:'rgba(96,165,250,0.04)', border:'rgba(96,165,250,0.15)' },
          ].map(item=>(
            <div key={item.label} style={{ background:item.bg, border:`1px solid ${item.border}`, borderRadius:10, padding:14 }}>
              <p style={{ fontSize:12, color:item.c, fontWeight:700, marginBottom:12 }}>{item.label}</p>
              <div style={{ display:'flex', gap:16, marginBottom:12 }}>
                <div><p style={{ fontSize:9, color:'var(--text-tertiary)', marginBottom:2 }}>Επιτόκιο</p><p style={{ fontSize:18, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700 }}>{fmtPct(item.rate)}</p></div>
                <div><p style={{ fontSize:9, color:'var(--text-tertiary)', marginBottom:2 }}>Δόση/μήνα</p><p style={{ fontSize:18, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700 }}>{fmtEur(item.m)}</p></div>
                <div><p style={{ fontSize:9, color:'var(--text-tertiary)', marginBottom:2 }}>Σύν. Τόκοι</p><p style={{ fontSize:14, fontFamily:'JetBrains Mono, monospace', color:item.c, fontWeight:700 }}>{fmtEur(item.m*Y*12-LA)}</p></div>
              </div>
              {item.pros.map((p,i)=><div key={i} style={{ display:'flex',gap:6,marginBottom:3 }}><span style={{ color:'var(--positive)',flexShrink:0 }}>✓</span><p style={{ fontSize:10,color:'var(--text-secondary)',lineHeight:1.4 }}>{p}</p></div>)}
              {item.cons.map((c,i)=><div key={i} style={{ display:'flex',gap:6,marginBottom:3 }}><span style={{ color:'var(--negative)',flexShrink:0 }}>✗</span><p style={{ fontSize:10,color:'var(--text-secondary)',lineHeight:1.4 }}>{c}</p></div>)}
            </div>
          ))}
        </div>
        <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Σωρευτικοί Τόκοι ανά Χρόνο</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={fvChartData}>
            <XAxis dataKey="year" tick={{ fontSize:9,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false}/>
            <Tooltip content={<ChartTip/>}/><Legend wrapperStyle={{ fontSize:11,color:'var(--text-secondary)' }}/>
            <Line type="monotone" dataKey="Σταθερό"      stroke="rgba(52,211,153,0.8)"  strokeWidth={2} dot={false}/>
            <Line type="monotone" dataKey="Κυμαινόμενο" stroke="rgba(96,165,250,0.8)"  strokeWidth={2} dot={false} strokeDasharray="4 2"/>
          </LineChart>
        </ResponsiveContainer>
        <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:10, lineHeight:1.6 }}>ⓘ Σύγκριση βάσει τρέχοντος Euribor {fmtPct(market.euribor_3m)}. Το κυμαινόμενο υποθέτει σταθερό Euribor — χρησιμοποιήστε το Stress Test για σενάρια ανόδου.</p>
      </Section>

      <Section title="Σπίτι μου ΙΙ vs Κανονικό Δάνειο" sub="Εκτίμηση εξοικονόμησης — deadline 31/08/2026">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          {[
            { label:'🏠 Σπίτι μου ΙΙ (εκτίμηση)', rate:spitiR, m:spitiM, ti:spitiM*Y*12-LA, c:'var(--positive)', bg:'rgba(52,211,153,0.04)', border:'rgba(52,211,153,0.15)' },
            { label:'📊 Κανονικό Δάνειο', rate:effRate, m:monthly, ti:totalInt, c:'var(--negative)', bg:'rgba(248,113,113,0.04)', border:'rgba(248,113,113,0.15)' },
          ].map(item=>(
            <div key={item.label} style={{ background:item.bg, border:`1px solid ${item.border}`, borderRadius:10, padding:14 }}>
              <p style={{ fontSize:12, color:item.c, fontWeight:700, marginBottom:12 }}>{item.label}</p>
              {[['Επιτόκιο',fmtPct(item.rate)],['Δόση/μήνα',fmtEur(item.m)],['Σύν. τόκοι',fmtEur(item.ti)],['Σύνολο',fmtEur(item.m*Y*12)]].map(([k,v])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}>
                  <span style={{ fontSize:11,color:'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontSize:12,fontFamily:'JetBrains Mono, monospace',color:item.c,fontWeight:600 }}>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ background:'var(--accent-dim)', border:'1px solid var(--border-accent)', borderRadius:10, padding:'14px 18px', textAlign:'center' as const }}>
          <p style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:4 }}>Εκτιμώμενη συνολική εξοικονόμηση</p>
          <p style={{ fontSize:32, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700 }}>{fmtEur(spitiSv)}</p>
          <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:6 }}>= {fmtEur(spitiSv/Math.max(Y*12,1))}/μήνα εξοικονόμηση στη δόση</p>
        </div>
        <p style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:10, lineHeight:1.6 }}>ⓘ Εκτίμηση βάσει μέσου επιδοτούμενου επιτοκίου. Ισχύει για ηλικία 25-50, πρώτη κατοικία, εισόδημα ≤40.000€, αξία ≤250.000€. → <a href="https://greece20.gov.gr/home-loans/" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>greece20.gov.gr</a></p>
      </Section>

      <Section title="Δανειοληπτική Ικανότητα & DTI" sub="Μέγιστο δάνειο βάσει εισοδήματος">
        <div style={{ marginBottom:12 }}><NumberInput label="Μηνιαίο Καθαρό Εισόδημα (€)" value={income} onChange={setIncome} suffix="€"/></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          <KPI label="Μέγιστη δόση/μήνα" value={fmtEur(INC*BORROWER_PROFILES[borrower].income_ratio)} color="var(--accent)" sub={`${(BORROWER_PROFILES[borrower].income_ratio*100).toFixed(0)}% εισοδήματος`}/>
          <KPI label="Μέγιστο δάνειο" value={fmtEur(maxLoan)} color={maxLoan>=LA?'var(--positive)':'var(--negative)'}/>
          <KPI label="DTI Ratio" value={monthly>0?fmtPct1((monthly/INC)*100):'—'} color={(monthly/INC)>0.4?'var(--negative)':(monthly/INC)>0.35?'var(--warning)':'var(--positive)'} sub="Δόση / Εισόδημα"/>
        </div>
        {maxLoan<LA&&<div style={{ marginTop:10,padding:'10px 14px',background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:8 }}><p style={{ fontSize:12,color:'var(--negative)' }}>⚠ Υπέρβαση κατά {fmtEur(LA-maxLoan)} — μειώστε ποσό ή αυξήστε διάρκεια</p></div>}
      </Section>

      <Section title="Φορολογική Ανάλυση" sub={`ΦΜΑ, απαλλαγές, ${isNewBuilding?'ΦΠΑ':isCommercial?'χαρτόσημο':''} ενοίκια — ΑΑΔΕ 2026`}>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
            <p style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, fontWeight:600 }}>
              {isNewBuilding?'Φόρος Προστιθέμενης Αξίας (ΦΠΑ 24%)':isCommercial?'Φόρος Μεταβίβασης (ΦΜΑ 3%) + Χαρτόσημο':'Φόρος Μεταβίβασης Ακινήτων (ΦΜΑ 3%)'}
            </p>
            {!isNewBuilding&&(
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <CustomSelect label="Οικογενειακή Κατάσταση" value={marital} onChange={v=>setMarital(v as any)} options={MARITAL_OPTIONS}/>
                <CustomSelect label="Αριθμός Εξαρτώμενων Τέκνων" value={children} onChange={setChildren} options={CHILDREN_OPTIONS}/>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
              {isNewBuilding?(
                <>
                  <KPI label="ΦΠΑ 24%" value={fmtEur(vatOwed)} color="var(--negative)" sub="Αντί ΦΜΑ"/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color="var(--text-primary)"/>
                  <KPI label="Αρχιτεκτονική τιμή" value={fmtEur(PV-vatOwed)} color="var(--text-secondary)" sub="Πριν ΦΠΑ"/>
                </>
              ):(
                <>
                  <KPI label={isCommercial?'ΦΜΑ 3%':'Όριο απαλλαγής ΦΜΑ'} value={isCommercial?fmtEur(fmaOwed):fmtEur(fmaEx)} color={isCommercial?'var(--negative)':'var(--positive)'} sub={isCommercial?'Χωρίς απαλλαγή':'ΑΑΔΕ 2026'}/>
                  <KPI label="ΦΜΑ που αναλογεί" value={fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed)} color={fmaOwed===0?'var(--positive)':'var(--negative)'} sub={fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας'}/>
                  <KPI label="Αξία ακινήτου" value={fmtEur(PV)} color={(!isCommercial&&PV<=fmaEx)?'var(--positive)':'var(--warning)'} sub={(!isCommercial&&PV<=fmaEx)?'Εντός ορίου':'Εκτός ορίου'}/>
                </>
              )}
            </div>
            {loanType==='first_home'&&PV<=fmaEx&&!isNewBuilding&&!isCommercial&&<div style={{ padding:'10px 14px',background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',borderRadius:8 }}><p style={{ fontSize:12,color:'var(--positive)',fontWeight:600 }}>✓ Δικαιούστε πλήρη απαλλαγή ΦΜΑ — εξοικονόμηση {fmtEur(PV*0.03)}</p></div>}
          </div>
          {loanType==='investment'&&(
            <div style={{ padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
              <p style={{ fontSize:10, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12, fontWeight:600 }}>Κλίμακα Ενοικίων 2026</p>
              {TAX_DATA.rental_tax.map((b,i)=>(
                <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:8,marginBottom:5 }}>
                  <span style={{ fontSize:12,color:'var(--text-secondary)' }}>{b.label}</span>
                  <span style={{ fontSize:14,fontFamily:'JetBrains Mono, monospace',color:'var(--accent)',fontWeight:700 }}>{(b.rate*100).toFixed(0)}%</span>
                </div>
              ))}
              <div style={{ marginTop:10,padding:'9px 12px',background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8 }}>
                <p style={{ fontSize:11,color:'var(--accent)' }}>Αυτόματη έκπτωση 5% · Εκτ. φόρος: {fmtEur(renTax)}/χρόνο</p>
              </div>
            </div>
          )}
          <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.6 }}>ⓘ Βάσει ΑΑΔΕ & Ν.4172/2013. Τόκοι δεν εκπίπτουν για δάνεια μετά το 2013. → <a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>aade.gr</a></p>
        </div>
      </Section>

      <Section title="Stress Test Επιτοκίου" sub="Αντοχή δόσης σε σενάρια ανόδου Euribor">
        <div style={{ marginBottom:14 }}>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stress.map(s=>({name:s.label,Δόση:Math.round(s.monthly)}))} barCategoryGap="22%">
              <XAxis dataKey="name" tick={{ fontSize:10,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>fmtEur(v)} tick={{ fontSize:9,fill:'var(--text-secondary)' }} axisLine={false} tickLine={false} width={72}/>
              <Tooltip content={<ChartTip/>}/>
              <ReferenceLine y={INC*BORROWER_PROFILES[borrower].income_ratio} stroke="var(--warning)" strokeDasharray="4 4" label={{ value:'Όριο DTI 35%', fill:'var(--warning)', fontSize:9 }}/>
              <Bar dataKey="Δόση" fill="var(--accent)" radius={[5,5,0,0]} opacity={0.75}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>{['Σενάριο','Επιτόκιο','Δόση/μήνα','Αύξηση/μήνα','DTI'].map(h=><th key={h} style={{ padding:'7px 10px',textAlign:'left',fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',fontWeight:600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {stress.map((s,i)=>{
              const diff=s.monthly-stress[0].monthly, dti=(s.monthly/INC)*100
              return <tr key={i} style={{ borderBottom:'1px solid var(--border-subtle)',background:i===0?'var(--accent-dim)':'transparent' }}>
                <td style={{ padding:'8px 10px',color:i===0?'var(--accent)':'var(--text-primary)',fontWeight:i===0?700:400 }}>{s.label}</td>
                <td style={{ padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:'var(--info)' }}>{fmtPct(s.rate)}</td>
                <td style={{ padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'var(--accent)':diff>500?'var(--negative)':diff>250?'var(--warning)':'var(--text-primary)',fontWeight:600 }}>{fmtEur(s.monthly)}</td>
                <td style={{ padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:i===0?'var(--text-tertiary)':'var(--negative)' }}>{i===0?'—':`+${fmtEur(diff)}`}</td>
                <td style={{ padding:'8px 10px',fontFamily:'JetBrains Mono, monospace',color:dti>40?'var(--negative)':dti>35?'var(--warning)':'var(--positive)',fontWeight:600 }}>{fmtPct1(dti)}</td>
              </tr>
            })}
          </tbody>
        </table>
        {rateType==='fixed'&&<div style={{ marginTop:10,padding:'9px 12px',background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',borderRadius:8 }}><p style={{ fontSize:12,color:'var(--positive)',fontWeight:600 }}>✓ Σταθερό {fixedPeriod} χρόνια — προστατευμένοι από ανατιμήσεις Euribor</p></div>}
      </Section>

      <Section title="Ανάλυση Αναχρηματοδότησης" sub="Break-even — πότε αξίζει η μεταφορά σε άλλη τράπεζα">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
          <NumberInput label="Υπόλοιπο (€)" value={remBal} onChange={setRemBal} suffix="€"/>
          <NumberInput label="Χρόνια που μένουν" value={remYears} onChange={setRemYears} suffix="χρ"/>
          <NumberInput label="Νέο επιτόκιο (%)" value={newRate} onChange={setNewRate} suffix="%" step={0.05}/>
          <NumberInput label="Κόστος μεταφοράς (€)" value={xferCost} onChange={setXferCost} suffix="€"/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          <KPI label="Τρέχουσα δόση" value={fmtEur(currM)} color="var(--negative)"/>
          <KPI label="Νέα δόση" value={fmtEur(newM)} color="var(--positive)" sub={`${fmtEur(mSav)}/μήνα`}/>
          <KPI label="Καθαρή εξοικονόμηση" value={fmtEur(Math.max(0,refSav))} color={refSav>0?'var(--accent)':'var(--negative)'} sub={refSav>0?'Αξίζει':'Δεν συμφέρει ακόμα'}/>
          <KPI label="Break-even" value={brkEven?`${brkEven} μήνες`:'—'} color={brkEven&&brkEven<24?'var(--positive)':brkEven&&brkEven<48?'var(--warning)':'var(--negative)'} sub="Αποσβέσεως εξόδων"/>
        </div>
      </Section>

      <Section title="Πίνακας Αποπληρωμής" sub={`${Y*12} δόσεις αναλυτικά`}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>{['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο','Σύν. Τόκοι'].map(h=><th key={h} style={{ padding:'7px 10px',textAlign:'right',fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',fontWeight:600 }}>{h}</th>)}</tr></thead>
            <tbody>
              {amort.slice(0,24).map(row=>(
                <tr key={row.month} style={{ borderBottom:'1px solid var(--border-subtle)' }}>
                  <td style={{ padding:'6px 10px',textAlign:'right',color:'var(--text-tertiary)',fontFamily:'JetBrains Mono, monospace' }}>{row.month}</td>
                  <td style={{ padding:'6px 10px',textAlign:'right',color:'var(--accent)',fontFamily:'JetBrains Mono, monospace',fontWeight:600 }}>{fmtEur(row.payment)}</td>
                  <td style={{ padding:'6px 10px',textAlign:'right',color:'var(--positive)',fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.principal)}</td>
                  <td style={{ padding:'6px 10px',textAlign:'right',color:'var(--negative)',fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.interest)}</td>
                  <td style={{ padding:'6px 10px',textAlign:'right',fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.balance)}</td>
                  <td style={{ padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontFamily:'JetBrains Mono, monospace' }}>{fmtEur(row.totalInterestPaid)}</td>
                </tr>
              ))}
              {amort.length>24&&<tr><td colSpan={6} style={{ padding:10,textAlign:'center',color:'var(--text-tertiary)',fontSize:11 }}>... {amort.length-24} ακόμα δόσεις</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Απαραίτητα Έγγραφα" sub={`${LOAN_TYPES[loanType].label} · ${propTypeLabel}`}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Γενικά</p>
            {LOAN_TYPES[loanType].docs.map((d,i)=><div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}><FileText size={12} color="var(--accent)"/><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{d}</span></div>)}
            {isNewBuilding&&<div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}><FileText size={12} color="var(--warning)"/><span style={{ fontSize:12,color:'var(--warning)' }}>Άδεια οικοδομής + ΦΠΑ βεβαίωση</span></div>}
          </div>
          <div>
            <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10, fontWeight:600 }}>Ανά Δανειολήπτη</p>
            {borrower==='professional'&&['Φορολογικές δηλώσεις 2 ετών','Βεβαίωση δραστηριότητας ΔΟΥ'].map((d,i)=><div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{d}</span></div>)}
            {borrower==='company'&&['Καταστατικό','Ισολογισμοί 3 ετών','Απόφαση ΔΣ'].map((d,i)=><div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{d}</span></div>)}
            {borrower==='military'&&['Βεβαίωση υπηρεσίας','Μισθολογική κατάσταση'].map((d,i)=><div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{d}</span></div>)}
            {borrower==='abroad'&&['Αποδεικτικό κατοικίας εξωτερικού','Εισοδήματα ξένης χώρας','Επίσημες μεταφράσεις'].map((d,i)=><div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}><FileText size={12} color="var(--info)"/><span style={{ fontSize:12,color:'var(--text-secondary)' }}>{d}</span></div>)}
            {!['professional','company','military','abroad'].includes(borrower)&&<p style={{ fontSize:12,color:'var(--text-secondary)' }}>Μισθοδοτικές 3 μηνών + Εκκαθαριστικό</p>}
            <div style={{ marginTop:12,padding:'9px 12px',background:'var(--accent-dim)',border:'1px solid var(--border-accent)',borderRadius:8 }}>
              <p style={{ fontSize:11,color:'var(--accent)' }}>💡 {BORROWER_PROFILES[borrower].tax_benefits}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Realistic Cost Summary ── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:16 }}>
        {dot('Πλήρης Ανάλυση Κόστους Απόκτησης', <span style={{ fontSize:10, color:'var(--text-tertiary)' }}>{propTypeLabel} · {SQM>0?`${SQM}τμ · `:''}{areaLabel}</span>)}

        {/* Main cost grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:14 }}>
          {[
            { label:isNewBuilding?'ΦΠΑ 24%':'Φόρος Μεταβίβασης (ΦΜΑ)', value:isNewBuilding?fmtEur(vatOwed):fmaOwed===0?'€0 — Απαλλαγή':fmtEur(fmaOwed), sub:isNewBuilding?'Νεόδμητο ακίνητο':fmaOwed===0?'Πρώτη κατοικία':'3% επί αξίας', hi:false },
            { label:'Συμβολαιογραφικά (αγορά + υποθήκη)', value:fmtEur(totalCosts.notary), sub:'Κλιμακωτή κλίμακα βάσει αξίας', hi:false },
            { label:'Κτηματολόγιο & Εγγραφή υποθήκης', value:fmtEur(totalCosts.landReg), sub:'0.475‰ του ποσού δανείου', hi:false },
            { label:'Δικηγόρος ελέγχου τίτλων', value:fmtEur(totalCosts.legal), sub:'Έλεγχος τίτλων + παρουσία', hi:false },
            { label:'Αμοιβή μεσίτη', value:hasAgent?fmtEur(AGNT):'Δεν υπολογίζεται', sub:hasAgent?`${agentPct}% επί τιμής`:'Ενεργοποιήστε παραπάνω', hi:false },
            { label:'Λοιπά (φόρος ενεγγύησης κλπ)', value:fmtEur(totalCosts.other), sub:'Φόρος ενεγγύησης υποθήκης', hi:false },
            { label:'Σύνολο Εξόδων Αγοράς', value:fmtEur(totalCosts.total), sub:'Εκτός μηνιαίων δόσεων', hi:true },
            { label:'Απαιτούμενα Ίδια Κεφάλαια', value:fmtEur(totalCosts.totalCash), sub:'Προκαταβολή + έξοδα', hi:true },
          ].map((item:any)=>(
            <div key={item.label} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 14px',borderRadius:9,background:item.hi?'var(--accent-dim)':'var(--bg-surface)',border:`1px solid ${item.hi?'var(--border-accent)':'var(--border-subtle)'}` }}>
              <div>
                <p style={{ fontSize:12,color:item.hi?'var(--accent)':'var(--text-primary)',fontWeight:item.hi?700:400 }}>{item.label}</p>
                <p style={{ fontSize:10,color:'var(--text-tertiary)',marginTop:2 }}>{item.sub}</p>
              </div>
              <span style={{ fontSize:13,fontFamily:'JetBrains Mono, monospace',color:item.hi?'var(--accent)':'var(--info)',fontWeight:item.hi?700:400,marginLeft:12,whiteSpace:'nowrap' as const }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Detailed breakdown */}
        <div style={{ padding:'12px 14px', background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:9, marginBottom:10 }}>
          <p style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8, fontWeight:600 }}>Ανάλυση Συμβολαιογραφικών</p>
          {notaryCosts.breakdown.map((line,i)=>(
            <p key={i} style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:3, lineHeight:1.5 }}>· {line}</p>
          ))}
        </div>

        {/* Insurance reminder */}
        <div style={{ padding:'10px 14px', background:'rgba(212,175,66,0.04)', border:'1px solid var(--border-accent)', borderRadius:9, marginBottom:10 }}>
          <p style={{ fontSize:11, color:'var(--accent)' }}>🔑 Ασφάλεια κατοικίας 100-300€/έτος (υποχρεωτική) · Ασφάλεια ζωής ~{fmtEur(LA*0.001)}/έτος (συνήθως απαιτείται)</p>
        </div>

        <p style={{ fontSize:10, color:'var(--text-tertiary)', lineHeight:1.6 }}>
          ⓘ Εκτιμήσεις βάσει δεδομένων χρήστη. Τα τελικά ποσά καθορίζονται από συμβολαιογράφο — ενδέχεται να διαφέρουν. →{' '}
          <a href="https://www.dsanet.gr" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>ΔΣΑ (συμβολαιογραφικά τέλη)</a>
          {' · '}
          <a href="https://www.aade.gr" target="_blank" rel="noreferrer" style={{ color:'var(--info)', textDecoration:'none', fontWeight:600 }}>ΑΑΔΕ</a>
        </p>
      </div>
    </div>
  )
}