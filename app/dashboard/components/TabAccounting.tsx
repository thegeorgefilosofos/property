'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/Theme'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, PiggyBank, User, Briefcase, Download, Info, Layers, Lightbulb, ArrowUpRight } from 'lucide-react'
import { buildAdvisory, referLabel, type AdvisoryTone } from '@/lib/accounting/advisory'
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
import { annuityMonthly, interestForYear } from '@/lib/loans/recommend'
import { usefulLifeYears } from '@/lib/inventory/depreciation'
import { isGroupDeductible } from '@/lib/expenses/groups'
import { RENTAL_TAX_ROWS_2026, BUSINESS_INCOME_ROWS_2026, BUILDING_DEPRECIATION_RATE, BUILDING_VALUE_FRACTION, SELF_EMPLOYED_MIN_NET_INCOME_2026 } from '@/lib/billing/greekTax'
import { useReportBranding } from '@/lib/reportBranding'
import { downloadCsv } from './exportCsv'
import { printAccountingReport, type ReconLite } from './accountingReport'
import { AADE_CALENDAR_URL } from '@/lib/tax/greekTaxCalendar'
import { Printer } from 'lucide-react'

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μάι','Ιούν','Ιούλ','Αύγ','Σεπ','Οκτ','Νοέ','Δεκ']
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

// Χρώμα μόνο στη γραμμή αποτελέσματος — αλλού ουδέτερο (χωρίς θόρυβο).
const lineColor = (kind:string, amount:number)=> kind==='result' ? (amount>=0?'var(--accent)':'var(--negative)') : 'var(--text-primary)'
// Ήπια, ουδέτερη ένδειξη τόνου για τη συμβουλευτική (χωρίς έντονα χρώματα/λίστες).
const ADVISORY_TONE:Record<AdvisoryTone,string> = { opportunity:'Ευκαιρία', action:'Ενέργεια', insight:'Ιδέα', caution:'Προσοχή' }

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
  // Ηλικία — μόνο για τη μειωμένη κλίμακα νέων (ν.5246/2025). Τοπική, προαιρετική.
  const [age,setAge] = useState<number|''>('')
  // Επιχειρηματικές παράμετροι (τοπικές, προαιρετικές): ετήσιες εισφορές ΕΦΚΑ,
  // πρώτη τριετία δραστηριότητας, ποσοστό διανομής κερδών νομικού προσώπου.
  const [ekfa,setEkfa] = useState<number|''>('')
  const [firstYears,setFirstYears] = useState(false)
  const [distribution,setDistribution] = useState<number|''>('')
  const [claimedUncollected,setClaimedUncollected] = useState(false)
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
    setLoading(false)
  })() },[propertyId,userId])

  const regime:TaxRegime = (prop?.rental_mode==='short_term') ? 'individual_shortterm' : 'individual_longterm'
  const propCount = Math.max(1, allProps.length)
  const enfia = useMemo(()=>resolveEnfia({ propertyEnfia: prop?.enfia }).annual,[prop])

  // Ενεργό δάνειο στη χρήση Y; (μεταξύ έτους έναρξης και λήξης).
  const loanActiveInYear = (l:any)=>{ const yrs=Number(l.years)||0; if(yrs<=0)return false; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; return year>=startY && year<startY+yrs }

  // Ετήσια στοιχεία τρέχοντος ακινήτου. Φόρος επί ΔΕΔΟΥΛΕΥΜΕΝΟΥ (accrued) ενοικίου
  // — φορολογείται ό,τι οφείλεται, ανεξάρτητα είσπραξης· τα ανείσπρακτα μειώνουν
  // μόνο το ταμείο. (Μακροχρόνια.)
  const rentAccruedYear = useMemo(()=>rent.filter(p=>p.period_year===year).reduce((s,p)=>s+(p.amount||0),0),[rent,year])
  const rentCollectedYear = useMemo(()=>rent.filter(p=>p.paid&&p.period_year===year).reduce((s,p)=>s+(p.amount||0),0),[rent,year])
  const shortSummary = useMemo(()=>shortTermYearSummary(stays as any, year, { sqm: prop?.sqm, isHouse:false, propertyCount:propCount, individual:true }),[stays,year,prop,propCount])
  const expensesYear = useMemo(()=>expenses.filter(e=>(e.date||'').slice(0,4)===String(year)&&(e.amount||0)>0),[expenses,year])
  // Εξαιρούμε τον ΕΝΦΙΑ ως δαπάνη — τον μετράμε ξεχωριστά (αποφυγή διπλομέτρησης).
  const expensesTotal = useMemo(()=>expensesYear.filter(e=>e.category!=='ΕΝΦΙΑ').reduce((s,e)=>s+(e.amount||0),0),[expensesYear])
  const deductibleTotal = useMemo(()=>expensesYear.filter(e=>isGroupDeductible(e.expense_group)&&e.category!=='ΕΝΦΙΑ').reduce((s,e)=>s+(e.amount||0),0),[expensesYear])
  // Δόσεις δανείων ΜΟΝΟ όσο το δάνειο είναι ενεργό στη χρήση (όχι φαντάσματα).
  const loanAnnual = useMemo(()=>loans.reduce((s,l)=>{ if(!loanActiveInYear(l))return s; const m=annuityMonthly(Number(l.amount)||0,Number(l.rate)||0,Number(l.years)||0); return s+m*12 },0),[loans,year])
  const inventoryDepr = useMemo(()=>inventory.reduce((s,it)=>{ const val=Number(it.purchase_value)||0; if(val<=0||!it.purchase_date)return s; const py=Number(String(it.purchase_date).slice(0,4)); if(!py||py>year)return s; const life=usefulLifeYears(it.category); if(year-py>=life)return s; return s+val/life },0),[inventory,year])
  const loanInterestYear = useMemo(()=>loans.reduce((s,l)=>{ const amount=Number(l.amount)||0, rate=Number(l.rate)||0, yrs=Number(l.years)||0; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; const idx=year-startY+1; return s+interestForYear(amount,rate,yrs,idx) },0),[loans,year])

  const businessMode = mode==='professional' && elp==='business'
  // Απόσβεση κτιρίου (4% επί του τμήματος αξίας που αναλογεί στο κτίσμα) — μόνο επιχείρηση.
  const buildingDepr = useMemo(()=>{ const val=Number(prop?.value)||0; return val>0 ? Math.round(val*BUILDING_VALUE_FRACTION*BUILDING_DEPRECIATION_RATE) : 0 },[prop])
  const grossIncome = regime==='individual_shortterm' ? shortSummary.grossRevenue : rentAccruedYear
  const uncollectedRent = regime==='individual_shortterm' ? 0 : Math.max(0, rentAccruedYear - rentCollectedYear)

  // Ενοποίηση χαρτοφυλακίου (φυσικό πρόσωπο): ο φόρος είναι προοδευτικός στο ΣΥΝΟΛΟ
  // των ενοικίων (Ε1), όχι ανά ακίνητο. Υπολογίζεται ΠΑΝΤΑ, ώστε ο φόρος του τρέχοντος
  // ακινήτου να είναι το ΜΕΡΙΔΙΟ του από τον συνολικό — σωστά και για πολλά ακίνητα.
  const consolidation = useMemo(()=>{
    const items = (allProps.length?allProps:[{id:propertyId,name:prop?.name,rental_mode:prop?.rental_mode,enfia:prop?.enfia,sqm:prop?.sqm}]).map(p=>{
      const rmode:TaxRegime = p.rental_mode==='short_term' ? 'individual_shortterm' : 'individual_longterm'
      const pRentAccrued = allRent.filter(r=>r.property_id===p.id&&r.period_year===year).reduce((s,r)=>s+(r.amount||0),0)
      const pStays = allStays.filter(s=>s.property_id===p.id) as any[]
      const pShort = shortTermYearSummary(pStays, year, { sqm:p.sqm??null, isHouse:false, propertyCount:propCount, individual:true })
      const gross = rmode==='individual_shortterm' ? pShort.grossRevenue : pRentAccrued
      const input:StatementInput = { regime:rmode, grossIncome:gross, enfia: resolveEnfia({ propertyEnfia:p.enfia }).annual,
        climateLevy: rmode==='individual_shortterm'?pShort.levy:0, municipalTax: rmode==='individual_shortterm'?pShort.municipalTax:0 }
      return { id:p.id, name:p.name||'Ακίνητο', input }
    }).filter(x=>x.input.grossIncome>0)
    if(items.length===0) return null
    return { con: consolidateIndividual(items.map(i=>({id:i.id,input:i.input}))), names:Object.fromEntries(items.map(i=>[i.id,i.name])), count:items.length }
  },[allProps,allRent,allStays,year,propCount,prop,propertyId])
  const myTaxShare = useMemo(()=>consolidation?.con.perProperty.find(p=>p.id===propertyId)?.taxShare,[consolidation,propertyId])
  const portfolio = (mode==='professional' && elp==='personal') ? consolidation : null

  const statement:IncomeStatement = useMemo(()=>incomeStatement(
    businessMode
      ? { regime:'business', grossIncome, businessForm:elpForm, taxpayerAge: age||undefined,
          firstThreeYears: firstYears, companyDistribution: elpForm==='company'&&distribution!=='' ? Number(distribution)/100 : 0,
          // Για επιχείρηση ο ΕΝΦΙΑ ΕΚΠΙΠΤΕΙ → τον περνάμε στα εκπιπτόμενα, όχι ως μη-εκπεστέο τέλος.
          itemizedExpenses:deductibleTotal+enfia, depreciation:inventoryDepr, buildingDepreciation:buildingDepr,
          ekfaContributions: elpForm==='sole'&&ekfa!=='' ? Number(ekfa) : 0,
          presumptiveMinIncome: elpForm==='sole' ? Math.round(SELF_EMPLOYED_MIN_NET_INCOME_2026*(firstYears?0.5:1)) : undefined, enfia:0,
          climateLevy: regime==='individual_shortterm'?shortSummary.levy:0, municipalTax: regime==='individual_shortterm'?shortSummary.municipalTax:0,
          otherCashExpenses: Math.max(0,expensesTotal-deductibleTotal), loanPrincipal: Math.max(0,loanAnnual-loanInterestYear), uncollectedIncome:uncollectedRent }
      : { regime, grossIncome, enfia, overrideIncomeTax: myTaxShare,
          climateLevy: regime==='individual_shortterm' ? shortSummary.levy : 0,
          municipalTax: regime==='individual_shortterm' ? shortSummary.municipalTax : 0,
          otherCashExpenses: expensesTotal, loanPrincipal: loanAnnual, uncollectedIncome:uncollectedRent,
          legallyClaimedUncollected: claimedUncollected }
  ),[businessMode,elpForm,age,firstYears,distribution,ekfa,buildingDepr,claimedUncollected,regime,grossIncome,enfia,myTaxShare,shortSummary,expensesTotal,deductibleTotal,inventoryDepr,loanInterestYear,loanAnnual,uncollectedRent])

  // Συμβουλευτική — προτάσεις με αξία από τα πραγματικά δεδομένα (καθαρές, όχι θόρυβος).
  const advisory = useMemo(()=>buildAdvisory({
    regime: businessMode?'business':regime, businessForm: businessMode?elpForm:undefined, age: age||null,
    grossIncome, taxableIncome: statement.taxableIncome, effectiveRate: statement.effectiveRate,
    rentalMode: prop?.rental_mode, sqm: prop?.sqm, propertyCount: propCount,
    hasLoan: loans.some(l=>loanActiveInYear(l)), loanInterestYear, deductibleExpenses: deductibleTotal,
  }),[businessMode,regime,elpForm,age,grossIncome,statement,prop,propCount,loans,year,loanInterestYear,deductibleTotal])

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

  function exportBundle(){
    // Φάκελος για τον λογιστή: κατάσταση αποτελεσμάτων + κινήσεις έτους.
    const rows:(string|number)[][] = []
    rows.push(['ΚΑΤΑΣΤΑΣΗ ΑΠΟΤΕΛΕΣΜΑΤΩΝ', String(year), prop?.name||''])
    for(const l of statement.lines) rows.push([l.label, l.negative?-Math.round(l.amount):Math.round(l.amount), ''])
    rows.push(['Πρόβλεψη φόρου/μήνα', Math.round(provision.monthly), ''])
    rows.push(['', '', ''])
    rows.push(['ΚΙΝΗΣΕΙΣ', 'Ημερομηνία', 'Κατηγορία'])
    for(const e of book) rows.push([`${e.type==='income'?'+':'−'}${Math.round(e.amount)} — ${e.description}`, e.date, e.category])
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
    { label:'Μεικτά έσοδα', value:eur(statement.grossIncome), color:'var(--text-secondary)', icon:<TrendingUp size={15}/> },
    { label:'Φόρος εισοδήματος', value:eur(statement.incomeTax), sub:`Μέσος συντ. ${pct(statement.effectiveRate)}`, color:'var(--text-secondary)', icon:<TrendingDown size={15}/> },
    { label:'Καθαρό αποτέλεσμα', value:eur(statement.netProfit), color:statement.netProfit>=0?'var(--accent)':'var(--negative)', icon:<Wallet size={15}/> },
    { label:'Ταμειακό υπόλοιπο', value:eur(statement.netCash), sub:'μετά φόρους, τέλη & δάνειο', color:statement.netCash>=0?'var(--accent)':'var(--negative)', icon:<PiggyBank size={15}/> },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header: title + mode toggle + year */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ minWidth:0 }}>
          <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>Λογιστική</h2>
          <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'4px 0 0', fontFamily:"'Inter',sans-serif" }}>{regimeLabel} · έσοδα, φόρος, καθαρό — από τα πραγματικά δεδομένα σου.</p>
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
                <button key={f} onClick={()=>setElpForm(f)} title={f==='sole'?'Ατομική επιχείρηση — προοδευτική κλίμακα 9–44%':'Νομικό πρόσωπο (ΑΕ/ΕΠΕ/ΙΚΕ/ΟΕ/ΕΕ) — σταθερό 22%'} style={{ height:32, padding:'0 12px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12.5, fontFamily:"'Inter',sans-serif", fontWeight:elpForm===f?600:500, background:elpForm===f?'var(--accent)':'transparent', color:elpForm===f?'var(--accent-text)':'var(--text-secondary)', transition:'all 0.15s' }}>{label}</button>
              ))}
            </div>
          )}
          <button onClick={printReport} title="Λογιστική αναφορά (PDF) για τον λογιστή/τράπεζα" style={{ display:'inline-flex', alignItems:'center', gap:7, height:34, padding:'0 14px', borderRadius:17, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><Printer size={14}/>Αναφορά</button>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={()=>setYear(y=>y-1)} aria-label="Προηγούμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronLeft size={17}/></button>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', fontFamily:"'Inter',sans-serif", minWidth:60, textAlign:'center', fontVariantNumeric:'tabular-nums' }}>{year}</span>
            <button onClick={()=>setYear(y=>y+1)} aria-label="Επόμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronRight size={17}/></button>
          </div>
        </div>
      </div>

      {/* Παράμετροι επιχείρησης — διακριτικά, μόνο στο επιχειρηματικό καθεστώς */}
      {businessMode&&(
        <div style={{ display:'flex', alignItems:'center', gap:18, flexWrap:'wrap', padding:'10px 16px', borderRadius:12, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }}>
          {elpForm==='sole'&&(
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }} title="Ετήσιες ασφαλιστικές εισφορές ΕΦΚΑ — εκπίπτουν από το εισόδημα και μειώνουν το ταμείο.">
              Εισφορές ΕΦΚΑ/έτος
              <input type="number" inputMode="numeric" min={0} value={ekfa} onChange={e=>updateEkfa(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder="—"
                style={{ width:86, height:32, padding:'0 10px', borderRadius:9, border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'right' }}/>
            </label>
          )}
          {elpForm==='company'&&(
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }} title="Ποσοστό κερδών που διανέμεται ως μέρισμα — προσθέτει 5% φόρο μερισμάτων.">
              Διανομή κερδών
              <input type="number" inputMode="numeric" min={0} max={100} value={distribution} onChange={e=>setDistribution(e.target.value===''?'':Math.min(100,Math.max(0,Number(e.target.value))))} placeholder="0"
                style={{ width:64, height:32, padding:'0 10px', borderRadius:9, border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:13, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'right' }}/>
              <span style={{ color:'var(--text-tertiary)' }}>%</span>
            </label>
          )}
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", cursor:'pointer' }} title="Πρώτη τριετία δραστηριότητας: μειωμένο 1ο κλιμάκιο (4,5%) και μειωμένη προκαταβολή (−50%).">
            <input type="checkbox" checked={firstYears} onChange={e=>updateFirstYears(e.target.checked)} style={{ accentColor:'var(--accent)', width:15, height:15, cursor:'pointer' }}/>
            Πρώτη τριετία δραστηριότητας
          </label>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap:12 }}>
        {kpis.map(k=>(
          <div key={k.label} style={{ position:'relative', background:'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border:'1px solid var(--border-subtle)', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px -12px rgba(0,0,0,0.5)', overflow:'hidden', transition:'transform 0.16s ease, box-shadow 0.16s ease' }}
            onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.boxShadow='0 1px 0 rgba(255,255,255,0.06) inset, 0 16px 32px -12px rgba(0,0,0,0.55)'}}
            onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px -12px rgba(0,0,0,0.5)'}}>
            <span style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background:k.color, opacity:0.5 }}/>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, borderRadius:9, background:`color-mix(in srgb, ${k.color} 14%, transparent)`, color:k.color }}>{k.icon}</span>
              <p style={{ fontSize:11.5, fontFamily:"'Inter',sans-serif", fontWeight:500, color:'var(--text-secondary)', letterSpacing:'0.4px', textTransform:'uppercase', margin:0 }}>{k.label}</p>
            </div>
            <p style={{ fontSize:19, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', color:k.color==='var(--accent)'||k.color==='var(--negative)'?k.color:'var(--text-primary)', fontWeight:600, margin:0 }}>{k.value}</p>
            {k.sub&&<p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:'3px 0 0', fontFamily:"'Inter',sans-serif" }}>{k.sub}</p>}
          </div>
        ))}
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
            <label style={{ display:'flex', alignItems:'flex-start', gap:9, marginTop:12, paddingTop:12, borderTop:'1px solid var(--border-subtle)', cursor:'pointer' }} title="Άρθρο 39 §4: τα ανείσπρακτα ενοίκια δεν φορολογούνται εφόσον έχουν διεκδικηθεί νομικά (διαταγή πληρωμής, αγωγή έξωσης κ.λπ.) πριν την προθεσμία δήλωσης.">
              <input type="checkbox" checked={claimedUncollected} onChange={e=>setClaimedUncollected(e.target.checked)} style={{ accentColor:'var(--accent)', width:15, height:15, marginTop:1, cursor:'pointer', flexShrink:0 }}/>
              <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>Τα ανείσπρακτα ({eur(uncollectedRent)}) έχουν <strong style={{ color:'var(--text-primary)' }}>διεκδικηθεί νομικά</strong> — να μη φορολογηθούν φέτος (άρθρο 39 §4).</span>
            </label>
          )}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ ...card, background:'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, var(--bg-elevated)) 0%, var(--bg-surface) 100%)' }}>
            <p style={cardTitle}>Φόρος να βάλεις στην άκρη</p>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
              <span style={{ fontSize:26, fontWeight:700, color:'var(--accent)', fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums' }}>{eur(provision.monthly)}</span>
              <span style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>ανά μήνα</span>
            </div>
            <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>
              Σύνολο <strong style={{ color:'var(--text-primary)' }}>{eur(provision.annualTaxTotal)}</strong> τον χρόνο = φόρος εισοδήματος <strong style={{ color:'var(--text-primary)' }}>{eur(provision.incomeTax)}</strong>{provision.propertyTaxes>0?<> + φόροι/τέλη ακινήτου <strong style={{ color:'var(--text-primary)' }}>{eur(provision.propertyTaxes)}</strong></>:''}. Προκύπτει από φορολογητέο {eur(statement.taxableIncome)}{!businessMode&&myTaxShare!=null&&(consolidation?.count??0)>1?', ως μερίδιο του συνολικού προοδευτικού φόρου του χαρτοφυλακίου':''}. Ισόποσα {eur(provision.monthly)} ανά μήνα{year===athensYear()?<>· για να προλάβεις έως το τέλος του έτους <strong style={{ color:'var(--text-primary)' }}>{eur(provision.perRemainingMonth)} ανά μήνα</strong></>:''}.{provision.advanceTax>0?<> Συν <strong style={{ color:'var(--text-primary)' }}>προκαταβολή φόρου {eur(provision.advanceTax)}</strong> έναντι του επόμενου έτους (πιστώνεται τότε) — ταμειακή ανάγκη 1ου έτους <strong style={{ color:'var(--text-primary)' }}>{eur(provision.firstYearTotal)}</strong>.</>:''}
            </p>
          </div>
          <div style={{ ...card, display:'flex', gap:10, alignItems:'flex-start' }}>
            <Info size={15} style={{ color:'var(--accent)', flexShrink:0, marginTop:1 }}/>
            <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>
              {businessMode
                ? (elpForm==='company' ? 'Νομικό πρόσωπο: 22% επί των καθαρών κερδών (μετά από εκπιπτόμενα έξοδα, αποσβέσεις κτιρίου/εξοπλισμού και τόκους), συν προκαταβολή φόρου 80% και 5% φόρος στη διανομή μερίσματος.' : 'Ατομική επιχείρηση: κλίμακα άρθρου 15 (9–44%) επί των καθαρών κερδών, μετά από εκπιπτόμενα έξοδα, ΕΦΚΑ, αποσβέσεις και τόκους — με τεκμαρτό ελάχιστο καθαρό εισόδημα και προκαταβολή φόρου 55%.')
                : (regime==='individual_longterm' ? 'Μακροχρόνια μίσθωση φυσικού προσώπου: τεκμαρτή έκπτωση 5% και προοδευτική κλίμακα ενοικίων 2026. Ο φόρος υπολογίζεται στο σύνολο των ενοικίων σου (Ε1).' : 'Βραχυχρόνια μίσθωση: φόρος στα μεικτά με την κλίμακα 2026, συν ΤΑΚΚ και τέλος παρεπιδημούντων όπου ισχύει.')}
              {' '}Εκτιμήσεις — επιβεβαίωση με τον λογιστή σου ή στο <a href={AADE_CALENDAR_URL} target="_blank" rel="noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>myAADE</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Φορολογική κλίμακα 2026 — αναφορά ανά καθεστώς (έμφαση στο κλιμάκιο του χρήστη) */}
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
        <div style={{ ...card, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:44, height:44, borderRadius:12, background:'var(--accent-soft)', color:'var(--accent)', fontSize:17, fontWeight:700, fontFamily:"'Inter',sans-serif", flexShrink:0 }}>22%</span>
          <div>
            <p style={{ ...cardTitle, margin:0 }}>Νομικό πρόσωπο — σταθερός συντελεστής 22%</p>
            <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:'4px 0 0', fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>Τα νομικά πρόσωπα (ΑΕ, ΕΠΕ, ΙΚΕ, ΟΕ, ΕΕ) φορολογούνται με 22% επί των καθαρών κερδών, ανεξαρτήτως ύψους εισοδήματος. Επιπλέον ισχύει προκαταβολή φόρου — επιβεβαίωσε με τον λογιστή σου.</p>
          </div>
        </div>
      )}

      {/* Επαγγελματίας: ενοποίηση χαρτοφυλακίου + εκπιπτόμενα */}
      {mode==='professional'&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16 }}>
          {elp==='personal'&&(
          <div style={card}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <Layers size={15} style={{ color:'var(--accent)' }}/>
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
            <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.5 }}>Για <strong style={{ color:'var(--text-primary)' }}>φυσικό πρόσωπο με μακροχρόνια κατοικίας</strong> τα έξοδα δεν εκπίπτουν αναλυτικά (ισχύει η τεκμαρτή έκπτωση 5%). Στο καθεστώς <strong style={{ color:'var(--text-primary)' }}>Επιχείρηση (ΕΛΠ)</strong> εκπίπτουν αναλυτικά, μαζί με <strong style={{ color:'var(--text-primary)' }}>αποσβέσεις εξοπλισμού</strong> ({eur(inventoryDepr)}/έτος) και <strong style={{ color:'var(--text-primary)' }}>τόκους δανείων</strong> ({eur(loanInterestYear)}/έτος) — δες την κατάσταση με τον διακόπτη «Επιχείρηση (ΕΛΠ)».</p>
          </div>
        </div>
      )}

      {/* Συμβουλευτική — καθαρές, στοχευμένες προτάσεις με αξία */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <Lightbulb size={16} style={{ color:'var(--accent)' }}/>
            <div>
              <p style={{ ...cardTitle, margin:0 }}>Συμβουλευτική</p>
              <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'3px 0 0', fontFamily:"'Inter',sans-serif" }}>Ιδέες φορολογίας, χρηματοδότησης και αξιοποίησης — από τα δικά σου δεδομένα.</p>
            </div>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>
            Ηλικία
            <input type="number" inputMode="numeric" min={16} max={99} value={age} onChange={e=>updateAge(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder="—"
              title="Προαιρετικό — ενεργοποιεί τη μειωμένη κλίμακα νέων (ν.5246/2025) στην επιχειρηματική δραστηριότητα."
              style={{ width:64, height:34, padding:'0 10px', borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:13.5, fontFamily:"'Inter',sans-serif", fontVariantNumeric:'tabular-nums', textAlign:'center' }}/>
          </label>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap:12 }}>
          {advisory.map(a=>(
            <div key={a.id} style={{ position:'relative', display:'flex', flexDirection:'column', gap:7, padding:'14px 16px 14px 17px', borderRadius:13, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }}>
              <span style={{ position:'absolute', top:14, left:0, width:3, height:20, borderRadius:2, background:a.tone==='caution'?'var(--warning)':'var(--accent)', opacity:0.6 }}/>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{ADVISORY_TONE[a.tone]}</span>
              </div>
              <p style={{ fontSize:13.5, fontWeight:600, color:'var(--text-primary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.35 }}>{a.title}</p>
              <p style={{ fontSize:12.5, color:'var(--text-secondary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>{a.body}</p>
              {(a.refer||a.linkHref)&&(
                <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:2, flexWrap:'wrap' }}>
                  {a.refer&&<span style={{ fontSize:11.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{referLabel(a.refer)}</span>}
                  {a.linkHref&&<a href={a.linkHref} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, color:'var(--accent)', textDecoration:'none', fontFamily:"'Inter',sans-serif" }}>{a.linkLabel||'Περισσότερα'}<ArrowUpRight size={12}/></a>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:9, alignItems:'flex-start', marginTop:14, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
          <Info size={14} style={{ color:'var(--text-tertiary)', flexShrink:0, marginTop:1 }}/>
          <p style={{ fontSize:11.5, color:'var(--text-tertiary)', margin:0, fontFamily:"'Inter',sans-serif", lineHeight:1.55 }}>Οι προτάσεις είναι ενημερωτικές και δεν υποκαθιστούν τον λογιστή, τον δικηγόρο ή τον συμβολαιογράφο σου. Για την επίσημη εξαγωγή συμπερασμάτων και δηλώσεων απευθύνσου σε πιστοποιημένο επαγγελματία.</p>
        </div>
      </div>

      {/* Ταμειακές ροές */}
      <div style={card}>
        <p style={cardTitle}>Ταμειακές ροές {year}</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:8, alignItems:'end', minHeight:130 }}>
          {cash.map((c,i)=>(
            <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:100 }}>
                <div title={`Έσοδα: ${eur(c.income)}`} style={{ width:9, height:`${Math.round(c.income/maxCash*100)}%`, minHeight:c.income>0?3:0, background:'var(--positive)', borderRadius:'3px 3px 0 0', opacity:0.85 }}/>
                <div title={`Έξοδα: ${eur(c.expense)}`} style={{ width:9, height:`${Math.round(c.expense/maxCash*100)}%`, minHeight:c.expense>0?3:0, background:'var(--negative)', borderRadius:'3px 3px 0 0', opacity:0.75 }}/>
              </div>
              <span style={{ fontSize:9.5, color:'var(--text-tertiary)', fontFamily:"'Inter',sans-serif" }}>{MONTHS_GR[i].slice(0,1)}</span>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:16, marginTop:12, paddingTop:10, borderTop:'1px solid var(--border-subtle)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}><span style={{ width:9, height:9, borderRadius:2, background:'var(--positive)' }}/>Έσοδα</span>
          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}><span style={{ width:9, height:9, borderRadius:2, background:'var(--negative)' }}/>Έξοδα</span>
        </div>
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
        </div>

        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ ...cardTitle, margin:0 }}>{mode==='professional'?'Βιβλίο εσόδων-εξόδων':'Πρόσφατες κινήσεις'}</p>
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
    </div>
  )
}
