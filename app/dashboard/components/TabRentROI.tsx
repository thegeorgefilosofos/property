'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMarketRates } from '@/app/hooks/useMarketData';
import { CustomSelect, NumberInput, TextInput, DatePicker, Textarea, Toggle } from './UIComponents';
import RentComparables from './RentComparables';
import RentROIReport from './RentROIReport';
import { T, fe } from '@/components/Theme';
import { rentalIncomeTax } from '@/lib/billing/greekTax';

interface Props {
  propertyId: string;
  userId: string;
  propertyValue?: number;
  ownershipPct?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Κατοικία / Διαμέρισμα' },
  { value: 'house', label: 'Μονοκατοικία / Βίλα' },
  { value: 'commercial', label: 'Επαγγελματικός Χώρος' },
  { value: 'parking', label: 'Parking / Γκαράζ' },
  { value: 'storage', label: 'Αποθήκη' },
  { value: 'land', label: 'Αγροτεμάχιο / Οικόπεδο' },
  { value: 'industrial', label: 'Βιομηχανικό / Εργοστάσιο' },
  { value: 'airbnb', label: 'Airbnb / Βραχυχρόνια Μίσθωση' },
  { value: 'mixed', label: 'Μεικτή Χρήση' },
];

// ─── Construction year helpers ────────────────────────────────────────────────
// Property types that have no construction age (land, parking, storage)
const NO_AGE_TYPES = ['land', 'parking', 'storage'];

function yearToConstructionType(year: number): string {
  if (year < 1940) return 'pre1960';
  if (year < 1960) return 'pre1960';
  if (year < 1980) return '60s70s';
  if (year < 1990) return '80s';
  if (year < 2000) return '90s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return 'modern';
}

function yearToBadge(year: number): { label: string; color: string } {
  if (year < 1940) return { label: 'Προπολεμικό', color: 'var(--text-tertiary)' };
  if (year < 1960) return { label: 'Παλαιό', color: 'var(--text-tertiary)' };
  if (year < 1970) return { label: "Δεκαετία '60", color: 'var(--warning)' };
  if (year < 1980) return { label: "Δεκαετία '70", color: 'var(--warning)' };
  if (year < 1990) return { label: "Δεκαετία '80", color: 'var(--info)' };
  if (year < 2000) return { label: "Δεκαετία '90", color: 'var(--info)' };
  if (year < 2010) return { label: "Δεκαετία '00", color: 'var(--positive)' };
  if (year < 2020) return { label: "Δεκαετία '10", color: 'var(--positive)' };
  return { label: 'Νεόδμητο', color: 'var(--accent)' };
}

function yearToLabel(year: number): string {
  return `${year}, ${yearToBadge(year).label}`;
}


const LOAN_TYPES = [
  { value: 'mortgage', label: 'Στεγαστικό Δάνειο' },
  { value: 'spiti_mou', label: 'Σπίτι Μου ΙΙ (50% άτοκο)' },
  { value: 'investment', label: 'Επενδυτικό Δάνειο' },
  { value: 'renovation', label: 'Δάνειο Ανακαίνισης' },
  { value: 'green', label: 'Πράσινο Δάνειο (Φωτοβολταϊκά / Αντλία Θερμότητας)' },
  { value: 'bridge', label: 'Bridge Loan' },
  { value: 'promissory', label: 'Γραμμάτια' },
  { value: 'other', label: 'Άλλο' },
];

const COMPANY_HQ = [
  { value: 'none', label: 'Φυσικό Πρόσωπο' },
  { value: 'greece', label: 'Εταιρεία, Ελλάδα' },
  { value: 'eu', label: 'Εταιρεία, Ευρωπαϊκή Ένωση (για παράδειγμα Κύπρος, Βουλγαρία)' },
  { value: 'uk', label: 'Εταιρεία, Ηνωμένο Βασίλειο' },
  { value: 'uae', label: 'Εταιρεία, Ηνωμένα Αραβικά Εμιράτα' },
  { value: 'usa', label: 'Εταιρεία, Ηνωμένες Πολιτείες Αμερικής' },
  { value: 'israel', label: 'Εταιρεία, Ισραήλ' },
  { value: 'asia', label: 'Εταιρεία, Ασία (Σιγκαπούρη / Χονγκ Κονγκ)' },
];

const FLOORS = Array.from({ length: 15 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? 'Ισόγειο' : i === 1 ? '1ος Όροφος' : i === 2 ? '2ος Όροφος' : i === 3 ? '3ος Όροφος' : `${i}ος Όροφος`,
}));

const DURATION_UNITS = [
  { value: 'days', label: 'Μέρες' },
  { value: 'months', label: 'Μήνες' },
  { value: 'years', label: 'Χρόνια' },
];

const GREEK_MARKETS = [
  { value: 'Κεντρικός Τομέας Αθηνών', label: 'Αττική, Κεντρικός Τομέας Αθηνών' },
  { value: 'Βόρειος Τομέας Αθηνών', label: 'Αττική, Βόρειος Τομέας Αθηνών (Μαρούσι, Κηφισιά)' },
  { value: 'Νότιος Τομέας Αθηνών', label: 'Αττική, Νότιος Τομέας Αθηνών (Γλυφάδα, Βούλα)' },
  { value: 'Δυτικός Τομέας Αθηνών', label: 'Αττική, Δυτικός Τομέας Αθηνών (Περιστέρι)' },
  { value: 'Πειραιάς', label: 'Αττική, Πειραιάς και Νήσοι' },
  { value: 'Ανατολική Αττική', label: 'Αττική, Ανατολική Αττική (Παλλήνη, Ραφήνα)' },
  { value: 'Δυτική Αττική', label: 'Αττική, Δυτική Αττική (Ελευσίνα)' },
  { value: 'Θεσσαλονίκη', label: 'Κεντρική Μακεδονία, Θεσσαλονίκη' },
  { value: 'Καλαμαριά', label: 'Κεντρική Μακεδονία, Καλαμαριά / Πυλαία' },
  { value: 'Χαλκιδική', label: 'Κεντρική Μακεδονία, Χαλκιδική' },
  { value: 'Ιωάννινα', label: 'Ήπειρος, Ιωάννινα' },
  { value: 'Λάρισα', label: 'Θεσσαλία, Λάρισα' },
  { value: 'Μαγνησία', label: 'Θεσσαλία, Μαγνησία (Βόλος)' },
  { value: 'Αχαΐα', label: 'Δυτική Ελλάδα, Αχαΐα (Πάτρα)' },
  { value: 'Εύβοια', label: 'Στερεά Ελλάδα, Εύβοια (Χαλκίδα)' },
  { value: 'Κορινθία', label: 'Πελοπόννησος, Κορινθία' },
  { value: 'Μεσσηνία', label: 'Πελοπόννησος, Μεσσηνία (Καλαμάτα)' },
  { value: 'Κέρκυρα', label: 'Ιόνια Νησιά, Κέρκυρα' },
  { value: 'Μύκονος', label: 'Νότιο Αιγαίο, Μύκονος' },
  { value: 'Σαντορίνη', label: 'Νότιο Αιγαίο, Σαντορίνη (Θήρα)' },
  { value: 'Ρόδος', label: 'Νότιο Αιγαίο, Ρόδος' },
  { value: 'Κως', label: 'Νότιο Αιγαίο, Κως' },
  { value: 'Πάρος', label: 'Νότιο Αιγαίο, Πάρος' },
  { value: 'Ηράκλειο', label: 'Κρήτη, Ηράκλειο' },
  { value: 'Χανιά', label: 'Κρήτη, Χανιά' },
  { value: 'Ρέθυμνο', label: 'Κρήτη, Ρέθυμνο' },
];

// ─── Tax ──────────────────────────────────────────────────────────────────────
interface RentTaxResult {
  taxable: number;
  tax: number;
  reduction: number;
  effectiveRate: number;
  electronicSaving: number;
}
function calcRentTax(gross: number, electronic: boolean, ownerAge: number, children: number): RentTaxResult {
  const reduction = electronic ? gross * 0.05 : 0;
  const taxable = gross - reduction;
  let tax = 0;
  if (ownerAge <= 25) { if (taxable <= 20000) tax = 0; else tax = calcBaseTax(taxable - 20000); }
  else if (ownerAge <= 30) { if (taxable <= 10000) tax = taxable * 0.09; else tax = 10000 * 0.09 + calcBaseTax(taxable - 10000); }
  else tax = calcBaseTax(taxable);
  const effectiveRate = gross > 0 ? (tax / gross) * 100 : 0;
  const electronicSaving = electronic ? calcRentTax(gross, false, ownerAge, children).tax - tax : 0;
  return { taxable, tax, reduction, effectiveRate, electronicSaving };
}
// Κλίμακα ενοικίων 2026 (κοινή πηγή: lib/billing/greekTax).
const calcBaseTax = (t: number): number => rentalIncomeTax(t);
function toMonths(val: string, unit: string): number {
  const n = parseFloat(val) || 0;
  if (unit === 'days') return n / 30;
  if (unit === 'years') return n * 12;
  return n;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fp = (n: number, d = 2) => `${n.toFixed(d)}%`;

// ─── Shared styles ────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: T.radius.card,
  padding: 20,
  marginBottom: 16,
  minWidth: 0,
};

const innerStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: T.radius.inner,
  padding: 14,
  minWidth: 0,
  overflow: 'hidden',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 500,
  fontFamily: "'Inter', sans-serif",
  display: 'block',
  marginBottom: 6,
};

const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 12 };
const g3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 12 };
const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 12 };

// ─── SectionLabel ─────────────────────────────────────────────────────────────
const SectionLabel = ({ label, right }: { label: string; right?: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>
        {label}
      </span>
    </div>
    {right}
  </div>
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color = 'var(--text-primary)', badge, size = 'md' }: {
  label: string; value: string; sub?: string; color?: string;
  badge?: { text: string; color: string }; size?: 'sm' | 'md' | 'lg';
}) {
  const fs = size === 'lg' ? 22 : size === 'md' ? 18 : 14;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ fontSize: fs, fontWeight: 700, color, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{value}</div>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 700, color: badge.color, background: `${badge.color}18`, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
            {badge.text}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Inter', sans-serif", lineHeight: 1.4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: "'Inter', sans-serif" }}>{sub}</div>}
    </div>
  );
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, color = 'var(--text-primary)', bold = false }: {
  label: string; value: string; color?: string; bold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: bold ? 14 : 12, fontWeight: bold ? 700 : 500, color, fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ─── Info Banner ──────────────────────────────────────────────────────────────
function InfoBanner({ type = 'info', children }: { type?: 'info' | 'warning' | 'success' | 'danger'; children: React.ReactNode }) {
  const colors = {
    info: 'var(--info)',
    warning: 'var(--warning)',
    success: 'var(--positive)',
    danger: 'var(--negative)',
  };
  const c = colors[type];
  return (
    <div style={{ background: 'var(--bg-surface)', border: `1px solid var(--border-subtle)`, borderLeft: `3px solid ${c}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
      {children}
    </div>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, max = 100, color }: { label: string; score: number; max?: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{score.toFixed(0)}/{max}</span>
      </div>
      <div style={{ height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min((score / max) * 100, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

// ─── Gauge SVG ────────────────────────────────────────────────────────────────
function Gauge({ value, max = 15, label, color = 'var(--accent)' }: { value: number; max?: number; label: string; color?: string }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const angle = pct * 180 - 90;
  const r = 44, cx = 56, cy = 56;
  const toRad = (a: number) => (a * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(-90)), sy = cy + r * Math.sin(toRad(-90));
  const ex = cx + r * Math.cos(toRad(90)), ey = cy + r * Math.sin(toRad(90));
  const ax = cx + r * Math.cos(toRad(angle)), ay = cy + r * Math.sin(toRad(angle));
  const la = pct > 0.5 ? 1 : 0;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="112" height="66" viewBox="0 0 112 66">
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="var(--border-subtle)" strokeWidth="8" strokeLinecap="round" />
        {value > 0 && (
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${la} 1 ${ax} ${ay}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" style={{ transition: 'all 0.6s ease' }} />
        )}
        <circle cx={ax} cy={ay} r="4" fill={color} />
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-primary)" fontFamily="'Roboto Mono', monospace" style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(1)}%</text>
      </svg>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Inter', sans-serif", marginTop: -2, maxWidth: 100, margin: '0 auto' }}>{label}</div>
    </div>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
const TAB_DEFS = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'tax', label: 'Φορολογία' },
  { id: 'airbnb', label: 'Airbnb' },
  { id: 'loan', label: 'Δάνειο' },
  { id: 'scenario', label: 'Σενάρια' },
] as const;

type TabId = typeof TAB_DEFS[number]['id'];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TabRentROI({ propertyId, userId, propertyValue = 0, ownershipPct = 100 }: Props) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [propType, setPropType] = useState('apartment');
  const [constructionYear, setConstructionYear] = useState('1985');
  const [floor, setFloor] = useState('2');
  const [companyHq, setCompanyHq] = useState('none');
  const [electronic, setElectronic] = useState(true);
  const [ownerAge, setOwnerAge] = useState('35');
  const [children, setChildren] = useState('0');
  const [expenses, setExpenses] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState('');

  const [cfg, setCfg] = useState({
    target_rent: '', actual_rent: '', tenant_name: '',
    lease_start: '', lease_end: '', deposit: '',
    management_fee_pct: '', insurance_annual: '', maintenance_reserve: '',
    enfia_annual: '', is_insured: false, insurance_covers_disasters: false,
    commercial_value: '', objective_value: '',
  });
  const sc = (k: string, v: any) => setCfg(f => ({ ...f, [k]: v }));

  const [loan, setLoan] = useState({
    bank_name: '', loan_type: 'mortgage', original_amount: '', remaining_balance: '',
    interest_rate: '', monthly_payment: '', start_date: '', end_date: '',
    loan_term_months: '', paid_months: '', is_fixed_rate: true, notes: '',
    notary_cost: '', agent_fee_pct: '2', transfer_tax_pct: '3',
    renovation_loan: '', renovation_loan_rate: '', renovation_loan_months: '',
    green_loan: '', green_loan_desc: '',
    early_repayment: '',
  });
  const [loanId, setLoanId] = useState<string | null>(null);
  const sl = (k: string, v: any) => setLoan(f => ({ ...f, [k]: v }));

  const [airbnb, setAirbnb] = useState({
    adr_low: '', adr_mid: '', adr_high: '',
    occ_low: '55', occ_mid: '70', occ_high: '85',
    dur_low: '4', dur_mid: '5', dur_high: '3',
    unit_low: 'months', unit_mid: 'months', unit_high: 'months',
    platform_fee: '15', cleaning_cost: '50', cleaning_per_nights: '3',
    netflix: '0', spotify: '0', bike_count: '0', bike_cost: '200',
    welcome_basket: '20', welcome_per_booking: 'true',
    pool_maintenance: '', garden_maintenance: '', balcony_plants: '',
    extra_services: '', damage_reserve: '200',
  });
  const sa = (k: string, v: any) => setAirbnb(f => ({ ...f, [k]: v }));

  const [bench, setBench] = useState({
    etf_return: '7', euribor: '2.2', market_gross: '5', target_net: '3',
    market_label: 'Κεντρικός Τομέας Αθηνών',
  });
  const sb = (k: string, v: string) => setBench(f => ({ ...f, [k]: v }));

  // Ζωντανό Euribor 3μήνου (ΤτΕ/ECB): γεμίζει το benchmark ώστε η «Υπεραπόδοση vs
  // EURIBOR» να μη συγκρίνεται με ξεπερασμένο επιτόκιο. Δεν πατάει χειροκίνητη αλλαγή.
  const market = useMarketRates();
  const euriborTouched = useRef(false);
  useEffect(() => {
    if (!market.isLoading && !euriborTouched.current && market.euribor_3m > 0) {
      setBench(f => ({ ...f, euribor: market.euribor_3m.toFixed(2) }));
    }
  }, [market.isLoading, market.euribor_3m]);

  const [sc2, setSc2] = useState({
    rent_change: '10', vacancy_months: '1', value_growth: '3', years: '10',
    inflation: '3', expense_growth: '2', sell_agent_pct: '2', sell_tax_pct: '3',
    reserve_pct: '5', building_depreciation_yrs: '40', equipment_depreciation_yrs: '5',
    auction_discount: '25', penalty_months: '2',
    mc_runs: '500', mc_rent_std: '15', mc_value_std: '20',
  });
  const ss = (k: string, v: string) => setSc2(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const [{ data: rc }, { data: exp }, { data: ln }] = await Promise.all([
      supabase.from('rent_config').select('*').eq('property_id', propertyId).single(),
      supabase.from('expenses').select('amount').eq('property_id', propertyId),
      supabase.from('loans').select('*').eq('property_id', propertyId).single(),
    ]);
    if (rc) setCfg(p => ({
      ...p,
      target_rent: String(rc.target_rent || ''), actual_rent: String(rc.actual_rent || ''),
      tenant_name: rc.tenant_name || '', lease_start: rc.lease_start || '',
      lease_end: rc.lease_end || '', deposit: String(rc.deposit || ''),
      management_fee_pct: String(rc.management_fee_pct || ''),
      insurance_annual: String(rc.insurance || ''), maintenance_reserve: String(rc.maintenance_reserve || ''),
    }));
    if (exp) setExpenses((exp || []).reduce((s: number, e: any) => s + e.amount, 0));
    if (ln) {
      setLoanId(ln.id);
      setLoan(p => ({
        ...p,
        bank_name: ln.bank_name || '', loan_type: ln.loan_type || 'mortgage',
        original_amount: String(ln.original_amount || ''), remaining_balance: String(ln.remaining_balance || ''),
        interest_rate: String(ln.interest_rate || ''), monthly_payment: String(ln.monthly_payment || ''),
        start_date: ln.start_date || '', end_date: ln.end_date || '',
        loan_term_months: String(ln.loan_term_months || ''), paid_months: String(ln.paid_months || ''),
        is_fixed_rate: ln.is_fixed_rate ?? true, notes: ln.notes || '',
      }));
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    const n = (v: string) => parseFloat(v) || null;
    await supabase.from('rent_config').upsert({
      property_id: propertyId, user_id: userId,
      target_rent: n(cfg.target_rent), actual_rent: n(cfg.actual_rent),
      tenant_name: cfg.tenant_name || null, lease_start: cfg.lease_start || null,
      lease_end: cfg.lease_end || null, deposit: n(cfg.deposit),
      management_fee_pct: n(cfg.management_fee_pct),
      insurance: n(cfg.insurance_annual), maintenance_reserve: n(cfg.maintenance_reserve),
    }, { onConflict: 'property_id' });
    setSaving(false); setSavedOk('config'); setTimeout(() => setSavedOk(''), 2500);
  };

  const saveLoan = async () => {
    const n = (v: string) => parseFloat(v) || null;
    const ni = (v: string) => parseInt(v) || null;
    const payload = {
      property_id: propertyId, user_id: userId,
      bank_name: loan.bank_name || null, loan_type: loan.loan_type,
      original_amount: n(loan.original_amount), remaining_balance: n(loan.remaining_balance),
      interest_rate: n(loan.interest_rate), monthly_payment: n(loan.monthly_payment),
      start_date: loan.start_date || null, end_date: loan.end_date || null,
      loan_term_months: ni(loan.loan_term_months), paid_months: ni(loan.paid_months),
      is_fixed_rate: loan.is_fixed_rate, notes: loan.notes || null,
    };
    if (loanId) await supabase.from('loans').update(payload).eq('id', loanId);
    else { const { data } = await supabase.from('loans').insert(payload).select().single(); if (data) setLoanId(data.id); }
    setSavedOk('loan'); setTimeout(() => setSavedOk(''), 2500);
  };

  // ── Derived construction type from year ───────────────────────────────────
  const constructionYear_n = parseInt(constructionYear) || 1985;
  const constructionType = yearToConstructionType(constructionYear_n);

  // ── Core calculation ───────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const ar = parseFloat(cfg.actual_rent) || 0;
    const tr = parseFloat(cfg.target_rent) || 0;
    const dep = parseFloat(cfg.deposit) || 0;
    const mgmt = (parseFloat(cfg.management_fee_pct) || 0) / 100 * ar * 12;
    const ins = parseFloat(cfg.insurance_annual) || 0;
    const maint = parseFloat(cfg.maintenance_reserve) || 0;
    const enfia = parseFloat(cfg.enfia_annual) || 0;
    const annual = ar * 12;
    const enfiaRed = cfg.is_insured && cfg.insurance_covers_disasters
      ? (parseFloat(cfg.objective_value) || 0) <= 500000 ? enfia * 0.20 : enfia * 0.10 : 0;
    const enfiaFinal = enfia - enfiaRed;
    const totalExp = expenses + mgmt + ins + maint + enfiaFinal;
    const age = parseInt(ownerAge) || 35;
    const { taxable, tax, reduction, effectiveRate, electronicSaving } = calcRentTax(annual, electronic, age, parseInt(children) || 0);
    const netIncome = annual - totalExp;
    const afterTax = netIncome - tax;
    const myVal = propertyValue * (ownershipPct / 100);
    const commVal = parseFloat(cfg.commercial_value) || myVal;
    const objVal = parseFloat(cfg.objective_value) || myVal;
    const grossYield = myVal > 0 ? (annual / myVal) * 100 : 0;
    const netYield = myVal > 0 ? (afterTax / myVal) * 100 : 0;
    const capRate = myVal > 0 ? (netIncome / myVal) * 100 : 0;
    const payback = afterTax > 0 ? myVal / afterTax : 0;
    const breakeven = myVal > 0 ? (totalExp + tax) / 12 : 0;
    const occRate = ar > 0 && tr > 0 ? (ar / tr) * 100 : 100;
    const gap = tr - ar;
    const today = new Date();
    const leaseEnd = cfg.lease_end ? new Date(cfg.lease_end) : null;
    const days = leaseEnd ? Math.ceil((leaseEnd.getTime() - today.getTime()) / 86400000) : null;
    const leaseStatus = !leaseEnd ? 'unknown' : days! < 0 ? 'expired' : days! < 60 ? 'critical' : days! < 180 ? 'warning' : 'ok';
    const loanBal = parseFloat(loan.remaining_balance) || 0;
    const loanRate = parseFloat(loan.interest_rate) || 0;
    const loanPmt = parseFloat(loan.monthly_payment) || 0;
    const annualDebt = loanPmt * 12;
    const DSCR = annualDebt > 0 ? netIncome / annualDebt : 0;
    const LTV = myVal > 0 && loanBal > 0 ? (loanBal / myVal) * 100 : 0;
    const equity = myVal - loanBal;
    const ic = loanBal > 0 && loanRate > 0 ? netIncome / (loanBal * loanRate / 100) : 0;
    const cfDebt = afterTax - annualDebt;
    const earlyAmt = parseFloat(loan.early_repayment) || 0;
    const pmts = parseInt(loan.loan_term_months) || 0;
    const paid = parseInt(loan.paid_months) || 0;
    const rem = pmts - paid;
    const mr = loanRate / 100 / 12;
    const interestSaved = mr > 0 && rem > 0 ? earlyAmt * mr * rem / (1 + mr) : 0;
    const depB = myVal * 0.85 / (parseFloat(sc2.building_depreciation_yrs) || 40);
    const depE = myVal * 0.05 / (parseFloat(sc2.equipment_depreciation_yrs) || 5);
    const agentFee = (parseFloat(loan.agent_fee_pct) || 2) / 100 * myVal;
    const transTax = (parseFloat(loan.transfer_tax_pct) || 3) / 100 * myVal;
    const notary = parseFloat(loan.notary_cost) || myVal * 0.015;
    const totalAcq = myVal + agentFee + transTax + notary;
    const trueYield = totalAcq > 0 ? (annual / totalAcq) * 100 : 0;
    const ctRates: { [k: string]: number } = { none: effectiveRate, greece: 22, eu: 10, uk: 25, uae: 9, usa: 21, israel: 23, asia: 17 };
    const compRate = ctRates[companyHq] || effectiveRate;
    const compTax = netIncome * compRate / 100;
    const afterTaxComp = netIncome - compTax;
    const peakMap: { [k: string]: number } = { pre1960: 50, '60s70s': 40, '80s': 30, '90s': 25, '2000s': 20, '2010s': 15, modern: 30 };
    const peakY = peakMap[constructionType] || 30;
    const floorBonus = parseInt(floor) * 0.5;
    const yieldScore = Math.min(grossYield / 10 * 40, 40);
    const locationScore = leaseStatus === 'ok' ? 20 : leaseStatus === 'warning' ? 12 : 5;
    const finScore = afterTax > 0 ? 20 : 0;
    const ltvScore = LTV > 0 ? Math.max(0, 20 - LTV / 5) : 20;
    const totalScore = Math.round(yieldScore + locationScore + finScore + ltvScore);
    const scoreColor = totalScore >= 70 ? 'var(--positive)' : totalScore >= 50 ? 'var(--warning)' : 'var(--negative)';
    const scoreLabel = totalScore >= 70 ? 'Άριστο' : totalScore >= 50 ? 'Καλό' : totalScore >= 30 ? 'Μέτριο' : 'Χαμηλό';
    return {
      ar, tr, annual, dep, totalExp, taxable, tax, reduction, effectiveRate, electronicSaving,
      netIncome, afterTax, myVal, commVal, objVal, grossYield, netYield, capRate, payback, breakeven,
      occRate, gap, days, leaseStatus, loanBal, loanPmt, annualDebt, DSCR, LTV, equity, ic, cfDebt,
      interestSaved, depB, depE, agentFee, transTax, notary, totalAcq, trueYield,
      compRate, compTax, afterTaxComp, peakY, floorBonus, enfiaFinal, enfiaRed, mgmt, ins, maint,
      totalScore, scoreColor, scoreLabel, yieldScore, locationScore, finScore, ltvScore,
    };
  }, [cfg, expenses, electronic, propertyValue, ownershipPct, loan, constructionYear, floor, companyHq, ownerAge, children, sc2]);

  // ── Airbnb calculation ─────────────────────────────────────────────────────
  const abb = useMemo(() => {
    const seasons = [
      { adr: parseFloat(airbnb.adr_low) || 0, occ: parseFloat(airbnb.occ_low) / 100, months: toMonths(airbnb.dur_low, airbnb.unit_low) },
      { adr: parseFloat(airbnb.adr_mid) || 0, occ: parseFloat(airbnb.occ_mid) / 100, months: toMonths(airbnb.dur_mid, airbnb.unit_mid) },
      { adr: parseFloat(airbnb.adr_high) || 0, occ: parseFloat(airbnb.occ_high) / 100, months: toMonths(airbnb.dur_high, airbnb.unit_high) },
    ];
    const pfee = parseFloat(airbnb.platform_fee) / 100;
    let rev = 0, nights = 0;
    seasons.forEach(s => { const d = s.months * 30; const o = d * s.occ; rev += o * s.adr; nights += o; });
    const pCost = rev * pfee;
    const cleanings = Math.ceil(nights / Math.max(parseFloat(airbnb.cleaning_per_nights) || 3, 1));
    const cCost = cleanings * (parseFloat(airbnb.cleaning_cost) || 0);
    const bikes = parseInt(airbnb.bike_count) || 0;
    const bikeDepr = bikes > 0 ? bikes * (parseFloat(airbnb.bike_cost) || 200) / 3 : 0;
    const bookings = Math.ceil(nights / 3);
    const basket = airbnb.welcome_per_booking === 'true'
      ? bookings * (parseFloat(airbnb.welcome_basket) || 0)
      : (parseFloat(airbnb.welcome_basket) || 0) * 12;
    const extras = (parseFloat(airbnb.netflix) || 0) + (parseFloat(airbnb.spotify) || 0) + bikeDepr + basket
      + (parseFloat(airbnb.pool_maintenance) || 0) + (parseFloat(airbnb.garden_maintenance) || 0)
      + (parseFloat(airbnb.balcony_plants) || 0) + (parseFloat(airbnb.damage_reserve) || 200)
      + (parseFloat(airbnb.extra_services) || 0);
    const net = rev - pCost - cCost - expenses - extras;
    const avgOcc = nights / (12 * 30) * 100;
    const revPAR = rev / 365;
    const adr = nights > 0 ? rev / nights : 0;
    return { rev, nights, pCost, cCost, net, avgOcc, revPAR, adr, extras, bookings, diff: net - calc.afterTax };
  }, [airbnb, expenses, calc.afterTax]);

  // ── Scenario calculation ───────────────────────────────────────────────────
  const scen = useMemo(() => {
    const rc = parseFloat(sc2.rent_change) || 0;
    const vm = parseFloat(sc2.vacancy_months) || 0;
    const vg = parseFloat(sc2.value_growth) || 0;
    const yrs = parseFloat(sc2.years) || 10;
    const eg = parseFloat(sc2.expense_growth) || 2;
    const sa2 = (parseFloat(sc2.sell_agent_pct) || 2) / 100;
    const st = (parseFloat(sc2.sell_tax_pct) || 3) / 100;
    const newRent = calc.ar * (1 + rc / 100);
    const newAnnual = newRent * (12 - vm);
    const { tax: nt } = calcRentTax(newAnnual, electronic, parseInt(ownerAge) || 35, parseInt(children) || 0);
    const newExp = calc.totalExp * Math.pow(1 + eg / 100, yrs);
    const newNet = newAnnual - newExp - nt;
    const futVal = calc.myVal * Math.pow(1 + vg / 100, yrs);
    const rentTotal = newNet * yrs;
    const capGain = futVal - calc.myVal;
    const total = rentTotal + capGain;
    const sellNow = calc.myVal * (1 - sa2 - st);
    const sellFuture = futVal * (1 - sa2 - st);
    const cagr = calc.myVal > 0 ? (Math.pow(futVal / calc.myVal, 1 / yrs) - 1) * 100 : 0;
    const irr = calc.myVal > 0 ? ((total / calc.myVal) / yrs) * 100 : 0;
    const runs = Math.min(parseInt(sc2.mc_runs) || 500, 1000);
    const rentStd = (parseFloat(sc2.mc_rent_std) || 15) / 100;
    const valStd = (parseFloat(sc2.mc_value_std) || 20) / 100;
    // Δειγματοληψία από κανονική κατανομή (Box–Muller): τα P10/P50/P90 αποκτούν
    // στατιστικό νόημα (η προηγούμενη ομοιόμορφη έδινε λανθασμένες «ουρές» ρίσκου).
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mcResults: number[] = [];
    for (let i = 0; i < runs; i++) {
      const rVar = 1 + (rc / 100) + gauss() * rentStd;
      const vVar = vg / 100 + gauss() * valStd;
      const mRent = calc.ar * rVar;
      const mAnnual = mRent * (12 - vm);
      const { tax: mt } = calcRentTax(mAnnual, electronic, parseInt(ownerAge) || 35, parseInt(children) || 0);
      const mNet = (mAnnual - newExp - mt) * yrs;
      const mVal = calc.myVal * Math.pow(1 + vVar, yrs);
      mcResults.push(mNet + (mVal - calc.myVal));
    }
    mcResults.sort((a, b) => a - b);
    const mcP10 = mcResults[Math.floor(runs * 0.1)] || 0;
    const mcP50 = mcResults[Math.floor(runs * 0.5)] || 0;
    const mcP90 = mcResults[Math.floor(runs * 0.9)] || 0;
    const mcPositive = mcResults.filter(r => r > 0).length / runs * 100;
    const peakMap: { [k: string]: string } = {
      pre1960: 'Ιδανικό για πώληση τώρα, παλαιό κτήριο σε plateau, αξία καθορίζεται από οικόπεδο',
      '60s70s': 'Αξία σε plateau, πουλήστε αν η τοποθεσία είναι prime, αλλιώς μετά από ανακαίνιση',
      '80s': 'Ανακαίνιση αυξάνει αξία 15-25%. Ιδανικό timing: 2-3 χρόνια μετά ανακαίνιση',
      '90s': 'Ακόμα σε άνοδο. Κρατήστε 5-7 χρόνια ή ανακαινίστε και πουλήστε',
      '2000s': 'Καλό timing. Αξία σε σταθερή άνοδο για 10+ χρόνια ακόμα',
      '2010s': 'Νέο, κρατήστε 15-20 χρόνια για μέγιστη απόδοση',
      modern: 'Νεόδμητο, κρατήστε 20-30 χρόνια. Πώληση τώρα δεν συμφέρει',
    };
    return { newRent, newAnnual, newNet, futVal, rentTotal, capGain, total, sellNow, sellFuture, cagr, irr, mcP10, mcP50, mcP90, mcPositive, peakAdvice: peakMap[constructionType] || 'Αναλύστε τοπική αγορά' };
  }, [sc2, calc, electronic, ownerAge, children, constructionYear]);

  const leaseColor = { ok: 'var(--positive)', warning: 'var(--warning)', critical: 'var(--negative)', expired: 'var(--negative)', unknown: 'var(--text-tertiary)' }[calc.leaseStatus];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10, width: '100%', minWidth: 0 }}>
        <RentROIReport
          propertyName="Ακίνητό μου" propertyAddress="" propertyType={propType}
          calc={calc} scen={scen} bench={bench} ownerAge={ownerAge}
          constructionType={constructionType} floor={floor} electronic={electronic}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end', minWidth: 0, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px', maxWidth: 220, minWidth: 0 }}>
            <CustomSelect label="" value={propType} onChange={setPropType} options={PROPERTY_TYPES} />
          </div>
          {/* Έτος κατασκευής, κρύβεται για γη/parking/storage */}
          {!NO_AGE_TYPES.includes(propType) && (
            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                value={constructionYear}
                onChange={e => setConstructionYear(e.target.value)}
                placeholder="Έτος"
                style={{
                  width: 86,
                  height: 40,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  padding: '10px 16px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: '0.25px',
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
              {constructionYear_n >= 1800 && constructionYear_n <= 2030 && (
                <div style={{
                  height: 40,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderLeft: `3px solid ${yearToBadge(constructionYear_n).color}`,
                  borderRadius: 4,
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 14,
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: '0.25px',
                  color: yearToBadge(constructionYear_n).color,
                  whiteSpace: 'nowrap' as const,
                  boxSizing: 'border-box' as const,
                }}>
                  {yearToBadge(constructionYear_n).label}
                </div>
              )}
            </div>
          )}
          <div style={{ flex: '1 1 120px', maxWidth: 160, minWidth: 0 }}>
            <CustomSelect label="" value={floor} onChange={setFloor} options={FLOORS} />
          </div>
        </div>
      </div>

      {/* ── Lease Banner ── */}
      {cfg.lease_end && (
        <div style={{ background: 'var(--bg-surface)', border: `1px solid var(--border-subtle)`, borderLeft: `3px solid ${leaseColor}`, borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: leaseColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>
            {calc.leaseStatus === 'ok' && `Μισθωτήριο ενεργό, λήγει σε ${calc.days} ημέρες`}
            {calc.leaseStatus === 'warning' && `Λήγει σε ${calc.days} ημέρες, ανανέωση σύντομα`}
            {calc.leaseStatus === 'critical' && `Λήγει σε ${calc.days} ημέρες, άμεση ενέργεια`}
            {calc.leaseStatus === 'expired' && `Το μισθωτήριο έχει λήξει πριν ${Math.abs(calc.days!)} ημέρες`}
            {cfg.tenant_name && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>— {cfg.tenant_name}</span>}
          </span>
        </div>
      )}

      {/* ── KPI Strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10, marginBottom: 16, width: '100%' }}>
        <KPICard
          label="Μεικτή Απόδοση" value={fp(calc.grossYield)}
          color={calc.grossYield >= 5 ? 'var(--positive)' : calc.grossYield >= 3 ? 'var(--warning)' : 'var(--negative)'}
          badge={calc.grossYield >= 5 ? { text: 'Καλό', color: 'var(--positive)' } : undefined}
        />
        <KPICard label="Καθαρή Απόδοση" value={fp(calc.netYield)} color={calc.netYield >= 3 ? 'var(--positive)' : calc.netYield >= 1.5 ? 'var(--warning)' : 'var(--negative)'} />
        <KPICard label="Κεφαλαιακή Απόδοση" value={fp(calc.capRate)} color="var(--text-primary)" />
        <KPICard label="Περίοδος Απόσβεσης" value={calc.payback > 0 ? `${calc.payback.toFixed(1)} χρ` : '—'} color="var(--text-primary)" />
        <KPICard label="Καθαρό / Μήνα" value={fe(calc.afterTax / 12)} color={calc.afterTax > 0 ? 'var(--positive)' : 'var(--negative)'} />
      </div>

      {/* ── Gauges + Score ── */}
      <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-around', padding: 16, flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Gauge value={calc.grossYield} max={12} label="Μεικτή Απόδοση" color="var(--accent)" />
        <Gauge value={calc.netYield} max={8} label="Καθαρή Απόδοση" color="var(--positive)" />
        <Gauge value={calc.capRate} max={10} label="Κεφαλαιακή Απόδοση" color="var(--info)" />
        <Gauge value={Math.min(calc.occRate, 100)} max={100} label="Επίτευξη Ενοικίου" color="var(--warning)" />
        {calc.DSCR > 0 && <Gauge value={Math.min(calc.DSCR * 50, 100)} max={100} label={`Κάλυψη Δανείου ${calc.DSCR.toFixed(2)}x`} color={calc.DSCR >= 1.25 ? 'var(--positive)' : calc.DSCR >= 1 ? 'var(--warning)' : 'var(--negative)'} />}
        {/* Score */}
        <div style={{ textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: calc.scoreColor, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{calc.totalScore}</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: calc.scoreColor, marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>{calc.scoreLabel}</div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif" }}>Βαθμολογία /100</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 10, padding: 4, marginBottom: 16 }}>
        {TAB_DEFS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap',
              background: activeTab === t.id ? 'var(--accent)' : 'transparent',
              color: activeTab === t.id ? 'var(--accent-text)' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          OVERVIEW TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (<>

        {/* Στοιχεία Μίσθωσης */}
        <div style={cardStyle}>
          <SectionLabel label="Στοιχεία Μίσθωσης" />
          <div style={g2}>
            <NumberInput label="Στόχος Ενοικίου €/μήνα" value={cfg.target_rent} onChange={v => sc('target_rent', v)} suffix="€" step={10} />
            <NumberInput label="Πραγματικό Ενοίκιο €/μήνα" value={cfg.actual_rent} onChange={v => sc('actual_rent', v)} suffix="€" step={10} />
            <NumberInput label="Εγγύηση" value={cfg.deposit} onChange={v => sc('deposit', v)} suffix="€" step={50} />
            <NumberInput label="Προμήθεια Διαχείρισης %" value={cfg.management_fee_pct} onChange={v => sc('management_fee_pct', v)} suffix="%" step={0.5} />
          </div>
          <div style={g2}>
            <TextInput label="Ενοικιαστής" value={cfg.tenant_name} onChange={v => sc('tenant_name', v)} placeholder="Ονοματεπώνυμο" />
            <NumberInput label="Ποινή Πρόωρης Αποχώρησης (μήνες)" value={sc2.penalty_months} onChange={v => ss('penalty_months', v)} suffix="μήν" />
            <DatePicker label="Έναρξη Μίσθωσης" value={cfg.lease_start} onChange={v => sc('lease_start', v)} />
            <DatePicker label="Λήξη Μίσθωσης" value={cfg.lease_end} onChange={v => sc('lease_end', v)} />
          </div>
          <div style={g2}>
            <NumberInput label="Ετήσια Ασφάλεια Κατοικίας" value={cfg.insurance_annual} onChange={v => sc('insurance_annual', v)} suffix="€" step={50} />
            <NumberInput label="Αποθεματικό Συντήρησης / έτος" value={cfg.maintenance_reserve} onChange={v => sc('maintenance_reserve', v)} suffix="€" step={100} />
            <NumberInput label="ΕΝΦΙΑ / έτος" value={cfg.enfia_annual} onChange={v => sc('enfia_annual', v)} suffix="€" step={10} />
            <NumberInput label="Εμπορική Αξία" value={cfg.commercial_value} onChange={v => sc('commercial_value', v)} suffix="€" step={1000} />
          </div>
          <div style={g2}>
            <NumberInput label="Αντικειμενική Αξία" value={cfg.objective_value} onChange={v => sc('objective_value', v)} suffix="€" step={1000} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <Toggle on={electronic} onChange={setElectronic} label="Ηλεκτρονική Πληρωμή" labelOff="Μετρητά" />
                {electronic && calc.electronicSaving > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--positive)', fontWeight: 500, fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>εξοικονόμηση {fe(calc.electronicSaving)}/έτος</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <Toggle on={cfg.is_insured} onChange={v => sc('is_insured', v)} label="Ασφαλισμένο" labelOff="Ανασφάλιστο" />
                {cfg.is_insured && <Toggle on={cfg.insurance_covers_disasters} onChange={v => sc('insurance_covers_disasters', v)} label="Καλύπτει Φυσικές Καταστροφές" labelOff="Χωρίς κάλυψη" />}
              </div>
            </div>
          </div>

          {cfg.is_insured && cfg.insurance_covers_disasters && (
            <InfoBanner type="success">
              <strong>Μείωση ΕΝΦΙΑ {(parseFloat(cfg.objective_value) || 0) <= 500000 ? '20%' : '10%'}:</strong>{' '}
              Εξοικονομείς {fe(calc.enfiaRed)}/έτος, Α.1005/2026. Αίτηση: myAADE.gov.gr → myPROPERTY.
            </InfoBanner>
          )}
          {calc.gap > 0 && (
            <InfoBanner type="warning">
              Το ενοίκιο είναι <strong>{fe(calc.gap)}/μήνα</strong> κάτω από τον στόχο ({fp(calc.occRate, 0)} του στόχου).
            </InfoBanner>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={saveConfig} disabled={saving}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 20, padding: '9px 24px', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.7 : 1, fontFamily: "'Inter', sans-serif" }}
            >
              {savedOk === 'config' ? 'Αποθηκεύτηκε' : saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </div>

        {/* P&L */}
        <div style={cardStyle}>
          <SectionLabel label="Κατάσταση Αποτελεσμάτων Χρήσης (P&L)" />
          <StatRow label="Ακαθάριστο Ενοίκιο / έτος" value={fe(calc.annual)} color="var(--positive)" />
          {calc.reduction > 0 && <StatRow label="Έκπτωση Ηλεκτρονικής Πληρωμής (-5%)" value={`-${fe(calc.reduction)}`} color="var(--info)" />}
          <StatRow label="Δαπάνες Ακινήτου συνολικά" value={`-${fe(calc.totalExp)}`} color="var(--warning)" />
          {calc.mgmt > 0 && <StatRow label="   Προμήθεια Διαχείρισης" value={`-${fe(calc.mgmt)}`} color="var(--text-tertiary)" />}
          {calc.ins > 0 && <StatRow label="   Ασφάλεια" value={`-${fe(calc.ins)}`} color="var(--text-tertiary)" />}
          {calc.maint > 0 && <StatRow label="   Αποθεματικό Συντήρησης" value={`-${fe(calc.maint)}`} color="var(--text-tertiary)" />}
          {calc.enfiaFinal > 0 && <StatRow label="   ΕΝΦΙΑ (μετά έκπτωση)" value={`-${fe(calc.enfiaFinal)}`} color="var(--text-tertiary)" />}
          {expenses > 0 && <StatRow label="   Λοιπές Δαπάνες" value={`-${fe(expenses)}`} color="var(--text-tertiary)" />}
          <StatRow label="Καθαρό Εισόδημα (προ φόρου)" value={fe(calc.netIncome)} color="var(--accent)" bold />
          <StatRow label="Φόρος Εισοδήματος" value={`-${fe(calc.tax)}`} color="var(--negative)" />
          <StatRow label="Αποσβέσεις Κτηρίου / έτος" value={`-${fe(calc.depB)}`} color="var(--text-tertiary)" />
          <StatRow label="Αποσβέσεις Εξοπλισμού / έτος" value={`-${fe(calc.depE)}`} color="var(--text-tertiary)" />
          <StatRow label="Καθαρό Εισόδημα (μετά φόρου)" value={fe(calc.afterTax)} color={calc.afterTax >= 0 ? 'var(--positive)' : 'var(--negative)'} bold />
          <StatRow label="Καθαρό / Μήνα" value={fe(calc.afterTax / 12)} color={calc.afterTax >= 0 ? 'var(--positive)' : 'var(--negative)'} bold />
        </div>

        {/* Score Card */}
        <div style={cardStyle}>
          <SectionLabel label="Βαθμολογία Ακινήτου" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 20 }}>
            <div style={{ textAlign: 'center', padding: '20px 0', borderRight: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 56, fontWeight: 700, color: calc.scoreColor, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{calc.totalScore}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: calc.scoreColor, marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>{calc.scoreLabel}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif" }}>συνολική βαθμολογία / 100</div>
            </div>
            <div style={{ paddingTop: 8 }}>
              <ScoreBar label="Απόδοση (Yield)" score={calc.yieldScore} max={40} color="var(--accent)" />
              <ScoreBar label="Μίσθωση και Πληρότητα" score={calc.locationScore} max={20} color="var(--info)" />
              <ScoreBar label="Ταμειακή Ροή" score={calc.finScore} max={20} color="var(--positive)" />
              <ScoreBar label="Μόχλευση (LTV)" score={calc.ltvScore} max={20} color="var(--warning)" />
            </div>
          </div>
        </div>

        {/* Benchmarks */}
        <div style={cardStyle}>
          <SectionLabel label="Σύγκριση με Αγορά" />
          <div style={g4}>
            <CustomSelect label="Αγορά Αναφοράς" value={bench.market_label} onChange={v => sb('market_label', v)} options={GREEK_MARKETS} />
            <NumberInput label="Benchmark Gross Yield %" value={bench.market_gross} onChange={v => sb('market_gross', v)} suffix="%" step={0.5} />
            <NumberInput label="Στόχος Net Yield %" value={bench.target_net} onChange={v => sb('target_net', v)} suffix="%" step={0.5} />
            <NumberInput label="EURIBOR 3 Μηνών %" value={bench.euribor} onChange={v => { euriborTouched.current = true; sb('euribor', v); }} suffix="%" step={0.1} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <NumberInput label="Σύγκριση ETF (για παράδειγμα VUAA, απόδοση %/έτος)" value={bench.etf_return} onChange={v => sb('etf_return', v)} suffix="%" step={0.5} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
            {[
              { label: `Gross Yield (${bench.market_label.split(', ')[0]})`, value: fp(calc.grossYield), bench: `Benchmark: ${bench.market_gross}%`, good: calc.grossYield >= parseFloat(bench.market_gross) },
              { label: 'Net Yield', value: fp(calc.netYield), bench: `Στόχος: >${bench.target_net}%`, good: calc.netYield >= parseFloat(bench.target_net) },
              { label: 'Υπεραπόδοση vs EURIBOR', value: `+${fp(Math.max(calc.netYield - parseFloat(bench.euribor), 0))}`, bench: `EURIBOR ${bench.euribor}%`, good: calc.netYield > parseFloat(bench.euribor) },
              { label: `Σύγκριση vs ETF (${bench.etf_return}%/έτος)`, value: calc.netYield >= parseFloat(bench.etf_return) ? 'Νικά το ETF' : 'Κάτω από ETF', bench: `Benchmark ${bench.etf_return}%`, good: calc.netYield >= parseFloat(bench.etf_return) },
              { label: 'Breakeven Ενοίκιο', value: fe(calc.breakeven), bench: 'Ελάχιστο για κερδοφορία', good: calc.ar >= calc.breakeven },
              { label: 'Πραγματική Απόδοση (με κόστη απόκτησης)', value: fp(calc.trueYield), bench: `Αγορά: ${bench.market_gross}%`, good: calc.trueYield >= parseFloat(bench.market_gross) },
            ].map((b, i) => (
              <div key={i} style={{ ...innerStyle, borderLeft: `3px solid ${b.good ? 'var(--positive)' : 'var(--warning)'}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: b.good ? 'var(--positive)' : 'var(--warning)', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{b.value}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2, fontFamily: "'Inter', sans-serif" }}>{b.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>{b.bench}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Κόστη Απόκτησης */}
        <div style={cardStyle}>
          <SectionLabel label="Κρυφά Κόστη Απόκτησης" />
          <div style={g3}>
            <NumberInput label="Αμοιβή Μεσίτη %" value={loan.agent_fee_pct} onChange={v => sl('agent_fee_pct', v)} suffix="%" step={0.5} />
            <NumberInput label="Φόρος Μεταβίβασης %" value={loan.transfer_tax_pct} onChange={v => sl('transfer_tax_pct', v)} suffix="%" step={0.5} />
            <NumberInput label="Συμβολαιογραφικά" value={loan.notary_cost} onChange={v => sl('notary_cost', v)} suffix="€" step={100} />
          </div>
          <div style={g4}>
            <KPICard label="Αμοιβή Μεσίτη" value={fe(calc.agentFee)} color="var(--warning)" />
            <KPICard label="Φόρος Μεταβίβασης" value={fe(calc.transTax)} color="var(--negative)" />
            <KPICard label="Συμβολαιογραφικά" value={fe(calc.notary)} color="var(--warning)" />
            <KPICard label="Πραγματικό Κόστος Απόκτησης" value={fe(calc.totalAcq)} color="var(--negative)" sub={`Yield: ${fp(calc.trueYield)}`} />
          </div>
        </div>

        {/* Εταιρεία */}
        <div style={cardStyle}>
          <SectionLabel label="Ιδιοκτησία μέσω Εταιρείας" />
          <div style={g2}>
            <CustomSelect label="Έδρα / Δομή Ιδιοκτησίας" value={companyHq} onChange={setCompanyHq} options={COMPANY_HQ} />
            <KPICard label="Φορολογικός Συντελεστής" value={fp(calc.compRate, 0)} color="var(--info)" />
          </div>
          {companyHq !== 'none' && (
            <div style={g3}>
              <KPICard label="Φόρος Εταιρείας" value={fe(calc.compTax)} color="var(--negative)" />
              <KPICard label="Καθαρό μέσω Εταιρείας" value={fe(calc.afterTaxComp)} color={calc.afterTaxComp > 0 ? 'var(--positive)' : 'var(--negative)'} />
              <KPICard label="Διαφορά vs Φυσικό Πρόσωπο" value={fe(calc.afterTaxComp - calc.afterTax)} color={calc.afterTaxComp > calc.afterTax ? 'var(--positive)' : 'var(--negative)'} />
            </div>
          )}
          {companyHq === 'eu' && <InfoBanner type="info">Κύπρος/Βουλγαρία: Συντελεστής ~10%. Απαιτεί πραγματική εγκατάσταση. Συμβουλευτείτε φοροτεχνικό.</InfoBanner>}
          {companyHq === 'uae' && <InfoBanner type="info">Ηνωμένα Αραβικά Εμιράτα: Εταιρικός φόρος 9% (Free Zone 0%). Χρειάζεται φορολογική κατοικία. Δεν ισχύει αυτόματα για ακίνητα Ελλάδας.</InfoBanner>}
          {companyHq === 'greece' && <InfoBanner type="warning">Ελληνική εταιρεία: Συντελεστής 22% + μέρισμα 5% = πραγματικό φορτίο ~26-27%. Συνήθως δεν συμφέρει για 1-2 ακίνητα.</InfoBanner>}
          {companyHq === 'usa' && <InfoBanner type="info">Ηνωμένες Πολιτείες: Ομοσπονδιακός φόρος 21% + πολιτειακός. Σύνθετη δομή, απαιτείται Αμερικανός λογιστής.</InfoBanner>}
          <InfoBanner type="danger">Πέραν των 3 ακινήτων σε Airbnb/βραχυχρόνια μίσθωση: Υποχρεωτική εγγραφή επιχείρησης στην ΑΑΔΕ.</InfoBanner>
        </div>

        <RentComparables propertyId={propertyId} userId={userId} actualRent={calc.ar} />
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
          ΦΟΡΟΛΟΓΙΑ TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tax' && (<>
        <div style={cardStyle}>
          <SectionLabel label="Φορολογικό Προφίλ Ιδιοκτήτη" />
          <div style={g4}>
            <NumberInput label="Ηλικία Ιδιοκτήτη" value={ownerAge} onChange={setOwnerAge} suffix="ετών" step={1} />
            <NumberInput label="Εξαρτώμενα Τέκνα" value={children} onChange={setChildren} suffix="τέκνα" step={1} />
          </div>
          {parseInt(ownerAge) <= 25 && (
            <InfoBanner type="success">
              <strong>Ηλικία έως 25 ετών:</strong> Μηδενικός φόρος έως €20.000 εισόδημα (Φ.Ε. 2026). Εξοικονόμηση έως <strong>{fe(Math.min(calc.taxable, 20000) * 0.15)}</strong> σε σχέση με κανονική κλίμακα.
            </InfoBanner>
          )}
          {parseInt(ownerAge) >= 26 && parseInt(ownerAge) <= 30 && (
            <InfoBanner type="success">
              <strong>Ηλικία 26-30 ετών:</strong> Μειωμένος συντελεστής 9% στο bracket €10.000-€20.000 (Φ.Ε. 2026).
            </InfoBanner>
          )}
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Φορολογική Ανάλυση Ενοικίων, Νόμος 5246/2025" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 20 }}>
            <div>
              <StatRow label="Ακαθάριστο Ενοίκιο" value={fe(calc.annual)} color="var(--positive)" />
              <StatRow label="Έκπτωση Ηλεκτρονικής Πληρωμής (-5%)" value={electronic ? `-${fe(calc.reduction)}` : '—'} color="var(--info)" />
              <StatRow label="Φορολογητέο Εισόδημα" value={fe(calc.taxable)} color="var(--warning)" />
              <StatRow label="Φόρος" value={fe(calc.tax)} color="var(--negative)" />
              <StatRow label="Πραγματικός Φορολογικός Συντελεστής" value={fp(calc.effectiveRate)} color="var(--negative)" />
              <StatRow label="Καθαρό μετά φόρου" value={fe(calc.afterTax)} color={calc.afterTax > 0 ? 'var(--positive)' : 'var(--negative)'} bold />
              {electronic && calc.electronicSaving > 0 && (
                <InfoBanner type="success">
                  Ηλεκτρονική πληρωμή: Εξοικονομείς <strong>{fe(calc.electronicSaving)}</strong>/έτος, <strong>{fe(calc.electronicSaving / 12)}</strong>/μήνα.
                </InfoBanner>
              )}
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 12 }}>Κλίμακα Φορολόγησης 2026</div>
              {[
                { range: '€0 – €12.000', rate: '15%', c: calc.taxable <= 12000 },
                { range: '€12.001 – €24.000', rate: '25%', c: calc.taxable > 12000 && calc.taxable <= 24000 },
                { range: '€24.001 – €35.000', rate: '35%', c: calc.taxable > 24000 && calc.taxable <= 35000 },
                { range: 'Άνω των €35.000', rate: '45%', c: calc.taxable > 35000 },
              ].map((r, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8, marginBottom: 6,
                  background: r.c ? 'var(--accent-dim)' : 'var(--bg-surface)',
                  border: `1px solid ${r.c ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                }}>
                  <span style={{ fontSize: 11, color: r.c ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>{r.range}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.c ? 'var(--accent)' : 'var(--text-primary)', fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{r.rate}</span>
                    {r.c && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: "'Inter', sans-serif" }}>εδώ</span>}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-tertiary)', padding: 10, background: 'var(--bg-surface)', borderRadius: 8, fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
                Εκτίμηση βάσει Ν.5246/2025. Τα εισοδήματα ενοικίων προστίθενται στο συνολικό εισόδημα. Συμβουλευτείτε λογιστή.
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="ΕΝΦΙΑ 2026, Εκπτώσεις και Μειώσεις" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 20 }}>
            <div>
              {[
                'Μείωση 20%: Ασφαλισμένη κατοικία (αξία έως €500.000) για σεισμό, πυρκαγιά και πλημμύρα',
                'Μείωση 10%: Ασφαλισμένη κατοικία αξία άνω €500.000',
                'Μείωση 50%: Κύρια κατοικία σε οικισμό έως 1.500 κατοίκων (αξία έως €400.000)',
                'Απαλλαγή 2027: Οικισμοί έως 1.500 κατοίκους (περιορισμένη εφαρμογή)',
              ].map((t, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, padding: '8px 10px', background: 'var(--bg-surface)', borderRadius: 6, lineHeight: 1.5, fontFamily: "'Inter', sans-serif", borderLeft: '2px solid var(--positive)' }}>
                  {t}
                </div>
              ))}
            </div>
            <div>
              {calc.enfiaRed > 0
                ? <InfoBanner type="success">Εξοικονομείς <strong>{fe(calc.enfiaRed)}</strong>/έτος. Αίτηση: myAADE.gov.gr → myPROPERTY → "Μείωση ΕΝΦΙΑ Ασφαλισμένων Κατοικιών 2026".</InfoBanner>
                : <InfoBanner type="warning">Ενεργοποίησε "Ασφαλισμένο" και "Φυσικές Καταστροφές" στην καρτέλα Επισκόπηση για να υπολογιστεί η μείωση.</InfoBanner>
              }
              <InfoBanner type="info">Διαδικασία: myAADE → myPROPERTY → "Μείωση ΕΝΦΙΑ". Αίτηση μία φορά, αυτόματη ανάκτηση από ασφαλιστικές.</InfoBanner>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Φορολόγηση Πολλαπλών Ακινήτων" />
          <div style={g2}>
            {[
              { title: '2-3 Ακίνητα, Συμβατική Μίσθωση', color: 'var(--positive)', text: 'Φυσικό πρόσωπο, κανονική φορολογική κλίμακα. Δεν θεωρείται επιχείρηση. Κάθε ενοίκιο προστίθεται στο ατομικό εισόδημα.' },
              { title: '3+ Ακίνητα, Airbnb / Βραχυχρόνια', color: 'var(--negative)', text: 'Υποχρεωτική εγγραφή επιχείρησης στην ΑΑΔΕ. Φόρος εισοδήματος επιχείρησης 22-29%. Πιθανό ΦΠΑ. Απαιτείται λογιστής.' },
              { title: 'Ποινή Πρόωρης Αποχώρησης', color: 'var(--warning)', text: `${sc2.penalty_months} μήνες ενοίκιο = ${fe(calc.ar * parseFloat(sc2.penalty_months))}. Αν ο ενοικιαστής φύγει πρόωρα δικαιούσαι εγγύηση (${fe(parseFloat(cfg.deposit) || 0)}) και ποινή.` },
              { title: 'Βλάβη / Κλοπή / Φθορά', color: 'var(--info)', text: 'Η εγγύηση καλύπτει φθορές πέραν φυσικής χρήσης. Η ασφάλεια κατοικίας καλύπτει κλοπή και βλάβες. Τεκμηρίωσε με φωτογραφίες πριν και μετά.' },
            ].map((t, i) => (
              <div key={i} style={{ ...innerStyle, borderLeft: `3px solid ${t.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: t.color, marginBottom: 6, fontFamily: "'Inter', sans-serif" }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>{t.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* E2 Quick Reference */}
        <div style={cardStyle}>
          <SectionLabel label="Βοηθός Δήλωσης Ε2, Τι να γράψεις" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { code: 'Κωδ. 101', label: 'Ακαθάριστα Μισθώματα', value: `${fe(calc.annual)} (εκτίμηση)`, color: 'var(--positive)' },
                  { code: 'Κωδ. 102', label: 'Εκπιπτόμενες Δαπάνες', value: 'Από TabΔαπάνες', color: 'var(--info)' },
                  { code: 'Κωδ. 103', label: 'Καθαρό Φορολογητέο', value: `${fe(calc.taxable)} (εκτίμηση)`, color: 'var(--warning)' },
                  { code: 'Κωδ. 401', label: 'Φόρος Εισοδήματος', value: `${fe(calc.tax)} (εκτίμηση)`, color: 'var(--negative)' },
                  { code: 'Προκαταβολή', label: '55% φόρου επόμενου έτους', value: `${fe(calc.tax * 0.55)} (εκτίμηση)`, color: 'var(--warning)' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', fontFamily: "'Inter', sans-serif", marginRight: 8 }}>{row.code}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>{row.label}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: row.color, fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}>
                Για ακριβή συμπλήρωση χρησιμοποίησε το tab Ε2 Δήλωση στις Ρυθμίσεις.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Υποβολή Ε1/Ε2', value: '30 Ιουνίου', color: 'var(--accent)' },
                { label: 'Καταχώρηση Μισθωτηρίου AADE', value: 'εντός 30 ημερών', color: 'var(--info)' },
                { label: 'Ηλεκτρονική Πληρωμή (-5%)', value: electronic ? `Ενεργό, εξοικ. ${fe(calc.electronicSaving)}` : 'Ανενεργό', color: electronic ? 'var(--positive)' : 'var(--warning)' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${item.color}`, borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>{item.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: item.color, fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
                </div>
              ))}
              <a href="https://www.aade.gr/polites/foroi/foros-eisodematos" target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, textDecoration: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                AADE.gr, Φορολογία Ακινήτων
              </a>
            </div>
          </div>
        </div>
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
          AIRBNB TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'airbnb' && (<>
        <div style={cardStyle}>
          <SectionLabel label="Airbnb / Βραχυχρόνια Μίσθωση, Υπολογιστής" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { season: 'Χαμηλή Σεζόν', aKey: 'adr_low', oKey: 'occ_low', dKey: 'dur_low', uKey: 'unit_low', color: 'var(--info)' },
              { season: 'Μέση Σεζόν', aKey: 'adr_mid', oKey: 'occ_mid', dKey: 'dur_mid', uKey: 'unit_mid', color: 'var(--warning)' },
              { season: 'Υψηλή Σεζόν', aKey: 'adr_high', oKey: 'occ_high', dKey: 'dur_high', uKey: 'unit_high', color: 'var(--positive)' },
            ].map((s, i) => (
              <div key={i} style={{ ...innerStyle, borderLeft: `3px solid ${s.color}`, display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: s.color, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: "'Inter', sans-serif" }}>{s.season}</div>
                <NumberInput label="Μέση Τιμή ανά Νύχτα" value={(airbnb as any)[s.aKey]} onChange={(v: string) => sa(s.aKey, v)} suffix="€" step={5} />
                <NumberInput label="Πληρότητα %" value={(airbnb as any)[s.oKey]} onChange={(v: string) => sa(s.oKey, v)} suffix="%" step={5} />
                <div style={{ marginBottom: 12 }}>
                  <span style={labelStyle}>Διάρκεια Σεζόν</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 6 }}>
                    <NumberInput label="" value={(airbnb as any)[s.dKey]} onChange={(v: string) => sa(s.dKey, v)} suffix="" step={0.5} />
                    <select
                      value={(airbnb as any)[s.uKey]}
                      onChange={e => sa(s.uKey, e.target.value)}
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 8,
                        padding: '9px 12px',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 400,
                        cursor: 'pointer',
                        outline: 'none',
                        width: '100%',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 10px center',
                        paddingRight: 30,
                      }}
                    >
                      <option value="days">Μέρες</option>
                      <option value="months">Μήνες</option>
                      <option value="years">Χρόνια</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={g4}>
            <NumberInput label="Προμήθεια Πλατφόρμας %" value={airbnb.platform_fee} onChange={v => sa('platform_fee', v)} suffix="%" step={1} />
            <NumberInput label="Κόστος Καθαρισμού" value={airbnb.cleaning_cost} onChange={v => sa('cleaning_cost', v)} suffix="€" step={5} />
            <NumberInput label="Καθαρισμός ανά Χ Νύχτες" value={airbnb.cleaning_per_nights} onChange={v => sa('cleaning_per_nights', v)} suffix="νύχτ" step={1} />
            <NumberInput label="Αποθεματικό Φθορών / έτος" value={airbnb.damage_reserve} onChange={v => sa('damage_reserve', v)} suffix="€" step={50} />
          </div>
        </div>

        <div style={cardStyle}>
          <SectionLabel label="Επιπλέον Παροχές και Έξοδα" />
          <div style={g4}>
            <NumberInput label="Netflix (ετήσιο)" value={airbnb.netflix} onChange={v => sa('netflix', v)} suffix="€" step={10} />
            <NumberInput label="Spotify / Άλλες Συνδρομές" value={airbnb.spotify} onChange={v => sa('spotify', v)} suffix="€" step={5} />
            <NumberInput label="Welcome Basket (κόστος)" value={airbnb.welcome_basket} onChange={v => sa('welcome_basket', v)} suffix="€" step={5} />
            <NumberInput label="Άλλα Έξοδα Υπηρεσιών / έτος" value={airbnb.extra_services} onChange={v => sa('extra_services', v)} suffix="€" step={50} />
          </div>
          <div style={g4}>
            <NumberInput label="Ποδήλατα (αριθμός)" value={airbnb.bike_count} onChange={v => sa('bike_count', v)} suffix="τεμ" step={1} />
            <NumberInput label="Κόστος Ποδηλάτου ανά τεμάχιο" value={airbnb.bike_cost} onChange={v => sa('bike_cost', v)} suffix="€" step={10} />
            <NumberInput label="Συντήρηση Πισίνας / έτος" value={airbnb.pool_maintenance} onChange={v => sa('pool_maintenance', v)} suffix="€" step={50} />
            <NumberInput label="Κήπος / Ξεχορτάριασμα / έτος" value={airbnb.garden_maintenance} onChange={v => sa('garden_maintenance', v)} suffix="€" step={20} />
          </div>
          <div style={g2}>
            <NumberInput label="Φυτά Μπαλκονιού / έτος" value={airbnb.balcony_plants} onChange={v => sa('balcony_plants', v)} suffix="€" step={10} />
          </div>
          {parseInt(airbnb.bike_count) > 0 && (
            <InfoBanner type="info">
              {airbnb.bike_count} ποδήλατα, Ετήσια απόσβεση 3ετίας: <strong>{fe(parseInt(airbnb.bike_count) * (parseFloat(airbnb.bike_cost) || 200) / 3)}</strong>. Αύξηση τιμής/νύχτα ~5-15% σε περιοχές χωρίς εύκολη μεταφορά.
            </InfoBanner>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
          <div style={cardStyle}>
            <SectionLabel label="Αποτελέσματα Airbnb" />
            <StatRow label="Ακαθάριστα Έσοδα" value={fe(abb.rev)} color="var(--positive)" />
            <StatRow label="Μέση Τιμή ανά Νύχτα (ADR)" value={`${fe(abb.adr)}/νύχτα`} color="var(--accent)" />
            <StatRow label="Έσοδα ανά Διαθέσιμη Νύχτα (RevPAR)" value={`${fe(abb.revPAR)}/νύχτα`} color="var(--info)" />
            <StatRow label="Προμήθεια Πλατφόρμας" value={`-${fe(abb.pCost)}`} color="var(--warning)" />
            <StatRow label={`Κόστος Καθαρισμών (${abb.bookings} bookings)`} value={`-${fe(abb.cCost)}`} color="var(--warning)" />
            <StatRow label="Δαπάνες Ακινήτου" value={`-${fe(expenses)}`} color="var(--warning)" />
            <StatRow label="Επιπλέον Παροχές και Φθορές" value={`-${fe(abb.extras)}`} color="var(--warning)" />
            <StatRow label="Καθαρό Εισόδημα Airbnb" value={fe(abb.net)} color={abb.net > 0 ? 'var(--positive)' : 'var(--negative)'} bold />
            <StatRow label="Μέση Ετήσια Πληρότητα" value={fp(abb.avgOcc)} color="var(--accent)" />
          </div>
          <div style={cardStyle}>
            <SectionLabel label="Airbnb vs Μακροχρόνια Μίσθωση" />
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontFamily: "'Inter', sans-serif" }}>Διαφορά καθαρού εισοδήματος / έτος</div>
              <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', color: abb.diff > 0 ? 'var(--positive)' : 'var(--negative)', marginBottom: 8 }}>
                {abb.diff > 0 ? '+' : ''}{fe(abb.diff)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
                {abb.diff > 0 ? `Το Airbnb αποδίδει ${fe(abb.diff)}/έτος περισσότερο` : `Η μακροχρόνια αποδίδει ${fe(Math.abs(abb.diff))}/έτος περισσότερο`}
              </div>
            </div>
            <div style={g2}>
              <KPICard label="Airbnb Καθαρό / έτος" value={fe(abb.net)} color="var(--positive)" />
              <KPICard label="Μακροχρόνια Καθαρό / έτος" value={fe(calc.afterTax)} color="var(--accent)" />
            </div>
            <InfoBanner type="warning">
              Airbnb: Αυξημένος χρόνος διαχείρισης, φθορές, ασταθές εισόδημα, υποχρέωση εγγραφής άνω των 3 ακινήτων. Η μακροχρόνια μίσθωση προσφέρει σταθερότητα.
            </InfoBanner>
          </div>
        </div>

        {/* MVMA + Legal obligations */}
        <div style={cardStyle}>
          <SectionLabel label="Νομικές Υποχρεώσεις Βραχυχρόνιας Μίσθωσης" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
            {[
              { title: 'Εγγραφή ΜΒΜΑ (Μητρώο Βραχυχρόνιας Μίσθωσης)', desc: 'Υποχρεωτική πριν οποιαδήποτε ανάρτηση. Κωδικός ΜΒΜΑ εμφανίζεται υποχρεωτικά στην αγγελία.', url: 'https://www.aade.gr/polites/foroi/mitroo-vraxyhronion-misthoseon', urgent: true },
              { title: 'Δήλωση Βραχυχρόνιας Εισοδήματος', desc: 'Κάθε κράτηση δηλώνεται στην ΑΕΠΠ εντός 24 ωρών. Φορολογικός Συντελεστής 15%/35%/45%.', url: 'https://www.aade.gr', urgent: false },
              { title: 'Όριο 3 Ακινήτων', desc: 'Πάνω από 3 ακίνητα σε Airbnb: υποχρεωτική εγγραφή επιχείρησης + ΦΠΑ + λογιστής.', url: null, urgent: true },
              { title: 'Κανονισμός Πολυκατοικίας', desc: 'Απαιτείται συγκατάθεση 3/4 των ιδιοκτητών. Έλεγχε τον κανονισμό της πολυκατοικίας σου.', url: null, urgent: false },
            ].map((item, i) => (
              <div key={i} style={{ background: 'var(--bg-surface)', border: `1px solid ${item.urgent ? 'var(--negative)' : 'var(--border-subtle)'}`, borderLeft: `3px solid ${item.urgent ? 'var(--negative)' : 'var(--info)'}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: item.urgent ? 'var(--negative)' : 'var(--text-primary)', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, marginBottom: item.url ? 8 : 0 }}>{item.desc}</div>
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: 'var(--accent)', fontFamily: "'Inter', sans-serif", fontWeight: 500, textDecoration: 'none' }}>
                    Μετάβαση →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
          ΔΑΝΕΙΟ TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'loan' && (<>
        <div style={cardStyle}>
          <SectionLabel label="Στοιχεία Δανείου" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
            <TextInput label="Τράπεζα / Ίδρυμα" value={loan.bank_name} onChange={v => sl('bank_name', v)} placeholder="Παράδειγμα: Alpha Bank" />
            <CustomSelect label="Τύπος Δανείου" value={loan.loan_type} onChange={v => sl('loan_type', v)} options={LOAN_TYPES} />
            <NumberInput label="Αρχικό Κεφάλαιο" value={loan.original_amount} onChange={v => sl('original_amount', v)} suffix="€" step={1000} />
            <NumberInput label="Υπόλοιπο Κεφαλαίου" value={loan.remaining_balance} onChange={v => sl('remaining_balance', v)} suffix="€" step={1000} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
            <NumberInput label="Επιτόκιο % (ετήσιο)" value={loan.interest_rate} onChange={v => sl('interest_rate', v)} suffix="%" step={0.1} />
            <NumberInput label="Μηνιαία Δόση" value={loan.monthly_payment} onChange={v => sl('monthly_payment', v)} suffix="€" step={10} />
            <NumberInput label="Διάρκεια (μήνες)" value={loan.loan_term_months} onChange={v => sl('loan_term_months', v)} suffix="μήνες" />
            <NumberInput label="Μήνες που Πληρώθηκαν" value={loan.paid_months} onChange={v => sl('paid_months', v)} suffix="μήνες" />
          </div>
          <div style={g2}>
            <DatePicker label="Ημερομηνία Έναρξης" value={loan.start_date} onChange={v => sl('start_date', v)} />
            <DatePicker label="Ημερομηνία Λήξης" value={loan.end_date} onChange={v => sl('end_date', v)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <Toggle on={loan.is_fixed_rate} onChange={v => sl('is_fixed_rate', v)} label="Σταθερό Επιτόκιο" labelOff="Κυμαινόμενο (EURIBOR + spread)" />
          </div>
          <Textarea label="Σημειώσεις" value={loan.notes} onChange={v => sl('notes', v)} placeholder="Παράδειγμα: EURIBOR 3M + 1.5%, ανατιμολόγηση κάθε 3 μήνες" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={saveLoan}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 20, padding: '9px 24px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
            >
              {savedOk === 'loan' ? 'Αποθηκεύτηκε' : 'Αποθήκευση Δανείου'}
            </button>
          </div>
        </div>

        {/* Πρόωρη Αποπληρωμή */}
        <div style={cardStyle}>
          <SectionLabel label="Πρόωρη Αποπληρωμή" />
          <div style={g2}>
            <NumberInput label="Ποσό Πρόωρης Αποπληρωμής" value={loan.early_repayment} onChange={v => sl('early_repayment', v)} suffix="€" step={1000} />
            <KPICard label="Εκτιμώμενη Εξοικονόμηση Τόκων" value={calc.interestSaved > 0 ? fe(calc.interestSaved) : '—'} color="var(--positive)" sub="Εκτίμηση βάσει υπολοίπου δανείου" />
          </div>
          <InfoBanner type="info">
            Η πρόωρη αποπληρωμή συμφέρει αν το επιτόκιο δανείου υπερβαίνει την απόδοση εναλλακτικής επένδυσης (ETF, καταθέσεις). Ελέγξτε για πρόωρη εξόφληση στο συμβόλαιο.
          </InfoBanner>
        </div>

        {/* Σπίτι Μου ΙΙ */}
        <div style={cardStyle}>
          <SectionLabel label="Σπίτι Μου ΙΙ, Κρατικό Πρόγραμμα 2026" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
            <div>
              {[
                { label: 'Ηλικία Δικαιούχων', value: '25 έως 50 ετών' },
                { label: 'Μέγιστο Δάνειο', value: '€190.000 (90% της αξίας)' },
                { label: 'Μέγιστη Αξία Ακινήτου', value: '€250.000' },
                { label: 'Άτοκο Ποσοστό', value: '50% (75% για τριτεκνούχους)' },
                { label: 'Καταληκτική Ημερομηνία Αίτησης', value: '31 Μαΐου 2026' },
                { label: 'Καταληκτική Ημερομηνία Σύμβασης', value: '31 Αυγούστου 2026' },
                { label: 'Συνεργαζόμενες Τράπεζες', value: 'Alpha, Εθνική, Πειραιώς, Eurobank και άλλες' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, fontFamily: "'Inter', sans-serif" }}>{r.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'right', fontFamily: "'Inter', sans-serif" }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div>
              <InfoBanner type="success">
                <strong>Παράδειγμα:</strong> Δάνειο €162.000, €81.000 άτοκο. Κανονική δόση ~€750/μήνα. Με Σπίτι Μου ΙΙ: ~€420/μήνα.
              </InfoBanner>
              <InfoBanner type="info">
                <strong>Διαδικασία:</strong> 1) Βεβαίωση Επιλεξιμότητας στο stegasi.gov.gr, 2) Αίτηση σε τράπεζα, 3) Σύμβαση έως 31 Αυγούστου 2026.
              </InfoBanner>
              <InfoBanner type="warning">
                Απαραίτητο: Να μην κατέχεις άλλο ακίνητο κατοικίας. Εισοδηματικά κριτήρια ισχύουν.
              </InfoBanner>
            </div>
          </div>
        </div>

        {/* Πράσινα Δάνεια */}
        <div style={cardStyle}>
          <SectionLabel label="Πράσινα Δάνεια και Ενεργειακή Αναβάθμιση" />
          <div style={g3}>
            <NumberInput label="Δάνειο Ανακαίνισης / Ενεργειακό" value={loan.renovation_loan} onChange={v => sl('renovation_loan', v)} suffix="€" step={1000} />
            <NumberInput label="Επιτόκιο %" value={loan.renovation_loan_rate} onChange={v => sl('renovation_loan_rate', v)} suffix="%" step={0.1} />
            <NumberInput label="Διάρκεια (μήνες)" value={loan.renovation_loan_months} onChange={v => sl('renovation_loan_months', v)} suffix="μήν" step={12} />
          </div>
          <div style={g2}>
            <NumberInput label="Δάνειο Φωτοβολταϊκών / Αντλίας Θερμότητας" value={loan.green_loan} onChange={v => sl('green_loan', v)} suffix="€" step={500} />
            <TextInput label="Περιγραφή" value={loan.green_loan_desc} onChange={v => sl('green_loan_desc', v)} placeholder="Παράδειγμα: Φωτοβολταϊκά 5kWp + αντλία θερμότητας" />
          </div>
          <div style={g3}>
            {[
              { title: 'Εξοικονομώ 2.0', text: 'Επιδότηση 30-70% για ενεργειακή αναβάθμιση. Αλλαγή λέβητα, μόνωση, κουφώματα. Αξιολόγηση ΠΕΑ πριν και μετά.' },
              { title: 'Φωτοβολταϊκά Στέγης', text: 'Επιδότηση έως 50%. Αντλία θερμότητας: εξοικονόμηση ~60% στη θέρμανση. Απόσβεση 5-8 χρόνια.' },
              { title: 'Ηλιακός Θερμοσίφωνας', text: 'Κόστος €800-1.500. Εξοικονόμηση €150-300/έτος. Απόσβεση 4-6 χρόνια. Επιδότηση διαθέσιμη.' },
            ].map((t, i) => (
              <div key={i} style={{ ...innerStyle, borderLeft: '3px solid var(--positive)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--positive)', marginBottom: 6, fontFamily: "'Inter', sans-serif" }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>{t.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ανάλυση Δανείου */}
        {calc.loanBal > 0 && (
          <div style={cardStyle}>
            <SectionLabel label="Ανάλυση Δανείου" />
            <div style={g4}>
              <KPICard label="Κάλυψη Δανείου (DSCR)" value={`${calc.DSCR.toFixed(2)}x`} color={calc.DSCR >= 1.25 ? 'var(--positive)' : calc.DSCR >= 1 ? 'var(--warning)' : 'var(--negative)'} sub={calc.DSCR >= 1.25 ? 'Υγιές' : calc.DSCR >= 1 ? 'Οριακό' : 'Κίνδυνος'} />
              <KPICard label="Δάνειο / Αξία (LTV)" value={fp(calc.LTV)} color={calc.LTV <= 60 ? 'var(--positive)' : calc.LTV <= 80 ? 'var(--warning)' : 'var(--negative)'} sub={`Equity: ${fe(calc.equity)}`} />
              <KPICard label="Ταμειακή Ροή μετά Δάνειο" value={`${fe(calc.cfDebt / 12)}/μήνα`} color={calc.cfDebt > 0 ? 'var(--positive)' : 'var(--negative)'} />
              <KPICard label="Κάλυψη Τόκων" value={`${calc.ic.toFixed(2)}x`} color={calc.ic >= 2 ? 'var(--positive)' : calc.ic >= 1 ? 'var(--warning)' : 'var(--negative)'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
              <div>
                <StatRow label="Αξία Ακινήτου" value={fe(calc.myVal)} />
                <StatRow label="Υπόλοιπο Δανείου" value={fe(calc.loanBal)} color="var(--negative)" />
                <StatRow label="Ίδια Κεφάλαια (Equity)" value={fe(calc.equity)} color="var(--positive)" bold />
                <StatRow label="Ετήσια Εξυπηρέτηση Δανείου" value={fe(calc.annualDebt)} color="var(--warning)" />
                <StatRow label="Ταμειακή Ροή μετά Δάνειο / έτος" value={fe(calc.cfDebt)} color={calc.cfDebt > 0 ? 'var(--positive)' : 'var(--negative)'} bold />
              </div>
              <div>
                <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${Math.min(calc.LTV, 100)}%`, background: calc.LTV <= 60 ? 'var(--positive)' : calc.LTV <= 80 ? 'var(--warning)' : 'var(--negative)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 12, fontFamily: "'Inter', sans-serif" }}>
                  <span>0%</span><span>60%</span><span>80%</span><span>100%</span>
                </div>
                {calc.DSCR < 1.25 && (
                  <InfoBanner type={calc.DSCR < 1 ? 'danger' : 'warning'}>
                    {calc.DSCR < 1 ? 'DSCR κάτω από 1: Το δάνειο δεν καλύπτεται από το ενοίκιο. Άμεση αξιολόγηση.' : 'DSCR 1-1.25: Οριακή κάλυψη. Κενή περίοδος δημιουργεί πρόβλημα.'}
                  </InfoBanner>
                )}
                <InfoBanner type="info">
                  Τραπεζικά Έξοδα: Εξέταση αιτήματος €0-300, αποτίμηση ακινήτου €200-400, έξοδα σύναψης 0.5-1%. Στο Σπίτι Μου ΙΙ: χωρίς έξοδο εξέτασης.
                </InfoBanner>
              </div>
            </div>
          </div>
        )}

        {/* Πλειστηριασμός */}
        <div style={cardStyle}>
          <SectionLabel label="Απόκτηση μέσω Πλειστηριασμού" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 12 }}>
            <div>
              <StatRow label="Εκτιμώμενη Έκπτωση" value={`-${sc2.auction_discount}%`} color="var(--accent)" />
              <StatRow label="Εκτιμώμενη Αξία Πλειστηριασμού" value={fe(calc.myVal * (1 - (parseFloat(sc2.auction_discount) || 25) / 100))} color="var(--accent)" />
              <StatRow label="Εξοικονόμηση έναντι Αγοράς" value={fe(calc.myVal * (parseFloat(sc2.auction_discount) || 25) / 100)} color="var(--positive)" />
            </div>
            <div>
              <InfoBanner type="warning">
                Αγορά χωρίς πλήρη έλεγχο, πιθανά βάρη, υποθήκες, ενοικιαστές, κατάσταση ακινήτου. Απαιτείται δικηγόρος και συμβολαιογράφος.
              </InfoBanner>
              <InfoBanner type="info">
                Πλατφόρμα: eauction.gr. Κατάθεση εγγύησης 30% πριν τη δημοπρασία. Εξόφληση υπολοίπου εντός 1 μήνα.
              </InfoBanner>
            </div>
          </div>
          <NumberInput label="Εκτιμώμενη Έκπτωση Πλειστηριασμού %" value={sc2.auction_discount} onChange={v => ss('auction_discount', v)} suffix="%" step={5} />
        </div>
      </>)}

      {/* ══════════════════════════════════════════════════════════════════════
          ΣΕΝΑΡΙΑ TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scenario' && (<>
        <div style={cardStyle}>
          <SectionLabel label="Παράμετροι Σεναρίου" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
            <NumberInput label="Αύξηση Ενοικίου %" value={sc2.rent_change} onChange={v => ss('rent_change', v)} suffix="%" step={1} />
            <NumberInput label="Κενή Περίοδος (μήνες / έτος)" value={sc2.vacancy_months} onChange={v => ss('vacancy_months', v)} suffix="μήν" step={0.5} />
            <NumberInput label="Αύξηση Αξίας % / έτος" value={sc2.value_growth} onChange={v => ss('value_growth', v)} suffix="%" step={0.5} />
            <NumberInput label="Χρονικός Ορίζοντας (χρόνια)" value={sc2.years} onChange={v => ss('years', v)} suffix="χρ" step={1} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
            <NumberInput label="Πληθωρισμός % / έτος" value={sc2.inflation} onChange={v => ss('inflation', v)} suffix="%" step={0.5} />
            <NumberInput label="Αύξηση Δαπανών % / έτος" value={sc2.expense_growth} onChange={v => ss('expense_growth', v)} suffix="%" step={0.5} />
            <NumberInput label="Αμοιβή Μεσίτη Πώλησης %" value={sc2.sell_agent_pct} onChange={v => ss('sell_agent_pct', v)} suffix="%" step={0.5} />
            <NumberInput label="Φόρος Μεταβίβασης Πώλησης %" value={sc2.sell_tax_pct} onChange={v => ss('sell_tax_pct', v)} suffix="%" step={0.5} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 0 }}>
            <NumberInput label="Αποθεματικό Ασφαλείας % / έτος" value={sc2.reserve_pct} onChange={v => ss('reserve_pct', v)} suffix="%" step={1} />
            <NumberInput label="Έκπτωση Πλειστηριασμού %" value={sc2.auction_discount} onChange={v => ss('auction_discount', v)} suffix="%" step={5} />
            <NumberInput label="Απόσβεση Κτηρίου (χρόνια)" value={sc2.building_depreciation_yrs} onChange={v => ss('building_depreciation_yrs', v)} suffix="χρ" step={1} />
            <NumberInput label="Απόσβεση Εξοπλισμού (χρόνια)" value={sc2.equipment_depreciation_yrs} onChange={v => ss('equipment_depreciation_yrs', v)} suffix="χρ" step={1} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
          <div style={cardStyle}>
            <SectionLabel label="Νέα Εκτίμηση" />
            <StatRow label="Νέο Ενοίκιο / Μήνα" value={fe(scen.newRent)} color="var(--positive)" />
            <StatRow label="Ετήσιο Εισόδημα (με κενή περίοδο)" value={fe(scen.newAnnual)} color="var(--positive)" />
            <StatRow label="Καθαρό μετά φόρου" value={fe(scen.newNet)} color={scen.newNet > 0 ? 'var(--positive)' : 'var(--negative)'} />
            <StatRow label={`Αξία ακινήτου σε ${sc2.years} χρόνια`} value={fe(scen.futVal)} color="var(--accent)" />
            <StatRow label="Υπεραξία" value={fe(scen.capGain)} color="var(--positive)" />
            <StatRow label="Σύνολο Ενοικίων (μετά φόρου)" value={fe(scen.rentTotal)} color="var(--positive)" />
            <StatRow label="Συνολική Απόδοση" value={fe(scen.total)} color="var(--positive)" bold />
            <StatRow label="CAGR Αξίας Ακινήτου" value={fp(scen.cagr)} color="var(--info)" />
            <StatRow label="Μέση Ετήσια Απόδοση" value={fp(scen.irr)} color="var(--accent)" />
          </div>
          <div style={cardStyle}>
            <SectionLabel label="Τώρα vs Σενάριο" />
            {[
              { label: 'Ενοίκιο / μήνα', now: fe(calc.ar), fut: fe(scen.newRent), up: scen.newRent > calc.ar },
              { label: 'Καθαρό / έτος', now: fe(calc.afterTax), fut: fe(scen.newNet), up: scen.newNet > calc.afterTax },
              { label: 'Αξία', now: fe(calc.myVal), fut: fe(scen.futVal), up: true },
              { label: 'Μεικτή Απόδοση', now: fp(calc.grossYield), fut: fp(calc.myVal > 0 ? (scen.newRent * 12 / calc.myVal) * 100 : 0), up: calc.myVal > 0 && (scen.newRent * 12 / calc.myVal * 100) > calc.grossYield },
            ].map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif" }}>{r.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{r.now}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.up ? 'var(--positive)' : 'var(--negative)', fontFamily: "'Roboto Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>→ {r.fut}</span>
              </div>
            ))}
            <div style={{ marginTop: 16, ...innerStyle }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>Συνολική Απόδοση σε {sc2.years} χρόνια</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--positive)', fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{fe(scen.total)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>Ενοίκια + Υπεραξία</div>
            </div>
          </div>
        </div>

        {/* Monte Carlo */}
        <div style={cardStyle}>
          <SectionLabel label="Ανάλυση Πιθανοτήτων (Monte Carlo)" />
          <div style={g3}>
            <NumberInput label="Αριθμός Προσομοιώσεων" value={sc2.mc_runs} onChange={v => ss('mc_runs', v)} suffix="runs" step={100} />
            <NumberInput label="Μεταβλητότητα Ενοικίου %" value={sc2.mc_rent_std} onChange={v => ss('mc_rent_std', v)} suffix="%" step={5} />
            <NumberInput label="Μεταβλητότητα Αξίας %" value={sc2.mc_value_std} onChange={v => ss('mc_value_std', v)} suffix="%" step={5} />
          </div>
          <div style={g4}>
            <KPICard label="Απαισιόδοξο (10ο εκατοστ.)" value={fe(scen.mcP10)} color="var(--negative)" sub="Κακό σενάριο" />
            <KPICard label="Βασικό (50ο εκατοστ.)" value={fe(scen.mcP50)} color="var(--accent)" sub="Πιθανότερο σενάριο" />
            <KPICard label="Αισιόδοξο (90ο εκατοστ.)" value={fe(scen.mcP90)} color="var(--positive)" sub="Καλό σενάριο" />
            <KPICard label="Πιθανότητα Κέρδους" value={fp(scen.mcPositive, 0)} color={scen.mcPositive >= 70 ? 'var(--positive)' : scen.mcPositive >= 50 ? 'var(--warning)' : 'var(--negative)'} sub={`σε ${sc2.mc_runs} προσομοιώσεις`} />
          </div>
          <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
            <div style={{ height: '100%', width: `${scen.mcPositive}%`, background: scen.mcPositive >= 70 ? 'var(--positive)' : scen.mcPositive >= 50 ? 'var(--warning)' : 'var(--negative)', borderRadius: 3, transition: 'width 0.8s ease' }} />
          </div>
          <InfoBanner type="info">
            Το Monte Carlo τρέχει {sc2.mc_runs} τυχαίες προσομοιώσεις αλλάζοντας ενοίκιο και αξία ακινήτου εντός της μεταβλητότητας που ορίζεις. Δίνει εικόνα του εύρους πιθανών αποτελεσμάτων.
          </InfoBanner>
        </div>

        {/* Sell vs Hold */}
        <div style={cardStyle}>
          <SectionLabel label="Ανάλυση Ακινήτου και Βέλτιστος Χρόνος Πώλησης" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', marginBottom: 10, fontFamily: "'Inter', sans-serif" }}>
                {yearToLabel(constructionYear_n)}, {FLOORS.find(f => f.value === floor)?.label}
              </div>
              <InfoBanner type="info">{scen.peakAdvice}</InfoBanner>
              <div style={{ marginTop: 12 }}>
                {[
                  { label: 'Εκτιμώμενος Ορίζοντας Κορύφωσης', value: `${calc.peakY} χρόνια από κατασκευή` },
                  { label: 'Premium Ορόφου (εκτίμηση)', value: `+${calc.floorBonus.toFixed(1)}%` },
                  { label: 'Εμπορική Αξία', value: fe(calc.commVal) },
                  { label: 'Αντικειμενική Αξία', value: fe(calc.objVal) },
                  { label: 'Διαφορά Εμπορική / Αντικειμενική', value: calc.objVal > 0 ? fp((calc.commVal / calc.objVal - 1) * 100) : '—' },
                ].map((r, i) => <StatRow key={i} label={r.label} value={r.value} color="var(--accent)" />)}
              </div>
            </div>
            <div>
              <div style={{ ...innerStyle, borderLeft: '3px solid var(--negative)', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--negative)', marginBottom: 10, fontFamily: "'Inter', sans-serif" }}>Πώληση Τώρα</div>
                <StatRow label="Αξία Πώλησης" value={fe(calc.myVal)} />
                <StatRow label={`Αμοιβή Μεσίτη (${sc2.sell_agent_pct}%)`} value={`-${fe(calc.myVal * (parseFloat(sc2.sell_agent_pct) / 100))}`} color="var(--negative)" />
                <StatRow label={`Φόρος Μεταβίβασης (${sc2.sell_tax_pct}%)`} value={`-${fe(calc.myVal * (parseFloat(sc2.sell_tax_pct) / 100))}`} color="var(--negative)" />
                <StatRow label="Καθαρά Χρήματα" value={fe(scen.sellNow)} color="var(--warning)" bold />
              </div>
              <div style={{ ...innerStyle, borderLeft: '3px solid var(--positive)' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--positive)', marginBottom: 10, fontFamily: "'Inter', sans-serif" }}>Κράτα {sc2.years} Χρόνια</div>
                <StatRow label="Ενοίκια (καθαρά)" value={fe(scen.rentTotal)} color="var(--positive)" />
                <StatRow label={`Αξία σε ${sc2.years} χρόνια`} value={fe(scen.futVal)} color="var(--positive)" />
                <StatRow label="Καθαρά από Πώληση" value={fe(scen.sellFuture)} color="var(--positive)" />
                <StatRow label="Συνολική Απόδοση" value={fe(scen.total)} color="var(--positive)" bold />
              </div>
            </div>
          </div>
        </div>
      </>)}

    </div>
  );
}