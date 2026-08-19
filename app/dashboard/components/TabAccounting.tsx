'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as properties from '@/lib/data/properties';
import * as loanStore from '@/lib/data/loans';
import * as stayStore from '@/lib/data/stays';
import * as rentStore from '@/lib/data/rent';
import * as tenantStore from '@/lib/data/tenants';
import { rentCollectionMode, collectionModeReason } from '@/lib/tax/rentCollectionMode';
import * as expenseStore from '@/lib/data/expenses';
import { T, TT, Skeleton, SkeletonKPIs, fe, fp, fixedCols } from '@/components/Theme'
import { ActionMenu } from '@/components/ActionMenu'
import { ChevronLeft, ChevronRight, Download, Layers, Lightbulb, ArrowUpRight } from 'lucide-react'
import { buildAdvisory, referLabel, type AdvisoryTone } from '@/lib/accounting/advisory'
import { REGULATORY_UPDATES_2026, type RegulatoryUpdate, type UpdateAudience } from '@/lib/accounting/updates2026'
import { transferCosts } from '@/lib/accounting/transfer'
import { InfoHint } from './InfoHint'
import type { LegalForm as DossierLegalForm } from '@/lib/accounting/dossier'
import { businessFormOf } from '@/lib/accounting/taxProfile'
import type { ClientStaysRow, ExpensesRow, InventoryItemsRow, RentPaymentsRow, UserPropertiesRow } from '@/lib/supabase/tables'
// Η απογραφή έχει ένα σπίτι: lib/data/inventory.
import * as inventoryStore from '@/lib/data/inventory';
import * as accountantLink from '@/lib/data/accountantLink';
import type { LoanView } from '@/lib/loans/shape'
import type { TaxStay } from '@/lib/tax/shortTermTax'
import { saved, savedData } from '@/components/dbWrite'
import BankImport from './BankImport'
import E2ReconcileCard from './E2ReconcileCard'
import { Landmark, Lock, Unlock } from 'lucide-react'
import {
  buildLedger, cashflowByYear, reconcile, reconSummary,
  type LedgerInput, type Expected, type Actual, type ReconStatus,
} from '@/lib/accounting/ledger'
import {
  buildJournal, trialBalance, journalTotals,
  type IncomeRec, type ExpenseRec, type LoanPaymentRec,
} from '@/lib/accounting/journal'
import {
  incomeStatement, taxProvision, consolidateIndividual,
  type TaxRegime, type StatementInput, type IncomeStatement,
} from '@/lib/accounting/statement'
import { shortTermYearSummary, platformFeeExpenses, staysMissingPlatformFee } from '@/lib/tax/shortTermTax'
import { resolveEnfia } from '@/lib/billing/propertyFacts'
import { estimateENFIAFromFacts, enfiaTypeBlock, ENFIA_TYPE_BLOCK_NOTE } from '@/lib/billing/enfia'
import { annuityMonthly, interestForYear } from '@/lib/loans/recommend'
import { isGroupDeductible } from '@/lib/expenses/groups'
import { RENTAL_TAX_ROWS_2026, BUSINESS_INCOME_ROWS_2026, BUILDING_DEPRECIATION_RATE, EQUIPMENT_DEPRECIATION_RATE, BUILDING_VALUE_FRACTION, SELF_EMPLOYED_MIN_NET_INCOME_2026 , rentalBracketsForYear, bracketsLabelForYear } from '@/lib/billing/greekTax'
import { useReportBranding } from '@/lib/reportBranding'
import { hasFeature, planAtLeast } from '@/lib/billing/entitlements'
import type { VatDeduction } from '@/lib/tax/myData'
import type { PlanId } from '@/lib/billing/plans'
import { exportAccountantBundle, toMovement } from './accountantExport'
import { buildRegister, chargeForYear, RENTED_PROPERTY_ACCOUNT, EQUIPMENT_ACCOUNT } from '@/lib/accounting/fixedAssets'
import { declarableGrossOrTotal } from '@/lib/clients/stayAmounts'
import { CAPITALISABLE } from '@/lib/tax/elpAccounts'
import { CATEGORIES, resolveCategory } from '@/lib/expenses/taxonomy'
import EnfiaPanel from './EnfiaPanel';
import AccountantDossier, { useAccountantDossier } from './AccountantDossier'
import { fetchDossierPapers } from './dossierPapers'
import { defaultBookkeeping, type LegalForm } from '@/lib/accounting/dossier'
import { readStatus, type PropertyStatus, type StatusRow } from '@/lib/property/status'
import { printAccountingReport, downloadOfficialAccountingReport, type ReconLite } from './accountingReport'
import { printRentCertificate, downloadOfficialRentCertificate } from './rentCertificate'
import ReportBuilder from './ReportBuilder'
import JournalExport from './JournalExport'
import OwnerSplit from './OwnerSplit'
import RentAdjustmentModal from './RentAdjustmentModal'
import { AADE_CALENDAR_URL } from '@/lib/tax/greekTaxCalendar'
import { Printer, ShieldCheck } from 'lucide-react'
import { notifyError } from '@/components/Toast';
import { MONTHS_NOM, MONTHS_SHORT } from '@/lib/core/months';
import { failed, MSG } from '@/lib/core/dbError';

// ΔΥΟ ΟΝΟΜΑΤΑ ΓΙΑ ΤΗΝ ΙΔΙΑ ΣΥΝΑΡΤΗΣΗ. Ήταν `eur = fe(n,0)` και `eur2 = fe(n)`,
// δηλαδή «στρογγυλό» και «ακριβές» — αλλά το δεύτερο όρισμα του `fe` αγνοούνταν,
// οπότε οι δύο ήταν πανομοιότυπες και η πρόθεση είχε χαθεί σιωπηλά.
const eur = fe
// Το ποσοστό ερχόταν από τέταρτο τοπικό μορφοποιητή, με ένα δεκαδικό.
const pct = (n:number)=>fp(n*100)
function athensNow(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Athens'})) }
function athensYear(){ return athensNow().getFullYear() }
function todayAthens(){ const d=athensNow(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// ΧΩΡΙΣ ΣΗΜΑΣΙΟΛΟΓΙΚΟ ΠΡΑΣΙΝΟ ΚΑΙ ΚΟΚΚΙΝΟ. Η κατάσταση της δόσης λέγεται με τη
// ΛΕΞΗ της, που είναι σαφής και σε όποιον δεν ξεχωρίζει χρώματα. Το βάρος του
// κειμένου ξεχωρίζει ό,τι ζητά ενέργεια από ό,τι έκλεισε — ιεραρχία με μέγεθος
// και βάρος, όπως σε κάθε άλλη οθόνη της εφαρμογής.
const STATUS_META:Record<ReconStatus,{label:string;color:string;strong:boolean}> = {
  paid:     { label:'Πληρώθηκε',  color:'var(--text-tertiary)',  strong:false },
  partial:  { label:'Μερικώς',    color:'var(--text-primary)',   strong:true  },
  unpaid:   { label:'Εκκρεμεί',   color:'var(--text-secondary)', strong:false },
  overdue:  { label:'Εκπρόθεσμο', color:'var(--text-primary)',   strong:true  },
}

// Οι ίδιοι τόνοι για το τυπωμένο χαρτί, όπου δεν υπάρχουν μεταβλητές θέματος.
// Ήταν τέσσερα ωμά χρώματα, γραμμένα ΔΥΟ φορές μέσα στο αρχείο.
const STATUS_PRINT:Record<ReconStatus,string> = {
  paid:'#5f6368', partial:'#202124', unpaid:'#5f6368', overdue:'#202124',
}

// Κάρτα λογιστικής: καθαρή, ανασηκωμένη με σκιά (3D) αλλά ΧΩΡΙΣ λευκό περίγραμμα/
// γυαλάδα (highlight-inset). Ήσυχο, Stripe/Apple αίσθηση, ομοιόμορφο σε όλο το tab.
// Κάρτα: ΚΑΜΙΑ ορατή περίμετρος (το «λευκό γύρω γύρω»). Το βάθος/ζωντάνια έρχεται
// αποκλειστικά από την ανασηκωμένη επιφάνεια + τη σκιά, όπως σε Apple/Stripe.
const card:React.CSSProperties = { position:'relative', background:'var(--surface-raised)', border:'none', borderRadius:14, padding:16, boxShadow:'var(--elev-1)' }
const cardTitle:React.CSSProperties = { fontSize:13, fontWeight:700, color:'var(--text-primary)', margin:'0 0 14px', fontFamily: T.font.sans, letterSpacing:'0.1px' }

// Οι στήλες του ισοζυγίου, ΜΙΑ φορά: επικεφαλίδες, γραμμές και σύνολα διαβάζουν
// την ίδια τιμή. Γραμμένες τρεις φορές, μια αλλαγή σε δύο από τις τρεις έδινε
// πίνακα με μετατοπισμένα σύνολα — που δεν σκάει πουθενά, απλώς είναι λάθος.
// Η πρώτη στήλη χωρά την επικεφαλίδα της. Ήταν 72px με «Κωδικός», στένεψε σε
// 64px ενώ η επικεφαλίδα μεγάλωνε σε «Κωδικός ΕΛΠ», και έσπαγε σε δύο γραμμές.
const TRIAL_COLS = '86px minmax(120px,1fr) 92px 92px 100px'
// Το άθροισμα των στηλών, των πέντε κενών και του padding. Κάτω από αυτό ο
// πίνακας κυλά· δεν συμπιέζεται, γιατί συμπίεση εδώ σημαίνει στήλη που χάνεται.
const TRIAL_MIN = 86 + 120 + 92 + 92 + 100 + 8 * 4 + 28

// Χρώμα μόνο στη γραμμή αποτελέσματος, αλλού ουδέτερο (χωρίς θόρυβο).
// Ήπια, ουδέτερη ένδειξη τόνου για τη συμβουλευτική (χωρίς έντονα χρώματα/λίστες).
const ADVISORY_TONE:Record<AdvisoryTone,string> = { opportunity:'Ευκαιρία', action:'Ενέργεια', insight:'Ιδέα', caution:'Προσοχή' }

// Minimal, premium checkbox (Google-level): μικρό, καθαρό, με ήπιο animation.
function Check({ checked, onChange, label, hint, align='center' }:{ checked:boolean; onChange:(v:boolean)=>void; label:React.ReactNode; hint?:string; align?:'center'|'start' }){
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={()=>onChange(!checked)} title={hint}
      style={{ display:'inline-flex', alignItems:align==='start'?'flex-start':'center', gap:9, background:'none', border:'none', padding:0, cursor:'pointer', fontSize:13, color:'var(--text-secondary)', fontFamily: T.font.sans, textAlign:'left', lineHeight:1.5 }}>
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:17, height:17, borderRadius:6, border:`1.5px solid ${checked?'var(--accent)':'var(--border-default)'}`, background:checked?'var(--accent)':'var(--bg-surface)', transition:'border-color 0.14s, background 0.14s', flexShrink:0, marginTop:align==='start'?1:0 }}>
        {checked&&<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.2 2.2L9.5 3.6" stroke="var(--accent-text)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </span>
      <span>{label}</span>
    </button>
  )
}

// ═══ ΟΙ ΤΡΕΙΣ ΑΡΙΘΜΟΙ ΤΗΣ ΧΡΟΝΙΑΣ ══════════════════════════════════════════
// Ήταν πέντε, σε δύο σειρές με ΔΙΑΦΟΡΕΤΙΚΟ μέγεθος κουτιού: δύο μεγάλα από
// πάνω, τρία μικρά από κάτω. Η ιεραρχία διαβαζόταν σαν λάθος στοίχιση, και τα
// τρία μικρά («Μεικτά έσοδα», «Φόρος εισοδήματος», «Καθαρό αποτέλεσμα») ήταν
// ΟΛΑ γραμμές της Κατάστασης Αποτελεσμάτων που ακολουθούσε αμέσως από κάτω:
// ο ίδιος αριθμός, δύο φορές, σε απόσταση μιας ανάσας.
//
// Μένουν τρεις, ίδιου μεγέθους, σε μία ευθεία, και είναι οι τρεις αποφάσεις:
// τι μου μένει, τι θα πληρώσω, τι βάζω στην άκρη κάθε μήνα. Η ΠΡΟΕΛΕΥΣΗ κάθε
// αριθμού μένει στην Κατάσταση Αποτελεσμάτων, εκεί που ανήκει.
function Kpi({ label, value, note, hot, tone='accent', onHover }:{
  label:string; value:string; note:React.ReactNode; hot:boolean; tone?:'accent'|'negative'; onHover:(v:boolean)=>void
}){
  return (
    <div onMouseEnter={()=>onHover(true)} onMouseLeave={()=>onHover(false)}
      style={{ ...card, padding:'18px 20px', minWidth:0, borderColor:hot?'var(--border-default)':undefined, transition:'border-color 0.15s' }}>
      <p style={{ ...TT.label, color:'var(--text-tertiary)', margin:0 }}>{label}</p>
      <p style={{ ...TT.kpi, fontSize:24, color:hot?(tone==='negative'?'var(--negative)':'var(--accent)'):'var(--text-primary)', margin:'11px 0 0', transition:'color 0.15s' }}>{value}</p>
      <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'9px 0 0', fontFamily: T.font.sans, lineHeight:1.5 }}>{note}</p>
    </div>
  )
}

export default function TabAccounting({ propertyId, userId, profileType='individual', legalForm='individual', plan='free', onNavigate }: { propertyId:string; userId:string; profileType?:'individual'|'professional'; legalForm?:DossierLegalForm; plan?:PlanId; onNavigate?:(tab:string)=>void }) {
  const supabase = createClient()
  const branding = useReportBranding(userId)
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [genOfficial, setGenOfficial] = useState(false)
  const [genOfficialCert, setGenOfficialCert] = useState(false)
  const [loading,setLoading] = useState(true)
  const [year,setYear] = useState(athensYear())
  // Η καρτέλα ακολουθεί το προφίλ (Ρυθμίσεις): ο ιδιώτης βλέπει απλή εικόνα, ο
  // επαγγελματίας τη διάκριση Φυσικό πρόσωπο / Επιχείρηση (ΕΛΠ). Χωρίς περιττό toggle.
  const mode:'individual'|'professional' = profileType
  // ── ΔΥΟ ΔΙΑΚΟΠΤΕΣ ΠΟΥ ΞΑΝΑΡΩΤΟΥΣΑΝ ΤΗ ΝΟΜΙΚΗ ΜΟΡΦΗ ──────────────────────
  // Δηλώνεται ΜΙΑ φορά, στην υποδοχή, και ζει στο `billing_profiles.legal_form`.
  // Εδώ υπήρχαν δύο τοπικά αντίγραφά της, με δικά τους κουμπιά, και η καρτέλα
  // Αποδόσεις είχε τρίτο. Ο χρήστης μπορούσε να δηλώσει «Νομικό πρόσωπο» εδώ,
  // «Ατομική» δίπλα και «Φυσικό» στο προφίλ — τρεις οθόνες, τρεις φόροι.
  //
  // Το `legal_form` ξέρει ήδη και τα δύο: αν υπάρχει επιχείρηση, και αν είναι
  // ατομική ή νομικό πρόσωπο. Αν κάτι είναι λάθος, διορθώνεται εκεί που δηλώθηκε.
  // ── ΤΟ «ΦΥΣΙΚΟ ΠΡΟΣΩΠΟ Ή ΕΠΙΧΕΙΡΗΣΗ» ΜΕΝΕΙ ΕΡΩΤΗΣΗ, ΚΑΙ ΝΑ ΓΙΑΤΙ ────────
  // Το είχα παραγάγει από τη νομική μορφή: «έχει επιχείρηση, άρα επιχείρηση».
  // Είναι λάθος, και το γράφει η ίδια η εφαρμογή σε τρία σημεία: το ενοίκιο
  // φυσικού προσώπου φορολογείται με το ΑΡΘΡΟ 40 (δική του κλίμακα, τεκμαρτή
  // έκπτωση 5%), όχι με το άρθρο 15. Το κριτήριο είναι αν το ΑΚΙΝΗΤΟ ανήκει
  // στην επιχείρηση, όχι αν ο ιδιοκτήτης έχει ΑΦΜ επιχείρησης για άσχετη
  // δραστηριότητα. Σε ενοίκια 18.000 €, η παραγωγή έβγαζε φόρο 2.012 αντί
  // 3.075 και πρόβλεψη 167,70 τον μήνα αντί 292,75: ο χρήστης θα έβρισκε το
  // κενό στο εκκαθαριστικό.
  //
  // Άρα μένει επιλογή, με προεπιλογή το σωστό για τη συντριπτική πλειονότητα.
  const [elp,setElp] = useState<'personal'|'business'>('personal')
  // Η ΜΟΡΦΗ όμως ΔΕΝ είναι ερώτηση: δηλώθηκε στην υποδοχή και η αντιστοίχισή
  // της σε φορολογικό καθεστώς ζει σε ένα σημείο, με τεστ (lib/accounting/taxProfile).
  const elpForm = businessFormOf(legalForm)
  // Ηλικία, μόνο για τη μειωμένη κλίμακα νέων (ν.5246/2025). Τοπική, προαιρετική.
  const [age,setAge] = useState<number|''>('')
  // Επιχειρηματικές παράμετροι (τοπικές, προαιρετικές): ετήσιες εισφορές ΕΦΚΑ,
  // πρώτη τριετία δραστηριότητας, ποσοστό διανομής κερδών νομικού προσώπου.
  const [ekfa,setEkfa] = useState<number|''>('')
  const [firstYears,setFirstYears] = useState(false)
  const [distribution,setDistribution] = useState<number|''>('')
  const [claimedUncollected,setClaimedUncollected] = useState(false)
  // ═══════════════════════════════════════════════════════════════════════
  // Η ΤΡΑΠΕΖΙΚΗ ΕΙΣΠΡΑΞΗ ΠΑΡΑΓΕΤΑΙ, ΔΕΝ ΠΡΟΕΠΙΛΕΓΕΤΑΙ.
  // ─────────────────────────────────────────────────────────────────────
  // Ηταν `useState(true)`: η οθόνη που βγάζει τον φόρο προεπέλεγε την εκδοχή
  // που δίνει την έκπτωση 5%, δηλαδή τον ΜΙΚΡΟΤΕΡΟ φόρο, για ερώτημα που η
  // εφαρμογή ήδη ξέρει — απο τον τρόπο κάθε είσπραξης και απο τον διακόπτη
  // της μίσθωσης. Η «Φροντίδα μισθωτή» χρησιμοποιούσε ήδη τον δεύτερο σωστά.
  //
  // Ο κανόνας ζει στο lib/tax/rentCollectionMode.ts. Εδώ μένει μόνο η
  // ΠΑΡΑΚΑΜΨΗ: ο χρήστης μπορεί να διαφωνήσει με ό,τι παρήγαγε η εφαρμογή,
  // και τότε μετράει η δική του απάντηση.
  // ═══════════════════════════════════════════════════════════════════════
  const [leaseViaBank,setLeaseViaBank] = useState<boolean|null>(null)
  const [rentsBankOverride,setRentsBankOverride] = useState<boolean|null>(null)
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
  const [hoverBracket,setHoverBracket] = useState<number|null>(null)
  // Ουδετερότητα: οι αριθμοί είναι μελάνι· χρώμα ΜΟΝΟ στο hover, στα νούμερα με νόημα.
  const [hoverStat,setHoverStat] = useState<string|null>(null)
  const [tenant,setTenant] = useState<{ full_name?:string; afm?:string }|null>(null)
  const [xferOpen,setXferOpen] = useState(true)
  const [cashOpen,setCashOpen] = useState(true)
  // ── ΠΟΙΟΣ ΒΛΕΠΕΙ ΤΟ ΔΙΠΛΟΓΡΑΦΙΚΟ ΒΑΘΟΣ ──────────────────────────────────
  // Το ισοζύγιο και το ημερολόγιο άρθρων ήταν κλειδωμένα πίσω από το
  // `profileType`, που ΔΕΝ είναι συνδρομή: είναι διακόπτης εμφάνισης στις
  // Ρυθμίσεις. Δύο λάθη ταυτόχρονα. Ο συνεργάτης και ο χρήστης με δωρεάν μήνες
  // παίρνουν πλάνο «Επαγγελματίας» κρατώντας προφίλ «Ιδιώτη» — δεν έβλεπαν ό,τι
  // δικαιούνταν· και αντίστροφα, ο διακόπτης εμφάνισης δεν επιτρέπεται να
  // ξεκλειδώνει χρεώσιμο εργαλείο. Το μητρώο το λέει ήδη μία φορά, με τεστ:
  // `accounting_journal` από «Επαγγελματίας» και πάνω, όπως το γράφει και η
  // κάρτα του πακέτου. Το `doubleEntry` μένει δίπλα του γιατί απαντά άλλο
  // ερώτημα — όχι «το πληρώνει;» αλλά «το έχει;»: ισοζύγιο χωρίς διπλογραφικά
  // βιβλία δεν υπάρχει, σε κανένα πλάνο.
  const canJournal = hasFeature({ plan }, 'accounting_journal')
  // Τα ίδιο ερώτημα για τα τρία εργαλεία χαρτοφυλακίου του μενού: τα δίνει η
  // ΣΥΝΔΡΟΜΗ (όλα «Επαγγελματίας»), όχι ο διακόπτης εμφάνισης. Ίδιος λόγος με
  // το ημερολόγιο άρθρων — και ίδιος χρήστης που τα έχανε.
  //
  // ΚΑΘΕΝΑ ΡΩΤΑΕΙ ΓΙΑ ΤΟΝ ΕΑΥΤΟ ΤΟΥ. Και τα τρία κρέμονταν από ένα κλειδί, το
  // `bank_import`. Σήμερα δεν φαίνεται γιατί όλα ξεκλειδώνουν στο ίδιο σκαλί —
  // την ημέρα όμως που η εισαγωγή κινήσεων κατέβει ένα πακέτο, θα κατέβαινε
  // μαζί της και η σύνθεση αναφοράς, χωρίς να το ζητήσει κανείς.
  // Η ΠΥΛΗ ΛΟΓΙΣΤΗ ΕΙΝΑΙ Η ΕΞΑΓΩΓΗ Ε2 ΜΕ ΑΛΛΗ ΠΟΡΤΑ, άρα ΙΔΙΟ χαρακτηριστικό.
  // Δεύτερο όνομα εδώ θα σήμαινε δύο κατώφλια για ένα παραδοτέο, που θα
  // απέκλιναν στην πρώτη αλλαγή τιμολόγησης. Η πραγματική κλειδαριά ζει στη
  // βάση (get_accountant_data, 20260819120000)· εδώ είναι η ΕΞΗΓΗΣΗ, ώστε ο
  // ιδιοκτήτης να μη μοιράσει σύνδεσμο που δεν θα ανοίξει.
  const canAccountantPortal = hasFeature({ plan }, 'e2_export')
  const canBankImport = hasFeature({ plan }, 'bank_import')
  // Η σύνθεση αναφοράς κατεβάζει τη σύγκριση ΟΛΟΚΛΗΡΟΥ του χαρτοφυλακίου: είναι
  // η ίδια δυνατότητα με την καρτέλα «Χαρτοφυλάκιο», από άλλη πόρτα.
  const canPortfolioReport = hasFeature({ plan }, 'portfolio')
  // Η κατανομή σε συνιδιοκτήτες δεν πωλείται χωριστά και δεν έχει δική της
  // εγγραφή στο μητρώο δυνατοτήτων. Έρχεται ολόκληρη με το «Επαγγελματίας», και
  // το γράφουμε έτσι αντί να τη δανειστούμε από ξένο κλειδί.
  const canOwnerSplit = planAtLeast(plan, 'agency')
  // Τα προχωρημένα εργαλεία ξεκινούν κλειστά για ΟΛΟΥΣ. Ο επαγγελματίας τα
  // βρίσκει με ένα κλικ· ο ιδιώτης δεν χρειάζεται να τα προσπεράσει κάθε φορά.
  const [advancedOpen,setAdvancedOpen] = useState(false)
  // Live πύλη λογιστή (χωρίς login/email): ένας σύνδεσμος με token ανά χρήστη.
  const [acctCopied,setAcctCopied] = useState(false)
  const [acctBusy,setAcctBusy] = useState(false)
  const [acctLink,setAcctLink] = useState<string|null>(null)
  const [acctRevoked,setAcctRevoked] = useState(false)
  const [acctUntil,setAcctUntil] = useState('')
  useEffect(()=>{ try{
    const v=localStorage.getItem('acc_age'); if(v) setAge(Number(v)||'')
    const e=localStorage.getItem('acc_ekfa'); if(e) setEkfa(Number(e)||'')
    setFirstYears(localStorage.getItem('acc_first3')==='1')
  }catch{} },[])
  const updateAge=(v:number|'')=>{ setAge(v); try{ if(v) localStorage.setItem('acc_age',String(v)); else localStorage.removeItem('acc_age') }catch{} }
  const updateEkfa=(v:number|'')=>{ setEkfa(v); try{ if(v) localStorage.setItem('acc_ekfa',String(v)); else localStorage.removeItem('acc_ekfa') }catch{} }
  const updateFirstYears=(v:boolean)=>{ setFirstYears(v); try{ localStorage.setItem('acc_first3',v?'1':'0') }catch{} }
  // ── ΤΙ ΑΚΡΙΒΩΣ ΖΗΤΑΕΙ ΚΑΘΕ ΕΡΩΤΗΜΑ ──────────────────────────────────────
  // Οι τύποι γραμμών γεννιούνται από τα migrations (lib/supabase/tables.ts) και
  // κόβονται με `Pick` στις στήλες που ΟΝΤΩΣ ζητά το `select`. Έτσι μια στήλη
  // που δεν ζητήθηκε δεν μπορεί να διαβαστεί κατά λάθος παρακάτω — σφάλμα που
  // με `any[]` έβγαινε ως `undefined` και κατέληγε σε μηδενικό ποσό στην οθόνη.
  type ExpenseRow  = Pick<ExpensesRow, 'date'|'amount'|'category'|'expense_group'|'description'|'supplier_country'|'supply'|'supplier_afm'>
  type RentRow     = Pick<RentPaymentsRow, 'period_year'|'period_month'|'amount'|'paid'|'paid_date'|'due_date'|'method'>
  type PortfolioRentRow = RentRow & Pick<RentPaymentsRow, 'property_id'>
  type StayRow     = TaxStay & Pick<ClientStaysRow, 'id'|'channel'|'declared_at'>
  type PortfolioStayRow = StayRow & Pick<ClientStaysRow, 'property_id'>
  // Το `year_built` και το `floor` υπάρχουν στην καρτέλα του ακινήτου αλλά δεν
  // ζητούνταν εδώ, οπότε η αυτόματη εκτίμηση ΕΝΦΙΑ έπεφτε στις προεπιλογές της
  // (2ος όροφος, 10-20 ετών) και έβγαινε 16,15% ψηλότερα από την ουδέτερη βάση.
  // Και ο `prop_type`: χωρίς αυτόν η εκτίμηση χρέωνε αποθήκη 20 τ.μ. με τον
  // πίνακα των κατοικιών (39,20 € τον χρόνο) και οικόπεδο 400 τ.μ. με 600,00 €.
  type PropRow     = Pick<UserPropertiesRow, 'id'|'name'|'address'|'rental_mode'|'enfia'|'sqm'|'value'|'year_built'|'floor'|'purchase_price'|'purchase_date'|'prop_type'>
  type PropListRow = Pick<UserPropertiesRow, 'id'|'name'|'rental_mode'|'status_detail'|'enfia'|'sqm'>
  type InventoryRow = Pick<InventoryItemsRow, 'name'|'purchase_value'|'category'|'purchase_date'>

  const [expenses,setExpenses] = useState<ExpenseRow[]>([])
  const [rent,setRent] = useState<RentRow[]>([])
  const [stays,setStays] = useState<StayRow[]>([])
  const [loans,setLoans] = useState<LoanView[]>([])
  const [inventory,setInventory] = useState<InventoryRow[]>([])
  const [prop,setProp] = useState<PropRow|null>(null)
  const [allProps,setAllProps] = useState<PropListRow[]>([])
  const [allRent,setAllRent] = useState<PortfolioRentRow[]>([])
  const [allStays,setAllStays] = useState<PortfolioStayRow[]>([])

  // ΑΚΥΡΩΣΗ ΑΝΑ ΑΚΙΝΗΤΟ. Εννέα ερωτήματα φορτώνουν έσοδα, δαπάνες, δάνεια και
  // στοιχεία ακινήτου. Με αλλαγή ακινήτου μέσα στο διάστημα φόρτωσης, η
  // προηγούμενη απάντηση προσγειωνόταν πάνω στη νεότερη: ο ιδιοκτήτης έβλεπε
  // φορολογητέο εισόδημα, φόρο και πρόβλεψη ΑΛΛΟΥ ακινήτου, με το όνομα του
  // τρέχοντος από πάνω — και από αυτή την οθόνη βγαίνει βεβαίωση ενοικίου και
  // PDF με αριθμό εγγράφου.
  useEffect(()=>{ let alive = true; (async()=>{
    setLoading(true)
    try{
      const [ex, rp, st, ln, pr, aps, arp, ast, inv, tn] = await Promise.all([
        expenseStore.ledger<ExpenseRow>(supabase,propertyId,{ columns:'date,amount,category,expense_group,description,supplier_country,supply,supplier_afm' }),
        // Ο ΤΡΟΠΟΣ ΠΛΗΡΩΜΗΣ ΕΙΝΑΙ ΦΟΡΟΛΟΓΙΚΟ ΣΤΟΙΧΕΙΟ, ΟΧΙ ΔΙΑΚΟΣΜΗΤΙΚΟ: από
        // αυτόν κρίνεται η τεκμαρτή έκπτωση 5%. Μία στήλη παραπάνω στο ίδιο ερώτημα.
        rentStore.ofProperty<RentRow>(supabase,propertyId,`${rentStore.LEDGER_COLUMNS},method`,userId),
        stayStore.ofProperty<StayRow>(supabase,propertyId,`id,${stayStore.ACCOUNTING_COLUMNS}`,userId),
        loanStore.ofProperty(supabase,propertyId,userId),
        properties.one<PropRow>(supabase, propertyId, 'id,name,address,rental_mode,enfia,sqm,value,year_built,floor,purchase_price,purchase_date,prop_type', userId),
        properties.list<PropListRow>(supabase, userId, { columns: 'id,name,rental_mode,status_detail,enfia,sqm' }),
        rentStore.ofUser<PortfolioRentRow>(supabase,userId,`property_id,${rentStore.LEDGER_COLUMNS}`),
        stayStore.ofUser<PortfolioStayRow>(supabase,userId,`property_id,${stayStore.ACCOUNTING_COLUMNS}`),
        inventoryStore.ofProperty<InventoryRow>(supabase,propertyId,'name,purchase_value,category,purchase_date',userId),
        // Η ΠΡΟΘΕΣΗ ΤΗΣ ΜΙΣΘΩΣΗΣ, όταν δεν υπάρχει απόδειξη απο τις εισπράξεις.
        tenantStore.current<{ e_payment?: boolean|null }>(supabase, propertyId, 'e_payment', userId),
      ])
      if(!alive) return
      setExpenses(ex); setRent(rp); setLeaseViaBank(tn ? (tn.e_payment !== false) : null)
      setStays(st); setLoans(ln)
      setProp(pr); setAllProps(aps)
      setAllRent(arp); setAllStays(ast)
      setInventory(inv)
    }catch(_){ /* διατηρούμε ό,τι ήδη έχει φορτωθεί· το UI δεν κολλάει */ }
    finally{ if(alive) setLoading(false) }
  })(); return ()=>{ alive = false } },[propertyId,userId,refreshKey])

  // ΩΜΟ `rental_mode` ΕΧΑΝΕ ΤΑ ΒΡΑΧΥΧΡΟΝΙΑ ΑΚΙΝΗΤΑ. Όσα σημάνθηκαν πριν από τη
  // μετάβαση κρατούν `status_detail: 'seasonal'` χωρίς `rental_mode` — και το
  // ίδιο κάνει το δείγμα επίδειξης της εφαρμογής. Για αυτά, το καθεστώς έβγαινε
  // «μακροχρόνια», τα μεικτά έσοδα διαβάζονταν από τις δόσεις ενοικίου (που δεν
  // υπάρχουν στη βραχυχρόνια) και το αποτέλεσμα ήταν ΜΗΔΕΝ έσοδα, μηδέν φόρος,
  // μηδέν πρόβλεψη — σε PDF με αριθμό εγγράφου και κωδικό QR επαλήθευσης.
  const isShort = readStatus(prop as StatusRow) === 'rent_short'
  const regime:TaxRegime = isShort ? 'individual_shortterm' : 'individual_longterm'
  const propCount = Math.max(1, allProps.length)
  // ΕΝΦΙΑ: προτεραιότητα στο καταχωρημένο ποσό· αλλιώς αυτόματη εκτίμηση από
  // αξία, τετραγωνικά, έτος κατασκευής και όροφο.
  const enfia = useMemo(()=>{
    const stored = resolveEnfia({ propertyEnfia: prop?.enfia }).annual
    if(stored>0) return stored
    // Έτος κατασκευής και όροφος περνούν όπως είναι αποθηκευμένα· η enfia.ts τα
    // μεταφράζει σε κλιμάκιο και σε κλειδί ορόφου. Όποιο λείπει → ουδέτερο 1,00.
    return estimateENFIAFromFacts({
      value: prop?.value, sqm: prop?.sqm,
      yearBuilt: prop?.year_built, floor: prop?.floor,
      taxYear: year, propType: prop?.prop_type,
    })?.annual ?? 0
  },[prop,year])
  const enfiaEstimated = useMemo(()=>!(resolveEnfia({ propertyEnfia: prop?.enfia }).annual>0) && enfia>0,[prop,enfia])
  // Οικόπεδο ή βοηθητικός χώρος χωρίς καταχωρημένο ποσό: ο ΕΝΦΙΑ λείπει από τα
  // βιβλία και η οθόνη το λέει, αντί να δείχνει εκτίμηση κατοικίας.
  const enfiaBlock = useMemo(()=>{
    if(resolveEnfia({ propertyEnfia: prop?.enfia }).annual>0) return null
    const b = enfiaTypeBlock(prop?.prop_type)
    return b ? ENFIA_TYPE_BLOCK_NOTE[b] : null
  },[prop])

  // Ενεργό δάνειο στη χρήση Y; (μεταξύ έτους έναρξης και λήξης).
  // ΣΕ useCallback ΓΙΑ ΤΟΝ ΙΔΙΟ ΛΟΓΟ ΜΕ ΤΟ tariffKwh: κλείνει πάνω στο `year`,
  // και τέσσερα useMemo το καλούσαν χωρίς να μπορεί ο έλεγχος να το δει. Το
  // `year` ήταν ήδη στις εξαρτήσεις τους, άρα το αποτέλεσμα έβγαινε σωστό —
  // αλλά από σύμπτωση, όχι από κανόνα. Εδώ γίνεται κανόνας.
  const loanActiveInYear = useCallback((l:LoanView)=>{ const yrs=Number(l.years)||0; if(yrs<=0)return false; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; return year>=startY && year<startY+yrs }, [year])

  // Ετήσια στοιχεία τρέχοντος ακινήτου. Φόρος επί ΔΕΔΟΥΛΕΥΜΕΝΟΥ (accrued) ενοικίου
  //, φορολογείται ό,τι οφείλεται, ανεξάρτητα είσπραξης· τα ανείσπρακτα μειώνουν
  // μόνο το ταμείο. (Μακροχρόνια.)
  const rentAccruedYear = useMemo(()=>rent.filter(p=>p.period_year===year).reduce((s,p)=>s+(p.amount||0),0),[rent,year])
  const rentCollectedYear = useMemo(()=>rent.filter(p=>p.paid&&p.period_year===year).reduce((s,p)=>s+(p.amount||0),0),[rent,year])
  const shortSummary = useMemo(()=>shortTermYearSummary(stays, year, { sqm: prop?.sqm, isHouse:false, propertyCount:propCount, individual:true }),[stays,year,prop,propCount])
  const expensesYear = useMemo(()=>expenses.filter(e=>(e.date||'').slice(0,4)===String(year)&&(e.amount||0)>0),[expenses,year])
  // ── Η ΠΡΟΜΗΘΕΙΑ ΤΗΣ ΠΛΑΤΦΟΡΜΑΣ ΕΙΝΑΙ ΔΑΠΑΝΗ, ΚΑΙ ΜΠΑΙΝΕΙ ΣΤΑ ΒΙΒΛΙΑ ──────
  // Καταγραφόταν ανά κράτηση, φαινόταν σε τέσσερις οθόνες ως «δαπάνη που
  // εκπίπτει», και δεν έφτανε ΠΟΤΕ στο ημερολόγιο, στο ισοζύγιο ή στον φάκελο
  // του λογιστή. Ο κανόνας και η αιτιολογία ζουν στο lib/tax/shortTermTax.ts.
  //
  // ΔΕΝ ΔΙΠΛΟΓΡΑΦΕΤΑΙ. Όταν ο χρήστης έχει ήδη καταχωρήσει προμήθεια ως δαπάνη
  // — γιατί η πλατφόρμα του έστειλε τιμολόγιο και το πέρασε — η δική του
  // καταχώρηση υπερισχύει και δεν παράγεται τίποτα: το παραστατικό είναι πιο
  // βαρύ από τον υπολογισμό μας.
  const ownPlatformFees = useMemo(()=>expensesYear.some(e=>resolveCategory(e.category)==='platform_fee'),[expensesYear])
  const platformFeeRows = useMemo(()=>ownPlatformFees?[]:platformFeeExpenses(stays,year),[ownPlatformFees,stays,year])
  const platformFeesYear = useMemo(()=>platformFeeRows.reduce((s,r)=>s+r.amount,0),[platformFeeRows])
  // Εξαιρούμε τον ΕΝΦΙΑ ως δαπάνη, τον μετράμε ξεχωριστά (αποφυγή διπλομέτρησης).
  const expensesTotal = useMemo(()=>expensesYear.filter(e=>e.category!=='ΕΝΦΙΑ').reduce((s,e)=>s+(e.amount||0),0)+platformFeesYear,[expensesYear,platformFeesYear])
  const deductibleTotal = useMemo(()=>expensesYear.filter(e=>isGroupDeductible(e.expense_group)&&e.category!=='ΕΝΦΙΑ').reduce((s,e)=>s+(e.amount||0),0)+platformFeesYear,[expensesYear,platformFeesYear])
  // Δόσεις δανείων ΜΟΝΟ όσο το δάνειο είναι ενεργό στη χρήση (όχι φαντάσματα).
  const loanAnnual = useMemo(()=>loans.reduce((s,l)=>{ if(!loanActiveInYear(l))return s; const m=annuityMonthly(Number(l.amount)||0,Number(l.rate)||0,Number(l.years)||0); return s+m*12 },0),[loans,year,loanActiveInYear])
  const loanInterestYear = useMemo(()=>loans.reduce((s,l)=>{ const amount=Number(l.amount)||0, rate=Number(l.rate)||0, yrs=Number(l.years)||0; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; const idx=year-startY+1; return s+interestForYear(amount,rate,yrs,idx) },0),[loans,year])

  const businessMode = mode==='professional' && elp==='business'

  // ── ΤΟ ΜΗΤΡΩΟ ΠΑΓΙΩΝ, ΚΑΙ ΓΙΑΤΙ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΔΙΝΕΙ ΤΗΝ ΑΠΟΣΒΕΣΗ ──────────
  // Η απόσβεση κτιρίου υπολογιζόταν εδώ με μια γραμμή: αξία × 60% × 4%, ίδια
  // κάθε χρόνο, από την πρώτη μέρα ώς το άπειρο. Δύο λάθη μέσα σε μία γραμμή:
  // η πρώτη χρήση αποσβένεται ΚΑΤΑ ΜΗΝΑ (άρθρο 24 §2), και μετά την πλήρη
  // απόσβεση δεν υπάρχει άλλη απόσβεση — το κτίσμα δεν αποσβένεται για πάντα.
  // Και η βάση ήταν η ΕΚΤΙΜΗΣΗ αξίας, που αλλάζει κάθε χρόνο, αντί για την
  // τιμή κτήσης, που δεν αλλάζει ποτέ. Πλέον υπάρχει ένα μητρώο, και η
  // απόσβεση της χρονιάς βγαίνει από εκεί — το ίδιο νούμερο στην οθόνη, στο
  // Excel και στον φάκελο.
  const capitalisableAccounts = useMemo(()=>Object.fromEntries(
    CAPITALISABLE.map(slug=>[
      CATEGORIES.find(c=>c.slug===slug)?.label || slug,
      slug==='renovation' ? RENTED_PROPERTY_ACCOUNT : EQUIPMENT_ACCOUNT,
    ])),[])
  const assets = useMemo(()=>buildRegister({
    property: prop ? {
      name: prop.name,
      purchasePrice: prop.purchase_price,
      purchaseDate: prop.purchase_date,
      rented: prop.rental_mode!=='own_use',
    } : null,
    buildingFraction: BUILDING_VALUE_FRACTION,
    buildingRate: BUILDING_DEPRECIATION_RATE,
    equipmentRate: EQUIPMENT_DEPRECIATION_RATE,
    inventory,
    // ΟΛΟΚΛΗΡΟ ΤΟ ΚΑΘΟΛΙΚΟ, ΟΧΙ Η ΧΡΗΣΗ. Εδώ περνούσε το `expensesYear`, οπότε
    // ανακαίνιση του 2025 δεν υπήρχε στο μητρώο του 2026 και οι υπόλοιπες
    // εικοσιτέσσερις δόσεις απόσβεσής της χάνονταν για πάντα. Το `year` κόβει
    // ό,τι αποκτήθηκε αργότερα, ώστε το μητρώο να μένει φωτογραφία της 31/12.
    expenses,
    capitalisable: capitalisableAccounts,
    year,
  }),[prop,inventory,expenses,capitalisableAccounts,year])
  // Μόνο η ΑΚΙΝΗΤΗ περιουσία αποσβένεται με δηλωμένο συντελεστή· ο εξοπλισμός
  // περιμένει τον συντελεστή του λογιστή και δίνει μηδέν ώς τότε.
  const buildingDepr = useMemo(()=>
    Math.round(assets.filter(a=>a.elp!==EQUIPMENT_ACCOUNT).reduce((s,a)=>s+chargeForYear(a,year),0)),[assets,year])
  // ══ Η ΑΠΟΣΒΕΣΗ ΕΞΟΠΛΙΣΜΟΥ ΗΤΑΝ ΕΚΤΙΜΗΣΗ ΠΡΟΪΟΝΤΟΣ, ΚΑΙ ΕΚΠΙΠΤΟΤΑΝ ΩΣ ΦΟΡΟΣ ══
  //
  // Υπολογιζόταν εδώ με το `usefulLifeYears` — «τυπική διάρκεια ζωής» ανά
  // κατηγορία, που το ίδιο του το αρχείο (lib/inventory/depreciation.ts)
  // δηλώνει ρητά ότι ΔΕΝ είναι φορολογική απόσβεση και ότι δεν πρέπει να μπει
  // σε δήλωση. Το νούμερο όμως περνούσε αυτούσιο στην κατάσταση αποτελεσμάτων
  // και μείωνε τη φορολογητέα βάση: ένα πλυντήριο 650 € «αποσβενόταν» σε εννιά
  // χρόνια (11,1%) αντί για τα δέκα του νόμου, και ένα έπιπλο σε δώδεκα (8,3%).
  //
  // Ο πίνακας του άρθρου 24 §4 δίνει τον σωστό συντελεστή για όλα: «λοιπά πάγια
  // στοιχεία της επιχείρησης», 10%. Το νούμερο βγαίνει πλέον από το ΜΗΤΡΩΟ, με
  // την έναρξη από τον επόμενο μήνα και με στάση όταν το πάγιο αποσβεστεί —
  // δηλαδή από την ίδια πηγή που βλέπει ο λογιστής στο Excel του.
  //
  // Η ΕΚΤΙΜΗΣΗ ΔΕΝ ΚΑΤΑΡΓΕΙΤΑΙ, ΑΛΛΑΖΕΙ ΘΕΣΗ. Η Απογραφή εξακολουθεί να δείχνει
  // υπολειπόμενη αξία και προτάσεις αντικατάστασης με τη διάρκεια ζωής: εκεί το
  // ερώτημα είναι «πόσο αξίζει σήμερα», που δεν το απαντά ο φορολογικός πίνακας.
  const inventoryDepr = useMemo(()=>
    Math.round(assets.filter(a=>a.elp===EQUIPMENT_ACCOUNT).reduce((s,a)=>s+chargeForYear(a,year),0)),[assets,year])
  const grossIncome = regime==='individual_shortterm' ? shortSummary.grossRevenue : rentAccruedYear
  const uncollectedRent = regime==='individual_shortterm' ? 0 : Math.max(0, rentAccruedYear - rentCollectedYear)
  // Τι λένε τα δεδομένα, και τι ισχύει τελικά (η παράκαμψη του χρήστη νικά).
  const collection = useMemo(() => rentCollectionMode(rent, year, leaseViaBank), [rent, year, leaseViaBank])
  const rentsBank = rentsBankOverride ?? collection.viaBank

  // Ενοποίηση χαρτοφυλακίου (φυσικό πρόσωπο): ο φόρος είναι προοδευτικός στο ΣΥΝΟΛΟ
  // των ενοικίων (Ε1), όχι ανά ακίνητο. Υπολογίζεται ΠΑΝΤΑ, ώστε ο φόρος του τρέχοντος
  // ακινήτου να είναι το ΜΕΡΙΔΙΟ του από τον συνολικό, σωστά και για πολλά ακίνητα.
  const consolidation = useMemo(()=>{
    const items = (allProps.length?allProps:[{id:propertyId,name:prop?.name,rental_mode:prop?.rental_mode,enfia:prop?.enfia,sqm:prop?.sqm}]).map(p=>{
      const rmode:TaxRegime = readStatus(p as StatusRow) === 'rent_short' ? 'individual_shortterm' : 'individual_longterm'
      const pRentAccrued = allRent.filter(r=>r.property_id===p.id&&r.period_year===year).reduce((s,r)=>s+(r.amount||0),0)
      const pStays = allStays.filter(s=>s.property_id===p.id)
      const pShort = shortTermYearSummary(pStays, year, { sqm:p.sqm??null, isHouse:false, propertyCount:propCount, individual:true })
      const gross = rmode==='individual_shortterm' ? pShort.grossRevenue : pRentAccrued
      const input:StatementInput = { regime:rmode, grossIncome:gross, enfia: resolveEnfia({ propertyEnfia:p.enfia }).annual, rentsPaidViaBank: rentsBank,
        climateLevy: rmode==='individual_shortterm'?pShort.levyShortfall:0, municipalTax: rmode==='individual_shortterm'?pShort.municipalTax:0 }
      return { id:p.id, name:p.name||'Ακίνητο', input }
    }).filter(x=>x.input.grossIncome>0)
    if(items.length===0) return null
    return { con: consolidateIndividual(items.map(i=>({id:i.id,input:i.input})), rentalBracketsForYear(year)), names:Object.fromEntries(items.map(i=>[i.id,i.name])), count:items.length }
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
          climateLevy: regime==='individual_shortterm'?shortSummary.levyShortfall:0, municipalTax: regime==='individual_shortterm'?shortSummary.municipalTax:0,
          otherCashExpenses: Math.max(0,expensesTotal-deductibleTotal), loanPrincipal: Math.max(0,loanAnnual-loanInterestYear), uncollectedIncome:uncollectedRent, brackets: rentalBracketsForYear(year) }
      : { regime, grossIncome, enfia, overrideIncomeTax: myTaxShare, rentsPaidViaBank: rentsBank,
        // ΤΟ ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ ΕΦΕΥΓΕ ΔΥΟ ΦΟΡΕΣ ΑΠΟ ΤΟ ΤΑΜΕΙΟ.
        // Το `grossIncome` εδώ είναι το `grossRevenue` της shortTermYearSummary,
        // που έχει ΗΔΗ αφαιρέσει το εισπραγμένο τέλος (gross_guest_paid −
        // collectedLevy). Περνώντας και το ΣΥΝΟΛΙΚΟ `levy` ως έξοδο, το
        // incomeStatement το έβγαζε δεύτερη φορά. Σε γεμάτη σεζόν 200 νυχτών
        // υψηλής περιόδου η τρύπα φτάνει 3.000 € — και το ίδιο νούμερο πήγαινε
        // στο «πόσα να βάλεις στην άκρη για φόρο» και στο Excel του λογιστή.
        // Το `levyShortfall` είναι ό,τι ΟΦΕΙΛΕΤΑΙ και δεν εισπράχθηκε: μηδέν
        // όταν ο επισκέπτης το πλήρωσε κανονικά. Ο ίδιος κανόνας που εφαρμόζει
        // ήδη μέσα του το lib/tax/shortTermTax.ts.
          climateLevy: regime==='individual_shortterm' ? shortSummary.levyShortfall : 0,
          municipalTax: regime==='individual_shortterm' ? shortSummary.municipalTax : 0,
          otherCashExpenses: expensesTotal, loanPrincipal: loanAnnual, uncollectedIncome:uncollectedRent,
          legallyClaimedUncollected: claimedUncollected, brackets: rentalBracketsForYear(year) }
  ),[businessMode,year,elpForm,age,firstYears,distribution,ekfa,buildingDepr,claimedUncollected,rentsBank,regime,grossIncome,enfia,myTaxShare,shortSummary,expensesTotal,deductibleTotal,inventoryDepr,loanInterestYear,loanAnnual,uncollectedRent])

  // Συμβουλευτική, προτάσεις με αξία από τα πραγματικά δεδομένα (καθαρές, όχι θόρυβος).
  const advisory = useMemo(()=>buildAdvisory({
    regime: businessMode?'business':regime, businessForm: businessMode?elpForm:undefined, age: age||null,
    grossIncome, taxableIncome: statement.taxableIncome,
    rentalMode: prop?.rental_mode, propertyCount: propCount,
    hasLoan: loans.some(l=>loanActiveInYear(l)), loanInterestYear,
  }),[businessMode,regime,elpForm,age,grossIncome,statement,prop,propCount,loans,year,loanInterestYear,loanActiveInYear])

  // «Τι άλλαξε»: επίκαιροι κανόνες 2026 σχετικοί με το προφίλ (καθεστώς + δάνειο).
  const relevantChanges = useMemo(()=>{
    const aud = new Set<UpdateAudience>(['all'])
    if(businessMode) aud.add('business')
    else if(regime==='individual_shortterm') aud.add('short_term')
    else aud.add('long_term')
    if(loans.some(l=>loanActiveInYear(l))) aud.add('borrower')
    return REGULATORY_UPDATES_2026.filter(u=>u.audiences.some(a=>aud.has(a)))
  },[businessMode,regime,loans,year,loanActiveInYear])

  // Κόστος μεταβίβασης: προεπιλογή τιμήματος η αξία του ακινήτου (αν υπάρχει).
  const xferEffectivePrice = xferPrice!=='' ? Number(xferPrice) : (Number(prop?.value)||0)
  const xfer = useMemo(()=>transferCosts({ side:xferSide, price:xferEffectivePrice, firstHome:xferFirstHome, useAgent:xferAgent, acquisitionCost:xferSide==='sell'?(Number(prop?.value)||0):0 }),[xferSide,xferEffectivePrice,xferFirstHome,xferAgent,prop])

  // Πρόβλεψη: για τρέχον έτος με βάση τον τρέχοντα μήνα· για κλεισμένο/μελλοντικό, ισόποσα στους 12.
  const provMonth = year===athensYear() ? athensNow().getMonth()+1 : 1
  const provision = useMemo(()=>taxProvision(statement, provMonth),[statement,provMonth])

  // Ενοποιημένο καθολικό & ταμειακές ροές (όπως πριν, αλλά με τη νέα μηχανή για φόρο)
  const entries = useMemo<LedgerInput[]>(()=>{
    const out:LedgerInput[]=[]
    for(const p of rent){ if(p.paid&&(p.amount||0)>0){ out.push({ date:rentStore.bookDate(p), type:'income', category:'Ενοίκιο', description:`Ενοίκιο ${MONTHS_SHORT[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount, source:'rent' }) } }
    // ═══ Η ΠΡΟΜΗΘΕΙΑ ΑΦΑΙΡΟΥΝΤΑΝ ΔΥΟ ΦΟΡΕΣ ═══════════════════════════════
    // Το `total` μιας διαμονής ΔΕΝ είναι πάντα το ακαθάριστο: όταν το
    // `amount_basis` είναι «payout», είναι ΗΔΗ καθαρό από την προμήθεια της
    // πλατφόρμας. Εδώ γραφόταν αυτούσιο ως έσοδο, και τρεις γραμμές πιο κάτω
    // η ΙΔΙΑ προμήθεια ξαναμπαίνει ως δαπάνη. Δηλαδή αφαιρούνταν δύο φορές,
    // ακριβώς στις κρατήσεις που έχουν ανάλυση, δηλαδή στις εισαγόμενες από
    // πλατφόρμα.
    //
    // Το lib/clients/stayAmounts.ts το γράφει ρητά στην κεφαλίδα του: «η
    // προμήθεια αφαιρείται ΜΕΤΑ το ακαθάριστο επίτηδες, εκπίπτει ως δαπάνη,
    // δεν μειώνει το δηλωτέο έσοδο». Και η σωστή γραφή υπήρχε ήδη είκοσι
    // αρχεία δίπλα, στο JournalExport.
    //
    // ΠΟΥ ΕΦΤΑΝΕ ΤΟ ΛΑΘΟΣ: στις «Κινήσεις», στο ταμειακό γράφημα, και μέσω του
    // `book` στο ΠΡΩΤΟ ΦΥΛΛΟ του φακέλου του λογιστή («ΣΥΝΟΛΑ ΕΤΟΥΣ»), όπου
    // διαφωνούσε με την «Κατάσταση αποτελεσμάτων» του διπλανού φύλλου κατά
    // ολόκληρη την προμήθεια. Ενα βιβλίο που αντιφάσκει με τον εαυτό του στο
    // εξώφυλλο δεν διορθώνεται από τον λογιστή: απορρίπτεται.
    for(const s of stays){ const g=declarableGrossOrTotal(s); if(g>0&&s.check_in){ out.push({ date:s.check_in, type:'income', category:'Βραχυχρόνια', description:`Κράτηση ${s.channel||''}`.trim(), amount:g, source:'stay' }) } }
    for(const e of expenses){ if((e.amount||0)>0&&e.date){ out.push({ date:e.date, type:'expense', category:e.category||'Δαπάνες', description:e.description||'Δαπάνη', amount:e.amount, source:'expense', supplier_country:e.supplier_country, supply:e.supply, supplier_afm:e.supplier_afm }) } }
    // Η προμήθεια της κάθε κράτησης, δίπλα στο έσοδο της ίδιας κράτησης.
    for(const f of platformFeeRows){ out.push({ date:f.date, type:'expense', category:f.category, description:f.description, amount:f.amount, source:'expense' }) }
    return out
  },[rent,stays,expenses,platformFeeRows])
  const yearEntries = useMemo(()=>entries.filter(e=>e.date.slice(0,4)===String(year)),[entries,year])
  const cash = useMemo(()=>cashflowByYear(entries,year),[entries,year])
  const book = useMemo(()=>buildLedger(yearEntries),[yearEntries])
  const recentLedger = useMemo(()=>[...book].slice(-12).reverse(),[book])

  // Ισοζύγιο διπλογραφικής (trial balance) — για τον λογιστή. Ταμειακή βάση:
  // εισπραγμένα ενοίκια/κρατήσεις → έσοδα, πληρωμένα έξοδα, δόσεις δανείου
  // διαχωρισμένες σε τόκους (65.01) και χρεολύσιο (52). Κάθε άρθρο ισοσκελισμένο.
  const journalLines = useMemo(()=>{
    const incomes:IncomeRec[] = []
    // ΤΑΜΕΙΑΚΗ ΕΠΙΛΟΓΗ, ΟΠΩΣ ΚΑΙ ΟΙ ΚΙΝΗΣΕΙΣ. Ο κανόνας ζει στο lib/data/rent.ts.
    for(const p of rentStore.collectedIn(rent, year)){ incomes.push({ date:rentStore.bookDate(p), amount:p.amount||0, description:`Ενοίκιο ${MONTHS_SHORT[(p.period_month||1)-1]} ${p.period_year}` }) }
    // Δηλωτέο ακαθάριστο, όχι payout: η προμήθεια μπαίνει χωριστά ως δαπάνη
    // τρεις γραμμές πιο κάτω, και δεν επιτρέπεται να αφαιρεθεί και από τα δύο.
    for(const s of stays){ const g=declarableGrossOrTotal(s); if(g>0&&s.check_in&&String(s.check_in).slice(0,4)===String(year)){ incomes.push({ date:s.check_in, amount:g, description:`Κράτηση ${s.channel||''}`.trim() }) } }
    const exp:ExpenseRec[] = []
    for(const e of expenses){ if((e.amount||0)>0&&e.date&&String(e.date).slice(0,4)===String(year)){ exp.push({ date:e.date, amount:e.amount, category:e.category, description:e.description }) } }
    for(const f of platformFeeRows){ exp.push({ date:f.date, amount:f.amount, category:f.category, description:f.description }) }
    const loanPayments:LoanPaymentRec[] = []
    for(const l of loans){ if(!loanActiveInYear(l))continue; const amount=Number(l.amount)||0, rate=Number(l.rate)||0, yrs=Number(l.years)||0; const startY=l.start_date?Number(String(l.start_date).slice(0,4)):year; const idx=year-startY+1; const annual=Math.round(annuityMonthly(amount,rate,yrs)*12); const interest=Math.round(interestForYear(amount,rate,yrs,idx)); if(annual>0) loanPayments.push({ date:`${year}-06-30`, amount:annual, interest, description:`Δόσεις δανείου${l.bank?` · ${l.bank}`:''}` }) }
    return buildJournal({ incomes, expenses:exp, loanPayments })
  },[rent,stays,expenses,loans,year,loanActiveInYear,platformFeeRows])
  const trial = useMemo(()=>trialBalance(journalLines),[journalLines])
  const jTotals = useMemo(()=>journalTotals(journalLines),[journalLines])

  const recon = useMemo(()=>{
    const yr = rent.filter(p=>p.period_year===year)
    const expected:Expected[] = yr.map(p=>({ id:`${p.period_year}-${p.period_month}`, date:p.due_date||`${p.period_year}-${String(p.period_month).padStart(2,'0')}-01`, amount:p.amount||0, label:`${MONTHS_SHORT[(p.period_month||1)-1]} ${p.period_year}` }))
    const actual:Actual[] = yr.filter(p=>p.paid).map(p=>({ refId:`${p.period_year}-${p.period_month}`, date:p.paid_date||'', amount:p.amount||0, paid:true }))
    return reconcile(expected, actual, todayAthens())
  },[rent,year])
  const rs = useMemo(()=>reconSummary(recon),[recon])

  const maxCash = Math.max(1, ...cash.map(c=>Math.max(c.income,c.expense)))

  // ── Ο ΦΑΚΕΛΟΣ ΓΙΑ ΤΟΝ ΛΟΓΙΣΤΗ ─────────────────────────────────────────────
  // Η κατάσταση κάθε ακινήτου (εκμίσθωση, κενό, ιδιοχρησία…) ορίζει ΤΙ ζητάει ο
  // λογιστής. Ο κανόνας ζει μία φορά, στο lib/accounting/dossier.ts· εδώ απλώς
  // του δίνουμε τα δεδομένα και δείχνουμε την απάντησή του.
  const dossierProps = useMemo(()=>{
    const rows:{ name?:string|null; status_detail?:string|null; rental_mode?:string|null }[] = allProps.length ? allProps : (prop?[prop]:[])
    return rows.map(p=>({ name: p.name || 'Ακίνητο', status: readStatus(p) as PropertyStatus }))
  },[allProps,prop])
  // Αφετηρία, μόνο για χρήστη που δεν έχει δηλώσει ακόμη τίποτα: ό,τι ήδη ξέρουμε.
  const dossierSeed = useMemo(()=>{
    const form:LegalForm = businessMode ? (elpForm==='company' ? 'company' : 'sole_trader') : 'individual'
    return { form, books: defaultBookkeeping(form), hasLoan: loans.length>0 }
  },[businessMode,elpForm,loans])
  const dossier = useAccountantDossier(userId, year, dossierSeed)
  // Τα βιβλία κρίνουν ποιος βλέπει ισοζύγιο/ισολογισμό — ποτέ φυσικό πρόσωπο.
  const doubleEntry = dossier.profile.books==='double_entry'

  // «Τι δεν βρέθηκε»: ό,τι λείπει από τα ΔΕΔΟΜΕΝΑ (όχι από τα χαρτιά) και θα
  // αναγκάσει τον λογιστή να σηκώσει τηλέφωνο. Γράφεται μέσα στο 05_ΤΙ_ΛΕΙΠΕΙ.
  const dossierGaps = useMemo(()=>{
    const g:string[] = []
    const rentRows = rent.filter(p=>p.period_year===year)
    if(regime==='individual_shortterm'){
      if(stays.filter(s=>String(s.check_in||'').slice(0,4)===String(year)).length===0) g.push(`Καμία καταχωρημένη διαμονή για το ${year}.`)
    } else if(rentRows.length===0){ g.push(`Κανένα καταχωρημένο μίσθωμα για το ${year}.`) }
    // Η προμήθεια δεν μαντεύεται. Κράτηση Airbnb ή Booking.com έχει πάντα
    // προμήθεια· όταν λείπει, λείπει δαπάνη από τα βιβλία και το λέμε.
    const noFee = staysMissingPlatformFee(stays, year)
    if(noFee>0) g.push(`${noFee} κρατήσεις από πλατφόρμα χωρίς καταγεγραμμένη προμήθεια: λείπει δαπάνη που εκπίπτει.`)
    if(ownPlatformFees) g.push('Οι προμήθειες πλατφορμών λαμβάνονται από τις καταχωρημένες δαπάνες, όχι από τις κρατήσεις.')
    if(expensesYear.length===0) g.push(`Καμία καταχωρημένη δαπάνη για το ${year}.`)
    if(uncollectedRent>0) g.push(`Ανείσπρακτα μισθώματα ${eur(uncollectedRent)}: χρειάζεται τεκμηρίωση της νομικής διεκδίκησης.`)
    if(regime==='individual_longterm' && !tenant?.afm) g.push('Δεν έχει καταχωρηθεί ΑΦΜ μισθωτή.')
    if(enfiaEstimated) g.push('Ο ΕΝΦΙΑ είναι αυτόματη εκτίμηση, όχι ποσό από εκκαθαριστικό.')
    if(enfiaBlock) g.push(`Δεν έχει καταχωρηθεί ΕΝΦΙΑ. ${enfiaBlock}`)
    const noCat = expensesYear.filter(e=>!e.category).length
    if(noCat>0) g.push(`${noCat} δαπάνες χωρίς κατηγορία.`)
    return g
  },[rent,stays,expensesYear,year,regime,uncollectedRent,tenant,enfiaEstimated,enfiaBlock,ownPlatformFees])

  // ── ΠΟΙΟΣ ΚΑΝΕΙ myDATA, ΚΑΙ ΜΕ ΠΟΙΟ ΔΙΚΑΙΩΜΑ ΕΚΠΤΩΣΗΣ ────────────────────
  // Ο ιδιοκτήτης που εκμισθώνει ως φυσικό πρόσωπο δεν χαρακτηρίζει έξοδα: δεν
  // τηρεί βιβλία, δεν διαβιβάζει. Για εκείνον η στήλη δεν υπάρχει καθόλου.
  //
  // Για την επιχείρηση, το δικαίωμα έκπτωσης δεν μαντεύεται — και μόνο μία
  // περίπτωση είναι βέβαιη από τα δεδομένα που ήδη έχουμε: η εκμίσθωση
  // κατοικίας απαλλάσσεται από ΦΠΑ (άρθρο 22 ν.2859/2000), άρα δεν υπάρχει
  // δικαίωμα έκπτωσης των εισροών και το γενικό έξοδο πάει στο 2.5. Στη
  // βραχυχρόνια, όπου το καθεστώς εξαρτάται από το αν παρέχονται υπηρεσίες,
  // μένει άγνωστο: το κελί βγαίνει κενό και ο λογιστής το συμπληρώνει.
  const myDataExport = useMemo(()=>(
    businessMode ? { vat: (regime==='individual_longterm' ? 'none' : 'unknown') as VatDeduction } : undefined
  ),[businessMode,regime])

  const dossierExport = useMemo(()=>({
    propName: prop?.name || 'Ακίνητο',
    statementLines: statement.lines.map(l=>({ label:l.label, amount:l.amount, kind:l.kind, negative:l.negative })),
    provisionMonthly: provision.monthly,
    book: book.map(toMovement),
    myData: myDataExport,
    // Το μητρώο παγίων υπάρχει μόνο για όποιον τηρεί βιβλία: ο ιδιοκτήτης που
    // δηλώνει ενοίκια ως φυσικό πρόσωπο δεν εκπίπτει αποσβέσεις.
    assets: businessMode ? assets : undefined,
    buildingFraction: BUILDING_VALUE_FRACTION,
    gaps: dossierGaps,
    // ΤΑ ΧΑΡΤΙΑ ΚΑΤΕΒΑΙΝΟΥΝ ΟΤΑΝ ΠΑΤΗΘΕΙ ΤΟ ΚΟΥΜΠΙ, ΟΧΙ ΟΤΑΝ ΑΝΟΙΞΕΙ Η ΟΘΟΝΗ.
    // Είναι μεγαβάιτ· κανείς δεν τα θέλει επειδή κοίταξε τη Λογιστική.
    attachments: ()=>fetchDossierPapers(supabase, propertyId, userId, year),
  }),[prop,statement,provision,book,dossierGaps,myDataExport,assets,businessMode,supabase,propertyId,userId,year])

  // ── Κλείσιμο χρήσης (period lock) ──────────────────────────────────────────
  // Το στιγμιότυπο της κλεισμένης χρήσης: ό,τι γράφεται στο `snapshot`, και
  // τίποτα άλλο. Η υπογραφή `sig` είναι που ξεχωρίζει το «κλειδωμένο» από το
  // «κλειδωμένο αλλά άλλαξαν τα δεδομένα από τότε».
  interface BookSnapshot {
    sig: string
    taxableIncome: number; incomeTax: number; netProfit: number; netCash: number
    provisionMonthly: number; collectedTotal: number; expectedTotal: number
  }
  const [closing,setClosing] = useState<{ snapshot:BookSnapshot; locked_at:string }|null>(null)
  const [lockErr,setLockErr] = useState<string|null>(null)
  // Ίδιο κενό, ίδια λύση: χωρίς ακύρωση, το κλείδωμα χρήσης και το όνομα του
  // μισθωτή του προηγούμενου ακινήτου τυπώνονταν στη βεβαίωση του νέου.
  useEffect(()=>{ let alive = true; (async()=>{
    const { data } = await supabase.from('book_closings').select('snapshot,locked_at').eq('property_id',propertyId).eq('user_id',userId).eq('year',year).maybeSingle()
    if(alive) setClosing((data as { snapshot:BookSnapshot; locked_at:string }|null)||null)
  })(); return ()=>{ alive = false } },[propertyId,userId,year,refreshKey])
  useEffect(()=>{ let alive = true; (async()=>{
    // Ο ΤΡΕΧΩΝ ΜΙΣΘΩΤΗΣ, ΟΧΙ Ο ΤΕΛΕΥΤΑΙΟΣ ΠΟΥ ΓΡΑΦΤΗΚΕ. Το όνομα που βγαίνει από
    // εδώ τυπώνεται στη βεβαίωση ενοικίου: με «πιο πρόσφατα δημιουργημένος», η
    // βεβαίωση έβγαινε στο όνομα άλλου ανθρώπου από αυτόν που έδειχνε η Επισκόπηση.
    const data = await tenantStore.current<{ full_name?:string; afm?:string }>(supabase, propertyId, 'full_name,afm', userId)
    if(alive) setTenant(data||null)
  })(); return ()=>{ alive = false } },[propertyId,userId,refreshKey])
  // Ετήσια βεβαίωση ενοικίου: μόνο εισπραγμένα μισθώματα του έτους, ανά μήνα.
  function printCertificate(){
    const paid = rent.filter(p=>p.paid&&p.period_year===year).sort((a,b)=>(a.period_month||0)-(b.period_month||0))
    const months = paid.map(p=>({ label:`${MONTHS_NOM[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount||0 }))
    const total = months.reduce((s,m)=>s+m.amount,0)
    printRentCertificate({ year, propName:prop?.name||'Ακίνητο', address:prop?.address??undefined, tenantName:tenant?.full_name, tenantAfm:tenant?.afm, months, total, branding })
  }
  // Επίσημο true-PDF της βεβαίωσης ενοικίου (ίδια δεδομένα με την εκτυπώσιμη), με
  // αρ. εγγράφου & QR επαλήθευσης — καταχωρείται στο μητρώο εγγράφων.
  async function officialRentCertificate(){
    if(genOfficialCert) return
    const paid = rent.filter(p=>p.paid&&p.period_year===year).sort((a,b)=>(a.period_month||0)-(b.period_month||0))
    const months = paid.map(p=>({ label:`${MONTHS_NOM[(p.period_month||1)-1]} ${p.period_year}`, amount:p.amount||0 }))
    const total = months.reduce((s,m)=>s+m.amount,0)
    setGenOfficialCert(true)
    try {
      await downloadOfficialRentCertificate({ year, propName:prop?.name||'Ακίνητο', address:prop?.address??undefined, tenantName:tenant?.full_name, tenantAfm:tenant?.afm, months, total, branding }, { supabase, userId })
    } catch { notifyError(failed(MSG.pdf)) }
    finally { setGenOfficialCert(false) }
  }
  // Υπογραφή από ΜΟΝΙΜΑ δεδομένα (όχι από επιλογές εμφάνισης όπως ιδιώτης/επιχείρηση,
  // ηλικία, ΕΦΚΑ), ώστε η «απόκλιση» να σημαίνει πραγματική αλλαγή σε ενοίκια/έξοδα.
  const bookSig = useMemo(()=>[rentAccruedYear,rentCollectedYear,expensesTotal,loanAnnual,Math.round(shortSummary.grossRevenue)].map(n=>Math.round(n)).join('|'),[rentAccruedYear,rentCollectedYear,expensesTotal,loanAnnual,shortSummary])
  const drift = !!closing && closing.snapshot?.sig!=null && closing.snapshot.sig!==bookSig
  async function lockYear(){
    const snapshot = { sig:bookSig, taxableIncome:statement.taxableIncome, incomeTax:statement.incomeTax, netProfit:statement.netProfit, netCash:statement.netCash, provisionMonthly:provision.monthly, collectedTotal:rs.collectedTotal, expectedTotal:rs.expectedTotal }
    const locked_at = new Date().toISOString()
    // Ενημέρωση κατάστασης ΑΜΕΣΩΣ (ΑΝΟΙΧΤΟ → ΚΛΕΙΣΜΕΝΟ) και ΜΟΝΙΜΗ αποθήκευση στη βάση.
    setLockErr(null); setClosing({ snapshot, locked_at })
    // delete-then-insert αντί για upsert(onConflict): δουλεύει ΜΟΝΟ με τα policies
    // insert+delete (που υπάρχουν ήδη), χωρίς να απαιτεί policy UPDATE ή unique constraint
    // για το onConflict — άρα κλειδώνει αξιόπιστα ανεξάρτητα από την κατάσταση του schema.
    await supabase.from('book_closings').delete().eq('property_id',propertyId).eq('user_id',userId).eq('year',year)
    const { error } = await supabase.from('book_closings').insert({ user_id:userId, property_id:propertyId, year, snapshot, locked_at })
    // Αν η αποθήκευση αποτύχει, ΔΕΝ κρύβουμε το πρόβλημα: επαναφέρουμε την κατάσταση και
    // λέμε τον λόγο. «Τον πραγματικό λόγο» σήμαινε ως τώρα το αγγλικό κείμενο της
    // Postgres — που δεν είναι εμπιστοσύνη, είναι θόρυβος. Ο λόγος λέγεται στα
    // ελληνικά όταν αναγνωρίζεται, και το πρωτότυπο μένει στην κονσόλα από κάτω,
    // για όποιον το ψάχνει.
    if(error){ setClosing(null); setLockErr(failed('Το κλείδωμα της χρήσης δεν αποθηκεύτηκε', error)); console.warn('Αποτυχία αποθήκευσης κλειδώματος:', error) }
  }
  async function unlockYear(){
    // Η ΧΡΗΣΗ ΕΜΦΑΝΙΖΕΤΑΙ ΞΕΚΛΕΙΔΩΤΗ ΜΟΝΟ ΑΝ ΞΕΚΛΕΙΔΩΣΕ. Το `setClosing(null)`
    // έτρεχε ΠΡΙΝ τη διαγραφή και δεν επανερχόταν σε αποτυχία: η οθόνη έλεγε
    // «ανοιχτή χρήση» ενώ η γραμμή κλειδώματος ζούσε ακόμη στη βάση, και η
    // επόμενη φόρτωση την ξαναέφερνε.
    setLockErr(null)
    const ok = await saved('Το κλείδωμα της χρήσης δεν άνοιξε',
      supabase.from('book_closings').delete().eq('property_id',propertyId).eq('user_id',userId).eq('year',year))
    if(ok) setClosing(null)
  }

  // Δημιουργεί/ανακτά τον σύνδεσμο της πύλης λογιστή και τον αντιγράφει. Ο λογιστής
  // βλέπει live εικόνα εσόδων/εξόδων ανά ακίνητο, read-only, χωρίς login ή email.
  async function shareWithAccountant(){
    if(acctBusy) return
    // Χωρίς πακέτο, ο σύνδεσμος θα εκδιδόταν κανονικά και θα έδειχνε «δεν
    // βρέθηκε» στον λογιστή — δηλαδή ο ιδιοκτήτης θα το μάθαινε από εκείνον.
    if(!canAccountantPortal){ onNavigate?.('settings'); return }
    setAcctBusy(true)
    try{
      // Η δημιουργία, η ανανέωση της λήξης και η περιστροφή ζουν σε ένα σημείο:
      // lib/data/accountantLink.ts. Εδώ ήταν γραμμένες δεύτερη φορά, και η
      // εκδοχή των Ρυθμίσεων είχε ήδη αποκλίνει.
      const link = await accountantLink.issue(supabase, userId)
      if(!link){ notifyError('Ο σύνδεσμος για τον λογιστή δεν δημιουργήθηκε'); return }
      setAcctLink(link.url)
      setAcctUntil(accountantLink.expiryLabel(link))
      try{ await navigator.clipboard.writeText(link.url); setAcctCopied(true); setTimeout(()=>setAcctCopied(false),2600) }catch{ /* ο σύνδεσμος φαίνεται πλέον στο πλαίσιο, ο χρήστης τον αντιγράφει χειροκίνητα */ }
    } finally { setAcctBusy(false) }
  }

  // Ανάκληση: περιστρέφει το token, ώστε ο παλιός σύνδεσμος να πάψει αμέσως να
  // λειτουργεί (ασφάλεια) και να εμφανιστεί καινούριος για μοίρασμα.
  //
  // ΚΑΙ ΚΛΕΙΝΕΙ ΚΑΙ ΤΟΝ ΧΩΡΟ ΕΡΓΑΣΙΑΣ. Για καιρό δεν το έκανε: ο λογιστής που
  // είχε ήδη αξιώσει τον σύνδεσμο κρατούσε πρόσβαση για πάντα, γιατί η αξίωση
  // ζούσε στον πίνακα accountant_clients και δεν θυμόταν ΜΕ ΠΟΙΟΝ σύνδεσμο
  // δόθηκε. Το κουμπί έλεγε «Ανάκληση» και ανακαλούσε τον μισό δρόμο.
  // Η `accountant_link_live` στη βάση απαιτεί πλέον το token της αξίωσης να
  // είναι ακόμη το ενεργό — άρα η περιστροφή είναι ανάκληση και στους δύο.
  async function revokeAccountantLink(){
    if(acctBusy) return
    setAcctBusy(true)
    try{
      const link = await accountantLink.rotate(supabase, userId)
      if(link === 'insecure'){ notifyError('Ο περιηγητής δεν μπορεί να παραγάγει ασφαλή σύνδεσμο. Δοκίμασε από ασφαλή σύνδεση (https).'); return }
      if(!link){ notifyError('Ο σύνδεσμος δεν ανακλήθηκε'); return }
      setAcctLink(link.url)
      setAcctUntil(accountantLink.expiryLabel(link))
      setAcctCopied(false); setAcctRevoked(true); setTimeout(()=>setAcctRevoked(false),2600)
    } finally { setAcctBusy(false) }
  }

  function exportBundle(){
    // Φάκελος για τον λογιστή: προσεγμένο Excel — Κατάσταση Αποτελεσμάτων + αναλυτικές
    // κινήσεις (Έσοδα/Έξοδα) με σωστές ημερομηνίες/ποσά, σαν να το ετοίμασε λογιστής.
    exportAccountantBundle({
      year, propName: prop?.name || 'Ακίνητο',
      statementLines: statement.lines.map(l => ({ label: l.label, amount: l.amount, kind: l.kind, negative: l.negative })),
      provisionMonthly: provision.monthly,
      book: book.map(toMovement),
      myData: myDataExport,
      assets: businessMode ? assets : undefined,
      buildingFraction: BUILDING_VALUE_FRACTION,
    })
  }

  function printReport(){
    const reconLite:ReconLite[] = recon.map(r=>{ const m=STATUS_META[r.status]; return { label:r.expected.label||'', paid:r.paidAmount, expected:r.expected.amount, statusLabel:m.label, statusColor:STATUS_PRINT[r.status] } })
    printAccountingReport({
      propName: prop?.name||'Ακίνητο', address: prop?.address??undefined, year, regimeLabel,
      statement, provision, reconciliation: reconLite,
      expectedTotal: rs.expectedTotal, collectedTotal: rs.collectedTotal, outstanding: rs.outstanding,
      enfiaEstimated,
      branding,
    })
  }

  async function officialReport(){
    if(genOfficial) return
    const reconLite:ReconLite[] = recon.map(r=>{ const m=STATUS_META[r.status]; return { label:r.expected.label||'', paid:r.paidAmount, expected:r.expected.amount, statusLabel:m.label, statusColor:STATUS_PRINT[r.status] } })
    setGenOfficial(true)
    try {
      await downloadOfficialAccountingReport({
        propName: prop?.name||'Ακίνητο', address: prop?.address??undefined, year, regimeLabel,
        statement, provision, reconciliation: reconLite,
        expectedTotal: rs.expectedTotal, collectedTotal: rs.collectedTotal, outstanding: rs.outstanding,
        enfiaEstimated,
        branding,
      }, { supabase, userId })
    } catch { notifyError(failed(MSG.pdf)) }
    finally { setGenOfficial(false) }
  }

  // Ξέρουμε το σχήμα της οθόνης (σειρά μετρικών + πίνακας λογιστικής), οπότε
  // δείχνουμε το σχήμα αντί για κυκλικό δείκτη: η διάταξη δεν «πηδά» όταν
  // φτάσουν τα δεδομένα.
  if(loading) return (<><SkeletonKPIs n={2} /><Skeleton h={280} r={14} /></>)

  const regimeLabel = businessMode ? 'Επιχείρηση (ΕΛΠ)' : (regime==='individual_shortterm' ? 'Βραχυχρόνια μίσθωση' : 'Μακροχρόνια μίσθωση')
  // Έχει το έτος πραγματική κίνηση; Αν όχι, αντί για τοίχο από «0 €» δείχνουμε μια
  // ήρεμη, καθοδηγητική αφετηρία (τι θα ξεκλειδώσει μόλις μπουν δεδομένα).
  const hasActivity = grossIncome>0 || expensesTotal>0 || rentAccruedYear>0 || book.length>0
  // Η περίληψη των προχωρημένων λέει ΤΙ κρύβει, ώστε κανείς να μη χρειαστεί να
  // το ανοίξει «μήπως». Το ισοζύγιο αναφέρεται μόνο σε όποιον όντως το έχει.
  const advancedSummary = [
    'Κλείσιμο χρήσης', 'φορολογική κλίμακα', 'ταμειακές ροές', 'κόστος αγοράς και πώλησης',
    ...(mode==='professional' && elp==='personal' ? ['ενοποίηση χαρτοφυλακίου'] : []),
    ...(canJournal && doubleEntry ? ['ισοζύγιο διπλογραφικής'] : []),
  ].join(', ') + '.'

  // ── ΤΑ ΚΟΥΜΠΙΑ ΠΟΥ ΦΕΥΓΟΥΝ ΠΡΟΣ ΤΟΝ ΛΟΓΙΣΤΗ ────────────────────────────
  // Πηγαίνουν μέσα στην κάρτα του φακέλου, γιατί απαντούν την ίδια ερώτηση.
  // Ο φάκελος είναι το κύριο κουμπί και μένει εκεί· εδώ κάθονται τα τρία που
  // δεν είναι ο φάκελος: το σκέτο Excel (για όποιον θέλει μόνο τα νούμερα),
  // η ζωντανή πύλη, και το ημερολόγιο άρθρων όπου υπάρχει.
  const pillBtn:React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:8, height:T.h.md, padding:'0 14px', borderRadius:T.radius.pill, border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-secondary)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily: T.font.sans, whiteSpace:'nowrap' }
  const accountantActions = (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <button onClick={exportBundle} title="Μόνο τα νούμερα: αναλυτικές κινήσεις και κατάσταση αποτελεσμάτων σε ένα αρχείο Excel. Περιέχεται ήδη μέσα στον φάκελο." style={pillBtn}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}>
          <Download size={13}/>Μόνο το Excel
        </button>
        <button onClick={shareWithAccountant} disabled={acctBusy} title={canAccountantPortal ? "Ζωντανός σύνδεσμος για τον λογιστή σου, χωρίς σύνδεση και χωρίς email. Καλύπτει ΟΛΑ τα ακίνητά σου, όχι μόνο αυτό: διεύθυνση, ΑΤΑΚ, μίσθωμα, έσοδα και δαπάνες της χρονιάς." : "Η ζωντανή πύλη λογιστή περιλαμβάνεται από το πακέτο «Ενα ακίνητο» και πάνω, όπως και η εξαγωγή Ε2."}
          style={{ ...pillBtn, borderColor:acctLink?'var(--accent)':'var(--border-default)', color:acctLink?'var(--accent)':'var(--text-secondary)', cursor:acctBusy?'wait':'pointer', transition:'color 0.15s, border-color 0.15s' }}
          onMouseEnter={e=>{ if(!acctLink){ e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' } }} onMouseLeave={e=>{ if(!acctLink){ e.currentTarget.style.borderColor='var(--border-default)'; e.currentTarget.style.color='var(--text-secondary)' } }}>
          {canAccountantPortal
            ? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg>
            : <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
          {acctBusy?'Δημιουργία…':acctLink?'Πύλη λογιστή έτοιμη':'Ζωντανή πύλη λογιστή'}
        </button>
        {canJournal && doubleEntry && (
        <button onClick={()=>setJournalOpen(true)} title="Πλήρες ημερολόγιο άρθρων και εξαγωγή CSV (SoftOne/Epsilon/QuickBooks/Xero)" style={pillBtn}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/></svg>Ημερολόγιο άρθρων
        </button>
        )}
      </div>
      {acctLink && (
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, padding:'8px 8px 8px 12px', borderRadius:T.radius.inner, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', flexWrap:'wrap' }}>
          <span style={{ display:'inline-flex', width:24, height:24, borderRadius:8, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)', flexShrink:0 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          </span>
          <input readOnly value={acctLink} onFocus={e=>e.currentTarget.select()} style={{ flex:1, minWidth:150, border:'none', background:'transparent', color:'var(--text-secondary)', fontSize:12, fontFamily: T.font.sans, outline:'none', textOverflow:'ellipsis' }} />
          <button onClick={()=>{ try{ navigator.clipboard?.writeText(acctLink); setAcctCopied(true); setTimeout(()=>setAcctCopied(false),2000) }catch{ /* ignore */ } }} style={{ height:T.h.sm, padding:'0 12px', borderRadius:T.radius.pill, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:acctCopied?'var(--positive)':'var(--text-secondary)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily: T.font.sans, whiteSpace:'nowrap' }}>{acctCopied?'Αντιγράφηκε':'Αντιγραφή'}</button>
          <a href={acctLink} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:5, height:T.h.sm, padding:'0 13px', borderRadius:T.radius.pill, background:'var(--accent)', color:'var(--accent-text)', fontSize:12, fontWeight:600, textDecoration:'none', fontFamily: T.font.sans, whiteSpace:'nowrap' }}>Άνοιγμα πύλης<ArrowUpRight size={13}/></a>
          <div style={{ width:'100%', display:'flex', alignItems:'center', gap:10, marginTop:2, paddingLeft:2 }}>
            {/* Η ΕΜΒΕΛΕΙΑ ΛΕΓΕΤΑΙ ΕΚΕΙ ΠΟΥ ΠΑΙΡΝΕΤΑΙ Η ΑΠΟΦΑΣΗ. Ο πίνακας
                accountant_links δεν έχει στήλη ακινήτου: ο σύνδεσμος είναι ΑΝΑ
                ΧΡΗΣΤΗ και ο RPC επιστρέφει κάθε ακίνητο του κατόχου, με
                διεύθυνση, ΑΤΑΚ και μίσθωμα. Το κουμπί όμως ζει μέσα στην καρτέλα
                ΕΝΟΣ ακινήτου, οπότε η φυσική ανάγνωση ήταν «μοιράζομαι αυτό
                εδώ». Η μόνη ένδειξη ήταν σε tooltip που δεν ανοίγει σε κινητό. */}
            <span style={{ fontSize:11, color:acctRevoked?'var(--positive)':'var(--text-tertiary)', fontFamily: T.font.sans }}>{acctRevoked?'Ο παλιός σύνδεσμος ακυρώθηκε και ο λογιστής βγήκε.':`Πρόσβαση μόνο για ανάγνωση, σε ΟΛΑ τα ακίνητά σου, όχι μόνο σε αυτό.${acctUntil?` Ισχύει ${acctUntil}.`:''}`}</span>
            <button onClick={revokeAccountantLink} disabled={acctBusy} title="Ακυρώνει τον τρέχοντα σύνδεσμο και δημιουργεί καινούριο· ο παλιός παύει αμέσως να λειτουργεί και όποιος λογιστής τον είχε ήδη ανοίξει χάνει την πρόσβαση" style={{ marginLeft:'auto', background:'none', border:'none', padding:0, color:'var(--text-tertiary)', fontSize:11, fontWeight:700, cursor:acctBusy?'wait':'pointer', fontFamily: T.font.sans, whiteSpace:'nowrap' }} onMouseEnter={e=>{ if(!acctBusy) e.currentTarget.style.color='var(--negative)' }} onMouseLeave={e=>{ e.currentTarget.style.color='var(--text-tertiary)' }}>Ανάκληση</button>
          </div>
        </div>
      )}
    </>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Κεφαλίδα: τίτλος, διακόπτης όψης και έτος */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ minWidth:0 }}>
          {/* `h1` ΚΑΙ ΟΧΙ `h2`: ΕΙΝΑΙ Ο ΤΙΤΛΟΣ ΤΗΣ ΟΘΟΝΗΣ. Ως `h2` άφηνε την
              ιεραρχία χωρίς κορυφή και η πλοήγηση ανά επικεφαλίδα ξεκινούσε από
              το δεύτερο επίπεδο. Η εμφάνιση δεν αλλάζει: ίδιο μέγεθος, ίδιο
              βάρος, ίδια απόσταση — αλλάζει μόνο τι ακούει ο αναγνώστης οθόνης. */}
          <h1 style={{ fontFamily: T.font.sans, fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0, letterSpacing:'0.1px' }}>Λογιστική</h1>
          <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'4px 0 0', fontFamily: T.font.sans }}>{regimeLabel} · έσοδα, φόρος και καθαρό αποτέλεσμα, με βάση τα πραγματικά σου δεδομένα.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          {/* ΜΙΑ ΕΡΩΤΗΣΗ, ΟΧΙ ΔΥΟ. Δίπλα σε αυτή ζούσε δεύτερη, «Ατομική ή
              νομικό πρόσωπο», που είναι η νομική μορφή: δηλώθηκε στην υποδοχή
              και δεν ξαναρωτιέται. Αυτή εδώ είναι διαφορετικό ερώτημα και δεν
              συμπεραίνεται: αν το ΑΚΙΝΗΤΟ ανήκει στην επιχείρηση. Το ενοίκιο
              φυσικού προσώπου φορολογείται με το άρθρο 40, ακόμη κι όταν ο
              ιδιοκτήτης έχει επιχείρηση για κάτι άλλο. */}
          {mode==='professional'&&(
            <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
              {([['personal','Ενοίκια ιδιώτη'],['business','Μέσω επιχείρησης']] as [typeof elp,string][]).map(([e,label])=>(
                <button key={e} onClick={()=>setElp(e)}
                  title={e==='personal'?'Άρθρο 40: δική του κλίμακα, με τεκμαρτή έκπτωση 5%':'Άρθρο 15 ή εταιρικός συντελεστής, όταν το ακίνητο ανήκει στην επιχείρηση'}
                  style={{ height:T.h.sm, padding:'0 12px', border:'none', borderRadius:8, cursor:'pointer', fontFamily:T.font.sans, fontSize:12,
                    fontWeight: elp===e?600:400, background: elp===e?'var(--bg-surface)':'transparent',
                    color: elp===e?'var(--text-primary)':'var(--text-secondary)' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <ActionMenu label="Εργαλεία και αναφορές" title="Αναφορές και εργαλεία διαχείρισης" icon={<Printer size={14}/>} items={[
            { key:'print', label:'Λογιστική αναφορά', description:'Σύνοψη εσόδων, φόρου και καθαρού σε PDF, έτοιμη για τον λογιστή σου', icon:<Printer size={16}/>, onClick:printReport },
            { key:'official', label:'Επίσημη αναφορά', description:'Υπογεγραμμένο PDF με αριθμό εγγράφου και QR επαλήθευσης', icon:<ShieldCheck size={16}/>, onClick:officialReport, busy:genOfficial },
            { key:'adjust', label:'Αναπροσαρμογή ενοικίου', description:'Νόμιμη ειδοποίηση προς τον μισθωτή, με ηλεκτρονική υπογραφή', icon:<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>, onClick:()=>setAdjustOpen(true) },
            ...(canPortfolioReport ? [
              { key:'builder', label:'Σύνθεση αναφοράς', description:'Προσαρμοσμένη αναφορά για όλο το χαρτοφυλάκιο', icon:<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>, onClick:()=>setReportBuilderOpen(true) },
            ] : []),
            ...(canBankImport ? [
              { key:'bank', label:'Εισαγωγή από τράπεζα', description:'Ανέβασε κίνηση λογαριασμού και αντιστοίχισε αυτόματα τις εισπράξεις', icon:<Landmark size={16}/>, onClick:()=>setShowBankImport(true) },
            ] : []),
            ...(canOwnerSplit ? [
              { key:'split', label:'Κατανομή σε ιδιοκτήτες', description:'Καθαρό ανά συνιδιοκτήτη, με διαχειριστική αμοιβή', icon:<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>, onClick:()=>setSplitOpen(true) },
            ] : []),
          ]}/>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={()=>setYear(y=>y-1)} aria-label="Προηγούμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronLeft size={17}/></button>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', fontFamily: T.font.sans, minWidth:60, textAlign:'center', fontVariantNumeric:'tabular-nums' }}>{year}</span>
            <button onClick={()=>setYear(y=>y+1)} aria-label="Επόμενο έτος" style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--border-subtle)', background:'var(--bg-surface)', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><ChevronRight size={17}/></button>
          </div>
        </div>
      </div>

      {/* Ο ΦΑΚΕΛΟΣ, ΜΠΡΟΣΤΑ ΑΠΟ ΟΛΑ. Είναι η ερώτηση που έχει ο ιδιοκτήτης πριν
          από κάθε άλλη — «τι πρέπει να πάω στον λογιστή και τι μου λείπει;» —
          και μαζί του, στην ΙΔΙΑ κάρτα, ό,τι άλλο φεύγει προς τον λογιστή. */}
      <AccountantDossier state={dossier} year={year} properties={dossierProps} exportSource={dossierExport} actions={accountantActions} />

      {/* Παράμετροι επιχείρησης, τυποποιημένα πεδία με σύντομη εξήγηση */}
      {businessMode&&(
        <div style={{ ...card, display:'flex', gap:14, flexWrap:'wrap', alignItems:'stretch' }}>
          {elpForm==='sole'&&(
            <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:150 }}>
              <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily: T.font.sans, fontWeight:500 }}>Εισφορές ΕΦΚΑ / έτος</span>
              <input type="number" inputMode="numeric" min={0} value={ekfa} onChange={e=>updateEkfa(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder=""
                onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-default)'}
                style={{ width:110, height:T.h.lg, padding:'10px 16px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>Εκπίπτουν και μειώνουν το ταμείο.</span>
            </div>
          )}
          {elpForm==='sole'&&(
            <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:150 }}>
              <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily: T.font.sans, fontWeight:500 }}>Ηλικία</span>
              <input type="number" inputMode="numeric" min={16} max={99} value={age} onChange={e=>updateAge(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder="Παράδειγμα: 30"
                title="Προαιρετικό. Ενεργοποιεί τη μειωμένη κλίμακα νέων (ν.5246/2025) στην ατομική επιχείρηση."
                onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-default)'}
                style={{ width:90, height:T.h.lg, padding:'10px 16px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>Μειωμένη κλίμακα νέων (έως 30 ετών).</span>
            </div>
          )}
          {elpForm==='company'&&(
            <div style={{ display:'flex', flexDirection:'column', gap:5, minWidth:150 }}>
              <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily: T.font.sans, fontWeight:500 }}>Διανομή κερδών</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="number" inputMode="numeric" min={0} max={100} value={distribution} onChange={e=>setDistribution(e.target.value===''?'':Math.min(100,Math.max(0,Number(e.target.value))))} placeholder=""
                  onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-default)'}
                  style={{ width:74, height:T.h.lg, padding:'10px 16px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-elevated)', color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
                <span style={{ color:'var(--text-tertiary)', fontSize:14 }}>%</span>
              </div>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>Το μέρισμα φορολογείται επιπλέον με 5%.</span>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:6, justifyContent:'center', paddingLeft:14, borderLeft:'1px solid var(--border-subtle)', minWidth:220 }}>
            <Check checked={firstYears} onChange={updateFirstYears} label={<span style={{ fontWeight:500, color:'var(--text-primary)' }}>Νέα επιχείρηση (πρώτη τριετία)</span>} align="start" />
            <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight:1.5, paddingLeft:26 }}>Τα πρώτα 3 έτη δραστηριότητας: 1ο κλιμάκιο 4,5% (αντί 9%) και προκαταβολή φόρου μειωμένη κατά 50%.</span>
          </div>
        </div>
      )}

      {/* Αφετηρία — όταν δεν υπάρχει καμία κίνηση για το έτος (καθαρή onboarding εικόνα) */}
      {!hasActivity && (
        <div style={{ ...card, padding:'26px 24px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
            <span style={{ width:44, height:44, borderRadius:12, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)' }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
            </span>
            <div style={{ flex:1, minWidth:240 }}>
              <p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:0, fontFamily: T.font.sans, letterSpacing:'0.1px' }}>Ξεκίνα τη λογιστική σου για το {year}</p>
              <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'6px 0 0', lineHeight:1.6, fontFamily: T.font.sans, maxWidth:520 }}>Καταχώρησε ενοίκια και έξοδα και όλα εδώ υπολογίζονται αυτόματα: έσοδα, φόρος, καθαρό ταμείο και έτοιμες αναφορές για τον λογιστή σου.</p>
              <div style={{ display:'flex', alignItems:'center', gap:16, margin:'14px 0 0', flexWrap:'wrap' }}>
                {['Έσοδα και πρόβλεψη φόρου','Καθαρό ταμείο','Αναφορές και PDF'].map(t=>(
                  <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:7, fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>
                    <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--border-default)', flexShrink:0 }}/>{t}
                  </span>
                ))}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'18px 0 0', flexWrap:'wrap' }}>
                <button onClick={()=>onNavigate?.('tenant')} style={{ height:T.h.md, padding:'0 17px', borderRadius:10, border:'none', background:'var(--accent)', color:'var(--accent-text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily: T.font.sans }}>Καταχώρηση ενοικίου</button>
                <button onClick={()=>onNavigate?.('finances')} style={{ height:T.h.md, padding:'0 16px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily: T.font.sans }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}>Προσθήκη εξόδου</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {hasActivity && (<>
      {/* Οι τρεις αποφάσεις της χρονιάς, ίδιο μέγεθος, μία ευθεία. Ουδέτερα
          (μελάνι) by default· χρώμα ΜΟΝΟ στο hover. */}
      <div {...fixedCols(2, 12, 'stretch')}>
        <Kpi label={`Καθαρό ταμείο · ${year}`} value={eur(statement.netCash)} tone={statement.netCash<0?'negative':'accent'}
          hot={hoverStat==='cash'} onHover={v=>setHoverStat(v?'cash':null)}
          note="Ό,τι απομένει μετά από φόρους, τέλη και δόσεις δανείου." />
        <Kpi label="Πρόβλεψη φόρου · μήνα" value={eur(provision.monthly)}
          hot={hoverStat==='prov'} onHover={v=>setHoverStat(v?'prov':null)}
          note={`Για τον φόρο ${year} · σύνολο ${eur(provision.annualTaxTotal)} τον χρόνο.`} />
      </div>

      {/* Κατάσταση Αποτελεσμάτων + Πρόβλεψη φόρου */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16 }}>
        <div className="po-fig-card" style={card}>
          <p style={cardTitle}>Κατάσταση αποτελεσμάτων {year}</p>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {statement.lines.map((l,i)=>{
              const strong = l.kind==='subtotal'||l.kind==='result'
              return (
                <div key={l.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:l.kind==='result'?'1px solid var(--border-subtle)':'none' }}>
                  <span style={{ flex:1, fontSize:strong?13.5:13, fontFamily: T.font.sans, fontWeight:strong?600:400, color:l.kind==='result'?'var(--text-primary)':'var(--text-secondary)' }}>{l.label}</span>
                  <span className="po-fig" data-tone={l.kind==='result'?(l.amount>=0?'accent':'negative'):undefined} style={{ fontSize:strong?14:13, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', fontWeight:strong?700:500 }}>{l.negative?'−':''}{eur(l.amount)}</span>
                </div>
              )
            })}
          </div>
          {/* ── ΟΙ ΔΥΟ ΠΑΡΑΔΟΧΕΣ, ΔΙΠΛΑ ΣΤΙΣ ΓΡΑΜΜΕΣ ΠΟΥ ΑΛΛΑΖΟΥΝ ────────────
              Η τραπεζική είσπραξη ζούσε σε ΔΙΚΗ ΤΗΣ κάρτα, μακριά από την
              «Τεκμαρτή έκπτωση 5%» που ενεργοποιεί ή σβήνει. Ο χρήστης έβλεπε
              έναν διακόπτη χωρίς αποτέλεσμα και ένα αποτέλεσμα χωρίς αιτία,
              με μια ολόκληρη κάρτα ανάμεσά τους. Μια παράμετρος διαβάζεται
              μόνο δίπλα στο νούμερο που κουνάει. */}
          {!businessMode && (regime==='individual_longterm' || uncollectedRent>0) && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border-subtle)', display:'flex', flexDirection:'column', gap:10 }}>
              {regime==='individual_longterm' && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                    <Check checked={rentsBank} onChange={v=>setRentsBankOverride(v===collection.viaBank?null:v)} label={<span style={{ fontSize:12, color:'var(--text-secondary)' }}>Τα ενοίκια εισπράττονται <strong style={{ color:'var(--text-primary)' }}>μέσω τραπέζης</strong>.</span>}/>
                    <InfoHint>Από 1/1/2026 (ν.5246/2025) τα μισθώματα κατοικίας πρέπει να εισπράττονται με τραπεζικό ή ηλεκτρονικό μέσο (κατάθεση, IRIS, έμβασμα). Με μετρητά χάνεται η τεκμαρτή έκπτωση 5% και φορολογείσαι στο 100% του ενοικίου.</InfoHint>
                  </div>
                  {/* ΑΠΟ ΠΟΥ ΤΟ ΞΕΡΕΙ. Χωρίς αυτή τη γραμμή, ο χρήστης βλέπει ένα
                      τσεκαρισμένο κουτάκι και δεν έχει λόγο να το ελέγξει — που
                      είναι ακριβώς πώς περνά απαρατήρητος ένας μικρότερος φόρος. */}
                  <p style={{ margin:'4px 0 0', paddingLeft:26, fontSize:11, color:'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight:1.5 }}>
                    {collectionModeReason(collection)}
                    {rentsBankOverride !== null && ' Το άλλαξες εσύ· μετράει η δική σου απάντηση.'}
                  </p>
                  {!rentsBank && <p style={{ margin:'4px 0 0', paddingLeft:26, fontSize:12, color:'var(--negative)', fontFamily: T.font.sans }}>Χωρίς τραπεζική είσπραξη ο φόρος υπολογίζεται στο 100% των ενοικίων.</p>}
                </div>
              )}
              {uncollectedRent>0 && (
                <Check align="start" checked={claimedUncollected} onChange={setClaimedUncollected}
                  hint="Άρθρο 39 §4: τα ανείσπρακτα δεν φορολογούνται εφόσον έχουν διεκδικηθεί νομικά (διαταγή πληρωμής, αγωγή έξωσης) πριν την προθεσμία δήλωσης."
                  label={<span style={{ fontSize:12, color:'var(--text-secondary)' }}>Τα ανείσπρακτα ({eur(uncollectedRent)}) έχουν <strong style={{ color:'var(--text-primary)' }}>διεκδικηθεί νομικά</strong>, να μη φορολογηθούν φέτος.</span>} />
              )}
            </div>
          )}
        </div>

        {/* ΤΙ ΔΕΝ ΛΕΕΙ ΗΔΗ Ο ΑΡΙΘΜΟΣ ΑΠΟ ΠΑΝΩ. Η κάρτα έλεγε ξανά το ετήσιο
            σύνολο και το φορολογητέο — δύο μεγέθη που κάθονται πλέον κάτω από
            τον ίδιο τους τον τίτλο, στο πλακίδιο του φόρου. Εδώ μένει μόνο ό,τι
            δεν χωρά σε πλακίδιο: από πού βγαίνει, τι μέρος του είναι φόροι
            ακινήτου, και τι πληρώνεται πότε. Και η επιφύλαξη, που ήταν
            ΞΕΧΩΡΙΣΤΗ ΚΑΡΤΑ για μία πρόταση, έγινε το υποσέλιδό της. */}
        <div className="po-fig-card" style={{ ...card, display:'flex', flexDirection:'column' }}>
          <p style={cardTitle}>Πώς βγαίνει ο φόρος {year}</p>
          <p style={{ fontSize:13, color:'var(--text-secondary)', margin:0, fontFamily: T.font.sans, lineHeight:1.6 }}>
            {businessMode
              ? (elpForm==='company' ? <>Σταθερός συντελεστής <strong style={{ color:'var(--text-primary)' }}>22%</strong> στα καθαρά κέρδη, μετά από εκπιπτόμενα έξοδα, αποσβέσεις και τόκους.</> : <>Κλίμακα άρθρου 15 στα καθαρά κέρδη, μετά από εκπιπτόμενα έξοδα, εισφορές ΕΦΚΑ, αποσβέσεις και τόκους.</>)
              : (regime==='individual_longterm'
                  ? <>Τεκμαρτή έκπτωση 5% και προοδευτική {bracketsLabelForYear(year)}{!businessMode&&myTaxShare!=null&&(consolidation?.count??0)>1?<>, στο σύνολο των ενοικίων σου όπως στο Ε1: ο φόρος εδώ είναι <strong style={{ color:'var(--text-primary)' }}>το μερίδιο αυτού του ακινήτου</strong></>:''}.</>
                  : <>Φόρος στα μεικτά με την {bracketsLabelForYear(year)}, συν ΤΑΚΚ και τέλος παρεπιδημούντων όπου ισχύει.</>)}
            {/* Ο «μέσος συντελεστής» του statement.ts είναι φόρος ΠΡΟΣ ΜΕΙΚΤΑ
                (effRate = incomeTax / gross), όχι προς το φορολογητέο. Γραμμένα
                στην ίδια πρόταση, τα δύο μεγέθη διαβάζονταν ως πολλαπλασιασμός
                που δεν βγαίνει: 14,25% επί 11.400 δεν κάνει 1.710. Ο ιδιοκτήτης
                που κάνει τον έλεγχο συμπεραίνει ότι ο φόρος είναι λάθος. */}
            {statement.incomeTax>0?<> Ο φόρος εισοδήματος βγαίνει {eur(statement.incomeTax)} σε φορολογητέο {eur(statement.taxableIncome)}, δηλαδή {pct(statement.effectiveRate)} των μεικτών εσόδων.</>:''}
            {provision.propertyTaxes>0?<> Από το ετήσιο σύνολο, {eur(provision.propertyTaxes)} είναι φόροι και τέλη ακινήτου.</>:''}
            {year===athensYear()?<> Για να προλάβεις τη χρονιά, <strong style={{ color:'var(--text-primary)' }}>{eur(provision.perRemainingMonth)} τον μήνα</strong> ως τον Δεκέμβριο.</>:''}
            {provision.advanceTax>0?<> Συν προκαταβολή {eur(provision.advanceTax)}, που πιστώνεται τον επόμενο χρόνο: σύνολο πρώτου έτους {eur(provision.firstYearTotal)}.</>:''}
          </p>
          <div style={{ flex:1 }}/>
          <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'14px 0 0', paddingTop:12, borderTop:'1px solid var(--border-subtle)', fontFamily: T.font.sans, lineHeight:1.55 }}>
            Εκτιμήσεις. Επιβεβαίωση με τον λογιστή σου ή στο <a href={AADE_CALENDAR_URL} target="_blank" rel="noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>myAADE</a>.
            <InfoHint>
              {businessMode
                ? (elpForm==='company' ? 'Νομικό πρόσωπο: 22% επί των καθαρών κερδών (μετά από εκπιπτόμενα έξοδα, αποσβέσεις κτιρίου και εξοπλισμού, καθώς και τόκους), συν προκαταβολή φόρου 80% και 5% φόρος στη διανομή μερίσματος.' : 'Ατομική επιχείρηση: κλίμακα άρθρου 15 (9-44%) επί των καθαρών κερδών, μετά από εκπιπτόμενα έξοδα, ΕΦΚΑ, αποσβέσεις και τόκους, με τεκμαρτό ελάχιστο καθαρό εισόδημα και προκαταβολή φόρου 55%.')
                : (regime==='individual_longterm' ? 'Μακροχρόνια μίσθωση φυσικού προσώπου: το εισόδημα φορολογείται κατά το άρθρο 40, με τεκμαρτή έκπτωση 5% για επισκευές και συντήρηση. Οι λοιπές δαπάνες, ο ΕΝΦΙΑ και οι τόκοι δανείου δεν εκπίπτουν.' : 'Βραχυχρόνια μίσθωση φυσικού προσώπου: εισόδημα ακινήτων στα μεικτά, χωρίς έκπτωση δαπανών, συν τέλος ανθεκτικότητας ανά διανυκτέρευση και τέλος παρεπιδημούντων όπου ισχύει.')}
              {/* Η πρόταση απαριθμούσε ΔΥΟ στοιχεία («αξία και τ.μ.»)
                  ενώ η εκτίμηση διαβάζει πλέον ΤΕΣΣΕΡΑ. Ο ιδιοκτήτης που
                  συμπλήρωσε έτος κατασκευής ή όροφο έβλεπε το νούμερο να
                  αλλάζει χωρίς να λέει τίποτα η οθόνη από πού ήρθε. */}
              {enfiaEstimated&&provision.propertyTaxes>0?` Ο ΕΝΦΙΑ (${eur(enfia)}) είναι αυτόματη εκτίμηση από τα καταχωρημένα στοιχεία του ακινήτου: αξία, τ.μ., έτος κατασκευής και όροφος. Καταχώρησε το ακριβές στους Λογαριασμούς.`:''}
              {/* Ο ΕΝΦΙΑ ΠΟΥ ΛΕΙΠΕΙ ΛΕΓΕΤΑΙ. Η πρόβλεψη χωρίς αυτόν είναι
                  μικρότερη από την πραγματική, και ο ιδιοκτήτης δεν είχε τρόπο
                  να δει γιατί το ποσό δεν εμφανίστηκε ποτέ. */}
              {enfiaBlock?` ${enfiaBlock} Το ποσό λείπει από την πρόβλεψη ώσπου να καταχωρηθεί στους Λογαριασμούς.`:''}
            </InfoHint>
          </p>
        </div>
      </div>
      </>)}

      {/* ══ Η ΣΥΜΦΩΝΙΑ ΕΝΟΙΚΙΩΝ ΔΕΝ ΑΦΟΡΑ ΤΗ ΒΡΑΧΥΧΡΟΝΙΑ ══════════════════════
          Η κάρτα αποδιδόταν ΠΑΝΤΑ. Σε βραχυχρόνιο ακίνητο δεν υπάρχουν «ενοίκια
          του μήνα» να συμφωνήσουν με τίποτα — υπάρχουν κρατήσεις, και αυτές τις
          δείχνει η διπλανή στήλη. Το αποτέλεσμα ήταν μια κάρτα με ΜΙΑ πρόταση
          μέσα («Δεν υπάρχουν καταχωρημένα ενοίκια για το 2026»), τεντωμένη στο
          ύψος της διπλανής λίστας: ~700 εικονοστοιχεία κενού, στη μισή οθόνη,
          για ένα πράγμα που δεν πρόκειται ποτέ να γεμίσει.

          ΚΑΙ ΤΟ ΤΕΝΤΩΜΑ ΦΕΥΓΕΙ ΚΑΙ ΓΙΑ ΤΗ ΜΑΚΡΟΧΡΟΝΙΑ. Οι δύο κάρτες δεν είναι
          ισότιμα πλακίδια σειράς — είναι δύο ανεξάρτητα πάνελ, το ένα σύνοψη και
          το άλλο λίστα. Το `alignItems: 'start'` αφήνει την καθεμιά στο ύψος του
          περιεχομένου της. (Ο κανόνας «ίδιο ύψος» ισχύει για ΣΕΙΡΑ ομοειδών
          καρτών, όχι για δύο διαφορετικά πράγματα δίπλα-δίπλα.) */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:16, alignItems:'start' }}>
        {!isShort && <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <p style={{ ...cardTitle, margin:0 }}>Συμφωνία ενοικίων</p>
            <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily: T.font.sans }}>Εισπράχθηκαν <strong style={{ color:'var(--text-primary)' }}>{eur(rs.collectedTotal)}</strong> / {eur(rs.expectedTotal)}</span>
          </div>
          {recon.length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily: T.font.sans, padding:'12px 0' }}>Δεν υπάρχουν καταχωρημένα ενοίκια για το {year}.</p>
          ):(
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {recon.map((r,i)=>{ const m=STATUS_META[r.status]; return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)' }}>
                  {/* Η κουκκίδα έφυγε: έλεγε με χρώμα ό,τι λέει η λέξη δίπλα της. */}
                  <span style={{ flex:1, fontSize:13, fontWeight:m.strong?600:400, color:'var(--text-primary)', fontFamily: T.font.sans }}>{r.expected.label}</span>
                  <span style={{ fontSize:13, color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(r.paidAmount)} / {eur(r.expected.amount)}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--text-primary)', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:18, padding:'2px 9px', fontFamily: T.font.sans, minWidth:78, textAlign:'center' }}>{m.label}</span>
                </div>
              )})}
            </div>
          )}
          {rs.collectedTotal>0&&(
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:12 }}>
              <button onClick={printCertificate} title="Ετήσια βεβαίωση καταβληθέντων ενοικίων (PDF) για τον μισθωτή" style={{ display:'inline-flex', alignItems:'center', gap:6, height:T.h.sm, padding:'0 12px', borderRadius:T.radius.pill, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily: T.font.sans }} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><Printer size={13}/>Βεβαίωση ενοικίου</button>
              <button onClick={officialRentCertificate} disabled={genOfficialCert} title="Επίσημο true-PDF βεβαίωσης ενοικίου με αριθμό εγγράφου και QR επαλήθευσης· κατάλληλο για τράπεζες, ΔΟΥ και φορείς" style={{ display:'inline-flex', alignItems:'center', gap:6, height:T.h.sm, padding:'0 12px', borderRadius:T.radius.pill, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:genOfficialCert?'wait':'pointer', opacity:genOfficialCert?0.6:1, fontFamily: T.font.sans }} onMouseEnter={e=>{if(!genOfficialCert){e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-default)';e.currentTarget.style.color='var(--text-secondary)'}}><ShieldCheck size={14}/>{genOfficialCert?'Δημιουργία…':'Επίσημο PDF'}</button>
            </div>
          )}
        </div>}

        <div style={card}>
          <div style={{ marginBottom:12 }}>
            <p style={{ ...cardTitle, margin:0 }}>{mode==='professional'?'Βιβλίο Εσόδων-Εξόδων':'Πρόσφατες κινήσεις'}</p>
          </div>
          {recentLedger.length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily: T.font.sans, padding:'8px 0' }}>Καμία κίνηση για το {year}.</p>
          ):(
            <div style={{ display:'flex', flexDirection:'column' }}>
              {(mode==='professional'?book.slice(-14).reverse():recentLedger).map((e,i,arr)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<arr.length-1?'1px solid var(--border-subtle)':'none' }}>
                  <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', width:74, flexShrink:0 }}>{e.date.split('-').reverse().join('/')}</span>
                  <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily: T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description}</span>
                  {mode==='professional'&&<span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', width:80, textAlign:'right' }}>{eur(e.balance)}</span>}
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans, width:92, textAlign:'right' }}>{e.type==='income'?'+':'−'}{eur(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ΟΙ ΔΥΟ ΦΟΡΟΙ ΠΟΥ ΕΧΟΥΝ ΔΙΚΟ ΤΟΥΣ ΕΝΤΥΠΟ. Ο ΕΝΦΙΑ και ο έλεγχος του
          προσυμπληρωμένου Ε2 στέκονταν σε αντίθετες άκρες της καρτέλας: ο ένας
          τρίτος από πάνω, πριν ο χρήστης δει έναν αριθμό της χρονιάς του, ο
          άλλος τελευταίος, πίσω από κάθε τι άλλο και με ένα ορφανό κενό από
          πάνω του. Μπαίνουν μαζί, μετά την εικόνα της χρήσης: πρώτα «πόσα
          βγάζω και τι φόρο», μετά «τι λέει το κάθε έντυπο». */}
      <EnfiaPanel propertyId={propertyId} userId={userId} />
      <E2ReconcileCard userId={userId} year={year} plan={plan} onUpgrade={()=>onNavigate?.('settings')} />

      {/* ── ΠΡΟΧΩΡΗΜΕΝΑ ───────────────────────────────────────────────────────
          Ο απλός ιδιοκτήτης θέλει τέσσερα πράγματα: έσοδα, έξοδα, φόρους και τι
          πάει στον λογιστή. Τα υπόλοιπα εργαλεία δεν είναι περιττά — είναι απλώς
          δεύτερα. Ζουν εδώ, ένα κλικ μακριά, αντί να γεμίζουν την πρώτη ματιά
          του ανθρώπου που θέλει μόνο να ξέρει πού βρίσκεται. */}
      <div style={card}>
        <button onClick={()=>setAdvancedOpen(o=>!o)} aria-expanded={advancedOpen} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:9, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
          <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:advancedOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ ...cardTitle, margin:0 }}>Προχωρημένα εργαλεία</p>
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'3px 0 0', fontFamily: T.font.sans, lineHeight:1.5 }}>{advancedSummary}</p>
          </div>
        </button>
        {advancedOpen && (
        <div style={{ display:'flex', flexDirection:'column', gap:16, marginTop:16 }}>

        {/* Κλείσιμο χρήσης, premium κατάσταση με σαφή ένδειξη ανοιχτό/κλειστό */}
        {(()=>{ const isCurrent = year===athensYear()
          const isFuture = year>athensYear()
          const st = drift?'drift':closing?'locked':'open'
          const meta = { open:{ c:isCurrent?'var(--accent)':'var(--text-tertiary)', label:'ΑΝΟΙΧΤΟ' }, locked:{ c:'var(--positive)', label:'ΚΛΕΙΣΜΕΝΟ' }, drift:{ c:'var(--warning)', label:'ΑΠΟΚΛΙΣΗ' } }[st]
          return (
          <div style={{ ...card, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', borderColor: st==='drift'?'var(--warning)':'var(--border-subtle)' }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:6, height:26, padding:'0 10px', borderRadius:8, background: st==='drift' ? `color-mix(in srgb, var(--warning) 12%, transparent)` : 'var(--bg-elevated)', color: st==='drift' ? 'var(--warning)' : 'var(--text-secondary)', fontSize:10, fontWeight:700, letterSpacing:'0.5px', fontFamily: T.font.sans }}>
              {st==='open'?(isCurrent?<span className="live-dot" style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>:<Unlock size={12}/>):<Lock size={12}/>}{meta.label}
            </span>
            <span style={{ fontSize:13, color:'var(--text-secondary)', fontFamily: T.font.sans }}>
              {st==='open'?(isCurrent?<>Χρήση {year} σε εξέλιξη · μήνας {provMonth} από 12.</>:isFuture?<>Η χρήση {year} δεν έχει ξεκινήσει ακόμη.</>:<>Χρήση {year} ολοκληρωμένη, έτοιμη για κλείδωμα.</>):st==='drift'?<>Η χρήση {year} κλειδώθηκε, αλλά τα δεδομένα άλλαξαν έκτοτε.</>:<>Χρήση {year}, κλειδωμένη στις {new Date(closing!.locked_at).toLocaleDateString('el-GR')}.</>}
              <InfoHint>Το κλείδωμα κρατά αμετάβλητο στιγμιότυπο των αριθμών του έτους (χρήσιμο μετά την υποβολή στην ΑΑΔΕ). Αν αργότερα αλλάξεις ενοίκια ή έξοδα, εμφανίζεται προειδοποίηση απόκλισης, χωρίς να χαθεί το αρχικό κλείδωμα.</InfoHint>
              {lockErr && <span style={{ display:'block', marginTop:4, color:'var(--negative)', fontSize:12 }}>Το κλείδωμα δεν αποθηκεύτηκε: {lockErr}. Έλεγξε ότι έχει εφαρμοστεί το migration book_closings στη βάση.</span>}
            </span>
            <div style={{ flex:1 }}/>
            {st==='open'
              ? (isFuture ? null : <button onClick={lockYear} style={{ display:'inline-flex', alignItems:'center', gap:6, height:T.h.sm, padding:'0 14px', borderRadius:14, border:'1px solid var(--border-default)', background:'var(--bg-elevated)', color:'var(--text-secondary)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily: T.font.sans, transition: 'background-color 0.13s, border-color 0.13s, color 0.13s, box-shadow 0.13s, transform 0.13s, opacity 0.13s' }} onMouseEnter={e=>{e.currentTarget.style.color='var(--accent)';e.currentTarget.style.borderColor='var(--accent)'}} onMouseLeave={e=>{e.currentTarget.style.color='var(--text-secondary)';e.currentTarget.style.borderColor='var(--border-default)'}}><Lock size={13}/>Κλείδωμα έτους</button>)
              : <>
                  {st==='drift'&&<button onClick={lockYear} style={{ height:T.h.sm, padding:'0 13px', borderRadius:14, border:'1px solid var(--warning)', background:'transparent', color:'var(--warning)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily: T.font.sans }}>Ενημέρωση</button>}
                  <button onClick={unlockYear} style={{ display:'inline-flex', alignItems:'center', gap:6, height:T.h.sm, padding:'0 13px', borderRadius:14, border:'none', background:'transparent', color:'var(--text-tertiary)', fontSize:13, cursor:'pointer', fontFamily: T.font.sans }} onMouseEnter={e=>{e.currentTarget.style.color='var(--text-secondary)'}} onMouseLeave={e=>{e.currentTarget.style.color='var(--text-tertiary)'}}><Unlock size={13}/>Ξεκλείδωμα</button>
                </>}
          </div>
        )})()}

        {/* Φορολογική κλίμακα 2026, αναφορά ανά καθεστώς (έμφαση στο κλιμάκιο του χρήστη) */}
        {!(businessMode&&elpForm==='company') ? (
          <div style={card}>
            <p style={cardTitle}>{businessMode ? 'Κλίμακα επιχειρηματικής δραστηριότητας 2026' : 'Φορολογική κλίμακα ενοικίων 2026'}</p>
            {/* ΜΙΑ ΣΕΙΡΑ, ΟΣΑ ΚΙ ΑΝ ΕΙΝΑΙ ΤΑ ΚΛΙΜΑΚΙΑ. Το `auto-fit` έβγαζε πέντε
                κουτιά και ένα μόνο του από κάτω: η κλίμακα είναι ΜΙΑ κλίμακα, και
                διαβάζεται ως σκάλα μόνο όταν τα σκαλιά είναι στην ίδια ευθεία.
                Το πλήθος στηλών είναι πλέον το πλήθος των κλιμακίων — έξι για την
                επιχειρηματική, τέσσερα για τα ενοίκια — και τα κουτιά στενεύουν
                αντί να τυλίγονται. Βλ. `fixedCols`: στα στενά σπάει σε τρία και
                δύο, όπου η μία σειρά δεν χωρά ούτως ή άλλως. */}
            <div {...fixedCols((businessMode ? BUSINESS_INCOME_ROWS_2026 : RENTAL_TAX_ROWS_2026).length, 10, 'stretch')}>
              {(businessMode ? BUSINESS_INCOME_ROWS_2026 : RENTAL_TAX_ROWS_2026).map((r,i)=>{ const active=statement.taxableIncome>r.from&&statement.taxableIncome<=r.to; const hot=hoverBracket===i; return (
                <div key={r.range} onMouseEnter={()=>setHoverBracket(i)} onMouseLeave={()=>setHoverBracket(null)}
                  style={{ padding:'10px 12px', borderRadius:12, minWidth:0, border:`1px solid ${hot?'var(--accent)':active?'var(--border-default)':'var(--border-subtle)'}`, background:active?'var(--bg-elevated)':'var(--bg-surface)', transition:'border-color 0.15s, background 0.15s', cursor:'default' }}>
                  <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:0, fontFamily: T.font.sans }}>{r.range}</p>
                  <p style={{ fontSize:16, fontWeight:700, color:hot?'var(--accent)':'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans, transition:'color 0.16s ease' }}>{r.rate}</p>
                </div>
              )})}
            </div>
          </div>
        ) : (
          <div style={{ ...card, display:'flex', alignItems:'center', justifyContent:'space-between', gap:20, flexWrap:'wrap' }}>
            <div style={{ minWidth:0, flex:1 }}>
              <p style={{ ...cardTitle, margin:0 }}>Νομικό πρόσωπο</p>
              <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'7px 0 0', fontFamily: T.font.sans, lineHeight:1.6, maxWidth:560 }}>Σταθερός φόρος <strong style={{ color:'var(--text-primary)' }}>22%</strong> επί των καθαρών κερδών, ανεξαρτήτως ύψους εισοδήματος (ΑΕ, ΕΠΕ, ΙΚΕ, ΟΕ, ΕΕ). Στη διανομή μερίσματος προστίθεται φόρος 5% και ισχύει προκαταβολή φόρου για το επόμενο έτος.</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minWidth:104, height:76, borderRadius:12, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', flexShrink:0 }}>
              <span style={{ fontSize:28, fontWeight:700, color:'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>22%</span>
              <span style={{ fontSize:10, color:'var(--text-tertiary)', letterSpacing:'0.5px', textTransform:'uppercase', fontFamily: T.font.sans, marginTop:5 }}>Συντελεστής</span>
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
                <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily: T.font.sans, padding:'8px 0' }}>Δεν υπάρχουν έσοδα σε άλλα ακίνητα για το {year}.</p>
              ):(<>
                <p style={{ fontSize:12, color:'var(--text-secondary)', margin:'0 0 12px', fontFamily: T.font.sans, lineHeight:1.5 }}>Ο φόρος φυσικού προσώπου είναι προοδευτικός στο <strong style={{ color:'var(--text-primary)' }}>σύνολο</strong> των ενοικίων (όπως στο Ε1), όχι ανά ακίνητο.</p>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:12 }}>
                  <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily: T.font.sans }}>Συνολικά έσοδα</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(portfolio.con.grossIncome)}</p></div>
                  <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily: T.font.sans }}>Συνολικός φόρος</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(portfolio.con.incomeTax)}</p></div>
                  <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily: T.font.sans }}>Μέσος συντ.</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{pct(portfolio.con.effectiveRate)}</p></div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {portfolio.con.perProperty.map(pp=>(
                    <div key={pp.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:'var(--bg-surface)', border:`1px solid ${pp.id===propertyId?'var(--border-default)':'var(--border-subtle)'}` }}>
                      <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', fontFamily: T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{portfolio.names[pp.id]}</span>
                      <span style={{ fontSize:12, color:'var(--text-secondary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(pp.statement.grossIncome)}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans, minWidth:70, textAlign:'right' }}>φόρος {eur(pp.taxShare)}</span>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
            )}

            <div style={card}>
              <p style={cardTitle}>Εκπιπτόμενα έξοδα {year}</p>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:12 }}>
                <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily: T.font.sans }}>Εκπιπτόμενα</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(deductibleTotal)}</p></div>
                <div><p style={{ fontSize:11, color:'var(--text-tertiary)', margin:0, textTransform:'uppercase', letterSpacing:'0.4px', fontFamily: T.font.sans }}>Μη εκπιπτόμενα</p><p style={{ fontSize:16, fontWeight:700, color:'var(--text-secondary)', margin:'2px 0 0', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(expensesTotal-deductibleTotal)}</p></div>
              </div>
              <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, fontFamily: T.font.sans, lineHeight:1.5 }}>Για ιδιώτη τα έξοδα δεν εκπίπτουν αναλυτικά. Στο καθεστώς <strong style={{ color:'var(--text-primary)' }}>Επιχείρηση (ΕΛΠ)</strong> εκπίπτουν πλήρως.<InfoHint>Για φυσικό πρόσωπο με μακροχρόνια μίσθωση κατοικίας ισχύει η τεκμαρτή έκπτωση 5% (όχι αναλυτικά έξοδα). Στο καθεστώς Επιχείρηση (ΕΛΠ) εκπίπτουν αναλυτικά, μαζί με αποσβέσεις εξοπλισμού ({eur(inventoryDepr)} τον χρόνο) και τόκους δανείων ({eur(loanInterestYear)} τον χρόνο).</InfoHint></p>
            </div>
          </div>
        )}

        {/* Συμβουλευτική, καθαρές, στοχευμένες προτάσεις με αξία (ανοιγοκλείνει ομοιόμορφα) */}
        {advisory.length>0 && (
        <div ref={advisoryRef} style={card}>
          <button onClick={()=>{ setAdvisoryOpen(o=>!o); setOpenAdvisory(null) }} aria-expanded={advisoryOpen} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
            <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)', flexShrink:0 }}><Lightbulb size={15}/></span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ ...cardTitle, margin:0 }}>Συμβουλευτική</p>
              <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'2px 0 0', fontFamily: T.font.sans }}>{advisory.length} ιδέες φορολογίας, χρηματοδότησης και αξιοποίησης, από τα δικά σου δεδομένα.</p>
            </div>
            <ChevronRight size={17} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:advisoryOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
          </button>
          {advisoryOpen && (<>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap:12, alignItems:'start', marginTop:16 }}>
            {advisory.map(a=>{
              const open = openAdvisory===a.id
              return (
                <div key={a.id} style={{ borderRadius:12, background:'var(--bg-surface)', border:`1px solid ${open?'var(--border-default)':'var(--border-subtle)'}`, overflow:'hidden', transition:'border-color 0.15s' }}>
                  <button onClick={()=>setOpenAdvisory(open?null:a.id)} aria-expanded={open} className="acc-toggle" style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily: T.font.sans }}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{e.currentTarget.style.background='none'}}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={{ display:'inline-flex', alignItems:'center', height:20, padding:'0 9px', borderRadius:6, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', fontSize:10, fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-tertiary)' }}>{ADVISORY_TONE[a.tone]}</span>
                      <p style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', margin:'7px 0 0', lineHeight:1.35 }}>{a.title}</p>
                    </div>
                    <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:open?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
                  </button>
                  {open&&(
                    <div style={{ padding:'0 16px 15px' }}>
                      <p style={{ fontSize:13, color:'var(--text-secondary)', margin:0, fontFamily: T.font.sans, lineHeight:1.6 }}>{a.body}</p>
                      {(a.refer||a.linkHref)&&(
                        <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:11, flexWrap:'wrap' }}>
                          {a.refer&&<span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans }}>{referLabel(a.refer)}</span>}
                          {a.linkHref&&<a href={a.linkHref} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'var(--accent)', textDecoration:'none', fontFamily: T.font.sans }}>{a.linkLabel||'Περισσότερα'}<ArrowUpRight size={12}/></a>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ marginTop:14, paddingTop:12, borderTop:'1px solid var(--border-subtle)' }}>
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:0, fontFamily: T.font.sans, lineHeight:1.55 }}>Ενημερωτικές προτάσεις, όχι επίσημη συμβουλή.<InfoHint>Οι προτάσεις δεν υποκαθιστούν τον λογιστή, τον δικηγόρο ή τον συμβολαιογράφο σου. Για την επίσημη εξαγωγή συμπερασμάτων και δηλώσεων απευθύνσου σε πιστοποιημένο επαγγελματία.</InfoHint></p>
          </div>
          </>)}
        </div>
        )}

        {/* «Τι άλλαξε» — επίκαιροι κανόνες 2026 σχετικοί με το προφίλ (διακριτικό) */}
        {relevantChanges.length>0 && (
        <div ref={changesRef} style={card}>
          <button onClick={()=>{ setChangesOpen(o=>!o); setOpenChange(null) }} aria-expanded={changesOpen} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:10, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' }}>
            <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', color:'var(--text-secondary)', flexShrink:0 }}><Landmark size={15}/></span>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ ...cardTitle, margin:0 }}>Τι άλλαξε το 2026</p>
              <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'2px 0 0', fontFamily: T.font.sans }}>{relevantChanges.length} επίκαιροι κανόνες για το προφίλ σου.</p>
            </div>
            <ChevronRight size={17} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:changesOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
          </button>
          {changesOpen && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap:12, marginTop:16, alignItems:'start' }}>
              {relevantChanges.map((u:RegulatoryUpdate)=>{
                const uo = openChange===u.id
                return (
                  <div key={u.id} style={{ borderRadius:12, background:'var(--bg-surface)', border:`1px solid ${uo?'var(--border-default)':'var(--border-subtle)'}`, overflow:'hidden', transition:'border-color 0.15s' }}>
                    <button onClick={()=>setOpenChange(uo?null:u.id)} aria-expanded={uo} className="acc-toggle" style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'13px 15px', background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily: T.font.sans }}
                      onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{e.currentTarget.style.background='none'}}>
                      <p style={{ flex:1, minWidth:0, fontSize:13, fontWeight:600, color:'var(--text-primary)', margin:0, lineHeight:1.35, fontFamily: T.font.sans }}>{u.title}</p>
                      <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:uo?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
                    </button>
                    {uo && (
                      <div style={{ padding:'0 15px 14px' }}>
                        <p style={{ fontSize:13, color:'var(--text-secondary)', margin:0, lineHeight:1.6, fontFamily: T.font.sans }}>{u.summary}</p>
                        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:11, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily: T.font.sans, letterSpacing:'0.3px' }}>Ισχύς: {u.effective} · {u.legalBasis}</span>
                          {u.sourceHref && <a href={u.sourceHref} target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12, color:'var(--accent)', textDecoration:'none', fontFamily: T.font.sans }}>{u.sourceLabel||'Πηγή'}<ArrowUpRight size={12}/></a>}
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
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:0, fontFamily: T.font.sans, lineHeight:1.55 }}>Ενημερωτικά, με επίσημες πηγές. Οι κανόνες αλλάζουν, επιβεβαίωσε στο myAADE/gov.gr ή με τον λογιστή σου.</p>
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
                {xferOpen&&<p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'3px 0 0', fontFamily: T.font.sans, fontWeight:400 }}>Φόροι, συμβολαιογραφικά και μεσιτικά. Εκτίμηση πριν τη μεταβίβαση.</p>}
              </div>
            </button>
            {xferOpen&&(
            <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:2, gap:2 }}>
              {([['buy','Αγορά'],['sell','Πώληση']] as ['buy'|'sell',string][]).map(([s,label])=>(
                <button key={s} onClick={()=>setXferSide(s)} style={{ height:T.h.sm, padding:'0 15px', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily: T.font.sans, fontWeight:xferSide===s?600:500, background:xferSide===s?'var(--accent)':'transparent', color:xferSide===s?'var(--accent-text)':'var(--text-secondary)', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>{label}</button>
              ))}
            </div>
            )}
          </div>
          {xferOpen&&(<>
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom:14 }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text-secondary)', fontFamily: T.font.sans }}>
              <span style={{ minWidth:96 }}>{xferSide==='buy'?'Τιμή αγοράς':'Τιμή πώλησης'}</span>
              <input type="number" inputMode="numeric" min={0} value={xferPrice} onKeyDown={e=>{ if(e.key==='-'||e.key==='e'||e.key==='+') e.preventDefault() }} onChange={e=>setXferPrice(e.target.value===''?'':Math.max(0,Number(e.target.value)))} placeholder={(Number(prop?.value)||0)?String(Math.round(Number(prop?.value))):'0'}
                onFocus={e=>e.currentTarget.style.borderColor='var(--accent)'} onBlur={e=>e.currentTarget.style.borderColor='var(--border-default)'}
                style={{ width:104, height:T.h.lg, padding:'10px 16px', borderRadius:10, border:'1px solid var(--border-default)', background:'var(--bg-surface)', color:'var(--text-primary)', fontSize:14, fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right', outline:'none', transition:'border-color 0.14s' }}/>
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
                  <span style={{ flex:1, fontSize:13, color:'var(--text-secondary)', fontFamily: T.font.sans }}>{l.label}</span>
                  <span style={{ fontSize:13, color:l.amount===0?'var(--text-tertiary)':'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans, fontWeight:500 }}>{eur(l.amount)}</span>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0 0', marginTop:4, borderTop:'1px solid var(--border-subtle)' }}>
                <span style={{ flex:1, fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily: T.font.sans }}>Σύνολο εξόδων &amp; φόρων</span>
                <span style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(xfer.totalCosts)} <span style={{ fontSize:12, fontWeight:500, color:'var(--text-tertiary)' }}>({pct(xfer.costPct)})</span></span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0 0' }}>
                <span style={{ flex:1, fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily: T.font.sans }}>{xferSide==='buy'?'Συνολική εκταμίευση':'Καθαρό έσοδο πώλησης'}</span>
                <span style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{eur(xferSide==='buy'?(xfer.cashOut||0):(xfer.netProceeds||0))}</span>
              </div>
            </div>
            <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'14px 0 0', paddingTop:12, borderTop:'1px solid var(--border-subtle)', fontFamily: T.font.sans, lineHeight:1.55 }}>Ενδεικτική εκτίμηση. Τα ακριβή ποσά ορίζονται από συμβολαιογράφο ή την ΑΑΔΕ.<InfoHint>Τα ποσοστά είναι τα ισχύοντα. Τα κλιμακωτά συμβολαιογραφικά, η αντικειμενική αξία και οι απαλλαγές οριστικοποιούνται από συμβολαιογράφο, δικηγόρο ή την ΑΑΔΕ. Ο φόρος υπεραξίας 15% τελεί σε αναστολή.</InfoHint></p>
          </>):(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily: T.font.sans, padding:'4px 0' }}>Δώσε τιμή για να δεις την ανάλυση κόστους.</p>
          )}
          </>)}
        </div>

        {/* Ταμειακές ροές */}
        <div style={card}>
          <button onClick={()=>setCashOpen(o=>!o)} className="acc-toggle" style={{ display:'flex', alignItems:'center', gap:9, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left', marginBottom:cashOpen?16:0 }}>
            <ChevronRight size={16} style={{ color:'var(--text-tertiary)', flexShrink:0, transform:cashOpen?'rotate(90deg)':'none', transition:'transform 0.18s' }}/>
            <p style={{ ...cardTitle, margin:0 }}>Ταμειακές ροές {year}</p>
          </button>
          {/* ═══ ΤΟ ΓΡΑΦΗΜΑ ΠΟΥ ΞΕΚΙΝΑ ΑΠΟ ΤΟ ΜΗΔΕΝ ══════════════════════════
              Ήταν δύο λωρίδες των έξι εικονοστοιχείων, στοιβαγμένες, και οι δύο
              να ξεκινούν από την ίδια αριστερή άκρη: για να καταλάβεις αν ο
              μήνας ήταν θετικός έπρεπε να συγκρίνεις μήκη με το μάτι. Και ήταν
              πράσινη και κόκκινη, δηλαδή κάθε μήνας με έξοδα διαβαζόταν σαν
              προειδοποίηση.

              Τώρα ένας άξονας στο μηδέν, εκροή αριστερά, εισροή δεξιά. Το
              πρόσημο του μήνα φαίνεται από την πλευρά που βαραίνει, πριν
              διαβαστεί οποιοσδήποτε αριθμός. Οι επικεφαλίδες πάνω από τον
              άξονα ΕΙΝΑΙ το υπόμνημα — δεν ξαναγράφεται από κάτω. */}
          {cashOpen&&(cash.every(c=>!c.income&&!c.expense)?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily: T.font.sans, padding:'4px 0' }}>Καμία κίνηση για το {year}.</p>
          ):(<>
          <div style={{ display:'flex', alignItems:'center', gap:14, paddingBottom:8, marginBottom:4, borderBottom:'1px solid var(--border-subtle)' }}>
            <span style={{ width:104, flexShrink:0 }}/>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
              <span style={{ flex:1, textAlign:'right', display:'inline-flex', alignItems:'center', justifyContent:'flex-end', gap:6, fontSize:11, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-tertiary)', fontFamily: T.font.sans }}>
                <span style={{ width:8, height:8, borderRadius:2, background:'var(--series-out)' }}/>Έξοδα
              </span>
              <span style={{ width:1, flexShrink:0 }}/>
              <span style={{ flex:1, display:'inline-flex', alignItems:'center', gap:6, fontSize:11, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-tertiary)', fontFamily: T.font.sans }}>
                <span style={{ width:8, height:8, borderRadius:2, background:'var(--series-in)' }}/>Έσοδα
              </span>
            </div>
            <span style={{ width:110, flexShrink:0, textAlign:'right', fontSize:11, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-tertiary)', fontFamily: T.font.sans }}>Καθαρή ροή</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column' }}>
            {cash.map((c,i)=>{ const net=c.income-c.expense; const empty=!c.income&&!c.expense; return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:14, height:26 }}>
                <span style={{ width:104, flexShrink:0, fontSize:12, color:empty?'var(--text-tertiary)':'var(--text-secondary)', fontFamily: T.font.sans }}>{MONTHS_NOM[i]}</span>
                <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                  <div style={{ flex:1, display:'flex', justifyContent:'flex-end', minWidth:0 }}>
                    {c.expense>0&&<div title={`Έξοδα ${eur(c.expense)}`} style={{ height:11, borderRadius:'3px 1px 1px 3px', width:`${Math.max(1.5, c.expense/maxCash*100)}%`, background:'var(--series-out)' }}/>}
                  </div>
                  {/* Ο άξονας του μηδενός: μία γραμμή, σε κάθε σειρά, ώστε οι
                      δώδεκα μήνες να μετριούνται από το ίδιο σημείο. */}
                  <span style={{ width:1, height:16, flexShrink:0, background:'var(--series-axis)' }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    {c.income>0&&<div title={`Έσοδα ${eur(c.income)}`} style={{ height:11, borderRadius:'1px 3px 3px 1px', width:`${Math.max(1.5, c.income/maxCash*100)}%`, background:'var(--series-in)' }}/>}
                  </div>
                </div>
                <span style={{ width:110, flexShrink:0, textAlign:'right', fontSize:12, fontWeight:empty?400:600, color:empty?'var(--text-tertiary)':'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>{empty?'':eur(net)}</span>
              </div>
            )})}
          </div>
          {/* Το σύνολο της χρονιάς, μία φορά, στο ίδιο πλάτος με τη στήλη του. */}
          <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:6, paddingTop:10, borderTop:'1px solid var(--border-default)' }}>
            <span style={{ flex:1, fontSize:12, fontWeight:600, color:'var(--text-secondary)', fontFamily: T.font.sans }}>Σύνολο {year}</span>
            <span style={{ width:110, flexShrink:0, textAlign:'right', fontSize:13, fontWeight:700, color:'var(--text-primary)', fontVariantNumeric:'tabular-nums', fontFamily: T.font.sans }}>
              {eur(cash.reduce((s,c)=>s+c.income-c.expense,0))}
            </span>
          </div>
          </>))}
        </div>

        {/* ── ΤΟ ΙΣΟΖΥΓΙΟ, ΚΑΙ ΜΟΝΟ ΑΥΤΟ ────────────────────────────────────
            Εδώ καθόταν ολόκληρη κάρτα «Για τον λογιστή»: Excel, ζωντανή πύλη,
            ημερολόγιο άρθρων και ισοζύγιο, διπλωμένα μέσα σε άλλο δίπλωμα, στο
            τέλος της καρτέλας. Δηλαδή η ερώτηση «τι δίνω στον λογιστή μου;»
            απαντιόταν ΔΥΟ φορές — μία στην κορυφή, με τον φάκελο, και μία εδώ
            κάτω με το ίδιο ακριβώς Excel που ήδη περιέχει ο φάκελος. Τα κουμπιά
            ανέβηκαν στην κάρτα του φακέλου, όπου ανήκουν.
            ΜΕΝΕΙ ΤΟ ΙΣΟΖΥΓΙΟ, γιατί είναι πίνακας και όχι ενέργεια, και ΜΟΝΟ
            στα διπλογραφικά: ένας ιδιοκτήτης με ένα διαμέρισμα δεν πρέπει να δει
            ποτέ τη λέξη· μια ΙΚΕ πρέπει να τη δει με έμφαση. Ποιος έχει τι, το
            ξέρει ο φάκελος (dossier.ts) — εδώ απλώς υπακούμε στην απάντησή του. */}
        {canJournal && doubleEntry && (
        <div style={card}>
          <p style={cardTitle}>Ισοζύγιο διπλογραφικής {year}</p>
          {trial.length===0?(
            <p style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily: T.font.sans, padding:'2px 0' }}>Δεν υπάρχουν εισπράξεις ή πληρωμές για το {year} ώστε να σχηματιστεί ισοζύγιο.</p>
          ):(
            <div style={{ borderRadius:12, border:'1px solid var(--border-subtle)', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              <div style={{ minWidth:TRIAL_MIN }}>
              <div style={{ display:'grid', gridTemplateColumns:TRIAL_COLS, gap:8, padding:'9px 14px', background:'var(--bg-elevated)', borderBottom:'1px solid var(--border-subtle)' }}>
                {[['Κωδικός ΕΛΠ','left'],['Λογαριασμός','left'],['Χρέωση','right'],['Πίστωση','right'],['Υπόλοιπο','right']].map(([h,a])=>(
                  <span key={h} style={{ fontSize:10, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-tertiary)', fontFamily: T.font.sans, textAlign:a as 'left'|'right' }}>{h}</span>
                ))}
              </div>
              {trial.map((r,i)=>(
                <div key={r.code} style={{ display:'grid', gridTemplateColumns:TRIAL_COLS, gap:8, padding:'8px 14px', borderBottom:i<trial.length-1?'1px solid var(--border-subtle)':'none', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums' }}>{r.code}</span>
                  <span style={{ fontSize:13, color:'var(--text-primary)', fontFamily: T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.account}>{r.account}</span>
                  <span style={{ fontSize:13, color:r.debit?'var(--text-secondary)':'var(--text-tertiary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{r.debit?eur(r.debit):fe(0)}</span>
                  <span style={{ fontSize:13, color:r.credit?'var(--text-secondary)':'var(--text-tertiary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{r.credit?eur(r.credit):fe(0)}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{eur(r.balance)}</span>
                </div>
              ))}
              <div style={{ display:'grid', gridTemplateColumns:TRIAL_COLS, gap:8, padding:'10px 14px', background:'var(--bg-elevated)', borderTop:'1px solid var(--border-default)', alignItems:'center' }}>
                <span/>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)', fontFamily: T.font.sans, textTransform:'uppercase', letterSpacing:'0.05em' }}>Σύνολα</span>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{eur(jTotals.debit)}</span>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{eur(jTotals.credit)}</span>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'flex-end', gap:5, fontSize:11, fontWeight:600, color:jTotals.balanced?'var(--text-tertiary)':'var(--negative)', fontFamily: T.font.sans, whiteSpace:'nowrap' }}>
                  {jTotals.balanced?<><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M20 6 9 17l-5-5"/></svg>Ισοσκελισμένο</>:<>Διαφορά {eur(jTotals.debit-jTotals.credit)}</>}
                </span>
              </div>
              </div>
            </div>
            )}
          <p style={{ fontSize:11, color:'var(--text-tertiary)', margin:'12px 0 0', fontFamily: T.font.sans, lineHeight:1.55 }}>Ταμειακή βάση, σχέδιο λογαριασμών των Ελληνικών Λογιστικών Προτύπων (ν. 4308/2014), αυτό που τροφοδοτεί το έντυπο Ε3. Κάθε άρθρο ισοσκελισμένο (χρέωση ίση με πίστωση), έτοιμο για καταχώρηση από τον λογιστή σου. Η αντιστοιχία με το παλιό ΕΓΛΣ, για όποιο λογιστήριο τη χρειάζεται, ταξιδεύει στο Excel.</p>
        </div>
        )}

        </div>
        )}
      </div>

      {/* ΠΡΟΣΚΛΗΣΗ ΜΟΝΟ ΣΕ ΟΠΟΙΟΝ ΔΕΝ ΤΑ ΕΧΕΙ ΗΔΗ. Ήταν δεμένη στο προφίλ, ενώ ό,τι
          διαφημίζει (ισοζύγιο, ημερολόγιο άρθρων) κρίνεται πλέον από τη
          ΣΥΝΔΡΟΜΗ: ο συνεργάτης με πακέτο Επαγγελματία και προφίλ Ιδιώτη έβλεπε
          το ημερολόγιο άρθρων να δουλεύει, και από κάτω μια κάρτα να του
          πουλάει το ημερολόγιο άρθρων. Ο φάκελος, το Excel και η πύλη λογιστή
          δεν αναφέρονται καθόλου: τα έχει ήδη κάθε συνδρομητής. */}
      {!canJournal && (
        <div style={{ ...card, padding:'20px 22px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:240 }}>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', margin:0, fontFamily: T.font.sans }}>Διαχειρίζεσαι πολλά ακίνητα ή θέλεις πλήρη λογιστική;</p>
              <p style={{ fontSize:12, color:'var(--text-tertiary)', margin:'3px 0 0', lineHeight:1.55, fontFamily: T.font.sans, maxWidth:520 }}>Το πακέτο Επαγγελματίας προσθέτει καθεστώς Επιχείρησης (ΕΛΠ), ισοζύγιο διπλογραφικής, ημερολόγιο άρθρων, ενοποίηση χαρτοφυλακίου και εκπιπτόμενα έξοδα με ακρίβεια λογιστή.</p>
            </div>
            <button onClick={()=>onNavigate?.('settings')} style={{ flexShrink:0, height:T.h.md, padding:'0 17px', borderRadius:10, border:'none', background:'var(--accent)', color:'var(--accent-text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily: T.font.sans }}>Δες το Επαγγελματίας</button>
          </div>
        </div>
      )}

      {showBankImport&&<BankImport propertyId={propertyId} userId={userId} year={year} onClose={()=>setShowBankImport(false)} onDone={()=>setRefreshKey(k=>k+1)} />}
      <ReportBuilder open={reportBuilderOpen} onClose={()=>setReportBuilderOpen(false)} userId={userId} supabase={supabase} branding={branding} />
      <JournalExport open={journalOpen} onClose={()=>setJournalOpen(false)} userId={userId} supabase={supabase} />
      <OwnerSplit open={splitOpen} onClose={()=>setSplitOpen(false)} userId={userId} supabase={supabase} branding={branding} />
      <RentAdjustmentModal open={adjustOpen} onClose={()=>setAdjustOpen(false)} userId={userId} supabase={supabase} branding={branding} />
    </div>
  )
}
