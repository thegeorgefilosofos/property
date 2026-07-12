'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/Theme'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, PiggyBank, User, Briefcase, Download, Layers, Lightbulb, ArrowUpRight } from 'lucide-react'
import { buildAdvisory, referLabel, type AdvisoryTone } from '@/lib/accounting/advisory'
import { REGULATORY_UPDATES_2026, type RegulatoryUpdate, type UpdateAudience } from '@/lib/accounting/updates2026'
import { transferCosts } from '@/lib/accounting/transfer'
import { InfoHint } from './InfoHint'
import BankImport from './BankImport'
import { Landmark, Lock, Unlock } from 'lucide-react'
import {
  buildLedger, cashflowByYear, reconcile, reconSummary,
  type LedgerInput, type Expected, type Actual, type ReconStatus,
} from '@/lib/accounting/ledger'
import {
  incomeStatement, taxProvision, consolidateIndividual,
  type TaxRegime, type StatementInput, type IncomeStatement,
} from '@/lib/accounting/statement'
import { shortTermYearSummary } from '@/lib/tax/shortTermTax'
import { resolveEnfia } from '@/lib/billing/propertyFacts'
import { estimateENFIAFromFacts } from '@/lib/billing/enfia'
import { annuityMonthly, interestForYear } from '@/lib/loans/recommend'
import { usefulLifeYears } from '@/lib/inventory/depreciation'
import { isGroupDeductible } from '@/lib/expenses/groups'
import { RENTAL_TAX_ROWS_2026, BUSINESS_INCOME_ROWS_2026, BUILDING_DEPRECIATION_RATE, BUILDING_VALUE_FRACTION, SELF_EMPLOYED_MIN_NET_INCOME_2026 } from '@/lib/billing/greekTax'
import { useReportBranding } from '@/lib/reportBranding'
import { downloadCsv } from './exportCsv'
import { printAccountingReport, type ReconLite } from './accountingReport'
import { printRentCertificate } from './rentCertificate'
import { AADE_CALENDAR_URL } from '@/lib/tax/greekTaxCalendar'
import { Printer } from 'lucide-react'

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιούν','Ιούλ','Αύγ','Σεπ','Οκτ','Νοέ','Δεκ']
const MONTHS_GR_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']
const eur = (n:number)=>n.toLocaleString('el-GR',{style:'currency',currency:'EUR',maximumFractionDigits:0})
const eur2 = (n:number)=>n.toLocaleString('el-GR',{style:'currency',currency:'EUR'})
const pct = (n:number)=>`${(n*100).toLocaleString('el-GR',{maximumFractionDigits:1})}%`
function athensNow(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Athens'})) }
function athensYear(){ return athensNow().getFullYear() }
function todayAthens(){ const d=athensNow(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const STATUS_META:Record<ReconStatus,{label:string;color:string}> = {
  paid:     { label:'Πληρώθηκε', color:'var(--positive)' },
  partial:  { label:'Μερικώς',   color:'var(--warning)' },
  unpaid:   { label:'Εκκρεμεί',  color:'var(--text-secondary)' },
  overdue:  { label:'Εκπρόθεσμο', color:'var(--negative)' },
}

const card:React.CSSProperties = { position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius:16, padding:'18px 20px', boxShadow:'0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 34px -20px rgba(0,0,0,0.55)' }
const cardTitle:React.CSSProperties = { fontSize:13, fontWeight:700, color:'var(--text-primary)', margin:'0 0 14px', fontFamily:"'Inter',sans-serif", letterSpacing:'0.1px' }

// Χρώμα μόνο στη γραμμή αποτελέσματος, αλλού ουδέτερο (χωρίς θόρυβο).
const lineColor = (kind:string, amount:number)=> kind==='result' ? (amount>=0?'var(--accent)':'var(--negative)') : 'var(--text-primary)'
// Ήπια, ουδέτερη ένδειξη τόνου για τη συμβουλευτική (χωρίς έντονα χρώματα/λίστες).
const ADVISORY_TONE:Record<AdvisoryTone,string> = { opportunity:'Ευκαιρία', action:'Ενέργεια', insight:'Ιδέα', caution:'Προσοχή' }

// Minimal, premium checkbox (Google-level): μικρό, καθαρό, με ήπιο animation.
function Check({ checked, onChange, label, hint, align='center' }:{ checked:boolean; onChange:(v:boolean)=>void; label:React.ReactNode; hint?:string; align?:'center'|'start' }){
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={()=>onChange(!checked)} title={hint}
      style={{ display:'inline-flex', alignItems:align==='start'?'flex-start':'center', gap:9, background:'none', border:'none', padding:0, cursor:'pointer', fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", textAlign:'left', lineHeight:1.5 }}>
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:17, height:17, borderRadius:6, border:`1.5px solid ${checked?'var(--accent)':'var(--border-default)'}`, background:checked?'var(--accent)':'var(--bg-surface)', transition:'border-color 0.14s, background 0.14s', flexShrink:0, marginTop:align==='start'?1:0 }}>
        {checked&&<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.2 2.2L9.5 3.6" stroke="var(--accent-text)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      <span>{label}</span>
    </button>
  )
}

export default function TabAccounting({ propertyId, userId, profileType='individual' }: { propertyId:string; userId:string; profileType?:'individual'|'professional' }) {
  const supabase = createClient()
  const branding = useReportBranding(userId)
  const [loading,setLoading] = useState(true)
  const [year,setYear] = useState(athensYear())
  // Η καρτέλα ακολουθεί το προφίλ (Ρυθμίσεις): ο ιδιώτης βλέπει απλή εικόνα, ο
  // επαγγελματίας τη διάκριση Φυσικό πρόσωπο / Επιχείρηση (ΕΛΠ). Χωρίς περιττό toggle.
  const mode:'individual'|'professional' = profileType
  const [elp,setElp] = useState<'personal'|'business'>('personal')
  const [elpForm,setElpForm] = useState<'sole'|'company'>('sole')
  // Ηλικία, μόνο για τη μειωμένη κλίμακα νέων (ν.5246/2025). Τοπική, προαιρετική.
  const [age,setAge] = useState<number|''>('')
  // Επιχειρηματικές παράμετροι (τοπικές, προαιρετικές): ετήσιες εισφορές ΕΦΚΑ,
  // πρώτη τριετία δραστηριότητας, ποσοστό διανομής κερδών νομικού προσώπου.
  const [ekfa,setEkfa] = useState<number|''>('')
  const [firstYears,setFirstYears] = useState(false)
  const [distribution,setDistribution] = useState<number|''>('')
  const [claimedUncollected,setClaimedUncollected] = useState(false)
  // Είσπραξη ενοικίων μέσω τραπέζης (default ναι). Από 1/1/2026 προϋπόθεση για την 5%.
  const [rentsBank,setRentsBank] = useState(true)
  // Υπολογιστής κόστους μεταβίβασης (αγορά/πώληση), τοπικός.
  const [xferSide,setXferSide] = useState<'buy'|'sell'>('buy')
  const [xferPrice,setXferPrice] = useState<number|''>('')
  const [xferFirstHome,setXferFirstHome] = useState(false)
  const [xferAgent,setXferAgent] = useState(true)
  const [openAdvisory,setOpenAdvisory] = useState<string|null>(null)
  const [advisoryOpen,setAdvisoryOpen] = useState(false)
  const [changesOpen,setChangesOpen] = useState(false)
  const [openChange,setOpenChange] = useState<string|null>(null)
  // Οι δύο ενημερωτικές ενότητες (Συμβουλευτική, Τι άλλαξε) ανοίγουν/κλείνουν ομοιόμορφα:
  // κλικ στην κεφαλίδα εναλλάσσει, κλικ εκτός τις ελαχιστοποιεί (καθαρή, ήσυχη εικόνα).
  const advisoryRef = useRef<HTMLDivElement>(null)
  const changesRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!advisoryOpen && !changesOpen) return
    // pointerdown: καλύπτει ποντίκι + αφή + πένα (σε iOS το mousedown δεν πυροδοτείται
    // σε μη-clickable στοιχεία, οπότε το «κλικ εκτός» θα αστοχούσε στο κινητό).
    const onDown = (e:PointerEvent)=>{
      const t = e.target as Node
      if(advisoryOpen && advisoryRef.current && !advisoryRef.current.contains(t)){ setAdvisoryOpen(false); setOpenAdvisory(null) }
      if(changesOpen && changesRef.current && !changesRef.current.contains(t)){ setChangesOpen(false); setOpenChange(null) }
    }
    const onKey = (e:KeyboardEvent)=>{ if(e.key==='Escape'){ setAdvisoryOpen(false); setOpenAdvisory(null); setChangesOpen(false); setOpenChange(null) } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return ()=>{ document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  },[advisoryOpen,changesOpen])
  const [showBankImport,setShowBankImport] = useState(false)
  const [refreshKey,setRefreshKey] = useState(0)
  const [hoverKpi,setHoverKpi] = useState<string|null>(null)
  const [tenant,setTenant] = useState<{ full_name?:string; afm?:string }|null>(null)
  const [xferOpen,setXferOpen] = useState(true)
  const [cashOpen,setCashOpen] = useState(true)
  useEffect(()=>{ try{
    const v=localStorage.getItem('acc_age'); if(v) setAge(Number(v)||'')
    const e=localStorage.getItem('acc_ekfa'); if(e) setEkfa(Number(e)||'')
    setFirstYears(localStorage.getItem('acc_first3')==='1')
  }catch{} },[])
  const updateAge=(v:number|'')=>{ setAge(v); try{ if(v) localStorage.setItem('acc_age',String(v)); else localStorage.removeItem('acc_age') }catch{} }
  const updateEkfa=(v:number|'')=>{ setEkfa(v); try{ if(v) localStorage.setItem('acc_ekfa',String(v)); else localStorage.removeItem('acc_ekfa') }catch{} }
  const updateFirstYears=(v:boolean)=>{ setFirstYears(v); try{ localStorage.setItem('acc_first3',v?'1':'0') }catch{} }
  const [expenses,setExpenses] = useState<any[]>([])
  const [rent,setRent] = useState<any[]>([])
  const [stays,setStays] = useState<any[]>([])
  const [loans,setLoans] = useState<any[]>([])
  const [inventory,setInventory] = useState<any[]>([])
  const [prop,setProp] = useState<any>(null)
  const [allProps,setAllProps] = useState<any[]>([])
  const [allRent,setAllRent] = useState<any[]>([])
  const [allStays,setAllStays] = useState<any[]>([])

  useEffect(()=>{ (async()=>{
    setLoading(true)
    try{
      const [ex, rp, st, ln, pr, aps, arp, ast, inv] = await Promise.all([
        supabase.from('expenses').select('date,amount,category,expense_group,description').eq('property_id',propertyId),
        supabase.from('rent_payments').select('period_year,period_month,amount,paid,paid_date,due_date').eq('property_id',propertyId),
        supabase.from('client_stays').select('id,check_in,check_out,nights,nightly_rate,total,channel').eq('property_id',propertyId),
        supabase.from('loans').select('amount,rate,years,bank,start_date').eq('property_id',propertyId),
        supabase.from('user_properties').select('id,name,address,rental_mode,enfia,sqm,value').eq('id',propertyId).maybeSingle(),
        supabase.from('user_properties').select('id,name,rental_mode,enfia,sqm').eq('user_id',userId),
        supabase.from('rent_payments').select('property_id,period_year,period_month,amount,paid,paid_date,due_date').eq('user_id',userId),
        supabase.from('client_stays').select('property_id,check_in,check_out,nights,nightly_rate,total,channel').eq('user_id',userId),
        supabase.from('inventory_items').select('purchase_value,category,purchase_date').eq('property_id',propertyId),
      ])
      setExpenses(ex.data||[]); setRent(rp.data||[]); setStays(st.data||[]); setLoans(ln.data||[])
      setProp(pr.data||null); setAllProps(aps.data||[]); setAllRent(arp.data||[]); setAllStays(ast.data||[]); setInventory(inv.data||[])
    }catch(_){ /* διατηρούμε ό,τι ήδη έχει φορτωθεί· το UI δεν κολλάει */ }
    finally{ setLoading(false) }
  })() },[propertyId,userId,refreshKey])

  const regime:TaxRegime = (prop?.rental_mode==='short_term') ? 'individual_shortterm' : 'individual_longterm'
  const propCount = Math.max(1, allProps.length)
  // ΕΝΦΙΑ: προτεραιότητα στο καταχωρημένο ποσό· αλλιώς αυτόματη εκτίμηση από αξία+τ.μ.
  const enfia = useMemo(()=>{
    const stored = resolveEnfia({ propertyEnfia: prop?.enfia }).annual
    if(stored>0) return stored
    return estimateENFIAFromFacts({ value: prop?.value, sqm: prop?.sqm })?.annual ?? 0
  },[prop])
  const enfiaEstimated = useMemo(()=>!(resolveEnfia({ propertyEnfia: prop?.enfia }).annual>0) && enfia>0,[prop,enfia])

  // Ενεργό δάνειο στη χρήση Y; (μεταξύ έτους έναρξης και λήξης).
  const loanActiveInYear = (l:any)=>{ const yrs=Number(l.years)||0; if(yrs<=0)return false; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; return year>=startY && year<startY+yrs }

  // Ετήσια στοιχεία τρέχοντος ακινήτου. Φόρος επί ΔΕΔΟΥΛΕΥΜΕΝΟΥ (accrued) ενοικίου
  //, φορολογείται ό,τι οφείλεται, ανεξάρτητα είσπραξης· τα ανείσπρακτα μειώνουν
  // μόνο το ταμείο. (Μακροχρόνια.)
  const rentAccruedYear = useMemo(()=>rent.filter(p=>p.period_year===year).reduce((s,p)=>s+(p.amount||0),0),[rent,year])
  const rentCollectedYear = useMemo(()=>rent.filter(p=>p.paid&&p.period_year===year).reduce((s,p)=>s+(p.amount||0),0),[rent,year])
  const shortSummary = useMemo(()=>shortTermYearSummary(stays as any, year, { sqm: prop?.sqm, isHouse:false, propertyCount:propCount, individual:true }),[stays,year,prop,propCount])
  const expensesYear = useMemo(()=>expenses.filter(e=>(e.date||'').slice(0,4)===String(year)&&(e.amount||0)>0),[expenses,year])
  // Εξαιρούμε τον ΕΝΦΙΑ ως δαπάνη, τον μετράμε ξεχωριστά (αποφυγή διπλομέτρησης).
  const expensesTotal = useMemo(()=>expensesYear.filter(e=>e.category!=='ΕΝΦΙΑ').reduce((s,e)=>s+(e.amount||0),0),[expensesYear])
  const deductibleTotal = useMemo(()=>expensesYear.filter(e=>isGroupDeductible(e.expense_group)&&e.category!=='ΕΝΦΙΑ').reduce((s,e)=>s+(e.amount||0),0),[expensesYear])
  // Δόσεις δανείων ΜΟΝΟ όσο το δάνειο είναι ενεργό στη χρήση (όχι φαντάσματα).
  const loanAnnual = useMemo(()=>loans.reduce((s,l)=>{ if(!loanActiveInYear(l))return s; const m=annuityMonthly(Number(l.amount)||0,Number(l.rate)||0,Number(l.years)||0); return s+m*12 },0),[loans,year])
  const inventoryDepr = useMemo(()=>inventory.reduce((s,it)=>{ const val=Number(it.purchase_value)||0; if(val<=0||!it.purchase_date)return s; const py=Number(String(it.purchase_date).slice(0,4)); if(!py||py>year)return s; const life=usefulLifeYears(it.category); if(year-py>=life)return s; return s+val/life },0),[inventory,year])
  const loanInterestYear = useMemo(()=>loans.reduce((s,l)=>{ const amount=Number(l.amount)||0, rate=Number(l.rate)||0, yrs=Number(l.years)||0; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; const idx=year-startY+1; return s+interestForYear(amount,rate,yrs,idx) },0),[loans,year])

  const businessMode = mode==='professional' && elp==='business'
  // Απόσβεση κτιρίου (4% επί του τμήματος αξίας που αναλογεί στο κτίσμα), μόνο επιχείρηση.
  const buildingDepr = useMemo(()=>{ const val=Number(prop?.value)||0; return val>0 ? Math.round(val*BUILDING_VALUE_FRACTION*BUILDING_DEPRECIATION_RATE) : 0 },[prop])
  const grossIncome = regime==='individual_shortterm' ? shortSummary.grossRevenue : rentAccruedYear
  const uncollectedRent = regime==='individual_shortterm' ? 0 : Math.max(0, rentAccruedYear - rentCollectedYear)

  // Ενοποίηση χαρτοφυλακίου (φυσικό πρόσωπο): ο φόρος είναι προοδευτικός στο ΣΥΝΟΛΟ
  // των ενοικίων (Ε1), όχι ανά ακίνητο. Υπολογίζεται ΠΑΝΤΑ, ώστε ο φόρος του τρέχοντος
  // ακινήτου να είναι το ΜΕΡΙΔΙΟ του από τον συνολικό, σωστά και για πολλά ακίνητα.
  const consolidation = useMemo(()=>{
    const items = (allProps.length?allProps:[{id:propertyId,name:prop?.name,rental_mode:prop?.rental_mode,enfia:prop?.enfia,sqm:prop?.sqm}]).map(p=>{
      const rmode:TaxRegime = p.rental_mode==='short_term' ? 'individual_shortterm' : 'individual_longterm'
      const pRentAccrued = allRent.filter(r=>r.property_id===p.id&&r.period_year===year).reduce((s,r)=>s+(r.amount||0),0)
      const pStays = allStays.filter(s=>s.property_id===p.id) as any[]
      const pShort = shortTermYearSummary(pStays, year, { sqm:p.sqm??null, isHouse:false, propertyCount:propCount, individual:true })
      const gross = rmode==='individual_shortterm' ? pShort.grossRevenue : pRentAccrued
      const input:StatementInput = { regime:rmode, grossIncome:gross, enfia: resolveEnfia({ propertyEnfia:p.enfia }).annual, rentsPaidViaBank: rentsBank,
        climateLevy: rmode==='individual_shortterm'?pShort.levy:0, municipalTax: rmode==='individual_shortterm'?pShort.municipalTax:0 }
      return { id:p.id, name:p.name||'Ακίνητο', input }
    }).filter(x=>x.input.grossIncome>0)
    if(items.length===0) return null
    return { con: consolidateIndividual(items.map(i=>({id:i.id,input:i.input}))), names:Object.fromEntries(items.map(i=>[i.id,i.name])), count:items.length }
  },[allProps,allRent,allStays,year,propCount,prop,propertyId,rentsBank])
  const myTaxShare = useMemo(()=>consolidation?.con.perProperty.find(p=>p.id===propertyId)?.taxShare,[consolidation,propertyId])
  const portfolio = (mode==='professional' && elp==='personal') ? consolidation : null

  const statement:IncomeStatement = useMemo(()=>incomeStatement(
    businessMode
      ? { regime:'business', grossIncome, businessForm:elpForm, taxpayerAge: age||undefined,
          firstThreeYears: firstYears, companyDistribution: elpForm==='company'&&distribution!=='' ? Number(distribution)/100 : 0,
          // Για επιχείρηση ο ΕΝΦΙΑ ΕΚΠΙΠΤΕΙ → τον περνάμε στα εκπιπτόμενα, όχι ως μη-εκπεστέο τέλος.
          itemizedExpenses:deductibleTotal+enfia, depreciation:inventoryDepr, buildingDepreciation:buildingDepr, loanInterest:loanInterestYear,
          ekfaContributions: elpForm==='sole'&&ekfa!=='' ? Number(ekfa) : 0,
          presumptiveMinIncome: elpForm==='sole'&&grossIncome>0 ? Math.round(SELF_EMPLOYED_MIN_NET_INCOME_2026*(firstYears?0.5:1)) : undefined, enfia:0,
          climateLevy: regime==='individual_shortterm'?shortSummary.levy:0, municipalTax: regime==='individual_shortterm'?shortSummary.municipalTax:0,
          otherCashExpenses: Math.max(0,expensesTotal-deductibleTotal), loanPrincipal: Math.max(0,loanAnnual-loanInterestYear), uncollectedIncome:uncollectedRent }
      : { regime, grossIncome, enfia, overrideIncomeTax: myTaxShare, rentsPaidViaBank: rentsBank,
          climateLevy: regime==='individual_shortterm' ? shortSummary.levy : 0,
          municipalTax: regime==='individual_shortterm' ? shortSummary.municipalTax : 0,
          otherCashExpenses: expensesTotal, loanPrincipal: loanAnnual, uncollectedIncome:uncollectedRent,
          legallyClaimedUncollected: claimedUncollected }
  ),[businessMode,elpForm,age,firstYears,distribution,ekfa,buildingDepr,claimedUncollected,rentsBank,regime,grossIncome,enfia,myTaxShare,shortSummary,expensesTotal,deductibleTotal,inventoryDepr,loanInterestYear,loanAnnual,uncollectedRent])

  // Συμβουλευτική, προτάσεις με αξία από τα πραγματικά δεδομένα (καθαρές, όχι θόρυβος).
  const advisory = useMemo(()=>buildAdvisory({
    regime: businessMode?'business':regime, businessForm: businessMode?elpForm:undefined, age: age||null,
    grossIncome, taxableIncome: statement.taxableIncome,
    rentalMode: prop?.rental_mode, propertyCount: propCount,
    hasLoan: loans.some(l=>loanActiveInYear(l)), loanInterestYear,
  }),[businessMode,regime,elpForm,age,grossIncome,statement,prop,propCount,loans,year,loanInterestYear])

  // «Τι άλλαξε»: επίκαιροι κανόνες 2026 σχετικοί με το προφίλ (καθεστώς + δάνειο).
  const relevantChanges = useMemo(()=>{
    const aud = new Set<UpdateAudience>(['all'])
    if(businessMode) aud.add('business')
    else if(regime==='individual_shortterm') aud.add('short_term')
    else aud.add('long_term')
    if(loans.some(l=>loanActiveInYear(l))) aud.add('borrower')
    return REGULATORY_UPDATES_2026.filter(u=>u.audiences.some(a=>aud.has(a)))
  },[businessMode,regime,loans,year])

  // Κόστος μεταβίβασης: προεπιλογή τιμήματος η αξία του ακινήτου (αν υπάρχει).
  const xferEffectivePrice = xferPrice!=='' ? Number(xferPrice) : (Number(prop?.value)||0)
  const xfer = useMemo(()=>transferCosts({ side:xferSide, price:xferEffectivePrice, firstHome:xferFirstHome, useAgent:xferAgent, acquisitionCost:xferSide==='sell'?(Number(prop?.value)||0):0 }),[xferSide,xferEffectivePrice,xferFirstHome,xferAgent,prop])

  // Πρόβλεψη: για τρέχον έτος με βάση τον τρέχοντα μήνα· για κλεισμένο/μελλοντικό, ισόποσα στους 12.
  const provMonth = year===athensYear() ? athensNow().getMonth()+1 : 1
  const provision = useMemo(()=>taxProvision(statement, provMonth),[statement,provMonth])

  // Ενοποιημένο καθολικό & ταμειακές ροές (όπως πριν, αλλά με τη νέα μηχανή για φόρο)
  const entries = useMemo<LedgerInput[]>(()=>{
    const out:LedgerInput[]=[]
    for(const p of rent){ if(p.paid&&(p.amount||0)>0){ out.push({ date:p.paid_date||p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01`, type:'income', category:'Ενοίκιο', description:`Ενοίκιο ${MONTHS_GR[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount, source:'rent' }) } }
    for(const s of stays){ if((s.total||0)>0&&s.check_in){ out.push({ date:s.check_in, type:'income', category:'Βραχυχρόνια', description:`Κράτηση ${s.channel||''}`.trim(), amount:s.total, source:'stay' }) } }
    for(const e of expenses){ if((e.amount||0)>0&&e.date){ out.push({ date:e.date, type:'expense', category:e.category||'Δαπάνες', description:e.description||'Δαπάνη', amount:e.amount, source:'expense' }) } }
    return out
  },[rent,stays,expenses])
  const yearEntries = useMemo(()=>entries.filter(e=>e.date.slice(0,4)===String(year)),[entries,year])
  const cash = useMemo(()=>cashflowByYear(entries,year),[entries,year])
  const book = useMemo(()=>buildLedger(yearEntries),[yearEntries])
  const recentLedger = useMemo(()=>[...book].slice(-12).reverse(),[book])

  const recon = useMemo(()=>{
    const yr = rent.filter(p=>p.period_year===year)
    const expected:Expected[] = yr.map(p=>({ id:`${p.period_year}-${p.period_month}`, date:p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01`, amount:p.amount||0, label:`${MONTHS_GR[(p.period_month||1)-1]} ${p.period_year}` }))
    const actual:Actual[] = yr.filter(p=>p.paid).map(p=>({ refId:`${p.period_year}-${p.period_month}`, date:p.paid_date, amount:p.amount||0, paid:true }))
    return reconcile(expected, actual, todayAthens())
  },[rent,year])
  const rs = useMemo(()=>reconSummary(recon),[recon])

  const maxCash = Math.max(1, ...cash.map(c=>Math.max(c.income,c.expense)))

  // ── Κλείσιμο χρήσης (period lock) ──────────────────────────────────────────
  const [closing,setClosing] = useState<{ snapshot:any; locked_at:string }|null>(null)
  useEffect(()=>{ (async()=>{
    const { data } = await supabase.from('book_closings').select('snapshot,locked_at').eq('property_id',propertyId).eq('user_id',userId).eq('year',year).maybeSingle()
    setClosing((data as any)||null)
  })() },[propertyId,userId,year,refreshKey])
  useEffect(()=>{ (async()=>{
    const { data } = await supabase.from('tenants').select('full_name,afm').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ ascending:false }).limit(1).maybeSingle()
    setTenant((data as any)||null)
  })() },[propertyId,userId,refreshKey])
  // Ετήσια βεβαίωση ενοικίου: μόνο εισπραγμένα μισθώματα του έτους, ανά μήνα.
  function printCertificate(){
    const paid = rent.filter((p:any)=>p.paid&&p.period_year===year).sort((a:any,b:any)=>(a.period_month||0)-(b.period_month||0))
    const months = paid.map((p:any)=>({ label:`${MONTHS_GR_FULL[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount||0 }))
    const total = months.reduce((s,m)=>s+m.amount,0)
    printRentCertificate({ year, propName:prop?.name||'Ακίνητο', address:prop?.address, tenantName:tenant?.full_name, tenantAfm:tenant?.afm, months, total, branding })
  }
  // Υπογραφή από ΜΟΝΙΜΑ δεδομένα (όχι από επιλογές εμφάνισης όπως ιδιώτης/επιχείρηση,
  // ηλικία, ΕΦΚΑ), ώστε η «απόκλιση» να σημαίνει πραγματική αλλαγή σε ενοίκια/έξοδα.
  const bookSig = useMemo(()=>[rentAccruedYear,rentCollectedYear,expensesTotal,loanAnnual,Math.round(shortSummary.grossRevenue)].map(n=>Math.round(n)).join('|'),[rentAccruedYear,rentCollectedYear,expensesTotal,loanAnnual,shortSummary])
  const drift = !!closing && closing.snapshot?.sig!=null && closing.snapshot.sig!==bookSig
  async function lockYear(){
    const snapshot = { sig:bookSig, taxableIncome:statement.taxableIncome, incomeTax:statement.incomeTax, netProfit:statement.netProfit, netCash:statement.netCash, provisionMonthly:provision.monthly, collectedTotal:rs.collectedTotal, expectedTotal:rs.expectedTotal }
    const locked_at = new Date().toISOString()
    // Ενημέρωση κατάστασης ΑΜΕΣΩΣ (ΑΝΟΙΧΤΟ → ΚΛΕΙΣΜΕΝΟ), χωρίς να περιμένουμε επαναφόρτωση
    // (που μπορεί να αστοχήσει/καθυστερήσει). Η εγγραφή στη βάση γίνεται στη συνέχεια.
    setClosing({ snapshot, locked_at })
    const { error } = await supabase.from('book_closings').upsert({ user_id:userId, property_id:propertyId, year, snapshot, locked_at },{ onConflict:'user_id,property_id,year' })
    if(error) console.warn('Αποτυχία μόνιμης αποθήκευσης κλειδώματος:', error.message)
  }
  async function unlockYear(){
    setClosing(null)
    await supabase.from('book_closings').delete().eq('property_id',propertyId).eq('user_id',userId).eq('year',year)
  }

  function exportBundle(){
    // Φάκελος για τον λογιστή: κατάσταση αποτελεσμάτων + κινήσεις έτους.
    const rows:(string|number)[][] = []
    rows.push(['ΚΑΤΑΣΤΑΣΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ', String(year), prop?.name||''])
    for(const l of statement.lines) rows.push([l.label, l.negative?-Math.round(l.amount):Math.round(l.amount), ''])
    rows.push(['Πρόβλεψη φόρου/μήνα', Math.round(provision.monthly), ''])
    rows.push(['', '', ''])
    rows.push(['ΚΙΝΗΣΕΙΣ', 'Ημερομηνία', 'Κατηγορία'])
    for(const e of book) rows.push([`${e.type==='income'?'+':'−'}${Math.round(e.amount)}, ${e.description}`, e.date, e.category])
    downloadCsv(`logistiki_${prop?.name||'akinito'}_${year}`.replace(/\s+/g,'_'), ['Περιγραφή','Ποσό / Ημ.','Κατηγορία'], rows)
  }

  function printReport(){
    const reconLite:ReconLite[] = recon.map(r=>{ const m=STATUS_META[r.status]; return { label:r.expected.label||'', paid:r.paidAmount, expected:r.expected.amount, statusLabel:m.label, statusColor:{paid:'#188038',partial:'#e37400',unpaid:'#5f6368',overdue:'#c5221f'}[r.status] } })
    printAccountingReport({
      propName: prop?.name||'Ακίνητο', address: prop?.address, year, regimeLabel,
      statement, provision, reconciliation: reconLite,
      expectedTotal: rs.expectedTotal, collectedTotal: rs.collectedTotal, outstanding: rs.outstanding,
      branding,
    })
  }

  if(loading) return <div style={{ padding:40 }}><Spinner label="Φόρτωση λογιστικής…" /></div>

  const regimeLabel = businessMode ? 'Επιχείρηση (ΕΛΠ)' : (regime==='individual_shortterm' ? 'Βραχυχρόνια μίσθωση' : 'Μακροχρόνια μίσθωση')
  const kpis = [
    { label:'Μεικτά έσοδα', value:eur(statement.grossIncome), hover:'var(--text-primary)', icon:<TrendingUp size={15}/> },
    { label:'Φόρος εισοδήματος', value:eur(statement.incomeTax), sub:`Μέσος συντ. ${pct(statement.effectiveRate)}`, hover:'var(--text-primary)', icon:<TrendingDown size={15}/> },
    { label:'Καθαρό αποτέλεσμα', value:eur(statement.netProfit), hover:statement.netProfit>=0?'var(--accent)':'var(--negative)', icon:<Wallet size={15}/> },
    { label:'Ταμειακό υπόλοιπο', value:eur(statement.netCash), sub:'μετά από φόρους, τέλη και δόσεις δανείου', hover:statement.netCash>=0?'var(--accent)':'var(--negative)', icon:<PiggyBank size={15}/> },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header: title + mode toggle + year */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ minWidth:0 }}>
          <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>Λογιστική</h2>
          <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'4px 0 0', fontFamily:"'Inter',sans-serif" }}>{regimeLabel} · έσοδα, φόρος και καθαρό αποτέλεσμα, με βάση τα πραγματικά σου δεδομένα.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          {mode==='professional'&&(
            <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
              {([['personal','Φυσικό πρόσωπο',<User size={13}/>],['business','Επιχείρηση (ΕΛΠ)',<Briefcase size={13}/>]] as [typeof elp,string,React.ReactNode][]).map(([e,label,icon])=>(
                <button key={e} onClick={()=>setElp(e)} style={{ display:'flex', alignItems:'center', gap:6, height:32, padding:'0 13px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12.5, fontFamily:"'Inter',sans-serif", fontWeight:elp===e?600:500, background:elp===e?'var(--accent)':'transparent', color:elp===e?'var(--accent-text)':'var(--text-secondary)', transition:'all 0.15s' }}>{icon}{label}</button>
              ))}
            </div>
          )}
          {businessMode&&(
            <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
              {([['sole','Ατομική'],['company','Νομικό πρόσωπο']] as [typeof elpForm,string][]).map(([f,label])=>(
                <button key={f} onClick={()=>setElpForm(f)} title={f==='sole'?'Ατομική επιχείρηση, προοδευτική κλίμακα 9–44%':'Νομικό πρόσωπο (ΑΕ/ΕΠΕ/ΙΚΕ/ΟΕ/ΕΕ), σταθερό 22%'} style={{ height:32, padding:'0 12px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12.5, fontFamily:"'Inter',sans-serif", fontWeight:elpForm===f?600:500, background:elpForm===f?'var(--accent)':'transparent', color:elpForm===f?'var(--accent-text)':'var(--text-secondary)', transition:'all 0.15s' }}>{label}</button>
              ))}
            </div>
          )}
          <button onClick={()=>setShowBankImport(true)} title="Εισαγωγή τραπεζικής κίνησης (CSV) και αυτόματη αντιστοίχιση σε ενοίκια/έξοδα" style={{ display:'inline-flex', alignItems:'center', gap:7, height:34, padding:'0 14px', borderRadius:17, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><Landmark size={14}/>Τράπεζα</button>
          <button onClick={printReport} title="Λογιστική αναφορά (PDF) για τον λογιστή/τράπεζα" style={{ display:'inline-flex', alignItems:'center', gap:7, height:34, padding:'0 14px', borderRadius:17, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><Printer size={14}/>Αναφορά</button>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={()=>setYear(y=>y-1)} aria-label="Προηγούμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronLeft size={17}/></button>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", minWidth:60, textAlign:'center', fontVariantNumeric:'tabular-nums' }}>{year}</span>
            <button onClick={()=>setYear(y=>y+1)} aria-label="Επόμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronRight size={17}/></button>
          </div>
        </div>
      </div>

      {/* Κλείσιμο χρήσης, premium κατάσταση με σαφή ένδειξη ανοιχτό/κλειστό */}
      {(()=>{ const isCurrent = year===athensYear()
        const isFuture = year>athensYear()
        const st = drift?'drift':closing?'locked':'open'
        const meta = { open:{ c:isCurrent?'var(--accent)':'var(--text-tertiary)', label:'ΑΝΟΙΧΤΟ' }, locked:{ c:'var(--positive)', label:'ΚΛΕΙΣΜΕΝΟ' }, drift:{ c:'var(--warning)', label:'ΑΠΟΚΛΙΣΗ' } }[st]
        return (
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', padding:'10px 14px', borderRadius:12, background:'var(--bg-surface)', border:`1px solid ${st==='drift'?'var(--warning)':'var(--border-subtle)'}` }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, height:24, padding:'0 10px', borderRadius:7, background:`color-mix(in srgb, ${meta.c} 12%, transparent)`, color:meta.c, fontSize:10, fontWeight:700, letterSpacing:'0.5px', fontFamily:"'Inter',sans-serif" }}>
            {st==='open'?(isCurrent?<span className="live-dot" style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>:<Unlock size={12}/>):<Lock size={12}/>}{meta.label}
          </span>
          <span style={{ fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>
            {st==='open'?(isCurrent?<>Χρήση {year} σε εξέλιξη · μήνας {provMonth} από 12.</>:isFuture?<>Η χρήση {year} δεν έχει ξεκινήσει ακόμη.</>:<>Χρήση {year} ολοκληρωμένη, έτοιμη για κλείδωμα.</>):st==='drift'?<>Η χρήση {year} κλειδώθηκε, αλλά τα δεδομένα άλλαξαν έκτοτε.</>:<>Χρήση {year}, κλειδωμένη στις {new Date(closing!.locked_at).toLocaleDateString('el-GR')}.</>}
            <InfoHint>Το κλείδωμα κρατά αμετάβλητο στιγμιότυπο των αριθμών του έτους (χρήσιμο μετά την υποβολή στην ΑΑΔΕ). Αν αργότερα αλλάξεις ενοίκια ή έξοδα, εμφανίζεται προειδοποίηση απόκλισης, χωρίς να χαθεί το αρχικό κλείδωμα.</InfoHint>
          </span>
          <div style={{ flex:1 }}/>
          {st==='open'
            ? (isFuture ? null : <button onClick={lockYear} style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 14px', borderRadius:16, border:'1px solid var(--border-default)', background:'var(--bg-elevated)', color:'var(--text-secondary)', fontSize:12.5, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.color='var(--accent)';e.currentTarget.style.borderColor='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.color='var(--text-secondary)';e.currentTarget.style.borderColor='var(--border-default)'}}><Lock size={13}/>Κλείδωμα έτους</button>)
            : <>
                {st==='drift'&&<button onClick={lockYear} style={{ height:32, padding:'0 13px', borderRadius:16, border:'1px solid var(--warning)', background:'transparent', color:'var(--warning)', fontSize:12.5, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Ενημέρωση</button>}
                <button onClick={unlockYear} style={{ display:'inline-flex', alignItems:'center', gap:6, height:32, padding:'0 13px', borderRadius:16, border:'none', background:'transparent', color:'var(--text-tertiary)', fontSize:12.5, cursor:'pointer', fontFamily:"'Inter',sans-serif" }} onMouseEnter={e=>{e.currentTarget.style.color='var(--text-secondary)'}} onMouseLeave={e=>{e.currentTarget.style.color='var(--text-tertiary)'}}><Unlock size={13}/>Ξεκλείδωμα</button>
              </>}
        </div>
      )})()}

      {/* Παράμετροι επιχείρησης, τυποποιημένα πεδία με σύντομη εξήγηση */}
      {businessMode&&(
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'stretch', padding:'14px 16px', borderRadius:12, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }}>
          {elpForm==='sole'&&(
            <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:150 }}>
              <span style={{ fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Εισφορές ΕΦΚΑ / έτος</span>
              <input type="number" inputMode="numeric" min={0} value={ekfa} onChange={e=>updateEkfa(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder="0"
                onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}
                style={{ width:110, height:34, padding:'0 10px', borderRadius:9, border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Εκπίπτουν και μειώνουν το ταμείο.</span>
            </div>
          )}
          {elpForm==='sole'&&(
            <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:150 }}>
              <span style={{ fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Ηλικία</span>
              <input type="number" inputMode="numeric" min={16} max={99} value={age} onChange={e=>updateAge(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder="π.χ. 30"
                title="Προαιρετικό. Ενεργοποιεί τη μειωμένη κλίμακα νέων (ν.5246/2025) στην ατομική επιχείρηση."
                onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}
                style={{ width:90, height:34, padding:'0 10px', borderRadius:9, border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Μειωμένη κλίμακα νέων (έως 30 ετών).</span>
            </div>
          )}
          {elpForm==='company'&&(
            <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:150 }}>
              <span style={{ fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>Διανομή κερδών</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="number" inputMode="numeric" min={0} max={100} value={distribution} onChange={e=>setDistribution(e.target.value===''?'':Math.min(100,Math.max(0,Number(e.target.value))))} placeholder="0"
                  onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}
                  style={{ width:74, height:34, padding:'0 10px', borderRadius:9, border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
                <span style={{ color:'var(--text-tertiary)', fontSize:13.5 }}>%</span>
              </div>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>Το μέρισμα φορολογείται επιπλέον με 5%.</span>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:6, justifyContent:'center', paddingLeft:14, borderLeft:'1px solid var(--border-subtle)', minWidth:220 }}>
            <Check checked={firstYears} onChange={updateFirstYears} label={<span style={{ fontWeight:500, color:'var(--text-primary)' }}>Νέα επιχείρηση (πρώτη τριετία)</span>} align="start" />
            <span style={{ fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", lineHeight:1.5, paddingLeft:26 }}>Τα πρώτα 3 έτη δραστηριότητας: 1ο κλιμάκιο 4,5% (αντί 9%) και προκαταβολή φόρου μειωμένη κατά 50%.</span>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap:12 }}>
        {kpis.map(k=>{
          const hot = hoverKpi===k.label
          return (
          <div key={k.label} onMouseEnter={()=>setHoverKpi(k.label)} onMouseLeave={()=>setHoverKpi(null)}
            style={{ position:'relative', background:'var(--bg-surface)', border:`1px solid ${hot?'var(--border-default)':'var(--border-subtle)'}`, borderRadius:14, padding:'15px 16px', transition:'transform 0.16s ease, border-color 0.16s ease', transform:hot?'translateY(-2px)':'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:9 }}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:9, background:'var(--bg-elevated)', color:'var(--text-tertiary)' }}>{k.icon}</span>
              <p style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.4px', textTransform:'uppercase', margin:0 }}>{k.label}</p>
            </div>
            <p style={{ fontSize:20, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', color:hot?k.hover:'var(--text-primary)', fontWeight:600, margin:0, transition:'color 0.16s ease' }}>{k.value}</p>
            {k.sub&&<p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:'3px 0 0', fontFamily:"'Inter',sans-serif" }}>{k.sub}</p>}
          </div>
        )})}
      </div>

      {/* Κατάσταση Αποτελεσμάτων + Πρόβλεψη φόρου */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16 }}>
        <div style={card}>
          <p style={cardTitle}>Κατάσταση αποτελεσμάτων {year}</p>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {statement.lines.map((l,i)=>{
              const strong = l.kind==='subtotal'||l.kind==='result'
              return (
                <div key={l.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:l.kind==='result'?'1px solid var(--border-subtle)':'none' }}>
                  <span style={{ flex:1, fontSize:strong?13.5:13, fontFamily:"'Inter',sans-serif", fontWeight:strong?600:400, color:l.kind==='result'?'var(--text-primary)':'var(--text-secondary)' }}>{l.label}</span>
                  <span style={{ fontSize:strong?14:13, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', fontWeight:strong?700:500, color:lineColor(l.kind,l.amount) }}>{l.negative?'−':''}{eur2(l.amount)}</span>
                </div>
              )
            })}
          </div>
          {!businessMode&&uncollectedRent>0&&(
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
              <Check align="start" checked={claimedUncollected} onChange={setClaimedUncollected}
                hint="Άρθρο 39 §4: τα ανείσπρακτα δεν φορολογούνται εφόσον έχουν διεκδικηθεί νομικά (διαταγή πληρωμής, αγωγή έξωσης) πριν την προθεσμία δήλωσης."
                label={<span style={{ fontSize:12, color:'var(--text-secondary)' }}>Τα ανείσπρακτα ({eur(uncollectedRent)}) έχουν <strong style={{ color:'var(--text-primary)' }}>διεκδικηθεί νομικά</strong>, να μη φορολογηθούν φέτος.</span>} />
            </div>
          )}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ ...card, background:'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, var(--bg-elevated)) 0%, var(--bg-surface) 100%)' }}>
            <p style={cardTitle}>Φόρος για να βάλεις στην άκρη</p>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
              <span style={{ fontSize:26, fontWeight:700, color:'var(--accent)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>{eur(provision.monthly)}</span>
              <span style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>ανά μήνα</span>
            </div>
            <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>
              <strong style={{ color:'var(--text-primary)' }}>{eur(provision.annualTaxTotal)}</strong> τον χρόνο, σε φορολογητέο {eur(statement.taxableIncome)}{!businessMode&&myTaxShare!=null&&(consolidation?.count??0)>1?' (μερίδιο χαρτοφυλακίου)':''}{provision.propertyTaxes>0?<>, εκ των οποίων {eur(provision.propertyTaxes)} φόροι και τέλη ακινήτου</>:''}.{year===athensYear()?<> Έως το τέλος του έτους <strong style={{ color:'var(--text-primary)' }}>{eur(provision.perRemainingMonth)} τον μήνα</strong>.</>:''}{provision.advanceTax>0?<> Συν προκαταβολή {eur(provision.advanceTax)} (πιστώνεται τον επόμενο χρόνο), σύνολο 1ου έτους {eur(provision.firstYearTotal)}.</>:''}
            </p>
          </div>
          <div style={{ ...card, display:'flex', gap:6, alignItems:'center' }}>
            <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>
              Εκτιμήσεις. Επιβεβαίωση με τον λογιστή σου ή στο <a href={AADE_CALENDAR_URL} target="_blank" rel="noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>myAADE</a>.
              <InfoHint>
                {businessMode
                  ? (elpForm==='company' ? 'Νομικό πρόσωπο: 22% επί των καθαρών κερδών (μετά από εκπιπτόμενα έξοδα, αποσβέσεις κτιρίου και εξοπλισμού, καθώς και τόκους), συν προκαταβολή φόρου 80% και 5% φόρος στη διανομή μερίσματος.' : 'Ατομική επιχείρηση: κλίμακα άρθρου 15 (9–44%) επί των καθαρών κερδών, μετά από εκπιπτόμενα έξοδα, ΕΦΚΑ, αποσβέσεις και τόκους, με τεκμαρτό ελάχιστο καθαρό εισόδημα και προκαταβολή φόρου 55%.')
                  : (regime==='individual_longterm' ? 'Μακροχρόνια μίσθωση φυσικού προσώπου: τεκμαρτή έκπτωση 5% και προοδευτική κλίμακα ενοικίων 2026. Ο φόρος υπολογίζεται στο σύνολο των ενοικίων σου (Ε1).' : 'Βραχυχρόνια μίσθωση: φόρος στα μεικτά με την κλίμακα 2026, συν ΤΑΚΚ και τέλος παρεπιδημούντων όπου ισχύει.')}
                {enfiaEstimated&&provision.propertyTaxes>0?` Ο ΕΝΦΙΑ (${eur(enfia)}) είναι αυτόματη εκτίμηση από αξία και τετραγωνικά. Καταχώρησε το ακριβές στους Λογαριασμούς.`:''}
              </InfoHint>
            </p>
          </div>
        </div>
      </div>

      {/* Φορολογική κλίμακα 2026, αναφορά ανά καθεστώς (έμφαση στο κλιμάκιο του χρήστη) */}
      {!(businessMode&&elpForm==='company') ? (
        <div style={card}>
          <p style={cardTitle}>{businessMode ? 'Κλίμακα επιχειρηματικής δραστηριότητας 2026' : 'Φορολογική κλίμακα ενοικίων 2026'}</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:8 }}>
            {(businessMode ? BUSINESS_INCOME_ROWS_2026 : RENTAL_TAX_ROWS_2026).map(r=>{ const active=statement.taxableIncome>r.from&&statement.taxableIncome<=r.to; return (
              <div key={r.range} style={{ padding:'10px 12px', borderRadius:12, border:`1px solid ${active?'var(--border-accent)':'var(--border-subtle)'}`, background:active?'var(--accent-soft)':'var(--bg-surface)' }}>
                <p style={{ fontSize:11.5, color:active?'var(--accent)':'var(--text-tertiary)', margin:0, fontFamily:"'Inter',sans-serif" }}>{r.range}</p>
                <p style={{ fontSize:17, fontWeight:700, color:active?'var(--accent)':'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{r.rate}</p>
              </div>
            )})}
          </div>
        </div>
      ) : (
        <div style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>
          <div style={{ minWidth:0, flex:1 }}>
            <p style={{ ...cardTitle, margin:0 }}>Νομικό πρόσωπο</p>
            <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:'7px 0 0', fontFamily:"'Inter',sans-serif", lineHeight:1.6, maxWidth:560 }}>Σταθερός φόρος <strong style={{ color:'var(--text-primary)' }}>22%</strong> επί των καθαρών κερδών, ανεξαρτήτως ύψους εισοδήματος (ΑΕ, ΕΠΕ, ΙΚΕ, ΟΕ, ΕΕ). Στη διανομή μερίσματος προστίθεται φόρος 5% και ισχύει προκαταβολή φόρου για το επόμενο έτος.</p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minWidth:104, height:76, borderRadius:16, background:'linear-gradient(180deg, var(--accent-soft) 0%, transparent 100%)', border:'1px solid var(--border-accent)', flexShrink:0 }}>
            <span style={{ fontSize:27, fontWeight:700, color:'var(--accent)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', lineHeight:1 }}>22%</span>
            <span style={{ fontSize:10, color:'var(--text-tertiary)', letterSpacing:'0.5px', textTransform:'uppercase', fontFamily:"'Inter',sans-serif", marginTop:5 }}>Συντελεστής</span>
          </div>
        </div>
      )}

      {/* Επαγγελματίας: ενοποίηση χαρτοφυλακίου + εκπιπτόμενα */}
      {mode==='professional'&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16 }}>
          {elp==='personal'&&(
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <Layers size={15} style={{ color:'var(--text-secondary)' }}/>
              <p style={{ ...cardTitle, margin:0 }}>Ενοποίηση χαρτοφυλακίου {year}</p>
            </div>
            {!portfolio?(
              <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'8px 0' }}>Δεν υπάρχουν έσοδα σε άλλα ακίνητα για το {year}.</p>
            ):(<>
              <p style={{ fontSize:12, color:'var(--text-secondary)', margin:'0 0 12px', fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>Ο φόρος φυσικού προσώπου είναι προοδευτικός στο <strong style={{ color:'var(--text-primary)' }}>σύνολο</strong> των ενοικίων (όπως στο Ε1), όχι ανά ακίνητο.</p>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:12 }}>
                <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily:"'Inter',sans-serif" }}>Συνολικά έσοδα</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(portfolio.con.grossIncome)}</p></div>
                <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily:"'Inter',sans-serif" }}>Συνολικός φόρος</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(portfolio.con.incomeTax)}</p></div>
                <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily:"'Inter',sans-serif" }}>Μέσος συντ.</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{pct(portfolio.con.effectiveRate)}</p></div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {portfolio.con.perProperty.map(pp=>(
                  <div key={pp.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:'var(--bg-surface)', border:`1px solid ${pp.id===propertyId?'var(--border-accent)':'var(--border-subtle)'}` }}>
                    <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{portfolio.names[pp.id]}</span>
                    <span style={{ fontSize:12, color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(pp.statement.grossIncome)}</span>
                    <span style={{ fontSize:12.5, fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif", minWidth:70, textAlign:'right' }}>φόρος {eur(pp.taxShare)}</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
          )}

          <div style={card}>
            <p style={cardTitle}>Εκπιπτόμενα έξοδα {year}</p>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:12 }}>
              <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily:"'Inter',sans-serif" }}>Εκπιπτόμενα</p><p style={{ fontSize:16, fontWeight:700, color:'var(--positive)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(deductibleTotal)}</p></div>
              <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily:"'Inter',sans-serif" }}>Μη εκπιπτόμενα</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-secondary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(expensesTotal-deductibleTotal)}</p></div>
            </div>
            <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>Για ιδιώτη τα έξοδα δεν εκπίπτουν αναλυτικά. Στο καθεστώς <strong style={{ color:'var(--text-primary)' }}>Επιχείρηση (ΕΛΠ)</strong> εκπίπτουν πλήρως.<InfoHint>Για φυσικό πρόσωπο με μακροχρόνια μίσθωση κατοικίας ισχύει η τεκμαρτή έκπτωση 5% (όχι αναλυτικά έξοδα). Στο καθεστώς Επιχείρηση (ΕΛΠ) εκπίπτουν αναλυτικά, μαζί με αποσβέσεις εξοπλισμού ({eur(inventoryDepr)} τον χρόνο) και τόκους δανείων ({eur(loanInterestYear)} τον χρόνο).</InfoHint></p>
          </div>
        </div>
      )}

      {/* Τεκμαρτή έκπτωση 5%: προϋπόθεση τραπεζικής είσπραξης (μακροχρόνια ιδιώτη) */}
      {!businessMode && regime==='individual_longterm' && (
        <div style={{ ...card, padding:'13px 16px', display:'flex', flexDirection:'column', gap:6, border:`1px solid ${rentsBank?'var(--border-subtle)':'var(--negative-border)'}`, background:rentsBank?undefined:'color-mix(in srgb, var(--negative) 5%, var(--bg-surface))' }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
            <Check checked={rentsBank} onChange={setRentsBank} label={<strong style={{ color:'var(--text-primary)', fontWeight:600 }}>Είσπραξη ενοικίων μέσω τραπέζης</strong>}/>
            <InfoHint>Από 1/1/2026 (ν.5246/2025) τα μισθώματα κατοικίας πρέπει να εισπράττονται με τραπεζικό/ηλεκτρονικό μέσο (κατάθεση, IRIS, έμβασμα). Με μετρητά χάνεται η τεκμαρτή έκπτωση 5% και φορολογείσαι στο 100% του ενοικίου.</InfoHint>
          </div>
          <p style={{ margin:0, paddingLeft:26, fontSize:11.5, color:rentsBank?'var(--text-tertiary)':'var(--negative)', fontFamily:"'Inter',sans-serif" }}>{rentsBank ? 'Ισχύει η τεκμαρτή έκπτωση 5% (φόρος στο 95% των ενοικίων).' : 'Χωρίς τραπεζική είσπραξη: φόρος στο 100% των ενοικίων.'}</p>
        </div>
      )}

      {/* Συμβουλευτική, καθαρές, στοχευμένες προτάσεις με αξία (ανοιγοκλείνει ομοιόμορφα) */}
      {advisory.length>0 && (
      <div ref={advisoryRef} style={card}>
        <button onClick={()=>{ setAdvisoryOpen(o=>!o); setOpenAdvisory(null) }} aria-expanded={advisoryOpen} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
          <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:9, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)', flexShrink:0 }}><Lightbulb size={15}/></span>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ ...cardTitle, margin:0 }}>Συμβουλευτική</p>
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'2px 0 0', fontFamily:"'Inter',sans-serif" }}>{advisory.length} ιδέες φορολογίας, χρηματοδότησης και αξιοποίησης, από τα δικά σου δεδομένα.</p>
          </div>
          <ChevronRight size={17} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:advisoryOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
        </button>
        {advisoryOpen && (<>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap:12, alignItems:'start', marginTop:16 }}>
          {advisory.map(a=>{
            const open = openAdvisory===a.id
            return (
              <div key={a.id} style={{ borderRadius:13, background:'var(--bg-surface)', border:`1px solid ${open?'var(--border-default)':'var(--border-subtle)'}`, overflow:'hidden', transition:'border-color 0.15s' }}>
                <button onClick={()=>setOpenAdvisory(open?null:a.id)} aria-expanded={open} className="acc-toggle" style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:"'Inter',sans-serif" }}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{e.currentTarget.style.background='none'}}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <span style={{ display:'inline-flex', alignItems:'center', height:20, padding:'0 9px', borderRadius:6, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', fontSize:9.5, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-tertiary)' }}>{ADVISORY_TONE[a.tone]}</span>
                    <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text-primary)', margin:'7px 0 0', lineHeight:1.35 }}>{a.title}</p>
                  </div>
                  <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:open?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
                </button>
                {open&&(
                  <div style={{ padding:'0 16px 15px' }}>
                    <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.6 }}>{a.body}</p>
                    {(a.refer||a.linkHref)&&(
                      <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:11, flexWrap:'wrap' }}>
                        {a.refer&&<span style={{ fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{referLabel(a.refer)}</span>}
                        {a.linkHref&&<a href={a.linkHref} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, color:'var(--accent)', textDecoration:'none', fontFamily:"'Inter',sans-serif" }}>{a.linkLabel||'Περισσότερα'}<ArrowUpRight size={12}/></a>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
          <p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>Ενημερωτικές προτάσεις, όχι επίσημη συμβουλή.<InfoHint>Οι προτάσεις δεν υποκαθιστούν τον λογιστή, τον δικηγόρο ή τον συμβολαιογράφο σου. Για την επίσημη εξαγωγή συμπερασμάτων και δηλώσεων απευθύνσου σε πιστοποιημένο επαγγελματία.</InfoHint></p>
        </div>
        </>)}
      </div>
      )}

      {/* «Τι άλλαξε» — επίκαιροι κανόνες 2026 σχετικοί με το προφίλ (διακριτικό) */}
      {relevantChanges.length>0 && (
      <div ref={changesRef} style={card}>
        <button onClick={()=>{ setChangesOpen(o=>!o); setOpenChange(null) }} aria-expanded={changesOpen} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
          <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:9, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)', flexShrink:0 }}><Landmark size={15}/></span>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ ...cardTitle, margin:0 }}>Τι άλλαξε το 2026</p>
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'2px 0 0', fontFamily:"'Inter',sans-serif" }}>{relevantChanges.length} επίκαιροι κανόνες για το προφίλ σου.</p>
          </div>
          <ChevronRight size={17} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:changesOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
        </button>
        {changesOpen && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap:12, marginTop:16, alignItems:'start' }}>
            {relevantChanges.map((u:RegulatoryUpdate)=>{
              const uo = openChange===u.id
              return (
                <div key={u.id} style={{ borderRadius:13, background:'var(--bg-surface)', border:`1px solid ${uo?'var(--border-default)':'var(--border-subtle)'}`, overflow:'hidden', transition:'border-color 0.15s' }}>
                  <button onClick={()=>setOpenChange(uo?null:u.id)} aria-expanded={uo} className="acc-toggle" style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'13px 15px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:"'Inter',sans-serif" }}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{e.currentTarget.style.background='none'}}>
                    <p style={{ flex:1, minWidth:0, fontSize:13, fontWeight:600, color:'var(--text-primary)', margin:0, lineHeight:1.35, fontFamily:"'Inter',sans-serif" }}>{u.title}</p>
                    <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:uo?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
                  </button>
                  {uo && (
                    <div style={{ padding:'0 15px 14px' }}>
                      <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:0, lineHeight:1.6, fontFamily:"'Inter',sans-serif" }}>{u.summary}</p>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:11, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", letterSpacing:'0.3px' }}>Ισχύς: {u.effective} · {u.legalBasis}</span>
                        {u.sourceHref && <a href={u.sourceHref} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, color:'var(--accent)', textDecoration:'none', fontFamily:"'Inter',sans-serif" }}>{u.sourceLabel||'Πηγή'}<ArrowUpRight size={12}/></a>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {changesOpen && (
        <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
          <p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>Ενημερωτικά, με επίσημες πηγές. Οι κανόνες αλλάζουν, επιβεβαίωσε στο myAADE/gov.gr ή με τον λογιστή σου.</p>
        </div>
        )}
      </div>
      )}

      {/* Κόστος αγοράς & πώλησης, δομημένη εκτίμηση μεταβίβασης */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:xferOpen?16:0 }}>
          <button onClick={()=>setXferOpen(o=>!o)} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:9, background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left', flex:1, minWidth:0 }}>
            <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:xferOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
            <div>
              <p style={{ ...cardTitle, margin:0 }}>Κόστος αγοράς και πώλησης</p>
              {xferOpen&&<p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'3px 0 0', fontFamily:"'Inter',sans-serif", fontWeight:400 }}>Φόροι, συμβολαιογραφικά και μεσιτικά. Εκτίμηση πριν τη μεταβίβαση.</p>}
            </div>
          </button>
          {xferOpen&&(
          <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
            {([['buy','Αγορά'],['sell','Πώληση']] as ['buy'|'sell',string][]).map(([s,label])=>(
              <button key={s} onClick={()=>setXferSide(s)} style={{ height:32, padding:'0 15px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12.5, fontFamily:"'Inter',sans-serif", fontWeight:xferSide===s?600:500, background:xferSide===s?'var(--accent)':'transparent', color:xferSide===s?'var(--accent-text)':'var(--text-secondary)', transition:'all 0.15s' }}>{label}</button>
            ))}
          </div>
          )}
        </div>
        {xferOpen&&(<>
        <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom:14 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>
            <span style={{ minWidth:96 }}>{xferSide==='buy'?'Τιμή αγοράς':'Τιμή πώλησης'}</span>
            <input type="number" inputMode="numeric" min={0} value={xferPrice} onKeyDown={e=>{ if(e.key==='-'||e.key==='e'||e.key==='+') e.preventDefault() }} onChange={e=>setXferPrice(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder={(Number(prop?.value)||0)?String(Math.round(Number(prop?.value))):'0'}
              onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}
              style={{ width:104, height:34, padding:'0 10px', borderRadius:9, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:13.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
            <span style={{ color:'var(--text-tertiary)' }}>€</span>
          </label>
          {xferSide==='buy'&&(
            <Check checked={xferFirstHome} onChange={setXferFirstHome} label="Πρώτη κατοικία" hint="Απαλλαγή φόρου μεταβίβασης έως το όριο αξίας (200.000 € άγαμος / 250.000 € έγγαμος)." />
          )}
          <Check checked={xferAgent} onChange={setXferAgent} label="Μεσίτης" hint="Μεσιτική αμοιβή ~2% + ΦΠΑ." />
        </div>
        {xferEffectivePrice>0?(<>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {xfer.lines.map(l=>(
              <div key={l.key} title={l.note} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0' }}>
                <span style={{ flex:1, fontSize:13, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>{l.label}</span>
                <span style={{ fontSize:13, color:l.amount===0?'var(--text-tertiary)':'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif", fontWeight:500 }}>{eur(l.amount)}</span>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0 0', marginTop:4, borderTop:'1px solid var(--border-subtle)' }}>
              <span style={{ flex:1, fontSize:13.5, fontWeight:600, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>Σύνολο εξόδων &amp; φόρων</span>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(xfer.totalCosts)} <span style={{ fontSize:11.5, fontWeight:500, color:'var(--text-tertiary)' }}>({pct(xfer.costPct)})</span></span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0 0' }}>
              <span style={{ flex:1, fontSize:13.5, fontWeight:600, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>{xferSide==='buy'?'Συνολική εκταμίευση':'Καθαρό έσοδο πώλησης'}</span>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--accent)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur(xferSide==='buy'?(xfer.cashOut||0):(xfer.netProceeds||0))}</span>
            </div>
          </div>
          <p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:'14px 0 0', paddingTop:12, borderTop:'1px solid var(--border-subtle)', fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>Ενδεικτική εκτίμηση. Τα ακριβή ποσά ορίζονται από συμβολαιογράφο ή την ΑΑΔΕ.<InfoHint>Τα ποσοστά είναι τα ισχύοντα. Τα κλιμακωτά συμβολαιογραφικά, η αντικειμενική αξία και οι απαλλαγές οριστικοποιούνται από συμβολαιογράφο, δικηγόρο ή την ΑΑΔΕ. Ο φόρος υπεραξίας 15% τελεί σε αναστολή.</InfoHint></p>
        </>):(
          <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'4px 0' }}>Δώσε τιμή για να δεις την ανάλυση κόστους.</p>
        )}
        </>)}
      </div>

      {/* Ταμειακές ροές */}
      <div style={card}>
        <button onClick={()=>setCashOpen(o=>!o)} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:9, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left', marginBottom:cashOpen?16:0 }}>
          <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:cashOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
          <p style={{ ...cardTitle, margin:0 }}>Ταμειακές ροές {year}</p>
        </button>
        {cashOpen&&(cash.every(c=>!c.income&&!c.expense)?(
          <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'4px 0' }}>Καμία κίνηση για το {year}.</p>
        ):(<>
        <div style={{ display:'flex', flexDirection:'column' }}>
          {cash.map((c,i)=>{ const net=c.income-c.expense; const empty=!c.income&&!c.expense; return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'6px 0' }}>
              <span style={{ width:104, flexShrink:0, fontSize:12, color:empty?'var(--text-tertiary)':'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>{MONTHS_GR_FULL[i]}</span>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3 }}>
                <div style={{ height:6, borderRadius:3, width:`${Math.round(c.income/maxCash*100)}%`, minWidth:c.income>0?4:0, background:'var(--positive)', opacity:0.85 }} title={`Έσοδα: ${eur(c.income)}`}/>
                <div style={{ height:6, borderRadius:3, width:`${Math.round(c.expense/maxCash*100)}%`, minWidth:c.expense>0?4:0, background:'var(--negative)', opacity:0.75 }} title={`Έξοδα: ${eur(c.expense)}`}/>
              </div>
              <span style={{ width:96, flexShrink:0, textAlign:'right', fontSize:11.5, color:empty?'var(--text-tertiary)':'var(--text-secondary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{empty?'':eur(net)}</span>
            </div>
          )})}
        </div>
        <div style={{ display:'flex', gap:16, marginTop:12, paddingTop:10, borderTop:'1px solid var(--border-subtle)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}><span style={{ width:8, height:8, borderRadius:2, background:'var(--positive)', opacity:0.85 }}/>Έσοδα</span>
          <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}><span style={{ width:8, height:8, borderRadius:2, background:'var(--negative)', opacity:0.75 }}/>Έξοδα</span>
        </div>
        </>))}
      </div>

      {/* Συμφωνία ενοικίων + Βιβλίο/κινήσεις */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16 }}>
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ ...cardTitle, margin:0 }}>Συμφωνία ενοικίων</p>
            <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>Εισπράχθηκαν <strong style={{ color:'var(--positive)' }}>{eur(rs.collectedTotal)}</strong> / {eur(rs.expectedTotal)}</span>
          </div>
          {recon.length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'12px 0' }}>Δεν υπάρχουν καταχωρημένα ενοίκια για το {year}.</p>
          ):(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {recon.map((r,i)=>{ const m=STATUS_META[r.status]; return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:m.color, flexShrink:0 }}/>
                  <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>{r.expected.label}</span>
                  <span style={{ fontSize:12.5, color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif" }}>{eur2(r.paidAmount)} / {eur2(r.expected.amount)}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:m.color, background:`color-mix(in srgb, ${m.color} 13%, transparent)`, borderRadius:20, padding:'2px 9px', fontFamily:"'Inter',sans-serif", minWidth:78, textAlign:'center' }}>{m.label}</span>
                </div>
              )})}
            </div>
          )}
          {rs.collectedTotal>0&&(
            <button onClick={printCertificate} title="Ετήσια βεβαίωση καταβληθέντων ενοικίων (PDF) για τον μισθωτή" style={{ display:'inline-flex', alignItems:'center', gap:6, height:30, padding:'0 12px', marginTop:12, borderRadius:15, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:12.5, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif" }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><Printer size={13}/>Βεβαίωση ενοικίου</button>
          )}
        </div>

        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ ...cardTitle, margin:0 }}>{mode==='professional'?'Βιβλίο Εσόδων-Εξόδων':'Πρόσφατες κινήσεις'}</p>
            <button onClick={exportBundle} title="Φάκελος για τον λογιστή (CSV)" style={{ display:'inline-flex', alignItems:'center', gap:6, height:30, padding:'0 12px', borderRadius:15, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:12.5, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif" }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><Download size={13}/>Για τον λογιστή</button>
          </div>
          {recentLedger.length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", padding:'8px 0' }}>Καμία κίνηση για το {year}.</p>
          ):(
            <div style={{ display:'flex', flexDirection:'column' }}>
              {(mode==='professional'?book.slice(-14).reverse():recentLedger).map((e,i,arr)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none' }}>
                  <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', width:74, flexShrink:0 }}>{e.date.split('-').reverse().join('/')}</span>
                  <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description}</span>
                  {mode==='professional'&&<span style={{ fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', width:80, textAlign:'right' }}>{eur(e.balance)}</span>}
                  <span style={{ fontSize:13, fontWeight:600, color:e.type==='income'?'var(--positive)':'var(--negative)', fontVariantNumeric:'tabular-nums', fontFamily:"'Inter',sans-serif", width:92, textAlign:'right' }}>{e.type==='income'?'+':'−'}{eur2(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showBankImport&&<BankImport propertyId={propertyId} userId={userId} year={year} onClose={()=>setShowBankImport(false)} onDone={()=>setRefreshKey(k=>k+1)} />}
    </div>
  )
}
