'use client'
import { useState } from 'react'
import { NumberInput, CustomSelect, Toggle, InfoChip } from './UIComponents'
import { T, TT, fp, fn, fixedCols } from '@/components/Theme'
import { useDocScan, scanNum, ScanUploadRow, ScanErrorNote } from './LoanDocScan'
import { analyzeEsis, esisVerdictLabel } from '@/lib/loans/esis'

// ═══════════════════════════════════════════════════════════════════════════
// ΑΝΑΛΥΣΗ ΓΡΑΠΤΗΣ ΠΡΟΣΦΟΡΑΣ ΤΡΑΠΕΖΑΣ (ΔΕΛΤΙΟ ESIS)
//
// ΤΙ ΕΣΠΑΣΕ. Το πάνελ αυτό και το LoanDocScan έδειχναν στην ίδια ενότητα δύο
// κουμπιά με το ίδιο εικονίδιο φωτογραφικής και τίτλους που δεν ξεχώριζαν
// («Ανέβασε προσφορά» / «Ανέβασε αρχείο»), οπότε διάβαζαν σαν διπλότυπα. ΔΕΝ
// είναι: εδώ μπαίνει η ΓΡΑΠΤΗ ΠΡΟΣΦΟΡΑ ΤΡΑΠΕΖΑΣ (ΣΕΠΠΕ, έξοδα, ασφάλειες) και
// βγαίνει το πραγματικό κόστος της· εκεί μπαίνουν τα ΣΤΟΙΧΕΙΑ ΤΟΥ ΔΑΝΕΙΟΛΗΠΤΗ
// και βγαίνει κατάταξη τραπεζών. Δεν έχουν κοινό πεδίο εξόδου και δεν γράφουν
// στα ίδια σημεία, γι' αυτό έμειναν δύο εργαλεία με ξεχωριστές ετικέτες και
// ξεχωριστό εικονίδιο. Ό,τι ήταν όντως κοινό (ανέβασμα, σφάλματα, κατάσταση
// φόρτωσης, μετατροπή αριθμού) ζει πλέον μία φορά, στο LoanDocScan.
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Είσαι αναλυτής στεγαστικών δανείων στην Ελλάδα. Σου δίνεται προσφορά τράπεζας ή Τυποποιημένο Ευρωπαϊκό Δελτίο Πληροφοριών (ESIS/ΤΕΔΠ).
Εξήγαγε ΜΟΝΟ ό,τι αναγράφεται. Επίστρεψε ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON, χωρίς κείμενο εκτός JSON, με σχήμα (παρέλειψε όποιο πεδίο δεν προκύπτει):
{
  "amount": number,               // ποσό δανείου σε ευρώ
  "years": number,                // διάρκεια σε έτη
  "nominal_rate": number,         // ονομαστικό επιτόκιο (ΝΕΕ) %
  "aprc": number,                 // ΣΕΠΠΕ / APRC %
  "monthly_payment": number,      // δόση σε ευρώ
  "total_payable": number,        // συνολικό πληρωτέο ποσό σε ευρώ
  "fees": [{"label": string, "amount": number}],  // εφάπαξ έξοδα
  "insurance_monthly": number,    // ασφάλιστρα ανά μήνα σε ευρώ
  "prepayment_penalty": boolean,  // ρήτρα πρόωρης εξόφλησης
  "rate_type": "fixed|variable|mixed",
  "bank": string
}
Οι αριθμοί χωρίς σύμβολα ή τελείες χιλιάδων. Το κόμμα δεκαδικό μετατρέπεται σε τελεία.`

// Ό,τι επιστρέφει το μοντέλο. Οι αριθμοί δηλώνονται και ως κείμενο επειδή έτσι
// έρχονται συχνά («3,40», «200.000 €») και περνούν από το scanNum.
type EsisExtract = {
  amount?: number | string; years?: number | string
  nominal_rate?: number | string; aprc?: number | string
  monthly_payment?: number | string; total_payable?: number | string
  fees?: { label?: string; amount?: number | string }[]
  insurance_monthly?: number | string; prepayment_penalty?: boolean
  rate_type?: string; bank?: string
}

// Τα τρία είδη επιτοκίου ήταν γραμμένα ΤΡΕΙΣ φορές μέσα σε αυτό το αρχείο: στη
// λίστα του μενού, στον έλεγχο της απάντησης του μοντέλου και στον φύλακα τύπου.
// Ένα τέταρτο είδος θα έπρεπε να προστεθεί και στα τρία, αλλιώς το μενού θα το
// έδειχνε και η σάρωση θα το πετούσε σιωπηλά. Γράφονται μία φορά, εδώ.
const RATE_LABELS = { fixed:'Σταθερό', variable:'Κυμαινόμενο', mixed:'Μεικτό' } as const
type RateType = keyof typeof RATE_LABELS
const RATE_TYPES = Object.keys(RATE_LABELS) as RateType[]
const isRateType = (v: unknown): v is RateType => typeof v === 'string' && RATE_TYPES.includes(v as RateType)
const asRateType = (v: string): RateType => isRateType(v) ? v : 'fixed'
const RATE_OPTIONS = RATE_TYPES.map(value => ({ value, label: RATE_LABELS[value] }))

export default function EsisScanPanel({
  defaultAmount, defaultYears, benchmarkAprc, fmtEur,
}:{
  defaultAmount?:number; defaultYears?:number; benchmarkAprc?:number; fmtEur:(n:number)=>string;
}) {
  const font = T.font.sans
  const [ht,setHt] = useState<number|null>(null)
  const [vhE,setVhE] = useState(false)
  const [scanned,setScanned] = useState(false)

  const [amount,setAmount] = useState<string>(defaultAmount && defaultAmount>0 ? String(Math.round(defaultAmount)) : '200000')
  const [years,setYears] = useState<string>(defaultYears && defaultYears>0 ? String(defaultYears) : '25')
  const [nominal,setNominal] = useState<string>('3.4')
  const [aprc,setAprc] = useState<string>('')
  const [monthly,setMonthly] = useState<string>('')
  const [fees,setFees] = useState<string>('550')
  const [insurance,setInsurance] = useState<string>('15')
  const [prepay,setPrepay] = useState<boolean>(false)
  const [rateType,setRateType] = useState<string>('fixed')
  const [bank,setBank] = useState<string>('')

  const { scanning, error, errorText, scanFile } = useDocScan<EsisExtract>({
    system: SYSTEM_PROMPT,
    ask: 'Εξήγαγε τα στοιχεία της προσφοράς και επίστρεψε μόνο το JSON.',
    onStart: () => setScanned(false),
    onResult: p => {
      if (scanNum(p.amount)!=null) setAmount(String(scanNum(p.amount)))
      if (scanNum(p.years)!=null) setYears(String(scanNum(p.years)))
      if (scanNum(p.nominal_rate)!=null) setNominal(String(scanNum(p.nominal_rate)))
      if (scanNum(p.aprc)!=null) setAprc(String(scanNum(p.aprc)))
      if (scanNum(p.monthly_payment)!=null) setMonthly(String(scanNum(p.monthly_payment)))
      if (scanNum(p.insurance_monthly)!=null) setInsurance(String(scanNum(p.insurance_monthly)))
      if (Array.isArray(p.fees)) { const t = p.fees.reduce((s,f)=>s+(scanNum(f?.amount)||0),0); if (t>0) setFees(String(Math.round(t))) }
      if (typeof p.prepayment_penalty==='boolean') setPrepay(p.prepayment_penalty)
      if (isRateType(p.rate_type)) setRateType(p.rate_type)
      if (typeof p.bank==='string') setBank(p.bank)
      setScanned(true)
    },
  })

  const res = analyzeEsis({
    amount:Number(amount)||0, years:Number(years)||1,
    nominalRatePct:Number(nominal)||0, aprcPct:Number(aprc)||undefined,
    monthlyPayment:Number(monthly)||undefined,
    fees:[{ label:'Έξοδα', amount:Number(fees)||0 }],
    insuranceMonthly:Number(insurance)||0, prepaymentPenalty:prepay,
    rateType:asRateType(rateType), bank,
  }, benchmarkAprc!=null ? { benchmarkAprc } : undefined)

  const costTiles = [
    { l:'ΣΕΠΠΕ (πραγματικό)', v:fp(res.aprc), hi:true },
    { l:'Ονομαστικό επιτόκιο', v:fp(res.nominal), hi:false },
    { l:'Δόση', v:fmtEur(res.monthly), hi:false },
    { l:'Σύνολο τόκων', v:fmtEur(res.totalInterest), hi:false },
    { l:'Έξοδα', v:fmtEur(res.totalFees), hi:false },
    { l:'Ασφάλειες (διάρκεια)', v:fmtEur(res.totalInsurance), hi:false },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <ScanUploadRow
        description="Ανέβασε το Τυποποιημένο Ευρωπαϊκό Δελτίο Πληροφοριών (ESIS) ή τη γραπτή προσφορά που σου έδωσε η τράπεζα, ή πληκτρολόγησε τα νούμερα. Το εργαλείο αποκαλύπτει το πραγματικό κόστος αυτής της προσφοράς (ΣΕΠΠΕ) πέρα από το διαφημιζόμενο επιτόκιο."
        action="Ανέβασε δελτίο ESIS"
        scanning={scanning}
        onFile={scanFile}
        icon={<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>}
      />

      <ScanErrorNote error={error} text={errorText} hint="Μπορείς να πληκτρολογήσεις τα νούμερα παρακάτω." />

      {scanned && !scanning && !error && (
        <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:font}}>Τα πεδία συμπληρώθηκαν από την προσφορά. Έλεγξε και διόρθωσε αν χρειάζεται.</p>
      )}

      {/* Στοιχεία προσφοράς — πληκτρολόγηση/διόρθωση (θαμπώνουν όσο τρέχει η ανάλυση AI) */}
      {/* Επτά πεδία, τέσσερα και τρία. Ρητό πλήθος στηλών: με ελεύθερο πλάτος
          στήλης το ίδιο παράθυρο έδινε άλλη διάταξη σε κάθε επίπεδο zoom. */}
      <div {...fixedCols(4, 10)} style={{...fixedCols(4, 10).style,opacity:scanning?0.5:1,pointerEvents:scanning?'none':'auto',transition:'opacity 0.2s'}} aria-busy={scanning}>
        <NumberInput label="Ποσό δανείου" value={amount} onChange={setAmount} suffix="€"/>
        <NumberInput label="Διάρκεια" value={years} onChange={setYears} suffix="έτη"/>
        <NumberInput label="Ονομαστικό επιτόκιο" value={nominal} onChange={setNominal} suffix="%" step={0.1}/>
        <NumberInput label="ΣΕΠΠΕ (APRC)" value={aprc} onChange={setAprc} suffix="%" step={0.1} placeholder="αυτόματο"/>
        <NumberInput label="Έξοδα (σύνολο)" value={fees} onChange={setFees} suffix="€"/>
        <NumberInput label="Ασφάλιστρα ανά μήνα" value={insurance} onChange={setInsurance} suffix="€"/>
        <CustomSelect label="Τύπος επιτοκίου" value={rateType} onChange={setRateType} options={RATE_OPTIONS}/>
      </div>
      <Toggle on={prepay} onChange={setPrepay} label="Ρήτρα πρόωρης εξόφλησης"/>

      {/* Ετυμηγορία — ουδέτερο κουτί· λευκή/ομοιόμορφη, γαλάζια μόνο στο πέρασμα του
          κέρσορα (το κόκκινο για ακριβή προσφορά παραμένει πάντα). */}
      <div onMouseEnter={()=>setVhE(true)} onMouseLeave={()=>setVhE(false)} onTouchStart={()=>setVhE(true)} onTouchEnd={()=>setVhE(false)}
        style={{background:'var(--bg-surface)',border:`1px solid ${vhE?'var(--border-default)':'var(--border-subtle)'}`,borderRadius: T.radius.card,padding:'16px',transition:'border-color 0.15s'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:14,flexWrap:'wrap',marginBottom:14}}>
          <p style={{fontSize:16,fontWeight:700,fontFamily:font,color:res.verdict==='expensive'?'var(--negative)':vhE?'var(--accent)':'var(--text-primary)',letterSpacing:'-0.01em',transition:'color 0.15s'}}>{esisVerdictLabel(res.verdict)}</p>
          {res.vsMarketPct!=null && <p style={{fontSize:12,fontFamily:font,fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',fontWeight:600}}>{res.vsMarketPct<=0?'στα επίπεδα αγοράς':`+${fn(res.vsMarketPct,2)} μονάδες έναντι αγοράς`}</p>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',gap:12}}>
          {costTiles.map((t,i)=>(
            <div key={t.l} onMouseEnter={()=>setHt(i)} onMouseLeave={()=>setHt(null)} onTouchStart={()=>setHt(i)} onTouchEnd={()=>setHt(null)}>
              <p style={{...TT.label,color:'var(--text-tertiary)',marginBottom:4}}>{t.l}</p>
              <p style={{fontSize:t.hi?16:13,fontFamily:font,fontVariantNumeric:'tabular-nums',fontWeight:700,lineHeight:1,color:(t.hi&&res.verdict==='expensive')?'var(--negative)':ht===i?'var(--accent)':'var(--text-primary)',transition:'color 0.15s'}}>{t.v}</p>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:12}}>
          <span style={{fontSize:12,color:'var(--text-secondary)',fontFamily:font}}>Συνολικό κόστος πέραν κεφαλαίου</span>
          <span style={{fontSize:16,fontFamily:font,fontVariantNumeric:'tabular-nums',fontWeight:700,color:'var(--text-primary)'}}>{fmtEur(res.totalCost)}</span>
        </div>
      </div>

      {/* Επισημάνσεις */}
      {res.flags.length>0 && (
        <div>
          <p style={{...TT.label,marginBottom:10}}>Τι να προσέξεις</p>
          {/* Όσες επισημάνσεις κι αν βγουν, σε μία σειρά. Το `auto-fit` τις
              έβγαζε τρεις και μία και η τέταρτη διαβαζόταν σαν υποσημείωση. */}
          <div {...fixedCols(res.flags.length, 6, 'stretch')}>
            {res.flags.map((f,i)=>(
              <InfoChip key={i} label={f.label} detail={f.detail} tone={f.kind==='bad'?'negative':'default'}/>
            ))}
          </div>
        </div>
      )}

      <p style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.6,fontFamily:font}}>
        Το ΣΕΠΠΕ (Συνολικό Ετήσιο Πραγματικό Ποσοστό Επιβάρυνσης) ενσωματώνει τόκους, έξοδα και υποχρεωτικές ασφάλειες, ώστε να συγκρίνεις σωστά προσφορές. Ενδεικτική ανάλυση, επιβεβαίωσε τους όρους με την τράπεζα.
      </p>
    </div>
  )
}
