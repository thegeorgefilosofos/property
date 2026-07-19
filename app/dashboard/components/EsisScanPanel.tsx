'use client'
import { useCallback, useRef, useState } from 'react'
import { NumberInput, CustomSelect, Toggle, InfoDot } from './UIComponents'
import { analyzeEsis, esisVerdictLabel } from '@/lib/loans/esis'

// Σαρωτής προσφοράς ESIS — ανεβάζεις το δελτίο της τράπεζας (ή πληκτρολογείς τα
// νούμερα) και αποκαλύπτεται το πραγματικό κόστος: ΣΕΠΠΕ έναντι ονομαστικού,
// έξοδα, ασφάλειες, κρυφές χρεώσεις. Ίδιο /api/anthropic pattern με τη σάρωση.
const font = "'Inter',sans-serif"
const labelStyle: React.CSSProperties = {
  fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase',
  letterSpacing:'0.06em',fontWeight:700,fontFamily:font,
}

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

const num = (v: unknown): number | undefined => {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'))
  return isFinite(n) ? n : undefined
}

const RATE_OPTIONS = [
  { value:'fixed', label:'Σταθερό' },
  { value:'variable', label:'Κυμαινόμενο' },
  { value:'mixed', label:'Μεικτό' },
]


export default function EsisScanPanel({
  defaultAmount, defaultYears, benchmarkAprc, fmtEur,
}:{
  defaultAmount?:number; defaultYears?:number; benchmarkAprc?:number; fmtEur:(n:number)=>string;
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ht,setHt] = useState<number|null>(null)
  const [vhE,setVhE] = useState(false)
  const [scanning,setScanning] = useState(false)
  const [error,setError] = useState('')
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

  const scan = async (base64: string, mime: string) => {
    setScanning(true); setError('')
    const isPdf = mime === 'application/pdf'
    const part = isPdf
      ? { type:'document', source:{ type:'base64', media_type:'application/pdf', data:base64 } }
      : { type:'image', source:{ type:'base64', media_type:mime, data:base64 } }
    try {
      const res = await fetch('/api/anthropic', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model:'claude-sonnet-5', max_tokens:1200, system:SYSTEM_PROMPT,
          messages:[{ role:'user', content:[part, { type:'text', text:'Εξήγαγε τα στοιχεία της προσφοράς και επίστρεψε μόνο το JSON.' }] }],
        }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) { setError(String(data?.error||'').includes('API_KEY') ? 'key' : 'service'); return }
      const text = (data.content||[]).find((c:{type:string})=>c.type==='text')?.text || '{}'
      const p = JSON.parse(text.replace(/```json?|```/g,'').trim())
      if (num(p.amount)!=null) setAmount(String(num(p.amount)))
      if (num(p.years)!=null) setYears(String(num(p.years)))
      if (num(p.nominal_rate)!=null) setNominal(String(num(p.nominal_rate)))
      if (num(p.aprc)!=null) setAprc(String(num(p.aprc)))
      if (num(p.monthly_payment)!=null) setMonthly(String(num(p.monthly_payment)))
      if (num(p.insurance_monthly)!=null) setInsurance(String(num(p.insurance_monthly)))
      if (Array.isArray(p.fees)) { const t = p.fees.reduce((s:number,f:any)=>s+(num(f?.amount)||0),0); if (t>0) setFees(String(Math.round(t))) }
      if (typeof p.prepayment_penalty==='boolean') setPrepay(p.prepayment_penalty)
      if (p.rate_type==='fixed'||p.rate_type==='variable'||p.rate_type==='mixed') setRateType(p.rate_type)
      if (typeof p.bank==='string') setBank(p.bank)
      setScanned(true)
    } catch { setError('unreadable') }
    finally { setScanning(false) }
  }

  const loadFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/') && f.type!=='application/pdf') { setError('unreadable'); return }
    if (f.size > 10*1024*1024) { setError('big'); return }
    const reader = new FileReader()
    reader.onload = e => { const dataUrl = e.target?.result as string; scan(dataUrl.split(',')[1], f.type||'image/jpeg') }
    reader.readAsDataURL(f)
  }, [])

  const res = analyzeEsis({
    amount:Number(amount)||0, years:Number(years)||1,
    nominalRatePct:Number(nominal)||0, aprcPct:Number(aprc)||undefined,
    monthlyPayment:Number(monthly)||undefined,
    fees:[{ label:'Έξοδα', amount:Number(fees)||0 }],
    insuranceMonthly:Number(insurance)||0, prepaymentPenalty:prepay,
    rateType:rateType as any, bank,
  }, benchmarkAprc!=null ? { benchmarkAprc } : undefined)

  const dec = (n:number)=>String(n).replace('.',',')
  const costTiles = [
    { l:'ΣΕΠΠΕ (πραγματικό)', v:`${dec(res.aprc)}%`, hi:true },
    { l:'Ονομαστικό επιτόκιο', v:`${dec(res.nominal)}%`, hi:false },
    { l:'Δόση', v:fmtEur(res.monthly), hi:false },
    { l:'Σύνολο τόκων', v:fmtEur(res.totalInterest), hi:false },
    { l:'Έξοδα', v:fmtEur(res.totalFees), hi:false },
    { l:'Ασφάλειες (διάρκεια)', v:fmtEur(res.totalInsurance), hi:false },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{display:'none'}} onChange={e=>{ const f=e.target.files?.[0]; if(f) loadFile(f); e.currentTarget.value='' }}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:20,flexWrap:'wrap'}}>
        <p style={{flex:1,minWidth:240,fontSize:13,color:'var(--text-tertiary)',fontFamily:font,lineHeight:1.55}}>Ανέβασε το δελτίο ESIS ή την προσφορά της τράπεζας, ή πληκτρολόγησε τα νούμερα. Το εργαλείο αποκαλύπτει το πραγματικό κόστος (ΣΕΠΠΕ) πέρα από το διαφημιζόμενο επιτόκιο.</p>
        <button onClick={()=>inputRef.current?.click()} disabled={scanning} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'0 16px',height:36,borderRadius:100,background:'var(--accent)',border:'1px solid transparent',color:'var(--accent-text)',fontSize:12,fontFamily:font,fontWeight:700,cursor:scanning?'wait':'pointer',flexShrink:0}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
          {scanning?'Ανάλυση…':'Ανέβασε προσφορά'}
        </button>
      </div>

      {error && (
        <div style={{padding:'10px 14px',background:'var(--negative-dim)',border:'1px solid var(--negative-border)',borderRadius:10}}>
          <p style={{fontSize:13,color:'var(--negative)',fontFamily:font,lineHeight:1.5}}>{error==='key'?'Η υπηρεσία ανάλυσης δεν είναι διαθέσιμη αυτή τη στιγμή. Μπορείς να πληκτρολογήσεις τα νούμερα.':error==='big'?'Το αρχείο είναι πολύ μεγάλο (όριο 10MB).':error==='service'?'Προσωρινό πρόβλημα στην υπηρεσία. Δοκίμασε ξανά.':'Δεν διαβάστηκε καθαρά. Δοκίμασε πιο ευκρινές αρχείο ή συμπλήρωσε χειροκίνητα.'}</p>
        </div>
      )}
      {scanned && !scanning && !error && (
        <p style={{fontSize:11,color:'var(--text-tertiary)',fontFamily:font}}>Τα πεδία συμπληρώθηκαν από την προσφορά. Έλεγξε και διόρθωσε αν χρειάζεται.</p>
      )}

      {/* Στοιχεία προσφοράς — πληκτρολόγηση/διόρθωση (θαμπώνουν όσο τρέχει η ανάλυση AI) */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',gap:10,opacity:scanning?0.5:1,pointerEvents:scanning?'none':'auto',transition:'opacity 0.2s'}} aria-busy={scanning}>
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
        style={{background:'var(--bg-surface)',border:`1px solid ${vhE?'var(--border-default)':'var(--border-subtle)'}`,borderRadius:14,padding:'16px',transition:'border-color 0.15s'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:14,flexWrap:'wrap',marginBottom:14}}>
          <p style={{fontSize:16,fontWeight:700,fontFamily:font,color:res.verdict==='expensive'?'var(--negative)':vhE?'var(--accent)':'var(--text-primary)',letterSpacing:'-0.01em',transition:'color 0.15s'}}>{esisVerdictLabel(res.verdict)}</p>
          {res.vsMarketPct!=null && <p style={{fontSize:12,fontFamily:font,fontVariantNumeric:'tabular-nums',color:'var(--text-tertiary)',fontWeight:600}}>{res.vsMarketPct<=0?'στα επίπεδα αγοράς':`+${dec(res.vsMarketPct)} μονάδες έναντι αγοράς`}</p>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',gap:12}}>
          {costTiles.map((t,i)=>(
            <div key={t.l} onMouseEnter={()=>setHt(i)} onMouseLeave={()=>setHt(null)} onTouchStart={()=>setHt(i)} onTouchEnd={()=>setHt(null)}>
              <p style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase' as const,letterSpacing:'0.06em',fontWeight:700,fontFamily:font,marginBottom:4}}>{t.l}</p>
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
          <p style={{...labelStyle,marginBottom:10}}>Τι να προσέξεις</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',gap:6}}>
            {res.flags.map((f,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10}}>
                <span style={{flex:1,minWidth:0,fontSize:12,fontWeight:600,fontFamily:font,color:f.kind==='bad'?'var(--negative)':'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.label}</span>
                <InfoDot text={f.detail}/>
              </div>
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
