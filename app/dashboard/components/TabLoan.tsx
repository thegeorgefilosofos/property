'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calculator, TrendingDown, TrendingUp, Building2, Home, Wrench,
  Leaf, ChevronDown, ChevronUp, ExternalLink, Info, Check,
  AlertTriangle, Star, BarChart2, RefreshCw, Plus, Trash2,
  DollarSign, Calendar, Clock, Percent
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type LoanType = 'purchase' | 'renovation' | 'energy' | 'first_home' | 'investment' | 'auction'
type RateType = 'fixed' | 'variable' | 'mixed'

interface LoanScenario {
  id: string
  name: string
  amount: number
  rate: number
  years: number
  rateType: RateType
  loanType: LoanType
  propertyValue: number
  startDate: string
}

interface AmortizationRow {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

// ─── Real Bank Data (June 2026) ───────────────────────────────────────────────

const EURIBOR_3M = 2.18 // June 2026

const BANKS = [
  {
    id: 'eurobank',
    name: 'Eurobank',
    logo: '🏦',
    color: '#00549f',
    variable_spread_min: 0.90,
    variable_spread_max: 2.65,
    fixed_min: 2.60,
    fixed_max: 3.80,
    max_ltv: 80,
    max_years: 35,
    max_amount: 500000,
    features: ['Χωρίς έξοδα έγκρισης', 'Νομικός+Τεχνικός έλεγχος δωρεάν (750€)', 'Προέγκριση 48ω', 'Ψηφιακή υπογραφή gov.gr'],
    green_discount: 0.20,
    url: 'https://www.eurobank.gr/el/retail/proionta-upiresies/proionta/daneia/stegastika',
    note: 'Χαμηλότερο spread αγοράς',
  },
  {
    id: 'ethniki',
    name: 'Εθνική Τράπεζα',
    logo: '🏦',
    color: '#003087',
    variable_spread_min: 1.35,
    variable_spread_max: 2.50,
    fixed_min: 2.80,
    fixed_max: 3.90,
    max_ltv: 90,
    max_years: 35,
    max_amount: 500000,
    features: ['Έως 90% χρηματοδότηση', 'Σταθερό 3-30 χρόνια', 'Χωρίς εξέταση αιτήματος', 'Ενεργειακή έκπτωση -0.25%'],
    green_discount: 0.25,
    url: 'https://www.nbg.gr/el/idiwtes/daneia/stegastika-daneia',
    note: 'Υψηλότερο LTV 90%',
  },
  {
    id: 'alpha',
    name: 'Alpha Bank',
    logo: '🏦',
    color: '#cc0000',
    variable_spread_min: 1.50,
    variable_spread_max: 2.70,
    fixed_min: 2.60,
    fixed_max: 3.85,
    max_ltv: 90,
    max_years: 35,
    max_amount: 300000,
    features: ['Σταθερό 2.50% για νέους (3ετία)', 'Έως 90% χρηματοδότηση', 'Περίοδος χάριτος 2 χρόνια', 'Χωρίς έξοδα αίτησης'],
    green_discount: 0.10,
    url: 'https://www.alpha.gr/el/idiotika/daneia/stegastika-daneia',
    note: 'Ειδικό πρόγραμμα νέων',
  },
  {
    id: 'piraeus',
    name: 'Τράπεζα Πειραιώς',
    logo: '🏦',
    color: '#ff6600',
    variable_spread_min: 1.40,
    variable_spread_max: 2.45,
    fixed_min: 2.70,
    fixed_max: 3.95,
    max_ltv: 80,
    max_years: 35,
    max_amount: 500000,
    features: ['Πράσινα δάνεια spread 1.25%', 'Σπίτι μου ΙΙ διαθέσιμο', 'Euribor 1M βάση', 'Γρήγορη εκταμίευση'],
    green_discount: 0.15,
    url: 'https://www.piraeusbank.gr/el/idiwtes/proionta-upiresies/stegastika-daneia',
    note: 'Καλύτερο για πράσινα',
  },
  {
    id: 'optima',
    name: 'Optima Bank',
    logo: '🏦',
    color: '#8b0000',
    variable_spread_min: 1.60,
    variable_spread_max: 2.80,
    fixed_min: 2.90,
    fixed_max: 4.00,
    max_ltv: 75,
    max_years: 30,
    max_amount: 300000,
    features: ['Γρήγορη έγκριση', 'Premium εξυπηρέτηση', 'Ευέλικτοι όροι', 'Χωρίς κρυφές χρεώσεις'],
    green_discount: 0.10,
    url: 'https://www.optimabank.gr/el/retail/daneia/stegastika',
    note: 'Premium εξυπηρέτηση',
  },
]

const STATE_PROGRAMS = [
  {
    id: 'spiti_mou_2',
    name: 'Σπίτι μου ΙΙ',
    icon: '🏠',
    color: '#34d399',
    type: 'Κρατικό πρόγραμμα',
    description: 'Επιδότηση επιτοκίου 50% για αγορά πρώτης κατοικίας',
    max_amount: 190000,
    max_property_value: 250000,
    max_ltv: 90,
    rate_info: 'Επιτόκιο = 50% × (Euribor 1M + spread τράπεζας)',
    deadline: '31/08/2026',
    criteria: ['Ηλικία έως 50 ετών', 'Πρώτη κατοικία', 'Εισόδημα έως 40.000€ (ατομικό) / 50.000€ (οικογένεια)', 'Αντικειμενική αξία ≤ 250.000€'],
    extra: 'Τρίτεκνοι/Πολύτεκνοι: επιπλέον επιδότηση 50%',
    url: 'https://greece20.gov.gr/?calls=stegastiko-programma-quot-spiti-moy-ii-quot',
    banks: ['Εθνική', 'Alpha', 'Eurobank', 'Πειραιώς', 'Optima'],
  },
  {
    id: 'anakainizo',
    name: 'Ανακαινίζω 2026',
    icon: '🔨',
    color: '#fb923c',
    type: 'Επιδότηση ανακαίνισης',
    description: 'Επιδότηση έως 95% για ανακαίνιση κατοικίας',
    max_amount: 36000,
    max_property_value: null,
    max_ltv: 95,
    rate_info: 'Επιδότηση €300/τ.μ. για κατοικίες έως 120 τ.μ.',
    deadline: 'Αναμένεται 2026',
    criteria: ['Κατοικίες έως 120 τ.μ.', 'Ιδιοκατοίκηση ή κενή ≥2 χρόνια', 'ΠΕΑ + Ταυτότητα κτιρίου απαραίτητα', 'Γενικές εργασίες: 60-90%'],
    extra: 'Ενεργειακές παρεμβάσεις: 20-40% επιδότηση',
    url: 'https://www.gov.gr',
    banks: ['Όλες οι τράπεζες'],
  },
  {
    id: 'anakainizo_noikazo',
    name: 'Ανακαινίζω & Νοικιάζω',
    icon: '🔑',
    color: '#60a5fa',
    type: 'Επιδότηση + ενοίκιο',
    description: 'Επιδότηση ανακαίνισης + εγγυημένο ενοίκιο 5 χρόνια',
    max_amount: 15000,
    max_property_value: null,
    max_ltv: null,
    rate_info: 'Επιδότηση 40% ανακαίνισης + ενοίκιο αγοράς για 5 χρόνια',
    deadline: 'Τρέχον πρόγραμμα',
    criteria: ['Ακίνητο κενό ≥3 χρόνια', 'Αξία ανακαίνισης €5.000 - €40.000', 'Τεχνική επιθεώρηση ΥΠΕΚΑ', 'Μίσθωση σε ωφελούμενους ΟΠΕΚΑ'],
    extra: 'Εγγυημένο ενοίκιο από το κράτος για 5 χρόνια',
    url: 'https://www.opeka.gr/el/programmata',
    banks: ['Εθνική', 'Πειραιώς', 'Eurobank'],
  },
]

const ALTERNATIVE_FINANCING = [
  { id: 'leasing', title: 'Leasing Ακινήτου', icon: '📋', desc: 'Χρηματοδοτική μίσθωση — χαμηλότερες απαιτήσεις από δάνειο, φορολογικά πλεονεκτήματα για επαγγελματίες', pros: ['Φορολογική έκπτωση δόσεων', 'Χωρίς αρχικό κεφάλαιο', 'Εκτός ισολογισμού'], cons: ['Ακριβότερο συνολικά', 'Κυριότητα στο τέλος μόνο'] },
  { id: 'crowdfunding', title: 'Real Estate Crowdfunding', icon: '👥', desc: 'Συλλογική χρηματοδότηση ακινήτων μέσω πλατφορμών (EstateGuru, Reinvest24)', pros: ['Χαμηλό αρχικό κεφάλαιο', 'Διαφοροποίηση', 'Παθητικό εισόδημα'], cons: ['Χαμηλός έλεγχος', 'Ρευστότητα περιορισμένη'] },
  { id: 'seller_financing', title: 'Χρηματοδότηση από Πωλητή', icon: '🤝', desc: 'Ο πωλητής δέχεται τμηματικές πληρωμές — συνήθης σε οικογενειακές συναλλαγές ή εξοχικές', pros: ['Χωρίς τράπεζα', 'Διαπραγματεύσιμοι όροι', 'Γρήγορη κλείσιμο'], cons: ['Νομική πολυπλοκότητα', 'Ανάγκη συμβολαιογράφου'] },
  { id: 'auction', title: 'Δάνειο για Πλειστηριασμό', icon: '⚖️', desc: 'Ειδικά προϊόντα για αγορά ακινήτων σε πλειστηριασμό — χαμηλές τιμές, γρήγορη εκταμίευση', pros: ['Αγορά κάτω από αγοραία αξία', 'Επενδυτική ευκαιρία', 'Άμεση κυριότητα'], cons: ['Αβεβαιότητα κατάστασης', 'Δεσμεύσεις/Βάρη', 'Σύντομος χρόνος'] },
]

// ─── Calculator ───────────────────────────────────────────────────────────────

function calcMonthly(amount: number, annualRate: number, years: number): number {
  if (annualRate === 0) return amount / (years * 12)
  const r = annualRate / 100 / 12
  const n = years * 12
  return amount * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)
}

function calcAmortization(amount: number, annualRate: number, years: number): AmortizationRow[] {
  const rows: AmortizationRow[] = []
  const r = annualRate / 100 / 12
  const monthly = calcMonthly(amount, annualRate, years)
  let balance = amount
  for (let i = 1; i <= years * 12; i++) {
    const interest = balance * r
    const principal = monthly - interest
    balance = Math.max(0, balance - principal)
    rows.push({ month: i, payment: monthly, principal, interest, balance })
  }
  return rows
}

// ─── Helper components ────────────────────────────────────────────────────────

function fmtEur(n: number) { return n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) }
function fmtPct(n: number) { return `${n.toFixed(2)}%` }

function KPI({ label, value, color = '#e2e2f0', sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 8, padding: '12px 14px' }}>
      <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#4a4a60', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 15, fontFamily: 'JetBrains Mono, monospace', color, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: '#5a5a70', marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11, color: '#5a5a70', marginTop: 2 }}>{subtitle}</p>}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', background: '#08080d', border: '1px solid #242438',
  borderRadius: 6, padding: '8px 10px', color: '#e2e2f0', fontSize: 13,
  fontFamily: 'JetBrains Mono, monospace', outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70',
  textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5,
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabLoan({ propertyId, userId }: { propertyId: string; userId: string }) {
  const [activeTab, setActiveTab] = useState<'calculator' | 'banks' | 'programs' | 'alternative'>('calculator')

  // Calculator state
  const [loanAmount, setLoanAmount] = useState(150000)
  const [propertyValue, setPropertyValue] = useState(200000)
  const [rate, setRate] = useState(3.5)
  const [years, setYears] = useState(25)
  const [rateType, setRateType] = useState<RateType>('fixed')
  const [loanType, setLoanType] = useState<LoanType>('purchase')
  const [showAmortization, setShowAmortization] = useState(false)
  const [extraPayment, setExtraPayment] = useState(0)
  const [showRefinance, setShowRefinance] = useState(false)
  const [newRate, setNewRate] = useState(3.0)
  const [remainingBalance, setRemainingBalance] = useState(100000)
  const [remainingYears, setRemainingYears] = useState(20)

  // Scenarios
  const [scenarios, setScenarios] = useState<LoanScenario[]>([])

  // Bank filter
  const [filterGreen, setFilterGreen] = useState(false)
  const [selectedLoanType, setSelectedLoanType] = useState<LoanType>('purchase')

  // Calculations
  const monthly = calcMonthly(loanAmount, rate, years)
  const totalPayment = monthly * years * 12
  const totalInterest = totalPayment - loanAmount
  const ltv = (loanAmount / propertyValue) * 100
  const amortization = calcAmortization(loanAmount, rate, years)

  // With extra payment
  const monthlyWithExtra = extraPayment > 0
    ? (() => {
        let bal = loanAmount, months = 0
        const m = monthly + extraPayment
        while (bal > 0 && months < years * 12) { bal = bal * (1 + rate / 100 / 12) - m; months++ }
        return { months, saved: (years * 12 - months) * monthly }
      })()
    : null

  // Refinance savings
  const currentMonthly = calcMonthly(remainingBalance, rate, remainingYears)
  const newMonthly = calcMonthly(remainingBalance, newRate, remainingYears)
  const refinanceSavings = (currentMonthly - newMonthly) * remainingYears * 12

  // Variable rate effective
  const variableEffective = EURIBOR_3M + rate

  function addScenario() {
    const s: LoanScenario = {
      id: Date.now().toString(), name: `Σενάριο ${scenarios.length + 1}`,
      amount: loanAmount, rate, years, rateType, loanType, propertyValue,
      startDate: new Date().toISOString().split('T')[0],
    }
    setScenarios(p => [...p, s])
  }

  const LOAN_TYPES = [
    { id: 'purchase', label: 'Αγορά κατοικίας', icon: <Home size={12}/> },
    { id: 'first_home', label: 'Πρώτη κατοικία', icon: <Star size={12}/> },
    { id: 'renovation', label: 'Ανακαίνιση', icon: <Wrench size={12}/> },
    { id: 'energy', label: 'Ενεργειακή αναβάθμιση', icon: <Leaf size={12}/> },
    { id: 'investment', label: 'Επενδυτικό', icon: <TrendingUp size={12}/> },
    { id: 'auction', label: 'Πλειστηριασμός', icon: <Building2 size={12}/> },
  ]

  const tabs = [
    { id: 'calculator', label: 'Calculator', icon: <Calculator size={12}/> },
    { id: 'banks', label: 'Τράπεζες', icon: <Building2 size={12}/> },
    { id: 'programs', label: 'Κρατικά', icon: <Star size={12}/> },
    { id: 'alternative', label: 'Εναλλακτικά', icon: <RefreshCw size={12}/> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header KPIs ── */}
      <div style={{ background: 'rgba(212,175,66,0.05)', border: '1px solid rgba(212,175,66,0.15)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calculator size={16} color="#d4af42"/>
          <p style={{ fontSize: 12, color: '#d4af42', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>Εργαλείο Στεγαστικών Δανείων</p>
        </div>
        <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70' }}>Euribor 3M: <span style={{ color: '#60a5fa' }}>{fmtPct(EURIBOR_3M)}</span></span>
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70' }}>Τελ. ενημ.: Ιούνιος 2026</span>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{ display: 'flex', background: '#12121f', border: '1px solid #242438', borderRadius: 8, overflow: 'hidden' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '9px 0', border: 'none', borderRight: '1px solid #1e1e30', cursor: 'pointer',
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            background: activeTab === t.id ? 'rgba(212,175,66,0.12)' : 'transparent',
            color: activeTab === t.id ? '#d4af42' : '#5a5a70', transition: 'all 0.15s',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: CALCULATOR
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'calculator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Loan type selector */}
          <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 16 }}>
            <SectionTitle title="Τύπος Δανείου"/>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {LOAN_TYPES.map(lt => (
                <button key={lt.id} onClick={() => setLoanType(lt.id as LoanType)} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                  borderRadius: 7, border: `1px solid ${loanType === lt.id ? 'rgba(212,175,66,0.4)' : '#242438'}`,
                  background: loanType === lt.id ? 'rgba(212,175,66,0.1)' : 'transparent',
                  color: loanType === lt.id ? '#d4af42' : '#5a5a70',
                  fontSize: 11, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer',
                }}>
                  {lt.icon}{lt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 16 }}>
              <SectionTitle title="Στοιχεία Δανείου"/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={lbl}>Αξία Ακινήτου (€)</label>
                  <input style={inp} type="number" value={propertyValue}
                    onChange={e => setPropertyValue(Number(e.target.value))}/>
                </div>
                <div>
                  <label style={lbl}>Ποσό Δανείου (€)</label>
                  <input style={inp} type="number" value={loanAmount}
                    onChange={e => setLoanAmount(Number(e.target.value))}/>
                  <p style={{ fontSize: 10, color: ltv > 80 ? '#f87171' : '#34d399', fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
                    LTV: {ltv.toFixed(1)}% {ltv > 80 ? '⚠ Υψηλό' : '✓ OK'}
                  </p>
                </div>
                <div>
                  <label style={lbl}>Διάρκεια (χρόνια)</label>
                  <input style={inp} type="number" min={5} max={35} value={years}
                    onChange={e => setYears(Number(e.target.value))}/>
                </div>
              </div>
            </div>

            <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 16 }}>
              <SectionTitle title="Επιτόκιο"/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={lbl}>Τύπος Επιτοκίου</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['fixed','variable','mixed'] as RateType[]).map(rt => (
                      <button key={rt} onClick={() => setRateType(rt)} style={{
                        flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${rateType === rt ? '#d4af42' : '#242438'}`,
                        background: rateType === rt ? 'rgba(212,175,66,0.1)' : 'transparent',
                        color: rateType === rt ? '#d4af42' : '#5a5a70',
                        fontSize: 10, fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer',
                      }}>
                        {rt === 'fixed' ? 'Σταθερό' : rt === 'variable' ? 'Κυμαινόμενο' : 'Μικτό'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={lbl}>{rateType === 'variable' ? 'Spread (%)' : 'Επιτόκιο (%)'}</label>
                  <input style={inp} type="number" step={0.05} value={rate}
                    onChange={e => setRate(Number(e.target.value))}/>
                  {rateType === 'variable' && (
                    <p style={{ fontSize: 10, color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
                      Euribor 3M ({fmtPct(EURIBOR_3M)}) + {fmtPct(rate)} = <strong>{fmtPct(variableEffective)}</strong>
                    </p>
                  )}
                </div>
                <div>
                  <label style={lbl}>Έκτακτη μηνιαία πληρωμή (€)</label>
                  <input style={inp} type="number" value={extraPayment}
                    onChange={e => setExtraPayment(Number(e.target.value))}/>
                  {monthlyWithExtra && extraPayment > 0 && (
                    <p style={{ fontSize: 10, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>
                      Γλυτώνεις {Math.round((years * 12 - monthlyWithExtra.months) / 12)} χρόνια · {fmtEur(monthlyWithExtra.saved)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            <KPI label="Μηνιαία δόση" value={fmtEur(monthly)} color="#d4af42"/>
            <KPI label="Σύνολο τόκων" value={fmtEur(totalInterest)} color="#f87171"/>
            <KPI label="Συνολική αποπληρωμή" value={fmtEur(totalPayment)} color="#e2e2f0"/>
            <KPI label="LTV" value={`${ltv.toFixed(1)}%`} color={ltv > 80 ? '#f87171' : '#34d399'} sub={`Ίδια κεφάλαια: ${fmtEur(propertyValue - loanAmount)}`}/>
          </div>

          {/* Scenarios comparison */}
          <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <SectionTitle title="Σύγκριση Σεναρίων"/>
              <button onClick={addScenario} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                background: 'rgba(212,175,66,0.1)', border: '1px solid rgba(212,175,66,0.3)',
                borderRadius: 6, cursor: 'pointer', color: '#d4af42', fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                <Plus size={11}/>Προσθήκη σεναρίου
              </button>
            </div>

            {scenarios.length === 0 && (
              <p style={{ fontSize: 11, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace', textAlign: 'center', padding: '12px 0' }}>
                Πρόσθεσε σενάρια για σύγκριση διαφορετικών επιτοκίων/διάρκειων
              </p>
            )}

            {scenarios.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Σενάριο','Ποσό','Επιτόκιο','Χρόνια','Δόση/μήνα','Σύν. τόκοι',''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#4a4a60', textTransform: 'uppercase', borderBottom: '1px solid #1a1a2e' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, i) => {
                      const m = calcMonthly(s.amount, s.rate, s.years)
                      const ti = m * s.years * 12 - s.amount
                      return (
                        <tr key={s.id}>
                          <td style={{ padding: '8px 10px', color: '#e2e2f0' }}>{s.name}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', color: '#d4af42' }}>{fmtEur(s.amount)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', color: '#60a5fa' }}>{fmtPct(s.rate)}</td>
                          <td style={{ padding: '8px 10px', color: '#5a5a70' }}>{s.years}χρ</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', color: '#34d399' }}>{fmtEur(m)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', color: '#f87171' }}>{fmtEur(ti)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <button onClick={() => setScenarios(p => p.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a3a54' }}>
                              <Trash2 size={12}/>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Refinancing calculator */}
          <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 16 }}>
            <button onClick={() => setShowRefinance(r => !r)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              <SectionTitle title="Αξίζει Αναχρηματοδότηση;" subtitle="Υπολόγισε αν συμφέρει να αλλάξεις τράπεζα"/>
              {showRefinance ? <ChevronUp size={14} color="#5a5a70"/> : <ChevronDown size={14} color="#5a5a70"/>}
            </button>

            {showRefinance && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Υπόλοιπο κεφάλαιο (€)</label>
                    <input style={inp} type="number" value={remainingBalance} onChange={e => setRemainingBalance(Number(e.target.value))}/>
                  </div>
                  <div>
                    <label style={lbl}>Χρόνια που μένουν</label>
                    <input style={inp} type="number" value={remainingYears} onChange={e => setRemainingYears(Number(e.target.value))}/>
                  </div>
                  <div>
                    <label style={lbl}>Νέο επιτόκιο (%)</label>
                    <input style={inp} type="number" step={0.05} value={newRate} onChange={e => setNewRate(Number(e.target.value))}/>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  <KPI label="Τρέχουσα δόση" value={fmtEur(currentMonthly)} color="#f87171"/>
                  <KPI label="Νέα δόση" value={fmtEur(newMonthly)} color="#34d399"/>
                  <KPI label="Συνολική εξοικονόμηση" value={fmtEur(Math.max(0, refinanceSavings))} color={refinanceSavings > 0 ? '#d4af42' : '#f87171'} sub={refinanceSavings > 0 ? `${fmtEur(currentMonthly - newMonthly)}/μήνα` : 'Δεν συμφέρει'}/>
                </div>
              </div>
            )}
          </div>

          {/* Amortization table */}
          <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 16 }}>
            <button onClick={() => setShowAmortization(a => !a)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}>
              <SectionTitle title="Πίνακας Αποπληρωμής" subtitle={`${years * 12} δόσεις αναλυτικά`}/>
              {showAmortization ? <ChevronUp size={14} color="#5a5a70"/> : <ChevronDown size={14} color="#5a5a70"/>}
            </button>

            {showAmortization && (
              <div style={{ marginTop: 14, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Μήνας','Δόση','Κεφάλαιο','Τόκος','Υπόλοιπο'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#4a4a60', textTransform: 'uppercase', borderBottom: '1px solid #1a1a2e' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {amortization.slice(0, 24).map(row => (
                      <tr key={row.month} style={{ borderBottom: '1px solid #0e0e1c' }}>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>{row.month}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#d4af42', fontFamily: 'JetBrains Mono, monospace' }}>{fmtEur(row.payment)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#34d399', fontFamily: 'JetBrains Mono, monospace' }}>{fmtEur(row.principal)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{fmtEur(row.interest)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: '#e2e2f0', fontFamily: 'JetBrains Mono, monospace' }}>{fmtEur(row.balance)}</td>
                      </tr>
                    ))}
                    {amortization.length > 24 && (
                      <tr>
                        <td colSpan={5} style={{ padding: '8px 10px', textAlign: 'center', color: '#3a3a54', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
                          ... {amortization.length - 24} ακόμα δόσεις — κατεβάστε σε PDF
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: BANKS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'banks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setFilterGreen(f => !f)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              background: filterGreen ? 'rgba(52,211,153,0.1)' : 'transparent',
              border: `1px solid ${filterGreen ? 'rgba(52,211,153,0.4)' : '#242438'}`,
              borderRadius: 7, cursor: 'pointer', color: filterGreen ? '#34d399' : '#5a5a70',
              fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
            }}>
              <Leaf size={11}/>Πράσινα δάνεια
            </button>
            <p style={{ fontSize: 10, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace' }}>
              Euribor 3M: {fmtPct(EURIBOR_3M)} · Δεδομένα Ιούνιος 2026
            </p>
          </div>

          {BANKS.map(bank => {
            const effectiveMin = rateType === 'variable'
              ? EURIBOR_3M + bank.variable_spread_min - (filterGreen ? bank.green_discount : 0)
              : bank.fixed_min - (filterGreen ? bank.green_discount : 0)
            const effectiveMax = rateType === 'variable'
              ? EURIBOR_3M + bank.variable_spread_max
              : bank.fixed_max
            const myMonthly = calcMonthly(loanAmount, effectiveMin, years)

            return (
              <div key={bank.id} style={{
                background: '#12121f', border: '1px solid #242438',
                borderLeft: `4px solid ${bank.color}`, borderRadius: 10, padding: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 14, color: '#e2e2f0', fontWeight: 600 }}>{bank.name}</p>
                      {bank.note && (
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: `${bank.color}20`, color: bank.color, fontFamily: 'JetBrains Mono, monospace', border: `1px solid ${bank.color}40` }}>
                          {bank.note}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <p style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 2 }}>Επιτόκιο από</p>
                        <p style={{ fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#34d399', fontWeight: 700 }}>{fmtPct(effectiveMin)}</p>
                        <p style={{ fontSize: 10, color: '#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>έως {fmtPct(effectiveMax)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 2 }}>Δόση ({loanAmount/1000}κ€/{years}χρ)</p>
                        <p style={{ fontSize: 18, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42', fontWeight: 700 }}>{fmtEur(myMonthly)}</p>
                        <p style={{ fontSize: 10, color: '#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>ανά μήνα</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', marginBottom: 2 }}>Max χρηματοδότηση</p>
                        <p style={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', color: '#60a5fa', fontWeight: 600 }}>{bank.max_ltv}% LTV</p>
                        <p style={{ fontSize: 10, color: '#5a5a70', fontFamily: 'JetBrains Mono, monospace' }}>έως {(bank.max_amount/1000)}κ€</p>
                      </div>
                    </div>
                  </div>
                  <a href={bank.url} target="_blank" rel="noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                    background: 'transparent', border: '1px solid #242438', borderRadius: 7,
                    color: '#5a5a70', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                    textDecoration: 'none', flexShrink: 0,
                  }}>
                    <ExternalLink size={11}/>Επίσκεψη
                  </a>
                </div>

                {/* Features */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {bank.features.map((f, i) => (
                    <span key={i} style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 5,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e30',
                      color: '#6b6b85', display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <Check size={9} color="#34d399"/>{f}
                    </span>
                  ))}
                  {filterGreen && (
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Leaf size={9}/>Πράσινη έκπτωση -{fmtPct(bank.green_discount)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace' }}>
              ⓘ Τα επιτόκια είναι ενδεικτικά βάσει δημοσίευσης Μαρτίου-Ιουνίου 2026. Η τελική τιμολόγηση εξαρτάται από το προφίλ του δανειολήπτη. Επισκεφθείτε τη σελίδα κάθε τράπεζας για επίσημα στοιχεία.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: STATE PROGRAMS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'programs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STATE_PROGRAMS.map(prog => (
            <div key={prog.id} style={{
              background: '#12121f', border: `1px solid ${prog.color}30`,
              borderLeft: `4px solid ${prog.color}`, borderRadius: 10, padding: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>{prog.icon}</span>
                    <div>
                      <p style={{ fontSize: 15, color: '#e2e2f0', fontWeight: 700 }}>{prog.name}</p>
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: `${prog.color}18`, color: prog.color, fontFamily: 'JetBrains Mono, monospace', border: `1px solid ${prog.color}30` }}>
                        {prog.type}
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: '#9090a8', marginTop: 6 }}>{prog.description}</p>
                </div>
                <a href={prog.url} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                  background: `${prog.color}15`, border: `1px solid ${prog.color}40`, borderRadius: 7,
                  color: prog.color, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                  textDecoration: 'none', flexShrink: 0,
                }}>
                  <ExternalLink size={11}/>Αίτηση
                </a>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <p style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Κριτήρια</p>
                  {prog.criteria.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <Check size={11} color={prog.color}/>
                      <span style={{ fontSize: 11, color: '#9090a8' }}>{c}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Στοιχεία</p>
                  {prog.max_amount && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace' }}>MAX ΠΟΣΟ </span>
                      <span style={{ fontSize: 13, color: prog.color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{fmtEur(prog.max_amount)}</span>
                    </div>
                  )}
                  {prog.max_ltv && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace' }}>MAX LTV </span>
                      <span style={{ fontSize: 13, color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{prog.max_ltv}%</span>
                    </div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace' }}>ΕΠΙΤΟΚΙΟ </span>
                    <span style={{ fontSize: 11, color: '#e2e2f0' }}>{prog.rate_info}</span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace' }}>DEADLINE </span>
                    <span style={{ fontSize: 11, color: '#f87171', fontFamily: 'JetBrains Mono, monospace' }}>{prog.deadline}</span>
                  </div>
                </div>
              </div>

              {prog.extra && (
                <div style={{ marginTop: 12, background: `${prog.color}08`, border: `1px solid ${prog.color}20`, borderRadius: 7, padding: '8px 12px' }}>
                  <p style={{ fontSize: 11, color: prog.color }}>⭐ {prog.extra}</p>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 9, color: '#4a4a60', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Διαθέσιμο σε</p>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {prog.banks.map(b => (
                    <span key={b} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid #1e1e30', color: '#6b6b85' }}>{b}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: ALTERNATIVE FINANCING
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alternative' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 4 }}>
            <p style={{ fontSize: 11, color: '#a78bfa', fontFamily: 'JetBrains Mono, monospace' }}>
              💡 Εναλλακτικοί τρόποι χρηματοδότησης ακινήτου — δεν αντικαθιστούν νομική ή οικονομική συμβουλή. Συμβουλευτείτε ειδικό.
            </p>
          </div>

          {ALTERNATIVE_FINANCING.map(alt => (
            <div key={alt.id} style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 24 }}>{alt.icon}</span>
                <div>
                  <p style={{ fontSize: 14, color: '#e2e2f0', fontWeight: 600 }}>{alt.title}</p>
                  <p style={{ fontSize: 11, color: '#6b6b85', marginTop: 2 }}>{alt.desc}</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 9, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Πλεονεκτήματα</p>
                  {alt.pros.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Check size={10} color="#34d399"/>
                      <span style={{ fontSize: 11, color: '#9090a8' }}>{p}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize: 9, color: '#f87171', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Μειονεκτήματα</p>
                  {alt.cons.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <AlertTriangle size={10} color="#f87171"/>
                      <span style={{ fontSize: 11, color: '#9090a8' }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Bank costs reference */}
          <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 18 }}>
            <SectionTitle title="Τυπικά Έξοδα Δανείου" subtitle="Εκτός δόσεων — υπολόγισέ τα στον προϋπολογισμό σου"/>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
              {[
                { label: 'Συμβολαιογραφικά', value: '1-2% αξίας', note: 'Αγοραπωλησία + υποθήκη' },
                { label: 'Φόρος μεταβίβασης', value: '3% αντικειμενικής', note: 'Παλαιά ακίνητα' },
                { label: 'Εγγραφή υποθήκης', value: '~0.5% δανείου', note: 'Υποθηκοφυλακείο' },
                { label: 'Τεχνικός έλεγχος', value: '300-750€', note: 'Μηχανικός τράπεζας' },
                { label: 'Νομικός έλεγχος', value: '300-500€', note: 'Δικηγόρος τράπεζας' },
                { label: 'Ασφάλεια κατοικίας', value: '100-300€/έτος', note: 'Υποχρεωτική' },
                { label: 'Ασφάλεια ζωής', value: '0.1-0.3%/έτος', note: 'Συχνά υποχρεωτική' },
                { label: 'Σύνολο εξόδων', value: '~3-5% αξίας', note: 'Εκτός δόσεων', highlight: true },
              ].map(item => (
                <div key={item.label} style={{
                  padding: '10px 12px', borderRadius: 7,
                  background: item.highlight ? 'rgba(212,175,66,0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${item.highlight ? 'rgba(212,175,66,0.2)' : '#1e1e30'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <p style={{ fontSize: 12, color: item.highlight ? '#d4af42' : '#e2e2f0', fontWeight: item.highlight ? 600 : 400 }}>{item.label}</p>
                    <p style={{ fontSize: 10, color: '#5a5a70' }}>{item.note}</p>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: item.highlight ? '#d4af42' : '#60a5fa', fontWeight: item.highlight ? 700 : 400 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}